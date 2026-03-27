import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost, apiPatch, apiDelete } from "../api";
import { useNavigate } from "react-router-dom";

function idr(n) {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString("id-ID");
}

function fmtLocal(dt) {
  if (!dt) return "";
  try {
    return new Date(dt).toLocaleString("id-ID");
  } catch {
    return String(dt);
  }
}

function normSalesChannel(v) {
  const s = String(v || "").trim().toUpperCase();
  if (s === "GOJEK") return "GOJEK";
  if (s === "REGULAR") return "REGULAR";
  return "ALL";
}

function salesChannelLabel(v) {
  const s = normSalesChannel(v);
  if (s === "GOJEK") return "GOJEK";
  if (s === "REGULAR") return "REGULAR";
  return "ALL";
}

export default function AdminPromos() {
  const nav = useNavigate();
  const token = localStorage.getItem("admin_token");

  const [showInactive, setShowInactive] = useState(false);

  const [promos, setPromos] = useState([]);
  const [products, setProducts] = useState([]);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const didLoadRef = useRef(false);

  const [form, setForm] = useState({
    id: "",
    name: "",
    type: "DISCOUNT_PERCENT",
    salesChannel: "REGULAR",
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

  const productsMap = useMemo(() => {
    const m = new Map();
    (products || []).forEach((p) => m.set(p.id, p));
    return m;
  }, [products]);

  const activeProducts = useMemo(
    () => (products || []).filter((p) => (p.isActive ?? p.active) !== false),
    [products]
  );

  const channelMatchedProducts = useMemo(() => {
    const target = normSalesChannel(form.salesChannel);
    return activeProducts.filter((p) => {
      const pch = normSalesChannel(p.salesChannel);
      if (target === "ALL") return pch === "ALL";
      return pch === "ALL" || pch === target;
    });
  }, [activeProducts, form.salesChannel]);

  async function load({ silent = false } = {}) {
    if (!silent) {
      setLoading(true);
      setErr("");
      setMsg("");
    }
    try {
      const [r1, r2] = await Promise.all([
        apiGet("/api/admin/promos", token),
        apiGet("/api/admin/products", token),
      ]);
      setPromos(r1.promos || []);
      setProducts(r2.products || []);
    } catch (e) {
      if (!silent) setErr(e?.message || "Gagal load promo");
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

  function resetForm() {
    setForm({
      id: "",
      name: "",
      type: "DISCOUNT_PERCENT",
      salesChannel: "REGULAR",
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

  function editItem(p) {
    setErr("");
    setMsg("");
    setForm({
      id: p.id,
      name: p.name || "",
      type: p.type || "DISCOUNT_PERCENT",
      salesChannel: normSalesChannel(p.salesChannel),
      discountPercent: p.discountPercent ?? 0,
      minSubtotal: p.minSubtotal ?? 0,
      bonusProductId: p.bonusProductId || "",
      bonusPortion: p.bonusPortion || "SMALL",
      bonusQty: p.bonusQty ?? 1,
      isActive: !!(p.isActive ?? p.active),
      startAt: p.startAt ? String(p.startAt).slice(0, 16) : "",
      endAt: p.endAt ? String(p.endAt).slice(0, 16) : "",
    });
  }

  const editingPromo = useMemo(() => {
    if (!form.id) return null;
    return (promos || []).find((x) => x.id === form.id) || null;
  }, [form.id, promos]);

  const editingActive = useMemo(() => {
    if (!editingPromo) return !!form.isActive;
    return !!(editingPromo.isActive ?? editingPromo.active);
  }, [editingPromo, form.isActive]);

  function buildRuleText(p) {
    if (!p) return "-";
    const type = p.type;
    const min = Number(p.minSubtotal || 0);

    if (type === "DISCOUNT_PERCENT") {
      return `Diskon ${Number(p.discountPercent || 0)}% • Min Rp ${idr(min)}`;
    }
    const prod = productsMap.get(p.bonusProductId);
    const prodName = prod?.name || "(Produk)";
    const qty = Number(p.bonusQty || 0);
    const portion = p.bonusPortion || "SMALL";
    return `Bonus ${prodName} x${qty} (${portion}) • Min Rp ${idr(min)}`;
  }

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setMsg("");

    try {
      const payload = {
        name: String(form.name || "").trim(),
        type: form.type,
        salesChannel: normSalesChannel(form.salesChannel),
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
      if (!["DISCOUNT_PERCENT", "BONUS_ITEM"].includes(payload.type))
        throw new Error("Tipe promo tidak valid.");

      if (payload.type === "DISCOUNT_PERCENT") {
        if (
          !Number.isFinite(payload.discountPercent) ||
          payload.discountPercent <= 0 ||
          payload.discountPercent > 100
        ) {
          throw new Error("Diskon persen harus 1–100.");
        }
      } else {
        if (!payload.bonusProductId) throw new Error("Bonus product wajib dipilih.");
        if (!Number.isFinite(payload.bonusQty) || payload.bonusQty <= 0)
          throw new Error("Bonus qty harus > 0.");
      }

      if (!form.id) {
        await apiPost("/api/admin/promos", payload, token);
        setMsg("Promo ditambahkan.");
      } else {
        await apiPatch(`/api/admin/promos/${form.id}`, payload, token);
        setMsg("Promo diperbarui.");
      }

      resetForm();
      await load({ silent: true });
    } catch (e2) {
      setErr(e2?.message || "Gagal simpan promo");
    }
  }

  async function toggleActive(p) {
    setErr("");
    setMsg("");
    try {
      const next = !(p.isActive ?? p.active);
      await apiPatch(`/api/admin/promos/${p.id}`, { isActive: next }, token);
      setMsg(`Promo ${next ? "diaktifkan" : "dinonaktifkan"}.`);
      await load({ silent: true });
      setForm((f) => (f.id === p.id ? { ...f, isActive: next } : f));
    } catch (e2) {
      setErr(e2?.message || "Gagal ubah status promo");
    }
  }

  async function deletePromo(p) {
    setErr("");
    setMsg("");

    const active = !!(p.isActive ?? p.active);
    if (active) {
      setErr("Nonaktifkan dulu sebelum hapus permanen.");
      return;
    }

    const ok = window.confirm(
      `Hapus permanen promo "${p.name}"?\nTindakan ini tidak bisa dibatalkan.`
    );
    if (!ok) return;

    try {
      await apiDelete(`/api/admin/promos/${p.id}`, token);
      setMsg("Promo dihapus permanen.");
      resetForm();
      await load({ silent: true });
    } catch (e) {
      setErr(e?.message || "Gagal hapus promo");
    }
  }

  async function toggleEditingActive() {
    if (!editingPromo) return;
    await toggleActive(editingPromo);
  }

  async function deleteEditing() {
    if (!editingPromo) return;
    await deletePromo(editingPromo);
  }

  function logout() {
    localStorage.removeItem("admin_token");
    nav("/admin");
  }

  const visiblePromos = showInactive
    ? promos
    : (promos || []).filter((p) => (p.isActive ?? p.active) !== false);

  return (
    <div className="adm-bg adm adm-promos">
      <div className="adm-shell">
        <div className="adm-layout">
          {/* SIDEBAR */}
          <aside className="adm-nav">
            <div className="adm-nav-card">
              <div className="adm-nav-title">Admin</div>
              <div className="adm-nav-sub">Kelola promo</div>

              <div className="adm-nav-list">
                <button className="adm-nav-item" type="button" onClick={() => nav("/admin/dashboard")}>
                  Live Report
                </button>
                <button className="adm-nav-item" type="button" onClick={() => nav("/admin/products")}>
                  Menu
                </button>
                <button className="adm-nav-item active" type="button" onClick={() => nav("/admin/promos")}>
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
                  <h2 className="adm-h2">Kelola Promo</h2>
                  <div className="adm-subline">
                    <span className="muted">Klik promo untuk edit. Aksi ada di panel Edit.</span>
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
                    <h3 className="adm-h3">{form.id ? "Edit Promo" : "Tambah Promo"}</h3>
                    {form.id ? <span className="muted">ID: {form.id}</span> : <span className="muted">Create</span>}
                  </div>

                  <form onSubmit={submit} className="adm-form">
                    <div className="adm-field">
                      <label>Nama Promo</label>
                      <input
                        className="input"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="contoh: Diskon 10% Weekend"
                      />
                    </div>

                    <div className="adm-form-grid" style={{ marginTop: 10 }}>
                      <div className="adm-field">
                        <label>Tipe</label>
                        <select
                          className="input"
                          value={form.type}
                          onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                        >
                          <option value="DISCOUNT_PERCENT">Diskon Persen</option>
                          <option value="BONUS_ITEM">Bonus Item</option>
                        </select>
                      </div>

                      <div className="adm-field">
                        <label>Minimal Subtotal (Rp)</label>
                        <input
                          className="input"
                          type="number"
                          value={form.minSubtotal}
                          onChange={(e) => setForm((f) => ({ ...f, minSubtotal: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="adm-field" style={{ marginTop: 10 }}>
                      <label>Channel Penjualan</label>
                      <select
                        className="input"
                        value={form.salesChannel}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            salesChannel: normSalesChannel(e.target.value),
                            bonusProductId: "",
                          }))
                        }
                      >
                        <option value="REGULAR">REGULAR</option>
                        <option value="GOJEK">GOJEK</option>
                        <option value="ALL">ALL</option>
                      </select>
                    </div>

                    {form.type === "DISCOUNT_PERCENT" ? (
                      <div className="adm-field" style={{ marginTop: 10 }}>
                        <label>Diskon (%)</label>
                        <input
                          className="input"
                          type="number"
                          value={form.discountPercent}
                          onChange={(e) => setForm((f) => ({ ...f, discountPercent: e.target.value }))}
                        />
                      </div>
                    ) : (
                      <>
                        <div className="adm-form-grid" style={{ marginTop: 10 }}>
                          <div className="adm-field">
                            <label>Bonus Product</label>
                            <select
                              className="input"
                              value={form.bonusProductId}
                              onChange={(e) => setForm((f) => ({ ...f, bonusProductId: e.target.value }))}
                            >
                              <option value="">-- pilih product --</option>
                              {channelMatchedProducts.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({p.sku})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="adm-field">
                            <label>Portion Bonus</label>
                            <select
                              className="input"
                              value={form.bonusPortion}
                              onChange={(e) => setForm((f) => ({ ...f, bonusPortion: e.target.value }))}
                            >
                              <option value="SMALL">SMALL</option>
                              <option value="LARGE">LARGE</option>
                            </select>
                          </div>
                        </div>

                        <div className="adm-field" style={{ marginTop: 10 }}>
                          <label>Bonus Qty</label>
                          <input
                            className="input"
                            type="number"
                            value={form.bonusQty}
                            onChange={(e) => setForm((f) => ({ ...f, bonusQty: e.target.value }))}
                          />
                        </div>
                      </>
                    )}

                    <div className="adm-form-grid" style={{ marginTop: 10 }}>
                      <div className="adm-field">
                        <label>Start (opsional)</label>
                        <input
                          className="input"
                          type="datetime-local"
                          value={form.startAt}
                          onChange={(e) => setForm((f) => ({ ...f, startAt: e.target.value }))}
                        />
                      </div>

                      <div className="adm-field">
                        <label>End (opsional)</label>
                        <input
                          className="input"
                          type="datetime-local"
                          value={form.endAt}
                          onChange={(e) => setForm((f) => ({ ...f, endAt: e.target.value }))}
                        />
                      </div>
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
                          {form.id ? "Simpan Perubahan" : "Tambah Promo"}
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
                          *Hapus permanen hanya bisa jika promo INACTIVE.
                        </div>
                      </div>
                    ) : null}
                  </form>
                </section>

                {/* RIGHT: LIST */}
                <section className="adm-panel">
                  <div className="adm-panel-head">
                    <h3 className="adm-h3">Daftar Promo</h3>
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
                    Klik promo untuk edit (aksi ada di panel kiri).
                  </div>

                  <div className="adm-list" role="list">
                    {visiblePromos.map((p) => {
                      const active = !!(p.isActive ?? p.active);
                      const rule = buildRuleText(p);
                      const start = p.startAt ? fmtLocal(p.startAt) : "";
                      const end = p.endAt ? fmtLocal(p.endAt) : "";

                      const typeLabel =
                        p.type === "DISCOUNT_PERCENT" ? "Diskon %" : p.type === "BONUS_ITEM" ? "Bonus Item" : (p.type || "-");

                      return (
                        <div
                          key={p.id}
                          className="adm-list-item"
                          role="listitem"
                          tabIndex={0}
                          onClick={() => editItem(p)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              editItem(p);
                            }
                          }}
                          aria-label={`Edit promo ${p.name}`}
                        >
                          <div className="adm-list-top">
                            <div className="adm-list-title" title={p.name}>
                              {p.name}
                            </div>

                            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                              <span className="adm-badge">
                                {salesChannelLabel(p.salesChannel)}
                              </span>

                              <span className={active ? "adm-badge adm-badge--cash" : "adm-badge"}>
                                {active ? "ACTIVE" : "INACTIVE"}
                              </span>
                            </div>
                          </div>

                          <div className="adm-list-meta">
                            <span className="adm-chip">{typeLabel}</span>
                            <span className="muted">Min Rp {idr(p.minSubtotal || 0)}</span>
                          </div>

                          <div className="adm-list-rule">{rule}</div>

                          {(start || end) ? (
                            <div className="adm-list-window muted">
                              {start ? `Mulai: ${start}` : "Mulai: -"}{" "}
                              <span className="adm-dot">•</span>{" "}
                              {end ? `Selesai: ${end}` : "Selesai: -"}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}

                    {!visiblePromos.length ? (
                      <div className="muted" style={{ padding: 10 }}>
                        Belum ada promo.
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
