// Only extension-owned text is registered here. Canvas titles and user names
// are rendered as literal text; switching language never changes their values.
const languages = new WeakMap();
const messages = new WeakMap();
export const validLanguage = value => value === 'en' || value === 'zh-CN';
export const getLanguage = document => languages.get(document) || 'en';
export const intlLocale = (document, english = 'en-US') => getLanguage(document) === 'zh-CN' ? 'zh-CN' : english;
export function setLanguage(document, value) { languages.set(document, validLanguage(value) ? value : 'en'); }

const zh = {
  'Work block added to your draft. Adjust it here or remove the block.':'已添加到计划草稿，可在此调整时间或移除该分段。',
  'Updating Canvas calendar… Showing cached data.':'正在更新 Canvas 日历… 已显示缓存数据。',
  'Earlier deadlines':'过去的截止日期',
  'Task list':'任务清单', 'Task list view':'任务清单视图', 'Task agenda':'任务总览', 'All tasks':'全部任务', 'Overdue H/W':'逾期作业', 'View overdue homework':'查看逾期作业',
  'Today tasks':'今日任务', 'Next 7 days':'未来七天', 'Completed tasks':'已完成任务', 'Completed':'已完成', 'Search all tasks':'搜索全部任务',
  'Task type':'任务类型', 'All types':'全部类型', 'Homework':'作业', 'Calendar activities':'日历活动', 'Completion':'完成状态', 'All statuses':'全部状态',
  'Sort':'排序', 'Grouping':'分组', 'No grouping':'不分组', 'By date':'按日期', 'By course':'按课程', 'By type':'按类型',
  'Tasks course':'任务所属课程', 'Tasks type':'任务类型', 'Tasks completion':'任务完成状态', 'Tasks sort':'任务排序', 'Tasks grouping':'任务分组',
  'Planned finish: earliest first':'计划完成时间：最早优先', 'Planned finish: latest first':'计划完成时间：最晚优先', 'Title: A–Z':'标题：升序', 'Title: Z–A':'标题：降序',
  'Reset task filters':'重置任务筛选', 'Reset filters':'重置筛选', 'Show historical tasks':'显示历史任务', 'Hide historical tasks':'隐藏历史任务', 'View history':'查看历史', 'Hide history':'隐藏历史',
  'Tasks include selected calendars within this loaded range. Assignments without a Canvas deadline are not included.':'显示所选日历在已加载范围内的任务；不包含 Canvas 中没有截止日期的作业。',
  'Tasks range start':'任务范围开始日期', 'Tasks range end':'任务范围结束日期', 'Load task date range':'加载任务日期范围', 'Load range':'加载范围',
  'Select all filtered tasks':'全选当前筛选结果', 'Select all filtered results':'全选当前筛选结果', 'Clear task selection':'清空任务选择', 'Clear selection':'清空选择',
  'Complete selected tasks':'完成所选任务', 'Reopen selected tasks':'取消所选任务的本地完成标记', 'Mark as complete':'标记为完成', 'Reopen':'取消本地完成',
  'Bulk estimate minutes':'批量预计耗时（分钟）', 'Set selected estimates':'设置所选任务的预计耗时', 'Reset selected estimates':'恢复所选任务的自动估时', 'Set effort':'设置耗时',
  'Planned finish date':'计划完成日期', 'Planned finish time':'计划完成时刻', 'Finish time (optional)':'完成时刻（可选）', 'Bulk finish date':'批量计划完成日期', 'Bulk finish time':'批量计划完成时刻',
  'Set selected planned finish':'设置所选任务的计划完成时间', 'Clear selected planned finish':'清除所选任务的计划完成时间', 'Set planned finish':'设置计划完成时间',
  'Save planned finish':'保存计划完成时间', 'Clear planned finish':'清除计划完成时间', 'Planned finish':'计划完成时间',
  'Planned finish is your personal target; it does not change the Canvas deadline or schedule work blocks.':'计划完成时间是你的个人目标；不会修改 Canvas 截止时间或自动安排工作分段。',
  'Target is after the deadline':'计划完成时间晚于截止时间', 'Deadline':'截止时间', 'Activity starts':'活动开始时间', 'Historical task':'历史任务', 'Earlier activities':'过去的活动', 'Later':'以后',
  'No tasks match your filters.':'没有符合筛选条件的任务。', 'Canvas completion is read-only.':'Canvas 完成状态只读。', 'Task changes saved.':'任务修改已保存。',
  'Undo task changes':'撤销任务修改', 'Undo':'撤销', 'Task changes undone.':'任务修改已撤销。', 'Undo finished; newer edits were kept.':'已撤销；后续的新修改已保留。',
  'Choose a valid planned finish date and time.':'请选择有效的计划完成日期和时刻。', 'Choose a valid date range.':'请选择有效的日期范围。',
  'Historical homework':'历史作业', 'History filter':'历史作业过滤', 'Historical homework mode':'历史作业处理方式', 'Current semester':'当前学期', 'Older than X months':'早于 X 个月',
  'Show all history':'显示全部历史', 'Months':'月数', 'Ignore overdue older than months':'忽略几个月前的逾期作业', 'Choose a history mode and 1–24 months.':'请选择历史过滤方式及 1–24 的整数月数。',
  'Hide expired homework before the current semester: January–May, June–July, or August–December. You can view hidden tasks in the task list.':'隐藏当前学期之前已过期的作业：1–5 月、6–7 月或 8–12 月为一个区间。可在任务清单中查看隐藏项。',
  'Select valid tasks.':'请选择有效任务。', 'Invalid task change.':'任务修改无效。', 'Invalid completion state.':'完成状态无效。',
  'Planning':'规划', 'Planning calendar':'规划日历', 'Planning calendar view':'规划日历视图',
  'Calendar':'日历', 'Workload':'工作量', 'Planner':'计划', 'Settings':'设置',
  'Workload view':'工作量视图', 'Planner view':'计划视图', 'Calendar settings':'日历与设置', 'Planner views':'规划视图',
  'Canvas completion and your own planning marks':'Canvas 完成状态与个人规划标记',
  'Previous month':'上个月', 'Next month':'下个月', 'Today':'今天', 'Tomorrow':'明天',
  'Refresh':'刷新', 'Refresh calendar':'刷新日历', 'Close planning calendar':'关闭规划日历', 'Open planning calendar':'打开规划日历',
  'Loading Canvas calendar…':'正在加载 Canvas 日历…', 'Could not load Canvas calendar.':'无法加载 Canvas 日历。',
  'Choose calendars':'选择日历', 'Only selected calendars will be loaded. Your selection is saved for this Canvas account.':'只加载选中的日历；选择会保存在当前 Canvas 账号中。',
  'Select all':'全选', 'Select none':'全不选', 'Select all calendars':'选择全部日历', 'Deselect all calendars':'取消选择全部日历',
  'Remove unavailable':'移除无法访问的日历', 'Deselect unavailable calendars':'取消选择无法访问的日历',
  'Personal':'个人', 'Course':'课程', 'Group':'小组', 'Account':'账号', 'Save and load':'保存并加载',
  'Save calendar selection':'保存日历选择', 'Retry unavailable calendars':'重试无法访问的日历', 'Retry calendar access':'重新检查日历权限',
  'Retry':'重试', 'Retry loading':'重新加载', 'Saving…':'正在保存…',
  'Could not save your calendar selection. Please try again.':'无法保存日历选择，请重试。',
  'No calendars selected. Choose calendars in Settings.':'尚未选择日历，请在设置中选择。',
  'Item details':'任务详情', 'Close details':'关闭详情', 'Starts':'开始', 'Ends':'结束', 'Plan start date':'计划开始日期',
  'Choose a valid date no later than the due date.':'请选择不晚于截止日的有效日期。',
  'Use Canvas start date':'使用 Canvas 开放日期', 'Use Canvas date':'使用 Canvas 日期',
  'No Canvas open date; choose when you plan to start.':'Canvas 未提供开放日期，请选择计划开始日期。',
  'Estimated effort (minutes)':'预计耗时（分钟）', 'Estimated effort minutes':'预计耗时（分钟）',
  'Use automatic estimate':'使用自动估时', 'Use rule / default':'使用规则或默认值',
  'Must finish in one session':'必须一次连续完成', 'Mark complete':'标记为完成', 'Completed in Canvas':'已在 Canvas 完成',
  'Complete in this extension':'在扩展中标记完成', 'Open in Canvas':'在 Canvas 中打开', 'Open in Canvas ↗':'在 Canvas 中打开 ↗',
  'Show fewer items':'收起部分任务', 'Show more items':'展开更多任务', 'Show less':'收起',
  'Could not save this change. Try again.':'无法保存此修改，请重试。', 'This change could not be saved.':'无法保存此修改。',
  'Plan storage is unavailable.':'计划存储暂时不可用。', 'Canvas account changed. Open the planner again.':'Canvas 账号已变化，请重新打开规划页面。',
  'Language / 语言':'Language / 语言', 'Interface language':'界面语言', 'Language saved.':'语言已保存。',
  'Could not save language. Please try again.':'无法保存语言设置，请重试。', 'Unsupported language.':'不支持此语言。',
  'Estimates & pressure':'估时与压力', 'Default estimate minutes':'默认预计耗时（分钟）',
  'Yellow pressure starts at':'黄色压力起始数量', 'Red pressure starts at':'红色压力起始数量',
  'Manual estimates override the first matching enabled rule, then the default. Saved plans keep their own estimates.':'优先使用手动估时，其次是第一条匹配的已启用规则，最后使用默认值。已保存计划保留自己的估时。',
  'Estimate rules':'估时规则', 'Enabled':'启用', 'Name':'名称', 'Match type':'匹配方式', 'Match':'匹配内容', 'Minutes':'分钟',
  'Title contains':'标题包含', 'Course / calendar is':'所属课程或日历', 'Course / calendar':'课程或日历',
  'Title':'标题', 'Add estimate rule':'添加估时规则', 'New rule':'新规则', 'Try a rule':'预览规则',
  'Preview title':'预览标题', 'Preview calendar':'预览课程或日历', 'Defaults for new plans':'新计划的默认设置',
  'Default plan days':'默认计划天数', 'Save planning settings':'保存规划设置', 'Planning settings saved.':'规划设置已保存。',
  'Could not save settings.':'无法保存设置。',
  'Daily capacity includes the actual time occupied by calendar events. Set capacity to 0 for a rest day.':'每日容量包含日历活动实际占用的时间。设为 0 即为休息日。',
  'Sun':'周日', 'Mon':'周一', 'Tue':'周二', 'Wed':'周三', 'Thu':'周四', 'Fri':'周五', 'Sat':'周六',
  'From':'开始', 'Until':'结束', 'Date overrides':'指定日期设置', 'Override date':'指定日期', 'Add date override':'添加日期设置',
  'Manual':'手动估时', 'Default':'默认估时', 'Delete':'删除', 'Remove':'移除',
  'Deadline workload':'截止日工作量', 'Assignments count on their deadline; calendar events count on their start date. Completed items are excluded.':'作业计入截止日，日历活动计入开始日；已完成项目不计入。',
  'Remaining':'剩余任务', 'Estimated work':'预计总耗时', 'Overdue':'已逾期', 'Tasks':'任务数量', 'Estimated hours':'预计小时数',
  'Show task count':'显示任务数量', 'Show estimated hours':'显示预计小时数', 'No remaining tasks on this date.':'当天没有未完成任务。',
  'Peak day · No remaining tasks this month.':'峰值日期 · 本月没有未完成任务。',
  'Daily task count':'每日任务数量', 'Daily estimated hours':'每日预计小时数', 'Date':'日期', 'View daily data':'查看每日数据', 'No data':'无数据',
  'New plan':'新建计划', 'Saved plans':'计划存档', 'Choose saved plan':'选择已保存计划', 'Save':'保存', 'Save plan':'保存计划',
  'Copy plan':'复制计划', 'Delete plan':'删除计划', 'Plan name':'计划名称', 'Unsaved changes':'尚未保存的修改', 'Saved plan':'已保存计划',
  'Plan dates, rest days & capacity':'计划日期、休息日与每日容量', 'Start date':'开始日期', 'End date':'结束日期', 'Plan start':'计划开始日期', 'Plan end':'计划结束日期',
  'Update plan task data':'更新计划任务数据', 'All tasks arranged · deadline checks passed':'所有任务已安排 · 截止检查通过',
  'Draft · some work is not arranged':'草稿 · 仍有任务未安排', 'Draft · constraints need attention':'草稿 · 部分约束需要处理',
  'Plan chart metric':'计划曲线指标', 'Planned remaining work':'已安排的剩余工作量',
  'Create a plan to organize your remaining tasks by day.':'新建计划，按天安排尚未完成的任务。',
  'Could not save your plan.':'无法保存计划。', 'Plan saved.':'计划已保存。',
  'Earlier changes saved. Your newer edits still need saving.':'此前的修改已保存，更新后的编辑仍需保存。',
  'Reload saved plan':'重新读取计划存档', 'Save plan as copy':'另存为计划副本',
  'This saved plan changed in another page. Reload it or save a copy.':'此计划已在其他页面修改，请重新读取或另存为副本。',
  'Compare saved plans (2–4)':'对比计划存档（2–4 份）', 'Unsaved plan':'未保存的计划',
  'Save your plan before leaving?':'离开前保存计划？', 'Save draft and continue':'保存草稿并继续', 'Discard draft changes':'放弃草稿修改',
  'Return to editing':'返回编辑', 'This removes only this saved plan.':'只会删除当前计划存档。', 'Confirm delete plan':'确认删除计划', 'Cancel delete plan':'取消删除计划',
  'Remaining tasks':'未完成任务', 'Search tasks':'搜索任务', 'Task course':'任务所属课程', 'Task sort':'任务排序', 'Task arrangement':'任务安排状态',
  'All courses / calendars':'全部课程或日历', 'Deadline: nearest first':'截止时间：最近优先', 'Deadline: latest first':'截止时间：最晚优先',
  'Estimate: shortest first':'预计耗时：最短优先', 'Estimate: longest first':'预计耗时：最长优先',
  'All remaining tasks':'全部未完成任务', 'Unscheduled':'尚未安排', 'Partially scheduled':'部分安排', 'Scheduled':'已安排',
  'Group by course':'按课程分组', 'Group tasks by course':'按课程分组', 'Fixed activity':'固定活动', 'Arrange':'安排', '✓ Complete':'✓ 完成',
  'No remaining tasks match your filters.':'没有符合筛选条件的未完成任务。', 'Your days':'每日安排',
  'Drop a task here or use Arrange in the task list.':'将任务拖到这里，或点击左栏任务的“安排”。',
  'Not currently loaded':'目前未加载', 'Edit':'编辑', 'Lock':'锁定', 'Unlock':'取消锁定',
  'Deadline conflict':'截止时间冲突', 'Tight deadline':'截止缓冲不足',
  'Generate balanced plan':'生成均衡计划', 'Generating…':'正在生成…', 'Cancel generation':'取消生成',
  'Checking deadlines and working windows…':'正在检查截止时间与工作窗口…',
  'Task data changed. Update plan task data before generating.':'任务数据已变化，请先更新计划任务数据再生成。',
  'Task estimates, completion or this plan changed during generation. Generate again.':'生成期间估时、完成状态或计划发生变化，请重新生成。',
  'Generation cancelled; your draft is unchanged.':'已取消生成，草稿保持不变。',
  'Generated plan preview':'生成的计划预览', 'Partial plan preview':'部分计划预览',
  'Calculation reached its time limit. You can retry; this is not a fully verified success.':'计算已达到时间上限，可重试。此结果未通过完整成功验证。',
  'Balancing reached its time limit. This schedule passed all checks; you can use it or retry to improve the balance.':'均衡优化已达到时间上限。当前安排已通过全部校验，可使用此结果，或重试以继续优化均衡程度。',
  'Generated remaining work':'生成的剩余工作量', 'Accept generated plan':'采用生成的计划',
  'This plan changed. Generate again.':'此计划已变化，请重新生成。',
  'The preview no longer fits current time or task data. Generate again.':'预览已不符合当前时间或任务数据，请重新生成。',
  'Generated work accepted into the draft. Save to keep it.':'生成的安排已写入草稿，保存后才会进入存档。',
  'Discard generated preview':'放弃生成预览', 'Discard preview':'放弃预览',
  'Arrange task':'安排任务', 'Work date':'工作日期', 'Work minutes':'工作分钟数', 'Work start time':'工作开始时间',
  'Choose a date and duration; the work must fit before the deadline.':'请选择日期和时长；工作必须在截止时间前完成。',
  'Minutes for this block':'本分段分钟数', 'Start time (optional)':'开始时间（可选）', 'Update work block':'更新工作分段', 'Add work block':'添加工作分段',
  'Keep as conflicting draft':'保留为存在冲突的草稿', 'Keep as conflicting draft — requires fixing':'保留为存在冲突的草稿 — 需要修正',
  'Cancel arranging task':'取消安排任务', 'Cancel':'取消', 'Compare plans':'对比计划', 'Comparison metric':'对比指标', 'Comparison mode':'对比模式',
  'Current remaining':'当前剩余工作', 'Saved arrangements':'保存时的安排',
  'A current deadline task is missing from this plan; include newly loaded tasks.':'此计划遗漏了当前的截止任务，请加入新加载的任务。',
  'An unfinished work block is already in the past.':'尚未完成的工作分段已在过去。', 'Assigned time exceeds the task estimate.':'分配时长超过任务估时。',
  'Calendar events retain their fixed time.':'日历活动保留固定的时间。', 'Choose a task and a whole-minute duration.':'请选择任务和整数分钟时长。',
  'Increase the task estimate before allocating more time.':'请先增加任务估时，再分配更多时间。',
  'No available work interval fits before the deadline on this date.':'当天没有能在截止前容纳此任务的可用工作区间。',
  'Planned work exceeds daily capacity.':'计划工作量超过每日容量。', 'Segment references a missing task.':'工作分段引用了不存在的任务。',
  'Task has no valid current deadline.':'任务没有有效的当前截止时间。', 'Task is not currently loaded; its deadline cannot be verified.':'任务目前未加载，无法验证截止时间。',
  'Task timing changed; update the plan task data before generating.':'任务时间已变化，请先更新计划任务数据再生成。',
  'This local time does not exist.':'此当地时间不存在。', 'This plan extends beyond loaded calendar data.':'计划范围超出已加载的日历数据。',
  'This task is already overdue.':'此任务已逾期。', 'This task must fit in one continuous work block.':'此任务必须安排在一个连续工作分段内。',
  'Work block IDs must be unique.':'工作分段标识不能重复。', 'Work blocks need valid whole-minute times.':'工作分段需要有效的整数分钟时间。',
  'Work blocks overlap.':'工作分段重叠。', 'Work ends after the current Canvas deadline.':'工作结束时间晚于当前 Canvas 截止时间。',
  'Work is before the Canvas open time.':'工作安排早于 Canvas 开放时间。', 'Work is before your chosen plan start.':'工作安排早于你选择的计划开始日期。',
  'Work overlaps a calendar activity or is outside available working time.':'工作与日历活动重叠，或超出可用工作时间。',
  'Invalid working windows or capacity.':'工作窗口或容量无效。',
  'Date overrides need valid dates and capacities.':'指定日期设置需要有效日期和容量。', 'Default estimate must be 1–1440 whole minutes.':'默认估时必须为 1–1440 的整数分钟。',
  'Estimate must be 1–1440 whole minutes.':'估时必须为 1–1440 的整数分钟。',
  'Each rule needs a unique ID, name, valid match and estimate.':'每条规则需要唯一标识、名称、有效匹配内容及估时。',
  'Each weekday needs a valid window and capacity.':'每个星期日期需要有效的工作窗口和容量。', 'Plan length must be 1–180 days.':'计划长度必须为 1–180 天。',
  'Pressure thresholds must increase from yellow to red.':'压力阈值必须满足黄色数量小于红色数量。', 'Rules must be a list.':'规则必须为列表。', 'Unsupported settings version.':'不支持此设置版本。',
  'Canvas event ends before it starts.':'Canvas 活动的结束时间早于开始时间。',
  'Canvas event has an invalid end date; showing its start date.':'Canvas 活动结束日期无效，暂时显示开始日期。',
  'Canvas event has an invalid start date; showing its end date.':'Canvas 活动开始日期无效，暂时显示结束日期。',
  'The saved plan start is invalid or after the due date.':'保存的计划开始日期无效，或晚于截止日期。',
  'Could not fit all estimated work before the deadline. Adjust capacity, dates or splitting.':'无法在截止前安排全部预计工作，请调整容量、日期或拆分方式。',
  'Saved planning settings are invalid; using defaults.':'保存的规划设置无效，已使用默认设置。',
  'Invalid plan request.':'计划请求无效。', 'Invalid plan record.':'计划记录无效。',
  'The saved record cannot be replaced; save a new copy.':'无法覆盖此存档，请另存为副本。',
  'This plan changed in another page. Reload it or save a copy.':'此计划已在其他页面修改，请重新读取或另存为副本。',
  'Could not save the plan. Your draft is still available.':'无法保存计划，草稿仍然保留。',
  'The extension background is unavailable. Reload the extension and try again.':'扩展后台不可用，请刷新扩展后重试。',
  'Extension background disconnected. Retry generation; your draft is unchanged.':'扩展后台连接已断开，请重试生成；草稿保持不变。',
  'The extension background is unavailable. Retry after reloading.':'扩展后台不可用，请刷新后重试。', 'Scheduling client is closed.':'排程连接已关闭。',
  'Invalid scheduling request.':'排程请求无效。', 'Scheduling stopped. Please retry; your draft was preserved.':'排程已停止，请重试；草稿已保留。',
  'Canvas returned a link outside its site.':'Canvas 返回了站外链接。', 'Canvas returned a sign-in page instead of calendar data.':'Canvas 返回了登录页面，请登录后重试。',
  'Canvas returned invalid JSON.':'Canvas 返回的数据无法解析。', 'Canvas pagination repeated a page.':'Canvas 分页重复返回了同一页。',
  'Canvas returned a list in an unexpected format.':'Canvas 返回的列表格式不符合预期。', 'Invalid calendar month.':'日历月份无效。',
  'Invalid planning date range.':'规划日期范围无效。', 'Canvas did not identify the signed-in user.':'Canvas 未能识别当前登录账号。',
  'Canvas denied access to all selected calendars. Choose other calendars in Settings or retry access.':'Canvas 拒绝访问全部选中日历，请在设置中选择其他日历或重试权限检查。',
  'Invalid month':'月份无效', 'Invalid day or offset':'日期或偏移值无效', 'Invalid date range':'日期范围无效', 'Unknown plan change.':'无法识别此计划修改。',
  'Failed to fetch':'网络请求失败', 'Storage unavailable':'存储暂时不可用', 'Storage is full':'存储空间已满',
  'Choose a valid range and working capacities.':'请选择有效的日期范围和工作容量。',
  'Choose a valid plan range of 1–180 days.':'请选择 1–180 天的有效计划范围。', 'Duplicate segment.':'工作分段重复。'
};

