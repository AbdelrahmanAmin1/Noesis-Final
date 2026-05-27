#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCES_PATH = path.join(ROOT, 'sources', 'sources.json');
const CLASSIFICATIONS = new Set(['RAG_ONLY', 'FINE_TUNE_CANDIDATE', 'EVAL_ONLY', 'REJECTED']);
const BLOCKED_FINE_TUNE_PATTERNS = [
  /unknown/i,
  /unclear/i,
  /permission-required/i,
  /CC BY-SA/i,
  /BY-SA/i,
  /BY-NC/i,
  /BY-ND/i,
  /mixed/i,
  /upstream/i,
  /Stack Overflow/i,
  /research only/i,
];

function readSources() {
  return JSON.parse(fs.readFileSync(SOURCES_PATH, 'utf8'));
}

function hasBlockedFineTuneLicense(source) {
  const text = `${source.license || ''} ${source.notes || ''}`;
  return BLOCKED_FINE_TUNE_PATTERNS.some(pattern => pattern.test(text));
}

function validateSource(source, index) {
  const label = source.name || `source[${index}]`;
  const errors = [];
  const warnings = [];

  if (!source.name) errors.push('missing name');
  if (!source.url) errors.push('missing url');
  if (!source.license) errors.push('missing license');
  if (!CLASSIFICATIONS.has(source.classificationDefault)) {
    errors.push(`invalid classificationDefault: ${source.classificationDefault}`);
  }
  if (!Array.isArray(source.bestUse) || source.bestUse.length === 0) {
    errors.push('bestUse must be a non-empty array');
  }
  if (!Array.isArray(source.topicsCovered) || source.topicsCovered.length === 0) {
    warnings.push('topicsCovered is empty');
  }

  const licenseText = String(source.license || '');
  const unclear = /unknown|unclear|TBD|to be verified/i.test(licenseText);
  if (unclear && source.classificationDefault !== 'REJECTED') {
    errors.push('unclear license must default to REJECTED');
  }

  if (source.classificationDefault === 'FINE_TUNE_CANDIDATE') {
    if (!source.fineTuneAllowed) errors.push('fine-tune candidate must set fineTuneAllowed=true');
    if (hasBlockedFineTuneLicense(source)) {
      errors.push('fine-tune candidate uses blocked or unresolved license terms');
    }
    if (source.approvalRequired && !/approved|custom/i.test(licenseText)) {
      warnings.push('fine-tune candidate requires explicit review before export');
    }
  }

  if (source.approvalRequired && source.includeNow && source.classificationDefault !== 'RAG_ONLY' && source.classificationDefault !== 'FINE_TUNE_CANDIDATE') {
    warnings.push('approval-required source is included but not classified for immediate use');
  }

  return { label, errors, warnings };
}

function main() {
  const sources = readSources();
  let errorCount = 0;
  let warningCount = 0;

  for (let i = 0; i < sources.length; i++) {
    const result = validateSource(sources[i], i);
    for (const error of result.errors) {
      errorCount++;
      console.error(`ERROR ${result.label}: ${error}`);
    }
    for (const warning of result.warnings) {
      warningCount++;
      console.warn(`WARN ${result.label}: ${warning}`);
    }
  }

  if (errorCount) {
    console.error(`License validation failed: ${errorCount} error(s), ${warningCount} warning(s).`);
    process.exit(1);
  }

  console.log(`License validation passed: ${sources.length} source(s), ${warningCount} warning(s).`);
}

main();
