# Canvas Planning Calendar

适用于 `canvas.illinois.edu/calendar` 的 Chrome 扩展。点击扩展图标可打开独立的规划月视图；再次点击、按 Escape 或点右上角关闭，即可回到 Canvas 原日历。扩展不会改写原日历或向 Canvas 提交更改。

## 安装

需要 Node.js 18 或更新版本、Chrome，以及已登录的 Illinois Canvas 账号。

```bash
npm ci
npm run build
```

在 Chrome 打开 `chrome://extensions`，启用“开发者模式”，选择“加载已解压的扩展程序”，并选中本项目的 `dist` 文件夹。打开 [Illinois Canvas 日历](https://canvas.illinois.edu/calendar)，点击工具栏中的 **Canvas Planning Calendar** 图标。如果日历页在安装前已经打开，先刷新该页。修改源码后重新运行 `npm run build`，再到扩展页面点击刷新，并刷新日历页。

## 使用

- 活动按 Canvas 的真实开始和结束日期显示为跨日色条。
- 作业默认从 Canvas 开放日期显示到截止日期。没有开放日期时，先显示在截止日；点击作业色条，在详情里设置“Plan start date”即可形成规划区间。用户设置的开始日优先于 Canvas 开放日期，点“Use Canvas date”可清除本地设置。
- 在项目详情里勾选“Complete in this extension”可标记或取消完成。这只是个人规划状态，不代表在 Canvas 交了作业，也不会改变 Canvas Planner。
- 上月、下月、今天、刷新按钮位于顶部；项目过多的周可点“more”展开。点击详情中的链接可打开原始 Canvas 项目。

扩展通过当前登录会话**只读**地获取个人、活跃课程、小组和可见账号日历的数据。计划开始日和完成状态保存在 Chrome 的 `chrome.storage.local`，按 Canvas 用户账号隔离；扩展不把日历内容发送到第三方服务。当前页面关闭并重开规划视图时会保留浏览月份，刷新页面后则重新按 Canvas 日历 URL 定位。日期按 Canvas 用户时区展示，若 Canvas 未提供时区则使用浏览器时区。

## 验证与限制

运行 `npm test` 执行 API 分页、跨周日期、时区、账号隔离和界面交互测试；运行 `npm run build` 生成可加载的 Manifest V3 扩展。

Illinois Canvas 的日历需要校园登录。本项目的自动化测试使用官方 API 结构的样例数据；发布前仍需在已登录账号的真实日历页确认课程权限、日历内容和扩展按钮交互。未登录或 API 请求失败时，规划视图提供错误提示与重试，原生 Canvas 日历仍可直接使用。

若 Canvas 拒绝批次中的某个日历，扩展会拆分请求，继续加载可访问的内容，并列出未能加载的日历名称。若所有日历均被拒绝，则显示错误，不会把读取失败显示成空日历。账号日历接口同时兼容数组和 Illinois 使用的 `account_calendars` 包装格式。

首版只支持 Illinois Canvas，不显示无截止日的项目，也不跨设备同步本地标记。
