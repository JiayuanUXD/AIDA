import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Check, X, AlertCircle, Clock, CheckCircle, XCircle,
  Upload, Image, Save, Trash2, Plus, Edit3, ChevronDown
} from 'lucide-react';
import { ReviewRoundWithItems, ReviewItem } from '../types';

interface ReviewDetailProps {
  roundId: string;
  theme: 'light' | 'dark' | 'system';
  onBack: () => void;
  onRoundUpdate: () => void;
}

const API_BASE = '';

export const ReviewDetail: React.FC<ReviewDetailProps> = ({
  roundId,
  theme,
  onBack,
  onRoundUpdate
}) => {
  const [round, setRound] = useState<ReviewRoundWithItems | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemType, setNewItemType] = useState<ReviewItem['type']>('style');
  const [newItemSeverity, setNewItemSeverity] = useState<ReviewItem['severity']>('medium');
  const [showAddItem, setShowAddItem] = useState(false);

  const loadRound = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/review-rounds/${roundId}`);
      const data = await res.json();
      setRound(data.round);
    } catch (e) {
      console.error('Failed to load round:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (roundId) {
      loadRound();
    }
  }, [roundId]);

  const updateRoundStatus = async (status: ReviewRoundWithItems['status']) => {
    try {
      await fetch(`${API_BASE}/api/review-rounds/${roundId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      loadRound();
      onRoundUpdate();
    } catch (e) {
      console.error('Failed to update round status:', e);
    }
  };

  const updateItemStatus = async (itemId: string, status: ReviewItem['status']) => {
    try {
      await fetch(`${API_BASE}/api/review-items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      loadRound();
      onRoundUpdate();
    } catch (e) {
      console.error('Failed to update item status:', e);
    }
  };

  const addItem = async () => {
    if (!newItemDesc.trim()) return;

    try {
      await fetch(`${API_BASE}/api/review-rounds/${roundId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: newItemType,
          description: newItemDesc,
          severity: newItemSeverity
        })
      });
      setNewItemDesc('');
      setNewItemType('style');
      setNewItemSeverity('medium');
      setShowAddItem(false);
      loadRound();
      onRoundUpdate();
    } catch (e) {
      console.error('Failed to add item:', e);
    }
  };

  const deleteItem = async (itemId: string) => {
    if (!confirm('确定要删除此问题项吗？')) return;

    try {
      await fetch(`${API_BASE}/api/review-items/${itemId}`, { method: 'DELETE' });
      loadRound();
      onRoundUpdate();
    } catch (e) {
      console.error('Failed to delete item:', e);
    }
  };

  const getStatusIcon = (status: ReviewRoundWithItems['status']) => {
    switch (status) {
      case 'passed':
        return <CheckCircle className="w-5 h-5 text-emerald-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-rose-500" />;
      case 'in_review':
        return <Clock className="w-5 h-5 text-amber-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusLabel = (status: ReviewRoundWithItems['status']) => {
    switch (status) {
      case 'passed':
        return '验收通过';
      case 'failed':
        return '验收未通过';
      case 'in_review':
        return '验收进行中';
      default:
        return '待处理';
    }
  };

  const getTypeColor = (type: ReviewItem['type']) => {
    switch (type) {
      case 'content':
        return 'bg-indigo-500/20 text-indigo-400';
      case 'layout':
        return 'bg-amber-500/20 text-amber-400';
      case 'style':
        return 'bg-rose-500/20 text-rose-400';
    }
  };

  const getSeverityColor = (severity: ReviewItem['severity']) => {
    switch (severity) {
      case 'high':
        return 'bg-rose-500/20 text-rose-400';
      case 'medium':
        return 'bg-amber-500/20 text-amber-400';
      case 'low':
        return 'bg-emerald-500/20 text-emerald-400';
    }
  };

  const getItemStatusColor = (status: ReviewItem['status']) => {
    switch (status) {
      case 'fixed':
        return 'bg-emerald-500/20 text-emerald-400';
      case 'ignored':
        return 'bg-gray-500/20 text-gray-400';
      default:
        return 'bg-amber-500/20 text-amber-400';
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!round) {
    return (
      <div className={`flex flex-col items-center justify-center h-full ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
        <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">验收轮次不存在</p>
        <button
          onClick={onBack}
          className="mt-4 px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-xs font-bold hover:bg-indigo-600 transition-colors"
        >
          返回列表
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={`p-4 border-b ${theme === 'dark' ? 'border-white/10' : 'border-black/5'}`}>
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={onBack}
            className={`p-1.5 rounded-lg transition-colors ${theme === 'dark' ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            {getStatusIcon(round.status)}
            <h2 className="text-sm font-bold">第 {round.roundNumber} 轮验收</h2>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
            {formatDate(round.createdAt)}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${getItemStatusColor(round.status as any)}`}>
            {getStatusLabel(round.status)}
          </span>
        </div>

        {/* Status Actions */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => updateRoundStatus('passed')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${
              round.status === 'passed'
                ? 'bg-emerald-500 text-white'
                : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'
            }`}
          >
            <Check className="w-3 h-3 inline mr-1" />
            通过
          </button>
          <button
            onClick={() => updateRoundStatus('failed')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${
              round.status === 'failed'
                ? 'bg-rose-500 text-white'
                : 'bg-rose-500/10 text-rose-500 hover:bg-rose-500/20'
            }`}
          >
            <X className="w-3 h-3 inline mr-1" />
            未通过
          </button>
          <button
            onClick={() => updateRoundStatus('in_review')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${
              round.status === 'in_review'
                ? 'bg-amber-500 text-white'
                : 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20'
            }`}
          >
            <Clock className="w-3 h-3 inline mr-1" />
            验收中
          </button>
        </div>
      </div>

      {/* Items List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        <div className="flex items-center justify-between px-2 py-1">
          <span className={`text-xs font-bold ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
            问题列表 ({round.items?.length || 0})
          </span>
          <button
            onClick={() => setShowAddItem(!showAddItem)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-500/10 text-indigo-500 text-[10px] font-bold hover:bg-indigo-500/20 transition-colors"
          >
            <Plus className="w-3 h-3" />
            添加问题
          </button>
        </div>

        {/* Add Item Form */}
        <AnimatePresence>
          {showAddItem && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className={`p-3 rounded-xl border ${theme === 'dark' ? 'bg-[#252525] border-white/10' : 'bg-gray-50 border-gray-200'}`}
            >
              <div className="space-y-2">
                <div className="flex gap-2">
                  <select
                    value={newItemType}
                    onChange={(e) => setNewItemType(e.target.value as ReviewItem['type'])}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-xs ${theme === 'dark' ? 'bg-[#1e1e1e] border-white/10' : 'bg-white border-gray-200'} border`}
                  >
                    <option value="content">内容问题</option>
                    <option value="layout">布局问题</option>
                    <option value="style">样式问题</option>
                  </select>
                  <select
                    value={newItemSeverity}
                    onChange={(e) => setNewItemSeverity(e.target.value as ReviewItem['severity'])}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-xs ${theme === 'dark' ? 'bg-[#1e1e1e] border-white/10' : 'bg-white border-gray-200'} border`}
                  >
                    <option value="high">高优先级</option>
                    <option value="medium">中优先级</option>
                    <option value="low">低优先级</option>
                  </select>
                </div>
                <textarea
                  value={newItemDesc}
                  onChange={(e) => setNewItemDesc(e.target.value)}
                  placeholder="描述问题..."
                  className={`w-full px-2 py-1.5 rounded-lg text-xs resize-none h-16 ${theme === 'dark' ? 'bg-[#1e1e1e] border-white/10' : 'bg-white border-gray-200'} border`}
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShowAddItem(false)}
                    className={`px-3 py-1.5 rounded-lg text-xs ${theme === 'dark' ? 'bg-white/5 text-gray-400' : 'bg-gray-100 text-gray-500'}`}
                  >
                    取消
                  </button>
                  <button
                    onClick={addItem}
                    className="px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-xs font-bold hover:bg-indigo-600 transition-colors"
                  >
                    添加
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Items */}
        {round.items?.map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-3 rounded-xl border transition-all group ${
              theme === 'dark'
                ? 'bg-[#252525] border-white/5'
                : 'bg-gray-50 border-gray-100'
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${getTypeColor(item.type)}`}>
                  {item.type === 'content' ? '内容' : item.type === 'layout' ? '布局' : '样式'}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${getSeverityColor(item.severity)}`}>
                  {item.severity === 'high' ? '高' : item.severity === 'medium' ? '中' : '低'}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${getItemStatusColor(item.status)}`}>
                  {item.status === 'pending' ? '待处理' : item.status === 'fixed' ? '已修复' : '已忽略'}
                </span>
                <button
                  onClick={() => deleteItem(item.id)}
                  className={`p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                    theme === 'dark' ? 'hover:bg-rose-500/20 text-rose-400' : 'hover:bg-rose-50 text-rose-500'
                  }`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>

            <p className={`text-xs mb-3 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
              {item.description}
            </p>

            <div className="flex items-center justify-between">
              <span className={`text-[10px] ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`}>
                {formatDate(item.createdAt)}
              </span>
              {item.status === 'pending' && (
                <div className="flex gap-1">
                  <button
                    onClick={() => updateItemStatus(item.id, 'fixed')}
                    className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-500 text-[10px] font-bold hover:bg-emerald-500/20 transition-colors"
                  >
                    已修复
                  </button>
                  <button
                    onClick={() => updateItemStatus(item.id, 'ignored')}
                    className="px-2 py-1 rounded bg-gray-500/10 text-gray-400 text-[10px] font-bold hover:bg-gray-500/20 transition-colors"
                  >
                    忽略
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        ))}

        {(!round.items || round.items.length === 0) && (
          <div className={`text-center py-8 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-xs">暂无问题记录</p>
            <p className="text-[10px] mt-1 opacity-70">点击"添加问题"记录验收问题</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReviewDetail;
