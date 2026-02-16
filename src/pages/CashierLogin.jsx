import React, { useState } from "react";
import { apiPost } from "../api";
import { useNavigate } from "react-router-dom";

function IconCashier() {
  return (
    <svg width="44" height="44" viewBox="0 0 64 64" aria-hidden="true">
      <rect x="10" y="16" width="44" height="32" rx="10" fill="currentColor" opacity="0.16" />
      <rect x="14" y="20" width="36" height="24" rx="8" fill="currentColor" opacity="0.26" />
      <rect x="18" y="26" width="18" height="6" rx="3" fill="currentColor" />
      <circle cx="44" cy="29" r="3" fill="currentColor" />
      <rect x="18" y="36" width="28" height="6" rx="3" fill="currentColor" opacity="0.9" />
    </svg>
  );
}

export default function CashierLogin() {
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function login(e) {
    e.preventDefault();
    if (loading) return;
    setErr("");
    setLoading(true);
    try {
      const res = await apiPost("/api/auth/login", { username, password });
      if (res.role !== "CASHIER") throw new Error("Akun ini bukan CASHIER.");

      localStorage.setItem("cashier_token", res.token);
      localStorage.setItem("cashier_cartId", res.cartId);
      localStorage.setItem("cashier_cartName", res.cartName || "Gerobak");

      nav("/cashier/pos");
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-bg">
      <div className="auth-shell">
        <div className="auth-center">
          <div className="auth-card auth-card--split">
            {/* LEFT: info */}
            <div className="auth-side">
              <div className="auth-side-head">
                <div className="auth-icon" aria-hidden="true">
                  <IconCashier />
                </div>
                <div>
                  <div className="auth-side-title">Kasir</div>
                  <div className="auth-side-sub">Akses transaksi & shift</div>
                </div>
              </div>

              <div className="auth-side-list">
                <div className="auth-side-item">
                  <span className="auth-bullet" />
                  <div>
                    <div className="auth-side-item-title">Mulai shift & pilih gerobak</div>
                    <div className="auth-side-item-sub">Pastikan perangkat siap & koneksi stabil.</div>
                  </div>
                </div>

                <div className="auth-side-item">
                  <span className="auth-bullet" />
                  <div>
                    <div className="auth-side-item-title">Input transaksi</div>
                    <div className="auth-side-item-sub">Gunakan metode pembayaran yang benar.</div>
                  </div>
                </div>

                <div className="auth-side-item">
                  <span className="auth-bullet" />
                  <div>
                    <div className="auth-side-item-title">Cetak struk</div>
                    <div className="auth-side-item-sub">Periksa total sebelum checkout.</div>
                  </div>
                </div>

                <div className="auth-side-item">
                  <span className="auth-bullet" />
                  <div>
                    <div className="auth-side-item-title">Tutup shift</div>
                    <div className="auth-side-item-sub">Cek tunai & QRIS sesuai laporan.</div>
                  </div>
                </div>
              </div>

              <div className="auth-side-foot">Butuh bantuan? Hubungi Admin.</div>
            </div>

            {/* RIGHT: form */}
            <div className="auth-main">
              <div className="auth-title">Login Kasir</div>
              <div className="auth-subtitle">Masuk menggunakan username & password.</div>

              {err && (
                <div className="auth-alert" role="alert" aria-live="polite">
                  {err}
                </div>
              )}

              <form onSubmit={login} className="auth-form">
                <div className="auth-field">
                  <label className="auth-label" htmlFor="username">Username</label>
                  <input
                    id="username"
                    className="auth-input"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    required
                    disabled={loading}
                  />
                </div>

                <div className="auth-field">
                  <label className="auth-label" htmlFor="password">Password</label>
                  <input
                    id="password"
                    className="auth-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    disabled={loading}
                  />
                </div>

                <button
                  className="auth-btn auth-btn--cashier"
                  type="submit"
                  disabled={!username || !password || loading}
                >
                  {loading ? (
                    <>
                      <span className="spinner spinner--sm" aria-hidden="true" />
                      <span>Memproses…</span>
                    </>
                  ) : (
                    <>
                      <span>Masuk</span>
                      <span aria-hidden="true">→</span>
                    </>
                  )}
                </button>

                <div className="auth-hint">Jika lupa password, hubungi Admin.</div>
              </form>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
