import React, { useEffect, useRef, useState } from "react";
import { apiGet, apiPost, apiPatch, apiDelete } from "../api";
import { useNavigate } from "react-router-dom";

const CACHE_KEY = "admin_products_cache_v1";
const CACHE_TTL = 30_000; // 30 detik

export default function AdminProducts() {
  const nav = useNavigate();
  const token = localStorage.getItem("admin_token");
  const [showInactive, setShowInactive] = useState(false);

  const didLoadRef = useRef(false);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [form, setForm] = useState({
    id: "",
    sku: "",
    name: "",
    priceSmall: 10000,
    priceLarge: 20000,
    isActive: true,
  });

  useEffect(() => {
    if (!token) nav("/admin");
  }, [token, nav]);

  function readCache() {
    try {
      const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
      if (!c) return null;
      if (Date.now() - c.ts > CACHE_TTL) return null;
      return c.data || null;
    } catch {
      return null;
    }
  }

  function writeCache(data) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
    } catch {}
  }

  async function load({ silent = false } = {}) {
    if (!silent) {
      setErr("");
      setMsg("");
      setLoading(true);
    }

    // 1) tampilkan cache dulu (instant)
    const cached = readCache();
    if (cached && !silent) setItems(cached);

    try {
      const r = await apiGet("/api/admin/products", token);
      const data = r.products || [];
      setItems(data);
      writeCache(data);
    } catch (e) {
      if (!silent) setErr(e.message || "Gagal load products");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    if (didLoadRef.current) return; // cegah double request (StrictMode)
    didLoadRef.current = true;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function resetForm() {
    setForm({ id: "", sku: "", name: "", priceSmall: 10000, priceLarge: 20000, isActive: true });
  }

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setMsg("");

    try {
      const payload = {
        sku: String(form.sku || "").trim(),
        name: String(form.name || "").trim(),
        priceSmall: Number(form.priceSmall || 0),
        priceLarge: Number(form.priceLarge || 0),
        isActive: !!form.isActive,
      };

      if (!payload.sku || !payload.name) throw new Error("SKU dan Nama wajib diisi.");

      if (!form.id) {
        // CREATE: optimistik (tanpa load())
        const res = await apiPost("/api/admin/products", payload, token);
        const created = res?.product;

        setItems((prev) => {
          const next = created ? [created, ...prev] : prev;
          writeCache(next);
          return next;
        });

        setMsg("Produk ditambahkan.");
      } else {
        // UPDATE: update state (tanpa load())
        const res = await apiPatch(`/api/admin/products/${form.id}`, payload, token);
        const updated = res?.product;

        setItems((prev) => {
          const next = prev.map((x) => {
            if (x.id !== form.id) return x;
            return updated ? updated : { ...x, ...payload, id: form.id };
          });
          writeCache(next);
          return next;
        });

        setMsg("Produk diperbarui.");
      }

      resetForm();

      // optional: refresh silent biar sinkron kalau backend punya transform
      load({ silent: true });
    } catch (e2) {
      setErr(e2.message);
    }
  }

  function editRow(p) {
    setMsg("");
    setErr("");
    setForm({
      id: p.id,
      sku: p.sku || "",
      name: p.name || "",
      priceSmall: p.priceSmall ?? 0,
      priceLarge: p.priceLarge ?? 0,
      isActive: !!(p.isActive ?? p.active),
    });
  }

  async function toggleActive(p) {
    setMsg("");
    setErr("");

    try {
      const active = !!(p.isActive ?? p.active);
      const nextActive = !active;

      const res = await apiPatch(`/api/admin/products/${p.id}`, { isActive: nextActive }, token);
      const updated = res?.product;

      setItems((prev) => {
        const next = prev.map((x) => {
          if (x.id !== p.id) return x;
          return updated ? updated : { ...x, isActive: nextActive, active: nextActive };
        });
        writeCache(next);
        return next;
      });

      setMsg(`Produk ${nextActive ? "diaktifkan" : "dinonaktifkan"}.`);

      // optional: refresh silent
      load({ silent: true });
    } catch (e2) {
      setErr(e2.message);
    }
  }

  async function deleteProduct(p) {
    setMsg("");
    setErr("");

    const active = !!(p.isActive ?? p.active);
    if (active) {
      setErr("Nonaktifkan dulu sebelum hapus permanen.");
      return;
    }

    const ok = window.confirm(`Hapus permanen produk "${p.name}"?\nTindakan ini tidak bisa dibatalkan.`);
    if (!ok) return;

    try {
      await apiDelete(`/api/admin/products/${p.id}`, token);

      setItems((prev) => {
        const next = prev.filter((x) => x.id !== p.id);
        writeCache(next);
        return next;
      });

      setMsg("Produk dihapus permanen.");
    } catch (e) {
      setErr(e.message || "Gagal hapus produk");
    }
  }


  return (
    <div className="container">
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ margin: 0 }}>Kelola Menu</h2>
            <div className="muted">Tambah / edit produk untuk menu kasir.</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn secondary" onClick={() => nav("/admin/dashboard")}>Kembali</button>
          </div>
        </div>

        {loading && <div className="toast" style={{ marginTop: 12 }}>Loading...</div>}
        {err && <div className="toast" style={{ background: "#ffecec", borderColor: "#ffbdbd", marginTop: 12 }}>{err}</div>}
        {msg && <div className="toast" style={{ marginTop: 12 }}>{msg}</div>}

        <div className="hr" />

        <h3 style={{ marginTop: 0 }}>{form.id ? "Edit Produk" : "Tambah Produk"}</h3>
        <form onSubmit={submit}>
          <div className="row">
            <div className="col">
              <label>SKU (manual)</label>
              <input className="input" value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} />
            </div>
            <div className="col">
              <label>Nama Produk</label>
              <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
          </div>

          <div className="row" style={{ marginTop: 10 }}>
            <div className="col">
              <label>Harga Kecil</label>
              <input className="input" type="number" value={form.priceSmall} onChange={(e) => setForm((f) => ({ ...f, priceSmall: e.target.value }))} />
            </div>
            <div className="col">
              <label>Harga Besar</label>
              <input className="input" type="number" value={form.priceLarge} onChange={(e) => setForm((f) => ({ ...f, priceLarge: e.target.value }))} />
            </div>
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center" }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={!!form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
              Aktif
            </label>

            <button className="btn" type="submit">{form.id ? "Simpan Perubahan" : "Tambah Produk"}</button>
            {form.id ? <button className="btn secondary" type="button" onClick={resetForm}>Batal</button> : null}
          </div>
        </form>

        <div className="hr" />

        <h3>Daftar Produk</h3>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Tampilkan INACTIVE
          </label>
          <div className="muted" style={{ fontSize: 12 }}>
            Default hanya ACTIVE biar list rapi.
          </div>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Nama</th>
              <th>Harga Kecil</th>
              <th>Harga Besar</th>
              <th>Status</th>
              <th style={{ width: 220 }}></th>
            </tr>
          </thead>
          <tbody>
            {(showInactive ? items : items.filter(p => (p.isActive ?? p.active) !== false)).map((p) => {
              const active = !!(p.isActive ?? p.active);
              return (
                <tr key={p.id}>
                  <td><b>{p.sku}</b></td>
                  <td>{p.name}</td>
                  <td>{p.priceSmall}</td>
                  <td>{p.priceLarge}</td>
                  <td><span className="badge">{active ? "ACTIVE" : "INACTIVE"}</span></td>
                  <td style={{ display: "flex", gap: 8 }}>
                    <button className="btn secondary" onClick={() => editRow(p)}>Edit</button>
                    <button className={active ? "btn danger" : "btn"} onClick={() => toggleActive(p)}>
                      {active ? "Nonaktifkan" : "Aktifkan"}
                    </button>
                    <button
                      className="btn danger"
                      onClick={() => deleteProduct(p)}
                      disabled={!!(p.isActive ?? p.active)}  // hanya bisa jika inactive
                      title={!!(p.isActive ?? p.active) ? "Nonaktifkan dulu untuk bisa hapus permanen" : "Hapus permanen"}
                    >
                      Hapus
                    </button>

                  </td>
                </tr>
              );
            })}
            {!items.length && <tr><td colSpan={6} className="muted">Belum ada produk.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
