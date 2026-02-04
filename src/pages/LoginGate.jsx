import React from "react";
import { useNavigate } from "react-router-dom";


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
      title: "Login Kasir",
      desc: "Mulai shift, input transaksi, checkout.",
      bullets: ["Kelola transaksi harian", "Cetak struk & invoice"],
      cta: "Masuk sebagai Kasir",
      to: "/cashier",
      tone: "kasir",
      Icon: IconCashier,
    },
    {
      key: "admin",
      title: "Login Admin",
      desc: "Kelola produk, promo, dan laporan.",
      bullets: ["Update stok & harga", "Lihat laporan penjualan"],
      cta: "Masuk sebagai Admin",
      to: "/admin",
      tone: "admin",
      Icon: IconAdmin,
    },
    {
      key: "partner",
      title: "Login Mitra",
      desc: "Laporan penjualan gerobak dan Live Report.",
      bullets: ["Lihat omset realtime", "Pantau performa cabang"],
      cta: "Masuk sebagai Mitra",
      to: "/partner",
      tone: "mitra",
      Icon: IconPartner,
    },
  ];

  return (
    <div className="gate-bg">
      <div className="gate-shell">
        <header className="gate-headline">
          <h1 className="gate-headline-title">Selamat Datang di POS Cireng</h1>
          <p className="gate-headline-sub">
            Silakan pilih peran Anda untuk memulai.
          </p>
        </header>
        
          

        {/* Main */}
        <main className="gate-main">
          <div className="gate-grid" role="list">
            {roles.map(({ key, title, desc, bullets, cta, to, tone, Icon }) => (
              <button
                key={key}
                type="button"
                role="listitem"
                className={`gate-card gate-${tone}`}
                onClick={() => navigate(to)}
              >
                <div className="gate-card-top">
                  <div className="gate-icon" aria-hidden="true">
                    <Icon />
                  </div>
                  <div>
                    <div className="gate-card-title">{title}</div>
                    <div className="gate-card-desc">{desc}</div>
                  </div>
                </div>

                <div className="gate-bullets">
                  {bullets.map((b, i) => (
                    <div key={i} className="gate-bullet">
                      <span className="gate-dot" aria-hidden="true" />
                      <span>{b}</span>
                    </div>
                  ))}
                </div>

                <div className="gate-ctaRow">
                  <span className="gate-cta">{cta}</span>
                  <span className="gate-arrow" aria-hidden="true">→</span>
                </div>
              </button>
            ))}
          </div>

          <footer className="gate-footer">
            <span>© 2026</span>
            <span className="gate-footer-dot">•</span>
            <span>POS Cireng</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
