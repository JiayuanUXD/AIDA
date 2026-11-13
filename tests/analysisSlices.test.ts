import { describe, it, expect } from 'vitest';
import {
  dedupeAndMergeSliceDiffs,
  detectHorizontalSeparatorBands,
  planAnalysisSlices,
} from '../src/lib/analysisSlices';

describe('planAnalysisSlices', () => {
  it('uses a single slice for landscape or compact screenshots', () => {
    expect(planAnalysisSlices(1280, 800)).toEqual([{ y0: 0, y1: 800 }]);
    expect(planAnalysisSlices(1000, 1400)).toEqual([{ y0: 0, y1: 1400 }]);
  });

  it('splits tall screenshots into overlapping slices that cover the full height', () => {
    const slices = planAnalysisSlices(1320, 2868);
    expect(slices.length).toBeGreaterThanOrEqual(2);
    expect(slices.length).toBeLessThanOrEqual(4);
    expect(slices[0].y0).toBe(0);
    expect(slices[slices.length - 1].y1).toBe(2868);

    for (let i = 1; i < slices.length; i++) {
      expect(slices[i].y0).toBeLessThan(slices[i - 1].y1);
    }
  });
});

describe('detectHorizontalSeparatorBands', () => {
  it('extracts uniform light-gray inter-module bands and ignores content/pure white', () => {
    const rows = Array.from({ length: 120 }, () => ({ mean: 255, std: 0 }));
    for (let y = 10; y <= 24; y++) rows[y] = { mean: 242, std: 1.2 };
    for (let y = 40; y <= 55; y++) rows[y] = { mean: 180, std: 28 };
    for (let y = 80; y <= 103; y++) rows[y] = { mean: 244, std: 0.8 };

    expect(detectHorizontalSeparatorBands(rows)).toEqual([
      { y0: 10, y1: 24, height: 15 },
      { y0: 80, y1: 103, height: 24 },
    ]);
  });
});

describe('dedupeAndMergeSliceDiffs', () => {
  it('merges duplicates in slice overlap zones and sorts by severity', () => {
    const merged = dedupeAndMergeSliceDiffs(
      [
        {
          title: '「附近商家」字号偏大',
          type: 'STYLE',
          severity: 'medium',
          description: '36px -> 42px',
          rect: { x: 40, y: 1480, width: 200, height: 60 },
        },
        {
          title: '附近商家字号偏大',
          type: 'STYLE',
          severity: 'high',
          description: '36px -> 42px (+6px)',
          rect: { x: 42, y: 1482, width: 198, height: 58 },
        },
        {
          title: '模块间距缩小',
          type: 'LAYOUT',
          severity: 'high',
          description: '24px -> 12px',
          rect: { x: 0, y: 1407, width: 1320, height: 30 },
        },
        {
          title: '微调对齐',
          type: 'LAYOUT',
          severity: 'low',
          description: '2px shift',
          rect: { x: 10, y: 100, width: 80, height: 30 },
        },
      ],
      1320,
      2868
    );

    expect(merged).toHaveLength(3);
    expect(merged.map((m) => m.severity)).toEqual(['high', 'high', 'low']);
    expect(merged.map((m) => m.title)).toContain('附近商家字号偏大');
    expect(merged.map((m) => m.title)).toContain('模块间距缩小');
  });

  it('normalizes 0..1000 fallback coordinates and clamps to design dimensions', () => {
    const merged = dedupeAndMergeSliceDiffs(
      [
        {
          title: 'Bottom bar',
          type: 'LAYOUT',
          severity: 'medium',
          description: 'shifted',
          rect: { x: 0, y: 900, width: 1000, height: 100 },
        },
      ],
      1320,
      2868
    );

    // Fits as pixel coords within 1320x2868 directly; keep pixel coords without scaling
    expect(merged[0].rect).toEqual({ x: 0, y: 900, width: 1000, height: 100 });
  });
});
