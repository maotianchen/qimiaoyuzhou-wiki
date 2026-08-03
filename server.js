'use strict';

const path = require('path');
const express = require('express');

const pagesRouter = require('./routes/pages');
const apiRouter = require('./routes/api');
const specialRouter = require('./routes/special');

const app = express();
const PORT = process.env.PORT || 3000;

// 解析 JSON 请求体(编辑/新建条目的 POST/PUT)
app.use(express.json({ limit: '2mb' }));

// 视图引擎:EJS,模板放在 views/
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 静态资源:public/ 下的 logo、图片等
app.use(express.static(path.join(__dirname, 'public')));

// 路由
app.use('/', pagesRouter);
app.use('/', specialRouter);
app.use('/api', apiRouter);

// 404
app.use((req, res) => {
  res.status(404).render('error', { title: null });
});

// 统一错误处理
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { title: null });
});

app.listen(PORT, () => {
  console.log(`奇喵宇宙维基已启动: http://localhost:${PORT}`);
});
