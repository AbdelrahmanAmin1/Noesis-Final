const LessonRenderer = ({ lesson, markdown }) => {
  const parsed = parseLesson(lesson);
  if (!parsed) return <MarkdownFallback markdown={markdown} />;
  const objectives = parsed.learningObjectives || [];
  const studyGuide = studyGuideFor(parsed);
  const sections = (parsed.sections || []).filter(section => !/^source outline$/i.test(String(section && section.title || '').trim()));
  const startHere = parsed.startHere || parsed.learningPath && parsed.learningPath.startHere || parsed.prerequisites && parsed.prerequisites.length && `Review ${parsed.prerequisites[0]} first`;
  const byType = (type) => sections.filter(s => s.type === type);
  const usedSourceVisuals = new Set(sections.flatMap(section => section.sourceVisuals || [])
    .map(v => String(v && (v.id || `${v.pageNumber || v.sourcePage || ''}:${v.slideNumber || ''}:${v.heading || ''}`))));
  const remainingSourceVisuals = (parsed.sourceVisuals || []).filter(v => !usedSourceVisuals.has(String(v && (v.id || `${v.pageNumber || v.sourcePage || ''}:${v.slideNumber || ''}:${v.heading || ''}`))));

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

      <StudyGuide guide={studyGuide} />

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
        <React.Fragment key={`${section.type}-${i}`}>
          <LessonSection section={section} />
          <SourceVisuals visuals={section.sourceVisuals} inline />
        </React.Fragment>
      ))}

      <SourceVisuals visuals={remainingSourceVisuals} />

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

