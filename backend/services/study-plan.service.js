'use strict';

const { getDb } = require('../config/db');
const learningMaps = require('./learning-map.service');
const domainDetection = require('./domain-detection.service');
const gamification = require('./gamification.service');
const { getGoalProfile, normalizeGoal, publicGoalProfile } = require('./goal-profile.service');

function nowIso() { return new Date().toISOString(); }

function parseJson(text, fallback = {}) {
  try { return text ? JSON.parse(text) : fallback; } catch (_) { return fallback; }
}

function task(type, title, minutes, successCriteria, source = null) {
  const result = { type, title, estimatedMinutes: minutes, successCriteria };
  if (source) result.source = source;
  return result;
}

function goalTask(type, topic, minutes, goalId, source = null) {
  if (type === 'quiz') {
    const title = goalId === 'practice' ? `${topic} practice set` : `${topic} checkpoint`;
    const criteria = goalId === 'practice'
      ? `Attempt a short practice set and write down one mistake pattern for ${topic}.`
      : `Score at least 80% or mark ${topic} weak.`;
    return task('quiz', title, minutes, criteria, source);
  }
  if (type === 'flashcards') {
    const title = goalId === 'retain' ? `${topic} spaced recall` : `${topic} recall cards`;
    return task('flashcards', title, minutes, 'Review due cards and rate honestly.', source);
  }
  if (type === 'tutor_session') {
    const title = goalId === 'understand' ? `${topic} deep dive` : `${topic} Socratic check`;
    return task('tutor_session', title, minutes, 'Answer one tutor question without notes.', source);
  }
  return task('read_notes', `${topic} polished notes`, minutes, `Write one sentence summarizing ${topic}.`, source);
}

function goalSuccessCriteria(goalId, topic) {
  if (goalId === 'exams') return `Finish the ${topic} checkpoint and name one exam-risk weak spot.`;
  if (goalId === 'understand') return `Explain ${topic} in your own words and answer one follow-up question.`;
  if (goalId === 'retain') return `Recall ${topic} without notes, then review any shaky cards.`;
  if (goalId === 'practice') return `Attempt ${topic} practice and record one mistake to fix next time.`;
  return `Finish the ${topic} tasks and identify one weak spot.`;
}

function topicKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function uniqueTopics(values = [], max = 30) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const label = String(value || '').replace(/\s+/g, ' ').trim();
    const key = topicKey(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(label);
    if (out.length >= max) break;
  }
  return out;
}

function trackLabel(track) {
  if (track === 'oop') return 'Object-Oriented Programming';
  if (track === 'ds') return 'Data Structures';
  return 'OOP + Data Structures';
}

function trackFromCourseText(value) {
  const text = String(value || '').toLowerCase();
  const hasDs = /data\s*structures?|\bds\b|linked\s*list|algorithms?/.test(text);
  const hasOop = /object\s*oriented|\boop\b|java\b|classes?\s*(?:and|&)\s*objects?/.test(text);
  if (hasDs && hasOop) return 'both';
  if (hasDs) return 'ds';
  if (hasOop) return 'oop';
  return null;
}

function inferMaterialTrack(userId, material) {
  const courseTrack = trackFromCourseText([material.course_code, material.course_title].filter(Boolean).join(' '));
  let inferredTrack = null;
  try {
    const domain = domainDetection.detectMaterialDomain(userId, material.id, { hint: material.title });
    if (domain.domain === 'cs' && Number(domain.confidence || 0) >= 0.5) {
      if (domain.subdomain === 'data_structures') inferredTrack = 'ds';
      else if (domain.subdomain === 'oop_or_programming') inferredTrack = 'oop';
    }
  } catch (_) {
    // A source with unreadable content is safely handled as unusable below.
  }
  const track = courseTrack === 'oop' || courseTrack === 'ds'
    ? courseTrack
    : (inferredTrack || courseTrack || null);
  return { track, courseTrack, inferredTrack };
}

