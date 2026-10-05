# Canvas Deadline Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Settings 中增加可开关、可配置的 Canvas 作业 DDL 桌面提醒，默认关闭，初始配置为一轮、提前两小时。

**Architecture:** 独立设置模块和纯规则模块决定提醒资格、轮次身份及补发。后台服务持久保存当前账号的数据和发送记录，每 15 分钟更新数据，并通过一个最近触发 alarm 发送通知。现有规划界面通过账号绑定的提醒客户端显示状态、编辑设置和发送测试通知。

**Tech Stack:** Manifest V3、原生 JavaScript/CSS、Chrome storage.local/alarms/notifications、现有 Canvas 读取 API、esbuild、node:test、jsdom；构建目标 chrome114。

**Spec:** `docs/superpowers/specs/2026-10-04-deadline-reminders-design.md`。用户已确认规格；本计划尚待审阅并选择执行方式。起点为 `codex/deadline-reminders` 的设计文档提交 `87b7ea4`。

## Global Constraints

- 默认关闭；`reminders: { enabled: false, leadMinutes: [120] }`；1–5 轮，每轮 1–43200 整数分钟，排序及合并重复值。
- 仅当前验证账号、已选日历中的未完成 Canvas 作业，以真实 `dueAt` 为准；个人目标、活动和工作时段不参与。
- 每 15 分钟更新；离线快照有效期 24 小时；身份验证失效立即暂停；仅补尚未过期作业的最近一轮。
- 轮次身份包含站点、账号、作业 key、规范化 DDL 时间和提前分钟数；已发送轮次不因设置修改、重启或账号切换重复。
- 增加 `alarms`、`notifications`，主机权限仍只有 `https://canvas.illinois.edu/*`；构建目标仍为 chrome114，通知 API 使用兼容回调的封装。
- 中英文、账号时区、桌面和约 390px 窄屏；作业名称和课程名称保持原始文本。
- 不新增依赖、外部服务、遥测或 Canvas 写入；保留现有用户设置、完成记录、计划和安装身份。
- 真实后台登录与系统通知须单独验证；模拟成功不能标为真实已验证；本次不发布 GitHub 版本。
- 只提交本任务实际修改。实施前检查 Git 状态、按 using-git-worktrees 技能确定隔离方式，保留现有设计分支和任何新出现的用户改动。

## Review Focus

- 已选日历为空时必须得到零个作业，而非自动回退全部日历；接口请求与后台安排均检查（任务 3、5）。
- 同一个 DDL 使用不同 ISO 时区写法时，轮次身份必须相同，不能重复通知（任务 2）。
- 旧设置中只有提醒字段损坏时，估时和工作容量不得一起回退，原记录不得被读操作覆盖（任务 1）。
- 作业或课程名称恰好等于翻译词、包含 HTML 或超长文本时，只按原始文本显示，不执行或翻译内容（任务 4、6）。
- 后台自己的快照和发送记录写入不得触发无限同步；状态刷新和迟到状态响应不得清空未保存的 Settings 草稿（任务 5、6）。

---

## Shared Types and File Boundaries

`ReminderSettings = {enabled:boolean, leadMinutes:number[]}`；`Scope = {hostname:'canvas.illinois.edu',userId:string}`。所有后台时钟使用 `now():number`，单位为 Unix 毫秒。

`ReminderItem` 沿用规范化作业字段：`key,type,title,contexts,contextCodes,dueAt,url,canvasCompleted`。真实 DDL 用 `Date.parse(dueAt)` 规范化；资格判断还叠加当前本地 `completed` 映射和日历选择。

`LedgerEntry = {state:'pending'|'sent'|'skipped'|'failed',dueAt:number,updatedAt:number,retryAt?:number}`；失败重试最早为失败后 15 分钟。`pending` 在后台中断后的恢复中不自动重发。

`ReminderStatus = {state:'off'|'waiting'|'ready'|'offline'|'stale'|'auth'|'notification-denied'|'error',permission:'granted'|'denied'|'unknown',lastSyncedAt:number|null,errorCode?:string}`。错误码使用 `NETWORK`、`STORAGE`、`NOTIFICATION`、`DELIVERY_UNCERTAIN` 或 `IDENTITY`，交给界面翻译固定错误信息。

