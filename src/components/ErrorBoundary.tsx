import React, { Component, ErrorInfo } from 'react';
import { Zap } from 'lucide-react';
import { useOptionalPreferences } from '../lib/preferences';
import { translate } from '../lib/i18n';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

function ErrorFallback({ error }: { error: Error | null }) {
  // 错误边界自身可能因为 Provider 尚未就绪而渲染，所以不能依赖 usePreferences() 一定可用
  const prefs = useOptionalPreferences();
  const t = prefs?.t ?? ((text: string) => translate('zh', text));
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-red-100">
        <div className="flex items-center gap-3 text-red-600 mb-4">
          <Zap className="w-8 h-8" />
          <h1 className="text-xl font-bold">{t('页面出错了')}</h1>
        </div>
        <p className="text-gray-600 mb-6 text-sm">
          {t('应用遇到了意外错误，请刷新页面重试。')}
        </p>
        {error && (
          <div className="bg-red-50 rounded-lg p-4 mb-6 overflow-auto max-h-40">
            <p className="text-xs font-mono text-red-800 break-words">
              {error.message}
            </p>
          </div>
        )}
        <button
          onClick={() => window.location.reload()}
          className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/20"
        >
          {t('刷新页面')}
        </button>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} />;
    }

    return this.props.children;
  }
}