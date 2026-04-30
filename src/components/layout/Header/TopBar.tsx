import React, { useState } from 'react';
import { Menu, MessageCircle, Settings, Home, Search } from 'lucide-react';
import GlobalSearch from '../../common/Search/GlobalSearch';
import './Header.module.css';

interface TopBarProps {
  onMenuToggle: () => void;
  unreadMessages?: number;
  userAvatar?: string;
  userName?: string;
}

export const TopBar: React.FC<TopBarProps> = ({
  onMenuToggle,
  unreadMessages = 0,
  userAvatar,
  userName = 'User'
}) => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  return (
    <header className="topbar">
      <div className="topbar-container">
        {/* LEFT SECTION */}
        <div className="topbar-left">
          <button 
            className="topbar-icon topbar-menu-button"
            onClick={onMenuToggle}
            aria-label="Toggle menu"
          >
            <Menu size={24} />
          </button>

          <div className="topbar-avatar">
            <img 
              src={userAvatar || 'https://via.placeholder.com/40'} 
              alt={userName}
              className="avatar-image"
            />
          </div>
        </div>

        {/* CENTER SECTION */}
        <div className="topbar-center">
          <GlobalSearch 
            isOpen={isSearchOpen}
            onToggle={() => setIsSearchOpen(!isSearchOpen)}
          />
        </div>

        {/* RIGHT SECTION */}
        <div className="topbar-right">
          <button 
            className="topbar-icon topbar-chat-button"
            aria-label="Chat"
          >
            <div className="icon-badge-wrapper">
              <MessageCircle size={24} />
              {unreadMessages > 0 && (
                <span className="badge badge-error">
                  {unreadMessages > 99 ? '99+' : unreadMessages}
                </span>
              )}
            </div>
          </button>

          <button 
            className="topbar-icon"
            aria-label="Settings"
          >
            <Settings size={24} />
          </button>

          <button 
            className="topbar-icon"
            aria-label="Home"
          >
            <Home size={24} />
          </button>
        </div>
      </div>
    </header>
  );
};

export default TopBar;