新增文件分别负责配置 (`reminder-settings.js`)、纯规则 (`reminder-policy.js`)、Chrome 及通知格式 (`reminder-chrome.js`、`reminder-notification.js`)、后台服务 (`reminder-service.js`)、消息客户端 (`reminder-client.js`) 和设置区域 (`reminder-settings-view.js`)。Canvas 读取入口复用 `canvas-api.js` 内现有分页、目录和日历读取能力，避免复制整套加载器。

### Task 1: 提醒配置与旧设置兼容

**Files:** Create `src/reminder-settings.js`, `test/reminder-settings.test.js`; modify `src/planning-settings.js`, `src/storage.js`, `test/storage.test.js`.

**Interfaces:**
- Produces `defaultReminderSettings():ReminderSettings`、`validateReminderSettings(input):{value:ReminderSettings|null,errors:string[]}`、`normalizeReminderSettings(input):ReminderSettings`。
- Produces `reminderMinutes(value:number,unit:'minutes'|'hours'|'days'):number|null`、`resizeReminderRounds(values:number[],count:number):number[]`。归一化按提前分钟降序、去重；增轮预设依次取尚未使用的 `[120,360,1440,2880,4320]`；减轮保留距 DDL 最近的数量。
- Existing `defaultSettings()` 和 `validateSettings(input)` 包含 `reminders`；store 的 `loadPlanningState()` 只对损坏的提醒字段回退并增加警告，`setSettings()` 仍严格校验新的输入。

- [ ] **Step 1: 写失败测试。** `defaults remain opt-in and time units are exact` 断言 `assert.deepEqual(defaultReminderSettings(),{enabled:false,leadMinutes:[120]})`、`assert.equal(reminderMinutes(.5,'hours'),30)`、`assert.equal(reminderMinutes(.5,'minutes'),null)`。`limits sorting and duplicates follow the spec` 检查 `[120,1440,120]` 保存为 `[1440,120]`，拒绝 0、43201、NaN、Infinity、空数组和超过 5 项的输入。`invalid reminder field preserves unrelated old settings` 以原始 storage.set 写入损坏提醒字段和 `defaultMinutes:45`，断言加载后估时仍 45、提醒关闭、有警告、原始记录未变；另一个账号使用自己的默认值。
- [ ] **Step 2: 验证失败。** Run `node --test test/reminder-settings.test.js test/storage.test.js`；新增接口缺失或提醒默认/兼容断言失败，不能仅因 fixture 写错而失败。
- [ ] **Step 3: 实现模块与存储接入。** 输出以上接口。`validateSettings()` 对缺失字段补默认值，对非法新输入返回错误；读取旧记录时先单独检查提醒字段再交给现有设置校验，保留其他设置及原始记录。校验严格要求布尔 enabled 和数值分钟，不对保存的字符串静默强制转换。
- [ ] **Step 4: 验证通过。** Run `node --test test/reminder-settings.test.js test/storage.test.js test/schedule-buffer.test.js test/settings-view.test.js`；全部通过，原缓冲及设置行为不变。
- [ ] **Step 5: 提交任务。** 审阅并只暂存本任务文件，commit `feat: add account-scoped deadline reminder settings`。

### Task 2: 触发与最近一轮补发规则

**Files:** Create `src/reminder-policy.js`, `test/reminder-policy.test.js`.

**Interfaces:**
- Consumes Task 1 的有效 ReminderSettings，以及 Shared Types。
- Produces `reminderToken(scope,item,leadMinutes):string`。
- Produces `evaluateReminders({scope,items,settings,selectedCalendars,completed,ledger,now}):{deliveries:Array<{item,leadMinutes,token,at}>,skipped:Array<{token,dueAt}>,nextAt:number|null}`。不访问 Chrome、网络或存储；`selectedCalendars:[]` 必须筛成零个作业。

