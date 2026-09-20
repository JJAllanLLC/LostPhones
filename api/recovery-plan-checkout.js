const { Redis } = require('@upstash/redis');
const Stripe = require('stripe');
const core = require('../recovery-plan-core.js');

function noStore(res) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function getRedis() {
  const url = process.env.UPSTASH_REDIS_KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url: url, token: token });
}

function getStripe(secretKey) {
  return new Stripe(secretKey);
}

export default async function handler(req, res) {
  noStore(res);
  const config = core.getCheckoutConfig(process.env);
  const result = await core.handleCheckout(req, {
    env: process.env,
    redis: getRedis(),
    stripe: config.ok ? getStripe(config.secretKey) : null
  }, Date.now());
  Object.keys(result.headers).forEach((key) => {
    res.setHeader(key, result.headers[key]);
  });
  return res.status(result.status).json(result.body);
}
