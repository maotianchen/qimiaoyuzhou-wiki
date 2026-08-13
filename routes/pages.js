'use strict';

const express = require('express');
const storage = require('../lib/storage');
const history = require('../lib/history');
const likes = require('../lib/likes');
const { renderMarkdown } = require('../lib/render');

const router = express.Router();

// ---- 首页:条目数 + 最近更改 + 热门词条,渲染 home.ejs ----
router.get('/', (req, res, next) => {
  try {
    const { pageCount } = storage.stats();
    const recent = history.list().slice(0, 5);
    const featured = storage.listPages().find((p) => p.title === '猫小九历险记') || null;
    const hot = likes.topLikes(3);
    res.render('home', { pageCount, recent, featured, hot });
  } catch (err) { next(err); }
});

// ---- 条目页:渲染 Markdown 正文 + 目录 + 分类 ----
router.get('/wiki/:title', (req, res, next) => {
  try {
    const page = storage.readPage(req.params.title);
    if (!page) return res.status(404).render('error', { title: req.params.title });
    const { html, toc } = renderMarkdown(page.raw);
    // 目录每 10 条一列,列数上限 4
    const tocCols = toc.length ? Math.min(Math.max(1, Math.ceil(toc.length / 10)), 4) : 1;
    const likeCount = likes.getLikes(page.title);
    res.render('article', { page, html, toc, tocCols, likeCount });
  } catch (err) { next(err); }
});

// ---- 编辑页:显示现有内容(新建时标题在表单里填) ----
router.get('/wiki/:title/edit', (req, res, next) => {
  try {
    const page = storage.readPage(req.params.title) || { title: req.params.title, raw: '' };
    res.render('edit', { page });
  } catch (err) { next(err); }
});

module.exports = router;
