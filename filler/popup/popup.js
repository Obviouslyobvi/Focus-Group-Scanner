const $ = (id) => document.getElementById(id);

$("autofill-btn").addEventListener("click", () => {
  const btn = $("autofill-btn");
  btn.disabled = true;
  $("status").textContent = "Filling at a human pace — takes a few seconds. You can close this popup.";
  chrome.runtime.sendMessage({ type: "autofill-page" }, (resp) => {
    btn.disabled = false;
    if (!resp?.ok) {
      $("status").textContent = "Error: " + (resp?.error || "unknown");
    } else if (resp.empty) {
      $("status").textContent = "No saved answers yet. Use 'Learn from this page' first.";
    } else {
      $("status").textContent = `Filled ${resp.filled}; ${resp.highlightedUnmatched} matched but no option found (highlighted yellow). Review before submitting.`;
    }
  });
});

$("learn-btn").addEventListener("click", () => {
  const btn = $("learn-btn");
  btn.disabled = true;
  $("status").textContent = "Learning…";
  chrome.runtime.sendMessage({ type: "learn-page" }, (resp) => {
    btn.disabled = false;
    if (!resp?.ok) {
      $("status").textContent = "Error: " + (resp?.error || "unknown");
    } else if (!resp.found) {
      $("status").textContent = "No answered questions found on this page.";
    } else {
      $("status").textContent = `Learned ${resp.found} answers (${resp.learned.added} new, ${resp.learned.updated} updated).`;
    }
  });
});

$("options-btn").addEventListener("click", () => chrome.runtime.openOptionsPage());
