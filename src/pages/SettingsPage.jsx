import React from 'react';
import './SettingsPage.css'; // Import CSS for styling

const SettingsPage = () => {
  return (
    <div className="settings-page">
      <h2>Store Settings</h2>
      <div className="settings-card">
        <p>This page will contain settings related to the store.</p>
        <ul>
          <li>Store Name & Details</li>
          <li>Operating Hours</li>
          <li>Staff Management (Future)</li>
          <li>Notification Preferences</li>
        </ul>
        {/* Placeholder for future settings sections */}
      </div>
    </div>
  );
};

export default SettingsPage; 