import React from 'react';
import { ChevronDown } from 'lucide-react';
import './Sidebar.module.css';

interface MenuItemConfig {
  id: string;
  label: string;
  icon: React.ReactNode;
  children?: MenuItemConfig[];
  badge?: number;
}

interface MenuItemProps {
  item: MenuItemConfig;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSelect: (itemId: string) => void;
  level?: number;
}

const MenuItem: React.FC<MenuItemProps> = ({
  item,
  isExpanded,
  onToggleExpand,
  onSelect,
  level = 0
}) => {
  const hasChildren = item.children && item.children.length > 0;

  return (
    <div className={`menu-item-wrapper level-${level}`}>
      <button
        className={`menu-item ${isExpanded ? 'expanded' : ''}`}
        onClick={() => {
          if (hasChildren) {
            onToggleExpand();
          } else {
            onSelect(item.id);
          }
        }}
      >
        <span className="menu-icon">{item.icon}</span>
        <span className="menu-label">{item.label}</span>

        {item.badge ? (
          <span className="menu-badge">{item.badge}</span>
        ) : null}

        {hasChildren && (
          <ChevronDown 
            size={16} 
            className={`menu-chevron ${isExpanded ? 'rotated' : ''}`}
          />
        )}
      </button>

      {hasChildren && isExpanded && (
        <div className="submenu">
          {item.children!.map(child => (
            <MenuItem
              key={child.id}
              item={child}
              isExpanded={false}
              onToggleExpand={() => {}}
              onSelect={onSelect}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default MenuItem;
