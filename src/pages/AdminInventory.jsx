import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../api";
import { useNavigate } from "react-router-dom";
import Modal from "../components/ui/Modal";
import TransferRequestsPanel from "../components/admin/TransferRequestsPanel";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

function fmtDT(dt) {
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

function stockStatusLabel(status) {
  return String(status || "OK").replaceAll("_", " ");
}

function stockStatusClass(status) {
  const s = String(status || "OK").toUpperCase();

  if (s === "OUT_OF_STOCK") return "badge--danger";
  if (s === "LOW_STOCK") return "badge--danger";
  if (s === "REORDER") return "pill--soft";

  return "badge--success";
}

function statusBadge(status) {
  return (
    <span className={`adm-badge ${stockStatusClass(status)}`}>
      {stockStatusLabel(status)}
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

    const status = String(row?.stockStatus || "OK").toUpperCase();

    if (status === "OUT_OF_STOCK") out.outOfStock += 1;
    else if (status === "LOW_STOCK") out.lowStock += 1;
    else if (status === "REORDER") out.reorder += 1;
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

function StatCard({ label, value, note }) {
  return (
    <section className="adm-panel adm-panel--kpi">
      <div className="adm-kpi-label">{label}</div>
      <div className="adm-kpi-value">{value}</div>
      {note ? <div className="adm-kpi-hint">{note}</div> : null}
    </section>
  );
}

function TabButton({ active, children, onClick }) {
  return (
    <button
      className={`tab ${active ? "active" : ""}`}
      type="button"
      aria-selected={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function activeValue(value) {
  return (value ?? true) !== false;
}

export default function AdminInventory() {
  const nav = useNavigate();
  const token = localStorage.getItem("admin_token");
  const didLoadRef = useRef(false);

  const [tab, setTab] = useState("STOCK");

  const [carts, setCarts] = useState([]);
  const [selectedCartId, setSelectedCartId] = useState("");

  const selectedCart = useMemo(
    () => (carts || []).find((cart) => cart.id === selectedCartId) || null,
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

  async function loadCarts() {
    const response = await apiGet("/api/admin/carts", token);
    const list = response.carts || [];

    setCarts(list);

    if (!selectedCartId) {
      const firstActive = list.find((cart) => activeValue(cart.isActive)) || list[0];
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
      const query = qStock.trim();

      if (scope === "CENTRAL") {
        const qs = new URLSearchParams();

        qs.set("scope", "CENTRAL");
        if (query) qs.set("q", query);
        if (showInactiveStock) qs.set("includeInactive", "true");

        const response = await apiGet(`/api/admin/inventory/stocks?${qs.toString()}`, token);

        setStocks((response.items || []).map((row) => ({ ...row, source: "CENTRAL" })));

        return;
      }

      const qsCart = new URLSearchParams();
      qsCart.set("scope", "CART");
      qsCart.set("cartId", selectedCartId);
      if (query) qsCart.set("q", query);
      if (showInactiveStock) qsCart.set("includeInactive", "true");

      const qsCentral = new URLSearchParams();
      qsCentral.set("scope", "CENTRAL");
      if (query) qsCentral.set("q", query);
      if (showInactiveStock) qsCentral.set("includeInactive", "true");

      const [cartResponse, centralResponse] = await Promise.all([
        apiGet(`/api/admin/inventory/stocks?${qsCart.toString()}`, token),
        apiGet(`/api/admin/inventory/stocks?${qsCentral.toString()}`, token),
      ]);

      const cartItems = cartResponse.items || [];
      const centralItems = centralResponse.items || [];
      const centralMap = new Map(centralItems.map((item) => [item.ingredientId, item]));

      const merged = cartItems.map((row) => {
        const ingredient = row.ingredient || {};

        if (!ingredient.isGlobal) {
          return {
            ...row,
            source: "CART",
          };
        }

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
    } catch (error) {
      if (!silent) setErrStock(error?.message || "Gagal load stok.");
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

      setMsgStock("Inventory berhasil dibootstrap.");
      await loadStocks({ silent: true });
    } catch (error) {
      setErrStock(error?.message || "Gagal bootstrap inventory.");
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

      const response = await apiGet(`/api/admin/ingredients?${qs.toString()}`, token);

      setIngItems(response.items || []);
    } catch (error) {
      if (!silent) setIngErr(error?.message || "Gagal load bahan.");
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
      } catch (error) {
        setErrStock(error?.message || "Gagal load gerobak.");
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

  const visibleStocks = useMemo(() => {
    let rows = [...(stocks || [])];

    if (onlyZero) {
      rows = rows.filter((row) => Number(row.qty ?? 0) <= 0);
    }

    if (statusStock !== "ALL") {
      rows = rows.filter(
        (row) => String(row.stockStatus || "OK").toUpperCase() === statusStock
      );
    }

    rows.sort((a, b) => {
      const priority = {
        OUT_OF_STOCK: 0,
        LOW_STOCK: 1,
        REORDER: 2,
        OK: 3,
      };

      const ap = priority[String(a.stockStatus || "OK").toUpperCase()] ?? 99;
      const bp = priority[String(b.stockStatus || "OK").toUpperCase()] ?? 99;

      if (ap !== bp) return ap - bp;

      const ao = Number(a.ingredient?.displayOrder || 0);
      const bo = Number(b.ingredient?.displayOrder || 0);

      if (ao !== bo) return ao - bo;

      return String(a.ingredient?.name || "").localeCompare(
        String(b.ingredient?.name || ""),
        "id"
      );
    });

    return rows;
  }, [stocks, onlyZero, statusStock]);

  const visibleIngItems = useMemo(() => {
    let rows = [...(ingItems || [])];

    if (!showInactiveIng) {
      rows = rows.filter((item) => activeValue(item.isActive));
    }

    return rows.sort((a, b) => {
      const ao = Number(a.displayOrder || 0);
      const bo = Number(b.displayOrder || 0);

      if (ao !== bo) return ao - bo;

      return String(a.name || "").localeCompare(String(b.name || ""), "id");
    });
  }, [ingItems, showInactiveIng]);

  const stockSummary = useMemo(() => summarizeRows(visibleStocks), [visibleStocks]);

  const stockSourceSummary = useMemo(() => {
    const rows = visibleStocks || [];

    const cartCount = rows.filter((row) => {
      const source = row.source || (row.ingredient?.isGlobal ? "CENTRAL" : "CART");
      return source === "CART";
    }).length;

    const centralCount = rows.length - cartCount;

    let lastTs = 0;

    for (const row of rows) {
      const t = row?.lastMovementAt ? new Date(row.lastMovementAt).getTime() : 0;
      if (t > lastTs) lastTs = t;
    }

    return {
      cartCount,
      centralCount,
      lastUpdatedAt: lastTs ? new Date(lastTs).toISOString() : null,
    };
  }, [visibleStocks]);

  const ingredientSummary = useMemo(() => {
    const rows = ingItems || [];

    let active = 0;
    let inactive = 0;
    let global = 0;
    let autoDeduct = 0;

    for (const item of rows) {
      if (activeValue(item.isActive)) active += 1;
      else inactive += 1;

      if (item.isGlobal) global += 1;
      if (item.autoDeduct) autoDeduct += 1;
    }

    return {
      total: rows.length,
      active,
      inactive,
      global,
      autoDeduct,
    };
  }, [ingItems]);

  const scopeLabel = scope === "CENTRAL" ? "CENTRAL" : "GEROBAK";
  const cartLabel = scope === "CENTRAL" ? "Gudang / Central" : selectedCart?.name || "(Pilih gerobak)";

  function openAdjust(row, mode = "SET") {
    const ingredient = row?.ingredient || {};

    setAdjErr("");

    setAdjForm({
      ingredientId: row.ingredientId,
      name: ingredient.name || "(Bahan)",
      unit: ingredient.unit || "-",
      isGlobal: !!ingredient.isGlobal,
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
      if (!ingredientId) throw new Error("Ingredient ID kosong.");

      const mode = String(adjForm.mode || "SET").toUpperCase();
      const value = Number(adjForm.value);

      if (mode === "SET") {
        if (!Number.isFinite(value) || value < 0) {
          throw new Error("SET qty harus angka >= 0.");
        }
      } else if (!Number.isFinite(value) || value === 0) {
        throw new Error("DELTA tidak boleh 0.");
      }

      const payload = {
        scope,
        cartId: scope === "CART" ? selectedCartId : null,
        ingredientId,
        mode,
        reason: String(adjForm.reason || "ADJUSTMENT"),
        note: String(adjForm.note || "").slice(0, 200) || null,
        ...(mode === "SET"
          ? { setQty: Math.floor(value) }
          : { delta: Math.floor(value) }),
      };

      await apiPost("/api/admin/inventory/adjust", payload, token);

      setAdjOpen(false);
      setMsgStock("Stok berhasil diupdate.");

      await loadStocks({ silent: true });
    } catch (error) {
      setAdjErr(error?.message || "Gagal adjust stok.");
    } finally {
      setAdjBusy(false);
    }
  }

  async function openLedger(row) {
    const ingredient = row?.ingredient || {};
    const ingredientId = row?.ingredientId;

    setLedgerErr("");
    setLedgerItems([]);
    setLedgerFor({
      ingredientId,
      name: ingredient.name || "(Bahan)",
      unit: ingredient.unit || "-",
      isGlobal: !!ingredient.isGlobal,
    });
    setLedgerOpen(true);
    setLedgerBusy(true);

    try {
      const ingredientIsGlobal = !!ingredient.isGlobal;
      const limit = 80;

      const fetchLedger = async (selectedScope) => {
        const qs = new URLSearchParams();

        qs.set("scope", selectedScope);
        if (selectedScope === "CART") qs.set("cartId", selectedCartId);
        qs.set("ingredientId", ingredientId);
        qs.set("limit", String(limit));

        const response = await apiGet(`/api/admin/inventory/ledger?${qs.toString()}`, token);

        return (response.items || []).map((item) => ({
          ...item,
          source: selectedScope === "CENTRAL" ? "CENTRAL" : "CART",
        }));
      };

      if (scope === "CENTRAL") {
        setLedgerItems(await fetchLedger("CENTRAL"));
        return;
      }

      const cartLedger = await fetchLedger("CART");

      if (!ingredientIsGlobal) {
        setLedgerItems(cartLedger);
        return;
      }

      const centralLedger = await fetchLedger("CENTRAL");

      setLedgerItems(
        [...cartLedger, ...centralLedger]
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, limit)
      );
    } catch (error) {
      setLedgerErr(error?.message || "Gagal load ledger.");
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

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function submitIng(event) {
    event.preventDefault();

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
        await apiPatch(
          `/api/admin/ingredients/${ingForm.id}`,
          {
            ...payload,
            isActive: !!ingForm.isActive,
          },
          token
        );
        setIngMsg("Bahan diperbarui.");
      }

      resetIngForm();

      await loadIngredients({ silent: true });
      await loadStocks({ silent: true });
    } catch (error) {
      setIngErr(error?.message || "Gagal simpan bahan.");
    }
  }

  async function toggleIngActive(item) {
    setIngErr("");
    setIngMsg("");

    try {
      const next = !activeValue(item.isActive);

      await apiPatch(`/api/admin/ingredients/${item.id}`, { isActive: next }, token);

      setIngMsg(`Bahan ${next ? "diaktifkan" : "dinonaktifkan"}.`);

      await loadIngredients({ silent: true });
      await loadStocks({ silent: true });
    } catch (error) {
      setIngErr(error?.message || "Gagal ubah status bahan.");
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
    } catch (error) {
      setIngErr(error?.message || "Gagal menonaktifkan bahan.");
    }
  }

  async function exportStockCsv() {
    try {
      const scopeName = scope === "CENTRAL" ? "central" : selectedCart?.name || "cart";

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
        const ingredient = row.ingredient || {};

        lines.push(
          [
            scope,
            scope === "CENTRAL" ? "Central" : selectedCart?.name || "",
            ingredient.code || "",
            ingredient.name || "",
            ingredient.category || "",
            row.source || (ingredient.isGlobal ? "CENTRAL" : "CART"),
            ingredient.unit || "",
            Number(row.qty || 0),
            Number(ingredient.minStock || 0),
            Number(ingredient.reorderPoint || 0),
            Number(ingredient.parStock || 0),
            Number(row.suggestedOrderQty || 0),
            row.stockStatus || "OK",
            ingredient.isActive === false ? "NO" : "YES",
            ingredient.isGlobal ? "YES" : "NO",
            ingredient.allowNegative ? "YES" : "NO",
            row.lastMovementAt ? new Date(row.lastMovementAt).toISOString() : "",
            row.lastType || "",
            compactCentralInfo(row),
          ]
            .map(csvCell)
            .join(",")
        );
      }

      const stamp = new Date().toISOString().replace(/[:.]/g, "-");

      downloadTextFile(`inventory_${scopeName}_${stamp}.csv`, "\uFEFF" + lines.join("\n"));

      setMsgStock("CSV stok berhasil diexport dari tampilan saat ini.");
    } catch (error) {
      setErrStock(error?.message || "Gagal export stok CSV.");
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

      const response = await fetch(
        `${API_BASE}/api/admin/inventory/export.csv?${qs.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || `HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("content-disposition") || "";
      const match = /filename=\"?([^\"]+)\"?/i.exec(contentDisposition);
      const filename = match?.[1] || `inventory_${Date.now()}.csv`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");

      a.href = url;
      a.download = filename;

      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);

      setMsgStock("CSV stok server berhasil diexport.");
    } catch (error) {
      setErrStock(error?.message || "Gagal export CSV dari server.");
    }
  }

  return (
    <main className="adm-bg adm adm-inventory">
      <div className="adm-shell">
        <section className="adm-main-card">
          <div className="adm-header">
            <div>
              <h2 className="adm-h2">Sistem Stok</h2>

              <div className="adm-subline">
                <span>Kelola stok central, stok gerobak, transfer, ledger, dan master bahan.</span>
              </div>
            </div>

            <div className="adm-actions">
              <button
                className="btn secondary"
                type="button"
                onClick={bootstrapInventory}
                disabled={bootstrapBusy}
              >
                {bootstrapBusy ? "Bootstrapping..." : "Bootstrap"}
              </button>

              <button
                className="btn secondary"
                type="button"
                onClick={() => (tab === "ING" ? loadIngredients() : loadStocks())}
                disabled={loadingStock || ingLoading}
              >
                Refresh
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

          <div className="tabs" role="tablist" aria-label="Tab stok">
            <TabButton active={tab === "STOCK"} onClick={() => setTab("STOCK")}>
              Stock On Hand
            </TabButton>

            <TabButton active={tab === "TRANSFER"} onClick={() => setTab("TRANSFER")}>
              Transfer Kasir
            </TabButton>

            <TabButton active={tab === "ING"} onClick={() => setTab("ING")}>
              Master Bahan
            </TabButton>
          </div>

          {tab === "STOCK" ? (
            <>
              <div className="adm-panels" style={{ marginTop: 14 }}>
                <StatCard
                  label="Item Tampil"
                  value={stockSummary.totalItems}
                  note="Sesuai filter aktif."
                />

                <StatCard
                  label="Qty Total"
                  value={Number(stockSummary.totalQty || 0)}
                  note={`Scope: ${scopeLabel}`}
                />

                <StatCard
                  label="Perlu Action"
                  value={stockSummary.reorder + stockSummary.lowStock + stockSummary.outOfStock}
                  note={`Reorder ${stockSummary.reorder} • Low ${stockSummary.lowStock} • Out ${stockSummary.outOfStock}`}
                />

                <StatCard
                  label="Coverage"
                  value={scope === "CENTRAL" ? stockSourceSummary.centralCount : stockSourceSummary.cartCount}
                  note={`Last movement: ${fmtDT(stockSourceSummary.lastUpdatedAt)}`}
                />
              </div>

              <section className="adm-panel" style={{ marginTop: 14 }}>
                <div className="adm-panel-head">
                  <div>
                    <h3 className="adm-h3">Filter Stok</h3>
                    <div className="card-subtitle">
                      Atur scope, gerobak, status, dan pencarian item stok.
                    </div>
                  </div>

                  {loadingStock ? (
                    <span className="loading-inline muted">
                      <span className="spinner spinner--sm" aria-hidden="true" />
                      Memuat stok
                    </span>
                  ) : null}
                </div>

                <div className="adm-form-grid" style={{ marginTop: 12 }}>
                  <div className="adm-field">
                    <label htmlFor="stock-scope">Scope</label>

                    <select
                      id="stock-scope"
                      className="input"
                      value={scope}
                      onChange={(event) => setScope(event.target.value)}
                    >
                      <option value="CART">Gerobak</option>
                      <option value="CENTRAL">Central</option>
                    </select>
                  </div>

                  {scope === "CART" ? (
                    <div className="adm-field">
                      <label htmlFor="stock-cart">Gerobak</label>

                      <select
                        id="stock-cart"
                        className="input"
                        value={selectedCartId}
                        onChange={(event) => setSelectedCartId(event.target.value)}
                      >
                        <option value="">Pilih gerobak</option>

                        {(carts || []).map((cart) => (
                          <option key={cart.id} value={cart.id}>
                            {cart.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  <div className="adm-field">
                    <label htmlFor="stock-search">Cari Item</label>

                    <input
                      id="stock-search"
                      className="input"
                      value={qStock}
                      onChange={(event) => setQStock(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") loadStocks();
                      }}
                      placeholder="Nama / kode / kategori"
                    />
                  </div>

                  <div className="adm-field">
                    <label htmlFor="stock-status">Status</label>

                    <select
                      id="stock-status"
                      className="input"
                      value={statusStock}
                      onChange={(event) => setStatusStock(event.target.value)}
                    >
                      <option value="ALL">Semua</option>
                      <option value="OK">OK</option>
                      <option value="REORDER">REORDER</option>
                      <option value="LOW_STOCK">LOW STOCK</option>
                      <option value="OUT_OF_STOCK">OUT OF STOCK</option>
                    </select>
                  </div>
                </div>

                <div className="adm-actions-row" style={{ marginTop: 14 }}>
                  <div className="adm-actions">
                    <label className="check-compact">
                      <input
                        type="checkbox"
                        checked={onlyZero}
                        onChange={(event) => setOnlyZero(event.target.checked)}
                      />

                      <span>Qty 0 saja</span>
                    </label>

                    <label className="check-compact">
                      <input
                        type="checkbox"
                        checked={showInactiveStock}
                        onChange={(event) => setShowInactiveStock(event.target.checked)}
                      />

                      <span>Tampilkan inactive</span>
                    </label>
                  </div>

                  <div className="adm-actions-right">
                    <button
                      className="btn secondary"
                      type="button"
                      onClick={exportStockCsv}
                      disabled={!visibleStocks.length}
                    >
                      Export Tampilan
                    </button>

                    <button
                      className="btn secondary"
                      type="button"
                      onClick={exportStockCsvServer}
                    >
                      Export Server
                    </button>

                    <button
                      className="btn"
                      type="button"
                      onClick={() => loadStocks()}
                      disabled={loadingStock}
                    >
                      Terapkan Filter
                    </button>
                  </div>
                </div>
              </section>

              {errStock ? (
                <div className="adm-alert" role="alert" style={{ marginTop: 14 }}>
                  {errStock}
                </div>
              ) : null}

              {msgStock ? (
                <div className="adm-alert adm-alert--ok" role="status" style={{ marginTop: 14 }}>
                  {msgStock}
                </div>
              ) : null}

              <section className="adm-panel" style={{ marginTop: 14 }}>
                <div className="adm-panel-head">
                  <div>
                    <h3 className="adm-h3">Stock On Hand</h3>
                    <div className="card-subtitle">
                      Lokasi: <b>{cartLabel}</b>
                    </div>
                  </div>

                  <span className="badge">{visibleStocks.length} item</span>
                </div>

                <div className="adm-list" style={{ marginTop: 14 }}>
                  {visibleStocks.map((row) => {
                    const ingredient = row.ingredient || {};
                    const source = row.source || (ingredient.isGlobal ? "CENTRAL" : "CART");

                    return (
                      <article key={`${source}-${row.ingredientId}`} className="adm-list-item">
                        <div className="adm-list-top" style={{ alignItems: "center" }}>
                          <div>
                            <div className="adm-list-sku">{ingredient.code || "-"}</div>

                            <div className="adm-list-name" style={{ marginTop: 4 }}>
                              {ingredient.name || "-"}
                            </div>

                            <div className="adm-list-meta" style={{ marginTop: 6 }}>
                              {ingredient.category || "RAW"} • {ingredient.unit || "-"} •{" "}
                              {ingredient.isGlobal ? "Shared Central" : "Per Gerobak"}
                            </div>
                          </div>

                          <div className="adm-list-badges">
                            <span className="adm-badge">{source}</span>
                            {statusBadge(row.stockStatus)}
                          </div>
                        </div>

                        <div className="adm-form-grid" style={{ marginTop: 14 }}>
                          <div className="adm-check-item">
                            <div className="adm-kpi-label">Qty</div>
                            <div className="adm-list-title">{Number(row.qty || 0)}</div>
                          </div>

                          <div className="adm-check-item">
                            <div className="adm-kpi-label">Min</div>
                            <div className="adm-list-title">{Number(ingredient.minStock || 0)}</div>
                          </div>

                          <div className="adm-check-item">
                            <div className="adm-kpi-label">Reorder</div>
                            <div className="adm-list-title">
                              {Number(ingredient.reorderPoint || 0)}
                            </div>
                          </div>

                          <div className="adm-check-item">
                            <div className="adm-kpi-label">Par</div>
                            <div className="adm-list-title">{Number(ingredient.parStock || 0)}</div>
                          </div>

                          <div className="adm-check-item">
                            <div className="adm-kpi-label">Suggested</div>
                            <div className="adm-list-title">
                              {Number(row.suggestedOrderQty || 0)}
                            </div>
                          </div>
                        </div>

                        <div className="adm-list-window muted" style={{ marginTop: 12 }}>
                          <span>Last movement: {fmtDT(row.lastMovementAt)}</span>
                          <span className="adm-dot">•</span>
                          <span>{compactCentralInfo(row)}</span>
                        </div>

                        <div className="adm-actions-row" style={{ marginTop: 14 }}>
                          <div className="adm-list-badges">
                            <span className={activeValue(ingredient.isActive) ? "adm-badge adm-badge--cash" : "adm-badge"}>
                              {activeValue(ingredient.isActive) ? "ACTIVE" : "INACTIVE"}
                            </span>

                            <span className="adm-badge">
                              {ingredient.allowNegative ? "Allow Negative" : "No Negative"}
                            </span>
                          </div>

                          <div className="adm-actions-right">
                            <button
                              className="btn secondary btn--sm"
                              type="button"
                              onClick={() => openAdjust(row, "SET")}
                            >
                              Set
                            </button>

                            <button
                              className="btn secondary btn--sm"
                              type="button"
                              onClick={() => openAdjust(row, "DELTA")}
                            >
                              Delta
                            </button>

                            <button
                              className="btn btn--sm"
                              type="button"
                              onClick={() => openLedger(row)}
                            >
                              Ledger
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}

                  {!loadingStock && !visibleStocks.length ? (
                    <div className="adm-list-item">
                      <div className="adm-list-name">Belum ada stok.</div>
                      <div className="muted">Cek filter atau lakukan bootstrap inventory.</div>
                    </div>
                  ) : null}
                </div>
              </section>
            </>
          ) : null}

          {tab === "TRANSFER" ? (
            <section style={{ marginTop: 14 }}>
              <TransferRequestsPanel token={token} carts={carts} />
            </section>
          ) : null}

          {tab === "ING" ? (
            <>
              <div className="adm-panels" style={{ marginTop: 14 }}>
                <StatCard label="Total Bahan" value={ingredientSummary.total} note="Semua master bahan." />
                <StatCard label="Aktif" value={ingredientSummary.active} note="Bisa dipakai operasional." />
                <StatCard label="Shared Central" value={ingredientSummary.global} note="Stok dari central." />
                <StatCard label="Auto Deduct" value={ingredientSummary.autoDeduct} note="Terpakai oleh recipe." />
              </div>

              <section className="adm-panel" style={{ marginTop: 14 }}>
                <div className="adm-panel-head">
                  <div>
                    <h3 className="adm-h3">{ingForm.id ? "Edit Bahan" : "Tambah Bahan"}</h3>
                    <div className="card-subtitle">
                      Master bahan dipakai oleh stok, recipe, kasir, dan laporan.
                    </div>
                  </div>

                  {ingForm.id ? <span className="badge">Edit</span> : <span className="badge">Baru</span>}
                </div>

                {ingErr ? (
                  <div className="adm-alert" role="alert" style={{ marginTop: 12 }}>
                    {ingErr}
                  </div>
                ) : null}

                {ingMsg ? (
                  <div className="adm-alert adm-alert--ok" role="status" style={{ marginTop: 12 }}>
                    {ingMsg}
                  </div>
                ) : null}

                <form onSubmit={submitIng} className="adm-form" style={{ marginTop: 14 }}>
                  <div className="adm-form-grid">
                    <div className="adm-field">
                      <label htmlFor="ing-name">Nama Bahan</label>

                      <input
                        id="ing-name"
                        className="input"
                        value={ingForm.name}
                        onChange={(event) =>
                          setIngForm((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        placeholder="Cireng / Saus Keju / Kemasan"
                      />
                    </div>

                    <div className="adm-field">
                      <label htmlFor="ing-code">Kode</label>

                      <input
                        id="ing-code"
                        className="input"
                        value={ingForm.code}
                        onChange={(event) =>
                          setIngForm((current) => ({
                            ...current,
                            code: event.target.value.toUpperCase(),
                          }))
                        }
                        placeholder="CIRENG"
                      />
                    </div>

                    <div className="adm-field">
                      <label htmlFor="ing-category">Kategori</label>

                      <input
                        id="ing-category"
                        className="input"
                        value={ingForm.category}
                        onChange={(event) =>
                          setIngForm((current) => ({
                            ...current,
                            category: event.target.value.toUpperCase(),
                          }))
                        }
                        placeholder="RAW / CORE / PACKAGING"
                      />
                    </div>

                    <div className="adm-field">
                      <label htmlFor="ing-unit">Unit</label>

                      <select
                        id="ing-unit"
                        className="input"
                        value={ingForm.unit}
                        onChange={(event) =>
                          setIngForm((current) => ({
                            ...current,
                            unit: event.target.value,
                          }))
                        }
                      >
                        <option value="PCS">PCS</option>
                        <option value="GRAM">GRAM</option>
                        <option value="ML">ML</option>
                      </select>
                    </div>
                  </div>

                  <div className="adm-form-grid">
                    <div className="adm-field">
                      <label htmlFor="ing-min">Min Stock</label>

                      <input
                        id="ing-min"
                        className="input"
                        type="number"
                        min="0"
                        value={ingForm.minStock}
                        onChange={(event) =>
                          setIngForm((current) => ({
                            ...current,
                            minStock: event.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="adm-field">
                      <label htmlFor="ing-reorder">Reorder Point</label>

                      <input
                        id="ing-reorder"
                        className="input"
                        type="number"
                        min="0"
                        value={ingForm.reorderPoint}
                        onChange={(event) =>
                          setIngForm((current) => ({
                            ...current,
                            reorderPoint: event.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="adm-field">
                      <label htmlFor="ing-par">Par Stock</label>

                      <input
                        id="ing-par"
                        className="input"
                        type="number"
                        min="0"
                        value={ingForm.parStock}
                        onChange={(event) =>
                          setIngForm((current) => ({
                            ...current,
                            parStock: event.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="adm-field">
                      <label htmlFor="ing-order">Display Order</label>

                      <input
                        id="ing-order"
                        className="input"
                        type="number"
                        min="0"
                        value={ingForm.displayOrder}
                        onChange={(event) =>
                          setIngForm((current) => ({
                            ...current,
                            displayOrder: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="adm-field">
                    <label htmlFor="ing-notes">Catatan</label>

                    <textarea
                      id="ing-notes"
                      className="input"
                      value={ingForm.notes}
                      onChange={(event) =>
                        setIngForm((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                      placeholder="Catatan handling, asal stok, atau pemakaian bahan."
                    />
                  </div>

                  <div className="adm-form-grid">
                    <label className="check-card">
                      <input
                        type="checkbox"
                        checked={!!ingForm.isGlobal}
                        onChange={(event) =>
                          setIngForm((current) => ({
                            ...current,
                            isGlobal: event.target.checked,
                          }))
                        }
                      />

                      <div className="check-card__body">
                        <span className="check-card__title">Shared dari central</span>
                        <span className="check-card__sub">
                          Stok item dibaca dari gudang central.
                        </span>
                      </div>
                    </label>

                    <label className="check-card">
                      <input
                        type="checkbox"
                        checked={!!ingForm.allowNegative}
                        onChange={(event) =>
                          setIngForm((current) => ({
                            ...current,
                            allowNegative: event.target.checked,
                          }))
                        }
                      />

                      <div className="check-card__body">
                        <span className="check-card__title">Allow negative</span>
                        <span className="check-card__sub">
                          Stok boleh minus jika transaksi tetap diproses.
                        </span>
                      </div>
                    </label>

                    <label className="check-card">
                      <input
                        type="checkbox"
                        checked={!!ingForm.autoDeduct}
                        onChange={(event) =>
                          setIngForm((current) => ({
                            ...current,
                            autoDeduct: event.target.checked,
                          }))
                        }
                      />

                      <div className="check-card__body">
                        <span className="check-card__title">Auto deduct</span>
                        <span className="check-card__sub">
                          Bahan dipakai dalam recipe otomatis.
                        </span>
                      </div>
                    </label>

                    <label className="check-card">
                      <input
                        type="checkbox"
                        checked={!!ingForm.isActive}
                        onChange={(event) =>
                          setIngForm((current) => ({
                            ...current,
                            isActive: event.target.checked,
                          }))
                        }
                      />

                      <div className="check-card__body">
                        <span className="check-card__title">Bahan aktif</span>
                        <span className="check-card__sub">
                          Bahan bisa dipilih untuk stok dan recipe.
                        </span>
                      </div>

                      <span className={`check-state ${ingForm.isActive ? "active" : "inactive"}`}>
                        {ingForm.isActive ? "ACTIVE" : "INACTIVE"}
                      </span>
                    </label>
                  </div>

                  <div className="adm-actions-row">
                    <div />

                    <div className="adm-actions-right">
                      <button className="btn secondary" type="button" onClick={resetIngForm}>
                        Reset
                      </button>

                      <button className="btn" type="submit">
                        {ingForm.id ? "Update Bahan" : "Tambah Bahan"}
                      </button>
                    </div>
                  </div>
                </form>
              </section>

              <section className="adm-panel" style={{ marginTop: 14 }}>
                <div className="adm-panel-head">
                  <div>
                    <h3 className="adm-h3">Daftar Bahan</h3>
                    <div className="card-subtitle">
                      Klik edit untuk mengubah data master bahan.
                    </div>
                  </div>

                  {ingLoading ? (
                    <span className="loading-inline muted">
                      <span className="spinner spinner--sm" aria-hidden="true" />
                      Memuat bahan
                    </span>
                  ) : (
                    <span className="badge">{visibleIngItems.length} bahan</span>
                  )}
                </div>

                <div className="adm-form-grid" style={{ marginTop: 12 }}>
                  <div className="adm-field">
                    <label htmlFor="ing-search">Cari bahan</label>

                    <input
                      id="ing-search"
                      className="input"
                      value={qIng}
                      onChange={(event) => setQIng(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") loadIngredients();
                      }}
                      placeholder="Nama / kode / kategori"
                    />
                  </div>

                  <div className="adm-field">
                    <label>&nbsp;</label>

                    <div className="adm-actions">
                      <label className="check-compact">
                        <input
                          type="checkbox"
                          checked={showInactiveIng}
                          onChange={(event) => setShowInactiveIng(event.target.checked)}
                        />

                        <span>Tampilkan inactive</span>
                      </label>

                      <button
                        className="btn"
                        type="button"
                        onClick={() => loadIngredients()}
                        disabled={ingLoading}
                      >
                        Cari / Refresh
                      </button>
                    </div>
                  </div>
                </div>

                <div className="adm-list" style={{ marginTop: 14 }}>
                  {visibleIngItems.map((item) => (
                    <article key={item.id} className="adm-list-item">
                      <div className="adm-list-top" style={{ alignItems: "center" }}>
                        <div>
                          <div className="adm-list-sku">{item.code || "-"}</div>

                          <div className="adm-list-name" style={{ marginTop: 4 }}>
                            {item.name}
                          </div>

                          <div className="adm-list-meta" style={{ marginTop: 6 }}>
                            {item.category || "RAW"} • {item.unit}
                          </div>
                        </div>

                        <div className="adm-list-badges">
                          <span className={activeValue(item.isActive) ? "adm-badge adm-badge--cash" : "adm-badge"}>
                            {activeValue(item.isActive) ? "ACTIVE" : "INACTIVE"}
                          </span>

                          <span className="adm-badge">
                            {item.isGlobal ? "CENTRAL" : "GEROBAK"}
                          </span>

                          <span className="adm-badge">
                            {item.autoDeduct ? "AUTO" : "MANUAL"}
                          </span>
                        </div>
                      </div>

                      <div className="adm-form-grid" style={{ marginTop: 14 }}>
                        <div className="adm-check-item">
                          <div className="adm-kpi-label">Min</div>
                          <div className="adm-list-title">{Number(item.minStock || 0)}</div>
                        </div>

                        <div className="adm-check-item">
                          <div className="adm-kpi-label">Reorder</div>
                          <div className="adm-list-title">{Number(item.reorderPoint || 0)}</div>
                        </div>

                        <div className="adm-check-item">
                          <div className="adm-kpi-label">Par</div>
                          <div className="adm-list-title">{Number(item.parStock || 0)}</div>
                        </div>

                        <div className="adm-check-item">
                          <div className="adm-kpi-label">Order</div>
                          <div className="adm-list-title">{Number(item.displayOrder || 0)}</div>
                        </div>
                      </div>

                      <div className="adm-list-rule" style={{ marginTop: 10 }}>
                        {item.notes || "Tidak ada catatan."}
                      </div>

                      <div className="adm-actions-row" style={{ marginTop: 14 }}>
                        <div className="muted">
                          {item.allowNegative ? "Allow negative" : "No negative"}
                        </div>

                        <div className="adm-actions-right">
                          <button
                            className="btn secondary btn--sm"
                            type="button"
                            onClick={() => editIng(item)}
                          >
                            Edit
                          </button>

                          <button
                            className="btn secondary btn--sm"
                            type="button"
                            onClick={() => toggleIngActive(item)}
                          >
                            {activeValue(item.isActive) ? "Nonaktifkan" : "Aktifkan"}
                          </button>

                          <button
                            className="btn danger btn--sm"
                            type="button"
                            onClick={() => deactivateIng(item)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}

                  {!ingLoading && !visibleIngItems.length ? (
                    <div className="adm-list-item">
                      <div className="adm-list-name">Belum ada bahan.</div>
                      <div className="muted">Tambahkan bahan dari form di atas.</div>
                    </div>
                  ) : null}
                </div>
              </section>
            </>
          ) : null}
        </section>
      </div>

      <Modal
        open={adjOpen}
        onClose={() => {
          setAdjOpen(false);
          setAdjErr("");
        }}
        title={`Adjust Stok • ${adjForm.name || "Item"}`}
        footer={
          <div className="modal-actions">
            <button
              className="btn secondary"
              type="button"
              onClick={() => setAdjOpen(false)}
              disabled={adjBusy}
            >
              Batal
            </button>

            <button
              className="btn"
              type="button"
              onClick={submitAdjust}
              disabled={adjBusy}
            >
              {adjBusy ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        }
      >
        {adjErr ? (
          <div className="adm-alert" role="alert" style={{ marginBottom: 12 }}>
            {adjErr}
          </div>
        ) : null}

        <div className="adm-form">
          <div className="adm-alert adm-alert--ok">
            Lokasi: <b>{cartLabel}</b>
          </div>

          <div className="adm-form-grid">
            <div className="adm-field">
              <label>Mode</label>

              <select
                className="input"
                value={adjForm.mode}
                onChange={(event) =>
                  setAdjForm((current) => ({
                    ...current,
                    mode: event.target.value,
                  }))
                }
              >
                <option value="SET">SET</option>
                <option value="DELTA">DELTA</option>
              </select>
            </div>

            <div className="adm-field">
              <label>{adjForm.mode === "SET" ? "Set Qty" : "Delta Qty"}</label>

              <input
                className="input"
                type="number"
                value={adjForm.value}
                onChange={(event) =>
                  setAdjForm((current) => ({
                    ...current,
                    value: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div className="adm-field">
            <label>Reason</label>

            <select
              className="input"
              value={adjForm.reason}
              onChange={(event) =>
                setAdjForm((current) => ({
                  ...current,
                  reason: event.target.value,
                }))
              }
            >
              <option value="ADJUSTMENT">ADJUSTMENT</option>
              <option value="OPENING_STOCK">OPENING_STOCK</option>
              <option value="STOCK_OPNAME">STOCK_OPNAME</option>
              <option value="WASTE">WASTE</option>
            </select>
          </div>

          <div className="adm-field">
            <label>Catatan</label>

            <input
              className="input"
              value={adjForm.note}
              onChange={(event) =>
                setAdjForm((current) => ({
                  ...current,
                  note: event.target.value,
                }))
              }
              placeholder="Jelaskan alasan perubahan stok."
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={ledgerOpen}
        onClose={() => {
          setLedgerOpen(false);
          setLedgerErr("");
        }}
        title={`Ledger • ${ledgerFor?.name || "Item"}`}
      >
        {ledgerErr ? (
          <div className="adm-alert" role="alert" style={{ marginBottom: 12 }}>
            {ledgerErr}
          </div>
        ) : null}

        {ledgerBusy ? (
          <div className="adm-alert">
            <span className="loading-inline">
              <span className="spinner spinner--sm" aria-hidden="true" />
              Memuat ledger...
            </span>
          </div>
        ) : null}

        {!ledgerBusy ? (
          <div className="adm-list">
            {ledgerItems.map((item, index) => (
              <article key={`${item.id || item.createdAt || index}-${index}`} className="adm-list-item">
                <div className="adm-list-top">
                  <div>
                    <div className="adm-list-title">{fmtDT(item.createdAt)}</div>

                    <div className="adm-list-meta" style={{ marginTop: 6 }}>
                      {item.source || "-"} • {item.type || "-"} • {item.reason || "-"}
                    </div>
                  </div>

                  <div className="adm-list-badges">
                    <span className="adm-badge">Delta {Number(item.delta || 0)}</span>
                    <span className="adm-badge">Balance {Number(item.balanceAfter || 0)}</span>
                  </div>
                </div>

                <div className="adm-list-rule" style={{ marginTop: 10 }}>
                  {item.note || "Tidak ada catatan."}
                </div>
              </article>
            ))}

            {!ledgerItems.length ? (
              <div className="adm-list-item">
                <div className="adm-list-name">Belum ada ledger.</div>
                <div className="muted">Belum ada pergerakan untuk item ini.</div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </main>
  );
}