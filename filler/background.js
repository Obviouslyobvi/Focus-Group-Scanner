// Background service worker for Focus Group Filler. Handles "learn from this
// page" and "autofill this page" requests against the active tab.

import { getProfile, learnEntries } from "./lib/profile.js";
import { autofillTool } from "./scrapers/autofill-tool.js";

async function activeTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function learnFromActiveTab() {
  const tabId = await activeTabId();
  if (!tabId) return { ok: false, error: "no active tab" };
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId },
    func: autofillTool,
    args: [{ mode: "learn" }],
  });
  const pairs = result?.pairs || [];
  if (!pairs.length) return { ok: true, learned: { added: 0, updated: 0 }, found: 0 };
  const learned = await learnEntries(pairs);
  return { ok: true, learned, found: pairs.length };
}

async function autofillActiveTab() {
  const tabId = await activeTabId();
  if (!tabId) return { ok: false, error: "no active tab" };
  const profile = await getProfile();
  if (!profile.length) return { ok: true, filled: 0, highlightedUnmatched: 0, empty: true };
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId },
    func: autofillTool,
    args: [{ mode: "fill", profile }],
  });
  return { ok: true, ...(result || { filled: 0, highlightedUnmatched: 0 }) };
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
