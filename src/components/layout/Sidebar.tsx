import React from 'react';
import { useLocation } from 'react-router-dom';
import { 
  Camera, 
  Users, 
  Calendar, 
 
  TrendingUp, 
  DollarSign, 
  FileText, 
  ChevronLeft, 
  ChevronRight, 
  BarChart3,
  Eye,
  UserCheck,
  Activity
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation();

  const sidebarItems = [
    { name: 'Dashboard', icon: TrendingUp, path: '/dashboard' },
    { name: 'Leads', icon: Users, path: '/leads' },
    { name: 'Projects', icon: Camera, path: '/projects' },
    { name: 'Calendar', icon: Calendar, path: '/calendar' },
    { name: 'Gallery', icon: Eye, path: '/gallery' },
    // { name: 'Clients', icon: UserCheck, path: '/clients' },
    { name: 'Proposals', icon: FileText, path: '/proposals' },
    // { name: 'Finance', icon: DollarSign, path: '/finance' },
    { name: 'Team', icon: Users, path: '/team' },
    { name: 'Invoice ', icon: BarChart3, path: '/analytics' },
    { name: 'QR Generator', icon: Activity, path: '/activity-logs' },
    // { name: 'Settings', icon: Settings, path: '/settings' },
  ];

  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return location.pathname === '/' || location.pathname === '/dashboard';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className={`fixed inset-y-0 left-0 z-50 bg-white shadow-lg transition-all duration-300 ease-in-out ${
      collapsed ? 'w-16' : 'w-64'
    }`}>
      {/* Sidebar Header */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
        {!collapsed && (
          <div className="flex items-center">
            <div className="inline-flex items-center justify-center w-8 h-8 bg-gradient-to-br from-[#00BCEB] to-[#00A5CF] rounded-full">
              <span className="text-white font-bold text-sm">A</span>
            </div>
            <span className="ml-3 text-xl font-bold text-[#00BCEB]">Arif CRM</span>
          </div>
        )}
        {collapsed && (
          <div className="flex items-center justify-center w-full">
            <div className="inline-flex items-center justify-center w-8 h-8 bg-gradient-to-br from-[#00BCEB] to-[#00A5CF] rounded-full">
              <span className="text-white font-bold text-sm">A</span>
            </div>
          </div>
        )}
        <button
          onClick={onToggle}
          className="text-gray-500 hover:text-[#00BCEB] transition-colors duration-200"
        >
          {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
        </button>
      </div>
      
      {/* Navigation */}
      <nav className="mt-6 px-2">
        {sidebarItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          
          return (
            <div key={item.name} className="relative group">
              <a
                href={item.path}
                className={`flex items-center px-3 py-3 mb-1 text-sm font-medium rounded-lg transition-colors duration-200 ${
                  active
                    ? 'bg-[#00BCEB] text-white'
                    : 'text-[#2D2D2D] hover:bg-[#00BCEB]/10 hover:text-[#00BCEB]'
                } ${collapsed ? 'justify-center' : ''}`}
              >
                <Icon className={`h-5 w-5 ${collapsed ? '' : 'mr-3'}`} />
                {!collapsed && item.name}
              </a>
              
              {/* Tooltip for collapsed sidebar */}
              {collapsed && (
                <div className="absolute left-full top-1/2 transform -translate-y-1/2 ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                  {item.name}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}

export default Sidebar;