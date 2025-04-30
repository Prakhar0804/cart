import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './NavigationBar.css';

export const NavigationBar = () => {
  const location = useLocation();
  const { currentUser } = useAuth();
  
  const links = [
    { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/inventory', label: 'Inventory', icon: '📦' },
    { path: '/transactions', label: 'Transactions', icon: '💳' },
    { path: '/carts', label: 'Carts', icon: '🛒' },
    { path: '/settings', label: 'Settings', icon: '⚙️' },
  ];

  if (!currentUser) return null;

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-links">
          {links.map(({ path, label, icon }) => {
            const isActive = location.pathname === path || (path !== '/dashboard' && location.pathname.startsWith(path));
            const linkClasses = `navbar-link ${isActive ? 'navbar-link-active' : ''}`;

            return (
              <Link
                key={path}
                to={path}
                className={linkClasses}
              >
                <span className="navbar-icon">{icon}</span>
                <span className="navbar-label">{label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
