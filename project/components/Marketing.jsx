// Marketing pages — Product, Students, Method, Pricing
// Each shares a MarketingShell that wraps the Landing-style nav.

const MarketingShell = ({ onEnter, current, children }) => {
  const Icon = window.Icon;
  const links = [
    { id: 'product', label: 'Product' },
    { id: 'students', label: 'For students' },
    { id: 'method', label: 'Method' },
    { id: 'pricing', label: 'Pricing' },
  ];
  return (
    <div style={{ background: 'var(--bg-0)', color: 'var(--fg-0)', minHeight: '100vh' }}>
      <header style={{
        display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center',
        padding: '14px 44px', borderBottom: '1px solid var(--line-soft)',
        position: 'sticky', top: 0,
        background: 'color-mix(in oklab, var(--bg-0) 72%, transparent)',
        backdropFilter: 'blur(18px) saturate(130%)',
        WebkitBackdropFilter: 'blur(18px) saturate(130%)',
        zIndex: 30,
      }}>
        <window.Logo size={22} onClick={() => onEnter('landing')}/>
        <nav style={{
          display: 'flex', gap: 4, fontSize: 13, color: 'var(--fg-2)',
          padding: '4px', background: 'color-mix(in oklab, var(--bg-1) 60%, transparent)',
          borderRadius: 999, border: '1px solid var(--line-soft)',
        }}>
          {links.map(l => (
            <a key={l.id} onClick={() => onEnter(l.id)} className="ls-navlink" style={{
              cursor: 'pointer', padding: '6px 14px', borderRadius: 999,
              color: current === l.id ? 'var(--fg-0)' : 'var(--fg-2)',
              background: current === l.id ? 'color-mix(in oklab, var(--accent) 18%, transparent)' : 'transparent',
              transition: 'all 160ms var(--ease-out)',
            }}>{l.label}</a>
          ))}
        </nav>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end' }}>
          <button className="btn btn-bare" onClick={() => onEnter('auth')}>Sign in</button>
          <button className="btn btn-accent" onClick={() => onEnter('onboarding')} style={{ padding: '8px 14px' }}>
            Start free <Icon.ArrowRight size={12}/>
          </button>
        </div>
      </header>

      {children}

      <MarketingFooter onEnter={onEnter}/>
    </div>
  );
};

const MarketingFooter = ({ onEnter }) => (
  <footer style={{
    borderTop: '1px solid var(--line-soft)', marginTop: 60,
    padding: '56px 56px 40px', maxWidth: 1400, margin: '60px auto 0',
    display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 48,
  }}>
    <div>
      <window.Logo size={22}/>
      <p style={{ fontSize: 13, color: 'var(--fg-2)', maxWidth: 280, marginTop: 14, lineHeight: 1.6 }}>
        A calm place to think. Noēsis is how studying feels when it's working.
      </p>
    </div>
    {[
      { h: 'Product', l: ['Overview', 'AI Tutor', 'Flashcards', 'Notes'] },
      { h: 'Company', l: ['Method', 'Students', 'Pricing', 'Changelog'] },
      { h: 'Resources', l: ['Guides', 'Research', 'Privacy', 'Terms'] },
    ].map(col => (
      <div key={col.h}>
        <div style={{ fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14 }}>{col.h}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {col.l.map(l => <a key={l} style={{ fontSize: 13, color: 'var(--fg-1)', cursor: 'pointer' }}>{l}</a>)}
        </div>
      </div>
    ))}
  </footer>
);

