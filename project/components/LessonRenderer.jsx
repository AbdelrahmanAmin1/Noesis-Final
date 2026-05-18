const LessonRenderer = ({ lesson, markdown }) => {
  const parsed = parseLesson(lesson);
  if (!parsed) return <MarkdownFallback markdown={markdown} />;
  const objectives = parsed.learningObjectives || [];
  const sections = parsed.sections || [];
  const startHere = parsed.startHere || parsed.learningPath && parsed.learningPath.startHere || parsed.prerequisites && parsed.prerequisites.length && `Review ${parsed.prerequisites[0]} first`;
  const byType = (type) => sections.filter(s => s.type === type);

  return (
    <article style={lr.page}>
      <header style={lr.hero}>
        <div style={lr.eyebrow}>{labelFor(parsed.lessonType)} lesson</div>
        <h1 style={lr.title}>{parsed.topic || 'Learning Note'}</h1>
        {parsed.sourceMaterial && parsed.sourceMaterial.grounding && (
          <div style={lr.meta}>Grounding: {parsed.sourceMaterial.grounding}</div>
        )}
      </header>

      {objectives.length > 0 && (
        <section style={lr.objectives}>
          {objectives.slice(0, 4).map((item, i) => (
            <div key={i} style={lr.objectiveCard}>
              <div style={lr.cardNumber}>{String(i + 1).padStart(2, '0')}</div>
              <div style={lr.cardText}>{item}</div>
            </div>
          ))}
        </section>
      )}

      {startHere && (
        <section style={lr.startHere}>
          <div style={lr.sectionLabel}>Start here</div>
          <div style={lr.startTitle}>{startHere}</div>
          {parsed.prerequisites && parsed.prerequisites.length > 0 && (
            <div style={lr.chips}>{parsed.prerequisites.slice(0, 5).map(t => <span key={t} style={lr.chip}>{t}</span>)}</div>
          )}
        </section>
      )}

      {sections.map((section, i) => (
        <LessonSection key={`${section.type}-${i}`} section={section} />
      ))}

      {parsed.relatedTopics && parsed.relatedTopics.length > 0 && (
        <section style={lr.band}>
          <div style={lr.sectionLabel}>Related topics</div>
          <div style={lr.chips}>
            {parsed.relatedTopics.map(t => <span key={t} style={lr.chip}>{t}</span>)}
          </div>
        </section>
      )}
    </article>
  );
};

function parseLesson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    if (parsed && parsed.sections) return parsed;
    if (parsed && parsed.lesson && parsed.lesson.sections) return parsed.lesson;
  } catch (_) {}
  return null;
}

function preview(value, markdown) {
  const lesson = parseLesson(value);
  if (lesson) {
    const first = (lesson.sections || []).find(s => s.content);
    return (first && first.content || lesson.topic || '').replace(/\s+/g, ' ').slice(0, 130);
  }
  return cleanMarkdown(markdown || '').slice(0, 130);
}

function cleanMarkdown(markdown) {
  let text = String(markdown || '');
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.markdown === 'string') text = parsed.markdown;
  } catch (_) {}
  return text.replace(/\\n/g, '\n').replace(/\[chunk:\s*\d+\]/gi, '').trim();
}

const LessonSection = ({ section }) => {
  const type = section.type || 'section';
  if (type === 'hook') return <HookSection section={section} />;
  if (type === 'code_example') return <CodeSection section={section} />;
  if (type === 'code_walkthrough') return <WalkthroughSection section={section} />;
  if (type === 'diagram' || type === 'mindmap') return <DiagramSection section={section} />;
  if (type === 'common_mistakes') return <CardsSection section={section} tone="warning" />;
  if (type === 'complexity') return <CardsSection section={section} tone="complexity" />;
  if (type === 'checkpoint') return <QuizSection section={section} />;
  return <TextSection section={section} />;
};

const HookSection = ({ section }) => (
  <section style={lr.hook}>
    <div style={lr.sectionLabel}>{section.title}</div>
    <p style={lr.hookText}>{section.content}</p>
    <Callouts items={section.callouts} />
  </section>
);

const TextSection = ({ section }) => (
  <section style={lr.band}>
    <div style={lr.sectionLabel}>{section.type.replace(/_/g, ' ')}</div>
    <h2 style={lr.h2}>{section.title}</h2>
    {section.content && <p style={lr.p}>{section.content}</p>}
    <CardGrid cards={section.cards} />
    <Callouts items={section.callouts} />
  </section>
);

