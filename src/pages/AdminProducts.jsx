import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "../api";
import { useNavigate } from "react-router-dom";

const CACHE_KEY = "admin_products_cache_v3";
const CACHE_TTL = 30_000;

function idr(n) {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString("id-ID");
}

function toInt(v, def = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.floor(n);
}

function normPortion(v) {
  const s = String(v || "").trim().toUpperCase();
  if (s === "SMALL") return "SMALL";
  if (s === "LARGE") return "LARGE";
  return "ALL";
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

function getRecipeTone(status) {
  const s = String(status || "").toUpperCase();

  if (s === "READY") {
    return {
      label: "READY",
      className: "adm-badge adm-badge--cash",
    };
  }

  if (s === "NO_RECIPE") {
    return {
      label: "NO RECIPE",
      className: "adm-badge badge--danger",
    };
  }

  if (s === "INCOMPLETE") {
    return {
      label: "INCOMPLETE",
      className: "adm-badge",
    };
  }

  if (s.startsWith("INACTIVE")) {
    return {
      label: "INACTIVE",
      className: "adm-badge",
    };
  }

  return {
    label: s || "CHECK",
    className: "adm-badge",
  };
}

function RecipeBadge({ status }) {
  const tone = getRecipeTone(status);

  return <span className={tone.className}>{tone.label}</span>;
}

function buildLocalRecipeAudit({ isActive, recipeEnabled, recipeRows, ingredients }) {
  const rows = recipeEnabled
    ? (recipeRows || [])
        .map((r) => ({
          ingredientId: String(r.ingredientId || "").trim(),
          portion: normPortion(r.portion),
          qty: toInt(r.qty, 0),
        }))
        .filter((r) => r.ingredientId && r.qty > 0)
    : [];

  const ingredientMap = new Map((ingredients || []).map((x) => [x.id, x]));
  const coreSetupIssues = [];
  const byIngredient = new Map();
  const inactiveIngredients = [];

  let allRows = 0;
  let smallRows = 0;
  let largeRows = 0;

  for (const row of rows) {
    const ing = ingredientMap.get(row.ingredientId) || null;

    if (row.portion === "ALL") allRows += 1;
    if (row.portion === "SMALL") smallRows += 1;
    if (row.portion === "LARGE") largeRows += 1;

    const prev =
      byIngredient.get(row.ingredientId) || {
        ingredientId: row.ingredientId,
        name: ing?.name || row.ingredientId,
        all: false,
        small: false,
        large: false,
      };

    if (row.portion === "ALL") prev.all = true;
    if (row.portion === "SMALL") prev.small = true;
    if (row.portion === "LARGE") prev.large = true;

    byIngredient.set(row.ingredientId, prev);

    if (ing && ing.isActive === false) {
      inactiveIngredients.push({
        id: ing.id,
        name: ing.name,
      });
    }
  }

  const missingCoreIngredients = [];

  const hasAnyRecipe = rows.length > 0;
  const hasSmallCoverage = allRows > 0 || smallRows > 0;
  const hasLargeCoverage = allRows > 0 || largeRows > 0;
  const hasCompleteCoverage = hasSmallCoverage && hasLargeCoverage;

  const missingPortions = [];
  if (!hasSmallCoverage) missingPortions.push("SMALL");
  if (!hasLargeCoverage) missingPortions.push("LARGE");

  const warnings = [];

  if (!hasAnyRecipe) {
    warnings.push("Belum ada recipe. Produk belum aman untuk auto-deduct stok.");
  } else {
    if (!hasCompleteCoverage) {
      warnings.push(`Coverage portion belum lengkap: ${missingPortions.join(", ")}.`);
    }

    if (missingCoreIngredients.length) {
      warnings.push(`Bahan wajib belum lengkap: ${missingCoreIngredients.join(", ")}.`);
    }

    if (inactiveIngredients.length) {
      warnings.push(
        `Ada bahan nonaktif di recipe: ${inactiveIngredients
          .map((x) => x.name)
          .join(", ")}.`
      );
    }
  }

  if (coreSetupIssues.length) warnings.push(...coreSetupIssues);

  let status = "READY";

  if (!isActive) {
    status = hasAnyRecipe ? "INACTIVE_HAS_RECIPE" : "INACTIVE_NO_RECIPE";
  } else if (!hasAnyRecipe) {
    status = "NO_RECIPE";
  } else if (
    !hasCompleteCoverage ||
    missingCoreIngredients.length ||
    inactiveIngredients.length ||
    coreSetupIssues.length
  ) {
    status = "INCOMPLETE";
  }

  return {
    status,
    hasAnyRecipe,
    fallbackRisk: !hasAnyRecipe,
    totalRows: rows.length,
    allRows,
    smallRows,
    largeRows,
    hasSmallCoverage,
    hasLargeCoverage,
    hasCompleteCoverage,
    missingPortions,
    missingCoreIngredients,
    inactiveIngredients,
    coreSetupIssues,
    warnings,
    isReadyForActiveProduct:
      !!isActive &&
      hasAnyRecipe &&
      hasCompleteCoverage &&
      missingCoreIngredients.length === 0 &&
      inactiveIngredients.length === 0 &&
      coreSetupIssues.length === 0,
  };
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

export default function AdminProducts() {
  const nav = useNavigate();
  const token = localStorage.getItem("admin_token");

  const didLoadRef = useRef(false);

  const [items, setItems] = useState([]);
  const [showInactive, setShowInactive] = useState(false);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [form, setForm] = useState({
    id: "",
    sku: "",
    name: "",
    priceSmall: 10000,
    priceLarge: 15000,
    salesChannel: "REGULAR",
    isActive: true,
  });

  const [ingredients, setIngredients] = useState([]);
  const [ingLoading, setIngLoading] = useState(false);
  const [ingErr, setIngErr] = useState("");

  const [recipeEnabled, setRecipeEnabled] = useState(false);
  const [recipeBusy, setRecipeBusy] = useState(false);
  const [recipeErr, setRecipeErr] = useState("");
  const [recipeMsg, setRecipeMsg] = useState("");
  const [recipeRows, setRecipeRows] = useState([]);
  const [serverRecipeAudit, setServerRecipeAudit] = useState(null);

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

  async function loadIngredients({ silent = false } = {}) {
    if (!token) return;

    if (!silent) {
      setIngErr("");
      setIngLoading(true);
    }

    try {
      const r = await apiGet("/api/admin/ingredients", token);
      setIngredients(r.items || []);
    } catch (e) {
      if (!silent) setIngErr(e?.message || "Gagal load bahan");
      setIngredients([]);
    } finally {
      if (!silent) setIngLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    if (didLoadRef.current) return;

    didLoadRef.current = true;

    load();
    loadIngredients({ silent: true });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token) return;

    if (!form.id) {
      setRecipeEnabled(false);
      setRecipeRows([]);
      setRecipeErr("");
      setRecipeMsg("");
      setServerRecipeAudit(null);
      return;
    }

    async function loadRecipe() {
      setRecipeBusy(true);
      setRecipeErr("");
      setRecipeMsg("");

      try {
        const r = await apiGet(`/api/admin/products/${form.id}/recipe`, token);

        const rows = (r.items || []).map((x) => ({
          ingredientId: x.ingredientId,
          portion: normPortion(x.portion),
          qty: toInt(x.qty, 0),
        }));

        setRecipeRows(rows);
        setRecipeEnabled(rows.length > 0);
        setServerRecipeAudit(r.validation || null);
      } catch (e) {
        setRecipeEnabled(false);
        setRecipeRows([]);
        setServerRecipeAudit(null);
        setRecipeErr(e?.message || "Gagal load recipe");
      } finally {
        setRecipeBusy(false);
      }
    }

    loadRecipe();
  }, [form.id, token]);

  function resetForm() {
    setForm({
      id: "",
      sku: "",
      name: "",
      priceSmall: 10000,
      priceLarge: 15000,
      salesChannel: "REGULAR",
      isActive: true,
    });

    setRecipeEnabled(false);
    setRecipeRows([]);
    setRecipeErr("");
    setRecipeMsg("");
    setServerRecipeAudit(null);
  }

  const editingProduct = useMemo(() => {
    if (!form.id) return null;
    return items.find((x) => x.id === form.id) || null;
  }, [form.id, items]);

  const editingActive = useMemo(() => {
    if (!editingProduct) return !!form.isActive;
    return !!(editingProduct.isActive ?? editingProduct.active);
  }, [editingProduct, form.isActive]);

  const liveRecipeAudit = useMemo(() => {
    return buildLocalRecipeAudit({
      isActive: !!form.isActive,
      recipeEnabled,
      recipeRows,
      ingredients,
    });
  }, [form.isActive, recipeEnabled, recipeRows, ingredients]);

  const recipeAudit = liveRecipeAudit || serverRecipeAudit;

  const visibleItems = useMemo(() => {
    const rows = showInactive
      ? items
      : items.filter((p) => (p.isActive ?? p.active) !== false);

    return [...rows].sort((a, b) => {
      const activeA = (a.isActive ?? a.active) !== false ? 0 : 1;
      const activeB = (b.isActive ?? b.active) !== false ? 0 : 1;
      if (activeA !== activeB) return activeA - activeB;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }, [items, showInactive]);

  const productStats = useMemo(() => {
    const rows = items || [];

    let ready = 0;
    let issue = 0;
    let noRecipe = 0;
    let inactive = 0;

    for (const p of rows) {
      const active = (p.isActive ?? p.active) !== false;
      const audit = p.recipeAudit || {};
      const st = String(audit.status || "").toUpperCase();

      if (!active) inactive += 1;
      if (st === "READY") ready += 1;
      else if (st === "NO_RECIPE") noRecipe += 1;
      else if (!st.startsWith("INACTIVE")) issue += 1;
    }

    return {
      total: rows.length,
      ready,
      issue,
      noRecipe,
      inactive,
    };
  }, [items]);

  function addRecipeRow() {
    setRecipeRows((prev) => [...prev, { ingredientId: "", portion: "ALL", qty: 1 }]);
  }

  function updateRecipeRow(idx, patch) {
    setRecipeRows((prev) =>
      prev.map((row, index) => (index === idx ? { ...row, ...patch } : row))
    );
  }

  function removeRecipeRow(idx) {
    setRecipeRows((prev) => prev.filter((_, index) => index !== idx));
  }

  function buildRecipePayload(overrideRows = null) {
    const source = Array.isArray(overrideRows) ? overrideRows : recipeRows;

    return (source || [])
      .map((r) => ({
        ingredientId: String(r.ingredientId || "").trim(),
        portion: normPortion(r.portion),
        qty: toInt(r.qty, 0),
      }))
      .filter((r) => r.ingredientId && r.qty > 0);
  }

  async function saveRecipe(productId, overrideRows = null) {
    if (!productId) return null;

    setRecipeBusy(true);
    setRecipeErr("");
    setRecipeMsg("");

    try {
      const payload = buildRecipePayload(overrideRows);
      const r = await apiPut(`/api/admin/products/${productId}/recipe`, { items: payload }, token);

      setServerRecipeAudit(r?.validation || null);
      setRecipeMsg(payload.length ? "Recipe tersimpan." : "Recipe dikosongkan.");

      return r;
    } catch (e) {
      setRecipeErr(e?.message || "Gagal simpan recipe");
      throw e;
    } finally {
      setRecipeBusy(false);
    }
  }

  function applyCburPreset() {
    setRecipeErr("");
    setRecipeMsg("");

    const cireng = (ingredients || []).find(
      (x) => String(x.name || "").trim().toLowerCase() === "cireng"
    );

    if (!cireng) {
      setRecipeErr("Preset gagal. Bahan Cireng belum ada di master ingredients.");
      return;
    }

    setRecipeEnabled(true);

    setRecipeRows((prev) => {
      const cleaned = (prev || []).filter(
        (x) => String(x.ingredientId || "") !== cireng.id
      );

      return [
        ...cleaned,
        { ingredientId: cireng.id, portion: "SMALL", qty: 8 },
        { ingredientId: cireng.id, portion: "LARGE", qty: 13 },
      ];
    });

    setRecipeMsg("Preset CBUR diterapkan. Tambahkan saus atau bahan lain bila diperlukan.");
  }

  async function submit(e) {
    e.preventDefault();

    setErr("");
    setMsg("");
    setRecipeErr("");
    setRecipeMsg("");

    try {
      const payload = {
        sku: String(form.sku || "").trim(),
        name: String(form.name || "").trim(),
        priceSmall: toInt(form.priceSmall, 0),
        priceLarge: toInt(form.priceLarge, 0),
        salesChannel: normSalesChannel(form.salesChannel),
      };

      if (!payload.sku || !payload.name) {
        throw new Error("SKU dan Nama wajib diisi.");
      }

      const desiredActive = !!form.isActive;

      const localAudit = buildLocalRecipeAudit({
        isActive: desiredActive,
        recipeEnabled,
        recipeRows,
        ingredients,
      });

      if (!form.id) {
        const res = await apiPost(
          "/api/admin/products",
          {
            ...payload,
            isActive: false,
          },
          token
        );

        const created = res?.product;

        if (created?.id) {
          if (recipeEnabled) {
            await saveRecipe(created.id);
          }

          if (desiredActive) {
            try {
              await apiPatch(`/api/admin/products/${created.id}`, { isActive: true }, token);
              setMsg("Produk dibuat dan diaktifkan.");
            } catch {
              setMsg("Produk dibuat sebagai INACTIVE. Lengkapi recipe sampai READY lalu aktifkan.");
            }
          } else {
            setMsg("Produk dibuat sebagai INACTIVE.");
          }
        } else {
          setMsg("Produk ditambahkan.");
        }
      } else {
        await apiPatch(`/api/admin/products/${form.id}`, payload, token);

        if (recipeEnabled) {
          await saveRecipe(form.id);
        } else {
          await saveRecipe(form.id, []);
        }

        if (desiredActive !== editingActive) {
          await apiPatch(`/api/admin/products/${form.id}`, { isActive: desiredActive }, token);
        } else if (desiredActive && !localAudit.isReadyForActiveProduct) {
          throw new Error("Produk aktif wajib punya recipe READY. Lengkapi recipe dulu.");
        }

        setMsg("Produk diperbarui.");
      }

      resetForm();
      await load({ silent: true });
    } catch (e2) {
      setErr(e2.message || "Gagal simpan produk");
    }
  }

  function editRow(p) {
    setMsg("");
    setErr("");
    setRecipeErr("");
    setRecipeMsg("");
    setServerRecipeAudit(p.recipeAudit || null);

    const active = !!(p.isActive ?? p.active);

    setForm({
      id: p.id,
      sku: p.sku || "",
      name: p.name || "",
      priceSmall: p.priceSmall ?? 0,
      priceLarge: p.priceLarge ?? 0,
      salesChannel: normSalesChannel(p.salesChannel),
      isActive: active,
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
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
      const updatedAudit = res?.recipeAudit || p.recipeAudit || null;

      setItems((prev) => {
        const next = prev.map((x) => {
          if (x.id !== p.id) return x;

          return {
            ...(updated ? updated : { ...x, isActive: nextActive, active: nextActive }),
            recipeAudit: updatedAudit,
          };
        });

        writeCache(next);

        return next;
      });

      setMsg(`Produk ${nextActive ? "diaktifkan" : "dinonaktifkan"}.`);

      await load({ silent: true });

      return nextActive;
    } catch (e2) {
      setErr(e2.message || "Gagal ubah status produk");
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

  return (
    <main className="adm-bg adm adm-products">
      <div className="adm-shell">
        <section className="adm-main-card">
          <div className="adm-header">
            <div>
              <h2 className="adm-h2">Kelola Menu</h2>

              <div className="adm-subline">
                <span>Tambah, edit, aktifkan, dan susun recipe produk.</span>
              </div>
            </div>

            <div className="adm-actions">
              <button className="btn secondary" type="button" onClick={() => load()}>
                Refresh
              </button>

              <button
                className="btn secondary"
                type="button"
                onClick={() => nav("/admin/inventory")}
              >
                Stok
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
                Memuat produk...
              </span>
            </div>
          ) : null}

          {err ? (
            <div className="adm-alert" role="alert" style={{ marginBottom: 12 }}>
              {err}
            </div>
          ) : null}

          {msg ? (
            <div className="adm-alert adm-alert--ok" role="status" style={{ marginBottom: 12 }}>
              {msg}
            </div>
          ) : null}

          <div className="adm-panels">
            <StatCard label="Total Produk" value={productStats.total} note="Semua channel." />
            <StatCard label="Recipe READY" value={productStats.ready} note="Aman untuk stok." />
            <StatCard label="Perlu Cek" value={productStats.issue} note="Recipe belum ideal." />
            <StatCard label="Nonaktif" value={productStats.inactive} note="Tidak tampil di kasir." />
          </div>

          <div className="adm-panels" style={{ marginTop: 14 }}>
            <section className="adm-panel">
              <div className="adm-panel-head">
                <div>
                  <h3 className="adm-h3">{form.id ? "Edit Produk" : "Tambah Produk"}</h3>
                  <div className="card-subtitle">
                    {form.id ? "Ubah data produk dan recipe." : "Produk baru dibuat aman dari sisi stok."}
                  </div>
                </div>

                {form.id ? <span className="badge">Edit</span> : <span className="badge">Baru</span>}
              </div>

              <form onSubmit={submit} className="adm-form" style={{ marginTop: 14 }}>
                <div className="adm-form-grid">
                  <div className="adm-field">
                    <label htmlFor="product-sku">SKU</label>
                    <input
                      id="product-sku"
                      className="input"
                      value={form.sku}
                      onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                      placeholder="Contoh: CBUR-REG"
                    />
                  </div>

                  <div className="adm-field">
                    <label htmlFor="product-name">Nama Produk</label>
                    <input
                      id="product-name"
                      className="input"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Contoh: Cireng Banjur"
                    />
                  </div>

                  <div className="adm-field">
                    <label htmlFor="price-small">Harga Reguler</label>
                    <input
                      id="price-small"
                      className="input"
                      type="number"
                      min="0"
                      value={form.priceSmall}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, priceSmall: e.target.value }))
                      }
                    />
                  </div>

                  <div className="adm-field">
                    <label htmlFor="price-large">Harga Jumbo</label>
                    <input
                      id="price-large"
                      className="input"
                      type="number"
                      min="0"
                      value={form.priceLarge}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, priceLarge: e.target.value }))
                      }
                    />
                  </div>

                  <div className="adm-field">
                    <label htmlFor="sales-channel">Channel Penjualan</label>
                    <select
                      id="sales-channel"
                      className="input"
                      value={form.salesChannel}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          salesChannel: normSalesChannel(e.target.value),
                        }))
                      }
                    >
                      <option value="REGULAR">REGULAR</option>
                      <option value="GOJEK">GOJEK</option>
                      <option value="ALL">ALL</option>
                    </select>
                  </div>

                  <div className="adm-field">
                    <label>Status Produk</label>
                    <label className="adm-inline" style={{ minHeight: 42 }}>
                      <input
                        type="checkbox"
                        checked={!!form.isActive}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, isActive: e.target.checked }))
                        }
                      />
                      <span>Produk aktif</span>
                    </label>
                  </div>
                </div>

                <section className="adm-panel" style={{ marginTop: 8 }}>
                  <div className="adm-panel-head">
                    <div>
                      <h3 className="adm-h3">Recipe Produk</h3>
                      <div className="card-subtitle">
                        Recipe dipakai untuk auto-deduct stok saat checkout.
                      </div>
                    </div>

                    <RecipeBadge status={recipeAudit?.status} />
                  </div>

                  <div className="adm-form-grid" style={{ marginTop: 12 }}>
                    <div className="adm-check-item">
                      <div className="adm-kpi-label">Rows</div>
                      <div className="adm-list-title">{recipeAudit?.totalRows || 0}</div>
                    </div>

                    <div className="adm-check-item">
                      <div className="adm-kpi-label">Coverage</div>
                      <div className="adm-list-title">
                        {recipeAudit?.hasCompleteCoverage ? "Lengkap" : "Belum lengkap"}
                      </div>
                    </div>

                    <div className="adm-check-item">
                      <div className="adm-kpi-label">Checkout Safety</div>
                      <div className="adm-list-title">
                        {recipeAudit?.isReadyForActiveProduct ? "Aman" : "Perlu cek"}
                      </div>
                    </div>
                  </div>

                  {ingLoading ? (
                    <div className="muted" style={{ marginTop: 12 }}>
                      Memuat bahan...
                    </div>
                  ) : null}

                  {ingErr ? (
                    <div className="adm-alert" style={{ marginTop: 12 }}>
                      {ingErr}

                      <div className="adm-actions" style={{ marginTop: 10 }}>
                        <button
                          className="btn secondary btn--sm"
                          type="button"
                          onClick={() => loadIngredients({ silent: false })}
                        >
                          Reload Bahan
                        </button>

                        <button
                          className="btn secondary btn--sm"
                          type="button"
                          onClick={() => nav("/admin/inventory")}
                        >
                          Buka Stok
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {recipeErr ? (
                    <div className="adm-alert" style={{ marginTop: 12 }}>
                      {recipeErr}
                    </div>
                  ) : null}

                  {recipeMsg ? (
                    <div className="adm-alert adm-alert--ok" style={{ marginTop: 12 }}>
                      {recipeMsg}
                    </div>
                  ) : null}

                  {recipeAudit?.warnings?.length ? (
                    <div className="adm-alert" style={{ marginTop: 12 }}>
                      <b>Catatan recipe:</b>
                      <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                        {recipeAudit.warnings.map((warning, index) => (
                          <li key={index}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="adm-actions-row" style={{ marginTop: 14 }}>
                    <label className="adm-inline">
                      <input
                        type="checkbox"
                        checked={recipeEnabled}
                        onChange={(e) => {
                          setRecipeEnabled(e.target.checked);
                          if (e.target.checked && recipeRows.length === 0) {
                            setRecipeRows([{ ingredientId: "", portion: "ALL", qty: 1 }]);
                          }
                        }}
                      />
                      <span>Gunakan recipe</span>
                    </label>

                    <div className="adm-actions-right">
                      <button
                        className="btn secondary btn--sm"
                        type="button"
                        onClick={addRecipeRow}
                        disabled={!recipeEnabled}
                      >
                        + Bahan
                      </button>

                      <button
                        className="btn secondary btn--sm"
                        type="button"
                        onClick={applyCburPreset}
                        disabled={!recipeEnabled}
                      >
                        Preset CBUR
                      </button>

                      <button
                        className="btn secondary btn--sm"
                        type="button"
                        onClick={() => loadIngredients({ silent: false })}
                        disabled={ingLoading}
                      >
                        Refresh Bahan
                      </button>

                      {form.id ? (
                        <button
                          className="btn secondary btn--sm"
                          type="button"
                          onClick={() => saveRecipe(form.id)}
                          disabled={!recipeEnabled || recipeBusy}
                        >
                          {recipeBusy ? "Menyimpan..." : "Simpan Recipe"}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {recipeEnabled ? (
                    <div className="adm-list" style={{ marginTop: 12 }}>
                      {recipeRows.map((row, idx) => {
                        const selectedIngredient =
                          (ingredients || []).find((x) => x.id === row.ingredientId) || null;

                        return (
                          <div key={idx} className="adm-list-item">
                            <div
                              className="adm-form-grid"
                              style={{
                                gridTemplateColumns:
                                  "minmax(220px, 1.4fr) minmax(120px, .6fr) minmax(100px, .5fr) auto",
                              }}
                            >
                              <div className="adm-field">
                                <label>Bahan</label>
                                <select
                                  className="input"
                                  value={row.ingredientId}
                                  onChange={(e) =>
                                    updateRecipeRow(idx, { ingredientId: e.target.value })
                                  }
                                >
                                  <option value="">Pilih bahan</option>

                                  {(ingredients || []).map((ingredient) => (
                                    <option key={ingredient.id} value={ingredient.id}>
                                      {ingredient.name} ({ingredient.unit})
                                      {ingredient.isGlobal ? " • CENTRAL" : ""}
                                      {ingredient.isActive === false ? " • INACTIVE" : ""}
                                    </option>
                                  ))}
                                </select>

                                {selectedIngredient ? (
                                  <div className="field-hint">
                                    {selectedIngredient.isGlobal
                                      ? "Shared from central"
                                      : "Per gerobak"}
                                    {selectedIngredient.isActive === false ? " • nonaktif" : ""}
                                  </div>
                                ) : null}
                              </div>

                              <div className="adm-field">
                                <label>Portion</label>
                                <select
                                  className="input"
                                  value={row.portion}
                                  onChange={(e) =>
                                    updateRecipeRow(idx, {
                                      portion: normPortion(e.target.value),
                                    })
                                  }
                                >
                                  <option value="ALL">ALL</option>
                                  <option value="SMALL">SMALL</option>
                                  <option value="LARGE">LARGE</option>
                                </select>
                              </div>

                              <div className="adm-field">
                                <label>Qty</label>
                                <input
                                  className="input"
                                  type="number"
                                  min="0"
                                  value={row.qty}
                                  onChange={(e) =>
                                    updateRecipeRow(idx, { qty: e.target.value })
                                  }
                                />
                              </div>

                              <div className="adm-field">
                                <label>&nbsp;</label>
                                <button
                                  className="btn danger btn--sm"
                                  type="button"
                                  onClick={() => removeRecipeRow(idx)}
                                >
                                  Hapus
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {!recipeRows.length ? (
                        <div className="muted">
                          Belum ada bahan recipe. Klik <b>+ Bahan</b> atau gunakan preset.
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="muted" style={{ marginTop: 12 }}>
                      Recipe nonaktif. Untuk stok yang aman, produk aktif sebaiknya punya recipe.
                    </div>
                  )}
                </section>

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

                        <button className="btn danger" type="button" onClick={deleteEditing}>
                          Hapus
                        </button>

                        <button className="btn secondary" type="button" onClick={resetForm}>
                          Batal
                        </button>
                      </>
                    ) : null}

                    <button className="btn" type="submit">
                      {form.id ? "Simpan Perubahan" : "Tambah Produk"}
                    </button>
                  </div>
                </div>
              </form>
            </section>

            <section className="adm-panel">
              <div className="adm-panel-head">
                <div>
                  <h3 className="adm-h3">Daftar Produk</h3>
                  <div className="card-subtitle">Klik produk untuk edit.</div>
                </div>

                <label className="adm-inline">
                  <input
                    type="checkbox"
                    checked={showInactive}
                    onChange={(e) => setShowInactive(e.target.checked)}
                  />
                  <span>Tampilkan inactive</span>
                </label>
              </div>

              <div className="adm-list" role="list" style={{ marginTop: 14 }}>
                {visibleItems.map((p) => {
                  const active = !!(p.isActive ?? p.active);
                  const audit = p.recipeAudit || {};
                  const warnings = Array.isArray(audit.warnings) ? audit.warnings : [];

                  return (
                    <button
                      key={p.id}
                      type="button"
                      className="adm-list-item"
                      role="listitem"
                      onClick={() => editRow(p)}
                      style={{ textAlign: "left", cursor: "pointer" }}
                    >
                      <div className="adm-list-top" style={{ alignItems: "center" }}>
                        <div className="adm-list-sku" title={p.sku}>
                          {p.sku || "-"}
                        </div>

                        <div className="adm-list-badges">
                          <span className="adm-badge">{salesChannelLabel(p.salesChannel)}</span>

                          <span className={active ? "adm-badge adm-badge--cash" : "adm-badge"}>
                            {active ? "ACTIVE" : "INACTIVE"}
                          </span>

                          <RecipeBadge status={audit.status} />
                        </div>
                      </div>

                      <div className="adm-list-name" style={{ marginTop: 8 }}>
                        {p.name}
                      </div>

                      <div className="adm-list-price" style={{ marginTop: 4 }}>
                        <span className="muted">Reguler</span> <b>Rp {idr(p.priceSmall)}</b>
                        <span className="adm-dot">•</span>
                        <span className="muted">Jumbo</span> <b>Rp {idr(p.priceLarge)}</b>
                      </div>

                      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                        Recipe rows: {Number(p.recipeCount || audit.totalRows || 0)}
                      </div>

                      <div className="muted" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.45 }}>
                        {warnings.length
                          ? warnings[0]
                          : String(audit.status || "").toUpperCase() === "READY"
                          ? "Recipe siap untuk auto-deduct stok."
                          : "Belum ada catatan tambahan."}
                      </div>
                    </button>
                  );
                })}

                {!visibleItems.length ? (
                  <div className="adm-list-item">
                    <div className="adm-list-name">Belum ada produk.</div>
                    <div className="muted">Tambahkan produk dari form di sebelah kiri.</div>
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