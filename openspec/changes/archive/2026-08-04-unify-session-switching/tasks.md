## 1. Session 预加载基础

- [x] 1.1 定义 PreparedSessionLoad、SwitchSessionRequest 和 SwitchSessionResult 类型
- [x] 1.2 实现 SessionManager.prepareLoad，在不修改 current 的情况下完成校验、图片恢复和 legacy agentMessages 迁移
- [x] 1.3 实现 SessionManager.commitPreparedLoad，同步替换 Main messages、metadata 和 agentMessages 后发布 session:loaded
- [x] 1.4 将现有 loadSession 改为 prepare/commit 兼容包装，并保持版本 1/2/3 加载行为

## 2. Main Agent Process 重绑定

- [x] 2.1 使 AgentSupervisor.updateParentSession 在 Process Store 持久化失败时恢复旧 parentSessionId 和 AgentContext
- [x] 2.2 删除 session:loaded 关键路径上的 fire-and-forget Main Process 重绑定
- [x] 2.3 保证 Main Process 重绑定不遍历或修改已有 SubAgent 和 notification 路由

## 3. Harness Session 切换事务

- [x] 3.1 在 HarnessAPI 和 Harness 中增加统一 switchSession 接口
- [x] 3.2 增加目标 Session 完整 ID或唯一前缀解析，并在 abort 前完成 prepare
- [x] 3.3 跟踪当前 Main turn Promise，实现 abort 后无固定 sleep 的 quiescence 等待
- [x] 3.4 按 prepare、abort、save、Main rebind、commit 顺序实现切换事务
- [x] 3.5 增加 Session 切换互斥门，阻止并发切换和切换期间的新 prompt
- [x] 3.6 处理 PendingPermission 保存，并确保核心逻辑不依赖 Web 私有状态

## 4. TUI 与 Web 入口收敛

- [x] 4.1 将 executeSlashCommand 改为 Promise 返回值，并更新 TUI 和 Web 调用方为 await
- [x] 4.2 将 `/session load` command 改为调用 Harness.switchSession，移除直接 SessionManager.loadSession
- [x] 4.3 将 Web typed session load 改为调用同一 switchSession，保留权限提示清理
- [x] 4.4 统一成功后的 conversation 重建、Session 列表刷新、loader 和 ready 发送时机

## 5. 路由与失败测试

- [x] 5.1 为 prepareLoad/commitPreparedLoad 增加无副作用、版本迁移和 agentMessages 隔离测试
- [x] 5.2 为 Main Process 重绑定成功和 Process Store 失败回滚增加测试
- [x] 5.3 增加 Session A 启动 background Agent、切换 B、Agent 结果仍写回 A 的验收测试
- [x] 5.4 验证 load 不新增 Agent Process，且后续独立任务创建的新 Agent 继承 B
- [x] 5.5 增加目标不存在、前缀冲突、并发切换和切换期间 prompt 拒绝测试
- [x] 5.6 增加 TUI slash、Web slash 和 Web 侧边栏行为一致性测试

## 6. 文档与验证

- [x] 6.1 根据最终实现更新 docs/SESSION_SWITCHING.md 和相关 Session/SubAgent 架构文档
- [x] 6.2 运行 Session、UI 和 SubAgent 专项测试
- [x] 6.3 运行 npm run typecheck、npm run build 和 OpenSpec strict 校验
