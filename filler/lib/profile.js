// Demographic autofill profile: stored question->answer entries with fuzzy
// matching metadata, plus the logic to merge newly-learned answers in.
//
// Entry shape:
//   {
//     id: string,
//     label: string,        // human-readable question label
//     keywords: string[],   // significant words to match a question by
//     answer: string,       // canonical answer
//     aliases: string[]     // option-text variants that count as the answer
//   }

const STORAGE_KEY = "demographics_profile";

// The profile lives in chrome.storage.sync so it's backed up to the user's
// Google account and survives reinstalls / new machines. sync has a ~100KB
// total / 8KB-per-item budget, which is plenty for a demographic profile.
// On first read we migrate any legacy data from chrome.storage.local.

const STOPWORDS = new Set([
  "the", "is", "are", "was", "were", "a", "an", "of", "to", "in", "on", "for",
  "your", "you", "my", "i", "do", "does", "did", "what", "which", "how", "please",
  "select", "choose", "that", "this", "with", "and", "or", "be", "been", "at",
  "as", "it", "if", "all", "any", "would", "will", "have", "has", "we", "us",
  "our", "their", "them", "they", "best", "describe", "describes", "following",
  "below", "above", "currently", "most", "apply", "check", "mark", "answer",
  "question", "questions", "option", "options",
]);

export function extractKeywords(question) {
  return [
    ...new Set(
      (question || "")
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
    ),
  ];
}

export async function getProfile() {
  const synced = await chrome.storage.sync.get(STORAGE_KEY);
  if (synced[STORAGE_KEY]) return synced[STORAGE_KEY];
  // One-time migration from the old local-storage location.
  const local = await chrome.storage.local.get(STORAGE_KEY);
  if (local[STORAGE_KEY]) {
    await chrome.storage.sync.set({ [STORAGE_KEY]: local[STORAGE_KEY] });
    await chrome.storage.local.remove(STORAGE_KEY);
    return local[STORAGE_KEY];
  }
  return [];
}

export async function saveProfile(entries) {
  await chrome.storage.sync.set({ [STORAGE_KEY]: entries });
}

function uid() {
  return "e" + Math.random().toString(36).slice(2, 10);
}

function norm(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

// Find the existing entry that best matches a question, by keyword overlap.
function findMatch(entries, question) {
  const q = norm(question);
  let best = null;
  let bestScore = 0;
  for (const e of entries) {
    let score = 0;
    for (const kw of e.keywords) {
      const k = norm(kw);
      if (k && q.includes(k)) score += k.split(" ").length;
    }
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return bestScore > 0 ? best : null;
}

// Merge a batch of learned {question, answer} pairs into the profile.
// Returns { added, updated }.
export async function learnEntries(pairs) {
  const entries = await getProfile();
  let added = 0;
  let updated = 0;
  for (const { question, answer } of pairs) {
    if (!question || !answer) continue;
    const existing = findMatch(entries, question);
    if (existing) {
      const a = norm(answer);
      const known = [existing.answer, ...(existing.aliases || [])].map(norm);
      if (!known.includes(a)) {
        existing.aliases = [...(existing.aliases || []), answer];
        updated++;
      }
      // enrich keywords with any new significant words from this phrasing
      const newKw = extractKeywords(question).filter((k) => !existing.keywords.includes(k));
      if (newKw.length) existing.keywords = [...existing.keywords, ...newKw];
    } else {
      entries.push({
        id: uid(),
        label: question.slice(0, 120),
        keywords: extractKeywords(question),
        answer,
        aliases: [answer],
      });
      added++;
    }
  }
  await saveProfile(entries);
  return { added, updated };
}

export async function upsertEntry(entry) {
  const entries = await getProfile();
  if (entry.id) {
    const i = entries.findIndex((e) => e.id === entry.id);
    if (i >= 0) {
      entries[i] = { ...entries[i], ...entry };
      await saveProfile(entries);
      return entries[i];
    }
  }
  const created = { id: uid(), keywords: [], aliases: [], ...entry };
  if (!created.keywords.length) created.keywords = extractKeywords(created.label || "");
  if (!created.aliases.length && created.answer) created.aliases = [created.answer];
  entries.push(created);
  await saveProfile(entries);
  return created;
}

export async function deleteEntry(id) {
  const entries = await getProfile();
  await saveProfile(entries.filter((e) => e.id !== id));
}
