#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const scoring = require('../utils/eval-scoring');

const repoRoot = path.resolve(__dirname, '..', '..');
const defaultReportDir = path.join(repoRoot, 'training', 'reports');

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    if (arg.startsWith('--feature=')) args.feature = arg.split('=').slice(1).join('=');
    else if (arg.startsWith('--providers=')) args.providers = arg.split('=').slice(1).join('=');
    else if (arg.startsWith('--reports=')) args.reports = arg.split('=').slice(1).join('=');
    else if (arg.startsWith('--reports-dir=')) args.reportsDir = arg.split('=').slice(1).join('=');
  }
  return args;
}

function csv(value) {
  return String(value || '').split(',').map(part => part.trim()).filter(Boolean);
}

function fileSafe(value) {
  return String(value || 'unknown').replace(/[^a-z0-9_.-]+/gi, '-').replace(/^-+|-+$/g, '');
}

function readReport(filePath) {
  return { ...JSON.parse(fs.readFileSync(filePath, 'utf8')), reportPath: filePath };
}

function listReportFiles(reportDir = defaultReportDir) {
  if (!fs.existsSync(reportDir)) return [];
  return fs.readdirSync(reportDir)
    .filter(name => /^eval-report-.+\.json$/i.test(name))
    .map(name => path.join(reportDir, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}

function featureMatches(report, feature) {
  if (!feature || feature === 'all') return true;
  if (report.feature === feature) return true;
  return !!(report.summary && report.summary.byFeature && report.summary.byFeature[feature]);
}

function selectLatestReports(reportDir, options = {}) {
  const feature = options.feature || 'all';
  const providers = csv(options.providers || 'groq,ollama');
  const reports = listReportFiles(reportDir).map(readReport);
  const selected = [];
  for (const provider of providers) {
    const hit = reports.find(report => report.provider === provider && featureMatches(report, feature));
    if (hit) selected.push(hit);
  }
  return selected;
}

function scoreForFeature(report, feature) {
  if (!feature || feature === 'all') {
    return report.summary && (report.summary.contentAverageScore == null ? report.summary.averageScore : report.summary.contentAverageScore);
  }
  const row = report.summary && report.summary.byFeature && report.summary.byFeature[feature];
  return row ? (row.contentAverageScore == null ? row.averageScore : row.contentAverageScore) : null;
}

function passRateForFeature(report, feature) {
  if (!feature || feature === 'all') return report.summary && report.summary.passRate;
  const row = report.summary && report.summary.byFeature && report.summary.byFeature[feature];
  return row ? row.passRate : null;
}

function bestReport(reports, scoreFn) {
  const scored = reports
    .map(report => ({ report, score: scoreFn(report) }))
    .filter(item => item.score != null && Number.isFinite(Number(item.score)))
    .sort((a, b) => b.score - a.score);
  return scored[0] || null;
}

function compareReports(reports, options = {}) {
  const feature = options.feature || 'all';
  const featureNames = new Set();
  for (const report of reports) {
    const byFeature = report.summary && report.summary.byFeature || {};
    Object.keys(byFeature).forEach(name => featureNames.add(name));
  }
  const bestOverall = bestReport(reports, report => scoreForFeature(report, feature));
  const bestByFeature = {};
  for (const name of [...featureNames].sort()) {
    const best = bestReport(reports, report => scoreForFeature(report, name));
    bestByFeature[name] = best ? {
      provider: best.report.provider,
      model: best.report.model,
      averageScore: best.score,
      passRate: passRateForFeature(best.report, name),
    } : null;
  }
  const topicRows = [];
  for (const report of reports) {
    const byTopic = report.summary && report.summary.byTopic || {};
    for (const [topic, row] of Object.entries(byTopic)) {
      topicRows.push({
        provider: report.provider,
        model: report.model,
        topic,
        averageScore: row.contentAverageScore == null ? row.averageScore : row.contentAverageScore,
        overallAverageScore: row.averageScore,
        passRate: row.passRate,
        failedItemIds: row.failedItemIds || [],
      });
    }
  }
  const weakestTopics = topicRows
    .filter(row => row.averageScore != null)
    .sort((a, b) => a.averageScore - b.averageScore || a.topic.localeCompare(b.topic))
    .slice(0, 10);
  const issueCounts = {};
  for (const report of reports) {
    const candidates = report.summary && report.summary.fineTuningCandidates || [];
    for (const candidate of candidates) {
      for (const issue of candidate.issueTypes || []) {
        issueCounts[issue] = (issueCounts[issue] || 0) + 1;
      }
    }
  }
  const fineTuningNeeded = reports.some(report => report.fineTuningReadiness && report.fineTuningReadiness.needed);
  return {
    createdAt: new Date().toISOString(),
    feature,
    reportsCompared: reports.map(report => ({
      provider: report.provider,
      model: report.model,
      feature: report.feature,
      dryRun: !!report.dryRun,
      reportPath: report.reportPath || null,
      averageScore: report.summary && report.summary.averageScore,
      contentAverageScore: report.summary && report.summary.contentAverageScore,
      passRate: report.summary && report.summary.passRate,
      errorRate: report.summary && report.summary.errorRate,
      failureBreakdown: report.summary && report.summary.failureBreakdown || {},
    })),
    bestOverall: bestOverall ? {
      provider: bestOverall.report.provider,
      model: bestOverall.report.model,
      averageScore: bestOverall.score,
      passRate: passRateForFeature(bestOverall.report, feature),
    } : null,
    bestByFeature,
    weakestTopics,
    likelyIssues: issueCounts,
    failureBreakdown: reports.reduce((acc, report) => {
      const breakdown = report.summary && report.summary.failureBreakdown || {};
      for (const [category, count] of Object.entries(breakdown)) acc[category] = (acc[category] || 0) + count;
      return acc;
    }, {}),
    fineTuningReadiness: {
      needed: fineTuningNeeded,
      recommendation: fineTuningNeeded
        ? 'Review failed cases as pilot instruction examples before any LoRA/QLoRA experiment.'
        : 'Do not fine-tune yet. Use these comparisons to fix prompt, RAG, schema, or coverage failures first.',
    },
  };
}

function renderComparisonMarkdown(comparison) {
  const lines = [
    '# Noesis Evaluation Comparison',
    '',
    `- Feature: ${comparison.feature}`,
    `- Reports compared: ${comparison.reportsCompared.length}`,
    '',
    '## Best Overall',
    '',
  ];
  if (!comparison.bestOverall) lines.push('- n/a');
  else lines.push(`- ${comparison.bestOverall.provider}/${comparison.bestOverall.model}: avg=${comparison.bestOverall.averageScore}, pass=${comparison.bestOverall.passRate == null ? 'n/a' : comparison.bestOverall.passRate}`);
  lines.push('', '## Best By Feature', '');
  const featureNames = Object.keys(comparison.bestByFeature || {});
  if (!featureNames.length) lines.push('- n/a');
  else for (const feature of featureNames) {
    const row = comparison.bestByFeature[feature];
    lines.push(row
      ? `- ${feature}: ${row.provider}/${row.model} avg=${row.averageScore}, pass=${row.passRate == null ? 'n/a' : row.passRate}`
      : `- ${feature}: n/a`);
  }
  lines.push('', '## Weakest Topics', '');
  if (!comparison.weakestTopics.length) lines.push('- n/a');
  else for (const row of comparison.weakestTopics) {
    lines.push(`- ${row.topic} (${row.provider}): avg=${row.averageScore}, failed=${row.failedItemIds.join(', ') || 'none'}`);
  }
  lines.push('', '## Failure Breakdown', '');
  const breakdown = comparison.failureBreakdown || {};
  const categories = Object.keys(breakdown);
  if (!categories.length) lines.push('- n/a');
  else for (const category of categories.sort()) lines.push(`- ${category}: ${breakdown[category]}`);
  lines.push('', '## Fine-Tuning Readiness', '');
  lines.push(`- Needed now: ${comparison.fineTuningReadiness.needed ? 'yes' : 'no'}`);
  lines.push(`- Recommendation: ${comparison.fineTuningReadiness.recommendation}`);
  lines.push(`- Likely issues: ${Object.keys(comparison.likelyIssues).length ? Object.entries(comparison.likelyIssues).map(([k, v]) => `${k}=${v}`).join(', ') : 'n/a'}`);
  return `${lines.join('\n')}\n`;
}

function writeComparison(comparison, reportDir = defaultReportDir) {
  fs.mkdirSync(reportDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = `${fileSafe(comparison.feature)}-${timestamp}`;
  const jsonPath = path.join(reportDir, `eval-comparison-${base}.json`);
  const mdPath = path.join(reportDir, `eval-comparison-${base}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(comparison, null, 2));
  fs.writeFileSync(mdPath, renderComparisonMarkdown(comparison));
  return { jsonPath, mdPath };
}

function loadReportsForArgs(args) {
  const reportDir = path.resolve(args.reportsDir || defaultReportDir);
  if (args.reports) return csv(args.reports).map(file => readReport(path.resolve(file)));
  return selectLatestReports(reportDir, {
    feature: args.feature || 'all',
    providers: args.providers || 'groq,ollama',
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const feature = args.feature || 'all';
  const reportDir = path.resolve(args.reportsDir || defaultReportDir);
  const reports = loadReportsForArgs(args);
  if (!reports.length) {
    throw new scoring.EvalScoringError('no_eval_reports_found', `No eval reports found in ${reportDir}`);
  }
  const comparison = compareReports(reports, { feature });
  const written = writeComparison(comparison, reportDir);
  console.log(`Comparison JSON: ${written.jsonPath}`);
  console.log(`Comparison Markdown: ${written.mdPath}`);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err.message || err);
    if (err.details) console.error(JSON.stringify(err.details, null, 2));
    process.exit(1);
  }
}

module.exports = {
  parseArgs,
  csv,
  fileSafe,
  readReport,
  listReportFiles,
  featureMatches,
  selectLatestReports,
  compareReports,
  renderComparisonMarkdown,
  writeComparison,
  loadReportsForArgs,
};
