# Canvas Global Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 增加独立的主题应用范围设置，将现有配色用于整个 Canvas，同时保留信息颜色并避免正常刷新闪回浅色。

**Architecture:** 轻量外观入口在 document_start 恢复同步缓存，独立页面控制器随后核对 Chrome 存储和账号。全局样式以明确组件选择器适配中性色，并保护课程、事件、状态和教学内容。现有规划弹层通过独立范围存储接口参与同步。

**Tech Stack:** Manifest V3、原生 JavaScript/CSS、Chrome storage.local、localStorage、esbuild、node:test、jsdom；现有构建目标 chrome114。

**Spec:** `docs/superpowers/specs/2026-09-30-canvas-global-theme-design.md`

## Global Constraints

- 默认 `planner`；全局值为 `canvas`。沿用 light、dark、forest、warm、system、custom 及四个自定义颜色。
- 权限保持 `storage` 和 `https://canvas.illinois.edu/*`，不扩大主机权限，不新增第三方请求或依赖。
- 首次安装、升级或缓存损坏时，启动等待上限固定为 250 毫秒；超时必须释放页面。
- 普通界面文本与背景对比度至少 4.5:1，焦点与必要边界至少 3:1。
- 不向子框架注入，不修改第三方工具；路径排除采用规格第 3 节的完整列表。
- 不使用整页 invert、hue-rotate、按 RGB 扫描替换、所有元素通配 `color/background !important` 或重写 Canvas 内容节点。
- Chrome 存储是权威来源；同步缓存不含账号 ID、任务、成绩、认证信息或任意 CSS。
- 不修改与此功能无关的并行改动；工作区已有未提交改动，提交只包含本任务实际差异，禁止整文件顺带提交他人的工作。

## Review Focus

- 其他账号写入外观：已核验页面仍按当前账号读取，迟到响应不能覆盖较新选择（任务 3）。
- 读取超时且根节点迟到：在 250 毫秒后仍能显示页面，销毁后不得重新隐藏（任务 3）。
- 同源缓存被写入非法值、删除或禁止访问：不能插入任意 CSS，也不能覆盖 Chrome 中的有效设置（任务 3）。
- 自定义配色使用近似文字/背景颜色：普通文本、焦点和边界仍达标，原色内容保持可读配对（任务 2、5）。
- 受保护区域包含普通按钮/表格同名类：全局组件选择器不得渗入富文本、状态、事件或媒体（任务 2、5）。

---

### Task 1: 独立范围存储与设置控件

**Files:** Create `src/appearance.js`, `test/appearance.test.js`; modify `src/storage.js`, `src/theme-settings-view.js`, `src/view.js`, `src/i18n.js`, `test/theme.test.js`.

**Interfaces:**
- `Appearance = {theme: Theme, scope: 'planner'|'canvas'}`；Theme 结构保持现有定义。
- `validThemeScope(value): boolean`；`normalizeThemeScope(value): 'planner'|'canvas'`，非法值回退 planner。
- `loadInitialAppearance(storageArea, hostname): Promise<Appearance>`；`loadAccountAppearance(storageArea, hostname, userId): Promise<Appearance>`；`saveThemeScope(storageArea, hostname, userId, scope): Promise<void>`，保存校验失败必须拒绝。
- Planner store 新增 `setThemeScope(scope)`，`loadPlanningState()` 返回顶层 `themeScope`。保留 `loadInitialTheme()` 的返回类型，内部复用 `loadInitialAppearance().theme`。
- `createThemeSettings({document,value,scope,onSave,onSaveScope})`；`onSaveScope(scope)` 返回权威 scope；控制器 `update(value,scope)`。现有 onSave 返回 Theme 不变。

