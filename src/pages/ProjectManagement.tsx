import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Plus, 
  Grid, 
  Clock, 
  Star, 
  Trash2, 
  Folder, 
  LayoutGrid,
  LayoutList,
  Bell,
  Settings,
  X,
  GripVertical
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, updateDoc, setDoc, writeBatch } from '../lib/localStorageService';
import { usePreferences, useStableTranslator } from '../lib/preferences';
import { errorText, localizeProjectName, UNTITLED_PROJECT_NAME } from '../lib/i18n';
import ThemeMenu from '../components/preferences/ThemeMenu';
import LanguageMenu from '../components/preferences/LanguageMenu';
import MobilePreferencesMenu from '../components/preferences/MobilePreferencesMenu';

interface Project {
  id: string;
  name: string;
  thumbnail: string;
  updatedAt: any;
  isStarred: boolean;
  category: string;
  members: string[];
  userId: string;
}

interface Category {
  id: string;
  name: string;
  userId: string;
  order?: number;
  createdAt?: any;
  isEditing?: boolean;
}

const formatRelativeDate = (timestamp: number | any, t: (text: string, vars?: Record<string, string | number>) => string, locale: string) => {
  if (!timestamp) return t('刚刚');
  const date = typeof timestamp === 'number' ? new Date(timestamp) : (timestamp.toDate ? timestamp.toDate() : new Date(timestamp));
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diff / (1000 * 60));
  
  if (diffMinutes < 1) return t('刚刚');
  
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const timeStr = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
  
  if (isToday) return t('今天 {time}', { time: timeStr });
  if (isYesterday) return t('昨天 {time}', { time: timeStr });
  
  return date.toLocaleString(locale, { 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit', 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false
  }).replace(/\//g, '-');
};

