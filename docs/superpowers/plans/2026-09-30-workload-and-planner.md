# Workload and Multi-plan Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Canvas 扩展中实现日期压力、可解释估时、工作量曲线、可保存和比较的手动计划，以及遵守时间约束的自动均衡排程。

**Architecture:** 复用现有只读 Canvas 加载、账号隔离和 Shadow DOM 入口。新增纯数据模块处理估时、统计、计划和时间约束，视图按标签拆分；计划写入与排程运行放入现有后台 Service Worker。界面只提交草稿操作和内部消息，不把规则或计划写回 Canvas。

**Tech Stack:** JavaScript ES modules、Chrome Manifest V3、chrome.storage.local、原生 DOM/SVG、Intl、node:test、jsdom、esbuild；沿用 Node.js 18+ 和 Chrome 114 构建目标，无新增运行时依赖。

**Spec:** `docs/superpowers/specs/2026-09-30-workload-and-planner-design.md`

**Execution:** 用户已选择直接由当前代理实现；使用 executing-plans，不重新询问执行方式。

## Global Constraints

- 权限保持 storage 与 canvas.illinois.edu，不新增第三方网络请求。
- 新增功能均在扩展容器内，不修改原生日历内容，不向 Canvas 写入。
- 初始全局默认 60 分钟；估时范围为 1–1440 的整数。
- 默认 0–2 项为绿色、3–5 项为黄色、6 项及以上为红色；要求 `1 <= yellowFrom < redFrom`。
- 默认新计划从今天开始，覆盖 28 个日历日；范围可修改，最多 180 天。
- 每周各日默认 09:00–21:00、最多 240 分钟，无自动指定休息日。
- 默认作业允许拆分；必须一次完成要求连续区间；固定活动不能移动。
- 当前截止/开放时间、Canvas 用户时区、休息日容量和锁定安排是硬约束；提前一天完成是软偏好。
- 多计划比较为 2–4 个；保存时安排与当前剩余两种模式明确区分。
- 默认 24 小时内红色、24–72 小时黄色；计划结束距截止不足 24 小时标记 Tight deadline。
- 旧开始日、完成状态、日历选择不丢失；存档不会因规则修改而静默变更。

## Review Focus

- 未选择或暂不可访问的日历中仍有存档任务：显示快照与无法核验，不能删除或报告完整成功。测试归 Task 5、10。
- 两个 Canvas 页面同时保存同一计划：拒绝旧修订，不静默覆盖；另一账号的存档不能出现。测试归 Task 3。
- 生成过程中切换账号、关闭或更改估时：旧结果不能应用，未保存草稿有明确退出路径。测试归 Task 9、10。
- 夏令时不存在/重复的当地时间，以及带秒的午间截止：转换不得绕过开放/截止，时间表有确定解释。测试归 Task 6、8。
- 活动重叠、跨度很长且估时很小：占用按真实时间并集处理，不能凭估时释放日程。测试归 Task 6。

## File Map and Contracts

保留 `src/view.js` 作为加载/标签协调层；新增视图不堆入原文件。`src/styles.js` 增加布局和状态样式；所有新视图只接收 document、数据和回调。

| 文件 | 职责 |
| --- | --- |
| `src/planning-settings.js`, `src/estimates.js` | 配置验证、默认值、估时与来源 |
| `src/model.js`, `src/dates.js`, `src/workload.js` | 原始身份/时间事实、日期、压力统计 |
| `src/storage.js`, `src/plan-service.js`, `src/plan-client.js` | 账号配置、串行存档写入、内部消息客户端 |
| `src/plans.js`, `src/availability.js`, `src/plan-validation.js` | 计划草稿、统计、可用区间、独立校验 |
| `src/chart-view.js`, `src/workload-view.js`, `src/settings-view.js` | 图表、工作量、设置界面 |
| `src/planner-view.js`, `src/plan-editor-view.js`, `src/plan-compare-view.js` | 双栏工作台、安排编辑与比较 |
| `src/scheduler.js`, `src/scheduler-service.js`, `src/scheduler-client.js` | 排程核心、后台任务与取消 |
| `test/helpers/planning.js` | 无 DOM 的确定性样例，所有数据测试复用 |

