import React from 'react';
import { Outlet } from 'react-router-dom';
import { NavigationBar } from './NavigationBar';
import './AuthenticatedLayout.css'; // Import CSS

const AuthenticatedLayout = () => {
  return (
    <div className="auth-layout">
      <NavigationBar />
      <main className="auth-layout-main">
        <Outlet />
      </main>
    </div>
  );
};

export default AuthenticatedLayout;
