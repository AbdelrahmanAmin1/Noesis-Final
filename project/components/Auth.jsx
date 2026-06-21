// Auth + Onboarding screens

const Auth = ({ initialMode = 'signin', onComplete, onBack }) => {
  const Icon = window.Icon;
  const [mode, setMode] = React.useState(initialMode || 'signin');
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [success, setSuccess] = React.useState('');

  React.useEffect(() => {
    setMode(initialMode || 'signin');
    setError('');
    setSuccess('');
  }, [initialMode]);

  const submit = async (e) => {
    e && e.preventDefault && e.preventDefault();
    if (busy) return;
    setError('');
    setSuccess('');
    if (!email || !password) { setError('Email and password are required'); return; }
    if (mode === 'signup' && !name.trim()) { setError('Full name is required'); return; }
    if (mode === 'signup' && !window.NoesisPasswordPolicy.isValid(password)) {
      setError(window.NoesisPasswordPolicy.message);
      return;
    }
    setBusy(true);
    try {
      const fn = mode === 'signin' ? window.NoesisAPI.auth.signin : window.NoesisAPI.auth.signup;
      const payload = mode === 'signin' ? { email, password } : { email, password, name: name.trim() };
      await fn(payload);
      setSuccess(mode === 'signin' ? 'Login successful. Opening dashboard...' : 'Account created. Setting up your workspace...');
      onComplete && onComplete(mode === 'signin');
    } catch (e) {
      const messages = {
        missing_fields: 'Email, password, and name are required.',
        password_requirements_not_met: window.NoesisPasswordPolicy.message,
        email_exists: 'An account already exists for this email.',
        invalid_credentials: 'Email or password is incorrect.',
      };
      setError(messages[e.message] || e.message || 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={as.page}>
      <div style={as.left}>
        <div style={as.top}>
          <button className="btn btn-bare" onClick={onBack} disabled={busy} style={{ padding: 0 }}>
            <Icon.ArrowLeft size={13}/> Back to Home
          </button>
          <window.Logo size={20} />
        </div>
        <form onSubmit={submit} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: 380 }}>
          <div style={as.eyebrow}>{mode === 'signin' ? 'Welcome back' : 'Create account'}</div>
          <h1 style={as.title}>{mode === 'signin' ? 'Back to the desk.' : 'Begin the work.'}</h1>
          <p style={as.sub}>{mode === 'signin' ? 'Your materials, notes, cards, and quiz history are waiting.' : 'Create a local learning workspace for OOP and Data Structures.'}</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(10px * var(--app-density-scale))' }}>
            {mode === 'signup' && (
              <div style={as.field}>
                <label style={as.label}>Full name</label>
                <input className="input" placeholder="Your name" value={name} disabled={busy} onChange={e => setName(e.target.value)} />
              </div>
            )}
            <div style={as.field}>
              <label style={as.label}>Email</label>
              <input className="input" type="email" placeholder="you@university.edu" value={email} disabled={busy} onChange={e => setEmail(e.target.value)} />
            </div>
            <div style={as.field}>
              <label style={as.label}>Password</label>
              <input className="input" type="password" value={password} disabled={busy} onChange={e => setPassword(e.target.value)} placeholder={mode === 'signup' ? '8+ characters, uppercase, and number' : 'Your password'} />
            </div>
          </div>

          {error && <div style={{ color: 'var(--err)', fontSize: 'calc(12px * var(--app-font-scale))', marginTop: 'calc(12px * var(--app-density-scale))' }}>{error}</div>}
          {success && <div style={{ color: 'var(--ok)', fontSize: 'calc(12px * var(--app-font-scale))', marginTop: 'calc(12px * var(--app-density-scale))' }}>{success}</div>}

          <button type="submit" className="btn btn-primary" disabled={busy} style={{ marginTop: 'calc(20px * var(--app-density-scale))', padding: '12px 14px', justifyContent: 'center', opacity: busy ? 0.6 : 1 }}>
            {busy ? (mode === 'signin' ? 'Logging in...' : 'Creating account...') : (mode === 'signin' ? 'Login' : 'Register')} <Icon.ArrowRight size={14} />
          </button>

          <div style={{ marginTop: 'calc(24px * var(--app-density-scale))', fontSize: 'calc(12.5px * var(--app-font-scale))', color: 'var(--fg-2)' }}>
            {mode === 'signin' ? 'New here?' : 'Already have an account?'}{' '}
            <a onClick={() => { if (busy) return; setError(''); setSuccess(''); setMode(mode === 'signin' ? 'signup' : 'signin'); }} style={{ color: 'var(--accent)', cursor: busy ? 'not-allowed' : 'pointer' }}>
              {mode === 'signin' ? 'Create an account' : 'Sign in'}
            </a>
          </div>
        </form>
        <div style={{ fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)' }}>Authentication is handled by the Noesis backend session layer.</div>
      </div>
      <div style={as.right}>
        <div style={as.quote}>
          <Icon.Sparkle size={28} style={{ color: 'var(--accent)', opacity: 0.6 }}/>
          <p style={as.quoteText}>Noesis turns OOP and Data Structures material into notes, flashcards, quizzes, and guided tutor sessions.</p>
          <div style={{ fontSize: 'calc(12px * var(--app-font-scale))', color: 'var(--fg-2)' }}>A local-first learning workspace for core Computer Science study.</div>
        </div>
      </div>
    </div>
  );
};

const as = {
  page: { display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: '100vh' },
  left: { padding: '40px 56px', display: 'flex', flexDirection: 'column', gap: 'calc(24px * var(--app-density-scale))' },
  top: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'calc(16px * var(--app-density-scale))' },
  right: {
    background: 'var(--bg-1)', borderLeft: '1px solid var(--line)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 'calc(56px * var(--app-density-scale))',
    backgroundImage: 'radial-gradient(ellipse at 30% 20%, var(--accent-glow), transparent 60%)',
  },
  quote: { maxWidth: 420 },
  quoteText: { fontFamily: 'var(--font-display)', fontSize: 'calc(32px * var(--app-font-scale))', fontWeight: 300, lineHeight: 1.3, letterSpacing: '-0.015em', margin: '18px 0' },
  eyebrow: { fontSize: 'calc(11px * var(--app-font-scale))', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 'calc(14px * var(--app-density-scale))' },
  title: { fontFamily: 'var(--font-display)', fontSize: 'calc(40px * var(--app-font-scale))', fontWeight: 300, margin: '0 0 12px', letterSpacing: '-0.02em' },
  sub: { fontSize: 'calc(14px * var(--app-font-scale))', color: 'var(--fg-2)', margin: '0 0 32px' },
  field: { display: 'flex', flexDirection: 'column', gap: 'calc(6px * var(--app-density-scale))' },
  label: { fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)', letterSpacing: '0.04em' },
};