// ─────────────────────────────────────────────────────────
// PRODUCT
// ─────────────────────────────────────────────────────────
const ProductPage = ({ onEnter }) => {
  const Icon = window.Icon;
  const features = [
    { icon: 'Sparkle', title: 'The Socratic tutor', body: 'Not a chatbot. A patient, honest thinking partner that asks before it answers. It adapts to what you already know.' },
    { icon: 'Folder', title: 'Materials that think', body: 'Drop a PDF, a lecture recording, a scan of your notebook. Noēsis indexes it, links it, and keeps it searchable.' },
    { icon: 'Cards', title: 'Adaptive flashcards', body: 'Spaced repetition done right — cards surface when your memory is about to fail, not on a rigid daily count.' },
    { icon: 'Tree', title: 'The concept graph', body: 'Every concept you touch becomes a node. Watch your mental model fill in — and see the gaps before they bite.' },
    { icon: 'PenNib', title: 'Notes that link back', body: 'Write freely. Noēsis quietly links ideas to source material, so nothing you write floats context-free.' },
    { icon: 'Chart', title: 'Honest progress', body: 'Mastery curves, retention decay, time-on-task. No vanity streaks. Just the truth about what you actually know.' },
  ];
  return (
    <MarketingShell onEnter={onEnter} current="product">
      <section style={{ padding: '120px 56px 80px', maxWidth: 1100, margin: '0 auto', textAlign: 'center', position: 'relative' }}>
        <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 18 }}>The Product</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 72, fontWeight: 300, letterSpacing: '-0.025em', lineHeight: 1.02, margin: 0 }}>
          Six surfaces, one <em style={{ fontStyle: 'italic', color: 'var(--accent)' }}>mind</em>.
        </h1>
        <p style={{ fontSize: 17, color: 'var(--fg-1)', marginTop: 28, maxWidth: 620, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
          Noēsis isn't a collection of study tools bolted together. It's one continuous memory of what you're learning — expressed through whichever surface you need right now.
        </p>
      </section>

      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '0 56px 80px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--line)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
        {features.map((f, i) => {
          const C = Icon[f.icon];
          return (
            <div key={f.title} style={{ background: 'var(--bg-1)', padding: '40px 32px', minHeight: 240 }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: 'color-mix(in oklab, var(--accent) 14%, var(--bg-2))', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}>
                <C size={18} style={{ color: 'var(--accent)' }}/>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, letterSpacing: '-0.01em', marginBottom: 10 }}>{f.title}</div>
              <p style={{ fontSize: 14, color: 'var(--fg-2)', lineHeight: 1.6, margin: 0 }}>{f.body}</p>
            </div>
          );
        })}
      </section>

      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 56px 100px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 14 }}>One memory</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 48, fontWeight: 300, letterSpacing: '-0.02em', lineHeight: 1.1, margin: 0 }}>
              Everything connects.
            </h2>
            <p style={{ fontSize: 15, color: 'var(--fg-1)', lineHeight: 1.7, marginTop: 20, maxWidth: 480 }}>
              Highlight a line in a PDF → it becomes a card. Struggle with that card → the tutor brings it up next session. Master it → the concept node in your graph turns solid. Everything feeds everything else.
            </p>
            <button className="btn btn-accent" onClick={() => onEnter('onboarding')} style={{ marginTop: 28, padding: '12px 18px' }}>
              Try the flow <Icon.ArrowRight size={14}/>
            </button>
          </div>
          <div style={{
            height: 360, borderRadius: 'var(--r-lg)',
            background: 'radial-gradient(circle at 30% 30%, color-mix(in oklab, var(--accent) 22%, var(--bg-1)), var(--bg-1) 70%)',
            border: '1px solid var(--line)', position: 'relative', overflow: 'hidden',
          }}>
            <ConnectedVisual/>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
};

