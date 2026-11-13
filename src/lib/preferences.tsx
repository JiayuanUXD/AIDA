import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Language, LANGUAGE_STORAGE_KEY, localeOf, normalizeLanguage, translate } from './i18n';

export type Theme = 'light' | 'dark' | 'system';

export const normalizeTheme = (raw: string | null | undefined): Theme =>
  raw === 'light' || raw === 'dark' ? raw : 'system';

/**
 * 读取 localStorage。隐私模式 / 禁用存储 / 沙箱 iframe 下 localStorage 会直接抛错，
 * 这里统一降级为 null，避免整个应用白屏。
 */
export const readStoredValue = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

/** 写入 localStorage，失败时静默忽略（偏好只是便利功能，不应影响主流程）。 */
export const writeStoredValue = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 存储不可用时偏好仅在本次会话内生效
  }
};

/** 系统是否偏好深色；matchMedia 缺失时按浅色处理。 */
export const readSystemTheme = (): 'light' | 'dark' => {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
};

/**
 * 原生表单控件的下拉弹层（<select> / <datalist>）由 CSS color-scheme 决定配色，
 * 不跟随我们自己的 dark 类。不同步的话，深色主题下会出现"浅色弹层 + 浅色文字"。
 */
export const colorSchemeFor = (resolvedTheme: 'light' | 'dark'): 'light' | 'dark' =>
  resolvedTheme;

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

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => normalizeTheme(readStoredValue('theme')));
  const [language, setLanguage] = useState<Language>(() => normalizeLanguage(readStoredValue(LANGUAGE_STORAGE_KEY)));
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => {
    const stored = normalizeTheme(readStoredValue('theme'));
    return stored === 'system' ? readSystemTheme() : stored;
  });

  useEffect(() => {
    writeStoredValue('theme', theme);
    if (theme !== 'system') {
      setResolvedTheme(theme);
      return;
    }
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      setResolvedTheme('light');
      return;
    }
    const handler = (e: MediaQueryListEvent) => setResolvedTheme(e.matches ? 'dark' : 'light');
    setResolvedTheme(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  useEffect(() => {
    writeStoredValue(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = localeOf(language);
  }, [language]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
    document.documentElement.style.colorScheme = colorSchemeFor(resolvedTheme);
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

/**
 * 读取偏好；没有 Provider 时返回 null。
 * 错误边界用它来渲染错误页——错误页不能依赖 Provider 一定可用。
 */
export function useOptionalPreferences(): PreferencesValue | null {
  return useContext(PreferencesContext);
}

/**
 * 返回一个引用稳定的翻译函数：函数本体不随语言切换而更换，
 * 但调用时总是用最新的语言。用于 effect 依赖里只需要 t 的场景——
 * 否则每次切换语言都会重建订阅 / 重新拉数据。
 */
export function useStableTranslator(): (text: string, vars?: Record<string, string | number>) => string {
  const { t } = usePreferences();
  const ref = useRef(t);
  ref.current = t;
  return useCallback((text: string, vars?: Record<string, string | number>) => ref.current(text, vars), []);
}

export function usePreferences(): PreferencesValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
}