import React, { useState } from "react";
import { apiPost } from "../api";
import { useNavigate } from "react-router-dom";

export default function AdminLogin() {
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  async function login(e) {
    e.preventDefault();
    setErr("");
    try {
      const res = await apiPost("/api/auth/admin", { password });
      localStorage.setItem("admin_token", res.token);
      nav("/admin/dashboard");
    } catch (e2) {
      setErr(e2.message);
    }
  }

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: 520, margin: "16px auto" }}>
        <h2>Login Admin (Dashboard)</h2>
        <p className="muted">Password default: admin123 (ubah di server/.env)</p>

        {err && <div className="toast" style={{ background: "#ffecec", borderColor: "#ffbdbd" }}>{err}</div>}

        <form onSubmit={login} style={{ marginTop: 12 }}>
          <label>Password</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div style={{ marginTop: 12 }}>
            <button className="btn" type="submit" disabled={!password}>Masuk</button>
          </div>
        </form>
      </div>
    </div>
  );
}
