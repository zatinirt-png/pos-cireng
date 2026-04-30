import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api";
import logo from "../assets/cbur-logo.png";

export default function AdminLogin() {
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function login(event) {
    event.preventDefault();

    if (loading) return;

    setErr("");
    setLoading(true);

    try {
      const res = await apiPost("/api/auth/admin", { password });

      localStorage.setItem("admin_token", res.token);
      navigate("/admin/dashboard");
    } catch (error) {
      setErr(error?.message || "Login gagal. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-bg auth-theme-admin">
      <div className="auth-shell">
        <div className="auth-center">
          <section
            className="auth-card"
            style={{ width: "min(520px, 100%)" }}
            aria-label="Login Admin"
          >
            <div className="auth-main">
              <div className="auth-side-head">
                <img className="gate-logo" src={logo} alt="CBUR" />

                <div>
                  <div className="auth-side-title">Admin</div>
                  <div className="auth-side-sub">Kelola operasional CBUR</div>
                </div>
              </div>

              <div className="hr" />

              <div>
                <h1 className="auth-title">Login Admin</h1>
                <p className="auth-subtitle">
                  Masukkan password admin untuk masuk ke dashboard.
                </p>
              </div>

              {err && (
                <div className="auth-alert" role="alert" aria-live="polite">
                  {err}
                </div>
              )}

              <form onSubmit={login} className="auth-form">
                <div className="auth-field">
                  <label className="auth-label" htmlFor="admin-password">
                    Password
                  </label>

                  <input
                    id="admin-password"
                    className="auth-input"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                    disabled={loading}
                    placeholder="Masukkan password"
                  />
                </div>

                <button
                  className="auth-btn auth-btn--admin"
                  type="submit"
                  disabled={!password || loading}
                >
                  {loading ? (
                    <>
                      <span className="spinner spinner--sm" aria-hidden="true" />
                      <span>Memproses...</span>
                    </>
                  ) : (
                    <>
                      <span>Masuk Admin</span>
                      <span aria-hidden="true">→</span>
                    </>
                  )}
                </button>

                <div className="auth-hint">
                  Akses ini khusus untuk pengelola produk, stok, promo, user, dan laporan.
                </div>
              </form>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}