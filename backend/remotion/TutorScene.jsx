import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

const theme = {
  bg: '#080b12',
  panel: '#111827',
  panel2: '#162033',
  text: '#f8fafc',
  muted: '#94a3b8',
  accent: '#60a5fa',
  green: '#34d399',
  red: '#fb7185',
  amber: '#fbbf24',
  line: '#334155',
};

export const TutorScene = ({ scene = {}, slide = {} }) => {
  const frame = useCurrentFrame();
  const cfg = useVideoConfig();
  const entrance = spring({ frame, fps: cfg.fps, config: { damping: 18, stiffness: 120 } });
  const template = String(scene.visualTemplate || slide.visual_type || '').toLowerCase();
  const title = scene.title || slide.title || 'Tutor scene';
  const goal = scene.teachingGoal || slide.caption || '';
  const labels = compactLabels(scene, slide);

  return (
    <AbsoluteFill style={styles.root}>
      <div style={styles.glowA} />
      <div style={styles.glowB} />
      <header style={{ ...styles.header, opacity: entrance, transform: `translateY(${(1 - entrance) * 16}px)` }}>
        <div>
          <div style={styles.eyebrow}>Noesis tutor board</div>
          <h1 style={styles.title}>{title}</h1>
        </div>
        <div style={styles.sceneType}>{readable(template || scene.type || 'visual lesson')}</div>
      </header>

      <main style={styles.main}>
        <section style={styles.stage}>
          {template.includes('poly')
            ? <PolymorphismDispatch frame={frame} />
            : template.includes('inherit') || template.includes('class')
              ? <InheritanceVisual frame={frame} />
              : template.includes('linked')
                ? <LinkedListVisual frame={frame} />
                : <ConceptMapVisual frame={frame} scene={scene} />}
        </section>
        <aside style={styles.side}>
          <div style={styles.goalCard}>
            <div style={styles.cardLabel}>Teaching goal</div>
            <p style={styles.goalText}>{goal || 'Follow the highlighted part of the diagram.'}</p>
          </div>
          <div style={styles.focusList}>
            {labels.map((label, i) => (
              <div key={label + i} style={{
                ...styles.focusChip,
                opacity: pulseFor(frame, i),
                borderColor: i === activePhase(frame, labels.length) ? theme.accent : theme.line,
              }}>
                <span style={styles.focusDot} />
                {label}
              </div>
            ))}
          </div>
          {scene.code && scene.code.content ? <CodePanel code={scene.code} frame={frame} /> : null}
        </aside>
      </main>
    </AbsoluteFill>
  );
};

const PolymorphismDispatch = ({ frame }) => {
  const phase = Math.floor((frame % 120) / 40);
  const t = interpolate(frame % 40, [0, 28, 40], [0, 1, 1], { extrapolateRight: 'clamp' });
  return (
    <svg viewBox="0 0 820 470" style={styles.svg}>
      <defs>
        <marker id="arrow-remotion" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto">
          <path d="M0,0 L12,6 L0,12 Z" fill={theme.red} />
        </marker>
        <filter id="softGlow"><feGaussianBlur stdDeviation="5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <ClassNode x={42} y={168} w={172} h={96} title="Shape s" sub="reference type" active={phase === 0} />
      <ClassNode x={318} y={70} w={190} h={96} title="Circle object" sub="runtime object" active={phase === 1} tone="green" />
      <ClassNode x={318} y={298} w={210} h={96} title="Rectangle object" sub="after reassignment" active={phase === 2} tone="green" />
      <MethodNode x={620} y={72} title="Circle.area()" active={phase === 1} />
      <MethodNode x={608} y={300} title="Rectangle.area()" active={phase === 2} />
      <AnimatedArrow x1={214} y1={216} x2={318} y2={118} progress={phase === 0 ? t : 1} label="points to object" />
      <AnimatedArrow x1={508} y1={118} x2={620} y2={118} progress={phase === 1 ? t : phase > 1 ? 1 : 0.25} label="dispatch" />
      <AnimatedArrow x1={214} y1={216} x2={318} y2={346} progress={phase === 2 ? t : 0.35} label="same call" />
      <AnimatedArrow x1={528} y1={346} x2={608} y2={346} progress={phase === 2 ? t : 0.25} label="new target" />
      <text x="410" y="440" textAnchor="middle" fill={theme.muted} fontSize="20">
        The reference type stays Shape, but the runtime object chooses the overridden method.
      </text>
    </svg>
  );
};

