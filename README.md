<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/a7f9bf0b-d43c-4db5-9e97-8ef53ab8a8db

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## 版本记录

### 2026-04-03（精简版）

- Checker 页右下角分析按钮改为常驻：首次为 `差异分析`，分析后为 `重新分析`。
- 差异卡片交互优化：
  - 新增可编辑严重等级（小圆点交互）。
  - 去除删除图标与冗余小圆点。
  - 优化差异类型/详情文字颜色与悬浮可读性。
  - 图片标注颜色与严重等级颜色联动。
- 标注对齐优化（适配两图高度不一致）：
  - 引入双坐标模型 `rectDesign` / `rectBuild`，并增加双向映射与归一化。
  - 新增/编辑/加载差异时同步维护双侧标注区域，降低错位。
- Gemini 调用链路修复：
  - `gemini` 模型改为直连 Google API。
  - 增加模型路由归一化，避免误走 APIYI 分支。
  - 增强 Gemini 返回内容 JSON 解析容错与兜底处理。
  - 默认 Gemini 模型更新为 `gemini-3.1-flash-lite-preview`。
- Round 数据与体验修复：
  - 修复集合白名单，支持 `projects_<projectId>_rounds`。
  - 移除浏览器 `beforeunload` 重载拦截弹窗。
  - 修复切换 Round 时页面意外刷新（Vite watch 忽略 + 文件读写稳态化）。
  - 修复仅浏览 Round 也触发自动保存的问题（指纹口径统一）。
  - 修复 Round 卡片排序异常与 `Invalid Date` 展示问题。
- 开发运行改进：
  - 修复 `dev:opt` 脚本，避免出现 `data-opt/data` 嵌套拷贝导致的数据混乱。
