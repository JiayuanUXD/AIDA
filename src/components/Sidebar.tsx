import React, { useState } from 'react';
import { Search, Clock, LayoutGrid, Trash2, Star, Plus, ChevronDown, Bell, GripVertical } from 'lucide-react';
import { cn } from '../lib/utils';

interface SidebarProps {
  categories: { id: string; name: string }[];
  activeCategory: string;
  onSelectCategory: (id: string) => void;
  onAddCategory: () => void;
  onReorderCategories: (newOrder: string[]) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  categories,
  activeCategory,
  onSelectCategory,
  onAddCategory,
  onReorderCategories,
}) => {
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  return (
    <div className="w-64 h-screen border-r border-gray-100 flex flex-col bg-white">
      {/* User Profile */}
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img
            src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix"
            alt="User"
            className="w-8 h-8 rounded-full bg-gray-100"
          />
          <span className="font-medium text-sm">刘家园</span>
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </div>
        <Bell className="w-5 h-5 text-gray-400 cursor-pointer hover:text-gray-600" />
      </div>

      {/* Search */}
      <div className="px-4 mb-6">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search"
            className="w-full bg-gray-100 border-none rounded-lg py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 space-y-1">
        <button
          onClick={() => onSelectCategory('recents')}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
            activeCategory === 'recents' ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:bg-gray-50"
          )}
        >
          <Clock className="w-4 h-4" />
          <span>Recents</span>
        </button>
        <button
          onClick={() => onSelectCategory('all')}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
            activeCategory === 'all' ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:bg-gray-50"
          )}
        >
          <LayoutGrid className="w-4 h-4" />
          <span>All projects</span>
        </button>
        <button
          onClick={() => onSelectCategory('trash')}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
            activeCategory === 'trash' ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:bg-gray-50"
          )}
        >
          <Trash2 className="w-4 h-4" />
          <span>Trash</span>
        </button>

        <div className="pt-4 pb-2 px-3">
          <div className="flex items-center justify-between text-xs font-semibold text-gray-400 uppercase tracking-wider">
            <div className="flex items-center gap-1">
              <ChevronDown className="w-3 h-3" />
              <span>Starred</span>
            </div>
            <Plus className="w-4 h-4 cursor-pointer hover:text-gray-600" onClick={onAddCategory} />
          </div>
        </div>

        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() => onSelectCategory(category.id)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
              activeCategory === category.id ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:bg-gray-50",
              draggedItem === category.id && "opacity-50"
            )}
            draggable
            onDragStart={() => setDraggedItem(category.id)}
            onDragEnd={() => setDraggedItem(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (draggedItem && draggedItem !== category.id) {
                const newOrder = categories
                  .filter(c => c.id !== draggedItem)
                  .flatMap(c => 
                    c.id === category.id 
                      ? [categories.find(c => c.id === draggedItem)!, c]
                      : [c]
                  );
                onReorderCategories(newOrder.map(c => c.id));
              }
            }}
          >
            <GripVertical className="w-4 h-4 text-gray-400 cursor-grab active:cursor-grabbing" />
            <span>{category.name}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};
