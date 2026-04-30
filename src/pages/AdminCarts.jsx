import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost, apiPatch, apiDelete, apiPut } from "../api";
import { useNavigate } from "react-router-dom";

function fmtLocal(dt) {
  if (!dt) return "-";

  try {
    return new Date(dt).toLocaleString("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return String(dt);
  }
}

function idr(n) {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return "Rp 0";
  return "Rp " + v.toLocaleString("id-ID");
}

function activeState(value) {
  return (value ?? true) !== false;
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

export default function AdminCarts() {
  const nav = useNavigate();
  const token = localStorage.getItem("admin_token");

  const didLoadRef = useRef(false);

  const [carts, setCarts] = useState([]);
  const [showInactive, setShowInactive] = useState(false);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [menuItems, setMenuItems] = useState([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuBusy, setMenuBusy] = useState(false);
  const [menuErr, setMenuErr] = useState("");
  const [menuMsg, setMenuMsg] = useState("");
  const [showInactiveMenus, setShowInactiveMenus] = useState(false);

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
      const response = await apiGet("/api/admin/carts", token);
      setCarts(response.carts || []);
    } catch (error) {
      if (!silent) setErr(error?.message || "Gagal load gerobak.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function loadMenuPrices(cartId, { silent = false } = {}) {
    if (!token || !cartId) return;

    if (!silent) {
      setMenuErr("");
      setMenuMsg("");
      setMenuLoading(true);
    }

    try {
      const response = await apiGet(`/api/admin/carts/${cartId}/menu-prices`, token);

      const rows = (response.items || []).map((item) => ({
        ...item,
        priceSmallOverrideInput:
          item.priceSmallOverride == null ? "" : String(item.priceSmallOverride),
        priceLargeOverrideInput:
          item.priceLargeOverride == null ? "" : String(item.priceLargeOverride),
      }));

      setMenuItems(rows);
    } catch (error) {
      if (!silent) setMenuErr(error?.message || "Gagal load harga menu gerobak.");
      setMenuItems([]);
    } finally {
      if (!silent) setMenuLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    if (didLoadRef.current) return;

    didLoadRef.current = true;
    load();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token) return;

    if (!form.id) {
      setMenuItems([]);
      setMenuErr("");
      setMenuMsg("");
      setMenuLoading(false);
      return;
    }

    loadMenuPrices(form.id);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.id, token]);

  const editingCart = useMemo(() => {
    if (!form.id) return null;
    return (carts || []).find((cart) => cart.id === form.id) || null;
  }, [form.id, carts]);

  const editingActive = useMemo(() => {
    if (!editingCart) return !!form.isActive;
    return activeState(editingCart.isActive);
  }, [editingCart, form.isActive]);

  const visibleCarts = useMemo(() => {
    const rows = showInactive
      ? carts || []
      : (carts || []).filter((cart) => activeState(cart.isActive));

    return [...rows].sort((a, b) => {
      const activeA = activeState(a.isActive) ? 0 : 1;
      const activeB = activeState(b.isActive) ? 0 : 1;

      if (activeA !== activeB) return activeA - activeB;

      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }, [carts, showInactive]);

  const visibleMenuItems = useMemo(() => {
    const list = menuItems || [];

    const rows = showInactiveMenus
      ? list
      : list.filter((item) => activeState(item.isActive));

    return [...rows].sort((a, b) => {
      const activeA = activeState(a.isActive) ? 0 : 1;
      const activeB = activeState(b.isActive) ? 0 : 1;

      if (activeA !== activeB) return activeA - activeB;

      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }, [menuItems, showInactiveMenus]);

  const cartStats = useMemo(() => {
    const rows = carts || [];

    let active = 0;
    let inactive = 0;

    rows.forEach((cart) => {
      if (activeState(cart.isActive)) active += 1;
      else inactive += 1;
    });

    return {
      total: rows.length,
      active,
      inactive,
    };
  }, [carts]);

  const selectedCartLabel = editingCart?.name || form.name || "-";

  function resetForm() {
    setForm({
      id: "",
      name: "",
      isActive: true,
    });

    setMenuItems([]);
    setMenuErr("");
    setMenuMsg("");
  }

  function editItem(cart) {
    setErr("");
    setMsg("");
    setMenuErr("");
    setMenuMsg("");

    setForm({
      id: cart.id,
      name: cart.name || "",
      isActive: activeState(cart.isActive),
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function patchMenuRow(productId, patch) {
    setMenuItems((prev) =>
      prev.map((row) =>
        row.productId === productId
          ? {
              ...row,
              ...patch,
            }
          : row
      )
    );
  }

  function resetMenuRow(productId) {
    setMenuItems((prev) =>
      prev.map((row) =>
        row.productId === productId
          ? {
              ...row,
              priceSmallOverrideInput: "",
              priceLargeOverrideInput: "",
              priceSmallOverride: null,
              priceLargeOverride: null,
              effectivePriceSmall: Number(row.defaultPriceSmall || 0),
              effectivePriceLarge: Number(row.defaultPriceLarge || 0),
              hasPriceOverride: false,
            }
          : row
      )
    );
  }

  async function submit(event) {
    event.preventDefault();

    setErr("");
    setMsg("");

    try {
      const name = String(form.name || "").trim();

      if (!name) {
        throw new Error("Nama gerobak wajib diisi.");
      }

      const payload = {
        name,
        isActive: !!form.isActive,
      };

      if (!form.id) {
        await apiPost("/api/admin/carts", payload, token);
        setMsg("Gerobak dibuat.");
      } else {
        await apiPatch(`/api/admin/carts/${form.id}`, payload, token);
        setMsg("Gerobak diperbarui.");
      }

      resetForm();
      await load({ silent: true });
    } catch (error) {
      setErr(error?.message || "Gagal simpan gerobak.");
    }
  }

  async function saveMenuPrices() {
    setMenuErr("");
    setMenuMsg("");

    try {
      if (!form.id) throw new Error("Pilih gerobak dulu.");

      setMenuBusy(true);

      const payload = {
        items: (menuItems || []).map((row) => ({
          productId: row.productId,
          priceSmallOverride: String(row.priceSmallOverrideInput || "").trim(),
          priceLargeOverride: String(row.priceLargeOverrideInput || "").trim(),
        })),
      };

      await apiPut(`/api/admin/carts/${form.id}/menu-prices`, payload, token);

      await loadMenuPrices(form.id, { silent: true });

      setMenuMsg("Harga menu gerobak berhasil disimpan.");
    } catch (error) {
      setMenuErr(error?.message || "Gagal simpan harga menu gerobak.");
    } finally {
      setMenuBusy(false);
    }
  }

  async function toggleEditingActive() {
    setErr("");
    setMsg("");

    try {
      if (!editingCart) return;

      const next = !editingActive;

      await apiPatch(`/api/admin/carts/${editingCart.id}`, { isActive: next }, token);

      setForm((current) => ({
        ...current,
        isActive: next,
      }));

      setMsg(`Gerobak ${next ? "diaktifkan" : "dinonaktifkan"}.`);

      await load({ silent: true });
    } catch (error) {
      setErr(error?.message || "Gagal ubah status gerobak.");
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

      await apiDelete(`/api/admin/carts/${editingCart.id}`, token);

      setMsg("Gerobak dihapus permanen.");

      resetForm();
      await load({ silent: true });
    } catch (error) {
      setErr(error?.message || "Gagal hapus gerobak.");
    }
  }

  function getSmallPreview(row) {
    const override = String(row.priceSmallOverrideInput || "").trim();

    if (!override) return Number(row.defaultPriceSmall || 0);

    return Number(override || 0);
  }

  function getLargePreview(row) {
    const override = String(row.priceLargeOverrideInput || "").trim();

    if (!override) return Number(row.defaultPriceLarge || 0);

    return Number(override || 0);
  }

  return (
    <main className="adm-bg adm adm-carts">
      <div className="adm-shell">
        <section className="adm-main-card">
          <div className="adm-header">
            <div>
              <h2 className="adm-h2">Kelola Gerobak</h2>

              <div className="adm-subline">
                <span>Tambah gerobak, ubah status, dan atur harga menu khusus gerobak.</span>
              </div>
            </div>

            <div className="adm-actions">
              <button className="btn secondary" type="button" onClick={() => load()}>
                Refresh
              </button>

              <button
                className="btn secondary"
                type="button"
                onClick={() => nav("/admin/users")}
              >
                User
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
                Memuat gerobak...
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
            <StatCard label="Total Gerobak" value={cartStats.total} note="Semua data gerobak." />
            <StatCard label="Aktif" value={cartStats.active} note="Bisa dipakai operasional." />
            <StatCard label="Nonaktif" value={cartStats.inactive} note="Tidak tampil untuk operasional." />
            <StatCard
              label="Terpilih"
              value={form.id ? "1" : "0"}
              note={form.id ? selectedCartLabel : "Belum memilih gerobak."}
            />
          </div>

          <div className="adm-panels" style={{ marginTop: 14 }}>
            <section className="adm-panel">
              <div className="adm-panel-head">
                <div>
                  <h3 className="adm-h3">{form.id ? "Edit Gerobak" : "Tambah Gerobak"}</h3>

                  <div className="card-subtitle">
                    {form.id
                      ? "Ubah nama dan status gerobak."
                      : "Buat gerobak baru untuk operasional kasir."}
                  </div>
                </div>

                {form.id ? <span className="badge">Edit</span> : <span className="badge">Baru</span>}
              </div>

              <form onSubmit={submit} className="adm-form" style={{ marginTop: 14 }}>
                <div className="adm-field">
                  <label htmlFor="cart-name">Nama Gerobak</label>

                  <input
                    id="cart-name"
                    className="input"
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Contoh: Gerobak Dipatiukur"
                  />

                  <div className="field-hint">
                    Gunakan nama yang mudah dikenali oleh admin dan kasir.
                  </div>
                </div>

                <div className="adm-field">
                  <label>Status Gerobak</label>

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
                      <span className="check-card__title">Gerobak aktif</span>
                      <span className="check-card__sub">
                        Jika aktif, gerobak bisa dipakai untuk akun kasir dan operasional.
                      </span>
                    </div>

                    <span className={`check-state ${form.isActive ? "active" : "inactive"}`}>
                      {form.isActive ? "ACTIVE" : "INACTIVE"}
                    </span>
                  </label>
                </div>

                <div className="adm-actions-row">
                  <div>
                    {form.id ? (
                      <div className="adm-edit-status">
                        <span className="muted">Status sekarang:</span>

                        <span className={editingActive ? "adm-badge adm-badge--cash" : "adm-badge"}>
                          {editingActive ? "ACTIVE" : "INACTIVE"}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <div className="adm-actions-right">
                    {form.id ? (
                      <>
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
                          Hapus
                        </button>

                        <button className="btn secondary" type="button" onClick={resetForm}>
                          Batal
                        </button>
                      </>
                    ) : null}

                    <button className="btn" type="submit">
                      {form.id ? "Simpan Perubahan" : "Buat Gerobak"}
                    </button>
                  </div>
                </div>

                {form.id ? (
                  <div className="field-hint">
                    Hapus permanen hanya bisa dilakukan saat gerobak sudah INACTIVE.
                  </div>
                ) : null}
              </form>
            </section>

            <section className="adm-panel">
              <div className="adm-panel-head">
                <div>
                  <h3 className="adm-h3">Daftar Gerobak</h3>
                  <div className="card-subtitle">Klik gerobak untuk masuk mode edit.</div>
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
                {visibleCarts.map((cart) => {
                  const active = activeState(cart.isActive);
                  const selected = form.id === cart.id;

                  return (
                    <button
                      key={cart.id}
                      type="button"
                      className="adm-list-item"
                      role="listitem"
                      onClick={() => editItem(cart)}
                      style={{
                        textAlign: "left",
                        cursor: "pointer",
                        borderColor: selected ? "rgba(201, 111, 76, 0.36)" : undefined,
                        background: selected ? "var(--primary-soft)" : undefined,
                      }}
                      aria-label={`Edit gerobak ${cart.name}`}
                    >
                      <div className="adm-list-top" style={{ alignItems: "center" }}>
                        <div>
                          <div className="adm-list-title" title={cart.name}>
                            {cart.name}
                          </div>

                          <div className="adm-list-meta" style={{ marginTop: 6 }}>
                            {cart.createdAt ? `Dibuat: ${fmtLocal(cart.createdAt)}` : `ID: ${cart.id}`}
                          </div>
                        </div>

                        <div className="adm-list-badges">
                          {selected ? <span className="adm-chip">Dipilih</span> : null}

                          <span className={active ? "adm-badge adm-badge--cash" : "adm-badge"}>
                            {active ? "ACTIVE" : "INACTIVE"}
                          </span>
                        </div>
                      </div>

                      <div className="adm-list-rule" style={{ marginTop: 10 }}>
                        {active
                          ? "Gerobak aktif untuk operasional."
                          : "Gerobak nonaktif dan tidak digunakan operasional."}
                      </div>
                    </button>
                  );
                })}

                {!visibleCarts.length ? (
                  <div className="adm-list-item">
                    <div className="adm-list-name">Belum ada gerobak.</div>
                    <div className="muted">Tambahkan gerobak dari form di sebelah kiri.</div>
                  </div>
                ) : null}
              </div>
            </section>
          </div>

          <section className="adm-panel" style={{ marginTop: 14 }}>
            <div className="adm-panel-head">
              <div>
                <h3 className="adm-h3">Harga Menu per Gerobak</h3>

                <div className="card-subtitle">
                  Kosongkan override untuk kembali memakai harga default global.
                </div>
              </div>

              <div className="adm-actions">
                <label className="check-compact">
                  <input
                    type="checkbox"
                    checked={showInactiveMenus}
                    onChange={(event) => setShowInactiveMenus(event.target.checked)}
                    disabled={!form.id}
                  />

                  <span>Tampilkan menu nonaktif</span>
                </label>

                <button
                  className="btn secondary"
                  type="button"
                  disabled={!form.id || menuLoading}
                  onClick={() => form.id && loadMenuPrices(form.id)}
                >
                  Refresh Harga
                </button>

                <button
                  className="btn"
                  type="button"
                  disabled={!form.id || menuBusy || menuLoading}
                  onClick={saveMenuPrices}
                >
                  {menuBusy ? "Menyimpan..." : "Simpan Harga"}
                </button>
              </div>
            </div>

            {!form.id ? (
              <div className="adm-alert" style={{ marginTop: 12 }}>
                Pilih gerobak dulu untuk mengatur harga menunya.
              </div>
            ) : null}

            {menuLoading ? (
              <div className="adm-alert" style={{ marginTop: 12 }}>
                <span className="loading-inline">
                  <span className="spinner spinner--sm" aria-hidden="true" />
                  Memuat harga menu...
                </span>
              </div>
            ) : null}

            {menuErr ? (
              <div
                className="adm-alert"
                role="alert"
                aria-live="polite"
                style={{ marginTop: 12 }}
              >
                {menuErr}
              </div>
            ) : null}

            {menuMsg ? (
              <div
                className="adm-alert adm-alert--ok"
                role="status"
                aria-live="polite"
                style={{ marginTop: 12 }}
              >
                {menuMsg}
              </div>
            ) : null}

            {form.id ? (
              <div className="adm-list" style={{ marginTop: 14 }}>
                {visibleMenuItems.map((row) => {
                  const active = activeState(row.isActive);
                  const smallPreview = getSmallPreview(row);
                  const largePreview = getLargePreview(row);

                  const hasOverride =
                    String(row.priceSmallOverrideInput || "").trim() !== "" ||
                    String(row.priceLargeOverrideInput || "").trim() !== "";

                  return (
                    <div key={row.productId} className="adm-list-item">
                      <div className="adm-list-top" style={{ alignItems: "center" }}>
                        <div>
                          <div className="adm-list-title" title={row.name}>
                            {row.name}
                          </div>

                          <div className="adm-list-meta" style={{ marginTop: 6 }}>
                            {row.sku || row.productId}
                          </div>
                        </div>

                        <div className="adm-list-badges">
                          {hasOverride ? <span className="adm-chip">Override</span> : null}

                          <span className={active ? "adm-badge adm-badge--cash" : "adm-badge"}>
                            {active ? "ACTIVE" : "INACTIVE"}
                          </span>
                        </div>
                      </div>

                      <div className="adm-form-grid" style={{ marginTop: 14 }}>
                        <div className="adm-check-item">
                          <div className="adm-kpi-label">Default Reguler</div>
                          <div className="adm-list-title">{idr(row.defaultPriceSmall)}</div>
                        </div>

                        <div className="adm-check-item">
                          <div className="adm-kpi-label">Default Jumbo</div>
                          <div className="adm-list-title">{idr(row.defaultPriceLarge)}</div>
                        </div>

                        <div className="adm-check-item">
                          <div className="adm-kpi-label">Efektif Reguler</div>
                          <div className="adm-list-title">{idr(smallPreview)}</div>
                        </div>

                        <div className="adm-check-item">
                          <div className="adm-kpi-label">Efektif Jumbo</div>
                          <div className="adm-list-title">{idr(largePreview)}</div>
                        </div>
                      </div>

                      <div className="adm-form-grid" style={{ marginTop: 14 }}>
                        <div className="adm-field">
                          <label>Override Reguler</label>

                          <input
                            className="input"
                            inputMode="numeric"
                            placeholder={String(row.defaultPriceSmall || 0)}
                            value={row.priceSmallOverrideInput || ""}
                            onChange={(event) =>
                              patchMenuRow(row.productId, {
                                priceSmallOverrideInput: event.target.value.replace(/[^0-9]/g, ""),
                              })
                            }
                          />

                          <div className="field-hint">Kosongkan untuk harga default.</div>
                        </div>

                        <div className="adm-field">
                          <label>Override Jumbo</label>

                          <input
                            className="input"
                            inputMode="numeric"
                            placeholder={String(row.defaultPriceLarge || 0)}
                            value={row.priceLargeOverrideInput || ""}
                            onChange={(event) =>
                              patchMenuRow(row.productId, {
                                priceLargeOverrideInput: event.target.value.replace(/[^0-9]/g, ""),
                              })
                            }
                          />

                          <div className="field-hint">Kosongkan untuk harga default.</div>
                        </div>

                        <div className="adm-field">
                          <label>&nbsp;</label>

                          <button
                            className="btn secondary"
                            type="button"
                            onClick={() => resetMenuRow(row.productId)}
                          >
                            Pakai Default
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {!visibleMenuItems.length ? (
                  <div className="adm-list-item">
                    <div className="adm-list-name">Belum ada menu untuk ditampilkan.</div>
                    <div className="muted">
                      Cek halaman produk atau aktifkan opsi tampilkan menu nonaktif.
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        </section>
      </div>
    </main>
  );
}