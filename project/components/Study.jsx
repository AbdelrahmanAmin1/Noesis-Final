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
    body_md: n.body_md,
    tag: n.folder,
    tags_json: n.tags_json,
    active: i === active,
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
          <div style={{ padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
            {folders.length === 0 && <div style={ns.emptySide}>No folders yet</div>}
            {folders.map((f, i) => (
              <button key={i} style={{ ...ns.folderButton, background: f.active ? 'var(--bg-2)' : 'transparent', color: f.active ? 'var(--fg-0)' : 'var(--fg-2)' }}>
                <Icon.Folder size={13}/>
                <span style={{ flex: 1, textAlign: 'left' }}>{f.name}</span>
                <span style={{ fontSize: 10.5, color: 'var(--fg-3)' }} className="mono">{f.count}</span>
              </button>
            ))}
          </div>
        </aside>

        <section style={ns.list}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--line-soft)' }}>
            <div style={{ fontSize: 13, color: 'var(--fg-0)', fontWeight: 500 }}>{(folders[0] && folders[0].name) || 'All notes'}</div>
            <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2 }}>{notes.length} note{notes.length === 1 ? '' : 's'} sorted by recent</div>
            {status && <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 6 }}>{status}</div>}
          </div>
          <div>
            {notes.length === 0 && <div style={ns.emptyList}>No notes yet. Generate notes from a material or create one manually.</div>}
            {notes.map((n, i) => (
              <button key={n.id} onClick={() => setActive(i)} style={{
                ...ns.noteButton,
                background: n.active ? 'var(--bg-2)' : 'transparent',
                borderLeft: n.active ? '2px solid var(--accent)' : '2px solid transparent',
              }}>
                <div style={{ fontSize: 13, color: 'var(--fg-0)', fontWeight: 500 }}>{n.t}</div>
                <div style={{ fontSize: 11.5, color: 'var(--fg-3)', display: 'flex', gap: 8 }}>
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

  React.useEffect(() => {
    setTitle(current ? current.t : '');
    setBody(current ? current.body_md || '' : '');
    setStatus('');
  }, [current && current.id]);

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
      const r = await window.NoesisAPI.flashcards.generate({ material_id: materialId, count: 4 });
      setStatus(`Created ${r.created} cards.`);
    } catch (e) {
      setStatus('Failed: ' + (e.message || 'error'));
    } finally {
      setBusy(false);
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
            <div style={{ display: 'flex', gap: 8, marginBottom: 18, alignItems: 'center', flexWrap: 'wrap' }}>
              {tags.folder && <span className="chip chip-accent">{tags.folder}</span>}
              {tags.tags.map((t) => <span key={t} className="chip">#{t}</span>)}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--fg-3)' }}>{current.updated ? `Updated ${current.updated}` : ''}</span>
            </div>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} style={ns.titleInput}/>
            <textarea className="input" value={body} onChange={e => setBody(e.target.value)} style={ns.bodyInput} placeholder="Write your note..." />
            <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center' }}>
              <button className="btn btn-accent" disabled={busy || !title.trim()} onClick={save}>{status === 'Saving...' ? 'Saving...' : 'Save'}</button>
              <button className="btn btn-ghost" disabled={busy} onClick={remove} style={{ color: 'var(--err)' }}>{status === 'Deleting...' ? 'Deleting...' : 'Delete'}</button>
              {materialId && <button className="btn btn-ghost" disabled={busy} onClick={generateCards} style={{ marginLeft: 'auto' }}><Icon.Cards size={12}/> {status === 'Generating flashcards...' ? 'Generating flashcards...' : 'Generate 4 cards'}</button>}
            </div>
            {status && <div style={{ marginTop: 12, fontSize: 11, color: 'var(--fg-3)' }}>{status}</div>}
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
  sideHead: { padding: '16px 14px 8px', fontSize: 10.5, color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase' },
  emptySide: { padding: '8px 10px', fontSize: 12, color: 'var(--fg-3)' },
  emptyList: { padding: 18, fontSize: 12, color: 'var(--fg-3)' },
  folderButton: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 'var(--r-sm)', fontSize: 12.5 },
  noteButton: { display: 'flex', flexDirection: 'column', gap: 4, padding: '14px 18px', borderBottom: '1px solid var(--line-soft)', textAlign: 'left', width: '100%' },
  preview: { fontSize: 11.5, color: 'var(--fg-2)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  emptyEditor: { minHeight: '60vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' },
  emptyTitle: { fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 300, margin: '16px 0 8px' },
  emptyText: { fontSize: 13, color: 'var(--fg-3)', margin: 0 },
  titleInput: { width: '100%', fontFamily: 'var(--font-display)', fontSize: 32, marginBottom: 14 },
  bodyInput: { width: '100%', minHeight: 420, resize: 'vertical', fontSize: 14.5, lineHeight: 1.7 },
};

window.Notes = Notes;

const Flashcards = ({ onNav }) => {
  const Icon = window.Icon;
  const [i, setI] = React.useState(0);
  const [flipped, setFlipped] = React.useState(false);
  const [cards, setCards] = React.useState([]);
  const [error, setError] = React.useState('');
  const [reviewing, setReviewing] = React.useState(false);
  const [counts, setCounts] = React.useState({ easy: 0, hard: 0, skipped: 0 });

  const refresh = React.useCallback(() => window.NoesisAPI.flashcards.due()
    .then(d => { setCards(d.cards || []); setError(''); })
    .catch(e => setError(e.message || 'Failed to load cards')), []);

  React.useEffect(() => { refresh(); }, [refresh]);

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

  return (
    <div style={{ background: 'var(--bg-0)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <window.Topbar title={hasCards ? `Flashcards - ${c.deck || 'Review'}` : 'Flashcards'} crumbs={['Review']}
        right={<span style={{ fontSize: 11, color: 'var(--fg-3)' }} className="mono">{hasCards ? `${i + 1} / ${cards.length}` : '0 / 0'}</span>}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 28px', borderBottom: '1px solid var(--line-soft)' }}>
          <div style={{ display: 'flex', gap: 3 }}>
            {(hasCards ? cards : [0]).map((_, k) => (
              <div key={k} style={{ flex: 1, height: 2, borderRadius: 1, background: k < i ? 'var(--ok)' : k === i ? 'var(--accent)' : 'var(--line)' }}/>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--fg-3)' }} className="mono">
            <span>{counts.easy} easy | {counts.hard} hard | {counts.skipped} again</span>
            <span>{c.topic || c.deck || 'No topic'} {c.difficulty ? `| ${c.difficulty}` : ''}</span>
          </div>
          {reviewing && <div style={{ marginTop: 8, fontSize: 11, color: 'var(--fg-3)' }}>Saving review...</div>}
          {error && <div style={{ marginTop: 8, fontSize: 11, color: 'var(--err)' }}>{error}</div>}
        </div>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <div style={{ width: '100%', maxWidth: 640 }}>
            <div onClick={() => hasCards && setFlipped(!flipped)} style={{ ...fc.card, transform: flipped ? 'rotateY(180deg)' : 'rotateY(0)', cursor: hasCards ? 'pointer' : 'default' }}>
              <div style={{ ...fc.face, transform: 'rotateY(0)' }}>
                <div style={fc.faceLabel}>Question</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 300, letterSpacing: '-0.015em', lineHeight: 1.25 }}>{c.question}</div>
                <div style={fc.meta}>{hasCards ? 'Click to flip' : 'Open Materials to generate cards from real content.'}</div>
              </div>
              <div style={{ ...fc.face, transform: 'rotateY(180deg)', background: 'var(--bg-2)' }}>
                <div style={{ ...fc.faceLabel, color: 'var(--accent)' }}>Answer</div>
                <div style={{ fontSize: 17, lineHeight: 1.55, color: 'var(--fg-0)' }}>{c.answer}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 32, justifyContent: 'center' }}>
              {[
                { l: 'Again', sub: '< 1m', color: 'var(--err)', key: '1', rating: 1 },
                { l: 'Hard', sub: '10m', color: 'var(--warn)', key: '2', rating: 2 },
                { l: 'Good', sub: '3 days', color: 'var(--accent)', key: '3', rating: 3 },
                { l: 'Easy', sub: '2 weeks', color: 'var(--ok)', key: '4', rating: 4 },
              ].map(b => (
                <button key={b.l} onClick={() => rate(b.rating)} disabled={!hasCards || reviewing} style={{ ...fc.rateBtn, opacity: hasCards && !reviewing ? 1 : 0.45 }}>
                  <span style={{ ...fc.keyHint, color: b.color }} className="mono">{b.key}</span>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--fg-0)', fontWeight: 500 }}>{b.l}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--fg-3)', marginTop: 2 }} className="mono">{b.sub}</div>
                  </div>
                </button>
              ))}
            </div>
            {!hasCards && <button className="btn btn-accent" onClick={() => onNav('materials')} style={{ margin: '24px auto 0', display: 'flex' }}><Icon.Folder size={12}/> Open Materials</button>}
          </div>
        </div>
      </div>
    </div>
  );
};

const fc = {
  card: { position: 'relative', minHeight: 340, transition: 'transform 600ms var(--ease-in-out)', transformStyle: 'preserve-3d' },
  face: {
    position: 'absolute', inset: 0, padding: 40, borderRadius: 'var(--r-xl)',
    background: 'var(--bg-1)', border: '1px solid var(--line)', backfaceVisibility: 'hidden',
    boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column',
  },
  faceLabel: { fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 20 },
  meta: { marginTop: 'auto', fontSize: 11, color: 'var(--fg-3)' },
  rateBtn: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 'var(--r-md)', border: '1px solid var(--line)', background: 'var(--bg-1)', minWidth: 120, transition: 'all 160ms var(--ease-out)' },
  keyHint: { width: 20, height: 20, borderRadius: 4, background: 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 },
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
    } catch (e) {
      setError(e.message || 'Failed to start quiz');
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
    } catch (e) {
      setError(e.message || 'Answer failed');
    } finally {
      setBusy(false); setAction('');
    }
  };

  const finishQuiz = async () => {
    if (!attemptId || busy) return;
    setBusy(true); setAction('finish'); setError('');
    try {
      if (cur && selected != null && !submitted) {
        const res = await window.NoesisAPI.quizzes.answer(attemptId, { question_id: cur.id, selected_idx: selected });
        setFeedback(res);
        setSubmitted(true);
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 18 }}>
              {library.length === 0 && <div style={qz.empty}>No quizzes yet. Open a ready material and generate a practice quiz.</div>}
              {library.map(q => (
                <button key={q.id} disabled={busy} onClick={() => startQuiz(q.id)} style={{ ...qz.quizRow, opacity: busy ? 0.65 : 1 }}>
                  <Icon.Target size={15} style={{ color: 'var(--accent)' }}/>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontSize: 13.5, color: 'var(--fg-0)', fontWeight: 500 }}>{q.title}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--fg-3)', marginTop: 2 }}>{q.question_count} questions | {q.difficulty}</div>
                  </div>
                  <span className="chip">{q.last_score == null ? 'Not attempted' : `${q.last_score}%`}</span>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
              {wrong.length === 0 && <div style={qz.empty}>No wrong answers stored yet.</div>}
              {wrong.map((w, i) => (
                <div key={`${w.attempt_id}-${w.question_id}-${i}`} style={qz.wrongRow}>
                  <div style={{ fontSize: 13, color: 'var(--fg-0)', marginBottom: 8 }}>{w.question}</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-2)' }}>Correct: {w.options[w.correct_idx]}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--fg-3)', marginTop: 6 }}>{[w.topic || w.concept, w.difficulty].filter(Boolean).join(' | ')}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--fg-3)', marginTop: 6 }}>{w.explanation || 'Review the source material for this concept.'}</div>
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
        right={<><button className="btn btn-ghost" onClick={backToLibrary}>Quiz library</button><span style={{ fontSize: 11.5, color: 'var(--fg-3)' }}>Question {questions.length ? qi + 1 : 0} / {questions.length}</span></>}
      />
      <div style={{ maxWidth: 780, margin: '0 auto', padding: '40px 28px' }}>
        {error && <div style={qz.error}>{error}</div>}
        <div style={{ display: 'flex', gap: 4, marginBottom: 36 }}>
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', width: 16 }}>{String.fromCharCode(65 + idx)}</span>
                <span style={{ flex: 1, fontSize: 14, color: 'var(--fg-0)' }}>{label}</span>
                {isCorrect && <Icon.Check size={13} style={{ color: 'var(--ok)' }}/>}
                {isWrong && <Icon.X size={13} style={{ color: 'var(--err)' }}/>}
              </button>
            );
          })}
        </div>

        {submitted && feedback && (
          <div style={qz.feedback}>
            <div style={{ fontSize: 12, color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>{feedback.is_correct ? 'Correct' : 'Review this'}</div>
            <div style={{ fontSize: 13.5, color: 'var(--fg-1)', lineHeight: 1.6 }}>{feedback.explanation || 'Review the material and try again.'}</div>
          </div>
        )}

        {finalScore && (
          <div style={qz.feedback}>
            <div style={{ fontSize: 12, color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Saved attempt</div>
            <div style={{ fontSize: 13.5, color: 'var(--fg-1)', lineHeight: 1.6 }}>
              Score saved: {finalScore.score}% with {finalScore.correct}/{finalScore.total} correct.
              {finalScore.wrong && finalScore.wrong.length ? ` ${finalScore.wrong.length} wrong answer${finalScore.wrong.length === 1 ? '' : 's'} stored for review.` : ' No wrong answers to review.'}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 36 }}>
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
  page: { padding: 28, maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr', gap: 14 },
  section: { padding: 22 },
  sectionHead: { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' },
  eyebrow: { fontSize: 11, color: 'var(--accent)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 },
  title: { fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 300, margin: 0 },
  subTitle: { fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 300, margin: 0 },
  muted: { fontSize: 12, color: 'var(--fg-3)' },
  empty: { padding: 18, color: 'var(--fg-3)', fontSize: 12.5, border: '1px dashed var(--line-strong)', borderRadius: 'var(--r-md)' },
  error: { marginBottom: 12, color: 'var(--err)', fontSize: 12 },
  quizRow: { display: 'flex', alignItems: 'center', gap: 12, padding: 14, border: '1px solid var(--line)', borderRadius: 'var(--r-md)', background: 'var(--bg-1)' },
  wrongRow: { padding: 14, border: '1px solid var(--line)', borderRadius: 'var(--r-md)', background: 'var(--bg-1)' },
  questionTitle: { fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 300, letterSpacing: '-0.015em', margin: '0 0 18px', lineHeight: 1.3 },
  option: { display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 16px', borderRadius: 'var(--r-md)', border: '1px solid', textAlign: 'left', transition: 'all 160ms var(--ease-out)' },
  feedback: { marginTop: 24, padding: 18, borderRadius: 'var(--r-lg)', background: 'var(--bg-1)', border: '1px solid var(--line)' },
};

window.Quiz = Quiz;