function materialMatchesTrack(materialTrack, selectedTrack) {
  if (!materialTrack) return false;
  if (selectedTrack === 'both') return materialTrack === 'oop' || materialTrack === 'ds' || materialTrack === 'both';
  if (materialTrack === 'both') return false;
  return materialTrack === selectedTrack;
}

function readyMaterials(db, userId) {
  return db.prepare(`
    SELECT m.id, m.course_id, m.title, m.type, m.created_at,
           c.code AS course_code, c.title AS course_title,
           COUNT(ch.id) AS chunk_count
    FROM materials m
    LEFT JOIN courses c ON c.id=m.course_id AND c.user_id=m.user_id
    LEFT JOIN chunks ch ON ch.material_id=m.id
    WHERE m.user_id=? AND m.status='ready'
    GROUP BY m.id
    ORDER BY m.created_at ASC, m.id ASC
  `).all(userId).map(row => ({ ...row, chunk_count: Number(row.chunk_count || 0) }));
}

function placeholders(ids) { return ids.map(() => '?').join(','); }

function topicFromNote(row) {
  const source = parseJson(row.source_map_json, {});
  const tags = parseJson(row.tags_json, []);
  return uniqueTopics([
    source.resolved_topic,
    source.source_outline && source.source_outline.mainTopic,
    row.title,
    ...(Array.isArray(tags) ? tags : []),
  ], 8);
}

function materialArtifacts(db, userId, materialIds) {
  const byMaterial = new Map(materialIds.map(id => [Number(id), { noteTopics: [], flashcardTopics: [], quizMisses: [] }]));
  if (!materialIds.length) return { byMaterial, totals: { notes: 0, flashcards: 0, quizzes: 0, quizMisses: 0 } };
  const ids = placeholders(materialIds);
  const args = [userId, ...materialIds];
  const notes = db.prepare(`
    SELECT material_id, title, tags_json, source_map_json
    FROM notes WHERE user_id=? AND material_id IN (${ids})
  `).all(...args);
  const cards = db.prepare(`
    SELECT f.material_id, COALESCE(NULLIF(f.topic, ''), NULLIF(f.deck, ''), '') AS topic,
           COUNT(DISTINCT f.id) AS card_count
    FROM flashcards f
    WHERE f.user_id=? AND f.material_id IN (${ids})
    GROUP BY f.material_id, COALESCE(NULLIF(f.topic, ''), NULLIF(f.deck, ''), '')
  `).all(...args);
  const quizzes = db.prepare(`
    SELECT material_id, COUNT(DISTINCT id) AS quiz_count
    FROM quizzes WHERE user_id=? AND material_id IN (${ids})
    GROUP BY material_id
  `).all(...args);
  const misses = db.prepare(`
    SELECT q.material_id, qq.concept, COUNT(*) AS misses
    FROM quizzes q
    JOIN quiz_attempts qa_attempt ON qa_attempt.quiz_id=q.id AND qa_attempt.user_id=q.user_id
    JOIN quiz_answers qa ON qa.attempt_id=qa_attempt.id AND qa.is_correct=0
    JOIN quiz_questions qq ON qq.id=qa.question_id
    WHERE q.user_id=? AND q.material_id IN (${ids}) AND COALESCE(qq.concept, '') <> ''
    GROUP BY q.material_id, qq.concept
    ORDER BY misses DESC, qq.concept ASC
  `).all(...args);

  for (const row of notes) {
    const entry = byMaterial.get(Number(row.material_id));
    if (entry) entry.noteTopics.push(...topicFromNote(row));
  }
  for (const row of cards) {
    const entry = byMaterial.get(Number(row.material_id));
    if (entry && row.topic) entry.flashcardTopics.push({ topic: row.topic, count: Number(row.card_count || 0) });
  }
  for (const row of quizzes) {
    const entry = byMaterial.get(Number(row.material_id));
    if (entry) entry.quizCount = Number(row.quiz_count || 0);
  }
  for (const row of misses) {
    const entry = byMaterial.get(Number(row.material_id));
    if (entry) entry.quizMisses.push({ topic: row.concept, misses: Number(row.misses || 0) });
  }
  for (const entry of byMaterial.values()) {
    entry.noteTopics = uniqueTopics(entry.noteTopics, 20);
    entry.flashcardTopics = entry.flashcardTopics.filter(item => topicKey(item.topic));
    entry.quizCount = Number(entry.quizCount || 0);
  }
  return {
    byMaterial,
    totals: {
      notes: notes.length,
      flashcards: cards.reduce((sum, row) => sum + Number(row.card_count || 0), 0),
      quizzes: quizzes.reduce((sum, row) => sum + Number(row.quiz_count || 0), 0),
      quizMisses: misses.reduce((sum, row) => sum + Number(row.misses || 0), 0),
    },
  };
}

