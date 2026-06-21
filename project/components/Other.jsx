// Progress analytics and Settings

const Progress = ({ onNav }) => {
  const Icon = window.Icon;
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    window.NoesisAPI.dashboard.progress()
      .then(d => { setData(d); setError(''); })
      .catch(e => setError(e.message || 'Failed to load progress'));
  }, []);

  const game = data && data.gamification;
  const baseStats = (data && data.stats) || [
    { l: 'Mastery', v: '-', d: '', t: '', c: 'var(--ok)' },
    { l: 'Retention', v: '-', d: '', t: '', c: 'var(--accent)' },
    { l: 'Focus time', v: '-', d: '', t: '', c: 'var(--parchment)' },
    { l: 'Streak', v: '-', d: '', t: '', c: 'var(--warn)' },
  ];
  const stats = game && game.xp ? [
    { l: 'Level', v: game.xp.level || 1, d: `${game.xp.total_xp || 0} total XP`, t: '', c: 'var(--accent)' },
    { l: 'Weekly XP', v: game.xp.weekly_xp || 0, d: 'earned this week', t: '', c: 'var(--parchment)' },
    ...baseStats,
  ] : baseStats;
  const conceptBreakdown = (data && data.concept_breakdown) || [];

  return (
    <div>
      <window.Topbar title="Progress" crumbs={['Analytics']} />
      <div style={pg.page}>
        <div style={{ marginBottom: 'calc(28px * var(--app-density-scale))' }}>
          <div style={pg.eyebrow}>Real study analytics</div>
          <h1 style={pg.title}>Progress is calculated from your materials, reviews, quizzes, and study events.</h1>
          {error && <div style={pg.error}>{error}</div>}
        </div>

        <div style={pg.statsGrid}>
          {stats.map((s, i) => (
            <div key={i} className="card" style={{ padding: 'calc(22px * var(--app-density-scale))' }}>
              <div style={pg.statLabel}>{s.l}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 'calc(44px * var(--app-font-scale))', fontWeight: 300, color: s.c }}>{s.v}</div>
              <div style={{ fontSize: 'calc(11.5px * var(--app-font-scale))', color: 'var(--fg-2)', marginTop: 'calc(4px * var(--app-density-scale))' }}>{s.d}</div>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 'calc(22px * var(--app-density-scale))', marginBottom: 'calc(14px * var(--app-density-scale))' }}>
          <div style={pg.cardHead}>
            <div>
              <div style={pg.cardTitle}>Mastery over time</div>
              <div style={pg.cardSub}>Daily rolling average from logged study events</div>
            </div>
          </div>
          <MasteryChart points={(data && data.mastery_curve) || []} retention={(data && data.retention_curve) || []}/>
        </div>

        <div style={pg.twoCol}>
          <div className="card" style={{ padding: 'calc(22px * var(--app-density-scale))' }}>
            <div style={pg.cardTitle}>Concept mastery by topic</div>
            <div style={pg.cardSub}>Seeded OOP and Data Structures concepts, updated by study activity.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(8px * var(--app-density-scale))', marginTop: 'calc(18px * var(--app-density-scale))' }}>
              {conceptBreakdown.length === 0 && <div style={pg.empty}>No concept data yet.</div>}
              {conceptBreakdown.map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'calc(14px * var(--app-density-scale))' }}>
                  <div style={{ width: 150, fontSize: 'calc(12.5px * var(--app-font-scale))', color: 'var(--fg-1)', display: 'flex', alignItems: 'center', gap: 'calc(6px * var(--app-density-scale))' }}>
                    {c.attention && <span style={{ width: 5, height: 5, borderRadius: 3, background: 'var(--warn)' }}/>}
                    <span style={{ flex: 1 }}>{c.t}</span>
                  </div>
                  <div style={pg.bar}>
                    <div style={{ ...pg.barFill, width: c.m + '%', background: c.m > 70 ? 'var(--ok)' : c.m > 45 ? 'var(--accent)' : 'var(--warn)' }}/>
                  </div>
                  <span className="mono" style={{ fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-2)', width: 34, textAlign: 'right' }}>{c.m}%</span>
                  <span className="mono" style={{ fontSize: 'calc(10.5px * var(--app-font-scale))', color: 'var(--fg-3)', width: 54, textAlign: 'right' }}>{c.cards} cards</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 'calc(22px * var(--app-density-scale))' }}>
            <div style={pg.cardTitle}>Study activity</div>
            <div style={pg.cardSub}>Past 12 weeks from backend study events.</div>
            <div style={{ marginTop: 'calc(18px * var(--app-density-scale))' }}>
              <Heatmap data={(data && data.heatmap_12w) || null}/>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 'calc(22px * var(--app-density-scale))', marginTop: 'calc(14px * var(--app-density-scale))' }}>
          <div style={pg.cardTitle}>Review note</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'calc(14px * var(--app-density-scale))', marginTop: 'calc(14px * var(--app-density-scale))' }}>
            <div style={pg.reviewBox}>
              <div style={{ ...pg.eyebrow, color: 'var(--ok)' }}>Working</div>
              <div style={pg.reviewText}>{data && data.weekly_review ? data.weekly_review.working : 'No study activity logged yet.'}</div>
            </div>
            <div style={pg.reviewBox}>
              <div style={{ ...pg.eyebrow, color: 'var(--warn)' }}>Watch</div>
              <div style={pg.reviewText}>{data && data.weekly_review ? data.weekly_review.watch : 'Generate notes, flashcards, or quizzes to populate analytics.'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const MasteryChart = ({ points, retention }) => {
  const pts = points && points.length ? points : Array.from({ length: 16 }, () => 0);
  const ret = retention && retention.length ? retention : Array.from({ length: 16 }, () => 0);
  const W = 900, H = 220, P = 20;
  const x = (i) => P + (i / Math.max(1, pts.length - 1)) * (W - P * 2);
  const y = (v) => H - P - (v / 100) * (H - P * 2);
  const line = (arr) => arr.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`).join(' ');
  const area = line(pts) + ` L ${x(pts.length - 1)} ${H - P} L ${x(0)} ${H - P} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 220 }}>
      <defs>
        <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.3"/>
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0"/>
        </linearGradient>
      </defs>
      {[0, 25, 50, 75, 100].map(v => (
        <g key={v}>
          <line x1={P} x2={W - P} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray="2,3"/>
          <text x={P - 4} y={y(v) + 3} fontSize="9" fill="var(--fg-3)" textAnchor="end" fontFamily="var(--font-mono)">{v}</text>
        </g>
      ))}
      <path d={area} fill="url(#area)"/>
      <path d={line(ret)} stroke="var(--fg-3)" strokeWidth="1.5" fill="none" strokeDasharray="3,3" opacity="0.5"/>
      <path d={line(pts)} stroke="var(--accent)" strokeWidth="1.8" fill="none"/>
      {pts.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="2.5" fill="var(--accent)"/>)}
    </svg>
  );
};

