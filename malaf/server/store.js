'use strict';
// تخزين ملفات JSON على القرص: data/users/<uid>/projects/<pid>/
// كل دالة تستقبل uid، ولا يمكن الوصول لمشروع خارج مجلد صاحبه.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

const safeId = (v) => typeof v === 'string' && /^[a-z0-9]{8,40}$/.test(v);
const newId = (bytes = 8) => crypto.randomBytes(bytes).toString('hex');

function userDir(uid) {
  if (!/^[a-f0-9]{32}$/.test(uid)) throw new Error('bad uid');
  return path.join(config.dataDir, 'users', uid);
}
function projectDir(uid, pid) {
  if (!safeId(pid)) return null;
  return path.join(userDir(uid), 'projects', pid);
}

async function writeJsonAtomic(file, data) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 1));
  await fsp.rename(tmp, file);
}

async function readJson(file) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

async function listProjects(uid) {
  const dir = path.join(userDir(uid), 'projects');
  let names = [];
  try {
    names = await fsp.readdir(dir);
  } catch {
    return [];
  }
  const out = [];
  for (const n of names) {
    if (!safeId(n)) continue;
    const p = await readJson(path.join(dir, n, 'project.json'));
    if (p) out.push({ id: p.id, name: p.input.companyName || 'مشروع بدون اسم', updatedAt: p.updatedAt, languages: p.languages, hasContent: Object.keys(p.content || {}).length > 0 });
  }
  return out.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

async function getProject(uid, pid) {
  const dir = projectDir(uid, pid);
  if (!dir) return null;
  const p = await readJson(path.join(dir, 'project.json'));
  return p && p.ownerId === uid ? p : null;
}

async function saveProject(uid, project) {
  if (project.ownerId !== uid) throw new Error('owner mismatch');
  project.updatedAt = new Date().toISOString();
  await writeJsonAtomic(path.join(projectDir(uid, project.id), 'project.json'), project);
  return project;
}

async function deleteProject(uid, pid) {
  const dir = projectDir(uid, pid);
  if (!dir) return false;
  if (!(await getProject(uid, pid))) return false;
  await fsp.rm(dir, { recursive: true, force: true });
  return true;
}

// الملفات المرفوعة: تُحفظ باسم عشوائي وتُسجّل في project.files
function filePath(uid, pid, fid, ext) {
  const dir = projectDir(uid, pid);
  if (!dir || !safeId(fid) || !/^(png|jpg|webp)$/.test(ext)) return null;
  return path.join(dir, 'files', `${fid}.${ext}`);
}

async function saveFile(uid, pid, buffer, meta) {
  const fid = newId(8);
  const fp = filePath(uid, pid, fid, meta.ext);
  await fsp.mkdir(path.dirname(fp), { recursive: true });
  await fsp.writeFile(fp, buffer);
  return { id: fid, ...meta, size: buffer.length, createdAt: new Date().toISOString() };
}

async function readFile(uid, pid, file) {
  const fp = filePath(uid, pid, file.id, file.ext);
  return fp ? fsp.readFile(fp) : null;
}

async function removeFile(uid, pid, file) {
  const fp = filePath(uid, pid, file.id, file.ext);
  if (fp) await fsp.rm(fp, { force: true });
}

module.exports = { newId, listProjects, getProject, saveProject, deleteProject, saveFile, readFile, removeFile, userDir };