function findSourceNode(map, topic) {
  const key = topicKey(topic);
  if (!key) return null;
  const nodes = Array.isArray(map && map.nodes) ? map.nodes : [];
  return nodes.find(node => topicKey(node.label) === key)
    || nodes.find(node => {
      const nodeKey = topicKey(node.label);
      return key.length >= 4 && nodeKey.length >= 4 && (nodeKey.includes(key) || key.includes(nodeKey));
    })
    || null;
}

function sourceRefForTopic(entry, topic) {
  const node = findSourceNode(entry.map, topic);
  const artifacts = entry.artifacts || {};
  const key = topicKey(topic);
  const noteAvailable = (artifacts.noteTopics || []).some(item => topicKey(item) === key);
  const cardCount = (artifacts.flashcardTopics || []).filter(item => topicKey(item.topic) === key).reduce((sum, item) => sum + Number(item.count || 0), 0);
  const quizMisses = (artifacts.quizMisses || []).filter(item => topicKey(item.topic) === key).reduce((sum, item) => sum + Number(item.misses || 0), 0);
  return {
    materialId: entry.material.id,
    materialTitle: entry.material.title,
    sourceChunkIds: (node && node.sourceChunkIds || []).slice(0, 8),
    artifacts: { noteAvailable, flashcardCount: cardCount, quizMisses },
  };
}

function matchingArtifactTopic(topic, map) {
  const node = findSourceNode(map, topic);
  return node && node.label || '';
}

function orderedTopicsForMaterial(entry) {
  const path = uniqueTopics(entry.map.recommendedPath || [], 14);
  const weak = new Set();
  const weakLabels = [];
  for (const node of entry.map.nodes || []) {
    if (node.status !== 'weak' || node.depth === 0 || node.type === 'root') continue;
    weak.add(topicKey(node.label));
    weakLabels.push(node.label);
  }
  for (const miss of entry.artifacts.quizMisses || []) {
    const sourceTopic = matchingArtifactTopic(miss.topic, entry.map);
    if (sourceTopic) {
      weak.add(topicKey(sourceTopic));
      weakLabels.push(sourceTopic);
    }
  }
  const weakFirst = path.filter(topic => weak.has(topicKey(topic)));
  const weakExtras = uniqueTopics(weakLabels, 14).filter(topic => !path.some(pathTopic => topicKey(pathTopic) === topicKey(topic)));
  const remaining = path.filter(topic => !weak.has(topicKey(topic)));
  return { topics: uniqueTopics([...weakFirst, ...weakExtras, ...remaining], 14), weakTopics: uniqueTopics([...weakFirst, ...weakExtras], 12) };
}