- [ ] **Step 1: 写失败测试。** 固定 DDL `2026-10-05T20:00:00Z`；一轮 120 分钟在 `18:00Z` 产生一次 delivery，在 `17:59Z` 只返回 nextAt。三轮 `[1440,360,120]` 从休眠恢复到 `19:00Z` 只产生 120 分钟的一轮；最近一轮已经 sent 时 `assert.equal(result.deliveries.length,0)`，更早漏掉的轮次也不发。DDL 已到、已完成、活动及无 DDL 均为零次。
- [ ] **Step 2: 验证失败。** Run `node --test test/reminder-policy.test.js`；模块或规则缺失导致新增断言失败。
- [ ] **Step 3: 实现纯规则接口。** token 用规范化 DDL 毫秒，不用字符串格式或轮次序号；处理 `sent`、`pending`、`skipped` 为已处理身份，`failed` 在 retryAt 之前不投递；nextAt 包括未来轮次和尚未到期的失败重试。补发先选当前全部已到点轮次的最晚一轮，不能先移除 sent 再选择更早轮次。
- [ ] **Step 4: 写变化与边界测试。** 同一时刻 `20:00Z` 与 `15:00-05:00` 使用 `assert.equal(reminderToken(scope,utcItem,120),reminderToken(scope,offsetItem,120))`；DDL 延后生成新 token，改回旧 DDL 保留旧 ledger；改变排序、添加早期已错过轮次、完成后撤销、本地与 Canvas 完成并集、空选择、跨日及夏令时保持绝对触发时间；failed 重试在 DDL 之后不投递。
- [ ] **Step 5: 验证边界失败。** Run `node --test test/reminder-policy.test.js test/model.test.js`；新增未覆盖的边界断言失败；已经满足的断言记录为现有通过项。
- [ ] **Step 6: 完成边界规则。** 在 evaluateReminders 和 reminderToken 中补足上述未覆盖情况，保持纯函数接口。
- [ ] **Step 7: 验证通过。** 运行 Step 5 命令，要求全部通过。
- [ ] **Step 8: 提交任务。** Commit `feat: calculate deadline reminder rounds and catch-up policy`。

### Task 3: 以当前时间为基准读取 Canvas 作业

**Files:** Modify `src/canvas-api.js`, `test/canvas-api.test.js`; create `test/reminder-api.test.js`.

**Interfaces:**
- Produces `fetchCanvasProfile(fetchImpl=fetch):Promise<Profile>`，复用 JSON、身份验证及固定主机校验。
- Produces `loadCanvasReminderSnapshot({fetchImpl=fetch,profile,selectedCalendars,now=Date.now,maxLeadMinutes,cache=new Map()}):Promise<Snapshot>`；profile 由调用方刚验证，输出结构可直接交给现有 `normalizeItems()`。`selectedCalendars` 为 null 时取账号可用目录，空数组代表不选任何日历。
- Profile、Snapshot 沿用现有 Canvas 数据结构。内部 `fetchSnapshotData()` 可增加 `types=['event','assignment']` 参数；提醒入口仅请求 assignment，不改日历加载器默认行为。

- [ ] **Step 1: 写失败测试。** `reminder range follows now and account timezone` 固定当前时间与 `America/Chicago`，断言请求覆盖当前本地日期至最长提前时间后一天，JSON 请求带 `credentials:'include'`，不使用正在浏览的月份。`empty selection never requests every calendar` 断言空选择得到零 assignments，且无 calendar_events 作业请求。`reminders reuse pagination submission and deadlines` 校验分页、提交信息、作业详情补全和 Canvas due_at。
- [ ] **Step 2: 验证失败。** Run `node --test test/reminder-api.test.js test/canvas-api.test.js`；新读取入口缺失或范围/类型断言失败。
- [ ] **Step 3: 实现读取入口。** 复用内部目录、固定源、分页和被拒绝日历拆分；提醒范围单独计算，现有 calendar cache 不作为提醒持久状态。保留全部拒绝与部分拒绝的区别；范围或账号时区无效返回可识别数据错误，不能静默查任意日期或另一个主机。
- [ ] **Step 4: 写错误和回归测试。** 添加 `401 and login HTML are authentication failures`、`untrusted next links and malformed pages are rejected`、`one inaccessible calendar cannot retain its old reminder data`。同组测试断言 AUTH 分类、外站分页不 fetch、partial snapshot 标出 unavailableCalendars。
- [ ] **Step 5: 验证错误处理失败。** Run `node --test test/reminder-api.test.js test/canvas-api.test.js test/calendar-loading.test.js`；新增未实现行为失败，已有拒绝规则仍通过。
- [ ] **Step 6: 完成错误分类与部分读取。** 复用现有 CanvasApiError 分类，返回实际 unavailableCalendars，禁止把拒绝的日历当完整成功数据。
- [ ] **Step 7: 验证通过。** 运行 Step 5 命令，要求全部通过。
- [ ] **Step 8: 提交任务。** Commit `feat: load current deadline snapshots for background reminders`。

