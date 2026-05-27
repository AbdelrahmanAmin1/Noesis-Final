const Community = ({ onNav }) => {
  const Icon = window.Icon;
  const [tab, setTab] = React.useState('leaderboard');
  const tabs = [
    { id: 'leaderboard', label: 'Leaderboard', icon: 'Chart' },
    { id: 'friends', label: 'Friends', icon: 'Users' },
    { id: 'rooms', label: 'Study Rooms', icon: 'Globe' },
  ];

  return (
    <div>
      <window.Topbar title="Community" crumbs={['Social learning']} />
      <div style={cm.page}>
        <section style={cm.hero}>
          <div>
            <div style={cm.eyebrow}>Gamified study</div>
            <h1 style={cm.title}>Study together, keep momentum, and make progress visible.</h1>
          </div>
          <div style={cm.tabBar}>
            {tabs.map(t => {
              const C = Icon[t.icon];
              const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)} style={{ ...cm.tab, ...(active ? cm.tabActive : {}) }}>
                  <C size={13}/> {t.label}
                </button>
              );
            })}
          </div>
        </section>
        {tab === 'leaderboard' && <LeaderboardPanel />}
        {tab === 'friends' && <FriendsPanel />}
        {tab === 'rooms' && <StudyRoomsPanel onNav={onNav} />}
      </div>
    </div>
  );
};

function communityErrorMessage(error, fallback) {
  const code = error && (error.code || error.message);
  const routeMissing = error && error.status === 404 && error.code === 'not_found' && error.data && error.data.path;
  if (routeMissing) return 'Community backend routes are not available. Restart the backend server.';
  if (code === 'room_not_found') return 'Room not found. Check the invite code or refresh rooms.';
  if (code === 'user_not_found') return 'Student not found.';
  if (code === 'already_friends') return 'You are already friends.';
  if (code === 'friend_request_already_pending') return 'A friend request is already pending.';
  if (code === 'room_membership_required') return 'Join this room before viewing or sharing inside it.';
  if (code === 'note_not_found') return 'That note could not be found.';
  if (code === 'quiz_not_found') return 'That quiz could not be found.';
  return (error && error.message) || fallback;
}

