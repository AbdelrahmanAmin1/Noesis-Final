// Progress analytics, Collaboration, Settings

const Progress = ({ onNav }) => {
  const Icon = window.Icon;
  const [data, setData] = React.useState(null);
  React.useEffect(() => { window.NoesisAPI.dashboard.progress().then(setData).catch(() => {}); }, []);
  const stats = (data && data.stats) || [
    { l: 'Mastery', v: '—', d: '', t: '', c: 'var(--ok)' },
    { l: 'Retention', v: '—', d: '', t: '', c: 'var(--accent)' },
    { l: 'Focus time', v: '—', d: '', t: '', c: 'var(--parchment)' },
    { l: 'Streak', v: '—', d: '', t: '', c: 'var(--warn)' },
  ];
  const conceptBreakdown = (data && data.concept_breakdown) || [];
  return (
    <div>
      <window.Topbar title="Progress" crumbs={['Analytics']}
        right={<><button className="btn btn-ghost">Last 30 days <Icon.ChevronDown size={11}/></button></>}
      />
      <div style={{ padding: 28, maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>The long view</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 40, fontWeight: 300, letterSpacing: '-0.02em', margin: 0 }}>
            You're <em style={{ fontStyle: 'italic', color: 'var(--accent)' }}>noticeably</em> better at this than you were six weeks ago.
          </h1>
        </div>

        {/* Top stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
          {stats.map((s, i) => (
            <div key={i} className="card" style={{ padding: 22 }}>
              <div style={{ fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>{s.l}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 44, fontWeight: 300, color: s.c }}>{s.v}</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--fg-2)', marginTop: 4 }}>{s.d}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>{s.t}</div>
            </div>
          ))}
        </div>

        {/* Mastery curve */}
        <div className="card" style={{ padding: 22, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 13, color: 'var(--fg-0)', fontWeight: 500 }}>Mastery over time</div>
              <div style={{ fontSize: 11.5, color: 'var(--fg-3)', marginTop: 2 }}>Daily rolling average across all concepts</div>
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--fg-2)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 2, background: 'var(--accent)' }}/>Mastery</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 2, background: 'var(--fg-3)', opacity: 0.4 }}/>Retention</span>
            </div>
          </div>
          <MasteryChart points={(data && data.mastery_curve) || []} retention={(data && data.retention_curve) || []}/>
        </div>

        {/* Heatmap + concept breakdown */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>
          <div className="card" style={{ padding: 22 }}>
            <div style={{ fontSize: 13, color: 'var(--fg-0)', fontWeight: 500, marginBottom: 4 }}>Concept mastery by topic</div>
            <div style={{ fontSize: 11.5, color: 'var(--fg-3)', marginBottom: 20 }}>Hover to see when each concept was last reviewed.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(conceptBreakdown.length ? conceptBreakdown : [{ t: '—', m: 0, cards: 0 }]).map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 140, fontSize: 12.5, color: 'var(--fg-1)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {c.attention && <span style={{ width: 5, height: 5, borderRadius: 3, background: 'var(--warn)' }}/>}
                    <span style={{ flex: 1 }}>{c.t}</span>
                  </div>
                  <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--bg-2)', position: 'relative', overflow: 'hidden' }}>
                    <div style={{
                      position: 'absolute', left: 0, top: 0, bottom: 0,
                      width: c.m + '%',
                      background: c.m > 70 ? 'var(--ok)' : c.m > 45 ? 'var(--accent)' : 'var(--warn)',
                      borderRadius: 4,
                    }}/>
                  </div>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--fg-2)', width: 30, textAlign: 'right' }}>{c.m}%</span>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-3)', width: 50, textAlign: 'right' }}>{c.cards} cards</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 22 }}>
            <div style={{ fontSize: 13, color: 'var(--fg-0)', fontWeight: 500, marginBottom: 20 }}>Study activity · past 12 weeks</div>
            <Heatmap data={(data && data.heatmap_12w) || null}/>
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5, color: 'var(--fg-3)' }}>
              <span>Less</span>
              {[0, 1, 2, 3, 4].map(v => (
                <span key={v} style={{ width: 10, height: 10, borderRadius: 2, background: v === 0 ? 'var(--bg-2)' : `color-mix(in oklab, var(--accent) ${v * 22}%, transparent)` }}/>
              ))}
              <span>More</span>
            </div>
          </div>
        </div>

        {/* Weekly review */}
        <div className="card" style={{ padding: 22, marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Weekly review · Apr 14–21</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400 }}>What Noēsis would say to your past self.</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ padding: 16, borderRadius: 'var(--r-md)', background: 'var(--bg-2)' }}>
              <div style={{ fontSize: 11, color: 'var(--ok)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>↑ What's working</div>
              <div style={{ fontSize: 13, color: 'var(--fg-1)', lineHeight: 1.6 }}>{data && data.weekly_review ? data.weekly_review.working : 'Build a streak by completing daily flashcards.'}</div>
            </div>
            <div style={{ padding: 16, borderRadius: 'var(--r-md)', background: 'var(--bg-2)' }}>
              <div style={{ fontSize: 11, color: 'var(--warn)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>⚠ Watch out</div>
              <div style={{ fontSize: 13, color: 'var(--fg-1)', lineHeight: 1.6 }}>{data && data.weekly_review ? data.weekly_review.watch : 'Concepts decay without review — touch them at least weekly.'}</div>
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
  const x = (i) => P + (i / (pts.length - 1)) * (W - P * 2);
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
      <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1])} r="5" fill="none" stroke="var(--accent)" strokeWidth="1.5"/>
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

window.Progress = Progress;

// Collaboration — Study Room
const Collab = ({ onNav }) => {
  const Icon = window.Icon;
  return (
    <div>
      <window.Topbar title="Study Room · Data Structures Crew" crumbs={['Rooms']}
        right={<>
          <div style={{ display: 'flex' }}>
            {['M', 'Y', 'L', 'R'].map((l, i) => (
              <div key={l} style={{
                width: 26, height: 26, borderRadius: 13,
                background: ['var(--accent)', 'var(--parchment)', 'var(--info)', 'var(--ok)'][i],
                color: 'var(--bg-0)', fontSize: 11, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px solid var(--bg-0)',
                marginLeft: i > 0 ? -8 : 0,
                fontFamily: 'var(--font-display)',
              }}>{l}</div>
            ))}
          </div>
          <button className="btn btn-ghost"><Icon.Link size={12}/> Invite</button>
          <button className="btn btn-accent"><Icon.Mic size={12}/> Voice on</button>
        </>}
      />
      <div style={co.layout}>
        {/* Left: members + focus */}
        <aside style={co.members}>
          <div style={{ padding: 18, borderBottom: '1px solid var(--line)' }}>
            <div style={{ fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>In session</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400 }}>Focus Sprint</div>
            <div style={{ fontSize: 11.5, color: 'var(--fg-2)', marginTop: 4 }}>25 min · pomodoro</div>
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ position: 'relative', width: 64, height: 64 }}>
                <svg viewBox="0 0 64 64" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="32" cy="32" r="26" stroke="var(--line)" strokeWidth="4" fill="none"/>
                  <circle cx="32" cy="32" r="26" stroke="var(--accent)" strokeWidth="4" fill="none"
                    strokeDasharray={2 * Math.PI * 26}
                    strokeDashoffset={2 * Math.PI * 26 * 0.32}
                    strokeLinecap="round"/>
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: 16 }}>17:02</div>
              </div>
              <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }}><Icon.Pause size={11}/> Pause</button>
            </div>
          </div>

          <div style={{ padding: '14px 16px', fontSize: 10.5, color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Members · 4</div>
          <div style={{ padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[
              { n: 'Maya (you)', s: 'Hash Tables ch.5', dot: 'var(--ok)' },
              { n: 'Yusuf Khalil', s: 'Flashcards · 12/18', dot: 'var(--ok)' },
              { n: 'Layla Amr', s: 'Stepped away', dot: 'var(--warn)' },
              { n: 'Ravi Patel', s: 'In tutor · Linked Lists', dot: 'var(--ok)' },
            ].map((m, i) => (
              <div key={i} style={co.member}>
                <div style={{ position: 'relative' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: ['var(--accent)', 'var(--parchment)', 'var(--info)', 'var(--ok)'][i], color: 'var(--bg-0)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{m.n[0]}</div>
                  <span style={{ position: 'absolute', bottom: -2, right: -2, width: 8, height: 8, borderRadius: 4, background: m.dot, border: '2px solid var(--bg-0)' }}/>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: 'var(--fg-0)', fontWeight: 500 }}>{m.n}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--fg-3)' }}>{m.s}</div>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Center: shared whiteboard */}
        <main style={co.board}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, color: 'var(--fg-0)', fontWeight: 500 }}>Shared notes · Hash Tables practice</div>
              <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2 }}>Maya, Yusuf, Ravi editing</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-bare"><Icon.PenNib size={13}/></button>
              <button className="btn btn-bare"><Icon.Code size={13}/></button>
              <button className="btn btn-bare"><Icon.Sparkle size={13}/></button>
            </div>
          </div>

          <div style={{ padding: 32, maxWidth: 760, margin: '0 auto', position: 'relative' }}>
            {/* cursor */}
            <div style={{ position: 'absolute', top: 90, right: 90, display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 2l5 12 2-5 5-2z" fill="var(--info)"/></svg>
              <span style={{ fontSize: 10, background: 'var(--info)', color: 'var(--bg-0)', padding: '2px 6px', borderRadius: 4, fontWeight: 500 }}>Yusuf</span>
            </div>

            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, margin: '0 0 16px' }}>Problem set 4 — warm-up</h2>

            <div style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--fg-1)' }}>
              <p><b style={{ color: 'var(--fg-0)' }}>Q1.</b> Trace a hash table with m = 8 inserting keys <code style={co.code}>[5, 28, 19, 15, 20, 33, 12, 17]</code> with h(k) = k mod 8, using linear probing.</p>
              <p style={{ color: 'var(--fg-0)' }}>Let's work through it together →</p>

              <div style={co.grid}>
                {[0,1,2,3,4,5,6,7].map(i => {
                  const filled = { 0: 8, 1: null, 2: 28, 3: 19, 4: 20, 5: 5, 6: 33, 7: 15 }[i];
                  const highlight = i === 4 || i === 5;
                  return (
                    <div key={i} style={{
                      height: 60, border: `1px solid ${highlight ? 'var(--accent)' : 'var(--line)'}`,
                      borderRadius: 'var(--r-sm)',
                      background: highlight ? 'var(--accent-glow)' : 'var(--bg-1)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      position: 'relative',
                    }}>
                      <span className="mono" style={{ fontSize: 9, color: 'var(--fg-3)', position: 'absolute', top: 4, left: 4 }}>{i}</span>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>{filled ?? '—'}</span>
                    </div>
                  );
                })}
              </div>

              <div style={co.chatLine}>
                <div style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--parchment)', color: 'var(--bg-0)', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Y</div>
                <div style={{ fontSize: 12.5, color: 'var(--fg-1)' }}>wait — <b style={{ color: 'var(--fg-0)' }}>12 mod 8 = 4</b>, but slot 4 has 20. Probe to 5? That's also taken (5).</div>
              </div>
              <div style={co.chatLine}>
                <div style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--accent)', color: 'var(--bg-0)', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>M</div>
                <div style={{ fontSize: 12.5, color: 'var(--fg-1)' }}>yeah — linear probing goes to slot 6 next. but 6 is 33. so <b>12 ends up at slot 1</b>?</div>
              </div>
              <div style={co.chatLine}>
                <div style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--accent-glow)', border: '1px solid var(--accent-soft)', color: 'var(--accent)', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon.Sparkle size={10}/></div>
                <div style={{ fontSize: 12.5, color: 'var(--fg-1)' }}>Almost. After 6 you'd try 7 (15), then wrap to 0 (8). Slot 1 is the first empty. <span style={{ color: 'var(--accent)' }}>Good chain — you're seeing the clustering effect.</span></div>
              </div>
            </div>
          </div>
        </main>

        {/* Right: voice */}
        <aside style={co.voice}>
          <div style={{ padding: 16, borderBottom: '1px solid var(--line)' }}>
            <div style={{ fontSize: 10.5, color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Voice · 3 talking</div>
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {['Yusuf K.', 'Maya (you)', 'Ravi P.'].map((n, i) => (
              <div key={n} style={co.voiceRow}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: ['var(--parchment)', 'var(--accent)', 'var(--ok)'][i], color: 'var(--bg-0)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)' }}>{n[0]}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: 'var(--fg-0)' }}>{n}</div>
                  <div style={{ display: 'flex', gap: 2, marginTop: 4, alignItems: 'flex-end', height: 12 }}>
                    {Array.from({ length: 14 }).map((_, k) => (
                      <div key={k} style={{ flex: 1, height: (i === 1 ? 3 : Math.sin(k + i) * 5 + 7) + 'px', background: 'var(--accent)', borderRadius: 1, opacity: i === 1 ? 0.3 : 0.7 }}/>
                    ))}
                  </div>
                </div>
                {i === 0 && <Icon.Mic size={12} style={{ color: 'var(--accent)' }}/>}
              </div>
            ))}
          </div>

          <div style={{ padding: 16, borderTop: '1px solid var(--line)', marginTop: 'auto' }}>
            <div style={{ fontSize: 10.5, color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Session goal</div>
            <div style={{ fontSize: 12.5, color: 'var(--fg-1)', lineHeight: 1.5 }}>Finish PS4 Q1–Q3 on hash collisions before 20:00.</div>
            <div style={{ marginTop: 10, height: 3, background: 'var(--line)', borderRadius: 2 }}>
              <div style={{ height: '100%', width: '40%', background: 'var(--accent)', borderRadius: 2 }}/>
            </div>
            <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--fg-3)' }} className="mono">Q1 solved · Q2 in progress</div>
          </div>
        </aside>
      </div>
    </div>
  );
};

