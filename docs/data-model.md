# 数据模型与一致性规则

本文件是实施契约，Prisma schema 在第二阶段按最小闭环逐步实现，不一次性建立所有表。

## 1. 实体

| 实体 | 主要字段 | 责任 |
| --- | --- | --- |
| VisitorSession | id、tokenHash、expiresAt | 浏览器会话隔离 |
| Decision | id、sessionId、title、description、stage、revision、confirmedAt、createdAt、updatedAt | 决策根记录与乐观锁 |
| Condition | id、decisionId、kind、label、value、source、confirmed、revision、deletedAt | 事实、偏好、约束、目标、已有选项 |
| Path | id、decisionId、title、benefits、costs、prerequisites、revision、basedOnRevision、freshness、deletedAt | 用户可编辑的选择路径 |
| Scenario | id、pathId、parentId、event、changes、difficulties、assumptions、revision、basedOnRevision、freshness | 有限分支情境；依据通过依赖记录表达 |
| Dependency | id、decisionId、targetType、targetId、conditionId、conditionRevision | 路径/情境使用了哪些已知条件 |
| Feedback | id、scenarioId、scenarioRevision、text、kind、needsReview、createdAt | 感受、假设纠正、后续问题，保留原始上下文 |
| Summary | id、decisionId、inclinationPathId（可空）、reason、valuedBenefits、unacceptableCosts、unknowns、basedOnRevision、freshness | 当前可编辑总结 |
| Action | id、decisionId、summaryId、task、verification、decisionHelp、status、selectedAt | 1～3 个行动候选与选定行动 |
| ActionResult | id、actionId、text、createdAt | 追加式行动结果，不被重新生成覆盖 |
| GenerationRun | id、decisionId、requestKey、kind、scopeId、baseRevision、status、provider、model、promptVersion、inputSnapshot、candidateOutput、errorCode、startedAt、finishedAt | 幂等、生成审计、失败恢复 |
| DecisionChange | id、decisionId、revision、kind、entityId、before、after、reason、createdAt | 保留变更前后内容和原因 |

稳定实体及关联采用关系表；收益列表、假设列表、快照和结构化生成候选可以使用 JSON。禁止只用一个无约束 JSON 字段承载全部业务。Prisma 模型与客户端 DTO 分开，客户端响应不包含会话摘要、内部提示词或密钥。

Dependency 的多态 targetId 不能直接通过普通外键关联两张表，repository 必须验证目标存在且属于同一决策，并随目标软删除停止使用；conditionId 使用真实外键。实现时可拆成 PathDependency 与 ScenarioDependency 两张表以获得更强外键约束，默认优先使用拆表实现。

## 2. 事实、假设与确认

模型提取的条件首先是未确认候选。用户编辑并确认概况后，才能用于正式推演。没有提供的积蓄、薪资、家庭情况不能自动补成事实。

情境假设保存独立 ID、文字和确认状态。纠正假设先记录 Feedback，再由用户确认是否形成或修改 Condition。模型建议不能自动覆盖用户事实。

路径首次生成 2～3 条，用户可增删改，MVP 总量上限暂定 5 条。每条路径初始情境最多 3 张，单路径总计最多 6 张，分支深度最多 2 层（根为 0，最大 depth=2）。父节点必须同属当前路径，服务端强制执行，不仅禁用前端按钮。

## 3. 状态

Decision.stage：draft → exploring → action_selected → revisiting。阶段描述进展，不限制返回编辑；“已作决定”不是强制终点。

- 确认概况后进入 exploring。
- 明确选中一个行动后进入 action_selected。
- 添加行动结果后进入 revisiting，允许再探索或选择新行动。

Path/Scenario/Summary.freshness：fresh、stale。反馈用独立 needsReview 表示需要重确认。正在生成属于 GenerationRun，不覆盖内容的新鲜度。

GenerationRun.status：queued、running、succeeded、failed、superseded。无后台队列，queued 仅表示请求已登记。执行在当前服务端请求内完成；浏览器断连后不承诺继续执行。下一次访问将超时且无有效执行的任务标为 failed，允许人工重试。

## 4. 乐观锁与原子更新

每次业务写入携带 expectedRevision。数据库事务按 id + sessionId + revision 条件更新 Decision 并递增 revision；未命中返回 409。子实体写入、失效标记和变更记录在同一事务中完成。自动保存串行执行，成功后使用最新 revision；多标签页冲突要求重新加载/人工合并，不能静默覆盖。

AI 调用前保存不可变输入快照与 baseRevision，调用发生在事务外，避免长时间占锁。生成完成后开启短事务，仅当当前 revision 与 baseRevision 相同才提交；否则将 run 标记 superseded，不应用候选。MVP 使用保守的整决策版本检查，即使只改了无关内容也可能需要重试，以正确性优先。

同一 requestKey 在同一决策下唯一，网络重试返回已有任务，不重复生成。同一决策只允许一个活动生成任务；使用数据库事务竞争获取，不能只靠浏览器按钮禁用。不同决策可以独立执行。

## 5. 局部更新

1. 修改条件并保存新版本，比较稳定 conditionId 的值，而不是模糊匹配描述。
2. 沿依赖找到路径和情境；路径变化向其情境传播，情境变化向子情境传播；总结标为 stale。
3. 新增条件或语义范围不确定时，保守地标记所有路径/情境待复核，不能漏掉新的硬约束。
4. 界面先显示受影响项及原因；更新时只传入必要上下文，但始终包含全部硬约束。
5. 结构校验与引用校验通过后更新原实体 ID，递增其 revision，追加变更记录。不通过则保留旧内容并显示 stale。
6. 原反馈不删除；所有绑定已更新情境的反馈保守标为 needsReview。用户确认后清除标记，不声称模型已准确识别所有语义冲突。

模型给出的 dependency 只作为候选：验证引用合法，将所有硬约束纳入依赖；缺少依赖或无法确认相关性时退回保守失效范围。用户编辑路径同样导致其情境和总结失效。删除路径采用软删除，其情境退出当前展示；历史反馈与行动结果仍保留。若总结引用该路径则清空倾向引用并提示重确认。

## 6. 行动历史与隐私

每个决策最多一个当前选定行动，由事务维护。重新生成总结不删除已选、已完成行动及其结果；未选候选可标记 superseded 后生成新候选。行动完成必须由用户记录结果，不由模型自行判定。

删除整个决策需要用户明确确认，数据库级联清理所属内容和生成快照。日志不打印用户全文、模型输入快照和密钥；生成快照与业务数据同等私密，仅供本人会话使用。初版不提供管理员查看个人内容的页面。
