// Dashboard — "Today" — the hero screen
const Dashboard = ({ onNav }) => {
  const Icon = window.Icon;
  const [hour] = React.useState(new Date().getHours());
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const [data, setData] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    window.NoesisAPI.dashboard.get()
      .then(d => { if (alive) setData(d); })
      .catch(() => {});
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

            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button className="btn btn-accent" onClick={() => onNav('tutor')}>
                <Icon.Play size={12} /> Start today's session
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

        {/* Three-column work grid */}
        <section style={ds.grid} className="reveal">
          {/* Continue where you left off */}
          <div className="card" style={{ padding: 22, gridColumn: 'span 2' }}>
            <div style={ds.cardHead}>
              <span style={ds.cardTitle}>Pick up where you left</span>
              <button className="btn btn-bare" style={{ fontSize: 11.5 }}>See library <Icon.ArrowRight size={11}/></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
              {(resumeItems.length ? resumeItems : [{ t: 'Upload material to get started', src: 'Library', prog: 0, chip: 'New' }]).slice(0, 2).map((c, i) => (
                <button key={i} style={ds.resumeCard} onClick={() => {
                  if (resumeItems.length && c.id) sessionStorage.setItem('noesis.materialId', String(c.id));
                  onNav(resumeItems.length ? 'material' : 'materials');
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="chip">{c.chip}</span>
                    <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-3)' }}>{c.prog}%</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400, color: 'var(--fg-0)', margin: '10px 0 6px', letterSpacing: '-0.01em', textAlign: 'left' }}>{c.t}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--fg-3)', textAlign: 'left' }}>{c.src}</div>
                  <div style={ds.progress}>
                    <div style={{ ...ds.progressFill, width: c.prog + '%' }} />
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Streak + metrics */}
          <div className="card" style={{ padding: 22 }}>
            <div style={ds.cardHead}>
              <span style={ds.cardTitle}>This week</span>
              <Icon.Flame size={14} style={{ color: 'var(--accent)' }}/>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 14 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 46, fontWeight: 300 }}>{totalWeek}</span>
              <span style={{ fontSize: 12, color: 'var(--fg-2)' }}>hrs focused</span>
            </div>
            <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>
              {weekly.map((h, i) => (
                <div key={i} style={{ flex: 1 }}>
                  <div style={{
                    height: h * 12, minHeight: 3,
                    background: i === 6 ? 'var(--accent)' : 'var(--fg-4)',
                    borderRadius: 2, marginBottom: 6,
                    transition: 'all 300ms var(--ease-out)',
                  }} />
                  <div className="mono" style={{ fontSize: 9, color: 'var(--fg-3)', textAlign: 'center' }}>
                    {['M','T','W','T','F','S','S'][i]}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--fg-2)' }}>
              <div>Streak: <span style={{ color: 'var(--ok)' }}>{(data && data.streak_days) || 0}d</span></div>
              <div>Goal: {goalH}h</div>
            </div>
          </div>
        </section>

        {/* Second row */}
        <section style={ds.grid}>
          {/* Spaced rep queue */}
          <div className="card" style={{ padding: 22 }}>
            <div style={ds.cardHead}>
              <span style={ds.cardTitle}>Due for review</span>
              <span className="chip chip-accent">{dueCount} cards</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
              {(dueRows.length ? dueRows : [{ q: 'Generate flashcards from a material to start reviewing.', t: '—', conf: 'good' }]).slice(0, 3).map((r, i) => (
                <div key={i} style={ds.reviewRow}>
                  <span style={{ ...ds.dot, background: r.conf === 'shaky' ? 'var(--err)' : r.conf === 'ok' ? 'var(--warn)' : 'var(--ok)' }}/>
                  <span style={{ fontSize: 13, color: 'var(--fg-1)', flex: 1 }}>{r.q}</span>
                  <span style={{ fontSize: 10.5, color: 'var(--fg-3)' }} className="mono">{r.t}</span>
                </div>
              ))}
            </div>
            <button className="btn btn-ghost" onClick={() => onNav('flashcards')} style={{ marginTop: 14, width: '100%', justifyContent: 'center' }}>
              Review now <Icon.ArrowRight size={12}/>
            </button>
          </div>

          {/* Concepts map */}
          <div className="card" style={{ padding: 22 }}>
            <div style={ds.cardHead}>
              <span style={ds.cardTitle}>Concept mastery</span>
              <button className="btn btn-bare" style={{ fontSize: 11.5 }} onClick={() => onNav('progress')}>Open <Icon.ArrowUpRight size={11}/></button>
            </div>
            <ConceptMap concepts={conceptList} />
          </div>

          {/* Upcoming */}
          <div className="card" style={{ padding: 22 }}>
            <div style={ds.cardHead}>
              <span style={ds.cardTitle}>On the horizon</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
              {(upcomingItems.length ? upcomingItems : [{ d: '—', dn: '·', t: 'No upcoming items', sub: 'Add courses in Settings', tint: 'default' }]).map((u, i) => (
                <div key={i} style={ds.upcoming}>
                  <div style={{ ...ds.dateBox, borderColor: u.tint === 'warn' ? 'var(--warn)' : u.tint === 'accent' ? 'var(--accent-soft)' : 'var(--line-strong)' }}>
                    <div className="mono" style={{ fontSize: 9, color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{u.d}</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--fg-0)', lineHeight: 1 }}>{u.dn}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--fg-0)', fontWeight: 500 }}>{u.t}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--fg-3)', marginTop: 2 }}>{u.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* AI suggestions */}
        <section className="card" style={{ padding: 22, marginBottom: 40 }}>
          <div style={ds.cardHead}>
            <span style={ds.cardTitle}><Icon.Sparkle size={13} style={{ color: 'var(--accent)' }}/> Noēsis noticed</span>
            <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>updated 6 minutes ago</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 14 }}>
            {insightItems.map((s, i) => {
              const C = Icon[s.icon];
              return (
                <div key={i} style={ds.insight}>
                  <C size={15} style={{ color: 'var(--accent)' }}/>
                  <div style={{ fontSize: 13, color: 'var(--fg-0)', fontWeight: 500, margin: '8px 0 4px' }}>{s.t}</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-2)' }}>{s.d}</div>
                  <button className="btn btn-bare" style={{ marginTop: 10, padding: '4px 0', fontSize: 12, color: 'var(--accent)' }}>
                    {s.cta} <Icon.ArrowRight size={11}/>
                  </button>
                </div>
              );
            })}
          </div>
        </section>
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
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 44, fontWeight: 300, color: 'var(--fg-0)', lineHeight: 1 }}>
          {v}<span style={{ fontSize: 18, color: 'var(--fg-2)' }}>%</span>
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 4 }}>Weekly focus</div>
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
  const fallback = [
    { name: 'Arrays', m: 0 }, { name: 'Linked Lists', m: 0 },
    { name: 'Stacks', m: 0 }, { name: 'Hash Tables', m: 0 },
    { name: 'Trees', m: 0 }, { name: 'Graphs', m: 0 },
  ];
  const src = (input && input.length ? input : fallback).slice(0, positions.length);
  const concepts = src.map((c, i) => ({ ...positions[i], name: c.name, m: c.mastery_pct ?? c.m ?? 0 }));
  const color = (m) => m > 70 ? 'var(--ok)' : m > 45 ? 'var(--accent)' : m > 25 ? 'var(--warn)' : 'var(--err)';
  return (
    <div style={{ position: 'relative', height: 180, marginTop: 10 }}>
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
          <span style={{ position: 'absolute', top: '100%', marginTop: 4, fontSize: 9.5, color: 'var(--fg-2)', whiteSpace: 'nowrap' }} className="mono">{c.name}</span>
        </div>
      ))}
    </div>
  );
};

