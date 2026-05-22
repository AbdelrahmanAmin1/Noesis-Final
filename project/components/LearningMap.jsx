const TopicVisual = ({ template = 'learning_map', data = {}, code = null, compact = false }) => {
  const nodes = (data.nodes || []).map(n => typeof n === 'string' ? n : (n.label || n.name || n.id || '')).filter(Boolean);
  const resolved = resolveTopicVisual(template || data.type, `${nodes.join(' ')} ${code && code.content || ''}`);
  if (resolved === 'polymorphism_dispatch') return <DispatchVisual compact={compact} />;
  if (resolved === 'encapsulation_boundary') return <EncapsulationVisual nodes={nodes} compact={compact} />;
  if (resolved === 'class_object' || resolved === 'inheritance_uml') return <UmlVisual nodes={nodes} compact={compact} />;
  if (resolved === 'linked_list_operation') return <LinkedListVisual compact={compact} />;
  if (resolved === 'hash_table_operation') return <HashTableVisual compact={compact} nodes={nodes} />;
  if (resolved === 'stack_operation') return <StackVisual compact={compact} />;
  if (resolved === 'queue_operation') return <QueueVisual compact={compact} />;
  if (resolved === 'tree_visual') return <TreeVisual compact={compact} />;
  if (resolved === 'big_o_growth') return <BigOVisual compact={compact} />;
  if (resolved === 'code_walkthrough' || code) return <CodeVisual code={code} compact={compact} />;
  if (['concept_map', 'learning_objectives', 'summary_path', 'process_flow', 'comparison_contrast'].includes(resolved)) {
    return <MiniMindmap nodes={nodes.length ? nodes : ['Start', 'Prerequisites', 'Core idea', 'Example', 'Practice']} compact={compact} />;
  }
  return <UnsupportedTopicVisual visualType={template || data.type || 'missing'} compact={compact} />;
};

function visualKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9()]+/g, '_').replace(/^_+|_+$/g, '');
}

const TOPIC_VISUALS = {
  encapsulation_boundary: ['encapsulation', 'data_hiding', 'private_fields', 'getter_setter'],
  class_object: ['class_object_visual', 'classes_objects', 'classes_and_objects', 'oop_class_diagram', 'class_diagram', 'uml_class', 'abstraction_contract', 'interface_contract'],
  inheritance_uml: ['inheritance', 'inheritance_visual', 'inheritance_tree', 'extends_uml'],
  polymorphism_dispatch: ['polymorphism', 'polymorphism_visual', 'runtime_dispatch', 'dynamic_dispatch'],
  linked_list_operation: ['linked_list', 'linkedlist', 'linked_list_visual', 'linked_list_operation_visual'],
  stack_operation: ['stack', 'stack_visual', 'stack_queue_stack'],
  queue_operation: ['queue', 'queue_visual', 'stack_queue_queue'],
  hash_table_operation: ['hash_table', 'hashmap', 'hash_map', 'hashing', 'hash_table_visual'],
  tree_visual: ['tree', 'tree_path', 'bst_operation', 'bst_visual', 'binary_search_tree', 'binary_search_tree_visual'],
  big_o_growth: ['big_o', 'big_o_visual', 'bigo_chart', 'complexity_chart', 'time_complexity', 'space_complexity'],
  code_walkthrough: ['code', 'code_visual', 'line_highlight', 'code_example'],
  process_flow: ['flow', 'step_by_step', 'operation_flow', 'algorithm_flow'],
  comparison_contrast: ['comparison', 'compare', 'before_after', 'mistake_correction'],
  learning_objectives: ['objectives'],
  summary_path: ['summary', 'recap', 'summary_visual'],
  concept_map: ['mindmap', 'mind_map', 'learning_map'],
};

const TOPIC_VISUAL_ALIASES = Object.entries(TOPIC_VISUALS).reduce((acc, [canonical, aliases]) => {
  acc[canonical] = canonical;
  aliases.forEach(alias => { acc[alias] = canonical; });
  return acc;
}, {});

