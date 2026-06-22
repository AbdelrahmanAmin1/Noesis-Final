'use strict';

const fs = require('fs');
const path = require('path');

describe('Materials quiz generation UI contract', () => {
  it('requests an eight-question quiz with a six-question minimum', () => {
    const file = path.join(__dirname, '..', '..', 'project', 'components', 'Materials.jsx');
    const source = fs.readFileSync(file, 'utf8');

    expect(source).toMatch(/count:\s*8/);
    expect(source).toMatch(/min_count:\s*6/);
    expect(source).toContain('Six to eight grounded questions from the full lecture');
  });
});
