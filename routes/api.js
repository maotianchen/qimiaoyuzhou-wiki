'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const storage = require('../lib/storage');
const history = require('../lib/history');
const { renderMarkdown } = require('../lib/render');

const router = express.Router();

// ---- 图片上传:保存到 CONTENT_DIR/media,返回可访问 URL ----
const MEDIA_DIR = path.resolve(process.cwd(), process.env.CONTENT_DIR || 'content', 'media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });

const ALLOWED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

function randomName() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, MEDIA_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.\w]/g, '');
      cb(null, randomName() + ext);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) cb(null, true);
    else cb(new Error('不支持的图片格式(仅限 jpg/png/gif/webp/svg)'));
  },
});

router.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未收到文件' });
  res.json({
    url: `/media/${req.file.filename}`,
    filename: req.file.filename,
  });
});

// 上传错误处理(文件过大等)需单独捕获
router.use((err, req, res, next) => {
  if (err && err.message) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

// ---- 预览:把 Markdown 渲染成 HTML(与条目页一致,供编辑器实时预览) ----
router.post('/preview', (req, res) => {
  const { content } = req.body || {};
  const { html } = renderMarkdown(content || '');
  res.json({ html });
});

// ---- 批量新建条目(供 agent 批量导入) ----
router.post('/pages/batch', (req, res) => {
  const items = req.body;
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: '请求体需为条目数组,如 [{title, content}, ...]' });
  }
  const results = [];
  let okCount = 0;
  items.forEach((item, i) => {
    const { title, content, summary, author } = item || {};
    try {
      const page = storage.writePage(title, content, { author });
      history.addEntry({ title: page.title, type: 'create', summary, author });
      results.push({ index: i, ok: true, title: page.title });
      okCount += 1;
    } catch (err) {
      results.push({ index: i, ok: false, title: title || '', error: err.message });
    }
  });
  res.json({ ok: okCount, failed: results.length - okCount, results });
});

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
  const { title, content, summary, author } = req.body || {};
  try {
    const page = storage.writePage(title, content, { author });
    history.addEntry({ title: page.title, type: 'create', summary, author });
    res.status(201).json(page);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---- 更新条目(支持标题重命名:body.title 为新标题) ----
router.put('/pages/:title', (req, res) => {
  const { content, title, summary, author } = req.body || {};
  try {
    const page = storage.writePage(title || req.params.title, content, {
      originalTitle: req.params.title,
      author,
    });
    history.addEntry({ title: page.title, type: 'edit', summary, author });
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