- [x] **Step 1: 写失败测试。** `appearance.test.js` 的 `test('scope writes preserve account theme and settings', ...)` 及同组测试覆盖默认、非法回退、不改写损坏记录、独立键保存、域名/账号隔离、主题与范围取同一 hint 账号、无 hint 单账号旧主题迁移范围仍为 planner。使用现有 memoryStorage；核心断言：`assert.equal((await store.loadPlanningState()).themeScope,'planner')`，保存 canvas 后新 store 读回 canvas，另一个账号仍读 planner；保存前后的 theme/settings 用 `assert.deepEqual` 比较不变。
- [x] **Step 2: 验证失败。** 运行 `node --test test/appearance.test.js test/theme.test.js`；新接口缺失或范围断言失败。
- [x] **Step 3: 实现 appearance 存储接口和 store 包装。** 范围键严格为 `canvas-planner:<hostname>:<userId>:theme-scope:v1`；范围保存与 `appearance-account:v1` 在一个 storage.set 中写入，不能覆盖 theme/settings。外观读取只处理外观键，不进入任务数据流程。新增范围损坏提示及中英文翻译。
- [x] **Step 4: 写设置交互失败测试。** 在 `theme.test.js` 添加范围控件自动保存、失败回退、重置自定义颜色保留范围、中文标签、跨页新值胜过迟到保存响应、保留未保存规划草稿和 Settings 编辑字段。保存范围前后断言 Canvas 加载次数不变。
- [x] **Step 5: 验证交互测试失败。** 运行 `node --test test/theme.test.js`，要求新范围控件测试因控件缺失失败。
- [x] **Step 6: 接入控件。** 标签、选项使用规格第 2 节文案；英文帮助文字为 `Global themes adjust the Canvas interface; course, event, and content colors stay unchanged.`。范围保存等待 refreshLocal 后返回 `planningState.themeScope`；账号失效时清除旧 editor。忙碌时禁止主题和范围互相覆盖。
- [x] **Step 7: 验证通过。** 运行 `node --test test/appearance.test.js test/theme.test.js test/storage.test.js test/settings-view.test.js`，要求全部通过。
- [x] **Step 8: 保存任务差异。** 审阅本任务补丁，按差异暂存并提交 `feat: add independent Canvas theme scope setting`。

### Task 2: 可撤销的原生页面主题适配

**Files:** Create `src/global-theme.js`, `test/global-theme.test.js`, `test/fixtures/canvas-theme.html`; modify `src/themes.js`, `src/native-calendar.js`, `test/native-calendar.test.js`.

**Interfaces:**
- 从 themes.js 导出 `readableColor(color,background,minimum=4.5): string`，复用现有 readable 算法，原 themePalette 行为保持一致。
- `canvasThemePalette(theme,systemDark=false): {scheme,variables}`，继承 themePalette 并补充 `text-on-bg`, `text-on-surface`, `muted-on-bg`, `muted-on-surface`, `link-on-bg`, `link-on-surface`, `focus-on-bg`, `focus-on-surface`, `control-border`；分别针对其背景修正对比度。
- `globalThemeCss(theme,systemDark=false): string`；`createGlobalTheme({document}): {apply(appearance,systemDark=false),destroy()}`。仅 scope=canvas 注入；planner 和 destroy 撤销。
- 专属根标记 `data-canvas-planning-theme`，值为规范化的 theme.preset；专属 style ID `canvas-planning-global-theme-style`。原生完成标记使用 `--cp-native-completed-*`，未启用全局时 fallback 为当前原值。

- [x] **Step 1: 写失败测试。** 建立来自实际 Canvas DOM 的代表性 fixture，覆盖 body/header/content/right-side/calendar、课程色块、事件、状态、富文本、表格、按钮、输入、菜单、对话框、图表、图片和框架。测试普通组件变化与受保护组件 computed style 保持；保护区域内放入同名普通组件类。保存开关前颜色，开启后 `assert.deepEqual(afterProtected,beforeProtected)`，撤销后普通组件恢复。
- [x] **Step 2: 验证失败。** 运行 `node --test test/global-theme.test.js`；缺少 global-theme 模块或适配断言失败。
- [x] **Step 3: 实现 palette 与组件 CSS。** 先只读核对真实原生 DOM 的组件边界，再将 fixture 与选择器对应。使用专属根标记限制规则；中性组件明确排除富文本、色标、状态、事件与媒体区域。保留事件浅色卡片以及富文本原始浅色表面/文字配对，不重写其后代显式颜色；不在根部覆盖会向保护区域继承的 Canvas 品牌变量。确保悬停、选中、禁用及焦点配色对应各自表面。
- [x] **Step 4: 增加边界测试。** `test('global palette keeps extreme custom colors readable', ...)` 对各 preset 和极端合法 custom 组合断言 `assert.ok(contrastRatio(variables['text-on-bg'],variables.bg)>=4.5)`，以及表面正文/链接 ≥4.5、焦点/必要边界 ≥3；非法 CSS 色值不能进入生成样式。测试 apply 多次只有一个 style、Canvas 自己的 class/inline style 不受损、destroy 幂等、事件原色保留。完成标记测试断言开关主题前后原事件颜色不变。如 jsdom 无法计算某个 CSS 属性，在任务 5 使用浏览器计算验证，不能用 CSS 字符串包含断言冒充颜色验证。
- [x] **Step 5: 验证边界测试。** 运行 `node --test test/global-theme.test.js test/native-calendar.test.js`，记录新增测试的真实失败；实现缺失或颜色不达标必须先失败再修复。
- [x] **Step 6: 修正边界与完成标记。** 将完成标记固定颜色改为带原值 fallback 的专属变量；根据失败的边界测试修正 palette/保护选择器。
- [x] **Step 7: 验证通过。** 运行 `node --test test/global-theme.test.js test/native-calendar.test.js test/theme.test.js`，要求全部通过。
- [x] **Step 8: 保存任务差异。** 提交本任务补丁 `feat: adapt Canvas interface to saved themes`。

