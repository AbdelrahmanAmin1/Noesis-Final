// Logo: uses brand mark; 'ō' glyph in galaxy lens
const Logo = ({ size = 24, showWord = true, onClick }) => (
  <button
    onClick={onClick}
    disabled={!onClick}
    style={{
      display: 'inline-flex', alignItems: 'center', gap: 10, color: 'var(--fg-0)',
      background: 'transparent', padding: 0, cursor: onClick ? 'pointer' : 'default',
    }}
  >
    <img
      src="assets/noesis_logo.webp"
      alt=""
      width={size}
      height={size}
      style={{
        width: size, height: size, objectFit: 'contain',
        filter: 'drop-shadow(0 0 8px var(--accent-glow))',
        transition: 'transform 240ms var(--ease-out), filter 240ms var(--ease-out)',
      }}
      className="logo-img"
    />
    {showWord && (
      <span style={{
        fontFamily: 'var(--font-display)', fontSize: size * 0.82,
        letterSpacing: '-0.015em', fontWeight: 400,
      }}>
        Noēsis
      </span>
    )}
  </button>
);

// Sidebar
const SIDEBAR = [
  { key: 'dashboard', label: 'Today', icon: 'Home' },
  { key: 'materials', label: 'Materials', icon: 'Folder' },
  { key: 'tutor', label: 'AI Tutor', icon: 'Sparkle' },
  { key: 'notes', label: 'Notes', icon: 'PenNib' },
  { key: 'flashcards', label: 'Flashcards', icon: 'Cards' },
  { key: 'quiz', label: 'Quizzes', icon: 'Target' },
  { key: 'progress', label: 'Progress', icon: 'Chart' },
];

