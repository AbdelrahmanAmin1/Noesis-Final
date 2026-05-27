#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCES_PATH = path.join(ROOT, 'sources', 'sources.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function countJsonl(file) {
  if (!fs.existsSync(file)) return 0;
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(line => line.trim() && !line.trim().startsWith('#'))
    .length;
}

function listFiles(dir, predicate = () => true) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (predicate(full)) out.push(full);
    }
  };
  walk(dir);
  return out;
}

function main() {
  const sources = readJson(SOURCES_PATH);
  const byClassification = new Map();
  for (const source of sources) {
    const key = source.classificationDefault || 'UNKNOWN';
    byClassification.set(key, (byClassification.get(key) || 0) + 1);
  }

  const sampleFiles = listFiles(path.join(ROOT, 'samples'), f => f.endsWith('.jsonl'));
  const evalFiles = listFiles(path.join(ROOT, 'eval'), f => f.endsWith('.jsonl'));

  console.log('# Noesis Dataset Report');
  console.log('');
  console.log(`Sources tracked: ${sources.length}`);
  console.log(`Include now: ${sources.filter(s => s.includeNow).length}`);
  console.log('');
  console.log('Classification defaults:');
  for (const [classification, count] of [...byClassification.entries()].sort()) {
    console.log(`- ${classification}: ${count}`);
  }
  console.log('');
  console.log('Sample JSONL:');
  if (!sampleFiles.length) console.log('- none');
  for (const file of sampleFiles) {
    console.log(`- ${path.relative(ROOT, file)}: ${countJsonl(file)} record(s)`);
  }
  console.log('');
  console.log('Eval JSONL:');
  if (!evalFiles.length) console.log('- none yet');
  for (const file of evalFiles) {
    console.log(`- ${path.relative(ROOT, file)}: ${countJsonl(file)} record(s)`);
  }
  console.log('');
  console.log('No training has been run by this report.');
}

main();
