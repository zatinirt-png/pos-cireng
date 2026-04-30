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
    return new Date(dt).toLocaleString("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
    });
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

function typeLabel(type) {
  if (type === "DISCOUNT_PERCENT") return "Diskon %";
  if (type === "DISCOUNT_AMOUNT") return "Diskon Nominal";
  if (type === "BONUS_ITEM") return "Bonus Item";
  return type || "-";
}

function getWindowState(p) {
  const now = new Date();
  const start = p?.startAt ? new Date(p.startAt) : null;
  const end = p?.endAt ? new Date(p.endAt) : null;

  if (start && Number.isNaN(start.getTime())) return "TANPA JADWAL";
  if (end && Number.isNaN(end.getTime())) return "TANPA JADWAL";

  if (start && now < start) return "TERJADWAL";
  if (end && now > end) return "SELESAI";

  if (start || end) return "BERJALAN";

  return "TANPA JADWAL";
}

function WindowBadge({ promo }) {
  const state = getWindowState(promo);

  const className =
    state === "BERJALAN"
      ? "adm-badge adm-badge--cash"
      : state === "SELESAI"
      ? "adm-badge badge--danger"
      : "adm-badge";

  return <span className={className}>{state}</span>;
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
    discountAmount: 0,
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

  const activeProducts = useMemo(() => {
    return (products || []).filter((p) => (p.isActive ?? p.active) !== false);
  }, [products]);

  const channelMatchedProducts = useMemo(() => {
    const target = normSalesChannel(form.salesChannel);

    return activeProducts.filter((p) => {
      const productChannel = normSalesChannel(p.salesChannel);

      if (target === "ALL") return productChannel === "ALL";

      return productChannel === "ALL" || productChannel === target;
    });
  }, [activeProducts, form.salesChannel]);

  const editingPromo = useMemo(() => {
    if (!form.id) return null;
    return (promos || []).find((x) => x.id === form.id) || null;
  }, [form.id, promos]);

  const editingActive = useMemo(() => {
    if (!editingPromo) return !!form.isActive;
    return !!(editingPromo.isActive ?? editingPromo.active);
  }, [editingPromo, form.isActive]);

  const visiblePromos = useMemo(() => {
    const rows = showInactive
      ? promos || []
      : (promos || []).filter((p) => (p.isActive ?? p.active) !== false);

    return [...rows].sort((a, b) => {
      const activeA = (a.isActive ?? a.active) !== false ? 0 : 1;
      const activeB = (b.isActive ?? b.active) !== false ? 0 : 1;

      if (activeA !== activeB) return activeA - activeB;

      const startA = a.startAt ? new Date(a.startAt).getTime() : 0;
      const startB = b.startAt ? new Date(b.startAt).getTime() : 0;

      return startB - startA;
    });
  }, [promos, showInactive]);

  const promoStats = useMemo(() => {
    const rows = promos || [];

    let active = 0;
    let inactive = 0;
    let discount = 0;
    let bonus = 0;

    rows.forEach((promo) => {
      if ((promo.isActive ?? promo.active) !== false) active += 1;
      else inactive += 1;

      if (promo.type === "BONUS_ITEM") bonus += 1;
      else discount += 1;
    });

    return {
      total: rows.length,
      active,
      inactive,
      discount,
      bonus,
    };
  }, [promos]);

  async function load({ silent = false } = {}) {
    if (!silent) {
      setLoading(true);
      setErr("");
      setMsg("");
    }

    try {
      const [promoResponse, productResponse] = await Promise.all([
        apiGet("/api/admin/promos", token),
        apiGet("/api/admin/products", token),
      ]);

      setPromos(promoResponse.promos || []);
      setProducts(productResponse.products || []);
    } catch (error) {
      if (!silent) setErr(error?.message || "Gagal load promo");
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
      name: "",
      type: "DISCOUNT_PERCENT",
      salesChannel: "REGULAR",
      discountPercent: 10,
      discountAmount: 0,
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
      discountAmount: p.discountAmount ?? 0,
      minSubtotal: p.minSubtotal ?? 0,
      bonusProductId: p.bonusProductId || "",
      bonusPortion: p.bonusPortion || "SMALL",
      bonusQty: p.bonusQty ?? 1,
      isActive: !!(p.isActive ?? p.active),
      startAt: p.startAt ? String(p.startAt).slice(0, 16) : "",
      endAt: p.endAt ? String(p.endAt).slice(0, 16) : "",
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function buildRuleText(p) {
    if (!p) return "-";

    const min = Number(p.minSubtotal || 0);

    if (p.type === "DISCOUNT_PERCENT") {
      return `Diskon ${Number(p.discountPercent || 0)}% • Min Rp ${idr(min)}`;
    }

    if (p.type === "DISCOUNT_AMOUNT") {
      return `Diskon Rp ${idr(Number(p.discountAmount || 0))} • Min Rp ${idr(min)}`;
    }

    const product = productsMap.get(p.bonusProductId);
    const productName = product?.name || "(Produk)";
    const qty = Number(p.bonusQty || 0);
    const portion = p.bonusPortion || "SMALL";

    return `Bonus ${productName} x${qty} (${portion}) • Min Rp ${idr(min)}`;
  }

  async function submit(event) {
    event.preventDefault();

    setErr("");
    setMsg("");

    try {
      const payload = {
        name: String(form.name || "").trim(),
        type: form.type,
        salesChannel: normSalesChannel(form.salesChannel),
        discountPercent: Number(form.discountPercent || 0),
        discountAmount: Number(form.discountAmount || 0),
        minSubtotal: Number(form.minSubtotal || 0),
        bonusProductId: form.bonusProductId || null,
        bonusPortion: form.bonusPortion || "SMALL",
        bonusQty: Number(form.bonusQty || 0),
        isActive: !!form.isActive,
        startAt: form.startAt ? new Date(form.startAt).toISOString() : null,
        endAt: form.endAt ? new Date(form.endAt).toISOString() : null,
      };

      if (!payload.name) throw new Error("Nama promo wajib diisi.");

      if (!["DISCOUNT_PERCENT", "DISCOUNT_AMOUNT", "BONUS_ITEM"].includes(payload.type)) {
        throw new Error("Tipe promo tidak valid.");
      }

      if (payload.startAt && payload.endAt && payload.startAt > payload.endAt) {
        throw new Error("Tanggal mulai tidak boleh lebih besar dari tanggal selesai.");
      }

      if (payload.type === "DISCOUNT_PERCENT") {
        if (
          !Number.isFinite(payload.discountPercent) ||
          payload.discountPercent <= 0 ||
          payload.discountPercent > 100
        ) {
          throw new Error("Diskon persen harus 1–100.");
        }
      }

      if (payload.type === "DISCOUNT_AMOUNT") {
        if (!Number.isFinite(payload.discountAmount) || payload.discountAmount <= 0) {
          throw new Error("Diskon nominal harus lebih dari 0.");
        }
      }

      if (payload.type === "BONUS_ITEM") {
        if (!payload.bonusProductId) {
          throw new Error("Bonus product wajib dipilih.");
        }

        if (!Number.isFinite(payload.bonusQty) || payload.bonusQty <= 0) {
          throw new Error("Bonus qty harus lebih dari 0.");
        }
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
    } catch (error) {
      setErr(error?.message || "Gagal simpan promo");
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

      setForm((current) => {
        if (current.id !== p.id) return current;
        return { ...current, isActive: next };
      });
    } catch (error) {
      setErr(error?.message || "Gagal ubah status promo");
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
    } catch (error) {
      setErr(error?.message || "Gagal hapus promo");
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

  return (
    <main className="adm-bg adm adm-promos">
      <div className="adm-shell">
        <section className="adm-main-card">
          <div className="adm-header">
            <div>
              <h2 className="adm-h2">Kelola Promo</h2>

              <div className="adm-subline">
                <span>Tambah, edit, aktifkan, dan atur promo penjualan.</span>
              </div>
            </div>

            <div className="adm-actions">
              <button className="btn secondary" type="button" onClick={() => load()}>
                Refresh
              </button>

              <button
                className="btn secondary"
                type="button"
                onClick={() => nav("/admin/products")}
              >
                Produk
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
                Memuat promo...
              </span>
            </div>
          ) : null}

          {err ? (
            <div className="adm-alert" role="alert" aria-live="polite" style={{ marginBottom: 12 }}>
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
            <StatCard label="Total Promo" value={promoStats.total} note="Semua promo." />
            <StatCard label="Promo Aktif" value={promoStats.active} note="Bisa digunakan kasir." />
            <StatCard label="Diskon" value={promoStats.discount} note="Persen dan nominal." />
            <StatCard label="Bonus Item" value={promoStats.bonus} note="Promo produk gratis." />
          </div>

          <div className="adm-panels" style={{ marginTop: 14 }}>
            <section className="adm-panel">
              <div className="adm-panel-head">
                <div>
                  <h3 className="adm-h3">{form.id ? "Edit Promo" : "Tambah Promo"}</h3>

                  <div className="card-subtitle">
                    {form.id
                      ? "Ubah data promo yang dipilih."
                      : "Buat promo baru untuk channel penjualan."}
                  </div>
                </div>

                {form.id ? <span className="badge">Edit</span> : <span className="badge">Baru</span>}
              </div>

              <form onSubmit={submit} className="adm-form" style={{ marginTop: 14 }}>
                <div className="adm-field">
                  <label htmlFor="promo-name">Nama Promo</label>
                  <input
                    id="promo-name"
                    className="input"
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="Contoh: Diskon Weekend 10%"
                  />
                </div>

                <div className="adm-form-grid">
                  <div className="adm-field">
                    <label htmlFor="promo-type">Tipe Promo</label>
                    <select
                      id="promo-type"
                      className="input"
                      value={form.type}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          type: event.target.value,
                        }))
                      }
                    >
                      <option value="DISCOUNT_PERCENT">Diskon Persen</option>
                      <option value="DISCOUNT_AMOUNT">Diskon Nominal</option>
                      <option value="BONUS_ITEM">Bonus Item</option>
                    </select>
                  </div>

                  <div className="adm-field">
                    <label htmlFor="promo-channel">Channel Penjualan</label>
                    <select
                      id="promo-channel"
                      className="input"
                      value={form.salesChannel}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          salesChannel: normSalesChannel(event.target.value),
                          bonusProductId: "",
                        }))
                      }
                    >
                      <option value="REGULAR">REGULAR</option>
                      <option value="GOJEK">GOJEK</option>
                      <option value="ALL">ALL</option>
                    </select>
                  </div>
                </div>

                <div className="adm-field">
                  <label htmlFor="promo-min-subtotal">Minimal Subtotal</label>
                  <input
                    id="promo-min-subtotal"
                    className="input"
                    type="number"
                    min="0"
                    value={form.minSubtotal}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        minSubtotal: event.target.value,
                      }))
                    }
                    placeholder="0"
                  />
                  <div className="field-hint">Isi 0 jika promo tidak punya minimum transaksi.</div>
                </div>

                {form.type === "DISCOUNT_PERCENT" ? (
                  <div className="adm-field">
                    <label htmlFor="promo-discount-percent">Diskon Persen</label>
                    <input
                      id="promo-discount-percent"
                      className="input"
                      type="number"
                      min="1"
                      max="100"
                      value={form.discountPercent}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          discountPercent: event.target.value,
                        }))
                      }
                      placeholder="10"
                    />
                    <div className="field-hint">Masukkan angka 1 sampai 100.</div>
                  </div>
                ) : null}

                {form.type === "DISCOUNT_AMOUNT" ? (
                  <div className="adm-field">
                    <label htmlFor="promo-discount-amount">Diskon Nominal</label>
                    <input
                      id="promo-discount-amount"
                      className="input"
                      type="number"
                      min="0"
                      value={form.discountAmount}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          discountAmount: event.target.value,
                        }))
                      }
                      placeholder="Contoh: 3000"
                    />
                  </div>
                ) : null}

                {form.type === "BONUS_ITEM" ? (
                  <section className="adm-panel" style={{ marginTop: 4 }}>
                    <div className="adm-panel-head">
                      <div>
                        <h3 className="adm-h3">Detail Bonus</h3>
                        <div className="card-subtitle">
                          Produk bonus mengikuti channel promo yang dipilih.
                        </div>
                      </div>

                      <span className="badge">Bonus</span>
                    </div>

                    <div className="adm-form-grid" style={{ marginTop: 12 }}>
                      <div className="adm-field">
                        <label htmlFor="bonus-product">Produk Bonus</label>
                        <select
                          id="bonus-product"
                          className="input"
                          value={form.bonusProductId}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              bonusProductId: event.target.value,
                            }))
                          }
                        >
                          <option value="">Pilih produk bonus</option>

                          {channelMatchedProducts.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name} ({product.sku})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="adm-field">
                        <label htmlFor="bonus-portion">Portion Bonus</label>
                        <select
                          id="bonus-portion"
                          className="input"
                          value={form.bonusPortion}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              bonusPortion: event.target.value,
                            }))
                          }
                        >
                          <option value="SMALL">SMALL</option>
                          <option value="LARGE">LARGE</option>
                        </select>
                      </div>

                      <div className="adm-field">
                        <label htmlFor="bonus-qty">Qty Bonus</label>
                        <input
                          id="bonus-qty"
                          className="input"
                          type="number"
                          min="1"
                          value={form.bonusQty}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              bonusQty: event.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                  </section>
                ) : null}

                <section className="adm-panel" style={{ marginTop: 4 }}>
                  <div className="adm-panel-head">
                    <div>
                      <h3 className="adm-h3">Jadwal Promo</h3>
                      <div className="card-subtitle">
                        Kosongkan jika promo berlaku tanpa batas tanggal.
                      </div>
                    </div>
                  </div>

                  <div className="adm-form-grid" style={{ marginTop: 12 }}>
                    <div className="adm-field">
                      <label htmlFor="promo-start">Mulai</label>
                      <input
                        id="promo-start"
                        className="input"
                        type="datetime-local"
                        value={form.startAt}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            startAt: event.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="adm-field">
                      <label htmlFor="promo-end">Selesai</label>
                      <input
                        id="promo-end"
                        className="input"
                        type="datetime-local"
                        value={form.endAt}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            endAt: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                </section>

                <div className="adm-field">
                  <label>Status Promo</label>

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
                      <span className="check-card__title">Promo aktif</span>
                      <span className="check-card__sub">
                        Jika aktif, promo akan tersedia sesuai jadwal dan channel.
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
                          title={editingActive ? "Nonaktifkan dulu untuk hapus permanen" : "Hapus permanen"}
                        >
                          Hapus
                        </button>

                        <button className="btn secondary" type="button" onClick={resetForm}>
                          Batal
                        </button>
                      </>
                    ) : null}

                    <button className="btn" type="submit">
                      {form.id ? "Simpan Perubahan" : "Tambah Promo"}
                    </button>
                  </div>
                </div>

                {form.id ? (
                  <div className="field-hint">
                    Hapus permanen hanya bisa dilakukan jika promo sudah INACTIVE.
                  </div>
                ) : null}
              </form>
            </section>

            <section className="adm-panel">
              <div className="adm-panel-head">
                <div>
                  <h3 className="adm-h3">Daftar Promo</h3>
                  <div className="card-subtitle">Klik promo untuk masuk mode edit.</div>
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
                {visiblePromos.map((promo) => {
                  const active = !!(promo.isActive ?? promo.active);
                  const start = promo.startAt ? fmtLocal(promo.startAt) : "";
                  const end = promo.endAt ? fmtLocal(promo.endAt) : "";

                  return (
                    <button
                      key={promo.id}
                      type="button"
                      className="adm-list-item"
                      role="listitem"
                      onClick={() => editItem(promo)}
                      style={{ textAlign: "left", cursor: "pointer" }}
                      aria-label={`Edit promo ${promo.name}`}
                    >
                      <div className="adm-list-top" style={{ alignItems: "center" }}>
                        <div>
                          <div className="adm-list-title" title={promo.name}>
                            {promo.name}
                          </div>

                          <div className="adm-list-meta" style={{ marginTop: 6 }}>
                            <span className="adm-chip">{typeLabel(promo.type)}</span>
                            <span className="muted">Min Rp {idr(promo.minSubtotal || 0)}</span>
                          </div>
                        </div>

                        <div className="adm-list-badges">
                          <span className="adm-badge">{salesChannelLabel(promo.salesChannel)}</span>

                          <span className={active ? "adm-badge adm-badge--cash" : "adm-badge"}>
                            {active ? "ACTIVE" : "INACTIVE"}
                          </span>

                          <WindowBadge promo={promo} />
                        </div>
                      </div>

                      <div className="adm-list-rule" style={{ marginTop: 10 }}>
                        {buildRuleText(promo)}
                      </div>

                      {start || end ? (
                        <div className="adm-list-window muted" style={{ marginTop: 8 }}>
                          <span>Mulai: {start || "-"}</span>
                          <span className="adm-dot">•</span>
                          <span>Selesai: {end || "-"}</span>
                        </div>
                      ) : (
                        <div className="adm-list-window muted" style={{ marginTop: 8 }}>
                          Tanpa batas jadwal.
                        </div>
                      )}
                    </button>
                  );
                })}

                {!visiblePromos.length ? (
                  <div className="adm-list-item">
                    <div className="adm-list-name">Belum ada promo.</div>
                    <div className="muted">Tambahkan promo dari form di sebelah kiri.</div>
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