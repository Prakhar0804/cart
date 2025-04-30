import React from 'react';
import './UIComponents.css'; // Import CSS

export const CommandBar = ({ children, className = '' }) => (
  <div className={`ui-command-bar ${className}`}>
    {children}
  </div>
);

export const SearchInput = ({ className = '', ...props }) => (
  <input
    className={`ui-search-input ${className}`}
    {...props}
  />
);

export const ActionCard = ({ icon, title, description, onClick }) => (
  <button
    onClick={onClick}
    className="ui-action-card"
  >
    <div className="ui-action-card-content">
      <span className="ui-action-card-icon">{icon}</span>
      <div className="ui-action-card-text">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  </button>
);

export const LoadingSpinner = ({ size = 'md', className = '' }) => {
  const spinnerClasses = `ui-loading-spinner ${size} ${className}`;

  return (
    <div className={`ui-loading-spinner-wrapper ${className}`}>
      <div className={spinnerClasses}>
        <svg className="w-full h-full" viewBox="0 0 24 24">
          <circle 
            className="opacity-25" 
            cx="12" 
            cy="12" 
            r="10" 
            stroke="currentColor" 
            strokeWidth="4"
            fill="none"
          />
          <path 
            className="opacity-75" 
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      </div>
    </div>
  );
};