const InheritanceVisual = ({ frame }) => {
  const phase = activePhase(frame, 3);
  return (
    <svg viewBox="0 0 820 470" style={styles.svg}>
      <defs><marker id="arrow-inherit" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto"><path d="M0,0 L12,6 L0,12 Z" fill={theme.accent}/></marker></defs>
      <ClassNode x={315} y={35} w={190} h={116} title="Shape" sub="+ area()" active={phase === 0} />
      <ClassNode x={138} y={278} w={190} h={116} title="Circle" sub="overrides area()" active={phase === 1} tone="green" />
      <ClassNode x={490} y={278} w={210} h={116} title="Rectangle" sub="overrides area()" active={phase === 2} tone="green" />
      <line x1="235" y1="278" x2="358" y2="151" stroke={theme.accent} strokeWidth="6" markerEnd="url(#arrow-inherit)" opacity="0.95"/>
      <line x1="595" y1="278" x2="462" y2="151" stroke={theme.accent} strokeWidth="6" markerEnd="url(#arrow-inherit)" opacity="0.95"/>
      <text x="410" y="442" textAnchor="middle" fill={theme.muted} fontSize="20">Subclasses reuse Shape's contract, then customize behavior.</text>
    </svg>
  );
};

const LinkedListVisual = ({ frame }) => {
  const phase = activePhase(frame, 4);
  return (
    <svg viewBox="0 0 820 470" style={styles.svg}>
      <defs><marker id="arrow-list" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto"><path d="M0,0 L12,6 L0,12 Z" fill={theme.red}/></marker></defs>
      <Box x={40} y={200} w={105} h={66} title="head" active={phase === 0} tone="amber" />
      <ListNode x={205} y={170} value="10" active={phase === 1} />
      <ListNode x={405} y={170} value="20" active={phase === 2} />
      <ListNode x={605} y={170} value="30" active={phase === 3} />
      <ArrowLine x1={145} y1={233} x2={205} y2={213} active={phase === 0} />
      <ArrowLine x1={335} y1={213} x2={405} y2={213} active={phase === 1} />
      <ArrowLine x1={535} y1={213} x2={605} y2={213} active={phase === 2} />
      <ArrowLine x1={735} y1={213} x2={782} y2={213} active={phase === 3} />
      <text x="790" y="220" fill={theme.text} fontSize="21" fontWeight="700">null</text>
      <text x="410" y="410" textAnchor="middle" fill={theme.muted} fontSize="20">Traversal follows next references until null.</text>
    </svg>
  );
};

const ConceptMapVisual = ({ frame, scene }) => {
  const nodes = ((scene.visualData && scene.visualData.nodes) || []).map(n => typeof n === 'string' ? n : n.label || n.id).filter(Boolean);
  const labels = nodes.length ? nodes.slice(0, 6) : ['Start', 'Concept', 'Example', 'Practice'];
  const phase = activePhase(frame, labels.length);
  return (
    <svg viewBox="0 0 820 470" style={styles.svg}>
      <ClassNode x={315} y={178} w={190} h={96} title={labels[0]} sub="start here" active />
      {labels.slice(1).map((label, i) => {
        const pts = [[95,82], [550,82], [95,318], [550,318], [315,35]];
        const p = pts[i % pts.length];
        return <g key={label + i}>
          <line x1="410" y1="226" x2={p[0] + 95} y2={p[1] + 48} stroke={theme.line} strokeWidth="4" strokeDasharray="10 10" />
          <ClassNode x={p[0]} y={p[1]} w={190} h={96} title={label} sub={i === phase ? 'focus' : 'branch'} active={i === phase} tone={i % 2 ? 'green' : 'amber'} />
        </g>;
      })}
    </svg>
  );
};

