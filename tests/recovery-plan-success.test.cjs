const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const logic = require('../recovery-logic.js');
const plan = require('../recovery-plan-core.js');
const sessionCore = require('../recovery-session-core.js');

const TEST_ENV = {
  STRIPE_SECRET_KEY: 'sk_test_placeholder',
  STRIPE_RECOVERY_PLAN_PRICE_ID: 'price_1Sbsnf6SN9rpiA041qTi745y',
  SITE_URL: 'https://lostphones-v2-staging.vercel.app'
};

const APPROVED_PDF_PATH = path.join(__dirname, '..', 'private/paid-downloads/LostPhones_Complete_Recovery_Protection_Plan_2026_Final.pdf');
const APPROVED_PDF_SHA256 = '1a80adc26c0819ea54bb360e84e880e9240ad2f32edbad15d8cd9bfa370978fc';

const successHtml = fs.readFileSync(path.join(__dirname, '..', 'recovery-plan-success.html'), 'utf8');
const successJs = fs.readFileSync(path.join(__dirname, '..', 'recovery-plan-success.js'), 'utf8');
const successCss = fs.readFileSync(path.join(__dirname, '..', 'recovery-shell.css'), 'utf8');

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

test('paid success HTML stays pending until JS verifies the checkout session', () => {
  assert.match(successHtml, /Checking your download/);
  assert.match(successHtml, /data-download-state="pending"/);
  assert.equal(/<h1[^>]*>\s*Payment confirmed/.test(successHtml), false);
  assert.equal(/Your PDF is ready/.test(successHtml), false);
  assert.match(successHtml, /emergency-shell/);
  assert.match(successHtml, /recovery-shell\.css/);
  assert.match(successHtml, /emergency-menu-toggle/);
  assert.match(successCss, /body\.emergency-shell\.paid-success/);
  assert.match(successCss, /max-width: 959px/);
});

test('verified success copy, download again, handbook guidance, and free-plan return stay available', () => {
  assert.match(successJs, /titleEl\.textContent = 'Payment confirmed'/);
  assert.match(successJs, /Your Complete Recovery & Protection Plan is ready\./);
  assert.match(successHtml, /YOUR RECOVERY PLAN/);
  assert.match(successHtml, /Download again/);
  assert.match(successHtml, /Your 22-page guide includes recovery, account security, data protection, replacement, and preparedness guidance\./);
  assert.match(successHtml, /Keep it somewhere easy to find if you need it again\./);
  assert.match(successHtml, /Updated for 2026/);
  assert.match(successHtml, /Return to my free plan/);
  assert.match(successHtml, /Protect My Phone for Next Time/);
  assert.match(successHtml, /I[’']m done for now/);
  assert.equal(/Keep this file private|private recovery record|Optional one-time download/.test(successHtml + successJs), false);
  assert.match(successJs, /replaceState/);
  assert.match(successJs, /\/api\/recovery-plan-pdf/);
  assert.match(successJs, /retry\.addEventListener\('click'/);
  assert.match(successJs, /sessionId: captured/);
  assert.match(successHtml + successJs, /LostPhones_Complete_Recovery_Protection_Plan_2026\.pdf/);
});

test('missing, malformed, unpaid, wrong amount, wrong currency, and mismatched sessions never claim payment success', async () => {
  assert.match(successJs, /We could not verify this download link\./);
  assert.match(successJs, /if \(!captured\) \{\s*showError\(\);/);
  assert.match(successJs, /if \(!response\.ok \|\| type\.indexOf\('application\/pdf'\) === -1\) \{\s*showError\(\);/);

  const redis = sessionCore.createMemoryRedis();
  const token = sessionCore.generateToken();
  await plan.storePurchaseContext(redis, token, stabilize(), 'cs_test_paid', Date.now());
  const cases = [
    { name: 'missing session', session: null, sessionId: 'missing' },
    { name: 'malformed session', session: paidSession({ id: 'cs_test_missing' }), sessionId: 'cs_test_missing' },
    { name: 'unpaid session', session: paidSession({ payment_status: 'unpaid', client_reference_id: token, metadata: { purchaseContext: token } }), sessionId: 'cs_test_paid' },
    { name: 'wrong amount', session: paidSession({ amount_total: 1000, client_reference_id: token, metadata: { purchaseContext: token } }), sessionId: 'cs_test_paid' },
    { name: 'wrong currency', session: paidSession({ currency: 'eur', client_reference_id: token, metadata: { purchaseContext: token } }), sessionId: 'cs_test_paid' },
    { name: 'mismatched context', session: paidSession({ id: 'cs_test_other', client_reference_id: token, metadata: { purchaseContext: token } }), sessionId: 'cs_test_other' }
  ];

  for (const item of cases) {
    const stripe = {
      checkout: {
        sessions: {
          retrieve: async (id) => {
            if (!item.session || id === 'missing') throw new Error('missing');
            return item.session;
          }
        }
      }
    };
    const result = await plan.handlePdf(sameOriginReq({ sessionId: item.sessionId }), {
      env: TEST_ENV,
      redis: redis,
      stripe: stripe,
      generatePdf: async () => {
        throw new Error('runtime generation must not run');
      }
    });
    assert.notEqual(result.status, 200, item.name);
    assert.equal(Buffer.isBuffer(result.body), false, item.name);
    assert.notEqual(result.headers && result.headers['Content-Type'], 'application/pdf', item.name);
  }
});

test('a verified successful test payment returns the same static PDF for Download again', async () => {
  const stored = fs.readFileSync(APPROVED_PDF_PATH);
  assert.equal(crypto.createHash('sha256').update(stored).digest('hex'), APPROVED_PDF_SHA256);
  const redis = sessionCore.createMemoryRedis();
  let createdToken;
  let generated = 0;
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
  const deps = {
    env: TEST_ENV,
    redis: redis,
    stripe: stripe,
    generatePdf: async () => {
      generated += 1;
      throw new Error('runtime generation must not run');
    }
  };
  const first = await plan.handlePdf(sameOriginReq({ sessionId: 'cs_test_paid' }), deps);
  const again = await plan.handlePdf(sameOriginReq({ sessionId: 'cs_test_paid' }), deps);
  assert.equal(generated, 0);
  assert.equal(first.status, 200);
  assert.equal(again.status, 200);
  assert.equal(first.headers['Content-Type'], 'application/pdf');
  assert.equal(again.headers['Content-Type'], 'application/pdf');
  assert.equal(first.headers['Content-Disposition'], 'attachment; filename="LostPhones_Complete_Recovery_Protection_Plan_2026.pdf"');
  assert.equal(again.headers['Content-Disposition'], first.headers['Content-Disposition']);
  assert.equal(first.body.equals(stored), true);
  assert.equal(again.body.equals(first.body), true);
  assert.equal(crypto.createHash('sha256').update(first.body).digest('hex'), APPROVED_PDF_SHA256);
  assert.equal(crypto.createHash('sha256').update(again.body).digest('hex'), APPROVED_PDF_SHA256);
});
