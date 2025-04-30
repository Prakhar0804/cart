import React from 'react';
import './StatCard.css';

export const StatCard = ({ title, value, change, icon }) => {
  const isPositive = change > 0;
  const changeColorClass = isPositive ? 'stat-card-change-positive' : 'stat-card-change-negative';

  return (
    <div className="stat-card">
      <div className="stat-card-content">
        <div className="stat-card-info">
          <p className="stat-card-title">{title}</p>
          <p className="stat-card-value">{value}</p>
        </div>
        <div className="stat-card-icon">{icon}</div>
      </div>
      
      {change !== undefined && change !== null && (
        <div className={`stat-card-change ${changeColorClass}`}>
          {isPositive ? '↑' : '↓'} {Math.abs(change)}%
        </div>
      )}
    </div>
  );
};
