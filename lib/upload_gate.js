'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.resolve(process.cwd(), process.env.DATA_DIR || 'data');
const KEYS_FILE = path.join(DATA_DIR, 'upload_keys.json');
const KEY_TTL_MS = 24 * 3600 * 1000;       // 24h
const QUOTA_SLACK = 100 * 1024 * 1024;      // 配额冗余 100MB

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
ensureDirs();

function load() {
  try {
    if (fs.existsSync(KEYS_FILE)) {
      const arr = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
      return Array.isArray(arr) ? arr : [];
    }
  } catch {
    // 损坏则从头开始
  }
  return [];
}

function save(keys) {
  fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2), 'utf8');
}

// 签发密钥。estimatedBytes 为本次上传预估体积。
function requestKey(estimatedBytes) {
  const keys = load();
  expireOldKeys(keys);
  const entry = {
    key: crypto.randomBytes(16).toString('hex'),
    estimatedBytes,
    usedBytes: 0,
    expiresAt: Date.now() + KEY_TTL_MS,
    consumed: false,
  };
  keys.push(entry);
  save(keys);
  return entry;
}

// 校验密钥是否可用。返回 {ok, reason?, entry?}。
function validateKey(key) {
  const entry = load().find((k) => k.key === key);
  if (!entry) return { ok: false, reason: '密钥不存在' };
  if (Date.now() >= entry.expiresAt) return { ok: false, reason: '密钥已过期' };
  if (entry.consumed) return { ok: false, reason: '密钥已作废' };
  return { ok: true, entry };
}

// 扣减配额。返回 {ok, reason?, usedBytes?, quotaBytes?}。
function consumeKey(key, bytes) {
  const keys = load();
  const entry = keys.find((k) => k.key === key);
  if (!entry) return { ok: false, reason: '密钥不存在' };
  if (Date.now() >= entry.expiresAt) return { ok: false, reason: '密钥已过期' };
  if (entry.consumed) return { ok: false, reason: '密钥已作废' };

  entry.usedBytes += bytes || 0;
  const quotaBytes = entry.estimatedBytes + QUOTA_SLACK;
  if (entry.usedBytes > quotaBytes) {
    entry.consumed = true; // 超配额,作废
    save(keys);
    return { ok: false, reason: '超出预估体积配额', usedBytes: entry.usedBytes, quotaBytes };
  }
  save(keys);
  return { ok: true, usedBytes: entry.usedBytes, quotaBytes };
}

// 清理过期未用密钥。返回清理后的列表。
function expireOldKeys(keys) {
  const now = Date.now();
  const fresh = keys.filter((k) => !(now >= k.expiresAt && k.usedBytes === 0));
  if (fresh.length !== keys.length) save(fresh);
  return fresh;
}

// 查询密钥状态(不改变状态)。
function getKeyInfo(key) {
  const entry = load().find((k) => k.key === key);
  if (!entry) return null;
  return {
    key: entry.key,
    estimatedBytes: entry.estimatedBytes,
    usedBytes: entry.usedBytes,
    quotaBytes: entry.estimatedBytes + QUOTA_SLACK,
    expiresAt: entry.expiresAt,
    consumed: entry.consumed,
    expired: Date.now() >= entry.expiresAt,
  };
}

module.exports = { requestKey, validateKey, consumeKey, expireOldKeys, getKeyInfo, QUOTA_SLACK };