以下类型用 JSDoc 描述，时间戳均为含时区的 ISO 字符串，日期为 `YYYY-MM-DD`，分钟为整数：

- `Rule = {id,name,enabled,type:'titleContains'|'contextIs',value,minutes}`。
- `DayCapacity = {start:'HH:mm',end:'HH:mm',maxMinutes}`；只支持单个不跨午夜窗口，休息日 maxMinutes 为 0。
- `Schedule = {weekdays:DayCapacity[7],exceptions:Record<day,DayCapacity>,horizonDays}`，星期索引沿用 Sun=0。
- `Settings = {schemaVersion:1,defaultMinutes,yellowFrom,redFrom,rules:Rule[],schedule:Schedule}`。
- `PlanningState = {settings,estimates:Record<itemKey,minutes>,singleSessions:Record<itemKey,true>,plans:Record<id,Plan>,warnings:string[]}`。
- 在现有 Item 上新增 `contextCodes:string[]`、`unlockAt:string|null`、`dueAt:string|null`、`manualStartDay:string|null`、`fixedStartAt:string|null`、`fixedEndAt:string|null`，展示 startDay/endDay 不变。
- `TaskSnapshot = {key,type,title,contexts,contextCodes,url,estimateMinutes,singleSession,unlockAt,dueAt,manualStartDay,fixedStartAt,fixedEndAt,completedAtSave}`。
- `Segment = {id,itemKey,startAt,endAt,locked:boolean,order:number}`；工作分钟从起止时间计算，内部以一分钟单位，最早开始向上取整，最晚截止向下取整，绝不放宽原始限制。
- `Plan = {schemaVersion:1,id,name,revision,createdAt,updatedAt,timeZone,range:{startDate,endDate},schedule,tasks:Record<key,TaskSnapshot>,segments:Segment[],basisFingerprint}`。
- `DayPoint = {day,tasks,minutes,itemKeys:string[]}`；比较范围外的值用 null 表示，不用 0。
- `ChartPoint = DayPoint | {day,tasks:null,minutes:null,itemKeys:[]}`；`Facts = {items,completed,now,loadedRange,state:PlanningState}`，数据变更比较及 fingerprint 包含当前有效估时。
- `Issue = {code,itemKey?:string,segmentId?:string,day?:string,message,missingMinutes?:number}`。
- `Validation = {valid:boolean,complete:boolean,issues:Issue[],unassigned:Record<key,minutes>}`，valid 表示安排无硬冲突，complete 还要求参与任务全部安排且可核验。
- `PlanOperation` 使用 type 区分：rename/name、configure/range+schedule、addTask/task、removeTask/itemKey、addSegment/segment、updateSegment/id+patch、removeSegment/id、reorder/orderedIds、lock/id+locked、updateTasks/tasks。updateTasks 仅替换任务快照，configure 不静默移动现有分段；所有操作保留当前存档修订，保存后由后台递增。

## Task 1: 配置和可解释估时

**Files:** Create `src/planning-settings.js`, `src/estimates.js`, `test/estimates.test.js`, `test/helpers/planning.js`。

**Interfaces:** `defaultSettings()->Settings`；`validateSettings(input)->{value:Settings|null,errors:string[]}`；`resolveEstimate(item,state:PlanningState)->{minutes,source:'manual'|'rule'|'default',ruleId?:string,label:string}`。样例导出 `task(overrides={})`、`settings(overrides={})`、`plan(overrides={})`，默认使用 Chicago、2026-10-01、09:00–21:00、60 分钟任务。

