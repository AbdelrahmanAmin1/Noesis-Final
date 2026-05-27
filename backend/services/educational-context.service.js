'use strict';

const env = require('../config/env');
const knowledge = require('./knowledge.service');
const rag = require('./rag.service');
const domainDetection = require('./domain-detection.service');

const DEFAULT_MAX_CHARS = 6000;

function cleanText(value, max = 800) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  return max && text.length > max ? `${text.slice(0, max - 3).trim()}...` : text;
}

function asList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function splitChunks(ragResult = {}, retrievedChunks = []) {
  const fromResult = asList(ragResult.chunks);
  const chunks = fromResult.length ? fromResult : asList(retrievedChunks);
  const uploaded = asList(ragResult.uploaded && ragResult.uploaded.chunks).length
    ? asList(ragResult.uploaded.chunks).map(c => ({ ...c, corpus: c.corpus || 'uploaded' }))
    : chunks.filter(c => (c.corpus || 'uploaded') === 'uploaded');
  const system = asList(ragResult.system && ragResult.system.chunks).length
    ? asList(ragResult.system.chunks).map(c => ({ ...c, corpus: 'system' }))
    : chunks.filter(c => c.corpus === 'system');
  return { chunks, uploaded, system };
}

function confidenceFromResult(result, chunks) {
  if (!chunks || !chunks.length) return 'low';
  const maxScore = Number(result && result.maxScore || 0);
  if (chunks.length >= 3 && maxScore > 0.4) return 'high';
  if (chunks.length >= 2 && maxScore > 0.16) return 'medium';
  return 'low';
}

function summarizeChunks(chunks, max = 360) {
  const parts = asList(chunks)
    .slice(0, 4)
    .map(chunk => cleanText([
      chunk.heading || chunk.chapter_title || chunk.section_title || '',
      chunk.text || '',
    ].filter(Boolean).join(': '), 220))
    .filter(Boolean);
  return cleanText(parts.join(' | '), max);
}

function candidateQueries({ topic, query, retrievedChunks, ragResult }) {
  const { chunks } = splitChunks(ragResult, retrievedChunks);
  const fromChunks = chunks.flatMap(chunk => [
    chunk.heading,
    chunk.chapter_title,
    chunk.section_title,
    chunk.slide_title,
    chunk.keywords_json,
  ]);
  return [topic, query, ...fromChunks]
    .map(value => String(value || '').trim())
    .filter(Boolean);
}

function resolveCuratedTopic(args) {
  if (env.KNOWLEDGE_CONTEXT_ENABLED === false) {
    return { topic: null, trace: { enabled: false, reason: 'disabled' } };
  }
  if (args.domainInfo && !domainDetection.shouldUseCuratedCs(args.domainInfo)) {
    return {
      topic: null,
      trace: {
        enabled: true,
        matched: false,
        reason: 'domain_not_cs_high_confidence',
        domain: args.domainInfo.domain,
        confidence: args.domainInfo.confidence,
        evidence: args.domainInfo.evidence || [],
      },
    };
  }
  try {
    for (const candidate of candidateQueries(args)) {
      const match = knowledge.matchTopic(candidate, { minScore: 80, includeReason: true });
      if (match.topic) {
        return {
          topic: match.topic,
          trace: {
            enabled: true,
            matched: true,
            score: match.score,
            reason: match.reason,
            matchedText: match.matched,
            query: cleanText(candidate, 160),
          },
        };
      }
    }
    return { topic: null, trace: { enabled: true, matched: false, reason: 'no_curated_topic_match' } };
  } catch (err) {
    return { topic: null, trace: { enabled: true, matched: false, reason: 'knowledge_load_failed', error: err.message } };
  }
}

function compactCodeExample(example) {
  if (!example) return null;
  return {
    language: example.language || 'text',
    title: example.title || 'Code example',
    code: cleanText(example.code || example.content || '', 1800),
    walkthrough: asList(example.walkthrough || example.explanation).slice(0, 5),
  };
}

function preferredExamples(topic, options = {}) {
  const examples = asList(topic && topic.codeExamples);
  if (options.feature !== 'video') return examples.slice(0, 2);
  const preferred = examples.find(example => !/\b(bad|wrong|mistake|anti[-\s]?pattern)\b/i.test(String(example && example.title || '')));
  return [preferred || examples[0]].filter(Boolean);
}

function compactMistake(item) {
  if (typeof item === 'string') return { mistake: cleanText(item, 180), correction: '' };
  return {
    mistake: cleanText(item && (item.mistake || item.title || item.text), 180),
    whyItHappens: cleanText(item && item.whyItHappens, 180),
    correction: cleanText(item && item.correction, 220),
  };
}

