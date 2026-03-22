import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../api";
import { useNavigate } from "react-router-dom";
import Tabs from "../components/ui/Tabs";
import Modal from "../components/ui/Modal";
import TransferRequestsPanel from "../components/admin/TransferRequestsPanel";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

function fmtDT(dt) {
  if (!dt) return "-";
  try {
    return new Date(dt).toLocaleString("id-ID");
  } catch {
    return String(dt);
  }
}

function cleanInt(v, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function compactCentralInfo(row) {
  const reason = String(row?.lastReason || "").trim().toUpperCase();
  const note = String(row?.lastNote || "").trim().toLowerCase();

  if (note.includes("transfer to cart")) return "Transfer to Cart";
  if (note.includes("opening stock")) return "Opening Stock";
  if (reason === "SHIFT_OPENING") return "Shift Opening";
  if (reason === "TRANSFER_OUT") return "Transfer to Cart";
  if (reason === "TRANSFER_IN") return "Transfer In";
  if (reason === "ADJUSTMENT") return "Adjustment";
  if (reason === "SALE_CONSUME") return "Sale Consume";
  return reason || "-";
}

function getStockStatusTone(status) {
  const s = String(status || "OK").toUpperCase();
  if (s === "OUT_OF_STOCK") {
    return {
      borderColor: "rgba(234,47,20,0.28)",
      background: "rgba(234,47,20,0.12)",
      color: "#7f1d1d",
    };
  }
  if (s === "LOW_STOCK") {
    return {
      borderColor: "rgba(248,82,8,0.28)",
      background: "rgba(248,82,8,0.12)",
      color: "#9a3412",
    };
  }
  if (s === "REORDER") {
    return {
      borderColor: "rgba(255,176,1,0.34)",
      background: "rgba(255,176,1,0.16)",
      color: "#854d0e",
    };
  }
  return {
    borderColor: "rgba(34,197,94,0.24)",
    background: "rgba(34,197,94,0.10)",
    color: "#166534",
  };
}

function statusBadge(status) {
  const tone = getStockStatusTone(status);
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
      {String(status || "OK").replaceAll("_", " ")}
    </span>
  );
}

