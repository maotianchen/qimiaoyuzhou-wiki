'use strict';

const fs = require('fs');
const path = require('path');
const storage = require('./storage');

const DATA_DIR = path.resolve(process.cwd(), process.env.DATA_DIR || 'data');
const LIKES_FILE = path.join(DATA_DIR, 'likes.json');

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
ensureDirs();

function load() {
  try {
    if (fs.existsSync(LIKES_FILE)) {
      const data = JSON.parse(fs.readFileSync(LIKES_FILE, 'utf8'));
      return data && typeof data === 'object' ? data : {};
    }
  } catch {
    // 损坏则从头开始
  }
  return {};
}

function save(data) {
  fs.writeFileSync(LIKES_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// 获取某词条点赞数。
function getLikes(title) {
  const data = load();
  return data[title] ? data[title].count : 0;
}

// 点赞。title 必须存在;同一 IP 只能点一次。
function addLike(title, ip) {
  if (!storage.readPage(title)) return { ok: false, code: 404, reason: '词条不存在' };
  const data = load();
  const entry = data[title] || { count: 0, voters: [] };
  if (ip && entry.voters.includes(ip)) {
    return { ok: false, code: 409, reason: '您已为该词条点过赞', count: entry.count };
  }
  entry.count += 1;
  if (ip) entry.voters.push(ip);
  data[title] = entry;
  save(data);
  return { ok: true, count: entry.count };
}

// 点赞最多的前 n 个词条(只统计仍存在的词条)。
function topLikes(n) {
  const data = load();
  const existing = new Set(storage.listPages().map((p) => p.title));
  return Object.entries(data)
    .filter(([title]) => existing.has(title))
    .map(([title, e]) => ({ title, count: e.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

module.exports = { getLikes, addLike, topLikes };
