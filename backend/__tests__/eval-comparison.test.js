'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const compare = require('../scripts/eval-noesis-compare');

function report(provider, averageScore, opts = {}) {
  return {
    provider,
    model: opts.model || `${provider}-model`,
    feature: opts.feature || 'all',
    dryRun: false,
    summary: {
      averageScore,
      contentAverageScore: opts.contentAverageScore == null ? averageScore : opts.contentAverageScore,
      passRate: opts.passRate == null ? 0.5 : opts.passRate,
      errorRate: opts.errorRate == null ? 0 : opts.errorRate,
      failureBreakdown: opts.failureBreakdown || {},
      byFeature: opts.byFeature || {
        tutor: { averageScore, contentAverageScore: opts.contentAverageScore == null ? averageScore : opts.contentAverageScore, passRate: opts.passRate == null ? 0.5 : opts.passRate, errorRate: 0, failedItemIds: [] },
      },
      byTopic: opts.byTopic || {
        Encapsulation: { averageScore, contentAverageScore: opts.contentAverageScore == null ? averageScore : opts.contentAverageScore, passRate: opts.passRate == null ? 0.5 : opts.passRate, failedItemIds: opts.failedItemIds || [] },
      },
      fineTuningCandidates: opts.candidates || [],
    },
    fineTuningReadiness: opts.readiness || { needed: false, recommendation: 'no' },
  };
}

describe('eval-noesis comparison tooling', () => {
  it('compares providers overall and by feature', () => {
    const groq = report('groq', 2.7, {
      byFeature: {
        tutor: { averageScore: 3, passRate: 1, errorRate: 0, failedItemIds: [] },
        quiz: { averageScore: 2.2, passRate: 0.5, errorRate: 0, failedItemIds: ['q1'] },
      },
    });
    const ollama = report('ollama', 1.8, {
      byFeature: {
        tutor: { averageScore: 2, passRate: 0.5, errorRate: 0, failedItemIds: ['t1'] },
        quiz: { averageScore: 2.5, passRate: 1, errorRate: 0, failedItemIds: [] },
      },
    });

    const result = compare.compareReports([groq, ollama], { feature: 'all' });

    expect(result.bestOverall.provider).toBe('groq');
    expect(result.bestByFeature.tutor.provider).toBe('groq');
    expect(result.bestByFeature.quiz.provider).toBe('ollama');
  });

  it('renders a markdown comparison summary', () => {
    const result = compare.compareReports([report('groq', 2.5), report('ollama', 2.1)], { feature: 'all' });
    const markdown = compare.renderComparisonMarkdown(result);

    expect(markdown).toContain('Noesis Evaluation Comparison');
    expect(markdown).toContain('Best Overall');
    expect(markdown).toContain('Fine-Tuning Readiness');
  });

  it('writes ignored comparison report files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noesis-eval-'));
    const result = compare.compareReports([report('groq', 2.5), report('ollama', 2.1)], { feature: 'all' });
    const written = compare.writeComparison(result, dir);

    expect(fs.existsSync(written.jsonPath)).toBe(true);
    expect(fs.existsSync(written.mdPath)).toBe(true);
    expect(path.basename(written.jsonPath)).toMatch(/^eval-comparison-/);
  });

  it('selects latest reports by provider and feature', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noesis-eval-select-'));
    const oldPath = path.join(dir, 'eval-report-all-groq-old.json');
    const newPath = path.join(dir, 'eval-report-all-groq-new.json');
    fs.writeFileSync(oldPath, JSON.stringify(report('groq', 1.2)));
    fs.writeFileSync(newPath, JSON.stringify(report('groq', 2.4)));
    const oldTime = Date.now() - 10000;
    fs.utimesSync(oldPath, oldTime / 1000, oldTime / 1000);

    const selected = compare.selectLatestReports(dir, { providers: 'groq', feature: 'all' });

    expect(selected).toHaveLength(1);
    expect(selected[0].summary.averageScore).toBe(2.4);
  });

  it('compares content scores separately from provider/runtime failures', () => {
    const groq = report('groq', 0.8, {
      contentAverageScore: 2.6,
      errorRate: 0.6,
      failureBreakdown: { TOKEN_LIMIT_FAILURE: 2 },
      byFeature: {
        quiz: { averageScore: 0.6, contentAverageScore: null, passRate: 0, errorRate: 1, failedItemIds: ['q1'] },
      },
    });
    const ollama = report('ollama', 1.8, {
      contentAverageScore: 1.8,
      failureBreakdown: { TIMEOUT: 1 },
      byFeature: {
        quiz: { averageScore: 1.8, contentAverageScore: 1.8, passRate: 0.5, errorRate: 0.5, failedItemIds: ['q2'] },
      },
    });

    const result = compare.compareReports([groq, ollama], { feature: 'all' });
    const markdown = compare.renderComparisonMarkdown(result);

    expect(result.bestOverall.provider).toBe('groq');
    expect(result.failureBreakdown.TOKEN_LIMIT_FAILURE).toBe(2);
    expect(result.failureBreakdown.TIMEOUT).toBe(1);
    expect(markdown).toContain('Failure Breakdown');
  });
});
