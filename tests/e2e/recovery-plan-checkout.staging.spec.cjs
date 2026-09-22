const { test, expect } = require('@playwright/test');
const crypto = require('node:crypto');
const fs = require('node:fs');

const STAGING_ORIGIN = 'https://lostphones-v2-staging.vercel.app';
const PDF_NAME = 'LostPhones_Complete_Recovery_Protection_Plan_2026.pdf';
const PDF_SHA256 = '1a80adc26c0819ea54bb360e84e880e9240ad2f32edbad15d8cd9bfa370978fc';
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const shareToken = process.env.VERCEL_SHARE_BYPASS_TOKEN;
const accessOrigin = process.env.LOSTPHONES_E2E_ACCESS_ORIGIN || STAGING_ORIGIN;

if (accessOrigin !== STAGING_ORIGIN && !/^https:\/\/lost-phones-[a-z0-9]+-jj-allans-projects\.vercel\.app$/.test(accessOrigin)) {
  throw new Error('LOSTPHONES_E2E_ACCESS_ORIGIN must be the current LostPhones V2 staging deployment.');
}

function stagingUrl(pathname) {
  const url = new URL(pathname, accessOrigin);
  if (bypassSecret) {
    url.searchParams.set('x-vercel-protection-bypass', bypassSecret);
    url.searchParams.set('x-vercel-set-bypass-cookie', 'samesitenone');
  } else if (shareToken) {
    url.searchParams.set('_vercel_share', shareToken);
  }
  return url.toString();
}

