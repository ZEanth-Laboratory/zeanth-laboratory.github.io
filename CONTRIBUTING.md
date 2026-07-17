# Contributing

This repository is the paper archive for ZEanth Laboratory. Most
contributions fall into one of two categories below.

## 1. Adding a new paper

1. Run the helper script to get the next identifier and a JSON
   skeleton:

   ```bash
   node scripts/new-paper.mjs
   ```

   It will ask a few questions (title, authors, categories, abstract,
   status, ...) and print a ready-to-paste JSON object, along with the
   next free identifier in the `YYMM.NNNNN` format (year + month of
   submission + a serial number).

2. Paste the printed object into the `"papers"` array in
   [`papers.json`](./papers.json).

3. Copy the PDF file into `pdf/`, named exactly after the identifier:

   ```
   pdf/2601.00002.pdf
   ```

   If the PDF isn't ready yet, that's fine — the entry will simply
   show a "PDF pending" state until the file is added.

4. Commit and push to `main`. The GitHub Actions workflow
   (`.github/workflows/deploy.yml`) automatically:
   - generates `abs/2601.00002/index.html` (the permalink abstract
     page),
   - rebuilds `pdf-manifest.json`, `sitemap.xml`, and `rss.xml`,
   - deploys everything to GitHub Pages.

   You do not need to run the build script yourself before pushing —
   but you can, if you want to preview the generated pages locally:

   ```bash
   node scripts/build.mjs
   ```

## 2. Updating an existing paper (new version)

Versioned archives keep every version. To publish `v2` of a paper:

1. Update the fields that changed in `papers.json` (title, abstract,
   status, etc.) and bump `"version"` to `"v2"`.
2. Append a new entry to that paper's `"history"` array:

   ```json
   { "version": "v2", "date": "2026-03-01", "note": "Revised after peer review" }
   ```

3. If the PDF changed, either overwrite `pdf/{id}.pdf`, or keep
   versioned files (`pdf/2601.00001v1.pdf`, `pdf/2601.00001v2.pdf`)
   and link to the latest one from `papers.json` — either convention
   works, just stay consistent.

## Paper status values

| Status          | Meaning                                             |
|------------------|------------------------------------------------------|
| `preprint`       | Not yet submitted, or submitted but not yet reviewed |
| `under-review`   | Currently under peer review                          |
| `accepted`       | Accepted, publication pending                        |
| `published`      | Published — fill in `journalRef` and/or `doi`        |
| `withdrawn`      | Withdrawn by the authors                             |

## Category codes

Reuse the standard CS taxonomy codes (`cs.CV`, `cs.LG`, `cs.AI`,
`cs.CL`, ...). The full list currently offered in the filter dropdown
lives in the `"categories"` array at the top of `papers.json` — add a
new one there if you need a code that isn't listed yet.

## Design changes

Shared styling lives in `assets/style.css` and is used by both the
listing page and every generated abstract page — please keep changes
there so the two stay visually consistent, rather than adding
page-specific overrides.
