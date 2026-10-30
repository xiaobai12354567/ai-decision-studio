# 下一步 · AI 个人决策推演室

面向职业与城市选择的 AI 决策工作台。用户可以整理现实条件、比较路径、探索情境，把取舍落实为一件可以执行和验证的下一步行动。

**项目状态：MVP 已实现。评审可通过 Docker 在本机复现；在线演示地址暂未提供。**

[项目介绍](#项目介绍) · [评委快速体验](#评委快速体验) · [AI 工作流与架构](#ai-工作流与架构) · [体验路线](#建议的体验路线) · [源码开发](#windows-源码开发) · [团队与参赛材料](#团队与参赛材料)

## 项目介绍

```text
描述困境 → 确认概况 → 比较路径 → 探索情境 → 更新条件 → 总结取舍 → 选择行动 → 记录结果与回访
```

| 核心能力     | 用户可以做什么                                                                        |
| ------------ | ------------------------------------------------------------------------------------- |
| 整理条件     | AI 提取已知事实并提出少量追问，用户编辑、确认决策概况。                               |
| 比较路径     | 生成 2～3 条选择路径，比较收益、代价和前提；支持手动维护，最多 5 条。                 |
| 探索情境     | 展示事件、困难、依据与假设，记录反馈并继续探索；每条路径最多 6 个情境、2 层后续分支。 |
| 跟随条件更新 | 条件改变后标记受影响内容，更新时保留原反馈，并展示变化原因和前后差异。                |
| 验证下一步   | 总结关键取舍、未知信息和 1～3 个行动，选择行动、记录结果，再带着新信息重新评估。      |

## 评委快速体验

### 1. 安装 Docker Compose 插件

```bash
sudo apt-get update
sudo apt-get install -y docker-compose-plugin
sudo docker compose version
```

### 2. 获取项目并启动容器

```bash
git clone https://github.com/xiaobai12354567/ai-decision-studio.git
cd ai-decision-studio
sudo bash scripts/review.sh
```

首次运行会自动生成 `.env.review` 和随机数据库密码，提示输入 DeepSeek API 密钥，然后构建镜像、启动 PostgreSQL、执行迁移并启动应用。完整 AI 体验需要有效密钥；回车留空可先使用手动编辑与保存。已有配置会保留，后续启动执行同一脚本。

首次构建需要联网下载镜像和依赖，AI 功能需要连接模型服务。无需另装 Node.js 或 PostgreSQL。

### 3. 检查服务并访问

在项目目录执行：

```bash
sudo docker compose --env-file .env.review -p aiweb-review ps
sudo docker compose --env-file .env.review -p aiweb-review exec app npm run db:check
```

`app`、`postgres` 应显示 `healthy`，数据库读写检查应通过。在运行 Docker 的同一台 Linux 电脑上，用 Chrome / Edge 打开 **<http://localhost:3000>**，可直接创建决策。

查看日志或停止服务：

```bash
sudo docker compose --env-file .env.review -p aiweb-review logs -f --tail=100 app postgres
sudo docker compose --env-file .env.review -p aiweb-review down
```

停止服务会保留评审数据，再次运行脚本可继续使用；不要使用 `down -v` 删除数据库卷。未配置 Docker 用户权限时，后续 Docker 命令也需添加 `sudo`。

## 建议的体验路线

以下为合成案例，可直接粘贴到“我正在纠结的事”：

> 我在杭州做了三年前端开发，存款八万元，考虑留杭州换工作或去成都。家人希望每月能探望一次，未来半年不接受裸辞，最担心收入稳定与照顾家人发生冲突。

1. **整理条件：**新建决策，点击“AI 帮我整理”，检查事实和追问，再“确认这份概况”。
2. **比较与探索：**“生成选择路径”，选择一条路径“展开可能情境”，查看依据与假设，并保存一条反馈。
3. **观察条件变化：**将预算改为三万元并确认，观察待更新提示；点击“更新受影响内容”，查看变化原因和前后差异，检查原反馈仍被保留。预算属于共同约束，可能影响所有相关路径。
4. **落实行动：**进入“整理总结与行动”，生成总结、选定一个行动；填写体验用的行动结果，再结合新信息更新总结。

这条路线覆盖概况、路径、情境、依赖更新和行动回访。模型调用会有等待时间；AI 内容需要用户确认，依据与假设的分开展示不等于自动事实核查。

## AI 工作流与架构

### 已实现的 AI 设计

- **分阶段结构化生成：**概况整理、路径生成、情境展开、后续分支、条件刷新和行动总结，分别使用对应提示词和输出结构，共享决策条件、反馈与行动历史。
- **条件依赖与可追踪更新：**用稳定的条件 ID 关联路径和情境，条件变化后传播失效范围；更新保留原 ID 和反馈，记录变化原因与前后差异。
- **从探索回到实际行动：**行动说明要做什么、验证什么、如何帮助判断，记录的实际结果参与后续总结。
- **生成结果的业务校验：**Zod 检查输出结构，服务端检查引用、数量边界和版本；请求幂等、生成互斥与事务提交保护已有内容。

当前实现聚焦受控 AI 决策工作流，尚未集成 RAG、MCP、外部工具调用或自主 Agent；生成结果完整返回，尚未提供逐字流式输出和后台任务队列。

```mermaid
flowchart LR
    Browser[React 决策工作台] --> API[Next.js API]
    API --> Workflow[决策工作流与业务校验]
    Workflow --> Model[DeepSeek 结构化生成]
    Workflow --> DB[(PostgreSQL)]
    Model --> Workflow
```

| 层级         | 技术与入口                                                        |
| ------------ | ----------------------------------------------------------------- |
| 应用与界面   | Next.js 16 App Router、React 19、TypeScript、CSS、Lucide 图标     |
| AI           | AI SDK 6、DeepSeek、Zod；`src/server/ai/`                         |
| 工作流与规则 | `src/server/services/`、`src/domain/decision/`                    |
| 数据         | PostgreSQL 17、Prisma 7、PostgreSQL adapter；`prisma/migrations/` |
| 部署         | Node.js 24 Docker 镜像、Docker Compose、自动迁移、健康检查        |
| 测试         | Node.js test runner、tsx、接口测试和独立模型夹具                  |

更详细的目录、接口和实现约定见 [架构文档](docs/architecture.md) 与 [AI 工作流](docs/api-and-workflows.md)。

## 配置、停止与排查

评审配置统一写入 `.env.review`：

| 变量                | 需要做什么                                                                 |
| ------------------- | -------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD` | 脚本自动生成。数据库初始化后保持原值；修改配置文件不会重设数据库内的密码。 |
| `DEEPSEEK_API_KEY`  | 首次提示输入，也可编辑文件填写；真实 AI 功能需要有效密钥。                 |
| `DEEPSEEK_MODEL`    | 默认 `deepseek-chat`，按实际可用模型调整。                                 |
| `DEEPSEEK_BASE_URL` | 默认留空使用官方服务；兼容网关使用 HTTPS。                                 |
| `APP_PORT`          | 默认 `3000`；端口被占用时改为 `3001` 等空闲端口，再运行脚本。              |

`DATABASE_URL` 由 Compose 自动生成，容器通过 `postgres:5432` 连接数据库。若终端已设置同名 `POSTGRES_*` 或 `APP_PORT` 等环境变量，它们优先于配置文件，排查时应一并检查。

查看日志和停止评审服务：

```bash
docker compose --env-file .env.review -p aiweb-review logs -f --tail=100 app postgres
docker compose --env-file .env.review -p aiweb-review down
```

`down` 保留数据，再次运行脚本可继续使用。对需要保留的数据不要使用 `down -v`。

| 现象                          | 处理方式                                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 提示 Docker 未运行或无法连接  | 执行 `sudo systemctl start docker`，确认 `sudo docker info` 和 `sudo docker compose version` 成功，再运行脚本。 |
| 构建卡住或依赖下载失败        | 检查 Docker 镜像源和依赖下载网络，查看构建输出；首次构建需要联网。                                              |
| 3000 端口被占用               | 修改 `.env.review` 的 `APP_PORT` 并重跑脚本，使用脚本输出的新地址。                                             |
| AI 未配置、认证失败、余额不足 | 编辑 `.env.review` 的密钥、模型及服务地址，检查服务账户，再重新运行脚本。                                       |
| 启动超时或迁移失败            | 用上方日志命令查看 `app`、`postgres`；检查原密码、数据库状态及迁移记录，避免删除卷或执行 reset。                |
| 保存后列表为空 / 写操作 403   | 保持相同浏览器和访问地址；本机用 localhost，远程可用 SSH 转发，公网用 HTTPS，并检查代理 Host / Cookie。         |

**数据与功能边界：**通过匿名浏览器 Cookie 隔离数据，会话有效期为 90 天并按访问续期。当前没有账号和跨设备同步，清除 Cookie、更换浏览器或访问主机名后无法通过原会话找回数据。AI 情境用于探索取舍，当前范围不覆盖医疗、法律、投资等专业决策，也不自动执行行动。

## Windows 源码开发

源码开发使用 Node.js **24.x**（或 Node.js 22.12+ 的 22.x）、npm，以及可连接的 PostgreSQL。以下命令在项目根目录的 PowerShell 执行；这条路线用于开发，评审推荐使用上面的 Docker 脚本。

```powershell
npm ci
Copy-Item .env.example .env
Copy-Item .env.database.example .env.database
```

已有配置请直接编辑，避免覆盖。`.env.database` 填写数据库用户、库名和密码，`.env` 配置匹配的连接及模型密钥：

```dotenv
DATABASE_URL=postgresql://decision:YOUR_DATABASE_PASSWORD@127.0.0.1:5433/decision
DEEPSEEK_API_KEY=YOUR_DEEPSEEK_API_KEY
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=
```

```powershell
docker compose -f compose.database.yaml up -d --wait postgres
npm run db:generate
npm run db:deploy
npm run db:check
npm run dev
```

访问 <http://127.0.0.1:3000>，按 `Ctrl+C` 停止开发服务。已有数据库可跳过容器和 `.env.database`；数据库运行在另一台 Linux 主机时，`DATABASE_URL` 使用 Windows 可访问的主机地址与端口，Linux 上的数据库端口需绑定到相应网络接口并限制可信来源。`DATABASE_BIND_IP` 在该 Linux 终端提供给 Compose 即可，Windows 的 `.env` 只填写数据库连接地址。

[compose.database.yaml](compose.database.yaml) 仅运行开发数据库，保留原 `aiweb-postgres` 容器名、`5433` 端口及 `aiweb-postgres-data` 数据卷。开发数据库、评审数据库和生产数据库分别管理。首次克隆需生成未提交 Git 的 Prisma 客户端；初始化和部署使用 `db:deploy`，创建新迁移才使用 `db:migrate`。

| 验证命令                   | 说明                                                                  |
| -------------------------- | --------------------------------------------------------------------- |
| `npm test`                 | 条件依赖传播与分支边界单元测试。                                      |
| `npm run typecheck`        | TypeScript 检查，首次先生成 Prisma 客户端。                           |
| `npm run build`            | 生成客户端并生产构建。                                                |
| `npm run test:integration` | 需已运行的本地 3000 服务和测试数据库，创建并清理测试会话。            |
| `npm run test:workflows`   | 先构建，需测试数据库与空闲 3001 / 4010 端口，使用独立模型夹具。       |
| `npm run test:live-ai`     | 默认跳过；显式设置 `RUN_LIVE_AI_CHECK=1` 后使用合成案例调用真实模型。 |

测试范围和已知限制见 [验证记录](docs/verification.md)。独立模型夹具用于验证业务流程，真实模型效果需要另外评估。

## 团队与参赛材料

| 项目              | 当前信息                   |
| ----------------- | -------------------------- |
| 团队名称及学校    | AI主C人类喊6--河南城建学院 |
| 成员              | 段舒明、王梦晴、梁玉杰     |
| 在线演示          | 暂未提供                   |
| 5～8 分钟演示视频 | 待补充                     |
| 技术文档 PDF      | 待补充                     |


