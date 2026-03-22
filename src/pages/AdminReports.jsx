import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../api";
import Tabs from "../components/ui/Tabs";

function ymdWib(d = new Date()) {
  const offsetMs = 7 * 60 * 60 * 1000;
  const w = new Date(d.getTime() + offsetMs);
  const y = w.getUTCFullYear();
  const m = String(w.getUTCMonth() + 1).padStart(2, "0");
  const day = String(w.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateWib(dateStr) {
  if (!dateStr) return "-";
  try {
    return new Date(`${dateStr}T00:00:00+07:00`).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Jakarta",
    });
  } catch {
    return String(dateStr);
  }
}

function formatRangeLabel(startDate, endDate) {
  if (!startDate && !endDate) return "-";
  return `${formatDateWib(startDate)} s/d ${formatDateWib(endDate)}`;
}

function buildRangeQuery(startDate, endDate) {
  const qs = new URLSearchParams();
  if (startDate) qs.set("startDate", startDate);
  if (endDate) qs.set("endDate", endDate);
  const raw = qs.toString();
  return raw ? `?${raw}` : "";
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("id-ID");
}

function shortTxnId(id) {
  return String(id || "-").slice(-8).toUpperCase();
}

function fmtDT(dt) {
  if (!dt) return "-";
  try {
    return new Date(dt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
  } catch {
    return String(dt);
  }
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

function summarizeStocks(rows = []) {
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

function getStockStatusTone(status) {
  const s = String(status || "OK").toUpperCase();
  if (s === "OUT_OF_STOCK") {
    return { borderColor: "rgba(234,47,20,0.28)", background: "rgba(234,47,20,0.12)", color: "#7f1d1d" };
  }
  if (s === "LOW_STOCK") {
    return { borderColor: "rgba(248,82,8,0.28)", background: "rgba(248,82,8,0.12)", color: "#9a3412" };
  }
  if (s === "REORDER") {
    return { borderColor: "rgba(255,176,1,0.34)", background: "rgba(255,176,1,0.16)", color: "#854d0e" };
  }
  return { borderColor: "rgba(34,197,94,0.24)", background: "rgba(34,197,94,0.10)", color: "#166534" };
}

function StatusBadge({ status }) {
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

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

async function downloadWithAuth(path, token, fallbackName) {
  const res = await fetch(API_BASE + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    try {
      const j = JSON.parse(text);
      throw new Error(j.error || `HTTP ${res.status}`);
    } catch {
      throw new Error(text || `HTTP ${res.status}`);
    }
  }

  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") || "";
  const m = cd.match(/filename="([^"]+)"/i);
  const filename = m?.[1] || fallbackName;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function AdminReports() {
  const nav = useNavigate();
  const token = localStorage.getItem("admin_token") || localStorage.getItem("auth_token");
  const today = ymdWib();

  const [tab, setTab] = useState("SALES"); // SALES | STOCK | LEDGER

  const [carts, setCarts] = useState([]);
  const [activeCartId, setActiveCartId] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  const [loadingCarts, setLoadingCarts] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [report, setReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [showAllSales, setShowAllSales] = useState(false);

  const [stockScope, setStockScope] = useState("CART");
  const [stockQ, setStockQ] = useState("");
  const [stockStatus, setStockStatus] = useState("ALL");
  const [stockRows, setStockRows] = useState([]);
  const [loadingStock, setLoadingStock] = useState(false);

  const [ledgerQ, setLedgerQ] = useState("");
  const [ledgerType, setLedgerType] = useState("");
  const [ledgerReason, setLedgerReason] = useState("");
  const [ledgerRows, setLedgerRows] = useState([]);
  const [ledgerSummary, setLedgerSummary] = useState({
    movements: 0,
    totalIn: 0,
    totalOut: 0,
    net: 0,
    lastMovementAt: null,
  });
  const [loadingLedger, setLoadingLedger] = useState(false);

  useEffect(() => {
    if (!token) nav("/admin");
  }, [token, nav]);

  const selectedCart = useMemo(
    () => carts.find((c) => c.id === activeCartId),
    [carts, activeCartId]
  );

  function validateRange(sd = startDate, ed = endDate) {
    if (!sd || !ed) return "Tanggal awal dan tanggal akhir wajib diisi.";
    if (sd > ed) return "Tanggal awal tidak boleh lebih besar dari tanggal akhir.";
    return "";
  }

  async function loadCarts() {
    setErr("");
    setMsg("");
    setLoadingCarts(true);
    try {
      const r = await apiGet("/api/admin/carts", token);
      const list = r.carts || [];
      setCarts(list);
      if (!activeCartId && list.length) setActiveCartId(list[0].id);
    } catch (e) {
      setErr(e?.message || "Gagal load carts");
    } finally {
      setLoadingCarts(false);
    }
  }

  async function loadSalesReport(cartId = activeCartId, sd = startDate, ed = endDate) {
    if (!cartId) return;

    const rangeErr = validateRange(sd, ed);
    if (rangeErr) {
      setErr(rangeErr);
      setReport(null);
      return;
    }

    setErr("");
    setMsg("");
    setLoadingReport(true);
    try {
      const qs = buildRangeQuery(sd, ed);
      const r = await apiGet(`/api/reports/cart/${cartId}${qs}`, token);
      setReport(r);
    } catch (e) {
      setErr(e?.message || "Gagal load report");
      setReport(null);
    } finally {
      setLoadingReport(false);
    }
  }

  async function loadStockSnapshot() {
    if (stockScope === "CART" && !activeCartId) return;

    setErr("");
    setMsg("");
    setLoadingStock(true);
    try {
      const qs = new URLSearchParams();
      qs.set("scope", stockScope);
      if (stockScope === "CART") qs.set("cartId", activeCartId);
      if (stockQ.trim()) qs.set("q", stockQ.trim());
      if (stockStatus !== "ALL") qs.set("status", stockStatus);

      const r = await apiGet(`/api/admin/inventory/stocks?${qs.toString()}`, token);
      setStockRows(r.items || []);
    } catch (e) {
      setErr(e?.message || "Gagal load stock snapshot");
      setStockRows([]);
    } finally {
      setLoadingStock(false);
    }
  }

  async function loadStockLedger() {
    if (stockScope === "CART" && !activeCartId) return;

    const rangeErr = validateRange();
    if (rangeErr) {
      setErr(rangeErr);
      return;
    }

    setErr("");
    setMsg("");
    setLoadingLedger(true);
    try {
      const qs = new URLSearchParams();
      qs.set("scope", stockScope);
      if (stockScope === "CART") qs.set("cartId", activeCartId);
      if (startDate) qs.set("startDate", startDate);
      if (endDate) qs.set("endDate", endDate);
      if (ledgerQ.trim()) qs.set("q", ledgerQ.trim());
      if (ledgerType.trim()) qs.set("type", ledgerType.trim());
      if (ledgerReason.trim()) qs.set("reason", ledgerReason.trim());
      qs.set("limit", "300");

      const r = await apiGet(`/api/admin/inventory/ledger?${qs.toString()}`, token);
      setLedgerRows(r.items || []);
      setLedgerSummary(
        r.summary || {
          movements: 0,
          totalIn: 0,
          totalOut: 0,
          net: 0,
          lastMovementAt: null,
        }
      );
    } catch (e) {
      setErr(e?.message || "Gagal load stock ledger");
      setLedgerRows([]);
      setLedgerSummary({
        movements: 0,
        totalIn: 0,
        totalOut: 0,
        net: 0,
        lastMovementAt: null,
      });
    } finally {
      setLoadingLedger(false);
    }
  }

  useEffect(() => {
    if (token) loadCarts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token || !activeCartId) return;
    if (tab === "SALES") loadSalesReport(activeCartId, startDate, endDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, activeCartId, startDate, endDate, tab]);

  useEffect(() => {
    if (!token) return;
    if (tab === "STOCK") loadStockSnapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tab, activeCartId, stockScope]);

  useEffect(() => {
    if (!token) return;
    if (tab === "LEDGER") loadStockLedger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tab, activeCartId, stockScope, startDate, endDate]);

  const totals = report?.totals || {};
  const sales = report?.sales || [];
  const topProducts = report?.topProducts || [];
  const portionTotals = useMemo(() => {
    const raw = report?.portionTotals || {};
    return {
      small: Number(raw.small || 0),
      large: Number(raw.large || 0),
      total: Number(raw.total || 0),
    };
  }, [report]);

  const visibleSales = showAllSales ? sales : sales.slice(0, 20);
  const displayStartDate = report?.startDate || startDate;
  const displayEndDate = report?.endDate || endDate;
  const rangeLabel = formatRangeLabel(displayStartDate, displayEndDate);

  const stockSummary = useMemo(() => summarizeStocks(stockRows), [stockRows]);

  async function exportSalesCsv() {
    if (!activeCartId) return;
    const rangeErr = validateRange();
    if (rangeErr) {
      setErr(rangeErr);
      return;
    }

    setErr("");
    setMsg("");
    try {
      const qs = buildRangeQuery(startDate, endDate);
      const fallback = `report_${activeCartId}_${startDate}_sd_${endDate}.csv`;
      await downloadWithAuth(`/api/reports/cart/${activeCartId}/export.csv${qs}`, token, fallback);
      setMsg("Export CSV penjualan dimulai.");
    } catch (e) {
      setErr(e?.message || "Gagal export CSV");
    }
  }

  async function exportSalesPdf() {
    if (!activeCartId) return;
    const rangeErr = validateRange();
    if (rangeErr) {
      setErr(rangeErr);
      return;
    }

    setErr("");
    setMsg("");
    try {
      const qs = buildRangeQuery(startDate, endDate);
      const fallback = `report_${activeCartId}_${startDate}_sd_${endDate}.pdf`;
      await downloadWithAuth(`/api/reports/cart/${activeCartId}/export.pdf${qs}`, token, fallback);
      setMsg("Export PDF penjualan dimulai.");
    } catch (e) {
      setErr(e?.message || "Gagal export PDF");
    }
  }

  async function exportSnapshotCsvServer() {
    try {
      const qs = new URLSearchParams();
      qs.set("scope", stockScope);
      if (stockScope === "CART") qs.set("cartId", activeCartId);
      if (stockQ.trim()) qs.set("q", stockQ.trim());
      if (stockStatus !== "ALL") qs.set("status", stockStatus);

      await downloadWithAuth(
        `/api/admin/inventory/export.csv?${qs.toString()}`,
        token,
        `inventory_snapshot_${Date.now()}.csv`
      );
      setMsg("Export CSV stock snapshot dimulai.");
    } catch (e) {
      setErr(e?.message || "Gagal export stock snapshot CSV");
    }
  }

  function exportSnapshotCsvCurrent() {
    try {
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
          "Last Movement At",
          "Last Movement Type",
          "Last Reason",
          "Last Note",
        ]
          .map(csvCell)
          .join(","),
      ];

      for (const row of stockRows || []) {
        const ing = row.ingredient || {};
        lines.push(
          [
            stockScope,
            stockScope === "CENTRAL" ? "Central" : selectedCart?.name || "",
            ing.code || "",
            ing.name || "",
            ing.category || "",
            ing.isGlobal ? "CENTRAL" : "CART",
            ing.unit || "",
            Number(row.qty || 0),
            Number(ing.minStock || 0),
            Number(ing.reorderPoint || 0),
            Number(ing.parStock || 0),
            Number(row.suggestedOrderQty || 0),
            row.stockStatus || "OK",
            row.lastMovementAt ? new Date(row.lastMovementAt).toISOString() : "",
            row.lastType || "",
            row.lastReason || "",
            row.lastNote || "",
          ]
            .map(csvCell)
            .join(",")
        );
      }

      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      downloadTextFile(`inventory_snapshot_current_${stamp}.csv`, "\uFEFF" + lines.join("\n"));
      setMsg("Export CSV stock snapshot dari current view berhasil.");
    } catch (e) {
      setErr(e?.message || "Gagal export current stock snapshot");
    }
  }

  async function exportLedgerCsvServer() {
    try {
      const rangeErr = validateRange();
      if (rangeErr) {
        setErr(rangeErr);
        return;
      }

      const qs = new URLSearchParams();
      qs.set("scope", stockScope);
      if (stockScope === "CART") qs.set("cartId", activeCartId);
      if (startDate) qs.set("startDate", startDate);
      if (endDate) qs.set("endDate", endDate);
      if (ledgerQ.trim()) qs.set("q", ledgerQ.trim());
      if (ledgerType.trim()) qs.set("type", ledgerType.trim());
      if (ledgerReason.trim()) qs.set("reason", ledgerReason.trim());

      await downloadWithAuth(
        `/api/admin/inventory/ledger/export.csv?${qs.toString()}`,
        token,
        `inventory_ledger_${Date.now()}.csv`
      );
      setMsg("Export CSV stock ledger dimulai.");
    } catch (e) {
      setErr(e?.message || "Gagal export stock ledger CSV");
    }
  }

  function handleTodayRange() {
    const now = ymdWib();
    setStartDate(now);
    setEndDate(now);
  }

  return (
    <div className="adm-bg adm adm-reports">
      <div className="adm-shell">
        <div className="adm-layout">
          <aside className="adm-nav">
            <div className="adm-nav-card">
              <div className="adm-nav-title">Admin</div>
              <div className="adm-nav-sub">Laporan Penjualan & Stok</div>

              <div className="adm-nav-list">
                <button className="adm-nav-item" type="button" onClick={() => nav("/admin/dashboard")}>Live Report</button>
                <button className="adm-nav-item" type="button" onClick={() => nav("/admin/products")}>Menu</button>
                <button className="adm-nav-item" type="button" onClick={() => nav("/admin/promos")}>Promo</button>
                <button className="adm-nav-item" type="button" onClick={() => nav("/admin/users")}>User Management</button>
                <button className="adm-nav-item" type="button" onClick={() => nav("/admin/carts")}>Kelola Gerobak</button>
                <button className="adm-nav-item active" type="button" onClick={() => nav("/admin/reports")}>Laporan</button>
                <button className="adm-nav-item" type="button" onClick={() => nav("/admin/inventory")}>Stok</button>
              </div>

              <div className="adm-nav-foot">
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => {
                    localStorage.removeItem("admin_token");
                    localStorage.removeItem("auth_token");
                    nav("/admin");
                  }}
                >
                  Logout
                </button>
              </div>
            </div>
          </aside>

          <main className="adm-main">
            <div className="adm-main-card">
              <div className="adm-header">
                <div>
                  <h2 className="adm-h2">Laporan</h2>
                  <div className="adm-subline">
                    <span className="muted">
                      Audit penjualan, snapshot stok, dan pergerakan ledger dari admin.
                    </span>
                  </div>
                </div>

                <div className="adm-actions" style={{ flexWrap: "wrap", gap: 12 }}>
                  <button className="btn secondary" type="button" onClick={handleTodayRange}>
                    Hari Ini
                  </button>
                  {tab === "SALES" ? (
                    <>
                      <button className="btn secondary" type="button" onClick={() => loadSalesReport(activeCartId, startDate, endDate)} disabled={!activeCartId || loadingReport}>
                        {loadingReport ? "Loading..." : "Refresh Sales"}
                      </button>
                      <button className="btn" type="button" onClick={exportSalesCsv} disabled={!activeCartId}>
                        Export Sales CSV
                      </button>
                      <button className="btn" type="button" onClick={exportSalesPdf} disabled={!activeCartId}>
                        Export Sales PDF
                      </button>
                    </>
                  ) : null}

                  {tab === "STOCK" ? (
                    <>
                      <button className="btn secondary" type="button" onClick={loadStockSnapshot} disabled={loadingStock}>
                        {loadingStock ? "Loading..." : "Refresh Snapshot"}
                      </button>
                      <button className="btn secondary" type="button" onClick={exportSnapshotCsvCurrent}>
                        Export Current View
                      </button>
                      <button className="btn" type="button" onClick={exportSnapshotCsvServer}>
                        Export Snapshot CSV
                      </button>
                    </>
                  ) : null}

                  {tab === "LEDGER" ? (
                    <>
                      <button className="btn secondary" type="button" onClick={loadStockLedger} disabled={loadingLedger}>
                        {loadingLedger ? "Loading..." : "Refresh Ledger"}
                      </button>
                      <button className="btn" type="button" onClick={exportLedgerCsvServer}>
                        Export Ledger CSV
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

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

              <div style={{ marginTop: 14 }}>
                <Tabs
                  items={[
                    { value: "SALES", label: "Sales Report" },
                    { value: "STOCK", label: "Stock Snapshot" },
                    { value: "LEDGER", label: "Stock Ledger" },
                  ]}
                  value={tab}
                  onChange={setTab}
                />
              </div>

              <section className="adm-panel" style={{ marginTop: 14 }}>
                <div className="adm-panel-head">
                  <h3 className="adm-h3">Filter Utama</h3>
                  <span className="muted">WIB</span>
                </div>

                <div
                  className="adm-report-filters"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    gap: 12,
                  }}
                >
                  <div className="adm-field">
                    <label>Gerobak</label>
                    <select
                      className="input"
                      value={activeCartId}
                      onChange={(e) => setActiveCartId(e.target.value)}
                      disabled={loadingCarts}
                    >
                      {carts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.isActive === false ? "(INACTIVE)" : ""}
                        </option>
                      ))}
                      {!carts.length ? <option value="">(Belum ada gerobak)</option> : null}
                    </select>
                  </div>

                  <div className="adm-field">
                    <label>Dari Tanggal</label>
                    <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>

                  <div className="adm-field">
                    <label>Sampai Tanggal</label>
                    <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </div>

                  <div className="adm-field">
                    <label>Scope Stok</label>
                    <select className="input" value={stockScope} onChange={(e) => setStockScope(e.target.value)}>
                      <option value="CART">Gerobak</option>
                      <option value="CENTRAL">Central</option>
                    </select>
                  </div>
                </div>
              </section>

              {tab === "SALES" ? (
                !report ? (
                  <div className="muted" style={{ marginTop: 12 }}>Belum ada data laporan.</div>
                ) : (
                  <>
                    <section className="adm-report-stats" style={{ marginTop: 14 }}>
                      <div className="adm-panel adm-report-card">
                        <div className="muted">Gerobak</div>
                        <div className="adm-report-title"><b>{selectedCart?.name || report?.cart?.name || "-"}</b></div>
                        <div className="adm-report-meta">
                          <span className="adm-chip">RANGE</span>
                          <span className="adm-chip">{rangeLabel}</span>
                        </div>
                      </div>

                      <div className="adm-panel adm-report-card">
                        <div className="muted">Total</div>
                        <div className="adm-report-money"><b>{formatMoney(totals.total ?? 0)}</b></div>
                        <div className="adm-report-split">
                          <div>
                            <div className="muted">CASH</div>
                            <div><b>{formatMoney(totals.cash ?? 0)}</b></div>
                          </div>
                          <div>
                            <div className="muted">QRIS</div>
                            <div><b>{formatMoney(totals.qris ?? 0)}</b></div>
                          </div>
                        </div>
                      </div>

                      <div className="adm-panel adm-report-card">
                        <div className="muted">Jumlah Transaksi</div>
                        <div className="adm-report-money"><b>{totals.transactions ?? sales.length ?? 0}</b></div>
                        <div className="muted" style={{ marginTop: 8 }}>Top Produk</div>
                        {!topProducts.length ? (
                          <div className="muted" style={{ fontSize: 12 }}>Belum ada.</div>
                        ) : (
                          <ol className="adm-report-toplist">
                            {topProducts.slice(0, 10).map((p) => (
                              <li key={`${p.productId}_${p.portion}`}>
                                <span className="adm-report-topname">{p.productName}</span>
                                <span className="adm-badge">{p.portion}</span>
                                <span className="adm-report-topqty"><b>{p.qty}</b></span>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>

                      <div className="adm-panel adm-report-card">
                        <div className="muted">Total Porsi</div>
                        <div className="adm-report-money"><b>{portionTotals.total}</b></div>
                        <div className="adm-report-split">
                          <div>
                            <div className="muted">PORSI KECIL</div>
                            <div><b>{portionTotals.small}</b></div>
                          </div>
                          <div>
                            <div className="muted">PORSI BESAR</div>
                            <div><b>{portionTotals.large}</b></div>
                          </div>
                        </div>
                      </div>
                    </section>

                    <section className="adm-panel" style={{ marginTop: 14 }}>
                      <div className="adm-panel-head">
                        <div>
                          <h3 className="adm-h3">Summary Transaksi</h3>
                          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                            Tampilan admin dibuat ringkas. Detail penuh tetap tersedia di export CSV dan PDF.
                          </div>
                        </div>

                        <div className="adm-inline" style={{ gap: 10 }}>
                          <span className="muted" style={{ fontSize: 12 }}>
                            {sales.length ? `${visibleSales.length} / ${sales.length}` : "0"}
                          </span>
                          {sales.length > 20 ? (
                            <button
                              type="button"
                              className="btn secondary"
                              onClick={() => setShowAllSales((v) => !v)}
                            >
                              {showAllSales ? "Tampilkan 20" : "Tampilkan Semua"}
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {!sales.length ? (
                        <div className="muted">Belum ada transaksi di periode ini.</div>
                      ) : (
                        <div className="adm-report-table-wrap table-wrap--mobile">
                          <table className="adm-report-table table--mobile" style={{ width: "100%" }}>
                            <thead>
                              <tr>
                                <th>No</th>
                                <th>Transaksi</th>
                                <th>Waktu</th>
                                <th>Kasir</th>
                                <th>Metode</th>
                                <th>Ringkasan Item</th>
                                <th>Total Bayar</th>
                              </tr>
                            </thead>
                            <tbody>
                              {visibleSales.map((s, idx) => (
                                <tr key={s.id}>
                                  <td>{idx + 1}</td>
                                  <td>{shortTxnId(s.id)}</td>
                                  <td>{fmtDT(s.createdAt)}</td>
                                  <td>{s.cashier || "-"}</td>
                                  <td>{s.paymentMethod || "-"}</td>
                                  <td style={{ minWidth: 320, whiteSpace: "normal", lineHeight: 1.45 }}>
                                    {s.itemsFullSummary || s.itemsSummary || "-"}
                                  </td>
                                  <td style={{ fontWeight: 800, background: "#fffaf2" }}>
                                    {formatMoney(s.netTotal || 0)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </section>
                  </>
                )
              ) : null}

              {tab === "STOCK" ? (
                <>
                  <section className="adm-panel" style={{ marginTop: 14 }}>
                    <div className="adm-panel-head">
                      <h3 className="adm-h3">Filter Snapshot</h3>
                      <span className="muted">Current stock on hand</span>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                        gap: 12,
                        marginTop: 10,
                      }}
                    >
                      <div className="adm-field">
                        <label>Cari Item</label>
                        <input
                          className="input"
                          value={stockQ}
                          onChange={(e) => setStockQ(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") loadStockSnapshot();
                          }}
                          placeholder="nama / code / category"
                        />
                      </div>

                      <div className="adm-field">
                        <label>Status</label>
                        <select className="input" value={stockStatus} onChange={(e) => setStockStatus(e.target.value)}>
                          <option value="ALL">ALL</option>
                          <option value="OK">OK</option>
                          <option value="REORDER">REORDER</option>
                          <option value="LOW_STOCK">LOW_STOCK</option>
                          <option value="OUT_OF_STOCK">OUT_OF_STOCK</option>
                        </select>
                      </div>

                      <div className="adm-field" style={{ display: "flex", alignItems: "end" }}>
                        <button className="btn secondary" type="button" onClick={loadStockSnapshot} disabled={loadingStock}>
                          {loadingStock ? "Loading..." : "Terapkan Filter"}
                        </button>
                      </div>
                    </div>
                  </section>

                  <section className="adm-report-stats" style={{ marginTop: 14 }}>
                    <div className="adm-panel adm-report-card">
                      <div className="muted">Scope</div>
                      <div className="adm-report-title"><b>{stockScope === "CENTRAL" ? "Central" : selectedCart?.name || "-"}</b></div>
                      <div className="adm-report-meta">
                        <span className="adm-chip">ITEMS</span>
                        <span className="adm-chip">{stockSummary.totalItems}</span>
                      </div>
                    </div>

                    <div className="adm-panel adm-report-card">
                      <div className="muted">Qty Total</div>
                      <div className="adm-report-money"><b>{stockSummary.totalQty}</b></div>
                      <div className="adm-report-split">
                        <div><div className="muted">OK</div><div><b>{stockSummary.ok}</b></div></div>
                        <div><div className="muted">REORDER</div><div><b>{stockSummary.reorder}</b></div></div>
                      </div>
                    </div>

                    <div className="adm-panel adm-report-card">
                      <div className="muted">Critical Items</div>
                      <div className="adm-report-money"><b>{stockSummary.lowStock + stockSummary.outOfStock}</b></div>
                      <div className="adm-report-split">
                        <div><div className="muted">LOW</div><div><b>{stockSummary.lowStock}</b></div></div>
                        <div><div className="muted">OUT</div><div><b>{stockSummary.outOfStock}</b></div></div>
                      </div>
                    </div>
                  </section>

                  <section className="adm-panel" style={{ marginTop: 14 }}>
                    <div className="adm-panel-head">
                      <h3 className="adm-h3">Stock Snapshot</h3>
                      <span className="muted">{stockScope === "CENTRAL" ? "Central Kitchen" : selectedCart?.name || "-"}</span>
                    </div>

                    <div className="adm-report-table-wrap table-wrap--mobile">
                      <table className="adm-report-table table--mobile" style={{ width: "100%" }}>
                        <thead>
                          <tr>
                            <th>Code</th>
                            <th>Item</th>
                            <th>Category</th>
                            <th>Source</th>
                            <th>Qty</th>
                            <th>Unit</th>
                            <th>Min</th>
                            <th>Reorder</th>
                            <th>Par</th>
                            <th>Suggested</th>
                            <th>Status</th>
                            <th>Last Movement</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(stockRows || []).map((row) => {
                            const ing = row.ingredient || {};
                            return (
                              <tr key={`${row.ingredientId}-${row.scope}`}>
                                <td><b>{ing.code || "-"}</b></td>
                                <td>{ing.name || "-"}</td>
                                <td>{ing.category || "-"}</td>
                                <td>{ing.isGlobal ? "CENTRAL" : "CART"}</td>
                                <td><b>{Number(row.qty || 0)}</b></td>
                                <td>{ing.unit || "-"}</td>
                                <td>{Number(ing.minStock || 0)}</td>
                                <td>{Number(ing.reorderPoint || 0)}</td>
                                <td>{Number(ing.parStock || 0)}</td>
                                <td>{Number(row.suggestedOrderQty || 0)}</td>
                                <td><StatusBadge status={row.stockStatus} /></td>
                                <td>{fmtDT(row.lastMovementAt)}</td>
                              </tr>
                            );
                          })}
                          {!loadingStock && !stockRows.length ? (
                            <tr><td colSpan={12} className="muted">Belum ada data stock snapshot.</td></tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              ) : null}

              {tab === "LEDGER" ? (
                <>
                  <section className="adm-panel" style={{ marginTop: 14 }}>
                    <div className="adm-panel-head">
                      <h3 className="adm-h3">Filter Ledger</h3>
                      <span className="muted">Audit movement by date</span>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                        gap: 12,
                        marginTop: 10,
                      }}
                    >
                      <div className="adm-field">
                        <label>Cari Item</label>
                        <input
                          className="input"
                          value={ledgerQ}
                          onChange={(e) => setLedgerQ(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") loadStockLedger();
                          }}
                          placeholder="nama / code / category"
                        />
                      </div>

                      <div className="adm-field">
                        <label>Type</label>
                        <input
                          className="input"
                          value={ledgerType}
                          onChange={(e) => setLedgerType(e.target.value.toUpperCase())}
                          placeholder="SALE | ADJUSTMENT | TRANSFER"
                        />
                      </div>

                      <div className="adm-field">
                        <label>Reason</label>
                        <input
                          className="input"
                          value={ledgerReason}
                          onChange={(e) => setLedgerReason(e.target.value.toUpperCase())}
                          placeholder="SHIFT_OPENING | TRANSFER_OUT"
                        />
                      </div>

                      <div className="adm-field" style={{ display: "flex", alignItems: "end" }}>
                        <button className="btn secondary" type="button" onClick={loadStockLedger} disabled={loadingLedger}>
                          {loadingLedger ? "Loading..." : "Terapkan Filter"}
                        </button>
                      </div>
                    </div>
                  </section>

                  <section className="adm-report-stats" style={{ marginTop: 14 }}>
                    <div className="adm-panel adm-report-card">
                      <div className="muted">Range</div>
                      <div className="adm-report-title"><b>{formatRangeLabel(startDate, endDate)}</b></div>
                      <div className="adm-report-meta">
                        <span className="adm-chip">SCOPE</span>
                        <span className="adm-chip">{stockScope === "CENTRAL" ? "Central" : selectedCart?.name || "-"}</span>
                      </div>
                    </div>

                    <div className="adm-panel adm-report-card">
                      <div className="muted">Movements</div>
                      <div className="adm-report-money"><b>{Number(ledgerSummary.movements || 0)}</b></div>
                      <div className="adm-report-split">
                        <div><div className="muted">IN</div><div><b>{Number(ledgerSummary.totalIn || 0)}</b></div></div>
                        <div><div className="muted">OUT</div><div><b>{Number(ledgerSummary.totalOut || 0)}</b></div></div>
                      </div>
                    </div>

                    <div className="adm-panel adm-report-card">
                      <div className="muted">Net Movement</div>
                      <div className="adm-report-money"><b>{Number(ledgerSummary.net || 0)}</b></div>
                      <div className="muted" style={{ marginTop: 8 }}>
                        Last movement: {fmtDT(ledgerSummary.lastMovementAt)}
                      </div>
                    </div>
                  </section>

                  <section className="adm-panel" style={{ marginTop: 14 }}>
                    <div className="adm-panel-head">
                      <h3 className="adm-h3">Stock Ledger</h3>
                      <span className="muted">{stockScope === "CENTRAL" ? "Central Kitchen" : selectedCart?.name || "-"}</span>
                    </div>

                    <div className="adm-report-table-wrap table-wrap--mobile">
                      <table className="adm-report-table table--mobile" style={{ width: "100%" }}>
                        <thead>
                          <tr>
                            <th>Waktu</th>
                            <th>Code</th>
                            <th>Item</th>
                            <th>Category</th>
                            <th>Type</th>
                            <th>Reason</th>
                            <th>Delta</th>
                            <th>Balance</th>
                            <th>Note</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(ledgerRows || []).map((x) => (
                            <tr key={x.id}>
                              <td>{fmtDT(x.createdAt)}</td>
                              <td><b>{x.ingredient?.code || "-"}</b></td>
                              <td>{x.ingredient?.name || "-"}</td>
                              <td>{x.ingredient?.category || "-"}</td>
                              <td>{x.type || "-"}</td>
                              <td>{x.reason || "-"}</td>
                              <td>{Number(x.delta || 0)}</td>
                              <td>{Number(x.balanceAfter || 0)}</td>
                              <td>{x.note || "-"}</td>
                            </tr>
                          ))}
                          {!loadingLedger && !ledgerRows.length ? (
                            <tr><td colSpan={9} className="muted">Belum ada movement ledger pada filter ini.</td></tr>
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
    </div>
  );
}