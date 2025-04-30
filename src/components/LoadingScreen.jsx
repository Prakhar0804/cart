import React from 'react';
import './LoadingScreen.css'; // Import CSS

export const LoadingScreen = ({ message = 'Loading...' }) => {
  return (
    <div className="loading-screen">
      <div className="loading-screen-spinner" />
      <p className="loading-screen-message">{message}</p>
    </div>
  );
};