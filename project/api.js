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
      const msg = (data && (data.error || data.message)) || ('http_' + res.status);
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
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
    },

    notes: {
      list: (folder) => req('GET', '/notes' + (folder ? '?folder=' + encodeURIComponent(folder) : '')),
      get: (id) => req('GET', '/notes/' + id),
      create: (b) => req('POST', '/notes', b),
      update: (id, b) => req('PUT', '/notes/' + id, b),
      remove: (id) => req('DELETE', '/notes/' + id),
      generate: (b) => req('POST', '/notes/generate', b),
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
      answer: (id, idx, b) => req('POST', '/tutor/sessions/' + id + '/step/' + idx + '/answer', b),
      addNote: (id, b) => req('POST', '/tutor/sessions/' + id + '/notes', b),
      finish: (id) => req('POST', '/tutor/sessions/' + id + '/finish'),
    },

    dashboard: {
      get: () => req('GET', '/dashboard'),
      progress: () => req('GET', '/dashboard/progress'),
    },

    videos: {
      generate: (b) => req('POST', '/videos', b),
      get: (id) => req('GET', '/videos/' + id),
      fileUrl: (id) => BASE + '/videos/' + id + '/file',
      fileBlobUrl: async (id) => {
        const res = await req('GET', '/videos/' + id + '/file', null, { raw: true });
        if (!res.ok) throw new Error('video_file_' + res.status);
        const blob = await res.blob();
        return URL.createObjectURL(blob);
      },
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
