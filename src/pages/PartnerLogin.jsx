import React, { useState } from "react";
import { apiPost } from "../api";
import { useNavigate } from "react-router-dom";

function IconPartner() {
  return (
    <svg width="44" height="44" viewBox="0 0 64 64" aria-hidden="true">
      <rect x="10" y="16" width="44" height="32" rx="10" fill="currentColor" opacity="0.16" />
      <rect x="18" y="42" width="28" height="6" rx="3" fill="currentColor" opacity="0.55" />
      <rect x="22" y="34" width="6" height="10" rx="3" fill="currentColor" opacity="0.9" />
      <rect x="30" y="28" width="6" height="16" rx="3" fill="currentColor" opacity="0.7" />
      <rect x="38" y="36" width="6" height="8" rx="3" fill="currentColor" opacity="0.55" />
    </svg>
  );
}

export default function PartnerLogin() {
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  async function login(e) {
    e.preventDefault();
    setErr("");
    try {
      // ✅ endpoint sama seperti sebelumnya
      const res = await apiPost("/api/auth/login", { username, password });
      if (res.role !== "PARTNER") throw new Error("Akun ini bukan PARTNER.");

      localStorage.setItem("partner_token", res.token);
      nav("/partner/dashboard");
    } catch (e2) {
      setErr(e2.message);
    }
  }

  return (
    <div className="auth-bg auth-theme-partner">
      <div className="auth-shell">
        <div className="auth-center">
          <div className="auth-card auth-card--split">
            {/* LEFT: info */}
            <div className="auth-side">
              <div className="auth-side-head">
                <div className="auth-icon" aria-hidden="true">
                  <IconPartner />
                </div>
                <div>
                  <div className="auth-side-title">Mitra</div>
                  <div className="auth-side-sub">Pantau performa & omzet</div>
                </div>
              </div>

              <div className="auth-side-list">
                <div className="auth-side-item">
                  <span className="auth-bullet" />
                  <div>
                    <div className="auth-side-item-title">Omzet realtime</div>
                    <div className="auth-side-item-sub">Pantau penjualan per gerobak.</div>
                  </div>
                </div>

                <div className="auth-side-item">
                  <span className="auth-bullet" />
                  <div>
                    <div className="auth-side-item-title">Ringkasan harian</div>
                    <div className="auth-side-item-sub">Lihat tren jam ramai & produk terlaris.</div>
                  </div>
                </div>

                <div className="auth-side-item">
                  <span className="auth-bullet" />
                  <div>
                    <div className="auth-side-item-title">Performance cabang</div>
                    <div className="auth-side-item-sub">Bandingkan performa lokasi.</div>
                  </div>
                </div>

                <div className="auth-side-item">
                  <span className="auth-bullet" />
                  <div>
                    <div className="auth-side-item-title">Export laporan</div>
                    <div className="auth-side-item-sub">Unduh laporan untuk evaluasi.</div>
                  </div>
                </div>
              </div>

              <div className="auth-side-foot">Gunakan akun Mitra resmi.</div>
            </div>

            {/* RIGHT: form */}
            <div className="auth-main">
              <div className="auth-title">Login Mitra</div>
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
                  />
                </div>

                <button className="auth-btn auth-btn--partner" type="submit" disabled={!username || !password}>
                  <span>Masuk</span>
                  <span aria-hidden="true">→</span>
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
