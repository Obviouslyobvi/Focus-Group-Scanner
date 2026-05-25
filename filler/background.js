// Background service worker for Focus Group Filler. Handles "learn from this
// page" and "autofill this page" requests against the active tab.

import { getProfile, learnEntries } from "./lib/profile.js";
import { autofillTool } from "./scrapers/autofill-tool.js";

async function activeTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

// Survey engines frequently render the question form inside an iframe, so we
// inject into every frame and merge what each one returns.
async function runInAllFrames(tabId, args) {
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: autofillTool,
    args: [args],
  });
  return results.map((r) => r?.result).filter(Boolean);
}

async function learnFromActiveTab() {
  const tabId = await activeTabId();
  if (!tabId) return { ok: false, error: "no active tab" };
  const frames = await runInAllFrames(tabId, { mode: "learn" });
  const pairs = frames.flatMap((f) => f.pairs || []);
  const diag = { radios: 0, radiosChecked: 0, checkboxes: 0, checkboxesChecked: 0, selects: 0, ariaCheckables: 0 };
  frames.forEach((f) => {
    if (f.diag) for (const k in diag) diag[k] += f.diag[k] || 0;
  });
  if (!pairs.length) return { ok: true, learned: { added: 0, updated: 0 }, found: 0, diag };
  const learned = await learnEntries(pairs);
  return { ok: true, learned, found: pairs.length, diag };
}

async function autofillActiveTab() {
  const tabId = await activeTabId();
  if (!tabId) return { ok: false, error: "no active tab" };
  const profile = await getProfile();
  if (!profile.length) return { ok: true, filled: 0, highlightedUnmatched: 0, empty: true };
  const frames = await runInAllFrames(tabId, { mode: "fill", profile });
  let filled = 0;
  let highlightedUnmatched = 0;
  const details = [];
  frames.forEach((f) => {
    filled += f.filled || 0;
    highlightedUnmatched += f.highlightedUnmatched || 0;
    if (f.details) details.push(...f.details);
  });
  return { ok: true, filled, highlightedUnmatched, details };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "learn-page") {
        sendResponse(await learnFromActiveTab());
      } else if (msg.type === "autofill-page") {
        sendResponse(await autofillActiveTab());
      } else {
        sendResponse({ ok: false, error: "unknown message" });
      }
    } catch (err) {
      sendResponse({ ok: false, error: String(err?.message || err) });
    }
  })();
  return true; // keep channel open for async sendResponse
});
