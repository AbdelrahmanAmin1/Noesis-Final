// Dashboard — "Today" — the hero screen
const Dashboard = ({ onNav }) => {
  const Icon = window.Icon;
  const [hour] = React.useState(new Date().getHours());
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const [data, setData] = React.useState(null);
  const [loadError, setLoadError] = React.useState('');
  React.useEffect(() => {
    let alive = true;
    window.NoesisAPI.dashboard.get()
      .then(d => { if (alive) { setData(d); setLoadError(''); } })
      .catch(() => { if (alive) setLoadError('Could not load dashboard. Check server connection.'); });
    return () => { alive = false; };
  }, []);
  const userName = data && data.greeting ? data.greeting.name : 'there';
  const weekly = (data && data.weekly_hours) || [0,0,0,0,0,0,0];
  const totalWeek = (data && data.total_week_hours) || 0;
  const goalH = (data && data.goal_hours) || 5;
  const dueCount = (data && data.due_cards_count) || 0;
  const dueRows = (data && data.due_review_preview) || [];
  const resumeItems = (data && data.resume_items) || [];
  const conceptList = (data && data.concept_map) || [];
  const upcomingItems = (data && data.upcoming) || [];
  const insightItems = (data && data.insights) || [];
  const summary = (data && data.summary) || {};
  const recentActivity = (data && data.recent_activity) || [];
  const nextAction = data && data.next_recommended_action;
  const game = data && data.gamification;
  const xp = game && game.xp ? game.xp : {};
  const dailyGoal = game && game.daily_goal ? game.daily_goal : null;
  const recentBadges = game && game.achievements ? (game.achievements.recent || []) : [];
  const leaderboardPreview = (data && data.leaderboard_preview) || [];

  return (
    <div style={{ background: 'var(--bg-0)', minHeight: '100vh', position: 'relative' }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 420, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 70% 80% at 82% 0%, var(--accent-glow), transparent 60%)',
        opacity: 0.9,
      }}/>
      <window.Topbar
        title="Today"
        crumbs={[userName]}
        right={<button className="btn btn-ghost"><Icon.Calendar size={13}/> {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</button>}
      />

      <div style={{ ...ds.page, position: 'relative', zIndex: 1 }}>
        {loadError && (
          <div style={ds.errorBanner}>
            <Icon.X size={14}/>
            <span>{loadError}</span>
          </div>
        )}

        {/* Hero greeting */}
        <section style={ds.hero} className="reveal" >
          <div>
            <div style={ds.eyebrow}>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 3, background: 'var(--accent)', marginRight: 8, boxShadow: '0 0 8px var(--accent)' }}/>
              {greeting}, {userName}
            </div>
            <h1 style={ds.heroTitle}>
              {dueCount > 0 ? <>You have <em style={{ fontStyle: 'italic', color: 'var(--accent)' }}>{dueCount}</em> cards due — let's work through them.</> : <>A clean slate. Let's <em style={{ fontStyle: 'italic', color: 'var(--accent)' }}>start something</em>.</>}
            </h1>
            <p style={ds.heroSub}>
              You're at {totalWeek}h this week of {goalH}h goal. Pick up where you left, or start a new tutor session.
            </p>

            <div style={{ display: 'flex', gap: 'calc(10px * var(--app-density-scale))', marginTop: 'calc(24px * var(--app-density-scale))' }}>
              <button className="btn btn-accent" onClick={() => onNav(nextAction && nextAction.route || 'tutor')}>
                <Icon.Play size={12} /> {nextAction ? (nextAction.label || nextAction.title) : "Start today's session"}
              </button>
              <button className="btn btn-ghost" onClick={() => onNav('study-plan')}>
                <Icon.Calendar size={13}/> Study plan
              </button>
              <button className="btn btn-ghost" onClick={() => onNav('flashcards')}>
                <Icon.Cards size={13}/> {dueCount} cards due
              </button>
            </div>
          </div>

          {/* Focus ring visual */}
          <div style={ds.focusWrap}>
            <FocusRing value={Math.min(100, Math.round((totalWeek / Math.max(0.001, goalH)) * 100))} />
          </div>
        </section>

        <section style={ds.metrics} className="reveal">
          {[
            { l: 'Level', v: xp.level || 1 },
            { l: 'XP', v: xp.total_xp || 0 },
            { l: 'Materials', v: summary.materials || 0 },
            { l: 'Notes', v: summary.notes || 0 },
            { l: 'Flashcards', v: summary.flashcards || 0 },
            { l: 'Quizzes completed', v: summary.quizzes_completed || 0 },
            { l: 'Average score', v: (summary.average_score ?? summary.avg_score) == null ? '-' : `${summary.average_score ?? summary.avg_score}%` },
          ].map((m) => (
            <div key={m.l} className="card" style={ds.metricCard}>
              <div style={ds.metricValue}>{m.v}</div>
              <div style={ds.metricLabel}>{m.l}</div>
            </div>
          ))}
        </section>

        <section style={ds.grid} className="reveal">
          <div className="card" style={{ padding: 'calc(22px * var(--app-density-scale))' }}>
            <div style={ds.cardHead}>
              <span style={ds.cardTitle}>Level progress</span>
              <span className="chip chip-accent">{xp.weekly_xp || 0} XP this week</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 'calc(8px * var(--app-density-scale))', marginTop: 'calc(14px * var(--app-density-scale))' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 'calc(44px * var(--app-font-scale))', fontWeight: 300 }}>{xp.level || 1}</span>
              <span style={{ fontSize: 'calc(12px * var(--app-font-scale))', color: 'var(--fg-2)' }}>level</span>
            </div>
            <div style={ds.progress}>
              <div style={{ ...ds.progressFill, width: (xp.progress_pct || 0) + '%' }} />
            </div>
            <div style={{ marginTop: 'calc(10px * var(--app-density-scale))', fontSize: 'calc(11.5px * var(--app-font-scale))', color: 'var(--fg-3)' }}>{xp.xp_to_next_level || 0} XP to next level</div>
          </div>

          <div className="card" style={{ padding: 'calc(22px * var(--app-density-scale))' }}>
            <div style={ds.cardHead}>
              <span style={ds.cardTitle}>Daily goal</span>
              <Icon.Bolt size={14} style={{ color: 'var(--accent)' }}/>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 'calc(36px * var(--app-font-scale))', fontWeight: 300, marginTop: 'calc(14px * var(--app-density-scale))' }}>{dailyGoal ? dailyGoal.completed_xp : 0}/{dailyGoal ? dailyGoal.target_xp : 50}</div>
            <div style={ds.progress}>
              <div style={{ ...ds.progressFill, width: (dailyGoal ? dailyGoal.xp_progress_pct : 0) + '%' }} />
            </div>
            <div style={{ marginTop: 'calc(10px * var(--app-density-scale))', fontSize: 'calc(11.5px * var(--app-font-scale))', color: 'var(--fg-3)' }}>{dailyGoal && dailyGoal.status === 'completed' ? 'Goal complete' : 'XP target for today'}</div>
          </div>

          <div className="card" style={{ padding: 'calc(22px * var(--app-density-scale))' }}>
            <div style={ds.cardHead}>
              <span style={ds.cardTitle}>Weekly leaderboard</span>
              <button className="btn btn-bare" onClick={() => onNav('community')} style={{ fontSize: 'calc(11.5px * var(--app-font-scale))' }}>Open <Icon.ArrowRight size={11}/></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(8px * var(--app-density-scale))', marginTop: 'calc(14px * var(--app-density-scale))' }}>
              {(leaderboardPreview.length ? leaderboardPreview : [{ rank: '-', display_name: 'No XP yet', xp: 0 }]).slice(0, 4).map((row, i) => (
                <div key={row.user_id || i} style={ds.leaderRow}>
                  <span className="mono" style={{ color: 'var(--accent)', width: 28 }}>#{row.rank}</span>
                  <span style={{ flex: 1, color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.display_name}</span>
                  <span className="mono" style={{ color: 'var(--fg-3)' }}>{row.xp} XP</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Three-column work grid */}
        <section style={ds.grid} className="reveal">
          {/* Continue where you left off */}
          <div className="card" style={{ padding: 'calc(22px * var(--app-density-scale))', gridColumn: 'span 2' }}>
            <div style={ds.cardHead}>
              <span style={ds.cardTitle}>Pick up where you left</span>
              <button className="btn btn-bare" onClick={() => onNav('materials')} style={{ fontSize: 'calc(11.5px * var(--app-font-scale))' }}>See library <Icon.ArrowRight size={11}/></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'calc(10px * var(--app-density-scale))', marginTop: 'calc(14px * var(--app-density-scale))' }}>
              {(resumeItems.length ? resumeItems : [{ t: 'Upload material to get started', src: 'Library', prog: 0, chip: 'New' }]).slice(0, 2).map((c, i) => (
                <button key={i} style={ds.resumeCard} onClick={() => {
                  if (resumeItems.length && c.id) sessionStorage.setItem('noesis.materialId', String(c.id));
                  onNav(resumeItems.length ? 'material' : 'materials');
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'calc(8px * var(--app-density-scale))' }}>
                    <span className="chip">{c.chip}</span>
                    <span className="mono" style={{ fontSize: 'calc(10.5px * var(--app-font-scale))', color: 'var(--fg-3)' }}>{c.prog}%</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 'calc(20px * var(--app-font-scale))', fontWeight: 400, color: 'var(--fg-0)', margin: '10px 0 6px', letterSpacing: '-0.01em', textAlign: 'left' }}>{c.t}</div>
                  <div style={{ fontSize: 'calc(11.5px * var(--app-font-scale))', color: 'var(--fg-3)', textAlign: 'left' }}>{c.src}</div>
                  <div style={ds.progress}>
                    <div style={{ ...ds.progressFill, width: c.prog + '%' }} />
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Streak + metrics */}
          <div className="card" style={{ padding: 'calc(22px * var(--app-density-scale))' }}>
            <div style={ds.cardHead}>
              <span style={ds.cardTitle}>This week</span>
              <Icon.Flame size={14} style={{ color: 'var(--accent)' }}/>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 'calc(8px * var(--app-density-scale))', marginTop: 'calc(14px * var(--app-density-scale))' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 'calc(46px * var(--app-font-scale))', fontWeight: 300 }}>{totalWeek}</span>
              <span style={{ fontSize: 'calc(12px * var(--app-font-scale))', color: 'var(--fg-2)' }}>hrs focused</span>
            </div>
            <div style={{ display: 'flex', gap: 'calc(4px * var(--app-density-scale))', marginTop: 'calc(12px * var(--app-density-scale))' }}>
              {weekly.map((h, i) => (
                <div key={i} style={{ flex: 1 }}>
                  <div style={{
                    height: h * 12, minHeight: 3,
                    background: i === 6 ? 'var(--accent)' : 'var(--fg-4)',
                    borderRadius: 2, marginBottom: 'calc(6px * var(--app-density-scale))',
                    transition: 'all 300ms var(--ease-out)',
                  }} />
                  <div className="mono" style={{ fontSize: 'calc(9px * var(--app-font-scale))', color: 'var(--fg-3)', textAlign: 'center' }}>
                    {['M','T','W','T','F','S','S'][i]}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 'calc(16px * var(--app-density-scale))', paddingTop: 'calc(14px * var(--app-density-scale))', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', fontSize: 'calc(11.5px * var(--app-font-scale))', color: 'var(--fg-2)' }}>
              <div>Streak: <span style={{ color: 'var(--ok)' }}>{(data && data.streak_days) || 0}d</span></div>
              <div>Goal: {goalH}h</div>
            </div>
          </div>
        </section>

        {/* Second row */}
        <section style={ds.grid}>
          {/* Spaced rep queue */}
          <div className="card" style={{ padding: 'calc(22px * var(--app-density-scale))' }}>
            <div style={ds.cardHead}>
              <span style={ds.cardTitle}>Due for review</span>
              <span className="chip chip-accent">{dueCount} cards</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(10px * var(--app-density-scale))', marginTop: 'calc(14px * var(--app-density-scale))' }}>
              {(dueRows.length ? dueRows : [{ q: 'Generate flashcards from a material to start reviewing.', t: '—', conf: 'good' }]).slice(0, 3).map((r, i) => (
                <div key={i} style={ds.reviewRow}>
                  <span style={{ ...ds.dot, background: r.conf === 'shaky' ? 'var(--err)' : r.conf === 'ok' ? 'var(--warn)' : 'var(--ok)' }}/>
                  <span style={{ fontSize: 'calc(13px * var(--app-font-scale))', color: 'var(--fg-1)', flex: 1 }}>{r.q}</span>
                  <span style={{ fontSize: 'calc(10.5px * var(--app-font-scale))', color: 'var(--fg-3)' }} className="mono">{r.t}</span>
                </div>
              ))}
            </div>
            <button className="btn btn-ghost" onClick={() => onNav('flashcards')} style={{ marginTop: 'calc(14px * var(--app-density-scale))', width: '100%', justifyContent: 'center' }}>
              Review now <Icon.ArrowRight size={12}/>
            </button>
          </div>

          {/* Concepts map */}
          <div className="card" style={{ padding: 'calc(22px * var(--app-density-scale))' }}>
            <div style={ds.cardHead}>
              <span style={ds.cardTitle}>Concept mastery</span>
              <button className="btn btn-bare" style={{ fontSize: 'calc(11.5px * var(--app-font-scale))' }} onClick={() => onNav('progress')}>Open <Icon.ArrowUpRight size={11}/></button>
            </div>
            <ConceptMap concepts={conceptList} />
          </div>

          {/* Upcoming */}
          <div className="card" style={{ padding: 'calc(22px * var(--app-density-scale))' }}>
            <div style={ds.cardHead}>
              <span style={ds.cardTitle}>On the horizon</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(12px * var(--app-density-scale))', marginTop: 'calc(14px * var(--app-density-scale))' }}>
              {(upcomingItems.length ? upcomingItems : [{ d: 'Course', dn: '-', t: 'No active course tracks', sub: 'Complete onboarding to add OOP and Data Structures', tint: 'default' }]).map((u, i) => (
                <div key={i} style={ds.upcoming}>
                  <div style={{ ...ds.dateBox, borderColor: u.tint === 'warn' ? 'var(--warn)' : u.tint === 'accent' ? 'var(--accent-soft)' : 'var(--line-strong)' }}>
                    <div className="mono" style={{ fontSize: 'calc(9px * var(--app-font-scale))', color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{u.d}</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 'calc(22px * var(--app-font-scale))', color: 'var(--fg-0)', lineHeight: 1 }}>{u.dn}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 'calc(13px * var(--app-font-scale))', color: 'var(--fg-0)', fontWeight: 500 }}>{u.t}</div>
                    <div style={{ fontSize: 'calc(11.5px * var(--app-font-scale))', color: 'var(--fg-3)', marginTop: 'calc(2px * var(--app-density-scale))' }}>{u.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* AI suggestions */}
        <section className="card" style={{ padding: 'calc(22px * var(--app-density-scale))', marginBottom: 'calc(40px * var(--app-density-scale))' }}>
          <div style={ds.cardHead}>
            <span style={ds.cardTitle}><Icon.Sparkle size={13} style={{ color: 'var(--accent)' }}/> Noēsis noticed</span>
            <span style={{ fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)' }}>{recentActivity.length} recent event{recentActivity.length === 1 ? '' : 's'}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'calc(12px * var(--app-density-scale))', marginTop: 'calc(14px * var(--app-density-scale))' }}>
            {insightItems.map((s, i) => {
              const C = Icon[s.icon] || Icon.Sparkle;
              return (
                <div key={i} style={ds.insight}>
                  <C size={15} style={{ color: 'var(--accent)' }}/>
                  <div style={{ fontSize: 'calc(13px * var(--app-font-scale))', color: 'var(--fg-0)', fontWeight: 500, margin: '8px 0 4px' }}>{s.t}</div>
                  <div style={{ fontSize: 'calc(12px * var(--app-font-scale))', color: 'var(--fg-2)' }}>{s.d}</div>
                  <button className="btn btn-bare" onClick={() => s.route && onNav(s.route)} style={{ marginTop: 'calc(10px * var(--app-density-scale))', padding: '4px 0', fontSize: 'calc(12px * var(--app-font-scale))', color: 'var(--accent)' }}>
                    {s.cta} <Icon.ArrowRight size={11}/>
                  </button>
                </div>
              );
            })}
          </div>
          {recentActivity.length > 0 && (
            <div style={{ marginTop: 'calc(16px * var(--app-density-scale))', paddingTop: 'calc(14px * var(--app-density-scale))', borderTop: '1px solid var(--line)', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'calc(10px * var(--app-density-scale))' }}>
              {recentActivity.slice(0, 4).map((a, i) => (
                <div key={i} style={{ fontSize: 'calc(11.5px * var(--app-font-scale))', color: 'var(--fg-2)' }}>
                  <span style={{ color: 'var(--fg-0)', textTransform: 'capitalize' }}>{a.kind}</span>
                  <div style={{ marginTop: 'calc(3px * var(--app-density-scale))', color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title || 'Activity'}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {recentBadges.length > 0 && (
          <section className="card" style={{ padding: 'calc(22px * var(--app-density-scale))', marginBottom: 'calc(40px * var(--app-density-scale))' }}>
            <div style={ds.cardHead}>
              <span style={ds.cardTitle}>Recent achievements</span>
              <button className="btn btn-bare" onClick={() => onNav('community')} style={{ fontSize: 'calc(11.5px * var(--app-font-scale))' }}>Community <Icon.ArrowRight size={11}/></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 'calc(10px * var(--app-density-scale))', marginTop: 'calc(14px * var(--app-density-scale))' }}>
              {recentBadges.slice(0, 5).map(b => {
                const C = Icon[b.icon] || Icon.Star;
                return (
                  <div key={b.code} style={ds.badgeCard}>
                    <C size={15} style={{ color: 'var(--accent)' }}/>
                    <div style={{ fontSize: 'calc(12.5px * var(--app-font-scale))', color: 'var(--fg-0)', marginTop: 'calc(8px * var(--app-density-scale))', fontWeight: 500 }}>{b.name}</div>
                    <div style={{ fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)', marginTop: 'calc(4px * var(--app-density-scale))' }}>{b.description}</div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

const FocusRing = ({ value = 0 }) => {
  const [v, setV] = React.useState(0);
  React.useEffect(() => { const id = setTimeout(() => setV(value), 100); return () => clearTimeout(id); }, [value]);
  const circ = 2 * Math.PI * 72;
  return (
    <div style={{ position: 'relative', width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width="200" height="200" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="100" cy="100" r="72" stroke="var(--line)" strokeWidth="8" fill="none"/>
        <circle cx="100" cy="100" r="72" stroke="var(--accent)" strokeWidth="8" fill="none"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - v/100)}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1.5s var(--ease-out)' }}
        />
        <circle cx="100" cy="100" r="52" stroke="var(--line-soft)" strokeWidth="1" fill="none"/>
      </svg>
      <div style={{ position: 'absolute', textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 'calc(44px * var(--app-font-scale))', fontWeight: 300, color: 'var(--fg-0)', lineHeight: 1 }}>
          {v}<span style={{ fontSize: 'calc(18px * var(--app-font-scale))', color: 'var(--fg-2)' }}>%</span>
        </div>
        <div style={{ fontSize: 'calc(10.5px * var(--app-font-scale))', color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 'calc(4px * var(--app-density-scale))' }}>Weekly focus</div>
      </div>
    </div>
  );
};

const ConceptMap = ({ concepts: input }) => {
  const positions = [
    { x: 20, y: 30, r: 24 }, { x: 55, y: 25, r: 20 },
    { x: 85, y: 45, r: 18 }, { x: 30, y: 65, r: 22 },
    { x: 62, y: 72, r: 16 }, { x: 88, y: 80, r: 12 },
    { x: 12, y: 80, r: 14 }, { x: 70, y: 50, r: 18 },
  ];
  const src = (input && input.length ? input : []).slice(0, positions.length);
  if (!src.length) {
    return <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-3)', fontSize: 'calc(12px * var(--app-font-scale))' }}>No concept data yet.</div>;
  }
  const concepts = src.map((c, i) => ({ ...positions[i], name: c.name, m: c.mastery_pct ?? c.m ?? 0 }));
  const color = (m) => m > 70 ? 'var(--ok)' : m > 45 ? 'var(--accent)' : m > 25 ? 'var(--warn)' : 'var(--err)';
  return (
    <div style={{ position: 'relative', height: 180, marginTop: 'calc(10px * var(--app-density-scale))' }}>
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
        {concepts.map((a, i) => concepts.slice(i + 1).map((b, j) => (
          <line key={`${i}-${j}`} x1={`${a.x}%`} y1={`${a.y}%`} x2={`${b.x}%`} y2={`${b.y}%`}
            stroke="var(--line)" strokeWidth="0.6" strokeDasharray="2,2" opacity="0.6"/>
        )))}
      </svg>
      {concepts.map((c, i) => (
        <div key={i} style={{
          position: 'absolute', left: `${c.x}%`, top: `${c.y}%`,
          transform: 'translate(-50%, -50%)',
          width: c.r * 2, height: c.r * 2, borderRadius: '50%',
          background: `radial-gradient(circle, ${color(c.m)} 0%, transparent 75%)`,
          opacity: 0.35 + c.m / 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: 6, height: 6, borderRadius: 3, background: color(c.m) }}/>
          <span style={{ position: 'absolute', top: '100%', marginTop: 'calc(4px * var(--app-density-scale))', fontSize: 'calc(9.5px * var(--app-font-scale))', color: 'var(--fg-2)', whiteSpace: 'nowrap' }} className="mono">{c.name}</span>
        </div>
      ))}
    </div>
  );
};

const ds = {
  page: { padding: '28px', maxWidth: 1400, margin: '0 auto' },
  errorBanner: {
    display: 'flex', alignItems: 'center', gap: 'calc(8px * var(--app-density-scale))',
    padding: '10px 12px', marginBottom: 'calc(14px * var(--app-density-scale))',
    borderRadius: 'var(--r-sm)', border: '1px solid var(--err)',
    color: 'var(--err)', background: 'color-mix(in oklab, var(--err) 10%, transparent)',
    fontSize: 'calc(12.5px * var(--app-font-scale))',
  },
  hero: {
    display: 'grid', gridTemplateColumns: '1fr auto',
    gap: 'calc(40px * var(--app-density-scale))', alignItems: 'center',
    padding: '24px 0 32px',
  },
  metrics: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 'calc(10px * var(--app-density-scale))', marginBottom: 'calc(14px * var(--app-density-scale))' },
  metricCard: { padding: '14px 16px' },
  metricValue: { fontFamily: 'var(--font-display)', fontSize: 'calc(28px * var(--app-font-scale))', fontWeight: 300, color: 'var(--fg-0)' },
  metricLabel: { fontSize: 'calc(10.5px * var(--app-font-scale))', color: 'var(--fg-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 'calc(4px * var(--app-density-scale))' },
  eyebrow: { fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'calc(14px * var(--app-density-scale))' },
  heroTitle: { fontFamily: 'var(--font-display)', fontSize: 'calc(44px * var(--app-font-scale))', fontWeight: 300, letterSpacing: '-0.02em', lineHeight: 1.1, margin: '0 0 14px', maxWidth: 680 },
  heroSub: { fontSize: 'calc(14px * var(--app-font-scale))', color: 'var(--fg-2)', margin: 0, maxWidth: 560 },
  link: { color: 'var(--accent)', cursor: 'pointer', borderBottom: '1px dotted var(--accent-soft)' },
  focusWrap: { padding: 'calc(10px * var(--app-density-scale))' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'calc(14px * var(--app-density-scale))', marginBottom: 'calc(14px * var(--app-density-scale))' },
  cardHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 'calc(13px * var(--app-font-scale))', color: 'var(--fg-1)', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 'calc(8px * var(--app-density-scale))' },
  resumeCard: {
    padding: 'calc(16px * var(--app-density-scale))', borderRadius: 'var(--r-md)',
    background: 'var(--bg-2)', border: '1px solid var(--line)',
    textAlign: 'left', display: 'flex', flexDirection: 'column',
    transition: 'all 180ms var(--ease-out)',
  },
  progress: { marginTop: 'calc(14px * var(--app-density-scale))', height: 3, background: 'var(--line)', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', background: 'var(--accent)', borderRadius: 2, transition: 'width 600ms var(--ease-out)' },
  reviewRow: { display: 'flex', alignItems: 'center', gap: 'calc(10px * var(--app-density-scale))' },
  dot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  upcoming: { display: 'flex', gap: 'calc(12px * var(--app-density-scale))', alignItems: 'center' },
  dateBox: {
    width: 48, height: 48, borderRadius: 'var(--r-sm)',
    border: '1px solid', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 'calc(2px * var(--app-density-scale))', flexShrink: 0,
    background: 'var(--bg-1)',
  },
  insight: {
    padding: 'calc(14px * var(--app-density-scale))', borderRadius: 'var(--r-md)',
    background: 'var(--bg-2)', border: '1px solid var(--line)',
  },
  leaderRow: { display: 'flex', alignItems: 'center', gap: 'calc(8px * var(--app-density-scale))', padding: '8px 0', borderBottom: '1px solid var(--line-soft)', fontSize: 'calc(12px * var(--app-font-scale))' },
  badgeCard: { padding: 'calc(14px * var(--app-density-scale))', borderRadius: 'var(--r-md)', background: 'var(--bg-2)', border: '1px solid var(--line)' },
};

window.Dashboard = Dashboard;
