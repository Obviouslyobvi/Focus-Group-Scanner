// Background service worker. Schedules scans via chrome.alarms (every 12h)
// and handles messages from the popup and dashboard.

import { runScan, testExtractorOnTab } from "./lib/scan.js";
import { setSubmission, getSubmissions } from "./lib/storage.js";
import { SOURCES } from "./sources.js";

async function openAllBrowsable() {
  const targets = SOURCES.filter((s) => s.type === "Browsable");
  if (!targets.length) return { ok: true, count: 0 };
  // Open all in parallel; tabs load in the background of the current window.
  const window_ = await chrome.windows.getCurrent();
  const tabs = await Promise.all(
    targets.map((s) =>
      chrome.tabs.create({ url: s.url, active: false, windowId: window_.id })
    )
  );
  const tabIds = tabs.map((t) => t.id).filter(Boolean);
  if (!tabIds.length) return { ok: true, count: 0 };
  try {
    const groupId = await chrome.tabs.group({ tabIds });
    const now = new Date();
    const label = `Focus Group Sweep — ${now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
    await chrome.tabGroups.update(groupId, { title: label, color: "blue", collapsed: false });
  } catch (e) {
    // Grouping is best-effort; tabs are still open even if grouping fails.
    console.warn("tab grouping failed", e);
  }
  return { ok: true, count: tabIds.length };
}

const ALARM_NAME = "fgs-periodic-scan";
const SCAN_INTERVAL_MIN = 12 * 60; // 12 hours
const VISIBILITY_FIX_ID = "visibility-fix";

async function registerVisibilityFix() {
  // Build a unique URL-pattern match list from the SOURCES we track.
  const patterns = new Set();
  for (const s of SOURCES) {
    if (s.type !== "Browsable" && s.type !== "Unclear") continue;
    try {
      const u = new URL(s.url);
      patterns.add(`${u.protocol}//${u.hostname}/*`);
    } catch {}
  }
  if (patterns.size === 0) return;

  try {
    await chrome.scripting.unregisterContentScripts({ ids: [VISIBILITY_FIX_ID] });
  } catch {
    // wasn't registered yet — fine
  }
  await chrome.scripting.registerContentScripts([
    {
      id: VISIBILITY_FIX_ID,
      matches: [...patterns],
      js: ["content-scripts/visibility-fix.js"],
      runAt: "document_start",
      world: "MAIN",
      persistAcrossSessions: true,
    },
  ]);
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: 1,
    periodInMinutes: SCAN_INTERVAL_MIN,
  });
  await registerVisibilityFix();
});

chrome.runtime.onStartup.addListener(async () => {
  await registerVisibilityFix();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    await runScan().catch((e) => console.error("scan failed", e));
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "scan") {
        const entry = await runScan({ onlyId: msg.sourceId });
        sendResponse({ ok: true, entry });
      } else if (msg.type === "mark-submission") {
        await setSubmission(msg.studyKey, msg.submission);
        sendResponse({ ok: true });
      } else if (msg.type === "get-submissions") {
        sendResponse({ ok: true, submissions: await getSubmissions() });
      } else if (msg.type === "test-current-tab") {
        const result = await testExtractorOnTab(msg.tabId, msg.url);
        sendResponse({ ok: true, result });
      } else if (msg.type === "open-all-browsable") {
        const result = await openAllBrowsable();
        sendResponse(result);
      } else {
        sendResponse({ ok: false, error: "unknown message" });
      }
    } catch (err) {
      sendResponse({ ok: false, error: String(err?.message || err) });
    }
  })();
  return true; // keep channel open for async sendResponse
});
