# 下一步 · AI 个人决策推演室

面向职业与城市选择的 AI 决策工作台。帮助用户整理现实条件、比较可选路径、探索可能的情境，并把取舍落实为一件可以执行和验证的下一步行动。

当前状态：**MVP 已实现，可本地运行和部署。**

[项目介绍](#项目介绍) · [Windows 本地运行](#windows-本地运行) · [Linux Docker 部署](#linux-docker-部署) · [配置说明](#配置说明) · [开发与验证](#开发与验证) · [常见问题](#常见问题) · [项目文档](#项目文档)

## 项目介绍

### 使用流程

```text
描述困境 → 确认概况 → 比较路径 → 探索情境 → 更新条件 → 总结取舍 → 选择行动 → 记录结果与回访
```

| 能力           | 说明                                                                                    |
| -------------- | --------------------------------------------------------------------------------------- |
| 整理决策概况   | AI 从描述中整理事实并提出少量追问，用户可以编辑、补充和确认条件。                       |
| 比较选择路径   | 生成 2～3 条路径，比较收益、代价和前提；支持手动维护，最多保留 5 条。                   |
| 探索具体情境   | 展示事件、变化、困难、依据与假设；支持反馈和分支探索，每条路径最多 6 个情境、2 层分支。 |
| 随条件变化更新 | 标记受影响的内容，更新情境并展示变化原因与前后差异，保留已有反馈。                      |
| 落实下一步行动 | 编辑决策总结，允许暂不选择；生成 1～3 个行动，选定一个后记录结果并重新评估。            |
| 保存与恢复     | PostgreSQL 持久化，概况自动保存，路径与总结手动保存；提供版本冲突、重复生成与失败保护。 |

### 技术栈

| 层级     | 技术                                        |
| -------- | ------------------------------------------- |
| 应用框架 | Next.js 16 App Router、React 19、TypeScript |
| AI       | AI SDK 6、DeepSeek、Zod 结构校验            |
| 数据存储 | PostgreSQL、Prisma 7、PostgreSQL adapter    |
| 界面     | CSS 设计变量、原生语义控件、Lucide 图标     |
| 验证     | Node.js test runner、tsx、独立模型测试服务  |

### 当前边界

应用通过匿名浏览器 Cookie 隔离数据，会话有效期为 90 天并按访问续期。当前没有账号登录和跨设备同步，清除 Cookie、更换浏览器或访问域名后，无法通过原会话找回数据。概况的未保存草稿暂存在当前标签页的 `sessionStorage`。

AI 情境用于探索取舍，不是未来预测。当前不覆盖医疗、法律、投资等专业决策，不自动执行行动；生成结果完整返回，尚未提供逐字流式显示或后台任务队列。未配置模型密钥时仍可手动整理和保存，AI 生成功能会提示配置错误。

## Windows 本地运行

本节使用 **Windows PowerShell 运行源码**，数据库使用仓库提供的 PostgreSQL 容器，也可以连接已有 PostgreSQL。

### 1. 准备环境并获取源码

- Node.js **24.x** 和 npm；也可使用 Node.js 22.12+ 的 22.x 版本。
- Git。
- Docker 和 Docker Compose v2（使用数据库容器时），或一个 Windows 可以访问的 PostgreSQL 数据库。
- DeepSeek API 密钥（使用 AI 生成功能时）。

```powershell
git clone https://github.com/xiaobai12354567/ai-decision-studio.git
cd ai-decision-studio
node --version
npm ci
```

以下命令均在项目根目录执行。使用仓库提交的 `package-lock.json` 安装依赖；Prisma CLI 和构建工具位于开发依赖中，此时不要使用 `--omit=dev`。

### 2. 配置数据库和模型

首次运行时创建配置文件；已有配置请直接编辑，避免覆盖：

```powershell
Copy-Item .env.example .env
Copy-Item .env.database.example .env.database
```

编辑 `.env.database`，将密码占位值换成长随机字母数字密码：

```dotenv
POSTGRES_USER=decision
POSTGRES_DB=decision
POSTGRES_PASSWORD=replace_with_a_long_random_password
```

编辑 `.env`，数据库密码与上面保持一致：

```dotenv
DATABASE_URL=postgresql://decision:replace_with_a_long_random_password@127.0.0.1:5433/decision
DEEPSEEK_API_KEY=replace_with_your_deepseek_api_key
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=
```

使用已有数据库时，只需配置实际的 `DATABASE_URL`，可跳过 `.env.database` 和下一步的数据库容器命令。

### 3. 启动 PostgreSQL

确认当前终端可以执行 Docker 命令：

```powershell
docker compose version
docker compose -f compose.database.yaml up -d --wait postgres
docker compose -f compose.database.yaml ps
```

源码运行使用 [compose.database.yaml](compose.database.yaml) **只启动数据库**，配置如下：

| 项目            | 默认值                                                   |
| --------------- | -------------------------------------------------------- |
| PostgreSQL 镜像 | `postgres:17-alpine`                                     |
| 容器名          | `aiweb-postgres`                                         |
| 连接地址        | `127.0.0.1:5433` → 容器内 `5432`                         |
| 用户 / 数据库   | `decision` / `decision`                                  |
| 数据卷          | `aiweb-postgres-data`，挂载到 `/var/lib/postgresql/data` |

以上连接地址适用于 Windows 能通过本机端口访问 Docker 的环境。数据库运行在另一台 Linux 主机时，`.env` 中应填写 **Windows 可以访问的 Linux 主机地址**；数据库端口也需绑定到相应网络接口，并仅允许可信来源访问。启动数据库时可在该 Linux 终端执行 `DATABASE_BIND_IP=<Linux主机IP> docker compose -f compose.database.yaml up -d --wait postgres`。普通配置无需在 Windows 的 `.env` 中设置 `DATABASE_BIND_IP`。

该文件由原 `compose.yaml` 更名而来，保留了原有容器名和数据卷，已有数据库无需重新初始化。

### 4. 初始化并启动应用

```powershell
npm run db:generate
npm run db:deploy
npm run db:check
npm run dev
```

数据库检查成功、开发服务显示 `Ready` 后，访问 **<http://127.0.0.1:3000>**。保持终端运行，按 `Ctrl+C` 停止应用；数据库容器独立运行。

`db:generate` 生成未提交到 Git 的 Prisma 客户端；`db:deploy` 应用仓库已有迁移，首次运行和后续更新均使用该命令。只有修改数据模型并创建新迁移时才使用 `db:migrate`。

## Linux Docker 部署

仓库已提供完整部署文件，应用和 PostgreSQL 都运行在容器内。Linux 宿主机只需安装 Docker Engine 和 Docker Compose v2，无需安装 Node.js。

| 文件                                       | 用途                                                 |
| ------------------------------------------ | ---------------------------------------------------- |
| [compose.yml](compose.yml)                 | 默认部署入口，编排应用、数据库、健康检查和自动迁移。 |
| [Dockerfile](Dockerfile)                   | 构建生产镜像，以非 root 用户运行应用。               |
| [.dockerignore](.dockerignore)             | 排除本机依赖、构建产物和真实环境配置。               |
| [.env.docker.example](.env.docker.example) | Docker 部署的配置模板。                              |

以下命令使用 Bash，在 Linux 上的项目根目录执行。

### 1. 获取源码并配置

```bash
git clone https://github.com/xiaobai12354567/ai-decision-studio.git
cd ai-decision-studio
cp .env.docker.example .env
chmod 600 .env
```

已有源码或 `.env` 时直接使用并编辑，避免重新克隆或覆盖配置。

编辑 `.env`，填写以下内容；其余变量可以保持模板默认值：

```dotenv
POSTGRES_PASSWORD=replace_with_a_long_random_alphanumeric_password
DEEPSEEK_API_KEY=replace_with_your_deepseek_api_key
```

`POSTGRES_PASSWORD` 必填，请使用长随机字母数字密码，例如通过 `openssl rand -hex 24` 生成。Compose 会自动拼接数据库连接地址，因此密码不应包含 `@`、`:`、`/` 等 URL 特殊字符。`DEEPSEEK_API_KEY` 可以留空，此时仍可手动整理和保存。

Docker 部署只使用这一份 `.env`，无需创建 `.env.database`，也无需填写 `DATABASE_URL`。Compose 从 `POSTGRES_*` 生成应用的容器内连接地址，从同一文件读取模型配置。

### 2. 一条命令启动

```bash
docker compose up -d --build --wait --wait-timeout 180
```

此命令会构建镜像、启动并等待 PostgreSQL 就绪，随后自动执行 `prisma migrate deploy`，迁移成功后启动应用，并等待应用 HTTP 健康检查通过。首次部署和后续更新均使用同一命令。

默认部署配置：

- 应用仅发布到宿主机 **`127.0.0.1:3000`**；修改 `.env` 中的 `APP_PORT` 可更换宿主机端口。
- 应用通过 Compose 内网的 **`postgres:5432`** 连接数据库，数据库不向宿主机发布端口。
- 数据保存在 **`aiweb-production_postgres-data`** 命名卷中，与源码运行的数据库卷独立。
- 密钥只在容器运行时注入，不需要作为构建参数传入。

应用健康检查请求 `/api/status`，确认 HTTP 服务已响应。该接口仅显示模型和数据库变量是否配置，不代表数据库持续连通或模型调用成功；需要验证数据库读写时执行 `docker compose exec app npm run db:check`。

**公网访问还需配置 HTTPS 入口。** 生产模式的会话 Cookie 带有 `Secure` 属性，通过普通 HTTP 公网访问可能无法维持会话。

### 3. 配置 HTTPS 入口

将域名解析到服务器，准备证书，并在宿主机 Nginx 中加入站点配置。替换以下域名、证书路径；若修改了 `APP_PORT`，同步修改 `proxy_pass` 的端口。

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

确认该配置被 Nginx 主配置加载，然后检查并重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

开放 80、443 端口，通过 `https://你的域名` 创建决策、保存并刷新，验证会话和持久化；配置密钥后再测试一次 AI 生成。

代理需保留原始 `Host`（含自定义端口）和 Cookie，不缓存业务 API。应用会校验请求来源；AI 调用总期限为 85 秒，以上代理超时设置为 120 秒。

### 4. 日常运维与更新

以下命令按需执行：

```bash
docker compose ps
docker compose logs -f --tail=100 app
docker compose restart app
docker compose down
```

`down` 保留数据库卷；**不要添加 `-v`**，该参数会删除数据库卷。修改 `.env` 后运行 `docker compose up -d --build --wait --wait-timeout 180` 重新创建受影响的容器，`restart` 不会加载新环境变量。

数据库密码仅在空卷首次初始化时生效。已有数据时修改 `.env` 不会改变数据库内的密码，需要先修改数据库角色密码，再同步配置。

发布更新前先备份数据库。以下命令将备份写到当前目录：

```bash
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "decision-$(date +%Y%m%d-%H%M%S).dump"
```

确认命令成功，将备份保存在独立位置并定期验证恢复。随后在维护窗口内更新：

```bash
git pull --ff-only
docker compose up -d --build --wait --wait-timeout 180
```

启动等待最多 180 秒，超时后查看日志定位问题。当前配置部署单个应用实例，更新时会短暂停机。新实例先执行数据库迁移，失败时不会启动 Next.js；查看 `docker compose logs --tail=100 app` 修复后重新运行启动命令。回退应用镜像不会自动回退数据库结构，回滚需结合迁移兼容性和备份处理。

## 配置说明

配置文件都位于项目根目录，真实 `.env`、`.env.database` 已被 Git 忽略。密钥仅供服务端读取，不使用 `NEXT_PUBLIC_` 前缀。

| 运行方式                 | 配置来源                                  | 需要填写                                                                        |
| ------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------- |
| Windows 源码             | `.env.example` → `.env`                   | `DATABASE_URL` 和模型配置。                                                     |
| Windows 源码的数据库容器 | `.env.database.example` → `.env.database` | `POSTGRES_USER`、`POSTGRES_DB`、`POSTGRES_PASSWORD`，与 `.env` 的连接地址一致。 |
| Linux Docker             | `.env.docker.example` → `.env`            | `POSTGRES_*`、模型配置和可选的 `APP_PORT`；自动生成 `DATABASE_URL`。            |

| 变量                | 用途                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------ |
| `DATABASE_URL`      | 源码运行必填，指向应用实际可访问的 PostgreSQL；默认 Docker 部署由 Compose 自动生成。 |
| `POSTGRES_USER`     | 数据库初始化用户，默认 `decision`。                                                  |
| `POSTGRES_DB`       | 数据库初始化名称，默认 `decision`。                                                  |
| `POSTGRES_PASSWORD` | 数据库初始化密码，必须设置长随机字母数字密码。                                       |
| `DEEPSEEK_API_KEY`  | AI 生成功能所需密钥，留空不影响手动整理和保存。                                      |
| `DEEPSEEK_MODEL`    | 模型名称，默认 `deepseek-chat`。                                                     |
| `DEEPSEEK_BASE_URL` | 可选兼容服务地址，留空使用官方 DeepSeek；生产地址使用 HTTPS。                        |
| `APP_PORT`          | Docker 应用在宿主机 `127.0.0.1` 上发布的端口，默认 `3000`。                          |

数据库地址取决于**应用进程所在的位置**：

| 应用位置     | 数据库位置                    | `DATABASE_URL` 的主机与端口           |
| ------------ | ----------------------------- | ------------------------------------- |
| Windows 源码 | 本机可访问的数据库容器        | `127.0.0.1:5433`                      |
| Windows 源码 | 另一台 Linux 主机上的数据库   | `<Windows可达的Linux主机IP>:5433`     |
| 生产应用容器 | 同一 Compose 网络的数据库容器 | `postgres:5432`，自动配置             |
| 源码         | 已有或托管 PostgreSQL         | 数据库实际地址及服务商要求的 TLS 参数 |

容器内的 `127.0.0.1` 指向容器自身。源码运行时若手动填写的连接 URL 含有特殊字符密码，需要对密码进行 URL 编码；默认 Docker 部署约定使用字母数字密码，避免连接串转义。

## 开发与验证

### 常用命令

| 命令                       | 说明                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| `npm run dev`              | 检查数据库后启动本地开发服务，默认 `127.0.0.1:3000`。                                        |
| `npm run build`            | 生成 Prisma 客户端并构建生产版本。                                                           |
| `npm run start`            | 运行已有生产构建，默认监听 `127.0.0.1:3000`。                                                |
| `npm run db:generate`      | 生成 Prisma 客户端，首次克隆或模型变更后执行。                                               |
| `npm run db:deploy`        | 应用已提交的迁移，用于初始化和发布。                                                         |
| `npm run db:migrate`       | 开发时根据模型变更创建迁移，迁移文件需提交。                                                 |
| `npm run db:check`         | 检查数据库认证、事务读写与中文往返，不保留测试记录。                                         |
| `npm test`                 | 运行条件依赖传播和分支边界单元测试。                                                         |
| `npm run typecheck`        | TypeScript 检查，首次需先生成 Prisma 客户端。                                                |
| `npm run test:integration` | 基础接口验证，需要数据库和本地 3000 服务。                                                   |
| `npm run test:workflows`   | 完整流程验证，需先构建、配置数据库并空出 3001、4010 端口；使用独立模型夹具，不调用真实模型。 |
| `npm run test:live-ai`     | 真实模型验证，默认跳过；设置 `RUN_LIVE_AI_CHECK=1` 后调用，产生 API 费用。                   |

真实模型验证还可设置 `RUN_LIVE_WORKFLOW_CHECK=1` 扩展到完整流程。请使用测试数据库执行接口和工作流验证，详细范围见 [验证记录](docs/verification.md)。

### 目录结构

```text
src/app/                     页面与 HTTP 接口
src/features/decision/       工作台组件、请求封装与保存队列
src/domain/decision/         共享类型、校验与依赖规则
src/server/ai/               模型接入、提示词与结构化生成
src/server/services/         决策与生成工作流
src/server/repositories/     数据访问、快照与版本更新
src/styles/                  全局样式与工作台样式
prisma/schema.prisma         数据模型
prisma/migrations/           数据库迁移
scripts/                     启动、数据库检查与集成验证
tests/                       业务测试与模型夹具
docs/                        需求、架构与验证文档
```

## 常见问题

| 现象                                 | 排查方式                                                                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 创建决策返回 503，或开发服务无法启动 | 源码运行执行 `npm run db:check`；Docker 部署执行 `docker compose exec app npm run db:check`。应用未启动时先查看容器日志。          |
| 本地数据库端口或容器名冲突           | 检查 `aiweb-postgres` 容器和宿主机 `5433` 端口；调整端口后同步修改 `DATABASE_URL`。已有同名容器时先确认归属，不要重复创建。        |
| Docker 应用连接不上数据库            | 检查 `.env` 的 `POSTGRES_*`、`docker compose ps` 和 `docker compose logs --tail=100 app postgres`。容器内应使用 `postgres:5432`。  |
| 修改密码后仍认证失败                 | 已有数据卷不会因修改环境变量而重设密码，需同步数据库角色密码。不要通过删除数据卷解决认证问题。                                     |
| AI 提示未配置、认证失败或余额不足    | 检查服务端密钥、模型名称和服务账户。源码修改配置后重启，容器修改配置后重新创建应用容器。                                           |
| 生产环境保存后列表为空               | 检查是否使用 HTTPS、浏览器是否收到会话 Cookie、代理是否传递 Cookie，以及访问域名是否改变。                                         |
| 写操作返回 403                       | 检查代理传递的 Host（含端口）是否与浏览器 Origin 匹配。                                                                            |
| AI 请求超时或代理返回 504            | 检查模型服务连通性及代理超时；AI 总期限为 85 秒，代理建议至少 120 秒。                                                             |
| 迁移失败，应用未启动                 | 查看 `docker compose logs --tail=100 app`，检查数据库连接、权限和迁移记录。修复后重跑启动命令；已有数据时不要执行 reset 或删除卷。 |

## 项目文档

- [MVP 需求](docs/AI%20个人决策推演室%20·%20MVP%20需求文档.md)
- [架构与目录约定](docs/architecture.md)
- [数据模型](docs/data-model.md)
- [接口与 AI 工作流](docs/api-and-workflows.md)
- [分阶段实施与验收](docs/implementation-plan.md)
- [验证记录与已知限制](docs/verification.md)