const LeaderboardPanel = () => {
  const [scope, setScope] = React.useState('weekly');
  const [rows, setRows] = React.useState([]);
  const [status, setStatus] = React.useState('');

  const load = React.useCallback(async () => {
    setStatus('Loading leaderboard...');
    try {
      const res = scope === 'global'
        ? await window.NoesisAPI.leaderboards.global()
        : scope === 'friends'
          ? await window.NoesisAPI.leaderboards.friends()
          : await window.NoesisAPI.leaderboards.weekly();
      setRows(res.leaderboard || []);
      setStatus('');
    } catch (e) {
      setStatus(communityErrorMessage(e, 'Could not load leaderboard.'));
    }
  }, [scope]);

  React.useEffect(() => { load(); }, [load]);

  return (
    <section className="card" style={cm.card}>
      <div style={cm.cardHead}>
        <div>
          <div style={cm.cardTitle}>Leaderboard</div>
          <div style={cm.muted}>Ranked by XP, with display names only.</div>
        </div>
        <SegmentedCommunity options={['Weekly', 'Global', 'Friends']} value={['weekly','global','friends'].indexOf(scope)} onChange={(i) => setScope(['weekly','global','friends'][i])}/>
      </div>
      {status && <div style={cm.status}>{status}</div>}
      <div style={cm.table}>
        {(rows.length ? rows : []).map(row => (
          <div key={row.user_id} style={{ ...cm.rankRow, ...(row.is_current_user ? cm.rankCurrent : {}) }}>
            <div className="mono" style={cm.rank}>#{row.rank}</div>
            <div style={cm.avatar}>{String(row.display_name || 'N').slice(0, 1).toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={cm.name}>{row.display_name}</div>
              <div style={cm.muted}>Level {row.level} | {row.badges_count} badge{row.badges_count === 1 ? '' : 's'} | {row.streak}d streak</div>
            </div>
            <div className="mono" style={cm.xp}>{row.xp} XP</div>
          </div>
        ))}
        {!rows.length && !status && <EmptyCommunity text="No leaderboard XP yet. Finish a quiz, review cards, or complete a study task." />}
      </div>
    </section>
  );
};

const FriendsPanel = () => {
  const Icon = window.Icon;
  const [friends, setFriends] = React.useState([]);
  const [requests, setRequests] = React.useState({ incoming: [], outgoing: [] });
  const [q, setQ] = React.useState('');
  const [results, setResults] = React.useState([]);
  const [status, setStatus] = React.useState('');

  const load = React.useCallback(async () => {
    try {
      const [f, r] = await Promise.all([
        window.NoesisAPI.friends.list(),
        window.NoesisAPI.friends.requests(),
      ]);
      setFriends(f.friends || []);
      setRequests(r || { incoming: [], outgoing: [] });
    } catch (e) {
      setStatus(communityErrorMessage(e, 'Could not load friends.'));
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const search = async () => {
    if (q.trim().length < 2) return;
    setStatus('Searching...');
    try {
      const res = await window.NoesisAPI.users.search(q.trim());
      setResults(res.users || []);
      setStatus('');
    } catch (e) {
      setStatus(communityErrorMessage(e, 'Search failed.'));
    }
  };

  const send = async (id) => {
    setStatus('Sending request...');
    try {
      await window.NoesisAPI.friends.request(id);
      await load();
      await search();
      setStatus('Friend request sent.');
    } catch (e) {
      setStatus(communityErrorMessage(e, 'Could not send request.'));
    }
  };

  const respond = async (id, accept) => {
    setStatus(accept ? 'Accepting request...' : 'Rejecting request...');
    try {
      if (accept) await window.NoesisAPI.friends.accept(id);
      else await window.NoesisAPI.friends.reject(id);
      await load();
      setStatus('');
    } catch (e) {
      setStatus(communityErrorMessage(e, 'Could not update request.'));
    }
  };

  return (
    <div style={cm.twoCol}>
      <section className="card" style={cm.card}>
        <div style={cm.cardHead}>
          <div>
            <div style={cm.cardTitle}>Find classmates</div>
            <div style={cm.muted}>Search by display name or email. Emails stay private in results.</div>
          </div>
        </div>
        <div style={cm.searchRow}>
          <input className="input" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') search(); }} placeholder="Search students" style={{ flex: 1 }}/>
          <button className="btn btn-accent" onClick={search}><Icon.Search size={12}/> Search</button>
        </div>
        {status && <div style={cm.status}>{status}</div>}
        <div style={cm.list}>
          {results.map(user => (
            <div key={user.user_id} style={cm.personRow}>
              <div style={cm.avatar}>{String(user.display_name || 'N').slice(0, 1).toUpperCase()}</div>
              <div style={{ flex: 1 }}>
                <div style={cm.name}>{user.display_name}</div>
                <div style={cm.muted}>Level {user.level} | {user.relationship || 'none'}</div>
              </div>
              <button className="btn btn-ghost" disabled={user.relationship !== 'none'} onClick={() => send(user.user_id)}>
                {user.relationship === 'none' ? 'Add' : user.relationship}
              </button>
            </div>
          ))}
          {!results.length && <EmptyCommunity text="Search for a classmate to send a friend request." />}
        </div>
      </section>

      <section className="card" style={cm.card}>
        <div style={cm.cardTitle}>Friend requests</div>
        <div style={cm.list}>
          {(requests.incoming || []).map(req => (
            <div key={req.id} style={cm.personRow}>
              <div style={cm.avatar}>{String(req.requester.display_name || 'N').slice(0, 1).toUpperCase()}</div>
              <div style={{ flex: 1 }}>
                <div style={cm.name}>{req.requester.display_name}</div>
                <div style={cm.muted}>Wants to study with you</div>
              </div>
              <button className="btn btn-accent" onClick={() => respond(req.id, true)}>Accept</button>
              <button className="btn btn-bare" onClick={() => respond(req.id, false)}>Reject</button>
            </div>
          ))}
          {!(requests.incoming || []).length && <EmptyCommunity text="No incoming requests." />}
        </div>
        <div style={{ ...cm.cardTitle, marginTop: 'calc(18px * var(--app-density-scale))' }}>Friends</div>
        <div style={cm.list}>
          {friends.map(f => (
            <div key={f.user_id} style={cm.personRow}>
              <div style={cm.avatar}>{String(f.display_name || 'N').slice(0, 1).toUpperCase()}</div>
              <div style={{ flex: 1 }}>
                <div style={cm.name}>{f.display_name}</div>
                <div style={cm.muted}>Level {f.level} | {f.badges_count} badge{f.badges_count === 1 ? '' : 's'}</div>
              </div>
            </div>
          ))}
          {!friends.length && <EmptyCommunity text="Friends will appear here after requests are accepted." />}
        </div>
      </section>
    </div>
  );
};

const StudyRoomsPanel = ({ onNav }) => {
  const Icon = window.Icon;
  const [rooms, setRooms] = React.useState([]);
  const [form, setForm] = React.useState({ name: '', subject: '', room_type: 'public' });
  const [code, setCode] = React.useState('');
  const [status, setStatus] = React.useState('');

  const load = React.useCallback(async () => {
    try {
      const res = await window.NoesisAPI.rooms.list();
      setRooms(res.rooms || []);
    } catch (e) {
      setStatus(communityErrorMessage(e, 'Could not load rooms.'));
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const openRoom = (room) => {
    sessionStorage.setItem('noesis.roomId', String(room.id));
    onNav && onNav('room');
  };

  const create = async () => {
    if (!form.name.trim()) return;
    setStatus('Creating room...');
    try {
      const res = await window.NoesisAPI.rooms.create(form);
      const room = res.room || (res && res.id ? res : null);
      await load();
      if (room) openRoom(room);
      setStatus('');
    } catch (e) {
      setStatus(communityErrorMessage(e, 'Could not create room.'));
    }
  };

  const joinCode = async () => {
    if (!code.trim()) return;
    setStatus('Joining room...');
    try {
      const res = await window.NoesisAPI.rooms.joinByCode(code.trim());
      await load();
      openRoom(res.room);
    } catch (e) {
      setStatus(communityErrorMessage(e, 'Could not join room.'));
    }
  };

  const joinPublic = async (room) => {
    setStatus('Joining room...');
    try {
      const res = await window.NoesisAPI.rooms.join(room.id);
      await load();
      openRoom(res.room || room);
    } catch (e) {
      setStatus(communityErrorMessage(e, 'Could not join room.'));
    }
  };

  return (
    <div style={cm.twoCol}>
      <section className="card" style={cm.card}>
        <div style={cm.cardTitle}>Create a study room</div>
        <div style={cm.formGrid}>
          <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Room name" />
          <input className="input" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="Subject, e.g. Data Structures" />
          <select className="input" value={form.room_type} onChange={e => setForm({ ...form, room_type: e.target.value })}>
            <option value="public">Public</option>
            <option value="invite-only">Invite-only</option>
            <option value="private">Private</option>
          </select>
          <button className="btn btn-accent" onClick={create}><Icon.Plus size={12}/> Create room</button>
        </div>
        <div style={{ ...cm.cardTitle, marginTop: 'calc(22px * var(--app-density-scale))' }}>Join by code</div>
        <div style={cm.searchRow}>
          <input className="input mono" value={code} onChange={e => setCode(e.target.value)} placeholder="Invite code" style={{ flex: 1 }}/>
          <button className="btn btn-ghost" onClick={joinCode}>Join</button>
        </div>
        {status && <div style={cm.status}>{status}</div>}
      </section>

      <section className="card" style={cm.card}>
        <div style={cm.cardHead}>
          <div>
            <div style={cm.cardTitle}>Rooms</div>
            <div style={cm.muted}>Public rooms and rooms you belong to.</div>
          </div>
          <button className="btn btn-bare" onClick={load}>Refresh</button>
        </div>
        <div style={cm.list}>
          {rooms.map(room => (
            <div key={room.id} style={cm.roomRow}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={cm.name}>{room.name}</div>
                <div style={cm.muted}>{room.subject || 'General'} | {room.member_count} member{room.member_count === 1 ? '' : 's'} | {room.room_type}</div>
                {room.user_role && <span className="chip chip-accent" style={{ marginTop: 'calc(8px * var(--app-density-scale))' }}>{room.user_role}</span>}
              </div>
              {room.user_role ? (
                <button className="btn btn-accent" onClick={() => openRoom(room)}>Open</button>
              ) : (
                <button className="btn btn-ghost" onClick={() => joinPublic(room)}>Join</button>
              )}
            </div>
          ))}
          {!rooms.length && <EmptyCommunity text="Create a room or join one by invite code." />}
        </div>
      </section>
    </div>
  );
};

const RoomDetail = ({ onNav }) => {
  const Icon = window.Icon;
  const roomId = parseInt(sessionStorage.getItem('noesis.roomId') || '0', 10);
  const [data, setData] = React.useState(null);
  const [leaderboard, setLeaderboard] = React.useState([]);
  const [notes, setNotes] = React.useState([]);
  const [quizzes, setQuizzes] = React.useState([]);
  const [message, setMessage] = React.useState('');
  const [messageRefresh, setMessageRefresh] = React.useState(0);
  const [status, setStatus] = React.useState('');

  const load = React.useCallback(async () => {
    if (!roomId) { onNav && onNav('community'); return; }
    try {
      const [roomRes, boardRes, notesRes, quizzesRes] = await Promise.all([
        window.NoesisAPI.rooms.get(roomId),
        window.NoesisAPI.rooms.leaderboard(roomId).catch(() => ({ leaderboard: [] })),
        window.NoesisAPI.notes.list().catch(() => ({ notes: [] })),
        window.NoesisAPI.quizzes.list().catch(() => ({ quizzes: [] })),
      ]);
      setData(roomRes);
      setLeaderboard(boardRes.leaderboard || []);
      setNotes(notesRes.notes || []);
      setQuizzes(quizzesRes.quizzes || []);
      setStatus('');
    } catch (e) {
      setStatus(communityErrorMessage(e, 'Could not load room.'));
    }
  }, [roomId]);

  React.useEffect(() => { load(); }, [load]);

  const shareNote = async (id) => {
    setStatus('Sharing note...');
    try { await window.NoesisAPI.rooms.shareNote(roomId, id); await load(); setStatus('Note shared.'); }
    catch (e) { setStatus(communityErrorMessage(e, 'Could not share note.')); }
  };

  const shareQuiz = async (id) => {
    setStatus('Sharing quiz...');
    try { await window.NoesisAPI.rooms.shareQuiz(roomId, id); await load(); setStatus('Quiz shared.'); }
    catch (e) { setStatus(communityErrorMessage(e, 'Could not share quiz.')); }
  };

  const startQuiz = async (shareId) => {
    setStatus('Starting challenge...');
    try {
      const res = await window.NoesisAPI.rooms.startSharedQuiz(roomId, shareId);
      sessionStorage.setItem('noesis.quizId', String(res.quiz_id));
      onNav && onNav('quiz');
    } catch (e) {
      setStatus(communityErrorMessage(e, 'Could not start challenge.'));
    }
  };

  const sendMessage = async () => {
    if (!message.trim()) return;
    setStatus('Posting...');
    try {
      await window.NoesisAPI.rooms.postMessage(roomId, message.trim());
      setMessage('');
      await load();
      setMessageRefresh(v => v + 1);
      setStatus('');
    } catch (e) {
      setStatus(communityErrorMessage(e, 'Could not post message.'));
    }
  };

  const leave = async () => {
    if (!window.confirm('Leave this study room?')) return;
    try {
      await window.NoesisAPI.rooms.leave(roomId);
      sessionStorage.removeItem('noesis.roomId');
      onNav && onNav('community');
    } catch (e) {
      setStatus(communityErrorMessage(e, 'Could not leave room.'));
    }
  };

  const room = data && data.room;
  return (
    <div>
      <window.Topbar title={room ? room.name : 'Study Room'} crumbs={['Community']}
        right={<>
          <button className="btn btn-ghost" onClick={() => onNav && onNav('community')}><Icon.ArrowLeft size={12}/> Community</button>
          {room && <button className="btn btn-bare" onClick={leave}>Leave</button>}
        </>}
      />
      <div style={cm.page}>
        {status && <div style={cm.status}>{status}</div>}
        {!room ? (
          <EmptyCommunity text="Loading room..." />
        ) : (
          <>
            <section style={cm.roomHero}>
              <div>
                <div style={cm.eyebrow}>{room.subject || 'Study room'} | {room.room_type}</div>
                <h1 style={cm.title}>{room.name}</h1>
                <div style={cm.muted}>{room.description || 'A shared space for studying together.'}</div>
              </div>
              <div style={cm.inviteBox}>
                <div style={cm.muted}>Invite code</div>
                <div className="mono" style={cm.inviteCode}>{room.invite_code}</div>
              </div>
            </section>

            <div style={cm.threeCol}>
              <section className="card" style={cm.card}>
                <div style={cm.cardTitle}>Room leaderboard</div>
                <div style={cm.list}>
                  {leaderboard.map(row => (
                    <div key={row.user_id} style={{ ...cm.rankRow, ...(row.is_current_user ? cm.rankCurrent : {}) }}>
                      <div className="mono" style={cm.rank}>#{row.rank}</div>
                      <div style={{ flex: 1 }}>
                        <div style={cm.name}>{row.display_name}</div>
                        <div style={cm.muted}>Level {row.level} | {row.streak}d streak</div>
                      </div>
                      <div className="mono" style={cm.xp}>{row.xp} XP</div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="card" style={cm.card}>
                <div style={cm.cardTitle}>Members</div>
                <div style={cm.list}>
                  {(data.members || []).map(m => (
                    <div key={m.user_id} style={cm.personRow}>
                      <div style={cm.avatar}>{String(m.display_name || 'N').slice(0, 1).toUpperCase()}</div>
                      <div style={{ flex: 1 }}>
                        <div style={cm.name}>{m.display_name}</div>
                        <div style={cm.muted}>{m.role} | Level {m.level}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="card" style={cm.card}>
                <div style={cm.cardTitle}>Activity</div>
                <div style={cm.list}>
                  {(data.activity || []).map(a => (
                    <div key={a.id} style={cm.activityRow}>
                      <div style={cm.name}>{a.summary}</div>
                      <div style={cm.muted}>{a.display_name} | {new Date(a.created_at).toLocaleString()}</div>
                    </div>
                  ))}
                  {!(data.activity || []).length && <EmptyCommunity text="Room activity will appear here." />}
                </div>
              </section>
            </div>

            <div style={cm.twoCol}>
              <section className="card" style={cm.card}>
                <div style={cm.cardTitle}>Shared notes</div>
                <ShareSelect label="Share note" items={notes} getLabel={n => n.title} onShare={shareNote}/>
                <div style={cm.list}>
                  {(data.shared_notes || []).map(n => (
                    <div key={n.id} style={cm.sharedRow}>
                      <div style={cm.name}>{n.title_snapshot}</div>
                      <div style={cm.muted}>Shared by {n.display_name}</div>
                      <div style={cm.preview}>{String(n.body_md_snapshot || '').slice(0, 160)}</div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="card" style={cm.card}>
                <div style={cm.cardTitle}>Shared quizzes</div>
                <ShareSelect label="Share quiz" items={quizzes} getLabel={q => q.title} onShare={shareQuiz}/>
                <div style={cm.list}>
                  {(data.shared_quizzes || []).map(q => (
                    <div key={q.id} style={cm.sharedRow}>
                      <div style={cm.name}>{q.title_snapshot}</div>
                      <div style={cm.muted}>Shared by {q.display_name} | {(q.metadata && q.metadata.question_count) || 0} questions</div>
                      <button className="btn btn-ghost" onClick={() => startQuiz(q.id)} style={{ marginTop: 'calc(8px * var(--app-density-scale))' }}>Start challenge</button>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <section className="card" style={cm.card}>
              <div style={cm.cardHead}>
                <div>
                  <div style={cm.cardTitle}>Room chat</div>
                  <div style={cm.muted}>Polling-friendly MVP messages.</div>
                </div>
                <button className="btn btn-bare" onClick={() => { load(); setMessageRefresh(v => v + 1); }}>Refresh</button>
              </div>
              <RoomMessages roomId={roomId} refreshKey={messageRefresh} />
              <div style={cm.searchRow}>
                <input className="input" value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sendMessage(); }} placeholder="Post a short study update" style={{ flex: 1 }}/>
                <button className="btn btn-accent" onClick={sendMessage}><Icon.Send size={12}/> Send</button>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
};

const RoomMessages = ({ roomId, refreshKey }) => {
  const [messages, setMessages] = React.useState([]);
  React.useEffect(() => {
    let alive = true;
    window.NoesisAPI.rooms.messages(roomId).then(res => {
      if (alive) setMessages(res.messages || []);
    }).catch(() => {});
    return () => { alive = false; };
  }, [roomId, refreshKey]);
  return (
    <div style={cm.messages}>
      {messages.map(m => (
        <div key={m.id} style={cm.messageBubble}>
          <div style={cm.muted}>{m.display_name} | {new Date(m.created_at).toLocaleTimeString()}</div>
          <div style={{ fontSize: 'calc(13px * var(--app-font-scale))', color: 'var(--fg-0)', marginTop: 'calc(4px * var(--app-density-scale))' }}>{m.body}</div>
        </div>
      ))}
      {!messages.length && <EmptyCommunity text="No messages yet." />}
    </div>
  );
};

const ShareSelect = ({ label, items, getLabel, onShare }) => {
  const [selected, setSelected] = React.useState('');
  return (
    <div style={cm.searchRow}>
      <select className="input" value={selected} onChange={e => setSelected(e.target.value)} style={{ flex: 1 }}>
        <option value="">{label}</option>
        {(items || []).map(item => <option key={item.id} value={item.id}>{getLabel(item)}</option>)}
      </select>
      <button className="btn btn-ghost" disabled={!selected} onClick={() => onShare && onShare(parseInt(selected, 10))}>Share</button>
    </div>
  );
};

const SegmentedCommunity = ({ options, value, onChange }) => (
  <div style={cm.segmented}>
    {options.map((opt, i) => (
      <button key={opt} onClick={() => onChange && onChange(i)} style={{ ...cm.segment, ...(i === value ? cm.segmentActive : {}) }}>{opt}</button>
    ))}
  </div>
);

const EmptyCommunity = ({ text }) => (
  <div style={cm.empty}>{text}</div>
);

const cm = {
  page: { padding: 'calc(28px * var(--app-density-scale))', maxWidth: 1440, margin: '0 auto' },
  hero: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 'calc(18px * var(--app-density-scale))', marginBottom: 'calc(18px * var(--app-density-scale))' },
  roomHero: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 220px', gap: 'calc(18px * var(--app-density-scale))', alignItems: 'stretch', marginBottom: 'calc(14px * var(--app-density-scale))' },
  eyebrow: { fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--accent)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 'calc(8px * var(--app-density-scale))' },
  title: { fontFamily: 'var(--font-display)', fontSize: 'calc(40px * var(--app-font-scale))', fontWeight: 300, letterSpacing: 0, margin: 0, maxWidth: 780 },
  tabBar: { display: 'flex', gap: 'calc(5px * var(--app-density-scale))', padding: 'calc(3px * var(--app-density-scale))', borderRadius: 'var(--r-md)', border: '1px solid var(--line)', background: 'var(--bg-1)' },
  tab: { display: 'inline-flex', alignItems: 'center', gap: 'calc(7px * var(--app-density-scale))', padding: '8px 11px', borderRadius: 7, color: 'var(--fg-2)', fontSize: 'calc(12.5px * var(--app-font-scale))' },
  tabActive: { background: 'var(--bg-2)', color: 'var(--fg-0)' },
  card: { padding: 'calc(20px * var(--app-density-scale))', marginBottom: 'calc(14px * var(--app-density-scale))' },
  cardHead: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'calc(14px * var(--app-density-scale))', marginBottom: 'calc(14px * var(--app-density-scale))' },
  cardTitle: { fontSize: 'calc(13px * var(--app-font-scale))', color: 'var(--fg-0)', fontWeight: 500 },
  muted: { fontSize: 'calc(11.5px * var(--app-font-scale))', color: 'var(--fg-3)', lineHeight: 1.5 },
  status: { margin: '10px 0', fontSize: 'calc(12px * var(--app-font-scale))', color: 'var(--fg-2)', padding: 'calc(10px * var(--app-density-scale))', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)' },
  table: { display: 'grid', gap: 'calc(7px * var(--app-density-scale))' },
  rankRow: { display: 'flex', alignItems: 'center', gap: 'calc(12px * var(--app-density-scale))', padding: 'calc(12px * var(--app-density-scale))', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)' },
  rankCurrent: { borderColor: 'var(--accent-soft)', background: 'var(--accent-glow)' },
  rank: { width: 42, color: 'var(--accent)', fontSize: 'calc(12px * var(--app-font-scale))' },
  avatar: { width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, var(--accent), var(--parchment))', color: 'var(--bg-0)', fontFamily: 'var(--font-display)' },
  name: { fontSize: 'calc(13.5px * var(--app-font-scale))', color: 'var(--fg-0)', fontWeight: 500 },
  xp: { color: 'var(--accent)', fontSize: 'calc(12px * var(--app-font-scale))', whiteSpace: 'nowrap' },
  twoCol: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'calc(14px * var(--app-density-scale))' },
  threeCol: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'calc(14px * var(--app-density-scale))' },
  searchRow: { display: 'flex', gap: 'calc(8px * var(--app-density-scale))', alignItems: 'center', marginTop: 'calc(12px * var(--app-density-scale))' },
  list: { display: 'grid', gap: 'calc(8px * var(--app-density-scale))', marginTop: 'calc(14px * var(--app-density-scale))' },
  personRow: { display: 'flex', alignItems: 'center', gap: 'calc(10px * var(--app-density-scale))', padding: 'calc(11px * var(--app-density-scale))', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)' },
  roomRow: { display: 'flex', alignItems: 'center', gap: 'calc(12px * var(--app-density-scale))', padding: 'calc(14px * var(--app-density-scale))', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)' },
  activityRow: { padding: 'calc(11px * var(--app-density-scale))', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)' },
  sharedRow: { padding: 'calc(12px * var(--app-density-scale))', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)' },
  preview: { marginTop: 'calc(8px * var(--app-density-scale))', fontSize: 'calc(12px * var(--app-font-scale))', color: 'var(--fg-2)', lineHeight: 1.5 },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'calc(9px * var(--app-density-scale))', marginTop: 'calc(12px * var(--app-density-scale))' },
  segmented: { display: 'flex', gap: 'calc(4px * var(--app-density-scale))', padding: 'calc(2px * var(--app-density-scale))', background: 'var(--bg-2)', borderRadius: 8, border: '1px solid var(--line)' },
  segment: { padding: '6px 10px', borderRadius: 6, fontSize: 'calc(12px * var(--app-font-scale))', color: 'var(--fg-2)' },
  segmentActive: { background: 'var(--bg-0)', color: 'var(--fg-0)' },
  empty: { padding: 'calc(16px * var(--app-density-scale))', border: '1px dashed var(--line-strong)', borderRadius: 8, color: 'var(--fg-3)', fontSize: 'calc(12.5px * var(--app-font-scale))', textAlign: 'center' },
  inviteBox: { padding: 'calc(18px * var(--app-density-scale))', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)' },
  inviteCode: { marginTop: 'calc(8px * var(--app-density-scale))', fontSize: 'calc(24px * var(--app-font-scale))', color: 'var(--accent)' },
  messages: { display: 'grid', gap: 'calc(8px * var(--app-density-scale))', margin: '12px 0', maxHeight: 260, overflow: 'auto' },
  messageBubble: { padding: 'calc(11px * var(--app-density-scale))', borderRadius: 8, background: 'var(--bg-1)', border: '1px solid var(--line)' },
};

window.Community = Community;
window.RoomDetail = RoomDetail;
