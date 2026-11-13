# AIDA 偏好设置（明暗模式 / 语言）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 AIDA 增加三态主题（跟随系统/浅色/深色）与全站中英双语，桌面控件固定在左侧栏底部、移动端收纳到头部菜单，与「设置」入口并列。

**Architecture:** 新增 `i18n.ts`（中文原文为 key 的英文字典 + `translate()`）与 `preferences.tsx`（全局 Provider，管理 theme/language、写 localStorage、同步 `<html>` 的 dark class 与 lang）。各页面改用 `usePreferences()` 取主题与 `t()`。偏好控件拆为独立组件挂到侧栏底部与移动端头部。

**Tech Stack:** React 19 + TypeScript + Vite 6 + Tailwind 4 + lucide-react + motion；Vitest（纯逻辑单测）+ Chrome DevTools MCP（浏览器 E2E）。

**Spec:** `docs/superpowers/specs/2026-11-10-preferences-i18n-design.md`

## Global Constraints

- 语言范围：全站中英双语（Dashboard / Checker / 模型设置 / 表单 / 分析栏 / 差异列表 / 错误页），含按钮、占位符、toast、`aria-label`、`title`、页面标题。
- 主题三态：`system | light | dark`，沿用现有 `localStorage.theme` 键与系统主题监听。
- 语言键：`localStorage['aida:language']`，默认 `zh`；`<html lang>` 同步为 `zh-CN` / `en-US`。
- 不引入 i18next 或任何新依赖。
- 不翻译：项目名/分类名/成员名等用户数据、AI 产出、服务端返回的错误原文、**App.tsx 的 AI 分析 prompt（`const prompt = \`…\`` 模板串，当前约 957–983 行，以内容「你是一位细致入微的 UI/UX QA 工程师…」定位；行号会随编辑漂移）**。该 prompt 保持中文不变。注意：932 行附近的 `通过代理获取图片失败：${e.message}` 是 UI toast，**要翻译**。
- 语言选项显示母语名：`简体中文` / `English`（常量，不走字典）。
- 英文缺失翻译时回退中文原文。
- 偏好仅存浏览器，不同步服务端。
- **本目录不是 git 仓库**：跳过所有 `git commit` 步骤；每个任务以 `npm run lint && npm test` 作为检查点。
- 文案拼接一律改为整句模板 + `{var}` 插值（见附录 B 转换表）。
- 所有 `toLocale*` 传入 `locale`（`zh-CN` / `en-US`）。

## File Structure

- Create `src/lib/i18n.ts` — `Language`、`normalizeLanguage`、`localeOf`、`enMessages`、`translate`。
- Create `src/lib/preferences.tsx` — `Theme`、`normalizeTheme`、`PreferencesProvider`、`usePreferences`。
- Create `src/components/preferences/PopoverMenu.tsx` — 通用向上弹出菜单（外部点击/Escape 关闭）。
- Create `src/components/preferences/ThemeMenu.tsx` — 外观行 + 三选项。
- Create `src/components/preferences/LanguageMenu.tsx` — 语言行 + 两选项。
- Create `src/components/preferences/MobilePreferencesMenu.tsx` — 移动端头部触发 + 面板。
- Create `tests/i18n.test.ts`、`tests/preferences.test.ts`。
- Modify `src/main.tsx`、`src/App.tsx`、`src/components/ErrorBoundary.tsx`、`src/pages/ProjectManagement.tsx`、`src/pages/ModelSettings.tsx`、`src/components/AiModelForm.tsx`、`src/components/AnalyzeActionBar.tsx`、`src/components/DifferenceListItemV2.tsx`。
- Modify `README.md`（偏好/语言说明）。

---

### Task 1: i18n 核心与英文字典（TDD）

**Files:**
- Create: `src/lib/i18n.ts`
- Test: `tests/i18n.test.ts`

**Interfaces:**
- Produces:
  - `type Language = 'zh' | 'en'`
  - `normalizeLanguage(raw: string | null | undefined): Language`
  - `localeOf(language: Language): string`（`zh-CN` / `en-US`）
  - `translate(language: Language, text: string, vars?: Record<string, string | number>): string`
  - `enMessages: Record<string, string>`

- [ ] **Step 1: 写失败测试** `tests/i18n.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { translate, localeOf, normalizeLanguage, enMessages } from '../src/lib/i18n';

describe('normalizeLanguage', () => {
  it('accepts en', () => expect(normalizeLanguage('en')).toBe('en'));
  it('defaults unknown/empty to zh', () => {
    expect(normalizeLanguage('zh')).toBe('zh');
    expect(normalizeLanguage('fr')).toBe('zh');
    expect(normalizeLanguage(null)).toBe('zh');
    expect(normalizeLanguage(undefined)).toBe('zh');
  });
});

describe('localeOf', () => {
  it('maps languages to BCP-47 locales', () => {
    expect(localeOf('zh')).toBe('zh-CN');
    expect(localeOf('en')).toBe('en-US');
  });
});

describe('translate', () => {
  it('returns source text unchanged for zh', () => {
    expect(translate('zh', '保存')).toBe('保存');
  });
  it('returns the English dictionary value for en', () => {
    expect(translate('en', '保存')).toBe('Save');
  });
  it('falls back to source when a key is missing', () => {
    expect(translate('en', '一个不存在的文案')).toBe('一个不存在的文案');
  });
  it('interpolates {var} placeholders', () => {
    expect(translate('en', '第 {n} 轮', { n: 3 })).toBe('Round 3');
    expect(translate('zh', '已移动到「{name}」', { name: '设计' })).toBe('已移动到「设计」');
  });
  it('keeps placeholders whose var is missing', () => {
    expect(translate('en', '第 {n} 轮', {})).toBe('Round {n}');
  });
  it('has no empty English values', () => {
    for (const [k, v] of Object.entries(enMessages)) {
      expect(v.trim(), `empty value for ${k}`).not.toBe('');
    }
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/i18n.test.ts`
Expected: FAIL（`../src/lib/i18n` 不存在 / 导出未定义）。

- [ ] **Step 3: 实现 `src/lib/i18n.ts`**

