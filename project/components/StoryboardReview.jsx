const safeArray = (value) => Array.isArray(value) ? value.filter(Boolean) : [];
const cleanValue = (value, fallback = 'Not available') => {
  const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  return text || fallback;
};
const percent = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'Not available';
  return `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;
};
const truncate = (value, max = 140) => {
  const text = cleanValue(value, '');
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1)).trim()}...` : text;
};
const summarizeStatus = (record, quality) => {
  if (record && /regenerated/i.test(String(record.status || ''))) return 'Regenerated';
  if (record && record.status === 'needs_review') return 'Needs review';
  if (quality && quality.passed === true) return 'Passed';
  return 'Needs review';
};
const evidenceLabel = (item, index) => {
  const parts = [];
  if (item && item.chunkId != null) parts.push(`Chunk ${item.chunkId}`);
  if (item && item.slideNumber != null) parts.push(`Slide ${item.slideNumber}`);
  if (item && item.sourcePage != null) parts.push(`Page ${item.sourcePage}`);
  if (item && item.chapterTitle) parts.push(item.chapterTitle);
  return parts.length ? parts.join(' / ') : `Evidence ${index + 1}`;
};
const evidenceScoreLabel = (item) => {
  const score = Number(item && item.score);
  return Number.isFinite(score) ? ` / score ${score.toFixed(2)}` : '';
};
const visualWarningKeys = new Set([
  'unsupported_visual_type',
  'unrelated_diagram',
  'vague_visual',
  'decorative_only_visual',
  'narration_visual_mismatch',
  'missing_visual_elements',
  'generic_fallback_not_allowed',
  'concept_map_nodes_not_source_backed',
  'visual_type_payload_mismatch',
  'generic_visual_template',
  'abstract_chip_only_visual',
  'missing_concrete_visual_payload',
  'missing_visual_purpose',
  'missing_visual_grounding',
]);
const normalizeWarning = (warning = '') => String(warning).split(':').pop() || String(warning);
const isVisualWarning = (warning = '') => {
  const text = String(warning || '');
  return [...visualWarningKeys].some(key => text.includes(key));
};
const splitWarnings = (warnings = []) => {
  const list = safeArray(warnings);
  return {
    visual: list.filter(isVisualWarning),
    content: list.filter(w => !isVisualWarning(w)),
  };
};
const visualNodeLabels = (data = {}) => safeArray(data.nodes).map(n => typeof n === 'string' ? n : (n.label || n.name || n.id || '')).filter(Boolean);
const visualEdgeLabels = (data = {}) => safeArray(data.edges).map(edge => {
  if (Array.isArray(edge)) return edge.filter(Boolean).join(' -> ');
  if (edge && typeof edge === 'object') return [edge.from || edge.source, edge.to || edge.target, edge.label].filter(Boolean).join(' -> ');
  return String(edge || '');
}).filter(Boolean);
const visualOperationLabels = (data = {}) => safeArray(data.operations).map(op => typeof op === 'string' ? op : (op.label || op.name || op.step || '')).filter(Boolean);
const visualStatusLabel = (validation, warnings) => {
  if (validation && validation.passed === true && !warnings.length) return 'Visual passed';
  return 'Visual needs review';
};
const visualStatusStyle = (validation, warnings) => (
  validation && validation.passed === true && !warnings.length ? sr.statusGood : sr.statusNeedsReview
);
const isCriticalStoryboardWarning = (code = '') => /^domain:missing_required_visual:/.test(String(code || '')) ||
  /storyboard:too_few_scenes|domain:oop_missing_class_object_visual|domain:data_structure_missing_operation_visual|domain:algorithm_missing_flow_or_complexity_visual/.test(String(code || ''));
const targetVisualTypeFromWarning = (code = '') => {
  const match = String(code || '').match(/missing_required_visual:([a-z0-9_]+)/i);
  return match ? match[1] : '';
};