const StudyGuide = ({ guide }) => {
  if (!guide) return null;
  const groups = [
    ['What you will learn', guide.whatYouWillLearn],
    ['Key concepts', guide.keyConcepts],
    ['Suggested learning order', guide.suggestedOrder],
    ['Prerequisites', guide.prerequisites],
    ['Quick checkpoints', guide.checkpoints],
  ].filter(([, items]) => Array.isArray(items) && items.length);
  const mistakes = Array.isArray(guide.commonMistakes) ? guide.commonMistakes : [];
  if (!groups.length && !mistakes.length) return null;
  return (
    <section style={lr.studyGuide}>
      <div style={lr.studyGuideHead}>
        <div style={lr.sectionLabel}>Study Guide</div>
        <h2 style={lr.studyGuideTitle}>How to learn this material</h2>
      </div>
      <div style={lr.studyGuideGrid}>
        {groups.map(([label, items]) => (
          <div key={label} style={lr.studyGuideGroup}>
            <div style={lr.studyGuideLabel}>{label}</div>
            {label === 'Suggested learning order' ? (
              <ol style={lr.studyGuideList}>{items.slice(0, 8).map(item => <li key={item}>{item}</li>)}</ol>
            ) : (
              <ul style={lr.studyGuideList}>{items.slice(0, 8).map(item => <li key={item}>{item}</li>)}</ul>
            )}
          </div>
        ))}
        {mistakes.length > 0 && (
          <div style={lr.studyGuideGroup}>
            <div style={lr.studyGuideLabel}>Common mistakes</div>
            <div style={lr.studyGuideMistakes}>
              {mistakes.slice(0, 5).map((item, index) => (
                <div key={(item.mistake || 'mistake') + index} style={lr.studyGuideMistake}>
                  <b>{item.mistake}</b>{item.correction ? <span>{item.correction}</span> : null}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

function studyGuideFor(lesson) {
  const direct = lesson && (lesson.studyGuide || lesson.learningPath);
  const sections = lesson && lesson.sections || [];
  const oldOutline = sections.find(section => /^source outline$/i.test(String(section && section.title || '').trim()));
  const mistakes = sections.find(section => section && section.type === 'common_mistakes');
  const checkpoint = sections.find(section => section && section.type === 'checkpoint');
  const guide = direct || {};
  const pick = (primary, fallback) => Array.isArray(primary) && primary.length ? primary : fallback;
  const outlineCards = oldOutline && Array.isArray(oldOutline.cards) ? oldOutline.cards : [];
  return {
    whatYouWillLearn: pick(guide.whatYouWillLearn, lesson.learningObjectives || []),
    keyConcepts: pick(guide.keyConcepts, outlineCards.map(card => card && card.title).filter(Boolean)),
    suggestedOrder: pick(guide.suggestedOrder, outlineCards.map(card => card && card.title).filter(Boolean)),
    prerequisites: pick(guide.prerequisites, lesson.prerequisites || []),
    commonMistakes: pick(guide.commonMistakes, (mistakes && mistakes.cards || []).map(card => ({ mistake: card.title || card.text, correction: card.text || '' }))),
    checkpoints: pick(guide.checkpoints, (checkpoint && checkpoint.quiz || []).map(item => item.question).filter(Boolean)),
  };
}

// Real diagrams/figures detected in the uploaded material. Only candidates that actually
// have an image are shown; text-only references are skipped here so notes never display an
// empty or meaningless visual placeholder.
const SourceVisuals = ({ visuals, inline = false }) => {
  const list = (visuals || []).filter(v => v && v.id && v.materialId && v.imagePath);
  if (!list.length) return null;
  return (
    <section style={lr.band}>
      <div style={lr.sectionLabel}>{inline ? 'Source visual' : 'From your material'}</div>
      <div style={lr.sourceGrid}>
        {list.slice(0, inline ? 2 : 6).map(v => <SourceImage key={v.id} candidate={v} />)}
      </div>
    </section>
  );
};

const SourceImage = ({ candidate }) => {
  const [url, setUrl] = React.useState('');
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    let active = true;
    let objUrl = '';
    (async () => {
      try {
        objUrl = await window.NoesisAPI.materials.sourceVisualImageBlobUrl(candidate.materialId, candidate.id);
        if (active) setUrl(objUrl); else URL.revokeObjectURL(objUrl);
      } catch (_) { if (active) setFailed(true); }
    })();
    return () => { active = false; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [candidate.materialId, candidate.id]);
  if (failed) return null;
  const where = candidate.pageNumber != null ? `p.${candidate.pageNumber}`
    : (candidate.slideNumber != null ? `slide ${candidate.slideNumber}` : '');
  return (
    <figure style={lr.sourceFigure}>
      {url
        ? <img src={url} alt={candidate.caption || 'Source visual'} style={lr.sourceImg} onError={() => setFailed(true)} />
        : <div style={lr.sourceLoading}>Loading source visual…</div>}
      {(candidate.caption || candidate.explanation || where) && (
        <figcaption style={lr.caption}>{candidate.explanation || candidate.caption || 'Source visual'}{where ? ` (${where})` : ''}</figcaption>
      )}
    </figure>
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
            <span style={lr.sourceBadges}><span style={lr.sourceBadge}>source-backed</span></span>
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
          <SvgTextLines x={250} y={148} width={160} text={center} fill="var(--fg-0)" fontSize={14} lineHeight={15} fontWeight={700} maxLines={3} />
          <text x="250" y="171" textAnchor="middle" fill="var(--fg-3)" fontSize="11">mental model</text>
        </g>
        {nodes.map((node, i) => (
          <g key={node + i} filter="url(#mindmapShadow)">
            <rect x={points[i][0] - 70} y={points[i][1] - 28} width="140" height="56" rx="16" fill="var(--bg-2)" stroke="var(--line)" />
            <SvgTextLines x={points[i][0]} y={points[i][1]} width={120} text={node} fill="var(--fg-1)" fontSize={11.5} lineHeight={12} fontWeight={600} maxLines={3} />
          </g>
        ))}
      </svg>
    </div>
  );
};

function wrapSvgLabel(value, maxChars = 16, maxLines = 2) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return [''];
  const words = text.split(' ');
  const lines = [];
  let current = '';
  const push = () => {
    if (current) {
      lines.push(current);
      current = '';
    }
  };
  for (const word of words) {
    if (word.length > maxChars) {
      push();
      lines.push(`${word.slice(0, Math.max(3, maxChars - 3))}...`);
    } else {
      const next = current ? `${current} ${word}` : word;
      if (next.length > maxChars) {
        push();
        current = word;
      } else {
        current = next;
      }
    }
    if (lines.length >= maxLines) break;
  }
  if (lines.length < maxLines) push();
  if (lines.length > maxLines) lines.length = maxLines;
  if (lines.length === maxLines && text.length > lines.join(' ').length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, Math.max(3, maxChars - 3)).trim()}...`;
  }
  return lines.length ? lines : [''];
}

const SvgTextLines = ({ x, y, text, width = 120, fontSize = 12, lineHeight = 13, fontWeight = 700, fill = 'var(--fg-0)', maxLines = 2 }) => {
  const maxChars = Math.max(6, Math.floor(width / Math.max(6, fontSize * 0.58)));
  const lines = wrapSvgLabel(text, maxChars, maxLines);
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  return <text textAnchor="middle" fill={fill} fontSize={fontSize} fontWeight={fontWeight}>
    {lines.map((line, index) => <tspan key={`${line}-${index}`} x={x} y={startY + index * lineHeight}>{line}</tspan>)}
  </text>;
};

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
              <SvgTextLines x={p.x} y={p.y + 1} width={52} text={n} fill="var(--fg-0)" fontSize={11} lineHeight={11} fontWeight={700} maxLines={3} />
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
  hero: { padding: '10px 0 24px', borderBottom: '1px solid var(--line-soft)', marginBottom: 'calc(22px * var(--app-density-scale))' },
  eyebrow: { fontSize: 'calc(11px * var(--app-font-scale))', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 'calc(8px * var(--app-density-scale))' },
  title: { fontFamily: 'var(--font-display)', fontSize: 'calc(38px * var(--app-font-scale))', fontWeight: 300, lineHeight: 1.12, margin: 0, color: 'var(--fg-0)' },
  meta: { marginTop: 'calc(10px * var(--app-density-scale))', fontSize: 'calc(12px * var(--app-font-scale))', color: 'var(--fg-3)' },
  objectives: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'calc(10px * var(--app-density-scale))', marginBottom: 'calc(22px * var(--app-density-scale))' },
  objectiveCard: { border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)', padding: 'calc(14px * var(--app-density-scale))' },
  cardNumber: { fontSize: 'calc(10.5px * var(--app-font-scale))', color: 'var(--accent)', fontFamily: 'var(--font-mono)', marginBottom: 'calc(8px * var(--app-density-scale))' },
  cardText: { fontSize: 'calc(13px * var(--app-font-scale))', lineHeight: 1.45, color: 'var(--fg-0)', overflowWrap: 'anywhere', wordBreak: 'break-word' },
  studyGuide: { padding: 'calc(18px * var(--app-density-scale))', borderRadius: 10, border: '1px solid var(--accent-soft)', background: 'linear-gradient(145deg, var(--accent-glow), var(--bg-1) 72%)', marginBottom: 'calc(22px * var(--app-density-scale))' },
  studyGuideHead: { marginBottom: 'calc(12px * var(--app-density-scale))' },
  studyGuideTitle: { margin: 0, color: 'var(--fg-0)', fontSize: 'calc(24px * var(--app-font-scale))', fontWeight: 500 },
  studyGuideGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 'calc(10px * var(--app-density-scale))' },
  studyGuideGroup: { minWidth: 0, padding: 'calc(12px * var(--app-density-scale))', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)' },
  studyGuideLabel: { color: 'var(--accent)', fontSize: 'calc(10.5px * var(--app-font-scale))', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 'calc(7px * var(--app-density-scale))' },
  studyGuideList: { margin: 0, paddingLeft: 20, color: 'var(--fg-1)', fontSize: 'calc(12.5px * var(--app-font-scale))', lineHeight: 1.55 },
  studyGuideMistakes: { display: 'grid', gap: 'calc(7px * var(--app-density-scale))' },
  studyGuideMistake: { display: 'grid', gap: 3, color: 'var(--fg-2)', fontSize: 'calc(12px * var(--app-font-scale))', lineHeight: 1.45 },
  startHere: { padding: 'calc(16px * var(--app-density-scale))', borderRadius: 8, background: 'var(--accent-glow)', border: '1px solid var(--accent-soft)', marginBottom: 'calc(18px * var(--app-density-scale))' },
  startTitle: { fontFamily: 'var(--font-display)', fontSize: 'calc(24px * var(--app-font-scale))', color: 'var(--fg-0)', marginBottom: 'calc(10px * var(--app-density-scale))', lineHeight: 1.2 },
  hook: { padding: 'calc(20px * var(--app-density-scale))', borderRadius: 8, background: 'linear-gradient(135deg, color-mix(in oklab, var(--accent) 12%, transparent), var(--bg-1))', border: '1px solid var(--line)', marginBottom: 'calc(18px * var(--app-density-scale))' },
  hookText: { fontSize: 'calc(17px * var(--app-font-scale))', lineHeight: 1.65, margin: 0, color: 'var(--fg-0)' },
  band: { padding: '18px 0', borderBottom: '1px solid var(--line-soft)' },
  sectionLabel: { fontSize: 'calc(10.5px * var(--app-font-scale))', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 'calc(7px * var(--app-density-scale))' },
  h2: { fontSize: 'calc(24px * var(--app-font-scale))', fontWeight: 500, lineHeight: 1.22, margin: '0 0 10px', color: 'var(--fg-0)' },
  p: { fontSize: 'calc(14.5px * var(--app-font-scale))', lineHeight: 1.75, margin: '0 0 14px', color: 'var(--fg-1)' },
  cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 'calc(10px * var(--app-density-scale))', marginTop: 'calc(12px * var(--app-density-scale))' },
  infoCard: { border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)', padding: 'calc(13px * var(--app-density-scale))', minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' },
  warnCard: { borderColor: 'color-mix(in oklab, var(--warn) 36%, var(--line))', background: 'color-mix(in oklab, var(--warn) 8%, var(--bg-1))' },
  metricCard: { borderColor: 'color-mix(in oklab, var(--accent) 32%, var(--line))' },
  infoTitle: { fontSize: 'calc(13px * var(--app-font-scale))', color: 'var(--fg-0)', fontWeight: 600, marginBottom: 'calc(5px * var(--app-density-scale))', overflowWrap: 'anywhere', wordBreak: 'break-word' },
  infoText: { fontSize: 'calc(12.5px * var(--app-font-scale))', color: 'var(--fg-2)', lineHeight: 1.5, overflowWrap: 'anywhere', wordBreak: 'break-word' },
  pre: { background: '#0f172a', color: '#e2e8f0', padding: 'calc(16px * var(--app-density-scale))', borderRadius: 8, overflow: 'auto', lineHeight: 1.55, fontSize: 'calc(12.5px * var(--app-font-scale))', border: '1px solid var(--line)' },
  walkGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 'calc(10px * var(--app-density-scale))', marginTop: 'calc(12px * var(--app-density-scale))' },
  walkCard: { border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)', padding: 'calc(12px * var(--app-density-scale))', fontSize: 'calc(12.5px * var(--app-font-scale))', lineHeight: 1.5 },
  lineRange: { fontFamily: 'var(--font-mono)', fontSize: 'calc(10.5px * var(--app-font-scale))', color: 'var(--accent)', marginBottom: 'calc(6px * var(--app-density-scale))' },
  diagram: { border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)', padding: 'calc(18px * var(--app-density-scale))', marginTop: 'calc(12px * var(--app-density-scale))', overflow: 'auto' },
  svg: { width: '100%', maxWidth: 720, display: 'block', margin: '0 auto' },
  umlChildren: { display: 'flex', gap: 'calc(14px * var(--app-density-scale))', justifyContent: 'center', flexWrap: 'wrap', marginTop: 'calc(14px * var(--app-density-scale))' },
  umlChildWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'calc(8px * var(--app-density-scale))' },
  umlArrow: { fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' },
  classBox: { minWidth: 170, maxWidth: 260, border: '1px solid var(--accent-soft)', borderRadius: 8, background: 'var(--bg-0)', overflow: 'hidden' },
  className: { padding: '9px 11px', textAlign: 'center', fontWeight: 700, color: 'var(--fg-0)', borderBottom: '1px solid var(--line-soft)', overflowWrap: 'anywhere', wordBreak: 'break-word' },
  classPart: { padding: '8px 11px', borderTop: '1px solid var(--line-soft)', fontSize: 'calc(12px * var(--app-font-scale))', fontFamily: 'var(--font-mono)', color: 'var(--fg-2)', overflowWrap: 'anywhere', wordBreak: 'break-word' },
  listDiagram: { display: 'flex', alignItems: 'center', gap: 'calc(8px * var(--app-density-scale))', flexWrap: 'wrap', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)', padding: 'calc(16px * var(--app-density-scale))', marginTop: 'calc(12px * var(--app-density-scale))' },
  headNode: { padding: '8px 12px', borderRadius: 8, background: 'var(--accent-glow)', border: '1px solid var(--accent-soft)', color: 'var(--fg-0)', fontFamily: 'var(--font-mono)', fontSize: 'calc(12px * var(--app-font-scale))', overflowWrap: 'anywhere', wordBreak: 'break-word' },
  listNode: { padding: '8px 12px', borderRadius: 8, background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--fg-0)', fontFamily: 'var(--font-mono)', fontSize: 'calc(12px * var(--app-font-scale))', maxWidth: 170, overflowWrap: 'anywhere', wordBreak: 'break-word' },
  nodeData: { display: 'inline-block', paddingRight: 8, marginRight: 8, borderRight: '1px solid var(--line)' },
  nodeNext: { color: 'var(--fg-3)' },
  nullNode: { padding: '8px 12px', borderRadius: 8, background: 'color-mix(in oklab, var(--warn) 8%, var(--bg-1))', border: '1px solid color-mix(in oklab, var(--warn) 35%, var(--line))', color: 'var(--fg-0)', fontFamily: 'var(--font-mono)', fontSize: 'calc(12px * var(--app-font-scale))' },
  arrow: { color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', fontSize: 'calc(13px * var(--app-font-scale))' },
  stack: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'calc(6px * var(--app-density-scale))', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)', padding: 'calc(16px * var(--app-density-scale))', marginTop: 'calc(12px * var(--app-density-scale))' },
  stackTop: { width: 220, padding: '9px 12px', borderRadius: 8, background: 'var(--accent-glow)', border: '1px solid var(--accent-soft)', textAlign: 'center', fontFamily: 'var(--font-mono)', overflowWrap: 'anywhere', wordBreak: 'break-word' },
  stackItem: { width: 220, padding: '9px 12px', borderRadius: 8, background: 'var(--bg-2)', border: '1px solid var(--line)', textAlign: 'center', fontFamily: 'var(--font-mono)', overflowWrap: 'anywhere', wordBreak: 'break-word' },
  queue: { display: 'flex', alignItems: 'center', gap: 'calc(8px * var(--app-density-scale))', flexWrap: 'wrap', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)', padding: 'calc(16px * var(--app-density-scale))', marginTop: 'calc(12px * var(--app-density-scale))' },
  queueLabel: { padding: '8px 10px', borderRadius: 8, background: 'var(--accent-glow)', border: '1px solid var(--accent-soft)', color: 'var(--fg-0)', fontSize: 'calc(12px * var(--app-font-scale))', fontFamily: 'var(--font-mono)' },
  queueItem: { minWidth: 54, maxWidth: 160, textAlign: 'center', padding: '9px 12px', borderRadius: 8, background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--fg-0)', fontFamily: 'var(--font-mono)', fontSize: 'calc(12px * var(--app-font-scale))', overflowWrap: 'anywhere', wordBreak: 'break-word' },
  flow: { display: 'flex', alignItems: 'center', gap: 'calc(8px * var(--app-density-scale))', flexWrap: 'wrap', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)', padding: 'calc(16px * var(--app-density-scale))', marginTop: 'calc(12px * var(--app-density-scale))' },
  flowRoot: { padding: '8px 12px', borderRadius: 8, background: 'var(--accent-glow)', border: '1px solid var(--accent-soft)', color: 'var(--fg-0)', fontSize: 'calc(12px * var(--app-font-scale))', maxWidth: 180, overflowWrap: 'anywhere', wordBreak: 'break-word' },
  flowNode: { padding: '8px 12px', borderRadius: 8, background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--fg-0)', fontSize: 'calc(12px * var(--app-font-scale))', maxWidth: 180, overflowWrap: 'anywhere', wordBreak: 'break-word' },
  caption: { margin: '8px 0 0', fontSize: 'calc(12px * var(--app-font-scale))', color: 'var(--fg-3)' },
  sourceGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'calc(12px * var(--app-density-scale))', marginTop: 'calc(10px * var(--app-density-scale))' },
  sourceFigure: { margin: 0, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)', padding: 'calc(10px * var(--app-density-scale))' },
  sourceImg: { width: '100%', height: 'auto', display: 'block', borderRadius: 6, background: 'var(--bg-0)' },
  sourceLoading: { padding: 'calc(22px * var(--app-density-scale))', textAlign: 'center', color: 'var(--fg-3)', fontSize: 'calc(12px * var(--app-font-scale))' },
  callouts: { display: 'flex', flexDirection: 'column', gap: 'calc(8px * var(--app-density-scale))', marginTop: 'calc(12px * var(--app-density-scale))' },
  callout: { borderLeft: '3px solid var(--accent)', background: 'var(--bg-1)', padding: '9px 11px', fontSize: 'calc(12.5px * var(--app-font-scale))', lineHeight: 1.5 },
  sourceBadges: { display: 'inline-flex', gap: 'calc(5px * var(--app-density-scale))', flexWrap: 'wrap', marginLeft: 8, verticalAlign: 'middle' },
  sourceBadge: { border: '1px solid var(--line)', borderRadius: 999, padding: '1px 6px', fontSize: 'calc(10.5px * var(--app-font-scale))', color: 'var(--fg-3)', background: 'var(--bg-0)' },
  quiz: { border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)', padding: 'calc(14px * var(--app-density-scale))', marginTop: 'calc(12px * var(--app-density-scale))' },
  quizQ: { fontSize: 'calc(14px * var(--app-font-scale))', color: 'var(--fg-0)', fontWeight: 600, marginBottom: 'calc(10px * var(--app-density-scale))' },
  option: { padding: '8px 10px', background: 'var(--bg-2)', border: '1px solid var(--line-soft)', borderRadius: 6, marginTop: 'calc(6px * var(--app-density-scale))', fontSize: 'calc(12.5px * var(--app-font-scale))' },
  answer: { marginTop: 'calc(10px * var(--app-density-scale))', color: 'var(--ok)', fontSize: 'calc(12.5px * var(--app-font-scale))', fontWeight: 600 },
  explain: { marginTop: 'calc(4px * var(--app-density-scale))', color: 'var(--fg-2)', fontSize: 'calc(12.5px * var(--app-font-scale))', lineHeight: 1.45 },
  chips: { display: 'flex', gap: 'calc(8px * var(--app-density-scale))', flexWrap: 'wrap' },
  chip: { border: '1px solid var(--line)', borderRadius: 999, padding: '5px 9px', fontSize: 'calc(11.5px * var(--app-font-scale))', color: 'var(--fg-2)', background: 'var(--bg-1)' },
  markdown: { minHeight: 420, fontSize: 'calc(14.5px * var(--app-font-scale))', lineHeight: 1.75, color: 'var(--fg-1)' },
};

LessonRenderer.parse = parseLesson;
LessonRenderer.preview = preview;
window.LessonRenderer = LessonRenderer;
