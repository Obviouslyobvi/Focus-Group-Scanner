import { getLastScanAt } from "../lib/storage.js";

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
  const res = await fetch(chrome.runtime.getURL("sources.json"));
  const sources = await res.json();
  $("source-count").textContent = sources.length;
  $("scraper-count").textContent = sources.filter((s) => s.scraper).length;
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

$("dash-btn").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/dashboard.html") });
});

refresh();