const co = {
  layout: { display: 'grid', gridTemplateColumns: '260px 1fr 260px', minHeight: 'calc(100vh - 57px)' },
  members: { borderRight: '1px solid var(--line)', background: 'var(--bg-0)' },
  board: { background: 'var(--bg-0)', overflow: 'auto' },
  voice: { borderLeft: '1px solid var(--line)', display: 'flex', flexDirection: 'column', background: 'var(--bg-0)' },
  member: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 'var(--r-sm)' },
  code: { fontFamily: 'var(--font-mono)', fontSize: 12, background: 'var(--bg-2)', padding: '1px 5px', borderRadius: 3 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6, margin: '18px 0' },
  chatLine: { display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0' },
  voiceRow: { display: 'flex', alignItems: 'center', gap: 10 },
};

window.Collab = Collab;

// Settings
const Settings = ({ theme, setTheme, onLogout }) => {
  const Icon = window.Icon;
  const [tab, setTab] = React.useState('profile');
  const tabs = [
    { id: 'profile', label: 'Profile', icon: 'Users' },
    { id: 'learning', label: 'Learning style', icon: 'Brain' },
    { id: 'appearance', label: 'Appearance', icon: 'Palette' },
    { id: 'notifications', label: 'Notifications', icon: 'Bell' },
    { id: 'integrations', label: 'Integrations', icon: 'Link' },
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
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 'var(--r-sm)',
                background: active ? 'var(--bg-2)' : 'transparent',
                color: active ? 'var(--fg-0)' : 'var(--fg-2)',
                width: '100%', fontSize: 13, textAlign: 'left',
                marginBottom: 1,
                transition: 'all 140ms var(--ease-out)',
              }}>
                <C size={14}/> {t.label}
              </button>
            );
          })}
        </aside>
        <main style={{ padding: '40px 56px', maxWidth: 820, width: '100%' }} key={tab} className="fade-in">
          {tab === 'profile' && <ProfileTab/>}
          {tab === 'learning' && <LearningTab/>}
          {tab === 'appearance' && <AppearanceTab theme={theme} setTheme={setTheme}/>}
          {tab === 'notifications' && <NotifTab/>}
          {tab === 'integrations' && <IntegrationsTab/>}
          {tab === 'data' && <DataTab/>}
          {tab === 'account' && <AccountTab onLogout={onLogout}/>}
        </main>
      </div>
    </div>
  );
};

