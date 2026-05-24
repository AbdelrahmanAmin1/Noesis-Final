const StudyPlan = ({ onNav }) => {
  const Icon = window.Icon;
  const [plan, setPlan] = React.useState(null);
  const [map, setMap] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const [highlightNode, setHighlightNode] = React.useState('');

  const load = React.useCallback(async () => {
    setStatus('');
    try {
      const [planRes, mapRes] = await Promise.all([
        window.NoesisAPI.study.activePlan().catch(() => ({ study_plan: null })),
        window.NoesisAPI.study.learningMap().catch(() => ({ learning_map: null })),
      ]);
      setPlan(planRes.study_plan || null);
      setMap(mapRes.learning_map || null);
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

  const planJson = plan && plan.plan ? plan.plan : null;
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
            <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
              {planJson && <span className="chip chip-accent">{plan.status}</span>}
              {planJson && <span className="chip">{planJson.minutesPerSession || 45} min sessions</span>}
              {planJson && <span className="chip">{planJson.learningStyle || 'mixed'} learning</span>}
              {planJson && <span className="chip">{planJson.preferredLanguage || 'java'}</span>}
            </div>
          </div>
          <div style={sp.actionCard}>
            <div style={{ fontSize: 12, color: 'var(--fg-3)', marginBottom: 8 }}>Next action</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--fg-0)', lineHeight: 1.15 }}>
              {today ? today.focusTopic : 'Generate your first plan'}
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--fg-2)', lineHeight: 1.5 }}>
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
          <div className="card" style={{ padding: 22, gridColumn: 'span 2' }}>
            <div style={sp.cardHead}>
              <span style={sp.cardTitle}>Learning map</span>
              <button className="btn btn-bare" onClick={load} style={{ fontSize: 11.5 }}>Refresh <Icon.ArrowRight size={11}/></button>
            </div>
            {window.LearningMap
              ? <window.LearningMap map={map || (planJson && planJson.learningMap)} compact={false} highlightNode={highlightNode} />
              : <div style={sp.empty}>Learning map renderer is not loaded.</div>}
          </div>

          <div className="card" style={{ padding: 22 }}>
            <div style={sp.cardHead}>
              <span style={sp.cardTitle}>Weak topics</span>
              <Icon.Target size={14} style={{ color: 'var(--accent)' }}/>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
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

        <section className="card" style={{ padding: 22, marginBottom: 40 }}>
          <div style={sp.cardHead}>
            <span style={sp.cardTitle}>Daily plan</span>
            <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>{days.length} day preview</span>
          </div>
          {!days.length ? (
            <div style={sp.empty}>No plan yet. Create one to generate a daily path.</div>
          ) : (
            <div style={sp.days}>
              {days.slice(0, 14).map(day => (
                <div key={day.day} style={sp.dayCard}>
                  <div style={sp.dayTop}>
                    <span className="mono" style={sp.dayNumber}>Day {day.day}</span>
                    <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>{day.estimatedMinutes} min</span>
                  </div>
                  <div style={sp.focus}>{day.focusTopic}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 12 }}>
                    {(taskByDay[day.day] || []).map(row => {
                      const t = row.task || {};
                      const done = row.status === 'completed';
                      return (
                        <button key={row.id} disabled={busy || done} onClick={() => completeTask(row.id)} style={{ ...sp.task, ...(done ? sp.taskDone : {}) }}>
                          <span style={sp.taskDot}>{done ? <Icon.Check size={9}/> : taskIcon(t.type, Icon)}</span>
                          <span style={{ flex: 1, textAlign: 'left' }}>{t.title}</span>
                          <span className="chip chip-accent" style={{ fontSize: 10 }}>+20 XP</span>
                          <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>{t.estimatedMinutes || 0}m</span>
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
      </div>
    </div>
  );
};

function taskIcon(type, Icon) {
  if (type === 'watch_video') return <Icon.Play size={9}/>;
  if (type === 'read_notes') return <Icon.PenNib size={9}/>;
  if (type === 'quiz') return <Icon.Target size={9}/>;
  if (type === 'flashcards') return <Icon.Cards size={9}/>;
  return <Icon.Sparkle size={9}/>;
}

const sp = {
  page: { padding: 28, maxWidth: 1440, margin: '0 auto' },
  status: {
    padding: '10px 12px', borderRadius: 'var(--r-sm)',
    border: '1px solid var(--line)', background: 'var(--bg-1)',
    color: 'var(--fg-2)', fontSize: 12.5, marginBottom: 14,
  },
  hero: {
    display: 'grid', gridTemplateColumns: '1fr 320px', gap: 18,
    alignItems: 'stretch', marginBottom: 14,
  },
  eyebrow: { fontSize: 11, color: 'var(--accent)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 },
  title: { fontFamily: 'var(--font-display)', fontSize: 44, fontWeight: 300, letterSpacing: '-0.02em', margin: 0, lineHeight: 1.08 },
  sub: { fontSize: 14, color: 'var(--fg-2)', maxWidth: 680, lineHeight: 1.6 },
  actionCard: { padding: 20, borderRadius: 'var(--r-lg)', background: 'var(--bg-1)', border: '1px solid var(--line)' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 14 },
  cardHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  cardTitle: { fontSize: 13, color: 'var(--fg-1)', fontWeight: 500 },
  empty: { padding: 18, color: 'var(--fg-3)', fontSize: 12.5, textAlign: 'center' },
  topicRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 8, width: '100%', padding: '9px 10px', borderRadius: 'var(--r-sm)',
    background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--fg-1)', fontSize: 12.5,
    cursor: 'pointer', textAlign: 'left',
  },
  topicRowActive: { borderColor: 'var(--accent)', boxShadow: '0 0 0 2px var(--accent-soft)', color: 'var(--fg-0)' },
  days: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginTop: 14 },
  dayCard: { padding: 16, borderRadius: 'var(--r-md)', background: 'var(--bg-2)', border: '1px solid var(--line)' },
  dayTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  dayNumber: { color: 'var(--accent)', fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase' },
  focus: { fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--fg-0)', marginTop: 8 },
  task: {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
    padding: '8px 9px', borderRadius: 'var(--r-sm)',
    background: 'var(--bg-1)', border: '1px solid var(--line)',
    color: 'var(--fg-1)', fontSize: 12,
  },
  taskDone: { opacity: 0.62, textDecoration: 'line-through' },
  taskDot: {
    width: 18, height: 18, borderRadius: 6,
    background: 'var(--accent-glow)', border: '1px solid var(--accent-soft)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0,
  },
  success: { borderTop: '1px solid var(--line-soft)', marginTop: 12, paddingTop: 10, color: 'var(--fg-3)', fontSize: 11.5, lineHeight: 1.45 },
};

window.StudyPlan = StudyPlan;
