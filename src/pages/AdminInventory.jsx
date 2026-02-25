import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost, apiPatch, apiDelete } from "../api";
import { useNavigate } from "react-router-dom";
import Tabs from "../components/ui/Tabs";
import Modal from "../components/ui/Modal";
import TransferRequestsPanel from "../components/admin/TransferRequestsPanel";

function rupiah(amount) {
  const n = Number(amount || 0);
  if (!Number.isFinite(n)) return "Rp 0,00";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const fixed = abs.toFixed(2);
  let [i, d] = fixed.split(".");
  i = i.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return sign + "Rp " + i + "," + d;
}

function fmtDT(dt) {
  if (!dt) return "-";
  try {
    return new Date(dt).toLocaleString("id-ID");
  } catch {
    return String(dt);
  }
}

function compactCentralInfo(row) {
  const reason = String(row?.lastReason || "").trim().toUpperCase();
  const note = String(row?.lastNote || "").trim();
  const n = note.toLowerCase();

  // ✅ yang kamu minta: hilangkan ID, cukup 1 label
  if (n.includes("transfer to cart")) return "Transfer to Cart";
  if (n.includes("opening stock")) return "Opening Stock";

  // fallback dari reason (kalau note kosong)
  if (reason === "SHIFT_OPENING") return "Shift Opening";
  if (reason === "TRANSFER_OUT") return "Transfer to Cart";
  if (reason === "TRANSFER_IN") return "Transfer In";
  if (reason === "ADJUSTMENT") return "Adjustment";

  // default terakhir
  return reason || "-";
}