### Task 3: 首帧恢复、账号核验与跨页生命周期

**Files:** Modify `src/appearance.js`, `test/appearance.test.js`; create `src/appearance-controller.js`, `test/appearance-controller.test.js`.

**Interfaces:**
- appearance.js 增加 `readAppearanceCache(cacheStorage): Appearance|null`、`writeAppearanceCache(cacheStorage,appearance): boolean`、`isCanvasThemePage(pathname): boolean`；缓存键固定 `canvas-planner:appearance-bootstrap:v1`，JSON 为 `{schemaVersion:1,theme,scope}`。校验 schema、完整 Theme 和 scope，读取或写入失败不抛给产品流程。
- `mountAppearance({document,storageArea,cacheStorage,subscribeStorage,loadProfile}): {destroy()}`，同步执行缓存恢复，异步执行 Chrome 核对。
- `subscribeStorage(listener(changes,area)): unsubscribe`；`loadProfile(): Promise<{id:string|number}>`。控制器自己过滤域名/账号外观键；系统方案与定时器使用 document.defaultView，可在测试中替换。
- 显示保护使用专属 `data-canvas-planning-appearance-pending` 根标记及独立 style，不借用全局 theme style；释放后两者均移除。

- [x] **Step 1: 写失败测试。** `test('cached dark canvas appearance mounts synchronously', ...)`：缓存含有效 dark/canvas，挂起 Chrome get 与 loadProfile；调用 mount 后立即 `assert.equal(document.documentElement.getAttribute('data-canvas-planning-theme'),'dark')`，检查深色页面背景和保护标记缺失，不等待任何 Promise。缓存 absent/corrupt 时断言保护启用，本地结果返回后先主题后释放；固定测试时钟检查 249ms 仍等待读取、250ms 释放，destroy 后无残余隐藏。
- [x] **Step 2: 验证失败。** 运行 `node --test test/appearance.test.js test/appearance-controller.test.js`；缺少缓存/controller 接口或时序断言失败。
- [x] **Step 3: 实现缓存与启动控制器。** 按规格启动顺序实现；短期 MutationObserver 仅等待 documentElement，根迟到不能重启已过期的 250ms 保护。有效缓存不设显示等待；无缓存保护必须有独立超时和 catch/finally 释放。恢复只使用已校验结构生成 CSS，不接受缓存 CSS；缓存写失败不影响 Chrome 设置。Chrome 读取和账号请求使用独立代次，旧结果不能覆盖新状态。
- [x] **Step 4: 写同步与故障失败测试。** Chrome 本账号外观变化同步；其他账号变化不得覆盖已核验账号；storage 缓存事件仅触发 Chrome 核对，不将页面写入值视为权威。覆盖账号切换、读取/保存响应乱序、hint 更新循环、系统方案变化、BFCache pageshow、pagehide.persisted 保留、真正销毁清理、localStorage 抛错、缓存删除、根迟到、profile 非数字/失败和无外观账号默认 planner。
- [x] **Step 5: 验证生命周期测试失败。** 运行 `node --test test/appearance-controller.test.js`，新增未实现的同步/销毁行为测试必须失败。
- [x] **Step 6: 完成生命周期。** 仅订阅 appearance keys；账号核验成功后按核验 ID 读取，记住账号 hint；visibility/focus 或 BFCache 恢复时重新核验，避免永久保留上个账号。system 仅在选中该 preset 时响应；同步写缓存前比较值避免循环。销毁撤销 style/保护、解除监听、清理计时器并废弃未完成响应。
- [x] **Step 7: 验证通过。** 运行 `node --test test/appearance.test.js test/appearance-controller.test.js test/global-theme.test.js`，要求全部通过。
- [x] **Step 8: 保存任务差异。** 提交本任务补丁 `fix: restore Canvas appearance before first paint`。

### Task 4: 接入早期入口并构建扩展

**Files:** Create `src/appearance-entry.js`, `test/appearance-entry.test.js`; modify `manifest.json`, `scripts/build.mjs`.

**Interfaces:** appearance-entry 无导出；使用任务 3 的 mountAppearance，Chrome storage.local/onChanged 适配器和只读 profile fetch。构建新增 `appearance: 'src/appearance-entry.js'`，产物 `dist/appearance.js`。

