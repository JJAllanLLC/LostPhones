# Staging paid-download E2E

This Playwright suite is deliberately locked to `https://lostphones-v2-staging.vercel.app`. It cannot be pointed at production.

It verifies the real browser path from the paid offer through Stripe test Checkout and back to the success page. It then checks server-side fulfillment, filename, PDF content type, the approved SHA-256 checksum, and **Download again**. Separate scenarios cover checkout cancellation, a missing/unverifiable Stripe session, and checkout API failure.

## Required staging setup

1. In the Vercel project, enable **Protection Bypass for Automation** for staging.
2. Add its value to the GitHub `staging` environment as the repository secret `VERCEL_AUTOMATION_BYPASS_SECRET`.
3. Optionally add `LOSTPHONES_E2E_EMAIL`; otherwise the Stripe test purchase uses `lostphones-e2e@example.com`.
4. Keep the staging deployment configured with Stripe test-mode keys and the existing `$8.95` test price.

Run the **Staging paid-download E2E** workflow manually from the `v2-development` branch after its Vercel deployment is Ready. The job refuses to run from any other branch.

For a local run:

```sh
npx playwright install chromium
VERCEL_AUTOMATION_BYPASS_SECRET='<staging bypass secret>' npm run test:e2e:staging
```

The bypass secret must never be committed. Playwright traces, screenshots, and videos are retained only on failure.