function compactCuratedKnowledge(topicOrAlias, options = {}) {
  const topic = knowledge.getTopic(topicOrAlias);
  if (!topic) return null;
  const codeExamples = preferredExamples(topic, options).map(compactCodeExample).filter(Boolean);
  const diagrams = asList(topic.diagrams).slice(0, 2).map(diagram => ({
    type: diagram.type || 'mindmap',
    title: diagram.title || diagram.type || 'Diagram',
    nodes: asList(diagram.nodes).slice(0, 8),
    edges: asList(diagram.edges).slice(0, 8),
    caption: cleanText(diagram.caption, 260),
  }));
  return {
    id: topic.id,
    topic: topic.topic,
    domain: topic.domain || '',
    aliases: asList(topic.aliases).slice(0, 8),
    difficulty: topic.difficulty || '',
    prerequisites: asList(topic.prerequisites).slice(0, 6),
    nextTopics: asList(topic.nextTopics).slice(0, 6),
    definition: cleanText(topic.definition, 600),
    deepExplanation: cleanText(topic.deepExplanation, 1200),
    whyItMatters: cleanText(topic.whyItMatters, 500),
    analogy: cleanText(topic.analogy, 500),
    codeExamples,
    diagrams,
    commonMistakes: asList(topic.commonMistakes).slice(0, 4).map(compactMistake),
    bestPractices: asList(topic.bestPractices).slice(0, 5),
    complexity: topic.complexity || null,
    miniQuiz: asList(topic.miniQuiz || topic.practiceQuestions).slice(0, 3),
    flashcards: asList(topic.flashcards).slice(0, 4),
    visualTemplates: asList(topic.visualTemplates).slice(0, 5),
  };
}

function buildEducationalContext(args = {}) {
  const { chunks, uploaded, system } = splitChunks(args.ragResult, args.retrievedChunks);
  const domainInfo = args.domainInfo || (args.userId && args.materialId
    ? domainDetection.detectMaterialDomain(args.userId, args.materialId, { hint: args.topic || args.query })
    : null);
  const resolved = resolveCuratedTopic({ ...args, domainInfo, retrievedChunks: chunks });
  const curatedKnowledge = resolved.topic ? compactCuratedKnowledge(resolved.topic, { feature: args.feature }) : null;
  const uploadedResult = args.ragResult && args.ragResult.uploaded || {};
  const systemResult = args.ragResult && args.ragResult.system || {};
  const context = {
    topic: curatedKnowledge && curatedKnowledge.topic || cleanText(args.topic || args.query || '', 120),
    domain: curatedKnowledge && curatedKnowledge.domain || (domainInfo && domainInfo.domain) || 'general',
    domainInfo,
    audienceLevel: args.audienceLevel || 'beginner',
    sourceOnly: !curatedKnowledge,
    materialContext: {
      chunks: uploaded,
      confidence: confidenceFromResult(uploadedResult, uploaded),
      sourceSummary: summarizeChunks(uploaded),
    },
    systemContext: {
      chunks: system,
      confidence: confidenceFromResult(systemResult, system),
      sourceSummary: summarizeChunks(system),
    },
    curatedKnowledge,
    generationPolicy: {
      useUploadedMaterialFor: ['course-specific facts', 'definitions from the instructor', 'teacher terminology', 'assignment-specific details'],
      useCuratedKnowledgeFor: curatedKnowledge ? ['deep explanation', 'examples', 'diagrams', 'common mistakes', 'checkpoint questions'] : [],
      allowGeneralKnowledgeFor: ['analogies', 'simple examples', 'bridging explanation'],
      priority: curatedKnowledge
        ? 'uploaded material first, curated knowledge second, general model knowledge last'
        : 'uploaded material first, no curated CS knowledge, general model knowledge only for neutral analogies or examples',
    },
    trace: {
      feature: args.feature || 'default',
      chunkCount: chunks.length,
      uploadedChunkCount: uploaded.length,
      systemChunkCount: system.length,
      curatedMatched: Boolean(curatedKnowledge),
      curatedMatch: resolved.trace,
      domain: domainInfo,
    },
  };
  return context;
}