function csvCell(v) {
  const s = v == null ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function downloadTextFile(filename, text, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function summarizeRows(rows = []) {
  const out = {
    totalItems: 0,
    totalQty: 0,
    ok: 0,
    reorder: 0,
    lowStock: 0,
    outOfStock: 0,
  };

  for (const row of rows) {
    out.totalItems += 1;
    out.totalQty += Number(row?.qty || 0);
    const st = String(row?.stockStatus || "OK").toUpperCase();
    if (st === "OUT_OF_STOCK") out.outOfStock += 1;
    else if (st === "LOW_STOCK") out.lowStock += 1;
    else if (st === "REORDER") out.reorder += 1;
    else out.ok += 1;
  }
  return out;
}

function normalizeIngredientForm(raw = {}) {
  return {
    id: raw.id || "",
    name: raw.name || "",
    code: raw.code || "",
    category: raw.category || "RAW",
    unit: raw.unit || "PCS",
    minStock: raw.minStock ?? 0,
    reorderPoint: raw.reorderPoint ?? 0,
    parStock: raw.parStock ?? 0,
    displayOrder: raw.displayOrder ?? 0,
    notes: raw.notes || "",
    isGlobal: !!raw.isGlobal,
    allowNegative: raw.allowNegative == null ? true : !!raw.allowNegative,
    autoDeduct: !!raw.autoDeduct,
    isActive: raw.isActive == null ? true : !!raw.isActive,
  };
}

export default function AdminInventory() {
  const nav = useNavigate();
  const token = localStorage.getItem("admin_token");
  const didLoadRef = useRef(false);

  const [tab, setTab] = useState("STOCK"); // STOCK | TRANSFER | ING

  const [carts, setCarts] = useState([]);
  const [selectedCartId, setSelectedCartId] = useState("");
  const selectedCart = useMemo(
    () => (carts || []).find((c) => c.id === selectedCartId) || null,
    [carts, selectedCartId]
  );

  const [scope, setScope] = useState("CART");
  const [qStock, setQStock] = useState("");
  const [statusStock, setStatusStock] = useState("ALL");
  const [onlyZero, setOnlyZero] = useState(false);
  const [showInactiveStock, setShowInactiveStock] = useState(false);

  const [stocks, setStocks] = useState([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [errStock, setErrStock] = useState("");
  const [msgStock, setMsgStock] = useState("");
  const [bootstrapBusy, setBootstrapBusy] = useState(false);

  const [adjOpen, setAdjOpen] = useState(false);
  const [adjBusy, setAdjBusy] = useState(false);
  const [adjErr, setAdjErr] = useState("");
  const [adjForm, setAdjForm] = useState({
    ingredientId: "",
    name: "",
    unit: "",
    isGlobal: false,
    mode: "SET",
    value: 0,
    reason: "ADJUSTMENT",
    note: "",
  });

  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerBusy, setLedgerBusy] = useState(false);
  const [ledgerErr, setLedgerErr] = useState("");
  const [ledgerFor, setLedgerFor] = useState(null);
  const [ledgerItems, setLedgerItems] = useState([]);

  const [qIng, setQIng] = useState("");
  const [showInactiveIng, setShowInactiveIng] = useState(false);
  const [ingLoading, setIngLoading] = useState(false);
  const [ingErr, setIngErr] = useState("");
  const [ingMsg, setIngMsg] = useState("");
  const [ingItems, setIngItems] = useState([]);
  const [ingForm, setIngForm] = useState(normalizeIngredientForm());

  useEffect(() => {
    if (!token) nav("/admin");
  }, [token, nav]);

  function logout() {
    localStorage.removeItem("admin_token");
    nav("/admin");
  }

  async function loadCarts() {
    const r = await apiGet("/api/admin/carts", token);
    const list = r.carts || [];
    setCarts(list);
    if (!selectedCartId) {
      const firstActive = list.find((c) => (c.isActive ?? true) !== false) || list[0];
      if (firstActive?.id) setSelectedCartId(firstActive.id);
    }
  }

  async function loadStocks({ silent = false } = {}) {
    if (!token) return;
    if (scope === "CART" && !selectedCartId) return;

    if (!silent) {
      setLoadingStock(true);
      setErrStock("");
      setMsgStock("");
    }

    try {
      const q = qStock.trim();

      if (scope === "CENTRAL") {
        const qs = new URLSearchParams();
        qs.set("scope", "CENTRAL");
        if (q) qs.set("q", q);
        if (showInactiveStock) qs.set("includeInactive", "true");

        const r = await apiGet(`/api/admin/inventory/stocks?${qs.toString()}`, token);
        setStocks((r.items || []).map((row) => ({ ...row, source: "CENTRAL" })));
        return;
      }

      const qsCart = new URLSearchParams();
      qsCart.set("scope", "CART");
      qsCart.set("cartId", selectedCartId);
      if (q) qsCart.set("q", q);
      if (showInactiveStock) qsCart.set("includeInactive", "true");

      const qsCentral = new URLSearchParams();
      qsCentral.set("scope", "CENTRAL");
      if (q) qsCentral.set("q", q);
      if (showInactiveStock) qsCentral.set("includeInactive", "true");

      const [cartRes, centralRes] = await Promise.all([
        apiGet(`/api/admin/inventory/stocks?${qsCart.toString()}`, token),
        apiGet(`/api/admin/inventory/stocks?${qsCentral.toString()}`, token),
      ]);

      const cartItems = cartRes.items || [];
      const centralItems = centralRes.items || [];
      const centralMap = new Map(centralItems.map((x) => [x.ingredientId, x]));

      const merged = cartItems.map((row) => {
        const ing = row.ingredient || {};
        if (!ing.isGlobal) return { ...row, source: "CART" };

        const central = centralMap.get(row.ingredientId);
        return {
          ...row,
          qty: central ? Number(central.qty || 0) : 0,
          stockStatus: central?.stockStatus || row.stockStatus,
          suggestedOrderQty: central?.suggestedOrderQty ?? row.suggestedOrderQty ?? 0,
          isLowStock: !!central?.isLowStock,
          isOutOfStock: !!central?.isOutOfStock,
          lastMovementAt: central?.lastMovementAt ?? null,
          lastDelta: central?.lastDelta ?? null,
          lastType: central?.lastType ?? null,
          lastReason: central?.lastReason ?? null,
          lastNote: central?.lastNote ?? null,
          lastBalanceAfter: central?.lastBalanceAfter ?? null,
          source: "CENTRAL",
        };
      });

      setStocks(merged);
    } catch (e) {
      if (!silent) setErrStock(e?.message || "Gagal load stok");
    } finally {
      if (!silent) setLoadingStock(false);
    }
  }

  async function bootstrapInventory() {
    if (!token) return;
    setBootstrapBusy(true);
    setErrStock("");
    setMsgStock("");
    try {
      await apiPost("/api/admin/inventory/bootstrap", {}, token);
      setMsgStock("Inventory schema berhasil dibootstrap. Silakan refresh.");
      await loadStocks({ silent: true });
    } catch (e) {
      setErrStock(e?.message || "Gagal bootstrap inventory");
    } finally {
      setBootstrapBusy(false);
    }
  }

  async function loadIngredients({ silent = false } = {}) {
    if (!token) return;
    if (!silent) {
      setIngLoading(true);
      setIngErr("");
      setIngMsg("");
    }

    try {
      const qs = new URLSearchParams();
      if (qIng.trim()) qs.set("q", qIng.trim());
      if (!showInactiveIng) qs.set("active", "true");
      const r = await apiGet(`/api/admin/ingredients?${qs.toString()}`, token);
      setIngItems(r.items || []);
    } catch (e) {
      if (!silent) setIngErr(e?.message || "Gagal load bahan");
    } finally {
      if (!silent) setIngLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    if (didLoadRef.current) return;
    didLoadRef.current = true;

    (async () => {
      try {
        await loadCarts();
      } catch (e) {
        setErrStock(e?.message || "Gagal load gerobak");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token) return;
    if (tab !== "STOCK") return;
    loadStocks({ silent: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tab, scope, selectedCartId, showInactiveStock]);

  useEffect(() => {
    if (!token) return;
    if (tab !== "ING") return;
    loadIngredients({ silent: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tab, showInactiveIng]);

  function openAdjust(row, mode = "SET") {
    const ing = row?.ingredient || {};
    setAdjErr("");
    setAdjForm({
      ingredientId: row.ingredientId,
      name: ing.name || "(Bahan)",
      unit: ing.unit || "-",
      isGlobal: !!ing.isGlobal,
      mode,
      value: mode === "DELTA" ? 0 : Number(row.qty ?? 0),
      reason: "ADJUSTMENT",
      note: "",
    });
    setAdjOpen(true);
  }

  async function submitAdjust() {
    if (adjBusy) return;
    setAdjErr("");
    setAdjBusy(true);

    try {
      const ingredientId = String(adjForm.ingredientId || "").trim();
      if (!ingredientId) throw new Error("ingredientId kosong.");

      const mode = String(adjForm.mode || "SET").toUpperCase();
      const v = Number(adjForm.value);
      if (mode === "SET") {
        if (!Number.isFinite(v) || v < 0) throw new Error("SET qty harus angka >= 0.");
      } else {
        if (!Number.isFinite(v) || v === 0) throw new Error("DELTA tidak boleh 0.");
      }

      const payload = {
        scope,
        cartId: scope === "CART" ? selectedCartId : null,
        ingredientId,
        mode,
        reason: String(adjForm.reason || "ADJUSTMENT"),
        note: String(adjForm.note || "").slice(0, 200) || null,
        ...(mode === "SET" ? { setQty: Math.floor(v) } : { delta: Math.floor(v) }),
      };

      await apiPost("/api/admin/inventory/adjust", payload, token);
      setAdjOpen(false);
      setMsgStock("Stok berhasil diupdate.");
      await loadStocks({ silent: true });
    } catch (e) {
      setAdjErr(e?.message || "Gagal adjust stok");
    } finally {
      setAdjBusy(false);
    }
  }

  async function openLedger(row) {
    const ing = row?.ingredient || {};
    const ingredientId = row?.ingredientId;

    setLedgerErr("");
    setLedgerItems([]);
    setLedgerFor({
      ingredientId,
      name: ing.name || "(Bahan)",
      unit: ing.unit || "-",
      isGlobal: !!ing.isGlobal,
    });
    setLedgerOpen(true);
    setLedgerBusy(true);

    try {
      const ingIsGlobal = !!ing.isGlobal;
      const limit = 80;

      const fetchLedger = async (sc) => {
        const qs = new URLSearchParams();
        qs.set("scope", sc);
        if (sc === "CART") qs.set("cartId", selectedCartId);
        qs.set("ingredientId", ingredientId);
        qs.set("limit", String(limit));
        const r = await apiGet(`/api/admin/inventory/ledger?${qs.toString()}`, token);
        return (r.items || []).map((x) => ({
          ...x,
          source: sc === "CENTRAL" ? "CENTRAL" : "CART",
        }));
      };

      if (scope === "CENTRAL") {
        setLedgerItems(await fetchLedger("CENTRAL"));
        return;
      }

      const cartLedger = await fetchLedger("CART");
      if (!ingIsGlobal) {
        setLedgerItems(cartLedger);
        return;
      }

      const centralLedger = await fetchLedger("CENTRAL");
      setLedgerItems(
        [...cartLedger, ...centralLedger]
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, limit)
      );
    } catch (e) {
      setLedgerErr(e?.message || "Gagal load ledger");
    } finally {
      setLedgerBusy(false);
    }
  }

  function resetIngForm() {
    setIngForm(normalizeIngredientForm());
  }

  function editIng(item) {
    setIngErr("");
    setIngMsg("");
    setIngForm(normalizeIngredientForm(item));
  }

  async function submitIng(e) {
    e.preventDefault();
    setIngErr("");
    setIngMsg("");

    try {
      const payload = {
        name: String(ingForm.name || "").trim(),
        code: String(ingForm.code || "").trim() || null,
        category: String(ingForm.category || "RAW").trim() || "RAW",
        unit: String(ingForm.unit || "PCS").toUpperCase(),
        minStock: cleanInt(ingForm.minStock),
        reorderPoint: cleanInt(ingForm.reorderPoint),
        parStock: cleanInt(ingForm.parStock),
        displayOrder: cleanInt(ingForm.displayOrder),
        notes: String(ingForm.notes || "").trim() || null,
        isGlobal: !!ingForm.isGlobal,
        allowNegative: !!ingForm.allowNegative,
        autoDeduct: !!ingForm.autoDeduct,
      };

      if (!payload.name || payload.name.length < 2) {
        throw new Error("Nama bahan minimal 2 karakter.");
      }
      if (payload.reorderPoint < payload.minStock) {
        throw new Error("Reorder point tidak boleh lebih kecil dari minimum stock.");
      }
      if (payload.parStock < payload.reorderPoint) {
        throw new Error("Par stock tidak boleh lebih kecil dari reorder point.");
      }

      if (!ingForm.id) {
        await apiPost("/api/admin/ingredients", payload, token);
        setIngMsg("Bahan ditambahkan.");
      } else {
        await apiPatch(`/api/admin/ingredients/${ingForm.id}`, { ...payload, isActive: !!ingForm.isActive }, token);
        setIngMsg("Bahan diperbarui.");
      }

      resetIngForm();
      await loadIngredients({ silent: true });
      await loadStocks({ silent: true });
    } catch (e2) {
      setIngErr(e2?.message || "Gagal simpan bahan");
    }
  }

  async function toggleIngActive(item) {
    setIngErr("");
    setIngMsg("");
    try {
      const next = !((item.isActive ?? true) !== false);
      await apiPatch(`/api/admin/ingredients/${item.id}`, { isActive: next }, token);
      setIngMsg(`Bahan ${next ? "diaktifkan" : "dinonaktifkan"}.`);
      await loadIngredients({ silent: true });
      await loadStocks({ silent: true });
    } catch (e) {
      setIngErr(e?.message || "Gagal ubah status bahan");
    }
  }

  async function deactivateIng(item) {
    setIngErr("");
    setIngMsg("");
    if (!window.confirm(`Nonaktifkan bahan "${item.name}"?`)) return;

    try {
      await apiDelete(`/api/admin/ingredients/${item.id}`, token);
      setIngMsg("Bahan dinonaktifkan.");
      await loadIngredients({ silent: true });
      await loadStocks({ silent: true });
    } catch (e) {
      setIngErr(e?.message || "Gagal menonaktifkan bahan");
    }
  }

  async function exportStockCsv() {
    try {
      const scopeLabel = scope === "CENTRAL" ? "central" : selectedCart?.name || "cart";
      const lines = [
        [
          "Scope",
          "Cart",
          "Item Code",
          "Item Name",
          "Category",
          "Source",
          "Unit",
          "Qty On Hand",
          "Min Stock",
          "Reorder Point",
          "Par Stock",
          "Suggested Order Qty",
          "Stock Status",
          "Is Active",
          "Is Global",
          "Allow Negative",
          "Last Movement At",
          "Last Movement Type",
          "Last Info",
        ]
          .map(csvCell)
          .join(","),
      ];

      for (const row of visibleStocks) {
        const ing = row.ingredient || {};
        lines.push(
          [
            scope,
            scope === "CENTRAL" ? "Central" : selectedCart?.name || "",
            ing.code || "",
            ing.name || "",
            ing.category || "",
            row.source || (ing.isGlobal ? "CENTRAL" : "CART"),
            ing.unit || "",
            Number(row.qty || 0),
            Number(ing.minStock || 0),
            Number(ing.reorderPoint || 0),
            Number(ing.parStock || 0),
            Number(row.suggestedOrderQty || 0),
            row.stockStatus || "OK",
            ing.isActive === false ? "NO" : "YES",
            ing.isGlobal ? "YES" : "NO",
            ing.allowNegative ? "YES" : "NO",
            row.lastMovementAt ? new Date(row.lastMovementAt).toISOString() : "",
            row.lastType || "",
            compactCentralInfo(row),
          ]
            .map(csvCell)
            .join(",")
        );
      }

      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      downloadTextFile(`inventory_${scopeLabel}_${stamp}.csv`, "\uFEFF" + lines.join("\n"));
      setMsgStock("CSV stok berhasil diextract dari tampilan saat ini.");
    } catch (e) {
      setErrStock(e?.message || "Gagal export stok CSV");
    }
  }

  async function exportStockCsvServer() {
    try {
      const qs = new URLSearchParams();
      qs.set("scope", scope);
      if (scope === "CART") qs.set("cartId", selectedCartId);
      if (qStock.trim()) qs.set("q", qStock.trim());
      if (showInactiveStock) qs.set("includeInactive", "true");
      if (statusStock !== "ALL") qs.set("status", statusStock);

      const res = await fetch(`${API_BASE}/api/admin/inventory/export.csv?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") || "";
      const m = /filename=\"?([^\"]+)\"?/i.exec(cd);
      const filename = m?.[1] || `inventory_${Date.now()}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMsgStock("CSV stok server berhasil diextract.");
    } catch (e) {
      setErrStock(e?.message || "Gagal export CSV dari server");
    }
  }

  const visibleIngItems = useMemo(() => {
    let rows = [...(ingItems || [])];
    if (!showInactiveIng) rows = rows.filter((x) => (x.isActive ?? true) !== false);
    return rows.sort((a, b) => {
      const ao = Number(a.displayOrder || 0);
      const bo = Number(b.displayOrder || 0);
      if (ao !== bo) return ao - bo;
      return String(a.name || "").localeCompare(String(b.name || ""), "id");
    });
  }, [ingItems, showInactiveIng]);

  const visibleStocks = useMemo(() => {
    let rows = [...(stocks || [])];
    if (onlyZero) rows = rows.filter((r) => Number(r.qty ?? 0) <= 0);
    if (statusStock !== "ALL") {
      rows = rows.filter((r) => String(r.stockStatus || "OK").toUpperCase() === statusStock);
    }

    rows.sort((a, b) => {
      const priority = { OUT_OF_STOCK: 0, LOW_STOCK: 1, REORDER: 2, OK: 3 };
      const ap = priority[String(a.stockStatus || "OK").toUpperCase()] ?? 99;
      const bp = priority[String(b.stockStatus || "OK").toUpperCase()] ?? 99;
      if (ap !== bp) return ap - bp;

      const ao = Number(a.ingredient?.displayOrder || 0);
      const bo = Number(b.ingredient?.displayOrder || 0);
      if (ao !== bo) return ao - bo;

      return String(a.ingredient?.name || "").localeCompare(String(b.ingredient?.name || ""), "id");
    });

    return rows;
  }, [stocks, onlyZero, statusStock]);

  const stockSummary = useMemo(() => summarizeRows(visibleStocks), [visibleStocks]);

  const stockSourceSummary = useMemo(() => {
    const rows = visibleStocks || [];
    const cartCount = rows.filter((r) => (r.source || (r.ingredient?.isGlobal ? "CENTRAL" : "CART")) === "CART").length;
    const centralCount = rows.length - cartCount;

    let lastTs = 0;
    for (const r of rows) {
      const t = r?.lastMovementAt ? new Date(r.lastMovementAt).getTime() : 0;
      if (t > lastTs) lastTs = t;
    }

    return {
      cartCount,
      centralCount,
      lastUpdatedAt: lastTs ? new Date(lastTs).toISOString() : null,
    };
  }, [visibleStocks]);

  const scopeLabel = scope === "CENTRAL" ? "CENTRAL" : "GEROBAK";
  const cartLabel = scope === "CENTRAL" ? "Gudang / Central" : selectedCart?.name || "(Pilih gerobak)";

  return (
    <div className="adm-bg adm adm-inventory">
      <div className="adm-shell">
        <div className="adm-layout">
          <aside className="adm-nav">
            <div className="adm-nav-card">
              <div className="adm-nav-title">Admin</div>
              <div className="adm-nav-sub">Kelola stok dinamis & kontrol kasir</div>

              <div className="adm-nav-list">
                <button className="adm-nav-item" type="button" onClick={() => nav("/admin/dashboard")}>Live Report</button>
                <button className="adm-nav-item" type="button" onClick={() => nav("/admin/products")}>Menu</button>
                <button className="adm-nav-item" type="button" onClick={() => nav("/admin/promos")}>Promo</button>
                <button className="adm-nav-item" type="button" onClick={() => nav("/admin/users")}>User Management</button>
                <button className="adm-nav-item" type="button" onClick={() => nav("/admin/carts")}>Kelola Gerobak</button>
                <button className="adm-nav-item" type="button" onClick={() => nav("/admin/reports")}>Laporan</button>
                <button className="adm-nav-item active" type="button" onClick={() => nav("/admin/inventory")}>Stok</button>
              </div>

              <div className="adm-nav-foot">
                <button className="btn secondary" type="button" onClick={logout}>Logout</button>
              </div>
            </div>
          </aside>

          <main className="adm-main">
            <div className="adm-main-card">
              <div className="adm-header" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <h2 className="adm-title">Sistem Stok</h2>
                  <div className="adm-subtitle">Admin, kasir, transfer, ledger, dan extract laporan dalam satu alur stok.</div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn secondary btn--sm" type="button" onClick={bootstrapInventory} disabled={bootstrapBusy}>
                    {bootstrapBusy ? "Bootstrapping..." : "Bootstrap Inventory"}
                  </button>
                  <button className="btn secondary btn--sm" type="button" onClick={() => loadStocks()} disabled={loadingStock || tab !== "STOCK"}>
                    {loadingStock ? "Memuat..." : "Refresh Stok"}
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <Tabs
                  items={[
                    { value: "STOCK", label: "Stock On Hand" },
                    { value: "TRANSFER", label: "Transfer Kasir" },
                    { value: "ING", label: "Master Bahan" },
                  ]}
                  value={tab}
                  onChange={setTab}
                />
              </div>

              {tab === "STOCK" ? (
                <>
                  <div className="adm-panels" style={{ marginTop: 14 }}>
                    <section className="adm-panel adm-panel--kpi">
                      <div className="adm-panel-head"><h3 className="adm-h3">Items</h3></div>
                      <div style={{ fontSize: 30, fontWeight: 900 }}>{stockSummary.totalItems}</div>
                      <div className="muted">Item tampil sesuai filter saat ini</div>
                    </section>
                    <section className="adm-panel adm-panel--kpi">
                      <div className="adm-panel-head"><h3 className="adm-h3">Qty Total</h3></div>
                      <div style={{ fontSize: 30, fontWeight: 900 }}>{Number(stockSummary.totalQty || 0)}</div>
                      <div className="muted">Akumulasi on hand dari tabel saat ini</div>
                    </section>
                    <section className="adm-panel adm-panel--kpi">
                      <div className="adm-panel-head"><h3 className="adm-h3">Perlu Action</h3></div>
                      <div style={{ fontSize: 30, fontWeight: 900 }}>{stockSummary.reorder + stockSummary.lowStock + stockSummary.outOfStock}</div>
                      <div className="muted">Reorder {stockSummary.reorder} • Low {stockSummary.lowStock} • Out {stockSummary.outOfStock}</div>
                    </section>
                    <section className="adm-panel adm-panel--kpi">
                      <div className="adm-panel-head"><h3 className="adm-h3">Coverage</h3></div>
                      <div style={{ fontSize: 30, fontWeight: 900 }}>{scope === "CENTRAL" ? stockSourceSummary.centralCount : stockSourceSummary.cartCount}</div>
                      <div className="muted">Last movement: {fmtDT(stockSourceSummary.lastUpdatedAt)}</div>
                    </section>
                  </div>

                  <section className="adm-panel" style={{ marginTop: 14 }}>
                    <div className="adm-panel-head">
                      <h3 className="adm-h3">Filter Stock On Hand</h3>
                      <span className="muted">Tampilan lengkap standar stok untuk admin dan kasir</span>
                    </div>

                    <div className="row" style={{ marginTop: 10 }}>
                      <div className="col" style={{ minWidth: 180 }}>
                        <label>Scope</label>
                        <select className="input" value={scope} onChange={(e) => setScope(e.target.value)}>
                          <option value="CART">Gerobak</option>
                          <option value="CENTRAL">Central</option>
                        </select>
                      </div>

                      {scope === "CART" ? (
                        <div className="col" style={{ minWidth: 260 }}>
                          <label>Gerobak</label>
                          <select className="input" value={selectedCartId} onChange={(e) => setSelectedCartId(e.target.value)}>
                            <option value="">Pilih gerobak</option>
                            {(carts || []).map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                      ) : null}

                      <div className="col" style={{ minWidth: 260 }}>
                        <label>Cari Item</label>
                        <input
                          className="input"
                          value={qStock}
                          onChange={(e) => setQStock(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") loadStocks();
                          }}
                          placeholder="nama / code / category"
                        />
                      </div>

                      <div className="col" style={{ minWidth: 180 }}>
                        <label>Status</label>
                        <select className="input" value={statusStock} onChange={(e) => setStatusStock(e.target.value)}>
                          <option value="ALL">ALL</option>
                          <option value="OK">OK</option>
                          <option value="REORDER">REORDER</option>
                          <option value="LOW_STOCK">LOW_STOCK</option>
                          <option value="OUT_OF_STOCK">OUT_OF_STOCK</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
                      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input type="checkbox" checked={onlyZero} onChange={(e) => setOnlyZero(e.target.checked)} />
                        <span>Hanya qty 0</span>
                      </label>
                      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input type="checkbox" checked={showInactiveStock} onChange={(e) => setShowInactiveStock(e.target.checked)} />
                        <span>Tampilkan item nonaktif</span>
                      </label>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                      <button className="btn btn--sm" type="button" onClick={() => loadStocks()} disabled={loadingStock}>
                        {loadingStock ? "Memuat..." : "Terapkan Filter"}
                      </button>
                      <button className="btn secondary btn--sm" type="button" onClick={exportStockCsv}>
                        Export CSV (Current View)
                      </button>
                      <button className="btn secondary btn--sm" type="button" onClick={exportStockCsvServer}>
                        Export CSV (Server)
                      </button>
                    </div>
                  </section>

                  {errStock ? <div className="toast toast--danger" style={{ marginTop: 14 }}>{errStock}</div> : null}
                  {msgStock ? <div className="toast toast--ok" style={{ marginTop: 14 }}>{msgStock}</div> : null}

                  <section className="adm-panel" style={{ marginTop: 14 }}>
                    <div className="adm-panel-head">
                      <h3 className="adm-h3">Stock On Hand • {scopeLabel}</h3>
                      <span className="muted">{cartLabel}</span>
                    </div>

                    <div className="adm-table-wrap" style={{ marginTop: 10 }}>
                      <table className="table adm-table">
                        <thead>
                          <tr>
                            <th style={{ minWidth: 110 }}>Code</th>
                            <th style={{ minWidth: 220 }}>Item</th>
                            <th style={{ minWidth: 120 }}>Category</th>
                            <th style={{ minWidth: 100 }}>Source</th>
                            <th style={{ width: 90 }}>Qty</th>
                            <th style={{ width: 90 }}>Unit</th>
                            <th style={{ width: 90 }}>Min</th>
                            <th style={{ width: 90 }}>Reorder</th>
                            <th style={{ width: 90 }}>Par</th>
                            <th style={{ width: 120 }}>Suggested</th>
                            <th style={{ minWidth: 140 }}>Status</th>
                            <th style={{ minWidth: 160 }}>Last Movement</th>
                            <th style={{ minWidth: 140 }}>Last Info</th>
                            <th style={{ minWidth: 180 }}>Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleStocks.map((row) => {
                            const ing = row.ingredient || {};
                            return (
                              <tr key={`${row.source}-${row.ingredientId}`}>
                                <td><b>{ing.code || "-"}</b></td>
                                <td>
                                  <div style={{ fontWeight: 800 }}>{ing.name || "-"}</div>
                                  <div className="muted" style={{ fontSize: 12 }}>
                                    {ing.isActive === false ? "Inactive" : "Active"}
                                    {ing.isGlobal ? " • Shared from central" : " • Per gerobak"}
                                  </div>
                                </td>
                                <td>{ing.category || "RAW"}</td>
                                <td>{row.source || (ing.isGlobal ? "CENTRAL" : "CART")}</td>
                                <td><b>{Number(row.qty || 0)}</b></td>
                                <td>{ing.unit || "-"}</td>
                                <td>{Number(ing.minStock || 0)}</td>
                                <td>{Number(ing.reorderPoint || 0)}</td>
                                <td>{Number(ing.parStock || 0)}</td>
                                <td>{Number(row.suggestedOrderQty || 0)}</td>
                                <td>{statusBadge(row.stockStatus)}</td>
                                <td>{fmtDT(row.lastMovementAt)}</td>
                                <td>{compactCentralInfo(row)}</td>
                                <td>
                                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                    <button className="btn secondary btn--sm" type="button" onClick={() => openAdjust(row, "SET")}>Set</button>
                                    <button className="btn secondary btn--sm" type="button" onClick={() => openAdjust(row, "DELTA")}>Delta</button>
                                    <button className="btn btn--sm" type="button" onClick={() => openLedger(row)}>Ledger</button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                          {!loadingStock && visibleStocks.length === 0 ? (
                            <tr>
                              <td colSpan={14} className="muted">Belum ada item yang cocok dengan filter saat ini.</td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              ) : null}

              {tab === "TRANSFER" ? <TransferRequestsPanel token={token} carts={carts} /> : null}

              {tab === "ING" ? (
                <>
                  <section className="adm-panel" style={{ marginTop: 14 }}>
                    <div className="adm-panel-head">
                      <h3 className="adm-h3">Master Bahan Dinamis</h3>
                      <span className="muted">Semua pihak membaca item yang sama: admin, kasir, recipe, dan laporan</span>
                    </div>

                    {ingErr ? <div className="toast toast--danger" style={{ marginTop: 12 }}>{ingErr}</div> : null}
                    {ingMsg ? <div className="toast toast--ok" style={{ marginTop: 12 }}>{ingMsg}</div> : null}

                    <form onSubmit={submitIng} style={{ marginTop: 12 }}>
                      <div className="adm-form-grid" style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
                        <div className="adm-field">
                          <label>Nama Bahan</label>
                          <input className="input" value={ingForm.name} onChange={(e) => setIngForm((p) => ({ ...p, name: e.target.value }))} placeholder="Cireng / Kemasan / Saus Keju" />
                        </div>
                        <div className="adm-field">
                          <label>Kode</label>
                          <input className="input" value={ingForm.code} onChange={(e) => setIngForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="CIRENG" />
                        </div>
                        <div className="adm-field">
                          <label>Category</label>
                          <input className="input" value={ingForm.category} onChange={(e) => setIngForm((p) => ({ ...p, category: e.target.value.toUpperCase() }))} placeholder="RAW / CORE / PACKAGING" />
                        </div>
                        <div className="adm-field">
                          <label>Unit</label>
                          <select className="input" value={ingForm.unit} onChange={(e) => setIngForm((p) => ({ ...p, unit: e.target.value }))}>
                            <option value="PCS">PCS</option>
                            <option value="GRAM">GRAM</option>
                            <option value="ML">ML</option>
                          </select>
                        </div>

                        <div className="adm-field">
                          <label>Min Stock</label>
                          <input className="input" type="number" min={0} value={ingForm.minStock} onChange={(e) => setIngForm((p) => ({ ...p, minStock: e.target.value }))} />
                        </div>
                        <div className="adm-field">
                          <label>Reorder Point</label>
                          <input className="input" type="number" min={0} value={ingForm.reorderPoint} onChange={(e) => setIngForm((p) => ({ ...p, reorderPoint: e.target.value }))} />
                        </div>
                        <div className="adm-field">
                          <label>Par Stock</label>
                          <input className="input" type="number" min={0} value={ingForm.parStock} onChange={(e) => setIngForm((p) => ({ ...p, parStock: e.target.value }))} />
                        </div>
                        <div className="adm-field">
                          <label>Display Order</label>
                          <input className="input" type="number" min={0} value={ingForm.displayOrder} onChange={(e) => setIngForm((p) => ({ ...p, displayOrder: e.target.value }))} />
                        </div>
                      </div>

                      <div className="adm-field" style={{ marginTop: 12 }}>
                        <label>Catatan</label>
                        <textarea
                          className="input"
                          rows={3}
                          value={ingForm.notes}
                          onChange={(e) => setIngForm((p) => ({ ...p, notes: e.target.value }))}
                          placeholder="Contoh: bahan utama gerobak, shared dari central, atau catatan handling"
                          style={{ resize: "vertical" }}
                        />
                      </div>

                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12 }}>
                        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input type="checkbox" checked={ingForm.isGlobal} onChange={(e) => setIngForm((p) => ({ ...p, isGlobal: e.target.checked }))} />
                          <span>Shared dari central</span>
                        </label>
                        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input type="checkbox" checked={ingForm.allowNegative} onChange={(e) => setIngForm((p) => ({ ...p, allowNegative: e.target.checked }))} />
                          <span>Allow negative</span>
                        </label>
                        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input type="checkbox" checked={ingForm.autoDeduct} onChange={(e) => setIngForm((p) => ({ ...p, autoDeduct: e.target.checked }))} />
                          <span>Auto deduct</span>
                        </label>
                        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input type="checkbox" checked={ingForm.isActive} onChange={(e) => setIngForm((p) => ({ ...p, isActive: e.target.checked }))} />
                          <span>Active</span>
                        </label>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                        <button className="btn" type="submit">{ingForm.id ? "Update Bahan" : "Tambah Bahan"}</button>
                        <button className="btn secondary" type="button" onClick={resetIngForm}>Reset</button>
                      </div>
                    </form>
                  </section>

                  <section className="adm-panel" style={{ marginTop: 14 }}>
                    <div className="adm-panel-head">
                      <h3 className="adm-h3">Daftar Bahan</h3>
                      <span className="muted">{visibleIngItems.length} bahan</span>
                    </div>

                    <div className="row" style={{ marginTop: 10 }}>
                      <div className="col" style={{ minWidth: 260 }}>
                        <label>Cari bahan</label>
                        <input
                          className="input"
                          value={qIng}
                          onChange={(e) => setQIng(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") loadIngredients();
                          }}
                          placeholder="nama / code / category"
                        />
                      </div>
                      <div className="col" style={{ minWidth: 240, display: "flex", alignItems: "end", gap: 12 }}>
                        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input type="checkbox" checked={showInactiveIng} onChange={(e) => setShowInactiveIng(e.target.checked)} />
                          <span>Tampilkan inactive</span>
                        </label>
                        <button className="btn secondary btn--sm" type="button" onClick={() => loadIngredients()} disabled={ingLoading}>
                          {ingLoading ? "Memuat..." : "Refresh"}
                        </button>
                      </div>
                    </div>

                    <div className="adm-table-wrap" style={{ marginTop: 12 }}>
                      <table className="table adm-table">
                        <thead>
                          <tr>
                            <th style={{ minWidth: 100 }}>Code</th>
                            <th style={{ minWidth: 220 }}>Nama</th>
                            <th style={{ minWidth: 120 }}>Category</th>
                            <th style={{ width: 90 }}>Unit</th>
                            <th style={{ width: 90 }}>Min</th>
                            <th style={{ width: 90 }}>Reorder</th>
                            <th style={{ width: 90 }}>Par</th>
                            <th style={{ width: 100 }}>Order</th>
                            <th style={{ minWidth: 180 }}>Control</th>
                            <th style={{ minWidth: 160 }}>Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleIngItems.map((x) => (
                            <tr key={x.id}>
                              <td><b>{x.code || "-"}</b></td>
                              <td>
                                <div style={{ fontWeight: 800 }}>{x.name}</div>
                                <div className="muted" style={{ fontSize: 12 }}>{x.notes || "-"}</div>
                              </td>
                              <td>{x.category || "RAW"}</td>
                              <td>{x.unit}</td>
                              <td>{Number(x.minStock || 0)}</td>
                              <td>{Number(x.reorderPoint || 0)}</td>
                              <td>{Number(x.parStock || 0)}</td>
                              <td>{Number(x.displayOrder || 0)}</td>
                              <td>
                                <div style={{ display: "grid", gap: 4 }}>
                                  <div>{x.isGlobal ? "Shared Central" : "Per Gerobak"}</div>
                                  <div>{x.allowNegative ? "Allow Negative" : "No Negative"}</div>
                                  <div>{x.autoDeduct ? "Auto Deduct" : "Manual Deduct"}</div>
                                  <div>{x.isActive === false ? "Inactive" : "Active"}</div>
                                </div>
                              </td>
                              <td>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                  <button className="btn secondary btn--sm" type="button" onClick={() => editIng(x)}>Edit</button>
                                  <button className="btn secondary btn--sm" type="button" onClick={() => toggleIngActive(x)}>
                                    {(x.isActive ?? true) !== false ? "Nonaktifkan" : "Aktifkan"}
                                  </button>
                                  <button className="btn danger btn--sm" type="button" onClick={() => deactivateIng(x)}>Delete</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {!ingLoading && visibleIngItems.length === 0 ? (
                            <tr><td colSpan={10} className="muted">Belum ada bahan.</td></tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              ) : null}
            </div>
          </main>
        </div>
      </div>

      <Modal
        open={adjOpen}
        onClose={() => { setAdjOpen(false); setAdjErr(""); }}
        title={`Adjust Stok • ${adjForm.name || "Item"}`}
        footer={
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button className="btn secondary" type="button" onClick={() => setAdjOpen(false)} disabled={adjBusy}>Batal</button>
            <button className="btn" type="button" onClick={submitAdjust} disabled={adjBusy}>{adjBusy ? "Menyimpan..." : "Simpan"}</button>
          </div>
        }
      >
        {adjErr ? <div className="toast toast--danger" style={{ marginBottom: 10 }}>{adjErr}</div> : null}

        <div style={{ display: "grid", gap: 12 }}>
          <div className="muted">Lokasi: {cartLabel}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label>Mode</label>
              <select className="input" value={adjForm.mode} onChange={(e) => setAdjForm((p) => ({ ...p, mode: e.target.value }))}>
                <option value="SET">SET</option>
                <option value="DELTA">DELTA</option>
              </select>
            </div>
            <div>
              <label>{adjForm.mode === "SET" ? "Set Qty" : "Delta Qty"}</label>
              <input className="input" type="number" value={adjForm.value} onChange={(e) => setAdjForm((p) => ({ ...p, value: e.target.value }))} />
            </div>
          </div>
          <div>
            <label>Reason</label>
            <select className="input" value={adjForm.reason} onChange={(e) => setAdjForm((p) => ({ ...p, reason: e.target.value }))}>
              <option value="ADJUSTMENT">ADJUSTMENT</option>
              <option value="OPENING_STOCK">OPENING_STOCK</option>
              <option value="STOCK_OPNAME">STOCK_OPNAME</option>
              <option value="WASTE">WASTE</option>
            </select>
          </div>
          <div>
            <label>Catatan</label>
            <input className="input" value={adjForm.note} onChange={(e) => setAdjForm((p) => ({ ...p, note: e.target.value }))} placeholder="jelaskan alasan perubahan stok" />
          </div>
        </div>
      </Modal>

      <Modal
        open={ledgerOpen}
        onClose={() => { setLedgerOpen(false); setLedgerErr(""); }}
        title={`Ledger • ${ledgerFor?.name || "Item"}`}
      >
        {ledgerErr ? <div className="toast toast--danger" style={{ marginBottom: 12 }}>{ledgerErr}</div> : null}
        {ledgerBusy ? <div className="muted">Memuat ledger...</div> : null}

        {!ledgerBusy ? (
          <div className="adm-table-wrap">
            <table className="table adm-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 160 }}>Waktu</th>
                  <th style={{ minWidth: 100 }}>Source</th>
                  <th style={{ minWidth: 120 }}>Type</th>
                  <th style={{ width: 80 }}>Delta</th>
                  <th style={{ width: 110 }}>Balance</th>
                  <th style={{ minWidth: 120 }}>Reason</th>
                  <th style={{ minWidth: 180 }}>Note</th>
                </tr>
              </thead>
              <tbody>
                {ledgerItems.map((x, idx) => (
                  <tr key={`${x.id || x.createdAt || idx}-${idx}`}>
                    <td>{fmtDT(x.createdAt)}</td>
                    <td>{x.source || "-"}</td>
                    <td>{x.type || "-"}</td>
                    <td>{Number(x.delta || 0)}</td>
                    <td>{Number(x.balanceAfter || 0)}</td>
                    <td>{x.reason || "-"}</td>
                    <td>{x.note || "-"}</td>
                  </tr>
                ))}
                {!ledgerBusy && ledgerItems.length === 0 ? (
                  <tr><td colSpan={7} className="muted">Belum ada ledger untuk item ini.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}