import { getApiKey, setApiKey, testApiKey } from "../lib/llm.js";

const $ = (id) => document.getElementById(id);

function maskKey(key) {
  if (!key) return "";
  if (key.length <= 12) return "•".repeat(key.length);
  return key.slice(0, 10) + "…" + key.slice(-4);
}

function setStatus(msg, kind = "") {
  const el = $("status");
  el.textContent = msg;
  el.className = "status " + kind;
}

async function refresh() {
  const k = await getApiKey();
  if (k) {
    $("api-key").value = "";
    $("api-key").placeholder = "Currently saved: " + maskKey(k);
  } else {
    $("api-key").placeholder = "sk-ant-…";
  }
}

$("save-btn").addEventListener("click", async () => {
  const v = $("api-key").value.trim();
  if (!v) {
    setStatus("Empty key — nothing saved.", "err");
    return;
  }
  if (!v.startsWith("sk-ant-")) {
    setStatus("Doesn't look like an Anthropic API key (should start with sk-ant-).", "err");
    return;
  }
  await setApiKey(v);
  setStatus("Saved.", "ok");
  refresh();
});

$("test-btn").addEventListener("click", async () => {
  setStatus("Testing…");
  try {
    const reply = await testApiKey();
    setStatus("API key works. Model replied: " + reply.trim(), "ok");
  } catch (e) {
    setStatus("Test failed: " + (e?.message || e), "err");
  }
});

$("clear-btn").addEventListener("click", async () => {
  await setApiKey("");
  setStatus("Cleared.", "ok");
  refresh();
});

refresh();
