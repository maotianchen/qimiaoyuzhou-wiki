'use strict';

const express = require('express');
const storage = require('../lib/storage');
const history = require('../lib/history');

const router = express.Router();

// ---- 条目列表 ----
router.get('/pages', (req, res) => {
  res.json(storage.listPages());
});

// ---- 单个条目(原始 Markdown + 元信息) ----
router.get('/pages/:title', (req, res) => {
  const page = storage.readPage(req.params.title);
  if (!page) return res.status(404).json({ error: '页面不存在' });
  res.json(page);
});

// ---- 新建条目 ----
router.post('/pages', (req, res) => {
  const { title, content, summary } = req.body || {};
  try {
    const page = storage.writePage(title, content);
    history.addEntry({ title: page.title, type: 'create', summary });
    res.status(201).json(page);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---- 更新条目(支持标题重命名:body.title 为新标题) ----
router.put('/pages/:title', (req, res) => {
  const { content, title, summary } = req.body || {};
  try {
    const page = storage.writePage(title || req.params.title, content, {
      originalTitle: req.params.title,
    });
    history.addEntry({ title: page.title, type: 'edit', summary });
    res.json(page);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---- 删除条目 ----
router.delete('/pages/:title', (req, res) => {
  if (!storage.deletePage(req.params.title)) {
    return res.status(404).json({ error: '页面不存在' });
  }
  history.removeEntriesFor(req.params.title);
  res.json({ ok: true });
});

// ---- 搜索 ----
router.get('/search', (req, res) => {
  res.json(storage.searchPages(req.query.q));
});

// ---- 最近更改 ----
router.get('/recent', (req, res) => {
  res.json(history.list());
});

// ---- 全站统计(首页用) ----
router.get('/stats', (req, res) => {
  res.json(storage.stats());
});

module.exports = router;