### Task 4: Chrome 适配和通知内容

**Files:** Create `src/reminder-chrome.js`, `src/reminder-notification.js`, `test/reminder-chrome.test.js`, `test/reminder-notification.test.js`, `assets/deadline-128.png`; modify `src/i18n.js`, `test/language.test.js`.

**Interfaces:**
- Produces `createReminderChrome({chromeApi,iconUrl}):{alarms,notifications}`。`alarms.get(name)`, `alarms.set(name,alarmInfo)`, `alarms.remove(name)` 返回 Promise；`notifications.permission()`, `notifications.create({id,title,message})`, `notifications.clear(id)`, `notifications.open(url)` 返回 Promise，底层保持 Chrome 114 回调兼容，并传播 runtime.lastError。
- Produces `notificationIdForToken(token):Promise<string>`，用 Web Crypto SHA-256 生成 `canvas-ddl-` 加 64 位十六进制 ID；测试注入 webcrypto，不引入依赖。
- Produces `formatReminderNotification({item,profile,language,now}):{title,message}` 和 `safeReminderUrl(value):string`；后者只允许 Illinois Canvas HTTPS 源，否则回到 `/calendar`。
- Produces DOM 无关 `translateForLanguage(language,source)`，现有 `translate(document,source)` 委托此函数，保持原有 literal 和模板插值语义。

- [ ] **Step 1: 写失败测试。** 使用 callback-only Chrome stub，断言通知类型 basic、iconUrl 是扩展本地资源、permission 和 lastError 正确传出；不依赖 Promise-only Chrome stub。`same token gives same short notification id` 断言相同 token 的 ID 相同、长度小于 500。`task text remains literal in both languages` 使用标题 `Settings <img src=x>` 和课程 `Today`，断言名称逐字保留；格式包含课程、剩余时间、账号时区中的 DDL，剩余秒数不足一分钟仍显示一分钟。
- [ ] **Step 2: 验证失败。** Run `node --test test/reminder-chrome.test.js test/reminder-notification.test.js test/language.test.js`；新增接口或通知断言失败。
- [ ] **Step 3: 实现适配与内容。** 错误回调在有效上下文内读取 lastError；Chrome 调用失败拒绝 Promise。只翻译固定模板，绝不把作业名交给翻译匹配器。静态图标为自己绘制的简单日历标记，PNG 128×128，不用远程图片。safeReminderUrl 拒绝 http、javascript、data、其他主机以及带用户名/密码的 URL。
- [ ] **Step 4: 写异常输入测试。** 长标题完整保留在格式化结果中；非法 DDL 拒绝生成作业通知；permission denied 原值传出；Chrome 失效或 lastError 使适配 Promise 拒绝；不安全链接回到固定 Canvas 日历。
- [ ] **Step 5: 验证异常输入失败。** 运行 Step 2 命令；新增未实现行为失败，已有行为保持通过。
- [ ] **Step 6: 完成异常输入处理。** 实现上述拒绝和固定目标行为，不使用任意外部 URL，不修改 Canvas 名称。
- [ ] **Step 7: 验证通过。** 运行 Step 2 命令全部通过，现有语言测试无回归；通知适配成功只表示 Chrome 接受请求。
- [ ] **Step 8: 提交任务。** Commit `feat: add compatible Chrome desktop notification adapter`。

### Task 5: 持久后台服务与账号生命周期