const GenerationSummary = ({ record, board, scenes, warnings }) => {
  const Icon = window.Icon;
  const quality = record.quality && record.quality.storyboard || {};
  const visualQuality = quality.visual || {};
  const coverage = visualQuality.coverage || {};
  const understanding = board.materialUnderstanding || record.quality && (record.quality.materialUnderstanding || record.quality.topicDetection) || {};
  const grounding = board.grounding || record.quality && record.quality.grounding || {};
  const diagnostics = board.materialDiagnostics || record.quality && record.quality.materialDiagnostics || {};
  const concepts = safeArray(understanding.keyConcepts).slice(0, 10);
  const enrichmentUsed = !!grounding.enrichmentUsed || safeArray(scenes).some(row => {
    const scene = row.scene || row;
    return scene.enrichment && scene.enrichment.used;
  });
  const summaryStatus = summarizeStatus(record, quality);
  const reason = grounding.enrichmentReason || (enrichmentUsed ? 'AI simplification was used for clearer beginner examples.' : 'Uploaded material was concrete enough for the storyboard.');
  const sourceFile = diagnostics.sourceFileName || diagnostics.fileName || diagnostics.title || record.source_file || 'Uploaded material';
  const statusStyle = summaryStatus === 'Passed' ? sr.statusGood : sr.statusNeedsReview;
  const info = [
    ['Domain', understanding.domain],
    ['Detected topic', understanding.topic || understanding.normalizedTopic || board.topic || record.topic],
    ['Confidence', quality.confidence != null ? percent(quality.confidence) : percent(understanding.confidence)],
    ['Source file', sourceFile],
    ['Scenes generated', scenes.length],
    ['Uploaded material coverage', percent(grounding.uploadedMaterialCoverage)],
    ['AI simplification used', enrichmentUsed ? 'Yes' : 'No'],
    ['Topic drift risk', grounding.topicDriftRisk || quality.topicDriftRisk || 'Not available'],
  ];
  const missingVisuals = safeArray(coverage.missing);
  const requiredVisuals = safeArray(coverage.required);
  const presentVisuals = safeArray(coverage.present);
  return (
    <section style={sr.summary}>
      <div style={sr.summaryHead}>
        <div style={sr.summaryTitleRow}>
          <Icon.Brain size={15} style={{ color: 'var(--accent)' }}/>
          <div>
            <div style={sr.summaryEyebrow}>Generation summary</div>
            <h2 style={sr.summaryTitle}>{understanding.topic || understanding.normalizedTopic || board.topic || record.topic || 'Detected topic'}</h2>
          </div>
        </div>
        <span style={{ ...sr.statusPill, ...statusStyle }}>{summaryStatus}</span>
      </div>
      <div style={sr.summaryGrid}>
        {info.map(([label, value]) => (
          <div key={label} style={sr.summaryItem}>
            <div style={sr.summaryLabel}>{label}</div>
            <div style={sr.summaryValue}>{cleanValue(value)}</div>
          </div>
        ))}
      </div>
      <div style={sr.conceptsRow}>
        <span style={sr.summaryLabel}>Concepts from uploaded material</span>
        <div style={sr.concepts}>
          {concepts.length ? concepts.map(c => <span key={c} style={sr.conceptChip}>{c}</span>) : <span style={sr.muted}>No concepts reported yet.</span>}
        </div>
      </div>
      <div style={sr.enrichmentNote}>
        <Icon.Sparkle size={13}/>
        <span>{reason}</span>
      </div>
      <div style={sr.visualSummary}>
        <div style={sr.summaryLabel}>Visual coverage</div>
        <div style={sr.visualCoverageRows}>
          <div><b>Required:</b> {requiredVisuals.length ? requiredVisuals.join(', ') : 'Not reported'}</div>
          <div><b>Present:</b> {presentVisuals.length ? presentVisuals.join(', ') : 'Not reported'}</div>
          <div style={missingVisuals.length ? sr.warnText : sr.okText}><b>Missing:</b> {missingVisuals.length ? missingVisuals.join(', ') : 'None'}</div>
        </div>
      </div>
      {warnings.length > 0 && (
        <div style={sr.summaryWarnings}>
          <Icon.Target size={13}/>
          <span>{warnings.slice(0, 5).join(' | ')}</span>
        </div>
      )}
    </section>
  );
};