function formatEducationalContextForPrompt(context, options = {}) {
  if (!context || env.KNOWLEDGE_CONTEXT_ENABLED === false) {
    return 'Educational context disabled. Use uploaded source excerpts only.';
  }
  const maxChars = options.maxChars || env.KNOWLEDGE_CONTEXT_MAX_CHARS || DEFAULT_MAX_CHARS;
  const payload = {
    topic: context.topic,
    domain: context.domain,
    audienceLevel: context.audienceLevel,
    generationPolicy: context.generationPolicy,
    sourceOnly: !!context.sourceOnly,
    materialContext: {
      confidence: context.materialContext && context.materialContext.confidence,
      sourceSummary: context.materialContext && context.materialContext.sourceSummary,
      chunkCount: context.materialContext && asList(context.materialContext.chunks).length,
    },
    systemContext: {
      confidence: context.systemContext && context.systemContext.confidence,
      sourceSummary: context.systemContext && context.systemContext.sourceSummary,
      chunkCount: context.systemContext && asList(context.systemContext.chunks).length,
    },
    curatedKnowledge: context.curatedKnowledge,
    trace: context.trace,
  };
  const text = JSON.stringify(payload, null, 2);
  return text.length <= maxChars ? text : `${text.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

function firstItem(value) {
  return asList(value)[0] || null;
}

function firstTeachingCodeExample(examples) {
  const list = asList(examples);
  return list.find(example => !/\b(bad|wrong|mistake|anti[-\s]?pattern)\b/i.test(String(example && example.title || '')))
    || firstItem(list);
}

function compactCodeExampleForVideo(example) {
  if (!example) return null;
  return {
    language: example.language || 'text',
    title: example.title || 'Code example',
    code: cleanText(example.code || example.content || '', 900),
    walkthrough: asList(example.walkthrough).slice(0, 3).map(item => (
      typeof item === 'string' ? cleanText(item, 180) : {
        lineRange: cleanText(item && item.lineRange, 40),
        text: cleanText(item && item.text, 180),
      }
    )),
  };
}

function compactDiagramForVideo(diagram) {
  if (!diagram) return null;
  const label = item => {
    if (typeof item === 'string') return cleanText(item, 90);
    return cleanText(item && (item.label || item.id || item.name || item.type), 90);
  };
  const edgeLabel = edge => {
    if (Array.isArray(edge)) return edge.map(label).filter(Boolean).slice(0, 3);
    if (edge && typeof edge === 'object') return [
      edge.from || edge.source,
      edge.to || edge.target,
      edge.label || edge.relationship,
    ].map(label).filter(Boolean);
    return label(edge);
  };
  return {
    type: diagram.type || 'mindmap',
    title: diagram.title || diagram.type || 'Diagram',
    nodes: asList(diagram.nodes).slice(0, 6).map(label).filter(Boolean),
    edges: asList(diagram.edges).slice(0, 6).map(edgeLabel).filter(edge => Array.isArray(edge) ? edge.length >= 2 : edge),
    caption: cleanText(diagram.caption, 220),
  };
}

function videoContextBudget(options = {}) {
  const configured = options.maxChars || env.KNOWLEDGE_CONTEXT_MAX_CHARS || DEFAULT_MAX_CHARS;
  return Math.max(1000, Math.min(configured, 4000));
}

function practiceContextBudget(options = {}) {
  const configured = options.maxChars || env.KNOWLEDGE_CONTEXT_MAX_CHARS || DEFAULT_MAX_CHARS;
  return Math.max(1000, Math.min(configured, 4000));
}

function compactPracticeMistake(item) {
  if (typeof item === 'string') return cleanText(item, 180);
  return {
    mistake: cleanText(item && item.mistake, 160),
    correction: cleanText(item && item.correction, 180),
  };
}

function compactPracticeQuestion(item) {
  if (typeof item === 'string') return cleanText(item, 220);
  return {
    question: cleanText(item && item.question, 180),
    answer: cleanText(item && (item.answer || item.correctAnswer), 160),
  };
}

function compactPracticeFlashcard(item) {
  if (typeof item === 'string') return cleanText(item, 220);
  return {
    front: cleanText(item && (item.front || item.question), 180),
    back: cleanText(item && (item.back || item.answer), 220),
  };
}

function formatVideoEducationalContextForPrompt(context, options = {}) {
  if (!context || env.KNOWLEDGE_CONTEXT_ENABLED === false || env.KNOWLEDGE_USE_FOR_VIDEO === false) {
    return 'Video educational context disabled. Use uploaded source excerpts only.';
  }
  const maxChars = videoContextBudget(options);
  const curated = context.curatedKnowledge || null;
  const payload = {
    topic: context.topic,
    domain: context.domain,
    audienceLevel: context.audienceLevel,
    sourceConfidence: {
      uploaded: context.materialContext && context.materialContext.confidence,
      uploadedSummary: context.materialContext && context.materialContext.sourceSummary,
      system: context.systemContext && context.systemContext.confidence,
      systemSummary: context.systemContext && context.systemContext.sourceSummary,
    },
    generationPolicy: {
      priority: context.generationPolicy && context.generationPolicy.priority,
      useUploadedMaterialFor: context.generationPolicy && context.generationPolicy.useUploadedMaterialFor,
      useCuratedKnowledgeFor: curated ? ['concrete code example', 'visual diagram', 'common mistake scene', 'checkpoint question', 'teaching depth'] : [],
      allowGeneralKnowledgeFor: context.generationPolicy && context.generationPolicy.allowGeneralKnowledgeFor,
      visibleOutputRule: 'Do not show raw JSON, chunk IDs, debug trace, or internal metadata to learners.',
      sourceOnly: !curated,
    },
    curatedKnowledge: curated ? {
      id: curated.id,
      topic: curated.topic,
      definition: curated.definition,
      analogy: curated.analogy,
      codeExample: compactCodeExampleForVideo(firstItem(curated.codeExamples)),
      diagram: compactDiagramForVideo(firstItem(curated.diagrams)),
      commonMistakes: asList(curated.commonMistakes).slice(0, 3),
      miniQuiz: asList(curated.miniQuiz).slice(0, 2),
      visualTemplateHints: asList(curated.visualTemplates).slice(0, 4),
      complexity: curated.complexity || null,
      relatedTopics: [...asList(curated.prerequisites), ...asList(curated.nextTopics)].slice(0, 6),
    } : null,
    trace: {
      feature: context.trace && context.trace.feature,
      curatedMatched: !!curated,
      curatedTopicId: curated && curated.id || null,
      uploadedChunkCount: context.trace && context.trace.uploadedChunkCount,
      systemChunkCount: context.trace && context.trace.systemChunkCount,
      budgetChars: maxChars,
    },
  };
  const text = JSON.stringify(payload, null, 2);
  return text.length <= maxChars ? text : `${text.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

function formatPracticeEducationalContextForPrompt(context, options = {}) {
  if (!context || env.KNOWLEDGE_CONTEXT_ENABLED === false) {
    return 'Practice educational context disabled. Use uploaded source excerpts only.';
  }
  const feature = options.feature || (context.trace && context.trace.feature) || 'practice';
  const maxChars = practiceContextBudget(options);
  const curated = context.curatedKnowledge || null;
  const payload = {
    topic: context.topic,
    domain: context.domain,
    audienceLevel: context.audienceLevel,
    feature,
    sourceConfidence: {
      uploaded: context.materialContext && context.materialContext.confidence,
      uploadedSummary: context.materialContext && context.materialContext.sourceSummary,
      system: context.systemContext && context.systemContext.confidence,
      systemSummary: context.systemContext && context.systemContext.sourceSummary,
    },
    generationPolicy: {
      priority: context.generationPolicy && context.generationPolicy.priority,
      useUploadedMaterialFor: context.generationPolicy && context.generationPolicy.useUploadedMaterialFor,
      useCuratedKnowledgeFor: curated ? [
        'trusted definitions',
        'code and application examples',
        'common mistake coverage',
        'complexity checks',
        'diagram or visual reasoning prompts',
        'checkpoint questions and flashcard ideas',
      ] : [],
      allowGeneralKnowledgeFor: context.generationPolicy && context.generationPolicy.allowGeneralKnowledgeFor,
      visibleOutputRule: 'Do not show raw JSON, chunk IDs, debug trace, or internal metadata to learners.',
      sourceOnly: !curated,
    },
    curatedKnowledge: curated ? {
      id: curated.id,
      topic: curated.topic,
      definition: curated.definition,
      complexity: curated.complexity || null,
      flashcards: asList(curated.flashcards).slice(0, 4).map(compactPracticeFlashcard),
      miniQuiz: asList(curated.miniQuiz).slice(0, 3).map(compactPracticeQuestion),
      commonMistakes: asList(curated.commonMistakes).slice(0, 3).map(compactPracticeMistake),
      codeExample: compactCodeExampleForVideo(firstTeachingCodeExample(curated.codeExamples)),
      diagram: compactDiagramForVideo(firstItem(curated.diagrams)),
      relatedTopics: [...asList(curated.prerequisites), ...asList(curated.nextTopics)].slice(0, 6),
    } : null,
    trace: {
      feature,
      curatedMatched: !!curated,
      curatedTopicId: curated && curated.id || null,
      uploadedChunkCount: context.trace && context.trace.uploadedChunkCount,
      systemChunkCount: context.trace && context.trace.systemChunkCount,
      budgetChars: maxChars,
    },
  };
  const text = JSON.stringify(payload, null, 2);
  return text.length <= maxChars ? text : `${text.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

async function buildFromRetrieval(args = {}) {
  let ragResult = args.ragResult;
  if (!ragResult && args.materialId !== undefined) {
    ragResult = await rag.retrieveLessonContext(args.materialId || 'system', args.query || args.topic || '', {
      feature: args.feature || 'tutor',
      k: args.k || 6,
      maxMerged: args.maxMerged || 10,
    });
  }
  return buildEducationalContext({ ...args, ragResult });
}

module.exports = {
  buildEducationalContext,
  buildFromRetrieval,
  compactCuratedKnowledge,
  formatEducationalContextForPrompt,
  formatPracticeEducationalContextForPrompt,
  formatVideoEducationalContextForPrompt,
  _internals: {
    candidateQueries,
    confidenceFromResult,
    resolveCuratedTopic,
    splitChunks,
  },
};
