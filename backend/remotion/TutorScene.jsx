import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import visualRegistry from '../utils/visual-registry.js';
import codeWindow from '../utils/code-window.js';

const { normalizeCodeWindow } = codeWindow;

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
  const rawTemplate = scene.visualType || scene.visualTemplate || slide.visual_type || '';
  const title = scene.sceneTitle || scene.title || slide.title || 'Tutor scene';
  const visualResolution = visualRegistry.resolveVisualType(rawTemplate, {
    topic: scene.topic || slide.topic,
    title,
    text: [scene.learningPoint, scene.narration, slide.narration, slide.caption].filter(Boolean).join(' '),
  });
  const template = visualResolution.canonical || String(rawTemplate || '').toLowerCase();
  const keyIdea = scene.learningPoint || scene.studentFacingGoal || slide.caption || title;
  const labels = compactLabels(scene, slide);
  const Visual = VISUAL_COMPONENTS[template] || UnsupportedVisual;

  return (
    <AbsoluteFill style={styles.root}>
      <header style={{ ...styles.header, opacity: entrance, transform: `translateY(${(1 - entrance) * 16}px)` }}>
        <div>
          <div style={styles.eyebrow}>Noesis tutor board</div>
          <h1 style={styles.title}>{title}</h1>
        </div>
        <div style={styles.sceneType}>{readable(template || scene.type || 'visual lesson')}</div>
      </header>

      <main style={styles.main}>
        <section style={styles.stage}>
          <Visual frame={frame} scene={scene} slide={slide} visualType={template} resolution={visualResolution} />
        </section>
        <aside style={styles.side}>
          <div style={styles.goalCard}>
            <div style={styles.cardLabel}>Key idea</div>
            <p style={styles.goalText}>{keyIdea || 'Follow the highlighted part of the diagram.'}</p>
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
          {(scene.code && scene.code.content) || (slide.code_focus && slide.code_focus.content)
            ? <CodePanel code={scene.code || slide.code_focus} frame={frame} />
            : null}
        </aside>
      </main>
    </AbsoluteFill>
  );
};

const getVisualData = (scene = {}, slide = {}) => {
  const data = scene.visualElements || scene.visualData || slide.visual || {};
  const promotedDetails = {};
  for (const key of ['className', 'fields', 'methods', 'blockedAccess', 'validAccess', 'instances', 'objects', 'parentClass', 'childClasses', 'baseClass', 'implementations', 'methodCall', 'dispatchTargets', 'values', 'steps', 'complexities']) {
    if (data[key] != null) promotedDetails[key] = data[key];
  }
  return {
    type: data.type || slide.visual_type || '',
    nodes: data.nodes || slide.visual_nodes || [],
    edges: data.edges || slide.visual_edges || [],
    details: { ...(slide.visual_node_details || {}), ...(data.details || {}), ...promotedDetails },
    operations: data.operations || slide.operations || [],
    caption: data.caption || slide.caption || '',
  };
};

function asList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value == null || value === '') return [];
  return [value];
}

function firstDetail(details, keys, fallback = '') {
  for (const key of keys) {
    const value = details && details[key];
    if (Array.isArray(value) && value.length) return value[0];
    if (value != null && value !== '') return value;
  }
  return fallback;
}

function operationLabels(data, fallback = []) {
  return asList(data.operations).map(item => safeLabel(item, 52)).filter(Boolean).slice(0, 4).length
    ? asList(data.operations).map(item => safeLabel(item, 52)).filter(Boolean).slice(0, 4)
    : fallback;
}

function listFromDetails(details, keys, fallback = []) {
  for (const key of keys) {
    const values = asList(details && details[key]).map(item => safeLabel(item, 52)).filter(Boolean);
    if (values.length) return values;
  }
  return fallback;
}

function filteredNodeLabels(labels, rejectRe, fallback = []) {
  const out = labels.filter(label => !rejectRe.test(label)).slice(0, 5);
  return out.length ? out : fallback;
}

