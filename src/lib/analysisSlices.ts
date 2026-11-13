import {
  buildSliceComparisonPrompt,
  type SeparatorBand,
} from './analysisPrompt';

export interface SliceRange {
  y0: number;
  y1: number;
}

export interface RowBrightnessStat {
  mean: number;
  std: number;
}

export interface RawAnalysisDiff {
  title?: unknown;
  type?: unknown;
  severity?: unknown;
  description?: unknown;
  rect?: {
    x?: unknown;
    y?: unknown;
    width?: unknown;
    height?: unknown;
  } | null;
  [key: string]: unknown;
}

export interface PreparedComparisonSlice {
  slice: SliceRange;
  comparisonImage: string;
  prompt: string;
}

export interface PreparedComparisonResult {
  designWidth: number;
  designHeight: number;
  buildWidth: number;
  buildHeight: number;
  slices: PreparedComparisonSlice[];
}

const SEVERITY_RANK: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Splits tall mobile/web screenshots into overlapping viewport-proportioned
 * slices so vision encoders keep fine typography and spacing readable.
 */
export const planAnalysisSlices = (
  designWidth: number,
  designHeight: number,
  maxSlices = 4
): SliceRange[] => {
  if (designWidth <= 0 || designHeight <= 0) {
    return [{ y0: 0, y1: Math.max(0, designHeight) }];
  }

  // Single slice is enough when aspect ratio is roughly 1.55:1 or shorter.
  if (designHeight / designWidth <= 1.55 || maxSlices <= 1) {
    return [{ y0: 0, y1: designHeight }];
  }

  const targetSliceHeight = Math.max(400, Math.round(designWidth * 1.02));
  const overlap = Math.min(260, Math.round(targetSliceHeight * 0.2));
  const step = Math.max(200, targetSliceHeight - overlap);
  const estimatedCount = Math.ceil((designHeight - overlap) / step);
  const count = Math.min(maxSlices, Math.max(2, estimatedCount));

  const effectiveStep = (designHeight - overlap) / count;
  const effectiveHeight = Math.ceil(effectiveStep + overlap);

  const slices: SliceRange[] = [];
  for (let i = 0; i < count; i++) {
    const y0 = i === 0 ? 0 : Math.min(designHeight - 1, Math.round(i * effectiveStep));
    const y1 = i === count - 1 ? designHeight : Math.min(designHeight, y0 + effectiveHeight);
    slices.push({ y0, y1 });
  }
  return slices;
};

/**
 * Detects uniform light-gray horizontal separator bands (inter-module gutters)
 * from per-row luminance mean and standard deviation.
 */
export const detectHorizontalSeparatorBands = (
  rowStats: RowBrightnessStat[]
): SeparatorBand[] => {
  const bands: { y0: number; y1: number }[] = [];

  for (let y = 0; y < rowStats.length; y++) {
    const { mean, std } = rowStats[y];
    const isLightSeparator = std < 4.5 && mean >= 220 && mean <= 252;
    if (!isLightSeparator) continue;

    const last = bands[bands.length - 1];
    if (last && y <= last.y1 + 2) {
      last.y1 = y;
    } else {
      bands.push({ y0: y, y1: y });
    }
  }

  return bands
    .map(({ y0, y1 }) => ({ y0, y1, height: y1 - y0 + 1 }))
    .filter((band) => band.height >= 4 && band.height <= 140);
};

const bandsInSlice = (bands: SeparatorBand[], y0: number, y1: number): SeparatorBand[] =>
  bands.filter((b) => (b.y0 >= y0 && b.y0 <= y1) || (b.y1 >= y0 && b.y1 <= y1));

const rectIou = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): number => {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;

  const ix1 = Math.max(a.x, b.x);
  const iy1 = Math.max(a.y, b.y);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);

  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  if (inter <= 0) return 0;

  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
};

