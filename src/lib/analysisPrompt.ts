export interface AnalysisPromptDims {
  designWidth: number;
  designHeight: number;
  buildWidth: number;
  buildHeight: number;
}

export interface SeparatorBand {
  y0: number;
  y1: number;
  height: number;
}

export interface SliceComparisonPromptParams extends AnalysisPromptDims {
  sliceY0: number;
  sliceY1: number;
  compositeWidth: number;
  designBands: SeparatorBand[];
  buildBands: SeparatorBand[];
  maxItems?: number;
}

// 视觉还原度验收 prompt：引导模型像资深设计师一样关注 UI 形态（间距/尺寸/颜色/字体等），
// 而非校对文案或动态运营数据。
export const buildAnalysisPrompt = ({
  designWidth,
  designHeight,
  buildWidth,
  buildHeight,
}: AnalysisPromptDims): string => `
你是一位资深视觉设计师，正在对开发稿做「设计还原度验收」（design fidelity QA）。
图片 1 是 设计稿 (DESIGN SOURCE)（预期设计）。
图片 2 是 开发稿 (BUILD SOURCE)（实际实现）。

目标：判断开发稿在「视觉形态」上对设计稿的还原程度，而不是校对文案或动态业务数据。

【验收维度】请按以下优先级逐项排查（越靠前越优先）：
1. 间距 (SPACING)：相邻大模块之间的灰色/背景分隔带高度、卡片内边距/外边距、元素间隙、行高、分组密度。
2. 字体 (TYPOGRAPHY)：同层级标题/Tab/标签/价格的字号、字重、行高、字间距、字体族（重点关注字号偏大/偏小）。
3. 尺寸 (SIZE)：元素/图标/头像/按钮/胶囊标签的宽高。
4. 颜色 (COLOR)：填充/文字/边框/背景色（给出估算 hex）。
5. 圆角·边框·阴影 (RADIUS/BORDER/SHADOW)：圆角大小、边框粗细/颜色、阴影偏移/模糊/颜色/透明度。
6. 对齐 (ALIGNMENT)：左/中/右对齐、基线、视觉重心。
7. 元素缺失/多余 (MISSING/EXTRA)：固定功能入口、角标、按钮、悬浮控件的缺失或多余（按布局问题报告）。
8. 层级·强调 (HIERARCHY)：主按钮/CTA 的视觉强调、信息层级是否被削弱。

【严格忽略以下动态运营数据（不要报告！）】：
- 搜索框热词、列表或卡片中的具体商品名称/商家名称/门店名/配图/价格数字/营销标签文案（如不同商家、不同商品、不同优惠金额）——这些属于后端动态数据，只检查其排版字号、行高、间距、圆角与配色规范。
- 纯文案/措辞/标点/翻译差异（除非改变了容器布局或视觉形态）。
- 占位文案 vs 真实内容、真实数据导致的换行/长度变化。
- 亚像素抗锯齿、OS/浏览器/字体渲染差异、图片压缩噪点。
但不要忽略：缺失图标、主 CTA 的对齐/颜色错误、明显的尺寸/字号/模块间距跳变。

【每条差异的描述要求】
- 给出「预期(设计稿) → 实际(开发稿)」的量化对比与差值，尽量估算具体数值与单位。
  例：间距 24px → 12px（-12px）；色值 #4F46E5 → #3B82F6；字号 16px → 19px（+3px）；圆角 8px → 20px；图标 48px → 40px。
- 数值是从图片估算的，无法精确到像素时给出最接近的估计，不要编造精确真值。
- 只描述具体维度的具体偏差，禁止「感觉不对」「不够美观」这类主观评判。

【严重度 severity】按「视觉影响」而非类别或面积判定，取值 high / medium / low：
- high：主操作/CTA 或固定入口缺失、错位或颜色明显错误；破坏模块间距/布局或信息层级；品牌色/关键字号明显错误。
- medium：可感知的间距/字号/颜色/圆角偏差，影响观感但不破坏层级。
- low：轻微光学对齐或细小间距偏差，不影响层级。
（主按钮或模块标题上一处字号/色差，比装饰区差异更重要。）

【坐标 rect】对每个差异给出相对设计稿（图片 1）的精确像素边界框：
- x: 距设计稿左边缘的像素；y: 距设计稿顶边缘的像素；width/height: 受影响区域的宽高。
设计稿的真实尺寸是 ${designWidth}x${designHeight}。
开发稿的真实尺寸是 ${buildWidth}x${buildHeight}。
【特别注意】务必使用基于原始像素尺寸的绝对值（x 在 0-${designWidth} 之间，y 在 0-${designHeight} 之间），不要返回 0-1000 的归一化坐标。若你的内部视觉系统使用归一化坐标，请乘以图片尺寸转换为像素后再返回。
如果两图没有完美对齐，请先根据关键地标（如页眉或徽标）在心理上对齐它们，再识别差异。

【输出】以 JSON 对象数组返回，每个对象字段：
{ "title": 简体中文短语, "type": "LAYOUT" | "STYLE" | "CONTENT", "severity": "high" | "medium" | "low", "description": 简体中文（含预期→实际与差值）, "rect": { "x": number, "y": number, "width": number, "height": number } }
type 映射：间距/尺寸/对齐/缺失多余/层级 → LAYOUT；颜色/字体/圆角/边框/阴影 → STYLE；仅当确有内容层面问题时才用 CONTENT。
按严重度从高到低排序，最多 15 条，优先填满最能感知的 UI 还原度缺陷。
重要提示：所有 title / description 必须使用简体中文。
`;

