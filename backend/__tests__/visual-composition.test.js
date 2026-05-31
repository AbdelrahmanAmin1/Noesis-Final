'use strict';

const visualComposition = require('../utils/visual-composition');
const slides = require('../services/slides.service');

describe('visual composition policy', () => {
  it('uses a single full source region for trusted extracted images', () => {
    const plan = visualComposition.normalizeCompositionPlan({
      compositionMode: 'split',
      layoutTemplate: 'source_left_generated_right',
    }, { hasSourceImage: true, allowMixedLayout: true });

    expect(plan).toMatchObject({
      compositionMode: 'source_only',
      primaryVisual: 'source_image',
      secondaryVisual: null,
      layoutTemplate: 'source_main',
      collisionDetected: false,
    });
    expect(plan.regions).toEqual({ source: { x: 0, y: 0, w: 1, h: 1 } });
  });

  it('keeps supported split layouts collision-free', () => {
    const plan = visualComposition.normalizeCompositionPlan({
      compositionMode: 'split',
      layoutTemplate: 'source_left_generated_right',
    }, { allowMixedLayout: true });

    expect(plan.compositionMode).toBe('split');
    expect(visualComposition.collisionPairs(plan.regions)).toEqual([]);
  });

  it('repairs unsafe split layouts instead of allowing ambiguous overlap', () => {
    const overlapping = {
      source: { x: 0, y: 0, w: 0.7, h: 1 },
      generated: { x: 0.5, y: 0, w: 0.5, h: 1 },
    };
    const plan = visualComposition.normalizeCompositionPlan({
      compositionMode: 'split',
      layoutTemplate: 'source_left_generated_right',
      regions: overlapping,
    }, { allowMixedLayout: true });

    expect(visualComposition.collisionPairs(overlapping)).toEqual([['source', 'generated']]);
    expect(plan).toMatchObject({
      compositionMode: 'generated_only',
      layoutTemplate: 'generated_main',
      repairedFromCollision: true,
    });
  });

  it('suppresses canvas animation overlays for source-image scenes', () => {
    expect(slides._internals.shouldDrawAnimationOverlay(
      { composition_mode: 'source_only' },
      { type: 'source_reference' }
    )).toBe(false);
    expect(slides._internals.shouldDrawAnimationOverlay(
      { composition_mode: 'generated_only' },
      { type: 'tree' }
    )).toBe(true);
  });
});
