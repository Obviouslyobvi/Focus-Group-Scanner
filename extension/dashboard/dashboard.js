import {
  getAllStudies,
  getSubmissions,
  getLastScanAt,
  getScanLog,
  studyKey,
} from "../lib/storage.js";
import { SOURCES } from "../sources.js";

const $ = (id) => document.getElementById(id);

let state = {
  studies: [],
  submissions: {},
  sources: [],
  scanLog: [],
  search: "",
  status: "all",
  source: "all",
  lastScanAt: 0,
  hasApiKey: false,
  disabledLLM: {},
};

const STATUSES = ["applied", "qualified", "done", "dismissed"];

function fmtTime(ms) {
  if (!ms) return "never";
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return new Date(ms).toLocaleString();
}

async function load() {
  const [studies, submissions, lastScanAt, scanLog] = await Promise.all([
    getAllStudies(),
    getSubmissions(),
    getLastScanAt(),
    getScanLog(),
  ]);
  state.studies = studies;
  state.submissions = submissions;
  state.lastScanAt = lastScanAt;
  state.scanLog = scanLog;
  state.sources = SOURCES;
  render();
}

function submissionFor(s) {
  return state.submissions[studyKey(s.sourceId, s.externalId)];
}

function matchesFilters(s) {
  const sub = submissionFor(s);
  if (state.source !== "all" && s.sourceId !== state.source) return false;
  if (state.search) {
    const q = state.search.toLowerCase();
    if (
      !(s.title || "").toLowerCase().includes(q) &&
      !(s.sourceName || "").toLowerCase().includes(q)
    )
      return false;
  }
  // Dismissed items only show when the user explicitly filters for them.
  // Every other view hides dismissed.
  if (state.status !== "dismissed" && sub?.status === "dismissed") return false;
  switch (state.status) {
    case "new":
      return s.firstSeenAt >= state.lastScanAt && state.lastScanAt > 0;
    case "active":
      return s.isActive;
    case "applied":
    case "qualified":
    case "done":
    case "dismissed":
      return sub?.status === state.status;
    default:
      return true;
  }
}

function renderSummary() {
  const buckets = { new: 0, applied: 0, qualified: 0, done: 0, dismissed: 0 };
  const lastScanAt = state.lastScanAt;
  for (const s of state.studies) {
    if (lastScanAt > 0 && s.firstSeenAt >= lastScanAt) buckets.new++;
    const sub = submissionFor(s);
    if (sub?.status && buckets[sub.status] !== undefined) buckets[sub.status]++;
  }
  $("summary").innerHTML = ["new", "applied", "qualified", "done", "dismissed"]
    .map(
      (k) =>
        `<div class="card"><div class="n">${buckets[k]}</div><div class="l">${k}</div></div>`
    )
    .join("");
}

function renderStudies() {
  const filtered = state.studies
    .filter(matchesFilters)
    .sort((a, b) => (b.firstSeenAt || 0) - (a.firstSeenAt || 0));

  $("empty").style.display = filtered.length ? "none" : "block";

  $("study-list").innerHTML = filtered
    .map((s) => {
      const sub = submissionFor(s);
      const isNew = state.lastScanAt > 0 && s.firstSeenAt >= state.lastScanAt;
      const classes = ["study"];
      if (isNew) classes.push("is-new");
      if (!s.isActive) classes.push("is-inactive");
      const statusPill = sub?.status
        ? `<span class="pill pill-${sub.status}">${sub.status}</span>`
        : isNew
        ? `<span class="pill pill-new">new</span>`
        : "";
      const meta = [
        s.pay,
        s.duration,
        s.studyDate,
        s.location,
        s.sourceName,
        !s.isActive ? "no longer listed" : "",
      ]
        .filter(Boolean)
        .map((m) => `<span>${m}</span>`)
        .join("");
      const nextStatus = sub?.status
        ? STATUSES[STATUSES.indexOf(sub.status) + 1] || null
        : "applied";
      const actionButton = nextStatus
        ? `<button class="small" data-action="${nextStatus}" data-key="${studyKey(
            s.sourceId,
            s.externalId
          )}">Mark ${nextStatus}</button>`
        : "";
      return `
        <div class="${classes.join(" ")}">
          <div class="info">
            <div class="title">${statusPill} <a href="${s.url}" target="_blank" rel="noopener">${escapeHtml(s.title)}</a></div>
            <div class="meta">${meta}</div>
          </div>
          <div class="actions">
            ${actionButton}
            ${
              sub?.status !== "dismissed"
                ? `<button class="small secondary" data-action="dismissed" data-key="${studyKey(
                    s.sourceId,
                    s.externalId
                  )}">Dismiss</button>`
                : ""
            }
          </div>
        </div>`;
    })
    .join("");

  $("study-list")
    .querySelectorAll("button[data-action]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.action;
        const key = btn.dataset.key;
        chrome.runtime.sendMessage(
          {
            type: "mark-submission",
            studyKey: key,
            submission: { status: action, [`${action}At`]: Date.now() },
          },
          () => load()
        );
      });
    });
}

function renderSourcePanel() {
  const lastEntry = state.scanLog[0];
  const lastBySource = {};
  if (lastEntry) {
    for (const r of lastEntry.sources) lastBySource[r.id] = r;
  }
  $("source-list").innerHTML = state.sources
    .map((src) => {
      const last = lastBySource[src.id];
      const isApp = src.type === "App";
      const dotClass = isApp
        ? "dot-pending"
        : last?.status === "ok" && last.count > 0
        ? "dot-ok"
        : last?.status === "error"
        ? "dot-error"
        : last?.status === "ok"
        ? "dot-warn" // ran clean but 0 — needs selector tuning
        : "dot-pending";
      let note;
      if (isApp) note = "app only";
      else if (last)
        note = `${last.count} listed${last.added ? `, +${last.added} new` : ""}${
          last.method ? ` (${last.method})` : ""
        }`;
      else note = "not scanned";
      return `<div class="source"><div><span class="dot ${dotClass}"></span><a class="name" href="${escapeHtml(
        src.url
      )}" target="_blank" rel="noopener">${escapeHtml(src.name)}</a></div><div class="muted">${escapeHtml(
        note
      )}</div></div>`;
    })
    .join("");

  // Populate the source filter dropdown.
  const sel = $("filter-source");
  const current = sel.value;
  sel.innerHTML =
    `<option value="all">All sources</option>` +
    state.sources
      .map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`)
      .join("");
  sel.value = current || "all";
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function render() {
  $("last-scan").textContent = "Last scan: " + fmtTime(state.lastScanAt);
  renderSummary();
  renderStudies();
  renderSourcePanel();
}

// --- Event wiring ---

$("search").addEventListener("input", (e) => {
  state.search = e.target.value;
  renderStudies();
});
$("filter-status").addEventListener("change", (e) => {
  state.status = e.target.value;
  renderStudies();
});
$("filter-source").addEventListener("change", (e) => {
  state.source = e.target.value;
  renderStudies();
});

$("scan-btn").addEventListener("click", () => {
  const btn = $("scan-btn");
  btn.disabled = true;
  btn.textContent = "Scanning…";
  chrome.runtime.sendMessage({ type: "scan" }, () => {
    btn.disabled = false;
    btn.textContent = "Scan now";
    load();
  });
});

$("options-btn").addEventListener("click", () => chrome.runtime.openOptionsPage());

load();
