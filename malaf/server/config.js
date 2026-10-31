'use strict';
const path = require('path');
const fs = require('fs');

// تحميل ملف .env إن وُجد (بدون اعتماديات إضافية). لا يطغى على متغيرات البيئة الموجودة.
(function loadDotEnv() {
  const file = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
})();

const int = (v, d) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);

const config = {
  port: int(process.env.PORT, 3000),
  dataDir: path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data')),
  sessionSecret: process.env.SESSION_SECRET || '',
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  model: process.env.AI_MODEL || 'claude-opus-5-5',
  secureCookies: process.env.COOKIE_SECURE === 'true',
  limits: {
    maxFileBytes: int(process.env.MAX_FILE_MB, 5) * 1024 * 1024,
    maxFilesPerProject: int(process.env.MAX_FILES_PER_PROJECT, 30),
    maxProjectsPerUser: int(process.env.MAX_PROJECTS_PER_USER, 20),
    genPerHour: int(process.env.GEN_LIMIT_PER_HOUR, 20),
    genPerDay: int(process.env.GEN_LIMIT_PER_DAY, 60),
    pdfPerHour: int(process.env.PDF_LIMIT_PER_HOUR, 40),
  },
};

config.aiEnabled = Boolean(config.anthropicKey);

if (!config.sessionSecret) {
  // سرّ مؤقت لكل تشغيل: يعمل محليًا، لكن الجلسات تسقط عند إعادة التشغيل.
  config.sessionSecret = require('crypto').randomBytes(32).toString('hex');
  config.ephemeralSecret = true;
}

module.exports = config;
