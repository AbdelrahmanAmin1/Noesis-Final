// Main app — routes between all screens
const { useState, useEffect } = React;

const App = () => {
  const APP_ROUTES = ['dashboard','materials','material','tutor','notes','flashcards','quiz','progress','collab','settings'];
  const [route, setRoute] = useState(localStorage.getItem('noesis.route') || 'landing');
  const [prevRoute, setPrevRoute] = useState(null);
  const [theme, setTheme] = useState(localStorage.getItem('noesis.theme') || 'dark');
  const [tweaksOpen, setTweaksOpen] = useState(false);
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

  // Auto-logout on 401 from the API helper
  useEffect(() => {
    const onLogout = () => {
      setPrevRoute(route);
      setRoute('landing');
      window.scrollTo({ top: 0, behavior: 'instant' });
    };
    window.addEventListener('noesis:logout', onLogout);
    return () => window.removeEventListener('noesis:logout', onLogout);
  }, [route]);

  // Boot probe: confirm cookie session against the server before showing app routes.
  useEffect(() => {
    if (!APP_ROUTES.includes(route)) return;
    let cancelled = false;
    window.NoesisAPI.auth.me().then(() => {
      if (cancelled) return;
    }).catch(() => {
      if (cancelled) return;
      setRoute('landing');
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const logout = async () => {
    try { await window.NoesisAPI.auth.signout(); } catch (_) {}
    goto('landing');
  };
  const home = () => goto('landing');
  const onSplashDone = () => {
    sessionStorage.setItem('noesis.splashSeen', '1');
    setSplashActive(false);
  };

  const marketingRoutes = ['landing', 'product', 'students', 'method', 'pricing'];
  const bareRoutes = ['auth', 'onboarding', ...marketingRoutes];
  const isMarketing = marketingRoutes.includes(route);
  const showShell = !bareRoutes.includes(route);

  const screens = {
    landing: <window.Landing onEnter={goto}/>,
    product: <window.ProductPage onEnter={goto}/>,
    students: <window.StudentsPage onEnter={goto}/>,
    method: <window.MethodPage onEnter={goto}/>,
    pricing: <window.PricingPage onEnter={goto}/>,
    auth: <window.Auth onComplete={(isSignin) => goto(isSignin ? 'dashboard' : 'onboarding')} onBack={() => goto('landing')}/>,
    onboarding: <window.Onboarding onComplete={() => goto('dashboard')}/>,
    dashboard: <window.Dashboard onNav={goto}/>,
    materials: <window.Materials onNav={(r) => goto(r === 'material' ? 'material' : r)}/>,
    material: <window.MaterialDetail onNav={goto}/>,
    tutor: <window.Tutor onNav={goto}/>,
    notes: <window.Notes onNav={goto}/>,
    flashcards: <window.Flashcards onNav={goto}/>,
    quiz: <window.Quiz onNav={goto}/>,
    progress: <window.Progress onNav={goto}/>,
    collab: <window.Collab onNav={goto}/>,
    settings: <window.Settings theme={theme} setTheme={setTheme} onLogout={logout}/>,
  };

  return (
    <div data-screen-label={route} style={{ minHeight: '100vh', background: 'var(--bg-0)', position: 'relative' }}>
      {/* Ambient 3D bg only for marketing pages */}
      {isMarketing && window.Ambient3D && <window.Ambient3D opacity={0.35}/>}

      <div style={{ position: 'relative', zIndex: 1 }}>
        {showShell ? (
          <div style={{ display: 'flex' }}>
            <window.Sidebar current={route} onNav={goto} onSettings={() => goto('settings')} onLogout={logout} onHome={home}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div key={route} className="route-in">{screens[route]}</div>
            </div>
          </div>
        ) : (
          <div key={route} className="route-in">{screens[route]}</div>
        )}
      </div>

      {tweaksOpen && <TweaksPanel theme={theme} setTheme={setTheme} route={route} setRoute={goto} onClose={() => { setTweaksOpen(false); window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*'); }}/>}

      {splashActive && <window.Splash onDone={onSplashDone}/>}
    </div>
  );
};

const TweaksPanel = ({ theme, setTheme, route, setRoute, onClose }) => {
  const Icon = window.Icon;
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 100,
      width: 280, padding: 18, borderRadius: 'var(--r-lg)',
      background: 'var(--bg-1)', border: '1px solid var(--line)',
      boxShadow: 'var(--shadow-lg)',
      color: 'var(--fg-0)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon.Sparkle size={13} style={{ color: 'var(--accent)' }}/> Tweaks
        </div>
        <button onClick={onClose} className="btn btn-bare" style={{ padding: 4 }}><Icon.X size={13}/></button>
      </div>

      <div style={{ fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Theme</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, marginBottom: 18 }}>
        {[
          { id: 'dark', label: 'Cosmic', gradient: 'linear-gradient(135deg, #08081a 0%, #a5b4fc 140%)' },
          { id: 'studious', label: 'Studious', gradient: 'linear-gradient(135deg, #131210 0%, #c9a96a 140%)' },
          { id: 'light', label: 'Refined', gradient: 'linear-gradient(135deg, #fbf9f3, #6b7f5a 140%)' },
          { id: 'space', label: 'Violet', gradient: 'linear-gradient(135deg, #0a0a18, #c99afc 140%)' },
        ].map(t => (
          <button key={t.id} onClick={() => setTheme(t.id)} style={{
            padding: 8, borderRadius: 'var(--r-sm)',
            border: '1px solid ' + (theme === t.id ? 'var(--accent-soft)' : 'var(--line)'),
            background: 'var(--bg-2)',
            display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center',
          }}>
            <div style={{ width: '100%', height: 28, borderRadius: 4, background: t.gradient }}/>
            <span style={{ fontSize: 10.5, color: theme === t.id ? 'var(--fg-0)' : 'var(--fg-2)' }}>{t.label}</span>
          </button>
        ))}
      </div>

      <div style={{ fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Jump to screen</div>
      <select value={route} onChange={e => setRoute(e.target.value)} className="input" style={{ fontSize: 12, width: '100%' }}>
        <optgroup label="Marketing">
          {['landing','product','students','method','pricing'].map(r => <option key={r} value={r}>{r}</option>)}
        </optgroup>
        <optgroup label="Auth">
          {['auth','onboarding'].map(r => <option key={r} value={r}>{r}</option>)}
        </optgroup>
        <optgroup label="App">
          {['dashboard','materials','material','tutor','notes','flashcards','quiz','progress','collab','settings'].map(r => <option key={r} value={r}>{r}</option>)}
        </optgroup>
      </select>

      <button onClick={() => { sessionStorage.removeItem('noesis.splashSeen'); window.location.reload(); }}
        className="btn btn-ghost" style={{ marginTop: 12, width: '100%', justifyContent: 'center', fontSize: 12 }}>
        <Icon.Sparkles size={12}/> Replay splash
      </button>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