async function installProtectionBypass(page) {
  await page.goto(stagingUrl('/recovery.html'), { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(new RegExp('^' + accessOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/'));
  await expect(page.locator('#form-situation')).toBeVisible();
}

async function openEligibleOffer(page) {
  await installProtectionBypass(page);
  await page.evaluate(() => {
    const logic = window.LostPhonesRecoveryLogic;
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
    sessionStorage.setItem('lostphones.recoveryPlanCheckoutState', JSON.stringify(view.state));
  });
  await page.goto(accessOrigin + '/recovery.html?checkout=cancelled', { waitUntil: 'networkidle' });
  await expect(page.locator('#paid-offer')).toBeVisible();
  await expect(page.locator('#keep-recovery-plan')).toContainText('$8.95');
}

async function beginCheckout(page) {
  const checkoutResponse = page.waitForResponse((response) =>
    response.url() === accessOrigin + '/api/recovery-plan-checkout' && response.request().method() === 'POST'
  );
  await page.locator('#keep-recovery-plan').click();
  const response = await checkoutResponse;
  if (!response.ok()) {
    const result = await response.json().catch(() => ({ error: 'unavailable' }));
    throw new Error('Staging checkout creation failed (' + response.status() + '): ' + result.error);
  }
  await page.waitForURL(/^https:\/\/checkout\.stripe\.com\//, { timeout: 15000 });
  await expect(page.getByText(/\$8\.95/).first()).toBeVisible();
}

async function fillFirst(page, selectors, value) {
  for (const selector of selectors) {
    const field = page.locator(selector).first();
    if (await field.count() && await field.isVisible().catch(() => false)) {
      await field.fill(value);
      return;
    }
  }
  throw new Error('Stripe Checkout field was not found: ' + selectors.join(', '));
}

async function completeStripeCheckout(page) {
  await fillFirst(page, ['input[type="email"]', '#email'], process.env.LOSTPHONES_E2E_EMAIL || 'lostphones-e2e@example.com');
  await fillFirst(page, ['#cardNumber', 'input[name="cardNumber"]', 'input[autocomplete="cc-number"]'], '4242424242424242');
  await fillFirst(page, ['#cardExpiry', 'input[name="cardExpiry"]', 'input[autocomplete="cc-exp"]'], '1234');
  await fillFirst(page, ['#cardCvc', 'input[name="cardCvc"]', 'input[autocomplete="cc-csc"]'], '123');

  const name = page.locator('#billingName, input[name="billingName"], input[autocomplete="name"]').first();
  if (await name.count() && await name.isVisible().catch(() => false)) await name.fill('LostPhones E2E');
  const country = page.locator('select[name="billingCountry"], #billingCountry').first();
  if (await country.count() && await country.isVisible().catch(() => false)) await country.selectOption('US');
  const postal = page.locator('#billingPostalCode, input[name="billingPostalCode"], input[autocomplete="postal-code"]').first();
  if (await postal.count() && await postal.isVisible().catch(() => false)) await postal.fill('10001');

  await page.getByRole('button', { name: /pay/i }).last().click();
}

async function assertPdfDownload(page, action) {
  const responsePromise = page.waitForResponse((response) =>
    response.url() === accessOrigin + '/api/recovery-plan-pdf' && response.request().method() === 'POST'
  );
  const downloadPromise = page.waitForEvent('download');
  await action();
  const [response, download] = await Promise.all([responsePromise, downloadPromise]);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/pdf');
  expect(response.headers()['content-disposition']).toBe('attachment; filename="' + PDF_NAME + '"');
  expect(download.suggestedFilename()).toBe(PDF_NAME);
  const path = await download.path();
  expect(path).toBeTruthy();
  const bytes = fs.readFileSync(path);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(PDF_SHA256);
  return bytes;
}

test.describe.serial('LostPhones staging paid recovery plan', () => {
  test.skip(!bypassSecret && !shareToken, 'A Vercel staging-access credential is required.');

  test.beforeEach(async ({ page }) => {
    if (accessOrigin === STAGING_ORIGIN) return;
    await page.route(STAGING_ORIGIN + '/**', async (route) => {
      const requested = new URL(route.request().url());
      await route.continue({ url: accessOrigin + requested.pathname + requested.search });
    });
  });

  test('completes Stripe test checkout and downloads the approved PDF twice', async ({ page }) => {
    await openEligibleOffer(page);
    await beginCheckout(page);

    const responsePromise = page.waitForResponse((response) =>
      response.url() === accessOrigin + '/api/recovery-plan-pdf' && response.request().method() === 'POST'
    );
    const downloadPromise = page.waitForEvent('download');
    await completeStripeCheckout(page);
    await page.waitForURL(accessOrigin + '/recovery-plan-success.html', { timeout: 60000 });
    const [response, download] = await Promise.all([responsePromise, downloadPromise]);

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/pdf');
    expect(response.headers()['content-disposition']).toBe('attachment; filename="' + PDF_NAME + '"');
    expect(download.suggestedFilename()).toBe(PDF_NAME);
    const firstPath = await download.path();
    const firstBytes = fs.readFileSync(firstPath);
    expect(crypto.createHash('sha256').update(firstBytes).digest('hex')).toBe(PDF_SHA256);

    await expect(page.locator('body')).toHaveAttribute('data-download-state', 'success');
    await expect(page.locator('#download-title')).toHaveText('Payment confirmed');
    await expect(page.locator('#download-copy')).toContainText('Your PDF is ready');
    await expect(page).not.toHaveURL(/session_id=/);

    const secondBytes = await assertPdfDownload(page, () => page.locator('#retry-download').click());
    expect(secondBytes.equals(firstBytes)).toBe(true);
  });

  test('returns from a canceled checkout with the free plan and offer intact', async ({ page }) => {
    await openEligibleOffer(page);
    await beginCheckout(page);
    const cancelLink = page.locator('a[href^="' + STAGING_ORIGIN + '/recovery.html?checkout=cancelled"]').first();
    await expect(cancelLink).toBeVisible();
    await cancelLink.click();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(accessOrigin + '/recovery.html');
    await expect(page.locator('#complete-summary')).toBeVisible();
    await expect(page.locator('#paid-offer')).toBeVisible();
    await expect(page.locator('#status-live')).toContainText('Checkout was cancelled');
  });

  test('shows the safe error state for an unverifiable success URL', async ({ page }) => {
    await installProtectionBypass(page);
    const rejected = page.waitForResponse((response) =>
      response.url() === accessOrigin + '/api/recovery-plan-pdf' && response.request().method() === 'POST'
    );
    await page.goto(accessOrigin + '/recovery-plan-success.html?session_id=cs_test_invalid', { waitUntil: 'networkidle' });
    expect((await rejected).status()).toBe(403);
    await expect(page.locator('body')).toHaveAttribute('data-download-state', 'error');
    await expect(page.locator('#download-title')).toHaveText('We could not verify this download link.');
    await expect(page.locator('#download-copy')).toContainText('Return to your free plan');
    await expect(page).not.toHaveURL(/session_id=/);
  });

  test('rejects a success URL with no Stripe session', async ({ page }) => {
    await installProtectionBypass(page);
    await page.goto(accessOrigin + '/recovery-plan-success.html', { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toHaveAttribute('data-download-state', 'error');
    await expect(page.locator('#download-title')).toHaveText('We could not verify this download link.');
  });

  test('keeps the free plan usable when checkout creation fails', async ({ page }) => {
    await openEligibleOffer(page);
    await page.route('**/api/recovery-plan-checkout', (route) => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: 'unavailable' })
    }));
    await page.locator('#keep-recovery-plan').click();
    await expect(page.locator('#paid-offer-feedback')).toBeVisible();
    await expect(page.locator('#paid-offer-feedback')).toHaveText('Checkout is unavailable right now. Your free plan is still here.');
    await expect(page.locator('#complete-summary')).toBeVisible();
  });
});
