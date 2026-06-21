const StudyPlan = ({ onNav }) => {
  const Icon = window.Icon;
  const [plan, setPlan] = React.useState(null);
  const [map, setMap] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const [highlightNode, setHighlightNode] = React.useState('');
  const [prefs, setPrefs] = React.useState(null);
  const [materials, setMaterials] = React.useState([]);
  const [picker, setPicker] = React.useState(null);

  const load = React.useCallback(async () => {
    setStatus('');
    try {
      const [planRes, mapRes, prefsRes, materialsRes] = await Promise.all([
        window.NoesisAPI.study.activePlan().catch(() => ({ study_plan: null })),
        window.NoesisAPI.study.learningMap().catch(() => ({ learning_map: null })),
        window.NoesisAPI.user.getPrefs().catch(() => ({})),
        window.NoesisAPI.materials.list().catch(() => ({ materials: [] })),
      ]);
      setPlan(planRes.study_plan || null);
      setMap(mapRes.learning_map || null);
      setPrefs(prefsRes || {});
      setMaterials((materialsRes.materials || []).filter(m => m.status === 'ready'));
    } catch (e) {
      setStatus(e.message || 'Could not load your plan.');
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const createPlan = async () => {
    setBusy(true); setStatus('Building a study plan from your weak topics...');
    try {
      const res = await window.NoesisAPI.study.createPlan({});
      setPlan(res.study_plan || null);
      if (res.study_plan && res.study_plan.plan && res.study_plan.plan.learningMap) setMap(res.study_plan.plan.learningMap);
      setStatus('Draft ready. Review it, then approve it to make it active.');
    } catch (e) {
      setStatus('Plan failed: ' + (e.message || 'error'));
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!plan) return;
    setBusy(true); setStatus('Approving plan...');
    try {
      const res = await window.NoesisAPI.study.approvePlan(plan.id);
      setPlan(res.study_plan || null);
      setStatus('Plan is active.');
    } catch (e) {
      setStatus('Approve failed: ' + (e.message || 'error'));
    } finally {
      setBusy(false);
    }
  };

  const completeTask = async (taskId) => {
    setBusy(true);
    try {
      const res = await window.NoesisAPI.study.completeTask(taskId);
      setPlan(res.study_plan || null);
      const reward = res.study_plan && res.study_plan.reward;
      setStatus(reward && reward.points ? `Task marked complete. +${reward.points} XP` : 'Task marked complete.');
    } catch (e) {
      setStatus('Could not update task: ' + (e.message || 'error'));
    } finally {
      setBusy(false);
    }
  };

  const startCurriculumTutor = (node) => {
    const topic = node && node.label || (map && map.startHere) || 'Object-Oriented Programming basics';
    sessionStorage.setItem('noesis.tutorConcept', topic);
    sessionStorage.removeItem('noesis.tutorMaterialId');
    sessionStorage.setItem('noesis.tutorAutoStart', 'core');
    onNav('tutor');
  };

  const openMaterialPicker = (kind, node) => {
    setPicker({ kind, topic: node && node.label || (map && map.startHere) || 'Core topic' });
  };

  const generateFromPickedMaterial = async (material) => {
    if (!picker || !material || busy) return;
    setBusy(true);
    const topic = picker.topic;
    setStatus(`Generating ${picker.kind === 'quiz' ? 'quiz' : 'cards'} for ${topic} from ${material.display_title || material.title}...`);
    try {
      if (picker.kind === 'quiz') {
        const res = await window.NoesisAPI.quizzes.generate({ material_id: material.id, count: 6, difficulty: 'medium', sourceScope: 'material', topic });
        if (!res || !res.quiz_id) throw new Error('Quiz generation did not return a quiz.');
        sessionStorage.setItem('noesis.quizId', String(res.quiz_id));
        setPicker(null);
        onNav('quiz');
      } else {
        await window.NoesisAPI.flashcards.generate({ material_id: material.id, count: 8, regenerate: true, sourceScope: 'material', topic });
        setPicker(null);
        onNav('flashcards');
      }
    } catch (e) {
      setStatus('Generation failed: ' + (e.message || 'error'));
    } finally {
      setBusy(false);
    }
  };

  const planJson = plan && plan.plan ? plan.plan : null;
  const currentGoal = (prefs && prefs.goal) || 'exams';
  const planGoalId = planJson && planJson.goalId;
  const goalLabels = { exams: 'Ace my exams', understand: 'Understand deeply', retain: 'Retain long-term', practice: 'Practice problems' };
  const planNeedsGoalRefresh = !!(planJson && planGoalId && currentGoal && planGoalId !== currentGoal);
  const currentTrack = trackFromSubjectClient(prefs && prefs.subject);
  const planTrackId = planJson && planJson.trackId;
  const trackLabels = { oop: 'Object-Oriented Programming', ds: 'Data Structures', both: 'OOP + Data Structures' };
  const planNeedsTrackRefresh = !!(planJson && planTrackId && currentTrack && planTrackId !== currentTrack);
  const days = planJson && Array.isArray(planJson.dailyPlan) ? planJson.dailyPlan : [];
  const taskRows = plan && Array.isArray(plan.tasks) ? plan.tasks : [];
  const today = days[0] || null;
  const weakTopics = (planJson && planJson.weakTopics) || [];
  const taskByDay = taskRows.reduce((acc, row) => {
    if (!acc[row.day]) acc[row.day] = [];
    acc[row.day].push(row);
    return acc;
  }, {});

  return (
    <div>
      <window.Topbar
        title="Study Plan"
        crumbs={['Personal path']}
        right={<>
          <button className="btn btn-ghost" onClick={() => onNav && onNav('materials')}><Icon.Folder size={12}/> Materials</button>
          <button className="btn btn-accent" disabled={busy} onClick={createPlan}><Icon.Sparkle size={12}/> {plan ? 'Refresh plan' : 'Create plan'}</button>
        </>}
      />
      <div style={sp.page}>
        {status && <div style={sp.status}>{status}</div>}

        <section style={sp.hero}>
          <div>
            <div style={sp.eyebrow}>Adaptive study coach</div>
            <h1 style={sp.title}>{planJson ? planJson.planTitle : 'Build a path from your weak topics.'}</h1>
            <p style={sp.sub}>
              Noesis combines your onboarding profile, quiz misses, concept mastery, and uploaded material into a daily plan.
            </p>
            <div style={{ display: 'flex', gap: 'calc(8px * var(--app-density-scale))', marginTop: 'calc(18px * var(--app-density-scale))', flexWrap: 'wrap' }}>
              {planJson && <span className="chip chip-accent">{plan.status}</span>}
              {planJson && planJson.goalProfile && <span className="chip chip-accent">{planJson.goalProfile.short_label || planJson.goalProfile.label}</span>}
              {planJson && <span className="chip">{planJson.minutesPerSession || 45} min sessions</span>}
              {planJson && <span className="chip">{planJson.learningStyle || 'mixed'} learning</span>}
              {planJson && <span className="chip">{planJson.preferredLanguage || 'java'}</span>}
            </div>
            {planNeedsGoalRefresh && (
              <div style={sp.goalWarning}>
                Your goal is now {goalLabels[currentGoal] || currentGoal}. Refresh the plan to apply that new recommendation mix.
              </div>
            )}
            {planNeedsTrackRefresh && (
              <div style={sp.goalWarning}>
                Your track is now {trackLabels[currentTrack] || currentTrack}. Refresh the plan to rebuild the curriculum path.
              </div>
            )}
          </div>
          <div style={sp.actionCard}>
            <div style={{ fontSize: 'calc(12px * var(--app-font-scale))', color: 'var(--fg-3)', marginBottom: 'calc(8px * var(--app-density-scale))' }}>Next action</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 'calc(24px * var(--app-font-scale))', color: 'var(--fg-0)', lineHeight: 1.15 }}>
              {today ? today.focusTopic : 'Generate your first plan'}
            </div>
            <p style={{ fontSize: 'calc(12.5px * var(--app-font-scale))', color: 'var(--fg-2)', lineHeight: 1.5 }}>
              {today ? today.successCriteria : 'Upload material or generate a quiz to make recommendations sharper.'}
            </p>
            {plan && plan.status !== 'active' && (
              <button className="btn btn-accent" disabled={busy} onClick={approve} style={{ width: '100%', justifyContent: 'center' }}>
                <Icon.Check size={12}/> Approve plan
              </button>
            )}
          </div>
        </section>

        <section style={sp.grid}>
          <div style={sp.mapPanel}>
            <div style={sp.cardHead}>
              <span style={sp.cardTitle}>Curriculum map</span>
              <button className="btn btn-bare" onClick={load} style={{ fontSize: 'calc(11.5px * var(--app-font-scale))' }}>Refresh <Icon.ArrowRight size={11}/></button>
            </div>
            {window.MaterialMindMap
              ? <window.MaterialMindMap
                  map={map || (planJson && planJson.learningMap)}
                  eyebrow="Curriculum study map"
                  subtitle="Driven by your selected OOP, Data Structures, or combined track."
                  statusLabel={(map && map.trackLabel) || (planJson && planJson.trackLabel) || 'Curriculum path'}
                  showRegenerate={false}
                  onTutor={startCurriculumTutor}
                  onQuiz={(node) => openMaterialPicker('quiz', node)}
                  onFlashcards={(node) => openMaterialPicker('flashcards', node)}
                />
              : <div style={sp.empty}>Learning map renderer is not loaded.</div>}
          </div>

          <div className="card" style={{ padding: 'calc(22px * var(--app-density-scale))' }}>
            <div style={sp.cardHead}>
              <span style={sp.cardTitle}>Weak topics</span>
              <Icon.Target size={14} style={{ color: 'var(--accent)' }}/>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(8px * var(--app-density-scale))', marginTop: 'calc(14px * var(--app-density-scale))' }}>
              {weakTopics.length ? weakTopics.slice(0, 7).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setHighlightNode(t)}
                  style={{ ...sp.topicRow, ...(highlightNode === t ? sp.topicRowActive : {}) }}
                  aria-pressed={highlightNode === t}
                >
                  <span>{t}</span>
                  <span className="chip">priority</span>
                </button>
              )) : (
                <div style={sp.empty}>No weak topics yet. Take a quiz to calibrate the map.</div>
              )}
            </div>
          </div>
        </section>

        <section className="card" style={{ padding: 'calc(22px * var(--app-density-scale))', marginBottom: 'calc(40px * var(--app-density-scale))' }}>
          <div style={sp.cardHead}>
            <span style={sp.cardTitle}>Daily plan</span>
            <span style={{ fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)' }}>{days.length} day preview</span>
          </div>
          {!days.length ? (
            <div style={sp.empty}>No plan yet. Create one to generate a daily path.</div>
          ) : (
            <div style={sp.days}>
              {days.slice(0, 14).map(day => (
                <div key={day.day} style={sp.dayCard}>
                  <div style={sp.dayTop}>
                    <span className="mono" style={sp.dayNumber}>Day {day.day}</span>
                    <span style={{ fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)' }}>{day.estimatedMinutes} min</span>
                  </div>
                  <div style={sp.focus}>{day.focusTopic}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(7px * var(--app-density-scale))', marginTop: 'calc(12px * var(--app-density-scale))' }}>
                    {(taskByDay[day.day] || []).map(row => {
                      const t = row.task || {};
                      const done = row.status === 'completed';
                      return (
                        <button key={row.id} disabled={busy || done} onClick={() => completeTask(row.id)} style={{ ...sp.task, ...(done ? sp.taskDone : {}) }}>
                          <span style={sp.taskDot}>{done ? <Icon.Check size={9}/> : taskIcon(t.type, Icon)}</span>
                          <span style={{ flex: 1, textAlign: 'left' }}>{t.title}</span>
                          <span className="chip chip-accent" style={{ fontSize: 'calc(10px * var(--app-font-scale))' }}>+20 XP</span>
                          <span className="mono" style={{ fontSize: 'calc(10px * var(--app-font-scale))', color: 'var(--fg-3)' }}>{t.estimatedMinutes || 0}m</span>
                        </button>
                      );
                    })}
                  </div>
                  <div style={sp.success}>{day.successCriteria}</div>
                </div>
              ))}
            </div>
          )}
        </section>
        {picker && (
          <div style={sp.pickerOverlay} onClick={() => !busy && setPicker(null)}>
            <section style={sp.picker} onClick={event => event.stopPropagation()}>
              <div style={sp.cardHead}>
                <div>
                  <div style={sp.pickerEyebrow}>{picker.kind === 'quiz' ? 'Choose quiz source' : 'Choose card source'}</div>
                  <div style={sp.pickerTitle}>{picker.topic}</div>
                </div>
                <button className="btn btn-bare" disabled={busy} onClick={() => setPicker(null)}><Icon.X size={14}/></button>
              </div>
              {materials.length ? (
                <div style={sp.materialList}>
                  {materials.map(material => (
                    <button key={material.id} disabled={busy} style={sp.materialChoice} onClick={() => generateFromPickedMaterial(material)}>
                      <Icon.File size={14} style={{ color: 'var(--accent)' }}/>
                      <span style={{ flex: 1, textAlign: 'left' }}>{material.display_title || material.title}</span>
                      <Icon.ArrowRight size={12}/>
                    </button>
                  ))}
                </div>
              ) : (
                <div style={sp.noMaterial}>
                  <div>No ready uploads yet.</div>
                  <button className="btn btn-accent" onClick={() => { setPicker(null); onNav('materials'); }}><Icon.Upload size={12}/> Upload material</button>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

function trackFromSubjectClient(subject) {
  const raw = String(subject || '').toLowerCase();
  const hasDs = /data.?struct|\bds\b/.test(raw);
  const hasOop = /oop|object|java/.test(raw);
  if (/both|computer.?science|cs\b|combined|all/.test(raw) || (hasDs && hasOop)) return 'both';
  if (hasDs) return 'ds';
  if (hasOop) return 'oop';
  return 'both';
}

function taskIcon(type, Icon) {
  if (type === 'watch_video') return <Icon.Play size={9}/>;
  if (type === 'read_notes') return <Icon.PenNib size={9}/>;
  if (type === 'quiz') return <Icon.Target size={9}/>;
  if (type === 'flashcards') return <Icon.Cards size={9}/>;
  return <Icon.Sparkle size={9}/>;
}

const sp = {
  page: { padding: 'calc(28px * var(--app-density-scale))', maxWidth: 1440, margin: '0 auto' },
  status: {
    padding: '10px 12px', borderRadius: 'var(--r-sm)',
    border: '1px solid var(--line)', background: 'var(--bg-1)',
    color: 'var(--fg-2)', fontSize: 'calc(12.5px * var(--app-font-scale))', marginBottom: 'calc(14px * var(--app-density-scale))',
  },
  hero: {
    display: 'grid', gridTemplateColumns: '1fr 320px', gap: 'calc(18px * var(--app-density-scale))',
    alignItems: 'stretch', marginBottom: 'calc(14px * var(--app-density-scale))',
  },
  eyebrow: { fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--accent)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 'calc(10px * var(--app-density-scale))' },
  title: { fontFamily: 'var(--font-display)', fontSize: 'calc(44px * var(--app-font-scale))', fontWeight: 300, letterSpacing: '-0.02em', margin: 0, lineHeight: 1.08 },
  sub: { fontSize: 'calc(14px * var(--app-font-scale))', color: 'var(--fg-2)', maxWidth: 680, lineHeight: 1.6 },
  goalWarning: {
    marginTop: 'calc(14px * var(--app-density-scale))',
    padding: '10px 12px',
    borderRadius: 'var(--r-sm)',
    border: '1px solid var(--accent-soft)',
    background: 'var(--accent-glow)',
    color: 'var(--fg-1)',
    fontSize: 'calc(12px * var(--app-font-scale))',
  },
  actionCard: { padding: 'calc(20px * var(--app-density-scale))', borderRadius: 'var(--r-lg)', background: 'var(--bg-1)', border: '1px solid var(--line)' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'calc(14px * var(--app-density-scale))', marginBottom: 'calc(14px * var(--app-density-scale))' },
  mapPanel: { padding: 'calc(18px * var(--app-density-scale))', gridColumn: 'span 2', borderRadius: 'var(--r-lg)', background: 'var(--bg-1)', border: '1px solid var(--line)', minWidth: 0 },
  cardHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'calc(12px * var(--app-density-scale))' },
  cardTitle: { fontSize: 'calc(13px * var(--app-font-scale))', color: 'var(--fg-1)', fontWeight: 500 },
  empty: { padding: 'calc(18px * var(--app-density-scale))', color: 'var(--fg-3)', fontSize: 'calc(12.5px * var(--app-font-scale))', textAlign: 'center' },
  topicRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 'calc(8px * var(--app-density-scale))', width: '100%', padding: '9px 10px', borderRadius: 'var(--r-sm)',
    background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--fg-1)', fontSize: 'calc(12.5px * var(--app-font-scale))',
    cursor: 'pointer', textAlign: 'left',
  },
  topicRowActive: { borderColor: 'var(--accent)', boxShadow: '0 0 0 2px var(--accent-soft)', color: 'var(--fg-0)' },
  days: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'calc(12px * var(--app-density-scale))', marginTop: 'calc(14px * var(--app-density-scale))' },
  dayCard: { padding: 'calc(16px * var(--app-density-scale))', borderRadius: 'var(--r-md)', background: 'var(--bg-2)', border: '1px solid var(--line)' },
  dayTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  dayNumber: { color: 'var(--accent)', fontSize: 'calc(10.5px * var(--app-font-scale))', letterSpacing: '0.08em', textTransform: 'uppercase' },
  focus: { fontFamily: 'var(--font-display)', fontSize: 'calc(22px * var(--app-font-scale))', color: 'var(--fg-0)', marginTop: 'calc(8px * var(--app-density-scale))' },
  task: {
    display: 'flex', alignItems: 'center', gap: 'calc(8px * var(--app-density-scale))', width: '100%',
    padding: '8px 9px', borderRadius: 'var(--r-sm)',
    background: 'var(--bg-1)', border: '1px solid var(--line)',
    color: 'var(--fg-1)', fontSize: 'calc(12px * var(--app-font-scale))',
  },
  taskDone: { opacity: 0.62, textDecoration: 'line-through' },
  taskDot: {
    width: 18, height: 18, borderRadius: 6,
    background: 'var(--accent-glow)', border: '1px solid var(--accent-soft)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0,
  },
  success: { borderTop: '1px solid var(--line-soft)', marginTop: 'calc(12px * var(--app-density-scale))', paddingTop: 'calc(10px * var(--app-density-scale))', color: 'var(--fg-3)', fontSize: 'calc(11.5px * var(--app-font-scale))', lineHeight: 1.45 },
  pickerOverlay: { position: 'fixed', inset: 0, zIndex: 2600, display: 'grid', placeItems: 'center', padding: '20px', background: 'rgba(4,4,14,.72)', backdropFilter: 'blur(12px)' },
  picker: { width: 'min(560px, 100%)', maxHeight: 'min(680px, calc(100vh - 40px))', overflow: 'auto', padding: 'calc(20px * var(--app-density-scale))', borderRadius: 'var(--r-lg)', border: '1px solid var(--line)', background: 'var(--bg-1)', boxShadow: 'var(--shadow-lg)' },
  pickerEyebrow: { fontSize: 'calc(10px * var(--app-font-scale))', color: 'var(--accent)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 5 },
  pickerTitle: { fontFamily: 'var(--font-display)', fontSize: 'calc(24px * var(--app-font-scale))', color: 'var(--fg-0)', lineHeight: 1.15 },
  materialList: { display: 'flex', flexDirection: 'column', gap: 'calc(8px * var(--app-density-scale))', marginTop: 'calc(18px * var(--app-density-scale))' },
  materialChoice: { display: 'flex', alignItems: 'center', gap: 'calc(10px * var(--app-density-scale))', padding: '11px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--fg-1)', fontSize: 'calc(12.5px * var(--app-font-scale))' },
  noMaterial: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'calc(12px * var(--app-density-scale))', marginTop: 'calc(18px * var(--app-density-scale))', padding: 'calc(14px * var(--app-density-scale))', borderRadius: 'var(--r-md)', background: 'var(--bg-2)', color: 'var(--fg-2)', fontSize: 'calc(12.5px * var(--app-font-scale))' },
};

window.StudyPlan = StudyPlan;
