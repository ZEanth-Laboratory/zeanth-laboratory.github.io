# Contributing

This repository is the paper archive for ZEanth Laboratory. All operations are fully automated using CLI scripts in the `scripts/` directory.

## 1. Adding a new paper

1. Run the interactive CLI helper script:
   ```bash
   node scripts/new-paper.mjs
   ```
   It will:
   - Calculate the next identifier in the `YYMM.NNNNN` format.
   - Ask for metadata (title, authors, categories, abstract, status).
   - Ask if you want to use the default CC-BY-SA-4.0 license or configure a custom license.
   - Prompt you for the path to the PDF file on disk.
   - Automatically update `papers.json`, create `pdf/{id}/` containing `v1.pdf` and a `LICENSE` file, and rebuild the site.

2. Commit and push your changes:
   ```bash
   git add . && git commit -m "Add paper 2601.00002" && git push
   ```

## 2. Bumping version of a paper

To publish a new version (e.g. `v2` or `v3`) of an existing paper:

1. Run the versioning script:
   ```bash
   node scripts/new-version.mjs
   ```
2. Select the paper, enter version note, select the PDF path, and optionally update details.
3. The script automatically updates history, bumps the version field, copies the PDF to `pdf/{id}/vN.pdf`, and rebuilds the site.

## 3. Managing existing papers

To edit metadata, delete entries, change statuses quickly, or check integrity:
```bash
node scripts/manage-paper.mjs
```

## 4. License configuration

Each paper can have its own license. If none is specified, it inherits the archive's default license (CC-BY-SA-4.0).
During paper creation, the license file is placed at `pdf/{id}/LICENSE`. The build script auto-detects it and links directly to its GitHub repository file path.

## Paper status values

| Status          | Meaning                                             |
|------------------|------------------------------------------------------|
| `preprint`       | Not yet submitted, or submitted but not yet reviewed |
| `under-review`   | Currently under peer review                          |
| `accepted`       | Accepted, publication pending                        |
| `published`      | Published — fill in `journalRef` and/or `doi`        |
| `withdrawn`      | Withdrawn by the authors                             |

## Category codes

Reuse the standard CS taxonomy codes (`cs.CV`, `cs.LG`, `cs.AI`, `cs.CL`, ...). The full list lives in the `"categories"` array in `papers.json`.

## Design changes

Shared styling lives in `assets/style.css`. Please keep changes there so listing, abstract, and PDF viewer pages stay visually consistent.

