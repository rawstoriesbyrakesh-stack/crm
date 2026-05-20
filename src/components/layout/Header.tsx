import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, User, LogOut } from 'lucide-react';
import { clearRawStoriesSession } from '../../api/rawStoriesBackend';

interface HeaderProps {
  title: string;
  sidebarCollapsed: boolean;
}

function Header({ title, sidebarCollapsed }: HeaderProps) {
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const handleLogout = async () => {
    clearRawStoriesSession();
    navigate('/login');
    setShowProfileMenu(false); // Close profile menu after logout
  };

  return (
    <header
      className="fixed top-0 right-0 bg-white shadow-sm border-b border-gray-200 z-40 transition-all duration-300 ease-in-out"
      style={{
        left: sidebarCollapsed ? '64px' : '256px'
      }}
    >
      <div className="flex items-center justify-between h-16 px-6">
        <div className="flex items-center">
          <h1 className="text-2xl font-bold text-[#2D2D2D]">{title}</h1>
        </div>

        <div className="flex items-center space-x-4">
          {/* Notifications */}
          {/* <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative text-gray-500 hover:text-[#00BCEB] transition-colors"
            >
              <Bell className="h-6 w-6" />
              <span className="absolute -top-1 -right-1 h-3 w-3 bg-[#FF6B00] rounded-full"></span>
            </button>
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-[#2D2D2D]">Notifications</h3>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex items-start space-x-3">
                    <div className="w-2 h-2 bg-[#FF6B00] rounded-full mt-2"></div>
                    <div>
                      <p className="text-sm text-[#2D2D2D]">New lead: Sarah Johnson</p>
                      <p className="text-xs text-gray-500">2 minutes ago</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="w-2 h-2 bg-[#00BCEB] rounded-full mt-2"></div>
                    <div>
                      <p className="text-sm text-[#2D2D2D]">Payment received: ₹25,000</p>
                      <p className="text-xs text-gray-500">1 hour ago</p>
                    </div>
                  </div>
                </div>
              </div> */}
            {/* )}
          </div> */}

          {/* Profile Menu */}
          <div className="relative">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center space-x-2 text-gray-500 hover:text-[#00BCEB] transition-colors"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-[#00BCEB] to-[#00A5CF] rounded-full flex items-center justify-center">
                <User className="h-4 w-4 text-white" />
              </div>
            </button>
            {showProfileMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                <div className="p-2">
                  <a
                    href="/profile"
                    className="block px-4 py-2 text-sm text-[#2D2D2D] hover:bg-gray-100 rounded"
                  >
                    Profile
                  </a>
                  {/* <a
                    href="/settings"
                    className="block px-4 py-2 text-sm text-[#2D2D2D] hover:bg-gray-100 rounded"
                  >
                    Settings
                  </a> */}
                  <hr className="my-2" />
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded flex items-center"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;