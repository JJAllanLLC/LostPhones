(function (global) {
  const TOKEN_STORAGE_KEY = 'lostphones.recoveryToken';
  const API_PATH = '/api/recovery-session';

  let memoryToken = null;
  const logs = [];

  function resumeUrl(token) {
    const origin = global.location && global.location.origin ? global.location.origin : '';
    return origin + '/recovery.html#resume=' + token;
  }

  function readFragmentToken() {
    const hash = global.location && global.location.hash ? global.location.hash : '';
    const match = hash.match(/^#resume=([A-Za-z0-9_-]+)/);
    return match ? match[1] : null;
  }

  function stripFragment() {
    if (!global.history || !global.history.replaceState || !global.location) return;
    const url = global.location.pathname + global.location.search;
    global.history.replaceState(null, '', url);
  }

  function persistToken(token, currentDevice) {
    memoryToken = token || null;
    if (!global.localStorage) return;
    if (currentDevice === 'trusted' && token) {
      global.localStorage.setItem(TOKEN_STORAGE_KEY, token);
      return;
    }
    global.localStorage.removeItem(TOKEN_STORAGE_KEY);
  }

  function loadPersistedToken(currentDevice) {
    if (memoryToken) return memoryToken;
    if (currentDevice === 'public') return null;
    if (currentDevice === 'trusted' && global.localStorage) {
      return global.localStorage.getItem(TOKEN_STORAGE_KEY);
    }
    return null;
  }

  function clearLocalToken() {
    memoryToken = null;
    if (global.localStorage) {
      global.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  }

  function getToken() {
    return memoryToken;
  }

  async function post(operation, payload) {
    const body = Object.assign({ operation: operation }, payload || {});
    const response = await global.fetch(API_PATH, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(function () {
      return { ok: false, error: 'unavailable' };
    });
    return data;
  }

  async function create(state, currentDevice) {
    const result = await post('create', { state: state });
    if (result && result.ok && result.token) {
      persistToken(result.token, currentDevice);
    }
    return result;
  }

  async function read(token) {
    const used = token || memoryToken;
    if (!used) return { ok: false, error: 'unavailable' };
    const result = await post('read', { token: used });
    if (result && result.ok) {
      memoryToken = used;
    }
    return result;
  }

  async function update(state, currentDevice) {
    if (!memoryToken) return { ok: false, error: 'unavailable' };
    const result = await post('update', { token: memoryToken, state: state });
    if (result && result.ok && currentDevice === 'trusted') {
      persistToken(memoryToken, currentDevice);
    }
    return result;
  }

  async function remove() {
    const token = memoryToken;
    if (token) {
      await post('delete', { token: token });
    }
    clearLocalToken();
    return { ok: true };
  }

  function consumeResumeFragment() {
    const token = readFragmentToken();
    if (!token) return null;
    memoryToken = token;
    stripFragment();
    return token;
  }

  function copyResumeLink() {
    if (!memoryToken) return null;
    return resumeUrl(memoryToken);
  }

  global.LostPhonesRecoverySession = {
    TOKEN_STORAGE_KEY: TOKEN_STORAGE_KEY,
    consumeResumeFragment: consumeResumeFragment,
    persistToken: persistToken,
    loadPersistedToken: loadPersistedToken,
    clearLocalToken: clearLocalToken,
    getToken: getToken,
    create: create,
    read: read,
    update: update,
    remove: remove,
    copyResumeLink: copyResumeLink,
    resumeUrl: resumeUrl,
    logs: logs
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