const templates = {
  '{count} selected · {duration}':'已选 {count} 项 · {duration}',
  '{count} historical tasks · before {day}':'历史任务 {count} 项 · 截止早于 {day}',
  'Loaded range · {start} – {end}':'已加载范围 · {start} 至 {end}',
  'Select task {id}':'选择任务 {id}',
  'Open {title} in {contexts}':'打开 {contexts} 中的 {title}', 'Open {title}':'打开 {title}',
  'Load {name}':'加载 {name}', 'Compare {name}':'对比 {name}', 'Arrange {title}':'安排 {title}', 'Complete {title}':'完成 {title}',
  'View remaining tasks for {day}':'查看 {day} 的未完成任务', 'Tasks for {day}':'{day} 的任务', 'View {day}':'查看 {day}',
  'Today · {count} remaining · {overdue} overdue':'今天 · 剩余 {count} 项 · 逾期 {overdue} 项',
  '{count} tasks':'{count} 项任务', '{count} min':'{count} 分钟', '{count}h':'{count}小时', '{hours}h {minutes}m':'{hours}小时 {minutes}分钟',
  '{count} remaining · {minutes} min':'剩余 {count} 项 · {minutes} 分钟', '+{count} more':'+{count} 项',
  'Peak day · {day}':'峰值日期 · {day}', 'Rule: {name}':'规则：{name}',
  '{minutes} min · {estimateLabel}':'{minutes} 分钟 · {estimateLabel}',
  '{dayName} work start':'{dayName} 工作开始时间', '{dayName} work end':'{dayName} 工作结束时间', '{dayName} capacity minutes':'{dayName} 容量（分钟）',
  'Remove override {day}':'移除 {day} 的日期设置',
  'Rule {n} enabled':'启用规则 {n}', 'Rule {n} name':'规则 {n} 名称', 'Rule {n} type':'规则 {n} 匹配方式',
  'Rule {n} match':'规则 {n} 匹配内容', 'Rule {n} minutes':'规则 {n} 分钟数',
  'Move Rule {n} up':'上移规则 {n}', 'Move Rule {n} down':'下移规则 {n}', 'Delete Rule {n}':'删除规则 {n}',
  '{count} tasks changed since this plan was saved.':'保存后有 {count} 项任务数据发生变化。',
  '{duration} unassigned':'尚未安排 {duration}', '{count} checks to review':'{count} 项检查需要处理',
  'Delete “{name}”?':'删除“{name}”？',
  '{duration} · Fixed activity':'{duration} · 固定活动', '{assigned}/{estimate} min arranged':'已安排 {assigned}/{estimate} 分钟',
  '{duration} · {assigned}/{estimate} min arranged':'{duration} · 已安排 {assigned}/{estimate} 分钟',
  '{count} future tasks fall after this plan range; use Arrange to include one.':'{count} 项未来任务的截止日超出计划范围；可点击“安排”加入。',
  '{dayLabel} · {day} · {count} tasks · {duration}':'{dayLabel} · {day} · {count} 项任务 · {duration}',
  '{start}–{end} · {duration} / {estimateDuration}':'{start}–{end} · {duration} / {estimateDuration}',
  '{title} · Fixed activity':'{title} · 固定活动',
  'Edit block {id}':'编辑分段 {id}', 'Remove block {id}':'移除分段 {id}', 'Lock block {id}':'切换分段 {id} 锁定状态', 'Move block {id} up':'上移分段 {id}',
  'Due in {hours}h':'{hours} 小时内到期', 'Due in {days}d':'{days} 天内到期',
  'Balancing · peak {duration}':'正在均衡 · 峰值 {duration}', 'Arranging {day}':'正在安排 {day}',
  'Peak {before} → {after}. Accepting changes the draft; Save keeps the archive.':'峰值 {before} → {after}。采用结果只修改草稿，保存后才进入存档。',
  ' ({minutes} min missing)':'（缺少 {minutes} 分钟）',
  'Suggested {time} · {minutes} min':'建议 {time} · {minutes} 分钟',
  '{duration} total · {peak} peak':'总计 {duration} · 峰值 {peak}',
  '{duration} unassigned · {count} deadline conflicts · {unknown} unavailable tasks':'尚未安排 {duration} · {count} 项截止冲突 · {unknown} 项任务未加载',
  'Working time does not exist on {day}.':'{day} 的工作时间不存在。',
  'Saved plan {id} cannot be read; its record was preserved.':'无法读取计划存档 {id}；原始记录已保留。',
  'Canvas rejected {endpoint} (401). Please sign in and try again.':'Canvas 拒绝了 {endpoint}（401），请登录后重试。',
  'Canvas denied access to {endpoint} (403).':'Canvas 拒绝访问 {endpoint}（403）。',
  'Canvas request failed ({status}).':'Canvas 请求失败（{status}）。',
  'Some calendar data could not be loaded because Canvas denied access: {names}.':'Canvas 拒绝访问部分日历，未能加载：{names}。',
  '{message} Showing your last loaded data; refresh to verify current deadlines.':'{message} 正在显示上次加载的数据，请刷新以验证当前截止时间。',
  '{kind} · Canvas denied access':'{kind} · Canvas 拒绝访问',
  '{message} Could not read local planning data: {detail}':'{message} 无法读取本地规划数据：{detail}'
};
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const compiled = Object.entries(templates).map(([source, target]) => {
  const keys = []; let pattern = '^'; let cursor = 0;
  for (const match of source.matchAll(/\{(\w+)\}/g)) {
    const key=match[1];
    const numeric=['n','count','minutes','hours','days','assigned','estimate','overdue','unknown','status'].includes(key);
    const duration=['duration','estimateDuration','peak','before','after'].includes(key);
    pattern += escape(source.slice(cursor, match.index)) + (numeric?'(\\d+(?:\\.\\d+)?)':duration?'(\\d+h(?: \\d+m)?|\\d+(?:\\.\\d+)? min)':'(.*?)'); keys.push(key); cursor = match.index + match[0].length;
  }
  return {regex:new RegExp(pattern + escape(source.slice(cursor)) + '$', 's'), keys, target};
});
const localValues = new Set(['duration','estimateDuration','peak','before','after','dayName','dayLabel','estimateLabel','kind','message']);
export function translate(document, source) {
  if (Array.isArray(source)) return source.map(value => translate(document, value)).join(' ');
  if (source && typeof source === 'object' && typeof source.key === 'string') {
    const template = getLanguage(document) === 'zh-CN' ? (templates[source.key] || zh[source.key] || source.key) : source.key;
    return template.replace(/\{(\w+)\}/g, (_, key) => String(source.values[key] ?? ''));
  }
  if (source == null || getLanguage(document) !== 'zh-CN') return source;
  const value = String(source);
  if (Object.hasOwn(zh, value)) return zh[value];
  for (const {regex, keys, target} of compiled) {
    const match = value.match(regex); if (!match) continue;
    const values = Object.fromEntries(keys.map((key, i) => [key, localValues.has(key) ? translate(document, match[i+1]) : match[i+1]]));
    return target.replace(/\{(\w+)\}/g, (_, key) => values[key]);
  }
  return source;
}
export function setText(node, source, literal = false) {
  const text = node.ownerDocument.createTextNode(String((literal ? source : translate(node.ownerDocument, source)) ?? ''));
  node.replaceChildren(text);
  messages.set(node, {...messages.get(node), text, source, literal});
}
export function setLabel(node, source) {
  node.setAttribute('aria-label', translate(node.ownerDocument, source));
  messages.set(node, {...messages.get(node), label:source});
}
export function localizeTree(root) {
  for (const node of [root, ...root.querySelectorAll('*')]) {
    const message = messages.get(node); if (!message) continue;
    if (message.text && message.text.parentNode === node) message.text.data = String((message.literal ? message.source : translate(node.ownerDocument, message.source)) ?? '');
    if (message.label != null) node.setAttribute('aria-label', translate(node.ownerDocument, message.label));
  }
}
