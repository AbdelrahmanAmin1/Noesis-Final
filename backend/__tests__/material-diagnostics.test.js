'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { setupTestEnv, cleanupTestDb } = require('./helpers/setup');

describe('material-diagnostics.service internals', () => {
  it('labels slide-backed chunks as evidence locations', () => {
    const { _internals } = require('../services/material-diagnostics.service');
    const label = _internals.evidenceLabelForChunk({
      idx: 2,
      slide_number: 5,
      slide_title: 'Encapsulation',
    });
    expect(label).toBe('Slide 5: Encapsulation');
  });

  it('detects empty and short extraction states', () => {
    const { _internals } = require('../services/material-diagnostics.service');
    const empty = _internals.classifyWeakness({
      extractedCharCount: 0,
      chunkCount: 0,
      embeddedChunkCount: 0,
      chunkReferences: [],
      fileExists: true,
      materialStatus: 'ready',
    });
    expect(empty.usable).toBe(false);
    expect(empty.weaknessFlags).toContain('empty_extraction');

    const short = _internals.classifyWeakness({
      extractedCharCount: 300,
      chunkCount: 2,
      embeddedChunkCount: 2,
      chunkReferences: [{ heading: 'Class' }, { heading: 'Object' }],
      fileExists: true,
      materialStatus: 'ready',
    });
    expect(short.weak).toBe(true);
    expect(short.weaknessFlags).toContain('short_extraction');
  });

  it('attaches retrieval scores without changing extraction diagnostics', () => {
    const { attachRetrievalDiagnostics } = require('../services/material-diagnostics.service');
    const diagnostics = attachRetrievalDiagnostics(
      { materialId: 7, chunkCount: 3 },
      { maxScore: 0.42, meanScore: 0.21, chunks: [{ id: 10 }, { id: 11 }] }
    );
    expect(diagnostics.chunkCount).toBe(3);
    expect(diagnostics.retrieval).toEqual({
      chunkCount: 2,
      chunkIds: [10, 11],
      maxScore: 0.42,
      meanScore: 0.21,
    });
  });
});

describe('buildMaterialDiagnostics', () => {
  beforeEach(() => {
    vi.resetModules();
    setupTestEnv();
    cleanupTestDb();
  });

  it('reports extraction, chunks, source file, and evidence references', async () => {
    const { migrate, getDb } = require('../config/db');
    migrate();
    const db = getDb();
    const { buildMaterialDiagnostics } = require('../services/material-diagnostics.service');

    const sourceText = Array(45)
      .fill('Encapsulation hides private fields behind public methods so object state stays valid.')
      .join('\n');
    const filePath = path.join(os.tmpdir(), `noesis-diagnostics-${Date.now()}.txt`);
    fs.writeFileSync(filePath, sourceText, 'utf8');

    const userId = db.prepare("INSERT INTO users (email, password_hash, name, created_at) VALUES (?,?,?,?)")
      .run(`diag${Date.now()}@example.com`, 'hash', 'Diagnostics User', new Date().toISOString()).lastInsertRowid;
    const materialId = db.prepare(`INSERT INTO materials
      (user_id, title, type, file_path, mime, size_bytes, status, progress, created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(userId, 'Encapsulation Notes', 'txt', filePath, 'text/plain', sourceText.length, 'ready', 100, new Date().toISOString()).lastInsertRowid;
    const chapterId = db.prepare('INSERT INTO chapters (material_id, idx, title, char_start, char_end) VALUES (?,?,?,?,?)')
      .run(materialId, 0, 'Encapsulation', 0, sourceText.length).lastInsertRowid;

    const insertChunk = db.prepare(`INSERT INTO chunks
      (material_id, chapter_id, idx, text, token_count, embedding, chapter_title, heading, slide_number, slide_title, section_title, has_code, keywords_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    insertChunk.run(
      materialId,
      chapterId,
      0,
      'Private fields should be accessed through public methods.',
      12,
      Buffer.from([1, 2, 3]),
      'Encapsulation',
      'Private Fields',
      4,
      'Encapsulation',
      'Private Fields',
      1,
      JSON.stringify(['private', 'public'])
    );
    insertChunk.run(
      materialId,
      chapterId,
      1,
      'A method like increment() controls how state changes.',
      10,
      Buffer.from([4, 5, 6]),
      'Encapsulation',
      'Public Methods',
      5,
      'Controlled Access',
      'Public Methods',
      1,
      JSON.stringify(['method', 'state'])
    );

    const diagnostics = await buildMaterialDiagnostics(materialId, { userId });
    expect(diagnostics.sourceFileName).toBe(path.basename(filePath));
    expect(diagnostics.sourceFileExists).toBe(true);
    expect(diagnostics.extractedCharCount).toBe(sourceText.length);
    expect(diagnostics.chunkCount).toBe(2);
    expect(diagnostics.evidenceCount).toBe(2);
    expect(diagnostics.embeddedChunkCount).toBe(2);
    expect(diagnostics.slideNumbers).toEqual([4, 5]);
    expect(diagnostics.chunkIds).toHaveLength(2);
    expect(diagnostics.chunkReferences[0].evidenceLabel).toBe('Slide 4: Encapsulation');
    expect(diagnostics.chunkReferences[0].keywords).toContain('private');
    expect(diagnostics.usable).toBe(true);

    try { fs.unlinkSync(filePath); } catch (_) {}
  });
});