const SetHeader = ({ eyebrow, title, sub }) => (
  <div style={{ marginBottom: 28 }}>
    <div style={{ fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>{eyebrow}</div>
    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 300, letterSpacing: '-0.02em', margin: '0 0 8px' }}>{title}</h1>
    <p style={{ fontSize: 14, color: 'var(--fg-2)', margin: 0, maxWidth: 540 }}>{sub}</p>
  </div>
);

const ProfileTab = () => {
  const Icon = window.Icon;
  const [me, setMe] = React.useState(null);
  const [name, setName] = React.useState('');
  const [subject, setSubject] = React.useState('');
  const [saved, setSaved] = React.useState('');
  React.useEffect(() => {
    window.NoesisAPI.auth.me().then(d => {
      setMe(d);
      setName((d && d.user && d.user.name) || '');
      setSubject((d && d.prefs && d.prefs.subject) || '');
    }).catch(() => {});
  }, []);
  const save = async () => {
    setSaved('Saving…');
    try { await window.NoesisAPI.user.updatePrefs({ subject }); setSaved('Saved'); }
    catch (e) { setSaved('Failed: ' + (e.message || 'error')); }
  };
  return (
    <>
      <SetHeader eyebrow="Profile" title="Your learning persona." sub="How Noēsis addresses you and what it remembers across sessions."/>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 28, padding: 20, border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', background: 'var(--bg-1)' }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: 'linear-gradient(135deg, var(--accent), var(--parchment))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--bg-0)' }}>{(name || 'N').slice(0,1).toUpperCase()}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, color: 'var(--fg-0)', fontWeight: 500 }}>{name || '—'}</div>
          <div style={{ fontSize: 12, color: 'var(--fg-2)', marginTop: 2 }}>{me && me.user ? me.user.email : ''}</div>
        </div>
        <button className="btn btn-ghost" onClick={save}>{saved || 'Save'}</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <SetRow label="Display name" sub="How the tutor addresses you."><input className="input" value={name} onChange={e => setName(e.target.value)} style={{ width: 220 }}/></SetRow>
        <SetRow label="Major / focus" sub="Tailors what gets surfaced first."><input className="input" value={subject} onChange={e => setSubject(e.target.value)} style={{ width: 220 }}/></SetRow>
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
    setStatus('Saving…');
    try {
      const next = await window.NoesisAPI.user.updatePrefs(patch);
      setPrefs((p) => ({ ...(p || {}), ...next }));
      setStatus('Saved');
    } catch (e) { setStatus('Failed: ' + (e.message || 'error')); }
  };
  if (!prefs) return <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>Loading…</div>;
  const modes = ['socratic', 'explain', 'example'];
  const aggs = ['gentle', 'balanced', 'aggressive'];
  const modeIdx = Math.max(0, modes.indexOf(prefs.default_tutor_mode || 'socratic'));
  const aggIdx = Math.max(0, aggs.indexOf(prefs.srs_aggression || 'balanced'));
  return (
    <>
      <SetHeader eyebrow="Learning style" title="How do you learn best?" sub="These shape how the tutor explains, what it shows first, and when it switches modes."/>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <SetRow label="Tutor default mode" sub="What the tutor does when you start a session.">
          <Segmented options={['Socratic', 'Explain first', 'Show example']} value={modeIdx}
                     onChange={(i) => update({ default_tutor_mode: modes[i] })}/>
        </SetRow>
        <SetRow label="Daily minutes target" sub="We pace your sessions around this.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input className="input mono" type="number" min={5} max={240}
                   value={prefs.daily_minutes ?? 45}
                   onChange={(e) => setPrefs({ ...prefs, daily_minutes: parseInt(e.target.value || '45', 10) })}
                   onBlur={() => update({ daily_minutes: prefs.daily_minutes })}
                   style={{ width: 80, textAlign: 'center' }}/>
            <span style={{ fontSize: 12, color: 'var(--fg-2)' }}>min/day</span>
          </div>
        </SetRow>
        <SetRow label="Forgetting curve aggression" sub="How soon the system resurfaces 'shaky' cards.">
          <Segmented options={['Gentle', 'Balanced', 'Aggressive']} value={aggIdx}
                     onChange={(i) => update({ srs_aggression: aggs[i] })}/>
        </SetRow>
      </div>
      {status && <div style={{ marginTop: 16, fontSize: 11, color: 'var(--fg-3)' }}>{status}</div>}
    </>
  );
};

