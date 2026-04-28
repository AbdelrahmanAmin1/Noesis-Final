// Auth + Onboarding screens

const Auth = ({ onComplete }) => {
  const Icon = window.Icon;
  const [mode, setMode] = React.useState('signin');
  const [name, setName] = React.useState('Maya Abdelrahman');
  const [email, setEmail] = React.useState('maya@aucegypt.edu');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    setError('');
    if (!email || !password) { setError('Email and password are required'); return; }
    setBusy(true);
    try {
      const fn = mode === 'signin' ? window.NoesisAPI.auth.signin : window.NoesisAPI.auth.signup;
      const payload = mode === 'signin' ? { email, password } : { email, password, name };
      await fn(payload);
      // Cookie is set server-side; localStorage is no longer used for auth.
      onComplete && onComplete(mode === 'signin');
    } catch (e) {
      setError(e.message || 'Auth failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={as.page}>
      <div style={as.left}>
        <window.Logo size={20} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: 380 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 14 }}>
            {mode === 'signin' ? 'Welcome back' : 'Create account'}
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 40, fontWeight: 300, margin: '0 0 12px', letterSpacing: '-0.02em' }}>
            {mode === 'signin' ? 'Back to the desk.' : 'Begin the work.'}
          </h1>
          <p style={{ fontSize: 14, color: 'var(--fg-2)', margin: '0 0 32px' }}>
            {mode === 'signin' ? 'Your materials and streak are waiting.' : 'Set up a learning workspace in 60 seconds.'}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {mode === 'signup' && (
              <div style={as.field}>
                <label style={as.label}>Full name</label>
                <input className="input" placeholder="Maya Abdelrahman" value={name} onChange={e => setName(e.target.value)} />
              </div>
            )}
            <div style={as.field}>
              <label style={as.label}>Email</label>
              <input className="input" placeholder="you@university.edu" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div style={as.field}>
              <label style={as.label}>Password</label>
              <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" />
            </div>
          </div>

          {error && <div style={{ color: 'var(--err)', fontSize: 12, marginTop: 12 }}>{error}</div>}

          <button className="btn btn-primary" onClick={submit} disabled={busy} style={{ marginTop: 20, padding: '12px 14px', justifyContent: 'center', opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Working…' : (mode === 'signin' ? 'Continue' : 'Create account')} <Icon.ArrowRight size={14} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0', color: 'var(--fg-3)', fontSize: 11 }}>
            <span style={{ flex: 1, height: 1, background: 'var(--line)' }} /> or <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }}>Google</button>
            <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }}>University SSO</button>
          </div>

          <div style={{ marginTop: 24, fontSize: 12.5, color: 'var(--fg-2)' }}>
            {mode === 'signin' ? "New here?" : "Already have an account?"}{' '}
            <a onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')} style={{ color: 'var(--accent)', cursor: 'pointer' }}>
              {mode === 'signin' ? 'Create an account' : 'Sign in'}
            </a>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>We use SSO when possible. Your notes never train external models.</div>
      </div>
      <div style={as.right}>
        <div style={as.quote}>
          <Icon.Quote size={28} style={{ color: 'var(--accent)', opacity: 0.6 }}/>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 300, lineHeight: 1.3, letterSpacing: '-0.015em', margin: '18px 0' }}>
            I stopped cramming. Noēsis gave my semester a shape.
          </p>
          <div style={{ fontSize: 12, color: 'var(--fg-2)' }}>Yusuf K. — CS '27, TA for Data Structures</div>
        </div>
      </div>
    </div>
  );
};

