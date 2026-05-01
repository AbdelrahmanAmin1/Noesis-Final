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
    const allowed = ['pdf', 'docx', 'doc', 'txt', 'md', 'pptx', 'ppt'];
    if (!allowed.includes(ext)) {
      setErr('Unsupported file type. Upload PDF, DOCX, TXT, Markdown, PPTX, or PPT.');
      return;
    }
    setBusy(true); setErr(''); setUploadStatus(`Uploading ${file.name}...`);
    try {
      const r = await window.NoesisAPI.materials.upload(file);
      setUploadStatus(ext === 'pptx' || ext === 'ppt' ? 'Upload accepted. Extracting slides...' : 'Upload accepted. Indexing material...');
      if (r && r.job_id) {
        await window.NoesisAPI.pollJob(r.job_id, { intervalMs: 1500, onProgress: (j) => {
          const verb = ext === 'pptx' || ext === 'ppt' ? 'Extracting slides' : 'Indexing material';
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
          <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.txt,.md,.pptx,.ppt" style={{ display: 'none' }}
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
            {err && <div style={{ fontSize: 11, color: 'var(--err)', marginTop: 4 }}>{err}</div>}
            {uploadStatus && <div style={{ fontSize: 11, color: uploadStatus.includes('ready') ? 'var(--ok)' : 'var(--fg-3)', marginTop: 4 }}>{uploadStatus}</div>}
          </div>
          <div style={{ display: 'flex', gap: 4, padding: 2, background: 'var(--bg-2)', borderRadius: 'var(--r-md)', border: '1px solid var(--line)' }}>
            {['grid', 'list'].map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: '6px 12px', fontSize: 11.5, borderRadius: 6,
                background: view === v ? 'var(--bg-0)' : 'transparent',
                color: view === v ? 'var(--fg-0)' : 'var(--fg-2)',
                textTransform: 'capitalize',
              }}>{v}</button>
            ))}
          </div>
        </div>

        <div style={ms.uploadZone}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 'var(--r-md)', background: 'var(--accent-glow)', border: '1px dashed var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon.Upload size={16} style={{ color: 'var(--accent)' }}/>
            </div>
            <div>
              <div style={{ fontSize: 13.5, color: 'var(--fg-0)', fontWeight: 500 }}>Drop a PDF, DOCX, TXT, Markdown, PPTX, or PPT file</div>
              <div style={{ fontSize: 12, color: 'var(--fg-2)', marginTop: 2 }}>Noesis extracts documents and PowerPoint slides for notes, flashcards, quizzes, and tutoring. PPTX is recommended for slide decks.</div>
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
                  <div style={{ height: 120, background: `linear-gradient(135deg, ${m.color}22, transparent 70%), var(--bg-2)`, borderRadius: 'var(--r-md)', marginBottom: 14, position: 'relative', overflow: 'hidden', border: '1px solid var(--line-soft)' }}>
                    <Ti size={36} style={{ position: 'absolute', top: 16, left: 16, color: m.color, opacity: 0.6 }}/>
                    <div style={{ position: 'absolute', bottom: 10, right: 10, fontSize: 10, color: 'var(--fg-3)' }} className="mono">{m.type.toUpperCase()}</div>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: view === 'grid' ? 'flex-start' : 'center', gap: 12, flex: 1 }}>
                  {view === 'list' && <Ti size={18} style={{ color: m.color }}/>}
                  <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--fg-0)', marginBottom: 4, fontWeight: 400, letterSpacing: '-0.005em' }}>{m.t}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--fg-3)', display: 'flex', gap: 10 }}>
                      <span>{m.course}</span><span>·</span><span>{m.chapters} ch</span><span>·</span><span>{m.updated}</span>
                    </div>
                  </div>
                  {view === 'list' && (
                    <div style={{ width: 80 }}>
                      <div style={{ height: 3, background: 'var(--line)', borderRadius: 2 }}>
                        <div style={{ height: '100%', width: m.progress + '%', background: m.color, borderRadius: 2 }}/>
                      </div>
                      <div className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', marginTop: 3, textAlign: 'right' }}>{m.progress}%</div>
                    </div>
                  )}
                </div>
                {view === 'grid' && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ height: 3, background: 'var(--line)', borderRadius: 2 }}>
                      <div style={{ height: '100%', width: m.progress + '%', background: m.color, borderRadius: 2 }}/>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10.5, color: 'var(--fg-3)' }} className="mono">
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
  page: { padding: 28, maxWidth: 1400, margin: '0 auto' },
  header: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 },
  eyebrow: { fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 },
  title: { fontFamily: 'var(--font-display)', fontSize: 40, fontWeight: 300, letterSpacing: '-0.02em', margin: 0 },
  uploadZone: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 20px', borderRadius: 'var(--r-lg)',
    border: '1px dashed var(--line-strong)', background: 'var(--bg-1)',
    marginBottom: 28,
  },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 },
  list: { display: 'flex', flexDirection: 'column', gap: 6 },
  card: { padding: 16, display: 'flex', flexDirection: 'column', textAlign: 'left' },
  rowCard: { padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 },
};

