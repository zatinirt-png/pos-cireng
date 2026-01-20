import React, { useState } from "react";
import { apiPost } from "../api";
import { useNavigate } from "react-router-dom";

export default function PartnerLogin() {
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  async function login(e) {
    e.preventDefault();
    setErr("");
    try {
      const res = await apiPost("/api/auth/login", { username, password });
      if (res.role !== "PARTNER") throw new Error("Akun ini bukan PARTNER.");
      localStorage.setItem("partner_token", res.token);
      nav("/partner/dashboard");
    } catch (e2) {
      setErr(e2.message);
    }
  }

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: 520, margin: "16px auto" }}>
        <h2>Login Mitra</h2>
        <p className="muted">Masuk menggunakan username & password.</p>

        {err && <div className="toast" style={{ background: "#ffecec", borderColor: "#ffbdbd" }}>{err}</div>}

        <form onSubmit={login} style={{ marginTop: 12 }}>
          <label>Username</label>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} />
          <div style={{ marginTop: 12 }}>
            <label>Password</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="btn" type="submit" disabled={!username || !password}>Masuk</button>
          </div>
        </form>
      </div>
    </div>
  );
}
