#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCES_PATH = path.join(ROOT, 'sources', 'sources.json');

function readSources() {
  return JSON.parse(fs.readFileSync(SOURCES_PATH, 'utf8'));
}

function main() {
  const args = new Set(process.argv.slice(2));
  const wantsDownload = args.has('--download') || args.has('--execute');
  const sources = readSources();
  const includeNow = sources.filter(s => s.includeNow);

  if (wantsDownload) {
    console.error('Refusing to download datasets from Milestone 1 tooling.');
    console.error('Use this script as an inventory/dry-run tool until a source-specific collector is reviewed.');
    process.exit(2);
  }

  console.log('Noesis source collection dry run');
  console.log(`Sources tracked: ${sources.length}`);
  console.log(`Marked includeNow: ${includeNow.length}`);
  console.log('');

  for (const source of includeNow) {
    console.log(`- ${source.name}`);
    console.log(`  classification: ${source.classificationDefault}`);
    console.log(`  method: ${source.downloadMethod}`);
    console.log(`  notes: ${source.notes}`);
  }

  console.log('');
  console.log('No files were downloaded. Raw data must remain local and license-approved.');
}

main();
