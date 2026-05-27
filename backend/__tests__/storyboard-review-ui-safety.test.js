'use strict';

const fs = require('fs');
const path = require('path');

describe('StoryboardReview UI safety', () => {
  it('does not render raw teaching-goal or chunk labels', () => {
    const file = path.join(__dirname, '..', '..', 'project', 'components', 'StoryboardReview.jsx');
    const source = fs.readFileSync(file, 'utf8');

    expect(source).not.toMatch(/Teaching goal/);
    expect(source).not.toMatch(/Chunk\s+\$\{/);
    expect(source).not.toMatch(/Chunk\s+\{?item\.chunkId/);
    expect(source).toMatch(/Evidence \$\{index \+ 1\}/);
  });
});
