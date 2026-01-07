const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

export const config = {
  api: {
    bodyParser: true,
  },
};

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const { imei } = req.body;

      const session = await stripe.checkout.sessions.create({
        line_items: [{
          price: 'price_1Sn0fE8ls8aiAA7kc4M6F09C',
          quantity: 1
        }],
        mode: 'payment',
        success_url: 'https://lostphones.com/imei-success.html?session_id={CHECKOUT_SESSION_ID}',
        cancel_url: 'https://lostphones.com/imei-check',
        metadata: { imei },
      });

      res.status(200).json({ id: session.id });
    } catch (err) {
      console.error('Stripe error:', err);
      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  } else {
    res.setHeader('Allow', 'POST');
    res.status(405).end('Method Not Allowed');
  }
}

