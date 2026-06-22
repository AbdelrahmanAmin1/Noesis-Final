'use strict';

const educational = require('../services/educational-content-filter.service');
const relevance = require('../services/topic-relevance-filter.service');
const selector = require('../services/visual-asset-selector.service');
const ocr = require('../services/ocr.service');

describe('educational material filtering', () => {
  const pages = [1, 2, 3].map(pageNumber => ({
    pageNumber,
    heading: pageNumber === 1 ? 'Encapsulation' : 'Controlled State',
    text: [
      'CS108 — Object-Oriented Programming',
      `Page ${pageNumber} of 3`,
      'Presented by Dr. Example',
      pageNumber === 1
        ? 'Definition: Encapsulation protects private state behind public methods.'
        : pageNumber === 2
          ? 'Example: a deposit method validates the amount before changing balance.'
          : 'Warning: direct field mutation can leave an object in an invalid state.',
    ].join('\n'),
  }));

  it('keeps raw educational evidence while classifying repeated administrative text', () => {
    const preliminary = educational.analyzePages(pages, { title: 'Encapsulation' });
    const view = relevance.buildEducationalView(preliminary, {
      title: 'Encapsulation',
      mainTopic: 'Encapsulation',
      keyConcepts: ['private state', 'public methods', 'validation'],
    });

    expect(preliminary.lowValueTextRemoved.map(item => item.text).join(' ')).toMatch(/Page 1 of 3/);
    expect(preliminary.lowValueTextRemoved.map(item => item.text).join(' ')).toMatch(/Presented by/);
    expect(view.cleanedEducationalText).toMatch(/Encapsulation protects private state/);
    expect(view.cleanedEducationalText).toMatch(/validates the amount/);
    expect(view.cleanedEducationalText).not.toMatch(/Presented by/);
    expect(view.topicRelevantChunks.every(item => ['high', 'medium'].includes(item.relevanceLevel))).toBe(true);
  });

  it('protects code, formulas, definitions, examples, and warnings from boilerplate removal', () => {
    expect(educational.educationalSignals('Definition: a queue is a FIFO structure.')).toContain('definition');
    expect(educational.educationalSignals('public class Queue { void enqueue() {} }')).toContain('code');
    expect(educational.educationalSignals('Warning: dequeue on an empty queue is invalid.')).toContain('warning');
    expect(educational.detectContentType('T(n) = T(n / 2) + 1')).toBe('formula');
  });
});

describe('OCR confidence and visual selection', () => {
  it('parses Tesseract TSV confidence and bounding boxes', () => {
    const parsed = ocr._internals.parseTesseractTsv([
      'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
      '5\t1\t1\t1\t1\t1\t10\t20\t40\t12\t90\tclass',
      '5\t1\t1\t1\t1\t2\t55\t20\t50\t12\t70\tAccount',
    ].join('\n'));

    expect(parsed.confidence).toBe(80);
    expect(parsed.words[0].boundingBox).toEqual({ left: 10, top: 20, width: 40, height: 12 });
  });

  it('redraws code and low-quality diagrams while ignoring decoration', () => {
    const context = { title: 'Queue operations', topics: ['Queue'], keyConcepts: ['FIFO', 'enqueue', 'dequeue'] };
    const assets = selector.selectAssets([
      { imagePath: 'code.png', heading: 'Queue code', nearbyText: 'public class Queue { void enqueue() {} }', qualityScore: 0.9 },
      { imagePath: 'flow.png', heading: 'Queue enqueue flowchart', nearbyText: 'FIFO enqueue rear dequeue front', qualityScore: 0.4 },
      { imagePath: 'logo.png', heading: 'University footer logo', nearbyText: 'copyright watermark', qualityScore: 0.9 },
    ], context);

    expect(assets[0].recommendation).toBe('redraw');
    expect(assets[0].recommendedSceneUsage).toBe('code_walkthrough');
    expect(assets[1].recommendation).toBe('redraw');
    expect(assets[1].recommendedSceneUsage).toBe('process_flow');
    expect(assets[2].recommendation).toBe('ignore');
  });

  it('reconstructs code indentation only from OCR word geometry', () => {
    const { reconstructCodeFromWords } = require('../services/material-analysis.service')._internals;
    const words = [
      { text: 'if', line: 1, boundingBox: { left: 10, top: 10, width: 12, height: 10 } },
      { text: 'ready', line: 1, boundingBox: { left: 26, top: 10, width: 42, height: 10 } },
      { text: '{', line: 1, boundingBox: { left: 72, top: 10, width: 6, height: 10 } },
      { text: 'return', line: 2, boundingBox: { left: 30, top: 24, width: 36, height: 10 } },
      { text: 'value', line: 2, boundingBox: { left: 70, top: 24, width: 36, height: 10 } },
      { text: '}', line: 3, boundingBox: { left: 10, top: 38, width: 6, height: 10 } },
    ];
    const rebuilt = reconstructCodeFromWords(words, 'if (ready) { return value; }');
    expect(rebuilt.split('\n')).toHaveLength(3);
    expect(rebuilt.split('\n')[1]).toMatch(/^\s+return value/);
  });
});

