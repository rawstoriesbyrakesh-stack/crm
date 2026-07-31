import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Image as ImageIcon, 
  Link as LinkIcon, 
  LogOut,
  Menu,
  X,
  Settings,
  Droplet,
  Trash2,
  FolderHeart
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Gallery', path: '/gallery', icon: ImageIcon },
    { name: 'Shared Links', path: '/shared-links', icon: LinkIcon },
    { name: 'Watermarks', path: '/watermarks', icon: Droplet },
    { name: 'Smart Collections', path: '/smart-collections', icon: FolderHeart },
    { name: 'Trash', path: '/trash', icon: Trash2 },
  ];

  const handleLogout = () => {
    localStorage.removeItem('rawStoriesToken');
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-slate-900 flex overflow-hidden font-sans selection:bg-primary-500/30">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.div
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-slate-900/80 backdrop-blur-xl border-r border-slate-700/50 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-full flex flex-col relative overflow-hidden">
          {/* Subtle glow effect */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-primary-500/10 rounded-full blur-[80px] pointer-events-none" />

          {/* Logo Area */}
          <div className="p-8 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center shadow-lg shadow-primary-500/20 overflow-hidden">
                <img src="/images/rawstories-logo.png" alt="RawStoriesbyrakesh logo" className="w-full h-full object-contain" />
              </div>
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                RawStoriesbyrakesh
              </h1>
            </div>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="p-2 rounded-lg text-slate-400 hover:bg-slate-800/50 lg:hidden"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 px-4 py-4 space-y-2">
            {navItems.map((item) => {
              const isActive = location.pathname.startsWith(item.path);
              const Icon = item.icon;

              return (
                <button
                  key={item.path}
                  onClick={() => {
                    navigate(item.path);
                    setIsSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-300 group relative overflow-hidden ${
                    isActive 
                      ? 'bg-primary-500/10 text-primary-400 font-medium border border-primary-500/20 shadow-[0_0_20px_rgba(var(--color-primary-500),0.1)]' 
                      : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {isActive && (
                    <motion.div 
                      layoutId="activeTab"
                      className="absolute inset-0 bg-gradient-to-r from-primary-500/10 to-transparent opacity-50"
                      initial={false}
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    />
                  )}
                  <div className="relative z-10 flex items-center gap-4">
                    <Icon className={`w-5 h-5 transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
                    <span className="text-[15px]">{item.name}</span>
                  </div>
                </button>
              );
            })}
          </nav>

          {/* Bottom Area */}
          <div className="p-4 border-t border-slate-700/50">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-4 px-4 py-3.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-2xl transition-all duration-300"
            >
              <LogOut className="w-5 h-5" />
              <span className="text-[15px] font-medium">Log out</span>
            </button>
          </div>
        </div>
      </motion.div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden bg-slate-900">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between p-4 bg-slate-900/80 backdrop-blur-lg border-b border-slate-700/50 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center overflow-hidden">
              <img src="/images/rawstories-logo.png" alt="RawStoriesbyrakesh logo" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-lg font-bold text-white">RawStoriesbyrakesh</h1>
          </div>
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 rounded-lg bg-slate-800/50 text-slate-300 border border-slate-700/50"
          >
            <Menu className="w-5 h-5" />
          </button>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto relative scroll-smooth">
          {/* Subtle global background effects */}
          <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-primary-600/5 rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-secondary-600/5 rounded-full blur-[100px] pointer-events-none" />
          
          <div className="relative z-10 h-full w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