- [x] **Step 1: 写失败测试。** `manual beats ordered rules` 用 HPDL 标题及 course_456；手动 90 优先，清除后标题规则 30 优先课程规则 60；禁用或移动第一规则改变来源。`invalid rules cannot save` 断言空关键词、0、1.5、1441、重复规则 ID 和 yellowFrom>=redFrom 均产生 errors。`defaults are independent objects` 修改一个默认配置不污染另一个。

```js
assert.equal(defaultSettings().defaultMinutes, 60);
assert.deepEqual(defaultSettings().schedule.weekdays[0], {start:'09:00',end:'21:00',maxMinutes:240});
assert.equal(resolveEstimate(task({title:'HPDL #1'}), stateWithManual90).minutes, 90);
assert.equal(resolveEstimate(task({title:'hpdl #1'}), stateWithRulesOnly).minutes, 30);
```

- [x] **Step 2: 运行红灯。** `node --test test/estimates.test.js`；预期缺少模块/导出或明确断言失败。
- [x] **Step 3: 实现上述接口。** titleContains 使用 trim 后的大小写无关包含匹配；contextIs 匹配 contextCodes；保存时严格验证，读取损坏配置由 Task 3 回退并提示。
- [x] **Step 4: 运行绿灯。** `node --test test/estimates.test.js`；零失败。
- [x] **Step 5: 仅提交本任务文件。** 提交名 `Add planning settings and estimate rules`。

## Task 2: 原始时间事实与截止压力统计

**Files:** Modify `src/model.js`, `src/dates.js`, `test/model.test.js`, `test/dates.test.js`；Create `src/workload.js`, `test/workload.test.js`。

**Interfaces:** 扩展现有 `normalizeItems(snapshot,userState)`；新增 `addDays(day,offset)->day`、`daysBetween(startDate,endDate)->day[]`；`pressureLevel(count,settings)->'green'|'yellow'|'red'`；`workloadSeries(items,state,range)->DayPoint[]`；`workloadSummary(items,state,{now,timeZone,range})->{today:DayPoint,overdue:Item[],series:DayPoint[],totalTasks,totalMinutes,peakDay}`。

- [x] **Step 1: 写失败测试。** `display fallback is not unlock` 验证无开放日期作业 unlockAt 为 null，即使 startDay=dueDay；手动开始不覆盖 unlockAt。`one deadline count across long span` 用跨 10 天任务及重复来源，截止日只计一次。`completion removes pressure but not item`、`count thresholds 2/3/5/6`、`past month does not redefine now`、`fixed event counts on start day`，并断言零值日期连续、总分钟正确、Chicago 午夜和跨年日期正确。
- [x] **Step 2: 运行红灯。** `node --test test/model.test.js test/dates.test.js test/workload.test.js`。
- [x] **Step 3: 实现接口。** 保留原去重/Canvas 完成规则，合并 contextCodes；invalid 时间仍保留现有诊断，不进入约束成功结果。按 Item.key 去重统计，不按色条数量计数。
- [x] **Step 4: 运行绿灯。** 同一命令，随后 `npm test`；现有日期、完成来源和跨周测试全部通过。
- [x] **Step 5: 提交。** `Add workload statistics and scheduling facts`。

## Task 3: 本地设置、估时和有修订的计划存档

**Files:** Modify `src/storage.js`, `src/background.js`, `test/storage.test.js`；Create `src/plan-service.js`, `src/plan-client.js`, `test/plan-service.test.js`。

**Interfaces:** 现有 store.load() 和旧键保持行为；增加 `loadPlanningState()->PlanningState`、`setSettings(settings)`、`setEstimate(itemKey,minutes|null)`、`setSingleSession(itemKey,boolean)`。`createPlanService({storageArea,now})->{handle(message,sender)}` 串行处理 PLAN_SAVE/PLAN_DELETE；`createPlanClient({sendMessage,userId})->{save(plan,expectedRevision),remove(id,expectedRevision)}`。结果为 `{ok:true,plan?:Plan}` 或 `{ok:false,code:'CONFLICT'|'INVALID'|'STORAGE',message}`，新计划 expectedRevision=0。

