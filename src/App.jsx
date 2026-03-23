import React, { Suspense, lazy, useState } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import logo from "./assets/cbur-logo.png";
import LoginGate from "./pages/LoginGate";
import SideNav from "./components/SideNav";

const CashierLogin = lazy(() => import("./pages/CashierLogin.jsx"));
const CashierPOS = lazy(() => import("./pages/CashierPOS.jsx"));

const AdminLogin = lazy(() => import("./pages/AdminLogin.jsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const AdminProducts = lazy(() => import("./pages/AdminProducts"));
const AdminPromos = lazy(() => import("./pages/AdminPromos"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const AdminCarts = lazy(() => import("./pages/AdminCarts"));
const AdminReports = lazy(() => import("./pages/AdminReports"));
const AdminInventory = lazy(() => import("./pages/AdminInventory"));

const PartnerLogin = lazy(() => import("./pages/PartnerLogin"));
const PartnerDashboard = lazy(() => import("./pages/PartnerDashboard"));

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

function RouteLoading() {
  return <div className="container">Loading...</div>;
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

      <Suspense fallback={<RouteLoading />}>
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
          <Route path="/admin/inventory" element={<AdminInventory />} />
          <Route path="/partner" element={<PartnerLogin />} />
          <Route path="/partner/dashboard" element={<PartnerDashboard />} />

          <Route path="*" element={<div className="container">404</div>} />
        </Routes>
      </Suspense>
    </>
  );
}