function resolveTopicVisual(value, context = '') {
  const key = visualKey(value);
  if (key === 'stack_queue') return /\bqueue|fifo|enqueue|dequeue|front|rear\b/i.test(context) ? 'queue_operation' : 'stack_operation';
  return TOPIC_VISUAL_ALIASES[key] || '';
}

// ---------------------------------------------------------------------------
// Tree layout engine
// ---------------------------------------------------------------------------
function nodeColor(n) {
  if (n.type === 'weak' || n.status === 'weak') return 'var(--err)';
  if (n.status === 'mastered') return 'var(--ok)';
  if (n.type === 'recommended' || n.type === 'root') return 'var(--accent)';
  if (n.status === 'in_progress') return 'var(--warn)';
  return 'var(--fg-3)';
}

function collectVisible(node, expandedSet, depth, list) {
  list.push({ node: node, depth: depth });
  if (depth === 0 || expandedSet[node.id]) {
    (node.children || []).forEach(function(c) {
      collectVisible(c, expandedSet, depth + 1, list);
    });
  }
  return list;
}

function layoutTree(root, expandedSet, cfg) {
  if (!root) return { positions: new Map(), edges: [], bounds: { w: 0, h: 0 } };
  var nw = cfg.nodeWidth, nh = cfg.nodeHeight, lg = cfg.levelGap, sg = cfg.siblingGap;
  var leafNw = Math.round(nw * 0.82);
  var positions = new Map();
  var edges = [];

  function widthOf(node, depth) {
    if (depth >= 2) return leafNw;
    var ch = node.children || [];
    var visibleCh = (depth === 0 || expandedSet[node.id]) ? ch : [];
    if (!visibleCh.length) return nw;
    var total = 0;
    visibleCh.forEach(function(c) { total += widthOf(c, depth + 1) + sg; });
    return Math.max(nw, total - sg);
  }

  function place(node, depth, cx, topY) {
    var w = depth >= 2 ? leafNw : nw;
    var h = depth === 0 ? nh + 8 : (depth >= 2 ? nh - 8 : nh);
    var x = cx - w / 2;
    var y = topY;
    positions.set(node.id, { x: x, y: y, w: w, h: h, cx: cx, depth: depth, node: node });

    var ch = node.children || [];
    var visibleCh = (depth === 0 || expandedSet[node.id]) ? ch : [];
    if (!visibleCh.length) return;

    var childTop = y + h + lg;
    var totalW = 0;
    var childWidths = visibleCh.map(function(c) { var cw = widthOf(c, depth + 1); totalW += cw; return cw; });
    totalW += (visibleCh.length - 1) * sg;
    var startX = cx - totalW / 2;
    var runX = startX;

    visibleCh.forEach(function(c, i) {
      var cw = childWidths[i];
      var childCx = runX + cw / 2;
      place(c, depth + 1, childCx, childTop);
      edges.push({ from: node.id, to: c.id });
      runX += cw + sg;
    });
  }

  var totalW = widthOf(root, 0);
  var startCx = totalW / 2 + 40;
  place(root, 0, startCx, 30);

  var minX = Infinity, maxX = -Infinity, maxY = -Infinity;
  positions.forEach(function(p) {
    if (p.x < minX) minX = p.x;
    if (p.x + p.w > maxX) maxX = p.x + p.w;
    if (p.y + p.h > maxY) maxY = p.y + p.h;
  });
  var pad = 30;
  return {
    positions: positions,
    edges: edges,
    bounds: { w: maxX - minX + pad * 2, h: maxY + pad, ox: minX - pad },
  };
}

function edgePath(pPos, cPos) {
  var x1 = pPos.cx, y1 = pPos.y + pPos.h;
  var x2 = cPos.cx, y2 = cPos.y;
  var gap = Math.max(1, y2 - y1);
  var tangent = Math.max(28, Math.min(96, gap * 0.58));
  var c1y = y1 + tangent;
  var c2y = y2 - tangent;
  return 'M ' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + c1y + ', ' + x2 + ' ' + c2y + ', ' + x2 + ' ' + y2;
}

