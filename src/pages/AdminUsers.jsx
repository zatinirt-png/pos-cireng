import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost, apiPatch, apiPut } from "../api";
import { useNavigate } from "react-router-dom";

function roleLabel(role) {
  if (role === "ADMIN") return "Admin";
  if (role === "CASHIER") return "Kasir";
  if (role === "PARTNER") return "Mitra";
  return role || "-";
}

function roleDescription(role) {
  if (role === "ADMIN") return "Akses pengelolaan operasional.";
  if (role === "CASHIER") return "Akses transaksi dan shift gerobak.";
  if (role === "PARTNER") return "Akses pemantauan gerobak tertentu.";
  return "-";
}

function getAccessLabel(user) {
  if (!user) return "-";

  if (user.role === "CASHIER") {
    return user.cart?.name || user.cartName || "-";
  }

  if (user.role === "PARTNER") {
    if (Array.isArray(user.accessCartNames) && user.accessCartNames.length) {
      return user.accessCartNames.join(", ");
    }

    if (Array.isArray(user.carts) && user.carts.length) {
      return user.carts.map((cart) => cart.name).filter(Boolean).join(", ");
    }

    return "-";
  }

  return "Semua akses admin";
}

function sortUsers(rows) {
  const roleOrder = {
    ADMIN: 1,
    CASHIER: 2,
    PARTNER: 3,
  };

  return [...(rows || [])].sort((a, b) => {
    const activeA = a.isActive ? 0 : 1;
    const activeB = b.isActive ? 0 : 1;

    if (activeA !== activeB) return activeA - activeB;

    const roleA = roleOrder[a.role] || 99;
    const roleB = roleOrder[b.role] || 99;

    if (roleA !== roleB) return roleA - roleB;

    return String(a.username || "").localeCompare(String(b.username || ""));
  });
}

function StatCard({ label, value, note }) {
  return (
    <section className="adm-panel adm-panel--kpi">
      <div className="adm-kpi-label">{label}</div>
      <div className="adm-kpi-value">{value}</div>
      {note ? <div className="adm-kpi-hint">{note}</div> : null}
    </section>
  );
}