const formatBands = (bands: SeparatorBand[]) =>
  bands.length > 0
    ? bands.map((b) => `y=${b.y0}..${b.y1}(高${b.height}px)`).join("、")
    : "未检测到明显纯色分隔带";

export const buildSliceComparisonPrompt = ({
  designWidth,
  designHeight,
  buildWidth,
  buildHeight,
  sliceY0,
  sliceY1,
  compositeWidth,
  designBands,
  buildBands,
  maxItems = 8,
}: SliceComparisonPromptParams): string => `
你是一位极其严苛的资深 UI 视觉设计师，正在做「设计还原度验收」（design fidelity QA）。
下图是一张「左右并排对照切片图」（总宽 ${compositeWidth}px）：
- 左半区（x=0..${designWidth}）是【设计稿 (DESIGN)】，右半区是【开发稿 (BUILD)】，中间标尺标注了原始 Y 坐标。
- 本切片覆盖设计稿纵向像素范围 y=${sliceY0}..${sliceY1}（整张设计稿真实尺寸 ${designWidth}x${designHeight}，开发稿真实尺寸 ${buildWidth}x${buildHeight}）。若切片最顶部或最底部出现跨边界被裁切的局部元素，切勿误判为缺失或新增导航栏。
- 贯穿左右两图的浅紫色水平线处于完全相同的原始 Y 坐标，纵向辅助线标出了设计稿 X 坐标，专门用于对齐测量「模块间距」「元素位移」与「字号/行高差异」。

【程序预检出的水平分隔带（模块间距客观测量参考）】：
- 设计稿分隔带：${formatBands(designBands)}
- 开发稿分隔带：${formatBands(buildBands)}
请结合左右视觉模块位置，重点核查对应模块之间的垂直间距/分隔带高度是否一致（例如相邻模块间的留白变窄、变宽或模块整体上移/下移）！

【验收维度（按优先级排查）】：
1. 模块间距与留白 (SPACING)：相邻大模块之间的分隔带高度、卡片内边距/外边距、上下行距。
2. 字号与字重 (TYPOGRAPHY)：同一层级标题、Tab、胶囊标签、价格数字的文字大小与粗细对比（如标题字号偏大/偏小）。
3. 容器尺寸·圆角·边框·颜色 (SIZE / RADIUS / STYLE)：徽标/按钮/卡片的宽高、圆角、边框粗细、背景或文字色值（给出估算 hex）。
4. 对齐与结构元素 (ALIGNMENT / MISSING / EXTRA)：固定功能入口、角标、按钮、悬浮控件的缺失/多余或明显偏移。

【严格忽略以下动态运营数据（绝对不要报告！）】：
- 搜索框热词、列表或卡片中的具体商品名称/商家名称/门店名/配图/价格数字/营销活动文案（例如某商家换成了另一家店、商品图或价格数字不同）——这些属于后端动态下发数据！**只对比它们的排版字号、行高、间距、圆角、边框与颜色规范**。
- 亚像素抗锯齿或图片压缩噪点。

【每条差异的描述要求】
- 必须给出「预期(设计稿) → 实际(开发稿)」的量化对比与差值，例：模块间距 24px → 12px（-12px）；标题字号 36px → 42px（+6px）；色值 #FF6600 → #666666。
- 只描述具体维度的具体偏差，禁止「不够美观」「感觉不对」等主观评价。

【坐标 rect 严格要求】
- rect 必须使用**原始设计稿（左半区）的绝对像素坐标**：
  - x 必须在 0..${designWidth} 之间（整行宽度为 ${designWidth}，不要折半或归一化）
  - y 必须在 ${sliceY0}..${sliceY1} 之间
  - width / height 为受影响区域的原始像素宽高。

【输出】仅返回 JSON 对象数组，每个对象字段：
{ "title": 简体中文短语, "type": "LAYOUT" | "STYLE" | "CONTENT", "severity": "high" | "medium" | "low", "description": 简体中文（含预期→实际与差值）, "rect": { "x": number, "y": number, "width": number, "height": number } }
type 映射：间距/尺寸/对齐/缺失多余/层级 → LAYOUT；颜色/字体/圆角/边框/阴影 → STYLE；仅确有固定 UI 文案错误时用 CONTENT。
按 severity 从 high 到 low 排序，本切片最多输出 ${maxItems} 条最明显的真实 UI 还原度缺陷。所有 title / description 必须使用简体中文。
`;
