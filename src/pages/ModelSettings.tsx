import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Check,
  ChevronLeft,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  Star,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import AiModelForm from '../components/AiModelForm';
import {
  deleteAiModel,
  listAiModels,
  setDefaultAiModel,
  testAiModel,
} from '../lib/aiModelApi';
import type { AiModelItem, AiModelListResponse } from '../types/aiModel';
import { usePreferences, useStableTranslator } from '../lib/preferences';
import { errorText } from '../lib/i18n';

type TestResult = { state: 'success' | 'error'; text: string };
type Toast = { type: 'success' | 'error'; text: string };
type ModalState = { mode: 'create' } | { mode: 'edit'; model: AiModelItem } | null;

const displayUrl = (value: string) => {
  try {
    const url = new URL(value);
    return `${url.host}${url.pathname}`.replace(/\/$/, '');
  } catch {
    return value;
  }
};

export default function ModelSettings() {
  const { resolvedTheme, t } = usePreferences();
  const stableT = useStableTranslator();
  const navigate = useNavigate();
  const isDark = resolvedTheme === 'dark';

  const [data, setData] = useState<AiModelListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<ModalState>(null);
  const [deleteTarget, setDeleteTarget] = useState<AiModelItem | null>(null);
  const [busy, setBusy] = useState('');
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [toast, setToast] = useState<Toast | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setError('');
    try {
      setData(await listAiModels());
    } catch (err: any) {
      setError(errorText(err, stableT, stableT('加载模型配置失败')));
    } finally {
      setIsLoading(false);
    }
  }, [stableT]);

  useEffect(() => {
    document.title = t('AIDA · 模型设置');
    load();
  }, [load, t]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!deleteTarget) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) setDeleteTarget(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteTarget, busy]);

  const models = data?.models ?? [];

  const handleSetDefault = async (model: AiModelItem) => {
    setBusy(`default:${model.id}`);
    try {
      await setDefaultAiModel(model.id);
      await load(true);
      setToast({ type: 'success', text: t('已设为默认模型：{label}', { label: model.label }) });
    } catch (err: any) {
      setToast({ type: 'error', text: errorText(err, t, t('设置默认模型失败')) });
    } finally {
      setBusy('');
    }
  };

  const handleTest = async (model: AiModelItem) => {
    setBusy(`test:${model.id}`);
    setTestResults((prev) => {
      const next = { ...prev };
      delete next[model.id];
      return next;
    });
    try {
      const result = await testAiModel({ id: model.id });
      setTestResults((prev) => ({
        ...prev,
        [model.id]: result.ok
          ? { state: 'success', text: t('连接成功 · {ms} ms', { ms: result.latencyMs ?? 0 }) }
          : { state: 'error', text: result.error || t('连接失败') },
      }));
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [model.id]: { state: 'error', text: errorText(err, t, t('连接失败')) },
      }));
    } finally {
      setBusy('');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(`delete:${deleteTarget.id}`);
    try {
      await deleteAiModel(deleteTarget.id);
      setToast({ type: 'success', text: t('已删除：{label}', { label: deleteTarget.label }) });
      setDeleteTarget(null);
      await load(true);
    } catch (err: any) {
      setToast({ type: 'error', text: errorText(err, t, t('删除失败')) });
    } finally {
      setBusy('');
    }
  };

  const cardClass = `rounded-2xl border p-4 sm:p-5 transition-colors ${
    isDark ? 'bg-[#1e1e1e] border-[#383838]' : 'bg-white border-gray-200'
  }`;
  const mutedClass = isDark ? 'text-gray-500' : 'text-gray-400';
  const labelClass = `text-[11px] font-semibold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-400'}`;
  const valueClass = `mt-1 text-sm truncate ${isDark ? 'text-gray-200' : 'text-gray-800'}`;

  const badge = (text: string, tone: 'indigo' | 'gray' | 'amber') => {
    const tones = {
      indigo: isDark ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' : 'bg-indigo-50 text-indigo-700 border-indigo-200',
      gray: isDark ? 'bg-white/5 text-gray-400 border-white/10' : 'bg-gray-100 text-gray-600 border-gray-200',
      amber: isDark ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : 'bg-amber-50 text-amber-700 border-amber-200',
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold ${tones[tone]}`}>
        {text}
      </span>
    );
  };

  return (
    <div className={`min-h-screen font-sans transition-colors duration-200 ${isDark ? 'bg-[#121212] text-[#e0e0e0]' : 'bg-[#fafafa] text-[#1a1a1a]'}`}>
      <header className={`sticky top-0 z-30 border-b backdrop-blur-md ${isDark ? 'bg-[#121212]/85 border-[#383838]' : 'bg-[#fafafa]/85 border-gray-200'}`}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate('/')}
              aria-label={t('返回项目列表')}
              title={t('返回项目列表')}
              className={`p-1.5 rounded-xl transition-colors ${isDark ? 'text-gray-400 hover:text-white hover:bg-[#2c2c2c]' : 'text-gray-500 hover:text-indigo-600 hover:bg-gray-100'}`}
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-semibold truncate">{t('设置 · 模型')}</h1>
              <p className={`text-xs truncate ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                {t('用于 AI 差异分析的视觉模型')}
              </p>
            </div>
          </div>

          <button
            onClick={() => setModal({ mode: 'create' })}
            className="shrink-0 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{t('添加模型')}</span>
            <span className="sm:hidden">{t('添加')}</span>
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {error && (
          <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${isDark ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
            <span className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </span>
            <button
              onClick={() => load()}
              className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${isDark ? 'bg-rose-500/15 hover:bg-rose-500/25' : 'bg-rose-100 hover:bg-rose-200'}`}
            >
              {t('重试')}
            </button>
          </div>
        )}

        {isLoading && !data && (
          <div className="space-y-4" aria-busy="true">
            {[0, 1].map((index) => (
              <div key={index} className={`${cardClass} animate-pulse`}>
                <div className={`h-5 w-40 rounded ${isDark ? 'bg-white/10' : 'bg-gray-200'}`} />
                <div className={`mt-4 h-4 w-full rounded ${isDark ? 'bg-white/5' : 'bg-gray-100'}`} />
                <div className={`mt-2 h-4 w-2/3 rounded ${isDark ? 'bg-white/5' : 'bg-gray-100'}`} />
              </div>
            ))}
          </div>
        )}

        {!isLoading && models.length === 0 && !error && (
          <div className={`${cardClass} text-center py-12`}>
            <ShieldCheck className={`w-10 h-10 mx-auto mb-3 ${isDark ? 'text-gray-600' : 'text-gray-300'}`} />
            <h2 className="text-base font-semibold mb-1">{t('还没有可用的模型')}</h2>
            <p className={`text-sm max-w-md mx-auto ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              {t('添加自定义模型，或在服务端配置')} <code className="font-mono text-xs">AI_MODELS</code> {t('环境变量。添加后即可在 Checker 中选择用于差异分析的模型。')}
            </p>
            <button
              onClick={() => setModal({ mode: 'create' })}
              className="mt-5 inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t('添加模型')}
            </button>
          </div>
        )}

        {models.map((model) => {
          const testResult = testResults[model.id];
          const isTesting = busy === `test:${model.id}`;
          const isSettingDefault = busy === `default:${model.id}`;
          const isDeleting = busy === `delete:${model.id}`;

          return (
            <article key={model.id} className={cardClass}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <h2 className="text-base font-semibold truncate">{model.label}</h2>
                  {badge(model.source === 'custom' ? t('自定义') : t('环境变量'), model.source === 'custom' ? 'indigo' : 'gray')}
                  {model.isDefault && (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${isDark ? 'bg-indigo-500 text-white' : 'bg-indigo-600 text-white'}`}>
                      <Check className="w-3 h-3" />
                      {t('默认')}
                    </span>
                  )}
                  {!model.configured && badge(t('未配置'), 'amber')}
                </div>
                {model.isDefault && <Star className={`w-4 h-4 shrink-0 ${isDark ? 'text-indigo-400' : 'text-indigo-500'}`} aria-hidden="true" />}
              </div>

              <dl className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="min-w-0">
                  <dt className={labelClass}>{t('模型 ID')}</dt>
                  <dd className={`${valueClass} font-mono text-xs`} title={model.model}>{model.model}</dd>
                </div>
                <div className="min-w-0">
                  <dt className={labelClass}>Base URL</dt>
                  <dd className={valueClass} title={model.baseUrl}>{displayUrl(model.baseUrl)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className={labelClass}>API Key</dt>
                  <dd className={`${valueClass} font-mono`}>{model.apiKeyHint || <span className={mutedClass}>{t('未配置')}</span>}</dd>
                </div>
              </dl>

              {testResult && (
                <p
                  role="status"
                  className={`mt-3 text-xs ${testResult.state === 'success' ? (isDark ? 'text-emerald-300' : 'text-emerald-600') : (isDark ? 'text-rose-300' : 'text-rose-600')}`}
                >
                  {testResult.text}
                </p>
              )}

              <div className={`mt-4 pt-3 border-t flex flex-wrap items-center gap-2 ${isDark ? 'border-[#383838]' : 'border-gray-100'}`}>
                {!model.isDefault && (
                  <button
                    onClick={() => handleSetDefault(model)}
                    disabled={Boolean(busy)}
                    aria-label={t('将 {label} 设为默认模型', { label: model.label })}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isDark ? 'text-indigo-300 hover:bg-indigo-500/10' : 'text-indigo-600 hover:bg-indigo-50'}`}
                  >
                    {isSettingDefault ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Star className="w-3.5 h-3.5" />}
                    {t('设为默认')}
                  </button>
                )}

                <button
                  onClick={() => handleTest(model)}
                  disabled={Boolean(busy)}
                  aria-label={t('测试 {label} 的连接', { label: model.label })}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isDark ? 'text-gray-300 hover:bg-white/5 hover:text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
                >
                  {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                  {t('测试连接')}
                </button>

                {model.source === 'custom' ? (
                  <>
                    <button
                      onClick={() => setModal({ mode: 'edit', model })}
                      disabled={Boolean(busy)}
                      aria-label={t('编辑 {label}', { label: model.label })}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isDark ? 'text-gray-300 hover:bg-white/5 hover:text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      {t('编辑')}
                    </button>
                    <button
                      onClick={() => setDeleteTarget(model)}
                      disabled={Boolean(busy)}
                      aria-label={t('删除 {label}', { label: model.label })}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isDark ? 'text-rose-300 hover:bg-rose-500/10' : 'text-rose-600 hover:bg-rose-50'}`}
                    >
                      {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      {t('删除')}
                    </button>
                  </>
                ) : (
                  <span className={`text-[11px] ${mutedClass}`}>{t('环境变量项只读，请修改服务端配置')}</span>
                )}
              </div>
            </article>
          );
        })}

        <p className={`text-[11px] leading-relaxed pt-2 ${mutedClass}`}>
          {t('API Key 仅保存在服务端，不会返回浏览器。环境变量模型由')} <code className="font-mono">AI_MODELS</code> {t('或')} <code className="font-mono">AI_API_*</code> {t('提供，优先级低于自定义模型。')}
        </p>
      </main>

      {modal && (
        <AiModelForm
          theme={resolvedTheme}
          model={modal.mode === 'edit' ? modal.model : null}
          onClose={() => setModal(null)}
          onSaved={(message) => {
            setModal(null);
            setToast({ type: 'success', text: message });
            load(true);
          }}
        />
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setDeleteTarget(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-model-title"
            className={`w-full max-w-sm rounded-2xl border p-5 shadow-2xl ${isDark ? 'bg-[#1e1e1e] border-[#383838]' : 'bg-white border-gray-200'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="delete-model-title" className="text-base font-semibold">{t('删除模型')}</h2>
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={Boolean(busy)}
                aria-label={t('关闭')}
                className={`p-1 rounded-lg transition-colors disabled:opacity-50 ${isDark ? 'text-gray-400 hover:text-white hover:bg-[#2c2c2c]' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className={`mt-2 text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              {t('确定删除「{label}」？该模型的分析配置将从服务端移除，此操作不可撤销。', { label: deleteTarget.label })}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={Boolean(busy)}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${isDark ? 'text-gray-400 hover:text-white hover:bg-[#2c2c2c]' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}
              >
                {t('取消')}
              </button>
              <button
                onClick={handleDelete}
                disabled={Boolean(busy)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy === `delete:${deleteTarget.id}` && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {t('确认删除')}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status"
          className={`fixed bottom-5 right-5 z-[210] max-w-xs rounded-xl px-4 py-3 text-sm shadow-2xl border ${
            toast.type === 'success'
              ? isDark ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200' : 'bg-white border-emerald-200 text-emerald-700'
              : isDark ? 'bg-rose-500/15 border-rose-500/30 text-rose-200' : 'bg-white border-rose-200 text-rose-700'
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
