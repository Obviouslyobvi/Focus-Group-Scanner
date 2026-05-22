import { getLastScanAt } from "../lib/storage.js";
import { SOURCES } from "../sources.js";

const $ = (id) => document.getElementById(id);

function fmtTime(ms) {
  if (!ms) return "never";
  const d = new Date(ms);
  const now = Date.now();
  const mins = Math.round((now - ms) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return d.toLocaleDateString();
}

async function refresh() {
  const lastScanAt = await getLastScanAt();
  $("last-scan").textContent = fmtTime(lastScanAt);
  $("source-count").textContent = SOURCES.length;
  $("scraper-count").textContent = SOURCES.filter((s) => s.scraper).length;
}

$("scan-btn").addEventListener("click", async () => {
  const btn = $("scan-btn");
  btn.disabled = true;
  $("status").textContent = "Scanning… this can take several minutes.";
  chrome.runtime.sendMessage({ type: "scan" }, (resp) => {
    btn.disabled = false;
    if (resp?.ok) {
      const e = resp.entry;
      const ok = e.sources.filter((s) => s.status === "ok").length;
      $("status").textContent = `Done: ${ok} sources scraped, ${e.newSinceLast} new.`;
      refresh();
    } else {
      $("status").textContent = `Error: ${resp?.error || "unknown"}`;
    }
  });
});

function openTabsRequest(onlyChanged) {
  const changedBtn = $("open-changed-btn");
  const allBtn = $("open-all-btn");
  changedBtn.disabled = true;
  allBtn.disabled = true;
  $("status").textContent = "Opening tabs…";
  chrome.runtime.sendMessage(
    { type: "open-all-browsable", onlyChanged },
    (resp) => {
      changedBtn.disabled = false;
      allBtn.disabled = false;
      if (!resp?.ok) {
        $("status").textContent = "Error: " + (resp?.error || "unknown");
        return;
      }
      if (resp.count === 0) {
        if (resp.reason === "no-scan")
          $("status").textContent = "No scans yet. Run 'Scan now' first.";
        else if (resp.reason === "no-changes")
          $("status").textContent =
            "No changes since last scan. Use 'Open all (force)' to open everything.";
        else $("status").textContent = "Nothing to open.";
      } else {
        $("status").textContent = `Opened ${resp.count} tabs in a group.`;
      }
    }
  );
}

$("open-changed-btn").addEventListener("click", () => openTabsRequest(true));
$("open-all-btn").addEventListener("click", () => openTabsRequest(false));

$("autofill-btn").addEventListener("click", () => {
  const btn = $("autofill-btn");
  btn.disabled = true;
  $("status").textContent = "Filling…";
  chrome.runtime.sendMessage({ type: "autofill-page" }, (resp) => {
    btn.disabled = false;
    if (!resp?.ok) {
      $("status").textContent = "Error: " + (resp?.error || "unknown");
    } else if (resp.empty) {
      $("status").textContent = "No saved answers yet. Use 'Learn from this page' first.";
    } else {
      $("status").textContent = `Filled ${resp.filled}; ${resp.highlightedUnmatched} matched but no option found (highlighted yellow). Review before submitting.`;
    }
  });
});

$("learn-btn").addEventListener("click", () => {
  const btn = $("learn-btn");
  btn.disabled = true;
  $("status").textContent = "Learning…";
  chrome.runtime.sendMessage({ type: "learn-page" }, (resp) => {
    btn.disabled = false;
    if (!resp?.ok) {
      $("status").textContent = "Error: " + (resp?.error || "unknown");
    } else if (!resp.found) {
      $("status").textContent = "No answered questions found on this page.";
    } else {
      $("status").textContent = `Learned ${resp.found} answers (${resp.learned.added} new, ${resp.learned.updated} updated). Manage them in Options.`;
    }
  });
});

$("options-btn").addEventListener("click", () => chrome.runtime.openOptionsPage());

$("dash-btn").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/dashboard.html") });
});

$("test-btn").addEventListener("click", async () => {
  const out = $("test-output");
  out.style.display = "block";
  out.textContent = "Testing on current tab…";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.runtime.sendMessage({ type: "test-current-tab", tabId: tab.id, url: tab.url }, (resp) => {
    if (!resp?.ok) {
      out.textContent = "Error: " + (resp?.error || "unknown");
      return;
    }
    const r = resp.result;
    const lines = [
      `Matched source: ${r.sourceName || "(no match — open a recruiter URL first)"}`,
      `Extractor: ${r.scraper || "(none registered for this domain)"}`,
      `Extracted: ${r.count} item(s)`,
      "",
      ...r.samples.map((s, i) => `${i + 1}. ${s.title || "(no title)"}  [${s.pay || "?"}]`),
    ];
    out.textContent = lines.join("\n");
  });
});

refresh();
