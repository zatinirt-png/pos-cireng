import React, { Suspense, lazy, useMemo, useState } from "react";
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

function getPageMeta(pathname) {
  if (pathname === "/") {
    return {
      title: "CBUR POS",
      subtitle: "Pilih akses aplikasi",
      scope: "Beranda",
    };
  }

  if (pathname === "/admin") {
    return {
      title: "Login Admin",
      subtitle: "Masuk untuk kelola operasional",
      scope: "Admin",
    };
  }

  if (pathname === "/admin/dashboard") {
    return {
      title: "Dashboard Admin",
      subtitle: "Ringkasan penjualan, shift, dan stok",
      scope: "Admin",
    };
  }

  if (pathname === "/admin/carts") {
    return {
      title: "Gerobak",
      subtitle: "Kelola cabang dan lokasi jualan",
      scope: "Admin",
    };
  }

  if (pathname === "/admin/products") {
    return {
      title: "Produk",
      subtitle: "Kelola menu, harga, dan status produk",
      scope: "Admin",
    };
  }

  if (pathname === "/admin/promos") {
    return {
      title: "Promo",
      subtitle: "Kelola diskon dan bonus item",
      scope: "Admin",
    };
  }

  if (pathname === "/admin/users") {
    return {
      title: "Users",
      subtitle: "Kelola akun dan akses pengguna",
      scope: "Admin",
    };
  }

  if (pathname === "/admin/inventory") {
    return {
      title: "Stok",
      subtitle: "Kelola bahan, resep, dan stok gerobak",
      scope: "Admin",
    };
  }

  if (pathname === "/admin/reports") {
    return {
      title: "Laporan",
      subtitle: "Pantau penjualan dan export data",
      scope: "Admin",
    };
  }

  if (pathname === "/cashier") {
    return {
      title: "Login Kasir",
      subtitle: "Masuk untuk mulai shift",
      scope: "Kasir",
    };
  }

  if (pathname === "/cashier/pos") {
    return {
      title: "POS Kasir",
      subtitle: "Jualan, antrian, kas, shift, dan stok",
      scope: "Kasir",
    };
  }

  if (pathname === "/partner") {
    return {
      title: "Login Mitra",
      subtitle: "Masuk untuk pantau cabang",
      scope: "Mitra",
    };
  }

  if (pathname === "/partner/dashboard") {
    return {
      title: "Dashboard Mitra",
      subtitle: "Pantau penjualan dan stok gerobak",
      scope: "Mitra",
    };
  }

  return {
    title: "CBUR POS",
    subtitle: "Sistem kasir dan stok gerobak",
    scope: "App",
  };
}

function Topbar({ menuOpen, onToggleMenu }) {
  const location = useLocation();

  const meta = useMemo(() => getPageMeta(location.pathname), [location.pathname]);
  const isHome = location.pathname === "/";

  return (
    <header className="topbar">
      <div className="topbar-left">
        <img className="topbar-logo" src={logo} alt="CBUR" />

        <div className="topbar-titles">
          <div className="topbar-title">{meta.title}</div>
          <div className="topbar-subtitle">{meta.subtitle}</div>
        </div>

        {!isHome && <span className="badge">{meta.scope}</span>}
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
    </header>
  );
}

function RouteLoading() {
  return (
    <div className="loading-page">
      <div className="loading-card">
        <div className="loading-brand">
          <img className="loading-logo" src={logo} alt="CBUR" />
          <div>
            <div className="loading-title">Memuat halaman</div>
            <div className="loading-subtitle">Mohon tunggu sebentar.</div>
          </div>
        </div>

        <div className="loading-row">
          <span className="spinner" aria-hidden="true" />
          <div>
            <div className="loading-status-main">Menyiapkan tampilan</div>
            <div className="loading-status-sub">Data dan halaman sedang diproses.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <main className="container">
      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Halaman tidak ditemukan</div>
            <div className="card-subtitle">Periksa kembali alamat halaman.</div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <Topbar
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((value) => !value)}
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

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}