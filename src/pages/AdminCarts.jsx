import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost, apiPatch, apiDelete } from "../api";
import { useNavigate } from "react-router-dom";

function fmtLocal(dt) {
  if (!dt) return "";
  try {
    return new Date(dt).toLocaleString("id-ID");
  } catch {
    return String(dt);
  }
}

export default function AdminCarts() {
  const nav = useNavigate();
  const token = localStorage.getItem("admin_token");

  const [carts, setCarts] = useState([]);
  const [showInactive, setShowInactive] = useState(false);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const didLoadRef = useRef(false);

  const [form, setForm] = useState({
    id: "",
    name: "",
    isActive: true,
  });

  useEffect(() => {
    if (!token) nav("/admin");
  }, [token, nav]);

  async function load({ silent = false } = {}) {
    if (!silent) {
      setErr("");
      setMsg("");
      setLoading(true);
    }
    try {
      const r = await apiGet("/api/admin/carts", token);
      setCarts(r.carts || []);
    } catch (e) {
      if (!silent) setErr(e?.message || "Gagal load gerobak");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    if (didLoadRef.current) return; // cegah double load (StrictMode)
    didLoadRef.current = true;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const editingCart = useMemo(() => {
    if (!form.id) return null;
    return (carts || []).find((c) => c.id === form.id) || null;
  }, [form.id, carts]);

  const editingActive = useMemo(() => {
    if (!editingCart) return !!form.isActive;
    return (editingCart.isActive ?? true) !== false;
  }, [editingCart, form.isActive]);

  const visibleCarts = showInactive
    ? carts
    : (carts || []).filter((c) => (c.isActive ?? true) !== false);

  function resetForm() {
    setForm({ id: "", name: "", isActive: true });
  }

  function editItem(c) {
    setErr("");
    setMsg("");
    setForm({
      id: c.id,
      name: c.name || "",
      isActive: (c.isActive ?? true) !== false,
    });
  }

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setMsg("");

    try {
      const name = String(form.name || "").trim();
      if (!name) throw new Error("Nama gerobak wajib diisi.");

      const payload = { name, isActive: !!form.isActive };

      if (!form.id) {
        await apiPost("/api/admin/carts", payload, token);
        setMsg("Gerobak dibuat.");
      } else {
        await apiPatch(`/api/admin/carts/${form.id}`, payload, token);
        setMsg("Gerobak diperbarui.");
      }

      resetForm();
      await load({ silent: true });
    } catch (e2) {
      setErr(e2?.message || "Gagal simpan gerobak");
    }
  }

  async function toggleEditingActive() {
    setErr("");
    setMsg("");
    try {
      if (!editingCart) return;
      const next = !editingActive;
      await apiPatch(`/api/admin/carts/${editingCart.id}`, { isActive: next }, token);
      setForm((f) => ({ ...f, isActive: next }));
      setMsg(`Gerobak ${next ? "diaktifkan" : "dinonaktifkan"}.`);
      await load({ silent: true });
    } catch (e) {
      setErr(e?.message || "Gagal ubah status gerobak");
    }
  }

  async function deleteEditing() {
    setErr("");
    setMsg("");
    try {
      if (!editingCart) return;

      if (editingActive) {
        setErr("Nonaktifkan dulu sebelum hapus permanen.");
        return;
      }

      const ok = window.confirm(
        `Hapus permanen gerobak "${editingCart.name}"?\nTindakan ini tidak bisa dibatalkan.`
      );
      if (!ok) return;

      // OPTIONAL: kalau backend tidak support, kamu bisa hapus tombol ini.
      await apiDelete(`/api/admin/carts/${editingCart.id}`, token);

      setMsg("Gerobak dihapus permanen.");
      resetForm();
      await load({ silent: true });
    } catch (e) {
      setErr(e?.message || "Gagal hapus gerobak (mungkin endpoint belum ada).");
    }
  }

  function logout() {
    localStorage.removeItem("admin_token");
    nav("/admin");
  }

  return (
    <div className="adm-bg adm adm-carts">
      <div className="adm-shell">
        <div className="adm-layout">
          {/* SIDEBAR */}
          <aside className="adm-nav">
            <div className="adm-nav-card">
              <div className="adm-nav-title">Admin</div>
              <div className="adm-nav-sub">Kelola gerobak</div>

              <div className="adm-nav-list">
                <button className="adm-nav-item" type="button" onClick={() => nav("/admin/dashboard")}>
                  Live Report
                </button>
                <button className="adm-nav-item" type="button" onClick={() => nav("/admin/products")}>
                  Menu
                </button>
                <button className="adm-nav-item" type="button" onClick={() => nav("/admin/promos")}>
                  Promo
                </button>
                <button className="adm-nav-item" type="button" onClick={() => nav("/admin/users")}>
                  User Management
                </button>
                <button className="adm-nav-item active" type="button" onClick={() => nav("/admin/carts")}>
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
                  <h2 className="adm-h2">Kelola Gerobak</h2>
                  <div className="adm-subline">
                    <span className="muted">Klik gerobak untuk edit. Aksi ada di panel kiri.</span>
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

              {loading ? (
                <div className="adm-alert" style={{ marginTop: 12 }}>
                  Loading...
                </div>
              ) : null}

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
                {/* LEFT: FORM */}
                <section className="adm-panel">
                  <div className="adm-panel-head">
                    <h3 className="adm-h3">{form.id ? "Edit Gerobak" : "Tambah Gerobak"}</h3>
                    {form.id ? <span className="muted">ID: {form.id}</span> : <span className="muted">Create</span>}
                  </div>

                  <form onSubmit={submit} className="adm-form">
                    <div className="adm-field">
                      <label>Nama Gerobak</label>
                      <input
                        className="input"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="contoh: Gerobak Dipatiukur"
                      />
                    </div>

                    <div className="adm-actions-row" style={{ marginTop: 10 }}>
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
                          {form.id ? "Simpan Perubahan" : "Buat Gerobak"}
                        </button>
                        {form.id ? (
                          <button className="btn secondary" type="button" onClick={resetForm}>
                            Batal
                          </button>
                        ) : null}
                      </div>
                    </div>

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
                            title={
                              editingActive
                                ? "Nonaktifkan dulu untuk bisa hapus permanen"
                                : "Hapus permanen"
                            }
                          >
                            Hapus Permanen
                          </button>
                        </div>

                        <div className="muted" style={{ fontSize: 12 }}>
                          *Hapus permanen hanya bisa jika gerobak INACTIVE. (Jika backend belum support delete, tombol ini akan error dan bisa dihapus.)
                        </div>
                      </div>
                    ) : null}
                  </form>
                </section>

                {/* RIGHT: LIST */}
                <section className="adm-panel">
                  <div className="adm-panel-head">
                    <h3 className="adm-h3">Daftar Gerobak</h3>
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
                    Klik gerobak untuk edit.
                  </div>

                  <div className="adm-list" role="list">
                    {visibleCarts.map((c) => {
                      const active = (c.isActive ?? true) !== false;
                      const meta = c.createdAt ? `Dibuat: ${fmtLocal(c.createdAt)}` : `ID: ${c.id}`;

                      return (
                        <div
                          key={c.id}
                          className="adm-list-item"
                          role="listitem"
                          tabIndex={0}
                          onClick={() => editItem(c)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              editItem(c);
                            }
                          }}
                          aria-label={`Edit gerobak ${c.name}`}
                        >
                          <div className="adm-list-top">
                            <div className="adm-list-title" title={c.name}>
                              {c.name}
                            </div>

                            <span className={active ? "adm-badge adm-badge--cash" : "adm-badge"}>
                              {active ? "ACTIVE" : "INACTIVE"}
                            </span>
                          </div>

                          <div className="adm-list-sub muted">{meta}</div>
                        </div>
                      );
                    })}

                    {!visibleCarts.length ? (
                      <div className="muted" style={{ padding: 10 }}>
                        Belum ada gerobak.
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
