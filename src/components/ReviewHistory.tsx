import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, CheckCircle, XCircle, Clock, AlertCircle, ChevronRight, Trash2, RefreshCw } from 'lucide-react';
import { ReviewRound, ReviewRoundWithItems, ReviewItem } from '../types';

interface ReviewHistoryProps {
  projectId: string;
  theme: 'light' | 'dark' | 'system';
  onSelectRound: (round: ReviewRoundWithItems) => void;
  onNewRound: () => void;
}

const API_BASE = '';

export const ReviewHistory: React.FC<ReviewHistoryProps> = ({
  projectId,
  theme,
  onSelectRound,
  onNewRound
}) => {
  const [rounds, setRounds] = useState<ReviewRoundWithItems[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadRounds = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/review-rounds`);
      const data = await res.json();
      setRounds(data.rounds || []);
    } catch (e) {
      console.error('Failed to load review rounds:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      loadRounds();
    }
  }, [projectId]);

  const getStatusIcon = (status: ReviewRound['status']) => {
    switch (status) {
      case 'passed':
        return <CheckCircle className="w-4 h-4 text-emerald-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-rose-500" />;
      case 'in_review':
        return <Clock className="w-4 h-4 text-amber-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusLabel = (status: ReviewRound['status']) => {
    switch (status) {
      case 'passed':
        return '通过';
      case 'failed':
        return '未通过';
      case 'in_review':
        return '验收中';
      default:
        return '待处理';
    }
  };

  const getStatusColor = (status: ReviewRound['status']) => {
    switch (status) {
      case 'passed':
        return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30';
      case 'failed':
        return 'bg-rose-500/10 text-rose-500 border-rose-500/30';
      case 'in_review':
        return 'bg-amber-500/10 text-amber-500 border-amber-500/30';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleDeleteRound = async (roundId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定要删除此验收轮次吗？')) return;

    try {
      await fetch(`${API_BASE}/api/review-rounds/${roundId}`, { method: 'DELETE' });
      loadRounds();
    } catch (e) {
      console.error('Failed to delete round:', e);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className={`p-4 border-b flex items-center justify-between ${theme === 'dark' ? 'border-white/10' : 'border-black/5'}`}>
        <h2 className="text-sm font-bold">验收历史</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={loadRounds}
            className={`p-1.5 rounded-lg transition-colors ${theme === 'dark' ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
            title="刷新"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onNewRound}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-500 text-white text-[10px] font-bold hover:bg-indigo-600 transition-colors"
          >
            <Plus className="w-3 h-3" />
            新建验收
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : rounds.length === 0 ? (
          <div className={`text-center py-8 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-xs">暂无验收记录</p>
            <p className="text-[10px] mt-1 opacity-70">点击"新建验收"开始第一次验收</p>
          </div>
        ) : (
          rounds.map((round) => (
            <motion.div
              key={round.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => onSelectRound(round)}
              className={`p-3 rounded-xl border cursor-pointer transition-all group ${
                theme === 'dark'
                  ? 'bg-[#252525] border-white/5 hover:border-indigo-500/30'
                  : 'bg-gray-50 border-gray-100 hover:border-indigo-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {getStatusIcon(round.status)}
                  <span className="text-sm font-bold">第 {round.roundNumber} 轮</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${getStatusColor(round.status)}`}>
                    {getStatusLabel(round.status)}
                  </span>
                  <button
                    onClick={(e) => handleDeleteRound(round.id, e)}
                    className={`p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                      theme === 'dark' ? 'hover:bg-rose-500/20 text-rose-400' : 'hover:bg-rose-50 text-rose-500'
                    }`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-3">
                  <span className={theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}>
                    {formatDate(round.createdAt)}
                  </span>
                  <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>
                    {round.itemCount} 个问题
                  </span>
                </div>
                {round.pendingCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500">
                    {round.pendingCount} 待处理
                  </span>
                )}
                {round.fixedCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500">
                    {round.fixedCount} 已修复
                  </span>
                )}
              </div>

              <div className="flex items-center justify-end mt-2">
                <ChevronRight className={`w-4 h-4 ${theme === 'dark' ? 'text-gray-600' : 'text-gray-300'}`} />
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};

export default ReviewHistory;