```ts
export type Language = 'zh' | 'en';

export const LANGUAGE_STORAGE_KEY = 'aida:language';

export const normalizeLanguage = (raw: string | null | undefined): Language =>
  raw === 'en' ? 'en' : 'zh';

export const localeOf = (language: Language): string =>
  language === 'en' ? 'en-US' : 'zh-CN';

export const enMessages: Record<string, string> = {
  // —— 通用 ——
  '未知错误': 'Unknown error',
  '取消': 'Cancel',
  '删除': 'Delete',
  '保存': 'Save',
  '关闭': 'Close',
  '编辑': 'Edit',
  '返回': 'Back',
  '返回项目列表': 'Back to projects',
  '重试': 'Retry',
  '添加': 'Add',
  '获取': 'Fetch',
  '提交': 'Submit',
  '清空': 'Clear',
  '全部': 'All',
  '重置': 'Reset',
  '恢复': 'Restore',
  '忽略': 'Ignore',
  '只读': 'Read-only',
  '或': 'or',
  '退出': 'to exit',
  '模型设置': 'Model settings',
  '设置': 'Settings',
  '外观': 'Appearance',
  '语言': 'Language',
  '偏好设置': 'Preferences',
  '跟随系统': 'System',
  '浅色': 'Light',
  '深色': 'Dark',
  '未命名项目': 'Untitled project',
  '未命名差异': 'Untitled difference',
  '高': 'High',
  '中': 'Medium',
  '低': 'Low',
  '内容': 'Content',
  '布局': 'Layout',
  '样式': 'Style',
  '已通过': 'Verified',
  '已驳回': 'Rejected',
  '待验收': 'Pending review',
  '待': 'Pend',
  '过': 'Pass',
  '拒': 'Rej',
  '连接失败': 'Connection failed',
  '删除失败': 'Delete failed',
  '保存失败': 'Save failed',
  '测试连接': 'Test connection',
  '确认删除': 'Confirm delete',
  '删除模型': 'Delete model',
  '模型 ID': 'Model ID',
  '添加模型': 'Add model',
  '编辑模型': 'Edit model',
  '自定义': 'Custom',
  '环境变量': 'Environment',
  '默认': 'Default',
  '未配置': 'Not configured',
  '设为默认': 'Set default',
  '点击切换类型': 'Click to change type',
  '刷新页面': 'Reload page',
  '页面出错了': 'Something went wrong',
  '应用遇到了意外错误，请刷新页面重试。': 'The app hit an unexpected error. Reload the page to try again.',
  // —— 项目列表 ——
  '刚刚': 'Just now',
  '今天': 'Today',
  '昨天': 'Yesterday',
  'AIDA · 项目列表': 'AIDA · Projects',
  '最近': 'Recents',
  '全部项目': 'All projects',
  '分类': 'Categories',
  '回收站': 'Trash',
  '搜索项目': 'Search projects',
  '新建分类': 'New category',
  '新建项目': 'New project',
  '网格视图': 'Grid view',
  '列表视图': 'List view',
  '选择项目分类': 'Select category',
  '关闭错误提示': 'Dismiss error',
  '数据加载失败，暂时无法显示项目': 'Failed to load data; projects are unavailable',
  '回收站为空': 'Trash is empty',
  '暂无项目': 'No projects yet',
  '项目名称': 'Project name',
  '例如：官网改版': 'e.g. Website redesign',
  '创建项目': 'Create project',
  '移入回收站？': 'Move to Trash?',
  '移入回收站': 'Move to Trash',
  '项目将移入回收站，可在「回收站」分类中重新找到，不会立即永久删除。': 'The project will move to Trash. You can find it again in the Trash category; it is not permanently deleted right away.',
  '打开项目': 'Open project',
  '取消星标': 'Unstar',
  '加星标': 'Star',
  '成员': 'Members',
  '分类已删除': 'Category deleted',
  '删除分类失败': 'Failed to delete category',
  '分类排序保存失败': 'Failed to save category order',
  '（数据可能不是最新，请检查后端服务后刷新页面）': '(Data may be stale; check the backend service and reload.)',
  '创建项目失败: {error}': 'Failed to create project: {error}',
  '移入回收站失败: {error}': 'Failed to move to Trash: {error}',
  '更新星标失败: {error}': 'Failed to update star: {error}',
  '新建分类失败: {error}': 'Failed to create category: {error}',
  '保存分类失败: {error}': 'Failed to save category: {error}',
  '已移动到「{name}」': 'Moved to "{name}"',
  '移动项目失败: {error}': 'Failed to move project: {error}',
  '加载数据失败：{error}': 'Failed to load data: {error}',
  '今天 {time}': 'Today {time}',
  '昨天 {time}': 'Yesterday {time}',
  '打开项目 {name}': 'Open project {name}',
  '成员 {name}': 'Member {name}',
  // —— 模型设置 ——
  '加载模型配置失败': 'Failed to load model settings',
  '设置默认模型失败': 'Failed to set default model',
  'AIDA · 模型设置': 'AIDA · Model settings',
  '设置 · 模型': 'Settings · Models',
  '用于 AI 差异分析的视觉模型': 'Vision models used for AI difference analysis',
  '还没有可用的模型': 'No models available yet',
  '环境变量项只读，请修改服务端配置': 'Environment models are read-only; change the server configuration',
  '添加自定义模型，或在服务端配置': 'Add a custom model, or configure',
  '环境变量。添加后即可在 Checker 中选择用于差异分析的模型。': 'environment variables on the server. Once added, you can pick the model for difference analysis in the Checker.',
  'API Key 仅保存在服务端，不会返回浏览器。环境变量模型由': 'API keys are stored only on the server and never returned to the browser. Environment models come from',
  '提供，优先级低于自定义模型。': 'and have lower priority than custom models.',
  '已设为默认模型：{label}': 'Default model set: {label}',
  '连接成功 · {ms} ms': 'Connected · {ms} ms',
  '已删除：{label}': 'Deleted: {label}',
  '将 {label} 设为默认模型': 'Set {label} as default model',
  '测试 {label} 的连接': 'Test connection for {label}',
  '编辑 {label}': 'Edit {label}',
  '删除 {label}': 'Delete {label}',
  '确定删除「{label}」？该模型的分析配置将从服务端移除，此操作不可撤销。': 'Delete "{label}"? Its analysis configuration will be removed from the server. This cannot be undone.',
  // —— 模型表单 ——
  '请填写 Base URL': 'Enter a Base URL',
  '请填写模型 ID': 'Enter a model ID',
  '请填写 API Key': 'Enter an API key',
  '请先填写 Base URL': 'Enter a Base URL first',
  '请先填写 API Key': 'Enter an API key first',
  '服务商未返回模型列表，请手动填写': 'The provider returned no model list; enter the model ID manually',
  '拉取模型失败，请手动填写模型 ID': 'Failed to fetch models; enter the model ID manually',
  '模型已更新': 'Model updated',
  '模型已添加': 'Model added',
  'OpenAI 兼容接口，需要支持图片输入': 'OpenAI-compatible endpoint; must support image input',
  '名称（可选）': 'Name (optional)',
  '例如：豆包 Vision': 'e.g. Doubao Vision',
  '填到版本路径即可，请求会自动拼接 /chat/completions': 'Enter up to the version path; /chat/completions is appended automatically',
  '隐藏 API Key': 'Hide API key',
  '显示 API Key': 'Show API key',
  '拉取模型': 'Fetch models',
  '例如：doubao-vision': 'e.g. doubao-vision',
  '已获取 {n} 个模型，可在模型 ID 中输入筛选': 'Fetched {n} models; type in the model ID field to filter',
  '连接成功，耗时 {ms} ms': 'Connected in {ms} ms',
  '留空表示不修改（{hint}）': 'Leave blank to keep unchanged ({hint})',
  '已保存': 'Saved',
  // —— 分析栏 / 差异列表 ——
  '选择分析模型': 'Select analysis model',
  '当前分析模型：{label}': 'Current analysis model: {label}',
  '（未配置）': '(not configured)',
  '分析中...': 'Analyzing...',
  '重新分析': 'Re-analyze',
  '差异分析': 'Analyze differences',
  '暂无描述': 'No description',
  '差异：{title}': 'Difference: {title}',
  '差异：{title}（{severity}，{status}）': 'Difference: {title} ({severity}, {status})',
  '严重等级：{level}': 'Severity: {level}',
  '严重等级：{level}（点击切换）': 'Severity: {level} (click to change)',
  // —— Checker ——
  'AIDA · 设计走查 Checker': 'AIDA · Design Checker',
  '项目仍在保存中，确定要离开吗？': 'The project is still saving. Leave anyway?',
  '项目有未保存的修改，确定要离开吗？': 'The project has unsaved changes. Leave anyway?',
  '尚未保存': 'Not saved yet',
  '刚刚保存': 'Saved just now',
  '已保存 {n} 秒前': 'Saved {n}s ago',
  '已保存 {n} 分钟前': 'Saved {n}m ago',
  '已保存 {time}': 'Saved at {time}',
  '加载分析历史失败: {error}': 'Failed to load analysis history: {error}',
  '加载轮次数据失败: {error}': 'Failed to load rounds: {error}',
  '已创建轮次': 'Round created',
  '创建轮次失败': 'Failed to create round',
  '保存轮次失败': 'Failed to save round',
  '轮次状态已更新：{status}': 'Round status updated: {status}',
  '更新状态失败': 'Failed to update status',
  '轮次已删除': 'Round deleted',
  '删除轮次失败': 'Failed to delete round',
  '差异项已删除': 'Difference deleted',
  '保存项目数据失败。': 'Failed to save project data.',
  '项目数据超出服务端大小限制，请压缩图片后重试。': 'Project data exceeds the server size limit. Compress the images and try again.',
  '通过代理获取图片失败：{error}': 'Failed to fetch image via proxy: {error}',
  '无效的差异数据': 'Invalid difference data',
  'AI 返回的数据格式不正确': 'The AI returned data in an unexpected format',
  '分析失败：{error}': 'Analysis failed: {error}',
  '分析已保存': 'Analysis saved',
  '保存分析失败。': 'Failed to save analysis.',
  '分析已删除': 'Analysis deleted',
  '删除分析失败。': 'Failed to delete analysis.',
  '手动标记': 'Manual annotation',
  '手动添加的差异区域。': 'Manually added difference region.',
  '启动屏幕捕获失败，请检查权限。': 'Failed to start screen capture. Check permissions.',
  '获取 Figma 图片失败': 'Failed to fetch Figma image',
  '获取 Figma 图片失败，请检查链接与 FIGMA_ACCESS_TOKEN。': 'Failed to fetch the Figma image. Check the link and FIGMA_ACCESS_TOKEN.',
  '高严重': 'High severity',
  '中严重': 'Medium severity',
  '低严重': 'Low severity',
  '设计稿来源': 'Design source',
  '暂无设计稿，等待负责人上传。': 'No design yet, waiting for the owner to upload.',
  '上传图片': 'Upload image',
  'Figma 链接': 'Figma link',
  '选择图片': 'Choose image',
  '粘贴 Figma 链接...': 'Paste Figma link...',
  '实现稿来源': 'Build source',
  '暂无实现稿，等待负责人上传。': 'No build yet, waiting for the owner to upload.',
  '图片': 'Image',
  '网址': 'URL',
  '模拟': 'Simulate',
  '上传实现稿': 'Upload build',
  '正在加载项目数据…': 'Loading project data…',
  '检查器为桌面端工具，建议使用宽度 1024px 以上的屏幕以获得完整体验': 'The checker is a desktop tool. A screen at least 1024px wide is recommended for the full experience.',
  '无权修改项目名称': 'Not allowed to rename the project',
  '双击编辑项目名称': 'Double-click to rename',
  '保存中…': 'Saving…',
  '所有修改已保存': 'All changes saved',
  '有未保存修改': 'Unsaved changes',
  '正在同步项目更新': 'Syncing project updates',
  '即将自动保存': 'Auto-save pending',
  '修改尚未同步': 'Changes not synced',
  '叠加': 'Overlay',
  '滑块': 'Slider',
  '分屏': 'Split',
  '差分': 'Diff',
  '轮次': 'Rounds',
  '正在创建轮次…': 'Creating round…',
  '请先上传设计稿并生成实现稿截图。': 'Upload a design and generate a build screenshot first.',
  '没有可提交的差异，请先标注或分析差异。': 'No differences to submit. Annotate or analyze differences first.',
  '提交轮次': 'Submit round',
  '标注模式': 'Annotation mode',
  '按住拖拽标注差异 · 按': 'Drag to annotate · press',
  '清除设计稿': 'Clear design',
  '设计稿': 'Design',
  '清除构建源': 'Clear build source',
  '构建页面预览': 'Build page preview',
  '构建截图': 'Build screenshot',
  '实时页面': 'Live page',
  '实现稿截图': 'Build screenshot',
  '设计稿叠加': 'Design overlay',
  '控制面板': 'Controls',
  '差异列表': 'Differences',
  '查看对比图 (View Comparison)': 'View comparison',
  '标记已修复': 'Mark fixed',
  '已解决': 'Resolved',
  '本回答由 AI{model}生成，内容仅供参考': 'Generated by AI{model}; for reference only',
  '正在分析还原度…': 'Analyzing fidelity…',
  '历史分析': 'Analysis history',
  '暂无已保存的分析。': 'No saved analyses yet.',
  '载入分析：{name}': 'Load analysis: {name}',
  '删除已保存的分析': 'Delete saved analysis',
  '设计稿缩略图': 'Design thumbnail',
  '居中': 'Center',
  '左对齐': 'Align left',
  '水平居中': 'Center horizontally',
  '右对齐': 'Align right',
  '顶部对齐': 'Align top',
  '垂直居中': 'Center vertically',
  '底部对齐': 'Align bottom',
  '准备开始分析': 'Ready to analyze',
  '上传设计稿与实现稿截图后即可开始还原度分析。': 'Upload a design and a build screenshot to start fidelity analysis.',
  '暂无验收轮次。': 'No review rounds yet.',
  '提交第一轮以开始追踪进度。': 'Submit the first round to start tracking progress.',
  '载入第 {n} 轮': 'Load round {n}',
  '第 {n} 轮': 'Round {n}',
  '删除轮次': 'Delete round',
  '实现稿': 'Build',
  '{n} 项差异': '{n} differences',
  '保存分析': 'Save analysis',
  '分析名称': 'Analysis name',
  '例如：首页走查': 'e.g. Homepage review',
  '删除轮次？': 'Delete round?',
  '此操作不可撤销，该轮次及其评审快照将被永久删除。': 'This cannot be undone. The round and its review snapshot will be permanently deleted.',
  '删除分析？': 'Delete analysis?',
  '此操作不可撤销，该分析记录将被永久删除。': 'This cannot be undone. This analysis record will be permanently deleted.',
};

export const translate = (
  language: Language,
  text: string,
  vars?: Record<string, string | number>,
): string => {
  const template = language === 'en' ? (enMessages[text] ?? text) : text;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  );
};
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/i18n.test.ts`
Expected: PASS（全部用例）。

