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

export default function SideNav() {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();

  // scope ditentukan dari path aktif
  const scope = useMemo(() => scopeFromPath(loc.pathname), [loc.pathname]);
  const session = useMemo(() => getScopedSession(scope), [loc.pathname]); // ✅ re-run tiap pindah route


  const role = session.role; // "ADMIN" | "PARTNER" | "CASHIER" | null

  // items dinamis sesuai role
  const items = useMemo(() => {
    // Belum login: tampilkan pilihan login
    if (!role) {
      return [
        { label: "Home", to: "/" },
        { label: "Login Kasir", to: "/cashier" },
        { label: "Login Admin", to: "/admin" },
        { label: "Login Mitra", to: "/partner" },
      ];
    }

    if (role === "ADMIN") {
      return [
        { label: "Home", to: "/" },
        { label: "Dashboard", to: "/admin/dashboard" },
        { label: "Kelola Gerobak", to: "/admin/carts" },
        { label: "Produk", to: "/admin/products" },
        { label: "Promo", to: "/admin/promos" },
        { label: "Users", to: "/admin/users" },
        { label: "Reports", to: "/admin/reports" },
      ];
    }

    if (role === "CASHIER") {
      return [
        { label: "Home", to: "/" },
        { label: "Kasir POS", to: "/cashier/pos" },
      ];
    }

    if (role === "PARTNER") {
      return [
        { label: "Home", to: "/" },
        { label: "Dashboard Mitra", to: "/partner/dashboard" },
      ];
    }

    return [{ label: "Home", to: "/" }];
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
      {/* Trigger: hanya muncul saat CLOSED */}
      {!open && (
        <button
          type="button"
          className="sidenav-trigger"
          aria-label="Buka menu"
          onClick={() => setOpen(true)}
        >
          <span className="sidenav-trigger-icon" />
        </button>
      )}

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
          <button
            type="button"
            className="sidenav-close"
            aria-label="Tutup menu"
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
        </div>

        <div className="sidenav-list">
          {items.map((it) => {
            const active = isActivePath(loc.pathname, it.to);
            return (
              <button
                key={it.to}
                type="button"
                className={`sidenav-item ${active ? "active" : ""}`}
                onClick={() => go(it.to)}
              >
                {it.label}
              </button>
            );
          })}
        </div>

        <div className="sidenav-footer">
          {role ? (
            <button type="button" className="sidenav-cta" onClick={logout}>
              Logout
            </button>
          ) : (
            <button type="button" className="sidenav-cta" onClick={() => setOpen(false)}>
              Tutup
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
