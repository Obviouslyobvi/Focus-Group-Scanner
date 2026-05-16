"""Build a minimal Excel spreadsheet of recruiter sites with clickable URLs."""

from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter

OUT_PATH = Path(__file__).resolve().parent.parent / "docs" / "recruiters.xlsx"

# (Company, Type, Best URL)
# Best URL = the studies/listings URL if browsable, otherwise the main URL.
ROWS = [
    ("Accelerant Research", "Browsable", "https://www.accelerantresearch.com/availableresearch"),
    ("Reckner", "Email-only", "https://www.reckner.com"),
    ("The Heard", "Email-only", "https://www.betheheard.com"),
    ("Opinions Link", "Email-only", "https://www.opinionslink.com"),
    ("Opinions by Sync", "Browsable", "https://community.opinionsbysync.com/s/Jobsite"),
    ("Galloway Research", "Browsable", "https://www.questionspace.net/category/upcoming-studies/"),
    ("User Interviews", "Browsable", "https://www.userinterviews.com/studies"),
    ("Daisy Mae Research", "Browsable", "https://daisymaeresearch.com/projects/"),
    ("PRC", "Browsable", "https://www.prcmarketresearch.com/upcomingprojects"),
    ("Nelson Recruiting", "Email-only", "https://nelsonrecruiting.com"),
    ("User Research International", "Browsable (login)", "https://app.uriux.com/studies"),
    ("Become A Thinker", "Browsable", "https://becomeathinker.com/upcoming-studies/"),
    ("10K Voices", "Unclear", "https://community.10kvoices.com"),
    ("Adler Weiner Research", "Email-only", "https://adlerweiner.com"),
    ("Advanced Focus", "Unclear", "https://ow.advancedfocus.com"),
    ("Advanced Opinions", "Unclear", "http://register.advancedopinions.com"),
    ("Respondent", "Browsable (login)", "https://app.respondent.io/respondents/v2/projects/browse"),
    ("Prolific", "Browsable (login)", "https://app.prolific.com/"),
    ("dscout", "Browsable (mobile app)", "https://dscout.com"),
    ("Fieldwork", "Email-only", "https://www.fieldwork.com"),
]

HEADERS = ["Company", "Type", "URL"]
LINK_FONT = Font(color="0563C1", underline="single")
BOLD = Font(bold=True)


def main() -> None:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    wb = Workbook()
    ws = wb.active
    ws.title = "Recruiters"

    ws.append(HEADERS)
    for cell in ws[1]:
        cell.font = BOLD

    for company, type_, url in ROWS:
        ws.append([company, type_, url])
        url_cell = ws.cell(row=ws.max_row, column=3)
        url_cell.hyperlink = url
        url_cell.font = LINK_FONT

    widths = {1: 30, 2: 22, 3: 60}
    for col, width in widths.items():
        ws.column_dimensions[get_column_letter(col)].width = width

    wb.save(OUT_PATH)
    print(f"Wrote {OUT_PATH} ({len(ROWS)} recruiters)")


if __name__ == "__main__":
    main()
