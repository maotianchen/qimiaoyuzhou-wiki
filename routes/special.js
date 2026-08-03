'use strict';

const express = require('express');
const storage = require('../lib/storage');
const history = require('../lib/history');

const router = express.Router();

// ---- 随机条目:重定向到一篇随机页面 ----
router.get('/random', (req, res) => {
  const pages = storage.listPages();
  if (!pages.length) return res.redirect('/');
  const pick = pages[Math.floor(Math.random() * pages.length)];
  res.redirect(`/wiki/${encodeURIComponent(pick.title)}`);
});

// ---- 最近更改列表页 ----
router.get('/recent', (req, res) => {
  res.render('list', {
    heading: '最近更改',
    items: history.list().map((e) => ({
      title: e.title,
      sub: e.summary || e.type,
      time: e.time,
    })),
    emptyText: '还没有任何编辑记录',
  });
});

// ---- 分类索引页 ----
router.get('/categories', (req, res) => {
  const { categories } = storage.stats();
  res.render('list', {
    heading: '分类索引',
    items: categories.map((c) => ({ title: c, sub: '', time: '' })),
    emptyText: '暂无分类',
  });
});

// ---- 搜索页 ----
router.get('/search', (req, res) => {
  const q = (req.query.q || '').trim();
  const results = storage.searchPages(q);
  res.render('search', { q, results });
});

module.exports = router;
