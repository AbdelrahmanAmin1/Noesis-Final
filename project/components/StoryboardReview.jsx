const StoryboardReview = ({ onNav }) => {
  const Icon = window.Icon;
  const [storyboard, setStoryboard] = React.useState(null);
  const [busy, setBusy] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [video, setVideo] = React.useState(null);
  const id = parseInt(sessionStorage.getItem('noesis.storyboardId') || '0', 10);

  const load = React.useCallback(async () => {
    if (!id) return;
    const d = await window.NoesisAPI.videos.storyboard(id);
    setStoryboard(d.storyboard);
  }, [id]);

  React.useEffect(() => {
    load().catch(e => setStatus(e.message || 'Failed to load storyboard'));
  }, [load]);

  const patchScene = async (scene, patch) => {
    setBusy(scene.id);
    try {
      const d = await window.NoesisAPI.videos.updateScene(id, scene.id, patch);
      setStoryboard(d.storyboard);
      setStatus('Scene updated. Review warnings before approval.');
    } catch (e) {
      setStatus('Update failed: ' + (e.message || 'error'));
    } finally {
      setBusy('');
    }
  };

  const approve = async () => {
    setBusy('approve');
    try {
      const d = await window.NoesisAPI.videos.approveStoryboard(id);
      setStoryboard(d.storyboard);
      setStatus('Storyboard approved. Ready to render.');
    } catch (e) {
      setStatus('Approval failed: ' + (e.message || 'error'));
    } finally {
      setBusy('');
    }
  };

  const render = async () => {
    setBusy('render');
    setStatus('Rendering approved storyboard...');
    try {
      const r = await window.NoesisAPI.videos.renderStoryboard(id);
      if (r.job_id) {
        await window.NoesisAPI.pollJob(r.job_id, {
          intervalMs: 5000,
          timeoutMs: 45 * 60 * 1000,
          onProgress: j => setStatus(j.stage || `Rendering ${j.progress || 0}%...`),
        });
      }
      const file = await window.NoesisAPI.videos.fileBlobUrl(r.video_id);
      setVideo({ id: r.video_id, file });
      setStatus('Video ready.');
    } catch (e) {
      setStatus('Render failed: ' + (e.message || 'error'));
    } finally {
      setBusy('');
    }
  };

  if (!id) {
    return <EmptyStoryboard onNav={onNav} />;
  }
  if (!storyboard) {
    return <div style={sr.loading}>Loading storyboard...</div>;
  }

  const board = storyboard.storyboard || {};
  const scenes = storyboard.scenes || [];
  const warnings = (storyboard.quality && storyboard.quality.storyboard && storyboard.quality.storyboard.warnings) || [];
  return (
    <div>
      <window.Topbar title="Storyboard Review" crumbs={['Videos', board.topic || storyboard.topic || 'Storyboard']}
        right={<>
          <button className="btn btn-ghost" disabled={!!busy} onClick={() => onNav && onNav('material')}><Icon.ArrowLeft size={12}/> Material</button>
          <button className="btn btn-ghost" disabled={!!busy} onClick={approve}><Icon.Check size={12}/> {busy === 'approve' ? 'Approving...' : 'Approve'}</button>
          <button className="btn btn-accent" disabled={!!busy || storyboard.status !== 'approved'} onClick={render}><Icon.Play size={12}/> {busy === 'render' ? 'Rendering...' : 'Render MP4'}</button>
        </>}
      />
      <main style={sr.page}>
        <section style={sr.hero}>
          <div>
            <div style={sr.eyebrow}>Review before rendering</div>
            <h1 style={sr.title}>{board.topic || storyboard.topic}</h1>
            <p style={sr.sub}>Check the teaching goal, narration, code, and visual for each scene before spending time on MP4 rendering.</p>
          </div>
          <div style={sr.statusBox}>
            <span className="chip chip-accent">{storyboard.status}</span>
            <span>{scenes.length} scenes</span>
            <span>{warnings.length} warning{warnings.length === 1 ? '' : 's'}</span>
          </div>
        </section>

        {status && <div style={sr.notice}>{status}</div>}
        {warnings.length > 0 && (
          <div style={sr.warn}>
            <Icon.Target size={14}/>
            <span>{warnings.slice(0, 4).join(' | ')}</span>
          </div>
        )}

        <div style={sr.grid}>
          {scenes.map((row, index) => {
            const scene = row.scene || row;
            return <SceneCard key={scene.id || row.scene_id} index={index} scene={scene} busy={busy === scene.id} onPatch={patchScene}/>;
          })}
        </div>
        {video && (
          <section style={sr.videoBox}>
            <div style={sr.cardTitle}>Rendered video</div>
            <video src={video.file} controls crossOrigin="use-credentials" style={{ width: '100%', borderRadius: 8, marginTop: 10 }}/>
          </section>
        )}
      </main>
    </div>
  );
};