export default function AdminInventory() {
  const nav = useNavigate();
  const token = localStorage.getItem("admin_token");

  const didLoadRef = useRef(false);

  // ===== PAGE TAB =====
  const [tab, setTab] = useState("STOCK"); // STOCK | ING

  // ===== CARTS =====
  const [carts, setCarts] = useState([]);
  const [selectedCartId, setSelectedCartId] = useState("");
  const selectedCart = useMemo(
    () => (carts || []).find((c) => c.id === selectedCartId) || null,
    [carts, selectedCartId]
  );

  // ===== STOCK FILTERS =====
  const [scope, setScope] = useState("CART"); // CART | CENTRAL
  const [qStock, setQStock] = useState("");
  const [onlyZero, setOnlyZero] = useState(false);

  // ===== STOCK DATA =====
  const [stocks, setStocks] = useState([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [errStock, setErrStock] = useState("");
  const [msgStock, setMsgStock] = useState("");
  const [bootstrapBusy, setBootstrapBusy] = useState(false);
  // ===== ADJUST MODAL =====
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjBusy, setAdjBusy] = useState(false);
  const [adjErr, setAdjErr] = useState("");
  const [adjForm, setAdjForm] = useState({
    ingredientId: "",
    name: "",
    unit: "",
    isGlobal: false,
    mode: "SET", // SET | DELTA
    value: 0, // setQty atau delta
    reason: "ADJUSTMENT",
    note: "",
  });

  // ===== LEDGER MODAL =====
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerBusy, setLedgerBusy] = useState(false);
  const [ledgerErr, setLedgerErr] = useState("");
  const [ledgerFor, setLedgerFor] = useState(null); // {ingredientId, name, unit, isGlobal}
  const [ledgerItems, setLedgerItems] = useState([]);

  // ===== INGREDIENTS TAB =====
  const [qIng, setQIng] = useState("");
  const [showInactiveIng, setShowInactiveIng] = useState(false);
  const [ingLoading, setIngLoading] = useState(false);
  const [ingErr, setIngErr] = useState("");
  const [ingMsg, setIngMsg] = useState("");
  const [ingItems, setIngItems] = useState([]);
  const [ingForm, setIngForm] = useState({
    id: "",
    name: "",
    unit: "PCS",
    isGlobal: false,
    allowNegative: true,
    isActive: true,
  });

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

    // set default cart (first active) if empty
    if (!selectedCartId) {
      const firstActive = list.find((c) => (c.isActive ?? true) !== false) || list[0];
      if (firstActive?.id) setSelectedCartId(firstActive.id);
    }
  }

  // ✅ FIX: loadStocks tidak dobel + merge CENTRAL untuk bahan global (qty & lastMovement)
  async function loadStocks({ silent = false } = {}) {
    if (!token) return;

    // CART scope but no cart selected => jangan request
    if (scope === "CART" && !selectedCartId) return;

    if (!silent) {
      setLoadingStock(true);
      setErrStock("");
      setMsgStock("");
    }

    try {
      const q = qStock.trim();

      // 1) Scope CENTRAL: load sekali
      if (scope === "CENTRAL") {
        const qs = new URLSearchParams();
        qs.set("scope", "CENTRAL");
        if (q) qs.set("q", q);

        const r = await apiGet(`/api/admin/inventory/stocks?${qs.toString()}`, token);
        const items = (r.items || []).map((row) => ({ ...row, source: "CENTRAL" }));
        setStocks(items);
        return;
      }

      // 2) Scope CART: load CART + CENTRAL, lalu untuk bahan global pakai data CENTRAL
      const qsCart = new URLSearchParams();
      qsCart.set("scope", "CART");
      qsCart.set("cartId", selectedCartId);
      if (q) qsCart.set("q", q);

      const qsCentral = new URLSearchParams();
      qsCentral.set("scope", "CENTRAL");
      if (q) qsCentral.set("q", q);

      const [cartRes, centralRes] = await Promise.all([
        apiGet(`/api/admin/inventory/stocks?${qsCart.toString()}`, token),
        apiGet(`/api/admin/inventory/stocks?${qsCentral.toString()}`, token),
      ]);

      const cartItems = cartRes.items || [];
      const centralItems = centralRes.items || [];
      const centralMap = new Map(centralItems.map((x) => [x.ingredientId, x]));

      const merged = cartItems.map((row) => {
        const ing = row.ingredient || {};
        if (ing.isGlobal) {
          const c = centralMap.get(row.ingredientId);
          return {
            ...row,
            // ambil data CENTRAL utk bahan global
            qty: c ? c.qty : 0,
            lastMovementAt: c?.lastMovementAt ?? null,
            lastDelta: c?.lastDelta ?? null,
            lastType: c?.lastType ?? null,
            lastReason: c?.lastReason ?? null,
            lastNote: c?.lastNote ?? null,
            lastBalanceAfter: c?.lastBalanceAfter ?? null,
            source: "CENTRAL",
          };
        }
        return { ...row, source: "CART" };
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
      setMsgStock("Inventory schema berhasil dibootstrap. Silakan Refresh.");
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
      if (showInactiveIng) {
        // tampilkan semua (active + inactive)
      } else {
        qs.set("active", "true");
      }
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

  // auto load stocks when cart/scope changes (tab STOCK)
  useEffect(() => {
    if (!token) return;
    if (tab !== "STOCK") return;
    loadStocks({ silent: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tab, scope, selectedCartId]);

  // auto load ingredients when tab ING
  useEffect(() => {
    if (!token) return;
    if (tab !== "ING") return;
    loadIngredients({ silent: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tab, showInactiveIng]);

  function openAdjust(row, mode) {
    const ing = row?.ingredient || {};
    setAdjErr("");
    setAdjForm({
      ingredientId: row.ingredientId,
      name: ing.name || "(Bahan)",
      unit: ing.unit || "-",
      isGlobal: !!ing.isGlobal,
      mode: mode || "SET",
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

      const mode = String(adjForm.mode || "").toUpperCase();
      const v = Number(adjForm.value);

      if (mode === "SET") {
        if (!Number.isFinite(v) || v < 0) throw new Error("SET qty harus angka >= 0.");
      } else {
        if (!Number.isFinite(v) || v === 0) throw new Error("DELTA tidak boleh 0.");
      }

      const payload = {
        scope, // backend akan handle bahan global -> CENTRAL
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
        const items = await fetchLedger("CENTRAL");
        setLedgerItems(items);
        return;
      }

      const cartLedger = await fetchLedger("CART");
      if (!ingIsGlobal) {
        setLedgerItems(cartLedger);
        return;
      }

      const centralLedger = await fetchLedger("CENTRAL");
      const merged = [...cartLedger, ...centralLedger]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, limit);

      setLedgerItems(merged);
    } catch (e) {
      setLedgerErr(e?.message || "Gagal load ledger");
    } finally {
      setLedgerBusy(false);
    }
  }

  // ===== INGREDIENT FORM =====
  function resetIngForm() {
    setIngForm({
      id: "",
      name: "",
      unit: "PCS",
      isGlobal: false,
      allowNegative: true,
      isActive: true,
    });
  }

  function editIng(x) {
    setIngErr("");
    setIngMsg("");
    setIngForm({
      id: x.id,
      name: x.name || "",
      unit: x.unit || "PCS",
      isGlobal: !!x.isGlobal,
      allowNegative: x.allowNegative == null ? true : !!x.allowNegative,
      isActive: (x.isActive ?? true) !== false,
    });
  }

  async function submitIng(e) {
    e.preventDefault();
    setIngErr("");
    setIngMsg("");

    try {
      const payload = {
        name: String(ingForm.name || "").trim(),
        unit: String(ingForm.unit || "PCS").toUpperCase(),
        isGlobal: !!ingForm.isGlobal,
        allowNegative: !!ingForm.allowNegative,
      };

      if (!payload.name || payload.name.length < 2) throw new Error("Nama bahan minimal 2 karakter.");

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
    } catch (e2) {
      setIngErr(e2?.message || "Gagal simpan bahan");
    }
  }

  async function toggleIngActive(x) {
    setIngErr("");
    setIngMsg("");

    try {
      const next = !((x.isActive ?? true) !== false);
      await apiPatch(`/api/admin/ingredients/${x.id}`, { isActive: next }, token);
      setIngMsg(`Bahan ${next ? "diaktifkan" : "dinonaktifkan"}.`);
      await loadIngredients({ silent: true });
      await loadStocks({ silent: true });
    } catch (e) {
      setIngErr(e?.message || "Gagal ubah status bahan");
    }
  }

  async function deactivateIng(x) {
    setIngErr("");
    setIngMsg("");

    const ok = window.confirm(`Nonaktifkan bahan "${x.name}"?`);
    if (!ok) return;

    try {
      await apiDelete(`/api/admin/ingredients/${x.id}`, token);
      setIngMsg("Bahan dinonaktifkan.");
      await loadIngredients({ silent: true });
      await loadStocks({ silent: true });
    } catch (e) {
      setIngErr(e?.message || "Gagal menonaktifkan bahan");
    }
  }

  const scopeLabel = scope === "CENTRAL" ? "CENTRAL" : "GEROBAK";
  const cartLabel = scope === "CENTRAL" ? "Gudang / Central" : selectedCart?.name || "(Pilih gerobak)";
  const visibleIngItems = showInactiveIng ? ingItems : ingItems.filter((x) => (x.isActive ?? true) !== false);

  // ✅ FILTER + SORT view stok
  const visibleStocks = useMemo(() => {
    let rows = [...(stocks || [])];
    if (onlyZero) rows = rows.filter((r) => Number(r.qty ?? 0) <= 0);

    rows.sort((a, b) => {
      const an = (a.ingredient?.name || "").toLowerCase();
      const bn = (b.ingredient?.name || "").toLowerCase();
      return an.localeCompare(bn);
    });

    return rows;
  }, [stocks, onlyZero]);

  // ✅ RINGKASAN
  const stockSummary = useMemo(() => {
    const all = stocks || [];
    const total = all.length;
    const zero = all.filter((r) => Number(r.qty ?? 0) <= 0).length;

    const cartCount = all.filter((r) => (r.source || ((r.ingredient || {}).isGlobal ? "CENTRAL" : "CART")) === "CART").length;
    const centralCount = total - cartCount;

    let lastTs = 0;
    for (const r of all) {
      const t = r?.lastMovementAt ? new Date(r.lastMovementAt).getTime() : 0;
      if (t > lastTs) lastTs = t;
    }

    return {
      total,
      zero,
      cartCount,
      centralCount,
      lastUpdatedAt: lastTs ? new Date(lastTs).toISOString() : null,
    };
  }, [stocks]);

  return (
    <div className="adm-bg adm adm-inventory">
      <div className="adm-shell">
        <div className="adm-layout">
          {/* SIDEBAR */}
          <aside className="adm-nav">
            <div className="adm-nav-card">
              <div className="adm-nav-title">Admin</div>
              <div className="adm-nav-sub">Kelola stok & bahan</div>

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
                <button className="adm-nav-item" type="button" onClick={() => nav("/admin/carts")}>
                  Kelola Gerobak
                </button>
                <button className="adm-nav-item" type="button" onClick={() => nav("/admin/reports")}>
                  Laporan
                </button>
                <button className="adm-nav-item active" type="button" onClick={() => nav("/admin/inventory")}>
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
                  <h2 className="adm-h2">Stok & Bahan</h2>
                  <div className="adm-subline">
                    <span className="muted">
                      Scope: <b>{scopeLabel}</b> • Target: <b>{cartLabel}</b>
                    </span>

                    {/* ✅ Summary badges */}
                    {tab === "STOCK" ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                        <span className="adm-badge">Total: {stockSummary.total}</span>
                        <span className="adm-badge">Stok 0: {stockSummary.zero}</span>
                        <span className="adm-badge adm-badge--cash">CART: {stockSummary.cartCount}</span>
                        <span className="adm-badge adm-badge--qris">CENTRAL: {stockSummary.centralCount}</span>
                        <span className="adm-badge">
                          Update terakhir: <b>{fmtDT(stockSummary.lastUpdatedAt)}</b>
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="adm-actions">
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => {
                      if (tab === "STOCK") loadStocks({ silent: false });
                      else loadIngredients({ silent: false });
                    }}
                  >
                    Refresh
                  </button>
                  <button className="btn secondary" type="button" onClick={() => nav("/admin/dashboard")}>
                    Kembali
                  </button>
                </div>
              </div>

              <Tabs
                items={[
                  { value: "STOCK", label: "Stok" },
                  { value: "ING", label: "Bahan" },
                  { value: "TRANSFER", label: "Transfer Requests" }
                ]}
                value={tab}
                onChange={setTab}
              />

              {/* ===== TAB STOCK ===== */}
              {tab === "STOCK" ? (
                <>
                  <div style={{ marginTop: 14 }}>
                    <section className="adm-panel">
                      <div className="adm-panel-head">
                        <h3 className="adm-h3">Filter</h3>
                        <span className="muted">Pilih gerobak / central + cari bahan</span>
                      </div>

                      <div className="row" style={{ marginTop: 10 }}>
                        <div className="col" style={{ minWidth: 220 }}>
                          <label>Scope</label>
                          <select
                            className="input"
                            value={scope}
                            onChange={(e) => {
                              const v = e.target.value === "CENTRAL" ? "CENTRAL" : "CART";
                              setScope(v);
                              setMsgStock("");
                              setErrStock("");
                            }}
                          >
                            <option value="CART">Gerobak (CART)</option>
                            <option value="CENTRAL">Central (CENTRAL)</option>
                          </select>
                        </div>

                        <div className="col" style={{ minWidth: 240 }}>
                          <label>Gerobak</label>
                          <select
                            className="input"
                            value={selectedCartId}
                            disabled={scope === "CENTRAL"}
                            onChange={(e) => setSelectedCartId(e.target.value)}
                          >
                            {(carts || []).map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name} {(c.isActive ?? true) === false ? "(Nonaktif)" : ""}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="col" style={{ minWidth: 240 }}>
                          <label>Cari bahan</label>
                          <input
                            className="input"
                            value={qStock}
                            onChange={(e) => setQStock(e.target.value)}
                            placeholder="contoh: cireng / kemasan / saus"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") loadStocks({ silent: false });
                            }}
                          />
                        </div>

                        <div className="col" style={{ minWidth: 160, display: "flex", alignItems: "end", gap: 10 }}>
                          <button className="btn secondary" type="button" onClick={() => loadStocks({ silent: false })}>
                            Cari
                          </button>

                          {/* ✅ Filter stok 0 */}
                          <label className="adm-inline" style={{ marginBottom: 4 }}>
                            <input
                              type="checkbox"
                              checked={onlyZero}
                              onChange={(e) => setOnlyZero(e.target.checked)}
                            />
                            <span>Hanya stok 0</span>
                          </label>
                        </div>
                      </div>

                      {loadingStock ? <div className="adm-alert" style={{ marginTop: 12 }}>Loading...</div> : null}
                      {errStock ? (
                        <div className="adm-alert" role="alert" aria-live="polite" style={{ marginTop: 12 }}>
                          {errStock}
                          {String(errStock).includes("Inventory/Recipe belum siap") ? (
                            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                              <button
                                className="btn secondary btn--sm"
                                type="button"
                                onClick={bootstrapInventory}
                                disabled={bootstrapBusy}
                              >
                                {bootstrapBusy ? "Setup..." : "Setup Inventory"}
                              </button>
                              <span className="muted" style={{ fontSize: 12 }}>
                                Klik sekali untuk membuat tabel/enums inventory tanpa menghapus data.
                              </span>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {msgStock ? (
                        <div className="adm-alert adm-alert--ok" role="status" aria-live="polite" style={{ marginTop: 12 }}>
                          {msgStock}
                        </div>
                      ) : null}
                    </section>
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <section className="adm-panel">
                      <div className="adm-panel-head">
                        <h3 className="adm-h3">Daftar Stok</h3>
                        <span className="muted">
                          {scope === "CART"
                            ? "Bahan global akan tampil dari CENTRAL (otomatis)."
                            : "Menampilkan stok CENTRAL."}
                          {" "}• tampil: <b>{visibleStocks.length}</b>
                        </span>
                      </div>

                      <div className="adm-table-wrap">
                        <table className="table adm-table">
                          <thead>
                            <tr>
                              <th>Bahan</th>
                              <th style={{ width: 90 }}>Unit</th>
                              <th style={{ width: 110 }}>Qty</th>
                              <th style={{ width: 90 }}>Δ</th>
                              <th style={{ width: 220 }}>Update Terakhir</th>
                              <th style={{ width: 120 }}>Sumber</th>
                              <th style={{ width: 260 }}>Aksi</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleStocks.map((row) => {
                              const ing = row.ingredient || {};
                              const source = row.source || (ing.isGlobal ? "CENTRAL" : "CART");
                              const badgeClass =
                                source === "CENTRAL" ? "adm-badge adm-badge--qris" : "adm-badge adm-badge--cash";

                              const lastAt = row?.lastMovementAt || null;
                              const lastDelta = row?.lastDelta;

                              return (
                                <tr key={row.ingredientId}>
                                  <td data-label="Bahan">
                                    <b>{ing.name}</b>{" "}
                                    {ing.isGlobal ? <span className="muted">(Global)</span> : null}
                                    {(ing.isActive ?? true) === false ? <span className="muted"> • (Nonaktif)</span> : null}
                                  </td>

                                  <td data-label="Unit">{ing.unit}</td>

                                  <td data-label="Qty">
                                    <b>{Number(row.qty ?? 0)}</b>
                                  </td>

                                  <td data-label="Δ">
                                    <b>{lastDelta == null ? "-" : Number(lastDelta)}</b>
                                  </td>

                                  <td data-label="Update Terakhir">
                                    <div style={{ fontWeight: 700 }}>{fmtDT(lastAt)}</div>
                                    <div className="muted" style={{ fontSize: 12 }}>
                                      {scope === "CENTRAL"
                                        ? compactCentralInfo(row)
                                        : `${row?.lastReason || "-"}`}
                                    </div>
                                  </td>

                                  <td data-label="Sumber">
                                    <span className={badgeClass}>{source}</span>
                                  </td>

                                  <td data-label="Aksi">
                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                      <button className="btn secondary btn--sm" type="button" onClick={() => openAdjust(row, "SET")}>
                                        Set
                                      </button>
                                      <button className="btn secondary btn--sm" type="button" onClick={() => openAdjust(row, "DELTA")}>
                                        ± Delta
                                      </button>
                                      <button className="btn secondary btn--sm" type="button" onClick={() => openLedger(row)}>
                                        Ledger
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}

                            {(!visibleStocks || visibleStocks.length === 0) && (
                              <tr>
                                <td colSpan={7} className="muted">
                                  Tidak ada data untuk filter ini.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </div>

                  {/* ADJUST MODAL */}
                  <Modal
                    open={adjOpen}
                    onClose={() => (adjBusy ? null : setAdjOpen(false))}
                    title={`Adjust Stok • ${adjForm.name}`}
                    footer={
                      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                        <button className="btn secondary" type="button" onClick={() => setAdjOpen(false)} disabled={adjBusy}>
                          Batal
                        </button>
                        <button className="btn" type="button" onClick={submitAdjust} disabled={adjBusy}>
                          {adjBusy ? "Menyimpan..." : "Simpan"}
                        </button>
                      </div>
                    }
                  >
                    {adjErr ? <div className="adm-alert" style={{ marginBottom: 10 }}>{adjErr}</div> : null}

                    <div className="row">
                      <div className="col">
                        <label>Mode</label>
                        <select
                          className="input"
                          value={adjForm.mode}
                          onChange={(e) => setAdjForm((p) => ({ ...p, mode: e.target.value }))}
                        >
                          <option value="SET">SET (absolute)</option>
                          <option value="DELTA">DELTA (+/-)</option>
                        </select>
                      </div>

                      <div className="col">
                        <label>{adjForm.mode === "SET" ? "Qty Baru" : "Delta (+/-)"}</label>
                        <input
                          className="input"
                          type="number"
                          value={adjForm.value}
                          onChange={(e) => setAdjForm((p) => ({ ...p, value: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <label>Reason</label>
                      <select
                        className="input"
                        value={adjForm.reason}
                        onChange={(e) => setAdjForm((p) => ({ ...p, reason: e.target.value }))}
                      >
                        <option value="ADJUSTMENT">ADJUSTMENT</option>
                        <option value="RESTOCK">RESTOCK</option>
                        <option value="WASTE">WASTE</option>
                        <option value="TRANSFER">TRANSFER</option>
                        <option value="OPNAME">OPNAME</option>
                      </select>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <label>Catatan (opsional)</label>
                      <input
                        className="input"
                        value={adjForm.note}
                        onChange={(e) => setAdjForm((p) => ({ ...p, note: e.target.value }))}
                        placeholder="contoh: opname harian / buang rusak / restock"
                      />
                    </div>

                    <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
                      Bahan global akan otomatis masuk CENTRAL (meski scope sedang CART).
                    </div>
                  </Modal>

                  {/* LEDGER MODAL */}
                  <Modal
                    open={ledgerOpen}
                    onClose={() => (ledgerBusy ? null : setLedgerOpen(false))}
                    title={`Ledger • ${ledgerFor?.name || ""}`}
                  >
                    {ledgerErr ? <div className="adm-alert" style={{ marginBottom: 10 }}>{ledgerErr}</div> : null}
                    {ledgerBusy ? <div className="muted">Loading ledger...</div> : null}

                    {!ledgerBusy ? (
                      <div className="adm-table-wrap">
                        <table className="table adm-table">
                          <thead>
                            <tr>
                              <th>Waktu</th>
                              <th style={{ width: 120 }}>Sumber</th>
                              <th style={{ width: 110 }}>Delta</th>
                              <th style={{ width: 140 }}>Balance After</th>
                              <th>Reason / Note</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(ledgerItems || []).map((x) => {
                              const src = x.source || (scope === "CENTRAL" ? "CENTRAL" : "CART");
                              const badgeClass =
                                src === "CENTRAL" ? "adm-badge adm-badge--qris" : "adm-badge adm-badge--cash";

                              return (
                                <tr key={x.id}>
                                  <td data-label="Waktu">{fmtDT(x.createdAt)}</td>
                                  <td data-label="Sumber">
                                    <span className={badgeClass}>{src}</span>
                                  </td>
                                  <td data-label="Delta">
                                    <b>{Number(x.delta ?? 0)}</b>
                                  </td>
                                  <td data-label="Balance After">{Number(x.balanceAfter ?? 0)}</td>
                                  <td data-label="Reason/Note">
                                    <div><b>{x.reason || "-"}</b></div>
                                    <div className="muted" style={{ fontSize: 12 }}>{x.note || "-"}</div>
                                  </td>
                                </tr>
                              );
                            })}
                            {(!ledgerItems || ledgerItems.length === 0) && (
                              <tr>
                                <td colSpan={5} className="muted">Belum ada ledger.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </Modal>
                </>
              ) : null}

              {/* ===== TAB INGREDIENTS ===== */}
              {tab === "ING" ? (
                <div style={{ marginTop: 14 }}>
                  <section className="adm-panel">
                    <div className="adm-panel-head">
                      <h3 className="adm-h3">Kelola Bahan</h3>
                      <span className="muted">Tambah bahan selain Cireng/Kemasan, atur global/negatif</span>
                    </div>

                    <div className="row" style={{ marginTop: 10 }}>
                      <div className="col" style={{ minWidth: 260 }}>
                        <label>Cari</label>
                        <input
                          className="input"
                          value={qIng}
                          onChange={(e) => setQIng(e.target.value)}
                          placeholder="contoh: saus / cabai / minyak"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") loadIngredients({ silent: false });
                          }}
                        />
                      </div>

                      <div className="col" style={{ display: "flex", alignItems: "end", gap: 10, minWidth: 220 }}>
                        <button className="btn secondary" type="button" onClick={() => loadIngredients({ silent: false })}>
                          Cari
                        </button>

                        <label className="adm-inline" style={{ marginBottom: 4 }}>
                          <input
                            type="checkbox"
                            checked={showInactiveIng}
                            onChange={(e) => setShowInactiveIng(e.target.checked)}
                          />
                          <span>Tampilkan nonaktif</span>
                        </label>
                      </div>
                    </div>

                    {ingLoading ? <div className="adm-alert" style={{ marginTop: 12 }}>Loading...</div> : null}
                    {ingErr ? <div className="adm-alert" style={{ marginTop: 12 }}>{ingErr}</div> : null}
                    {ingMsg ? <div className="adm-alert adm-alert--ok" style={{ marginTop: 12 }}>{ingMsg}</div> : null}

                    <div style={{ marginTop: 14 }}>
                      {/* FORM */}
                      <section className="adm-panel">
                        <div className="adm-panel-head">
                          <h3 className="adm-h3">{ingForm.id ? "Edit Bahan" : "Tambah Bahan"}</h3>
                          <span className="muted">{ingForm.id ? `ID: ${ingForm.id}` : "Create"}</span>
                        </div>

                        <form onSubmit={submitIng} className="adm-form">
                          <div className="adm-form-grid">
                            <div className="adm-field">
                              <label>Nama</label>
                              <input
                                className="input"
                                value={ingForm.name}
                                onChange={(e) => setIngForm((p) => ({ ...p, name: e.target.value }))}
                                placeholder="contoh: Saus Kacang"
                              />
                            </div>

                            <div className="adm-field">
                              <label>Unit</label>
                              <select
                                className="input"
                                value={ingForm.unit}
                                onChange={(e) => setIngForm((p) => ({ ...p, unit: e.target.value }))}
                              >
                                <option value="PCS">PCS</option>
                                <option value="GRAM">GRAM</option>
                                <option value="ML">ML</option>
                              </select>
                            </div>
                          </div>

                          <div className="adm-actions-row">
                            <label className="adm-inline">
                              <input
                                type="checkbox"
                                checked={!!ingForm.isGlobal}
                                onChange={(e) => setIngForm((p) => ({ ...p, isGlobal: e.target.checked }))}
                              />
                              <span>Global (CENTRAL)</span>
                            </label>

                            <label className="adm-inline">
                              <input
                                type="checkbox"
                                checked={!!ingForm.allowNegative}
                                onChange={(e) => setIngForm((p) => ({ ...p, allowNegative: e.target.checked }))}
                              />
                              <span>Boleh minus</span>
                            </label>

                            {ingForm.id ? (
                              <label className="adm-inline">
                                <input
                                  type="checkbox"
                                  checked={!!ingForm.isActive}
                                  onChange={(e) => setIngForm((p) => ({ ...p, isActive: e.target.checked }))}
                                />
                                <span>Aktif</span>
                              </label>
                            ) : null}

                            <div className="adm-actions-right">
                              <button className="btn" type="submit">
                                {ingForm.id ? "Simpan" : "Tambah"}
                              </button>
                              <button className="btn secondary" type="button" onClick={resetIngForm}>
                                Reset
                              </button>
                            </div>
                          </div>
                        </form>
                      </section>

                      {/* LIST */}
                      <section className="adm-panel">
                        <div className="adm-panel-head">
                          <h3 className="adm-h3">Daftar Bahan</h3>
                          <span className="muted">{visibleIngItems.length} item</span>
                        </div>

                        <div className="adm-table-wrap">
                          <table className="table adm-table">
                            <thead>
                              <tr>
                                <th>Nama</th>
                                <th style={{ width: 90 }}>Unit</th>
                                <th style={{ width: 120 }}>Scope</th>
                                <th style={{ width: 120 }}>Minus</th>
                                <th style={{ width: 220 }}>Aksi</th>
                              </tr>
                            </thead>
                            <tbody>
                              {visibleIngItems.map((x) => {
                                const active = (x.isActive ?? true) !== false;
                                return (
                                  <tr key={x.id}>
                                    <td data-label="Nama">
                                      <b>{x.name}</b> {!active ? <span className="muted">(Nonaktif)</span> : null}
                                    </td>
                                    <td data-label="Unit">{x.unit}</td>
                                    <td data-label="Scope">
                                      <span className={x.isGlobal ? "adm-badge adm-badge--qris" : "adm-badge adm-badge--cash"}>
                                        {x.isGlobal ? "CENTRAL" : "CART"}
                                      </span>
                                    </td>
                                    <td data-label="Minus">{x.allowNegative ? "Yes" : "No"}</td>
                                    <td data-label="Aksi">
                                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                        <button className="btn secondary btn--sm" type="button" onClick={() => editIng(x)}>
                                          Edit
                                        </button>
                                        <button
                                          className={active ? "btn danger btn--sm" : "btn btn--sm"}
                                          type="button"
                                          onClick={() => toggleIngActive(x)}
                                        >
                                          {active ? "Nonaktifkan" : "Aktifkan"}
                                        </button>
                                        <button className="btn danger btn--sm" type="button" onClick={() => deactivateIng(x)}>
                                          Delete
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}

                              {!visibleIngItems.length ? (
                                <tr>
                                  <td colSpan={5} className="muted">Belum ada bahan.</td>
                                </tr>
                              ) : null}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    </div>
                  </section>
                </div>
              ) : null}
              {tab === "TRANSFER" ? (
                <TransferRequestsPanel token={token} carts={carts} />
              ) : null}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}