"""Generate extension/sources.json from docs/recruiters.csv.

Includes all rows where Type starts with "Browsable". The extension uses
this list as its scrape registry.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "docs" / "recruiters.csv"
OUT_PATH = ROOT / "extension" / "sources.json"


def slugify(name: str) -> str:
    s = "".join(c if c.isalnum() else "_" for c in name.lower())
    while "__" in s:
        s = s.replace("__", "_")
    return s.strip("_")


def parent_domain(url: str) -> str:
    if not url:
        return ""
    try:
        netloc = urlparse(url).netloc.lower()
    except ValueError:
        return ""
    if netloc.startswith("www."):
        netloc = netloc[4:]
    return netloc


def main() -> None:
    rows = []
    with CSV_PATH.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            type_ = r["Type"].strip()
            # Include anything scrapable: Browsable (web) plus App (mobile/native
            # — listed for visibility, no scraper).
            if not (type_.startswith("Browsable") or type_ == "App"):
                continue
            url = r["URL"].strip()
            if not url:
                continue
            name = r["Company"].strip()
            rows.append(
                {
                    "id": slugify(name),
                    "name": name,
                    "type": type_,
                    "url": url,
                    "domain": parent_domain(url),
                    # Default: no hand-rolled scraper. Override below for sites
                    # we've written extractors for.
                    "scraper": None,
                }
            )

    # Register hand-rolled scrapers — extractor key matches a function
    # exported from extension/scrapers/extractors.js.
    SCRAPER_OVERRIDES = {
        "prc": "extractPRC",
        "become_a_thinker": "extractBecomeAThinker",
        "daisy_mae_research": "extractDaisyMae",
        "accelerant_research": "extractAccelerant",
        "ff_focus_group": "extractFFFocusGroup",
    }
    for r in rows:
        if r["id"] in SCRAPER_OVERRIDES:
            r["scraper"] = SCRAPER_OVERRIDES[r["id"]]

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(rows, indent=2) + "\n")

    scrape_ready = sum(1 for r in rows if r["scraper"])
    print(f"Wrote {OUT_PATH}")
    print(f"  Total browsable sources: {len(rows)}")
    print(f"  With hand-rolled scraper: {scrape_ready}")
    print(f"  Pending extractor:        {len(rows) - scrape_ready}")


if __name__ == "__main__":
    main()
