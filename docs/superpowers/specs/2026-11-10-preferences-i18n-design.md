# AIDA 偏好设置（明暗模式 / 语言）设计

日期：2026-11-10
状态：已确认，待实现

## 目标

在全局提供明暗模式与界面语言偏好：三态主题（跟随系统 / 浅色 / 深色）、全站中英双语。桌面端控件固定在左侧栏底部，与「设置」入口并列；移动端收纳到项目列表头部菜单。偏好仅保存在浏览器 localStorage，切换即时生效、刷新后保留。

## 已确认决策

- 语言范围：全站中英双语，覆盖 Dashboard、Checker、模型设置页/表单、分析栏、差异列表、错误页，以及按钮、占位符、toast、`aria-label`、`title`、页面标题。
- 主题交互：三态菜单（跟随系统 / 浅色 / 深色），复用现有 `theme` 存储键与系统主题监听。
- 移动端：侧栏在窄屏隐藏，控件收纳到项目列表头部菜单。
- 桌面端：左侧栏底部固定偏好区；移除 Dashboard 顶部的设置齿轮；Checker 顶部设置齿轮也已移除（2026-11-11 追加决策：详情页不再提供设置入口，统一从项目列表侧栏/移动端菜单进入 `/settings`）。
- 语言存储键：`aida:language`，默认 `zh`。
- 不引入 i18next；两语言场景使用自研字典 + `translate()`。
- 不同步服务端；项目名、分类名、AI 产出、服务端返回的错误原文不翻译。

## 架构

### 新增文件

- `src/lib/i18n.ts`
  - `type Language = 'zh' | 'en'`
  - `LANGUAGE_STORAGE_KEY = 'aida:language'`
  - `enMessages: Record<string, string>`：以中文原文为 key 的英文字典（约 246 条，实现时以 AST 扫描清单为准）。
  - `translate(language, text, vars?)`：`zh` 直接返回原文；`en` 查字典，缺失回退原文；支持 `{name}` 占位符插值。
  - `localeOf(language)`：`zh-CN` / `en-US`，供 `toLocale*` 使用。
- `src/lib/preferences.tsx`
  - `PreferencesProvider` + `usePreferences()`。
  - 状态：`theme: 'light' | 'dark' | 'system'`、`resolvedTheme`、`language`。
  - 副作用：写 `localStorage.theme` / `localStorage['aida:language']`；`system` 时监听 `matchMedia('(prefers-color-scheme: dark)')`；同步 `document.documentElement.classList.toggle('dark')` 与 `document.documentElement.lang`。
  - 暴露：`theme, setTheme, resolvedTheme, language, setLanguage, t(text, vars?), locale`。`t` 用 `useCallback` 绑定当前语言。
- `src/components/preferences/`
  - `PopoverMenu.tsx`：通用弹出菜单（trigger + 面板、点击外部 / Escape 关闭、`aria-expanded`、向上弹出）。
  - `ThemeMenu.tsx`：外观行按钮 + 三选项菜单。
  - `LanguageMenu.tsx`：语言行按钮 + 两选项菜单。
  - `MobilePreferencesMenu.tsx`：移动端头部触发按钮 + 面板（外观 / 语言 / 设置入口）。

### 修改文件

- `src/main.tsx`：`PreferencesProvider` 包裹 `ErrorBoundary + BrowserRouter + App`。
- `src/App.tsx`：删除根组件的 theme state 与 effect；`DesignChecker` 与各页面改用 `usePreferences()`。全站文案替换为 `t(...)`。
- `src/pages/ProjectManagement.tsx`：侧栏改为「固定头部 + 可滚动分类 + 固定底部偏好区」；底部三行：外观（当前值）、语言（简体中文/English）、设置（齿轮 → `/settings`）。移除头部设置齿轮；移动端头部改为偏好菜单按钮。`formatRelativeDate` 接收 `t/locale`。修复 `ProjectCard` 误传 `theme`（`system` 被当作浅色）的问题，改传 `resolvedTheme`。
- `src/pages/ModelSettings.tsx`、`src/components/AiModelForm.tsx`、`src/components/AnalyzeActionBar.tsx`、`src/components/DifferenceListItemV2.tsx`：改用 `usePreferences()` 获取主题与 `t`，文案替换。
- `src/components/ErrorBoundary.tsx`：报错 UI 抽为函数子组件消费 context，文案翻译。
- 日期：所有 `toLocale*` 传入 `locale`；「刚刚 / 今天 / 昨天 / 已保存 n 分钟前」等相对时间走字典插值。

### 数据流

1. 用户在偏好区选择主题/语言 → Provider 更新 state。
2. Provider effect 写 localStorage、更新 `<html>` 的 `dark` class 与 `lang`。
3. 所有消费 `usePreferences()` 的组件因 context 变化重渲染，`t()` 返回新语言文案。
4. 页面 `document.title` effect 依赖 `t`，随语言更新。

## 交互规格

### 桌面侧栏底部

- 分类列表区域 `flex-1 overflow-y-auto min-h-0`，底部偏好区 `border-t` 固定。
- 三行按钮，样式与 NavItem 一致（图标 + 文案 + 当前值/chevron）：
  - 外观：显示当前主题名（跟随系统/浅色/深色），点击向上弹出菜单，选中项带 check。
  - 语言：显示「简体中文」或「English」，点击向上弹出两项菜单。语言名本身不翻译（各语言显示自己的名字）。
  - 设置：齿轮图标 + 「设置」，`navigate('/settings')`。
- 菜单：点击外部或 Escape 关闭；`aria-haspopup="menu"`、`aria-expanded`；菜单项 `role="menuitemradio"` + `aria-checked`。

### 移动端头部

- 原设置齿轮位置改为「偏好」图标按钮（SlidersHorizontal），点击弹出面板，包含外观三选项、语言两选项、「设置」入口（与桌面侧栏一致）。
- 选择后关闭面板；进入设置页后返回仍保留偏好。

## 翻译规则

- 以中文原文为 key；英文缺失时回退中文，保证新增文案不阻塞。
- 拼接文案改为整句模板 + 插值：`第 {n} 轮` → `Round {n}`；`已保存 {n} 分钟前` → `Saved {n} min ago`；`确定删除「{name}」？` → `Delete "{name}"?` 等。
- 语言选项显示母语名：简体中文 / English。
- 服务端错误消息原样展示（本身多为英文契约文案），不做二次翻译。

## 测试与验收

- Vitest（先行）：`translate()` 的中文直通、英文命中、缺失回退、`{var}` 插值、未知变量保留原样。
- 浏览器 E2E：
  - 三态主题切换即时生效，`html.dark` 正确；刷新后保留；`system` 跟随系统。
  - 切换英文后，Dashboard / Checker / 模型设置页可见文本、`aria-label`、`title`、`placeholder` 无残留中文（用户数据除外）。
  - 390px 移动端头部偏好菜单可达，三项功能可用。
  - 设置入口跳转正常；模型设置页增删改/测试连接流程不受影响。
- `npm test`、`npm run lint`、`npm run build` 全绿。

## 非目标

- 服务端偏好同步、多用户偏好隔离。
- 第三种语言、按文案命名空间拆分、复数规则引擎。
- Checker 内新增偏好控件（其顶部设置齿轮已于 2026-11-11 移除，不保留任何设置/偏好入口）。
- URL 语言前缀或 SEO 多语言。
