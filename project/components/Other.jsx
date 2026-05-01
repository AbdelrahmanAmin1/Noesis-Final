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

  const stats = (data && data.stats) || [
    { l: 'Mastery', v: '-', d: '', t: '', c: 'var(--ok)' },
    { l: 'Retention', v: '-', d: '', t: '', c: 'var(--accent)' },
    { l: 'Focus time', v: '-', d: '', t: '', c: 'var(--parchment)' },
    { l: 'Streak', v: '-', d: '', t: '', c: 'var(--warn)' },
  ];
  const conceptBreakdown = (data && data.concept_breakdown) || [];

  return (
    <div>
      <window.Topbar title="Progress" crumbs={['Analytics']} />
      <div style={pg.page}>
        <div style={{ marginBottom: 28 }}>
          <div style={pg.eyebrow}>Real study analytics</div>
          <h1 style={pg.title}>Progress is calculated from your materials, reviews, quizzes, and study events.</h1>
          {error && <div style={pg.error}>{error}</div>}
        </div>

        <div style={pg.statsGrid}>
          {stats.map((s, i) => (
            <div key={i} className="card" style={{ padding: 22 }}>
              <div style={pg.statLabel}>{s.l}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 44, fontWeight: 300, color: s.c }}>{s.v}</div>
              <div style={{ fontSize: 11.5, color: 'var(--fg-2)', marginTop: 4 }}>{s.d}</div>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 22, marginBottom: 14 }}>
          <div style={pg.cardHead}>
            <div>
              <div style={pg.cardTitle}>Mastery over time</div>
              <div style={pg.cardSub}>Daily rolling average from logged study events</div>
            </div>
          </div>
          <MasteryChart points={(data && data.mastery_curve) || []} retention={(data && data.retention_curve) || []}/>
        </div>

        <div style={pg.twoCol}>
          <div className="card" style={{ padding: 22 }}>
            <div style={pg.cardTitle}>Concept mastery by topic</div>
            <div style={pg.cardSub}>Seeded OOP and Data Structures concepts, updated by study activity.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 18 }}>
              {conceptBreakdown.length === 0 && <div style={pg.empty}>No concept data yet.</div>}
              {conceptBreakdown.map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 150, fontSize: 12.5, color: 'var(--fg-1)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {c.attention && <span style={{ width: 5, height: 5, borderRadius: 3, background: 'var(--warn)' }}/>}
                    <span style={{ flex: 1 }}>{c.t}</span>
                  </div>
                  <div style={pg.bar}>
                    <div style={{ ...pg.barFill, width: c.m + '%', background: c.m > 70 ? 'var(--ok)' : c.m > 45 ? 'var(--accent)' : 'var(--warn)' }}/>
                  </div>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--fg-2)', width: 34, textAlign: 'right' }}>{c.m}%</span>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-3)', width: 54, textAlign: 'right' }}>{c.cards} cards</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 22 }}>
            <div style={pg.cardTitle}>Study activity</div>
            <div style={pg.cardSub}>Past 12 weeks from backend study events.</div>
            <div style={{ marginTop: 18 }}>
              <Heatmap data={(data && data.heatmap_12w) || null}/>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 22, marginTop: 14 }}>
          <div style={pg.cardTitle}>Review note</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
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
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${weeks}, 1fr)`, gap: 3 }}>
      {Array.from({ length: weeks }).map((_, w) => (
        <div key={w} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
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
  page: { padding: 28, maxWidth: 1400, margin: '0 auto' },
  eyebrow: { fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 },
  title: { fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 300, letterSpacing: '-0.02em', margin: 0, maxWidth: 780 },
  error: { marginTop: 12, color: 'var(--err)', fontSize: 12 },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 },
  statLabel: { fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 },
  cardHead: { display: 'flex', justifyContent: 'space-between', marginBottom: 20 },
  cardTitle: { fontSize: 13, color: 'var(--fg-0)', fontWeight: 500 },
  cardSub: { fontSize: 11.5, color: 'var(--fg-3)', marginTop: 4 },
  twoCol: { display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 },
  empty: { padding: 18, border: '1px dashed var(--line-strong)', borderRadius: 'var(--r-md)', color: 'var(--fg-3)', fontSize: 12 },
  bar: { flex: 1, height: 8, borderRadius: 4, background: 'var(--bg-2)', position: 'relative', overflow: 'hidden' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4 },
  reviewBox: { padding: 16, borderRadius: 'var(--r-md)', background: 'var(--bg-2)' },
  reviewText: { fontSize: 13, color: 'var(--fg-1)', lineHeight: 1.6 },
};

window.Progress = Progress;

const Settings = ({ theme, setTheme, onLogout }) => {
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
          <div style={{ fontSize: 10.5, color: 'var(--fg-3)', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '0 10px 10px' }}>Settings</div>
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
          {tab === 'appearance' && <AppearanceTab theme={theme} setTheme={setTheme}/>}
          {tab === 'data' && <DataTab/>}
          {tab === 'account' && <AccountTab onLogout={onLogout}/>}
        </main>
      </div>
    </div>
  );
};

const ProfileTab = () => {
  const [me, setMe] = React.useState(null);
  const [name, setName] = React.useState('');
  const [subject, setSubject] = React.useState('');
  const [saved, setSaved] = React.useState('');

  React.useEffect(() => {
    window.NoesisAPI.auth.me().then(d => {
      setMe(d);
      setName((d && d.user && d.user.name) || '');
      setSubject((d && d.prefs && d.prefs.subject) || (d && d.user && d.user.major) || '');
    }).catch(() => {});
  }, []);

  const save = async () => {
    setSaved('Saving...');
    try {
      const d = await window.NoesisAPI.profile.update({ name, major: subject });
      await window.NoesisAPI.user.updatePrefs({ subject });
      setMe(d);
      setSaved('Saved');
    } catch (e) {
      setSaved('Failed: ' + (e.message || 'error'));
    }
  };

  return (
    <>
      <SetHeader eyebrow="Profile" title="Your learning profile." sub="Basic account details used across the dashboard and tutor."/>
      <div style={set.profileCard}>
        <div style={set.avatar}>{(name || 'N').slice(0,1).toUpperCase()}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, color: 'var(--fg-0)', fontWeight: 500 }}>{name || '-'}</div>
          <div style={{ fontSize: 12, color: 'var(--fg-2)', marginTop: 2 }}>{me && me.user ? me.user.email : ''}</div>
        </div>
        <button className="btn btn-ghost" onClick={save}>{saved || 'Save'}</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <SetRow label="Display name" sub="How the tutor addresses you."><input className="input" value={name} onChange={e => setName(e.target.value)} style={{ width: 240 }}/></SetRow>
        <SetRow label="Focus" sub="Used for personalization and dashboard labels."><input className="input" value={subject} onChange={e => setSubject(e.target.value)} style={{ width: 240 }}/></SetRow>
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
  const update = async (patch) => {
    setStatus('Saving...');
    try {
      const next = await window.NoesisAPI.user.updatePrefs(patch);
      setPrefs((p) => ({ ...(p || {}), ...next }));
      setStatus('Saved');
    } catch (e) {
      setStatus('Failed: ' + (e.message || 'error'));
    }
  };
  if (!prefs) return <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>Loading...</div>;
  const modes = ['socratic', 'explain', 'example'];
  const aggs = ['gentle', 'balanced', 'aggressive'];
  const modeIdx = Math.max(0, modes.indexOf(prefs.default_tutor_mode || 'socratic'));
  const aggIdx = Math.max(0, aggs.indexOf(prefs.srs_aggression || 'balanced'));
  return (
    <>
      <SetHeader eyebrow="Learning style" title="How should Noesis teach?" sub="These backend preferences shape tutor mode, pacing, and flashcard scheduling."/>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <SetRow label="Tutor default mode" sub="What the tutor does when you start a session.">
          <Segmented options={['Socratic', 'Explain first', 'Show example']} value={modeIdx} onChange={(i) => update({ default_tutor_mode: modes[i] })}/>
        </SetRow>
        <SetRow label="Daily minutes target" sub="The weekly dashboard goal is calculated from this.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input className="input mono" type="number" min={5} max={240}
              value={prefs.daily_minutes ?? 45}
              onChange={(e) => setPrefs({ ...prefs, daily_minutes: parseInt(e.target.value || '45', 10) })}
              onBlur={() => update({ daily_minutes: prefs.daily_minutes })}
              style={{ width: 80, textAlign: 'center' }}/>
            <span style={{ fontSize: 12, color: 'var(--fg-2)' }}>min/day</span>
          </div>
        </SetRow>
        <SetRow label="Forgetting curve aggression" sub="How soon shaky cards resurface.">
          <Segmented options={['Gentle', 'Balanced', 'Aggressive']} value={aggIdx} onChange={(i) => update({ srs_aggression: aggs[i] })}/>
        </SetRow>
      </div>
      {status && <div style={{ marginTop: 16, fontSize: 11, color: 'var(--fg-3)' }}>{status}</div>}
    </>
  );
};

const AppearanceTab = ({ theme, setTheme }) => {
  const Icon = window.Icon;
  const themes = [
    { id: 'dark', label: 'Cosmic', preview: ['#08081a', '#1b1b3a', '#a5b4fc', '#c99afc'] },
    { id: 'studious', label: 'Studious', preview: ['#0b0a09', '#1a1917', '#c9a96a', '#e8dcc0'] },
    { id: 'light', label: 'Refined', preview: ['#f6f3ec', '#ffffff', '#6b7f5a', '#d7cdb1'] },
    { id: 'space', label: 'Violet', preview: ['#0a0a18', '#1e1e42', '#c99afc', '#8ac9ff'] },
  ];
  const [density, setDensity] = React.useState(parseInt(localStorage.getItem('noesis.density') || '1', 10));
  const [fontSize, setFontSize] = React.useState(parseInt(localStorage.getItem('noesis.fontSize') || '1', 10));
  const [motion, setMotion] = React.useState(localStorage.getItem('noesis.motion') !== 'false');
  const [reduceTrans, setReduceTrans] = React.useState(localStorage.getItem('noesis.reduceTrans') === 'true');

  return (
    <>
      <SetHeader eyebrow="Appearance" title="Make it readable." sub="Visual preferences are stored in this browser."/>
      <div style={{ marginBottom: 22 }}>
        <div style={set.smallHead}>Theme</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {themes.map(t => {
            const active = theme === t.id;
            return (
              <button key={t.id} onClick={() => setTheme(t.id)} style={{ ...set.themeButton, borderColor: active ? 'var(--accent-soft)' : 'var(--line)', boxShadow: active ? 'var(--shadow-glow)' : 'none' }}>
                <div style={{ height: 62, borderRadius: 'var(--r-md)', background: `linear-gradient(135deg, ${t.preview[0]} 0%, ${t.preview[1]} 60%, ${t.preview[2]} 100%)`, border: '1px solid var(--line-soft)', marginBottom: 10 }}/>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--fg-0)' }}>{t.label}</span>
                  {active && <Icon.Check size={16} style={{ color: 'var(--accent)' }}/>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <SetRow label="Density" sub="Controls how compact surfaces feel."><Segmented options={['Compact', 'Default', 'Comfortable']} value={density} onChange={(i) => { setDensity(i); localStorage.setItem('noesis.density', i); }}/></SetRow>
        <SetRow label="Font size" sub="Body text scale preference."><Segmented options={['Small', 'Default', 'Large']} value={fontSize} onChange={(i) => { setFontSize(i); localStorage.setItem('noesis.fontSize', i); }}/></SetRow>
        <SetRow label="Motion" sub="Enable interface motion."><Toggle on={motion} onToggle={() => { const v = !motion; setMotion(v); localStorage.setItem('noesis.motion', v); }}/></SetRow>
        <SetRow label="Reduce transparency" sub="Prefer solid surfaces."><Toggle on={reduceTrans} onToggle={() => { const v = !reduceTrans; setReduceTrans(v); localStorage.setItem('noesis.reduceTrans', v); }}/></SetRow>
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <SetRow label="Training on my data" sub="Local Ollama only; no external model training."><span style={{ fontSize: 12, color: 'var(--fg-3)' }}>Off</span></SetRow>
        <SetRow label="Export all data" sub="JSON bundle of profile, materials, notes, flashcards, quizzes, and study events."><button className="btn btn-ghost" onClick={exportData}>Download JSON</button></SetRow>
        <SetRow label="Delete account" sub="Deletes your user-owned records."><button className="btn btn-ghost" disabled={busy} onClick={deleteMe} style={{ color: 'var(--err)', borderColor: 'color-mix(in oklab, var(--err) 30%, var(--line))' }}>{busy ? 'Deleting...' : 'Delete account'}</button></SetRow>
      </div>
      {status && <div style={{ marginTop: 12, fontSize: 11, color: 'var(--fg-3)' }}>{status}</div>}
    </>
  );
};

const AccountTab = ({ onLogout }) => {
  const Icon = window.Icon;
  return (
    <>
      <SetHeader eyebrow="Account" title="Session access." sub="Manage this browser session."/>
      <div style={set.sessionBox}>
        <Icon.Monitor size={14} style={{ color: 'var(--fg-2)' }}/>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: 'var(--fg-0)' }}>Current browser<span className="chip chip-ok" style={{ marginLeft: 8 }}>This device</span></div>
          <div style={{ fontSize: 11.5, color: 'var(--fg-3)' }}>Active now</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-ghost" onClick={onLogout} style={{ color: 'var(--err)', borderColor: 'color-mix(in oklab, var(--err) 30%, var(--line))', marginLeft: 'auto' }}>
          <Icon.LogOut size={13}/> Log out
        </button>
      </div>
    </>
  );
};

const SetHeader = ({ eyebrow, title, sub }) => (
  <div style={{ marginBottom: 28 }}>
    <div style={{ fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>{eyebrow}</div>
    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 300, letterSpacing: '-0.02em', margin: '0 0 8px' }}>{title}</h1>
    <p style={{ fontSize: 14, color: 'var(--fg-2)', margin: 0, maxWidth: 540 }}>{sub}</p>
  </div>
);

const Segmented = ({ options, value, onChange }) => (
  <div style={{ display: 'flex', gap: 4, padding: 2, background: 'var(--bg-2)', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)' }}>
    {options.map((m, i) => (
      <button key={m} onClick={() => onChange && onChange(i)} style={{ padding: '6px 12px', fontSize: 12, background: i === value ? 'var(--bg-0)' : 'transparent', color: i === value ? 'var(--fg-0)' : 'var(--fg-2)', borderRadius: 4 }}>{m}</button>
    ))}
  </div>
);

const SetRow = ({ label, sub, children }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 18, borderBottom: '1px solid var(--line-soft)', gap: 40 }}>
    <div>
      <div style={{ fontSize: 13.5, color: 'var(--fg-0)', fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--fg-2)', marginTop: 2 }}>{sub}</div>
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
  tabButton: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 'var(--r-sm)', color: 'var(--fg-2)', width: '100%', fontSize: 13, textAlign: 'left', marginBottom: 1, transition: 'all 140ms var(--ease-out)' },
  tabActive: { background: 'var(--bg-2)', color: 'var(--fg-0)' },
  profileCard: { display: 'flex', alignItems: 'center', gap: 20, marginBottom: 28, padding: 20, border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', background: 'var(--bg-1)' },
  avatar: { width: 64, height: 64, borderRadius: 16, background: 'linear-gradient(135deg, var(--accent), var(--parchment))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--bg-0)' },
  smallHead: { fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 },
  themeButton: { textAlign: 'left', padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid', background: 'var(--bg-1)', transition: 'all 180ms var(--ease-out)' },
  sessionBox: { display: 'flex', alignItems: 'center', gap: 12, padding: 16, border: '1px solid var(--line)', borderRadius: 'var(--r-md)', background: 'var(--bg-1)', marginBottom: 18 },
};

window.Settings = Settings;
