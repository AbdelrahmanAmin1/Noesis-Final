'use strict';
window.__NOESIS_BOOT = { startedAt: Date.now(), files: [] };

// ---- api.js ----
(function () {
  window.__NOESIS_BOOT.files.push("api.js");
// Noesis frontend API helper. Reads token from localStorage('noesis.token').
// Auto-redirects to auth on 401 via window event 'noesis:logout'.

(function () {
  const BASE = (window.NOESIS_API_BASE || 'http://localhost:3001') + '/api';
  const TOKEN_KEY = 'noesis.token';

  function token() { return localStorage.getItem(TOKEN_KEY) || ''; }
  function setToken(t) { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); }

  async function req(method, path, body, opts = {}) {
    const headers = { 'Accept': 'application/json' };
    let payload = body;
    if (body && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const t = token();
    if (t) headers['Authorization'] = 'Bearer ' + t;

    let res;
    try {
      res = await fetch(BASE + path, { method, headers, body: payload, credentials: 'include' });
    } catch (networkErr) {
      throw new Error('Network error: ' + networkErr.message);
    }
    if (res.status === 401 && !opts.noLogout) {
      setToken('');
      window.dispatchEvent(new CustomEvent('noesis:logout'));
    }
    if (opts.raw) return res;
    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) {
      const fallbackMsg = res.status === 429
        ? 'Too many requests in a short time. Please wait a moment and try again.'
        : 'http_' + res.status;
      const msg = (data && (data.message || data.error)) || fallbackMsg;
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      err.code = data && data.error;
      err.retryAfter = res.headers && res.headers.get('Retry-After');
      throw err;
    }
    return data;
  }

  const api = {
    BASE,
    token,
    setToken,
    // Cookie-mode: presence of localStorage token is no longer authoritative.
    // The real probe is api.auth.me(). Kept for backwards compat.
    isAuthed: () => !!token(),

    auth: {
      signup: (b) => req('POST', '/auth/signup', b, { noLogout: true }),
      signin: (b) => req('POST', '/auth/signin', b, { noLogout: true }),
      signout: async () => {
        try { await req('POST', '/auth/signout'); } catch (_) {}
        setToken('');
        window.dispatchEvent(new CustomEvent('noesis:logout'));
      },
      onboarding: (b) => req('POST', '/auth/onboarding', b),
      me: () => req('GET', '/auth/me'),
      deleteMe: () => req('DELETE', '/auth/me'),
      exportUrl: () => BASE + '/auth/export',
    },

    user: {
      getPrefs: () => req('GET', '/user/prefs'),
      updatePrefs: (b) => req('PUT', '/user/prefs', b),
      updateProfile: (b) => req('PUT', '/user/profile', b),
      changePassword: (b) => req('PUT', '/user/password', b),
    },

    profile: {
      get: () => req('GET', '/auth/me'),
      update: (b) => req('PUT', '/user/profile', b),
    },

    materials: {
      list: () => req('GET', '/materials'),
      get: (id) => req('GET', '/materials/' + id),
      chunks: (id, chapter) => req('GET', '/materials/' + id + '/chunks' + (chapter ? ('?chapter=' + chapter) : '')),
      upload: (file) => {
        const fd = new FormData();
        fd.append('file', file);
        return req('POST', '/materials', fd);
      },
      remove: (id) => req('DELETE', '/materials/' + id),
      topicMap: (id) => req('GET', '/materials/' + id + '/topic-map'),
      refreshTopicMap: (id, b) => req('POST', '/materials/' + id + '/topic-map/refresh', b || {}),
      sourceVisuals: (id) => req('GET', '/materials/' + id + '/source-visuals'),
      sourceVisualImageUrl: (id, cid) => BASE + '/materials/' + id + '/source-visuals/' + cid + '/image',
      sourceVisualImageBlobUrl: async (id, cid) => {
        const res = await req('GET', '/materials/' + id + '/source-visuals/' + cid + '/image', null, { raw: true });
        if (!res.ok) throw new Error('source_visual_' + res.status);
        const blob = await res.blob();
        return URL.createObjectURL(blob);
      },
    },

    notes: {
      list: (folder) => req('GET', '/notes' + (folder ? '?folder=' + encodeURIComponent(folder) : '')),
      get: (id) => req('GET', '/notes/' + id),
      create: (b) => req('POST', '/notes', b),
      update: (id, b) => req('PUT', '/notes/' + id, b),
      remove: (id) => req('DELETE', '/notes/' + id),
      generate: (b) => req('POST', '/notes/generate', b),
      audio: (id, b) => req('POST', '/notes/' + id + '/audio', b),
      audioMeta: (id, style) => req('GET', '/notes/' + id + '/audio?meta=1&style=' + encodeURIComponent(style || 'brief')),
      audioBlob: (id, style) => req('GET', '/notes/' + id + '/audio?style=' + encodeURIComponent(style || 'brief'), null, { raw: true }),
    },

    flashcards: {
      list: (materialId) => req('GET', '/flashcards' + (materialId ? '?material_id=' + encodeURIComponent(materialId) : '')),
      due: () => req('GET', '/flashcards/due'),
      generate: (b) => req('POST', '/flashcards/generate', b),
      review: (id, rating) => req('POST', '/flashcards/' + id + '/review', { rating }),
    },

    quizzes: {
      list: () => req('GET', '/quizzes'),
      generate: (b) => req('POST', '/quizzes/generate', b),
      get: (id) => req('GET', '/quizzes/' + id),
      attempt: (id) => req('POST', '/quizzes/' + id + '/attempt'),
      answer: (attemptId, b) => req('POST', '/quizzes/attempts/' + attemptId + '/answer', b),
      finish: (attemptId) => req('POST', '/quizzes/attempts/' + attemptId + '/finish'),
      wrong: () => req('GET', '/quizzes/wrong-answers'),
    },

    tutor: {
      start: (b) => req('POST', '/tutor/sessions', b),
      get: (id) => req('GET', '/tutor/sessions/' + id),
      status: (id) => req('GET', '/tutor/sessions/' + id + '/status'),
      continue: (id, b) => req('POST', '/tutor/sessions/' + id + '/continue', b),
      sources: (id) => req('GET', '/tutor/sessions/' + id + '/sources'),
      trace: (id) => req('GET', '/tutor/sessions/' + id + '/trace'),
      changeMode: (id, mode) => req('PATCH', '/tutor/sessions/' + id + '/mode', { mode }),
      answer: (id, idx, b) => req('POST', '/tutor/sessions/' + id + '/step/' + idx + '/answer', b),
      addNote: (id, b) => req('POST', '/tutor/sessions/' + id + '/notes', b),
      finish: (id) => req('POST', '/tutor/sessions/' + id + '/finish'),
      tts: (text) => req('POST', '/tutor/tts', { text }, { raw: true }),
      chat: (b) => req('POST', '/tutor/chat', b),
      chatConversations: () => req('GET', '/tutor/chat/conversations'),
      chatMessages: (id, opts) => {
        const params = new URLSearchParams();
        if (opts && opts.limit) params.set('limit', opts.limit);
        if (opts && opts.offset) params.set('offset', opts.offset);
        const q = params.toString() ? '?' + params.toString() : '';
        return req('GET', '/tutor/chat/' + id + '/messages' + q);
      },
      chatDelete: (id) => req('DELETE', '/tutor/chat/' + id),
    },

    dashboard: {
      get: () => req('GET', '/dashboard'),
      progress: () => req('GET', '/dashboard/progress'),
    },

    videos: {
      generate: (b) => req('POST', '/videos', b),
      get: (id) => req('GET', '/videos/' + id),
      storyboards: (materialId) => req('GET', '/videos/storyboard' + (materialId ? '?material_id=' + encodeURIComponent(materialId) : '')),
      storyboard: (id) => req('GET', '/videos/storyboard/' + id),
      createStoryboard: (b) => req('POST', '/videos/storyboard', b),
      updateScene: (id, sceneId, b) => req('PATCH', '/videos/storyboard/' + id + '/scene/' + encodeURIComponent(sceneId), b),
      regenerateScene: (id, b) => req('POST', '/videos/storyboard/' + id + '/regenerate-scene', b),
      regenerateTopic: (id, b) => req('POST', '/videos/storyboard/' + id + '/regenerate-topic', b),
      fixScene: (id, b) => req('POST', '/videos/storyboard/' + id + '/fix-scene', b),
      fixStoryboardIssue: (id, b) => req('POST', '/videos/storyboard/' + id + '/fix', b),
      repairStoryboard: (id, b) => req('POST', '/videos/storyboard/' + id + '/repair', b),
      recheckStoryboard: (id) => req('POST', '/videos/storyboard/' + id + '/recheck'),
      approveStoryboard: (id, b) => req('POST', '/videos/storyboard/' + id + '/approve', b),
      renderStoryboard: (id) => req('POST', '/videos/storyboard/' + id + '/render'),
      scenePreviewUrl: (id, sceneId) => BASE + '/videos/storyboard/' + id + '/scene/' + encodeURIComponent(sceneId) + '/preview',
      fileUrl: (id) => BASE + '/videos/' + id + '/file',
      fileBlobUrl: async (id) => {
        const res = await req('GET', '/videos/' + id + '/file', null, { raw: true });
        if (!res.ok) throw new Error('video_file_' + res.status);
        const blob = await res.blob();
        return URL.createObjectURL(blob);
      },
    },

    study: {
      learningMap: (materialId) => req('GET', '/study/learning-map' + (materialId ? '?material_id=' + encodeURIComponent(materialId) : '')),
      createPlan: (b) => req('POST', '/study/plans', b || {}),
      activePlan: () => req('GET', '/study/plans/active'),
      getPlan: (id) => req('GET', '/study/plans/' + id),
      approvePlan: (id) => req('POST', '/study/plans/' + id + '/approve'),
      completeTask: (id) => req('POST', '/study/tasks/' + id + '/complete'),
    },

    gamification: {
      summary: () => req('GET', '/gamification/summary'),
      events: (limit) => req('GET', '/gamification/events' + (limit ? '?limit=' + encodeURIComponent(limit) : '')),
      achievements: () => req('GET', '/gamification/achievements'),
    },

    leaderboards: {
      global: () => req('GET', '/leaderboards/global'),
      weekly: () => req('GET', '/leaderboards/weekly'),
      friends: () => req('GET', '/leaderboards/friends'),
    },

    users: {
      search: (q) => req('GET', '/users/search?q=' + encodeURIComponent(q || '')),
    },

    friends: {
      list: () => req('GET', '/friends'),
      requests: () => req('GET', '/friends/requests'),
      request: (recipientId) => req('POST', '/friends/request', { recipient_id: recipientId }),
      accept: (id) => req('POST', '/friends/requests/' + id + '/accept'),
      reject: (id) => req('POST', '/friends/requests/' + id + '/reject'),
      remove: (friendId) => req('DELETE', '/friends/' + friendId),
    },

    rooms: {
      list: () => req('GET', '/rooms'),
      create: (b) => req('POST', '/rooms', b),
      get: (id) => req('GET', '/rooms/' + id),
      join: (id) => req('POST', '/rooms/' + id + '/join'),
      joinByCode: (code) => req('POST', '/rooms/join-by-code', { code }),
      leave: (id) => req('POST', '/rooms/' + id + '/leave'),
      members: (id) => req('GET', '/rooms/' + id + '/members'),
      activity: (id) => req('GET', '/rooms/' + id + '/activity'),
      messages: (id) => req('GET', '/rooms/' + id + '/messages'),
      postMessage: (id, body) => req('POST', '/rooms/' + id + '/messages', { body }),
      shareNote: (id, noteId) => req('POST', '/rooms/' + id + '/share-note', { note_id: noteId }),
      shareQuiz: (id, quizId) => req('POST', '/rooms/' + id + '/share-quiz', { quiz_id: quizId }),
      startSharedQuiz: (id, shareId) => req('POST', '/rooms/' + id + '/shared-quizzes/' + shareId + '/start'),
      leaderboard: (id) => req('GET', '/rooms/' + id + '/leaderboard'),
    },

    jobs: {
      get: (id) => req('GET', '/jobs/' + id),
    },

    pollJob: async (jobId, { intervalMs = 1500, timeoutMs = 600000, onProgress } = {}) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const j = await req('GET', '/jobs/' + jobId);
        if (onProgress) onProgress(j);
        if (j.status === 'completed') return j;
        if (j.status === 'failed') throw new Error(j.error || 'job_failed');
        await new Promise(r => setTimeout(r, intervalMs));
      }
      throw new Error('job_timeout');
    },
  };

  window.NoesisAPI = api;
})();

})();


// ---- components/Icons.jsx ----
(function () {
  window.__NOESIS_BOOT.files.push("components/Icons.jsx");
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const I = ({
  children,
  size = 18,
  ...p
}) => React.createElement("svg", _extends({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.6",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, p), children);
const Icon = {
  Home: p => React.createElement(I, p, React.createElement("path", {
    d: "M3 11l9-7 9 7"
  }), React.createElement("path", {
    d: "M5 10v10h14V10"
  })),
  Sparkle: p => React.createElement(I, p, React.createElement("path", {
    d: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"
  }), React.createElement("path", {
    d: "M19 17l.7 2 .3 .7 .7 .3 2 .7-2 .7-.7 .3-.3 .7-.7 2-.7-2-.3-.7-.7-.3-2-.7 2-.7.7-.3.3-.7z",
    opacity: ".6"
  })),
  Book: p => React.createElement(I, p, React.createElement("path", {
    d: "M4 5c0-1.1.9-2 2-2h12v16H6a2 2 0 00-2 2V5z"
  }), React.createElement("path", {
    d: "M4 19.5A2.5 2.5 0 016.5 17H18"
  })),
  Cards: p => React.createElement(I, p, React.createElement("rect", {
    x: "3",
    y: "5",
    width: "14",
    height: "14",
    rx: "2",
    transform: "rotate(-6 10 12)"
  }), React.createElement("rect", {
    x: "6",
    y: "5",
    width: "14",
    height: "14",
    rx: "2"
  })),
  Target: p => React.createElement(I, p, React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "9"
  }), React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "5"
  }), React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "1.2",
    fill: "currentColor"
  })),
  Folder: p => React.createElement(I, p, React.createElement("path", {
    d: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
  })),
  Users: p => React.createElement(I, p, React.createElement("circle", {
    cx: "9",
    cy: "8",
    r: "3"
  }), React.createElement("path", {
    d: "M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"
  }), React.createElement("circle", {
    cx: "17",
    cy: "9",
    r: "2.5"
  }), React.createElement("path", {
    d: "M21 19c0-2.5-1.8-4.5-4-4.5"
  })),
  Cog: p => React.createElement(I, p, React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "3"
  }), React.createElement("path", {
    d: "M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.6V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.6 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.6-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.6-1.1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.6V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.6 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.6 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.6 1z"
  })),
  Chart: p => React.createElement(I, p, React.createElement("path", {
    d: "M3 3v18h18"
  }), React.createElement("path", {
    d: "M7 14l4-4 3 3 6-7"
  })),
  Search: p => React.createElement(I, p, React.createElement("circle", {
    cx: "11",
    cy: "11",
    r: "7"
  }), React.createElement("path", {
    d: "M20 20l-3.5-3.5"
  })),
  Plus: p => React.createElement(I, p, React.createElement("path", {
    d: "M12 5v14M5 12h14"
  })),
  ArrowRight: p => React.createElement(I, p, React.createElement("path", {
    d: "M5 12h14M13 6l6 6-6 6"
  })),
  ArrowLeft: p => React.createElement(I, p, React.createElement("path", {
    d: "M19 12H5M11 18l-6-6 6-6"
  })),
  ArrowUpRight: p => React.createElement(I, p, React.createElement("path", {
    d: "M7 17L17 7M9 7h8v8"
  })),
  RotateCcw: p => React.createElement(I, p, React.createElement("path", {
    d: "M3 12a9 9 0 109-9 9.7 9.7 0 00-6.7 2.7L3 8"
  }), React.createElement("path", {
    d: "M3 3v5h5"
  })),
  Check: p => React.createElement(I, p, React.createElement("path", {
    d: "M5 12l5 5L20 7"
  })),
  X: p => React.createElement(I, p, React.createElement("path", {
    d: "M6 6l12 12M18 6l-12 12"
  })),
  ChevronRight: p => React.createElement(I, p, React.createElement("path", {
    d: "M9 6l6 6-6 6"
  })),
  ChevronDown: p => React.createElement(I, p, React.createElement("path", {
    d: "M6 9l6 6 6-6"
  })),
  ChevronLeft: p => React.createElement(I, p, React.createElement("path", {
    d: "M15 6l-6 6 6 6"
  })),
  Play: p => React.createElement(I, p, React.createElement("path", {
    d: "M6 4l14 8-14 8z",
    fill: "currentColor"
  })),
  Pause: p => React.createElement(I, p, React.createElement("rect", {
    x: "6",
    y: "4",
    width: "4",
    height: "16",
    fill: "currentColor"
  }), React.createElement("rect", {
    x: "14",
    y: "4",
    width: "4",
    height: "16",
    fill: "currentColor"
  })),
  Bolt: p => React.createElement(I, p, React.createElement("path", {
    d: "M13 2L4 14h7l-1 8 9-12h-7z"
  })),
  Flame: p => React.createElement(I, p, React.createElement("path", {
    d: "M12 2s5 5 5 10a5 5 0 01-10 0c0-3 2-5 2-7 0 0 1 2 3 2z"
  })),
  Clock: p => React.createElement(I, p, React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "9"
  }), React.createElement("path", {
    d: "M12 7v5l3 2"
  })),
  Copy: p => React.createElement(I, p, React.createElement("rect", {
    x: "8",
    y: "8",
    width: "12",
    height: "12",
    rx: "2"
  }), React.createElement("path", {
    d: "M4 16V6a2 2 0 012-2h10"
  })),
  Calendar: p => React.createElement(I, p, React.createElement("rect", {
    x: "3",
    y: "5",
    width: "18",
    height: "16",
    rx: "2"
  }), React.createElement("path", {
    d: "M3 10h18M8 3v4M16 3v4"
  })),
  Upload: p => React.createElement(I, p, React.createElement("path", {
    d: "M12 17V4M6 10l6-6 6 6"
  }), React.createElement("path", {
    d: "M4 20h16"
  })),
  Download: p => React.createElement(I, p, React.createElement("path", {
    d: "M12 4v13M6 11l6 6 6-6"
  }), React.createElement("path", {
    d: "M4 20h16"
  })),
  File: p => React.createElement(I, p, React.createElement("path", {
    d: "M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"
  }), React.createElement("path", {
    d: "M14 3v6h6"
  })),
  Code: p => React.createElement(I, p, React.createElement("path", {
    d: "M8 8l-4 4 4 4M16 8l4 4-4 4M14 4l-4 16"
  })),
  Quote: p => React.createElement(I, p, React.createElement("path", {
    d: "M7 7v4h3l-2 6M15 7v4h3l-2 6"
  })),
  Mic: p => React.createElement(I, p, React.createElement("rect", {
    x: "9",
    y: "3",
    width: "6",
    height: "12",
    rx: "3"
  }), React.createElement("path", {
    d: "M5 11a7 7 0 0014 0M12 18v3"
  })),
  Send: p => React.createElement(I, p, React.createElement("path", {
    d: "M4 12l16-8-6 18-3-7z"
  })),
  Bookmark: p => React.createElement(I, p, React.createElement("path", {
    d: "M6 3h12v18l-6-4-6 4z"
  })),
  Star: p => React.createElement(I, p, React.createElement("path", {
    d: "M12 3l2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17l-5.5 2.9 1-6.1L3 9.4l6.1-.9z"
  })),
  Dots: p => React.createElement(I, p, React.createElement("circle", {
    cx: "6",
    cy: "12",
    r: "1.4",
    fill: "currentColor"
  }), React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "1.4",
    fill: "currentColor"
  }), React.createElement("circle", {
    cx: "18",
    cy: "12",
    r: "1.4",
    fill: "currentColor"
  })),
  Filter: p => React.createElement(I, p, React.createElement("path", {
    d: "M3 5h18l-7 9v6l-4-2v-4z"
  })),
  Globe: p => React.createElement(I, p, React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "9"
  }), React.createElement("path", {
    d: "M3 12h18M12 3c3 3.5 3 14 0 18M12 3c-3 3.5-3 14 0 18"
  })),
  Bell: p => React.createElement(I, p, React.createElement("path", {
    d: "M6 9a6 6 0 0112 0v4l2 3H4l2-3z"
  }), React.createElement("path", {
    d: "M10 20a2 2 0 004 0"
  })),
  Menu: p => React.createElement(I, p, React.createElement("path", {
    d: "M4 7h16M4 12h16M4 17h16"
  })),
  PenNib: p => React.createElement(I, p, React.createElement("path", {
    d: "M12 3l6 6-9 9H3v-6z"
  }), React.createElement("path", {
    d: "M12 9l3 3"
  })),
  Lightbulb: p => React.createElement(I, p, React.createElement("path", {
    d: "M9 18h6M10 21h4M12 3a6 6 0 014 10.5c-.8.7-1 1.4-1 2.5H9c0-1.1-.2-1.8-1-2.5A6 6 0 0112 3z"
  })),
  Link: p => React.createElement(I, p, React.createElement("path", {
    d: "M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"
  })),
  Pin: p => React.createElement(I, p, React.createElement("path", {
    d: "M12 2l4 6v4l3 3H5l3-3V8z"
  }), React.createElement("path", {
    d: "M12 15v6"
  })),
  Mail: p => React.createElement(I, p, React.createElement("rect", {
    x: "3",
    y: "5",
    width: "18",
    height: "14",
    rx: "2"
  }), React.createElement("path", {
    d: "M3 7l9 7 9-7"
  })),
  Lock: p => React.createElement(I, p, React.createElement("rect", {
    x: "4",
    y: "11",
    width: "16",
    height: "10",
    rx: "2"
  }), React.createElement("path", {
    d: "M8 11V7a4 4 0 018 0v4"
  })),
  Eye: p => React.createElement(I, p, React.createElement("path", {
    d: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"
  }), React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "3"
  })),
  Shuffle: p => React.createElement(I, p, React.createElement("path", {
    d: "M3 6h4l10 12h4M3 18h4L17 6h4M19 3l3 3-3 3M19 15l3 3-3 3"
  })),
  Tree: p => React.createElement(I, p, React.createElement("circle", {
    cx: "12",
    cy: "5",
    r: "2"
  }), React.createElement("circle", {
    cx: "6",
    cy: "19",
    r: "2"
  }), React.createElement("circle", {
    cx: "18",
    cy: "19",
    r: "2"
  }), React.createElement("path", {
    d: "M12 7v4M12 11L7 17M12 11l5 6"
  })),
  Layers: p => React.createElement(I, p, React.createElement("path", {
    d: "M12 3l9 5-9 5-9-5z"
  }), React.createElement("path", {
    d: "M3 13l9 5 9-5M3 17l9 5 9-5"
  })),
  Brain: p => React.createElement(I, p, React.createElement("path", {
    d: "M9 4a3 3 0 00-3 3v.5A3 3 0 004 10v1a3 3 0 001 2.2V16a3 3 0 003 3 3 3 0 003-3V4z"
  }), React.createElement("path", {
    d: "M15 4a3 3 0 013 3v.5A3 3 0 0120 10v1a3 3 0 01-1 2.2V16a3 3 0 01-3 3 3 3 0 01-3-3V4z"
  })),
  Circle: p => React.createElement(I, p, React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "9"
  })),
  Hash: p => React.createElement(I, p, React.createElement("path", {
    d: "M5 9h14M5 15h14M10 3l-2 18M16 3l-2 18"
  })),
  LogOut: p => React.createElement(I, p, React.createElement("path", {
    d: "M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3"
  })),
  Sun: p => React.createElement(I, p, React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "4"
  }), React.createElement("path", {
    d: "M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
  })),
  Moon: p => React.createElement(I, p, React.createElement("path", {
    d: "M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"
  })),
  Monitor: p => React.createElement(I, p, React.createElement("rect", {
    x: "2",
    y: "4",
    width: "20",
    height: "13",
    rx: "2"
  }), React.createElement("path", {
    d: "M8 21h8M12 17v4"
  })),
  Palette: p => React.createElement(I, p, React.createElement("path", {
    d: "M12 22a10 10 0 110-20 10 10 0 014 19.2c-1 .4-2-.3-2-1.4V18a2 2 0 00-2-2h-1a3 3 0 01-3-3 3 3 0 013-3h4a2 2 0 002-2V8a2 2 0 00-2-2 6 6 0 00-6 5"
  })),
  Cube: p => React.createElement(I, p, React.createElement("path", {
    d: "M12 2l9 5v10l-9 5-9-5V7z"
  }), React.createElement("path", {
    d: "M3 7l9 5 9-5M12 22V12"
  })),
  Sparkles: p => React.createElement(I, p, React.createElement("path", {
    d: "M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2zM19 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1z"
  }))
};
window.Icon = Icon;
})();


// ---- components/Shell.jsx ----
(function () {
  window.__NOESIS_BOOT.files.push("components/Shell.jsx");
const Logo = ({
  size = 24,
  showWord = true,
  onClick
}) => React.createElement("button", {
  onClick: onClick,
  disabled: !onClick,
  style: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'calc(10px * var(--app-density-scale))',
    color: 'var(--fg-0)',
    background: 'transparent',
    padding: 0,
    cursor: onClick ? 'pointer' : 'default'
  }
}, React.createElement("img", {
  src: "assets/noesis_primary_logo.png",
  alt: "",
  width: size,
  height: size,
  style: {
    width: size,
    height: size,
    objectFit: 'contain',
    filter: 'drop-shadow(0 0 8px var(--accent-glow))',
    transition: 'transform 240ms var(--ease-out), filter 240ms var(--ease-out)'
  },
  className: "logo-img"
}), showWord && React.createElement("span", {
  style: {
    fontFamily: 'var(--font-display)',
    fontSize: `calc(${size * 0.82}px * var(--app-font-scale))`,
    letterSpacing: '-0.015em',
    fontWeight: 400
  }
}, "No\u0113sis"));
const SIDEBAR = [{
  key: 'dashboard',
  label: 'Today',
  icon: 'Home'
}, {
  key: 'materials',
  label: 'Materials',
  icon: 'Folder'
}, {
  key: 'study-plan',
  label: 'Study Plan',
  icon: 'Calendar'
}, {
  key: 'tutor',
  label: 'AI Tutor',
  icon: 'Sparkle'
}, {
  key: 'notes',
  label: 'Notes',
  icon: 'PenNib'
}, {
  key: 'flashcards',
  label: 'Flashcards',
  icon: 'Cards'
}, {
  key: 'quiz',
  label: 'Quizzes',
  icon: 'Target'
}, {
  key: 'progress',
  label: 'Progress',
  icon: 'Chart'
}, {
  key: 'community',
  label: 'Community',
  icon: 'Users'
}];
const Sidebar = ({
  current,
  onNav,
  onSettings,
  onLogout,
  onHome
}) => {
  const Icon = window.Icon;
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [streakDays, setStreakDays] = React.useState(0);
  const [weekBars, setWeekBars] = React.useState([0, 0, 0, 0, 0, 0, 0]);
  const [userName, setUserName] = React.useState('');
  const [userSub, setUserSub] = React.useState('');
  React.useEffect(() => {
    window.NoesisAPI.dashboard.get().then(d => {
      setStreakDays(d.streak_days || 0);
      setWeekBars((d.weekly_hours || [0, 0, 0, 0, 0, 0, 0]).map(h => h > 0 ? 1 : 0));
    }).catch(() => {});
    window.NoesisAPI.auth.me().then(d => {
      setUserName(d.user && d.user.name || '');
      setUserSub(d.prefs && d.prefs.subject || '');
    }).catch(() => {});
  }, []);
  return React.createElement("aside", {
    style: ss.sidebar
  }, React.createElement("div", {
    style: {
      padding: '22px 22px 16px'
    }
  }, React.createElement(Logo, {
    size: 22,
    onClick: onHome
  })), React.createElement("div", {
    style: {
      padding: '6px 10px'
    }
  }, React.createElement("button", {
    style: ss.sbNewBtn,
    onClick: () => onNav('tutor')
  }, React.createElement(Icon.Plus, {
    size: 14
  }), React.createElement("span", null, "New session"), React.createElement("span", {
    style: {
      marginLeft: 'auto',
      fontSize: 'calc(10px * var(--app-font-scale))',
      color: 'var(--fg-3)'
    },
    className: "mono"
  }, "\u2318K"))), React.createElement("nav", {
    style: {
      padding: '12px 10px',
      display: 'flex',
      flexDirection: 'column',
      gap: 'calc(1px * var(--app-density-scale))'
    }
  }, SIDEBAR.map(item => {
    const IconCmp = Icon[item.icon];
    const active = current === item.key;
    return React.createElement("button", {
      key: item.key,
      onClick: () => onNav(item.key),
      style: {
        ...ss.sbItem,
        ...(active ? ss.sbItemActive : {})
      }
    }, React.createElement(IconCmp, {
      size: 16
    }), React.createElement("span", null, item.label), active && React.createElement("span", {
      style: ss.sbDot
    }));
  })), React.createElement("div", {
    style: {
      marginTop: 'auto',
      padding: '12px',
      position: 'relative'
    }
  }, React.createElement("div", {
    style: ss.streakBox
  }, React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, React.createElement("span", {
    style: {
      fontSize: 'calc(10px * var(--app-font-scale))',
      letterSpacing: '0.08em',
      color: 'var(--fg-3)',
      textTransform: 'uppercase'
    }
  }, "Streak"), React.createElement(Icon.Flame, {
    size: 12,
    style: {
      color: 'var(--accent)'
    }
  })), React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 'calc(6px * var(--app-density-scale))',
      marginTop: 'calc(4px * var(--app-density-scale))'
    }
  }, React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'calc(28px * var(--app-font-scale))',
      color: 'var(--fg-0)'
    }
  }, streakDays), React.createElement("span", {
    style: {
      fontSize: 'calc(11px * var(--app-font-scale))',
      color: 'var(--fg-2)'
    }
  }, "days")), React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'calc(2px * var(--app-density-scale))',
      marginTop: 'calc(8px * var(--app-density-scale))'
    }
  }, Array.from({
    length: 7
  }).map((_, i) => React.createElement("div", {
    key: i,
    style: {
      flex: 1,
      height: 4,
      borderRadius: 2,
      background: weekBars[i] > 0 ? 'var(--accent)' : 'var(--line)'
    }
  })))), React.createElement("button", {
    onClick: onSettings,
    style: {
      ...ss.sbItem,
      marginTop: 'calc(6px * var(--app-density-scale))'
    }
  }, React.createElement(Icon.Cog, {
    size: 16
  }), React.createElement("span", null, "Settings")), React.createElement("button", {
    onClick: () => setMenuOpen(v => !v),
    style: ss.profile
  }, React.createElement("div", {
    style: ss.avatar
  }, (userName || 'N')[0].toUpperCase()), React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      minWidth: 0,
      flex: 1
    }
  }, React.createElement("span", {
    style: {
      fontSize: 'calc(12px * var(--app-font-scale))',
      color: 'var(--fg-0)',
      fontWeight: 500,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      maxWidth: 130
    }
  }, userName || 'User'), React.createElement("span", {
    style: {
      fontSize: 'calc(10px * var(--app-font-scale))',
      color: 'var(--fg-3)'
    }
  }, userSub || 'Student')), React.createElement(Icon.ChevronRight, {
    size: 14,
    style: {
      color: 'var(--fg-3)',
      transform: menuOpen ? 'rotate(90deg)' : 'none',
      transition: 'transform 160ms var(--ease-out)'
    }
  })), menuOpen && React.createElement("div", {
    style: ss.menu
  }, React.createElement("button", {
    style: ss.menuItem,
    onClick: () => {
      setMenuOpen(false);
      onSettings();
    }
  }, React.createElement(Icon.Users, {
    size: 13
  }), " Profile"), React.createElement("button", {
    style: ss.menuItem,
    onClick: () => {
      setMenuOpen(false);
      onSettings();
    }
  }, React.createElement(Icon.Eye, {
    size: 13
  }), " Appearance"), React.createElement("div", {
    style: {
      height: 1,
      background: 'var(--line)',
      margin: '4px 0'
    }
  }), React.createElement("button", {
    style: {
      ...ss.menuItem,
      color: 'var(--err)'
    },
    onClick: () => {
      setMenuOpen(false);
      onLogout && onLogout();
    }
  }, React.createElement(Icon.LogOut, {
    size: 13
  }), " Log out"))));
};
const ss = {
  sidebar: {
    width: 240,
    background: 'var(--bg-1)',
    borderRight: '1px solid var(--line)',
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    position: 'sticky',
    top: 0,
    flexShrink: 0
  },
  sbNewBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(10px * var(--app-density-scale))',
    width: '100%',
    padding: '8px 12px',
    borderRadius: 'var(--r-md)',
    background: 'var(--bg-2)',
    border: '1px solid var(--line)',
    color: 'var(--fg-1)',
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    transition: 'all 160ms var(--ease-out)'
  },
  sbItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(10px * var(--app-density-scale))',
    width: '100%',
    padding: '7px 10px',
    borderRadius: 'var(--r-sm)',
    color: 'var(--fg-2)',
    fontSize: 'calc(13px * var(--app-font-scale))',
    transition: 'all 140ms var(--ease-out)',
    position: 'relative'
  },
  sbItemActive: {
    background: 'var(--bg-2)',
    color: 'var(--fg-0)'
  },
  sbDot: {
    position: 'absolute',
    right: 10,
    width: 4,
    height: 4,
    borderRadius: 2,
    background: 'var(--accent)'
  },
  streakBox: {
    padding: '10px 12px',
    background: 'var(--bg-2)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--r-md)',
    color: 'var(--fg-1)'
  },
  profile: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(10px * var(--app-density-scale))',
    width: '100%',
    padding: '8px',
    borderRadius: 'var(--r-md)',
    background: 'transparent',
    marginTop: 'calc(4px * var(--app-density-scale))',
    transition: 'background 140ms var(--ease-out)'
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 8,
    background: 'linear-gradient(135deg, var(--accent) 0%, var(--parchment) 100%)',
    color: 'var(--bg-0)',
    fontSize: 'calc(12px * var(--app-font-scale))',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-display)',
    flexShrink: 0
  },
  menu: {
    position: 'absolute',
    bottom: 'calc(100% - 8px)',
    left: 12,
    right: 12,
    background: 'var(--bg-1)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--r-md)',
    padding: 'calc(4px * var(--app-density-scale))',
    boxShadow: 'var(--shadow-lg)',
    zIndex: 40,
    animation: 'slideUp 180ms var(--ease-out)'
  },
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(10px * var(--app-density-scale))',
    width: '100%',
    padding: '8px 10px',
    borderRadius: 'var(--r-sm)',
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    color: 'var(--fg-1)',
    textAlign: 'left',
    transition: 'background 140ms var(--ease-out)'
  }
};
const Topbar = ({
  title,
  crumbs = [],
  right = null
}) => {
  const Icon = window.Icon;
  return React.createElement("header", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'calc(12px * var(--app-density-scale))',
      padding: '14px 28px',
      borderBottom: '1px solid var(--line-soft)',
      background: 'var(--bg-0)',
      position: 'sticky',
      top: 0,
      zIndex: 20,
      minHeight: 56
    }
  }, React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'calc(8px * var(--app-density-scale))',
      flex: 1,
      minWidth: 0
    }
  }, crumbs.map((c, i) => React.createElement(React.Fragment, {
    key: i
  }, React.createElement("span", {
    style: {
      fontSize: 'calc(12.5px * var(--app-font-scale))',
      color: 'var(--fg-2)'
    }
  }, c), React.createElement(Icon.ChevronRight, {
    size: 11,
    style: {
      color: 'var(--fg-3)'
    }
  }))), React.createElement("span", {
    style: {
      fontSize: 'calc(13px * var(--app-font-scale))',
      color: 'var(--fg-0)',
      fontWeight: 500
    }
  }, title)), React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'calc(6px * var(--app-density-scale))'
    }
  }, right, React.createElement("button", {
    className: "btn btn-bare",
    style: {
      padding: 'calc(7px * var(--app-density-scale))',
      opacity: 0.4
    },
    disabled: true
  }, React.createElement(Icon.Search, {
    size: 15
  })), React.createElement("button", {
    className: "btn btn-bare",
    style: {
      padding: 'calc(7px * var(--app-density-scale))',
      opacity: 0.4
    },
    disabled: true
  }, React.createElement(Icon.Bell, {
    size: 15
  }))));
};
window.Logo = Logo;
window.Sidebar = Sidebar;
window.Topbar = Topbar;
})();


// ---- components/Hero3D.jsx ----
(function () {
  window.__NOESIS_BOOT.files.push("components/Hero3D.jsx");
const Hero3D = ({
  height = 520
}) => {
  const mountRef = React.useRef(null);
  React.useEffect(() => {
    if (!window.THREE) return;
    const THREE = window.THREE;
    const mount = mountRef.current;
    if (!mount) return;
    const W = mount.clientWidth,
      H = height;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    camera.position.set(0, 0.3, 6.2);
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);
    const readVar = (name, fallback) => {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      if (!v) return fallback;
      if (v.startsWith('#')) return new THREE.Color(v);
      return new THREE.Color(v || fallback);
    };
    const ACCENT = readVar('--accent', '#a5b4fc');
    const ACCENT2 = readVar('--accent-2', '#c99afc');
    const ACCENT3 = readVar('--accent-3', '#6ad0e8');
    const FG = readVar('--fg-0', '#eeecff');
    const coreMat = new THREE.MeshBasicMaterial({
      color: ACCENT
    });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.45, 48, 48), coreMat);
    scene.add(core);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.62, 32, 32), new THREE.MeshBasicMaterial({
      color: ACCENT,
      transparent: true,
      opacity: 0.18,
      side: THREE.BackSide
    }));
    scene.add(glow);
    const ico = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 1), new THREE.MeshBasicMaterial({
      color: ACCENT2,
      wireframe: true,
      transparent: true,
      opacity: 0.55
    }));
    scene.add(ico);
    const rings = [];
    [1.9, 2.5, 3.1].forEach((r, i) => {
      const g = new THREE.TorusGeometry(r, 0.006, 8, 160);
      const m = new THREE.MeshBasicMaterial({
        color: [ACCENT, ACCENT2, ACCENT3][i],
        transparent: true,
        opacity: 0.35 + i * 0.07
      });
      const t = new THREE.Mesh(g, m);
      t.rotation.x = Math.PI / 2 + (i - 1) * 0.22;
      t.rotation.y = (i - 1) * 0.35;
      scene.add(t);
      rings.push(t);
    });
    const nodes = [];
    const concepts = [{
      r: 1.9,
      a: 0,
      speed: 0.28,
      color: ACCENT
    }, {
      r: 1.9,
      a: Math.PI * 2 / 3,
      speed: 0.28,
      color: ACCENT
    }, {
      r: 1.9,
      a: Math.PI * 4 / 3,
      speed: 0.28,
      color: ACCENT
    }, {
      r: 2.5,
      a: 0.6,
      speed: -0.22,
      color: ACCENT2
    }, {
      r: 2.5,
      a: 0.6 + Math.PI,
      speed: -0.22,
      color: ACCENT2
    }, {
      r: 3.1,
      a: 0.2,
      speed: 0.16,
      color: ACCENT3
    }, {
      r: 3.1,
      a: 0.2 + Math.PI * 0.8,
      speed: 0.16,
      color: ACCENT3
    }];
    concepts.forEach(c => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.065, 16, 16), new THREE.MeshBasicMaterial({
        color: c.color
      }));
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 16), new THREE.MeshBasicMaterial({
        color: c.color,
        transparent: true,
        opacity: 0.22
      }));
      m.add(halo);
      scene.add(m);
      nodes.push({
        mesh: m,
        ...c
      });
    });
    const starGeo = new THREE.BufferGeometry();
    const starCount = 600;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 18 + Math.random() * 14;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: FG,
      size: 0.03,
      transparent: true,
      opacity: 0.7,
      sizeAttenuation: true
    }));
    scene.add(stars);
    let mx = 0,
      my = 0,
      tx = 0,
      ty = 0;
    const onMove = e => {
      const rect = mount.getBoundingClientRect();
      mx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      my = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    mount.addEventListener('mousemove', onMove);
    const onResize = () => {
      const nw = mount.clientWidth;
      renderer.setSize(nw, height);
      camera.aspect = nw / height;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);
    let raf;
    const start = performance.now();
    const animate = now => {
      const t = (now - start) / 1000;
      tx += (mx * 0.35 - tx) * 0.06;
      ty += (my * 0.25 - ty) * 0.06;
      camera.position.x = tx;
      camera.position.y = 0.3 - ty;
      camera.lookAt(0, 0, 0);
      ico.rotation.y = t * 0.15;
      ico.rotation.x = Math.sin(t * 0.4) * 0.2;
      glow.scale.setScalar(1 + Math.sin(t * 1.8) * 0.04);
      rings.forEach((r, i) => {
        r.rotation.z = t * (0.06 - i * 0.02);
      });
      nodes.forEach(n => {
        const ang = n.a + t * n.speed;
        n.mesh.position.x = Math.cos(ang) * n.r;
        n.mesh.position.z = Math.sin(ang) * n.r;
        n.mesh.position.y = Math.sin(ang * 1.3) * 0.35;
      });
      stars.rotation.y = t * 0.01;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      mount.removeEventListener('mousemove', onMove);
      mount.contains(renderer.domElement) && mount.removeChild(renderer.domElement);
      renderer.dispose();
      scene.traverse(o => {
        o.geometry && o.geometry.dispose();
        o.material && o.material.dispose && o.material.dispose();
      });
    };
  }, [height]);
  return React.createElement("div", {
    ref: mountRef,
    style: {
      width: '100%',
      height,
      position: 'relative',
      cursor: 'grab'
    }
  }, React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
      color: 'var(--bg-0)',
      fontFamily: 'var(--font-display)',
      fontSize: 'calc(26px * var(--app-font-scale))',
      fontWeight: 400,
      mixBlendMode: 'screen'
    }
  }, React.createElement("span", {
    style: {
      color: 'var(--fg-0)',
      opacity: 0.9,
      textShadow: '0 0 24px var(--accent)'
    }
  }, "\u014D")));
};
window.Hero3D = Hero3D;
})();


// ---- components/Ambient3D.jsx ----
(function () {
  window.__NOESIS_BOOT.files.push("components/Ambient3D.jsx");
const Ambient3D = ({
  opacity = 0.5,
  variant = 'mesh'
}) => {
  const mountRef = React.useRef(null);
  React.useEffect(() => {
    if (!window.THREE) return;
    const THREE = window.THREE;
    const mount = mountRef.current;
    if (!mount) return;
    const W = mount.clientWidth || window.innerWidth;
    const H = mount.clientHeight || window.innerHeight;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 100);
    camera.position.set(0, 0, 9);
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);
    const readVar = (n, f) => {
      const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim();
      return new THREE.Color(v || f);
    };
    const ACCENT = readVar('--accent', '#a5b4fc');
    const ACCENT2 = readVar('--accent-2', '#c99afc');
    const ACCENT3 = readVar('--accent-3', '#6ad0e8');
    const shapes = [];
    const geoms = [() => new THREE.IcosahedronGeometry(0.7, 0), () => new THREE.OctahedronGeometry(0.6, 0), () => new THREE.TorusGeometry(0.6, 0.04, 6, 40), () => new THREE.DodecahedronGeometry(0.55, 0)];
    const palette = [ACCENT, ACCENT2, ACCENT3];
    for (let i = 0; i < 8; i++) {
      const geo = geoms[i % geoms.length]();
      const color = palette[i % palette.length];
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color,
        wireframe: true,
        transparent: true,
        opacity: 0.28
      }));
      m.position.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6 - 2);
      m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      m.userData = {
        driftX: (Math.random() - 0.5) * 0.08,
        driftY: (Math.random() - 0.5) * 0.06,
        rotX: (Math.random() - 0.5) * 0.15,
        rotY: (Math.random() - 0.5) * 0.15,
        baseY: m.position.y,
        phase: Math.random() * Math.PI * 2
      };
      scene.add(m);
      shapes.push(m);
    }
    const pCount = 400;
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      pPos[i * 3] = (Math.random() - 0.5) * 20;
      pPos[i * 3 + 1] = (Math.random() - 0.5) * 14;
      pPos[i * 3 + 2] = (Math.random() - 0.5) * 10 - 2;
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
      color: ACCENT,
      size: 0.04,
      transparent: true,
      opacity: 0.6,
      sizeAttenuation: true
    }));
    scene.add(particles);
    let mx = 0,
      my = 0,
      tx = 0,
      ty = 0;
    const onMove = e => {
      mx = (e.clientX / window.innerWidth - 0.5) * 2;
      my = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('mousemove', onMove);
    const onResize = () => {
      const nw = mount.clientWidth || window.innerWidth;
      const nh = mount.clientHeight || window.innerHeight;
      renderer.setSize(nw, nh);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);
    let raf;
    const start = performance.now();
    const animate = now => {
      const t = (now - start) / 1000;
      tx += (mx * 0.4 - tx) * 0.03;
      ty += (my * 0.25 - ty) * 0.03;
      camera.position.x = tx;
      camera.position.y = -ty;
      camera.lookAt(0, 0, 0);
      shapes.forEach(s => {
        s.rotation.x += s.userData.rotX * 0.01;
        s.rotation.y += s.userData.rotY * 0.01;
        s.position.y = s.userData.baseY + Math.sin(t * 0.4 + s.userData.phase) * 0.3;
      });
      particles.rotation.y = t * 0.015;
      particles.rotation.x = Math.sin(t * 0.1) * 0.05;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('resize', onResize);
      mount.contains(renderer.domElement) && mount.removeChild(renderer.domElement);
      renderer.dispose();
      scene.traverse(o => {
        o.geometry && o.geometry.dispose();
        o.material && o.material.dispose && o.material.dispose();
      });
    };
  }, [variant]);
  return React.createElement("div", {
    ref: mountRef,
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 0,
      pointerEvents: 'none',
      opacity,
      transition: 'opacity 600ms var(--ease-out)'
    }
  });
};
window.Ambient3D = Ambient3D;
})();


// ---- components/Splash.jsx ----
(function () {
  window.__NOESIS_BOOT.files.push("components/Splash.jsx");
const Splash = ({
  onDone
}) => {
  const [phase, setPhase] = React.useState(0);
  React.useEffect(() => {
    const timers = [setTimeout(() => setPhase(1), 120), setTimeout(() => setPhase(2), 900), setTimeout(() => setPhase(3), 1500), setTimeout(() => setPhase(4), 2800), setTimeout(() => onDone && onDone(), 3400)];
    return () => timers.forEach(clearTimeout);
  }, [onDone]);
  const skip = () => {
    setPhase(4);
    setTimeout(() => onDone && onDone(), 420);
  };
  return React.createElement("div", {
    onClick: skip,
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 999,
      background: 'radial-gradient(ellipse at center, #12122a 0%, #06061a 70%, #010108 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      cursor: 'pointer',
      opacity: phase === 4 ? 0 : 1,
      transition: 'opacity 480ms cubic-bezier(.4,0,.2,1)'
    }
  }, React.createElement(StarCanvas, null), React.createElement("div", {
    style: {
      position: 'relative',
      width: 140,
      height: 140,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: '50%',
      background: 'radial-gradient(circle at 30% 30%, #c99afc, #6366f1 40%, #1e1b4b 80%, transparent)',
      filter: 'blur(2px)',
      transform: phase >= 1 ? 'scale(1)' : 'scale(0.2)',
      opacity: phase >= 1 ? 1 : 0,
      transition: 'all 900ms cubic-bezier(.2,.8,.2,1)',
      boxShadow: '0 0 80px 20px rgba(140, 110, 255, 0.35)'
    }
  }), React.createElement("div", {
    style: {
      position: 'absolute',
      inset: -40,
      borderRadius: '50%',
      border: '1px solid rgba(165, 180, 252, 0.18)',
      opacity: phase >= 1 ? 1 : 0,
      animation: phase >= 1 ? 'splashRing 2.4s ease-out infinite' : 'none'
    }
  }), React.createElement("div", {
    style: {
      position: 'absolute',
      inset: -80,
      borderRadius: '50%',
      border: '1px solid rgba(165, 180, 252, 0.08)',
      opacity: phase >= 1 ? 1 : 0,
      animation: phase >= 1 ? 'splashRing 2.4s ease-out 0.4s infinite' : 'none'
    }
  }), React.createElement("img", {
    src: "assets/noesis_primary_logo.png",
    alt: "",
    width: 72,
    height: 72,
    style: {
      width: 72,
      height: 72,
      objectFit: 'contain',
      zIndex: 2,
      transform: phase >= 1 ? 'scale(1) rotate(0deg)' : 'scale(0.3) rotate(-25deg)',
      opacity: phase >= 1 ? 1 : 0,
      transition: 'all 1100ms cubic-bezier(.2,.8,.2,1) 120ms',
      filter: 'drop-shadow(0 0 18px rgba(199, 154, 252, 0.6))'
    }
  })), React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'calc(64px * var(--app-font-scale))',
      fontWeight: 300,
      letterSpacing: '-0.025em',
      color: '#fff',
      marginTop: 'calc(34px * var(--app-density-scale))',
      overflow: 'hidden',
      display: 'flex'
    }
  }, 'Noēsis'.split('').map((ch, i) => React.createElement("span", {
    key: i,
    style: {
      display: 'inline-block',
      transform: phase >= 2 ? 'translateY(0)' : 'translateY(100%)',
      opacity: phase >= 2 ? 1 : 0,
      transition: `all 680ms cubic-bezier(.2,.8,.2,1) ${120 + i * 60}ms`
    }
  }, ch))), React.createElement("div", {
    style: {
      fontSize: 'calc(13px * var(--app-font-scale))',
      letterSpacing: '0.22em',
      textTransform: 'uppercase',
      color: 'rgba(199, 201, 220, 0.6)',
      marginTop: 'calc(22px * var(--app-density-scale))',
      opacity: phase >= 3 ? 1 : 0,
      transform: phase >= 3 ? 'translateY(0)' : 'translateY(8px)',
      transition: 'all 700ms cubic-bezier(.2,.8,.2,1)'
    }
  }, "A calm place to think"), React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 32,
      fontSize: 'calc(11px * var(--app-font-scale))',
      color: 'rgba(255,255,255,0.3)',
      letterSpacing: '0.08em',
      opacity: phase >= 3 ? 1 : 0,
      transition: 'opacity 400ms'
    }
  }, "Tap to enter"), React.createElement("style", null, `
        @keyframes splashRing {
          0% { transform: scale(0.8); opacity: 0.8; }
          100% { transform: scale(1.5); opacity: 0; }
        }
      `));
};
const StarCanvas = () => {
  const ref = React.useRef();
  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
    };
    resize();
    window.addEventListener('resize', resize);
    const count = 180;
    const stars = Array.from({
      length: count
    }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      z: Math.random() * 2 + 0.3,
      tw: Math.random() * Math.PI * 2,
      color: Math.random() > 0.85 ? '#c99afc' : Math.random() > 0.6 ? '#a5b4fc' : '#ffffff'
    }));
    let raf;
    const loop = t => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const s of stars) {
        s.y -= s.z * 0.15;
        if (s.y < 0) s.y = canvas.height;
        const tw = Math.sin(t * 0.002 + s.tw) * 0.5 + 0.5;
        ctx.globalAlpha = 0.25 + tw * 0.65;
        ctx.fillStyle = s.color;
        ctx.fillRect(s.x, s.y, s.z * dpr, s.z * dpr);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);
  return React.createElement("canvas", {
    ref: ref,
    style: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      opacity: 0.6,
      pointerEvents: 'none'
    }
  });
};
window.Splash = Splash;
})();


// ---- components/Landing.jsx ----
(function () {
  window.__NOESIS_BOOT.files.push("components/Landing.jsx");
const Landing = ({
  onEnter,
  onAuth,
  isAuthed
}) => {
  const Icon = window.Icon;
  const [t, setT] = React.useState(0);
  React.useEffect(() => {
    let raf;
    const start = performance.now();
    const tick = now => {
      setT((now - start) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const go = id => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  };
  const auth = mode => onAuth ? onAuth(mode) : onEnter('auth');
  return React.createElement("div", {
    style: ls.page,
    className: "stars"
  }, React.createElement("div", {
    className: "nebula"
  }), React.createElement("style", null, landingCss), React.createElement("header", {
    style: ls.nav,
    className: "landing-nav"
  }, React.createElement(window.Logo, {
    size: 22,
    onClick: () => go('home')
  }), React.createElement("nav", {
    style: ls.navLinks,
    className: "landing-links"
  }, React.createElement("a", {
    className: "ls-navlink",
    style: ls.navLink,
    onClick: () => go('home')
  }, "Home"), React.createElement("a", {
    className: "ls-navlink",
    style: ls.navLink,
    onClick: () => go('features')
  }, "Features"), React.createElement("a", {
    className: "ls-navlink",
    style: ls.navLink,
    onClick: () => go('how')
  }, "How it works")), React.createElement("div", {
    style: ls.navActions
  }, isAuthed ? React.createElement("button", {
    className: "btn btn-accent",
    onClick: () => onEnter('dashboard'),
    style: {
      padding: '8px 14px'
    }
  }, "Dashboard ", React.createElement(Icon.ArrowRight, {
    size: 12
  })) : React.createElement(React.Fragment, null, React.createElement("button", {
    className: "btn btn-bare",
    onClick: () => auth('signin')
  }, "Login"), React.createElement("button", {
    className: "btn btn-accent",
    onClick: () => auth('signup'),
    style: {
      padding: '8px 14px'
    }
  }, "Register ", React.createElement(Icon.ArrowRight, {
    size: 12
  }))))), React.createElement("section", {
    id: "home",
    style: ls.hero,
    className: "landing-hero"
  }, React.createElement("div", {
    style: ls.heroText,
    className: "fade-in"
  }, React.createElement("div", {
    className: "chip",
    style: {
      marginBottom: 'calc(22px * var(--app-density-scale))'
    }
  }, React.createElement("span", {
    style: ls.liveDot
  }), React.createElement("span", null, "AI study system for OOP and Data Structures")), React.createElement("h1", {
    style: ls.title
  }, React.createElement("span", {
    style: {
      display: 'block'
    }
  }, "Turn course files"), React.createElement("span", {
    style: {
      display: 'block',
      color: 'var(--fg-2)'
    }
  }, "into a real"), React.createElement("span", {
    style: {
      display: 'block'
    }
  }, "study ", React.createElement("em", {
    style: ls.em
  }, "workspace"), ".")), React.createElement("p", {
    style: ls.subtitle
  }, "Noesis indexes your uploaded material, then generates notes, flashcards, quizzes, wrong-answer review, and tutor sessions from your own backend data."), React.createElement("div", {
    style: ls.ctaRow
  }, React.createElement("button", {
    className: "btn btn-accent",
    onClick: () => auth('signup'),
    style: ls.cta
  }, "Get started ", React.createElement(Icon.ArrowRight, {
    size: 14
  })), React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => go('how'),
    style: ls.cta
  }, React.createElement(Icon.Play, {
    size: 12
  }), " See how it works")), React.createElement("div", {
    style: ls.trustRow,
    className: "landing-trust"
  }, [['Backend auth', 'real accounts'], ['SQLite memory', 'persistent study data'], ['Ollama + RAG', 'local AI generation']].map(([a, b]) => React.createElement("div", {
    key: a
  }, React.createElement("span", {
    style: ls.trustTitle
  }, a), React.createElement("br", null), React.createElement("span", null, b))))), React.createElement("div", {
    style: ls.heroVisual,
    className: "landing-visual"
  }, window.Hero3D ? React.createElement(window.Hero3D, {
    height: 520
  }) : React.createElement(HeroOrbit, {
    t: t
  }))), React.createElement("section", {
    id: "features",
    style: ls.section
  }, React.createElement("div", {
    style: ls.sectionHead
  }, React.createElement("div", null, React.createElement("div", {
    style: ls.eyebrow
  }, "Connected features"), React.createElement("h2", {
    style: ls.h2
  }, "Every surface reads and writes real study data.")), React.createElement("p", {
    style: ls.sectionCopy
  }, "The app stays focused on Computer Science fundamentals: OOP, algorithms, data structures, complexity, and exam-style practice.")), React.createElement("div", {
    style: ls.methodGrid,
    className: "landing-grid"
  }, [{
    n: '01',
    t: 'Upload',
    d: 'Store material metadata, extract text, chunk content, and index embeddings for retrieval.',
    icon: 'Upload'
  }, {
    n: '02',
    t: 'Generate',
    d: 'Create notes, summaries, flashcards, and quizzes from the selected material.',
    icon: 'Sparkle'
  }, {
    n: '03',
    t: 'Practice',
    d: 'Submit quiz answers, store attempts, score results, and review wrong answers later.',
    icon: 'Target'
  }, {
    n: '04',
    t: 'Measure',
    d: 'Dashboard numbers, activity, due cards, and average score come from your database.',
    icon: 'Chart'
  }].map(m => {
    const C = Icon[m.icon] || Icon.Sparkle;
    return React.createElement("div", {
      key: m.n,
      className: "card card-hover",
      style: ls.methodCard
    }, React.createElement("div", {
      style: ls.cardTop
    }, React.createElement("span", {
      className: "mono",
      style: ls.cardNum
    }, m.n), React.createElement(C, {
      size: 18,
      style: {
        color: 'var(--accent)'
      }
    })), React.createElement("h3", {
      style: ls.cardTitle
    }, m.t), React.createElement("p", {
      style: ls.cardText
    }, m.d));
  }))), React.createElement("section", {
    id: "how",
    style: {
      ...ls.section,
      paddingTop: 'calc(24px * var(--app-density-scale))'
    }
  }, React.createElement("div", {
    style: {
      marginBottom: 'calc(32px * var(--app-density-scale))'
    }
  }, React.createElement("div", {
    style: ls.eyebrow
  }, "How it works"), React.createElement("h2", {
    style: ls.h2
  }, "A simple loop: ingest, understand, rehearse, improve.")), React.createElement("div", {
    className: "card landing-showcase",
    style: ls.showcase
  }, React.createElement("div", {
    style: ls.showcaseChrome
  }, React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'calc(6px * var(--app-density-scale))'
    }
  }, React.createElement("span", {
    style: ls.chromeDot
  }), React.createElement("span", {
    style: ls.chromeDot
  }), React.createElement("span", {
    style: ls.chromeDot
  })), React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 'calc(10.5px * var(--app-font-scale))',
      color: 'var(--fg-3)'
    }
  }, "noesis.local / materials / arrays-and-complexity")), React.createElement("div", {
    style: ls.showcaseBody
  }, React.createElement(StudyFlowPreview, {
    t: t
  })))), React.createElement("section", {
    style: ls.footerCta
  }, React.createElement("h2", {
    style: {
      ...ls.h2,
      maxWidth: 760
    }
  }, "Start with one OOP or Data Structures file."), React.createElement("p", {
    style: {
      ...ls.subtitle,
      margin: '18px auto 0'
    }
  }, "Your first upload becomes the source for notes, flashcards, quizzes, tutor help, and dashboard analytics."), React.createElement("button", {
    className: "btn btn-accent",
    onClick: () => auth('signup'),
    style: {
      ...ls.cta,
      marginTop: 'calc(24px * var(--app-density-scale))'
    }
  }, "Create account ", React.createElement(Icon.ArrowRight, {
    size: 14
  }))), React.createElement("footer", {
    style: ls.footer
  }, React.createElement(window.Logo, {
    size: 16
  }), React.createElement("div", {
    style: {
      fontSize: 'calc(11.5px * var(--app-font-scale))',
      color: 'var(--fg-3)'
    }
  }, "Noesis AI Learning Assistant - graduation project build")));
};
const HeroOrbit = ({
  t
}) => {
  const concepts = [{
    r: 210,
    speed: 0.08,
    offset: 0,
    label: 'Linked Lists'
  }, {
    r: 210,
    speed: 0.08,
    offset: Math.PI * 2 / 3,
    label: 'Inheritance'
  }, {
    r: 210,
    speed: 0.08,
    offset: Math.PI * 4 / 3,
    label: 'Big-O'
  }, {
    r: 150,
    speed: -0.12,
    offset: 0,
    label: 'Hash Tables'
  }, {
    r: 150,
    speed: -0.12,
    offset: Math.PI,
    label: 'Graphs'
  }];
  return React.createElement("div", {
    style: ls.orbit
  }, React.createElement("div", {
    style: ls.orbitGlow
  }), [90, 150, 210, 250].map(r => React.createElement("div", {
    key: r,
    style: {
      ...ls.ring,
      width: r * 2,
      height: r * 2
    }
  })), React.createElement("div", {
    style: ls.orbitCore
  }, "\u014D"), concepts.map((c, i) => {
    const angle = c.offset + t * c.speed * 2 * Math.PI;
    return React.createElement("div", {
      key: i,
      style: {
        ...ls.orbitChip,
        transform: `translate(${Math.cos(angle) * c.r}px, ${Math.sin(angle) * c.r}px)`
      }
    }, React.createElement("span", {
      style: {
        color: 'var(--accent)'
      }
    }, "\u25CF"), c.label);
  }));
};
const StudyFlowPreview = ({
  t
}) => {
  const Icon = window.Icon;
  const nodes = [['Material', 'Arrays and complexity indexed', 'File'], ['Notes', 'Key definitions and exam summary saved', 'PenNib'], ['Cards', 'Topic-tagged recall prompts scheduled', 'Cards'], ['Quiz', 'Attempts, score, and wrong answers stored', 'Target']];
  return React.createElement("div", {
    style: ls.preview
  }, React.createElement("div", {
    style: ls.previewSource
  }, React.createElement("div", {
    style: ls.previewEyebrow
  }, "Source excerpt"), React.createElement("h4", {
    style: ls.previewTitle
  }, "Arrays and Big-O"), React.createElement("p", {
    style: ls.previewText
  }, "Arrays store elements contiguously, giving O(1) indexed access. Insertions in the middle shift elements and take O(n), which matters when choosing between arrays and linked structures."), React.createElement("div", {
    style: ls.previewTags
  }, React.createElement("span", {
    className: "chip chip-accent"
  }, "Big-O notation"), React.createElement("span", {
    className: "chip"
  }, "Arrays"), React.createElement("span", {
    className: "chip"
  }, "Trade-offs"))), React.createElement("div", {
    style: ls.previewPanel
  }, nodes.map(([title, text, icon], i) => {
    const C = Icon[icon] || Icon.Sparkle;
    return React.createElement("div", {
      key: title,
      style: {
        ...ls.previewNode,
        transform: `translateY(${Math.sin(t * 1.4 + i) * 3}px)`
      }
    }, React.createElement("div", {
      style: ls.previewIcon
    }, React.createElement(C, {
      size: 13
    })), React.createElement("div", null, React.createElement("div", {
      style: {
        fontSize: 'calc(12.5px * var(--app-font-scale))',
        color: 'var(--fg-0)',
        fontWeight: 500
      }
    }, title), React.createElement("div", {
      style: {
        fontSize: 'calc(11.5px * var(--app-font-scale))',
        color: 'var(--fg-3)',
        marginTop: 'calc(2px * var(--app-density-scale))'
      }
    }, text)));
  })));
};
const landingCss = `
  @media (max-width: 920px) {
    .landing-nav { grid-template-columns: 1fr auto !important; padding: 12px 18px !important; }
    .landing-links { display: none !important; }
    .landing-hero { grid-template-columns: 1fr !important; padding: 60px 22px 80px !important; }
    .landing-visual { min-height: 360px; }
    .landing-grid { grid-template-columns: 1fr !important; }
    .landing-trust { flex-direction: column; gap: 14px !important; }
    .landing-showcase { border-radius: var(--r-lg) !important; }
  }
`;
const ls = {
  page: {
    background: 'var(--bg-0)',
    color: 'var(--fg-0)',
    minHeight: '100vh',
    position: 'relative'
  },
  nav: {
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    padding: '14px 44px',
    borderBottom: '1px solid var(--line-soft)',
    position: 'sticky',
    top: 0,
    background: 'color-mix(in oklab, var(--bg-0) 72%, transparent)',
    backdropFilter: 'blur(18px) saturate(130%)',
    WebkitBackdropFilter: 'blur(18px) saturate(130%)',
    zIndex: 30
  },
  navLinks: {
    display: 'flex',
    gap: 'calc(6px * var(--app-density-scale))',
    fontSize: 'calc(13px * var(--app-font-scale))',
    color: 'var(--fg-2)',
    padding: '4px',
    background: 'color-mix(in oklab, var(--bg-1) 60%, transparent)',
    borderRadius: 999,
    border: '1px solid var(--line-soft)'
  },
  navLink: {
    cursor: 'pointer',
    transition: 'all 160ms var(--ease-out)',
    padding: '6px 14px',
    borderRadius: 999
  },
  navActions: {
    display: 'flex',
    gap: 'calc(10px * var(--app-density-scale))',
    alignItems: 'center',
    justifyContent: 'flex-end'
  },
  hero: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    alignItems: 'center',
    gap: 'calc(60px * var(--app-density-scale))',
    padding: '80px 56px 110px',
    maxWidth: 1400,
    margin: '0 auto',
    position: 'relative',
    zIndex: 2
  },
  heroText: {
    maxWidth: 560
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    background: 'var(--accent)',
    boxShadow: '0 0 16px var(--accent)'
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(calc(48px * var(--app-font-scale)), 7vw, calc(78px * var(--app-font-scale)))',
    fontWeight: 300,
    lineHeight: 1.02,
    letterSpacing: '-0.025em',
    margin: '0 0 28px'
  },
  em: {
    fontStyle: 'italic',
    color: 'var(--accent)',
    fontWeight: 300
  },
  subtitle: {
    fontSize: 'calc(16px * var(--app-font-scale))',
    color: 'var(--fg-1)',
    lineHeight: 1.6,
    maxWidth: 520,
    margin: 0
  },
  ctaRow: {
    display: 'flex',
    gap: 'calc(10px * var(--app-density-scale))',
    marginTop: 'calc(36px * var(--app-density-scale))',
    flexWrap: 'wrap'
  },
  cta: {
    padding: '12px 18px',
    fontSize: 'calc(14px * var(--app-font-scale))'
  },
  trustRow: {
    marginTop: 'calc(44px * var(--app-density-scale))',
    display: 'flex',
    gap: 'calc(28px * var(--app-density-scale))',
    color: 'var(--fg-3)',
    fontSize: 'calc(11.5px * var(--app-font-scale))'
  },
  trustTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 'calc(21px * var(--app-font-scale))',
    color: 'var(--fg-0)'
  },
  heroVisual: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  section: {
    padding: '80px 56px',
    maxWidth: 1400,
    margin: '0 auto',
    position: 'relative',
    zIndex: 2
  },
  sectionHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 'calc(36px * var(--app-density-scale))',
    marginBottom: 'calc(48px * var(--app-density-scale))'
  },
  sectionCopy: {
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    color: 'var(--fg-2)',
    maxWidth: 340,
    textAlign: 'right',
    lineHeight: 1.6
  },
  eyebrow: {
    fontSize: 'calc(11px * var(--app-font-scale))',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'var(--accent)',
    marginBottom: 'calc(14px * var(--app-density-scale))',
    fontWeight: 500
  },
  h2: {
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(calc(34px * var(--app-font-scale)), 5vw, calc(48px * var(--app-font-scale)))',
    fontWeight: 300,
    letterSpacing: '-0.02em',
    lineHeight: 1.1,
    margin: 0,
    maxWidth: 780
  },
  methodGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 'calc(16px * var(--app-density-scale))'
  },
  methodCard: {
    padding: 'calc(28px * var(--app-density-scale))',
    minHeight: 220,
    display: 'flex',
    flexDirection: 'column'
  },
  cardTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 'calc(22px * var(--app-density-scale))'
  },
  cardNum: {
    fontSize: 'calc(10.5px * var(--app-font-scale))',
    color: 'var(--fg-3)',
    letterSpacing: '0.1em'
  },
  cardTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 'calc(22px * var(--app-font-scale))',
    margin: '0 0 10px',
    fontWeight: 400,
    letterSpacing: '-0.01em'
  },
  cardText: {
    fontSize: 'calc(13px * var(--app-font-scale))',
    color: 'var(--fg-2)',
    margin: 0,
    lineHeight: 1.55
  },
  showcase: {
    overflow: 'hidden',
    borderRadius: 'var(--r-xl)',
    boxShadow: 'var(--shadow-lg)'
  },
  showcaseChrome: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid var(--line)',
    background: 'var(--bg-1)'
  },
  chromeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    background: 'var(--line-strong)'
  },
  showcaseBody: {
    background: 'var(--bg-1)'
  },
  preview: {
    display: 'grid',
    gridTemplateColumns: '1.1fr 1fr',
    minHeight: 430
  },
  previewSource: {
    padding: 'calc(28px * var(--app-density-scale))',
    borderRight: '1px solid var(--line)'
  },
  previewPanel: {
    padding: 'calc(28px * var(--app-density-scale))',
    background: 'var(--bg-2)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'calc(12px * var(--app-density-scale))',
    justifyContent: 'center'
  },
  previewEyebrow: {
    fontSize: 'calc(11px * var(--app-font-scale))',
    color: 'var(--fg-3)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginBottom: 'calc(12px * var(--app-density-scale))'
  },
  previewTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 'calc(24px * var(--app-font-scale))',
    margin: '0 0 14px',
    fontWeight: 400
  },
  previewText: {
    fontSize: 'calc(13px * var(--app-font-scale))',
    color: 'var(--fg-1)',
    lineHeight: 1.7,
    margin: 0
  },
  previewTags: {
    marginTop: 'calc(20px * var(--app-density-scale))',
    display: 'flex',
    gap: 'calc(6px * var(--app-density-scale))',
    flexWrap: 'wrap'
  },
  previewNode: {
    padding: 'calc(14px * var(--app-density-scale))',
    borderRadius: 'var(--r-md)',
    border: '1px solid var(--line)',
    background: 'var(--bg-1)',
    display: 'flex',
    gap: 'calc(12px * var(--app-density-scale))',
    alignItems: 'center',
    transition: 'transform 200ms var(--ease-out)'
  },
  previewIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    background: 'var(--accent-glow)',
    border: '1px solid var(--accent-soft)',
    color: 'var(--accent)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  footerCta: {
    maxWidth: 1400,
    margin: '60px auto',
    padding: '80px 56px',
    textAlign: 'center',
    borderTop: '1px solid var(--line-soft)',
    borderBottom: '1px solid var(--line-soft)',
    position: 'relative',
    zIndex: 2
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '30px 56px',
    position: 'relative',
    zIndex: 2
  },
  orbit: {
    position: 'relative',
    width: 520,
    height: 520,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  orbitGlow: {
    position: 'absolute',
    inset: 40,
    background: 'radial-gradient(closest-side, var(--accent-glow), transparent 70%)',
    filter: 'blur(20px)',
    animation: 'drift 8s ease-in-out infinite'
  },
  ring: {
    position: 'absolute',
    border: '1px solid var(--line)',
    borderRadius: '50%',
    opacity: 0.45
  },
  orbitCore: {
    width: 72,
    height: 72,
    borderRadius: '50%',
    background: 'radial-gradient(circle at 30% 30%, var(--parchment), var(--accent) 70%)',
    boxShadow: '0 0 60px 10px var(--accent-glow)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--bg-0)',
    fontFamily: 'var(--font-display)',
    fontSize: 'calc(30px * var(--app-font-scale))'
  },
  orbitChip: {
    position: 'absolute',
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(6px * var(--app-density-scale))',
    padding: '5px 10px',
    background: 'var(--bg-1)',
    border: '1px solid var(--line)',
    borderRadius: 999,
    fontSize: 'calc(11px * var(--app-font-scale))',
    color: 'var(--fg-1)',
    whiteSpace: 'nowrap',
    boxShadow: 'var(--shadow-sm)'
  }
};
window.Landing = Landing;
})();


// ---- components/Auth.jsx ----
(function () {
  window.__NOESIS_BOOT.files.push("components/Auth.jsx");
const Auth = ({
  initialMode = 'signin',
  onComplete,
  onBack
}) => {
  const Icon = window.Icon;
  const [mode, setMode] = React.useState(initialMode || 'signin');
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [success, setSuccess] = React.useState('');
  React.useEffect(() => {
    setMode(initialMode || 'signin');
    setError('');
    setSuccess('');
  }, [initialMode]);
  const submit = async e => {
    e && e.preventDefault && e.preventDefault();
    if (busy) return;
    setError('');
    setSuccess('');
    if (!email || !password) {
      setError('Email and password are required');
      return;
    }
    if (mode === 'signup' && !name.trim()) {
      setError('Full name is required');
      return;
    }
    setBusy(true);
    try {
      const fn = mode === 'signin' ? window.NoesisAPI.auth.signin : window.NoesisAPI.auth.signup;
      const payload = mode === 'signin' ? {
        email,
        password
      } : {
        email,
        password,
        name: name.trim()
      };
      await fn(payload);
      setSuccess(mode === 'signin' ? 'Login successful. Opening dashboard...' : 'Account created. Setting up your workspace...');
      onComplete && onComplete(mode === 'signin');
    } catch (e) {
      const messages = {
        missing_fields: 'Email, password, and name are required.',
        password_too_short: 'Password must be at least 8 characters.',
        email_exists: 'An account already exists for this email.',
        invalid_credentials: 'Email or password is incorrect.'
      };
      setError(messages[e.message] || e.message || 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };
  return React.createElement("div", {
    style: as.page
  }, React.createElement("div", {
    style: as.left
  }, React.createElement("div", {
    style: as.top
  }, React.createElement("button", {
    className: "btn btn-bare",
    onClick: onBack,
    disabled: busy,
    style: {
      padding: 0
    }
  }, React.createElement(Icon.ArrowLeft, {
    size: 13
  }), " Back to Home"), React.createElement(window.Logo, {
    size: 20
  })), React.createElement("form", {
    onSubmit: submit,
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      maxWidth: 380
    }
  }, React.createElement("div", {
    style: as.eyebrow
  }, mode === 'signin' ? 'Welcome back' : 'Create account'), React.createElement("h1", {
    style: as.title
  }, mode === 'signin' ? 'Back to the desk.' : 'Begin the work.'), React.createElement("p", {
    style: as.sub
  }, mode === 'signin' ? 'Your materials, notes, cards, and quiz history are waiting.' : 'Create a local learning workspace for OOP and Data Structures.'), React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'calc(10px * var(--app-density-scale))'
    }
  }, mode === 'signup' && React.createElement("div", {
    style: as.field
  }, React.createElement("label", {
    style: as.label
  }, "Full name"), React.createElement("input", {
    className: "input",
    placeholder: "Your name",
    value: name,
    disabled: busy,
    onChange: e => setName(e.target.value)
  })), React.createElement("div", {
    style: as.field
  }, React.createElement("label", {
    style: as.label
  }, "Email"), React.createElement("input", {
    className: "input",
    type: "email",
    placeholder: "you@university.edu",
    value: email,
    disabled: busy,
    onChange: e => setEmail(e.target.value)
  })), React.createElement("div", {
    style: as.field
  }, React.createElement("label", {
    style: as.label
  }, "Password"), React.createElement("input", {
    className: "input",
    type: "password",
    value: password,
    disabled: busy,
    onChange: e => setPassword(e.target.value),
    placeholder: "At least 8 characters"
  }))), error && React.createElement("div", {
    style: {
      color: 'var(--err)',
      fontSize: 'calc(12px * var(--app-font-scale))',
      marginTop: 'calc(12px * var(--app-density-scale))'
    }
  }, error), success && React.createElement("div", {
    style: {
      color: 'var(--ok)',
      fontSize: 'calc(12px * var(--app-font-scale))',
      marginTop: 'calc(12px * var(--app-density-scale))'
    }
  }, success), React.createElement("button", {
    type: "submit",
    className: "btn btn-primary",
    disabled: busy,
    style: {
      marginTop: 'calc(20px * var(--app-density-scale))',
      padding: '12px 14px',
      justifyContent: 'center',
      opacity: busy ? 0.6 : 1
    }
  }, busy ? mode === 'signin' ? 'Logging in...' : 'Creating account...' : mode === 'signin' ? 'Login' : 'Register', " ", React.createElement(Icon.ArrowRight, {
    size: 14
  })), React.createElement("div", {
    style: {
      marginTop: 'calc(24px * var(--app-density-scale))',
      fontSize: 'calc(12.5px * var(--app-font-scale))',
      color: 'var(--fg-2)'
    }
  }, mode === 'signin' ? 'New here?' : 'Already have an account?', ' ', React.createElement("a", {
    onClick: () => {
      if (busy) return;
      setError('');
      setSuccess('');
      setMode(mode === 'signin' ? 'signup' : 'signin');
    },
    style: {
      color: 'var(--accent)',
      cursor: busy ? 'not-allowed' : 'pointer'
    }
  }, mode === 'signin' ? 'Create an account' : 'Sign in'))), React.createElement("div", {
    style: {
      fontSize: 'calc(11px * var(--app-font-scale))',
      color: 'var(--fg-3)'
    }
  }, "Authentication is handled by the Noesis backend session layer.")), React.createElement("div", {
    style: as.right
  }, React.createElement("div", {
    style: as.quote
  }, React.createElement(Icon.Sparkle, {
    size: 28,
    style: {
      color: 'var(--accent)',
      opacity: 0.6
    }
  }), React.createElement("p", {
    style: as.quoteText
  }, "Noesis turns OOP and Data Structures material into notes, flashcards, quizzes, and guided tutor sessions."), React.createElement("div", {
    style: {
      fontSize: 'calc(12px * var(--app-font-scale))',
      color: 'var(--fg-2)'
    }
  }, "A local-first learning workspace for core Computer Science study."))));
};
const as = {
  page: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    minHeight: '100vh'
  },
  left: {
    padding: '40px 56px',
    display: 'flex',
    flexDirection: 'column',
    gap: 'calc(24px * var(--app-density-scale))'
  },
  top: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'calc(16px * var(--app-density-scale))'
  },
  right: {
    background: 'var(--bg-1)',
    borderLeft: '1px solid var(--line)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'calc(56px * var(--app-density-scale))',
    backgroundImage: 'radial-gradient(ellipse at 30% 20%, var(--accent-glow), transparent 60%)'
  },
  quote: {
    maxWidth: 420
  },
  quoteText: {
    fontFamily: 'var(--font-display)',
    fontSize: 'calc(32px * var(--app-font-scale))',
    fontWeight: 300,
    lineHeight: 1.3,
    letterSpacing: '-0.015em',
    margin: '18px 0'
  },
  eyebrow: {
    fontSize: 'calc(11px * var(--app-font-scale))',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--accent)',
    marginBottom: 'calc(14px * var(--app-density-scale))'
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 'calc(40px * var(--app-font-scale))',
    fontWeight: 300,
    margin: '0 0 12px',
    letterSpacing: '-0.02em'
  },
  sub: {
    fontSize: 'calc(14px * var(--app-font-scale))',
    color: 'var(--fg-2)',
    margin: '0 0 32px'
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'calc(6px * var(--app-density-scale))'
  },
  label: {
    fontSize: 'calc(11px * var(--app-font-scale))',
    color: 'var(--fg-3)',
    letterSpacing: '0.04em'
  }
};
const Onboarding = ({
  onComplete
}) => {
  const Icon = window.Icon;
  const [step, setStep] = React.useState(0);
  const [subject, setSubject] = React.useState('computer-science');
  const [courses, setCourses] = React.useState(['oop', 'ds']);
  const [goal, setGoal] = React.useState('exams');
  const [time, setTime] = React.useState(45);
  const [level, setLevel] = React.useState('beginner');
  const [deadline, setDeadline] = React.useState('');
  const [daysPerWeek, setDaysPerWeek] = React.useState(5);
  const [learningStyle, setLearningStyle] = React.useState('mixed');
  const [preferredLanguage, setPreferredLanguage] = React.useState('java');
  const [confidence, setConfidence] = React.useState(3);
  const [weakTopics, setWeakTopics] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const steps = [{
    title: 'What are you studying?',
    sub: 'Noesis is tuned for Object-Oriented Programming and Data Structures.'
  }, {
    title: 'Which tracks do you want active?',
    sub: 'These seed your dashboard and tutor context.'
  }, {
    title: 'What is the goal?',
    sub: 'This shapes pacing and dashboard recommendations.'
  }, {
    title: 'How much time per day?',
    sub: 'The weekly target is calculated from this.'
  }, {
    title: 'Tune your study plan',
    sub: 'Optional details help Noesis choose the next best topic.'
  }];
  const next = async () => {
    setError('');
    if (step < steps.length - 1) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    try {
      const courseCatalog = {
        oop: {
          code: 'CS-OOP',
          title: 'Object-Oriented Programming',
          professor: ''
        },
        ds: {
          code: 'CS-DS',
          title: 'Data Structures & Algorithms',
          professor: ''
        }
      };
      const courseObjs = courses.map(id => courseCatalog[id]).filter(Boolean);
      await window.NoesisAPI.auth.onboarding({
        subject,
        goal,
        daily_minutes: time,
        courses: courseObjs,
        currentLevel: level,
        deadline,
        daysPerWeek,
        minutesPerSession: time,
        learningStyle,
        preferredLanguage,
        confidence,
        weakTopics: weakTopics.split(',').map(t => t.trim()).filter(Boolean)
      });
      onComplete();
    } catch (e) {
      setError(e.message || 'onboarding_failed');
    } finally {
      setBusy(false);
    }
  };
  return React.createElement("div", {
    style: os.page
  }, React.createElement("header", {
    style: os.header
  }, React.createElement(window.Logo, {
    size: 18
  }), React.createElement("div", {
    style: os.progress
  }, steps.map((_, i) => React.createElement("div", {
    key: i,
    style: {
      height: 3,
      flex: 1,
      borderRadius: 2,
      background: i <= step ? 'var(--accent)' : 'var(--line)',
      transition: 'background 400ms var(--ease-out)'
    }
  }))), React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 'calc(11px * var(--app-font-scale))',
      color: 'var(--fg-3)'
    }
  }, step + 1, " / ", steps.length)), React.createElement("main", {
    style: os.main
  }, React.createElement("div", {
    key: step,
    className: "fade-in",
    style: {
      maxWidth: 640,
      width: '100%'
    }
  }, React.createElement("div", {
    style: os.eyebrow
  }, "Step ", String(step + 1).padStart(2, '0')), React.createElement("h1", {
    style: os.title
  }, steps[step].title), React.createElement("p", {
    style: os.sub
  }, steps[step].sub), React.createElement("div", {
    style: {
      marginTop: 'calc(36px * var(--app-density-scale))'
    }
  }, step === 0 && React.createElement("div", {
    style: os.grid3
  }, [{
    id: 'computer-science',
    label: 'OOP + Data Structures',
    icon: 'Code'
  }, {
    id: 'oop',
    label: 'Object-Oriented Programming',
    icon: 'Cube'
  }, {
    id: 'data-structures',
    label: 'Data Structures',
    icon: 'Tree'
  }].map(o => {
    const C = Icon[o.icon];
    const active = subject === o.id;
    return React.createElement("button", {
      key: o.id,
      onClick: () => setSubject(o.id),
      style: {
        ...os.tile,
        ...(active ? os.tileActive : {})
      }
    }, React.createElement(C, {
      size: 20,
      style: {
        color: active ? 'var(--accent)' : 'var(--fg-2)'
      }
    }), React.createElement("span", {
      style: {
        fontSize: 'calc(13px * var(--app-font-scale))',
        color: active ? 'var(--fg-0)' : 'var(--fg-1)'
      }
    }, o.label));
  })), step === 1 && React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'calc(8px * var(--app-density-scale))'
    }
  }, [{
    id: 'oop',
    label: 'Object-Oriented Programming',
    prof: 'Classes, objects, encapsulation, inheritance, polymorphism, interfaces'
  }, {
    id: 'ds',
    label: 'Data Structures & Algorithms',
    prof: 'Arrays, linked lists, stacks, queues, trees, graphs, hashing, Big-O'
  }].map(c => {
    const on = courses.includes(c.id);
    return React.createElement("button", {
      key: c.id,
      onClick: () => setCourses(on ? courses.filter(x => x !== c.id) : [...courses, c.id]),
      style: {
        ...os.course,
        ...(on ? os.courseActive : {})
      }
    }, React.createElement("div", {
      style: {
        ...os.check,
        background: on ? 'var(--accent)' : 'transparent',
        borderColor: on ? 'var(--accent)' : 'var(--line-strong)'
      }
    }, on && React.createElement(Icon.Check, {
      size: 10,
      style: {
        color: 'var(--bg-0)'
      }
    })), React.createElement("div", {
      style: {
        textAlign: 'left',
        flex: 1
      }
    }, React.createElement("div", {
      style: {
        fontSize: 'calc(13px * var(--app-font-scale))',
        color: 'var(--fg-0)',
        fontWeight: 500
      }
    }, c.label), React.createElement("div", {
      style: {
        fontSize: 'calc(11.5px * var(--app-font-scale))',
        color: 'var(--fg-3)',
        marginTop: 'calc(2px * var(--app-density-scale))'
      }
    }, c.prof)));
  })), step === 2 && React.createElement("div", {
    style: os.grid2
  }, [{
    id: 'exams',
    label: 'Ace my exams',
    sub: 'Turn material into reviewable exam prep',
    icon: 'Target'
  }, {
    id: 'understand',
    label: 'Understand deeply',
    sub: 'Use tutor sessions for conceptual gaps',
    icon: 'Brain'
  }, {
    id: 'retain',
    label: 'Retain long-term',
    sub: 'Use spaced repetition after each topic',
    icon: 'Bookmark'
  }, {
    id: 'practice',
    label: 'Practice problems',
    sub: 'Use quizzes to expose weak topics',
    icon: 'Bolt'
  }].map(o => {
    const C = Icon[o.icon];
    const active = goal === o.id;
    return React.createElement("button", {
      key: o.id,
      onClick: () => setGoal(o.id),
      style: {
        ...os.goalTile,
        ...(active ? os.tileActive : {})
      }
    }, React.createElement(C, {
      size: 22,
      style: {
        color: active ? 'var(--accent)' : 'var(--fg-2)'
      }
    }), React.createElement("div", {
      style: {
        textAlign: 'left'
      }
    }, React.createElement("div", {
      style: {
        fontSize: 'calc(14px * var(--app-font-scale))',
        color: 'var(--fg-0)',
        fontWeight: 500
      }
    }, o.label), React.createElement("div", {
      style: {
        fontSize: 'calc(12px * var(--app-font-scale))',
        color: 'var(--fg-2)',
        marginTop: 'calc(3px * var(--app-density-scale))'
      }
    }, o.sub)));
  })), step === 3 && React.createElement("div", null, React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 'calc(10px * var(--app-density-scale))',
      marginBottom: 'calc(20px * var(--app-density-scale))'
    }
  }, React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'calc(72px * var(--app-font-scale))',
      fontWeight: 300,
      color: 'var(--fg-0)'
    }
  }, time), React.createElement("span", {
    style: {
      fontSize: 'calc(15px * var(--app-font-scale))',
      color: 'var(--fg-2)'
    }
  }, "minutes / day")), React.createElement("input", {
    type: "range",
    min: "15",
    max: "120",
    step: "15",
    value: time,
    onChange: e => setTime(+e.target.value),
    style: {
      width: '100%',
      accentColor: 'var(--accent)'
    }
  }), React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginTop: 'calc(8px * var(--app-density-scale))',
      fontSize: 'calc(11px * var(--app-font-scale))',
      color: 'var(--fg-3)'
    },
    className: "mono"
  }, React.createElement("span", null, "15m"), React.createElement("span", null, "60m"), React.createElement("span", null, "120m")), React.createElement("div", {
    style: {
      marginTop: 'calc(28px * var(--app-density-scale))',
      padding: 'calc(16px * var(--app-density-scale))',
      border: '1px solid var(--line)',
      borderRadius: 'var(--r-md)',
      background: 'var(--bg-1)'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 'calc(11px * var(--app-font-scale))',
      color: 'var(--accent)',
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      marginBottom: 'calc(6px * var(--app-density-scale))'
    }
  }, "Your plan"), React.createElement("div", {
    style: {
      fontSize: 'calc(13px * var(--app-font-scale))',
      color: 'var(--fg-1)'
    }
  }, "Roughly ", React.createElement("b", null, time, "m/day"), ": one tutor session, one flashcard review, and one quiz cycle each week."))), step === 4 && React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 'calc(12px * var(--app-density-scale))'
    }
  }, React.createElement("label", {
    style: os.formField
  }, React.createElement("span", {
    style: os.formLabel
  }, "Current level"), React.createElement("select", {
    className: "input",
    value: level,
    onChange: e => setLevel(e.target.value)
  }, React.createElement("option", {
    value: "beginner"
  }, "Beginner"), React.createElement("option", {
    value: "intermediate"
  }, "Intermediate"), React.createElement("option", {
    value: "advanced"
  }, "Advanced"))), React.createElement("label", {
    style: os.formField
  }, React.createElement("span", {
    style: os.formLabel
  }, "Exam or deadline"), React.createElement("input", {
    className: "input",
    type: "date",
    value: deadline,
    onChange: e => setDeadline(e.target.value)
  })), React.createElement("label", {
    style: os.formField
  }, React.createElement("span", {
    style: os.formLabel
  }, "Days per week"), React.createElement("input", {
    className: "input",
    type: "number",
    min: "1",
    max: "7",
    value: daysPerWeek,
    onChange: e => setDaysPerWeek(+e.target.value || 5)
  })), React.createElement("label", {
    style: os.formField
  }, React.createElement("span", {
    style: os.formLabel
  }, "Preferred language"), React.createElement("select", {
    className: "input",
    value: preferredLanguage,
    onChange: e => setPreferredLanguage(e.target.value)
  }, React.createElement("option", {
    value: "java"
  }, "Java"), React.createElement("option", {
    value: "python"
  }, "Python"), React.createElement("option", {
    value: "javascript"
  }, "JavaScript"), React.createElement("option", {
    value: "cpp"
  }, "C++"))), React.createElement("label", {
    style: os.formField
  }, React.createElement("span", {
    style: os.formLabel
  }, "Learning style"), React.createElement("select", {
    className: "input",
    value: learningStyle,
    onChange: e => setLearningStyle(e.target.value)
  }, React.createElement("option", {
    value: "mixed"
  }, "Mixed"), React.createElement("option", {
    value: "video"
  }, "Video first"), React.createElement("option", {
    value: "notes"
  }, "Notes first"), React.createElement("option", {
    value: "quizzes"
  }, "Quiz first"), React.createElement("option", {
    value: "flashcards"
  }, "Flashcards"))), React.createElement("label", {
    style: os.formField
  }, React.createElement("span", {
    style: os.formLabel
  }, "Confidence: ", confidence, "/5"), React.createElement("input", {
    type: "range",
    min: "1",
    max: "5",
    value: confidence,
    onChange: e => setConfidence(+e.target.value),
    style: {
      width: '100%',
      accentColor: 'var(--accent)'
    }
  })), React.createElement("label", {
    style: {
      ...os.formField,
      gridColumn: '1 / -1'
    }
  }, React.createElement("span", {
    style: os.formLabel
  }, "Weak topics you already know"), React.createElement("input", {
    className: "input",
    value: weakTopics,
    onChange: e => setWeakTopics(e.target.value),
    placeholder: "e.g. polymorphism, linked list pointers, Big-O"
  })))), error && React.createElement("div", {
    style: {
      marginTop: 'calc(16px * var(--app-density-scale))',
      color: 'var(--err)',
      fontSize: 'calc(12px * var(--app-font-scale))'
    }
  }, error), React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginTop: 'calc(48px * var(--app-density-scale))'
    }
  }, React.createElement("button", {
    className: "btn btn-bare",
    onClick: () => step > 0 && setStep(step - 1),
    style: {
      visibility: step > 0 ? 'visible' : 'hidden'
    }
  }, React.createElement(Icon.ArrowLeft, {
    size: 13
  }), " Back"), React.createElement("button", {
    className: "btn btn-accent",
    onClick: next,
    disabled: busy || step === 1 && courses.length === 0
  }, busy ? 'Saving...' : step === steps.length - 1 ? 'Enter Noesis' : 'Continue', " ", React.createElement(Icon.ArrowRight, {
    size: 13
  }))))));
};
const os = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg-0)',
    display: 'flex',
    flexDirection: 'column'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(24px * var(--app-density-scale))',
    padding: '20px 56px',
    borderBottom: '1px solid var(--line-soft)'
  },
  progress: {
    flex: 1,
    display: 'flex',
    gap: 'calc(6px * var(--app-density-scale))',
    maxWidth: 360
  },
  main: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'calc(56px * var(--app-density-scale))'
  },
  eyebrow: {
    fontSize: 'calc(11px * var(--app-font-scale))',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'var(--accent)',
    marginBottom: 'calc(14px * var(--app-density-scale))'
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 'calc(44px * var(--app-font-scale))',
    fontWeight: 300,
    letterSpacing: '-0.02em',
    margin: '0 0 10px'
  },
  sub: {
    fontSize: 'calc(15px * var(--app-font-scale))',
    color: 'var(--fg-2)',
    margin: 0
  },
  grid3: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 'calc(10px * var(--app-density-scale))'
  },
  grid2: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 'calc(10px * var(--app-density-scale))'
  },
  tile: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'calc(10px * var(--app-density-scale))',
    alignItems: 'flex-start',
    padding: '20px 16px',
    borderRadius: 'var(--r-md)',
    background: 'var(--bg-1)',
    border: '1px solid var(--line)',
    minHeight: 96,
    transition: 'all 160ms var(--ease-out)'
  },
  tileActive: {
    background: 'var(--bg-2)',
    borderColor: 'var(--accent-soft)',
    boxShadow: '0 0 0 3px var(--accent-glow)'
  },
  goalTile: {
    display: 'flex',
    gap: 'calc(14px * var(--app-density-scale))',
    alignItems: 'flex-start',
    padding: '18px 18px',
    borderRadius: 'var(--r-md)',
    background: 'var(--bg-1)',
    border: '1px solid var(--line)',
    transition: 'all 160ms var(--ease-out)'
  },
  course: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(12px * var(--app-density-scale))',
    padding: '14px 16px',
    borderRadius: 'var(--r-md)',
    background: 'var(--bg-1)',
    border: '1px solid var(--line)',
    transition: 'all 160ms var(--ease-out)'
  },
  courseActive: {
    borderColor: 'var(--accent-soft)',
    background: 'var(--bg-2)'
  },
  formField: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'calc(6px * var(--app-density-scale))'
  },
  formLabel: {
    fontSize: 'calc(11px * var(--app-font-scale))',
    color: 'var(--fg-3)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase'
  },
  check: {
    width: 18,
    height: 18,
    borderRadius: 5,
    border: '1.5px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 160ms var(--ease-out)'
  }
};
window.Auth = Auth;
window.Onboarding = Onboarding;
})();


// ---- components/Dashboard.jsx ----
(function () {
  window.__NOESIS_BOOT.files.push("components/Dashboard.jsx");
const Dashboard = ({
  onNav
}) => {
  const Icon = window.Icon;
  const [hour] = React.useState(new Date().getHours());
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const [data, setData] = React.useState(null);
  const [loadError, setLoadError] = React.useState('');
  React.useEffect(() => {
    let alive = true;
    window.NoesisAPI.dashboard.get().then(d => {
      if (alive) {
        setData(d);
        setLoadError('');
      }
    }).catch(() => {
      if (alive) setLoadError('Could not load dashboard. Check server connection.');
    });
    return () => {
      alive = false;
    };
  }, []);
  const userName = data && data.greeting ? data.greeting.name : 'there';
  const weekly = data && data.weekly_hours || [0, 0, 0, 0, 0, 0, 0];
  const totalWeek = data && data.total_week_hours || 0;
  const goalH = data && data.goal_hours || 5;
  const dueCount = data && data.due_cards_count || 0;
  const dueRows = data && data.due_review_preview || [];
  const resumeItems = data && data.resume_items || [];
  const conceptList = data && data.concept_map || [];
  const upcomingItems = data && data.upcoming || [];
  const insightItems = data && data.insights || [];
  const summary = data && data.summary || {};
  const recentActivity = data && data.recent_activity || [];
  const nextAction = data && data.next_recommended_action;
  const game = data && data.gamification;
  const xp = game && game.xp ? game.xp : {};
  const dailyGoal = game && game.daily_goal ? game.daily_goal : null;
  const recentBadges = game && game.achievements ? game.achievements.recent || [] : [];
  const leaderboardPreview = data && data.leaderboard_preview || [];
  return React.createElement("div", {
    style: {
      background: 'var(--bg-0)',
      minHeight: '100vh',
      position: 'relative'
    }
  }, React.createElement("div", {
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 420,
      pointerEvents: 'none',
      background: 'radial-gradient(ellipse 70% 80% at 82% 0%, var(--accent-glow), transparent 60%)',
      opacity: 0.9
    }
  }), React.createElement(window.Topbar, {
    title: "Today",
    crumbs: [userName],
    right: React.createElement("button", {
      className: "btn btn-ghost"
    }, React.createElement(Icon.Calendar, {
      size: 13
    }), " ", new Date().toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric'
    }))
  }), React.createElement("div", {
    style: {
      ...ds.page,
      position: 'relative',
      zIndex: 1
    }
  }, loadError && React.createElement("div", {
    style: ds.errorBanner
  }, React.createElement(Icon.X, {
    size: 14
  }), React.createElement("span", null, loadError)), React.createElement("section", {
    style: ds.hero,
    className: "reveal"
  }, React.createElement("div", null, React.createElement("div", {
    style: ds.eyebrow
  }, React.createElement("span", {
    style: {
      display: 'inline-block',
      width: 6,
      height: 6,
      borderRadius: 3,
      background: 'var(--accent)',
      marginRight: 8,
      boxShadow: '0 0 8px var(--accent)'
    }
  }), greeting, ", ", userName), React.createElement("h1", {
    style: ds.heroTitle
  }, dueCount > 0 ? React.createElement(React.Fragment, null, "You have ", React.createElement("em", {
    style: {
      fontStyle: 'italic',
      color: 'var(--accent)'
    }
  }, dueCount), " cards due \u2014 let's work through them.") : React.createElement(React.Fragment, null, "A clean slate. Let's ", React.createElement("em", {
    style: {
      fontStyle: 'italic',
      color: 'var(--accent)'
    }
  }, "start something"), ".")), React.createElement("p", {
    style: ds.heroSub
  }, "You're at ", totalWeek, "h this week of ", goalH, "h goal. Pick up where you left, or start a new tutor session."), React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'calc(10px * var(--app-density-scale))',
      marginTop: 'calc(24px * var(--app-density-scale))'
    }
  }, React.createElement("button", {
    className: "btn btn-accent",
    onClick: () => onNav(nextAction && nextAction.route || 'tutor')
  }, React.createElement(Icon.Play, {
    size: 12
  }), " ", nextAction ? nextAction.label || nextAction.title : "Start today's session"), React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => onNav('study-plan')
  }, React.createElement(Icon.Calendar, {
    size: 13
  }), " Study plan"), React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => onNav('flashcards')
  }, React.createElement(Icon.Cards, {
    size: 13
  }), " ", dueCount, " cards due"))), React.createElement("div", {
    style: ds.focusWrap
  }, React.createElement(FocusRing, {
    value: Math.min(100, Math.round(totalWeek / Math.max(0.001, goalH) * 100))
  }))), React.createElement("section", {
    style: ds.metrics,
    className: "reveal"
  }, [{
    l: 'Level',
    v: xp.level || 1
  }, {
    l: 'XP',
    v: xp.total_xp || 0
  }, {
    l: 'Materials',
    v: summary.materials || 0
  }, {
    l: 'Notes',
    v: summary.notes || 0
  }, {
    l: 'Flashcards',
    v: summary.flashcards || 0
  }, {
    l: 'Quizzes completed',
    v: summary.quizzes_completed || 0
  }, {
    l: 'Average score',
    v: (summary.average_score ?? summary.avg_score) == null ? '-' : `${summary.average_score ?? summary.avg_score}%`
  }].map(m => React.createElement("div", {
    key: m.l,
    className: "card",
    style: ds.metricCard
  }, React.createElement("div", {
    style: ds.metricValue
  }, m.v), React.createElement("div", {
    style: ds.metricLabel
  }, m.l)))), React.createElement("section", {
    style: ds.grid,
    className: "reveal"
  }, React.createElement("div", {
    className: "card",
    style: {
      padding: 'calc(22px * var(--app-density-scale))'
    }
  }, React.createElement("div", {
    style: ds.cardHead
  }, React.createElement("span", {
    style: ds.cardTitle
  }, "Level progress"), React.createElement("span", {
    className: "chip chip-accent"
  }, xp.weekly_xp || 0, " XP this week")), React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 'calc(8px * var(--app-density-scale))',
      marginTop: 'calc(14px * var(--app-density-scale))'
    }
  }, React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'calc(44px * var(--app-font-scale))',
      fontWeight: 300
    }
  }, xp.level || 1), React.createElement("span", {
    style: {
      fontSize: 'calc(12px * var(--app-font-scale))',
      color: 'var(--fg-2)'
    }
  }, "level")), React.createElement("div", {
    style: ds.progress
  }, React.createElement("div", {
    style: {
      ...ds.progressFill,
      width: (xp.progress_pct || 0) + '%'
    }
  })), React.createElement("div", {
    style: {
      marginTop: 'calc(10px * var(--app-density-scale))',
      fontSize: 'calc(11.5px * var(--app-font-scale))',
      color: 'var(--fg-3)'
    }
  }, xp.xp_to_next_level || 0, " XP to next level")), React.createElement("div", {
    className: "card",
    style: {
      padding: 'calc(22px * var(--app-density-scale))'
    }
  }, React.createElement("div", {
    style: ds.cardHead
  }, React.createElement("span", {
    style: ds.cardTitle
  }, "Daily goal"), React.createElement(Icon.Bolt, {
    size: 14,
    style: {
      color: 'var(--accent)'
    }
  })), React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'calc(36px * var(--app-font-scale))',
      fontWeight: 300,
      marginTop: 'calc(14px * var(--app-density-scale))'
    }
  }, dailyGoal ? dailyGoal.completed_xp : 0, "/", dailyGoal ? dailyGoal.target_xp : 50), React.createElement("div", {
    style: ds.progress
  }, React.createElement("div", {
    style: {
      ...ds.progressFill,
      width: (dailyGoal ? dailyGoal.xp_progress_pct : 0) + '%'
    }
  })), React.createElement("div", {
    style: {
      marginTop: 'calc(10px * var(--app-density-scale))',
      fontSize: 'calc(11.5px * var(--app-font-scale))',
      color: 'var(--fg-3)'
    }
  }, dailyGoal && dailyGoal.status === 'completed' ? 'Goal complete' : 'XP target for today')), React.createElement("div", {
    className: "card",
    style: {
      padding: 'calc(22px * var(--app-density-scale))'
    }
  }, React.createElement("div", {
    style: ds.cardHead
  }, React.createElement("span", {
    style: ds.cardTitle
  }, "Weekly leaderboard"), React.createElement("button", {
    className: "btn btn-bare",
    onClick: () => onNav('community'),
    style: {
      fontSize: 'calc(11.5px * var(--app-font-scale))'
    }
  }, "Open ", React.createElement(Icon.ArrowRight, {
    size: 11
  }))), React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'calc(8px * var(--app-density-scale))',
      marginTop: 'calc(14px * var(--app-density-scale))'
    }
  }, (leaderboardPreview.length ? leaderboardPreview : [{
    rank: '-',
    display_name: 'No XP yet',
    xp: 0
  }]).slice(0, 4).map((row, i) => React.createElement("div", {
    key: row.user_id || i,
    style: ds.leaderRow
  }, React.createElement("span", {
    className: "mono",
    style: {
      color: 'var(--accent)',
      width: 28
    }
  }, "#", row.rank), React.createElement("span", {
    style: {
      flex: 1,
      color: 'var(--fg-1)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, row.display_name), React.createElement("span", {
    className: "mono",
    style: {
      color: 'var(--fg-3)'
    }
  }, row.xp, " XP")))))), React.createElement("section", {
    style: ds.grid,
    className: "reveal"
  }, React.createElement("div", {
    className: "card",
    style: {
      padding: 'calc(22px * var(--app-density-scale))',
      gridColumn: 'span 2'
    }
  }, React.createElement("div", {
    style: ds.cardHead
  }, React.createElement("span", {
    style: ds.cardTitle
  }, "Pick up where you left"), React.createElement("button", {
    className: "btn btn-bare",
    onClick: () => onNav('materials'),
    style: {
      fontSize: 'calc(11.5px * var(--app-font-scale))'
    }
  }, "See library ", React.createElement(Icon.ArrowRight, {
    size: 11
  }))), React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 'calc(10px * var(--app-density-scale))',
      marginTop: 'calc(14px * var(--app-density-scale))'
    }
  }, (resumeItems.length ? resumeItems : [{
    t: 'Upload material to get started',
    src: 'Library',
    prog: 0,
    chip: 'New'
  }]).slice(0, 2).map((c, i) => React.createElement("button", {
    key: i,
    style: ds.resumeCard,
    onClick: () => {
      if (resumeItems.length && c.id) sessionStorage.setItem('noesis.materialId', String(c.id));
      onNav(resumeItems.length ? 'material' : 'materials');
    }
  }, React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'calc(8px * var(--app-density-scale))'
    }
  }, React.createElement("span", {
    className: "chip"
  }, c.chip), React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 'calc(10.5px * var(--app-font-scale))',
      color: 'var(--fg-3)'
    }
  }, c.prog, "%")), React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'calc(20px * var(--app-font-scale))',
      fontWeight: 400,
      color: 'var(--fg-0)',
      margin: '10px 0 6px',
      letterSpacing: '-0.01em',
      textAlign: 'left'
    }
  }, c.t), React.createElement("div", {
    style: {
      fontSize: 'calc(11.5px * var(--app-font-scale))',
      color: 'var(--fg-3)',
      textAlign: 'left'
    }
  }, c.src), React.createElement("div", {
    style: ds.progress
  }, React.createElement("div", {
    style: {
      ...ds.progressFill,
      width: c.prog + '%'
    }
  })))))), React.createElement("div", {
    className: "card",
    style: {
      padding: 'calc(22px * var(--app-density-scale))'
    }
  }, React.createElement("div", {
    style: ds.cardHead
  }, React.createElement("span", {
    style: ds.cardTitle
  }, "This week"), React.createElement(Icon.Flame, {
    size: 14,
    style: {
      color: 'var(--accent)'
    }
  })), React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 'calc(8px * var(--app-density-scale))',
      marginTop: 'calc(14px * var(--app-density-scale))'
    }
  }, React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'calc(46px * var(--app-font-scale))',
      fontWeight: 300
    }
  }, totalWeek), React.createElement("span", {
    style: {
      fontSize: 'calc(12px * var(--app-font-scale))',
      color: 'var(--fg-2)'
    }
  }, "hrs focused")), React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'calc(4px * var(--app-density-scale))',
      marginTop: 'calc(12px * var(--app-density-scale))'
    }
  }, weekly.map((h, i) => React.createElement("div", {
    key: i,
    style: {
      flex: 1
    }
  }, React.createElement("div", {
    style: {
      height: h * 12,
      minHeight: 3,
      background: i === 6 ? 'var(--accent)' : 'var(--fg-4)',
      borderRadius: 2,
      marginBottom: 'calc(6px * var(--app-density-scale))',
      transition: 'all 300ms var(--ease-out)'
    }
  }), React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 'calc(9px * var(--app-font-scale))',
      color: 'var(--fg-3)',
      textAlign: 'center'
    }
  }, ['M', 'T', 'W', 'T', 'F', 'S', 'S'][i])))), React.createElement("div", {
    style: {
      marginTop: 'calc(16px * var(--app-density-scale))',
      paddingTop: 'calc(14px * var(--app-density-scale))',
      borderTop: '1px solid var(--line)',
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 'calc(11.5px * var(--app-font-scale))',
      color: 'var(--fg-2)'
    }
  }, React.createElement("div", null, "Streak: ", React.createElement("span", {
    style: {
      color: 'var(--ok)'
    }
  }, data && data.streak_days || 0, "d")), React.createElement("div", null, "Goal: ", goalH, "h")))), React.createElement("section", {
    style: ds.grid
  }, React.createElement("div", {
    className: "card",
    style: {
      padding: 'calc(22px * var(--app-density-scale))'
    }
  }, React.createElement("div", {
    style: ds.cardHead
  }, React.createElement("span", {
    style: ds.cardTitle
  }, "Due for review"), React.createElement("span", {
    className: "chip chip-accent"
  }, dueCount, " cards")), React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'calc(10px * var(--app-density-scale))',
      marginTop: 'calc(14px * var(--app-density-scale))'
    }
  }, (dueRows.length ? dueRows : [{
    q: 'Generate flashcards from a material to start reviewing.',
    t: '—',
    conf: 'good'
  }]).slice(0, 3).map((r, i) => React.createElement("div", {
    key: i,
    style: ds.reviewRow
  }, React.createElement("span", {
    style: {
      ...ds.dot,
      background: r.conf === 'shaky' ? 'var(--err)' : r.conf === 'ok' ? 'var(--warn)' : 'var(--ok)'
    }
  }), React.createElement("span", {
    style: {
      fontSize: 'calc(13px * var(--app-font-scale))',
      color: 'var(--fg-1)',
      flex: 1
    }
  }, r.q), React.createElement("span", {
    style: {
      fontSize: 'calc(10.5px * var(--app-font-scale))',
      color: 'var(--fg-3)'
    },
    className: "mono"
  }, r.t)))), React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => onNav('flashcards'),
    style: {
      marginTop: 'calc(14px * var(--app-density-scale))',
      width: '100%',
      justifyContent: 'center'
    }
  }, "Review now ", React.createElement(Icon.ArrowRight, {
    size: 12
  }))), React.createElement("div", {
    className: "card",
    style: {
      padding: 'calc(22px * var(--app-density-scale))'
    }
  }, React.createElement("div", {
    style: ds.cardHead
  }, React.createElement("span", {
    style: ds.cardTitle
  }, "Concept mastery"), React.createElement("button", {
    className: "btn btn-bare",
    style: {
      fontSize: 'calc(11.5px * var(--app-font-scale))'
    },
    onClick: () => onNav('progress')
  }, "Open ", React.createElement(Icon.ArrowUpRight, {
    size: 11
  }))), React.createElement(ConceptMap, {
    concepts: conceptList
  })), React.createElement("div", {
    className: "card",
    style: {
      padding: 'calc(22px * var(--app-density-scale))'
    }
  }, React.createElement("div", {
    style: ds.cardHead
  }, React.createElement("span", {
    style: ds.cardTitle
  }, "On the horizon")), React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'calc(12px * var(--app-density-scale))',
      marginTop: 'calc(14px * var(--app-density-scale))'
    }
  }, (upcomingItems.length ? upcomingItems : [{
    d: 'Course',
    dn: '-',
    t: 'No active course tracks',
    sub: 'Complete onboarding to add OOP and Data Structures',
    tint: 'default'
  }]).map((u, i) => React.createElement("div", {
    key: i,
    style: ds.upcoming
  }, React.createElement("div", {
    style: {
      ...ds.dateBox,
      borderColor: u.tint === 'warn' ? 'var(--warn)' : u.tint === 'accent' ? 'var(--accent-soft)' : 'var(--line-strong)'
    }
  }, React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 'calc(9px * var(--app-font-scale))',
      color: 'var(--fg-3)',
      letterSpacing: '0.1em',
      textTransform: 'uppercase'
    }
  }, u.d), React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'calc(22px * var(--app-font-scale))',
      color: 'var(--fg-0)',
      lineHeight: 1
    }
  }, u.dn)), React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, React.createElement("div", {
    style: {
      fontSize: 'calc(13px * var(--app-font-scale))',
      color: 'var(--fg-0)',
      fontWeight: 500
    }
  }, u.t), React.createElement("div", {
    style: {
      fontSize: 'calc(11.5px * var(--app-font-scale))',
      color: 'var(--fg-3)',
      marginTop: 'calc(2px * var(--app-density-scale))'
    }
  }, u.sub))))))), React.createElement("section", {
    className: "card",
    style: {
      padding: 'calc(22px * var(--app-density-scale))',
      marginBottom: 'calc(40px * var(--app-density-scale))'
    }
  }, React.createElement("div", {
    style: ds.cardHead
  }, React.createElement("span", {
    style: ds.cardTitle
  }, React.createElement(Icon.Sparkle, {
    size: 13,
    style: {
      color: 'var(--accent)'
    }
  }), " No\u0113sis noticed"), React.createElement("span", {
    style: {
      fontSize: 'calc(11px * var(--app-font-scale))',
      color: 'var(--fg-3)'
    }
  }, recentActivity.length, " recent event", recentActivity.length === 1 ? '' : 's')), React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 'calc(12px * var(--app-density-scale))',
      marginTop: 'calc(14px * var(--app-density-scale))'
    }
  }, insightItems.map((s, i) => {
    const C = Icon[s.icon] || Icon.Sparkle;
    return React.createElement("div", {
      key: i,
      style: ds.insight
    }, React.createElement(C, {
      size: 15,
      style: {
        color: 'var(--accent)'
      }
    }), React.createElement("div", {
      style: {
        fontSize: 'calc(13px * var(--app-font-scale))',
        color: 'var(--fg-0)',
        fontWeight: 500,
        margin: '8px 0 4px'
      }
    }, s.t), React.createElement("div", {
      style: {
        fontSize: 'calc(12px * var(--app-font-scale))',
        color: 'var(--fg-2)'
      }
    }, s.d), React.createElement("button", {
      className: "btn btn-bare",
      onClick: () => s.route && onNav(s.route),
      style: {
        marginTop: 'calc(10px * var(--app-density-scale))',
        padding: '4px 0',
        fontSize: 'calc(12px * var(--app-font-scale))',
        color: 'var(--accent)'
      }
    }, s.cta, " ", React.createElement(Icon.ArrowRight, {
      size: 11
    })));
  })), recentActivity.length > 0 && React.createElement("div", {
    style: {
      marginTop: 'calc(16px * var(--app-density-scale))',
      paddingTop: 'calc(14px * var(--app-density-scale))',
      borderTop: '1px solid var(--line)',
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 'calc(10px * var(--app-density-scale))'
    }
  }, recentActivity.slice(0, 4).map((a, i) => React.createElement("div", {
    key: i,
    style: {
      fontSize: 'calc(11.5px * var(--app-font-scale))',
      color: 'var(--fg-2)'
    }
  }, React.createElement("span", {
    style: {
      color: 'var(--fg-0)',
      textTransform: 'capitalize'
    }
  }, a.kind), React.createElement("div", {
    style: {
      marginTop: 'calc(3px * var(--app-density-scale))',
      color: 'var(--fg-3)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, a.title || 'Activity'))))), recentBadges.length > 0 && React.createElement("section", {
    className: "card",
    style: {
      padding: 'calc(22px * var(--app-density-scale))',
      marginBottom: 'calc(40px * var(--app-density-scale))'
    }
  }, React.createElement("div", {
    style: ds.cardHead
  }, React.createElement("span", {
    style: ds.cardTitle
  }, "Recent achievements"), React.createElement("button", {
    className: "btn btn-bare",
    onClick: () => onNav('community'),
    style: {
      fontSize: 'calc(11.5px * var(--app-font-scale))'
    }
  }, "Community ", React.createElement(Icon.ArrowRight, {
    size: 11
  }))), React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(5, 1fr)',
      gap: 'calc(10px * var(--app-density-scale))',
      marginTop: 'calc(14px * var(--app-density-scale))'
    }
  }, recentBadges.slice(0, 5).map(b => {
    const C = Icon[b.icon] || Icon.Star;
    return React.createElement("div", {
      key: b.code,
      style: ds.badgeCard
    }, React.createElement(C, {
      size: 15,
      style: {
        color: 'var(--accent)'
      }
    }), React.createElement("div", {
      style: {
        fontSize: 'calc(12.5px * var(--app-font-scale))',
        color: 'var(--fg-0)',
        marginTop: 'calc(8px * var(--app-density-scale))',
        fontWeight: 500
      }
    }, b.name), React.createElement("div", {
      style: {
        fontSize: 'calc(11px * var(--app-font-scale))',
        color: 'var(--fg-3)',
        marginTop: 'calc(4px * var(--app-density-scale))'
      }
    }, b.description));
  })))));
};
const FocusRing = ({
  value = 0
}) => {
  const [v, setV] = React.useState(0);
  React.useEffect(() => {
    const id = setTimeout(() => setV(value), 100);
    return () => clearTimeout(id);
  }, [value]);
  const circ = 2 * Math.PI * 72;
  return React.createElement("div", {
    style: {
      position: 'relative',
      width: 200,
      height: 200,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, React.createElement("svg", {
    width: "200",
    height: "200",
    style: {
      transform: 'rotate(-90deg)'
    }
  }, React.createElement("circle", {
    cx: "100",
    cy: "100",
    r: "72",
    stroke: "var(--line)",
    strokeWidth: "8",
    fill: "none"
  }), React.createElement("circle", {
    cx: "100",
    cy: "100",
    r: "72",
    stroke: "var(--accent)",
    strokeWidth: "8",
    fill: "none",
    strokeDasharray: circ,
    strokeDashoffset: circ * (1 - v / 100),
    strokeLinecap: "round",
    style: {
      transition: 'stroke-dashoffset 1.5s var(--ease-out)'
    }
  }), React.createElement("circle", {
    cx: "100",
    cy: "100",
    r: "52",
    stroke: "var(--line-soft)",
    strokeWidth: "1",
    fill: "none"
  })), React.createElement("div", {
    style: {
      position: 'absolute',
      textAlign: 'center'
    }
  }, React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'calc(44px * var(--app-font-scale))',
      fontWeight: 300,
      color: 'var(--fg-0)',
      lineHeight: 1
    }
  }, v, React.createElement("span", {
    style: {
      fontSize: 'calc(18px * var(--app-font-scale))',
      color: 'var(--fg-2)'
    }
  }, "%")), React.createElement("div", {
    style: {
      fontSize: 'calc(10.5px * var(--app-font-scale))',
      color: 'var(--fg-3)',
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      marginTop: 'calc(4px * var(--app-density-scale))'
    }
  }, "Weekly focus")));
};
const ConceptMap = ({
  concepts: input
}) => {
  const positions = [{
    x: 20,
    y: 30,
    r: 24
  }, {
    x: 55,
    y: 25,
    r: 20
  }, {
    x: 85,
    y: 45,
    r: 18
  }, {
    x: 30,
    y: 65,
    r: 22
  }, {
    x: 62,
    y: 72,
    r: 16
  }, {
    x: 88,
    y: 80,
    r: 12
  }, {
    x: 12,
    y: 80,
    r: 14
  }, {
    x: 70,
    y: 50,
    r: 18
  }];
  const src = (input && input.length ? input : []).slice(0, positions.length);
  if (!src.length) {
    return React.createElement("div", {
      style: {
        height: 180,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--fg-3)',
        fontSize: 'calc(12px * var(--app-font-scale))'
      }
    }, "No concept data yet.");
  }
  const concepts = src.map((c, i) => ({
    ...positions[i],
    name: c.name,
    m: c.mastery_pct ?? c.m ?? 0
  }));
  const color = m => m > 70 ? 'var(--ok)' : m > 45 ? 'var(--accent)' : m > 25 ? 'var(--warn)' : 'var(--err)';
  return React.createElement("div", {
    style: {
      position: 'relative',
      height: 180,
      marginTop: 'calc(10px * var(--app-density-scale))'
    }
  }, React.createElement("svg", {
    width: "100%",
    height: "100%",
    style: {
      position: 'absolute',
      inset: 0
    }
  }, concepts.map((a, i) => concepts.slice(i + 1).map((b, j) => React.createElement("line", {
    key: `${i}-${j}`,
    x1: `${a.x}%`,
    y1: `${a.y}%`,
    x2: `${b.x}%`,
    y2: `${b.y}%`,
    stroke: "var(--line)",
    strokeWidth: "0.6",
    strokeDasharray: "2,2",
    opacity: "0.6"
  })))), concepts.map((c, i) => React.createElement("div", {
    key: i,
    style: {
      position: 'absolute',
      left: `${c.x}%`,
      top: `${c.y}%`,
      transform: 'translate(-50%, -50%)',
      width: c.r * 2,
      height: c.r * 2,
      borderRadius: '50%',
      background: `radial-gradient(circle, ${color(c.m)} 0%, transparent 75%)`,
      opacity: 0.35 + c.m / 200,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, React.createElement("div", {
    style: {
      width: 6,
      height: 6,
      borderRadius: 3,
      background: color(c.m)
    }
  }), React.createElement("span", {
    style: {
      position: 'absolute',
      top: '100%',
      marginTop: 'calc(4px * var(--app-density-scale))',
      fontSize: 'calc(9.5px * var(--app-font-scale))',
      color: 'var(--fg-2)',
      whiteSpace: 'nowrap'
    },
    className: "mono"
  }, c.name))));
};
const ds = {
  page: {
    padding: '28px',
    maxWidth: 1400,
    margin: '0 auto'
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(8px * var(--app-density-scale))',
    padding: '10px 12px',
    marginBottom: 'calc(14px * var(--app-density-scale))',
    borderRadius: 'var(--r-sm)',
    border: '1px solid var(--err)',
    color: 'var(--err)',
    background: 'color-mix(in oklab, var(--err) 10%, transparent)',
    fontSize: 'calc(12.5px * var(--app-font-scale))'
  },
  hero: {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: 'calc(40px * var(--app-density-scale))',
    alignItems: 'center',
    padding: '24px 0 32px'
  },
  metrics: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
    gap: 'calc(10px * var(--app-density-scale))',
    marginBottom: 'calc(14px * var(--app-density-scale))'
  },
  metricCard: {
    padding: '14px 16px'
  },
  metricValue: {
    fontFamily: 'var(--font-display)',
    fontSize: 'calc(28px * var(--app-font-scale))',
    fontWeight: 300,
    color: 'var(--fg-0)'
  },
  metricLabel: {
    fontSize: 'calc(10.5px * var(--app-font-scale))',
    color: 'var(--fg-3)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginTop: 'calc(4px * var(--app-density-scale))'
  },
  eyebrow: {
    fontSize: 'calc(11px * var(--app-font-scale))',
    color: 'var(--fg-3)',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    marginBottom: 'calc(14px * var(--app-density-scale))'
  },
  heroTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 'calc(44px * var(--app-font-scale))',
    fontWeight: 300,
    letterSpacing: '-0.02em',
    lineHeight: 1.1,
    margin: '0 0 14px',
    maxWidth: 680
  },
  heroSub: {
    fontSize: 'calc(14px * var(--app-font-scale))',
    color: 'var(--fg-2)',
    margin: 0,
    maxWidth: 560
  },
  link: {
    color: 'var(--accent)',
    cursor: 'pointer',
    borderBottom: '1px dotted var(--accent-soft)'
  },
  focusWrap: {
    padding: 'calc(10px * var(--app-density-scale))'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 'calc(14px * var(--app-density-scale))',
    marginBottom: 'calc(14px * var(--app-density-scale))'
  },
  cardHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  cardTitle: {
    fontSize: 'calc(13px * var(--app-font-scale))',
    color: 'var(--fg-1)',
    fontWeight: 500,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'calc(8px * var(--app-density-scale))'
  },
  resumeCard: {
    padding: 'calc(16px * var(--app-density-scale))',
    borderRadius: 'var(--r-md)',
    background: 'var(--bg-2)',
    border: '1px solid var(--line)',
    textAlign: 'left',
    display: 'flex',
    flexDirection: 'column',
    transition: 'all 180ms var(--ease-out)'
  },
  progress: {
    marginTop: 'calc(14px * var(--app-density-scale))',
    height: 3,
    background: 'var(--line)',
    borderRadius: 2,
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    background: 'var(--accent)',
    borderRadius: 2,
    transition: 'width 600ms var(--ease-out)'
  },
  reviewRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(10px * var(--app-density-scale))'
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0
  },
  upcoming: {
    display: 'flex',
    gap: 'calc(12px * var(--app-density-scale))',
    alignItems: 'center'
  },
  dateBox: {
    width: 48,
    height: 48,
    borderRadius: 'var(--r-sm)',
    border: '1px solid',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'calc(2px * var(--app-density-scale))',
    flexShrink: 0,
    background: 'var(--bg-1)'
  },
  insight: {
    padding: 'calc(14px * var(--app-density-scale))',
    borderRadius: 'var(--r-md)',
    background: 'var(--bg-2)',
    border: '1px solid var(--line)'
  },
  leaderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(8px * var(--app-density-scale))',
    padding: '8px 0',
    borderBottom: '1px solid var(--line-soft)',
    fontSize: 'calc(12px * var(--app-font-scale))'
  },
  badgeCard: {
    padding: 'calc(14px * var(--app-density-scale))',
    borderRadius: 'var(--r-md)',
    background: 'var(--bg-2)',
    border: '1px solid var(--line)'
  }
};
window.Dashboard = Dashboard;
})();


// ---- components/Materials.jsx ----
(function () {
  window.__NOESIS_BOOT.files.push("components/Materials.jsx");
const Materials = ({
  onNav
}) => {
  const Icon = window.Icon;
  const [view, setView] = React.useState('grid');
  const [items, setItems] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');
  const [uploadStatus, setUploadStatus] = React.useState('');
  const fileRef = React.useRef(null);
  const refresh = React.useCallback(() => {
    return window.NoesisAPI.materials.list().then(d => setItems(d.materials || [])).catch(e => setErr(e.message || 'load failed'));
  }, []);
  React.useEffect(() => {
    refresh();
  }, [refresh]);
  const colorFor = type => ({
    pdf: 'var(--accent)',
    slides: 'var(--info)',
    video: 'var(--ok)',
    note: 'var(--warn)'
  })[type] || 'var(--accent)';
  const materials = items.map(m => ({
    id: m.id,
    t: m.title,
    type: m.type || 'pdf',
    course: m.status === 'ready' ? 'Library' : m.status || '',
    chapters: m.chapters || 0,
    progress: m.progress || 0,
    updated: m.created_at ? new Date(m.created_at).toLocaleDateString() : '',
    color: colorFor(m.type)
  }));
  const onUpload = async file => {
    if (!file) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const allowed = ['pdf', 'docx', 'doc', 'txt', 'md', 'pptx'];
    if (!allowed.includes(ext)) {
      setErr('Unsupported file type. Upload PDF, DOCX, TXT, Markdown, or PPTX. Save legacy PPT files as PPTX first.');
      return;
    }
    setBusy(true);
    setErr('');
    setUploadStatus(`Uploading ${file.name}...`);
    try {
      const r = await window.NoesisAPI.materials.upload(file);
      setUploadStatus(ext === 'pptx' ? 'Upload accepted. Extracting slides...' : 'Upload accepted. Indexing material...');
      if (r && r.job_id) {
        await window.NoesisAPI.pollJob(r.job_id, {
          intervalMs: 1500,
          onProgress: j => {
            const verb = ext === 'pptx' ? 'Extracting slides' : 'Indexing material';
            setUploadStatus(`${verb} ${j.progress || 0}%...`);
            refresh();
          }
        });
      }
      await refresh();
      setUploadStatus('Material ready.');
    } catch (e) {
      setErr(e.message || 'Upload failed');
      setUploadStatus('');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const typeIcon = {
    pdf: 'File',
    slides: 'Layers',
    video: 'Play',
    note: 'PenNib',
    pset: 'Code'
  };
  return React.createElement("div", null, React.createElement(window.Topbar, {
    title: "Materials",
    crumbs: ['Library'],
    right: React.createElement(React.Fragment, null, React.createElement("input", {
      ref: fileRef,
      type: "file",
      accept: ".pdf,.docx,.doc,.txt,.md,.pptx",
      style: {
        display: 'none'
      },
      onChange: e => onUpload(e.target.files && e.target.files[0])
    }), React.createElement("button", {
      className: "btn btn-accent",
      disabled: busy,
      onClick: () => fileRef.current && fileRef.current.click()
    }, React.createElement(Icon.Upload, {
      size: 12
    }), " ", busy ? 'Uploading…' : 'Upload'))
  }), React.createElement("div", {
    style: ms.page
  }, React.createElement("div", {
    style: ms.header
  }, React.createElement("div", null, React.createElement("div", {
    style: ms.eyebrow
  }, "Library \xB7 ", materials.length, " materials"), React.createElement("h1", {
    style: ms.title
  }, "What are we learning?"), err && React.createElement("div", {
    style: {
      fontSize: 'calc(11px * var(--app-font-scale))',
      color: 'var(--err)',
      marginTop: 'calc(4px * var(--app-density-scale))'
    }
  }, err), uploadStatus && React.createElement("div", {
    style: {
      fontSize: 'calc(11px * var(--app-font-scale))',
      color: uploadStatus.includes('ready') ? 'var(--ok)' : 'var(--fg-3)',
      marginTop: 'calc(4px * var(--app-density-scale))'
    }
  }, uploadStatus)), React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'calc(4px * var(--app-density-scale))',
      padding: 'calc(2px * var(--app-density-scale))',
      background: 'var(--bg-2)',
      borderRadius: 'var(--r-md)',
      border: '1px solid var(--line)'
    }
  }, ['grid', 'list'].map(v => React.createElement("button", {
    key: v,
    onClick: () => setView(v),
    style: {
      padding: '6px 12px',
      fontSize: 'calc(11.5px * var(--app-font-scale))',
      borderRadius: 6,
      background: view === v ? 'var(--bg-0)' : 'transparent',
      color: view === v ? 'var(--fg-0)' : 'var(--fg-2)',
      textTransform: 'capitalize'
    }
  }, v)))), React.createElement("div", {
    style: ms.uploadZone
  }, React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'calc(14px * var(--app-density-scale))'
    }
  }, React.createElement("div", {
    style: {
      width: 40,
      height: 40,
      borderRadius: 'var(--r-md)',
      background: 'var(--accent-glow)',
      border: '1px dashed var(--accent-soft)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, React.createElement(Icon.Upload, {
    size: 16,
    style: {
      color: 'var(--accent)'
    }
  })), React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: 'calc(13.5px * var(--app-font-scale))',
      color: 'var(--fg-0)',
      fontWeight: 500
    }
  }, "Drop a PDF, DOCX, TXT, Markdown, or PPTX file"), React.createElement("div", {
    style: {
      fontSize: 'calc(12px * var(--app-font-scale))',
      color: 'var(--fg-2)',
      marginTop: 'calc(2px * var(--app-density-scale))'
    }
  }, "Noesis extracts documents and PowerPoint slides for notes, flashcards, quizzes, and tutoring. Save legacy PPT decks as PPTX first."))), React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => fileRef.current && fileRef.current.click(),
    disabled: busy
  }, busy ? 'Working…' : 'Choose file')), React.createElement("div", {
    style: view === 'grid' ? ms.grid : ms.list
  }, materials.map(m => {
    const Ti = Icon[typeIcon[m.type]];
    return React.createElement("button", {
      key: m.id,
      onClick: () => {
        sessionStorage.setItem('noesis.materialId', String(m.id));
        onNav('material');
      },
      className: "card card-hover",
      style: view === 'grid' ? ms.card : ms.rowCard
    }, view === 'grid' && React.createElement("div", {
      style: {
        height: 120,
        background: `linear-gradient(135deg, ${m.color}22, transparent 70%), var(--bg-2)`,
        borderRadius: 'var(--r-md)',
        marginBottom: 'calc(14px * var(--app-density-scale))',
        position: 'relative',
        overflow: 'hidden',
        border: '1px solid var(--line-soft)'
      }
    }, React.createElement(Ti, {
      size: 36,
      style: {
        position: 'absolute',
        top: 16,
        left: 16,
        color: m.color,
        opacity: 0.6
      }
    }), React.createElement("div", {
      style: {
        position: 'absolute',
        bottom: 10,
        right: 10,
        fontSize: 'calc(10px * var(--app-font-scale))',
        color: 'var(--fg-3)'
      },
      className: "mono"
    }, m.type.toUpperCase())), React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: view === 'grid' ? 'flex-start' : 'center',
        gap: 'calc(12px * var(--app-density-scale))',
        flex: 1
      }
    }, view === 'list' && React.createElement(Ti, {
      size: 18,
      style: {
        color: m.color
      }
    }), React.createElement("div", {
      style: {
        flex: 1,
        textAlign: 'left',
        minWidth: 0
      }
    }, React.createElement("div", {
      style: {
        fontFamily: 'var(--font-display)',
        fontSize: 'calc(16px * var(--app-font-scale))',
        color: 'var(--fg-0)',
        marginBottom: 'calc(4px * var(--app-density-scale))',
        fontWeight: 400,
        letterSpacing: '-0.005em'
      }
    }, m.t), React.createElement("div", {
      style: {
        fontSize: 'calc(11.5px * var(--app-font-scale))',
        color: 'var(--fg-3)',
        display: 'flex',
        gap: 'calc(10px * var(--app-density-scale))'
      }
    }, React.createElement("span", null, m.course), React.createElement("span", null, "\xB7"), React.createElement("span", null, m.chapters, " ch"), React.createElement("span", null, "\xB7"), React.createElement("span", null, m.updated))), view === 'list' && React.createElement("div", {
      style: {
        width: 80
      }
    }, React.createElement("div", {
      style: {
        height: 3,
        background: 'var(--line)',
        borderRadius: 2
      }
    }, React.createElement("div", {
      style: {
        height: '100%',
        width: m.progress + '%',
        background: m.color,
        borderRadius: 2
      }
    })), React.createElement("div", {
      className: "mono",
      style: {
        fontSize: 'calc(10px * var(--app-font-scale))',
        color: 'var(--fg-3)',
        marginTop: 'calc(3px * var(--app-density-scale))',
        textAlign: 'right'
      }
    }, m.progress, "%"))), view === 'grid' && React.createElement("div", {
      style: {
        marginTop: 'calc(10px * var(--app-density-scale))'
      }
    }, React.createElement("div", {
      style: {
        height: 3,
        background: 'var(--line)',
        borderRadius: 2
      }
    }, React.createElement("div", {
      style: {
        height: '100%',
        width: m.progress + '%',
        background: m.color,
        borderRadius: 2
      }
    })), React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: 'calc(6px * var(--app-density-scale))',
        fontSize: 'calc(10.5px * var(--app-font-scale))',
        color: 'var(--fg-3)'
      },
      className: "mono"
    }, React.createElement("span", null, m.progress, "% mastered"), React.createElement("span", null, Math.round(m.chapters * m.progress / 100), "/", m.chapters))));
  }))));
};
const ms = {
  page: {
    padding: 'calc(28px * var(--app-density-scale))',
    maxWidth: 1400,
    margin: '0 auto'
  },
  header: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 'calc(28px * var(--app-density-scale))'
  },
  eyebrow: {
    fontSize: 'calc(11px * var(--app-font-scale))',
    color: 'var(--fg-3)',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    marginBottom: 'calc(10px * var(--app-density-scale))'
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 'calc(40px * var(--app-font-scale))',
    fontWeight: 300,
    letterSpacing: '-0.02em',
    margin: 0
  },
  uploadZone: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderRadius: 'var(--r-lg)',
    border: '1px dashed var(--line-strong)',
    background: 'var(--bg-1)',
    marginBottom: 'calc(28px * var(--app-density-scale))'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 'calc(14px * var(--app-density-scale))'
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'calc(6px * var(--app-density-scale))'
  },
  card: {
    padding: 'calc(16px * var(--app-density-scale))',
    display: 'flex',
    flexDirection: 'column',
    textAlign: 'left'
  },
  rowCard: {
    padding: '14px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(12px * var(--app-density-scale))'
  }
};
const MaterialDetail = ({
  onNav
}) => {
  const Icon = window.Icon;
  const [active, setActive] = React.useState(0);
  const [material, setMaterial] = React.useState(null);
  const [chunks, setChunks] = React.useState([]);
  const [chapters, setChapters] = React.useState([]);
  const [chapterIds, setChapterIds] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [genStatus, setGenStatus] = React.useState('');
  const [activeAction, setActiveAction] = React.useState('');
  const [video, setVideo] = React.useState(null);
  const [learningMap, setLearningMap] = React.useState(null);
  const [sourceScope, setSourceScope] = React.useState('material');
  const id = parseInt(sessionStorage.getItem('noesis.materialId') || '0', 10);
  React.useEffect(() => {
    if (!id) {
      onNav && onNav('materials');
      return;
    }
    window.NoesisAPI.materials.get(id).then(m => {
      setMaterial(m);
      const titles = (m.chapters || []).map(c => c.title);
      setChapters(titles);
      setChapterIds((m.chapters || []).map(c => c.id));
    }).catch(() => {});
  }, [id]);
  React.useEffect(() => {
    return () => {
      if (video && video.file && video.file.startsWith('blob:')) URL.revokeObjectURL(video.file);
    };
  }, [video]);
  React.useEffect(() => {
    if (!id) return;
    const chId = chapterIds[active];
    window.NoesisAPI.materials.chunks(id, chId).then(d => setChunks(d.chunks || [])).catch(() => setChunks([]));
  }, [id, active, chapterIds]);
  React.useEffect(() => {
    if (!id) return;
    window.NoesisAPI.study.learningMap(id).then(d => setLearningMap(d.learning_map || null)).catch(() => setLearningMap(null));
  }, [id]);
  const currentScopePayload = React.useCallback(() => {
    const payload = {
      sourceScope
    };
    if (sourceScope === 'chapter' && chapterIds[active]) payload.chapter_id = chapterIds[active];
    if (sourceScope === 'chunk' && chunks[0] && chunks[0].id) payload.chunk_id = chunks[0].id;
    return payload;
  }, [sourceScope, chapterIds, active, chunks]);
  const sourceScopeLabel = sourceScope === 'chapter' ? 'Current chapter' : sourceScope === 'chunk' ? 'Current section' : 'Entire material';
  const generate = async (kind, options = {}) => {
    if (!id || busy) return false;
    const labels = {
      notes: 'notes',
      flashcards: 'flashcards',
      quiz: 'quiz'
    };
    setActiveAction(kind);
    setBusy(true);
    setGenStatus(`Generating ${labels[kind] || kind} from ${sourceScopeLabel.toLowerCase()}...`);
    try {
      const scopePayload = currentScopePayload();
      if (kind === 'notes') await window.NoesisAPI.notes.generate({
        material_id: id,
        ...scopePayload
      });
      let flashcardResult = null;
      if (kind === 'flashcards') flashcardResult = await window.NoesisAPI.flashcards.generate({
        material_id: id,
        count: 8,
        regenerate: !!options.regenerate,
        ...scopePayload
      });
      if (kind === 'quiz') {
        const r = await window.NoesisAPI.quizzes.generate({
          material_id: id,
          count: 6,
          difficulty: 'medium',
          ...scopePayload
        });
        sessionStorage.setItem('noesis.quizId', String(r.quiz_id));
      }
      if (kind === 'flashcards' && flashcardResult) {
        if (flashcardResult.reused) setGenStatus('Using existing flashcards for this material.');else if (flashcardResult.fallback) setGenStatus(flashcardResult.message || 'Created fallback flashcards from source material.');else setGenStatus(`${flashcardResult.created || 0} flashcards generated successfully.`);
      } else {
        setGenStatus(`${labels[kind] || kind} generated successfully.`);
      }
      return true;
    } catch (e) {
      setGenStatus('Failed: ' + (e.message || 'error'));
      return false;
    } finally {
      setBusy(false);
      setActiveAction('');
    }
  };
  const generateVideo = async () => {
    if (!id || !material) return;
    setActiveAction('video');
    setBusy(true);
    setGenStatus('Generating storyboard for review...');
    try {
      const concept = sourceScope === 'material' ? material && material.title : chapters[active] || null;
      const r = await window.NoesisAPI.videos.createStoryboard({
        material_id: id,
        concept,
        ...currentScopePayload()
      });
      const storyboardId = r.storyboard_id || r.storyboard && r.storyboard.id;
      if (!storyboardId) throw new Error('storyboard_not_created');
      sessionStorage.setItem('noesis.storyboardId', String(storyboardId));
      setGenStatus('Storyboard ready. Review scenes before rendering.');
      onNav && onNav('storyboard');
    } catch (e) {
      setGenStatus('Video failed: ' + (e.message || 'error'));
    } finally {
      setBusy(false);
      setActiveAction('');
    }
  };
  const articleText = chunks.length ? chunks.map(c => c.text).join('\n\n') : '';
  const deleteMaterial = async () => {
    if (!id || !window.confirm('Delete this material and its generated study data?')) return;
    setActiveAction('delete');
    setBusy(true);
    setGenStatus('Deleting material...');
    try {
      await window.NoesisAPI.materials.remove(id);
      sessionStorage.removeItem('noesis.materialId');
      onNav('materials');
    } catch (e) {
      setGenStatus('Delete failed: ' + (e.message || 'error'));
    } finally {
      setBusy(false);
      setActiveAction('');
    }
  };
  return React.createElement("div", null, React.createElement(window.Topbar, {
    title: chapters[active] || material && material.title || 'Material',
    crumbs: ['Library', material ? material.title : '...'],
    right: React.createElement(React.Fragment, null, React.createElement("button", {
      className: "btn btn-ghost",
      disabled: busy,
      onClick: deleteMaterial,
      style: {
        color: 'var(--err)'
      }
    }, activeAction === 'delete' ? 'Deleting...' : 'Delete'), React.createElement("button", {
      className: "btn btn-accent",
      onClick: () => {
        sessionStorage.setItem('noesis.tutorConcept', chapters[active] || material && material.title || '');
        sessionStorage.setItem('noesis.tutorMaterialId', String(id));
        onNav('tutor');
      }
    }, React.createElement(Icon.Sparkle, {
      size: 12
    }), " Study with tutor"))
  }), React.createElement("div", {
    style: mds.layout
  }, React.createElement("aside", {
    style: mds.chapters
  }, React.createElement("div", {
    style: {
      padding: '18px 18px 12px'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 'calc(10.5px * var(--app-font-scale))',
      color: 'var(--fg-3)',
      letterSpacing: '0.1em',
      textTransform: 'uppercase'
    }
  }, "Chapters")), React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'calc(1px * var(--app-density-scale))',
      padding: '0 8px'
    }
  }, chapters.map((c, i) => React.createElement("button", {
    key: i,
    onClick: () => setActive(i),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'calc(10px * var(--app-density-scale))',
      padding: '8px 10px',
      borderRadius: 'var(--r-sm)',
      background: active === i ? 'var(--bg-2)' : 'transparent',
      color: active === i ? 'var(--fg-0)' : 'var(--fg-2)',
      fontSize: 'calc(12.5px * var(--app-font-scale))',
      textAlign: 'left'
    }
  }, React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 'calc(9.5px * var(--app-font-scale))',
      color: 'var(--fg-3)',
      width: 20
    }
  }, String(i + 1).padStart(2, '0')), React.createElement("span", {
    style: {
      flex: 1
    }
  }, c))))), React.createElement("main", {
    style: mds.reader
  }, React.createElement("div", {
    style: mds.readerHead
  }, React.createElement("div", {
    style: {
      fontSize: 'calc(11px * var(--app-font-scale))',
      color: 'var(--fg-3)',
      letterSpacing: '0.1em',
      textTransform: 'uppercase'
    }
  }, "Chapter ", active + 1, " \xB7 ", chunks.length, " chunks"), React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'calc(42px * var(--app-font-scale))',
      fontWeight: 300,
      letterSpacing: '-0.02em',
      margin: '8px 0 6px'
    }
  }, chapters[active] || material && material.title || 'Material'), React.createElement("div", {
    style: {
      fontSize: 'calc(13px * var(--app-font-scale))',
      color: 'var(--fg-2)'
    }
  }, material && material.status === 'ready' ? 'Indexed for tutor and quizzes.' : material ? `Status: ${material.status}` : 'Loading…')), React.createElement("div", {
    style: mds.article
  }, articleText ? React.createElement("p", {
    style: {
      ...mds.p,
      whiteSpace: 'pre-wrap'
    }
  }, articleText) : React.createElement("p", {
    style: mds.p
  }, material && material.status !== 'ready' ? React.createElement("em", null, "Indexing\u2026 come back in a moment.") : React.createElement("em", null, "No chunks yet for this chapter.")))), React.createElement("aside", {
    style: mds.rail
  }, React.createElement("div", {
    style: mds.railBlock
  }, React.createElement("div", {
    style: mds.railHead
  }, "Start here"), window.LearningMap && learningMap ? React.createElement(window.LearningMap, {
    map: learningMap,
    compact: true
  }) : React.createElement("div", {
    style: {
      fontSize: 'calc(12px * var(--app-font-scale))',
      color: 'var(--fg-3)',
      padding: '4px 0'
    }
  }, "Generate notes or a quiz to sharpen the learning map.")), React.createElement("div", {
    style: mds.railBlock
  }, React.createElement("div", {
    style: mds.railHead
  }, "Key concepts"), material && material.concepts && material.concepts.length ? material.concepts.map(c => React.createElement("div", {
    key: c.id || c.name,
    style: mds.concept
  }, React.createElement("span", null, c.name), React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 'calc(10px * var(--app-font-scale))',
      color: 'var(--fg-3)'
    }
  }, c.mastery_pct || 0, "%"))) : React.createElement("div", {
    style: {
      fontSize: 'calc(12px * var(--app-font-scale))',
      color: 'var(--fg-3)',
      padding: '4px 0'
    }
  }, "Concepts will appear after AI generation.")), React.createElement("div", {
    style: mds.railBlock
  }, React.createElement("div", {
    style: mds.railHead
  }, "Generate (AI)"), React.createElement("div", {
    style: mds.scopeBox
  }, React.createElement("label", {
    style: mds.scopeLabel
  }, "Source"), React.createElement("select", {
    value: sourceScope,
    onChange: e => setSourceScope(e.target.value),
    style: mds.scopeSelect
  }, React.createElement("option", {
    value: "material"
  }, "Entire material"), React.createElement("option", {
    value: "chapter",
    disabled: !chapterIds[active]
  }, "Current chapter"), React.createElement("option", {
    value: "chunk",
    disabled: !chunks[0]
  }, "Current section"))), React.createElement("button", {
    style: mds.gen,
    disabled: busy,
    onClick: () => generate('notes')
  }, React.createElement(Icon.PenNib, {
    size: 13,
    style: {
      color: 'var(--accent)'
    }
  }), React.createElement("div", {
    style: {
      flex: 1,
      textAlign: 'left'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 'calc(12.5px * var(--app-font-scale))',
      color: 'var(--fg-0)'
    }
  }, activeAction === 'notes' ? 'Generating notes...' : 'Summary notes'), React.createElement("div", {
    style: {
      fontSize: 'calc(11px * var(--app-font-scale))',
      color: 'var(--fg-3)'
    }
  }, "From ", sourceScopeLabel.toLowerCase()))), React.createElement("button", {
    style: mds.gen,
    disabled: busy,
    onClick: async () => {
      const ok = await generate('flashcards', {
        regenerate: true
      });
      if (ok) onNav('flashcards');
    }
  }, React.createElement(Icon.Cards, {
    size: 13,
    style: {
      color: 'var(--accent)'
    }
  }), React.createElement("div", {
    style: {
      flex: 1,
      textAlign: 'left'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 'calc(12.5px * var(--app-font-scale))',
      color: 'var(--fg-0)'
    }
  }, activeAction === 'flashcards' ? 'Generating flashcards...' : 'Flashcards'), React.createElement("div", {
    style: {
      fontSize: 'calc(11px * var(--app-font-scale))',
      color: 'var(--fg-3)'
    }
  }, "Create 6-8 cards from ", sourceScopeLabel.toLowerCase()))), React.createElement("button", {
    style: mds.gen,
    disabled: busy,
    onClick: async () => {
      const ok = await generate('quiz');
      if (ok) onNav('quiz');
    }
  }, React.createElement(Icon.Target, {
    size: 13,
    style: {
      color: 'var(--accent)'
    }
  }), React.createElement("div", {
    style: {
      flex: 1,
      textAlign: 'left'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 'calc(12.5px * var(--app-font-scale))',
      color: 'var(--fg-0)'
    }
  }, activeAction === 'quiz' ? 'Generating quiz...' : 'Practice quiz'), React.createElement("div", {
    style: {
      fontSize: 'calc(11px * var(--app-font-scale))',
      color: 'var(--fg-3)'
    }
  }, "6 questions from ", sourceScopeLabel.toLowerCase()))), React.createElement("button", {
    style: mds.gen,
    disabled: busy,
    onClick: generateVideo
  }, React.createElement(Icon.Play, {
    size: 13,
    style: {
      color: 'var(--accent)'
    }
  }), React.createElement("div", {
    style: {
      flex: 1,
      textAlign: 'left'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 'calc(12.5px * var(--app-font-scale))',
      color: 'var(--fg-0)'
    }
  }, activeAction === 'video' ? 'Creating storyboard...' : 'Tutor video storyboard'), React.createElement("div", {
    style: {
      fontSize: 'calc(11px * var(--app-font-scale))',
      color: 'var(--fg-3)'
    }
  }, "Storyboard from ", sourceScopeLabel.toLowerCase()))), genStatus && React.createElement("div", {
    style: {
      fontSize: 'calc(11px * var(--app-font-scale))',
      color: 'var(--fg-3)',
      padding: '4px 4px 0'
    }
  }, genStatus), video && video.status === 'ready' && React.createElement("video", {
    src: video.file,
    controls: true,
    crossOrigin: "use-credentials",
    style: {
      width: '100%',
      marginTop: 'calc(8px * var(--app-density-scale))',
      borderRadius: 'var(--r-sm)'
    }
  })), React.createElement("div", {
    style: mds.railBlock
  }, React.createElement("div", {
    style: mds.railHead
  }, "Your highlights"), React.createElement("div", {
    style: {
      fontSize: 'calc(12px * var(--app-font-scale))',
      color: 'var(--fg-3)',
      padding: '4px 0'
    }
  }, "No highlights yet.")))));
};
const mds = {
  layout: {
    display: 'grid',
    gridTemplateColumns: '240px 1fr 300px',
    minHeight: 'calc(100vh - 57px)'
  },
  chapters: {
    borderRight: '1px solid var(--line)',
    background: 'var(--bg-0)'
  },
  reader: {
    padding: '40px 56px',
    maxWidth: 780,
    margin: '0 auto'
  },
  readerHead: {
    marginBottom: 'calc(36px * var(--app-density-scale))'
  },
  article: {
    fontSize: 'calc(14.5px * var(--app-font-scale))',
    lineHeight: 1.75,
    color: 'var(--fg-1)'
  },
  p: {
    margin: '0 0 18px'
  },
  h2: {
    fontFamily: 'var(--font-display)',
    fontSize: 'calc(26px * var(--app-font-scale))',
    fontWeight: 400,
    letterSpacing: '-0.01em',
    margin: '36px 0 14px',
    color: 'var(--fg-0)'
  },
  mark: {
    background: 'var(--accent-glow)',
    color: 'var(--accent)',
    padding: '1px 4px',
    borderRadius: 3
  },
  code: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    background: 'var(--bg-2)',
    padding: '1px 5px',
    borderRadius: 3,
    color: 'var(--fg-0)'
  },
  pre: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    background: 'var(--bg-1)',
    border: '1px solid var(--line)',
    padding: 'calc(18px * var(--app-density-scale))',
    borderRadius: 'var(--r-md)',
    overflow: 'auto',
    lineHeight: 1.6,
    color: 'var(--fg-0)',
    margin: '18px 0'
  },
  callout: {
    display: 'flex',
    gap: 'calc(12px * var(--app-density-scale))',
    padding: 'calc(16px * var(--app-density-scale))',
    borderRadius: 'var(--r-md)',
    background: 'var(--accent-glow)',
    border: '1px solid var(--accent-soft)',
    margin: '20px 0'
  },
  rail: {
    borderLeft: '1px solid var(--line)',
    padding: 'calc(20px * var(--app-density-scale))',
    display: 'flex',
    flexDirection: 'column',
    gap: 'calc(20px * var(--app-density-scale))',
    background: 'var(--bg-0)'
  },
  railBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'calc(4px * var(--app-density-scale))'
  },
  railHead: {
    fontSize: 'calc(10.5px * var(--app-font-scale))',
    color: 'var(--fg-3)',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    marginBottom: 'calc(8px * var(--app-density-scale))'
  },
  scopeBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(8px * var(--app-density-scale))',
    marginBottom: 'calc(6px * var(--app-density-scale))'
  },
  scopeLabel: {
    fontSize: 'calc(11px * var(--app-font-scale))',
    color: 'var(--fg-3)'
  },
  scopeSelect: {
    flex: 1,
    minWidth: 0,
    height: 30,
    borderRadius: 'var(--r-sm)',
    border: '1px solid var(--line)',
    background: 'var(--bg-1)',
    color: 'var(--fg-1)',
    fontSize: 'calc(12px * var(--app-font-scale))',
    padding: '0 8px'
  },
  concept: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 10px',
    borderRadius: 'var(--r-sm)',
    fontSize: 'calc(12px * var(--app-font-scale))',
    color: 'var(--fg-1)',
    textAlign: 'left',
    transition: 'background 140ms var(--ease-out)'
  },
  gen: {
    display: 'flex',
    gap: 'calc(10px * var(--app-density-scale))',
    alignItems: 'center',
    padding: '10px 12px',
    borderRadius: 'var(--r-sm)',
    border: '1px solid var(--line)',
    background: 'var(--bg-1)',
    transition: 'all 140ms var(--ease-out)'
  },
  highlight: {
    display: 'flex',
    gap: 'calc(8px * var(--app-density-scale))',
    padding: '6px 0'
  }
};
window.Materials = Materials;
window.MaterialDetail = MaterialDetail;
})();


// ---- components/Tutor.jsx ----
(function () {
  window.__NOESIS_BOOT.files.push("components/Tutor.jsx");
const NoesisTutorResponse = (() => {
  const structuredKeys = ['title', 'explanation', 'answer', 'content', 'summary', 'question', 'checkpoint', 'hint', 'example', 'code', 'visual', 'type', 'key_points', 'keyPoints', 'bullets', 'steps'];
  const decodeJsonish = value => {
    let text = String(value || '').trim();
    if (text.startsWith('"') && text.endsWith('"') || text.startsWith("'") && text.endsWith("'")) {
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed === 'string') text = parsed.trim();
      } catch (_) {
        text = text.slice(1, -1).trim();
      }
    }
    if (/\\[nrti"]/.test(text)) {
      text = text.replace(/\\n/g, '\n').replace(/\\r/g, '').replace(/\\t/g, '  ').replace(/\\"/g, '"');
    }
    return text;
  };
  const stripFences = value => {
    const text = decodeJsonish(value);
    const fullFence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fullFence ? fullFence[1].trim() : text.trim();
  };
  const parseMaybeJson = value => {
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
  const parseMalformed = value => {
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
  const asList = value => {
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
  const exampleText = example => {
    if (!example) return '';
    if (typeof example === 'string') return example;
    return ['scenario', 'setup', 'calculation', 'result', 'explanation', 'content', 'text'].map(key => example[key]).filter(Boolean).join('\n\n');
  };
  const normalize = value => {
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
        raw: parsed
      };
    }
    const text = decodeJsonish(value);
    if (/^```json/i.test(text) || /^[{\[]/.test(text) || /"(explanation|question|hint|example|code)"\s*:/.test(text)) {
      return {
        structured: true,
        type: 'answer',
        title: 'Tutor answer',
        explanation: text.replace(/[{}]/g, ' ').replace(/"([a-zA-Z_]+)"\s*:/g, '\n$1: ').replace(/",\s*"/g, '\n').replace(/^"+|"+$/g, '').trim(),
        keyPoints: [],
        question: '',
        hint: '',
        example: '',
        code: null,
        visual: null,
        raw: null
      };
    }
    return {
      structured: false,
      text
    };
  };
  const codeObject = code => {
    if (!code) return null;
    if (typeof code === 'string') return {
      language: '',
      content: code,
      walkthrough: []
    };
    return {
      language: code.language || '',
      content: code.content || code.text || '',
      walkthrough: Array.isArray(code.walkthrough) ? code.walkthrough : Array.isArray(code.explanation) ? code.explanation : []
    };
  };
  const toMarkdown = value => {
    const msg = normalize(value);
    if (!msg.structured) return msg.text;
    const code = codeObject(msg.code);
    const visual = msg.visual && typeof msg.visual === 'object' ? msg.visual.caption || msg.visual.description || msg.visual.type || '' : typeof msg.visual === 'string' ? msg.visual : '';
    return [msg.title || msg.type ? `### ${msg.title || String(msg.type).replace(/_/g, ' ')}` : '', msg.explanation ? `### Answer\n${msg.explanation}` : '', msg.keyPoints && msg.keyPoints.length ? `### Key points\n${msg.keyPoints.map(item => `- ${item}`).join('\n')}` : '', msg.example ? `### Example\n${msg.example}` : '', code && code.content ? `### Code\n\`\`\`${code.language || 'text'}\n${code.content}\n\`\`\`` : '', visual ? `### Visual\n${visual}` : '', msg.hint ? `### Hint\n${msg.hint}` : '', msg.question ? `### Check yourself\n${msg.question}` : ''].filter(Boolean).join('\n\n');
  };
  const speechText = value => {
    return toMarkdown(value).replace(/```[\s\S]*?```/g, ' code example omitted. ').replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[#>*_~|]/g, ' ').replace(/\[(Source|source|chunk)\s*:?\s*\d+\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 4000);
  };
  const copyText = value => toMarkdown(value).replace(/\[(chunk|source_chunk)\s*:?\s*\d+\]/gi, '').trim();
  const StructuredMessage = ({
    text
  }) => {
    const msg = normalize(text);
    if (!msg.structured) return React.createElement(TutorMarkdown, {
      text: msg.text
    });
    const code = codeObject(msg.code);
    const visual = msg.visual && msg.visual.type && msg.visual.type !== 'none' ? msg.visual : null;
    return React.createElement("div", {
      style: tu.structuredMessage
    }, (msg.title || msg.type) && React.createElement("div", {
      style: tu.structuredTitle
    }, msg.title || String(msg.type).replace(/_/g, ' ')), msg.explanation && React.createElement(TutorMarkdown, {
      text: msg.explanation
    }), msg.keyPoints && msg.keyPoints.length > 0 && React.createElement("div", {
      style: tu.walkthrough
    }, msg.keyPoints.slice(0, 6).map((item, i) => React.createElement("div", {
      key: i,
      style: tu.walkItem
    }, React.createElement("span", {
      className: "mono",
      style: {
        fontSize: 'calc(10px * var(--app-font-scale))',
        color: 'var(--accent)'
      }
    }, i + 1), React.createElement("span", null, item)))), msg.example && React.createElement("div", {
      style: tu.exampleBox
    }, React.createElement("b", null, "Example:"), " ", React.createElement(TutorMarkdown, {
      text: msg.example
    })), msg.hint && React.createElement("div", {
      style: tu.hintBox
    }, React.createElement("b", null, "Hint:"), " ", msg.hint), code && code.content && React.createElement("pre", {
      style: tu.codeBlock
    }, code.content), code && code.walkthrough && code.walkthrough.length > 0 && React.createElement("div", {
      style: tu.walkthrough
    }, code.walkthrough.map((w, i) => React.createElement("div", {
      key: i,
      style: tu.walkItem
    }, React.createElement("span", {
      className: "mono",
      style: {
        fontSize: 'calc(10px * var(--app-font-scale))',
        color: 'var(--fg-3)'
      }
    }, w.lineRange || w.line || i + 1), React.createElement("span", null, w.text || w)))), visual && window.TopicVisual && React.createElement(window.TopicVisual, {
      template: visual.type,
      data: visual,
      code: code,
      compact: true
    }), msg.question && React.createElement("div", {
      style: tu.questionBox
    }, React.createElement("div", {
      style: {
        fontSize: 'calc(10.5px * var(--app-font-scale))',
        color: 'var(--accent)',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        marginBottom: 'calc(7px * var(--app-density-scale))'
      }
    }, "Checkpoint"), React.createElement("div", {
      style: {
        fontSize: 'calc(13.5px * var(--app-font-scale))',
        color: 'var(--fg-0)',
        lineHeight: 1.55
      }
    }, msg.question)));
  };
  return {
    normalize,
    toMarkdown,
    copyText,
    speechText,
    StructuredMessage
  };
})();
window.NoesisTutorResponse = NoesisTutorResponse;
const Tutor = ({
  onNav
}) => {
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
  const [sourcePreview, setSourcePreview] = React.useState({
    materialId: null,
    title: '',
    sources: [],
    loading: false
  });
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
    try {
      return localStorage.getItem('noesis.tutorVoiceMode') || 'on';
    } catch (_) {
      return 'on';
    }
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
  const sessionSources = session && (session.sources || session.source_chunks || []) || [];
  const sources = sessionSources.length ? sessionSources : sourcePreview.sources || [];
  const trace = session && session.trace || {};
  const persistedFeedback = currentStep && (currentStep.feedback || currentStep.feedback_md) || '';
  const visibleTurns = guidedTurns.filter(t => (t.stepIndex == null ? step : t.stepIndex) === step);
  const professorState = paused ? 'paused' : failedTurn ? 'error' : voicePlaying ? 'speaking' : action === 'continue' || tutorState === 'continuing' || voiceBusy ? 'thinking' : composerFocused || answerText.trim() ? 'listening' : feedback || persistedFeedback || visibleTurns.length ? 'explaining' : 'listening';
  const isGenericLabel = value => {
    const s = String(value || '').trim().toLowerCase();
    return !s || s === 'document' || s === 'file' || s === 'material' || /^chapter\s*\d+$/.test(s) || /^\d+$/.test(s);
  };
  const materialLabel = m => {
    const label = m && (m.display_title || m.title) || '';
    return isGenericLabel(label) ? `Material #${m && m.id}` : label;
  };
  const setSessionReady = data => {
    const next = data && data.session ? data.session : data;
    setSession(next);
    setMode(next.mode || mode);
    const nextIndex = next.currentStepIndex || next.current_step || 0;
    setStep(nextIndex);
    setNotebook(next.notes || []);
    const nextStep = next.steps && next.steps[nextIndex];
    setFeedback(nextStep && (nextStep.feedback || nextStep.feedback_md) || '');
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
  const refreshSession = React.useCallback(id => {
    if (!id) return Promise.resolve(null);
    return window.NoesisAPI.tutor.get(id).then(async d => {
      const base = d && d.session ? d.session : d;
      let merged = d;
      const currentSources = base && (base.sources || base.source_chunks) || [];
      if (base && base.id && !currentSources.length) {
        try {
          const s = await window.NoesisAPI.tutor.sources(base.id);
          const withSources = {
            ...base,
            sources: s.sources || [],
            source_chunks: s.sources || []
          };
          merged = d && d.session ? {
            ...d,
            session: withSources
          } : withSources;
        } catch (_) {}
      }
      setSessionReady(merged);
      return merged;
    });
  }, []);
  React.useEffect(() => {
    if (!selectedMaterialId) {
      setSourcePreview({
        materialId: null,
        title: '',
        sources: [],
        loading: false
      });
      return undefined;
    }
    let alive = true;
    const materialId = parseInt(selectedMaterialId, 10);
    const selected = materials.find(m => String(m.id) === String(selectedMaterialId));
    setSourcePreview(prev => ({
      materialId,
      title: selected ? materialLabel(selected) : prev.title,
      sources: prev.materialId === materialId ? prev.sources : [],
      loading: true
    }));
    Promise.all([window.NoesisAPI.materials.get(materialId).catch(() => selected || null), window.NoesisAPI.materials.chunks(materialId).catch(() => ({
      chunks: []
    }))]).then(([material, chunkResult]) => {
      if (!alive) return;
      const chunks = (chunkResult && chunkResult.chunks || []).slice(0, 5);
      setSourcePreview({
        materialId,
        title: materialLabel(material || selected || {
          id: materialId
        }),
        loading: false,
        sources: chunks.map((chunk, index) => ({
          id: chunk.id || `preview-${materialId}-${index}`,
          chunkId: chunk.id || null,
          materialTitle: materialLabel(material || selected || {
            id: materialId
          }),
          heading: chunk.heading || chunk.section_title || chunk.slide_title || chunk.chapter_title || `Material excerpt ${index + 1}`,
          location: [chunk.source_page != null ? `Page ${chunk.source_page}` : '', chunk.slide_number != null ? `Slide ${chunk.slide_number}` : ''].filter(Boolean).join(' / '),
          excerpt: String(chunk.text || '').replace(/\s+/g, ' ').trim().slice(0, 520),
          text: String(chunk.text || '').replace(/\s+/g, ' ').trim().slice(0, 520)
        })).filter(item => item.excerpt || item.heading)
      });
    }).catch(() => {
      if (!alive) return;
      setSourcePreview(prev => ({
        ...prev,
        loading: false
      }));
    });
    return () => {
      alive = false;
    };
  }, [selectedMaterialId, materials]);
  const pollSession = async sessionId => {
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
  const startSession = async ({
    materialId = null,
    concept = '',
    nextMode = mode
  } = {}) => {
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
        if (cleanConcept) sessionStorage.setItem('noesis.tutorConcept', cleanConcept);else sessionStorage.removeItem('noesis.tutorConcept');
      } else {
        sessionStorage.removeItem('noesis.tutorMaterialId');
        sessionStorage.setItem('noesis.tutorConcept', cleanConcept || 'Object-Oriented Programming basics');
      }
      const res = await window.NoesisAPI.tutor.start({
        material_id: materialId,
        concept: cleanConcept || selected && materialLabel(selected) || 'Object-Oriented Programming basics',
        mode: nextMode
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
    window.NoesisAPI.materials.list().then(d => {
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
    }).catch(e => {
      if (!alive) return;
      setTutorState('error');
      setError(e.message || 'Could not load materials.');
    });
    return () => {
      alive = false;
    };
  }, []);
  React.useEffect(() => {
    if (paused) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [paused]);
  React.useEffect(() => {
    try {
      localStorage.setItem('noesis.tutorVoiceMode', voiceMode);
    } catch (_) {}
  }, [voiceMode]);
  React.useEffect(() => {
    return () => {
      if (voiceAudioRef.current) {
        try {
          voiceAudioRef.current.pause();
        } catch (_) {}
      }
      Object.values(voiceCacheRef.current || {}).forEach(url => {
        try {
          URL.revokeObjectURL(url);
        } catch (_) {}
      });
    };
  }, []);
  const startedAt = session && session.started_at ? new Date(session.started_at).getTime() : now;
  const timerNow = paused && pauseStartedAt ? pauseStartedAt : now;
  const elapsedS = Math.max(0, Math.floor((timerNow - startedAt - pausedMs) / 1000));
  const fmtTime = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
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
  const changeMode = async nextMode => {
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
      setSession({
        ...session,
        mode: res.mode || nextMode
      });
      setStatus(`Mode changed to ${res.mode || nextMode}.`);
    } catch (e) {
      setError(e.message || 'Mode change failed');
    } finally {
      setAction('');
    }
  };
  const tutorActionLabel = nextAction => ({
    im_confused: "I'm confused",
    give_example: 'Give an example',
    check_answer: 'Check my answer',
    continue: 'Continue'
  })[nextAction] || 'Check my answer';
  const tutorActionStatus = nextAction => ({
    im_confused: 'Simplifying the idea...',
    give_example: 'Preparing a concrete example...',
    check_answer: 'Checking your answer and preparing feedback...',
    continue: 'Moving to the next tutor step...'
  })[nextAction] || 'Checking your answer...';
  const friendlyTutorError = err => {
    const code = String(err && (err.code || err.message) || '').trim();
    if (err && err.status === 429 || /^rate_limited_/i.test(code)) {
      const wait = parseInt(err && err.retryAfter, 10);
      if (wait > 0) return `The tutor is catching up. Try again in ${wait} second${wait === 1 ? '' : 's'}.`;
      return 'The tutor is catching up. Please wait a few seconds and try again.';
    }
    if (/network/i.test(code)) return 'The tutor could not reach the server. Check that the backend is running, then try again.';
    return code || 'The tutor could not finish that action. Please try again.';
  };
  const clearTutorAudio = () => {
    if (voiceAudioRef.current) {
      try {
        voiceAudioRef.current.pause();
      } catch (_) {}
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
    const actionName = nextAction === 'confused' ? 'im_confused' : nextAction === 'example' ? 'give_example' : nextAction === 'check' ? 'check_answer' : nextAction === 'advance' ? 'continue' : nextAction;
    const submitted = choice == null ? answerText.trim() : '';
    const turnLabel = choice != null ? `Choice ${String.fromCharCode(65 + choice)}` : submitted || tutorActionLabel(actionName);
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
        intent: actionName
      });
      const tutorReply = res.response || res.feedback || '';
      setFeedback(tutorReply);
      const displayStepIndex = res.stay ? step : Number.isInteger(res.currentStepIndex) ? res.currentStepIndex : step;
      const turn = {
        id: res.turn && res.turn.id || `local-turn-${Date.now()}`,
        action: actionName,
        userLabel: res.turn && res.turn.userLabel || turnLabel,
        feedback: res.turn && (res.turn.response || res.turn.feedback) || tutorReply,
        followUpQuestion: res.turn && res.turn.followUpQuestion || res.followUpQuestion || '',
        avatarState: res.turn && res.turn.avatarState || (res.stay ? 'listening' : 'speaking'),
        correct: res.correct,
        error: false,
        stepIndex: displayStepIndex,
        createdAt: res.turn && res.turn.createdAt || new Date().toISOString()
      };
      setGuidedTurns(prev => [...prev, turn].slice(-20));
      setLastTurn({
        answer: turn.userLabel,
        feedback: turn.feedback,
        cue: res.professorCue || '',
        followUpQuestion: turn.followUpQuestion
      });
      setSession({
        ...session,
        steps: res.steps || session.steps,
        currentStepIndex: res.currentStepIndex,
        current_step: res.currentStepIndex,
        trace: res.trace || session.trace
      });
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
        createdAt: new Date().toISOString()
      };
      setGuidedTurns(prev => [...prev, failed].slice(-20));
      setFailedTurn({
        answer: turnLabel,
        message: friendly
      });
      setFeedback('');
    } finally {
      setAction('');
      setPendingTutorAction('');
    }
  };
  const refreshNotes = React.useCallback(() => {
    if (!session) return;
    window.NoesisAPI.tutor.get(session.sessionId || session.session_id).then(d => setNotebook(d.session && d.session.notes || d.notes || [])).catch(() => {});
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
        sourceRefs: currentStep && currentStep.sourceRefs || []
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
  const addManualNote = async e => {
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
  const topTitle = session ? session.topic || session.concept || 'AI Tutor' : 'AI Tutor';
  const professorCopy = {
    listening: {
      label: 'Listening',
      text: 'The professor is watching your reasoning and waiting for your next move.',
      icon: 'Brain'
    },
    thinking: {
      label: 'Thinking',
      text: 'The professor is checking your response and preparing feedback.',
      icon: 'Sparkle'
    },
    explaining: {
      label: 'Explaining',
      text: 'The professor is clarifying the current idea before moving on.',
      icon: 'Lightbulb'
    },
    speaking: {
      label: 'Speaking',
      text: 'The professor is explaining this turn. Read along or replay the voice.',
      icon: 'Lightbulb'
    },
    error: {
      label: 'Needs retry',
      text: 'That turn did not complete, but your session is still ready.',
      icon: 'X'
    },
    paused: {
      label: 'Paused',
      text: 'The session is paused. Resume when you are ready.',
      icon: 'Pause'
    }
  }[professorState] || {
    label: 'Listening',
    text: 'The professor is listening.',
    icon: 'Brain'
  };
  const ProfessorIcon = Icon[professorCopy.icon] || Icon.Brain;
  const VoiceIcon = Icon.Volume2 || Icon.Volume || Icon.Headphones || Icon.Speaker;
  return React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh'
    }
  }, React.createElement(window.Topbar, {
    title: topTitle,
    crumbs: ['AI Tutor', session ? session.sourceTitle || 'Session' : 'Start'],
    right: React.createElement(React.Fragment, null, React.createElement("div", {
      style: {
        display: 'flex',
        gap: 'calc(2px * var(--app-density-scale))',
        padding: 'calc(2px * var(--app-density-scale))',
        background: 'var(--bg-2)',
        borderRadius: 'var(--r-md)',
        border: '1px solid var(--line)'
      }
    }, [{
      id: 'socratic',
      label: 'Socratic',
      icon: 'Brain'
    }, {
      id: 'explain',
      label: 'Explain',
      icon: 'Lightbulb'
    }, {
      id: 'example',
      label: 'Example',
      icon: 'Code'
    }].map(m => {
      const C = Icon[m.icon];
      return React.createElement("button", {
        key: m.id,
        disabled: busy || paused || action === 'mode',
        onClick: () => changeMode(m.id),
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 'calc(6px * var(--app-density-scale))',
          padding: '5px 10px',
          fontSize: 'calc(11.5px * var(--app-font-scale))',
          background: mode === m.id ? 'var(--bg-0)' : 'transparent',
          color: mode === m.id ? 'var(--fg-0)' : 'var(--fg-2)',
          borderRadius: 6
        }
      }, React.createElement(C, {
        size: 12
      }), m.label);
    })), React.createElement("button", {
      className: "btn btn-ghost",
      onClick: () => {
        setVoiceMode(voiceMode === 'on' ? 'off' : 'on');
        if (voiceMode === 'on') clearTutorAudio();
      },
      disabled: busy && !session
    }, VoiceIcon && React.createElement(VoiceIcon, {
      size: 11
    }), " Voice ", voiceMode === 'on' ? 'on' : 'off'), React.createElement("button", {
      className: "btn btn-ghost",
      onClick: togglePause,
      disabled: !session || busy
    }, paused ? React.createElement(Icon.Play, {
      size: 11
    }) : React.createElement(Icon.Pause, {
      size: 11
    }), " ", paused ? 'Resume' : 'Pause'))
  }), !session && React.createElement("div", {
    style: tu.contextBar
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: 'calc(10.5px * var(--app-font-scale))',
      color: 'var(--fg-3)',
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      marginBottom: 'calc(4px * var(--app-density-scale))'
    }
  }, "Tutor source"), React.createElement("div", {
    style: {
      fontSize: 'calc(13px * var(--app-font-scale))',
      color: 'var(--fg-1)'
    }
  }, tutorState === 'material_loading' ? 'Loading your indexed materials...' : sourcePreview.title ? `${sourcePreview.title}${sourcePreview.sources.length ? ` / ${sourcePreview.sources.length} excerpts ready` : ''}` : 'Choose a material and Noesis will resolve the real topic.')), React.createElement("select", {
    className: "input",
    value: selectedMaterialId,
    disabled: busy || !materials.length,
    onChange: e => setSelectedMaterialId(e.target.value),
    style: {
      width: 300,
      fontSize: 'calc(12.5px * var(--app-font-scale))'
    }
  }, !materials.length && React.createElement("option", {
    value: ""
  }, "No ready materials"), materials.map(m => React.createElement("option", {
    key: m.id,
    value: m.id
  }, materialLabel(m)))), React.createElement("input", {
    className: "input",
    placeholder: "Focus topic (optional)",
    value: conceptInput,
    onChange: e => setConceptInput(e.target.value),
    style: {
      width: 240,
      fontSize: 'calc(12.5px * var(--app-font-scale))'
    }
  }), React.createElement("button", {
    className: "btn btn-accent",
    disabled: busy || !selectedMaterialId,
    onClick: () => startSession({
      materialId: parseInt(selectedMaterialId, 10),
      concept: conceptInput
    })
  }, React.createElement(Icon.Sparkle, {
    size: 12
  }), " ", busy ? 'Starting...' : 'Start with material'), React.createElement("button", {
    className: "btn btn-ghost",
    disabled: busy,
    onClick: () => startSession({
      materialId: null,
      concept: conceptInput || 'Object-Oriented Programming basics'
    })
  }, "Core corpus")), busy && !session && React.createElement("div", {
    style: tu.progressBar
  }, React.createElement("div", {
    style: {
      ...tu.progressFill,
      width: `${Math.max(8, progress)}%`
    }
  })), React.createElement("div", {
    style: tu.layout
  }, React.createElement("aside", {
    style: tu.timeline
  }, React.createElement("div", {
    style: {
      padding: '20px 20px 10px'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 'calc(10.5px * var(--app-font-scale))',
      color: 'var(--fg-3)',
      letterSpacing: '0.1em',
      textTransform: 'uppercase'
    }
  }, "Session plan"), React.createElement("div", {
    style: {
      fontSize: 'calc(13px * var(--app-font-scale))',
      color: 'var(--fg-1)',
      marginTop: 'calc(6px * var(--app-density-scale))'
    }
  }, session ? topTitle : 'No active session yet')), React.createElement("div", {
    style: {
      padding: '12px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 'calc(2px * var(--app-density-scale))',
      position: 'relative'
    }
  }, steps.length > 0 ? React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      position: 'absolute',
      left: 27,
      top: 18,
      bottom: 18,
      width: 1,
      background: 'var(--line)'
    }
  }), steps.map((s, i) => {
    const done = s.status === 'completed' || i < step;
    const active = i === step;
    return React.createElement("button", {
      key: s.id || i,
      onClick: () => {
        setStep(i);
        setFailedTurn(null);
      },
      disabled: busy,
      style: {
        display: 'flex',
        gap: 'calc(12px * var(--app-density-scale))',
        alignItems: 'flex-start',
        padding: '10px 10px',
        borderRadius: 'var(--r-sm)',
        background: active ? 'var(--bg-2)' : 'transparent',
        textAlign: 'left',
        position: 'relative'
      }
    }, React.createElement("div", {
      style: {
        width: 20,
        height: 20,
        borderRadius: 10,
        flexShrink: 0,
        border: `1.5px solid ${done ? 'var(--accent)' : active ? 'var(--accent)' : 'var(--line-strong)'}`,
        background: done ? 'var(--accent)' : active ? 'var(--bg-0)' : 'var(--bg-1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: done ? 'var(--bg-0)' : 'var(--accent)',
        zIndex: 1,
        marginTop: 'calc(2px * var(--app-density-scale))'
      }
    }, done ? React.createElement(Icon.Check, {
      size: 11
    }) : active ? React.createElement("div", {
      style: {
        width: 6,
        height: 6,
        borderRadius: 3,
        background: 'var(--accent)',
        animation: 'pulse-soft 1.8s infinite'
      }
    }) : React.createElement("span", {
      className: "mono",
      style: {
        fontSize: 'calc(10px * var(--app-font-scale))',
        color: 'var(--fg-3)'
      }
    }, i + 1)), React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0,
        paddingTop: 'calc(1px * var(--app-density-scale))'
      }
    }, React.createElement("div", {
      style: {
        fontSize: 'calc(10.5px * var(--app-font-scale))',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: active ? 'var(--accent)' : 'var(--fg-3)'
      }
    }, s.label || s.t), React.createElement("div", {
      style: {
        fontSize: 'calc(12.5px * var(--app-font-scale))',
        color: active ? 'var(--fg-0)' : done ? 'var(--fg-2)' : 'var(--fg-3)',
        marginTop: 'calc(3px * var(--app-density-scale))',
        lineHeight: 1.4
      }
    }, s.title || s.question)));
  })) : React.createElement("div", {
    style: {
      padding: 'calc(12px * var(--app-density-scale))',
      color: 'var(--fg-3)',
      fontSize: 'calc(12.5px * var(--app-font-scale))',
      lineHeight: 1.6
    }
  }, "Pick a material and start a tutor session. Noesis will build the plan after it retrieves context.")), session && session.learningMap && window.LearningMap && React.createElement("div", {
    style: {
      padding: 'calc(14px * var(--app-density-scale))',
      borderTop: '1px solid var(--line)'
    }
  }, React.createElement(window.LearningMap, {
    map: session.learningMap,
    compact: true
  })), React.createElement("div", {
    style: {
      marginTop: 'auto',
      padding: 'calc(14px * var(--app-density-scale))',
      borderTop: '1px solid var(--line)'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 'calc(11px * var(--app-font-scale))',
      color: 'var(--fg-3)',
      marginBottom: 'calc(6px * var(--app-density-scale))'
    }
  }, "Session time"), React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 'calc(6px * var(--app-density-scale))'
    }
  }, React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'calc(26px * var(--app-font-scale))',
      fontWeight: 300
    }
  }, fmtTime(elapsedS)), React.createElement("span", {
    style: {
      fontSize: 'calc(11px * var(--app-font-scale))',
      color: 'var(--fg-3)'
    }
  }, "/ 20:00")))), React.createElement("main", {
    style: tu.workspace
  }, React.createElement("div", {
    style: {
      maxWidth: 760,
      margin: '0 auto',
      padding: '32px 24px 40px'
    }
  }, !session && React.createElement("div", {
    style: tu.emptyState
  }, React.createElement("div", {
    style: tu.tutorAvatar
  }, React.createElement(Icon.Sparkle, {
    size: 15,
    style: {
      color: 'var(--accent)'
    }
  })), React.createElement("h1", {
    style: tu.emptyTitle
  }, busy ? 'Preparing your tutor session' : 'Start a grounded tutor session'), React.createElement("p", {
    style: tu.emptyText
  }, status || 'Choose a material above. The tutor will resolve the real topic, retrieve sources, and open with a useful warm-up.'), busy && React.createElement("div", {
    style: tu.skeletonStack
  }, [0, 1, 2].map(i => React.createElement("div", {
    key: i,
    style: {
      height: 10,
      borderRadius: 999,
      background: 'var(--bg-2)',
      border: '1px solid var(--line)',
      width: `${100 - i * 18}%`
    }
  }))), error && React.createElement("button", {
    className: "btn btn-accent",
    onClick: () => startSession({
      materialId: selectedMaterialId ? parseInt(selectedMaterialId, 10) : null,
      concept: conceptInput
    })
  }, React.createElement(Icon.Sparkle, {
    size: 12
  }), " Retry")), session && currentStep && React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      fontSize: 'calc(11px * var(--app-font-scale))',
      color: 'var(--accent)',
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      marginBottom: 'calc(10px * var(--app-density-scale))'
    }
  }, "Step ", String(step + 1).padStart(2, '0'), " \xB7 ", currentStep.label || currentStep.t), React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'calc(34px * var(--app-font-scale))',
      fontWeight: 300,
      margin: '0 0 18px',
      lineHeight: 1.2
    }
  }, currentStep.title || currentStep.question), React.createElement("div", {
    style: tu.lessonCard
  }, React.createElement("div", {
    style: tu.professorPanel
  }, window.TutorAvatar ? React.createElement(window.TutorAvatar, {
    state: professorState === 'explaining' ? 'speaking' : professorState,
    size: 50
  }) : React.createElement("div", {
    style: tu.professorAvatar
  }, React.createElement(ProfessorIcon, {
    size: 18,
    style: {
      color: 'var(--accent)'
    }
  }), React.createElement("span", {
    style: {
      ...tu.professorPulse,
      opacity: professorState === 'listening' ? 1 : 0.35
    }
  })), React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'calc(8px * var(--app-density-scale))',
      flexWrap: 'wrap'
    }
  }, React.createElement("b", {
    style: {
      color: 'var(--fg-0)',
      fontSize: 'calc(13.5px * var(--app-font-scale))'
    }
  }, "Professor Tutor"), React.createElement("span", {
    style: tu.statePill
  }, professorCopy.label)), React.createElement("div", {
    style: {
      marginTop: 'calc(4px * var(--app-density-scale))',
      color: 'var(--fg-2)',
      fontSize: 'calc(12.5px * var(--app-font-scale))',
      lineHeight: 1.5
    }
  }, professorCopy.text))), React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'calc(10px * var(--app-density-scale))',
      alignItems: 'flex-start'
    }
  }, React.createElement("div", {
    style: tu.tutorAvatar
  }, React.createElement(Icon.Sparkle, {
    size: 13,
    style: {
      color: 'var(--accent)'
    }
  })), React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement("div", {
    style: {
      fontSize: 'calc(14px * var(--app-font-scale))',
      color: 'var(--fg-0)',
      lineHeight: 1.75,
      whiteSpace: 'pre-wrap'
    }
  }, currentStep.content), currentStep.example && React.createElement("div", {
    style: tu.exampleBox
  }, React.createElement("b", null, "Example:"), " ", currentStep.example))), currentStep.visual && window.TopicVisual && React.createElement("div", {
    style: {
      marginTop: 'calc(18px * var(--app-density-scale))'
    }
  }, React.createElement(window.TopicVisual, {
    template: currentStep.visual.type,
    data: currentStep.visual,
    code: currentStep.code,
    compact: true
  })), currentStep.code && React.createElement("pre", {
    style: tu.codeBlock
  }, currentStep.code.content), currentStep.code && currentStep.code.walkthrough && React.createElement("div", {
    style: tu.walkthrough
  }, currentStep.code.walkthrough.map((w, i) => React.createElement("div", {
    key: i,
    style: tu.walkItem
  }, React.createElement("span", {
    className: "mono"
  }, "Line ", w.lineRange), w.text))), React.createElement("div", {
    style: tu.questionBox
  }, React.createElement("div", {
    style: {
      fontSize: 'calc(10.5px * var(--app-font-scale))',
      color: 'var(--accent)',
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      marginBottom: 'calc(7px * var(--app-density-scale))'
    }
  }, "Check your understanding"), React.createElement("div", {
    style: {
      fontSize: 'calc(14px * var(--app-font-scale))',
      color: 'var(--fg-0)',
      lineHeight: 1.55
    }
  }, currentStep.question), currentStep.hint && React.createElement("div", {
    style: {
      marginTop: 'calc(8px * var(--app-density-scale))',
      fontSize: 'calc(12.5px * var(--app-font-scale))',
      color: 'var(--fg-2)'
    }
  }, "Hint: ", currentStep.hint)), currentStep.options && React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'calc(8px * var(--app-density-scale))',
      marginTop: 'calc(16px * var(--app-density-scale))'
    }
  }, currentStep.options.map((label, i) => React.createElement("button", {
    key: i,
    disabled: busy || paused,
    onClick: () => continueTutor(i),
    style: tu.choice
  }, React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 'calc(10px * var(--app-font-scale))',
      color: 'var(--fg-3)',
      width: 14
    }
  }, String.fromCharCode(65 + i)), React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 'calc(13px * var(--app-font-scale))',
      color: 'var(--fg-0)'
    }
  }, label)))), !currentStep.options && React.createElement("textarea", {
    className: "input",
    value: answerText,
    onChange: e => setAnswerText(e.target.value),
    onFocus: () => setComposerFocused(true),
    onBlur: () => setComposerFocused(false),
    disabled: busy || paused,
    placeholder: "Write a short answer, or continue when you're ready...",
    style: {
      width: '100%',
      minHeight: 82,
      marginTop: 'calc(16px * var(--app-density-scale))',
      fontSize: 'calc(13px * var(--app-font-scale))',
      resize: 'vertical'
    }
  }), React.createElement("div", {
    style: tu.quickActions
  }, React.createElement("button", {
    className: "btn btn-ghost",
    disabled: !session || paused || busy,
    onClick: () => continueTutor(null, 'im_confused')
  }, React.createElement(Icon.Brain, {
    size: 12
  }), " ", pendingTutorAction === 'im_confused' ? 'Simplifying...' : "I'm confused"), React.createElement("button", {
    className: "btn btn-ghost",
    disabled: !session || paused || busy,
    onClick: () => continueTutor(null, 'give_example')
  }, React.createElement(Icon.Lightbulb, {
    size: 12
  }), " ", pendingTutorAction === 'give_example' ? 'Building example...' : 'Give an example'), React.createElement("button", {
    className: "btn btn-ghost",
    disabled: !session || paused || busy || !answerText.trim() && !currentStep.options,
    onClick: () => continueTutor(null, 'check_answer')
  }, React.createElement(Icon.Check, {
    size: 12
  }), " ", pendingTutorAction === 'check_answer' ? 'Checking...' : 'Check my answer')), (visibleTurns.length > 0 || feedback || persistedFeedback) && React.createElement("div", {
    style: tu.conversation
  }, visibleTurns.length > 0 ? visibleTurns.map(turn => React.createElement(React.Fragment, {
    key: turn.id
  }, React.createElement("div", {
    style: {
      ...tu.bubble,
      ...tu.studentBubble
    }
  }, React.createElement("b", null, "You"), React.createElement("div", null, turn.userLabel)), React.createElement("div", {
    style: {
      ...tu.bubble,
      ...tu.tutorBubble,
      ...(turn.error ? {
        borderColor: 'var(--warn)'
      } : {})
    }
  }, React.createElement("div", {
    style: tu.turnHeader
  }, window.TutorAvatar && React.createElement(window.TutorAvatar, {
    state: turn.error ? 'error' : turn.avatarState || 'speaking',
    size: 30
  }), React.createElement("b", null, "Professor Tutor"), React.createElement("span", {
    style: tu.turnAction
  }, tutorActionLabel(turn.action))), turn.error ? React.createElement("div", {
    style: tu.failedTurn
  }, turn.feedback) : React.createElement(TutorMessage, {
    text: turn.feedback
  }), turn.followUpQuestion && React.createElement("div", {
    style: tu.followUp
  }, turn.followUpQuestion), !turn.error && turn.id === (visibleTurns[visibleTurns.length - 1] && visibleTurns[visibleTurns.length - 1].id) && (voiceMode === 'on' || voiceBusy || voiceAudioUrl || voiceError) && React.createElement("div", {
    style: tu.voiceRow
  }, React.createElement("button", {
    className: "btn btn-ghost",
    style: {
      padding: '5px 9px',
      fontSize: 'calc(11px * var(--app-font-scale))'
    },
    disabled: !voiceAudioUrl || voiceBusy,
    onClick: toggleTutorAudio
  }, voicePlaying ? React.createElement(Icon.Pause, {
    size: 11
  }) : React.createElement(Icon.Play, {
    size: 11
  }), " ", voicePlaying ? 'Pause' : 'Play'), voiceBusy && React.createElement("span", null, "Generating voice..."), voiceError && React.createElement("span", {
    style: {
      color: 'var(--warn)'
    }
  }, voiceError), !voiceBusy && voiceAudioUrl && React.createElement("span", null, "Voice ready"))))) : React.createElement("div", {
    style: {
      ...tu.bubble,
      ...tu.tutorBubble
    }
  }, React.createElement("b", null, "Professor Tutor"), React.createElement(TutorMessage, {
    text: feedback || persistedFeedback
  }))), React.createElement("div", {
    style: {
      marginTop: 'calc(20px * var(--app-density-scale))',
      display: 'flex',
      gap: 'calc(10px * var(--app-density-scale))',
      flexWrap: 'wrap'
    }
  }, React.createElement("button", {
    className: "btn btn-accent",
    disabled: !session || paused || busy,
    onClick: () => isLastStep ? finishTutor() : continueTutor(null, answerText.trim() ? 'check_answer' : 'continue')
  }, action === 'continue' ? React.createElement(React.Fragment, null, "Preparing... ", React.createElement(Icon.Sparkle, {
    size: 12
  })) : !isLastStep ? React.createElement(React.Fragment, null, "Continue ", React.createElement(Icon.ArrowRight, {
    size: 12
  })) : React.createElement(React.Fragment, null, "Finish ", React.createElement(Icon.Check, {
    size: 12
  }))), React.createElement("button", {
    className: "btn btn-bare",
    disabled: !session || paused || busy,
    onClick: () => saveNote(`${currentStep.title}\n\n${currentStep.content}${currentStep.example ? `\n\nExample: ${currentStep.example}` : ''}`, 'explanation')
  }, React.createElement(Icon.Bookmark, {
    size: 12
  }), " Save explanation"), React.createElement("button", {
    className: "btn btn-ghost",
    disabled: busy,
    onClick: () => {
      setSession(null);
      setFeedback('');
      setLastTurn(null);
      setFailedTurn(null);
      setGuidedTurns([]);
      setPendingTutorAction('');
      setTutorState('ready_to_start');
      setStatus('Choose a material, then start your tutor session.');
    }
  }, "New session")), status && React.createElement("div", {
    style: {
      marginTop: 'calc(12px * var(--app-density-scale))',
      color: 'var(--fg-3)',
      fontSize: 'calc(12px * var(--app-font-scale))'
    }
  }, status), error && React.createElement("div", {
    style: {
      marginTop: 'calc(12px * var(--app-density-scale))',
      color: 'var(--err)',
      fontSize: 'calc(12px * var(--app-font-scale))'
    }
  }, error))))), React.createElement("aside", {
    style: tu.rail
  }, React.createElement("div", {
    style: {
      padding: '16px 18px',
      borderBottom: '1px solid var(--line)'
    }
  }, React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'calc(2px * var(--app-density-scale))',
      padding: 'calc(2px * var(--app-density-scale))',
      background: 'var(--bg-2)',
      borderRadius: 'var(--r-sm)',
      border: '1px solid var(--line)'
    }
  }, ['Trace', 'Notes', 'Sources'].map(t => React.createElement("button", {
    key: t,
    onClick: () => setActiveRailTab(t),
    style: {
      flex: 1,
      padding: '5px 8px',
      fontSize: 'calc(11.5px * var(--app-font-scale))',
      background: activeRailTab === t ? 'var(--bg-0)' : 'transparent',
      color: activeRailTab === t ? 'var(--fg-0)' : 'var(--fg-2)',
      borderRadius: 4
    }
  }, t)))), React.createElement("div", {
    style: {
      padding: 'calc(18px * var(--app-density-scale))',
      overflow: 'auto',
      flex: 1
    }
  }, activeRailTab === 'Trace' && React.createElement(React.Fragment, null, React.createElement(RailTitle, {
    title: "Tutor trace"
  }), React.createElement(TraceRow, {
    label: "State",
    value: tutorState
  }), React.createElement(TraceRow, {
    label: "Provider",
    value: trace.provider || '—'
  }), React.createElement(TraceRow, {
    label: "Model",
    value: trace.model || '—'
  }), React.createElement(TraceRow, {
    label: "Topic",
    value: trace.topic || session && session.topic || '—'
  }), React.createElement(TraceRow, {
    label: "Grounding",
    value: trace.groundingTier || '—'
  }), React.createElement(TraceRow, {
    label: "Chunks",
    value: trace.chunksRetrieved == null ? '—' : trace.chunksRetrieved
  }), React.createElement(TraceRow, {
    label: "Retrieval",
    value: trace.retrievalMs == null ? '—' : `${trace.retrievalMs} ms`
  }), React.createElement(TraceRow, {
    label: "Generation",
    value: trace.generationMs == null ? '—' : `${trace.generationMs} ms`
  }), React.createElement(TraceRow, {
    label: "Cache",
    value: trace.cacheHit ? 'hit' : 'miss'
  }), (trace.warnings || []).map((w, i) => React.createElement("div", {
    key: i,
    style: tu.traceWarn
  }, w))), activeRailTab === 'Sources' && React.createElement(React.Fragment, null, React.createElement(RailTitle, {
    title: "Grounding sources"
  }), sources.length === 0 && React.createElement("div", {
    style: tu.emptyRail
  }, sourcePreview.loading ? 'Loading source excerpts...' : 'Sources will appear after the tutor retrieves material context.'), sources.map((c, i) => React.createElement("div", {
    key: `${c.id || c.chunkId}-${i}`,
    style: tu.sourceEntry
  }, React.createElement("div", {
    style: {
      fontSize: 'calc(11px * var(--app-font-scale))',
      color: 'var(--accent)',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      marginBottom: 'calc(6px * var(--app-density-scale))'
    }
  }, "Source ", i + 1, " \xB7 ", c.location || c.heading || 'Material excerpt'), React.createElement("div", {
    style: {
      fontSize: 'calc(12.5px * var(--app-font-scale))',
      color: 'var(--fg-0)',
      marginBottom: 'calc(6px * var(--app-density-scale))'
    }
  }, c.heading || c.materialTitle), React.createElement("div", {
    style: {
      fontSize: 'calc(12.2px * var(--app-font-scale))',
      color: 'var(--fg-2)',
      lineHeight: 1.55
    }
  }, c.excerpt || c.text)))), activeRailTab === 'Notes' && React.createElement(React.Fragment, null, React.createElement(RailTitle, {
    title: "Your notebook"
  }), notebook.length === 0 && React.createElement("div", {
    style: tu.emptyRail
  }, "No notes yet. Save a tutor explanation or write your own note."), notebook.map(n => React.createElement("div", {
    key: n.id,
    style: {
      ...tu.noteEntry,
      ...(n.flashcard_worthy ? {
        borderLeft: '2px solid var(--accent)',
        paddingLeft: 10
      } : {})
    }
  }, React.createElement("div", {
    className: "mono",
    style: {
      fontSize: 'calc(10px * var(--app-font-scale))',
      color: n.flashcard_worthy ? 'var(--accent)' : 'var(--fg-3)',
      marginBottom: 'calc(4px * var(--app-density-scale))'
    }
  }, new Date(n.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })), React.createElement("div", {
    style: {
      fontSize: 'calc(12.5px * var(--app-font-scale))',
      color: 'var(--fg-1)',
      lineHeight: 1.55,
      whiteSpace: 'pre-wrap'
    }
  }, n.body))))), React.createElement("div", {
    style: {
      padding: 'calc(14px * var(--app-density-scale))',
      borderTop: '1px solid var(--line)',
      display: 'flex',
      gap: 'calc(8px * var(--app-density-scale))'
    }
  }, React.createElement("input", {
    className: "input",
    placeholder: "Add a note (Enter to save)...",
    value: noteText,
    onChange: e => setNoteText(e.target.value),
    onKeyDown: addManualNote,
    disabled: paused || !session || busy,
    style: {
      flex: 1,
      fontSize: 'calc(12.5px * var(--app-font-scale))'
    }
  }), React.createElement("button", {
    className: "btn btn-bare",
    style: {
      padding: 'calc(8px * var(--app-density-scale))'
    },
    disabled: paused || !session || busy,
    onClick: () => addManualNote()
  }, React.createElement(Icon.Send, {
    size: 14
  }))))));
};
const TutorMarkdown = ({
  text
}) => {
  const raw = String(text || '');
  if (!raw) return null;
  if (window.marked && window.DOMPurify) {
    return React.createElement("div", {
      className: "md-rendered",
      style: tu.tutorMarkdown,
      dangerouslySetInnerHTML: {
        __html: window.DOMPurify.sanitize(window.marked.parse(raw))
      }
    });
  }
  return React.createElement("div", {
    style: {
      whiteSpace: 'pre-wrap'
    }
  }, raw);
};
const TutorMessage = ({
  text
}) => {
  const Structured = window.NoesisTutorResponse && window.NoesisTutorResponse.StructuredMessage;
  return Structured ? React.createElement(Structured, {
    text: text
  }) : React.createElement(TutorMarkdown, {
    text: text
  });
};
const RailTitle = ({
  title
}) => React.createElement("div", {
  style: {
    fontSize: 'calc(10.5px * var(--app-font-scale))',
    color: 'var(--fg-3)',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    marginBottom: 'calc(10px * var(--app-density-scale))'
  }
}, title);
const TraceRow = ({
  label,
  value
}) => React.createElement("div", {
  style: tu.traceRow
}, React.createElement("span", null, label), React.createElement("b", null, String(value)));
const tu = {
  layout: {
    display: 'grid',
    gridTemplateColumns: '280px 1fr 340px',
    flex: 1,
    minHeight: 'calc(100vh - 57px)'
  },
  contextBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(10px * var(--app-density-scale))',
    flexWrap: 'wrap',
    padding: '12px 18px',
    borderBottom: '1px solid var(--line)',
    background: 'var(--bg-1)'
  },
  progressBar: {
    height: 3,
    background: 'var(--bg-2)',
    borderBottom: '1px solid var(--line)'
  },
  progressFill: {
    height: '100%',
    background: 'var(--accent)',
    transition: 'width 260ms var(--ease-out)'
  },
  timeline: {
    borderRight: '1px solid var(--line)',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-0)'
  },
  workspace: {
    overflow: 'auto',
    background: 'var(--bg-0)'
  },
  rail: {
    borderLeft: '1px solid var(--line)',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-0)'
  },
  tutorAvatar: {
    width: 28,
    height: 28,
    borderRadius: 8,
    background: 'var(--accent-glow)',
    border: '1px solid var(--accent-soft)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  emptyState: {
    minHeight: 480,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    gap: 'calc(14px * var(--app-density-scale))',
    color: 'var(--fg-1)'
  },
  emptyTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 'calc(34px * var(--app-font-scale))',
    fontWeight: 300,
    margin: 0
  },
  emptyText: {
    maxWidth: 480,
    fontSize: 'calc(14px * var(--app-font-scale))',
    lineHeight: 1.7,
    color: 'var(--fg-2)',
    margin: 0
  },
  skeletonStack: {
    display: 'grid',
    gap: 'calc(8px * var(--app-density-scale))',
    width: 360
  },
  lessonCard: {
    marginTop: 'calc(22px * var(--app-density-scale))',
    padding: 'calc(18px * var(--app-density-scale))',
    border: '1px solid var(--line)',
    borderRadius: 'var(--r-md)',
    background: 'var(--bg-1)'
  },
  professorPanel: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(12px * var(--app-density-scale))',
    padding: 'calc(12px * var(--app-density-scale))',
    marginBottom: 'calc(16px * var(--app-density-scale))',
    borderRadius: 8,
    border: '1px solid var(--accent-soft)',
    background: 'var(--accent-glow)'
  },
  professorAvatar: {
    width: 42,
    height: 42,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    flexShrink: 0,
    background: 'var(--bg-0)',
    border: '1px solid var(--accent-soft)'
  },
  professorPulse: {
    position: 'absolute',
    right: 5,
    bottom: 5,
    width: 8,
    height: 8,
    borderRadius: 999,
    background: 'var(--accent)',
    boxShadow: '0 0 0 4px var(--accent-glow)'
  },
  statePill: {
    padding: '3px 7px',
    borderRadius: 999,
    fontSize: 'calc(10.5px * var(--app-font-scale))',
    color: 'var(--accent)',
    background: 'var(--bg-0)',
    border: '1px solid var(--accent-soft)'
  },
  exampleBox: {
    marginTop: 'calc(12px * var(--app-density-scale))',
    padding: 'calc(12px * var(--app-density-scale))',
    borderRadius: 8,
    background: 'var(--bg-2)',
    border: '1px solid var(--line)',
    color: 'var(--fg-1)',
    fontSize: 'calc(13px * var(--app-font-scale))'
  },
  codeBlock: {
    marginTop: 'calc(16px * var(--app-density-scale))',
    padding: 'calc(16px * var(--app-density-scale))',
    borderRadius: 8,
    background: '#0f172a',
    color: '#dbeafe',
    overflow: 'auto',
    fontFamily: 'var(--font-mono)',
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    lineHeight: 1.6
  },
  walkthrough: {
    display: 'grid',
    gap: 'calc(8px * var(--app-density-scale))',
    marginTop: 'calc(10px * var(--app-density-scale))'
  },
  walkItem: {
    display: 'flex',
    gap: 'calc(10px * var(--app-density-scale))',
    alignItems: 'flex-start',
    color: 'var(--fg-2)',
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    lineHeight: 1.5
  },
  questionBox: {
    marginTop: 'calc(16px * var(--app-density-scale))',
    padding: 'calc(14px * var(--app-density-scale))',
    borderRadius: 8,
    border: '1px solid var(--accent-soft)',
    background: 'var(--accent-glow)'
  },
  choice: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(12px * var(--app-density-scale))',
    padding: '12px 14px',
    borderRadius: 'var(--r-md)',
    border: '1px solid var(--line)',
    background: 'var(--bg-1)',
    textAlign: 'left'
  },
  quickActions: {
    display: 'flex',
    gap: 'calc(8px * var(--app-density-scale))',
    flexWrap: 'wrap',
    marginTop: 'calc(12px * var(--app-density-scale))'
  },
  conversation: {
    display: 'grid',
    gap: 'calc(10px * var(--app-density-scale))',
    marginTop: 'calc(16px * var(--app-density-scale))'
  },
  bubble: {
    padding: 'calc(12px * var(--app-density-scale))',
    borderRadius: 8,
    lineHeight: 1.6,
    fontSize: 'calc(13px * var(--app-font-scale))',
    border: '1px solid var(--line)'
  },
  studentBubble: {
    justifySelf: 'end',
    maxWidth: '82%',
    background: 'var(--bg-2)',
    color: 'var(--fg-1)'
  },
  tutorBubble: {
    justifySelf: 'start',
    maxWidth: '92%',
    background: 'var(--bg-0)',
    color: 'var(--fg-1)',
    borderColor: 'var(--accent-soft)'
  },
  turnHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(8px * var(--app-density-scale))',
    marginBottom: 'calc(8px * var(--app-density-scale))'
  },
  turnAction: {
    fontSize: 'calc(10.5px * var(--app-font-scale))',
    color: 'var(--accent)',
    border: '1px solid var(--accent-soft)',
    background: 'var(--accent-glow)',
    borderRadius: 999,
    padding: '2px 7px'
  },
  tutorMarkdown: {
    fontSize: 'calc(13px * var(--app-font-scale))',
    lineHeight: 1.65,
    color: 'var(--fg-1)'
  },
  structuredMessage: {
    display: 'grid',
    gap: 'calc(10px * var(--app-density-scale))'
  },
  structuredTitle: {
    fontSize: 'calc(14px * var(--app-font-scale))',
    fontWeight: 700,
    color: 'var(--fg-0)',
    marginBottom: 'calc(2px * var(--app-density-scale))'
  },
  hintBox: {
    padding: 'calc(11px * var(--app-density-scale))',
    borderRadius: 8,
    background: 'var(--accent-glow)',
    border: '1px solid var(--accent-soft)',
    color: 'var(--fg-1)',
    fontSize: 'calc(12.8px * var(--app-font-scale))',
    lineHeight: 1.55
  },
  followUp: {
    marginTop: 'calc(8px * var(--app-density-scale))',
    color: 'var(--fg-2)',
    fontSize: 'calc(12.5px * var(--app-font-scale))'
  },
  failedTurn: {
    marginTop: 'calc(8px * var(--app-density-scale))',
    color: 'var(--warn)',
    lineHeight: 1.55
  },
  voiceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(8px * var(--app-density-scale))',
    flexWrap: 'wrap',
    marginTop: 'calc(10px * var(--app-density-scale))',
    color: 'var(--fg-3)',
    fontSize: 'calc(11.5px * var(--app-font-scale))'
  },
  feedback: {
    marginTop: 'calc(16px * var(--app-density-scale))',
    padding: 'calc(14px * var(--app-density-scale))',
    borderRadius: 8,
    background: 'var(--bg-2)',
    border: '1px solid var(--line)',
    color: 'var(--fg-1)',
    lineHeight: 1.6
  },
  noteEntry: {
    marginBottom: 'calc(16px * var(--app-density-scale))'
  },
  sourceEntry: {
    marginBottom: 'calc(14px * var(--app-density-scale))',
    padding: 'calc(12px * var(--app-density-scale))',
    borderRadius: 'var(--r-sm)',
    background: 'var(--bg-1)',
    border: '1px solid var(--line)',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word'
  },
  emptyRail: {
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    color: 'var(--fg-3)',
    lineHeight: 1.6
  },
  traceRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 'calc(10px * var(--app-density-scale))',
    padding: '9px 0',
    borderBottom: '1px solid var(--line)',
    fontSize: 'calc(12px * var(--app-font-scale))',
    color: 'var(--fg-2)'
  },
  traceWarn: {
    marginTop: 'calc(10px * var(--app-density-scale))',
    padding: 'calc(10px * var(--app-density-scale))',
    borderRadius: 8,
    background: 'color-mix(in oklab, var(--warn) 12%, transparent)',
    color: 'var(--fg-1)',
    fontSize: 'calc(12px * var(--app-font-scale))',
    lineHeight: 1.5
  }
};
window.Tutor = Tutor;
})();


// ---- components/TutorAvatar.jsx ----
(function () {
  window.__NOESIS_BOOT.files.push("components/TutorAvatar.jsx");
const TutorAvatar = ({
  state = 'idle',
  size = 100
}) => {
  React.useEffect(() => {
    if (document.getElementById('noesis-tutor-avatar-css')) return;
    const style = document.createElement('style');
    style.id = 'noesis-tutor-avatar-css';
    style.textContent = TUTOR_AVATAR_CSS;
    document.head.appendChild(style);
  }, []);
  const safeState = ['idle', 'listening', 'thinking', 'speaking', 'error'].includes(state) ? state : 'idle';
  const px = Number(size) || 100;
  return React.createElement("div", {
    className: `tutor-avatar tutor-avatar-${safeState}`,
    style: {
      width: px,
      height: px
    },
    "aria-label": `Tutor avatar ${safeState}`,
    title: `Tutor is ${safeState}`
  }, React.createElement("span", {
    className: "tutor-avatar-ring tutor-avatar-ring-a"
  }), React.createElement("span", {
    className: "tutor-avatar-ring tutor-avatar-ring-b"
  }), React.createElement("div", {
    className: "tutor-avatar-core"
  }, React.createElement("svg", {
    viewBox: "0 0 100 100",
    className: "tutor-avatar-face",
    role: "img",
    "aria-hidden": "true"
  }, React.createElement("defs", null, React.createElement("linearGradient", {
    id: "tutorAvatarFaceGrad",
    x1: "18",
    y1: "8",
    x2: "88",
    y2: "92"
  }, React.createElement("stop", {
    offset: "0%",
    stopColor: "var(--fg-0)",
    stopOpacity: "0.95"
  }), React.createElement("stop", {
    offset: "100%",
    stopColor: "var(--accent)",
    stopOpacity: "0.82"
  }))), React.createElement("circle", {
    cx: "50",
    cy: "50",
    r: "33",
    fill: "var(--bg-0)",
    opacity: "0.78"
  }), React.createElement("path", {
    d: "M27 48c4-13 14-20 23-20s19 7 23 20c-6-6-14-9-23-9s-17 3-23 9z",
    fill: "var(--accent-glow)",
    stroke: "var(--accent-soft)",
    strokeWidth: "1.2"
  }), React.createElement("circle", {
    className: "tutor-avatar-eye tutor-avatar-eye-left",
    cx: "39",
    cy: "51",
    r: "3.2",
    fill: "url(#tutorAvatarFaceGrad)"
  }), React.createElement("circle", {
    className: "tutor-avatar-eye tutor-avatar-eye-right",
    cx: "61",
    cy: "51",
    r: "3.2",
    fill: "url(#tutorAvatarFaceGrad)"
  }), React.createElement("path", {
    className: "tutor-avatar-mouth",
    d: "M38 64c7 6 17 6 24 0",
    fill: "none",
    stroke: "var(--accent)",
    strokeWidth: "3.2",
    strokeLinecap: "round"
  })), React.createElement("div", {
    className: "tutor-avatar-think-dots"
  }, React.createElement("span", null), React.createElement("span", null), React.createElement("span", null)), React.createElement("div", {
    className: "tutor-avatar-sound tutor-avatar-sound-left"
  }, React.createElement("span", null), React.createElement("span", null), React.createElement("span", null)), React.createElement("div", {
    className: "tutor-avatar-sound tutor-avatar-sound-right"
  }, React.createElement("span", null), React.createElement("span", null), React.createElement("span", null))));
};
const TUTOR_AVATAR_CSS = `
.tutor-avatar {
  --avatar-state: var(--accent);
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--accent);
}
.tutor-avatar-core {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 30%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background:
    radial-gradient(circle at 34% 24%, rgba(255,255,255,0.24), transparent 26%),
    radial-gradient(circle at 72% 76%, var(--accent-glow), transparent 42%),
    linear-gradient(135deg, var(--bg-2), var(--bg-1));
  border: 1px solid var(--accent-soft);
  box-shadow: 0 14px 42px -22px var(--avatar-state), inset 0 0 30px var(--accent-glow);
  transition: border-color 260ms var(--ease-out), box-shadow 260ms var(--ease-out), transform 260ms var(--ease-out), background 260ms var(--ease-out);
  animation: tutor-avatar-bob 3.4s ease-in-out infinite;
}
.tutor-avatar-face {
  width: 82%;
  height: 82%;
  filter: drop-shadow(0 8px 18px rgba(0,0,0,0.12));
}
.tutor-avatar-ring {
  position: absolute;
  inset: 3%;
  border-radius: 32%;
  border: 1px solid var(--accent-soft);
  opacity: 0;
  pointer-events: none;
}
.tutor-avatar-think-dots,
.tutor-avatar-sound {
  position: absolute;
  pointer-events: none;
  opacity: 0;
}
.tutor-avatar-think-dots {
  left: 50%;
  bottom: 14%;
  transform: translateX(-50%);
  display: flex;
  gap: 4px;
}
.tutor-avatar-think-dots span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
  animation: tutor-avatar-think-dot 920ms ease-in-out infinite;
}
.tutor-avatar-think-dots span:nth-child(2) { animation-delay: 120ms; }
.tutor-avatar-think-dots span:nth-child(3) { animation-delay: 240ms; }
.tutor-avatar-sound {
  top: 34%;
  display: flex;
  align-items: center;
  gap: 3px;
}
.tutor-avatar-sound-left { left: 7%; }
.tutor-avatar-sound-right { right: 7%; }
.tutor-avatar-sound span {
  width: 3px;
  height: 13px;
  border-radius: 999px;
  background: var(--accent);
  animation: tutor-avatar-sound-bar 520ms ease-in-out infinite;
}
.tutor-avatar-sound span:nth-child(2) { animation-delay: 120ms; }
.tutor-avatar-sound span:nth-child(3) { animation-delay: 240ms; }
.tutor-avatar-listening .tutor-avatar-core {
  transform: translateY(-1px) scale(1.015);
  box-shadow: 0 18px 50px -20px var(--accent), inset 0 0 34px var(--accent-glow);
}
.tutor-avatar-listening .tutor-avatar-ring {
  animation: tutor-avatar-listen-ring 1.25s ease-out infinite;
}
.tutor-avatar-listening .tutor-avatar-ring-b { animation-delay: 420ms; }
.tutor-avatar-thinking .tutor-avatar-core {
  animation: tutor-avatar-bob 3.4s ease-in-out infinite, tutor-avatar-dashed 1.25s linear infinite;
  border-style: dashed;
}
.tutor-avatar-thinking .tutor-avatar-think-dots { opacity: 1; }
.tutor-avatar-speaking .tutor-avatar-core {
  transform: scale(1.02);
  box-shadow: 0 20px 56px -18px var(--accent), inset 0 0 38px var(--accent-glow);
}
.tutor-avatar-speaking .tutor-avatar-mouth {
  animation: tutor-avatar-mouth 380ms ease-in-out infinite;
  transform-origin: 50% 64%;
}
.tutor-avatar-speaking .tutor-avatar-sound { opacity: 0.9; }
.tutor-avatar-error { --avatar-state: var(--err); color: var(--err); }
.tutor-avatar-error .tutor-avatar-core {
  border-color: var(--err);
  animation: tutor-avatar-error-shake 420ms ease-in-out 1;
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--err) 16%, transparent), 0 16px 44px -20px var(--err);
}
.tutor-avatar-error .tutor-avatar-mouth { stroke: var(--err); }
@keyframes tutor-avatar-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}
@keyframes tutor-avatar-listen-ring {
  0% { opacity: 0.55; transform: scale(0.86); }
  100% { opacity: 0; transform: scale(1.32); }
}
@keyframes tutor-avatar-think-dot {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.45; }
  40% { transform: translateY(-5px); opacity: 1; }
}
@keyframes tutor-avatar-sound-bar {
  0%, 100% { transform: scaleY(0.45); opacity: 0.42; }
  50% { transform: scaleY(1.15); opacity: 1; }
}
@keyframes tutor-avatar-mouth {
  0%, 100% { transform: scaleY(0.72); }
  50% { transform: scaleY(1.28); }
}
@keyframes tutor-avatar-error-shake {
  0%, 100% { transform: translateX(0); }
  22% { transform: translateX(-3px); }
  44% { transform: translateX(3px); }
  66% { transform: translateX(-2px); }
}
@keyframes tutor-avatar-dashed {
  0%, 100% { filter: hue-rotate(0deg); }
  50% { filter: hue-rotate(10deg); }
}
@media (prefers-reduced-motion: reduce) {
  .tutor-avatar-core,
  .tutor-avatar-ring,
  .tutor-avatar-thinking span,
  .tutor-avatar-sound span,
  .tutor-avatar-mouth {
    animation: none !important;
  }
}
`;
window.TutorAvatar = TutorAvatar;
})();


// ---- components/useSpeechRecognition.jsx ----
(function () {
  window.__NOESIS_BOOT.files.push("components/useSpeechRecognition.jsx");
const useSpeechRecognition = ({
  onResult,
  onError,
  lang = 'en-US'
} = {}) => {
  const [listening, setListening] = React.useState(false);
  const [supported, setSupported] = React.useState(false);
  const recognitionRef = React.useRef(null);
  const callbacksRef = React.useRef({
    onResult,
    onError
  });
  React.useEffect(() => {
    callbacksRef.current = {
      onResult,
      onError
    };
  }, [onResult, onError]);
  React.useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSupported(!!SpeechRecognition);
    if (!SpeechRecognition) return undefined;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = lang;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = event => {
      setListening(false);
      const code = event && event.error ? event.error : 'speech_error';
      if (callbacksRef.current.onError) callbacksRef.current.onError(code);
    };
    recognition.onresult = event => {
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal && result[0] && result[0].transcript) finalText += result[0].transcript;
      }
      const clean = finalText.trim();
      if (clean && callbacksRef.current.onResult) callbacksRef.current.onResult(clean);
    };
    recognitionRef.current = recognition;
    return () => {
      recognition.onstart = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      try {
        recognition.stop();
      } catch (_) {}
      recognitionRef.current = null;
    };
  }, [lang]);
  const start = React.useCallback(() => {
    if (!recognitionRef.current) {
      if (callbacksRef.current.onError) callbacksRef.current.onError('unsupported');
      return;
    }
    try {
      recognitionRef.current.start();
    } catch (e) {
      if (!listening && callbacksRef.current.onError) callbacksRef.current.onError(e.message || 'speech_start_failed');
    }
  }, [listening]);
  const stop = React.useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch (_) {}
    setListening(false);
  }, []);
  return {
    start,
    stop,
    listening,
    supported
  };
};
window.useSpeechRecognition = useSpeechRecognition;
})();


// ---- components/TutorChat.jsx ----
(function () {
  window.__NOESIS_BOOT.files.push("components/TutorChat.jsx");
const TutorChat = ({
  onNav,
  onMode,
  initialConversationId = null
}) => {
  const Icon = window.Icon;
  const actionChips = [{
    key: 'explain_deeper',
    label: 'Explain deeper',
    icon: 'Lightbulb',
    message: 'Explain the last concept in more depth with an analogy.'
  }, {
    key: 'quiz_me',
    label: 'Quiz me',
    icon: 'Target',
    message: 'Give me a quick quiz question about what we just discussed.'
  }, {
    key: 'summarize',
    label: 'Summarize',
    icon: 'Book',
    message: 'Summarize our conversation so far into key points.'
  }, {
    key: 'give_example',
    label: 'Give example',
    icon: 'Code',
    message: 'Show me a concrete code example for the last topic.'
  }, {
    key: 'compare_concepts',
    label: 'Compare concepts',
    icon: 'Shuffle',
    message: 'Compare this concept with a related one.'
  }, {
    key: 'make_flashcards',
    label: 'Make flashcards',
    icon: 'Cards',
    message: 'Create 3 flashcards from what we discussed.'
  }];
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
    window.NoesisAPI.materials.list().then(d => {
      if (!alive) return;
      const next = d.materials || [];
      setMaterials(next);
      const ready = next.filter(m => m.status === 'ready');
      const stored = ready.find(m => String(m.id) === String(selectedMaterialId));
      if (!stored && ready[0]) setSelectedMaterialId(String(ready[0].id));
    }).catch(e => {
      if (!alive) return;
      setError(e.message || 'Could not load materials.');
    });
    return () => {
      alive = false;
    };
  }, []);
  const scrollToBottom = React.useCallback((smooth = true) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto'
    });
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
  const materialLabel = m => {
    const label = m && (m.display_title || m.title) || '';
    if (!label || label === 'Document' || label === 'Material') return m ? `Material #${m.id}` : 'Core tutor corpus';
    return label;
  };
  const renderMarkdown = text => {
    const withCitationLinks = String(text || '').replace(/\[Source\s*(\d+)\]/gi, (_, n) => `<a href="#source-${n}" class="source-citation">[Source ${n}]</a>`);
    const html = enhanceCodeBlocks(window.marked ? window.marked.parse(withCitationLinks) : withCitationLinks);
    const safe = window.DOMPurify ? window.DOMPurify.sanitize(html) : html;
    return {
      __html: safe
    };
  };
  const groundingTone = tier => {
    if (tier === 'strong') return {
      label: 'Strong grounding',
      short: 'Strong',
      color: 'var(--ok)'
    };
    if (tier === 'moderate') return {
      label: 'Moderate grounding',
      short: 'Moderate',
      color: 'var(--warn)'
    };
    if (tier === 'weak') return {
      label: 'Weak grounding',
      short: 'Weak',
      color: 'var(--err)'
    };
    return {
      label: 'Grounding pending',
      short: 'Pending',
      color: 'var(--fg-3)'
    };
  };
  const showSourcesForMessage = React.useCallback((message, sourceIndex = null) => {
    if (!message || message.role === 'user') return;
    const sources = Array.isArray(message.sources) ? message.sources : [];
    setLatestSources(sources);
    setLatestTrace(message.trace || null);
    setLatestGrounding(message.grounding && message.grounding.tier || message.groundingTier || '');
    setActiveSourceIndex(Number.isInteger(sourceIndex) ? sourceIndex : null);
    setSourceRailLabel(Number.isInteger(sourceIndex) ? `Selected citation: Source ${sourceIndex + 1}` : 'Selected answer');
    setRailOpen(true);
  }, []);
  const stopAudio = React.useCallback(() => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch (_) {}
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
    onResult: transcript => {
      setSpeechError('');
      setInput(prev => {
        const cleanPrev = String(prev || '').trim();
        return cleanPrev ? `${cleanPrev} ${transcript}` : transcript;
      });
      setTimeout(() => textareaRef.current && textareaRef.current.focus(), 0);
    },
    onError: code => {
      const message = code === 'not-allowed' || code === 'permission-denied' ? 'Microphone access was blocked by the browser.' : code === 'no-speech' ? 'I did not catch any speech. Try again when you are ready.' : code === 'unsupported' ? 'Speech input is not supported in this browser.' : 'Speech recognition stopped. You can type instead.';
      setSpeechError(message);
    }
  });
  React.useEffect(() => () => stopAudio(), [stopAudio]);
  React.useEffect(() => {
    if (!initialConversationId) return;
    let alive = true;
    setLoadingHistory(true);
    setError('');
    window.NoesisAPI.tutor.chatMessages(initialConversationId, {
      limit: 80
    }).then(d => {
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
        setLatestGrounding(latestAssistant.grounding && latestAssistant.grounding.tier || latestAssistant.groundingTier || '');
        setSourceRailLabel('Latest answer');
      }
      setTimeout(() => scrollToBottom(false), 0);
    }).catch(e => {
      if (!alive) return;
      setError(e.message || 'Could not load that conversation.');
    }).finally(() => {
      if (alive) setLoadingHistory(false);
    });
    return () => {
      alive = false;
    };
  }, [initialConversationId, scrollToBottom]);
  const playMessageAudio = async message => {
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
          msg = data && (data.message || data.error) || msg;
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
      created_at: new Date().toISOString()
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
        action
      });
      setConversationId(res.conversation_id);
      setLatestSources(res.sources || []);
      setLatestTrace(res.trace || null);
      setLatestGrounding(res.grounding && res.grounding.tier || res.groundingTier || '');
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
        created_at: new Date().toISOString()
      }]);
    } catch (e) {
      const code = e && (e.code || e.data && e.data.error);
      const friendly = {
        ai_model_missing: 'The selected tutor model is unavailable. Noesis tried the fallback provider, but no model was ready.',
        ai_unavailable: 'The tutor provider is not reachable right now. Check provider settings or try again shortly.',
        ai_auth_failed: 'The tutor provider rejected the API key. Check credentials or switch providers.',
        ai_timeout: 'The tutor provider timed out. Try a shorter message or use the fallback provider.',
        ai_rate_limited: 'The tutor provider is rate limited. Please try again shortly.'
      }[code] || e.message || 'The tutor could not answer right now.';
      setError(friendly);
      setMessages(prev => [...prev, {
        id: `local-error-${Date.now()}`,
        role: 'assistant',
        content: friendly,
        error: true,
        created_at: new Date().toISOString()
      }]);
    } finally {
      setBusy(false);
    }
  };
  const onKeyDown = e => {
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
  const sampleQuestions = selectedMaterial ? ['What is the main idea in this material?', 'Explain the hardest concept with an example.', 'Quiz me on the key points.'] : ['Explain object-oriented programming.', 'Compare stacks and queues.', 'What does Big-O measure?'];
  const avatarState = error || speechError || audioError ? 'error' : playingMessageId ? 'speaking' : busy ? 'thinking' : speech.listening || input.trim() ? 'listening' : 'idle';
  const avatarStatus = avatarState === 'thinking' ? 'Finding the right source chunks and composing an answer.' : avatarState === 'speaking' ? 'Speaking the latest tutor reply.' : speech.listening ? 'Listening through your microphone.' : avatarState === 'listening' ? 'Listening to your question as you type.' : avatarState === 'error' ? 'Something needs attention before we continue.' : 'Ready for your next question.';
  const micTitle = speech.supported ? speech.listening ? 'Stop listening' : 'Start voice input' : 'Voice input is not supported in this browser';
  const layoutStyle = {
    ...tc.layout,
    gridTemplateColumns: isNarrow ? 'minmax(0, 1fr)' : railOpen ? 'minmax(0, 1fr) 320px' : 'minmax(0, 1fr) 0px'
  };
  const railStyle = {
    ...tc.rail,
    ...(isNarrow ? tc.railNarrow : {}),
    opacity: railOpen ? 1 : 0,
    pointerEvents: railOpen ? 'auto' : 'none',
    display: isNarrow && !railOpen ? 'none' : undefined
  };
  return React.createElement("div", {
    style: tc.page
  }, React.createElement(window.Topbar, {
    title: "Free Chat",
    crumbs: ['AI Tutor'],
    right: React.createElement(React.Fragment, null, playingMessageId && React.createElement("button", {
      className: "btn btn-bare",
      onClick: stopAudio
    }, React.createElement(Icon.Pause, {
      size: 12
    }), " Stop"), React.createElement("button", {
      className: "btn btn-bare",
      onClick: () => {
        if (!muted) stopAudio();
        setMuted(v => !v);
      },
      title: muted ? 'Enable tutor audio' : 'Mute tutor audio'
    }, muted ? React.createElement(React.Fragment, null, React.createElement(Icon.X, {
      size: 12
    }), " Muted") : React.createElement(React.Fragment, null, React.createElement(Icon.Play, {
      size: 12
    }), " Audio")), React.createElement("button", {
      className: "btn btn-ghost",
      onClick: () => onMode && onMode(null)
    }, React.createElement(Icon.ArrowLeft, {
      size: 12
    }), " Modes"), React.createElement("button", {
      className: "btn btn-bare",
      onClick: resetChat
    }, React.createElement(Icon.Plus, {
      size: 12
    }), " New chat"))
  }), React.createElement("div", {
    style: tc.contextBar
  }, React.createElement("div", {
    style: tc.contextMeta
  }, React.createElement("div", {
    style: tc.kicker
  }, "Grounded source"), React.createElement("select", {
    className: "input",
    value: selectedMaterialId,
    onChange: e => setSelectedMaterialId(e.target.value),
    style: tc.materialSelect
  }, readyMaterials.length === 0 && React.createElement("option", {
    value: ""
  }, "Core tutor corpus"), readyMaterials.map(m => React.createElement("option", {
    key: m.id,
    value: m.id
  }, materialLabel(m))))), React.createElement("div", {
    style: tc.contextHint
  }, selectedMaterial ? materialLabel(selectedMaterial) : 'Ask from the core tutor corpus'), React.createElement("button", {
    className: "btn btn-bare",
    onClick: () => setRailOpen(v => !v)
  }, railOpen ? React.createElement(Icon.ChevronRight, {
    size: 13
  }) : React.createElement(Icon.ChevronLeft, {
    size: 13
  }), "Sources")), React.createElement("div", {
    style: layoutStyle
  }, React.createElement("main", {
    style: tc.chatPane
  }, React.createElement("div", {
    style: tc.avatarPanel
  }, React.createElement(window.TutorAvatar, {
    state: avatarState,
    size: 64
  }), React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, React.createElement("div", {
    style: tc.avatarTitle
  }, "No\u0113sis Tutor"), React.createElement("div", {
    style: tc.avatarStatus
  }, avatarStatus))), React.createElement("div", {
    ref: listRef,
    style: tc.messages,
    onScroll: handleMessagesScroll
  }, loadingHistory ? React.createElement(LoadingBubble, {
    label: "Loading your previous chat"
  }) : messages.length === 0 && !busy ? React.createElement("div", {
    style: tc.emptyState
  }, React.createElement(window.TutorAvatar, {
    state: avatarState,
    size: 86
  }), React.createElement("h1", {
    style: tc.emptyTitle
  }, "Ask about your material"), React.createElement("p", {
    style: tc.emptyText
  }, "The tutor will retrieve relevant chunks, answer from them, and keep sources visible while you learn."), React.createElement("div", {
    style: tc.emptySourcePanel
  }, React.createElement("span", {
    style: tc.emptySourceLabel
  }, "Ask from"), React.createElement("select", {
    className: "input",
    value: selectedMaterialId,
    onChange: e => setSelectedMaterialId(e.target.value),
    style: tc.emptySourceSelect
  }, readyMaterials.length === 0 && React.createElement("option", {
    value: ""
  }, "Core tutor corpus"), readyMaterials.map(m => React.createElement("option", {
    key: m.id,
    value: m.id
  }, materialLabel(m))))), React.createElement("div", {
    style: tc.sampleGrid
  }, sampleQuestions.map(q => React.createElement("button", {
    key: q,
    style: tc.sampleChip,
    onClick: () => sendMessage(q)
  }, q)))) : React.createElement(React.Fragment, null, messages.map(m => React.createElement(ChatMessage, {
    key: m.id,
    message: m,
    renderMarkdown: renderMarkdown,
    groundingTone: groundingTone,
    onSpeak: playMessageAudio,
    playing: playingMessageId === m.id,
    ttsBusy: ttsBusyMessageId === m.id,
    muted: muted,
    onShowSources: showSourcesForMessage,
    onCitation: showSourcesForMessage,
    onAction: (text, actionKey) => sendMessage(text, actionKey)
  })), busy && React.createElement(LoadingBubble, null))), showScrollFab && React.createElement("button", {
    style: tc.scrollFab,
    onClick: () => scrollToBottom(true)
  }, React.createElement(Icon.ChevronDown, {
    size: 13
  }), "New messages"), suggestions.length > 0 && React.createElement("div", {
    style: tc.suggestions
  }, suggestions.slice(0, 3).map((s, i) => React.createElement("button", {
    key: `${s}-${i}`,
    style: tc.suggestionChip,
    disabled: busy,
    onClick: () => sendMessage(s)
  }, s))), React.createElement("div", {
    style: tc.actionChips
  }, actionChips.map(item => {
    const ChipIcon = Icon[item.icon] || Icon.Sparkle;
    return React.createElement("button", {
      key: item.key,
      style: tc.actionChip,
      disabled: busy,
      onClick: () => sendMessage(item.message, item.key)
    }, React.createElement(ChipIcon, {
      size: 13
    }), item.label);
  })), React.createElement("div", {
    style: tc.composerWrap
  }, error && React.createElement("div", {
    style: tc.error
  }, error), speechError && React.createElement("div", {
    style: tc.speechHint
  }, speechError), audioError && React.createElement("div", {
    style: tc.speechHint
  }, audioError), React.createElement("div", {
    style: tc.composer
  }, React.createElement("button", {
    className: "btn btn-bare",
    disabled: busy || !speech.supported,
    title: micTitle,
    onClick: () => {
      setSpeechError('');
      speech.listening ? speech.stop() : speech.start();
    },
    style: {
      ...tc.iconButton,
      ...(speech.listening ? tc.iconButtonListening : {}),
      ...(!speech.supported ? tc.iconButtonDisabled : {})
    }
  }, React.createElement(Icon.Mic, {
    size: 16
  })), React.createElement("textarea", {
    ref: textareaRef,
    value: input,
    onChange: e => {
      setInput(e.target.value);
      if (speechError) setSpeechError('');
    },
    onKeyDown: onKeyDown,
    rows: composerRows,
    placeholder: "Ask a question about the selected material...",
    style: tc.textarea,
    disabled: busy
  }), React.createElement("button", {
    className: "btn btn-accent",
    disabled: busy || !input.trim(),
    onClick: () => sendMessage(),
    style: tc.sendButton
  }, busy ? 'Thinking...' : 'Send', " ", React.createElement(Icon.Send, {
    size: 14
  }))))), React.createElement("aside", {
    style: railStyle
  }, React.createElement("div", {
    style: tc.railHeader
  }, React.createElement("div", null, React.createElement("div", {
    style: tc.kicker
  }, sourceRailLabel), React.createElement("div", {
    style: tc.railTitle
  }, "Sources")), React.createElement(GroundingBadge, {
    tier: latestGrounding,
    groundingTone: groundingTone
  }), isNarrow && React.createElement("button", {
    className: "btn btn-bare",
    onClick: () => setRailOpen(false),
    title: "Close sources"
  }, React.createElement(Icon.X, {
    size: 13
  }))), React.createElement("div", {
    style: tc.railBody
  }, latestSources.length === 0 ? React.createElement("div", {
    style: tc.emptyRail
  }, "Sources will appear after the first grounded answer.") : latestSources.map((s, i) => React.createElement("div", {
    id: `source-card-${i + 1}`,
    key: `${s.id || s.chunkId || i}-${i}`,
    style: {
      ...tc.sourceCard,
      ...(activeSourceIndex === i ? tc.sourceCardActive : {})
    }
  }, React.createElement("div", {
    style: tc.sourceTopline
  }, React.createElement("div", {
    style: tc.sourceKicker
  }, "Source ", i + 1), s.score != null && React.createElement("div", {
    style: tc.sourceScore
  }, Math.round(Math.max(0, Math.min(1, Number(s.score))) * 100), "%")), React.createElement("div", {
    style: tc.sourceTitle
  }, s.heading || s.location || s.materialTitle || 'Material excerpt'), React.createElement("div", {
    style: tc.sourceExcerpt
  }, s.excerpt || s.text || ''), s.score != null && React.createElement("div", {
    style: tc.scoreBar
  }, React.createElement("span", {
    style: {
      ...tc.scoreFill,
      width: `${Math.max(6, Math.min(100, Number(s.score) * 100))}%`
    }
  })), selectedMaterialId && onNav && React.createElement("button", {
    style: tc.sourceLink,
    onClick: () => {
      sessionStorage.setItem('noesis.materialId', String(selectedMaterialId));
      onNav('material');
    }
  }, "View in material"))), React.createElement(MaterialVisuals, {
    materialId: selectedMaterialId
  }), latestTrace && React.createElement("div", {
    style: tc.traceBox
  }, React.createElement(TracePair, {
    label: "Provider",
    value: latestTrace.provider || 'unknown'
  }), React.createElement(TracePair, {
    label: "Model",
    value: latestTrace.model || 'unknown'
  }), React.createElement(TracePair, {
    label: "Retrieval",
    value: latestTrace.retrievalMs == null ? '-' : `${latestTrace.retrievalMs} ms`
  }), React.createElement(TracePair, {
    label: "Generation",
    value: latestTrace.generationMs == null ? '-' : `${latestTrace.generationMs} ms`
  }))))));
};
const MaterialVisuals = ({
  materialId
}) => {
  const [visuals, setVisuals] = React.useState([]);
  React.useEffect(() => {
    let active = true;
    if (!materialId) {
      setVisuals([]);
      return undefined;
    }
    (async () => {
      try {
        const res = await window.NoesisAPI.materials.sourceVisuals(materialId);
        const list = (res && res.source_visuals || []).filter(v => v && v.id && v.imagePath);
        if (active) setVisuals(list.slice(0, 4));
      } catch (_) {
        if (active) setVisuals([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [materialId]);
  if (!visuals.length) return null;
  return React.createElement("div", {
    style: tc.materialVisuals
  }, React.createElement("div", {
    style: tc.materialVisualsLabel
  }, "From your material"), visuals.map(v => React.createElement(SourceVisualThumb, {
    key: v.id,
    materialId: materialId,
    candidate: v
  })));
};
const SourceVisualThumb = ({
  materialId,
  candidate
}) => {
  const [url, setUrl] = React.useState('');
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    let active = true;
    let objUrl = '';
    (async () => {
      try {
        objUrl = await window.NoesisAPI.materials.sourceVisualImageBlobUrl(materialId, candidate.id);
        if (active) setUrl(objUrl);else URL.revokeObjectURL(objUrl);
      } catch (_) {
        if (active) setFailed(true);
      }
    })();
    return () => {
      active = false;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [materialId, candidate.id]);
  if (failed) return null;
  const where = candidate.pageNumber != null ? `p.${candidate.pageNumber}` : candidate.slideNumber != null ? `slide ${candidate.slideNumber}` : '';
  return React.createElement("figure", {
    style: tc.materialVisualFigure
  }, url ? React.createElement("img", {
    src: url,
    alt: candidate.caption || 'Source visual',
    style: tc.materialVisualImg,
    onError: () => setFailed(true)
  }) : React.createElement("div", {
    style: tc.materialVisualLoading
  }, "Loading\u2026"), (candidate.caption || where) && React.createElement("figcaption", {
    style: tc.materialVisualCaption
  }, candidate.caption || 'Source visual', where ? ` (${where})` : ''));
};
const ChatMessage = ({
  message,
  renderMarkdown,
  groundingTone,
  onSpeak,
  playing,
  ttsBusy,
  muted,
  onShowSources,
  onCitation,
  onAction
}) => {
  const Icon = window.Icon;
  const ExplainIcon = Icon.Lightbulb || Icon.Sparkle;
  const ExampleIcon = Icon.Code || Icon.Braces || Icon.Sparkle;
  const QuizIcon = Icon.Target || Icon.CircleHelp || Icon.Sparkle;
  const SourceIcon = Icon.BookOpen || Icon.Book || Icon.FileText || Icon.Sparkle;
  const [copied, setCopied] = React.useState(false);
  const isUser = message.role === 'user';
  const tier = message.grounding && message.grounding.tier || message.groundingTier;
  const tone = groundingTone(tier);
  const timeLabel = relativeTime(message.created_at);
  const exactTime = message.created_at ? new Date(message.created_at).toLocaleString() : '';
  const weakNote = !isUser && message.grounding && message.grounding.tier === 'weak' && !String(message.content || '').toLowerCase().includes('could not find strong support') ? message.grounding.message : '';
  const handleMarkdownClick = e => {
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
      const readable = window.NoesisTutorResponse && window.NoesisTutorResponse.copyText ? window.NoesisTutorResponse.copyText(message.content) : String(message.content || '');
      await navigator.clipboard.writeText(readable);
      setCopied(true);
      setTimeout(() => setCopied(false), 1300);
    } catch (_) {
      setCopied(false);
    }
  };
  return React.createElement("div", {
    style: {
      ...tc.messageRow,
      justifyContent: isUser ? 'flex-end' : 'flex-start'
    }
  }, !isUser && React.createElement(window.TutorAvatar, {
    state: message.error ? 'error' : 'idle',
    size: 30
  }), React.createElement("div", {
    style: {
      ...tc.bubble,
      ...(isUser ? tc.userBubble : tc.tutorBubble),
      ...(message.error ? tc.errorBubble : {})
    }
  }, React.createElement("div", {
    style: tc.bubbleMeta
  }, React.createElement("span", null, isUser ? 'You' : 'Tutor'), timeLabel && React.createElement("span", {
    style: tc.messageTime,
    title: exactTime
  }, timeLabel), !isUser && tier && React.createElement("button", {
    style: {
      ...tc.inlineGroundingBadge,
      borderColor: tone.color,
      color: tone.color
    },
    title: message.grounding ? message.grounding.message : tone.label,
    onClick: () => onShowSources && onShowSources(message)
  }, React.createElement("span", {
    style: {
      ...tc.groundingDot,
      background: tone.color
    }
  }), tone.label), !isUser && React.createElement("button", {
    style: {
      ...tc.messageIconButton,
      marginLeft: 'auto',
      ...(copied ? tc.messageIconButtonActive : {})
    },
    onClick: copyMessage,
    title: copied ? 'Copied' : 'Copy reply'
  }, copied ? React.createElement(Icon.Check, {
    size: 11
  }) : React.createElement(Icon.Copy, {
    size: 11
  })), !isUser && React.createElement("button", {
    style: {
      ...tc.messageIconButton,
      ...(playing ? tc.messageIconButtonActive : {})
    },
    disabled: muted || ttsBusy,
    onClick: () => onSpeak && onSpeak(message),
    title: muted ? 'Audio is muted' : playing ? 'Stop speaking' : 'Read this reply aloud'
  }, ttsBusy ? React.createElement("span", {
    className: "mono"
  }, "...") : playing ? React.createElement(Icon.Pause, {
    size: 11
  }) : React.createElement(Icon.Play, {
    size: 11
  }))), weakNote && React.createElement("div", {
    style: tc.groundingNote
  }, weakNote), !isUser ? React.createElement(TutorReplyCard, {
    message: message,
    renderMarkdown: renderMarkdown,
    onMarkdownClick: handleMarkdownClick
  }) : React.createElement("div", {
    className: "md-rendered",
    style: tc.markdown,
    onClick: handleMarkdownClick,
    dangerouslySetInnerHTML: renderMarkdown(message.content)
  }), !isUser && message.actionResult && React.createElement(ActionResult, {
    result: message.actionResult
  }), !isUser && !message.error && React.createElement("div", {
    style: tc.replyActions
  }, React.createElement("button", {
    style: tc.replyActionButton,
    disabled: ttsBusy,
    onClick: () => onAction && onAction('Explain your last answer more simply with a beginner-friendly analogy.', '')
  }, React.createElement(ExplainIcon, {
    size: 12
  }), " Explain simpler"), React.createElement("button", {
    style: tc.replyActionButton,
    onClick: () => onAction && onAction('Show me a concrete example for your last answer.', 'give_example')
  }, React.createElement(ExampleIcon, {
    size: 12
  }), " Give example"), React.createElement("button", {
    style: tc.replyActionButton,
    onClick: () => onAction && onAction('Quiz me on your last answer.', 'quiz_me')
  }, React.createElement(QuizIcon, {
    size: 12
  }), " Quiz me"), React.createElement("button", {
    style: tc.replyActionButton,
    onClick: () => onShowSources && onShowSources(message)
  }, React.createElement(SourceIcon, {
    size: 12
  }), " Show sources"), React.createElement("button", {
    style: tc.replyActionButton,
    disabled: muted || ttsBusy,
    onClick: () => onSpeak && onSpeak(message)
  }, playing ? React.createElement(Icon.Pause, {
    size: 12
  }) : React.createElement(Icon.Play, {
    size: 12
  }), " Speak"))));
};
const chatCodeObject = code => {
  if (!code) return null;
  if (typeof code === 'string') return {
    language: 'text',
    content: code
  };
  return {
    language: code.language || 'text',
    content: code.content || code.text || code.code || ''
  };
};
const TutorReplyCard = ({
  message,
  renderMarkdown,
  onMarkdownClick
}) => {
  const Icon = window.Icon;
  const [copiedCode, setCopiedCode] = React.useState(false);
  const helper = window.NoesisTutorResponse;
  const normalized = helper && helper.normalize ? helper.normalize(message.content) : {
    structured: false,
    text: message.content
  };
  if (!normalized.structured) {
    return React.createElement("div", {
      className: "md-rendered",
      style: tc.markdown,
      onClick: onMarkdownClick,
      dangerouslySetInnerHTML: renderMarkdown(message.content)
    });
  }
  const code = chatCodeObject(normalized.code);
  const visual = normalized.visual && typeof normalized.visual === 'object' ? normalized.visual.caption || normalized.visual.description || normalized.visual.type || '' : typeof normalized.visual === 'string' ? normalized.visual : '';
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
  return React.createElement("div", {
    style: tc.replyCard
  }, (normalized.title || normalized.type) && React.createElement("div", {
    style: tc.replyTitle
  }, normalized.title || String(normalized.type).replace(/_/g, ' ')), normalized.explanation && React.createElement("section", {
    style: tc.replySection
  }, React.createElement("div", {
    style: tc.replySectionTitle
  }, "Answer"), React.createElement("div", {
    className: "md-rendered",
    style: tc.markdown,
    onClick: onMarkdownClick,
    dangerouslySetInnerHTML: renderMarkdown(normalized.explanation)
  })), normalized.keyPoints && normalized.keyPoints.length > 0 && React.createElement("section", {
    style: tc.replySection
  }, React.createElement("div", {
    style: tc.replySectionTitle
  }, "Key points"), React.createElement("div", {
    style: tc.keyPointGrid
  }, normalized.keyPoints.slice(0, 6).map((point, i) => React.createElement("div", {
    key: `${point}-${i}`,
    style: tc.keyPoint
  }, React.createElement("span", {
    className: "mono",
    style: tc.keyPointNumber
  }, i + 1), React.createElement("span", null, point))))), normalized.example && React.createElement("section", {
    style: {
      ...tc.replySection,
      ...tc.exampleCard
    }
  }, React.createElement("div", {
    style: tc.replySectionTitle
  }, "Example"), React.createElement("div", {
    className: "md-rendered",
    style: tc.markdown,
    onClick: onMarkdownClick,
    dangerouslySetInnerHTML: renderMarkdown(normalized.example)
  })), code && code.content && React.createElement("section", {
    style: tc.codeCard
  }, React.createElement("div", {
    style: tc.replyCodeHeader
  }, React.createElement("span", null, code.language || 'code'), React.createElement("button", {
    style: tc.codeCopyButton,
    onClick: copyCode
  }, copiedCode ? React.createElement(Icon.Check, {
    size: 11
  }) : React.createElement(Icon.Copy, {
    size: 11
  }), copiedCode ? 'Copied' : 'Copy code')), React.createElement("pre", {
    style: tc.replyCode
  }, code.content)), visual && React.createElement("section", {
    style: tc.visualCard
  }, React.createElement("div", {
    style: tc.replySectionTitle
  }, "Visual"), React.createElement("div", null, visual)), (normalized.hint || normalized.question) && React.createElement("section", {
    style: tc.checkpointCard
  }, normalized.hint && React.createElement("div", null, React.createElement("b", null, "Hint:"), " ", normalized.hint), normalized.question && React.createElement("div", null, React.createElement("b", null, "Check yourself:"), " ", normalized.question)));
};
const ActionResult = ({
  result
}) => {
  const [selected, setSelected] = React.useState(null);
  if (!result) return null;
  if (result.type === 'flashcards') {
    return React.createElement("div", {
      style: tc.actionResult
    }, React.createElement("div", {
      style: tc.actionResultTitle
    }, "Flashcards saved"), React.createElement("div", {
      style: tc.actionResultText
    }, result.created || 0, " card", result.created === 1 ? '' : 's', " added to your flashcards."));
  }
  if (result.type === 'quiz' && result.quiz) {
    const q = result.quiz;
    const correctIdx = Number.isInteger(q.correct_idx) ? q.correct_idx : Number(q.correct_idx);
    const hasSelection = selected != null;
    return React.createElement("div", {
      style: tc.actionResult
    }, React.createElement("div", {
      style: tc.actionResultTitle
    }, "Quick quiz"), React.createElement("div", {
      style: tc.actionResultText
    }, q.question), Array.isArray(q.options) && q.options.length > 0 && React.createElement("div", {
      style: tc.quizOptions
    }, q.options.map((option, i) => React.createElement("button", {
      key: `${option}-${i}`,
      style: {
        ...tc.quizOption,
        ...(hasSelection && i === correctIdx ? tc.quizOptionCorrect : {}),
        ...(hasSelection && i === selected && i !== correctIdx ? tc.quizOptionWrong : {})
      },
      onClick: () => setSelected(i)
    }, React.createElement("span", {
      className: "mono"
    }, String.fromCharCode(65 + i)), option))), (hasSelection || !Array.isArray(q.options) || !q.options.length) && (q.expectedAnswer || q.explanation) && React.createElement("div", {
      style: tc.quizDetails
    }, q.expectedAnswer && React.createElement("div", null, q.expectedAnswer), q.explanation && React.createElement("div", {
      style: {
        marginTop: 'calc(6px * var(--app-density-scale))',
        color: 'var(--fg-2)'
      }
    }, q.explanation)));
  }
  return null;
};
const LoadingBubble = ({
  label = 'Checking your sources'
}) => React.createElement("div", {
  style: {
    ...tc.messageRow,
    justifyContent: 'flex-start'
  }
}, React.createElement(window.TutorAvatar, {
  state: "thinking",
  size: 30
}), React.createElement("div", {
  style: {
    ...tc.bubble,
    ...tc.tutorBubble,
    ...tc.typingBubble
  }
}, React.createElement("span", {
  style: tc.typingLabel
}, label), React.createElement("span", {
  style: tc.typingDots,
  "aria-hidden": "true"
}, React.createElement("span", {
  className: "typing-dot"
}), React.createElement("span", {
  className: "typing-dot"
}), React.createElement("span", {
  className: "typing-dot"
}))));
const GroundingBadge = ({
  tier,
  groundingTone
}) => {
  const tone = groundingTone(tier);
  return React.createElement("span", {
    style: {
      ...tc.badge,
      borderColor: tone.color,
      color: tone.color
    }
  }, tone.short);
};
const TracePair = ({
  label,
  value
}) => React.createElement("div", {
  style: tc.tracePair
}, React.createElement("span", null, label), React.createElement("b", null, value));
function tutorSpeechText(markdown) {
  if (window.NoesisTutorResponse) return window.NoesisTutorResponse.speechText(markdown);
  return String(markdown || '').replace(/```[\s\S]*?```/g, ' code example omitted. ').replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[#>*_~|]/g, ' ').replace(/\[(Source|source)\s*\d+\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 4000);
}
function enhanceCodeBlocks(html) {
  return String(html || '').replace(/<pre><code([^>]*)>([\s\S]*?)<\/code><\/pre>/g, (_, attrs, code) => {
    const highlighted = String(code || '').replace(/(\/\/[^\n<]*)|(&quot;.*?&quot;|'.*?')|\b(class|public|private|protected|static|void|int|String|return|if|else|for|while|new|extends|implements|interface|const|let|var|function|async|await)\b/g, (match, comment, stringValue, keyword) => {
      if (comment) return `<span class="code-comment">${comment}</span>`;
      if (stringValue) return `<span class="code-string">${stringValue}</span>`;
      if (keyword) return `<span class="code-keyword">${keyword}</span>`;
      return match;
    });
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
  page: {
    minHeight: '100vh',
    background: 'var(--bg-0)',
    color: 'var(--fg-0)',
    display: 'flex',
    flexDirection: 'column'
  },
  contextBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(12px * var(--app-density-scale))',
    padding: '12px 22px',
    borderBottom: '1px solid var(--line)',
    background: 'var(--bg-1)',
    flexWrap: 'wrap'
  },
  contextMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(10px * var(--app-density-scale))'
  },
  kicker: {
    fontSize: 'calc(10.5px * var(--app-font-scale))',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--fg-3)',
    marginBottom: 'calc(3px * var(--app-density-scale))'
  },
  materialSelect: {
    width: 280,
    maxWidth: '48vw',
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    padding: '8px 10px'
  },
  contextHint: {
    color: 'var(--fg-2)',
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    minWidth: 0,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  layout: {
    flex: 1,
    display: 'grid',
    minHeight: 0,
    transition: 'grid-template-columns 220ms var(--ease-out)'
  },
  chatPane: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    minHeight: 0
  },
  avatarPanel: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(12px * var(--app-density-scale))',
    padding: '14px clamp(18px, 4vw, 56px)',
    borderBottom: '1px solid var(--line)',
    background: 'var(--bg-0)'
  },
  avatarTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 'calc(18px * var(--app-font-scale))',
    color: 'var(--fg-0)',
    lineHeight: 1.2
  },
  avatarStatus: {
    color: 'var(--fg-2)',
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    lineHeight: 1.45,
    marginTop: 'calc(3px * var(--app-density-scale))'
  },
  messages: {
    flex: 1,
    overflow: 'auto',
    padding: '24px clamp(18px, 4vw, 56px)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'calc(14px * var(--app-density-scale))'
  },
  emptyState: {
    minHeight: 430,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    gap: 'calc(14px * var(--app-density-scale))'
  },
  avatarLarge: {
    width: 72,
    height: 72,
    borderRadius: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--accent-glow)',
    border: '1px solid var(--accent-soft)',
    color: 'var(--accent)'
  },
  emptyTitle: {
    margin: 0,
    fontFamily: 'var(--font-display)',
    fontSize: 'calc(36px * var(--app-font-scale))',
    fontWeight: 300,
    color: 'var(--fg-0)'
  },
  emptyText: {
    margin: 0,
    maxWidth: 560,
    color: 'var(--fg-2)',
    fontSize: 'calc(14px * var(--app-font-scale))',
    lineHeight: 1.7
  },
  emptySourcePanel: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(8px * var(--app-density-scale))',
    padding: 'calc(8px * var(--app-density-scale))',
    border: '1px solid var(--line)',
    borderRadius: 'var(--r-md)',
    background: 'var(--bg-1)',
    maxWidth: 'min(560px, 94vw)'
  },
  emptySourceLabel: {
    color: 'var(--fg-3)',
    fontSize: 'calc(11px * var(--app-font-scale))',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    whiteSpace: 'nowrap'
  },
  emptySourceSelect: {
    minWidth: 260,
    maxWidth: '62vw',
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    padding: '8px 10px'
  },
  sampleGrid: {
    display: 'flex',
    gap: 'calc(8px * var(--app-density-scale))',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 'calc(8px * var(--app-density-scale))',
    maxWidth: 760
  },
  sampleChip: {
    padding: '9px 12px',
    borderRadius: 999,
    border: '1px solid var(--line)',
    background: 'var(--bg-1)',
    color: 'var(--fg-1)',
    fontSize: 'calc(12.5px * var(--app-font-scale))'
  },
  messageRow: {
    display: 'flex',
    gap: 'calc(10px * var(--app-density-scale))',
    alignItems: 'flex-start'
  },
  bubbleAvatar: {
    width: 30,
    height: 30,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--accent-glow)',
    border: '1px solid var(--accent-soft)',
    color: 'var(--accent)',
    flexShrink: 0,
    marginTop: 'calc(3px * var(--app-density-scale))'
  },
  bubble: {
    maxWidth: 'min(760px, 82%)',
    borderRadius: 10,
    border: '1px solid var(--line)',
    padding: '11px 13px',
    boxShadow: '0 8px 28px rgba(0,0,0,0.08)'
  },
  userBubble: {
    background: 'var(--accent)',
    borderColor: 'var(--accent)',
    color: 'var(--bg-0)'
  },
  tutorBubble: {
    background: 'var(--bg-1)',
    borderColor: 'var(--line)',
    color: 'var(--fg-1)'
  },
  errorBubble: {
    borderColor: 'var(--err)',
    background: 'color-mix(in oklab, var(--err) 10%, var(--bg-1))'
  },
  bubbleMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(6px * var(--app-density-scale))',
    fontSize: 'calc(10.5px * var(--app-font-scale))',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'inherit',
    opacity: 0.78,
    marginBottom: 'calc(5px * var(--app-density-scale))'
  },
  messageTime: {
    letterSpacing: 0,
    textTransform: 'none',
    color: 'var(--fg-3)',
    fontSize: 'calc(10.5px * var(--app-font-scale))'
  },
  groundingDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    display: 'inline-block'
  },
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
    cursor: 'pointer'
  },
  groundingNote: {
    margin: '4px 0 8px',
    padding: '8px 9px',
    borderRadius: 8,
    border: '1px solid color-mix(in oklab, var(--err) 44%, var(--line))',
    background: 'color-mix(in oklab, var(--err) 9%, var(--bg-1))',
    color: 'var(--fg-1)',
    fontSize: 'calc(12px * var(--app-font-scale))',
    lineHeight: 1.45
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
    opacity: 1
  },
  messageIconButtonActive: {
    color: 'var(--accent)',
    borderColor: 'var(--accent-soft)',
    background: 'var(--accent-glow)'
  },
  markdown: {
    fontSize: 'calc(13.5px * var(--app-font-scale))',
    lineHeight: 1.65,
    color: 'inherit'
  },
  replyCard: {
    display: 'grid',
    gap: 'calc(11px * var(--app-density-scale))'
  },
  replyTitle: {
    fontSize: 'calc(15px * var(--app-font-scale))',
    color: 'var(--fg-0)',
    fontWeight: 700,
    lineHeight: 1.35
  },
  replySection: {
    padding: 'calc(12px * var(--app-density-scale))',
    borderRadius: 8,
    border: '1px solid var(--line)',
    background: 'var(--bg-0)'
  },
  replySectionTitle: {
    fontSize: 'calc(10.5px * var(--app-font-scale))',
    color: 'var(--accent)',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    marginBottom: 'calc(7px * var(--app-density-scale))',
    fontWeight: 700
  },
  exampleCard: {
    background: 'color-mix(in srgb, var(--accent) 7%, var(--bg-0))',
    borderColor: 'var(--accent-soft)'
  },
  keyPointGrid: {
    display: 'grid',
    gap: 'calc(7px * var(--app-density-scale))'
  },
  keyPoint: {
    display: 'flex',
    gap: 'calc(9px * var(--app-density-scale))',
    alignItems: 'flex-start',
    color: 'var(--fg-1)',
    fontSize: 'calc(13px * var(--app-font-scale))',
    lineHeight: 1.5
  },
  keyPointNumber: {
    width: 18,
    height: 18,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    background: 'var(--accent-glow)',
    color: 'var(--accent)',
    flexShrink: 0,
    fontSize: 'calc(10px * var(--app-font-scale))'
  },
  codeCard: {
    borderRadius: 8,
    border: '1px solid #1d4ed8',
    background: '#0f172a',
    overflow: 'hidden'
  },
  replyCodeHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'calc(10px * var(--app-density-scale))',
    padding: '9px 12px',
    color: '#bfdbfe',
    fontSize: 'calc(11.5px * var(--app-font-scale))',
    borderBottom: '1px solid rgba(191,219,254,0.18)'
  },
  codeCopyButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'calc(5px * var(--app-density-scale))',
    padding: '5px 8px',
    borderRadius: 7,
    border: '1px solid rgba(191,219,254,0.25)',
    background: 'rgba(15,23,42,0.72)',
    color: '#dbeafe',
    fontSize: 'calc(11px * var(--app-font-scale))',
    cursor: 'pointer'
  },
  replyCode: {
    margin: 0,
    padding: 'calc(14px * var(--app-density-scale))',
    maxHeight: 320,
    overflow: 'auto',
    color: '#dbeafe',
    fontFamily: 'var(--font-mono)',
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    lineHeight: 1.6
  },
  visualCard: {
    padding: 'calc(12px * var(--app-density-scale))',
    borderRadius: 8,
    border: '1px dashed var(--accent-soft)',
    background: 'var(--bg-0)',
    color: 'var(--fg-1)',
    fontSize: 'calc(13px * var(--app-font-scale))',
    lineHeight: 1.55
  },
  checkpointCard: {
    display: 'grid',
    gap: 'calc(8px * var(--app-density-scale))',
    padding: 'calc(12px * var(--app-density-scale))',
    borderRadius: 8,
    border: '1px solid var(--accent-soft)',
    background: 'var(--accent-glow)',
    color: 'var(--fg-1)',
    fontSize: 'calc(13px * var(--app-font-scale))',
    lineHeight: 1.55
  },
  replyActions: {
    display: 'flex',
    gap: 'calc(7px * var(--app-density-scale))',
    flexWrap: 'wrap',
    marginTop: 'calc(12px * var(--app-density-scale))',
    paddingTop: 'calc(10px * var(--app-density-scale))',
    borderTop: '1px solid var(--line)'
  },
  replyActionButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'calc(5px * var(--app-density-scale))',
    padding: '6px 9px',
    borderRadius: 999,
    border: '1px solid var(--line)',
    background: 'var(--bg-0)',
    color: 'var(--fg-1)',
    fontSize: 'calc(11.5px * var(--app-font-scale))',
    cursor: 'pointer'
  },
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
    fontSize: 'calc(12px * var(--app-font-scale))'
  },
  suggestions: {
    display: 'flex',
    gap: 'calc(8px * var(--app-density-scale))',
    overflowX: 'auto',
    padding: '8px clamp(18px, 4vw, 56px) 0'
  },
  suggestionChip: {
    padding: '8px 11px',
    borderRadius: 999,
    background: 'var(--bg-2)',
    border: '1px solid var(--line)',
    color: 'var(--fg-1)',
    fontSize: 'calc(12px * var(--app-font-scale))'
  },
  actionChips: {
    display: 'flex',
    gap: 'calc(8px * var(--app-density-scale))',
    overflowX: 'auto',
    padding: '10px clamp(18px, 4vw, 56px) 0',
    borderTop: '1px solid var(--line)'
  },
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
    whiteSpace: 'nowrap'
  },
  actionResult: {
    marginTop: 'calc(12px * var(--app-density-scale))',
    padding: 'calc(12px * var(--app-density-scale))',
    borderRadius: 8,
    background: 'var(--bg-2)',
    border: '1px solid var(--line)'
  },
  actionResultTitle: {
    fontSize: 'calc(11px * var(--app-font-scale))',
    color: 'var(--accent)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginBottom: 'calc(5px * var(--app-density-scale))'
  },
  actionResultText: {
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    lineHeight: 1.5,
    color: 'var(--fg-1)'
  },
  quizOptions: {
    display: 'grid',
    gap: 'calc(6px * var(--app-density-scale))',
    marginTop: 'calc(9px * var(--app-density-scale))'
  },
  quizOption: {
    display: 'flex',
    gap: 'calc(8px * var(--app-density-scale))',
    alignItems: 'flex-start',
    padding: '7px 8px',
    borderRadius: 7,
    background: 'var(--bg-1)',
    border: '1px solid var(--line)',
    color: 'var(--fg-1)',
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    textAlign: 'left'
  },
  quizOptionCorrect: {
    borderColor: 'var(--ok)',
    background: 'color-mix(in srgb, var(--ok) 9%, var(--bg-1))'
  },
  quizOptionWrong: {
    borderColor: 'var(--err)',
    background: 'color-mix(in srgb, var(--err) 9%, var(--bg-1))'
  },
  quizDetails: {
    marginTop: 'calc(9px * var(--app-density-scale))',
    color: 'var(--fg-1)',
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    lineHeight: 1.5
  },
  composerWrap: {
    padding: '14px clamp(18px, 4vw, 56px) 22px',
    background: 'linear-gradient(180deg, transparent, var(--bg-0) 24%)'
  },
  composer: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 'calc(8px * var(--app-density-scale))',
    padding: 'calc(8px * var(--app-density-scale))',
    background: 'var(--bg-1)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--r-md)'
  },
  iconButton: {
    width: 36,
    height: 36,
    padding: 0,
    opacity: 0.55
  },
  iconButtonListening: {
    opacity: 1,
    color: 'var(--accent)',
    borderColor: 'var(--accent-soft)',
    background: 'var(--accent-glow)',
    animation: 'glowPulse 1.2s ease-in-out infinite'
  },
  iconButtonDisabled: {
    opacity: 0.32,
    cursor: 'not-allowed'
  },
  textarea: {
    flex: 1,
    resize: 'none',
    border: 0,
    outline: 'none',
    background: 'transparent',
    color: 'var(--fg-0)',
    fontSize: 'calc(13.5px * var(--app-font-scale))',
    lineHeight: 1.5,
    minHeight: 36,
    maxHeight: 140,
    padding: '8px 4px'
  },
  sendButton: {
    minHeight: 36
  },
  error: {
    marginBottom: 'calc(8px * var(--app-density-scale))',
    color: 'var(--err)',
    fontSize: 'calc(12.5px * var(--app-font-scale))'
  },
  speechHint: {
    marginBottom: 'calc(8px * var(--app-density-scale))',
    color: 'var(--warn)',
    fontSize: 'calc(12.5px * var(--app-font-scale))'
  },
  rail: {
    borderLeft: '1px solid var(--line)',
    background: 'var(--bg-0)',
    minWidth: 0,
    overflow: 'hidden',
    transition: 'opacity 180ms var(--ease-out)'
  },
  railNarrow: {
    position: 'fixed',
    inset: '96px 12px 16px',
    zIndex: 20,
    border: '1px solid var(--line)',
    borderRadius: 'var(--r-md)',
    boxShadow: '0 24px 80px rgba(0,0,0,0.22)'
  },
  railHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 'calc(10px * var(--app-density-scale))',
    padding: 'calc(16px * var(--app-density-scale))',
    borderBottom: '1px solid var(--line)'
  },
  railTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 'calc(20px * var(--app-font-scale))',
    color: 'var(--fg-0)'
  },
  railBody: {
    height: 'calc(100vh - 143px)',
    overflow: 'auto',
    padding: 'calc(16px * var(--app-density-scale))'
  },
  badge: {
    padding: '4px 7px',
    borderRadius: 999,
    border: '1px solid var(--line)',
    fontSize: 'calc(10.5px * var(--app-font-scale))',
    whiteSpace: 'nowrap'
  },
  emptyRail: {
    color: 'var(--fg-3)',
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    lineHeight: 1.6,
    padding: 'calc(12px * var(--app-density-scale))',
    border: '1px dashed var(--line)',
    borderRadius: 8
  },
  materialVisuals: {
    marginTop: 'calc(8px * var(--app-density-scale))',
    marginBottom: 'calc(12px * var(--app-density-scale))'
  },
  materialVisualsLabel: {
    fontSize: 'calc(10.5px * var(--app-font-scale))',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--fg-3)',
    marginBottom: 'calc(8px * var(--app-density-scale))'
  },
  materialVisualFigure: {
    margin: '0 0 10px',
    border: '1px solid var(--line)',
    borderRadius: 8,
    background: 'var(--bg-1)',
    padding: 'calc(8px * var(--app-density-scale))'
  },
  materialVisualImg: {
    width: '100%',
    height: 'auto',
    display: 'block',
    borderRadius: 6,
    background: 'var(--bg-0)'
  },
  materialVisualLoading: {
    padding: 'calc(16px * var(--app-density-scale))',
    textAlign: 'center',
    color: 'var(--fg-3)',
    fontSize: 'calc(11.5px * var(--app-font-scale))'
  },
  materialVisualCaption: {
    margin: '6px 0 0',
    fontSize: 'calc(11px * var(--app-font-scale))',
    color: 'var(--fg-3)',
    lineHeight: 1.4
  },
  sourceCard: {
    padding: 'calc(12px * var(--app-density-scale))',
    border: '1px solid var(--line)',
    borderRadius: 8,
    background: 'var(--bg-1)',
    marginBottom: 'calc(12px * var(--app-density-scale))'
  },
  sourceCardActive: {
    borderColor: 'var(--accent)',
    boxShadow: '0 0 0 3px var(--accent-glow)'
  },
  sourceTopline: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'calc(8px * var(--app-density-scale))',
    marginBottom: 'calc(5px * var(--app-density-scale))'
  },
  sourceKicker: {
    fontSize: 'calc(10.5px * var(--app-font-scale))',
    color: 'var(--accent)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginBottom: 'calc(5px * var(--app-density-scale))'
  },
  sourceScore: {
    fontSize: 'calc(10.5px * var(--app-font-scale))',
    color: 'var(--fg-3)',
    fontVariantNumeric: 'tabular-nums'
  },
  sourceTitle: {
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    color: 'var(--fg-0)',
    marginBottom: 'calc(6px * var(--app-density-scale))',
    fontWeight: 600
  },
  sourceExcerpt: {
    color: 'var(--fg-2)',
    fontSize: 'calc(12.2px * var(--app-font-scale))',
    lineHeight: 1.55
  },
  scoreBar: {
    marginTop: 'calc(10px * var(--app-density-scale))',
    height: 4,
    background: 'var(--bg-2)',
    borderRadius: 999,
    overflow: 'hidden'
  },
  scoreFill: {
    display: 'block',
    height: '100%',
    background: 'var(--accent)'
  },
  sourceLink: {
    marginTop: 'calc(10px * var(--app-density-scale))',
    padding: 0,
    border: 0,
    background: 'transparent',
    color: 'var(--accent)',
    fontSize: 'calc(11.5px * var(--app-font-scale))',
    cursor: 'pointer'
  },
  traceBox: {
    marginTop: 'calc(14px * var(--app-density-scale))',
    padding: 'calc(12px * var(--app-density-scale))',
    border: '1px solid var(--line)',
    borderRadius: 8,
    background: 'var(--bg-1)'
  },
  tracePair: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 'calc(10px * var(--app-density-scale))',
    padding: '6px 0',
    color: 'var(--fg-2)',
    fontSize: 'calc(12px * var(--app-font-scale))'
  },
  loadingLine: {
    height: 9,
    borderRadius: 999,
    background: 'var(--bg-2)',
    border: '1px solid var(--line)',
    margin: '7px 0',
    animation: 'glowPulse 1.4s ease-in-out infinite'
  },
  typingBubble: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'calc(9px * var(--app-density-scale))',
    width: 'auto'
  },
  typingLabel: {
    color: 'var(--fg-2)',
    fontSize: 'calc(12.5px * var(--app-font-scale))'
  },
  typingDots: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'calc(3px * var(--app-density-scale))'
  }
};
window.TutorChat = TutorChat;
})();


// ---- components/TutorHome.jsx ----
(function () {
  window.__NOESIS_BOOT.files.push("components/TutorHome.jsx");
const TutorHome = ({
  onNav
}) => {
  const Icon = window.Icon;
  const [mode, setMode] = React.useState(null);
  const [chatConversationId, setChatConversationId] = React.useState(null);
  const [conversations, setConversations] = React.useState([]);
  const [loadingConversations, setLoadingConversations] = React.useState(true);
  const [conversationError, setConversationError] = React.useState('');
  React.useEffect(() => {
    let alive = true;
    setLoadingConversations(true);
    window.NoesisAPI.tutor.chatConversations().then(d => {
      if (!alive) return;
      const list = Array.isArray(d) ? d : Array.isArray(d.conversations) ? d.conversations : [];
      setConversations(list);
    }).catch(e => {
      if (!alive) return;
      setConversationError(e.message || 'Could not load recent chats.');
    }).finally(() => {
      if (alive) setLoadingConversations(false);
    });
    return () => {
      alive = false;
    };
  }, []);
  const choose = next => {
    if (next !== 'chat') setChatConversationId(null);
    setMode(next);
  };
  const openChat = (conversationId = null) => {
    setChatConversationId(conversationId || null);
    setMode('chat');
  };
  if (mode === 'guided') return React.createElement(window.Tutor, {
    onNav: onNav
  });
  if (mode === 'chat') return React.createElement(window.TutorChat, {
    onNav: onNav,
    onMode: choose,
    initialConversationId: chatConversationId
  });
  const recent = conversations.slice(0, 4);
  const lastConversation = recent[0];
  return React.createElement("div", {
    style: th.page
  }, React.createElement(window.Topbar, {
    title: "AI Tutor",
    crumbs: ['Workspace']
  }), React.createElement("main", {
    style: th.main
  }, React.createElement("section", {
    style: th.hero
  }, React.createElement("div", {
    style: th.avatar
  }, React.createElement(Icon.Sparkle, {
    size: 28
  })), React.createElement("div", null, React.createElement("div", {
    style: th.kicker
  }, "Choose a tutor mode"), React.createElement("h1", {
    style: th.title
  }, "Learn with structure or ask freely"), React.createElement("p", {
    style: th.copy
  }, "Keep the guided Socratic session for step-by-step practice, or open a grounded chat for direct questions about your materials."), lastConversation && React.createElement("button", {
    style: th.continueButton,
    onClick: () => openChat(lastConversation.id)
  }, React.createElement(Icon.Play, {
    size: 13
  }), "Continue last chat"))), React.createElement("div", {
    style: th.grid
  }, React.createElement(ModeCard, {
    icon: React.createElement(Icon.Target, {
      size: 22
    }),
    title: "Guided Session",
    desc: "A focused five-step tutor flow with warmup, intuition, trick, formalization, and practice.",
    action: "Start guided",
    onClick: () => choose('guided')
  }), React.createElement(ModeCard, {
    icon: React.createElement(Icon.Send, {
      size: 22
    }),
    title: "Free Chat",
    desc: "Ask questions in your own words and get grounded answers with source excerpts from your uploaded material.",
    action: "Open chat",
    accent: true,
    onClick: () => openChat(null)
  })), React.createElement("section", {
    style: th.recentPanel
  }, React.createElement("div", {
    style: th.recentHeader
  }, React.createElement("div", null, React.createElement("div", {
    style: th.kicker
  }, "Recent free chats"), React.createElement("div", {
    style: th.recentTitle
  }, "Pick up where you left off")), React.createElement("button", {
    className: "btn btn-bare",
    onClick: () => openChat(null)
  }, React.createElement(Icon.Plus, {
    size: 12
  }), " New chat")), loadingConversations ? React.createElement("div", {
    style: th.recentEmpty
  }, "Loading recent chats...") : conversationError ? React.createElement("div", {
    style: th.recentEmpty
  }, conversationError) : recent.length === 0 ? React.createElement("div", {
    style: th.recentEmpty
  }, "Your grounded chat history will appear here after the first conversation.") : React.createElement("div", {
    style: th.recentList
  }, recent.map(c => React.createElement("button", {
    key: c.id,
    style: th.recentItem,
    onClick: () => openChat(c.id)
  }, React.createElement("div", {
    style: th.recentItemMain
  }, React.createElement("div", {
    style: th.recentItemTitle
  }, c.title || 'Tutor chat'), React.createElement("div", {
    style: th.recentItemMeta
  }, c.material_title || 'Core tutor corpus', " \xB7 ", c.message_count || 0, " messages")), React.createElement("div", {
    style: th.recentTime
  }, relativeHomeTime(c.updated_at || c.created_at)), React.createElement(Icon.ArrowRight, {
    size: 13
  })))))));
};
const ModeCard = ({
  icon,
  title,
  desc,
  action,
  accent,
  onClick
}) => React.createElement("button", {
  onClick: onClick,
  style: {
    ...th.card,
    ...(accent ? th.cardAccent : {})
  }
}, React.createElement("div", {
  style: {
    ...th.cardIcon,
    ...(accent ? th.cardIconAccent : {})
  }
}, icon), React.createElement("div", {
  style: th.cardTitle
}, title), React.createElement("div", {
  style: th.cardDesc
}, desc), React.createElement("div", {
  style: th.cardAction
}, action, " ", React.createElement(window.Icon.ArrowRight, {
  size: 13
})));
const th = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg-0)',
    color: 'var(--fg-0)'
  },
  main: {
    padding: '36px clamp(22px, 5vw, 72px)',
    maxWidth: 1120,
    margin: '0 auto'
  },
  hero: {
    display: 'grid',
    gridTemplateColumns: '76px 1fr',
    gap: 'calc(18px * var(--app-density-scale))',
    alignItems: 'center',
    marginBottom: 'calc(24px * var(--app-density-scale))'
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--accent-glow)',
    border: '1px solid var(--accent-soft)',
    color: 'var(--accent)'
  },
  kicker: {
    fontSize: 'calc(11px * var(--app-font-scale))',
    letterSpacing: '0.12em',
    color: 'var(--fg-3)',
    textTransform: 'uppercase',
    marginBottom: 'calc(6px * var(--app-density-scale))'
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(calc(34px * var(--app-font-scale)), 5vw, calc(58px * var(--app-font-scale)))',
    fontWeight: 300,
    letterSpacing: 0
  },
  copy: {
    margin: '10px 0 0',
    maxWidth: 680,
    color: 'var(--fg-2)',
    fontSize: 'calc(15px * var(--app-font-scale))',
    lineHeight: 1.7
  },
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
    fontWeight: 600
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 'calc(16px * var(--app-density-scale))'
  },
  card: {
    minHeight: 260,
    padding: 'calc(22px * var(--app-density-scale))',
    textAlign: 'left',
    borderRadius: 'var(--r-md)',
    background: 'var(--bg-1)',
    border: '1px solid var(--line)',
    color: 'var(--fg-1)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 'calc(12px * var(--app-density-scale))',
    transition: 'transform 180ms var(--ease-out), border-color 180ms var(--ease-out), background 180ms var(--ease-out)'
  },
  cardAccent: {
    borderColor: 'var(--accent-soft)',
    background: 'linear-gradient(180deg, var(--accent-glow), var(--bg-1) 58%)'
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-2)',
    border: '1px solid var(--line)',
    color: 'var(--fg-1)'
  },
  cardIconAccent: {
    color: 'var(--accent)',
    borderColor: 'var(--accent-soft)',
    background: 'var(--accent-glow)'
  },
  cardTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 'calc(26px * var(--app-font-scale))',
    color: 'var(--fg-0)'
  },
  cardDesc: {
    color: 'var(--fg-2)',
    fontSize: 'calc(13.5px * var(--app-font-scale))',
    lineHeight: 1.65,
    maxWidth: 420
  },
  cardAction: {
    marginTop: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(6px * var(--app-density-scale))',
    color: 'var(--accent)',
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    fontWeight: 600
  },
  recentPanel: {
    marginTop: 'calc(18px * var(--app-density-scale))',
    border: '1px solid var(--line)',
    borderRadius: 'var(--r-md)',
    background: 'var(--bg-1)',
    overflow: 'hidden'
  },
  recentHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'calc(12px * var(--app-density-scale))',
    padding: 'calc(16px * var(--app-density-scale))',
    borderBottom: '1px solid var(--line)'
  },
  recentTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 'calc(22px * var(--app-font-scale))',
    color: 'var(--fg-0)'
  },
  recentList: {
    display: 'grid'
  },
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
    textAlign: 'left'
  },
  recentItemMain: {
    minWidth: 0
  },
  recentItemTitle: {
    color: 'var(--fg-0)',
    fontSize: 'calc(13.5px * var(--app-font-scale))',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  recentItemMeta: {
    color: 'var(--fg-3)',
    fontSize: 'calc(12px * var(--app-font-scale))',
    marginTop: 'calc(3px * var(--app-density-scale))',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  recentTime: {
    color: 'var(--fg-3)',
    fontSize: 'calc(11.5px * var(--app-font-scale))',
    whiteSpace: 'nowrap'
  },
  recentEmpty: {
    padding: 'calc(16px * var(--app-density-scale))',
    color: 'var(--fg-3)',
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    lineHeight: 1.6
  }
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
})();


// ---- components/LearningMap.jsx ----
(function () {
  window.__NOESIS_BOOT.files.push("components/LearningMap.jsx");
const TopicVisual = ({
  template = 'learning_map',
  data = {},
  code = null,
  compact = false
}) => {
  const nodes = (data.nodes || []).map(n => typeof n === 'string' ? n : n.label || n.name || n.id || '').filter(Boolean);
  const resolved = resolveTopicVisual(template || data.type, `${nodes.join(' ')} ${code && code.content || ''}`);
  if (resolved === 'polymorphism_dispatch') return React.createElement(DispatchVisual, {
    compact: compact
  });
  if (resolved === 'encapsulation_boundary') return React.createElement(EncapsulationVisual, {
    nodes: nodes,
    compact: compact
  });
  if (resolved === 'class_object' || resolved === 'inheritance_uml') return React.createElement(UmlVisual, {
    nodes: nodes,
    compact: compact
  });
  if (resolved === 'linked_list_operation') return React.createElement(LinkedListVisual, {
    compact: compact
  });
  if (resolved === 'hash_table_operation') return React.createElement(HashTableVisual, {
    compact: compact,
    nodes: nodes
  });
  if (resolved === 'stack_operation') return React.createElement(StackVisual, {
    compact: compact
  });
  if (resolved === 'queue_operation') return React.createElement(QueueVisual, {
    compact: compact
  });
  if (resolved === 'tree_visual') return React.createElement(TreeVisual, {
    compact: compact
  });
  if (resolved === 'big_o_growth') return React.createElement(BigOVisual, {
    compact: compact
  });
  if (resolved === 'code_walkthrough' || code) return React.createElement(CodeVisual, {
    code: code,
    compact: compact
  });
  if (resolved === 'no_visual') return React.createElement(NoVisualPreview, {
    compact: compact
  });
  if (['source_page_reference', 'source_slide_reference'].includes(resolved)) {
    return React.createElement(SourceReferencePreview, {
      data: data,
      compact: compact
    });
  }
  if (['concept_cards', 'classification_table', 'comparison_table'].includes(resolved)) {
    return React.createElement(MiniMindmap, {
      nodes: nodes.length ? nodes : ['Source concept', 'Supporting detail', 'Review question'],
      compact: compact
    });
  }
  if (['concept_map', 'learning_objectives', 'summary_path', 'process_flow', 'comparison_contrast'].includes(resolved)) {
    return React.createElement(MiniMindmap, {
      nodes: nodes.length ? nodes : ['Start', 'Prerequisites', 'Core idea', 'Example', 'Practice'],
      compact: compact
    });
  }
  return React.createElement(UnsupportedTopicVisual, {
    visualType: template || data.type || 'missing',
    compact: compact
  });
};
const SourceReferencePreview = ({
  data = {},
  compact = false
}) => {
  const candidateId = data.sourceVisualId || data.source_visual_id;
  const materialId = data.materialId || data.material_id;
  const directUrl = data.imageUrl || data.image_url || '';
  const hasImage = !!(directUrl || data.imagePath || data.image_path);
  const [url, setUrl] = React.useState(directUrl);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    if (directUrl || !hasImage || !candidateId || !materialId || !window.NoesisAPI) return undefined;
    let active = true;
    let objUrl = '';
    (async () => {
      try {
        objUrl = await window.NoesisAPI.materials.sourceVisualImageBlobUrl(materialId, candidateId);
        if (active) setUrl(objUrl);else URL.revokeObjectURL(objUrl);
      } catch (_) {
        if (active) setFailed(true);
      }
    })();
    return () => {
      active = false;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [candidateId, materialId, directUrl, hasImage]);
  if (!hasImage || failed) return React.createElement(NoVisualPreview, {
    compact: compact
  });
  const caption = data.caption || data.sourceImageCaption || 'Source visual';
  return React.createElement("div", {
    style: {
      width: '100%',
      height: compact ? 180 : 230,
      borderRadius: 12,
      border: '1px solid rgba(148, 163, 184, 0.45)',
      background: '#f8fafc',
      overflow: 'hidden',
      display: 'grid',
      gridTemplateRows: '1fr auto'
    }
  }, url ? React.createElement("img", {
    src: url,
    alt: caption,
    onError: () => setFailed(true),
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'contain',
      minHeight: 0
    }
  }) : React.createElement("div", {
    style: {
      display: 'grid',
      placeItems: 'center',
      color: '#475569',
      fontSize: compact ? 12 : 14
    }
  }, "Loading source visual..."), React.createElement("div", {
    style: {
      padding: '6px 10px',
      color: '#334155',
      fontSize: compact ? 11 : 12,
      fontWeight: 700,
      borderTop: '1px solid rgba(148, 163, 184, 0.35)'
    }
  }, caption));
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
  concept_cards: ['cards', 'study_cards', 'source_cards'],
  classification_table: ['table', 'classification', 'source_table'],
  comparison_table: ['compare_table', 'comparison_table'],
  source_page_reference: ['source_page', 'page_reference', 'source_page_image', 'source_diagram'],
  source_slide_reference: ['source_slide', 'slide_reference', 'source_slide_image'],
  no_visual: ['none', 'no_visual', 'text_only', 'source_text'],
  learning_objectives: ['objectives'],
  summary_path: ['summary', 'recap', 'summary_visual'],
  concept_map: ['mindmap', 'mind_map', 'learning_map']
};
const TOPIC_VISUAL_ALIASES = Object.entries(TOPIC_VISUALS).reduce((acc, [canonical, aliases]) => {
  acc[canonical] = canonical;
  aliases.forEach(alias => {
    acc[alias] = canonical;
  });
  return acc;
}, {});
function resolveTopicVisual(value, context = '') {
  const key = visualKey(value);
  if (key === 'stack_queue') return /\bqueue|fifo|enqueue|dequeue|front|rear\b/i.test(context) ? 'queue_operation' : 'stack_operation';
  return TOPIC_VISUAL_ALIASES[key] || '';
}
function wrapSvgLabel(value, maxChars = 16, maxLines = 2) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return [''];
  const words = text.split(' ');
  const lines = [];
  let current = '';
  const pushCurrent = () => {
    if (current) {
      lines.push(current);
      current = '';
    }
  };
  for (const word of words) {
    if (word.length > maxChars) {
      pushCurrent();
      const clipped = word.slice(0, Math.max(3, maxChars - 1));
      lines.push(lines.length === maxLines - 1 ? `${clipped}...` : clipped);
      if (lines.length >= maxLines) break;
      continue;
    }
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars) {
      pushCurrent();
      current = word;
    } else {
      current = next;
    }
    if (lines.length >= maxLines) break;
  }
  if (lines.length < maxLines) pushCurrent();
  if (lines.length > maxLines) lines.length = maxLines;
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, Math.max(3, maxChars - 3)).trim()}...`;
  }
  return lines.length ? lines : [''];
}
const SvgTextLines = ({
  x,
  y,
  text,
  width = 120,
  fontSize = 13,
  lineHeight = 15,
  fontWeight = 700,
  fill = '#111827',
  anchor = 'middle',
  maxLines = 2
}) => {
  const maxChars = Math.max(6, Math.floor(width / Math.max(6, fontSize * 0.58)));
  const lines = wrapSvgLabel(text, maxChars, maxLines);
  const startY = y - (lines.length - 1) * lineHeight / 2;
  return React.createElement("text", {
    textAnchor: anchor,
    fontSize: fontSize,
    fontWeight: fontWeight,
    fill: fill
  }, lines.map((line, index) => React.createElement("tspan", {
    key: `${line}-${index}`,
    x: x,
    y: startY + index * lineHeight
  }, line)));
};
function nodeColor(n) {
  if (n.type === 'weak' || n.status === 'weak') return 'var(--err)';
  if (n.status === 'mastered') return 'var(--ok)';
  if (n.type === 'recommended' || n.type === 'root') return 'var(--accent)';
  if (n.status === 'in_progress') return 'var(--warn)';
  return 'var(--fg-3)';
}
function collectVisible(node, expandedSet, depth, list) {
  list.push({
    node: node,
    depth: depth
  });
  if (depth === 0 || expandedSet[node.id]) {
    (node.children || []).forEach(function (c) {
      collectVisible(c, expandedSet, depth + 1, list);
    });
  }
  return list;
}
function layoutTree(root, expandedSet, cfg) {
  if (!root) return {
    positions: new Map(),
    edges: [],
    bounds: {
      w: 0,
      h: 0
    }
  };
  var canvasW = cfg.canvasWidth || 300;
  var nh = cfg.nodeHeight;
  var lg = cfg.levelGap;
  var topPad = cfg.topPad || 28;
  var rowGap = cfg.rowGap || 12;
  var childRowGap = cfg.childRowGap || rowGap;
  var leftPad = cfg.leftPad || 14;
  var laneGap = cfg.laneGap || 10;
  var branchW = cfg.branchWidth || Math.max(118, Math.floor(canvasW * 0.32));
  var childW = cfg.childWidth || Math.max(104, Math.floor(canvasW * 0.22));
  var positions = new Map();
  var edges = [];
  var maxY = 0;
  function nodeId(node) {
    return node.id || normalizeMapId(node.label);
  }
  function nodeHeight(depth) {
    return depth === 0 ? nh + 10 : depth >= 2 ? Math.max(34, nh - 6) : nh;
  }
  function visibleChildren(node, depth) {
    if (depth === 0) return node.children || [];
    return expandedSet[nodeId(node)] ? node.children || [] : [];
  }
  function collectLaneItems(node, depth, parentId, out) {
    var children = visibleChildren(node, depth);
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      var childId = nodeId(child);
      out.push({
        node: child,
        id: childId,
        depth: depth + 1,
        parentId: parentId
      });
      collectLaneItems(child, depth + 1, childId, out);
    }
    return out;
  }
  function setPosition(node, depth, x, y, w, h, parentId) {
    var id = nodeId(node);
    positions.set(id, {
      x: x,
      y: y,
      w: w,
      h: h,
      cx: x + w / 2,
      depth: depth,
      node: node
    });
    if (parentId) edges.push({
      from: parentId,
      to: id
    });
    maxY = Math.max(maxY, y + h);
    return id;
  }
  function placeBranchRow(branch, y, rootId) {
    var branchH = nodeHeight(1);
    var branchId = setPosition(branch, 1, leftPad, y, branchW, branchH, rootId);
    var lane = collectLaneItems(branch, 1, branchId, []);
    var laneStartX = leftPad + branchW + laneGap;
    var available = canvasW - laneStartX - leftPad;
    var childH = nodeHeight(2);
    if (available < childW) {
      laneStartX = leftPad + 18;
      available = canvasW - laneStartX - leftPad;
      y += branchH + childRowGap;
    }
    var perRow = Math.max(1, Math.floor((available + laneGap) / (childW + laneGap)));
    for (var i = 0; i < lane.length; i++) {
      var item = lane[i];
      var col = i % perRow;
      var row = Math.floor(i / perRow);
      var x = laneStartX + col * (childW + laneGap) + Math.max(0, item.depth - 2) * 8;
      var childWidth = Math.min(childW, Math.max(82, canvasW - x - leftPad));
      var childY = y + row * (childH + childRowGap);
      setPosition(item.node, item.depth, x, childY, childWidth, childH, item.parentId);
    }
    var childRows = lane.length ? Math.ceil(lane.length / perRow) : 0;
    var rowH = Math.max(branchH, childRows ? childRows * childH + (childRows - 1) * childRowGap : 0);
    return y + rowH + rowGap;
  }
  var rootY = topPad;
  var rootH = nodeHeight(0);
  var rootId = setPosition(root, 0, leftPad, rootY, Math.max(100, canvasW - leftPad * 2), rootH, null);
  var cursorY = rootY + rootH + lg;
  var branches = visibleChildren(root, 0);
  for (var i = 0; i < branches.length; i++) {
    cursorY = placeBranchRow(branches[i], cursorY, rootId);
  }
  var pad = cfg.pad || 28;
  return {
    positions: positions,
    edges: edges,
    bounds: {
      w: canvasW,
      h: Math.max(maxY + pad, cursorY + pad),
      ox: 0
    }
  };
}
function edgePath(pPos, cPos) {
  var sameRow = Math.abs(pPos.y + pPos.h / 2 - (cPos.y + cPos.h / 2)) < Math.max(pPos.h, cPos.h) * 0.65;
  if (sameRow && cPos.x > pPos.x) {
    var startX = pPos.x + pPos.w;
    var startY = pPos.y + pPos.h / 2;
    var endX = cPos.x;
    var endY = cPos.y + cPos.h / 2;
    var midX = startX + Math.max(10, (endX - startX) * 0.48);
    return 'M ' + startX + ' ' + startY + ' H ' + midX + ' V ' + endY + ' H ' + endX;
  }
  var sx = pPos.x + 12;
  var sy = pPos.y + pPos.h;
  var tx = cPos.x + 12;
  var ty = cPos.y;
  var midY = sy + Math.max(4, (ty - sy) * 0.45);
  return 'M ' + sx + ' ' + sy + ' V ' + midY + ' H ' + tx + ' V ' + ty;
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
    cx: pos.cx + dx
  };
}
function normalizeMapId(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function flattenTreeNodes(node, list) {
  list = list || [];
  if (!node) return list;
  list.push(node);
  (node.children || []).forEach(function (child) {
    flattenTreeNodes(child, list);
  });
  return list;
}
function buildTreeLookup(root) {
  var lookup = {};
  flattenTreeNodes(root).forEach(function (node) {
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
  (labels || []).forEach(function (label, i) {
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
const ExpandChevron = ({
  expanded
}) => React.createElement("svg", {
  viewBox: "0 0 16 16",
  width: "14",
  height: "14",
  "aria-hidden": "true",
  focusable: "false",
  style: {
    display: 'block'
  }
}, React.createElement("path", {
  d: expanded ? 'M4 6 L8 10 L12 6' : 'M6 4 L10 8 L6 12',
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}));
const LearningMap = ({
  map,
  onNode,
  compact = false,
  highlightNode
}) => {
  const m = map || {};
  const tree = m.tree || null;
  const nodes = m.nodes || [];
  const start = m.startHere || nodes[0] && nodes[0].label || 'Start here';
  const recPath = m.recommendedPath || [];
  const recSet = React.useMemo(function () {
    return buildRecommendedIndex(tree, recPath);
  }, [tree, recPath]);
  const startNodeId = React.useMemo(function () {
    return resolveTreeNodeId(tree, start);
  }, [tree, start]);
  const [expanded, setExpanded] = React.useState({});
  const toggleExpand = React.useCallback(function (nodeId, e) {
    if (e) e.stopPropagation();
    setExpanded(function (prev) {
      var next = {};
      for (var k in prev) next[k] = prev[k];
      next[nodeId] = !prev[nodeId];
      return next;
    });
  }, []);
  React.useEffect(function () {
    if (!highlightNode || !tree) return;
    var targetId = resolveTreeNodeId(tree, highlightNode);
    var path = findNodePath(tree, targetId, []);
    if (!path || path.length < 2) return;
    setExpanded(function (prev) {
      var next = {};
      for (var k in prev) next[k] = prev[k];
      path.forEach(function (id) {
        next[id] = true;
      });
      return next;
    });
  }, [highlightNode, tree]);
  var cfg = compact ? {
    nodeHeight: 36,
    levelGap: 18,
    rowGap: 12,
    childRowGap: 7,
    laneGap: 8,
    branchWidth: 120,
    childWidth: 104,
    leftPad: 8,
    topPad: 18,
    canvasWidth: 300,
    pad: 14
  } : {
    nodeHeight: 46,
    levelGap: 30,
    rowGap: 18,
    childRowGap: 10,
    laneGap: 12,
    branchWidth: 190,
    childWidth: 150,
    leftPad: 20,
    topPad: 28,
    canvasWidth: 700,
    pad: 28
  };
  var effectiveExpanded = expanded;
  var layout = React.useMemo(function () {
    return layoutTree(tree, effectiveExpanded, cfg);
  }, [tree, effectiveExpanded, compact]);
  var markerIds = React.useMemo(function () {
    var suffix = Math.random().toString(36).slice(2, 9);
    return {
      defaultId: 'lmArrow-' + suffix,
      accentId: 'lmArrowAccent-' + suffix
    };
  }, []);
  if (!tree) {
    return React.createElement("section", {
      style: {
        ...lm.shell,
        ...(compact ? lm.compactShell : {})
      }
    }, React.createElement("div", {
      style: lm.head
    }, React.createElement("div", null, React.createElement("div", {
      style: lm.eyebrow
    }, "Learning map"), React.createElement("h2", {
      style: lm.title
    }, m.rootTopic || 'Your path')), React.createElement("div", {
      style: lm.startBadge
    }, "Start here: ", React.createElement("b", null, start))), React.createElement("div", {
      style: lm.path
    }, recPath.slice(0, 7).map(function (p, i) {
      return React.createElement("span", {
        key: p + i,
        style: lm.pathChip
      }, i + 1, ". ", p);
    })), React.createElement("div", {
      style: lm.emptyMsg
    }, "Upload material and take a quiz to build your learning map."));
  }
  var pos = layout.positions;
  var edgeList = layout.edges;
  var bounds = layout.bounds;
  var nodeOffsetX = 0;
  var canvasW = Math.ceil(bounds.w);
  var canvasContentH = Math.ceil(Math.max(bounds.h, compact ? 170 : 320));
  var canvasViewportH = compact ? Math.min(300, canvasContentH) : Math.max(360, Math.min(canvasContentH, 760));
  var svgViewBox = '0 0 ' + canvasW + ' ' + canvasContentH;
  var highlightId = highlightNode ? resolveTreeNodeId(tree, highlightNode) : null;
  return React.createElement("section", {
    style: {
      ...lm.shell,
      ...(compact ? lm.compactShell : {})
    }
  }, React.createElement("div", {
    style: {
      ...lm.head,
      ...(compact ? lm.compactHead : {})
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: lm.eyebrow
  }, "Learning map"), React.createElement("h2", {
    style: {
      ...lm.title,
      ...(compact ? lm.compactTitle : {})
    }
  }, m.rootTopic || 'Your path')), React.createElement("div", {
    style: {
      ...lm.startBadge,
      ...(compact ? lm.compactStartBadge : {})
    }
  }, "Start here: ", React.createElement("b", null, start))), React.createElement("div", {
    style: {
      ...lm.path,
      ...(compact ? lm.compactPath : {})
    }
  }, recPath.slice(0, compact ? 4 : 7).map(function (p, i) {
    return React.createElement("span", {
      key: p + i,
      style: {
        ...lm.pathChip,
        ...(compact ? lm.compactPathChip : {})
      }
    }, i + 1, ". ", p);
  })), React.createElement("div", {
    style: {
      ...lm.canvas,
      ...(compact ? lm.compactCanvas : {}),
      height: canvasViewportH
    }
  }, React.createElement("div", {
    style: {
      ...lm.canvasInner,
      width: canvasW,
      height: canvasContentH
    }
  }, React.createElement("svg", {
    viewBox: svgViewBox,
    preserveAspectRatio: "xMidYMin meet",
    width: canvasW,
    height: canvasContentH,
    style: lm.edgeSvg
  }, React.createElement("defs", null, React.createElement("marker", {
    id: markerIds.defaultId,
    markerWidth: "8",
    markerHeight: "8",
    viewBox: "0 0 8 8",
    refX: "7",
    refY: "4",
    orient: "auto",
    markerUnits: "strokeWidth"
  }, React.createElement("path", {
    d: "M1,1 L7,4 L1,7",
    fill: "none",
    stroke: "var(--line-strong)",
    strokeWidth: "1.3",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })), React.createElement("marker", {
    id: markerIds.accentId,
    markerWidth: "8",
    markerHeight: "8",
    viewBox: "0 0 8 8",
    refX: "7",
    refY: "4",
    orient: "auto",
    markerUnits: "strokeWidth"
  }, React.createElement("path", {
    d: "M1,1 L7,4 L1,7",
    fill: "none",
    stroke: "var(--accent)",
    strokeWidth: "1.3",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), edgeList.map(function (e) {
    var fpRaw = pos.get(e.from);
    var tpRaw = pos.get(e.to);
    if (!fpRaw || !tpRaw) return null;
    var fp = offsetPosition(fpRaw, nodeOffsetX, 0);
    var tp = offsetPosition(tpRaw, nodeOffsetX, 0);
    var isRec = isRecommendedEdge(e.from, e.to, recSet);
    return React.createElement("path", {
      key: e.from + '-' + e.to,
      d: edgePath(fp, tp),
      fill: "none",
      stroke: isRec ? 'var(--accent)' : 'var(--line-strong)',
      strokeWidth: isRec ? 2.1 : 1.45,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeDasharray: isRec ? 'none' : '5 6',
      opacity: isRec ? 0.96 : 0.72,
      markerEnd: 'url(#' + (isRec ? markerIds.accentId : markerIds.defaultId) + ')'
    });
  })), React.createElement("div", {
    style: lm.nodeLayer
  }, Array.from(pos.entries()).map(function (entry) {
    var id = entry[0],
      p = offsetPosition(entry[1], nodeOffsetX, 0);
    var n = p.node;
    var nodeId = n.id || normalizeMapId(n.label);
    var depth = p.depth;
    var color = nodeColor(n);
    var hasCh = (n.children || []).length > 0;
    var isExp = effectiveExpanded[nodeId];
    var isHighlighted = highlightId && highlightId === nodeId;
    var recIdx = recSet[nodeId];
    var isPathNode = !!recIdx;
    var isStart = nodeId === startNodeId;
    if (depth === 0) {
      return React.createElement("div", {
        key: id,
        style: {
          ...lm.nodeWrap,
          position: 'absolute',
          left: p.x,
          top: p.y,
          width: p.w,
          height: p.h,
          pointerEvents: 'auto'
        }
      }, React.createElement("button", {
        onClick: function () {
          onNode && onNode(n);
        },
        style: {
          ...lm.rootNode,
          ...(compact ? lm.compactRootNode : {}),
          width: '100%',
          height: '100%',
          animation: isHighlighted || isPathNode ? 'glowPulse 2s infinite' : 'none',
          boxShadow: isHighlighted || isPathNode ? '0 0 0 2px var(--accent-soft), 0 12px 28px #00000026' : lm.rootNode.boxShadow
        }
      }, React.createElement("span", {
        style: {
          ...lm.rootLabel,
          fontSize: `calc(${compact ? 14 : 18}px * var(--app-font-scale))`
        }
      }, n.label), recIdx && React.createElement("span", {
        style: lm.recBadge
      }, recIdx), isStart && React.createElement("div", {
        style: lm.startTag
      }, "Start here >")));
    }
    if (depth === 1) {
      return React.createElement("div", {
        key: id,
        style: {
          ...lm.nodeWrap,
          position: 'absolute',
          left: p.x,
          top: p.y,
          width: p.w,
          height: p.h,
          pointerEvents: 'auto',
          animation: 'fadeIn 400ms ease both'
        }
      }, React.createElement("button", {
        onClick: function () {
          onNode && onNode(n);
        },
        style: {
          ...lm.branchNode,
          ...(compact ? lm.compactBranchNode : {}),
          borderLeftColor: color,
          borderColor: color,
          animation: isHighlighted || isPathNode ? 'glowPulse 2s infinite' : 'none',
          boxShadow: isHighlighted ? '0 0 0 2px var(--accent)' : isPathNode ? '0 0 0 2px var(--accent-soft), 0 8px 18px #00000016' : '0 2px 8px #00000011'
        }
      }, React.createElement("div", {
        style: lm.branchTop
      }, React.createElement("span", {
        style: {
          ...lm.dot,
          background: color
        }
      }), React.createElement("span", {
        style: {
          ...lm.branchTitle,
          fontSize: `calc(${compact ? 11.5 : 13}px * var(--app-font-scale))`
        }
      }, n.label), recIdx && React.createElement("span", {
        style: lm.recBadge
      }, recIdx), hasCh && React.createElement("span", {
        onClick: function (e) {
          toggleExpand(nodeId, e);
        },
        style: lm.chevron,
        title: isExp ? 'Collapse branch' : 'Expand branch',
        "aria-label": isExp ? 'Collapse branch' : 'Expand branch',
        role: "button"
      }, React.createElement(ExpandChevron, {
        expanded: !!isExp
      }), isExp ? '▼' : '▶')), !compact && React.createElement("div", {
        style: lm.branchBottom
      }, React.createElement("span", {
        style: {
          ...lm.statusChip,
          color: color
        }
      }, compactStatusLabel(n)), n.mastery > 0 && React.createElement("div", {
        style: lm.masteryBar,
        "aria-hidden": "true"
      }, React.createElement("div", {
        style: {
          ...lm.masteryFill,
          width: masteryLabel(n),
          background: color
        }
      })), n.mastery > 0 && React.createElement("span", {
        style: lm.masteryLabel
      }, masteryLabel(n))), isStart && React.createElement("div", {
        style: lm.startTag
      }, "Start here >")));
    }
    return React.createElement("div", {
      key: id,
      style: {
        ...lm.nodeWrap,
        position: 'absolute',
        left: p.x,
        top: p.y,
        width: p.w,
        height: p.h,
        pointerEvents: 'auto',
        animation: 'revealUp 350ms ease both'
      }
    }, React.createElement("button", {
      onClick: function () {
        onNode && onNode(n);
      },
      style: {
        ...lm.leafNode,
        borderColor: isHighlighted || isPathNode ? 'var(--accent)' : 'var(--line)',
        boxShadow: isHighlighted ? '0 0 0 2px var(--accent)' : isPathNode ? '0 0 0 2px var(--accent-soft)' : 'none',
        animation: isHighlighted || isPathNode ? 'glowPulse 2s infinite' : 'none'
      }
    }, React.createElement("span", {
      style: {
        ...lm.dot,
        background: color,
        width: 6,
        height: 6
      }
    }), React.createElement("span", {
      style: lm.leafTitle
    }, n.label), recIdx && React.createElement("span", {
      style: lm.recBadge
    }, recIdx), isStart && React.createElement("div", {
      style: lm.startTag
    }, "Start here >")));
  })))));
};
const MiniMindmap = ({
  nodes,
  compact
}) => React.createElement("div", {
  style: {
    ...tv.box,
    minHeight: compact ? 180 : 260
  }
}, React.createElement("svg", {
  viewBox: "0 0 640 260",
  style: tv.svg
}, React.createElement("rect", {
  x: "260",
  y: "98",
  width: "120",
  height: "64",
  rx: "18",
  fill: "#dbeafe",
  stroke: "#2563eb",
  strokeWidth: "2"
}), React.createElement(SvgTextLines, {
  x: 320,
  y: 132,
  width: 104,
  text: nodes[0] || 'Topic',
  fontSize: 14,
  lineHeight: 15,
  maxLines: 3,
  fill: "#0f172a"
}), nodes.slice(1, 7).map((n, i) => {
  const pts = [[70, 30], [455, 30], [70, 180], [455, 180], [240, 20], [270, 200]];
  const p = pts[i];
  return React.createElement("g", {
    key: n + i
  }, React.createElement("line", {
    x1: "320",
    y1: "130",
    x2: p[0] + 58,
    y2: p[1] + 28,
    stroke: "#94a3b8",
    strokeWidth: "2"
  }), React.createElement("rect", {
    x: p[0],
    y: p[1],
    width: "116",
    height: "56",
    rx: "16",
    fill: ['#dcfce7', '#fef3c7', '#fce7f3'][i % 3],
    stroke: "#94a3b8",
    strokeWidth: "1.5"
  }), React.createElement(SvgTextLines, {
    x: p[0] + 58,
    y: p[1] + 30,
    width: 100,
    text: n,
    fontSize: 12,
    lineHeight: 13,
    maxLines: 3
  }));
})));
const DispatchVisual = ({
  compact
}) => React.createElement("div", {
  style: {
    ...tv.box,
    minHeight: compact ? 180 : 260
  }
}, React.createElement("svg", {
  viewBox: "0 0 680 270",
  style: tv.svg
}, React.createElement(TextBox, {
  x: 40,
  y: 92,
  w: 150,
  h: 72,
  text: "Shape s",
  fill: "#dbeafe",
  stroke: "#2563eb"
}), React.createElement(TextBox, {
  x: 265,
  y: 38,
  w: 150,
  h: 72,
  text: "Circle object",
  fill: "#dcfce7",
  stroke: "#16a34a"
}), React.createElement(TextBox, {
  x: 265,
  y: 160,
  w: 170,
  h: 72,
  text: "Rectangle object",
  fill: "#dcfce7",
  stroke: "#16a34a"
}), React.createElement(TextBox, {
  x: 500,
  y: 38,
  w: 135,
  h: 72,
  text: "Circle.area()",
  fill: "#fee2e2",
  stroke: "#ef4444"
}), React.createElement(TextBox, {
  x: 500,
  y: 160,
  w: 155,
  h: 72,
  text: "Rectangle.area()",
  fill: "#fee2e2",
  stroke: "#ef4444"
}), React.createElement(Arrow, {
  x1: 190,
  y1: 128,
  x2: 265,
  y2: 74,
  label: "runtime"
}), React.createElement(Arrow, {
  x1: 415,
  y1: 74,
  x2: 500,
  y2: 74,
  label: "dispatch"
}), React.createElement(Arrow, {
  x1: 190,
  y1: 128,
  x2: 265,
  y2: 196,
  label: "reassign"
}), React.createElement(Arrow, {
  x1: 435,
  y1: 196,
  x2: 500,
  y2: 196,
  label: "dispatch"
})));
const EncapsulationVisual = ({
  nodes,
  compact
}) => {
  const className = nodes.find(n => /class|counter|account/i.test(n)) || 'Counter';
  const field = nodes.find(n => /private|field|count|balance/i.test(n)) || '- count: int';
  const method = nodes.find(n => /public|method|increment|get|set/i.test(n)) || '+ increment()';
  return React.createElement("div", {
    style: {
      ...tv.box,
      minHeight: compact ? 180 : 260
    }
  }, React.createElement("svg", {
    viewBox: "0 0 680 270",
    style: tv.svg
  }, React.createElement("rect", {
    x: "260",
    y: "34",
    width: "210",
    height: "190",
    rx: "22",
    fill: "#eff6ff",
    stroke: "#2563eb",
    strokeWidth: "3",
    strokeDasharray: "8 7"
  }), React.createElement(SvgTextLines, {
    x: 365,
    y: 62,
    width: 180,
    text: className,
    fontSize: 16,
    lineHeight: 17,
    fontWeight: 800,
    fill: "#0f172a",
    maxLines: 2
  }), React.createElement(TextBox, {
    x: 294,
    y: 88,
    w: 142,
    h: 42,
    text: field,
    fill: "#fef3c7",
    stroke: "#f59e0b"
  }), React.createElement(TextBox, {
    x: 294,
    y: 154,
    w: 142,
    h: 42,
    text: method,
    fill: "#dcfce7",
    stroke: "#16a34a"
  }), React.createElement(TextBox, {
    x: 40,
    y: 82,
    w: 150,
    h: 48,
    text: "client.count = -5",
    fill: "#fee2e2",
    stroke: "#ef4444"
  }), React.createElement(TextBox, {
    x: 40,
    y: 154,
    w: 150,
    h: 48,
    text: "client.increment()",
    fill: "#dcfce7",
    stroke: "#16a34a"
  }), React.createElement("line", {
    x1: "190",
    y1: "106",
    x2: "294",
    y2: "108",
    stroke: "#ef4444",
    strokeWidth: "4"
  }), React.createElement("line", {
    x1: "218",
    y1: "82",
    x2: "252",
    y2: "132",
    stroke: "#ef4444",
    strokeWidth: "6"
  }), React.createElement("line", {
    x1: "252",
    y1: "82",
    x2: "218",
    y2: "132",
    stroke: "#ef4444",
    strokeWidth: "6"
  }), React.createElement(Arrow, {
    x1: 190,
    y1: 178,
    x2: 294,
    y2: 176,
    label: "allowed"
  }), React.createElement(SvgTextLines, {
    x: 365,
    y: 250,
    width: 220,
    text: "private state, public API",
    fontSize: 14,
    lineHeight: 15,
    fill: "#475569",
    maxLines: 2
  })));
};
const UmlVisual = ({
  nodes,
  compact
}) => {
  const parent = nodes.find(n => /shape|parent|super/i.test(n)) || 'Shape';
  return React.createElement("div", {
    style: {
      ...tv.box,
      minHeight: compact ? 180 : 260
    }
  }, React.createElement("svg", {
    viewBox: "0 0 650 270",
    style: tv.svg
  }, React.createElement(ClassBox, {
    x: 245,
    y: 20,
    name: parent,
    rows: ['+ area()', '# shared state']
  }), React.createElement(ClassBox, {
    x: 95,
    y: 165,
    name: "Circle",
    rows: ['- radius', '+ area()']
  }), React.createElement(ClassBox, {
    x: 405,
    y: 165,
    name: "Rectangle",
    rows: ['- width', '- height', '+ area()']
  }), React.createElement(Arrow, {
    x1: 205,
    y1: 165,
    x2: 290,
    y2: 115,
    label: "extends"
  }), React.createElement(Arrow, {
    x1: 445,
    y1: 165,
    x2: 360,
    y2: 115,
    label: "extends"
  })));
};
const LinkedListVisual = ({
  compact
}) => React.createElement("div", {
  style: {
    ...tv.box,
    minHeight: compact ? 160 : 230
  }
}, React.createElement("svg", {
  viewBox: "0 0 700 230",
  style: tv.svg
}, React.createElement(TextBox, {
  x: 24,
  y: 92,
  w: 90,
  h: 48,
  text: "head",
  fill: "#fef3c7",
  stroke: "#f59e0b"
}), React.createElement(Node, {
  x: 160,
  y: 72,
  value: "10"
}), React.createElement(Node, {
  x: 340,
  y: 72,
  value: "20"
}), React.createElement(Node, {
  x: 520,
  y: 72,
  value: "30"
}), React.createElement(Arrow, {
  x1: 114,
  y1: 116,
  x2: 160,
  y2: 116
}), React.createElement(Arrow, {
  x1: 278,
  y1: 116,
  x2: 340,
  y2: 116
}), React.createElement(Arrow, {
  x1: 458,
  y1: 116,
  x2: 520,
  y2: 116
}), React.createElement(Arrow, {
  x1: 638,
  y1: 116,
  x2: 672,
  y2: 116
}), React.createElement("text", {
  x: "674",
  y: "121",
  fontSize: "15",
  fontWeight: "700",
  fill: "#111827"
}, "null")));
const HashTableVisual = ({
  compact,
  nodes = []
}) => {
  const key = nodes.find(n => /key/i.test(n)) || 'key "cat"';
  const hash = nodes.find(n => /hash/i.test(n)) || 'hash(key)';
  const index = nodes.find(n => /index|mod/i.test(n)) || 'index = hash mod m';
  const entries = nodes.filter(n => !/key|hash|index|mod|bucket|table|collision|resize/i.test(n)).slice(0, 2);
  const chain = entries.length ? entries : ['(cat, 41)', '(cot, 19)'];
  return React.createElement("div", {
    style: {
      ...tv.box,
      minHeight: compact ? 180 : 250
    }
  }, React.createElement("svg", {
    viewBox: "0 0 720 260",
    style: tv.svg
  }, React.createElement(TextBox, {
    x: 28,
    y: 24,
    w: 142,
    h: 54,
    text: key,
    fill: "#dbeafe",
    stroke: "#2563eb"
  }), React.createElement(TextBox, {
    x: 236,
    y: 24,
    w: 142,
    h: 54,
    text: hash,
    fill: "#dcfce7",
    stroke: "#16a34a"
  }), React.createElement(TextBox, {
    x: 444,
    y: 24,
    w: 170,
    h: 54,
    text: index,
    fill: "#fef3c7",
    stroke: "#f59e0b"
  }), React.createElement(Arrow, {
    x1: 170,
    y1: 51,
    x2: 236,
    y2: 51
  }), React.createElement(Arrow, {
    x1: 378,
    y1: 51,
    x2: 444,
    y2: 51
  }), [0, 1, 2, 3].map(i => React.createElement("g", {
    key: i
  }, React.createElement("rect", {
    x: "64",
    y: 104 + i * 34,
    width: "48",
    height: "26",
    rx: "7",
    fill: i === 2 ? '#dbeafe' : '#ffffff',
    stroke: i === 2 ? '#2563eb' : '#94a3b8',
    strokeWidth: "2"
  }), React.createElement("text", {
    x: "88",
    y: 123 + i * 34,
    textAnchor: "middle",
    fontSize: "13",
    fontWeight: "700"
  }, i), React.createElement("rect", {
    x: "122",
    y: 104 + i * 34,
    width: "120",
    height: "26",
    rx: "7",
    fill: i === 2 ? '#eff6ff' : '#ffffff',
    stroke: i === 2 ? '#2563eb' : '#cbd5e1',
    strokeWidth: "2"
  }), React.createElement("text", {
    x: "182",
    y: 123 + i * 34,
    textAnchor: "middle",
    fontSize: "12",
    fontWeight: "700"
  }, i === 2 ? 'bucket 2' : 'empty'))), React.createElement(Arrow, {
    x1: 242,
    y1: 181,
    x2: 330,
    y2: 181,
    label: "collision"
  }), chain.map((item, i) => React.createElement("g", {
    key: item + i
  }, React.createElement(TextBox, {
    x: 342 + i * 128,
    y: 150,
    w: 104,
    h: 58,
    text: item,
    fill: i === 0 ? '#dcfce7' : '#fee2e2',
    stroke: i === 0 ? '#16a34a' : '#ef4444'
  }), i < chain.length - 1 && React.createElement(Arrow, {
    x1: 446 + i * 128,
    y1: 179,
    x2: 470 + i * 128,
    y2: 179
  }))), React.createElement("text", {
    x: "360",
    y: "238",
    textAnchor: "middle",
    fontSize: "14",
    fontWeight: "700",
    fill: "#111827"
  }, "expected O(1), worst O(n), resize by load factor")));
};
const StackVisual = ({
  compact
}) => React.createElement("div", {
  style: {
    ...tv.box,
    minHeight: compact ? 170 : 250
  }
}, React.createElement("svg", {
  viewBox: "0 0 560 260",
  style: tv.svg
}, [0, 1, 2, 3].map(i => React.createElement("rect", {
  key: i,
  x: "220",
  y: 170 - i * 42,
  width: "120",
  height: "40",
  rx: "8",
  fill: i === 3 ? '#fee2e2' : '#dbeafe',
  stroke: i === 3 ? '#ef4444' : '#2563eb',
  strokeWidth: "2"
})), React.createElement("text", {
  x: "280",
  y: "50",
  textAnchor: "middle",
  fontSize: "18",
  fontWeight: "700",
  fill: "#111827"
}, "top"), React.createElement(Arrow, {
  x1: 140,
  y1: 38,
  x2: 220,
  y2: 64,
  label: "push"
}), React.createElement(Arrow, {
  x1: 340,
  y1: 64,
  x2: 430,
  y2: 38,
  label: "pop"
})));
const QueueVisual = ({
  compact
}) => React.createElement("div", {
  style: {
    ...tv.box,
    minHeight: compact ? 160 : 230
  }
}, React.createElement("svg", {
  viewBox: "0 0 700 230",
  style: tv.svg
}, [0, 1, 2, 3].map(i => React.createElement(TextBox, {
  key: i,
  x: 150 + i * 95,
  y: 88,
  w: 78,
  h: 54,
  text: String.fromCharCode(65 + i),
  fill: "#dbeafe",
  stroke: "#2563eb"
})), React.createElement("text", {
  x: "120",
  y: "82",
  fontSize: "17",
  fontWeight: "700",
  fill: "#ef4444"
}, "front"), React.createElement("text", {
  x: "520",
  y: "82",
  fontSize: "17",
  fontWeight: "700",
  fill: "#16a34a"
}, "rear"), React.createElement(Arrow, {
  x1: 50,
  y1: 115,
  x2: 150,
  y2: 115,
  label: "dequeue"
}), React.createElement(Arrow, {
  x1: 620,
  y1: 115,
  x2: 530,
  y2: 115,
  label: "enqueue"
})));
const TreeVisual = ({
  compact
}) => React.createElement("div", {
  style: {
    ...tv.box,
    minHeight: compact ? 180 : 260
  }
}, React.createElement("svg", {
  viewBox: "0 0 620 280",
  style: tv.svg
}, [[310, 35, '8'], [190, 125, '3'], [430, 125, '10'], [130, 215, '1'], [250, 215, '6'], [500, 215, '14']].map(([x, y, v]) => React.createElement("g", {
  key: v
}, React.createElement("circle", {
  cx: x,
  cy: y,
  r: "31",
  fill: "#dbeafe",
  stroke: "#2563eb",
  strokeWidth: "2"
}), React.createElement("text", {
  x: x,
  y: y + 6,
  textAnchor: "middle",
  fontSize: "18",
  fontWeight: "700"
}, v))), React.createElement("line", {
  x1: "292",
  y1: "60",
  x2: "210",
  y2: "100",
  stroke: "#94a3b8",
  strokeWidth: "2"
}), React.createElement("line", {
  x1: "328",
  y1: "60",
  x2: "410",
  y2: "100",
  stroke: "#94a3b8",
  strokeWidth: "2"
}), React.createElement("line", {
  x1: "178",
  y1: "150",
  x2: "140",
  y2: "190",
  stroke: "#94a3b8",
  strokeWidth: "2"
}), React.createElement("line", {
  x1: "202",
  y1: "150",
  x2: "238",
  y2: "190",
  stroke: "#94a3b8",
  strokeWidth: "2"
}), React.createElement("line", {
  x1: "445",
  y1: "150",
  x2: "490",
  y2: "190",
  stroke: "#94a3b8",
  strokeWidth: "2"
}), React.createElement("text", {
  x: "310",
  y: "18",
  textAnchor: "middle",
  fontSize: "14",
  fontWeight: "700",
  fill: "#16a34a"
}, "left smaller, right larger")));
const BigOVisual = ({
  compact
}) => React.createElement("div", {
  style: {
    ...tv.box,
    minHeight: compact ? 180 : 260
  }
}, React.createElement("svg", {
  viewBox: "0 0 620 280",
  style: tv.svg
}, React.createElement("line", {
  x1: "60",
  y1: "225",
  x2: "570",
  y2: "225",
  stroke: "#64748b",
  strokeWidth: "2"
}), React.createElement("line", {
  x1: "60",
  y1: "225",
  x2: "60",
  y2: "35",
  stroke: "#64748b",
  strokeWidth: "2"
}), React.createElement("path", {
  d: "M70 210 C190 208 390 205 560 200",
  fill: "none",
  stroke: "#16a34a",
  strokeWidth: "4"
}), React.createElement("text", {
  x: "475",
  y: "192",
  fontSize: "14",
  fontWeight: "700"
}, "O(1)"), React.createElement("path", {
  d: "M70 215 C190 190 390 125 560 65",
  fill: "none",
  stroke: "#2563eb",
  strokeWidth: "4"
}), React.createElement("text", {
  x: "500",
  y: "70",
  fontSize: "14",
  fontWeight: "700"
}, "O(n)"), React.createElement("path", {
  d: "M70 220 C230 215 380 170 560 40",
  fill: "none",
  stroke: "#ef4444",
  strokeWidth: "4"
}), React.createElement("text", {
  x: "500",
  y: "42",
  fontSize: "14",
  fontWeight: "700"
}, "O(n^2)")));
const CodeVisual = ({
  code,
  compact
}) => React.createElement("pre", {
  style: {
    ...tv.code,
    maxHeight: compact ? 180 : 260
  }
}, code && code.content || 'Code preview appears here.');
const NoVisualPreview = ({
  compact
}) => React.createElement("div", {
  style: {
    ...tv.box,
    minHeight: compact ? 120 : 180,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center'
  }
}, React.createElement("div", {
  style: {
    color: '#2563eb',
    fontSize: 'calc(12px * var(--app-font-scale))',
    fontWeight: 800,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginBottom: 'calc(8px * var(--app-density-scale))'
  }
}, "No diagram needed"), React.createElement("div", {
  style: {
    color: '#111827',
    fontSize: 'calc(16px * var(--app-font-scale))',
    fontWeight: 700
  }
}, "Source-led explanation"), React.createElement("p", {
  style: {
    color: '#64748b',
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    lineHeight: 1.45,
    margin: '8px 0 0'
  }
}, "This scene is clearer as narration, source text, or review cards."));
const UnsupportedTopicVisual = ({
  visualType,
  compact
}) => React.createElement("div", {
  style: {
    ...tv.box,
    minHeight: compact ? 160 : 230,
    borderColor: '#ef4444',
    background: '#fff1f2'
  }
}, React.createElement("div", {
  style: {
    color: '#991b1b',
    fontSize: 'calc(12px * var(--app-font-scale))',
    fontWeight: 800,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginBottom: 'calc(8px * var(--app-density-scale))'
  }
}, "Unsupported visual"), React.createElement("div", {
  style: {
    color: '#7f1d1d',
    fontSize: 'calc(18px * var(--app-font-scale))',
    fontWeight: 800
  }
}, String(visualType || 'missing')), React.createElement("p", {
  style: {
    color: '#7f1d1d',
    fontSize: 'calc(13px * var(--app-font-scale))',
    lineHeight: 1.45
  }
}, "Regenerate this scene with a supported concrete CS visual."));
const TextBox = ({
  x,
  y,
  w,
  h,
  text,
  fill,
  stroke
}) => React.createElement("g", null, React.createElement("rect", {
  x: x,
  y: y,
  width: w,
  height: h,
  rx: "14",
  fill: fill,
  stroke: stroke,
  strokeWidth: "2"
}), React.createElement(SvgTextLines, {
  x: x + w / 2,
  y: y + h / 2 + 4,
  width: Math.max(24, w - 16),
  text: text,
  fontSize: Math.min(15, Math.max(11, h / 3.5)),
  lineHeight: 14,
  maxLines: Math.max(1, Math.floor((h - 10) / 14))
}));
const ClassBox = ({
  x,
  y,
  name,
  rows
}) => React.createElement("g", null, React.createElement("rect", {
  x: x,
  y: y,
  width: "160",
  height: "96",
  rx: "10",
  fill: "#dbeafe",
  stroke: "#2563eb",
  strokeWidth: "2"
}), React.createElement(SvgTextLines, {
  x: x + 80,
  y: y + 21,
  width: 138,
  text: name,
  fontSize: 14,
  lineHeight: 14,
  maxLines: 2
}), React.createElement("line", {
  x1: x,
  y1: y + 34,
  x2: x + 160,
  y2: y + 34,
  stroke: "#2563eb",
  strokeWidth: "2"
}), rows.map((r, i) => React.createElement(SvgTextLines, {
  key: r,
  x: x + 14,
  y: y + 54 + i * 20,
  width: 132,
  text: r,
  fontSize: 12,
  lineHeight: 12,
  fontWeight: 600,
  anchor: "start",
  maxLines: 1
})));
const Node = ({
  x,
  y,
  value
}) => React.createElement("g", null, React.createElement("rect", {
  x: x,
  y: y,
  width: "118",
  height: "86",
  rx: "12",
  fill: "#dcfce7",
  stroke: "#16a34a",
  strokeWidth: "2"
}), React.createElement("line", {
  x1: x + 68,
  y1: y,
  x2: x + 68,
  y2: y + 86,
  stroke: "#16a34a",
  strokeWidth: "2"
}), React.createElement(SvgTextLines, {
  x: x + 34,
  y: y + 47,
  width: 54,
  text: value,
  fontSize: 16,
  lineHeight: 16,
  maxLines: 2
}), React.createElement(SvgTextLines, {
  x: x + 92,
  y: y + 47,
  width: 38,
  text: "next",
  fontSize: 12,
  lineHeight: 12,
  maxLines: 1
}));
const Arrow = ({
  x1,
  y1,
  x2,
  y2,
  label
}) => React.createElement("g", null, React.createElement("defs", null, React.createElement("marker", {
  id: "arrowHead",
  markerWidth: "8",
  markerHeight: "8",
  refX: "7",
  refY: "4",
  orient: "auto"
}, React.createElement("path", {
  d: "M0,0 L8,4 L0,8 Z",
  fill: "#ef4444"
}))), React.createElement("line", {
  x1: x1,
  y1: y1,
  x2: x2,
  y2: y2,
  stroke: "#ef4444",
  strokeWidth: "3",
  markerEnd: "url(#arrowHead)"
}), label && React.createElement(SvgTextLines, {
  x: (x1 + x2) / 2,
  y: (y1 + y2) / 2 - 8,
  width: 72,
  text: label,
  fontSize: 11,
  lineHeight: 11,
  maxLines: 2,
  fill: "#991b1b"
}));
const tv = {
  box: {
    border: '1px solid var(--line)',
    borderRadius: 8,
    background: 'var(--bg-0)',
    overflow: 'hidden',
    padding: 'calc(10px * var(--app-density-scale))'
  },
  svg: {
    width: '100%',
    height: '100%',
    minHeight: 160,
    display: 'block'
  },
  code: {
    background: '#0f172a',
    color: '#dbeafe',
    border: '1px solid #38bdf8',
    borderRadius: 8,
    padding: 'calc(16px * var(--app-density-scale))',
    overflow: 'auto',
    fontFamily: 'var(--font-mono)',
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    lineHeight: 1.55
  }
};
const lm = {
  shell: {
    border: '1px solid var(--line)',
    borderRadius: 'var(--r-md)',
    background: 'var(--bg-1)',
    padding: 'calc(18px * var(--app-density-scale))',
    overflow: 'visible'
  },
  compactShell: {
    padding: 'calc(12px * var(--app-density-scale))'
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'calc(14px * var(--app-density-scale))',
    flexWrap: 'wrap'
  },
  compactHead: {
    gap: 'calc(8px * var(--app-density-scale))'
  },
  eyebrow: {
    fontSize: 'calc(10.5px * var(--app-font-scale))',
    color: 'var(--accent)',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    marginBottom: 'calc(6px * var(--app-density-scale))'
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: 300,
    fontSize: 'calc(26px * var(--app-font-scale))',
    margin: 0
  },
  compactTitle: {
    fontSize: 'calc(19px * var(--app-font-scale))',
    lineHeight: 1.12
  },
  startBadge: {
    fontSize: 'calc(12px * var(--app-font-scale))',
    color: 'var(--fg-1)',
    background: 'var(--accent-glow)',
    border: '1px solid var(--accent-soft)',
    padding: '6px 10px',
    borderRadius: 8,
    whiteSpace: 'nowrap'
  },
  compactStartBadge: {
    fontSize: 'calc(10.5px * var(--app-font-scale))',
    padding: '5px 8px',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  path: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'calc(6px * var(--app-density-scale))',
    marginTop: 'calc(12px * var(--app-density-scale))'
  },
  pathChip: {
    fontSize: 'calc(11px * var(--app-font-scale))',
    color: 'var(--fg-1)',
    border: '1px solid var(--line)',
    borderRadius: 999,
    padding: '4px 8px',
    background: 'var(--bg-2)'
  },
  compactPath: {
    gap: 'calc(4px * var(--app-density-scale))',
    marginTop: 'calc(8px * var(--app-density-scale))'
  },
  compactPathChip: {
    fontSize: 'calc(10.5px * var(--app-font-scale))',
    padding: '3px 6px',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  canvas: {
    position: 'relative',
    marginTop: 'calc(10px * var(--app-density-scale))',
    overflowY: 'auto',
    overflowX: 'hidden',
    WebkitOverflowScrolling: 'touch',
    scrollbarWidth: 'thin'
  },
  compactCanvas: {
    marginTop: 'calc(8px * var(--app-density-scale))',
    borderTop: '1px solid var(--line-soft)',
    paddingTop: 'calc(6px * var(--app-density-scale))'
  },
  canvasInner: {
    position: 'relative',
    minWidth: 0,
    minHeight: 170,
    margin: '0 auto',
    maxWidth: 'none'
  },
  edgeSvg: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    display: 'block',
    pointerEvents: 'none',
    overflow: 'visible'
  },
  nodeLayer: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none'
  },
  nodeWrap: {
    transition: 'left 220ms ease, top 220ms ease, opacity 180ms ease',
    willChange: 'left, top'
  },
  emptyMsg: {
    padding: 'calc(28px * var(--app-density-scale))',
    color: 'var(--fg-3)',
    fontSize: 'calc(13px * var(--app-font-scale))',
    textAlign: 'center'
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 99,
    display: 'inline-block',
    flexShrink: 0
  },
  rootNode: {
    width: '100%',
    border: 'none',
    borderRadius: 999,
    background: 'var(--accent)',
    color: 'var(--bg-0)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'calc(6px * var(--app-density-scale))',
    padding: '0 16px',
    position: 'relative',
    boxShadow: '0 10px 24px #00000022',
    transition: 'transform 180ms ease, box-shadow 180ms ease'
  },
  compactRootNode: {
    padding: '0 10px',
    boxShadow: '0 6px 14px #0000001c'
  },
  rootLabel: {
    fontFamily: 'var(--font-display)',
    fontWeight: 500,
    letterSpacing: '0',
    color: '#ffffff',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  branchNode: {
    width: '100%',
    height: '100%',
    padding: '8px 10px',
    borderRadius: 10,
    background: 'var(--bg-0)',
    border: '1px solid var(--line)',
    borderLeftWidth: 4,
    cursor: 'pointer',
    position: 'relative',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 'calc(4px * var(--app-density-scale))',
    textAlign: 'left',
    transition: 'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease'
  },
  compactBranchNode: {
    padding: '6px 8px',
    borderRadius: 8,
    gap: 0
  },
  branchTop: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(6px * var(--app-density-scale))'
  },
  branchTitle: {
    fontWeight: 700,
    color: 'var(--fg-0)',
    flex: 1,
    minWidth: 0,
    lineHeight: 1.18,
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical'
  },
  branchBottom: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(6px * var(--app-density-scale))',
    marginTop: 'calc(1px * var(--app-density-scale))'
  },
  statusChip: {
    fontSize: 'calc(10px * var(--app-font-scale))',
    textTransform: 'capitalize',
    fontWeight: 700,
    whiteSpace: 'nowrap'
  },
  masteryBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    background: 'var(--bg-2)',
    overflow: 'hidden'
  },
  masteryFill: {
    height: '100%',
    borderRadius: 2,
    transition: 'width 0.3s ease'
  },
  masteryLabel: {
    fontSize: 'calc(10px * var(--app-font-scale))',
    color: 'var(--fg-3)',
    fontVariantNumeric: 'tabular-nums'
  },
  chevron: {
    fontSize: 'calc(0px * var(--app-font-scale))',
    color: 'var(--fg-2)',
    cursor: 'pointer',
    padding: 'calc(3px * var(--app-density-scale))',
    borderRadius: 5,
    border: '1px solid var(--line)',
    background: 'var(--bg-2)',
    lineHeight: 1,
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  recBadge: {
    fontSize: 'calc(9px * var(--app-font-scale))',
    fontWeight: 700,
    color: 'var(--bg-0)',
    background: 'var(--accent)',
    borderRadius: 99,
    width: 16,
    height: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxShadow: '0 0 0 2px var(--bg-0)'
  },
  startTag: {
    position: 'absolute',
    top: -10,
    right: 6,
    fontSize: 'calc(9px * var(--app-font-scale))',
    fontWeight: 800,
    color: 'var(--accent)',
    background: 'var(--bg-0)',
    border: '1px solid var(--accent-soft)',
    padding: '2px 6px',
    borderRadius: 999,
    boxShadow: '0 4px 12px #00000018',
    whiteSpace: 'nowrap'
  },
  leafNode: {
    width: '100%',
    height: '100%',
    padding: '6px 8px',
    borderRadius: 8,
    background: 'var(--bg-2)',
    border: '1px solid var(--line)',
    cursor: 'pointer',
    boxSizing: 'border-box',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(6px * var(--app-density-scale))',
    textAlign: 'left',
    transition: 'border-color 180ms ease, box-shadow 180ms ease'
  },
  leafTitle: {
    fontSize: 'calc(11.5px * var(--app-font-scale))',
    color: 'var(--fg-1)',
    fontWeight: 600,
    lineHeight: 1.2,
    minWidth: 0,
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical'
  }
};
window.NoesisVisualRegistry = {
  resolveTopicVisual,
  supportedVisualTypes: () => Object.keys(TOPIC_VISUALS),
  isSupported: (value, context = '') => !!resolveTopicVisual(value, context)
};
window.NoesisLearningMapInternals = {
  layoutTree,
  edgePath,
  normalizeMapId,
  wrapSvgLabel
};
window.TopicVisual = TopicVisual;
window.LearningMap = LearningMap;
})();


// ---- components/StoryboardReview.jsx ----
(function () {
  window.__NOESIS_BOOT.files.push("components/StoryboardReview.jsx");
const safeArray = value => Array.isArray(value) ? value.filter(Boolean) : [];
const cleanValue = (value, fallback = 'Not available') => {
  const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  return text || fallback;
};
const percent = value => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'Not available';
  return `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;
};
const truncate = (value, max = 140) => {
  const text = cleanValue(value, '');
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1)).trim()}...` : text;
};
const summarizeStatus = (record, quality) => {
  const classified = quality && quality.classified || {};
  const needsInput = safeArray(classified.userActionRequired).length || safeArray(classified.hardBlockers).length;
  if (record && record.status === 'rendered') return 'Rendered';
  if (needsInput) return 'Needs user input';
  if (record && (record.status === 'approved' || record.status === 'rendering' || record.approved_at)) return 'Ready to render';
  if (quality && (quality.passed === true || !needsInput)) return 'Ready to render';
  if (record && record.status === 'needs_review') return 'Needs user input';
  return 'Needs user input';
};
const evidenceLabel = (item, index) => {
  const parts = [`Evidence ${index + 1}`];
  if (item && item.slideNumber != null) parts.push(`Slide ${item.slideNumber}`);
  if (item && item.sourcePage != null) parts.push(`Page ${item.sourcePage}`);
  if (item && item.chapterTitle) parts.push(item.chapterTitle);
  return parts.join(' / ');
};
const evidenceScoreLabel = item => {
  const score = Number(item && item.score);
  return Number.isFinite(score) ? ` / score ${score.toFixed(2)}` : '';
};
const visualWarningKeys = new Set(['unsupported_visual_type', 'unrelated_diagram', 'vague_visual', 'decorative_only_visual', 'narration_visual_mismatch', 'missing_visual_elements', 'generic_fallback_not_allowed', 'concept_map_nodes_not_source_backed', 'visual_type_payload_mismatch', 'generic_visual_template', 'abstract_chip_only_visual', 'missing_concrete_visual_payload', 'missing_visual_purpose', 'missing_visual_grounding']);
const normalizeWarning = (warning = '') => String(warning).split(':').pop().replace(/_/g, ' ') || String(warning);
const isVisualWarning = (warning = '') => {
  const text = String(warning || '');
  return [...visualWarningKeys].some(key => text.includes(key));
};
const splitWarnings = (warnings = []) => {
  const list = safeArray(warnings);
  return {
    visual: list.filter(isVisualWarning),
    content: list.filter(w => !isVisualWarning(w))
  };
};
const visualNodeLabels = (data = {}) => safeArray(data.nodes).map(n => typeof n === 'string' ? n : n.label || n.name || n.id || '').filter(Boolean);
const visualEdgeLabels = (data = {}) => safeArray(data.edges).map(edge => {
  if (Array.isArray(edge)) return edge.filter(Boolean).join(' -> ');
  if (edge && typeof edge === 'object') return [edge.from || edge.source, edge.to || edge.target, edge.label].filter(Boolean).join(' -> ');
  return String(edge || '');
}).filter(Boolean);
const visualOperationLabels = (data = {}) => safeArray(data.operations).map(op => typeof op === 'string' ? op : op.label || op.name || op.step || '').filter(Boolean);
const visualStatusLabel = (validation, warnings) => {
  if (validation && validation.passed === true && !warnings.length) return 'Visual passed';
  return 'Visual needs review';
};
const visualStatusStyle = (validation, warnings) => validation && validation.passed === true && !warnings.length ? sr.statusGood : sr.statusNeedsReview;
const isCriticalStoryboardWarning = (code = '') => /^domain:missing_required_visual:/.test(String(code || '')) || /storyboard:too_few_scenes|domain:oop_missing_class_object_visual|domain:data_structure_missing_operation_visual|domain:algorithm_missing_flow_or_complexity_visual|domain:missing_code_scene|domain:unrelated_cs_injection/.test(String(code || ''));
const targetVisualTypeFromWarning = (code = '') => {
  const match = String(code || '').match(/missing_required_visual:([a-z0-9_]+)/i);
  return match ? match[1] : '';
};
const isInternalRepairWarning = (code = '') => /topic:low_confidence|topic:insufficient_key_concepts|topic:insufficient_source_evidence|domain:missing_checkpoint_scene|domain:missing_recap_scene|domain:missing_concrete_example_scene|domain:missing_common_mistake_scene|storyboard:insufficient_visual_variety|grounding:missing_topic_drift_risk|missing_source_evidence|missing_learning_point|page_number_center_visual/.test(String(code || ''));
const finalWarningsForDisplay = (quality = {}) => {
  const classified = quality.classified || {};
  const userAction = [...safeArray(classified.userActionRequired), ...safeArray(classified.hardBlockers)];
  if (userAction.length) return [...new Set(userAction)];
  return safeArray(classified.warnings || quality.warnings).filter(w => !isInternalRepairWarning(w));
};
const topicMapForRecord = (record = {}, board = {}) => board.topicMap || board.materialUnderstanding && board.materialUnderstanding.topicMap || record.quality && record.quality.topicMap || null;
const topicSceneCounts = (topics = [], scenes = []) => {
  const counts = {};
  for (const topic of topics) counts[topic.id || topic.name] = 0;
  for (const row of scenes) {
    const scene = row.scene || row;
    const key = scene.topicId || scene.topicName;
    if (key && counts[key] != null) counts[key] += 1;else {
      const match = topics.find(t => String(scene.topicName || '').toLowerCase() === String(t.name || '').toLowerCase());
      if (match) counts[match.id || match.name] += 1;
    }
  }
  return counts;
};
const topicMapTitle = (topicMap, fallback = '') => {
  const topics = safeArray(topicMap && topicMap.topics);
  if (topics.length >= 2) return topicMap.title || topics.slice(0, 4).map(t => t.name || t.topic).filter(Boolean).join(' / ');
  if (topics.length === 1) return topics[0].name || topics[0].topic || fallback;
  return fallback;
};
const GenerationSummary = ({
  record,
  board,
  scenes,
  warnings
}) => {
  const Icon = window.Icon;
  const quality = record.quality && record.quality.storyboard || {};
  const visualQuality = quality.visual || {};
  const coverage = visualQuality.coverage || {};
  const understanding = board.materialUnderstanding || record.quality && (record.quality.materialUnderstanding || record.quality.topicDetection) || {};
  const grounding = board.grounding || record.quality && record.quality.grounding || {};
  const diagnostics = board.materialDiagnostics || record.quality && record.quality.materialDiagnostics || {};
  const concepts = safeArray(understanding.keyConcepts).slice(0, 10);
  const enrichmentUsed = !!grounding.enrichmentUsed || safeArray(scenes).some(row => {
    const scene = row.scene || row;
    return scene.enrichment && scene.enrichment.used;
  });
  const summaryStatus = summarizeStatus(record, quality);
  const reason = grounding.enrichmentReason || (enrichmentUsed ? 'AI simplification was used for clearer beginner examples.' : 'Uploaded material was concrete enough for the storyboard.');
  const sourceFile = diagnostics.sourceFileName || diagnostics.fileName || diagnostics.title || record.source_file || 'Uploaded material';
  const statusStyle = summaryStatus === 'Needs user input' ? sr.statusNeedsReview : sr.statusGood;
  const topicMap = topicMapForRecord(record, board);
  const topics = safeArray(topicMap && topicMap.topics);
  const counts = topicSceneCounts(topics, scenes);
  const displayTopic = topicMapTitle(topicMap, understanding.topic || understanding.normalizedTopic || board.topic || record.topic);
  const topicWeightTotal = topics.reduce((sum, topic) => sum + Math.max(0, Number(topic.weight || 0)), 0) || topics.length || 1;
  const info = [['Domain', understanding.domain], ['Detected topic', displayTopic], ['Confidence', quality.confidence != null ? percent(quality.confidence) : percent(understanding.confidence)], ['Source file', sourceFile], ['Scenes generated', scenes.length], ['Uploaded material coverage', percent(grounding.uploadedMaterialCoverage)], ['AI simplification used', enrichmentUsed ? 'Yes' : 'No'], ['Topic drift risk', grounding.topicDriftRisk || quality.topicDriftRisk || 'Not available']];
  const missingVisuals = safeArray(coverage.missing);
  const requiredVisuals = safeArray(coverage.required);
  const presentVisuals = safeArray(coverage.present);
  return React.createElement("section", {
    style: sr.summary
  }, React.createElement("div", {
    style: sr.summaryHead
  }, React.createElement("div", {
    style: sr.summaryTitleRow
  }, React.createElement(Icon.Brain, {
    size: 15,
    style: {
      color: 'var(--accent)'
    }
  }), React.createElement("div", null, React.createElement("div", {
    style: sr.summaryEyebrow
  }, "Generation summary"), React.createElement("h2", {
    style: sr.summaryTitle
  }, displayTopic || 'Detected topic'))), React.createElement("span", {
    style: {
      ...sr.statusPill,
      ...statusStyle
    }
  }, summaryStatus)), React.createElement("div", {
    style: sr.summaryGrid
  }, info.map(([label, value]) => React.createElement("div", {
    key: label,
    style: sr.summaryItem
  }, React.createElement("div", {
    style: sr.summaryLabel
  }, label), React.createElement("div", {
    style: sr.summaryValue
  }, cleanValue(value))))), React.createElement("div", {
    style: sr.conceptsRow
  }, React.createElement("span", {
    style: sr.summaryLabel
  }, "Concepts from uploaded material"), React.createElement("div", {
    style: sr.concepts
  }, concepts.length ? concepts.map(c => React.createElement("span", {
    key: c,
    style: sr.conceptChip
  }, c)) : React.createElement("span", {
    style: sr.muted
  }, "No concepts reported yet."))), topics.length > 0 && React.createElement("div", {
    style: sr.topicCoverage
  }, React.createElement("div", {
    style: sr.summaryLabel
  }, "Topic coverage"), React.createElement("div", {
    style: sr.topicCoverageGrid
  }, topics.map(topic => {
    const key = topic.id || topic.name;
    const sceneCount = counts[key] || counts[topic.name] || 0;
    const weight = Math.max(0, Number(topic.weight || 0));
    const weightLabel = weight ? ` / ${Math.round(weight / topicWeightTotal * 100)}% source weight` : '';
    return React.createElement("div", {
      key: key,
      style: sr.topicCoverageItem
    }, React.createElement("div", {
      style: sr.topicCoverageName
    }, topic.name), React.createElement("div", {
      style: sr.metaValue
    }, sceneCount, " scene", sceneCount === 1 ? '' : 's', weightLabel, safeArray(topic.sourcePageRefs).length ? ` / ${safeArray(topic.sourcePageRefs).map(ref => ref.label || (ref.pageNumber ? `Page ${ref.pageNumber}` : ref.slideNumber ? `Slide ${ref.slideNumber}` : '')).filter(Boolean).slice(0, 2).join(', ')}` : ''));
  }))), React.createElement("div", {
    style: sr.enrichmentNote
  }, React.createElement(Icon.Sparkle, {
    size: 13
  }), React.createElement("span", null, reason)), React.createElement("div", {
    style: sr.visualSummary
  }, React.createElement("div", {
    style: sr.summaryLabel
  }, "Visual coverage"), React.createElement("div", {
    style: sr.visualCoverageRows
  }, React.createElement("div", null, React.createElement("b", null, "Required:"), " ", requiredVisuals.length ? requiredVisuals.join(', ') : 'Not reported'), React.createElement("div", null, React.createElement("b", null, "Present:"), " ", presentVisuals.length ? presentVisuals.join(', ') : 'Not reported'), React.createElement("div", {
    style: missingVisuals.length ? sr.warnText : sr.okText
  }, React.createElement("b", null, "Missing:"), " ", missingVisuals.length ? missingVisuals.join(', ') : 'None'))), warnings.length > 0 && React.createElement("div", {
    style: sr.summaryWarnings
  }, React.createElement(Icon.Target, {
    size: 13
  }), React.createElement("span", null, warnings.slice(0, 5).join(' | '))));
};
const ApprovalPanel = ({
  quality,
  busy,
  onFix,
  onGlobalFix,
  onRecheck,
  onApproveAnyway
}) => {
  const Icon = window.Icon;
  const RotateIcon = Icon.RotateCcw || Icon.ArrowLeft || Icon.Sparkle;
  if (!quality || !quality.classified) return null;
  const classified = quality.classified || {};
  const critical = [...new Set([...safeArray(classified.userActionRequired), ...safeArray(classified.hardBlockers)])];
  const warnings = safeArray(classified.warnings || quality.warnings).filter(w => !critical.includes(w) && !isInternalRepairWarning(w));
  const info = safeArray(classified.info).filter(w => !isInternalRepairWarning(w));
  if (!critical.length && !warnings.length && !info.length) return null;
  const details = quality.warningDetails || [];
  const detailMap = {};
  for (const d of details) detailMap[d.code] = d;
  const sceneIdFromWarning = code => {
    const match = code.match(/^([^:]+?):/);
    return match && !/^(domain|topic|storyboard|grounding|enrichment)$/.test(match[1]) ? match[1] : null;
  };
  const renderWarningItem = (code, severity) => {
    const detail = detailMap[code] || {
      label: code.replace(/_/g, ' ')
    };
    const sceneId = detail.sceneId || sceneIdFromWarning(code);
    const canFix = (severity === 'critical' || isVisualWarning(code)) && /missing_required_visual|missing_concrete_visual_payload|generic_visual_template|visual_type_payload_mismatch|generic_fallback_not_allowed|missing_visual_elements|vague_visual|narration_visual_mismatch/.test(code);
    const targetVisualType = targetVisualTypeFromWarning(code);
    return React.createElement("div", {
      key: code,
      style: sr.approvalItem
    }, React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, React.createElement("div", {
      style: sr.approvalCode
    }, sceneId ? `Scene ${sceneId}` : 'Global'), React.createElement("div", {
      style: sr.approvalLabel
    }, detail.label), detail.fix && React.createElement("div", {
      style: sr.approvalFix
    }, detail.fix)), canFix && React.createElement("button", {
      className: "btn btn-ghost",
      style: {
        fontSize: 'calc(11px * var(--app-font-scale))',
        whiteSpace: 'nowrap'
      },
      disabled: !!busy,
      onClick: () => sceneId ? onFix(sceneId, 'fix_auto', targetVisualType) : onGlobalFix({
        warningCode: code,
        targetVisualType,
        action: 'fix_auto'
      })
    }, React.createElement(Icon.Sparkle, {
      size: 11
    }), " ", sceneId ? 'Fix' : 'Fix automatically'));
  };
  return React.createElement("section", {
    style: sr.approvalPanel
  }, React.createElement("div", {
    style: sr.approvalHead
  }, React.createElement(Icon.Target, {
    size: 15,
    style: {
      color: critical.length ? 'var(--err, #ef4444)' : 'var(--warn)'
    }
  }), React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement("div", {
    style: sr.approvalTitle
  }, critical.length ? `${critical.length} critical issue${critical.length > 1 ? 's' : ''} must be fixed` : 'Non-critical warnings remain'), React.createElement("div", {
    style: sr.approvalSub
  }, critical.length ? 'Fix critical issues before approval.' : 'You can approve anyway or fix these warnings.')), React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'calc(8px * var(--app-density-scale))'
    }
  }, React.createElement("button", {
    className: "btn btn-ghost",
    disabled: !!busy,
    onClick: onRecheck
  }, React.createElement(RotateIcon, {
    size: 11
  }), " ", busy === 'recheck' ? 'Checking...' : 'Re-check'), React.createElement("button", {
    className: "btn btn-accent",
    disabled: !!busy || critical.length > 0,
    onClick: onApproveAnyway
  }, React.createElement(Icon.Check, {
    size: 11
  }), " Approve anyway"))), critical.length > 0 && React.createElement("div", {
    style: sr.approvalSection
  }, React.createElement("div", {
    style: {
      ...sr.approvalSectionTitle,
      color: 'var(--err, #ef4444)'
    }
  }, "Critical blockers"), critical.map(c => renderWarningItem(c, 'critical'))), warnings.length > 0 && React.createElement("div", {
    style: sr.approvalSection
  }, React.createElement("div", {
    style: {
      ...sr.approvalSectionTitle,
      color: 'var(--warn)'
    }
  }, "Warnings"), warnings.map(w => renderWarningItem(w, 'warning'))), info.length > 0 && React.createElement("div", {
    style: sr.approvalSection
  }, React.createElement("div", {
    style: {
      ...sr.approvalSectionTitle,
      color: 'var(--fg-3)'
    }
  }, "Info"), info.map(i => renderWarningItem(i, 'info'))));
};
const StoryboardReview = ({
  onNav
}) => {
  const Icon = window.Icon;
  const RotateIcon = Icon.RotateCcw || Icon.ArrowLeft || Icon.Sparkle;
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
  const [qualityResult, setQualityResult] = React.useState(null);
  const approve = async force => {
    setBusy('approve');
    setQualityResult(null);
    try {
      const d = await window.NoesisAPI.videos.approveStoryboard(id, force ? {
        force: true
      } : undefined);
      setStoryboard(d.storyboard);
      setStatus('Storyboard approved. Ready to render.');
    } catch (e) {
      const details = e.data && e.data.details;
      if (details && details.classified) {
        setQualityResult(details);
        setStatus('');
      } else {
        const warns = details && details.warnings;
        const detailText = Array.isArray(warns) && warns.length ? ` ${warns.slice(0, 3).join(' | ')}` : '';
        setStatus('Approval failed: ' + (e.message || 'error') + detailText);
      }
    } finally {
      setBusy('');
    }
  };
  const recheck = async () => {
    setBusy('recheck');
    try {
      const d = await window.NoesisAPI.videos.recheckStoryboard(id);
      setQualityResult(d.quality);
      await load();
      setStatus('Quality check complete.');
    } catch (e) {
      setStatus('Recheck failed: ' + (e.message || 'error'));
    } finally {
      setBusy('');
    }
  };
  const doFixScene = async (sceneId, fixType, targetVisualType = '', sourcePreference = 'auto', sourceVisualId = null) => {
    setBusy('fix-' + sceneId);
    try {
      const d = await window.NoesisAPI.videos.fixScene(id, {
        sceneId,
        fixType,
        targetVisualType,
        sourcePreference,
        sourceVisualId
      });
      setStoryboard(d.storyboard);
      setQualityResult(null);
      setStatus('Scene fixed. Re-run checks or approve.');
    } catch (e) {
      setStatus('Fix failed: ' + (e.message || 'error'));
    } finally {
      setBusy('');
    }
  };
  const doFixIssue = async payload => {
    setBusy('fix-global');
    try {
      const d = await window.NoesisAPI.videos.fixStoryboardIssue(id, payload);
      setStoryboard(d.storyboard);
      setQualityResult(d.quality || null);
      setStatus(d.fixedSceneId ? `Generated missing visual in ${d.fixedSceneId}. Re-check before approval.` : 'Storyboard issue fixed. Re-check before approval.');
    } catch (e) {
      setStatus('Automatic fix failed: ' + (e.message || 'error'));
    } finally {
      setBusy('');
    }
  };
  const doRegenerateTopic = async topicId => {
    setBusy('topic-' + topicId);
    try {
      const d = await window.NoesisAPI.videos.regenerateTopic(id, {
        topicId
      });
      setStoryboard(d.storyboard);
      setQualityResult(null);
      setStatus('Topic section regenerated.');
    } catch (e) {
      setStatus('Topic regeneration failed: ' + (e.message || 'error'));
    } finally {
      setBusy('');
    }
  };
  const doRepairWarnings = async () => {
    setBusy('ai-repair');
    try {
      const d = await window.NoesisAPI.videos.repairStoryboard(id, {
        scope: 'weak_scenes',
        warningCodes: warnings,
        sourcePreference: 'auto'
      });
      setStoryboard(d.storyboard);
      setQualityResult(d.quality || null);
      const repair = d.repair || {};
      const repaired = safeArray(repair.repairedSceneIds);
      const skipped = safeArray(repair.skippedSceneIds);
      setStatus(repaired.length ? `AI repaired ${repaired.length} scene${repaired.length === 1 ? '' : 's'}. ${skipped.length ? `${skipped.length} scene${skipped.length === 1 ? '' : 's'} still need review.` : 'Review the updated warnings before approval.'}` : 'AI repair did not apply changes. The storyboard is unchanged.');
    } catch (e) {
      setStatus('AI repair failed: ' + (e.message || 'error'));
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
          onProgress: j => setStatus(j.stage || `Rendering ${j.progress || 0}%...`)
        });
      }
      const file = await window.NoesisAPI.videos.fileBlobUrl(r.video_id);
      setVideo({
        id: r.video_id,
        file
      });
      setStatus('Video ready.');
    } catch (e) {
      const details = e.data && e.data.details;
      if (details && details.classified) {
        setQualityResult(details);
        const critical = [...safeArray(details.classified.userActionRequired), ...safeArray(details.classified.hardBlockers)];
        const warnings = details.warnings || [];
        setStatus(critical.length ? 'Storyboard needs user input before rendering MP4.' : 'Render needs approval for the remaining warnings: ' + warnings.slice(0, 3).join(' | '));
      } else {
        setStatus('Render failed: ' + (e.message || 'error'));
      }
      try {
        await load();
      } catch (_) {}
    } finally {
      setBusy('');
    }
  };
  if (!id) {
    return React.createElement(EmptyStoryboard, {
      onNav: onNav
    });
  }
  if (!storyboard) {
    return React.createElement("div", {
      style: sr.loading
    }, "Loading storyboard...");
  }
  const board = storyboard.storyboard || {};
  const scenes = storyboard.scenes || [];
  const storyboardQuality = storyboard.quality && storyboard.quality.storyboard || {};
  const warnings = finalWarningsForDisplay(storyboardQuality);
  const activeQuality = qualityResult || storyboardQuality;
  const activeCritical = activeQuality && activeQuality.classified ? [...safeArray(activeQuality.classified.userActionRequired), ...safeArray(activeQuality.classified.hardBlockers)] : warnings.filter(isCriticalStoryboardWarning);
  const hasCriticalBlockers = activeCritical.length > 0;
  const hasApprovalOverride = !!(storyboard.quality && storyboard.quality.approvalOverride);
  const canRenderStoryboard = storyboard.status === 'approved' || storyboard.status === 'rendering' || storyboard.approved_at && hasApprovalOverride;
  const visualSceneResults = (storyboardQuality.visual && storyboardQuality.visual.scenes || []).reduce((acc, item) => {
    if (item && item.sceneId) acc[item.sceneId] = item;
    return acc;
  }, {});
  const topicMap = topicMapForRecord(storyboard, board);
  const topicRows = safeArray(topicMap && topicMap.topics);
  const topicGroups = topicRows.length ? topicRows.map(topic => ({
    topic,
    rows: scenes.filter(row => {
      const scene = row.scene || row;
      return String(scene.topicId || '').toLowerCase() === String(topic.id || '').toLowerCase() || String(scene.topicName || '').toLowerCase() === String(topic.name || '').toLowerCase();
    })
  })).filter(group => group.rows.length) : [];
  const groupedSceneIds = new Set(topicGroups.flatMap(group => group.rows.map(row => (row.scene || row).id || row.scene_id)));
  const ungroupedRows = scenes.filter(row => !groupedSceneIds.has((row.scene || row).id || row.scene_id));
  return React.createElement("div", null, React.createElement(window.Topbar, {
    title: "Storyboard Review",
    crumbs: ['Videos', board.topic || storyboard.topic || 'Storyboard'],
    right: React.createElement(React.Fragment, null, React.createElement("button", {
      className: "btn btn-ghost",
      disabled: !!busy,
      onClick: () => onNav && onNav('material')
    }, React.createElement(Icon.ArrowLeft, {
      size: 12
    }), " Material"), React.createElement("button", {
      className: "btn btn-ghost",
      disabled: !!busy,
      onClick: recheck
    }, React.createElement(RotateIcon, {
      size: 12
    }), " ", busy === 'recheck' ? 'Checking...' : 'Re-check'), React.createElement("button", {
      className: "btn btn-accent",
      disabled: !!busy || !warnings.length,
      onClick: doRepairWarnings,
      title: warnings.length ? 'Use AI to repair remaining storyboard warnings' : 'No user-actionable warnings'
    }, React.createElement(Icon.Sparkle, {
      size: 12
    }), " ", busy === 'ai-repair' ? 'Repairing...' : 'Repair warnings'), React.createElement("button", {
      className: "btn btn-ghost",
      disabled: !!busy || hasCriticalBlockers,
      onClick: () => approve(false),
      title: hasCriticalBlockers ? 'User input is needed before approval' : 'Approve storyboard'
    }, React.createElement(Icon.Check, {
      size: 12
    }), " ", busy === 'approve' ? 'Approving...' : 'Approve'), React.createElement("button", {
      className: "btn btn-accent",
      disabled: !!busy || !canRenderStoryboard,
      onClick: render,
      title: hasCriticalBlockers ? 'User input is needed before rendering' : 'Render approved storyboard'
    }, React.createElement(Icon.Play, {
      size: 12
    }), " ", busy === 'render' ? 'Rendering...' : 'Render MP4'))
  }), React.createElement("main", {
    style: sr.page
  }, React.createElement("section", {
    style: sr.hero
  }, React.createElement("div", null, React.createElement("div", {
    style: sr.eyebrow
  }, "Review before rendering"), React.createElement("h1", {
    style: sr.title
  }, board.topic || storyboard.topic), React.createElement("p", {
    style: sr.sub
  }, "Check the learning point, narration, code, and visual for each scene before spending time on MP4 rendering.")), React.createElement("div", {
    style: sr.statusBox
  }, React.createElement("span", {
    className: "chip chip-accent"
  }, summarizeStatus(storyboard, storyboardQuality)), React.createElement("span", null, scenes.length, " scenes"), React.createElement("span", null, warnings.length, " issue", warnings.length === 1 ? '' : 's'))), status && React.createElement("div", {
    style: sr.notice
  }, status), qualityResult && React.createElement(ApprovalPanel, {
    quality: qualityResult,
    busy: busy,
    onFix: doFixScene,
    onGlobalFix: doFixIssue,
    onRecheck: recheck,
    onApproveAnyway: () => approve(true)
  }), React.createElement(GenerationSummary, {
    record: storyboard,
    board: board,
    scenes: scenes,
    warnings: warnings
  }), topicGroups.length > 0 ? React.createElement("div", {
    style: sr.topicSceneStack
  }, topicGroups.map(group => React.createElement("section", {
    key: group.topic.id || group.topic.name,
    style: sr.topicSection
  }, React.createElement("div", {
    style: sr.topicSectionHead
  }, React.createElement("div", null, React.createElement("div", {
    style: sr.summaryLabel
  }, "Topic section"), React.createElement("h2", {
    style: sr.topicSectionTitle
  }, group.topic.name)), React.createElement("button", {
    className: "btn btn-ghost",
    disabled: !!busy,
    onClick: () => doRegenerateTopic(group.topic.id || group.topic.name)
  }, React.createElement(RotateIcon, {
    size: 12
  }), " ", busy === 'topic-' + (group.topic.id || group.topic.name) ? 'Regenerating...' : 'Regenerate topic')), React.createElement("div", {
    style: sr.grid
  }, group.rows.map((row, index) => {
    const scene = row.scene || row;
    const absoluteIndex = scenes.findIndex(item => ((item.scene || item).id || item.scene_id) === (scene.id || row.scene_id));
    return React.createElement(SceneCard, {
      key: scene.id || row.scene_id,
      index: absoluteIndex >= 0 ? absoluteIndex : index,
      scene: scene,
      visualResult: visualSceneResults[scene.id || row.scene_id],
      busy: busy === scene.id || busy === 'fix-' + scene.id,
      onPatch: patchScene,
      onFix: doFixScene
    });
  })))), ungroupedRows.length > 0 && React.createElement("section", {
    style: sr.topicSection
  }, React.createElement("div", {
    style: sr.topicSectionHead
  }, React.createElement("div", null, React.createElement("div", {
    style: sr.summaryLabel
  }, "Shared scenes"), React.createElement("h2", {
    style: sr.topicSectionTitle
  }, "Overview and recap"))), React.createElement("div", {
    style: sr.grid
  }, ungroupedRows.map((row, index) => {
    const scene = row.scene || row;
    const absoluteIndex = scenes.findIndex(item => ((item.scene || item).id || item.scene_id) === (scene.id || row.scene_id));
    return React.createElement(SceneCard, {
      key: scene.id || row.scene_id,
      index: absoluteIndex >= 0 ? absoluteIndex : index,
      scene: scene,
      visualResult: visualSceneResults[scene.id || row.scene_id],
      busy: busy === scene.id || busy === 'fix-' + scene.id,
      onPatch: patchScene,
      onFix: doFixScene
    });
  })))) : React.createElement("div", {
    style: sr.grid
  }, scenes.map((row, index) => {
    const scene = row.scene || row;
    return React.createElement(SceneCard, {
      key: scene.id || row.scene_id,
      index: index,
      scene: scene,
      visualResult: visualSceneResults[scene.id || row.scene_id],
      busy: busy === scene.id || busy === 'fix-' + scene.id,
      onPatch: patchScene,
      onFix: doFixScene
    });
  })), video && React.createElement("section", {
    style: sr.videoBox
  }, React.createElement("div", {
    style: sr.cardTitle
  }, "Rendered video"), React.createElement("video", {
    src: video.file,
    controls: true,
    crossOrigin: "use-credentials",
    style: {
      width: '100%',
      borderRadius: 8,
      marginTop: 'calc(10px * var(--app-density-scale))'
    }
  }))));
};
const SceneCard = ({
  scene,
  index,
  visualResult,
  busy,
  onPatch,
  onFix
}) => {
  const Icon = window.Icon;
  const TopicVisual = window.TopicVisual || UnsupportedStoryboardVisual;
  const [open, setOpen] = React.useState(false);
  const [showMeta, setShowMeta] = React.useState(false);
  const [narration, setNarration] = React.useState(scene.narration || '');
  React.useEffect(() => {
    setNarration(scene.narration || '');
  }, [scene.narration]);
  const validation = scene.visualValidation || visualResult || {};
  const warn = [...new Set([...(scene.qualityWarnings || []), ...(validation.warnings || [])])];
  const split = splitWarnings(warn);
  const keyIdea = scene.learningPoint || scene.studentFacingGoal || scene.title || '';
  const title = scene.sceneTitle || scene.title || `Scene ${index + 1}`;
  const visualType = scene.visualType || scene.visualTemplate || 'missing';
  const visualData = scene.visualElements || scene.visualData || {};
  const grounding = scene.visualGrounding || {};
  const selectedReason = grounding.selectedVisualReason || scene.visualRationale || '';
  const nodes = visualNodeLabels(visualData);
  const edges = visualEdgeLabels(visualData);
  const operations = visualOperationLabels(visualData);
  const code = scene.code || (scene.codeSnippet ? {
    content: scene.codeSnippet
  } : null);
  const hasVisualPreview = visualType && !['none', 'no_visual'].includes(String(visualType).toLowerCase()) && (nodes.length || edges.length || operations.length || code && code.content);
  const evidence = safeArray(scene.sourceEvidence);
  const sourceVisualIds = safeArray(scene.sourceVisualIds || (scene.visualPlan && scene.visualPlan.sourceVisualUsed ? [scene.visualPlan.sourceVisualUsed] : []));
  const repairHistory = safeArray(scene.repairHistory);
  const enrichment = scene.enrichment || {
    used: false
  };
  const onScreenText = safeArray(scene.onScreenText);
  const motion = safeArray(scene.motionInstructions);
  return React.createElement("article", {
    style: sr.scene
  }, React.createElement("div", {
    style: sr.sceneHead
  }, React.createElement("span", {
    className: "mono",
    style: sr.sceneNo
  }, String(index + 1).padStart(2, '0')), React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, React.createElement("h3", {
    style: sr.sceneTitle
  }, title), React.createElement("div", {
    style: sr.sceneMeta
  }, cleanValue(scene.type, 'scene'), " / ", visualType)), React.createElement("span", {
    style: {
      ...sr.statusPill,
      ...visualStatusStyle(validation, split.visual)
    }
  }, visualStatusLabel(validation, split.visual)), split.visual.length > 0 && onFix && React.createElement("button", {
    className: "btn btn-ghost",
    style: {
      fontSize: 'calc(11px * var(--app-font-scale))'
    },
    disabled: busy,
    onClick: () => onFix(scene.id, 'fix_auto')
  }, React.createElement(Icon.Sparkle, {
    size: 10
  }), " Fix visual"), onFix && React.createElement("button", {
    className: "btn btn-ghost",
    style: {
      fontSize: 'calc(11px * var(--app-font-scale))'
    },
    disabled: busy,
    onClick: () => onFix(scene.id, 'regenerate_visual'),
    title: "Replace this visual with a better one inferred from the scene content"
  }, React.createElement(Icon.Sparkle, {
    size: 10
  }), " Replace visual"), React.createElement("button", {
    className: "btn btn-bare",
    onClick: () => setOpen(v => !v)
  }, open ? 'Close' : 'Edit')), keyIdea && React.createElement("div", {
    style: sr.keyIdea
  }, keyIdea), React.createElement("div", {
    style: sr.visualPanel
  }, React.createElement("div", {
    style: sr.visualPanelHead
  }, React.createElement("div", null, React.createElement("div", {
    style: sr.metaLabel
  }, "Visual type"), React.createElement("div", {
    style: sr.visualTypeName
  }, visualType)), React.createElement("div", {
    style: {
      textAlign: 'right'
    }
  }, React.createElement("div", {
    style: sr.metaLabel
  }, "Validation"), React.createElement("div", {
    style: validation && validation.passed === true && !split.visual.length ? sr.okText : sr.warnText
  }, visualStatusLabel(validation, split.visual)))), React.createElement("div", {
    style: sr.visualPurpose
  }, cleanValue(scene.visualPurpose, 'No visual purpose reported.')), selectedReason && React.createElement("div", {
    style: sr.visualReason
  }, selectedReason), React.createElement("div", {
    style: sr.visualFacts
  }, React.createElement("div", null, React.createElement("div", {
    style: sr.metaLabel
  }, "Viewer takeaway"), React.createElement("div", {
    style: sr.metaValue
  }, cleanValue(scene.viewerTakeaway))), React.createElement("div", null, React.createElement("div", {
    style: sr.metaLabel
  }, "Selected because"), React.createElement("div", {
    style: sr.metaValue
  }, cleanValue(grounding.sceneIntent || selectedReason)))), React.createElement("div", {
    style: sr.visualElementGrid
  }, React.createElement(VisualList, {
    label: "Elements",
    items: nodes
  }), React.createElement(VisualList, {
    label: "Operations",
    items: operations
  }), React.createElement(VisualList, {
    label: "Relationships",
    items: edges
  })), split.visual.length > 0 && React.createElement("div", {
    style: sr.visualWarnings
  }, React.createElement(Icon.Target, {
    size: 13
  }), React.createElement("span", null, split.visual.map(normalizeWarning).join(', ')))), hasVisualPreview && typeof TopicVisual === 'function' && React.createElement(TopicVisual, {
    template: visualType,
    data: visualData,
    code: code,
    compact: true
  }), code && code.content && React.createElement("pre", {
    style: sr.code
  }, code.content), React.createElement("p", {
    style: sr.narration
  }, scene.narration), split.content.length > 0 && React.createElement("div", {
    style: sr.sceneWarn
  }, "Content warnings: ", split.content.map(normalizeWarning).join(', ')), React.createElement("div", {
    style: sr.metaToggle
  }, React.createElement("button", {
    className: "btn btn-bare",
    style: sr.metaBtn,
    onClick: () => setShowMeta(v => !v)
  }, React.createElement(Icon.ChevronRight, {
    size: 10,
    style: {
      transform: showMeta ? 'rotate(90deg)' : 'none',
      transition: 'transform 0.15s'
    }
  }), " Scene grounding"), showMeta && React.createElement("div", {
    style: sr.metaContent
  }, React.createElement("div", {
    style: sr.metaCols
  }, React.createElement("div", null, React.createElement("div", {
    style: sr.metaLabel
  }, "On-screen text"), React.createElement("div", {
    style: sr.metaValue
  }, onScreenText.length ? onScreenText.join(' / ') : 'Not reported')), React.createElement("div", null, React.createElement("div", {
    style: sr.metaLabel
  }, "Motion"), React.createElement("div", {
    style: sr.metaValue
  }, motion.length ? motion.join(' / ') : 'Not reported'))), React.createElement("div", {
    style: sr.metaLabel
  }, "Source evidence"), evidence.length ? evidence.map((item, i) => React.createElement("div", {
    key: (item.chunkId || 'e') + '-' + i,
    style: sr.evidenceItem
  }, React.createElement("div", {
    style: sr.evidenceHeader
  }, evidenceLabel(item, i), evidenceScoreLabel(item)), React.createElement("div", {
    style: sr.metaValue
  }, truncate(item.quote || item.text || item.excerpt || '', 220)))) : React.createElement("div", {
    style: sr.metaValue
  }, "No source evidence attached."), React.createElement("div", {
    style: sr.metaLabel
  }, "Source visuals used"), React.createElement("div", {
    style: sr.metaValue
  }, sourceVisualIds.length ? sourceVisualIds.slice(0, 6).join(', ') : 'No source visual attached.'), React.createElement("div", {
    style: sr.metaLabel
  }, "Auto-repair history"), React.createElement("div", {
    style: sr.metaValue
  }, repairHistory.length ? repairHistory.map(item => cleanValue(item.action || item.type || item, '')).filter(Boolean).join(', ') : 'No automatic repair recorded.'), React.createElement("div", {
    style: sr.metaLabel
  }, "AI simplification"), enrichment.used ? React.createElement("div", {
    style: sr.evidenceItem
  }, React.createElement("div", {
    style: sr.evidenceHeader
  }, cleanValue(enrichment.type, 'Enrichment')), React.createElement("div", {
    style: sr.metaValue
  }, truncate(enrichment.content, 240))) : React.createElement("div", {
    style: sr.metaValue
  }, "No enrichment used for this scene."), scene.qualityWarnings && scene.qualityWarnings.length > 0 && React.createElement(React.Fragment, null, React.createElement("div", {
    style: sr.metaLabel
  }, "Quality warnings"), React.createElement("div", {
    style: sr.metaValue
  }, split.content.length ? split.content.map(normalizeWarning).join(', ') : 'No content warnings.'), React.createElement("div", {
    style: sr.metaLabel
  }, "Visual warnings"), React.createElement("div", {
    style: sr.metaValue
  }, split.visual.length ? split.visual.map(normalizeWarning).join(', ') : 'No visual warnings.')))), open && React.createElement("div", {
    style: sr.edit
  }, React.createElement("label", {
    style: sr.label
  }, "Narration"), React.createElement("textarea", {
    value: narration,
    onChange: e => setNarration(e.target.value),
    style: sr.textarea
  }), React.createElement("button", {
    className: "btn btn-accent",
    disabled: busy,
    onClick: () => onPatch(scene, {
      narration
    })
  }, busy ? 'Saving...' : 'Save scene')));
};
const VisualList = ({
  label,
  items
}) => React.createElement("div", {
  style: sr.visualList
}, React.createElement("div", {
  style: sr.metaLabel
}, label), React.createElement("div", {
  style: sr.visualChips
}, items.length ? items.slice(0, 8).map((item, i) => React.createElement("span", {
  key: item + i,
  style: sr.visualChip
}, truncate(item, 48))) : React.createElement("span", {
  style: sr.muted
}, "None reported")));
const UnsupportedStoryboardVisual = ({
  template,
  data = {},
  compact
}) => React.createElement("div", {
  style: {
    ...sr.unsupportedVisual,
    minHeight: compact ? 120 : 180
  }
}, React.createElement("div", {
  style: sr.metaLabel
}, "Visual preview unavailable"), React.createElement("div", {
  style: sr.metaValue
}, cleanValue(template || data.type, 'Unknown visual type')));
const EmptyStoryboard = ({
  onNav
}) => React.createElement("div", {
  style: sr.loading
}, React.createElement("div", null, "No storyboard selected."), React.createElement("button", {
  className: "btn btn-accent",
  onClick: () => onNav && onNav('materials'),
  style: {
    marginTop: 'calc(12px * var(--app-density-scale))'
  }
}, "Open materials"));
const sr = {
  loading: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--fg-2)'
  },
  page: {
    padding: 'calc(28px * var(--app-density-scale))',
    maxWidth: 1380,
    margin: '0 auto'
  },
  hero: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 'calc(20px * var(--app-density-scale))',
    marginBottom: 'calc(18px * var(--app-density-scale))'
  },
  eyebrow: {
    fontSize: 'calc(11px * var(--app-font-scale))',
    color: 'var(--accent)',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    marginBottom: 'calc(8px * var(--app-density-scale))'
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 'calc(42px * var(--app-font-scale))',
    fontWeight: 300,
    margin: 0
  },
  sub: {
    fontSize: 'calc(13.5px * var(--app-font-scale))',
    color: 'var(--fg-2)',
    maxWidth: 650,
    lineHeight: 1.6
  },
  statusBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(10px * var(--app-density-scale))',
    color: 'var(--fg-2)',
    fontSize: 'calc(12px * var(--app-font-scale))'
  },
  notice: {
    padding: 'calc(12px * var(--app-density-scale))',
    border: '1px solid var(--line)',
    background: 'var(--bg-1)',
    borderRadius: 8,
    color: 'var(--fg-2)',
    marginBottom: 'calc(12px * var(--app-density-scale))'
  },
  warn: {
    display: 'flex',
    gap: 'calc(8px * var(--app-density-scale))',
    alignItems: 'center',
    padding: 'calc(12px * var(--app-density-scale))',
    border: '1px solid var(--warn)',
    color: 'var(--warn)',
    borderRadius: 8,
    marginBottom: 'calc(12px * var(--app-density-scale))'
  },
  summary: {
    border: '1px solid var(--line)',
    background: 'var(--bg-1)',
    borderRadius: 8,
    padding: 'calc(16px * var(--app-density-scale))',
    marginBottom: 'calc(16px * var(--app-density-scale))'
  },
  summaryHead: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 'calc(14px * var(--app-density-scale))',
    marginBottom: 'calc(14px * var(--app-density-scale))'
  },
  summaryTitleRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'calc(10px * var(--app-density-scale))',
    minWidth: 0
  },
  summaryEyebrow: {
    fontSize: 'calc(10.5px * var(--app-font-scale))',
    color: 'var(--fg-3)',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    marginBottom: 'calc(4px * var(--app-density-scale))'
  },
  summaryTitle: {
    margin: 0,
    fontSize: 'calc(20px * var(--app-font-scale))',
    fontWeight: 500,
    color: 'var(--fg-0)',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word'
  },
  statusPill: {
    flex: '0 0 auto',
    borderRadius: 999,
    padding: '5px 9px',
    fontSize: 'calc(11px * var(--app-font-scale))',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em'
  },
  statusGood: {
    color: 'var(--ok)',
    background: 'color-mix(in srgb, var(--ok) 14%, transparent)',
    border: '1px solid var(--ok)'
  },
  statusNeedsReview: {
    color: 'var(--warn)',
    background: 'color-mix(in srgb, var(--warn) 12%, transparent)',
    border: '1px solid var(--warn)'
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: 'calc(10px * var(--app-density-scale))',
    marginBottom: 'calc(14px * var(--app-density-scale))'
  },
  summaryItem: {
    minWidth: 0,
    padding: '9px 10px',
    borderRadius: 8,
    border: '1px solid var(--line)',
    background: 'var(--bg-2)'
  },
  summaryLabel: {
    fontSize: 'calc(10px * var(--app-font-scale))',
    color: 'var(--fg-3)',
    textTransform: 'uppercase',
    letterSpacing: '0.09em',
    marginBottom: 'calc(5px * var(--app-density-scale))'
  },
  summaryValue: {
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    color: 'var(--fg-0)',
    lineHeight: 1.45,
    overflowWrap: 'anywhere',
    wordBreak: 'break-word'
  },
  conceptsRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'calc(12px * var(--app-density-scale))',
    borderTop: '1px solid var(--line)',
    paddingTop: 'calc(12px * var(--app-density-scale))'
  },
  concepts: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'calc(6px * var(--app-density-scale))',
    flex: 1
  },
  conceptChip: {
    fontSize: 'calc(11.5px * var(--app-font-scale))',
    color: 'var(--fg-1)',
    border: '1px solid var(--line)',
    background: 'var(--bg-0)',
    borderRadius: 999,
    padding: '5px 8px',
    maxWidth: '100%',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word'
  },
  muted: {
    fontSize: 'calc(12px * var(--app-font-scale))',
    color: 'var(--fg-3)'
  },
  enrichmentNote: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(8px * var(--app-density-scale))',
    marginTop: 'calc(12px * var(--app-density-scale))',
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    color: 'var(--fg-2)',
    lineHeight: 1.5
  },
  visualSummary: {
    marginTop: 'calc(12px * var(--app-density-scale))',
    padding: 'calc(10px * var(--app-density-scale))',
    borderRadius: 8,
    border: '1px solid var(--line)',
    background: 'var(--bg-2)'
  },
  visualCoverageRows: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 'calc(10px * var(--app-density-scale))',
    color: 'var(--fg-2)',
    fontSize: 'calc(12px * var(--app-font-scale))',
    lineHeight: 1.45
  },
  topicCoverage: {
    marginTop: 'calc(12px * var(--app-density-scale))',
    padding: 'calc(10px * var(--app-density-scale))',
    borderRadius: 8,
    border: '1px solid var(--line)',
    background: 'var(--bg-2)'
  },
  topicCoverageGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: 'calc(8px * var(--app-density-scale))'
  },
  topicCoverageItem: {
    minWidth: 0,
    border: '1px solid var(--line)',
    borderRadius: 8,
    background: 'var(--bg-0)',
    padding: '8px 9px'
  },
  topicCoverageName: {
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    color: 'var(--fg-0)',
    fontWeight: 700,
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
    marginBottom: 'calc(3px * var(--app-density-scale))'
  },
  warnText: {
    color: 'var(--warn)',
    fontSize: 'calc(12px * var(--app-font-scale))',
    fontWeight: 700
  },
  okText: {
    color: 'var(--ok)',
    fontSize: 'calc(12px * var(--app-font-scale))',
    fontWeight: 700
  },
  summaryWarnings: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(8px * var(--app-density-scale))',
    marginTop: 'calc(12px * var(--app-density-scale))',
    padding: 'calc(10px * var(--app-density-scale))',
    borderRadius: 8,
    border: '1px solid var(--warn)',
    color: 'var(--warn)',
    fontSize: 'calc(12px * var(--app-font-scale))',
    lineHeight: 1.45
  },
  topicSceneStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'calc(16px * var(--app-density-scale))'
  },
  topicSection: {
    borderTop: '1px solid var(--line)',
    paddingTop: 'calc(14px * var(--app-density-scale))'
  },
  topicSectionHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'calc(12px * var(--app-density-scale))',
    marginBottom: 'calc(10px * var(--app-density-scale))'
  },
  topicSectionTitle: {
    margin: 0,
    color: 'var(--fg-0)',
    fontSize: 'calc(19px * var(--app-font-scale))',
    fontWeight: 600,
    overflowWrap: 'anywhere',
    wordBreak: 'break-word'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 'calc(14px * var(--app-density-scale))'
  },
  scene: {
    border: '1px solid var(--line)',
    background: 'var(--bg-1)',
    borderRadius: 8,
    padding: 'calc(16px * var(--app-density-scale))',
    display: 'flex',
    flexDirection: 'column',
    gap: 'calc(12px * var(--app-density-scale))'
  },
  sceneHead: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(12px * var(--app-density-scale))'
  },
  sceneNo: {
    color: 'var(--accent)',
    fontSize: 'calc(11px * var(--app-font-scale))'
  },
  sceneTitle: {
    fontSize: 'calc(17px * var(--app-font-scale))',
    margin: 0,
    color: 'var(--fg-0)',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word'
  },
  sceneMeta: {
    fontSize: 'calc(11.5px * var(--app-font-scale))',
    color: 'var(--fg-3)',
    marginTop: 'calc(3px * var(--app-density-scale))'
  },
  keyIdea: {
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    color: 'var(--fg-1)',
    lineHeight: 1.5,
    padding: 'calc(10px * var(--app-density-scale))',
    background: 'var(--bg-2)',
    borderRadius: 8,
    border: '1px solid var(--line)',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word'
  },
  visualPanel: {
    border: '1px solid var(--line)',
    background: 'var(--bg-2)',
    borderRadius: 8,
    padding: 'calc(12px * var(--app-density-scale))',
    display: 'flex',
    flexDirection: 'column',
    gap: 'calc(9px * var(--app-density-scale))'
  },
  visualPanelHead: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 'calc(12px * var(--app-density-scale))'
  },
  visualTypeName: {
    color: 'var(--fg-0)',
    fontSize: 'calc(13px * var(--app-font-scale))',
    fontWeight: 700,
    overflowWrap: 'anywhere',
    wordBreak: 'break-word'
  },
  visualPurpose: {
    color: 'var(--fg-1)',
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    lineHeight: 1.5,
    overflowWrap: 'anywhere',
    wordBreak: 'break-word'
  },
  visualReason: {
    color: 'var(--fg-3)',
    fontSize: 'calc(11.5px * var(--app-font-scale))',
    lineHeight: 1.45,
    overflowWrap: 'anywhere',
    wordBreak: 'break-word'
  },
  visualFacts: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 'calc(10px * var(--app-density-scale))'
  },
  visualElementGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 'calc(8px * var(--app-density-scale))'
  },
  visualList: {
    minWidth: 0
  },
  visualChips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'calc(5px * var(--app-density-scale))'
  },
  visualChip: {
    border: '1px solid var(--line)',
    background: 'var(--bg-0)',
    color: 'var(--fg-2)',
    borderRadius: 8,
    padding: '4px 7px',
    fontSize: 'calc(10.5px * var(--app-font-scale))',
    maxWidth: '100%',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
    lineHeight: 1.25
  },
  visualWarnings: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(7px * var(--app-density-scale))',
    padding: 'calc(8px * var(--app-density-scale))',
    borderRadius: 8,
    border: '1px solid var(--warn)',
    color: 'var(--warn)',
    background: 'color-mix(in srgb, var(--warn) 8%, transparent)',
    fontSize: 'calc(11.5px * var(--app-font-scale))',
    lineHeight: 1.45
  },
  metaToggle: {
    marginTop: 'calc(2px * var(--app-density-scale))'
  },
  metaBtn: {
    fontSize: 'calc(11px * var(--app-font-scale))',
    color: 'var(--fg-3)',
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(4px * var(--app-density-scale))',
    padding: 0
  },
  metaContent: {
    padding: '8px 10px',
    background: 'var(--bg-2)',
    borderRadius: 6,
    marginTop: 'calc(6px * var(--app-density-scale))',
    border: '1px dashed var(--line)'
  },
  metaCols: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 'calc(10px * var(--app-density-scale))'
  },
  metaLabel: {
    fontSize: 'calc(10px * var(--app-font-scale))',
    color: 'var(--fg-3)',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    marginBottom: 'calc(2px * var(--app-density-scale))',
    marginTop: 'calc(6px * var(--app-density-scale))'
  },
  metaValue: {
    fontSize: 'calc(11.5px * var(--app-font-scale))',
    color: 'var(--fg-2)',
    lineHeight: 1.5,
    overflowWrap: 'anywhere',
    wordBreak: 'break-word'
  },
  evidenceItem: {
    border: '1px solid var(--line)',
    background: 'var(--bg-0)',
    borderRadius: 6,
    padding: '7px 8px',
    marginTop: 'calc(6px * var(--app-density-scale))'
  },
  evidenceHeader: {
    fontSize: 'calc(10.5px * var(--app-font-scale))',
    color: 'var(--accent)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: 'calc(3px * var(--app-density-scale))'
  },
  narration: {
    color: 'var(--fg-2)',
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    lineHeight: 1.65,
    margin: 0,
    overflowWrap: 'anywhere',
    wordBreak: 'break-word'
  },
  sceneWarn: {
    fontSize: 'calc(11.5px * var(--app-font-scale))',
    color: 'var(--warn)'
  },
  code: {
    maxHeight: 120,
    overflow: 'auto',
    background: '#0f172a',
    color: '#dbeafe',
    borderRadius: 8,
    padding: 'calc(12px * var(--app-density-scale))',
    fontFamily: 'var(--font-mono)',
    fontSize: 'calc(11.5px * var(--app-font-scale))'
  },
  edit: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'calc(8px * var(--app-density-scale))'
  },
  label: {
    fontSize: 'calc(11px * var(--app-font-scale))',
    color: 'var(--fg-3)',
    textTransform: 'uppercase',
    letterSpacing: '0.1em'
  },
  textarea: {
    minHeight: 130,
    resize: 'vertical',
    border: '1px solid var(--line)',
    borderRadius: 8,
    padding: 'calc(12px * var(--app-density-scale))',
    background: 'var(--bg-0)',
    color: 'var(--fg-0)',
    font: 'inherit',
    lineHeight: 1.55
  },
  videoBox: {
    marginTop: 'calc(18px * var(--app-density-scale))',
    border: '1px solid var(--line)',
    background: 'var(--bg-1)',
    borderRadius: 8,
    padding: 'calc(16px * var(--app-density-scale))'
  },
  cardTitle: {
    fontSize: 'calc(13px * var(--app-font-scale))',
    color: 'var(--fg-1)',
    fontWeight: 600
  },
  unsupportedVisual: {
    border: '1px dashed var(--line)',
    background: 'var(--bg-2)',
    borderRadius: 8,
    padding: 'calc(12px * var(--app-density-scale))',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 'calc(4px * var(--app-density-scale))'
  },
  approvalPanel: {
    border: '1px solid var(--warn)',
    background: 'color-mix(in srgb, var(--warn) 5%, var(--bg-1))',
    borderRadius: 8,
    padding: 'calc(16px * var(--app-density-scale))',
    marginBottom: 'calc(16px * var(--app-density-scale))'
  },
  approvalHead: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'calc(12px * var(--app-density-scale))',
    marginBottom: 'calc(12px * var(--app-density-scale))'
  },
  approvalTitle: {
    fontSize: 'calc(15px * var(--app-font-scale))',
    fontWeight: 600,
    color: 'var(--fg-0)'
  },
  approvalSub: {
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    color: 'var(--fg-2)',
    marginTop: 'calc(2px * var(--app-density-scale))'
  },
  approvalSection: {
    marginTop: 'calc(10px * var(--app-density-scale))',
    padding: '10px 0 0',
    borderTop: '1px solid var(--line)'
  },
  approvalSectionTitle: {
    fontSize: 'calc(10.5px * var(--app-font-scale))',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    fontWeight: 700,
    marginBottom: 'calc(8px * var(--app-density-scale))'
  },
  approvalItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(10px * var(--app-density-scale))',
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid var(--line)',
    background: 'var(--bg-0)',
    marginBottom: 'calc(6px * var(--app-density-scale))'
  },
  approvalCode: {
    fontSize: 'calc(10px * var(--app-font-scale))',
    color: 'var(--accent)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em'
  },
  approvalLabel: {
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    color: 'var(--fg-1)',
    lineHeight: 1.4,
    marginTop: 'calc(2px * var(--app-density-scale))'
  },
  approvalFix: {
    fontSize: 'calc(11px * var(--app-font-scale))',
    color: 'var(--fg-3)',
    marginTop: 'calc(2px * var(--app-density-scale))'
  }
};
window.StoryboardReview = StoryboardReview;
})();


// ---- components/StudyPlan.jsx ----
(function () {
  window.__NOESIS_BOOT.files.push("components/StudyPlan.jsx");
const StudyPlan = ({
  onNav
}) => {
  const Icon = window.Icon;
  const [plan, setPlan] = React.useState(null);
  const [map, setMap] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const [highlightNode, setHighlightNode] = React.useState('');
  const load = React.useCallback(async () => {
    setStatus('');
    try {
      const [planRes, mapRes] = await Promise.all([window.NoesisAPI.study.activePlan().catch(() => ({
        study_plan: null
      })), window.NoesisAPI.study.learningMap().catch(() => ({
        learning_map: null
      }))]);
      setPlan(planRes.study_plan || null);
      setMap(mapRes.learning_map || null);
    } catch (e) {
      setStatus(e.message || 'Could not load your plan.');
    }
  }, []);
  React.useEffect(() => {
    load();
  }, [load]);
  const createPlan = async () => {
    setBusy(true);
    setStatus('Building a study plan from your weak topics...');
    try {
      const res = await window.NoesisAPI.study.createPlan({});
      setPlan(res.study_plan || null);
      if (res.study_plan && res.study_plan.plan && res.study_plan.plan.learningMap) setMap(res.study_plan.plan.learningMap);
      setStatus('Draft ready. Review it, then approve it to make it active.');
    } catch (e) {
      setStatus('Plan failed: ' + (e.message || 'error'));
    } finally {
      setBusy(false);
    }
  };
  const approve = async () => {
    if (!plan) return;
    setBusy(true);
    setStatus('Approving plan...');
    try {
      const res = await window.NoesisAPI.study.approvePlan(plan.id);
      setPlan(res.study_plan || null);
      setStatus('Plan is active.');
    } catch (e) {
      setStatus('Approve failed: ' + (e.message || 'error'));
    } finally {
      setBusy(false);
    }
  };
  const completeTask = async taskId => {
    setBusy(true);
    try {
      const res = await window.NoesisAPI.study.completeTask(taskId);
      setPlan(res.study_plan || null);
      const reward = res.study_plan && res.study_plan.reward;
      setStatus(reward && reward.points ? `Task marked complete. +${reward.points} XP` : 'Task marked complete.');
    } catch (e) {
      setStatus('Could not update task: ' + (e.message || 'error'));
    } finally {
      setBusy(false);
    }
  };
  const planJson = plan && plan.plan ? plan.plan : null;
  const days = planJson && Array.isArray(planJson.dailyPlan) ? planJson.dailyPlan : [];
  const taskRows = plan && Array.isArray(plan.tasks) ? plan.tasks : [];
  const today = days[0] || null;
  const weakTopics = planJson && planJson.weakTopics || [];
  const taskByDay = taskRows.reduce((acc, row) => {
    if (!acc[row.day]) acc[row.day] = [];
    acc[row.day].push(row);
    return acc;
  }, {});
  return React.createElement("div", null, React.createElement(window.Topbar, {
    title: "Study Plan",
    crumbs: ['Personal path'],
    right: React.createElement(React.Fragment, null, React.createElement("button", {
      className: "btn btn-ghost",
      onClick: () => onNav && onNav('materials')
    }, React.createElement(Icon.Folder, {
      size: 12
    }), " Materials"), React.createElement("button", {
      className: "btn btn-accent",
      disabled: busy,
      onClick: createPlan
    }, React.createElement(Icon.Sparkle, {
      size: 12
    }), " ", plan ? 'Refresh plan' : 'Create plan'))
  }), React.createElement("div", {
    style: sp.page
  }, status && React.createElement("div", {
    style: sp.status
  }, status), React.createElement("section", {
    style: sp.hero
  }, React.createElement("div", null, React.createElement("div", {
    style: sp.eyebrow
  }, "Adaptive study coach"), React.createElement("h1", {
    style: sp.title
  }, planJson ? planJson.planTitle : 'Build a path from your weak topics.'), React.createElement("p", {
    style: sp.sub
  }, "Noesis combines your onboarding profile, quiz misses, concept mastery, and uploaded material into a daily plan."), React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'calc(8px * var(--app-density-scale))',
      marginTop: 'calc(18px * var(--app-density-scale))',
      flexWrap: 'wrap'
    }
  }, planJson && React.createElement("span", {
    className: "chip chip-accent"
  }, plan.status), planJson && React.createElement("span", {
    className: "chip"
  }, planJson.minutesPerSession || 45, " min sessions"), planJson && React.createElement("span", {
    className: "chip"
  }, planJson.learningStyle || 'mixed', " learning"), planJson && React.createElement("span", {
    className: "chip"
  }, planJson.preferredLanguage || 'java'))), React.createElement("div", {
    style: sp.actionCard
  }, React.createElement("div", {
    style: {
      fontSize: 'calc(12px * var(--app-font-scale))',
      color: 'var(--fg-3)',
      marginBottom: 'calc(8px * var(--app-density-scale))'
    }
  }, "Next action"), React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'calc(24px * var(--app-font-scale))',
      color: 'var(--fg-0)',
      lineHeight: 1.15
    }
  }, today ? today.focusTopic : 'Generate your first plan'), React.createElement("p", {
    style: {
      fontSize: 'calc(12.5px * var(--app-font-scale))',
      color: 'var(--fg-2)',
      lineHeight: 1.5
    }
  }, today ? today.successCriteria : 'Upload material or generate a quiz to make recommendations sharper.'), plan && plan.status !== 'active' && React.createElement("button", {
    className: "btn btn-accent",
    disabled: busy,
    onClick: approve,
    style: {
      width: '100%',
      justifyContent: 'center'
    }
  }, React.createElement(Icon.Check, {
    size: 12
  }), " Approve plan"))), React.createElement("section", {
    style: sp.grid
  }, React.createElement("div", {
    className: "card",
    style: {
      padding: 'calc(22px * var(--app-density-scale))',
      gridColumn: 'span 2'
    }
  }, React.createElement("div", {
    style: sp.cardHead
  }, React.createElement("span", {
    style: sp.cardTitle
  }, "Learning map"), React.createElement("button", {
    className: "btn btn-bare",
    onClick: load,
    style: {
      fontSize: 'calc(11.5px * var(--app-font-scale))'
    }
  }, "Refresh ", React.createElement(Icon.ArrowRight, {
    size: 11
  }))), window.LearningMap ? React.createElement(window.LearningMap, {
    map: map || planJson && planJson.learningMap,
    compact: false,
    highlightNode: highlightNode
  }) : React.createElement("div", {
    style: sp.empty
  }, "Learning map renderer is not loaded.")), React.createElement("div", {
    className: "card",
    style: {
      padding: 'calc(22px * var(--app-density-scale))'
    }
  }, React.createElement("div", {
    style: sp.cardHead
  }, React.createElement("span", {
    style: sp.cardTitle
  }, "Weak topics"), React.createElement(Icon.Target, {
    size: 14,
    style: {
      color: 'var(--accent)'
    }
  })), React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'calc(8px * var(--app-density-scale))',
      marginTop: 'calc(14px * var(--app-density-scale))'
    }
  }, weakTopics.length ? weakTopics.slice(0, 7).map(t => React.createElement("button", {
    key: t,
    type: "button",
    onClick: () => setHighlightNode(t),
    style: {
      ...sp.topicRow,
      ...(highlightNode === t ? sp.topicRowActive : {})
    },
    "aria-pressed": highlightNode === t
  }, React.createElement("span", null, t), React.createElement("span", {
    className: "chip"
  }, "priority"))) : React.createElement("div", {
    style: sp.empty
  }, "No weak topics yet. Take a quiz to calibrate the map.")))), React.createElement("section", {
    className: "card",
    style: {
      padding: 'calc(22px * var(--app-density-scale))',
      marginBottom: 'calc(40px * var(--app-density-scale))'
    }
  }, React.createElement("div", {
    style: sp.cardHead
  }, React.createElement("span", {
    style: sp.cardTitle
  }, "Daily plan"), React.createElement("span", {
    style: {
      fontSize: 'calc(11px * var(--app-font-scale))',
      color: 'var(--fg-3)'
    }
  }, days.length, " day preview")), !days.length ? React.createElement("div", {
    style: sp.empty
  }, "No plan yet. Create one to generate a daily path.") : React.createElement("div", {
    style: sp.days
  }, days.slice(0, 14).map(day => React.createElement("div", {
    key: day.day,
    style: sp.dayCard
  }, React.createElement("div", {
    style: sp.dayTop
  }, React.createElement("span", {
    className: "mono",
    style: sp.dayNumber
  }, "Day ", day.day), React.createElement("span", {
    style: {
      fontSize: 'calc(11px * var(--app-font-scale))',
      color: 'var(--fg-3)'
    }
  }, day.estimatedMinutes, " min")), React.createElement("div", {
    style: sp.focus
  }, day.focusTopic), React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'calc(7px * var(--app-density-scale))',
      marginTop: 'calc(12px * var(--app-density-scale))'
    }
  }, (taskByDay[day.day] || []).map(row => {
    const t = row.task || {};
    const done = row.status === 'completed';
    return React.createElement("button", {
      key: row.id,
      disabled: busy || done,
      onClick: () => completeTask(row.id),
      style: {
        ...sp.task,
        ...(done ? sp.taskDone : {})
      }
    }, React.createElement("span", {
      style: sp.taskDot
    }, done ? React.createElement(Icon.Check, {
      size: 9
    }) : taskIcon(t.type, Icon)), React.createElement("span", {
      style: {
        flex: 1,
        textAlign: 'left'
      }
    }, t.title), React.createElement("span", {
      className: "chip chip-accent",
      style: {
        fontSize: 'calc(10px * var(--app-font-scale))'
      }
    }, "+20 XP"), React.createElement("span", {
      className: "mono",
      style: {
        fontSize: 'calc(10px * var(--app-font-scale))',
        color: 'var(--fg-3)'
      }
    }, t.estimatedMinutes || 0, "m"));
  })), React.createElement("div", {
    style: sp.success
  }, day.successCriteria)))))));
};
function taskIcon(type, Icon) {
  if (type === 'watch_video') return React.createElement(Icon.Play, {
    size: 9
  });
  if (type === 'read_notes') return React.createElement(Icon.PenNib, {
    size: 9
  });
  if (type === 'quiz') return React.createElement(Icon.Target, {
    size: 9
  });
  if (type === 'flashcards') return React.createElement(Icon.Cards, {
    size: 9
  });
  return React.createElement(Icon.Sparkle, {
    size: 9
  });
}
const sp = {
  page: {
    padding: 'calc(28px * var(--app-density-scale))',
    maxWidth: 1440,
    margin: '0 auto'
  },
  status: {
    padding: '10px 12px',
    borderRadius: 'var(--r-sm)',
    border: '1px solid var(--line)',
    background: 'var(--bg-1)',
    color: 'var(--fg-2)',
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    marginBottom: 'calc(14px * var(--app-density-scale))'
  },
  hero: {
    display: 'grid',
    gridTemplateColumns: '1fr 320px',
    gap: 'calc(18px * var(--app-density-scale))',
    alignItems: 'stretch',
    marginBottom: 'calc(14px * var(--app-density-scale))'
  },
  eyebrow: {
    fontSize: 'calc(11px * var(--app-font-scale))',
    color: 'var(--accent)',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    marginBottom: 'calc(10px * var(--app-density-scale))'
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 'calc(44px * var(--app-font-scale))',
    fontWeight: 300,
    letterSpacing: '-0.02em',
    margin: 0,
    lineHeight: 1.08
  },
  sub: {
    fontSize: 'calc(14px * var(--app-font-scale))',
    color: 'var(--fg-2)',
    maxWidth: 680,
    lineHeight: 1.6
  },
  actionCard: {
    padding: 'calc(20px * var(--app-density-scale))',
    borderRadius: 'var(--r-lg)',
    background: 'var(--bg-1)',
    border: '1px solid var(--line)'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 'calc(14px * var(--app-density-scale))',
    marginBottom: 'calc(14px * var(--app-density-scale))'
  },
  cardHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'calc(12px * var(--app-density-scale))'
  },
  cardTitle: {
    fontSize: 'calc(13px * var(--app-font-scale))',
    color: 'var(--fg-1)',
    fontWeight: 500
  },
  empty: {
    padding: 'calc(18px * var(--app-density-scale))',
    color: 'var(--fg-3)',
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    textAlign: 'center'
  },
  topicRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'calc(8px * var(--app-density-scale))',
    width: '100%',
    padding: '9px 10px',
    borderRadius: 'var(--r-sm)',
    background: 'var(--bg-2)',
    border: '1px solid var(--line)',
    color: 'var(--fg-1)',
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    cursor: 'pointer',
    textAlign: 'left'
  },
  topicRowActive: {
    borderColor: 'var(--accent)',
    boxShadow: '0 0 0 2px var(--accent-soft)',
    color: 'var(--fg-0)'
  },
  days: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 'calc(12px * var(--app-density-scale))',
    marginTop: 'calc(14px * var(--app-density-scale))'
  },
  dayCard: {
    padding: 'calc(16px * var(--app-density-scale))',
    borderRadius: 'var(--r-md)',
    background: 'var(--bg-2)',
    border: '1px solid var(--line)'
  },
  dayTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  dayNumber: {
    color: 'var(--accent)',
    fontSize: 'calc(10.5px * var(--app-font-scale))',
    letterSpacing: '0.08em',
    textTransform: 'uppercase'
  },
  focus: {
    fontFamily: 'var(--font-display)',
    fontSize: 'calc(22px * var(--app-font-scale))',
    color: 'var(--fg-0)',
    marginTop: 'calc(8px * var(--app-density-scale))'
  },
  task: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(8px * var(--app-density-scale))',
    width: '100%',
    padding: '8px 9px',
    borderRadius: 'var(--r-sm)',
    background: 'var(--bg-1)',
    border: '1px solid var(--line)',
    color: 'var(--fg-1)',
    fontSize: 'calc(12px * var(--app-font-scale))'
  },
  taskDone: {
    opacity: 0.62,
    textDecoration: 'line-through'
  },
  taskDot: {
    width: 18,
    height: 18,
    borderRadius: 6,
    background: 'var(--accent-glow)',
    border: '1px solid var(--accent-soft)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--accent)',
    flexShrink: 0
  },
  success: {
    borderTop: '1px solid var(--line-soft)',
    marginTop: 'calc(12px * var(--app-density-scale))',
    paddingTop: 'calc(10px * var(--app-density-scale))',
    color: 'var(--fg-3)',
    fontSize: 'calc(11.5px * var(--app-font-scale))',
    lineHeight: 1.45
  }
};
window.StudyPlan = StudyPlan;
})();


// ---- components/LessonRenderer.jsx ----
(function () {
  window.__NOESIS_BOOT.files.push("components/LessonRenderer.jsx");
const LessonRenderer = ({
  lesson,
  markdown
}) => {
  const parsed = parseLesson(lesson);
  if (!parsed) return React.createElement(MarkdownFallback, {
    markdown: markdown
  });
  const objectives = parsed.learningObjectives || [];
  const sections = parsed.sections || [];
  const startHere = parsed.startHere || parsed.learningPath && parsed.learningPath.startHere || parsed.prerequisites && parsed.prerequisites.length && `Review ${parsed.prerequisites[0]} first`;
  const byType = type => sections.filter(s => s.type === type);
  const usedSourceVisuals = new Set(sections.flatMap(section => section.sourceVisuals || []).map(v => String(v && (v.id || `${v.pageNumber || v.sourcePage || ''}:${v.slideNumber || ''}:${v.heading || ''}`))));
  const remainingSourceVisuals = (parsed.sourceVisuals || []).filter(v => !usedSourceVisuals.has(String(v && (v.id || `${v.pageNumber || v.sourcePage || ''}:${v.slideNumber || ''}:${v.heading || ''}`))));
  return React.createElement("article", {
    style: lr.page
  }, React.createElement("header", {
    style: lr.hero
  }, React.createElement("div", {
    style: lr.eyebrow
  }, labelFor(parsed.lessonType), " lesson"), React.createElement("h1", {
    style: lr.title
  }, parsed.topic || 'Learning Note'), parsed.sourceMaterial && parsed.sourceMaterial.grounding && React.createElement("div", {
    style: lr.meta
  }, "Grounding: ", parsed.sourceMaterial.grounding)), objectives.length > 0 && React.createElement("section", {
    style: lr.objectives
  }, objectives.slice(0, 4).map((item, i) => React.createElement("div", {
    key: i,
    style: lr.objectiveCard
  }, React.createElement("div", {
    style: lr.cardNumber
  }, String(i + 1).padStart(2, '0')), React.createElement("div", {
    style: lr.cardText
  }, item)))), startHere && React.createElement("section", {
    style: lr.startHere
  }, React.createElement("div", {
    style: lr.sectionLabel
  }, "Start here"), React.createElement("div", {
    style: lr.startTitle
  }, startHere), parsed.prerequisites && parsed.prerequisites.length > 0 && React.createElement("div", {
    style: lr.chips
  }, parsed.prerequisites.slice(0, 5).map(t => React.createElement("span", {
    key: t,
    style: lr.chip
  }, t)))), sections.map((section, i) => React.createElement(React.Fragment, {
    key: `${section.type}-${i}`
  }, React.createElement(LessonSection, {
    section: section
  }), React.createElement(SourceVisuals, {
    visuals: section.sourceVisuals,
    inline: true
  }))), React.createElement(SourceVisuals, {
    visuals: remainingSourceVisuals
  }), parsed.relatedTopics && parsed.relatedTopics.length > 0 && React.createElement("section", {
    style: lr.band
  }, React.createElement("div", {
    style: lr.sectionLabel
  }, "Related topics"), React.createElement("div", {
    style: lr.chips
  }, parsed.relatedTopics.map(t => React.createElement("span", {
    key: t,
    style: lr.chip
  }, t)))));
};
const SourceVisuals = ({
  visuals,
  inline = false
}) => {
  const list = (visuals || []).filter(v => v && v.id && v.materialId && v.imagePath);
  if (!list.length) return null;
  return React.createElement("section", {
    style: lr.band
  }, React.createElement("div", {
    style: lr.sectionLabel
  }, inline ? 'Source visual' : 'From your material'), React.createElement("div", {
    style: lr.sourceGrid
  }, list.slice(0, inline ? 2 : 6).map(v => React.createElement(SourceImage, {
    key: v.id,
    candidate: v
  }))));
};
const SourceImage = ({
  candidate
}) => {
  const [url, setUrl] = React.useState('');
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    let active = true;
    let objUrl = '';
    (async () => {
      try {
        objUrl = await window.NoesisAPI.materials.sourceVisualImageBlobUrl(candidate.materialId, candidate.id);
        if (active) setUrl(objUrl);else URL.revokeObjectURL(objUrl);
      } catch (_) {
        if (active) setFailed(true);
      }
    })();
    return () => {
      active = false;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [candidate.materialId, candidate.id]);
  if (failed) return null;
  const where = candidate.pageNumber != null ? `p.${candidate.pageNumber}` : candidate.slideNumber != null ? `slide ${candidate.slideNumber}` : '';
  return React.createElement("figure", {
    style: lr.sourceFigure
  }, url ? React.createElement("img", {
    src: url,
    alt: candidate.caption || 'Source visual',
    style: lr.sourceImg,
    onError: () => setFailed(true)
  }) : React.createElement("div", {
    style: lr.sourceLoading
  }, "Loading source visual\u2026"), (candidate.caption || candidate.explanation || where) && React.createElement("figcaption", {
    style: lr.caption
  }, candidate.explanation || candidate.caption || 'Source visual', where ? ` (${where})` : ''));
};
function parseLesson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    if (parsed && parsed.sections) return parsed;
    if (parsed && parsed.lesson && parsed.lesson.sections) return parsed.lesson;
  } catch (_) {}
  return null;
}
function preview(value, markdown) {
  const lesson = parseLesson(value);
  if (lesson) {
    const first = (lesson.sections || []).find(s => s.content);
    return (first && first.content || lesson.topic || '').replace(/\s+/g, ' ').slice(0, 130);
  }
  return cleanMarkdown(markdown || '').slice(0, 130);
}
function cleanMarkdown(markdown) {
  let text = String(markdown || '');
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.markdown === 'string') text = parsed.markdown;
  } catch (_) {}
  return text.replace(/\\n/g, '\n').replace(/\[chunk:\s*\d+\]/gi, '').trim();
}
const LessonSection = ({
  section
}) => {
  const type = section.type || 'section';
  if (type === 'hook') return React.createElement(HookSection, {
    section: section
  });
  if (type === 'code_example') return React.createElement(CodeSection, {
    section: section
  });
  if (type === 'code_walkthrough') return React.createElement(WalkthroughSection, {
    section: section
  });
  if (type === 'diagram' || type === 'mindmap') return React.createElement(DiagramSection, {
    section: section
  });
  if (type === 'common_mistakes') return React.createElement(CardsSection, {
    section: section,
    tone: "warning"
  });
  if (type === 'complexity') return React.createElement(CardsSection, {
    section: section,
    tone: "complexity"
  });
  if (type === 'checkpoint') return React.createElement(QuizSection, {
    section: section
  });
  return React.createElement(TextSection, {
    section: section
  });
};
const HookSection = ({
  section
}) => React.createElement("section", {
  style: lr.hook
}, React.createElement("div", {
  style: lr.sectionLabel
}, section.title), React.createElement("p", {
  style: lr.hookText
}, section.content), React.createElement(Callouts, {
  items: section.callouts
}));
const TextSection = ({
  section
}) => React.createElement("section", {
  style: lr.band
}, React.createElement("div", {
  style: lr.sectionLabel
}, section.type.replace(/_/g, ' ')), React.createElement("h2", {
  style: lr.h2
}, section.title), section.content && React.createElement("p", {
  style: lr.p
}, section.content), React.createElement(CardGrid, {
  cards: section.cards
}), React.createElement(Callouts, {
  items: section.callouts
}));
const CardsSection = ({
  section,
  tone
}) => React.createElement("section", {
  style: lr.band
}, React.createElement("div", {
  style: lr.sectionLabel
}, section.type.replace(/_/g, ' ')), React.createElement("h2", {
  style: lr.h2
}, section.title), section.content && React.createElement("p", {
  style: lr.p
}, section.content), React.createElement(CardGrid, {
  cards: section.cards,
  tone: tone
}), React.createElement(Callouts, {
  items: section.callouts
}));
const CodeSection = ({
  section
}) => {
  const code = section.code || {};
  return React.createElement("section", {
    style: lr.band
  }, React.createElement("div", {
    style: lr.sectionLabel
  }, "code example"), React.createElement("h2", {
    style: lr.h2
  }, section.title), section.content && React.createElement("p", {
    style: lr.p
  }, section.content), React.createElement("pre", {
    style: lr.pre
  }, React.createElement("code", null, code.content || '')), code.explanation && code.explanation.length > 0 && React.createElement("div", {
    style: lr.walkGrid
  }, code.explanation.map((item, i) => React.createElement("div", {
    key: i,
    style: lr.walkCard
  }, React.createElement("div", {
    style: lr.lineRange
  }, item.lineRange || `Step ${i + 1}`), React.createElement("div", null, item.text || item)))));
};
const WalkthroughSection = ({
  section
}) => React.createElement("section", {
  style: lr.band
}, React.createElement("div", {
  style: lr.sectionLabel
}, "walkthrough"), React.createElement("h2", {
  style: lr.h2
}, section.title), section.content && React.createElement("p", {
  style: lr.p
}, section.content), React.createElement(CardGrid, {
  cards: section.cards
}));
const DiagramSection = ({
  section
}) => React.createElement("section", {
  style: lr.band
}, React.createElement("div", {
  style: lr.sectionLabel
}, "visual model"), React.createElement("h2", {
  style: lr.h2
}, section.title), section.content && React.createElement("p", {
  style: lr.p
}, section.content), React.createElement(Diagram, {
  diagram: section.diagram,
  title: section.title
}), section.diagram && section.diagram.caption && React.createElement("p", {
  style: lr.caption
}, section.diagram.caption));
const QuizSection = ({
  section
}) => React.createElement("section", {
  style: lr.band
}, React.createElement("div", {
  style: lr.sectionLabel
}, "checkpoint"), React.createElement("h2", {
  style: lr.h2
}, section.title), section.content && React.createElement("p", {
  style: lr.p
}, section.content), (section.quiz || []).map((q, i) => React.createElement("div", {
  key: i,
  style: lr.quiz
}, React.createElement("div", {
  style: lr.quizQ
}, q.question), (q.options || []).map(opt => React.createElement("div", {
  key: opt,
  style: lr.option
}, opt)), q.answer && React.createElement("div", {
  style: lr.answer
}, "Answer: ", q.answer), q.explanation && React.createElement("div", {
  style: lr.explain
}, q.explanation))));
const CardGrid = ({
  cards,
  tone
}) => {
  const safe = Array.isArray(cards) ? cards.filter(c => c && (c.title || c.text)) : [];
  if (!safe.length) return null;
  return React.createElement("div", {
    style: lr.cardGrid
  }, safe.map((card, i) => React.createElement("div", {
    key: i,
    style: {
      ...lr.infoCard,
      ...(tone === 'warning' ? lr.warnCard : {}),
      ...(tone === 'complexity' ? lr.metricCard : {})
    }
  }, card.title && React.createElement("div", {
    style: lr.infoTitle
  }, card.title), card.text && React.createElement("div", {
    style: lr.infoText
  }, card.text))));
};
const Callouts = ({
  items
}) => {
  const safe = Array.isArray(items) ? items.filter(c => c && c.text) : [];
  if (!safe.length) return null;
  return React.createElement("div", {
    style: lr.callouts
  }, safe.map((c, i) => React.createElement("div", {
    key: i,
    style: lr.callout
  }, React.createElement("strong", null, c.type || 'note', ":"), " ", c.text, c.sourceChunkIds && c.sourceChunkIds.length > 0 && React.createElement("span", {
    style: lr.sourceBadges
  }, React.createElement("span", {
    style: lr.sourceBadge
  }, "source-backed")))));
};
const Diagram = ({
  diagram,
  title
}) => {
  if (!diagram || !Array.isArray(diagram.nodes) || diagram.nodes.length === 0) return null;
  const type = diagram.type || 'mindmap';
  if (window.TopicVisual) return React.createElement(window.TopicVisual, {
    template: type,
    data: diagram
  });
  if (type === 'mindmap') return React.createElement(MindmapDiagram, {
    diagram: diagram,
    title: title
  });
  if (type === 'uml_class' || type === 'inheritance_tree') return React.createElement(UmlDiagram, {
    diagram: diagram
  });
  if (type === 'linked_list' || type === 'linkedlist') return React.createElement(LinkedListDiagram, {
    diagram: diagram
  });
  if (type === 'stack') return React.createElement(StackDiagram, {
    diagram: diagram
  });
  if (type === 'queue') return React.createElement(QueueDiagram, {
    diagram: diagram
  });
  if (type === 'stack_queue') return isQueueDiagram(diagram) ? React.createElement(QueueDiagram, {
    diagram: diagram
  }) : React.createElement(StackDiagram, {
    diagram: diagram
  });
  if (type === 'tree') return React.createElement(TreeDiagram, {
    diagram: diagram
  });
  if (type === 'big_o_chart' || type === 'bigo_chart') return React.createElement(BigOChart, {
    diagram: diagram
  });
  return React.createElement(FlowDiagram, {
    diagram: diagram,
    title: title
  });
};
function nodeLabel(node) {
  if (typeof node === 'string') return node;
  return node.label || node.id || node.name || '';
}
function isQueueDiagram(diagram) {
  const text = [...(diagram.nodes || []), ...(diagram.operations || [])].map(nodeLabel).join(' ').toLowerCase();
  return /\b(queue|fifo|enqueue|dequeue|front|rear)\b/.test(text);
}
const MindmapDiagram = ({
  diagram,
  title
}) => {
  const raw = (diagram.nodes || []).map(nodeLabel).filter(Boolean);
  const center = raw[0] || title || 'Concept';
  const nodes = raw.slice(1, 7);
  const points = [[116, 78], [384, 78], [92, 210], [408, 210], [250, 36], [250, 252]];
  return React.createElement("div", {
    style: lr.diagram
  }, React.createElement("svg", {
    viewBox: "0 0 500 310",
    role: "img",
    "aria-label": `${center} mindmap`,
    style: lr.svg
  }, React.createElement("defs", null, React.createElement("filter", {
    id: "mindmapShadow",
    x: "-10%",
    y: "-10%",
    width: "120%",
    height: "120%"
  }, React.createElement("feDropShadow", {
    dx: "0",
    dy: "4",
    stdDeviation: "5",
    floodColor: "rgba(15,23,42,.14)"
  }))), nodes.map((node, i) => React.createElement("line", {
    key: `line-${i}`,
    x1: "250",
    y1: "156",
    x2: points[i][0],
    y2: points[i][1],
    stroke: "var(--line)",
    strokeWidth: "2.5"
  })), React.createElement("g", {
    filter: "url(#mindmapShadow)"
  }, React.createElement("rect", {
    x: "158",
    y: "116",
    width: "184",
    height: "80",
    rx: "20",
    fill: "var(--accent-glow)",
    stroke: "var(--accent-soft)"
  }), React.createElement(SvgTextLines, {
    x: 250,
    y: 148,
    width: 160,
    text: center,
    fill: "var(--fg-0)",
    fontSize: 14,
    lineHeight: 15,
    fontWeight: 700,
    maxLines: 3
  }), React.createElement("text", {
    x: "250",
    y: "171",
    textAnchor: "middle",
    fill: "var(--fg-3)",
    fontSize: "11"
  }, "mental model")), nodes.map((node, i) => React.createElement("g", {
    key: node + i,
    filter: "url(#mindmapShadow)"
  }, React.createElement("rect", {
    x: points[i][0] - 70,
    y: points[i][1] - 28,
    width: "140",
    height: "56",
    rx: "16",
    fill: "var(--bg-2)",
    stroke: "var(--line)"
  }), React.createElement(SvgTextLines, {
    x: points[i][0],
    y: points[i][1],
    width: 120,
    text: node,
    fill: "var(--fg-1)",
    fontSize: 11.5,
    lineHeight: 12,
    fontWeight: 600,
    maxLines: 3
  })))));
};
function wrapSvgLabel(value, maxChars = 16, maxLines = 2) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return [''];
  const words = text.split(' ');
  const lines = [];
  let current = '';
  const push = () => {
    if (current) {
      lines.push(current);
      current = '';
    }
  };
  for (const word of words) {
    if (word.length > maxChars) {
      push();
      lines.push(`${word.slice(0, Math.max(3, maxChars - 3))}...`);
    } else {
      const next = current ? `${current} ${word}` : word;
      if (next.length > maxChars) {
        push();
        current = word;
      } else {
        current = next;
      }
    }
    if (lines.length >= maxLines) break;
  }
  if (lines.length < maxLines) push();
  if (lines.length > maxLines) lines.length = maxLines;
  if (lines.length === maxLines && text.length > lines.join(' ').length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, Math.max(3, maxChars - 3)).trim()}...`;
  }
  return lines.length ? lines : [''];
}
const SvgTextLines = ({
  x,
  y,
  text,
  width = 120,
  fontSize = 12,
  lineHeight = 13,
  fontWeight = 700,
  fill = 'var(--fg-0)',
  maxLines = 2
}) => {
  const maxChars = Math.max(6, Math.floor(width / Math.max(6, fontSize * 0.58)));
  const lines = wrapSvgLabel(text, maxChars, maxLines);
  const startY = y - (lines.length - 1) * lineHeight / 2;
  return React.createElement("text", {
    textAnchor: "middle",
    fill: fill,
    fontSize: fontSize,
    fontWeight: fontWeight
  }, lines.map((line, index) => React.createElement("tspan", {
    key: `${line}-${index}`,
    x: x,
    y: startY + index * lineHeight
  }, line)));
};
const UmlDiagram = ({
  diagram
}) => {
  const nodes = diagram.nodes || [];
  const edges = diagram.edges || [];
  const parent = edges[0] && edges[0][1] ? edges[0][1] : nodeLabel(nodes[0]);
  const children = nodes.filter(n => nodeLabel(n) !== parent);
  const parentNode = nodes.find(n => nodeLabel(n) === parent) || nodes[0];
  return React.createElement("div", {
    style: lr.diagram
  }, React.createElement(ClassBox, {
    node: parentNode
  }), React.createElement("div", {
    style: lr.umlChildren
  }, children.map((child, i) => React.createElement("div", {
    key: i,
    style: lr.umlChildWrap
  }, React.createElement("div", {
    style: lr.umlArrow
  }, "extends"), React.createElement(ClassBox, {
    node: child
  })))));
};
const ClassBox = ({
  node
}) => {
  const obj = typeof node === 'string' ? {
    label: node
  } : node;
  return React.createElement("div", {
    style: lr.classBox
  }, React.createElement("div", {
    style: lr.className
  }, nodeLabel(obj)), obj.fields && obj.fields.length > 0 && React.createElement("div", {
    style: lr.classPart
  }, obj.fields.map(f => React.createElement("div", {
    key: f
  }, "- ", f))), obj.methods && obj.methods.length > 0 && React.createElement("div", {
    style: lr.classPart
  }, obj.methods.map(m => React.createElement("div", {
    key: m
  }, "+ ", m))));
};
const LinkedListDiagram = ({
  diagram
}) => {
  const nodes = (diagram.nodes || []).map(nodeLabel).filter(n => !/^(head|null)$/i.test(n));
  return React.createElement("div", {
    style: lr.listDiagram
  }, React.createElement("div", {
    style: lr.headNode
  }, "head"), React.createElement("div", {
    style: lr.arrow
  }, "->"), nodes.map((n, i) => React.createElement(React.Fragment, {
    key: `${n}-${i}`
  }, React.createElement("div", {
    style: lr.listNode
  }, React.createElement("span", {
    style: lr.nodeData
  }, n), React.createElement("span", {
    style: lr.nodeNext
  }, "next")), React.createElement("div", {
    style: lr.arrow
  }, "->"))), React.createElement("div", {
    style: lr.nullNode
  }, "null"));
};
const StackDiagram = ({
  diagram
}) => {
  const nodes = (diagram.nodes || []).map(nodeLabel);
  return React.createElement("div", {
    style: lr.stack
  }, nodes.map((n, i) => React.createElement("div", {
    key: `${n}-${i}`,
    style: i === 0 ? lr.stackTop : lr.stackItem
  }, n)));
};
const QueueDiagram = ({
  diagram
}) => {
  const nodes = (diagram.nodes || []).map(nodeLabel).filter(n => !/^(front|rear)$/i.test(n));
  return React.createElement("div", {
    style: lr.queue
  }, React.createElement("div", {
    style: lr.queueLabel
  }, "dequeue"), nodes.map((n, i) => React.createElement("div", {
    key: `${n}-${i}`,
    style: lr.queueItem
  }, n)), React.createElement("div", {
    style: lr.queueLabel
  }, "enqueue"));
};
const TreeDiagram = ({
  diagram
}) => {
  const nodes = (diagram.nodes || []).map(nodeLabel).slice(0, 7);
  return React.createElement("div", {
    style: lr.diagram
  }, React.createElement("svg", {
    viewBox: "0 0 520 300",
    role: "img",
    "aria-label": "tree diagram",
    style: lr.svg
  }, [[0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [2, 6]].map(([a, b]) => nodes[b] && React.createElement("line", {
    key: `${a}-${b}`,
    x1: treePoint(a).x,
    y1: treePoint(a).y,
    x2: treePoint(b).x,
    y2: treePoint(b).y,
    stroke: "var(--line)",
    strokeWidth: "2.5"
  })), nodes.map((n, i) => {
    const p = treePoint(i);
    return React.createElement("g", {
      key: `${n}-${i}`
    }, React.createElement("circle", {
      cx: p.x,
      cy: p.y,
      r: "31",
      fill: i === 0 ? 'var(--accent-glow)' : 'var(--bg-2)',
      stroke: i === 0 ? 'var(--accent-soft)' : 'var(--line)',
      strokeWidth: "2"
    }), React.createElement(SvgTextLines, {
      x: p.x,
      y: p.y + 1,
      width: 52,
      text: n,
      fill: "var(--fg-0)",
      fontSize: 11,
      lineHeight: 11,
      fontWeight: 700,
      maxLines: 3
    }));
  })));
};
function treePoint(i) {
  const points = [{
    x: 260,
    y: 52
  }, {
    x: 150,
    y: 140
  }, {
    x: 370,
    y: 140
  }, {
    x: 94,
    y: 238
  }, {
    x: 206,
    y: 238
  }, {
    x: 314,
    y: 238
  }, {
    x: 426,
    y: 238
  }];
  return points[i] || points[0];
}
const BigOChart = () => React.createElement("div", {
  style: lr.diagram
}, React.createElement("svg", {
  viewBox: "0 0 560 310",
  role: "img",
  "aria-label": "Big O complexity chart",
  style: lr.svg
}, React.createElement("line", {
  x1: "60",
  y1: "260",
  x2: "500",
  y2: "260",
  stroke: "var(--fg-3)",
  strokeWidth: "2.5"
}), React.createElement("line", {
  x1: "60",
  y1: "40",
  x2: "60",
  y2: "260",
  stroke: "var(--fg-3)",
  strokeWidth: "2.5"
}), React.createElement(ComplexityCurve, {
  color: "#22c55e",
  label: "O(1)",
  points: "60,206 500,206"
}), React.createElement(ComplexityCurve, {
  color: "#3b82f6",
  label: "O(log n)",
  points: "60,220 140,198 240,178 360,162 500,148"
}), React.createElement(ComplexityCurve, {
  color: "#eab308",
  label: "O(n)",
  points: "60,236 160,206 260,176 380,140 500,104"
}), React.createElement(ComplexityCurve, {
  color: "#f97316",
  label: "O(n log n)",
  points: "60,244 150,216 250,176 365,112 500,58"
}), React.createElement(ComplexityCurve, {
  color: "#ef4444",
  label: "O(n^2)",
  points: "60,252 170,226 270,176 365,96 455,42"
}), React.createElement("text", {
  x: "502",
  y: "285",
  fill: "var(--fg-3)",
  fontSize: "12"
}, "input size"), React.createElement("text", {
  x: "14",
  y: "38",
  fill: "var(--fg-3)",
  fontSize: "12"
}, "time")));
const ComplexityCurve = ({
  color,
  label,
  points
}) => {
  const last = points.split(' ').pop().split(',').map(Number);
  return React.createElement("g", null, React.createElement("polyline", {
    fill: "none",
    stroke: color,
    strokeWidth: "3.5",
    points: points,
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }), React.createElement("text", {
    x: last[0] + 8,
    y: last[1] + 4,
    fill: color,
    fontSize: "12",
    fontWeight: "700"
  }, label));
};
const FlowDiagram = ({
  diagram,
  title
}) => {
  const nodes = (diagram.nodes || []).map(nodeLabel).slice(0, 7);
  return React.createElement("div", {
    style: lr.flow
  }, nodes.map((n, i) => React.createElement(React.Fragment, {
    key: `${n}-${i}`
  }, React.createElement("div", {
    style: i === 0 ? lr.flowRoot : lr.flowNode
  }, n), i < nodes.length - 1 && React.createElement("div", {
    style: lr.arrow
  }, "->"))));
};
const MarkdownFallback = ({
  markdown
}) => {
  const body = cleanMarkdown(markdown || '');
  const html = window.marked ? window.marked.parse(body) : body;
  const safe = window.DOMPurify ? window.DOMPurify.sanitize(html) : html;
  return React.createElement("div", {
    className: "md-rendered",
    style: lr.markdown,
    dangerouslySetInnerHTML: {
      __html: safe
    }
  });
};
function labelFor(type) {
  return String(type || 'general').replace(/_/g, ' ');
}
const lr = {
  page: {
    color: 'var(--fg-1)'
  },
  hero: {
    padding: '10px 0 24px',
    borderBottom: '1px solid var(--line-soft)',
    marginBottom: 'calc(22px * var(--app-density-scale))'
  },
  eyebrow: {
    fontSize: 'calc(11px * var(--app-font-scale))',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--accent)',
    marginBottom: 'calc(8px * var(--app-density-scale))'
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 'calc(38px * var(--app-font-scale))',
    fontWeight: 300,
    lineHeight: 1.12,
    margin: 0,
    color: 'var(--fg-0)'
  },
  meta: {
    marginTop: 'calc(10px * var(--app-density-scale))',
    fontSize: 'calc(12px * var(--app-font-scale))',
    color: 'var(--fg-3)'
  },
  objectives: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 'calc(10px * var(--app-density-scale))',
    marginBottom: 'calc(22px * var(--app-density-scale))'
  },
  objectiveCard: {
    border: '1px solid var(--line)',
    borderRadius: 8,
    background: 'var(--bg-1)',
    padding: 'calc(14px * var(--app-density-scale))'
  },
  cardNumber: {
    fontSize: 'calc(10.5px * var(--app-font-scale))',
    color: 'var(--accent)',
    fontFamily: 'var(--font-mono)',
    marginBottom: 'calc(8px * var(--app-density-scale))'
  },
  cardText: {
    fontSize: 'calc(13px * var(--app-font-scale))',
    lineHeight: 1.45,
    color: 'var(--fg-0)',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word'
  },
  startHere: {
    padding: 'calc(16px * var(--app-density-scale))',
    borderRadius: 8,
    background: 'var(--accent-glow)',
    border: '1px solid var(--accent-soft)',
    marginBottom: 'calc(18px * var(--app-density-scale))'
  },
  startTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 'calc(24px * var(--app-font-scale))',
    color: 'var(--fg-0)',
    marginBottom: 'calc(10px * var(--app-density-scale))',
    lineHeight: 1.2
  },
  hook: {
    padding: 'calc(20px * var(--app-density-scale))',
    borderRadius: 8,
    background: 'linear-gradient(135deg, color-mix(in oklab, var(--accent) 12%, transparent), var(--bg-1))',
    border: '1px solid var(--line)',
    marginBottom: 'calc(18px * var(--app-density-scale))'
  },
  hookText: {
    fontSize: 'calc(17px * var(--app-font-scale))',
    lineHeight: 1.65,
    margin: 0,
    color: 'var(--fg-0)'
  },
  band: {
    padding: '18px 0',
    borderBottom: '1px solid var(--line-soft)'
  },
  sectionLabel: {
    fontSize: 'calc(10.5px * var(--app-font-scale))',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--fg-3)',
    marginBottom: 'calc(7px * var(--app-density-scale))'
  },
  h2: {
    fontSize: 'calc(24px * var(--app-font-scale))',
    fontWeight: 500,
    lineHeight: 1.22,
    margin: '0 0 10px',
    color: 'var(--fg-0)'
  },
  p: {
    fontSize: 'calc(14.5px * var(--app-font-scale))',
    lineHeight: 1.75,
    margin: '0 0 14px',
    color: 'var(--fg-1)'
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
    gap: 'calc(10px * var(--app-density-scale))',
    marginTop: 'calc(12px * var(--app-density-scale))'
  },
  infoCard: {
    border: '1px solid var(--line)',
    borderRadius: 8,
    background: 'var(--bg-1)',
    padding: 'calc(13px * var(--app-density-scale))',
    minWidth: 0,
    overflowWrap: 'anywhere',
    wordBreak: 'break-word'
  },
  warnCard: {
    borderColor: 'color-mix(in oklab, var(--warn) 36%, var(--line))',
    background: 'color-mix(in oklab, var(--warn) 8%, var(--bg-1))'
  },
  metricCard: {
    borderColor: 'color-mix(in oklab, var(--accent) 32%, var(--line))'
  },
  infoTitle: {
    fontSize: 'calc(13px * var(--app-font-scale))',
    color: 'var(--fg-0)',
    fontWeight: 600,
    marginBottom: 'calc(5px * var(--app-density-scale))',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word'
  },
  infoText: {
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    color: 'var(--fg-2)',
    lineHeight: 1.5,
    overflowWrap: 'anywhere',
    wordBreak: 'break-word'
  },
  pre: {
    background: '#0f172a',
    color: '#e2e8f0',
    padding: 'calc(16px * var(--app-density-scale))',
    borderRadius: 8,
    overflow: 'auto',
    lineHeight: 1.55,
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    border: '1px solid var(--line)'
  },
  walkGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
    gap: 'calc(10px * var(--app-density-scale))',
    marginTop: 'calc(12px * var(--app-density-scale))'
  },
  walkCard: {
    border: '1px solid var(--line)',
    borderRadius: 8,
    background: 'var(--bg-1)',
    padding: 'calc(12px * var(--app-density-scale))',
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    lineHeight: 1.5
  },
  lineRange: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'calc(10.5px * var(--app-font-scale))',
    color: 'var(--accent)',
    marginBottom: 'calc(6px * var(--app-density-scale))'
  },
  diagram: {
    border: '1px solid var(--line)',
    borderRadius: 8,
    background: 'var(--bg-1)',
    padding: 'calc(18px * var(--app-density-scale))',
    marginTop: 'calc(12px * var(--app-density-scale))',
    overflow: 'auto'
  },
  svg: {
    width: '100%',
    maxWidth: 720,
    display: 'block',
    margin: '0 auto'
  },
  umlChildren: {
    display: 'flex',
    gap: 'calc(14px * var(--app-density-scale))',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: 'calc(14px * var(--app-density-scale))'
  },
  umlChildWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'calc(8px * var(--app-density-scale))'
  },
  umlArrow: {
    fontSize: 'calc(11px * var(--app-font-scale))',
    color: 'var(--fg-3)',
    fontFamily: 'var(--font-mono)'
  },
  classBox: {
    minWidth: 170,
    maxWidth: 260,
    border: '1px solid var(--accent-soft)',
    borderRadius: 8,
    background: 'var(--bg-0)',
    overflow: 'hidden'
  },
  className: {
    padding: '9px 11px',
    textAlign: 'center',
    fontWeight: 700,
    color: 'var(--fg-0)',
    borderBottom: '1px solid var(--line-soft)',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word'
  },
  classPart: {
    padding: '8px 11px',
    borderTop: '1px solid var(--line-soft)',
    fontSize: 'calc(12px * var(--app-font-scale))',
    fontFamily: 'var(--font-mono)',
    color: 'var(--fg-2)',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word'
  },
  listDiagram: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(8px * var(--app-density-scale))',
    flexWrap: 'wrap',
    border: '1px solid var(--line)',
    borderRadius: 8,
    background: 'var(--bg-1)',
    padding: 'calc(16px * var(--app-density-scale))',
    marginTop: 'calc(12px * var(--app-density-scale))'
  },
  headNode: {
    padding: '8px 12px',
    borderRadius: 8,
    background: 'var(--accent-glow)',
    border: '1px solid var(--accent-soft)',
    color: 'var(--fg-0)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'calc(12px * var(--app-font-scale))',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word'
  },
  listNode: {
    padding: '8px 12px',
    borderRadius: 8,
    background: 'var(--bg-2)',
    border: '1px solid var(--line)',
    color: 'var(--fg-0)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'calc(12px * var(--app-font-scale))',
    maxWidth: 170,
    overflowWrap: 'anywhere',
    wordBreak: 'break-word'
  },
  nodeData: {
    display: 'inline-block',
    paddingRight: 8,
    marginRight: 8,
    borderRight: '1px solid var(--line)'
  },
  nodeNext: {
    color: 'var(--fg-3)'
  },
  nullNode: {
    padding: '8px 12px',
    borderRadius: 8,
    background: 'color-mix(in oklab, var(--warn) 8%, var(--bg-1))',
    border: '1px solid color-mix(in oklab, var(--warn) 35%, var(--line))',
    color: 'var(--fg-0)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'calc(12px * var(--app-font-scale))'
  },
  arrow: {
    color: 'var(--fg-3)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'calc(13px * var(--app-font-scale))'
  },
  stack: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'calc(6px * var(--app-density-scale))',
    border: '1px solid var(--line)',
    borderRadius: 8,
    background: 'var(--bg-1)',
    padding: 'calc(16px * var(--app-density-scale))',
    marginTop: 'calc(12px * var(--app-density-scale))'
  },
  stackTop: {
    width: 220,
    padding: '9px 12px',
    borderRadius: 8,
    background: 'var(--accent-glow)',
    border: '1px solid var(--accent-soft)',
    textAlign: 'center',
    fontFamily: 'var(--font-mono)',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word'
  },
  stackItem: {
    width: 220,
    padding: '9px 12px',
    borderRadius: 8,
    background: 'var(--bg-2)',
    border: '1px solid var(--line)',
    textAlign: 'center',
    fontFamily: 'var(--font-mono)',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word'
  },
  queue: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(8px * var(--app-density-scale))',
    flexWrap: 'wrap',
    border: '1px solid var(--line)',
    borderRadius: 8,
    background: 'var(--bg-1)',
    padding: 'calc(16px * var(--app-density-scale))',
    marginTop: 'calc(12px * var(--app-density-scale))'
  },
  queueLabel: {
    padding: '8px 10px',
    borderRadius: 8,
    background: 'var(--accent-glow)',
    border: '1px solid var(--accent-soft)',
    color: 'var(--fg-0)',
    fontSize: 'calc(12px * var(--app-font-scale))',
    fontFamily: 'var(--font-mono)'
  },
  queueItem: {
    minWidth: 54,
    maxWidth: 160,
    textAlign: 'center',
    padding: '9px 12px',
    borderRadius: 8,
    background: 'var(--bg-2)',
    border: '1px solid var(--line)',
    color: 'var(--fg-0)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'calc(12px * var(--app-font-scale))',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word'
  },
  flow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(8px * var(--app-density-scale))',
    flexWrap: 'wrap',
    border: '1px solid var(--line)',
    borderRadius: 8,
    background: 'var(--bg-1)',
    padding: 'calc(16px * var(--app-density-scale))',
    marginTop: 'calc(12px * var(--app-density-scale))'
  },
  flowRoot: {
    padding: '8px 12px',
    borderRadius: 8,
    background: 'var(--accent-glow)',
    border: '1px solid var(--accent-soft)',
    color: 'var(--fg-0)',
    fontSize: 'calc(12px * var(--app-font-scale))',
    maxWidth: 180,
    overflowWrap: 'anywhere',
    wordBreak: 'break-word'
  },
  flowNode: {
    padding: '8px 12px',
    borderRadius: 8,
    background: 'var(--bg-2)',
    border: '1px solid var(--line)',
    color: 'var(--fg-0)',
    fontSize: 'calc(12px * var(--app-font-scale))',
    maxWidth: 180,
    overflowWrap: 'anywhere',
    wordBreak: 'break-word'
  },
  caption: {
    margin: '8px 0 0',
    fontSize: 'calc(12px * var(--app-font-scale))',
    color: 'var(--fg-3)'
  },
  sourceGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 'calc(12px * var(--app-density-scale))',
    marginTop: 'calc(10px * var(--app-density-scale))'
  },
  sourceFigure: {
    margin: 0,
    border: '1px solid var(--line)',
    borderRadius: 8,
    background: 'var(--bg-1)',
    padding: 'calc(10px * var(--app-density-scale))'
  },
  sourceImg: {
    width: '100%',
    height: 'auto',
    display: 'block',
    borderRadius: 6,
    background: 'var(--bg-0)'
  },
  sourceLoading: {
    padding: 'calc(22px * var(--app-density-scale))',
    textAlign: 'center',
    color: 'var(--fg-3)',
    fontSize: 'calc(12px * var(--app-font-scale))'
  },
  callouts: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'calc(8px * var(--app-density-scale))',
    marginTop: 'calc(12px * var(--app-density-scale))'
  },
  callout: {
    borderLeft: '3px solid var(--accent)',
    background: 'var(--bg-1)',
    padding: '9px 11px',
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    lineHeight: 1.5
  },
  sourceBadges: {
    display: 'inline-flex',
    gap: 'calc(5px * var(--app-density-scale))',
    flexWrap: 'wrap',
    marginLeft: 8,
    verticalAlign: 'middle'
  },
  sourceBadge: {
    border: '1px solid var(--line)',
    borderRadius: 999,
    padding: '1px 6px',
    fontSize: 'calc(10.5px * var(--app-font-scale))',
    color: 'var(--fg-3)',
    background: 'var(--bg-0)'
  },
  quiz: {
    border: '1px solid var(--line)',
    borderRadius: 8,
    background: 'var(--bg-1)',
    padding: 'calc(14px * var(--app-density-scale))',
    marginTop: 'calc(12px * var(--app-density-scale))'
  },
  quizQ: {
    fontSize: 'calc(14px * var(--app-font-scale))',
    color: 'var(--fg-0)',
    fontWeight: 600,
    marginBottom: 'calc(10px * var(--app-density-scale))'
  },
  option: {
    padding: '8px 10px',
    background: 'var(--bg-2)',
    border: '1px solid var(--line-soft)',
    borderRadius: 6,
    marginTop: 'calc(6px * var(--app-density-scale))',
    fontSize: 'calc(12.5px * var(--app-font-scale))'
  },
  answer: {
    marginTop: 'calc(10px * var(--app-density-scale))',
    color: 'var(--ok)',
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    fontWeight: 600
  },
  explain: {
    marginTop: 'calc(4px * var(--app-density-scale))',
    color: 'var(--fg-2)',
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    lineHeight: 1.45
  },
  chips: {
    display: 'flex',
    gap: 'calc(8px * var(--app-density-scale))',
    flexWrap: 'wrap'
  },
  chip: {
    border: '1px solid var(--line)',
    borderRadius: 999,
    padding: '5px 9px',
    fontSize: 'calc(11.5px * var(--app-font-scale))',
    color: 'var(--fg-2)',
    background: 'var(--bg-1)'
  },
  markdown: {
    minHeight: 420,
    fontSize: 'calc(14.5px * var(--app-font-scale))',
    lineHeight: 1.75,
    color: 'var(--fg-1)'
  }
};
LessonRenderer.parse = parseLesson;
LessonRenderer.preview = preview;
window.LessonRenderer = LessonRenderer;
})();


// ---- components/Study.jsx ----
(function () {
  window.__NOESIS_BOOT.files.push("components/Study.jsx");
const Notes = ({
  onNav
}) => {
  const Icon = window.Icon;
  const [data, setData] = React.useState({
    notes: [],
    folders: []
  });
  const [active, setActive] = React.useState(0);
  const [status, setStatus] = React.useState('');
  const refresh = React.useCallback(async () => {
    const d = await window.NoesisAPI.notes.list();
    setData(d || {
      notes: [],
      folders: []
    });
    setActive(i => Math.min(i, Math.max(0, (d && d.notes || []).length - 1)));
  }, []);
  React.useEffect(() => {
    refresh().catch(e => setStatus(e.message || 'Failed to load notes'));
  }, [refresh]);
  const folders = (data.folders || []).map((f, i) => ({
    name: f.folder,
    count: f.count,
    active: i === 0
  }));
  const notes = (data.notes || []).map((n, i) => ({
    id: n.id,
    material_id: n.material_id,
    t: n.title,
    updated: n.updated_at ? new Date(n.updated_at).toLocaleString() : '',
    preview: (n.body_md || '').slice(0, 120),
    lesson_json: n.lesson_json,
    source_map_json: n.source_map_json,
    body_md: n.body_md,
    tag: n.folder,
    tags_json: n.tags_json,
    active: i === active
  })).map(n => ({
    ...n,
    preview: window.LessonRenderer && window.LessonRenderer.preview ? window.LessonRenderer.preview(n.lesson_json, n.body_md) : n.preview
  }));
  const current = notes[active] || null;
  const createNote = async () => {
    const title = window.prompt('Note title');
    if (!title || !title.trim()) return;
    setStatus('Creating note...');
    try {
      await window.NoesisAPI.notes.create({
        title: title.trim(),
        body_md: '',
        folder: 'Manual',
        tags: ['manual']
      });
      await refresh();
      setActive(0);
      setStatus('');
    } catch (e) {
      setStatus(e.message || 'Failed to create note');
    }
  };
  return React.createElement("div", null, React.createElement(window.Topbar, {
    title: "Notes",
    crumbs: ['Workspace'],
    right: React.createElement("button", {
      className: "btn btn-accent",
      onClick: createNote
    }, React.createElement(Icon.Plus, {
      size: 12
    }), " New note")
  }), React.createElement("div", {
    style: ns.layout
  }, React.createElement("aside", {
    style: ns.folders
  }, React.createElement("div", {
    style: ns.sideHead
  }, "Folders"), React.createElement("div", {
    style: {
      padding: '0 8px',
      display: 'flex',
      flexDirection: 'column',
      gap: 'calc(1px * var(--app-density-scale))'
    }
  }, folders.length === 0 && React.createElement("div", {
    style: ns.emptySide
  }, "No folders yet"), folders.map((f, i) => React.createElement("button", {
    key: i,
    style: {
      ...ns.folderButton,
      background: f.active ? 'var(--bg-2)' : 'transparent',
      color: f.active ? 'var(--fg-0)' : 'var(--fg-2)'
    }
  }, React.createElement(Icon.Folder, {
    size: 13
  }), React.createElement("span", {
    style: {
      flex: 1,
      textAlign: 'left'
    }
  }, f.name), React.createElement("span", {
    style: {
      fontSize: 'calc(10.5px * var(--app-font-scale))',
      color: 'var(--fg-3)'
    },
    className: "mono"
  }, f.count))))), React.createElement("section", {
    style: ns.list
  }, React.createElement("div", {
    style: {
      padding: '16px 18px',
      borderBottom: '1px solid var(--line-soft)'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 'calc(13px * var(--app-font-scale))',
      color: 'var(--fg-0)',
      fontWeight: 500
    }
  }, folders[0] && folders[0].name || 'All notes'), React.createElement("div", {
    style: {
      fontSize: 'calc(11px * var(--app-font-scale))',
      color: 'var(--fg-3)',
      marginTop: 'calc(2px * var(--app-density-scale))'
    }
  }, notes.length, " note", notes.length === 1 ? '' : 's', " sorted by recent"), status && React.createElement("div", {
    style: {
      fontSize: 'calc(11px * var(--app-font-scale))',
      color: 'var(--fg-3)',
      marginTop: 'calc(6px * var(--app-density-scale))'
    }
  }, status)), React.createElement("div", null, notes.length === 0 && React.createElement("div", {
    style: ns.emptyList
  }, "No notes yet. Generate notes from a material or create one manually."), notes.map((n, i) => React.createElement("button", {
    key: n.id,
    onClick: () => setActive(i),
    style: {
      ...ns.noteButton,
      background: n.active ? 'var(--bg-2)' : 'transparent',
      borderLeft: n.active ? '2px solid var(--accent)' : '2px solid transparent'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 'calc(13px * var(--app-font-scale))',
      color: 'var(--fg-0)',
      fontWeight: 500
    }
  }, n.t), React.createElement("div", {
    style: {
      fontSize: 'calc(11.5px * var(--app-font-scale))',
      color: 'var(--fg-3)',
      display: 'flex',
      gap: 'calc(8px * var(--app-density-scale))'
    }
  }, React.createElement("span", null, n.updated), React.createElement("span", null, n.tag)), React.createElement("div", {
    style: ns.preview
  }, n.preview || 'Empty note'))))), React.createElement(NotesEditor, {
    current: current,
    onSaved: refresh,
    onDeleted: async () => {
      await refresh();
      setActive(0);
    }
  })));
};
const NotesEditor = ({
  current,
  onSaved,
  onDeleted
}) => {
  const Icon = window.Icon;
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [mode, setMode] = React.useState('read');
  const [audioStyle, setAudioStyle] = React.useState('none');
  const [audioBusy, setAudioBusy] = React.useState(false);
  const [audioStatus, setAudioStatus] = React.useState('');
  const [audioError, setAudioError] = React.useState('');
  const [audioUrl, setAudioUrl] = React.useState('');
  const [audioPlaying, setAudioPlaying] = React.useState(false);
  const audioRef = React.useRef(null);
  const audioRequestRef = React.useRef(0);
  React.useEffect(() => {
    audioRequestRef.current += 1;
    setTitle(current ? current.t : '');
    setBody(current ? current.body_md || '' : '');
    setStatus('');
    setMode('read');
    setAudioStyle('none');
    setAudioStatus('');
    setAudioError('');
    setAudioBusy(false);
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch (_) {}
      audioRef.current = null;
    }
    setAudioPlaying(false);
    setAudioUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
  }, [current && current.id]);
  React.useEffect(() => {
    return () => {
      if (audioRef.current) {
        try {
          audioRef.current.pause();
        } catch (_) {}
      }
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);
  const tags = React.useMemo(() => {
    let parsed = [];
    try {
      parsed = current && current.tags_json ? JSON.parse(current.tags_json) : [];
    } catch (_) {}
    return {
      folder: current && current.tag,
      tags: parsed
    };
  }, [current]);
  const materialId = current && current.material_id ? current.material_id : null;
  const save = async () => {
    if (!current) return;
    setBusy(true);
    setStatus('Saving...');
    try {
      await window.NoesisAPI.notes.update(current.id, {
        title,
        body_md: body,
        folder: tags.folder || 'General',
        tags: tags.tags
      });
      setStatus('Saved');
      onSaved && (await onSaved());
    } catch (e) {
      setStatus('Failed: ' + (e.message || 'error'));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!current || !window.confirm('Delete this note?')) return;
    setBusy(true);
    setStatus('Deleting...');
    try {
      await window.NoesisAPI.notes.remove(current.id);
      onDeleted && (await onDeleted());
    } catch (e) {
      setStatus('Failed: ' + (e.message || 'error'));
    } finally {
      setBusy(false);
    }
  };
  const generateCards = async () => {
    if (!materialId) return;
    setBusy(true);
    setStatus('Generating flashcards...');
    try {
      const r = await window.NoesisAPI.flashcards.generate({
        material_id: materialId,
        count: 8
      });
      if (r.reused) setStatus('Using existing flashcards for this material.');else if (r.fallback) setStatus(r.message || 'Created fallback flashcards from source material.');else setStatus(`Created ${r.created} cards.`);
    } catch (e) {
      setStatus('Failed: ' + (e.message || 'error'));
    } finally {
      setBusy(false);
    }
  };
  const clearLoadedAudio = () => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch (_) {}
      audioRef.current = null;
    }
    setAudioPlaying(false);
    setAudioUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
  };
  const friendlyNoteAudioError = err => {
    const code = String(err && (err.code || err.message) || '').trim();
    if (/audio_404|audio_not_found|not_found/i.test(code)) return 'No audio has been generated yet. Choose Generate audio first.';
    if (/note_not_found/i.test(code)) return 'This note could not be found. Refresh your notes and try again.';
    if (/rate_limited/i.test(code)) return 'Audio generation is cooling down. Wait a few seconds and try again.';
    if (/tts|voice|audio/i.test(code)) return 'Voice generation failed. You can keep reading the note and try again later.';
    return code || 'Could not prepare note audio.';
  };
  const loadNoteAudio = async style => {
    const res = await window.NoesisAPI.notes.audioBlob(current.id, style);
    if (!res.ok) throw new Error('audio_' + res.status);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch (_) {}
    }
    setAudioUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    const audio = new Audio(url);
    audio.onended = () => setAudioPlaying(false);
    audioRef.current = audio;
    setAudioStatus(style === 'brief' ? 'Brief voice ready.' : 'Detailed voice ready.');
    return audio;
  };
  const checkNoteAudio = async style => {
    if (!current || style === 'none') return;
    const requestId = ++audioRequestRef.current;
    clearLoadedAudio();
    setAudioError('');
    setAudioStatus('Checking saved voice explanation...');
    try {
      const meta = await window.NoesisAPI.notes.audioMeta(current.id, style);
      if (requestId !== audioRequestRef.current) return;
      if (!meta || meta.status === 'missing') {
        setAudioStatus('No audio generated yet.');
        return;
      }
      await loadNoteAudio(style);
      if (requestId === audioRequestRef.current) setAudioStatus(style === 'brief' ? 'Brief voice ready.' : 'Detailed voice ready.');
    } catch (e) {
      if (requestId !== audioRequestRef.current) return;
      setAudioError(friendlyNoteAudioError(e));
      setAudioStatus('');
    }
  };
  const generateAudio = async () => {
    if (!current || audioStyle === 'none' || audioBusy) return;
    setAudioBusy(true);
    setAudioError('');
    setAudioStatus('Preparing voice explanation...');
    try {
      const job = await window.NoesisAPI.notes.audio(current.id, {
        style: audioStyle,
        voice: 'default',
        speed: 'normal',
        regenerate: !!audioUrl
      });
      const completed = await window.NoesisAPI.pollJob(job.job_id, {
        intervalMs: 1000,
        timeoutMs: 240000,
        onProgress: j => setAudioStatus(j.message || `Generating voice... ${j.progress || 0}%`)
      });
      if (completed && completed.result && completed.result.status === 'completed') {
        setAudioStatus('Voice ready. Loading audio...');
      }
      const audio = await loadNoteAudio(audioStyle);
      setAudioPlaying(true);
      audio.play().catch(() => {
        setAudioPlaying(false);
        setAudioStatus('Voice ready. Press play to listen.');
      });
    } catch (e) {
      setAudioError(friendlyNoteAudioError(e));
      setAudioStatus('');
    } finally {
      setAudioBusy(false);
    }
  };
  const toggleAudio = async () => {
    if (!current || audioStyle === 'none') return;
    let audio = audioRef.current;
    try {
      if (!audio && !audioUrl) audio = await loadNoteAudio(audioStyle);
      if (!audio) audio = audioRef.current;
      if (!audio) return;
      if (audioPlaying) {
        audio.pause();
        setAudioPlaying(false);
      } else {
        await audio.play();
        setAudioPlaying(true);
      }
    } catch (e) {
      setAudioError(friendlyNoteAudioError(e));
    }
  };
  return React.createElement("main", {
    style: ns.editor
  }, React.createElement("div", {
    style: {
      maxWidth: 720,
      margin: '0 auto',
      padding: '36px'
    }
  }, !current ? React.createElement("div", {
    style: ns.emptyEditor
  }, React.createElement(Icon.PenNib, {
    size: 28,
    style: {
      color: 'var(--fg-3)'
    }
  }), React.createElement("h2", {
    style: ns.emptyTitle
  }, "Pick a note to read"), React.createElement("p", {
    style: ns.emptyText
  }, "Generated and manual notes appear here with real backend persistence.")) : React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'calc(8px * var(--app-density-scale))',
      marginBottom: 'calc(18px * var(--app-density-scale))',
      alignItems: 'center',
      flexWrap: 'wrap'
    }
  }, tags.folder && React.createElement("span", {
    className: "chip chip-accent"
  }, tags.folder), tags.tags.map(t => React.createElement("span", {
    key: t,
    className: "chip"
  }, "#", t)), React.createElement("span", {
    style: {
      marginLeft: 'auto',
      fontSize: 'calc(11px * var(--app-font-scale))',
      color: 'var(--fg-3)'
    }
  }, current.updated ? `Updated ${current.updated}` : '')), React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      marginBottom: 'calc(14px * var(--app-density-scale))',
      gap: 'calc(8px * var(--app-density-scale))'
    }
  }, mode === 'edit' ? React.createElement("input", {
    className: "input",
    value: title,
    onChange: e => setTitle(e.target.value),
    style: {
      ...ns.titleInput,
      marginBottom: 0,
      flex: 1
    }
  }) : React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'calc(32px * var(--app-font-scale))',
      fontWeight: 300,
      margin: 0,
      flex: 1,
      color: 'var(--fg-0)'
    }
  }, title || 'Untitled'), React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => setMode(mode === 'read' ? 'edit' : 'read'),
    style: {
      fontSize: 'calc(11.5px * var(--app-font-scale))',
      padding: '6px 12px',
      whiteSpace: 'nowrap'
    }
  }, mode === 'read' ? 'Edit' : 'Read')), mode === 'edit' ? React.createElement("textarea", {
    className: "input",
    value: body,
    onChange: e => setBody(e.target.value),
    style: ns.bodyInput,
    placeholder: "Write your note..."
  }) : window.LessonRenderer ? React.createElement(window.LessonRenderer, {
    lesson: current.lesson_json,
    markdown: body
  }) : React.createElement("div", {
    className: "md-rendered",
    style: ns.mdBody,
    dangerouslySetInnerHTML: {
      __html: window.DOMPurify ? window.DOMPurify.sanitize(window.marked ? window.marked.parse(body || '') : body) : body || ''
    }
  }), React.createElement("div", {
    style: ns.audioPanel
  }, React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 180
    }
  }, React.createElement("div", {
    style: ns.audioLabel
  }, "Voice explanation"), React.createElement("select", {
    className: "input",
    value: audioStyle,
    disabled: audioBusy,
    onChange: e => {
      const nextStyle = e.target.value;
      setAudioStyle(nextStyle);
      setAudioStatus('');
      setAudioError('');
      clearLoadedAudio();
      if (nextStyle !== 'none') checkNoteAudio(nextStyle);
    },
    style: {
      fontSize: 'calc(12.5px * var(--app-font-scale))',
      width: '100%'
    }
  }, React.createElement("option", {
    value: "none"
  }, "No audio"), React.createElement("option", {
    value: "brief"
  }, "Brief audio explanation"), React.createElement("option", {
    value: "detailed"
  }, "Detailed audio explanation"))), React.createElement("button", {
    className: "btn btn-ghost",
    disabled: audioBusy || audioStyle === 'none',
    onClick: generateAudio
  }, React.createElement(Icon.Sparkle, {
    size: 12
  }), " ", audioBusy ? 'Generating...' : audioUrl ? 'Regenerate' : 'Generate audio'), React.createElement("button", {
    className: "btn btn-ghost",
    disabled: audioBusy || audioStyle === 'none' || !audioUrl,
    onClick: toggleAudio
  }, audioPlaying ? React.createElement(Icon.Pause, {
    size: 12
  }) : React.createElement(Icon.Play, {
    size: 12
  }), " ", audioPlaying ? 'Pause' : 'Play'), (audioStatus || audioError) && React.createElement("div", {
    style: {
      ...ns.audioStatus,
      color: audioError ? 'var(--err)' : 'var(--fg-3)'
    }
  }, audioError || audioStatus)), React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'calc(10px * var(--app-density-scale))',
      marginTop: 'calc(14px * var(--app-density-scale))',
      alignItems: 'center'
    }
  }, mode === 'edit' && React.createElement("button", {
    className: "btn btn-accent",
    disabled: busy || !title.trim(),
    onClick: save
  }, status === 'Saving...' ? 'Saving...' : 'Save'), React.createElement("button", {
    className: "btn btn-ghost",
    disabled: busy,
    onClick: remove,
    style: {
      color: 'var(--err)'
    }
  }, status === 'Deleting...' ? 'Deleting...' : 'Delete'), materialId && React.createElement("button", {
    className: "btn btn-ghost",
    disabled: busy,
    onClick: generateCards,
    style: {
      marginLeft: 'auto'
    }
  }, React.createElement(Icon.Cards, {
    size: 12
  }), " ", status === 'Generating flashcards...' ? 'Generating flashcards...' : 'Generate 6-8 cards')), status && React.createElement("div", {
    style: {
      marginTop: 'calc(12px * var(--app-density-scale))',
      fontSize: 'calc(11px * var(--app-font-scale))',
      color: 'var(--fg-3)'
    }
  }, status))));
};
const ns = {
  layout: {
    display: 'grid',
    gridTemplateColumns: '220px 320px 1fr',
    minHeight: 'calc(100vh - 57px)'
  },
  folders: {
    borderRight: '1px solid var(--line)',
    padding: '8px 0',
    background: 'var(--bg-0)'
  },
  list: {
    borderRight: '1px solid var(--line)',
    background: 'var(--bg-0)',
    overflow: 'auto'
  },
  editor: {
    background: 'var(--bg-0)',
    overflow: 'auto'
  },
  sideHead: {
    padding: '16px 14px 8px',
    fontSize: 'calc(10.5px * var(--app-font-scale))',
    color: 'var(--fg-3)',
    letterSpacing: '0.1em',
    textTransform: 'uppercase'
  },
  emptySide: {
    padding: '8px 10px',
    fontSize: 'calc(12px * var(--app-font-scale))',
    color: 'var(--fg-3)'
  },
  emptyList: {
    padding: 'calc(18px * var(--app-density-scale))',
    fontSize: 'calc(12px * var(--app-font-scale))',
    color: 'var(--fg-3)'
  },
  folderButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(10px * var(--app-density-scale))',
    padding: '8px 10px',
    borderRadius: 'var(--r-sm)',
    fontSize: 'calc(12.5px * var(--app-font-scale))'
  },
  noteButton: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'calc(4px * var(--app-density-scale))',
    padding: '14px 18px',
    borderBottom: '1px solid var(--line-soft)',
    textAlign: 'left',
    width: '100%'
  },
  preview: {
    fontSize: 'calc(11.5px * var(--app-font-scale))',
    color: 'var(--fg-2)',
    marginTop: 'calc(4px * var(--app-density-scale))',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  emptyEditor: {
    minHeight: '60vh',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center'
  },
  emptyTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 'calc(30px * var(--app-font-scale))',
    fontWeight: 300,
    margin: '16px 0 8px'
  },
  emptyText: {
    fontSize: 'calc(13px * var(--app-font-scale))',
    color: 'var(--fg-3)',
    margin: 0
  },
  titleInput: {
    width: '100%',
    fontFamily: 'var(--font-display)',
    fontSize: 'calc(32px * var(--app-font-scale))',
    marginBottom: 'calc(14px * var(--app-density-scale))'
  },
  bodyInput: {
    width: '100%',
    minHeight: 420,
    resize: 'vertical',
    fontSize: 'calc(14.5px * var(--app-font-scale))',
    lineHeight: 1.7
  },
  mdBody: {
    minHeight: 420,
    fontSize: 'calc(14.5px * var(--app-font-scale))',
    lineHeight: 1.75,
    color: 'var(--fg-1)'
  },
  audioPanel: {
    marginTop: 'calc(18px * var(--app-density-scale))',
    padding: 'calc(12px * var(--app-density-scale))',
    borderRadius: 8,
    border: '1px solid var(--line)',
    background: 'var(--bg-1)',
    display: 'flex',
    alignItems: 'flex-end',
    gap: 'calc(10px * var(--app-density-scale))',
    flexWrap: 'wrap'
  },
  audioLabel: {
    fontSize: 'calc(10.5px * var(--app-font-scale))',
    color: 'var(--fg-3)',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    marginBottom: 'calc(6px * var(--app-density-scale))'
  },
  audioStatus: {
    width: '100%',
    fontSize: 'calc(11.5px * var(--app-font-scale))',
    lineHeight: 1.45
  }
};
window.Notes = Notes;
const Flashcards = ({
  onNav
}) => {
  const Icon = window.Icon;
  const [i, setI] = React.useState(0);
  const [flipped, setFlipped] = React.useState(false);
  const [cards, setCards] = React.useState([]);
  const [error, setError] = React.useState('');
  const [reviewing, setReviewing] = React.useState(false);
  const [mode, setMode] = React.useState('due');
  const [counts, setCounts] = React.useState({
    easy: 0,
    hard: 0,
    skipped: 0
  });
  const refresh = React.useCallback(() => {
    const materialId = parseInt(sessionStorage.getItem('noesis.materialId') || '0', 10) || null;
    const request = mode === 'all' ? window.NoesisAPI.flashcards.list(materialId) : window.NoesisAPI.flashcards.due();
    return request.then(d => {
      setCards(d.cards || []);
      setI(0);
      setFlipped(false);
      setError('');
    }).catch(e => setError(e.message || 'Failed to load cards'));
  }, [mode]);
  React.useEffect(() => {
    refresh();
  }, [refresh]);
  const hasCards = cards.length > 0;
  const c = cards[i] || {
    question: 'No cards due.',
    answer: 'Generate flashcards from a ready material.',
    deck: 'Review',
    topic: '',
    difficulty: ''
  };
  const rate = async rating => {
    if (!cards[i] || reviewing) return;
    setReviewing(true);
    setError('');
    try {
      await window.NoesisAPI.flashcards.review(cards[i].id, rating);
    } catch (e) {
      setError(e.message || 'Review failed');
      setReviewing(false);
      return;
    }
    setCounts(prev => ({
      easy: prev.easy + (rating >= 3 ? 1 : 0),
      hard: prev.hard + (rating === 2 ? 1 : 0),
      skipped: prev.skipped + (rating === 1 ? 1 : 0)
    }));
    setFlipped(false);
    if (i + 1 >= cards.length) refresh().then(() => setI(0));else setI(i + 1);
    setReviewing(false);
  };
  return React.createElement("div", {
    style: {
      background: 'var(--bg-0)',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column'
    }
  }, React.createElement(window.Topbar, {
    title: hasCards ? `Flashcards - ${c.deck || 'Review'}` : 'Flashcards',
    crumbs: ['Review'],
    right: React.createElement(React.Fragment, null, React.createElement("button", {
      className: "btn btn-ghost",
      disabled: reviewing,
      onClick: () => setMode(mode === 'due' ? 'all' : 'due')
    }, mode === 'due' ? 'Review existing' : 'Due cards'), React.createElement("button", {
      className: "btn btn-accent",
      disabled: reviewing,
      onClick: () => onNav('materials')
    }, React.createElement(Icon.Folder, {
      size: 12
    }), " Create new set"), React.createElement("span", {
      style: {
        fontSize: 'calc(11px * var(--app-font-scale))',
        color: 'var(--fg-3)'
      },
      className: "mono"
    }, hasCards ? `${i + 1} / ${cards.length}` : '0 / 0'))
  }), React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column'
    }
  }, React.createElement("div", {
    style: {
      padding: '14px 28px',
      borderBottom: '1px solid var(--line-soft)'
    }
  }, React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'calc(3px * var(--app-density-scale))'
    }
  }, (hasCards ? cards : [0]).map((_, k) => React.createElement("div", {
    key: k,
    style: {
      flex: 1,
      height: 2,
      borderRadius: 1,
      background: k < i ? 'var(--ok)' : k === i ? 'var(--accent)' : 'var(--line)'
    }
  }))), React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginTop: 'calc(8px * var(--app-density-scale))',
      fontSize: 'calc(11px * var(--app-font-scale))',
      color: 'var(--fg-3)'
    },
    className: "mono"
  }, React.createElement("span", null, counts.easy, " easy | ", counts.hard, " hard | ", counts.skipped, " again"), React.createElement("span", null, c.topic || c.deck || 'No topic', " ", c.difficulty ? `| ${c.difficulty}` : '')), reviewing && React.createElement("div", {
    style: {
      marginTop: 'calc(8px * var(--app-density-scale))',
      fontSize: 'calc(11px * var(--app-font-scale))',
      color: 'var(--fg-3)'
    }
  }, "Saving review..."), error && React.createElement("div", {
    style: {
      marginTop: 'calc(8px * var(--app-density-scale))',
      fontSize: 'calc(11px * var(--app-font-scale))',
      color: 'var(--err)'
    }
  }, error)), React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'calc(40px * var(--app-density-scale))'
    }
  }, React.createElement("div", {
    style: {
      width: '100%',
      maxWidth: 640
    }
  }, React.createElement("div", {
    onClick: () => hasCards && setFlipped(!flipped),
    style: {
      ...fc.card,
      transform: flipped ? 'rotateY(180deg)' : 'rotateY(0)',
      cursor: hasCards ? 'pointer' : 'default'
    }
  }, React.createElement("div", {
    style: {
      ...fc.face,
      transform: 'rotateY(0)'
    }
  }, React.createElement("div", {
    style: fc.faceLabel
  }, "Question"), React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'calc(34px * var(--app-font-scale))',
      fontWeight: 300,
      letterSpacing: '-0.015em',
      lineHeight: 1.25
    }
  }, c.question), React.createElement("div", {
    style: fc.meta
  }, hasCards ? 'Click to flip' : mode === 'due' ? 'No due cards. Review existing cards or create a new set.' : 'No saved cards for this material yet.')), React.createElement("div", {
    style: {
      ...fc.face,
      transform: 'rotateY(180deg)',
      background: 'var(--bg-2)'
    }
  }, React.createElement("div", {
    style: {
      ...fc.faceLabel,
      color: 'var(--accent)'
    }
  }, "Answer"), React.createElement("div", {
    style: {
      fontSize: 'calc(17px * var(--app-font-scale))',
      lineHeight: 1.55,
      color: 'var(--fg-0)'
    }
  }, c.answer))), React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'calc(8px * var(--app-density-scale))',
      marginTop: 'calc(32px * var(--app-density-scale))',
      justifyContent: 'center'
    }
  }, [{
    l: 'Again',
    sub: '< 1m',
    color: 'var(--err)',
    key: '1',
    rating: 1
  }, {
    l: 'Hard',
    sub: '10m',
    color: 'var(--warn)',
    key: '2',
    rating: 2
  }, {
    l: 'Good',
    sub: '3 days',
    color: 'var(--accent)',
    key: '3',
    rating: 3
  }, {
    l: 'Easy',
    sub: '2 weeks',
    color: 'var(--ok)',
    key: '4',
    rating: 4
  }].map(b => React.createElement("button", {
    key: b.l,
    onClick: () => rate(b.rating),
    disabled: !hasCards || reviewing,
    style: {
      ...fc.rateBtn,
      opacity: hasCards && !reviewing ? 1 : 0.45
    }
  }, React.createElement("span", {
    style: {
      ...fc.keyHint,
      color: b.color
    },
    className: "mono"
  }, b.key), React.createElement("div", null, React.createElement("div", {
    style: {
      fontSize: 'calc(13px * var(--app-font-scale))',
      color: 'var(--fg-0)',
      fontWeight: 500
    }
  }, b.l), React.createElement("div", {
    style: {
      fontSize: 'calc(10.5px * var(--app-font-scale))',
      color: 'var(--fg-3)',
      marginTop: 'calc(2px * var(--app-density-scale))'
    },
    className: "mono"
  }, b.sub))))), !hasCards && React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'calc(8px * var(--app-density-scale))',
      justifyContent: 'center',
      marginTop: 'calc(24px * var(--app-density-scale))'
    }
  }, mode === 'due' && React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => setMode('all')
  }, React.createElement(Icon.Cards, {
    size: 12
  }), " Review existing"), React.createElement("button", {
    className: "btn btn-accent",
    onClick: () => onNav('materials')
  }, React.createElement(Icon.Folder, {
    size: 12
  }), " Create new set"))))));
};
const fc = {
  card: {
    position: 'relative',
    minHeight: 340,
    transition: 'transform 600ms var(--ease-in-out)',
    transformStyle: 'preserve-3d'
  },
  face: {
    position: 'absolute',
    inset: 0,
    padding: 'calc(40px * var(--app-density-scale))',
    borderRadius: 'var(--r-xl)',
    background: 'var(--bg-1)',
    border: '1px solid var(--line)',
    backfaceVisibility: 'hidden',
    boxShadow: 'var(--shadow-lg)',
    display: 'flex',
    flexDirection: 'column'
  },
  faceLabel: {
    fontSize: 'calc(11px * var(--app-font-scale))',
    color: 'var(--fg-3)',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    marginBottom: 'calc(20px * var(--app-density-scale))'
  },
  meta: {
    marginTop: 'auto',
    fontSize: 'calc(11px * var(--app-font-scale))',
    color: 'var(--fg-3)'
  },
  rateBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(10px * var(--app-density-scale))',
    padding: '10px 16px',
    borderRadius: 'var(--r-md)',
    border: '1px solid var(--line)',
    background: 'var(--bg-1)',
    minWidth: 120,
    transition: 'all 160ms var(--ease-out)'
  },
  keyHint: {
    width: 20,
    height: 20,
    borderRadius: 4,
    background: 'var(--bg-2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 'calc(11px * var(--app-font-scale))'
  }
};
window.Flashcards = Flashcards;
const Quiz = ({
  onNav
}) => {
  const Icon = window.Icon;
  const [quiz, setQuiz] = React.useState(null);
  const [questions, setQuestions] = React.useState([]);
  const [library, setLibrary] = React.useState([]);
  const [wrong, setWrong] = React.useState([]);
  const [qi, setQi] = React.useState(0);
  const [attemptId, setAttemptId] = React.useState(null);
  const [selected, setSelected] = React.useState(null);
  const [submitted, setSubmitted] = React.useState(false);
  const [feedback, setFeedback] = React.useState(null);
  const [finalScore, setFinalScore] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [action, setAction] = React.useState('');
  const [answeredIds, setAnsweredIds] = React.useState(new Set());
  const loadLibrary = React.useCallback(async () => {
    setBusy(true);
    setAction('load');
    try {
      const [q, w] = await Promise.all([window.NoesisAPI.quizzes.list(), window.NoesisAPI.quizzes.wrong()]);
      setLibrary(q.quizzes || []);
      setWrong(w.wrong || []);
      setError('');
    } catch (e) {
      setError(e.message || 'Failed to load quizzes');
    } finally {
      setBusy(false);
      setAction('');
    }
  }, []);
  const startQuiz = async id => {
    if (busy) return;
    setBusy(true);
    setAction('start');
    setError('');
    try {
      sessionStorage.setItem('noesis.quizId', String(id));
      const d = await window.NoesisAPI.quizzes.get(id);
      const a = await window.NoesisAPI.quizzes.attempt(id);
      setQuiz(d.quiz);
      setQuestions(d.questions || []);
      setAttemptId(a.attempt_id);
      setQi(0);
      setSelected(null);
      setSubmitted(false);
      setFeedback(null);
      setFinalScore(null);
      setAnsweredIds(new Set());
    } catch (e) {
      setError(e.message || 'Failed to start quiz');
    } finally {
      setBusy(false);
      setAction('');
    }
  };
  React.useEffect(() => {
    const id = parseInt(sessionStorage.getItem('noesis.quizId') || '0', 10);
    if (id) startQuiz(id);else loadLibrary();
  }, []);
  const backToLibrary = async () => {
    sessionStorage.removeItem('noesis.quizId');
    setQuiz(null);
    setQuestions([]);
    setAttemptId(null);
    setFinalScore(null);
    setSelected(null);
    setSubmitted(false);
    setFeedback(null);
    setError('');
    setAnsweredIds(new Set());
    await loadLibrary();
  };
  const cur = finalScore ? null : questions[qi];
  const isLastQuestion = qi + 1 >= questions.length;
  const submit = async () => {
    if (cur == null || selected == null || !attemptId || busy) return;
    setBusy(true);
    setAction('submit');
    setError('');
    try {
      const res = await window.NoesisAPI.quizzes.answer(attemptId, {
        question_id: cur.id,
        selected_idx: selected
      });
      setFeedback(res);
      setSubmitted(true);
      setAnsweredIds(prev => new Set([...prev, cur.id]));
    } catch (e) {
      setError(e.message || 'Answer failed');
    } finally {
      setBusy(false);
      setAction('');
    }
  };
  const finishQuiz = async () => {
    if (!attemptId || busy) return;
    const pendingCurrent = cur && selected != null && !submitted ? 1 : 0;
    const unanswered = Math.max(0, questions.length - answeredIds.size - pendingCurrent);
    if (unanswered > 0 && !window.confirm(`${unanswered} question${unanswered === 1 ? '' : 's'} unanswered. Finish anyway?`)) return;
    setBusy(true);
    setAction('finish');
    setError('');
    try {
      if (cur && selected != null && !submitted) {
        const res = await window.NoesisAPI.quizzes.answer(attemptId, {
          question_id: cur.id,
          selected_idx: selected
        });
        setFeedback(res);
        setSubmitted(true);
        setAnsweredIds(prev => new Set([...prev, cur.id]));
      }
      const r = await window.NoesisAPI.quizzes.finish(attemptId);
      setFinalScore(r);
      sessionStorage.removeItem('noesis.quizId');
    } catch (e) {
      setError(e.message || 'Finish failed');
    } finally {
      setBusy(false);
      setAction('');
    }
  };
  const nextQ = async () => {
    if (qi + 1 >= questions.length) {
      await finishQuiz();
    } else {
      setQi(qi + 1);
      setSelected(null);
      setSubmitted(false);
      setFeedback(null);
    }
  };
  if (!quiz) {
    return React.createElement("div", {
      style: {
        background: 'var(--bg-0)',
        minHeight: '100vh'
      }
    }, React.createElement(window.Topbar, {
      title: "Quizzes",
      crumbs: ['Practice'],
      right: React.createElement("button", {
        className: "btn btn-accent",
        onClick: () => onNav('materials')
      }, React.createElement(Icon.Folder, {
        size: 12
      }), " Generate from material")
    }), React.createElement("div", {
      style: qz.page
    }, error && React.createElement("div", {
      style: qz.error
    }, error), React.createElement("section", {
      className: "card",
      style: qz.section
    }, React.createElement("div", {
      style: qz.sectionHead
    }, React.createElement("div", null, React.createElement("div", {
      style: qz.eyebrow
    }, "Quiz library"), React.createElement("h1", {
      style: qz.title
    }, "Practice from generated quizzes")), busy && React.createElement("span", {
      style: qz.muted
    }, action === 'start' ? 'Starting quiz...' : 'Loading...')), React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 'calc(8px * var(--app-density-scale))',
        marginTop: 'calc(18px * var(--app-density-scale))'
      }
    }, library.length === 0 && React.createElement("div", {
      style: qz.empty
    }, "No quizzes yet. Open a ready material and generate a practice quiz."), library.map(q => React.createElement("button", {
      key: q.id,
      disabled: busy,
      onClick: () => startQuiz(q.id),
      style: {
        ...qz.quizRow,
        opacity: busy ? 0.65 : 1
      }
    }, React.createElement(Icon.Target, {
      size: 15,
      style: {
        color: 'var(--accent)'
      }
    }), React.createElement("div", {
      style: {
        flex: 1,
        textAlign: 'left'
      }
    }, React.createElement("div", {
      style: {
        fontSize: 'calc(13.5px * var(--app-font-scale))',
        color: 'var(--fg-0)',
        fontWeight: 500
      }
    }, q.title), React.createElement("div", {
      style: {
        fontSize: 'calc(11.5px * var(--app-font-scale))',
        color: 'var(--fg-3)',
        marginTop: 'calc(2px * var(--app-density-scale))'
      }
    }, q.question_count, " questions | ", q.difficulty, " | Start new attempt")), React.createElement("span", {
      className: "chip"
    }, q.last_score == null ? 'Not attempted' : `Review: ${q.last_score}%`))))), React.createElement("section", {
      className: "card",
      style: qz.section
    }, React.createElement("div", {
      style: qz.sectionHead
    }, React.createElement("div", null, React.createElement("div", {
      style: qz.eyebrow
    }, "Wrong-answer review"), React.createElement("h2", {
      style: qz.subTitle
    }, "Questions to revisit"))), React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 'calc(10px * var(--app-density-scale))',
        marginTop: 'calc(16px * var(--app-density-scale))'
      }
    }, wrong.length === 0 && React.createElement("div", {
      style: qz.empty
    }, "No wrong answers stored yet."), wrong.map((w, i) => React.createElement("div", {
      key: `${w.attempt_id}-${w.question_id}-${i}`,
      style: qz.wrongRow
    }, React.createElement("div", {
      style: {
        fontSize: 'calc(13px * var(--app-font-scale))',
        color: 'var(--fg-0)',
        marginBottom: 'calc(8px * var(--app-density-scale))'
      }
    }, w.question), React.createElement("div", {
      style: {
        fontSize: 'calc(12px * var(--app-font-scale))',
        color: 'var(--fg-2)'
      }
    }, "Correct: ", w.options[w.correct_idx]), React.createElement("div", {
      style: {
        fontSize: 'calc(11.5px * var(--app-font-scale))',
        color: 'var(--fg-3)',
        marginTop: 'calc(6px * var(--app-density-scale))'
      }
    }, [w.topic || w.concept, w.difficulty].filter(Boolean).join(' | ')), React.createElement("div", {
      style: {
        fontSize: 'calc(11.5px * var(--app-font-scale))',
        color: 'var(--fg-3)',
        marginTop: 'calc(6px * var(--app-density-scale))'
      }
    }, w.explanation || 'Review the source material for this concept.')))))));
  }
  return React.createElement("div", {
    style: {
      background: 'var(--bg-0)',
      minHeight: '100vh'
    }
  }, React.createElement(window.Topbar, {
    title: quiz.title,
    crumbs: ['Quizzes'],
    right: React.createElement(React.Fragment, null, React.createElement("button", {
      className: "btn btn-ghost",
      onClick: backToLibrary
    }, "Quiz library"), React.createElement("span", {
      style: {
        fontSize: 'calc(11.5px * var(--app-font-scale))',
        color: 'var(--fg-3)'
      }
    }, "Question ", questions.length ? qi + 1 : 0, " / ", questions.length))
  }), React.createElement("div", {
    style: {
      maxWidth: 780,
      margin: '0 auto',
      padding: '40px 28px'
    }
  }, error && React.createElement("div", {
    style: qz.error
  }, error), React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'calc(4px * var(--app-density-scale))',
      marginBottom: 'calc(36px * var(--app-density-scale))'
    }
  }, (questions.length ? questions : [0]).map((_, k) => React.createElement("div", {
    key: k,
    style: {
      flex: 1,
      height: 4,
      borderRadius: 2,
      background: k < qi ? 'var(--ok)' : k === qi ? 'var(--accent)' : 'var(--line)'
    }
  }))), React.createElement("div", {
    style: qz.eyebrow
  }, cur ? `Question ${String(qi + 1).padStart(2, '0')} ${cur.topic || cur.concept ? '| ' + (cur.topic || cur.concept) : ''} ${cur.difficulty ? '| ' + cur.difficulty : ''}` : finalScore ? 'Quiz complete' : 'No questions'), React.createElement("h1", {
    style: qz.questionTitle
  }, cur ? cur.question : finalScore ? `You scored ${finalScore.score}% (${finalScore.correct}/${finalScore.total})` : 'This quiz has no questions.'), React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'calc(10px * var(--app-density-scale))'
    }
  }, (cur ? cur.options : []).map((label, idx) => {
    const isSel = selected === idx;
    const show = submitted && feedback;
    const isCorrect = show && idx === feedback.correct_idx;
    const isWrong = show && isSel && !isCorrect;
    return React.createElement("button", {
      key: idx,
      onClick: () => !submitted && setSelected(idx),
      style: {
        ...qz.option,
        borderColor: isCorrect ? 'var(--ok)' : isWrong ? 'var(--err)' : isSel ? 'var(--accent-soft)' : 'var(--line)',
        background: isCorrect ? 'color-mix(in oklab, var(--ok) 10%, transparent)' : isWrong ? 'color-mix(in oklab, var(--err) 10%, transparent)' : isSel ? 'var(--accent-glow)' : 'var(--bg-1)'
      }
    }, React.createElement("span", {
      className: "mono",
      style: {
        fontSize: 'calc(10px * var(--app-font-scale))',
        color: 'var(--fg-3)',
        width: 16
      }
    }, String.fromCharCode(65 + idx)), React.createElement("span", {
      style: {
        flex: 1,
        fontSize: 'calc(14px * var(--app-font-scale))',
        color: 'var(--fg-0)'
      }
    }, label), isCorrect && React.createElement(Icon.Check, {
      size: 13,
      style: {
        color: 'var(--ok)'
      }
    }), isWrong && React.createElement(Icon.X, {
      size: 13,
      style: {
        color: 'var(--err)'
      }
    }));
  })), submitted && feedback && React.createElement("div", {
    style: qz.feedback
  }, React.createElement("div", {
    style: {
      fontSize: 'calc(12px * var(--app-font-scale))',
      color: 'var(--accent)',
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      marginBottom: 'calc(8px * var(--app-density-scale))'
    }
  }, feedback.is_correct ? 'Correct' : 'Review this'), React.createElement("div", {
    style: {
      fontSize: 'calc(13.5px * var(--app-font-scale))',
      color: 'var(--fg-1)',
      lineHeight: 1.6
    }
  }, feedback.explanation || 'Review the material and try again.')), finalScore && React.createElement("div", {
    style: qz.feedback
  }, React.createElement("div", {
    style: {
      fontSize: 'calc(12px * var(--app-font-scale))',
      color: 'var(--accent)',
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      marginBottom: 'calc(8px * var(--app-density-scale))'
    }
  }, "Saved attempt"), React.createElement("div", {
    style: {
      fontSize: 'calc(13.5px * var(--app-font-scale))',
      color: 'var(--fg-1)',
      lineHeight: 1.6
    }
  }, "Score saved: ", finalScore.score, "% with ", finalScore.correct, "/", finalScore.total, " correct.", finalScore.wrong && finalScore.wrong.length ? ` ${finalScore.wrong.length} wrong answer${finalScore.wrong.length === 1 ? '' : 's'} stored for review.` : ' No wrong answers to review.', finalScore.reward && finalScore.reward.points ? ` +${finalScore.reward.points} XP earned.` : '')), React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginTop: 'calc(36px * var(--app-density-scale))'
    }
  }, React.createElement("button", {
    className: "btn btn-bare",
    disabled: busy,
    onClick: backToLibrary
  }, React.createElement(Icon.ArrowLeft, {
    size: 12
  }), " Back to library"), finalScore ? React.createElement("button", {
    className: "btn btn-accent",
    disabled: busy,
    onClick: backToLibrary
  }, "Finish review ", React.createElement(Icon.ArrowRight, {
    size: 12
  })) : !submitted && isLastQuestion ? React.createElement("button", {
    className: "btn btn-accent",
    onClick: finishQuiz,
    disabled: busy || selected == null || !cur
  }, action === 'finish' ? 'Saving results...' : 'Finish', " ", React.createElement(Icon.ArrowRight, {
    size: 12
  })) : !submitted ? React.createElement("button", {
    className: "btn btn-accent",
    onClick: submit,
    disabled: busy || selected == null || !cur
  }, action === 'submit' ? 'Submitting...' : 'Submit', " ", React.createElement(Icon.ArrowRight, {
    size: 12
  })) : React.createElement("button", {
    className: "btn btn-accent",
    disabled: busy,
    onClick: nextQ
  }, action === 'finish' ? 'Finishing...' : qi + 1 >= questions.length ? 'Finish' : 'Next', " ", React.createElement(Icon.ArrowRight, {
    size: 12
  })))));
};
const qz = {
  page: {
    padding: 'calc(28px * var(--app-density-scale))',
    maxWidth: 1100,
    margin: '0 auto',
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: 'calc(14px * var(--app-density-scale))'
  },
  section: {
    padding: 'calc(22px * var(--app-density-scale))'
  },
  sectionHead: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 'calc(16px * var(--app-density-scale))',
    alignItems: 'flex-start'
  },
  eyebrow: {
    fontSize: 'calc(11px * var(--app-font-scale))',
    color: 'var(--accent)',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    marginBottom: 'calc(8px * var(--app-density-scale))'
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 'calc(34px * var(--app-font-scale))',
    fontWeight: 300,
    margin: 0
  },
  subTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 'calc(24px * var(--app-font-scale))',
    fontWeight: 300,
    margin: 0
  },
  muted: {
    fontSize: 'calc(12px * var(--app-font-scale))',
    color: 'var(--fg-3)'
  },
  empty: {
    padding: 'calc(18px * var(--app-density-scale))',
    color: 'var(--fg-3)',
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    border: '1px dashed var(--line-strong)',
    borderRadius: 'var(--r-md)'
  },
  error: {
    marginBottom: 'calc(12px * var(--app-density-scale))',
    color: 'var(--err)',
    fontSize: 'calc(12px * var(--app-font-scale))'
  },
  quizRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(12px * var(--app-density-scale))',
    padding: 'calc(14px * var(--app-density-scale))',
    border: '1px solid var(--line)',
    borderRadius: 'var(--r-md)',
    background: 'var(--bg-1)'
  },
  wrongRow: {
    padding: 'calc(14px * var(--app-density-scale))',
    border: '1px solid var(--line)',
    borderRadius: 'var(--r-md)',
    background: 'var(--bg-1)'
  },
  questionTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 'calc(32px * var(--app-font-scale))',
    fontWeight: 300,
    letterSpacing: '-0.015em',
    margin: '0 0 18px',
    lineHeight: 1.3
  },
  option: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'calc(14px * var(--app-density-scale))',
    padding: '14px 16px',
    borderRadius: 'var(--r-md)',
    border: '1px solid',
    textAlign: 'left',
    transition: 'all 160ms var(--ease-out)'
  },
  feedback: {
    marginTop: 'calc(24px * var(--app-density-scale))',
    padding: 'calc(18px * var(--app-density-scale))',
    borderRadius: 'var(--r-lg)',
    background: 'var(--bg-1)',
    border: '1px solid var(--line)'
  }
};
window.Quiz = Quiz;
})();


// ---- components/Other.jsx ----
(function () {
  window.__NOESIS_BOOT.files.push("components/Other.jsx");
const Progress = ({
  onNav
}) => {
  const Icon = window.Icon;
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    window.NoesisAPI.dashboard.progress().then(d => {
      setData(d);
      setError('');
    }).catch(e => setError(e.message || 'Failed to load progress'));
  }, []);
  const game = data && data.gamification;
  const baseStats = data && data.stats || [{
    l: 'Mastery',
    v: '-',
    d: '',
    t: '',
    c: 'var(--ok)'
  }, {
    l: 'Retention',
    v: '-',
    d: '',
    t: '',
    c: 'var(--accent)'
  }, {
    l: 'Focus time',
    v: '-',
    d: '',
    t: '',
    c: 'var(--parchment)'
  }, {
    l: 'Streak',
    v: '-',
    d: '',
    t: '',
    c: 'var(--warn)'
  }];
  const stats = game && game.xp ? [{
    l: 'Level',
    v: game.xp.level || 1,
    d: `${game.xp.total_xp || 0} total XP`,
    t: '',
    c: 'var(--accent)'
  }, {
    l: 'Weekly XP',
    v: game.xp.weekly_xp || 0,
    d: 'earned this week',
    t: '',
    c: 'var(--parchment)'
  }, ...baseStats] : baseStats;
  const conceptBreakdown = data && data.concept_breakdown || [];
  return React.createElement("div", null, React.createElement(window.Topbar, {
    title: "Progress",
    crumbs: ['Analytics']
  }), React.createElement("div", {
    style: pg.page
  }, React.createElement("div", {
    style: {
      marginBottom: 'calc(28px * var(--app-density-scale))'
    }
  }, React.createElement("div", {
    style: pg.eyebrow
  }, "Real study analytics"), React.createElement("h1", {
    style: pg.title
  }, "Progress is calculated from your materials, reviews, quizzes, and study events."), error && React.createElement("div", {
    style: pg.error
  }, error)), React.createElement("div", {
    style: pg.statsGrid
  }, stats.map((s, i) => React.createElement("div", {
    key: i,
    className: "card",
    style: {
      padding: 'calc(22px * var(--app-density-scale))'
    }
  }, React.createElement("div", {
    style: pg.statLabel
  }, s.l), React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'calc(44px * var(--app-font-scale))',
      fontWeight: 300,
      color: s.c
    }
  }, s.v), React.createElement("div", {
    style: {
      fontSize: 'calc(11.5px * var(--app-font-scale))',
      color: 'var(--fg-2)',
      marginTop: 'calc(4px * var(--app-density-scale))'
    }
  }, s.d)))), React.createElement("div", {
    className: "card",
    style: {
      padding: 'calc(22px * var(--app-density-scale))',
      marginBottom: 'calc(14px * var(--app-density-scale))'
    }
  }, React.createElement("div", {
    style: pg.cardHead
  }, React.createElement("div", null, React.createElement("div", {
    style: pg.cardTitle
  }, "Mastery over time"), React.createElement("div", {
    style: pg.cardSub
  }, "Daily rolling average from logged study events"))), React.createElement(MasteryChart, {
    points: data && data.mastery_curve || [],
    retention: data && data.retention_curve || []
  })), React.createElement("div", {
    style: pg.twoCol
  }, React.createElement("div", {
    className: "card",
    style: {
      padding: 'calc(22px * var(--app-density-scale))'
    }
  }, React.createElement("div", {
    style: pg.cardTitle
  }, "Concept mastery by topic"), React.createElement("div", {
    style: pg.cardSub
  }, "Seeded OOP and Data Structures concepts, updated by study activity."), React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'calc(8px * var(--app-density-scale))',
      marginTop: 'calc(18px * var(--app-density-scale))'
    }
  }, conceptBreakdown.length === 0 && React.createElement("div", {
    style: pg.empty
  }, "No concept data yet."), conceptBreakdown.map((c, i) => React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'calc(14px * var(--app-density-scale))'
    }
  }, React.createElement("div", {
    style: {
      width: 150,
      fontSize: 'calc(12.5px * var(--app-font-scale))',
      color: 'var(--fg-1)',
      display: 'flex',
      alignItems: 'center',
      gap: 'calc(6px * var(--app-density-scale))'
    }
  }, c.attention && React.createElement("span", {
    style: {
      width: 5,
      height: 5,
      borderRadius: 3,
      background: 'var(--warn)'
    }
  }), React.createElement("span", {
    style: {
      flex: 1
    }
  }, c.t)), React.createElement("div", {
    style: pg.bar
  }, React.createElement("div", {
    style: {
      ...pg.barFill,
      width: c.m + '%',
      background: c.m > 70 ? 'var(--ok)' : c.m > 45 ? 'var(--accent)' : 'var(--warn)'
    }
  })), React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 'calc(11px * var(--app-font-scale))',
      color: 'var(--fg-2)',
      width: 34,
      textAlign: 'right'
    }
  }, c.m, "%"), React.createElement("span", {
    className: "mono",
    style: {
      fontSize: 'calc(10.5px * var(--app-font-scale))',
      color: 'var(--fg-3)',
      width: 54,
      textAlign: 'right'
    }
  }, c.cards, " cards"))))), React.createElement("div", {
    className: "card",
    style: {
      padding: 'calc(22px * var(--app-density-scale))'
    }
  }, React.createElement("div", {
    style: pg.cardTitle
  }, "Study activity"), React.createElement("div", {
    style: pg.cardSub
  }, "Past 12 weeks from backend study events."), React.createElement("div", {
    style: {
      marginTop: 'calc(18px * var(--app-density-scale))'
    }
  }, React.createElement(Heatmap, {
    data: data && data.heatmap_12w || null
  })))), React.createElement("div", {
    className: "card",
    style: {
      padding: 'calc(22px * var(--app-density-scale))',
      marginTop: 'calc(14px * var(--app-density-scale))'
    }
  }, React.createElement("div", {
    style: pg.cardTitle
  }, "Review note"), React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 'calc(14px * var(--app-density-scale))',
      marginTop: 'calc(14px * var(--app-density-scale))'
    }
  }, React.createElement("div", {
    style: pg.reviewBox
  }, React.createElement("div", {
    style: {
      ...pg.eyebrow,
      color: 'var(--ok)'
    }
  }, "Working"), React.createElement("div", {
    style: pg.reviewText
  }, data && data.weekly_review ? data.weekly_review.working : 'No study activity logged yet.')), React.createElement("div", {
    style: pg.reviewBox
  }, React.createElement("div", {
    style: {
      ...pg.eyebrow,
      color: 'var(--warn)'
    }
  }, "Watch"), React.createElement("div", {
    style: pg.reviewText
  }, data && data.weekly_review ? data.weekly_review.watch : 'Generate notes, flashcards, or quizzes to populate analytics.'))))));
};
const MasteryChart = ({
  points,
  retention
}) => {
  const pts = points && points.length ? points : Array.from({
    length: 16
  }, () => 0);
  const ret = retention && retention.length ? retention : Array.from({
    length: 16
  }, () => 0);
  const W = 900,
    H = 220,
    P = 20;
  const x = i => P + i / Math.max(1, pts.length - 1) * (W - P * 2);
  const y = v => H - P - v / 100 * (H - P * 2);
  const line = arr => arr.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`).join(' ');
  const area = line(pts) + ` L ${x(pts.length - 1)} ${H - P} L ${x(0)} ${H - P} Z`;
  return React.createElement("svg", {
    viewBox: `0 0 ${W} ${H}`,
    style: {
      width: '100%',
      height: 220
    }
  }, React.createElement("defs", null, React.createElement("linearGradient", {
    id: "area",
    x1: "0",
    x2: "0",
    y1: "0",
    y2: "1"
  }, React.createElement("stop", {
    offset: "0",
    stopColor: "var(--accent)",
    stopOpacity: "0.3"
  }), React.createElement("stop", {
    offset: "1",
    stopColor: "var(--accent)",
    stopOpacity: "0"
  }))), [0, 25, 50, 75, 100].map(v => React.createElement("g", {
    key: v
  }, React.createElement("line", {
    x1: P,
    x2: W - P,
    y1: y(v),
    y2: y(v),
    stroke: "var(--line)",
    strokeDasharray: "2,3"
  }), React.createElement("text", {
    x: P - 4,
    y: y(v) + 3,
    fontSize: "9",
    fill: "var(--fg-3)",
    textAnchor: "end",
    fontFamily: "var(--font-mono)"
  }, v))), React.createElement("path", {
    d: area,
    fill: "url(#area)"
  }), React.createElement("path", {
    d: line(ret),
    stroke: "var(--fg-3)",
    strokeWidth: "1.5",
    fill: "none",
    strokeDasharray: "3,3",
    opacity: "0.5"
  }), React.createElement("path", {
    d: line(pts),
    stroke: "var(--accent)",
    strokeWidth: "1.8",
    fill: "none"
  }), pts.map((v, i) => React.createElement("circle", {
    key: i,
    cx: x(i),
    cy: y(v),
    r: "2.5",
    fill: "var(--accent)"
  })));
};
const Heatmap = ({
  data: input
}) => {
  const weeks = 12,
    days = 7;
  const data = Array.isArray(input) && input.length === weeks * days ? input : Array.from({
    length: weeks * days
  }).fill(0);
  return React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: `repeat(${weeks}, 1fr)`,
      gap: 'calc(3px * var(--app-density-scale))'
    }
  }, Array.from({
    length: weeks
  }).map((_, w) => React.createElement("div", {
    key: w,
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'calc(3px * var(--app-density-scale))'
    }
  }, Array.from({
    length: days
  }).map((_, d) => {
    const v = data[w * days + d];
    return React.createElement("div", {
      key: d,
      style: {
        aspectRatio: '1',
        borderRadius: 2,
        background: v === 0 ? 'var(--bg-2)' : `color-mix(in oklab, var(--accent) ${v * 22}%, transparent)`
      }
    });
  }))));
};
const pg = {
  page: {
    padding: 'calc(28px * var(--app-density-scale))',
    maxWidth: 1400,
    margin: '0 auto'
  },
  eyebrow: {
    fontSize: 'calc(11px * var(--app-font-scale))',
    color: 'var(--fg-3)',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    marginBottom: 'calc(8px * var(--app-density-scale))'
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 'calc(38px * var(--app-font-scale))',
    fontWeight: 300,
    letterSpacing: '-0.02em',
    margin: 0,
    maxWidth: 780
  },
  error: {
    marginTop: 'calc(12px * var(--app-density-scale))',
    color: 'var(--err)',
    fontSize: 'calc(12px * var(--app-font-scale))'
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
    gap: 'calc(14px * var(--app-density-scale))',
    marginBottom: 'calc(20px * var(--app-density-scale))'
  },
  statLabel: {
    fontSize: 'calc(11px * var(--app-font-scale))',
    color: 'var(--fg-3)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginBottom: 'calc(12px * var(--app-density-scale))'
  },
  cardHead: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: 'calc(20px * var(--app-density-scale))'
  },
  cardTitle: {
    fontSize: 'calc(13px * var(--app-font-scale))',
    color: 'var(--fg-0)',
    fontWeight: 500
  },
  cardSub: {
    fontSize: 'calc(11.5px * var(--app-font-scale))',
    color: 'var(--fg-3)',
    marginTop: 'calc(4px * var(--app-density-scale))'
  },
  twoCol: {
    display: 'grid',
    gridTemplateColumns: '1.4fr 1fr',
    gap: 'calc(14px * var(--app-density-scale))'
  },
  empty: {
    padding: 'calc(18px * var(--app-density-scale))',
    border: '1px dashed var(--line-strong)',
    borderRadius: 'var(--r-md)',
    color: 'var(--fg-3)',
    fontSize: 'calc(12px * var(--app-font-scale))'
  },
  bar: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    background: 'var(--bg-2)',
    position: 'relative',
    overflow: 'hidden'
  },
  barFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 4
  },
  reviewBox: {
    padding: 'calc(16px * var(--app-density-scale))',
    borderRadius: 'var(--r-md)',
    background: 'var(--bg-2)'
  },
  reviewText: {
    fontSize: 'calc(13px * var(--app-font-scale))',
    color: 'var(--fg-1)',
    lineHeight: 1.6
  }
};
window.Progress = Progress;
const Settings = ({
  theme,
  setTheme,
  appearance,
  setAppearance,
  onLogout
}) => {
  const Icon = window.Icon;
  const [tab, setTab] = React.useState('profile');
  const tabs = [{
    id: 'profile',
    label: 'Profile',
    icon: 'Users'
  }, {
    id: 'learning',
    label: 'Learning style',
    icon: 'Brain'
  }, {
    id: 'appearance',
    label: 'Appearance',
    icon: 'Palette'
  }, {
    id: 'data',
    label: 'Data & privacy',
    icon: 'Lock'
  }, {
    id: 'account',
    label: 'Account',
    icon: 'LogOut'
  }];
  return React.createElement("div", null, React.createElement(window.Topbar, {
    title: "Settings"
  }), React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '240px 1fr',
      minHeight: 'calc(100vh - 57px)'
    }
  }, React.createElement("aside", {
    style: {
      borderRight: '1px solid var(--line)',
      padding: '22px 12px',
      background: 'var(--bg-1)'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 'calc(10.5px * var(--app-font-scale))',
      color: 'var(--fg-3)',
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      padding: '0 10px 10px'
    }
  }, "Settings"), tabs.map(t => {
    const C = Icon[t.icon];
    const active = tab === t.id;
    return React.createElement("button", {
      key: t.id,
      onClick: () => setTab(t.id),
      style: {
        ...set.tabButton,
        ...(active ? set.tabActive : {})
      }
    }, React.createElement(C, {
      size: 14
    }), " ", t.label);
  })), React.createElement("main", {
    style: {
      padding: '40px 56px',
      maxWidth: 820,
      width: '100%'
    },
    key: tab,
    className: "fade-in"
  }, tab === 'profile' && React.createElement(ProfileTab, null), tab === 'learning' && React.createElement(LearningTab, null), tab === 'appearance' && React.createElement(AppearanceTab, {
    theme: theme,
    setTheme: setTheme,
    appearance: appearance,
    setAppearance: setAppearance
  }), tab === 'data' && React.createElement(DataTab, null), tab === 'account' && React.createElement(AccountTab, {
    onLogout: onLogout
  }))));
};
const ProfileTab = () => {
  const [me, setMe] = React.useState(null);
  const [name, setName] = React.useState('');
  const [subject, setSubject] = React.useState('');
  const [saved, setSaved] = React.useState('');
  React.useEffect(() => {
    window.NoesisAPI.auth.me().then(d => {
      setMe(d);
      setName(d && d.user && d.user.name || '');
      setSubject(d && d.prefs && d.prefs.subject || d && d.user && d.user.major || '');
    }).catch(() => {});
  }, []);
  const save = async () => {
    setSaved('Saving...');
    try {
      const d = await window.NoesisAPI.profile.update({
        name,
        major: subject
      });
      await window.NoesisAPI.user.updatePrefs({
        subject
      });
      setMe(d);
      setSaved('Saved');
    } catch (e) {
      setSaved('Failed: ' + (e.message || 'error'));
    }
  };
  return React.createElement(React.Fragment, null, React.createElement(SetHeader, {
    eyebrow: "Profile",
    title: "Your learning profile.",
    sub: "Basic account details used across the dashboard and tutor."
  }), React.createElement("div", {
    style: set.profileCard
  }, React.createElement("div", {
    style: set.avatar
  }, (name || 'N').slice(0, 1).toUpperCase()), React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement("div", {
    style: {
      fontSize: 'calc(16px * var(--app-font-scale))',
      color: 'var(--fg-0)',
      fontWeight: 500
    }
  }, name || '-'), React.createElement("div", {
    style: {
      fontSize: 'calc(12px * var(--app-font-scale))',
      color: 'var(--fg-2)',
      marginTop: 'calc(2px * var(--app-density-scale))'
    }
  }, me && me.user ? me.user.email : '')), React.createElement("button", {
    className: "btn btn-ghost",
    onClick: save
  }, saved || 'Save')), React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'calc(18px * var(--app-density-scale))'
    }
  }, React.createElement(SetRow, {
    label: "Display name",
    sub: "How the tutor addresses you."
  }, React.createElement("input", {
    className: "input",
    value: name,
    onChange: e => setName(e.target.value),
    style: {
      width: 240
    }
  })), React.createElement(SetRow, {
    label: "Focus",
    sub: "Used for personalization and dashboard labels."
  }, React.createElement("input", {
    className: "input",
    value: subject,
    onChange: e => setSubject(e.target.value),
    style: {
      width: 240
    }
  }))));
};
const LearningTab = () => {
  const [prefs, setPrefs] = React.useState(null);
  const [status, setStatus] = React.useState('');
  React.useEffect(() => {
    window.NoesisAPI.user.getPrefs().then(p => setPrefs(p || {})).catch(() => setPrefs({}));
  }, []);
  const update = async patch => {
    setStatus('Saving...');
    try {
      const next = await window.NoesisAPI.user.updatePrefs(patch);
      setPrefs(p => ({
        ...(p || {}),
        ...next
      }));
      setStatus('Saved');
    } catch (e) {
      setStatus('Failed: ' + (e.message || 'error'));
    }
  };
  if (!prefs) return React.createElement("div", {
    style: {
      fontSize: 'calc(12px * var(--app-font-scale))',
      color: 'var(--fg-3)'
    }
  }, "Loading...");
  const modes = ['socratic', 'explain', 'example'];
  const aggs = ['gentle', 'balanced', 'aggressive'];
  const modeIdx = Math.max(0, modes.indexOf(prefs.default_tutor_mode || 'socratic'));
  const aggIdx = Math.max(0, aggs.indexOf(prefs.srs_aggression || 'balanced'));
  return React.createElement(React.Fragment, null, React.createElement(SetHeader, {
    eyebrow: "Learning style",
    title: "How should Noesis teach?",
    sub: "These backend preferences shape tutor mode, pacing, and flashcard scheduling."
  }), React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'calc(18px * var(--app-density-scale))'
    }
  }, React.createElement(SetRow, {
    label: "Tutor default mode",
    sub: "What the tutor does when you start a session."
  }, React.createElement(Segmented, {
    options: ['Socratic', 'Explain first', 'Show example'],
    value: modeIdx,
    onChange: i => update({
      default_tutor_mode: modes[i]
    })
  })), React.createElement(SetRow, {
    label: "Daily minutes target",
    sub: "The weekly dashboard goal is calculated from this."
  }, React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'calc(8px * var(--app-density-scale))'
    }
  }, React.createElement("input", {
    className: "input mono",
    type: "number",
    min: 5,
    max: 240,
    value: prefs.daily_minutes ?? 45,
    onChange: e => setPrefs({
      ...prefs,
      daily_minutes: parseInt(e.target.value || '45', 10)
    }),
    onBlur: () => update({
      daily_minutes: prefs.daily_minutes
    }),
    style: {
      width: 80,
      textAlign: 'center'
    }
  }), React.createElement("span", {
    style: {
      fontSize: 'calc(12px * var(--app-font-scale))',
      color: 'var(--fg-2)'
    }
  }, "min/day"))), React.createElement(SetRow, {
    label: "Forgetting curve aggression",
    sub: "How soon shaky cards resurface."
  }, React.createElement(Segmented, {
    options: ['Gentle', 'Balanced', 'Aggressive'],
    value: aggIdx,
    onChange: i => update({
      srs_aggression: aggs[i]
    })
  }))), status && React.createElement("div", {
    style: {
      marginTop: 'calc(16px * var(--app-density-scale))',
      fontSize: 'calc(11px * var(--app-font-scale))',
      color: 'var(--fg-3)'
    }
  }, status));
};
const AppearanceTab = ({
  theme,
  setTheme,
  appearance,
  setAppearance
}) => {
  const Icon = window.Icon;
  const themes = [{
    id: 'dark',
    label: 'Cosmic',
    preview: ['#08081a', '#1b1b3a', '#a5b4fc', '#c99afc']
  }, {
    id: 'studious',
    label: 'Studious',
    preview: ['#0b0a09', '#1a1917', '#c9a96a', '#e8dcc0']
  }, {
    id: 'light',
    label: 'Refined',
    preview: ['#f6f3ec', '#ffffff', '#6b7f5a', '#d7cdb1']
  }, {
    id: 'space',
    label: 'Violet',
    preview: ['#0a0a18', '#1e1e42', '#c99afc', '#8ac9ff']
  }];
  const normalized = window.NoesisAppearance && window.NoesisAppearance.normalizeAppearance ? window.NoesisAppearance.normalizeAppearance(appearance || {}) : {
    density: 'default',
    fontSize: 'default',
    motion: true,
    reduceTransparency: false
  };
  const densityOptions = window.NoesisAppearance && window.NoesisAppearance.densityScales || [{
    key: 'compact'
  }, {
    key: 'default'
  }, {
    key: 'comfortable'
  }];
  const fontOptions = window.NoesisAppearance && window.NoesisAppearance.fontScales || [{
    key: 'small'
  }, {
    key: 'default'
  }, {
    key: 'large'
  }];
  const density = Math.max(0, densityOptions.findIndex(option => option.key === normalized.density));
  const fontSize = Math.max(0, fontOptions.findIndex(option => option.key === normalized.fontSize));
  return React.createElement(React.Fragment, null, React.createElement(SetHeader, {
    eyebrow: "Appearance",
    title: "Make it readable.",
    sub: "Visual preferences are stored in this browser."
  }), React.createElement("div", {
    style: {
      marginBottom: 'calc(22px * var(--app-density-scale))'
    }
  }, React.createElement("div", {
    style: set.smallHead
  }, "Theme"), React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: 'calc(12px * var(--app-density-scale))'
    }
  }, themes.map(t => {
    const active = theme === t.id;
    return React.createElement("button", {
      key: t.id,
      onClick: () => setTheme(t.id),
      style: {
        ...set.themeButton,
        borderColor: active ? 'var(--accent-soft)' : 'var(--line)',
        boxShadow: active ? 'var(--shadow-glow)' : 'none'
      }
    }, React.createElement("div", {
      style: {
        height: 62,
        borderRadius: 'var(--r-md)',
        background: `linear-gradient(135deg, ${t.preview[0]} 0%, ${t.preview[1]} 60%, ${t.preview[2]} 100%)`,
        border: '1px solid var(--line-soft)',
        marginBottom: 'calc(10px * var(--app-density-scale))'
      }
    }), React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }
    }, React.createElement("span", {
      style: {
        fontFamily: 'var(--font-display)',
        fontSize: 'calc(16px * var(--app-font-scale))',
        color: 'var(--fg-0)'
      }
    }, t.label), active && React.createElement(Icon.Check, {
      size: 16,
      style: {
        color: 'var(--accent)'
      }
    })));
  }))), React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'calc(18px * var(--app-density-scale))'
    }
  }, React.createElement(SetRow, {
    label: "Density",
    sub: "Controls how compact surfaces feel."
  }, React.createElement(Segmented, {
    options: ['Compact', 'Default', 'Comfortable'],
    value: density,
    onChange: i => setAppearance && setAppearance({
      density: densityOptions[i].key
    })
  })), React.createElement(SetRow, {
    label: "Font size",
    sub: "Body text scale preference."
  }, React.createElement(Segmented, {
    options: ['Small', 'Default', 'Large'],
    value: fontSize,
    onChange: i => setAppearance && setAppearance({
      fontSize: fontOptions[i].key
    })
  })), React.createElement(SetRow, {
    label: "Motion",
    sub: "Enable interface motion."
  }, React.createElement(Toggle, {
    on: normalized.motion,
    onToggle: () => setAppearance && setAppearance({
      motion: !normalized.motion
    })
  })), React.createElement(SetRow, {
    label: "Reduce transparency",
    sub: "Prefer solid surfaces."
  }, React.createElement(Toggle, {
    on: normalized.reduceTransparency,
    onToggle: () => setAppearance && setAppearance({
      reduceTransparency: !normalized.reduceTransparency
    })
  }))));
};
const DataTab = () => {
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const exportData = () => window.open(window.NoesisAPI.auth.exportUrl(), '_blank');
  const deleteMe = async () => {
    if (!window.confirm('This permanently deletes your account and all associated data. Continue?')) return;
    setBusy(true);
    setStatus('Deleting...');
    try {
      await window.NoesisAPI.auth.deleteMe();
      window.dispatchEvent(new CustomEvent('noesis:logout'));
    } catch (e) {
      setStatus('Failed: ' + (e.message || 'error'));
      setBusy(false);
    }
  };
  return React.createElement(React.Fragment, null, React.createElement(SetHeader, {
    eyebrow: "Data & privacy",
    title: "Your materials, your ownership.",
    sub: "Export or delete all backend data tied to this account."
  }), React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'calc(18px * var(--app-density-scale))'
    }
  }, React.createElement(SetRow, {
    label: "Training on my data",
    sub: "Local Ollama only; no external model training."
  }, React.createElement("span", {
    style: {
      fontSize: 'calc(12px * var(--app-font-scale))',
      color: 'var(--fg-3)'
    }
  }, "Off")), React.createElement(SetRow, {
    label: "Export all data",
    sub: "JSON bundle of profile, materials, notes, flashcards, quizzes, and study events."
  }, React.createElement("button", {
    className: "btn btn-ghost",
    onClick: exportData
  }, "Download JSON")), React.createElement(SetRow, {
    label: "Delete account",
    sub: "Deletes your user-owned records."
  }, React.createElement("button", {
    className: "btn btn-ghost",
    disabled: busy,
    onClick: deleteMe,
    style: {
      color: 'var(--err)',
      borderColor: 'color-mix(in oklab, var(--err) 30%, var(--line))'
    }
  }, busy ? 'Deleting...' : 'Delete account'))), status && React.createElement("div", {
    style: {
      marginTop: 'calc(12px * var(--app-density-scale))',
      fontSize: 'calc(11px * var(--app-font-scale))',
      color: 'var(--fg-3)'
    }
  }, status));
};
const AccountTab = ({
  onLogout
}) => {
  const Icon = window.Icon;
  return React.createElement(React.Fragment, null, React.createElement(SetHeader, {
    eyebrow: "Account",
    title: "Session access.",
    sub: "Manage this browser session."
  }), React.createElement("div", {
    style: set.sessionBox
  }, React.createElement(Icon.Monitor, {
    size: 14,
    style: {
      color: 'var(--fg-2)'
    }
  }), React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement("div", {
    style: {
      fontSize: 'calc(13px * var(--app-font-scale))',
      color: 'var(--fg-0)'
    }
  }, "Current browser", React.createElement("span", {
    className: "chip chip-ok",
    style: {
      marginLeft: 8
    }
  }, "This device")), React.createElement("div", {
    style: {
      fontSize: 'calc(11.5px * var(--app-font-scale))',
      color: 'var(--fg-3)'
    }
  }, "Active now"))), React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'calc(10px * var(--app-density-scale))'
    }
  }, React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onLogout,
    style: {
      color: 'var(--err)',
      borderColor: 'color-mix(in oklab, var(--err) 30%, var(--line))',
      marginLeft: 'auto'
    }
  }, React.createElement(Icon.LogOut, {
    size: 13
  }), " Log out")));
};
const SetHeader = ({
  eyebrow,
  title,
  sub
}) => React.createElement("div", {
  style: {
    marginBottom: 'calc(28px * var(--app-density-scale))'
  }
}, React.createElement("div", {
  style: {
    fontSize: 'calc(11px * var(--app-font-scale))',
    color: 'var(--fg-3)',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    marginBottom: 'calc(10px * var(--app-density-scale))'
  }
}, eyebrow), React.createElement("h1", {
  style: {
    fontFamily: 'var(--font-display)',
    fontSize: 'calc(34px * var(--app-font-scale))',
    fontWeight: 300,
    letterSpacing: '-0.02em',
    margin: '0 0 8px'
  }
}, title), React.createElement("p", {
  style: {
    fontSize: 'calc(14px * var(--app-font-scale))',
    color: 'var(--fg-2)',
    margin: 0,
    maxWidth: 540
  }
}, sub));
const Segmented = ({
  options,
  value,
  onChange
}) => React.createElement("div", {
  style: {
    display: 'flex',
    gap: 'calc(4px * var(--app-density-scale))',
    padding: 'calc(2px * var(--app-density-scale))',
    background: 'var(--bg-2)',
    borderRadius: 'var(--r-sm)',
    border: '1px solid var(--line)'
  }
}, options.map((m, i) => React.createElement("button", {
  key: m,
  onClick: () => onChange && onChange(i),
  style: {
    padding: '6px 12px',
    fontSize: 'calc(12px * var(--app-font-scale))',
    background: i === value ? 'var(--bg-0)' : 'transparent',
    color: i === value ? 'var(--fg-0)' : 'var(--fg-2)',
    borderRadius: 4
  }
}, m)));
const SetRow = ({
  label,
  sub,
  children
}) => React.createElement("div", {
  style: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 'calc(18px * var(--app-density-scale))',
    borderBottom: '1px solid var(--line-soft)',
    gap: 'calc(40px * var(--app-density-scale))'
  }
}, React.createElement("div", null, React.createElement("div", {
  style: {
    fontSize: 'calc(13.5px * var(--app-font-scale))',
    color: 'var(--fg-0)',
    fontWeight: 500
  }
}, label), React.createElement("div", {
  style: {
    fontSize: 'calc(12px * var(--app-font-scale))',
    color: 'var(--fg-2)',
    marginTop: 'calc(2px * var(--app-density-scale))'
  }
}, sub)), React.createElement("div", {
  style: {
    flexShrink: 0
  }
}, children));
const Toggle = ({
  on,
  onToggle
}) => React.createElement("div", {
  onClick: onToggle,
  style: {
    width: 36,
    height: 20,
    borderRadius: 10,
    background: on ? 'var(--accent)' : 'var(--bg-3)',
    border: '1px solid var(--line)',
    position: 'relative',
    cursor: onToggle ? 'pointer' : 'default',
    transition: 'background 180ms var(--ease-out)'
  }
}, React.createElement("div", {
  style: {
    position: 'absolute',
    top: 2,
    left: on ? 18 : 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    background: on ? 'var(--bg-0)' : 'var(--fg-1)',
    transition: 'left 180ms var(--ease-out)'
  }
}));
const set = {
  tabButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(10px * var(--app-density-scale))',
    padding: '9px 12px',
    borderRadius: 'var(--r-sm)',
    color: 'var(--fg-2)',
    width: '100%',
    fontSize: 'calc(13px * var(--app-font-scale))',
    textAlign: 'left',
    marginBottom: 'calc(1px * var(--app-density-scale))',
    transition: 'all 140ms var(--ease-out)'
  },
  tabActive: {
    background: 'var(--bg-2)',
    color: 'var(--fg-0)'
  },
  profileCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(20px * var(--app-density-scale))',
    marginBottom: 'calc(28px * var(--app-density-scale))',
    padding: 'calc(20px * var(--app-density-scale))',
    border: '1px solid var(--line)',
    borderRadius: 'var(--r-lg)',
    background: 'var(--bg-1)'
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 16,
    background: 'linear-gradient(135deg, var(--accent), var(--parchment))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-display)',
    fontSize: 'calc(28px * var(--app-font-scale))',
    color: 'var(--bg-0)'
  },
  smallHead: {
    fontSize: 'calc(11px * var(--app-font-scale))',
    color: 'var(--fg-3)',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    marginBottom: 'calc(12px * var(--app-density-scale))'
  },
  themeButton: {
    textAlign: 'left',
    padding: 'calc(14px * var(--app-density-scale))',
    borderRadius: 'var(--r-lg)',
    border: '1px solid',
    background: 'var(--bg-1)',
    transition: 'all 180ms var(--ease-out)'
  },
  sessionBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(12px * var(--app-density-scale))',
    padding: 'calc(16px * var(--app-density-scale))',
    border: '1px solid var(--line)',
    borderRadius: 'var(--r-md)',
    background: 'var(--bg-1)',
    marginBottom: 'calc(18px * var(--app-density-scale))'
  }
};
window.Settings = Settings;
})();


// ---- components/Community.jsx ----
(function () {
  window.__NOESIS_BOOT.files.push("components/Community.jsx");
const Community = ({
  onNav
}) => {
  const Icon = window.Icon;
  const [tab, setTab] = React.useState('leaderboard');
  const tabs = [{
    id: 'leaderboard',
    label: 'Leaderboard',
    icon: 'Chart'
  }, {
    id: 'friends',
    label: 'Friends',
    icon: 'Users'
  }, {
    id: 'rooms',
    label: 'Study Rooms',
    icon: 'Globe'
  }];
  return React.createElement("div", null, React.createElement(window.Topbar, {
    title: "Community",
    crumbs: ['Social learning']
  }), React.createElement("div", {
    style: cm.page
  }, React.createElement("section", {
    style: cm.hero
  }, React.createElement("div", null, React.createElement("div", {
    style: cm.eyebrow
  }, "Gamified study"), React.createElement("h1", {
    style: cm.title
  }, "Study together, keep momentum, and make progress visible.")), React.createElement("div", {
    style: cm.tabBar
  }, tabs.map(t => {
    const C = Icon[t.icon];
    const active = tab === t.id;
    return React.createElement("button", {
      key: t.id,
      onClick: () => setTab(t.id),
      style: {
        ...cm.tab,
        ...(active ? cm.tabActive : {})
      }
    }, React.createElement(C, {
      size: 13
    }), " ", t.label);
  }))), tab === 'leaderboard' && React.createElement(LeaderboardPanel, null), tab === 'friends' && React.createElement(FriendsPanel, null), tab === 'rooms' && React.createElement(StudyRoomsPanel, {
    onNav: onNav
  })));
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
  return error && error.message || fallback;
}
const LeaderboardPanel = () => {
  const [scope, setScope] = React.useState('weekly');
  const [rows, setRows] = React.useState([]);
  const [status, setStatus] = React.useState('');
  const load = React.useCallback(async () => {
    setStatus('Loading leaderboard...');
    try {
      const res = scope === 'global' ? await window.NoesisAPI.leaderboards.global() : scope === 'friends' ? await window.NoesisAPI.leaderboards.friends() : await window.NoesisAPI.leaderboards.weekly();
      setRows(res.leaderboard || []);
      setStatus('');
    } catch (e) {
      setStatus(communityErrorMessage(e, 'Could not load leaderboard.'));
    }
  }, [scope]);
  React.useEffect(() => {
    load();
  }, [load]);
  return React.createElement("section", {
    className: "card",
    style: cm.card
  }, React.createElement("div", {
    style: cm.cardHead
  }, React.createElement("div", null, React.createElement("div", {
    style: cm.cardTitle
  }, "Leaderboard"), React.createElement("div", {
    style: cm.muted
  }, "Ranked by XP, with display names only.")), React.createElement(SegmentedCommunity, {
    options: ['Weekly', 'Global', 'Friends'],
    value: ['weekly', 'global', 'friends'].indexOf(scope),
    onChange: i => setScope(['weekly', 'global', 'friends'][i])
  })), status && React.createElement("div", {
    style: cm.status
  }, status), React.createElement("div", {
    style: cm.table
  }, (rows.length ? rows : []).map(row => React.createElement("div", {
    key: row.user_id,
    style: {
      ...cm.rankRow,
      ...(row.is_current_user ? cm.rankCurrent : {})
    }
  }, React.createElement("div", {
    className: "mono",
    style: cm.rank
  }, "#", row.rank), React.createElement("div", {
    style: cm.avatar
  }, String(row.display_name || 'N').slice(0, 1).toUpperCase()), React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, React.createElement("div", {
    style: cm.name
  }, row.display_name), React.createElement("div", {
    style: cm.muted
  }, "Level ", row.level, " | ", row.badges_count, " badge", row.badges_count === 1 ? '' : 's', " | ", row.streak, "d streak")), React.createElement("div", {
    className: "mono",
    style: cm.xp
  }, row.xp, " XP"))), !rows.length && !status && React.createElement(EmptyCommunity, {
    text: "No leaderboard XP yet. Finish a quiz, review cards, or complete a study task."
  })));
};
const FriendsPanel = () => {
  const Icon = window.Icon;
  const [friends, setFriends] = React.useState([]);
  const [requests, setRequests] = React.useState({
    incoming: [],
    outgoing: []
  });
  const [q, setQ] = React.useState('');
  const [results, setResults] = React.useState([]);
  const [status, setStatus] = React.useState('');
  const load = React.useCallback(async () => {
    try {
      const [f, r] = await Promise.all([window.NoesisAPI.friends.list(), window.NoesisAPI.friends.requests()]);
      setFriends(f.friends || []);
      setRequests(r || {
        incoming: [],
        outgoing: []
      });
    } catch (e) {
      setStatus(communityErrorMessage(e, 'Could not load friends.'));
    }
  }, []);
  React.useEffect(() => {
    load();
  }, [load]);
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
  const send = async id => {
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
      if (accept) await window.NoesisAPI.friends.accept(id);else await window.NoesisAPI.friends.reject(id);
      await load();
      setStatus('');
    } catch (e) {
      setStatus(communityErrorMessage(e, 'Could not update request.'));
    }
  };
  return React.createElement("div", {
    style: cm.twoCol
  }, React.createElement("section", {
    className: "card",
    style: cm.card
  }, React.createElement("div", {
    style: cm.cardHead
  }, React.createElement("div", null, React.createElement("div", {
    style: cm.cardTitle
  }, "Find classmates"), React.createElement("div", {
    style: cm.muted
  }, "Search by display name or email. Emails stay private in results."))), React.createElement("div", {
    style: cm.searchRow
  }, React.createElement("input", {
    className: "input",
    value: q,
    onChange: e => setQ(e.target.value),
    onKeyDown: e => {
      if (e.key === 'Enter') search();
    },
    placeholder: "Search students",
    style: {
      flex: 1
    }
  }), React.createElement("button", {
    className: "btn btn-accent",
    onClick: search
  }, React.createElement(Icon.Search, {
    size: 12
  }), " Search")), status && React.createElement("div", {
    style: cm.status
  }, status), React.createElement("div", {
    style: cm.list
  }, results.map(user => React.createElement("div", {
    key: user.user_id,
    style: cm.personRow
  }, React.createElement("div", {
    style: cm.avatar
  }, String(user.display_name || 'N').slice(0, 1).toUpperCase()), React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement("div", {
    style: cm.name
  }, user.display_name), React.createElement("div", {
    style: cm.muted
  }, "Level ", user.level, " | ", user.relationship || 'none')), React.createElement("button", {
    className: "btn btn-ghost",
    disabled: user.relationship !== 'none',
    onClick: () => send(user.user_id)
  }, user.relationship === 'none' ? 'Add' : user.relationship))), !results.length && React.createElement(EmptyCommunity, {
    text: "Search for a classmate to send a friend request."
  }))), React.createElement("section", {
    className: "card",
    style: cm.card
  }, React.createElement("div", {
    style: cm.cardTitle
  }, "Friend requests"), React.createElement("div", {
    style: cm.list
  }, (requests.incoming || []).map(req => React.createElement("div", {
    key: req.id,
    style: cm.personRow
  }, React.createElement("div", {
    style: cm.avatar
  }, String(req.requester.display_name || 'N').slice(0, 1).toUpperCase()), React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement("div", {
    style: cm.name
  }, req.requester.display_name), React.createElement("div", {
    style: cm.muted
  }, "Wants to study with you")), React.createElement("button", {
    className: "btn btn-accent",
    onClick: () => respond(req.id, true)
  }, "Accept"), React.createElement("button", {
    className: "btn btn-bare",
    onClick: () => respond(req.id, false)
  }, "Reject"))), !(requests.incoming || []).length && React.createElement(EmptyCommunity, {
    text: "No incoming requests."
  })), React.createElement("div", {
    style: {
      ...cm.cardTitle,
      marginTop: 'calc(18px * var(--app-density-scale))'
    }
  }, "Friends"), React.createElement("div", {
    style: cm.list
  }, friends.map(f => React.createElement("div", {
    key: f.user_id,
    style: cm.personRow
  }, React.createElement("div", {
    style: cm.avatar
  }, String(f.display_name || 'N').slice(0, 1).toUpperCase()), React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement("div", {
    style: cm.name
  }, f.display_name), React.createElement("div", {
    style: cm.muted
  }, "Level ", f.level, " | ", f.badges_count, " badge", f.badges_count === 1 ? '' : 's')))), !friends.length && React.createElement(EmptyCommunity, {
    text: "Friends will appear here after requests are accepted."
  }))));
};
const StudyRoomsPanel = ({
  onNav
}) => {
  const Icon = window.Icon;
  const [rooms, setRooms] = React.useState([]);
  const [form, setForm] = React.useState({
    name: '',
    subject: '',
    room_type: 'public'
  });
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
  React.useEffect(() => {
    load();
  }, [load]);
  const openRoom = room => {
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
  const joinPublic = async room => {
    setStatus('Joining room...');
    try {
      const res = await window.NoesisAPI.rooms.join(room.id);
      await load();
      openRoom(res.room || room);
    } catch (e) {
      setStatus(communityErrorMessage(e, 'Could not join room.'));
    }
  };
  return React.createElement("div", {
    style: cm.twoCol
  }, React.createElement("section", {
    className: "card",
    style: cm.card
  }, React.createElement("div", {
    style: cm.cardTitle
  }, "Create a study room"), React.createElement("div", {
    style: cm.formGrid
  }, React.createElement("input", {
    className: "input",
    value: form.name,
    onChange: e => setForm({
      ...form,
      name: e.target.value
    }),
    placeholder: "Room name"
  }), React.createElement("input", {
    className: "input",
    value: form.subject,
    onChange: e => setForm({
      ...form,
      subject: e.target.value
    }),
    placeholder: "Subject, e.g. Data Structures"
  }), React.createElement("select", {
    className: "input",
    value: form.room_type,
    onChange: e => setForm({
      ...form,
      room_type: e.target.value
    })
  }, React.createElement("option", {
    value: "public"
  }, "Public"), React.createElement("option", {
    value: "invite-only"
  }, "Invite-only"), React.createElement("option", {
    value: "private"
  }, "Private")), React.createElement("button", {
    className: "btn btn-accent",
    onClick: create
  }, React.createElement(Icon.Plus, {
    size: 12
  }), " Create room")), React.createElement("div", {
    style: {
      ...cm.cardTitle,
      marginTop: 'calc(22px * var(--app-density-scale))'
    }
  }, "Join by code"), React.createElement("div", {
    style: cm.searchRow
  }, React.createElement("input", {
    className: "input mono",
    value: code,
    onChange: e => setCode(e.target.value),
    placeholder: "Invite code",
    style: {
      flex: 1
    }
  }), React.createElement("button", {
    className: "btn btn-ghost",
    onClick: joinCode
  }, "Join")), status && React.createElement("div", {
    style: cm.status
  }, status)), React.createElement("section", {
    className: "card",
    style: cm.card
  }, React.createElement("div", {
    style: cm.cardHead
  }, React.createElement("div", null, React.createElement("div", {
    style: cm.cardTitle
  }, "Rooms"), React.createElement("div", {
    style: cm.muted
  }, "Public rooms and rooms you belong to.")), React.createElement("button", {
    className: "btn btn-bare",
    onClick: load
  }, "Refresh")), React.createElement("div", {
    style: cm.list
  }, rooms.map(room => React.createElement("div", {
    key: room.id,
    style: cm.roomRow
  }, React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, React.createElement("div", {
    style: cm.name
  }, room.name), React.createElement("div", {
    style: cm.muted
  }, room.subject || 'General', " | ", room.member_count, " member", room.member_count === 1 ? '' : 's', " | ", room.room_type), room.user_role && React.createElement("span", {
    className: "chip chip-accent",
    style: {
      marginTop: 'calc(8px * var(--app-density-scale))'
    }
  }, room.user_role)), room.user_role ? React.createElement("button", {
    className: "btn btn-accent",
    onClick: () => openRoom(room)
  }, "Open") : React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => joinPublic(room)
  }, "Join"))), !rooms.length && React.createElement(EmptyCommunity, {
    text: "Create a room or join one by invite code."
  }))));
};
const RoomDetail = ({
  onNav
}) => {
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
    if (!roomId) {
      onNav && onNav('community');
      return;
    }
    try {
      const [roomRes, boardRes, notesRes, quizzesRes] = await Promise.all([window.NoesisAPI.rooms.get(roomId), window.NoesisAPI.rooms.leaderboard(roomId).catch(() => ({
        leaderboard: []
      })), window.NoesisAPI.notes.list().catch(() => ({
        notes: []
      })), window.NoesisAPI.quizzes.list().catch(() => ({
        quizzes: []
      }))]);
      setData(roomRes);
      setLeaderboard(boardRes.leaderboard || []);
      setNotes(notesRes.notes || []);
      setQuizzes(quizzesRes.quizzes || []);
      setStatus('');
    } catch (e) {
      setStatus(communityErrorMessage(e, 'Could not load room.'));
    }
  }, [roomId]);
  React.useEffect(() => {
    load();
  }, [load]);
  const shareNote = async id => {
    setStatus('Sharing note...');
    try {
      await window.NoesisAPI.rooms.shareNote(roomId, id);
      await load();
      setStatus('Note shared.');
    } catch (e) {
      setStatus(communityErrorMessage(e, 'Could not share note.'));
    }
  };
  const shareQuiz = async id => {
    setStatus('Sharing quiz...');
    try {
      await window.NoesisAPI.rooms.shareQuiz(roomId, id);
      await load();
      setStatus('Quiz shared.');
    } catch (e) {
      setStatus(communityErrorMessage(e, 'Could not share quiz.'));
    }
  };
  const startQuiz = async shareId => {
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
  return React.createElement("div", null, React.createElement(window.Topbar, {
    title: room ? room.name : 'Study Room',
    crumbs: ['Community'],
    right: React.createElement(React.Fragment, null, React.createElement("button", {
      className: "btn btn-ghost",
      onClick: () => onNav && onNav('community')
    }, React.createElement(Icon.ArrowLeft, {
      size: 12
    }), " Community"), room && React.createElement("button", {
      className: "btn btn-bare",
      onClick: leave
    }, "Leave"))
  }), React.createElement("div", {
    style: cm.page
  }, status && React.createElement("div", {
    style: cm.status
  }, status), !room ? React.createElement(EmptyCommunity, {
    text: "Loading room..."
  }) : React.createElement(React.Fragment, null, React.createElement("section", {
    style: cm.roomHero
  }, React.createElement("div", null, React.createElement("div", {
    style: cm.eyebrow
  }, room.subject || 'Study room', " | ", room.room_type), React.createElement("h1", {
    style: cm.title
  }, room.name), React.createElement("div", {
    style: cm.muted
  }, room.description || 'A shared space for studying together.')), React.createElement("div", {
    style: cm.inviteBox
  }, React.createElement("div", {
    style: cm.muted
  }, "Invite code"), React.createElement("div", {
    className: "mono",
    style: cm.inviteCode
  }, room.invite_code))), React.createElement("div", {
    style: cm.threeCol
  }, React.createElement("section", {
    className: "card",
    style: cm.card
  }, React.createElement("div", {
    style: cm.cardTitle
  }, "Room leaderboard"), React.createElement("div", {
    style: cm.list
  }, leaderboard.map(row => React.createElement("div", {
    key: row.user_id,
    style: {
      ...cm.rankRow,
      ...(row.is_current_user ? cm.rankCurrent : {})
    }
  }, React.createElement("div", {
    className: "mono",
    style: cm.rank
  }, "#", row.rank), React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement("div", {
    style: cm.name
  }, row.display_name), React.createElement("div", {
    style: cm.muted
  }, "Level ", row.level, " | ", row.streak, "d streak")), React.createElement("div", {
    className: "mono",
    style: cm.xp
  }, row.xp, " XP"))))), React.createElement("section", {
    className: "card",
    style: cm.card
  }, React.createElement("div", {
    style: cm.cardTitle
  }, "Members"), React.createElement("div", {
    style: cm.list
  }, (data.members || []).map(m => React.createElement("div", {
    key: m.user_id,
    style: cm.personRow
  }, React.createElement("div", {
    style: cm.avatar
  }, String(m.display_name || 'N').slice(0, 1).toUpperCase()), React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement("div", {
    style: cm.name
  }, m.display_name), React.createElement("div", {
    style: cm.muted
  }, m.role, " | Level ", m.level)))))), React.createElement("section", {
    className: "card",
    style: cm.card
  }, React.createElement("div", {
    style: cm.cardTitle
  }, "Activity"), React.createElement("div", {
    style: cm.list
  }, (data.activity || []).map(a => React.createElement("div", {
    key: a.id,
    style: cm.activityRow
  }, React.createElement("div", {
    style: cm.name
  }, a.summary), React.createElement("div", {
    style: cm.muted
  }, a.display_name, " | ", new Date(a.created_at).toLocaleString()))), !(data.activity || []).length && React.createElement(EmptyCommunity, {
    text: "Room activity will appear here."
  })))), React.createElement("div", {
    style: cm.twoCol
  }, React.createElement("section", {
    className: "card",
    style: cm.card
  }, React.createElement("div", {
    style: cm.cardTitle
  }, "Shared notes"), React.createElement(ShareSelect, {
    label: "Share note",
    items: notes,
    getLabel: n => n.title,
    onShare: shareNote
  }), React.createElement("div", {
    style: cm.list
  }, (data.shared_notes || []).map(n => React.createElement("div", {
    key: n.id,
    style: cm.sharedRow
  }, React.createElement("div", {
    style: cm.name
  }, n.title_snapshot), React.createElement("div", {
    style: cm.muted
  }, "Shared by ", n.display_name), React.createElement("div", {
    style: cm.preview
  }, String(n.body_md_snapshot || '').slice(0, 160)))))), React.createElement("section", {
    className: "card",
    style: cm.card
  }, React.createElement("div", {
    style: cm.cardTitle
  }, "Shared quizzes"), React.createElement(ShareSelect, {
    label: "Share quiz",
    items: quizzes,
    getLabel: q => q.title,
    onShare: shareQuiz
  }), React.createElement("div", {
    style: cm.list
  }, (data.shared_quizzes || []).map(q => React.createElement("div", {
    key: q.id,
    style: cm.sharedRow
  }, React.createElement("div", {
    style: cm.name
  }, q.title_snapshot), React.createElement("div", {
    style: cm.muted
  }, "Shared by ", q.display_name, " | ", q.metadata && q.metadata.question_count || 0, " questions"), React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => startQuiz(q.id),
    style: {
      marginTop: 'calc(8px * var(--app-density-scale))'
    }
  }, "Start challenge")))))), React.createElement("section", {
    className: "card",
    style: cm.card
  }, React.createElement("div", {
    style: cm.cardHead
  }, React.createElement("div", null, React.createElement("div", {
    style: cm.cardTitle
  }, "Room chat"), React.createElement("div", {
    style: cm.muted
  }, "Polling-friendly MVP messages.")), React.createElement("button", {
    className: "btn btn-bare",
    onClick: () => {
      load();
      setMessageRefresh(v => v + 1);
    }
  }, "Refresh")), React.createElement(RoomMessages, {
    roomId: roomId,
    refreshKey: messageRefresh
  }), React.createElement("div", {
    style: cm.searchRow
  }, React.createElement("input", {
    className: "input",
    value: message,
    onChange: e => setMessage(e.target.value),
    onKeyDown: e => {
      if (e.key === 'Enter') sendMessage();
    },
    placeholder: "Post a short study update",
    style: {
      flex: 1
    }
  }), React.createElement("button", {
    className: "btn btn-accent",
    onClick: sendMessage
  }, React.createElement(Icon.Send, {
    size: 12
  }), " Send"))))));
};
const RoomMessages = ({
  roomId,
  refreshKey
}) => {
  const [messages, setMessages] = React.useState([]);
  React.useEffect(() => {
    let alive = true;
    window.NoesisAPI.rooms.messages(roomId).then(res => {
      if (alive) setMessages(res.messages || []);
    }).catch(() => {});
    return () => {
      alive = false;
    };
  }, [roomId, refreshKey]);
  return React.createElement("div", {
    style: cm.messages
  }, messages.map(m => React.createElement("div", {
    key: m.id,
    style: cm.messageBubble
  }, React.createElement("div", {
    style: cm.muted
  }, m.display_name, " | ", new Date(m.created_at).toLocaleTimeString()), React.createElement("div", {
    style: {
      fontSize: 'calc(13px * var(--app-font-scale))',
      color: 'var(--fg-0)',
      marginTop: 'calc(4px * var(--app-density-scale))'
    }
  }, m.body))), !messages.length && React.createElement(EmptyCommunity, {
    text: "No messages yet."
  }));
};
const ShareSelect = ({
  label,
  items,
  getLabel,
  onShare
}) => {
  const [selected, setSelected] = React.useState('');
  return React.createElement("div", {
    style: cm.searchRow
  }, React.createElement("select", {
    className: "input",
    value: selected,
    onChange: e => setSelected(e.target.value),
    style: {
      flex: 1
    }
  }, React.createElement("option", {
    value: ""
  }, label), (items || []).map(item => React.createElement("option", {
    key: item.id,
    value: item.id
  }, getLabel(item)))), React.createElement("button", {
    className: "btn btn-ghost",
    disabled: !selected,
    onClick: () => onShare && onShare(parseInt(selected, 10))
  }, "Share"));
};
const SegmentedCommunity = ({
  options,
  value,
  onChange
}) => React.createElement("div", {
  style: cm.segmented
}, options.map((opt, i) => React.createElement("button", {
  key: opt,
  onClick: () => onChange && onChange(i),
  style: {
    ...cm.segment,
    ...(i === value ? cm.segmentActive : {})
  }
}, opt)));
const EmptyCommunity = ({
  text
}) => React.createElement("div", {
  style: cm.empty
}, text);
const cm = {
  page: {
    padding: 'calc(28px * var(--app-density-scale))',
    maxWidth: 1440,
    margin: '0 auto'
  },
  hero: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 'calc(18px * var(--app-density-scale))',
    marginBottom: 'calc(18px * var(--app-density-scale))'
  },
  roomHero: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 220px',
    gap: 'calc(18px * var(--app-density-scale))',
    alignItems: 'stretch',
    marginBottom: 'calc(14px * var(--app-density-scale))'
  },
  eyebrow: {
    fontSize: 'calc(11px * var(--app-font-scale))',
    color: 'var(--accent)',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    marginBottom: 'calc(8px * var(--app-density-scale))'
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 'calc(40px * var(--app-font-scale))',
    fontWeight: 300,
    letterSpacing: 0,
    margin: 0,
    maxWidth: 780
  },
  tabBar: {
    display: 'flex',
    gap: 'calc(5px * var(--app-density-scale))',
    padding: 'calc(3px * var(--app-density-scale))',
    borderRadius: 'var(--r-md)',
    border: '1px solid var(--line)',
    background: 'var(--bg-1)'
  },
  tab: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'calc(7px * var(--app-density-scale))',
    padding: '8px 11px',
    borderRadius: 7,
    color: 'var(--fg-2)',
    fontSize: 'calc(12.5px * var(--app-font-scale))'
  },
  tabActive: {
    background: 'var(--bg-2)',
    color: 'var(--fg-0)'
  },
  card: {
    padding: 'calc(20px * var(--app-density-scale))',
    marginBottom: 'calc(14px * var(--app-density-scale))'
  },
  cardHead: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 'calc(14px * var(--app-density-scale))',
    marginBottom: 'calc(14px * var(--app-density-scale))'
  },
  cardTitle: {
    fontSize: 'calc(13px * var(--app-font-scale))',
    color: 'var(--fg-0)',
    fontWeight: 500
  },
  muted: {
    fontSize: 'calc(11.5px * var(--app-font-scale))',
    color: 'var(--fg-3)',
    lineHeight: 1.5
  },
  status: {
    margin: '10px 0',
    fontSize: 'calc(12px * var(--app-font-scale))',
    color: 'var(--fg-2)',
    padding: 'calc(10px * var(--app-density-scale))',
    border: '1px solid var(--line)',
    borderRadius: 8,
    background: 'var(--bg-1)'
  },
  table: {
    display: 'grid',
    gap: 'calc(7px * var(--app-density-scale))'
  },
  rankRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(12px * var(--app-density-scale))',
    padding: 'calc(12px * var(--app-density-scale))',
    border: '1px solid var(--line)',
    borderRadius: 8,
    background: 'var(--bg-1)'
  },
  rankCurrent: {
    borderColor: 'var(--accent-soft)',
    background: 'var(--accent-glow)'
  },
  rank: {
    width: 42,
    color: 'var(--accent)',
    fontSize: 'calc(12px * var(--app-font-scale))'
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 9,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, var(--accent), var(--parchment))',
    color: 'var(--bg-0)',
    fontFamily: 'var(--font-display)'
  },
  name: {
    fontSize: 'calc(13.5px * var(--app-font-scale))',
    color: 'var(--fg-0)',
    fontWeight: 500
  },
  xp: {
    color: 'var(--accent)',
    fontSize: 'calc(12px * var(--app-font-scale))',
    whiteSpace: 'nowrap'
  },
  twoCol: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 'calc(14px * var(--app-density-scale))'
  },
  threeCol: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 'calc(14px * var(--app-density-scale))'
  },
  searchRow: {
    display: 'flex',
    gap: 'calc(8px * var(--app-density-scale))',
    alignItems: 'center',
    marginTop: 'calc(12px * var(--app-density-scale))'
  },
  list: {
    display: 'grid',
    gap: 'calc(8px * var(--app-density-scale))',
    marginTop: 'calc(14px * var(--app-density-scale))'
  },
  personRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(10px * var(--app-density-scale))',
    padding: 'calc(11px * var(--app-density-scale))',
    border: '1px solid var(--line)',
    borderRadius: 8,
    background: 'var(--bg-1)'
  },
  roomRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(12px * var(--app-density-scale))',
    padding: 'calc(14px * var(--app-density-scale))',
    border: '1px solid var(--line)',
    borderRadius: 8,
    background: 'var(--bg-1)'
  },
  activityRow: {
    padding: 'calc(11px * var(--app-density-scale))',
    border: '1px solid var(--line)',
    borderRadius: 8,
    background: 'var(--bg-1)'
  },
  sharedRow: {
    padding: 'calc(12px * var(--app-density-scale))',
    border: '1px solid var(--line)',
    borderRadius: 8,
    background: 'var(--bg-1)'
  },
  preview: {
    marginTop: 'calc(8px * var(--app-density-scale))',
    fontSize: 'calc(12px * var(--app-font-scale))',
    color: 'var(--fg-2)',
    lineHeight: 1.5
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 'calc(9px * var(--app-density-scale))',
    marginTop: 'calc(12px * var(--app-density-scale))'
  },
  segmented: {
    display: 'flex',
    gap: 'calc(4px * var(--app-density-scale))',
    padding: 'calc(2px * var(--app-density-scale))',
    background: 'var(--bg-2)',
    borderRadius: 8,
    border: '1px solid var(--line)'
  },
  segment: {
    padding: '6px 10px',
    borderRadius: 6,
    fontSize: 'calc(12px * var(--app-font-scale))',
    color: 'var(--fg-2)'
  },
  segmentActive: {
    background: 'var(--bg-0)',
    color: 'var(--fg-0)'
  },
  empty: {
    padding: 'calc(16px * var(--app-density-scale))',
    border: '1px dashed var(--line-strong)',
    borderRadius: 8,
    color: 'var(--fg-3)',
    fontSize: 'calc(12.5px * var(--app-font-scale))',
    textAlign: 'center'
  },
  inviteBox: {
    padding: 'calc(18px * var(--app-density-scale))',
    border: '1px solid var(--line)',
    borderRadius: 8,
    background: 'var(--bg-1)'
  },
  inviteCode: {
    marginTop: 'calc(8px * var(--app-density-scale))',
    fontSize: 'calc(24px * var(--app-font-scale))',
    color: 'var(--accent)'
  },
  messages: {
    display: 'grid',
    gap: 'calc(8px * var(--app-density-scale))',
    margin: '12px 0',
    maxHeight: 260,
    overflow: 'auto'
  },
  messageBubble: {
    padding: 'calc(11px * var(--app-density-scale))',
    borderRadius: 8,
    background: 'var(--bg-1)',
    border: '1px solid var(--line)'
  }
};
window.Community = Community;
window.RoomDetail = RoomDetail;
})();


// ---- components/App.jsx ----
(function () {
  window.__NOESIS_BOOT.files.push("components/App.jsx");
const {
  useState,
  useEffect
} = React;
const NOESIS_FONT_SCALES = [{
  key: 'small',
  scale: 0.92
}, {
  key: 'default',
  scale: 1
}, {
  key: 'large',
  scale: 1.12
}];
const NOESIS_DENSITY_SCALES = [{
  key: 'compact',
  scale: 0.86
}, {
  key: 'default',
  scale: 1
}, {
  key: 'comfortable',
  scale: 1.14
}];
const DEFAULT_APPEARANCE = {
  density: 'default',
  fontSize: 'default',
  motion: true,
  reduceTransparency: false
};
const normalizeAppearanceOption = (value, options, fallback = 'default') => {
  if (typeof value === 'number' || /^\d+$/.test(String(value || ''))) {
    const index = parseInt(value, 10);
    return options[index] ? options[index].key : fallback;
  }
  const raw = String(value || '').trim().toLowerCase();
  return options.some(option => option.key === raw) ? raw : fallback;
};
const appearanceOptionIndex = (key, options) => Math.max(0, options.findIndex(option => option.key === key));
const normalizeFontSizeIndex = value => {
  return appearanceOptionIndex(normalizeAppearanceOption(value, NOESIS_FONT_SCALES), NOESIS_FONT_SCALES);
};
const normalizeNoesisAppearance = (value = {}) => ({
  density: normalizeAppearanceOption(value.density, NOESIS_DENSITY_SCALES),
  fontSize: normalizeAppearanceOption(value.fontSize, NOESIS_FONT_SCALES),
  motion: value.motion !== false,
  reduceTransparency: value.reduceTransparency === true
});
const readNoesisAppearance = () => {
  try {
    return normalizeNoesisAppearance({
      density: localStorage.getItem('noesis.density') || DEFAULT_APPEARANCE.density,
      fontSize: localStorage.getItem('noesis.fontSize') || DEFAULT_APPEARANCE.fontSize,
      motion: localStorage.getItem('noesis.motion') !== 'false',
      reduceTransparency: localStorage.getItem('noesis.reduceTrans') === 'true'
    });
  } catch (_) {
    return {
      ...DEFAULT_APPEARANCE
    };
  }
};
const sameAppearance = (a, b) => a.density === b.density && a.fontSize === b.fontSize && a.motion === b.motion && a.reduceTransparency === b.reduceTransparency;
const applyNoesisAppearance = (value = {}) => {
  const appearance = normalizeNoesisAppearance({
    ...DEFAULT_APPEARANCE,
    ...value
  });
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
const applyNoesisFontScale = value => {
  const next = applyNoesisAppearance({
    ...readNoesisAppearance(),
    fontSize: normalizeAppearanceOption(value, NOESIS_FONT_SCALES)
  });
  return appearanceOptionIndex(next.fontSize, NOESIS_FONT_SCALES);
};
window.NoesisAppearance = {
  normalizeFontSizeIndex,
  normalizeAppearance: normalizeNoesisAppearance,
  readAppearance: readNoesisAppearance,
  applyAppearance: applyNoesisAppearance,
  applyFontScale: applyNoesisFontScale,
  fontScales: NOESIS_FONT_SCALES,
  densityScales: NOESIS_DENSITY_SCALES
};
const initialNoesisAppearance = readNoesisAppearance();
applyNoesisAppearance(initialNoesisAppearance);
class RouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      error: null
    };
  }
  static getDerivedStateFromError(error) {
    return {
      error
    };
  }
  componentDidCatch(error, info) {
    console.error('[noesis route error]', error, info);
  }
  componentDidUpdate(prevProps) {
    if (prevProps.route !== this.props.route && this.state.error) {
      this.setState({
        error: null
      });
    }
  }
  render() {
    if (this.state.error) {
      return React.createElement(RouteErrorFallback, {
        route: this.props.route,
        error: this.state.error,
        onBack: this.props.onBack
      });
    }
    return this.props.children;
  }
}
const RouteErrorFallback = ({
  route,
  error,
  onBack
}) => React.createElement("div", {
  style: routeErr.page
}, React.createElement("div", {
  style: routeErr.eyebrow
}, route), React.createElement("h1", {
  style: routeErr.title
}, "This screen hit a runtime error."), React.createElement("pre", {
  style: routeErr.detail
}, error && (error.message || String(error))), React.createElement("button", {
  className: "btn btn-accent",
  onClick: onBack
}, "Back to materials"));
const App = () => {
  const APP_ROUTES = ['dashboard', 'materials', 'material', 'storyboard', 'study-plan', 'tutor', 'notes', 'flashcards', 'quiz', 'progress', 'community', 'room', 'settings'];
  const [route, setRoute] = useState(localStorage.getItem('noesis.route') || 'landing');
  const [prevRoute, setPrevRoute] = useState(null);
  const [authMode, setAuthMode] = useState('signin');
  const [theme, setTheme] = useState(localStorage.getItem('noesis.theme') || 'dark');
  const [appearance, setAppearanceState] = useState(() => initialNoesisAppearance);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [authState, setAuthState] = useState('checking');
  const splashSeen = sessionStorage.getItem('noesis.splashSeen');
  const urlSkip = new URLSearchParams(window.location.search).has('nosplash');
  const [splashActive, setSplashActive] = useState(!splashSeen && !urlSkip);
  useEffect(() => {
    localStorage.setItem('noesis.route', route);
  }, [route]);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('noesis.theme', theme);
  }, [theme]);
  useEffect(() => {
    const normalized = applyNoesisAppearance(appearance);
    if (!sameAppearance(normalized, appearance)) setAppearanceState(normalized);
  }, [appearance]);
  useEffect(() => {
    const onLogout = () => {
      setAuthState('guest');
      setPrevRoute(route);
      setRoute('landing');
      window.scrollTo({
        top: 0,
        behavior: 'instant'
      });
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
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (authState !== 'guest') return;
    if (APP_ROUTES.includes(route)) setRoute('landing');
  }, [authState, route]);
  useEffect(() => {
    const handler = e => {
      if (e.data?.type === '__activate_edit_mode') setTweaksOpen(true);
      if (e.data?.type === '__deactivate_edit_mode') setTweaksOpen(false);
    };
    window.addEventListener('message', handler);
    window.parent.postMessage({
      type: '__edit_mode_available'
    }, '*');
    return () => window.removeEventListener('message', handler);
  }, []);
  useEffect(() => {
    const onKey = e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        goto('tutor');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const goto = r => {
    setPrevRoute(route);
    setRoute(r);
    window.scrollTo({
      top: 0,
      behavior: 'instant'
    });
  };
  const openAuth = (mode = 'signin') => {
    setAuthMode(mode);
    goto('auth');
  };
  const logout = async () => {
    try {
      await window.NoesisAPI.auth.signout();
    } catch (_) {}
    setAuthState('guest');
    goto('landing');
  };
  const setAppearance = patch => {
    setAppearanceState(prev => normalizeNoesisAppearance({
      ...prev,
      ...(typeof patch === 'function' ? patch(prev) : patch)
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
    landing: React.createElement(window.Landing, {
      onEnter: goto,
      onAuth: openAuth,
      isAuthed: authState === 'authed'
    }),
    auth: React.createElement(window.Auth, {
      initialMode: authMode,
      onComplete: isSignin => {
        setAuthState('authed');
        goto(isSignin ? 'dashboard' : 'onboarding');
      },
      onBack: () => goto('landing')
    }),
    onboarding: React.createElement(window.Onboarding, {
      onComplete: () => goto('dashboard')
    }),
    dashboard: React.createElement(window.Dashboard, {
      onNav: goto
    }),
    materials: React.createElement(window.Materials, {
      onNav: r => goto(r === 'material' ? 'material' : r)
    }),
    material: React.createElement(window.MaterialDetail, {
      onNav: goto
    }),
    storyboard: React.createElement(window.StoryboardReview, {
      onNav: goto
    }),
    'study-plan': React.createElement(window.StudyPlan, {
      onNav: goto
    }),
    tutor: React.createElement(window.TutorHome, {
      onNav: goto
    }),
    notes: React.createElement(window.Notes, {
      onNav: goto
    }),
    flashcards: React.createElement(window.Flashcards, {
      onNav: goto
    }),
    quiz: React.createElement(window.Quiz, {
      onNav: goto
    }),
    progress: React.createElement(window.Progress, {
      onNav: goto
    }),
    community: React.createElement(window.Community, {
      onNav: goto
    }),
    room: React.createElement(window.RoomDetail, {
      onNav: goto
    }),
    settings: React.createElement(window.Settings, {
      theme: theme,
      setTheme: setTheme,
      appearance: appearance,
      setAppearance: setAppearance,
      onLogout: logout
    })
  };
  const activeScreen = screens[route] || screens.dashboard;
  const protectedLoading = APP_ROUTES.includes(route) && authState === 'checking';
  const routedScreen = protectedLoading ? React.createElement(AppLoading, null) : React.createElement(RouteErrorBoundary, {
    route: route,
    onBack: () => goto('materials')
  }, activeScreen);
  return React.createElement("div", {
    "data-screen-label": route,
    style: {
      minHeight: '100vh',
      background: 'var(--bg-0)',
      position: 'relative'
    }
  }, isPublicLanding && window.Ambient3D && React.createElement(window.Ambient3D, {
    opacity: 0.35
  }), React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 1
    }
  }, showShell ? React.createElement("div", {
    style: {
      display: 'flex'
    }
  }, React.createElement(window.Sidebar, {
    current: route,
    onNav: goto,
    onSettings: () => goto('settings'),
    onLogout: logout,
    onHome: home
  }), React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, React.createElement("div", {
    key: route,
    className: "route-in"
  }, routedScreen))) : React.createElement("div", {
    key: route,
    className: "route-in"
  }, routedScreen)), tweaksOpen && React.createElement(TweaksPanel, {
    theme: theme,
    setTheme: setTheme,
    route: route,
    setRoute: goto,
    onClose: () => {
      setTweaksOpen(false);
      window.parent.postMessage({
        type: '__edit_mode_dismissed'
      }, '*');
    }
  }), splashActive && React.createElement(window.Splash, {
    onDone: onSplashDone
  }));
};
const AppLoading = () => React.createElement("div", {
  style: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--fg-3)',
    fontSize: 'calc(13px * var(--app-font-scale))'
  }
}, "Checking your session...");
const routeErr = {
  page: {
    minHeight: '100vh',
    padding: 'calc(40px * var(--app-density-scale))',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 'calc(14px * var(--app-density-scale))',
    color: 'var(--fg-0)',
    maxWidth: 720
  },
  eyebrow: {
    fontSize: 'calc(11px * var(--app-font-scale))',
    color: 'var(--accent)',
    letterSpacing: '0.12em',
    textTransform: 'uppercase'
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 'calc(34px * var(--app-font-scale))',
    fontWeight: 300,
    margin: 0
  },
  detail: {
    maxWidth: '100%',
    whiteSpace: 'pre-wrap',
    color: 'var(--err)',
    background: 'var(--bg-1)',
    border: '1px solid var(--line)',
    borderRadius: 8,
    padding: 'calc(12px * var(--app-density-scale))',
    fontSize: 'calc(12px * var(--app-font-scale))'
  }
};
const TweaksPanel = ({
  theme,
  setTheme,
  route,
  setRoute,
  onClose
}) => {
  const Icon = window.Icon;
  return React.createElement("div", {
    style: {
      position: 'fixed',
      bottom: 24,
      right: 24,
      zIndex: 100,
      width: 280,
      padding: 'calc(18px * var(--app-density-scale))',
      borderRadius: 'var(--r-lg)',
      background: 'var(--bg-1)',
      border: '1px solid var(--line)',
      boxShadow: 'var(--shadow-lg)',
      color: 'var(--fg-0)'
    }
  }, React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 'calc(14px * var(--app-density-scale))'
    }
  }, React.createElement("div", {
    style: {
      fontSize: 'calc(13px * var(--app-font-scale))',
      fontWeight: 500,
      display: 'flex',
      alignItems: 'center',
      gap: 'calc(6px * var(--app-density-scale))'
    }
  }, React.createElement(Icon.Sparkle, {
    size: 13,
    style: {
      color: 'var(--accent)'
    }
  }), " Tweaks"), React.createElement("button", {
    onClick: onClose,
    className: "btn btn-bare",
    style: {
      padding: 'calc(4px * var(--app-density-scale))'
    }
  }, React.createElement(Icon.X, {
    size: 13
  }))), React.createElement("div", {
    style: {
      fontSize: 'calc(11px * var(--app-font-scale))',
      color: 'var(--fg-3)',
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      marginBottom: 'calc(8px * var(--app-density-scale))'
    }
  }, "Theme"), React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: 'calc(6px * var(--app-density-scale))',
      marginBottom: 'calc(18px * var(--app-density-scale))'
    }
  }, [{
    id: 'dark',
    label: 'Cosmic',
    gradient: 'linear-gradient(135deg, #08081a 0%, #a5b4fc 140%)'
  }, {
    id: 'studious',
    label: 'Studious',
    gradient: 'linear-gradient(135deg, #131210 0%, #c9a96a 140%)'
  }, {
    id: 'light',
    label: 'Refined',
    gradient: 'linear-gradient(135deg, #fbf9f3, #6b7f5a 140%)'
  }, {
    id: 'space',
    label: 'Violet',
    gradient: 'linear-gradient(135deg, #0a0a18, #c99afc 140%)'
  }].map(t => React.createElement("button", {
    key: t.id,
    onClick: () => setTheme(t.id),
    style: {
      padding: 'calc(8px * var(--app-density-scale))',
      borderRadius: 'var(--r-sm)',
      border: '1px solid ' + (theme === t.id ? 'var(--accent-soft)' : 'var(--line)'),
      background: 'var(--bg-2)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'calc(6px * var(--app-density-scale))',
      alignItems: 'center'
    }
  }, React.createElement("div", {
    style: {
      width: '100%',
      height: 28,
      borderRadius: 4,
      background: t.gradient
    }
  }), React.createElement("span", {
    style: {
      fontSize: 'calc(10.5px * var(--app-font-scale))',
      color: theme === t.id ? 'var(--fg-0)' : 'var(--fg-2)'
    }
  }, t.label)))), React.createElement("div", {
    style: {
      fontSize: 'calc(11px * var(--app-font-scale))',
      color: 'var(--fg-3)',
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      marginBottom: 'calc(8px * var(--app-density-scale))'
    }
  }, "Jump to screen"), React.createElement("select", {
    value: route,
    onChange: e => setRoute(e.target.value),
    className: "input",
    style: {
      fontSize: 'calc(12px * var(--app-font-scale))',
      width: '100%'
    }
  }, React.createElement("optgroup", {
    label: "Public"
  }, ['landing'].map(r => React.createElement("option", {
    key: r,
    value: r
  }, r))), React.createElement("optgroup", {
    label: "Auth"
  }, ['auth', 'onboarding'].map(r => React.createElement("option", {
    key: r,
    value: r
  }, r))), React.createElement("optgroup", {
    label: "App"
  }, ['dashboard', 'materials', 'material', 'storyboard', 'study-plan', 'tutor', 'notes', 'flashcards', 'quiz', 'progress', 'community', 'room', 'settings'].map(r => React.createElement("option", {
    key: r,
    value: r
  }, r)))), React.createElement("button", {
    onClick: () => {
      sessionStorage.removeItem('noesis.splashSeen');
      window.location.reload();
    },
    className: "btn btn-ghost",
    style: {
      marginTop: 'calc(12px * var(--app-density-scale))',
      width: '100%',
      justifyContent: 'center',
      fontSize: 'calc(12px * var(--app-font-scale))'
    }
  }, React.createElement(Icon.Sparkles, {
    size: 12
  }), " Replay splash"));
};
const rootEl = document.getElementById('root');
window.__NOESIS_REACT_OWNS_ROOT = true;
ReactDOM.createRoot(rootEl).render(React.createElement(App, null));
})();
