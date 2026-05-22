'use strict';

const enrichment = require('../services/grounded-enrichment.service');

const encapsulationUnderstanding = {
  readyForGeneration: true,
  domain: 'Object-Oriented Programming',
  topic: 'Encapsulation in Java',
  normalizedTopic: 'Encapsulation',
  confidence: 0.87,
  keyConcepts: ['class', 'object', 'state', 'private fields', 'public methods', 'invariant'],
  sourceEvidence: [
    {
      chunkId: 1,
      chunkIndex: 0,
      quote: 'Encapsulation hides internal object state with private fields.',
      heading: 'Encapsulation',
      score: 8,
    },
    {
      chunkId: 2,
      chunkIndex: 1,
      quote: 'Public methods control access and preserve invariants.',
      heading: 'Controlled access',
      score: 6,
    },
  ],
};

describe('grounded-enrichment.service', () => {
  it('uses enrichment when ready material is abstract and lacks code examples', () => {
    const policy = enrichment.decideEnrichment({
      diagnostics: { weak: false, chunkCount: 2, weaknessFlags: [], chunkReferences: [{ hasCode: false }, { hasCode: false }] },
      understanding: encapsulationUnderstanding,
      groundingTier: 'moderate',
      chunks: [
        { text: 'Encapsulation is an important concept and principle in object-oriented design.' },
        { text: 'This overview introduces the definition of data hiding.' },
      ],
    });

    expect(policy.used).toBe(true);
    expect(policy.allowed).toBe(true);
    expect(policy.types).toContain('code example');
    expect(policy.constraints.join(' ')).toMatch(/Encapsulation/);
  });

  it('does not enrich when topic detection is not ready', () => {
    const policy = enrichment.decideEnrichment({
      diagnostics: { weak: true, chunkCount: 1 },
      understanding: { readyForGeneration: false, normalizedTopic: 'Document' },
      groundingTier: 'weak',
      chunks: [],
    });

    expect(policy.used).toBe(false);
    expect(policy.allowed).toBe(false);
    expect(policy.reasons).toContain('topic_not_ready');
  });

  it('annotates scenes with source evidence and explicit enrichment fields', () => {
    const policy = { used: true, reason: 'Uploaded material lacks concrete code examples.', types: ['simplified explanation', 'code example'] };
    const scenes = enrichment.annotateScenes([
      {
        id: 'scene-1',
        title: 'Private Fields',
        narration: 'Private fields hide object state.',
        visualTemplate: 'encapsulation_boundary',
        visualData: { nodes: ['private fields', 'public methods'] },
      },
    ], { understanding: encapsulationUnderstanding, enrichmentPolicy: policy });

    expect(scenes[0].sourceEvidence.length).toBeGreaterThanOrEqual(1);
    expect(scenes[0].sourceEvidence[0].chunkId).toBe(1);
    expect(scenes[0].enrichment.used).toBe(true);
    expect(scenes[0].enrichment.type).toBe('simplified explanation + visual example');
    expect(scenes[0].enrichment.content).toMatch(/Encapsulation in Java/);
  });

  it('fails validation when enriched scenes lack source evidence', () => {
    const validation = enrichment.validateEnrichment({
      topic: 'Encapsulation in Java',
      scenes: [
        { id: 'scene-1', enrichment: { used: true, content: 'Explain Encapsulation with a Counter example.' }, sourceEvidence: [] },
      ],
    }, { understanding: encapsulationUnderstanding });

    expect(validation.passed).toBe(false);
    expect(validation.topicDriftRisk).toBe('medium');
    expect(validation.issues.join(' ')).toContain('enrichment_missing_source_evidence');
  });

  it('flags unrelated-topic enrichment as high drift risk', () => {
    const validation = enrichment.validateEnrichment({
      topic: 'Encapsulation in Java',
      scenes: [
        {
          id: 'scene-1',
          enrichment: { used: true, content: 'Switch the explanation to linked list traversal and next pointers.' },
          sourceEvidence: [{ chunkId: 1, quote: 'Encapsulation hides state.' }],
        },
      ],
    }, { understanding: encapsulationUnderstanding });

    expect(validation.passed).toBe(false);
    expect(validation.topicDriftRisk).toBe('high');
    expect(validation.issues.join(' ')).toMatch(/unrelated_topics/);
  });

  it('builds storyboard-level grounding metadata', () => {
    const policy = { used: true, reasons: ['Uploaded material is abstract.'], types: ['simplified explanation'] };
    const scenes = enrichment.annotateScenes([
      { id: 'scene-1', title: 'State', narration: 'Object state is protected.' },
      { id: 'scene-2', title: 'Methods', narration: 'Public methods control access.' },
    ], { understanding: encapsulationUnderstanding, enrichmentPolicy: policy });

    const grounding = enrichment.buildGroundingMetadata({
      topic: 'Encapsulation in Java',
      materialUnderstanding: encapsulationUnderstanding,
      scenes,
    }, { understanding: encapsulationUnderstanding, enrichmentPolicy: policy });

    expect(grounding.enrichmentUsed).toBe(true);
    expect(grounding.topicDriftRisk).toBe('low');
    expect(grounding.uploadedMaterialCoverage).toBeGreaterThan(0);
    expect(grounding.enrichmentValidation.passed).toBe(true);
  });
});
