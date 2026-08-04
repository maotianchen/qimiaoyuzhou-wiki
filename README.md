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

### 2. 从 GitHub 拉取并安装项目

```bash
sudo apt-get install -y git
sudo mkdir -p /opt
cd /opt
sudo git clone https://github.com/maotianchen/qimiaoyuzhou-wiki.git qimiaoyuzhou.wiki
cd qimiaoyuzhou.wiki
sudo npm install --omit=dev
```

> 首次部署后,`content/` 与 `data/` 需让服务用户可写:`sudo chown -R www-data:www-data content data`(用户与 systemd unit 中的 `User` 保持一致)。

### 3. 配置环境变量

```bash
sudo cp .env.example .env
sudo nano .env   # 按需修改 PORT 等
```

### 4. 配置 systemd 服务(长期启用)

编辑 `deploy/qimiaoyuzhou.service`,把 `User` 和 `WorkingDirectory` 改成实际用户与路径:

```bash
sudo cp deploy/qimiaoyuzhou.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now qimiaoyuzhou   # enable = 开机自启;--now = 立即启动
sudo systemctl status qimiaoyuzhou          # 应显示 active (running)
```

验证:`curl http://localhost:3000/api/stats` 应返回 JSON。

**systemd 服务特性(已内置)**:
- `Restart=always`:进程崩溃/被杀后 3 秒自动拉起
- `enable`:服务器开机自动启动服务
- `WorkingDirectory` + `EnvironmentFile`:从 `.env` 读取端口与数据目录

**常用运维命令**:

```bash
sudo systemctl start qimiaoyuzhou        # 启动
sudo systemctl stop qimiaoyuzhou         # 停止
sudo systemctl restart qimiaoyuzhou      # 重启(改代码/配置后)
sudo systemctl status qimiaoyuzhou       # 查看状态与最近日志
sudo journalctl -u qimiaoyuzhou -f       # 实时查看日志
sudo journalctl -u qimiaoyuzhou -n 100   # 查看最近 100 行日志
```

**更新代码后重启**:

```bash
cd /opt/qimiaoyuzhou.wiki
sudo git pull                            # 拉取最新代码(从 GitHub)
sudo npm install --omit=dev              # 依赖有变时
sudo systemctl restart qimiaoyuzhou
```

### 5.(可选)Nginx 反向代理

```bash
sudo apt-get install -y nginx
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/qimiaoyuzhou.conf
sudo ln -s /etc/nginx/sites-available/qimiaoyuzhou.conf /etc/nginx/sites-enabled/
# 编辑 conf 把 server_name 换成实际域名
sudo nginx -t && sudo systemctl reload nginx
```

### 6. 数据持久化与备份

- 内容都在 `content/pages/*.md` 与 `data/history.json`,上传的图片在 `content/media/`,备份打包这几个目录即可。
- 服务器上服务用户对 `content/`、`data/` 需有读写权限(否则图片上传会失败)。
- GCP 建议:磁盘扩容、快照;后续可把这些目录放到独立磁盘。

### 6.5 图片上传说明

- 编辑页工具栏点「图片」可上传(jpg/png/gif/webp/svg,最大 8MB),图片保存到 `content/media/`,通过 `/media/文件名` 访问。
- 首次部署后确保 `content/media` 目录可写:`sudo chown -R <用户>:<用户> content`。
- Nginx 已设 `client_max_body_size 10m`,无需改动。

### 7. 防火墙与端口

**需要开放的端口**(取决于是否用 Nginx):

| 场景 | 需开放端口 | 说明 |
| --- | --- | --- |
| 只用 Nginx(推荐) | **80**(HTTP)/ **443**(HTTPS) | 外部只访问 Nginx,Nginx 反代到内网 3000 |
| 无 Nginx,直接暴露 Node | **3000**(HTTP) | 外部直接访问 Node,需另配 HTTPS |

**GCP 防火墙**(Cloud Console → VPC network → Firewall,或 `gcloud`):

```bash
# 放行 HTTP(如用 Nginx 反代)
gcloud compute firewall-rules create allow-http \
  --direction=INGRESS --priority=1000 \
  --network=default --action=ALLOW \
  --rules=tcp:80 --source-ranges=0.0.0.0/0

# 放行 HTTPS(配置证书后)
gcloud compute firewall-rules create allow-https \
  --direction=INGRESS --priority=1000 \
  --network=default --action=ALLOW \
  --rules=tcp:443 --source-ranges=0.0.0.0/0
```

**Debian 本机防火墙**(如启用 ufw):

```bash
sudo ufw allow 80/tcp       # HTTP
sudo ufw allow 443/tcp      # HTTPS
sudo ufw allow 22/tcp       # SSH(保持已有)
sudo ufw enable
```

> 端口 3000 无需对公网开放:有 Nginx 时由 Nginx 访问;即使直连也建议仅在 GCP 防火墙层面只允许本机访问,不要对 `0.0.0.0/0` 放开 3000。

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
