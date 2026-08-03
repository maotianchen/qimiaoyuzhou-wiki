'use strict';

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

// ---- 配置注入(与 .env 对齐) ----
const CONTENT_DIR = process.env.CONTENT_DIR || 'content';
const PAGES_DIR = path.resolve(process.cwd(), CONTENT_DIR, 'pages');

function ensureDirs() {
  fs.mkdirSync(PAGES_DIR, { recursive: true });
}
ensureDirs();

// ---- 标题 → 文件名的安全转换 ----
// 禁止路径穿越:文件名只能是单个路径段,不允许 / \ .. 以及前后空白。
function safeFileName(title) {
  if (typeof title !== 'string') return null;
  const t = title.trim();
  if (!t) return null;
  if (t.includes('/') || t.includes('\\') || t.includes('..')) return null;
  if (/[\x00-\x1f]/.test(t)) return null; // 控制字符
  return t;
}

function filePath(title) {
  const name = safeFileName(title);
  if (!name) return null;
  return path.join(PAGES_DIR, `${name}.md`);
}

// ---- 读取单个条目 ----
function readPage(title) {
  const fp = filePath(title);
  if (!fp || !fs.existsSync(fp)) return null;
  const raw = fs.readFileSync(fp, 'utf8');
  const { data, content } = matter(raw);
  const stat = fs.statSync(fp);
  return {
    title: data.title || title.trim(),
    raw: content.trim(),
    categories: Array.isArray(data.categories) ? data.categories : [],
    summary: data.summary || '',
    updatedAt: stat.mtime.toISOString(),
  };
}

// ---- 列出全部条目(不带正文,仅元信息) ----
function listPages() {
  if (!fs.existsSync(PAGES_DIR)) return [];
  return fs.readdirSync(PAGES_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const title = f.slice(0, -3);
      const page = readPage(title);
      return page ? {
        title: page.title,
        categories: page.categories,
        summary: page.summary,
        updatedAt: page.updatedAt,
      } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

// ---- 写入条目(新建 + 更新共用) ----
// options.originalTitle:编辑已存在页面时,若标题变更则重命名文件。
function writePage(title, content, { originalTitle } = {}) {
  const name = safeFileName(title);
  if (!name) throw new Error('无效的标题');
  if (!content || typeof content !== 'string') throw new Error('内容不能为空');

  const fp = filePath(name);
  // 编辑已存在页面时,保留原 frontmatter 的分类与摘要(表单里没有这些字段)
  const existing = (fs.existsSync(fp) && readPage(name)) || null;
  const data = {
    title: name,
    categories: existing ? existing.categories : [],
    summary: existing ? existing.summary : '',
  };
  const meta = [`title: ${data.title}`];
  if (data.categories.length) meta.push(`categories: [${data.categories.join(', ')}]`);
  if (data.summary) meta.push(`summary: ${data.summary}`);
  const body = `---\n${meta.join('\n')}\n---\n\n${content}`;
  fs.writeFileSync(fp, body, 'utf8');

  if (originalTitle && originalTitle !== name) {
    const oldFp = filePath(originalTitle);
    if (oldFp && oldFp !== fp && fs.existsSync(oldFp)) {
      fs.unlinkSync(oldFp);
    }
  }
  return readPage(name);
}

// ---- 删除条目 ----
function deletePage(title) {
  const fp = filePath(title);
  if (!fp) return false;
  if (fs.existsSync(fp)) {
    fs.unlinkSync(fp);
    return true;
  }
  return false;
}

// ---- 搜索 ----
// 按标题和正文做大小写不敏感的子串匹配;标题匹配权重更高,排在前面。
function searchPages(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return [];
  return listPages()
    .map((meta) => {
      const page = readPage(meta.title);
      if (!page) return null;
      const titleHit = page.title.toLowerCase().includes(q);
      const bodyHit = page.raw.toLowerCase().includes(q);
      if (!titleHit && !bodyHit) return null;
      return { ...meta, match: titleHit ? 'title' : 'body' };
    })
    .filter(Boolean)
    .sort((a, b) => (a.match === 'title' ? -1 : 1));
}

// ---- 全站统计 ----
function stats() {
  const pages = listPages();
  return {
    pageCount: pages.length,
    categories: [...new Set(pages.flatMap((p) => p.categories))].sort(),
  };
}

module.exports = {
  PAGES_DIR,
  readPage,
  listPages,
  writePage,
  deletePage,
  searchPages,
  stats,
};
