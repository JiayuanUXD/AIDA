import React from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import type { AnalyzeModel } from '../types/analysis';

type Props = {
  theme: 'light' | 'dark';
  selectedModel: AnalyzeModel;
  onModelChange: (model: AnalyzeModel) => void;
  onAnalyze: () => void;
  isAnalyzing: boolean;
  hasBothImages: boolean;
  hasDifferences: boolean;
};

export default function AnalyzeActionBar(props: Props) {
  const {
    theme,
    selectedModel,
    onModelChange,
    onAnalyze,
    isAnalyzing,
    hasBothImages,
    hasDifferences,
  } = props;

  return (
    <div className={`p-0 border-t shrink-0 z-50 ${theme === 'dark' ? 'bg-[#1e1e1e] border-white/10' : 'bg-white border-black/5'}`}>
      <div className="flex items-center">
        <div className="w-1/4">
          <select
            value={selectedModel}
            onChange={(e) => onModelChange(e.target.value as AnalyzeModel)}
            disabled={!hasBothImages}
            className={`w-full text-[11px] font-bold px-2 py-3 border-r transition-colors focus:outline-none ${
              theme === 'dark'
                ? 'bg-[#2c2c2c] border-[#383838] text-gray-300 focus:border-indigo-500'
                : 'bg-gray-50 border-gray-200 text-gray-600 focus:border-indigo-500'
            }`}
          >
            <option value="gemini">Gemini</option>
            <option value="kimi">Kimi</option>
            <option value="doubao">Doubao</option>
          </select>
        </div>
        <button
          onClick={onAnalyze}
          disabled={isAnalyzing || !hasBothImages}
          className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-[12px] font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>分析中...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>{hasDifferences ? '重新分析' : '差异分析'}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