function isRecommendedEdge(fromId, toId, recSet) {
  var fromIdx = recSet[fromId];
  var toIdx = recSet[toId];
  return !!(fromIdx && toIdx && Math.abs(fromIdx - toIdx) === 1);
}

function offsetPosition(pos, dx, dy) {
  return {
    ...pos,
    x: pos.x + dx,
    y: pos.y + dy,
    cx: pos.cx + dx,
  };
}

function normalizeMapId(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function flattenTreeNodes(node, list) {
  list = list || [];
  if (!node) return list;
  list.push(node);
  (node.children || []).forEach(function(child) {
    flattenTreeNodes(child, list);
  });
  return list;
}

function buildTreeLookup(root) {
  var lookup = {};
  flattenTreeNodes(root).forEach(function(node) {
    var id = node.id || normalizeMapId(node.label);
    if (!id) return;
    lookup[normalizeMapId(id)] = id;
    lookup[normalizeMapId(node.label)] = id;
  });
  return lookup;
}

function buildRecommendedIndex(root, labels) {
  var lookup = buildTreeLookup(root);
  var index = {};
  (labels || []).forEach(function(label, i) {
    var normalized = normalizeMapId(label);
    var id = lookup[normalized] || normalized;
    if (id) index[id] = i + 1;
  });
  return index;
}

function resolveTreeNodeId(root, value) {
  var lookup = buildTreeLookup(root);
  var normalized = normalizeMapId(value);
  return lookup[normalized] || normalized;
}

function findNodePath(node, targetId, path) {
  if (!node) return null;
  var nodeId = node.id || normalizeMapId(node.label);
  var nextPath = (path || []).concat(nodeId);
  if (nodeId === targetId || normalizeMapId(node.label) === targetId) return nextPath;
  var children = node.children || [];
  for (var i = 0; i < children.length; i++) {
    var found = findNodePath(children[i], targetId, nextPath);
    if (found) return found;
  }
  return null;
}

function compactStatusLabel(node) {
  var status = String(node.status || node.type || 'not_started').replace(/_/g, ' ');
  return status === 'not started' ? 'not started' : status;
}

function masteryLabel(node) {
  var mastery = Number(node.mastery || 0);
  if (!Number.isFinite(mastery) || mastery <= 0) return '0%';
  return Math.max(0, Math.min(100, Math.round(mastery))) + '%';
}

const ExpandChevron = ({ expanded }) => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false" style={{ display: 'block' }}>
    <path
      d={expanded ? 'M4 6 L8 10 L12 6' : 'M6 4 L10 8 L6 12'}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// ---------------------------------------------------------------------------
// LearningMap component — hierarchical collapsible mind map
// ---------------------------------------------------------------------------
const LearningMap = ({ map, onNode, compact = false, highlightNode }) => {
  const m = map || {};
  const tree = m.tree || null;
  const nodes = m.nodes || [];
  const start = m.startHere || (nodes[0] && nodes[0].label) || 'Start here';
  const recPath = m.recommendedPath || [];
  const recSet = React.useMemo(function() {
    return buildRecommendedIndex(tree, recPath);
  }, [tree, recPath]);
  const startNodeId = React.useMemo(function() {
    return resolveTreeNodeId(tree, start);
  }, [tree, start]);

  const [expanded, setExpanded] = React.useState({});
  const toggleExpand = React.useCallback(function(nodeId, e) {
    if (e) e.stopPropagation();
    setExpanded(function(prev) {
      var next = {};
      for (var k in prev) next[k] = prev[k];
      next[nodeId] = !prev[nodeId];
      return next;
    });
  }, []);

  // Auto-expand branch containing highlightNode
  React.useEffect(function() {
    if (!highlightNode || !tree) return;
    var targetId = resolveTreeNodeId(tree, highlightNode);
    var path = findNodePath(tree, targetId, []);
    if (!path || path.length < 2) return;
    setExpanded(function(prev) {
      var next = {};
      for (var k in prev) next[k] = prev[k];
      path.forEach(function(id) {
        next[id] = true;
      });
      return next;
    });
  }, [highlightNode, tree]);

  var cfg = compact
    ? { nodeWidth: 108, nodeHeight: 34, levelGap: 42, siblingGap: 10 }
    : { nodeWidth: 160, nodeHeight: 44, levelGap: 70, siblingGap: 18 };

  var effectiveExpanded = compact ? {} : expanded;
  var layout = React.useMemo(function() {
    return layoutTree(tree, effectiveExpanded, cfg);
  }, [tree, effectiveExpanded, compact]);
  var markerIds = React.useMemo(function() {
    var suffix = Math.random().toString(36).slice(2, 9);
    return {
      defaultId: 'lmArrow-' + suffix,
      accentId: 'lmArrowAccent-' + suffix,
    };
  }, []);

  // Fallback: if no tree, render flat nodes in a simple grid
  if (!tree) {
    return (
      <section style={{ ...lm.shell, ...(compact ? lm.compactShell : {}) }}>
        <div style={lm.head}>
          <div>
            <div style={lm.eyebrow}>Learning map</div>
            <h2 style={lm.title}>{m.rootTopic || 'Your path'}</h2>
          </div>
          <div style={lm.startBadge}>Start here: <b>{start}</b></div>
        </div>
        <div style={lm.path}>
          {recPath.slice(0, 7).map(function(p, i) { return <span key={p + i} style={lm.pathChip}>{i + 1}. {p}</span>; })}
        </div>
        <div style={lm.emptyMsg}>Upload material and take a quiz to build your learning map.</div>
      </section>
    );
  }

  var pos = layout.positions;
  var edgeList = layout.edges;
  var bounds = layout.bounds;
  var vbX = bounds.ox || 0;
  var nodeOffsetX = -vbX;
  var vbW = Math.max(bounds.w, compact ? 420 : 720);
  var vbH = Math.max(bounds.h, compact ? 170 : 320);
  var canvasW = Math.ceil(vbW);
  var canvasContentH = Math.ceil(vbH);
  var canvasViewportH = compact ? Math.min(230, canvasContentH) : Math.max(340, canvasContentH);
  var svgViewBox = '0 0 ' + canvasW + ' ' + canvasContentH;

  var highlightId = highlightNode
    ? resolveTreeNodeId(tree, highlightNode)
    : null;

  return (
    <section style={{ ...lm.shell, ...(compact ? lm.compactShell : {}) }}>
      <div style={{ ...lm.head, ...(compact ? lm.compactHead : {}) }}>
        <div>
          <div style={lm.eyebrow}>Learning map</div>
          <h2 style={{ ...lm.title, ...(compact ? lm.compactTitle : {}) }}>{m.rootTopic || 'Your path'}</h2>
        </div>
        <div style={{ ...lm.startBadge, ...(compact ? lm.compactStartBadge : {}) }}>Start here: <b>{start}</b></div>
      </div>
      {!compact && <div style={lm.path}>
        {recPath.slice(0, 7).map(function(p, i) { return <span key={p + i} style={lm.pathChip}>{i + 1}. {p}</span>; })}
      </div>}
      <div style={{ ...lm.canvas, ...(compact ? lm.compactCanvas : {}), height: canvasViewportH }}>
        <div style={{ ...lm.canvasInner, width: canvasW, height: canvasContentH }}>
          <svg viewBox={svgViewBox} preserveAspectRatio="xMidYMin meet"
            width={canvasW} height={canvasContentH} style={lm.edgeSvg}>
            <defs>
              <marker id={markerIds.defaultId} markerWidth="8" markerHeight="8" viewBox="0 0 8 8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                <path d="M1,1 L7,4 L1,7" fill="none" stroke="var(--line-strong)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </marker>
              <marker id={markerIds.accentId} markerWidth="8" markerHeight="8" viewBox="0 0 8 8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                <path d="M1,1 L7,4 L1,7" fill="none" stroke="var(--accent)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </marker>
            </defs>
            {edgeList.map(function(e) {
              var fpRaw = pos.get(e.from);
              var tpRaw = pos.get(e.to);
              if (!fpRaw || !tpRaw) return null;
              var fp = offsetPosition(fpRaw, nodeOffsetX, 0);
              var tp = offsetPosition(tpRaw, nodeOffsetX, 0);
              var isRec = isRecommendedEdge(e.from, e.to, recSet);
              return <path key={e.from + '-' + e.to} d={edgePath(fp, tp)} fill="none"
                stroke={isRec ? 'var(--accent)' : 'var(--line-strong)'}
                strokeWidth={isRec ? 2.1 : 1.45}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={isRec ? 'none' : '5 6'}
                opacity={isRec ? 0.96 : 0.72}
                markerEnd={'url(#' + (isRec ? markerIds.accentId : markerIds.defaultId) + ')'}
              />;
            })}
          </svg>
          <div style={lm.nodeLayer}>
          {Array.from(pos.entries()).map(function(entry) {
            var id = entry[0], p = offsetPosition(entry[1], nodeOffsetX, 0);
            var n = p.node;
            var nodeId = n.id || normalizeMapId(n.label);
            var depth = p.depth;
            var color = nodeColor(n);
            var hasCh = (n.children || []).length > 0;
            var isExp = effectiveExpanded[n.id];
            var isHighlighted = highlightId && highlightId === nodeId;
            var recIdx = recSet[nodeId];
            var isPathNode = !!recIdx;
            var isStart = nodeId === startNodeId;

            if (depth === 0) {
              return <div key={id} style={{
                ...lm.nodeWrap,
                position: 'absolute', left: p.x, top: p.y, width: p.w, height: p.h,
                pointerEvents: 'auto',
              }}>
                <button onClick={function() { onNode && onNode(n); }} style={{
                  ...lm.rootNode,
                  ...(compact ? lm.compactRootNode : {}),
                  width: '100%', height: '100%',
                  animation: (isHighlighted || isPathNode) ? 'glowPulse 2s infinite' : 'none',
                  boxShadow: (isHighlighted || isPathNode) ? '0 0 0 2px var(--accent-soft), 0 12px 28px #00000026' : lm.rootNode.boxShadow,
                }}>
                  <span style={{ ...lm.rootLabel, fontSize: compact ? 14 : 18 }}>
                    {n.label}
                  </span>
                  {recIdx && <span style={lm.recBadge}>{recIdx}</span>}
                  {isStart && <div style={lm.startTag}>Start here &gt;</div>}
                </button>
              </div>;
            }

            if (depth === 1) {
              return <div key={id} style={{
                ...lm.nodeWrap,
                position: 'absolute', left: p.x, top: p.y, width: p.w, height: p.h,
                pointerEvents: 'auto',
                animation: 'fadeIn 400ms ease both',
              }}>
                <button onClick={function() { onNode && onNode(n); }} style={{
                  ...lm.branchNode,
                  ...(compact ? lm.compactBranchNode : {}),
                  borderLeftColor: color,
                  borderColor: color,
                  animation: (isHighlighted || isPathNode) ? 'glowPulse 2s infinite' : 'none',
                  boxShadow: isHighlighted
                    ? '0 0 0 2px var(--accent)'
                    : (isPathNode ? '0 0 0 2px var(--accent-soft), 0 8px 18px #00000016' : '0 2px 8px #00000011'),
                }}>
                  <div style={lm.branchTop}>
                    <span style={{ ...lm.dot, background: color }}/>
                    <span style={{ ...lm.branchTitle, fontSize: compact ? 11.5 : 13 }}>{n.label}</span>
                    {recIdx && <span style={lm.recBadge}>{recIdx}</span>}
                    {!compact && hasCh && <span
                      onClick={function(e) { toggleExpand(n.id, e); }}
                      style={lm.chevron}
                      title={isExp ? 'Collapse branch' : 'Expand branch'}
                      aria-label={isExp ? 'Collapse branch' : 'Expand branch'}
                      role="button"
                    >
                      <ExpandChevron expanded={!!isExp}/>
                      {isExp ? '▼' : '▶'}
                    </span>}
                  </div>
                  {!compact && <div style={lm.branchBottom}>
                    <span style={{ ...lm.statusChip, color: color }}>{compactStatusLabel(n)}</span>
                    {n.mastery > 0 && <div style={lm.masteryBar} aria-hidden="true">
                      <div style={{ ...lm.masteryFill, width: masteryLabel(n), background: color }}/>
                    </div>}
                    {n.mastery > 0 && <span style={lm.masteryLabel}>{masteryLabel(n)}</span>}
                  </div>}
                  {isStart && <div style={lm.startTag}>Start here &gt;</div>}
                </button>
              </div>;
            }

            // depth >= 2: leaf node
            return <div key={id} style={{
              ...lm.nodeWrap,
              position: 'absolute', left: p.x, top: p.y, width: p.w, height: p.h,
              pointerEvents: 'auto',
              animation: 'revealUp 350ms ease both',
            }}>
              <button onClick={function() { onNode && onNode(n); }} style={{
                ...lm.leafNode,
                borderColor: (isHighlighted || isPathNode) ? 'var(--accent)' : 'var(--line)',
                boxShadow: isHighlighted
                  ? '0 0 0 2px var(--accent)'
                  : (isPathNode ? '0 0 0 2px var(--accent-soft)' : 'none'),
                animation: (isHighlighted || isPathNode) ? 'glowPulse 2s infinite' : 'none',
              }}>
                <span style={{ ...lm.dot, background: color, width: 6, height: 6 }}/>
                <span style={lm.leafTitle}>{n.label}</span>
                {recIdx && <span style={lm.recBadge}>{recIdx}</span>}
                {isStart && <div style={lm.startTag}>Start here &gt;</div>}
              </button>
            </div>;
          })}
          </div>
        </div>
      </div>
    </section>
  );
};

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

const EncapsulationVisual = ({ nodes, compact }) => {
  const className = nodes.find(n => /class|counter|account/i.test(n)) || 'Counter';
  const field = nodes.find(n => /private|field|count|balance/i.test(n)) || '- count: int';
  const method = nodes.find(n => /public|method|increment|get|set/i.test(n)) || '+ increment()';
  return <div style={{ ...tv.box, minHeight: compact ? 180 : 260 }}>
    <svg viewBox="0 0 680 270" style={tv.svg}>
      <rect x="260" y="34" width="210" height="190" rx="22" fill="#eff6ff" stroke="#2563eb" strokeWidth="3" strokeDasharray="8 7"/>
      <text x="365" y="66" textAnchor="middle" fontSize="17" fontWeight="800" fill="#0f172a">{className}</text>
      <TextBox x={294} y={88} w={142} h={42} text={field} fill="#fef3c7" stroke="#f59e0b"/>
      <TextBox x={294} y={154} w={142} h={42} text={method} fill="#dcfce7" stroke="#16a34a"/>
      <TextBox x={40} y={82} w={150} h={48} text="client.count = -5" fill="#fee2e2" stroke="#ef4444"/>
      <TextBox x={40} y={154} w={150} h={48} text="client.increment()" fill="#dcfce7" stroke="#16a34a"/>
      <line x1="190" y1="106" x2="294" y2="108" stroke="#ef4444" strokeWidth="4"/>
      <line x1="218" y1="82" x2="252" y2="132" stroke="#ef4444" strokeWidth="6"/><line x1="252" y1="82" x2="218" y2="132" stroke="#ef4444" strokeWidth="6"/>
      <Arrow x1={190} y1={178} x2={294} y2={176} label="allowed"/>
      <text x="365" y="250" textAnchor="middle" fontSize="14" fontWeight="700" fill="#475569">private state, public API</text>
    </svg>
  </div>;
};

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

const HashTableVisual = ({ compact, nodes = [] }) => {
  const key = nodes.find(n => /key/i.test(n)) || 'key "cat"';
  const hash = nodes.find(n => /hash/i.test(n)) || 'hash(key)';
  const index = nodes.find(n => /index|mod/i.test(n)) || 'index = hash mod m';
  const entries = nodes.filter(n => !/key|hash|index|mod|bucket|table|collision|resize/i.test(n)).slice(0, 2);
  const chain = entries.length ? entries : ['(cat, 41)', '(cot, 19)'];
  return <div style={{ ...tv.box, minHeight: compact ? 180 : 250 }}>
    <svg viewBox="0 0 720 260" style={tv.svg}>
      <TextBox x={28} y={24} w={142} h={54} text={key} fill="#dbeafe" stroke="#2563eb"/>
      <TextBox x={236} y={24} w={142} h={54} text={hash} fill="#dcfce7" stroke="#16a34a"/>
      <TextBox x={444} y={24} w={170} h={54} text={index} fill="#fef3c7" stroke="#f59e0b"/>
      <Arrow x1={170} y1={51} x2={236} y2={51}/><Arrow x1={378} y1={51} x2={444} y2={51}/>
      {[0,1,2,3].map(i => <g key={i}>
        <rect x="64" y={104 + i * 34} width="48" height="26" rx="7" fill={i === 2 ? '#dbeafe' : '#ffffff'} stroke={i === 2 ? '#2563eb' : '#94a3b8'} strokeWidth="2"/>
        <text x="88" y={123 + i * 34} textAnchor="middle" fontSize="13" fontWeight="700">{i}</text>
        <rect x="122" y={104 + i * 34} width="120" height="26" rx="7" fill={i === 2 ? '#eff6ff' : '#ffffff'} stroke={i === 2 ? '#2563eb' : '#cbd5e1'} strokeWidth="2"/>
        <text x="182" y={123 + i * 34} textAnchor="middle" fontSize="12" fontWeight="700">{i === 2 ? 'bucket 2' : 'empty'}</text>
      </g>)}
      <Arrow x1={242} y1={181} x2={330} y2={181} label="collision"/>
      {chain.map((item, i) => <g key={item + i}>
        <TextBox x={342 + i * 128} y={150} w={104} h={58} text={item} fill={i === 0 ? '#dcfce7' : '#fee2e2'} stroke={i === 0 ? '#16a34a' : '#ef4444'}/>
        {i < chain.length - 1 && <Arrow x1={446 + i * 128} y1={179} x2={470 + i * 128} y2={179}/>}
      </g>)}
      <text x="360" y="238" textAnchor="middle" fontSize="14" fontWeight="700" fill="#111827">expected O(1), worst O(n), resize by load factor</text>
    </svg>
  </div>;
};

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
    <path d="M70 220 C230 215 380 170 560 40" fill="none" stroke="#ef4444" strokeWidth="4"/><text x="500" y="42" fontSize="14" fontWeight="700">O(n^2)</text>
  </svg>
</div>;

const CodeVisual = ({ code, compact }) => <pre style={{ ...tv.code, maxHeight: compact ? 180 : 260 }}>{code && code.content || 'Code preview appears here.'}</pre>;

const UnsupportedTopicVisual = ({ visualType, compact }) => <div style={{ ...tv.box, minHeight: compact ? 160 : 230, borderColor: '#ef4444', background: '#fff1f2' }}>
  <div style={{ color: '#991b1b', fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Unsupported visual</div>
  <div style={{ color: '#7f1d1d', fontSize: 18, fontWeight: 800 }}>{String(visualType || 'missing')}</div>
  <p style={{ color: '#7f1d1d', fontSize: 13, lineHeight: 1.45 }}>Regenerate this scene with a supported concrete CS visual.</p>
</div>;

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
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' },
  compactHead: { gap: 8 },
  eyebrow: { fontSize: 10.5, color: 'var(--accent)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 },
  title: { fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 26, margin: 0 },
  compactTitle: { fontSize: 19, lineHeight: 1.12 },
  startBadge: { fontSize: 12, color: 'var(--fg-1)', background: 'var(--accent-glow)', border: '1px solid var(--accent-soft)', padding: '6px 10px', borderRadius: 8, whiteSpace: 'nowrap' },
  compactStartBadge: { fontSize: 10.5, padding: '5px 8px', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' },
  path: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  pathChip: { fontSize: 11, color: 'var(--fg-1)', border: '1px solid var(--line)', borderRadius: 999, padding: '4px 8px', background: 'var(--bg-2)' },
  canvas: { position: 'relative', marginTop: 10, overflow: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'thin' },
  compactCanvas: { marginTop: 8, borderTop: '1px solid var(--line-soft)', paddingTop: 6 },
  canvasInner: { position: 'relative', minWidth: 360, minHeight: 170, margin: '0 auto' },
  edgeSvg: { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', pointerEvents: 'none', overflow: 'visible' },
  nodeLayer: { position: 'absolute', inset: 0, pointerEvents: 'none' },
  nodeWrap: { transition: 'left 220ms ease, top 220ms ease, opacity 180ms ease', willChange: 'left, top' },
  emptyMsg: { padding: 28, color: 'var(--fg-3)', fontSize: 13, textAlign: 'center' },
  dot: { width: 8, height: 8, borderRadius: 99, display: 'inline-block', flexShrink: 0 },
  rootNode: {
    width: '100%', border: 'none', borderRadius: 999, background: 'var(--accent)', color: 'var(--bg-0)',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '0 16px',
    position: 'relative', boxShadow: '0 10px 24px #00000022', transition: 'transform 180ms ease, box-shadow 180ms ease',
  },
  compactRootNode: { padding: '0 10px', boxShadow: '0 6px 14px #0000001c' },
  rootLabel: {
    fontFamily: 'var(--font-display)', fontWeight: 500, letterSpacing: '0',
    color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  branchNode: {
    width: '100%', height: '100%', padding: '8px 10px', borderRadius: 10, background: 'var(--bg-0)',
    border: '1px solid var(--line)', borderLeftWidth: 4, cursor: 'pointer', position: 'relative',
    boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, textAlign: 'left',
    transition: 'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease',
  },
  compactBranchNode: { padding: '6px 8px', borderRadius: 8, gap: 0 },
  branchTop: { display: 'flex', alignItems: 'center', gap: 6 },
  branchTitle: {
    fontWeight: 700, color: 'var(--fg-0)', flex: 1, minWidth: 0, lineHeight: 1.18,
    overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
  },
  branchBottom: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 },
  statusChip: { fontSize: 10, textTransform: 'capitalize', fontWeight: 700, whiteSpace: 'nowrap' },
  masteryBar: { flex: 1, height: 4, borderRadius: 2, background: 'var(--bg-2)', overflow: 'hidden' },
  masteryFill: { height: '100%', borderRadius: 2, transition: 'width 0.3s ease' },
  masteryLabel: { fontSize: 10, color: 'var(--fg-3)', fontVariantNumeric: 'tabular-nums' },
  chevron: {
    fontSize: 0, color: 'var(--fg-2)', cursor: 'pointer', padding: 3, borderRadius: 5,
    border: '1px solid var(--line)', background: 'var(--bg-2)', lineHeight: 1, flexShrink: 0,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  },
  recBadge: {
    fontSize: 9, fontWeight: 700, color: 'var(--bg-0)', background: 'var(--accent)',
    borderRadius: 99, width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    boxShadow: '0 0 0 2px var(--bg-0)',
  },
  startTag: {
    position: 'absolute', top: -10, right: 6, fontSize: 9, fontWeight: 800, color: 'var(--accent)',
    background: 'var(--bg-0)', border: '1px solid var(--accent-soft)', padding: '2px 6px', borderRadius: 999,
    boxShadow: '0 4px 12px #00000018', whiteSpace: 'nowrap',
  },
  leafNode: {
    width: '100%', height: '100%', padding: '6px 8px', borderRadius: 8, background: 'var(--bg-2)',
    border: '1px solid var(--line)', cursor: 'pointer', boxSizing: 'border-box', position: 'relative',
    display: 'flex', alignItems: 'center', gap: 6, textAlign: 'left',
    transition: 'border-color 180ms ease, box-shadow 180ms ease',
  },
  leafTitle: {
    fontSize: 11.5, color: 'var(--fg-1)', fontWeight: 600, lineHeight: 1.2, minWidth: 0,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
};

window.NoesisVisualRegistry = {
  resolveTopicVisual,
  supportedVisualTypes: () => Object.keys(TOPIC_VISUALS),
  isSupported: (value, context = '') => !!resolveTopicVisual(value, context),
};
window.TopicVisual = TopicVisual;
window.LearningMap = LearningMap;
