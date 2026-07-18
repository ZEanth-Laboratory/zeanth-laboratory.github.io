#!/usr/bin/env node
/**
 * ZEanth Laboratory — paper manager
 * ------------------------------------------------------------
 * Interactive CLI to manage papers: list, edit, change status,
 * delete papers, and validate repository integrity.
 *
 * Usage:
 *   node scripts/manage-paper.mjs
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
const ABS_DIR = path.join(ROOT, 'abs');
const PDF_DIR = path.join(ROOT, 'pdf');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

function readData() {
  if (!fs.existsSync(PAPERS_JSON)) {
    console.error(`Error: papers.json not found at ${PAPERS_JSON}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(PAPERS_JSON, 'utf-8'));
}

function saveData(data) {
  fs.writeFileSync(PAPERS_JSON, JSON.stringify(data, null, 2), 'utf-8');
  console.log('Saved changes to papers.json.');
}

function rebuild() {
  console.log('\nRebuilding website...');
  try {
    const buildOutput = execSync('node scripts/build.mjs', { cwd: ROOT, encoding: 'utf-8' });
    console.log(buildOutput);
    console.log('Rebuild completed successfully.');
  } catch (err) {
    console.error(`Build failed: ${err.message}`);
  }
}

// Function to delete directory recursively (safe node implementation)
function deleteFolderRecursive(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.readdirSync(dirPath).forEach((file) => {
      const curPath = path.join(dirPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolderRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(dirPath);
  }
}

async function selectPaper(papers) {
  if (papers.length === 0) {
    console.log('No papers available.');
    return null;
  }
  papers.forEach((p, idx) => {
    console.log(`[${idx + 1}] ID: ${p.id} | ${p.title} (${p.status})`);
  });
  console.log('');
  const val = await ask('Select paper number or enter ID: ');
  const idx = parseInt(val, 10) - 1;
  if (idx >= 0 && idx < papers.length) {
    return papers[idx];
  }
  const paper = papers.find(p => p.id === val.trim());
  if (!paper) {
    console.log('Invalid selection.');
    return null;
  }
  return paper;
}

async function listPapers(papers) {
  console.log('\n=== PAPERS LIST ===\n');
  if (papers.length === 0) {
    console.log('No papers found.');
    return;
  }
  papers.forEach((p, idx) => {
    console.log(`--------------------------------------------------------`);
    console.log(`[${idx + 1}] ID: ${p.id} (Version: ${p.version || 'v1'})`);
    console.log(`Title:    ${p.title}`);
    console.log(`Authors:  ${(p.authors || []).join(', ')}`);
    console.log(`Status:   ${p.status.toUpperCase()}`);
    console.log(`Date:     ${p.submittedDate}`);
    if (p.license) {
      console.log(`License:  ${p.license.spdx} (${p.license.licenseFile || 'LICENSE'})`);
    } else {
      console.log(`License:  (default)`);
    }
  });
  console.log(`--------------------------------------------------------\n`);
}

async function editPaper(data) {
  console.log('\n=== EDIT PAPER ===\n');
  const paper = await selectPaper(data.papers);
  if (!paper) return;

  console.log(`\nEditing paper: [${paper.id}] "${paper.title}"`);
  console.log('Leave blank to keep existing value.\n');

  const newTitle = await ask(`Title [${paper.title}]: `);
  if (newTitle.trim()) paper.title = newTitle.trim();

  const newAuthorsRaw = await ask(`Authors (comma separated) [${paper.authors.join(', ')}]: `);
  if (newAuthorsRaw.trim()) {
    paper.authors = newAuthorsRaw.split(',').map(s => s.trim()).filter(Boolean);
  }

  const newAbstract = await ask(`Abstract [${paper.abstract}]: `);
  if (newAbstract.trim()) paper.abstract = newAbstract.trim();

  const newComments = await ask(`Comments [${paper.comments || 'none'}]: `);
  if (newComments.trim()) {
    paper.comments = newComments.trim() === 'none' ? null : newComments.trim();
  }

  const newJournalRef = await ask(`Journal Ref [${paper.journalRef || 'none'}]: `);
  if (newJournalRef.trim()) {
    paper.journalRef = newJournalRef.trim() === 'none' ? null : newJournalRef.trim();
  }

  const newDoi = await ask(`DOI [${paper.doi || 'none'}]: `);
  if (newDoi.trim()) {
    paper.doi = newDoi.trim() === 'none' ? null : newDoi.trim();
  }

  const newCodeUrl = await ask(`Code URL [${paper.codeUrl || 'none'}]: `);
  if (newCodeUrl.trim()) {
    paper.codeUrl = newCodeUrl.trim() === 'none' ? null : newCodeUrl.trim();
  }

  const newDatasetUrl = await ask(`Dataset URL [${paper.datasetUrl || 'none'}]: `);
  if (newDatasetUrl.trim()) {
    paper.datasetUrl = newDatasetUrl.trim() === 'none' ? null : newDatasetUrl.trim();
  }

  saveData(data);
  rebuild();
}

async function changeStatus(data) {
  console.log('\n=== QUICK STATUS UPDATE ===\n');
  const paper = await selectPaper(data.papers);
  if (!paper) return;

  console.log(`\nCurrent status of [${paper.id}] "${paper.title}": ${paper.status}`);
  console.log('Available statuses: preprint, under-review, accepted, published, withdrawn');
  const newStatus = await ask('New status: ');
  const cleaned = newStatus.trim().toLowerCase();
  
  const allowed = ['preprint', 'under-review', 'accepted', 'published', 'withdrawn'];
  if (!allowed.includes(cleaned)) {
    console.log(`Error: "${cleaned}" is not a valid status.`);
    return;
  }

  paper.status = cleaned;
  saveData(data);
  rebuild();
}

async function deletePaper(data) {
  console.log('\n=== DELETE PAPER ===\n');
  const paper = await selectPaper(data.papers);
  if (!paper) return;

  console.log(`\nWARNING: You are about to delete paper [${paper.id}] "${paper.title}".`);
  const confirm = await ask(`Type the paper ID (${paper.id}) to confirm deletion: `);
  if (confirm.trim() !== paper.id) {
    console.log('Deletion cancelled (ID mismatch).');
    return;
  }

  const deleteFiles = (await ask('Delete associated PDF and generated HTML folders on disk? (y/N): ')).toLowerCase() === 'y';

  // Remove from array
  data.papers = data.papers.filter(p => p.id !== paper.id);
  saveData(data);

  if (deleteFiles) {
    // Delete abs folder
    const absPath = path.join(ABS_DIR, paper.id);
    if (fs.existsSync(absPath)) {
      deleteFolderRecursive(absPath);
      console.log(`Deleted folder abs/${paper.id}/`);
    }

    // Delete pdf folder
    const pdfPath = path.join(PDF_DIR, paper.id);
    if (fs.existsSync(pdfPath)) {
      deleteFolderRecursive(pdfPath);
      console.log(`Deleted folder pdf/${paper.id}/`);
    }
  }

  console.log(`Paper ${paper.id} deleted successfully.`);
  rebuild();
}

function runValidation(data) {
  console.log('\n=== SYSTEM INTEGRITY VALIDATION ===\n');
  let warnings = 0;
  let errors = 0;

  const papers = data.papers || [];
  const paperIds = new Set(papers.map(p => p.id));
  const allowedCategories = (data.categories || []).map(c => c.code);

  console.log(`Checking ${papers.length} paper entries...`);

  // 1. Check duplicate IDs
  const checkedIds = new Set();
  for (const paper of papers) {
    if (checkedIds.has(paper.id)) {
      console.error(`[ERROR] Duplicate paper ID found: ${paper.id}`);
      errors++;
    }
    checkedIds.add(paper.id);

    // 2. Validate categories
    for (const cat of paper.categories || []) {
      if (!allowedCategories.includes(cat)) {
        console.warn(`[WARNING] Paper ${paper.id} has category "${cat}" which is not in the allowed categories list.`);
        warnings++;
      }
    }

    // 3. Check version mismatch with history
    const latestHistory = paper.history && paper.history.length > 0
      ? paper.history[paper.history.length - 1].version
      : null;
    if (latestHistory && paper.version !== latestHistory) {
      console.warn(`[WARNING] Paper ${paper.id} version field (${paper.version}) does not match latest history entry (${latestHistory}).`);
      warnings++;
    }

    // 4. Check missing versioned PDF files
    const pdfPath = path.join(PDF_DIR, paper.id);
    const pdfExists = fs.existsSync(pdfPath);
    if (paper.history) {
      for (const entry of paper.history) {
        const verPdf = path.join(PDF_DIR, paper.id, `${entry.version}.pdf`);
        if (!fs.existsSync(verPdf)) {
          console.warn(`[WARNING] Paper ${paper.id} history mentions version "${entry.version}" but no PDF file found at pdf/${paper.id}/${entry.version}.pdf`);
          warnings++;
        }
      }
    }

    // 5. Check LICENSE configuration and existence
    const licenseFile = paper.license?.licenseFile || data.archive?.defaultPaperLicense?.licenseFile || 'LICENSE';
    const localLicensePath = path.join(PDF_DIR, paper.id, licenseFile);
    if (!fs.existsSync(localLicensePath)) {
      console.warn(`[WARNING] Paper ${paper.id} has no local license file at pdf/${paper.id}/${licenseFile}`);
      warnings++;
    }
  }

  // 6. Check for orphaned directories in abs/ and pdf/
  if (fs.existsSync(ABS_DIR)) {
    fs.readdirSync(ABS_DIR).forEach(file => {
      if (file !== '.gitkeep' && fs.statSync(path.join(ABS_DIR, file)).isDirectory()) {
        if (!paperIds.has(file)) {
          console.warn(`[WARNING] Orphaned folder abs/${file}/ exists on disk but has no entry in papers.json`);
          warnings++;
        }
      }
    });
  }

  if (fs.existsSync(PDF_DIR)) {
    fs.readdirSync(PDF_DIR).forEach(file => {
      if (file !== '.gitkeep' && fs.statSync(path.join(PDF_DIR, file)).isDirectory()) {
        if (!paperIds.has(file)) {
          console.warn(`[WARNING] Orphaned folder pdf/${file}/ exists on disk but has no entry in papers.json`);
          warnings++;
        }
      }
    });
  }

  console.log(`\nValidation complete. ${errors} error(s), ${warnings} warning(s) found.`);
}

async function menu() {
  while (true) {
    const data = readData();
    console.log('\n======================================');
    console.log(' ZEanth Laboratory Paper Manager CLI');
    console.log('======================================');
    console.log('[1] List all papers');
    console.log('[2] Edit a paper');
    console.log('[3] Quick update status');
    console.log('[4] Delete a paper');
    console.log('[5] Validate system integrity');
    console.log('[6] Exit');
    console.log('======================================');
    
    const choice = await ask('\nSelect option: ');
    switch (choice.trim()) {
      case '1':
        await listPapers(data.papers);
        break;
      case '2':
        await editPaper(data);
        break;
      case '3':
        await changeStatus(data);
        break;
      case '4':
        await deletePaper(data);
        break;
      case '5':
        runValidation(data);
        break;
      case '6':
        console.log('Goodbye!');
        rl.close();
        return;
      default:
        console.log('Invalid option. Please choose between 1 and 6.');
    }
  }
}

menu();
