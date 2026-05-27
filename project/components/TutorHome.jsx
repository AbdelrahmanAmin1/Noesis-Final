// Tutor mode chooser. Keeps the original guided Tutor.jsx flow intact.
const TutorHome = ({ onNav }) => {
  const Icon = window.Icon;
  const [mode, setMode] = React.useState(null);
  const [chatConversationId, setChatConversationId] = React.useState(null);
  const [conversations, setConversations] = React.useState([]);
  const [loadingConversations, setLoadingConversations] = React.useState(true);
  const [conversationError, setConversationError] = React.useState('');

  React.useEffect(() => {
    let alive = true;
    setLoadingConversations(true);
    window.NoesisAPI.tutor.chatConversations()
      .then(d => {
        if (!alive) return;
        const list = Array.isArray(d) ? d : (Array.isArray(d.conversations) ? d.conversations : []);
        setConversations(list);
      })
      .catch(e => {
        if (!alive) return;
        setConversationError(e.message || 'Could not load recent chats.');
      })
      .finally(() => {
        if (alive) setLoadingConversations(false);
      });
    return () => { alive = false; };
  }, []);

  const choose = (next) => {
    if (next !== 'chat') setChatConversationId(null);
    setMode(next);
  };

  const openChat = (conversationId = null) => {
    setChatConversationId(conversationId || null);
    setMode('chat');
  };

  if (mode === 'guided') return <window.Tutor onNav={onNav}/>;
  if (mode === 'chat') return <window.TutorChat onNav={onNav} onMode={choose} initialConversationId={chatConversationId}/>;

  const recent = conversations.slice(0, 4);
  const lastConversation = recent[0];

  return (
    <div style={th.page}>
      <window.Topbar title="AI Tutor" crumbs={['Workspace']}/>
      <main style={th.main}>
        <section style={th.hero}>
          <div style={th.avatar}><Icon.Sparkle size={28}/></div>
          <div>
            <div style={th.kicker}>Choose a tutor mode</div>
            <h1 style={th.title}>Learn with structure or ask freely</h1>
            <p style={th.copy}>
              Keep the guided Socratic session for step-by-step practice, or open a grounded chat for direct questions about your materials.
            </p>
            {lastConversation && (
              <button style={th.continueButton} onClick={() => openChat(lastConversation.id)}>
                <Icon.Play size={13}/>
                Continue last chat
              </button>
            )}
          </div>
        </section>

        <div style={th.grid}>
          <ModeCard
            icon={<Icon.Target size={22}/>}
            title="Guided Session"
            desc="A focused five-step tutor flow with warmup, intuition, trick, formalization, and practice."
            action="Start guided"
            onClick={() => choose('guided')}
          />
          <ModeCard
            icon={<Icon.Send size={22}/>}
            title="Free Chat"
            desc="Ask questions in your own words and get grounded answers with source excerpts from your uploaded material."
            action="Open chat"
            accent
            onClick={() => openChat(null)}
          />
        </div>

        <section style={th.recentPanel}>
          <div style={th.recentHeader}>
            <div>
              <div style={th.kicker}>Recent free chats</div>
              <div style={th.recentTitle}>Pick up where you left off</div>
            </div>
            <button className="btn btn-bare" onClick={() => openChat(null)}>
              <Icon.Plus size={12}/> New chat
            </button>
          </div>
          {loadingConversations ? (
            <div style={th.recentEmpty}>Loading recent chats...</div>
          ) : conversationError ? (
            <div style={th.recentEmpty}>{conversationError}</div>
          ) : recent.length === 0 ? (
            <div style={th.recentEmpty}>Your grounded chat history will appear here after the first conversation.</div>
          ) : (
            <div style={th.recentList}>
              {recent.map(c => (
                <button key={c.id} style={th.recentItem} onClick={() => openChat(c.id)}>
                  <div style={th.recentItemMain}>
                    <div style={th.recentItemTitle}>{c.title || 'Tutor chat'}</div>
                    <div style={th.recentItemMeta}>
                      {(c.material_title || 'Core tutor corpus')} · {c.message_count || 0} messages
                    </div>
                  </div>
                  <div style={th.recentTime}>{relativeHomeTime(c.updated_at || c.created_at)}</div>
                  <Icon.ArrowRight size={13}/>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

const ModeCard = ({ icon, title, desc, action, accent, onClick }) => (
  <button onClick={onClick} style={{ ...th.card, ...(accent ? th.cardAccent : {}) }}>
    <div style={{ ...th.cardIcon, ...(accent ? th.cardIconAccent : {}) }}>{icon}</div>
    <div style={th.cardTitle}>{title}</div>
    <div style={th.cardDesc}>{desc}</div>
    <div style={th.cardAction}>
      {action} <window.Icon.ArrowRight size={13}/>
    </div>
  </button>
);

const th = {
  page: { minHeight: '100vh', background: 'var(--bg-0)', color: 'var(--fg-0)' },
  main: { padding: '36px clamp(22px, 5vw, 72px)', maxWidth: 1120, margin: '0 auto' },
  hero: { display: 'grid', gridTemplateColumns: '76px 1fr', gap: 'calc(18px * var(--app-density-scale))', alignItems: 'center', marginBottom: 'calc(24px * var(--app-density-scale))' },
  avatar: {
    width: 76, height: 76, borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--accent-glow)', border: '1px solid var(--accent-soft)', color: 'var(--accent)',
  },
  kicker: { fontSize: 'calc(11px * var(--app-font-scale))', letterSpacing: '0.12em', color: 'var(--fg-3)', textTransform: 'uppercase', marginBottom: 'calc(6px * var(--app-density-scale))' },
  title: { margin: 0, fontFamily: 'var(--font-display)', fontSize: 'clamp(calc(34px * var(--app-font-scale)), 5vw, calc(58px * var(--app-font-scale)))', fontWeight: 300, letterSpacing: 0 },
  copy: { margin: '10px 0 0', maxWidth: 680, color: 'var(--fg-2)', fontSize: 'calc(15px * var(--app-font-scale))', lineHeight: 1.7 },
  continueButton: {
    marginTop: 'calc(16px * var(--app-density-scale))',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'calc(7px * var(--app-density-scale))',
    padding: '9px 12px',
    borderRadius: 999,
    border: '1px solid var(--accent-soft)',
    background: 'var(--accent-glow)',
    color: 'var(--accent)',
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    fontWeight: 600,
  },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'calc(16px * var(--app-density-scale))' },
  card: {
    minHeight: 260, padding: 'calc(22px * var(--app-density-scale))', textAlign: 'left', borderRadius: 'var(--r-md)',
    background: 'var(--bg-1)', border: '1px solid var(--line)', color: 'var(--fg-1)',
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 'calc(12px * var(--app-density-scale))',
    transition: 'transform 180ms var(--ease-out), border-color 180ms var(--ease-out), background 180ms var(--ease-out)',
  },
  cardAccent: { borderColor: 'var(--accent-soft)', background: 'linear-gradient(180deg, var(--accent-glow), var(--bg-1) 58%)' },
  cardIcon: {
    width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--fg-1)',
  },
  cardIconAccent: { color: 'var(--accent)', borderColor: 'var(--accent-soft)', background: 'var(--accent-glow)' },
  cardTitle: { fontFamily: 'var(--font-display)', fontSize: 'calc(26px * var(--app-font-scale))', color: 'var(--fg-0)' },
  cardDesc: { color: 'var(--fg-2)', fontSize: 'calc(13.5px * var(--app-font-scale))', lineHeight: 1.65, maxWidth: 420 },
  cardAction: { marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 'calc(6px * var(--app-density-scale))', color: 'var(--accent)', fontSize: 'calc(12.5px * var(--app-font-scale))', fontWeight: 600 },
  recentPanel: { marginTop: 'calc(18px * var(--app-density-scale))', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', background: 'var(--bg-1)', overflow: 'hidden' },
  recentHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'calc(12px * var(--app-density-scale))', padding: 'calc(16px * var(--app-density-scale))', borderBottom: '1px solid var(--line)' },
  recentTitle: { fontFamily: 'var(--font-display)', fontSize: 'calc(22px * var(--app-font-scale))', color: 'var(--fg-0)' },
  recentList: { display: 'grid' },
  recentItem: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto auto',
    alignItems: 'center',
    gap: 'calc(12px * var(--app-density-scale))',
    padding: '13px 16px',
    border: 0,
    borderBottom: '1px solid var(--line)',
    background: 'transparent',
    color: 'var(--fg-1)',
    textAlign: 'left',
  },
  recentItemMain: { minWidth: 0 },
  recentItemTitle: { color: 'var(--fg-0)', fontSize: 'calc(13.5px * var(--app-font-scale))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  recentItemMeta: { color: 'var(--fg-3)', fontSize: 'calc(12px * var(--app-font-scale))', marginTop: 'calc(3px * var(--app-density-scale))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  recentTime: { color: 'var(--fg-3)', fontSize: 'calc(11.5px * var(--app-font-scale))', whiteSpace: 'nowrap' },
  recentEmpty: { padding: 'calc(16px * var(--app-density-scale))', color: 'var(--fg-3)', fontSize: 'calc(12.5px * var(--app-font-scale))', lineHeight: 1.6 },
};

function relativeHomeTime(value) {
  if (!value) return 'recently';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 'recently';
  const diff = Math.max(0, Date.now() - time);
  const minute = 60 * 1000;
  if (diff < minute) return 'now';
  if (diff < 60 * minute) return `${Math.floor(diff / minute)}m ago`;
  const hour = 60 * minute;
  if (diff < 24 * hour) return `${Math.floor(diff / hour)}h ago`;
  return `${Math.floor(diff / (24 * hour))}d ago`;
}

window.TutorHome = TutorHome;
