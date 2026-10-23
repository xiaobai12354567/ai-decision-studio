# 本地 PostgreSQL（WSL2）

项目使用 Ubuntu-22.04 内的 Docker 引擎。现有 pgvector 已占用 5432，项目使用独立端口 5433，不复用已有业务数据库。

| 项目 | 值 |
| --- | --- |
| 容器 | aiweb-postgres |
| 镜像 | postgres:17-alpine |
| Windows 连接地址 | 当前为 172.24.54.168:5433，已通过 TCP 测试 |
| 数据库 / 用户 | decision / decision |
| 持久化卷 | aiweb-postgres-data |
| 本地凭据 | .env.database；Prisma 使用 .env 中的 DATABASE_URL |

密码随机生成，仅保存在上述 Git 忽略文件中。不要提交或截图分享这些文件。更改 env 文件不会改变已经初始化的数据卷中的数据库密码。

当前 WSL 未安装 Compose 插件，因此初次启动使用 docker run。项目保留 compose.database.yaml 作为源码开发的数据库配置，已有容器运行期间不要同时用 Compose 创建同名容器。完整容器部署使用根目录的 compose.yml，操作见 README。

本机 localhost 转发实测不可用，因此容器端口绑定 WSL 私有 IP，`.env` 的 DATABASE_URL 与 DATABASE_BIND_IP 使用相同地址。没有改动全局 WSL 配置。WSL 重启后 IP 可能变化；先执行 `wsl -d Ubuntu-22.04 -- hostname -I`，若 eth0 地址变化，需要更新这两个配置值，并使用新 IP 重建项目容器（保留 `aiweb-postgres-data` 卷）。不要仅修改连接字符串而忘记容器端口绑定，也不要删除持久化卷。

在 Windows PowerShell 中查看和启动已有容器：

```powershell
wsl -d Ubuntu-22.04 -- docker ps --filter name=aiweb-postgres
wsl -d Ubuntu-22.04 -- docker start aiweb-postgres
wsl -d Ubuntu-22.04 -- docker exec aiweb-postgres pg_isready -U decision -d decision
```

容器内数据目录为 `/var/lib/postgresql/data`，底层由 WSL 的 Docker 卷管理，不在项目目录或 prisma 文件夹。停止容器不会删除数据。不要执行删除卷操作。

实测 WSL 空闲退出后数据库连接会中断。现在 `npm run dev` 会在 Windows 且 `.env` 设置 DATABASE_BIND_IP 时启动 Ubuntu-22.04 的 aiweb-postgres 容器，执行真实连接检查，并保持 WSL 运行到开发服务退出。无需另外手动保持 Ubuntu 终端。此脚本不会重建容器或删除数据卷；如果 IP 改变，会停止启动并明确提示配置不一致。直接运行 `npm run start` 时仍需自行保持数据库在线。

已验证：容器 PostgreSQL 17.11 健康、Windows TCP 直连、用户名密码认证、SQL 事务读写、中文往返、初始 Prisma 迁移。迁移创建 VisitorSession、Decision、Condition 三张表。连接检查命令 `npm run db:check`，不会保留测试表或测试行。

安装依赖后使用 Prisma migration 管理表结构；避免把 db push 当成正式迁移流程。DeepSeek 密钥与数据库独立，未填密钥时仍应允许创建、编辑、保存和恢复草稿。
