'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PROJECT = path.join(ROOT, 'project');
const HTML = path.join(PROJECT, 'Noesis.html');

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function main() {
  const html = fs.readFileSync(HTML, 'utf8');
  const refs = [];
  const refRegex = /\b(?:src|href)="([^"]+)"/g;
  let match;
  while ((match = refRegex.exec(html))) {
    const value = match[1];
    if (/^(https?:)?\/\//i.test(value) || value.startsWith('#')) continue;
    refs.push(value);
  }
  const localReferences = refs.map(value => {
    const cleanValue = value.split(/[?#]/)[0];
    const full = path.join(PROJECT, cleanValue);
    return { reference: value, file: rel(full), exists: fs.existsSync(full) };
  });

  const apiPath = path.join(PROJECT, 'api.js');
  const api = fs.readFileSync(apiPath, 'utf8');
  const requiredMarkers = [
    'auth.signup', 'auth.signin', 'auth.me', 'materials.upload', 'notes.generate',
    'flashcards.generate', 'quizzes.generate', 'tutor.start', 'dashboard.get',
    'videos.generate', 'pollJob',
  ];
  const markerResults = requiredMarkers.map(marker => ({
    marker,
    present: api.includes(marker.split('.')[0]) && api.includes(marker.split('.')[1] || marker),
  }));

  const componentRefs = localReferences.filter(item => item.reference.includes('components/'));
  const summary = {
    generatedAt: new Date().toISOString(),
    command: 'node scripts/verify-frontend-bundle.js',
    html: rel(HTML),
    checkedReferences: localReferences.length,
    missingReferences: localReferences.filter(item => !item.exists),
    sourceFilesBuilt: componentRefs.length + 1,
    markerCount: markerResults.length,
    markerFailures: markerResults.filter(item => !item.present),
    ok: localReferences.every(item => item.exists) && markerResults.every(item => item.present),
    localReferences,
    markerResults,
  };

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Frontend verification: ${summary.sourceFilesBuilt} source files checked, ${summary.missingReferences.length} missing reference(s), ${summary.markerFailures.length} marker failure(s).`);
    for (const item of localReferences) console.log(`${item.exists ? 'PASS' : 'FAIL'} ${item.reference}`);
    for (const item of markerResults) console.log(`${item.present ? 'PASS' : 'FAIL'} API marker ${item.marker}`);
  }

  process.exit(summary.ok ? 0 : 1);
}

main();
