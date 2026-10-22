# AI 个人决策推演室 · 下一步

帮助用户梳理职业与城市选择，通过有限的情境探索，明确关键取舍，确定一件可执行的下一步行动。

**核心流程：**描述困境 → 确认概况 → 比较路径 → 探索情境 → 更新条件 → 总结取舍 → 选择行动 → 记录结果与回访。

## 功能与边界

- AI 整理概况、提出少量追问，用户可以编辑和确认事实。
- 生成 2～3 条选择路径，支持新增、修改、删除和比较，最多保留 5 条。
- 情境展示具体时间/事件、变化、困难、依据与假设，支持反馈、纠正假设和后续探索；每路径最多 6 个情境、2 层分支。
- 修改条件后标记受影响内容，可更新情境并查看变化原因与前后差异；已有反馈保留并提示重新确认。
- 可编辑决策总结，允许暂不选择；生成 1～3 个行动，选定一个后记录结果，并结合新信息重新总结。
- PostgreSQL 持久化、概况防抖自动保存、乐观锁、生成请求幂等与失败保护。

目前通过匿名浏览器 Cookie 隔离数据，会话有效期 90 天并按访问续期。没有跨设备账号同步；清除 Cookie 或更换浏览器/域名后，无法通过原会话找回数据。概况的未保存草稿暂存在当前标签页的 sessionStorage；路径和总结需要点击保存。

当前范围不包含医疗、法律、投资等专业决策，不自动执行用户行动。AI 情境是探索材料，不是未来预测。生成返回完整结果，暂未实现逐字流式显示或后台任务队列。

## 技术栈与目录

| 层级     | 技术                                        |
| -------- | ------------------------------------------- |
| 全栈框架 | Next.js 16 App Router、React 19、TypeScript |
| AI       | AI SDK 6、DeepSeek、Zod 输出校验            |
| 数据库   | PostgreSQL、Prisma 7、PostgreSQL adapter    |
| 界面     | 原生语义控件、CSS 设计变量、Lucide 图标     |
| 测试     | Node.js test runner、tsx、独立模型测试服务  |

```text
src/app/                     页面与 HTTP 接口入口
src/features/decision/       工作台组件、请求封装、保存队列
src/domain/decision/         校验结构、共享类型、依赖与分支规则
src/server/ai/               模型接入、提示词、结构化生成
src/server/services/         决策和生成工作流
src/server/repositories/     数据访问、快照和版本更新
src/styles/                  全局样式与工作台样式
prisma/schema.prisma         数据表定义
prisma/migrations/           必须随代码提交的数据库迁移
scripts/                     启动、数据库检查、集成验证
tests/                       业务测试与独立模型夹具
docs/                        需求、架构与验证说明
```

## 环境要求

- **Node.js 24.x**，推荐与本项目验证环境保持一致；也支持满足 Prisma 要求的 Node.js 22.12+。不要只按 Next.js 的最低版本选择 Node。
- npm、Git。
- PostgreSQL。推荐使用仓库中的 `postgres:17-alpine` 数据库配置，或使用可连接的托管 PostgreSQL。
- 如使用 `compose.yaml`：安装 Docker 与 **Docker Compose v2 插件**，确保 `docker compose version` 可执行。
- DeepSeek API 密钥。缺少密钥仍可手动创建、编辑和保存内容，AI 生成会明确报错，不返回伪造答案。

需要部署 **Node.js 服务 + PostgreSQL**，不能只上传静态 HTML，也不能将应用当作静态导出站点部署。

## 首次克隆与本地启动

以下命令中的 `YOUR_USERNAME` 和 `YOUR_REPOSITORY` 必须替换为实际仓库信息。仓库创建后可以把地址直接改写成真实地址。