- [x] **Step 1: 写失败测试。** 旧键与新配置重开保留且账号隔离；null 估时删除；损坏 settings 回退并返回 warning；未知 schemaVersion/损坏计划从有效列表排除但原键保留。`concurrent same revision saves` 同一计划两个 expectedRevision=1 请求恰好一个成功，另一个 CONFLICT；不同计划互不阻塞，删除使用修订检查；非 Canvas calendar sender 和非法 ID 不允许操作。
- [x] **Step 2: 运行红灯。** `node --test test/storage.test.js test/plan-service.test.js`。
- [x] **Step 3: 实现接口。** 使用 `settings:v1`、`estimate:<key>`、`single-session:<key>`、`plan:<id>`；背景队列按 hostname/userId/planId 串行读验写。客户端只传可序列化数据，背景从受信 sender URL 确定域名。复用已有 action handler，不扩权限。
- [x] **Step 4: 运行绿灯。** 上述测试与 `npm run build`；manifest 权限断言不变。
- [x] **Step 5: 提交。** `Persist estimates settings and revisioned plan archives`。

## Task 4: Calendar 压力徽标、Workload 与设置界面

**Files:** Modify `src/view.js`, `src/styles.js`, `test/view.test.js`；Create `src/chart-view.js`, `src/workload-view.js`, `src/settings-view.js`, `test/workload-view.test.js`, `test/settings-view.test.js`。

**Interfaces:** `renderLineChart({document,series:[{id,name,color,points:ChartPoint[]}],metric:'tasks'|'minutes',onSelectDay})->HTMLElement`，包括 SVG、图例和数据表；`renderWorkloadView({document,items,state,range,now,timeZone,onOpenItem,onComplete})->HTMLElement`；`renderPlanningSettings({document,state,contexts,onSave})->HTMLElement`。mountPlanner 增加可注入的 planningStore，使旧测试样例更新到明确的新契约。

- [x] **Step 1: 写失败测试。** `date badge selects deadline list`；`switch metric changes axis and table`；`complete updates badge and curve`；`settings changes do not fetch Canvas`；`ordered rule editor preview`。图表全零不产生 NaN，单日点、null 范围断线、长标题和 HTML 字符按文本显示；规则操作和日历选择分别保存，不互相覆盖。设置面板可编辑压力阈值、默认分钟数、每周工作窗口/容量和日期例外；原 .day 的日期 aria-label 保留。
- [x] **Step 2: 运行红灯。** `node --test test/view.test.js test/workload-view.test.js test/settings-view.test.js`。
- [x] **Step 3: 实现 UI。** 四标签中先接通 Calendar/Workload/Settings；Planner 在 Task 7 接入，不发布占位功能。Today 独立显示逾期；估时与来源加入现有详情；SVG 用 createElementNS，折线点/表格日期有按钮和可访问文字。抽出设置面板，保留原日历筛选操作。局部状态与焦点恢复使用稳定 data-control-id，不用标题作为 DOM ID。
- [x] **Step 4: 运行绿灯。** 以上命令、`npm test`、`npm run build`；额外断言修改颜色/估时后 loadSnapshot 调用数不增加。
- [x] **Step 5: 提交。** `Show calendar pressure and editable workload estimates`。

## Task 5: 计划快照、草稿操作、曲线和紧急程度

**Files:** Create `src/plans.js`, `test/plans.test.js`。

**Interfaces:** `createPlan({id,name,items,state,startDate,endDate,timeZone,now})->Plan`；`copyPlan(plan,{id,name,now})->Plan`；`updatePlan(plan,operation:PlanOperation)->Plan`；`resolvePlanTasks(plan,{items,completed,state?})->{tasks,changes,unknownKeys}`（state 提供时比较当前有效估时）；`planSeries(plan,{items,completed,mode:'saved'|'remaining'})->DayPoint[]`；`comparePlans(plans,facts,{metric,mode})->{series,summaries}`；`taskUrgency(task,{now,lastEndAt,completed})->{level:'none'|'yellow'|'red',label,reason:null|'due'|'overdue'|'tight'|'conflict'}`；`planFingerprint(plan,facts:Facts)->string`。

