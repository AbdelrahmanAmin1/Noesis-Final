const TopicVisual = ({ template = 'learning_map', data = {}, code = null, compact = false }) => {
  const nodes = (data.nodes || []).map(n => typeof n === 'string' ? n : (n.label || n.name || n.id || '')).filter(Boolean);
  const t = String(template || data.type || '').toLowerCase();
  if (t.includes('polymorphism')) return <DispatchVisual compact={compact} />;
  if (t.includes('inheritance') || t.includes('uml') || t.includes('class')) return <UmlVisual nodes={nodes} compact={compact} />;
  if (t.includes('linked')) return <LinkedListVisual compact={compact} />;
  if (t.includes('stack')) return <StackVisual compact={compact} />;
  if (t.includes('queue')) return <QueueVisual compact={compact} />;
  if (t.includes('bst') || t.includes('tree')) return <TreeVisual compact={compact} />;
  if (t.includes('big')) return <BigOVisual compact={compact} />;
  if (t.includes('code') || code) return <CodeVisual code={code} compact={compact} />;
  return <MiniMindmap nodes={nodes.length ? nodes : ['Start', 'Prerequisites', 'Core idea', 'Example', 'Practice']} compact={compact} />;
};

const LearningMap = ({ map, onNode, compact = false }) => {
  const m = map || {};
  const nodes = m.nodes || [];
  const start = m.startHere || (nodes[0] && nodes[0].label) || 'Start here';
  return (
    <section style={{ ...lm.shell, ...(compact ? lm.compactShell : {}) }}>
      <div style={lm.head}>
        <div>
          <div style={lm.eyebrow}>Learning map</div>
          <h2 style={lm.title}>{m.rootTopic || 'Your path'}</h2>
        </div>
        <div style={lm.start}>Start here: <b>{start}</b></div>
      </div>
      <div style={lm.path}>
        {(m.recommendedPath || []).slice(0, 7).map((p, i) => <span key={p + i} style={lm.pathChip}>{i + 1}. {p}</span>)}
      </div>
      <div style={{ ...lm.canvas, ...(compact ? lm.compactCanvas : {}) }}>
        <svg viewBox="0 0 920 360" style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}>
          {nodes.slice(0, 10).map((n, i) => {
            const p = mapPos(i);
            const prev = i === 0 ? { x: 460, y: 62 } : mapPos(i - 1);
            return <line key={'l' + i} x1={prev.x} y1={prev.y} x2={p.x} y2={p.y} stroke="var(--line-strong)" strokeWidth="1.4" strokeDasharray="5 7" opacity="0.9"/>;
          })}
        </svg>
        <div style={{ ...lm.root, left: '50%', top: 30 }}>{start}</div>
        {nodes.slice(0, compact ? 5 : 10).map((n, i) => {
          const p = mapPos(i);
          const color = nodeColor(n);
          return (
            <button key={n.id || n.label || i} onClick={() => onNode && onNode(n)} style={{
              ...lm.node,
              left: p.x,
              top: p.y,
              borderColor: color,
              boxShadow: `0 0 0 1px ${color}33, 0 14px 30px #00000022`,
            }}>
              <span style={{ ...lm.dot, background: color }}/>
              <span style={{ fontWeight: 700, color: 'var(--fg-0)' }}>{n.label}</span>
              <small style={lm.reason}>{n.status || n.type}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
};

function mapPos(i) {
  const pts = [
    { x: 150, y: 110 }, { x: 340, y: 170 }, { x: 565, y: 120 }, { x: 760, y: 185 },
    { x: 650, y: 285 }, { x: 420, y: 275 }, { x: 210, y: 260 }, { x: 115, y: 205 },
    { x: 460, y: 78 }, { x: 815, y: 90 },
  ];
  return pts[i % pts.length];
}

function nodeColor(n) {
  if (n.type === 'weak' || n.status === 'weak') return 'var(--err)';
  if (n.status === 'mastered') return 'var(--ok)';
  if (n.type === 'recommended') return 'var(--accent)';
  return 'var(--warn)';
}

const MiniMindmap = ({ nodes, compact }) => (
  <div style={{ ...tv.box, minHeight: compact ? 180 : 260 }}>
    <svg viewBox="0 0 640 260" style={tv.svg}>
      <rect x="260" y="98" width="120" height="64" rx="18" fill="#dbeafe" stroke="#2563eb" strokeWidth="2"/>
      <text x="320" y="136" textAnchor="middle" fontSize="15" fontWeight="700" fill="#0f172a">{nodes[0] || 'Topic'}</text>
      {nodes.slice(1, 7).map((n, i) => {
        const pts = [[70,30],[455,30],[70,180],[455,180],[240,20],[270,200]];
        const p = pts[i];
        return <g key={n + i}>
          <line x1="320" y1="130" x2={p[0] + 58} y2={p[1] + 28} stroke="#94a3b8" strokeWidth="2"/>
          <rect x={p[0]} y={p[1]} width="116" height="56" rx="16" fill={['#dcfce7','#fef3c7','#fce7f3'][i % 3]} stroke="#94a3b8" strokeWidth="1.5"/>
          <text x={p[0] + 58} y={p[1] + 34} textAnchor="middle" fontSize="13" fontWeight="700" fill="#111827">{n}</text>
        </g>;
      })}
    </svg>
  </div>
);

const DispatchVisual = ({ compact }) => (
  <div style={{ ...tv.box, minHeight: compact ? 180 : 260 }}>
    <svg viewBox="0 0 680 270" style={tv.svg}>
      <TextBox x={40} y={92} w={150} h={72} text="Shape s" fill="#dbeafe" stroke="#2563eb"/>
      <TextBox x={265} y={38} w={150} h={72} text="Circle object" fill="#dcfce7" stroke="#16a34a"/>
      <TextBox x={265} y={160} w={170} h={72} text="Rectangle object" fill="#dcfce7" stroke="#16a34a"/>
      <TextBox x={500} y={38} w={135} h={72} text="Circle.area()" fill="#fee2e2" stroke="#ef4444"/>
      <TextBox x={500} y={160} w={155} h={72} text="Rectangle.area()" fill="#fee2e2" stroke="#ef4444"/>
      <Arrow x1={190} y1={128} x2={265} y2={74} label="runtime"/>
      <Arrow x1={415} y1={74} x2={500} y2={74} label="dispatch"/>
      <Arrow x1={190} y1={128} x2={265} y2={196} label="reassign"/>
      <Arrow x1={435} y1={196} x2={500} y2={196} label="dispatch"/>
    </svg>
  </div>
);

const UmlVisual = ({ nodes, compact }) => {
  const parent = nodes.find(n => /shape|parent|super/i.test(n)) || 'Shape';
  return <div style={{ ...tv.box, minHeight: compact ? 180 : 260 }}>
    <svg viewBox="0 0 650 270" style={tv.svg}>
      <ClassBox x={245} y={20} name={parent} rows={['+ area()', '# shared state']}/>
      <ClassBox x={95} y={165} name="Circle" rows={['- radius', '+ area()']}/>
      <ClassBox x={405} y={165} name="Rectangle" rows={['- width', '- height', '+ area()']}/>
      <Arrow x1={205} y1={165} x2={290} y2={115} label="extends"/>
      <Arrow x1={445} y1={165} x2={360} y2={115} label="extends"/>
    </svg>
  </div>;
};

const LinkedListVisual = ({ compact }) => <div style={{ ...tv.box, minHeight: compact ? 160 : 230 }}>
  <svg viewBox="0 0 700 230" style={tv.svg}>
    <TextBox x={24} y={92} w={90} h={48} text="head" fill="#fef3c7" stroke="#f59e0b"/>
    <Node x={160} y={72} value="10"/><Node x={340} y={72} value="20"/><Node x={520} y={72} value="30"/>
    <Arrow x1={114} y1={116} x2={160} y2={116}/><Arrow x1={278} y1={116} x2={340} y2={116}/><Arrow x1={458} y1={116} x2={520} y2={116}/>
    <Arrow x1={638} y1={116} x2={672} y2={116}/><text x="674" y="121" fontSize="15" fontWeight="700" fill="#111827">null</text>
  </svg>
</div>;

const StackVisual = ({ compact }) => <div style={{ ...tv.box, minHeight: compact ? 170 : 250 }}>
  <svg viewBox="0 0 560 260" style={tv.svg}>
    {[0,1,2,3].map((i) => <rect key={i} x="220" y={170 - i * 42} width="120" height="40" rx="8" fill={i === 3 ? '#fee2e2' : '#dbeafe'} stroke={i === 3 ? '#ef4444' : '#2563eb'} strokeWidth="2"/>)}
    <text x="280" y="50" textAnchor="middle" fontSize="18" fontWeight="700" fill="#111827">top</text>
    <Arrow x1={140} y1={38} x2={220} y2={64} label="push"/>
    <Arrow x1={340} y1={64} x2={430} y2={38} label="pop"/>
  </svg>
</div>;

const QueueVisual = ({ compact }) => <div style={{ ...tv.box, minHeight: compact ? 160 : 230 }}>
  <svg viewBox="0 0 700 230" style={tv.svg}>
    {[0,1,2,3].map(i => <TextBox key={i} x={150 + i * 95} y={88} w={78} h={54} text={String.fromCharCode(65 + i)} fill="#dbeafe" stroke="#2563eb"/>)}
    <text x="120" y="82" fontSize="17" fontWeight="700" fill="#ef4444">front</text>
    <text x="520" y="82" fontSize="17" fontWeight="700" fill="#16a34a">rear</text>
    <Arrow x1={50} y1={115} x2={150} y2={115} label="dequeue"/>
    <Arrow x1={620} y1={115} x2={530} y2={115} label="enqueue"/>
  </svg>
</div>;

const TreeVisual = ({ compact }) => <div style={{ ...tv.box, minHeight: compact ? 180 : 260 }}>
  <svg viewBox="0 0 620 280" style={tv.svg}>
    {[[310,35,'8'],[190,125,'3'],[430,125,'10'],[130,215,'1'],[250,215,'6'],[500,215,'14']].map(([x,y,v]) => <g key={v}><circle cx={x} cy={y} r="31" fill="#dbeafe" stroke="#2563eb" strokeWidth="2"/><text x={x} y={y+6} textAnchor="middle" fontSize="18" fontWeight="700">{v}</text></g>)}
    <line x1="292" y1="60" x2="210" y2="100" stroke="#94a3b8" strokeWidth="2"/><line x1="328" y1="60" x2="410" y2="100" stroke="#94a3b8" strokeWidth="2"/>
    <line x1="178" y1="150" x2="140" y2="190" stroke="#94a3b8" strokeWidth="2"/><line x1="202" y1="150" x2="238" y2="190" stroke="#94a3b8" strokeWidth="2"/><line x1="445" y1="150" x2="490" y2="190" stroke="#94a3b8" strokeWidth="2"/>
    <text x="310" y="18" textAnchor="middle" fontSize="14" fontWeight="700" fill="#16a34a">left smaller, right larger</text>
  </svg>
</div>;

const BigOVisual = ({ compact }) => <div style={{ ...tv.box, minHeight: compact ? 180 : 260 }}>
  <svg viewBox="0 0 620 280" style={tv.svg}>
    <line x1="60" y1="225" x2="570" y2="225" stroke="#64748b" strokeWidth="2"/><line x1="60" y1="225" x2="60" y2="35" stroke="#64748b" strokeWidth="2"/>
    <path d="M70 210 C190 208 390 205 560 200" fill="none" stroke="#16a34a" strokeWidth="4"/><text x="475" y="192" fontSize="14" fontWeight="700">O(1)</text>
    <path d="M70 215 C190 190 390 125 560 65" fill="none" stroke="#2563eb" strokeWidth="4"/><text x="500" y="70" fontSize="14" fontWeight="700">O(n)</text>
    <path d="M70 220 C230 215 380 170 560 40" fill="none" stroke="#ef4444" strokeWidth="4"/><text x="500" y="42" fontSize="14" fontWeight="700">O(n²)</text>
  </svg>
</div>;

const CodeVisual = ({ code, compact }) => <pre style={{ ...tv.code, maxHeight: compact ? 180 : 260 }}>{code && code.content || 'Code preview appears here.'}</pre>;

const TextBox = ({ x, y, w, h, text, fill, stroke }) => <g>
  <rect x={x} y={y} width={w} height={h} rx="14" fill={fill} stroke={stroke} strokeWidth="2"/>
  <text x={x + w / 2} y={y + h / 2 + 5} textAnchor="middle" fontSize="15" fontWeight="700" fill="#111827">{text}</text>
</g>;
const ClassBox = ({ x, y, name, rows }) => <g>
  <rect x={x} y={y} width="160" height="96" rx="10" fill="#dbeafe" stroke="#2563eb" strokeWidth="2"/>
  <text x={x + 80} y={y + 24} textAnchor="middle" fontSize="16" fontWeight="700">{name}</text>
  <line x1={x} y1={y + 34} x2={x + 160} y2={y + 34} stroke="#2563eb" strokeWidth="2"/>
  {rows.map((r, i) => <text key={r} x={x + 14} y={y + 56 + i * 20} fontSize="13" fill="#111827">{r}</text>)}
</g>;
const Node = ({ x, y, value }) => <g>
  <rect x={x} y={y} width="118" height="86" rx="12" fill="#dcfce7" stroke="#16a34a" strokeWidth="2"/>
  <line x1={x + 68} y1={y} x2={x + 68} y2={y + 86} stroke="#16a34a" strokeWidth="2"/>
  <text x={x + 34} y={y + 49} textAnchor="middle" fontSize="18" fontWeight="700">{value}</text>
  <text x={x + 92} y={y + 49} textAnchor="middle" fontSize="13" fontWeight="700">next</text>
</g>;
const Arrow = ({ x1, y1, x2, y2, label }) => <g>
  <defs><marker id="arrowHead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#ef4444"/></marker></defs>
  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#ef4444" strokeWidth="3" markerEnd="url(#arrowHead)"/>
  {label && <text x={(x1+x2)/2} y={(y1+y2)/2 - 8} textAnchor="middle" fontSize="12" fontWeight="700" fill="#991b1b">{label}</text>}
</g>;

const tv = {
  box: { border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-0)', overflow: 'hidden', padding: 10 },
  svg: { width: '100%', height: '100%', minHeight: 160, display: 'block' },
  code: { background: '#0f172a', color: '#dbeafe', border: '1px solid #38bdf8', borderRadius: 8, padding: 16, overflow: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12.5, lineHeight: 1.55 },
};

const lm = {
  shell: { border: '1px solid var(--line)', borderRadius: 'var(--r-md)', background: 'var(--bg-1)', padding: 18, overflow: 'hidden' },
  compactShell: { padding: 12 },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  eyebrow: { fontSize: 10.5, color: 'var(--accent)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 },
  title: { fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 26, margin: 0 },
  start: { fontSize: 12.5, color: 'var(--fg-1)', background: 'var(--accent-glow)', border: '1px solid var(--accent-soft)', padding: '8px 12px', borderRadius: 8 },
  path: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 },
  pathChip: { fontSize: 11.5, color: 'var(--fg-1)', border: '1px solid var(--line)', borderRadius: 999, padding: '5px 8px', background: 'var(--bg-2)' },
  canvas: { position: 'relative', height: 360, marginTop: 10 },
  compactCanvas: { height: 230, transform: 'scale(0.72)', transformOrigin: 'top left', width: '138%', marginBottom: -64 },
  root: { position: 'absolute', transform: 'translate(-50%, 0)', padding: '10px 14px', borderRadius: 999, background: 'var(--accent)', color: 'var(--bg-0)', fontSize: 13, fontWeight: 700, zIndex: 2 },
  node: { position: 'absolute', transform: 'translate(-50%, -50%)', minWidth: 138, maxWidth: 170, padding: 12, borderRadius: 12, border: '1px solid', background: 'var(--bg-0)', color: 'var(--fg-1)', display: 'flex', flexDirection: 'column', gap: 5, textAlign: 'left', zIndex: 3 },
  dot: { width: 8, height: 8, borderRadius: 99, display: 'inline-block' },
  reason: { fontSize: 10.5, color: 'var(--fg-3)', textTransform: 'capitalize' },
};

window.TopicVisual = TopicVisual;
window.LearningMap = LearningMap;
