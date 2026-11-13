import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  normalizeTheme,
  readStoredValue,
  writeStoredValue,
  readSystemTheme,
  colorSchemeFor,
} from '../src/lib/preferences';

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

describe('readStoredValue', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the stored value', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => 'dark' } });
    expect(readStoredValue('theme')).toBe('dark');
  });

  it('returns null when localStorage throws', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('SecurityError');
        },
      },
    });
    expect(readStoredValue('theme')).toBeNull();
  });
});

describe('writeStoredValue', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes the value', () => {
    const setItem = vi.fn();
    vi.stubGlobal('window', { localStorage: { setItem } });
    writeStoredValue('theme', 'light');
    expect(setItem).toHaveBeenCalledWith('theme', 'light');
  });

  it('swallows storage failures', () => {
    vi.stubGlobal('window', {
      localStorage: {
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
      },
    });
    expect(() => writeStoredValue('theme', 'light')).not.toThrow();
  });
});

describe('readSystemTheme', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports dark when the media query matches', () => {
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: true }),
    });
    expect(readSystemTheme()).toBe('dark');
  });

  it('reports light when the media query does not match', () => {
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false }),
    });
    expect(readSystemTheme()).toBe('light');
  });

  it('falls back to light when matchMedia is unavailable', () => {
    vi.stubGlobal('window', {
      matchMedia: () => {
        throw new Error('not supported');
      },
    });
    expect(readSystemTheme()).toBe('light');
  });
});

describe('colorSchemeFor', () => {
  it('maps the resolved theme to a CSS color-scheme', () => {
    // 原生下拉弹层（select / datalist）的背景由 color-scheme 决定，
    // 必须跟着应用主题走，否则深色主题下会出现浅色弹层 + 浅色文字。
    expect(colorSchemeFor('dark')).toBe('dark');
    expect(colorSchemeFor('light')).toBe('light');
  });
});