const ConnectedVisual = () => {
  // orbiting nodes demonstrating "everything connects"
  const nodes = [
    { x: 50, y: 50, label: 'Concept', size: 64, primary: true },
    { x: 15, y: 22, label: 'PDF', size: 36 },
    { x: 82, y: 30, label: 'Card', size: 36 },
    { x: 78, y: 78, label: 'Note', size: 36 },
    { x: 20, y: 76, label: 'Tutor', size: 36 },
  ];
  return (
    <svg viewBox="0 0 400 360" style={{ width: '100%', height: '100%' }}>
      <defs>
        <radialGradient id="gn">
          <stop offset="0%" stopColor="var(--accent)"/>
          <stop offset="100%" stopColor="var(--accent-soft)"/>
        </radialGradient>
      </defs>
      {/* lines */}
      {nodes.slice(1).map((n, i) => (
        <line key={i} x1="200" y1="180" x2={n.x * 4} y2={n.y * 3.6}
          stroke="var(--accent-soft)" strokeWidth="1" opacity="0.5"
          strokeDasharray="3 4" className="gv-line"
          style={{ animationDelay: `${i * 0.2}s` }}/>
      ))}
      {/* nodes */}
      {nodes.map((n, i) => (
        <g key={i} className="gv-node" style={{ animationDelay: `${i * 0.15}s`, transformOrigin: `${n.x * 4}px ${n.y * 3.6}px` }}>
          <circle cx={n.x * 4} cy={n.y * 3.6} r={n.size / 2}
            fill={n.primary ? 'url(#gn)' : 'var(--bg-2)'}
            stroke="var(--line)" strokeWidth="1"/>
          <text x={n.x * 4} y={n.y * 3.6 + 4} textAnchor="middle"
            fontSize={n.primary ? 12 : 10}
            fill={n.primary ? 'var(--bg-0)' : 'var(--fg-1)'}
            fontFamily="var(--font-display)">
            {n.label}
          </text>
        </g>
      ))}
      <style>{`
        .gv-line { animation: dash 8s linear infinite; }
        .gv-node { animation: nodePulse 4s ease-in-out infinite; }
        @keyframes dash { to { stroke-dashoffset: -40; } }
        @keyframes nodePulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
      `}</style>
    </svg>
  );
};

// ─────────────────────────────────────────────────────────
// FOR STUDENTS
// ─────────────────────────────────────────────────────────
const StudentsPage = ({ onEnter }) => {
  const Icon = window.Icon;
  const personas = [
    { n: 'The pre-med', q: '"Three hundred pages a week. I need to remember all of it in six years."', out: 'Noēsis turns every textbook chapter into a living flashcard deck. Retention goes up 40% over highlighter-only study.' },
    { n: 'The CS student', q: '"I understand in lecture, then forget on the exam."', out: 'The Socratic tutor quizzes you on the exact edge cases your brain silently skipped.' },
    { n: 'The humanities major', q: '"I have to synthesize — not just memorize."', out: 'The concept graph maps every essay to every idea. You start seeing connections you missed.' },
    { n: 'The returning student', q: '"I haven\'t done math in twelve years."', out: 'Noēsis meets you at zero and rebuilds the foundation. No judgment, infinite patience.' },
  ];

  return (
    <MarketingShell onEnter={onEnter} current="students">
      <section style={{ padding: '100px 56px 60px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 18 }}>For students</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 72, fontWeight: 300, letterSpacing: '-0.025em', lineHeight: 1.02, margin: 0, maxWidth: 900 }}>
          Built for the student who wants to <em style={{ fontStyle: 'italic', color: 'var(--accent)' }}>actually know</em> the thing.
        </h1>
        <p style={{ fontSize: 17, color: 'var(--fg-1)', marginTop: 28, maxWidth: 640, lineHeight: 1.6 }}>
          Noēsis was designed with students in mind. Cramming works for tests. It doesn't work for careers.
        </p>
      </section>

      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '0 56px 60px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {personas.map((p, i) => (
          <div key={p.n} className="card" style={{ padding: 32, position: 'relative', overflow: 'hidden' }}>
            <div style={{ fontSize: 64, fontFamily: 'var(--font-display)', fontWeight: 300, color: 'var(--accent-soft)', position: 'absolute', top: 4, right: 20, lineHeight: 1, opacity: 0.5 }}>{String(i + 1).padStart(2, '0')}</div>
            <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 10 }}>{p.n}</div>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 300, lineHeight: 1.3, letterSpacing: '-0.01em', margin: '0 0 20px', color: 'var(--fg-0)' }}>{p.q}</p>
            <p style={{ fontSize: 14, color: 'var(--fg-2)', lineHeight: 1.6, margin: 0 }}>{p.out}</p>
          </div>
        ))}
      </section>

      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '60px 56px 100px' }}>
        <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 14 }}>Results</div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 48, fontWeight: 300, letterSpacing: '-0.02em', margin: 0, maxWidth: 720 }}>
          What students say after a semester.
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginTop: 40 }}>
          {[
            { v: '+0.6', u: 'GPA, average across 400 students', b: 'Spring 2024 cohort study' },
            { v: '12x', u: 'More likely to retain, at 30 days', b: 'vs. highlighter-only study' },
            { v: '23 min', u: 'Average daily time', b: 'Not cramming. Not burnout.' },
          ].map(s => (
            <div key={s.u} style={{ padding: 28, border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', background: 'var(--bg-1)' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 56, fontWeight: 300, letterSpacing: '-0.03em', color: 'var(--accent)', lineHeight: 1 }}>{s.v}</div>
              <div style={{ fontSize: 14, color: 'var(--fg-0)', marginTop: 10, fontWeight: 500 }}>{s.u}</div>
              <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 4 }}>{s.b}</div>
            </div>
          ))}
        </div>
      </section>
    </MarketingShell>
  );
};

