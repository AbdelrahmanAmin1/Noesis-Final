'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SEED_DIR = path.join(ROOT, 'backend', 'seed');

function listMarkdownFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listMarkdownFiles(full));
    else if (/\.(md|txt)$/i.test(entry.name)) out.push(full);
  }
  return out.sort();
}

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function validateFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  const warnings = [];
  if (text.trim().length < 500) warnings.push('content shorter than 500 characters');
  if (!/^#\s+/m.test(text) && !/^##\s+/m.test(text)) warnings.push('missing markdown heading');
  if (!/(complexity|class|object|array|stack|queue|tree|graph|hash|inheritance|encapsulation|polymorphism|solid|interface)/i.test(text)) {
    warnings.push('missing expected CS topic vocabulary');
  }
  return {
    file: rel(file),
    bytes: Buffer.byteLength(text),
    headings: (text.match(/^#{1,3}\s+/gm) || []).length,
    warnings,
    ok: warnings.length === 0,
  };
}

function main() {
  const files = listMarkdownFiles(SEED_DIR);
  const results = files.map(validateFile);
  const warnings = results.flatMap(item => item.warnings.map(warning => ({ file: item.file, warning })));
  const summary = {
    generatedAt: new Date().toISOString(),
    command: 'node scripts/validate-knowledge.js',
    filesValidated: results.length,
    warnings: warnings.length,
    ok: results.length > 0 && warnings.length === 0,
    results,
  };

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Knowledge validation: ${summary.filesValidated} files, ${summary.warnings} warning(s).`);
    for (const item of results) {
      console.log(`${item.ok ? 'PASS' : 'WARN'} ${item.file} (${item.bytes} bytes, ${item.headings} headings)`);
      for (const warning of item.warnings) console.log(`  - ${warning}`);
    }
  }

  process.exit(summary.ok ? 0 : 1);
}

main();