const EncapsulationBoundaryVisual = ({ frame, scene, slide }) => {
  const data = getVisualData(scene, slide);
  const nodes = compactNodeLabels(data.nodes);
  const details = data.details || {};
  const fields = listFromDetails(details, ['fields', 'privateFields'], nodes.filter(n => /private|field|count|balance|state/i.test(n)).slice(0, 2));
  const methods = listFromDetails(details, ['methods', 'publicMethods'], nodes.filter(n => /public|method|increment|get|set|deposit|withdraw|api/i.test(n)).slice(0, 2));
  const className = safeLabel(firstDetail(details, ['className', 'class'], pickLabel(nodes, /counter|account|class|api/i, 'Encapsulated class')), 36);
  const field = fields[0] || '- state: private';
  const method = methods[0] || '+ publicMethod()';
  const blocked = safeLabel(firstDetail(details, ['blockedAccess', 'blockedCall', 'invalidAccess'], pickLabel(nodes, /blocked|client\..*=|direct access/i, 'direct field write blocked')), 34);
  const valid = safeLabel(firstDetail(details, ['validAccess', 'validCall', 'allowedAccess'], pickLabel(nodes, /allowed|client\..*\(|increment|get|set|method call/i, 'call public method()')), 34);
  const state = safeLabel(firstDetail(details, ['stateLabel', 'invariant'], pickLabel(nodes, /valid state|invariant|state remains|object state/i, 'valid object state')), 34);
  const ops = operationLabels(data, ['protect state', 'block direct access', 'allow method call']);
  const phase = activePhase(frame, Math.max(4, ops.length));
  return (
    <svg viewBox="0 0 820 470" style={styles.svg}>
      <defs><marker id="arrow-encap" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto"><path d="M0,0 L12,6 L0,12 Z" fill={theme.accent}/></marker></defs>
      <rect x="275" y="58" width="292" height="330" rx="30" fill="#0f172a" stroke={phase === 0 ? theme.accent : theme.line} strokeWidth={phase === 0 ? 6 : 3} strokeDasharray="14 10" />
      <SvgText text={className} x={315} y={105} maxWidth={212} size={24} color={theme.text} weight="850" lines={1} center />
      <Box x={326} y={146} w={190} h={66} title={field} active={phase === 1} tone="amber" />
      <Box x={326} y={252} w={190} h={66} title={method} active={phase === 2} tone="blue" />
      <Box x={45} y={168} w={160} h={68} title={blocked} active={phase === 3} tone="amber" />
      <Box x={45} y={280} w={160} h={68} title={valid} active={phase === 2} tone="blue" />
      <line x1="205" y1="202" x2="326" y2="178" stroke={theme.red} strokeWidth="6" strokeLinecap="round" />
      <line x1="235" y1="168" x2="296" y2="218" stroke={theme.red} strokeWidth="8" strokeLinecap="round" opacity="0.92" />
      <line x1="296" y1="168" x2="235" y2="218" stroke={theme.red} strokeWidth="8" strokeLinecap="round" opacity="0.92" />
      <ArrowLine x1={205} y1={314} x2={326} y2={286} active={phase === 2} markerId="arrow-encap" />
      <Box x={618} y={206} w={156} h={76} title={state} active={phase === 2} tone="green" />
      <ArrowLine x1={516} y1={286} x2={618} y2={244} active={phase === 2} markerId="arrow-encap" />
      <OperationStrip operations={ops} activeIndex={Math.min(phase, ops.length - 1)} y={410} />
    </svg>
  );
};

const ClassObjectVisual = ({ frame, scene, slide }) => {
  const data = getVisualData(scene, slide);
  const nodes = compactNodeLabels(data.nodes);
  const details = data.details || {};
  const className = safeLabel(firstDetail(details, ['className', 'class'], pickLabel(nodes, /class|counter|account|shape|bank|blueprint/i, 'Class blueprint')), 34);
  const fields = listFromDetails(details, ['fields'], nodes.filter(n => /field|state|private|data/i.test(n)).slice(0, 2));
  const methods = listFromDetails(details, ['methods'], nodes.filter(n => /method|behavior|public|\(\)|api/i.test(n)).slice(0, 2));
  const classSub = [...fields.slice(0, 1), ...methods.slice(0, 1)].join(' | ') || 'fields | methods';
  const instances = listFromDetails(details, ['instances', 'objects'], nodes.filter(n => /object|instance|alice|bob|counter|account/i.test(n)).slice(0, 3));
  const objectLabels = (instances.length ? instances : ['object instance 1', 'object instance 2', 'object instance 3']).slice(0, 3);
  const ops = operationLabels(data, ['define blueprint', 'create instances', 'separate state']);
  const phase = activePhase(frame, 4);
  return (
    <svg viewBox="0 0 820 470" style={styles.svg}>
      <defs><marker id="arrow-classobj" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto"><path d="M0,0 L12,6 L0,12 Z" fill={theme.accent}/></marker></defs>
      <ClassNode x={60} y={110} w={240} h={184} title={className} sub={classSub} active={phase === 0} />
      {objectLabels.map((label, i) => (
        <Box key={label + i} x={378} y={64 + i * 118} w={190} h={78} title={label} active={phase === i + 1} tone="green" />
      ))}
      <AnimatedArrow x1={300} y1={170} x2={378} y2={103} progress={phase >= 1 ? 1 : 0.35} label="instantiates" markerId="arrow-classobj" color={theme.accent} />
      <AnimatedArrow x1={300} y1={205} x2={378} y2={221} progress={phase >= 2 ? 1 : 0.35} label="same blueprint" markerId="arrow-classobj" color={theme.accent} />
      <AnimatedArrow x1={300} y1={240} x2={378} y2={339} progress={phase >= 3 ? 1 : 0.35} label="own state" markerId="arrow-classobj" color={theme.accent} />
      <Box x={620} y={142} w={154} h={70} title={methods[0] || 'shared behavior'} active={phase === 0} tone="blue" />
      <Box x={620} y={268} w={154} h={70} title={fields[0] || 'separate state'} active={phase === 3} tone="amber" />
      <OperationStrip operations={ops} activeIndex={Math.min(phase, ops.length - 1)} y={412} />
    </svg>
  );
};

const PolymorphismVisual = ({ frame, scene, slide }) => <PolymorphismDispatch frame={frame} scene={scene} slide={slide} />;

const PolymorphismDispatch = ({ frame, scene, slide }) => {
  const data = getVisualData(scene, slide);
  const nodes = compactNodeLabels(data.nodes);
  const details = data.details || {};
  const base = safeLabel(firstDetail(details, ['baseClass', 'interface', 'referenceType'], pickLabel(nodes, /interface|base|shape|reference|parent/i, 'Base reference')), 30);
  const implementations = listFromDetails(details, ['implementations', 'classes', 'dispatchTargets'], nodes.filter(n => /object|circle|rectangle|impl|class|target|area|draw/i.test(n)).slice(0, 2));
  const targets = (implementations.length ? implementations : ['Implementation A', 'Implementation B']).slice(0, 2);
  const methodCall = safeLabel(firstDetail(details, ['methodCall', 'call', 'message'], pickLabel(nodes, /\(\)|method|call|area|draw|speak/i, 'same method call()')), 30);
  const ops = operationLabels(data, ['same call', 'runtime object selected', 'dispatch target']);
  const phase = Math.floor((frame % 120) / 40);
  const t = interpolate(frame % 40, [0, 28, 40], [0, 1, 1], { extrapolateRight: 'clamp' });
  return (
    <svg viewBox="0 0 820 470" style={styles.svg}>
      <defs>
        <marker id="arrow-remotion" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto">
          <path d="M0,0 L12,6 L0,12 Z" fill={theme.red} />
        </marker>
      </defs>
      <ClassNode x={42} y={168} w={172} h={96} title={base} sub="reference type" active={phase === 0} />
      <ClassNode x={318} y={70} w={190} h={96} title={targets[0]} sub="runtime object" active={phase === 1} tone="green" />
      <ClassNode x={318} y={298} w={210} h={96} title={targets[1]} sub="alternate object" active={phase === 2} tone="green" />
      <MethodNode x={620} y={72} title={`${safeLabel(targets[0], 16)}.${methodCall}`} active={phase === 1} />
      <MethodNode x={608} y={300} title={`${safeLabel(targets[1], 16)}.${methodCall}`} active={phase === 2} />
      <AnimatedArrow x1={214} y1={216} x2={318} y2={118} progress={phase === 0 ? t : 1} label="points to object" />
      <AnimatedArrow x1={508} y1={118} x2={620} y2={118} progress={phase === 1 ? t : phase > 1 ? 1 : 0.25} label="dispatch" />
      <AnimatedArrow x1={214} y1={216} x2={318} y2={346} progress={phase === 2 ? t : 0.35} label="same call" />
      <AnimatedArrow x1={528} y1={346} x2={608} y2={346} progress={phase === 2 ? t : 0.25} label="new target" />
      <OperationStrip operations={ops} activeIndex={Math.min(phase, ops.length - 1)} y={412} />
    </svg>
  );
};

const InheritanceVisual = ({ frame, scene, slide }) => {
  const data = getVisualData(scene, slide);
  const nodes = compactNodeLabels(data.nodes);
  const details = data.details || {};
  const parent = safeLabel(firstDetail(details, ['parentClass', 'superclass', 'baseClass'], pickLabel(nodes, /parent|super|base|shape|class/i, 'Parent class')), 28);
  const children = listFromDetails(details, ['childClasses', 'subclasses', 'children'], nodes.filter(n => /child|sub|circle|rectangle|extends|class/i.test(n) && n !== parent).slice(0, 3));
  const childLabels = (children.length ? children : ['Child class A', 'Child class B']).slice(0, 3);
  const inherited = safeLabel(firstDetail(details, ['inheritedMethod', 'method'], pickLabel(nodes, /method|area|draw|behavior|\(\)/i, '+ inheritedMethod()')), 34);
  const ops = operationLabels(data, ['parent contract', 'subclass extends', 'override behavior']);
  const phase = activePhase(frame, childLabels.length + 1);
  return (
    <svg viewBox="0 0 820 470" style={styles.svg}>
      <defs><marker id="arrow-inherit" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto"><path d="M0,0 L12,6 L0,12 Z" fill={theme.accent}/></marker></defs>
      <ClassNode x={315} y={35} w={190} h={116} title={parent} sub={inherited} active={phase === 0} />
      {childLabels.map((child, i) => {
        const x = childLabels.length === 3 ? [80, 315, 550][i] : [138, 490][i] || 315;
        const y = 274;
        const parentAnchorX = 410;
        return (
          <g key={child + i}>
            <ClassNode x={x} y={y} w={190} h={116} title={child} sub="extends parent" active={phase === i + 1} tone="green" />
            <line x1={x + 95} y1={y} x2={parentAnchorX} y2="151" stroke={theme.accent} strokeWidth="6" markerEnd="url(#arrow-inherit)" opacity="0.95"/>
          </g>
        );
      })}
      <OperationStrip operations={ops} activeIndex={Math.min(phase, ops.length - 1)} y={412} />
    </svg>
  );
};

const LinkedListVisual = ({ frame, scene, slide }) => {
  const data = getVisualData(scene, slide);
  const labels = compactNodeLabels(data.nodes);
  const details = data.details || {};
  const values = listFromDetails(details, ['values', 'nodes'], filteredNodeLabels(labels, /\b(head|next|null|pointer|linked list)\b/i, ['10', '20', '30'])).slice(0, 3);
  const headLabel = pickLabel(labels, /head/i, 'head');
  const nextLabel = pickLabel(labels, /next/i, 'next');
  const tailLabel = pickLabel(labels, /null/i, 'null');
  const ops = operationLabels(data, ['head points to first node', 'follow next pointer', 'stop at null']);
  const phase = activePhase(frame, values.length + 1);
  return (
    <svg viewBox="0 0 820 470" style={styles.svg}>
      <defs><marker id="arrow-list" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto"><path d="M0,0 L12,6 L0,12 Z" fill={theme.red}/></marker></defs>
      <Box x={40} y={200} w={105} h={66} title={headLabel} active={phase === 0} tone="amber" />
      {values.map((value, i) => <ListNode key={value + i} x={205 + i * 165} y={170} value={value} nextLabel={nextLabel} active={phase === i + 1} />)}
      <ArrowLine x1={145} y1={233} x2={205} y2={213} active={phase === 0} />
      {values.slice(0, -1).map((_, i) => <ArrowLine key={`a-${i}`} x1={335 + i * 165} y1={213} x2={370 + i * 165} y2={213} active={phase === i + 1} />)}
      <ArrowLine x1={205 + values.length * 165 - 35} y1={213} x2={782} y2={213} active={phase === values.length} />
      <text x="790" y="220" fill={theme.text} fontSize="21" fontWeight="700">{tailLabel}</text>
      <OperationStrip operations={ops} activeIndex={Math.min(phase, ops.length - 1)} y={410} />
    </svg>
  );
};

const HashTableVisual = ({ frame, scene, slide }) => {
  const phase = activePhase(frame, 5);
  const data = getVisualData(scene, slide);
  const nodes = compactNodeLabels(data.nodes || slide.visual_nodes || []);
  const key = pickLabel(nodes, /key/i, 'key "cat"');
  const hash = pickLabel(nodes, /hash/i, 'hash(key)');
  const index = pickLabel(nodes, /index|mod/i, 'index = hash mod buckets');
  const bucket = pickLabel(nodes, /bucket/i, 'bucket 2');
  const chain = nodes.filter(n => !/key|hash|index|mod|bucket|table|collision|resize/i.test(n)).slice(0, 3);
  const entries = chain.length ? chain : ['(cat, 41)', '(cot, 19)'];
  const ops = operationLabels(data, ['hash key', 'choose bucket', 'check collision chain']);
  return (
    <svg viewBox="0 0 820 470" style={styles.svg}>
      <defs><marker id="arrow-hash" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto"><path d="M0,0 L12,6 L0,12 Z" fill={theme.accent}/></marker></defs>
      <HashStep x={44} y={42} w={170} h={72} label={key} active={phase === 0} tone="blue" />
      <HashStep x={320} y={42} w={184} h={72} label={hash} active={phase === 1} tone="green" />
      <HashStep x={610} y={42} w={166} h={72} label={index} active={phase === 2} tone="amber" />
      <ArrowLine x1={214} y1={78} x2={320} y2={78} active={phase === 1} markerId="arrow-hash" />
      <ArrowLine x1={504} y1={78} x2={610} y2={78} active={phase === 2} markerId="arrow-hash" />

      <text x="74" y="158" fill={theme.muted} fontSize="18" fontWeight="800">bucket array</text>
      {[0, 1, 2, 3, 4].map(i => {
        const active = i === 2;
        const y = 176 + i * 44;
        return (
          <g key={i}>
            <rect x="58" y={y} width="64" height="34" rx="9" fill={active ? '#1e3a8a' : '#111827'} stroke={active ? theme.accent : theme.line} strokeWidth={active ? 4 : 2} />
            <text x="90" y={y + 23} textAnchor="middle" fill={active ? theme.text : theme.muted} fontSize="18" fontWeight="800">{i}</text>
            <rect x="136" y={y} width="174" height="34" rx="9" fill={active ? '#172554' : '#0f172a'} stroke={active ? theme.accent : theme.line} strokeWidth={active ? 4 : 2} />
            <SvgText text={active ? bucket : 'empty'} x={152} y={y + 21} maxWidth={142} size={15} color={active ? theme.text : theme.muted} weight="800" lines={1} />
          </g>
        );
      })}
      <line x1="310" y1="276" x2="410" y2="276" stroke={theme.accent} strokeWidth="6" markerEnd="url(#arrow-hash)" />
      {entries.map((entry, i) => {
        const x = 430 + i * 132;
        return (
          <g key={entry + i}>
            <HashStep x={x} y={242} w={112} h={68} label={entry} active={phase === 3 + Math.min(i, 1)} tone={i === 0 ? 'green' : 'red'} />
            {i < entries.length - 1 ? <line x1={x + 112} y1="276" x2={x + 132} y2="276" stroke={theme.red} strokeWidth="5" markerEnd="url(#arrow-hash)" /> : null}
          </g>
        );
      })}
      <rect x="392" y="338" width="364" height="54" rx="18" fill="#0f172a" stroke={theme.line} strokeWidth="2" />
      <SvgText text="Expected O(1); worst O(n) if collisions cluster" x={416} y={370} maxWidth={318} size={18} color={theme.text} weight="800" lines={1} />
      <OperationStrip operations={ops} activeIndex={Math.min(phase, ops.length - 1)} y={420} />
    </svg>
  );
};

const StackQueueVisual = ({ frame, visualType, scene, slide }) => {
  const data = getVisualData(scene, slide);
  const labels = compactNodeLabels(data.nodes);
  const text = `${visualType} ${scene.sceneTitle || scene.title || slide.title || ''} ${labels.join(' ')}`.toLowerCase();
  const isQueue = /\bqueue|fifo|enqueue|dequeue|front|rear\b/.test(text);
  const phase = activePhase(frame, 5);
  if (isQueue) {
    const items = labels.filter(n => !/queue|fifo|enqueue|dequeue|front|rear|operation/i.test(n)).slice(0, 4);
    const values = items.length ? items : ['A', 'B', 'C', 'D'];
    const ops = operationLabels(data, ['enqueue at rear', 'dequeue at front', 'preserve FIFO order']);
    return (
      <svg viewBox="0 0 820 470" style={styles.svg}>
        <defs><marker id="arrow-queue" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto"><path d="M0,0 L12,6 L0,12 Z" fill={theme.red}/></marker></defs>
        {values.map((item, i) => <Box key={item + i} x={215 + i * 105} y={190} w={86} h={72} title={item} active={phase === i + 1} tone="blue" />)}
        <ArrowLine x1={94} y1={226} x2={215} y2={226} active={phase === 0} markerId="arrow-queue" />
        <ArrowLine x1={215 + values.length * 105} y1={226} x2={750} y2={226} active={phase === values.length} markerId="arrow-queue" />
        <text x="116" y="178" fill={theme.red} fontSize="22" fontWeight="850">dequeue front</text>
        <text x="614" y="178" fill={theme.green} fontSize="22" fontWeight="850">enqueue rear</text>
        <OperationStrip operations={ops} activeIndex={Math.min(phase, ops.length - 1)} y={410} />
      </svg>
    );
  }
  const stackValues = filteredNodeLabels(labels, /\b(stack|push|pop|top|lifo|operation)\b/i, ['bottom', '20', '35', 'top']).slice(0, 5);
  const ops = operationLabels(data, ['push adds to top', 'pop removes top', 'LIFO order']);
  return (
    <svg viewBox="0 0 820 470" style={styles.svg}>
      <defs><marker id="arrow-stack" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto"><path d="M0,0 L12,6 L0,12 Z" fill={theme.red}/></marker></defs>
      <rect x="302" y="76" width="216" height="304" rx="22" fill="#0f172a" stroke={theme.line} strokeWidth="3" />
      {stackValues.map((value, i) => {
        const y = 318 - i * 55;
        return <Box key={value + i} x={330} y={y} w={160} h={45} title={value} active={phase === i} tone={i === stackValues.length - 1 ? 'amber' : 'blue'} />;
      })}
      <ArrowLine x1={158} y1={94} x2={330} y2={154} active={phase === 0} markerId="arrow-stack" />
      <ArrowLine x1={490} y1={154} x2={662} y2={94} active={phase === 1} markerId="arrow-stack" />
      <text x="160" y="72" fill={theme.green} fontSize="23" fontWeight="850">push()</text>
      <text x="654" y="72" fill={theme.red} fontSize="23" fontWeight="850">pop()</text>
      <OperationStrip operations={ops} activeIndex={Math.min(phase, ops.length - 1)} y={420} />
    </svg>
  );
};

const TreeVisual = ({ frame, scene, slide }) => {
  const data = getVisualData(scene, slide);
  const labels = compactNodeLabels(data.nodes).slice(0, 7);
  const details = data.details || {};
  const valuesFromDetails = listFromDetails(details, ['values', 'nodes', 'traversal'], []);
  const values = (valuesFromDetails.length >= 3 ? valuesFromDetails : labels.length >= 3 ? labels : ['50', '30', '70', '20', '40', '60', '80']).slice(0, 7);
  const positions = [[410,54], [260,166], [560,166], [165,300], [350,300], [475,300], [660,300]];
  const phase = activePhase(frame, values.length);
  const ops = operationLabels(data, ['start at root', 'choose child branch', 'visit leaf']);
  return (
    <svg viewBox="0 0 820 470" style={styles.svg}>
      {[[0,1],[0,2],[1,3],[1,4],[2,5],[2,6]].map(([a, b]) => values[b] ? <line key={`${a}-${b}`} x1={positions[a][0]} y1={positions[a][1] + 31} x2={positions[b][0]} y2={positions[b][1] - 31} stroke={theme.line} strokeWidth="5" /> : null)}
      {values.map((value, i) => {
        const [x, y] = positions[i];
        return <g key={value + i}>
          <circle cx={x} cy={y} r="42" fill={phase === i ? '#1e3a8a' : '#111827'} stroke={phase === i ? theme.accent : theme.green} strokeWidth={phase === i ? 6 : 3} />
          <SvgText text={value} x={x - 34} y={y + 7} maxWidth={68} size={19} color={theme.text} weight="850" lines={1} center />
        </g>;
      })}
      <Box x={42} y={72} w={180} h={72} title="left < parent" active={phase === 1} tone="green" />
      <Box x={598} y={72} w={180} h={72} title="right > parent" active={phase === 2} tone="green" />
      <OperationStrip operations={ops} activeIndex={Math.min(phase, ops.length - 1)} y={420} />
    </svg>
  );
};

const BigOVisual = ({ frame, scene, slide }) => {
  const data = getVisualData(scene, slide);
  const labels = [...listFromDetails(data.details || {}, ['complexities', 'labels'], []), ...compactNodeLabels(data.nodes)]
    .filter(label => /O\(|constant|linear|quadratic|log|growth/i.test(label))
    .slice(0, 4);
  const complexityLabels = labels.length ? labels : ['O(1)', 'O(n)', 'O(n log n)', 'O(n^2)'];
  const phase = activePhase(frame, complexityLabels.length);
  const glow = (i) => phase === i ? 1 : 0.45;
  const curveData = [
    { d: 'M110 338 C250 335 500 330 720 324', color: theme.green, x: 640, y: 315 },
    { d: 'M110 356 C235 318 465 236 720 128', color: theme.accent, x: 648, y: 132 },
    { d: 'M110 374 C250 364 450 278 720 82', color: theme.amber, x: 555, y: 218 },
    { d: 'M110 384 C280 368 520 265 720 42', color: theme.red, x: 620, y: 58 },
  ];
  const ops = operationLabels(data, ['compare growth rates', 'increase input size', 'identify dominant cost']);
  return (
    <svg viewBox="0 0 820 470" style={styles.svg}>
      <line x1="90" y1="390" x2="740" y2="390" stroke={theme.line} strokeWidth="4" />
      <line x1="90" y1="390" x2="90" y2="70" stroke={theme.line} strokeWidth="4" />
      {complexityLabels.map((label, i) => {
        const curve = curveData[i] || curveData[curveData.length - 1];
        return <g key={label + i}>
          <path d={curve.d} fill="none" stroke={curve.color} strokeWidth="8" opacity={glow(i)} />
          <SvgText text={label} x={curve.x} y={curve.y} maxWidth={130} size={24} color={curve.color} weight="850" center />
        </g>;
      })}
      <SvgText text="input size" x={610} y={418} maxWidth={130} size={18} color={theme.muted} weight="800" center />
      <SvgText text="cost" x={38} y={86} maxWidth={90} size={18} color={theme.muted} weight="800" center />
      <OperationStrip operations={ops} activeIndex={Math.min(phase, ops.length - 1)} y={420} />
    </svg>
  );
};

const CodeWalkthroughVisual = ({ frame, scene, slide }) => {
  const code = scene.code || slide.code_focus || { content: scene.codeSnippet || slide.example_code || '' };
  const data = getVisualData(scene, slide);
  const normalized = normalizeCodeWindow({
    ...code,
    content: code.content || scene.codeSnippet || slide.example_code || 'Code appears here',
  }, { maxVisibleLines: 10, contextBefore: 2 });
  const lines = normalized.displayLines;
  const highlight = new Set((normalized.highlightLines || []).map(Number));
  const activeHighlights = normalized.highlightLines && normalized.highlightLines.length ? normalized.highlightLines : [normalized.visibleStartLine];
  const phaseLine = activeHighlights[Math.floor(frame / 38) % activeHighlights.length] || normalized.visibleStartLine;
  const explanation = safeLabel(
    (code.walkthrough && code.walkthrough[0] && code.walkthrough[0].text) ||
    code.explanation ||
    code.narrationFocus ||
    data.caption ||
    operationLabels(data, ['read highlighted line'])[0],
    220
  );
  return (
    <div style={styles.largeCodePanel}>
      <div style={styles.codeHeaderRow}>
        <div style={styles.cardLabel}>Code walkthrough</div>
        <div style={styles.lineWindowLabel}>Showing lines {normalized.visibleStartLine}-{normalized.visibleEndLine}</div>
      </div>
      {lines.map((line) => {
        const n = line.number;
        const active = highlight.has(n) || n === phaseLine;
        return (
          <div key={n} style={{ ...styles.largeCodeLine, background: active ? 'rgba(96,165,250,0.20)' : 'transparent', borderColor: active ? theme.accent : 'transparent' }}>
            <span style={styles.largeCodeNo}>{n}</span>
            <span style={styles.largeCodeText}>{safeLabel(line.text, 96)}</span>
          </div>
        );
      })}
      <div style={styles.codeFocusHint}>
        <span style={styles.focusDot} />
        {safeLabel(code.pointerLabel || code.narrationFocus || code.lineRange || 'highlighted code', 58)}
      </div>
      <div style={styles.codeExplanation}>{explanation}</div>
    </div>
  );
};

const ProcessFlowVisual = ({ frame, scene, slide }) => {
  const data = getVisualData(scene, slide);
  const labels = compactNodeLabels(data.nodes).slice(0, 5);
  const steps = listFromDetails(data.details || {}, ['steps'], labels.length ? labels : compactLabels(scene, slide).slice(0, 5)).slice(0, 5);
  const phase = activePhase(frame, steps.length || 1);
  const ops = operationLabels(data, steps);
  return (
    <svg viewBox="0 0 820 470" style={styles.svg}>
      <defs><marker id="arrow-flow" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto"><path d="M0,0 L12,6 L0,12 Z" fill={theme.accent}/></marker></defs>
      {(steps.length ? steps : ['Input', 'Rule', 'State change', 'Output']).map((step, i, arr) => {
        const x = 62 + i * 150;
        return <g key={step + i}>
          <Box x={x} y={190} w={128} h={78} title={step} active={phase === i} tone={i % 2 ? 'green' : 'blue'} />
          {i < arr.length - 1 ? <ArrowLine x1={x + 128} y1={229} x2={x + 150} y2={229} active={phase >= i} markerId="arrow-flow" /> : null}
        </g>;
      })}
      <OperationStrip operations={ops} activeIndex={Math.min(phase, ops.length - 1)} y={410} />
    </svg>
  );
};

const ComparisonVisual = ({ frame, scene, slide }) => {
  const labels = compactLabels(scene, slide);
  const data = getVisualData(scene, slide);
  const details = data.details || {};
  const left = safeLabel(firstDetail(details, ['before', 'mistake', 'badExample'], labels[0] || 'Before / mistake'), 44);
  const right = safeLabel(firstDetail(details, ['after', 'correction', 'goodExample'], labels[1] || 'After / correction'), 44);
  const ops = operationLabels(data, ['spot the problem', 'apply correction', 'compare result']);
  const phase = activePhase(frame, 2);
  return (
    <svg viewBox="0 0 820 470" style={styles.svg}>
      <defs><marker id="arrow-compare" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto"><path d="M0,0 L12,6 L0,12 Z" fill={theme.accent}/></marker></defs>
      <Box x={92} y={112} w={270} h={190} title={left} active={phase === 0} tone="amber" />
      <Box x={458} y={112} w={270} h={190} title={right} active={phase === 1} tone="green" />
      <AnimatedArrow x1={362} y1={207} x2={458} y2={207} progress={1} label="corrected by" markerId="arrow-compare" color={theme.accent} />
      <text x="228" y="346" textAnchor="middle" fill={theme.red} fontSize="22" fontWeight="850">problem</text>
      <text x="593" y="346" textAnchor="middle" fill={theme.green} fontSize="22" fontWeight="850">safe version</text>
      <OperationStrip operations={ops} activeIndex={Math.min(phase, ops.length - 1)} y={410} />
    </svg>
  );
};

const ConceptMapVisual = ({ frame, scene }) => {
  const data = getVisualData(scene, {});
  const nodes = (data.nodes || []).map(n => typeof n === 'string' ? n : n.label || n.id).filter(Boolean);
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

const CardsVisual = ({ frame, scene, slide }) => {
  const data = getVisualData(scene, slide);
  const nodes = asList(data.nodes).map(n => typeof n === 'string' ? n : n.label || n.id).filter(Boolean);
  const labels = nodes.length ? nodes.slice(0, 6) : ['Source concept', 'Supporting detail', 'Review question'];
  const phase = activePhase(frame, labels.length);
  return (
    <svg viewBox="0 0 820 470" style={styles.svg}>
      {labels.map((label, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        return <ClassNode key={label + i} x={64 + col * 238} y={92 + row * 148} w={206} h={110} title={label} sub={i === phase ? 'focus' : 'source card'} active={i === phase} tone={i % 2 ? 'green' : 'blue'} />;
      })}
    </svg>
  );
};

const TableVisual = ({ frame, scene, slide }) => {
  const data = getVisualData(scene, slide);
  const rows = asList(data.operations).length ? asList(data.operations).slice(0, 5) : asList(data.nodes).slice(0, 5);
  const labels = rows.length ? rows : ['Source point: supporting detail'];
  const phase = activePhase(frame, labels.length);
  return (
    <svg viewBox="0 0 820 470" style={styles.svg}>
      {labels.map((row, i) => {
        const parts = String(row || '').split(':');
        const y = 66 + i * 76;
        return <g key={row + i}>
          <rect x="72" y={y} width="676" height="56" rx="16" fill={i === phase ? '#1e293b' : '#111827'} stroke={i === phase ? theme.accent : theme.line} strokeWidth={i === phase ? 4 : 2}/>
          <SvgText text={parts[0] || row} x={96} y={y + 34} maxWidth={205} size={20} color={theme.text} weight="850" lines={1} />
          <SvgText text={parts.slice(1).join(':') || 'source detail'} x={318} y={y + 34} maxWidth={392} size={18} color={theme.muted} lines={1} />
        </g>;
      })}
    </svg>
  );
};

const SourceReferenceVisual = ({ frame, scene, slide }) => {
  const data = getVisualData(scene, slide);
  const nodes = asList(data.nodes).map(n => typeof n === 'string' ? n : n.label || n.id).filter(Boolean).slice(0, 4);
  const phase = activePhase(frame, Math.max(1, nodes.length));
  return (
    <svg viewBox="0 0 820 470" style={styles.svg}>
      <ClassNode x={170} y={54} w={480} h={104} title={data.caption || scene.sceneTitle || slide.title || 'Source reference'} sub="uploaded material" active tone="blue" />
      {(nodes.length ? nodes : ['Source heading', 'Evidence', 'Review cue']).map((label, i) => (
        <ClassNode key={label + i} x={190} y={188 + i * 76} w={440} h={58} title={label} sub={i === phase ? 'focus' : 'source-backed'} active={i === phase} tone={i % 2 ? 'green' : 'amber'} />
      ))}
    </svg>
  );
};

const NoVisual = ({ scene, slide }) => (
  <div style={{ height: '100%', boxSizing: 'border-box', border: `1px solid ${theme.line}`, borderRadius: 18, background: '#111827', padding: 42, display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}>
    <div style={styles.cardLabel}>Source-led explanation</div>
    <div style={{ color: theme.text, fontSize: 34, lineHeight: 1.15, fontWeight: 850, marginBottom: 18 }}>{scene.sceneTitle || scene.title || slide.title || 'Source focus'}</div>
    <p style={{ color: theme.muted, fontSize: 22, lineHeight: 1.45, margin: 0 }}>{scene.learningPoint || scene.studentFacingGoal || 'No diagram is needed for this scene; follow the source-backed narration.'}</p>
  </div>
);

const UnsupportedVisual = ({ resolution, scene, slide }) => (
  <div style={styles.unsupported}>
    <div style={styles.cardLabel}>Unsupported visual type</div>
    <div style={styles.unsupportedType}>{String(resolution && resolution.input || scene.visualType || scene.visualTemplate || slide.visual_type || 'missing')}</div>
    <p style={styles.unsupportedText}>This scene should be regenerated with a supported concrete CS visual instead of falling back to a generic concept board.</p>
  </div>
);

const CodePanel = ({ code, frame }) => {
  const normalized = normalizeCodeWindow(code || {}, { maxVisibleLines: 9, contextBefore: 2 });
  const lines = normalized.displayLines;
  const highlight = new Set((normalized.highlightLines || []).map(Number));
  const activeHighlights = normalized.highlightLines && normalized.highlightLines.length ? normalized.highlightLines : [normalized.visibleStartLine];
  const phaseLine = activeHighlights[Math.floor(frame / 45) % activeHighlights.length] || normalized.visibleStartLine;
  return (
    <div style={styles.codePanel}>
      <div style={styles.codeHeaderRow}>
        <div style={styles.cardLabel}>Line focus</div>
        <div style={styles.lineWindowLabel}>{normalized.visibleStartLine}-{normalized.visibleEndLine}</div>
      </div>
      {lines.map((line) => {
        const n = line.number;
        const active = highlight.has(n) || n === phaseLine;
        return (
          <div key={n} style={{ ...styles.codeLine, background: active ? 'rgba(96,165,250,0.18)' : 'transparent' }}>
            <span style={styles.codeNo}>{n}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'pre' }}>{safeLabel(line.text, 64)}</span>
          </div>
        );
      })}
    </div>
  );
};

const ClassNode = ({ x, y, w, h, title, sub, active, tone = 'blue' }) => {
  const color = tone === 'green' ? theme.green : tone === 'amber' ? theme.amber : theme.accent;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="22" fill={active ? '#1e293b' : '#111827'} stroke={color} strokeWidth={active ? 5 : 2.5}/>
      <SvgText text={title} x={x + 16} y={y + 38} maxWidth={w - 32} size={23} color={theme.text} weight="800" lines={1} center />
      <line x1={x + 18} y1={y + 56} x2={x + w - 18} y2={y + 56} stroke={color} strokeWidth="2" opacity="0.7" />
      <SvgText text={sub} x={x + 16} y={y + 82} maxWidth={w - 32} size={17} color={theme.muted} lines={1} center />
    </g>
  );
};

const MethodNode = ({ x, y, title, active }) => (
  <g>
    <rect x={x} y={y} width="160" height="92" rx="20" fill={active ? '#3f1720' : '#171923'} stroke={theme.red} strokeWidth={active ? 5 : 2.5} />
    <SvgText text={title} x={x + 12} y={y + 54} maxWidth={136} size={19} color={theme.text} weight="800" lines={1} center />
  </g>
);

const Box = ({ x, y, w, h, title, active, tone = 'blue' }) => {
  const color = tone === 'green' ? theme.green : tone === 'amber' ? theme.amber : tone === 'red' ? theme.red : theme.accent;
  const fill = active
    ? tone === 'green' ? '#143326' : tone === 'red' ? '#3f1720' : tone === 'amber' ? '#2b220f' : '#172554'
    : '#111827';
  return <g><rect x={x} y={y} width={w} height={h} rx="16" fill={fill} stroke={color} strokeWidth={active ? 5 : 2.5}/><SvgText text={title} x={x + 10} y={y + 40} maxWidth={w - 20} size={21} color={theme.text} weight="800" lines={2} center /></g>;
};

const ListNode = ({ x, y, value, nextLabel = 'next', active }) => (
  <g>
    <rect x={x} y={y} width="130" height="88" rx="18" fill={active ? '#143326' : '#111827'} stroke={theme.green} strokeWidth={active ? 5 : 2.5}/>
    <line x1={x + 72} y1={y} x2={x + 72} y2={y + 88} stroke={theme.green} strokeWidth="2.5"/>
    <SvgText text={value} x={x + 8} y={y + 54} maxWidth={56} size={22} color={theme.text} weight="850" lines={1} center />
    <SvgText text={nextLabel} x={x + 78} y={y + 53} maxWidth={46} size={15} color={theme.muted} weight="750" lines={1} center />
  </g>
);

const AnimatedArrow = ({ x1, y1, x2, y2, progress, label, markerId = 'arrow-remotion', color = theme.red }) => {
  const x = x1 + (x2 - x1) * progress;
  const y = y1 + (y2 - y1) * progress;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x} y2={y} stroke={color} strokeWidth="6" strokeLinecap="round" markerEnd={`url(#${markerId})`} />
      <SvgText text={label} x={(x1 + x2) / 2 - 66} y={(y1 + y2) / 2 - 14} maxWidth={132} size={17} color={color} weight="800" lines={1} center />
    </g>
  );
};

