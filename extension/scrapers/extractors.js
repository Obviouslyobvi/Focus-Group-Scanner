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
  // The page is flat text, not DOM-structured. Studies are separated by
  // lines of ~~~~ characters. Each study chunk has lines like:
  //   Topic: <title>
  //   P###### (project code, optional, sometimes preceded by "Code:")
  //   Who: <demographic>
  //   When: <date range>
  //   Where: <location>
  //   Length: <duration>
  //   Incentive: $<amount>
  //   CLICK HERE  (a link to the screener)
  const body = (document.body && document.body.innerText) || "";
  // Split on lines containing a run of ~ characters (5+).
  const chunks = body.split(/\r?\n\s*~{5,}[\s~]*\r?\n/);
  const out = [];
  const seen = new Set();
  // Try to associate each chunk with its CLICK HERE link by scanning the DOM.
  const links = Array.from(document.querySelectorAll("a")).filter(
    (a) => /click here/i.test(a.innerText || "") || /screener/i.test(a.innerText || "")
  );
  let linkIdx = 0;
  chunks.forEach((chunk) => {
    const text = chunk.trim();
    if (!text) return;
    const topic = text.match(/Topic:\s*([^\r\n]+)/i);
    const code = text.match(/\b(P\d{4,}[A-Za-z0-9-]*)\b/);
    const who = text.match(/Who:\s*([^\r\n]+)/i);
    const when = text.match(/When:\s*([^\r\n]+)/i);
    const where = text.match(/Where:\s*([^\r\n]+)/i);
    const length = text.match(/Length:\s*([^\r\n]+)/i);
    const incentive = text.match(/Incentive:\s*([^\r\n]+)/i);
    // Require at least one strong signal (topic, code, or incentive).
    if (!topic && !code && !incentive) return;
    const title = topic ? topic[1].trim() : code ? code[1] : "Study";
    const id = (code ? code[1] : title).toLowerCase().replace(/\s+/g, "-").slice(0, 80);
    if (seen.has(id)) return;
    seen.add(id);
    const link = links[linkIdx]?.href || location.href;
    linkIdx += 1;
    out.push({
      externalId: id,
      title,
      pay: incentive ? incentive[1].trim() : "",
      duration: length ? length[1].trim() : "",
      location: where ? where[1].trim() : "",
      studyDate: when ? when[1].trim() : "",
      url: link,
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
