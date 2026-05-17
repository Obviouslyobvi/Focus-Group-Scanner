// Anthropic Claude API client + API-key storage + per-source disable flags.
//
// API key is stored in chrome.storage.local (per-device, never synced). It's
// only sent to api.anthropic.com when extracting studies — nowhere else.

const KEY_STORAGE = "anthropic_api_key";
const DISABLED_STORAGE = "llm_disabled_sources";
const MODEL = "claude-haiku-4-5-20251001";
const MAX_INPUT_CHARS = 30_000;
const MAX_OUTPUT_TOKENS = 2048;
const API_URL = "https://api.anthropic.com/v1/messages";

export async function getApiKey() {
  const obj = await chrome.storage.local.get(KEY_STORAGE);
  return obj[KEY_STORAGE] || "";
}

export async function setApiKey(key) {
  await chrome.storage.local.set({ [KEY_STORAGE]: (key || "").trim() });
}

export async function isDisabled(sourceId) {
  const obj = await chrome.storage.local.get(DISABLED_STORAGE);
  const set = obj[DISABLED_STORAGE] || {};
  return !!set[sourceId];
}

export async function setDisabled(sourceId, disabled) {
  const obj = await chrome.storage.local.get(DISABLED_STORAGE);
  const set = obj[DISABLED_STORAGE] || {};
  if (disabled) set[sourceId] = true;
  else delete set[sourceId];
  await chrome.storage.local.set({ [DISABLED_STORAGE]: set });
}

function buildPrompt(pageText, source) {
  return (
    `You are extracting paid research study listings from a recruiter website.\n\n` +
    `Recruiter: ${source.name}\nURL: ${source.url}\n\n` +
    `Read the page text below and return a JSON array of available studies. Each ` +
    `study object must have these keys (use empty string "" if a field isn't given):\n` +
    `- "title": short topic or name (e.g. "Pharmacist interview", "Snacking habits")\n` +
    `- "pay": compensation as shown ("$150", "£40")\n` +
    `- "duration": length ("60 min", "1 hour", "2 days")\n` +
    `- "studyDate": when it runs, if mentioned ("June 4-9, 2026")\n` +
    `- "location": city/state, "Remote", "Nationwide", etc.\n` +
    `- "externalId": stable identifier — project code if shown (e.g. "P266009I-K"), ` +
    `URL slug, or short kebab-case of title\n\n` +
    `Return ONLY a valid JSON array. No prose, no markdown fences. If no studies ` +
    `are listed, return [].\n\n` +
    `PAGE TEXT:\n${pageText}`
  );
}

function parseLLMResponse(text) {
  // Strip markdown fences if the model added them despite instructions.
  let s = text.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  }
  // Find the first '[' and last ']' as a safety net for stray prose.
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  const arr = JSON.parse(s);
  if (!Array.isArray(arr)) throw new Error("LLM response was not a JSON array");
  return arr;
}

export async function extractStudiesViaClaude(pageText, source) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    const err = new Error("No Anthropic API key set");
    err.code = "no-api-key";
    throw err;
  }
  const text =
    pageText.length > MAX_INPUT_CHARS
      ? pageText.slice(0, MAX_INPUT_CHARS) + "\n[TRUNCATED]"
      : pageText;

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [{ role: "user", content: buildPrompt(text, source) }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const responseText = data?.content?.[0]?.text || "";
  const studies = parseLLMResponse(responseText);

  // Normalise to the extractor return shape and drop entries missing a title.
  return studies
    .filter((s) => s && (s.title || s.externalId))
    .map((s) => ({
      externalId: String(s.externalId || s.title || "").toLowerCase().replace(/\s+/g, "-").slice(0, 100),
      title: String(s.title || ""),
      pay: String(s.pay || ""),
      duration: String(s.duration || ""),
      studyDate: String(s.studyDate || ""),
      location: String(s.location || ""),
      url: source.url,
    }))
    .filter((s) => s.externalId && s.title);
}

export async function testApiKey() {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error("No API key set");
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16,
      messages: [{ role: "user", content: 'Reply with the single word "ok".' }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return data?.content?.[0]?.text || "(no content)";
}