const OperationStrip = ({ operations = [], activeIndex = 0, y = 414 }) => {
  const labels = (operations.length ? operations : ['trace the visual'])
    .map(item => safeLabel(item, 34))
    .filter(Boolean)
    .slice(0, 4);
  const width = Math.min(700, labels.length * 170);
  const start = 410 - width / 2;
  return (
    <g>
      {labels.map((label, i) => (
        <g key={label + i}>
          <rect
            x={start + i * 170}
            y={y}
            width="156"
            height="38"
            rx="13"
            fill={i === activeIndex ? '#172554' : '#0f172a'}
            stroke={i === activeIndex ? theme.accent : theme.line}
            strokeWidth={i === activeIndex ? 3 : 1.5}
          />
          <SvgText text={label} x={start + i * 170 + 10} y={y + 25} maxWidth={136} size={15} color={theme.text} weight="800" lines={1} center />
        </g>
      ))}
    </g>
  );
};

const HashStep = ({ x, y, w, h, label, active, tone = 'blue' }) => {
  const color = tone === 'green' ? theme.green : tone === 'amber' ? theme.amber : tone === 'red' ? theme.red : theme.accent;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="18" fill={active ? '#1e293b' : '#111827'} stroke={color} strokeWidth={active ? 5 : 2.5} />
      <SvgText text={label} x={x + 12} y={y + h / 2 + 7} maxWidth={w - 24} size={18} color={theme.text} weight="800" lines={2} center />
    </g>
  );
};