- [x] **Step 1: 写失败测试。** 复制和 immutable 操作不改变原计划；新规则只改当前估时，不改存档；显式 updateTasks 后反映变化。未知任务保留标题并列入 unknownKeys。共享 complete 使两份计划 remaining 为零，saved 保留原安排。跨日固定活动估时按真实分钟比例分摊且总量守恒；多计划范围外为 null；分段数量按当天唯一 itemKey 计数。

```js
assert.equal(taskUrgency(task(), {now:dueMinus24h,completed:false}).level, 'red');
assert.equal(taskUrgency(task(), {now:dueMinus72h,completed:false}).level, 'yellow');
assert.equal(taskUrgency(task(), {now:dueMinus100h,lastEndAt:dueMinus1h,completed:false}).reason, 'tight');
assert.deepEqual(resolvePlanTasks(savedPlan, {items:[],completed:{}}).unknownKeys, ['assignment:1']);
```

- [x] **Step 2: 运行红灯。** `node --test test/plans.test.js`。
- [x] **Step 3: 实现接口。** 创建快照时取 Task 1 估时；默认加入范围结束前到期的作业和与范围重叠的活动，逾期保留单独状态，未来排除数明确。比较使用共同日期轴；保存/复制 ID 由调用方提供，纯函数不依赖真实时钟或随机数。
- [x] **Step 4: 运行绿灯。** `node --test test/plans.test.js`。
- [x] **Step 5: 提交。** `Add plan drafts snapshots comparison and urgency`。

## Task 6: 时区可用区间与独立截止校验

**Files:** Modify `src/dates.js`, `test/dates.test.js`；Create `src/availability.js`, `src/plan-validation.js`, `test/availability.test.js`, `test/plan-validation.test.js`。

**Interfaces:** `zonedDateTime(day,time,timeZone,{disambiguation:'earlier'|'later'}={})->ISO|null`；`buildAvailability({range,schedule,timeZone,now,fixedEvents,lockedSegments})->{days:[{day,intervals:[{startAt,endAt}],budgetMinutes}],issues}`；`validatePlan(plan,{items,completed,now,loadedRange})->Validation`；`suggestSegment(plan,itemKey,{day,minutes,startTime?},facts)->{segment:Segment|null,issues}`。

- [x] **Step 1: 写失败测试。** Chicago 2026-03-08 02:30 不存在返回 null；2026-11-01 01:30 的 earlier/later 分别解析成 06:30Z/07:30Z。重叠活动 10–11 与 10:30–11:30 只扣 90 分钟；240 分钟每日预算扣真实窗口内活动占用，活动估时 5 不释放占用。休息日、日期例外、当前已过去时间、跨日活动和区间重叠合并均有独立期望值。
- [x] **Step 2: 添加失败校验测试。** 午间截止、Canvas unlock 与较早手动 start、锁定重叠、超额分配、单次任务拆分、未加载任务、loadedRange 不足和旧截止变化必须产生对应 Issue；无 unlock 任务可从计划起始安排。`complete:true` 必须同时无硬冲突、无未知任务、无缺口。
- [x] **Step 3: 运行红灯。** `node --test test/dates.test.js test/availability.test.js test/plan-validation.test.js`。
- [x] **Step 4: 实现接口。** 用 Intl 反推并 round-trip 验证当地时间，重复时刻有确定选择。工作预算 `max(0,maxMinutes - fixedOverlapMinutes)`，还受真实空闲区间总长限制；锁定任务再扣预算。校验不调用 scheduler，独立重新计算事实；使用当前开放/截止，不能只信快照。过去未完成分段报 missed，不把历史已完成段当待办冲突。
- [x] **Step 5: 运行绿灯。** 上述命令及 `npm test`。
- [x] **Step 6: 提交。** `Validate plan availability time zones and deadlines`。

