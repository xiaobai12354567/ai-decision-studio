# 公网与长期部署

本指南用于团队部署在线演示或长期运行服务。本机评审体验请按 [README](../README.md#评委快速体验) 启动；本指南使用生产项目 `aiweb-production` 和 `.env`，评审脚本使用独立项目 `aiweb-review` 和 `.env.review`。

应用和 PostgreSQL 都运行在容器内。Linux 宿主机需安装并启动 Docker Engine 与 Docker Compose 插件（支持 `up --wait --wait-timeout`）；运行应用无需在宿主机安装 Node.js。首次构建需要访问镜像源、Debian 软件源和 npm / Prisma 依赖下载服务，AI 生成功能需要访问配置的模型 API。

| 文件                                          | 用途                                                 |
| --------------------------------------------- | ---------------------------------------------------- |
| [compose.yml](../compose.yml)                 | 默认部署入口，编排应用、数据库、健康检查和自动迁移。 |
| [Dockerfile](../Dockerfile)                   | 构建生产镜像，以非 root 用户运行应用。               |
| [.dockerignore](../.dockerignore)             | 排除本机依赖、构建产物和真实环境配置。               |
| [.env.docker.example](../.env.docker.example) | Docker 部署的配置模板。                              |

以下命令使用 Bash，在 Linux 上的项目根目录执行。公网部署前需要准备域名、有效证书和 HTTPS 反向代理。

## 1. 获取源码并配置

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

## 2. 一条命令启动

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

本机 Chrome / Edge 体验可使用 `http://localhost:3000`。**通过服务器 IP、局域网地址或域名对外访问时，请配置 HTTPS 入口。** 生产模式的会话 Cookie 带有 `Secure` 属性，通过普通 HTTP 公网访问可能无法维持会话。

## 3. 配置 HTTPS 入口

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

## 4. 日常运维与更新

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