const Sidebar = ({ current, onNav, onSettings, onLogout, onHome }) => {
  const Icon = window.Icon;
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [streakDays, setStreakDays] = React.useState(0);
  const [weekBars, setWeekBars] = React.useState([0,0,0,0,0,0,0]);
  const [userName, setUserName] = React.useState('');
  const [userSub, setUserSub] = React.useState('');

  React.useEffect(() => {
    window.NoesisAPI.dashboard.get()
      .then(d => {
        setStreakDays(d.streak_days || 0);
        setWeekBars((d.weekly_hours || [0,0,0,0,0,0,0]).map(h => h > 0 ? 1 : 0));
      })
      .catch(() => {});
    window.NoesisAPI.auth.me()
      .then(d => {
        setUserName((d.user && d.user.name) || '');
        setUserSub((d.prefs && d.prefs.subject) || '');
      })
      .catch(() => {});
  }, []);

  return (
    <aside style={ss.sidebar}>
      <div style={{ padding: '22px 22px 16px' }}>
        <Logo size={22} onClick={onHome}/>
      </div>

      <div style={{ padding: '6px 10px' }}>
        <button style={ss.sbNewBtn} onClick={() => onNav('tutor')}>
          <Icon.Plus size={14} />
          <span>New session</span>
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--fg-3)' }} className="mono">⌘K</span>
        </button>
      </div>

      <nav style={{ padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {SIDEBAR.map(item => {
          const IconCmp = Icon[item.icon];
          const active = current === item.key;
          return (
            <button key={item.key} onClick={() => onNav(item.key)}
              style={{ ...ss.sbItem, ...(active ? ss.sbItemActive : {}) }}>
              <IconCmp size={16} />
              <span>{item.label}</span>
              {active && <span style={ss.sbDot} />}
            </button>
          );
        })}
      </nav>

      <div style={{ marginTop: 'auto', padding: '12px', position: 'relative' }}>
        <div style={ss.streakBox}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, letterSpacing: '0.08em', color: 'var(--fg-3)', textTransform: 'uppercase' }}>Streak</span>
            <Icon.Flame size={12} style={{ color: 'var(--accent)' }}/>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--fg-0)' }}>{streakDays}</span>
            <span style={{ fontSize: 11, color: 'var(--fg-2)' }}>days</span>
          </div>
          <div style={{ display: 'flex', gap: 2, marginTop: 8 }}>
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: weekBars[i] > 0 ? 'var(--accent)' : 'var(--line)' }} />
            ))}
          </div>
        </div>

        <button onClick={onSettings} style={{ ...ss.sbItem, marginTop: 6 }}>
          <Icon.Cog size={16} />
          <span>Settings</span>
        </button>

        <button onClick={() => setMenuOpen(v => !v)} style={ss.profile}>
          <div style={ss.avatar}>{(userName || 'N')[0].toUpperCase()}</div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: 12, color: 'var(--fg-0)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 130 }}>{userName || 'User'}</span>
            <span style={{ fontSize: 10, color: 'var(--fg-3)' }}>{userSub || 'Student'}</span>
          </div>
          <Icon.ChevronRight size={14} style={{ color: 'var(--fg-3)', transform: menuOpen ? 'rotate(90deg)' : 'none', transition: 'transform 160ms var(--ease-out)' }} />
        </button>

        {menuOpen && (
          <div style={ss.menu}>
            <button style={ss.menuItem} onClick={() => { setMenuOpen(false); onSettings(); }}>
              <Icon.Users size={13}/> Profile
            </button>
            <button style={ss.menuItem} onClick={() => { setMenuOpen(false); onSettings(); }}>
              <Icon.Eye size={13}/> Appearance
            </button>
            <div style={{ height: 1, background: 'var(--line)', margin: '4px 0' }}/>
            <button style={{ ...ss.menuItem, color: 'var(--err)' }} onClick={() => { setMenuOpen(false); onLogout && onLogout(); }}>
              <Icon.LogOut size={13}/> Log out
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};

const ss = {
  sidebar: {
    width: 240, background: 'var(--bg-1)',
    borderRight: '1px solid var(--line)',
    display: 'flex', flexDirection: 'column',
    height: '100vh', position: 'sticky', top: 0,
    flexShrink: 0,
  },
  sbNewBtn: {
    display: 'flex', alignItems: 'center', gap: 10,
    width: '100%', padding: '8px 12px',
    borderRadius: 'var(--r-md)',
    background: 'var(--bg-2)', border: '1px solid var(--line)',
    color: 'var(--fg-1)', fontSize: 12.5,
    transition: 'all 160ms var(--ease-out)',
  },
  sbItem: {
    display: 'flex', alignItems: 'center', gap: 10,
    width: '100%', padding: '7px 10px',
    borderRadius: 'var(--r-sm)',
    color: 'var(--fg-2)', fontSize: 13,
    transition: 'all 140ms var(--ease-out)',
    position: 'relative',
  },
  sbItemActive: {
    background: 'var(--bg-2)', color: 'var(--fg-0)',
  },
  sbDot: {
    position: 'absolute', right: 10,
    width: 4, height: 4, borderRadius: 2, background: 'var(--accent)',
  },
  streakBox: {
    padding: '10px 12px',
    background: 'var(--bg-2)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--r-md)',
    color: 'var(--fg-1)',
  },
  profile: {
    display: 'flex', alignItems: 'center', gap: 10,
    width: '100%', padding: '8px',
    borderRadius: 'var(--r-md)',
    background: 'transparent',
    marginTop: 4,
    transition: 'background 140ms var(--ease-out)',
  },
  avatar: {
    width: 28, height: 28, borderRadius: 8,
    background: 'linear-gradient(135deg, var(--accent) 0%, var(--parchment) 100%)',
    color: 'var(--bg-0)', fontSize: 12, fontWeight: 600,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'var(--font-display)',
    flexShrink: 0,
  },
  menu: {
    position: 'absolute', bottom: 'calc(100% - 8px)', left: 12, right: 12,
    background: 'var(--bg-1)', border: '1px solid var(--line)',
    borderRadius: 'var(--r-md)', padding: 4,
    boxShadow: 'var(--shadow-lg)', zIndex: 40,
    animation: 'slideUp 180ms var(--ease-out)',
  },
  menuItem: {
    display: 'flex', alignItems: 'center', gap: 10,
    width: '100%', padding: '8px 10px',
    borderRadius: 'var(--r-sm)',
    fontSize: 12.5, color: 'var(--fg-1)', textAlign: 'left',
    transition: 'background 140ms var(--ease-out)',
  },
};

// Topbar
const Topbar = ({ title, crumbs = [], right = null }) => {
  const Icon = window.Icon;
  return (
    <header style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '14px 28px',
      borderBottom: '1px solid var(--line-soft)',
      background: 'var(--bg-0)',
      position: 'sticky', top: 0, zIndex: 20,
      minHeight: 56,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            <span style={{ fontSize: 12.5, color: 'var(--fg-2)' }}>{c}</span>
            <Icon.ChevronRight size={11} style={{ color: 'var(--fg-3)' }} />
          </React.Fragment>
        ))}
        <span style={{ fontSize: 13, color: 'var(--fg-0)', fontWeight: 500 }}>{title}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {right}
        <button className="btn btn-bare" style={{ padding: 7, opacity: 0.4 }} disabled>
          <Icon.Search size={15} />
        </button>
        <button className="btn btn-bare" style={{ padding: 7, opacity: 0.4 }} disabled>
          <Icon.Bell size={15} />
        </button>
      </div>
    </header>
  );
};

window.Logo = Logo;
window.Sidebar = Sidebar;
window.Topbar = Topbar;