describe('storyboard source-evidence gates', () => {
  it('detects low-value OCR, unreadable direct assets, missing mandatory visuals, and low coverage', () => {
    const { storyboardQuality } = require('../services/storyboard.service');
    const scenes = Array.from({ length: 5 }, (_, index) => ({
      id: `scene-${index + 1}`,
      type: index === 4 ? 'recap' : 'concept',
      title: index === 0 ? 'Presented by Dr Example' : `Queue concept ${index + 1}`,
      narration: 'A queue follows FIFO order with enqueue at the rear and dequeue at the front. '.repeat(3),
      learningPoint: 'Trace one queue operation.',
      teachingGoal: 'Explain queue operations.',
      studentFacingGoal: 'Understand FIFO.',
      visualType: index === 0 ? 'source_page_reference' : 'queue_operation',
      visualTemplate: index === 0 ? 'source_page_reference' : 'queue_operation',
      visualData: index === 0 ? { sourceVisualId: 1, imagePath: 'queue.png', nodes: ['Queue'] } : { nodes: ['FIFO', 'front', 'rear'] },
      visualElements: index === 0 ? { sourceVisualId: 1, imagePath: 'queue.png', nodes: ['Queue'] } : { nodes: ['FIFO', 'front', 'rear'] },
      sourceVisualId: index === 0 ? 1 : null,
      sourceEvidence: [{ chunkId: index + 1, quote: 'Queue FIFO enqueue dequeue.' }],
      visualPurpose: 'Show the operation.', visualRationale: 'The visual makes the state change visible.', viewerTakeaway: 'Follow FIFO.',
      visualGrounding: { sceneIntent: 'Teach FIFO', selectedVisualReason: 'Queue visual', requiredVisualEvidence: ['front', 'rear'] },
    }));
    const quality = storyboardQuality({
      topic: 'Queue',
      materialUnderstanding: { topic: 'Queue', normalizedTopic: 'Queue', domain: 'Data Structures', confidence: 0.9, keyConcepts: ['FIFO', 'enqueue', 'dequeue'], sourceEvidence: [{ chunkId: 1 }, { chunkId: 2 }] },
      grounding: { topicDriftRisk: 'low' },
      scenes,
      materialAnalysis: {
        lowValueTextRemoved: [{ text: 'Presented by Dr Example' }],
        selectedVisualAssetsForVideo: [
          { id: 1, recommendation: 'redraw', visualQualityScore: 0.3, selectedForVideo: true, mandatoryForVideo: false, recommendedSceneUsage: 'queue_operation' },
          { id: 2, recommendation: 'redraw', visualQualityScore: 0.4, selectedForVideo: true, mandatoryForVideo: true, recommendedSceneUsage: 'process_flow' },
        ],
      },
    });

    expect(quality.warnings).toContain('source:low_value_ocr_visible');
    expect(quality.warnings).toContain('source:unreadable_direct_asset');
    expect(quality.warnings).toContain('source:mandatory_visual_missing:2');
    expect(quality.warnings).toContain('source:selected_visual_coverage_below_70');
    expect(quality.materialEvidence.coverage).toBe(0.5);
  });

  it('uses storyboard scene capacity instead of every extracted image for the coverage gate', () => {
    const { storyboardQuality, classifyWarnings } = require('../services/storyboard.service');
    const assets = Array.from({ length: 39 }, (_, index) => ({
      id: index + 1,
      selectedForVideo: true,
      mandatoryForVideo: true,
      topicRelevanceScore: 1,
      visualUsefulnessScore: 1,
      visualQualityScore: 0.9,
      recommendation: 'use_directly',
      recommendedSceneUsage: 'source_page_reference',
    }));
    const sourceScenes = Array.from({ length: 8 }, (_, index) => ({
      id: `source-${index + 1}`,
      type: 'definition',
      title: `Tree concept ${index + 1}`,
      narration: 'Trees connect a root to child nodes and leaves using parent-child edges. '.repeat(3),
      learningPoint: 'Explain one source-backed tree concept.',
      visualType: 'source_page_reference',
      visualTemplate: 'source_page_reference',
      visualData: { sourceVisualId: index + 2, imagePath: `tree-${index + 2}.png`, nodes: ['root', 'child'] },
      sourceVisualId: index + 2,
      sourceEvidence: [{ chunkId: index + 1, quote: 'A tree has a root and child nodes.' }],
    }));
    const protectedScenes = [
      ...Array.from({ length: 3 }, (_, index) => ({
        id: `code-${index + 1}`,
        type: 'code_walkthrough',
        title: `Code trace ${index + 1}`,
        narration: 'Trace the tree operation in code and explain the highlighted state change. '.repeat(3),
        visualType: 'code_walkthrough',
        visualTemplate: 'code_walkthrough',
        code: { content: 'class Node { int value; Node left; Node right; }' },
        sourceEvidence: [{ chunkId: 20 + index, quote: 'Node code stores child references.' }],
      })),
      { id: 'checkpoint', type: 'checkpoint', title: 'Checkpoint', narration: 'Check the root and child relationship. '.repeat(4), visualType: 'concept_cards', sourceEvidence: [{ chunkId: 30, quote: 'Check tree relationships.' }] },
      { id: 'recap', type: 'recap', title: 'Recap', narration: 'Recap roots, child nodes, and traversal. '.repeat(4), visualType: 'concept_cards', sourceEvidence: [{ chunkId: 31, quote: 'Recap tree relationships.' }] },
    ];
    const quality = storyboardQuality({
      topic: 'Trees',
      materialUnderstanding: { topic: 'Trees', normalizedTopic: 'Trees', domain: 'General/Other', confidence: 0.9, keyConcepts: ['root', 'child', 'leaf'], sourceEvidence: [{ chunkId: 1 }, { chunkId: 2 }] },
      grounding: { topicDriftRisk: 'low' },
      scenes: [...sourceScenes, ...protectedScenes],
      materialAnalysis: { selectedVisualAssetsForVideo: assets, extractedVisualAssets: assets },
    });

    expect(quality.materialEvidence).toMatchObject({
      selectedAssetCount: 39,
      eligibleSceneCapacity: 8,
      plannedAssetCount: 8,
      plannedCoveredAssetCount: 7,
      plannedCoverage: 0.875,
    });
    expect(quality.warnings).not.toContain('source:selected_visual_coverage_below_70');
    expect(classifyWarnings(['source:selected_visual_coverage_below_70']).hardBlockers).toEqual([]);
    expect(classifyWarnings(['source:important_extracted_visual_ignored:99']).hardBlockers).toEqual([]);
  });
});