const ArrowLine = ({ x1, y1, x2, y2, active, markerId = 'arrow-list' }) => (
  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={active ? theme.red : theme.line} strokeWidth={active ? 6 : 4} strokeLinecap="round" markerEnd={`url(#${markerId})`} />
);

function compactLabels(scene, slide) {
  const data = getVisualData(scene, slide);
  const raw = [
    ...((data.nodes || []).map(n => typeof n === 'string' ? n : n.label || n.id || n.name || '')),
    ...((scene.onScreenText || [])),
    ...((slide.bullets || [])),
  ].filter(Boolean);
  const out = raw.map(s => safeLabel(s).split(/\s+/).slice(0, 4).join(' '));
  return [...new Set(out)].slice(0, 4);
}

function compactNodeLabels(nodes) {
  return (Array.isArray(nodes) ? nodes : [])
    .map(n => typeof n === 'string' ? n : n && (n.label || n.id || n.name || n.value))
    .filter(Boolean)
    .map(n => safeLabel(n, 42));
}

function pickLabel(labels, pattern, fallback) {
  return labels.find(label => pattern.test(label)) || fallback;
}

function safeLabel(value, max = 46) {
  const text = String(value || '')
    .replace(/\[chunk:\s*\d+\]/gi, '')
    .replace(/\u00e2\u20ac[\u0090\u0091\u0092\u0093\u0094\u201c\u201d]/g, '-')
    .replace(/\u00ce\u00b1/g, 'alpha')
    .replace(/\u00c2\u00b2/g, '^2')
    .replace(/[–—−]/g, '-')
    .replace(/α/g, 'alpha')
    .replace(/²/g, '^2')
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  const slice = text.slice(0, max).replace(/\s+\S*$/, '').trim();
  return (slice || text.slice(0, max)).replace(/[,;:-]+$/g, '');
}

