# 接口与 AI 工作流

状态：核心接口已实现；标注“预留”的根记录修改/删除接口尚未开放。全部接口位于 `/api`，仅接受当前会话可访问的资源。

## 1. HTTP 契约

| 方法与路径 | 用途 |
| --- | --- |
| GET /decisions | 当前会话最近 50 份决策，分页预留 |
| POST /decisions | 保存困境草稿，返回 id 与 revision |
| GET /decisions/:id | 决策工作台快照 |
| PATCH /decisions/:id | 预留；标题目前通过 overview 保存，原始描述保持 |
| DELETE /decisions/:id | 预留；当前仅支持路径软删除 |
| PUT /decisions/:id/overview | 保存概况与条件；可设置 confirm=true |
| POST /decisions/:id/paths | 新增用户路径 |
| PATCH /decisions/:id/paths/:pathId | 修改路径 |
| DELETE /decisions/:id/paths/:pathId | 软删除路径 |
| POST /decisions/:id/scenarios/:scenarioId/feedback | 追加反馈、假设纠正或后续问题 |
| PATCH /decisions/:id/feedback/:feedbackId | 用户重确认反馈 |
| PATCH /decisions/:id/summary | 编辑总结，倾向允许为空 |
| POST /decisions/:id/actions/:actionId/select | 选为当前行动 |
| POST /decisions/:id/actions/:actionId/results | 记录行动结果 |
| POST /decisions/:id/generations | 发起指定生成任务 |
| GET /decisions/:id/generations/:runId | 刷新后查询任务状态 |
| POST /decisions/:id/clarify | 概况整理，共用任务锁与额度，返回候选等待确认 |
| GET /status | 配置是否就绪，不返回密钥 |

写入携带 expectedRevision；首次创建除外。生成另带 requestKey、kind 和 scopeId（需要时）。客户端不得指定 provider、任意提示词、会话所有者或数据库字段。根据任务类型使用 Zod 可区分联合结构，拒绝不相关参数。

普通响应为 `{data: DecisionView}`，revision 包含在 data 中；错误为 `{error: 中文信息}`，客户端按 HTTP 状态区分。400 输入非法、401 会话无效、404 资源不存在或非本人、409 版本冲突/重复活动任务、429 额度限制、502 模型上游失败、503 配置或数据库不可用、504 生成超时。错误消息不透传密钥、SQL 或上游完整响应。结构化错误代码和 requestId 留待后续统一。

## 2. 生成任务

| kind | 输入重点 | 输出与确认 |
| --- | --- | --- |
| clarify | 困境、已有条件、先前问答 | 核心问题、至多 3 个关键追问、候选概况；不自动确认 |
| paths | 已确认概况、全部硬约束 | 2～3 条实质不同路径，至少考虑一个分阶段方案 |
| scenarios | 当前路径、条件、相关反馈 | 最多 3 张情境，含事件、变化、困难、依据和假设 |
| branch | 当前情境、后续问题、有效反馈 | 一个后续情境，校验分支数量和深度 |
| refresh | 变化条件、失效范围、旧内容、反馈 | 同 ID 的候选更新、变化原因、重新确认标记 |
| summary | 有效路径/情境、用户反馈、历史行动结果 | 可为空的倾向、取舍、未知信息、1～3 个行动候选 |

追问允许用户选择“暂不清楚”。未确认信息作为未知或假设，不无限追问。摘要生成不能把用户查看某条路径等同于偏好，也不能要求必须选定最终方向。

## 3. 调用与输出校验

AI SDK 的 DeepSeek provider 封装在服务端，使用 generateText + Output.object，避免已标记弃用的 generateObject。DeepSeek JSON 模式配合 schema 提示和本地 Zod 校验，已完成真实调用验证。模型通过 DEEPSEEK_MODEL 配置；模型名称不假定长期不变。

每个任务拥有独立提示词、Zod 输出结构和 promptVersion。系统提示明确中文输出、职业/城市场景、情境不是预测、不虚构成功率、区分事实和假设。用户文本作为数据传入，不允许其改变服务端权限或要求读取其他人的决策。

校验分三层：

1. 结构：必填字段、长度、数量、枚举。
2. 引用与规则：ID 属于当前决策、分支边界、依赖存在、版本未过期、行动包含验证目的。
3. 内容质量：路径重复、假设伪装成事实、无依据确定性结论。启发式检查加案例评测，不宣称可完全自动识别所有错误。

仅对可修复格式问题做至多一次纠正重试，总模型尝试不超过两次。上游超时/限流明确报错，认证失败不重试。模型调用总期限 85 秒，两次尝试共用期限，数据库提交单独使用短事务。始终保留用户原数据。

## 4. 进度与流式交互

当前生成 POST 返回完整 JSON 和已提交的权威快照，界面显示实际任务等待状态。SSE 的 started/progress/completed 等事件是后续扩展设计，目前没有实现，不伪造逐字流。

初期先实现完整 JSON 结果与明确等待状态，之后再加入真实阶段流。若模型输出采用完整结构解析，UI 显示实际执行阶段，不用定时器伪造 token 流。任何半成品 JSON 都不能作为正式业务内容落库。

刷新/断连后通过 runId 查询状态，不能盲目自动重发 POST。没有后台执行保障，过期运行记录必须能失效并允许用户显式重试。

## 5. 演示与评测

当前应用只支持真实模型接入；缺密钥拒绝生成，但允许手动整理和浏览已有决策。没有隐式 demo 回退。集成测试在另一个端口使用独立模型夹具，仅注入测试进程环境，不修改真实 .env，也不提供产品演示模式。

评测案例包括信息不足、预算变化、家庭硬约束、没有偏好、互相矛盾条件、删除路径、分支上限、生成中编辑、行动结果否定先前假设。真实质量以实际输出人工检查为准，单元测试只保证可计算规则。
