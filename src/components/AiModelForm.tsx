import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Eye, EyeOff, Loader2, RefreshCw, X } from 'lucide-react';
import type { AiModelItem } from '../types/aiModel';
import {
  createAiModel,
  fetchProviderModels,
  testAiModel,
  updateAiModel,
} from '../lib/aiModelApi';
import { usePreferences } from '../lib/preferences';
import { errorText } from '../lib/i18n';

type Props = {
  theme: 'light' | 'dark';
  model: AiModelItem | null;
  onClose: () => void;
  onSaved: (message: string) => void;
};

type Feedback = { type: 'success' | 'error'; text: string } | null;
type DropdownStyle = { top?: number; bottom?: number; left: number; width: number; maxHeight: number };

export default function AiModelForm({ theme, model, onClose, onSaved }: Props) {
  const { t } = usePreferences();
  const isDark = theme === 'dark';
  const isEdit = Boolean(model);
  const listId = useId();

  const [label, setLabel] = useState(model?.label ?? '');
  const [baseUrl, setBaseUrl] = useState(model?.baseUrl ?? '');
  const [apiKey, setApiKey] = useState('');
  const [modelValue, setModelValue] = useState(model?.model ?? '');
  const [showKey, setShowKey] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isFiltering, setIsFiltering] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dropdownStyle, setDropdownStyle] = useState<DropdownStyle | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const comboboxRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);

  const visibleModels = useMemo(() => {
    if (!isFiltering) return fetchedModels;
    const query = modelValue.trim().toLowerCase();
    if (!query) return fetchedModels;
    return fetchedModels.filter((id) => id.toLowerCase().includes(query));
  }, [fetchedModels, isFiltering, modelValue]);

  const updateDropdownPosition = useCallback(() => {
    const anchor = comboboxRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const margin = 12;
    const gap = 6;
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
    const available = Math.max(120, openUp ? spaceAbove : spaceBelow);
    const maxHeight = Math.min(260, available);

    setDropdownStyle({
      left: rect.left,
      width: rect.width,
      maxHeight,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + gap }
        : { top: rect.bottom + gap }),
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isDropdownOpen) {
        event.stopPropagation();
        setIsDropdownOpen(false);
        setActiveIndex(-1);
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDropdownOpen, onClose]);

  useEffect(() => {
    if (!isDropdownOpen) return;
    updateDropdownPosition();
    const onReposition = () => updateDropdownPosition();
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (comboboxRef.current?.contains(target) || listboxRef.current?.contains(target)) {
        return;
      }
      setIsDropdownOpen(false);
      setActiveIndex(-1);
    };
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [isDropdownOpen, updateDropdownPosition]);

  useEffect(() => {
    if (!isDropdownOpen || activeIndex < 0) return;
    const activeEl = listboxRef.current?.children[activeIndex] as HTMLElement | undefined;
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, isDropdownOpen]);

  const title = isEdit ? t('编辑模型') : t('添加模型');

  const connectionPayload = () => ({
    ...(model ? { id: model.id } : {}),
    baseUrl: baseUrl.trim(),
    ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
    model: modelValue.trim(),
  });

  const validateBasics = () => {
    if (!baseUrl.trim()) return t('请填写 Base URL');
    if (!modelValue.trim()) return t('请填写模型 ID');
    if (!isEdit && !apiKey.trim()) return t('请填写 API Key');
    return '';
  };

  const handleFetchModels = async () => {
    if (!baseUrl.trim()) {
      setFeedback({ type: 'error', text: t('请先填写 Base URL') });
      return;
    }
    if (!isEdit && !apiKey.trim()) {
      setFeedback({ type: 'error', text: t('请先填写 API Key') });
      return;
    }
    setFeedback(null);
    setIsFetching(true);
    try {
      const data = await fetchProviderModels({
        ...(model ? { id: model.id } : {}),
        baseUrl: baseUrl.trim(),
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      });
      setFetchedModels(data.models);
      setIsFiltering(false);
      setActiveIndex(-1);
      setIsDropdownOpen(data.models.length > 0);
      setFeedback({
        type: 'success',
        text: data.models.length > 0 ? t('已获取 {n} 个模型，可在模型 ID 中输入筛选', { n: data.models.length }) : t('服务商未返回模型列表，请手动填写'),
      });
    } catch (err: any) {
      setFeedback({ type: 'error', text: errorText(err, t, t('拉取模型失败，请手动填写模型 ID')) });
    } finally {
      setIsFetching(false);
    }
  };

  const handleTest = async () => {
    const basicError = validateBasics();
    if (basicError) {
      setFeedback({ type: 'error', text: basicError });
      return;
    }
    setFeedback(null);
    setIsTesting(true);
    try {
      const result = await testAiModel(connectionPayload());
      setFeedback(
        result.ok
          ? { type: 'success', text: t('连接成功，耗时 {ms} ms', { ms: result.latencyMs ?? 0 }) }
          : { type: 'error', text: result.error || t('连接失败') }
      );
    } catch (err: any) {
      setFeedback({ type: 'error', text: errorText(err, t, t('连接失败')) });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const basicError = validateBasics();
    if (basicError) {
      setFeedback({ type: 'error', text: basicError });
      return;
    }
    setFeedback(null);
    setIsSaving(true);
    try {
      const input = {
        label: label.trim(),
        baseUrl: baseUrl.trim(),
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        model: modelValue.trim(),
      };
      if (model) {
        await updateAiModel(model.id, input);
        onSaved(t('模型已更新'));
      } else {
        await createAiModel(input);
        onSaved(t('模型已添加'));
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: errorText(err, t, t('保存失败')) });
      setIsSaving(false);
    }
  };

  const fieldClass = `w-full rounded-xl border px-3 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${
    isDark
      ? 'bg-[#2c2c2c] border-[#383838] text-white placeholder-gray-500'
      : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'
  }`;

  const labelClass = `block text-xs font-semibold mb-1.5 ${isDark ? 'text-gray-400' : 'text-gray-600'}`;

  const selectModel = (id: string) => {
    setModelValue(id);
    setIsFiltering(false);
    setIsDropdownOpen(false);
    setActiveIndex(-1);
    modelInputRef.current?.focus();
  };

  const handleModelInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!fetchedModels.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!isDropdownOpen) {
        setIsFiltering(false);
        setIsDropdownOpen(true);
        setActiveIndex(0);
        return;
      }
      if (visibleModels.length > 0) {
        setActiveIndex((prev) => (prev + 1) % visibleModels.length);
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      if (!isDropdownOpen || visibleModels.length === 0) return;
      event.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? visibleModels.length - 1 : prev - 1));
      return;
    }

    if (event.key === 'Enter' && isDropdownOpen && activeIndex >= 0 && visibleModels[activeIndex]) {
      event.preventDefault();
      selectModel(visibleModels[activeIndex]);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-model-form-title"
        onSubmit={handleSubmit}
        className={`w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl ${
          isDark ? 'bg-[#1e1e1e] border-[#383838] text-[#e0e0e0]' : 'bg-white border-gray-200 text-gray-900'
        }`}
      >
        <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? 'border-[#383838]' : 'border-gray-100'}`}>
          <div>
            <h2 id="ai-model-form-title" className="text-base font-semibold">{title}</h2>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
              {t('OpenAI 兼容接口，需要支持图片输入')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('关闭')}
            className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-400 hover:bg-[#2c2c2c] hover:text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label htmlFor="ai-model-label" className={labelClass}>{t('名称（可选）')}</label>
            <input
              id="ai-model-label"
              autoFocus
              type="text"
              maxLength={60}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={t('例如：豆包 Vision')}
              className={fieldClass}
            />
          </div>

          <div>
            <label htmlFor="ai-model-base-url" className={labelClass}>Base URL</label>
            <input
              id="ai-model-base-url"
              type="url"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://ark.cn-beijing.volces.com/api/v3"
              className={fieldClass}
            />
            <p className={`text-[11px] mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              {t('填到版本路径即可，请求会自动拼接 /chat/completions')}
            </p>
          </div>

          <div>
            <label htmlFor="ai-model-api-key" className={labelClass}>API Key</label>
            <div className="relative">
              <input
                id="ai-model-api-key"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={isEdit ? t('留空表示不修改（{hint}）', { hint: model?.apiKeyHint || t('已保存') }) : 'sk-...'}
                autoComplete="off"
                className={`${fieldClass} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowKey((value) => !value)}
                aria-label={showKey ? t('隐藏 API Key') : t('显示 API Key')}
                className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors ${
                  isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label htmlFor="ai-model-id" className={`${labelClass} mb-0`}>{t('模型 ID')}</label>
              <button
                type="button"
                onClick={handleFetchModels}
                disabled={isFetching || !baseUrl.trim()}
                className={`flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  isDark ? 'text-indigo-400 hover:bg-indigo-500/10' : 'text-indigo-600 hover:bg-indigo-50'
                }`}
              >
                {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {t('拉取模型')}
              </button>
            </div>
            <div ref={comboboxRef} className="relative">
              <input
                ref={modelInputRef}
                id="ai-model-id"
                type="text"
                role="combobox"
                aria-expanded={fetchedModels.length > 0 ? isDropdownOpen : false}
                aria-controls={fetchedModels.length > 0 ? listId : undefined}
                aria-autocomplete="list"
                aria-activedescendant={
                  isDropdownOpen && activeIndex >= 0 && visibleModels[activeIndex]
                    ? `${listId}-option-${activeIndex}`
                    : undefined
                }
                autoComplete="off"
                value={modelValue}
                onFocus={() => {
                  if (fetchedModels.length > 0) {
                    setIsFiltering(false);
                    setIsDropdownOpen(true);
                  }
                }}
                onChange={(event) => {
                  setModelValue(event.target.value);
                  if (fetchedModels.length > 0) {
                    setIsFiltering(Boolean(event.target.value.trim()));
                    setIsDropdownOpen(true);
                    setActiveIndex(-1);
                  }
                }}
                onKeyDown={handleModelInputKeyDown}
                placeholder={t('例如：doubao-vision')}
                className={`${fieldClass} ${fetchedModels.length > 0 ? 'pr-10' : ''}`}
              />
              {fetchedModels.length > 0 && (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={isDropdownOpen ? t('收起模型列表') : t('展开模型列表')}
                  aria-expanded={isDropdownOpen}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setIsFiltering(false);
                    setActiveIndex(-1);
                    setIsDropdownOpen((open) => !open);
                    modelInputRef.current?.focus();
                  }}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors ${
                    isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  <ChevronDown
                    aria-hidden="true"
                    className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
                  />
                </button>
              )}
            </div>
            {isDropdownOpen && fetchedModels.length > 0 && dropdownStyle && (
              <ul
                ref={listboxRef}
                id={listId}
                role="listbox"
                aria-label={t('模型 ID')}
                style={dropdownStyle}
                className={`fixed z-[220] overflow-y-auto rounded-xl border p-1 shadow-2xl ${
                  isDark
                    ? 'bg-[#252525] border-[#383838] text-gray-200'
                    : 'bg-white border-gray-200 text-gray-900'
                }`}
              >
                {visibleModels.length === 0 ? (
                  <li className={`px-3 py-2 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {t('未找到匹配的模型')}
                  </li>
                ) : (
                  visibleModels.map((id, index) => {
                    const isSelected = id === modelValue.trim();
                    const isActive = index === activeIndex;
                    return (
                      <li
                        key={id}
                        id={`${listId}-option-${index}`}
                        role="option"
                        aria-selected={isSelected}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          selectModel(id);
                        }}
                        onMouseEnter={() => setActiveIndex(index)}
                        className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-mono cursor-pointer transition-colors ${
                          isActive
                            ? isDark
                              ? 'bg-indigo-500/20 text-white'
                              : 'bg-indigo-50 text-indigo-700'
                            : isSelected
                              ? isDark
                                ? 'bg-white/5 text-indigo-300'
                                : 'bg-gray-50 text-indigo-600'
                              : isDark
                                ? 'text-gray-200 hover:bg-white/5'
                                : 'text-gray-800 hover:bg-gray-100'
                        }`}
                      >
                        <span className="truncate">{id}</span>
                        {isSelected && <Check aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />}
                      </li>
                    );
                  })
                )}
              </ul>
            )}
          </div>

          {feedback && (
            <div
              role="status"
              className={`rounded-xl px-3 py-2 text-xs leading-relaxed ${
                feedback.type === 'success'
                  ? isDark ? 'bg-emerald-500/10 text-emerald-300' : 'bg-emerald-50 text-emerald-700'
                  : isDark ? 'bg-rose-500/10 text-rose-300' : 'bg-rose-50 text-rose-700'
              }`}
            >
              {feedback.text}
            </div>
          )}
        </div>

        <div className={`flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-t ${isDark ? 'border-[#383838]' : 'border-gray-100'}`}>
          <button
            type="button"
            onClick={handleTest}
            disabled={isTesting || isSaving}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              isDark ? 'bg-[#2c2c2c] text-gray-300 hover:text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {isTesting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {t('测试连接')}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                isDark ? 'text-gray-400 hover:text-white hover:bg-[#2c2c2c]' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              {t('取消')}
            </button>
            <button
              type="submit"
              disabled={isSaving || isTesting}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t('保存')}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
