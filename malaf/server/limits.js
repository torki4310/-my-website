'use strict';
// حدود بسيطة في الذاكرة لكل مستخدم (نافذة منزلقة). تكفي لخادم واحد.
const buckets = new Map();

function hit(key, max, windowMs) {
  const now = Date.now();
  const list = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    buckets.set(key, list);
    return { ok: false, retryAfter: Math.ceil((windowMs - (now - list[0])) / 1000) };
  }
  list.push(now);
  buckets.set(key, list);
  return { ok: true };
}

function limiter(name, rules) {
  return (req, res, next) => {
    for (const [max, windowMs] of rules) {
      const r = hit(`${name}:${req.uid}:${windowMs}`, max, windowMs);
      if (!r.ok) {
        res.set('Retry-After', String(r.retryAfter));
        return res.status(429).json({ error: 'rate_limited', message: `تجاوزت الحد المسموح من الطلبات. حاول بعد ${Math.ceil(r.retryAfter / 60)} دقيقة.` });
      }
    }
    next();
  };
}

// طلبات عامة لكل عنوان IP لمنع الإغراق
function ipLimiter(max, windowMs) {
  return (req, res, next) => {
    const r = hit(`ip:${req.ip}`, max, windowMs);
    if (!r.ok) return res.status(429).json({ error: 'rate_limited', message: 'طلبات كثيرة. حاول لاحقًا.' });
    next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (!v.length || now - v[v.length - 1] > 86400000) buckets.delete(k);
}, 600000).unref();

module.exports = { limiter, ipLimiter, _reset: () => buckets.clear() };
