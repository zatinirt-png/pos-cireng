import React, { useState } from "react";
import { apiPost } from "../api";
import { useNavigate } from "react-router-dom";

function IconAdmin() {
  return (
    <svg width="44" height="44" viewBox="0 0 64 64" aria-hidden="true">
      <rect x="10" y="16" width="44" height="32" rx="10" fill="currentColor" opacity="0.16" />
      <path
        d="M32 18l3.2 7.2 7.8.7-5.9 5.1 1.8 7.6-6.9-4-6.9 4 1.8-7.6-5.9-5.1 7.8-.7L32 18z"
        fill="currentColor"
        opacity="0.95"
      />
      <rect x="18" y="44" width="28" height="6" rx="3" fill="currentColor" opacity="0.55" />
    </svg>
  );
}

export default function AdminLogin() {
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  async function login(e) {
    e.preventDefault();
    setErr("");
    try {
      // ✅ server tetap sama
      const res = await apiPost("/api/auth/admin", { password });
      localStorage.setItem("admin_token", res.token);
      nav("/admin/dashboard");
    } catch (e2) {
      setErr(e2.message);
    }
  }

  return (
    <div className="auth-bg auth-theme-admin">
      <div className="auth-shell">
        <div className="auth-center">
          <div className="auth-card auth-card--split">
            {/* LEFT: info */}
            <div className="auth-side">
              <div className="auth-side-head">
                <div className="auth-icon" aria-hidden="true">
                  <IconAdmin />
                </div>
                <div>
                  <div className="auth-side-title">Admin</div>
                  <div className="auth-side-sub">Kelola data & laporan</div>
                </div>
              </div>

              <div className="auth-side-list">
                <div className="auth-side-item">
                  <span className="auth-bullet" />
                  <div>
                    <div className="auth-side-item-title">Produk & harga</div>
                    <div className="auth-side-item-sub">Update menu, stok, dan harga jual.</div>
                  </div>
                </div>

                <div className="auth-side-item">
                  <span className="auth-bullet" />
                  <div>
                    <div className="auth-side-item-title">Promo</div>
                    <div className="auth-side-item-sub">Atur diskon & campaign.</div>
                  </div>
                </div>

                <div className="auth-side-item">
                  <span className="auth-bullet" />
                  <div>
                    <div className="auth-side-item-title">Users & akses</div>
                    <div className="auth-side-item-sub">Kelola akun kasir/mitra.</div>
                  </div>
                </div>

                <div className="auth-side-item">
                  <span className="auth-bullet" />
                  <div>
                    <div className="auth-side-item-title">Reports</div>
                    <div className="auth-side-item-sub">Pantau penjualan & export laporan.</div>
                  </div>
                </div>
              </div>

              <div className="auth-side-foot">Gunakan akun Admin resmi.</div>
            </div>

            {/* RIGHT: form */}
            <div className="auth-main">
              <div className="auth-title">Login Admin</div>
              <div className="auth-subtitle">Masukkan password untuk masuk ke dashboard.</div>

              

              {err && (
                <div className="auth-alert" role="alert" aria-live="polite">
                  {err}
                </div>
              )}

              <form onSubmit={login} className="auth-form">
                <div className="auth-field">
                  <label className="auth-label" htmlFor="password">
                    Password
                  </label>
                  <input
                    id="password"
                    className="auth-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </div>

                <button className="auth-btn auth-btn--admin" type="submit" disabled={!password}>
                  <span>Masuk</span>
                  <span aria-hidden="true">→</span>
                </button>

                <div className="auth-hint">Pastikan Anda menggunakan akun Admin yang benar.</div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
