import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

function decodeJwtPayload(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return null;

    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((char) => "%" + ("00" + char.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );

    return JSON.parse(json);
  } catch {
    return null;
  }
}

function scopeFromPath(pathname) {
  if (pathname === "/") return "GUEST";
  if (pathname.startsWith("/admin")) return "ADMIN";
  if (pathname.startsWith("/cashier")) return "CASHIER";
  if (pathname.startsWith("/partner")) return "PARTNER";
  return "GUEST";
}

function getScopedSession(scope) {
  if (scope === "GUEST") {
    return {
      tokenKey: null,
      token: null,
      role: null,
    };
  }

  const keysByRole = {
    ADMIN: ["admin_token", "auth_token"],
    CASHIER: ["cashier_token", "auth_token"],
    PARTNER: ["partner_token", "auth_token"],
  };

  const keys = keysByRole[scope] || ["auth_token"];

  for (const key of keys) {
    const token = localStorage.getItem(key);
    if (!token) continue;

    const payload = decodeJwtPayload(token);
    const role = payload?.role || null;

    if (role && role !== scope) continue;

    return {
      tokenKey: key,
      token,
      role: role || scope,
    };
  }

  return {
    tokenKey: null,
    token: null,
    role: null,
  };
}

function isActivePath(location, to) {
  if (!to) return false;

  const current = `${location.pathname}${location.search || ""}`;

  if (to === "/") return location.pathname === "/";
  if (to.includes("?")) return current === to;

  return location.pathname === to || location.pathname.startsWith(`${to}/`);
}

function getTone(to) {
  if (to?.startsWith("/admin")) return "red";
  if (to?.startsWith("/cashier")) return "orange";
  if (to?.startsWith("/partner")) return "amber";
  return "slate";
}

function getRoleLabel(role, scope) {
  if (scope === "GUEST") return "Navigasi cepat";
  if (role === "ADMIN") return "Role: Admin";
  if (role === "CASHIER") return "Role: Kasir";
  if (role === "PARTNER") return "Role: Mitra";
  return "Belum login";
}

function buildItems(role) {
  if (!role) {
    return [
      {
        label: "Beranda",
        sub: "Pilih akses aplikasi",
        to: "/",
      },
      {
        label: "Login Kasir",
        sub: "Mulai shift dan transaksi",
        to: "/cashier",
      },
      {
        label: "Login Admin",
        sub: "Kelola operasional",
        to: "/admin",
      },
      {
        label: "Login Mitra",
        sub: "Pantau cabang",
        to: "/partner",
      },
    ];
  }

  if (role === "ADMIN") {
    return [
      {
        label: "Dashboard",
        sub: "Ringkasan utama",
        to: "/admin/dashboard",
      },
      {
        label: "Gerobak",
        sub: "Cabang dan lokasi",
        to: "/admin/carts",
      },
      {
        label: "Produk",
        sub: "Menu dan harga",
        to: "/admin/products",
      },
      {
        label: "Promo",
        sub: "Diskon dan bonus",
        to: "/admin/promos",
      },
      {
        label: "Users",
        sub: "Akun dan akses",
        to: "/admin/users",
      },
      {
        label: "Stok",
        sub: "Bahan dan resep",
        to: "/admin/inventory",
      },
      {
        label: "Laporan",
        sub: "Penjualan dan export",
        to: "/admin/reports",
      },
    ];
  }

  if (role === "CASHIER") {
    return [
      {
        label: "POS Kasir",
        sub: "Jualan dan antrian",
        to: "/cashier/pos",
      },
    ];
  }

  if (role === "PARTNER") {
    return [
      {
        label: "Dashboard Mitra",
        sub: "Pantau performa",
        to: "/partner/dashboard",
      },
      {
        label: "Stok Gerobak",
        sub: "Pantau stok cabang",
        to: "/partner/dashboard?tab=stocks",
      },
    ];
  }

  return [
    {
      label: "Beranda",
      sub: "Kembali ke awal",
      to: "/",
    },
  ];
}

export default function SideNav({ open: openProp, setOpen: setOpenProp }) {
  const [internalOpen, setInternalOpen] = useState(false);

  const open = openProp ?? internalOpen;
  const setOpen = setOpenProp ?? setInternalOpen;

  const location = useLocation();
  const navigate = useNavigate();

  const scope = useMemo(() => scopeFromPath(location.pathname), [location.pathname]);

  const session = useMemo(
    () => getScopedSession(scope),
    [scope, location.pathname, location.search]
  );

  const role = session.role;

  const items = useMemo(() => buildItems(role), [role]);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeydown(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeydown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [open, setOpen]);

  function goTo(to) {
    setOpen(false);
    navigate(to);
  }

  function logout() {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("admin_token");
    localStorage.removeItem("cashier_token");
    localStorage.removeItem("partner_token");

    localStorage.removeItem("cashier_cartId");
    localStorage.removeItem("cashier_cartName");

    setOpen(false);
    navigate("/");
  }

  return (
    <>
      <div
        className={`sidenav-overlay ${open ? "open" : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden={!open}
      />

      <aside className={`sidenav-panel ${open ? "open" : ""}`} aria-hidden={!open}>
        <div className="sidenav-header">
          <div>
            <div className="sidenav-title">Menu</div>
            <div className="sidenav-subtitle">{getRoleLabel(role, scope)}</div>
          </div>

          <button
            type="button"
            className="sidenav-cta"
            style={{ flex: "0 0 auto", paddingInline: 12 }}
            onClick={() => setOpen(false)}
          >
            Tutup
          </button>
        </div>

        <nav className="sidenav-list" aria-label="Navigasi utama">
          {items.map((item) => {
            const active = isActivePath(location, item.to);
            const tone = getTone(item.to);

            return (
              <button
                key={item.to}
                type="button"
                className={`sidenav-item ${active ? "active" : ""}`}
                onClick={() => goTo(item.to)}
              >
                <span className="sidenav-item-accent" aria-hidden="true" />

                <span className="sidenav-item-icon" aria-hidden="true">
                  <span className={`sidenav-dot tone-${tone}`} />
                </span>

                <span className="sidenav-item-body">
                  <span className="sidenav-item-title">{item.label}</span>
                  <span className="sidenav-item-sub">{item.sub}</span>
                </span>

                <span className="sidenav-item-chevron" aria-hidden="true">
                  ›
                </span>
              </button>
            );
          })}
        </nav>

        <div className="sidenav-footer">
          <div className="sidenav-footer-actions">
            <button type="button" className="sidenav-cta" onClick={() => goTo("/")}>
              Beranda
            </button>

            {role && (
              <button type="button" className="sidenav-cta danger" onClick={logout}>
                Logout
              </button>
            )}
          </div>

          <div className="sidenav-meta">
            CBUR POS • Sistem kasir dan stok gerobak
          </div>
        </div>
      </aside>
    </>
  );
}