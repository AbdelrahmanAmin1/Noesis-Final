// AI Tutor workspace — grounded, structured tutor sessions.
const Tutor = ({ onNav }) => {
  const Icon = window.Icon;
  const [step, setStep] = React.useState(0);
  const [mode, setMode] = React.useState('socratic');
  const [session, setSession] = React.useState(null);
  const [tutorState, setTutorState] = React.useState('material_loading');
  const [status, setStatus] = React.useState('Loading materials...');
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState('');
  const [action, setAction] = React.useState('');
  const [materials, setMaterials] = React.useState([]);
  const [selectedMaterialId, setSelectedMaterialId] = React.useState('');
  const [conceptInput, setConceptInput] = React.useState('');
  const [activeRailTab, setActiveRailTab] = React.useState('Notes');
  const [notebook, setNotebook] = React.useState([]);
  const [noteText, setNoteText] = React.useState('');
  const [answerText, setAnswerText] = React.useState('');
  const [feedback, setFeedback] = React.useState('');
  const [paused, setPaused] = React.useState(false);
  const [pauseStartedAt, setPauseStartedAt] = React.useState(null);
  const [pausedMs, setPausedMs] = React.useState(0);
  const [now, setNow] = React.useState(Date.now());

  const busy = ['starting_session', 'retrieving_context', 'generating_step', 'continuing', 'saving_note'].includes(tutorState) || !!action;
  const steps = session && Array.isArray(session.steps) ? session.steps : [];
  const currentStep = steps[step] || null;
  const sources = session && (session.sources || session.source_chunks || []) || [];
  const trace = session && session.trace || {};

  const isGenericLabel = (value) => {
    const s = String(value || '').trim().toLowerCase();
    return !s || s === 'document' || s === 'file' || s === 'material' || /^chapter\s*\d+$/.test(s) || /^\d+$/.test(s);
  };
  const materialLabel = (m) => {
    const label = (m && (m.display_title || m.title)) || '';
    return isGenericLabel(label) ? `Material #${m && m.id}` : label;
  };

  const setSessionReady = (data) => {
    const next = data && data.session ? data.session : data;
    setSession(next);
    setMode(next.mode || mode);
    setStep(next.currentStepIndex || next.current_step || 0);
    setNotebook(next.notes || []);
    setFeedback('');
    setAnswerText('');
    setTutorState('session_ready');
    setProgress(100);
    setStatus('Tutor session ready.');
    setActiveRailTab('Notes');
    setPaused(false);
    setPauseStartedAt(null);
    setPausedMs(0);
    setNow(Date.now());
  };

  const refreshSession = React.useCallback((id) => {
    if (!id) return Promise.resolve(null);
    return window.NoesisAPI.tutor.get(id).then((d) => {
      setSessionReady(d);
      return d;
    });
  }, []);

  const pollSession = async (sessionId) => {
    for (let i = 0; i < 120; i += 1) {
      const s = await window.NoesisAPI.tutor.status(sessionId);
      setProgress(s.progress || 0);
      setStatus(s.message || 'Preparing tutor session...');
      if (s.status === 'retrieving_context') setTutorState('retrieving_context');
      if (s.status === 'generating_step') setTutorState('generating_step');
      if (s.status === 'failed') throw new Error(s.error || 'Could not start tutor session.');
      if (s.status === 'ready') return refreshSession(sessionId);
      await new Promise(resolve => setTimeout(resolve, 900));
    }
    throw new Error('Tutor session is taking too long. Retry or choose another material.');
  };

  const startSession = async ({ materialId = null, concept = '', nextMode = mode } = {}) => {
    const selected = materialId ? materials.find(m => String(m.id) === String(materialId)) : null;
    const cleanConcept = isGenericLabel(concept) ? '' : String(concept || '').trim();
    setTutorState('starting_session');
    setProgress(8);
    setError('');
    setStatus('Starting tutor session...');
    setSession(null);
    setFeedback('');
    setAnswerText('');
    try {
      if (materialId) {
        sessionStorage.setItem('noesis.tutorMaterialId', String(materialId));
        if (cleanConcept) sessionStorage.setItem('noesis.tutorConcept', cleanConcept);
        else sessionStorage.removeItem('noesis.tutorConcept');
      } else {
        sessionStorage.removeItem('noesis.tutorMaterialId');
        sessionStorage.setItem('noesis.tutorConcept', cleanConcept || 'Object-Oriented Programming basics');
      }
      const res = await window.NoesisAPI.tutor.start({
        material_id: materialId,
        concept: cleanConcept || (selected && materialLabel(selected)) || 'Object-Oriented Programming basics',
        mode: nextMode,
      });
      if (res.status === 'starting' && res.session_id) {
        await pollSession(res.session_id);
      } else {
        setSessionReady(res);
      }
    } catch (e) {
      setTutorState('error');
      setError(e.message || 'Could not start tutor session. Retry or choose another material.');
      setStatus('');
    }
  };

  React.useEffect(() => {
    let alive = true;
    const storedConcept = sessionStorage.getItem('noesis.tutorConcept') || '';
    const storedMatId = parseInt(sessionStorage.getItem('noesis.tutorMaterialId') || '0', 10) || null;
    setConceptInput(isGenericLabel(storedConcept) ? '' : storedConcept);
    window.NoesisAPI.materials.list()
      .then(d => {
        if (!alive) return;
        const ready = (d.materials || []).filter(m => m.status === 'ready');
        setMaterials(ready);
        const stored = ready.find(m => m.id === storedMatId);
        const first = stored || ready[0];
        if (first) {
          setSelectedMaterialId(String(first.id));
          setTutorState('ready_to_start');
          setStatus('Choose a material, then start your tutor session.');
        } else {
          setTutorState('ready_to_start');
          setStatus('Upload a material or start from the core corpus.');
        }
      })
      .catch(e => {
        if (!alive) return;
        setTutorState('error');
        setError(e.message || 'Could not load materials.');
      });
    return () => { alive = false; };
  }, []);

  React.useEffect(() => {
    if (paused) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [paused]);

  const startedAt = session && session.started_at ? new Date(session.started_at).getTime() : now;
  const timerNow = paused && pauseStartedAt ? pauseStartedAt : now;
  const elapsedS = Math.max(0, Math.floor((timerNow - startedAt - pausedMs) / 1000));
  const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const togglePause = () => {
    if (!session) return;
    if (paused) {
      const resumeAt = Date.now();
      setPausedMs(ms => ms + Math.max(0, resumeAt - (pauseStartedAt || resumeAt)));
      setPauseStartedAt(null);
      setPaused(false);
      setNow(resumeAt);
      setStatus('Session resumed.');
      return;
    }
    setPauseStartedAt(Date.now());
    setPaused(true);
    setStatus('Session paused.');
  };

  const changeMode = async (nextMode) => {
    if (nextMode === mode || busy || paused) return;
    if (!session) {
      setMode(nextMode);
      return;
    }
    setAction('mode');
    setError('');
    setStatus('Changing tutor mode...');
    try {
      const res = await window.NoesisAPI.tutor.changeMode(session.sessionId || session.session_id, nextMode);
      setMode(res.mode || nextMode);
      setSession({ ...session, mode: res.mode || nextMode });
      setStatus(`Mode changed to ${res.mode || nextMode}.`);
    } catch (e) {
      setError(e.message || 'Mode change failed');
    } finally {
      setAction('');
    }
  };

  const continueTutor = async (choice = null) => {
    if (!session || busy || paused) return;
    setTutorState('continuing');
    setAction('continue');
    setError('');
    setStatus('Checking your answer and preparing the next step...');
    try {
      const res = await window.NoesisAPI.tutor.continue(session.sessionId || session.session_id, {
        answer: choice == null ? answerText : '',
        choice,
      });
      setFeedback(res.feedback || '');
      setSession({ ...session, steps: res.steps || session.steps, currentStepIndex: res.currentStepIndex, current_step: res.currentStepIndex, trace: res.trace || session.trace });
      setStep(res.currentStepIndex);
      setAnswerText('');
      setTutorState('session_ready');
      setStatus(res.currentStepIndex === step ? 'Try strengthening your answer with the hint.' : 'Next tutor step ready.');
    } catch (e) {
      setTutorState('session_ready');
      setError(e.message || 'Continue failed.');
    } finally {
      setAction('');
    }
  };

  const refreshNotes = React.useCallback(() => {
    if (!session) return;
    window.NoesisAPI.tutor.get(session.sessionId || session.session_id)
      .then(d => setNotebook((d.session && d.session.notes) || d.notes || []))
      .catch(() => {});
  }, [session]);

  const saveNote = async (body, noteKind = 'manual') => {
    if (!session || paused || !String(body || '').trim()) return;
    setTutorState('saving_note');
    setAction('note');
    setStatus('Saving note...');
    try {
      await window.NoesisAPI.tutor.addNote(session.sessionId || session.session_id, {
        body: String(body).trim(),
        flashcard_worthy: noteKind === 'explanation',
        stepId: currentStep && currentStep.id,
        noteKind,
        sourceRefs: currentStep && currentStep.sourceRefs || [],
      });
      setNoteText('');
      refreshNotes();
      setTutorState('session_ready');
      setStatus('Note saved.');
    } catch (e) {
      setTutorState('session_ready');
      setError(e.message || 'Note failed');
    } finally {
      setAction('');
    }
  };

  const addManualNote = async (e) => {
    if (e && e.key && e.key !== 'Enter') return;
    await saveNote(noteText, 'manual');
  };

  const finishTutor = async () => {
    if (!session || busy || paused) return;
    setAction('finish');
    setError('');
    setStatus('Finishing session...');
    try {
      await window.NoesisAPI.tutor.finish(session.sessionId || session.session_id);
      setStatus('Session saved. Returning to dashboard...');
      setTimeout(() => onNav('dashboard'), 350);
    } catch (e) {
      setError(e.message || 'Finish failed');
      setAction('');
    }
  };

  const isLastStep = step >= Math.max(0, steps.length - 1);
  const topTitle = session ? (session.topic || session.concept || 'AI Tutor') : 'AI Tutor';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <window.Topbar
        title={topTitle}
        crumbs={['AI Tutor', session ? (session.sourceTitle || 'Session') : 'Start']}
        right={<>
          <div style={{ display: 'flex', gap: 2, padding: 2, background: 'var(--bg-2)', borderRadius: 'var(--r-md)', border: '1px solid var(--line)' }}>
            {[
              { id: 'socratic', label: 'Socratic', icon: 'Brain' },
              { id: 'explain', label: 'Explain', icon: 'Lightbulb' },
              { id: 'example', label: 'Example', icon: 'Code' },
            ].map(m => {
              const C = Icon[m.icon];
              return (
                <button key={m.id} disabled={busy || paused || action === 'mode'} onClick={() => changeMode(m.id)} style={{
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
          <button className="btn btn-ghost" onClick={togglePause} disabled={!session || busy}>
            {paused ? <Icon.Play size={11}/> : <Icon.Pause size={11}/>} {paused ? 'Resume' : 'Pause'}
          </button>
        </>}
      />

      {!session && (
        <div style={tu.contextBar}>
          <div>
            <div style={{ fontSize: 10.5, color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Tutor source</div>
            <div style={{ fontSize: 13, color: 'var(--fg-1)' }}>
              {tutorState === 'material_loading' ? 'Loading your indexed materials...' : 'Choose a material and Noesis will resolve the real topic.'}
            </div>
          </div>
          <select className="input" value={selectedMaterialId} disabled={busy || !materials.length} onChange={(e) => setSelectedMaterialId(e.target.value)} style={{ width: 300, fontSize: 12.5 }}>
            {!materials.length && <option value="">No ready materials</option>}
            {materials.map(m => <option key={m.id} value={m.id}>{materialLabel(m)}</option>)}
          </select>
          <input className="input" placeholder="Focus topic (optional)" value={conceptInput} onChange={(e) => setConceptInput(e.target.value)} style={{ width: 240, fontSize: 12.5 }}/>
          <button className="btn btn-accent" disabled={busy || !selectedMaterialId} onClick={() => startSession({ materialId: parseInt(selectedMaterialId, 10), concept: conceptInput })}>
            <Icon.Sparkle size={12}/> {busy ? 'Starting...' : 'Start with material'}
          </button>
          <button className="btn btn-ghost" disabled={busy} onClick={() => startSession({ materialId: null, concept: conceptInput || 'Object-Oriented Programming basics' })}>
            Core corpus
          </button>
        </div>
      )}

      {busy && !session && (
        <div style={tu.progressBar}><div style={{ ...tu.progressFill, width: `${Math.max(8, progress)}%` }}/></div>
      )}

      <div style={tu.layout}>
        <aside style={tu.timeline}>
          <div style={{ padding: '20px 20px 10px' }}>
            <div style={{ fontSize: 10.5, color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Session plan</div>
            <div style={{ fontSize: 13, color: 'var(--fg-1)', marginTop: 6 }}>{session ? topTitle : 'No active session yet'}</div>
          </div>
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 2, position: 'relative' }}>
            {steps.length > 0 ? (
              <>
                <div style={{ position: 'absolute', left: 27, top: 18, bottom: 18, width: 1, background: 'var(--line)' }}/>
                {steps.map((s, i) => {
                  const done = s.status === 'completed' || i < step;
                  const active = i === step;
                  return (
                    <button key={s.id || i} onClick={() => setStep(i)} disabled={busy} style={{
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
                        <div style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: active ? 'var(--accent)' : 'var(--fg-3)' }}>{s.label || s.t}</div>
                        <div style={{ fontSize: 12.5, color: active ? 'var(--fg-0)' : done ? 'var(--fg-2)' : 'var(--fg-3)', marginTop: 3, lineHeight: 1.4 }}>{s.title || s.question}</div>
                      </div>
                    </button>
                  );
                })}
              </>
            ) : (
              <div style={{ padding: 12, color: 'var(--fg-3)', fontSize: 12.5, lineHeight: 1.6 }}>
                Pick a material and start a tutor session. Noesis will build the plan after it retrieves context.
              </div>
            )}
          </div>
          {session && session.learningMap && window.LearningMap && (
            <div style={{ padding: 14, borderTop: '1px solid var(--line)' }}>
              <window.LearningMap map={session.learningMap} compact/>
            </div>
          )}
          <div style={{ marginTop: 'auto', padding: 14, borderTop: '1px solid var(--line)' }}>
            <div style={{ fontSize: 11, color: 'var(--fg-3)', marginBottom: 6 }}>Session time</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 300 }}>{fmtTime(elapsedS)}</span>
              <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>/ 20:00</span>
            </div>
          </div>
        </aside>

        <main style={tu.workspace}>
          <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px 40px' }}>
            {!session && (
              <div style={tu.emptyState}>
                <div style={tu.tutorAvatar}><Icon.Sparkle size={15} style={{ color: 'var(--accent)' }}/></div>
                <h1 style={tu.emptyTitle}>{busy ? 'Preparing your tutor session' : 'Start a grounded tutor session'}</h1>
                <p style={tu.emptyText}>{status || 'Choose a material above. The tutor will resolve the real topic, retrieve sources, and open with a useful warm-up.'}</p>
                {busy && <div style={tu.skeletonStack}>{[0, 1, 2].map(i => <div key={i} style={{ height: 10, borderRadius: 999, background: 'var(--bg-2)', border: '1px solid var(--line)', width: `${100 - i * 18}%` }}/>)}</div>}
                {error && <button className="btn btn-accent" onClick={() => startSession({ materialId: selectedMaterialId ? parseInt(selectedMaterialId, 10) : null, concept: conceptInput })}><Icon.Sparkle size={12}/> Retry</button>}
              </div>
            )}

            {session && currentStep && (
              <>
                <div style={{ fontSize: 11, color: 'var(--accent)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 10 }}>
                  Step {String(step + 1).padStart(2, '0')} · {currentStep.label || currentStep.t}
                </div>
                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 300, margin: '0 0 18px', lineHeight: 1.2 }}>
                  {currentStep.title || currentStep.question}
                </h1>
                <div style={tu.lessonCard}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={tu.tutorAvatar}><Icon.Sparkle size={13} style={{ color: 'var(--accent)' }}/></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, color: 'var(--fg-0)', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{currentStep.content}</div>
                      {currentStep.example && <div style={tu.exampleBox}><b>Example:</b> {currentStep.example}</div>}
                    </div>
                  </div>

                  {currentStep.visual && window.TopicVisual && (
                    <div style={{ marginTop: 18 }}>
                      <window.TopicVisual template={currentStep.visual.type} data={currentStep.visual} code={currentStep.code} compact/>
                    </div>
                  )}

                  {currentStep.code && (
                    <pre style={tu.codeBlock}>{currentStep.code.content}</pre>
                  )}

                  {currentStep.code && currentStep.code.walkthrough && (
                    <div style={tu.walkthrough}>
                      {currentStep.code.walkthrough.map((w, i) => (
                        <div key={i} style={tu.walkItem}><span className="mono">Line {w.lineRange}</span>{w.text}</div>
                      ))}
                    </div>
                  )}

                  <div style={tu.questionBox}>
                    <div style={{ fontSize: 10.5, color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 7 }}>Check your understanding</div>
                    <div style={{ fontSize: 14, color: 'var(--fg-0)', lineHeight: 1.55 }}>{currentStep.question}</div>
                    {currentStep.hint && <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--fg-2)' }}>Hint: {currentStep.hint}</div>}
                  </div>

                  {currentStep.options && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
                      {currentStep.options.map((label, i) => (
                        <button key={i} disabled={busy || paused} onClick={() => continueTutor(i)} style={tu.choice}>
                          <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', width: 14 }}>{String.fromCharCode(65 + i)}</span>
                          <span style={{ flex: 1, fontSize: 13, color: 'var(--fg-0)' }}>{label}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {!currentStep.options && (
                    <textarea className="input" value={answerText} onChange={e => setAnswerText(e.target.value)} disabled={busy || paused}
                              placeholder="Write a short answer, or continue when you're ready..."
                              style={{ width: '100%', minHeight: 82, marginTop: 16, fontSize: 13, resize: 'vertical' }}/>
                  )}

                  {feedback && <div style={tu.feedback}><b>Feedback</b><div>{feedback}</div></div>}

                  <div style={{ marginTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button className="btn btn-accent" disabled={!session || paused || busy} onClick={() => isLastStep ? finishTutor() : continueTutor()}>
                      {action === 'continue' ? <>Preparing... <Icon.Sparkle size={12}/></> : !isLastStep ? <>Continue <Icon.ArrowRight size={12}/></> : <>Finish <Icon.Check size={12}/></>}
                    </button>
                    <button className="btn btn-bare" disabled={!session || paused || busy} onClick={() => saveNote(`${currentStep.title}\n\n${currentStep.content}${currentStep.example ? `\n\nExample: ${currentStep.example}` : ''}`, 'explanation')}>
                      <Icon.Bookmark size={12}/> Save explanation
                    </button>
                    <button className="btn btn-ghost" disabled={busy} onClick={() => { setSession(null); setTutorState('ready_to_start'); setStatus('Choose a material, then start your tutor session.'); }}>
                      New session
                    </button>
                  </div>
                  {status && <div style={{ marginTop: 12, color: 'var(--fg-3)', fontSize: 12 }}>{status}</div>}
                  {error && <div style={{ marginTop: 12, color: 'var(--err)', fontSize: 12 }}>{error}</div>}
                </div>
              </>
            )}
          </div>
        </main>

        <aside style={tu.rail}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', gap: 2, padding: 2, background: 'var(--bg-2)', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)' }}>
              {['Trace', 'Notes', 'Sources'].map((t) => (
                <button key={t} onClick={() => setActiveRailTab(t)} style={{
                  flex: 1, padding: '5px 8px', fontSize: 11.5,
                  background: activeRailTab === t ? 'var(--bg-0)' : 'transparent',
                  color: activeRailTab === t ? 'var(--fg-0)' : 'var(--fg-2)',
                  borderRadius: 4,
                }}>{t}</button>
              ))}
            </div>
          </div>

          <div style={{ padding: 18, overflow: 'auto', flex: 1 }}>
            {activeRailTab === 'Trace' && (
              <>
                <RailTitle title="Tutor trace"/>
                <TraceRow label="State" value={tutorState}/>
                <TraceRow label="Provider" value={trace.provider || '—'}/>
                <TraceRow label="Model" value={trace.model || '—'}/>
                <TraceRow label="Topic" value={trace.topic || (session && session.topic) || '—'}/>
                <TraceRow label="Grounding" value={trace.groundingTier || '—'}/>
                <TraceRow label="Chunks" value={trace.chunksRetrieved == null ? '—' : trace.chunksRetrieved}/>
                <TraceRow label="Retrieval" value={trace.retrievalMs == null ? '—' : `${trace.retrievalMs} ms`}/>
                <TraceRow label="Generation" value={trace.generationMs == null ? '—' : `${trace.generationMs} ms`}/>
                <TraceRow label="Cache" value={trace.cacheHit ? 'hit' : 'miss'}/>
                {(trace.warnings || []).map((w, i) => <div key={i} style={tu.traceWarn}>{w}</div>)}
              </>
            )}

            {activeRailTab === 'Sources' && (
              <>
                <RailTitle title="Grounding sources"/>
                {sources.length === 0 && <div style={tu.emptyRail}>Sources will appear after the tutor retrieves material context.</div>}
                {sources.map((c, i) => (
                  <div key={`${c.id || c.chunkId}-${i}`} style={tu.sourceEntry}>
                    <div style={{ fontSize: 11, color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                      Source {i + 1} · {c.location || c.heading || 'Material excerpt'}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--fg-0)', marginBottom: 6 }}>{c.heading || c.materialTitle}</div>
                    <div style={{ fontSize: 12.2, color: 'var(--fg-2)', lineHeight: 1.55 }}>{c.excerpt || c.text}</div>
                  </div>
                ))}
              </>
            )}

            {activeRailTab === 'Notes' && (
              <>
                <RailTitle title="Your notebook"/>
                {notebook.length === 0 && <div style={tu.emptyRail}>No notes yet. Save a tutor explanation or write your own note.</div>}
                {notebook.map((n) => (
                  <div key={n.id} style={{ ...tu.noteEntry, ...(n.flashcard_worthy ? { borderLeft: '2px solid var(--accent)', paddingLeft: 10 } : {}) }}>
                    <div className="mono" style={{ fontSize: 10, color: n.flashcard_worthy ? 'var(--accent)' : 'var(--fg-3)', marginBottom: 4 }}>
                      {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--fg-1)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{n.body}</div>
                  </div>
                ))}
              </>
            )}
          </div>

          <div style={{ padding: 14, borderTop: '1px solid var(--line)', display: 'flex', gap: 8 }}>
            <input className="input" placeholder="Add a note (Enter to save)..." value={noteText}
                   onChange={(e) => setNoteText(e.target.value)} onKeyDown={addManualNote}
                   disabled={paused || !session || busy}
                   style={{ flex: 1, fontSize: 12.5 }}/>
            <button className="btn btn-bare" style={{ padding: 8 }} disabled={paused || !session || busy} onClick={() => addManualNote()}><Icon.Send size={14}/></button>
          </div>
        </aside>
      </div>
    </div>
  );
};

const RailTitle = ({ title }) => <div style={{ fontSize: 10.5, color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>{title}</div>;
const TraceRow = ({ label, value }) => (
  <div style={tu.traceRow}>
    <span>{label}</span>
    <b>{String(value)}</b>
  </div>
);

const tu = {
  layout: { display: 'grid', gridTemplateColumns: '280px 1fr 340px', flex: 1, minHeight: 'calc(100vh - 57px)' },
  contextBar: {
    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
    padding: '12px 18px', borderBottom: '1px solid var(--line)',
    background: 'var(--bg-1)',
  },
  progressBar: { height: 3, background: 'var(--bg-2)', borderBottom: '1px solid var(--line)' },
  progressFill: { height: '100%', background: 'var(--accent)', transition: 'width 260ms var(--ease-out)' },
  timeline: { borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', background: 'var(--bg-0)' },
  workspace: { overflow: 'auto', background: 'var(--bg-0)' },
  rail: { borderLeft: '1px solid var(--line)', display: 'flex', flexDirection: 'column', background: 'var(--bg-0)' },
  tutorAvatar: {
    width: 28, height: 28, borderRadius: 8,
    background: 'var(--accent-glow)', border: '1px solid var(--accent-soft)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  emptyState: {
    minHeight: 480, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    textAlign: 'center', gap: 14, color: 'var(--fg-1)',
  },
  emptyTitle: { fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 300, margin: 0 },
  emptyText: { maxWidth: 480, fontSize: 14, lineHeight: 1.7, color: 'var(--fg-2)', margin: 0 },
  skeletonStack: { display: 'grid', gap: 8, width: 360 },
  lessonCard: { marginTop: 22, padding: 18, border: '1px solid var(--line)', borderRadius: 'var(--r-md)', background: 'var(--bg-1)' },
  exampleBox: { marginTop: 12, padding: 12, borderRadius: 8, background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--fg-1)', fontSize: 13 },
  codeBlock: { marginTop: 16, padding: 16, borderRadius: 8, background: '#0f172a', color: '#dbeafe', overflow: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12.5, lineHeight: 1.6 },
  walkthrough: { display: 'grid', gap: 8, marginTop: 10 },
  walkItem: { display: 'flex', gap: 10, alignItems: 'flex-start', color: 'var(--fg-2)', fontSize: 12.5, lineHeight: 1.5 },
  questionBox: { marginTop: 16, padding: 14, borderRadius: 8, border: '1px solid var(--accent-soft)', background: 'var(--accent-glow)' },
  choice: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '12px 14px', borderRadius: 'var(--r-md)',
    border: '1px solid var(--line)', background: 'var(--bg-1)',
    textAlign: 'left',
  },
  feedback: { marginTop: 16, padding: 14, borderRadius: 8, background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--fg-1)', lineHeight: 1.6 },
  noteEntry: { marginBottom: 16 },
  sourceEntry: { marginBottom: 14, padding: 12, borderRadius: 'var(--r-sm)', background: 'var(--bg-1)', border: '1px solid var(--line)' },
  emptyRail: { fontSize: 12.5, color: 'var(--fg-3)', lineHeight: 1.6 },
  traceRow: { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--line)', fontSize: 12, color: 'var(--fg-2)' },
  traceWarn: { marginTop: 10, padding: 10, borderRadius: 8, background: 'color-mix(in oklab, var(--warn) 12%, transparent)', color: 'var(--fg-1)', fontSize: 12, lineHeight: 1.5 },
};

window.Tutor = Tutor;
