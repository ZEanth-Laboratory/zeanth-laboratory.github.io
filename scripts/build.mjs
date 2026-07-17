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

  let html = '<div class="license-info">';
  html += `<span class="license-badge">${spdx}</span>`;
  if (url) {
    html += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${name}</a>`;
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

function buildPdfViewerPage(paper, archive, versions) {
  const latestVersion = versions[versions.length - 1];
  const versionsJson = JSON.stringify(versions);
  const archiveRepo = `${archive.github.replace(/\/$/, '')}/${archive.url.replace(/^https?:\/\//, '').replace(/\/.*/,'')}`;
  const primaryCategory = (paper.categories || [])[0] || 'cs';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>[${escapeHtml(paper.id)}] ${escapeHtml(paper.title)} — PDF — ${escapeHtml(archive.name)}</title>
<meta name="description" content="PDF viewer for ${escapeHtml(paper.title)}" />
<link rel="icon" href="${archive.logo}" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.0/index.css" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono@5.0.0/index.css" />
<link rel="stylesheet" href="../../assets/style.css" />
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"><\/script>
<script>pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';<\/script>
</head>
<body class="pdf-viewer-body">
  <div class="wrap">
    <header>
      <div class="header-inner">
        <a class="brand" href="../../">
          <img src="${archive.logo}" alt="${escapeHtml(archive.name)}" />
          <div class="brand-text">
            <span class="brand-name">${escapeHtml(archive.name)}</span>
            <span class="brand-subtitle">${escapeHtml(archive.tagline)}</span>
          </div>
        </a>
        <div class="header-right">
          <span class="brand-updated">${escapeHtml(archive.shortName)} Archive</span>
          <nav class="header-nav">
            <a href="../../">Archive</a>
            <a href="${archive.github}" target="_blank" rel="noopener">GitHub</a>
            <a href="../../rss.xml">RSS</a>
          </nav>
        </div>
      </div>
    </header>

    <div class="breadcrumb">
      <a href="../../">${escapeHtml(archive.shortName)} Archive</a> › <a href="../../?category=${escapeHtml(primaryCategory)}">${escapeHtml(primaryCategory)}</a> › <a href="../../abs/${encodeURIComponent(paper.id)}">${escapeHtml(archive.shortName)}:${escapeHtml(paper.id)}</a> › PDF <span id="versionLabel" class="mono" style="color:var(--faint)">${escapeHtml(latestVersion).toUpperCase()}</span>
    </div>

    <div class="pdf-toolbar">
      <div class="pdf-toolbar-left">
        <span class="pdf-toolbar-title">${escapeHtml(paper.title)}</span>
      </div>
      <div class="pdf-toolbar-right">
        ${versions.length > 1 ? `
        <select class="version-select" id="versionSelect">
          ${versions.map(v => `<option value="${escapeHtml(v)}"${v === latestVersion ? ' selected' : ''}>${escapeHtml(v).toUpperCase()}</option>`).join('')}
        </select>` : ''}
        <button class="btn-download" id="downloadBtn">
          <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
          <span id="btnText">Download PDF</span>
        </button>
      </div>
    </div>

    <div id="loading" class="pdf-loading">
      <div class="spinner"></div>
      <p>Loading document…</p>
    </div>

    <main class="pdf-viewport" id="viewport"></main>

    <footer>
      <span>© <span id="year"></span> ${escapeHtml(archive.name)} · CS paper archive</span>
      <a href="${archiveRepo}" target="_blank" rel="noopener">GitHub →</a>
    </footer>
  </div>

<script>
  document.getElementById('year').textContent = new Date().getFullYear();

  const PAPER_ID = ${JSON.stringify(paper.id)};
  const PAPER_TITLE = ${JSON.stringify(paper.title)};
  const VERSIONS = ${versionsJson};
  const LATEST = ${JSON.stringify(latestVersion)};

  /* ── Resolve requested version ── */
  const params = new URLSearchParams(window.location.search);
  let reqVer = params.get('version');
  if (reqVer && !reqVer.startsWith('v')) reqVer = 'v' + reqVer;
  if (!reqVer || !VERSIONS.includes(reqVer)) reqVer = LATEST;

  const fileUrl = reqVer + '.pdf';
  const saveName = PAPER_ID + reqVer + '.pdf';

  /* ── Update UI for selected version ── */
  document.getElementById('versionLabel').textContent = reqVer.toUpperCase();
  const versionSelect = document.getElementById('versionSelect');
  if (versionSelect) {
    versionSelect.value = reqVer;
    versionSelect.addEventListener('change', e => {
      const v = e.target.value;
      const url = new URL(window.location);
      url.searchParams.set('version', v);
      window.location.href = url.toString();
    });
  }

  /* ── Render PDF ── */
  const viewport = document.getElementById('viewport');
  const loadingScreen = document.getElementById('loading');

  pdfjsLib.getDocument(fileUrl).promise.then(pdf => {
    loadingScreen.style.display = 'none';

    for (let i = 1; i <= pdf.numPages; i++) {
      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-page-canvas';
      viewport.appendChild(canvas);

      pdf.getPage(i).then(page => {
        const dpr = window.devicePixelRatio || 1;
        const scale = 1.5;
        const vp = page.getViewport({ scale });

        canvas.width = vp.width * dpr;
        canvas.height = vp.height * dpr;
        canvas.style.width = vp.width + 'px';
        canvas.style.height = vp.height + 'px';

        page.render({
          canvasContext: canvas.getContext('2d'),
          viewport: vp,
          transform: [dpr, 0, 0, dpr, 0, 0]
        });
      });
    }
  }).catch(err => {
    console.error('PDF load error:', err);
    loadingScreen.innerHTML =
      '<div class="pdf-error">' +
      '<p style="font-size:15px;font-weight:500;margin-bottom:8px;">Unable to load PDF</p>' +
      '<p>The file <strong>' + reqVer + '.pdf</strong> could not be found or loaded.</p>' +
      '<p style="margin-top:12px;"><a href="../../abs/' + encodeURIComponent(PAPER_ID) + '">← Back to abstract</a></p>' +
      '</div>';
  });

  /* ── Download handler ── */
  const downloadBtn = document.getElementById('downloadBtn');
  const btnText = document.getElementById('btnText');

  function triggerDownload() {
    downloadBtn.disabled = true;
    btnText.textContent = 'Downloading…';

    fetch(fileUrl)
      .then(r => { if (!r.ok) throw new Error(); return r.blob(); })
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = saveName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        downloadBtn.disabled = false;
        btnText.textContent = 'Download PDF';
      })
      .catch(() => {
        downloadBtn.disabled = false;
        btnText.textContent = 'Download PDF';
        alert('Download failed. The PDF file may not be available yet.');
      });
  }

  downloadBtn.addEventListener('click', triggerDownload);

  /* ── Ctrl+S / Cmd+S override ── */
  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (!downloadBtn.disabled) triggerDownload();
    }
  });
<\/script>
</body>
</html>`;
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

  const seenIds = new Set();
  for (const paper of papers) {
    if (seenIds.has(paper.id)) {
      throw new Error(`Duplicate paper id detected: ${paper.id}. Every paper needs a unique id.`);
    }
    seenIds.add(paper.id);

    // Generate abstract page
    const outDir = path.join(ABS_DIR, paper.id);
    fs.mkdirSync(outDir, { recursive: true });
    const html = buildAbsPage(paper, archive, template);
    fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf-8');
    console.log(`  built abs/${paper.id}/index.html`);

    // Generate PDF viewer page (if any version exists)
    const pdfVersions = detectPdfVersions(paper.id);
    if (pdfVersions.length > 0) {
      const pdfOutDir = path.join(PDF_DIR, paper.id);
      fs.mkdirSync(pdfOutDir, { recursive: true });
      const pdfHtml = buildPdfViewerPage(paper, archive, pdfVersions);
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
