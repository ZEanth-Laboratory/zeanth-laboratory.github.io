#!/usr/bin/env node
/**
 * ZEanth Laboratory — new version helper
 * ------------------------------------------------------------
 * Interactive CLI to publish a new version of an existing paper.
 * Bumps the version (v1 -> v2, etc.), records history, copies the
 * PDF file to the versioned folder, updates metadata, and runs the builder.
 *
 * Usage:
 *   node scripts/new-version.mjs
 * ------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PAPERS_JSON = path.join(ROOT, 'papers.json');
const PDF_DIR = path.join(ROOT, 'pdf');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

function getNextVersion(currentVer) {
  if (!currentVer) return 'v2';
  const m = currentVer.match(/^v(\d+)$/i);
  if (m) {
    return `v${parseInt(m[1], 10) + 1}`;
  }
  return currentVer + '.1';
}

async function main() {
  if (!fs.existsSync(PAPERS_JSON)) {
    console.error(`Error: papers.json not found at ${PAPERS_JSON}`);
    rl.close();
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(PAPERS_JSON, 'utf-8'));
  const papers = data.papers || [];

  if (papers.length === 0) {
    console.log('No papers found to version control. Please add a paper first.');
    rl.close();
    process.exit(0);
  }

  console.log('\n=== Select a paper to create a new version for ===\n');
  papers.forEach((p, idx) => {
    console.log(`[${idx + 1}] ID: ${p.id} | ${p.title} (current: ${p.version || 'v1'})`);
  });
  console.log('');

  const choiceRaw = await ask('Select paper number or enter ID: ');
  let paper = null;

  // Try parsing as number index first
  const choiceIdx = parseInt(choiceRaw, 10) - 1;
  if (choiceIdx >= 0 && choiceIdx < papers.length) {
    paper = papers[choiceIdx];
  } else {
    // Try matching by exact ID
    paper = papers.find(p => p.id === choiceRaw.trim());
  }

  if (!paper) {
    console.error('Invalid selection.');
    rl.close();
    process.exit(1);
  }

  const currentVer = paper.version || 'v1';
  const nextVer = getNextVersion(currentVer);
  const today = new Date().toISOString().slice(0, 10);

  console.log(`\nSelected: [${paper.id}] "${paper.title}"`);
  console.log(`Current version: ${currentVer}`);
  console.log(`Targeting version: ${nextVer}\n`);

  const note = await ask(`Version note (e.g. "Revised after peer review"): `);
  const date = (await ask(`Version date [${today}]: `)) || today;

  const pdfSourcePath = await ask('Path to the new PDF file (optional, press Enter if not uploading yet): ');
  let pdfCopied = false;

  if (pdfSourcePath.trim()) {
    const srcPath = path.resolve(pdfSourcePath.trim());
    if (!fs.existsSync(srcPath)) {
      console.error(`Error: PDF file not found at ${srcPath}`);
      rl.close();
      process.exit(1);
    }

    const destDir = path.join(PDF_DIR, paper.id);
    fs.mkdirSync(destDir, { recursive: true });
    const destPath = path.join(destDir, `${nextVer}.pdf`);

    try {
      fs.copyFileSync(srcPath, destPath);
      console.log(`Copied new PDF to ${path.relative(ROOT, destPath)}`);
      pdfCopied = true;
    } catch (err) {
      console.error(`Failed to copy PDF file: ${err.message}`);
      rl.close();
      process.exit(1);
    }
  }

  // Ask to update fields
  const updateMetadata = (await ask('\nDo you want to update paper details (title, abstract, status, etc.)? (y/N): ')).toLowerCase() === 'y';

  if (updateMetadata) {
    console.log('\nLeave blank to keep existing value:\n');
    const newTitle = await ask(`Title [${paper.title}]: `);
    if (newTitle.trim()) paper.title = newTitle.trim();

    const newAbstract = await ask(`Abstract [${paper.abstract}]: `);
    if (newAbstract.trim()) paper.abstract = newAbstract.trim();

    const newStatus = await ask(`Status (preprint/under-review/accepted/published/withdrawn) [${paper.status}]: `);
    if (newStatus.trim()) paper.status = newStatus.trim();

    const newComments = await ask(`Comments [${paper.comments || 'none'}]: `);
    if (newComments.trim()) paper.comments = newComments.trim() === 'none' ? null : newComments.trim();

    const newJournalRef = await ask(`Journal Ref [${paper.journalRef || 'none'}]: `);
    if (newJournalRef.trim()) paper.journalRef = newJournalRef.trim() === 'none' ? null : newJournalRef.trim();

    const newDoi = await ask(`DOI [${paper.doi || 'none'}]: `);
    if (newDoi.trim()) paper.doi = newDoi.trim() === 'none' ? null : newDoi.trim();

    const newCodeUrl = await ask(`Code URL [${paper.codeUrl || 'none'}]: `);
    if (newCodeUrl.trim()) paper.codeUrl = newCodeUrl.trim() === 'none' ? null : newCodeUrl.trim();

    const newDatasetUrl = await ask(`Dataset URL [${paper.datasetUrl || 'none'}]: `);
    if (newDatasetUrl.trim()) paper.datasetUrl = newDatasetUrl.trim() === 'none' ? null : newDatasetUrl.trim();
  }

  // Update paper fields
  paper.version = nextVer;
  if (!paper.history) paper.history = [];
  paper.history.push({
    version: nextVer,
    date: date,
    note: note.trim() || 'Revised version'
  });

  // Write papers.json
  fs.writeFileSync(PAPERS_JSON, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`\nUpdated papers.json: version set to ${nextVer}, history updated.`);

  rl.close();

  // Run build
  console.log('\nRebuilding website...');
  try {
    const buildOutput = execSync('node scripts/build.mjs', { cwd: ROOT, encoding: 'utf-8' });
    console.log(buildOutput);
    console.log('Success! New version published and site rebuilt.');
  } catch (err) {
    console.error(`Build failed: ${err.message}`);
    process.exit(1);
  }
}

main();
