// Notes workspace, Flashcards, Quiz
const Notes = ({ onNav }) => {
  const Icon = window.Icon;
  const [data, setData] = React.useState({ notes: [], folders: [] });
  const [active, setActive] = React.useState(0);
  React.useEffect(() => { window.NoesisAPI.notes.list().then(setData).catch(() => {}); }, []);
  const folders = (data.folders || []).map((f, i) => ({ name: f.folder, count: f.count, active: i === 0 }));
  const notes = (data.notes || []).map((n, i) => ({
    id: n.id,
    t: n.title,
    updated: n.updated_at ? new Date(n.updated_at).toLocaleString() : '',
    preview: (n.body_md || '').slice(0, 120),
    body_md: n.body_md,
    tag: n.folder,
    active: i === active,
  }));
  const current = notes[active] || null;

  return (
    <div>
      <window.Topbar title="Notes" crumbs={['Workspace']}
        right={<><button className="btn btn-ghost"><Icon.Search size={12}/> Search notes</button><button className="btn btn-accent"><Icon.Plus size={12}/> New note</button></>}
      />
      <div style={ns.layout}>
        <aside style={ns.folders}>
          <div style={{ padding: '16px 14px 8px', fontSize: 10.5, color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Folders</div>
          <div style={{ padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
            {folders.map((f, i) => (
              <button key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 'var(--r-sm)',
                background: f.active ? 'var(--bg-2)' : 'transparent',
                color: f.active ? 'var(--fg-0)' : 'var(--fg-2)', fontSize: 12.5,
              }}>
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
            <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2 }}>{notes.length} note{notes.length === 1 ? '' : 's'} · sorted by recent</div>
          </div>
          <div>
            {notes.length === 0 && <div style={{ padding: 18, fontSize: 12, color: 'var(--fg-3)' }}>No notes yet. Generate from a material's "Summary notes" button.</div>}
            {notes.map((n, i) => (
              <button key={i} onClick={() => setActive(i)} style={{
                display: 'flex', flexDirection: 'column', gap: 4,
                padding: '14px 18px', borderBottom: '1px solid var(--line-soft)',
                textAlign: 'left', width: '100%',
                background: n.active ? 'var(--bg-2)' : 'transparent',
                borderLeft: n.active ? '2px solid var(--accent)' : '2px solid transparent',
              }}>
                <div style={{ fontSize: 13, color: 'var(--fg-0)', fontWeight: 500 }}>{n.t}</div>
                <div style={{ fontSize: 11.5, color: 'var(--fg-3)', display: 'flex', gap: 8 }}>
                  <span>{n.updated}</span><span>·</span><span>{n.tag}</span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--fg-2)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.preview}</div>
              </button>
            ))}
          </div>
        </section>

        <NotesEditor current={current} />
      </div>
    </div>
  );
};

const NotesEditor = ({ current }) => {
  const Icon = window.Icon;
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const tags = React.useMemo(() => {
    const raw = current && current.tag ? current.tag : null;
    let parsed = [];
    try { parsed = current && current.tags_json ? JSON.parse(current.tags_json) : []; } catch (_) {}
    return { folder: raw, tags: parsed };
  }, [current]);
  const updated = current && current.updated ? current.updated : '';
  const materialId = current && current.material_id ? current.material_id : null;

  const generateCards = async () => {
    if (!materialId) return;
    setBusy(true); setStatus('Generating flashcards…');
    try {
      const r = await window.NoesisAPI.flashcards.generate({ material_id: materialId, count: 4 });
      setStatus(`Created ${r.created} cards.`);
    } catch (e) { setStatus('Failed: ' + (e.message || 'error')); }
    finally { setBusy(false); }
  };

  return (
    <main style={ns.editor}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 36px' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, alignItems: 'center', flexWrap: 'wrap' }}>
          {tags.folder && <span className="chip chip-accent">{tags.folder}</span>}
          {tags.tags.map((t) => <span key={t} className="chip">#{t}</span>)}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--fg-3)' }}>{updated ? `Updated ${updated}` : '—'}</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 40, fontWeight: 300, letterSpacing: '-0.02em', margin: '0 0 24px' }}>
          {current ? current.t : 'Pick a note to read'}
        </h1>
        <div style={{ fontSize: 15, lineHeight: 1.75, color: 'var(--fg-1)' }}>
          <p style={{ whiteSpace: 'pre-wrap' }}>{current ? current.body_md : 'Generate notes from any material to see them here.'}</p>
        </div>
        {materialId ? (
          <div style={{ marginTop: 32, padding: '14px 16px', background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Icon.Sparkle size={14} style={{ color: 'var(--accent)' }}/>
            <span style={{ fontSize: 12.5, color: 'var(--fg-1)' }}>{status || 'Want me to generate flashcards from this note?'}</span>
            <button className="btn btn-ghost" style={{ marginLeft: 'auto', fontSize: 11.5 }} disabled={busy} onClick={generateCards}>{busy ? 'Working…' : 'Yes, 4 cards'}</button>
          </div>
        ) : null}
      </div>
    </main>
  );
};

const ns = {
  layout: { display: 'grid', gridTemplateColumns: '220px 320px 1fr', minHeight: 'calc(100vh - 57px)' },
  folders: { borderRight: '1px solid var(--line)', padding: '8px 0', background: 'var(--bg-0)' },
  list: { borderRight: '1px solid var(--line)', background: 'var(--bg-0)', overflow: 'auto' },
  editor: { background: 'var(--bg-0)', overflow: 'auto' },
  h2: { fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, margin: '28px 0 10px', color: 'var(--fg-0)', letterSpacing: '-0.01em' },
  ul: { margin: '0 0 16px', paddingLeft: 20 },
  pre: { fontFamily: 'var(--font-mono)', fontSize: 12, background: 'var(--bg-1)', border: '1px solid var(--line)', padding: 16, borderRadius: 'var(--r-md)', overflow: 'auto', color: 'var(--fg-1)', margin: '14px 0' },
  insetQuote: { display: 'flex', gap: 10, padding: 14, background: 'var(--bg-1)', borderLeft: '2px solid var(--accent)', borderRadius: 'var(--r-sm)', margin: '16px 0', fontSize: 13 },
};

window.Notes = Notes;

// Flashcards
const Flashcards = ({ onNav }) => {
  const Icon = window.Icon;
  const [i, setI] = React.useState(0);
  const [flipped, setFlipped] = React.useState(false);
  const [cards, setCards] = React.useState([]);
  const [counts, setCounts] = React.useState({ easy: 0, hard: 0, skipped: 0 });
  const refresh = React.useCallback(() => window.NoesisAPI.flashcards.due()
    .then(d => setCards(d.cards || []))
    .catch(() => {}), []);
  React.useEffect(() => { refresh(); }, [refresh]);
  const c = cards[i] || { question: 'No cards due. Generate some from a material.', answer: 'Open Materials → Flashcards.', deck: '—' };
  const rate = async (rating) => {
    if (!cards[i]) return;
    try { await window.NoesisAPI.flashcards.review(cards[i].id, rating); } catch (_) {}
    setCounts(prev => ({
      easy: prev.easy + (rating >= 3 ? 1 : 0),
      hard: prev.hard + (rating === 2 ? 1 : 0),
      skipped: prev.skipped + (rating === 1 ? 1 : 0),
    }));
    setFlipped(false);
    if (i + 1 >= cards.length) refresh().then(() => setI(0));
    else setI(i + 1);
  };

  return (
    <div style={{ background: 'var(--bg-0)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <window.Topbar title={cards.length ? `Flashcards · ${c.deck || 'Review'}` : 'Flashcards'} crumbs={['Review']}
        right={<><span style={{ fontSize: 11, color: 'var(--fg-3)' }} className="mono">{cards.length ? `${i + 1} / ${cards.length}` : '0 / 0'}</span></>}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Progress */}
        <div style={{ padding: '14px 28px', borderBottom: '1px solid var(--line-soft)' }}>
          <div style={{ display: 'flex', gap: 3 }}>
            {(cards.length ? cards : [0]).map((_, k) => (
              <div key={k} style={{ flex: 1, height: 2, borderRadius: 1, background: k < i ? 'var(--ok)' : k === i ? 'var(--accent)' : 'var(--line)' }}/>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--fg-3)' }} className="mono">
            <span>{counts.easy} easy · {counts.hard} hard · {counts.skipped} skipped</span>
            <span>Deck: {c.deck || '—'}</span>
          </div>
        </div>

        {/* Card */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <div style={{ width: '100%', maxWidth: 640 }}>
            <div onClick={() => setFlipped(!flipped)} style={{
              ...fc.card,
              transform: flipped ? 'rotateY(180deg)' : 'rotateY(0)',
            }}>
              <div style={{ ...fc.face, transform: 'rotateY(0)' }}>
                <div style={{ fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 20 }}>Question</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 300, letterSpacing: '-0.015em', lineHeight: 1.25 }}>{c.question}</div>
                <div style={{ marginTop: 40, fontSize: 11, color: 'var(--fg-3)', display: 'flex', alignItems: 'center', gap: 6 }} className="mono">
                  <Icon.Mic size={11}/> <span>SPACE to flip · ↑ dictate</span>
                </div>
              </div>
              <div style={{ ...fc.face, transform: 'rotateY(180deg)', background: 'var(--bg-2)' }}>
                <div style={{ fontSize: 11, color: 'var(--accent)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 20 }}>Answer</div>
                <div style={{ fontSize: 17, lineHeight: 1.55, color: 'var(--fg-0)' }}>{c.answer}</div>
              </div>
            </div>

            {/* Rate confidence */}
            <div style={{ display: 'flex', gap: 8, marginTop: 32, justifyContent: 'center' }}>
              {[
                { l: 'Again', sub: '< 1m', color: 'var(--err)', key: '1', rating: 1 },
                { l: 'Hard', sub: '10m', color: 'var(--warn)', key: '2', rating: 2 },
                { l: 'Good', sub: '3 days', color: 'var(--accent)', key: '3', rating: 3 },
                { l: 'Easy', sub: '2 weeks', color: 'var(--ok)', key: '4', rating: 4 },
              ].map(b => (
                <button key={b.l} onClick={() => rate(b.rating)} style={{
                  ...fc.rateBtn, borderColor: 'var(--line)',
                }}>
                  <span style={{ ...fc.keyHint, color: b.color }} className="mono">{b.key}</span>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--fg-0)', fontWeight: 500 }}>{b.l}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--fg-3)', marginTop: 2 }} className="mono">{b.sub}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const fc = {
  card: {
    position: 'relative', minHeight: 340,
    transition: 'transform 600ms var(--ease-in-out)',
    transformStyle: 'preserve-3d',
    cursor: 'pointer',
  },
  face: {
    position: 'absolute', inset: 0,
    padding: 40, borderRadius: 'var(--r-xl)',
    background: 'var(--bg-1)', border: '1px solid var(--line)',
    backfaceVisibility: 'hidden',
    boxShadow: 'var(--shadow-lg)',
    display: 'flex', flexDirection: 'column',
  },
  rateBtn: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 16px', borderRadius: 'var(--r-md)',
    border: '1px solid',
    background: 'var(--bg-1)',
    minWidth: 120,
    transition: 'all 160ms var(--ease-out)',
  },
  keyHint: {
    width: 20, height: 20, borderRadius: 4,
    background: 'var(--bg-2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11,
  },
};

window.Flashcards = Flashcards;

// Quiz
const Quiz = ({ onNav }) => {
  const Icon = window.Icon;
  const [quiz, setQuiz] = React.useState(null);
  const [questions, setQuestions] = React.useState([]);
  const [qi, setQi] = React.useState(0);
  const [attemptId, setAttemptId] = React.useState(null);
  const [selected, setSelected] = React.useState(null);
  const [submitted, setSubmitted] = React.useState(false);
  const [feedback, setFeedback] = React.useState(null);
  const [finalScore, setFinalScore] = React.useState(null);

  React.useEffect(() => {
    const id = parseInt(sessionStorage.getItem('noesis.quizId') || '0', 10);
    if (!id) { onNav && onNav('materials'); return; }
    window.NoesisAPI.quizzes.get(id).then(d => {
      setQuiz(d.quiz);
      setQuestions(d.questions || []);
      return window.NoesisAPI.quizzes.attempt(id);
    }).then(a => { if (a) setAttemptId(a.attempt_id); }).catch(() => {});
  }, []);

  const cur = questions[qi];
  const submit = async () => {
    if (cur == null || selected == null || !attemptId) return;
    const res = await window.NoesisAPI.quizzes.answer(attemptId, { question_id: cur.id, selected_idx: selected });
    setFeedback(res);
    setSubmitted(true);
  };
  const nextQ = async () => {
    if (qi + 1 >= questions.length) {
      const r = await window.NoesisAPI.quizzes.finish(attemptId);
      setFinalScore(r);
    } else {
      setQi(qi + 1);
      setSelected(null);
      setSubmitted(false);
      setFeedback(null);
    }
  };

  return (
    <div style={{ background: 'var(--bg-0)', minHeight: '100vh' }}>
      <window.Topbar title={quiz ? quiz.title : 'No quiz selected'} crumbs={['Quizzes']}
        right={<>
          <span style={{ fontSize: 11.5, color: 'var(--fg-3)' }}>Question {questions.length ? qi + 1 : 0} / {questions.length}</span>
        </>}
      />
      <div style={{ maxWidth: 780, margin: '0 auto', padding: '40px 28px' }}>
        {/* Progress */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 36 }}>
          {(questions.length ? questions : [0]).map((_, k) => (
            <div key={k} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: k < qi ? 'var(--ok)' : k === qi ? 'var(--accent)' : 'var(--line)',
            }}/>
          ))}
        </div>

        <div style={{ fontSize: 11, color: 'var(--accent)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>
          {cur ? `Question ${String(qi + 1).padStart(2, '0')} · ${cur.concept || ''}` : (finalScore ? 'Quiz complete' : 'Generate a quiz first')}
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 300, letterSpacing: '-0.015em', margin: '0 0 18px', lineHeight: 1.3 }}>
          {cur ? cur.question : (finalScore ? `You scored ${finalScore.score}% (${finalScore.correct}/${finalScore.total})` : 'Open a Material → Practice quiz to begin.')}
        </h1>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(cur ? cur.options : []).map((label, i) => {
            const isSel = selected === i;
            const show = submitted && feedback;
            const isCorrect = show && i === feedback.correct_idx;
            const isWrong = show && isSel && !isCorrect;
            return (
              <button key={i} onClick={() => !submitted && setSelected(i)} style={{
                display: 'flex', alignItems: 'flex-start', gap: 14,
                padding: '14px 16px', borderRadius: 'var(--r-md)',
                border: `1px solid ${isCorrect ? 'var(--ok)' : isWrong ? 'var(--err)' : isSel ? 'var(--accent-soft)' : 'var(--line)'}`,
                background: isCorrect ? 'color-mix(in oklab, var(--ok) 10%, transparent)' : isWrong ? 'color-mix(in oklab, var(--err) 10%, transparent)' : isSel ? 'var(--accent-glow)' : 'var(--bg-1)',
                textAlign: 'left', transition: 'all 160ms var(--ease-out)',
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 11, flexShrink: 0,
                  border: `1.5px solid ${isCorrect ? 'var(--ok)' : isSel ? 'var(--accent)' : 'var(--line-strong)'}`,
                  background: isCorrect ? 'var(--ok)' : isSel ? 'var(--accent)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1,
                  color: 'var(--bg-0)',
                }}>
                  {isCorrect ? <Icon.Check size={11}/> : isWrong ? <Icon.X size={11} style={{ color: '#fff' }}/> : isSel ? <div style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--bg-0)' }}/> : null}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, color: 'var(--fg-0)' }}>{label}</div>
                </div>
                <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>{String.fromCharCode(65 + i)}</span>
              </button>
            );
          })}
        </div>

        {submitted && feedback && (
          <div style={{ marginTop: 24, padding: 18, borderRadius: 'var(--r-lg)', background: 'var(--bg-1)', border: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Icon.Sparkle size={14} style={{ color: 'var(--accent)' }}/>
              <span style={{ fontSize: 12, color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{feedback.is_correct ? 'Correct' : 'Not quite'}</span>
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--fg-1)', lineHeight: 1.6 }}>{feedback.explanation || (feedback.is_correct ? 'Nice work.' : 'Review the material and try again.')}</div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 36 }}>
          <button className="btn btn-bare" disabled><Icon.ArrowLeft size={12}/> Previous</button>
          {!submitted ? (
            <button className="btn btn-accent" onClick={submit} disabled={selected == null || !cur}>Submit <Icon.ArrowRight size={12}/></button>
          ) : (
            <button className="btn btn-accent" onClick={nextQ}>{qi + 1 >= questions.length ? 'Finish' : 'Next'} <Icon.ArrowRight size={12}/></button>
          )}
        </div>
      </div>
    </div>
  );
};

window.Quiz = Quiz;