## Task 7: 手动双栏 Planner、计划存档与对比界面

**Files:** Create `src/planner-view.js`, `src/plan-editor-view.js`, `src/plan-compare-view.js`, `test/planner-view.test.js`；Modify `src/view.js`, `src/styles.js`, `src/content.js`。

**Interfaces:** `createPlannerController({document,planClient,items,state,now,timeZone,onOpenItem,onComplete,onDirtyChange})->{render(),setData(data),requestLeave()->Promise<boolean>,destroy()}`。controller 持有当前草稿、存档、filters、comparison 和 revision；通过 Task 5/6 操作与校验；计划配置与 Settings 默认分开。

- [x] **Step 1: 写失败交互测试。** 新建默认 28 天、保存并重建 controller 后恢复；修改本计划范围、每周容量、休息日和日期例外不改变全局默认或另一份计划，超过 180 天不可保存。搜索 trim/case、课程选择、分组不重复、截止/估时四种排序。按钮方式添加/编辑/移除分段、同日排序和锁定；拖放触发同一草稿 operation，不复制身份。冲突显示允许保存的 draft 状态，超额分配阻止提交该段。
- [x] **Step 2: 添加失败存档测试。** rename/copy 不互相覆盖；删除明确显示计划名且最后一份回空态；未保存退出选择 Save/Discard/Return 三种路径，保存失败仍留在当前页面。选择 2–4 份比较、两指标和两模式；完成标记在所有计划和曲线更新，Canvas 完成只读。搜索输入重绘后保持焦点、光标和过滤值。
- [x] **Step 3: 运行红灯。** `node --test test/planner-view.test.js test/view.test.js`。
- [x] **Step 4: 实现界面。** 左侧 task 列表，右侧 Today/Tomorrow/日期折叠列表；展示安排建议时间、部分分配和独立每日总时长；选择日期及输入时长提供拖动替代。存档保存使用 Task 3 planClient；CONFLICT 显示 Reload/Save as copy。生成按钮在 Task 9 接入后才作为可用操作发布。
- [x] **Step 5: 运行绿灯。** 同一命令、`npm test`、`npm run build`。
- [x] **Step 6: 提交。** `Add editable multi-plan workbench and comparison`。

## Task 8: 可取消的约束排程与均衡核心

**Files:** Create `src/scheduler.js`, `test/scheduler.test.js`。

**Interfaces:** `generateSchedule({plan,items,completed,now,loadedRange},{signal,onProgress,yieldControl,budgetMs=5000}={})->Promise<{status:'complete'|'partial'|'cancelled'|'timeout',segments,validation:Validation,issues,metrics:{beforePeakMinutes,afterPeakMinutes,beforeVariance,afterVariance}}>`。调用 Task 6 availability/validation，注入时钟和 yieldControl 使测试确定；不访问 DOM、存储或网络。

- [x] **Step 1: 写失败约束测试。** 3 小时作业跨三天各容量 60 能全部安排；休息日零分配，低容量日不超额；未来开放、午间截止、当前时间、固定事件、锁定和连续任务约束全部保留。带秒的截止必须向下保守处理；无 unlock 不被困在截止日。逾期、180 天范围外、未知数据和 stale deadline 不得返回 complete。
- [x] **Step 2: 写独立小样本测试。** 用测试内穷举的可用分钟分配验证 1–3 项可拆任务的小时间线可行性；每个 complete 结果调用独立 validatePlan，断言 exact minutes 守恒且不重叠。设置一个可平滑的宽窗口样例，断言峰值和离散程度降低；容量不足返回明确 missingMinutes；有限回溯耗尽只称未能安排。注入 abort 与时钟覆盖取消和超时。
- [x] **Step 3: 运行红灯。** `node --test test/scheduler.test.js`。
- [x] **Step 4: 实现算法。** 有效锁定保留；连续任务按截止和可用候选数量排序，候选以负荷低、结束早、ID 为确定 tie-break，有限回溯最多 2000 状态。可拆任务在可用时间线上按已开放的 earliest-deadline-first 推进，支持撤销预算消耗以重新尝试连续任务候选。

