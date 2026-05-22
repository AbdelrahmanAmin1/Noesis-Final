'use strict';

const { DOMAIN_TOPICS } = require('./material-understanding.service');

const CONCRETE_SOURCE_RE = /\b(example|for example|code|class|public|private|def |function|node|head|next|push|pop|enqueue|dequeue|hash|bucket|collision|o\(|complexity|walkthrough|step|diagram)\b/i;
const ABSTRACT_SOURCE_RE = /\b(concept|principle|overview|important|fundamental|paradigm|idea|understand|introduction|theoretical|definition)\b/i;

function roundScore(value) {
  return Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 1000) / 1000;
}

function compactText(value, max = 220) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trim()}...`;
}

function evidenceText(evidence) {
  return (evidence || []).map(item => [item.quote, item.heading, item.chapterTitle, item.slideTitle].filter(Boolean).join(' ')).join(' ');
}

function chunksText(chunks) {
  return (chunks || []).map(chunk => [chunk.heading, chunk.slide_title, chunk.section_title, chunk.text].filter(Boolean).join(' ')).join('\n');
}

function hasSourceCode(diagnostics, chunks) {
  const refs = diagnostics && diagnostics.chunkReferences || [];
  if (refs.some(ref => ref.hasCode)) return true;
  return /\b(public\s+class|private\s+\w+|def\s+\w+\(|function\s+\w+\(|class\s+\w+|int\s+\w+|return\s+|for\s*\(|while\s*\()\b/i.test(chunksText(chunks));
}

function materialLooksAbstract(diagnostics, chunks, understanding) {
  const text = `${chunksText(chunks)} ${evidenceText(understanding && understanding.sourceEvidence)}`;
  if (!text.trim()) return true;
  const abstractHits = (text.match(ABSTRACT_SOURCE_RE) || []).length;
  const concreteHits = (text.match(CONCRETE_SOURCE_RE) || []).length;
  return abstractHits >= 2 && concreteHits < 3;
}

function decideEnrichment(opts = {}) {
  const diagnostics = opts.diagnostics || {};
  const understanding = opts.understanding || {};
  const chunks = opts.chunks || [];
  const reasons = [];

  if (!understanding.readyForGeneration) {
    return {
      used: false,
      allowed: false,
      reason: 'Topic detection is not strong enough to safely enrich without risking drift.',
      reasons: ['topic_not_ready'],
      types: [],
      constraints: ['Do not enrich until domain, topic, key concepts, and source evidence are reliable.'],
    };
  }

  if (diagnostics.weak || (diagnostics.weaknessFlags || []).includes('short_extraction')) reasons.push('Uploaded material is short or weakly extracted.');
  if ((diagnostics.chunkCount || 0) < 3) reasons.push('Uploaded material has very few chunks.');
  if ((understanding.sourceEvidence || []).length < 4) reasons.push('Uploaded evidence is limited.');
  if ((understanding.keyConcepts || []).length < 5) reasons.push('Detected concepts are present but sparse.');
  if ((opts.groundingTier || '').toLowerCase() === 'weak') reasons.push('Retrieval grounding is weak.');
  if (!hasSourceCode(diagnostics, chunks) && /Object-Oriented Programming|Data Structures|Algorithms/i.test(understanding.domain || '')) {
    reasons.push('Uploaded material lacks concrete code examples.');
  }
  if (materialLooksAbstract(diagnostics, chunks, understanding)) reasons.push('Uploaded material is abstract or theoretical.');

  const used = reasons.length > 0;
  return {
    used,
    allowed: true,
    reason: used ? reasons[0] : 'Uploaded material has enough concrete source detail; enrichment is not required.',
    reasons,
    types: used ? ['simplified explanation', 'small example', 'code example', 'concrete visual example'] : [],
    constraints: [
      `Stay on the detected topic: ${understanding.normalizedTopic || understanding.topic || 'the detected topic'}.`,
      'Use uploaded source evidence as the primary source of truth.',
      'Use enrichment only to simplify, add examples, or make visuals concrete.',
      'Do not introduce unrelated CS topics or replace uploaded material.',
    ],
  };
}

function promptForPolicy(policy, understanding) {
  if (!policy || !policy.used) {
    return [
      'Enrichment policy: Prefer the uploaded material. Do not add extra examples unless needed for clarity.',
      `Detected topic: ${understanding && (understanding.topic || understanding.normalizedTopic) || 'unknown'}.`,
    ].join('\n');
  }
  return [
    'Enrichment policy: The uploaded material is the primary source of truth, but it needs beginner-friendly simplification.',
    `Detected topic: ${understanding.topic || understanding.normalizedTopic}. Keep the lesson on this exact topic only.`,
    `Allowed enrichment: ${policy.types.join(', ')}.`,
    `Reason: ${policy.reason}`,
    'Separate source-backed facts from added explanation. Add examples only when they simplify the same detected topic.',
    'Do not add unrelated concepts from the same domain.',
  ].join('\n');
}

function termSet(text) {
  return new Set(String(text || '').toLowerCase().split(/[^a-z0-9()]+/).filter(t => t.length >= 4));
}

function scoreEvidenceForScene(scene, evidence) {
  const sceneTerms = termSet([
    scene.title,
    scene.narration,
    scene.visualData && scene.visualData.caption,
    scene.code && scene.code.content,
  ].filter(Boolean).join(' '));
  return (evidence || []).map((item, index) => {
    const terms = termSet([item.quote, item.heading, item.chapterTitle, item.slideTitle].filter(Boolean).join(' '));
    let score = 0;
    for (const term of terms) if (sceneTerms.has(term)) score += 1;
    return { item, index, score };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
}

function evidenceForScene(scene, index, sourceEvidence) {
  if (!sourceEvidence || !sourceEvidence.length) return [];
  const ranked = scoreEvidenceForScene(scene, sourceEvidence);
  const best = ranked[0] && ranked[0].score > 0 ? ranked.slice(0, 2).map(r => r.item) : [sourceEvidence[index % sourceEvidence.length]];
  return best.map(item => ({
    chunkId: item.chunkId,
    chunkIndex: item.chunkIndex,
    quote: item.quote,
    score: item.score,
    chapterTitle: item.chapterTitle || '',
    heading: item.heading || '',
    slideNumber: item.slideNumber || null,
    slideTitle: item.slideTitle || '',
    sourcePage: item.sourcePage || null,
  }));
}

function enrichmentTypeForScene(scene) {
  if (scene.code && scene.code.content) return 'simplified explanation + code example';
  if (/diagram|visual|model|boundary|class|list|tree|hash|stack|queue|bigo/i.test(`${scene.type || ''} ${scene.visualTemplate || ''}`)) return 'simplified explanation + visual example';
  if (/mistake|comparison/i.test(`${scene.type || ''} ${scene.title || ''}`)) return 'simplified explanation + before/after correction';
  return 'simplified explanation';
}

function annotateScenes(scenes, opts = {}) {
  const understanding = opts.understanding || {};
  const policy = opts.enrichmentPolicy || {};
  const evidence = understanding.sourceEvidence || [];
  return (scenes || []).map((scene, index) => {
    const sourceEvidence = evidenceForScene(scene, index, evidence);
    const used = !!policy.used;
    return {
      ...scene,
      sourceEvidence,
      enrichment: {
        used,
        type: used ? enrichmentTypeForScene(scene) : 'none',
        content: used
          ? compactText(`AI simplification keeps this scene on ${understanding.topic || understanding.normalizedTopic} and makes "${scene.title || 'this idea'}" concrete while using the uploaded source evidence as the reference.`)
          : '',
      },
    };
  });
}

function topicAliases(topicDef) {
  return [topicDef.normalizedTopic, ...(topicDef.aliases || [])].map(v => String(v || '').toLowerCase()).filter(Boolean);
}

function unrelatedTopicHits(text, understanding) {
  const haystack = String(text || '').toLowerCase();
  const current = String(understanding.normalizedTopic || understanding.topic || '').toLowerCase();
  const hits = [];
  for (const family of DOMAIN_TOPICS) {
    for (const topic of family.topics) {
      if (String(topic.normalizedTopic || '').toLowerCase() === current) continue;
      for (const alias of topicAliases(topic)) {
        if (!alias || alias.length < 4) continue;
        if (current.includes(alias) || alias.includes(current)) continue;
        const re = new RegExp(`(^|[^a-z0-9])${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i');
        if (re.test(haystack)) {
          hits.push(topic.normalizedTopic);
          break;
        }
      }
    }
  }
  return [...new Set(hits)].slice(0, 6);
}

