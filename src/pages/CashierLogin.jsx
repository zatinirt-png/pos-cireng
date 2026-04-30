import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api";
import logo from "../assets/cbur-logo.png";

export default function CashierLogin() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function login(event) {
    event.preventDefault();

    if (loading) return;

    setErr("");
    setLoading(true);

    try {
      const cleanUsername = username.trim();

      const res = await apiPost("/api/auth/login", {
        username: cleanUsername,
        password,
      });

      if (res.role !== "CASHIER") {
        throw new Error("Akun ini bukan CASHIER.");
      }

      localStorage.setItem("cashier_token", res.token);
      localStorage.setItem("cashier_cartId", res.cartId || "");
      localStorage.setItem("cashier_cartName", res.cartName || "Gerobak");

      navigate("/cashier/pos");
    } catch (error) {
      setErr(error?.message || "Login gagal. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-bg auth-theme-cashier">
      <div className="auth-shell">
        <div className="auth-center">
          <section
            className="auth-card"
            style={{ width: "min(520px, 100%)" }}
            aria-label="Login Kasir"
          >
            <div className="auth-main">
              <div className="auth-side-head">
                <img className="gate-logo" src={logo} alt="CBUR" />

                <div>
                  <div className="auth-side-title">Kasir</div>
                  <div className="auth-side-sub">Transaksi dan shift gerobak</div>
                </div>
              </div>

              <div className="hr" />

              <div>
                <h1 className="auth-title">Login Kasir</h1>
                <p className="auth-subtitle">
                  Masuk untuk mulai shift, membuat order, dan checkout.
                </p>
              </div>

              {err && (
                <div className="auth-alert" role="alert" aria-live="polite">
                  {err}
                </div>
              )}

              <form onSubmit={login} className="auth-form">
                <div className="auth-field">
                  <label className="auth-label" htmlFor="cashier-username">
                    Username
                  </label>

                  <input
                    id="cashier-username"
                    className="auth-input"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    autoComplete="username"
                    required
                    disabled={loading}
                    placeholder="Masukkan username"
                  />
                </div>

                <div className="auth-field">
                  <label className="auth-label" htmlFor="cashier-password">
                    Password
                  </label>

                  <input
                    id="cashier-password"
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
                  className="auth-btn auth-btn--cashier"
                  type="submit"
                  disabled={!username.trim() || !password || loading}
                >
                  {loading ? (
                    <>
                      <span className="spinner spinner--sm" aria-hidden="true" />
                      <span>Memproses...</span>
                    </>
                  ) : (
                    <>
                      <span>Masuk Kasir</span>
                      <span aria-hidden="true">→</span>
                    </>
                  )}
                </button>

                <div className="auth-hint">
                  Setelah masuk, buka shift terlebih dahulu sebelum transaksi.
                </div>
              </form>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}