均衡循环只移动未锁定段，且每次完整校验后才接受：先降低可工作日的峰值，再降低容量加权离散程度，最后改善截止缓冲；候选允许将大分段拆成分钟块，但合并相邻同任务段。最多 2000 次候选改善，分批让出执行；耗尽改善次数不等于未安排失败，返回当前有效结果。超时或取消绝不伪造 complete。

- [x] **Step 5: 运行绿灯。** `node --test test/scheduler.test.js test/plan-validation.test.js`，随后 `npm test`；检查成功案例独立验证全部通过。
- [x] **Step 6: 提交。** `Generate balanced schedules within deadline constraints`。

## Task 9: 后台排程消息、取消和预览应用

**Files:** Create `src/scheduler-service.js`, `src/scheduler-client.js`, `test/scheduler-service.test.js`；Modify `src/background.js`, `src/content.js`, `src/planner-view.js`, `test/planner-view.test.js`。

**Interfaces:** `createSchedulerService({generateSchedule,now})->{handlePort(port,sender)}`；`createSchedulerClient({connect})->{run(input,{onProgress}),cancel(),destroy()}`；run 返回 result 与 requestId/fingerprint。使用内部 runtime.Port `canvas-planner-scheduler`；按 tabId、页面 sessionId、requestId 隔离。通过 Task 5 fingerprint 校验结果仍对应同一草稿/事实。

- [x] **Step 1: 写失败消息测试。** 取消只作用于发起页面自己的 job；同时两个页面互不取消；断开 port 停止计算；后台重启/断开让客户端返回可重试错误；连续 start 不让旧结果覆盖新 job。非 Canvas sender、非法范围和未知消息不运行排程。
- [x] **Step 2: 写失败预览测试。** Generate 展示 progress，完成后先预览，不修改存档；Accept 更新草稿并标 dirty，Save 才持久保存。partial/timeout 明示缺口，取消保留原草稿。期间改变估时、计划或账号使旧 fingerprint 无法应用，按钮提供重试。
- [x] **Step 3: 运行红灯。** `node --test test/scheduler-service.test.js test/planner-view.test.js`。
- [x] **Step 4: 实现服务与 UI。** 现有 background 同时注册 archive handler 和 scheduler port handler，CPU 分批处理，以长连接返回进度但不假设后台永不退出。页面不启动同源受限的 Worker；不增加 web_accessible_resources 或额外权限。生成前确认当前事实/快照差异、有效锁定和加载范围。
- [x] **Step 5: 运行绿灯。** 上述命令、`npm test`、`npm run build`；后台仍能发送原 PLANNER_TOGGLE。
- [x] **Step 6: 提交。** `Run cancellable scheduling in the extension background`。

## Task 10: 跨标签同步、范围加载和异常恢复

**Files:** Modify `src/view.js`, `src/content.js`, `src/canvas-api.js`, `src/storage.js`, `test/view.test.js`, `test/canvas-api.test.js`；Create `test/planning-integration.test.js`。

**Interfaces:** 扩展 `createCanvasLoader` 返回的 `(month,options)`：options 可含 `range:{startDate,endDate}`，缺省仍为原前后六月；验证范围，仍按选中日历和并发 6 加载。`mountPlanner` 接收 `planClientFactory(userId)`、`schedulerClientFactory(userId)`、`subscribeStorage({hostname,userId},listener)->unsubscribe` 和 `planningStoreFactory(userId)`；存储 listener 通知当前账号的键变化并重新读取受影响本地状态，close/toggle 的草稿退出通过 Task 7 requestLeave，destroy 明确取消并清理订阅。

