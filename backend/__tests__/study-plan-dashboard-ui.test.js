'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadInternals() {
  const projectRoot = path.join(__dirname, '..', '..', 'project');
  const Babel = require(path.join(projectRoot, 'vendor', 'babel.min.js'));
  const source = fs.readFileSync(path.join(projectRoot, 'components', 'StudyPlan.jsx'), 'utf8');
  const code = Babel.transform(source, { presets: ['react'], sourceType: 'script', filename: 'StudyPlan.jsx', compact: false, comments: false }).code;
  const sandbox = { window: {}, console };
  vm.runInNewContext(code, sandbox);
  return { internals: sandbox.window.NoesisStudyPlanInternals, source };
}

describe('study plan dashboard UI contract', () => {
  it('derives stable visual task states without adding a new persisted status', () => {
    const { internals } = loadInternals();
    expect(internals.taskStatus({ status: 'completed' }, 0, 1).key).toBe('completed');
    expect(internals.taskStatus({ status: 'pending' }, 1, 1).key).toBe('up-next');
    expect(internals.taskStatus({ status: 'pending' }, 2, 1).key).toBe('planned');
    expect(internals.sameTopic('Binary Search Tree', 'binary-search-tree')).toBe(true);
    expect(internals.clampPercent(140)).toBe(100);
  });

  it('keeps task selection and map selection linked through public map props', () => {
    const { source } = loadInternals();
    expect(source).toContain('activeTopic={selectedTopic}');
    expect(source).toContain('onNodeSelect={node => selectTopic(node && node.label)}');
    expect(source).toContain('window.NoesisAPI.gamification.summary()');
  });

  it('shows provenance for new source-aware plans without requiring it on legacy plans', () => {
    const { source } = loadInternals();
    expect(source).toContain('planJson.source && planJson.source.label');
    expect(source).toContain('{planJson.source.label}');
  });
});