function buildCombinedMap(entries, selectedTrack, artifacts) {
  const nodes = [];
  const nodeSeen = new Set();
  const pathSeen = new Set();
  const recommendedPath = [];
  const weakTopics = [];
  const topicSources = {};

  for (const entry of entries) {
    const ordered = orderedTopicsForMaterial(entry);
    for (const topic of ordered.topics) {
      const key = topicKey(topic);
      if (!key || pathSeen.has(key)) continue;
      pathSeen.add(key);
      recommendedPath.push(topic);
      topicSources[key] = sourceRefForTopic(entry, topic);
    }
    weakTopics.push(...ordered.weakTopics);
    for (const node of entry.map.nodes || []) {
      const key = topicKey(node.label);
      if (!key || nodeSeen.has(key)) continue;
      nodeSeen.add(key);
      nodes.push({ ...node, materialId: entry.material.id, materialTitle: entry.material.title });
    }
  }

  const oneMaterial = entries.length === 1;
  const only = oneMaterial ? entries[0] : null;
  const tree = oneMaterial
    ? only.map.tree
    : {
      label: 'Uploaded Lectures',
      children: entries.map(entry => ({
        id: `material-${entry.material.id}`,
        label: entry.map.rootTopic || entry.material.title,
        relationship: 'uploaded lecture',
        children: (orderedTopicsForMaterial(entry).topics || []).slice(0, 5).map(topic => ({
          label: topic,
          relationship: 'study topic',
          children: [],
        })),
      })),
    };

  const rootTopic = oneMaterial ? (only.map.rootTopic || only.material.title) : 'Uploaded Lectures';
  const sourceTitles = entries.map(entry => entry.material.title);
  return {
    map: {
      rootTopic,
      startHere: recommendedPath[0] || rootTopic,
      tree,
      nodes: nodes.slice(0, 24),
      recommendedPath: recommendedPath.slice(0, 14),
      materialGrounding: {
        used: true,
        materialIds: entries.map(entry => entry.material.id),
        materialTitles: sourceTitles,
        combined: entries.length > 1,
        chunkCount: entries.reduce((sum, entry) => sum + Number(entry.material.chunk_count || 0), 0),
        artifacts: artifacts.totals,
        track: selectedTrack,
      },
      track: selectedTrack,
      trackLabel: trackLabel(selectedTrack),
      generation: { mode: 'uploaded_materials', status: 'ready', provider: null, generatedAt: nowIso() },
      generatedAt: nowIso(),
    },
    topicSources,
    weakTopics: uniqueTopics(weakTopics, 12),
  };
}

function fallbackSource(selectedTrack, hasReadyUploads) {
  const label = trackLabel(selectedTrack);
  const prefix = hasReadyUploads ? `No matching uploaded ${label} lectures found.` : `No uploaded ${label} lectures found.`;
  return {
    mode: 'curriculum_fallback',
    selectedTrack,
    materialIds: [],
    materialTitles: [],
    artifacts: { notes: 0, flashcards: 0, quizzes: 0, quizMisses: 0 },
    fallbackReason: hasReadyUploads ? 'no_matching_material' : 'no_usable_material',
    label: `${prefix} Plan generated from the default ${label} mind map.`,
  };
}

function resolvePlanSource(userId, prefs, opts = {}) {
  const db = getDb();
  const selectedTrack = learningMaps.subjectTrack(prefs.subject);
  const materials = readyMaterials(db, userId);
  const explicitMaterialId = Number(opts.materialId || opts.material_id || 0);
  const candidates = materials
    .filter(material => material.chunk_count > 0)
    .map(material => ({ material, ...inferMaterialTrack(userId, material) }))
    .filter(candidate => materialMatchesTrack(candidate.track, selectedTrack))
    .sort((a, b) => {
      const aExplicit = Number(a.material.id) === explicitMaterialId ? 1 : 0;
      const bExplicit = Number(b.material.id) === explicitMaterialId ? 1 : 0;
      if (aExplicit !== bExplicit) return bExplicit - aExplicit;
      return String(a.material.created_at || '').localeCompare(String(b.material.created_at || '')) || Number(a.material.id) - Number(b.material.id);
    });

  const entries = [];
  for (const candidate of candidates) {
    try {
      const map = learningMaps.buildLearningMap(userId, { materialId: candidate.material.id, persist: true });
      if (!map || !map.materialGrounding || !map.materialGrounding.used || !(map.recommendedPath || []).length) continue;
      entries.push({ ...candidate, map, artifacts: null });
    } catch (_) {
      // Failed map construction is treated as an unusable source and safely falls back.
    }
  }

  if (!entries.length) {
    return {
      map: learningMaps.buildLearningMap(userId),
      source: fallbackSource(selectedTrack, materials.length > 0),
      topicSources: {},
      weakTopics: [],
    };
  }

  const artifactIndex = materialArtifacts(db, userId, entries.map(entry => entry.material.id));
  entries.forEach(entry => { entry.artifacts = artifactIndex.byMaterial.get(Number(entry.material.id)) || { noteTopics: [], flashcardTopics: [], quizMisses: [], quizCount: 0 }; });
  const combined = buildCombinedMap(entries, selectedTrack, artifactIndex);
  const hasProgressData = Object.values(artifactIndex.totals).some(value => Number(value || 0) > 0);
  return {
    ...combined,
    source: {
      mode: hasProgressData ? 'uploaded_materials_with_progress' : 'uploaded_materials',
      selectedTrack,
      materialIds: entries.map(entry => entry.material.id),
      materialTitles: entries.map(entry => entry.material.title),
      artifacts: artifactIndex.totals,
      fallbackReason: null,
      label: hasProgressData ? 'Plan generated from your uploaded materials and progress data.' : 'Plan generated from your uploaded lectures.',
    },
  };
}