const normalizeRawRect = (
  raw: RawAnalysisDiff['rect'],
  designWidth: number,
  designHeight: number
) => {
  let x = typeof raw?.x === 'number' && Number.isFinite(raw.x) ? raw.x : 0;
  let y = typeof raw?.y === 'number' && Number.isFinite(raw.y) ? raw.y : 0;
  let width = typeof raw?.width === 'number' && Number.isFinite(raw.width) ? raw.width : 100;
  let height = typeof raw?.height === 'number' && Number.isFinite(raw.height) ? raw.height : 100;

  const fitsAsPixels =
    x >= 0 && y >= 0 && x + width <= designWidth && y + height <= designHeight;
  const isNormalized1 = x <= 1 && y <= 1 && width <= 1 && height <= 1;
  const isNormalized1000 =
    !isNormalized1 &&
    !fitsAsPixels &&
    x <= 1000 &&
    y <= 1000 &&
    width <= 1000 &&
    height <= 1000 &&
    (designWidth > 1200 || designHeight > 1200);

  if (isNormalized1000) {
    x = (x / 1000) * designWidth;
    y = (y / 1000) * designHeight;
    width = (width / 1000) * designWidth;
    height = (height / 1000) * designHeight;
  } else if (isNormalized1) {
    x = x * designWidth;
    y = y * designHeight;
    width = width * designWidth;
    height = height * designHeight;
  }

  x = Math.max(0, Math.min(designWidth, x));
  y = Math.max(0, Math.min(designHeight, y));
  width = Math.max(12, Math.min(designWidth - x, width));
  height = Math.max(12, Math.min(designHeight - y, height));

  return { x, y, width, height };
};

const normalizeTitleKey = (title: unknown) =>
  typeof title === 'string'
    ? title.trim().toLowerCase().replace(/[\s「」『』"'`·\-_:：，,。.()（）]/g, '')
    : '';

/**
 * Normalizes rects across overlapping slices, deduplicates overlapping findings
 * in slice seams, sorts by severity, and caps the final list.
 */
export const dedupeAndMergeSliceDiffs = (
  items: RawAnalysisDiff[],
  designWidth: number,
  designHeight: number,
  maxTotal = 15
) => {
  const normalized = items
    .filter((item): item is RawAnalysisDiff => Boolean(item && typeof item === 'object'))
    .map((item) => {
      const severityRaw = typeof item.severity === 'string' ? item.severity.toLowerCase() : 'medium';
      const severity = severityRaw in SEVERITY_RANK ? severityRaw : 'medium';
      const typeRaw = typeof item.type === 'string' ? item.type.toUpperCase() : 'STYLE';
      const type = ['LAYOUT', 'STYLE', 'CONTENT'].includes(typeRaw) ? typeRaw : 'STYLE';
      return {
        ...item,
        type,
        severity,
        rect: normalizeRawRect(item.rect, designWidth, designHeight),
      };
    });

  // Highest severity first, then richer description
  normalized.sort((a, b) => {
    const rankDiff = (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0);
    if (rankDiff !== 0) return rankDiff;
    const descLenA = typeof a.description === 'string' ? a.description.length : 0;
    const descLenB = typeof b.description === 'string' ? b.description.length : 0;
    return descLenB - descLenA;
  });

  const kept: typeof normalized = [];
  for (const candidate of normalized) {
    const candKey = normalizeTitleKey(candidate.title);
    const duplicate = kept.some((existing) => {
      const iou = rectIou(existing.rect, candidate.rect);
      if (iou >= 0.45 && existing.type === candidate.type) return true;
      const existingKey = normalizeTitleKey(existing.title);
      if (candKey && existingKey && candKey === existingKey && iou >= 0.15) return true;
      return false;
    });
    if (!duplicate) {
      kept.push(candidate);
      if (kept.length >= maxTotal) break;
    }
  }

  return kept;
};

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image for comparison slice'));
    img.src = src;
  });

const computeImageRowStats = (img: HTMLImageElement, targetWidth: number, targetHeight: number): RowBrightnessStat[] => {
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];

  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
  const { data } = ctx.getImageData(0, 0, targetWidth, targetHeight);
  const marginX = Math.min(Math.floor(targetWidth * 0.05), 60);
  const xStart = marginX;
  const xEnd = Math.max(xStart + 1, targetWidth - marginX);
  const stepX = Math.max(1, Math.floor((xEnd - xStart) / 160));

  const stats: RowBrightnessStat[] = new Array(targetHeight);
  for (let y = 0; y < targetHeight; y++) {
    let sum = 0;
    let sumSq = 0;
    let count = 0;
    const rowOffset = y * targetWidth * 4;
    for (let x = xStart; x < xEnd; x += stepX) {
      const idx = rowOffset + x * 4;
      const lum = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      sum += lum;
      sumSq += lum * lum;
      count++;
    }
    const mean = count > 0 ? sum / count : 0;
    const variance = count > 0 ? Math.max(0, sumSq / count - mean * mean) : 0;
    stats[y] = { mean, std: Math.sqrt(variance) };
  }
  return stats;
};

/**
 * Generates side-by-side comparison slice images with X/Y coordinate rulers
 * and objective separator-band hints measured from both screenshots.
 */