const CardsSection = ({ section, tone }) => (
  <section style={lr.band}>
    <div style={lr.sectionLabel}>{section.type.replace(/_/g, ' ')}</div>
    <h2 style={lr.h2}>{section.title}</h2>
    {section.content && <p style={lr.p}>{section.content}</p>}
    <CardGrid cards={section.cards} tone={tone} />
    <Callouts items={section.callouts} />
  </section>
);

const CodeSection = ({ section }) => {
  const code = section.code || {};
  return (
    <section style={lr.band}>
      <div style={lr.sectionLabel}>code example</div>
      <h2 style={lr.h2}>{section.title}</h2>
      {section.content && <p style={lr.p}>{section.content}</p>}
      <pre style={lr.pre}><code>{code.content || ''}</code></pre>
      {code.explanation && code.explanation.length > 0 && (
        <div style={lr.walkGrid}>
          {code.explanation.map((item, i) => (
            <div key={i} style={lr.walkCard}>
              <div style={lr.lineRange}>{item.lineRange || `Step ${i + 1}`}</div>
              <div>{item.text || item}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

const WalkthroughSection = ({ section }) => (
  <section style={lr.band}>
    <div style={lr.sectionLabel}>walkthrough</div>
    <h2 style={lr.h2}>{section.title}</h2>
    {section.content && <p style={lr.p}>{section.content}</p>}
    <CardGrid cards={section.cards} />
  </section>
);

const DiagramSection = ({ section }) => (
  <section style={lr.band}>
    <div style={lr.sectionLabel}>visual model</div>
    <h2 style={lr.h2}>{section.title}</h2>
    {section.content && <p style={lr.p}>{section.content}</p>}
    <Diagram diagram={section.diagram} title={section.title} />
    {section.diagram && section.diagram.caption && <p style={lr.caption}>{section.diagram.caption}</p>}
  </section>
);

const QuizSection = ({ section }) => (
  <section style={lr.band}>
    <div style={lr.sectionLabel}>checkpoint</div>
    <h2 style={lr.h2}>{section.title}</h2>
    {section.content && <p style={lr.p}>{section.content}</p>}
    {(section.quiz || []).map((q, i) => (
      <div key={i} style={lr.quiz}>
        <div style={lr.quizQ}>{q.question}</div>
        {(q.options || []).map(opt => <div key={opt} style={lr.option}>{opt}</div>)}
        {q.answer && <div style={lr.answer}>Answer: {q.answer}</div>}
        {q.explanation && <div style={lr.explain}>{q.explanation}</div>}
      </div>
    ))}
  </section>
);

const CardGrid = ({ cards, tone }) => {
  const safe = Array.isArray(cards) ? cards.filter(c => c && (c.title || c.text)) : [];
  if (!safe.length) return null;
  return (
    <div style={lr.cardGrid}>
      {safe.map((card, i) => (
        <div key={i} style={{ ...lr.infoCard, ...(tone === 'warning' ? lr.warnCard : {}), ...(tone === 'complexity' ? lr.metricCard : {}) }}>
          {card.title && <div style={lr.infoTitle}>{card.title}</div>}
          {card.text && <div style={lr.infoText}>{card.text}</div>}
        </div>
      ))}
    </div>
  );
};

const Callouts = ({ items }) => {
  const safe = Array.isArray(items) ? items.filter(c => c && c.text) : [];
  if (!safe.length) return null;
  return (
    <div style={lr.callouts}>
      {safe.map((c, i) => (
        <div key={i} style={lr.callout}>
          <strong>{c.type || 'note'}:</strong> {c.text}
          {c.sourceChunkIds && c.sourceChunkIds.length > 0 && (
            <span style={lr.sourceBadges}>{c.sourceChunkIds.slice(0, 4).map(id => <span key={id} style={lr.sourceBadge}>source {id}</span>)}</span>
          )}
        </div>
      ))}
    </div>
  );
};

const Diagram = ({ diagram, title }) => {
  if (!diagram || !Array.isArray(diagram.nodes) || diagram.nodes.length === 0) return null;
  const type = diagram.type || 'mindmap';
  if (window.TopicVisual) return <window.TopicVisual template={type} data={diagram} />;
  if (type === 'mindmap') return <MindmapDiagram diagram={diagram} title={title} />;
  if (type === 'uml_class' || type === 'inheritance_tree') return <UmlDiagram diagram={diagram} />;
  if (type === 'linked_list' || type === 'linkedlist') return <LinkedListDiagram diagram={diagram} />;
  if (type === 'stack') return <StackDiagram diagram={diagram} />;
  if (type === 'queue') return <QueueDiagram diagram={diagram} />;
  if (type === 'stack_queue') return isQueueDiagram(diagram) ? <QueueDiagram diagram={diagram} /> : <StackDiagram diagram={diagram} />;
  if (type === 'tree') return <TreeDiagram diagram={diagram} />;
  if (type === 'big_o_chart' || type === 'bigo_chart') return <BigOChart diagram={diagram} />;
  return <FlowDiagram diagram={diagram} title={title} />;
};

function nodeLabel(node) {
  if (typeof node === 'string') return node;
  return node.label || node.id || node.name || '';
}

function isQueueDiagram(diagram) {
  const text = [...(diagram.nodes || []), ...(diagram.operations || [])].map(nodeLabel).join(' ').toLowerCase();
  return /\b(queue|fifo|enqueue|dequeue|front|rear)\b/.test(text);
}

const MindmapDiagram = ({ diagram, title }) => {
  const raw = (diagram.nodes || []).map(nodeLabel).filter(Boolean);
  const center = raw[0] || title || 'Concept';
  const nodes = raw.slice(1, 7);
  const points = [
    [116, 78], [384, 78], [92, 210], [408, 210], [250, 36], [250, 252],
  ];
  return (
    <div style={lr.diagram}>
      <svg viewBox="0 0 500 310" role="img" aria-label={`${center} mindmap`} style={lr.svg}>
        <defs>
          <filter id="mindmapShadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="rgba(15,23,42,.14)" />
          </filter>
        </defs>
        {nodes.map((node, i) => (
          <line key={`line-${i}`} x1="250" y1="156" x2={points[i][0]} y2={points[i][1]} stroke="var(--line)" strokeWidth="2.5" />
        ))}
        <g filter="url(#mindmapShadow)">
          <rect x="158" y="116" width="184" height="80" rx="20" fill="var(--accent-glow)" stroke="var(--accent-soft)" />
          <text x="250" y="151" textAnchor="middle" fill="var(--fg-0)" fontSize="15" fontWeight="700">{center}</text>
          <text x="250" y="171" textAnchor="middle" fill="var(--fg-3)" fontSize="11">mental model</text>
        </g>
        {nodes.map((node, i) => (
          <g key={node + i} filter="url(#mindmapShadow)">
            <rect x={points[i][0] - 70} y={points[i][1] - 28} width="140" height="56" rx="16" fill="var(--bg-2)" stroke="var(--line)" />
            <text x={points[i][0]} y={points[i][1] + 4} textAnchor="middle" fill="var(--fg-1)" fontSize="12" fontWeight="600">{shortSvgLabel(node, 18)}</text>
          </g>
        ))}
      </svg>
    </div>
  );
};

function shortSvgLabel(value, max) {
  const text = String(value || '').trim();
  return text.length > max ? text.slice(0, max).trim() : text;
}

const UmlDiagram = ({ diagram }) => {
  const nodes = diagram.nodes || [];
  const edges = diagram.edges || [];
  const parent = edges[0] && edges[0][1] ? edges[0][1] : nodeLabel(nodes[0]);
  const children = nodes.filter(n => nodeLabel(n) !== parent);
  const parentNode = nodes.find(n => nodeLabel(n) === parent) || nodes[0];
  return (
    <div style={lr.diagram}>
      <ClassBox node={parentNode} />
      <div style={lr.umlChildren}>
        {children.map((child, i) => (
          <div key={i} style={lr.umlChildWrap}>
            <div style={lr.umlArrow}>extends</div>
            <ClassBox node={child} />
          </div>
        ))}
      </div>
    </div>
  );
};

const ClassBox = ({ node }) => {
  const obj = typeof node === 'string' ? { label: node } : node;
  return (
    <div style={lr.classBox}>
      <div style={lr.className}>{nodeLabel(obj)}</div>
      {obj.fields && obj.fields.length > 0 && <div style={lr.classPart}>{obj.fields.map(f => <div key={f}>- {f}</div>)}</div>}
      {obj.methods && obj.methods.length > 0 && <div style={lr.classPart}>{obj.methods.map(m => <div key={m}>+ {m}</div>)}</div>}
    </div>
  );
};

const LinkedListDiagram = ({ diagram }) => {
  const nodes = (diagram.nodes || []).map(nodeLabel).filter(n => !/^(head|null)$/i.test(n));
  return (
    <div style={lr.listDiagram}>
      <div style={lr.headNode}>head</div>
      <div style={lr.arrow}>-></div>
      {nodes.map((n, i) => (
        <React.Fragment key={`${n}-${i}`}>
          <div style={lr.listNode}>
            <span style={lr.nodeData}>{n}</span>
            <span style={lr.nodeNext}>next</span>
          </div>
          <div style={lr.arrow}>-></div>
        </React.Fragment>
      ))}
      <div style={lr.nullNode}>null</div>
    </div>
  );
};

const StackDiagram = ({ diagram }) => {
  const nodes = (diagram.nodes || []).map(nodeLabel);
  return (
    <div style={lr.stack}>
      {nodes.map((n, i) => <div key={`${n}-${i}`} style={i === 0 ? lr.stackTop : lr.stackItem}>{n}</div>)}
    </div>
  );
};

const QueueDiagram = ({ diagram }) => {
  const nodes = (diagram.nodes || []).map(nodeLabel).filter(n => !/^(front|rear)$/i.test(n));
  return (
    <div style={lr.queue}>
      <div style={lr.queueLabel}>dequeue</div>
      {nodes.map((n, i) => <div key={`${n}-${i}`} style={lr.queueItem}>{n}</div>)}
      <div style={lr.queueLabel}>enqueue</div>
    </div>
  );
};

const TreeDiagram = ({ diagram }) => {
  const nodes = (diagram.nodes || []).map(nodeLabel).slice(0, 7);
  return (
    <div style={lr.diagram}>
      <svg viewBox="0 0 520 300" role="img" aria-label="tree diagram" style={lr.svg}>
        {[[0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [2, 6]].map(([a, b]) => nodes[b] && (
          <line key={`${a}-${b}`} x1={treePoint(a).x} y1={treePoint(a).y} x2={treePoint(b).x} y2={treePoint(b).y} stroke="var(--line)" strokeWidth="2.5" />
        ))}
        {nodes.map((n, i) => {
          const p = treePoint(i);
          return (
            <g key={`${n}-${i}`}>
              <circle cx={p.x} cy={p.y} r="31" fill={i === 0 ? 'var(--accent-glow)' : 'var(--bg-2)'} stroke={i === 0 ? 'var(--accent-soft)' : 'var(--line)'} strokeWidth="2" />
              <text x={p.x} y={p.y + 5} textAnchor="middle" fill="var(--fg-0)" fontSize="13" fontWeight="700">{shortSvgLabel(n, 8)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

function treePoint(i) {
  const points = [
    { x: 260, y: 52 }, { x: 150, y: 140 }, { x: 370, y: 140 },
    { x: 94, y: 238 }, { x: 206, y: 238 }, { x: 314, y: 238 }, { x: 426, y: 238 },
  ];
  return points[i] || points[0];
}

const BigOChart = () => (
  <div style={lr.diagram}>
    <svg viewBox="0 0 560 310" role="img" aria-label="Big O complexity chart" style={lr.svg}>
      <line x1="60" y1="260" x2="500" y2="260" stroke="var(--fg-3)" strokeWidth="2.5" />
      <line x1="60" y1="40" x2="60" y2="260" stroke="var(--fg-3)" strokeWidth="2.5" />
      <ComplexityCurve color="#22c55e" label="O(1)" points="60,206 500,206" />
      <ComplexityCurve color="#3b82f6" label="O(log n)" points="60,220 140,198 240,178 360,162 500,148" />
      <ComplexityCurve color="#eab308" label="O(n)" points="60,236 160,206 260,176 380,140 500,104" />
      <ComplexityCurve color="#f97316" label="O(n log n)" points="60,244 150,216 250,176 365,112 500,58" />
      <ComplexityCurve color="#ef4444" label="O(n^2)" points="60,252 170,226 270,176 365,96 455,42" />
      <text x="502" y="285" fill="var(--fg-3)" fontSize="12">input size</text>
      <text x="14" y="38" fill="var(--fg-3)" fontSize="12">time</text>
    </svg>
  </div>
);

const ComplexityCurve = ({ color, label, points }) => {
  const last = points.split(' ').pop().split(',').map(Number);
  return (
    <g>
      <polyline fill="none" stroke={color} strokeWidth="3.5" points={points} strokeLinecap="round" strokeLinejoin="round" />
      <text x={last[0] + 8} y={last[1] + 4} fill={color} fontSize="12" fontWeight="700">{label}</text>
    </g>
  );
};

const FlowDiagram = ({ diagram, title }) => {
  const nodes = (diagram.nodes || []).map(nodeLabel).slice(0, 7);
  return (
    <div style={lr.flow}>
      {nodes.map((n, i) => (
        <React.Fragment key={`${n}-${i}`}>
          <div style={i === 0 ? lr.flowRoot : lr.flowNode}>{n}</div>
          {i < nodes.length - 1 && <div style={lr.arrow}>-></div>}
        </React.Fragment>
      ))}
    </div>
  );
};

const MarkdownFallback = ({ markdown }) => {
  const body = cleanMarkdown(markdown || '');
  const html = window.marked ? window.marked.parse(body) : body;
  const safe = window.DOMPurify ? window.DOMPurify.sanitize(html) : html;
  return <div className="md-rendered" style={lr.markdown} dangerouslySetInnerHTML={{ __html: safe }} />;
};

function labelFor(type) {
  return String(type || 'general').replace(/_/g, ' ');
}

const lr = {
  page: { color: 'var(--fg-1)' },
  hero: { padding: '10px 0 24px', borderBottom: '1px solid var(--line-soft)', marginBottom: 22 },
  eyebrow: { fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 8 },
  title: { fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 300, lineHeight: 1.12, margin: 0, color: 'var(--fg-0)' },
  meta: { marginTop: 10, fontSize: 12, color: 'var(--fg-3)' },
  objectives: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 22 },
  objectiveCard: { border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)', padding: 14 },
  cardNumber: { fontSize: 10.5, color: 'var(--accent)', fontFamily: 'var(--font-mono)', marginBottom: 8 },
  cardText: { fontSize: 13, lineHeight: 1.45, color: 'var(--fg-0)' },
  startHere: { padding: 16, borderRadius: 8, background: 'var(--accent-glow)', border: '1px solid var(--accent-soft)', marginBottom: 18 },
  startTitle: { fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--fg-0)', marginBottom: 10, lineHeight: 1.2 },
  hook: { padding: 20, borderRadius: 8, background: 'linear-gradient(135deg, color-mix(in oklab, var(--accent) 12%, transparent), var(--bg-1))', border: '1px solid var(--line)', marginBottom: 18 },
  hookText: { fontSize: 17, lineHeight: 1.65, margin: 0, color: 'var(--fg-0)' },
  band: { padding: '18px 0', borderBottom: '1px solid var(--line-soft)' },
  sectionLabel: { fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 7 },
  h2: { fontSize: 24, fontWeight: 500, lineHeight: 1.22, margin: '0 0 10px', color: 'var(--fg-0)' },
  p: { fontSize: 14.5, lineHeight: 1.75, margin: '0 0 14px', color: 'var(--fg-1)' },
  cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginTop: 12 },
  infoCard: { border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)', padding: 13 },
  warnCard: { borderColor: 'color-mix(in oklab, var(--warn) 36%, var(--line))', background: 'color-mix(in oklab, var(--warn) 8%, var(--bg-1))' },
  metricCard: { borderColor: 'color-mix(in oklab, var(--accent) 32%, var(--line))' },
  infoTitle: { fontSize: 13, color: 'var(--fg-0)', fontWeight: 600, marginBottom: 5 },
  infoText: { fontSize: 12.5, color: 'var(--fg-2)', lineHeight: 1.5 },
  pre: { background: '#0f172a', color: '#e2e8f0', padding: 16, borderRadius: 8, overflow: 'auto', lineHeight: 1.55, fontSize: 12.5, border: '1px solid var(--line)' },
  walkGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10, marginTop: 12 },
  walkCard: { border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)', padding: 12, fontSize: 12.5, lineHeight: 1.5 },
  lineRange: { fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--accent)', marginBottom: 6 },
  diagram: { border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)', padding: 18, marginTop: 12, overflow: 'auto' },
  svg: { width: '100%', maxWidth: 720, display: 'block', margin: '0 auto' },
  umlChildren: { display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginTop: 14 },
  umlChildWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  umlArrow: { fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' },
  classBox: { minWidth: 170, border: '1px solid var(--accent-soft)', borderRadius: 8, background: 'var(--bg-0)', overflow: 'hidden' },
  className: { padding: '9px 11px', textAlign: 'center', fontWeight: 700, color: 'var(--fg-0)', borderBottom: '1px solid var(--line-soft)' },
  classPart: { padding: '8px 11px', borderTop: '1px solid var(--line-soft)', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--fg-2)' },
  listDiagram: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)', padding: 16, marginTop: 12 },
  headNode: { padding: '8px 12px', borderRadius: 8, background: 'var(--accent-glow)', border: '1px solid var(--accent-soft)', color: 'var(--fg-0)', fontFamily: 'var(--font-mono)', fontSize: 12 },
  listNode: { padding: '8px 12px', borderRadius: 8, background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--fg-0)', fontFamily: 'var(--font-mono)', fontSize: 12 },
  nodeData: { display: 'inline-block', paddingRight: 8, marginRight: 8, borderRight: '1px solid var(--line)' },
  nodeNext: { color: 'var(--fg-3)' },
  nullNode: { padding: '8px 12px', borderRadius: 8, background: 'color-mix(in oklab, var(--warn) 8%, var(--bg-1))', border: '1px solid color-mix(in oklab, var(--warn) 35%, var(--line))', color: 'var(--fg-0)', fontFamily: 'var(--font-mono)', fontSize: 12 },
  arrow: { color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', fontSize: 13 },
  stack: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)', padding: 16, marginTop: 12 },
  stackTop: { width: 220, padding: '9px 12px', borderRadius: 8, background: 'var(--accent-glow)', border: '1px solid var(--accent-soft)', textAlign: 'center', fontFamily: 'var(--font-mono)' },
  stackItem: { width: 220, padding: '9px 12px', borderRadius: 8, background: 'var(--bg-2)', border: '1px solid var(--line)', textAlign: 'center', fontFamily: 'var(--font-mono)' },
  queue: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)', padding: 16, marginTop: 12 },
  queueLabel: { padding: '8px 10px', borderRadius: 8, background: 'var(--accent-glow)', border: '1px solid var(--accent-soft)', color: 'var(--fg-0)', fontSize: 12, fontFamily: 'var(--font-mono)' },
  queueItem: { minWidth: 54, textAlign: 'center', padding: '9px 12px', borderRadius: 8, background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--fg-0)', fontFamily: 'var(--font-mono)', fontSize: 12 },
  flow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)', padding: 16, marginTop: 12 },
  flowRoot: { padding: '8px 12px', borderRadius: 8, background: 'var(--accent-glow)', border: '1px solid var(--accent-soft)', color: 'var(--fg-0)', fontSize: 12 },
  flowNode: { padding: '8px 12px', borderRadius: 8, background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--fg-0)', fontSize: 12 },
  caption: { margin: '8px 0 0', fontSize: 12, color: 'var(--fg-3)' },
  callouts: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 },
  callout: { borderLeft: '3px solid var(--accent)', background: 'var(--bg-1)', padding: '9px 11px', fontSize: 12.5, lineHeight: 1.5 },
  sourceBadges: { display: 'inline-flex', gap: 5, flexWrap: 'wrap', marginLeft: 8, verticalAlign: 'middle' },
  sourceBadge: { border: '1px solid var(--line)', borderRadius: 999, padding: '1px 6px', fontSize: 10.5, color: 'var(--fg-3)', background: 'var(--bg-0)' },
  quiz: { border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)', padding: 14, marginTop: 12 },
  quizQ: { fontSize: 14, color: 'var(--fg-0)', fontWeight: 600, marginBottom: 10 },
  option: { padding: '8px 10px', background: 'var(--bg-2)', border: '1px solid var(--line-soft)', borderRadius: 6, marginTop: 6, fontSize: 12.5 },
  answer: { marginTop: 10, color: 'var(--ok)', fontSize: 12.5, fontWeight: 600 },
  explain: { marginTop: 4, color: 'var(--fg-2)', fontSize: 12.5, lineHeight: 1.45 },
  chips: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  chip: { border: '1px solid var(--line)', borderRadius: 999, padding: '5px 9px', fontSize: 11.5, color: 'var(--fg-2)', background: 'var(--bg-1)' },
  markdown: { minHeight: 420, fontSize: 14.5, lineHeight: 1.75, color: 'var(--fg-1)' },
};

LessonRenderer.parse = parseLesson;
LessonRenderer.preview = preview;
window.LessonRenderer = LessonRenderer;