const as = {
  page: { display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: '100vh' },
  left: { padding: '40px 56px', display: 'flex', flexDirection: 'column', gap: 24 },
  right: {
    background: 'var(--bg-1)', borderLeft: '1px solid var(--line)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 56,
    backgroundImage: 'radial-gradient(ellipse at 30% 20%, var(--accent-glow), transparent 60%)',
  },
  quote: { maxWidth: 420 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.04em' },
};

// Onboarding — 4 steps, feels like a conversation
const Onboarding = ({ onComplete }) => {
  const Icon = window.Icon;
  const [step, setStep] = React.useState(0);
  const [subject, setSubject] = React.useState('cs');
  const [courses, setCourses] = React.useState(['oop', 'ds']);
  const [goal, setGoal] = React.useState('exams');
  const [time, setTime] = React.useState(45);

  const steps = [
    { title: 'What are you studying?', sub: 'We\'ll tune the library and tutor to your field.' },
    { title: 'Which courses this semester?', sub: 'Add what you\'re actively taking. You can add more later.' },
    { title: 'What\'s the goal?', sub: 'This shapes your weekly plan and notifications.' },
    { title: 'How much time per day?', sub: 'We\'ll pace your sessions around this.' },
  ];

  const [busy, setBusy] = React.useState(false);
  const next = async () => {
    if (step < 3) { setStep(step + 1); return; }
    setBusy(true);
    try {
      const courseCatalog = {
        oop: { code: 'CSCI 2301', title: 'Object-Oriented Programming', professor: 'Dr. Farag' },
        ds: { code: 'CSCI 3411', title: 'Data Structures & Algorithms', professor: 'Dr. Samy' },
        la: { code: 'MATH 2101', title: 'Linear Algebra', professor: 'Dr. Hossam' },
        dm: { code: 'CSCI 2102', title: 'Discrete Mathematics', professor: 'Dr. Khaled' },
      };
      const courseObjs = courses.map(id => courseCatalog[id]).filter(Boolean);
      await window.NoesisAPI.auth.onboarding({ subject, goal, daily_minutes: time, courses: courseObjs });
    } catch (e) { /* swallow; still go to dashboard */ }
    finally { setBusy(false); onComplete(); }
  };

  return (
    <div style={os.page}>
      <header style={os.header}>
        <window.Logo size={18} />
        <div style={os.progress}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{
              height: 3, flex: 1, borderRadius: 2,
              background: i <= step ? 'var(--accent)' : 'var(--line)',
              transition: 'background 400ms var(--ease-out)',
            }} />
          ))}
        </div>
        <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>{step + 1} / 4</span>
      </header>

      <main style={os.main}>
        <div key={step} className="fade-in" style={{ maxWidth: 640, width: '100%' }}>
          <div style={os.eyebrow}>Step {String(step + 1).padStart(2, '0')}</div>
          <h1 style={os.title}>{steps[step].title}</h1>
          <p style={os.sub}>{steps[step].sub}</p>

          <div style={{ marginTop: 36 }}>
            {step === 0 && (
              <div style={os.grid3}>
                {[
                  { id: 'cs', label: 'Computer Science', icon: 'Code' },
                  { id: 'math', label: 'Mathematics', icon: 'Hash' },
                  { id: 'eng', label: 'Engineering', icon: 'Layers' },
                  { id: 'bio', label: 'Life Sciences', icon: 'Tree' },
                  { id: 'biz', label: 'Business', icon: 'Chart' },
                  { id: 'other', label: 'Something else', icon: 'Sparkle' },
                ].map(o => {
                  const C = Icon[o.icon];
                  const active = subject === o.id;
                  return (
                    <button key={o.id} onClick={() => setSubject(o.id)} style={{ ...os.tile, ...(active ? os.tileActive : {}) }}>
                      <C size={20} style={{ color: active ? 'var(--accent)' : 'var(--fg-2)' }} />
                      <span style={{ fontSize: 13, color: active ? 'var(--fg-0)' : 'var(--fg-1)' }}>{o.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {step === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { id: 'oop', label: 'CSCI 2301 · Object-Oriented Programming', prof: 'Dr. Farag · TR 11:00' },
                  { id: 'ds', label: 'CSCI 3411 · Data Structures & Algorithms', prof: 'Dr. Samy · MW 14:30' },
                  { id: 'la', label: 'MATH 2101 · Linear Algebra', prof: 'Dr. Hossam · MWF 09:00' },
                  { id: 'dm', label: 'CSCI 2102 · Discrete Mathematics', prof: 'Dr. Khaled · TR 08:30' },
                ].map(c => {
                  const on = courses.includes(c.id);
                  return (
                    <button key={c.id} onClick={() => setCourses(on ? courses.filter(x => x !== c.id) : [...courses, c.id])}
                      style={{ ...os.course, ...(on ? os.courseActive : {}) }}>
                      <div style={{ ...os.check, background: on ? 'var(--accent)' : 'transparent', borderColor: on ? 'var(--accent)' : 'var(--line-strong)' }}>
                        {on && <Icon.Check size={10} style={{ color: 'var(--bg-0)' }}/>}
                      </div>
                      <div style={{ textAlign: 'left', flex: 1 }}>
                        <div style={{ fontSize: 13, color: 'var(--fg-0)', fontWeight: 500 }}>{c.label}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--fg-3)', marginTop: 2 }}>{c.prof}</div>
                      </div>
                    </button>
                  );
                })}
                <button style={{ ...os.course, border: '1px dashed var(--line-strong)', color: 'var(--fg-3)', justifyContent: 'center' }}>
                  <Icon.Plus size={14}/> Add another
                </button>
              </div>
            )}

            {step === 2 && (
              <div style={os.grid2}>
                {[
                  { id: 'exams', label: 'Ace my exams', sub: 'Midterms & finals are the target', icon: 'Target' },
                  { id: 'understand', label: 'Understand deeply', sub: 'Learning over grades', icon: 'Brain' },
                  { id: 'retain', label: 'Retain long-term', sub: 'Keep it past the semester', icon: 'Bookmark' },
                  { id: 'build', label: 'Build projects', sub: 'Apply what I learn', icon: 'Bolt' },
                ].map(o => {
                  const C = Icon[o.icon];
                  const active = goal === o.id;
                  return (
                    <button key={o.id} onClick={() => setGoal(o.id)} style={{ ...os.goalTile, ...(active ? os.tileActive : {}) }}>
                      <C size={22} style={{ color: active ? 'var(--accent)' : 'var(--fg-2)' }} />
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: 14, color: 'var(--fg-0)', fontWeight: 500 }}>{o.label}</div>
                        <div style={{ fontSize: 12, color: 'var(--fg-2)', marginTop: 3 }}>{o.sub}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {step === 3 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 20 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 72, fontWeight: 300, color: 'var(--fg-0)' }}>{time}</span>
                  <span style={{ fontSize: 15, color: 'var(--fg-2)' }}>minutes / day</span>
                </div>
                <input type="range" min="15" max="120" step="15" value={time} onChange={e => setTime(+e.target.value)} style={{ width: '100%', accentColor: 'var(--accent)' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--fg-3)' }} className="mono">
                  <span>15m</span><span>60m</span><span>120m</span>
                </div>
                <div style={{ marginTop: 28, padding: 16, border: '1px solid var(--line)', borderRadius: 'var(--r-md)', background: 'var(--bg-1)' }}>
                  <div style={{ fontSize: 11, color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Your plan</div>
                  <div style={{ fontSize: 13, color: 'var(--fg-1)' }}>
                    Roughly <b>{time}m/day</b> — two 20-minute Socratic sessions, one short flashcard review, and a weekly quiz on Sunday night.
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 48 }}>
            <button className="btn btn-bare" onClick={() => step > 0 && setStep(step - 1)} style={{ visibility: step > 0 ? 'visible' : 'hidden' }}>
              <Icon.ArrowLeft size={13} /> Back
            </button>
            <button className="btn btn-accent" onClick={next}>
              {step === 3 ? 'Enter Noēsis' : 'Continue'} <Icon.ArrowRight size={13} />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

const os = {
  page: { minHeight: '100vh', background: 'var(--bg-0)', display: 'flex', flexDirection: 'column' },
  header: {
    display: 'flex', alignItems: 'center', gap: 24,
    padding: '20px 56px', borderBottom: '1px solid var(--line-soft)',
  },
  progress: { flex: 1, display: 'flex', gap: 6, maxWidth: 360 },
  main: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 56 },
  eyebrow: { fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 14 },
  title: { fontFamily: 'var(--font-display)', fontSize: 44, fontWeight: 300, letterSpacing: '-0.02em', margin: '0 0 10px' },
  sub: { fontSize: 15, color: 'var(--fg-2)', margin: 0 },
  grid3: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 },
  tile: {
    display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start',
    padding: '20px 16px', borderRadius: 'var(--r-md)',
    background: 'var(--bg-1)', border: '1px solid var(--line)',
    minHeight: 96, transition: 'all 160ms var(--ease-out)',
  },
  tileActive: { background: 'var(--bg-2)', borderColor: 'var(--accent-soft)', boxShadow: '0 0 0 3px var(--accent-glow)' },
  goalTile: {
    display: 'flex', gap: 14, alignItems: 'flex-start',
    padding: '18px 18px', borderRadius: 'var(--r-md)',
    background: 'var(--bg-1)', border: '1px solid var(--line)',
    transition: 'all 160ms var(--ease-out)',
  },
  course: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '14px 16px', borderRadius: 'var(--r-md)',
    background: 'var(--bg-1)', border: '1px solid var(--line)',
    transition: 'all 160ms var(--ease-out)',
  },
  courseActive: { borderColor: 'var(--accent-soft)', background: 'var(--bg-2)' },
  check: {
    width: 18, height: 18, borderRadius: 5, border: '1.5px solid',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 160ms var(--ease-out)',
  },
};

window.Auth = Auth;
window.Onboarding = Onboarding;
