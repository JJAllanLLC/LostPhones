const Stripe = require('stripe');

function getTestCheckoutConfig() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_IMEI_PRICE_ID;
  const siteUrl = (process.env.SITE_URL || '').replace(/\/$/, '');

  if (!secretKey || !priceId || !siteUrl) {
    return null;
  }

  if (secretKey.startsWith('sk_live_')) {
    return null;
  }

  return { secretKey, priceId, siteUrl };
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const config = getTestCheckoutConfig();
      if (!config) {
        return res.status(503).json({ error: 'Checkout unavailable' });
      }

      const stripe = Stripe(config.secretKey);
      const { imei } = req.body;

      const session = await stripe.checkout.sessions.create({
        line_items: [{
          price: config.priceId,
          quantity: 1
        }],
        mode: 'payment',
        success_url: `${config.siteUrl}/imei-success.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${config.siteUrl}/imei-check`,
        metadata: { imei },
      });

      res.status(200).json({ id: session.id });
    } catch (err) {
      console.error('Stripe error');
      res.status(500).json({ error: 'Failed to create session' });
    }
  } else {
    res.setHeader('Allow', 'POST');
    res.status(405).end('Method Not Allowed');
  }
}
