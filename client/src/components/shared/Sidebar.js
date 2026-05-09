import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const adminNav = [
  {
    label: "Overview",
    items: [
      { to: "/admin/dashboard", icon: "◉", label: "Dashboard" },
      { to: "/admin/payments", icon: "⇄", label: "Payments" },
    ],
  },
  {
    label: "Management",
    items: [
      { to: "/admin/agents", icon: "⬡", label: "Agents" },
      { to: "/admin/merchants", icon: "◈", label: "Merchants" },
      { to: "/admin/settlements", icon: "◎", label: "Settlements" },
    ],
  },
];

const merchantNav = [
  {
    label: "Overview",
    items: [
      { to: "/merchant/dashboard", icon: "◉", label: "Dashboard" },
      { to: "/merchant/payments", icon: "⇄", label: "Transactions" },
      { to: "/merchant/ledger", icon: "▤", label: "Ledger" },
      { to: "/merchant/settlements", icon: "◎", label: "Settlements" },
      { to: '/merchant/api-docs', label: 'API Docs', icon: FileText }
    ],
  },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const nav = user?.role === "superadmin" ? adminNav : merchantNav;
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => { logout(); navigate("/login"); };
  const handleNavClick = () => setMobileOpen(false);

  return (
    <>
      {/* Mobile Top Bar */}
      <div style={{
        display: 'none',
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
        background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)',
        padding: '12px 16px', alignItems: 'center', justifyContent: 'space-between',
      }} className="mobile-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/apple-touch-icon.png" alt="SSPay" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'contain' }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>SSPay Gateway</div>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          style={{ background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: 22, cursor: 'pointer', padding: 4 }}
        >
          {mobileOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            display: 'none', position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.6)', zIndex: 150,
          }}
          className="mobile-overlay"
        />
      )}

      {/* Sidebar */}
      <div className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-logo">
          <img src="/apple-touch-icon.png" alt="SSPay" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'contain' }} />
          <div>
            <div className="logo-text">SSPay Gateway</div>
            <div className="logo-sub">{user?.role === "superadmin" ? "Super Admin" : "Merchant Portal"}</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          {nav.map((section) => (
            <div key={section.label} style={{ marginBottom: 8 }}>
              <div className="nav-section-label">{section.label}</div>
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={handleNavClick}
                  className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
                >
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
              <div className="user-role">
                {user?.role === "superadmin" ? "Super Admin" : user?.merchant?.merchant_name || "Merchant"}
              </div>
            </div>
            <button className="logout-btn" onClick={handleLogout} title="Logout">⏻</button>
          </div>
        </div>
      </div>
    </>
  );
}