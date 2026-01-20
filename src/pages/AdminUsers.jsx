import React, { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, apiPatch, apiPut } from "../api";
import { useNavigate } from "react-router-dom";

export default function AdminUsers() {
  const nav = useNavigate();
  const token = localStorage.getItem("admin_token");

  const [users, setUsers] = useState([]);
  const [carts, setCarts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [form, setForm] = useState({
    id: "",
    role: "PARTNER",
    name: "",
    username: "",
    password: "",
    isActive: true,
    cartId: "",     // untuk CASHIER
    cartIds: [],    // untuk PARTNER
  });

  useEffect(() => {
    if (!token) nav("/admin");
  }, [token, nav]);

  async function load() {
    setErr(""); setMsg("");
    setLoading(true);
    try {
      const [u, c] = await Promise.all([
        apiGet("/api/admin/users", token),
        apiGet("/api/admin/carts", token),
      ]);
      setUsers(u.users || []);
      setCarts(c.carts || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (token) load(); }, [token]);

  const activeCarts = useMemo(() => carts.filter(c => c.isActive !== false), [carts]);

  function resetForm() {
    setForm({ id: "", role: "PARTNER", name: "", username: "", password: "", isActive: true, cartId: "", cartIds: [] });
  }

  function editRow(u) {
    setMsg(""); setErr("");
    setForm({
      id: u.id,
      role: u.role,
      name: u.name || "",
      username: u.username || "",
      password: "",
      isActive: !!u.isActive,
      cartId: u.cartId || "",
      cartIds: u.accessCartIds || [],
    });
  }

  function togglePartnerCart(cid) {
    setForm(f => {
      const set = new Set(f.cartIds || []);
      if (set.has(cid)) set.delete(cid); else set.add(cid);
      return { ...f, cartIds: Array.from(set) };
    });
  }

  async function submit(e) {
    e.preventDefault();
    setErr(""); setMsg("");

    try {
      const payload = {
        role: form.role,
        name: String(form.name || "").trim() || null,
        username: String(form.username || "").trim(),
        password: form.password, // untuk create / reset
        isActive: !!form.isActive,
      };

      if (!payload.username) throw new Error("Username wajib diisi.");

      if (!form.id) {
        // CREATE
        if (!payload.password || payload.password.length < 4) throw new Error("Password minimal 4 karakter.");

        if (payload.role === "CASHIER") {
          if (!form.cartId) throw new Error("Kasir wajib pilih gerobak.");
          payload.cartId = form.cartId;
        }
        if (payload.role === "PARTNER") {
          if (!form.cartIds?.length) throw new Error("Partner wajib punya minimal 1 akses gerobak.");
          payload.cartIds = form.cartIds;
        }

        await apiPost("/api/admin/users", payload, token);
        setMsg("User dibuat.");
        resetForm();
        await load();
        return;
      }

      // UPDATE basic (name/username/isActive/password optional + cartId optional)
      const updatePayload = {
        name: payload.name,
        username: payload.username,
        isActive: payload.isActive,
      };

      if (payload.password && payload.password.length) updatePayload.password = payload.password;

      // cashier can update cartId
      if (payload.role === "CASHIER") updatePayload.cartId = form.cartId || null;

      await apiPatch(`/api/admin/users/${form.id}`, updatePayload, token);

      // partner carts update via separate endpoint
      if (payload.role === "PARTNER") {
        await apiPut(`/api/admin/users/${form.id}/carts`, { cartIds: form.cartIds || [] }, token);
      }

      setMsg("User diperbarui.");
      resetForm();
      await load();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  return (
    <div className="container">
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ margin: 0 }}>User Management</h2>
            <div className="muted">Buat akun PARTNER / CASHIER dan atur akses gerobak.</div>
          </div>
          <button className="btn secondary" onClick={() => nav("/admin/dashboard")}>Kembali</button>
        </div>

        {loading && <div className="muted" style={{ marginTop: 10 }}>Loading...</div>}
        {err && <div className="toast" style={{ background: "#ffecec", borderColor: "#ffbdbd", marginTop: 12 }}>{err}</div>}
        {msg && <div className="toast" style={{ marginTop: 12 }}>{msg}</div>}

        <div className="hr" />

        <h3 style={{ marginTop: 0 }}>{form.id ? "Edit User" : "Tambah User"}</h3>

        <form onSubmit={submit}>
          <div className="row">
            <div className="col">
              <label>Role</label>
              <select className="input" value={form.role} onChange={(e) => setForm(f => ({ ...f, role: e.target.value }))}>
                <option value="PARTNER">PARTNER</option>
                <option value="CASHIER">CASHIER</option>
                <option value="ADMIN">ADMIN (user table)</option>
              </select>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Admin internal via password .env tetap ada. Role ADMIN di sini opsional.
              </div>
            </div>
            <div className="col">
              <label>Status</label>
              <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
                <input type="checkbox" checked={!!form.isActive} onChange={(e) => setForm(f => ({ ...f, isActive: e.target.checked }))} />
                Aktif
              </label>
            </div>
          </div>

          <div className="row" style={{ marginTop: 10 }}>
            <div className="col">
              <label>Nama (opsional)</label>
              <input className="input" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="col">
              <label>Username</label>
              <input className="input" value={form.username} onChange={(e) => setForm(f => ({ ...f, username: e.target.value }))} />
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <label>{form.id ? "Reset Password (kosongkan jika tidak diganti)" : "Password"}</label>
            <input className="input" type="password" value={form.password} onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))} />
          </div>

          {form.role === "CASHIER" ? (
            <div style={{ marginTop: 10 }}>
              <label>Assign Gerobak (Kasir)</label>
              <select className="input" value={form.cartId} onChange={(e) => setForm(f => ({ ...f, cartId: e.target.value }))}>
                <option value="">-- pilih --</option>
                {activeCarts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          ) : null}

          {form.role === "PARTNER" ? (
            <div style={{ marginTop: 10 }}>
              <label>Akses Gerobak (Partner) — bisa multi</label>
              <div className="card" style={{ padding: 12 }}>
                {activeCarts.map(c => (
                  <label key={c.id} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
                    <input
                      type="checkbox"
                      checked={(form.cartIds || []).includes(c.id)}
                      onChange={() => togglePartnerCart(c.id)}
                    />
                    {c.name}
                  </label>
                ))}
                {!activeCarts.length ? <div className="muted">Belum ada gerobak aktif.</div> : null}
              </div>
            </div>
          ) : null}

          <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
            <button className="btn" type="submit">{form.id ? "Simpan" : "Buat User"}</button>
            {form.id ? <button className="btn secondary" type="button" onClick={resetForm}>Batal</button> : null}
          </div>
        </form>

        <div className="hr" />

        <h3>Daftar User</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Role</th>
              <th>Username</th>
              <th>Nama</th>
              <th>Akses</th>
              <th>Status</th>
              <th style={{ width: 160 }}></th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td><span className="badge">{u.role}</span></td>
                <td><b>{u.username}</b></td>
                <td>{u.name || "-"}</td>
                <td className="muted">
                  {u.role === "CASHIER"
                    ? (u.cart?.name || "-")
                    : (u.accessCartNames?.length ? u.accessCartNames.join(", ") : "-")}
                </td>
                <td><span className="badge">{u.isActive ? "ACTIVE" : "INACTIVE"}</span></td>
                <td>
                  <button className="btn secondary" onClick={() => editRow(u)}>Edit</button>
                </td>
              </tr>
            ))}
            {!users.length && <tr><td colSpan={6} className="muted">Belum ada user.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
