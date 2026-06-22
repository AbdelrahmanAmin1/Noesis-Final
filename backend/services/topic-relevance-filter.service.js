'use strict';

const educationalFilter = require('./educational-content-filter.service');

const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'are', 'was', 'were', 'you', 'your', 'page', 'slide', 'lecture', 'course']);

function tokens(value) {
  return [...new Set((String(value || '').toLowerCase().match(/[a-z][a-z0-9+#-]{2,}/g) || []).filter(token => !STOP.has(token)))];
}

function clamp(value) { return Math.max(0, Math.min(1, value)); }

function contextTerms(context = {}) {
  const topics = context.topics || context.subtopics || [];
  const outcomes = context.learningOutcomes || context.learningObjectives || [];
  const concepts = context.importantConcepts || context.keyConcepts || [];
  return tokens([
    context.title,
    context.mainTopic,
    ...topics.map(topic => typeof topic === 'string' ? topic : topic && (topic.name || topic.topic)),
    ...outcomes,
    ...concepts,
    ...(context.repeatedHeadings || []),
  ].filter(Boolean).join(' '));
}

function scoreUnit(unit = {}, context = {}) {
  const textTokens = tokens([unit.heading, unit.text].filter(Boolean).join(' '));
  const terms = contextTerms(context);
  const overlap = terms.length ? terms.filter(term => textTokens.includes(term)).length / Math.min(terms.length, Math.max(4, textTokens.length || 1)) : 0;
  const signals = unit.educationalSignals || educationalFilter.educationalSignals(unit.text);
  const reasons = [];
  let score = 0.28;
  if (overlap > 0) { score += Math.min(0.42, overlap * 1.4); reasons.push('topic_term_overlap'); }
  if (unit.heading && tokens(unit.heading).some(term => terms.includes(term))) { score += 0.12; reasons.push('topic_heading'); }
  if (signals.length) { score += Math.min(0.28, signals.length * 0.09); reasons.push(...signals.map(signal => `educational_${signal}`)); }
  if (['code', 'table', 'formula', 'diagram_label', 'definition', 'example', 'warning', 'summary', 'learning_outcome'].includes(unit.contentType)) {
    score += 0.12;
    reasons.push(`important_${unit.contentType}`);
  }
  if (unit.lowValueReasons && unit.lowValueReasons.length) {
    score -= Math.min(0.5, unit.lowValueReasons.length * 0.18);
    reasons.push(...unit.lowValueReasons.map(reason => `low_value_${reason}`));
  }
  if (!terms.length && signals.length) score = Math.max(score, 0.55);
  score = Number(clamp(score).toFixed(3));
  return {
    ...unit,
    relevanceScore: score,
    relevanceLevel: score >= 0.7 ? 'high' : score >= 0.4 ? 'medium' : 'low',
    relevanceReasons: [...new Set(reasons)],
  };
}

function scoreUnits(units = [], context = {}) {
  return units.map(unit => scoreUnit(unit, context));
}

function buildEducationalView(analysis = {}, context = {}) {
  const scored = scoreUnits(analysis.candidates || [], context);
  let selected = scored.filter(unit => unit.relevanceLevel !== 'low');
  if (!selected.length && scored.length) {
    selected = [...scored].sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, Math.min(3, scored.length)).map(unit => ({
      ...unit,
      relevanceScore: Math.max(0.4, unit.relevanceScore),
      relevanceLevel: 'medium',
      relevanceReasons: [...(unit.relevanceReasons || []), 'minimum_usable_educational_fallback'],
    }));
  }
  const selectedIdSet = new Set(selected.map(unit => unit.id));
  const lowRelevance = scored.filter(unit => !selectedIdSet.has(unit.id)).map(unit => ({ ...unit, lowValueReasons: [...(unit.lowValueReasons || []), 'low_topic_relevance'] }));
  const selectedIds = new Set(selected.map(unit => unit.id));
  const pages = (analysis.pages || []).map(page => {
    const pageUnits = scored.filter(unit => unit.pageNumber === page.pageNumber && unit.slideNumber === page.slideNumber);
    return {
      ...page,
      topicRelevantUnits: pageUnits.filter(unit => selectedIds.has(unit.id)),
      cleanedEducationalText: pageUnits.filter(unit => selectedIds.has(unit.id)).map(unit => unit.text).join('\n'),
      lowValueUnits: [...(page.lowValueUnits || []), ...pageUnits.filter(unit => !selectedIds.has(unit.id))],
    };
  });
  return {
    pages,
    topicRelevantChunks: selected,
    cleanedEducationalText: selected.map(unit => unit.text).join('\n\n'),
    lowValueTextRemoved: [...(analysis.lowValueTextRemoved || []), ...lowRelevance],
    allScoredChunks: scored,
  };
}

module.exports = { buildEducationalView, contextTerms, scoreUnit, scoreUnits, tokens };