const ApprovalPanel = ({ quality, busy, onFix, onGlobalFix, onRecheck, onApproveAnyway }) => {
  const Icon = window.Icon;
  const RotateIcon = Icon.RotateCcw || Icon.ArrowLeft || Icon.Sparkle;
  if (!quality || !quality.classified) return null;
  const { critical, warnings, info } = quality.classified;
  const details = quality.warningDetails || [];
  const detailMap = {};
  for (const d of details) detailMap[d.code] = d;
  const sceneIdFromWarning = (code) => {
    const match = code.match(/^([^:]+?):/);
    return match && !/^(domain|topic|storyboard|grounding|enrichment)$/.test(match[1]) ? match[1] : null;
  };
  const renderWarningItem = (code, severity) => {
    const detail = detailMap[code] || { label: code.replace(/_/g, ' ') };
    const sceneId = detail.sceneId || sceneIdFromWarning(code);
    const canFix = severity === 'critical' && /missing_required_visual|missing_concrete_visual_payload|generic_visual_template|visual_type_payload_mismatch/.test(code);
    const targetVisualType = targetVisualTypeFromWarning(code);
    return (
      <div key={code} style={sr.approvalItem}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={sr.approvalCode}>{sceneId ? `Scene ${sceneId}` : 'Global'}</div>
          <div style={sr.approvalLabel}>{detail.label}</div>
          {detail.fix && <div style={sr.approvalFix}>{detail.fix}</div>}
        </div>
        {canFix && (
          <button className="btn btn-ghost" style={{ fontSize: 11, whiteSpace: 'nowrap' }}
            disabled={!!busy} onClick={() => sceneId
              ? onFix(sceneId, 'fix_auto', targetVisualType)
              : onGlobalFix({ warningCode: code, targetVisualType, action: 'fix_auto' })}>
            <Icon.Sparkle size={11}/> {sceneId ? 'Fix' : 'Fix automatically'}
          </button>
        )}
      </div>
    );
  };
  return (
    <section style={sr.approvalPanel}>
      <div style={sr.approvalHead}>
        <Icon.Target size={15} style={{ color: critical.length ? 'var(--err, #ef4444)' : 'var(--warn)' }}/>
        <div style={{ flex: 1 }}>
          <div style={sr.approvalTitle}>
            {critical.length ? `${critical.length} critical issue${critical.length > 1 ? 's' : ''} must be fixed` : 'Non-critical warnings remain'}
          </div>
          <div style={sr.approvalSub}>
            {critical.length ? 'Fix critical issues before approval.' : 'You can approve anyway or fix these warnings.'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" disabled={!!busy} onClick={onRecheck}>
            <RotateIcon size={11}/> {busy === 'recheck' ? 'Checking...' : 'Re-check'}
          </button>
          {!critical.length && (
            <button className="btn btn-accent" disabled={!!busy} onClick={onApproveAnyway}>
              <Icon.Check size={11}/> Approve anyway
            </button>
          )}
        </div>
      </div>
      {critical.length > 0 && (
        <div style={sr.approvalSection}>
          <div style={{ ...sr.approvalSectionTitle, color: 'var(--err, #ef4444)' }}>Critical blockers</div>
          {critical.map(c => renderWarningItem(c, 'critical'))}
        </div>
      )}
      {warnings.length > 0 && (
        <div style={sr.approvalSection}>
          <div style={{ ...sr.approvalSectionTitle, color: 'var(--warn)' }}>Warnings</div>
          {warnings.map(w => renderWarningItem(w, 'warning'))}
        </div>
      )}
      {info.length > 0 && (
        <div style={sr.approvalSection}>
          <div style={{ ...sr.approvalSectionTitle, color: 'var(--fg-3)' }}>Info</div>
          {info.map(i => renderWarningItem(i, 'info'))}
        </div>
      )}
    </section>
  );
};

const StoryboardReview = ({ onNav }) => {
  const Icon = window.Icon;
  const RotateIcon = Icon.RotateCcw || Icon.ArrowLeft || Icon.Sparkle;
  const [storyboard, setStoryboard] = React.useState(null);
  const [busy, setBusy] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [video, setVideo] = React.useState(null);
  const id = parseInt(sessionStorage.getItem('noesis.storyboardId') || '0', 10);

  const load = React.useCallback(async () => {
    if (!id) return;
    const d = await window.NoesisAPI.videos.storyboard(id);
    setStoryboard(d.storyboard);
  }, [id]);

  React.useEffect(() => {
    load().catch(e => setStatus(e.message || 'Failed to load storyboard'));
  }, [load]);

  const patchScene = async (scene, patch) => {
    setBusy(scene.id);
    try {
      const d = await window.NoesisAPI.videos.updateScene(id, scene.id, patch);
      setStoryboard(d.storyboard);
      setStatus('Scene updated. Review warnings before approval.');
    } catch (e) {
      setStatus('Update failed: ' + (e.message || 'error'));
    } finally {
      setBusy('');
    }
  };

  const [qualityResult, setQualityResult] = React.useState(null);

  const approve = async (force) => {
    setBusy('approve');
    setQualityResult(null);
    try {
      const d = await window.NoesisAPI.videos.approveStoryboard(id, force ? { force: true } : undefined);
      setStoryboard(d.storyboard);
      setStatus('Storyboard approved. Ready to render.');
    } catch (e) {
      const details = e.data && e.data.details;
      if (details && details.classified) {
        setQualityResult(details);
        setStatus('');
      } else {
        const warns = details && details.warnings;
        const detailText = Array.isArray(warns) && warns.length ? ` ${warns.slice(0, 3).join(' | ')}` : '';
        setStatus('Approval failed: ' + (e.message || 'error') + detailText);
      }
    } finally {
      setBusy('');
    }
  };

  const recheck = async () => {
    setBusy('recheck');
    try {
      const d = await window.NoesisAPI.videos.recheckStoryboard(id);
      setQualityResult(d.quality);
      await load();
      setStatus('Quality check complete.');
    } catch (e) {
      setStatus('Recheck failed: ' + (e.message || 'error'));
    } finally {
      setBusy('');
    }
  };

  const doFixScene = async (sceneId, fixType, targetVisualType = '') => {
    setBusy('fix-' + sceneId);
    try {
      const d = await window.NoesisAPI.videos.fixScene(id, { sceneId, fixType, targetVisualType });
      setStoryboard(d.storyboard);
      setQualityResult(null);
      setStatus('Scene fixed. Re-run checks or approve.');
    } catch (e) {
      setStatus('Fix failed: ' + (e.message || 'error'));
    } finally {
      setBusy('');
    }
  };

  const doFixIssue = async (payload) => {
    setBusy('fix-global');
    try {
      const d = await window.NoesisAPI.videos.fixStoryboardIssue(id, payload);
      setStoryboard(d.storyboard);
      setQualityResult(d.quality || null);
      setStatus(d.fixedSceneId
        ? `Generated missing visual in ${d.fixedSceneId}. Re-check before approval.`
        : 'Storyboard issue fixed. Re-check before approval.');
    } catch (e) {
      setStatus('Automatic fix failed: ' + (e.message || 'error'));
    } finally {
      setBusy('');
    }
  };

  const render = async () => {
    setBusy('render');
    setStatus('Rendering approved storyboard...');
    try {
      const r = await window.NoesisAPI.videos.renderStoryboard(id);
      if (r.job_id) {
        await window.NoesisAPI.pollJob(r.job_id, {
          intervalMs: 5000,
          timeoutMs: 45 * 60 * 1000,
          onProgress: j => setStatus(j.stage || `Rendering ${j.progress || 0}%...`),
        });
      }
      const file = await window.NoesisAPI.videos.fileBlobUrl(r.video_id);
      setVideo({ id: r.video_id, file });
      setStatus('Video ready.');
    } catch (e) {
      const details = e.data && e.data.details;
      if (details && details.classified) {
        setQualityResult(details);
        const critical = details.classified.critical || [];
        const warnings = details.warnings || [];
        setStatus(critical.length
          ? 'Critical blockers must be fixed before rendering MP4.'
          : 'Render needs approval for the remaining warnings: ' + warnings.slice(0, 3).join(' | '));
      } else {
        setStatus('Render failed: ' + (e.message || 'error'));
      }
      try { await load(); } catch (_) {}
    } finally {
      setBusy('');
    }
  };

  if (!id) {
    return <EmptyStoryboard onNav={onNav} />;
  }
  if (!storyboard) {
    return <div style={sr.loading}>Loading storyboard...</div>;
  }

  const board = storyboard.storyboard || {};
  const scenes = storyboard.scenes || [];
  const storyboardQuality = storyboard.quality && storyboard.quality.storyboard || {};
  const warnings = storyboardQuality.warnings || [];
  const activeQuality = qualityResult || storyboardQuality;
  const activeCritical = activeQuality && activeQuality.classified && activeQuality.classified.critical
    ? activeQuality.classified.critical
    : warnings.filter(isCriticalStoryboardWarning);
  const hasCriticalBlockers = activeCritical.length > 0;
  const hasApprovalOverride = !!(storyboard.quality && storyboard.quality.approvalOverride);
  const canRenderStoryboard = !hasCriticalBlockers && (
    storyboard.status === 'approved' ||
    storyboard.status === 'rendering' ||
    (storyboard.approved_at && hasApprovalOverride)
  );
  const visualSceneResults = ((storyboardQuality.visual && storyboardQuality.visual.scenes) || []).reduce((acc, item) => {
    if (item && item.sceneId) acc[item.sceneId] = item;
    return acc;
  }, {});
  return (
    <div>
      <window.Topbar title="Storyboard Review" crumbs={['Videos', board.topic || storyboard.topic || 'Storyboard']}
        right={<>
          <button className="btn btn-ghost" disabled={!!busy} onClick={() => onNav && onNav('material')}><Icon.ArrowLeft size={12}/> Material</button>
          <button className="btn btn-ghost" disabled={!!busy} onClick={recheck}><RotateIcon size={12}/> {busy === 'recheck' ? 'Checking...' : 'Re-check'}</button>
          <button className="btn btn-ghost" disabled={!!busy || hasCriticalBlockers} onClick={() => approve(false)} title={hasCriticalBlockers ? 'Fix critical blockers before approval' : 'Approve storyboard'}><Icon.Check size={12}/> {busy === 'approve' ? 'Approving...' : 'Approve'}</button>
          <button className="btn btn-accent" disabled={!!busy || !canRenderStoryboard} onClick={render} title={hasCriticalBlockers ? 'Fix critical blockers before rendering' : 'Render approved storyboard'}><Icon.Play size={12}/> {busy === 'render' ? 'Rendering...' : 'Render MP4'}</button>
        </>}
      />
      <main style={sr.page}>
        <section style={sr.hero}>
          <div>
            <div style={sr.eyebrow}>Review before rendering</div>
            <h1 style={sr.title}>{board.topic || storyboard.topic}</h1>
            <p style={sr.sub}>Check the teaching goal, narration, code, and visual for each scene before spending time on MP4 rendering.</p>
          </div>
          <div style={sr.statusBox}>
            <span className="chip chip-accent">{storyboard.status}</span>
            <span>{scenes.length} scenes</span>
            <span>{warnings.length} warning{warnings.length === 1 ? '' : 's'}</span>
          </div>
        </section>

        {status && <div style={sr.notice}>{status}</div>}
        {qualityResult && <ApprovalPanel quality={qualityResult} busy={busy} onFix={doFixScene} onGlobalFix={doFixIssue} onRecheck={recheck} onApproveAnyway={() => approve(true)}/>}
        <GenerationSummary record={storyboard} board={board} scenes={scenes} warnings={warnings}/>

        <div style={sr.grid}>
          {scenes.map((row, index) => {
            const scene = row.scene || row;
            return <SceneCard key={scene.id || row.scene_id} index={index} scene={scene} visualResult={visualSceneResults[scene.id || row.scene_id]} busy={busy === scene.id || busy === ('fix-' + scene.id)} onPatch={patchScene} onFix={doFixScene}/>;
          })}
        </div>
        {video && (
          <section style={sr.videoBox}>
            <div style={sr.cardTitle}>Rendered video</div>
            <video src={video.file} controls crossOrigin="use-credentials" style={{ width: '100%', borderRadius: 8, marginTop: 10 }}/>
          </section>
        )}
      </main>
    </div>
  );
};

const SceneCard = ({ scene, index, visualResult, busy, onPatch, onFix }) => {
  const Icon = window.Icon;
  const TopicVisual = window.TopicVisual || UnsupportedStoryboardVisual;
  const [open, setOpen] = React.useState(false);
  const [showMeta, setShowMeta] = React.useState(false);
  const [narration, setNarration] = React.useState(scene.narration || '');
  React.useEffect(() => { setNarration(scene.narration || ''); }, [scene.narration]);
  const validation = scene.visualValidation || visualResult || {};
  const warn = [...new Set([...(scene.qualityWarnings || []), ...(validation.warnings || [])])];
  const split = splitWarnings(warn);
  const keyIdea = scene.learningPoint || scene.studentFacingGoal || scene.teachingGoal || scene.title || '';
  const title = scene.sceneTitle || scene.title || `Scene ${index + 1}`;
  const visualType = scene.visualType || scene.visualTemplate || 'missing';
  const visualData = scene.visualElements || scene.visualData || {};
  const grounding = scene.visualGrounding || {};
  const selectedReason = grounding.selectedVisualReason || scene.visualRationale || '';
  const nodes = visualNodeLabels(visualData);
  const edges = visualEdgeLabels(visualData);
  const operations = visualOperationLabels(visualData);
  const code = scene.code || (scene.codeSnippet ? { content: scene.codeSnippet } : null);
  const evidence = safeArray(scene.sourceEvidence);
  const enrichment = scene.enrichment || { used: false };
  const onScreenText = safeArray(scene.onScreenText);
  const motion = safeArray(scene.motionInstructions);
  return (
    <article style={sr.scene}>
      <div style={sr.sceneHead}>
        <span className="mono" style={sr.sceneNo}>{String(index + 1).padStart(2, '0')}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={sr.sceneTitle}>{title}</h3>
          <div style={sr.sceneMeta}>{cleanValue(scene.type, 'scene')} / {visualType}</div>
        </div>
        <span style={{ ...sr.statusPill, ...visualStatusStyle(validation, split.visual) }}>{visualStatusLabel(validation, split.visual)}</span>
        {split.visual.length > 0 && onFix && (
          <button className="btn btn-ghost" style={{ fontSize: 11 }} disabled={busy} onClick={() => onFix(scene.id, 'fix_auto')}>
            <Icon.Sparkle size={10}/> Fix visual
          </button>
        )}
        <button className="btn btn-bare" onClick={() => setOpen(v => !v)}>{open ? 'Close' : 'Edit'}</button>
      </div>
      {keyIdea && <div style={sr.keyIdea}>{keyIdea}</div>}
      <div style={sr.visualPanel}>
        <div style={sr.visualPanelHead}>
          <div>
            <div style={sr.metaLabel}>Visual type</div>
            <div style={sr.visualTypeName}>{visualType}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={sr.metaLabel}>Validation</div>
            <div style={validation && validation.passed === true && !split.visual.length ? sr.okText : sr.warnText}>
              {visualStatusLabel(validation, split.visual)}
            </div>
          </div>
        </div>
        <div style={sr.visualPurpose}>{cleanValue(scene.visualPurpose, 'No visual purpose reported.')}</div>
        {selectedReason && <div style={sr.visualReason}>{selectedReason}</div>}
        <div style={sr.visualFacts}>
          <div>
            <div style={sr.metaLabel}>Viewer takeaway</div>
            <div style={sr.metaValue}>{cleanValue(scene.viewerTakeaway)}</div>
          </div>
          <div>
            <div style={sr.metaLabel}>Selected because</div>
            <div style={sr.metaValue}>{cleanValue(grounding.sceneIntent || selectedReason)}</div>
          </div>
        </div>
        <div style={sr.visualElementGrid}>
          <VisualList label="Elements" items={nodes}/>
          <VisualList label="Operations" items={operations}/>
          <VisualList label="Relationships" items={edges}/>
        </div>
        {split.visual.length > 0 && (
          <div style={sr.visualWarnings}>
            <Icon.Target size={13}/>
            <span>{split.visual.map(normalizeWarning).join(', ')}</span>
          </div>
        )}
      </div>
      <TopicVisual template={visualType} data={visualData} code={code} compact />
      {code && code.content && (
        <pre style={sr.code}>{code.content}</pre>
      )}
      <p style={sr.narration}>{scene.narration}</p>
      {split.content.length > 0 && <div style={sr.sceneWarn}>Content warnings: {split.content.join(', ')}</div>}
      <div style={sr.metaToggle}>
        <button className="btn btn-bare" style={sr.metaBtn} onClick={() => setShowMeta(v => !v)}>
          <Icon.ChevronRight size={10} style={{ transform: showMeta ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}/> Scene grounding
        </button>
        {showMeta && (
          <div style={sr.metaContent}>
            <div style={sr.metaCols}>
              <div>
                <div style={sr.metaLabel}>On-screen text</div>
                <div style={sr.metaValue}>{onScreenText.length ? onScreenText.join(' / ') : 'Not reported'}</div>
              </div>
              <div>
                <div style={sr.metaLabel}>Motion</div>
                <div style={sr.metaValue}>{motion.length ? motion.join(' / ') : 'Not reported'}</div>
              </div>
            </div>
            <div style={sr.metaLabel}>Source evidence</div>
            {evidence.length ? evidence.map((item, i) => (
              <div key={(item.chunkId || 'e') + '-' + i} style={sr.evidenceItem}>
                <div style={sr.evidenceHeader}>{evidenceLabel(item, i)}{evidenceScoreLabel(item)}</div>
                <div style={sr.metaValue}>{truncate(item.quote || item.text || item.excerpt || '', 220)}</div>
              </div>
            )) : <div style={sr.metaValue}>No source evidence attached.</div>}
            <div style={sr.metaLabel}>AI simplification</div>
            {enrichment.used ? (
              <div style={sr.evidenceItem}>
                <div style={sr.evidenceHeader}>{cleanValue(enrichment.type, 'Enrichment')}</div>
                <div style={sr.metaValue}>{truncate(enrichment.content, 240)}</div>
              </div>
            ) : <div style={sr.metaValue}>No enrichment used for this scene.</div>}
            {scene.teachingGoal && (
              <>
                <div style={sr.metaLabel}>Teaching goal</div>
                <div style={sr.metaValue}>{scene.teachingGoal}</div>
              </>
            )}
            {scene.qualityWarnings && scene.qualityWarnings.length > 0 && (
              <>
                <div style={sr.metaLabel}>Quality warnings</div>
                <div style={sr.metaValue}>{split.content.length ? split.content.join(', ') : 'No content warnings.'}</div>
                <div style={sr.metaLabel}>Visual warnings</div>
                <div style={sr.metaValue}>{split.visual.length ? split.visual.join(', ') : 'No visual warnings.'}</div>
              </>
            )}
          </div>
        )}
      </div>
      {open && (
        <div style={sr.edit}>
          <label style={sr.label}>Narration</label>
          <textarea value={narration} onChange={e => setNarration(e.target.value)} style={sr.textarea}/>
          <button className="btn btn-accent" disabled={busy} onClick={() => onPatch(scene, { narration })}>{busy ? 'Saving...' : 'Save scene'}</button>
        </div>
      )}
    </article>
  );
};

const VisualList = ({ label, items }) => (
  <div style={sr.visualList}>
    <div style={sr.metaLabel}>{label}</div>
    <div style={sr.visualChips}>
      {items.length ? items.slice(0, 8).map((item, i) => <span key={item + i} style={sr.visualChip}>{truncate(item, 48)}</span>) : <span style={sr.muted}>None reported</span>}
    </div>
  </div>
);

const UnsupportedStoryboardVisual = ({ template, data = {}, compact }) => (
  <div style={{ ...sr.unsupportedVisual, minHeight: compact ? 120 : 180 }}>
    <div style={sr.metaLabel}>Visual preview unavailable</div>
    <div style={sr.metaValue}>{cleanValue(template || data.type, 'Unknown visual type')}</div>
  </div>
);

const EmptyStoryboard = ({ onNav }) => (
  <div style={sr.loading}>
    <div>No storyboard selected.</div>
    <button className="btn btn-accent" onClick={() => onNav && onNav('materials')} style={{ marginTop: 12 }}>Open materials</button>
  </div>
);

const sr = {
  loading: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-2)' },
  page: { padding: 28, maxWidth: 1380, margin: '0 auto' },
  hero: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, marginBottom: 18 },
  eyebrow: { fontSize: 11, color: 'var(--accent)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 },
  title: { fontFamily: 'var(--font-display)', fontSize: 42, fontWeight: 300, margin: 0 },
  sub: { fontSize: 13.5, color: 'var(--fg-2)', maxWidth: 650, lineHeight: 1.6 },
  statusBox: { display: 'flex', alignItems: 'center', gap: 10, color: 'var(--fg-2)', fontSize: 12 },
  notice: { padding: 12, border: '1px solid var(--line)', background: 'var(--bg-1)', borderRadius: 8, color: 'var(--fg-2)', marginBottom: 12 },
  warn: { display: 'flex', gap: 8, alignItems: 'center', padding: 12, border: '1px solid var(--warn)', color: 'var(--warn)', borderRadius: 8, marginBottom: 12 },
  summary: { border: '1px solid var(--line)', background: 'var(--bg-1)', borderRadius: 8, padding: 16, marginBottom: 16 },
  summaryHead: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, marginBottom: 14 },
  summaryTitleRow: { display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 },
  summaryEyebrow: { fontSize: 10.5, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 },
  summaryTitle: { margin: 0, fontSize: 20, fontWeight: 500, color: 'var(--fg-0)' },
  statusPill: { flex: '0 0 auto', borderRadius: 999, padding: '5px 9px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' },
  statusGood: { color: 'var(--ok)', background: 'color-mix(in srgb, var(--ok) 14%, transparent)', border: '1px solid var(--ok)' },
  statusNeedsReview: { color: 'var(--warn)', background: 'color-mix(in srgb, var(--warn) 12%, transparent)', border: '1px solid var(--warn)' },
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginBottom: 14 },
  summaryItem: { minWidth: 0, padding: '9px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-2)' },
  summaryLabel: { fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 5 },
  summaryValue: { fontSize: 12.5, color: 'var(--fg-0)', lineHeight: 1.45, overflowWrap: 'anywhere' },
  conceptsRow: { display: 'flex', alignItems: 'flex-start', gap: 12, borderTop: '1px solid var(--line)', paddingTop: 12 },
  concepts: { display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 },
  conceptChip: { fontSize: 11.5, color: 'var(--fg-1)', border: '1px solid var(--line)', background: 'var(--bg-0)', borderRadius: 999, padding: '5px 8px' },
  muted: { fontSize: 12, color: 'var(--fg-3)' },
  enrichmentNote: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 12.5, color: 'var(--fg-2)', lineHeight: 1.5 },
  visualSummary: { marginTop: 12, padding: 10, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-2)' },
  visualCoverageRows: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, color: 'var(--fg-2)', fontSize: 12, lineHeight: 1.45 },
  warnText: { color: 'var(--warn)', fontSize: 12, fontWeight: 700 },
  okText: { color: 'var(--ok)', fontSize: 12, fontWeight: 700 },
  summaryWarnings: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, padding: 10, borderRadius: 8, border: '1px solid var(--warn)', color: 'var(--warn)', fontSize: 12, lineHeight: 1.45 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 },
  scene: { border: '1px solid var(--line)', background: 'var(--bg-1)', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 },
  sceneHead: { display: 'flex', alignItems: 'center', gap: 12 },
  sceneNo: { color: 'var(--accent)', fontSize: 11 },
  sceneTitle: { fontSize: 17, margin: 0, color: 'var(--fg-0)' },
  sceneMeta: { fontSize: 11.5, color: 'var(--fg-3)', marginTop: 3 },
  keyIdea: { fontSize: 12.5, color: 'var(--fg-1)', lineHeight: 1.5, padding: 10, background: 'var(--bg-2)', borderRadius: 8, border: '1px solid var(--line)' },
  visualPanel: { border: '1px solid var(--line)', background: 'var(--bg-2)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 9 },
  visualPanelHead: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  visualTypeName: { color: 'var(--fg-0)', fontSize: 13, fontWeight: 700, overflowWrap: 'anywhere' },
  visualPurpose: { color: 'var(--fg-1)', fontSize: 12.5, lineHeight: 1.5 },
  visualReason: { color: 'var(--fg-3)', fontSize: 11.5, lineHeight: 1.45 },
  visualFacts: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 },
  visualElementGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 },
  visualList: { minWidth: 0 },
  visualChips: { display: 'flex', flexWrap: 'wrap', gap: 5 },
  visualChip: { border: '1px solid var(--line)', background: 'var(--bg-0)', color: 'var(--fg-2)', borderRadius: 999, padding: '4px 7px', fontSize: 10.5, maxWidth: '100%', overflowWrap: 'anywhere' },
  visualWarnings: { display: 'flex', alignItems: 'center', gap: 7, padding: 8, borderRadius: 8, border: '1px solid var(--warn)', color: 'var(--warn)', background: 'color-mix(in srgb, var(--warn) 8%, transparent)', fontSize: 11.5, lineHeight: 1.45 },
  metaToggle: { marginTop: 2 },
  metaBtn: { fontSize: 11, color: 'var(--fg-3)', display: 'flex', alignItems: 'center', gap: 4, padding: 0 },
  metaContent: { padding: '8px 10px', background: 'var(--bg-2)', borderRadius: 6, marginTop: 6, border: '1px dashed var(--line)' },
  metaCols: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 },
  metaLabel: { fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2, marginTop: 6 },
  metaValue: { fontSize: 11.5, color: 'var(--fg-2)', lineHeight: 1.5 },
  evidenceItem: { border: '1px solid var(--line)', background: 'var(--bg-0)', borderRadius: 6, padding: '7px 8px', marginTop: 6 },
  evidenceHeader: { fontSize: 10.5, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 },
  narration: { color: 'var(--fg-2)', fontSize: 12.5, lineHeight: 1.65, margin: 0 },
  sceneWarn: { fontSize: 11.5, color: 'var(--warn)' },
  code: { maxHeight: 120, overflow: 'auto', background: '#0f172a', color: '#dbeafe', borderRadius: 8, padding: 12, fontFamily: 'var(--font-mono)', fontSize: 11.5 },
  edit: { display: 'flex', flexDirection: 'column', gap: 8 },
  label: { fontSize: 11, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.1em' },
  textarea: { minHeight: 130, resize: 'vertical', border: '1px solid var(--line)', borderRadius: 8, padding: 12, background: 'var(--bg-0)', color: 'var(--fg-0)', font: 'inherit', lineHeight: 1.55 },
  videoBox: { marginTop: 18, border: '1px solid var(--line)', background: 'var(--bg-1)', borderRadius: 8, padding: 16 },
  cardTitle: { fontSize: 13, color: 'var(--fg-1)', fontWeight: 600 },
  unsupportedVisual: { border: '1px dashed var(--line)', background: 'var(--bg-2)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4 },
  approvalPanel: { border: '1px solid var(--warn)', background: 'color-mix(in srgb, var(--warn) 5%, var(--bg-1))', borderRadius: 8, padding: 16, marginBottom: 16 },
  approvalHead: { display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  approvalTitle: { fontSize: 15, fontWeight: 600, color: 'var(--fg-0)' },
  approvalSub: { fontSize: 12.5, color: 'var(--fg-2)', marginTop: 2 },
  approvalSection: { marginTop: 10, padding: '10px 0 0', borderTop: '1px solid var(--line)' },
  approvalSectionTitle: { fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: 8 },
  approvalItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg-0)', marginBottom: 6 },
  approvalCode: { fontSize: 10, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em' },
  approvalLabel: { fontSize: 12.5, color: 'var(--fg-1)', lineHeight: 1.4, marginTop: 2 },
  approvalFix: { fontSize: 11, color: 'var(--fg-3)', marginTop: 2 },
};

window.StoryboardReview = StoryboardReview;
