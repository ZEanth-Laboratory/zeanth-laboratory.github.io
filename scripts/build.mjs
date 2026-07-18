#!/usr/bin/env node
/**
 * ZEanth Laboratory — build script
 * ------------------------------------------------------------
 * Reads papers.json and generates, for every paper:
 *   - abs/{id}/index.html   (permalink abstract page)
 *   - pdf/{id}/index.html   (PDF viewer page, if PDF exists)
 * Also generates:
 *   - pdf-manifest.json     (list of paper IDs that have a PDF uploaded)
 *   - sitemap.xml
 *   - rss.xml
 *
 * Usage:
 *   node scripts/build.mjs
 *
 * Zero external dependencies — only Node's built-in fs/path modules.
 * Safe to run repeatedly (idempotent).
 * ------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const PAPERS_JSON = path.join(ROOT, 'papers.json');
const TEMPLATE_PATH = path.join(ROOT, 'templates', 'abs.template.html');
const PDF_TEMPLATE_PATH = path.join(ROOT, 'templates', 'pdf.template.html');
const ABS_DIR = path.join(ROOT, 'abs');
const PDF_DIR = path.join(ROOT, 'pdf');

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d.getDate()).padStart(2,'0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

const STATUS_LABELS = {
  'preprint': 'Preprint',
  'under-review': 'Under Review',
  'accepted': 'Accepted',
  'published': 'Published',
  'withdrawn': 'Withdrawn'
};

function statusBadge(status) {
  const label = STATUS_LABELS[status] || status;
  return `<span class="badge badge-${escapeHtml(status)}">${escapeHtml(label)}</span>`;
}

function categoryTags(categories) {
  return (categories || []).map(c => `<span class="tag mono">${escapeHtml(c)}</span>`).join('');
}

function bibDate(iso) {
  if (!iso) return { year: '' };
  return { year: new Date(iso + 'T00:00:00').getFullYear() };
}

function buildBibtex(paper, archive) {
  const firstAuthorLast = (paper.authors[0] || 'anonymous').split(' ').pop().toLowerCase().replace(/[^a-z]/g, '');
  const { year } = bibDate(paper.submittedDate);
  const key = `${firstAuthorLast}${year}${paper.id.replace(/[^0-9]/g, '')}`;
  const authors = (paper.authors || []).join(' and ');
  return [
    `@misc{${key},`,
    `      title={${paper.title}},`,
    `      author={${authors}},`,
    `      year={${year}},`,
    `      eprint={${paper.id}},`,
    `      archivePrefix={${archive.shortName}},`,
    `      primaryClass={${(paper.categories || [])[0] || 'cs'}}`,
    `}`
  ].join('\n');
}

/* ──────────────────────────────────────────────
   PDF helpers — versioned structure: pdf/{id}/v1.pdf, v2.pdf, …
   ────────────────────────────────────────────── */

/**
 * Detect all PDF versions for a paper.
 * Checks for versioned files (v1.pdf, v2.pdf, …) and
 * legacy non-versioned file ({id}.pdf).
 * Returns array of version strings found, e.g. ['v1','v2'].
 */
function detectPdfVersions(id) {
  const pdfDir = path.join(PDF_DIR, id);
  const versions = [];

  // Check for versioned files inside pdf/{id}/ directory
  if (fs.existsSync(pdfDir) && fs.statSync(pdfDir).isDirectory()) {
    const files = fs.readdirSync(pdfDir);
    for (const f of files) {
      const m = f.match(/^v(\d+)\.pdf$/i);
      if (m) versions.push({ num: parseInt(m[1], 10), label: `v${m[1]}` });
    }
  }

  // Also check for legacy flat file pdf/{id}.pdf — treat as v1
  const legacyFile = path.join(PDF_DIR, `${id}.pdf`);
  if (versions.length === 0 && fs.existsSync(legacyFile)) {
    // Migrate: move legacy file into the versioned directory structure
    fs.mkdirSync(pdfDir, { recursive: true });
    fs.renameSync(legacyFile, path.join(pdfDir, 'v1.pdf'));
    versions.push({ num: 1, label: 'v1' });
    console.log(`  migrated pdf/${id}.pdf → pdf/${id}/v1.pdf`);
  }

  versions.sort((a, b) => a.num - b.num);
  return versions.map(v => v.label);
}

function hasPdf(id) {
  return detectPdfVersions(id).length > 0;
}

