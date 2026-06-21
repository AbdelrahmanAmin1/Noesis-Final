'use strict';

const jobs = require('../services/jobs.service');

describe('jobs.service active job lookup', () => {
  it('reuses only queued or running reindex jobs for the same material', () => {
    const userId = Date.now();
    const first = jobs.create('material_reindex', { userId, materialId: 42 });

    expect(jobs.findActive('material_reindex', { userId, materialId: 42 })).toBe(first);
    expect(jobs.findActive('material_reindex', { userId, materialId: 43 })).toBeNull();

    jobs.update(first.id, { status: 'completed' });
    expect(jobs.findActive('material_reindex', { userId, materialId: 42 })).toBeNull();
  });
});
