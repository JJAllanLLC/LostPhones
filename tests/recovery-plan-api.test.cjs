const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const logic = require('../recovery-logic.js');
const plan = require('../recovery-plan-core.js');
const sessionCore = require('../recovery-session-core.js');

const APPROVED_PDF_PATH = path.join(__dirname, '..', 'private/paid-downloads/LostPhones_Complete_Recovery_Protection_Plan_2026_Final.pdf');
const APPROVED_PDF_SHA256 = '1a80adc26c0819ea54bb360e84e880e9240ad2f32edbad15d8cd9bfa370978fc';

const TEST_ENV = {
  STRIPE_SECRET_KEY: 'sk_test_placeholder',
  STRIPE_RECOVERY_PLAN_PRICE_ID: 'price_1Sbsnf6SN9rpiA041qTi745y',
  SITE_URL: 'https://lostphones-v2-staging.vercel.app'
};

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

function stabilize() {
  let view = { state: logic.createInitialState() };
  view = logic.answerQuestion(view.state, 'situation', 'stolen');
  view = logic.answerQuestion(view.state, 'platform', 'iphone');
  view = logic.answerQuestion(view.state, 'currentDevice', 'trusted');
  view = logic.answerQuestion(view.state, 'safety', 'safe');
  view = logic.recordOutcome(view.state, 'apple-locate-device', 'not_found');
  view = logic.recordOutcome(view.state, 'apple-mark-lost', 'marked');
  view = logic.recordOutcome(view.state, 'protect-primary-account', 'secured');
  view = logic.recordOutcome(view.state, 'protect-mobile-line', 'secured');
  view = logic.recordOutcome(view.state, 'protect-financial-accounts', 'secured');
  return view.state;
}

function paidSession(overrides) {
  return Object.assign({
    id: 'cs_test_paid',
    mode: 'payment',
    status: 'complete',
    payment_status: 'paid',
    amount_total: 895,
    currency: 'usd',
    client_reference_id: 'token',
    metadata: { purchaseContext: 'token' },
    line_items: {
      data: [{ quantity: 1, price: { id: TEST_ENV.STRIPE_RECOVERY_PLAN_PRICE_ID } }]
    }
  }, overrides || {});
}

function stripeFromSession(session, createImpl) {
  return {
    checkout: {
      sessions: {
        create: createImpl || (async () => ({ id: 'cs_test_paid', url: 'https://checkout.stripe.com/c/pay/cs_test_paid' })),
        retrieve: async () => session
      }
    }
  };
}

test('checkout rejects missing, live, and malformed configuration', async () => {
  const redis = sessionCore.createMemoryRedis();
  const missing = await plan.handleCheckout(sameOriginReq({ state: stabilize() }), {
    env: {},
    redis: redis,
    stripe: stripeFromSession(null)
  });
  assert.equal(missing.status, 503);
  assert.equal(missing.body.ok, false);

  const live = await plan.handleCheckout(sameOriginReq({ state: stabilize() }), {
    env: Object.assign({}, TEST_ENV, { STRIPE_SECRET_KEY: 'sk_live_example' }),
    redis: redis,
    stripe: stripeFromSession(null)
  });
  assert.equal(live.body.error, 'live-key');

  const hostSpoof = await plan.handleCheckout({
    method: 'POST',
    headers: {
      host: 'lostphones-v2-staging.vercel.app',
      origin: 'https://lostphones-v2-staging.vercel.app',
      'sec-fetch-site': 'same-origin'
    },
    body: { state: stabilize() }
  }, {
    env: Object.assign({}, TEST_ENV, { SITE_URL: 'https://evil.example' }),
    redis: redis,
    stripe: stripeFromSession(null)
  });
  assert.equal(hostSpoof.body.error, 'malformed-config');
});

test('checkout uses the configured test price, quantity 1, and isolated metadata', async () => {
  const redis = sessionCore.createMemoryRedis();
  let created;
  const stripe = {
    checkout: {
      sessions: {
        create: async (params) => {
          created = params;
          return { id: 'cs_test_paid', url: 'https://checkout.stripe.com/c/pay/cs_test_paid' };
        }
      }
    }
  };
  const result = await plan.handleCheckout(sameOriginReq({ state: stabilize() }), {
    env: TEST_ENV,
    redis: redis,
    stripe: stripe
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true, url: 'https://checkout.stripe.com/c/pay/cs_test_paid' });
  assert.equal(created.mode, 'payment');
  assert.equal(created.line_items[0].price, TEST_ENV.STRIPE_RECOVERY_PLAN_PRICE_ID);
  assert.equal(created.line_items[0].quantity, 1);
  assert.deepEqual(Object.keys(created.metadata), ['purchaseContext']);
  assert.equal(JSON.stringify(created).includes('trusted'), false);
  assert.equal(JSON.stringify(created).includes('apple-mark-lost'), false);
  const keys = [...redis.store.keys()];
  assert.equal(keys.length, 1);
  assert.equal(keys[0].startsWith('recovery-plan:v1:'), true);
  assert.equal(await redis.ttl(keys[0]), 604800);
});

