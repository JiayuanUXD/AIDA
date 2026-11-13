import React from 'react';
import { Check, ChevronUp, Languages } from 'lucide-react';
import { usePreferences } from '../../lib/preferences';
import { Language } from '../../lib/i18n';
import PopoverMenu from './PopoverMenu';

const names: Record<Language, string> = { zh: '简体中文', en: 'English' };

export default function LanguageMenu() {
  const { language, setLanguage, resolvedTheme, t } = usePreferences();
  const isDark = resolvedTheme === 'dark';
  const rowClass = `w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm transition-colors ${
    isDark ? 'text-gray-300 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-50'
  }`;
  return (
    <PopoverMenu
      label={t('语言')}
      // 把当前语言也读出来，否则读屏只会念"语言"，听不到当前选的是哪种
      ariaLabel={`${t('语言')}：${names[language]}`}
      trigger={() => (
        <span className={rowClass}>
          <Languages className="w-4 h-4" />
          <span className="flex-1 text-left">{t('语言')}</span>
          <span className="text-xs text-gray-400">{names[language]}</span>
          <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
        </span>
      )}
    >
      {(close) => (
        <>
          {(['zh', 'en'] as Language[]).map((value) => (
            <button
              key={value}
              role="menuitemradio"
              aria-checked={language === value}
              onClick={() => { setLanguage(value); close(); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                language === value
                  ? 'text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/10'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5'
              }`}
            >
              <span className="flex-1 text-left">{names[value]}</span>
              {language === value && <Check className="w-4 h-4" />}
            </button>
          ))}
        </>
      )}
    </PopoverMenu>
  );
}