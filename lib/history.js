'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(process.cwd(), process.env.DATA_DIR || 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const MAX_ENTRIES = 200;

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
ensureDirs();

function load() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const arr = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
      return Array.isArray(arr) ? arr : [];
    }
  } catch {
    // 损坏的历史文件忽略,从头开始
  }
  return [];
}

function save(entries) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(entries, null, 2), 'utf8');
}

// 记录一次编辑(新建/更新共用)。时间用 ISO 字符串便于排序与展示。
function addEntry({ title, type, summary }) {
  const entries = load();
  const now = new Date().toISOString();
  entries.unshift({ title, type: type || 'edit', summary: summary || '', time: now });
  save(entries.slice(0, MAX_ENTRIES));
  return entries[0];
}

function removeEntriesFor(title) {
  const entries = load().filter((e) => e.title !== title);
  save(entries);
  return entries;
}

function list() {
  return load();
}

module.exports = { addEntry, removeEntriesFor, list };