**Files:** Create `src/reminder-service.js`, `test/reminder-service.test.js`, `test/helpers/reminders.js`.

**Interfaces:**
- Consumes Tasks 1–4；`storeFactory(userId)` 返回现有 planner store，`fetchProfile()`、`loadSnapshot(args)` 注入 Task 3 的接口；Chrome alarms/notifications 来自 Task 4。
- Produces `createReminderService({storageArea,storeFactory,fetchProfile,loadSnapshot,alarms,notifications,formatNotification,now=Date.now})`，方法为 `start():Promise<void>`、`handleAlarm(alarm):Promise<void>`、`invalidate(changes):void`、`handleStorageChanges(changes,area):Promise<void>`、`handleMessage(message,sender):Promise<Reply|undefined>`、`handleNotificationClick(id):Promise<void>`。invalidate 同步使旧异步结果失效，其余写入和投递串行。
- 消息类型 `REMINDER_ACCOUNT_SEEN`、`REMINDER_STATUS`、`REMINDER_TEST`，均带 userId；ACCOUNT_SEEN 可带已选日历。Reply 为 `{ok:true,status:ReminderStatus}` 或 `{ok:false,code,message}`；非提醒消息返回 undefined。
- 两个 alarm 名称为 `canvas-planner:reminders:refresh` 和 `canvas-planner:reminders:next`。全站指针键 `canvas-planner:canvas.illinois.edu:reminder-active:v1`；账号运行键 `<账号前缀>reminders:v1`，记录 schemaVersion、scope、fallback selection、snapshot、ledger、notification mappings 和 status。

- [ ] **Step 1: 写失败测试。** helper 提供固定时钟、memoryStorage、挂起/失败 API、Chrome 操作记录。`enabled reminders run with no content page` 断言首次同步、15 分钟 alarm 和最近触发 alarm；时钟进入提醒时间后一次 create。`worker restart does not repeat sent or uncertain pending rounds` 重建 service 后 `assert.equal(notificationCreates.length,1)`；pending 保存后模拟中断，恢复不重复。`disabled users perform no scheduled fetch` 断言无周期请求与投递。
- [ ] **Step 2: 验证失败。** Run `node --test test/reminder-service.test.js`；后台接口缺失或首次同步/恢复断言失败。
- [ ] **Step 3: 实现持久服务。** 启用、同步、触发和恢复按规格执行。start 从存储恢复并检查 alarm；过期截止身份只在无点击映射引用后清理。到点前尝试刷新，网络失败在快照年龄小于 24 小时且此前未 AUTH 的条件下可继续；AUTH 清除可发送快照，后续只核验登录直到恢复。读取 store 的最新 completion、selection、开关；无保存 selection 时使用本账号前台已验证并传入的 fallback selection，不改写用户的 calendar 设置。
- [ ] **Step 4: 写故障与竞争测试。** 24 小时前后状态分别 offline/stale，失败请求不能更新 syncedAt；部分无权限移除旧数据；账号 A 的挂起请求在 B 激活后不可提交或通知；关闭及完成在挂起请求期间发生也取消投递。占位必须早于 create；storage.set 失败时 create 次数为零；明确 create 失败记录 failed 和 15 分钟 retryAt，不能立即循环。
- [ ] **Step 5: 写消息与自触发边界测试。** 非 Canvas、非顶层 sender、非法 userId、消息账号与验证 profile 不一致均返回 INVALID/IDENTITY，不按伪造的 userId 读取其他账号运行数据。STATUS 只读，不刷新 ledger；TEST 用合成文本、不改变 ledger。内部 runtime key 写入不触发同步循环；只监听 settings、calendars、completed 和 language 等实际输入变化。关闭、完成、账号失效清理相应已显示通知；点击只通过持久映射和 safeReminderUrl，找不到映射不打开旧作业。明确模拟的 storage 事件次数上限，不能用真实延迟掩盖循环。
- [ ] **Step 6: 验证故障与边界失败。** Run `node --test test/reminder-service.test.js`；新增未实现的竞态、消息、重试或通知清理断言失败。
- [ ] **Step 7: 完成版本与故障处理。** 实现 invalidate、发送前重新校验、failed 重试和 AUTH 恢复，依据 Step 4/5 的明确断言完成消息、内部写入过滤及点击映射处理。
- [ ] **Step 8: 验证全部通过。** Run `node --test test/reminder-service.test.js test/reminder-policy.test.js test/reminder-api.test.js test/reminder-chrome.test.js`；全部通过。审阅 start、alarm、storage 和 message 四条路径的相同发送前校验及失效版本处理。
- [ ] **Step 9: 提交任务。** Commit `feat: persist background deadline reminder lifecycle`。

