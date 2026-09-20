const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../recovery-session-core.js');
const logic = require('../recovery-logic.js');
const schema = require('../recovery-state-schema.js');

function sampleState() {
  const state = logic.createInitialState();
  state.answers.situation = 'lost';
  state.answers.platform = 'iphone';
  state.answers.currentDevice = 'trusted';
  return state;
}

function sameOriginReq(body) {
  return {
    method: 'POST',
    headers: {
      host: 'lostphones-v2-staging.vercel.app',
      origin: 'https://lostphones-v2-staging.vercel.app',
      'sec-fetch-site': 'same-origin'
    },
    body: body
  };
}

test('create hashes token, uses exact seven-day TTL, and never stores the raw token', async () => {
  const redis = core.createMemoryRedis();
  const created = await core.createSession(redis, sampleState(), Date.now());
  assert.equal(created.ok, true);
  assert.match(created.token, /^[A-Za-z0-9_-]{43}$/);
  const key = core.redisKeyForToken(created.token);
  assert.equal(key.startsWith('recovery:v1:'), true);
  assert.equal(key.includes(created.token), false);
  const ttl = await redis.ttl(key);
  assert.equal(ttl, schema.SESSION_TTL_SECONDS);
  const record = await redis.get(key);
  const serialized = JSON.stringify(record);
  assert.equal(serialized.includes(created.token), false);
  assert.equal(key.includes(created.token), false);
  assert.equal(JSON.stringify([...redis.store.keys()]).includes(created.token), false);
});

test('update does not extend original expiry', async () => {
  const redis = core.createMemoryRedis();
  const now = Date.now();
  const created = await core.createSession(redis, sampleState(), now);
  const later = now + 120000;
  const state = sampleState();
  state.answers.deviceLocation = 'offline';
  const updated = await core.updateSession(redis, created.token, state, later);
  assert.equal(updated.ok, true);
  assert.equal(updated.expiresAt, created.expiresAt);
  const ttl = await redis.ttl(core.redisKeyForToken(created.token));
  assert.ok(ttl <= schema.SESSION_TTL_SECONDS - 100);
  assert.ok(ttl > schema.SESSION_TTL_SECONDS - 200);
});

test('expired, deleted, and tampered resume tokens return a generic response', async () => {
  const redis = core.createMemoryRedis();
  const created = await core.createSession(redis, sampleState(), Date.now());
  const expired = await core.readSession(redis, created.token, Date.now() + schema.SESSION_TTL_SECONDS * 1000 + 1000);
  assert.equal(expired.ok, false);
  assert.equal(expired.error, 'unavailable');
  assert.equal(expired.state, undefined);

  const fresh = await core.createSession(redis, sampleState(), Date.now());
  await core.deleteSession(redis, fresh.token);
  const deleted = await core.readSession(redis, fresh.token, Date.now());
  assert.equal(deleted.ok, false);
  assert.equal(deleted.error, 'unavailable');

  const tampered = await core.readSession(redis, created.token.replace(/.$/, created.token.endsWith('A') ? 'B' : 'A'), Date.now());
  assert.equal(tampered.ok, false);
  assert.equal(tampered.error, 'unavailable');
});

test('API handler is POST same-origin only and rejects malformed, unknown, and oversized states', async () => {
  const redis = core.createMemoryRedis();
  const get = await core.handleRequest({ method: 'GET', headers: { 'sec-fetch-site': 'same-origin', host: 'example.com' }, body: {} }, redis);
  assert.equal(get.status, 405);
  assert.equal(get.headers['Cache-Control'], 'no-store');

  const cross = await core.handleRequest({
    method: 'POST',
    headers: { host: 'lostphones-v2-staging.vercel.app', origin: 'https://evil.example' },
    body: { operation: 'create', state: sampleState() }
  }, redis);
  assert.equal(cross.status, 403);

  const malformed = await core.handleRequest(sameOriginReq('{"nope"'), redis);
  assert.equal(malformed.status, 400);

  const unknown = await core.handleRequest(sameOriginReq({
    operation: 'create',
    state: Object.assign(sampleState(), { email: 'hidden@example.com' })
  }), redis);
  assert.equal(unknown.status, 400);

  const huge = sampleState();
  huge.actions['apple-locate-device'].outcome = 'x'.repeat(20000);
  const oversized = await core.handleRequest(sameOriginReq({ operation: 'create', state: huge }), redis);
  assert.equal(oversized.status, 413);

  const created = await core.handleRequest(sameOriginReq({ operation: 'create', state: sampleState() }), redis);
  assert.equal(created.status, 200);
  assert.ok(created.body.token);
  const token = created.body.token;

  const read = await core.handleRequest(sameOriginReq({ operation: 'read', token: token }), redis);
  assert.equal(read.status, 200);
  assert.equal(JSON.stringify(read.body).includes(token), false);
  assert.equal(JSON.stringify([...redis.store.keys()]).includes(token), false);

  const deleted = await core.handleRequest(sameOriginReq({ operation: 'delete', token: token }), redis);
  assert.equal(deleted.status, 200);
  const afterDelete = await core.handleRequest(sameOriginReq({ operation: 'read', token: token }), redis);
  assert.equal(afterDelete.status, 404);
  assert.equal(afterDelete.body.error, 'unavailable');
});

test('start over deletes the server record in tests via deleteSession', async () => {
  const redis = core.createMemoryRedis();
  const created = await core.createSession(redis, sampleState(), Date.now());
  await core.deleteSession(redis, created.token);
  const read = await core.readSession(redis, created.token, Date.now());
  assert.equal(read.ok, false);
});
