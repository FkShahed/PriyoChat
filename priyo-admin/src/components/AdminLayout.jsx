import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../context/AuthContext';
import './AdminLayout.css';

const navItems = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/users', label: 'Users', icon: '👥' },
  { path: '/reports', label: 'Reports', icon: '🚩' },
  { path: '/bug-reports', label: 'Bug Reports', icon: '🐞' },
  { path: '/broadcast', label: 'Broadcast', icon: '📢' },
  { path: '/audit-logs', label: 'Audit Logs', icon: '📋' },
];

export default function AdminLayout({ children }) {
  const { admin, logout } = useAdminAuth();
  const location = useLocation();

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="logo-icon">💬</span>
          <span className="logo-text">PriyoChat</span>
          <span className="logo-badge">Admin</span>
        </div>
        <nav className="nav">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="admin-name">{admin?.name}</span>
          <button className="logout-btn" onClick={logout}>Logout</button>
        </div>
      </aside>
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
