import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const adminNav = [
  { label: 'Overview', items: [
    { to: '/admin/dashboard', icon: '◉', label: 'Dashboard' },
    { to: '/admin/payments', icon: '⇄', label: 'Payments' },
  ]},
  { label: 'Management', items: [
    { to: '/admin/agents', icon: '⬡', label: 'Agents' },
    { to: '/admin/merchants', icon: '◈', label: 'Merchants' },
    { to: '/admin/settlements', icon: '◎', label: 'Settlements' },
  ]},
];

const merchantNav = [
  { label: 'Overview', items: [
    { to: '/merchant/dashboard', icon: '◉', label: 'Dashboard' },
    { to: '/merchant/payments', icon: '⇄', label: 'Transactions' },
    { to: '/merchant/ledger', icon: '▤', label: 'Ledger' },
    { to: '/merchant/settlements', icon: '◎', label: 'Settlements' },
  ]},
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const nav = user?.role === 'superadmin' ? adminNav : merchantNav;

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-icon">⚡</div>
        <div>
          <div className="logo-text">PayGateway</div>
          <div className="logo-sub">{user?.role === 'superadmin' ? 'Super Admin' : 'Merchant Portal'}</div>
        </div>
      </div>
      <nav className="sidebar-nav">
        {nav.map(section => (
          <div key={section.label} style={{ marginBottom: 8 }}>
            <div className="nav-section-label">{section.label}</div>
            {section.items.map(item => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <span className="icon">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="user-chip">
          <div className="user-avatar">{user?.name?.[0]?.toUpperCase()}</div>
          <div>
            <div className="user-name">{user?.name}</div>
            <div className="user-role">{user?.role === 'superadmin' ? 'Super Admin' : user?.merchant?.merchant_name || 'Merchant'}</div>
          </div>
          <button className="logout-btn" onClick={handleLogout} title="Logout">⏻</button>
        </div>
      </div>
    </div>
  );
}
