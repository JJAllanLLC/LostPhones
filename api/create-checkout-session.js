import { Stripe } from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request) {
  try {
    const { imei } = await request.json();

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

    return new Response(JSON.stringify({ id: session.id }), { status: 200 });
  } catch (err) {
    console.error('Stripe error:', err);
    return new Response(JSON.stringify({ error: 'Failed to create checkout session' }), { status: 500 });
  }
}