- [x] **Step 1: 写失败集成测试。** 一次加载后四标签/估时/曲线切换请求数不增加；计划范围不完整时先加载实际范围再允许生成，日历过滤和权限缓存保持。全部所选拒绝仍可进入 Settings 和只读快照计划；取消选择后存档不丢失、unknown 不报告成功。
- [x] **Step 2: 写失败生命周期测试。** 请求中账号变化、storage changed、关闭/重开、Escape、原生 Planning 入口均不应用旧账号结果；共享 complete 更新各视图；dirty 保存失败不退出。未知 schema 存档 warning、存储写入失败草稿保留。每次重开不累加 storage/port 监听器；native toolbar 替换仍仅一个入口。
- [x] **Step 3: 运行红灯。** `node --test test/planning-integration.test.js test/view.test.js test/canvas-api.test.js test/calendar-entry.test.js`。
- [x] **Step 4: 实现整合。** 统一当前账号版本与本地修改通知，旧请求/生成结果不得写新状态；当前事实验证后才展示计划数据。范围参数只改变日期，保留现有上下文批次、重试和 403 隔离。所有长操作有状态/重试，输入焦点按稳定字段恢复。存储错误不转换成 Canvas API 错误。
- [x] **Step 5: 运行绿灯。** `npm test`、`npm run build`、Git diff whitespace 检查，全部零失败。
- [x] **Step 6: 提交。** `Integrate planning lifecycle and recoverable loading`。

## Task 11: 实际 Chrome 验证、文档和最终审查

**Files:** Modify `README.md`, `manifest.json`（仅描述/版本，权限不变）；更新本计划复选框。截图保存在项目目录，不提交包含用户课程数据的截图。

- [x] **Step 1: 全量验证。** `npm test` 与 `npm run build`；用现有 Chrome 扩展刷新流程加载 dist，并刷新已获授权的 Canvas calendar 页面。
- [x] **Step 2: 验证真实页面完整流程。** 从原生 Planning 入口进入，查看日期徽标和 Workload 两指标；配置 HPDL/课程规则、手动覆盖后清除；创建手动计划、搜索/排序、分段、保存重开、复制与比较；设休息日生成，检查预览、紧急提示和冲突解释。检查浏览器尺寸下双栏、图表和日期列表可读。
- [x] **Step 3: 保留用户配置。** 实测所建存档以“Verification”命名，验证后清理仅这些临时存档；备份并恢复原日历选择/完成标记/已有估时和规则，不删除用户任务或旧数据。真实任务中不为验证虚构 Canvas 提交状态。
- [x] **Step 4: 更新 README。** 说明四标签、统计口径、规则优先级、保存/草稿、计划比较、休息日/容量、截止检查和有限搜索限制；保留加载优化与只读说明。使用本地 screenshot 记录成功界面，提供最终结果可视证据。
- [x] **Step 5: 请求独立最终代码审查。** 按 requesting-code-review 技能，在直接实现完成后交给只读审查代理，范围为本功能所有产品提交；针对统计/估时、时间约束、存档并发和原生页面回归检查。收到意见先核实，再修复有证据的问题。
- [x] **Step 6: 完成必要复验与整合。** 修复后运行相关测试与最终全量测试/构建，检查仅预期文件改变；沿用用户主分支整合偏好保存全部改动。最终说明实现结果、验证证据和实际限制，嵌入已验证截图。

## Coverage and Handoff

设计稿 1–3 节由 Tasks 1–4 完成；4 节由 Tasks 3、5、7 完成；5 节由 Tasks 6、8–10 完成；6 节由 Tasks 5、7 完成；7–8 节由模块契约和 Tasks 3、9–10 完成；9–10 节由各任务测试与 Task 11 收束。所有列出的输出接口有定义，最终交付包括自动排程与多计划，不能把尚未接通的按钮或占位标签作为完成。

计划审阅通过后按上述顺序直接实现，不再询问由谁执行。实现时只有发现需要改变已确认的产品含义或不可满足的约束，才提出具体调整；常规代码组织和修复自主完成。
