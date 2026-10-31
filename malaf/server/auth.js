'use strict';
// هوية مجهولة لكل متصفح: معرّف عشوائي داخل كعكة موقّعة (HttpOnly).
// كل المشاريع والملفات مرتبطة بهذا المعرّف ولا يصل إليها غيره.
const crypto = require('crypto');
const config = require('./config');

const COOKIE = 'msid';
const MAX_AGE = 1000 * 60 * 60 * 24 * 365;

function sign(value) {
  return crypto.createHmac('sha256', config.sessionSecret).update(value).digest('base64url');
}

function verify(token) {
  if (typeof token !== 'string') return null;
  const [id, sig] = token.split('.');
  if (!id || !sig || !/^[a-f0-9]{32}$/.test(id)) return null;
  const expected = Buffer.from(sign(id));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) return null;
  return id;
}

function identify(req, res, next) {
  let uid = verify(req.cookies && req.cookies[COOKIE]);
  if (!uid) {
    uid = crypto.randomBytes(16).toString('hex');
    res.cookie(COOKIE, `${uid}.${sign(uid)}`, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.secureCookies,
      maxAge: MAX_AGE,
      path: '/',
    });
  }
  req.uid = uid;
  next();
}

module.exports = { identify, COOKIE };
