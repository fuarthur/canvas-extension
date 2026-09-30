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
- Canvas 中当前用户已完成的作业会自动显示为完成，详情标注“Completed in Canvas”；该状态只读。其他项目可在详情里勾选或取消“Complete in this extension”，本地标记不会改变 Canvas 的提交或 Planner 状态。
- “Settings”标签可选择要加载的日历，点击“Save and load”保存并立即生效。未选择的日历以后不会请求其活动或作业。首次使用默认沿用原生日历当前勾选的范围；保存后使用扩展自己的选择，各账号独立。
- 上月、下月、今天、刷新按钮位于顶部；项目过多的周可点“more”展开。点击详情中的链接可打开原始 Canvas 项目。

扩展通过当前登录会话**只读**地获取个人、活跃课程、小组和可见账号日历的数据。计划开始日、本地完成状态和日历选择保存在 Chrome 的 `chrome.storage.local`，按 Canvas 用户账号隔离；扩展不把日历内容发送到第三方服务。当前页面关闭并重开规划视图时会保留浏览月份，刷新页面后则重新按 Canvas 日历 URL 定位。日期按 Canvas 用户时区展示，若 Canvas 未提供时区则使用浏览器时区。

首次加载读取当前月份前后各六个月，以保留跨月规划区间；范围内切换月份直接使用已有数据。日历目录和无权限结果在当前页面内缓存五分钟，请求最多六个并发。刷新仍重新读取所选日历的活动和作业完成状态；若权限发生变化，可在 Settings 点击“Retry calendar access”立即重新检查。

## 验证与限制

运行 `npm test` 执行 API 分页、跨周日期、时区、账号隔离和界面交互测试；运行 `npm run build` 生成可加载的 Manifest V3 扩展。

Illinois Canvas 的日历需要校园登录。自动化测试覆盖 API 结构、筛选、缓存、当前用户完成状态及界面交互，并已在已登录的 Chrome 日历页验证配置保存、月份切换和 Canvas 完成状态。未登录或 API 请求失败时，规划视图提供错误提示与重试，原生 Canvas 日历仍可直接使用。

若 Canvas 拒绝批次中的某个日历，扩展会拆分请求，继续加载可访问的内容，并列出未能加载的日历名称。若所有所选日历均被拒绝，则显示错误，仍可进入 Settings 更换选择；主动取消全部选择则显示空视图。账号日历接口同时兼容数组和 Illinois 使用的 `account_calendars` 包装格式。

首版只支持 Illinois Canvas，不显示无截止日的项目，也不跨设备同步本地标记。
