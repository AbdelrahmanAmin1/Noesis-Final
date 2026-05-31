// Free-form AI Tutor chat. This is intentionally separate from Tutor.jsx.
const TutorChat = ({ onNav, onMode, initialConversationId = null }) => {
  const Icon = window.Icon;
  const actionChips = [
    { key: 'explain_deeper', label: 'Explain deeper', icon: 'Lightbulb', message: 'Explain the last concept in more depth with an analogy.' },
    { key: 'quiz_me', label: 'Quiz me', icon: 'Target', message: 'Give me a quick quiz question about what we just discussed.' },
    { key: 'summarize', label: 'Summarize', icon: 'Book', message: 'Summarize our conversation so far into key points.' },
    { key: 'give_example', label: 'Give example', icon: 'Code', message: 'Show me a concrete code example for the last topic.' },
    { key: 'compare_concepts', label: 'Compare concepts', icon: 'Shuffle', message: 'Compare this concept with a related one.' },
    { key: 'make_flashcards', label: 'Make flashcards', icon: 'Cards', message: 'Create 3 flashcards from what we discussed.' },
  ];
  const [materials, setMaterials] = React.useState([]);
  const [selectedMaterialId, setSelectedMaterialId] = React.useState(sessionStorage.getItem('noesis.tutorMaterialId') || '');
  const [conversationId, setConversationId] = React.useState(initialConversationId || null);
  const [messages, setMessages] = React.useState([]);
  const [loadingHistory, setLoadingHistory] = React.useState(!!initialConversationId);
  const [input, setInput] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [latestSources, setLatestSources] = React.useState([]);
  const [latestTrace, setLatestTrace] = React.useState(null);
  const [latestGrounding, setLatestGrounding] = React.useState('');
  const [activeSourceIndex, setActiveSourceIndex] = React.useState(null);
  const [sourceRailLabel, setSourceRailLabel] = React.useState('Latest answer');
  const [suggestions, setSuggestions] = React.useState([]);
  const [railOpen, setRailOpen] = React.useState(true);
  const [composerRows, setComposerRows] = React.useState(1);
  const [speechError, setSpeechError] = React.useState('');
  const [muted, setMuted] = React.useState(false);
  const [playingMessageId, setPlayingMessageId] = React.useState(null);
  const [ttsBusyMessageId, setTtsBusyMessageId] = React.useState(null);
  const [audioError, setAudioError] = React.useState('');
  const [viewportWidth, setViewportWidth] = React.useState(window.innerWidth || 1200);
  const [showScrollFab, setShowScrollFab] = React.useState(false);
  const listRef = React.useRef(null);
  const textareaRef = React.useRef(null);
  const audioRef = React.useRef(null);
  const audioUrlRef = React.useRef('');
  const stickToBottomRef = React.useRef(true);

  const readyMaterials = materials.filter(m => m.status === 'ready');
  const selectedMaterial = readyMaterials.find(m => String(m.id) === String(selectedMaterialId));
  const isNarrow = viewportWidth < 900;

  React.useEffect(() => {
    let alive = true;
    window.NoesisAPI.materials.list()
      .then(d => {
        if (!alive) return;
        const next = d.materials || [];
        setMaterials(next);
        const ready = next.filter(m => m.status === 'ready');
        const stored = ready.find(m => String(m.id) === String(selectedMaterialId));
        if (!stored && ready[0]) setSelectedMaterialId(String(ready[0].id));
      })
      .catch(e => {
        if (!alive) return;
        setError(e.message || 'Could not load materials.');
      });
    return () => { alive = false; };
  }, []);

  const scrollToBottom = React.useCallback((smooth = true) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    stickToBottomRef.current = true;
    setShowScrollFab(false);
  }, []);

  const handleMessagesScroll = React.useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
    stickToBottomRef.current = nearBottom;
    setShowScrollFab(!nearBottom);
  }, []);

  React.useEffect(() => {
    if (!listRef.current) return;
    if (stickToBottomRef.current || busy) {
      scrollToBottom(false);
    } else {
      setShowScrollFab(true);
    }
  }, [messages.length, busy, scrollToBottom]);

  React.useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth || 1200);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  React.useEffect(() => {
    if (isNarrow) setRailOpen(false);
  }, [isNarrow]);

  React.useEffect(() => {
    const lines = Math.min(5, Math.max(1, input.split('\n').length));
    setComposerRows(lines);
  }, [input]);

  const materialLabel = (m) => {
    const label = (m && (m.display_title || m.title)) || '';
    if (!label || label === 'Document' || label === 'Material') return m ? `Material #${m.id}` : 'Core tutor corpus';
    return label;
  };

  const renderMarkdown = (text) => {
    const withCitationLinks = String(text || '').replace(/\[Source\s*(\d+)\]/gi, (_, n) => (
      `<a href="#source-${n}" class="source-citation">[Source ${n}]</a>`
    ));
    const html = enhanceCodeBlocks(window.marked ? window.marked.parse(withCitationLinks) : withCitationLinks);
    const safe = window.DOMPurify ? window.DOMPurify.sanitize(html) : html;
    return { __html: safe };
  };

  const groundingTone = (tier) => {
    if (tier === 'strong') return { label: 'Strong grounding', short: 'Strong', color: 'var(--ok)' };
    if (tier === 'moderate') return { label: 'Moderate grounding', short: 'Moderate', color: 'var(--warn)' };
    if (tier === 'weak') return { label: 'Weak grounding', short: 'Weak', color: 'var(--err)' };
    return { label: 'Grounding pending', short: 'Pending', color: 'var(--fg-3)' };
  };

  const showSourcesForMessage = React.useCallback((message, sourceIndex = null) => {
    if (!message || message.role === 'user') return;
    const sources = Array.isArray(message.sources) ? message.sources : [];
    setLatestSources(sources);
    setLatestTrace(message.trace || null);
    setLatestGrounding((message.grounding && message.grounding.tier) || message.groundingTier || '');
    setActiveSourceIndex(Number.isInteger(sourceIndex) ? sourceIndex : null);
    setSourceRailLabel(Number.isInteger(sourceIndex) ? `Selected citation: Source ${sourceIndex + 1}` : 'Selected answer');
    setRailOpen(true);
  }, []);

  const stopAudio = React.useCallback(() => {
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch (_) {}
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = '';
    }
    setPlayingMessageId(null);
    setTtsBusyMessageId(null);
  }, []);

  const speech = window.useSpeechRecognition({
    lang: 'en-US',
    onResult: (transcript) => {
      setSpeechError('');
      setInput(prev => {
        const cleanPrev = String(prev || '').trim();
        return cleanPrev ? `${cleanPrev} ${transcript}` : transcript;
      });
      setTimeout(() => textareaRef.current && textareaRef.current.focus(), 0);
    },
    onError: (code) => {
      const message = code === 'not-allowed' || code === 'permission-denied'
        ? 'Microphone access was blocked by the browser.'
        : code === 'no-speech'
          ? 'I did not catch any speech. Try again when you are ready.'
          : code === 'unsupported'
            ? 'Speech input is not supported in this browser.'
            : 'Speech recognition stopped. You can type instead.';
      setSpeechError(message);
    },
  });

  React.useEffect(() => () => stopAudio(), [stopAudio]);

  React.useEffect(() => {
    if (!initialConversationId) return;
    let alive = true;
    setLoadingHistory(true);
    setError('');
    window.NoesisAPI.tutor.chatMessages(initialConversationId, { limit: 80 })
      .then(d => {
        if (!alive) return;
        const nextMessages = d.messages || [];
        setConversationId(initialConversationId);
        setMessages(nextMessages);
        if (d.conversation && d.conversation.material_id) {
          setSelectedMaterialId(String(d.conversation.material_id));
          sessionStorage.setItem('noesis.tutorMaterialId', String(d.conversation.material_id));
        }
        const latestAssistant = [...nextMessages].reverse().find(m => m.role === 'assistant');
        if (latestAssistant) {
          setLatestSources(latestAssistant.sources || []);
          setLatestTrace(latestAssistant.trace || null);
          setLatestGrounding((latestAssistant.grounding && latestAssistant.grounding.tier) || latestAssistant.groundingTier || '');
          setSourceRailLabel('Latest answer');
        }
        setTimeout(() => scrollToBottom(false), 0);
      })
      .catch(e => {
        if (!alive) return;
        setError(e.message || 'Could not load that conversation.');
      })
      .finally(() => {
        if (alive) setLoadingHistory(false);
      });
    return () => { alive = false; };
  }, [initialConversationId, scrollToBottom]);

  const playMessageAudio = async (message) => {
    if (!message || message.role !== 'assistant' || message.error || muted) return;
    if (playingMessageId === message.id) {
      stopAudio();
      return;
    }
    stopAudio();
    setAudioError('');
    setTtsBusyMessageId(message.id);
    try {
      const text = tutorSpeechText(message.content);
      if (!text) throw new Error('No readable text to speak.');
      const res = await window.NoesisAPI.tutor.tts(text);
      if (!res.ok) {
        let msg = `tts_${res.status}`;
        try {
          const data = await res.json();
          msg = (data && (data.message || data.error)) || msg;
        } catch (_) {}
        throw new Error(msg);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audioUrlRef.current = url;
      audio.onended = () => stopAudio();
      audio.onerror = () => {
        setAudioError('Audio playback failed. You can try again or keep reading.');
        stopAudio();
      };
      setPlayingMessageId(message.id);
      await audio.play();
    } catch (e) {
      setAudioError(e.message || 'Could not play audio.');
      stopAudio();
    } finally {
      setTtsBusyMessageId(null);
    }
  };

  const sendMessage = async (overrideText = '', action = '') => {
    const text = String(overrideText || input || '').trim();
    if (!text || busy) return;
    if (speech.listening) speech.stop();
    const materialId = selectedMaterialId ? parseInt(selectedMaterialId, 10) : null;
    if (materialId) sessionStorage.setItem('noesis.tutorMaterialId', String(materialId));
    const userMessage = {
      id: `local-user-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    stickToBottomRef.current = true;
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setError('');
    setAudioError('');
    setBusy(true);
    setSuggestions([]);
    try {
      const res = await window.NoesisAPI.tutor.chat({
        conversation_id: conversationId,
        material_id: materialId,
        message: text,
        action,
      });
      setConversationId(res.conversation_id);
      setLatestSources(res.sources || []);
      setLatestTrace(res.trace || null);
      setLatestGrounding((res.grounding && res.grounding.tier) || res.groundingTier || '');
      setActiveSourceIndex(null);
      setSourceRailLabel('Latest answer');
      setSuggestions(res.suggestions || []);
      setMessages(prev => [...prev, {
        id: res.message_id || `local-assistant-${Date.now()}`,
        role: 'assistant',
        content: res.reply || '',
        response: res.response || null,
        sources: res.sources || [],
        suggestions: res.suggestions || [],
        groundingTier: res.groundingTier || '',
        grounding: res.grounding || null,
        trace: res.trace || {},
        action: res.action || action || '',
        actionResult: res.actionResult || null,
        created_at: new Date().toISOString(),
      }]);
    } catch (e) {
      const code = e && (e.code || (e.data && e.data.error));
      const friendly = {
        ai_model_missing: 'The selected tutor model is unavailable. Noesis tried the fallback provider, but no model was ready.',
        ai_unavailable: 'The tutor provider is not reachable right now. Check provider settings or try again shortly.',
        ai_auth_failed: 'The tutor provider rejected the API key. Check credentials or switch providers.',
        ai_timeout: 'The tutor provider timed out. Try a shorter message or use the fallback provider.',
        ai_rate_limited: 'The tutor provider is rate limited. Please try again shortly.',
      }[code] || e.message || 'The tutor could not answer right now.';
      setError(friendly);
      setMessages(prev => [...prev, {
        id: `local-error-${Date.now()}`,
        role: 'assistant',
        content: friendly,
        error: true,
        created_at: new Date().toISOString(),
      }]);
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setInput('');
      setSpeechError('');
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const resetChat = () => {
    setConversationId(null);
    setMessages([]);
    setInput('');
    setSuggestions([]);
    setLatestSources([]);
    setLatestTrace(null);
    setLatestGrounding('');
    setActiveSourceIndex(null);
    setSourceRailLabel('Latest answer');
    setSpeechError('');
    if (speech.listening) speech.stop();
    stopAudio();
    setAudioError('');
    setError('');
  };

  const sampleQuestions = selectedMaterial ? [
    'What is the main idea in this material?',
    'Explain the hardest concept with an example.',
    'Quiz me on the key points.',
  ] : [
    'Explain object-oriented programming.',
    'Compare stacks and queues.',
    'What does Big-O measure?',
  ];
  const avatarState = error || speechError || audioError ? 'error' : playingMessageId ? 'speaking' : busy ? 'thinking' : speech.listening || input.trim() ? 'listening' : 'idle';
  const avatarStatus = avatarState === 'thinking'
    ? 'Finding the right source chunks and composing an answer.'
    : avatarState === 'speaking'
      ? 'Speaking the latest tutor reply.'
    : speech.listening
      ? 'Listening through your microphone.'
      : avatarState === 'listening'
        ? 'Listening to your question as you type.'
      : avatarState === 'error'
        ? 'Something needs attention before we continue.'
        : 'Ready for your next question.';
  const micTitle = speech.supported
    ? (speech.listening ? 'Stop listening' : 'Start voice input')
    : 'Voice input is not supported in this browser';
  const layoutStyle = {
    ...tc.layout,
    gridTemplateColumns: isNarrow ? 'minmax(0, 1fr)' : (railOpen ? 'minmax(0, 1fr) 320px' : 'minmax(0, 1fr) 0px'),
  };
  const railStyle = {
    ...tc.rail,
    ...(isNarrow ? tc.railNarrow : {}),
    opacity: railOpen ? 1 : 0,
    pointerEvents: railOpen ? 'auto' : 'none',
    display: isNarrow && !railOpen ? 'none' : undefined,
  };

  return (
    <div style={tc.page}>
      <window.Topbar
        title="Free Chat"
        crumbs={['AI Tutor']}
        right={(
          <>
            {playingMessageId && <button className="btn btn-bare" onClick={stopAudio}><Icon.Pause size={12}/> Stop</button>}
            <button className="btn btn-bare" onClick={() => { if (!muted) stopAudio(); setMuted(v => !v); }} title={muted ? 'Enable tutor audio' : 'Mute tutor audio'}>
              {muted ? <><Icon.X size={12}/> Muted</> : <><Icon.Play size={12}/> Audio</>}
            </button>
            <button className="btn btn-ghost" onClick={() => onMode && onMode(null)}><Icon.ArrowLeft size={12}/> Modes</button>
            <button className="btn btn-bare" onClick={resetChat}><Icon.Plus size={12}/> New chat</button>
          </>
        )}
      />

      <div style={tc.contextBar}>
        <div style={tc.contextMeta}>
          <div style={tc.kicker}>Grounded source</div>
          <select
            className="input"
            value={selectedMaterialId}
            onChange={e => setSelectedMaterialId(e.target.value)}
            style={tc.materialSelect}
          >
            {readyMaterials.length === 0 && <option value="">Core tutor corpus</option>}
            {readyMaterials.map(m => <option key={m.id} value={m.id}>{materialLabel(m)}</option>)}
          </select>
        </div>
        <div style={tc.contextHint}>
          {selectedMaterial ? materialLabel(selectedMaterial) : 'Ask from the core tutor corpus'}
        </div>
        <button className="btn btn-bare" onClick={() => setRailOpen(v => !v)}>
          {railOpen ? <Icon.ChevronRight size={13}/> : <Icon.ChevronLeft size={13}/>}
          Sources
        </button>
      </div>

      <div style={layoutStyle}>
        <main style={tc.chatPane}>
          <div style={tc.avatarPanel}>
            <window.TutorAvatar state={avatarState} size={64}/>
            <div style={{ minWidth: 0 }}>
              <div style={tc.avatarTitle}>Noēsis Tutor</div>
              <div style={tc.avatarStatus}>{avatarStatus}</div>
            </div>
          </div>

          <div ref={listRef} style={tc.messages} onScroll={handleMessagesScroll}>
            {loadingHistory ? (
              <LoadingBubble label="Loading your previous chat"/>
            ) : messages.length === 0 && !busy ? (
              <div style={tc.emptyState}>
                <window.TutorAvatar state={avatarState} size={86}/>
                <h1 style={tc.emptyTitle}>Ask about your material</h1>
                <p style={tc.emptyText}>The tutor will retrieve relevant chunks, answer from them, and keep sources visible while you learn.</p>
                <div style={tc.emptySourcePanel}>
                  <span style={tc.emptySourceLabel}>Ask from</span>
                  <select
                    className="input"
                    value={selectedMaterialId}
                    onChange={e => setSelectedMaterialId(e.target.value)}
                    style={tc.emptySourceSelect}
                  >
                    {readyMaterials.length === 0 && <option value="">Core tutor corpus</option>}
                    {readyMaterials.map(m => <option key={m.id} value={m.id}>{materialLabel(m)}</option>)}
                  </select>
                </div>
                <div style={tc.sampleGrid}>
                  {sampleQuestions.map(q => (
                    <button key={q} style={tc.sampleChip} onClick={() => sendMessage(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((m) => (
                  <ChatMessage
                    key={m.id}
                    message={m}
                    renderMarkdown={renderMarkdown}
                    groundingTone={groundingTone}
                    onSpeak={playMessageAudio}
                    playing={playingMessageId === m.id}
                    ttsBusy={ttsBusyMessageId === m.id}
                    muted={muted}
                    onShowSources={showSourcesForMessage}
                    onCitation={showSourcesForMessage}
                    onAction={(text, actionKey) => sendMessage(text, actionKey)}
                  />
                ))}
                {busy && <LoadingBubble/>}
              </>
            )}
          </div>
          {showScrollFab && (
            <button style={tc.scrollFab} onClick={() => scrollToBottom(true)}>
              <Icon.ChevronDown size={13}/>
              New messages
            </button>
          )}

          {suggestions.length > 0 && (
            <div style={tc.suggestions}>
              {suggestions.slice(0, 3).map((s, i) => (
                <button key={`${s}-${i}`} style={tc.suggestionChip} disabled={busy} onClick={() => sendMessage(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}

          <div style={tc.actionChips}>
            {actionChips.map(item => {
              const ChipIcon = Icon[item.icon] || Icon.Sparkle;
              return (
                <button key={item.key} style={tc.actionChip} disabled={busy} onClick={() => sendMessage(item.message, item.key)}>
                  <ChipIcon size={13}/>
                  {item.label}
                </button>
              );
            })}
          </div>

          <div style={tc.composerWrap}>
            {error && <div style={tc.error}>{error}</div>}
            {speechError && <div style={tc.speechHint}>{speechError}</div>}
            {audioError && <div style={tc.speechHint}>{audioError}</div>}
            <div style={tc.composer}>
              <button
                className="btn btn-bare"
                disabled={busy || !speech.supported}
                title={micTitle}
                onClick={() => {
                  setSpeechError('');
                  speech.listening ? speech.stop() : speech.start();
                }}
                style={{
                  ...tc.iconButton,
                  ...(speech.listening ? tc.iconButtonListening : {}),
                  ...(!speech.supported ? tc.iconButtonDisabled : {}),
                }}
              >
                <Icon.Mic size={16}/>
              </button>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => { setInput(e.target.value); if (speechError) setSpeechError(''); }}
                onKeyDown={onKeyDown}
                rows={composerRows}
                placeholder="Ask a question about the selected material..."
                style={tc.textarea}
                disabled={busy}
              />
              <button className="btn btn-accent" disabled={busy || !input.trim()} onClick={() => sendMessage()} style={tc.sendButton}>
                {busy ? 'Thinking...' : 'Send'} <Icon.Send size={14}/>
              </button>
            </div>
          </div>
        </main>

        <aside style={railStyle}>
          <div style={tc.railHeader}>
            <div>
              <div style={tc.kicker}>{sourceRailLabel}</div>
              <div style={tc.railTitle}>Sources</div>
            </div>
            <GroundingBadge tier={latestGrounding} groundingTone={groundingTone}/>
            {isNarrow && (
              <button className="btn btn-bare" onClick={() => setRailOpen(false)} title="Close sources">
                <Icon.X size={13}/>
              </button>
            )}
          </div>

          <div style={tc.railBody}>
            {latestSources.length === 0 ? (
              <div style={tc.emptyRail}>Sources will appear after the first grounded answer.</div>
            ) : latestSources.map((s, i) => (
              <div id={`source-card-${i + 1}`} key={`${s.id || s.chunkId || i}-${i}`} style={{ ...tc.sourceCard, ...(activeSourceIndex === i ? tc.sourceCardActive : {}) }}>
                <div style={tc.sourceTopline}>
                  <div style={tc.sourceKicker}>Source {i + 1}</div>
                  {s.score != null && <div style={tc.sourceScore}>{Math.round(Math.max(0, Math.min(1, Number(s.score))) * 100)}%</div>}
                </div>
                <div style={tc.sourceTitle}>{s.heading || s.location || s.materialTitle || 'Material excerpt'}</div>
                <div style={tc.sourceExcerpt}>{s.excerpt || s.text || ''}</div>
                {s.score != null && (
                  <div style={tc.scoreBar}>
                    <span style={{ ...tc.scoreFill, width: `${Math.max(6, Math.min(100, Number(s.score) * 100))}%` }}/>
                  </div>
                )}
                {selectedMaterialId && onNav && (
                  <button
                    style={tc.sourceLink}
                    onClick={() => {
                      sessionStorage.setItem('noesis.materialId', String(selectedMaterialId));
                      onNav('material');
                    }}
                  >
                    View in material
                  </button>
                )}
              </div>
            ))}

            <MaterialVisuals materialId={selectedMaterialId} />

            {latestTrace && (
              <div style={tc.traceBox}>
                <TracePair label="Provider" value={latestTrace.provider || 'unknown'}/>
                <TracePair label="Model" value={latestTrace.model || 'unknown'}/>
                <TracePair label="Retrieval" value={latestTrace.retrievalMs == null ? '-' : `${latestTrace.retrievalMs} ms`}/>
                <TracePair label="Generation" value={latestTrace.generationMs == null ? '-' : `${latestTrace.generationMs} ms`}/>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};

// Shows real diagrams/figures detected in the selected material so the tutor can point at
// actual source visuals. Only image-bearing candidates are shown; text-only refs are skipped.
const MaterialVisuals = ({ materialId }) => {
  const [visuals, setVisuals] = React.useState([]);
  React.useEffect(() => {
    let active = true;
    if (!materialId) { setVisuals([]); return undefined; }
    (async () => {
      try {
        const res = await window.NoesisAPI.materials.sourceVisuals(materialId);
        const list = ((res && res.source_visuals) || []).filter(v => v && v.id && v.imagePath);
        if (active) setVisuals(list.slice(0, 4));
      } catch (_) { if (active) setVisuals([]); }
    })();
    return () => { active = false; };
  }, [materialId]);
  if (!visuals.length) return null;
  return (
    <div style={tc.materialVisuals}>
      <div style={tc.materialVisualsLabel}>From your material</div>
      {visuals.map(v => <SourceVisualThumb key={v.id} materialId={materialId} candidate={v} />)}
    </div>
  );
};

const SourceVisualThumb = ({ materialId, candidate }) => {
  const [url, setUrl] = React.useState('');
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    let active = true;
    let objUrl = '';
    (async () => {
      try {
        objUrl = await window.NoesisAPI.materials.sourceVisualImageBlobUrl(materialId, candidate.id);
        if (active) setUrl(objUrl); else URL.revokeObjectURL(objUrl);
      } catch (_) { if (active) setFailed(true); }
    })();
    return () => { active = false; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [materialId, candidate.id]);
  if (failed) return null;
  const where = candidate.pageNumber != null ? `p.${candidate.pageNumber}`
    : (candidate.slideNumber != null ? `slide ${candidate.slideNumber}` : '');
  return (
    <figure style={tc.materialVisualFigure}>
      {url
        ? <img src={url} alt={candidate.caption || 'Source visual'} style={tc.materialVisualImg} onError={() => setFailed(true)} />
        : <div style={tc.materialVisualLoading}>Loading…</div>}
      {(candidate.caption || where) && (
        <figcaption style={tc.materialVisualCaption}>{candidate.caption || 'Source visual'}{where ? ` (${where})` : ''}</figcaption>
      )}
    </figure>
  );
};

const ChatMessage = ({ message, renderMarkdown, groundingTone, onSpeak, playing, ttsBusy, muted, onShowSources, onCitation, onAction }) => {
  const Icon = window.Icon;
  const ExplainIcon = Icon.Lightbulb || Icon.Sparkle;
  const ExampleIcon = Icon.Code || Icon.Braces || Icon.Sparkle;
  const QuizIcon = Icon.Target || Icon.CircleHelp || Icon.Sparkle;
  const SourceIcon = Icon.BookOpen || Icon.Book || Icon.FileText || Icon.Sparkle;
  const [copied, setCopied] = React.useState(false);
  const isUser = message.role === 'user';
  const tier = (message.grounding && message.grounding.tier) || message.groundingTier;
  const tone = groundingTone(tier);
  const timeLabel = relativeTime(message.created_at);
  const exactTime = message.created_at ? new Date(message.created_at).toLocaleString() : '';
  const weakNote = !isUser && message.grounding && message.grounding.tier === 'weak'
    && !String(message.content || '').toLowerCase().includes('could not find strong support')
    ? message.grounding.message
    : '';
  const handleMarkdownClick = (e) => {
    const link = e.target && e.target.closest ? e.target.closest('a') : null;
    if (!link) return;
    const href = link.getAttribute('href') || '';
    const match = href.match(/^#source-(\d+)$/);
    if (!match) return;
    e.preventDefault();
    const index = Number(match[1]) - 1;
    onCitation && onCitation(message, index);
  };
  const copyMessage = async () => {
    try {
      const readable = window.NoesisTutorResponse && window.NoesisTutorResponse.copyText
        ? window.NoesisTutorResponse.copyText(message.content)
        : String(message.content || '');
      await navigator.clipboard.writeText(readable);
      setCopied(true);
      setTimeout(() => setCopied(false), 1300);
    } catch (_) {
      setCopied(false);
    }
  };
  return (
    <div style={{ ...tc.messageRow, justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      {!isUser && <window.TutorAvatar state={message.error ? 'error' : 'idle'} size={30}/>}
      <div style={{ ...tc.bubble, ...(isUser ? tc.userBubble : tc.tutorBubble), ...(message.error ? tc.errorBubble : {}) }}>
        <div style={tc.bubbleMeta}>
          <span>{isUser ? 'You' : 'Tutor'}</span>
          {timeLabel && <span style={tc.messageTime} title={exactTime}>{timeLabel}</span>}
          {!isUser && tier && (
            <button
              style={{ ...tc.inlineGroundingBadge, borderColor: tone.color, color: tone.color }}
              title={message.grounding ? message.grounding.message : tone.label}
              onClick={() => onShowSources && onShowSources(message)}
            >
              <span style={{ ...tc.groundingDot, background: tone.color }}/>
              {tone.label}
            </button>
          )}
          {!isUser && (
            <button
              style={{ ...tc.messageIconButton, marginLeft: 'auto', ...(copied ? tc.messageIconButtonActive : {}) }}
              onClick={copyMessage}
              title={copied ? 'Copied' : 'Copy reply'}
            >
              {copied ? <Icon.Check size={11}/> : <Icon.Copy size={11}/>}
            </button>
          )}
          {!isUser && (
            <button
              style={{ ...tc.messageIconButton, ...(playing ? tc.messageIconButtonActive : {}) }}
              disabled={muted || ttsBusy}
              onClick={() => onSpeak && onSpeak(message)}
              title={muted ? 'Audio is muted' : playing ? 'Stop speaking' : 'Read this reply aloud'}
            >
              {ttsBusy ? <span className="mono">...</span> : playing ? <Icon.Pause size={11}/> : <Icon.Play size={11}/>}
            </button>
          )}
        </div>
        {weakNote && <div style={tc.groundingNote}>{weakNote}</div>}
        {!isUser
          ? <TutorReplyCard message={message} renderMarkdown={renderMarkdown} onMarkdownClick={handleMarkdownClick}/>
          : <div className="md-rendered" style={tc.markdown} onClick={handleMarkdownClick} dangerouslySetInnerHTML={renderMarkdown(message.content)}/>}
        {!isUser && message.actionResult && <ActionResult result={message.actionResult}/>}
        {!isUser && !message.error && (
          <div style={tc.replyActions}>
            <button style={tc.replyActionButton} disabled={ttsBusy} onClick={() => onAction && onAction('Explain your last answer more simply with a beginner-friendly analogy.', '')}>
              <ExplainIcon size={12}/> Explain simpler
            </button>
            <button style={tc.replyActionButton} onClick={() => onAction && onAction('Show me a concrete example for your last answer.', 'give_example')}>
              <ExampleIcon size={12}/> Give example
            </button>
            <button style={tc.replyActionButton} onClick={() => onAction && onAction('Quiz me on your last answer.', 'quiz_me')}>
              <QuizIcon size={12}/> Quiz me
            </button>
            <button style={tc.replyActionButton} onClick={() => onShowSources && onShowSources(message)}>
              <SourceIcon size={12}/> Show sources
            </button>
            <button style={tc.replyActionButton} disabled={muted || ttsBusy} onClick={() => onSpeak && onSpeak(message)}>
              {playing ? <Icon.Pause size={12}/> : <Icon.Play size={12}/>} Speak
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const chatCodeObject = (code) => {
  if (!code) return null;
  if (typeof code === 'string') return { language: 'text', content: code };
  return {
    language: code.language || 'text',
    content: code.content || code.text || code.code || '',
  };
};

const TutorReplyCard = ({ message, renderMarkdown, onMarkdownClick }) => {
  const Icon = window.Icon;
  const [copiedCode, setCopiedCode] = React.useState(false);
  const helper = window.NoesisTutorResponse;
  const normalized = helper && helper.normalize ? helper.normalize(message.content) : { structured: false, text: message.content };
  if (!normalized.structured) {
    return <div className="md-rendered" style={tc.markdown} onClick={onMarkdownClick} dangerouslySetInnerHTML={renderMarkdown(message.content)}/>;
  }
  const code = chatCodeObject(normalized.code);
  const visual = normalized.visual && typeof normalized.visual === 'object'
    ? (normalized.visual.caption || normalized.visual.description || normalized.visual.type || '')
    : (typeof normalized.visual === 'string' ? normalized.visual : '');
  const copyCode = async () => {
    if (!code || !code.content) return;
    try {
      await navigator.clipboard.writeText(code.content);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1200);
    } catch (_) {
      setCopiedCode(false);
    }
  };
  return (
    <div style={tc.replyCard}>
      {(normalized.title || normalized.type) && (
        <div style={tc.replyTitle}>{normalized.title || String(normalized.type).replace(/_/g, ' ')}</div>
      )}
      {normalized.explanation && (
        <section style={tc.replySection}>
          <div style={tc.replySectionTitle}>Answer</div>
          <div className="md-rendered" style={tc.markdown} onClick={onMarkdownClick} dangerouslySetInnerHTML={renderMarkdown(normalized.explanation)}/>
        </section>
      )}
      {normalized.keyPoints && normalized.keyPoints.length > 0 && (
        <section style={tc.replySection}>
          <div style={tc.replySectionTitle}>Key points</div>
          <div style={tc.keyPointGrid}>
            {normalized.keyPoints.slice(0, 6).map((point, i) => (
              <div key={`${point}-${i}`} style={tc.keyPoint}>
                <span className="mono" style={tc.keyPointNumber}>{i + 1}</span>
                <span>{point}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      {normalized.example && (
        <section style={{ ...tc.replySection, ...tc.exampleCard }}>
          <div style={tc.replySectionTitle}>Example</div>
          <div className="md-rendered" style={tc.markdown} onClick={onMarkdownClick} dangerouslySetInnerHTML={renderMarkdown(normalized.example)}/>
        </section>
      )}
      {code && code.content && (
        <section style={tc.codeCard}>
          <div style={tc.replyCodeHeader}>
            <span>{code.language || 'code'}</span>
            <button style={tc.codeCopyButton} onClick={copyCode}>
              {copiedCode ? <Icon.Check size={11}/> : <Icon.Copy size={11}/>}
              {copiedCode ? 'Copied' : 'Copy code'}
            </button>
          </div>
          <pre style={tc.replyCode}>{code.content}</pre>
        </section>
      )}
      {visual && (
        <section style={tc.visualCard}>
          <div style={tc.replySectionTitle}>Visual</div>
          <div>{visual}</div>
        </section>
      )}
      {(normalized.hint || normalized.question) && (
        <section style={tc.checkpointCard}>
          {normalized.hint && <div><b>Hint:</b> {normalized.hint}</div>}
          {normalized.question && <div><b>Check yourself:</b> {normalized.question}</div>}
        </section>
      )}
    </div>
  );
};

const ActionResult = ({ result }) => {
  const [selected, setSelected] = React.useState(null);
  if (!result) return null;
  if (result.type === 'flashcards') {
    return (
      <div style={tc.actionResult}>
        <div style={tc.actionResultTitle}>Flashcards saved</div>
        <div style={tc.actionResultText}>{result.created || 0} card{result.created === 1 ? '' : 's'} added to your flashcards.</div>
      </div>
    );
  }
  if (result.type === 'quiz' && result.quiz) {
    const q = result.quiz;
    const correctIdx = Number.isInteger(q.correct_idx) ? q.correct_idx : Number(q.correct_idx);
    const hasSelection = selected != null;
    return (
      <div style={tc.actionResult}>
        <div style={tc.actionResultTitle}>Quick quiz</div>
        <div style={tc.actionResultText}>{q.question}</div>
        {Array.isArray(q.options) && q.options.length > 0 && (
          <div style={tc.quizOptions}>
            {q.options.map((option, i) => (
              <button
                key={`${option}-${i}`}
                style={{
                  ...tc.quizOption,
                  ...(hasSelection && i === correctIdx ? tc.quizOptionCorrect : {}),
                  ...(hasSelection && i === selected && i !== correctIdx ? tc.quizOptionWrong : {}),
                }}
                onClick={() => setSelected(i)}
              >
                <span className="mono">{String.fromCharCode(65 + i)}</span>
                {option}
              </button>
            ))}
          </div>
        )}
        {(hasSelection || !Array.isArray(q.options) || !q.options.length) && (q.expectedAnswer || q.explanation) && (
          <div style={tc.quizDetails}>
            {q.expectedAnswer && <div>{q.expectedAnswer}</div>}
            {q.explanation && <div style={{ marginTop: 'calc(6px * var(--app-density-scale))', color: 'var(--fg-2)' }}>{q.explanation}</div>}
          </div>
        )}
      </div>
    );
  }
  return null;
};

const LoadingBubble = ({ label = 'Checking your sources' }) => (
  <div style={{ ...tc.messageRow, justifyContent: 'flex-start' }}>
    <window.TutorAvatar state="thinking" size={30}/>
    <div style={{ ...tc.bubble, ...tc.tutorBubble, ...tc.typingBubble }}>
      <span style={tc.typingLabel}>{label}</span>
      <span style={tc.typingDots} aria-hidden="true">
        <span className="typing-dot"/>
        <span className="typing-dot"/>
        <span className="typing-dot"/>
      </span>
    </div>
  </div>
);

const GroundingBadge = ({ tier, groundingTone }) => {
  const tone = groundingTone(tier);
  return (
    <span style={{ ...tc.badge, borderColor: tone.color, color: tone.color }}>
      {tone.short}
    </span>
  );
};

const TracePair = ({ label, value }) => (
  <div style={tc.tracePair}>
    <span>{label}</span>
    <b>{value}</b>
  </div>
);

function tutorSpeechText(markdown) {
  if (window.NoesisTutorResponse) return window.NoesisTutorResponse.speechText(markdown);
  return String(markdown || '')
    .replace(/```[\s\S]*?```/g, ' code example omitted. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_~|]/g, ' ')
    .replace(/\[(Source|source)\s*\d+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
}

function enhanceCodeBlocks(html) {
  return String(html || '').replace(/<pre><code([^>]*)>([\s\S]*?)<\/code><\/pre>/g, (_, attrs, code) => {
    const highlighted = String(code || '').replace(
      /(\/\/[^\n<]*)|(&quot;.*?&quot;|'.*?')|\b(class|public|private|protected|static|void|int|String|return|if|else|for|while|new|extends|implements|interface|const|let|var|function|async|await)\b/g,
      (match, comment, stringValue, keyword) => {
        if (comment) return `<span class="code-comment">${comment}</span>`;
        if (stringValue) return `<span class="code-string">${stringValue}</span>`;
        if (keyword) return `<span class="code-keyword">${keyword}</span>`;
        return match;
      }
    );
    return `<pre><code${attrs}>${highlighted}</code></pre>`;
  });
}

function relativeTime(value) {
  if (!value) return '';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '';
  const diff = Math.max(0, Date.now() - time);
  const minute = 60 * 1000;
  if (diff < minute) return 'now';
  if (diff < 60 * minute) return `${Math.floor(diff / minute)}m ago`;
  const hour = 60 * minute;
  if (diff < 24 * hour) return `${Math.floor(diff / hour)}h ago`;
  const day = 24 * hour;
  return `${Math.floor(diff / day)}d ago`;
}

const tc = {
  page: { minHeight: '100vh', background: 'var(--bg-0)', color: 'var(--fg-0)', display: 'flex', flexDirection: 'column' },
  contextBar: {
    display: 'flex', alignItems: 'center', gap: 'calc(12px * var(--app-density-scale))', padding: '12px 22px',
    borderBottom: '1px solid var(--line)', background: 'var(--bg-1)', flexWrap: 'wrap',
  },
  contextMeta: { display: 'flex', alignItems: 'center', gap: 'calc(10px * var(--app-density-scale))' },
  kicker: { fontSize: 'calc(10.5px * var(--app-font-scale))', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 'calc(3px * var(--app-density-scale))' },
  materialSelect: { width: 280, maxWidth: '48vw', fontSize: 'calc(12.5px * var(--app-font-scale))', padding: '8px 10px' },
  contextHint: { color: 'var(--fg-2)', fontSize: 'calc(12.5px * var(--app-font-scale))', minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  layout: { flex: 1, display: 'grid', minHeight: 0, transition: 'grid-template-columns 220ms var(--ease-out)' },
  chatPane: { position: 'relative', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 },
  avatarPanel: {
    display: 'flex', alignItems: 'center', gap: 'calc(12px * var(--app-density-scale))',
    padding: '14px clamp(18px, 4vw, 56px)',
    borderBottom: '1px solid var(--line)', background: 'var(--bg-0)',
  },
  avatarTitle: { fontFamily: 'var(--font-display)', fontSize: 'calc(18px * var(--app-font-scale))', color: 'var(--fg-0)', lineHeight: 1.2 },
  avatarStatus: { color: 'var(--fg-2)', fontSize: 'calc(12.5px * var(--app-font-scale))', lineHeight: 1.45, marginTop: 'calc(3px * var(--app-density-scale))' },
  messages: { flex: 1, overflow: 'auto', padding: '24px clamp(18px, 4vw, 56px)', display: 'flex', flexDirection: 'column', gap: 'calc(14px * var(--app-density-scale))' },
  emptyState: { minHeight: 430, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 'calc(14px * var(--app-density-scale))' },
  avatarLarge: {
    width: 72, height: 72, borderRadius: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--accent-glow)', border: '1px solid var(--accent-soft)', color: 'var(--accent)',
  },
  emptyTitle: { margin: 0, fontFamily: 'var(--font-display)', fontSize: 'calc(36px * var(--app-font-scale))', fontWeight: 300, color: 'var(--fg-0)' },
  emptyText: { margin: 0, maxWidth: 560, color: 'var(--fg-2)', fontSize: 'calc(14px * var(--app-font-scale))', lineHeight: 1.7 },
  emptySourcePanel: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(8px * var(--app-density-scale))',
    padding: 'calc(8px * var(--app-density-scale))',
    border: '1px solid var(--line)',
    borderRadius: 'var(--r-md)',
    background: 'var(--bg-1)',
    maxWidth: 'min(560px, 94vw)',
  },
  emptySourceLabel: { color: 'var(--fg-3)', fontSize: 'calc(11px * var(--app-font-scale))', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' },
  emptySourceSelect: { minWidth: 260, maxWidth: '62vw', fontSize: 'calc(12.5px * var(--app-font-scale))', padding: '8px 10px' },
  sampleGrid: { display: 'flex', gap: 'calc(8px * var(--app-density-scale))', flexWrap: 'wrap', justifyContent: 'center', marginTop: 'calc(8px * var(--app-density-scale))', maxWidth: 760 },
  sampleChip: { padding: '9px 12px', borderRadius: 999, border: '1px solid var(--line)', background: 'var(--bg-1)', color: 'var(--fg-1)', fontSize: 'calc(12.5px * var(--app-font-scale))' },
  messageRow: { display: 'flex', gap: 'calc(10px * var(--app-density-scale))', alignItems: 'flex-start' },
  bubbleAvatar: {
    width: 30, height: 30, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--accent-glow)', border: '1px solid var(--accent-soft)', color: 'var(--accent)', flexShrink: 0, marginTop: 'calc(3px * var(--app-density-scale))',
  },
  bubble: { maxWidth: 'min(760px, 82%)', borderRadius: 10, border: '1px solid var(--line)', padding: '11px 13px', boxShadow: '0 8px 28px rgba(0,0,0,0.08)' },
  userBubble: { background: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--bg-0)' },
  tutorBubble: { background: 'var(--bg-1)', borderColor: 'var(--line)', color: 'var(--fg-1)' },
  errorBubble: { borderColor: 'var(--err)', background: 'color-mix(in oklab, var(--err) 10%, var(--bg-1))' },
  bubbleMeta: { display: 'flex', alignItems: 'center', gap: 'calc(6px * var(--app-density-scale))', fontSize: 'calc(10.5px * var(--app-font-scale))', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'inherit', opacity: 0.78, marginBottom: 'calc(5px * var(--app-density-scale))' },
  messageTime: { letterSpacing: 0, textTransform: 'none', color: 'var(--fg-3)', fontSize: 'calc(10.5px * var(--app-font-scale))' },
  groundingDot: { width: 7, height: 7, borderRadius: 999, display: 'inline-block' },
  inlineGroundingBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'calc(5px * var(--app-density-scale))',
    padding: '3px 7px',
    borderRadius: 999,
    border: '1px solid currentColor',
    background: 'var(--bg-0)',
    color: 'inherit',
    fontSize: 'calc(10px * var(--app-font-scale))',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    cursor: 'pointer',
  },
  groundingNote: {
    margin: '4px 0 8px',
    padding: '8px 9px',
    borderRadius: 8,
    border: '1px solid color-mix(in oklab, var(--err) 44%, var(--line))',
    background: 'color-mix(in oklab, var(--err) 9%, var(--bg-1))',
    color: 'var(--fg-1)',
    fontSize: 'calc(12px * var(--app-font-scale))',
    lineHeight: 1.45,
  },
  messageIconButton: {
    marginLeft: 0,
    width: 24,
    height: 24,
    borderRadius: 7,
    border: '1px solid var(--line)',
    background: 'var(--bg-0)',
    color: 'var(--fg-2)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    opacity: 1,
  },
  messageIconButtonActive: { color: 'var(--accent)', borderColor: 'var(--accent-soft)', background: 'var(--accent-glow)' },
  markdown: { fontSize: 'calc(13.5px * var(--app-font-scale))', lineHeight: 1.65, color: 'inherit' },
  replyCard: { display: 'grid', gap: 'calc(11px * var(--app-density-scale))' },
  replyTitle: { fontSize: 'calc(15px * var(--app-font-scale))', color: 'var(--fg-0)', fontWeight: 700, lineHeight: 1.35 },
  replySection: { padding: 'calc(12px * var(--app-density-scale))', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-0)' },
  replySectionTitle: { fontSize: 'calc(10.5px * var(--app-font-scale))', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 'calc(7px * var(--app-density-scale))', fontWeight: 700 },
  exampleCard: { background: 'color-mix(in srgb, var(--accent) 7%, var(--bg-0))', borderColor: 'var(--accent-soft)' },
  keyPointGrid: { display: 'grid', gap: 'calc(7px * var(--app-density-scale))' },
  keyPoint: { display: 'flex', gap: 'calc(9px * var(--app-density-scale))', alignItems: 'flex-start', color: 'var(--fg-1)', fontSize: 'calc(13px * var(--app-font-scale))', lineHeight: 1.5 },
  keyPointNumber: { width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 999, background: 'var(--accent-glow)', color: 'var(--accent)', flexShrink: 0, fontSize: 'calc(10px * var(--app-font-scale))' },
  codeCard: { borderRadius: 8, border: '1px solid #1d4ed8', background: '#0f172a', overflow: 'hidden' },
  replyCodeHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'calc(10px * var(--app-density-scale))', padding: '9px 12px', color: '#bfdbfe', fontSize: 'calc(11.5px * var(--app-font-scale))', borderBottom: '1px solid rgba(191,219,254,0.18)' },
  codeCopyButton: { display: 'inline-flex', alignItems: 'center', gap: 'calc(5px * var(--app-density-scale))', padding: '5px 8px', borderRadius: 7, border: '1px solid rgba(191,219,254,0.25)', background: 'rgba(15,23,42,0.72)', color: '#dbeafe', fontSize: 'calc(11px * var(--app-font-scale))', cursor: 'pointer' },
  replyCode: { margin: 0, padding: 'calc(14px * var(--app-density-scale))', maxHeight: 320, overflow: 'auto', color: '#dbeafe', fontFamily: 'var(--font-mono)', fontSize: 'calc(12.5px * var(--app-font-scale))', lineHeight: 1.6 },
  visualCard: { padding: 'calc(12px * var(--app-density-scale))', borderRadius: 8, border: '1px dashed var(--accent-soft)', background: 'var(--bg-0)', color: 'var(--fg-1)', fontSize: 'calc(13px * var(--app-font-scale))', lineHeight: 1.55 },
  checkpointCard: { display: 'grid', gap: 'calc(8px * var(--app-density-scale))', padding: 'calc(12px * var(--app-density-scale))', borderRadius: 8, border: '1px solid var(--accent-soft)', background: 'var(--accent-glow)', color: 'var(--fg-1)', fontSize: 'calc(13px * var(--app-font-scale))', lineHeight: 1.55 },
  replyActions: { display: 'flex', gap: 'calc(7px * var(--app-density-scale))', flexWrap: 'wrap', marginTop: 'calc(12px * var(--app-density-scale))', paddingTop: 'calc(10px * var(--app-density-scale))', borderTop: '1px solid var(--line)' },
  replyActionButton: { display: 'inline-flex', alignItems: 'center', gap: 'calc(5px * var(--app-density-scale))', padding: '6px 9px', borderRadius: 999, border: '1px solid var(--line)', background: 'var(--bg-0)', color: 'var(--fg-1)', fontSize: 'calc(11.5px * var(--app-font-scale))', cursor: 'pointer' },
  scrollFab: {
    position: 'absolute',
    right: 'clamp(18px, 4vw, 56px)',
    bottom: 126,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'calc(6px * var(--app-density-scale))',
    padding: '8px 11px',
    borderRadius: 999,
    border: '1px solid var(--accent-soft)',
    background: 'var(--bg-1)',
    color: 'var(--accent)',
    boxShadow: '0 14px 36px rgba(0,0,0,0.16)',
    zIndex: 4,
    fontSize: 'calc(12px * var(--app-font-scale))',
  },
  suggestions: { display: 'flex', gap: 'calc(8px * var(--app-density-scale))', overflowX: 'auto', padding: '8px clamp(18px, 4vw, 56px) 0' },
  suggestionChip: { padding: '8px 11px', borderRadius: 999, background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--fg-1)', fontSize: 'calc(12px * var(--app-font-scale))' },
  actionChips: { display: 'flex', gap: 'calc(8px * var(--app-density-scale))', overflowX: 'auto', padding: '10px clamp(18px, 4vw, 56px) 0', borderTop: '1px solid var(--line)' },
  actionChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'calc(6px * var(--app-density-scale))',
    padding: '8px 11px',
    borderRadius: 999,
    background: 'var(--bg-1)',
    border: '1px solid var(--line)',
    color: 'var(--fg-1)',
    fontSize: 'calc(12px * var(--app-font-scale))',
    whiteSpace: 'nowrap',
  },
  actionResult: { marginTop: 'calc(12px * var(--app-density-scale))', padding: 'calc(12px * var(--app-density-scale))', borderRadius: 8, background: 'var(--bg-2)', border: '1px solid var(--line)' },
  actionResultTitle: { fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 'calc(5px * var(--app-density-scale))' },
  actionResultText: { fontSize: 'calc(12.5px * var(--app-font-scale))', lineHeight: 1.5, color: 'var(--fg-1)' },
  quizOptions: { display: 'grid', gap: 'calc(6px * var(--app-density-scale))', marginTop: 'calc(9px * var(--app-density-scale))' },
  quizOption: { display: 'flex', gap: 'calc(8px * var(--app-density-scale))', alignItems: 'flex-start', padding: '7px 8px', borderRadius: 7, background: 'var(--bg-1)', border: '1px solid var(--line)', color: 'var(--fg-1)', fontSize: 'calc(12.5px * var(--app-font-scale))', textAlign: 'left' },
  quizOptionCorrect: { borderColor: 'var(--ok)', background: 'color-mix(in srgb, var(--ok) 9%, var(--bg-1))' },
  quizOptionWrong: { borderColor: 'var(--err)', background: 'color-mix(in srgb, var(--err) 9%, var(--bg-1))' },
  quizDetails: { marginTop: 'calc(9px * var(--app-density-scale))', color: 'var(--fg-1)', fontSize: 'calc(12.5px * var(--app-font-scale))', lineHeight: 1.5 },
  composerWrap: { padding: '14px clamp(18px, 4vw, 56px) 22px', background: 'linear-gradient(180deg, transparent, var(--bg-0) 24%)' },
  composer: { display: 'flex', alignItems: 'flex-end', gap: 'calc(8px * var(--app-density-scale))', padding: 'calc(8px * var(--app-density-scale))', background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)' },
  iconButton: { width: 36, height: 36, padding: 0, opacity: 0.55 },
  iconButtonListening: {
    opacity: 1,
    color: 'var(--accent)',
    borderColor: 'var(--accent-soft)',
    background: 'var(--accent-glow)',
    animation: 'glowPulse 1.2s ease-in-out infinite',
  },
  iconButtonDisabled: { opacity: 0.32, cursor: 'not-allowed' },
  textarea: {
    flex: 1, resize: 'none', border: 0, outline: 'none', background: 'transparent',
    color: 'var(--fg-0)', fontSize: 'calc(13.5px * var(--app-font-scale))', lineHeight: 1.5, minHeight: 36, maxHeight: 140, padding: '8px 4px',
  },
  sendButton: { minHeight: 36 },
  error: { marginBottom: 'calc(8px * var(--app-density-scale))', color: 'var(--err)', fontSize: 'calc(12.5px * var(--app-font-scale))' },
  speechHint: { marginBottom: 'calc(8px * var(--app-density-scale))', color: 'var(--warn)', fontSize: 'calc(12.5px * var(--app-font-scale))' },
  rail: { borderLeft: '1px solid var(--line)', background: 'var(--bg-0)', minWidth: 0, overflow: 'hidden', transition: 'opacity 180ms var(--ease-out)' },
  railNarrow: {
    position: 'fixed',
    inset: '96px 12px 16px',
    zIndex: 20,
    border: '1px solid var(--line)',
    borderRadius: 'var(--r-md)',
    boxShadow: '0 24px 80px rgba(0,0,0,0.22)',
  },
  railHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'calc(10px * var(--app-density-scale))', padding: 'calc(16px * var(--app-density-scale))', borderBottom: '1px solid var(--line)' },
  railTitle: { fontFamily: 'var(--font-display)', fontSize: 'calc(20px * var(--app-font-scale))', color: 'var(--fg-0)' },
  railBody: { height: 'calc(100vh - 143px)', overflow: 'auto', padding: 'calc(16px * var(--app-density-scale))' },
  badge: { padding: '4px 7px', borderRadius: 999, border: '1px solid var(--line)', fontSize: 'calc(10.5px * var(--app-font-scale))', whiteSpace: 'nowrap' },
  emptyRail: { color: 'var(--fg-3)', fontSize: 'calc(12.5px * var(--app-font-scale))', lineHeight: 1.6, padding: 'calc(12px * var(--app-density-scale))', border: '1px dashed var(--line)', borderRadius: 8 },
  materialVisuals: { marginTop: 'calc(8px * var(--app-density-scale))', marginBottom: 'calc(12px * var(--app-density-scale))' },
  materialVisualsLabel: { fontSize: 'calc(10.5px * var(--app-font-scale))', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 'calc(8px * var(--app-density-scale))' },
  materialVisualFigure: { margin: '0 0 10px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)', padding: 'calc(8px * var(--app-density-scale))' },
  materialVisualImg: { width: '100%', height: 'auto', display: 'block', borderRadius: 6, background: 'var(--bg-0)' },
  materialVisualLoading: { padding: 'calc(16px * var(--app-density-scale))', textAlign: 'center', color: 'var(--fg-3)', fontSize: 'calc(11.5px * var(--app-font-scale))' },
  materialVisualCaption: { margin: '6px 0 0', fontSize: 'calc(11px * var(--app-font-scale))', color: 'var(--fg-3)', lineHeight: 1.4 },
  sourceCard: { padding: 'calc(12px * var(--app-density-scale))', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)', marginBottom: 'calc(12px * var(--app-density-scale))' },
  sourceCardActive: { borderColor: 'var(--accent)', boxShadow: '0 0 0 3px var(--accent-glow)' },
  sourceTopline: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'calc(8px * var(--app-density-scale))', marginBottom: 'calc(5px * var(--app-density-scale))' },
  sourceKicker: { fontSize: 'calc(10.5px * var(--app-font-scale))', color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 'calc(5px * var(--app-density-scale))' },
  sourceScore: { fontSize: 'calc(10.5px * var(--app-font-scale))', color: 'var(--fg-3)', fontVariantNumeric: 'tabular-nums' },
  sourceTitle: { fontSize: 'calc(12.5px * var(--app-font-scale))', color: 'var(--fg-0)', marginBottom: 'calc(6px * var(--app-density-scale))', fontWeight: 600 },
  sourceExcerpt: { color: 'var(--fg-2)', fontSize: 'calc(12.2px * var(--app-font-scale))', lineHeight: 1.55 },
  scoreBar: { marginTop: 'calc(10px * var(--app-density-scale))', height: 4, background: 'var(--bg-2)', borderRadius: 999, overflow: 'hidden' },
  scoreFill: { display: 'block', height: '100%', background: 'var(--accent)' },
  sourceLink: { marginTop: 'calc(10px * var(--app-density-scale))', padding: 0, border: 0, background: 'transparent', color: 'var(--accent)', fontSize: 'calc(11.5px * var(--app-font-scale))', cursor: 'pointer' },
  traceBox: { marginTop: 'calc(14px * var(--app-density-scale))', padding: 'calc(12px * var(--app-density-scale))', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-1)' },
  tracePair: { display: 'flex', justifyContent: 'space-between', gap: 'calc(10px * var(--app-density-scale))', padding: '6px 0', color: 'var(--fg-2)', fontSize: 'calc(12px * var(--app-font-scale))' },
  loadingLine: { height: 9, borderRadius: 999, background: 'var(--bg-2)', border: '1px solid var(--line)', margin: '7px 0', animation: 'glowPulse 1.4s ease-in-out infinite' },
  typingBubble: { display: 'inline-flex', alignItems: 'center', gap: 'calc(9px * var(--app-density-scale))', width: 'auto' },
  typingLabel: { color: 'var(--fg-2)', fontSize: 'calc(12.5px * var(--app-font-scale))' },
  typingDots: { display: 'inline-flex', alignItems: 'center', gap: 'calc(3px * var(--app-density-scale))' },
};

window.TutorChat = TutorChat;
