'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { setupTestEnv, cleanupTestDb } = require('./helpers/setup');
const request = require('supertest');

describe('material analysis persistence', () => {
  beforeEach(() => {
    vi.resetModules();
    setupTestEnv();
    cleanupTestDb();
  });

  afterEach(() => cleanupTestDb());

  it('keeps raw text, activates atomically, and exposes the complete analysis contract', async () => {
    const { migrate, getDb } = require('../config/db');
    migrate();
    const db = getDb();
    const service = require('../services/material-analysis.service');
    const now = new Date().toISOString();
    const filePath = path.join(os.tmpdir(), `noesis-analysis-${Date.now()}.txt`);
    fs.writeFileSync(filePath, 'traceable source', 'utf8');
    const userId = Number(db.prepare('INSERT INTO users (email, password_hash, name, created_at) VALUES (?,?,?,?)')
      .run(`analysis-${Date.now()}@example.com`, 'hash', 'Analysis User', now).lastInsertRowid);
    const materialId = Number(db.prepare(`INSERT INTO materials
      (user_id, title, type, file_path, mime, size_bytes, status, progress, created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(userId, 'Encapsulation', 'note', filePath, 'text/plain', 16, 'processing', 30, now).lastInsertRowid);
    const material = db.prepare('SELECT * FROM materials WHERE id=?').get(materialId);
    const result = await service.analyzeAndPersist({
      material,
      pipelineVersion: 3,
      structured: {
        type: 'text',
        text: 'Page 1\nPresented by Dr. Example\nDefinition: Encapsulation protects private state with public methods.',
        pageCount: 1,
        pages: [{ pageNumber: 1, heading: 'Encapsulation', text: 'Page 1\nPresented by Dr. Example\nDefinition: Encapsulation protects private state with public methods.', normalText: 'Page 1\nPresented by Dr. Example\nDefinition: Encapsulation protects private state with public methods.', ocrText: '', sourceKind: 'text' }],
        visualSources: [],
      },
    });

    expect(db.prepare('SELECT active_analysis_run_id FROM materials WHERE id=?').get(materialId).active_analysis_run_id).toBeNull();
    db.prepare(`INSERT INTO chunks
      (material_id, idx, text, raw_text, token_count, analysis_run_id, content_type, relevance_score, relevance_level, relevance_reasons_json)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(materialId, 0, result.view.cleanedEducationalText, result.view.cleanedEducationalText, 20, result.analysisRunId, 'definition', 0.9, 'high', '["educational_definition"]');
    service.activateRun(materialId, result.analysisRunId);
    const analysis = service.getAnalysis(userId, materialId);

    expect(analysis.rawExtractedText).toMatch(/Presented by Dr\. Example/);
    expect(analysis.cleanedEducationalText).toMatch(/Encapsulation protects private state/);
    expect(analysis.cleanedEducationalText).not.toMatch(/Presented by/);
    expect(analysis.lowValueTextRemoved.map(item => item.text).join(' ')).toMatch(/Presented by/);
    expect(Object.keys(analysis)).toEqual(expect.arrayContaining([
      'rawExtractedText', 'cleanedEducationalText', 'lowValueTextRemoved', 'topicRelevantChunks',
      'extractedVisualAssets', 'selectedVisualAssetsForVideo', 'codeBlocks', 'diagrams', 'tables',
      'ocrConfidenceScores', 'warnings',
    ]));
    expect(analysis.topicRelevantChunks[0]).toMatchObject({ contentType: 'definition', relevanceLevel: 'high' });
    try { fs.unlinkSync(filePath); } catch (_) {}
  });
});

describe('material analysis API', () => {
  beforeEach(() => {
    vi.resetModules();
    setupTestEnv();
    cleanupTestDb();
  });

  afterEach(() => cleanupTestDb());

  it('returns the active completed analysis through the authenticated endpoint', async () => {
    const express = require('express');
    const cookieParser = require('cookie-parser');
    const { migrate, getDb } = require('../config/db');
    const { notFound, errorHandler } = require('../middleware/error');
    migrate();
    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use('/api/auth', require('../routes/auth.routes'));
    app.use('/api/materials', require('../routes/material.routes'));
    app.use(notFound);
    app.use(errorHandler);
    const signup = await request(app).post('/api/auth/signup').send({ email: `analysis-api-${Date.now()}@example.com`, password: 'TestPass123!', name: 'Analysis API' });
    const db = getDb();
    const now = new Date().toISOString();
    const materialId = Number(db.prepare(`INSERT INTO materials
      (user_id, title, type, file_path, mime, size_bytes, status, progress, extraction_diagnostics_json, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(signup.body.user.id, 'Queues', 'note', 'missing-but-analyzed.txt', 'text/plain', 20, 'ready', 100, JSON.stringify({ extractionPipelineVersion: 3 }), now).lastInsertRowid);
    const runId = Number(db.prepare(`INSERT INTO material_analysis_runs
      (material_id, pipeline_version, status, raw_extracted_text, cleaned_educational_text, low_value_text_json, ocr_confidence_json, warnings_json, created_at, completed_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(materialId, 3, 'completed', 'Page 1\nQueue FIFO', 'Queue FIFO', '[]', '{"pages":[]}', '[]', now, now).lastInsertRowid);
    db.prepare('UPDATE materials SET active_analysis_run_id=? WHERE id=?').run(runId, materialId);
    db.prepare(`INSERT INTO chunks
      (material_id, idx, text, raw_text, token_count, analysis_run_id, content_type, relevance_score, relevance_level, relevance_reasons_json)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(materialId, 0, 'Queue FIFO', 'Queue FIFO', 3, runId, 'definition', 0.8, 'high', '[]');

    const response = await request(app).get(`/api/materials/${materialId}/analysis`).set('Authorization', `Bearer ${signup.body.token}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ materialId, analysisRunId: runId, cleanedEducationalText: 'Queue FIFO' });
    expect(response.body).toHaveProperty('selectedVisualAssetsForVideo');
    expect(response.body).toHaveProperty('ocrConfidenceScores');
  });
});
