const MATERIAL_MAP_COLORS = [
  'var(--accent)',
  'var(--accent-2, #c99afc)',
  'var(--accent-3, #6ad0e8)',
  'var(--ok)',
  'var(--warn)',
  '#e889b5',
  '#73c7a3',
];

function clampMapValue(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function materialMapNodeId(node, fallback) {
  return String(node && (node.id || node.label) || fallback || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function findMaterialMapTopic(tree, topic) {
  const target = materialMapNodeId({ label: topic }, '');
  if (!tree || !target) return null;
  const rootId = materialMapNodeId(tree, 'root');
  const matchesTopic = node => materialMapNodeId({ label: node && node.label }, '') === target || materialMapNodeId({ label: node && node.id }, '') === target;
  if (matchesTopic(tree)) return { id: rootId, expandIds: [] };

  for (let branchIndex = 0; branchIndex < (tree.children || []).length; branchIndex += 1) {
    const branch = tree.children[branchIndex];
    const branchId = materialMapNodeId(branch, `branch-${branchIndex}`);
    if (matchesTopic(branch)) return { id: branchId, expandIds: [] };
    for (let childIndex = 0; childIndex < (branch.children || []).length; childIndex += 1) {
      const child = branch.children[childIndex];
      const childId = materialMapNodeId(child, `${branchId}-${childIndex}`);
      if (matchesTopic(child)) return { id: childId, expandIds: [branchId] };
    }
  }
  return null;
}

function materialMapLayout(tree, expanded = {}) {
  if (!tree) return { nodes: [], edges: [], width: 900, height: 620 };
  const rootW = 230, rootH = 84, branchW = 192, branchH = 70, leafW = 164, leafH = 54;
  const branches = tree.children || [];
  const left = [], right = [];
  branches.forEach((branch, index) => (index % 2 === 0 ? right : left).push({ branch, index }));
  const positions = [];
  const edges = [];
  const addSide = (items, side) => {
    const largestExpandedBranch = items.reduce((max, entry) => {
      const id = materialMapNodeId(entry.branch, `branch-${entry.index}`);
      return expanded[id] ? Math.max(max, (entry.branch.children || []).length) : max;
    }, 0);
    const gap = Math.max(items.length > 3 ? 154 : 182, largestExpandedBranch ? largestExpandedBranch * 76 + 36 : 0);
    items.forEach((entry, sideIndex) => {
      const branch = entry.branch;
      const branchId = materialMapNodeId(branch, `branch-${entry.index}`);
      const branchY = (sideIndex - (items.length - 1) / 2) * gap;
      const branchX = side * 310;
      positions.push({ id: branchId, node: branch, x: branchX, y: branchY, w: branchW, h: branchH, depth: 1, colorIndex: entry.index });
      edges.push({ from: materialMapNodeId(tree, 'root'), to: branchId, colorIndex: entry.index, depth: 1 });
      if (!expanded[branchId]) return;
      const children = (branch.children || []).slice(0, 5);
      const childGap = children.length > 3 ? 66 : 76;
      children.forEach((child, childIndex) => {
        const childId = materialMapNodeId(child, `${branchId}-${childIndex}`);
        const childY = branchY + (childIndex - (children.length - 1) / 2) * childGap;
        const childX = side * 610;
        positions.push({ id: childId, node: child, x: childX, y: childY, w: leafW, h: leafH, depth: 2, colorIndex: entry.index });
        edges.push({ from: branchId, to: childId, colorIndex: entry.index, depth: 2 });
      });
    });
  };
  const rootId = materialMapNodeId(tree, 'root');
  positions.push({ id: rootId, node: tree, x: 0, y: 0, w: rootW, h: rootH, depth: 0, colorIndex: -1 });
  addSide(right, 1);
  addSide(left, -1);

  const pad = 90;
  const minX = Math.min(...positions.map(pos => pos.x - pos.w / 2)) - pad;
  const maxX = Math.max(...positions.map(pos => pos.x + pos.w / 2)) + pad;
  const minY = Math.min(...positions.map(pos => pos.y - pos.h / 2)) - pad;
  const maxY = Math.max(...positions.map(pos => pos.y + pos.h / 2)) + pad;
  const offsetX = -minX;
  const offsetY = -minY;
  positions.forEach(pos => { pos.x += offsetX; pos.y += offsetY; });
  return {
    nodes: positions,
    edges,
    width: Math.max(900, maxX - minX),
    height: Math.max(620, maxY - minY),
  };
}

function materialMapEdgePath(from, to) {
  const direction = to.x >= from.x ? 1 : -1;
  const x1 = from.x + direction * from.w / 2;
  const x2 = to.x - direction * to.w / 2;
  const bend = Math.max(46, Math.abs(x2 - x1) * 0.52);
  return `M ${x1} ${from.y} C ${x1 + direction * bend} ${from.y}, ${x2 - direction * bend} ${to.y}, ${x2} ${to.y}`;
}

const MapControlIcon = ({ type }) => {
  if (type === 'fit') return <svg viewBox="0 0 20 20" width="14" height="14"><path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
  if (type === 'full') return <svg viewBox="0 0 20 20" width="14" height="14"><path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><path d="M7 10h6" stroke="currentColor" strokeWidth="1.3" opacity=".45"/></svg>;
  return null;
};

const MaterialMindMap = ({
  map,
  generationStatus = 'ready',
  busy = false,
  eyebrow = 'Dynamic material map',
  subtitle = 'Explore how the ideas in this upload connect.',
  statusLabel,
  emptyText = 'Building a map from this material...',
  showRegenerate,
  onRegenerate,
  onTutor,
  onQuiz,
  onFlashcards,
  activeTopic = '',
  onNodeSelect,
}) => {
  const Icon = window.Icon;
  const tree = map && map.tree;
  const [expanded, setExpanded] = React.useState({});
  const [selectedId, setSelectedId] = React.useState('');
  const [scale, setScale] = React.useState(0.75);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [fullScreen, setFullScreen] = React.useState(false);
  const viewportRef = React.useRef(null);
  const dragRef = React.useRef(null);
  const layout = React.useMemo(() => materialMapLayout(tree, expanded), [tree, expanded]);
  const byId = React.useMemo(() => new Map(layout.nodes.map(pos => [pos.id, pos])), [layout]);
  const selected = byId.get(selectedId) || null;

  const fitMap = React.useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const nextScale = clampMapValue(Math.min((rect.width - 46) / layout.width, (rect.height - 46) / layout.height), 0.42, 1.15);
    setScale(nextScale);
    setPan({
      x: (rect.width - layout.width * nextScale) / 2,
      y: (rect.height - layout.height * nextScale) / 2,
    });
  }, [layout.width, layout.height, fullScreen]);

  React.useEffect(() => {
    const timer = setTimeout(fitMap, 0);
    const viewport = viewportRef.current;
    const observer = viewport && window.ResizeObserver ? new ResizeObserver(fitMap) : null;
    if (observer && viewport) observer.observe(viewport);
    return () => { clearTimeout(timer); if (observer) observer.disconnect(); };
  }, [fitMap]);

  React.useEffect(() => {
    if (!tree) return;
    const first = (tree.children || [])[0];
    setSelectedId(materialMapNodeId(first || tree, 'root'));
    setExpanded(first ? { [materialMapNodeId(first, 'first-branch')]: true } : {});
  }, [tree && tree.id, map && map.generatedAt]);

  React.useEffect(() => {
    const match = findMaterialMapTopic(tree, activeTopic);
    if (!match) return;
    if (match.expandIds.length) {
      setExpanded(current => {
        const next = { ...current };
        match.expandIds.forEach(id => { next[id] = true; });
        return next;
      });
    }
    setSelectedId(match.id);
  }, [tree, activeTopic]);

  React.useEffect(() => {
    if (!fullScreen) return undefined;
    const onKey = event => { if (event.key === 'Escape') setFullScreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullScreen]);

  const changeZoom = React.useCallback((next, anchor) => {
    const viewport = viewportRef.current;
    const rect = viewport && viewport.getBoundingClientRect();
    const nextScale = clampMapValue(next, 0.4, 1.65);
    const point = anchor || { x: rect ? rect.width / 2 : 0, y: rect ? rect.height / 2 : 0 };
    setPan(current => ({
      x: point.x - ((point.x - current.x) / scale) * nextScale,
      y: point.y - ((point.y - current.y) / scale) * nextScale,
    }));
    setScale(nextScale);
  }, [scale]);

  const onWheel = event => {
    event.preventDefault();
    const rect = viewportRef.current.getBoundingClientRect();
    const factor = event.deltaY > 0 ? 0.9 : 1.1;
    changeZoom(scale * factor, { x: event.clientX - rect.left, y: event.clientY - rect.top });
  };

  const onPointerDown = event => {
    if (event.button !== 0) return;
    dragRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y, moved: false };
    event.currentTarget.setPointerCapture && event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = event => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    setPan({ x: drag.panX + dx, y: drag.panY + dy });
  };

  const stopDragging = () => { dragRef.current = null; };
  const selectNode = (pos) => {
    setSelectedId(pos.id);
    if (onNodeSelect) onNodeSelect(pos.node);
  };
  const toggleBranch = (id, event) => {
    event.stopPropagation();
    setExpanded(current => ({ ...current, [id]: !current[id] }));
  };
  const mode = map && map.generation && map.generation.mode;
  const statusText = generationStatus === 'refining'
    ? 'AI refining...'
    : (statusLabel || (mode === 'ai' ? 'AI refined' : mode === 'curriculum' ? 'Curriculum path' : 'Source built'));
  const canRegenerate = showRegenerate == null ? !!onRegenerate : !!showRegenerate;

  if (!tree) {
    return <section style={mm.shell}>
      <div style={mm.empty}><Icon.Tree size={22}/><div>{emptyText}</div></div>
    </section>;
  }

  const content = (
    <section style={{ ...mm.shell, ...(fullScreen ? mm.fullShell : {}) }} aria-label="Interactive material mind map">
      <header style={mm.header}>
        <div style={{ minWidth: 0 }}>
          <div style={mm.eyebrow}><Icon.Sparkles size={12}/> {eyebrow}</div>
          <h2 style={mm.title}>{map.rootTopic || tree.label}</h2>
          <div style={mm.sub}>{subtitle}</div>
        </div>
        <div style={mm.headerActions}>
          <span style={{ ...mm.modeChip, ...(generationStatus === 'refining' ? mm.modeChipBusy : {}) }}>
            <span style={mm.liveDot}/>{statusText}
          </span>
          {canRegenerate && <button className="btn btn-bare" disabled={busy || generationStatus === 'refining'} onClick={onRegenerate} style={mm.regenButton}>
            <Icon.RotateCcw size={12}/>{busy ? 'Working...' : 'Regenerate'}
          </button>}
        </div>
      </header>

      <div style={{ ...mm.viewport, ...(fullScreen ? mm.fullViewport : {}) }}
        ref={viewportRef}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
      >
        <div style={mm.aurora}/><div style={mm.grid}/>
        <div style={{ ...mm.world, width: layout.width, height: layout.height, transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}>
          <svg width={layout.width} height={layout.height} style={mm.edges} aria-hidden="true">
            <defs>
              <filter id="materialMapGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>
            {layout.edges.map((edge, index) => {
              const from = byId.get(edge.from), to = byId.get(edge.to);
              if (!from || !to) return null;
              const color = MATERIAL_MAP_COLORS[edge.colorIndex % MATERIAL_MAP_COLORS.length];
              return <g key={`${edge.from}-${edge.to}`}>
                <path d={materialMapEdgePath(from, to)} fill="none" stroke={color} strokeWidth={edge.depth === 1 ? 7 : 4} opacity=".08" filter="url(#materialMapGlow)"/>
                <path className="material-map-edge" d={materialMapEdgePath(from, to)} fill="none" stroke={color} strokeWidth={edge.depth === 1 ? 2.2 : 1.45} opacity={edge.depth === 1 ? .82 : .52} strokeLinecap="round"/>
              </g>;
            })}
          </svg>
          {layout.nodes.map(pos => {
            const node = pos.node;
            const isRoot = pos.depth === 0;
            const isSelected = selectedId === pos.id;
            const hasChildren = pos.depth === 1 && (node.children || []).length > 0;
            const isExpanded = !!expanded[pos.id];
            const color = isRoot ? 'var(--accent)' : MATERIAL_MAP_COLORS[pos.colorIndex % MATERIAL_MAP_COLORS.length];
            return <button
              type="button"
              key={pos.id}
              className="material-map-node"
              onPointerDown={event => event.stopPropagation()}
              onClick={() => selectNode(pos)}
              style={{
                ...mm.node,
                ...(isRoot ? mm.rootNode : pos.depth === 1 ? mm.branchNode : mm.leafNode),
                ...(isSelected ? mm.selectedNode : {}),
                left: pos.x - pos.w / 2,
                top: pos.y - pos.h / 2,
                width: pos.w,
                height: pos.h,
                '--map-node-color': color,
              }}
            >
              {!isRoot && <span style={{ ...mm.nodeDot, background: color, boxShadow: `0 0 12px ${color}` }}/>}
              <span style={mm.nodeText}>{node.label}</span>
              {hasChildren && <span role="button" aria-label={isExpanded ? 'Collapse branch' : 'Expand branch'} onClick={event => toggleBranch(pos.id, event)} style={mm.branchToggle}>
                {isExpanded ? '-' : '+'}
              </span>}
            </button>;
          })}
        </div>

        <div style={mm.controls} onPointerDown={event => event.stopPropagation()}>
          <button aria-label="Zoom out" title="Zoom out" style={mm.control} onClick={() => changeZoom(scale - .12)}>-</button>
          <span style={mm.zoomLabel}>{Math.round(scale * 100)}%</span>
          <button aria-label="Zoom in" title="Zoom in" style={mm.control} onClick={() => changeZoom(scale + .12)}>+</button>
          <span style={mm.controlDivider}/>
          <button aria-label="Fit map" title="Fit map" style={mm.control} onClick={fitMap}><MapControlIcon type="fit"/></button>
          <button aria-label={fullScreen ? 'Exit full screen' : 'Open full screen'} title={fullScreen ? 'Exit full screen' : 'Open full screen'} style={mm.control} onClick={() => setFullScreen(value => !value)}>
            {fullScreen ? <Icon.X size={14}/> : <MapControlIcon type="full"/>}
          </button>
        </div>

        <div style={mm.hint}>Drag to move · Scroll to zoom · Select a concept to study it</div>
      </div>

      {selected && <div style={mm.detail}>
        <div style={mm.detailCopy}>
          <div style={mm.detailMeta}><span style={{ ...mm.detailDot, background: selected.depth === 0 ? 'var(--accent)' : MATERIAL_MAP_COLORS[selected.colorIndex % MATERIAL_MAP_COLORS.length] }}/>{selected.node.relationship || (selected.depth === 0 ? 'Map overview' : 'Grounded concept')}</div>
          <div style={mm.detailTitle}>{selected.node.label}</div>
          <div style={mm.detailText}>{selected.node.summary || selected.node.reason || 'Explore this concept with the tutor or create focused practice.'}</div>
        </div>
        <div style={mm.studyActions}>
          <button className="btn btn-accent" disabled={busy} onClick={() => onTutor && onTutor(selected.node)}><Icon.Sparkle size={12}/> Tutor</button>
          <button className="btn btn-ghost" disabled={busy} onClick={() => onQuiz && onQuiz(selected.node)}><Icon.Target size={12}/> Quiz</button>
          <button className="btn btn-ghost" disabled={busy} onClick={() => onFlashcards && onFlashcards(selected.node)}><Icon.Cards size={12}/> Cards</button>
        </div>
      </div>}
    </section>
  );

  return fullScreen ? <div style={mm.overlay}>{content}</div> : content;
};

const mm = {
  overlay: { position: 'fixed', inset: 0, zIndex: 3000, padding: '18px', background: 'rgba(4,4,14,.88)', backdropFilter: 'blur(18px)' },
  shell: { border: '1px solid var(--line)', borderRadius: 'var(--r-xl)', background: 'linear-gradient(160deg, color-mix(in srgb, var(--bg-1) 94%, var(--accent) 6%), var(--bg-0))', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' },
  fullShell: { height: 'calc(100vh - 36px)', display: 'flex', flexDirection: 'column' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, padding: '18px 18px 14px', borderBottom: '1px solid var(--line-soft)' },
  eyebrow: { display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent)', fontSize: 'calc(10px * var(--app-font-scale))', letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 700 },
  title: { margin: '6px 0 0', fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 'calc(22px * var(--app-font-scale))', lineHeight: 1.08, color: 'var(--fg-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  sub: { marginTop: 5, fontSize: 'calc(11.5px * var(--app-font-scale))', color: 'var(--fg-2)' },
  headerActions: { display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', justifyContent: 'flex-end' },
  modeChip: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 999, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--fg-2)', fontSize: 'calc(10px * var(--app-font-scale))', whiteSpace: 'nowrap' },
  modeChipBusy: { color: 'var(--accent)', borderColor: 'var(--accent-soft)', background: 'var(--accent-glow)' },
  liveDot: { width: 5, height: 5, borderRadius: 99, background: 'var(--accent)', boxShadow: '0 0 9px var(--accent)' },
  regenButton: { display: 'inline-flex', gap: 5, fontSize: 'calc(10.5px * var(--app-font-scale))', whiteSpace: 'nowrap' },
  viewport: { position: 'relative', height: 520, overflow: 'hidden', cursor: 'grab', touchAction: 'none', background: 'linear-gradient(180deg, color-mix(in srgb, var(--bg-0) 93%, var(--accent) 7%), var(--bg-0))', userSelect: 'none' },
  fullViewport: { flex: 1, height: 'auto', minHeight: 420 },
  aurora: { position: 'absolute', inset: '-25%', background: 'radial-gradient(circle at 50% 45%, var(--accent-glow), transparent 28%), radial-gradient(circle at 16% 25%, color-mix(in srgb, var(--accent-2, #c99afc) 12%, transparent), transparent 24%), radial-gradient(circle at 82% 72%, color-mix(in srgb, var(--accent-3, #6ad0e8) 10%, transparent), transparent 26%)', pointerEvents: 'none' },
  grid: { position: 'absolute', inset: 0, opacity: .17, backgroundImage: 'linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)', backgroundSize: '34px 34px', maskImage: 'radial-gradient(circle at center, black, transparent 80%)', pointerEvents: 'none' },
  world: { position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', willChange: 'transform' },
  edges: { position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' },
  node: { position: 'absolute', border: '1px solid var(--line)', color: 'var(--fg-0)', boxSizing: 'border-box', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textAlign: 'center', transition: 'transform 180ms var(--ease-out), box-shadow 180ms var(--ease-out), border-color 180ms var(--ease-out)', zIndex: 2 },
  rootNode: { padding: '12px 18px', borderRadius: 24, borderColor: 'var(--accent-soft)', background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 86%, white 14%), var(--accent))', color: 'var(--bg-0)', boxShadow: '0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent), 0 18px 46px var(--accent-glow)', fontFamily: 'var(--font-display)', fontSize: 'calc(17px * var(--app-font-scale))', fontWeight: 600 },
  branchNode: { padding: '10px 12px', borderRadius: 16, borderColor: 'color-mix(in srgb, var(--map-node-color) 62%, var(--line))', background: 'linear-gradient(145deg, color-mix(in srgb, var(--bg-elev) 88%, var(--map-node-color) 12%), var(--bg-1))', boxShadow: '0 10px 28px rgba(0,0,0,.25)', fontSize: 'calc(12.5px * var(--app-font-scale))', fontWeight: 700 },
  leafNode: { padding: '8px 10px', borderRadius: 13, borderColor: 'color-mix(in srgb, var(--map-node-color) 36%, var(--line))', background: 'color-mix(in srgb, var(--bg-2) 94%, var(--map-node-color) 6%)', fontSize: 'calc(11px * var(--app-font-scale))', fontWeight: 600, color: 'var(--fg-1)' },
  selectedNode: { borderColor: 'var(--map-node-color)', boxShadow: '0 0 0 2px color-mix(in srgb, var(--map-node-color) 30%, transparent), 0 14px 34px rgba(0,0,0,.3)', transform: 'translateY(-2px)' },
  nodeDot: { width: 7, height: 7, borderRadius: 99, flexShrink: 0 },
  nodeText: { minWidth: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', lineHeight: 1.2 },
  branchToggle: { position: 'absolute', right: -7, top: -7, width: 21, height: 21, borderRadius: 99, display: 'grid', placeItems: 'center', border: '1px solid var(--line-strong)', background: 'var(--bg-elev)', color: 'var(--fg-1)', fontSize: 14, boxShadow: 'var(--shadow-sm)' },
  controls: { position: 'absolute', right: 12, top: 12, display: 'flex', alignItems: 'center', gap: 3, padding: 4, border: '1px solid var(--line)', borderRadius: 11, background: 'color-mix(in srgb, var(--bg-elev) 88%, transparent)', backdropFilter: 'blur(12px)', boxShadow: 'var(--shadow-md)', zIndex: 4 },
  control: { width: 29, height: 29, display: 'grid', placeItems: 'center', borderRadius: 7, color: 'var(--fg-1)', background: 'transparent', fontSize: 17 },
  zoomLabel: { minWidth: 35, textAlign: 'center', color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', fontSize: 'calc(9px * var(--app-font-scale))' },
  controlDivider: { width: 1, height: 18, background: 'var(--line)', margin: '0 2px' },
  hint: { position: 'absolute', left: 12, bottom: 10, padding: '5px 8px', borderRadius: 8, background: 'color-mix(in srgb, var(--bg-0) 80%, transparent)', color: 'var(--fg-3)', fontSize: 'calc(9.5px * var(--app-font-scale))', pointerEvents: 'none' },
  detail: { display: 'flex', gap: 18, alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 16px', borderTop: '1px solid var(--line-soft)', background: 'linear-gradient(90deg, color-mix(in srgb, var(--bg-1) 94%, var(--accent) 6%), var(--bg-1))' },
  detailCopy: { minWidth: 0, flex: 1 },
  detailMeta: { display: 'flex', alignItems: 'center', gap: 6, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '.08em', fontSize: 'calc(9px * var(--app-font-scale))' },
  detailDot: { width: 6, height: 6, borderRadius: 99 },
  detailTitle: { marginTop: 5, color: 'var(--fg-0)', fontSize: 'calc(14px * var(--app-font-scale))', fontWeight: 700 },
  detailText: { marginTop: 4, color: 'var(--fg-2)', fontSize: 'calc(11.5px * var(--app-font-scale))', lineHeight: 1.45, maxWidth: 620 },
  studyActions: { display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' },
  empty: { minHeight: 420, display: 'grid', placeItems: 'center', alignContent: 'center', gap: 10, color: 'var(--fg-3)', fontSize: 'calc(12px * var(--app-font-scale))' },
};

window.NoesisMaterialMapInternals = { materialMapLayout, materialMapEdgePath, materialMapNodeId, findMaterialMapTopic };
window.MaterialMindMap = MaterialMindMap;
