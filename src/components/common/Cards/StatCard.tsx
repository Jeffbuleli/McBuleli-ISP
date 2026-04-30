import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import './Card.module.css';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative';
  icon?: React.ReactNode;
  badge?: string;
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  change,
  changeType = 'positive',
  icon,
  badge,
  onClick
}) => {
  return (
    <div className="stat-card" onClick={onClick}>
      <div className="stat-header">
        <h3>{title}</h3>
        {badge && <span className="stat-badge">{badge}</span>}
      </div>

      <div className="stat-content">
        <div className="stat-value">{value}</div>
        {icon && <div className="stat-icon">{icon}</div>}
      </div>

      {change && (
        <div className={`stat-footer change-${changeType}`}>
          {changeType === 'positive' ? (
            <TrendingUp size={16} />
          ) : (
            <TrendingDown size={16} />
          )}
          <span>{change}</span>
        </div>
      )}
    </div>
  );
};

export default StatCard;
