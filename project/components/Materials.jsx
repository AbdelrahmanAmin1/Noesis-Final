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
    id: m.id, t: m.title, type: m.type || 'pdf',
    course: m.status === 'ready' ? 'Library' : (m.status || ''),
    chapters: m.chapters || 0, progress: m.progress || 0,
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
            <Icon.Upload size={12}/> {busy ? 'Uploading…' : 'Upload'}
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
          <button className="btn btn-ghost" onClick={() => fileRef.current && fileRef.current.click()} disabled={busy}>{busy ? 'Working…' : 'Choose file'}</button>
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
                    <div style={{ fontSize: 'calc(11.5px * var(--app-font-scale))', color: 'var(--fg-3)', display: 'flex', gap: 'calc(10px * var(--app-density-scale))' }}>
                      <span>{m.course}</span><span>·</span><span>{m.chapters} ch</span><span>·</span><span>{m.updated}</span>
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
                      <span>{m.progress}% mastered</span>
                      <span>{Math.round(m.chapters * m.progress / 100)}/{m.chapters}</span>
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

// Material Detail
const MaterialDetail = ({ onNav }) => {
  const Icon = window.Icon;
  const [active, setActive] = React.useState(0);
  const [material, setMaterial] = React.useState(null);
  const [chunks, setChunks] = React.useState([]);
  const [chapters, setChapters] = React.useState([]);
  const [chapterIds, setChapterIds] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [genStatus, setGenStatus] = React.useState('');
  const [activeAction, setActiveAction] = React.useState('');
  const [video, setVideo] = React.useState(null);
  const [learningMap, setLearningMap] = React.useState(null);
  const [sourceScope, setSourceScope] = React.useState('material');
  const id = parseInt(sessionStorage.getItem('noesis.materialId') || '0', 10);

  React.useEffect(() => {
    if (!id) { onNav && onNav('materials'); return; }
    window.NoesisAPI.materials.get(id).then(m => {
      setMaterial(m);
      const titles = (m.chapters || []).map(c => c.title);
      setChapters(titles);
      setChapterIds((m.chapters || []).map(c => c.id));
    }).catch(() => {});
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

  React.useEffect(() => {
    if (!id) return;
    const chId = chapterIds[active];
    window.NoesisAPI.materials.chunks(id, chId).then(d => setChunks(d.chunks || [])).catch(() => setChunks([]));
  }, [id, active, chapterIds]);

  React.useEffect(() => {
    if (!id) return;
    window.NoesisAPI.study.learningMap(id)
      .then(d => setLearningMap(d.learning_map || null))
      .catch(() => setLearningMap(null));
  }, [id]);

  const currentScopePayload = React.useCallback(() => {
    const payload = { sourceScope };
    if (sourceScope === 'chapter' && chapterIds[active]) payload.chapter_id = chapterIds[active];
    if (sourceScope === 'chunk' && chunks[0] && chunks[0].id) payload.chunk_id = chunks[0].id;
    return payload;
  }, [sourceScope, chapterIds, active, chunks]);

  const sourceScopeLabel = sourceScope === 'chapter'
    ? 'Current chapter'
    : (sourceScope === 'chunk' ? 'Current section' : 'Entire material');

  const generate = async (kind, options = {}) => {
    if (!id || busy) return false;
    const labels = { notes: 'notes', flashcards: 'flashcards', quiz: 'quiz' };
    setActiveAction(kind);
    setBusy(true); setGenStatus(`Generating ${labels[kind] || kind} from ${sourceScopeLabel.toLowerCase()}...`);
    try {
      const scopePayload = currentScopePayload();
      if (kind === 'notes') await window.NoesisAPI.notes.generate({ material_id: id, ...scopePayload });
      let flashcardResult = null;
      let quizResult = null;
      if (kind === 'flashcards') flashcardResult = await window.NoesisAPI.flashcards.generate({ material_id: id, count: 8, regenerate: !!options.regenerate, ...scopePayload });
      if (kind === 'quiz') {
        const quizPayload = { material_id: id, count: 6, difficulty: 'medium', ...scopePayload };
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
        sessionStorage.setItem('noesis.quizId', String(r.quiz_id));
      }
      if (kind === 'quiz' && quizResult && quizResult.partial) {
        setGenStatus(`Quiz created with ${quizResult.count || 0} of ${quizResult.requested_count || 6} grounded questions.`);
      } else if (kind === 'flashcards' && flashcardResult) {
        if (flashcardResult.reused) setGenStatus('Using existing flashcards for this material.');
        else if (flashcardResult.fallback) setGenStatus(flashcardResult.message || 'Created fallback flashcards from source material.');
        else setGenStatus(`${flashcardResult.created || 0} flashcards generated successfully.`);
      } else {
        setGenStatus(`${labels[kind] || kind} generated successfully.`);
      }
      return true;
    } catch (e) {
      const qualityMessage = e && e.code === 'quiz_quality_failed'
        ? 'The models could not produce a high-quality grounded quiz. Please retry.'
        : e && e.code === 'insufficient_quiz_content'
          ? 'There is not enough clean concept content for a useful quiz.'
          : null;
      setGenStatus(qualityMessage || ('Failed: ' + (e.message || 'error')));
      return false;
    } finally {
      setBusy(false);
      setActiveAction('');
    }
  };

  const generateVideo = async () => {
    if (!id || !material) return;
    setActiveAction('video');
    setBusy(true); setGenStatus('Generating storyboard for review...');
    try {
      const concept = sourceScope === 'material' ? (material && material.title) : (chapters[active] || null);
      const r = await window.NoesisAPI.videos.createStoryboard({ material_id: id, concept, ...currentScopePayload() });
      const storyboardId = r.storyboard_id || (r.storyboard && r.storyboard.id);
      if (!storyboardId) throw new Error('storyboard_not_created');
      sessionStorage.setItem('noesis.storyboardId', String(storyboardId));
      setGenStatus('Storyboard ready. Review scenes before rendering.');
      onNav && onNav('storyboard');
    } catch (e) { setGenStatus('Video failed: ' + (e.message || 'error')); }
    finally { setBusy(false); setActiveAction(''); }
  };

  const articleText = chunks.length ? chunks.map(c => c.text).join('\n\n') : '';
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

  return (
    <div>
      <window.Topbar
        title={chapters[active] || (material && material.title) || 'Material'}
        crumbs={['Library', material ? material.title : '...']}
        right={<>
          <button className="btn btn-ghost" disabled={busy} onClick={deleteMaterial} style={{ color: 'var(--err)' }}>{activeAction === 'delete' ? 'Deleting...' : 'Delete'}</button>
          <button className="btn btn-accent" onClick={() => { sessionStorage.setItem('noesis.tutorConcept', chapters[active] || (material && material.title) || ''); sessionStorage.setItem('noesis.tutorMaterialId', String(id)); onNav('tutor'); }}><Icon.Sparkle size={12}/> Study with tutor</button>
        </>}
      />
      <div style={mds.layout}>
        {/* Chapter nav */}
        <aside style={mds.chapters}>
          <div style={{ padding: '18px 18px 12px' }}>
            <div style={{ fontSize: 'calc(10.5px * var(--app-font-scale))', color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Chapters</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(1px * var(--app-density-scale))', padding: '0 8px' }}>
            {chapters.map((c, i) => (
              <button key={i} onClick={() => setActive(i)} style={{
                display: 'flex', alignItems: 'center', gap: 'calc(10px * var(--app-density-scale))',
                padding: '8px 10px', borderRadius: 'var(--r-sm)',
                background: active === i ? 'var(--bg-2)' : 'transparent',
                color: active === i ? 'var(--fg-0)' : 'var(--fg-2)',
                fontSize: 'calc(12.5px * var(--app-font-scale))', textAlign: 'left',
              }}>
                <span className="mono" style={{ fontSize: 'calc(9.5px * var(--app-font-scale))', color: 'var(--fg-3)', width: 20 }}>{String(i+1).padStart(2,'0')}</span>
                <span style={{ flex: 1 }}>{c}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Reader */}
        <main style={mds.reader}>
          <div style={mds.readerHead}>
            <div style={{ fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Chapter {active + 1} · {chunks.length} chunks</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'calc(42px * var(--app-font-scale))', fontWeight: 300, letterSpacing: '-0.02em', margin: '8px 0 6px' }}>{chapters[active] || (material && material.title) || 'Material'}</h1>
            <div style={{ fontSize: 'calc(13px * var(--app-font-scale))', color: 'var(--fg-2)' }}>{material && material.status === 'ready' ? 'Indexed for tutor and quizzes.' : (material ? `Status: ${material.status}` : 'Loading…')}</div>
          </div>

          <div style={mds.article}>
            {articleText ? (
              <p style={{ ...mds.p, whiteSpace: 'pre-wrap' }}>{articleText}</p>
            ) : (
              <p style={mds.p}>
                {material && material.status !== 'ready'
                  ? <em>Indexing… come back in a moment.</em>
                  : <em>No chunks yet for this chapter.</em>}
              </p>
            )}

          </div>
        </main>

        {/* Right rail */}
        <aside style={mds.rail}>
          <div style={mds.railBlock}>
            <div style={mds.railHead}>Start here</div>
            {window.LearningMap && learningMap ? (
              <window.LearningMap map={learningMap} compact />
            ) : (
              <div style={{ fontSize: 'calc(12px * var(--app-font-scale))', color: 'var(--fg-3)', padding: '4px 0' }}>
                Generate notes or a quiz to sharpen the learning map.
              </div>
            )}
          </div>

          <div style={mds.railBlock}>
            <div style={mds.railHead}>Key concepts</div>
            {material && material.concepts && material.concepts.length ? (
              material.concepts.map(c => (
                <div key={c.id || c.name} style={mds.concept}>
                  <span>{c.name}</span>
                  <span className="mono" style={{ fontSize: 'calc(10px * var(--app-font-scale))', color: 'var(--fg-3)' }}>{c.mastery_pct || 0}%</span>
                </div>
              ))
            ) : (
              <div style={{ fontSize: 'calc(12px * var(--app-font-scale))', color: 'var(--fg-3)', padding: '4px 0' }}>
                Concepts will appear after AI generation.
              </div>
            )}
          </div>

          <div style={mds.railBlock}>
            <div style={mds.railHead}>Generate (AI)</div>
            <div style={mds.scopeBox}>
              <label style={mds.scopeLabel}>Source</label>
              <select value={sourceScope} onChange={(e) => setSourceScope(e.target.value)} style={mds.scopeSelect}>
                <option value="material">Entire material</option>
                <option value="chapter" disabled={!chapterIds[active]}>Current chapter</option>
                <option value="chunk" disabled={!chunks[0]}>Current section</option>
              </select>
            </div>
            <button style={mds.gen} disabled={busy} onClick={() => generate('notes')}>
              <Icon.PenNib size={13} style={{ color: 'var(--accent)' }}/>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontSize: 'calc(12.5px * var(--app-font-scale))', color: 'var(--fg-0)' }}>{activeAction === 'notes' ? 'Generating notes...' : 'Summary notes'}</div>
                <div style={{ fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)' }}>From {sourceScopeLabel.toLowerCase()}</div>
              </div>
            </button>
            <button style={mds.gen} disabled={busy} onClick={async () => { const ok = await generate('flashcards', { regenerate: true }); if (ok) onNav('flashcards'); }}>
              <Icon.Cards size={13} style={{ color: 'var(--accent)' }}/>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontSize: 'calc(12.5px * var(--app-font-scale))', color: 'var(--fg-0)' }}>{activeAction === 'flashcards' ? 'Generating flashcards...' : 'Flashcards'}</div>
                <div style={{ fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)' }}>Create 6-8 cards from {sourceScopeLabel.toLowerCase()}</div>
              </div>
            </button>
            <button style={mds.gen} disabled={busy} onClick={async () => { const ok = await generate('quiz'); if (ok) onNav('quiz'); }}>
              <Icon.Target size={13} style={{ color: 'var(--accent)' }}/>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontSize: 'calc(12.5px * var(--app-font-scale))', color: 'var(--fg-0)' }}>{activeAction === 'quiz' ? 'Generating quiz...' : 'Practice quiz'}</div>
                <div style={{ fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)' }}>6 questions from {sourceScopeLabel.toLowerCase()}</div>
              </div>
            </button>
            <button style={mds.gen} disabled={busy} onClick={generateVideo}>
              <Icon.Play size={13} style={{ color: 'var(--accent)' }}/>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontSize: 'calc(12.5px * var(--app-font-scale))', color: 'var(--fg-0)' }}>{activeAction === 'video' ? 'Creating storyboard...' : 'Tutor video storyboard'}</div>
                <div style={{ fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)' }}>Storyboard from {sourceScopeLabel.toLowerCase()}</div>
              </div>
            </button>
            {genStatus && <div style={{ fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)', padding: '4px 4px 0' }}>{genStatus}</div>}
            {video && video.status === 'ready' && (
              <video src={video.file} controls crossOrigin="use-credentials" style={{ width: '100%', marginTop: 'calc(8px * var(--app-density-scale))', borderRadius: 'var(--r-sm)' }}>
                {video.captions && <track kind="captions" src={video.captions} srcLang="en" label="English"/>}
              </video>
            )}
          </div>

          <div style={mds.railBlock}>
            <div style={mds.railHead}>Your highlights</div>
            <div style={{ fontSize: 'calc(12px * var(--app-font-scale))', color: 'var(--fg-3)', padding: '4px 0' }}>
              No highlights yet.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

const mds = {
  layout: { display: 'grid', gridTemplateColumns: '240px 1fr 300px', minHeight: 'calc(100vh - 57px)' },
  chapters: { borderRight: '1px solid var(--line)', background: 'var(--bg-0)' },
  reader: { padding: '40px 56px', maxWidth: 780, margin: '0 auto' },
  readerHead: { marginBottom: 'calc(36px * var(--app-density-scale))' },
  article: { fontSize: 'calc(14.5px * var(--app-font-scale))', lineHeight: 1.75, color: 'var(--fg-1)' },
  p: { margin: '0 0 18px' },
  h2: { fontFamily: 'var(--font-display)', fontSize: 'calc(26px * var(--app-font-scale))', fontWeight: 400, letterSpacing: '-0.01em', margin: '36px 0 14px', color: 'var(--fg-0)' },
  mark: { background: 'var(--accent-glow)', color: 'var(--accent)', padding: '1px 4px', borderRadius: 3 },
  code: { fontFamily: 'var(--font-mono)', fontSize: 'calc(12.5px * var(--app-font-scale))', background: 'var(--bg-2)', padding: '1px 5px', borderRadius: 3, color: 'var(--fg-0)' },
  pre: { fontFamily: 'var(--font-mono)', fontSize: 'calc(12.5px * var(--app-font-scale))', background: 'var(--bg-1)', border: '1px solid var(--line)', padding: 'calc(18px * var(--app-density-scale))', borderRadius: 'var(--r-md)', overflow: 'auto', lineHeight: 1.6, color: 'var(--fg-0)', margin: '18px 0' },
  callout: {
    display: 'flex', gap: 'calc(12px * var(--app-density-scale))', padding: 'calc(16px * var(--app-density-scale))', borderRadius: 'var(--r-md)',
    background: 'var(--accent-glow)', border: '1px solid var(--accent-soft)',
    margin: '20px 0',
  },
  rail: { borderLeft: '1px solid var(--line)', padding: 'calc(20px * var(--app-density-scale))', display: 'flex', flexDirection: 'column', gap: 'calc(20px * var(--app-density-scale))', background: 'var(--bg-0)' },
  railBlock: { display: 'flex', flexDirection: 'column', gap: 'calc(4px * var(--app-density-scale))' },
  railHead: { fontSize: 'calc(10.5px * var(--app-font-scale))', color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'calc(8px * var(--app-density-scale))' },
  scopeBox: { display: 'flex', alignItems: 'center', gap: 'calc(8px * var(--app-density-scale))', marginBottom: 'calc(6px * var(--app-density-scale))' },
  scopeLabel: { fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)' },
  scopeSelect: {
    flex: 1,
    minWidth: 0,
    height: 30,
    borderRadius: 'var(--r-sm)',
    border: '1px solid var(--line)',
    background: 'var(--bg-1)',
    color: 'var(--fg-1)',
    fontSize: 'calc(12px * var(--app-font-scale))',
    padding: '0 8px',
  },
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
  highlight: { display: 'flex', gap: 'calc(8px * var(--app-density-scale))', padding: '6px 0' },
};

window.Materials = Materials;
window.MaterialDetail = MaterialDetail;
