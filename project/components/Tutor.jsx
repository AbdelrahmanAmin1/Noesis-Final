// AI Tutor workspace — grounded, structured tutor sessions.
const NoesisTutorResponse = (() => {
  const structuredKeys = ['title', 'explanation', 'answer', 'content', 'summary', 'question', 'checkpoint', 'hint', 'example', 'code', 'visual', 'type', 'key_points', 'keyPoints', 'bullets', 'steps'];

  const decodeJsonish = (value) => {
    let text = String(value || '').trim();
    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed === 'string') text = parsed.trim();
      } catch (_) {
        text = text.slice(1, -1).trim();
      }
    }
    if (/\\[nrti"]/.test(text)) {
      text = text
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '')
        .replace(/\\t/g, '  ')
        .replace(/\\"/g, '"');
    }
    return text;
  };

  const stripFences = (value) => {
    const text = decodeJsonish(value);
    const fullFence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fullFence ? fullFence[1].trim() : text.trim();
  };

  const parseMaybeJson = (value) => {
    if (value && typeof value === 'object') return value;
    const text = stripFences(value);
    const candidates = [text];
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) candidates.push(fence[1].trim());
    const firstObject = text.indexOf('{');
    const lastObject = text.lastIndexOf('}');
    if (firstObject >= 0 && lastObject > firstObject) candidates.push(text.slice(firstObject, lastObject + 1));
    const firstArray = text.indexOf('[');
    const lastArray = text.lastIndexOf(']');
    if (firstArray >= 0 && lastArray > firstArray) candidates.push(text.slice(firstArray, lastArray + 1));
    for (const raw of candidates) {
      const candidate = raw.trim();
      if (!/^[{\[]/.test(candidate)) continue;
      try {
        const parsed = JSON.parse(candidate);
        return typeof parsed === 'string' ? parseMaybeJson(parsed) : parsed;
      } catch (_) {}
    }
    return null;
  };

  const jsonField = (text, key) => {
    const re = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'i');
    const match = String(text || '').match(re);
    return match ? decodeJsonish(match[1]) : '';
  };

  const parseMalformed = (value) => {
    const text = stripFences(value);
    if (!/[{"]\s*(explanation|answer|question|hint|example|code|visual)["\s]*:/i.test(text)) return null;
    const out = {};
    for (const key of ['title', 'type', 'explanation', 'answer', 'content', 'summary', 'question', 'checkpoint', 'hint', 'example', 'visual']) {
      const field = jsonField(text, key);
      if (field) out[key] = field;
    }
    const code = jsonField(text, 'code');
    if (code) out.code = code;
    return structuredKeys.some(k => out[k] != null) ? out : null;
  };

  const asList = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(item => {
      if (typeof item === 'string') return item.trim();
      return String(item && (item.text || item.content || item.title) || '').trim();
    }).filter(Boolean);
    if (typeof value === 'string') {
      return value.split(/\n+|;\s+/).map(item => item.replace(/^[-*\u2022\d.)\s]+/, '').trim()).filter(Boolean);
    }
    return [];
  };

  const exampleText = (example) => {
    if (!example) return '';
    if (typeof example === 'string') return example;
    return ['scenario', 'setup', 'calculation', 'result', 'explanation', 'content', 'text']
      .map(key => example[key])
      .filter(Boolean)
      .join('\n\n');
  };

  const normalize = (value) => {
    const parsed = parseMaybeJson(value) || parseMalformed(value);
    if (parsed && typeof parsed === 'object' && structuredKeys.some(k => parsed[k] != null)) {
      return {
        structured: true,
        type: parsed.type || '',
        title: parsed.title || '',
        explanation: parsed.explanation || parsed.content || parsed.answer || parsed.summary || '',
        keyPoints: asList(parsed.key_points || parsed.keyPoints || parsed.bullets || parsed.steps),
        question: parsed.question || parsed.checkpoint || parsed.checkpointQuestion || '',
        hint: parsed.hint || '',
        example: exampleText(parsed.example),
        code: parsed.code || null,
        visual: parsed.visual || null,
        raw: parsed,
      };
    }
    const text = decodeJsonish(value);
    if (/^```json/i.test(text) || /^[{\[]/.test(text) || /"(explanation|question|hint|example|code)"\s*:/.test(text)) {
      return {
        structured: true,
        type: 'answer',
        title: 'Tutor answer',
        explanation: text
          .replace(/[{}]/g, ' ')
          .replace(/"([a-zA-Z_]+)"\s*:/g, '\n$1: ')
          .replace(/",\s*"/g, '\n')
          .replace(/^"+|"+$/g, '')
          .trim(),
        keyPoints: [],
        question: '',
        hint: '',
        example: '',
        code: null,
        visual: null,
        raw: null,
      };
    }
    return { structured: false, text };
  };

  const codeObject = (code) => {
    if (!code) return null;
    if (typeof code === 'string') return { language: '', content: code, walkthrough: [] };
    return {
      language: code.language || '',
      content: code.content || code.text || '',
      walkthrough: Array.isArray(code.walkthrough) ? code.walkthrough : (Array.isArray(code.explanation) ? code.explanation : []),
    };
  };

  const toMarkdown = (value) => {
    const msg = normalize(value);
    if (!msg.structured) return msg.text;
    const code = codeObject(msg.code);
    const visual = msg.visual && typeof msg.visual === 'object'
      ? (msg.visual.caption || msg.visual.description || msg.visual.type || '')
      : (typeof msg.visual === 'string' ? msg.visual : '');
    return [
      (msg.title || msg.type) ? `### ${msg.title || String(msg.type).replace(/_/g, ' ')}` : '',
      msg.explanation ? `### Answer\n${msg.explanation}` : '',
      msg.keyPoints && msg.keyPoints.length ? `### Key points\n${msg.keyPoints.map(item => `- ${item}`).join('\n')}` : '',
      msg.example ? `### Example\n${msg.example}` : '',
      code && code.content ? `### Code\n\`\`\`${code.language || 'text'}\n${code.content}\n\`\`\`` : '',
      visual ? `### Visual\n${visual}` : '',
      msg.hint ? `### Hint\n${msg.hint}` : '',
      msg.question ? `### Check yourself\n${msg.question}` : '',
    ].filter(Boolean).join('\n\n');
  };

  const speechText = (value) => {
    return toMarkdown(value)
      .replace(/```[\s\S]*?```/g, ' code example omitted. ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[#>*_~|]/g, ' ')
      .replace(/\[(Source|source|chunk)\s*:?\s*\d+\]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 4000);
  };

  const copyText = (value) => toMarkdown(value)
    .replace(/\[(chunk|source_chunk)\s*:?\s*\d+\]/gi, '')
    .trim();

  const StructuredMessage = ({ text }) => {
    const msg = normalize(text);
    if (!msg.structured) return <TutorMarkdown text={msg.text}/>;
    const code = codeObject(msg.code);
    const visual = msg.visual && msg.visual.type && msg.visual.type !== 'none' ? msg.visual : null;
    return (
      <div style={tu.structuredMessage}>
        {(msg.title || msg.type) && <div style={tu.structuredTitle}>{msg.title || String(msg.type).replace(/_/g, ' ')}</div>}
        {msg.explanation && <TutorMarkdown text={msg.explanation}/>}
        {msg.keyPoints && msg.keyPoints.length > 0 && (
          <div style={tu.walkthrough}>
            {msg.keyPoints.slice(0, 6).map((item, i) => (
              <div key={i} style={tu.walkItem}>
                <span className="mono" style={{ fontSize: 10, color: 'var(--accent)' }}>{i + 1}</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        )}
        {msg.example && <div style={tu.exampleBox}><b>Example:</b> <TutorMarkdown text={msg.example}/></div>}
        {msg.hint && <div style={tu.hintBox}><b>Hint:</b> {msg.hint}</div>}
        {code && code.content && <pre style={tu.codeBlock}>{code.content}</pre>}
        {code && code.walkthrough && code.walkthrough.length > 0 && (
          <div style={tu.walkthrough}>
            {code.walkthrough.map((w, i) => (
              <div key={i} style={tu.walkItem}>
                <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>{w.lineRange || w.line || i + 1}</span>
                <span>{w.text || w}</span>
              </div>
            ))}
          </div>
        )}
        {visual && window.TopicVisual && <window.TopicVisual template={visual.type} data={visual} code={code} compact/>}
        {msg.question && <div style={tu.questionBox}>
          <div style={{ fontSize: 10.5, color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 7 }}>Checkpoint</div>
          <div style={{ fontSize: 13.5, color: 'var(--fg-0)', lineHeight: 1.55 }}>{msg.question}</div>
        </div>}
      </div>
    );
  };

  return { normalize, toMarkdown, copyText, speechText, StructuredMessage };
})();
window.NoesisTutorResponse = NoesisTutorResponse;

const Tutor = ({ onNav }) => {
  const Icon = window.Icon;
  const [step, setStep] = React.useState(0);
  const [mode, setMode] = React.useState('socratic');
  const [session, setSession] = React.useState(null);
  const [tutorState, setTutorState] = React.useState('material_loading');
  const [status, setStatus] = React.useState('Loading materials...');
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState('');
  const [action, setAction] = React.useState('');
  const [materials, setMaterials] = React.useState([]);
  const [selectedMaterialId, setSelectedMaterialId] = React.useState('');
  const [conceptInput, setConceptInput] = React.useState('');
  const [activeRailTab, setActiveRailTab] = React.useState('Notes');
  const [notebook, setNotebook] = React.useState([]);
  const [noteText, setNoteText] = React.useState('');
  const [answerText, setAnswerText] = React.useState('');
  const [feedback, setFeedback] = React.useState('');
  const [lastTurn, setLastTurn] = React.useState(null);
  const [failedTurn, setFailedTurn] = React.useState(null);
  const [guidedTurns, setGuidedTurns] = React.useState([]);
  const [pendingTutorAction, setPendingTutorAction] = React.useState('');
  const [voiceMode, setVoiceMode] = React.useState(() => {
    try { return localStorage.getItem('noesis.tutorVoiceMode') || 'on'; } catch (_) { return 'on'; }
  });
  const [voiceBusy, setVoiceBusy] = React.useState(false);
  const [voiceError, setVoiceError] = React.useState('');
  const [voiceAudioUrl, setVoiceAudioUrl] = React.useState('');
  const [voicePlaying, setVoicePlaying] = React.useState(false);
  const voiceAudioRef = React.useRef(null);
  const voiceCacheRef = React.useRef({});
  const [composerFocused, setComposerFocused] = React.useState(false);
  const [paused, setPaused] = React.useState(false);
  const [pauseStartedAt, setPauseStartedAt] = React.useState(null);
  const [pausedMs, setPausedMs] = React.useState(0);
  const [now, setNow] = React.useState(Date.now());

  const busy = ['starting_session', 'retrieving_context', 'generating_step', 'continuing', 'saving_note'].includes(tutorState) || !!action;
  const steps = session && Array.isArray(session.steps) ? session.steps : [];
  const currentStep = steps[step] || null;
  const sources = session && (session.sources || session.source_chunks || []) || [];
  const trace = session && session.trace || {};
  const persistedFeedback = currentStep && (currentStep.feedback || currentStep.feedback_md) || '';
  const visibleTurns = guidedTurns.filter(t => (t.stepIndex == null ? step : t.stepIndex) === step);
  const professorState = paused
    ? 'paused'
    : failedTurn
      ? 'error'
      : voicePlaying
        ? 'speaking'
        : (action === 'continue' || tutorState === 'continuing' || voiceBusy)
      ? 'thinking'
      : composerFocused || answerText.trim()
        ? 'listening'
        : (feedback || persistedFeedback || visibleTurns.length)
          ? 'explaining'
          : 'listening';

  const isGenericLabel = (value) => {
    const s = String(value || '').trim().toLowerCase();
    return !s || s === 'document' || s === 'file' || s === 'material' || /^chapter\s*\d+$/.test(s) || /^\d+$/.test(s);
  };
  const materialLabel = (m) => {
    const label = (m && (m.display_title || m.title)) || '';
    return isGenericLabel(label) ? `Material #${m && m.id}` : label;
  };

  const setSessionReady = (data) => {
    const next = data && data.session ? data.session : data;
    setSession(next);
    setMode(next.mode || mode);
    const nextIndex = next.currentStepIndex || next.current_step || 0;
    setStep(nextIndex);
    setNotebook(next.notes || []);
    const nextStep = next.steps && next.steps[nextIndex];
    setFeedback((nextStep && (nextStep.feedback || nextStep.feedback_md)) || '');
    setLastTurn(null);
    setFailedTurn(null);
    setGuidedTurns([]);
    setPendingTutorAction('');
    setAnswerText('');
    setTutorState('session_ready');
    setProgress(100);
    setStatus('Tutor session ready.');
    setActiveRailTab('Notes');
    setPaused(false);
    setPauseStartedAt(null);
    setPausedMs(0);
    setNow(Date.now());
  };

  const refreshSession = React.useCallback((id) => {
    if (!id) return Promise.resolve(null);
    return window.NoesisAPI.tutor.get(id).then((d) => {
      setSessionReady(d);
      return d;
    });
  }, []);

  const pollSession = async (sessionId) => {
    for (let i = 0; i < 120; i += 1) {
      const s = await window.NoesisAPI.tutor.status(sessionId);
      setProgress(s.progress || 0);
      setStatus(s.message || 'Preparing tutor session...');
      if (s.status === 'retrieving_context') setTutorState('retrieving_context');
      if (s.status === 'generating_step') setTutorState('generating_step');
      if (s.status === 'failed') throw new Error(s.error || 'Could not start tutor session.');
      if (s.status === 'ready') return refreshSession(sessionId);
      await new Promise(resolve => setTimeout(resolve, 900));
    }
    throw new Error('Tutor session is taking too long. Retry or choose another material.');
  };

  const startSession = async ({ materialId = null, concept = '', nextMode = mode } = {}) => {
    const selected = materialId ? materials.find(m => String(m.id) === String(materialId)) : null;
    const cleanConcept = isGenericLabel(concept) ? '' : String(concept || '').trim();
    setTutorState('starting_session');
    setProgress(8);
    setError('');
    setStatus('Starting tutor session...');
    setSession(null);
    setFeedback('');
    setLastTurn(null);
    setFailedTurn(null);
    setGuidedTurns([]);
    setPendingTutorAction('');
    setAnswerText('');
    try {
      if (materialId) {
        sessionStorage.setItem('noesis.tutorMaterialId', String(materialId));
        if (cleanConcept) sessionStorage.setItem('noesis.tutorConcept', cleanConcept);
        else sessionStorage.removeItem('noesis.tutorConcept');
      } else {
        sessionStorage.removeItem('noesis.tutorMaterialId');
        sessionStorage.setItem('noesis.tutorConcept', cleanConcept || 'Object-Oriented Programming basics');
      }
      const res = await window.NoesisAPI.tutor.start({
        material_id: materialId,
        concept: cleanConcept || (selected && materialLabel(selected)) || 'Object-Oriented Programming basics',
        mode: nextMode,
      });
      if (res.status === 'starting' && res.session_id) {
        await pollSession(res.session_id);
      } else {
        setSessionReady(res);
      }
    } catch (e) {
      setTutorState('error');
      setError(e.message || 'Could not start tutor session. Retry or choose another material.');
      setStatus('');
    }
  };

  React.useEffect(() => {
    let alive = true;
    const storedConcept = sessionStorage.getItem('noesis.tutorConcept') || '';
    const storedMatId = parseInt(sessionStorage.getItem('noesis.tutorMaterialId') || '0', 10) || null;
    setConceptInput(isGenericLabel(storedConcept) ? '' : storedConcept);
    window.NoesisAPI.materials.list()
      .then(d => {
        if (!alive) return;
        const ready = (d.materials || []).filter(m => m.status === 'ready');
        setMaterials(ready);
        const stored = ready.find(m => m.id === storedMatId);
        const first = stored || ready[0];
        if (first) {
          setSelectedMaterialId(String(first.id));
          setTutorState('ready_to_start');
          setStatus('Choose a material, then start your tutor session.');
        } else {
          setTutorState('ready_to_start');
          setStatus('Upload a material or start from the core corpus.');
        }
      })
      .catch(e => {
        if (!alive) return;
        setTutorState('error');
        setError(e.message || 'Could not load materials.');
      });
    return () => { alive = false; };
  }, []);

  React.useEffect(() => {
    if (paused) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [paused]);

  React.useEffect(() => {
    try { localStorage.setItem('noesis.tutorVoiceMode', voiceMode); } catch (_) {}
  }, [voiceMode]);

  React.useEffect(() => {
    return () => {
      if (voiceAudioRef.current) {
        try { voiceAudioRef.current.pause(); } catch (_) {}
      }
      Object.values(voiceCacheRef.current || {}).forEach(url => {
        try { URL.revokeObjectURL(url); } catch (_) {}
      });
    };
  }, []);

  const startedAt = session && session.started_at ? new Date(session.started_at).getTime() : now;
  const timerNow = paused && pauseStartedAt ? pauseStartedAt : now;
  const elapsedS = Math.max(0, Math.floor((timerNow - startedAt - pausedMs) / 1000));
  const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const togglePause = () => {
    if (!session) return;
    if (paused) {
      const resumeAt = Date.now();
      setPausedMs(ms => ms + Math.max(0, resumeAt - (pauseStartedAt || resumeAt)));
      setPauseStartedAt(null);
      setPaused(false);
      setNow(resumeAt);
      setStatus('Session resumed.');
      return;
    }
    setPauseStartedAt(Date.now());
    setPaused(true);
    setStatus('Session paused.');
  };

  const changeMode = async (nextMode) => {
    if (nextMode === mode || busy || paused) return;
    if (!session) {
      setMode(nextMode);
      return;
    }
    setAction('mode');
    setError('');
    setStatus('Changing tutor mode...');
    try {
      const res = await window.NoesisAPI.tutor.changeMode(session.sessionId || session.session_id, nextMode);
      setMode(res.mode || nextMode);
      setSession({ ...session, mode: res.mode || nextMode });
      setStatus(`Mode changed to ${res.mode || nextMode}.`);
    } catch (e) {
      setError(e.message || 'Mode change failed');
    } finally {
      setAction('');
    }
  };

  const tutorActionLabel = (nextAction) => ({
    im_confused: "I'm confused",
    give_example: 'Give an example',
    check_answer: 'Check my answer',
    continue: 'Continue',
  }[nextAction] || 'Check my answer');

  const tutorActionStatus = (nextAction) => ({
    im_confused: 'Simplifying the idea...',
    give_example: 'Preparing a concrete example...',
    check_answer: 'Checking your answer and preparing feedback...',
    continue: 'Moving to the next tutor step...',
  }[nextAction] || 'Checking your answer...');

  const friendlyTutorError = (err) => {
    const code = String((err && (err.code || err.message)) || '').trim();
    if ((err && err.status === 429) || /^rate_limited_/i.test(code)) {
      const wait = parseInt(err && err.retryAfter, 10);
      if (wait > 0) return `The tutor is catching up. Try again in ${wait} second${wait === 1 ? '' : 's'}.`;
      return 'The tutor is catching up. Please wait a few seconds and try again.';
    }
    if (/network/i.test(code)) return 'The tutor could not reach the server. Check that the backend is running, then try again.';
    return code || 'The tutor could not finish that action. Please try again.';
  };

  const clearTutorAudio = () => {
    if (voiceAudioRef.current) {
      try { voiceAudioRef.current.pause(); } catch (_) {}
      voiceAudioRef.current = null;
    }
    setVoicePlaying(false);
    setVoiceAudioUrl('');
  };

  const generateTutorVoice = async (text, cacheKey = 'latest') => {
    const speakable = window.NoesisTutorResponse ? window.NoesisTutorResponse.speechText(text) : String(text || '');
    if (voiceMode !== 'on' || !speakable.trim()) return;
    clearTutorAudio();
    setVoiceBusy(true);
    setVoiceError('');
    try {
      if (voiceCacheRef.current[cacheKey]) {
        const cached = voiceCacheRef.current[cacheKey];
        const audio = new Audio(cached);
        audio.onended = () => setVoicePlaying(false);
        voiceAudioRef.current = audio;
        setVoiceAudioUrl(cached);
        setVoicePlaying(true);
        await audio.play();
        return;
      }
      const res = await window.NoesisAPI.tutor.tts(speakable);
      if (!res.ok) throw new Error('tts_' + res.status);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      voiceCacheRef.current[cacheKey] = url;
      const audio = new Audio(url);
      audio.onended = () => setVoicePlaying(false);
      audio.onerror = () => {
        setVoicePlaying(false);
        setVoiceError('Voice playback failed.');
      };
      voiceAudioRef.current = audio;
      setVoiceAudioUrl(url);
      setVoicePlaying(true);
      audio.play().catch(() => {
        setVoicePlaying(false);
        setVoiceError('Voice is ready. Press play to listen.');
      });
    } catch (e) {
      setVoiceError(e.message || 'Voice generation failed.');
    } finally {
      setVoiceBusy(false);
    }
  };

  const toggleTutorAudio = () => {
    if (!voiceAudioUrl) return;
    let audio = voiceAudioRef.current;
    if (!audio) {
      audio = new Audio(voiceAudioUrl);
      audio.onended = () => setVoicePlaying(false);
      voiceAudioRef.current = audio;
    }
    if (voicePlaying) {
      audio.pause();
      setVoicePlaying(false);
    } else {
      audio.play().then(() => setVoicePlaying(true)).catch(() => setVoiceError('Voice playback failed.'));
    }
  };

  const continueTutor = async (choice = null, nextAction = 'check_answer') => {
    if (!session || busy || paused) return;
    const actionName = nextAction === 'confused' ? 'im_confused'
      : nextAction === 'example' ? 'give_example'
        : nextAction === 'check' ? 'check_answer'
          : nextAction === 'advance' ? 'continue'
            : nextAction;
    const submitted = choice == null ? answerText.trim() : '';
    const turnLabel = choice != null
      ? `Choice ${String.fromCharCode(65 + choice)}`
      : (submitted || tutorActionLabel(actionName));
    setTutorState('continuing');
    setAction('continue');
    setPendingTutorAction(actionName);
    setError('');
    setStatus(tutorActionStatus(actionName));
    setFailedTurn(null);
    setLastTurn(null);
    setFeedback('');
    clearTutorAudio();
    try {
      const res = await window.NoesisAPI.tutor.continue(session.sessionId || session.session_id, {
        sessionId: session.sessionId || session.session_id,
        topic: session.topic || session.concept || '',
        mode,
        action: actionName,
        currentStep: currentStep && currentStep.id,
        userAnswer: submitted,
        materialId: session.materialId || session.material_id || null,
        answer: submitted,
        choice,
        intent: actionName,
      });
      const tutorReply = res.response || res.feedback || '';
      setFeedback(tutorReply);
      const displayStepIndex = res.stay ? step : (Number.isInteger(res.currentStepIndex) ? res.currentStepIndex : step);
      const turn = {
        id: (res.turn && res.turn.id) || `local-turn-${Date.now()}`,
        action: actionName,
        userLabel: (res.turn && res.turn.userLabel) || turnLabel,
        feedback: (res.turn && (res.turn.response || res.turn.feedback)) || tutorReply,
        followUpQuestion: (res.turn && res.turn.followUpQuestion) || res.followUpQuestion || '',
        avatarState: (res.turn && res.turn.avatarState) || (res.stay ? 'listening' : 'speaking'),
        correct: res.correct,
        error: false,
        stepIndex: displayStepIndex,
        createdAt: (res.turn && res.turn.createdAt) || new Date().toISOString(),
      };
      setGuidedTurns(prev => [...prev, turn].slice(-20));
      setLastTurn({ answer: turn.userLabel, feedback: turn.feedback, cue: res.professorCue || '', followUpQuestion: turn.followUpQuestion });
      setSession({ ...session, steps: res.steps || session.steps, currentStepIndex: res.currentStepIndex, current_step: res.currentStepIndex, trace: res.trace || session.trace });
      if (res.mode) setMode(res.mode);
      setStep(res.currentStepIndex);
      setAnswerText('');
      setTutorState('session_ready');
      setStatus(res.stay || res.currentStepIndex === step ? 'The professor is staying with this step.' : 'Next tutor step ready.');
      generateTutorVoice(turn.feedback || '', turn.id);
    } catch (e) {
      const friendly = friendlyTutorError(e);
      setTutorState('session_ready');
      setStatus(friendly);
      setError('');
      const failed = {
        id: `failed-turn-${Date.now()}`,
        action: actionName,
        userLabel: turnLabel,
        feedback: friendly,
        followUpQuestion: '',
        avatarState: 'error',
        error: true,
        stepIndex: step,
        createdAt: new Date().toISOString(),
      };
      setGuidedTurns(prev => [...prev, failed].slice(-20));
      setFailedTurn({ answer: turnLabel, message: friendly });
      setFeedback('');
    } finally {
      setAction('');
      setPendingTutorAction('');
    }
  };

  const refreshNotes = React.useCallback(() => {
    if (!session) return;
    window.NoesisAPI.tutor.get(session.sessionId || session.session_id)
      .then(d => setNotebook((d.session && d.session.notes) || d.notes || []))
      .catch(() => {});
  }, [session]);

  const saveNote = async (body, noteKind = 'manual') => {
    if (!session || paused || !String(body || '').trim()) return;
    setTutorState('saving_note');
    setAction('note');
    setStatus('Saving note...');
    try {
      await window.NoesisAPI.tutor.addNote(session.sessionId || session.session_id, {
        body: String(body).trim(),
        flashcard_worthy: noteKind === 'explanation',
        stepId: currentStep && currentStep.id,
        noteKind,
        sourceRefs: currentStep && currentStep.sourceRefs || [],
      });
      setNoteText('');
      refreshNotes();
      setTutorState('session_ready');
      setStatus('Note saved.');
    } catch (e) {
      setTutorState('session_ready');
      setError(e.message || 'Note failed');
    } finally {
      setAction('');
    }
  };

  const addManualNote = async (e) => {
    if (e && e.key && e.key !== 'Enter') return;
    await saveNote(noteText, 'manual');
  };

  const finishTutor = async () => {
    if (!session || busy || paused) return;
    setAction('finish');
    setError('');
    setStatus('Finishing session...');
    try {
      await window.NoesisAPI.tutor.finish(session.sessionId || session.session_id);
      setStatus('Session saved. Returning to dashboard...');
      setTimeout(() => onNav('dashboard'), 350);
    } catch (e) {
      setError(e.message || 'Finish failed');
      setAction('');
    }
  };

  const isLastStep = step >= Math.max(0, steps.length - 1);
  const topTitle = session ? (session.topic || session.concept || 'AI Tutor') : 'AI Tutor';
  const professorCopy = {
    listening: { label: 'Listening', text: 'The professor is watching your reasoning and waiting for your next move.', icon: 'Brain' },
    thinking: { label: 'Thinking', text: 'The professor is checking your response and preparing feedback.', icon: 'Sparkle' },
    explaining: { label: 'Explaining', text: 'The professor is clarifying the current idea before moving on.', icon: 'Lightbulb' },
    speaking: { label: 'Speaking', text: 'The professor is explaining this turn. Read along or replay the voice.', icon: 'Lightbulb' },
    error: { label: 'Needs retry', text: 'That turn did not complete, but your session is still ready.', icon: 'X' },
    paused: { label: 'Paused', text: 'The session is paused. Resume when you are ready.', icon: 'Pause' },
  }[professorState] || { label: 'Listening', text: 'The professor is listening.', icon: 'Brain' };
  const ProfessorIcon = Icon[professorCopy.icon] || Icon.Brain;
  const VoiceIcon = (Icon.Volume2 || Icon.Volume || Icon.Headphones || Icon.Speaker);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <window.Topbar
        title={topTitle}
        crumbs={['AI Tutor', session ? (session.sourceTitle || 'Session') : 'Start']}
        right={<>
          <div style={{ display: 'flex', gap: 2, padding: 2, background: 'var(--bg-2)', borderRadius: 'var(--r-md)', border: '1px solid var(--line)' }}>
            {[
              { id: 'socratic', label: 'Socratic', icon: 'Brain' },
              { id: 'explain', label: 'Explain', icon: 'Lightbulb' },
              { id: 'example', label: 'Example', icon: 'Code' },
            ].map(m => {
              const C = Icon[m.icon];
              return (
                <button key={m.id} disabled={busy || paused || action === 'mode'} onClick={() => changeMode(m.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 10px', fontSize: 11.5,
                  background: mode === m.id ? 'var(--bg-0)' : 'transparent',
                  color: mode === m.id ? 'var(--fg-0)' : 'var(--fg-2)',
                  borderRadius: 6,
                }}>
                  <C size={12}/>{m.label}
                </button>
              );
            })}
          </div>
          <button className="btn btn-ghost" onClick={() => { setVoiceMode(voiceMode === 'on' ? 'off' : 'on'); if (voiceMode === 'on') clearTutorAudio(); }} disabled={busy && !session}>
            {VoiceIcon && <VoiceIcon size={11}/>} Voice {voiceMode === 'on' ? 'on' : 'off'}
          </button>
          <button className="btn btn-ghost" onClick={togglePause} disabled={!session || busy}>
            {paused ? <Icon.Play size={11}/> : <Icon.Pause size={11}/>} {paused ? 'Resume' : 'Pause'}
          </button>
        </>}
      />

      {!session && (
        <div style={tu.contextBar}>
          <div>
            <div style={{ fontSize: 10.5, color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Tutor source</div>
            <div style={{ fontSize: 13, color: 'var(--fg-1)' }}>
              {tutorState === 'material_loading' ? 'Loading your indexed materials...' : 'Choose a material and Noesis will resolve the real topic.'}
            </div>
          </div>
          <select className="input" value={selectedMaterialId} disabled={busy || !materials.length} onChange={(e) => setSelectedMaterialId(e.target.value)} style={{ width: 300, fontSize: 12.5 }}>
            {!materials.length && <option value="">No ready materials</option>}
            {materials.map(m => <option key={m.id} value={m.id}>{materialLabel(m)}</option>)}
          </select>
          <input className="input" placeholder="Focus topic (optional)" value={conceptInput} onChange={(e) => setConceptInput(e.target.value)} style={{ width: 240, fontSize: 12.5 }}/>
          <button className="btn btn-accent" disabled={busy || !selectedMaterialId} onClick={() => startSession({ materialId: parseInt(selectedMaterialId, 10), concept: conceptInput })}>
            <Icon.Sparkle size={12}/> {busy ? 'Starting...' : 'Start with material'}
          </button>
          <button className="btn btn-ghost" disabled={busy} onClick={() => startSession({ materialId: null, concept: conceptInput || 'Object-Oriented Programming basics' })}>
            Core corpus
          </button>
        </div>
      )}

      {busy && !session && (
        <div style={tu.progressBar}><div style={{ ...tu.progressFill, width: `${Math.max(8, progress)}%` }}/></div>
      )}

      <div style={tu.layout}>
        <aside style={tu.timeline}>
          <div style={{ padding: '20px 20px 10px' }}>
            <div style={{ fontSize: 10.5, color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Session plan</div>
            <div style={{ fontSize: 13, color: 'var(--fg-1)', marginTop: 6 }}>{session ? topTitle : 'No active session yet'}</div>
          </div>
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 2, position: 'relative' }}>
            {steps.length > 0 ? (
              <>
                <div style={{ position: 'absolute', left: 27, top: 18, bottom: 18, width: 1, background: 'var(--line)' }}/>
                {steps.map((s, i) => {
                  const done = s.status === 'completed' || i < step;
                  const active = i === step;
                  return (
                    <button key={s.id || i} onClick={() => { setStep(i); setFailedTurn(null); }} disabled={busy} style={{
                      display: 'flex', gap: 12, alignItems: 'flex-start',
                      padding: '10px 10px', borderRadius: 'var(--r-sm)',
                      background: active ? 'var(--bg-2)' : 'transparent',
                      textAlign: 'left', position: 'relative',
                    }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: 10, flexShrink: 0,
                        border: `1.5px solid ${done ? 'var(--accent)' : active ? 'var(--accent)' : 'var(--line-strong)'}`,
                        background: done ? 'var(--accent)' : active ? 'var(--bg-0)' : 'var(--bg-1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: done ? 'var(--bg-0)' : 'var(--accent)',
                        zIndex: 1,
                        marginTop: 2,
                      }}>
                        {done ? <Icon.Check size={11}/> : active ? <div style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--accent)', animation: 'pulse-soft 1.8s infinite' }}/> : <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>{i + 1}</span>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
                        <div style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: active ? 'var(--accent)' : 'var(--fg-3)' }}>{s.label || s.t}</div>
                        <div style={{ fontSize: 12.5, color: active ? 'var(--fg-0)' : done ? 'var(--fg-2)' : 'var(--fg-3)', marginTop: 3, lineHeight: 1.4 }}>{s.title || s.question}</div>
                      </div>
                    </button>
                  );
                })}
              </>
            ) : (
              <div style={{ padding: 12, color: 'var(--fg-3)', fontSize: 12.5, lineHeight: 1.6 }}>
                Pick a material and start a tutor session. Noesis will build the plan after it retrieves context.
              </div>
            )}
          </div>
          {session && session.learningMap && window.LearningMap && (
            <div style={{ padding: 14, borderTop: '1px solid var(--line)' }}>
              <window.LearningMap map={session.learningMap} compact/>
            </div>
          )}
          <div style={{ marginTop: 'auto', padding: 14, borderTop: '1px solid var(--line)' }}>
            <div style={{ fontSize: 11, color: 'var(--fg-3)', marginBottom: 6 }}>Session time</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 300 }}>{fmtTime(elapsedS)}</span>
              <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>/ 20:00</span>
            </div>
          </div>
        </aside>

        <main style={tu.workspace}>
          <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px 40px' }}>
            {!session && (
              <div style={tu.emptyState}>
                <div style={tu.tutorAvatar}><Icon.Sparkle size={15} style={{ color: 'var(--accent)' }}/></div>
                <h1 style={tu.emptyTitle}>{busy ? 'Preparing your tutor session' : 'Start a grounded tutor session'}</h1>
                <p style={tu.emptyText}>{status || 'Choose a material above. The tutor will resolve the real topic, retrieve sources, and open with a useful warm-up.'}</p>
                {busy && <div style={tu.skeletonStack}>{[0, 1, 2].map(i => <div key={i} style={{ height: 10, borderRadius: 999, background: 'var(--bg-2)', border: '1px solid var(--line)', width: `${100 - i * 18}%` }}/>)}</div>}
                {error && <button className="btn btn-accent" onClick={() => startSession({ materialId: selectedMaterialId ? parseInt(selectedMaterialId, 10) : null, concept: conceptInput })}><Icon.Sparkle size={12}/> Retry</button>}
              </div>
            )}

            {session && currentStep && (
              <>
                <div style={{ fontSize: 11, color: 'var(--accent)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 10 }}>
                  Step {String(step + 1).padStart(2, '0')} · {currentStep.label || currentStep.t}
                </div>
                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 300, margin: '0 0 18px', lineHeight: 1.2 }}>
                  {currentStep.title || currentStep.question}
                </h1>
                <div style={tu.lessonCard}>
                  <div style={tu.professorPanel}>
                    {window.TutorAvatar
                      ? <window.TutorAvatar state={professorState === 'explaining' ? 'speaking' : professorState} size={50}/>
                      : <div style={tu.professorAvatar}>
                        <ProfessorIcon size={18} style={{ color: 'var(--accent)' }}/>
                        <span style={{ ...tu.professorPulse, opacity: professorState === 'listening' ? 1 : 0.35 }}/>
                      </div>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <b style={{ color: 'var(--fg-0)', fontSize: 13.5 }}>Professor Tutor</b>
                        <span style={tu.statePill}>{professorCopy.label}</span>
                      </div>
                      <div style={{ marginTop: 4, color: 'var(--fg-2)', fontSize: 12.5, lineHeight: 1.5 }}>{professorCopy.text}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={tu.tutorAvatar}><Icon.Sparkle size={13} style={{ color: 'var(--accent)' }}/></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, color: 'var(--fg-0)', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{currentStep.content}</div>
                      {currentStep.example && <div style={tu.exampleBox}><b>Example:</b> {currentStep.example}</div>}
                    </div>
                  </div>

                  {currentStep.visual && window.TopicVisual && (
                    <div style={{ marginTop: 18 }}>
                      <window.TopicVisual template={currentStep.visual.type} data={currentStep.visual} code={currentStep.code} compact/>
                    </div>
                  )}

                  {currentStep.code && (
                    <pre style={tu.codeBlock}>{currentStep.code.content}</pre>
                  )}

                  {currentStep.code && currentStep.code.walkthrough && (
                    <div style={tu.walkthrough}>
                      {currentStep.code.walkthrough.map((w, i) => (
                        <div key={i} style={tu.walkItem}><span className="mono">Line {w.lineRange}</span>{w.text}</div>
                      ))}
                    </div>
                  )}

                  <div style={tu.questionBox}>
                    <div style={{ fontSize: 10.5, color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 7 }}>Check your understanding</div>
                    <div style={{ fontSize: 14, color: 'var(--fg-0)', lineHeight: 1.55 }}>{currentStep.question}</div>
                    {currentStep.hint && <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--fg-2)' }}>Hint: {currentStep.hint}</div>}
                  </div>

                  {currentStep.options && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
                      {currentStep.options.map((label, i) => (
                        <button key={i} disabled={busy || paused} onClick={() => continueTutor(i)} style={tu.choice}>
                          <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', width: 14 }}>{String.fromCharCode(65 + i)}</span>
                          <span style={{ flex: 1, fontSize: 13, color: 'var(--fg-0)' }}>{label}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {!currentStep.options && (
                    <textarea className="input" value={answerText} onChange={e => setAnswerText(e.target.value)} onFocus={() => setComposerFocused(true)} onBlur={() => setComposerFocused(false)} disabled={busy || paused}
                              placeholder="Write a short answer, or continue when you're ready..."
                              style={{ width: '100%', minHeight: 82, marginTop: 16, fontSize: 13, resize: 'vertical' }}/>
                  )}

                  <div style={tu.quickActions}>
                    <button className="btn btn-ghost" disabled={!session || paused || busy} onClick={() => continueTutor(null, 'im_confused')}>
                      <Icon.Brain size={12}/> {pendingTutorAction === 'im_confused' ? 'Simplifying...' : "I'm confused"}
                    </button>
                    <button className="btn btn-ghost" disabled={!session || paused || busy} onClick={() => continueTutor(null, 'give_example')}>
                      <Icon.Lightbulb size={12}/> {pendingTutorAction === 'give_example' ? 'Building example...' : 'Give an example'}
                    </button>
                    <button className="btn btn-ghost" disabled={!session || paused || busy || (!answerText.trim() && !currentStep.options)} onClick={() => continueTutor(null, 'check_answer')}>
                      <Icon.Check size={12}/> {pendingTutorAction === 'check_answer' ? 'Checking...' : 'Check my answer'}
                    </button>
                  </div>

                  {(visibleTurns.length > 0 || feedback || persistedFeedback) && (
                    <div style={tu.conversation}>
                      {visibleTurns.length > 0 ? visibleTurns.map((turn) => (
                        <React.Fragment key={turn.id}>
                          <div style={{ ...tu.bubble, ...tu.studentBubble }}><b>You</b><div>{turn.userLabel}</div></div>
                          <div style={{ ...tu.bubble, ...tu.tutorBubble, ...(turn.error ? { borderColor: 'var(--warn)' } : {}) }}>
                            <div style={tu.turnHeader}>
                              {window.TutorAvatar && <window.TutorAvatar state={turn.error ? 'error' : (turn.avatarState || 'speaking')} size={30}/>}
                              <b>Professor Tutor</b>
                              <span style={tu.turnAction}>{tutorActionLabel(turn.action)}</span>
                            </div>
                            {turn.error
                              ? <div style={tu.failedTurn}>{turn.feedback}</div>
                              : <TutorMessage text={turn.feedback}/>}
                            {turn.followUpQuestion && <div style={tu.followUp}>{turn.followUpQuestion}</div>}
                            {!turn.error && turn.id === (visibleTurns[visibleTurns.length - 1] && visibleTurns[visibleTurns.length - 1].id) && (voiceMode === 'on' || voiceBusy || voiceAudioUrl || voiceError) && (
                              <div style={tu.voiceRow}>
                                <button className="btn btn-ghost" style={{ padding: '5px 9px', fontSize: 11 }} disabled={!voiceAudioUrl || voiceBusy} onClick={toggleTutorAudio}>
                                  {voicePlaying ? <Icon.Pause size={11}/> : <Icon.Play size={11}/>} {voicePlaying ? 'Pause' : 'Play'}
                                </button>
                                {voiceBusy && <span>Generating voice...</span>}
                                {voiceError && <span style={{ color: 'var(--warn)' }}>{voiceError}</span>}
                                {!voiceBusy && voiceAudioUrl && <span>Voice ready</span>}
                              </div>
                            )}
                          </div>
                        </React.Fragment>
                      )) : (
                        <div style={{ ...tu.bubble, ...tu.tutorBubble }}>
                          <b>Professor Tutor</b>
                          <TutorMessage text={feedback || persistedFeedback}/>
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ marginTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button className="btn btn-accent" disabled={!session || paused || busy} onClick={() => isLastStep ? finishTutor() : continueTutor(null, answerText.trim() ? 'check_answer' : 'continue')}>
                      {action === 'continue' ? <>Preparing... <Icon.Sparkle size={12}/></> : !isLastStep ? <>Continue <Icon.ArrowRight size={12}/></> : <>Finish <Icon.Check size={12}/></>}
                    </button>
                    <button className="btn btn-bare" disabled={!session || paused || busy} onClick={() => saveNote(`${currentStep.title}\n\n${currentStep.content}${currentStep.example ? `\n\nExample: ${currentStep.example}` : ''}`, 'explanation')}>
                      <Icon.Bookmark size={12}/> Save explanation
                    </button>
                    <button className="btn btn-ghost" disabled={busy} onClick={() => { setSession(null); setFeedback(''); setLastTurn(null); setFailedTurn(null); setGuidedTurns([]); setPendingTutorAction(''); setTutorState('ready_to_start'); setStatus('Choose a material, then start your tutor session.'); }}>
                      New session
                    </button>
                  </div>
                  {status && <div style={{ marginTop: 12, color: 'var(--fg-3)', fontSize: 12 }}>{status}</div>}
                  {error && <div style={{ marginTop: 12, color: 'var(--err)', fontSize: 12 }}>{error}</div>}
                </div>
              </>
            )}
          </div>
        </main>

        <aside style={tu.rail}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', gap: 2, padding: 2, background: 'var(--bg-2)', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)' }}>
              {['Trace', 'Notes', 'Sources'].map((t) => (
                <button key={t} onClick={() => setActiveRailTab(t)} style={{
                  flex: 1, padding: '5px 8px', fontSize: 11.5,
                  background: activeRailTab === t ? 'var(--bg-0)' : 'transparent',
                  color: activeRailTab === t ? 'var(--fg-0)' : 'var(--fg-2)',
                  borderRadius: 4,
                }}>{t}</button>
              ))}
            </div>
          </div>

          <div style={{ padding: 18, overflow: 'auto', flex: 1 }}>
            {activeRailTab === 'Trace' && (
              <>
                <RailTitle title="Tutor trace"/>
                <TraceRow label="State" value={tutorState}/>
                <TraceRow label="Provider" value={trace.provider || '—'}/>
                <TraceRow label="Model" value={trace.model || '—'}/>
                <TraceRow label="Topic" value={trace.topic || (session && session.topic) || '—'}/>
                <TraceRow label="Grounding" value={trace.groundingTier || '—'}/>
                <TraceRow label="Chunks" value={trace.chunksRetrieved == null ? '—' : trace.chunksRetrieved}/>
                <TraceRow label="Retrieval" value={trace.retrievalMs == null ? '—' : `${trace.retrievalMs} ms`}/>
                <TraceRow label="Generation" value={trace.generationMs == null ? '—' : `${trace.generationMs} ms`}/>
                <TraceRow label="Cache" value={trace.cacheHit ? 'hit' : 'miss'}/>
                {(trace.warnings || []).map((w, i) => <div key={i} style={tu.traceWarn}>{w}</div>)}
              </>
            )}

            {activeRailTab === 'Sources' && (
              <>
                <RailTitle title="Grounding sources"/>
                {sources.length === 0 && <div style={tu.emptyRail}>Sources will appear after the tutor retrieves material context.</div>}
                {sources.map((c, i) => (
                  <div key={`${c.id || c.chunkId}-${i}`} style={tu.sourceEntry}>
                    <div style={{ fontSize: 11, color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                      Source {i + 1} · {c.location || c.heading || 'Material excerpt'}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--fg-0)', marginBottom: 6 }}>{c.heading || c.materialTitle}</div>
                    <div style={{ fontSize: 12.2, color: 'var(--fg-2)', lineHeight: 1.55 }}>{c.excerpt || c.text}</div>
                  </div>
                ))}
              </>
            )}

            {activeRailTab === 'Notes' && (
              <>
                <RailTitle title="Your notebook"/>
                {notebook.length === 0 && <div style={tu.emptyRail}>No notes yet. Save a tutor explanation or write your own note.</div>}
                {notebook.map((n) => (
                  <div key={n.id} style={{ ...tu.noteEntry, ...(n.flashcard_worthy ? { borderLeft: '2px solid var(--accent)', paddingLeft: 10 } : {}) }}>
                    <div className="mono" style={{ fontSize: 10, color: n.flashcard_worthy ? 'var(--accent)' : 'var(--fg-3)', marginBottom: 4 }}>
                      {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--fg-1)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{n.body}</div>
                  </div>
                ))}
              </>
            )}
          </div>

          <div style={{ padding: 14, borderTop: '1px solid var(--line)', display: 'flex', gap: 8 }}>
            <input className="input" placeholder="Add a note (Enter to save)..." value={noteText}
                   onChange={(e) => setNoteText(e.target.value)} onKeyDown={addManualNote}
                   disabled={paused || !session || busy}
                   style={{ flex: 1, fontSize: 12.5 }}/>
            <button className="btn btn-bare" style={{ padding: 8 }} disabled={paused || !session || busy} onClick={() => addManualNote()}><Icon.Send size={14}/></button>
          </div>
        </aside>
      </div>
    </div>
  );
};

const TutorMarkdown = ({ text }) => {
  const raw = String(text || '');
  if (!raw) return null;
  if (window.marked && window.DOMPurify) {
    return <div className="md-rendered" style={tu.tutorMarkdown} dangerouslySetInnerHTML={{ __html: window.DOMPurify.sanitize(window.marked.parse(raw)) }} />;
  }
  return <div style={{ whiteSpace: 'pre-wrap' }}>{raw}</div>;
};

const TutorMessage = ({ text }) => {
  const Structured = window.NoesisTutorResponse && window.NoesisTutorResponse.StructuredMessage;
  return Structured ? <Structured text={text}/> : <TutorMarkdown text={text}/>;
};

const RailTitle = ({ title }) => <div style={{ fontSize: 10.5, color: 'var(--fg-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>{title}</div>;
const TraceRow = ({ label, value }) => (
  <div style={tu.traceRow}>
    <span>{label}</span>
    <b>{String(value)}</b>
  </div>
);

const tu = {
  layout: { display: 'grid', gridTemplateColumns: '280px 1fr 340px', flex: 1, minHeight: 'calc(100vh - 57px)' },
  contextBar: {
    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
    padding: '12px 18px', borderBottom: '1px solid var(--line)',
    background: 'var(--bg-1)',
  },
  progressBar: { height: 3, background: 'var(--bg-2)', borderBottom: '1px solid var(--line)' },
  progressFill: { height: '100%', background: 'var(--accent)', transition: 'width 260ms var(--ease-out)' },
  timeline: { borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', background: 'var(--bg-0)' },
  workspace: { overflow: 'auto', background: 'var(--bg-0)' },
  rail: { borderLeft: '1px solid var(--line)', display: 'flex', flexDirection: 'column', background: 'var(--bg-0)' },
  tutorAvatar: {
    width: 28, height: 28, borderRadius: 8,
    background: 'var(--accent-glow)', border: '1px solid var(--accent-soft)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  emptyState: {
    minHeight: 480, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    textAlign: 'center', gap: 14, color: 'var(--fg-1)',
  },
  emptyTitle: { fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 300, margin: 0 },
  emptyText: { maxWidth: 480, fontSize: 14, lineHeight: 1.7, color: 'var(--fg-2)', margin: 0 },
  skeletonStack: { display: 'grid', gap: 8, width: 360 },
  lessonCard: { marginTop: 22, padding: 18, border: '1px solid var(--line)', borderRadius: 'var(--r-md)', background: 'var(--bg-1)' },
  professorPanel: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: 12, marginBottom: 16,
    borderRadius: 8, border: '1px solid var(--accent-soft)',
    background: 'var(--accent-glow)',
  },
  professorAvatar: {
    width: 42, height: 42, borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    position: 'relative', flexShrink: 0,
    background: 'var(--bg-0)', border: '1px solid var(--accent-soft)',
  },
  professorPulse: {
    position: 'absolute', right: 5, bottom: 5,
    width: 8, height: 8, borderRadius: 999,
    background: 'var(--accent)', boxShadow: '0 0 0 4px var(--accent-glow)',
  },
  statePill: {
    padding: '3px 7px', borderRadius: 999,
    fontSize: 10.5, color: 'var(--accent)',
    background: 'var(--bg-0)', border: '1px solid var(--accent-soft)',
  },
  exampleBox: { marginTop: 12, padding: 12, borderRadius: 8, background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--fg-1)', fontSize: 13 },
  codeBlock: { marginTop: 16, padding: 16, borderRadius: 8, background: '#0f172a', color: '#dbeafe', overflow: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12.5, lineHeight: 1.6 },
  walkthrough: { display: 'grid', gap: 8, marginTop: 10 },
  walkItem: { display: 'flex', gap: 10, alignItems: 'flex-start', color: 'var(--fg-2)', fontSize: 12.5, lineHeight: 1.5 },
  questionBox: { marginTop: 16, padding: 14, borderRadius: 8, border: '1px solid var(--accent-soft)', background: 'var(--accent-glow)' },
  choice: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '12px 14px', borderRadius: 'var(--r-md)',
    border: '1px solid var(--line)', background: 'var(--bg-1)',
    textAlign: 'left',
  },
  quickActions: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 },
  conversation: { display: 'grid', gap: 10, marginTop: 16 },
  bubble: { padding: 12, borderRadius: 8, lineHeight: 1.6, fontSize: 13, border: '1px solid var(--line)' },
  studentBubble: { justifySelf: 'end', maxWidth: '82%', background: 'var(--bg-2)', color: 'var(--fg-1)' },
  tutorBubble: { justifySelf: 'start', maxWidth: '92%', background: 'var(--bg-0)', color: 'var(--fg-1)', borderColor: 'var(--accent-soft)' },
  turnHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  turnAction: { fontSize: 10.5, color: 'var(--accent)', border: '1px solid var(--accent-soft)', background: 'var(--accent-glow)', borderRadius: 999, padding: '2px 7px' },
  tutorMarkdown: { fontSize: 13, lineHeight: 1.65, color: 'var(--fg-1)' },
  structuredMessage: { display: 'grid', gap: 10 },
  structuredTitle: { fontSize: 14, fontWeight: 700, color: 'var(--fg-0)', marginBottom: 2 },
  hintBox: { padding: 11, borderRadius: 8, background: 'var(--accent-glow)', border: '1px solid var(--accent-soft)', color: 'var(--fg-1)', fontSize: 12.8, lineHeight: 1.55 },
  followUp: { marginTop: 8, color: 'var(--fg-2)', fontSize: 12.5 },
  failedTurn: { marginTop: 8, color: 'var(--warn)', lineHeight: 1.55 },
  voiceRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10, color: 'var(--fg-3)', fontSize: 11.5 },
  feedback: { marginTop: 16, padding: 14, borderRadius: 8, background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--fg-1)', lineHeight: 1.6 },
  noteEntry: { marginBottom: 16 },
  sourceEntry: { marginBottom: 14, padding: 12, borderRadius: 'var(--r-sm)', background: 'var(--bg-1)', border: '1px solid var(--line)' },
  emptyRail: { fontSize: 12.5, color: 'var(--fg-3)', lineHeight: 1.6 },
  traceRow: { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--line)', fontSize: 12, color: 'var(--fg-2)' },
  traceWarn: { marginTop: 10, padding: 10, borderRadius: 8, background: 'color-mix(in oklab, var(--warn) 12%, transparent)', color: 'var(--fg-1)', fontSize: 12, lineHeight: 1.5 },
};

window.Tutor = Tutor;
