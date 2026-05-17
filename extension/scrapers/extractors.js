// Per-site extractors. Each one is injected into the target page via
// chrome.scripting.executeScript and runs in that page's DOM context.
// Each extractor returns an array of:
//   { externalId, title, pay, duration, location, studyDate, url }
//
// IMPORTANT: extractors must be self-contained — no imports, no captured
// closures, no helper references. Each function is stringified and run
// inside the page. Inline anything they need.
//
// All extractor selectors are best-effort and brittle. If a site changes
// markup, expect 0 results and update the selectors. Each extractor logs
// counts to console.log so the dashboard's scan log can surface failures.

export function extractPRC() {
  // PRC Market Research — /upcomingprojects
  // Typical pattern: a list of project cards/rows with title + incentive + dates.
  const rows = document.querySelectorAll(
    "[class*='project'], [class*='study'], article, .et_pb_blurb, tr"
  );
  const out = [];
  const seen = new Set();
  rows.forEach((el) => {
    const text = el.innerText.trim();
    if (!text || text.length < 20 || text.length > 800) return;
    if (!/\$\d/.test(text)) return; // require a dollar amount
    const title = (el.querySelector("h1,h2,h3,h4,h5,a,strong")?.innerText || text.split("\n")[0]).trim();
    if (!title || title.length > 200) return;
    const id = title.toLowerCase().replace(/\s+/g, "-").slice(0, 80);
    if (seen.has(id)) return;
    seen.add(id);
    const payMatch = text.match(/\$\s?[\d,]+(?:\.\d+)?/);
    const durMatch = text.match(/\b(\d+)\s*(?:min|minutes|hour|hours|days|day)s?\b/i);
    out.push({
      externalId: id,
      title,
      pay: payMatch ? payMatch[0] : "",
      duration: durMatch ? durMatch[0] : "",
      location: "",
      studyDate: "",
      url: el.querySelector("a")?.href || location.href,
    });
  });
  return out;
}

export function extractBecomeAThinker() {
  // Become A Thinker — /upcoming-studies/ (WordPress)
  const out = [];
  const items = document.querySelectorAll("article, .study, .post, .et_pb_blurb, li.study");
  items.forEach((el) => {
    const titleEl = el.querySelector("h1,h2,h3,h4,.entry-title,a");
    const title = (titleEl?.innerText || "").trim();
    if (!title) return;
    const text = el.innerText;
    const payMatch = text.match(/\$\s?[\d,]+/);
    const durMatch = text.match(/\b(\d+)\s*(?:min|minutes|hour|hours)\b/i);
    const id = (el.id || titleEl?.href || title).toLowerCase().replace(/\s+/g, "-").slice(0, 80);
    out.push({
      externalId: id,
      title,
      pay: payMatch ? payMatch[0] : "",
      duration: durMatch ? durMatch[0] : "",
      location: "",
      studyDate: "",
      url: el.querySelector("a")?.href || location.href,
    });
  });
  return out;
}

export function extractDaisyMae() {
  // Daisy Mae Research — /projects/  (WordPress archive)
  const out = [];
  const items = document.querySelectorAll("article.project, article.post, .project-card, article");
  items.forEach((el) => {
    const titleEl = el.querySelector("h1,h2,h3,.entry-title,a");
    const title = (titleEl?.innerText || "").trim();
    if (!title) return;
    const link = titleEl?.href || el.querySelector("a")?.href || location.href;
    const text = el.innerText;
    const payMatch = text.match(/\$\s?[\d,]+/);
    const durMatch = text.match(/\b(\d+)\s*(?:min|minutes|hour|hours)\b/i);
    const id = link.replace(/^https?:\/\/[^/]+/, "").slice(0, 100) || title.toLowerCase();
    out.push({
      externalId: id,
      title,
      pay: payMatch ? payMatch[0] : "",
      duration: durMatch ? durMatch[0] : "",
      location: "",
      studyDate: "",
      url: link,
    });
  });
  return out;
}

export function extractAccelerant() {
  // Accelerant Research — /availableresearch
  const out = [];
  const blocks = document.querySelectorAll("article, .study, .research-item, .et_pb_blurb, .panel");
  blocks.forEach((el) => {
    const text = el.innerText.trim();
    if (!text || !/\$\d/.test(text)) return;
    const titleEl = el.querySelector("h1,h2,h3,h4,strong");
    const title = (titleEl?.innerText || text.split("\n")[0]).trim();
    if (!title || title.length > 250) return;
    const payMatch = text.match(/\$\s?[\d,]+/);
    const durMatch = text.match(/\b(\d+)\s*(?:min|minutes|hour|hours)\b/i);
    const id = title.toLowerCase().replace(/\s+/g, "-").slice(0, 80);
    out.push({
      externalId: id,
      title,
      pay: payMatch ? payMatch[0] : "",
      duration: durMatch ? durMatch[0] : "",
      location: "",
      studyDate: "",
      url: el.querySelector("a")?.href || location.href,
    });
  });
  return out;
}

export function extractFFFocusGroup() {
  // FF Focus Group — /current-projects/  (WordPress projects archive)
  const out = [];
  const items = document.querySelectorAll(
    "article, .project, .et_pb_blurb, .post, .focus-group-listing"
  );
  items.forEach((el) => {
    const titleEl = el.querySelector("h1,h2,h3,h4,.entry-title,a");
    const title = (titleEl?.innerText || "").trim();
    if (!title) return;
    const text = el.innerText;
    const payMatch = text.match(/\$\s?[\d,]+/);
    const durMatch = text.match(/\b(\d+)\s*(?:min|minutes|hour|hours)\b/i);
    const dateMatch = text.match(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/);
    const id = (titleEl?.href || title).toLowerCase().replace(/\s+/g, "-").slice(0, 80);
    out.push({
      externalId: id,
      title,
      pay: payMatch ? payMatch[0] : "",
      duration: durMatch ? durMatch[0] : "",
      location: "",
      studyDate: dateMatch ? dateMatch[0] : "",
      url: el.querySelector("a")?.href || location.href,
    });
  });
  return out;
}

// Registry of extractor functions, looked up by name from sources.json.
export const EXTRACTORS = {
  extractPRC,
  extractBecomeAThinker,
  extractDaisyMae,
  extractAccelerant,
  extractFFFocusGroup,
};
