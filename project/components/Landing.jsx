// Public landing page with the original 3D visual language restored.
const Landing = ({ onEnter, onAuth, isAuthed }) => {
  const Icon = window.Icon;
  const [t, setT] = React.useState(0);

  React.useEffect(() => {
    let raf;
    const start = performance.now();
    const tick = (now) => {
      setT((now - start) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const go = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const auth = (mode) => onAuth ? onAuth(mode) : onEnter('auth');

  return (
    <div style={ls.page} className="stars">
      <div className="nebula" />
      <style>{landingCss}</style>

      <header style={ls.nav} className="landing-nav">
        <window.Logo size={22} onClick={() => go('home')} />

        <nav style={ls.navLinks} className="landing-links">
          <a className="ls-navlink" style={ls.navLink} onClick={() => go('home')}>Home</a>
          <a className="ls-navlink" style={ls.navLink} onClick={() => go('features')}>Features</a>
          <a className="ls-navlink" style={ls.navLink} onClick={() => go('how')}>How it works</a>
        </nav>

        <div style={ls.navActions}>
          {isAuthed ? (
            <button className="btn btn-accent" onClick={() => onEnter('dashboard')} style={{ padding: '8px 14px' }}>
              Dashboard <Icon.ArrowRight size={12}/>
            </button>
          ) : (
            <>
              <button className="btn btn-bare" onClick={() => auth('signin')}>Login</button>
              <button className="btn btn-accent" onClick={() => auth('signup')} style={{ padding: '8px 14px' }}>
                Register <Icon.ArrowRight size={12}/>
              </button>
            </>
          )}
        </div>
      </header>

      <section id="home" style={ls.hero} className="landing-hero">
        <div style={ls.heroText} className="fade-in">
          <div className="chip" style={{ marginBottom: 22 }}>
            <span style={ls.liveDot} />
            <span>AI study system for OOP and Data Structures</span>
          </div>

          <h1 style={ls.title}>
            <span style={{ display: 'block' }}>Turn course files</span>
            <span style={{ display: 'block', color: 'var(--fg-2)' }}>into a real</span>
            <span style={{ display: 'block' }}>
              study <em style={ls.em}>workspace</em>.
            </span>
          </h1>

          <p style={ls.subtitle}>
            Noesis indexes your uploaded material, then generates notes, flashcards,
            quizzes, wrong-answer review, and tutor sessions from your own backend data.
          </p>

          <div style={ls.ctaRow}>
            <button className="btn btn-accent" onClick={() => auth('signup')} style={ls.cta}>
              Get started <Icon.ArrowRight size={14} />
            </button>
            <button className="btn btn-ghost" onClick={() => go('how')} style={ls.cta}>
              <Icon.Play size={12} /> See how it works
            </button>
          </div>

          <div style={ls.trustRow} className="landing-trust">
            {[
              ['Backend auth', 'real accounts'],
              ['SQLite memory', 'persistent study data'],
              ['Ollama + RAG', 'local AI generation'],
            ].map(([a, b]) => (
              <div key={a}>
                <span style={ls.trustTitle}>{a}</span><br/>
                <span>{b}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={ls.heroVisual} className="landing-visual">
          {window.Hero3D ? <window.Hero3D height={520}/> : <HeroOrbit t={t}/>}
        </div>
      </section>

      <section id="features" style={ls.section}>
        <div style={ls.sectionHead}>
          <div>
            <div style={ls.eyebrow}>Connected features</div>
            <h2 style={ls.h2}>Every surface reads and writes real study data.</h2>
          </div>
          <p style={ls.sectionCopy}>
            The app stays focused on Computer Science fundamentals: OOP, algorithms,
            data structures, complexity, and exam-style practice.
          </p>
        </div>

        <div style={ls.methodGrid} className="landing-grid">
          {[
            { n: '01', t: 'Upload', d: 'Store material metadata, extract text, chunk content, and index embeddings for retrieval.', icon: 'Upload' },
            { n: '02', t: 'Generate', d: 'Create notes, summaries, flashcards, and quizzes from the selected material.', icon: 'Sparkle' },
            { n: '03', t: 'Practice', d: 'Submit quiz answers, store attempts, score results, and review wrong answers later.', icon: 'Target' },
            { n: '04', t: 'Measure', d: 'Dashboard numbers, activity, due cards, and average score come from your database.', icon: 'Chart' },
          ].map(m => {
            const C = Icon[m.icon] || Icon.Sparkle;
            return (
              <div key={m.n} className="card card-hover" style={ls.methodCard}>
                <div style={ls.cardTop}>
                  <span className="mono" style={ls.cardNum}>{m.n}</span>
                  <C size={18} style={{ color: 'var(--accent)' }} />
                </div>
                <h3 style={ls.cardTitle}>{m.t}</h3>
                <p style={ls.cardText}>{m.d}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section id="how" style={{ ...ls.section, paddingTop: 24 }}>
        <div style={{ marginBottom: 32 }}>
          <div style={ls.eyebrow}>How it works</div>
          <h2 style={ls.h2}>A simple loop: ingest, understand, rehearse, improve.</h2>
        </div>

        <div className="card landing-showcase" style={ls.showcase}>
          <div style={ls.showcaseChrome}>
            <div style={{ display: 'flex', gap: 6 }}>
              <span style={ls.chromeDot} />
              <span style={ls.chromeDot} />
              <span style={ls.chromeDot} />
            </div>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-3)' }}>noesis.local / materials / arrays-and-complexity</span>
          </div>
          <div style={ls.showcaseBody}>
            <StudyFlowPreview t={t} />
          </div>
        </div>
      </section>

      <section style={ls.footerCta}>
        <h2 style={{ ...ls.h2, maxWidth: 760 }}>
          Start with one OOP or Data Structures file.
        </h2>
        <p style={{ ...ls.subtitle, margin: '18px auto 0' }}>
          Your first upload becomes the source for notes, flashcards, quizzes, tutor help,
          and dashboard analytics.
        </p>
        <button className="btn btn-accent" onClick={() => auth('signup')} style={{ ...ls.cta, marginTop: 24 }}>
          Create account <Icon.ArrowRight size={14} />
        </button>
      </section>

      <footer style={ls.footer}>
        <window.Logo size={16} />
        <div style={{ fontSize: 11.5, color: 'var(--fg-3)' }}>Noesis AI Learning Assistant - graduation project build</div>
      </footer>
    </div>
  );
};

const HeroOrbit = ({ t }) => {
  const concepts = [
    { r: 210, speed: 0.08, offset: 0, label: 'Linked Lists' },
    { r: 210, speed: 0.08, offset: Math.PI * 2/3, label: 'Inheritance' },
    { r: 210, speed: 0.08, offset: Math.PI * 4/3, label: 'Big-O' },
    { r: 150, speed: -0.12, offset: 0, label: 'Hash Tables' },
    { r: 150, speed: -0.12, offset: Math.PI, label: 'Graphs' },
  ];
  return (
    <div style={ls.orbit}>
      <div style={ls.orbitGlow} />
      {[90, 150, 210, 250].map((r) => <div key={r} style={{ ...ls.ring, width: r * 2, height: r * 2 }} />)}
      <div style={ls.orbitCore}>ō</div>
      {concepts.map((c, i) => {
        const angle = c.offset + t * c.speed * 2 * Math.PI;
        return (
          <div key={i} style={{ ...ls.orbitChip, transform: `translate(${Math.cos(angle) * c.r}px, ${Math.sin(angle) * c.r}px)` }}>
            <span style={{ color: 'var(--accent)' }}>●</span>{c.label}
          </div>
        );
      })}
    </div>
  );
};

const StudyFlowPreview = ({ t }) => {
  const Icon = window.Icon;
  const nodes = [
    ['Material', 'Arrays and complexity indexed', 'File'],
    ['Notes', 'Key definitions and exam summary saved', 'PenNib'],
    ['Cards', 'Topic-tagged recall prompts scheduled', 'Cards'],
    ['Quiz', 'Attempts, score, and wrong answers stored', 'Target'],
  ];
  return (
    <div style={ls.preview}>
      <div style={ls.previewSource}>
        <div style={ls.previewEyebrow}>Source excerpt</div>
        <h4 style={ls.previewTitle}>Arrays and Big-O</h4>
        <p style={ls.previewText}>
          Arrays store elements contiguously, giving O(1) indexed access.
          Insertions in the middle shift elements and take O(n), which matters
          when choosing between arrays and linked structures.
        </p>
        <div style={ls.previewTags}>
          <span className="chip chip-accent">Big-O notation</span>
          <span className="chip">Arrays</span>
          <span className="chip">Trade-offs</span>
        </div>
      </div>
      <div style={ls.previewPanel}>
        {nodes.map(([title, text, icon], i) => {
          const C = Icon[icon] || Icon.Sparkle;
          return (
            <div key={title} style={{ ...ls.previewNode, transform: `translateY(${Math.sin(t * 1.4 + i) * 3}px)` }}>
              <div style={ls.previewIcon}><C size={13}/></div>
              <div>
                <div style={{ fontSize: 12.5, color: 'var(--fg-0)', fontWeight: 500 }}>{title}</div>
                <div style={{ fontSize: 11.5, color: 'var(--fg-3)', marginTop: 2 }}>{text}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const landingCss = `
  @media (max-width: 920px) {
    .landing-nav { grid-template-columns: 1fr auto !important; padding: 12px 18px !important; }
    .landing-links { display: none !important; }
    .landing-hero { grid-template-columns: 1fr !important; padding: 60px 22px 80px !important; }
    .landing-visual { min-height: 360px; }
    .landing-grid { grid-template-columns: 1fr !important; }
    .landing-trust { flex-direction: column; gap: 14px !important; }
    .landing-showcase { border-radius: var(--r-lg) !important; }
  }
`;

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
  navLink: { cursor: 'pointer', transition: 'all 160ms var(--ease-out)', padding: '6px 14px', borderRadius: 999 },
  navActions: { display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end' },
  hero: {
    display: 'grid', gridTemplateColumns: '1fr 1fr',
    alignItems: 'center', gap: 60,
    padding: '80px 56px 110px', maxWidth: 1400, margin: '0 auto',
    position: 'relative', zIndex: 2,
  },
  heroText: { maxWidth: 560 },
  liveDot: { width: 5, height: 5, borderRadius: 3, background: 'var(--accent)', boxShadow: '0 0 16px var(--accent)' },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(48px, 7vw, 78px)', fontWeight: 300, lineHeight: 1.02,
    letterSpacing: '-0.025em', margin: '0 0 28px',
  },
  em: { fontStyle: 'italic', color: 'var(--accent)', fontWeight: 300 },
  subtitle: { fontSize: 16, color: 'var(--fg-1)', lineHeight: 1.6, maxWidth: 520, margin: 0 },
  ctaRow: { display: 'flex', gap: 10, marginTop: 36, flexWrap: 'wrap' },
  cta: { padding: '12px 18px', fontSize: 14 },
  trustRow: { marginTop: 44, display: 'flex', gap: 28, color: 'var(--fg-3)', fontSize: 11.5 },
  trustTitle: { fontFamily: 'var(--font-display)', fontSize: 21, color: 'var(--fg-0)' },
  heroVisual: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
  section: { padding: '80px 56px', maxWidth: 1400, margin: '0 auto', position: 'relative', zIndex: 2 },
  sectionHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 36, marginBottom: 48 },
  sectionCopy: { fontSize: 12.5, color: 'var(--fg-2)', maxWidth: 340, textAlign: 'right', lineHeight: 1.6 },
  eyebrow: { fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 14, fontWeight: 500 },
  h2: { fontFamily: 'var(--font-display)', fontSize: 'clamp(34px, 5vw, 48px)', fontWeight: 300, letterSpacing: '-0.02em', lineHeight: 1.1, margin: 0, maxWidth: 780 },
  methodGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 },
  methodCard: { padding: 28, minHeight: 220, display: 'flex', flexDirection: 'column' },
  cardTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
  cardNum: { fontSize: 10.5, color: 'var(--fg-3)', letterSpacing: '0.1em' },
  cardTitle: { fontFamily: 'var(--font-display)', fontSize: 22, margin: '0 0 10px', fontWeight: 400, letterSpacing: '-0.01em' },
  cardText: { fontSize: 13, color: 'var(--fg-2)', margin: 0, lineHeight: 1.55 },
  showcase: { overflow: 'hidden', borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-lg)' },
  showcaseChrome: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--line)', background: 'var(--bg-1)' },
  chromeDot: { width: 10, height: 10, borderRadius: 5, background: 'var(--line-strong)' },
  showcaseBody: { background: 'var(--bg-1)' },
  preview: { display: 'grid', gridTemplateColumns: '1.1fr 1fr', minHeight: 430 },
  previewSource: { padding: 28, borderRight: '1px solid var(--line)' },
  previewPanel: { padding: 28, background: 'var(--bg-2)', display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'center' },
  previewEyebrow: { fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 },
  previewTitle: { fontFamily: 'var(--font-display)', fontSize: 24, margin: '0 0 14px', fontWeight: 400 },
  previewText: { fontSize: 13, color: 'var(--fg-1)', lineHeight: 1.7, margin: 0 },
  previewTags: { marginTop: 20, display: 'flex', gap: 6, flexWrap: 'wrap' },
  previewNode: { padding: 14, borderRadius: 'var(--r-md)', border: '1px solid var(--line)', background: 'var(--bg-1)', display: 'flex', gap: 12, alignItems: 'center', transition: 'transform 200ms var(--ease-out)' },
  previewIcon: { width: 28, height: 28, borderRadius: 8, background: 'var(--accent-glow)', border: '1px solid var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  footerCta: { maxWidth: 1400, margin: '60px auto', padding: '80px 56px', textAlign: 'center', borderTop: '1px solid var(--line-soft)', borderBottom: '1px solid var(--line-soft)', position: 'relative', zIndex: 2 },
  footer: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '30px 56px', position: 'relative', zIndex: 2 },
  orbit: { position: 'relative', width: 520, height: 520, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  orbitGlow: { position: 'absolute', inset: 40, background: 'radial-gradient(closest-side, var(--accent-glow), transparent 70%)', filter: 'blur(20px)', animation: 'drift 8s ease-in-out infinite' },
  ring: { position: 'absolute', border: '1px solid var(--line)', borderRadius: '50%', opacity: 0.45 },
  orbitCore: { width: 72, height: 72, borderRadius: '50%', background: 'radial-gradient(circle at 30% 30%, var(--parchment), var(--accent) 70%)', boxShadow: '0 0 60px 10px var(--accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--bg-0)', fontFamily: 'var(--font-display)', fontSize: 30 },
  orbitChip: { position: 'absolute', display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 999, fontSize: 11, color: 'var(--fg-1)', whiteSpace: 'nowrap', boxShadow: 'var(--shadow-sm)' },
};

window.Landing = Landing;
