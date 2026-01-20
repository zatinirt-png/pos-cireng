import React from "react";
import { Routes, Route, useLocation } from "react-router-dom";

import CashierLogin from "./pages/CashierLogin.jsx";
import CashierPOS from "./pages/CashierPOS.jsx";

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

function Topbar() {
  const loc = useLocation();
  return (
    <div className="topbar">
      <div>
        <b>POS Cireng Live</b>
        <span className="badge" style={{ marginLeft: 8 }}>
          {loc.pathname.includes("cashier")
            ? "Kasir"
            : loc.pathname.includes("admin")
            ? "Admin"
            : loc.pathname.includes("partner")
            ? "Mitra"
            : "App"}
        </span>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <>
      <Topbar />
      <SideNav />

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
