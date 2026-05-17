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
