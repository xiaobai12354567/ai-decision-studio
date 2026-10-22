# 架构设计与目录约定

状态：架构基线与当前实现约定。核心 MVP 已实现，具体验证范围见 verification.md。需求以《AI 个人决策推演室 · MVP 需求文档》为准。

## 1. 决策与边界

采用方案 A：Next.js App Router、React、TypeScript、AI SDK、DeepSeek、Zod、Prisma、PostgreSQL。部署为单个 Node.js 服务加一个数据库；不使用静态导出，因为应用需要服务端模型调用与持久化。

前端使用 React 自带状态、原生语义控件、统一 CSS 变量和 Lucide 图标。当前组件规模不需要额外 UI 运行时，因此没有引入早期建议中的 Tailwind/shadcn；样式分别放在 globals.css 和 workspace.css。请求串行队列集中在 features/decision/hooks/use-decision.ts，不引入 Zustand 或通用状态机框架。

不引入微服务、消息队列、Redis、向量数据库、RAG、多 Agent、MCP。当前范围不包含专业医疗/法律/投资决策、自动执行行动、多人协作与外部账户集成。

## 2. 目录结构

以下是目标结构，按功能创建，不预建空壳模块。

```text
aiweb/
├─ docs/                         # 需求、设计、验收说明
├─ prisma/
│  ├─ schema.prisma              # 正式数据模型
│  └─ migrations/                # 可复现的数据库变更
├─ public/                       # 静态资源
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx              # 应用壳与基础元数据
│  │  ├─ page.tsx                # 决策列表
│  │  ├─ decisions/
│  │  │  ├─ new/page.tsx         # 描述困境、补充条件、确认概况
│  │  │  └─ [id]/
│  │  │     ├─ page.tsx          # 路径与情境工作台
│  │  │     └─ summary/page.tsx  # 总结、选择行动、记录结果
│  │  └─ api/                   # HTTP 入口；具体路由见接口文档
│  ├─ components/
│  │  ├─ ui/                    # 不依赖决策业务的基础组件
│  │  └─ layout/                # 导航、页面容器
│  ├─ features/
│  │  └─ decision/
│  │     ├─ components/         # 概况表单、路径、情境、反馈、行动面板
│  │     ├─ hooks/              # 自动保存、请求进度、加载状态
│  │     └─ api.ts              # 类型化 HTTP 调用
│  ├─ domain/
│  │  └─ decision/
│  │     ├─ schemas.ts          # 业务输入/输出结构及推导类型
│  │     ├─ dependencies.ts     # 影响范围和失效传播的纯函数
│  │     └─ transitions.ts      # 状态变更规则
│  ├─ server/
│  │  ├─ services/              # 决策、探索、总结三个业务服务起步
│  │  ├─ repositories/          # Prisma 查询与原子写入
│  │  ├─ ai/
│  │  │  ├─ provider.ts         # DeepSeek 配置与调用入口
│  │  │  ├─ prompts/            # 按生成任务组织的提示词
│  │  │  └─ schemas.ts          # 模型候选输出，不直接等于数据库实体
│  │  ├─ session.ts             # 匿名会话创建与归属校验
│  │  ├─ env.ts                 # 环境变量校验
│  │  └─ db.ts                  # Prisma 客户端
│  └─ styles/globals.css        # 设计变量、全局样式
├─ tests/
│  ├─ unit/                     # 纯业务规则
│  ├─ integration/              # 事务、接口、隔离验证
│  └─ fixtures/                 # 测试案例和显式演示内容
├─ .env.example
├─ package.json
└─ README.md
```

## 3. 依赖方向

浏览器组件 → features 请求封装 → API → services → repositories / AI。

domain 是纯 TypeScript，可供浏览器与服务端共用；不得引用 React、Next.js 服务端 API、Prisma 或模型 SDK。共享类型从 Zod 推导，避免维护两份不一致的接口。

app/api 仅做请求解析、会话/来源校验、调用服务和映射 HTTP 响应。数据库查询不进入页面组件，提示词不进入浏览器。server 模块添加 server-only 边界。客户端代码不得导入 server。

services 编排业务，不建立每个类对应一个接口和实现类的体系。repositories 只封装实际需要的读写，不做通用 ORM。所有修改入口遵守相同版本规则，包括前端手动编辑和 AI 生成写入。

## 4. 页面与交互

- 列表页：创建入口、历史决策、最近更新时间、下一步行动状态；空状态不使用虚构历史数据。
- 创建页：困境描述 → 最多少量追问 → 可编辑概况 → 用户确认。草稿也保存，离开后可以继续。
- 工作台：条件概况、并列路径、当前路径的有限情境；移动端按区块切换，避免横向挤压。
- 总结页：倾向（允许暂不选择）、收益与代价、待确认信息、1～3 个行动，选择一个后记录结果。

概况自动保存采用 1200ms 防抖、单写入队列；显示保存状态。未保存概况时禁用路径生成与总结跳转。失败保留编辑草稿，并使用当前标签页的 sessionStorage 做恢复备份，成功后清除，不使用长期 localStorage。总结和路径显式保存。未保存或生成中离开时提供提醒。

视觉基调为纸白与深绿色，强调阅读、比较与行动。生成时展示实际任务进度而非模型隐式思维链。每页包含空、加载、失败和成功状态，支持键盘、明确标签和窄屏布局。

## 5. 会话、部署与限制

初版采用服务端生成的高熵匿名会话令牌，HttpOnly、SameSite=Lax、生产 HTTPS 下 Secure Cookie，数据库仅存令牌摘要。所有业务查询按会话归属过滤；知道决策 ID 不代表能访问。写入同时检查 Origin。会话有效期暂定 90 天，访问时续期；清除 Cookie 或到期后无法恢复旧数据，界面需说明。不把它宣传为完整登录系统。

PostgreSQL 是唯一业务持久化。没有数据库就给出配置错误，不回退文件存储。当前没有产品演示生成模式；真实服务失败会明确报错并保留旧内容，测试夹具只用于隔离测试进程。

本地优先验证，不自动发布私人数据到外部托管平台。会话模型额度、单决策生成锁和请求幂等通过 PostgreSQL 事务维护；已限制输入和请求体大小。公开部署仍需入口 IP 限流与运维配置。模型调用发生在数据库事务之外，返回后短事务校验版本并应用结果。