// ─────────────────────────────────────────────────────────
// METHOD
// ─────────────────────────────────────────────────────────
const MethodPage = ({ onEnter }) => {
  const Icon = window.Icon;
  const principles = [
    { n: 'I', t: 'Retrieval, not recognition', b: 'Highlighting tricks your brain into thinking it knows. Retrieval — pulling the answer from nothing — is the only thing that actually builds memory. Noēsis is retrieval-first by default.' },
    { n: 'II', t: 'Spaced over massed', b: 'Cramming produces a fragile shell of knowledge that evaporates. Spaced repetition — reviewing at expanding intervals — produces durable memory. The math is older than Netflix and far better studied.' },
    { n: 'III', t: 'Interleaving over blocking', b: 'Practicing one topic in a block feels easier but teaches less. Mixing topics feels harder but teaches more. Noēsis schedules interleaved practice because your future self is who the studying is for.' },
    { n: 'IV', t: 'Elaboration over rereading', b: 'Rereading is the most common study technique and one of the least effective. Explaining a concept — in your own words, to someone (or something) that asks follow-ups — is the gold standard. Hence the Socratic tutor.' },
    { n: 'V', t: 'Honest feedback, always', b: 'Streaks and badges can feel good while you\'re quietly forgetting everything. Noēsis shows you the truth: which cards are shaky, which concepts are empty, where the graph has holes. You can only fix what you can see.' },
  ];

  return (
    <MarketingShell onEnter={onEnter} current="method">
      <section style={{ padding: '100px 56px 60px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 18 }}>The method</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 72, fontWeight: 300, letterSpacing: '-0.025em', lineHeight: 1.02, margin: 0, maxWidth: 900 }}>
          Fifty years of learning science, <em style={{ fontStyle: 'italic', color: 'var(--accent)' }}>quietly</em> applied.
        </h1>
        <p style={{ fontSize: 17, color: 'var(--fg-1)', marginTop: 28, maxWidth: 640, lineHeight: 1.6 }}>
          Most study apps chase engagement. Noēsis chases something harder and more honest: knowledge that stays.
        </p>
      </section>

      <section style={{ maxWidth: 980, margin: '0 auto', padding: '40px 56px 100px' }}>
        {principles.map((p, i) => (
          <div key={p.n} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 40, padding: '40px 0', borderTop: i === 0 ? 'none' : '1px solid var(--line-soft)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 80, fontWeight: 300, color: 'var(--accent-soft)', letterSpacing: '-0.03em', lineHeight: 1, fontStyle: 'italic' }}>{p.n}</div>
            <div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 400, letterSpacing: '-0.015em', margin: 0, color: 'var(--fg-0)' }}>{p.t}</h3>
              <p style={{ fontSize: 15, color: 'var(--fg-1)', lineHeight: 1.7, marginTop: 16, maxWidth: 640 }}>{p.b}</p>
            </div>
          </div>
        ))}
      </section>

      <section style={{ maxWidth: 980, margin: '0 auto', padding: '20px 56px 100px', textAlign: 'center' }}>
        <p style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 300, lineHeight: 1.35, letterSpacing: '-0.01em', fontStyle: 'italic', color: 'var(--fg-1)', margin: 0, maxWidth: 760, marginInline: 'auto' }}>
          "The best study method is the one you'll actually use. Noēsis is the one built so you will."
        </p>
        <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 18, letterSpacing: '0.1em' }}>— Noēsis research, founding principle</div>
      </section>
    </MarketingShell>
  );
};