const AppearanceTab = ({ theme, setTheme }) => {
  const Icon = window.Icon;
  const themes = [
    { id: 'dark', label: 'Cosmic', sub: 'Indigo & violet on deep space — matches the brand.', preview: ['#08081a', '#1b1b3a', '#a5b4fc', '#c99afc'] },
    { id: 'studious', label: 'Studious', sub: 'Warm off-white on near-black, bronze accent.', preview: ['#0b0a09', '#1a1917', '#c9a96a', '#e8dcc0'] },
    { id: 'light', label: 'Refined', sub: 'Parchment + sage. Calm daylight for long reads.', preview: ['#f6f3ec', '#ffffff', '#6b7f5a', '#d7cdb1'] },
    { id: 'space', label: 'Violet', sub: 'Deeper purples with a nebula glow.', preview: ['#0a0a18', '#1e1e42', '#c99afc', '#8ac9ff'] },
  ];
  return (
    <>
      <SetHeader eyebrow="Appearance" title="Make it feel like yours." sub="The whole app updates instantly — pick a theme, density, and motion preference."/>

      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Theme</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {themes.map(t => {
            const active = theme === t.id;
            return (
              <button key={t.id} onClick={() => setTheme(t.id)} style={{
                textAlign: 'left', padding: 14,
                borderRadius: 'var(--r-lg)',
                border: '1px solid ' + (active ? 'var(--accent-soft)' : 'var(--line)'),
                background: 'var(--bg-1)',
                boxShadow: active ? 'var(--shadow-glow)' : 'none',
                transition: 'all 180ms var(--ease-out)',
                position: 'relative',
              }}>
                <div style={{
                  height: 72, borderRadius: 'var(--r-md)',
                  background: `linear-gradient(135deg, ${t.preview[0]} 0%, ${t.preview[1]} 60%, ${t.preview[2]} 100%)`,
                  border: '1px solid var(--line-soft)',
                  marginBottom: 12, position: 'relative', overflow: 'hidden',
                }}>
                  <div style={{ position: 'absolute', bottom: 10, left: 10, width: 22, height: 22, borderRadius: 11, background: t.preview[2] }}/>
                  <div style={{ position: 'absolute', bottom: 10, left: 36, width: 14, height: 14, borderRadius: 7, background: t.preview[3], opacity: 0.7 }}/>
                  <div style={{ position: 'absolute', top: 10, right: 10, padding: '2px 8px', background: 'rgba(255,255,255,0.08)', borderRadius: 6, fontSize: 9.5, color: t.preview[3], fontFamily: 'var(--font-mono)' }}>AA</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 500, color: 'var(--fg-0)' }}>{t.label}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--fg-2)', marginTop: 2, maxWidth: 260 }}>{t.sub}</div>
                  </div>
                  {active && <Icon.Check size={16} style={{ color: 'var(--accent)' }}/>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <SetRow label="Density" sub="Trade information for breathing room.">
          <Segmented options={['Compact', 'Default', 'Comfortable']} value={1}/>
        </SetRow>
        <SetRow label="Font size" sub="Body text scale across the app.">
          <Segmented options={['Small', 'Default', 'Large']} value={1}/>
        </SetRow>
        <SetRow label="3D & motion" sub="Animations, floating geometry, and hover physics.">
          <Toggle on={true}/>
        </SetRow>
        <SetRow label="Reduce transparency" sub="Remove blur behind nav and overlays.">
          <Toggle on={false}/>
        </SetRow>
        <SetRow label="Sidebar width" sub="">
          <input type="range" min="220" max="320" defaultValue="240" style={{ width: 180, accentColor: 'var(--accent)' }}/>
        </SetRow>
      </div>
    </>
  );
};

const ComingSoonBanner = ({ note }) => (
  <div style={{ marginBottom: 22, padding: '12px 14px', background: 'var(--bg-1)', border: '1px dashed var(--line-strong)', borderRadius: 'var(--r-md)', color: 'var(--fg-2)', fontSize: 12 }}>
    {note}
  </div>
);

const NotifTab = () => (
  <>
    <SetHeader eyebrow="Notifications" title="When should Noēsis speak up?" sub="Quiet by default. The system will only ping you for things you'd want to know."/>
    <ComingSoonBanner note="Notification delivery is on the roadmap. Settings here are not yet wired to a notifier."/>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, opacity: 0.5, pointerEvents: 'none' }}>
      <SetRow label="Daily reminder" sub="A nudge when there are cards due.">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Toggle on={true}/>
          <input className="input mono" defaultValue="19:30" style={{ width: 90 }}/>
        </div>
      </SetRow>
      <SetRow label="Weekly review email" sub="Sundays, summarizing the week."><Toggle on={true}/></SetRow>
      <SetRow label="Study room invites" sub=""><Toggle on={true}/></SetRow>
      <SetRow label="Mastery milestones" sub="When you cross a concept threshold."><Toggle on={false}/></SetRow>
      <SetRow label="Sound" sub="Subtle chime on reminder."><Toggle on={false}/></SetRow>
    </div>
  </>
);