const CodePanel = ({ code, frame }) => {
  const lines = String(code.content || '').split('\n').slice(0, 9);
  const highlight = new Set((code.highlightLines || []).map(Number));
  const phaseLine = lines.length ? (Math.floor(frame / 45) % lines.length) + 1 : 1;
  return (
    <div style={styles.codePanel}>
      <div style={styles.cardLabel}>Line focus</div>
      {lines.map((line, i) => {
        const n = i + 1;
        const active = highlight.has(n) || n === phaseLine;
        return (
          <div key={n} style={{ ...styles.codeLine, background: active ? 'rgba(96,165,250,0.18)' : 'transparent' }}>
            <span style={styles.codeNo}>{n}</span>
            <span>{line}</span>
          </div>
        );
      })}
    </div>
  );
};

const ClassNode = ({ x, y, w, h, title, sub, active, tone = 'blue' }) => {
  const color = tone === 'green' ? theme.green : tone === 'amber' ? theme.amber : theme.accent;
  return (
    <g filter={active ? 'url(#softGlow)' : undefined}>
      <rect x={x} y={y} width={w} height={h} rx="22" fill={active ? '#1e293b' : '#111827'} stroke={color} strokeWidth={active ? 5 : 2.5}/>
      <text x={x + w / 2} y={y + 40} textAnchor="middle" fill={theme.text} fontSize="25" fontWeight="800">{title}</text>
      <line x1={x + 18} y1={y + 56} x2={x + w - 18} y2={y + 56} stroke={color} strokeWidth="2" opacity="0.7" />
      <text x={x + w / 2} y={y + 82} textAnchor="middle" fill={theme.muted} fontSize="18">{sub}</text>
    </g>
  );
};

const MethodNode = ({ x, y, title, active }) => (
  <g>
    <rect x={x} y={y} width="160" height="92" rx="20" fill={active ? '#3f1720' : '#171923'} stroke={theme.red} strokeWidth={active ? 5 : 2.5} />
    <text x={x + 80} y={y + 54} textAnchor="middle" fill={theme.text} fontSize="21" fontWeight="800">{title}</text>
  </g>
);

const Box = ({ x, y, w, h, title, active, tone = 'blue' }) => {
  const color = tone === 'amber' ? theme.amber : theme.accent;
  return <g><rect x={x} y={y} width={w} height={h} rx="16" fill={active ? '#2b220f' : '#111827'} stroke={color} strokeWidth={active ? 5 : 2.5}/><text x={x + w / 2} y={y + 40} textAnchor="middle" fill={theme.text} fontSize="23" fontWeight="800">{title}</text></g>;
};

const ListNode = ({ x, y, value, active }) => (
  <g>
    <rect x={x} y={y} width="130" height="88" rx="18" fill={active ? '#143326' : '#111827'} stroke={theme.green} strokeWidth={active ? 5 : 2.5}/>
    <line x1={x + 72} y1={y} x2={x + 72} y2={y + 88} stroke={theme.green} strokeWidth="2.5"/>
    <text x={x + 36} y={y + 53} textAnchor="middle" fill={theme.text} fontSize="25" fontWeight="800">{value}</text>
    <text x={x + 101} y={y + 53} textAnchor="middle" fill={theme.muted} fontSize="17" fontWeight="700">next</text>
  </g>
);

const AnimatedArrow = ({ x1, y1, x2, y2, progress, label }) => {
  const x = x1 + (x2 - x1) * progress;
  const y = y1 + (y2 - y1) * progress;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x} y2={y} stroke={theme.red} strokeWidth="6" strokeLinecap="round" markerEnd="url(#arrow-remotion)" />
      <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 14} textAnchor="middle" fill={theme.red} fontSize="17" fontWeight="800">{label}</text>
    </g>
  );
};

