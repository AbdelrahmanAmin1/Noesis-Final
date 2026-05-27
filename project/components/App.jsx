// Main app — routes between all screens
const { useState, useEffect } = React;

const NOESIS_FONT_SCALES = [
  { key: 'small', scale: 0.92 },
  { key: 'default', scale: 1 },
  { key: 'large', scale: 1.12 },
];
const NOESIS_DENSITY_SCALES = [
  { key: 'compact', scale: 0.86 },
  { key: 'default', scale: 1 },
  { key: 'comfortable', scale: 1.14 },
];
const DEFAULT_APPEARANCE = {
  density: 'default',
  fontSize: 'default',
  motion: true,
  reduceTransparency: false,
};

const normalizeAppearanceOption = (value, options, fallback = 'default') => {
  if (typeof value === 'number' || /^\d+$/.test(String(value || ''))) {
    const index = parseInt(value, 10);
    return options[index] ? options[index].key : fallback;
  }
  const raw = String(value || '').trim().toLowerCase();
  return options.some((option) => option.key === raw) ? raw : fallback;
};

const appearanceOptionIndex = (key, options) => Math.max(0, options.findIndex((option) => option.key === key));

const normalizeFontSizeIndex = (value) => {
  return appearanceOptionIndex(normalizeAppearanceOption(value, NOESIS_FONT_SCALES), NOESIS_FONT_SCALES);
};

const normalizeNoesisAppearance = (value = {}) => ({
  density: normalizeAppearanceOption(value.density, NOESIS_DENSITY_SCALES),
  fontSize: normalizeAppearanceOption(value.fontSize, NOESIS_FONT_SCALES),
  motion: value.motion !== false,
  reduceTransparency: value.reduceTransparency === true,
});

const readNoesisAppearance = () => {
  try {
    return normalizeNoesisAppearance({
      density: localStorage.getItem('noesis.density') || DEFAULT_APPEARANCE.density,
      fontSize: localStorage.getItem('noesis.fontSize') || DEFAULT_APPEARANCE.fontSize,
      motion: localStorage.getItem('noesis.motion') !== 'false',
      reduceTransparency: localStorage.getItem('noesis.reduceTrans') === 'true',
    });
  } catch (_) {
    return { ...DEFAULT_APPEARANCE };
  }
};

const sameAppearance = (a, b) => (
  a.density === b.density &&
  a.fontSize === b.fontSize &&
  a.motion === b.motion &&
  a.reduceTransparency === b.reduceTransparency
);

const applyNoesisAppearance = (value = {}) => {
  const appearance = normalizeNoesisAppearance({ ...DEFAULT_APPEARANCE, ...value });
  const fontOption = NOESIS_FONT_SCALES[appearanceOptionIndex(appearance.fontSize, NOESIS_FONT_SCALES)] || NOESIS_FONT_SCALES[1];
  const densityOption = NOESIS_DENSITY_SCALES[appearanceOptionIndex(appearance.density, NOESIS_DENSITY_SCALES)] || NOESIS_DENSITY_SCALES[1];
  const root = document.documentElement;
  root.dataset.density = densityOption.key;
  root.dataset.fontSize = fontOption.key;
  root.dataset.motion = appearance.motion ? 'on' : 'off';
  root.dataset.transparency = appearance.reduceTransparency ? 'reduced' : 'default';
  root.style.setProperty('--app-density-scale', String(densityOption.scale));
  root.style.setProperty('--app-font-scale', String(fontOption.scale));
  root.style.setProperty('--app-base-font-size', `${14 * fontOption.scale}px`);
  try {
    localStorage.setItem('noesis.density', String(appearanceOptionIndex(appearance.density, NOESIS_DENSITY_SCALES)));
    localStorage.setItem('noesis.fontSize', String(appearanceOptionIndex(appearance.fontSize, NOESIS_FONT_SCALES)));
    localStorage.setItem('noesis.motion', String(appearance.motion));
    localStorage.setItem('noesis.reduceTrans', String(appearance.reduceTransparency));
  } catch (_) {}
  return appearance;
};

