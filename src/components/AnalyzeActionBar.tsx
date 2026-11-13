import React from 'react';
import { ChevronDown, Loader2, Sparkles } from 'lucide-react';
import { usePreferences } from '../lib/preferences';

export type AiModelOption = {
  id: string;
  label: string;
  configured: boolean;
};

type Props = {
  theme: 'light' | 'dark';
  onAnalyze: () => void;
  models?: AiModelOption[];
  selectedModelId?: string;
  onSelectModel?: (id: string) => void;
  isAnalyzing: boolean;
  hasBothImages: boolean;
  hasDifferences: boolean;
};

export default function AnalyzeActionBar(props: Props) {
  const { t } = usePreferences();
  const {
    theme,
    onAnalyze,
    models = [],
    selectedModelId,
    onSelectModel,
    isAnalyzing,
    hasBothImages,
    hasDifferences,
  } = props;

  const selected = models.find((model) => model.id === selectedModelId);
  const label = selected?.label || 'AI';
  const hasChoice = models.length > 1;

  return (
    <div className={`p-0 border-t shrink-0 z-50 ${theme === 'dark' ? 'bg-[#1e1e1e] border-white/10' : 'bg-white border-black/5'}`}>
      <div className="flex items-center">
        <div className={`w-1/4 border-r ${theme === 'dark' ? 'bg-[#2c2c2c] border-[#383838]' : 'bg-gray-50 border-gray-200'}`}>
          {hasChoice ? (
            <div className="relative">
              <select
                aria-label={t('选择分析模型')}
                title={t('当前分析模型：{label}', { label })}
                value={selectedModelId || ''}
                onChange={(event) => onSelectModel?.(event.target.value)}
                disabled={isAnalyzing}
                className={`w-full appearance-none text-left text-[11px] font-bold pl-2 pr-6 py-3 bg-transparent cursor-pointer truncate focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
                  theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                }`}
              >
                {models.map((model) => (
                  <option key={model.id} value={model.id} disabled={!model.configured} className="text-gray-900 bg-white">
                    {model.label}{model.configured ? '' : t('（未配置）')}
                  </option>
                ))}
              </select>
              <ChevronDown
                className={`w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none ${
                  theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                }`}
              />
            </div>
          ) : (
            <div
              title={t('当前分析模型：{label}', { label: selected?.label || t('未配置') })}
              className={`w-full text-center text-[11px] font-bold px-2 py-3 truncate ${
                theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
              }`}
            >
              {label}
            </div>
          )}
        </div>
        <button
          onClick={onAnalyze}
          disabled={isAnalyzing || !hasBothImages}
          className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-[12px] font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{t('分析中...')}</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>{hasDifferences ? t('重新分析') : t('差异分析')}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
