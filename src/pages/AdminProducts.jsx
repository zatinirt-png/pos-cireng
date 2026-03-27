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
      borderColor: "rgba(34,197,94,0.24)",
      background: "rgba(34,197,94,0.10)",
      color: "#166534",
      label: "READY",
    };
  }
  if (s === "NO_RECIPE") {
    return {
      borderColor: "rgba(234,47,20,0.28)",
      background: "rgba(234,47,20,0.12)",
      color: "#7f1d1d",
      label: "NO RECIPE",
    };
  }
  if (s === "INCOMPLETE") {
    return {
      borderColor: "rgba(248,82,8,0.28)",
      background: "rgba(248,82,8,0.12)",
      color: "#9a3412",
      label: "INCOMPLETE",
    };
  }
  if (s.startsWith("INACTIVE")) {
    return {
      borderColor: "rgba(148,163,184,0.30)",
      background: "rgba(148,163,184,0.12)",
      color: "#475569",
      label: "INACTIVE",
    };
  }
  return {
    borderColor: "rgba(255,176,1,0.34)",
    background: "rgba(255,176,1,0.16)",
    color: "#854d0e",
    label: s || "CHECK",
  };
}

function RecipeBadge({ status }) {
  const tone = getRecipeTone(status);
  return (
    <span
      className="adm-badge"
      style={{
        borderColor: tone.borderColor,
        background: tone.background,
        color: tone.color,
        whiteSpace: "nowrap",
      }}
    >
      {tone.label}
    </span>
  );
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
    else if (row.portion === "SMALL") smallRows += 1;
    else if (row.portion === "LARGE") largeRows += 1;

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
      inactiveIngredients.push({ id: ing.id, name: ing.name });
    }
  }

  function ingredientCovered(ingredientId) {
    const row = byIngredient.get(String(ingredientId || ""));
    if (!row) return false;
    return !!(row.all || (row.small && row.large));
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
    warnings.push("Belum ada recipe. Saat ini produk belum aman untuk auto-deduct.");
  } else {
    if (!hasCompleteCoverage) warnings.push(`Coverage portion belum lengkap: ${missingPortions.join(", ")}.`);
    if (missingCoreIngredients.length) warnings.push(`Bahan wajib belum lengkap: ${missingCoreIngredients.join(", ")}.`);
    if (inactiveIngredients.length) warnings.push(`Ada bahan nonaktif di recipe: ${inactiveIngredients.map((x) => x.name).join(", ")}.`);
  }
  if (coreSetupIssues.length) warnings.push(...coreSetupIssues);

  let status = "READY";
  if (!isActive) {
    status = hasAnyRecipe ? "INACTIVE_HAS_RECIPE" : "INACTIVE_NO_RECIPE";
  } else if (!hasAnyRecipe) {
    status = "NO_RECIPE";
  } else if (!hasCompleteCoverage || missingCoreIngredients.length || inactiveIngredients.length || coreSetupIssues.length) {
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

    (async () => {
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
    })();
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

  function addRecipeRow() {
    setRecipeRows((prev) => [...prev, { ingredientId: "", portion: "ALL", qty: 1 }]);
  }

  function updateRecipeRow(idx, patch) {
    setRecipeRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function removeRecipeRow(idx) {
    setRecipeRows((prev) => prev.filter((_, i) => i !== idx));
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
      setRecipeErr("Preset gagal. Bahan wajib Cireng belum ada di master ingredients.");
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

    setRecipeMsg("Preset CBUR diterapkan. Tambahkan saus, topping, atau kemasan bila diperlukan.");
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

      if (!payload.sku || !payload.name) throw new Error("SKU dan Nama wajib diisi.");

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
              setMsg("Produk dibuat dan langsung diaktifkan karena recipe sudah READY.");
            } catch (e2) {
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

    const ok = window.confirm(`Hapus permanen produk "${p.name}"?\nTindakan ini tidak bisa dibatalkan.`);
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

  const productStats = useMemo(() => {
    const rows = items || [];
    let ready = 0;
    let issue = 0;
    let noRecipe = 0;
    let inactive = 0;

    for (const p of rows) {
      const audit = p.recipeAudit || {};
      const st = String(audit.status || "").toUpperCase();
      if (st === "READY") ready += 1;
      else if (st === "NO_RECIPE") noRecipe += 1;
      else if (st.startsWith("INACTIVE")) inactive += 1;
      else issue += 1;
    }

    return {
      total: rows.length,
      ready,
      issue,
      noRecipe,
      inactive,
    };
  }, [items]);

  return (
    <div className="adm-bg adm adm-products">
      <div className="adm-shell">
        <div className="adm-layout">
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

          <main className="adm-main">
            <div className="adm-main-card">
              <div className="adm-header">
                <div>
                  <h2 className="adm-h2">Kelola Menu</h2>
                  <div className="adm-subline">
                    <span className="muted">Tambah/edit menu + validasi recipe supaya stok aman saat checkout.</span>
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
              {err ? <div className="adm-alert" style={{ marginTop: 12 }}>{err}</div> : null}
              {msg ? <div className="adm-alert adm-alert--ok" style={{ marginTop: 12 }}>{msg}</div> : null}

              <div className="adm-alert adm-alert--ok" style={{ marginTop: 12 }}>
                Produk baru akan dibuat lebih aman. Lengkapi recipe dulu, lalu aktifkan saat status recipe sudah <b>READY</b>.
              </div>

              <div className="adm-panels" style={{ marginTop: 14, gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
                <section className="adm-panel adm-panel--kpi">
                  <div className="adm-panel-head"><h3 className="adm-h3">Total Produk</h3></div>
                  <div style={{ fontSize: 28, fontWeight: 900 }}>{productStats.total}</div>
                </section>
                <section className="adm-panel adm-panel--kpi">
                  <div className="adm-panel-head"><h3 className="adm-h3">Recipe READY</h3></div>
                  <div style={{ fontSize: 28, fontWeight: 900 }}>{productStats.ready}</div>
                </section>
                <section className="adm-panel adm-panel--kpi">
                  <div className="adm-panel-head"><h3 className="adm-h3">Perlu Perbaikan</h3></div>
                  <div style={{ fontSize: 28, fontWeight: 900 }}>{productStats.issue}</div>
                </section>
                <section className="adm-panel adm-panel--kpi">
                  <div className="adm-panel-head"><h3 className="adm-h3">Tanpa Recipe</h3></div>
                  <div style={{ fontSize: 28, fontWeight: 900 }}>{productStats.noRecipe}</div>
                </section>
              </div>

              <div className="adm-panels" style={{ marginTop: 14 }}>
                <section className="adm-panel">
                  <div className="adm-panel-head">
                    <h3 className="adm-h3">{form.id ? "Edit Produk" : "Tambah Produk"}</h3>
                    {form.id ? <span className="muted">ID: {form.id}</span> : <span className="muted">Create</span>}
                  </div>

                  <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                    Channel saat ini: <b>{salesChannelLabel(form.salesChannel)}</b>
                  </div>

                  <form onSubmit={submit} className="adm-form">
                    <div className="adm-form-grid">
                      <div className="adm-field">
                        <label>SKU (manual)</label>
                        <input className="input" value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} />
                      </div>

                      <div className="adm-field">
                        <label>Nama Produk</label>
                        <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                      </div>

                      <div className="adm-field">
                        <label>Harga Kecil</label>
                        <input className="input" type="number" value={form.priceSmall} onChange={(e) => setForm((f) => ({ ...f, priceSmall: e.target.value }))} />
                      </div>

                      <div className="adm-field">
                        <label>Harga Besar</label>
                        <input className="input" type="number" value={form.priceLarge} onChange={(e) => setForm((f) => ({ ...f, priceLarge: e.target.value }))} />
                      </div>
                      <div className="adm-field">
                        <label>Channel Penjualan</label>
                        <select
                          className="input"
                          value={form.salesChannel}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, salesChannel: normSalesChannel(e.target.value) }))
                          }
                        >
                          <option value="REGULAR">REGULAR</option>
                          <option value="GOJEK">GOJEK</option>
                          <option value="ALL">ALL</option>
                        </select>
                      </div>
                    </div>

                    <div className="adm-actions-row">
                      <label className="adm-inline">
                        <input type="checkbox" checked={!!form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
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

                    {form.id ? (
                      <div className="adm-edit-actions">
                        <div className="adm-edit-status">
                          <span className="muted">Status Produk:</span>{" "}
                          <span className={editingActive ? "adm-badge adm-badge--cash" : "adm-badge"}>
                            {editingActive ? "ACTIVE" : "INACTIVE"}
                          </span>
                        </div>

                        <div className="adm-edit-buttons">
                          <button className={editingActive ? "btn danger" : "btn"} type="button" onClick={toggleEditingActive}>
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
                          Produk aktif akan dicek recipe-nya dulu. Kalau belum READY, aktivasi akan ditolak.
                        </div>
                      </div>
                    ) : null}

                    <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                      <div className="adm-panel-head" style={{ marginBottom: 8 }}>
                        <h3 className="adm-h3" style={{ margin: 0 }}>Recipe Builder</h3>

                        <label className="adm-inline">
                          <input
                            type="checkbox"
                            checked={recipeEnabled}
                            onChange={(e) => {
                              const v = e.target.checked;
                              setRecipeEnabled(v);
                              setRecipeErr("");
                              setRecipeMsg("");
                              if (v && !ingredients.length) loadIngredients({ silent: false });
                            }}
                          />
                          <span>Aktifkan recipe</span>
                        </label>
                      </div>

                      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                        Recipe menentukan auto-deduct stok. Tidak ada bahan wajib pada recipe. Susun bahan sesuai kebutuhan menu.
                      </div>

                      {ingLoading ? <div className="muted">Loading bahan...</div> : null}

                      {ingErr ? (
                        <div className="adm-alert" style={{ marginBottom: 10 }}>
                          {ingErr}
                          <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
                            <button className="btn secondary btn--sm" type="button" onClick={() => loadIngredients({ silent: false })}>
                              Reload bahan
                            </button>
                            <button className="btn secondary btn--sm" type="button" onClick={() => nav("/admin/inventory")}>
                              Buka Stok
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {recipeErr ? <div className="adm-alert" style={{ marginBottom: 10 }}>{recipeErr}</div> : null}
                      {recipeMsg ? <div className="adm-alert adm-alert--ok" style={{ marginBottom: 10 }}>{recipeMsg}</div> : null}

                      <div
                        style={{
                          border: "1px solid rgba(0,0,0,0.08)",
                          borderRadius: 14,
                          padding: 14,
                          background: "#fffdfa",
                          marginBottom: 12,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                            <div style={{ fontWeight: 800 }}>Status Recipe</div>
                            <RecipeBadge status={recipeAudit?.status} />
                          </div>

                          <div className="muted" style={{ fontSize: 12 }}>
                            Rows: {recipeAudit?.totalRows || 0} • ALL {recipeAudit?.allRows || 0} • SMALL {recipeAudit?.smallRows || 0} • LARGE {recipeAudit?.largeRows || 0}
                          </div>
                        </div>

                        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(3, minmax(0,1fr))", marginTop: 12 }}>
                          <div className="pos-card" style={{ padding: 10 }}>
                            <div className="muted" style={{ fontSize: 12 }}>Coverage</div>
                            <div style={{ fontWeight: 800 }}>
                              {recipeAudit?.hasCompleteCoverage ? "Lengkap" : `Kurang ${recipeAudit?.missingPortions?.join(", ") || "-"}`}
                            </div>
                          </div>

                          <div className="pos-card" style={{ padding: 10 }}>
                            <div className="muted" style={{ fontSize: 12 }}>Bahan Wajib</div>
                            <div style={{ fontWeight: 800 }}>
                              {recipeAudit?.missingCoreIngredients?.length
                                ? `Kurang ${recipeAudit.missingCoreIngredients.join(", ")}`
                                : "Resep siap"}
                            </div>
                          </div>

                          <div className="pos-card" style={{ padding: 10 }}>
                            <div className="muted" style={{ fontSize: 12 }}>Checkout Safety</div>
                            <div style={{ fontWeight: 800 }}>
                              {recipeAudit?.isReadyForActiveProduct ? "Aman untuk ACTIVE" : "Belum aman"}
                            </div>
                          </div>
                        </div>

                        {recipeAudit?.warnings?.length ? (
                          <div style={{ marginTop: 12 }}>
                            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Warnings</div>
                            <ul style={{ margin: 0, paddingLeft: 18 }}>
                              {recipeAudit.warnings.map((w, idx) => (
                                <li key={idx} style={{ marginBottom: 4 }}>{w}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>

                      {recipeEnabled ? (
                        <>
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                            <button className="btn secondary btn--sm" type="button" onClick={addRecipeRow}>
                              + Tambah bahan
                            </button>

                            <button className="btn secondary btn--sm" type="button" onClick={applyCburPreset}>
                              Preset CBUR (8/13 Cireng)
                            </button>

                            {form.id ? (
                              <button className="btn secondary btn--sm" type="button" onClick={() => saveRecipe(form.id)} disabled={recipeBusy}>
                                {recipeBusy ? "Menyimpan..." : "Simpan Recipe"}
                              </button>
                            ) : (
                              <span className="muted" style={{ fontSize: 12 }}>
                                Recipe akan tersimpan setelah produk dibuat.
                              </span>
                            )}

                            <button className="btn secondary btn--sm" type="button" onClick={() => loadIngredients({ silent: false })} disabled={ingLoading}>
                              Refresh bahan
                            </button>
                          </div>

                          <div style={{ display: "grid", gap: 10 }}>
                            {(recipeRows || []).map((r, idx) => {
                              const ing = (ingredients || []).find((x) => x.id === r.ingredientId) || null;
                              return (
                                <div
                                  key={idx}
                                  className="pos-card"
                                  style={{
                                    padding: 12,
                                    display: "grid",
                                    gridTemplateColumns: "1fr 140px 120px 90px",
                                    gap: 10,
                                    alignItems: "center",
                                  }}
                                >
                                  <div>
                                    <label className="muted" style={{ fontSize: 12 }}>Bahan</label>
                                    <select className="input" value={r.ingredientId} onChange={(e) => updateRecipeRow(idx, { ingredientId: e.target.value })}>
                                      <option value="">-- pilih bahan --</option>
                                      {(ingredients || []).map((x) => (
                                        <option key={x.id} value={x.id}>
                                          {x.name} ({x.unit})
                                          {x.isGlobal ? " • CENTRAL" : ""}
                                          {x.isActive === false ? " • INACTIVE" : ""}
                                        </option>
                                      ))}
                                    </select>
                                    {ing ? (
                                      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                                        {ing.isGlobal ? "Shared from central" : "Per gerobak"}
                                        {ing.isActive === false ? " • nonaktif" : ""}
                                      </div>
                                    ) : null}
                                  </div>

                                  <div>
                                    <label className="muted" style={{ fontSize: 12 }}>Portion</label>
                                    <select className="input" value={r.portion} onChange={(e) => updateRecipeRow(idx, { portion: e.target.value })}>
                                      <option value="ALL">ALL</option>
                                      <option value="SMALL">SMALL</option>
                                      <option value="LARGE">LARGE</option>
                                    </select>
                                  </div>

                                  <div>
                                    <label className="muted" style={{ fontSize: 12 }}>Qty</label>
                                    <input className="input" type="number" value={r.qty} onChange={(e) => updateRecipeRow(idx, { qty: e.target.value })} min={0} />
                                  </div>

                                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                    <button className="btn danger btn--sm" type="button" onClick={() => removeRecipeRow(idx)}>
                                      Hapus
                                    </button>
                                  </div>
                                </div>
                              );
                            })}

                            {!recipeRows.length ? (
                              <div className="muted" style={{ fontSize: 12 }}>
                                Belum ada bahan recipe. Klik <b>Tambah bahan</b> atau gunakan <b>Preset CBUR</b>.
                              </div>
                            ) : null}
                          </div>
                        </>
                      ) : (
                        <div className="muted" style={{ fontSize: 12 }}>
                          Recipe nonaktif. Untuk sistem stok yang aman, sebaiknya produk aktif punya recipe lengkap.
                        </div>
                      )}
                    </div>
                  </form>
                </section>

                <section className="adm-panel">
                  <div className="adm-panel-head">
                    <h3 className="adm-h3">Daftar Produk</h3>
                    <label className="adm-inline">
                      <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
                      <span>Tampilkan INACTIVE</span>
                    </label>
                  </div>

                  <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                    Klik item untuk edit. Status recipe sekarang langsung terlihat dari daftar produk.
                  </div>

                  <div className="adm-list" role="list">
                    {visibleItems.map((p) => {
                      const active = !!(p.isActive ?? p.active);
                      const audit = p.recipeAudit || {};
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
                          <div className="adm-list-top" style={{ alignItems: "center" }}>
                            <div className="adm-list-sku" title={p.sku}>{p.sku}</div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                              <span className="adm-badge">
                                {salesChannelLabel(p.salesChannel)}
                              </span>
                              <span className={active ? "adm-badge adm-badge--cash" : "adm-badge"}>
                                {active ? "ACTIVE" : "INACTIVE"}
                              </span>
                              <RecipeBadge status={audit.status} />
                            </div>
                          </div>

                          <div className="adm-list-name">{p.name}</div>

                          <div className="adm-list-price">
                            <span className="muted">Kecil</span> <b>{idr(p.priceSmall)}</b>
                            <span className="adm-dot">•</span>
                            <span className="muted">Besar</span> <b>{idr(p.priceLarge)}</b>
                          </div>

                          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                            Recipe rows: {Number(p.recipeCount || audit.totalRows || 0)}
                          </div>

                          {audit.warnings?.length ? (
                            <div className="muted" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.45 }}>
                              {audit.warnings[0]}
                            </div>
                          ) : (
                            <div className="muted" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.45 }}>
                              {String(audit.status || "").toUpperCase() === "READY"
                                ? "Recipe siap untuk auto-deduct dan aktivasi produk."
                                : "Belum ada warning tambahan."}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {!visibleItems.length ? <div className="muted" style={{ padding: 10 }}>Belum ada produk.</div> : null}
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