function wrapSvgText(text, maxChars, maxLines) {
  const words = safeLabel(text, 120).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (test.length > maxChars && line) {
      lines.push(line);
      line = word;
      if (lines.length >= maxLines) break;
    } else {
      line = test;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines.length ? lines : [''];
}

const SvgText = ({ text, x, y, maxWidth, size = 18, color = theme.text, weight = '700', lines = 2, center = false }) => {
  const maxChars = Math.max(5, Math.floor(Number(maxWidth || 120) / Math.max(7, size * 0.56)));
  const wrapped = wrapSvgText(text, maxChars, lines);
  const startY = y - ((wrapped.length - 1) * size * 0.55);
  return (
    <text x={center ? x + maxWidth / 2 : x} y={startY} textAnchor={center ? 'middle' : 'start'} fill={color} fontSize={size} fontWeight={weight}>
      {wrapped.map((line, i) => <tspan key={i} x={center ? x + maxWidth / 2 : x} dy={i === 0 ? 0 : size + 5}>{line}</tspan>)}
    </text>
  );
};

function activePhase(frame, count) {
  return Math.floor((frame % 150) / Math.max(1, Math.floor(150 / Math.max(1, count)))) % Math.max(1, count);
}

function pulseFor(frame, i) {
  return 0.72 + Math.sin((frame + i * 18) / 12) * 0.18;
}

function readable(value) {
  return String(value || '').replace(/_/g, ' ');
}

const VISUAL_COMPONENTS = {
  encapsulation_boundary: EncapsulationBoundaryVisual,
  class_object: ClassObjectVisual,
  inheritance_uml: InheritanceVisual,
  polymorphism_dispatch: PolymorphismVisual,
  linked_list_operation: LinkedListVisual,
  stack_operation: StackQueueVisual,
  queue_operation: StackQueueVisual,
  hash_table_operation: HashTableVisual,
  tree_visual: TreeVisual,
  big_o_growth: BigOVisual,
  code_walkthrough: CodeWalkthroughVisual,
  process_flow: ProcessFlowVisual,
  comparison_contrast: ComparisonVisual,
  concept_cards: CardsVisual,
  classification_table: TableVisual,
  comparison_table: TableVisual,
  source_page_reference: SourceReferenceVisual,
  source_slide_reference: SourceReferenceVisual,
  no_visual: NoVisual,
  learning_objectives: ConceptMapVisual,
  summary_path: ConceptMapVisual,
  concept_map: ConceptMapVisual,
};

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
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', position: 'relative', zIndex: 2 },
  eyebrow: { color: theme.accent, fontSize: 15, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 },
  title: { margin: 0, fontSize: 42, lineHeight: 1.08, letterSpacing: 0, fontWeight: 850, maxWidth: 720, overflowWrap: 'break-word' },
  sceneType: { padding: '10px 16px', border: `1px solid ${theme.line}`, borderRadius: 999, color: theme.muted, background: 'rgba(15,23,42,0.68)', fontSize: 18, textTransform: 'capitalize' },
  main: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 430px', gap: 24, marginTop: 30, position: 'relative', zIndex: 2 },
  stage: { height: 505, border: `1px solid ${theme.line}`, borderRadius: 18, background: 'rgba(15,23,42,0.88)', boxShadow: '0 24px 64px rgba(0,0,0,0.28)', padding: 16 },
  side: { display: 'flex', flexDirection: 'column', gap: 16 },
  goalCard: { border: `1px solid ${theme.line}`, borderRadius: 22, background: 'rgba(15,23,42,0.78)', padding: 18 },
  cardLabel: { color: theme.accent, fontSize: 13, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 },
  goalText: { margin: 0, color: theme.text, fontSize: 18, lineHeight: 1.42, fontWeight: 650 },
  focusList: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  focusChip: { display: 'inline-flex', alignItems: 'center', gap: 8, border: `1px solid ${theme.line}`, borderRadius: 999, background: 'rgba(15,23,42,0.82)', padding: '9px 13px', color: theme.text, fontSize: 15, fontWeight: 760, maxWidth: 404, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  focusDot: { width: 8, height: 8, borderRadius: 99, background: theme.accent, boxShadow: `0 0 18px ${theme.accent}` },
  codePanel: { border: `1px solid ${theme.line}`, borderRadius: 22, background: '#020617', padding: 14, maxHeight: 300, overflow: 'hidden' },
  codeHeaderRow: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  lineWindowLabel: { color: theme.muted, fontSize: 13, fontWeight: 800, marginBottom: 10 },
  codeLine: { display: 'grid', gridTemplateColumns: '32px 1fr', gap: 8, color: '#dbeafe', fontFamily: 'JetBrains Mono, Consolas, monospace', fontSize: 14, lineHeight: 1.5, padding: '3px 6px', borderRadius: 8 },
  codeNo: { color: theme.muted, textAlign: 'right' },
  largeCodePanel: { width: '100%', height: '100%', boxSizing: 'border-box', border: `1px solid ${theme.line}`, borderRadius: 18, background: '#020617', padding: 22, overflow: 'hidden', position: 'relative' },
  largeCodeLine: { display: 'grid', gridTemplateColumns: '48px 1fr', gap: 12, color: '#dbeafe', fontFamily: 'JetBrains Mono, Consolas, monospace', fontSize: 18, lineHeight: 1.42, padding: '4px 10px', borderRadius: 10, border: '1px solid transparent' },
  largeCodeNo: { color: theme.muted, textAlign: 'right' },
  largeCodeText: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'pre' },
  codeFocusHint: { position: 'absolute', right: 24, bottom: 118, display: 'inline-flex', alignItems: 'center', gap: 8, maxWidth: 310, border: `1px solid ${theme.accent}`, borderRadius: 999, background: 'rgba(15,23,42,0.94)', color: theme.text, fontSize: 14, lineHeight: 1.25, fontWeight: 800, padding: '8px 12px', boxShadow: `0 0 24px rgba(96,165,250,0.28)` },
  codeExplanation: { position: 'absolute', left: 22, right: 22, bottom: 22, minHeight: 74, borderTop: `1px solid ${theme.line}`, paddingTop: 12, color: theme.text, fontSize: 18, lineHeight: 1.32, fontWeight: 750, background: '#020617' },
  unsupported: { height: '100%', boxSizing: 'border-box', border: `2px solid ${theme.red}`, borderRadius: 18, background: 'rgba(63,23,32,0.30)', padding: 32, display: 'flex', flexDirection: 'column', justifyContent: 'center' },
  unsupportedType: { color: theme.red, fontSize: 32, lineHeight: 1.1, fontWeight: 850, marginBottom: 14 },
  unsupportedText: { color: theme.text, fontSize: 22, lineHeight: 1.45, margin: 0, maxWidth: 660 },
  svg: { width: '100%', height: '100%', display: 'block' },
};