export default function AdminUsers() {
  const nav = useNavigate();
  const token = localStorage.getItem("admin_token");

  const didLoadRef = useRef(false);

  const [users, setUsers] = useState([]);
  const [carts, setCarts] = useState([]);
  const [showInactive, setShowInactive] = useState(false);

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
    cartId: "",
    cartIds: [],
  });

  useEffect(() => {
    if (!token) nav("/admin");
  }, [token, nav]);

  const activeCarts = useMemo(() => {
    return (carts || []).filter((cart) => cart.isActive !== false);
  }, [carts]);

  const editingUser = useMemo(() => {
    if (!form.id) return null;
    return (users || []).find((user) => user.id === form.id) || null;
  }, [form.id, users]);

  const visibleUsers = useMemo(() => {
    const rows = showInactive ? users || [] : (users || []).filter((user) => !!user.isActive);
    return sortUsers(rows);
  }, [users, showInactive]);

  const userStats = useMemo(() => {
    const rows = users || [];

    let active = 0;
    let inactive = 0;
    let admin = 0;
    let cashier = 0;
    let partner = 0;

    rows.forEach((user) => {
      if (user.isActive) active += 1;
      else inactive += 1;

      if (user.role === "ADMIN") admin += 1;
      if (user.role === "CASHIER") cashier += 1;
      if (user.role === "PARTNER") partner += 1;
    });

    return {
      total: rows.length,
      active,
      inactive,
      admin,
      cashier,
      partner,
    };
  }, [users]);

  async function load({ silent = false } = {}) {
    if (!silent) {
      setErr("");
      setMsg("");
      setLoading(true);
    }

    try {
      const [userResponse, cartResponse] = await Promise.all([
        apiGet("/api/admin/users", token),
        apiGet("/api/admin/carts", token),
      ]);

      setUsers(userResponse.users || []);
      setCarts(cartResponse.carts || []);
    } catch (error) {
      if (!silent) setErr(error?.message || "Gagal load users");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    if (didLoadRef.current) return;

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

  function editItem(user) {
    setMsg("");
    setErr("");

    setForm({
      id: user.id,
      role: user.role,
      name: user.name || "",
      username: user.username || "",
      password: "",
      isActive: !!user.isActive,
      cartId: user.cartId || "",
      cartIds: user.accessCartIds || [],
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function togglePartnerCart(cartId) {
    setForm((current) => {
      const selected = new Set(current.cartIds || []);

      if (selected.has(cartId)) selected.delete(cartId);
      else selected.add(cartId);

      return {
        ...current,
        cartIds: Array.from(selected),
      };
    });
  }

  async function submit(event) {
    event.preventDefault();

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

      if (!payload.username) {
        throw new Error("Username wajib diisi.");
      }

      if (!form.id) {
        if (!payload.password || payload.password.length < 4) {
          throw new Error("Password minimal 4 karakter.");
        }

        if (payload.role === "CASHIER") {
          if (!form.cartId) throw new Error("Kasir wajib pilih gerobak.");
          payload.cartId = form.cartId;
        }

        if (payload.role === "PARTNER") {
          if (!form.cartIds?.length) {
            throw new Error("Partner wajib punya minimal 1 akses gerobak.");
          }

          payload.cartIds = form.cartIds;
        }

        await apiPost("/api/admin/users", payload, token);

        setMsg("User dibuat.");
        resetForm();
        await load({ silent: true });
        return;
      }

      const updatePayload = {
        name: payload.name,
        username: payload.username,
        isActive: payload.isActive,
      };

      if (payload.password && payload.password.length) {
        updatePayload.password = payload.password;
      }

      if (payload.role === "CASHIER") {
        updatePayload.cartId = form.cartId || null;
      }

      await apiPatch(`/api/admin/users/${form.id}`, updatePayload, token);

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
    } catch (error) {
      setErr(error?.message || "Gagal simpan user");
    }
  }

  async function quickToggleActive() {
    setErr("");
    setMsg("");

    try {
      if (!form.id) return;

      const next = !form.isActive;

      await apiPatch(`/api/admin/users/${form.id}`, { isActive: next }, token);

      setForm((current) => ({
        ...current,
        isActive: next,
      }));

      setMsg(`User ${next ? "diaktifkan" : "dinonaktifkan"}.`);

      await load({ silent: true });
    } catch (error) {
      setErr(error?.message || "Gagal ubah status user");
    }
  }

  return (
    <main className="adm-bg adm adm-users">
      <div className="adm-shell">
        <section className="adm-main-card">
          <div className="adm-header">
            <div>
              <h2 className="adm-h2">Kelola User</h2>

              <div className="adm-subline">
                <span>Tambah user, atur role, status, dan akses gerobak.</span>
              </div>
            </div>

            <div className="adm-actions">
              <button className="btn secondary" type="button" onClick={() => load()}>
                Refresh
              </button>

              <button
                className="btn secondary"
                type="button"
                onClick={() => nav("/admin/carts")}
              >
                Gerobak
              </button>

              <button
                className="btn secondary"
                type="button"
                onClick={() => nav("/admin/dashboard")}
              >
                Dashboard
              </button>
            </div>
          </div>

          <div className="hr" />

          {loading ? (
            <div className="adm-alert" style={{ marginBottom: 12 }}>
              <span className="loading-inline">
                <span className="spinner spinner--sm" aria-hidden="true" />
                Memuat user...
              </span>
            </div>
          ) : null}

          {err ? (
            <div
              className="adm-alert"
              role="alert"
              aria-live="polite"
              style={{ marginBottom: 12 }}
            >
              {err}
            </div>
          ) : null}

          {msg ? (
            <div
              className="adm-alert adm-alert--ok"
              role="status"
              aria-live="polite"
              style={{ marginBottom: 12 }}
            >
              {msg}
            </div>
          ) : null}

          <div className="adm-panels">
            <StatCard label="Total User" value={userStats.total} note="Semua role." />
            <StatCard label="Aktif" value={userStats.active} note="User yang bisa login." />
            <StatCard label="Kasir" value={userStats.cashier} note="Akses transaksi." />
            <StatCard label="Mitra" value={userStats.partner} note="Akses pantau gerobak." />
          </div>

          <div className="adm-panels" style={{ marginTop: 14 }}>
            <section className="adm-panel">
              <div className="adm-panel-head">
                <div>
                  <h3 className="adm-h3">{form.id ? "Edit User" : "Tambah User"}</h3>

                  <div className="card-subtitle">
                    {form.id
                      ? "Ubah data user yang dipilih."
                      : "Buat akses baru untuk kasir, mitra, atau admin."}
                  </div>
                </div>

                {form.id ? <span className="badge">Edit</span> : <span className="badge">Baru</span>}
              </div>

              <form onSubmit={submit} className="adm-form" style={{ marginTop: 14 }}>
                <div className="adm-form-grid">
                  <div className="adm-field">
                    <label htmlFor="user-role">Role</label>

                    <select
                      id="user-role"
                      className="input"
                      value={form.role}
                      disabled={!!form.id}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          role: event.target.value,
                          cartId: "",
                          cartIds: [],
                        }))
                      }
                    >
                      <option value="PARTNER">PARTNER</option>
                      <option value="CASHIER">CASHIER</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>

                    <div className="field-hint">
                      {form.id
                        ? "Role tidak diubah saat edit."
                        : roleDescription(form.role)}
                    </div>
                  </div>

                  <div className="adm-field">
                    <label>Status User</label>

                    <label className="check-card">
                      <input
                        type="checkbox"
                        checked={!!form.isActive}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            isActive: event.target.checked,
                          }))
                        }
                      />

                      <div className="check-card__body">
                        <span className="check-card__title">User aktif</span>
                        <span className="check-card__sub">
                          Jika aktif, user bisa login sesuai role.
                        </span>
                      </div>

                      <span className={`check-state ${form.isActive ? "active" : "inactive"}`}>
                        {form.isActive ? "ACTIVE" : "INACTIVE"}
                      </span>
                    </label>
                  </div>
                </div>

                <div className="adm-form-grid">
                  <div className="adm-field">
                    <label htmlFor="user-name">Nama</label>

                    <input
                      id="user-name"
                      className="input"
                      value={form.name}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder="Opsional"
                    />
                  </div>

                  <div className="adm-field">
                    <label htmlFor="user-username">Username</label>

                    <input
                      id="user-username"
                      className="input"
                      value={form.username}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          username: event.target.value,
                        }))
                      }
                      placeholder="Contoh: kasir_du"
                    />
                  </div>
                </div>

                <div className="adm-field">
                  <label htmlFor="user-password">
                    {form.id ? "Reset Password" : "Password"}
                  </label>

                  <input
                    id="user-password"
                    className="input"
                    type="password"
                    value={form.password}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        password: event.target.value,
                      }))
                    }
                    placeholder={form.id ? "Kosongkan jika tidak diganti" : "Minimal 4 karakter"}
                  />

                  <div className="field-hint">
                    {form.id
                      ? "Isi hanya jika ingin mengganti password."
                      : "Password minimal 4 karakter."}
                  </div>
                </div>

                {form.role === "CASHIER" ? (
                  <section className="adm-panel" style={{ marginTop: 4 }}>
                    <div className="adm-panel-head">
                      <div>
                        <h3 className="adm-h3">Akses Kasir</h3>
                        <div className="card-subtitle">
                          Satu kasir hanya terhubung ke satu gerobak.
                        </div>
                      </div>

                      <span className="badge">Kasir</span>
                    </div>

                    <div className="adm-field" style={{ marginTop: 12 }}>
                      <label htmlFor="cashier-cart">Assign Gerobak</label>

                      <select
                        id="cashier-cart"
                        className="input"
                        value={form.cartId}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            cartId: event.target.value,
                          }))
                        }
                      >
                        <option value="">Pilih gerobak</option>

                        {activeCarts.map((cart) => (
                          <option key={cart.id} value={cart.id}>
                            {cart.name}
                          </option>
                        ))}
                      </select>

                      {!activeCarts.length ? (
                        <div className="field-hint">Belum ada gerobak aktif.</div>
                      ) : null}
                    </div>
                  </section>
                ) : null}

                {form.role === "PARTNER" ? (
                  <section className="adm-panel" style={{ marginTop: 4 }}>
                    <div className="adm-panel-head">
                      <div>
                        <h3 className="adm-h3">Akses Mitra</h3>
                        <div className="card-subtitle">
                          Pilih gerobak yang boleh dipantau oleh mitra.
                        </div>
                      </div>

                      <span className="badge">{(form.cartIds || []).length} dipilih</span>
                    </div>

                    <div
                      className="adm-list"
                      role="group"
                      aria-label="Akses gerobak partner"
                      style={{ marginTop: 12 }}
                    >
                      {activeCarts.map((cart) => (
                        <label key={cart.id} className="check-compact">
                          <input
                            type="checkbox"
                            checked={(form.cartIds || []).includes(cart.id)}
                            onChange={() => togglePartnerCart(cart.id)}
                          />

                          <span>{cart.name}</span>
                        </label>
                      ))}

                      {!activeCarts.length ? (
                        <div className="adm-list-item">
                          <div className="adm-list-name">Belum ada gerobak aktif.</div>
                          <div className="muted">Tambahkan gerobak aktif terlebih dahulu.</div>
                        </div>
                      ) : null}
                    </div>
                  </section>
                ) : null}

                <div className="adm-actions-row">
                  <div>
                    {form.id ? (
                      <div className="adm-edit-status">
                        <span className="muted">Status sekarang:</span>

                        <span className={form.isActive ? "adm-badge adm-badge--cash" : "adm-badge"}>
                          {form.isActive ? "ACTIVE" : "INACTIVE"}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <div className="adm-actions-right">
                    {form.id ? (
                      <>
                        <button
                          className={form.isActive ? "btn danger" : "btn"}
                          type="button"
                          onClick={quickToggleActive}
                        >
                          {form.isActive ? "Nonaktifkan" : "Aktifkan"}
                        </button>

                        <button className="btn secondary" type="button" onClick={resetForm}>
                          Batal
                        </button>
                      </>
                    ) : null}

                    <button className="btn" type="submit">
                      {form.id ? "Simpan Perubahan" : "Buat User"}
                    </button>
                  </div>
                </div>

                {form.id ? (
                  <div className="field-hint">
                    User sedang diedit: <b>{editingUser?.username || form.username}</b>
                  </div>
                ) : null}
              </form>
            </section>

            <section className="adm-panel">
              <div className="adm-panel-head">
                <div>
                  <h3 className="adm-h3">Daftar User</h3>
                  <div className="card-subtitle">Klik user untuk masuk mode edit.</div>
                </div>

                <label className="check-compact">
                  <input
                    type="checkbox"
                    checked={showInactive}
                    onChange={(event) => setShowInactive(event.target.checked)}
                  />

                  <span>Tampilkan inactive</span>
                </label>
              </div>

              <div className="adm-list" role="list" style={{ marginTop: 14 }}>
                {visibleUsers.map((user) => {
                  const active = !!user.isActive;
                  const access = getAccessLabel(user);

                  return (
                    <button
                      key={user.id}
                      type="button"
                      className="adm-list-item"
                      role="listitem"
                      onClick={() => editItem(user)}
                      style={{ textAlign: "left", cursor: "pointer" }}
                      aria-label={`Edit user ${user.username}`}
                    >
                      <div className="adm-list-top" style={{ alignItems: "center" }}>
                        <div>
                          <div className="adm-list-title" title={user.username}>
                            {user.username}
                          </div>

                          <div className="adm-list-meta" style={{ marginTop: 6 }}>
                            <span className="muted">Nama:</span>{" "}
                            <b>{user.name || "-"}</b>
                          </div>
                        </div>

                        <div className="adm-list-badges">
                          <span className="adm-chip">{roleLabel(user.role)}</span>

                          <span className={active ? "adm-badge adm-badge--cash" : "adm-badge"}>
                            {active ? "ACTIVE" : "INACTIVE"}
                          </span>
                        </div>
                      </div>

                      <div className="adm-list-rule" style={{ marginTop: 10 }}>
                        {roleDescription(user.role)}
                      </div>

                      <div className="adm-list-window muted" style={{ marginTop: 8 }}>
                        <span>Akses:</span>
                        <span>{access}</span>
                      </div>
                    </button>
                  );
                })}

                {!visibleUsers.length ? (
                  <div className="adm-list-item">
                    <div className="adm-list-name">Belum ada user.</div>
                    <div className="muted">Tambahkan user dari form di sebelah kiri.</div>
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}