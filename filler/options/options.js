import { getProfile, saveProfile } from "../lib/profile.js";

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function cell(field, value) {
  return `<input class="cell" data-f="${field}" value="${esc(value)}" style="width:100%;padding:4px;border:1px solid #cbd5e1;border-radius:4px;font-size:12px;" />`;
}

function rowHtml(e = {}) {
  return `<tr>
    <td style="padding:3px;">${cell("label", e.label)}</td>
    <td style="padding:3px;">${cell("keywords", (e.keywords || []).join(", "))}</td>
    <td style="padding:3px;">${cell("answer", e.answer)}</td>
    <td style="padding:3px;">${cell("aliases", (e.aliases || []).join(", "))}</td>
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

function status(msg, kind = "") {
  const el = $("profile-status");
  el.textContent = msg;
  el.className = "status " + kind;
}

$("add-row-btn").addEventListener("click", () => {
  $("profile-rows").insertAdjacentHTML("beforeend", rowHtml());
  wireDelete($("profile-rows").lastElementChild);
});

$("save-profile-btn").addEventListener("click", async () => {
  const profile = collectProfile();
  await saveProfile(profile);
  status(`Saved ${profile.length} entries.`, "ok");
  renderProfile();
});

$("export-btn").addEventListener("click", async () => {
  const profile = await getProfile();
  const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `focus-group-filler-profile-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

$("import-btn").addEventListener("click", () => $("import-file").click());
$("import-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data)) throw new Error("Backup must be a JSON array");
    await saveProfile(data);
    status(`Imported ${data.length} entries.`, "ok");
    renderProfile();
  } catch (err) {
    status("Import failed: " + (err?.message || err), "err");
  }
  e.target.value = "";
});

renderProfile();
