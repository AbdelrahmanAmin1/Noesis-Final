// AI Tutor workspace — a learning workspace, NOT a chat app.
// Three-column: concept timeline · active lesson · thinking trace / notes
const Tutor = ({ onNav }) => {
  const Icon = window.Icon;
  const [step, setStep] = React.useState(0);
  const [mode, setMode] = React.useState('socratic');
  const [session, setSession] = React.useState(null);
  const [picked, setPicked] = React.useState({});
  const [feedbacks, setFeedbacks] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [action, setAction] = React.useState('');
  const [status, setStatus] = React.useState('');

  React.useEffect(() => {
    const concept = sessionStorage.getItem('noesis.tutorConcept') || 'Object-Oriented Programming basics';
    const matId = parseInt(sessionStorage.getItem('noesis.tutorMaterialId') || '0', 10) || null;
    setBusy(true); setAction('start'); setError(''); setStatus('Starting tutor session...');
    window.NoesisAPI.tutor.start({ material_id: matId, concept, mode })
      .then(s => { setSession(s); setStep(0); setStatus('Tutor session ready.'); })
      .catch(e => setError(e.message || 'failed to start'))
      .finally(() => { setBusy(false); setAction(''); });
  }, [mode]);

  const lesson = {
    title: session ? session.concept : 'Starting tutor…',
    concept: session ? session.concept : '—',
    steps: session && session.plan ? session.plan.steps : [
      { t: 'Warm-up', q: '...' }, { t: 'Intuition', q: '...' },
      { t: 'The trick', q: '...' }, { t: 'Formalize', q: '...' }, { t: 'Apply', q: '...' },
    ],
  };
  const isLastStep = step >= Math.max(0, lesson.steps.length - 1);

  const submitChoice = async (i) => {
    if (!session || picked[step] !== undefined || busy) return;
    setPicked({ ...picked, [step]: i });
    setAction('answer'); setError('');
    try {
      const res = await window.NoesisAPI.tutor.answer(session.session_id, step, { choice: i });
      setFeedbacks({ ...feedbacks, [step]: res });
    } catch (e) { setError(e.message || 'answer failed'); }
    finally { setAction(''); }
  };

  // Live elapsed timer, anchored to the session start.
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const startedAt = session && session.started_at ? new Date(session.started_at).getTime() : now;
  const elapsedS = Math.max(0, Math.floor((now - startedAt) / 1000));
  const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // Real notebook from the session (loaded on demand).
  const [notebook, setNotebook] = React.useState([]);
  const [noteText, setNoteText] = React.useState('');
  const refreshNotes = React.useCallback(() => {
    if (!session) return;
    window.NoesisAPI.tutor.get(session.session_id)
      .then(d => setNotebook(d.notes || []))
      .catch(() => {});
  }, [session]);
  React.useEffect(() => { refreshNotes(); }, [refreshNotes, feedbacks]);

  const addManualNote = async (e) => {
    if (e && e.key && e.key !== 'Enter') return;
    if (!session || !noteText.trim()) return;
    setAction('note'); setStatus('Saving note...');
    try {
      await window.NoesisAPI.tutor.addNote(session.session_id, { body: noteText.trim(), flashcard_worthy: false });
      setNoteText('');
      refreshNotes();
      setStatus('Note saved.');
    } catch (e) { setError(e.message || 'Note failed'); }
    finally { setAction(''); }
  };

  const finishTutor = async () => {
    if (!session || busy) return;
    setBusy(true); setAction('finish'); setError(''); setStatus('Finishing session...');
    try {
      await window.NoesisAPI.tutor.finish(session.session_id);
      setStatus('Session saved. Returning to dashboard...');
      setTimeout(() => onNav('dashboard'), 350);
    } catch (e) {
      setError(e.message || 'Finish failed');
      setStatus('');
      setBusy(false);
      setAction('');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <window.Topbar
        title={lesson.title}
        crumbs={['AI Tutor', 'Data Structures']}
        right={<>
          <div style={{ display: 'flex', gap: 2, padding: 2, background: 'var(--bg-2)', borderRadius: 'var(--r-md)', border: '1px solid var(--line)' }}>
            {[
              { id: 'socratic', label: 'Socratic', icon: 'Brain' },
              { id: 'explain', label: 'Explain', icon: 'Lightbulb' },
              { id: 'example', label: 'Example', icon: 'Code' },
            ].map(m => {
              const C = Icon[m.icon];
              return (
                <button key={m.id} onClick={() => setMode(m.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 10px', fontSize: 11.5,
                  background: mode === m.id ? 'var(--bg-0)' : 'transparent',
                  color: mode === m.id ? 'var(--fg-0)' : 'var(--fg-2)',
                  borderRadius: 6,
                }}>
                  <C size={12}/>{m.label}
                </button>
              );
            })}
          </div>
          <button className="btn btn-ghost"><Icon.Pause size={11}/> Pause</button>
        </>}
      />

      <div style={tu.layout}>
        {/* Left: lesson timeline */}
        <aside style={tu.timeline}>
          <div style={{ padding: '20px 20px 10px' }}>
            <div style={{ fontSize: 10.5, color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Session plan</div>
            <div style={{ fontSize: 13, color: 'var(--fg-1)', marginTop: 6 }}>{lesson.concept}</div>
          </div>
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 2, position: 'relative' }}>
            <div style={{ position: 'absolute', left: 27, top: 18, bottom: 18, width: 1, background: 'var(--line)' }}/>
            {lesson.steps.map((s, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <button key={i} onClick={() => setStep(i)} style={{
                  display: 'flex', gap: 12, alignItems: 'flex-start',
                  padding: '10px 10px', borderRadius: 'var(--r-sm)',
                  background: active ? 'var(--bg-2)' : 'transparent',
                  textAlign: 'left', position: 'relative',
                }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 10, flexShrink: 0,
                    border: `1.5px solid ${done ? 'var(--accent)' : active ? 'var(--accent)' : 'var(--line-strong)'}`,
                    background: done ? 'var(--accent)' : active ? 'var(--bg-0)' : 'var(--bg-1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: done ? 'var(--bg-0)' : 'var(--accent)',
                    zIndex: 1,
                    marginTop: 2,
                  }}>
                    {done ? <Icon.Check size={11}/> : active ? <div style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--accent)', animation: 'pulse-soft 1.8s infinite' }}/> : <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>{i + 1}</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
                    <div style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: active ? 'var(--accent)' : 'var(--fg-3)' }}>{s.t}</div>
                    <div style={{ fontSize: 12.5, color: active ? 'var(--fg-0)' : done ? 'var(--fg-2)' : 'var(--fg-3)', marginTop: 3, lineHeight: 1.4 }}>{s.q}</div>
                  </div>
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 'auto', padding: 14, borderTop: '1px solid var(--line)' }}>
            <div style={{ fontSize: 11, color: 'var(--fg-3)', marginBottom: 6 }}>Session time</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 300 }}>{fmtTime(elapsedS)}</span>
              <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>/ 20:00</span>
            </div>
          </div>
        </aside>

        {/* Center: active lesson */}
        <main style={tu.workspace}>
          <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px 40px' }}>
            <div style={{ fontSize: 11, color: 'var(--accent)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 10 }}>
              Step {String(step + 1).padStart(2, '0')}{lesson.steps[step] ? ` · ${lesson.steps[step].t}` : ''}
            </div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 300, letterSpacing: '-0.02em', margin: '0 0 18px', lineHeight: 1.2 }}>
              {lesson.steps[step] ? lesson.steps[step].q : (busy ? 'Preparing your session…' : 'Ready when you are.')}
            </h1>

            {/* Tutor prompt */}
            <div style={{ marginTop: 28 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={tu.tutorAvatar}><Icon.Sparkle size={13} style={{ color: 'var(--accent)' }}/></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, color: 'var(--fg-0)', lineHeight: 1.65 }}>
                    {lesson.steps[step] ? lesson.steps[step].q : 'Choose an answer to begin.'}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 18, paddingLeft: 34 }}>
                <div style={{ fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Pick what feels right</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(lesson.steps[step] && lesson.steps[step].options ? lesson.steps[step].options : []).map((label, i) => {
                    const fb = feedbacks[step];
                    const correct = fb && i === fb.correct_idx;
                    const wrong = fb && picked[step] === i && !correct;
                    return (
                      <button key={i} onClick={() => submitChoice(i)} disabled={busy || action === 'answer' || picked[step] !== undefined} style={{
                        ...tu.choice,
                        borderColor: correct ? 'var(--accent-soft)' : (wrong ? 'var(--err)' : 'var(--line)'),
                        background: correct ? 'var(--accent-glow)' : (wrong ? 'color-mix(in oklab, var(--err) 10%, transparent)' : 'var(--bg-1)'),
                      }}>
                        <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', width: 14 }}>{String.fromCharCode(65 + i)}</span>
                        <span style={{ flex: 1, fontSize: 13, color: 'var(--fg-0)' }}>{label}</span>
                        {correct && <Icon.Check size={13} style={{ color: 'var(--accent)' }}/>}
                      </button>
                    );
                  })}
                </div>

                {feedbacks[step] && (
                  <div style={tu.feedback}>
                    <div style={{ fontSize: 11, color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>{feedbacks[step].correct ? 'Why it works' : 'Hint'}</div>
                    <div style={{ fontSize: 13, color: 'var(--fg-1)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                      {feedbacks[step].feedback || feedbacks[step].explanation}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ marginTop: 24, display: 'flex', gap: 10, paddingLeft: 34 }}>
                <button className="btn btn-accent" disabled={busy || action === 'answer'} onClick={() => {
                  if (!isLastStep) setStep(Math.min(step + 1, lesson.steps.length - 1));
                  else finishTutor();
                }}>
                  {action === 'finish' ? <>Finishing... <Icon.Check size={12}/></> : !isLastStep ? <>Continue <Icon.ArrowRight size={12}/></> : <>Finish <Icon.Check size={12}/></>}
                </button>
                <button className="btn btn-bare" onClick={async () => {
                  if (!session || action === 'note') return;
                  setAction('note'); setStatus('Saving note...');
                  const body = `Step ${step + 1} note on ${session.concept}: ${(lesson.steps[step] && lesson.steps[step].q) || ''}`;
                  try { await window.NoesisAPI.tutor.addNote(session.session_id, { body, flashcard_worthy: true }); setStatus('Note saved.'); refreshNotes(); } catch (e) { setError(e.message || 'Note failed'); }
                  finally { setAction(''); }
                }} disabled={busy || action === 'note'}>
                  <Icon.Bookmark size={12}/> {action === 'note' ? 'Saving...' : 'Save to notes'}
                </button>
              </div>
              {status && <div style={{ marginTop: 12, paddingLeft: 34, color: status.includes('failed') ? 'var(--err)' : 'var(--fg-3)', fontSize: 12 }}>{status}</div>}
              {error && <div style={{ marginTop: 12, paddingLeft: 34, color: 'var(--err)', fontSize: 12 }}>{error}</div>}
            </div>

          </div>
        </main>

        {/* Right: thinking trace + notes */}
        <aside style={tu.rail}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', gap: 2, padding: 2, background: 'var(--bg-2)', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)' }}>
              {['Trace', 'Notes', 'Sources'].map((t, i) => (
                <button key={t} style={{
                  flex: 1, padding: '5px 8px', fontSize: 11.5,
                  background: i === 1 ? 'var(--bg-0)' : 'transparent',
                  color: i === 1 ? 'var(--fg-0)' : 'var(--fg-2)',
                  borderRadius: 4,
                }}>{t}</button>
              ))}
            </div>
          </div>

          <div style={{ padding: 18, overflow: 'auto', flex: 1 }}>
            <div style={{ fontSize: 10.5, color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Your notebook</div>

            {notebook.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--fg-3)', marginBottom: 12 }}>
                No notes yet. Save a note from the lesson area or add one below.
              </div>
            )}

            {notebook.map((n) => (
              <div key={n.id} style={{ ...tu.noteEntry, ...(n.flashcard_worthy ? { borderLeft: '2px solid var(--accent)', paddingLeft: 10 } : {}) }}>
                <div className="mono" style={{ fontSize: 10, color: n.flashcard_worthy ? 'var(--accent)' : 'var(--fg-3)', marginBottom: 4 }}>
                  {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--fg-1)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{n.body}</div>
                {n.flashcard_worthy ? (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <span className="chip chip-accent">flashcard-worthy</span>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div style={{ padding: 14, borderTop: '1px solid var(--line)', display: 'flex', gap: 8 }}>
            <input className="input" placeholder="Add a note (Enter to save)…" value={noteText}
                   onChange={(e) => setNoteText(e.target.value)} onKeyDown={addManualNote}
                   style={{ flex: 1, fontSize: 12.5 }}/>
            <button className="btn btn-bare" style={{ padding: 8 }} onClick={() => addManualNote()}><Icon.Send size={14}/></button>
          </div>
        </aside>
      </div>
    </div>
  );
};

const tu = {
  layout: { display: 'grid', gridTemplateColumns: '280px 1fr 340px', flex: 1, minHeight: 'calc(100vh - 57px)' },
  timeline: { borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', background: 'var(--bg-0)' },
  workspace: { overflow: 'auto', background: 'var(--bg-0)' },
  rail: { borderLeft: '1px solid var(--line)', display: 'flex', flexDirection: 'column', background: 'var(--bg-0)' },
  vizCard: {
    padding: 20, borderRadius: 'var(--r-lg)',
    background: 'var(--bg-1)', border: '1px solid var(--line)',
    marginTop: 20,
  },
  tutorAvatar: {
    width: 28, height: 28, borderRadius: 8,
    background: 'var(--accent-glow)', border: '1px solid var(--accent-soft)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  choice: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '12px 14px', borderRadius: 'var(--r-md)',
    border: '1px solid',
    textAlign: 'left',
    transition: 'all 160ms var(--ease-out)',
  },
  feedback: {
    marginTop: 16, padding: 14,
    borderRadius: 'var(--r-md)',
    background: 'var(--bg-1)', border: '1px solid var(--line)',
    borderLeft: '2px solid var(--accent)',
  },
  code: { fontFamily: 'var(--font-mono)', fontSize: 12, background: 'var(--bg-2)', padding: '1px 5px', borderRadius: 3, color: 'var(--fg-0)' },
  sandbox: { borderRadius: 'var(--r-md)', background: 'var(--bg-1)', border: '1px solid var(--line)', overflow: 'hidden' },
  pre: { fontFamily: 'var(--font-mono)', fontSize: 12.5, padding: 18, margin: 0, lineHeight: 1.65, color: 'var(--fg-0)' },
  noteEntry: { marginBottom: 16 },
  addNote: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '8px 10px', borderRadius: 'var(--r-sm)',
    color: 'var(--fg-3)', fontSize: 12,
    width: '100%',
    border: '1px dashed var(--line-strong)',
    justifyContent: 'center',
    marginTop: 4,
  },
};

window.Tutor = Tutor;