### 1. 获取项目并安装依赖

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
cd YOUR_REPOSITORY
node --version
npm ci
```

使用提交的 `package-lock.json` 安装依赖。首次构建和数据库迁移需要开发依赖，不要在这一阶段使用 `npm ci --omit=dev`。

### 2. 创建本机配置

Linux / macOS / WSL：

```bash
cp .env.example .env
cp .env.database.example .env.database
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env
Copy-Item .env.database.example .env.database
```

如果配置文件已经存在，保留原文件，不要用示例覆盖自己的密钥或数据库连接。

编辑 `.env.database`，将占位密码换成自己的长随机密码：

```dotenv
POSTGRES_USER=decision
POSTGRES_DB=decision
POSTGRES_PASSWORD=YOUR_DATABASE_PASSWORD
```

编辑 `.env`：

```dotenv
DATABASE_URL=postgresql://decision:YOUR_DATABASE_PASSWORD@127.0.0.1:5433/decision
DEEPSEEK_API_KEY=YOUR_DEEPSEEK_API_KEY
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=
```

两个文件中的数据库密码必须一致；示例中的 `YOUR_...` 只是占位值。建议用长随机字母数字密码，若密码包含 `@`、`:`、`/` 等字符，需要在 DATABASE_URL 中做 URL 编码。

| 变量              | 用途                                                             |
| ----------------- | ---------------------------------------------------------------- |
| DATABASE_URL      | 必填，Prisma 和应用的 PostgreSQL 连接；生成客户端/构建时也需存在 |
| DEEPSEEK_API_KEY  | AI 生成功能所需，只在服务端读取                                  |
| DEEPSEEK_MODEL    | 模型名称，默认 deepseek-chat，按服务商实际可用模型调整           |
| DEEPSEEK_BASE_URL | 可选的兼容服务地址；留空使用官方 DeepSeek，生产地址使用 HTTPS    |
| DATABASE_BIND_IP  | 仅供下方说明的 Windows + WSL 特定环境；普通部署保持未设置        |

实际 `.env` 和 `.env.database` 已被 Git 忽略；示例文件可以提交。不要使用 `NEXT_PUBLIC_` 前缀保存密钥。

### 3. 启动数据库

在**新环境**的仓库目录执行：

```bash
docker compose up -d --wait postgres
docker compose ps
```

`compose.yaml` **只启动 PostgreSQL**，没有包含应用容器。端口为宿主机 `5433` → 容器内 `5432`，数据库、用户名均为 `decision`。数据存放在 `aiweb-postgres-data` 持久化卷中。

如果使用已有或托管数据库，可跳过 Docker 和 `.env.database`，直接配置自己的 DATABASE_URL。不要照搬原开发者的 WSL IP。数据库密码只在首次初始化空数据卷时生效，修改 env 文件不会自动修改已有数据库密码。

### 4. 应用迁移并启动开发服务

```bash
npm run db:generate
npm run db:deploy
npm run db:check
npm run dev
```

看到数据库连接成功和 Next.js `Ready` 后，访问 **http://127.0.0.1:3000**。保持终端运行，按 `Ctrl+C` 停止。

`src/generated/prisma` 不进入 Git，因此新克隆必须生成客户端。使用已提交的迁移执行 `db:deploy`；`db:migrate` 仅用于开发者修改表结构后创建新迁移，不用于日常部署。不要通过重置或删除数据卷解决部署错误。

### 当前作者电脑的 Windows + WSL 特例

当前项目位于 `P:\chuanzhi\aiweb`，Docker 在 `Ubuntu-22.04` 中，已存在 `aiweb-postgres` 容器，其他数据库占用了 5432，因此使用 5433。

本机 `.env` 已额外设置 DATABASE_BIND_IP。此情况下，`npm run dev` 会启动现有容器、检查当前 WSL 地址与数据库连接，并在开发期间保持 WSL 运行，避免 WSL 空闲退出导致创建决策返回 503。

```powershell
cd P:\chuanzhi\aiweb
npm run dev
```

**新克隆的其他机器不需要这个特例。**普通 Linux、macOS、Docker Desktop 或托管数据库环境不设置 DATABASE_BIND_IP。现有容器运行时也不要再用 Compose 创建同名容器。本机 WSL IP 改变时，按 [WSL 数据库说明](docs/local-database.md) 同步连接地址与容器端口绑定。

## Linux 服务器生产部署

推荐拓扑：浏览器 → HTTPS 反向代理 → `127.0.0.1:3000` Node.js 应用 → PostgreSQL。`npm run start` 默认只监听本机地址，适合由同一服务器上的 Nginx 转发。

### 1. 构建与首次运行

在服务器安装上述依赖、克隆仓库，按前文创建 `.env` 并启动数据库。然后执行：

```bash
npm ci
npm run db:generate
npm run db:deploy
npm run db:check
npm test
npm run build
npm run start
```

`build` 会再次生成 Prisma 客户端。保留 `.next`、`node_modules`、`src/generated/prisma` 和运行所需配置；不要把 `.next` 或本机生成目录上传 Git 代替构建。`start` 不会管理 WSL 或启动数据库。

可在服务器上用 `curl -I http://127.0.0.1:3000` 检查 HTTP 服务。生产模式的会话 Cookie 为 Secure，公网浏览器应通过 HTTPS 访问，否则可能无法持续保存会话。

