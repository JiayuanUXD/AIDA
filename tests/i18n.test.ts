import { describe, it, expect } from 'vitest';
import {
  translate,
  localeOf,
  normalizeLanguage,
  enMessages,
  UNTITLED_PROJECT_NAME,
  localizeProjectName,
  ApiError,
  errorText,
} from '../src/lib/i18n';

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

describe('localizeProjectName', () => {
  const t = (text: string) => translate('en', text);

  it('localizes the untitled-project placeholder', () => {
    expect(localizeProjectName(UNTITLED_PROJECT_NAME, t)).toBe('Untitled project');
  });
  it('localizes the placeholder created under another language', () => {
    expect(localizeProjectName('Untitled project', t)).toBe('Untitled project');
    expect(localizeProjectName('Untitled project', (text) => translate('zh', text))).toBe('未命名项目');
  });  it('leaves user-defined names untouched', () => {
    expect(localizeProjectName('官网改版', t)).toBe('官网改版');
    expect(localizeProjectName('AIDA Revamp', t)).toBe('AIDA Revamp');
  });
});

describe('errorText', () => {
  const t = (text: string, vars?: Record<string, string | number>) => translate('en', text, vars);

  it('translates client-authored errors', () => {
    const err = new ApiError(undefined, '请求失败（{status}）', { status: 500 });
    expect(errorText(err, t)).toBe('Request failed (500)');
  });
  it('keeps server error text verbatim', () => {
    const err = new ApiError('Model id already exists');
    expect(errorText(err, t)).toBe('Model id already exists');
  });
  it('uses the fallback for plain errors', () => {
    expect(errorText(new Error('boom'), t, 'fallback')).toBe('boom');
    expect(errorText(new Error(''), t, 'fallback')).toBe('fallback');
    expect(errorText(undefined, t, 'fallback')).toBe('fallback');
  });
});