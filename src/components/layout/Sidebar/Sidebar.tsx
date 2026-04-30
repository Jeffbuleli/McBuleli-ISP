import React, { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Network,
  DollarSign,
  BarChart3,
  MessageSquare,
  MessageCircle,
  Settings,
  LogOut,
  X
} from 'lucide-react';
import MenuItem from './MenuItem';
import './Sidebar.module.css';

interface MenuItemConfig {
  id: string;
  label: string;
  icon: React.ReactNode;
  children?: MenuItemConfig[];
  badge?: number;
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onMenuSelect?: (menuId: string) => void;
  userInfo?: {
    name: string;
    role: string;
    company: string;
    logo?: string;
  };
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  onMenuSelect,
  userInfo = {
    name: 'John Doe',
    role: 'Administrator',
    company: 'McBuleli ISP',
    logo: 'https://via.placeholder.com/48'
  }
}) => {
  const [expandedItems, setExpandedItems] = useState<string[]>(['dashboard']);

  const menuItems: MenuItemConfig[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <LayoutDashboard size={20} />,
    },
    {
      id: 'user-management',
      label: 'User Management',
      icon: <Users size={20} />,
      children: [
        { id: 'users', label: 'Users', icon: <Users size={16} /> },
        { id: 'active-users', label: 'Active Users', icon: <Users size={16} />, badge: 42 },
        { id: 'ip-bindings', label: 'IP Bindings', icon: <Network size={16} /> },
        { id: 'expiry-dates', label: 'Expiry Dates', icon: <Users size={16} />, badge: 8 },
      ]
    },
    {
      id: 'network',
      label: 'Network',
      icon: <Network size={20} />,
      children: [
        { id: 'devices', label: 'MikroTik Devices', icon: <Network size={16} />, badge: 5 },
        { id: 'equipment', label: 'Equipment', icon: <Network size={16} /> },
      ]
    },
    {
      id: 'finance',
      label: 'Finance',
      icon: <DollarSign size={20} />,
      children: [
        { id: 'packages', label: 'Packages', icon: <DollarSign size={16} /> },
        { id: 'vouchers', label: 'Vouchers', icon: <DollarSign size={16} /> },
        { id: 'invoices', label: 'Invoices', icon: <DollarSign size={16} />, badge: 3 },
        { id: 'payments', label: 'Payments', icon: <DollarSign size={16} /> },
        { id: 'expenses', label: 'Expenses', icon: <DollarSign size={16} /> },
      ]
    },
    {
      id: 'reports',
      label: 'Reports & Analytics',
      icon: <BarChart3 size={20} />,
    },
    {
      id: 'communication',
      label: 'Communication',
      icon: <MessageSquare size={20} />,
      children: [
        { id: 'sms', label: 'SMS', icon: <MessageSquare size={16} /> },
        { id: 'email', label: 'Email', icon: <MessageSquare size={16} /> },
        { id: 'whatsapp', label: 'WhatsApp', icon: <MessageSquare size={16} /> },
        { id: 'history', label: 'History', icon: <MessageSquare size={16} /> },
      ]
    },
    {
      id: 'team-chat',
      label: 'Team Chat',
      icon: <MessageCircle size={20} />,
      badge: 5,
    },
  ];

  const toggleExpand = (itemId: string) => {
    setExpandedItems(prev =>
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  return (
    <>
      {isOpen && <div className="sidebar-overlay" onClick={onClose} />}

      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        {/* Header Block */}
        <div className="sidebar-header">
          <button className="sidebar-close" onClick={onClose}>
            <X size={24} />
          </button>

          <div className="company-info">
            <img 
              src={userInfo.logo} 
              alt={userInfo.company}
              className="company-logo"
            />
            <div className="company-details">
              <h3>{userInfo.company}</h3>
              <p className="user-name">{userInfo.name}</p>
              <p className="user-role">{userInfo.role}</p>
            </div>
          </div>
        </div>

        {/* Menu Items */}
        <nav className="sidebar-menu">
          {menuItems.map(item => (
            <MenuItem
              key={item.id}
              item={item}
              isExpanded={expandedItems.includes(item.id)}
              onToggleExpand={() => toggleExpand(item.id)}
              onSelect={(itemId) => {
                onMenuSelect?.(itemId);
                if (!item.children?.length) {
                  onClose();
                }
              }}
            />
          ))}
        </nav>

        {/* Settings & Logout */}
        <div className="sidebar-footer">
          <MenuItem
            item={{ id: 'settings', label: 'Settings', icon: <Settings size={20} /> }}
            isExpanded={false}
            onToggleExpand={() => {}}
            onSelect={() => {
              onMenuSelect?.('settings');
              onClose();
            }}
          />

          <button className="logout-button">
            <LogOut size={20} />
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