const applyNoesisFontScale = (value) => {
  const next = applyNoesisAppearance({ ...readNoesisAppearance(), fontSize: normalizeAppearanceOption(value, NOESIS_FONT_SCALES) });
  return appearanceOptionIndex(next.fontSize, NOESIS_FONT_SCALES);
};

window.NoesisAppearance = {
  normalizeFontSizeIndex,
  normalizeAppearance: normalizeNoesisAppearance,
  readAppearance: readNoesisAppearance,
  applyAppearance: applyNoesisAppearance,
  applyFontScale: applyNoesisFontScale,
  fontScales: NOESIS_FONT_SCALES,
  densityScales: NOESIS_DENSITY_SCALES,
};

const initialNoesisAppearance = readNoesisAppearance();
applyNoesisAppearance(initialNoesisAppearance);

class RouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[noesis route error]', error, info);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.route !== this.props.route && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return <RouteErrorFallback route={this.props.route} error={this.state.error} onBack={this.props.onBack}/>;
    }
    return this.props.children;
  }
}

const RouteErrorFallback = ({ route, error, onBack }) => (
  <div style={routeErr.page}>
    <div style={routeErr.eyebrow}>{route}</div>
    <h1 style={routeErr.title}>This screen hit a runtime error.</h1>
    <pre style={routeErr.detail}>{error && (error.message || String(error))}</pre>
    <button className="btn btn-accent" onClick={onBack}>Back to materials</button>
  </div>
);

