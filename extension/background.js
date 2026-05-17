// Background service worker. Schedules scans via chrome.alarms (every 12h)
// and handles messages from the popup and dashboard.

import { runScan, testExtractorOnTab } from "./lib/scan.js";
import { setSubmission, getSubmissions } from "./lib/storage.js";

const ALARM_NAME = "fgs-periodic-scan";
const SCAN_INTERVAL_MIN = 12 * 60; // 12 hours

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: 1,
    periodInMinutes: SCAN_INTERVAL_MIN,
  });
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
      } else {
        sendResponse({ ok: false, error: "unknown message" });
      }
    } catch (err) {
      sendResponse({ ok: false, error: String(err?.message || err) });
    }
  })();
  return true; // keep channel open for async sendResponse
});
