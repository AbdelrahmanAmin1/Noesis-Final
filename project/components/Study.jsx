// Notes workspace, Flashcards, Quiz

const Notes = ({ onNav }) => {
  const Icon = window.Icon;
  const [data, setData] = React.useState({ notes: [], folders: [] });
  const [active, setActive] = React.useState(0);
  const [status, setStatus] = React.useState('');

  const refresh = React.useCallback(async () => {
    const d = await window.NoesisAPI.notes.list();
    setData(d || { notes: [], folders: [] });
    setActive(i => Math.min(i, Math.max(0, ((d && d.notes) || []).length - 1)));
  }, []);

  React.useEffect(() => { refresh().catch(e => setStatus(e.message || 'Failed to load notes')); }, [refresh]);

  const folders = (data.folders || []).map((f, i) => ({ name: f.folder, count: f.count, active: i === 0 }));
  const notes = (data.notes || []).map((n, i) => ({
    id: n.id,
    material_id: n.material_id,
    t: n.title,
    updated: n.updated_at ? new Date(n.updated_at).toLocaleString() : '',
    preview: (n.body_md || '').slice(0, 120),
    lesson_json: n.lesson_json,
    source_map_json: n.source_map_json,
    body_md: n.body_md,
    tag: n.folder,
    tags_json: n.tags_json,
    active: i === active,
  })).map(n => ({
    ...n,
    preview: window.LessonRenderer && window.LessonRenderer.preview
      ? window.LessonRenderer.preview(n.lesson_json, n.body_md)
      : n.preview,
  }));
  const current = notes[active] || null;

  const createNote = async () => {
    const title = window.prompt('Note title');
    if (!title || !title.trim()) return;
    setStatus('Creating note...');
    try {
      await window.NoesisAPI.notes.create({ title: title.trim(), body_md: '', folder: 'Manual', tags: ['manual'] });
      await refresh();
      setActive(0);
      setStatus('');
    } catch (e) {
      setStatus(e.message || 'Failed to create note');
    }
  };

  return (
    <div>
      <window.Topbar title="Notes" crumbs={['Workspace']}
        right={<button className="btn btn-accent" onClick={createNote}><Icon.Plus size={12}/> New note</button>}
      />
      <div style={ns.layout}>
        <aside style={ns.folders}>
          <div style={ns.sideHead}>Folders</div>
          <div style={{ padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 'calc(1px * var(--app-density-scale))' }}>
            {folders.length === 0 && <div style={ns.emptySide}>No folders yet</div>}
            {folders.map((f, i) => (
              <button key={i} style={{ ...ns.folderButton, background: f.active ? 'var(--bg-2)' : 'transparent', color: f.active ? 'var(--fg-0)' : 'var(--fg-2)' }}>
                <Icon.Folder size={13}/>
                <span style={{ flex: 1, textAlign: 'left' }}>{f.name}</span>
                <span style={{ fontSize: 'calc(10.5px * var(--app-font-scale))', color: 'var(--fg-3)' }} className="mono">{f.count}</span>
              </button>
            ))}
          </div>
        </aside>

        <section style={ns.list}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--line-soft)' }}>
            <div style={{ fontSize: 'calc(13px * var(--app-font-scale))', color: 'var(--fg-0)', fontWeight: 500 }}>{(folders[0] && folders[0].name) || 'All notes'}</div>
            <div style={{ fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)', marginTop: 'calc(2px * var(--app-density-scale))' }}>{notes.length} note{notes.length === 1 ? '' : 's'} sorted by recent</div>
            {status && <div style={{ fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)', marginTop: 'calc(6px * var(--app-density-scale))' }}>{status}</div>}
          </div>
          <div>
            {notes.length === 0 && <div style={ns.emptyList}>No notes yet. Generate notes from a material or create one manually.</div>}
            {notes.map((n, i) => (
              <button key={n.id} onClick={() => setActive(i)} style={{
                ...ns.noteButton,
                background: n.active ? 'var(--bg-2)' : 'transparent',
                borderLeft: n.active ? '2px solid var(--accent)' : '2px solid transparent',
              }}>
                <div style={{ fontSize: 'calc(13px * var(--app-font-scale))', color: 'var(--fg-0)', fontWeight: 500 }}>{n.t}</div>
                <div style={{ fontSize: 'calc(11.5px * var(--app-font-scale))', color: 'var(--fg-3)', display: 'flex', gap: 'calc(8px * var(--app-density-scale))' }}>
                  <span>{n.updated}</span><span>{n.tag}</span>
                </div>
                <div style={ns.preview}>{n.preview || 'Empty note'}</div>
              </button>
            ))}
          </div>
        </section>

        <NotesEditor current={current} onSaved={refresh} onDeleted={async () => { await refresh(); setActive(0); }} />
      </div>
    </div>
  );
};

const NotesEditor = ({ current, onSaved, onDeleted }) => {
  const Icon = window.Icon;
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [mode, setMode] = React.useState('read');
  const [audioStyle, setAudioStyle] = React.useState('none');
  const [audioBusy, setAudioBusy] = React.useState(false);
  const [audioStatus, setAudioStatus] = React.useState('');
  const [audioError, setAudioError] = React.useState('');
  const [audioUrl, setAudioUrl] = React.useState('');
  const [audioPlaying, setAudioPlaying] = React.useState(false);
  const audioRef = React.useRef(null);
  const audioRequestRef = React.useRef(0);

  React.useEffect(() => {
    audioRequestRef.current += 1;
    setTitle(current ? current.t : '');
    setBody(current ? current.body_md || '' : '');
    setStatus('');
    setMode('read');
    setAudioStyle('none');
    setAudioStatus('');
    setAudioError('');
    setAudioBusy(false);
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch (_) {}
      audioRef.current = null;
    }
    setAudioPlaying(false);
    setAudioUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
  }, [current && current.id]);

  React.useEffect(() => {
    return () => {
      if (audioRef.current) {
        try { audioRef.current.pause(); } catch (_) {}
      }
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const tags = React.useMemo(() => {
    let parsed = [];
    try { parsed = current && current.tags_json ? JSON.parse(current.tags_json) : []; } catch (_) {}
    return { folder: current && current.tag, tags: parsed };
  }, [current]);
  const materialId = current && current.material_id ? current.material_id : null;

  const save = async () => {
    if (!current) return;
    setBusy(true); setStatus('Saving...');
    try {
      await window.NoesisAPI.notes.update(current.id, { title, body_md: body, folder: tags.folder || 'General', tags: tags.tags });
      setStatus('Saved');
      onSaved && await onSaved();
    } catch (e) {
      setStatus('Failed: ' + (e.message || 'error'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!current || !window.confirm('Delete this note?')) return;
    setBusy(true); setStatus('Deleting...');
    try {
      await window.NoesisAPI.notes.remove(current.id);
      onDeleted && await onDeleted();
    } catch (e) {
      setStatus('Failed: ' + (e.message || 'error'));
    } finally {
      setBusy(false);
    }
  };

  const generateCards = async () => {
    if (!materialId) return;
    setBusy(true); setStatus('Generating flashcards...');
    try {
      const r = await window.NoesisAPI.flashcards.generate({ material_id: materialId, count: 8 });
      if (r.reused) setStatus('Using existing flashcards for this material.');
      else if (r.fallback) setStatus(r.message || 'Created fallback flashcards from source material.');
      else setStatus(`Created ${r.created} cards.`);
    } catch (e) {
      setStatus('Failed: ' + (e.message || 'error'));
    } finally {
      setBusy(false);
    }
  };

  const clearLoadedAudio = () => {
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch (_) {}
      audioRef.current = null;
    }
    setAudioPlaying(false);
    setAudioUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
  };

  const friendlyNoteAudioError = (err) => {
    const code = String((err && (err.code || err.message)) || '').trim();
    if (/audio_404|audio_not_found|not_found/i.test(code)) return 'No audio has been generated yet. Choose Generate audio first.';
    if (/note_not_found/i.test(code)) return 'This note could not be found. Refresh your notes and try again.';
    if (/rate_limited/i.test(code)) return 'Audio generation is cooling down. Wait a few seconds and try again.';
    if (/tts|voice|audio/i.test(code)) return 'Voice generation failed. You can keep reading the note and try again later.';
    return code || 'Could not prepare note audio.';
  };

  const loadNoteAudio = async (style) => {
    const res = await window.NoesisAPI.notes.audioBlob(current.id, style);
    if (!res.ok) throw new Error('audio_' + res.status);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch (_) {}
    }
    setAudioUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    const audio = new Audio(url);
    audio.onended = () => setAudioPlaying(false);
    audioRef.current = audio;
    setAudioStatus(style === 'brief' ? 'Brief voice ready.' : 'Detailed voice ready.');
    return audio;
  };

  const checkNoteAudio = async (style) => {
    if (!current || style === 'none') return;
    const requestId = ++audioRequestRef.current;
    clearLoadedAudio();
    setAudioError('');
    setAudioStatus('Checking saved voice explanation...');
    try {
      const meta = await window.NoesisAPI.notes.audioMeta(current.id, style);
      if (requestId !== audioRequestRef.current) return;
      if (!meta || meta.status === 'missing') {
        setAudioStatus('No audio generated yet.');
        return;
      }
      await loadNoteAudio(style);
      if (requestId === audioRequestRef.current) setAudioStatus(style === 'brief' ? 'Brief voice ready.' : 'Detailed voice ready.');
    } catch (e) {
      if (requestId !== audioRequestRef.current) return;
      setAudioError(friendlyNoteAudioError(e));
      setAudioStatus('');
    }
  };

  const generateAudio = async () => {
    if (!current || audioStyle === 'none' || audioBusy) return;
    setAudioBusy(true);
    setAudioError('');
    setAudioStatus('Preparing voice explanation...');
    try {
      const job = await window.NoesisAPI.notes.audio(current.id, { style: audioStyle, voice: 'default', speed: 'normal', regenerate: !!audioUrl });
      const completed = await window.NoesisAPI.pollJob(job.job_id, {
        intervalMs: 1000,
        timeoutMs: 240000,
        onProgress: (j) => setAudioStatus(j.message || `Generating voice... ${j.progress || 0}%`),
      });
      if (completed && completed.result && completed.result.status === 'completed') {
        setAudioStatus('Voice ready. Loading audio...');
      }
      const audio = await loadNoteAudio(audioStyle);
      setAudioPlaying(true);
      audio.play().catch(() => {
        setAudioPlaying(false);
        setAudioStatus('Voice ready. Press play to listen.');
      });
    } catch (e) {
      setAudioError(friendlyNoteAudioError(e));
      setAudioStatus('');
    } finally {
      setAudioBusy(false);
    }
  };

  const toggleAudio = async () => {
    if (!current || audioStyle === 'none') return;
    let audio = audioRef.current;
    try {
      if (!audio && !audioUrl) audio = await loadNoteAudio(audioStyle);
      if (!audio) audio = audioRef.current;
      if (!audio) return;
      if (audioPlaying) {
        audio.pause();
        setAudioPlaying(false);
      } else {
        await audio.play();
        setAudioPlaying(true);
      }
    } catch (e) {
      setAudioError(friendlyNoteAudioError(e));
    }
  };

  return (
    <main style={ns.editor}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '36px' }}>
        {!current ? (
          <div style={ns.emptyEditor}>
            <Icon.PenNib size={28} style={{ color: 'var(--fg-3)' }}/>
            <h2 style={ns.emptyTitle}>Pick a note to read</h2>
            <p style={ns.emptyText}>Generated and manual notes appear here with real backend persistence.</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 'calc(8px * var(--app-density-scale))', marginBottom: 'calc(18px * var(--app-density-scale))', alignItems: 'center', flexWrap: 'wrap' }}>
              {tags.folder && <span className="chip chip-accent">{tags.folder}</span>}
              {tags.tags.map((t) => <span key={t} className="chip">#{t}</span>)}
              <span style={{ marginLeft: 'auto', fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)' }}>{current.updated ? `Updated ${current.updated}` : ''}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 'calc(14px * var(--app-density-scale))', gap: 'calc(8px * var(--app-density-scale))' }}>
              {mode === 'edit' ? (
                <input className="input" value={title} onChange={e => setTitle(e.target.value)} style={{ ...ns.titleInput, marginBottom: 0, flex: 1 }}/>
              ) : (
                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'calc(32px * var(--app-font-scale))', fontWeight: 300, margin: 0, flex: 1, color: 'var(--fg-0)' }}>{title || 'Untitled'}</h1>
              )}
              <button className="btn btn-ghost" onClick={() => setMode(mode === 'read' ? 'edit' : 'read')} style={{ fontSize: 'calc(11.5px * var(--app-font-scale))', padding: '6px 12px', whiteSpace: 'nowrap' }}>
                {mode === 'read' ? 'Edit' : 'Read'}
              </button>
            </div>
            {mode === 'edit' ? (
              <textarea className="input" value={body} onChange={e => setBody(e.target.value)} style={ns.bodyInput} placeholder="Write your note..." />
            ) : (
              window.LessonRenderer
                ? <window.LessonRenderer lesson={current.lesson_json} markdown={body} />
                : <div className="md-rendered" style={ns.mdBody} dangerouslySetInnerHTML={{ __html: window.DOMPurify ? window.DOMPurify.sanitize(window.marked ? window.marked.parse(body || '') : body) : (body || '') }} />
            )}
            <div style={ns.audioPanel}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={ns.audioLabel}>Voice explanation</div>
                <select className="input" value={audioStyle} disabled={audioBusy} onChange={(e) => {
                  const nextStyle = e.target.value;
                  setAudioStyle(nextStyle);
                  setAudioStatus('');
                  setAudioError('');
                  clearLoadedAudio();
                  if (nextStyle !== 'none') checkNoteAudio(nextStyle);
                }} style={{ fontSize: 'calc(12.5px * var(--app-font-scale))', width: '100%' }}>
                  <option value="none">No audio</option>
                  <option value="brief">Brief audio explanation</option>
                  <option value="detailed">Detailed audio explanation</option>
                </select>
              </div>
              <button className="btn btn-ghost" disabled={audioBusy || audioStyle === 'none'} onClick={generateAudio}>
                <Icon.Sparkle size={12}/> {audioBusy ? 'Generating...' : audioUrl ? 'Regenerate' : 'Generate audio'}
              </button>
              <button className="btn btn-ghost" disabled={audioBusy || audioStyle === 'none' || !audioUrl} onClick={toggleAudio}>
                {audioPlaying ? <Icon.Pause size={12}/> : <Icon.Play size={12}/>} {audioPlaying ? 'Pause' : 'Play'}
              </button>
              {(audioStatus || audioError) && <div style={{ ...ns.audioStatus, color: audioError ? 'var(--err)' : 'var(--fg-3)' }}>{audioError || audioStatus}</div>}
            </div>
            <div style={{ display: 'flex', gap: 'calc(10px * var(--app-density-scale))', marginTop: 'calc(14px * var(--app-density-scale))', alignItems: 'center' }}>
              {mode === 'edit' && <button className="btn btn-accent" disabled={busy || !title.trim()} onClick={save}>{status === 'Saving...' ? 'Saving...' : 'Save'}</button>}
              <button className="btn btn-ghost" disabled={busy} onClick={remove} style={{ color: 'var(--err)' }}>{status === 'Deleting...' ? 'Deleting...' : 'Delete'}</button>
              {materialId && <button className="btn btn-ghost" disabled={busy} onClick={generateCards} style={{ marginLeft: 'auto' }}><Icon.Cards size={12}/> {status === 'Generating flashcards...' ? 'Generating flashcards...' : 'Generate 6-8 cards'}</button>}
            </div>
            {status && <div style={{ marginTop: 'calc(12px * var(--app-density-scale))', fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)' }}>{status}</div>}
          </>
        )}
      </div>
    </main>
  );
};

const ns = {
  layout: { display: 'grid', gridTemplateColumns: '220px 320px 1fr', minHeight: 'calc(100vh - 57px)' },
  folders: { borderRight: '1px solid var(--line)', padding: '8px 0', background: 'var(--bg-0)' },
  list: { borderRight: '1px solid var(--line)', background: 'var(--bg-0)', overflow: 'auto' },
  editor: { background: 'var(--bg-0)', overflow: 'auto' },
  sideHead: { padding: '16px 14px 8px', fontSize: 'calc(10.5px * var(--app-font-scale))', color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase' },
  emptySide: { padding: '8px 10px', fontSize: 'calc(12px * var(--app-font-scale))', color: 'var(--fg-3)' },
  emptyList: { padding: 'calc(18px * var(--app-density-scale))', fontSize: 'calc(12px * var(--app-font-scale))', color: 'var(--fg-3)' },
  folderButton: { display: 'flex', alignItems: 'center', gap: 'calc(10px * var(--app-density-scale))', padding: '8px 10px', borderRadius: 'var(--r-sm)', fontSize: 'calc(12.5px * var(--app-font-scale))' },
  noteButton: { display: 'flex', flexDirection: 'column', gap: 'calc(4px * var(--app-density-scale))', padding: '14px 18px', borderBottom: '1px solid var(--line-soft)', textAlign: 'left', width: '100%' },
  preview: { fontSize: 'calc(11.5px * var(--app-font-scale))', color: 'var(--fg-2)', marginTop: 'calc(4px * var(--app-density-scale))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  emptyEditor: { minHeight: '60vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' },
  emptyTitle: { fontFamily: 'var(--font-display)', fontSize: 'calc(30px * var(--app-font-scale))', fontWeight: 300, margin: '16px 0 8px' },
  emptyText: { fontSize: 'calc(13px * var(--app-font-scale))', color: 'var(--fg-3)', margin: 0 },
  titleInput: { width: '100%', fontFamily: 'var(--font-display)', fontSize: 'calc(32px * var(--app-font-scale))', marginBottom: 'calc(14px * var(--app-density-scale))' },
  bodyInput: { width: '100%', minHeight: 420, resize: 'vertical', fontSize: 'calc(14.5px * var(--app-font-scale))', lineHeight: 1.7 },
  mdBody: { minHeight: 420, fontSize: 'calc(14.5px * var(--app-font-scale))', lineHeight: 1.75, color: 'var(--fg-1)' },
  audioPanel: {
    marginTop: 'calc(18px * var(--app-density-scale))', padding: 'calc(12px * var(--app-density-scale))', borderRadius: 8, border: '1px solid var(--line)',
    background: 'var(--bg-1)', display: 'flex', alignItems: 'flex-end', gap: 'calc(10px * var(--app-density-scale))', flexWrap: 'wrap',
  },
  audioLabel: { fontSize: 'calc(10.5px * var(--app-font-scale))', color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'calc(6px * var(--app-density-scale))' },
  audioStatus: { width: '100%', fontSize: 'calc(11.5px * var(--app-font-scale))', lineHeight: 1.45 },
};

window.Notes = Notes;

const Flashcards = ({ onNav }) => {
  const Icon = window.Icon;
  const [i, setI] = React.useState(0);
  const [flipped, setFlipped] = React.useState(false);
  const [cards, setCards] = React.useState([]);
  const [decks, setDecks] = React.useState([]);
  const [materials, setMaterials] = React.useState([]);
  const [selectedDeck, setSelectedDeck] = React.useState(null);
  const [error, setError] = React.useState('');
  const [reviewing, setReviewing] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [generatingId, setGeneratingId] = React.useState(null);
  const [mode, setMode] = React.useState('due');
  const [counts, setCounts] = React.useState({ easy: 0, hard: 0, skipped: 0 });

  const refreshDecks = React.useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [deckRes, materialRes] = await Promise.all([
        window.NoesisAPI.flashcards.decks(),
        window.NoesisAPI.materials.list(),
      ]);
      setDecks((deckRes && deckRes.decks) || []);
      setMaterials(((materialRes && materialRes.materials) || []).filter(material => material.status === 'ready'));
    } catch (e) {
      setError(e.message || 'Failed to load flashcard decks');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { refreshDecks(); }, [refreshDecks]);

  const refresh = React.useCallback(() => {
    if (!selectedDeck || !selectedDeck.material_id) return Promise.resolve();
    const request = mode === 'all'
      ? window.NoesisAPI.flashcards.list(selectedDeck.material_id)
      : window.NoesisAPI.flashcards.due(selectedDeck.material_id);
    return request
      .then(d => { setCards(d.cards || []); setI(0); setFlipped(false); setError(''); })
      .catch(e => setError(e.message || 'Failed to load cards'));
  }, [mode, selectedDeck && selectedDeck.material_id]);

  React.useEffect(() => { if (selectedDeck) refresh(); }, [refresh, selectedDeck]);

  const openDeck = (deck) => {
    setSelectedDeck(deck);
    setMode('due');
    setCounts({ easy: 0, hard: 0, skipped: 0 });
    setCards([]); setI(0); setFlipped(false); setError('');
  };

  const generateDeck = async (materialId) => {
    if (generatingId) return;
    setGeneratingId(materialId); setError('');
    try {
      await window.NoesisAPI.flashcards.generate({ material_id: materialId, count: 8, regenerate: true });
      await refreshDecks();
    } catch (e) {
      setError(e.message || 'Could not generate flashcards');
    } finally {
      setGeneratingId(null);
    }
  };

  const hasCards = cards.length > 0;
  const c = cards[i] || { question: 'No cards due.', answer: 'Generate flashcards from a ready material.', deck: 'Review', topic: '', difficulty: '' };

  const rate = async (rating) => {
    if (!cards[i] || reviewing) return;
    setReviewing(true); setError('');
    try { await window.NoesisAPI.flashcards.review(cards[i].id, rating); } catch (e) { setError(e.message || 'Review failed'); setReviewing(false); return; }
    setCounts(prev => ({
      easy: prev.easy + (rating >= 3 ? 1 : 0),
      hard: prev.hard + (rating === 2 ? 1 : 0),
      skipped: prev.skipped + (rating === 1 ? 1 : 0),
    }));
    setFlipped(false);
    if (i + 1 >= cards.length) refresh().then(() => setI(0));
    else setI(i + 1);
    setReviewing(false);
  };

  if (!selectedDeck) return (
    <div style={fc.page}>
      <window.Topbar title="Flashcards" crumbs={['Choose material / deck']}
        right={<button className="btn btn-accent" onClick={() => onNav('materials')}><Icon.Folder size={12}/> Open materials</button>}
      />
      <main style={fc.deckPage}>
        <div style={fc.deckHero}>
          <div>
            <div style={fc.eyebrow}>Flashcard decks</div>
            <h1 style={fc.deckTitle}>Choose what you want to study</h1>
            <p style={fc.deckSub}>Each deck is isolated to one uploaded material. Cards from different materials are never combined.</p>
          </div>
          <span className="chip">{decks.length} deck{decks.length === 1 ? '' : 's'}</span>
        </div>
        {error && <div style={fc.error}>{error}</div>}
        {loading ? <div style={fc.empty}>Loading flashcard decks...</div> : decks.length > 0 ? (
          <div style={fc.deckGrid}>
            {decks.map(deck => (
              <article key={deck.generation_id} style={fc.deckCard}>
                <div style={fc.deckIcon}><Icon.Cards size={18}/></div>
                <h2 style={fc.deckCardTitle}>{deck.material_title}</h2>
                <div style={fc.deckMeta}>{deck.card_count} flashcard{deck.card_count === 1 ? '' : 's'} · {deck.due_count} due</div>
                <div style={fc.deckDate}>Last generated {deck.last_generated_at ? new Date(deck.last_generated_at).toLocaleString() : 'recently'}</div>
                <div style={fc.deckActions}>
                  <button className="btn btn-accent" onClick={() => openDeck(deck)}>Study Flashcards</button>
                  <button className="btn btn-ghost" disabled={!!generatingId} onClick={() => generateDeck(deck.material_id)}>
                    {generatingId === deck.material_id ? 'Regenerating...' : 'Regenerate'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div style={fc.empty}>
            <Icon.Cards size={26}/>
            <h2 style={fc.emptyTitle}>No flashcard decks yet</h2>
            <p style={fc.emptyText}>Choose a ready material below to generate a source-grounded deck.</p>
          </div>
        )}
        {materials.length > 0 && (
          <section style={fc.generatePanel}>
            <div style={fc.eyebrow}>Generate from a material</div>
            <div style={fc.materialList}>
              {materials.filter(material => !decks.some(deck => Number(deck.material_id) === Number(material.id))).map(material => (
                <div key={material.id} style={fc.materialRow}>
                  <span style={{ flex: 1 }}>{material.display_title || material.title}</span>
                  <button className="btn btn-ghost" disabled={!!generatingId} onClick={() => generateDeck(material.id)}>
                    {generatingId === material.id ? 'Generating...' : 'Generate Flashcards'}
                  </button>
                </div>
              ))}
              {materials.every(material => decks.some(deck => Number(deck.material_id) === Number(material.id))) && <div style={fc.deckDate}>All ready materials already have an active deck.</div>}
            </div>
          </section>
        )}
      </main>
    </div>
  );

  return (
    <div style={{ background: 'var(--bg-0)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <window.Topbar title={`Flashcards - ${selectedDeck.material_title}`} crumbs={['Flashcards', selectedDeck.material_title]}
        right={<>
          <button className="btn btn-ghost" disabled={reviewing} onClick={() => { setSelectedDeck(null); setCards([]); refreshDecks(); }}>Choose another deck</button>
          <button className="btn btn-ghost" disabled={reviewing} onClick={() => setMode(mode === 'due' ? 'all' : 'due')}>{mode === 'due' ? 'Review existing' : 'Due cards'}</button>
          <span style={{ fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)' }} className="mono">{hasCards ? `${i + 1} / ${cards.length}` : '0 / 0'}</span>
        </>}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 28px', borderBottom: '1px solid var(--line-soft)' }}>
          <div style={{ display: 'flex', gap: 'calc(3px * var(--app-density-scale))' }}>
            {(hasCards ? cards : [0]).map((_, k) => (
              <div key={k} style={{ flex: 1, height: 2, borderRadius: 1, background: k < i ? 'var(--ok)' : k === i ? 'var(--accent)' : 'var(--line)' }}/>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'calc(8px * var(--app-density-scale))', fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)' }} className="mono">
            <span>{counts.easy} easy | {counts.hard} hard | {counts.skipped} again</span>
            <span>{c.topic || c.deck || 'No topic'} {c.difficulty ? `| ${c.difficulty}` : ''}</span>
          </div>
          {reviewing && <div style={{ marginTop: 'calc(8px * var(--app-density-scale))', fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)' }}>Saving review...</div>}
          {error && <div style={{ marginTop: 'calc(8px * var(--app-density-scale))', fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--err)' }}>{error}</div>}
        </div>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'calc(40px * var(--app-density-scale))' }}>
          <div style={{ width: '100%', maxWidth: 640 }}>
            <div onClick={() => hasCards && setFlipped(!flipped)} style={{ ...fc.card, transform: flipped ? 'rotateY(180deg)' : 'rotateY(0)', cursor: hasCards ? 'pointer' : 'default' }}>
              <div style={{ ...fc.face, transform: 'rotateY(0)' }}>
                <div style={fc.faceLabel}>Question</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 'calc(34px * var(--app-font-scale))', fontWeight: 300, letterSpacing: '-0.015em', lineHeight: 1.25 }}>{c.question}</div>
                <div style={fc.meta}>{hasCards ? 'Click to flip' : (mode === 'due' ? 'No due cards. Review existing cards or create a new set.' : 'No saved cards for this material yet.')}</div>
              </div>
              <div style={{ ...fc.face, transform: 'rotateY(180deg)', background: 'var(--bg-2)' }}>
                <div style={{ ...fc.faceLabel, color: 'var(--accent)' }}>Answer</div>
                <div style={{ fontSize: 'calc(17px * var(--app-font-scale))', lineHeight: 1.55, color: 'var(--fg-0)' }}>{c.answer}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 'calc(8px * var(--app-density-scale))', marginTop: 'calc(32px * var(--app-density-scale))', justifyContent: 'center' }}>
              {[
                { l: 'Again', sub: '< 1m', color: 'var(--err)', key: '1', rating: 1 },
                { l: 'Hard', sub: '10m', color: 'var(--warn)', key: '2', rating: 2 },
                { l: 'Good', sub: '3 days', color: 'var(--accent)', key: '3', rating: 3 },
                { l: 'Easy', sub: '2 weeks', color: 'var(--ok)', key: '4', rating: 4 },
              ].map(b => (
                <button key={b.l} onClick={() => rate(b.rating)} disabled={!hasCards || reviewing} style={{ ...fc.rateBtn, opacity: hasCards && !reviewing ? 1 : 0.45 }}>
                  <span style={{ ...fc.keyHint, color: b.color }} className="mono">{b.key}</span>
                  <div>
                    <div style={{ fontSize: 'calc(13px * var(--app-font-scale))', color: 'var(--fg-0)', fontWeight: 500 }}>{b.l}</div>
                    <div style={{ fontSize: 'calc(10.5px * var(--app-font-scale))', color: 'var(--fg-3)', marginTop: 'calc(2px * var(--app-density-scale))' }} className="mono">{b.sub}</div>
                  </div>
                </button>
              ))}
            </div>
            {!hasCards && <div style={{ display: 'flex', gap: 'calc(8px * var(--app-density-scale))', justifyContent: 'center', marginTop: 'calc(24px * var(--app-density-scale))' }}>
              {mode === 'due' && <button className="btn btn-ghost" onClick={() => setMode('all')}><Icon.Cards size={12}/> Review existing</button>}
              <button className="btn btn-accent" onClick={() => { setSelectedDeck(null); setCards([]); }}><Icon.Folder size={12}/> Choose another deck</button>
            </div>}
          </div>
        </div>
      </div>
    </div>
  );
};

const fc = {
  page: { background: 'var(--bg-0)', minHeight: '100vh' },
  deckPage: { padding: 'calc(28px * var(--app-density-scale))', maxWidth: 1180, margin: '0 auto' },
  deckHero: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 'calc(18px * var(--app-density-scale))', marginBottom: 'calc(22px * var(--app-density-scale))' },
  eyebrow: { fontSize: 'calc(10.5px * var(--app-font-scale))', color: 'var(--accent)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 'calc(7px * var(--app-density-scale))' },
  deckTitle: { margin: 0, fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'calc(36px * var(--app-font-scale))' },
  deckSub: { color: 'var(--fg-2)', fontSize: 'calc(13px * var(--app-font-scale))', lineHeight: 1.55, margin: '8px 0 0', maxWidth: 680 },
  deckGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'calc(14px * var(--app-density-scale))' },
  deckCard: { minWidth: 0, padding: 'calc(18px * var(--app-density-scale))', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', background: 'var(--bg-1)' },
  deckIcon: { width: 38, height: 38, borderRadius: 10, display: 'grid', placeItems: 'center', color: 'var(--accent)', background: 'var(--accent-glow)', marginBottom: 'calc(14px * var(--app-density-scale))' },
  deckCardTitle: { margin: 0, color: 'var(--fg-0)', fontSize: 'calc(18px * var(--app-font-scale))', overflowWrap: 'anywhere' },
  deckMeta: { marginTop: 'calc(8px * var(--app-density-scale))', color: 'var(--fg-1)', fontSize: 'calc(12.5px * var(--app-font-scale))' },
  deckDate: { marginTop: 'calc(5px * var(--app-density-scale))', color: 'var(--fg-3)', fontSize: 'calc(11.5px * var(--app-font-scale))', lineHeight: 1.45 },
  deckActions: { display: 'flex', flexWrap: 'wrap', gap: 'calc(8px * var(--app-density-scale))', marginTop: 'calc(18px * var(--app-density-scale))' },
  empty: { padding: 'calc(34px * var(--app-density-scale))', border: '1px dashed var(--line-strong)', borderRadius: 'var(--r-lg)', color: 'var(--fg-3)', textAlign: 'center', display: 'grid', placeItems: 'center' },
  emptyTitle: { color: 'var(--fg-0)', margin: '12px 0 5px', fontSize: 'calc(20px * var(--app-font-scale))' },
  emptyText: { margin: 0, maxWidth: 480, lineHeight: 1.5 },
  error: { padding: '10px 12px', color: 'var(--err)', border: '1px solid var(--err)', borderRadius: 8, marginBottom: 'calc(14px * var(--app-density-scale))' },
  generatePanel: { marginTop: 'calc(22px * var(--app-density-scale))', padding: 'calc(16px * var(--app-density-scale))', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', background: 'var(--bg-1)' },
  materialList: { display: 'grid', gap: 'calc(7px * var(--app-density-scale))' },
  materialRow: { display: 'flex', alignItems: 'center', gap: 'calc(12px * var(--app-density-scale))', padding: '9px 10px', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--fg-1)' },
  card: { position: 'relative', minHeight: 340, transition: 'transform 600ms var(--ease-in-out)', transformStyle: 'preserve-3d' },
  face: {
    position: 'absolute', inset: 0, padding: 'calc(40px * var(--app-density-scale))', borderRadius: 'var(--r-xl)',
    background: 'var(--bg-1)', border: '1px solid var(--line)', backfaceVisibility: 'hidden',
    boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column',
  },
  faceLabel: { fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 'calc(20px * var(--app-density-scale))' },
  meta: { marginTop: 'auto', fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)' },
  rateBtn: { display: 'flex', alignItems: 'center', gap: 'calc(10px * var(--app-density-scale))', padding: '10px 16px', borderRadius: 'var(--r-md)', border: '1px solid var(--line)', background: 'var(--bg-1)', minWidth: 120, transition: 'all 160ms var(--ease-out)' },
  keyHint: { width: 20, height: 20, borderRadius: 4, background: 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'calc(11px * var(--app-font-scale))' },
};

window.Flashcards = Flashcards;

const Quiz = ({ onNav }) => {
  const Icon = window.Icon;
  const [quiz, setQuiz] = React.useState(null);
  const [questions, setQuestions] = React.useState([]);
  const [library, setLibrary] = React.useState([]);
  const [wrong, setWrong] = React.useState([]);
  const [qi, setQi] = React.useState(0);
  const [attemptId, setAttemptId] = React.useState(null);
  const [selected, setSelected] = React.useState(null);
  const [submitted, setSubmitted] = React.useState(false);
  const [feedback, setFeedback] = React.useState(null);
  const [finalScore, setFinalScore] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [action, setAction] = React.useState('');
  const [answeredIds, setAnsweredIds] = React.useState(new Set());

  const loadLibrary = React.useCallback(async () => {
    setBusy(true); setAction('load');
    try {
      const [q, w] = await Promise.all([window.NoesisAPI.quizzes.list(), window.NoesisAPI.quizzes.wrong()]);
      setLibrary(q.quizzes || []);
      setWrong(w.wrong || []);
      setError('');
    } catch (e) {
      setError(e.message || 'Failed to load quizzes');
    } finally {
      setBusy(false); setAction('');
    }
  }, []);

  const startQuiz = async (id) => {
    if (busy) return;
    setBusy(true); setAction('start'); setError('');
    try {
      sessionStorage.setItem('noesis.quizId', String(id));
      const d = await window.NoesisAPI.quizzes.get(id);
      const a = await window.NoesisAPI.quizzes.attempt(id);
      setQuiz(d.quiz);
      setQuestions(d.questions || []);
      setAttemptId(a.attempt_id);
      setQi(0); setSelected(null); setSubmitted(false); setFeedback(null); setFinalScore(null);
      setAnsweredIds(new Set());
    } catch (e) {
      if (e.code === 'quiz_requires_regeneration') {
        sessionStorage.removeItem('noesis.quizId');
        setQuiz(null); setQuestions([]); setAttemptId(null);
        await loadLibrary();
        setError('That older quiz was hidden because it contained document details. Generate a new quiz for concept-only questions.');
      } else {
        setError(e.message || 'Failed to start quiz');
      }
    } finally {
      setBusy(false); setAction('');
    }
  };

  React.useEffect(() => {
    const id = parseInt(sessionStorage.getItem('noesis.quizId') || '0', 10);
    if (id) startQuiz(id);
    else loadLibrary();
  }, []);

  const backToLibrary = async () => {
    sessionStorage.removeItem('noesis.quizId');
    setQuiz(null); setQuestions([]); setAttemptId(null); setFinalScore(null);
    setSelected(null); setSubmitted(false); setFeedback(null); setError('');
    setAnsweredIds(new Set());
    await loadLibrary();
  };

  const cur = finalScore ? null : questions[qi];
  const isLastQuestion = qi + 1 >= questions.length;

  const submit = async () => {
    if (cur == null || selected == null || !attemptId || busy) return;
    setBusy(true); setAction('submit'); setError('');
    try {
      const res = await window.NoesisAPI.quizzes.answer(attemptId, { question_id: cur.id, selected_idx: selected });
      setFeedback(res);
      setSubmitted(true);
      setAnsweredIds(prev => new Set([...prev, cur.id]));
    } catch (e) {
      setError(e.message || 'Answer failed');
    } finally {
      setBusy(false); setAction('');
    }
  };

  const finishQuiz = async () => {
    if (!attemptId || busy) return;
    const pendingCurrent = cur && selected != null && !submitted ? 1 : 0;
    const unanswered = Math.max(0, questions.length - answeredIds.size - pendingCurrent);
    if (unanswered > 0 && !window.confirm(`${unanswered} question${unanswered === 1 ? '' : 's'} unanswered. Finish anyway?`)) return;
    setBusy(true); setAction('finish'); setError('');
    try {
      if (cur && selected != null && !submitted) {
        const res = await window.NoesisAPI.quizzes.answer(attemptId, { question_id: cur.id, selected_idx: selected });
        setFeedback(res);
        setSubmitted(true);
        setAnsweredIds(prev => new Set([...prev, cur.id]));
      }
      const r = await window.NoesisAPI.quizzes.finish(attemptId);
      setFinalScore(r);
      sessionStorage.removeItem('noesis.quizId');
    } catch (e) {
      setError(e.message || 'Finish failed');
    } finally {
      setBusy(false); setAction('');
    }
  };

  const nextQ = async () => {
    if (qi + 1 >= questions.length) {
      await finishQuiz();
    } else {
      setQi(qi + 1);
      setSelected(null);
      setSubmitted(false);
      setFeedback(null);
    }
  };

  if (!quiz) {
    return (
      <div style={{ background: 'var(--bg-0)', minHeight: '100vh' }}>
        <window.Topbar title="Quizzes" crumbs={['Practice']}
          right={<button className="btn btn-accent" onClick={() => onNav('materials')}><Icon.Folder size={12}/> Generate from material</button>}
        />
        <div style={qz.page}>
          {error && <div style={qz.error}>{error}</div>}
          <section className="card" style={qz.section}>
            <div style={qz.sectionHead}>
              <div>
                <div style={qz.eyebrow}>Quiz library</div>
                <h1 style={qz.title}>Practice from generated quizzes</h1>
              </div>
              {busy && <span style={qz.muted}>{action === 'start' ? 'Starting quiz...' : 'Loading...'}</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(8px * var(--app-density-scale))', marginTop: 'calc(18px * var(--app-density-scale))' }}>
              {library.length === 0 && <div style={qz.empty}>No quizzes yet. Open a ready material and generate a practice quiz.</div>}
              {library.map(q => (
                <button key={q.id} disabled={busy} onClick={() => startQuiz(q.id)} style={{ ...qz.quizRow, opacity: busy ? 0.65 : 1 }}>
                  <Icon.Target size={15} style={{ color: 'var(--accent)' }}/>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontSize: 'calc(13.5px * var(--app-font-scale))', color: 'var(--fg-0)', fontWeight: 500 }}>{q.title}</div>
                    <div style={{ fontSize: 'calc(11.5px * var(--app-font-scale))', color: 'var(--fg-3)', marginTop: 'calc(2px * var(--app-density-scale))' }}>{q.question_count} questions | {q.difficulty} | Start new attempt</div>
                  </div>
                  <span className="chip">{q.last_score == null ? 'Not attempted' : `Review: ${q.last_score}%`}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="card" style={qz.section}>
            <div style={qz.sectionHead}>
              <div>
                <div style={qz.eyebrow}>Wrong-answer review</div>
                <h2 style={qz.subTitle}>Questions to revisit</h2>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(10px * var(--app-density-scale))', marginTop: 'calc(16px * var(--app-density-scale))' }}>
              {wrong.length === 0 && <div style={qz.empty}>No wrong answers stored yet.</div>}
              {wrong.map((w, i) => (
                <div key={`${w.attempt_id}-${w.question_id}-${i}`} style={qz.wrongRow}>
                  <div style={{ fontSize: 'calc(13px * var(--app-font-scale))', color: 'var(--fg-0)', marginBottom: 'calc(8px * var(--app-density-scale))' }}>{w.question}</div>
                  <div style={{ fontSize: 'calc(12px * var(--app-font-scale))', color: 'var(--fg-2)' }}>Correct: {w.options[w.correct_idx]}</div>
                  <div style={{ fontSize: 'calc(11.5px * var(--app-font-scale))', color: 'var(--fg-3)', marginTop: 'calc(6px * var(--app-density-scale))' }}>{[w.topic || w.concept, w.difficulty].filter(Boolean).join(' | ')}</div>
                  <div style={{ fontSize: 'calc(11.5px * var(--app-font-scale))', color: 'var(--fg-3)', marginTop: 'calc(6px * var(--app-density-scale))' }}>{w.explanation || 'Review the source material for this concept.'}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--bg-0)', minHeight: '100vh' }}>
      <window.Topbar title={quiz.title} crumbs={['Quizzes']}
        right={<><button className="btn btn-ghost" onClick={backToLibrary}>Quiz library</button><span style={{ fontSize: 'calc(11.5px * var(--app-font-scale))', color: 'var(--fg-3)' }}>Question {questions.length ? qi + 1 : 0} / {questions.length}</span></>}
      />
      <div style={{ maxWidth: 780, margin: '0 auto', padding: '40px 28px' }}>
        {error && <div style={qz.error}>{error}</div>}
        <div style={{ display: 'flex', gap: 'calc(4px * var(--app-density-scale))', marginBottom: 'calc(36px * var(--app-density-scale))' }}>
          {(questions.length ? questions : [0]).map((_, k) => (
            <div key={k} style={{ flex: 1, height: 4, borderRadius: 2, background: k < qi ? 'var(--ok)' : k === qi ? 'var(--accent)' : 'var(--line)' }}/>
          ))}
        </div>

        <div style={qz.eyebrow}>
          {cur ? `Question ${String(qi + 1).padStart(2, '0')} ${cur.topic || cur.concept ? '| ' + (cur.topic || cur.concept) : ''} ${cur.difficulty ? '| ' + cur.difficulty : ''}` : (finalScore ? 'Quiz complete' : 'No questions')}
        </div>
        <h1 style={qz.questionTitle}>
          {cur ? cur.question : (finalScore ? `You scored ${finalScore.score}% (${finalScore.correct}/${finalScore.total})` : 'This quiz has no questions.')}
        </h1>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(10px * var(--app-density-scale))' }}>
          {(cur ? cur.options : []).map((label, idx) => {
            const isSel = selected === idx;
            const show = submitted && feedback;
            const isCorrect = show && idx === feedback.correct_idx;
            const isWrong = show && isSel && !isCorrect;
            return (
              <button key={idx} onClick={() => !submitted && setSelected(idx)} style={{
                ...qz.option,
                borderColor: isCorrect ? 'var(--ok)' : isWrong ? 'var(--err)' : isSel ? 'var(--accent-soft)' : 'var(--line)',
                background: isCorrect ? 'color-mix(in oklab, var(--ok) 10%, transparent)' : isWrong ? 'color-mix(in oklab, var(--err) 10%, transparent)' : isSel ? 'var(--accent-glow)' : 'var(--bg-1)',
              }}>
                <span className="mono" style={{ fontSize: 'calc(10px * var(--app-font-scale))', color: 'var(--fg-3)', width: 16 }}>{String.fromCharCode(65 + idx)}</span>
                <span style={{ flex: 1, fontSize: 'calc(14px * var(--app-font-scale))', color: 'var(--fg-0)' }}>{label}</span>
                {isCorrect && <Icon.Check size={13} style={{ color: 'var(--ok)' }}/>}
                {isWrong && <Icon.X size={13} style={{ color: 'var(--err)' }}/>}
              </button>
            );
          })}
        </div>

        {submitted && feedback && (
          <div style={qz.feedback}>
            <div style={{ fontSize: 'calc(12px * var(--app-font-scale))', color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'calc(8px * var(--app-density-scale))' }}>{feedback.is_correct ? 'Correct' : 'Review this'}</div>
            <div style={{ fontSize: 'calc(13.5px * var(--app-font-scale))', color: 'var(--fg-1)', lineHeight: 1.6 }}>{feedback.explanation || 'Review the material and try again.'}</div>
          </div>
        )}

        {finalScore && (
          <div style={qz.feedback}>
            <div style={{ fontSize: 'calc(12px * var(--app-font-scale))', color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'calc(8px * var(--app-density-scale))' }}>Saved attempt</div>
            <div style={{ fontSize: 'calc(13.5px * var(--app-font-scale))', color: 'var(--fg-1)', lineHeight: 1.6 }}>
              Score saved: {finalScore.score}% with {finalScore.correct}/{finalScore.total} correct.
              {finalScore.wrong && finalScore.wrong.length ? ` ${finalScore.wrong.length} wrong answer${finalScore.wrong.length === 1 ? '' : 's'} stored for review.` : ' No wrong answers to review.'}
              {finalScore.reward && finalScore.reward.points ? ` +${finalScore.reward.points} XP earned.` : ''}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'calc(36px * var(--app-density-scale))' }}>
          <button className="btn btn-bare" disabled={busy} onClick={backToLibrary}><Icon.ArrowLeft size={12}/> Back to library</button>
          {finalScore ? (
            <button className="btn btn-accent" disabled={busy} onClick={backToLibrary}>Finish review <Icon.ArrowRight size={12}/></button>
          ) : !submitted && isLastQuestion ? (
            <button className="btn btn-accent" onClick={finishQuiz} disabled={busy || selected == null || !cur}>{action === 'finish' ? 'Saving results...' : 'Finish'} <Icon.ArrowRight size={12}/></button>
          ) : !submitted ? (
            <button className="btn btn-accent" onClick={submit} disabled={busy || selected == null || !cur}>{action === 'submit' ? 'Submitting...' : 'Submit'} <Icon.ArrowRight size={12}/></button>
          ) : (
            <button className="btn btn-accent" disabled={busy} onClick={nextQ}>{action === 'finish' ? 'Finishing...' : (qi + 1 >= questions.length ? 'Finish' : 'Next')} <Icon.ArrowRight size={12}/></button>
          )}
        </div>
      </div>
    </div>
  );
};

const qz = {
  page: { padding: 'calc(28px * var(--app-density-scale))', maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr', gap: 'calc(14px * var(--app-density-scale))' },
  section: { padding: 'calc(22px * var(--app-density-scale))' },
  sectionHead: { display: 'flex', justifyContent: 'space-between', gap: 'calc(16px * var(--app-density-scale))', alignItems: 'flex-start' },
  eyebrow: { fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--accent)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 'calc(8px * var(--app-density-scale))' },
  title: { fontFamily: 'var(--font-display)', fontSize: 'calc(34px * var(--app-font-scale))', fontWeight: 300, margin: 0 },
  subTitle: { fontFamily: 'var(--font-display)', fontSize: 'calc(24px * var(--app-font-scale))', fontWeight: 300, margin: 0 },
  muted: { fontSize: 'calc(12px * var(--app-font-scale))', color: 'var(--fg-3)' },
  empty: { padding: 'calc(18px * var(--app-density-scale))', color: 'var(--fg-3)', fontSize: 'calc(12.5px * var(--app-font-scale))', border: '1px dashed var(--line-strong)', borderRadius: 'var(--r-md)' },
  error: { marginBottom: 'calc(12px * var(--app-density-scale))', color: 'var(--err)', fontSize: 'calc(12px * var(--app-font-scale))' },
  quizRow: { display: 'flex', alignItems: 'center', gap: 'calc(12px * var(--app-density-scale))', padding: 'calc(14px * var(--app-density-scale))', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', background: 'var(--bg-1)' },
  wrongRow: { padding: 'calc(14px * var(--app-density-scale))', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', background: 'var(--bg-1)' },
  questionTitle: { fontFamily: 'var(--font-display)', fontSize: 'calc(32px * var(--app-font-scale))', fontWeight: 300, letterSpacing: '-0.015em', margin: '0 0 18px', lineHeight: 1.3 },
  option: { display: 'flex', alignItems: 'flex-start', gap: 'calc(14px * var(--app-density-scale))', padding: '14px 16px', borderRadius: 'var(--r-md)', border: '1px solid', textAlign: 'left', transition: 'all 160ms var(--ease-out)' },
  feedback: { marginTop: 'calc(24px * var(--app-density-scale))', padding: 'calc(18px * var(--app-density-scale))', borderRadius: 'var(--r-lg)', background: 'var(--bg-1)', border: '1px solid var(--line)' },
};

window.Quiz = Quiz;