### Task 6: Settings 接入及扩展入口

**Files:** Create `src/reminder-client.js`, `src/reminder-settings-view.js`, `test/reminder-client.test.js`, `test/reminder-settings-view.test.js`, `test/reminder-entry.test.js`; modify `src/settings-view.js`, `src/view.js`, `src/content.js`, `src/background.js`, `src/i18n.js`, `src/styles.js`, `manifest.json`, `scripts/build.mjs`, `test/settings-view.test.js`, `test/view.test.js`, `test/appearance-entry.test.js`, `test/fixtures/quality-preview.html`.

**Interfaces:**
- Produces `createReminderClient({userId,sendMessage}):{accountSeen({selectedCalendars}),getStatus(),testNotification()}`，方法返回 Promise<Reply>，使用 Task 5 的固定消息。
- Produces `createReminderSettingsEditor({document,value,client,onChange}):{element,setValue(settings),setBusy(boolean),refreshStatus():Promise<void>,dispose()}`。onChange 将包含当前字段值的原始 ReminderSettings 写入父 draft，非法字段必须阻止保存，不能静默保留旧值。
- `renderPlanningSettings()` 新增可选 reminderClient，仍返回 HTMLElement，并暴露 `refreshReminderStatus()`、`dispose()`。`mountPlanner()` 新增可选 `reminderClientFactory(userId)`；旧调用方无 factory 时正常显示配置，状态为不可用，不崩溃。

- [ ] **Step 1: 写失败测试。** UI 默认关闭、1 轮、2 小时；开启并编辑 0.5 小时保存为 30 分钟，3 轮和重复时间保存后显示真实数量。`drafts survive status updates and failed saves` 在挂起 getStatus 后编辑提前时间，返回状态不能恢复旧输入；保存失败重试读回相同草稿。`disposal rejects late account status` 换账号并销毁旧 editor 后旧 Promise 不更新新界面。client 断言发送固定 type 与绑定 userId，不允许调用方覆盖身份。
- [ ] **Step 2: 验证失败。** Run `node --test test/reminder-client.test.js test/reminder-settings-view.test.js test/settings-view.test.js test/view.test.js`；新增控件、草稿或消息断言失败。
- [ ] **Step 3: 接入界面。** 新区域沿用规划设置总保存按钮；保存期间 setBusy 禁用提醒编辑，成功后将规范化时间回填，失败保持草稿。关闭时仅轮次控件禁用，状态及测试仍可用。状态请求和测试请求都捕获失效上下文，显示固定可翻译错误；本账号提醒 runtime storage 变化只刷新状态，不重建 settingsEditor 或重新加载整个 Canvas。
- [ ] **Step 4: 写入口及可访问性测试。** bundle 后运行 callback-only Chrome harness，断言后台启动和关闭 Canvas 后无需 DOM 可发送、丢失 alarm 重建、原 PLAN_SAVE 和 scheduler 入口仍可用。manifest 权限精确为 `['storage','alarms','notifications']`，主机及 content script 匹配不变；有本地 PNG。中英文控件标签、禁用状态、键盘焦点、通知错误与合成测试反馈可用；内部运行状态更新不增加 Canvas 页面加载次数。
- [ ] **Step 5: 验证入口失败。** Run `node --test test/reminder-entry.test.js test/reminder-settings-view.test.js test/view.test.js`；新增入口、权限或生命周期断言失败。
- [ ] **Step 6: 接入身份与后台。** installSnapshot 完成验证账号及本地读入后建立绑定 client 并 accountSeen；close/discardIdentity/editor 替换时 dispose。后台在模块顶层同步注册 onAlarm、onStartup、onInstalled、onClicked、onMessage、onChanged，再异步 start；只对提醒消息返回 true，保留原计划、toolbar 和 scheduler 监听。onChanged 在等待串行处理之前调用 invalidate，防止关闭请求排队期间仍投递。
- [ ] **Step 7: 完成翻译、布局和打包。** 复用现有字段/状态模式，通知状态与同步时间使用 aria-live；窄屏每轮纵排。build.mjs 复制 `assets/deadline-128.png` 至 `dist/icons/deadline-128.png`。更新既有 appearance 权限契约测试，仍验证主机范围和早期入口匹配。quality-preview 只加入合成 reminder client，可切换 ready、offline、denied 和模拟保存失败。
- [ ] **Step 8: 验证通过。** Run `node --test test/reminder-client.test.js test/reminder-settings-view.test.js test/reminder-entry.test.js test/settings-view.test.js test/view.test.js test/appearance-entry.test.js test/language.test.js` 和 `npm run build`；全部通过，产物含后台代码、预期权限和可解码 128×128 图标。
- [ ] **Step 9: 提交任务。** Commit `feat: expose configurable deadline reminders in Settings`。

