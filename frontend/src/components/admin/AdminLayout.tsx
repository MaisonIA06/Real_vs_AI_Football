import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Image,
  FolderOpen,
  Home,
  LogOut,
} from 'lucide-react';
import { adminApi } from '../../services/api';

interface AdminLayoutProps {
  children: ReactNode;
}

const navItems = [
  { path: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/admin/categories', icon: FolderOpen, label: 'Catégories' },
  { path: '/admin/pairs', icon: Image, label: 'Paires de médias' },
];

export default function AdminLayout({ children }: AdminLayoutProps) {
  const location = useLocation();

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-dark-900 border-r border-dark-700 flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-dark-700">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
              <span className="font-display font-bold text-white">R</span>
            </div>
            <div>
              <div className="font-display font-bold">Real vs AI</div>
              <div className="text-xs text-dark-400">Administration</div>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive
                    ? 'bg-primary-500/20 text-primary-400'
                    : 'text-dark-400 hover:bg-dark-800 hover:text-white'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-dark-700 space-y-2">
          <Link
            to="/"
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-dark-400 hover:bg-dark-800 hover:text-white transition-all"
          >
            <Home className="w-5 h-5" />
            <span className="font-medium">Retour au jeu</span>
          </Link>
          <button
            onClick={() => {
              adminApi.logout();
              window.location.href = '/admin';
            }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-dark-400 hover:bg-dark-800 hover:text-white transition-all"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Se déconnecter</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
