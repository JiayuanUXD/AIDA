import React from 'react';
import { CheckCircle2, Ban, Type as TypeIcon, LayoutTemplate, Palette } from 'lucide-react';
import type { Difference, DifferenceSeverity, DifferenceType } from '../types/analysis';
import { cn, getDiffStatusToken, getSeverityToken } from '../lib/utils';
import { usePreferences } from '../lib/preferences';

type Props = {
  diff: Difference;
  severity: DifferenceSeverity;
  isSelected: boolean;
  isOwner: boolean;
  theme: 'light' | 'dark';
  inlineEditField: 'title' | 'description' | null;
  onSelect: () => void;
  onStartEdit: (field: 'title' | 'description') => void;
  onStopEdit: () => void;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onCycleType: () => void;
  onSetSeverity: (value: DifferenceSeverity) => void;
  onMarkFixed: () => void;
  onIgnore: () => void;
};

const getSeverityText = (severity: DifferenceSeverity, t: (text: string) => string) => {
  if (severity === 'high') return t('高');
  if (severity === 'medium') return t('中');
  return t('低');
};

const getStatusText = (status: Difference['status']) => {
  if (status === 'fixed') return 'ACCEPTED';
  if (status === 'ignored') return 'IGNORED';
  return 'PENDING';
};

const getDifferenceTypeIcon = (type: DifferenceType) => {
  if (type === 'CONTENT') return TypeIcon;
  if (type === 'LAYOUT') return LayoutTemplate;
  return Palette;
};

export default function DifferenceListItemV2(props: Props) {
  const { t } = usePreferences();
  const {
    diff,
    severity,
    isSelected,
    isOwner,
    theme,
    inlineEditField,
    onSelect,
    onStartEdit,
    onStopEdit,
    onTitleChange,
    onDescriptionChange,
    onCycleType,
    onSetSeverity,
    onMarkFixed,
    onIgnore,
  } = props;

  const safeTitle = (diff.title || '').trim() || t('未命名差异');
  const safeDescription = (diff.description || '').trim() || t('暂无描述');
  const safeType: DifferenceType = diff.type || 'STYLE';
  const severityToken = getSeverityToken(severity);
  const statusToken = getDiffStatusToken(diff.status);
  const isDark = theme === 'dark';
  const DiffTypeIcon = getDifferenceTypeIcon(safeType);

  return (
    <div
      onClick={onSelect}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={t('差异：{title}（{severity}，{status}）', { title: safeTitle, severity: getSeverityText(severity, t), status: getStatusText(diff.status) })}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'relative rounded-lg px-3 py-2 transition-colors cursor-pointer difference-item',
        isSelected
          ? (isDark ? 'bg-white/5' : 'bg-indigo-50')
          : (isDark ? 'bg-transparent hover:bg-white/5' : 'bg-white hover:bg-gray-50')
      )}
    >
      <div className={cn('absolute left-0 top-0 h-full w-[2px] rounded-l-lg', isSelected ? severityToken.leftBar : 'bg-transparent')} />

      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!isOwner) return;
                onCycleType();
              }}
              title={isOwner ? t('点击切换类型') : ''}
              className={cn(
                'w-5 h-5 shrink-0 rounded-full flex items-center justify-center',
                isDark ? 'bg-white/10 text-gray-400' : 'bg-gray-100 text-gray-500'
              )}
            >
              <DiffTypeIcon className="w-3 h-3" />
            </button>
            {inlineEditField === 'title' ? (
              <input
                autoFocus
                type="text"
                value={diff.title || ''}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onTitleChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    onStopEdit();
                  }
                  if (e.key === 'Enter') {
                    e.stopPropagation();
                    onStopEdit();
                  }
                }}
                className={cn(
                  'text-[12px] font-semibold w-full rounded px-1.5 py-0.5 border outline-none',
                  isDark ? 'bg-white/5 border-indigo-500/50 text-gray-100' : 'bg-white border-indigo-300 text-gray-900'
                )}
              />
            ) : (
              <h3
                className={cn(
                  'text-[12px] font-semibold truncate',
                  isDark ? 'text-gray-100' : 'text-gray-900',
                  isOwner && isSelected ? 'cursor-text' : 'cursor-pointer'
                )}
                onDoubleClick={(e) => {
                  if (!isOwner || !isSelected) return;
                  e.stopPropagation();
                  onStartEdit('title');
                }}
              >
                {safeTitle}
              </h3>
            )}
          </div>
          {inlineEditField === 'description' ? (
            <textarea
              autoFocus
              value={diff.description || ''}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onDescriptionChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  onStopEdit();
                }
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.stopPropagation();
                  onStopEdit();
                }
              }}
              className={cn(
                'mt-1 text-[11px] leading-relaxed w-full rounded px-2 py-1 h-20 resize-none border outline-none',
                isDark ? 'bg-white/5 border-indigo-500/50 text-gray-200' : 'bg-white border-indigo-300 text-gray-700'
              )}
            />
          ) : (
            <p
              className={cn(
                'mt-1 text-[11px] leading-relaxed line-clamp-3',
                isDark ? 'text-gray-400' : 'text-gray-600',
                isOwner && isSelected ? 'cursor-text' : 'cursor-pointer'
              )}
              onDoubleClick={(e) => {
                if (!isOwner || !isSelected) return;
                e.stopPropagation();
                onStartEdit('description');
              }}
            >
              {safeDescription}
            </p>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'shrink-0 text-[9px] font-semibold tracking-wide uppercase rounded border px-1.5 py-0.5',
              statusToken.text,
              statusToken.bg,
              statusToken.border
            )}
          >
            {getStatusText(diff.status)}
          </span>
          <div
            className={cn('inline-flex items-center gap-1 rounded px-1 py-0.5')}
            title={t('严重等级：{level}', { level: getSeverityText(severity, t) })}
          >
            {(['high', 'medium', 'low'] as DifferenceSeverity[]).map((level) => {
              const levelToken = getSeverityToken(level);
              const active = severity === level;
              const label = level === 'high' ? t('高') : level === 'medium' ? t('中') : t('低');
              return (
                <button
                  key={level}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isOwner) return;
                    onSetSeverity(level);
                  }}
                  className={cn(
                    'w-2.5 h-2.5 rounded-full transition-all',
                    levelToken.dot,
                    active ? 'ring-2 ring-offset-1 ring-current' : (isDark ? 'opacity-45 hover:opacity-80' : 'opacity-55 hover:opacity-85')
                  )}
                  aria-label={`severity-${level}`}
                  title={t('严重等级：{level}', { level: label })}
                />
              );
            })}
          </div>
        </div>

        {isSelected && isOwner && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMarkFixed();
              }}
              className={cn(
                'inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded transition-colors',
                isDark ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              )}
            >
              <CheckCircle2 className="w-3 h-3" />
              Accept
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onIgnore();
              }}
              className={cn(
                'inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded transition-colors',
                isDark ? 'bg-white/10 text-gray-300 hover:bg-white/15' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              )}
            >
              <Ban className="w-3 h-3" />
              Ignore
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
