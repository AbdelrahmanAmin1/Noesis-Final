'use strict';

const path = require('path');
const { getDb } = require('../config/db');
const { embedAndStore } = require('../services/rag.service');
const knowledge = require('../services/knowledge.service');
const { ensureSystemUser, SYSTEM_USER_ID } = require('./seed-tutor-corpus');
const log = require('../utils/logger');

const MATERIAL_PREFIX = 'Curated Knowledge: ';

function nowIso() {
  return new Date().toISOString();
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text || '').split(/\s+/).filter(Boolean).length * 1.3));
}

function asList(values) {
  return Array.isArray(values) ? values.filter(value => value !== null && value !== undefined && String(value).trim() !== '') : [];
}

function mistakeText(item) {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object') return '';
  return [
    item.mistake && `Mistake: ${item.mistake}`,
    item.whyItHappens && `Why it happens: ${item.whyItHappens}`,
    item.correction && `Correction: ${item.correction}`,
  ].filter(Boolean).join(' ');
}

function diagramText(diagram) {
  if (!diagram || typeof diagram !== 'object') return '';
  return [
    `Diagram: ${diagram.title || diagram.type || 'visual model'}`,
    diagram.type && `Type: ${diagram.type}`,
    diagram.caption && `Caption: ${diagram.caption}`,
    Array.isArray(diagram.nodes) && diagram.nodes.length ? `Nodes: ${JSON.stringify(diagram.nodes)}` : '',
    Array.isArray(diagram.edges) && diagram.edges.length ? `Edges: ${JSON.stringify(diagram.edges)}` : '',
  ].filter(Boolean).join('\n');
}

function codeExampleText(example) {
  if (!example || typeof example !== 'object') return '';
  const walkthrough = asList(example.walkthrough || example.explanation)
    .map(step => {
      if (typeof step === 'string') return `- ${step}`;
      return `- ${step.lineRange || 'line'}: ${step.text || ''}`;
    })
    .join('\n');
  return [
    `Code example: ${example.title || 'Example'}`,
    `Language: ${example.language || 'text'}`,
    '```' + (example.language || ''),
    example.code || example.content || '',
    '```',
    walkthrough && `Walkthrough:\n${walkthrough}`,
  ].filter(Boolean).join('\n');
}

function quizText(item) {
  if (typeof item === 'string') return `Question: ${item}`;
  if (!item || typeof item !== 'object') return '';
  return [
    item.question && `Question: ${item.question}`,
    Array.isArray(item.options) && item.options.length ? `Options: ${item.options.join(' | ')}` : '',
    item.answer && `Answer: ${item.answer}`,
    item.explanation && `Explanation: ${item.explanation}`,
  ].filter(Boolean).join(' ');
}

function flashcardText(card) {
  if (!card || typeof card !== 'object') return '';
  return `Flashcard: ${card.front || ''} -> ${card.back || ''}`;
}

function topicKeywords(topic) {
  return [
    topic.id,
    topic.topic,
    topic.domain,
    ...(topic.aliases || []),
    ...(topic.prerequisites || []),
    ...(topic.nextTopics || []),
  ].filter(Boolean);
}

function chunk(topic, heading, text, options = {}) {
  const clean = String(text || '').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return null;
  return {
    heading,
    text: [
      `Topic: ${topic.topic}`,
      `Domain: ${topic.domain || 'general'}`,
      `Aliases: ${(topic.aliases || []).join(', ')}`,
      `Source: curated project-authored knowledge (${topic._relativeFile || topic.id})`,
      '',
      clean,
    ].join('\n'),
    hasCode: options.hasCode ? 1 : 0,
    keywords: topicKeywords(topic),
  };
}

function buildTopicChunks(topic) {
  const chunks = [
    chunk(topic, `${topic.topic} overview`, [
      `Definition: ${topic.definition || ''}`,
      topic.whyItMatters && `Why it matters: ${topic.whyItMatters}`,
      topic.deepExplanation && `Deep explanation: ${topic.deepExplanation}`,
      topic.analogy && `Analogy: ${topic.analogy}`,
      asList(topic.prerequisites).length ? `Prerequisites: ${topic.prerequisites.join(', ')}` : '',
      asList(topic.nextTopics).length ? `Next topics: ${topic.nextTopics.join(', ')}` : '',
    ].filter(Boolean).join('\n\n')),
    chunk(topic, `${topic.topic} code examples`, asList(topic.codeExamples).map(codeExampleText).join('\n\n'), { hasCode: true }),
    chunk(topic, `${topic.topic} diagrams`, [
      asList(topic.diagrams).map(diagramText).join('\n\n'),
      asList(topic.visualTemplates).length ? `Visual templates: ${topic.visualTemplates.map(v => typeof v === 'string' ? v : JSON.stringify(v)).join(', ')}` : '',
    ].filter(Boolean).join('\n\n')),
    chunk(topic, `${topic.topic} mistakes and best practices`, [
      asList(topic.commonMistakes).map(mistakeText).filter(Boolean).join('\n'),
      asList(topic.bestPractices).length ? `Best practices:\n${topic.bestPractices.map(item => `- ${item}`).join('\n')}` : '',
    ].filter(Boolean).join('\n\n')),
    chunk(topic, `${topic.topic} checks and flashcards`, [
      asList(topic.miniQuiz || topic.practiceQuestions).map(quizText).filter(Boolean).join('\n'),
      asList(topic.flashcards).map(flashcardText).filter(Boolean).join('\n'),
      topic.complexity && typeof topic.complexity === 'object' ? `Complexity: ${JSON.stringify(topic.complexity)}` : '',
    ].filter(Boolean).join('\n\n')),
  ].filter(Boolean);

  return chunks.map((item, idx) => ({ ...item, idx }));
}