- [ ] **Step 5: 检查点**

Run: `npm run lint && npm test`
Expected: 全绿。（无 git，不提交。）

---

### Task 2: 全局偏好 Provider 与接线

**Files:**
- Create: `src/lib/preferences.tsx`
- Test: `tests/preferences.test.ts`
- Modify: `src/main.tsx`、`src/App.tsx`（根组件 theme state 迁出）、`src/components/ErrorBoundary.tsx`

**Interfaces:**
- Consumes: `Language, normalizeLanguage, localeOf, translate, LANGUAGE_STORAGE_KEY`（Task 1）。
- Produces:
  - `type Theme = 'light' | 'dark' | 'system'`
  - `normalizeTheme(raw: string | null | undefined): Theme`
  - `usePreferences(): { theme: Theme; setTheme(t: Theme): void; resolvedTheme: 'light' | 'dark'; language: Language; setLanguage(l: Language): void; t(text: string, vars?: Record<string, string | number>): string; locale: string }`
  - `PreferencesProvider({ children }: { children: React.ReactNode })`

- [ ] **Step 1: 写失败测试** `tests/preferences.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { normalizeTheme } from '../src/lib/preferences';

describe('normalizeTheme', () => {
  it('accepts light/dark/system', () => {
    expect(normalizeTheme('light')).toBe('light');
    expect(normalizeTheme('dark')).toBe('dark');
    expect(normalizeTheme('system')).toBe('system');
  });
  it('defaults unknown/empty to system', () => {
    expect(normalizeTheme('bogus')).toBe('system');
    expect(normalizeTheme(null)).toBe('system');
    expect(normalizeTheme(undefined)).toBe('system');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/preferences.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 `src/lib/preferences.tsx`**

```tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Language, LANGUAGE_STORAGE_KEY, localeOf, normalizeLanguage, translate } from './i18n';

