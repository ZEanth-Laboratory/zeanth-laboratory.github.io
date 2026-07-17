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
├── pdf/                       → drop PDFs here, named {id}.pdf
├── abs/                       → generated permalink pages (one folder per id)
├── templates/abs.template.html→ HTML template used to generate abs/ pages
├── assets/
│   ├── style.css              → shared styling for every page
│   ├── common.js               → shared helpers (badges, BibTeX, dates)
│   └── listing.js              → listing page logic (search/filter/pagination)
├── scripts/
│   ├── build.mjs               → generates abs/ pages, manifest, sitemap, rss
│   └── new-paper.mjs           → interactive helper to scaffold a new entry
└── .github/workflows/deploy.yml→ CI: build + deploy to GitHub Pages
```

## Adding a paper

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the full walkthrough.
In short:

```bash
node scripts/new-paper.mjs      # prompts you and prints a ready-to-paste entry
# paste the entry into papers.json
# copy the PDF into pdf/{id}.pdf
git add . && git commit -m "Add paper 2601.00002" && git push
```

Pushing to `main` is enough — GitHub Actions builds and deploys the
rest.

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
