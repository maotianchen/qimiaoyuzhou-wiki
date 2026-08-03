# 奇喵宇宙维基

类维基百科网站:条目以 Markdown 文件存储,Node.js + Express 后端渲染,适配 GCP Debian 服务器部署。

## 功能

- 条目页:Markdown 渲染、自动目录(TOC)、章节锚点、分类
- 首页:动态条目数、最近更改、特色条目
- 在线编辑:新建/编辑条目(无需登录)
- 搜索、随机条目、分类索引、最近更改列表
- REST API:`/api/*`

## 本地运行

```bash
npm install
npm start          # http://localhost:3000
# 或开发模式(改动自动重启):
npm run dev
```

配置通过环境变量或 `.env`(见 `.env.example`):

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 监听端口 |
| `CONTENT_DIR` | `content` | 条目 Markdown 与媒体目录 |
| `DATA_DIR` | `data` | 最近更改等元数据目录 |

> 注意:项目不含 `.env` 加载器,环境变量需由部署环境(如 systemd `EnvironmentFile`)注入;本地直接 `export` 即可。

## 目录结构

```
├── server.js            # 入口
├── lib/                 # storage(文件读写)/ render(Markdown 渲染)/ history(最近更改)
├── routes/              # pages(页面)/ api(REST)/ special(搜索、随机、列表)
├── views/               # EJS 模板
├── public/              # 静态资源
├── content/pages/       # 条目文件:{标题}.md(UTF-8,frontmatter + Markdown)
├── data/                # history.json
└── deploy/              # systemd / nginx 示例
```

条目文件格式示例(`content/pages/猫小九历险记.md`):

```markdown
---
title: 猫小九历险记
categories: [奇喵宇宙系列, 中国儿童文学]
summary: 一部以音频为主的儿童冒险故事……
---

# 猫小九历险记

正文…(支持标准 Markdown 与内嵌 HTML)
```

- 标题即文件名;创建/重命名条目由系统自动同步文件名。
- `categories` 与 `summary` 可选,用于首页特色条目与分类索引。

## 部署到 GCP Debian

### 1. 安装 Node.js(20 LTS)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # 应显示 v20.x
```

### 2. 上传并安装项目

```bash
sudo mkdir -p /opt/qimiaoyuzhou.wiki
# 把项目文件上传到 /opt/qimiaoyuzhou.wiki(建议用 rsync/scp,保留 content/ data/ 目录)
cd /opt/qimiaoyuzhou.wiki
sudo npm install --omit=dev
```

### 3. 配置环境变量

```bash
sudo cp .env.example .env
sudo nano .env   # 按需修改 PORT 等
```

### 4. 配置 systemd 服务

编辑 `deploy/qimiaoyuzhou.service`,把 `User` 和 `WorkingDirectory` 改成实际用户与路径:

```bash
sudo cp deploy/qimiaoyuzhou.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now qimiaoyuzhou
sudo systemctl status qimiaoyuzhou
```

验证:`curl http://localhost:3000/api/stats` 应返回 JSON。

### 5.(可选)Nginx 反向代理

```bash
sudo apt-get install -y nginx
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/qimiaoyuzhou.conf
sudo ln -s /etc/nginx/sites-available/qimiaoyuzhou.conf /etc/nginx/sites-enabled/
# 编辑 conf 把 server_name 换成实际域名
sudo nginx -t && sudo systemctl reload nginx
```

### 6. 数据持久化与备份

- 内容都在 `content/pages/*.md` 与 `data/history.json`,备份只需打包这两个目录。
- 服务器上服务用户对 `content/`、`data/` 需有读写权限。
- GCP 建议:磁盘扩容、快照;后续可把这些目录放到独立磁盘。


## REST API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/pages` | 全部条目元信息 |
| GET | `/api/pages/:title` | 单条目原始 Markdown |
| POST | `/api/pages` | 新建 `{title, content, summary}` |
| PUT | `/api/pages/:title` | 更新 `{content, title?, summary}` |
| DELETE | `/api/pages/:title` | 删除 |
| GET | `/api/search?q=` | 搜索 |
| GET | `/api/recent` | 最近更改 |
| GET | `/api/stats` | 统计(条目数、分类) |
