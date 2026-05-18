'use strict';

const REQUIRED_SLIDE_TYPES = ['title', 'objectives', 'concept', 'analogy', 'diagram', 'mistakes', 'recap', 'quiz'];
const PLACEHOLDER_RE = /(this is a document|definition goes here|example here|lorem ipsum|topic explanation|placeholder|todo\b)/i;
const OOP_TERMS = ['class', 'object', 'method', 'private', 'public', 'field', 'interface', 'inheritance', 'polymorphism', 'encapsulation', 'abstraction'];
const DS_TERMS = ['node', 'pointer', 'stack', 'queue', 'tree', 'linked list', 'binary search', 'complexity', 'big-o', 'o(n)', 'push', 'pop'];

function asList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function visualType(slide) {
  return (slide && slide.visual && slide.visual.type) || slide.visual_type || '';
}

function slideType(slide) {
  return slide && (slide.slideType || slide.slide_type || '');
}

function containsAny(text, terms) {
  const lower = String(text || '').toLowerCase();
  return terms.some(t => lower.includes(t));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function addCriterion(criteria, name, passed, reason, weight = 1) {
  criteria.push({ name, passed: !!passed, reason, weight });
}

function scoreVideoScript(script, opts = {}) {
  const concept = String(opts.concept || script && script.topic || '').trim();
  const chunks = asList(opts.chunks);
  const lowGrounding = !!opts.lowGrounding;
  const slides = asList(script && script.slides);
  const reasons = [];
  const criteria = [];
  const allText = JSON.stringify(script || {}).toLowerCase();
  const types = slides.map(slideType);
  const visualTypes = unique(slides.map(visualType));
  const requiredTypesOk = REQUIRED_SLIDE_TYPES.every(t => types.includes(t)) && (types.includes('code') || types.includes('step_by_step'));
  const narrations = slides.map(s => String(s && s.narration || '').trim());
  const bulletLists = slides.map(s => asList(s && s.bullets));
  const conceptWords = concept.toLowerCase().split(/\W+/).filter(w => w.length > 2);
  const conceptCovered = !conceptWords.length || conceptWords.every(w => allText.includes(w));
  const likelyOop = containsAny(concept, OOP_TERMS) || containsAny(allText, ['encapsulation', 'inheritance', 'polymorphism', 'class']);
  const likelyDs = containsAny(concept, DS_TERMS) || containsAny(allText, ['linked list', 'stack', 'queue', 'tree', 'big-o']);
  const hasCodeOrExample = slides.some(s => String(s.example_code || '').trim().length > 20)
    || /example|for\s*\(|class\s+\w+|push|pop|insert|search/i.test(allText);
  const hasReferences = /\[chunk:\d+\]/i.test(JSON.stringify(script || ''));
  const placeholders = PLACEHOLDER_RE.test(allText);

  addCriterion(criteria, 'valid_shape', slides.length > 0 && slides.every(s => s && s.title && s.narration), 'Script has slides with title and narration.', 1.2);
  addCriterion(criteria, 'slide_count_8_to_10', slides.length >= 8 && slides.length <= 10, `Slide count is ${slides.length}; expected 8-10.`, 1);
  addCriterion(criteria, 'learning_objectives', asList(script && script.learningObjectives).length >= 2 || types.includes('objectives'), 'Has learning objectives or objectives slide.', 0.8);
  addCriterion(criteria, 'required_slide_types', requiredTypesOk, 'Covers required teaching slide sequence.', 1.3);
  const teachingTypes = ['concept', 'analogy', 'code', 'step_by_step', 'diagram', 'mistakes'];
  const narrationDeep = narrations.length > 0 && slides.every((s, i) => {
    const minLen = teachingTypes.includes(slideType(s)) ? 150 : 60;
    return narrations[i].length >= minLen;
  });
  addCriterion(criteria, 'narration_depth', narrationDeep, 'Teaching slides have 150+ char narration; others have 60+.', 1.3);
  const noBulletTruncation = bulletLists.every(list => list.every(b => !String(b).endsWith('...')));
  addCriterion(criteria, 'no_truncated_bullets', noBulletTruncation, 'No bullets end with "..." (truncated).', 0.7);
  addCriterion(criteria, 'meaningful_bullets', bulletLists.length > 0 && bulletLists.every(list => list.length >= 2 && list.some(b => String(b).length >= 8)), 'Bullets are present and meaningful.', 0.9);
  addCriterion(criteria, 'visual_diversity', visualTypes.length >= 3 && !(visualTypes.length === 1 && visualTypes[0] === 'mindmap'), `Visual types: ${visualTypes.join(', ') || 'none'}.`, 0.9);
  addCriterion(criteria, 'concept_coverage', conceptCovered, `Mentions concept "${concept}".`, 0.8);
  addCriterion(criteria, 'domain_keywords', (!likelyOop || containsAny(allText, OOP_TERMS)) && (!likelyDs || containsAny(allText, DS_TERMS)), 'Includes expected OOP/Data Structures vocabulary.', 0.8);
  addCriterion(criteria, 'examples_or_code', !likelyOop && !likelyDs ? true : hasCodeOrExample, 'Includes a concrete example or code-like sketch.', 0.8);
  addCriterion(criteria, 'grounded_references', lowGrounding || !chunks.length || hasReferences, 'Uses retrieved chunk references when grounding is available.', 0.7);
  addCriterion(criteria, 'no_placeholders', !placeholders, 'No placeholder/generic phrases.', 1);

  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
  const earned = criteria.reduce((sum, c) => sum + (c.passed ? c.weight : 0), 0);
  for (const c of criteria) {
    if (!c.passed) reasons.push(c.reason);
  }
  const score = totalWeight ? earned / totalWeight : 0;
  return {
    score: Math.round(score * 1000) / 1000,
    passed: score >= (opts.threshold == null ? 0.75 : opts.threshold),
    reasons,
    criteria,
    visualTypes,
    slideTypes: types,
  };
}

module.exports = {
  scoreVideoScript,
  REQUIRED_SLIDE_TYPES,
  PLACEHOLDER_RE,
};
