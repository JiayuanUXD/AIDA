import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Plus, 
  Grid, 
  List, 
  MoreVertical, 
  Clock, 
  Star, 
  Trash2, 
  Folder, 
  ChevronDown,
  LayoutGrid,
  LayoutList,
  Bell,
  User as UserIcon,
  LogOut,
  LogIn,
  X,
  Settings,
  Moon,
  Sun,
  Monitor,
  ChevronRight,
  Check,
  UserCircle,
  Edit2,
  GripVertical
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  listProjects, 
  listCategories,
  createProject,
  patchProject,
  createCategory,
  patchCategory,
  deleteCategory,
} from '../lib/localApi';

interface Project {
  id: string;
  name: string;
  thumbnail: string;
  updatedAt: any;
  isStarred: boolean;
  category: string;
  members?: string[];
  userId?: string;
}

interface Category {
  id: string;
  name: string;
  userId?: string;
  isEditing?: boolean;
}

const CATEGORIES = ['Category 01', 'Category 02'];

const formatRelativeDate = (timestamp: number | any) => {
  if (!timestamp) return '刚刚';
  const date = typeof timestamp === 'number' ? new Date(timestamp) : (timestamp.toDate ? timestamp.toDate() : new Date(timestamp));
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diff / (1000 * 60));
  
  if (diffMinutes < 1) return '刚刚';
  
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  
  if (isToday) return `今天 ${timeStr}`;
  if (isYesterday) return `昨天 ${timeStr}`;
  
  return date.toLocaleString([], { 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit', 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false
  }).replace(/\//g, '-');
};

