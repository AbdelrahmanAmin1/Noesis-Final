'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadInternals() {
  const projectRoot = path.join(__dirname, '..', '..', 'project');
  const Babel = require(path.join(projectRoot, 'vendor', 'babel.min.js'));
  const source = fs.readFileSync(path.join(projectRoot, 'components', 'MaterialMindMap.jsx'), 'utf8');
  const code = Babel.transform(source, { presets: ['react'], sourceType: 'script', filename: 'MaterialMindMap.jsx', compact: false, comments: false }).code;
  const sandbox = { window: {}, console };
  vm.runInNewContext(code, sandbox);
  return sandbox.window.NoesisMaterialMapInternals;
}

describe('material mind-map spatial layout', () => {
  const tree = {
    id: 'root', label: 'Uploaded material', children: Array.from({ length: 6 }, (_, branch) => ({
      id: `branch-${branch}`, label: `Major topic ${branch + 1}`,
      children: Array.from({ length: 4 }, (_, child) => ({ id: `branch-${branch}-child-${child}`, label: `Concept ${branch + 1}.${child + 1}` })),
    })),
  };

  it('balances collapsed branches on both sides of the root', () => {
    const { materialMapLayout } = loadInternals();
    const layout = materialMapLayout(tree, {});
    const root = layout.nodes.find(node => node.id === 'root');
    const branches = layout.nodes.filter(node => node.depth === 1);
    expect(layout.nodes.filter(node => node.depth === 2)).toHaveLength(0);
    expect(branches.some(node => node.x < root.x)).toBe(true);
    expect(branches.some(node => node.x > root.x)).toBe(true);
    expect(layout.width).toBeGreaterThanOrEqual(900);
    expect(layout.height).toBeGreaterThanOrEqual(620);
  });

  it('expands one branch without overlapping visible nodes', () => {
    const { materialMapLayout } = loadInternals();
    const layout = materialMapLayout(tree, { 'branch-0': true });
    expect(layout.nodes.filter(node => node.depth === 2)).toHaveLength(4);
    for (let i = 0; i < layout.nodes.length; i += 1) {
      for (let j = i + 1; j < layout.nodes.length; j += 1) {
        const a = layout.nodes[i], b = layout.nodes[j];
        const overlaps = Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
        expect(overlaps, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  it('uses smooth curved connectors', () => {
    const { materialMapEdgePath } = loadInternals();
    const pathData = materialMapEdgePath({ x: 100, y: 100, w: 200 }, { x: 420, y: 220, w: 180 });
    expect(pathData).toMatch(/^M /);
    expect(pathData).toContain(' C ');
  });

  it('finds a task topic and expands its parent branch when needed', () => {
    const { findMaterialMapTopic } = loadInternals();
    expect(findMaterialMapTopic(tree, 'Concept 1.3')).toEqual({
      id: 'branch-0-child-2',
      expandIds: ['branch-0'],
    });
    expect(findMaterialMapTopic(tree, 'Missing topic')).toBeNull();
  });
});