const Heatmap = ({ data: input }) => {
  const weeks = 12, days = 7;
  const data = (Array.isArray(input) && input.length === weeks * days)
    ? input
    : Array.from({ length: weeks * days }).fill(0);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${weeks}, 1fr)`, gap: 'calc(3px * var(--app-density-scale))' }}>
      {Array.from({ length: weeks }).map((_, w) => (
        <div key={w} style={{ display: 'flex', flexDirection: 'column', gap: 'calc(3px * var(--app-density-scale))' }}>
          {Array.from({ length: days }).map((_, d) => {
            const v = data[w * days + d];
            return <div key={d} style={{ aspectRatio: '1', borderRadius: 2, background: v === 0 ? 'var(--bg-2)' : `color-mix(in oklab, var(--accent) ${v * 22}%, transparent)` }}/>;
          })}
        </div>
      ))}
    </div>
  );
};

const pg = {
  page: { padding: 'calc(28px * var(--app-density-scale))', maxWidth: 1400, margin: '0 auto' },
  eyebrow: { fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'calc(8px * var(--app-density-scale))' },
  title: { fontFamily: 'var(--font-display)', fontSize: 'calc(38px * var(--app-font-scale))', fontWeight: 300, letterSpacing: '-0.02em', margin: 0, maxWidth: 780 },
  error: { marginTop: 'calc(12px * var(--app-density-scale))', color: 'var(--err)', fontSize: 'calc(12px * var(--app-font-scale))' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 'calc(14px * var(--app-density-scale))', marginBottom: 'calc(20px * var(--app-density-scale))' },
  statLabel: { fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 'calc(12px * var(--app-density-scale))' },
  cardHead: { display: 'flex', justifyContent: 'space-between', marginBottom: 'calc(20px * var(--app-density-scale))' },
  cardTitle: { fontSize: 'calc(13px * var(--app-font-scale))', color: 'var(--fg-0)', fontWeight: 500 },
  cardSub: { fontSize: 'calc(11.5px * var(--app-font-scale))', color: 'var(--fg-3)', marginTop: 'calc(4px * var(--app-density-scale))' },
  twoCol: { display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 'calc(14px * var(--app-density-scale))' },
  empty: { padding: 'calc(18px * var(--app-density-scale))', border: '1px dashed var(--line-strong)', borderRadius: 'var(--r-md)', color: 'var(--fg-3)', fontSize: 'calc(12px * var(--app-font-scale))' },
  bar: { flex: 1, height: 8, borderRadius: 4, background: 'var(--bg-2)', position: 'relative', overflow: 'hidden' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4 },
  reviewBox: { padding: 'calc(16px * var(--app-density-scale))', borderRadius: 'var(--r-md)', background: 'var(--bg-2)' },
  reviewText: { fontSize: 'calc(13px * var(--app-font-scale))', color: 'var(--fg-1)', lineHeight: 1.6 },
};

window.Progress = Progress;

const Settings = ({ theme, setTheme, appearance, setAppearance, onLogout }) => {
  const Icon = window.Icon;
  const [tab, setTab] = React.useState('profile');
  const tabs = [
    { id: 'profile', label: 'Profile', icon: 'Users' },
    { id: 'learning', label: 'Learning style', icon: 'Brain' },
    { id: 'appearance', label: 'Appearance', icon: 'Palette' },
    { id: 'data', label: 'Data & privacy', icon: 'Lock' },
    { id: 'account', label: 'Account', icon: 'LogOut' },
  ];

  return (
    <div>
      <window.Topbar title="Settings"/>
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', minHeight: 'calc(100vh - 57px)' }}>
        <aside style={{ borderRight: '1px solid var(--line)', padding: '22px 12px', background: 'var(--bg-1)' }}>
          <div style={{ fontSize: 'calc(10.5px * var(--app-font-scale))', color: 'var(--fg-3)', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '0 10px 10px' }}>Settings</div>
          {tabs.map(t => {
            const C = Icon[t.icon];
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ ...set.tabButton, ...(active ? set.tabActive : {}) }}>
                <C size={14}/> {t.label}
              </button>
            );
          })}
        </aside>
        <main style={{ padding: '40px 56px', maxWidth: 820, width: '100%' }} key={tab} className="fade-in">
          {tab === 'profile' && <ProfileTab/>}
          {tab === 'learning' && <LearningTab/>}
          {tab === 'appearance' && <AppearanceTab theme={theme} setTheme={setTheme} appearance={appearance} setAppearance={setAppearance}/>}
          {tab === 'data' && <DataTab/>}
          {tab === 'account' && <AccountTab onLogout={onLogout}/>}
        </main>
      </div>
    </div>
  );
};

const TRACK_OPTIONS = [
  { id: 'computer-science', label: 'Both', description: 'OOP + Data Structures' },
  { id: 'oop', label: 'OOP', description: 'Object-Oriented Programming' },
  { id: 'data-structures', label: 'Data Structures', description: 'Data Structures' },
];

function normalizeSubjectChoice(value) {
  const raw = String(value || '').toLowerCase();
  const hasDs = /data.?struct|\bds\b/.test(raw);
  const hasOop = /oop|object|java/.test(raw);
  if (/both|computer.?science|cs\b|combined|all/.test(raw) || (hasDs && hasOop)) return 'computer-science';
  if (hasDs) return 'data-structures';
  if (hasOop) return 'oop';
  return 'computer-science';
}

function subjectChoiceLabel(value) {
  const id = normalizeSubjectChoice(value);
  const option = TRACK_OPTIONS.find(item => item.id === id) || TRACK_OPTIONS[0];
  return option.description;
}

const ProfileTab = () => {
  const [me, setMe] = React.useState(null);
  const [name, setName] = React.useState('');
  const [subject, setSubject] = React.useState('');
  const [saved, setSaved] = React.useState('');

  React.useEffect(() => {
    window.NoesisAPI.auth.me().then(d => {
      setMe(d);
      setName((d && d.user && d.user.name) || '');
      setSubject(normalizeSubjectChoice((d && d.prefs && d.prefs.subject) || (d && d.user && d.user.major) || 'computer-science'));
    }).catch(() => {});
  }, []);

  const save = async () => {
    setSaved('Saving...');
    try {
      const track = normalizeSubjectChoice(subject);
      const d = await window.NoesisAPI.profile.update({ name, major: subjectChoiceLabel(track) });
      await window.NoesisAPI.user.updatePrefs({ subject: track });
      setMe(d);
      setSaved('Saved');
    } catch (e) {
      setSaved('Failed: ' + (e.message || 'error'));
    }
  };

  const trackIdx = Math.max(0, TRACK_OPTIONS.findIndex(option => option.id === normalizeSubjectChoice(subject)));

  return (
    <>
      <SetHeader eyebrow="Profile" title="Your learning profile." sub="Basic account details used across the dashboard and tutor."/>
      <div style={set.profileCard}>
        <div style={set.avatar}>{(name || 'N').slice(0,1).toUpperCase()}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 'calc(16px * var(--app-font-scale))', color: 'var(--fg-0)', fontWeight: 500 }}>{name || '-'}</div>
          <div style={{ fontSize: 'calc(12px * var(--app-font-scale))', color: 'var(--fg-2)', marginTop: 'calc(2px * var(--app-density-scale))' }}>{me && me.user ? me.user.email : ''}</div>
        </div>
        <button className="btn btn-ghost" onClick={save}>{saved || 'Save'}</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(18px * var(--app-density-scale))' }}>
        <SetRow label="Display name" sub="How the tutor addresses you."><input className="input" value={name} onChange={e => setName(e.target.value)} style={{ width: 240 }}/></SetRow>
        <SetRow label="Curriculum track" sub="Used for the Study Plan map and dashboard labels. Refresh your plan after changing it.">
          <Segmented options={TRACK_OPTIONS.map(option => option.label)} value={trackIdx} onChange={(i) => setSubject(TRACK_OPTIONS[i].id)}/>
        </SetRow>
      </div>
    </>
  );
};

const LearningTab = () => {
  const [prefs, setPrefs] = React.useState(null);
  const [status, setStatus] = React.useState('');
  React.useEffect(() => {
    window.NoesisAPI.user.getPrefs().then(p => setPrefs(p || {})).catch(() => setPrefs({}));
  }, []);
  const update = async (patch, savedMessage = 'Saved') => {
    setStatus('Saving...');
    try {
      const next = await window.NoesisAPI.user.updatePrefs(patch);
      setPrefs((p) => ({ ...(p || {}), ...next }));
      setStatus(savedMessage);
    } catch (e) {
      setStatus('Failed: ' + (e.message || 'error'));
    }
  };
  if (!prefs) return <div style={{ fontSize: 'calc(12px * var(--app-font-scale))', color: 'var(--fg-3)' }}>Loading...</div>;
  const modes = ['socratic', 'explain', 'example'];
  const aggs = ['gentle', 'balanced', 'aggressive'];
  const goals = [
    { id: 'exams', label: 'Exams', effect: 'Quizzes, weak topics, and exam-ready notes first.' },
    { id: 'understand', label: 'Deep', effect: 'Tutor sessions and concept gaps first.' },
    { id: 'retain', label: 'Retain', effect: 'Due cards and spaced review first.' },
    { id: 'practice', label: 'Practice', effect: 'Practice quizzes and mistake review first.' },
  ];
  const modeIdx = Math.max(0, modes.indexOf(prefs.default_tutor_mode || 'socratic'));
  const aggIdx = Math.max(0, aggs.indexOf(prefs.srs_aggression || 'balanced'));
  const goalIdx = Math.max(0, goals.findIndex(g => g.id === (prefs.goal || 'exams')));
  const activeGoal = goals[goalIdx] || goals[0];
  return (
    <>
      <SetHeader eyebrow="Learning style" title="How should Noesis teach?" sub="These backend preferences shape tutor mode, pacing, and flashcard scheduling."/>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(18px * var(--app-density-scale))' }}>
        <SetRow label="Study goal" sub={`Affects dashboard recommendations and study-plan task mix. ${activeGoal.effect}`}>
          <Segmented options={goals.map(g => g.label)} value={goalIdx} onChange={(i) => update({ goal: goals[i].id }, 'Saved - dashboard suggestions and future study plans will use this goal.')}/>
        </SetRow>
        <SetRow label="Tutor default mode" sub="What the tutor does when you start a session.">
          <Segmented options={['Socratic', 'Explain first', 'Show example']} value={modeIdx} onChange={(i) => update({ default_tutor_mode: modes[i] })}/>
        </SetRow>
        <SetRow label="Daily minutes target" sub="The weekly dashboard goal is calculated from this.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'calc(8px * var(--app-density-scale))' }}>
            <input className="input mono" type="number" min={5} max={240}
              value={prefs.daily_minutes ?? 45}
              onChange={(e) => setPrefs({ ...prefs, daily_minutes: parseInt(e.target.value || '45', 10) })}
              onBlur={() => update({ daily_minutes: prefs.daily_minutes })}
              style={{ width: 80, textAlign: 'center' }}/>
            <span style={{ fontSize: 'calc(12px * var(--app-font-scale))', color: 'var(--fg-2)' }}>min/day</span>
          </div>
        </SetRow>
        <SetRow label="Forgetting curve aggression" sub="How soon shaky cards resurface.">
          <Segmented options={['Gentle', 'Balanced', 'Aggressive']} value={aggIdx} onChange={(i) => update({ srs_aggression: aggs[i] })}/>
        </SetRow>
      </div>
      {status && <div style={{ marginTop: 'calc(16px * var(--app-density-scale))', fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)' }}>{status}</div>}
    </>
  );
};

const AppearanceTab = ({ theme, setTheme, appearance, setAppearance }) => {
  const Icon = window.Icon;
  const themes = [
    { id: 'dark', label: 'Cosmic', preview: ['#08081a', '#1b1b3a', '#a5b4fc', '#c99afc'] },
    { id: 'studious', label: 'Studious', preview: ['#0b0a09', '#1a1917', '#c9a96a', '#e8dcc0'] },
    { id: 'light', label: 'Refined', preview: ['#f6f3ec', '#ffffff', '#6b7f5a', '#d7cdb1'] },
    { id: 'space', label: 'Violet', preview: ['#0a0a18', '#1e1e42', '#c99afc', '#8ac9ff'] },
  ];
  const normalized = window.NoesisAppearance && window.NoesisAppearance.normalizeAppearance
    ? window.NoesisAppearance.normalizeAppearance(appearance || {})
    : { density: 'default', fontSize: 'default', motion: true, reduceTransparency: false };
  const densityOptions = (window.NoesisAppearance && window.NoesisAppearance.densityScales) || [{ key: 'compact' }, { key: 'default' }, { key: 'comfortable' }];
  const fontOptions = (window.NoesisAppearance && window.NoesisAppearance.fontScales) || [{ key: 'small' }, { key: 'default' }, { key: 'large' }];
  const density = Math.max(0, densityOptions.findIndex((option) => option.key === normalized.density));
  const fontSize = Math.max(0, fontOptions.findIndex((option) => option.key === normalized.fontSize));

  return (
    <>
      <SetHeader eyebrow="Appearance" title="Make it readable." sub="Visual preferences are stored in this browser."/>
      <div style={{ marginBottom: 'calc(22px * var(--app-density-scale))' }}>
        <div style={set.smallHead}>Theme</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'calc(12px * var(--app-density-scale))' }}>
          {themes.map(t => {
            const active = theme === t.id;
            return (
              <button key={t.id} onClick={() => setTheme(t.id)} style={{ ...set.themeButton, borderColor: active ? 'var(--accent-soft)' : 'var(--line)', boxShadow: active ? 'var(--shadow-glow)' : 'none' }}>
                <div style={{ height: 62, borderRadius: 'var(--r-md)', background: `linear-gradient(135deg, ${t.preview[0]} 0%, ${t.preview[1]} 60%, ${t.preview[2]} 100%)`, border: '1px solid var(--line-soft)', marginBottom: 'calc(10px * var(--app-density-scale))' }}/>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 'calc(16px * var(--app-font-scale))', color: 'var(--fg-0)' }}>{t.label}</span>
                  {active && <Icon.Check size={16} style={{ color: 'var(--accent)' }}/>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(18px * var(--app-density-scale))' }}>
        <SetRow label="Density" sub="Controls how compact surfaces feel."><Segmented options={['Compact', 'Default', 'Comfortable']} value={density} onChange={(i) => setAppearance && setAppearance({ density: densityOptions[i].key })}/></SetRow>
        <SetRow label="Font size" sub="Body text scale preference."><Segmented options={['Small', 'Default', 'Large']} value={fontSize} onChange={(i) => setAppearance && setAppearance({ fontSize: fontOptions[i].key })}/></SetRow>
        <SetRow label="Motion" sub="Enable interface motion."><Toggle on={normalized.motion} onToggle={() => setAppearance && setAppearance({ motion: !normalized.motion })}/></SetRow>
        <SetRow label="Reduce transparency" sub="Prefer solid surfaces."><Toggle on={normalized.reduceTransparency} onToggle={() => setAppearance && setAppearance({ reduceTransparency: !normalized.reduceTransparency })}/></SetRow>
      </div>
    </>
  );
};

const DataTab = () => {
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const exportData = () => window.open(window.NoesisAPI.auth.exportUrl(), '_blank');
  const deleteMe = async () => {
    if (!window.confirm('This permanently deletes your account and all associated data. Continue?')) return;
    setBusy(true); setStatus('Deleting...');
    try {
      await window.NoesisAPI.auth.deleteMe();
      window.dispatchEvent(new CustomEvent('noesis:logout'));
    } catch (e) {
      setStatus('Failed: ' + (e.message || 'error'));
      setBusy(false);
    }
  };
  return (
    <>
      <SetHeader eyebrow="Data & privacy" title="Your materials, your ownership." sub="Export or delete all backend data tied to this account."/>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(18px * var(--app-density-scale))' }}>
        <SetRow label="Training on my data" sub="Local Ollama only; no external model training."><span style={{ fontSize: 'calc(12px * var(--app-font-scale))', color: 'var(--fg-3)' }}>Off</span></SetRow>
        <SetRow label="Export all data" sub="JSON bundle of profile, materials, notes, flashcards, quizzes, and study events."><button className="btn btn-ghost" onClick={exportData}>Download JSON</button></SetRow>
        <SetRow label="Delete account" sub="Deletes your user-owned records."><button className="btn btn-ghost" disabled={busy} onClick={deleteMe} style={{ color: 'var(--err)', borderColor: 'color-mix(in oklab, var(--err) 30%, var(--line))' }}>{busy ? 'Deleting...' : 'Delete account'}</button></SetRow>
      </div>
      {status && <div style={{ marginTop: 'calc(12px * var(--app-density-scale))', fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)' }}>{status}</div>}
    </>
  );
};

const AccountTab = ({ onLogout }) => {
  const Icon = window.Icon;
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const submitPassword = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setSuccess('');
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Current, new, and confirmation passwords are required.');
      return;
    }
    if (!window.NoesisPasswordPolicy.isValid(newPassword)) {
      setError(window.NoesisPasswordPolicy.message);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    setBusy(true);
    try {
      await window.NoesisAPI.user.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Password updated successfully.');
    } catch (e) {
      const messages = {
        invalid_current_password: 'Current password is incorrect.',
        missing_fields: 'Current and new passwords are required.',
        password_requirements_not_met: window.NoesisPasswordPolicy.message,
        password_too_long: 'Password must be 256 characters or fewer.',
      };
      setError(messages[e.code] || e.message || 'Password update failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SetHeader eyebrow="Account" title="Account security." sub="Update your password and manage this browser session."/>
      <form onSubmit={submitPassword} style={set.passwordForm}>
        <div style={set.smallHead}>Change password</div>
        <label style={set.fieldLabel}>
          Current password
          <input className="input" type="password" autoComplete="current-password" value={currentPassword} disabled={busy} onChange={e => setCurrentPassword(e.target.value)} />
        </label>
        <label style={set.fieldLabel}>
          New password
          <input className="input" type="password" autoComplete="new-password" value={newPassword} disabled={busy} onChange={e => setNewPassword(e.target.value)} placeholder="8+ characters, uppercase, and number" />
        </label>
        <label style={set.fieldLabel}>
          Confirm new password
          <input className="input" type="password" autoComplete="new-password" value={confirmPassword} disabled={busy} onChange={e => setConfirmPassword(e.target.value)} />
        </label>
        {error && <div role="alert" style={{ color: 'var(--err)', fontSize: 'calc(12px * var(--app-font-scale))' }}>{error}</div>}
        {success && <div role="status" style={{ color: 'var(--ok)', fontSize: 'calc(12px * var(--app-font-scale))' }}>{success}</div>}
        <button type="submit" className="btn btn-primary" disabled={busy} style={{ alignSelf: 'flex-start', opacity: busy ? 0.6 : 1 }}>
          <Icon.Lock size={13}/> {busy ? 'Updating...' : 'Update password'}
        </button>
      </form>
      <div style={set.sessionBox}>
        <Icon.Monitor size={14} style={{ color: 'var(--fg-2)' }}/>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 'calc(13px * var(--app-font-scale))', color: 'var(--fg-0)' }}>Current browser<span className="chip chip-ok" style={{ marginLeft: 8 }}>This device</span></div>
          <div style={{ fontSize: 'calc(11.5px * var(--app-font-scale))', color: 'var(--fg-3)' }}>Active now</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 'calc(10px * var(--app-density-scale))' }}>
        <button className="btn btn-ghost" onClick={onLogout} style={{ color: 'var(--err)', borderColor: 'color-mix(in oklab, var(--err) 30%, var(--line))', marginLeft: 'auto' }}>
          <Icon.LogOut size={13}/> Log out
        </button>
      </div>
    </>
  );
};

const SetHeader = ({ eyebrow, title, sub }) => (
  <div style={{ marginBottom: 'calc(28px * var(--app-density-scale))' }}>
    <div style={{ fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 'calc(10px * var(--app-density-scale))' }}>{eyebrow}</div>
    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'calc(34px * var(--app-font-scale))', fontWeight: 300, letterSpacing: '-0.02em', margin: '0 0 8px' }}>{title}</h1>
    <p style={{ fontSize: 'calc(14px * var(--app-font-scale))', color: 'var(--fg-2)', margin: 0, maxWidth: 540 }}>{sub}</p>
  </div>
);

const Segmented = ({ options, value, onChange }) => (
  <div style={{ display: 'flex', gap: 'calc(4px * var(--app-density-scale))', padding: 'calc(2px * var(--app-density-scale))', background: 'var(--bg-2)', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)' }}>
    {options.map((m, i) => (
      <button key={m} onClick={() => onChange && onChange(i)} style={{ padding: '6px 12px', fontSize: 'calc(12px * var(--app-font-scale))', background: i === value ? 'var(--bg-0)' : 'transparent', color: i === value ? 'var(--fg-0)' : 'var(--fg-2)', borderRadius: 4 }}>{m}</button>
    ))}
  </div>
);

const SetRow = ({ label, sub, children }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 'calc(18px * var(--app-density-scale))', borderBottom: '1px solid var(--line-soft)', gap: 'calc(40px * var(--app-density-scale))' }}>
    <div>
      <div style={{ fontSize: 'calc(13.5px * var(--app-font-scale))', color: 'var(--fg-0)', fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 'calc(12px * var(--app-font-scale))', color: 'var(--fg-2)', marginTop: 'calc(2px * var(--app-density-scale))' }}>{sub}</div>
    </div>
    <div style={{ flexShrink: 0 }}>{children}</div>
  </div>
);

const Toggle = ({ on, onToggle }) => (
  <div onClick={onToggle} style={{ width: 36, height: 20, borderRadius: 10, background: on ? 'var(--accent)' : 'var(--bg-3)', border: '1px solid var(--line)', position: 'relative', cursor: onToggle ? 'pointer' : 'default', transition: 'background 180ms var(--ease-out)' }}>
    <div style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 14, height: 14, borderRadius: 7, background: on ? 'var(--bg-0)' : 'var(--fg-1)', transition: 'left 180ms var(--ease-out)' }}/>
  </div>
);

const set = {
  tabButton: { display: 'flex', alignItems: 'center', gap: 'calc(10px * var(--app-density-scale))', padding: '9px 12px', borderRadius: 'var(--r-sm)', color: 'var(--fg-2)', width: '100%', fontSize: 'calc(13px * var(--app-font-scale))', textAlign: 'left', marginBottom: 'calc(1px * var(--app-density-scale))', transition: 'all 140ms var(--ease-out)' },
  tabActive: { background: 'var(--bg-2)', color: 'var(--fg-0)' },
  profileCard: { display: 'flex', alignItems: 'center', gap: 'calc(20px * var(--app-density-scale))', marginBottom: 'calc(28px * var(--app-density-scale))', padding: 'calc(20px * var(--app-density-scale))', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', background: 'var(--bg-1)' },
  avatar: { width: 64, height: 64, borderRadius: 16, background: 'linear-gradient(135deg, var(--accent), var(--parchment))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: 'calc(28px * var(--app-font-scale))', color: 'var(--bg-0)' },
  smallHead: { fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'calc(12px * var(--app-density-scale))' },
  passwordForm: { display: 'flex', flexDirection: 'column', gap: 'calc(14px * var(--app-density-scale))', maxWidth: 420, paddingBottom: 'calc(28px * var(--app-density-scale))', marginBottom: 'calc(28px * var(--app-density-scale))', borderBottom: '1px solid var(--line-soft)' },
  fieldLabel: { display: 'flex', flexDirection: 'column', gap: 'calc(6px * var(--app-density-scale))', fontSize: 'calc(12px * var(--app-font-scale))', color: 'var(--fg-2)' },
  themeButton: { textAlign: 'left', padding: 'calc(14px * var(--app-density-scale))', borderRadius: 'var(--r-lg)', border: '1px solid', background: 'var(--bg-1)', transition: 'all 180ms var(--ease-out)' },
  sessionBox: { display: 'flex', alignItems: 'center', gap: 'calc(12px * var(--app-density-scale))', padding: 'calc(16px * var(--app-density-scale))', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', background: 'var(--bg-1)', marginBottom: 'calc(18px * var(--app-density-scale))' },
};

window.Settings = Settings;