const IntegrationsTab = () => {
  const items = [
    { t: 'Google Drive', d: 'Import lectures & PDFs directly.', connected: true },
    { t: 'Notion', d: 'Two-way sync for notes.', connected: false },
    { t: 'Canvas LMS', d: 'Pull assignments and deadlines.', connected: true },
    { t: 'Zotero', d: 'Bring in your research library.', connected: false },
  ];
  return (
    <>
      <SetHeader eyebrow="Integrations" title="Where your materials live." sub="Connect Noēsis to the tools you already use — study wherever you are."/>
      <ComingSoonBanner note="Integrations are not connected in this MVP. You can upload PDFs, DOCX, TXT, and Markdown directly via the Materials screen."/>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: 0.5, pointerEvents: 'none' }}>
        {items.map(i => (
          <div key={i.t} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16, border: '1px solid var(--line)', borderRadius: 'var(--r-md)', background: 'var(--bg-1)' }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--bg-2)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--accent)' }}>{i.t[0]}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, color: 'var(--fg-0)', fontWeight: 500 }}>{i.t}</div>
              <div style={{ fontSize: 12, color: 'var(--fg-2)', marginTop: 2 }}>{i.d}</div>
            </div>
            <button className={i.connected ? 'btn btn-ghost' : 'btn btn-accent'}>{i.connected ? 'Connected' : 'Connect'}</button>
          </div>
        ))}
      </div>
    </>
  );
};

