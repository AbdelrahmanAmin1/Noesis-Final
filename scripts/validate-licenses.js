'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LOCK_PATH = path.join(ROOT, 'backend', 'package-lock.json');
const ALLOW_WITH_WARNING = new Set(['GPLv3', 'GPL-3.0', 'LGPL-2.1', 'https://git.ffmpeg.org/gitweb/ffmpeg.git/blob_plain/HEAD:/LICENSE.md']);

function main() {
  const lock = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
  const packages = lock.packages || {};
  const rows = [];
  for (const [name, meta] of Object.entries(packages)) {
    if (!name || !name.startsWith('node_modules/')) continue;
    const pkg = name.replace(/^node_modules\//, '');
    rows.push({
      package: pkg,
      version: meta.version || '',
      license: meta.license || 'UNKNOWN',
      optional: !!meta.optional,
      warning: !meta.license ? 'missing license metadata' : ALLOW_WITH_WARNING.has(meta.license) ? 'review copyleft/binary redistribution obligations' : '',
    });
  }
  const warnings = rows.filter(row => row.warning);
  const summary = {
    generatedAt: new Date().toISOString(),
    command: 'node scripts/validate-licenses.js',
    packagesChecked: rows.length,
    warnings: warnings.length,
    ok: rows.length > 0 && warnings.every(row => row.optional || row.license !== 'UNKNOWN'),
    warningRows: warnings,
    results: rows,
  };

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`License validation: ${summary.packagesChecked} packages, ${summary.warnings} warning(s).`);
    for (const row of warnings.slice(0, 40)) {
      console.log(`WARN ${row.package}@${row.version}: ${row.license} - ${row.warning}`);
    }
  }

  process.exit(summary.ok ? 0 : 1);
}

main();