export const prepareComparisonSlices = async (
  designDataUrl: string,
  buildDataUrl: string
): Promise<PreparedComparisonResult> => {
  const [designImg, buildImg] = await Promise.all([
    loadImage(designDataUrl),
    loadImage(buildDataUrl),
  ]);

  const designWidth = designImg.naturalWidth || 390;
  const designHeight = designImg.naturalHeight || 844;
  const buildWidth = buildImg.naturalWidth || designWidth;
  const buildHeight = buildImg.naturalHeight || designHeight;

  // Scale build proportionally to design width for side-by-side alignment.
  const scaledBuildHeight = Math.max(1, Math.round(buildHeight * (designWidth / buildWidth)));

  const designBands = detectHorizontalSeparatorBands(
    computeImageRowStats(designImg, designWidth, designHeight)
  );
  const buildBands = detectHorizontalSeparatorBands(
    computeImageRowStats(buildImg, designWidth, scaledBuildHeight)
  );

  const sliceRanges = planAnalysisSlices(designWidth, designHeight);
  const gutter = 96;
  const topBar = 44;
  const compositeWidth = designWidth * 2 + gutter;

  const slices: PreparedComparisonSlice[] = sliceRanges.map((slice) => {
    const sliceHeight = Math.max(1, slice.y1 - slice.y0);
    const canvas = document.createElement('canvas');
    canvas.width = compositeWidth;
    canvas.height = sliceHeight + topBar;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.fillStyle = '#ebedf3';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Left half: Design slice
      ctx.drawImage(
        designImg,
        0,
        slice.y0,
        designWidth,
        sliceHeight,
        0,
        topBar,
        designWidth,
        sliceHeight
      );

      // Right half: Build slice mapped proportionally to the same Y window
      const buildSrcY0 = Math.min(buildHeight - 1, Math.round((slice.y0 / designWidth) * buildWidth));
      const buildSrcH = Math.max(
        1,
        Math.min(buildHeight - buildSrcY0, Math.round((sliceHeight / designWidth) * buildWidth))
      );
      const buildDstH = Math.max(1, Math.round((buildSrcH / buildWidth) * designWidth));
      ctx.drawImage(
        buildImg,
        0,
        buildSrcY0,
        buildWidth,
        buildSrcH,
        designWidth + gutter,
        topBar,
        designWidth,
        buildDstH
      );

      // Top ruler labels & X-axis ticks on the design half
      const fontSize = Math.max(13, Math.round(designWidth * 0.015));
      ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, sans-serif`;
      ctx.fillStyle = '#1e293b';
      ctx.fillText(`DESIGN (x: 0..${designWidth})`, 14, Math.round(topBar * 0.45));
      ctx.fillText(`BUILD (${buildWidth}x${buildHeight})`, designWidth + gutter + 14, Math.round(topBar * 0.45));

      const xStep = Math.max(100, Math.round(designWidth / 4));
      for (let x = 0; x <= designWidth; x += xStep) {
        const tx = Math.min(x, designWidth - 1);
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tx, topBar - 8);
        ctx.lineTo(tx, canvas.height);
        ctx.stroke();

        ctx.fillStyle = '#4338ca';
        const labelX = x === 0 ? 4 : Math.min(designWidth - 48, tx - 18);
        ctx.fillText(`x=${x}`, labelX, topBar - 8);
      }

      // Horizontal alignment lines + Y ticks across both halves every 100px
      const firstTickY = Math.ceil(slice.y0 / 100) * 100;
      for (let y = firstTickY; y < slice.y1; y += 100) {
        const ly = topBar + (y - slice.y0);
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.32)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, ly);
        ctx.lineTo(canvas.width, ly);
        ctx.stroke();

        ctx.fillStyle = '#3730a3';
        ctx.fillText(`y=${y}`, designWidth + 10, Math.max(topBar + fontSize, ly - 4));
      }
    }

    const comparisonImage = canvas.toDataURL('image/jpeg', 0.9);
    const prompt = buildSliceComparisonPrompt({
      designWidth,
      designHeight,
      buildWidth,
      buildHeight,
      sliceY0: slice.y0,
      sliceY1: slice.y1,
      compositeWidth,
      designBands: bandsInSlice(designBands, slice.y0, slice.y1),
      buildBands: bandsInSlice(buildBands, slice.y0, slice.y1),
      maxItems: sliceRanges.length === 1 ? 12 : 8,
    });

    return { slice, comparisonImage, prompt };
  });

  return {
    designWidth,
    designHeight,
    buildWidth,
    buildHeight,
    slices,
  };
};
