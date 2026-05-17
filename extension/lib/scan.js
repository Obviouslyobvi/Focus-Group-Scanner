// Scan orchestrator. For each source with a registered extractor:
//   1. open the studies URL in a background tab
//   2. wait for load complete
//   3. inject the extractor; receive an array of studies
//   4. close the tab
//   5. diff against last snapshot; update storage
//
// Sources without a scraper are skipped (status: "pending-extractor").

import {
  getStudies,
  setStudies,
  appendScanLog,
  setLastScanAt,
  studyKey,
} from "./storage.js";
import { EXTRACTORS } from "../scrapers/extractors.js";

const TAB_LOAD_TIMEOUT_MS = 25_000;
const POST_LOAD_DELAY_MS = 2_500;

async function loadSources() {
  const url = chrome.runtime.getURL("sources.json");
  const res = await fetch(url);
  return res.json();
}

function waitForTabComplete(tabId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("tab load timeout"));
    }, TAB_LOAD_TIMEOUT_MS);
    function listener(updatedTabId, info) {
      if (updatedTabId === tabId && info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, POST_LOAD_DELAY_MS);
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function scrapeSource(source) {
  const extractor = EXTRACTORS[source.scraper];
  if (!extractor) return { status: "pending-extractor", count: 0 };

  let tab;
  try {
    tab = await chrome.tabs.create({ url: source.url, active: false });
    await waitForTabComplete(tab.id);
    // Best-effort: dismiss common cookie / consent / newsletter popups so
    // the extractor sees the actual content. Failures here are non-fatal.
    await chrome.scripting
      .executeScript({ target: { tabId: tab.id }, func: dismissCommonPopups })
      .catch(() => {});
    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractor,
    });
    const extracted = Array.isArray(result) ? result : [];
    await mergeStudies(source, extracted);
    return { status: "ok", count: extracted.length };
  } catch (err) {
    return { status: "error", count: 0, error: String(err?.message || err) };
  } finally {
    if (tab?.id) {
      chrome.tabs.remove(tab.id).catch(() => {});
    }
  }
}

async function mergeStudies(source, extracted) {
  const now = Date.now();
  const existing = await getStudies(source.id);
  const seenIds = new Set();
  for (const s of extracted) {
    if (!s.externalId) continue;
    seenIds.add(s.externalId);
    const prev = existing[s.externalId];
    existing[s.externalId] = {
      sourceId: source.id,
      sourceName: source.name,
      externalId: s.externalId,
      title: s.title || "",
      pay: s.pay || "",
      duration: s.duration || "",
      location: s.location || "",
      studyDate: s.studyDate || "",
      url: s.url || source.url,
      firstSeenAt: prev?.firstSeenAt || now,
      lastSeenAt: now,
      isActive: true,
    };
  }
  // Mark studies that vanished as inactive (don't delete — preserves history).
  for (const [id, row] of Object.entries(existing)) {
    if (!seenIds.has(id)) row.isActive = false;
  }
  await setStudies(source.id, existing);
}

export async function runScan({ onlyId } = {}) {
  const sources = await loadSources();
  const targets = onlyId ? sources.filter((s) => s.id === onlyId) : sources;
  const startedAt = Date.now();
  const results = [];
  let newSinceLast = 0;
  for (const source of targets) {
    if (!source.scraper) {
      results.push({ id: source.id, name: source.name, status: "pending-extractor", count: 0 });
      continue;
    }
    const beforeIds = Object.keys(await getStudies(source.id));
    const r = await scrapeSource(source);
    const afterIds = Object.keys(await getStudies(source.id));
    const added = afterIds.filter((id) => !beforeIds.includes(id)).length;
    newSinceLast += added;
    results.push({ id: source.id, name: source.name, added, ...r });
  }
  const finishedAt = Date.now();
  const entry = { startedAt, finishedAt, sources: results, newSinceLast };
  await appendScanLog(entry);
  await setLastScanAt(finishedAt);
  await updateBadge(newSinceLast);
  if (newSinceLast > 0) {
    chrome.notifications?.create({
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title: "New studies",
      message: `${newSinceLast} new study/studies since last scan`,
    });
  }
  return entry;
}

async function updateBadge(count) {
  await chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#16a34a" });
}

// Runs in page context. Best-effort dismissal of common cookie / consent /
// newsletter popups. Tries text-match on buttons first, then class/aria.
function dismissCommonPopups() {
  const TEXT_PATTERNS = [
    /^accept( all)?( cookies)?$/i,
    /^agree( and continue)?$/i,
    /^i (accept|agree|understand)$/i,
    /^got it$/i,
    /^ok(ay)?$/i,
    /^continue$/i,
    /^close$/i,
    /^dismiss$/i,
    /^no thanks$/i,
    /^maybe later$/i,
  ];
  const SELECTOR_HINTS = [
    "[aria-label='Close']",
    "[aria-label='close']",
    "[aria-label='Dismiss']",
    ".cookie-accept",
    ".accept-cookies",
    ".cc-allow",
    ".cc-dismiss",
    "#onetrust-accept-btn-handler",
    "button.close",
    ".close-modal",
    ".modal-close",
  ];
  let clicked = 0;
  const click = (el) => {
    try {
      el.click();
      clicked++;
    } catch {}
  };
  document.querySelectorAll("button, a, [role='button']").forEach((el) => {
    const txt = (el.innerText || el.textContent || "").trim();
    if (!txt || txt.length > 40) return;
    if (TEXT_PATTERNS.some((re) => re.test(txt))) click(el);
  });
  SELECTOR_HINTS.forEach((sel) => document.querySelectorAll(sel).forEach(click));
  return clicked;
}

function hostnameOf(url) {
  try {
    let h = new URL(url).hostname.toLowerCase();
    if (h.startsWith("www.")) h = h.slice(4);
    return h;
  } catch {
    return "";
  }
}

function parentDomain(host) {
  if (!host) return "";
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  return parts.slice(-2).join(".");
}

export async function findSourceForUrl(url) {
  const sources = await loadSources();
  const host = hostnameOf(url);
  const parent = parentDomain(host);
  // prefer exact match, then parent-domain match
  return (
    sources.find((s) => hostnameOf(s.url) === host) ||
    sources.find((s) => parentDomain(hostnameOf(s.url)) === parent) ||
    null
  );
}

export async function testExtractorOnTab(tabId, url) {
  const source = await findSourceForUrl(url);
  if (!source) {
    return { sourceName: "", scraper: "", count: 0, samples: [] };
  }
  const extractor = EXTRACTORS[source.scraper];
  if (!extractor) {
    return { sourceName: source.name, scraper: "", count: 0, samples: [] };
  }
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId },
    func: extractor,
  });
  const items = Array.isArray(result) ? result : [];
  return {
    sourceName: source.name,
    scraper: source.scraper,
    count: items.length,
    samples: items.slice(0, 8),
  };
}

export { loadSources };
