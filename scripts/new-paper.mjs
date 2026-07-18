#!/usr/bin/env node
/**
 * ZEanth Laboratory — new paper helper (upgraded)
 * ------------------------------------------------------------
 * Interactive CLI that scaffolds a new paper entry:
 *   - Auto-generates ID (YYMM.NNNNN)
 *   - Prompts for metadata
 *   - Prompts for license options
 *   - Copies PDF file to pdf/{id}/v1.pdf
 *   - Copies LICENSE file to pdf/{id}/LICENSE
 *   - Writes directly to papers.json
 *   - Auto-runs build.mjs to update the site
 *
 * Usage:
 *   node scripts/new-paper.mjs [--dry-run]
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
  const isDryRun = process.argv.includes('--dry-run');
  if (isDryRun) {
    console.log('=== DRY RUN MODE: No files will be modified ===\n');
  }

  const data = JSON.parse(fs.readFileSync(PAPERS_JSON, 'utf-8'));
  const today = new Date();
  const id = nextId(data.papers, today);
  const submittedDate = today.toISOString().slice(0, 10);

  // Load allowed categories from papers.json
  const allowedCategories = (data.categories || []).map(c => c.code);

  console.log(`\nNext available identifier: ${id}\n`);

  const title = await ask('Title: ');
  if (!title.trim()) {
    console.error('Error: Title is required.');
    rl.close();
    process.exit(1);
  }

  const authorsRaw = await ask('Authors (comma separated): ');
  const authors = authorsRaw.split(',').map(s => s.trim()).filter(Boolean);
  if (authors.length === 0) {
    console.error('Error: At least one author is required.');
    rl.close();
    process.exit(1);
  }

  console.log(`Allowed categories: ${allowedCategories.join(', ')}`);
  const categoriesRaw = await ask('Categories, e.g. cs.CV, cs.LG (comma separated): ');
  const categories = categoriesRaw.split(',').map(s => s.trim()).filter(Boolean);
  for (const cat of categories) {
    if (!allowedCategories.includes(cat)) {
      console.warn(`Warning: Category "${cat}" is not in the allowed categories list in papers.json.`);
    }
  }

  const abstract = await ask('Abstract: ');
  const status = (await ask('Status [preprint/under-review/accepted/published] (default: preprint): ')) || 'preprint';
  const comments = await ask('Comments (pages/figures, optional): ');
  const journalRef = await ask('Journal reference (optional): ');
  const doi = await ask('DOI (optional): ');
  const codeUrl = await ask('Code URL (optional): ');
  const datasetUrl = await ask('Dataset URL (optional): ');

  // PDF path prompt
  const pdfSource = await ask('\nPath to PDF file on disk (optional, press Enter to skip): ');

  // License Prompts
  let paperLicense = null;
  let licenseSourceFile = null;
  let customLicenseFile = 'LICENSE';

  const useDefaultLicense = (await ask('\nUse archive-level default license (CC-BY-SA-4.0)? (Y/n): ')).toLowerCase() !== 'n';
  if (!useDefaultLicense) {
    console.log('\nEnter custom license details:');
    const spdx = await ask('License SPDX identifier (e.g. MIT, CC-BY-4.0): ');
    const licenseName = await ask('License Name (e.g. MIT License): ');
    const licenseUrl = await ask('License legal text URL (optional): ');
    customLicenseFile = (await ask('License local filename [LICENSE]: ')) || 'LICENSE';
    const licenseFileUrl = await ask('License GitHub URL (optional, auto-generated if left blank): ');

    paperLicense = {
      spdx: spdx.trim() || 'Custom',
      name: licenseName.trim() || 'Custom License',
      url: licenseUrl.trim() || null,
      licenseFile: customLicenseFile,
      licenseFileUrl: licenseFileUrl.trim() || null
    };

    const customLicenseSrc = await ask(`Path to custom license file on disk (press Enter to use default CC-BY-SA-4.0 text): `);
    if (customLicenseSrc.trim()) {
      licenseSourceFile = path.resolve(customLicenseSrc.trim());
      if (!fs.existsSync(licenseSourceFile)) {
        console.error(`Error: Custom license file not found at ${licenseSourceFile}`);
        rl.close();
        process.exit(1);
      }
    }
  }

  rl.close();

  const entry = {
    id,
    version: 'v1',
    title: title.trim(),
    authors,
    categories,
    status,
    abstract: abstract.trim(),
    comments: comments.trim() || null,
    journalRef: journalRef.trim() || null,
    doi: doi.trim() || null,
    codeUrl: codeUrl.trim() || null,
    datasetUrl: datasetUrl.trim() || null,
    submittedDate,
    history: [{ version: 'v1', date: submittedDate, note: 'Initial submission' }]
  };

  if (paperLicense) {
    entry.license = paperLicense;
  }

  if (isDryRun) {
    console.log('\n--------------------------------------------------------');
    console.log('DRY RUN: Generated entry for papers.json:');
    console.log('--------------------------------------------------------\n');
    console.log(JSON.stringify(entry, null, 2));
    console.log(`\nWould create folder: pdf/${id}/`);
    if (pdfSource.trim()) {
      console.log(`Would copy PDF from: ${pdfSource} to pdf/${id}/v1.pdf`);
    }
    if (useDefaultLicense) {
      console.log(`Would copy default license to pdf/${id}/LICENSE`);
    } else {
      console.log(`Would copy license from: ${licenseSourceFile || 'default CC-BY-SA-4.0'} to pdf/${id}/${customLicenseFile}`);
    }
    console.log('\nDry run complete. No modifications made.');
    process.exit(0);
  }

  // --- Real execution ---

  // 1. Create directory scaffolding
  const destDir = path.join(PDF_DIR, id);
  fs.mkdirSync(destDir, { recursive: true });
  console.log(`Created directory: pdf/${id}/`);

  // 2. Copy PDF file if provided
  if (pdfSource.trim()) {
    const srcPath = path.resolve(pdfSource.trim());
    if (fs.existsSync(srcPath)) {
      const destPath = path.join(destDir, 'v1.pdf');
      fs.copyFileSync(srcPath, destPath);
      console.log(`Copied PDF file to pdf/${id}/v1.pdf`);
    } else {
      console.warn(`Warning: PDF file not found at ${srcPath}. Skipping copy.`);
    }
  } else {
    console.log('No PDF file provided. Paper will show "PDF pending".');
  }

  // 3. Copy/Create LICENSE file
  const destLicensePath = path.join(destDir, customLicenseFile);
  if (licenseSourceFile) {
    fs.copyFileSync(licenseSourceFile, destLicensePath);
    console.log(`Copied custom license file to pdf/${id}/${customLicenseFile}`);
  } else {
    // Copy the default CC-BY-SA-4.0 license file from 2601.00001
    const defaultLicenseSrc = path.join(PDF_DIR, '2601.00001', 'LICENSE');
    if (fs.existsSync(defaultLicenseSrc)) {
      fs.copyFileSync(defaultLicenseSrc, destLicensePath);
      console.log(`Copied default CC-BY-SA-4.0 license file to pdf/${id}/${customLicenseFile}`);
    } else {
      // Fallback: create a basic license file if the reference isn't there
      fs.writeFileSync(destLicensePath, `License: CC-BY-SA-4.0\nRefer to the archive default license configuration.`, 'utf-8');
      console.log(`Created default LICENSE file at pdf/${id}/${customLicenseFile}`);
    }
  }

  // 4. Update papers.json
  data.papers.push(entry);
  fs.writeFileSync(PAPERS_JSON, JSON.stringify(data, null, 2), 'utf-8');
  console.log('Added new paper entry directly to papers.json');

  // 5. Run build to generate static pages
  console.log('\nRunning build script...');
  try {
    const buildOutput = execSync('node scripts/build.mjs', { cwd: ROOT, encoding: 'utf-8' });
    console.log(buildOutput);
    console.log('Success! New paper added and website rebuilt.');
  } catch (err) {
    console.error(`Build failed: ${err.message}`);
    process.exit(1);
  }
}

main();
