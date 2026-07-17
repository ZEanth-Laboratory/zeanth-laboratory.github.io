/* ============================================================
   ZEanth Laboratory — shared helpers
   Used by both the listing page and generated abstract pages.
   ============================================================ */

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

function authorLine(authors) {
  return (authors || []).join(', ');
}

/** Format an ISO date (YYYY-MM-DD) as bib year/month. */
function bibDate(iso) {
  if (!iso) return { year: '', month: '' };
  const d = new Date(iso + 'T00:00:00');
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/** Build a BibTeX @misc entry for a paper. */
function buildBibtex(paper, archive) {
  const firstAuthorLast = (paper.authors[0] || 'anonymous').split(' ').pop().toLowerCase().replace(/[^a-z]/g, '');
  const { year } = bibDate(paper.submittedDate);
  const key = `${firstAuthorLast}${year}${paper.id.replace(/[^0-9]/g, '')}`;
  const authors = (paper.authors || []).join(' and ');
  const lines = [
    `@misc{${key},`,
    `      title={${paper.title}},`,
    `      author={${authors}},`,
    `      year={${year}},`,
    `      eprint={${paper.id}},`,
    `      archivePrefix={${archive.shortName}},`,
    `      primaryClass={${(paper.categories || [])[0] || 'cs'}}`,
    `}`
  ];
  return lines.join('\n');
}
