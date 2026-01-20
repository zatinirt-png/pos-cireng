import React from "react";
import { useNavigate } from "react-router-dom";

export default function LoginGate() {
  const navigate = useNavigate();

  return (
    <div className="container" style={{ paddingTop: 40 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 6 }}>
        POS Cireng Live
      </h1>
      <p style={{ opacity: 0.75, marginBottom: 18 }}>
        Pilih akses untuk melanjutkan
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          maxWidth: 720,
        }}
      >
        <button
          type="button"
          onClick={() => navigate("/cashier")}
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            padding: 16,
            textAlign: "left",
            background: "white",
            cursor: "pointer",
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Login Kasir</div>
          <div style={{ opacity: 0.75, fontSize: 14 }}>
            Mulai shift, input transaksi, checkout.
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigate("/admin")}
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            padding: 16,
            textAlign: "left",
            background: "white",
            cursor: "pointer",
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Login Admin</div>
          <div style={{ opacity: 0.75, fontSize: 14 }}>
            Kelola produk, promo, dan laporan.
          </div>
        </button>
        <button
          type="button"
          onClick={() => navigate("/partner")}
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            padding: 16,
            textAlign: "left",
            background: "white",
            cursor: "pointer",
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Login Mitra</div>
          <div style={{ opacity: 0.75, fontSize: 14 }}>
            Laporan Penjualan Gerobak dan Live Report.
          </div>
        </button>
      </div>
    </div>
  );
}