const Onboarding = ({ onComplete }) => {
  const Icon = window.Icon;
  const [step, setStep] = React.useState(0);
  const [subject, setSubject] = React.useState('computer-science');
  const [courses, setCourses] = React.useState(['oop', 'ds']);
  const [goal, setGoal] = React.useState('exams');
  const [time, setTime] = React.useState(45);
  const [level, setLevel] = React.useState('beginner');
  const [deadline, setDeadline] = React.useState('');
  const [daysPerWeek, setDaysPerWeek] = React.useState(5);
  const [learningStyle, setLearningStyle] = React.useState('mixed');
  const [preferredLanguage, setPreferredLanguage] = React.useState('java');
  const [confidence, setConfidence] = React.useState(3);
  const [weakTopics, setWeakTopics] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const steps = [
    { title: 'What are you studying?', sub: 'Noesis is tuned for Object-Oriented Programming and Data Structures.' },
    { title: 'Which tracks do you want active?', sub: 'These seed your dashboard and tutor context.' },
    { title: 'What is the goal?', sub: 'This shapes pacing and dashboard recommendations.' },
    { title: 'How much time per day?', sub: 'The weekly target is calculated from this.' },
    { title: 'Tune your study plan', sub: 'Optional details help Noesis choose the next best topic.' },
  ];

  const next = async () => {
    setError('');
    if (step < steps.length - 1) { setStep(step + 1); return; }
    setBusy(true);
    try {
      const courseCatalog = {
        oop: { code: 'CS-OOP', title: 'Object-Oriented Programming', professor: '' },
        ds: { code: 'CS-DS', title: 'Data Structures & Algorithms', professor: '' },
      };
      const courseObjs = courses.map(id => courseCatalog[id]).filter(Boolean);
      await window.NoesisAPI.auth.onboarding({
        subject,
        goal,
        daily_minutes: time,
        courses: courseObjs,
        currentLevel: level,
        deadline,
        daysPerWeek,
        minutesPerSession: time,
        learningStyle,
        preferredLanguage,
        confidence,
        weakTopics: weakTopics.split(',').map(t => t.trim()).filter(Boolean),
      });
      onComplete();
    } catch (e) {
      setError(e.message || 'onboarding_failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={os.page}>
      <header style={os.header}>
        <window.Logo size={18} />
        <div style={os.progress}>
          {steps.map((_, i) => (
            <div key={i} style={{ height: 3, flex: 1, borderRadius: 2, background: i <= step ? 'var(--accent)' : 'var(--line)', transition: 'background 400ms var(--ease-out)' }} />
          ))}
        </div>
        <span className="mono" style={{ fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)' }}>{step + 1} / {steps.length}</span>
      </header>

      <main style={os.main}>
        <div key={step} className="fade-in" style={{ maxWidth: 640, width: '100%' }}>
          <div style={os.eyebrow}>Step {String(step + 1).padStart(2, '0')}</div>
          <h1 style={os.title}>{steps[step].title}</h1>
          <p style={os.sub}>{steps[step].sub}</p>

          <div style={{ marginTop: 'calc(36px * var(--app-density-scale))' }}>
            {step === 0 && (
              <div style={os.grid3}>
                {[
                  { id: 'computer-science', label: 'OOP + Data Structures', icon: 'Code' },
                  { id: 'oop', label: 'Object-Oriented Programming', icon: 'Cube' },
                  { id: 'data-structures', label: 'Data Structures', icon: 'Tree' },
                ].map(o => {
                  const C = Icon[o.icon];
                  const active = subject === o.id;
                  return (
                    <button key={o.id} onClick={() => { setSubject(o.id); setCourses(o.id === 'oop' ? ['oop'] : (o.id === 'data-structures' ? ['ds'] : ['oop', 'ds'])); }} style={{ ...os.tile, ...(active ? os.tileActive : {}) }}>
                      <C size={20} style={{ color: active ? 'var(--accent)' : 'var(--fg-2)' }} />
                      <span style={{ fontSize: 'calc(13px * var(--app-font-scale))', color: active ? 'var(--fg-0)' : 'var(--fg-1)' }}>{o.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {step === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(8px * var(--app-density-scale))' }}>
                {[
                  { id: 'oop', label: 'Object-Oriented Programming', prof: 'Classes, objects, encapsulation, inheritance, polymorphism, interfaces' },
                  { id: 'ds', label: 'Data Structures & Algorithms', prof: 'Arrays, linked lists, stacks, queues, trees, graphs, hashing, Big-O' },
                ].map(c => {
                  const on = courses.includes(c.id);
                  return (
                    <button key={c.id} onClick={() => {
                      const nextCourses = on ? courses.filter(x => x !== c.id) : [...courses, c.id];
                      setCourses(nextCourses);
                      setSubject(nextCourses.length > 1 ? 'computer-science' : (nextCourses[0] === 'oop' ? 'oop' : (nextCourses[0] === 'ds' ? 'data-structures' : 'computer-science')));
                    }} style={{ ...os.course, ...(on ? os.courseActive : {}) }}>
                      <div style={{ ...os.check, background: on ? 'var(--accent)' : 'transparent', borderColor: on ? 'var(--accent)' : 'var(--line-strong)' }}>
                        {on && <Icon.Check size={10} style={{ color: 'var(--bg-0)' }}/>}
                      </div>
                      <div style={{ textAlign: 'left', flex: 1 }}>
                        <div style={{ fontSize: 'calc(13px * var(--app-font-scale))', color: 'var(--fg-0)', fontWeight: 500 }}>{c.label}</div>
                        <div style={{ fontSize: 'calc(11.5px * var(--app-font-scale))', color: 'var(--fg-3)', marginTop: 'calc(2px * var(--app-density-scale))' }}>{c.prof}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {step === 2 && (
              <div style={os.grid2}>
                {[
                  { id: 'exams', label: 'Ace my exams', sub: 'Turn material into reviewable exam prep', effect: 'Pushes quizzes, weak topics, and exam notes first.', icon: 'Target' },
                  { id: 'understand', label: 'Understand deeply', sub: 'Use tutor sessions for conceptual gaps', effect: 'Pushes tutor sessions and concept gaps first.', icon: 'Brain' },
                  { id: 'retain', label: 'Retain long-term', sub: 'Use spaced repetition after each topic', effect: 'Pushes due cards and spaced review first.', icon: 'Bookmark' },
                  { id: 'practice', label: 'Practice problems', sub: 'Use quizzes to expose weak topics', effect: 'Pushes quizzes, practice sets, and mistake review first.', icon: 'Bolt' },
                ].map(o => {
                  const C = Icon[o.icon];
                  const active = goal === o.id;
                  return (
                    <button key={o.id} onClick={() => setGoal(o.id)} style={{ ...os.goalTile, ...(active ? os.tileActive : {}) }}>
                      <C size={22} style={{ color: active ? 'var(--accent)' : 'var(--fg-2)' }} />
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: 'calc(14px * var(--app-font-scale))', color: 'var(--fg-0)', fontWeight: 500 }}>{o.label}</div>
                        <div style={{ fontSize: 'calc(12px * var(--app-font-scale))', color: 'var(--fg-2)', marginTop: 'calc(3px * var(--app-density-scale))' }}>{o.sub}</div>
                        <div style={{ fontSize: 'calc(11px * var(--app-font-scale))', color: active ? 'var(--accent)' : 'var(--fg-3)', marginTop: 'calc(8px * var(--app-density-scale))' }}>Effect: {o.effect}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {step === 3 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 'calc(10px * var(--app-density-scale))', marginBottom: 'calc(20px * var(--app-density-scale))' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 'calc(72px * var(--app-font-scale))', fontWeight: 300, color: 'var(--fg-0)' }}>{time}</span>
                  <span style={{ fontSize: 'calc(15px * var(--app-font-scale))', color: 'var(--fg-2)' }}>minutes / day</span>
                </div>
                <input type="range" min="15" max="120" step="15" value={time} onChange={e => setTime(+e.target.value)} style={{ width: '100%', accentColor: 'var(--accent)' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'calc(8px * var(--app-density-scale))', fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)' }} className="mono">
                  <span>15m</span><span>60m</span><span>120m</span>
                </div>
                <div style={{ marginTop: 'calc(28px * var(--app-density-scale))', padding: 'calc(16px * var(--app-density-scale))', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', background: 'var(--bg-1)' }}>
                  <div style={{ fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'calc(6px * var(--app-density-scale))' }}>Your plan</div>
                  <div style={{ fontSize: 'calc(13px * var(--app-font-scale))', color: 'var(--fg-1)' }}>
                    Roughly <b>{time}m/day</b>: one tutor session, one flashcard review, and one quiz cycle each week.
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'calc(12px * var(--app-density-scale))' }}>
                <label style={os.formField}>
                  <span style={os.formLabel}>Current level</span>
                  <select className="input" value={level} onChange={e => setLevel(e.target.value)}>
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </label>
                <label style={os.formField}>
                  <span style={os.formLabel}>Exam or deadline</span>
                  <input className="input" type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
                </label>
                <label style={os.formField}>
                  <span style={os.formLabel}>Days per week</span>
                  <input className="input" type="number" min="1" max="7" value={daysPerWeek} onChange={e => setDaysPerWeek(+e.target.value || 5)} />
                </label>
                <label style={os.formField}>
                  <span style={os.formLabel}>Preferred language</span>
                  <select className="input" value={preferredLanguage} onChange={e => setPreferredLanguage(e.target.value)}>
                    <option value="java">Java</option>
                    <option value="python">Python</option>
                    <option value="javascript">JavaScript</option>
                    <option value="cpp">C++</option>
                  </select>
                </label>
                <label style={os.formField}>
                  <span style={os.formLabel}>Learning style</span>
                  <select className="input" value={learningStyle} onChange={e => setLearningStyle(e.target.value)}>
                    <option value="mixed">Mixed</option>
                    <option value="video">Video first</option>
                    <option value="notes">Notes first</option>
                    <option value="quizzes">Quiz first</option>
                    <option value="flashcards">Flashcards</option>
                  </select>
                </label>
                <label style={os.formField}>
                  <span style={os.formLabel}>Confidence: {confidence}/5</span>
                  <input type="range" min="1" max="5" value={confidence} onChange={e => setConfidence(+e.target.value)} style={{ width: '100%', accentColor: 'var(--accent)' }} />
                </label>
                <label style={{ ...os.formField, gridColumn: '1 / -1' }}>
                  <span style={os.formLabel}>Weak topics you already know</span>
                  <input className="input" value={weakTopics} onChange={e => setWeakTopics(e.target.value)} placeholder="e.g. polymorphism, linked list pointers, Big-O" />
                </label>
              </div>
            )}
          </div>

          {error && <div style={{ marginTop: 'calc(16px * var(--app-density-scale))', color: 'var(--err)', fontSize: 'calc(12px * var(--app-font-scale))' }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'calc(48px * var(--app-density-scale))' }}>
            <button className="btn btn-bare" onClick={() => step > 0 && setStep(step - 1)} style={{ visibility: step > 0 ? 'visible' : 'hidden' }}>
              <Icon.ArrowLeft size={13} /> Back
            </button>
            <button className="btn btn-accent" onClick={next} disabled={busy || (step === 1 && courses.length === 0)}>
              {busy ? 'Saving...' : (step === steps.length - 1 ? 'Enter Noesis' : 'Continue')} <Icon.ArrowRight size={13} />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

const os = {
  page: { minHeight: '100vh', background: 'var(--bg-0)', display: 'flex', flexDirection: 'column' },
  header: { display: 'flex', alignItems: 'center', gap: 'calc(24px * var(--app-density-scale))', padding: '20px 56px', borderBottom: '1px solid var(--line-soft)' },
  progress: { flex: 1, display: 'flex', gap: 'calc(6px * var(--app-density-scale))', maxWidth: 360 },
  main: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'calc(56px * var(--app-density-scale))' },
  eyebrow: { fontSize: 'calc(11px * var(--app-font-scale))', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 'calc(14px * var(--app-density-scale))' },
  title: { fontFamily: 'var(--font-display)', fontSize: 'calc(44px * var(--app-font-scale))', fontWeight: 300, letterSpacing: '-0.02em', margin: '0 0 10px' },
  sub: { fontSize: 'calc(15px * var(--app-font-scale))', color: 'var(--fg-2)', margin: 0 },
  grid3: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'calc(10px * var(--app-density-scale))' },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'calc(10px * var(--app-density-scale))' },
  tile: {
    display: 'flex', flexDirection: 'column', gap: 'calc(10px * var(--app-density-scale))', alignItems: 'flex-start',
    padding: '20px 16px', borderRadius: 'var(--r-md)',
    background: 'var(--bg-1)', border: '1px solid var(--line)',
    minHeight: 96, transition: 'all 160ms var(--ease-out)',
  },
  tileActive: { background: 'var(--bg-2)', borderColor: 'var(--accent-soft)', boxShadow: '0 0 0 3px var(--accent-glow)' },
  goalTile: {
    display: 'flex', gap: 'calc(14px * var(--app-density-scale))', alignItems: 'flex-start',
    padding: '18px 18px', borderRadius: 'var(--r-md)',
    background: 'var(--bg-1)', border: '1px solid var(--line)',
    transition: 'all 160ms var(--ease-out)',
  },
  course: {
    display: 'flex', alignItems: 'center', gap: 'calc(12px * var(--app-density-scale))',
    padding: '14px 16px', borderRadius: 'var(--r-md)',
    background: 'var(--bg-1)', border: '1px solid var(--line)',
    transition: 'all 160ms var(--ease-out)',
  },
  courseActive: { borderColor: 'var(--accent-soft)', background: 'var(--bg-2)' },
  formField: { display: 'flex', flexDirection: 'column', gap: 'calc(6px * var(--app-density-scale))' },
  formLabel: { fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)', letterSpacing: '0.04em', textTransform: 'uppercase' },
  check: {
    width: 18, height: 18, borderRadius: 5, border: '1.5px solid',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 160ms var(--ease-out)',
  },
};

window.Auth = Auth;
window.Onboarding = Onboarding;
