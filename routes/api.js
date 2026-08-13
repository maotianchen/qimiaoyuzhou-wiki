'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const storage = require('../lib/storage');
const history = require('../lib/history');
const disk = require('../lib/disk');
const uploadGate = require('../lib/upload_gate');
const likes = require('../lib/likes');
const { renderMarkdown } = require('../lib/render');

const router = express.Router();

// ---- 点赞:同一 IP 每词条一次 ----
router.post('/like/:title', (req, res) => {
  const title = req.params.title;
  const result = likes.addLike(title, req.ip);
  if (result.code === 404) return res.status(404).json({ error: result.reason });
  if (result.code === 409) return res.status(409).json({ error: result.reason, count: result.count });
  res.json({ count: result.count });
});

// ---- 热门词条 top3 ----
router.get('/likes/top', (req, res) => {
  res.json({ top: likes.topLikes(3) });
});

// ---- 上传密钥:申请(需空间充足)、查询 ----
router.post('/upload-key/request', (req, res) => {
  const { estimatedBytes } = req.body || {};
  const bytes = Number(estimatedBytes);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return res.status(400).json({ error: 'estimatedBytes 必须为正数' });
  }
  const free = disk.freeAfter(bytes);
  if (free < disk.MIN_FREE) {
    return res.status(409).json({ error: '服务器剩余空间不足,无法签发密钥', freeBytes: free });
  }
  const entry = uploadGate.requestKey(bytes);
  res.json({
    key: entry.key,
    expiresAt: entry.expiresAt,
    quotaBytes: entry.estimatedBytes + uploadGate.QUOTA_SLACK,
  });
});

router.get('/upload-key/:key', (req, res) => {
  const info = uploadGate.getKeyInfo(req.params.key);
  if (!info) return res.status(404).json({ error: '密钥不存在' });
  res.json(info);
});

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

  // 图片上传需有效密钥并计入配额
  const key = req.get('x-upload-key');
  if (!key) {
    fs.unlinkSync(req.file.path);
    return res.status(401).json({ error: '缺少 x-upload-key 请求头' });
  }
  const result = uploadGate.consumeKey(key, req.file.size);
  if (!result.ok) {
    fs.unlinkSync(req.file.path); // 清掉已落盘文件
    return res.status(403).json({ error: result.reason });
  }
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

// ---- 批量新建条目(供 agent 批量导入,需上传密钥) ----
router.post('/pages/batch', (req, res) => {
  const items = req.body;
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: '请求体需为条目数组,如 [{title, content}, ...]' });
  }

  // 批量创建需有效密钥并计入配额(按请求体字节估算)
  const key = req.get('x-upload-key');
  if (!key) return res.status(401).json({ error: '缺少 x-upload-key 请求头' });
  const consume = uploadGate.consumeKey(key, Buffer.byteLength(JSON.stringify(items), 'utf8'));
  if (!consume.ok) return res.status(403).json({ error: consume.reason });

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
  const { content, title, summary, author, birthday } = req.body || {};
  try {
    const page = storage.writePage(title || req.params.title, content, {
      originalTitle: req.params.title,
      author,
      birthday,
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
