/* ============================================================
   ZEanth Laboratory — listing page logic
   ============================================================ */

const ITEMS_PER_PAGE = 5;
let ARCHIVE = null;
let PAPERS = [];
let PDF_MANIFEST = [];
let currentPage = 1;
let currentQuery = '';
let filters = { category: '', status: '', year: '', sort: 'new' };

const listEl = document.getElementById('papersList');
const searchEl = document.getElementById('searchInput');
const paginationEl = document.getElementById('pagination');
const resultCountEl = document.getElementById('resultCount');
const categoryFilterEl = document.getElementById('categoryFilter');
const statusFilterEl = document.getElementById('statusFilter');
const yearFilterEl = document.getElementById('yearFilter');
const sortOrderEl = document.getElementById('sortOrder');

async function init() {
  try {
    const res = await fetch('papers.json', { cache: 'no-store' });
    const data = await res.json();
    ARCHIVE = data.archive;
    PAPERS = data.papers || [];

    populateFilters(data);
    applyUrlParams();
    setLastUpdated();

    try {
      const pdfRes = await fetch('pdf-manifest.json', { cache: 'no-store' });
      if (pdfRes.ok) PDF_MANIFEST = await pdfRes.json();
    } catch (e) { PDF_MANIFEST = []; }

    renderPapers();
  } catch (err) {
    listEl.innerHTML = `
      <div class="empty">
        <div class="empty-title">Could not load papers.json</div>
        <div class="empty-sub">Make sure <span class="empty-query">papers.json</span> exists at the site root and this page is served over HTTP (not opened as a local file://).</div>
      </div>`;
  }
}

function populateFilters(data) {
  (data.categories || []).forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.code;
    opt.textContent = `${c.code} — ${c.name}`;
    categoryFilterEl.appendChild(opt);
  });
  (data.statuses || []).slice().sort((a,b) => a.order - b.order).forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.code;
    opt.textContent = s.label;
    statusFilterEl.appendChild(opt);
  });
  const years = [...new Set(PAPERS.map(p => (p.submittedDate || '').slice(0,4)).filter(Boolean))].sort((a,b) => b - a);
  years.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    yearFilterEl.appendChild(opt);
  });
}

function setLastUpdated() {
  if (PAPERS.length === 0) {
    document.getElementById('lastUpdated').textContent = 'Last updated · —';
    return;
  }
  const latest = PAPERS.reduce((m, p) => {
    const latestVersionDate = (p.history && p.history.length) ? p.history[p.history.length - 1].date : p.submittedDate;
    return (!m || latestVersionDate > m) ? latestVersionDate : m;
  }, null);
  document.getElementById('lastUpdated').textContent = `Last updated · ${formatDate(latest)}`;
}

function getFilteredPapers() {
  const q = currentQuery.trim().toLowerCase();
  let result = PAPERS.filter(p => {
    if (filters.category && !(p.categories || []).includes(filters.category)) return false;
    if (filters.status && p.status !== filters.status) return false;
    if (filters.year && !(p.submittedDate || '').startsWith(filters.year)) return false;
    if (!q) return true;
    return (
      p.title.toLowerCase().includes(q) ||
      authorLine(p.authors).toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      (p.categories || []).some(c => c.toLowerCase().includes(q)) ||
      (p.abstract || '').toLowerCase().includes(q)
    );
  });

  result.sort((a, b) => {
    if (filters.sort === 'title') return a.title.localeCompare(b.title);
    if (filters.sort === 'old') return a.submittedDate.localeCompare(b.submittedDate);
    return b.submittedDate.localeCompare(a.submittedDate);
  });

  return result;
}

function hasPdf(id) {
  return PDF_MANIFEST.includes(id);
}