function latestPdfVersion(id) {
  const versions = detectPdfVersions(id);
  return versions.length > 0 ? versions[versions.length - 1] : null;
}

function btn(href, label, disabled, note) {
  if (disabled) {
    return `<span class="btn disabled" title="${escapeHtml(note || 'Not available')}">${escapeHtml(label)}</span>`;
  }
  return `<a class="btn ${label === 'View PDF' ? 'btn-primary' : ''}" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

function renderTemplate(tpl, vars) {
  let out = tpl;
  for (const [key, val] of Object.entries(vars)) {
    out = out.split(`{{${key}}}`).join(val ?? '');
  }
  return out;
}

/* ──────────────────────────────────────────────
   License helpers
   ────────────────────────────────────────────── */

function buildLicenseSection(paper, archive) {
  const license = paper.license || archive.defaultPaperLicense;
  if (!license) {
    return '<div class="license-info" style="color:var(--muted)">No license information available.</div>';
  }
  const spdx = escapeHtml(license.spdx || '');
  const name = escapeHtml(license.name || spdx);
  const url = license.url || '';
  const isDefault = !paper.license;

  const archiveRepo = `${archive.github.replace(/\/$/, '')}/${archive.url.replace(/^https?:\/\//, '').replace(/\/.*/,'')}`;

  const licenseFile = paper.license?.licenseFile || archive.defaultPaperLicense?.licenseFile || 'LICENSE';
  const localLicensePath = path.join(PDF_DIR, paper.id, licenseFile);
  const hasLocalFile = fs.existsSync(localLicensePath);

  let licenseFileUrl = paper.license?.licenseFileUrl || archive.defaultPaperLicense?.licenseFileUrl || null;

  if (hasLocalFile) {
    if (!licenseFileUrl) {
      licenseFileUrl = `${archiveRepo}/blob/main/pdf/${paper.id}/${licenseFile}`;
    }
  } else {
    if (paper.license?.licenseFile) {
      console.warn(`  Warning: licenseFile "${licenseFile}" configured for paper ${paper.id} but not found at pdf/${paper.id}/${licenseFile}`);
    }
    if (licenseFileUrl) {
      console.warn(`  Warning: licenseFileUrl configured for paper ${paper.id} but local license file not found at pdf/${paper.id}/${licenseFile}`);
    }
  }

  const targetUrl = licenseFileUrl || url;

  let html = '<div class="license-info">';
  html += `<span class="license-badge">${spdx}</span>`;
  if (targetUrl) {
    html += `<a href="${escapeHtml(targetUrl)}" target="_blank" rel="noopener">${name}</a>`;
  } else {
    html += name;
  }
  if (isDefault) {
    html += ' <span style="color:var(--muted); font-size:12.5px;">(archive default)</span>';
  }
  html += '</div>';
  return html;
}

/* ──────────────────────────────────────────────
   Abstract page builder
   ────────────────────────────────────────────── */

function buildAbsPage(paper, archive, template) {
  const primaryCategory = (paper.categories || [])[0] || 'cs';
  const pdfAvailable = hasPdf(paper.id);

  const commentsRow = paper.comments
    ? `<dt>Comments</dt><dd>${escapeHtml(paper.comments)}</dd>` : '';
  const journalRefRow = paper.journalRef
    ? `<dt>Journal ref.</dt><dd>${escapeHtml(paper.journalRef)}</dd>` : '';
  const doiRow = paper.doi
    ? `<dt>DOI</dt><dd><a href="https://doi.org/${escapeHtml(paper.doi)}" target="_blank" rel="noopener">${escapeHtml(paper.doi)}</a></dd>` : '';

  // Build history rows with version PDF links
  const pdfVersions = detectPdfVersions(paper.id);
  const historyRows = (paper.history || []).map(h => {
    const versionLabel = escapeHtml(h.version);
    const hasThisVersion = pdfVersions.includes(h.version);
    const versionLink = hasThisVersion
      ? `<td><a class="version-link" href="../../pdf/${encodeURIComponent(paper.id)}?version=${encodeURIComponent(h.version)}">View PDF</a></td>`
      : '<td></td>';
    return `
    <tr><td class="mono">${versionLabel}</td><td>${formatDate(h.date)}</td><td>${escapeHtml(h.note || '')}</td>${versionLink}</tr>
  `;
  }).join('');

  const pdfButton = btn(`../../pdf/${paper.id}`, 'View PDF', !pdfAvailable, 'PDF not yet uploaded — check back soon');
  const codeButton = paper.codeUrl ? btn(paper.codeUrl, 'Code') : '';
  const datasetButton = paper.datasetUrl ? btn(paper.datasetUrl, 'Dataset') : '';
  const doiButton = paper.doi ? btn(`https://doi.org/${paper.doi}`, 'View DOI') : '';

  const repoUrl = archive.github.replace(/\/$/, '') + '/' + archive.url.replace(/^https?:\/\//, '').split('/').pop();
  // Build repo URL: e.g. https://github.com/zeanth + zeanth.github.io
  const archiveRepo = `${archive.github.replace(/\/$/, '')}/${archive.url.replace(/^https?:\/\//, '').replace(/\/.*/,'')}`;

  const vars = {
    ID: escapeHtml(paper.id),
    VERSION: escapeHtml(paper.version || 'v1'),
    TITLE: escapeHtml(paper.title),
    AUTHORS: escapeHtml((paper.authors || []).join(', ')),
    STATUS_BADGE: statusBadge(paper.status),
    CATEGORY_TAGS: categoryTags(paper.categories),
    ABSTRACT: escapeHtml(paper.abstract),
    SUBMITTED_DATE_FMT: formatDate(paper.submittedDate),
    COMMENTS_ROW: commentsRow,
    JOURNALREF_ROW: journalRefRow,
    DOI_ROW: doiRow,
    PDF_BUTTON: pdfButton,
    CODE_BUTTON: codeButton,
    DATASET_BUTTON: datasetButton,
    DOI_BUTTON: doiButton,
    HISTORY_ROWS: historyRows,
    BIBTEX: escapeHtml(buildBibtex(paper, archive)),
    LICENSE_SECTION: buildLicenseSection(paper, archive),
    ARCHIVE_NAME: escapeHtml(archive.name),
    ARCHIVE_SHORT: escapeHtml(archive.shortName),
    ARCHIVE_TAGLINE: escapeHtml(archive.tagline),
    ARCHIVE_LOGO: archive.logo,
    ARCHIVE_GITHUB: archive.github,
    ARCHIVE_REPO: archiveRepo,
    PRIMARY_CATEGORY: escapeHtml(primaryCategory),
    META_DESCRIPTION: escapeHtml((paper.abstract || '').slice(0, 180)),
    CANONICAL_URL: `${archive.url.replace(/\/$/, '')}/abs/${paper.id}`
  };

  return renderTemplate(template, vars);
}

/* ──────────────────────────────────────────────
   PDF viewer page builder (PDF.js-based)
   ────────────────────────────────────────────── */

function escapeJsString(str) {
  return String(str ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

function buildPdfViewerPage(paper, archive, versions, template) {
  const latestVersion = versions[versions.length - 1];
  const versionsJson = JSON.stringify(versions);
  const archiveRepo = `${archive.github.replace(/\/$/, '')}/${archive.url.replace(/^https?:\/\//, '').replace(/\/.*/,'')}`;
  const primaryCategory = (paper.categories || [])[0] || 'cs';

  let versionSelectHtml = '';
  if (versions.length > 1) {
    versionSelectHtml = `
        <select class="version-select" id="versionSelect">
          ${versions.map(v => `<option value="${escapeHtml(v)}"${v === latestVersion ? ' selected' : ''}>${escapeHtml(v).toUpperCase()}</option>`).join('')}
        </select>`;
  }

  const vars = {
    ID: escapeHtml(paper.id),
    TITLE: escapeHtml(paper.title),
    TITLE_JS: escapeJsString(paper.title),
    ARCHIVE_NAME: escapeHtml(archive.name),
    ARCHIVE_LOGO: archive.logo,
    ARCHIVE_TAGLINE: escapeHtml(archive.tagline),
    ARCHIVE_SHORT: escapeHtml(archive.shortName),
    ARCHIVE_GITHUB: archive.github,
    ARCHIVE_REPO: archiveRepo,
    PRIMARY_CATEGORY: escapeHtml(primaryCategory),
    LATEST_VERSION: escapeHtml(latestVersion),
    LATEST_VERSION_UPPER: escapeHtml(latestVersion).toUpperCase(),
    VERSIONS_JSON: versionsJson,
    VERSION_SELECT: versionSelectHtml
  };

  return renderTemplate(template, vars);
}

/* ──────────────────────────────────────────────
   Sitemap & RSS builders
   ────────────────────────────────────────────── */

function buildSitemap(papers, archive) {
  const base = archive.url.replace(/\/$/, '');
  const urls = [
    `${base}/`,
    ...papers.map(p => `${base}/abs/${p.id}`),
    ...papers.filter(p => hasPdf(p.id)).map(p => `${base}/pdf/${p.id}`)
  ];
  const body = urls.map(u => `  <url><loc>${u}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function buildRss(papers, archive) {
  const base = archive.url.replace(/\/$/, '');
  const sorted = [...papers].sort((a, b) => b.submittedDate.localeCompare(a.submittedDate));
  const items = sorted.map(p => `
  <item>
    <title>${escapeHtml(p.title)}</title>
    <link>${base}/abs/${p.id}</link>
    <guid>${base}/abs/${p.id}</guid>
    <pubDate>${new Date(p.submittedDate + 'T00:00:00').toUTCString()}</pubDate>
    <description>${escapeHtml((p.abstract || '').slice(0, 300))}</description>
  </item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>\n  <title>${escapeHtml(archive.name)} — Paper Archive</title>\n  <link>${base}/</link>\n  <description>${escapeHtml(archive.tagline)}</description>\n${items}\n</channel></rss>\n`;
}

/* ──────────────────────────────────────────────
   Main
   ────────────────────────────────────────────── */

function main() {
  const data = readJSON(PAPERS_JSON);
  const { archive, papers } = data;

  fs.mkdirSync(ABS_DIR, { recursive: true });
  fs.mkdirSync(PDF_DIR, { recursive: true });

  const template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
  const pdfTemplate = fs.readFileSync(PDF_TEMPLATE_PATH, 'utf-8');

  const seenIds = new Set();
  for (const paper of papers) {
    if (seenIds.has(paper.id)) {
      throw new Error(`Duplicate paper id detected: ${paper.id}. Every paper needs a unique id.`);
    }
    seenIds.add(paper.id);

    // Validation: check that paper version matches the latest history entry
    const latestHistoryVersion = paper.history && paper.history.length > 0 
      ? paper.history[paper.history.length - 1].version 
      : null;
    if (latestHistoryVersion && paper.version !== latestHistoryVersion) {
      console.warn(`  Warning: Paper ${paper.id} current version (${paper.version}) does not match latest history version (${latestHistoryVersion})`);
    }

    // Validation: check for missing versioned PDF files mentioned in history
    const pdfVersions = detectPdfVersions(paper.id);
    if (paper.history && pdfVersions.length > 0) {
      for (const entry of paper.history) {
        if (!pdfVersions.includes(entry.version)) {
          console.warn(`  Warning: History entry version "${entry.version}" for paper ${paper.id} has no corresponding PDF file in pdf/${paper.id}/${entry.version}.pdf`);
        }
      }
    }

    // Generate abstract page
    const outDir = path.join(ABS_DIR, paper.id);
    fs.mkdirSync(outDir, { recursive: true });
    const html = buildAbsPage(paper, archive, template);
    fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf-8');
    console.log(`  built abs/${paper.id}/index.html`);

    // Generate PDF viewer page (if any version exists)
    if (pdfVersions.length > 0) {
      const pdfOutDir = path.join(PDF_DIR, paper.id);
      fs.mkdirSync(pdfOutDir, { recursive: true });
      const pdfHtml = buildPdfViewerPage(paper, archive, pdfVersions, pdfTemplate);
      fs.writeFileSync(path.join(pdfOutDir, 'index.html'), pdfHtml, 'utf-8');
      console.log(`  built pdf/${paper.id}/index.html (versions: ${pdfVersions.join(', ')})`);
    }
  }

  const pdfManifest = papers.filter(p => hasPdf(p.id)).map(p => p.id);
  fs.writeFileSync(path.join(ROOT, 'pdf-manifest.json'), JSON.stringify(pdfManifest, null, 2), 'utf-8');
  console.log(`  built pdf-manifest.json (${pdfManifest.length} PDF(s) found)`);

  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), buildSitemap(papers, archive), 'utf-8');
  console.log('  built sitemap.xml');

  fs.writeFileSync(path.join(ROOT, 'rss.xml'), buildRss(papers, archive), 'utf-8');
  console.log('  built rss.xml');

  console.log(`\nDone. ${papers.length} paper(s) processed.`);
}

main();
