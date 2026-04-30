import React, { useState } from 'react';
import TopBar from './Header/TopBar';
import AnnouncementBanner, { AnnouncementSlide } from './Header/AnnouncementBanner';
import Sidebar from './Sidebar/Sidebar';
import './MainLayout.css';

interface MainLayoutProps {
  children: React.ReactNode;
  currentMenu?: string;
  onMenuSelect?: (menuId: string) => void;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
  children,
  onMenuSelect
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const announcementSlides: AnnouncementSlide[] = [
    {
      id: '1',
      type: 'text',
      content: '🎉 New feature: Advanced Analytics Dashboard now available!',
      link: '#analytics'
    },
    {
      id: '2',
      type: 'text',
      content: '📢 System maintenance scheduled for tonight at 02:00 UTC',
    }
  ];

  return (
    <div className="main-layout">
      <TopBar
        onMenuToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        unreadMessages={5}
        userName="John Doe"
      />

      <AnnouncementBanner
        slides={announcementSlides}
        dismissible={true}
      />

      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onMenuSelect={onMenuSelect}
        userInfo={{
          name: 'John Doe',
          role: 'Administrator',
          company: 'McBuleli ISP',
        }}
      />

      <main className="main-content">
        {children}
      </main>
    </div>
  );
};

export default MainLayout;