const App = () => {
  const APP_ROUTES = ['dashboard','materials','material','storyboard','study-plan','tutor','notes','flashcards','quiz','progress','community','room','settings'];
  const [route, setRoute] = useState(localStorage.getItem('noesis.route') || 'landing');
  const [prevRoute, setPrevRoute] = useState(null);
  const [authMode, setAuthMode] = useState('signin');
  const [theme, setTheme] = useState(localStorage.getItem('noesis.theme') || 'dark');
  const [appearance, setAppearanceState] = useState(() => initialNoesisAppearance);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [authState, setAuthState] = useState('checking');
  // Show splash only on fresh session (not on every route change). Skip if ?nosplash.
  const splashSeen = sessionStorage.getItem('noesis.splashSeen');
  const urlSkip = new URLSearchParams(window.location.search).has('nosplash');
  const [splashActive, setSplashActive] = useState(!splashSeen && !urlSkip);

  // Persist
  useEffect(() => { localStorage.setItem('noesis.route', route); }, [route]);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('noesis.theme', theme);
  }, [theme]);
  useEffect(() => {
    const normalized = applyNoesisAppearance(appearance);
    if (!sameAppearance(normalized, appearance)) setAppearanceState(normalized);
  }, [appearance]);

  // Auto-logout on 401 from the API helper
  useEffect(() => {
    const onLogout = () => {
      setAuthState('guest');
      setPrevRoute(route);
      setRoute('landing');
      window.scrollTo({ top: 0, behavior: 'instant' });
    };
    window.addEventListener('noesis:logout', onLogout);
    return () => window.removeEventListener('noesis:logout', onLogout);
  }, [route]);

  useEffect(() => {
    let cancelled = false;
    window.NoesisAPI.auth.me().then(() => {
      if (cancelled) return;
      setAuthState('authed');
    }).catch(() => {
      if (cancelled) return;
      setAuthState('guest');
      if (APP_ROUTES.includes(route)) setRoute('landing');
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (authState !== 'guest') return;
    if (APP_ROUTES.includes(route)) setRoute('landing');
  }, [authState, route]);

  // Tweaks protocol
  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === '__activate_edit_mode') setTweaksOpen(true);
      if (e.data?.type === '__deactivate_edit_mode') setTweaksOpen(false);
    };
    window.addEventListener('message', handler);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', handler);
  }, []);

  // ⌘K to jump to tutor
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        goto('tutor');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const goto = (r) => {
    setPrevRoute(route);
    setRoute(r);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const openAuth = (mode = 'signin') => {
    setAuthMode(mode);
    goto('auth');
  };
  const logout = async () => {
    try { await window.NoesisAPI.auth.signout(); } catch (_) {}
    setAuthState('guest');
    goto('landing');
  };
  const setAppearance = (patch) => {
    setAppearanceState((prev) => normalizeNoesisAppearance({
      ...prev,
      ...(typeof patch === 'function' ? patch(prev) : patch),
    }));
  };
  const home = () => goto('landing');
  const onSplashDone = () => {
    sessionStorage.setItem('noesis.splashSeen', '1');
    setSplashActive(false);
  };

  const publicRoutes = ['landing'];
  const bareRoutes = ['auth', 'onboarding', ...publicRoutes];
  const isPublicLanding = publicRoutes.includes(route);
  const showShell = !bareRoutes.includes(route);

  const screens = {
    landing: <window.Landing onEnter={goto} onAuth={openAuth} isAuthed={authState === 'authed'}/>,
    auth: <window.Auth initialMode={authMode} onComplete={(isSignin) => { setAuthState('authed'); goto(isSignin ? 'dashboard' : 'onboarding'); }} onBack={() => goto('landing')}/>,
    onboarding: <window.Onboarding onComplete={() => goto('dashboard')}/>,
    dashboard: <window.Dashboard onNav={goto}/>,
    materials: <window.Materials onNav={(r) => goto(r === 'material' ? 'material' : r)}/>,
    material: <window.MaterialDetail onNav={goto}/>,
    storyboard: <window.StoryboardReview onNav={goto}/>,
    'study-plan': <window.StudyPlan onNav={goto}/>,
    tutor: <window.TutorHome onNav={goto}/>,
    notes: <window.Notes onNav={goto}/>,
    flashcards: <window.Flashcards onNav={goto}/>,
    quiz: <window.Quiz onNav={goto}/>,
    progress: <window.Progress onNav={goto}/>,
    community: <window.Community onNav={goto}/>,
    room: <window.RoomDetail onNav={goto}/>,
    settings: <window.Settings theme={theme} setTheme={setTheme} appearance={appearance} setAppearance={setAppearance} onLogout={logout}/>,
  };
  const activeScreen = screens[route] || screens.dashboard;
  const protectedLoading = APP_ROUTES.includes(route) && authState === 'checking';
  const routedScreen = protectedLoading ? <AppLoading /> : (
    <RouteErrorBoundary route={route} onBack={() => goto('materials')}>
      {activeScreen}
    </RouteErrorBoundary>
  );

  return (
    <div data-screen-label={route} style={{ minHeight: '100vh', background: 'var(--bg-0)', position: 'relative' }}>
      {/* Ambient 3D bg only for the public landing page. */}
      {isPublicLanding && window.Ambient3D && <window.Ambient3D opacity={0.35}/>}

      <div style={{ position: 'relative', zIndex: 1 }}>
        {showShell ? (
          <div style={{ display: 'flex' }}>
            <window.Sidebar current={route} onNav={goto} onSettings={() => goto('settings')} onLogout={logout} onHome={home}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div key={route} className="route-in">
                {routedScreen}
              </div>
            </div>
          </div>
        ) : (
          <div key={route} className="route-in">{routedScreen}</div>
        )}
      </div>

      {tweaksOpen && <TweaksPanel theme={theme} setTheme={setTheme} route={route} setRoute={goto} onClose={() => { setTweaksOpen(false); window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*'); }}/>}

      {splashActive && <window.Splash onDone={onSplashDone}/>}
    </div>
  );
};

const AppLoading = () => (
  <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-3)', fontSize: 'calc(13px * var(--app-font-scale))' }}>
    Checking your session...
  </div>
);

const routeErr = {
  page: { minHeight: '100vh', padding: 'calc(40px * var(--app-density-scale))', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 'calc(14px * var(--app-density-scale))', color: 'var(--fg-0)', maxWidth: 720 },
  eyebrow: { fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--accent)', letterSpacing: '0.12em', textTransform: 'uppercase' },
  title: { fontFamily: 'var(--font-display)', fontSize: 'calc(34px * var(--app-font-scale))', fontWeight: 300, margin: 0 },
  detail: { maxWidth: '100%', whiteSpace: 'pre-wrap', color: 'var(--err)', background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, padding: 'calc(12px * var(--app-density-scale))', fontSize: 'calc(12px * var(--app-font-scale))' },
};

const TweaksPanel = ({ theme, setTheme, route, setRoute, onClose }) => {
  const Icon = window.Icon;
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 100,
      width: 280, padding: 'calc(18px * var(--app-density-scale))', borderRadius: 'var(--r-lg)',
      background: 'var(--bg-1)', border: '1px solid var(--line)',
      boxShadow: 'var(--shadow-lg)',
      color: 'var(--fg-0)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'calc(14px * var(--app-density-scale))' }}>
        <div style={{ fontSize: 'calc(13px * var(--app-font-scale))', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 'calc(6px * var(--app-density-scale))' }}>
          <Icon.Sparkle size={13} style={{ color: 'var(--accent)' }}/> Tweaks
        </div>
        <button onClick={onClose} className="btn btn-bare" style={{ padding: 'calc(4px * var(--app-density-scale))' }}><Icon.X size={13}/></button>
      </div>

      <div style={{ fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'calc(8px * var(--app-density-scale))' }}>Theme</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'calc(6px * var(--app-density-scale))', marginBottom: 'calc(18px * var(--app-density-scale))' }}>
        {[
          { id: 'dark', label: 'Cosmic', gradient: 'linear-gradient(135deg, #08081a 0%, #a5b4fc 140%)' },
          { id: 'studious', label: 'Studious', gradient: 'linear-gradient(135deg, #131210 0%, #c9a96a 140%)' },
          { id: 'light', label: 'Refined', gradient: 'linear-gradient(135deg, #fbf9f3, #6b7f5a 140%)' },
          { id: 'space', label: 'Violet', gradient: 'linear-gradient(135deg, #0a0a18, #c99afc 140%)' },
        ].map(t => (
          <button key={t.id} onClick={() => setTheme(t.id)} style={{
            padding: 'calc(8px * var(--app-density-scale))', borderRadius: 'var(--r-sm)',
            border: '1px solid ' + (theme === t.id ? 'var(--accent-soft)' : 'var(--line)'),
            background: 'var(--bg-2)',
            display: 'flex', flexDirection: 'column', gap: 'calc(6px * var(--app-density-scale))', alignItems: 'center',
          }}>
            <div style={{ width: '100%', height: 28, borderRadius: 4, background: t.gradient }}/>
            <span style={{ fontSize: 'calc(10.5px * var(--app-font-scale))', color: theme === t.id ? 'var(--fg-0)' : 'var(--fg-2)' }}>{t.label}</span>
          </button>
        ))}
      </div>

      <div style={{ fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'calc(8px * var(--app-density-scale))' }}>Jump to screen</div>
      <select value={route} onChange={e => setRoute(e.target.value)} className="input" style={{ fontSize: 'calc(12px * var(--app-font-scale))', width: '100%' }}>
        <optgroup label="Public">
          {['landing'].map(r => <option key={r} value={r}>{r}</option>)}
        </optgroup>
        <optgroup label="Auth">
          {['auth','onboarding'].map(r => <option key={r} value={r}>{r}</option>)}
        </optgroup>
        <optgroup label="App">
          {['dashboard','materials','material','storyboard','study-plan','tutor','notes','flashcards','quiz','progress','community','room','settings'].map(r => <option key={r} value={r}>{r}</option>)}
        </optgroup>
      </select>

      <button onClick={() => { sessionStorage.removeItem('noesis.splashSeen'); window.location.reload(); }}
        className="btn btn-ghost" style={{ marginTop: 'calc(12px * var(--app-density-scale))', width: '100%', justifyContent: 'center', fontSize: 'calc(12px * var(--app-font-scale))' }}>
        <Icon.Sparkles size={12}/> Replay splash
      </button>
    </div>
  );
};

const rootEl = document.getElementById('root');
window.__NOESIS_REACT_OWNS_ROOT = true;
ReactDOM.createRoot(rootEl).render(<App/>);