const ds = {
  page: { padding: '28px', maxWidth: 1400, margin: '0 auto' },
  hero: {
    display: 'grid', gridTemplateColumns: '1fr auto',
    gap: 40, alignItems: 'center',
    padding: '24px 0 32px',
  },
  eyebrow: { fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 },
  heroTitle: { fontFamily: 'var(--font-display)', fontSize: 44, fontWeight: 300, letterSpacing: '-0.02em', lineHeight: 1.1, margin: '0 0 14px', maxWidth: 680 },
  heroSub: { fontSize: 14, color: 'var(--fg-2)', margin: 0, maxWidth: 560 },
  link: { color: 'var(--accent)', cursor: 'pointer', borderBottom: '1px dotted var(--accent-soft)' },
  focusWrap: { padding: 10 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 14 },
  cardHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 13, color: 'var(--fg-1)', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 8 },
  resumeCard: {
    padding: 16, borderRadius: 'var(--r-md)',
    background: 'var(--bg-2)', border: '1px solid var(--line)',
    textAlign: 'left', display: 'flex', flexDirection: 'column',
    transition: 'all 180ms var(--ease-out)',
  },
  progress: { marginTop: 14, height: 3, background: 'var(--line)', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', background: 'var(--accent)', borderRadius: 2, transition: 'width 600ms var(--ease-out)' },
  reviewRow: { display: 'flex', alignItems: 'center', gap: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  upcoming: { display: 'flex', gap: 12, alignItems: 'center' },
  dateBox: {
    width: 48, height: 48, borderRadius: 'var(--r-sm)',
    border: '1px solid', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 2, flexShrink: 0,
    background: 'var(--bg-1)',
  },
  insight: {
    padding: 14, borderRadius: 'var(--r-md)',
    background: 'var(--bg-2)', border: '1px solid var(--line)',
  },
};

window.Dashboard = Dashboard;
