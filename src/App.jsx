import React, { useState } from "react";

import { Routes, Route, useLocation } from "react-router-dom";

import CashierLogin from "./pages/CashierLogin.jsx";
import CashierPOS from "./pages/CashierPOS.jsx";
import logo from "./assets/cbur-logo.png";

import AdminLogin from "./pages/AdminLogin.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import AdminProducts from "./pages/AdminProducts";
import AdminPromos from "./pages/AdminPromos";
import AdminUsers from "./pages/AdminUsers";
import AdminCarts from "./pages/AdminCarts";
import AdminReports from "./pages/AdminReports";

import PartnerLogin from "./pages/PartnerLogin";
import PartnerDashboard from "./pages/PartnerDashboard";

import LoginGate from "./pages/LoginGate";
import SideNav from "./components/SideNav";

function Topbar({ menuOpen, onToggleMenu }) {
  const loc = useLocation();

  const isHome = loc.pathname === "/";

  const scopeLabel = loc.pathname.includes("cashier")
    ? "Kasir"
    : loc.pathname.includes("admin")
    ? "Admin"
    : loc.pathname.includes("partner")
    ? "Mitra"
    : "App";

  return (
    <div className="topbar">
      <div className="topbar-left">
        <img className="topbar-logo" src={logo} alt="CBUR" />
        <div className="topbar-titles">
          <div className="topbar-title">{isHome ? "POS Cireng" : "POS Cireng Live"}</div>
          <div className="topbar-subtitle">
            {isHome ? "Pilih peran untuk login" : `Mode: ${scopeLabel}`}
          </div>
        </div>

        {!isHome && (
          <span className="badge" style={{ marginLeft: 10 }}>
            {scopeLabel}
          </span>
        )}
      </div>

      {/* ✅ Kanan: burger + logo */}
      <div className="topbar-right">
        <button
          type="button"
          className={`topbar-menu-btn ${menuOpen ? "open" : ""}`}
          onClick={onToggleMenu}
          aria-label={menuOpen ? "Tutup menu" : "Buka menu"}
          aria-expanded={menuOpen}
        >
          <span className="topbar-menu-icon" />
        </button>

        
      </div>
    </div>
  );
}



export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <Topbar
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((v) => !v)}
      />

      <SideNav open={menuOpen} setOpen={setMenuOpen} />

      <Routes>
        <Route path="/" element={<LoginGate />} />

        <Route path="/cashier" element={<CashierLogin />} />
        <Route path="/cashier/pos" element={<CashierPOS />} />

        <Route path="/admin" element={<AdminLogin />} />
        <Route path="/admin/dashboard" element={<Dashboard />} />

        <Route path="/admin/products" element={<AdminProducts />} />
        <Route path="/admin/promos" element={<AdminPromos />} />
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/admin/carts" element={<AdminCarts />} />
        <Route path="/admin/reports" element={<AdminReports />} />

        <Route path="/partner" element={<PartnerLogin />} />
        <Route path="/partner/dashboard" element={<PartnerDashboard />} />

        <Route path="*" element={<div className="container">404</div>} />
      </Routes>
    </>
  );
}