const SceneCard = ({ scene, index, busy, onPatch }) => {
  const [open, setOpen] = React.useState(false);
  const [narration, setNarration] = React.useState(scene.narration || '');
  React.useEffect(() => { setNarration(scene.narration || ''); }, [scene.narration]);
  const warn = scene.qualityWarnings || [];
  return (
    <article style={sr.scene}>
      <div style={sr.sceneHead}>
        <span className="mono" style={sr.sceneNo}>{String(index + 1).padStart(2, '0')}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={sr.sceneTitle}>{scene.title}</h3>
          <div style={sr.sceneMeta}>{scene.type} · {scene.visualTemplate}</div>
        </div>
        <button className="btn btn-bare" onClick={() => setOpen(v => !v)}>{open ? 'Close' : 'Edit'}</button>
      </div>
      <div style={sr.goal}>{scene.teachingGoal}</div>
      <window.TopicVisual template={scene.visualTemplate} data={scene.visualData} code={scene.code} compact />
      {scene.code && scene.code.content && (
        <pre style={sr.code}>{scene.code.content}</pre>
      )}
      <p style={sr.narration}>{scene.narration}</p>
      {warn.length > 0 && <div style={sr.sceneWarn}>{warn.join(', ')}</div>}
      {open && (
        <div style={sr.edit}>
          <label style={sr.label}>Narration</label>
          <textarea value={narration} onChange={e => setNarration(e.target.value)} style={sr.textarea}/>
          <button className="btn btn-accent" disabled={busy} onClick={() => onPatch(scene, { narration })}>{busy ? 'Saving...' : 'Save scene'}</button>
        </div>
      )}
    </article>
  );
};

const EmptyStoryboard = ({ onNav }) => (
  <div style={sr.loading}>
    <div>No storyboard selected.</div>
    <button className="btn btn-accent" onClick={() => onNav && onNav('materials')} style={{ marginTop: 12 }}>Open materials</button>
  </div>
);

const sr = {
  loading: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-2)' },
  page: { padding: 28, maxWidth: 1380, margin: '0 auto' },
  hero: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, marginBottom: 18 },
  eyebrow: { fontSize: 11, color: 'var(--accent)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 },
  title: { fontFamily: 'var(--font-display)', fontSize: 42, fontWeight: 300, margin: 0 },
  sub: { fontSize: 13.5, color: 'var(--fg-2)', maxWidth: 650, lineHeight: 1.6 },
  statusBox: { display: 'flex', alignItems: 'center', gap: 10, color: 'var(--fg-2)', fontSize: 12 },
  notice: { padding: 12, border: '1px solid var(--line)', background: 'var(--bg-1)', borderRadius: 8, color: 'var(--fg-2)', marginBottom: 12 },
  warn: { display: 'flex', gap: 8, alignItems: 'center', padding: 12, border: '1px solid var(--warn)', color: 'var(--warn)', borderRadius: 8, marginBottom: 12 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 },
  scene: { border: '1px solid var(--line)', background: 'var(--bg-1)', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 },
  sceneHead: { display: 'flex', alignItems: 'center', gap: 12 },
  sceneNo: { color: 'var(--accent)', fontSize: 11 },
  sceneTitle: { fontSize: 17, margin: 0, color: 'var(--fg-0)' },
  sceneMeta: { fontSize: 11.5, color: 'var(--fg-3)', marginTop: 3 },
  goal: { fontSize: 12.5, color: 'var(--fg-1)', lineHeight: 1.5, padding: 10, background: 'var(--bg-2)', borderRadius: 8, border: '1px solid var(--line)' },
  narration: { color: 'var(--fg-2)', fontSize: 12.5, lineHeight: 1.65, margin: 0 },
  sceneWarn: { fontSize: 11.5, color: 'var(--warn)' },
  code: { maxHeight: 120, overflow: 'auto', background: '#0f172a', color: '#dbeafe', borderRadius: 8, padding: 12, fontFamily: 'var(--font-mono)', fontSize: 11.5 },
  edit: { display: 'flex', flexDirection: 'column', gap: 8 },
  label: { fontSize: 11, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.1em' },
  textarea: { minHeight: 130, resize: 'vertical', border: '1px solid var(--line)', borderRadius: 8, padding: 12, background: 'var(--bg-0)', color: 'var(--fg-0)', font: 'inherit', lineHeight: 1.55 },
  videoBox: { marginTop: 18, border: '1px solid var(--line)', background: 'var(--bg-1)', borderRadius: 8, padding: 16 },
  cardTitle: { fontSize: 13, color: 'var(--fg-1)', fontWeight: 600 },
};

window.StoryboardReview = StoryboardReview;
