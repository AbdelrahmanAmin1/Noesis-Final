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
