import { getApiKey, setApiKey, testApiKey } from "../lib/llm.js";
import { getProfile, saveProfile } from "../lib/profile.js";

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

// ---- Screener autofill profile editor ----

function esc(s) {
  return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function rowHtml(e = {}) {
  return `<tr>
    <td style="padding:3px;"><input class="cell" data-f="label" value="${esc(e.label)}" style="width:100%;padding:4px;border:1px solid #cbd5e1;border-radius:4px;font-size:12px;" /></td>
    <td style="padding:3px;"><input class="cell" data-f="keywords" value="${esc((e.keywords || []).join(", "))}" style="width:100%;padding:4px;border:1px solid #cbd5e1;border-radius:4px;font-size:12px;" /></td>
    <td style="padding:3px;"><input class="cell" data-f="answer" value="${esc(e.answer)}" style="width:100%;padding:4px;border:1px solid #cbd5e1;border-radius:4px;font-size:12px;" /></td>
    <td style="padding:3px;"><input class="cell" data-f="aliases" value="${esc((e.aliases || []).join(", "))}" style="width:100%;padding:4px;border:1px solid #cbd5e1;border-radius:4px;font-size:12px;" /></td>
    <td style="padding:3px;"><button class="secondary del-row" style="padding:2px 8px;">×</button></td>
  </tr>`;
}

function wireDelete(tr) {
  tr.querySelector(".del-row").addEventListener("click", (e) => e.target.closest("tr").remove());
}

async function renderProfile() {
  const profile = await getProfile();
  const rows = $("profile-rows");
  rows.innerHTML = profile.length ? profile.map(rowHtml).join("") : rowHtml();
  rows.querySelectorAll("tr").forEach(wireDelete);
}

function collectProfile() {
  const out = [];
  $("profile-rows")
    .querySelectorAll("tr")
    .forEach((tr) => {
      const vals = {};
      tr.querySelectorAll(".cell").forEach((c) => (vals[c.dataset.f] = c.value.trim()));
      if (!vals.label && !vals.answer) return;
      out.push({
        id: "e" + Math.random().toString(36).slice(2, 10),
        label: vals.label,
        keywords: vals.keywords ? vals.keywords.split(",").map((s) => s.trim()).filter(Boolean) : [],
        answer: vals.answer,
        aliases: vals.aliases ? vals.aliases.split(",").map((s) => s.trim()).filter(Boolean) : [],
      });
    });
  return out;
}

$("add-row-btn").addEventListener("click", () => {
  $("profile-rows").insertAdjacentHTML("beforeend", rowHtml());
  wireDelete($("profile-rows").lastElementChild);
});

$("save-profile-btn").addEventListener("click", async () => {
  const profile = collectProfile();
  await saveProfile(profile);
  $("profile-status").textContent = `Saved ${profile.length} entries.`;
  $("profile-status").className = "status ok";
  renderProfile();
});

$("export-btn").addEventListener("click", async () => {
  const profile = await getProfile();
  const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `focus-group-scanner-profile-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

$("import-btn").addEventListener("click", () => $("import-file").click());
$("import-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error("Backup must be a JSON array");
    await saveProfile(data);
    $("profile-status").textContent = `Imported ${data.length} entries.`;
    $("profile-status").className = "status ok";
    renderProfile();
  } catch (err) {
    $("profile-status").textContent = "Import failed: " + (err?.message || err);
    $("profile-status").className = "status err";
  }
  e.target.value = "";
});

renderProfile();
refresh();
