# Ground D — Adhikari and Sewadal entry/exit

79th Sant Nirankari Samagam.

Reads the **Ground D - Adhikari and Sewadal Entry Form** Google Sheet (fed by the
Zoho form) and shows how many Adhikari and Sewadal are in Ground D on any chosen
date, khetra by khetra. The sheet is the only store; nothing is written back.

- Entry / exit form: https://zfrmz.in/GvDQrMJjrgozf1613747
- Google Sheet: https://docs.google.com/spreadsheets/d/1KMSB1gbex_miVM1agjj0MJAcaXxsu8j2PGVThb3wBkw/edit?usp=sharing

Both links are shown at the top of the page. To point this build at another
ground, edit `CONFIG` at the top of the script in `index.html` and the ids in
`api/sheet.js` (or the env vars below).

## Sheet columns (as Zoho writes them)

| Zoho column | Read as |
|---|---|
| Added Time | timestamp (fallback date only) |
| IP Address | ignored |
| Enter the date of Entry/Exit | date |
| Select the Khetra | khetra |
| Unit Name | unit (optional) |
| Enter the count of Adhikari Male | adhikari male |
| Enter the count of Male Sewadal | males |
| Enter the count of Adhikari Female | adhikari female |
| Enter the count of Female Sewadal | females |
| Select the current status | Entry / Exit |

Columns are matched by the words in the header, not position, so Zoho's column
order can change. Adhikari columns are matched first, so "Adhikari Male" is never
counted as a male sewadal. Blank counts are 0.

## Dates

Accepts `21-Sep-2026` (Zoho's default), `21 Sep 2026`, `Sep 21, 2026`,
`2026-09-21`, and numeric `21/09/2026` or `9/21/2026`. For numeric dates the page
works out day-first vs month-first from the data itself — any value like `21/09`
or `9/21` settles it. With only ambiguous values (`05/10/2026`) it assumes
day-first (`CONFIG.dateOrder`).

## How the count works

For a chosen date D, every row with date ≤ D is taken, and each of the four counts
is netted on its own:

```
count = Σ where status = Entry  −  Σ where status = Exit
total = adhikari male + males + adhikari female + females
```

## Screens

- **Board** — khetra cards with total, male/female split bar, and AM · M · AF · F; tap for units.
- **Khetra table** — Total, Adhikari M, Males, Adhikari F, Females, In, Out, Last; sortable, with a ground total row.
- **Male / female** — split per khetra, highest and lowest female share, top units.
- **Trend** — strength across the Samagam, peak, day-by-day in/out.
- **Log** — every row up to the chosen date.
- **Message** — the attendance message, one line per khetra as `AM+M+AF+F=total`, ready to copy or send on WhatsApp.
- **Print / A4 PDF** — prints the open tab with a dated masthead.

## Deploy

```bash
git init && git add . && git commit -m "Ground D board"
git remote add origin git@github.com:<you>/ground-d-sewadal.git
git push -u origin main
```

Vercel: New Project → import the repo → Deploy. No build step.

Optional env vars (the Ground D sheet is the built-in fallback):

| Name | Value |
|---|---|
| `SHEET_PUBLISH_ID` | `2PACX-1vRH_CceBQ0JoPCB47tr_Up3NpZ3xdXa8bbWpQJmqlsZjwBqNL5PUFsEF2DY7Zt-Iex7tJFRWlv5vU2b` |
| `SHEET_DOC_ID` | `1KMSB1gbex_miVM1agjj0MJAcaXxsu8j2PGVThb3wBkw` |
| `SHEET_GID` | `0` |

The sheet must stay published: File → Share → Publish to web → Entire document.
