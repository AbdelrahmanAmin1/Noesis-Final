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
  const classified = quality && quality.classified || {};
  const needsInput = safeArray(classified.userActionRequired).length || safeArray(classified.hardBlockers).length;
  if (record && record.status === 'rendered') return 'Rendered';
  if (needsInput) return 'Needs user input';
  if (record && (record.status === 'approved' || record.status === 'rendering' || record.approved_at)) return 'Ready to render';
  if (quality && (quality.passed === true || !needsInput)) return 'Ready to render';
  if (record && record.status === 'needs_review') return 'Needs user input';
  return 'Needs user input';
};
const evidenceLabel = (item, index) => {
  const parts = [`Evidence ${index + 1}`];
  if (item && item.slideNumber != null) parts.push(`Slide ${item.slideNumber}`);
  if (item && item.sourcePage != null) parts.push(`Page ${item.sourcePage}`);
  if (item && item.chapterTitle) parts.push(item.chapterTitle);
  return parts.join(' / ');
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
const normalizeWarning = (warning = '') => String(warning).split(':').pop().replace(/_/g, ' ') || String(warning);
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
  /storyboard:too_few_scenes|domain:oop_missing_class_object_visual|domain:data_structure_missing_operation_visual|domain:algorithm_missing_flow_or_complexity_visual|domain:missing_code_scene|domain:unrelated_cs_injection/.test(String(code || ''));
const targetVisualTypeFromWarning = (code = '') => {
  const match = String(code || '').match(/missing_required_visual:([a-z0-9_]+)/i);
  return match ? match[1] : '';
};
const isInternalRepairWarning = (code = '') => /topic:low_confidence|topic:insufficient_key_concepts|topic:insufficient_source_evidence|domain:missing_checkpoint_scene|domain:missing_recap_scene|domain:missing_concrete_example_scene|domain:missing_common_mistake_scene|storyboard:insufficient_visual_variety|grounding:missing_topic_drift_risk|missing_source_evidence|missing_learning_point|page_number_center_visual/.test(String(code || ''));
const finalWarningsForDisplay = (quality = {}) => {
  const classified = quality.classified || {};
  const userAction = [...safeArray(classified.userActionRequired), ...safeArray(classified.hardBlockers)];
  if (userAction.length) return [...new Set(userAction)];
  return safeArray(classified.warnings || quality.warnings).filter(w => !isInternalRepairWarning(w));
};
const topicMapForRecord = (record = {}, board = {}) => (
  board.topicMap ||
  (board.materialUnderstanding && board.materialUnderstanding.topicMap) ||
  (record.quality && record.quality.topicMap) ||
  null
);
const topicSceneCounts = (topics = [], scenes = []) => {
  const counts = {};
  for (const topic of topics) counts[topic.id || topic.name] = 0;
  for (const row of scenes) {
    const scene = row.scene || row;
    const key = scene.topicId || scene.topicName;
    if (key && counts[key] != null) counts[key] += 1;
    else {
      const match = topics.find(t => String(scene.topicName || '').toLowerCase() === String(t.name || '').toLowerCase());
      if (match) counts[match.id || match.name] += 1;
    }
  }
  return counts;
};
const topicMapTitle = (topicMap, fallback = '') => {
  const topics = safeArray(topicMap && topicMap.topics);
  if (topics.length >= 2) return topicMap.title || topics.slice(0, 4).map(t => t.name || t.topic).filter(Boolean).join(' / ');
  if (topics.length === 1) return topics[0].name || topics[0].topic || fallback;
  return fallback;
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
  const statusStyle = summaryStatus === 'Needs user input' ? sr.statusNeedsReview : sr.statusGood;
  const topicMap = topicMapForRecord(record, board);
  const topics = safeArray(topicMap && topicMap.topics);
  const counts = topicSceneCounts(topics, scenes);
  const displayTopic = topicMapTitle(topicMap, understanding.topic || understanding.normalizedTopic || board.topic || record.topic);
  const topicWeightTotal = topics.reduce((sum, topic) => sum + Math.max(0, Number(topic.weight || 0)), 0) || topics.length || 1;
  const info = [
    ['Domain', understanding.domain],
    ['Detected topic', displayTopic],
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
            <h2 style={sr.summaryTitle}>{displayTopic || 'Detected topic'}</h2>
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
      {topics.length > 0 && (
        <div style={sr.topicCoverage}>
          <div style={sr.summaryLabel}>Topic coverage</div>
          <div style={sr.topicCoverageGrid}>
            {topics.map(topic => {
              const key = topic.id || topic.name;
              const sceneCount = counts[key] || counts[topic.name] || 0;
              const weight = Math.max(0, Number(topic.weight || 0));
              const weightLabel = weight ? ` / ${Math.round((weight / topicWeightTotal) * 100)}% source weight` : '';
              return (
                <div key={key} style={sr.topicCoverageItem}>
                  <div style={sr.topicCoverageName}>{topic.name}</div>
                  <div style={sr.metaValue}>
                    {sceneCount} scene{sceneCount === 1 ? '' : 's'}{weightLabel}
                    {safeArray(topic.sourcePageRefs).length ? ` / ${safeArray(topic.sourcePageRefs).map(ref => ref.label || (ref.pageNumber ? `Page ${ref.pageNumber}` : ref.slideNumber ? `Slide ${ref.slideNumber}` : '')).filter(Boolean).slice(0, 2).join(', ')}` : ''}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
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
  const classified = quality.classified || {};
  const critical = [...new Set([...safeArray(classified.userActionRequired), ...safeArray(classified.hardBlockers)])];
  const warnings = safeArray(classified.warnings || quality.warnings).filter(w => !critical.includes(w) && !isInternalRepairWarning(w));
  const info = safeArray(classified.info).filter(w => !isInternalRepairWarning(w));
  if (!critical.length && !warnings.length && !info.length) return null;
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
    const canFix = (severity === 'critical' || isVisualWarning(code)) && /missing_required_visual|missing_concrete_visual_payload|generic_visual_template|visual_type_payload_mismatch|generic_fallback_not_allowed|missing_visual_elements|vague_visual|narration_visual_mismatch/.test(code);
    const targetVisualType = targetVisualTypeFromWarning(code);
    return (
      <div key={code} style={sr.approvalItem}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={sr.approvalCode}>{sceneId ? `Scene ${sceneId}` : 'Global'}</div>
          <div style={sr.approvalLabel}>{detail.label}</div>
          {detail.fix && <div style={sr.approvalFix}>{detail.fix}</div>}
        </div>
        {canFix && (
          <button className="btn btn-ghost" style={{ fontSize: 'calc(11px * var(--app-font-scale))', whiteSpace: 'nowrap' }}
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
        <div style={{ display: 'flex', gap: 'calc(8px * var(--app-density-scale))' }}>
          <button className="btn btn-ghost" disabled={!!busy} onClick={onRecheck}>
            <RotateIcon size={11}/> {busy === 'recheck' ? 'Checking...' : 'Re-check'}
          </button>
          <button className="btn btn-accent" disabled={!!busy || critical.length > 0} onClick={onApproveAnyway}>
            <Icon.Check size={11}/> Approve anyway
          </button>
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

  React.useEffect(() => {
    return () => {
      if (video && video.file && video.file.startsWith('blob:')) URL.revokeObjectURL(video.file);
      if (video && video.captions && video.captions.startsWith('blob:')) URL.revokeObjectURL(video.captions);
    };
  }, [video]);

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

  const doFixScene = async (sceneId, fixType, targetVisualType = '', sourcePreference = 'auto', sourceVisualId = null) => {
    setBusy('fix-' + sceneId);
    try {
      const d = await window.NoesisAPI.videos.fixScene(id, { sceneId, fixType, targetVisualType, sourcePreference, sourceVisualId });
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

  const doRegenerateTopic = async (topicId) => {
    setBusy('topic-' + topicId);
    try {
      const d = await window.NoesisAPI.videos.regenerateTopic(id, { topicId });
      setStoryboard(d.storyboard);
      setQualityResult(null);
      setStatus('Topic section regenerated.');
    } catch (e) {
      setStatus('Topic regeneration failed: ' + (e.message || 'error'));
    } finally {
      setBusy('');
    }
  };

  const doRepairWarnings = async () => {
    setBusy('ai-repair');
    try {
      const d = await window.NoesisAPI.videos.repairStoryboard(id, {
        scope: 'weak_scenes',
        warningCodes: warnings,
        sourcePreference: 'auto',
      });
      setStoryboard(d.storyboard);
      setQualityResult(d.quality || null);
      const repair = d.repair || {};
      const repaired = safeArray(repair.repairedSceneIds);
      const skipped = safeArray(repair.skippedSceneIds);
      setStatus(repaired.length
        ? `AI repaired ${repaired.length} scene${repaired.length === 1 ? '' : 's'}. ${skipped.length ? `${skipped.length} scene${skipped.length === 1 ? '' : 's'} still need review.` : 'Review the updated warnings before approval.'}`
        : 'AI repair did not apply changes. The storyboard is unchanged.');
    } catch (e) {
      setStatus('AI repair failed: ' + (e.message || 'error'));
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
      const [file, captions] = await Promise.all([
        window.NoesisAPI.videos.fileBlobUrl(r.video_id),
        window.NoesisAPI.videos.captionsBlobUrl(r.video_id).catch(() => null),
      ]);
      setVideo({ id: r.video_id, file, captions });
      setStatus('Video ready.');
    } catch (e) {
      const details = e.data && e.data.details;
      if (details && details.classified) {
        setQualityResult(details);
        const critical = [...safeArray(details.classified.userActionRequired), ...safeArray(details.classified.hardBlockers)];
        const warnings = details.warnings || [];
        setStatus(critical.length
          ? 'Storyboard needs user input before rendering MP4.'
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
  const warnings = finalWarningsForDisplay(storyboardQuality);
  const activeQuality = qualityResult || storyboardQuality;
  const activeCritical = activeQuality && activeQuality.classified
    ? [...safeArray(activeQuality.classified.userActionRequired), ...safeArray(activeQuality.classified.hardBlockers)]
    : warnings.filter(isCriticalStoryboardWarning);
  const hasCriticalBlockers = activeCritical.length > 0;
  const hasApprovalOverride = !!(storyboard.quality && storyboard.quality.approvalOverride);
  const canRenderStoryboard = (
    storyboard.status === 'approved' ||
    storyboard.status === 'rendering' ||
    (storyboard.approved_at && hasApprovalOverride)
  );
  const visualSceneResults = ((storyboardQuality.visual && storyboardQuality.visual.scenes) || []).reduce((acc, item) => {
    if (item && item.sceneId) acc[item.sceneId] = item;
    return acc;
  }, {});
  const topicMap = topicMapForRecord(storyboard, board);
  const topicRows = safeArray(topicMap && topicMap.topics);
  const topicGroups = topicRows.length
    ? topicRows.map(topic => ({
      topic,
      rows: scenes.filter(row => {
        const scene = row.scene || row;
        return String(scene.topicId || '').toLowerCase() === String(topic.id || '').toLowerCase()
          || String(scene.topicName || '').toLowerCase() === String(topic.name || '').toLowerCase();
      }),
    })).filter(group => group.rows.length)
    : [];
  const groupedSceneIds = new Set(topicGroups.flatMap(group => group.rows.map(row => (row.scene || row).id || row.scene_id)));
  const ungroupedRows = scenes.filter(row => !groupedSceneIds.has((row.scene || row).id || row.scene_id));
  return (
    <div>
      <window.Topbar title="Storyboard Review" crumbs={['Videos', board.topic || storyboard.topic || 'Storyboard']}
        right={<>
          <button className="btn btn-ghost" disabled={!!busy} onClick={() => onNav && onNav('material')}><Icon.ArrowLeft size={12}/> Material</button>
          <button className="btn btn-ghost" disabled={!!busy} onClick={recheck}><RotateIcon size={12}/> {busy === 'recheck' ? 'Checking...' : 'Re-check'}</button>
          <button className="btn btn-accent" disabled={!!busy || !warnings.length} onClick={doRepairWarnings} title={warnings.length ? 'Use AI to repair remaining storyboard warnings' : 'No user-actionable warnings'}><Icon.Sparkle size={12}/> {busy === 'ai-repair' ? 'Repairing...' : 'Repair warnings'}</button>
          <button className="btn btn-ghost" disabled={!!busy || hasCriticalBlockers} onClick={() => approve(false)} title={hasCriticalBlockers ? 'User input is needed before approval' : 'Approve storyboard'}><Icon.Check size={12}/> {busy === 'approve' ? 'Approving...' : 'Approve'}</button>
          <button className="btn btn-accent" disabled={!!busy || !canRenderStoryboard} onClick={render} title={hasCriticalBlockers ? 'User input is needed before rendering' : 'Render approved storyboard'}><Icon.Play size={12}/> {busy === 'render' ? 'Rendering...' : 'Render MP4'}</button>
        </>}
      />
      <main style={sr.page}>
        <section style={sr.hero}>
          <div>
            <div style={sr.eyebrow}>Review before rendering</div>
            <h1 style={sr.title}>{board.topic || storyboard.topic}</h1>
            <p style={sr.sub}>Check the learning point, narration, code, and visual for each scene before spending time on MP4 rendering.</p>
          </div>
          <div style={sr.statusBox}>
            <span className="chip chip-accent">{summarizeStatus(storyboard, storyboardQuality)}</span>
            <span>{scenes.length} scenes</span>
            <span>{warnings.length} issue{warnings.length === 1 ? '' : 's'}</span>
          </div>
        </section>

        {status && <div style={sr.notice}>{status}</div>}
        {qualityResult && <ApprovalPanel quality={qualityResult} busy={busy} onFix={doFixScene} onGlobalFix={doFixIssue} onRecheck={recheck} onApproveAnyway={() => approve(true)}/>}
        <GenerationSummary record={storyboard} board={board} scenes={scenes} warnings={warnings}/>

        {topicGroups.length > 0 ? (
          <div style={sr.topicSceneStack}>
            {topicGroups.map(group => (
              <section key={group.topic.id || group.topic.name} style={sr.topicSection}>
                <div style={sr.topicSectionHead}>
                  <div>
                    <div style={sr.summaryLabel}>Topic section</div>
                    <h2 style={sr.topicSectionTitle}>{group.topic.name}</h2>
                  </div>
                  <button className="btn btn-ghost" disabled={!!busy} onClick={() => doRegenerateTopic(group.topic.id || group.topic.name)}>
                    <RotateIcon size={12}/> {busy === ('topic-' + (group.topic.id || group.topic.name)) ? 'Regenerating...' : 'Regenerate topic'}
                  </button>
                </div>
                <div style={sr.grid}>
                  {group.rows.map((row, index) => {
                    const scene = row.scene || row;
                    const absoluteIndex = scenes.findIndex(item => ((item.scene || item).id || item.scene_id) === (scene.id || row.scene_id));
                    return <SceneCard key={scene.id || row.scene_id} index={absoluteIndex >= 0 ? absoluteIndex : index} scene={scene} visualResult={visualSceneResults[scene.id || row.scene_id]} busy={busy === scene.id || busy === ('fix-' + scene.id)} onPatch={patchScene} onFix={doFixScene}/>;
                  })}
                </div>
              </section>
            ))}
            {ungroupedRows.length > 0 && (
              <section style={sr.topicSection}>
                <div style={sr.topicSectionHead}>
                  <div>
                    <div style={sr.summaryLabel}>Shared scenes</div>
                    <h2 style={sr.topicSectionTitle}>Overview and recap</h2>
                  </div>
                </div>
                <div style={sr.grid}>
                  {ungroupedRows.map((row, index) => {
                    const scene = row.scene || row;
                    const absoluteIndex = scenes.findIndex(item => ((item.scene || item).id || item.scene_id) === (scene.id || row.scene_id));
                    return <SceneCard key={scene.id || row.scene_id} index={absoluteIndex >= 0 ? absoluteIndex : index} scene={scene} visualResult={visualSceneResults[scene.id || row.scene_id]} busy={busy === scene.id || busy === ('fix-' + scene.id)} onPatch={patchScene} onFix={doFixScene}/>;
                  })}
                </div>
              </section>
            )}
          </div>
        ) : (
          <div style={sr.grid}>
            {scenes.map((row, index) => {
              const scene = row.scene || row;
              return <SceneCard key={scene.id || row.scene_id} index={index} scene={scene} visualResult={visualSceneResults[scene.id || row.scene_id]} busy={busy === scene.id || busy === ('fix-' + scene.id)} onPatch={patchScene} onFix={doFixScene}/>;
            })}
          </div>
        )}
        {video && (
          <section style={sr.videoBox}>
            <div style={sr.cardTitle}>Rendered video</div>
            <video src={video.file} controls crossOrigin="use-credentials" style={{ width: '100%', borderRadius: 8, marginTop: 'calc(10px * var(--app-density-scale))' }}>
              {video.captions && <track kind="captions" src={video.captions} srcLang="en" label="English"/>}
            </video>
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
  const keyIdea = scene.learningPoint || scene.studentFacingGoal || scene.title || '';
  const title = scene.sceneTitle || scene.title || `Scene ${index + 1}`;
  const visualType = scene.visualType || scene.visualTemplate || 'missing';
  const visualData = scene.visualElements || scene.visualData || {};
  const grounding = scene.visualGrounding || {};
  const selectedReason = grounding.selectedVisualReason || scene.visualRationale || '';
  const nodes = visualNodeLabels(visualData);
  const edges = visualEdgeLabels(visualData);
  const operations = visualOperationLabels(visualData);
  const code = scene.code || (scene.codeSnippet ? { content: scene.codeSnippet } : null);
  const hasVisualPreview = visualType && !['none', 'no_visual'].includes(String(visualType).toLowerCase()) && (nodes.length || edges.length || operations.length || (code && code.content));
  const evidence = safeArray(scene.sourceEvidence);
  const sourceVisualIds = safeArray(scene.sourceVisualIds || (scene.visualPlan && scene.visualPlan.sourceVisualUsed ? [scene.visualPlan.sourceVisualUsed] : []));
  const repairHistory = safeArray(scene.repairHistory);
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
          <button className="btn btn-ghost" style={{ fontSize: 'calc(11px * var(--app-font-scale))' }} disabled={busy} onClick={() => onFix(scene.id, 'fix_auto')}>
            <Icon.Sparkle size={10}/> Fix visual
          </button>
        )}
        {onFix && (
          <button className="btn btn-ghost" style={{ fontSize: 'calc(11px * var(--app-font-scale))' }} disabled={busy} onClick={() => onFix(scene.id, 'regenerate_visual')} title="Replace this visual with a better one inferred from the scene content">
            <Icon.Sparkle size={10}/> Replace visual
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
      {hasVisualPreview && typeof TopicVisual === 'function' && <TopicVisual template={visualType} data={visualData} code={code} compact />}
      {code && code.content && (
        <pre style={sr.code}>{code.content}</pre>
      )}
      <p style={sr.narration}>{scene.narration}</p>
      {split.content.length > 0 && <div style={sr.sceneWarn}>Content warnings: {split.content.map(normalizeWarning).join(', ')}</div>}
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
            <div style={sr.metaLabel}>Source visuals used</div>
            <div style={sr.metaValue}>{sourceVisualIds.length ? sourceVisualIds.slice(0, 6).join(', ') : 'No source visual attached.'}</div>
            <div style={sr.metaLabel}>Auto-repair history</div>
            <div style={sr.metaValue}>{repairHistory.length ? repairHistory.map(item => cleanValue(item.action || item.type || item, '')).filter(Boolean).join(', ') : 'No automatic repair recorded.'}</div>
            <div style={sr.metaLabel}>AI simplification</div>
            {enrichment.used ? (
              <div style={sr.evidenceItem}>
                <div style={sr.evidenceHeader}>{cleanValue(enrichment.type, 'Enrichment')}</div>
                <div style={sr.metaValue}>{truncate(enrichment.content, 240)}</div>
              </div>
            ) : <div style={sr.metaValue}>No enrichment used for this scene.</div>}
            {scene.qualityWarnings && scene.qualityWarnings.length > 0 && (
              <>
                <div style={sr.metaLabel}>Quality warnings</div>
                <div style={sr.metaValue}>{split.content.length ? split.content.map(normalizeWarning).join(', ') : 'No content warnings.'}</div>
                <div style={sr.metaLabel}>Visual warnings</div>
                <div style={sr.metaValue}>{split.visual.length ? split.visual.map(normalizeWarning).join(', ') : 'No visual warnings.'}</div>
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
    <button className="btn btn-accent" onClick={() => onNav && onNav('materials')} style={{ marginTop: 'calc(12px * var(--app-density-scale))' }}>Open materials</button>
  </div>
);

const sr = {
  loading: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-2)' },
  page: { padding: 'calc(28px * var(--app-density-scale))', maxWidth: 1380, margin: '0 auto' },
  hero: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 'calc(20px * var(--app-density-scale))', marginBottom: 'calc(18px * var(--app-density-scale))' },
  eyebrow: { fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--accent)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 'calc(8px * var(--app-density-scale))' },
  title: { fontFamily: 'var(--font-display)', fontSize: 'calc(42px * var(--app-font-scale))', fontWeight: 300, margin: 0 },
  sub: { fontSize: 'calc(13.5px * var(--app-font-scale))', color: 'var(--fg-2)', maxWidth: 650, lineHeight: 1.6 },
  statusBox: { display: 'flex', alignItems: 'center', gap: 'calc(10px * var(--app-density-scale))', color: 'var(--fg-2)', fontSize: 'calc(12px * var(--app-font-scale))' },
  notice: { padding: 'calc(12px * var(--app-density-scale))', border: '1px solid var(--line)', background: 'var(--bg-1)', borderRadius: 8, color: 'var(--fg-2)', marginBottom: 'calc(12px * var(--app-density-scale))' },
  warn: { display: 'flex', gap: 'calc(8px * var(--app-density-scale))', alignItems: 'center', padding: 'calc(12px * var(--app-density-scale))', border: '1px solid var(--warn)', color: 'var(--warn)', borderRadius: 8, marginBottom: 'calc(12px * var(--app-density-scale))' },
  summary: { border: '1px solid var(--line)', background: 'var(--bg-1)', borderRadius: 8, padding: 'calc(16px * var(--app-density-scale))', marginBottom: 'calc(16px * var(--app-density-scale))' },
  summaryHead: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'calc(14px * var(--app-density-scale))', marginBottom: 'calc(14px * var(--app-density-scale))' },
  summaryTitleRow: { display: 'flex', alignItems: 'flex-start', gap: 'calc(10px * var(--app-density-scale))', minWidth: 0 },
  summaryEyebrow: { fontSize: 'calc(10.5px * var(--app-font-scale))', color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 'calc(4px * var(--app-density-scale))' },
  summaryTitle: { margin: 0, fontSize: 'calc(20px * var(--app-font-scale))', fontWeight: 500, color: 'var(--fg-0)', overflowWrap: 'anywhere', wordBreak: 'break-word' },
  statusPill: { flex: '0 0 auto', borderRadius: 999, padding: '5px 9px', fontSize: 'calc(11px * var(--app-font-scale))', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' },
  statusGood: { color: 'var(--ok)', background: 'color-mix(in srgb, var(--ok) 14%, transparent)', border: '1px solid var(--ok)' },
  statusNeedsReview: { color: 'var(--warn)', background: 'color-mix(in srgb, var(--warn) 12%, transparent)', border: '1px solid var(--warn)' },
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'calc(10px * var(--app-density-scale))', marginBottom: 'calc(14px * var(--app-density-scale))' },
  summaryItem: { minWidth: 0, padding: '9px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-2)' },
  summaryLabel: { fontSize: 'calc(10px * var(--app-font-scale))', color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 'calc(5px * var(--app-density-scale))' },
  summaryValue: { fontSize: 'calc(12.5px * var(--app-font-scale))', color: 'var(--fg-0)', lineHeight: 1.45, overflowWrap: 'anywhere', wordBreak: 'break-word' },
  conceptsRow: { display: 'flex', alignItems: 'flex-start', gap: 'calc(12px * var(--app-density-scale))', borderTop: '1px solid var(--line)', paddingTop: 'calc(12px * var(--app-density-scale))' },
  concepts: { display: 'flex', flexWrap: 'wrap', gap: 'calc(6px * var(--app-density-scale))', flex: 1 },
  conceptChip: { fontSize: 'calc(11.5px * var(--app-font-scale))', color: 'var(--fg-1)', border: '1px solid var(--line)', background: 'var(--bg-0)', borderRadius: 999, padding: '5px 8px', maxWidth: '100%', overflowWrap: 'anywhere', wordBreak: 'break-word' },
  muted: { fontSize: 'calc(12px * var(--app-font-scale))', color: 'var(--fg-3)' },
  enrichmentNote: { display: 'flex', alignItems: 'center', gap: 'calc(8px * var(--app-density-scale))', marginTop: 'calc(12px * var(--app-density-scale))', fontSize: 'calc(12.5px * var(--app-font-scale))', color: 'var(--fg-2)', lineHeight: 1.5 },
  visualSummary: { marginTop: 'calc(12px * var(--app-density-scale))', padding: 'calc(10px * var(--app-density-scale))', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-2)' },
  visualCoverageRows: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'calc(10px * var(--app-density-scale))', color: 'var(--fg-2)', fontSize: 'calc(12px * var(--app-font-scale))', lineHeight: 1.45 },
  topicCoverage: { marginTop: 'calc(12px * var(--app-density-scale))', padding: 'calc(10px * var(--app-density-scale))', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-2)' },
  topicCoverageGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'calc(8px * var(--app-density-scale))' },
  topicCoverageItem: { minWidth: 0, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-0)', padding: '8px 9px' },
  topicCoverageName: { fontSize: 'calc(12.5px * var(--app-font-scale))', color: 'var(--fg-0)', fontWeight: 700, overflowWrap: 'anywhere', wordBreak: 'break-word', marginBottom: 'calc(3px * var(--app-density-scale))' },
  warnText: { color: 'var(--warn)', fontSize: 'calc(12px * var(--app-font-scale))', fontWeight: 700 },
  okText: { color: 'var(--ok)', fontSize: 'calc(12px * var(--app-font-scale))', fontWeight: 700 },
  summaryWarnings: { display: 'flex', alignItems: 'center', gap: 'calc(8px * var(--app-density-scale))', marginTop: 'calc(12px * var(--app-density-scale))', padding: 'calc(10px * var(--app-density-scale))', borderRadius: 8, border: '1px solid var(--warn)', color: 'var(--warn)', fontSize: 'calc(12px * var(--app-font-scale))', lineHeight: 1.45 },
  topicSceneStack: { display: 'flex', flexDirection: 'column', gap: 'calc(16px * var(--app-density-scale))' },
  topicSection: { borderTop: '1px solid var(--line)', paddingTop: 'calc(14px * var(--app-density-scale))' },
  topicSectionHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'calc(12px * var(--app-density-scale))', marginBottom: 'calc(10px * var(--app-density-scale))' },
  topicSectionTitle: { margin: 0, color: 'var(--fg-0)', fontSize: 'calc(19px * var(--app-font-scale))', fontWeight: 600, overflowWrap: 'anywhere', wordBreak: 'break-word' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'calc(14px * var(--app-density-scale))' },
  scene: { border: '1px solid var(--line)', background: 'var(--bg-1)', borderRadius: 8, padding: 'calc(16px * var(--app-density-scale))', display: 'flex', flexDirection: 'column', gap: 'calc(12px * var(--app-density-scale))' },
  sceneHead: { display: 'flex', alignItems: 'center', gap: 'calc(12px * var(--app-density-scale))' },
  sceneNo: { color: 'var(--accent)', fontSize: 'calc(11px * var(--app-font-scale))' },
  sceneTitle: { fontSize: 'calc(17px * var(--app-font-scale))', margin: 0, color: 'var(--fg-0)', overflowWrap: 'anywhere', wordBreak: 'break-word' },
  sceneMeta: { fontSize: 'calc(11.5px * var(--app-font-scale))', color: 'var(--fg-3)', marginTop: 'calc(3px * var(--app-density-scale))' },
  keyIdea: { fontSize: 'calc(12.5px * var(--app-font-scale))', color: 'var(--fg-1)', lineHeight: 1.5, padding: 'calc(10px * var(--app-density-scale))', background: 'var(--bg-2)', borderRadius: 8, border: '1px solid var(--line)', overflowWrap: 'anywhere', wordBreak: 'break-word' },
  visualPanel: { border: '1px solid var(--line)', background: 'var(--bg-2)', borderRadius: 8, padding: 'calc(12px * var(--app-density-scale))', display: 'flex', flexDirection: 'column', gap: 'calc(9px * var(--app-density-scale))' },
  visualPanelHead: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'calc(12px * var(--app-density-scale))' },
  visualTypeName: { color: 'var(--fg-0)', fontSize: 'calc(13px * var(--app-font-scale))', fontWeight: 700, overflowWrap: 'anywhere', wordBreak: 'break-word' },
  visualPurpose: { color: 'var(--fg-1)', fontSize: 'calc(12.5px * var(--app-font-scale))', lineHeight: 1.5, overflowWrap: 'anywhere', wordBreak: 'break-word' },
  visualReason: { color: 'var(--fg-3)', fontSize: 'calc(11.5px * var(--app-font-scale))', lineHeight: 1.45, overflowWrap: 'anywhere', wordBreak: 'break-word' },
  visualFacts: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'calc(10px * var(--app-density-scale))' },
  visualElementGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'calc(8px * var(--app-density-scale))' },
  visualList: { minWidth: 0 },
  visualChips: { display: 'flex', flexWrap: 'wrap', gap: 'calc(5px * var(--app-density-scale))' },
  visualChip: { border: '1px solid var(--line)', background: 'var(--bg-0)', color: 'var(--fg-2)', borderRadius: 8, padding: '4px 7px', fontSize: 'calc(10.5px * var(--app-font-scale))', maxWidth: '100%', overflowWrap: 'anywhere', wordBreak: 'break-word', lineHeight: 1.25 },
  visualWarnings: { display: 'flex', alignItems: 'center', gap: 'calc(7px * var(--app-density-scale))', padding: 'calc(8px * var(--app-density-scale))', borderRadius: 8, border: '1px solid var(--warn)', color: 'var(--warn)', background: 'color-mix(in srgb, var(--warn) 8%, transparent)', fontSize: 'calc(11.5px * var(--app-font-scale))', lineHeight: 1.45 },
  metaToggle: { marginTop: 'calc(2px * var(--app-density-scale))' },
  metaBtn: { fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)', display: 'flex', alignItems: 'center', gap: 'calc(4px * var(--app-density-scale))', padding: 0 },
  metaContent: { padding: '8px 10px', background: 'var(--bg-2)', borderRadius: 6, marginTop: 'calc(6px * var(--app-density-scale))', border: '1px dashed var(--line)' },
  metaCols: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'calc(10px * var(--app-density-scale))' },
  metaLabel: { fontSize: 'calc(10px * var(--app-font-scale))', color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 'calc(2px * var(--app-density-scale))', marginTop: 'calc(6px * var(--app-density-scale))' },
  metaValue: { fontSize: 'calc(11.5px * var(--app-font-scale))', color: 'var(--fg-2)', lineHeight: 1.5, overflowWrap: 'anywhere', wordBreak: 'break-word' },
  evidenceItem: { border: '1px solid var(--line)', background: 'var(--bg-0)', borderRadius: 6, padding: '7px 8px', marginTop: 'calc(6px * var(--app-density-scale))' },
  evidenceHeader: { fontSize: 'calc(10.5px * var(--app-font-scale))', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'calc(3px * var(--app-density-scale))' },
  narration: { color: 'var(--fg-2)', fontSize: 'calc(12.5px * var(--app-font-scale))', lineHeight: 1.65, margin: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' },
  sceneWarn: { fontSize: 'calc(11.5px * var(--app-font-scale))', color: 'var(--warn)' },
  code: { maxHeight: 120, overflow: 'auto', background: '#0f172a', color: '#dbeafe', borderRadius: 8, padding: 'calc(12px * var(--app-density-scale))', fontFamily: 'var(--font-mono)', fontSize: 'calc(11.5px * var(--app-font-scale))' },
  edit: { display: 'flex', flexDirection: 'column', gap: 'calc(8px * var(--app-density-scale))' },
  label: { fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.1em' },
  textarea: { minHeight: 130, resize: 'vertical', border: '1px solid var(--line)', borderRadius: 8, padding: 'calc(12px * var(--app-density-scale))', background: 'var(--bg-0)', color: 'var(--fg-0)', font: 'inherit', lineHeight: 1.55 },
  videoBox: { marginTop: 'calc(18px * var(--app-density-scale))', border: '1px solid var(--line)', background: 'var(--bg-1)', borderRadius: 8, padding: 'calc(16px * var(--app-density-scale))' },
  cardTitle: { fontSize: 'calc(13px * var(--app-font-scale))', color: 'var(--fg-1)', fontWeight: 600 },
  unsupportedVisual: { border: '1px dashed var(--line)', background: 'var(--bg-2)', borderRadius: 8, padding: 'calc(12px * var(--app-density-scale))', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 'calc(4px * var(--app-density-scale))' },
  approvalPanel: { border: '1px solid var(--warn)', background: 'color-mix(in srgb, var(--warn) 5%, var(--bg-1))', borderRadius: 8, padding: 'calc(16px * var(--app-density-scale))', marginBottom: 'calc(16px * var(--app-density-scale))' },
  approvalHead: { display: 'flex', alignItems: 'flex-start', gap: 'calc(12px * var(--app-density-scale))', marginBottom: 'calc(12px * var(--app-density-scale))' },
  approvalTitle: { fontSize: 'calc(15px * var(--app-font-scale))', fontWeight: 600, color: 'var(--fg-0)' },
  approvalSub: { fontSize: 'calc(12.5px * var(--app-font-scale))', color: 'var(--fg-2)', marginTop: 'calc(2px * var(--app-density-scale))' },
  approvalSection: { marginTop: 'calc(10px * var(--app-density-scale))', padding: '10px 0 0', borderTop: '1px solid var(--line)' },
  approvalSectionTitle: { fontSize: 'calc(10.5px * var(--app-font-scale))', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: 'calc(8px * var(--app-density-scale))' },
  approvalItem: { display: 'flex', alignItems: 'center', gap: 'calc(10px * var(--app-density-scale))', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg-0)', marginBottom: 'calc(6px * var(--app-density-scale))' },
  approvalCode: { fontSize: 'calc(10px * var(--app-font-scale))', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em' },
  approvalLabel: { fontSize: 'calc(12.5px * var(--app-font-scale))', color: 'var(--fg-1)', lineHeight: 1.4, marginTop: 'calc(2px * var(--app-density-scale))' },
  approvalFix: { fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)', marginTop: 'calc(2px * var(--app-density-scale))' },
};

window.StoryboardReview = StoryboardReview;