// ─────────────────────────────────────────────────────────
// PRICING
// ─────────────────────────────────────────────────────────
const PricingPage = ({ onEnter }) => {
  const Icon = window.Icon;
  const [yearly, setYearly] = React.useState(true);
  const tiers = [
    {
      id: 'free', name: 'Student',
      price: 0, yprice: 0,
      tag: 'Always free',
      desc: 'Everything you need to try the method on one course.',
      features: [
        'AI Tutor — 50 messages / day',
        'Flashcards & spaced repetition',
        '500 MB of materials',
        '1 active course at a time',
        'Mobile & web',
      ],
      cta: 'Start free',
      accent: false,
    },
    {
      id: 'plus', name: 'Scholar',
      price: 14, yprice: 9,
      tag: 'Most popular',
      desc: 'For the student running four courses at once. Full method, unlimited.',
      features: [
        'Unlimited AI Tutor',
        'Unlimited materials & courses',
        'Advanced concept graph',
        'Voice mode',
        'Study rooms (up to 6 people)',
        'Priority support',
      ],
      cta: 'Get Scholar',
      accent: true,
    },
    {
      id: 'pro', name: 'Academic',
      price: 29, yprice: 19,
      tag: 'For grad students & pros',
      desc: 'Research-grade tools. Integrations, exports, and the full corpus memory.',
      features: [
        'Everything in Scholar',
        'Zotero + Mendeley sync',
        'Unlimited study rooms',
        'Long-horizon memory (4+ years)',
        'API access',
        'Custom Socratic personas',
      ],
      cta: 'Get Academic',
      accent: false,
    },
  ];

  return (
    <MarketingShell onEnter={onEnter} current="pricing">
      <section style={{ padding: '100px 56px 40px', maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 18 }}>Pricing</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 72, fontWeight: 300, letterSpacing: '-0.025em', lineHeight: 1.02, margin: 0 }}>
          Priced for <em style={{ fontStyle: 'italic', color: 'var(--accent)' }}>students</em>.
        </h1>
        <p style={{ fontSize: 17, color: 'var(--fg-1)', marginTop: 28, maxWidth: 560, marginInline: 'auto', lineHeight: 1.6 }}>
          A free tier that's genuinely useful. A paid tier that costs less than a textbook. No trial bait, no hidden limits.
        </p>

        <div style={{ display: 'inline-flex', marginTop: 36, padding: 4, background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 999, gap: 2 }}>
          <button onClick={() => setYearly(false)} style={{ padding: '8px 18px', borderRadius: 999, fontSize: 13, background: !yearly ? 'var(--accent)' : 'transparent', color: !yearly ? 'var(--bg-0)' : 'var(--fg-2)' }}>Monthly</button>
          <button onClick={() => setYearly(true)} style={{ padding: '8px 18px', borderRadius: 999, fontSize: 13, background: yearly ? 'var(--accent)' : 'transparent', color: yearly ? 'var(--bg-0)' : 'var(--fg-2)' }}>
            Yearly <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.85 }}>−36%</span>
          </button>
        </div>
      </section>

      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 56px 80px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {tiers.map(t => {
          const p = yearly ? t.yprice : t.price;
          return (
            <div key={t.id} style={{
              padding: 32, borderRadius: 'var(--r-lg)',
              background: t.accent ? 'linear-gradient(180deg, color-mix(in oklab, var(--accent) 12%, var(--bg-1)), var(--bg-1))' : 'var(--bg-1)',
              border: '1px solid ' + (t.accent ? 'var(--accent-soft)' : 'var(--line)'),
              boxShadow: t.accent ? 'var(--shadow-glow)' : 'none',
              position: 'relative', display: 'flex', flexDirection: 'column',
            }}>
              {t.accent && (
                <div style={{ position: 'absolute', top: -11, left: 32, padding: '3px 10px', borderRadius: 999, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', background: 'var(--accent)', color: 'var(--bg-0)' }}>{t.tag}</div>
              )}
              {!t.accent && (
                <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-3)' }}>{t.tag}</div>
              )}
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, marginTop: t.accent ? 6 : 6, letterSpacing: '-0.01em' }}>{t.name}</div>
              <p style={{ fontSize: 13.5, color: 'var(--fg-2)', lineHeight: 1.6, marginTop: 8, minHeight: 46 }}>{t.desc}</p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 22 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 56, fontWeight: 300, letterSpacing: '-0.03em', lineHeight: 1 }}>${p}</span>
                <span style={{ fontSize: 13, color: 'var(--fg-3)' }}>/ month</span>
              </div>
              {yearly && p > 0 && (
                <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 4 }}>billed ${p * 12}/yr</div>
              )}
              <button className={t.accent ? 'btn btn-accent' : 'btn btn-ghost'} onClick={() => onEnter('onboarding')} style={{ marginTop: 22, padding: '12px 16px', justifyContent: 'center' }}>
                {t.cta} <Icon.ArrowRight size={13}/>
              </button>
              <div style={{ height: 1, background: 'var(--line-soft)', margin: '24px 0 18px' }}/>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {t.features.map(f => (
                  <div key={f} style={{ display: 'flex', gap: 10, fontSize: 13, color: 'var(--fg-1)' }}>
                    <Icon.Check size={14} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }}/>
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <section style={{ maxWidth: 780, margin: '0 auto', padding: '20px 56px 100px' }}>
        <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 14, textAlign: 'center' }}>Frequently asked</div>
        {[
          { q: 'Is there a free plan forever?', a: 'Yes. The Student plan is free as long as you want to use it. No trial timer, no credit card.' },
          { q: 'What counts as a "course"?', a: 'A folder of materials around one topic. On the free plan you pick one active course; paid plans have no limit.' },
          { q: 'Do you have a student discount?', a: 'The base Scholar pricing already is the student discount. We don\'t think education should cost $30/month.' },
          { q: 'Can I export my data?', a: 'Always. Full JSON export of materials, notes, cards, and progress. Noēsis is your memory — we never hold it hostage.' },
          { q: 'Do you train AI on my data?', a: 'No. Never. Private by default and contractually binding.' },
        ].map(f => (
          <FAQRow key={f.q} q={f.q} a={f.a}/>
        ))}
      </section>
    </MarketingShell>
  );
};

const FAQRow = ({ q, a }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <div style={{ borderBottom: '1px solid var(--line-soft)' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', padding: '22px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 16, color: 'var(--fg-0)', textAlign: 'left', background: 'transparent',
        fontFamily: 'var(--font-display)', fontWeight: 400, letterSpacing: '-0.01em',
      }}>
        <span>{q}</span>
        <span style={{ fontSize: 22, color: 'var(--fg-3)', transform: open ? 'rotate(45deg)' : 'none', transition: 'transform 180ms var(--ease-out)' }}>+</span>
      </button>
      {open && (
        <div style={{ paddingBottom: 22, fontSize: 14, color: 'var(--fg-2)', lineHeight: 1.7, maxWidth: 620, animation: 'fadeIn 240ms var(--ease-out)' }}>{a}</div>
      )}
    </div>
  );
};

Object.assign(window, { ProductPage, StudentsPage, MethodPage, PricingPage, MarketingShell });