const DataTab = () => {
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const exportData = () => {
    window.open(window.NoesisAPI.auth.exportUrl(), '_blank');
  };
  const deleteMe = async () => {
    if (!window.confirm('This permanently deletes your account and all associated data. Continue?')) return;
    setBusy(true); setStatus('Deleting…');
    try {
      await window.NoesisAPI.auth.deleteMe();
      window.dispatchEvent(new CustomEvent('noesis:logout'));
    } catch (e) { setStatus('Failed: ' + (e.message || 'error')); setBusy(false); }
  };
  return (
    <>
      <SetHeader eyebrow="Data & privacy" title="Your materials, your ownership." sub="Noēsis runs locally and never sends your data off-machine. Export or delete any time."/>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <SetRow label="Training on my data" sub="Local Ollama only — we never train on your content.">
          <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>Off (enforced)</span>
        </SetRow>
        <SetRow label="Export all data" sub="JSON bundle of profile, materials, notes, flashcards, quizzes, and study events.">
          <button className="btn btn-ghost" onClick={exportData}>Download JSON</button>
        </SetRow>
        <SetRow label="Delete account" sub="Wipes everything. Can't be undone.">
          <button className="btn btn-ghost" disabled={busy} onClick={deleteMe} style={{ color: 'var(--err)', borderColor: 'color-mix(in oklab, var(--err) 30%, var(--line))' }}>{busy ? 'Deleting…' : 'Delete…'}</button>
        </SetRow>
      </div>
      {status && <div style={{ marginTop: 12, fontSize: 11, color: 'var(--fg-3)' }}>{status}</div>}
    </>
  );
};