function buildPlan(userId, opts = {}) {
  const db = getDb();
  const prefs = db.prepare('SELECT * FROM user_prefs WHERE user_id=?').get(userId) || {};
  const profile = parseJson(prefs.study_profile_json, {});
  const goalProfile = getGoalProfile(profile.goal || prefs.goal);
  const goalId = normalizeGoal(goalProfile.id);
  const sourceSelection = resolvePlanSource(userId, prefs, opts);
  const map = sourceSelection.map;
  const source = sourceSelection.source;
  const daysPerWeek = Math.max(1, Math.min(7, Number(profile.daysPerWeek || profile.days_per_week || 5)));
  const minutes = Math.max(20, Math.min(180, Number(profile.minutesPerSession || prefs.daily_minutes || 45)));
  const deadline = profile.deadline || '';
  const path = (map.recommendedPath && map.recommendedPath.length ? map.recommendedPath : [map.startHere]).slice(0, Math.max(5, daysPerWeek * 2));
  const durationDays = deadline
    ? Math.max(3, Math.min(42, Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000)))
    : 14;
  const dailyPlan = [];
  for (let day = 1; day <= Math.min(durationDays, 14); day++) {
    const topic = path[(day - 1) % path.length] || map.startHere || 'Core topic';
    const topicSource = sourceSelection.topicSources[topicKey(topic)] || null;
    const planBias = goalProfile.plan || {};
    const primaryType = planBias.primaryType || 'tutor_session';
    const secondaryType = planBias.secondaryType || 'quiz';
    const secondaryEvery = Math.max(2, Number(planBias.secondaryEvery || 3));
    const tasks = [
      task('watch_video', `${topic} visual explanation`, Math.max(8, Math.min(18, Math.floor(minutes * 0.35))), `Explain the visual model for ${topic}.`, topicSource),
      task('read_notes', `${topic} polished notes`, Math.max(7, Math.min(15, Math.floor(minutes * 0.25))), `Write one sentence summarizing ${topic}.`, topicSource),
    ];
    tasks.push(goalTask(primaryType, topic, Math.max(8, Math.min(14, Math.floor(minutes * 0.25))), goalId, topicSource));
    if (day % secondaryEvery === 0 || (minutes >= 60 && day % 2 === 0)) {
      tasks.push(goalTask(secondaryType, topic, Math.max(6, Math.min(10, Math.floor(minutes * 0.15))), goalId, topicSource));
    }
    dailyPlan.push({
      day,
      focusTopic: topic,
      estimatedMinutes: Math.min(minutes, tasks.reduce((s, t) => s + t.estimatedMinutes, 0)),
      tasks,
      source: topicSource,
      successCriteria: goalSuccessCriteria(goalId, topic),
    });
  }
  return {
    planTitle: `${durationDays <= 14 ? '2-Week' : `${durationDays}-Day`} ${map.rootTopic || 'Study'} Plan`,
    goal: goalProfile.label,
    goalId,
    goalProfile: publicGoalProfile(goalId),
    source,
    trackId: source.selectedTrack || map.track || (map.materialGrounding && map.materialGrounding.track) || 'both',
    trackLabel: map.trackLabel || trackLabel(source.selectedTrack) || map.rootTopic || 'OOP + Data Structures',
    durationDays,
    daysPerWeek,
    minutesPerSession: minutes,
    learningStyle: profile.learningStyle || 'mixed',
    preferredLanguage: profile.preferredLanguage || 'java',
    weakTopics: uniqueTopics([
      ...sourceSelection.weakTopics,
      ...(map.nodes || []).filter(n => n.type === 'weak' || n.status === 'weak').map(n => n.label),
    ], 6),
    dailyPlan,
    learningMap: map,
  };
}

