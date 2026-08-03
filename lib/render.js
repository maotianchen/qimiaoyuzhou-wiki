'use strict';

const MarkdownIt = require('markdown-it');

const md = new MarkdownIt({
  html: true,          // 允许正文内嵌 HTML(如示例的 infobox 表格)
  linkify: true,
  typographer: true,
});

// 为 h1~h4 注入 id 锚点,并收集目录(TOC)条目。
const headings = [];

md.core.ruler.push('wiki_anchors', (state) => {
  headings.length = 0;
  const seen = new Map();
  for (let i = 0; i < state.tokens.length; i++) {
    const token = state.tokens[i];
    if (token.type !== 'heading_open') continue;
    const level = Number(token.tag[1]);
    // 标题文本在紧随其后的 inline token 里
    const inline = state.tokens[i + 1];
    const text = (inline && inline.type === 'inline' ? inline.content : '').trim();
    if (!text) continue;
    // 生成唯一锚点 id(重名加 -2, -3 …)
    const base = text.replace(/\s+/g, '-');
    let id = base;
    let n = 1;
    while (seen.has(id)) { n += 1; id = `${base}-${n}`; }
    seen.set(id, true);
    token.attrSet('id', id);
    headings.push({ level, text, id });
  }
});

// 渲染 Markdown 正文,返回 { html, toc }。
function renderMarkdown(source) {
  headings.length = 0;
  const html = md.render(source || '');
  return { html, toc: headings };
}

module.exports = { renderMarkdown };
