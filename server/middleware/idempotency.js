const crypto = require('crypto');

const store = new Map();
const TTL = 3 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.ts > TTL) store.delete(key);
  }
}, 60_000);

function idempotency(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();

  const raw = JSON.stringify({ p: req.originalUrl, b: req.body });
  const hash = crypto.createHash('sha256').update(raw).digest('hex');

  if (store.has(hash)) {
    return res.redirect((req.get('Referrer') || '/admin') + '?error=Duplicate submission detected.');
  }

  store.set(hash, { ts: Date.now() });
  next();
}

module.exports = idempotency;
