import React, { useEffect, useState } from "react";
import { apiGet, apiPost, apiPatch } from "../api";
import { useNavigate } from "react-router-dom";

export default function AdminCarts() {
  const nav = useNavigate();
  const token = localStorage.getItem("admin_token");

  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [form, setForm] = useState({
    id: "",
    name: "",
    isActive: true,
  });

  useEffect(() => {
    if (!token) nav("/admin");
  }, [token, nav]);

  async function load() {
    setErr(""); setMsg("");
    const r = await apiGet("/api/admin/carts", token);
    setItems(r.carts || []);
  }

  useEffect(() => { if (token) load(); }, [token]);

  function resetForm() {
    setForm({ id: "", name: "", isActive: true });
  }

  async function submit(e) {
    e.preventDefault();
    setErr(""); setMsg("");
    try {
      const payload = {
        name: String(form.name || "").trim(),
        isActive: !!form.isActive,
      };
      if (!payload.name) throw new Error("Nama gerobak wajib diisi.");

      if (!form.id) {
        await apiPost("/api/admin/carts", payload, token);
        setMsg("Gerobak ditambahkan.");
      } else {
        await apiPatch(`/api/admin/carts/${form.id}`, payload, token);
        setMsg("Gerobak diperbarui.");
      }

      resetForm();
      await load();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  function editRow(c) {
    setErr(""); setMsg("");
    setForm({
      id: c.id,
      name: c.name || "",
      isActive: !!c.isActive,
    });
  }

  async function toggleActive(c) {
    setErr(""); setMsg("");
    try {
      const next = !c.isActive;
      await apiPatch(`/api/admin/carts/${c.id}`, { isActive: next }, token);
      setMsg(`Gerobak ${next ? "diaktifkan" : "dinonaktifkan"}.`);
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
            <h2 style={{ margin: 0 }}>Kelola Gerobak</h2>
            <div className="muted">Tambah / edit gerobak untuk kasir & mitra.</div>
          </div>
          <button className="btn secondary" onClick={() => nav("/admin/dashboard")}>Kembali</button>
        </div>

        {err && <div className="toast" style={{ background: "#ffecec", borderColor: "#ffbdbd", marginTop: 12 }}>{err}</div>}
        {msg && <div className="toast" style={{ marginTop: 12 }}>{msg}</div>}

        <div className="hr" />

        <h3 style={{ marginTop: 0 }}>{form.id ? "Edit Gerobak" : "Tambah Gerobak"}</h3>
        <form onSubmit={submit}>
          <div className="row">
            <div className="col">
              <label>Nama Gerobak</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="contoh: Gerobak4"
              />
            </div>
            <div className="col" style={{ display: "flex", alignItems: "flex-end" }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                <input
                  type="checkbox"
                  checked={!!form.isActive}
                  onChange={(e) => setForm(f => ({ ...f, isActive: e.target.checked }))}
                />
                Aktif
              </label>
            </div>
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center" }}>
            <button className="btn" type="submit">{form.id ? "Simpan Perubahan" : "Tambah Gerobak"}</button>
            {form.id ? <button className="btn secondary" type="button" onClick={resetForm}>Batal</button> : null}
          </div>
        </form>

        <div className="hr" />

        <h3>Daftar Gerobak</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Nama</th>
              <th>Status</th>
              <th style={{ width: 240 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map(c => (
              <tr key={c.id}>
                <td><b>{c.name}</b></td>
                <td><span className="badge">{c.isActive ? "ACTIVE" : "INACTIVE"}</span></td>
                <td style={{ display: "flex", gap: 8 }}>
                  <button className="btn secondary" onClick={() => editRow(c)}>Edit</button>
                  <button className={c.isActive ? "btn danger" : "btn"} onClick={() => toggleActive(c)}>
                    {c.isActive ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                </td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan={3} className="muted">Belum ada gerobak.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
