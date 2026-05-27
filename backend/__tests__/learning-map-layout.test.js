'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadLearningMapInternals() {
  const projectRoot = path.join(__dirname, '..', '..', 'project');
  const Babel = require(path.join(projectRoot, 'vendor', 'babel.min.js'));
  const source = fs.readFileSync(path.join(projectRoot, 'components', 'LearningMap.jsx'), 'utf8');
  const code = Babel.transform(source, {
    presets: ['react'],
    sourceType: 'script',
    filename: 'LearningMap.jsx',
    compact: false,
    comments: false,
  }).code;
  const sandbox = { window: {}, console };
  vm.runInNewContext(code, sandbox);
  return sandbox.window.NoesisLearningMapInternals;
}

describe('learning map hybrid layout', () => {
  const tree = {
    id: 'root',
    label: 'OOP',
    children: [{
      id: 'branch-polymorphism',
      label: 'Polymorphism',
      children: [
        { id: 'runtime-dispatch', label: 'Runtime dispatch' },
        { id: 'override-rule', label: 'Override rule' },
        { id: 'overloading', label: 'Overloading' },
      ],
    }, {
      id: 'branch-encapsulation',
      label: 'Encapsulation',
      children: [
        { id: 'private-fields', label: 'Private fields' },
        { id: 'getters-setters', label: 'Getters & setters' },
      ],
    }],
  };

  const compactCfg = { nodeHeight: 36, levelGap: 18, rowGap: 12, childRowGap: 7, laneGap: 8, branchWidth: 120, childWidth: 104, leftPad: 8, topPad: 18, canvasWidth: 300, pad: 14 };
  const fullCfg = { nodeHeight: 46, levelGap: 30, rowGap: 18, childRowGap: 10, laneGap: 12, branchWidth: 190, childWidth: 150, leftPad: 20, topPad: 28, canvasWidth: 700, pad: 28 };

  it('stacks main branches vertically under the root', () => {
    const internals = loadLearningMapInternals();
    const layout = internals.layoutTree(tree, {}, fullCfg);
    const root = layout.positions.get('root');
    const poly = layout.positions.get('branch-polymorphism');
    const encap = layout.positions.get('branch-encapsulation');

    expect(poly.y).toBeGreaterThan(root.y);
    expect(encap.y).toBeGreaterThan(poly.y);
    expect(encap.x).toBe(poly.x);
  });

  it('expands branch children horizontally inside the branch row', () => {
    const internals = loadLearningMapInternals();
    const layout = internals.layoutTree(tree, { 'branch-polymorphism': true }, fullCfg);
    const branch = layout.positions.get('branch-polymorphism');
    const runtime = layout.positions.get('runtime-dispatch');
    const override = layout.positions.get('override-rule');

    expect(runtime.x).toBeGreaterThan(branch.x + branch.w);
    expect(override.x).toBeGreaterThan(runtime.x);
    expect(Math.abs(runtime.y - branch.y)).toBeLessThanOrEqual(branch.h);
  });

  it('wraps compact children without exceeding the compact width', () => {
    const internals = loadLearningMapInternals();
    const layout = internals.layoutTree(tree, { 'branch-polymorphism': true, 'branch-encapsulation': true }, compactCfg);

    expect(layout.bounds.w).toBeLessThanOrEqual(300);
    for (const [, pos] of layout.positions) {
      expect(pos.x).toBeGreaterThanOrEqual(0);
      expect(pos.x + pos.w).toBeLessThanOrEqual(300);
    }
  });

  it('hides collapsed children', () => {
    const internals = loadLearningMapInternals();
    const collapsed = internals.layoutTree(tree, {}, fullCfg);
    const expanded = internals.layoutTree(tree, { 'branch-polymorphism': true }, fullCfg);

    expect(collapsed.positions.has('runtime-dispatch')).toBe(false);
    expect(expanded.positions.has('runtime-dispatch')).toBe(true);
  });

  it('uses horizontal connectors for same-row child lanes', () => {
    const internals = loadLearningMapInternals();
    const layout = internals.layoutTree(tree, { 'branch-polymorphism': true }, fullCfg);
    const branch = layout.positions.get('branch-polymorphism');
    const runtime = layout.positions.get('runtime-dispatch');
    const pathData = internals.edgePath(branch, runtime);

    expect(pathData).toMatch(/H/);
    expect(pathData).toMatch(/V/);
  });

  it('wraps long SVG labels into bounded lines with ellipsis', () => {
    const internals = loadLearningMapInternals();
    const label = 'Appendicular skeleton upper limb bones lower limb bones shoulder girdle and pelvic girdle classification';
    const lines = internals.wrapSvgLabel(label, 18, 3);

    expect(lines.length).toBeLessThanOrEqual(3);
    expect(lines.every(line => line.length <= 19)).toBe(true);
    expect(lines.join(' ')).toMatch(/Appendicular skeleton/i);
    expect(lines[lines.length - 1]).toMatch(/\.\.\.$/);
  });
});