### 2. 配置 HTTPS 反向代理

为自己的域名配置 DNS 和有效的 HTTPS 证书。以下 Nginx 示例需要替换域名及证书路径：

```nginx
server {
    listen 80;
    server_name decision.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name decision.example.com;

    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $http_host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
```

写接口校验浏览器 Origin 与 Host，代理必须保留原始 Host（含自定义端口），并正常传递 Cookie / Set-Cookie。不要缓存决策 API 响应。AI 调用有 85 秒总期限，反向代理或托管平台的请求期限应留出数据库处理余量，例如 120 秒。

### 3. 让服务持续运行

手动执行 `npm run start` 只会在当前进程运行期间提供服务。可使用 Linux systemd 管理进程，以下 `/etc/systemd/system/decision-studio.service` 为示例：

```ini
[Unit]
Description=AI Decision Studio
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/srv/ai-decision-studio
Environment=NODE_ENV=production
ExecStartPre=/usr/bin/npm run db:check
ExecStart=/usr/bin/npm run start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

将 `deploy`、项目绝对路径与 npm 路径改为实际值，npm 路径可用 `command -v npm` 查看；确保该用户可读取 `.env`、构建产物及依赖，且数据库已运行。如果使用 nvm 等安装方式，还要通过服务的 `Environment=PATH=...` 包含实际 Node.js 可执行目录。然后执行：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now decision-studio
sudo systemctl status decision-studio
```

当前没有应用 Dockerfile。如后续把应用也放入容器，同一 Compose 网络下数据库应使用 `postgres:5432`，应用监听需改为 `0.0.0.0`，不能直接沿用宿主机的 `127.0.0.1:5433` 连接。

### 4. 后续发布更新

先备份数据库。在项目目录拉取已提交的更新并构建：

```bash
git pull --ff-only
npm ci
npm run db:generate
npm run db:deploy
npm run db:check
npm run build
sudo systemctl restart decision-studio
```

这是单实例、允许维护窗口的发布方式，更新依赖与构建期间可能影响运行中的服务；不是零停机部署。正式部署还需结合实际环境配置入口限流、数据库备份和服务日志。当前已有按会话的生成额度，但新会话可绕过该额度。

## 测试与常见问题

| 命令                     | 作用                                                                              |
| ------------------------ | --------------------------------------------------------------------------------- |
| npm test                 | 条件依赖传播和分支边界单元测试                                                    |
| npm run typecheck        | TypeScript 检查；首次先生成 Prisma 客户端                                         |
| npm run build            | 生产构建                                                                          |
| npm run db:check         | 实际数据库认证、读写与中文往返验证                                                |
| npm run test:integration | 基础接口测试，需要本地 3000 服务及数据库                                          |
| npm run test:workflows   | 先 build；自动使用 3001/4010 的隔离测试服务验证完整流程，结束后清理专用数据和进程 |
| npm run test:live-ai     | 默认跳过；需显式设置 RUN_LIVE_AI_CHECK=1 才会发送合成案例到真实模型               |