export default function ProjectManagement() {
  const navigate = useNavigate();
  // Local dev: no login required.
  const user = { uid: 'dev', displayName: 'Local Dev', photoURL: undefined as string | undefined, email: 'dev@local' };
  const userProfile = { displayName: 'Local Dev', role: '' };
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('Last modified');
  const [toasts, setToasts] = useState<{id: number, message: string}[]>([]);

  const addToast = (message: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState('All projects');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('New Project');
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);
  const [hoveredCategoryId, setHoveredCategoryId] = useState<string | null>(null);
  const [draggedCategoryId, setDraggedCategoryId] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showThemeSubmenu, setShowThemeSubmenu] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, categoryId: string } | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.user-profile-trigger') && !target.closest('.user-dropdown-menu')) {
        setShowUserDropdown(false);
        setShowThemeSubmenu(false);
      }
      if (!target.closest('.context-menu')) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const reload = async () => {
    setIsLoading(true);
    try {
      const [projs, cats] = await Promise.all([listProjects(), listCategories()]);
      setProjects(projs as any);
      setCategories(cats as any);
    } catch (e) {
      console.error("Reload projects/categories failed:", e);
      setProjects([]);
      setCategories([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    reload().catch((e) => console.error("Initial load failed:", e));
  }, []);

  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (activeCategory === 'All projects') return matchesSearch && p.category !== 'Trash';
    if (activeCategory === 'Trash') return matchesSearch && p.category === 'Trash';
    if (activeCategory === 'Recents') return matchesSearch && p.category !== 'Trash';
    return matchesSearch && p.category === activeCategory;
  });

  const handleCreateProject = async () => {
    setShowCreateModal(true);
  };

  const confirmCreateProject = async () => {
    if (!newProjectName.trim()) return;

    try {
      setShowCreateModal(false);
      const { id: projectId } = await createProject({
        name: newProjectName,
        updatedAt: Date.now(),
        thumbnail: 'https://picsum.photos/seed/' + Math.random() + '/400/300',
        isStarred: false,
        category: 'All projects',
        members: [user.uid],
      });

      await reload();
      navigate(`/checker/${projectId}`);
    } catch (error) {
      console.error("Error creating project:", error);
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
      await patchProject(idToTrash, { category: 'Trash' });
      await reload();
    } catch (error) {
      console.error("Error moving project to trash:", error);
    }
  };

  const toggleStar = async (id: string, current: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await patchProject(id, { isStarred: !current });
      await reload();
    } catch (error) {
      console.error("Error starring project:", error);
    }
  };

  const handleCreateCategory = async () => {
    if (!user?.uid) return;
    try {
      const res = await createCategory('New Category');
      setEditingCategoryId(res.id);
      setEditCategoryName('New Category');
      await reload();
    } catch (error) {
      console.error("Error creating category:", error);
    }
  };

  const handleSaveCategory = async (id: string) => {
    if (!editCategoryName.trim()) return;
    try {
      await patchCategory(id, { name: editCategoryName });
      setEditingCategoryId(null);
      await reload();
    } catch (error) {
      console.error("Error saving category:", error);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      await deleteCategory(id);
      if (activeCategory === id) {
        setActiveCategory('All projects');
      }
      addToast("Category deleted");
    } catch (error) {
      console.error("Error deleting category:", error);
      addToast("Failed to delete category");
    }
    await reload();
    setContextMenu(null);
  };

  const handleReorderCategories = async (newOrder: string[]) => {
    try {
      // 这里可以实现分类排序的持久化
      // 目前只更新前端状态
      // 使用新的排序顺序重新构建分类列表
      const allCategories = [...categories];
      const reorderedCategories = newOrder.map(id => 
        allCategories.find(cat => cat.id === id)
      ).filter(Boolean) as Category[];
      
      // 确保所有分类都被包含
      const remainingCategories = allCategories.filter(cat => 
        !reorderedCategories.some(c => c.id === cat.id)
      );
      
      const finalOrder = [...reorderedCategories, ...remainingCategories];
      setCategories(finalOrder);
      
      console.log('Categories reordered:', finalOrder.map(c => c.name));
    } catch (error) {
      console.error("Error reordering categories:", error);
    }
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
      const catName = hoveredCategoryId === 'Recents' ? 'Recents' : 
                      hoveredCategoryId === 'All projects' ? 'All projects' :
                      categories.find(c => c.id === hoveredCategoryId)?.name || 'Category';
      
      // Interaction-first: Show toast immediately
      addToast(`Moved project to ${catName}`);

      // Update local backend in the background
      patchProject(draggedProjectId, { category: hoveredCategoryId })
        .catch(error => {
          console.error("Error updating project category:", error);
          addToast("Failed to move project");
        })
        .finally(() => reload());
    }
    setDraggedProjectId(null);
    setHoveredCategoryId(null);
  };

  return (
    <div className={`flex h-screen transition-colors duration-200 font-sans ${theme === 'dark' ? 'bg-[#121212] text-[#e0e0e0]' : 'bg-[#fafafa] text-[#1a1a1a]'}`}>
      {/* Sidebar */}
      <aside className={`min-w-[16rem] w-fit max-w-xs border-r flex flex-col p-4 relative z-50 transition-colors duration-200 ${theme === 'dark' ? 'bg-[#1e1e1e] border-[#383838]' : 'bg-white border-gray-200'}`}>
        <div className="flex items-center justify-between mb-8 relative">
          <div 
            className={`user-profile-trigger flex items-center gap-2 cursor-pointer p-1.5 -ml-1.5 rounded-xl transition-colors min-w-0 ${theme === 'dark' ? 'hover:bg-white/5' : 'hover:bg-gray-50'}`}
            onClick={() => setShowUserDropdown(!showUserDropdown)}
          >
            <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden shrink-0">
              {user?.photoURL ? (
                <img src={user.photoURL} alt="User" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-indigo-100 text-indigo-600">
                  <UserIcon className="w-4 h-4" />
                </div>
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-medium text-sm whitespace-nowrap">
                {userProfile.displayName || user?.displayName || (user ? 'User' : 'Guest')}
              </span>
              {userProfile.role && (
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  {userProfile.role}
                </span>
              )}
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showUserDropdown ? 'rotate-180' : ''}`} />
          </div>

          <AnimatePresence>
            {showUserDropdown && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="user-dropdown-menu absolute top-full left-0 mt-2 w-full min-w-[200px] bg-[#1e1e1e] text-white rounded-2xl shadow-2xl border border-white/10 z-[100]"
              >
                {/* User Info Section */}
                <div className="p-4 flex flex-col items-center text-center border-b border-white/5">
                  <div className="relative mb-3">
                    <div className="w-16 h-16 rounded-full bg-gray-700 overflow-hidden ring-4 ring-white/5">
                      {user?.photoURL ? (
                        <img src={user.photoURL} alt="User" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-indigo-500/20 text-indigo-400">
                          <UserIcon className="w-8 h-8" />
                        </div>
                      )}
                    </div>
                    <button className="absolute bottom-0 right-0 w-6 h-6 bg-[#2c2c2c] border border-white/10 rounded-full flex items-center justify-center hover:bg-[#383838] transition-colors shadow-lg">
                      <Edit2 className="w-3 h-3 text-white" />
                    </button>
                  </div>
                  <h3 className="font-bold text-base mb-0.5">
                    {userProfile.displayName || user?.displayName || (user ? 'User' : 'Guest')}
                  </h3>
                  <p className="text-xs text-gray-500 truncate w-full">
                    {user?.email || 'No email provided'}
                  </p>
                </div>

                {/* Menu Items */}
                <div className="p-1.5 space-y-0.5">
                  <>
                    <div className="relative">
                      <button 
                        onClick={() => setShowThemeSubmenu(!showThemeSubmenu)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-colors ${showThemeSubmenu ? 'bg-indigo-600 text-white' : 'hover:bg-white/5 text-gray-300'}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${showThemeSubmenu ? 'bg-white/20' : 'bg-white/5'}`}>
                            <Monitor className="w-3.5 h-3.5" />
                          </div>
                          <span className="font-medium text-sm">主题</span>
                        </div>
                        <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showThemeSubmenu ? 'rotate-90' : ''}`} />
                      </button>

                      <AnimatePresence>
                        {showThemeSubmenu && (
                          <motion.div
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            className="user-dropdown-menu absolute left-full top-0 ml-2 w-40 bg-[#2c2c2c] border border-white/10 rounded-2xl shadow-2xl p-1.5 z-[110]"
                          >
                            {[
                              { id: 'light', icon: <Sun className="w-3.5 h-3.5" />, label: '明亮模式' },
                              { id: 'dark', icon: <Moon className="w-3.5 h-3.5" />, label: '暗黑模式' },
                              { id: 'system', icon: <Monitor className="w-3.5 h-3.5" />, label: '跟随系统' }
                            ].map((item) => (
                              <button
                                key={item.id}
                                onClick={() => {
                                  setTheme(item.id as any);
                                  setShowThemeSubmenu(false);
                                  setShowUserDropdown(false);
                                }}
                                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/5 text-xs text-gray-300 transition-colors"
                              >
                                <div className="flex items-center gap-2.5">
                                  {item.icon}
                                  <span>{item.label}</span>
                                </div>
                                {theme === item.id && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/5 text-gray-300 transition-colors">
                      <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center">
                        <Settings className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-medium text-sm">设置</span>
                    </button>

                    <div className="h-px bg-white/5 my-1 mx-2" />

                    <button 
                      onClick={() => setShowUserDropdown(false)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-red-500/10 text-gray-300 hover:text-red-400 transition-colors"
                    >
                      <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center">
                        <LogOut className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-medium text-sm">退出登录</span>
                    </button>
                  </>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-gray-400 cursor-pointer" />
          </div>
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-10 pr-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors ${theme === 'dark' ? 'bg-white/5 text-white placeholder-gray-500' : 'bg-white border border-gray-200 text-gray-900 placeholder-gray-400'}`}
          />
        </div>

        <nav className="space-y-1 mb-8">
          <NavItem 
            icon={<Clock className="w-4 h-4" />} 
            label="Recents" 
            active={activeCategory === 'Recents'} 
            onClick={() => setActiveCategory('Recents')} 
            onDragOver={() => setHoveredCategoryId('Recents')}
            onDragLeave={() => setHoveredCategoryId(null)}
            isOver={hoveredCategoryId === 'Recents'}
            theme={theme}
          />
          <NavItem 
            icon={<Grid className="w-4 h-4" />} 
            label="All projects" 
            active={activeCategory === 'All projects'} 
            onClick={() => setActiveCategory('All projects')} 
            onDragOver={() => setHoveredCategoryId('All projects')}
            onDragLeave={() => setHoveredCategoryId(null)}
            isOver={hoveredCategoryId === 'All projects'}
            theme={theme}
          />
          <NavItem 
            icon={<Trash2 className="w-4 h-4" />} 
            label="Trash" 
            active={activeCategory === 'Trash'} 
            onClick={() => setActiveCategory('Trash')} 
            onDragOver={() => setHoveredCategoryId('Trash')}
            onDragLeave={() => setHoveredCategoryId(null)}
            isOver={hoveredCategoryId === 'Trash'}
            theme={theme}
          />
        </nav>

        <div>
          <div className="flex items-center justify-between px-2 mb-2">
            <span className={`text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Starred</span>
            <Plus className={`w-4 h-4 cursor-pointer transition-colors ${theme === 'dark' ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`} onClick={handleCreateCategory} />
          </div>
          <div className="space-y-1">
            {categories.map(cat => (
              <NavItem 
                key={cat.id} 
                id={cat.id}
                label={cat.name} 
                active={activeCategory === cat.id}
                onClick={() => setActiveCategory(cat.id)}
                onDragOver={() => setHoveredCategoryId(cat.id)}
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
                onReorder={handleReorderCategories}
                categories={categories}
                draggedCategoryId={draggedCategoryId}
                onDragStartCategory={(id) => setDraggedCategoryId(id)}
                onDragEndCategory={() => setDraggedCategoryId(null)}
                theme={theme}
              />
            ))}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 flex flex-col relative z-10 transition-colors duration-200 ${theme === 'dark' ? 'bg-[#121212]' : 'bg-[#fafafa]'}`}>
        <header className={`px-8 py-6 flex items-center justify-between sticky top-0 z-30 backdrop-blur-md transition-colors duration-200 ${theme === 'dark' ? 'bg-[#121212]/80' : 'bg-[#fafafa]/80'}`}>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{activeCategory === 'All projects' ? 'All projects' : categories.find(c => c.id === activeCategory)?.name || activeCategory}</h1>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={handleCreateProject}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20"
            >
              <Plus className="w-4 h-4" />
              Create
            </button>

            <div className={`flex items-center gap-1 p-1 rounded-2xl transition-colors duration-200 ${
              theme === 'dark' ? 'bg-[#2c2c2c]' : 'bg-[#f0f0f5]'
            }`}>
              <button 
                onClick={() => setViewMode('grid')}
                className={`px-4 py-1.5 rounded-xl text-[13px] font-semibold transition-all ${
                  viewMode === 'grid' 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : (theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700')
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setViewMode('list')}
                className={`px-4 py-1.5 rounded-xl text-[13px] font-semibold transition-all ${
                  viewMode === 'list' 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : (theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700')
                }`}
              >
                <LayoutList className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        <div className={`flex-1 overflow-y-auto px-8 pb-8 ${draggedProjectId ? 'overflow-visible' : 'overflow-x-visible'}`}>
          {isLoading ? (
            <div className={viewMode === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4' : 'flex flex-col gap-3'}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className={`animate-pulse bg-gray-100 rounded-xl ${viewMode === 'grid' ? 'aspect-[4/3]' : 'h-20'}`} />
              ))}
            </div>
          ) : (
            <div 
              className={viewMode === 'grid' 
                ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4' 
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
                  isOwner={!project.userId || user?.uid === project.userId}
                  theme={theme}
                />
              ))}
              {filteredProjects.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center py-20 text-gray-400">
                  <Folder className="w-12 h-12 mb-4 opacity-20" />
                  <p>No projects found</p>
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
                  <h2 className="text-xl font-bold">Create New Project</h2>
                  <button onClick={() => setShowCreateModal(false)} className="p-1 hover:bg-gray-100 rounded-full">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Project Name</label>
                    <input 
                      type="text" 
                      maxLength={100}
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      autoFocus
                      className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-indigo-500 focus:bg-white rounded-xl outline-none transition-all"
                      placeholder="e.g. Website Redesign"
                    />
                  </div>
                </div>
              </div>
              <div className="p-4 bg-gray-50 flex gap-3">
                <button 
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmCreateProject}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-lg shadow-indigo-500/20"
                >
                  Create Project
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
                <h2 className="text-xl font-bold mb-2">Delete Project?</h2>
                <p className="text-sm text-gray-500">
                  This action cannot be undone. All analysis data for this project will be permanently removed.
                </p>
              </div>
              <div className="p-4 bg-gray-50 flex gap-3">
                <button 
                  onClick={() => setIsDeletingId(null)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmDeleteProject}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors shadow-lg shadow-red-500/20"
                >
                  Delete
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
              <div className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]" />
              {toast.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Local dev mode: no auth/profile modals */}

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
  icon?: React.ReactNode,
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
  id?: string,
  onReorder?: (newOrder: string[]) => void,
  categories?: { id: string; name: string }[],
  draggedCategoryId?: string | null,
  onDragStartCategory?: (id: string) => void,
  onDragEndCategory?: () => void
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
  id,
  onReorder,
  categories,
  draggedCategoryId,
  onDragStartCategory,
  onDragEndCategory
}) => {
  const [isHovered, setIsHovered] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    if (id) {
      setIsDragging(true);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
      onDragStartCategory?.(id);
      console.log('Drag started for:', id);
    }
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    onDragEndCategory?.();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!isDragging) {
      onDragOver?.();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedId = e.dataTransfer.getData('text/plain');

    if (draggedId && id && draggedId !== id && onReorder && categories) {
      console.log('Dropped:', draggedId, 'onto:', id);

      const draggedIndex = categories.findIndex(c => c.id === draggedId);
      const targetIndex = categories.findIndex(c => c.id === id);

      if (draggedIndex !== -1 && targetIndex !== -1) {
        const newCategories = [...categories];
        const [removed] = newCategories.splice(draggedIndex, 1);
        newCategories.splice(targetIndex, 0, removed);

        console.log('New order:', newCategories.map(c => c.name));
        onReorder(newCategories.map(c => c.id));
      }
    }
    setIsDragging(false);
  };

  const isDropTarget = draggedCategoryId && draggedCategoryId !== id;

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      className="relative"
    >
      <div
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all cursor-pointer ${
          active
            ? (theme === 'dark' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-indigo-50 text-indigo-600')
            : (theme === 'dark' ? 'text-gray-400 hover:bg-white/5 hover:text-gray-200' : 'text-gray-600 hover:bg-gray-50')
        } ${isOver && isDropTarget ? (theme === 'dark' ? 'bg-indigo-500/30 ring-2 ring-indigo-500 ring-inset scale-[1.02]' : 'bg-indigo-100 ring-2 ring-indigo-400 ring-inset scale-[1.02]') : ''} ${isDragging ? 'opacity-50' : ''}`}
        draggable={!!id}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={onClick}
      >
        {(isHovered || isDragging) && id ? (
          <GripVertical className="w-4 h-4 text-gray-400 cursor-grab active:cursor-grabbing flex-shrink-0" />
        ) : (
          <span className="w-4 h-4 flex-shrink-0" />
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
      </div>
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
  const formattedDate = formatRelativeDate(project.updatedAt);

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
        <img 
          src={project.thumbnail} 
          alt={project.name} 
          className="w-full h-full object-cover object-center transition-opacity duration-300" 
          loading="lazy"
          onLoad={(e) => (e.currentTarget.style.opacity = '1')}
          style={{ opacity: 0 }}
        />
        {!isList && isOwner && (
          <>
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
            <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button 
                onClick={onStar} 
                onPointerDown={(e) => e.stopPropagation()}
                className={`p-2 backdrop-blur rounded-lg shadow-sm transition-colors ${theme === 'dark' ? 'bg-[#2c2c2c]/90 text-gray-400 hover:text-yellow-500' : 'bg-white/90 text-gray-400 hover:text-yellow-500'}`}
              >
                <Star className={`w-4 h-4 ${project.isStarred ? 'fill-yellow-400 text-yellow-400' : ''}`} />
              </button>
              <button 
                onClick={onDelete} 
                onPointerDown={(e) => e.stopPropagation()}
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
              {project.name}
              {isList && project.isStarred && <Star className="w-3 h-3 fill-yellow-400 text-yellow-400 shrink-0" />}
            </h3>
            <p className="text-xs text-gray-400 truncate">{formattedDate}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className={`flex -space-x-2 ${isList ? '' : 'hidden sm:flex'}`}>
            {project.members?.map((m, i) => (
              <div key={i} className={`${isList ? 'w-6 h-6' : 'w-7 h-7'} rounded-full border-2 overflow-hidden ${theme === 'dark' ? 'border-[#1e1e1e] bg-gray-800' : 'border-white bg-gray-200'}`}>
                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${m}`} alt="Member" />
              </div>
            ))}
          </div>
          
          {isList && isOwner && (
            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button 
                onClick={onStar} 
                onPointerDown={(e) => e.stopPropagation()}
                className="p-1 text-gray-400 hover:text-yellow-500"
              >
                <Star className={`w-4 h-4 ${project.isStarred ? 'fill-yellow-400 text-yellow-400' : ''}`} />
              </button>
              <button 
                onClick={onDelete} 
                onPointerDown={(e) => e.stopPropagation()}
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
