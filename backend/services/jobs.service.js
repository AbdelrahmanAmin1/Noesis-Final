'use strict';

const crypto = require('crypto');

const _jobs = new Map();

function create(kind, meta = {}) {
  const id = crypto.randomBytes(10).toString('hex');
  const job = { id, kind, status: 'queued', progress: 0, error: null, result: null, meta, createdAt: Date.now() };
  _jobs.set(id, job);
  return job;
}

function update(id, patch) {
  const j = _jobs.get(id);
  if (!j) return null;
  Object.assign(j, patch, { updatedAt: Date.now() });
  return j;
}

function get(id) {
  return _jobs.get(id) || null;
}

function listFor(userId) {
  return [..._jobs.values()].filter(j => j.meta.userId === userId);
}

module.exports = { create, update, get, listFor };