真实模型扩展测试另设置 `RUN_LIVE_WORKFLOW_CHECK=1`，会产生正常 API 调用费用。自动工作流测试不使用真实模型密钥。详细执行结果见 [验证记录](docs/verification.md)。

| 问题                      | 排查方式                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------ |
| 创建决策约 5 秒后返回 503 | 执行 db:check；检查数据库是否运行、地址/端口/密码是否匹配；WSL 环境检查 IP 与保活    |
| 提示模型未配置或认证失败  | 检查服务端 DEEPSEEK_API_KEY，修改后重启应用；数据库功能不依赖模型密钥                |
| 生产环境保存后列表为空    | 检查 HTTPS、Secure Cookie、访问域名是否变化，以及代理是否保留 Cookie                 |
| 写操作返回 403            | 检查反向代理传递的 Host 与浏览器访问的 Origin 是否一致                               |
| 迁移失败                  | 检查连接、数据库权限和已提交的 migrations；不要对有数据的数据库执行 reset            |
| 端口或容器名冲突          | 检查已有 aiweb-postgres 和 5433；此仓库的容器名/卷名默认固定，同机多份实例需分别配置 |

## Git 管理与首次上传 GitHub

### 1. 创建 GitHub 空仓库

在 GitHub 新建仓库，名称自定，例如 `ai-decision-studio`。选择 Public 或 Private；**首次创建时不勾选 README、.gitignore 或 License 初始化**，因为本地已有项目文件。复制仓库的 HTTPS 地址。

### 2. 第一次本地提交

本项目已经有 `.git`，不需要重复 `git init`。在 Windows PowerShell 执行：

```powershell
cd P:\chuanzhi\aiweb
git status
```

如果尚未设置提交身份，先设置当前仓库的作者信息（邮箱可使用 GitHub 提供的 noreply 邮箱）：

```powershell
git config user.name "YOUR_NAME"
git config user.email "YOUR_EMAIL"
```

提交前检查忽略规则，再暂存并查看文件清单：

```powershell
git check-ignore .env .env.database node_modules .next src/generated/prisma
git add .
git diff --cached --stat
git status
git commit -m "feat: initialize decision studio MVP"
git branch -M main
```

应提交源代码、README、package-lock.json、Prisma schema/migrations、测试和配置示例。实际 `.env`、`.env.database`、node_modules、.next、数据库文件与生成客户端不应进入提交。`.gitignore` 只保护未跟踪文件，已经误提交的凭据需要另行移除并更换。

### 3. 关联远程并推送

将下面地址替换成刚创建仓库的实际地址：

```powershell
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git remote -v
git push -u origin main
```

HTTPS 推送使用 Git Credential Manager 的浏览器登录，或按 GitHub 支持的方式使用个人访问令牌；不要把令牌写进远程 URL、README 或聊天。GitHub 账户密码不用于 Git 的 HTTPS 认证。已配置 SSH 的用户也可使用仓库的 SSH 地址。

如果提示 `origin already exists`，先用 `git remote -v` 确认原地址；需要修改时使用 `git remote set-url origin 实际地址`，不要盲目重复添加或强制推送。

### 4. 日常提交

```powershell
git status
git diff
git add README.md
# 其他变更也按文件逐个暂存，或检查后使用 git add .
git commit -m "docs: update deployment guide"
git push
```

开发新功能时建议使用独立分支，例如 `git switch -c codex/improve-workbench`，首次推送分支使用 `git push -u origin codex/improve-workbench`。不要将真实用户内容写进测试样例。

上述首次上传流程参考 [GitHub 官方本地项目上传说明](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github) 和 [认证说明](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-authentication-to-github)。

## 项目文档

- [MVP 需求](docs/AI%20个人决策推演室%20·%20MVP%20需求文档.md)
- [架构与目录](docs/architecture.md)
- [数据模型](docs/data-model.md)
- [接口与 AI 工作流](docs/api-and-workflows.md)
- [分阶段实施与验收](docs/implementation-plan.md)
- [作者本机 WSL 数据库说明](docs/local-database.md)
- [验证记录与已知限制](docs/verification.md)
