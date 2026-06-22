// Materials Library + Material Detail

const Materials = ({ onNav }) => {
  const Icon = window.Icon;
  const [view, setView] = React.useState('grid');
  const [items, setItems] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');
  const [uploadStatus, setUploadStatus] = React.useState('');
  const fileRef = React.useRef(null);

  const refresh = React.useCallback(() => {
    return window.NoesisAPI.materials.list()
      .then(d => setItems(d.materials || []))
      .catch(e => setErr(e.message || 'load failed'));
  }, []);
  React.useEffect(() => { refresh(); }, [refresh]);

  const colorFor = (type) => ({ pdf: 'var(--accent)', slides: 'var(--info)', video: 'var(--ok)', note: 'var(--warn)' }[type] || 'var(--accent)');
  const materials = items.map(m => ({
    id: m.id, t: m.display_title || m.title, rawTitle: m.title, type: m.type || 'pdf',
    course: m.status === 'ready' ? 'Library' : (m.status || ''),
    progress: m.progress || 0,
    updated: m.created_at ? new Date(m.created_at).toLocaleDateString() : '',
    color: colorFor(m.type),
  }));

  const onUpload = async (file) => {
    if (!file) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const allowed = ['pdf', 'docx', 'doc', 'txt', 'md', 'pptx'];
    if (!allowed.includes(ext)) {
      setErr('Unsupported file type. Upload PDF, DOCX, TXT, Markdown, or PPTX. Save legacy PPT files as PPTX first.');
      return;
    }
    setBusy(true); setErr(''); setUploadStatus(`Uploading ${file.name}...`);
    try {
      const r = await window.NoesisAPI.materials.upload(file);
      setUploadStatus(ext === 'pptx' ? 'Upload accepted. Extracting slides...' : 'Upload accepted. Indexing material...');
      if (r && r.job_id) {
        await window.NoesisAPI.pollJob(r.job_id, { intervalMs: 1500, onProgress: (j) => {
          const verb = ext === 'pptx' ? 'Extracting slides' : 'Indexing material';
          setUploadStatus(`${verb} ${j.progress || 0}%...`);
          refresh();
        } });
      }
      await refresh();
      setUploadStatus('Material ready.');
    } catch (e) {
      setErr(e.message || 'Upload failed');
      setUploadStatus('');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const typeIcon = { pdf: 'File', slides: 'Layers', video: 'Play', note: 'PenNib', pset: 'Code' };

  return (
    <div>
      <window.Topbar title="Materials" crumbs={['Library']}
        right={<>
          <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.txt,.md,.pptx" style={{ display: 'none' }}
                 onChange={(e) => onUpload(e.target.files && e.target.files[0])}/>
          <button className="btn btn-accent" disabled={busy} onClick={() => fileRef.current && fileRef.current.click()}>
            <Icon.Upload size={12}/> {busy ? 'Uploading...' : 'Upload'}
          </button>
        </>}
      />
      <div style={ms.page}>
        <div style={ms.header}>
          <div>
            <div style={ms.eyebrow}>Library · {materials.length} materials</div>
            <h1 style={ms.title}>What are we learning?</h1>
            {err && <div style={{ fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--err)', marginTop: 'calc(4px * var(--app-density-scale))' }}>{err}</div>}
            {uploadStatus && <div style={{ fontSize: 'calc(11px * var(--app-font-scale))', color: uploadStatus.includes('ready') ? 'var(--ok)' : 'var(--fg-3)', marginTop: 'calc(4px * var(--app-density-scale))' }}>{uploadStatus}</div>}
          </div>
          <div style={{ display: 'flex', gap: 'calc(4px * var(--app-density-scale))', padding: 'calc(2px * var(--app-density-scale))', background: 'var(--bg-2)', borderRadius: 'var(--r-md)', border: '1px solid var(--line)' }}>
            {['grid', 'list'].map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: '6px 12px', fontSize: 'calc(11.5px * var(--app-font-scale))', borderRadius: 6,
                background: view === v ? 'var(--bg-0)' : 'transparent',
                color: view === v ? 'var(--fg-0)' : 'var(--fg-2)',
                textTransform: 'capitalize',
              }}>{v}</button>
            ))}
          </div>
        </div>

        <div style={ms.uploadZone}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'calc(14px * var(--app-density-scale))' }}>
            <div style={{ width: 40, height: 40, borderRadius: 'var(--r-md)', background: 'var(--accent-glow)', border: '1px dashed var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon.Upload size={16} style={{ color: 'var(--accent)' }}/>
            </div>
            <div>
              <div style={{ fontSize: 'calc(13.5px * var(--app-font-scale))', color: 'var(--fg-0)', fontWeight: 500 }}>Drop a PDF, DOCX, TXT, Markdown, or PPTX file</div>
              <div style={{ fontSize: 'calc(12px * var(--app-font-scale))', color: 'var(--fg-2)', marginTop: 'calc(2px * var(--app-density-scale))' }}>Noesis extracts documents and PowerPoint slides for notes, flashcards, quizzes, and tutoring. Save legacy PPT decks as PPTX first.</div>
            </div>
          </div>
          <button className="btn btn-ghost" onClick={() => fileRef.current && fileRef.current.click()} disabled={busy}>{busy ? 'Working...' : 'Choose file'}</button>
        </div>

        <div style={view === 'grid' ? ms.grid : ms.list}>
          {materials.map(m => {
            const Ti = Icon[typeIcon[m.type]];
            return (
              <button key={m.id} onClick={() => { sessionStorage.setItem('noesis.materialId', String(m.id)); onNav('material'); }} className="card card-hover" style={view === 'grid' ? ms.card : ms.rowCard}>
                {view === 'grid' && (
                  <div style={{ height: 120, background: `linear-gradient(135deg, ${m.color}22, transparent 70%), var(--bg-2)`, borderRadius: 'var(--r-md)', marginBottom: 'calc(14px * var(--app-density-scale))', position: 'relative', overflow: 'hidden', border: '1px solid var(--line-soft)' }}>
                    <Ti size={36} style={{ position: 'absolute', top: 16, left: 16, color: m.color, opacity: 0.6 }}/>
                    <div style={{ position: 'absolute', bottom: 10, right: 10, fontSize: 'calc(10px * var(--app-font-scale))', color: 'var(--fg-3)' }} className="mono">{m.type.toUpperCase()}</div>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: view === 'grid' ? 'flex-start' : 'center', gap: 'calc(12px * var(--app-density-scale))', flex: 1 }}>
                  {view === 'list' && <Ti size={18} style={{ color: m.color }}/>}
                  <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 'calc(16px * var(--app-font-scale))', color: 'var(--fg-0)', marginBottom: 'calc(4px * var(--app-density-scale))', fontWeight: 400, letterSpacing: '-0.005em' }}>{m.t}</div>
                    <div style={{ fontSize: 'calc(11.5px * var(--app-font-scale))', color: 'var(--fg-3)', display: 'flex', gap: 'calc(10px * var(--app-density-scale))', flexWrap: 'wrap' }}>
                      <span>{m.course}</span><span>|</span><span>{m.progress >= 100 ? 'Indexed' : `${m.progress}% indexed`}</span><span>|</span><span>{m.updated}</span>
                    </div>
                  </div>
                  {view === 'list' && (
                    <div style={{ width: 80 }}>
                      <div style={{ height: 3, background: 'var(--line)', borderRadius: 2 }}>
                        <div style={{ height: '100%', width: m.progress + '%', background: m.color, borderRadius: 2 }}/>
                      </div>
                      <div className="mono" style={{ fontSize: 'calc(10px * var(--app-font-scale))', color: 'var(--fg-3)', marginTop: 'calc(3px * var(--app-density-scale))', textAlign: 'right' }}>{m.progress}%</div>
                    </div>
                  )}
                </div>
                {view === 'grid' && (
                  <div style={{ marginTop: 'calc(10px * var(--app-density-scale))' }}>
                    <div style={{ height: 3, background: 'var(--line)', borderRadius: 2 }}>
                      <div style={{ height: '100%', width: m.progress + '%', background: m.color, borderRadius: 2 }}/>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'calc(6px * var(--app-density-scale))', fontSize: 'calc(10.5px * var(--app-font-scale))', color: 'var(--fg-3)' }} className="mono">
                      <span>{m.progress >= 100 ? 'Ready' : `${m.progress}% indexed`}</span>
                      <span>{m.type.toUpperCase()}</span>
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const ms = {
  page: { padding: 'calc(28px * var(--app-density-scale))', maxWidth: 1400, margin: '0 auto' },
  header: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 'calc(28px * var(--app-density-scale))' },
  eyebrow: { fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'calc(10px * var(--app-density-scale))' },
  title: { fontFamily: 'var(--font-display)', fontSize: 'calc(40px * var(--app-font-scale))', fontWeight: 300, letterSpacing: '-0.02em', margin: 0 },
  uploadZone: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 20px', borderRadius: 'var(--r-lg)',
    border: '1px dashed var(--line-strong)', background: 'var(--bg-1)',
    marginBottom: 'calc(28px * var(--app-density-scale))',
  },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'calc(14px * var(--app-density-scale))' },
  list: { display: 'flex', flexDirection: 'column', gap: 'calc(6px * var(--app-density-scale))' },
  card: { padding: 'calc(16px * var(--app-density-scale))', display: 'flex', flexDirection: 'column', textAlign: 'left' },
  rowCard: { padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 'calc(12px * var(--app-density-scale))' },
};

function normalizeGoalClient(goal) {
  const raw = String(goal || '').toLowerCase();
  if (['exams', 'understand', 'retain', 'practice'].includes(raw)) return raw;
  if (/understand|deep|concept/.test(raw)) return 'understand';
  if (/retain|spaced|recall|remember/.test(raw)) return 'retain';
  if (/practice|problem|drill/.test(raw)) return 'practice';
  return 'exams';
}

function materialGoalRecommendation(goal, material, focusLabel) {
  const goalId = normalizeGoalClient(goal);
  const title = material && material.title ? material.title : 'this material';
  const focus = focusLabel || title;
  const shared = {
    exams: {
      goalLabel: 'Ace my exams',
      icon: 'Target',
      title: 'Generate an exam-style quiz',
      description: `Turn ${focus} into a checkpoint so you can see what is ready and what is weak.`,
      cta: 'Generate quiz',
      action: 'generate_quiz',
    },
    understand: {
      goalLabel: 'Understand deeply',
      icon: 'Brain',
      title: 'Study this with the tutor',
      description: `Use ${focus} for a guided explanation, examples, and follow-up questions.`,
      cta: 'Study with tutor',
      action: 'start_tutor',
    },
    retain: {
      goalLabel: 'Retain long-term',
      icon: 'Bookmark',
      title: 'Generate flashcards',
      description: `Turn ${focus} into recall cards so spaced repetition has something useful to schedule.`,
      cta: 'Generate flashcards',
      action: 'generate_flashcards',
    },
    practice: {
      goalLabel: 'Practice problems',
      icon: 'Bolt',
      title: 'Generate a practice quiz',
      description: `Use ${focus} to expose mistakes quickly, then review them while they are fresh.`,
      cta: 'Generate practice quiz',
      action: 'generate_quiz',
    },
  };
  return shared[goalId] || shared.exams;
}

// Material Detail
const MaterialDetail = ({ onNav }) => {
  const Icon = window.Icon;
  const [material, setMaterial] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [genStatus, setGenStatus] = React.useState('');
  const [activeAction, setActiveAction] = React.useState('');
  const [quizRetry, setQuizRetry] = React.useState(null);
  const [video, setVideo] = React.useState(null);
  const [learningMap, setLearningMap] = React.useState(null);
  const [mapStatus, setMapStatus] = React.useState('ready');
  const [prefs, setPrefs] = React.useState(null);
  const mapPollingRef = React.useRef('');
  const id = parseInt(sessionStorage.getItem('noesis.materialId') || '0', 10);

  React.useEffect(() => {
    if (!id) { onNav && onNav('materials'); return; }
    window.NoesisAPI.materials.get(id).then(m => setMaterial(m)).catch(() => {});
  }, [id]);

  React.useEffect(() => {
    return () => {
      if (video && video.file && video.file.startsWith('blob:')) URL.revokeObjectURL(video.file);
      if (video && video.captions && video.captions.startsWith('blob:')) URL.revokeObjectURL(video.captions);
    };
  }, [video]);

  React.useEffect(() => {
    if (!video || !video.id || video.status !== 'ready' || video.captions) return;
    let active = true;
    window.NoesisAPI.videos.captionsBlobUrl(video.id)
      .then(captions => {
        if (active) setVideo(current => current && current.id === video.id ? { ...current, captions } : current);
        else URL.revokeObjectURL(captions);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [video]);

  const loadLearningMap = React.useCallback(async (watchJob = true) => {
    if (!id) return null;
    try {
      const data = await window.NoesisAPI.study.learningMap(id);
      setLearningMap(data.learning_map || null);
      setMapStatus(data.generation_status || 'ready');
      const jobId = watchJob && data.generation_job_id;
      if (jobId && mapPollingRef.current !== jobId) {
        mapPollingRef.current = jobId;
        window.NoesisAPI.pollJob(jobId, {
          intervalMs: 1200,
          onProgress: () => setMapStatus('refining'),
        }).then(() => {
          mapPollingRef.current = '';
          return loadLearningMap(false);
        }).catch(() => {
          mapPollingRef.current = '';
          setMapStatus('ready');
        });
      }
      return data.learning_map || null;
    } catch (_) {
      setLearningMap(null);
      setMapStatus('ready');
      return null;
    }
  }, [id]);

  React.useEffect(() => { loadLearningMap(true); }, [loadLearningMap]);

  React.useEffect(() => {
    window.NoesisAPI.user.getPrefs().then(p => setPrefs(p || {})).catch(() => setPrefs({}));
  }, []);

  const currentScopePayload = React.useCallback(() => ({ sourceScope: 'material' }), []);

  const sourceScopeLabel = 'Entire lecture';

  const generate = async (kind, options = {}) => {
    if (!id || busy) return false;
    const labels = { notes: 'notes', flashcards: 'flashcards', quiz: 'quiz' };
    setActiveAction(kind);
    if (kind === 'quiz') setQuizRetry(null);
    setBusy(true); setGenStatus(`Generating ${labels[kind] || kind} from ${sourceScopeLabel.toLowerCase()}...`);
    try {
      const scopePayload = currentScopePayload();
      const topicPayload = options.topic ? { topic: options.topic } : {};
      if (kind === 'notes') await window.NoesisAPI.notes.generate({ material_id: id, ...scopePayload, ...topicPayload });
      let flashcardResult = null;
      let quizResult = null;
      if (kind === 'flashcards') flashcardResult = await window.NoesisAPI.flashcards.generate({ material_id: id, count: 8, regenerate: !!options.regenerate, ...scopePayload, ...topicPayload });
      if (kind === 'quiz') {
        const quizPayload = { material_id: id, count: 8, min_count: 6, difficulty: 'medium', ...scopePayload, ...topicPayload };
        let r = await window.NoesisAPI.quizzes.generate(quizPayload);
        if (r && r.status === 'reindexing' && r.job_id) {
          setGenStatus('Repairing extracted text and rebuilding the study index...');
          await window.NoesisAPI.pollJob(r.job_id, {
            intervalMs: 1200,
            onProgress: job => setGenStatus(`Repairing study index... ${Math.max(0, Number(job.progress || 0))}%`),
          });
          setGenStatus('Generating concept-focused quiz...');
          r = await window.NoesisAPI.quizzes.generate(quizPayload);
        }
        if (!r || !r.quiz_id) throw new Error('Quiz generation did not complete after reindexing.');
        quizResult = r;
        setQuizRetry(null);
        sessionStorage.setItem('noesis.quizId', String(r.quiz_id));
      }
      if (kind === 'quiz' && quizResult && quizResult.partial) {
        setGenStatus(`Quiz created with ${quizResult.count || 0} of ${quizResult.requested_count || 8} grounded questions.`);
      } else if (kind === 'flashcards' && flashcardResult) {
        if (flashcardResult.reused) setGenStatus('Using existing flashcards for this material.');
        else if (flashcardResult.fallback) setGenStatus(flashcardResult.message || 'Created fallback flashcards from source material.');
        else setGenStatus(`${flashcardResult.created || 0} flashcards generated successfully.`);
      } else {
        setGenStatus(`${labels[kind] || kind} generated successfully.`);
      }
      return true;
    } catch (e) {
      const retryable = kind === 'quiz' && !!(e && e.data && e.data.details && e.data.details.retryable);
      if (retryable) setQuizRetry({ options: { ...options }, message: e.message || 'No grounded quiz could be created.' });
      const qualityMessage = retryable
        ? `${e.message || 'No grounded quiz could be created from this material.'}`
        : e && e.code === 'insufficient_quiz_content'
          ? (e.message || 'There is not enough clean concept content for a 6-question quiz.')
          : null;
      setGenStatus(qualityMessage || ('Failed: ' + (e.message || 'error')));
      return false;
    } finally {
      setBusy(false);
      setActiveAction('');
    }
  };

  const regenerateMindMap = async () => {
    if (!id || busy) return;
    setBusy(true);
    setActiveAction('mindmap');
    setMapStatus('refining');
    setGenStatus('Refining the mind map from this material...');
    try {
      const response = await window.NoesisAPI.study.regenerateLearningMap(id);
      if (!response || !response.job_id) throw new Error('Mind-map generation did not start.');
      mapPollingRef.current = response.job_id;
      await window.NoesisAPI.pollJob(response.job_id, {
        intervalMs: 1200,
        onProgress: job => setGenStatus(`Refining mind map... ${Math.max(0, Number(job.progress || 0))}%`),
      });
      mapPollingRef.current = '';
      const updated = await loadLearningMap(false);
      const mode = updated && updated.generation && updated.generation.mode;
      setGenStatus(mode === 'ai' ? 'Mind map refined from the uploaded material.' : 'Source-built mind map ready. AI refinement can be retried later.');
    } catch (error) {
      mapPollingRef.current = '';
      setMapStatus('ready');
      setGenStatus('Mind-map refresh failed: ' + (error.message || 'error'));
    } finally {
      setBusy(false);
      setActiveAction('');
    }
  };

  const studyMapNodeWithTutor = node => {
    sessionStorage.setItem('noesis.tutorConcept', node && node.label || (material && material.title) || '');
    sessionStorage.setItem('noesis.tutorMaterialId', String(id));
    onNav('tutor');
  };

  const quizMapNode = async node => {
    const ok = await generate('quiz', { topic: node && node.label });
    if (ok) onNav('quiz');
  };

  const flashcardMapNode = async node => {
    const ok = await generate('flashcards', { regenerate: true, topic: node && node.label });
    if (ok) onNav('flashcards');
  };

  const displayTitle = (material && (material.display_title || material.title)) || 'Material';
  const goalRecommendation = materialGoalRecommendation(prefs && prefs.goal, material && { ...material, title: displayTitle }, sourceScopeLabel.toLowerCase());
  const runGoalRecommendation = async () => {
    if (!id || busy) return;
    if (goalRecommendation.action === 'start_tutor') {
      sessionStorage.setItem('noesis.tutorConcept', displayTitle);
      sessionStorage.setItem('noesis.tutorMaterialId', String(id));
      onNav('tutor');
      return;
    }
    if (goalRecommendation.action === 'generate_flashcards') {
      const ok = await generate('flashcards', { regenerate: true });
      if (ok) onNav('flashcards');
      return;
    }
    if (goalRecommendation.action === 'generate_quiz') {
      const ok = await generate('quiz');
      if (ok) onNav('quiz');
    }
  };

  const generateVideo = async () => {
    if (!id || !material) return;
    setActiveAction('video');
    setBusy(true); setGenStatus('Generating storyboard for review...');
    try {
      const concept = displayTitle;
      const r = await window.NoesisAPI.videos.createStoryboard({ material_id: id, concept, ...currentScopePayload() });
      const storyboardId = r.storyboard_id || (r.storyboard && r.storyboard.id);
      if (!storyboardId) throw new Error('storyboard_not_created');
      sessionStorage.setItem('noesis.storyboardId', String(storyboardId));
      setGenStatus('Storyboard ready. Review scenes before rendering.');
      onNav && onNav('storyboard');
    } catch (e) { setGenStatus('Video failed: ' + (e.message || 'error')); }
    finally { setBusy(false); setActiveAction(''); }
  };

  const deleteMaterial = async () => {
    if (!id || !window.confirm('Delete this material and its generated study data?')) return;
    setActiveAction('delete');
    setBusy(true); setGenStatus('Deleting material...');
    try {
      await window.NoesisAPI.materials.remove(id);
      sessionStorage.removeItem('noesis.materialId');
      onNav('materials');
    } catch (e) {
      setGenStatus('Delete failed: ' + (e.message || 'error'));
    } finally {
      setBusy(false);
      setActiveAction('');
    }
  };

  const ready = material && material.status === 'ready';
  const progress = Math.max(0, Math.min(100, Number(material && material.progress || 0)));
  const statusText = ready ? 'Indexed and ready for grounded generation.' : (material ? `Indexing status: ${material.status || 'pending'}` : 'Loading material...');

  return (
    <div>
      <window.Topbar
        title={displayTitle}
        crumbs={['Library', displayTitle]}
        right={<>
          <button className="btn btn-ghost" disabled={busy} onClick={deleteMaterial} style={{ color: 'var(--err)' }}>{activeAction === 'delete' ? 'Deleting...' : 'Delete'}</button>
          <button className="btn btn-accent" disabled={!ready} onClick={() => { sessionStorage.setItem('noesis.tutorConcept', displayTitle); sessionStorage.setItem('noesis.tutorMaterialId', String(id)); onNav('tutor'); }}><Icon.Sparkle size={12}/> Study with tutor</button>
        </>}
      />
      <div className="material-detail-layout" style={mds.layout}>
        <main className="material-detail-reader" style={mds.reader}>
          <section style={mds.headlinePanel}>
            <div style={mds.eyebrow}>Lecture headline</div>
            <h1 style={mds.title}>{displayTitle}</h1>
            <div style={mds.statusRow}>
              <span style={{ ...mds.statusDot, background: ready ? 'var(--ok)' : 'var(--warn)' }}/>
              <span>{statusText}</span>
            </div>
            <div style={mds.progressTrack}><div style={{ ...mds.progressFill, width: `${progress}%` }}/></div>
            <p style={mds.hiddenSourceNote}>The extracted source stays indexed privately for notes, tutor sessions, quizzes, cards, video storyboards, and the mind map.</p>
          </section>

          <section style={mds.goalRec}>
            <div style={{ display: 'flex', gap: 'calc(10px * var(--app-density-scale))', alignItems: 'flex-start' }}>
              {(() => {
                const C = Icon[goalRecommendation.icon] || Icon.Sparkle;
                return <C size={16} style={{ color: 'var(--accent)', marginTop: 2 }}/>;
              })()}
              <div style={{ minWidth: 0 }}>
                <div style={mds.goalRecEyebrow}>Recommended for {goalRecommendation.goalLabel}</div>
                <div style={mds.goalRecTitle}>{goalRecommendation.title}</div>
                <div style={mds.goalRecText}>{goalRecommendation.description}</div>
              </div>
            </div>
            <button className="btn btn-accent" disabled={busy || !ready} onClick={runGoalRecommendation} style={{ width: '100%', justifyContent: 'center', marginTop: 'calc(12px * var(--app-density-scale))' }}>
              {activeAction ? 'Working...' : goalRecommendation.cta} <Icon.ArrowRight size={12}/>
            </button>
          </section>

          <section style={mds.toolPanel}>
            <div style={mds.railHead}>Generate from indexed lecture</div>
            <button style={mds.gen} disabled={busy || !ready} onClick={() => generate('notes')}>
              <Icon.PenNib size={13} style={{ color: 'var(--accent)' }}/>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={mds.genTitle}>{activeAction === 'notes' ? 'Generating notes...' : 'Summary notes'}</div>
                <div style={mds.genSub}>Uses the full hidden lecture source</div>
              </div>
            </button>
            <button style={mds.gen} disabled={busy || !ready} onClick={async () => { const ok = await generate('flashcards', { regenerate: true }); if (ok) onNav('flashcards'); }}>
              <Icon.Cards size={13} style={{ color: 'var(--accent)' }}/>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={mds.genTitle}>{activeAction === 'flashcards' ? 'Generating flashcards...' : 'Flashcards'}</div>
                <div style={mds.genSub}>Create recall cards from the full lecture</div>
              </div>
            </button>
            <button style={mds.gen} disabled={busy || !ready} onClick={async () => { const ok = await generate('quiz'); if (ok) onNav('quiz'); }}>
              <Icon.Target size={13} style={{ color: 'var(--accent)' }}/>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={mds.genTitle}>{activeAction === 'quiz' ? 'Generating quiz...' : 'Practice quiz'}</div>
                <div style={mds.genSub}>Six to eight grounded questions from the full lecture</div>
              </div>
            </button>
            <button style={mds.gen} disabled={busy || !ready} onClick={generateVideo}>
              <Icon.Play size={13} style={{ color: 'var(--accent)' }}/>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={mds.genTitle}>{activeAction === 'video' ? 'Creating storyboard...' : 'Tutor video storyboard'}</div>
                <div style={mds.genSub}>Storyboard from the full lecture</div>
              </div>
            </button>
            {genStatus && <div style={mds.genStatus}>{genStatus}</div>}
            {quizRetry && (
              <button className="btn btn-ghost" disabled={busy || !ready} onClick={async () => {
                const ok = await generate('quiz', quizRetry.options || {});
                if (ok) onNav('quiz');
              }} style={{ width: '100%', justifyContent: 'center' }}>
                <Icon.RotateCcw size={12}/> Retry quiz generation
              </button>
            )}
            {video && video.status === 'ready' && (
              <video src={video.file} controls crossOrigin="use-credentials" style={{ width: '100%', marginTop: 'calc(8px * var(--app-density-scale))', borderRadius: 'var(--r-sm)' }}>
                {video.captions && <track kind="captions" src={video.captions} srcLang="en" label="English"/>}
              </video>
            )}
          </section>

          <section style={mds.conceptPanel}>
            <div style={mds.railHead}>Indexed concepts</div>
            {material && material.concepts && material.concepts.length ? (
              material.concepts.map(c => (
                <div key={c.id || c.name} style={mds.concept}>
                  <span>{c.name}</span>
                  <span className="mono" style={{ fontSize: 'calc(10px * var(--app-font-scale))', color: 'var(--fg-3)' }}>{c.mastery_pct || 0}%</span>
                </div>
              ))
            ) : (
              <div style={mds.emptySmall}>Concepts appear after the lecture has enough indexed signal.</div>
            )}
          </section>
        </main>

        <aside className="material-detail-map-rail" style={mds.rail}>
          {window.MaterialMindMap && learningMap ? (
            <window.MaterialMindMap
              map={learningMap}
              generationStatus={mapStatus}
              busy={busy}
              onRegenerate={regenerateMindMap}
              onTutor={studyMapNodeWithTutor}
              onQuiz={quizMapNode}
              onFlashcards={flashcardMapNode}
            />
          ) : (
            <div style={mds.mapLoading}>
              <Icon.Tree size={22}/>
              Building a dynamic map from this material...
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

const mds = {
  layout: { display: 'grid', minHeight: 'calc(100vh - 57px)', alignItems: 'start' },
  reader: { padding: '32px clamp(22px, 3.2vw, 52px)', boxSizing: 'border-box', width: '100%', display: 'flex', flexDirection: 'column', gap: 'calc(16px * var(--app-density-scale))' },
  headlinePanel: { padding: 'calc(24px * var(--app-density-scale))', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', background: 'var(--bg-1)' },
  eyebrow: { fontSize: 'calc(10.5px * var(--app-font-scale))', color: 'var(--accent)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 'calc(10px * var(--app-density-scale))' },
  title: { fontFamily: 'var(--font-display)', fontSize: 'calc(42px * var(--app-font-scale))', fontWeight: 300, letterSpacing: '-0.02em', lineHeight: 1.08, margin: 0, color: 'var(--fg-0)' },
  statusRow: { display: 'flex', alignItems: 'center', gap: 8, color: 'var(--fg-2)', fontSize: 'calc(12.5px * var(--app-font-scale))', marginTop: 'calc(14px * var(--app-density-scale))' },
  statusDot: { width: 8, height: 8, borderRadius: 99, boxShadow: '0 0 12px currentColor' },
  progressTrack: { height: 5, borderRadius: 99, background: 'var(--bg-2)', overflow: 'hidden', marginTop: 'calc(14px * var(--app-density-scale))' },
  progressFill: { height: '100%', borderRadius: 99, background: 'linear-gradient(90deg, var(--accent), var(--ok))' },
  hiddenSourceNote: { color: 'var(--fg-3)', fontSize: 'calc(12px * var(--app-font-scale))', lineHeight: 1.55, margin: 'calc(14px * var(--app-density-scale)) 0 0' },
  rail: { borderLeft: '1px solid var(--line)', padding: 'calc(24px * var(--app-density-scale))', background: 'var(--bg-0)', boxSizing: 'border-box', minWidth: 0 },
  mapLoading: { minHeight: 420, border: '1px solid var(--line)', borderRadius: 'var(--r-xl)', display: 'grid', placeItems: 'center', alignContent: 'center', gap: 10, color: 'var(--fg-3)', background: 'var(--bg-1)', fontSize: 'calc(12px * var(--app-font-scale))' },
  railHead: { fontSize: 'calc(10.5px * var(--app-font-scale))', color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'calc(8px * var(--app-density-scale))' },
  goalRec: {
    display: 'flex',
    flexDirection: 'column',
    padding: 'calc(14px * var(--app-density-scale))',
    borderRadius: 'var(--r-md)',
    border: '1px solid var(--accent-soft)',
    background: 'linear-gradient(135deg, var(--accent-glow), var(--bg-1) 70%)',
  },
  goalRecEyebrow: { fontSize: 'calc(10px * var(--app-font-scale))', color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'calc(5px * var(--app-density-scale))' },
  goalRecTitle: { fontSize: 'calc(13.5px * var(--app-font-scale))', color: 'var(--fg-0)', fontWeight: 600, lineHeight: 1.25 },
  goalRecText: { fontSize: 'calc(11.5px * var(--app-font-scale))', color: 'var(--fg-2)', lineHeight: 1.45, marginTop: 'calc(5px * var(--app-density-scale))' },
  toolPanel: { display: 'flex', flexDirection: 'column', gap: 'calc(8px * var(--app-density-scale))', padding: 'calc(16px * var(--app-density-scale))', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', background: 'var(--bg-1)' },
  conceptPanel: { display: 'flex', flexDirection: 'column', gap: 'calc(4px * var(--app-density-scale))', padding: 'calc(16px * var(--app-density-scale))', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', background: 'var(--bg-1)' },
  concept: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 10px', borderRadius: 'var(--r-sm)',
    fontSize: 'calc(12px * var(--app-font-scale))', color: 'var(--fg-1)', textAlign: 'left',
    transition: 'background 140ms var(--ease-out)',
  },
  gen: {
    display: 'flex', gap: 'calc(10px * var(--app-density-scale))', alignItems: 'center',
    padding: '10px 12px', borderRadius: 'var(--r-sm)',
    border: '1px solid var(--line)', background: 'var(--bg-1)',
    transition: 'all 140ms var(--ease-out)',
  },
  genTitle: { fontSize: 'calc(12.5px * var(--app-font-scale))', color: 'var(--fg-0)' },
  genSub: { fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)' },
  genStatus: { fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)', padding: '4px 4px 0' },
  emptySmall: { fontSize: 'calc(12px * var(--app-font-scale))', color: 'var(--fg-3)', padding: '4px 0', lineHeight: 1.5 },
  highlight: { display: 'flex', gap: 'calc(8px * var(--app-density-scale))', padding: '6px 0' },
};

window.Materials = Materials;
window.MaterialDetail = MaterialDetail;
