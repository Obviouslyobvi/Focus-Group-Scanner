"""Parse and dedupe the user's raw recruiter dump.

Output: a clean (name, url) list of candidate recruiters, with junk filtered,
duplicates collapsed, and overlaps with the already-known catalog flagged.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "scripts" / "_user_dump_raw.tsv"
OUT = ROOT / "scripts" / "_user_dump_clean.tsv"

# Companies we've already classified (from earlier 20).
ALREADY_CLASSIFIED = {
    "accelerantresearch.com", "reckner.com", "betheheard.com", "opinionslink.com",
    "opinionsbysync.com", "gallowayresearch.com", "questionspace.net",
    "userinterviews.com", "daisymaeresearch.com", "prcmarketresearch.com",
    "nelsonrecruiting.com", "uriux.com", "becomeathinker.com",
    "10kvoices.com", "adlerweiner.com", "advancedfocus.com", "advancedopinions.com",
    "respondent.io", "prolific.com", "dscout.com", "fieldwork.com",
}

# Companies the 4 background agents are currently researching (from OCH 118).
# These will be merged from agent results later — list here just for "overlap" awareness.
OCH_NAMES_IN_FLIGHT = {
    "ascendancy research", "askable", "bezel research", "big bang recruiting",
    "blink ux", "cambridge focus", "cara casting", "citrus labs", "clearview research",
    "collab research", "connexion research", "consumer viewpoint", "contact design",
    "core", "curion", "cypher research", "design science", "drive research",
    "elliott benson", "end to end research", "ethical mind", "ff focus group",
    "first court jurors", "focus & testing", "focus corner", "focus crossroads",
    "focus group connection", "focus insite", "focus pulse", "focuscope",
    "funds for focus", "georgetown university", "good gamer group", "griot recruit",
    "hagen sinclair research recruiting", "horizon group", "ideo design research",
    "isg", "insight recruit", "intact qualitative research", "ivy exec",
    "jc research partners", "jja research", "l&e research", "leede research",
    "lees focus", "market eaze", "mars research", "mccormick", "mediabarn research",
    "mindswarms", "murray hill national", "n.c. litigation & jury research group",
    "nyc focal", "nashville research group", "nationwide research recruiters",
    "newton", "newton marketing network", "nichols research", "olympic national research",
    "opinions ltd", "opinions for cash", "orman guidance", "people for research",
    "portable insights", "precision research", "probe market research", "q-insights",
    "qual recruit", "rru research", "real focus group", "recruit and field",
    "research america", "research outloud", "ridgeline recruiting", "round2research",
    "sago", "sis research", "savvy cooperative", "spotlight", "take part in research",
    "taylor research", "the insighters", "the social question", "theoretics",
    "think group", "truscott research", "ubinsights", "uncover", "utest",
    "view-finders", "wac research", "watch me think", "watchlab",
    "when opinions meet", "wilkins research services", "winn winn research", "focus 99",
}

# Domains that are NOT recruiters — software tools, unrelated tech companies,
# tracking links, etc. Drop these from output.
JUNK_DOMAINS = {
    "cartken.com",            # autonomous robotics
    "courtlistener.com",      # court records
    "gotolstoy.com",          # video shopping platform
    "itracks.com",            # qual research software (tool, not recruiter)
    "motional.com",           # autonomous vehicles
    "mux.com",                # video streaming infrastructure
    "myworkdayjobs.com",      # Workday HR jobs portal
    "panelfox.io",            # panel mgmt software
    "playbookux.com",         # UX research tool (not a recruiter panel itself)
    "profgmedia.com",         # unclear / not a recruiter
    "raytrckr.com",           # tracking/analytics
    "recollective.com",       # qual research software
    "runwayml.com",           # AI video generation
    "surveysparrow.com",      # survey software (not a recruiter)
    "surveysparrow-ai.info",  # likely typosquat/spam
    "tembo.health",           # Postgres infra
    "thediamondlists.com",    # unclear / not recruiter
    "rational-online.com",    # unclear / not recruiter
    "fgfinder.com",           # aggregator listing, not a recruiter itself
    "findpaidfocusgroup.com", # aggregator/affiliate, not a recruiter itself
    "focusgroups.org",        # directory site
    "paidforyouropinions.com",# affiliate-blog/aggregator
    "paidviewpoint.com",      # paid survey site, not focus-group recruiter
    "alchemer.com",           # survey software (JC Research Partners link redirected)
}

# Map: domain -> canonical recruiter name (used to fix the rows where col 1 was blank).
DOMAIN_TO_NAME = {
    "accelerantresearch.com": "Accelerant Research",
    "actone-research.com": "Act One Research",
    "adlerweiner.com": "Adler Weiner Research",
    "amplifyresearch.com": "Amplify Research",
    "apexfocusgroup.com": "Apex Focus Group",
    "athpower.com": "ATH Power Consulting",
    "atkinsresearch.com": "Atkins Research",
    "becomeathinker.com": "Become A Thinker",
    "bestmark.com": "BestMark",
    "bezelrr.com": "Bezel Research",
    "bigbangrecruiting.com": "Big Bang Recruiting",
    "teambrightsider.com": "Brightside Research Solutions",
    "cictesting.com": "CIC Testing",
    "collab-research.com": "Collab Research",
    "compassmarketingresearch.com": "Compass Research",
    "confideresearch.com": "Confide Research",
    "contracttesting.com": "Contract Testing",
    "curionpanelist.com": "Curion",
    "cypherresearch.com": "Cypher Research",
    "decisionpointresearch.ca": "Decision Point Research",
    "dscout.com": "dscout",
    "elliottbenson.com": "Elliott Benson",
    "endtoenduserresearch.com": "End to End Research",
    "engageindepth.com": "Engage In Depth",
    "ethicalmind.org": "Ethical Mind",
    "facilitymanagerplus.com": "Facility Manager Plus (L&E Opinions)",
    "fffocusgroup.com": "FF Focus Group",
    "ffrsf.com": "Fleischmann Research",
    "fieldagent.net": "Field Agent / Storesight",
    "fieldgoals.us": "Field Goals (Heard backend)",
    "fieldvoices.com": "Field Voices",
    "fieldwork.com": "Fieldwork",
    "focus99.com": "focus 99",
    "focuscope.com": "Focuscope",
    "focusfwd.com": "Focus Forward",
    "focusgroup.com": "Focus Pointe Global",
    "focusgroupconnection.com": "Focus Group Connection",
    "focusgrouppanel.com": "Focus Group Panel",
    "focusinsite.com": "Focus Insite",
    "focusroom.com": "Focus Room",
    "fundsforfocus.com": "Funds for Focus",
    "hagensinclair.com": "Hagen Sinclair Research Recruiting",
    "ishopforyou.com": "Ann Michaels / iShopForYou",
    "jcresearchpartners.com": "JC Research Partners",
    "jacksonassociates.com": "Jackson Associates",
    "join.2020panel.com": "20/20 Panel",
    "kernscheduling.com": "KSS International",
    "leedemn.com": "Leede Research",
    "leopinions.com": "L&E Opinions",
    "leresearch.com": "L&E Research",
    "limelightbyshugoll.com": "Limelight by Shugoll",
    "localfocusgroup.com": "Local Focus Group",
    "macconnellresearch.com": "MacConnell Research",
    "marketforce.com": "MarketForce",
    "methinks.io": "MeThinks",
    "mforceresearch.com": "MForce Research",
    "moore-research.com": "Moore Research Services",
    "mooreopinions.com": "Moore Opinions",
    "murrayhillnational.com": "Murray Hill National",
    "mvgrecruiting.com": "MVG Recruiting",
    "national-data.net": "NDR (National Data Research)",
    "nelsonrecruiting.com": "Nelson Recruiting",
    "newenglandfocusgroup.com": "New England Focus Group",
    "onlineverdict.com": "Online Verdict",
    "opinionsforcash.com": "Opinions for Cash",
    "opinionslink.com": "Opinions Link",
    "opinionwizard.com": "Opinion Wizard (Advanced Focus)",
    "ormanguidance.com": "Orman Guidance",
    "focusfwdonline.com": "Focus Forward",
    "pragmatic-research.com": "Pragmatic Research",
    "prcmarketresearch.com": "PRC",
    "preparetopersuade.com": "Prepare to Persuade",
    "privatejury.com": "Private Jury",
    "probemarket.com": "Probe Market Research",
    "producttube.com": "Product Tube",
    "pvr-research.com": "PVR Research",
    "q-insights.com": "Q-Insights",
    "rarepatientvoice.com": "Rare Patient Voice",
    "reckner.com": "Reckner",
    "recruitandfield.com": "Recruit and Field",
    "respondent.io": "Respondent",
    "round2research.com": "Round2Research",
    "sago.com": "SAGO (Schlesinger)",
    "secretshopper.com": "Secret Shopper",
    "watchlab.com": "Watchlab",
    "sisinternational.com": "SIS Research",
    "talkingheadsstudio.com": "Talking Heads Studio",
    "trendsource.com": "TrendSource",
    "userinsight.com": "User Insight",
    "userinterviews.com": "User Interviews",
    "videochatnetwork.net": "Videochat Network",
    "watchmethink.com": "Watch Me Think",
    "wilkinsresearch.com": "Wilkins Research Services",
    "wilkinsresearch.net": "Wilkins Research Services",
    "winnwinn.com": "Winn Winn Research",
}

# URLs in raw data that are mangled / wrong — override to corrected form.
URL_OVERRIDES = {
    # User's personal Respondent referral link — strip to generic.
    "https://app.respondent.io/r/genepalmer-72e22a7fea4f": "https://www.respondent.io",
    # Recruit and Field URL was concatenated junk
    "https://s2.focuspocussohttps://www.recruitandfield.com/register-as-a-participantftware.com/wp_raf/register":
        "https://www.recruitandfield.com/register-as-a-participant",
    # JC Research Partners URL pointed to alchemer.com (a survey tool, not their site)
    "https://alchemer.com/": "https://jcresearchpartners.com",
}

MD_LINK = re.compile(r"\[[^\]]+\]\((https?://[^)]+)\)")


def clean_url(raw: str) -> str | None:
    """Pick a real URL out of the raw cell. Return None if no URL extractable."""
    raw = raw.strip()
    if not raw:
        return None
    m = MD_LINK.search(raw)
    if m:
        url = m.group(1)
    elif raw.startswith("http://") or raw.startswith("https://"):
        url = raw
    elif "." in raw and "/" not in raw and not raw.startswith("["):
        # bare domain
        url = "https://" + raw
    elif raw.startswith("www."):
        url = "https://" + raw
    else:
        return None
    url = url.strip().rstrip(".,;")
    return URL_OVERRIDES.get(url.lower(), url)


def domain_of(url: str) -> str:
    netloc = urlparse(url).netloc.lower()
    if netloc.startswith("www."):
        netloc = netloc[4:]
    # collapse multi-subdomain sites to their parent for matching
    if netloc.endswith(".facilitymanagerplus.com"):
        return "facilitymanagerplus.com"
    if netloc.endswith(".focusfwdonline.com"):
        return "focusfwdonline.com"
    if netloc.endswith(".2020panel.com"):
        return "join.2020panel.com"
    if netloc.endswith(".watchlab.com"):
        return "watchlab.com"
    return netloc


def name_from(row_name: str, domain: str) -> str:
    if row_name.strip():
        return row_name.strip()
    return DOMAIN_TO_NAME.get(domain, domain)


def main() -> None:
    if not RAW.exists():
        print(f"Missing: {RAW}", file=sys.stderr)
        sys.exit(1)

    rows = []
    seen_domain: dict[str, dict] = {}
    skipped_junk: list[tuple[str, str]] = []
    raw_lines = RAW.read_text().splitlines()
    for line in raw_lines:
        if not line.strip():
            continue
        parts = line.split("\t")
        # rows look like: name \t col2 \t col3   (sometimes col1 is empty)
        if len(parts) < 3:
            parts = parts + [""] * (3 - len(parts))
        row_name, col2, col3 = parts[0], parts[1], parts[2]
        url = clean_url(col3) or clean_url(col2)
        if not url:
            continue
        d = domain_of(url)
        if d in JUNK_DOMAINS:
            skipped_junk.append((row_name or d, url))
            continue
        if d in seen_domain:
            # already captured this domain; keep the entry with a longer / more
            # specific URL path (typically a deeper signup/listing link).
            prev = seen_domain[d]
            if len(url) > len(prev["url"]):
                prev["url"] = url
            if not prev["name"] and row_name.strip():
                prev["name"] = row_name.strip()
            continue
        seen_domain[d] = {"name": row_name.strip(), "domain": d, "url": url}
        rows.append(seen_domain[d])

    # Fill in canonical names for unnamed rows
    for r in rows:
        r["name"] = name_from(r["name"], r["domain"])

    # Classify each by overlap with known sources
    new_unique = []
    overlap_existing = []
    overlap_in_flight = []
    for r in rows:
        name_lc = r["name"].lower()
        if r["domain"] in ALREADY_CLASSIFIED:
            overlap_existing.append(r)
        elif name_lc in OCH_NAMES_IN_FLIGHT or any(
            n in name_lc for n in OCH_NAMES_IN_FLIGHT if len(n) > 4
        ):
            overlap_in_flight.append(r)
        else:
            new_unique.append(r)

    lines = ["name\tdomain\turl\tstatus"]
    for r in overlap_existing:
        lines.append(f"{r['name']}\t{r['domain']}\t{r['url']}\toverlap-classified")
    for r in overlap_in_flight:
        lines.append(f"{r['name']}\t{r['domain']}\t{r['url']}\toverlap-in-flight")
    for r in new_unique:
        lines.append(f"{r['name']}\t{r['domain']}\t{r['url']}\tnew")
    OUT.write_text("\n".join(lines) + "\n")

    print(f"Raw lines:                  {len(raw_lines)}")
    print(f"Dropped (junk / non-recruiter): {len(skipped_junk)}")
    print(f"Deduped unique domains:      {len(rows)}")
    print(f"  already classified (20):   {len(overlap_existing)}")
    print(f"  in-flight (agents on it):  {len(overlap_in_flight)}")
    print(f"  NEW (needs classification):{len(new_unique)}")
    print()
    print("=== NEW unique recruiters (need URL + classification) ===")
    for r in new_unique:
        print(f"  {r['name']:42s}  {r['url']}")
    print()
    print("=== Dropped as non-recruiter junk ===")
    for n, u in skipped_junk:
        print(f"  {n:42s}  {u}")


if __name__ == "__main__":
    main()
