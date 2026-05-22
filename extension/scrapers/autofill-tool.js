// Self-contained page-context function for the demographic autofill feature.
// Injected via chrome.scripting.executeScript with { func: autofillTool, args:[{...}] }.
// Must not reference anything outside itself — it runs in the target page.
//
// args = { mode: "learn" | "fill", profile: Entry[] }
//   learn -> returns { pairs: [{question, answer, type}] }
//   fill  -> selects matching answers, highlights them, returns
//            { filled, highlightedUnmatched, details: [...] }

export function autofillTool(args) {
  const mode = args.mode;
  const profile = args.profile || [];

  const norm = (s) =>
    (s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

  function optionLabel(input) {
    if (input.id) {
      const l = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
      if (l && l.innerText.trim()) return l.innerText.trim();
    }
    const wrap = input.closest("label");
    if (wrap && wrap.innerText.trim()) return wrap.innerText.trim();
    let sib = input.nextSibling;
    while (sib) {
      if (sib.nodeType === 3 && sib.textContent.trim()) return sib.textContent.trim();
      if (sib.nodeType === 1 && sib.innerText && sib.innerText.trim())
        return sib.innerText.trim();
      sib = sib.nextSibling;
    }
    return input.getAttribute("aria-label") || input.value || "";
  }

  function questionText(els) {
    const first = els[0];
    const fs = first.closest("fieldset");
    if (fs) {
      const lg = fs.querySelector("legend");
      if (lg && lg.innerText.trim()) return lg.innerText.trim();
    }
    const lb = first.getAttribute("aria-labelledby");
    if (lb) {
      const el = document.getElementById(lb);
      if (el && el.innerText.trim()) return el.innerText.trim();
    }
    const optionTexts = els.map(optionLabel).filter(Boolean);
    let ancestor = first.parentElement;
    for (let i = 0; i < 6 && ancestor; i++) {
      let text = (ancestor.innerText || "").trim();
      for (const ot of optionTexts) text = text.split(ot).join(" ");
      text = text.replace(/\s+/g, " ").trim();
      if (text.length > 4 && text.length < 300) return text;
      ancestor = ancestor.parentElement;
    }
    return "";
  }

  function groupBy(inputs) {
    const groups = {};
    inputs.forEach((el) => {
      const name = el.name || el.id;
      if (!name) return;
      (groups[name] = groups[name] || []).push(el);
    });
    return Object.values(groups);
  }

  // ---- LEARN ----
  if (mode === "learn") {
    const pairs = [];
    groupBy([...document.querySelectorAll('input[type="radio"]')]).forEach((els) => {
      const checked = els.find((r) => r.checked);
      if (!checked) return;
      const q = questionText(els);
      const a = optionLabel(checked);
      if (q && a) pairs.push({ question: q, answer: a, type: "radio" });
    });
    groupBy([...document.querySelectorAll('input[type="checkbox"]')]).forEach((els) => {
      const checkedEls = els.filter((c) => c.checked);
      if (!checkedEls.length) return;
      const q = questionText(els);
      checkedEls.forEach((c) => {
        const a = optionLabel(c);
        if (q && a) pairs.push({ question: q, answer: a, type: "checkbox" });
      });
    });
    document.querySelectorAll("select").forEach((sel) => {
      if (sel.selectedIndex < 0) return;
      const opt = sel.options[sel.selectedIndex];
      if (!opt || !opt.text.trim()) return;
      // skip placeholder-ish first option
      if (sel.selectedIndex === 0 && /select|choose|--/i.test(opt.text)) return;
      const q = questionText([sel]);
      if (q) pairs.push({ question: q, answer: opt.text.trim(), type: "select" });
    });
    return { pairs };
  }

  // ---- FILL ----
  function matchEntry(question) {
    const q = norm(question);
    let best = null;
    let bestScore = 0;
    for (const e of profile) {
      let score = 0;
      for (const kw of e.keywords || []) {
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

  function optionScore(entry, optionText) {
    const o = norm(optionText);
    if (!o) return 0;
    const cands = [entry.answer, ...(entry.aliases || [])].map(norm).filter(Boolean);
    let best = 0;
    for (const c of cands) {
      if (o === c) best = Math.max(best, 3);
      else if (o.includes(c) || c.includes(o)) best = Math.max(best, 2);
    }
    return best;
  }

  function highlight(el, color) {
    if (!el) return;
    el.style.outline = `2px solid ${color}`;
    el.style.outlineOffset = "2px";
  }
  function fire(el, type) {
    el.dispatchEvent(new Event(type, { bubbles: true }));
  }

  let filled = 0;
  let highlightedUnmatched = 0;
  const details = [];

  groupBy([...document.querySelectorAll('input[type="radio"]')]).forEach((els) => {
    const q = questionText(els);
    const entry = matchEntry(q);
    if (!entry) return;
    let bestEl = null;
    let bestScore = 0;
    els.forEach((r) => {
      const s = optionScore(entry, optionLabel(r));
      if (s > bestScore) {
        bestScore = s;
        bestEl = r;
      }
    });
    if (bestEl && bestScore > 0) {
      bestEl.checked = true;
      fire(bestEl, "click");
      fire(bestEl, "change");
      highlight(bestEl.closest("label") || bestEl.parentElement, "#16a34a");
      filled++;
      details.push({ question: q, answer: optionLabel(bestEl), status: "filled" });
    } else {
      highlight(els[0].closest("fieldset") || els[0].parentElement, "#f59e0b");
      highlightedUnmatched++;
      details.push({ question: q, status: "no-option-match" });
    }
  });

  document.querySelectorAll("select").forEach((sel) => {
    const q = questionText([sel]);
    const entry = matchEntry(q);
    if (!entry) return;
    let bestIdx = -1;
    let bestScore = 0;
    Array.from(sel.options).forEach((opt, i) => {
      const s = optionScore(entry, opt.text);
      if (s > bestScore) {
        bestScore = s;
        bestIdx = i;
      }
    });
    if (bestIdx >= 0 && bestScore > 0) {
      sel.selectedIndex = bestIdx;
      fire(sel, "change");
      highlight(sel, "#16a34a");
      filled++;
      details.push({ question: q, answer: sel.options[bestIdx].text, status: "filled" });
    } else {
      highlight(sel, "#f59e0b");
      highlightedUnmatched++;
    }
  });

  groupBy([...document.querySelectorAll('input[type="checkbox"]')]).forEach((els) => {
    const q = questionText(els);
    const entry = matchEntry(q);
    if (!entry) return;
    let any = false;
    els.forEach((c) => {
      if (optionScore(entry, optionLabel(c)) > 0) {
        c.checked = true;
        fire(c, "click");
        fire(c, "change");
        highlight(c.closest("label") || c.parentElement, "#16a34a");
        any = true;
      }
    });
    if (any) {
      filled++;
      details.push({ question: q, status: "filled" });
    }
  });

  return { filled, highlightedUnmatched, details };
}