function materialTitle(topic) {
  return `${MATERIAL_PREFIX}${topic.topic}`;
}

function topicFilterMatches(topic, only) {
  if (!only) return true;
  const wanted = knowledge.normalizeKey(only);
  const keys = [topic.id, topic.topic, ...(topic.aliases || [])].map(knowledge.normalizeKey);
  return keys.includes(wanted);
}

function planTopics(options = {}) {
  return knowledge.listTopics({ refresh: true })
    .filter(topic => topicFilterMatches(topic, options.only))
    .map(topic => ({
      topic,
      title: materialTitle(topic),
      chunks: buildTopicChunks(topic),
    }));
}

function upsertTopicMaterial(db, plan) {
  const { topic, title, chunks } = plan;
  const textSize = chunks.reduce((sum, item) => sum + Buffer.byteLength(item.text), 0);
  const existing = db.prepare('SELECT id FROM materials WHERE user_id=? AND title=?').get(SYSTEM_USER_ID, title);
  let materialId;
  if (existing) {
    materialId = existing.id;
    db.prepare('DELETE FROM chunks WHERE material_id=?').run(materialId);
    db.prepare('DELETE FROM chapters WHERE material_id=?').run(materialId);
    db.prepare(`UPDATE materials
      SET course_id=NULL, type=?, file_path=?, mime=?, size_bytes=?, status=?, progress=?
      WHERE id=?`).run(
      'note',
      path.join('backend', 'knowledge', topic._relativeFile || `${topic.id}.json`),
      'application/json',
      textSize,
      'processing',
      0,
      materialId
    );
  } else {
    const result = db.prepare(`INSERT INTO materials
      (user_id, course_id, title, type, file_path, mime, size_bytes, status, progress, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      SYSTEM_USER_ID,
      null,
      title,
      'note',
      path.join('backend', 'knowledge', topic._relativeFile || `${topic.id}.json`),
      'application/json',
      textSize,
      'processing',
      0,
      nowIso()
    );
    materialId = result.lastInsertRowid;
  }

  const chapterResult = db.prepare(
    'INSERT INTO chapters (material_id, idx, title, char_start, char_end) VALUES (?,?,?,?,?)'
  ).run(materialId, 0, topic.topic, 0, textSize);
  const chapterId = chapterResult.lastInsertRowid;
  const insChunk = db.prepare(`INSERT INTO chunks
    (material_id, chapter_id, idx, text, token_count, chapter_title, heading, section_title, has_code, keywords_json)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);

  const inserted = [];
  db.transaction(() => {
    for (const item of chunks) {
      const result = insChunk.run(
        materialId,
        chapterId,
        item.idx,
        item.text,
        estimateTokens(item.text),
        topic.topic,
        item.heading,
        item.heading,
        item.hasCode,
        JSON.stringify(item.keywords)
      );
      inserted.push({ id: result.lastInsertRowid, text: item.text });
    }
  })();

  return { materialId, inserted, updated: Boolean(existing) };
}

async function run(options = {}) {
  const dryRun = Boolean(options.dryRun);
  const embeddings = options.embeddings !== false;
  const plans = planTopics(options);
  if (!plans.length) {
    const result = { processed: 0, updated: 0, inserted: 0, chunks: 0, dryRun, topics: [] };
    if (!options.silent) log.info('knowledge seed: no matching topics');
    return result;
  }

  if (dryRun) {
    const result = {
      processed: plans.length,
      updated: 0,
      inserted: plans.length,
      chunks: plans.reduce((sum, plan) => sum + plan.chunks.length, 0),
      dryRun: true,
      topics: plans.map(plan => ({ id: plan.topic.id, title: plan.title, chunks: plan.chunks.length })),
    };
    if (!options.silent) {
      for (const item of result.topics) log.info(`knowledge seed dry-run: ${item.title} (${item.chunks} chunks)`);
      log.info(`knowledge seed dry-run: ${result.processed} topic(s), ${result.chunks} chunk(s)`);
    }
    return result;
  }

  const db = getDb();
  ensureSystemUser(db);
  let updated = 0;
  let inserted = 0;
  let chunkCount = 0;
  const topics = [];

  for (const plan of plans) {
    const result = upsertTopicMaterial(db, plan);
    if (result.updated) updated++; else inserted++;
    chunkCount += result.inserted.length;
    topics.push({ id: plan.topic.id, title: plan.title, materialId: result.materialId, chunks: result.inserted.length, updated: result.updated });
    if (embeddings) await embedAndStore(result.materialId, result.inserted);
    db.prepare('UPDATE materials SET status=?, progress=? WHERE id=?').run('ready', 100, result.materialId);
    if (!options.silent) log.info(`knowledge seed: ${result.updated ? 'updated' : 'inserted'} ${plan.title} (${result.inserted.length} chunks)`);
  }

  const summary = { processed: plans.length, updated, inserted, chunks: chunkCount, dryRun: false, embeddings, topics };
  if (!options.silent) log.info(`knowledge seed: done - ${summary.processed} topic(s), ${summary.chunks} chunk(s), embeddings=${embeddings}`);
  return summary;
}

function parseArgs(argv) {
  const options = {
    dryRun: argv.includes('--dry-run'),
    embeddings: !argv.includes('--no-embeddings'),
    silent: false,
  };
  const onlyIndex = argv.indexOf('--only');
  if (onlyIndex >= 0) options.only = argv[onlyIndex + 1];
  return options;
}

if (require.main === module) {
  run(parseArgs(process.argv.slice(2)))
    .then(() => process.exit(0))
    .catch(err => {
      log.error('knowledge seed failed', err);
      process.exit(1);
    });
}

module.exports = {
  MATERIAL_PREFIX,
  buildTopicChunks,
  materialTitle,
  planTopics,
  run,
};
