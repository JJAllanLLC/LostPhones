const { Redis } = require('@upstash/redis');
const core = require('../recovery-session-core.js');

function getRedis() {
  const url = process.env.UPSTASH_REDIS_KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_KV_REST_API_TOKEN;
  if (!url || !token) {
    return null;
  }
  return new Redis({ url: url, token: token });
}

export default async function handler(req, res) {
  const result = await core.handleRequest(req, getRedis(), Date.now());
  Object.keys(result.headers).forEach((key) => {
    res.setHeader(key, result.headers[key]);
  });
  return res.status(result.status).json(result.body);
}
