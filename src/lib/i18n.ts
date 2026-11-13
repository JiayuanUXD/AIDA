export type Language = 'zh' | 'en';

export const LANGUAGE_STORAGE_KEY = 'aida:language';

/**
 * 未命名项目的内部占位值。
 * 存进服务端的是这个中文常量（属于数据，不是 UI 文案），因此不随界面语言变化；
 * 渲染时由 UNTITLED_PROJECT_NAME 与 t('未命名项目') 的比对决定是否显示本地化文案。
 */
export const UNTITLED_PROJECT_NAME = '未命名项目';

/**
 * 项目名是用户数据，不做翻译；但"未命名项目"是应用自身的占位值，
 * 需要按当前语言显示。比对用与当前语言无关的固定集合，
 * 这样历史上以任意语言创建的默认项目都能正确显示。
 */
export const UNTITLED_PROJECT_NAMES: readonly string[] = [
  UNTITLED_PROJECT_NAME,
  'Untitled project',
];

export const localizeProjectName = (
  name: string,
  t: (text: string) => string,
): string => (UNTITLED_PROJECT_NAMES.includes(name) ? t('未命名项目') : name);

/**
 * 客户端自己合成的错误（例如 HTTP 失败但服务端没有返回错误正文）。
 * 服务端返回的错误原文不属于 UI 文案，直接透传；
 * 只有本类错误才带字典键，交给界面层用当前语言渲染。
 */
export class ApiError extends Error {
  readonly i18nKey?: string;
  readonly vars?: Record<string, string | number>;

  constructor(serverMessage?: string, i18nKey?: string, vars?: Record<string, string | number>) {
    super(serverMessage || i18nKey || 'Request failed');
    this.name = 'ApiError';
    this.i18nKey = i18nKey;
    this.vars = vars;
  }
}

/** 把捕获到的错误渲染成当前语言的文案；服务端原文保持不动。 */
export const errorText = (
  error: unknown,
  t: (text: string, vars?: Record<string, string | number>) => string,
  fallback?: string,
): string => {
  if (error instanceof ApiError && error.i18nKey) {
    return t(error.i18nKey, error.vars);
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback ?? '';
};

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
  '请求失败（{status}）': 'Request failed ({status})',
  '加载集合 {collection} 失败（{status}）': 'Failed to load collection {collection} ({status})',
  '向集合 {collection} 添加文档失败': 'Failed to add a document to collection {collection}',
  '更新集合 {collection} 中的文档 {id} 失败': 'Failed to update document {id} in collection {collection}',
  '删除集合 {collection} 中的文档 {id} 失败': 'Failed to delete document {id} from collection {collection}',
  '上传 {path} 失败': 'Failed to upload {path}',
  '删除 {path} 失败': 'Failed to delete {path}',
  '页面出错了': 'Something went wrong',
  '应用遇到了意外错误，请刷新页面重试。': 'The app hit an unexpected error. Reload the page to try again.',
  // —— 项目列表 ——
  '刚刚': 'Just now',
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
  '取消星标': 'Unstar',
  '加星标': 'Star',
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
  '展开模型列表': 'Open model list',
  '收起模型列表': 'Close model list',
  '未找到匹配的模型': 'No matching models',
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
  '已创建轮次 {n}': 'Round {n} created',
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
  '本回答由 AI（{model}）生成，内容仅供参考': 'Generated by AI ({model}); for reference only',
  '本回答由 AI生成，内容仅供参考': 'Generated by AI; for reference only',
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