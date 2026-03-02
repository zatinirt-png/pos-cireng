import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// ===== utils: decode JWT payload (tanpa verifikasi signature, cukup untuk baca role) =====
function decodeJwtPayload(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// Tentukan scope dari route aktif
function scopeFromPath(pathname) {
  // LoginGate: jangan tampilkan role apa pun
  if (pathname === "/") return "GUEST";

  if (pathname.startsWith("/admin")) return "ADMIN";
  if (pathname.startsWith("/partner")) return "PARTNER";
  if (pathname.startsWith("/cashier")) return "CASHIER";

  return "GUEST";
}

// Ambil token SESUAI scope route (bukan token pertama yang ketemu)
function getScopedSession(scope) {
  if (scope === "GUEST") return { tokenKey: null, token: null, role: null };

  const keysByRole = {
    ADMIN: ["admin_token", "auth_token"],
    PARTNER: ["partner_token", "auth_token"],
    CASHIER: ["cashier_token", "auth_token"],
  };

  const keys = keysByRole[scope] || ["auth_token"];

  for (const key of keys) {
    const t = localStorage.getItem(key);
    if (!t) continue;

    const payload = decodeJwtPayload(t);
    const role = payload?.role || null;

    // kalau auth_token dipakai, pastikan role di token cocok dengan scope
    if (role && role !== scope) continue;

    return { tokenKey: key, token: t, role: role || scope };
  }

  return { tokenKey: null, token: null, role: null };
}

function isActivePath(current, to) {
  if (!to) return false;
  if (to === "/") return current === "/";
  return current === to || current.startsWith(to + "/");
}

function toneFromTo(to) {
  if (to?.startsWith("/cashier")) return "orange";
  if (to?.startsWith("/admin")) return "red";
  if (to?.startsWith("/partner")) return "amber";
  return "slate";
}


export default function SideNav({ open: openProp, setOpen: setOpenProp }) {
  const [internalOpen, setInternalOpen] = useState(false);

  const open = openProp ?? internalOpen;
  const setOpen = setOpenProp ?? setInternalOpen;

  const loc = useLocation();
  const nav = useNavigate();

  // scope ditentukan dari path aktif
  const scope = useMemo(() => scopeFromPath(loc.pathname), [loc.pathname]);
  const session = useMemo(() => getScopedSession(scope), [scope, loc.pathname]);
 // ✅ re-run tiap pindah route


  const role = session.role; // "ADMIN" | "PARTNER" | "CASHIER" | null

  // items dinamis sesuai role
  const items = useMemo(() => {
  if (!role) {
    return [
      { label: "Home", sub: "Beranda", to: "/", tone: "slate" },
      { label: "Login Kasir", sub: "Mulai shift", to: "/cashier", tone: "orange" },
      { label: "Login Admin", sub: "Kelola data", to: "/admin", tone: "red" },
      { label: "Login Mitra", sub: "Pantau cabang", to: "/partner", tone: "amber" },
    ];
  }

  if (role === "ADMIN") {
    return [
      { label: "Home", sub: "Beranda", to: "/", tone: "slate" },
      { label: "Dashboard", sub: "Ringkasan performa", to: "/admin/dashboard", tone: "red" },
      { label: "Kelola Gerobak", sub: "Cabang & gerobak", to: "/admin/carts", tone: "red" },
      { label: "Produk", sub: "Data produk & harga", to: "/admin/products", tone: "red" },
      { label: "Promo", sub: "Diskon & campaign", to: "/admin/promos", tone: "red" },
      { label: "Users", sub: "Akun & akses", to: "/admin/users", tone: "red" },
      { label: "Stok", sub: "Stok gerobak & bahan", to: "/admin/inventory", tone: "red" },
      { label: "Reports", sub: "Laporan penjualan", to: "/admin/reports", tone: "red" },
    ];
  }

  if (role === "CASHIER") {
    return [
      { label: "Home", sub: "Beranda", to: "/", tone: "slate" },
      { label: "Kasir POS", sub: "Mulai transaksi", to: "/cashier/pos", tone: "orange" },
    ];
  }

  if (role === "PARTNER") {
    return [
      { label: "Home", sub: "Beranda", to: "/", tone: "slate" },
      { label: "Dashboard Mitra", sub: "Pantau cabang", to: "/partner/dashboard", tone: "amber" },
      { label: "Stok", sub: "Stok gerobakmu", to: "/partner/dashboard?tab=stocks", tone: "red" },
    ];
  }

  return [{ label: "Home", sub: "Beranda", to: "/", tone: "slate" }];
}, [role]);


  // auto close ketika pindah halaman
  useEffect(() => {
    setOpen(false);
  }, [loc.pathname]);

  // lock scroll + ESC untuk close
  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const go = (to) => {
    setOpen(false);
    nav(to);
  };

  const logout = () => {
    // hapus token yg mungkin ada (biar aman)
    localStorage.removeItem("auth_token");
    localStorage.removeItem("admin_token");
    localStorage.removeItem("partner_token");
    localStorage.removeItem("cashier_token");

    // bersihin data kasir juga
    localStorage.removeItem("cashier_cartId");
    localStorage.removeItem("cashier_cartName");

    setOpen(false);
    nav("/");
  };

  return (
    <>
      

      {/* Overlay */}
      <div
        className={`sidenav-overlay ${open ? "open" : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden={!open}
      />

      {/* Panel */}
      <aside className={`sidenav-panel ${open ? "open" : ""}`} aria-hidden={!open}>
        <div className="sidenav-header">
          <div>
            <div className="sidenav-title">Menu</div>
            <div className="sidenav-subtitle">
              {/* LoginGate (/) selalu "Navigasi cepat" walau token admin ada */}
              {scope === "GUEST" ? "Navigasi cepat" : role ? `Role: ${role}` : "Belum login"}
            </div>
          </div>

          {/* Close: nyatu di header sidebar */}
          
        </div>

        <div className="sidenav-list">
          {items.map((it) => {
            const active = isActivePath(loc.pathname, it.to);
            const tone = it.tone || toneFromTo(it.to);

            return (
              <button
                key={it.to}
                type="button"
                className={`sidenav-item ${active ? "active" : ""}`}
                onClick={() => go(it.to)}
              >
                <span className="sidenav-item-accent" aria-hidden="true" />

                <span className="sidenav-item-icon" aria-hidden="true">
                  <span className={`sidenav-dot tone-${tone}`} />
                </span>

                <span className="sidenav-item-body">
                  <span className="sidenav-item-title">{it.label}</span>
                  <span className="sidenav-item-sub">{it.sub}</span>
                </span>

                <span className="sidenav-item-chevron" aria-hidden="true">›</span>
              </button>
            );
          })}
        </div>


        <div className="sidenav-footer">
          <div className="sidenav-footer-actions">
            <button type="button" className="sidenav-cta" onClick={() => setOpen(false)}>
              Tutup
            </button>

            {role && (
              <button type="button" className="sidenav-cta danger" onClick={logout}>
                Logout
              </button>
            )}
          </div>

          <div className="sidenav-meta">POS Cireng • v0.2</div>
        </div>

      </aside>
    </>
  );
}
