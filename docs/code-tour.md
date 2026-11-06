# 代码导读、面试准备与简历草稿

## 建议的阅读顺序

1. **数据怎么进入：** `src/content.js` 连接扩展入口；`src/canvas-api.js` 获取已验证账号、分页日历与作业，处理权限、缓存和范围。`src/model.js` 把原始记录合并为稳定的 `assignment:<id>` / `event:<id>`，保留真实时间、完成来源与数据警告。
2. **输入怎么表达：** `src/planning-settings.js` 验证工作窗口、容量、估时和拆分规则。`src/dates.js` 区分当地日期与绝对时刻，处理夏令时重复/不存在的时刻。
3. **计划怎么保存：** `src/plans.js` 创建带任务快照的计划。`src/storage.js` 按账号隔离偏好和本地修改；`src/plan-service.js` 在后台串行执行带 revision 检查的保存，拒绝覆盖其他页面的新版本。
4. **安排怎么产生：** `src/availability.js` 从工作窗口扣除固定活动和锁定工作；`src/scheduler.js` 有限回溯、按条件拆分、局部均衡；`src/plan-validation.js` 单独检查候选计划，给出冲突和未安排分钟数。先读 [排程方法](scheduling.md)，再读具体循环。
5. **用户怎么操作：** `src/view.js` 管理加载、账号、标签与共享状态；`src/tasks-view.js` 管理任务操作；`src/planner-view.js` 管理草稿、生成预览、失效检查和保存；`src/planner-week-view.js` 显示时间表。手动 Arrange 是拖放的键盘替代入口。
6. **怎么独立演示与验证：** `demo/data.js` 提供固定模拟数据；`demo/storage.js` 只写演示命名空间；`demo/demo.js` 把真实模块接起来。`test/reliability.test.js` 是边界回归测试入口，`e2e/demo.spec.js` 验证浏览器流程，`e2e/extension.spec.js` 用模拟 Canvas 验证实际扩展包与后台。

## 应当能回答的面试问题

**为什么不直接按截止时间排序？**

排序不等于排程。还要检查任务开放时间、连续工作要求、固定活动、每日容量和休息间隔。一个总时长足够的周，也可能没有能容纳两小时连续任务的窗口。

**你能保证排程全局最优吗？**

不能。连续候选只取窗口边界，搜索有状态和时间预算，带休息的拆分是贪心，均衡也是局部移动。只有零休息、连续任务已固定后的受限分配子问题使用最大流。完整结果说明约束检查通过，不说明全局最优。

**时区和夏令时为什么容易出错？**

当地日期不是 UTC 日期；同一个 01:30 在夏令时结束日可能对应两次，开始日的 02:30 可能不存在。存储必须带偏移，窗口用账号 IANA 时区解释，工作量用真实经过的分钟数计算。测试覆盖跳时、重复时刻、跨日和浏览器/账号时区不同。

**重复导入和冲突数据怎么区分？**

按稳定任务 ID 合并，避免重复累计工作量。相同绝对时刻的不同 ISO 写法等价；真正不同的日期或一份有效、一份无效的重复记录会标记数据冲突，刷新核实后再自动安排。

**如何防止一个旧页面覆盖另一个页面的计划？**

计划保存带 expectedRevision，在后台按计划键排队。版本不同就拒绝，保留草稿并提供重载/另存。任务字段修改和撤销有独立的写入标识。演示的整个存储 blob 额外用同一个场景级 Web Lock 串行修改，防止不同字段互相覆盖。

**作业截止或估时变了，为什么不自动覆盖计划？**

计划是可编辑的快照。比较当前事实与保存快照，显式提示更新；指纹变化会使生成预览失效。更新后重新排程未完成、未锁定的工作，避免后台变化悄悄改写用户安排。

**如何证明“能用”？这些测试有什么没证明？**

单元/DOM 测试检查约束和失败恢复；浏览器测试走完整交互并刷新恢复；安装后的 MV3 包通过内容脚本与真实后台通信，但 Canvas 响应是模拟的。性能用固定数据逐次核对正确性。它们都没有证明真实账号接口、系统通知、用户学习效果或大规模生产稳定性。

**为什么保留原生 DOM 和本地架构？下一步先做什么？**

现有模块已经支持核心流程，重写会增加迁移风险。纯排程模块便于固定数据测试，数据适配器让演示与真实集成共享逻辑。最有价值的下一步是在授权的测试账号上验证实际 Canvas 页面、权限和日期更新，而不是继续扩展功能。

## English resume bullet drafts

These describe verified project capabilities. They do not assert sole authorship or personal ownership. Use only the work you can explain and substantiate; add an action verb such as “Built” only when it accurately describes your actual contribution.

- **Canvas study planner:** Manifest V3 Chrome extension combining Canvas assignment deadlines, effort estimates, and available study windows into editable schedules with conflict reporting, local completion, and revision-checked persistence.
- **Constraint-aware scheduling:** Bounded backtracking, conditional maximum-flow allocation, and local load balancing with explicit unassigned-minute reporting, time-zone/DST handling, and validation before plan acceptance.
- **Reliability and demonstration:** Automated domain and browser coverage for duplicate imports, insufficient capacity, deadline changes, save recovery, and rescheduling; account-free demo using the production core with isolated fictional data.

Optional measured detail, only with the benchmark context attached: “Validated synthetic 28-day schedules containing up to 200 tasks, checking deadlines, capacity, effort totals, and break intervals on every measured run.” Do not convert this into a speedup, adoption, learning-outcome, or production-scale claim. Exact counts and observed local timings are in [the verification record](verification-2026-11-05.md) and [benchmark data](benchmark-2026-11-05.json).
