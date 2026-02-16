import React, { useEffect, useRef, useState, useMemo } from "react";
import { apiGet, apiPost, apiPatch, apiDelete } from "../api";
import { useNavigate } from "react-router-dom";

const CACHE_KEY = "admin_products_cache_v1";
const CACHE_TTL = 30_000; // 30 detik

function idr(n) {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString("id-ID");
}

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
    setForm({
      id: "",
      sku: "",
      name: "",
      priceSmall: 10000,
      priceLarge: 20000,
      isActive: true,
    });
  }

  const editingProduct = useMemo(() => {
    if (!form.id) return null;
    return items.find((x) => x.id === form.id) || null;
  }, [form.id, items]);

  const editingActive = useMemo(() => {
    if (!editingProduct) return !!form.isActive;
    return !!(editingProduct.isActive ?? editingProduct.active);
  }, [editingProduct, form.isActive]);

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
        const res = await apiPost("/api/admin/products", payload, token);
        const created = res?.product;

        setItems((prev) => {
          const next = created ? [created, ...prev] : prev;
          writeCache(next);
          return next;
        });

        setMsg("Produk ditambahkan.");
      } else {
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
      load({ silent: true });
    } catch (e2) {
      setErr(e2.message);
    }
  }

  function editRow(p) {
    setMsg("");
    setErr("");
    const active = !!(p.isActive ?? p.active);
    setForm({
      id: p.id,
      sku: p.sku || "",
      name: p.name || "",
      priceSmall: p.priceSmall ?? 0,
      priceLarge: p.priceLarge ?? 0,
      isActive: active,
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
      load({ silent: true });
      return nextActive;
    } catch (e2) {
      setErr(e2.message);
      return null;
    }
  }

  async function deleteProduct(p) {
    setMsg("");
    setErr("");

    const active = !!(p.isActive ?? p.active);
    if (active) {
      setErr("Nonaktifkan dulu sebelum hapus permanen.");
      return false;
    }

    const ok = window.confirm(
      `Hapus permanen produk "${p.name}"?\nTindakan ini tidak bisa dibatalkan.`
    );
    if (!ok) return false;

    try {
      await apiDelete(`/api/admin/products/${p.id}`, token);

      setItems((prev) => {
        const next = prev.filter((x) => x.id !== p.id);
        writeCache(next);
        return next;
      });

      setMsg("Produk dihapus permanen.");
      return true;
    } catch (e) {
      setErr(e.message || "Gagal hapus produk");
      return false;
    }
  }

  async function toggleEditingActive() {
    if (!editingProduct) return;
    const nextActive = await toggleActive(editingProduct);
    if (nextActive === null) return;
    setForm((f) => ({ ...f, isActive: !!nextActive }));
  }

  async function deleteEditing() {
    if (!editingProduct) return;
    const ok = await deleteProduct(editingProduct);
    if (ok) resetForm();
  }

  function logout() {
    localStorage.removeItem("admin_token");
    nav("/admin");
  }

  const visibleItems = showInactive
    ? items
    : items.filter((p) => (p.isActive ?? p.active) !== false);

  return (
    <div className="adm-bg adm adm-products">
      <div className="adm-shell">
        <div className="adm-layout">
          {/* SIDEBAR */}
          <aside className="adm-nav">
            <div className="adm-nav-card">
              <div className="adm-nav-title">Admin</div>
              <div className="adm-nav-sub">Kelola data menu</div>

              <div className="adm-nav-list">
                <button className="adm-nav-item" type="button" onClick={() => nav("/admin/dashboard")}>
                  Live Report
                </button>
                <button className="adm-nav-item active" type="button" onClick={() => nav("/admin/products")}>
                  Menu
                </button>
                <button className="adm-nav-item" type="button" onClick={() => nav("/admin/promos")}>
                  Promo
                </button>
                <button className="adm-nav-item" type="button" onClick={() => nav("/admin/users")}>
                  User Management
                </button>
                <button className="adm-nav-item" type="button" onClick={() => nav("/admin/carts")}>
                  Kelola Gerobak
                </button>
                <button className="adm-nav-item" type="button" onClick={() => nav("/admin/reports")}>
                  Laporan
                </button>
              </div>

              <div className="adm-nav-foot">
                <button className="btn secondary" type="button" onClick={logout}>
                  Logout
                </button>
              </div>
            </div>
          </aside>

          {/* MAIN */}
          <main className="adm-main">
            <div className="adm-main-card">
              <div className="adm-header">
                <div>
                  <h2 className="adm-h2">Kelola Menu</h2>
                  <div className="adm-subline">
                    <span className="muted">Klik produk untuk edit. Aksi ada di panel Edit.</span>
                  </div>
                </div>

                <div className="adm-actions">
                  <button className="btn secondary" type="button" onClick={() => load()}>
                    Refresh
                  </button>
                  <button className="btn secondary" type="button" onClick={() => nav("/admin/dashboard")}>
                    Kembali
                  </button>
                </div>
              </div>

              {loading ? <div className="adm-alert" style={{ marginTop: 12 }}>Loading...</div> : null}
              {err ? (
                <div className="adm-alert" role="alert" aria-live="polite" style={{ marginTop: 12 }}>
                  {err}
                </div>
              ) : null}
              {msg ? (
                <div className="adm-alert adm-alert--ok" role="status" aria-live="polite" style={{ marginTop: 12 }}>
                  {msg}
                </div>
              ) : null}

              <div className="adm-panels" style={{ marginTop: 14 }}>
                {/* FORM PANEL */}
                <section className="adm-panel">
                  <div className="adm-panel-head">
                    <h3 className="adm-h3">{form.id ? "Edit Produk" : "Tambah Produk"}</h3>
                    {form.id ? <span className="muted">ID: {form.id}</span> : <span className="muted">Create</span>}
                  </div>

                  <form onSubmit={submit} className="adm-form">
                    <div className="adm-form-grid">
                      <div className="adm-field">
                        <label>SKU (manual)</label>
                        <input
                          className="input"
                          value={form.sku}
                          onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                        />
                      </div>

                      <div className="adm-field">
                        <label>Nama Produk</label>
                        <input
                          className="input"
                          value={form.name}
                          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        />
                      </div>

                      <div className="adm-field">
                        <label>Harga Kecil</label>
                        <input
                          className="input"
                          type="number"
                          value={form.priceSmall}
                          onChange={(e) => setForm((f) => ({ ...f, priceSmall: e.target.value }))}
                        />
                      </div>

                      <div className="adm-field">
                        <label>Harga Besar</label>
                        <input
                          className="input"
                          type="number"
                          value={form.priceLarge}
                          onChange={(e) => setForm((f) => ({ ...f, priceLarge: e.target.value }))}
                        />
                      </div>
                    </div>

                    {/* row actions */}
                    <div className="adm-actions-row">
                      <label className="adm-inline">
                        <input
                          type="checkbox"
                          checked={!!form.isActive}
                          onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                        />
                        <span>Aktif</span>
                      </label>

                      <div className="adm-actions-right">
                        <button className="btn" type="submit">
                          {form.id ? "Simpan Perubahan" : "Tambah Produk"}
                        </button>
                        {form.id ? (
                          <button className="btn secondary" type="button" onClick={resetForm}>
                            Batal
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {/* EXTRA ACTIONS: hanya saat Edit */}
                    {form.id ? (
                      <div className="adm-edit-actions">
                        <div className="adm-edit-status">
                          <span className="muted">Status:</span>{" "}
                          <span className={editingActive ? "adm-badge adm-badge--cash" : "adm-badge"}>
                            {editingActive ? "ACTIVE" : "INACTIVE"}
                          </span>
                        </div>

                        <div className="adm-edit-buttons">
                          <button
                            className={editingActive ? "btn danger" : "btn"}
                            type="button"
                            onClick={toggleEditingActive}
                          >
                            {editingActive ? "Nonaktifkan" : "Aktifkan"}
                          </button>

                          <button
                            className="btn danger"
                            type="button"
                            onClick={deleteEditing}
                            disabled={editingActive}
                            title={editingActive ? "Nonaktifkan dulu untuk bisa hapus permanen" : "Hapus permanen"}
                          >
                            Hapus Permanen
                          </button>
                        </div>

                        <div className="muted" style={{ fontSize: 12 }}>
                          *Hapus permanen hanya bisa jika produk INACTIVE.
                        </div>
                      </div>
                    ) : null}
                  </form>
                </section>

                {/* LIST PANEL */}
                <section className="adm-panel">
                  <div className="adm-panel-head">
                    <h3 className="adm-h3">Daftar Produk</h3>
                    <label className="adm-inline">
                      <input
                        type="checkbox"
                        checked={showInactive}
                        onChange={(e) => setShowInactive(e.target.checked)}
                      />
                      <span>Tampilkan INACTIVE</span>
                    </label>
                  </div>

                  <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                    Klik item untuk edit (aksi ada di panel kiri).
                  </div>

                  <div className="adm-list" role="list">
                    {visibleItems.map((p) => {
                      const active = !!(p.isActive ?? p.active);

                      return (
                        <div
                          key={p.id}
                          className="adm-list-item"
                          role="listitem"
                          tabIndex={0}
                          onClick={() => editRow(p)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              editRow(p);
                            }
                          }}
                          aria-label={`Edit produk ${p.name}`}
                        >
                          <div className="adm-list-top">
                            <div className="adm-list-sku" title={p.sku}>
                              {p.sku}
                            </div>

                            <span className={active ? "adm-badge adm-badge--cash" : "adm-badge"}>
                              {active ? "ACTIVE" : "INACTIVE"}
                            </span>
                          </div>

                          <div className="adm-list-name">{p.name}</div>

                          <div className="adm-list-price">
                            <span className="muted">Kecil</span> <b>{idr(p.priceSmall)}</b>
                            <span className="adm-dot">•</span>
                            <span className="muted">Besar</span> <b>{idr(p.priceLarge)}</b>
                          </div>
                        </div>
                      );
                    })}

                    {!visibleItems.length ? (
                      <div className="muted" style={{ padding: 10 }}>
                        Belum ada produk.
                      </div>
                    ) : null}
                  </div>
                </section>

              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
