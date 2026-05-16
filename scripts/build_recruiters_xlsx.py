"""Build an Excel spreadsheet of recruiter sites with clickable URLs."""

from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

OUT_PATH = Path(__file__).resolve().parent.parent / "docs" / "recruiters.xlsx"

# (Name, Classification, Subtype, Main URL, Studies URL, Login required, Evidence)
ROWS = [
    ("Accelerant Research", "BROWSABLE", "Public",
     "https://www.accelerantresearch.com",
     "https://www.accelerantresearch.com/availableresearch",
     "No",
     'Dedicated /availableresearch page titled "Paid Research Studies"; panel members also receive email invites.'),
    ("Reckner", "EMAIL-ONLY", "",
     "https://www.reckner.com", "", "",
     'FAQ explicitly states "no member dashboard you can log in to" — studies are emailed when profile matches.'),
    ("The Heard", "EMAIL-ONLY", "",
     "https://www.betheheard.com", "", "",
     "FAQ: watch for emails from their research team with links to studies; no public studies page."),
    ("Opinions Link", "EMAIL-ONLY", "",
     "https://www.opinionslink.com", "", "",
     "Only /get-involved signup + portal.opinionslink.com/register; studies promoted via social/email."),
    ("Opinions by Sync", "BROWSABLE", "Public",
     "https://opinionsbysync.com",
     "https://community.opinionsbysync.com/s/Jobsite",
     "No",
     'Community site has a public "Jobs" page plus individual study landing pages.'),
    ("Galloway Research", "BROWSABLE", "Public",
     "https://www.gallowayresearch.com",
     "https://www.questionspace.net/category/upcoming-studies/",
     "No",
     'Panel site QuestionSpace has a public "Upcoming Studies" category with current posts.'),
    ("User Interviews", "BROWSABLE", "Public (apply needs login)",
     "https://www.userinterviews.com",
     "https://www.userinterviews.com/studies",
     "Apply only",
     "Public studies feed showing 2,500+ studies/month with titles, pay, format filters."),
    ("Daisy Mae Research", "BROWSABLE", "Public",
     "https://daisymaeresearch.com",
     "https://daisymaeresearch.com/projects/",
     "No",
     "Dedicated /projects/ archive lists individual studies."),
    ("PRC", "BROWSABLE", "Public",
     "https://www.prcmarketresearch.com",
     "https://www.prcmarketresearch.com/upcomingprojects",
     "No",
     "/upcomingprojects page lists titled studies with dates, lengths, incentive amounts."),
    ("Nelson Recruiting", "EMAIL-ONLY", "",
     "https://nelsonrecruiting.com", "", "",
     'Only a registration form; notifications come "by email, text, or phone" once profile matches.'),
    ("User Research International", "BROWSABLE", "Login required",
     "https://www.uriux.com",
     "https://app.uriux.com/studies",
     "Yes",
     "Participant portal shows all currently open studies once logged in."),
    ("Become A Thinker", "BROWSABLE", "Public",
     "https://becomeathinker.com",
     "https://becomeathinker.com/upcoming-studies/",
     "No",
     "Public /upcoming-studies/ page lists studies with topic and pay."),
    ("10K Voices", "UNCLEAR", "Likely login",
     "https://www.10kvoices.com",
     "https://community.10kvoices.com",
     "Likely yes",
     "Community platform exists; FAQ implies logged-in dashboard but also email outreach. Verify with account."),
    ("Adler Weiner Research", "EMAIL-ONLY", "",
     "https://adlerweiner.com", "", "",
     "/participate-in-market-research is sign-up only; matching/screening done via email and phone."),
    ("Advanced Focus", "UNCLEAR", "Likely login",
     "https://advancedfocus.com",
     "https://ow.advancedfocus.com",
     "Yes",
     "OpinionWizard portal requires login; likely browsable behind login but unverified."),
    ("Advanced Opinions", "UNCLEAR", "Likely login",
     "https://www.advancedopinions.com",
     "http://register.advancedopinions.com",
     "Likely yes",
     "Marketing site only; separate registration portal exists, browsability unconfirmed."),
    ("Respondent", "BROWSABLE", "Login required",
     "https://www.respondent.io",
     "https://app.respondent.io/respondents/v2/projects/browse",
     "Yes",
     "Logged-in participant dashboard with browsable paid projects matching profile."),
    ("Prolific", "BROWSABLE", "Login required",
     "https://www.prolific.com",
     "https://app.prolific.com/",
     "Yes",
     'Logged-in dashboard lists currently available studies with pay/duration/description. "Prolific Assistant" extension is prior art.'),
    ("dscout", "BROWSABLE", "Mobile app only",
     "https://dscout.com",
     "(Scout mobile app — Explore tab)",
     "Yes (app)",
     'Participants browse the "Explore" tab in the Scout mobile app — no public web URL.'),
    ("Fieldwork", "EMAIL-ONLY", "",
     "https://www.fieldwork.com", "", "",
     "Registration matches profiles to studies; system sends pre-screener link — no browsable board."),
]

HEADERS = ["#", "Company", "Classification", "Subtype", "Main URL", "Studies URL", "Login required", "Evidence / notes"]

CLASS_FILL = {
    "BROWSABLE": PatternFill(start_color="DCFCE7", end_color="DCFCE7", fill_type="solid"),
    "EMAIL-ONLY": PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid"),
    "UNCLEAR": PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid"),
}
HEADER_FILL = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
HEADER_FONT = Font(color="FFFFFF", bold=True)
LINK_FONT = Font(color="1D4ED8", underline="single")


def main() -> None:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    wb = Workbook()
    ws = wb.active
    ws.title = "Recruiters"

    ws.append(HEADERS)
    for cell in ws[1]:
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.alignment = Alignment(vertical="center")

    for idx, (name, cls, subtype, main_url, studies_url, login, evidence) in enumerate(ROWS, start=1):
        row = idx + 1
        ws.cell(row=row, column=1, value=idx)
        ws.cell(row=row, column=2, value=name)
        cls_cell = ws.cell(row=row, column=3, value=cls)
        cls_cell.fill = CLASS_FILL.get(cls, PatternFill())
        ws.cell(row=row, column=4, value=subtype)

        main_cell = ws.cell(row=row, column=5, value=main_url)
        if main_url:
            main_cell.hyperlink = main_url
            main_cell.font = LINK_FONT

        studies_cell = ws.cell(row=row, column=6, value=studies_url)
        if studies_url and studies_url.startswith("http"):
            studies_cell.hyperlink = studies_url
            studies_cell.font = LINK_FONT

        ws.cell(row=row, column=7, value=login)
        ws.cell(row=row, column=8, value=evidence).alignment = Alignment(wrap_text=True, vertical="top")

    widths = {1: 4, 2: 28, 3: 14, 4: 28, 5: 38, 6: 56, 7: 14, 8: 70}
    for col, width in widths.items():
        ws.column_dimensions[get_column_letter(col)].width = width

    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions

    wb.save(OUT_PATH)
    print(f"Wrote {OUT_PATH} ({len(ROWS)} recruiters)")


if __name__ == "__main__":
    main()
