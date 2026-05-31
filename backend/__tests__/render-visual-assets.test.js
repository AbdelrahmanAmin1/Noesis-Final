'use strict';

const fs = require('fs');
const path = require('path');
const env = require('../config/env');
const renderVisualAssets = require('../services/render-visual-assets.service');

describe('render visual asset preflight', () => {
  const testDir = path.join(env.UPLOAD_DIR, 'render-asset-tests');
  const pngPath = path.join(testDir, 'tree diagram safe image.png');
  const corruptPath = path.join(testDir, 'broken-tree.png');

  beforeAll(() => {
    fs.mkdirSync(testDir, { recursive: true });
    const { createCanvas } = require('canvas');
    const canvas = createCanvas(80, 60);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#eff6ff';
    ctx.fillRect(0, 0, 80, 60);
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(16, 14, 48, 32);
    fs.writeFileSync(pngPath, canvas.toBuffer('image/png'));
    fs.writeFileSync(corruptPath, 'not a real image');
  });

  afterAll(() => {
    const resolved = path.resolve(testDir);
    if (resolved.startsWith(path.resolve(env.UPLOAD_DIR))) fs.rmSync(resolved, { recursive: true, force: true });
  });

  it('rejects missing extracted image files', async () => {
    const resolved = await renderVisualAssets.resolveRenderVisualAsset({
      imagePath: path.join(testDir, 'missing.png'),
    });

    expect(resolved.valid).toBe(false);
    expect(resolved.exists).toBe(false);
    expect(resolved.reasonIfInvalid).toBe('file_not_found');
  });

  it('rejects source page references that do not have an image path', async () => {
    const resolved = await renderVisualAssets.resolveRenderVisualAsset({
      sourcePage: 61,
      caption: 'Page 61: Insertion operation',
    }, { lookupDb: false });

    expect(resolved.valid).toBe(false);
    expect(resolved.reasonIfInvalid).toBe('missing_image_path');
  });

  it('resolves a valid extracted image to absolute path, browser source, dimensions and MIME type', async () => {
    const resolved = await renderVisualAssets.resolveRenderVisualAsset({ imagePath: pngPath });

    expect(resolved.valid).toBe(true);
    expect(path.isAbsolute(resolved.absolutePath)).toBe(true);
    expect(resolved.publicUrl).toMatch(/^file:\/\/\//);
    expect(resolved.publicUrl).toContain('%20');
    expect(resolved.browserSrc).toMatch(/^data:image\/png;base64,/);
    expect(resolved.mimeType).toBe('image/png');
    expect(resolved.width).toBe(80);
    expect(resolved.height).toBe(60);
  });

  it('normalizes Windows separator paths safely', async () => {
    const windowsStylePath = pngPath.replace(/\//g, '\\');
    const resolved = await renderVisualAssets.resolveRenderVisualAsset({ imagePath: windowsStylePath });

    expect(resolved.valid).toBe(true);
    expect(path.isAbsolute(resolved.absolutePath)).toBe(true);
    expect(resolved.publicUrl).toContain('%20');
  });

  it('rejects low-confidence PDF embedded-image page estimates before render', async () => {
    const resolved = await renderVisualAssets.resolveRenderVisualAsset({
      imagePath: pngPath,
      associationMethod: 'pdf_byte_offset_estimate',
      associationConfidence: 0.25,
    });

    expect(resolved.valid).toBe(false);
    expect(resolved.reasonIfInvalid).toBe('source_image_page_association_untrusted');
  });

  it('replaces unreadable tree source images with a meaningful generated tree visual before render', async () => {
    const result = await renderVisualAssets.preflightScriptAssets({
      topic: 'Trees and Binary Search Trees',
      slides: [{
        title: 'Insertion operation',
        narration: 'Insert a value by tracing the tree from the root to the correct child position.',
        visual_type: 'source_reference',
        image_path: corruptPath,
        visual_nodes: ['Page 61', 'Insertion operation'],
      }],
    }, {
      scenes: [{
        id: 'scene-tree-insert',
        visualType: 'source_page_reference',
        visualData: { type: 'source_page_reference', imagePath: corruptPath, nodes: ['Page 61', 'Insertion operation'] },
      }],
    });

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      sceneId: 'scene-tree-insert',
      fallback: true,
      fallbackVisualType: 'tree_visual',
      reason: 'invalid_image_dimensions',
    });
    expect(result.script.slides[0].visual_type).toBe('tree');
    expect(result.script.slides[0].image_path).toBeUndefined();
    expect(result.scenes[0].visualType).toBe('tree_visual');
    expect(result.scenes[0].visualData.nodes).toEqual(expect.arrayContaining(['root', 'insertion path']));
  });

  it('keeps valid source images and removes embedded data URIs from persisted script copies', async () => {
    const result = await renderVisualAssets.preflightScriptAssets({
      slides: [{
        title: 'Source diagram',
        narration: 'Use the extracted source diagram.',
        visual_type: 'source_reference',
        image_path: pngPath,
      }],
    }, { scenes: [{ id: 'scene-source', visualType: 'source_page_reference', visualData: { imagePath: pngPath } }] });

    expect(result.warnings).toHaveLength(0);
    expect(result.script.slides[0].image_url).toMatch(/^data:image\/png;base64,/);
    expect(result.scenes[0].visualData.imageUrl).toMatch(/^data:image\/png;base64,/);
    expect(renderVisualAssets.stripEmbeddedBrowserAssets(result.script).slides[0].image_url).toBe('');
  });

  it('keeps a browser-side failed-image guard in the Remotion template', () => {
    const source = fs.readFileSync(path.join(env.ROOT_DIR, 'remotion', 'TutorScene.jsx'), 'utf8');
    expect(source).toMatch(/onError=\{\(\) =>/);
    expect(source).toMatch(/naturalWidth/);
    expect(source).toMatch(/naturalHeight/);
    expect(source).toMatch(/delayRender\('Loading validated source visual'\)/);
  });
});
