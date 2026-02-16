import React from "react";
import { useNavigate } from "react-router-dom";

import logo from "../assets/cbur-logo.png";

function IconCashier() {
  return (
    <svg width="44" height="44" viewBox="0 0 64 64" aria-hidden="true">
      <rect x="10" y="16" width="44" height="32" rx="8" fill="currentColor" opacity="0.18" />
      <rect x="14" y="20" width="36" height="24" rx="6" fill="currentColor" opacity="0.28" />
      <rect x="18" y="26" width="18" height="6" rx="3" fill="currentColor" />
      <circle cx="44" cy="29" r="3" fill="currentColor" />
      <rect x="18" y="36" width="28" height="6" rx="3" fill="currentColor" opacity="0.9" />
    </svg>
  );
}

function IconAdmin() {
  return (
    <svg width="44" height="44" viewBox="0 0 64 64" aria-hidden="true">
      <path
        d="M32 10l6 10 12 2-8 8 2 12-12-6-12 6 2-12-8-8 12-2 6-10z"
        fill="currentColor"
        opacity="0.22"
      />
      <path
        d="M32 20l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6z"
        fill="currentColor"
      />
      <rect x="16" y="44" width="32" height="8" rx="4" fill="currentColor" opacity="0.35" />
    </svg>
  );
}

function IconPartner() {
  return (
    <svg width="44" height="44" viewBox="0 0 64 64" aria-hidden="true">
      <rect x="14" y="22" width="36" height="28" rx="8" fill="currentColor" opacity="0.22" />
      <rect x="20" y="16" width="24" height="10" rx="5" fill="currentColor" opacity="0.35" />
      <path
        d="M22 38h20M22 44h14"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.9"
      />
    </svg>
  );
}

export default function LoginGate() {
  const navigate = useNavigate();

  const roles = [
    {
      key: "cashier",
      title: "Kasir",
      desc: "Mulai shift, input transaksi, checkout cepat.",
      bullets: ["Shift & transaksi harian", "Cetak struk / invoice"],
      cta: "Masuk sebagai Kasir",
      to: "/cashier",
      tone: "orange",
      Icon: IconCashier,
    },
    {
      key: "admin",
      title: "Admin",
      desc: "Kelola produk, promo, dan laporan penjualan.",
      bullets: ["Update stok & harga", "Laporan & monitoring"],
      cta: "Masuk sebagai Admin",
      to: "/admin",
      tone: "red",
      Icon: IconAdmin,
    },
    {
      key: "partner",
      title: "Mitra",
      desc: "Pantau omset gerobak & live report.",
      bullets: ["Omset realtime", "Performa cabang"],
      cta: "Masuk sebagai Mitra",
      to: "/partner",
      tone: "amber",
      Icon: IconPartner,
    },
  ];

  return (
    <div className="gate-bg">
      <div className="gate-container">
        <div className="gate-card">
          <div className="gate-grid">
            {/* Left */}
            <section className="gate-left" aria-label="Informasi aplikasi">
              <div className="gate-brand">
                <img className="gate-logo" src={logo} alt="CBUR" />
                <div>
                  <h1 className="gate-title">POS Cireng</h1>
                  <p className="gate-subtitle">
                    Pilih peran untuk login. Desain ringan & cepat untuk kasir.
                  </p>
                </div>
              </div>

              <div className="gate-divider" />

              <p className="gate-prompt">Masuk sebagai</p>

              <div className="gate-actions" role="list">
                {roles.map(({ key, title, desc, bullets, cta, to, tone, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    role="listitem"
                    className={`role-btn role-${tone}`}
                    onClick={() => navigate(to)}
                    aria-label={cta}
                  >
                    <div className="role-row">
                      <div className={`role-icon role-tone-${tone}`} aria-hidden="true">
                        <Icon />
                      </div>

                      <div className="role-content">
                        <strong>{title}</strong>
                        <small>{desc}</small>

                        <div className="role-bullets" aria-hidden="true">
                          {bullets.map((b, i) => (
                            <span key={i} className="role-bullet">
                              <span className="role-dot" />
                              {b}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="role-cta" aria-hidden="true">
                        <span className="role-ctaText">Masuk</span>
                        <span className="role-arrow">→</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="gate-divider" />

              <div className="gate-meta">
                
                
                <span className="muted">© 2026 POS Cireng</span>
              </div>
            </section>

            {/* Right */}
            <aside className="gate-right" aria-label="Tips cepat">
              <div className="gate-info-card">
                <h3 className="gate-info-title">Tips cepat</h3>
                <ul className="gate-info-list">
                  <li>Gunakan <b>Tab</b> untuk pindah field, <b>Enter</b> untuk submit.</li>
                  <li>Menu ada di tombol <b>burger</b> kanan atas.</li>
                  <li>Mode kasir: <b>Open Shift</b> dulu sebelum transaksi.</li>
                </ul>
              </div>

              <div className="gate-info-card">
                <h3 className="gate-info-title">Keamanan</h3>
                <ul className="gate-info-list">
                  <li>Logout jika perangkat dipakai bergantian.</li>
                  <li>Pastikan jaringan stabil saat checkout.</li>
                </ul>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