// Material Detail
const MaterialDetail = ({ onNav }) => {
  const Icon = window.Icon;
  const [active, setActive] = React.useState(0);
  const [material, setMaterial] = React.useState(null);
  const [chunks, setChunks] = React.useState([]);
  const [chapters, setChapters] = React.useState(['Document']);
  const [chapterIds, setChapterIds] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [genStatus, setGenStatus] = React.useState('');
  const [activeAction, setActiveAction] = React.useState('');
  const [video, setVideo] = React.useState(null);
  const id = parseInt(sessionStorage.getItem('noesis.materialId') || '0', 10);

  React.useEffect(() => {
    if (!id) { onNav && onNav('materials'); return; }
    window.NoesisAPI.materials.get(id).then(m => {
      setMaterial(m);
      const titles = (m.chapters || []).map(c => c.title);
      setChapters(titles.length ? titles : ['Document']);
      setChapterIds((m.chapters || []).map(c => c.id));
    }).catch(() => {});
  }, [id]);

  React.useEffect(() => {
    return () => {
      if (video && video.file && video.file.startsWith('blob:')) URL.revokeObjectURL(video.file);
    };
  }, [video]);

  React.useEffect(() => {
    if (!id) return;
    const chId = chapterIds[active];
    window.NoesisAPI.materials.chunks(id, chId).then(d => setChunks(d.chunks || [])).catch(() => setChunks([]));
  }, [id, active, chapterIds]);

  const generate = async (kind) => {
    if (!id || busy) return false;
    const labels = { notes: 'notes', flashcards: 'flashcards', quiz: 'quiz' };
    setActiveAction(kind);
    setBusy(true); setGenStatus(`Generating ${labels[kind] || kind}...`);
    try {
      if (kind === 'notes') await window.NoesisAPI.notes.generate({ material_id: id, chapter_id: chapterIds[active] });
      if (kind === 'flashcards') await window.NoesisAPI.flashcards.generate({ material_id: id, count: 8 });
      if (kind === 'quiz') {
        const r = await window.NoesisAPI.quizzes.generate({ material_id: id, count: 6, difficulty: 'medium' });
        sessionStorage.setItem('noesis.quizId', String(r.quiz_id));
      }
      setGenStatus(`${labels[kind] || kind} generated successfully.`);
      return true;
    } catch (e) {
      setGenStatus('Failed: ' + (e.message || 'error'));
      return false;
    } finally {
      setBusy(false);
      setActiveAction('');
    }
  };

  const generateVideo = async () => {
    if (!id || !material) return;
    setActiveAction('video');
    setBusy(true); setGenStatus('Generating tutor video...');
    try {
      const r = await window.NoesisAPI.videos.generate({ material_id: id, concept: chapters[active] || material.title });
      setVideo({ id: r.video_id, status: 'queued' });
      await window.NoesisAPI.pollJob(r.job_id, { intervalMs: 3000, onProgress: (j) => setGenStatus(j.stage || `Rendering video ${j.progress || 0}%...`) });
      const file = await window.NoesisAPI.videos.fileBlobUrl(r.video_id);
      setVideo({ id: r.video_id, status: 'ready', file });
      setGenStatus('Tutor video ready with narration.');
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
            <div style={{ fontSize: 10.5, color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Chapters</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '0 8px' }}>
            {chapters.map((c, i) => (
              <button key={i} onClick={() => setActive(i)} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 'var(--r-sm)',
                background: active === i ? 'var(--bg-2)' : 'transparent',
                color: active === i ? 'var(--fg-0)' : 'var(--fg-2)',
                fontSize: 12.5, textAlign: 'left',
              }}>
                <span className="mono" style={{ fontSize: 9.5, color: 'var(--fg-3)', width: 20 }}>{String(i+1).padStart(2,'0')}</span>
                <span style={{ flex: 1 }}>{c}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Reader */}
        <main style={mds.reader}>
          <div style={mds.readerHead}>
            <div style={{ fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Chapter {active + 1} · {chunks.length} chunks</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 42, fontWeight: 300, letterSpacing: '-0.02em', margin: '8px 0 6px' }}>{chapters[active] || 'Document'}</h1>
            <div style={{ fontSize: 13, color: 'var(--fg-2)' }}>{material && material.status === 'ready' ? 'Indexed for tutor and quizzes.' : (material ? `Status: ${material.status}` : 'Loading…')}</div>
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
            <div style={mds.railHead}>Key concepts</div>
            <div style={{ fontSize: 12, color: 'var(--fg-3)', padding: '4px 0' }}>
              Concepts will appear after AI generation.
            </div>
          </div>

          <div style={mds.railBlock}>
            <div style={mds.railHead}>Generate (AI)</div>
            <button style={mds.gen} disabled={busy} onClick={() => generate('notes')}>
              <Icon.PenNib size={13} style={{ color: 'var(--accent)' }}/>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontSize: 12.5, color: 'var(--fg-0)' }}>{activeAction === 'notes' ? 'Generating notes...' : 'Summary notes'}</div>
                <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>From this chapter</div>
              </div>
            </button>
            <button style={mds.gen} disabled={busy} onClick={async () => { const ok = await generate('flashcards'); if (ok) onNav('flashcards'); }}>
              <Icon.Cards size={13} style={{ color: 'var(--accent)' }}/>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontSize: 12.5, color: 'var(--fg-0)' }}>{activeAction === 'flashcards' ? 'Generating flashcards...' : 'Flashcards'}</div>
                <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>Generate 8 cards</div>
              </div>
            </button>
            <button style={mds.gen} disabled={busy} onClick={async () => { const ok = await generate('quiz'); if (ok) onNav('quiz'); }}>
              <Icon.Target size={13} style={{ color: 'var(--accent)' }}/>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontSize: 12.5, color: 'var(--fg-0)' }}>{activeAction === 'quiz' ? 'Generating quiz...' : 'Practice quiz'}</div>
                <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>6 questions</div>
              </div>
            </button>
            <button style={mds.gen} disabled={busy} onClick={generateVideo}>
              <Icon.Play size={13} style={{ color: 'var(--accent)' }}/>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontSize: 12.5, color: 'var(--fg-0)' }}>{activeAction === 'video' ? 'Generating video...' : 'Video explanation'}</div>
                <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>{video && video.status === 'ready' ? 'Ready — play below' : (video ? 'Processing…' : 'Generate narrated video')}</div>
              </div>
            </button>
            {genStatus && <div style={{ fontSize: 11, color: 'var(--fg-3)', padding: '4px 4px 0' }}>{genStatus}</div>}
            {video && video.status === 'ready' && (
              <video src={video.file} controls crossOrigin="use-credentials" style={{ width: '100%', marginTop: 8, borderRadius: 'var(--r-sm)' }}/>
            )}
          </div>

          <div style={mds.railBlock}>
            <div style={mds.railHead}>Your highlights</div>
            <div style={{ fontSize: 12, color: 'var(--fg-3)', padding: '4px 0' }}>
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
  readerHead: { marginBottom: 36 },
  article: { fontSize: 14.5, lineHeight: 1.75, color: 'var(--fg-1)' },
  p: { margin: '0 0 18px' },
  h2: { fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 400, letterSpacing: '-0.01em', margin: '36px 0 14px', color: 'var(--fg-0)' },
  mark: { background: 'var(--accent-glow)', color: 'var(--accent)', padding: '1px 4px', borderRadius: 3 },
  code: { fontFamily: 'var(--font-mono)', fontSize: 12.5, background: 'var(--bg-2)', padding: '1px 5px', borderRadius: 3, color: 'var(--fg-0)' },
  pre: { fontFamily: 'var(--font-mono)', fontSize: 12.5, background: 'var(--bg-1)', border: '1px solid var(--line)', padding: 18, borderRadius: 'var(--r-md)', overflow: 'auto', lineHeight: 1.6, color: 'var(--fg-0)', margin: '18px 0' },
  callout: {
    display: 'flex', gap: 12, padding: 16, borderRadius: 'var(--r-md)',
    background: 'var(--accent-glow)', border: '1px solid var(--accent-soft)',
    margin: '20px 0',
  },
  rail: { borderLeft: '1px solid var(--line)', padding: 20, display: 'flex', flexDirection: 'column', gap: 20, background: 'var(--bg-0)' },
  railBlock: { display: 'flex', flexDirection: 'column', gap: 4 },
  railHead: { fontSize: 10.5, color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 },
  concept: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 10px', borderRadius: 'var(--r-sm)',
    fontSize: 12, color: 'var(--fg-1)', textAlign: 'left',
    transition: 'background 140ms var(--ease-out)',
  },
  gen: {
    display: 'flex', gap: 10, alignItems: 'center',
    padding: '10px 12px', borderRadius: 'var(--r-sm)',
    border: '1px solid var(--line)', background: 'var(--bg-1)',
    transition: 'all 140ms var(--ease-out)',
  },
  highlight: { display: 'flex', gap: 8, padding: '6px 0' },
};

window.Materials = Materials;
window.MaterialDetail = MaterialDetail;
