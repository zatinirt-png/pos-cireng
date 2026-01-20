import React, { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, apiPatch } from "../api";
import { useNavigate } from "react-router-dom";

export default function AdminPromos() {
  const nav = useNavigate();
  const token = localStorage.getItem("admin_token");

  const [promos, setPromos] = useState([]);
  const [products, setProducts] = useState([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [form, setForm] = useState({
    id: "",
    name: "",
    type: "DISCOUNT_PERCENT", // DISCOUNT_PERCENT | BONUS_ITEM
    discountPercent: 10,
    minSubtotal: 0,
    bonusProductId: "",
    bonusPortion: "SMALL",
    bonusQty: 1,
    isActive: true,
    startAt: "",
    endAt: "",
  });

  useEffect(() => {
    if (!token) nav("/admin");
  }, [token, nav]);

  async function load() {
    setErr(""); setMsg("");
    const r1 = await apiGet("/api/admin/promos", token);
    const r2 = await apiGet("/api/admin/products", token);
    setPromos(r1.promos || []);
    setProducts(r2.products || []);
  }

  useEffect(() => { if (token) load(); }, [token]);

  const activeProducts = useMemo(
    () => products.filter(p => (p.isActive ?? p.active) !== false),
    [products]
  );

  function resetForm() {
    setForm({
      id: "",
      name: "",
      type: "DISCOUNT_PERCENT",
      discountPercent: 10,
      minSubtotal: 0,
      bonusProductId: "",
      bonusPortion: "SMALL",
      bonusQty: 1,
      isActive: true,
      startAt: "",
      endAt: "",
    });
  }

  async function submit(e) {
    e.preventDefault();
    setErr(""); setMsg("");
    try {
      const payload = {
        name: String(form.name || "").trim(),
        type: form.type,
        discountPercent: Number(form.discountPercent || 0),
        minSubtotal: Number(form.minSubtotal || 0),
        bonusProductId: form.bonusProductId || null,
        bonusPortion: form.bonusPortion || "SMALL",
        bonusQty: Number(form.bonusQty || 0),
        isActive: !!form.isActive,
        startAt: form.startAt ? new Date(form.startAt).toISOString() : null,
        endAt: form.endAt ? new Date(form.endAt).toISOString() : null,
      };

      if (!payload.name) throw new Error("Nama promo wajib.");
      if (!["DISCOUNT_PERCENT", "BONUS_ITEM"].includes(payload.type)) throw new Error("Tipe promo tidak valid.");

      if (payload.type === "DISCOUNT_PERCENT") {
        if (!Number.isFinite(payload.discountPercent) || payload.discountPercent <= 0 || payload.discountPercent > 100) {
          throw new Error("Diskon persen harus 1-100.");
        }
      } else {
        if (!payload.bonusProductId) throw new Error("Bonus product wajib dipilih.");
        if (!Number.isFinite(payload.bonusQty) || payload.bonusQty <= 0) throw new Error("Bonus qty harus > 0.");
      }

      if (!form.id) {
        await apiPost("/api/admin/promos", payload, token);
        setMsg("Promo ditambahkan.");
      } else {
        await apiPatch(`/api/admin/promos/${form.id}`, payload, token);
        setMsg("Promo diperbarui.");
      }

      resetForm();
      await load();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  function editRow(p) {
    setMsg(""); setErr("");
    setForm({
      id: p.id,
      name: p.name || "",
      type: p.type || "DISCOUNT_PERCENT",
      discountPercent: p.discountPercent ?? 0,
      minSubtotal: p.minSubtotal ?? 0,
      bonusProductId: p.bonusProductId || "",
      bonusPortion: p.bonusPortion || "SMALL",
      bonusQty: p.bonusQty ?? 1,
      isActive: !!(p.isActive ?? p.active),
      startAt: p.startAt ? p.startAt.slice(0, 16) : "",
      endAt: p.endAt ? p.endAt.slice(0, 16) : "",
    });
  }

  async function toggleActive(p) {
    setMsg(""); setErr("");
    try {
      const next = !(p.isActive ?? p.active);
      await apiPatch(`/api/admin/promos/${p.id}`, { isActive: next }, token);
      setMsg(`Promo ${next ? "diaktifkan" : "dinonaktifkan"}.`);
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
            <h2 style={{ margin: 0 }}>Kelola Promo</h2>
            <div className="muted">Buat promo diskon persen atau bonus item.</div>
          </div>
          <button className="btn secondary" onClick={() => nav("/admin/dashboard")}>Kembali</button>
        </div>

        {err && <div className="toast" style={{ background: "#ffecec", borderColor: "#ffbdbd", marginTop: 12 }}>{err}</div>}
        {msg && <div className="toast" style={{ marginTop: 12 }}>{msg}</div>}

        <div className="hr" />

        <h3 style={{ marginTop: 0 }}>{form.id ? "Edit Promo" : "Tambah Promo"}</h3>

        <form onSubmit={submit}>
          <label>Nama Promo</label>
          <input className="input" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />

          <div className="row" style={{ marginTop: 10 }}>
            <div className="col">
              <label>Tipe</label>
              <select className="input" value={form.type} onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))}>
                <option value="DISCOUNT_PERCENT">Diskon Persen</option>
                <option value="BONUS_ITEM">Bonus Item</option>
              </select>
            </div>
            <div className="col">
              <label>Minimal Subtotal (Rp)</label>
              <input className="input" type="number" value={form.minSubtotal} onChange={(e) => setForm(f => ({ ...f, minSubtotal: e.target.value }))} />
            </div>
          </div>

          {form.type === "DISCOUNT_PERCENT" ? (
            <div style={{ marginTop: 10 }}>
              <label>Diskon (%)</label>
              <input className="input" type="number" value={form.discountPercent} onChange={(e) => setForm(f => ({ ...f, discountPercent: e.target.value }))} />
            </div>
          ) : (
            <>
              <div className="row" style={{ marginTop: 10 }}>
                <div className="col">
                  <label>Bonus Product</label>
                  <select className="input" value={form.bonusProductId} onChange={(e) => setForm(f => ({ ...f, bonusProductId: e.target.value }))}>
                    <option value="">-- pilih product --</option>
                    {activeProducts.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                    ))}
                  </select>
                </div>
                <div className="col">
                  <label>Portion Bonus</label>
                  <select className="input" value={form.bonusPortion} onChange={(e) => setForm(f => ({ ...f, bonusPortion: e.target.value }))}>
                    <option value="SMALL">SMALL</option>
                    <option value="LARGE">LARGE</option>
                  </select>
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <label>Bonus Qty</label>
                <input className="input" type="number" value={form.bonusQty} onChange={(e) => setForm(f => ({ ...f, bonusQty: e.target.value }))} />
              </div>
            </>
          )}

          <div className="row" style={{ marginTop: 10 }}>
            <div className="col">
              <label>Start (opsional)</label>
              <input className="input" type="datetime-local" value={form.startAt} onChange={(e) => setForm(f => ({ ...f, startAt: e.target.value }))} />
            </div>
            <div className="col">
              <label>End (opsional)</label>
              <input className="input" type="datetime-local" value={form.endAt} onChange={(e) => setForm(f => ({ ...f, endAt: e.target.value }))} />
            </div>
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center" }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={!!form.isActive} onChange={(e) => setForm(f => ({ ...f, isActive: e.target.checked }))} />
              Aktif
            </label>
            <button className="btn" type="submit">{form.id ? "Simpan Perubahan" : "Tambah Promo"}</button>
            {form.id ? <button className="btn secondary" type="button" onClick={resetForm}>Batal</button> : null}
          </div>
        </form>

        <div className="hr" />

        <h3>Daftar Promo</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Nama</th>
              <th>Tipe</th>
              <th>Rule</th>
              <th>Status</th>
              <th style={{ width: 220 }}></th>
            </tr>
          </thead>
          <tbody>
            {promos.map(p => {
              const active = !!(p.isActive ?? p.active);
              const rule = p.type === "DISCOUNT_PERCENT"
                ? `${p.discountPercent || 0}%`
                : `BONUS x${p.bonusQty || 0}`;
              return (
                <tr key={p.id}>
                  <td><b>{p.name}</b></td>
                  <td>{p.type}</td>
                  <td>{rule}</td>
                  <td><span className="badge">{active ? "ACTIVE" : "INACTIVE"}</span></td>
                  <td style={{ display: "flex", gap: 8 }}>
                    <button className="btn secondary" onClick={() => editRow(p)}>Buka</button>
                    <button className={active ? "btn danger" : "btn"} onClick={() => toggleActive(p)}>
                      {active ? "Nonaktifkan" : "Aktifkan"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {!promos.length && <tr><td colSpan={5} className="muted">Belum ada promo.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
