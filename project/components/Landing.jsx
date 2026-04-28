// Landing page — animated hero. Invitation, not a pitch.
const Landing = ({ onEnter }) => {
  const Icon = window.Icon;
  const [t, setT] = React.useState(0);

  React.useEffect(() => {
    let raf; const start = performance.now();
    const tick = (now) => { setT((now - start) / 1000); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div style={ls.page} className="stars">
      <div className="nebula" />
      {/* Navbar */}
      <header style={ls.nav}>
        <window.Logo size={22} onClick={() => onEnter('landing')}/>
        <nav style={ls.navLinks}>
          <a style={ls.navLink} className="ls-navlink" onClick={() => onEnter('product')}>Product</a>
          <a style={ls.navLink} className="ls-navlink" onClick={() => onEnter('students')}>For students</a>
          <a style={ls.navLink} className="ls-navlink" onClick={() => onEnter('method')}>Method</a>
          <a style={ls.navLink} className="ls-navlink" onClick={() => onEnter('pricing')}>Pricing</a>
        </nav>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn btn-bare" onClick={() => onEnter('auth')}>Sign in</button>
          <button className="btn btn-accent" onClick={() => onEnter('onboarding')} style={{ padding: '8px 14px' }}>
            Start free <window.Icon.ArrowRight size={12}/>
          </button>
        </div>
      </header>

      {/* Hero */}
      <section style={{ ...ls.hero, position: 'relative', zIndex: 2 }}>
        <div style={ls.heroText}>
          <div className="chip" style={{ marginBottom: 22 }}>
            <span style={{ width: 5, height: 5, borderRadius: 3, background: 'var(--accent)' }} />
            <span>Now learning OOP & Data Structures</span>
          </div>

          <h1 style={ls.title}>
            <span style={{ display: 'block' }}>The quiet place</span>
            <span style={{ display: 'block', color: 'var(--fg-2)' }}>where concepts</span>
            <span style={{ display: 'block' }}>
              become <em style={{ fontStyle: 'italic', color: 'var(--accent)', fontWeight: 300 }}>understanding</em>.
            </span>
          </h1>

          <p style={ls.subtitle}>
            Noēsis is a focused learning workspace. Drop in your course materials —
            get a tutor that explains, notes that write themselves, and a spaced-repetition
            loop that actually sticks.
          </p>

          <div style={{ display: 'flex', gap: 10, marginTop: 36 }}>
            <button className="btn btn-accent" onClick={() => onEnter('onboarding')} style={{ padding: '12px 18px', fontSize: 14 }}>
              Begin a session <Icon.ArrowRight size={14} />
            </button>
            <button className="btn btn-ghost" style={{ padding: '12px 18px', fontSize: 14 }}>
              <Icon.Play size={12} /> Watch the method · 90s
            </button>
          </div>

          <div style={{ marginTop: 44, display: 'flex', gap: 32, color: 'var(--fg-3)', fontSize: 11.5 }}>
            <div><span style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--fg-0)' }}>17k</span><br/>active learners</div>
            <div style={{ width: 1, background: 'var(--line)' }} />
            <div><span style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--fg-0)' }}>+38%</span><br/>median test lift</div>
            <div style={{ width: 1, background: 'var(--line)' }} />
            <div><span style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--fg-0)' }}>4.9</span><br/>student rating</div>
          </div>
        </div>

        {/* Animated 3D visual */}
        <div style={ls.heroVisual}>
          {window.Hero3D ? <window.Hero3D height={520}/> : <HeroOrbit t={t}/>}
        </div>
      </section>

      {/* Section — The method */}
      <section style={ls.section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 48 }}>
          <div>
            <div style={ls.eyebrow}>The method</div>
            <h2 style={ls.h2}>
              Four ways to move from <em style={{ fontStyle: 'italic', color: 'var(--accent)' }}>reading</em> to <em style={{ fontStyle: 'italic', color: 'var(--accent)' }}>knowing</em>.
            </h2>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--fg-2)', maxWidth: 320, textAlign: 'right' }}>
            Noēsis isn't a chatbot. It's a workspace built around how memory
            actually forms — active recall, interleaving, and deliberate practice.
          </div>
        </div>

        <div style={ls.methodGrid}>
          {[
            { n: '01', t: 'Ingest', d: 'Drop a PDF, lecture, or code file. Noēsis extracts concepts, not just text — and maps them to what you already know.', icon: 'Upload' },
            { n: '02', t: 'Understand', d: 'An AI tutor walks you through the material Socratically. Not answers — questions that make you earn the answer.', icon: 'Sparkle' },
            { n: '03', t: 'Rehearse', d: 'Flashcards and quizzes generated from your own materials, timed by a spaced-repetition engine tuned to your forgetting curve.', icon: 'Cards' },
            { n: '04', t: 'Measure', d: 'See which concepts are solid and which are slipping. Weekly reviews surface exactly what to restudy.', icon: 'Chart' },
          ].map(m => {
            const C = Icon[m.icon];
            return (
              <div key={m.n} className="card card-hover" style={ls.methodCard}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-3)', letterSpacing: '0.1em' }}>{m.n}</span>
                  <C size={18} style={{ color: 'var(--accent)' }} />
                </div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, margin: '0 0 10px', fontWeight: 400, letterSpacing: '-0.01em' }}>{m.t}</h3>
                <p style={{ fontSize: 13, color: 'var(--fg-2)', margin: 0, lineHeight: 1.55 }}>{m.d}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Section — Showcase */}
      <section style={{ ...ls.section, paddingTop: 24 }}>
        <div style={{ marginBottom: 32 }}>
          <div style={ls.eyebrow}>A glimpse</div>
          <h2 style={ls.h2}>Built for the way you actually study.</h2>
        </div>

        <div className="card" style={ls.showcase}>
          <div style={ls.showcaseChrome}>
            <div style={{ display: 'flex', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 5, background: 'var(--line-strong)' }} />
              <span style={{ width: 10, height: 10, borderRadius: 5, background: 'var(--line-strong)' }} />
              <span style={{ width: 10, height: 10, borderRadius: 5, background: 'var(--line-strong)' }} />
            </div>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-3)' }}>noesis.study / data-structures / linked-lists</span>
          </div>
          <div style={ls.showcaseBody}>
            <FakeTutor t={t} />
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section style={ls.footerCta}>
        <h2 style={{ ...ls.h2, maxWidth: 700 }}>
          Study like the person you're trying to become.
        </h2>
        <button className="btn btn-accent" onClick={() => onEnter('onboarding')} style={{ padding: '12px 18px', fontSize: 14, marginTop: 20 }}>
          Claim your semester <Icon.ArrowRight size={14} />
        </button>
        <div style={{ marginTop: 14, fontSize: 11.5, color: 'var(--fg-3)' }}>Free for students · no card required</div>
      </section>

      <footer style={ls.footer}>
        <window.Logo size={16} />
        <div style={{ fontSize: 11.5, color: 'var(--fg-3)' }}>© 2026 Noēsis Labs · Made for the long nights.</div>
      </footer>
    </div>
  );
};

