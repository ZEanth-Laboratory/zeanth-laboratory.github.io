# ZEanth Laboratory — Paper Archive

A minimal, self-hosted paper archive for ZEanth Laboratory's computer
science research, built as a static site for GitHub Pages — no
server, no database, no build tool beyond a small Node script that
GitHub Actions runs for you.

**Live site:** https://zeanth.github.io

## What this is

- A **listing page** (`/`) with search, category/status/year filters,
  sorting, and pagination.
- A dedicated, permanent **abstract page per paper**
  (`/abs/2601.00001`) —
  each with its own identifier, status, categories, submission
  history, BibTeX citation, and links to the PDF/DOI/code/dataset.
- Papers are identified by a **structured ID**, `YYMM.NNNNN`
  (submission year + month, plus a serial number), instead of a raw
  PDF filename.
- A **paper status** field (`preprint`, `under-review`, `accepted`,
  `published`, `withdrawn`) shown as a badge everywhere the paper
  appears, so visitors always know where a paper stands.
- `sitemap.xml` and `rss.xml` are generated automatically so the
  archive is crawlable and can be followed with a feed reader.

## How it works

Everything is driven by a **single source of truth**: [`papers.json`](./papers.json).
A tiny, dependency-free Node script ([`scripts/build.mjs`](./scripts/build.mjs))
reads that file and generates the static abstract pages, the PDF
availability manifest, the sitemap and the RSS feed. A GitHub Actions
workflow ([`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml))
runs that script on every push to `main` and deploys the result to
GitHub Pages — so you never have to remember to run a build command.

```
├── index.html                 → the listing page (fetches papers.json)
├── papers.json                → single source of truth for all papers
├── pdf/                       → contains paper folders with versioned PDFs and LICENSE files
├── abs/                       → generated permalink abstract pages (one folder per id)
├── templates/
│   ├── abs.template.html      → HTML template used to generate abs/ pages
│   └── pdf.template.html      → HTML template used to generate pdf/ viewer pages
├── assets/
│   ├── style.css              → shared styling for every page
│   ├── common.js               → shared helpers (badges, BibTeX, dates)
│   └── listing.js              → listing page logic (search/filter/pagination)
├── scripts/
│   ├── build.mjs               → generates abs/ and pdf/ pages, manifest, sitemap, rss, with validation
│   ├── new-paper.mjs           → interactive CLI to add new papers and copy PDF/LICENSE files
│   ├── new-version.mjs         → interactive CLI to publish new versions and bump history
│   └── manage-paper.mjs        → interactive CLI to list, edit, status-update, delete, and validate papers
└── .github/workflows/deploy.yml→ CI: build + deploy to GitHub Pages
```

## Adding and Managing Papers

All operations are automated using helper scripts in the `scripts/` directory:

1. **Adding a paper**:
   Run the interactive helper to scaffold folders, configure license settings, place the PDF/LICENSE, update `papers.json`, and rebuild the site:
   ```bash
   node scripts/new-paper.mjs
   ```

2. **Publishing a new version**:
   To bump paper version (e.g. `v1` -> `v2`), update abstract details, place the new PDF, and record history:
   ```bash
   node scripts/new-version.mjs
   ```

3. **Managing existing papers**:
   To list, edit metadata, update status quickly, delete papers, or validate repository integrity:
   ```bash
   node scripts/manage-paper.mjs
   ```

Pushing to `main` is enough — GitHub Actions builds and deploys the rest.

## Deploying this repository yourself

1. Push this repository to GitHub (any name is fine).
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main` — the included workflow builds the site and
   publishes it automatically. No `gh-pages` branch, no manual steps.
4. Update the `"archive"` block at the top of `papers.json`
   (`name`, `url`, `github`, `logo`, ...) to match your own lab/repo.

### Running the build locally (optional)

You don't need Node installed to just browse or edit `papers.json` —
GitHub Actions builds the site for you. But if you want to preview
the generated abstract pages locally before pushing:

```bash
node scripts/build.mjs
python3 -m http.server 8000   # or any static file server
# open http://localhost:8000
```

(A local static server is required because the listing page fetches
`papers.json` via `fetch()`, which most browsers block on `file://`
URLs.)

## Design

The visual language is intentionally quiet: a single accent-free
black-on-white palette, `Inter` for text and `JetBrains Mono` for
identifiers/metadata, hairline dividers instead of cards or shadows.
Status badges use one small dot of colour each so the archive stays
scannable without turning into a dashboard. All of it lives in
[`assets/style.css`](./assets/style.css) and is shared by the listing
page and every generated abstract page, so the two never drift apart
visually.

## License

The site's source code is released under the [AGPL-3.0 License](./LICENSE).
This does **not** apply to the papers, PDFs, or research content
hosted here — copyright of each paper remains with its authors and/or
publisher.