- [x] **Step 1: 写失败测试。** `test('appearance entry runs before Canvas content', ...)`：检查源 manifest 的 appearance.js 匹配全站，`assert.equal(entry.run_at,'document_start')`，默认隔离世界、all_frames=false；验证 calendar 的两个既有入口仍仅 calendar*，权限列表不增加。启动模拟环境测试排除路径、子框架不挂载，profile 请求保持同源 credentials/include 与 JSON 校验，销毁解绑 storage handler。
- [x] **Step 2: 验证失败。** 运行 `node --test test/appearance-entry.test.js`；manifest 缺少 appearance entry。
- [x] **Step 3: 接入 manifest 与构建。** appearance.js 放在单独顶层 document_start 项；排除路径既在 manifest 合法 exclude_matches 中表达，也由 isCanvasThemePage 防守。保留 calendar idle 入口，不将规划加载器带入全站入口。排除页和子框架不访问 cache/profile。
- [x] **Step 4: 验证构建。** 运行 `node --test test/appearance-entry.test.js` 和 `npm run build`；检查 dist manifest/appearance.js 存在、脚本顺序正确、无新权限，所有步骤退出码 0。
- [x] **Step 5: 保存任务差异。** 提交 `feat: initialize Canvas theme on document start`；已有 manifest/build 并行差异保留，禁止一起打包提交。

### Task 5: 浏览器验收、文档与最终审阅

**Files:** Modify `README.md`; create `docs/superpowers/reviews/2026-09-30-canvas-global-theme.md` and screenshot artifacts under the same reviews directory；如发现问题，修改所属任务文件并重跑相关验证。

**Interfaces:** 使用打包扩展和前四任务公开行为；不新增运行时接口或产品依赖。浏览器操作通过可用 CUA，测试样例不包含真实个人任务内容。

- [x] **Step 1: 运行完整自动化验证。** `npm test`、`npm run build` 均成功；记录实际测试数及结果。失败按问题所属任务修复，相关测试通过后再全量检查。
- [x] **Step 2: 验证真实 Canvas 页面。** 核对 Calendar Month/Week/Agenda、Dashboard、课程/Modules、Assignment、Grades 的可访问页面；比较保护元素启用前后 computed style，检查菜单/弹窗、悬停/禁用/选中、键盘焦点和窄屏。同时检查 rich content 中同名控件及极端 custom 配色，不改变 Canvas 数据。无访问权限的页面记录限制并使用代表 fixture 补验，不能宣称实页已通过。
- [x] **Step 3: 验证首次绘制。** dark/canvas 和深色 custom/canvas 下，录制新开页与刷新初期连续帧或绘制时序，Canvas 数据请求延迟时也检查首个可见内容帧为已保存主题；明确证据时点。可用 CUA 无法捕获首帧时，用受控浏览器 fixture 记录 requestAnimationFrame 内背景和保护释放时序，并将实际扩展首帧录像验证仍未完成的限制如实记录，不用加载完成截图替代。检查 system、范围撤销、跨页同步和规划 Tab 关闭后保持主题。
- [x] **Step 4: 更新交付文档。** README 说明范围默认、保护区域、启用方法及首次升级需重新加载扩展。review 文档记录页面覆盖、颜色比较、首帧证据、自动化结果及异常退回行为；保存设置、深色原生日历和保护颜色截图。
- [x] **Step 5: 完成审阅与修复。** 按所选执行方式使用独立审阅检查规格覆盖、账号竞争、首帧和撤销路径。审阅问题修复后重跑受影响验证；通过后提交本任务文档/补丁 `docs: verify Canvas global themes and refresh behavior`，交付真实完成状态。

## Self-Review / Execution Handoff

规格覆盖：第 1–2 节由任务 1/5 验证，第 3/6 节由任务 2/3/5，第 4 节由任务 4，第 5 节由任务 1/3，第 7 节由全部测试与任务 5。五项 Review Focus 均绑定失败测试或浏览器验收；接口名称、Theme/Appearance 结构及 scope 存储值在各任务间一致。

推荐 Native：我在当前会话按任务执行，最后独立审阅。五个任务按存储、样式、控制器、入口串联，集中执行更容易核对这些接口和现有未提交改动。另一选择是 Subagent-driven：每个任务交给新的实现代理和审阅代理，逐任务通过后继续，独立审阅更多但上下文成本更高。

状态：用户确认并选择直接执行；五个任务已实施，独立审阅的重要问题及实页发现的问题均已修复。各任务的提交步骤按执行记录延后，避免包含已有并行改动；真实首帧录像和有效窄屏覆盖的限制见验收记录。
