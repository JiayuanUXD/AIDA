import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Focus, Type, Layout, Palette, Check, RotateCcw, Sparkles } from 'lucide-react';
import { Difference } from '../../types';

const InlineAnalyzingState = ({ theme }: { theme: 'light' | 'dark' }) => {
  const [msgIndex, setMsgIndex] = useState(0);
  const messages = [
    "正在对比页面布局...",
    "正在分析文字内容与样式...",
    "正在检测组件颜色与大小...",
    "正在寻找像素细节差异...",
    "生成分析报告..."
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex(prev => (prev + 1) % messages.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [messages.length]);

  return (
    <div className={`p-3 rounded-xl border flex gap-3 overflow-hidden relative ${
      theme === 'dark' ? 'bg-[#1e1e1e] border-indigo-500/30' : 'bg-indigo-50/50 border-indigo-100'
    }`}>
      {/* Background gradient animation */}
      <motion.div 
        animate={{ x: ['-100%', '200%'] }}
        transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
        className="absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-indigo-500/10 to-transparent" 
      />
      
      <div className="relative shrink-0 w-8 h-8 rounded-full border-2 border-indigo-500/20 flex items-center justify-center">
        <div className="absolute inset-0 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
      </div>
      
      <div className="flex-1 min-w-0 relative py-0.5">
        <h4 className={`text-[11px] font-bold mb-0.5 ${theme === 'dark' ? 'text-indigo-400' : 'text-indigo-600'}`}>
          AI 差异分析运行中
        </h4>
        <div className="h-[14px] relative w-full overflow-hidden">
          <AnimatePresence mode="popLayout">
            <motion.p
              key={msgIndex}
              initial={{ y: 15, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -15, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className={`absolute inset-0 text-[10px] truncate ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}
            >
              {messages[msgIndex]}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

interface DifferencesPanelProps {
  theme: string;
  differences: Difference[];
  setDifferences: React.Dispatch<React.SetStateAction<Difference[]>>;
  selectedDiffId: string | null;
  setSelectedDiffId: (id: string | null) => void;
  severityFilter: 'all' | 'high' | 'medium' | 'low';
  setSeverityFilter: (val: 'all' | 'high' | 'medium' | 'low') => void;
  isAnalyzing: boolean;
  isOwner: boolean;
  inlineEdit: { id: string; field: 'title' | 'description' | 'type' } | null;
  setInlineEdit: (val: { id: string; field: 'title' | 'description' | 'type' } | null) => void;
  updateDiffStatus: (id: string, status: Difference['status']) => void;
  selectedModel: 'gemini' | 'kimi' | 'doubao';
  setSelectedModel: (model: 'gemini' | 'kimi' | 'doubao') => void;
  analyzeFidelity: () => void;
  cancelAnalysis: () => void;
  image: string | null;
  liveImage: string | null;
}

export const DifferencesPanel: React.FC<DifferencesPanelProps> = ({
  theme, differences, setDifferences, selectedDiffId, setSelectedDiffId,
  severityFilter, setSeverityFilter, isAnalyzing, isOwner,
  inlineEdit, setInlineEdit, updateDiffStatus,
  selectedModel, setSelectedModel, analyzeFidelity, cancelAnalysis, image, liveImage
}) => {
  return (
    <div className={`w-96 h-full border-l flex flex-col z-50 overflow-hidden transition-colors duration-200 ${
        theme === 'dark' 
          ? 'bg-[#1e1e1e] border-[#383838] text-[#e0e0e0]' 
          : 'bg-white border-[#e0e0e0] text-[#1a1a1a]'
      }`}>
        <div className={`p-4 border-b flex items-center justify-between ${theme === 'dark' ? 'border-white/10' : 'border-black/5'}`}>
          <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
            Differences List
            <span className="bg-indigo-500/10 text-indigo-500 text-[10px] px-1.5 py-0.5 rounded-full">
              {differences.length}
            </span>
          </h2>
          {differences.length > 0 && (
            <button 
              onClick={() => {
                setDifferences([]);
                setSelectedDiffId(null);
              }}
              className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded transition-colors ${
                theme === 'dark' ? 'text-gray-500 hover:text-rose-500 hover:bg-rose-500/10' : 'text-gray-400 hover:text-rose-600 hover:bg-rose-50'
              }`}
            >
              Clear
            </button>
          )}
        </div>

        {/* Severity Tabs */}
        {differences.length > 0 && (
          <div className={`px-2 py-2 border-b flex gap-1.5 overflow-x-auto scrollbar-hide ${theme === 'dark' ? 'border-white/10' : 'border-black/5'}`}>
            {[
              { id: 'all', label: '全部', color: 'bg-indigo-500' },
              { id: 'high', label: '高严重', color: 'bg-rose-500' },
              { id: 'medium', label: '中严重', color: 'bg-amber-500' },
              { id: 'low', label: '低严重', color: 'bg-emerald-500' }
            ].map((tab) => {
              const count = tab.id === 'all' 
                ? differences.length 
                : differences.filter(d => d.severity === tab.id).length;
              
              const isActive = severityFilter === tab.id;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => setSeverityFilter(tab.id as 'all' | 'high' | 'medium' | 'low')}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] font-bold transition-all whitespace-nowrap border ${
                    isActive
                      ? `${theme === 'dark' ? 'bg-[#2c2c2c] text-indigo-400 border-indigo-500/50' : 'bg-indigo-50 text-indigo-600 border-indigo-500/30'}`
                      : `text-gray-500 border-transparent hover:bg-gray-500/5`
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${tab.color}`} />
                  {tab.label} {count}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-2 space-y-2 relative">
          <AnimatePresence>
            {isAnalyzing && (
              <motion.div 
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: 'auto', marginBottom: 8 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                style={{ overflow: 'hidden' }}
              >
                <InlineAnalyzingState theme={theme as 'light' | 'dark'} />
              </motion.div>
            )}
          </AnimatePresence>

          {differences.length === 0 && !isAnalyzing ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-6">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${theme === 'dark' ? 'bg-[#2c2c2c]' : 'bg-gray-50'}`}>
                <Focus className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">No differences found</p>
              <p className="text-[10px] text-gray-400 leading-relaxed">
                Use the AI analysis tool below or manually mark differences on the preview area.
              </p>
            </div>
          ) : (
            <>
              {differences
                .filter(d => d.status === 'pending' && (severityFilter === 'all' || d.severity === severityFilter))
                .map((diff) => (
                <div 
                  key={diff.id}
                  onClick={() => {
                    if (selectedDiffId !== diff.id) {
                      setSelectedDiffId(diff.id);
                    }
                  }}
                  className={`p-3 rounded-xl transition-all cursor-pointer group relative difference-item border border-transparent ${
                    selectedDiffId === diff.id 
                      ? (theme === 'dark' ? 'bg-[#252525] border-white/10' : 'bg-indigo-50 border-indigo-100') 
                      : (theme === 'dark' ? 'hover:bg-white/10' : 'hover:bg-gray-100')
                  }`}
                >
                  {/* Severity Dot and Type Icon Container */}
                  <div className="absolute top-4 right-4 flex items-center gap-2">
                    {/* Icon without background */}
                    <button
                      onClick={(e) => {
                        if (!isOwner) return;
                        e.stopPropagation();
                        const types: ('content' | 'layout' | 'style')[] = ['content', 'layout', 'style'];
                        setDifferences(prev => prev.map(d => d.id === diff.id ? { ...d, type: types[(types.indexOf(d.type as any) + 1) % types.length] } : d));
                      }}
                      className={`p-1 rounded-md transition-colors ${!isOwner ? 'cursor-default opacity-50' : (theme === 'dark' ? 'hover:bg-white/10' : 'hover:bg-black/5')} text-gray-400`}
                    >
                      {diff.type === 'content' ? <Type className="w-3 h-3" /> : 
                       diff.type === 'layout' ? <Layout className="w-3 h-3" /> : 
                       <Palette className="w-3 h-3" />}
                    </button>
                    {/* Interactive Severity Dot */}
                    <button
                      onClick={(e) => {
                        if (!isOwner) return;
                        e.stopPropagation();
                        const severities: ('high' | 'medium' | 'low')[] = ['high', 'medium', 'low'];
                        setDifferences(prev => prev.map(d => d.id === diff.id ? { ...d, severity: severities[(severities.indexOf(d.severity) + 1) % severities.length] } : d));
                      }}
                      className={`w-2 h-2 rounded-full shadow-sm ${!isOwner ? 'cursor-default' : ''} ${
                      diff.severity === 'high' ? 'bg-rose-500' : 
                      diff.severity === 'medium' ? 'bg-amber-500' : 
                      'bg-emerald-500'
                    }`} />
                  </div>

                  <div className="flex items-start gap-4">
                    {/* Type Icon Column (Old container, removing icon here) */}
                    <div className="flex flex-col items-center gap-2 pt-0.5">
                      <span className={`text-[10px] font-bold ${selectedDiffId === diff.id ? 'text-indigo-400' : 'text-gray-400'}`}>
                        {diff.id}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0 pr-4">
                      {/* Title Section */}
                      <div className="mb-1 group/field">
                        {inlineEdit?.id === diff.id && inlineEdit?.field === 'title' ? (
                          <div className="flex items-center gap-2 editing-field" onClick={e => e.stopPropagation()}>
                            <input 
                              autoFocus
                              type="text"
                              value={diff.title}
                              onChange={(e) => {
                                setDifferences(prev => prev.map(d => d.id === diff.id ? { ...d, title: e.target.value } : d));
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') setInlineEdit(null);
                              }}
                              className="flex-1 bg-white/5 border border-indigo-500/50 rounded px-2 py-0.5 text-[11px] font-bold focus:outline-none"
                            />
                            <button onClick={() => setInlineEdit(null)} className="text-indigo-400 hover:text-indigo-300">
                              <Check className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <h3 
                            className={`text-[12px] font-bold truncate transition-colors ${
                              selectedDiffId === diff.id ? 'text-indigo-500 cursor-text' : (theme === 'dark' ? 'text-white' : 'text-gray-900')
                            }`}
                            onDoubleClick={(e) => {
                              if (selectedDiffId === diff.id && isOwner) {
                                e.stopPropagation();
                                setInlineEdit({ id: diff.id, field: 'title' });
                              }
                            }}
                          >
                            {diff.title}
                          </h3>
                        )}
                      </div>

                      {/* Description Section */}
                      <div className="group/field relative">
                        {inlineEdit?.id === diff.id && inlineEdit?.field === 'description' ? (
                          <div className="mt-1 editing-field" onClick={e => e.stopPropagation()}>
                            <textarea 
                              autoFocus
                              value={diff.description}
                              onChange={(e) => {
                                setDifferences(prev => prev.map(d => d.id === diff.id ? { ...d, description: e.target.value } : d));
                              }}
                              className="w-full bg-white/5 border border-indigo-500/50 rounded px-2 py-1 text-[10px] focus:outline-none h-20 resize-none"
                            />
                            <div className="flex justify-end mt-1">
                              <button onClick={() => setInlineEdit(null)} className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 font-bold">
                                <Check className="w-3 h-3" /> 保存
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p 
                            className={`text-[11px] leading-relaxed line-clamp-2 transition-all ${
                              selectedDiffId === diff.id ? 'group-hover:line-clamp-none cursor-text' : 'group-hover:line-clamp-none'
                            } ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}
                            onDoubleClick={(e) => {
                              if (selectedDiffId === diff.id && isOwner) {
                                e.stopPropagation();
                                setInlineEdit({ id: diff.id, field: 'description' });
                              }
                            }}
                          >
                            {diff.description}
                          </p>
                        )}
                      </div>
                      
                      {selectedDiffId === diff.id && isOwner && (
                        <div className="flex gap-2 mt-3 animate-in fade-in slide-in-from-top-1">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              updateDiffStatus(diff.id, 'fixed');
                            }}
                            className="flex-1 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-500 text-[11px] font-bold hover:bg-indigo-500/20 transition-colors"
                          >
                            Mark Fixed
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              updateDiffStatus(diff.id, 'ignored');
                            }}
                            className="flex-1 py-1.5 rounded-lg bg-gray-500/5 text-gray-500 text-[11px] font-bold hover:bg-gray-500/10 transition-colors"
                          >
                            Ignore
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              {differences.some(d => d.status !== 'pending') && (
                <div className="pt-4 px-2">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Resolved</h4>
                  <div className="space-y-1 opacity-50">
                    {differences.filter(d => d.status !== 'pending').map(diff => (
                      <div key={diff.id} className="flex items-center justify-between p-2 rounded bg-white/5 text-[11px] group/resolved">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="truncate">{diff.title}</span>
                          <span className={`text-[8px] uppercase font-bold px-1 rounded ${
                            diff.status === 'fixed' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-gray-500/20 text-gray-400'
                          }`}>
                            {diff.status}
                          </span>
                        </div>
                        {isOwner && (
                          <button 
                            onClick={() => updateDiffStatus(diff.id, 'pending')}
                            className="opacity-0 group-hover/resolved:opacity-100 p-1 hover:bg-white/10 rounded text-indigo-400 transition-all"
                            title="恢复"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {differences.length > 0 && (
            <div className="py-6 border-t border-white/5 text-center px-4">
              <p className={`text-[10px] leading-relaxed ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                本回答由 AI 生成，内容仅供参考
              </p>
            </div>
          )}
        </div>

        {/* Persistent Bottom Analysis Panel */}
        <div className={`shrink-0 border-t flex flex-col ${theme === 'dark' ? 'bg-[#1e1e1e] border-white/10' : 'bg-white border-gray-100'}`}>
          <div className="h-[44px] flex relative">
          <div className="relative w-[120px] flex items-center justify-between px-5 border-r border-black/5 dark:border-white/5">
            <select 
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value as any)}
              className="absolute inset-0 w-full h-full appearance-none opacity-0 cursor-pointer z-10 text-[12px]"
            >
              <option value="gemini" className="text-[12px]">Gemini</option>
              <option value="kimi" className="text-[12px]">Kimi</option>
              <option value="doubao" className="text-[12px]">Doubao</option>
            </select>
            <span className={`text-[12px] font-bold capitalize ${theme === 'dark' ? 'text-gray-200' : 'text-[#4b5563]'}`}>
              {selectedModel}
            </span>
            <svg className={`w-3.5 h-3.5 ${theme === 'dark' ? 'text-gray-500' : 'text-[#9ca3af]'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          {isAnalyzing ? (
            <button 
              onClick={() => cancelAnalysis()}
              className={`flex-1 flex items-center justify-center gap-1.5 text-[13px] font-medium transition-colors bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 6h12v12H6z" />
              </svg>
              <span>停止分析</span>
            </button>
          ) : (
            <button 
              onClick={() => analyzeFidelity()}
              disabled={!image || !liveImage}
              className={`flex-1 flex items-center justify-center gap-1.5 text-[13px] font-medium transition-colors bg-[#5542F6] hover:bg-[#4836D9] active:bg-[#3D2DBB] text-white disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{differences.length === 0 ? '差异分析' : '重新分析'}</span>
            </button>
          )}
          </div>
        </div>
      </div>
  );
};
