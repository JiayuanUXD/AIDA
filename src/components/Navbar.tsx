import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, CheckSquare, FolderKanban, Wrench, Home } from 'lucide-react';
import { cn } from '../lib/utils';

export const Navbar: React.FC = () => {
  const navItems = [
    { to: '/', icon: Home, label: 'Home' },
    { to: '/checker', icon: CheckSquare, label: 'DesignChecker' },
  ];

  return (
    <nav className="fixed bottom-6 left-6 z-[100] bg-white/80 dark:bg-black/80 backdrop-blur-md border border-gray-200 dark:border-white/10 rounded-full px-4 py-2 shadow-2xl flex items-center gap-2">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
              isActive
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5"
            )
          }
        >
          <item.icon className="w-4 h-4" />
          <span className="hidden sm:inline">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
};
