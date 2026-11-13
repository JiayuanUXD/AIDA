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
      // 把当前值也读出来，否则读屏只会念"外观"，听不到当前是浅色还是深色
      ariaLabel={`${t('外观')}：${label}`}
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