export default function ProjectManagement() {
  const { resolvedTheme, t } = usePreferences();
  const stableT = useStableTranslator();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [toasts, setToasts] = useState<{id: number, message: string, type: 'success' | 'error'}[]>([]);

  const addToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState('All projects');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);
  const [hoveredCategoryId, setHoveredCategoryId] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, categoryId: string } | null>(null);

  // Use resolvedTheme for styling
  const isDark = resolvedTheme === 'dark';
  const selectOptionClass = isDark ? 'bg-[#1e1e1e] text-gray-200' : 'bg-white text-gray-900';

  // 分类高亮只属于"拖拽项目悬停"，普通鼠标移入不应触发。
  const handleCategoryDragOver = (categoryId: string) => {
    if (draggedProjectId) setHoveredCategoryId(categoryId);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.context-menu')) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    document.title = t('AIDA · 项目列表');
  }, [t]);

  useEffect(() => {
    // Fetch Projects
    const qProjects = query(
      collection('projects'),
      orderBy('updatedAt', 'desc')
    );
    const unsubscribeProjects = onSnapshot(qProjects, (snapshot) => {
      const projs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Project[];
      setProjects(projs);
      setIsLoading(false);
    }, (err) => {
      setLoadError(errorText(err, stableT));
      setIsLoading(false);
    });

    // Fetch Categories
    const qCategories = query(
      collection('categories')
    );
    const unsubscribeCategories = onSnapshot(qCategories, (snapshot) => {
      const cats = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Category[];
      // Sort by order, then by createdAt
      cats.sort((a, b) => {
        const orderA = a.order ?? 0;
        const orderB = b.order ?? 0;
        if (orderA !== orderB) return orderA - orderB;
        const timeA = a.createdAt ?? 0;
        const timeB = b.createdAt ?? 0;
        return timeA - timeB;
      });
      setCategories(cats);
    }, (err) => {
      setLoadError(errorText(err, stableT));
    });

    return () => {
      unsubscribeProjects();
      unsubscribeCategories();
    };
  }, [stableT]);

  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (activeCategory === 'All projects') return matchesSearch && p.category !== 'Trash';
    if (activeCategory === 'Trash') return matchesSearch && p.category === 'Trash';
    if (activeCategory === 'Recents') return matchesSearch && p.category !== 'Trash';
    return matchesSearch && p.category === activeCategory;
  });

  const handleCreateProject = async () => {
    // 每次打开时按当前语言重置默认名，避免语言切换后残留旧语言的预填值
    setNewProjectName(t('未命名项目'));
    setShowCreateModal(true);
  };

  const confirmCreateProject = async () => {
    if (!newProjectName.trim()) return;

    try {
      const projectId = Date.now().toString(36) + Math.random().toString(36).substr(2);
      // 用户没改过预填名时存语言无关的占位常量，这样默认项目在任何语言下都能正确本地化显示
      const trimmedName = newProjectName.trim();
      const storedName = trimmedName === t('未命名项目') ? UNTITLED_PROJECT_NAME : trimmedName;

      setShowCreateModal(false);
      await setDoc(doc('projects', projectId), {
        name: storedName,
        updatedAt: Date.now(),
        thumbnail: '',
        isStarred: false,
        category: 'All projects',
        members: []
      });
      navigate(`/checker/${projectId}`);
    } catch (error) {
      console.error("Error creating project:", error);
      addToast(t('创建项目失败: {error}', { error: errorText(error, t, t('未知错误')) }), 'error');
    }
  };

  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDeletingId(id);
  };

  const confirmDeleteProject = async () => {
    if (!isDeletingId) return;
    const idToTrash = isDeletingId;
    // Close modal immediately for better UX
    setIsDeletingId(null);
    try {
      await updateDoc(doc('projects', idToTrash), { category: 'Trash' });
    } catch (error) {
      console.error("Error moving project to trash:", error);
      addToast(t('移入回收站失败: {error}', { error: errorText(error, t, t('未知错误')) }), 'error');
    }
  };

  const toggleStar = async (id: string, current: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await updateDoc(doc('projects', id), {
        isStarred: !current
      });
    } catch (error) {
      console.error("Error starring project:", error);
      addToast(t('更新星标失败: {error}', { error: errorText(error, t, t('未知错误')) }), 'error');
    }
  };

  const handleCreateCategory = async () => {
    try {
      const docRef = await addDoc(collection('categories'), {
        name: 'New Category',
        createdAt: serverTimestamp(),
        order: categories.length
      });
      setEditingCategoryId(docRef.id);
      setEditCategoryName('New Category');
    } catch (error) {
      console.error("Error creating category:", error);
      addToast(t('新建分类失败: {error}', { error: errorText(error, t, t('未知错误')) }), 'error');
    }
  };

  const handleReorderCategories = async (newOrder: Category[]) => {
    // Optimistic update
    setCategories(newOrder);
    
    try {
      const batch = await writeBatch();
      newOrder.forEach((cat, index) => {
        batch.update('categories', cat.id, { order: index });
      });
      await batch.commit();
    } catch (error) {
      console.error("Error reordering categories:", error);
      addToast(t('分类排序保存失败'), 'error');
    }
  };

  const handleSaveCategory = async (id: string) => {
    if (!editCategoryName.trim()) return;
    try {
      await updateDoc(doc('categories', id), {
        name: editCategoryName
      });
      setEditingCategoryId(null);
    } catch (error) {
      console.error("Error saving category:", error);
      addToast(t('保存分类失败: {error}', { error: errorText(error, t, t('未知错误')) }), 'error');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      await deleteDoc(doc('categories', id));
      if (activeCategory === id) {
        setActiveCategory('All projects');
      }
      addToast(t('分类已删除'));
    } catch (error) {
      console.error("Error deleting category:", error);
      addToast(t('删除分类失败'), 'error');
    }
    setContextMenu(null);
  };

  const handleContextMenu = (e: React.MouseEvent, categoryId: string) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      categoryId
    });
  };

  const handleDragEnd = () => {
    if (draggedProjectId && hoveredCategoryId) {
      const catName = hoveredCategoryId === 'Recents' ? t('最近') :
                      hoveredCategoryId === 'All projects' ? t('全部项目') :
                      categories.find(c => c.id === hoveredCategoryId)?.name || t('分类');
      
      // Persist first, then confirm to the user
      updateDoc(doc('projects', draggedProjectId), {
        category: hoveredCategoryId
      }).then(() => {
        addToast(t('已移动到「{name}」', { name: catName }));
      }).catch(error => {
        console.error("Error updating project category:", error);
        addToast(t('移动项目失败: {error}', { error: errorText(error, t, t('未知错误')) }), 'error');
      });
    }
    setDraggedProjectId(null);
    setHoveredCategoryId(null);
  };

  return (
    <div className={`flex h-screen transition-colors duration-200 font-sans ${isDark ? 'bg-[#121212] text-[#e0e0e0]' : 'bg-[#fafafa] text-[#1a1a1a]'}`}>
      {/* Sidebar */}
      <aside className={`hidden md:flex min-w-[16rem] w-fit max-w-xs border-r flex-col p-4 relative z-50 transition-colors duration-200 ${isDark ? 'bg-[#1e1e1e] border-[#383838]' : 'bg-white border-gray-200'}`}>
        <div className="flex items-center justify-between mb-8 relative">
          <h1 className="text-xl font-bold">AIDA</h1>
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-gray-400" aria-hidden="true" />
          </div>
        </div>

        <div className="relative mb-6">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
          <input 
            type="text" 
            placeholder={t('搜索项目')}
            aria-label={t('搜索项目')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-10 pr-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors ${isDark ? 'bg-white/5 text-white placeholder-gray-500' : 'bg-white border border-gray-200 text-gray-900 placeholder-gray-400'}`}
          />
        </div>

        <nav className="space-y-1 mb-8">
          <NavItem 
            icon={<Clock className="w-4 h-4" />} 
            label={t('最近')}
            active={activeCategory === 'Recents'} 
            onClick={() => setActiveCategory('Recents')} 
            onDragOver={() => handleCategoryDragOver('Recents')}
            onDragLeave={() => setHoveredCategoryId(null)}
            isOver={hoveredCategoryId === 'Recents'}
            theme={resolvedTheme}
          />
          <NavItem 
            icon={<Grid className="w-4 h-4" />} 
            label={t('全部项目')}
            active={activeCategory === 'All projects'} 
            onClick={() => setActiveCategory('All projects')} 
            onDragOver={() => handleCategoryDragOver('All projects')}
            onDragLeave={() => setHoveredCategoryId(null)}
            isOver={hoveredCategoryId === 'All projects'}
            theme={resolvedTheme}
          />
          <NavItem 
            icon={<Trash2 className="w-4 h-4" />} 
            label={t('回收站')}
            active={activeCategory === 'Trash'} 
            onClick={() => setActiveCategory('Trash')} 
            onDragOver={() => handleCategoryDragOver('Trash')}
            onDragLeave={() => setHoveredCategoryId(null)}
            isOver={hoveredCategoryId === 'Trash'}
            theme={resolvedTheme}
          />
        </nav>

        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
          <div className="flex items-center justify-between px-2 mb-2">
            <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{t('分类')}</span>
            <button
              type="button"
              onClick={handleCreateCategory}
              aria-label={t('新建分类')}
              className={`-m-1 p-1 rounded transition-colors ${isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <Reorder.Group axis="y" values={categories} onReorder={handleReorderCategories} className="space-y-1">
            {categories.map(cat => (
              <Reorder.Item 
                key={cat.id} 
                value={cat}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
              >
                <NavItem 
                  icon={<Folder className="w-4 h-4" />} 
                  label={cat.name} 
                  active={activeCategory === cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  onDragOver={() => handleCategoryDragOver(cat.id)}
                  onDragLeave={() => setHoveredCategoryId(null)}
                  isOver={hoveredCategoryId === cat.id}
                  isEditing={editingCategoryId === cat.id}
                  editValue={editCategoryName}
                  onEditChange={setEditCategoryName}
                  onSave={() => handleSaveCategory(cat.id)}
                  onCancel={() => setEditingCategoryId(null)}
                  onDoubleClick={() => {
                    setEditingCategoryId(cat.id);
                    setEditCategoryName(cat.name);
                  }}
                  onContextMenu={(e) => handleContextMenu(e, cat.id)}
                  theme={resolvedTheme}
                  showHandle
                />
              </Reorder.Item>
            ))}
          </Reorder.Group>
        </div>

        <div className={`mt-auto pt-3 border-t space-y-1 ${isDark ? 'border-[#383838]' : 'border-gray-200'}`}>
          <ThemeMenu />
          <LanguageMenu />
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm transition-colors ${
              isDark ? 'text-gray-300 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span className="flex-1 text-left">{t('设置')}</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 min-w-0 flex flex-col relative z-10 transition-colors duration-200 ${isDark ? 'bg-[#121212]' : 'bg-[#fafafa]'}`}>
        <header className={`px-4 sm:px-8 py-6 flex flex-wrap gap-3 items-center justify-between sticky top-0 z-30 backdrop-blur-md transition-colors duration-200 ${isDark ? 'bg-[#121212]/80' : 'bg-[#fafafa]/80'}`}>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{activeCategory === 'All projects' ? t('全部项目') : activeCategory === 'Recents' ? t('最近') : activeCategory === 'Trash' ? t('回收站') : categories.find(c => c.id === activeCategory)?.name || activeCategory}</h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 ml-auto">
            {activeCategory !== 'Trash' && (
              <button 
                onClick={handleCreateProject}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20"
              >
                <Plus className="w-4 h-4" />
                {t('新建项目')}
              </button>
            )}

            <div className={`flex items-center gap-1 p-1 rounded-2xl transition-colors duration-200 ${
              isDark ? 'bg-[#2c2c2c]' : 'bg-[#f0f0f5]'
            }`}>
              <button 
                onClick={() => setViewMode('grid')}
                aria-label={t('网格视图')}
                aria-pressed={viewMode === 'grid'}
                className={`px-4 py-1.5 rounded-xl text-[13px] font-semibold transition-all ${
                  viewMode === 'grid' 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : (isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700')
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setViewMode('list')}
                aria-label={t('列表视图')}
                aria-pressed={viewMode === 'list'}
                className={`px-4 py-1.5 rounded-xl text-[13px] font-semibold transition-all ${
                  viewMode === 'list' 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : (isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700')
                }`}
              >
                <LayoutList className="w-4 h-4" />
              </button>
            </div>

            {/* 放在控件区最右侧：弹层按右侧对齐，窄屏换行后仍贴住视口右缘，不会被裁切 */}
            <MobilePreferencesMenu />
          </div>
        </header>

        <div className="md:hidden px-4 pb-3">
          <select
            aria-label={t('选择项目分类')}
            value={activeCategory}
            onChange={(e) => setActiveCategory(e.target.value)}
            className={`w-full rounded-lg border px-3 py-2 text-sm ${isDark ? 'border-[#383838] bg-[#1e1e1e] text-gray-200' : 'border-gray-200 bg-white text-gray-900'}`}
          >
            <option value="Recents" className={selectOptionClass}>{t('最近')}</option>
            <option value="All projects" className={selectOptionClass}>{t('全部项目')}</option>
            <option value="Trash" className={selectOptionClass}>{t('回收站')}</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id} className={selectOptionClass}>{cat.name}</option>
            ))}
          </select>
        </div>

        <div className={`flex-1 overflow-y-auto px-4 sm:px-8 pb-8 ${draggedProjectId ? 'overflow-visible' : 'overflow-x-visible'}`}>
          {loadError && (
            <div
              role="alert"
              className={`mb-4 flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${isDark ? 'border-rose-500/30 bg-rose-500/10 text-rose-300' : 'border-rose-200 bg-rose-50 text-rose-700'}`}
            >
              <span>{t('加载数据失败：{error}', { error: loadError })}{t('（数据可能不是最新，请检查后端服务后刷新页面）')}</span>
              <button
                type="button"
                onClick={() => setLoadError(null)}
                aria-label={t('关闭错误提示')}
                className="shrink-0 rounded p-1 hover:bg-black/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          {isLoading ? (
            <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4' : 'flex flex-col gap-3'}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className={`animate-pulse bg-gray-100 rounded-xl ${viewMode === 'grid' ? 'aspect-[4/3]' : 'h-20'}`} />
              ))}
            </div>
          ) : (
            <div 
              className={viewMode === 'grid' 
                ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4' 
                : 'flex flex-col gap-3'
              }
            >
              {filteredProjects.map((project) => (
                <ProjectCard 
                  key={project.id} 
                  project={project} 
                  viewMode={viewMode} 
                  onClick={() => navigate(`/checker/${project.id}`)}
                  onDelete={(e) => handleDeleteProject(project.id, e)}
                  onStar={(e) => toggleStar(project.id, project.isStarred, e)}
                  onDragStart={() => setDraggedProjectId(project.id)}
                  onDragEnd={handleDragEnd}
                  isOwner={true}
                  theme={resolvedTheme}
                />
              ))}
              {filteredProjects.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center py-20 text-gray-400">
                  <Folder className="w-12 h-12 mb-4 opacity-20" />
                  <p>{loadError ? t('数据加载失败，暂时无法显示项目') : activeCategory === 'Trash' ? t('回收站为空') : t('暂无项目')}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Create Project Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold">{t('新建项目')}</h2>
                  <button onClick={() => setShowCreateModal(false)} aria-label={t('关闭')} className="p-1 hover:bg-gray-100 rounded-full">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="new-project-name" className="block text-xs font-semibold text-gray-400 uppercase mb-1">{t('项目名称')}</label>
                    <input 
                      id="new-project-name"
                      type="text" 
                      maxLength={100}
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      autoFocus
                      className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-indigo-500 focus:bg-white rounded-xl outline-none transition-all"
                      placeholder={t('例如：官网改版')}
                    />
                  </div>
                </div>
              </div>
              <div className="p-4 bg-gray-50 flex gap-3">
                <button 
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-xl transition-colors"
                >
                  {t('取消')}
                </button>
                <button 
                  onClick={confirmCreateProject}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-lg shadow-indigo-500/20"
                >
                  {t('创建项目')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeletingId && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            >
              <div className="p-6 text-center">
                <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trash2 className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold mb-2">{t('移入回收站？')}</h2>
                <p className="text-sm text-gray-500">
                  {t('项目将移入回收站，可在「回收站」分类中重新找到，不会立即永久删除。')}
                </p>
              </div>
              <div className="p-4 bg-gray-50 flex gap-3">
                <button 
                  onClick={() => setIsDeletingId(null)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-xl transition-colors"
                >
                  {t('取消')}
                </button>
                <button 
                  onClick={confirmDeleteProject}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors shadow-lg shadow-red-500/20"
                >
                  {t('移入回收站')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toasts */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
              transition={{ type: "spring", stiffness: 600, damping: 30 }}
              className="bg-gray-900/90 backdrop-blur-md text-white px-4 py-2 rounded-full text-sm font-medium shadow-2xl flex items-center gap-2 border border-white/10"
            >
              <div className={`w-2 h-2 rounded-full ${toast.type === 'success' ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'}`} />
              {toast.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>



      {/* Context Menu */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="context-menu fixed z-[500] w-32 bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl overflow-hidden p-1"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => handleDeleteCategory(contextMenu.categoryId)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const NavItem: React.FC<{ 
  icon: React.ReactNode, 
  label: string, 
  active?: boolean, 
  onClick: () => void,
  onDragOver?: () => void,
  onDragLeave?: () => void,
  isOver?: boolean,
  isEditing?: boolean,
  editValue?: string,
  onEditChange?: (val: string) => void,
  onSave?: () => void,
  onCancel?: () => void,
  onDoubleClick?: () => void,
  onContextMenu?: (e: React.MouseEvent) => void,
  theme?: 'light' | 'dark' | 'system',
  showHandle?: boolean
}> = ({ 
  icon, 
  label, 
  active, 
  onClick, 
  onDragOver, 
  onDragLeave,
  isOver,
  isEditing,
  editValue,
  onEditChange,
  onSave,
  onCancel,
  onDoubleClick,
  onContextMenu,
  theme,
  showHandle
}) => {
  return (
    <div 
      onMouseEnter={onDragOver}
      onMouseLeave={onDragLeave}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      className="relative group/nav"
    >
      <button 
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
          active 
            ? (theme === 'dark' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-indigo-50 text-indigo-600') 
            : (theme === 'dark' ? 'text-gray-400 hover:bg-white/5 hover:text-gray-200' : 'text-gray-600 hover:bg-gray-50')
        } ${isOver ? (theme === 'dark' ? 'bg-indigo-500/30 ring-2 ring-indigo-500 ring-inset' : 'bg-indigo-100 ring-2 ring-indigo-400 ring-inset') : ''}`}
      >
        {showHandle && (
          <GripVertical className="w-3 h-3 text-gray-400 opacity-0 group-hover/nav:opacity-100 transition-opacity cursor-grab active:cursor-grabbing shrink-0" />
        )}
        {icon}
        {isEditing ? (
          <input 
            autoFocus
            maxLength={50}
            value={editValue}
            onChange={(e) => onEditChange?.(e.target.value)}
            onBlur={onSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSave?.();
              if (e.key === 'Escape') onCancel?.();
            }}
            className={`flex-1 rounded px-1 outline-none ${theme === 'dark' ? 'bg-[#2c2c2c] border-indigo-500 text-indigo-400' : 'bg-white border-indigo-300 text-indigo-600'}`}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="truncate">{label}</span>
        )}
      </button>
    </div>
  );
}

const ProjectCard: React.FC<{ 
  project: Project, 
  viewMode: 'grid' | 'list', 
  onClick: () => void,
  onDelete: (e: React.MouseEvent) => void,
  onStar: (e: React.MouseEvent) => void,
  onDragStart?: () => void,
  onDragEnd?: () => void,
  isOwner: boolean,
  theme?: 'light' | 'dark' | 'system'
}> = ({ project, viewMode, onClick, onDelete, onStar, onDragStart, onDragEnd, isOwner, theme }) => {
  const { t, locale } = usePreferences();
  const formattedDate = formatRelativeDate(project.updatedAt, t, locale);
  const displayName = localizeProjectName(project.name, t);

  const isList = viewMode === 'list';

  const smoothTransition = {
    type: "spring",
    stiffness: 500,
    damping: 35,
    mass: 0.5
  } as const;

  return (
    <motion.div 
      layout
      drag
      dragSnapToOrigin
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      whileDrag={{ 
        scale: 0.9, 
        opacity: 0.8, 
        zIndex: 1000,
        pointerEvents: "none",
        boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)"
      }}
      transition={smoothTransition}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={t('打开项目 {name}', { name: displayName })}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={`group transition-[border-color,box-shadow] cursor-grab active:cursor-grabbing overflow-hidden border ${
        theme === 'dark' ? 'bg-[#1e1e1e] border-[#383838]' : 'bg-white border-gray-200'
      } ${
        isList 
          ? 'flex items-center justify-between p-4 rounded-xl hover:border-indigo-500/50 hover:shadow-sm' 
          : 'flex flex-col rounded-xl hover:border-indigo-500/50 hover:shadow-md h-full'
      }`}
    >
      <motion.div 
        className={`relative overflow-hidden shrink-0 ${
          theme === 'dark' ? 'bg-white/5' : 'bg-gray-100'
        } ${
          isList ? 'w-12 h-9 rounded' : 'aspect-[4/3] w-full'
        }`}
      >
        {!project.thumbnail && (
          <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <span className={`font-bold ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'} ${isList ? 'text-sm' : 'text-2xl'}`}>
              {displayName.trim().charAt(0).toUpperCase() || '?'}
            </span>
          </div>
        )}
        {project.thumbnail && (
          <img 
            src={project.thumbnail} 
            alt={displayName} 
            className="relative w-full h-full object-cover object-center transition-opacity duration-300" 
            loading="lazy"
            onLoad={(e) => (e.currentTarget.style.opacity = '1')}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
            style={{ opacity: 0 }}
          />
        )}
        {!isList && isOwner && (
          <>
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
            <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button 
                onClick={onStar} 
                onPointerDown={(e) => e.stopPropagation()}
                aria-label={project.isStarred ? t('取消星标') : t('加星标')}
                className={`p-2 backdrop-blur rounded-lg shadow-sm transition-colors ${theme === 'dark' ? 'bg-[#2c2c2c]/90 text-gray-400 hover:text-yellow-500' : 'bg-white/90 text-gray-400 hover:text-yellow-500'}`}
              >
                <Star className={`w-4 h-4 ${project.isStarred ? 'fill-yellow-400 text-yellow-400' : ''}`} />
              </button>
              <button 
                onClick={onDelete} 
                onPointerDown={(e) => e.stopPropagation()}
                aria-label={t('移入回收站')}
                className={`p-2 backdrop-blur rounded-lg shadow-sm transition-colors ${theme === 'dark' ? 'bg-[#2c2c2c]/90 text-gray-400 hover:text-red-500' : 'bg-white/90 text-gray-400 hover:text-red-500'}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </motion.div>

      <div 
        className={`flex items-center justify-between min-w-0 ${
          isList ? 'flex-1 ml-4' : 'p-3 flex-1'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          {!isList && (
            <div 
              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${theme === 'dark' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-indigo-50 text-indigo-600'}`}
            >
              <Grid className="w-3.5 h-3.5" />
            </div>
          )}
          <div className="min-w-0">
            <h3 className={`font-medium text-sm flex items-center gap-2 truncate ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
              {displayName}
              {isList && project.isStarred && <Star className="w-3 h-3 fill-yellow-400 text-yellow-400 shrink-0" />}
            </h3>
            <p className="text-xs text-gray-400 truncate">{formattedDate}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className={`flex -space-x-2 ${isList ? '' : 'hidden sm:flex'}`}>
            {project.members?.map((m, i) => (
              <div key={i} className={`${isList ? 'w-6 h-6' : 'w-7 h-7'} rounded-full border-2 overflow-hidden flex items-center justify-center ${theme === 'dark' ? 'border-[#1e1e1e] bg-gray-700 text-gray-300' : 'border-white bg-gray-200 text-gray-600'}`}>
                <span className="text-[10px] font-semibold uppercase" aria-label={t('成员 {name}', { name: m })}>
                  {String(m).trim().charAt(0) || '?'}
                </span>
              </div>
            ))}
          </div>
          
          {isList && isOwner && (
            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button 
                onClick={onStar} 
                onPointerDown={(e) => e.stopPropagation()}
                aria-label={project.isStarred ? t('取消星标') : t('加星标')}
                className="p-1 text-gray-400 hover:text-yellow-500"
              >
                <Star className={`w-4 h-4 ${project.isStarred ? 'fill-yellow-400 text-yellow-400' : ''}`} />
              </button>
              <button 
                onClick={onDelete} 
                onPointerDown={(e) => e.stopPropagation()}
                aria-label={t('移入回收站')}
                className="p-1 text-gray-400 hover:text-red-500"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