function createPlan(userId, opts = {}) {
  const db = getDb();
  const plan = buildPlan(userId, opts);
  const r = db.prepare('INSERT INTO study_plans (user_id, title, goal, status, plan_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
    .run(userId, plan.planTitle, plan.goal, 'draft', JSON.stringify(plan), nowIso(), nowIso());
  const taskIns = db.prepare('INSERT INTO study_plan_tasks (plan_id, day, task_order, task_json, status) VALUES (?,?,?,?,?)');
  db.transaction(() => {
    plan.dailyPlan.forEach(day => {
      day.tasks.forEach((t, index) => taskIns.run(r.lastInsertRowid, day.day, index, JSON.stringify({ ...t, focusTopic: day.focusTopic }), 'pending'));
    });
  })();
  return getPlan(userId, r.lastInsertRowid);
}

function getPlan(userId, id) {
  const db = getDb();
  const row = id
    ? db.prepare('SELECT * FROM study_plans WHERE id=? AND user_id=?').get(id, userId)
    : db.prepare("SELECT * FROM study_plans WHERE user_id=? ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, updated_at DESC LIMIT 1").get(userId);
  if (!row) return null;
  const tasks = db.prepare('SELECT * FROM study_plan_tasks WHERE plan_id=? ORDER BY day, task_order').all(row.id)
    .map(t => ({ ...t, task: parseJson(t.task_json, {}) }));
  return { ...row, plan: parseJson(row.plan_json, {}), tasks };
}

function approvePlan(userId, id) {
  const db = getDb();
  const row = getPlan(userId, id);
  if (!row) return null;
  db.prepare("UPDATE study_plans SET status='archived', updated_at=? WHERE user_id=? AND status='active'").run(nowIso(), userId);
  db.prepare("UPDATE study_plans SET status='active', approved_at=?, updated_at=? WHERE id=? AND user_id=?").run(nowIso(), nowIso(), id, userId);
  return getPlan(userId, id);
}

function completeTask(userId, taskId) {
  const db = getDb();
  const row = db.prepare(`
    SELECT t.id, t.plan_id, t.status, t.task_json FROM study_plan_tasks t
    JOIN study_plans p ON p.id=t.plan_id
    WHERE t.id=? AND p.user_id=?
  `).get(taskId, userId);
  if (!row) return null;
  if (row.status !== 'completed') {
    db.prepare("UPDATE study_plan_tasks SET status='completed', completed_at=? WHERE id=?").run(nowIso(), taskId);
    const taskData = parseJson(row.task_json, {});
    const reward = gamification.award(userId, 'study_task_completed', 'study_plan_task', taskId, {
      metadata: { plan_id: row.plan_id, task_type: taskData.type || '', title: taskData.title || '' },
    });
    const plan = getPlan(userId, row.plan_id);
    plan.reward = reward.awarded ? { points: reward.points, event_type: 'study_task_completed', unlocked: reward.unlocked || [] } : null;
    plan.gamification = reward.summary || null;
    return plan;
  }
  const plan = getPlan(userId, row.plan_id);
  plan.reward = null;
  plan.gamification = gamification.getSummary(userId);
  return plan;
}

module.exports = {
  buildPlan,
  createPlan,
  getPlan,
  approvePlan,
  completeTask,
  _internals: { resolvePlanSource, inferMaterialTrack, materialMatchesTrack, trackFromCourseText, trackLabel },
};