function validateEnrichment(storyboard, opts = {}) {
  const understanding = opts.understanding || storyboard.materialUnderstanding || {};
  const scenes = storyboard.scenes || [];
  const issues = [];
  const enrichedScenes = scenes.filter(scene => scene.enrichment && scene.enrichment.used);

  for (const scene of enrichedScenes) {
    if (!scene.sourceEvidence || !scene.sourceEvidence.length) {
      issues.push(`${scene.id || scene.title}:enrichment_missing_source_evidence`);
    }
    const hits = unrelatedTopicHits(scene.enrichment.content, understanding);
    if (hits.length) issues.push(`${scene.id || scene.title}:enrichment_unrelated_topics:${hits.join(',')}`);
  }

  const topicDriftRisk = issues.some(issue => issue.includes('unrelated_topics'))
    ? 'high'
    : issues.length
      ? 'medium'
      : 'low';

  return {
    passed: issues.length === 0 && topicDriftRisk === 'low',
    issues,
    topicDriftRisk,
  };
}

function buildGroundingMetadata(storyboard, opts = {}) {
  const understanding = opts.understanding || storyboard.materialUnderstanding || {};
  const policy = opts.enrichmentPolicy || {};
  const scenes = storyboard.scenes || [];
  const uniqueEvidence = new Set();
  for (const item of understanding.sourceEvidence || []) if (item.chunkId != null) uniqueEvidence.add(item.chunkId);
  const scenesWithEvidence = scenes.filter(scene => scene.sourceEvidence && scene.sourceEvidence.length).length;
  const evidenceDepth = roundScore(uniqueEvidence.size / Math.max(2, Math.min(6, scenes.length || 6)));
  const conceptDepth = roundScore((understanding.keyConcepts || []).length / 6);
  const sceneCoverage = roundScore(scenesWithEvidence / Math.max(1, scenes.length));
  const uploadedMaterialCoverage = roundScore(evidenceDepth * 0.45 + conceptDepth * 0.3 + sceneCoverage * 0.25);
  const validation = validateEnrichment(storyboard, { understanding });
  return {
    uploadedMaterialCoverage,
    enrichmentUsed: !!policy.used,
    enrichmentReason: policy.used ? (policy.reasons || [policy.reason]).filter(Boolean).join(' ') : '',
    enrichmentPolicy: policy,
    topicDriftRisk: validation.topicDriftRisk,
    scenesWithSourceEvidence: scenesWithEvidence,
    sourceEvidenceCount: (understanding.sourceEvidence || []).length,
    enrichmentValidation: validation,
  };
}

module.exports = {
  decideEnrichment,
  promptForPolicy,
  annotateScenes,
  buildGroundingMetadata,
  validateEnrichment,
  _internals: {
    materialLooksAbstract,
    unrelatedTopicHits,
  },
};
