import { describe, it, expect } from 'vitest';
import { buildAnalysisPrompt, buildSliceComparisonPrompt } from '../src/lib/analysisPrompt';

const dims = { designWidth: 390, designHeight: 844, buildWidth: 390, buildHeight: 844 };
const prompt = buildAnalysisPrompt(dims);

describe('buildAnalysisPrompt — fidelity acceptance contract', () => {
  it('frames the task as design fidelity acceptance, not copy proofreading', () => {
    expect(prompt).toContain('还原度验收');
  });

  it('embeds the true natural dimensions of both images', () => {
    expect(prompt).toContain('390x844');
  });

  it('uses the provided build dimensions too', () => {
    const p = buildAnalysisPrompt({ designWidth: 100, designHeight: 200, buildWidth: 300, buildHeight: 600 });
    expect(p).toContain('100x200');
    expect(p).toContain('300x600');
  });

  it('checks the core fidelity dimensions', () => {
    for (const dim of ['间距', '尺寸', '颜色', '字号', '圆角', '对齐']) {
      expect(prompt).toContain(dim);
    }
  });

  it('instructs to ignore pure copy/wording differences', () => {
    expect(prompt).toContain('忽略');
    expect(prompt).toContain('文案');
  });

  it('keeps missing/extra visible elements as reportable issues', () => {
    expect(prompt).toContain('缺失');
    expect(prompt).toContain('多余');
  });

  it('requires expected vs actual quantified comparison with a delta', () => {
    expect(prompt).toContain('预期');
    expect(prompt).toContain('实际');
    expect(prompt).toContain('差值');
  });

  it('requires severity graded by visual impact with high/medium/low', () => {
    expect(prompt).toContain('severity');
    expect(prompt).toContain('视觉影响');
    for (const level of ['high', 'medium', 'low']) {
      expect(prompt).toContain(level);
    }
  });

  it('keeps absolute pixel coordinate instructions and warns against normalized coords', () => {
    expect(prompt).toContain('rect');
    expect(prompt).toContain('像素');
    expect(prompt).toContain('归一化');
  });

  it('requires Simplified Chinese output and a JSON array', () => {
    expect(prompt).toContain('简体中文');
    expect(prompt).toContain('JSON');
  });
});

describe('buildSliceComparisonPrompt — side-by-side ruler & separator bands', () => {
  it('embeds composite dimensions, slice Y range, and detected separator bands', () => {
    const slicePrompt = buildSliceComparisonPrompt({
      designWidth: 1320,
      designHeight: 2868,
      buildWidth: 1320,
      buildHeight: 2868,
      sliceY0: 880,
      sliceY1: 2080,
      compositeWidth: 2736,
      designBands: [{ y0: 1407, y1: 1430, height: 24 }],
      buildBands: [{ y0: 1491, y1: 1502, height: 12 }],
    });

    expect(slicePrompt).toContain('2736px');
    expect(slicePrompt).toContain('y=880..2080');
    expect(slicePrompt).toContain('y=1407..1430(高24px)');
    expect(slicePrompt).toContain('y=1491..1502(高12px)');
    expect(slicePrompt).toContain('动态运营数据');
    expect(slicePrompt).toContain('字号');
    expect(slicePrompt).toContain('模块间距');
  });
});
