// Self-contained page-context function for the demographic autofill feature.
// Injected via chrome.scripting.executeScript with { func: autofillTool, args:[{...}] }.
// Must not reference anything outside itself — it runs in the target page.
//
// args = { mode: "learn" | "fill", profile: Entry[] }
//   learn -> returns { pairs: [{question, answer, type}] }
//   fill  -> selects matching answers, highlights them, returns
//            { filled, highlightedUnmatched, details: [...] }

export async function autofillTool(args) {
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
    // Start from the smallest ancestor that contains every input in the group,
    // then walk up until the leftover text (after removing option labels) looks
    // like a question. Prefer text containing "?".
    let node = first.parentElement;
    while (node && !els.every((e) => node.contains(e))) node = node.parentElement;
    if (!node) node = first.parentElement;
    let candidate = "";
    for (let i = 0; i < 5 && node; i++) {
      let text = (node.innerText || "").trim();
      for (const ot of optionTexts) text = text.split(ot).join(" ");
      text = text.replace(/\s+/g, " ").trim();
      if (text.length > 4 && text.length < 400) {
        if (text.includes("?")) return text;
        if (!candidate) candidate = text;
      }
      node = node.parentElement;
    }
    return candidate;
  }

  // Group radio/checkbox inputs into questions. Inputs that share a `name`
  // form a group (classic radio group). Inputs with unique names — common for
  // "select all that apply" checkboxes on survey engines — are clustered by
  // their nearest shared ancestor instead.
  function groupInputs(inputs) {
    const byName = {};
    const leftovers = [];
    inputs.forEach((el) => {
      if (el.name) (byName[el.name] = byName[el.name] || []).push(el);
      else leftovers.push(el);
    });
    const groups = [];
    for (const g of Object.values(byName)) {
      if (g.length > 1) groups.push(g);
      else leftovers.push(g[0]);
    }
    const used = new Set();
    leftovers.forEach((el) => {
      if (used.has(el)) return;
      let anc = el.parentElement;
      let best = null;
      for (let i = 0; i < 8 && anc; i++) {
        if (leftovers.filter((x) => anc.contains(x)).length >= 2) {
          best = anc;
          break;
        }
        anc = anc.parentElement;
      }
      if (best) {
        const within = leftovers.filter((x) => best.contains(x) && !used.has(x));
        within.forEach((x) => used.add(x));
        groups.push(within);
      } else {
        used.add(el);
        groups.push([el]);
      }
    });
    return groups;
  }

  // ---- LEARN ----
  if (mode === "learn") {
    const pairs = [];
    groupInputs([...document.querySelectorAll('input[type="radio"]')]).forEach((els) => {
      const checked = els.find((r) => r.checked);
      if (!checked) return;
      const q = questionText(els);
      const a = optionLabel(checked);
      if (q && a) pairs.push({ question: q, answer: a, type: "radio" });
    });
    groupInputs([...document.querySelectorAll('input[type="checkbox"]')]).forEach((els) => {
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
    // Diagnostics so we can tell, when pairs is empty, whether the page has no
    // native inputs (custom widgets) vs. inputs we failed to read.
    const diag = {
      radios: document.querySelectorAll('input[type="radio"]').length,
      radiosChecked: document.querySelectorAll('input[type="radio"]:checked').length,
      checkboxes: document.querySelectorAll('input[type="checkbox"]').length,
      checkboxesChecked: document.querySelectorAll('input[type="checkbox"]:checked').length,
      selects: document.querySelectorAll("select").length,
      ariaCheckables: document.querySelectorAll('[role="radio"],[role="checkbox"]').length,
    };
    return { pairs, diag };
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

  // Gather fill actions first; do the yellow "couldn't match an option"
  // highlights inline (those aren't selections, so no delay). Then execute
  // the actual selections one at a time with a human-like random gap.
  let highlightedUnmatched = 0;
  const details = [];
  const actions = []; // each: { apply: fn, el: Element, question, answer }

  groupInputs([...document.querySelectorAll('input[type="radio"]')]).forEach((els) => {
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
      actions.push({
        el: bestEl,
        question: q,
        answer: optionLabel(bestEl),
        apply: () => {
          bestEl.checked = true;
          fire(bestEl, "click");
          fire(bestEl, "change");
          highlight(bestEl.closest("label") || bestEl.parentElement, "#16a34a");
        },
      });
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
      actions.push({
        el: sel,
        question: q,
        answer: sel.options[bestIdx].text,
        apply: () => {
          sel.selectedIndex = bestIdx;
          fire(sel, "change");
          highlight(sel, "#16a34a");
        },
      });
    } else {
      highlight(sel, "#f59e0b");
      highlightedUnmatched++;
    }
  });

  groupInputs([...document.querySelectorAll('input[type="checkbox"]')]).forEach((els) => {
    const q = questionText(els);
    const entry = matchEntry(q);
    if (!entry) return;
    const toCheck = els.filter((c) => optionScore(entry, optionLabel(c)) > 0);
    if (!toCheck.length) return;
    actions.push({
      el: toCheck[0],
      question: q,
      answer: toCheck.map(optionLabel).join(", "),
      apply: () => {
        toCheck.forEach((c) => {
          c.checked = true;
          fire(c, "click");
          fire(c, "change");
          highlight(c.closest("label") || c.parentElement, "#16a34a");
        });
      },
    });
  });

  // Human-like pacing: wait a random 1s / 2s / 5s between each selection,
  // never the same gap twice in a row.
  const DELAYS_MS = [1000, 2000, 5000];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (a, b) => a + Math.random() * (b - a);
  let prevDelay = null;
  function nextDelay() {
    let d;
    do {
      d = DELAYS_MS[Math.floor(Math.random() * DELAYS_MS.length)];
    } while (d === prevDelay && DELAYS_MS.length > 1);
    prevDelay = d;
    return d;
  }

  // Mouse-movement simulation. Moves the synthetic cursor toward a target
  // along an eased, jittered path, firing mousemove on whatever's under the
  // path, then mouseover/mouseenter on the target. Note: synthetic events
  // are isTrusted:false, so this defeats naive "did the mouse move?" checks
  // but not advanced fingerprinting.
  let lastX = null;
  let lastY = null;
  function dispatchMouse(type, x, y, target) {
    const el = target || document.elementFromPoint(x, y) || document.body;
    el.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: Math.round(x),
        clientY: Math.round(y),
      })
    );
  }
  async function moveMouseTo(el) {
    const rect = el.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    const tx = rect.left + rect.width * rand(0.3, 0.7);
    const ty = rect.top + rect.height * rand(0.35, 0.65);
    let cx = lastX == null ? tx + rand(-150, 150) : lastX;
    let cy = lastY == null ? ty + rand(-120, 120) : lastY;
    const steps = Math.floor(rand(6, 14));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      // ease-in-out
      const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const x = cx + (tx - cx) * e + rand(-3, 3);
      const y = cy + (ty - cy) * e + rand(-3, 3);
      dispatchMouse("mousemove", x, y);
      await sleep(rand(8, 35));
    }
    lastX = tx;
    lastY = ty;
    dispatchMouse("mouseover", tx, ty, el);
    dispatchMouse("mouseenter", tx, ty, el);
    dispatchMouse("mousemove", tx, ty, el);
    return { x: tx, y: ty };
  }
  async function humanClick(el) {
    const pos = await moveMouseTo(el);
    if (pos) {
      await sleep(rand(40, 120));
      dispatchMouse("mousedown", pos.x, pos.y, el);
      await sleep(rand(40, 110));
      dispatchMouse("mouseup", pos.x, pos.y, el);
    }
  }

  let filled = 0;
  const delaysUsed = [];
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    try {
      a.el.scrollIntoView({ block: "center", behavior: "smooth" });
    } catch {}
    await sleep(rand(200, 500)); // let the scroll settle before measuring
    await humanClick(a.el); // jittered approach + mousedown/up at the target
    a.apply(); // sets checked/value and fires click/change + green highlight
    filled++;
    details.push({ question: a.question, answer: a.answer, status: "filled" });
    if (i < actions.length - 1) {
      const d = nextDelay();
      delaysUsed.push(d);
      await sleep(d);
    }
  }

  return { filled, highlightedUnmatched, details, delaysUsed };
}
