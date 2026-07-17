#!/usr/bin/env node
/**
 * ZEanth Laboratory — new paper helper
 * ------------------------------------------------------------
 * Interactive CLI that scaffolds a new entry in papers.json with
 * an auto-generated structured identifier: YYMM.NNNNN
 * (year + month of submission, plus a zero-padded serial number
 * that resets every month).
 *
 * Usage:
 *   node scripts/new-paper.mjs
 *
 * The script only prints the JSON snippet and the next steps —
 * it never edits papers.json automatically, so you stay in control
 * of exactly what gets committed.
 * ------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PAPERS_JSON = path.join(ROOT, 'papers.json');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

function nextId(papers, date) {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const prefix = `${yy}${mm}`;
  const usedSerials = papers
    .map(p => p.id)
    .filter(id => id.startsWith(prefix + '.'))
    .map(id => parseInt(id.split('.')[1], 10));
  const next = usedSerials.length ? Math.max(...usedSerials) + 1 : 1;
  return `${prefix}.${String(next).padStart(5, '0')}`;
}

async function main() {
  const data = JSON.parse(fs.readFileSync(PAPERS_JSON, 'utf-8'));
  const today = new Date();
  const id = nextId(data.papers, today);
  const submittedDate = today.toISOString().slice(0, 10);

  console.log(`\nNext available identifier: ${id}\n`);

  const title = await ask('Title: ');
  const authorsRaw = await ask('Authors (comma separated): ');
  const categoriesRaw = await ask('Categories, e.g. cs.CV, cs.LG (comma separated): ');
  const abstract = await ask('Abstract: ');
  const status = (await ask('Status [preprint/under-review/accepted/published] (default: preprint): ')) || 'preprint';
  const comments = await ask('Comments (pages/figures, optional): ');
  const journalRef = await ask('Journal reference (optional): ');
  const doi = await ask('DOI (optional): ');
  const codeUrl = await ask('Code URL (optional): ');
  const datasetUrl = await ask('Dataset URL (optional): ');

  rl.close();

  const entry = {
    id,
    version: 'v1',
    title,
    authors: authorsRaw.split(',').map(s => s.trim()).filter(Boolean),
    categories: categoriesRaw.split(',').map(s => s.trim()).filter(Boolean),
    status,
    abstract,
    comments: comments || null,
    journalRef: journalRef || null,
    doi: doi || null,
    codeUrl: codeUrl || null,
    datasetUrl: datasetUrl || null,
    submittedDate,
    history: [{ version: 'v1', date: submittedDate, note: 'Initial submission' }]
  };

  console.log('\n--------------------------------------------------------');
  console.log('Add this object to the "papers" array in papers.json:');
  console.log('--------------------------------------------------------\n');
  console.log(JSON.stringify(entry, null, 2));
  console.log(`\nThen place the PDF file at: pdf/${id}.pdf`);
  console.log('Finally run: node scripts/build.mjs  (or just push — the GitHub Action builds it for you)\n');
}

main();
