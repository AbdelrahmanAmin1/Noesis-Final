'use strict';

const sourceVisuals = require('./source-visual-candidates.service');
const topicRelevance = require('./topic-relevance-filter.service');

function clamp(value) { return Math.max(0, Math.min(1, Number(value || 0))); }

function recommendedSceneUsage(type = '', text = '') {
  const value = `${type} ${text}`.toLowerCase();
  if (/code/.test(value)) return 'code_walkthrough';
  if (/class|uml/.test(value)) {
    if (/inherit|extends|parent|child/.test(value)) return 'inheritance_uml';
    if (/state|behavior|transition|method/.test(value)) return 'state_behavior';
    return 'class_object';
  }
  if (/flow|process|architecture|pipeline/.test(value)) return 'process_flow';
  if (/comparison/.test(value)) return 'comparison_table';
  if (/table|matrix|grid/.test(value)) return 'classification_table';
  if (/tree|bst/.test(value)) return 'tree_visual';
  if (/hash/.test(value)) return 'hash_table_operation';
  if (/stack/.test(value)) return 'stack_operation';
  if (/queue/.test(value)) return 'queue_operation';
  return 'source_page_reference';
}

function scoreAsset(asset = {}, context = {}) {
  const text = [asset.heading, asset.nearbyText, asset.ocrText, asset.visualTypeGuess].filter(Boolean).join(' ');
  let classified = sourceVisuals.classifyVisualCandidate({
    heading: asset.heading,
    nearbyText: asset.nearbyText,
    ocrText: asset.ocrText,
    visualTypeGuess: asset.visualTypeGuess,
    hasImage: !!asset.imagePath,
  });
  if (classified.classification === 'decorative' && asset.imagePath && Number(asset.width || 0) * Number(asset.height || 0) >= 120000 && !/logo|watermark|background|footer|header|copyright/i.test(text)) {
    classified = { guess: classified.guess || 'diagram', classification: 'diagram' };
  }
  let relevance = topicRelevance.scoreUnit({
    text,
    heading: asset.heading,
    contentType: classified.classification === 'code_screenshot' ? 'code' : classified.classification === 'table' ? 'table' : 'diagram_label',
    educationalSignals: classified.classification === 'decorative' ? [] : ['diagram_label'],
  }, context).relevanceScore;
  if (classified.classification !== 'decorative' && asset.imagePath && Number(asset.width || 0) * Number(asset.height || 0) >= 120000) relevance = Math.max(0.55, relevance);
  let usefulness = classified.classification === 'decorative' ? 0 : sourceVisuals.importanceScore({
    heading: asset.heading,
    nearbyText: asset.nearbyText,
    ocrText: asset.ocrText,
    visualTypeGuess: asset.visualTypeGuess,
    hasImage: !!asset.imagePath,
    lowTextHighVisual: String(asset.nearbyText || '').length < 120 && !!asset.imagePath,
    width: asset.width,
    height: asset.height,
  });
  if ((asset.warnings || []).includes('repeated_visual_asset')) usefulness *= 0.45;
  const quality = clamp(asset.visualQualityScore == null ? asset.qualityScore == null ? (asset.imagePath ? 0.7 : 0.45) : asset.qualityScore : asset.visualQualityScore);
  const usage = recommendedSceneUsage(classified.classification || classified.guess, text);
  let recommendation = 'ignore';
  if (classified.classification !== 'decorative' && relevance >= 0.55 && usefulness >= 0.55) {
    if (usage === 'code_walkthrough') recommendation = 'redraw';
    else if (quality >= 0.65 && asset.imagePath && !/handwritten|sketch/.test(text.toLowerCase())) recommendation = 'use_directly';
    else recommendation = /table|code/.test(classified.classification) ? 'simplify' : 'redraw';
  }
  const selectedForVideo = recommendation !== 'ignore';
  const warnings = [...(asset.warnings || [])];
  if (selectedForVideo && recommendation !== 'use_directly' && quality < 0.65) warnings.push('source_visual_low_quality_redraw_required');
  if (classified.classification === 'code_screenshot') warnings.push('code_screenshot_must_be_reconstructed');
  return {
    ...asset,
    visualTypeGuess: classified.guess || classified.classification,
    classification: classified.classification,
    topicRelevanceScore: Number(relevance.toFixed(3)),
    visualUsefulnessScore: Number(usefulness.toFixed(3)),
    visualQualityScore: Number(quality.toFixed(3)),
    recommendation,
    recommendedSceneUsage: usage,
    selectedForVideo,
    mandatoryForVideo: selectedForVideo && relevance >= 0.75 && usefulness >= 0.75,
    warnings: [...new Set(warnings)],
  };
}

function selectAssets(assets = [], context = {}) {
  const scored = assets.map(asset => scoreAsset(asset, context));
  const seenMandatory = new Set();
  for (const asset of scored.sort((a, b) => b.topicRelevanceScore + b.visualUsefulnessScore - a.topicRelevanceScore - a.visualUsefulnessScore)) {
    if (!asset.mandatoryForVideo) continue;
    const key = `${asset.recommendedSceneUsage}:${(asset.heading || '').toLowerCase()}`;
    if (seenMandatory.has(key)) asset.mandatoryForVideo = false;
    else seenMandatory.add(key);
  }
  return scored;
}

module.exports = { recommendedSceneUsage, scoreAsset, selectAssets };