const AccountTab = ({ onLogout }) => {
  const Icon = window.Icon;
  const doLogout = () => {
    if (window.NoesisAPI) window.NoesisAPI.setToken('');
    onLogout && onLogout();
  };
  return (
    <>
      <SetHeader eyebrow="Account" title="Session & access." sub="Manage devices, sign out, or switch accounts."/>
      <div style={{ padding: 16, border: '1px solid var(--line)', borderRadius: 'var(--r-md)', background: 'var(--bg-1)', marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Active sessions</div>
        {[
          { d: 'MacBook Pro · Safari', l: 'Cairo · now', c: true },
          { d: 'iPhone 15 · Noēsis app', l: 'Cairo · 2h ago', c: false },
          { d: 'iPad · Safari', l: 'Alexandria · 3d ago', c: false },
        ].map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i > 0 ? '1px solid var(--line-soft)' : 'none' }}>
            <Icon.Monitor size={14} style={{ color: 'var(--fg-2)' }}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: 'var(--fg-0)' }}>{s.d}{s.c && <span className="chip chip-ok" style={{ marginLeft: 8 }}>This device</span>}</div>
              <div style={{ fontSize: 11.5, color: 'var(--fg-3)' }}>{s.l}</div>
            </div>
            {!s.c && <button className="btn btn-bare" style={{ fontSize: 12 }}>Sign out</button>}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-ghost">Change password</button>
        <button className="btn btn-ghost" onClick={doLogout} style={{ color: 'var(--err)', borderColor: 'color-mix(in oklab, var(--err) 30%, var(--line))', marginLeft: 'auto' }}>
          <Icon.LogOut size={13}/> Log out of Noēsis
        </button>
      </div>
    </>
  );
};

const Segmented = ({ options, value, onChange }) => (
  <div style={{ display: 'flex', gap: 4, padding: 2, background: 'var(--bg-2)', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)' }}>
    {options.map((m, i) => (
      <button key={m} onClick={() => onChange && onChange(i)} style={{
        padding: '6px 12px', fontSize: 12,
        background: i === value ? 'var(--bg-0)' : 'transparent',
        color: i === value ? 'var(--fg-0)' : 'var(--fg-2)',
        borderRadius: 4,
      }}>{m}</button>
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

const Toggle = ({ on }) => (
  <div style={{
    width: 36, height: 20, borderRadius: 10,
    background: on ? 'var(--accent)' : 'var(--bg-3)',
    border: '1px solid var(--line)',
    position: 'relative', cursor: 'pointer',
    transition: 'background 180ms var(--ease-out)',
  }}>
    <div style={{
      position: 'absolute', top: 2, left: on ? 18 : 2,
      width: 14, height: 14, borderRadius: 7,
      background: on ? 'var(--bg-0)' : 'var(--fg-1)',
      transition: 'left 180ms var(--ease-out)',
    }}/>
  </div>
);

window.Settings = Settings;