test('forged, missing, open, unpaid, wrong-price, wrong-amount, wrong-currency, or mismatched sessions cannot generate a PDF', async () => {
  const redis = sessionCore.createMemoryRedis();
  const token = sessionCore.generateToken();
  await plan.storePurchaseContext(redis, token, stabilize(), 'cs_test_paid', Date.now());
  const cases = [
    null,
    paidSession({ id: 'cs_test_missing' }),
    paidSession({ status: 'open', payment_status: 'unpaid', client_reference_id: token, metadata: { purchaseContext: token } }),
    paidSession({ payment_status: 'unpaid', client_reference_id: token, metadata: { purchaseContext: token } }),
    paidSession({ client_reference_id: token, metadata: { purchaseContext: token }, line_items: { data: [{ quantity: 1, price: { id: 'price_wrong' } }] } }),
    paidSession({ amount_total: 1000, client_reference_id: token, metadata: { purchaseContext: token } }),
    paidSession({ currency: 'eur', client_reference_id: token, metadata: { purchaseContext: token } }),
    paidSession({ id: 'cs_test_other', client_reference_id: token, metadata: { purchaseContext: token } })
  ];

  for (const session of cases) {
    const stripe = {
      checkout: {
        sessions: {
          retrieve: async (id) => {
            if (!session || id === 'missing') throw new Error('missing');
            return session;
          }
        }
      }
    };
    const result = await plan.handlePdf(sameOriginReq({ sessionId: session ? session.id : 'missing' }), {
      env: TEST_ENV,
      redis: redis,
      stripe: stripe,
      generatePdf: async () => {
        throw new Error('runtime generation must not run');
      }
    });
    assert.notEqual(result.status, 200, JSON.stringify(session && session.status));
    assert.equal(Buffer.isBuffer(result.body), false);
  }
});

test('a verified successful test payment serves the approved static PDF', async () => {
  const stored = fs.readFileSync(APPROVED_PDF_PATH);
  assert.equal(crypto.createHash('sha256').update(stored).digest('hex'), APPROVED_PDF_SHA256);

  const redis = sessionCore.createMemoryRedis();
  let createdToken;
  let generated = false;
  const stripe = {
    checkout: {
      sessions: {
        create: async (params) => {
          createdToken = params.client_reference_id;
          return { id: 'cs_test_paid', url: 'https://checkout.stripe.com/c/pay/cs_test_paid' };
        },
        retrieve: async () => paidSession({
          client_reference_id: createdToken,
          metadata: { purchaseContext: createdToken }
        })
      }
    }
  };
  const checkout = await plan.handleCheckout(sameOriginReq({ state: stabilize() }), {
    env: TEST_ENV,
    redis: redis,
    stripe: stripe
  });
  assert.equal(checkout.body.ok, true);
  const result = await plan.handlePdf(sameOriginReq({ sessionId: 'cs_test_paid' }), {
    env: TEST_ENV,
    redis: redis,
    stripe: stripe,
    generatePdf: async () => {
      generated = true;
      throw new Error('runtime generation must not run');
    }
  });
  assert.equal(generated, false);
  assert.equal(result.status, 200);
  assert.equal(result.headers['Content-Type'], 'application/pdf');
  assert.equal(result.headers['Content-Disposition'], 'attachment; filename="LostPhones_Complete_Recovery_Protection_Plan_2026.pdf"');
  assert.match(result.headers['Cache-Control'], /no-store/);
  assert.ok(Buffer.isBuffer(result.body));
  assert.equal(result.body.equals(stored), true);
  assert.equal(crypto.createHash('sha256').update(result.body).digest('hex'), APPROVED_PDF_SHA256);
});

test('checkout and PDF endpoints require same-origin POST', async () => {
  const redis = sessionCore.createMemoryRedis();
  const get = await plan.handleCheckout({ method: 'GET', headers: { 'sec-fetch-site': 'same-origin' }, body: {} }, {
    env: TEST_ENV,
    redis: redis,
    stripe: stripeFromSession(null)
  });
  assert.equal(get.status, 405);
  const cross = await plan.handlePdf({
    method: 'POST',
    headers: { 'sec-fetch-site': 'cross-site', host: 'evil.example' },
    body: { sessionId: 'cs_test_paid' }
  }, {
    env: TEST_ENV,
    redis: redis,
    stripe: stripeFromSession(paidSession())
  });
  assert.equal(cross.status, 403);
});
