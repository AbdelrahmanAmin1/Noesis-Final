'use strict';

const LAYOUT_TEMPLATES = Object.freeze({
  source_main: Object.freeze({
    source: Object.freeze({ x: 0, y: 0, w: 1, h: 1 }),
  }),
  generated_main: Object.freeze({
    generated: Object.freeze({ x: 0, y: 0, w: 1, h: 1 }),
  }),
  source_left_generated_right: Object.freeze({
    source: Object.freeze({ x: 0, y: 0, w: 0.58, h: 1 }),
    generated: Object.freeze({ x: 0.62, y: 0, w: 0.38, h: 1 }),
  }),
  generated_left_source_right: Object.freeze({
    generated: Object.freeze({ x: 0, y: 0, w: 0.38, h: 1 }),
    source: Object.freeze({ x: 0.42, y: 0, w: 0.58, h: 1 }),
  }),
  source_top_explanation_bottom: Object.freeze({
    source: Object.freeze({ x: 0, y: 0, w: 1, h: 0.7 }),
    explanation: Object.freeze({ x: 0, y: 0.74, w: 1, h: 0.26 }),
  }),
  source_main_with_annotation_panel: Object.freeze({
    source: Object.freeze({ x: 0, y: 0, w: 0.72, h: 1 }),
    annotations: Object.freeze({ x: 0.76, y: 0, w: 0.24, h: 1 }),
  }),
});

function sourceOnlyPlan() {
  return {
    compositionMode: 'source_only',
    primaryVisual: 'source_image',
    secondaryVisual: null,
    layoutTemplate: 'source_main',
    regions: LAYOUT_TEMPLATES.source_main,
    collisionDetected: false,
  };
}

function generatedOnlyPlan() {
  return {
    compositionMode: 'generated_only',
    primaryVisual: 'generated_visual',
    secondaryVisual: null,
    layoutTemplate: 'generated_main',
    regions: LAYOUT_TEMPLATES.generated_main,
    collisionDetected: false,
  };
}

function rectanglesOverlap(a, b) {
  if (!a || !b) return false;
  return a.x < b.x + b.w
    && a.x + a.w > b.x
    && a.y < b.y + b.h
    && a.y + a.h > b.y;
}

function collisionPairs(regions = {}) {
  const entries = Object.entries(regions).filter(([, region]) => region);
  const collisions = [];
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      if (rectanglesOverlap(entries[i][1], entries[j][1])) {
        collisions.push([entries[i][0], entries[j][0]]);
      }
    }
  }
  return collisions;
}

function normalizeCompositionPlan(plan = {}, opts = {}) {
  if (opts.hasSourceImage) return sourceOnlyPlan();
  if (!opts.allowMixedLayout || plan.compositionMode !== 'split') return generatedOnlyPlan();
  const template = LAYOUT_TEMPLATES[plan.layoutTemplate]
    ? plan.layoutTemplate
    : 'source_left_generated_right';
  const regions = plan.regions || LAYOUT_TEMPLATES[template];
  const collisions = collisionPairs(regions);
  if (collisions.length) {
    return {
      ...(opts.hasSourceImage ? sourceOnlyPlan() : generatedOnlyPlan()),
      repairedFromCollision: true,
      rejectedRegions: regions,
    };
  }
  return {
    compositionMode: 'split',
    primaryVisual: plan.primaryVisual || 'source_image',
    secondaryVisual: plan.secondaryVisual || 'generated_visual',
    layoutTemplate: template,
    regions,
    collisionDetected: false,
  };
}

module.exports = {
  LAYOUT_TEMPLATES,
  collisionPairs,
  generatedOnlyPlan,
  normalizeCompositionPlan,
  rectanglesOverlap,
  sourceOnlyPlan,
};
