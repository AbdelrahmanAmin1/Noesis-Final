'use strict';

const fs = require('fs');
const path = require('path');
const { getDb } = require('../config/db');
const env = require('../config/env');
const ai = require('./ai.service');
const lessons = require('./lesson.service');
const topicResolver = require('./topic-resolver.service');
const { retrieveLessonContext, groundingTier: computeGroundingTier } = require('./rag.service');
const { scoreVideoScript } = require('./video-quality.service');
const renderer = require('./renderer.service');
const { HttpError } = require('../middleware/error');

function nowIso() { return new Date().toISOString(); }

function parseJson(text, fallback) {
  try { return text ? JSON.parse(text) : fallback; } catch (_) { return fallback; }
}

function cleanId(value, fallback) {
  return String(value || fallback || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || fallback;
}

function goalFor(scene, topic) {
  const type = scene.sceneType || scene.type || 'concept';
  const title = scene.title || topic;
  const map = {
    hook: `Understand why ${topic} matters before memorizing terms.`,
    objectives: `Know the learning targets for this ${topic} lesson.`,
    definition: `State the definition of ${topic} in your own words.`,
    deep_explanation: `Connect the rule of ${topic} to a mental model.`,
    diagram: `Use the visual model to explain ${topic}.`,
    code_example: `Recognize where ${topic} appears in real code.`,
    code_walkthrough: `Explain why the highlighted code lines exist.`,
    common_mistakes: `Avoid a common incorrect interpretation of ${topic}.`,
    complexity: `Connect ${topic} to its cost or trade-offs.`,
    checkpoint: `Check whether you can apply ${topic}.`,
    recap: `Leave with the core path for reviewing ${topic}.`,
  };
  return map[type] || `Learn the purpose of ${title}.`;
}

function visualTemplateFor(scene, topic) {
  const type = scene.visual && scene.visual.type || scene.visual_type || 'mindmap';
  const lower = `${topic} ${scene.title || ''} ${scene.narration || ''}`.toLowerCase();
  if (/polymorphism|dispatch|runtime/.test(lower)) return 'polymorphism_dispatch';
  if (/inheritance|extends|superclass|subclass/.test(lower)) return 'inheritance_uml';
  if (/linked/.test(lower)) return 'linked_list_operation';
  if (/stack|lifo|push|pop/.test(lower)) return 'stack_operation';
  if (/queue|fifo|enqueue|dequeue/.test(lower)) return 'queue_operation';
  if (/binary search tree|bst|in-order|inorder/.test(lower)) return 'bst_operation';
  if (/big.?o|complexity|o\(/.test(lower)) return 'big_o_growth';
  if (type === 'code') return 'code_walkthrough';
  if (type === 'class_diagram') return 'oop_class_diagram';
  if (type === 'tree') return 'tree_path';
  return 'learning_map';
}

function sceneWarnings(scene) {
  const warnings = [];
  if (!scene.teachingGoal || scene.teachingGoal.length < 18) warnings.push('missing_teaching_goal');
  if (!scene.visualTemplate || scene.visualTemplate === 'learning_map') {
    const hasSpecific = (scene.visualData && scene.visualData.nodes || []).some(n => /shape|circle|rectangle|head|next|null|stack|queue|root|o\(/i.test(String(typeof n === 'string' ? n : n.label || n.id || '')));
    if (!hasSpecific) warnings.push('generic_visual_template');
  }
  if (scene.type === 'code_walkthrough' && (!scene.code || !scene.code.highlightLines || !scene.code.highlightLines.length)) {
    warnings.push('missing_code_line_focus');
  }
  if (!scene.narration || scene.narration.length < 120) warnings.push('thin_narration');
  return warnings;
}

function toStoryboardScene(scene, index, topic, slide) {
  const visual = scene.visual || {};
  const codeFocus = scene.codeFocus || scene.code_focus || null;
  const out = {
    id: cleanId(`${index + 1}-${scene.sceneType || scene.type}-${scene.title}`, `scene-${index + 1}`),
    type: scene.sceneType || scene.type || 'concept',
    title: scene.title || `${topic} scene ${index + 1}`,
    teachingGoal: goalFor(scene, topic),
    narration: scene.narration || '',
    visualTemplate: visualTemplateFor(scene, topic),
    visualData: {
      type: visual.type || slide.visual_type || 'mindmap',
      nodes: visual.nodes || slide.visual_nodes || [],
      edges: visual.edges || slide.visual_edges || [],
      details: visual.node_details || slide.visual_node_details || {},
      operations: visual.operations || slide.operations || [],
      caption: visual.caption || slide.caption || '',
    },
    code: codeFocus ? {
      language: codeFocus.language || 'text',
      content: codeFocus.content || slide.example_code || '',
      highlightLines: codeFocus.highlightLines || [],
      lineRange: codeFocus.lineRange || '',
      walkthrough: codeFocus.explanation ? [{ lineRange: codeFocus.lineRange || '', text: codeFocus.explanation }] : [],
    } : null,
    durationSec: scene.durationTargetSec || slide.durationTargetSec || 24,
    renderSlide: slide,
    qualityWarnings: [],
  };
  out.qualityWarnings = sceneWarnings(out);
  return out;
}

function storyboardQuality(storyboard) {
  const sceneWarningsFlat = [];
  for (const scene of storyboard.scenes || []) {
    const warnings = scene.qualityWarnings && scene.qualityWarnings.length ? scene.qualityWarnings : sceneWarnings(scene);
    for (const warning of warnings) sceneWarningsFlat.push(`${scene.id}:${warning}`);
  }
  const requiredTemplates = new Set((storyboard.scenes || []).map(s => s.visualTemplate));
  const passed = sceneWarningsFlat.length === 0 && requiredTemplates.size >= 4;
  return {
    score: Math.max(0, Math.min(1, 1 - sceneWarningsFlat.length * 0.08 + Math.min(0.2, requiredTemplates.size * 0.03))),
    passed,
    warnings: sceneWarningsFlat,
    visualTemplates: [...requiredTemplates],
  };
}

function focusLabelsForScene(scene) {
  if (scene.code && Array.isArray(scene.code.highlightLines) && scene.code.highlightLines.length) {
    return scene.code.highlightLines.slice(0, 2).map(line => `Line ${line}`);
  }
  const nodes = scene.visualData && Array.isArray(scene.visualData.nodes) ? scene.visualData.nodes : [];
  return nodes.map(n => String(typeof n === 'string' ? n : n.label || n.id || '').trim())
    .filter(Boolean)
    .map(label => label.split(/\s+/).slice(0, 4).join(' '))
    .slice(0, 2);
}

function scriptFromStoryboard(storyboard) {
  const slides = (storyboard.scenes || []).map(scene => {
    const slide = scene.renderSlide || {};
    return {
      ...slide,
      title: scene.title || slide.title,
      narration: scene.narration || slide.narration,
      bullets: Array.isArray(slide.bullets) && slide.bullets.length ? slide.bullets : focusLabelsForScene(scene),
      visual_type: scene.visualData && scene.visualData.type || slide.visual_type,
      visual_nodes: scene.visualData && scene.visualData.nodes || slide.visual_nodes || [],
      visual_edges: scene.visualData && scene.visualData.edges || slide.visual_edges || [],
      visual_node_details: scene.visualData && scene.visualData.details || slide.visual_node_details || {},
      operations: scene.visualData && scene.visualData.operations || slide.operations || [],
      caption: scene.visualData && scene.visualData.caption || slide.caption || '',
      example_code: scene.code && scene.code.content || slide.example_code || '',
      code_focus: scene.code ? {
        language: scene.code.language || 'text',
        content: scene.code.content || '',
        lineRange: scene.code.lineRange || '',
        highlightLines: scene.code.highlightLines || [],
        explanation: (scene.code.walkthrough && scene.code.walkthrough[0] && scene.code.walkthrough[0].text) || slide.code_focus && slide.code_focus.explanation || '',
      } : slide.code_focus || null,
      callouts: [],
    };
  });
  return {
    topic: storyboard.topic,
    audienceLevel: storyboard.audienceLevel || 'beginner',
    learningObjectives: storyboard.learningObjectives || [],
    slides,
  };
}

async function generateStoryboard({ userId, materialId, concept }) {
  await ai.assertModelsAvailable({ generation: true, embedding: true, feature: 'notes' });
  const db = getDb();
  const material = db.prepare('SELECT id, title FROM materials WHERE id=? AND user_id=?').get(materialId, userId);
  if (!material) throw new HttpError(404, 'material_not_found');
  const topicInfo = await topicResolver.resolveTopic({ materialId, hint: concept || material.title, feature: 'video', minConfidence: 0.22 });
  if (!topicInfo.topic) {
    throw new HttpError(422, 'topic_resolution_low_confidence', 'Choose a specific CS topic before generating a storyboard.', { candidates: topicInfo.alternatives || [] });
  }
  const rag = await retrieveLessonContext(materialId, topicInfo.topic, { feature: 'video', k: 10, minScore: 0.08, maxMerged: 14 });
  const groundingTier = computeGroundingTier(rag.uploaded || rag);
  const lesson = await lessons.generateEducationalLesson({
    topic: topicInfo.topic,
    title: topicInfo.topic,
    materialTitle: material.title || topicInfo.topic,
    chunks: rag.chunks || [],
    groundingTier,
    lessonType: lessons.detectLessonType(topicInfo.topic),
  });
  const video = lessons.lessonToVideoScript(lesson);
  const scenes = lessons.lessonToVideoScenes(lesson);
  const storyboardScenes = (video.slides || []).map((slide, index) => toStoryboardScene(scenes[index] || slide, index, topicInfo.topic, slide));
  const storyboard = {
    topic: topicInfo.topic,
    audienceLevel: lesson.audienceLevel || 'beginner',
    learningObjectives: lesson.learningObjectives || [],
    learningPath: {
      startHere: lesson.prerequisites && lesson.prerequisites.length ? `Review ${lesson.prerequisites[0]} first` : `Start with ${topicInfo.topic}`,
      prerequisites: lesson.prerequisites || [],
      nextTopics: nextTopicsFor(topicInfo.topic),
    },
    scenes: storyboardScenes,
    renderer: env.NOESIS_DEMO_MODE ? env.VIDEO_RENDERER : 'canvas',
    generatedAt: nowIso(),
  };
  const scriptQuality = scoreVideoScript(scriptFromStoryboard(storyboard), {
    concept: topicInfo.topic,
    chunks: rag.uploaded && rag.uploaded.chunks || [],
    lowGrounding: groundingTier === 'weak',
    threshold: env.STRICT_QUALITY_GATES ? 0.88 : env.VIDEO_SCRIPT_MIN_QUALITY_SCORE,
  });
  const quality = {
    storyboard: storyboardQuality(storyboard),
    script: scriptQuality,
    lesson: lesson.quality || lessons.scoreLesson(lesson),
    resolved_topic: topicInfo.topic,
    topic_confidence: topicInfo.confidence || null,
    topic_source: topicInfo.source || null,
    candidates: topicInfo.alternatives || [],
  };
  const status = env.STORYBOARD_REVIEW_REQUIRED || env.NOESIS_DEMO_MODE ? 'draft' : 'approved';
  const r = db.prepare(`INSERT INTO video_storyboards
    (user_id, material_id, topic, status, lesson_json, storyboard_json, quality_json, renderer, created_at, updated_at, approved_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(userId, materialId, topicInfo.topic, status, JSON.stringify(lesson), JSON.stringify(storyboard), JSON.stringify(quality), storyboard.renderer, nowIso(), nowIso(), status === 'approved' ? nowIso() : null);
  insertScenes(db, r.lastInsertRowid, storyboard.scenes);
  return getStoryboard(userId, r.lastInsertRowid);
}

function nextTopicsFor(topic) {
  const lower = String(topic || '').toLowerCase();
  if (lower.includes('polymorphism')) return ['Interfaces', 'Abstract Classes', 'SOLID'];
  if (lower.includes('inheritance')) return ['Polymorphism', 'Composition', 'Interfaces'];
  if (lower.includes('linked')) return ['Stack', 'Queue', 'Trees'];
  if (lower.includes('stack')) return ['Queue', 'Recursion', 'Expression Parsing'];
  if (lower.includes('queue')) return ['Deque', 'BFS', 'Priority Queue'];
  return ['Practice', 'Quiz Review', 'Next Course Topic'];
}

function insertScenes(db, storyboardId, scenes) {
  const ins = db.prepare(`INSERT INTO video_storyboard_scenes
    (storyboard_id, scene_id, scene_order, scene_json, quality_json, approved, updated_at)
    VALUES (?,?,?,?,?,?,?)`);
  db.transaction(() => {
    scenes.forEach((scene, index) => ins.run(storyboardId, scene.id, index, JSON.stringify(scene), JSON.stringify({ warnings: scene.qualityWarnings || [] }), 0, nowIso()));
  })();
}

function hydrate(row) {
  if (!row) return null;
  return {
    ...row,
    lesson: parseJson(row.lesson_json, null),
    storyboard: parseJson(row.storyboard_json, null),
    quality: parseJson(row.quality_json, {}),
  };
}

function getStoryboard(userId, id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM video_storyboards WHERE id=? AND user_id=?').get(id, userId);
  if (!row) return null;
  const out = hydrate(row);
  out.scenes = db.prepare('SELECT * FROM video_storyboard_scenes WHERE storyboard_id=? ORDER BY scene_order').all(id)
    .map(scene => ({ ...scene, scene: parseJson(scene.scene_json, {}) }));
  return out;
}

function listStoryboards(userId, materialId) {
  const db = getDb();
  const rows = materialId
    ? db.prepare('SELECT * FROM video_storyboards WHERE user_id=? AND material_id=? ORDER BY updated_at DESC LIMIT 20').all(userId, materialId)
    : db.prepare('SELECT * FROM video_storyboards WHERE user_id=? ORDER BY updated_at DESC LIMIT 20').all(userId);
  return rows.map(hydrate);
}

function updateScene(userId, id, sceneId, patch) {
  const db = getDb();
  const board = getStoryboard(userId, id);
  if (!board) return null;
  const sceneRow = board.scenes.find(s => s.scene_id === sceneId);
  if (!sceneRow) throw new HttpError(404, 'scene_not_found');
  const scene = { ...sceneRow.scene };
  for (const key of ['title', 'teachingGoal', 'narration', 'visualTemplate', 'durationSec']) {
    if (patch[key] != null) scene[key] = patch[key];
  }
  if (patch.visualData && typeof patch.visualData === 'object') scene.visualData = { ...(scene.visualData || {}), ...patch.visualData };
  if (patch.code && typeof patch.code === 'object') scene.code = { ...(scene.code || {}), ...patch.code };
  scene.qualityWarnings = sceneWarnings(scene);
  const storyboard = board.storyboard;
  storyboard.scenes = storyboard.scenes.map(s => s.id === sceneId ? scene : s);
  const quality = { ...board.quality, storyboard: storyboardQuality(storyboard) };
  db.prepare('UPDATE video_storyboard_scenes SET scene_json=?, quality_json=?, approved=0, updated_at=? WHERE storyboard_id=? AND scene_id=?')
    .run(JSON.stringify(scene), JSON.stringify({ warnings: scene.qualityWarnings }), nowIso(), id, sceneId);
  db.prepare('UPDATE video_storyboards SET storyboard_json=?, quality_json=?, status=?, updated_at=? WHERE id=? AND user_id=?')
    .run(JSON.stringify(storyboard), JSON.stringify(quality), 'draft', nowIso(), id, userId);
  return getStoryboard(userId, id);
}

function approveStoryboard(userId, id) {
  const db = getDb();
  const board = getStoryboard(userId, id);
  if (!board) return null;
  const quality = { ...board.quality, storyboard: storyboardQuality(board.storyboard) };
  const strict = env.NOESIS_DEMO_MODE || env.STRICT_QUALITY_GATES;
  if (strict && quality.storyboard.warnings.length) {
    throw new HttpError(422, 'storyboard_quality_failed', 'Fix storyboard warnings before approval.', quality.storyboard);
  }
  db.prepare("UPDATE video_storyboards SET status='approved', approved_at=?, updated_at=?, quality_json=? WHERE id=? AND user_id=?")
    .run(nowIso(), nowIso(), JSON.stringify(quality), id, userId);
  db.prepare('UPDATE video_storyboard_scenes SET approved=1, updated_at=? WHERE storyboard_id=?').run(nowIso(), id);
  return getStoryboard(userId, id);
}

async function renderScenePreview(userId, id, sceneId) {
  const board = getStoryboard(userId, id);
  if (!board) return null;
  const sceneRow = board.scenes.find(s => s.scene_id === sceneId);
  if (!sceneRow) throw new HttpError(404, 'scene_not_found');
  const outPath = path.join(env.UPLOAD_DIR, 'storyboards', String(id), `${sceneId}.png`);
  const script = scriptFromStoryboard({ ...board.storyboard, scenes: [sceneRow.scene] });
  const rendered = await renderer.renderScenePreview(script.slides[0], outPath);
  return fs.existsSync(rendered) ? rendered : null;
}

function scriptForRender(userId, id) {
  const board = getStoryboard(userId, id);
  if (!board) return null;
  return {
    board,
    script: scriptFromStoryboard(board.storyboard),
    lesson: board.lesson,
    quality: board.quality,
  };
}

module.exports = {
  generateStoryboard,
  getStoryboard,
  listStoryboards,
  updateScene,
  approveStoryboard,
  renderScenePreview,
  scriptForRender,
  scriptFromStoryboard,
  storyboardQuality,
};