export type Theme = 'light' | 'dark' | 'system';

export const normalizeTheme = (raw: string | null | undefined): Theme =>
  raw === 'light' || raw === 'dark' ? raw : 'system';

type PreferencesValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'light' | 'dark';
  language: Language;
  setLanguage: (language: Language) => void;
  t: (text: string, vars?: Record<string, string | number>) => string;
  locale: string;
};

const PreferencesContext = createContext<PreferencesValue | null>(null);

const systemDark = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => normalizeTheme(localStorage.getItem('theme')));
  const [language, setLanguage] = useState<Language>(() => normalizeLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY)));
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() =>
    theme === 'system' ? (systemDark() ? 'dark' : 'light') : theme,
  );

  useEffect(() => {
    localStorage.setItem('theme', theme);
    if (theme !== 'system') {
      setResolvedTheme(theme);
      return;
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setResolvedTheme(e.matches ? 'dark' : 'light');
    setResolvedTheme(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = localeOf(language);
  }, [language]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
  }, [resolvedTheme]);

  const t = useCallback(
    (text: string, vars?: Record<string, string | number>) => translate(language, text, vars),
    [language],
  );

  const value = useMemo<PreferencesValue>(
    () => ({ theme, setTheme, resolvedTheme, language, setLanguage, t, locale: localeOf(language) }),
    [theme, resolvedTheme, language, t],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/preferences.test.ts`
Expected: PASS。

- [ ] **Step 5: 接线 `src/main.tsx`**

把渲染树改为 Provider 包裹 ErrorBoundary（ErrorBoundary 在 Router 外也能用 context）：

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PreferencesProvider } from './lib/preferences';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PreferencesProvider>
      <ErrorBoundary>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ErrorBoundary>
    </PreferencesProvider>
  </StrictMode>,
);
```

- [ ] **Step 6: 迁出 `src/App.tsx` 根组件 theme state**

删除 `export default function App()` 内的 `theme`/`resolvedTheme` 两个 `useState` 与相关 `useEffect`（写 localStorage、matchMedia、`document.documentElement.classList` 三段），改为：

```tsx
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ProjectManagement />} />
      <Route path="/checker" element={<DesignChecker />} />
      <Route path="/checker/:projectId" element={<DesignChecker />} />
      <Route path="/settings" element={<ModelSettings />} />
    </Routes>
  );
}
```

`DesignChecker` 签名改为 `function DesignChecker()`，函数体首行加 `const { resolvedTheme, t } = usePreferences();`，保留原有 `const theme = resolvedTheme;`。导入 `usePreferences`。本任务暂不替换文案（Task 5 做），仅保证编译通过。

- [ ] **Step 7: 各页面/组件改用 hook（仅主题，文案后续任务）**

- `ProjectManagement`：签名改为 `export default function ProjectManagement()`，首行 `const { theme, resolvedTheme, t } = usePreferences();`，删除原 props 解构与类型。`ProjectCard` 的 `theme={theme}` 改为 `theme={resolvedTheme}`（修复 system 被当浅色的 bug）。
- `ModelSettings`：删除 `Props`/`resolvedTheme` 参数，签名 `export default function ModelSettings()`，首行 `const { resolvedTheme, t } = usePreferences();`。
- `AiModelForm`、`AnalyzeActionBar`、`DifferenceListItemV2` 仍接收 `theme` prop（由父级传 `resolvedTheme`），本任务不改其签名。

- [ ] **Step 8: ErrorBoundary 文案接入 context**

把报错 UI 抽为函数子组件（在 `ErrorBoundary.tsx` 内）：

```tsx
import { usePreferences } from '../lib/preferences';

function ErrorFallback({ error }: { error: Error | null }) {
  const { t } = usePreferences();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-red-100">
        <div className="flex items-center gap-3 text-red-600 mb-4">
          <Zap className="w-8 h-8" />
          <h1 className="text-xl font-bold">{t('页面出错了')}</h1>
        </div>
        <p className="text-gray-600 mb-6 text-sm">{t('应用遇到了意外错误，请刷新页面重试。')}</p>
        {error && (
          <div className="bg-red-50 rounded-lg p-4 mb-6 overflow-auto max-h-40">
            <p className="text-xs font-mono text-red-800 break-words">{error.message}</p>
          </div>
        )}
        <button
          onClick={() => window.location.reload()}
          className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/20"
        >
          {t('刷新页面')}
        </button>
      </div>
    </div>
  );
}
```

`ErrorBoundary.render()` 的 `hasError` 分支改为 `return <ErrorFallback error={this.state.error} />;`。

- [ ] **Step 9: 检查点**

Run: `npm run lint && npm test && npm run build`
Expected: 全绿。浏览器打开 `/`，主题仍按系统/存储生效，`<html lang>` 为 `zh-CN`。

---

### Task 3: 偏好控件与侧栏/移动端集成

**Files:**
- Create: `src/components/preferences/PopoverMenu.tsx`、`ThemeMenu.tsx`、`LanguageMenu.tsx`、`MobilePreferencesMenu.tsx`
- Modify: `src/pages/ProjectManagement.tsx`（侧栏底部 + 移动端头部）

**Interfaces:**
- Consumes: `usePreferences()`（Task 2）；`Theme`、`Language`。
- Produces: `<ThemeMenu />`、`<LanguageMenu />`、`<MobilePreferencesMenu />`（均无 props，内部消费 context）。

- [ ] **Step 1: 实现 `PopoverMenu.tsx`**

```tsx
import React, { useEffect, useRef, useState } from 'react';

type Props = {
  trigger: (open: boolean) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  label: string;
  className?: string;
};

export default function PopoverMenu({ trigger, children, label, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className="w-full"
      >
        {trigger(open)}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 mb-2 w-56 rounded-xl border shadow-xl z-[100] overflow-hidden bg-white border-gray-200 dark:bg-[#2c2c2c] dark:border-[#383838]"
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 实现 `ThemeMenu.tsx`**

`trigger` 渲染行按钮，`children` 渲染菜单选项：

```tsx
import React from 'react';
import { Check, ChevronUp, Monitor, Moon, Sun } from 'lucide-react';
import { usePreferences, Theme } from '../../lib/preferences';
import PopoverMenu from './PopoverMenu';

export default function ThemeMenu() {
  const { theme, setTheme, resolvedTheme, t } = usePreferences();
  const isDark = resolvedTheme === 'dark';
  const CurrentIcon = theme === 'system' ? Monitor : theme === 'light' ? Sun : Moon;
  const label = theme === 'system' ? t('跟随系统') : theme === 'light' ? t('浅色') : t('深色');
  const rowClass = `w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm transition-colors ${
    isDark ? 'text-gray-300 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-50'
  }`;
  return (
    <PopoverMenu
      label={t('外观')}
      trigger={() => (
        <span className={rowClass}>
          <CurrentIcon className="w-4 h-4" />
          <span className="flex-1 text-left">{t('外观')}</span>
          <span className="text-xs text-gray-400">{label}</span>
          <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
        </span>
      )}
    >
      {(close) => (
        <>
          {(['system', 'light', 'dark'] as Theme[]).map((value) => {
            const Icon = value === 'system' ? Monitor : value === 'light' ? Sun : Moon;
            const text = value === 'system' ? t('跟随系统') : value === 'light' ? t('浅色') : t('深色');
            return (
              <button
                key={value}
                role="menuitemradio"
                aria-checked={theme === value}
                onClick={() => { setTheme(value); close(); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                  theme === value
                    ? 'text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/10'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="flex-1 text-left">{text}</span>
                {theme === value && <Check className="w-4 h-4" />}
              </button>
            );
          })}
        </>
      )}
    </PopoverMenu>
  );
}
```

- [ ] **Step 3: 实现 `LanguageMenu.tsx`**

```tsx
import React from 'react';
import { Check, ChevronUp, Languages } from 'lucide-react';
import { usePreferences } from '../../lib/preferences';
import { Language } from '../../lib/i18n';
import PopoverMenu from './PopoverMenu';

const names: Record<Language, string> = { zh: '简体中文', en: 'English' };

export default function LanguageMenu() {
  const { language, setLanguage, resolvedTheme, t } = usePreferences();
  const isDark = resolvedTheme === 'dark';
  const rowClass = `w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm transition-colors ${
    isDark ? 'text-gray-300 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-50'
  }`;
  return (
    <PopoverMenu
      label={t('语言')}
      trigger={() => (
        <span className={rowClass}>
          <Languages className="w-4 h-4" />
          <span className="flex-1 text-left">{t('语言')}</span>
          <span className="text-xs text-gray-400">{names[language]}</span>
          <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
        </span>
      )}
    >
      {(close) => (
        <>
          {(['zh', 'en'] as Language[]).map((value) => (
            <button
              key={value}
              role="menuitemradio"
              aria-checked={language === value}
              onClick={() => { setLanguage(value); close(); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                language === value
                  ? 'text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/10'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5'
              }`}
            >
              <span className="flex-1 text-left">{names[value]}</span>
              {language === value && <Check className="w-4 h-4" />}
            </button>
          ))}
        </>
      )}
    </PopoverMenu>
  );
}
```

- [ ] **Step 4: 实现 `MobilePreferencesMenu.tsx`**

```tsx
import React from 'react';
import { Check, Languages, Monitor, Moon, Settings, SlidersHorizontal, Sun } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePreferences, Theme } from '../../lib/preferences';
import { Language } from '../../lib/i18n';
import PopoverMenu from './PopoverMenu';

const names: Record<Language, string> = { zh: '简体中文', en: 'English' };

export default function MobilePreferencesMenu() {
  const { theme, setTheme, language, setLanguage, resolvedTheme, t } = usePreferences();
  const navigate = useNavigate();
  const isDark = resolvedTheme === 'dark';
  return (
    <PopoverMenu
      label={t('偏好设置')}
      className="md:hidden"
      trigger={() => (
        <span className={`inline-flex p-2 rounded-lg transition-colors ${
          isDark ? 'text-gray-400 hover:text-white hover:bg-[#2c2c2c]' : 'text-gray-500 hover:text-indigo-600 hover:bg-gray-100'
        }`}>
          <SlidersHorizontal className="w-4 h-4" />
        </span>
      )}
    >
      {(close) => (
        <div className="py-1">
          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{t('外观')}</div>
          {(['system', 'light', 'dark'] as Theme[]).map((value) => {
            const Icon = value === 'system' ? Monitor : value === 'light' ? Sun : Moon;
            const text = value === 'system' ? t('跟随系统') : value === 'light' ? t('浅色') : t('深色');
            return (
              <button key={value} role="menuitemradio" aria-checked={theme === value}
                onClick={() => { setTheme(value); close(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5">
                <Icon className="w-4 h-4" /><span className="flex-1 text-left">{text}</span>
                {theme === value && <Check className="w-4 h-4 text-indigo-500" />}
              </button>
            );
          })}
          <div className="px-3 py-1.5 mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400 border-t border-gray-100 dark:border-[#383838]">{t('语言')}</div>
          {(['zh', 'en'] as Language[]).map((value) => (
            <button key={value} role="menuitemradio" aria-checked={language === value}
              onClick={() => { setLanguage(value); close(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5">
              <Languages className="w-4 h-4" /><span className="flex-1 text-left">{names[value]}</span>
              {language === value && <Check className="w-4 h-4 text-indigo-500" />}
            </button>
          ))}
          <button role="menuitem" onClick={() => { close(); navigate('/settings'); }}
            className="w-full flex items-center gap-2 px-3 py-2 mt-1 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 border-t border-gray-100 dark:border-[#383838]">
            <Settings className="w-4 h-4" /><span className="flex-1 text-left">{t('设置')}</span>
          </button>
        </div>
      )}
    </PopoverMenu>
  );
}
```

注意：移动端面板向上弹出可能超出视口顶部；若被裁剪，把 `PopoverMenu` 面板定位改为 `top-full mt-2`（向下）即可。实现时在 390px 视口确认不被裁剪，必要时给 `PopoverMenu` 增加 `placement?: 'up' | 'down'`（默认 `up`，移动端传 `down`）。

- [ ] **Step 5: 集成到 `ProjectManagement.tsx` 侧栏**

侧栏 `<aside>` 内：把分类区块外层 `<div>`（含「分类」标题与 `Reorder.Group`）改为可滚动容器 `className="flex-1 overflow-y-auto min-h-0"`；在其后、`</aside>` 前追加固定底部：

```tsx
<div className={`mt-auto pt-3 border-t space-y-1 ${isDark ? 'border-[#383838]' : 'border-gray-200'}`}>
  <ThemeMenu />
  <LanguageMenu />
  <button
    type="button"
    onClick={() => navigate('/settings')}
    className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm transition-colors ${
      isDark ? 'text-gray-300 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-50'
    }`}
  >
    <Settings className="w-4 h-4" />
    <span className="flex-1 text-left">{t('设置')}</span>
  </button>
</div>
```

导入三个组件与 `Settings` 图标（已有）。确保 `<aside>` 为 `flex flex-col` 且高度撑满（现有 `flex-col` + 父级 `h-screen` 已满足）。

- [ ] **Step 6: 移动端头部 + 移除桌面头部齿轮**

- 删除头部中原「模型设置」齿轮 `<button onClick={() => navigate('/settings')} …><Settings/></button>`（约 426–435 行）。
- 在头部右侧控件区加入 `<MobilePreferencesMenu />`（组件自带 `md:hidden`，桌面不显示）。

- [ ] **Step 7: 检查点**

Run: `npm run lint && npm test && npm run build`
Expected: 全绿。浏览器：桌面侧栏底部出现外观/语言/设置三行；主题三态切换即时生效并刷新保留；语言切换后 `<html lang>` 变化；390px 头部出现偏好按钮且面板可用。

---

### Task 4: 翻译中小型文件

**Files:**
- Modify: `src/pages/ProjectManagement.tsx`、`src/pages/ModelSettings.tsx`、`src/components/AiModelForm.tsx`、`src/components/AnalyzeActionBar.tsx`、`src/components/DifferenceListItemV2.tsx`

**Interfaces:**
- Consumes: `usePreferences().t`、`locale`（Task 2）；字典键（Task 1）。

**通用替换规则（适用于本任务与 Task 5）：**
1. 普通字符串字面量 `'中文'` / JSX 文本 `中文` → `t('中文')` / `{t('中文')}`。字典已含全部键。
2. `aria-label` / `title` / `placeholder` 中的中文字面量同样包 `t(...)`。
3. 模板字符串按附录 B 转为 `t('模板键', { var: expr })`。
4. 模块级 helper 若返回中文，改为接收 `t` 参数（如 `getSeverityText(severity, t)`、`formatRelativeDate(ts, t, locale)`），调用处传入。
5. `document.title = '中文'` → `document.title = t('中文')`，并把 `t` 加入该 effect 依赖数组。
6. `toLocale*` 第一参数 `[]` 改为 `locale`。
7. 不翻译用户数据插值（`project.name`、`cat.name`、`model.label`、成员名）——它们作为 `{var}` 传入。

- [ ] **Step 1: ProjectManagement.tsx**

按规则替换全部中文（清单见附录 A）。重点：
- `formatRelativeDate` 改签名 `(timestamp, t, locale)`；`'刚刚'`→`t('刚刚')`；`今天 ${timeStr}`→`t('今天 {time}', { time: timeStr })`；`昨天`同理；`toLocaleTimeString([], …)`/`toLocaleString([], …)` 改 `locale`。调用处 `formatRelativeDate(project.updatedAt, t, locale)`。
- `document.title` effect 用 `t('AIDA · 项目列表')`，依赖加 `t`。
- 各 toast：`创建项目失败: ${…}`→`t('创建项目失败: {error}', { error: … })` 等（附录 B）。
- 错误横幅 `加载数据失败：{loadError}（…）`→`{t('加载数据失败：{error}', { error: loadError })}{t('（数据可能不是最新，请检查后端服务后刷新页面）')}`。
- `ProjectCard` 内 `打开项目 ${name}`→`t('打开项目 {name}', { name })`；`成员 ${m}`→`t('成员 {name}', { name: m })`；`取消星标/加星标`、`未命名项目` 包 `t`。`ProjectCard` 需取 `t`：在其组件内 `const { t } = usePreferences();`。

- [ ] **Step 2: ModelSettings.tsx**

替换全部中文。重点模板：`已设为默认模型：{label}`、`连接成功 · {ms} ms`（`{ ms: result.latencyMs ?? 0 }`）、`已删除：{label}`、aria `将/测试/编辑/删除 {label}`、删除确认整句。`document.title` 用 `t('AIDA · 模型设置')` 依赖加 `t`。围绕 `<code>` 的三段说明用字典片段键。

- [ ] **Step 3: AiModelForm.tsx**

组件内 `const { t } = usePreferences();`。替换校验/反馈/标签/占位符。模板：`已获取 {n} 个模型…`、`连接成功，耗时 {ms} ms`、`留空表示不修改（{hint}）`（`{ hint: model?.apiKeyHint || t('已保存') }`）。

- [ ] **Step 4: AnalyzeActionBar.tsx**

组件内 `const { t } = usePreferences();`。`选择分析模型`、`当前分析模型：{label}`、`（未配置）`、`未配置`、`分析中...`、`重新分析`、`差异分析`。

- [ ] **Step 5: DifferenceListItemV2.tsx**

`getSeverityText` 改 `(severity, t)` 返回 `t('高'/'中'/'低')`；组件内取 `t` 并传入。`暂无描述`、`点击切换类型`、aria `差异：{title}（{severity}，{status}）`（`{ title: safeTitle, severity: getSeverityText(severity, t), status: getStatusText(diff.status) }`）、`严重等级：{level}`。`getStatusText` 已是英文，保持不变。

- [ ] **Step 6: 检查点**

Run: `npm run lint && npm test && npm run build`
Expected: 全绿。用附录 C 脚本扫描这 5 个文件，残留中文应为 0（用户数据插值不计）。

---

### Task 5: 翻译 App.tsx 与日期本地化

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `usePreferences().t / locale`；字典键。

- [ ] **Step 1: 取 hook**

`DesignChecker` 已有 `const { resolvedTheme, t } = usePreferences();`（Task 2），再解构 `locale`：`const { resolvedTheme, t, locale } = usePreferences();`。

- [ ] **Step 2: 替换全部 UI 中文（排除 AI prompt）**

按通用规则替换附录 A 中 App.tsx 的全部键。**跳过 `const prompt = \`…\`` 模板串整段**（当前约 957–983 行，以「你是一位细致入微的 UI/UX QA 工程师…」内容定位），保持原样。重点模板见附录 B：
- `formatSaveTime`：`尚未保存`/`刚刚保存` 包 `t`；`已保存 ${diffSeconds} 秒前`→`t('已保存 {n} 秒前', { n: diffSeconds })`；分钟同理；`已保存 ${time}`→`t('已保存 {time}', { time })`；`toLocaleTimeString([], …)`→`locale`。
- `formatRoundDate`：`toLocaleDateString()`→`toLocaleDateString(locale)`。
- 历史分析时间戳 `toLocaleDateString()`→`toLocaleDateString(locale)`。
- 轮次：`第 {n} 轮`、`载入第 {n} 轮`、`{n} 项差异`、状态短标签 `待/过/拒`、`已通过/已驳回/待验收`、`轮次状态已更新：{status}`。
- 差异 aria：`差异：{title}`（`{ title: diff.title || t('未命名差异') }`）；severity title `严重等级：{level}（点击切换）` / `严重等级：{level}`（`{ level: t(severity==='high'?'高':severity==='medium'?'中':'低') }`）。
- AI 署名：`本回答由 AI{model}生成，内容仅供参考`，`{ model: aiModelLabel ? `（${aiModelLabel}）` : '' }`。
- 标注提示三段：`按住拖拽标注差异 · 按` / `或` / `退出`（保留中间 `<kbd>`）。
- `document.title` effect 用 `t('AIDA · 设计走查 Checker')`，依赖加 `t`。
- 各 toast/错误：`加载分析历史失败: {error}`、`加载轮次数据失败: {error}`、`分析失败：{error}`、`通过代理获取图片失败：{error}` 等。

- [ ] **Step 3: 检查点**

Run: `npm run lint && npm test && npm run build`
Expected: 全绿。附录 C 脚本扫描 App.tsx：除 AI prompt 段外残留中文为 0。

---

### Task 6: 回归、浏览器 E2E 与文档

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 全量回归**

Run: `npm test && npm run lint && npm run build`
Expected: 测试全绿（含新增 i18n/preferences 用例）、lint/typecheck 通过、build 成功。

- [ ] **Step 2: 浏览器 E2E（Chrome DevTools MCP，临时数据目录，勿动用户数据/真实 AI）**

启动临时服务（`PORT=3124 DATA_DIR_NAME=/tmp/aida-pref-e2e DISABLE_HMR=true npx tsx api/index.ts`，清空 AI 环境变量），逐项验证：
1. 桌面侧栏底部三行可见；外观菜单三态切换，`document.documentElement.classList` 的 `dark` 正确；刷新后保留；选「跟随系统」随系统。
2. 语言切到 English：`<html lang>`=`en-US`；Dashboard / 模型设置页 / Checker 可见文本、`aria-label`、`title`、`placeholder` 无残留中文（用户数据除外）。用 `evaluate_script` 跑：
   ```js
   [...document.querySelectorAll('body *')].flatMap(el =>
     [...(el.childNodes)].filter(n => n.nodeType === 3 && /[\u4e00-\u9fff]/.test(n.textContent))
       .map(n => n.textContent.trim())).filter(Boolean)
   ```
   以及扫描 `[aria-label],[title],[placeholder]` 属性中的中文。结果应为空（或仅用户数据）。
3. 切回简体中文，确认恢复。
4. 390px 视口：头部偏好按钮可达，面板内外点击/Escape 关闭，外观/语言/设置三项可用，面板不被裁剪。
5. 设置入口（桌面侧栏 + 移动端面板）跳转 `/settings`；模型增删改/测试连接流程不受影响。
6. 刷新后语言与主题均保留。

- [ ] **Step 3: 更新 README**

在「核心能力」加一条：`**偏好设置**：左侧栏底部（移动端头部菜单）切换跟随系统/浅色/深色与简体中文/English，偏好保存在浏览器。` 并在配置/使用说明处简述语言与主题。

- [ ] **Step 4: 清理与收尾**

停止临时服务，删除 `/tmp/aida-pref-e2e`、`/tmp/aida-i18n-inventory.mjs` 等本次临时产物（不动主服务与用户数据）。更新 `review/review.md` 残余风险/能力描述（如需）。最终 `npm test && npm run lint && npm run build` 全绿。

---

## 附录 A：中文 UI 字符串清单（AST 扫描）

运行附录 C 脚本可得 `file:line<TAB>字符串` 全量清单（约 300 条，含模板片段）。字典（Task 1）已覆盖全部 UI 键（已用脚本交叉核对，0 遗漏）；**唯一排除项是 App.tsx 的 `const prompt` AI 模板串（当前约 957–983 行）**。实现时以脚本输出逐条核对，确保无遗漏。

## 附录 B：模板字符串转换表（节选关键项，其余按同规则）

| 原代码 | 替换为 |
| --- | --- |
| `` `已保存 ${diffSeconds} 秒前` `` | `t('已保存 {n} 秒前', { n: diffSeconds })` |
| `` `已保存 ${diffMinutes} 分钟前` `` | `t('已保存 {n} 分钟前', { n: diffMinutes })` |
| `` `已保存 ${timeStr}` `` | `t('已保存 {time}', { time: timeStr })` |
| `` `今天 ${timeStr}` `` | `t('今天 {time}', { time: timeStr })` |
| `` `已移动到「${catName}」` `` | `t('已移动到「{name}」', { name: catName })` |
| `` `创建项目失败: ${msg}` `` | `t('创建项目失败: {error}', { error: msg })` |
| `` `轮次状态已更新：${statusLabel}` `` | `t('轮次状态已更新：{status}', { status: statusLabel })` |
| `` `第 ${round.roundNumber} 轮` `` | `t('第 {n} 轮', { n: round.roundNumber })` |
| `` `载入第 ${round.roundNumber} 轮` `` | `t('载入第 {n} 轮', { n: round.roundNumber })` |
| `` `${count} 项差异` `` | `t('{n} 项差异', { n: count })` |
| `` `差异：${diff.title || '未命名差异'}` `` | `t('差异：{title}', { title: diff.title || t('未命名差异') })` |
| `` `严重等级：${lvl}（点击切换）` `` | `t('严重等级：{level}（点击切换）', { level: t(lvl) })` |
| `` `本回答由 AI${label ? `（${label}）` : ''}生成，内容仅供参考` `` | `t('本回答由 AI{model}生成，内容仅供参考', { model: label ? `（${label}）` : '' })` |
| `` `已设为默认模型：${model.label}` `` | `t('已设为默认模型：{label}', { label: model.label })` |
| `` `连接成功 · ${result.latencyMs ?? 0} ms` `` | `t('连接成功 · {ms} ms', { ms: result.latencyMs ?? 0 })` |
| `` `确定删除「${deleteTarget.label}」？该模型…` `` | `t('确定删除「{label}」？该模型的分析配置将从服务端移除，此操作不可撤销。', { label: deleteTarget.label })` |
| `` `已获取 ${data.models.length} 个模型，可在模型 ID 中输入筛选` `` | `t('已获取 {n} 个模型，可在模型 ID 中输入筛选', { n: data.models.length })` |
| `` `连接成功，耗时 ${result.latencyMs ?? 0} ms` `` | `t('连接成功，耗时 {ms} ms', { ms: result.latencyMs ?? 0 })` |
| `` `留空表示不修改（${model?.apiKeyHint || '已保存'}）` `` | `t('留空表示不修改（{hint}）', { hint: model?.apiKeyHint || t('已保存') })` |
| `` `当前分析模型：${label}` `` | `t('当前分析模型：{label}', { label })` |
| `` `打开项目 ${project.name}` `` | `t('打开项目 {name}', { name: project.name })` |
| `` `成员 ${m}` `` | `t('成员 {name}', { name: m })` |

## 附录 C：残留中文扫描脚本（验证用，临时文件）

`/tmp/aida-i18n-inventory.mjs`（用仓库内 typescript 编译器 API 遍历 StringLiteral / JsxText / TemplateExpression，输出含 `[\u4e00-\u9fff]` 的字符串及 `file:line`）。Task 4/5 完成后运行，确认除 AI prompt 外无残留。脚本内容：

```js
import fs from 'node:fs';
import path from 'node:path';
import ts from '<repo>/node_modules/typescript/lib/typescript.js';
const root = '<repo>/src';
const files = ['App.tsx','pages/ProjectManagement.tsx','pages/ModelSettings.tsx','components/AiModelForm.tsx','components/AnalyzeActionBar.tsx','components/DifferenceListItemV2.tsx','components/ErrorBoundary.tsx'];
const hasHan = (s) => /[\u4e00-\u9fff]/.test(s);
for (const rel of files) {
  const file = path.join(root, rel);
  const sf = ts.createSourceFile(file, fs.readFileSync(file,'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const walk = (n) => {
    const emit = (text, pos) => { const v = text.replace(/\s+/g,' ').trim(); if (v && hasHan(v)) console.log(`${rel}:${sf.getLineAndCharacterOfPosition(pos).line+1}\t${v}`); };
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) emit(n.text, n.getStart(sf));
    else if (ts.isJsxText(n)) emit(n.text, n.getStart(sf));
    else if (ts.isTemplateExpression(n)) { emit(n.head.text, n.getStart(sf)); for (const s of n.templateSpans) emit(s.literal.text, s.getStart(sf)); }
    ts.forEachChild(n, walk);
  };
  walk(sf);
}
```

注：包在 `t('…')` 里的中文仍会被脚本检出（因为它是 StringLiteral）。验证「残留」时应改为检查**未被 `t(` 包裹**的中文字面量；简单做法是人工核对脚本输出中每一处都已作为 `t(...)` 的键存在，且渲染输出（浏览器 DOM 扫描，Task 6 Step 2）无中文。DOM 扫描是最终判据。
