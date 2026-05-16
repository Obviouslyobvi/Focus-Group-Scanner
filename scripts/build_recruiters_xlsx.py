"""Build the consolidated recruiter spreadsheet (XLSX + CSV).

Sources merged:
  - Original 20 recruiters (researched in early batches)
  - OneClickHustle Company-filter catalog of 118 names (4 agent batches)
  - User's dump of ~134 raw entries (parsed via normalize_user_dump.py)

Dedup is by canonical domain; aliases collapse to one row.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from openpyxl import Workbook
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter

OUT_DIR = Path(__file__).resolve().parent.parent / "docs"
XLSX_PATH = OUT_DIR / "recruiters.xlsx"
CSV_PATH = OUT_DIR / "recruiters.csv"


@dataclass
class Row:
    name: str
    type_: str          # Browsable / Browsable (login) / Browsable (mobile app) / Email-only / Unclear
    url: str            # best URL: studies page if browsable, signup/home otherwise


# All rows from all sources. Order doesn't matter — sorted alphabetically on output.
# Where the user's dump or an alias provided a different name for the same site,
# the row uses the more recognizable/canonical name.
ALL_ROWS: list[Row] = [
    # --- Original 20 ---
    Row("10K Voices", "Unclear", "https://community.10kvoices.com"),
    Row("Accelerant Research", "Browsable", "https://www.accelerantresearch.com/availableresearch"),
    Row("Adler Weiner Research", "Email-only", "https://adlerweiner.com"),
    Row("Advanced Focus", "Unclear", "https://ow.advancedfocus.com"),
    Row("Advanced Opinions", "Unclear", "http://register.advancedopinions.com"),
    Row("Become A Thinker", "Browsable", "https://becomeathinker.com/upcoming-studies/"),
    Row("Daisy Mae Research", "Browsable", "https://daisymaeresearch.com/projects/"),
    Row("dscout", "Browsable (mobile app)", "https://dscout.com"),
    Row("Fieldwork", "Email-only", "https://www.fieldwork.com"),
    Row("Galloway Research", "Browsable", "https://www.questionspace.net/category/upcoming-studies/"),
    Row("Nelson Recruiting", "Email-only", "https://nelsonrecruiting.com"),
    Row("Opinions Link", "Email-only", "https://www.opinionslink.com"),
    Row("Opinions by Sync", "Browsable", "https://community.opinionsbysync.com/s/Jobsite"),
    Row("PRC", "Browsable", "https://www.prcmarketresearch.com/upcomingprojects"),
    Row("Prolific", "Browsable (login)", "https://app.prolific.com/"),
    Row("Reckner", "Email-only", "https://www.reckner.com"),
    Row("Respondent", "Browsable (login)", "https://app.respondent.io/respondents/v2/projects/browse"),
    # The Heard: original classification was Email-only ("watch for emails"), but
    # the agent that researched "Field Goals" (The Heard's backend) found a
    # browsable studies + prescreener flow. Upgrading to Browsable.
    Row("The Heard", "Browsable", "https://www.betheheard.com"),
    Row("User Interviews", "Browsable", "https://www.userinterviews.com/studies"),
    Row("User Research International", "Browsable (login)", "https://app.uriux.com/studies"),

    # --- OCH Batch 1 (25) ---
    Row("Ascendancy Research", "Browsable", "https://studies.ascendresearch.com/"),
    Row("Askable", "Unclear", "https://www.askable.com/earn/participants"),
    Row("Bezel Research", "Email-only", "http://bezelrr.com/"),
    Row("Big Bang Recruiting", "Email-only", "https://www.bigbangrecruiting.com/register/"),
    Row("Blink UX", "Unclear", "https://participate.blinkux.com/"),
    Row("Cambridge Focus", "Email-only", "http://www.participatenewengland.com/"),
    Row("Cara Casting", "Browsable", "https://jobs.caracasting.com/"),
    Row("Citrus Labs", "Email-only", "https://www.citruslabs.com/"),
    Row("ClearView Research", "Email-only", "http://www.clearviewresearch.com/sign-up-now.aspx"),
    Row("Collab Research", "Email-only", "https://www.collab-research.com/"),
    Row("ConneXion Research", "Browsable", "https://jointheconnexion.com/current-projects/"),
    Row("Consumer Viewpoint", "Email-only", "https://www.paidforyouropinions.com"),
    Row("Contact Design", "Email-only", "https://yourcontacthub.com/"),
    Row("Core", "Unclear", ""),
    Row("Curion", "Browsable (login)", "https://curionpanelist.com/portal/default"),
    Row("Cypher Research", "Email-only", "https://cypherresearch.com/intranet/respondent_sign_up.php"),
    Row("Design Science", "Email-only", "https://dscience.com/signup"),
    Row("Drive Research", "Email-only", "https://www.driveresearch.com/participate/"),
    Row("Elliott Benson", "Email-only", "https://www.elliottbenson.com/participate/"),
    Row("End to End Research", "Unclear", "https://www.endtoenduserresearch.com/participate.html"),
    Row("Ethical Mind", "Email-only", "https://ethicalmind.org/"),
    Row("FF Focus Group", "Browsable", "https://www.fffocusgroup.com/current-projects/"),
    Row("First Court Jurors", "Email-only", "https://www.firstcourt.com/jury-recruiting"),
    Row("Focus & Testing", "Email-only", "https://research.focusandtesting.com/"),
    Row("Focus Corner", "Email-only", "https://focuscorner.net/"),

    # --- OCH Batch 2 (25) ---
    Row("Focus Crossroads", "Email-only", "https://focuscrossroads.org/research-network/join-consumer/"),
    Row("Focus Group Connection", "Email-only", "https://www.focusgroupconnection.com/participate/"),
    Row("Focus Insite", "Unclear", "https://linktr.ee/focus_insite"),
    Row("Focus Pulse", "Email-only", "https://focuspulseresearch.co.uk/"),
    Row("Focuscope", "Email-only", "https://www.focuscope.com/join-our-community/"),
    Row("Funds for Focus", "Unclear", "https://fundsforfocus.com/"),
    Row("Georgetown University (GRVP)", "Email-only", "https://grvp.georgetown.edu/"),
    Row("Good Gamer Group", "Browsable", "https://goodgamergroup.com/available-studies/"),
    Row("Griot Recruit", "Email-only", "https://www.griotrecruit.co/"),
    Row("Hagen Sinclair Research Recruiting", "Email-only", "https://hagensinclair.com/paid-research-studies-2/"),
    Row("Horizon Group", "Email-only", "https://www.horizongroupiowa.com/join-our-panel/"),
    Row("IDEO Design Research", "Browsable", "https://designresearch.ideo.com/opportunities"),
    Row("ISG (Information Specialists Group)", "Unclear", "http://www.isgpanel.com/"),
    Row("Insight Recruit", "Email-only", "https://insightrecruit.com/join-our-panel/"),
    Row("Intact Qualitative Research", "Email-only", "https://www.iqrsf.com/participant-intake-form"),
    Row("Ivy Exec", "Browsable (login)", "https://ivyexec.com/jobs-and-research-studies-search?type=study"),
    Row("JC Research Partners", "Email-only", "https://jcresearchpartners.com/"),
    Row("JJA Research", "Browsable", "https://jjarecruiting.com/?post_type=project"),
    Row("L&E Research", "Browsable (login)", "https://www.leopinions.com/"),
    Row("Leede Research", "Browsable", "https://leedemn.com/join-our-database/available-studies/"),
    Row("Lees Focus", "Browsable", "https://leesfocusgroups.com/"),
    Row("Market-Ease (Market Eaze)", "Browsable", "https://www.market-ease.com/about-the-respondent-hub"),
    Row("Mars Research", "Email-only", "https://joinmarsresearch.com/"),
    Row("McCormick Group", "Email-only", "http://mccormick-group.com/market-research.html"),
    Row("Mediabarn Research", "Browsable", "https://www.mediabarnresearch.com/currentstudies/"),

    # --- OCH Batch 3 (25) ---
    Row("Mindswarms", "Browsable (login)", "https://app.mindswarms.com/sign_in"),
    Row("Murray Hill National", "Unclear", "https://panels.murrayhillnational.com/Portal/Default"),
    Row("N.C. Litigation & Jury Research Group", "Email-only", "https://ncfocusgroups.com/"),
    Row("NYC Focal (The Diamond Lists)", "Email-only", "https://thediamondlists.com/join-the-list/"),
    Row("Nashville Research Group", "Browsable", "https://www.nashvilleresearch.com/current-research-projects"),
    Row("Nationwide Research Recruiters", "Browsable", "https://www.nwrrs.com/focus-group-calendar.html"),
    # "Newton" on OCH could not be uniquely identified; likely a dupe of Newton Marketing Network. Keeping flagged.
    Row("Newton (ambiguous)", "Unclear", ""),
    Row("Newton Marketing Network", "Email-only", "https://newtonmarketingnetwork.com/participants/"),
    Row("Nichols Research", "Email-only", "https://nicholsresearch.com/registration-form/"),
    Row("Olympic National Research", "Unclear", "https://olympicnationalprojects.com/"),
    Row("Opinions LTD", "Email-only", "https://www.opinionsltd.com/participate/"),
    Row("Opinions for Cash", "Unclear", "https://opinionsforcash.com/"),
    Row("Orman Guidance", "Browsable", "https://ormanguidance.com/participate/projects/"),
    Row("People for Research", "Browsable (login)", "https://www.peopleforresearch.co.uk/participant/opportunities"),
    Row("Portable Insights", "Email-only", "https://portableinsights.com/join-our-panel"),
    Row("Precision Research", "Email-only", "https://www.opinionwizard.com/"),
    Row("Probe Market Research", "Browsable", "https://www.probemarket.com/available-studies/"),
    Row("Q-Insights", "Email-only", "https://q-insights.com/"),
    Row("Qual Recruit", "Email-only", "https://www.qualrecruit.com/become-a-participant"),
    Row("RRU Research", "Email-only", "https://focuspocussoftware.net/WP_RRU/Register"),
    Row("Real Focus Group", "Browsable", "https://realfocusgroup.com/upcoming/"),
    Row("Recruit and Field", "Email-only", "https://www.recruitandfield.com/register-as-a-participant"),
    Row("Research America", "Unclear", "https://researchamericainc.net/"),
    Row("Research Outloud", "Email-only", "https://researchoutloud.com/"),
    Row("Ridgeline Recruiting", "Email-only", "https://ridgelinerecruiting.com/"),

    # --- OCH Batch 4 (23) ---
    Row("Round2Research", "Email-only", "https://round2research.com/"),
    # SAGO / Schlesinger Associates / focusgroup.com all map to the same operation.
    Row("SAGO (Schlesinger / Focus Pointe Global)", "Browsable (login)", "https://www.focusgroup.com/"),
    Row("SIS Research", "Email-only", "https://participate.sisinternational.com/Portal/Default"),
    Row("Savvy Cooperative", "Browsable (login)", "https://apply.savvy.coop/"),
    Row("Spotlight Research", "Email-only", "https://spotlightmarketresearch.com/join-our-audience/"),
    Row("Take Part in Research", "Browsable", "https://takepartinresearch.co.uk/current-projects/"),
    Row("Taylor Research", "Unclear", "https://studies.taylorresearch.com/"),
    Row("The Insighters", "Browsable", "https://theinsighters.com/public-opportunities"),
    Row("The Social Question", "Browsable", "https://www.the-socialq.com/open-studies"),
    Row("Theoretics", "Browsable", "https://www.theoretics.co/current-projects"),
    # "Think Group" (Austin) operates participant-facing as Become A Thinker — already in original 20, skip dupe.
    Row("Truscott Research", "Unclear", "https://app.truscottresearch.com/register"),
    Row("Ubinsights", "Email-only", "https://ubinsights.com/"),
    Row("Uncover Research", "Email-only", "https://www.uncoverresearch.com/participate"),
    Row("uTest", "Browsable (login)", "https://www.utest.com/projects"),
    Row("View-Finders", "Email-only", "https://www.view-finders.net/participant-registration-2/"),
    Row("WAC Research", "Email-only", "https://wacresearch.com/data.html"),
    Row("Watch Me Think", "Email-only", "https://watchmethink.com/contribute"),
    Row("Watchlab", "Email-only", "https://watchlab.com/sign-up/"),
    Row("When Opinions Meet", "Unclear", ""),
    Row("Wilkins Research Services", "Email-only", "https://wilkinsresearch.net/join-our-panel/"),
    Row("Winn Winn Research", "Email-only", "https://winnwinn.com/new/public/register"),
    Row("focus 99", "Email-only", "https://www.focus99.com/sub/"),

    # --- New Batch 5 (from user dump, 23) ---
    Row("Act One Research", "Unclear", "https://www.actone-research.com"),
    Row("Amplify Research", "Email-only", "https://amplifyresearch.com/participate/"),
    Row("Apex Focus Group", "Browsable", "https://apexfocusgroup.com/"),
    Row("ATH Power Consulting", "Browsable (login)", "https://experienceapc.com/getting-started"),
    Row("Atkins Research", "Email-only", "https://www.atkinsresearch.com/research-participant/respondent-signup/"),
    Row("BestMark", "Browsable (login)", "https://secure.bestmark.com/public/application/appstart.aspx"),
    Row("Brightside Research Solutions", "Email-only", "https://teambrightsider.com/"),
    Row("CIC Testing", "Email-only", "https://www.cictesting.com/CIC/"),
    Row("Compass Research", "Email-only", "https://compassmarketingresearch.com/sign-up/"),
    Row("Confide Research", "Email-only", "https://confideresearch.com/Participants/signup"),
    Row("Contract Testing", "Email-only", "https://connect.contracttesting.com/ctimvc/Account/Register"),
    Row("Decision Point Research", "Email-only", "https://www.decisionpointresearch.ca"),
    Row("Engage In Depth", "Email-only", "https://engageindepth.com/participate/"),
    Row("Fleischman Field Research", "Email-only", "http://www.ffrsf.com/"),
    Row("Field Agent / Storesight", "Browsable (login)", "https://app.fieldagent.net/"),
    # Field Goals = backend of The Heard; merged into "The Heard" row above.
    Row("Field Voices", "Browsable", "https://fieldvoices.com/current_studies"),
    Row("Focus Group Panel", "Browsable", "https://focusgrouppanel.com/research-category/focus-group/"),
    Row("Focus Room", "Browsable", "https://focusroom.com/active-studies/"),
    Row("Ann Michaels / iShopForYou", "Browsable (login)", "https://ishopforyou.com/evaluator-login"),
    Row("Jackson Associates", "Browsable (login)", "https://research.jacksonassociates.com/"),
    Row("20/20 Panel", "Unclear", "https://join.2020panel.com/"),
    Row("KSS International", "Browsable (login)", "http://kernscheduling.com/"),

    # --- New Batch 6 (from user dump, 23) ---
    Row("Limelight by Shugoll", "Email-only", "https://limelightbyshugoll.com/get-paid-for-your-opinion/"),
    Row("Local Focus Group", "Email-only", "https://www.localfocusgroup.com/"),
    Row("MacConnell Research", "Unclear", "http://www.macconnellresearch.com/"),
    Row("MarketForce", "Browsable (login)", "https://shopper.marketforce.com/"),
    Row("MeThinks", "Browsable (login)", "https://www.methinks.io/thinker"),
    Row("MForce Research", "Email-only", "http://www.mforceresearch.com/"),
    Row("Moore Research Services", "Email-only", "https://www.moore-research.com/join-a-panel/"),
    Row("Moore Opinions", "Email-only", "http://mooreopinions.com/"),
    Row("MVG Recruiting", "Email-only", "https://mvgrecruiting.com/sign-up"),
    Row("NDR (National Data Research)", "Unclear", "http://www.national-data.net/"),
    Row("New England Focus Group", "Email-only", "https://www.newenglandfocusgroup.com/register.html"),
    Row("Online Verdict", "Email-only", "https://www.onlineverdict.com/jurors/signup/"),
    Row("Pragmatic Research", "Unclear", "http://www.pragmatic-research.com/"),
    Row("Prepare to Persuade", "Unclear", "https://www.preparetopersuade.com"),
    Row("Private Jury", "Browsable", "https://www.privatejury.com/"),
    Row("Product Tube", "Email-only", "https://web.producttube.com/signup"),
    Row("PVR Research", "Email-only", "http://www.pvr-research.com/"),
    Row("Rare Patient Voice", "Browsable", "https://rarepatientvoice.com/for-patients/study-opportunities/"),
    Row("Secret Shopper", "Browsable (login)", "https://www.secretshopper.com/shoppers/shoppers"),
    Row("Talking Heads", "Email-only", "http://register.talkingheadsstudio.com/"),
    Row("TrendSource", "Browsable (login)", "https://www.thesourceagents.com/"),
    Row("User Insight", "Email-only", "https://www.shareyourinsights.com/"),
    Row("Videochat Network", "Email-only", "https://www.videochatnetwork.net/sign-up/"),

    # --- Discovered in user's Gmail (last 12 months, not in OCH catalog) ---
    Row("Pulse Labs", "Browsable (login)", "https://app.pulselabs.ai/"),
    Row("Focus Group Finder", "Email-only", "https://focusgroups.org/"),
    Row("AlphaBuzz", "Email-only", "https://alphabuzz.alchemer.com/"),
    Row("EmCee Research", "Email-only", "https://emceeresearch.com/"),
    Row("Thurs Recruiting", "Email-only", "https://thursrecruiting.com/"),
    Row("Wynter", "Unclear", "https://wynter.com/panel"),
    Row("AMG Research", "Email-only", "https://amgsurvey.com/"),
    Row("TELUS Digital (research)", "Unclear", "https://www.telusinternational.com/"),
    Row("VGM (playtests)", "Email-only", "https://vgm.co/"),
    Row("CEC Surveys", "Email-only", "https://cecsurveys.com/"),
]


# Type-ordering for sort: most actionable first.
TYPE_ORDER = {
    "Browsable": 0,
    "Browsable (login)": 1,
    "Browsable (mobile app)": 2,
    "Unclear": 3,
    "Email-only": 4,
}


def _domain_key(url: str) -> str:
    if not url:
        return ""
    try:
        netloc = urlparse(url).netloc.lower()
    except ValueError:
        return url.lower()
    if netloc.startswith("www."):
        netloc = netloc[4:]
    return netloc


def dedupe(rows: list[Row]) -> list[Row]:
    """Collapse duplicates keyed by domain. Prefer the row with the strongest
    classification (Browsable > Browsable login > Browsable mobile > Unclear > Email-only)."""
    by_domain: dict[str, Row] = {}
    unkeyed: list[Row] = []
    for r in rows:
        key = _domain_key(r.url)
        if not key:
            unkeyed.append(r)
            continue
        existing = by_domain.get(key)
        if existing is None:
            by_domain[key] = r
        else:
            if TYPE_ORDER.get(r.type_, 99) < TYPE_ORDER.get(existing.type_, 99):
                by_domain[key] = r
    return list(by_domain.values()) + unkeyed


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    rows = dedupe(ALL_ROWS)
    rows.sort(key=lambda r: r.name.lower())

    # CSV
    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["Company", "Type", "URL"])
        for r in rows:
            w.writerow([r.name, r.type_, r.url])

    # XLSX
    wb = Workbook()
    ws = wb.active
    ws.title = "Recruiters"
    ws.append(["Company", "Type", "URL"])
    for cell in ws[1]:
        cell.font = Font(bold=True)

    link_font = Font(color="0563C1", underline="single")
    for r in rows:
        ws.append([r.name, r.type_, r.url])
        if r.url:
            url_cell = ws.cell(row=ws.max_row, column=3)
            url_cell.hyperlink = r.url
            url_cell.font = link_font

    for col, width in {1: 38, 2: 24, 3: 62}.items():
        ws.column_dimensions[get_column_letter(col)].width = width

    wb.save(XLSX_PATH)

    # Summary
    type_counts: dict[str, int] = {}
    for r in rows:
        type_counts[r.type_] = type_counts.get(r.type_, 0) + 1
    print(f"Wrote {XLSX_PATH} and {CSV_PATH} ({len(rows)} unique recruiters)")
    for t in sorted(type_counts, key=lambda x: TYPE_ORDER.get(x, 99)):
        print(f"  {t:30s} {type_counts[t]:3d}")


if __name__ == "__main__":
    main()
