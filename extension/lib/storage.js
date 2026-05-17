// Thin wrapper around chrome.storage.local. Keys:
//   studies:<sourceId>   -> { [externalId]: StudyRow }
//   submissions          -> { [studyKey]: SubmissionRow }   (studyKey = "<sourceId>::<externalId>")
//   scanLog              -> [{ startedAt, finishedAt, sources: [{id, status, count}] }]
//   lastScanAt           -> number (ms since epoch)
//
// StudyRow = {
//   sourceId, externalId, title, pay, duration, location, studyDate, url,
//   firstSeenAt, lastSeenAt, isActive
// }
// SubmissionRow = {
//   studyKey, status, appliedAt?, qualifiedAt?, doneAt?, paidAt?, notes?
// }

const STUDY_PREFIX = "studies:";

export async function getStudies(sourceId) {
  const key = STUDY_PREFIX + sourceId;
  const obj = await chrome.storage.local.get(key);
  return obj[key] || {};
}

export async function setStudies(sourceId, studies) {
  await chrome.storage.local.set({ [STUDY_PREFIX + sourceId]: studies });
}

export async function getAllStudies() {
  const all = await chrome.storage.local.get(null);
  const out = [];
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith(STUDY_PREFIX)) continue;
    for (const row of Object.values(value)) out.push(row);
  }
  return out;
}

export async function getSubmissions() {
  const obj = await chrome.storage.local.get("submissions");
  return obj.submissions || {};
}

export async function setSubmission(studyKey, submission) {
  const all = await getSubmissions();
  all[studyKey] = { ...all[studyKey], ...submission, studyKey };
  await chrome.storage.local.set({ submissions: all });
}

export async function getScanLog() {
  const obj = await chrome.storage.local.get("scanLog");
  return obj.scanLog || [];
}

export async function appendScanLog(entry) {
  const log = await getScanLog();
  log.unshift(entry);
  await chrome.storage.local.set({ scanLog: log.slice(0, 50) });
}

export async function getLastScanAt() {
  const obj = await chrome.storage.local.get("lastScanAt");
  return obj.lastScanAt || 0;
}

export async function setLastScanAt(ts) {
  await chrome.storage.local.set({ lastScanAt: ts });
}

export function studyKey(sourceId, externalId) {
  return `${sourceId}::${externalId}`;
}

// Rolling retention: drop studies that haven't been seen for N days unless
// they have a *valuable* submission status (applied / qualified / done /
// paid). Dismissed submissions are NOT preserved — dismissing means "I
// rejected this," not "remember it forever." When we prune a study, we
// also drop any orphaned submission row so storage doesn't bloat.
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const KEEP_STATUSES = new Set(["applied", "qualified", "done", "paid"]);

export async function pruneOldData(now = Date.now()) {
  const cutoff = now - RETENTION_MS;
  const submissions = await getSubmissions();
  const all = await chrome.storage.local.get(null);
  let prunedStudies = 0;
  const toSet = {};
  const liveKeys = new Set();
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith(STUDY_PREFIX)) continue;
    const kept = {};
    for (const [extId, row] of Object.entries(value)) {
      const sk = studyKey(row.sourceId, row.externalId);
      const sub = submissions[sk];
      const valuable = sub && KEEP_STATUSES.has(sub.status);
      if (row.lastSeenAt < cutoff && !valuable) {
        prunedStudies++;
        continue;
      }
      kept[extId] = row;
      liveKeys.add(sk);
    }
    toSet[key] = kept;
  }
  // Drop submissions whose study is gone (including dismissed-only entries).
  let prunedSubmissions = 0;
  const keptSubs = {};
  for (const [sk, sub] of Object.entries(submissions)) {
    if (liveKeys.has(sk) || KEEP_STATUSES.has(sub.status)) {
      keptSubs[sk] = sub;
    } else {
      prunedSubmissions++;
    }
  }
  toSet.submissions = keptSubs;
  if (Object.keys(toSet).length) await chrome.storage.local.set(toSet);
  return { prunedStudies, prunedSubmissions };
}