const ArrowLine = ({ x1, y1, x2, y2, active }) => (
  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={active ? theme.red : theme.line} strokeWidth={active ? 6 : 4} strokeLinecap="round" markerEnd="url(#arrow-list)" />
);

function compactLabels(scene, slide) {
  const raw = [
    ...(((scene.visualData && scene.visualData.nodes) || []).map(n => typeof n === 'string' ? n : n.label || n.id || '')),
    ...((slide.bullets || [])),
  ].filter(Boolean);
  const out = raw.map(s => String(s).replace(/[.!?]+$/g, '').split(/\s+/).slice(0, 4).join(' '));
  return [...new Set(out)].slice(0, 4);
}

function activePhase(frame, count) {
  return Math.floor((frame % 150) / Math.max(1, Math.floor(150 / Math.max(1, count)))) % Math.max(1, count);
}

function pulseFor(frame, i) {
  return 0.72 + Math.sin((frame + i * 18) / 12) * 0.18;
}

function readable(value) {
  return String(value || '').replace(/_/g, ' ');
}

const styles = {
  root: {
    width: '100%',
    height: '100%',
    background: `linear-gradient(135deg, ${theme.bg}, #111827 56%, #0f172a)`,
    color: theme.text,
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    padding: 44,
    boxSizing: 'border-box',
    overflow: 'hidden',
  },
  glowA: { position: 'absolute', left: -100, top: -120, width: 440, height: 440, borderRadius: 999, background: 'rgba(96,165,250,0.20)', filter: 'blur(70px)' },
  glowB: { position: 'absolute', right: -120, bottom: -160, width: 520, height: 520, borderRadius: 999, background: 'rgba(52,211,153,0.14)', filter: 'blur(80px)' },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', position: 'relative', zIndex: 2 },
  eyebrow: { color: theme.accent, fontSize: 15, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 },
  title: { margin: 0, fontSize: 48, lineHeight: 1.05, letterSpacing: -1, fontWeight: 850 },
  sceneType: { padding: '10px 16px', border: `1px solid ${theme.line}`, borderRadius: 999, color: theme.muted, background: 'rgba(15,23,42,0.68)', fontSize: 18, textTransform: 'capitalize' },
  main: { display: 'grid', gridTemplateColumns: '1fr 350px', gap: 28, marginTop: 32, position: 'relative', zIndex: 2 },
  stage: { height: 505, border: `1px solid ${theme.line}`, borderRadius: 28, background: 'rgba(15,23,42,0.72)', boxShadow: '0 30px 80px rgba(0,0,0,0.32)', padding: 16 },
  side: { display: 'flex', flexDirection: 'column', gap: 16 },
  goalCard: { border: `1px solid ${theme.line}`, borderRadius: 22, background: 'rgba(15,23,42,0.78)', padding: 18 },
  cardLabel: { color: theme.accent, fontSize: 13, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 },
  goalText: { margin: 0, color: theme.text, fontSize: 20, lineHeight: 1.42, fontWeight: 650 },
  focusList: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  focusChip: { display: 'inline-flex', alignItems: 'center', gap: 8, border: `1px solid ${theme.line}`, borderRadius: 999, background: 'rgba(15,23,42,0.82)', padding: '9px 13px', color: theme.text, fontSize: 18, fontWeight: 760 },
  focusDot: { width: 8, height: 8, borderRadius: 99, background: theme.accent, boxShadow: `0 0 18px ${theme.accent}` },
  codePanel: { border: `1px solid ${theme.line}`, borderRadius: 22, background: '#020617', padding: 14, maxHeight: 250, overflow: 'hidden' },
  codeLine: { display: 'grid', gridTemplateColumns: '28px 1fr', gap: 8, color: '#dbeafe', fontFamily: 'JetBrains Mono, Consolas, monospace', fontSize: 14, lineHeight: 1.5, padding: '3px 6px', borderRadius: 8 },
  codeNo: { color: theme.muted, textAlign: 'right' },
  svg: { width: '100%', height: '100%', display: 'block' },
};