function renderPapers() {
  const filtered = getFilteredPapers();
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  if (currentPage > totalPages) currentPage = totalPages;

  resultCountEl.textContent = PAPERS.length
    ? `${filtered.length} of ${PAPERS.length} paper${PAPERS.length === 1 ? '' : 's'}`
    : '';

  if (PAPERS.length === 0) {
    listEl.innerHTML = `
      <div class="empty">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <path d="M14 2v6h6"/>
          <path d="M9 13h6M9 17h4" opacity="0.5"/>
        </svg>
        <div class="empty-title">No papers yet</div>
        <div class="empty-sub">The archive is being prepared. Check back soon — new work will appear here as it is released.</div>
      </div>`;
    paginationEl.innerHTML = '';
    return;
  }

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="7"/>
          <path d="M21 21l-4.3-4.3"/>
          <path d="M8 11h6" opacity="0.6"/>
        </svg>
        <div class="empty-title">No results</div>
        <div class="empty-sub">Nothing matches <span class="empty-query">${escapeHtml(currentQuery || 'the current filters')}</span>. Try a different keyword or clear the filters.</div>
      </div>`;
    paginationEl.innerHTML = '';
    return;
  }

  const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
  const pagePapers = filtered.slice(startIdx, startIdx + ITEMS_PER_PAGE);

  listEl.innerHTML = pagePapers.map(p => `
    <article class="paper">
      <div class="paper-idcol">
        <span class="paper-id mono">${escapeHtml(ARCHIVE.shortName)}:${escapeHtml(p.id)}</span>
        ${statusBadge(p.status)}
      </div>
      <div class="paper-body">
        <a class="paper-title" href="abs/${encodeURIComponent(p.id)}">${escapeHtml(p.title)}</a>
        <div class="paper-meta">
          <span>${escapeHtml(authorLine(p.authors))}</span>
          ${p.journalRef ? ` · <span class="venue">${escapeHtml(p.journalRef)}</span>` : ''}
        </div>
        <div class="paper-tags">${categoryTags(p.categories)}</div>
        ${p.abstract ? `<p class="paper-abstract">${escapeHtml(p.abstract)}</p>` : ''}
        <div class="paper-links">
          <a href="abs/${encodeURIComponent(p.id)}">Abstract</a>
          ${hasPdf(p.id)
            ? `<a href="pdf/${encodeURIComponent(p.id)}">PDF</a>`
            : `<span class="disabled">PDF</span>`}
          ${p.doi ? `<a href="https://doi.org/${encodeURIComponent(p.doi)}" target="_blank" rel="noopener">DOI</a>` : ''}
          ${p.codeUrl ? `<a href="${escapeHtml(p.codeUrl)}" target="_blank" rel="noopener">Code</a>` : ''}
        </div>
      </div>
    </article>
  `).join('');

  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  if (totalPages <= 1) { paginationEl.innerHTML = ''; return; }

  let html = `
    <button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      Prev
    </button>
  `;
  html += '<div class="pagination-numbers">';
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="page-num ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
  }
  html += '</div>';
  html += `
    <button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})">
      Next
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
    </button>
  `;
  paginationEl.innerHTML = html;
}

window.changePage = function(page) {
  currentPage = page;
  renderPapers();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

searchEl.addEventListener('input', e => {
  currentQuery = e.target.value;
  currentPage = 1;
  renderPapers();
});
function applyUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const cat = params.get('category');
  if (cat) {
    filters.category = cat;
    categoryFilterEl.value = cat;
  }
  const st = params.get('status');
  if (st) {
    filters.status = st;
    statusFilterEl.value = st;
  }
  const yr = params.get('year');
  if (yr) {
    filters.year = yr;
    yearFilterEl.value = yr;
  }
  const sort = params.get('sort');
  if (sort) {
    filters.sort = sort;
    sortOrderEl.value = sort;
  }
}

categoryFilterEl.addEventListener('change', e => { filters.category = e.target.value; currentPage = 1; renderPapers(); });
statusFilterEl.addEventListener('change', e => { filters.status = e.target.value; currentPage = 1; renderPapers(); });
yearFilterEl.addEventListener('change', e => { filters.year = e.target.value; currentPage = 1; renderPapers(); });
sortOrderEl.addEventListener('change', e => { filters.sort = e.target.value; currentPage = 1; renderPapers(); });

document.getElementById('year').textContent = new Date().getFullYear();
init();
