import React from 'react';
import { Check, Languages, Monitor, Moon, Settings, SlidersHorizontal, Sun } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePreferences, Theme } from '../../lib/preferences';
import { Language } from '../../lib/i18n';
import PopoverMenu from './PopoverMenu';

const names: Record<Language, string> = { zh: '简体中文', en: 'English' };

export default function MobilePreferencesMenu() {
  const { theme, setTheme, language, setLanguage, resolvedTheme, t } = usePreferences();
  const navigate = useNavigate();
  const isDark = resolvedTheme === 'dark';
  return (
    <PopoverMenu
      label={t('偏好设置')}
      className="md:hidden"
      placement="down"
      align="right"
      trigger={() => (
        <span className={`inline-flex p-2 rounded-lg transition-colors ${
          isDark ? 'text-gray-400 hover:text-white hover:bg-[#2c2c2c]' : 'text-gray-500 hover:text-indigo-600 hover:bg-gray-100'
        }`}>
          <SlidersHorizontal className="w-4 h-4" />
        </span>
      )}
    >
      {(close) => (
        <div className="py-1">
          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{t('外观')}</div>
          {(['system', 'light', 'dark'] as Theme[]).map((value) => {
            const Icon = value === 'system' ? Monitor : value === 'light' ? Sun : Moon;
            const text = value === 'system' ? t('跟随系统') : value === 'light' ? t('浅色') : t('深色');
            return (
              <button key={value} role="menuitemradio" aria-checked={theme === value}
                onClick={() => { setTheme(value); close(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5">
                <Icon className="w-4 h-4" /><span className="flex-1 text-left">{text}</span>
                {theme === value && <Check className="w-4 h-4 text-indigo-500" />}
              </button>
            );
          })}
          <div className="px-3 py-1.5 mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400 border-t border-gray-100 dark:border-[#383838]">{t('语言')}</div>
          {(['zh', 'en'] as Language[]).map((value) => (
            <button key={value} role="menuitemradio" aria-checked={language === value}
              onClick={() => { setLanguage(value); close(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5">
              <Languages className="w-4 h-4" /><span className="flex-1 text-left">{names[value]}</span>
              {language === value && <Check className="w-4 h-4 text-indigo-500" />}
            </button>
          ))}
          <button role="menuitem" onClick={() => { close(); navigate('/settings'); }}
            className="w-full flex items-center gap-2 px-3 py-2 mt-1 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 border-t border-gray-100 dark:border-[#383838]">
            <Settings className="w-4 h-4" /><span className="flex-1 text-left">{t('设置')}</span>
          </button>
        </div>
      )}
    </PopoverMenu>
  );
}