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
import { motion, AnimatePresence, Reorder } from 'motion/react';
import { db, auth, googleProvider, signInWithPopup } from '../firebase';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, updateDoc, setDoc, writeBatch } from 'firebase/firestore';
import { onAuthStateChanged, signOut, signInAnonymously } from 'firebase/auth';
import AuthModal from '../components/AuthModal';
import ProfileModal from '../components/ProfileModal';

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

export default function ProjectManagement({ theme, setTheme, resolvedTheme }: { theme: 'light' | 'dark' | 'system', setTheme: (theme: 'light' | 'dark' | 'system') => void, resolvedTheme: 'light' | 'dark' }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<{displayName?: string, role?: string}>({});
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
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);
  const [hoveredCategoryId, setHoveredCategoryId] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showThemeSubmenu, setShowThemeSubmenu] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, categoryId: string } | null>(null);

  // Use resolvedTheme for styling
  const isDark = resolvedTheme === 'dark';

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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const docRef = doc(db, 'users', u.uid);
          console.log("Fetching user profile for:", u.uid);
          const unsubscribeDoc = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
              setUserProfile(docSnap.data());
            }
          });
          return () => unsubscribeDoc();
        } catch (error) {
          console.error("Error fetching user profile:", error);
        }
      } else {
        setUserProfile({});
        // Auto-login anonymously
        signInAnonymously(auth).catch(err => console.error("Anon login failed", err));
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      // Fetch Projects - Filter by userId for privacy, but allow unowned projects to appear (if any)
      const qProjects = query(
        collection(db, 'projects'),
        where('userId', '==', user.uid),
        orderBy('updatedAt', 'desc')
      );
      const unsubscribeProjects = onSnapshot(qProjects, (snapshot) => {
        const projs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Project[];
        setProjects(projs);
        setIsLoading(false);
      }, (error) => {
        console.error("Error fetching projects:", error);
        setIsLoading(false);
      });

      // Fetch Categories
      const qCategories = query(
        collection(db, 'categories'),
        where('userId', '==', user.uid)
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
          const timeA = a.createdAt?.toMillis?.() ?? 0;
          const timeB = b.createdAt?.toMillis?.() ?? 0;
          return timeA - timeB;
        });
        setCategories(cats);
      }, (error) => {
        console.error("Error fetching categories:", error);
      });

      return () => {
        unsubscribeProjects();
        unsubscribeCategories();
      };
    }
  }, [user]);

  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (activeCategory === 'All projects') return matchesSearch && p.category !== 'Trash';
    if (activeCategory === 'Trash') return matchesSearch && p.category === 'Trash';
    if (activeCategory === 'Recents') return matchesSearch && p.category !== 'Trash';
    return matchesSearch && p.category === activeCategory;
  });

  const handleCreateProject = async () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    
    try {
      const projectsRef = collection(db, 'projects');
      const newProjectDoc = doc(projectsRef);
      const projectId = newProjectDoc.id;

      // Navigate immediately
      navigate(`/checker/${projectId}`);

      // Perform the write in the background
      await setDoc(newProjectDoc, {
        name: 'New Project',
        userId: user.uid,
        updatedAt: Date.now(),
        thumbnail: 'https://picsum.photos/seed/' + Math.random() + '/400/300',
        isStarred: false,
        category: 'All projects',
        members: [user.uid]
      });
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
      await updateDoc(doc(db, 'projects', idToTrash), { category: 'Trash' });
    } catch (error) {
      console.error("Error moving project to trash:", error);
    }
  };

  const toggleStar = async (id: string, current: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await updateDoc(doc(db, 'projects', id), {
        isStarred: !current
      });
    } catch (error) {
      console.error("Error starring project:", error);
    }
  };

  const handleCreateCategory = async () => {
    if (!user) return;
    try {
      const docRef = await addDoc(collection(db, 'categories'), {
        name: 'New Category',
        userId: user.uid,
        createdAt: serverTimestamp(),
        order: categories.length
      });
      setEditingCategoryId(docRef.id);
      setEditCategoryName('New Category');
    } catch (error) {
      console.error("Error creating category:", error);
    }
  };

  const handleReorderCategories = async (newOrder: Category[]) => {
    // Optimistic update
    setCategories(newOrder);
    
    try {
      const batch = writeBatch(db);
      newOrder.forEach((cat, index) => {
        const catRef = doc(db, 'categories', cat.id);
        batch.update(catRef, { order: index });
      });
      await batch.commit();
    } catch (error) {
      console.error("Error reordering categories:", error);
      addToast("Failed to reorder categories");
    }
  };

  const handleSaveCategory = async (id: string) => {
    if (!editCategoryName.trim()) return;
    try {
      await updateDoc(doc(db, 'categories', id), {
        name: editCategoryName
      });
      setEditingCategoryId(null);
    } catch (error) {
      console.error("Error saving category:", error);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'categories', id));
      if (activeCategory === id) {
        setActiveCategory('All projects');
      }
      addToast("Category deleted");
    } catch (error) {
      console.error("Error deleting category:", error);
      addToast("Failed to delete category");
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
      const catName = hoveredCategoryId === 'Recents' ? 'Recents' : 
                      hoveredCategoryId === 'All projects' ? 'All projects' :
                      categories.find(c => c.id === hoveredCategoryId)?.name || 'Category';
      
      // Interaction-first: Show toast immediately
      addToast(`Moved project to ${catName}`);

      // Update Firestore in the background
      updateDoc(doc(db, 'projects', draggedProjectId), {
        category: hoveredCategoryId
      }).catch(error => {
        console.error("Error updating project category:", error);
        addToast("Failed to move project");
      });
    }
    setDraggedProjectId(null);
    setHoveredCategoryId(null);
  };

  return (
    <div className={`flex h-screen transition-colors duration-200 font-sans ${isDark ? 'bg-[#121212] text-[#e0e0e0]' : 'bg-[#fafafa] text-[#1a1a1a]'}`}>
      {/* Sidebar */}
      <aside className={`min-w-[16rem] w-fit max-w-xs border-r flex flex-col p-4 relative z-50 transition-colors duration-200 ${isDark ? 'bg-[#1e1e1e] border-[#383838]' : 'bg-white border-gray-200'}`}>
        <div className="flex items-center justify-between mb-8 relative">
          <div 
            className={`user-profile-trigger flex items-center gap-2 cursor-pointer p-1.5 -ml-1.5 rounded-xl transition-colors min-w-0 ${isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50'}`}
            onClick={() => setShowUserDropdown(!showUserDropdown)}
          >
            <div className={`w-8 h-8 rounded-full overflow-hidden shrink-0 ${user?.isAnonymous ? 'bg-amber-100 text-amber-600' : 'bg-gray-200'}`}>
              {user?.photoURL ? (
                <img src={user.photoURL} alt="User" className="w-full h-full object-cover" />
              ) : (
                <div className={`w-full h-full flex items-center justify-center ${user?.isAnonymous ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600'}`}>
                  <UserIcon className="w-4 h-4" />
                </div>
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-medium text-sm whitespace-nowrap">
                {user?.isAnonymous ? 'Guest' : (userProfile.displayName || user?.displayName || 'User')}
              </span>
              {user?.isAnonymous ? (
                <span className="text-[10px] text-amber-600 font-bold uppercase tracking-tighter">Temporary</span>
              ) : userProfile.role ? (
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  {userProfile.role}
                </span>
              ) : null}
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
                        <div className={`w-full h-full flex items-center justify-center ${user?.isAnonymous ? 'bg-amber-500/20 text-amber-400' : 'bg-indigo-500/20 text-indigo-400'}`}>
                          <UserIcon className="w-8 h-8" />
                        </div>
                      )}
                    </div>
                  </div>
                  <h3 className="font-bold text-base mb-0.5">
                    {user?.isAnonymous ? 'Guest User' : (userProfile.displayName || user?.displayName || 'User')}
                  </h3>
                  <p className="text-xs text-gray-500 truncate w-full px-4">
                    {user?.isAnonymous ? 'Logged in as guest. Sign in to save across devices.' : (user?.email || 'No email provided')}
                  </p>
                </div>

                {/* Menu Items */}
                <div className="p-1.5 space-y-0.5">
                  {!user ? (
                    <button 
                      onClick={() => {
                        signInWithPopup(auth, googleProvider);
                        setShowUserDropdown(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-indigo-500/10 text-indigo-400 transition-colors"
                    >
                      <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                        <LogIn className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-medium text-sm">登录 / 注册</span>
                    </button>
                  ) : (
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
                        onClick={() => {
                          signOut(auth);
                          setShowUserDropdown(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-red-500/10 text-gray-300 hover:text-red-400 transition-colors"
                      >
                        <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center">
                          <LogOut className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-medium text-sm">退出登录</span>
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-gray-400 cursor-pointer" />
          </div>
        </div>

        <div className="relative mb-6">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
          <input 
            type="text" 
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-10 pr-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors ${isDark ? 'bg-white/5 text-white placeholder-gray-500' : 'bg-white border border-gray-200 text-gray-900 placeholder-gray-400'}`}
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
            theme={resolvedTheme}
          />
          <NavItem 
            icon={<Grid className="w-4 h-4" />} 
            label="All projects" 
            active={activeCategory === 'All projects'} 
            onClick={() => setActiveCategory('All projects')} 
            onDragOver={() => setHoveredCategoryId('All projects')}
            onDragLeave={() => setHoveredCategoryId(null)}
            isOver={hoveredCategoryId === 'All projects'}
            theme={resolvedTheme}
          />
          <NavItem 
            icon={<Trash2 className="w-4 h-4" />} 
            label="Trash" 
            active={activeCategory === 'Trash'} 
            onClick={() => setActiveCategory('Trash')} 
            onDragOver={() => setHoveredCategoryId('Trash')}
            onDragLeave={() => setHoveredCategoryId(null)}
            isOver={hoveredCategoryId === 'Trash'}
            theme={resolvedTheme}
          />
        </nav>

        <div>
          <div className="flex items-center justify-between px-2 mb-2">
            <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Starred</span>
            <Plus className={`w-4 h-4 cursor-pointer transition-colors ${isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`} onClick={handleCreateCategory} />
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
                  theme={resolvedTheme}
                  showHandle
                />
              </Reorder.Item>
            ))}
          </Reorder.Group>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 flex flex-col relative z-10 transition-colors duration-200 ${isDark ? 'bg-[#121212]' : 'bg-[#fafafa]'}`}>
        <header className={`px-8 py-6 flex items-center justify-between sticky top-0 z-30 backdrop-blur-md transition-colors duration-200 ${isDark ? 'bg-[#121212]/80' : 'bg-[#fafafa]/80'}`}>
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
              isDark ? 'bg-[#2c2c2c]' : 'bg-[#f0f0f5]'
            }`}>
              <button 
                onClick={() => setViewMode('grid')}
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
                className={`px-4 py-1.5 rounded-xl text-[13px] font-semibold transition-all ${
                  viewMode === 'list' 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : (isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700')
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

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
      <ProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} />

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
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
          active 
            ? (theme === 'dark' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-indigo-50 text-indigo-600') 
            : (theme === 'dark' ? 'text-gray-400 hover:bg-white/5 hover:text-gray-200' : 'text-gray-600 hover:bg-gray-50')
        } ${isOver ? (theme === 'dark' ? 'bg-indigo-500/30 ring-2 ring-indigo-500 ring-inset scale-[1.02]' : 'bg-indigo-100 ring-2 ring-indigo-400 ring-inset scale-[1.02]') : ''}`}
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