const HeroOrbit = ({ t }) => {
  const concepts = [
    { r: 210, speed: 0.08, offset: 0, label: 'Linked Lists', icon: '◉' },
    { r: 210, speed: 0.08, offset: Math.PI * 2/3, label: 'Inheritance', icon: '◑' },
    { r: 210, speed: 0.08, offset: Math.PI * 4/3, label: 'Big-O', icon: '◐' },
    { r: 150, speed: -0.12, offset: 0, label: 'Hash Tables', icon: '◎' },
    { r: 150, speed: -0.12, offset: Math.PI, label: 'Recursion', icon: '◉' },
  ];
  return (
    <div style={{ position: 'relative', width: 520, height: 520, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* glow */}
      <div style={{
        position: 'absolute', inset: 40,
        background: 'radial-gradient(closest-side, var(--accent-glow), transparent 70%)',
        filter: 'blur(20px)',
        animation: 'drift 8s ease-in-out infinite',
      }} />
      {/* rings */}
      {[90, 150, 210, 250].map((r, i) => (
        <div key={r} style={{
          position: 'absolute', width: r * 2, height: r * 2,
          border: `1px solid var(--line)`, borderRadius: '50%',
          opacity: 0.4 + i * 0.08,
        }} />
      ))}
      {/* center */}
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        background: 'radial-gradient(circle at 30% 30%, var(--parchment), var(--accent) 70%)',
        boxShadow: '0 0 60px 10px var(--accent-glow)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--bg-0)',
        fontFamily: 'var(--font-display)', fontSize: 30,
      }}>ō</div>

      {/* orbiting concepts */}
      {concepts.map((c, i) => {
        const angle = c.offset + t * c.speed * 2 * Math.PI;
        const x = Math.cos(angle) * c.r;
        const y = Math.sin(angle) * c.r;
        return (
          <div key={i} style={{
            position: 'absolute', transform: `translate(${x}px, ${y}px)`,
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 10px',
            background: 'var(--bg-1)',
            border: '1px solid var(--line)',
            borderRadius: 999,
            fontSize: 11, color: 'var(--fg-1)',
            whiteSpace: 'nowrap',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <span style={{ color: 'var(--accent)' }}>{c.icon}</span>
            {c.label}
          </div>
        );
      })}

      {/* pulse dots */}
      {[0, 1, 2, 3].map(i => {
        const a = t * 0.6 + i * Math.PI / 2;
        return (
          <div key={i} style={{
            position: 'absolute',
            width: 4, height: 4, borderRadius: 2,
            background: 'var(--accent)',
            transform: `translate(${Math.cos(a) * 90}px, ${Math.sin(a) * 90}px)`,
            opacity: 0.5 + 0.5 * Math.sin(t * 2 + i),
          }} />
        );
      })}
    </div>
  );
};

const FakeTutor = ({ t }) => {
  const Icon = window.Icon;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', height: 440 }}>
      <div style={{ padding: 28, borderRight: '1px solid var(--line)' }}>
        <div style={{ fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Source · Week 6 lecture</div>
        <h4 style={{ fontFamily: 'var(--font-display)', fontSize: 24, margin: '0 0 14px', fontWeight: 400 }}>Singly Linked Lists</h4>
        <p style={{ fontSize: 13, color: 'var(--fg-1)', lineHeight: 1.7, margin: 0 }}>
          A linked list is a linear data structure where each <mark style={{ background: 'var(--accent-glow)', color: 'var(--accent)', padding: '1px 4px', borderRadius: 3 }}>element points to the next</mark>, rather than being stored contiguously in memory. Insertion at the head is <span className="mono" style={{ fontSize: 12, background: 'var(--bg-2)', padding: '1px 5px', borderRadius: 3 }}>O(1)</span>, but random access is <span className="mono" style={{ fontSize: 12, background: 'var(--bg-2)', padding: '1px 5px', borderRadius: 3 }}>O(n)</span>…
        </p>
        <div style={{ marginTop: 20, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span className="chip chip-accent">Pointer semantics</span>
          <span className="chip">Trade-offs vs arrays</span>
          <span className="chip">Memory layout</span>
        </div>
      </div>

      <div style={{ padding: 28, background: 'var(--bg-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <div style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--accent-glow)', border: '1px solid var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon.Sparkle size={12} style={{ color: 'var(--accent)' }} />
          </div>
          <span style={{ fontSize: 12, color: 'var(--fg-1)', fontWeight: 500 }}>Tutor · Socratic mode</span>
        </div>

        <div style={{ fontSize: 13.5, color: 'var(--fg-0)', lineHeight: 1.65, marginBottom: 16 }}>
          Before I explain: if I told you linked lists have <em>O(1)</em> insertion
          — why might an array still be faster in practice?
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {['Cache locality & CPU prefetching', 'Pointer chasing overhead', 'Both — they compound'].map((a, i) => (
            <div key={i} style={{
              padding: '10px 12px',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--line)',
              background: i === 2 ? 'var(--accent-glow)' : 'var(--bg-1)',
              fontSize: 12.5, color: 'var(--fg-1)',
              display: 'flex', alignItems: 'center', gap: 10,
              borderColor: i === 2 ? 'var(--accent-soft)' : 'var(--line)',
            }}>
              <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>{String.fromCharCode(65+i)}</span>
              <span>{a}</span>
              {i === 2 && <Icon.Check size={14} style={{ marginLeft: 'auto', color: 'var(--accent)' }} />}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 18, fontSize: 12, color: 'var(--fg-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="thinking-dot"/><span className="thinking-dot"/><span className="thinking-dot"/>
          <span>Tutor is drafting the next step…</span>
        </div>
      </div>
    </div>
  );
};

const ls = {
  page: { background: 'var(--bg-0)', color: 'var(--fg-0)', minHeight: '100vh', position: 'relative' },
  nav: {
    display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center',
    padding: '14px 44px', borderBottom: '1px solid var(--line-soft)',
    position: 'sticky', top: 0,
    background: 'color-mix(in oklab, var(--bg-0) 72%, transparent)',
    backdropFilter: 'blur(18px) saturate(130%)',
    WebkitBackdropFilter: 'blur(18px) saturate(130%)',
    zIndex: 30,
  },
  navLinks: {
    display: 'flex', gap: 6, fontSize: 13, color: 'var(--fg-2)',
    padding: '4px', background: 'color-mix(in oklab, var(--bg-1) 60%, transparent)',
    borderRadius: 999, border: '1px solid var(--line-soft)',
  },
  navLink: {
    cursor: 'pointer', transition: 'all 160ms var(--ease-out)',
    padding: '6px 14px', borderRadius: 999,
  },
  hero: {
    display: 'grid', gridTemplateColumns: '1fr 1fr',
    alignItems: 'center', gap: 60,
    padding: '80px 56px 110px', maxWidth: 1400, margin: '0 auto',
  },
  heroText: { maxWidth: 540 },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 78, fontWeight: 300, lineHeight: 1.02,
    letterSpacing: '-0.025em',
    margin: '0 0 28px',
  },
  subtitle: { fontSize: 16, color: 'var(--fg-1)', lineHeight: 1.6, maxWidth: 460, margin: 0 },
  heroVisual: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
  section: { padding: '80px 56px', maxWidth: 1400, margin: '0 auto' },
  eyebrow: {
    fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
    color: 'var(--accent)', marginBottom: 14, fontWeight: 500,
  },
  h2: {
    fontFamily: 'var(--font-display)', fontSize: 48, fontWeight: 300,
    letterSpacing: '-0.02em', lineHeight: 1.1, margin: 0, maxWidth: 780,
  },
  methodGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16,
  },
  methodCard: {
    padding: 28, minHeight: 220,
    display: 'flex', flexDirection: 'column',
  },
  showcase: {
    overflow: 'hidden',
    borderRadius: 'var(--r-xl)',
    boxShadow: 'var(--shadow-lg)',
  },
  showcaseChrome: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 16px', borderBottom: '1px solid var(--line)',
    background: 'var(--bg-1)',
  },
  showcaseBody: { background: 'var(--bg-1)' },
  footerCta: {
    maxWidth: 1400, margin: '60px auto', padding: '80px 56px',
    textAlign: 'center',
    borderTop: '1px solid var(--line-soft)', borderBottom: '1px solid var(--line-soft)',
  },
  footer: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '30px 56px',
  },
};

window.Landing = Landing;
