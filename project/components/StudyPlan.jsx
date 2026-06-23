const STUDY_TASK_XP = 20;

const StudyPlan = ({ onNav }) => {
  const Icon = window.Icon;
  const [plan, setPlan] = React.useState(null);
  const [map, setMap] = React.useState(null);
  const [game, setGame] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [status, setStatus] = React.useState('');
  const [highlightNode, setHighlightNode] = React.useState('');
  const [prefs, setPrefs] = React.useState(null);
  const [materials, setMaterials] = React.useState([]);
  const [picker, setPicker] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setStatus('');
    try {
      const [planRes, mapRes, prefsRes, materialsRes, gameRes] = await Promise.all([
        window.NoesisAPI.study.activePlan().catch(() => ({ study_plan: null })),
        window.NoesisAPI.study.learningMap().catch(() => ({ learning_map: null })),
        window.NoesisAPI.user.getPrefs().catch(() => ({})),
        window.NoesisAPI.materials.list().catch(() => ({ materials: [] })),
        window.NoesisAPI.gamification.summary().catch(() => null),
      ]);
      setPlan(planRes.study_plan || null);
      setMap(mapRes.learning_map || null);
      setPrefs(prefsRes || {});
      setMaterials((materialsRes.materials || []).filter(material => material.status === 'ready'));
      setGame(gameRes || null);
    } catch (e) {
      setStatus(e.message || 'Could not load your plan.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const createPlan = async () => {
    setBusy(true);
    setStatus('Building a study plan from your weak topics...');
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
    setBusy(true);
    setStatus('Approving plan...');
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
      const updatedPlan = res.study_plan || null;
      setPlan(updatedPlan);
      if (updatedPlan && updatedPlan.gamification) setGame(updatedPlan.gamification);
      const reward = updatedPlan && updatedPlan.reward;
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
  const weakTopics = (planJson && planJson.weakTopics) || [];
  const nextPendingIndex = taskRows.findIndex(row => row.status !== 'completed');
  const completedTasks = taskRows.filter(row => row.status === 'completed');
  const totalMinutes = taskRows.reduce((sum, row) => sum + Number(row.task && row.task.estimatedMinutes || 0), 0);
  const completedMinutes = completedTasks.reduce((sum, row) => sum + Number(row.task && row.task.estimatedMinutes || 0), 0);
  const completionPct = taskRows.length ? Math.round((completedTasks.length / taskRows.length) * 100) : 0;
  const nextTask = nextPendingIndex >= 0 ? taskRows[nextPendingIndex] : null;
  const selectedTopic = highlightNode || (nextTask && nextTask.task && nextTask.task.focusTopic) || (map && map.startHere) || '';
  const xp = game && game.xp ? game.xp : {};
  const level = Number(xp.level || 1);
  const levelPct = clampPercent(xp.progress_pct);
  const xpToNext = Number(xp.xp_to_next_level || 0);
  const currentXp = Number(xp.total_xp || 0);

  const selectTopic = (topic) => {
    if (topic) setHighlightNode(topic);
  };

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
        {status && <div style={sp.status} role="status">{status}</div>}

        <header style={sp.hero}>
          <div>
            <div style={sp.eyebrow}><Icon.Sparkles size={12}/> Adaptive study coach</div>
            <h1 style={sp.title}>{planJson ? planJson.planTitle : 'Turn your learning into momentum.'}</h1>
            <p style={sp.sub}>A clearer daily path, a living curriculum map, and just enough reward to keep the engine humming.</p>
          </div>
          {plan && plan.status !== 'active' && (
            <button className="btn btn-accent" disabled={busy} onClick={approve} style={sp.approveButton}>
              <Icon.Check size={13}/> Approve plan
            </button>
          )}
        </header>

        {planNeedsGoalRefresh && (
          <div style={sp.goalWarning}>Your goal is now {goalLabels[currentGoal] || currentGoal}. Refresh the plan to apply that new recommendation mix.</div>
        )}
        {planNeedsTrackRefresh && (
          <div style={sp.goalWarning}>Your track is now {trackLabels[currentTrack] || currentTrack}. Refresh the plan to rebuild the curriculum path.</div>
        )}

        <div className="study-plan-workspace">
          <main style={sp.plannerShell}>
            {loading ? (
              <section style={sp.emptyPlan}><Icon.Sparkles size={25}/><div style={sp.emptyTitle}>Loading your planning board...</div><div style={sp.emptyCopy}>Connecting your plan, progress, and curriculum map.</div></section>
            ) : !planJson ? (
              <section style={sp.emptyPlan}>
                <div style={sp.emptyIcon}><Icon.Calendar size={22}/></div>
                <div style={sp.emptyTitle}>Your study plan is waiting to be shaped.</div>
                <div style={sp.emptyCopy}>Noesis will turn your goals, weak topics, and study time into a focused daily route.</div>
                <button className="btn btn-accent" disabled={busy} onClick={createPlan}><Icon.Sparkle size={12}/> Create my plan</button>
              </section>
            ) : (
              <section style={sp.plannerCard}>
                <div style={sp.planCardHead}>
                  <div>
                    <div style={sp.sectionEyebrow}>Plan dashboard</div>
                    {planJson.source && planJson.source.label && <div style={sp.sourceNotice}><Icon.Link size={11}/>{planJson.source.label}</div>}
                  </div>
                  <span style={{ ...sp.planStatus, ...(plan.status === 'active' ? sp.planStatusActive : {}) }}>{formatPlanStatus(plan.status)}</span>
                </div>

                <div className="study-plan-metric-grid" style={sp.metricGrid}>
                  <PlanMetric icon={Icon.Calendar} label="Study rhythm" value={`${planJson.daysPerWeek || 0} days / week`} detail={`${planJson.durationDays || days.length} day path`}/>
                  <PlanMetric icon={Icon.Clock} label="Session length" value={`${planJson.minutesPerSession || 45} min`} detail={`${totalMinutes || 0} minutes scheduled`}/>
                  <PlanMetric icon={Icon.Target} label="Plan progress" value={`${completionPct}% complete`} detail={`${completedTasks.length} of ${taskRows.length} tasks done`} progress={completionPct}/>
                  <PlanMetric icon={Icon.Star} label={`Level ${level}`} value={`${currentXp} XP`} detail={xpToNext ? `${xpToNext} XP to next level` : 'Level progress synced'} progress={levelPct} accent/>
                </div>

                <div style={sp.contextRow}>
                  <div style={sp.legend} aria-label="Task status legend">
                    <StatusLegend color="var(--ok)" label="Completed"/>
                    <StatusLegend color="var(--accent-3)" label="Up next"/>
                    <StatusLegend color="var(--fg-3)" label="Planned"/>
                  </div>
                  <div className="study-plan-focus-topics" style={sp.focusTopics}>
                    <span style={sp.focusLabel}>Priority topics</span>
                    {weakTopics.length ? weakTopics.slice(0, 4).map(topic => (
                      <button key={topic} type="button" className="chip" onClick={() => selectTopic(topic)} style={{ ...sp.topicChip, ...(sameTopic(topic, selectedTopic) ? sp.topicChipActive : {}) }}>{topic}</button>
                    )) : <span style={sp.focusEmpty}>Take a quiz to calibrate this list.</span>}
                  </div>
                </div>

                <div style={sp.tableFrame}>
                  <div className="study-plan-table-head" style={sp.tableHead} aria-hidden="true">
                    <span/>
                    <span>Day</span>
                    <span>Task</span>
                    <span>Time</span>
                    <span>Status</span>
                    <span>Reward</span>
                  </div>
                  <div style={sp.taskList}>
                    {taskRows.map((row, index) => {
                      const task = row.task || {};
                      const taskState = taskStatus(row, index, nextPendingIndex);
                      const isDone = taskState.key === 'completed';
                      const isSelected = sameTopic(task.focusTopic, selectedTopic);
                      return <div key={row.id} className="study-plan-task-row" style={{ ...sp.taskRow, ...(isSelected ? sp.taskRowSelected : {}), ...(isDone ? sp.taskRowDone : {}) }}>
                        <button
                          type="button"
                          disabled={busy || isDone}
                          onClick={() => completeTask(row.id)}
                          aria-label={isDone ? `${task.title} completed` : `Mark ${task.title} complete`}
                          title={isDone ? 'Completed' : 'Mark complete'}
                          style={{ ...sp.taskToggle, ...(isDone ? sp.taskToggleDone : {}) }}
                        >
                          {isDone ? <Icon.Check size={12}/> : taskIcon(task.type, Icon)}
                        </button>
                        <div className="study-plan-day-cell" style={sp.dayCell}><span className="mono" style={sp.dayNumber}>Day {row.day}</span></div>
                        <button type="button" className="study-plan-task-cell" onClick={() => selectTopic(task.focusTopic)} style={sp.taskCell} title={`Highlight ${task.focusTopic || 'this topic'} in the curriculum map`}>
                          <span style={sp.taskTitle}>{task.title || 'Study task'}</span>
                          <span style={sp.taskTopic}><Icon.Link size={10}/> {task.focusTopic || 'Curriculum topic'}</span>
                        </button>
                        <div className="study-plan-time-cell" style={sp.timeCell}><Icon.Clock size={11}/>{task.estimatedMinutes || 0} min</div>
                        <div className="study-plan-status-cell" style={sp.statusCell}><span style={{ ...sp.stateChip, color: taskState.color, borderColor: taskState.border, background: taskState.background }}><span style={{ ...sp.stateDot, background: taskState.color }}/>{taskState.label}</span></div>
                        <div className="study-plan-xp-cell" style={sp.xpCell}><Icon.Bolt size={11}/>{isDone ? `+${STUDY_TASK_XP}` : `${STUDY_TASK_XP} XP`}</div>
                      </div>;
                    })}
                  </div>
                </div>

                <footer style={sp.progressFooter}>
                  <div style={sp.progressCopy}>
                    <div style={sp.progressMeta}><Icon.Target size={14}/> Plan progress</div>
                    <div style={sp.progressValue}>{completionPct}% <span>complete</span></div>
                    <div style={sp.progressSub}>{completedMinutes} of {totalMinutes} scheduled minutes finished</div>
                  </div>
                  <div style={sp.progressTrackWrap}>
                    <div style={sp.progressTrack}><div style={{ ...sp.progressFill, width: `${completionPct}%` }}/></div>
                    <div style={sp.progressHint}>{Math.max(0, taskRows.length - completedTasks.length)} tasks left</div>
                  </div>
                  <div style={sp.rewardCard}>
                    <div style={sp.rewardIcon}><Icon.Star size={18}/></div>
                    <div><div style={sp.rewardLabel}>Next level</div><div style={sp.rewardValue}>{xpToNext || 0} XP <span>to go</span></div></div>
                  </div>
                </footer>
              </section>
            )}
          </main>

          <aside className="study-plan-map-rail" style={sp.mapRail}>
            {window.MaterialMindMap ? <window.MaterialMindMap
              map={map || (planJson && planJson.learningMap)}
              eyebrow="Linked curriculum map"
              subtitle={selectedTopic ? `Showing the connection to ${selectedTopic}.` : 'Select a task or concept to follow its connection.'}
              statusLabel={(map && map.trackLabel) || (planJson && planJson.trackLabel) || 'Curriculum path'}
              showRegenerate={false}
              activeTopic={selectedTopic}
              onNodeSelect={node => selectTopic(node && node.label)}
              onTutor={startCurriculumTutor}
              onQuiz={node => openMaterialPicker('quiz', node)}
              onFlashcards={node => openMaterialPicker('flashcards', node)}
            /> : <div style={sp.mapFallback}>Learning map renderer is not loaded.</div>}
          </aside>
        </div>

        {picker && (
          <div style={sp.pickerOverlay} onClick={() => !busy && setPicker(null)}>
            <section style={sp.picker} onClick={event => event.stopPropagation()}>
              <div style={sp.pickerHead}>
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
                      <Icon.File size={14} style={{ color: 'var(--accent-3)' }}/>
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

const PlanMetric = ({ icon: MetricIcon, label, value, detail, progress, accent }) => (
  <div style={{ ...sp.metric, ...(accent ? sp.metricAccent : {}) }}>
    <div style={sp.metricIcon}><MetricIcon size={15}/></div>
    <div style={sp.metricContent}>
      <div style={sp.metricLabel}>{label}</div>
      <div style={sp.metricValue}>{value}</div>
      <div style={sp.metricDetail}>{detail}</div>
      {typeof progress === 'number' && <div style={sp.miniTrack}><div style={{ ...sp.miniFill, width: `${clampPercent(progress)}%` }}/></div>}
    </div>
  </div>
);

const StatusLegend = ({ color, label }) => <span style={sp.legendItem}><span style={{ ...sp.legendDot, background: color }}/>{label}</span>;

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function sameTopic(a, b) {
  const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return !!normalize(a) && normalize(a) === normalize(b);
}

function taskStatus(row, index, nextPendingIndex) {
  if (row.status === 'completed') return { key: 'completed', label: 'Completed', color: 'var(--ok)', border: 'color-mix(in srgb, var(--ok) 38%, transparent)', background: 'color-mix(in srgb, var(--ok) 12%, transparent)' };
  if (index === nextPendingIndex) return { key: 'up-next', label: 'Up next', color: 'var(--accent-3)', border: 'color-mix(in srgb, var(--accent-3) 42%, transparent)', background: 'color-mix(in srgb, var(--accent-3) 11%, transparent)' };
  return { key: 'planned', label: 'Planned', color: 'var(--fg-3)', border: 'var(--line)', background: 'var(--bg-2)' };
}

function formatPlanStatus(status) {
  if (status === 'active') return 'Active plan';
  if (status === 'draft') return 'Draft · review ready';
  return status || 'Plan ready';
}

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
  if (type === 'watch_video') return <Icon.Play size={11}/>;
  if (type === 'read_notes') return <Icon.PenNib size={11}/>;
  if (type === 'quiz') return <Icon.Target size={11}/>;
  if (type === 'flashcards') return <Icon.Cards size={11}/>;
  return <Icon.Sparkle size={11}/>;
}

const sp = {
  page: { padding: 'calc(28px * var(--app-density-scale))', maxWidth: 1580, margin: '0 auto' },
  status: { padding: '10px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)', background: 'var(--bg-1)', color: 'var(--fg-2)', fontSize: 'calc(12.5px * var(--app-font-scale))', marginBottom: 'calc(14px * var(--app-density-scale))' },
  hero: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 'calc(18px * var(--app-density-scale))', margin: 'calc(4px * var(--app-density-scale)) 0 calc(20px * var(--app-density-scale))' },
  eyebrow: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 'calc(10.5px * var(--app-font-scale))', color: 'var(--accent-3)', letterSpacing: '0.13em', textTransform: 'uppercase', marginBottom: 'calc(9px * var(--app-density-scale))', fontWeight: 700 },
  title: { fontFamily: 'var(--font-display)', fontSize: 'clamp(32px, calc(42px * var(--app-font-scale)), 52px)', fontWeight: 300, letterSpacing: '-0.03em', color: 'var(--fg-0)', margin: 0, lineHeight: 1.05 },
  sub: { margin: 'calc(9px * var(--app-density-scale)) 0 0', maxWidth: 690, color: 'var(--fg-2)', fontSize: 'calc(13px * var(--app-font-scale))', lineHeight: 1.55 },
  approveButton: { flexShrink: 0, marginBottom: 'calc(3px * var(--app-density-scale))' },
  goalWarning: { marginBottom: 'calc(14px * var(--app-density-scale))', padding: '10px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--accent-soft)', background: 'var(--accent-glow)', color: 'var(--fg-1)', fontSize: 'calc(12px * var(--app-font-scale))' },
  plannerShell: { minWidth: 0 },
  plannerCard: { overflow: 'hidden', border: '1px solid color-mix(in srgb, var(--accent-3) 22%, var(--line))', borderRadius: 'var(--r-xl)', background: 'linear-gradient(145deg, color-mix(in srgb, var(--bg-1) 94%, var(--accent-3) 6%), var(--bg-1))', boxShadow: 'var(--shadow-lg)' },
  planCardHead: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'calc(14px * var(--app-density-scale))', padding: 'calc(20px * var(--app-density-scale)) calc(22px * var(--app-density-scale)) calc(16px * var(--app-density-scale))' },
  sectionEyebrow: { fontSize: 'calc(10px * var(--app-font-scale))', color: 'var(--accent-3)', letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 5 },
  sourceNotice: { display: 'flex', alignItems: 'center', gap: 5, maxWidth: 620, marginTop: 'calc(8px * var(--app-density-scale))', color: 'var(--fg-2)', fontSize: 'calc(10.5px * var(--app-font-scale))', lineHeight: 1.4 },
  planStatus: { padding: '6px 9px', borderRadius: 999, border: '1px solid var(--accent-soft)', background: 'var(--accent-glow)', color: 'var(--accent)', fontSize: 'calc(10px * var(--app-font-scale))', fontWeight: 700, whiteSpace: 'nowrap' },
  planStatusActive: { color: 'var(--ok)', borderColor: 'color-mix(in srgb, var(--ok) 36%, transparent)', background: 'color-mix(in srgb, var(--ok) 10%, transparent)' },
  metricGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'calc(9px * var(--app-density-scale))', padding: '0 calc(22px * var(--app-density-scale)) calc(16px * var(--app-density-scale))' },
  metric: { display: 'flex', gap: 'calc(10px * var(--app-density-scale))', minWidth: 0, padding: 'calc(12px * var(--app-density-scale))', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', background: 'color-mix(in srgb, var(--bg-2) 82%, transparent)' },
  metricAccent: { borderColor: 'color-mix(in srgb, var(--accent-3) 31%, var(--line))', background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent-3) 11%, var(--bg-2)), var(--bg-2))' },
  metricIcon: { width: 30, height: 30, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 9, color: 'var(--accent-3)', background: 'color-mix(in srgb, var(--accent-3) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-3) 18%, transparent)' },
  metricContent: { minWidth: 0, flex: 1 },
  metricLabel: { color: 'var(--fg-3)', fontSize: 'calc(9.5px * var(--app-font-scale))', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 },
  metricValue: { color: 'var(--fg-0)', fontSize: 'calc(13px * var(--app-font-scale))', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  metricDetail: { color: 'var(--fg-3)', fontSize: 'calc(10px * var(--app-font-scale))', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  miniTrack: { height: 3, overflow: 'hidden', borderRadius: 99, background: 'var(--line)', marginTop: 8 },
  miniFill: { height: '100%', borderRadius: 99, background: 'var(--accent-3)', boxShadow: '0 0 12px color-mix(in srgb, var(--accent-3) 65%, transparent)' },
  contextRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'calc(14px * var(--app-density-scale))', flexWrap: 'wrap', padding: 'calc(10px * var(--app-density-scale)) calc(22px * var(--app-density-scale))', borderTop: '1px solid var(--line-soft)', borderBottom: '1px solid var(--line-soft)', background: 'color-mix(in srgb, var(--bg-0) 34%, transparent)' },
  legend: { display: 'flex', alignItems: 'center', gap: 'calc(11px * var(--app-density-scale))', flexWrap: 'wrap' },
  legendItem: { display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--fg-3)', fontSize: 'calc(10.5px * var(--app-font-scale))' },
  legendDot: { width: 6, height: 6, borderRadius: 99, boxShadow: '0 0 8px currentColor' },
  focusTopics: { display: 'flex', alignItems: 'center', gap: 'calc(6px * var(--app-density-scale))', minWidth: 0, flexWrap: 'wrap', justifyContent: 'flex-end' },
  focusLabel: { color: 'var(--fg-3)', fontSize: 'calc(9.5px * var(--app-font-scale))', textTransform: 'uppercase', letterSpacing: '.08em', marginRight: 2 },
  focusEmpty: { color: 'var(--fg-3)', fontSize: 'calc(10.5px * var(--app-font-scale))' },
  topicChip: { cursor: 'pointer', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  topicChipActive: { color: 'var(--accent-3)', borderColor: 'var(--accent-3)', background: 'color-mix(in srgb, var(--accent-3) 13%, transparent)' },
  tableFrame: { overflow: 'hidden' },
  tableHead: { display: 'grid', gridTemplateColumns: '42px minmax(54px, .52fr) minmax(190px, 1.75fr) minmax(70px, .55fr) minmax(96px, .76fr) minmax(70px, .48fr)', alignItems: 'center', gap: 'calc(10px * var(--app-density-scale))', padding: 'calc(11px * var(--app-density-scale)) calc(18px * var(--app-density-scale))', color: 'var(--fg-3)', fontSize: 'calc(9.5px * var(--app-font-scale))', letterSpacing: '.09em', textTransform: 'uppercase', borderBottom: '1px solid var(--line-soft)', background: 'color-mix(in srgb, var(--bg-0) 44%, transparent)' },
  taskList: { display: 'flex', flexDirection: 'column' },
  taskRow: { display: 'grid', gridTemplateColumns: '42px minmax(54px, .52fr) minmax(190px, 1.75fr) minmax(70px, .55fr) minmax(96px, .76fr) minmax(70px, .48fr)', alignItems: 'center', gap: 'calc(10px * var(--app-density-scale))', padding: 'calc(10px * var(--app-density-scale)) calc(18px * var(--app-density-scale))', borderBottom: '1px solid var(--line-soft)', background: 'transparent', transition: 'background 160ms var(--ease-out), box-shadow 160ms var(--ease-out)' },
  taskRowSelected: { background: 'linear-gradient(90deg, color-mix(in srgb, var(--accent-3) 10%, transparent), transparent 78%)', boxShadow: 'inset 3px 0 0 var(--accent-3)' },
  taskRowDone: { opacity: .72 },
  taskToggle: { width: 29, height: 29, display: 'grid', placeItems: 'center', borderRadius: 9, border: '1px solid color-mix(in srgb, var(--accent-3) 32%, var(--line))', background: 'color-mix(in srgb, var(--accent-3) 9%, transparent)', color: 'var(--accent-3)', cursor: 'pointer' },
  taskToggleDone: { color: 'var(--bg-0)', background: 'var(--ok)', borderColor: 'var(--ok)' },
  dayCell: { minWidth: 0 },
  dayNumber: { color: 'var(--fg-2)', fontSize: 'calc(10px * var(--app-font-scale))', whiteSpace: 'nowrap' },
  taskCell: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3, minWidth: 0, padding: 0, border: 0, color: 'inherit', background: 'transparent', cursor: 'pointer', textAlign: 'left' },
  taskTitle: { width: '100%', color: 'var(--fg-1)', fontSize: 'calc(12px * var(--app-font-scale))', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  taskTopic: { display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%', color: 'var(--accent-3)', fontSize: 'calc(9.5px * var(--app-font-scale))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  timeCell: { display: 'flex', alignItems: 'center', gap: 5, color: 'var(--fg-3)', fontSize: 'calc(10.5px * var(--app-font-scale))', whiteSpace: 'nowrap' },
  statusCell: { minWidth: 0 },
  stateChip: { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 7px', borderRadius: 999, border: '1px solid', fontSize: 'calc(9.5px * var(--app-font-scale))', fontWeight: 700, whiteSpace: 'nowrap' },
  stateDot: { width: 5, height: 5, borderRadius: 99 },
  xpCell: { display: 'flex', alignItems: 'center', gap: 4, color: 'var(--accent-3)', fontSize: 'calc(10px * var(--app-font-scale))', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' },
  progressFooter: { display: 'grid', gridTemplateColumns: 'minmax(160px, .7fr) minmax(180px, 1fr) minmax(146px, .65fr)', alignItems: 'center', gap: 'calc(18px * var(--app-density-scale))', padding: 'calc(16px * var(--app-density-scale)) calc(22px * var(--app-density-scale))', background: 'linear-gradient(90deg, color-mix(in srgb, var(--accent-3) 11%, var(--bg-2)), var(--bg-2))' },
  progressCopy: { minWidth: 0 },
  progressMeta: { display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent-3)', fontSize: 'calc(10px * var(--app-font-scale))', textTransform: 'uppercase', letterSpacing: '.09em', fontWeight: 700 },
  progressValue: { marginTop: 4, color: 'var(--fg-0)', fontFamily: 'var(--font-display)', fontSize: 'calc(25px * var(--app-font-scale))', lineHeight: 1 },
  progressSub: { marginTop: 5, color: 'var(--fg-3)', fontSize: 'calc(10px * var(--app-font-scale))' },
  progressTrackWrap: { minWidth: 0 },
  progressTrack: { height: 7, borderRadius: 99, overflow: 'hidden', background: 'color-mix(in srgb, var(--bg-0) 55%, var(--line))' },
  progressFill: { height: '100%', borderRadius: 99, background: 'linear-gradient(90deg, var(--accent-3), var(--ok))', boxShadow: '0 0 18px color-mix(in srgb, var(--accent-3) 68%, transparent)', transition: 'width 300ms var(--ease-out)' },
  progressHint: { marginTop: 7, color: 'var(--fg-3)', fontSize: 'calc(10px * var(--app-font-scale))', textAlign: 'right' },
  rewardCard: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'calc(9px * var(--app-density-scale))', minWidth: 0 },
  rewardIcon: { width: 35, height: 35, display: 'grid', placeItems: 'center', flexShrink: 0, borderRadius: 12, color: 'var(--bg-0)', background: 'var(--accent-3)', boxShadow: '0 0 0 3px color-mix(in srgb, var(--accent-3) 17%, transparent)' },
  rewardLabel: { color: 'var(--fg-3)', fontSize: 'calc(9px * var(--app-font-scale))', textTransform: 'uppercase', letterSpacing: '.08em' },
  rewardValue: { marginTop: 3, color: 'var(--fg-0)', fontSize: 'calc(13px * var(--app-font-scale))', fontWeight: 700, whiteSpace: 'nowrap' },
  mapRail: { minWidth: 0 },
  mapFallback: { minHeight: 320, display: 'grid', placeItems: 'center', padding: 20, borderRadius: 'var(--r-xl)', border: '1px solid var(--line)', background: 'var(--bg-1)', color: 'var(--fg-3)', fontSize: 'calc(12px * var(--app-font-scale))', textAlign: 'center' },
  emptyPlan: { minHeight: 470, display: 'grid', placeItems: 'center', alignContent: 'center', gap: 'calc(12px * var(--app-density-scale))', padding: 'calc(32px * var(--app-density-scale))', border: '1px dashed color-mix(in srgb, var(--accent-3) 36%, var(--line-strong))', borderRadius: 'var(--r-xl)', background: 'radial-gradient(circle at 50% 24%, color-mix(in srgb, var(--accent-3) 11%, transparent), transparent 38%), var(--bg-1)', color: 'var(--accent-3)', textAlign: 'center' },
  emptyIcon: { width: 44, height: 44, display: 'grid', placeItems: 'center', borderRadius: 14, background: 'color-mix(in srgb, var(--accent-3) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-3) 25%, transparent)' },
  emptyTitle: { color: 'var(--fg-0)', fontFamily: 'var(--font-display)', fontSize: 'calc(25px * var(--app-font-scale))', lineHeight: 1.15 },
  emptyCopy: { maxWidth: 440, color: 'var(--fg-2)', fontSize: 'calc(12.5px * var(--app-font-scale))', lineHeight: 1.55 },
  pickerOverlay: { position: 'fixed', inset: 0, zIndex: 2600, display: 'grid', placeItems: 'center', padding: '20px', background: 'rgba(4,4,14,.72)', backdropFilter: 'blur(12px)' },
  picker: { width: 'min(560px, 100%)', maxHeight: 'min(680px, calc(100vh - 40px))', overflow: 'auto', padding: 'calc(20px * var(--app-density-scale))', borderRadius: 'var(--r-lg)', border: '1px solid var(--line)', background: 'var(--bg-1)', boxShadow: 'var(--shadow-lg)' },
  pickerHead: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'calc(12px * var(--app-density-scale))' },
  pickerEyebrow: { fontSize: 'calc(10px * var(--app-font-scale))', color: 'var(--accent-3)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 5 },
  pickerTitle: { fontFamily: 'var(--font-display)', fontSize: 'calc(24px * var(--app-font-scale))', color: 'var(--fg-0)', lineHeight: 1.15 },
  materialList: { display: 'flex', flexDirection: 'column', gap: 'calc(8px * var(--app-density-scale))', marginTop: 'calc(18px * var(--app-density-scale))' },
  materialChoice: { display: 'flex', alignItems: 'center', gap: 'calc(10px * var(--app-density-scale))', padding: '11px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--fg-1)', fontSize: 'calc(12.5px * var(--app-font-scale))' },
  noMaterial: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'calc(12px * var(--app-density-scale))', marginTop: 'calc(18px * var(--app-density-scale))', padding: 'calc(14px * var(--app-density-scale))', borderRadius: 'var(--r-md)', background: 'var(--bg-2)', color: 'var(--fg-2)', fontSize: 'calc(12.5px * var(--app-font-scale))' },
};

window.StudyPlan = StudyPlan;
window.NoesisStudyPlanInternals = { clampPercent, sameTopic, taskStatus };