### Task 7: 整体回归和使用验证

**Files:** Create `docs/superpowers/reviews/2026-10-04-deadline-reminders.md` and related local screenshots; modify `README.md`、本计划的完成勾选和设计文件状态，限于最终实际行为和证据。

**Interfaces:** Consumes 完成后的扩展和已有 fictional quality preview；不增加新的产品接口。

- [ ] **Step 1: 运行必要回归。** Run `npm test`、`npm run build`、`git diff --check`；记录真实通过/失败数量和退出状态。检查 package/manifest 版本保持一致，并检查生成 manifest 权限、图标存在及后台无需 Canvas DOM 的启动。不为本次功能顺带发布新版本。
- [ ] **Step 2: 检查交互。** 本地 preview 用合成数据，检查英文/中文、浅色/深色、桌面/390px 的设置、增减轮次、保存归一化、保存失败、状态更新保留草稿和测试反馈。记录截图与实际检查范围；结构存在不能替代浏览器布局检查。
- [ ] **Step 3: 验证真实边界。** 用已加载的本地扩展检查浏览器通知权限、合成测试通知和点击日历；若已授权环境可验证，检查后台 Cookie profile/作业读取、Canvas 页面关闭后的同步、重启后恢复。不得自动操作 chrome://extensions，若需要用户重载则把该步骤留为明确的用户操作；无法检查的项目写为未验证，模拟响应仍标为模拟。保持默认关闭，不替用户选择真实课程或启用真实 DDL 通知。
- [ ] **Step 4: 完成独立审查与有依据的修复。** 按所选执行方法要求进行整体分支审查，逐项对照规格及 Review Focus；只修复实际发现的问题，相关新增行为先失败再验证。最后一次代码修改后重新运行受影响测试及必要整体检查，不无理由重复全部检查。
- [ ] **Step 5: 更新交付记录并提交。** README 说明默认值、配置位置、运行条件和通知权限；review 文件区分自动化、模拟浏览器和真实系统通知证据。只有实际完成的步骤才勾选。Commit `docs: document deadline reminder behavior and validation`，交付功能摘要、验证结果和仍需用户执行的重载/真实验证事项。

## Plan Self Review

规格的设置、时间与去重、后台数据、账号持久状态、通知权限、模块边界、验收交付分别由任务 1/6、2/5、3/5、1/5、4/6、全部接口块、7 覆盖。Review Focus 五项都有所属任务中的明确断言。前后任务共享相同 ReminderSettings、Scope、LedgerEntry、ReminderStatus、消息类型和方法名；所有实现步骤使用 node:test 验证，保持现有语言及浏览器兼容要求。

执行方式尚未选择。推荐当前会话由主助手直接实现，再做一次整体独立审查：设置、规则、服务和界面接口相互依赖，顺序实现可减少交接成本。选择子代理方式则按 subagent-driven-development 的任务及审查顺序执行。本计划审阅确认前不修改产品代码。
