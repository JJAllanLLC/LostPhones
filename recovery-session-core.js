const crypto = require('crypto');
const schema = require('./recovery-state-schema.js');

const GENERIC_UNAVAILABLE = Object.freeze({
  ok: false,
  error: 'unavailable',
  message: 'No recovery session is available.'
});

function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  if (typeof token !== 'string' || !token) {
    return null;
  }
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function redisKeyForToken(token) {
  const hash = hashToken(token);
  if (!hash) return null;
  return 'recovery:v1:' + hash;
}

function isOpaqueToken(token) {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

function remainingTtlSeconds(expiresAt, nowMs) {
  const remainingMs = Number(expiresAt) - nowMs;
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

function assertNoRawToken(value, rawToken) {
  if (!rawToken) return;
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  if (serialized && serialized.indexOf(rawToken) !== -1) {
    const error = new Error('raw-token-leak');
    error.code = 'raw-token-leak';
    throw error;
  }
}

function buildRecord(state, createdAt, expiresAt) {
  return {
    schemaVersion: schema.SCHEMA_VERSION,
    flowVersion: schema.FLOW_VERSION,
    createdAt: createdAt,
    expiresAt: expiresAt,
    state: state
  };
}

function validateIncomingState(state) {
  return schema.validatePersistedState(state);
}

async function createSession(redis, state, nowMs) {
  const validated = validateIncomingState(state);
  if (!validated.ok) return validated;

  const createdAt = typeof validated.state.createdAt === 'number' ? validated.state.createdAt : nowMs;
  const expiresAt = createdAt + schema.SESSION_TTL_SECONDS * 1000;
  const record = buildRecord(validated.state, createdAt, expiresAt);
  const token = generateToken();
  const key = redisKeyForToken(token);
  assertNoRawToken(record, token);
  assertNoRawToken(key, token);
  await redis.set(key, record, { ex: 604800 });
  return {
    ok: true,
    token: token,
    createdAt: createdAt,
    expiresAt: expiresAt
  };
}

async function readSession(redis, token, nowMs) {
  if (!isOpaqueToken(token)) return GENERIC_UNAVAILABLE;
  const key = redisKeyForToken(token);
  const record = await redis.get(key);
  if (!record || typeof record !== 'object') {
    return GENERIC_UNAVAILABLE;
  }
  if (!record.expiresAt || record.expiresAt <= nowMs) {
    if (key) await redis.del(key);
    return GENERIC_UNAVAILABLE;
  }
  const validated = validateIncomingState(record.state);
  if (!validated.ok) return GENERIC_UNAVAILABLE;
  return {
    ok: true,
    state: validated.state,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt
  };
}

async function updateSession(redis, token, state, nowMs) {
  if (!isOpaqueToken(token)) return GENERIC_UNAVAILABLE;
  const key = redisKeyForToken(token);
  const existing = await redis.get(key);
  if (!existing || typeof existing !== 'object') {
    return GENERIC_UNAVAILABLE;
  }
  if (!existing.expiresAt || existing.expiresAt <= nowMs) {
    await redis.del(key);
    return GENERIC_UNAVAILABLE;
  }
  const validated = validateIncomingState(state);
  if (!validated.ok) return validated;

  const ttl = remainingTtlSeconds(existing.expiresAt, nowMs);
  if (ttl <= 0) {
    await redis.del(key);
    return GENERIC_UNAVAILABLE;
  }

  const record = buildRecord(validated.state, existing.createdAt, existing.expiresAt);
  assertNoRawToken(record, token);
  await redis.set(key, record, { ex: ttl });
  return {
    ok: true,
    createdAt: existing.createdAt,
    expiresAt: existing.expiresAt
  };
}

async function deleteSession(redis, token) {
  if (isOpaqueToken(token)) {
    const key = redisKeyForToken(token);
    await redis.del(key);
  }
  return { ok: true };
}

function createMemoryRedis() {
  const store = new Map();
  return {
    store: store,
    async get(key) {
      const item = store.get(key);
      if (!item) return null;
      if (item.expiresAt <= Date.now()) {
        store.delete(key);
        return null;
      }
      return JSON.parse(JSON.stringify(item.value));
    },
    async set(key, value, options) {
      const seconds = options && options.ex ? options.ex : schema.SESSION_TTL_SECONDS;
      store.set(key, {
        value: JSON.parse(JSON.stringify(value)),
        expiresAt: Date.now() + seconds * 1000,
        ttlSeconds: seconds
      });
      return 'OK';
    },
    async del(key) {
      store.delete(key);
      return 1;
    },
    async ttl(key) {
      const item = store.get(key);
      if (!item) return -2;
      return remainingTtlSeconds(item.expiresAt, Date.now());
    }
  };
}

function hostFromHeaders(headers) {
  const forwarded = headers['x-forwarded-host'];
  if (typeof forwarded === 'string' && forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return headers.host || '';
}

function isSameOrigin(headers) {
  const host = hostFromHeaders(headers || {});
  const fetchSite = headers && headers['sec-fetch-site'];
  if (fetchSite === 'same-origin') return true;

  const origin = headers && headers.origin;
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch (error) {
      return false;
    }
  }

  const referer = headers && headers.referer;
  if (referer) {
    try {
      return new URL(referer).host === host;
    } catch (error) {
      return false;
    }
  }

  return false;
}

async function handleRequest(req, redis, nowMs) {
  const headers = { 'Cache-Control': 'no-store', Pragma: 'no-cache' };
  if (!req || req.method !== 'POST') {
    return { status: 405, headers: Object.assign({ Allow: 'POST' }, headers), body: { ok: false, error: 'method-not-allowed' } };
  }
  if (!isSameOrigin(req.headers || {})) {
    return { status: 403, headers: headers, body: { ok: false, error: 'forbidden' } };
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (error) {
      return { status: 400, headers: headers, body: { ok: false, error: 'invalid-body' } };
    }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { status: 400, headers: headers, body: { ok: false, error: 'invalid-body' } };
  }

  const operation = body.operation;
  if (['create', 'read', 'update', 'delete'].indexOf(operation) === -1) {
    return { status: 400, headers: headers, body: { ok: false, error: 'invalid-operation' } };
  }
  if (!redis) {
    return { status: 503, headers: headers, body: { ok: false, error: 'unavailable' } };
  }

  const clock = nowMs || Date.now();

  if (operation === 'create') {
    const result = await createSession(redis, body.state, clock);
    if (!result.ok) {
      return { status: result.error === 'oversized-state' ? 413 : 400, headers: headers, body: { ok: false, error: result.error } };
    }
    return {
      status: 200,
      headers: headers,
      body: { ok: true, token: result.token, createdAt: result.createdAt, expiresAt: result.expiresAt }
    };
  }

  if (operation === 'read') {
    const result = await readSession(redis, body.token, clock);
    if (!result.ok) {
      return { status: 404, headers: headers, body: { ok: false, error: 'unavailable' } };
    }
    return {
      status: 200,
      headers: headers,
      body: { ok: true, state: result.state, createdAt: result.createdAt, expiresAt: result.expiresAt }
    };
  }

  if (operation === 'update') {
    const result = await updateSession(redis, body.token, body.state, clock);
    if (!result.ok) {
      if (result.error === 'unavailable') {
        return { status: 404, headers: headers, body: { ok: false, error: 'unavailable' } };
      }
      return { status: result.error === 'oversized-state' ? 413 : 400, headers: headers, body: { ok: false, error: result.error } };
    }
    return {
      status: 200,
      headers: headers,
      body: { ok: true, createdAt: result.createdAt, expiresAt: result.expiresAt }
    };
  }

  await deleteSession(redis, body.token);
  return { status: 200, headers: headers, body: { ok: true } };
}

module.exports = {
  GENERIC_UNAVAILABLE,
  generateToken,
  hashToken,
  redisKeyForToken,
  isOpaqueToken,
  remainingTtlSeconds,
  createSession,
  readSession,
  updateSession,
  deleteSession,
  createMemoryRedis,
  isSameOrigin,
  handleRequest,
  SESSION_TTL_SECONDS: schema.SESSION_TTL_SECONDS
};
