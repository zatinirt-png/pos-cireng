import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost, apiPatch, apiPut } from "../api";
import { useNavigate } from "react-router-dom";

export default function AdminUsers() {
  const nav = useNavigate();
  const token = localStorage.getItem("admin_token");

  const [users, setUsers] = useState([]);
  const [carts, setCarts] = useState([]);
  const [showInactive, setShowInactive] = useState(false);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const didLoadRef = useRef(false);

  const [form, setForm] = useState({
    id: "",
    role: "PARTNER",
    name: "",
    username: "",
    password: "",
    isActive: true,
    cartId: "", // CASHIER
    cartIds: [], // PARTNER
  });

  useEffect(() => {
    if (!token) nav("/admin");
  }, [token, nav]);

  const activeCarts = useMemo(
    () => (carts || []).filter((c) => c.isActive !== false),
    [carts]
  );

  async function load({ silent = false } = {}) {
    if (!silent) {
      setErr("");
      setMsg("");
      setLoading(true);
    }
    try {
      const [u, c] = await Promise.all([
        apiGet("/api/admin/users", token),
        apiGet("/api/admin/carts", token),
      ]);
      setUsers(u.users || []);
      setCarts(c.carts || []);
    } catch (e) {
      if (!silent) setErr(e.message || "Gagal load users");
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
      role: "PARTNER",
      name: "",
      username: "",
      password: "",
      isActive: true,
      cartId: "",
      cartIds: [],
    });
  }

  function editItem(u) {
    setMsg("");
    setErr("");
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
    setForm((f) => {
      const set = new Set(f.cartIds || []);
      if (set.has(cid)) set.delete(cid);
      else set.add(cid);
      return { ...f, cartIds: Array.from(set) };
    });
  }

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setMsg("");

    try {
      const payload = {
        role: form.role,
        name: String(form.name || "").trim() || null,
        username: String(form.username || "").trim(),
        password: form.password,
        isActive: !!form.isActive,
      };

      if (!payload.username) throw new Error("Username wajib diisi.");

      if (!form.id) {
        // CREATE
        if (!payload.password || payload.password.length < 4)
          throw new Error("Password minimal 4 karakter.");

        if (payload.role === "CASHIER") {
          if (!form.cartId) throw new Error("Kasir wajib pilih gerobak.");
          payload.cartId = form.cartId;
        }
        if (payload.role === "PARTNER") {
          if (!form.cartIds?.length)
            throw new Error("Partner wajib punya minimal 1 akses gerobak.");
          payload.cartIds = form.cartIds;
        }

        await apiPost("/api/admin/users", payload, token);
        setMsg("User dibuat.");
        resetForm();
        await load({ silent: true });
        return;
      }

      // UPDATE basic
      const updatePayload = {
        name: payload.name,
        username: payload.username,
        isActive: payload.isActive,
      };

      if (payload.password && payload.password.length)
        updatePayload.password = payload.password;

      // cashier can update cartId
      if (payload.role === "CASHIER") updatePayload.cartId = form.cartId || null;

      await apiPatch(`/api/admin/users/${form.id}`, updatePayload, token);

      // partner carts update via separate endpoint
      if (payload.role === "PARTNER") {
        await apiPut(
          `/api/admin/users/${form.id}/carts`,
          { cartIds: form.cartIds || [] },
          token
        );
      }

      setMsg("User diperbarui.");
      resetForm();
      await load({ silent: true });
    } catch (e2) {
      setErr(e2.message || "Gagal simpan user");
    }
  }

  async function quickToggleActive() {
    setErr("");
    setMsg("");
    try {
      if (!form.id) return;
      const next = !form.isActive;
      await apiPatch(`/api/admin/users/${form.id}`, { isActive: next }, token);
      setForm((f) => ({ ...f, isActive: next }));
      setMsg(`User ${next ? "diaktifkan" : "dinonaktifkan"}.`);
      await load({ silent: true });
    } catch (e) {
      setErr(e?.message || "Gagal ubah status user");
    }
  }

  function logout() {
    localStorage.removeItem("admin_token");
    nav("/admin");
  }

  const visibleUsers = showInactive
    ? users
    : (users || []).filter((u) => !!u.isActive);

  return (
    <div className="adm-bg adm adm-users">
      <div className="adm-shell">
        <div className="adm-layout">
          {/* SIDEBAR */}
          <aside className="adm-nav">
            <div className="adm-nav-card">
              <div className="adm-nav-title">Admin</div>
              <div className="adm-nav-sub">Kelola user & akses</div>

              <div className="adm-nav-list">
                <button
                  className="adm-nav-item"
                  type="button"
                  onClick={() => nav("/admin/dashboard")}
                >
                  Live Report
                </button>
                <button
                  className="adm-nav-item"
                  type="button"
                  onClick={() => nav("/admin/products")}
                >
                  Menu
                </button>
                <button
                  className="adm-nav-item"
                  type="button"
                  onClick={() => nav("/admin/promos")}
                >
                  Promo
                </button>
                <button
                  className="adm-nav-item active"
                  type="button"
                  onClick={() => nav("/admin/users")}
                >
                  User Management
                </button>
                <button
                  className="adm-nav-item"
                  type="button"
                  onClick={() => nav("/admin/carts")}
                >
                  Kelola Gerobak
                </button>
                <button
                  className="adm-nav-item"
                  type="button"
                  onClick={() => nav("/admin/reports")}
                >
                  Laporan
                </button>
                <button className="adm-nav-item" type="button" onClick={() => nav("/admin/inventory")}>
                  Stok
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
                  <h2 className="adm-h2">User Management</h2>
                  <div className="adm-subline">
                    <span className="muted">
                      Klik user untuk edit. Aksi ada di panel Edit.
                    </span>
                  </div>
                </div>

                <div className="adm-actions">
                  <button className="btn secondary" type="button" onClick={() => load()}>
                    Refresh
                  </button>
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => nav("/admin/dashboard")}
                  >
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
                <div
                  className="adm-alert"
                  role="alert"
                  aria-live="polite"
                  style={{ marginTop: 12 }}
                >
                  {err}
                </div>
              ) : null}

              {msg ? (
                <div
                  className="adm-alert adm-alert--ok"
                  role="status"
                  aria-live="polite"
                  style={{ marginTop: 12 }}
                >
                  {msg}
                </div>
              ) : null}

              <div className="adm-panels" style={{ marginTop: 14 }}>
                {/* LEFT: FORM */}
                <section className="adm-panel">
                  <div className="adm-panel-head">
                    <h3 className="adm-h3">{form.id ? "Edit User" : "Tambah User"}</h3>
                    {form.id ? <span className="muted">ID: {form.id}</span> : <span className="muted">Create</span>}
                  </div>

                  <form onSubmit={submit} className="adm-form">
                    <div className="adm-form-grid">
                      <div className="adm-field">
                        <label>Role</label>
                        <select
                          className="input"
                          value={form.role}
                          disabled={!!form.id} // role tidak diupdate di backend, jadi kita lock saat edit
                          onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                        >
                          <option value="PARTNER">PARTNER</option>
                          <option value="CASHIER">CASHIER</option>
                          <option value="ADMIN">ADMIN (opsional)</option>
                        </select>
                        {form.id ? (
                          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                            *Role tidak diubah saat edit.
                          </div>
                        ) : (
                          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                            Admin internal via password .env tetap ada. Role ADMIN di sini opsional.
                          </div>
                        )}
                      </div>

                      <div className="adm-field">
                        <label>Status</label>
                        <label className="adm-inline" style={{ marginTop: 10 }}>
                          <input
                            type="checkbox"
                            checked={!!form.isActive}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, isActive: e.target.checked }))
                            }
                          />
                          <span>Aktif</span>
                        </label>
                      </div>
                    </div>

                    <div className="adm-form-grid" style={{ marginTop: 10 }}>
                      <div className="adm-field">
                        <label>Nama (opsional)</label>
                        <input
                          className="input"
                          value={form.name}
                          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        />
                      </div>
                      <div className="adm-field">
                        <label>Username</label>
                        <input
                          className="input"
                          value={form.username}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, username: e.target.value }))
                          }
                        />
                      </div>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <label>
                        {form.id
                          ? "Reset Password (kosongkan jika tidak diganti)"
                          : "Password"}
                      </label>
                      <input
                        className="input"
                        type="password"
                        value={form.password}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, password: e.target.value }))
                        }
                      />
                    </div>

                    {form.role === "CASHIER" ? (
                      <div style={{ marginTop: 10 }}>
                        <label>Assign Gerobak (Kasir)</label>
                        <select
                          className="input"
                          value={form.cartId}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, cartId: e.target.value }))
                          }
                        >
                          <option value="">-- pilih --</option>
                          {activeCarts.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}

                    {form.role === "PARTNER" ? (
                      <div style={{ marginTop: 10 }}>
                        <label>
                          Akses Gerobak (Partner) — multi{" "}
                          <span className="muted">({(form.cartIds || []).length} dipilih)</span>
                        </label>
                        <div className="adm-checklist" role="group" aria-label="Akses gerobak partner">
                          {activeCarts.map((c) => (
                            <label key={c.id} className="adm-check-item">
                              <input
                                type="checkbox"
                                checked={(form.cartIds || []).includes(c.id)}
                                onChange={() => togglePartnerCart(c.id)}
                              />
                              <span>{c.name}</span>
                            </label>
                          ))}
                          {!activeCarts.length ? (
                            <div className="muted">Belum ada gerobak aktif.</div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    <div className="adm-actions-row" style={{ marginTop: 12 }}>
                      <div className="adm-actions-right">
                        <button className="btn" type="submit">
                          {form.id ? "Simpan" : "Buat User"}
                        </button>
                        {form.id ? (
                          <button
                            className="btn secondary"
                            type="button"
                            onClick={resetForm}
                          >
                            Batal
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {form.id ? (
                      <div className="adm-edit-actions">
                        <div className="adm-edit-status">
                          <span className="muted">Status:</span>{" "}
                          <span className={form.isActive ? "adm-badge adm-badge--cash" : "adm-badge"}>
                            {form.isActive ? "ACTIVE" : "INACTIVE"}
                          </span>
                        </div>

                        <div className="adm-edit-buttons">
                          <button
                            className={form.isActive ? "btn danger" : "btn"}
                            type="button"
                            onClick={quickToggleActive}
                          >
                            {form.isActive ? "Nonaktifkan" : "Aktifkan"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </form>
                </section>

                {/* RIGHT: LIST */}
                <section className="adm-panel">
                  <div className="adm-panel-head">
                    <h3 className="adm-h3">Daftar User</h3>
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
                    Klik user untuk edit (aksi ada di panel kiri).
                  </div>

                  <div className="adm-list" role="list">
                    {visibleUsers.map((u) => {
                      const active = !!u.isActive;
                      const access =
                        u.role === "CASHIER"
                          ? (u.cart?.name || "-")
                          : (u.accessCartNames?.length ? u.accessCartNames.join(", ") : "-");

                      return (
                        <div
                          key={u.id}
                          className="adm-list-item"
                          role="listitem"
                          tabIndex={0}
                          onClick={() => editItem(u)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              editItem(u);
                            }
                          }}
                          aria-label={`Edit user ${u.username}`}
                        >
                          <div className="adm-list-top">
                            <div className="adm-list-title" title={u.username}>
                              {u.username}
                            </div>

                            <div className="adm-list-badges">
                              <span className="adm-chip">{u.role}</span>
                              <span className={active ? "adm-badge adm-badge--cash" : "adm-badge"}>
                                {active ? "ACTIVE" : "INACTIVE"}
                              </span>
                            </div>
                          </div>

                          <div className="adm-list-sub">
                            <span className="muted">Nama:</span>{" "}
                            <b>{u.name || "-"}</b>
                          </div>

                          <div className="adm-list-sub">
                            <span className="muted">Akses:</span>{" "}
                            <span className="adm-list-access">{access}</span>
                          </div>
                        </div>
                      );
                    })}

                    {!visibleUsers.length ? (
                      <div className="muted" style={{ padding: 10 }}>
                        Belum ada user.
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
