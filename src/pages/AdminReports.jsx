import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../api";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

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

function rupiah(value) {
  const n = Number(value || 0);

  if (!Number.isFinite(n)) return "Rp 0";

  return `Rp ${n.toLocaleString("id-ID")}`;
}

function formatNumber(value) {
  const n = Number(value || 0);

  if (!Number.isFinite(n)) return "0";

  return n.toLocaleString("id-ID");
}

function shortTxnId(id) {
  return String(id || "-").slice(-8).toUpperCase();
}

function fmtDT(dt) {
  if (!dt) return "-";

  try {
    return new Date(dt).toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return String(dt);
  }
}

function csvCell(value) {
  const s = value == null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function downloadTextFile(filename, text, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}

async function downloadWithAuth(path, token, fallbackName) {
  const response = await fetch(API_BASE + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");

    try {
      const json = JSON.parse(text);
      throw new Error(json.error || `HTTP ${response.status}`);
    } catch {
      throw new Error(text || `HTTP ${response.status}`);
    }
  }

  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="([^"]+)"/i);
  const filename = match?.[1] || fallbackName;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}

function summarizeStocks(rows = []) {
  const output = {
    totalItems: 0,
    totalQty: 0,
    ok: 0,
    reorder: 0,
    lowStock: 0,
    outOfStock: 0,
  };

  for (const row of rows) {
    output.totalItems += 1;
    output.totalQty += Number(row?.qty || 0);

    const status = String(row?.stockStatus || "OK").toUpperCase();

    if (status === "OUT_OF_STOCK") output.outOfStock += 1;
    else if (status === "LOW_STOCK") output.lowStock += 1;
    else if (status === "REORDER") output.reorder += 1;
    else output.ok += 1;
  }

  return output;
}

function getStatusClass(status) {
  const s = String(status || "OK").toUpperCase();

  if (s === "OUT_OF_STOCK") return "badge--danger";
  if (s === "LOW_STOCK") return "badge--danger";
  if (s === "REORDER") return "pill--soft";

  return "badge--success";
}

function StatusBadge({ status }) {
  return (
    <span className={`adm-badge ${getStatusClass(status)}`}>
      {String(status || "OK").replaceAll("_", " ")}
    </span>
  );
}

function TabButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      className={`tab ${active ? "active" : ""}`}
      aria-selected={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
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

function EmptyBlock({ title = "Belum ada data.", desc = "Cek filter atau refresh data." }) {
  return (
    <div className="adm-list-item">
      <div className="adm-list-name">{title}</div>
      <div className="muted">{desc}</div>
    </div>
  );
}

export default function AdminReports() {
  const nav = useNavigate();
  const token = localStorage.getItem("admin_token") || localStorage.getItem("auth_token");
  const today = ymdWib();

  const didLoadRef = useRef(false);

  const [tab, setTab] = useState("SALES");

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

  const selectedCart = useMemo(() => {
    return carts.find((cart) => cart.id === activeCartId) || null;
  }, [carts, activeCartId]);

  const sales = useMemo(() => {
    return Array.isArray(report?.sales) ? report.sales : [];
  }, [report]);

  const totals = report?.totals || {};

  const topProducts = useMemo(() => {
    return Array.isArray(report?.topProducts) ? report.topProducts : [];
  }, [report]);

  const portionTotals = useMemo(() => {
    const raw = report?.portionTotals || {};

    return {
      small: Number(raw.small || 0),
      large: Number(raw.large || 0),
      total: Number(raw.total || 0),
    };
  }, [report]);

  const visibleSales = useMemo(() => {
    return showAllSales ? sales : sales.slice(0, 20);
  }, [sales, showAllSales]);

  const stockSummary = useMemo(() => summarizeStocks(stockRows), [stockRows]);

  const displayStartDate = report?.startDate || startDate;
  const displayEndDate = report?.endDate || endDate;
  const rangeLabel = formatRangeLabel(displayStartDate, displayEndDate);

  const scopeLabel =
    stockScope === "CENTRAL" ? "Central Kitchen" : selectedCart?.name || "Gerobak";

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
      const response = await apiGet("/api/admin/carts", token);
      const list = response.carts || [];

      setCarts(list);

      if (!activeCartId && list.length) {
        const firstActive = list.find((cart) => cart.isActive !== false) || list[0];
        setActiveCartId(firstActive.id);
      }
    } catch (error) {
      setErr(error?.message || "Gagal load gerobak.");
    } finally {
      setLoadingCarts(false);
    }
  }

  async function loadSalesReport(
    cartId = activeCartId,
    sd = startDate,
    ed = endDate
  ) {
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
      const query = buildRangeQuery(sd, ed);
      const response = await apiGet(`/api/reports/cart/${cartId}${query}`, token);

      setReport(response);
    } catch (error) {
      setErr(error?.message || "Gagal load report penjualan.");
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
      const query = new URLSearchParams();

      query.set("scope", stockScope);

      if (stockScope === "CART") query.set("cartId", activeCartId);
      if (stockQ.trim()) query.set("q", stockQ.trim());
      if (stockStatus !== "ALL") query.set("status", stockStatus);

      const response = await apiGet(
        `/api/admin/inventory/stocks?${query.toString()}`,
        token
      );

      setStockRows(response.items || []);
    } catch (error) {
      setErr(error?.message || "Gagal load stock snapshot.");
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
      const query = new URLSearchParams();

      query.set("scope", stockScope);

      if (stockScope === "CART") query.set("cartId", activeCartId);
      if (startDate) query.set("startDate", startDate);
      if (endDate) query.set("endDate", endDate);
      if (ledgerQ.trim()) query.set("q", ledgerQ.trim());
      if (ledgerType.trim()) query.set("type", ledgerType.trim());
      if (ledgerReason.trim()) query.set("reason", ledgerReason.trim());

      query.set("limit", "300");

      const response = await apiGet(
        `/api/admin/inventory/ledger?${query.toString()}`,
        token
      );

      setLedgerRows(response.items || []);

      setLedgerSummary(
        response.summary || {
          movements: 0,
          totalIn: 0,
          totalOut: 0,
          net: 0,
          lastMovementAt: null,
        }
      );
    } catch (error) {
      setErr(error?.message || "Gagal load stock ledger.");
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
    if (!token) return;
    if (didLoadRef.current) return;

    didLoadRef.current = true;
    loadCarts();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token || !activeCartId) return;

    if (tab === "SALES") {
      loadSalesReport(activeCartId, startDate, endDate);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, activeCartId, startDate, endDate, tab]);

  useEffect(() => {
    if (!token) return;

    if (tab === "STOCK") {
      loadStockSnapshot();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tab, activeCartId, stockScope, stockStatus]);

  useEffect(() => {
    if (!token) return;

    if (tab === "LEDGER") {
      loadStockLedger();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tab, activeCartId, stockScope, startDate, endDate]);

  function handleTodayRange() {
    const now = ymdWib();

    setStartDate(now);
    setEndDate(now);
  }

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
      const query = buildRangeQuery(startDate, endDate);
      const fallback = `report_${activeCartId}_${startDate}_sd_${endDate}.csv`;

      await downloadWithAuth(
        `/api/reports/cart/${activeCartId}/export.csv${query}`,
        token,
        fallback
      );

      setMsg("Export CSV penjualan dimulai.");
    } catch (error) {
      setErr(error?.message || "Gagal export CSV penjualan.");
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
      const query = buildRangeQuery(startDate, endDate);
      const fallback = `report_${activeCartId}_${startDate}_sd_${endDate}.pdf`;

      await downloadWithAuth(
        `/api/reports/cart/${activeCartId}/export.pdf${query}`,
        token,
        fallback
      );

      setMsg("Export PDF penjualan dimulai.");
    } catch (error) {
      setErr(error?.message || "Gagal export PDF penjualan.");
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
        const ingredient = row.ingredient || {};

        lines.push(
          [
            stockScope,
            stockScope === "CENTRAL" ? "Central" : selectedCart?.name || "",
            ingredient.code || "",
            ingredient.name || "",
            ingredient.category || "",
            ingredient.isGlobal ? "CENTRAL" : "CART",
            ingredient.unit || "",
            Number(row.qty || 0),
            Number(ingredient.minStock || 0),
            Number(ingredient.reorderPoint || 0),
            Number(ingredient.parStock || 0),
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

      downloadTextFile(
        `inventory_snapshot_current_${stamp}.csv`,
        "\uFEFF" + lines.join("\n")
      );

      setMsg("Export CSV stock snapshot dari tampilan berhasil.");
    } catch (error) {
      setErr(error?.message || "Gagal export current stock snapshot.");
    }
  }

  async function exportSnapshotCsvServer() {
    try {
      const query = new URLSearchParams();

      query.set("scope", stockScope);

      if (stockScope === "CART") query.set("cartId", activeCartId);
      if (stockQ.trim()) query.set("q", stockQ.trim());
      if (stockStatus !== "ALL") query.set("status", stockStatus);

      await downloadWithAuth(
        `/api/admin/inventory/export.csv?${query.toString()}`,
        token,
        `inventory_snapshot_${Date.now()}.csv`
      );

      setMsg("Export CSV stock snapshot server dimulai.");
    } catch (error) {
      setErr(error?.message || "Gagal export stock snapshot CSV.");
    }
  }

  async function exportLedgerCsvServer() {
    const rangeErr = validateRange();

    if (rangeErr) {
      setErr(rangeErr);
      return;
    }

    try {
      const query = new URLSearchParams();

      query.set("scope", stockScope);

      if (stockScope === "CART") query.set("cartId", activeCartId);
      if (startDate) query.set("startDate", startDate);
      if (endDate) query.set("endDate", endDate);
      if (ledgerQ.trim()) query.set("q", ledgerQ.trim());
      if (ledgerType.trim()) query.set("type", ledgerType.trim());
      if (ledgerReason.trim()) query.set("reason", ledgerReason.trim());

      await downloadWithAuth(
        `/api/admin/inventory/ledger/export.csv?${query.toString()}`,
        token,
        `inventory_ledger_${Date.now()}.csv`
      );

      setMsg("Export CSV stock ledger dimulai.");
    } catch (error) {
      setErr(error?.message || "Gagal export stock ledger CSV.");
    }
  }

  return (
    <main className="adm-bg adm adm-reports">
      <div className="adm-shell">
        <section className="adm-main-card">
          <div className="adm-header">
            <div>
              <h2 className="adm-h2">Laporan</h2>

              <div className="adm-subline">
                <span>Audit penjualan, snapshot stok, dan pergerakan ledger.</span>
              </div>
            </div>

            <div className="adm-actions">
              <button className="btn secondary" type="button" onClick={handleTodayRange}>
                Hari Ini
              </button>

              <button
                className="btn secondary"
                type="button"
                onClick={() => nav("/admin/dashboard")}
              >
                Dashboard
              </button>

              {tab === "SALES" ? (
                <>
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => loadSalesReport(activeCartId, startDate, endDate)}
                    disabled={!activeCartId || loadingReport}
                  >
                    {loadingReport ? "Loading..." : "Refresh"}
                  </button>

                  <button
                    className="btn secondary"
                    type="button"
                    onClick={exportSalesCsv}
                    disabled={!activeCartId}
                  >
                    Export CSV
                  </button>

                  <button
                    className="btn"
                    type="button"
                    onClick={exportSalesPdf}
                    disabled={!activeCartId}
                  >
                    Export PDF
                  </button>
                </>
              ) : null}

              {tab === "STOCK" ? (
                <>
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={loadStockSnapshot}
                    disabled={loadingStock}
                  >
                    {loadingStock ? "Loading..." : "Refresh"}
                  </button>

                  <button
                    className="btn secondary"
                    type="button"
                    onClick={exportSnapshotCsvCurrent}
                    disabled={!stockRows.length}
                  >
                    Export Tampilan
                  </button>

                  <button
                    className="btn"
                    type="button"
                    onClick={exportSnapshotCsvServer}
                  >
                    Export Server
                  </button>
                </>
              ) : null}

              {tab === "LEDGER" ? (
                <>
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={loadStockLedger}
                    disabled={loadingLedger}
                  >
                    {loadingLedger ? "Loading..." : "Refresh"}
                  </button>

                  <button
                    className="btn"
                    type="button"
                    onClick={exportLedgerCsvServer}
                  >
                    Export Ledger
                  </button>
                </>
              ) : null}
            </div>
          </div>

          <div className="hr" />

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

          <div className="tabs" role="tablist" aria-label="Tab laporan">
            <TabButton active={tab === "SALES"} onClick={() => setTab("SALES")}>
              Sales Report
            </TabButton>

            <TabButton active={tab === "STOCK"} onClick={() => setTab("STOCK")}>
              Stock Snapshot
            </TabButton>

            <TabButton active={tab === "LEDGER"} onClick={() => setTab("LEDGER")}>
              Stock Ledger
            </TabButton>
          </div>

          <section className="adm-panel" style={{ marginTop: 14 }}>
            <div className="adm-panel-head">
              <div>
                <h3 className="adm-h3">Filter Utama</h3>
                <div className="card-subtitle">Tanggal memakai zona WIB.</div>
              </div>

              {loadingCarts ? (
                <span className="loading-inline muted">
                  <span className="spinner spinner--sm" aria-hidden="true" />
                  Memuat gerobak
                </span>
              ) : null}
            </div>

            <div className="adm-form-grid" style={{ marginTop: 12 }}>
              <div className="adm-field">
                <label htmlFor="report-cart">Gerobak</label>

                <select
                  id="report-cart"
                  className="input"
                  value={activeCartId}
                  onChange={(event) => setActiveCartId(event.target.value)}
                  disabled={loadingCarts}
                >
                  {carts.map((cart) => (
                    <option key={cart.id} value={cart.id}>
                      {cart.name} {cart.isActive === false ? "(INACTIVE)" : ""}
                    </option>
                  ))}

                  {!carts.length ? <option value="">Belum ada gerobak</option> : null}
                </select>
              </div>

              <div className="adm-field">
                <label htmlFor="report-start">Dari Tanggal</label>

                <input
                  id="report-start"
                  className="input"
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </div>

              <div className="adm-field">
                <label htmlFor="report-end">Sampai Tanggal</label>

                <input
                  id="report-end"
                  className="input"
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </div>

              <div className="adm-field">
                <label htmlFor="report-scope">Scope Stok</label>

                <select
                  id="report-scope"
                  className="input"
                  value={stockScope}
                  onChange={(event) => setStockScope(event.target.value)}
                >
                  <option value="CART">Gerobak</option>
                  <option value="CENTRAL">Central</option>
                </select>
              </div>
            </div>
          </section>

          {tab === "SALES" ? (
            <>
              <div className="adm-panels">
                <StatCard
                  label="Gerobak"
                  value={selectedCart?.name || report?.cart?.name || "-"}
                  note={rangeLabel}
                />

                <StatCard
                  label="Total Penjualan"
                  value={rupiah(totals.total || 0)}
                  note={`Cash ${rupiah(totals.cash || 0)} • QRIS ${rupiah(totals.qris || 0)}`}
                />

                <StatCard
                  label="Transaksi"
                  value={formatNumber(totals.transactions ?? sales.length ?? 0)}
                  note="Jumlah transaksi pada periode aktif."
                />

                <StatCard
                  label="Total Porsi"
                  value={formatNumber(portionTotals.total)}
                  note={`Reguler ${portionTotals.small} • Jumbo ${portionTotals.large}`}
                />
              </div>

              <div className="adm-panels" style={{ marginTop: 14 }}>
                <section className="adm-panel">
                  <div className="adm-panel-head">
                    <div>
                      <h3 className="adm-h3">Top Produk</h3>
                      <div className="card-subtitle">Maksimal 10 produk teratas.</div>
                    </div>
                  </div>

                  <div className="adm-list" style={{ marginTop: 14 }}>
                    {topProducts.slice(0, 10).map((product, index) => (
                      <div
                        key={`${product.productId || product.productName}-${product.portion || index}`}
                        className="adm-list-item"
                      >
                        <div className="adm-list-top" style={{ alignItems: "center" }}>
                          <div>
                            <div className="adm-list-title">
                              {index + 1}. {product.productName || product.name || "-"}
                            </div>

                            <div className="adm-list-meta" style={{ marginTop: 6 }}>
                              Portion: {product.portion || "-"}
                            </div>
                          </div>

                          <div className="adm-list-badges">
                            <span className="adm-badge">{formatNumber(product.qty || 0)} pcs</span>
                          </div>
                        </div>
                      </div>
                    ))}

                    {!topProducts.length ? (
                      <EmptyBlock
                        title="Belum ada top produk."
                        desc="Data akan muncul setelah ada transaksi."
                      />
                    ) : null}
                  </div>
                </section>

                <section className="adm-panel">
                  <div className="adm-panel-head">
                    <div>
                      <h3 className="adm-h3">Ringkasan Pembayaran</h3>
                      <div className="card-subtitle">Pemisahan cash dan QRIS.</div>
                    </div>
                  </div>

                  <div className="adm-form-grid" style={{ marginTop: 14 }}>
                    <div className="adm-check-item">
                      <div className="adm-kpi-label">Cash</div>
                      <div className="adm-list-title">{rupiah(totals.cash || 0)}</div>
                    </div>

                    <div className="adm-check-item">
                      <div className="adm-kpi-label">QRIS</div>
                      <div className="adm-list-title">{rupiah(totals.qris || 0)}</div>
                    </div>

                    <div className="adm-check-item">
                      <div className="adm-kpi-label">Total</div>
                      <div className="adm-list-title">{rupiah(totals.total || 0)}</div>
                    </div>
                  </div>
                </section>
              </div>

              <section className="adm-panel" style={{ marginTop: 14 }}>
                <div className="adm-panel-head">
                  <div>
                    <h3 className="adm-h3">Summary Transaksi</h3>
                    <div className="card-subtitle">
                      Detail penuh tetap tersedia di export CSV dan PDF.
                    </div>
                  </div>

                  <div className="adm-actions">
                    <span className="badge">
                      {sales.length ? `${visibleSales.length} / ${sales.length}` : "0"}
                    </span>

                    {sales.length > 20 ? (
                      <button
                        type="button"
                        className="btn secondary btn--sm"
                        onClick={() => setShowAllSales((value) => !value)}
                      >
                        {showAllSales ? "Tampilkan 20" : "Tampilkan Semua"}
                      </button>
                    ) : null}
                  </div>
                </div>

                {!report && loadingReport ? (
                  <div className="adm-alert" style={{ marginTop: 12 }}>
                    <span className="loading-inline">
                      <span className="spinner spinner--sm" aria-hidden="true" />
                      Memuat laporan penjualan...
                    </span>
                  </div>
                ) : null}

                {!loadingReport && !sales.length ? (
                  <div className="adm-list" style={{ marginTop: 14 }}>
                    <EmptyBlock
                      title="Belum ada transaksi."
                      desc="Tidak ada transaksi pada periode dan gerobak ini."
                    />
                  </div>
                ) : null}

                {sales.length ? (
                  <div className="adm-table-wrap" style={{ marginTop: 14 }}>
                    <table className="table adm-table table--mobile">
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
                        {visibleSales.map((sale, index) => (
                          <tr key={sale.id}>
                            <td data-label="No">{index + 1}</td>

                            <td data-label="Transaksi">
                              <b>{shortTxnId(sale.id)}</b>
                            </td>

                            <td data-label="Waktu">{fmtDT(sale.createdAt)}</td>

                            <td data-label="Kasir">{sale.cashier || "-"}</td>

                            <td data-label="Metode">
                              <span className="adm-badge">
                                {sale.paymentMethod || "-"}
                              </span>
                            </td>

                            <td data-label="Ringkasan Item" style={{ whiteSpace: "normal" }}>
                              {sale.itemsFullSummary || sale.itemsSummary || "-"}
                            </td>

                            <td data-label="Total Bayar">
                              <b>{rupiah(sale.netTotal || 0)}</b>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </section>
            </>
          ) : null}

          {tab === "STOCK" ? (
            <>
              <section className="adm-panel" style={{ marginTop: 14 }}>
                <div className="adm-panel-head">
                  <div>
                    <h3 className="adm-h3">Filter Snapshot</h3>
                    <div className="card-subtitle">Current stock on hand.</div>
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
                    <label htmlFor="stock-q">Cari Item</label>

                    <input
                      id="stock-q"
                      className="input"
                      value={stockQ}
                      onChange={(event) => setStockQ(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") loadStockSnapshot();
                      }}
                      placeholder="Nama / code / category"
                    />
                  </div>

                  <div className="adm-field">
                    <label htmlFor="stock-status">Status</label>

                    <select
                      id="stock-status"
                      className="input"
                      value={stockStatus}
                      onChange={(event) => setStockStatus(event.target.value)}
                    >
                      <option value="ALL">Semua</option>
                      <option value="OK">OK</option>
                      <option value="REORDER">REORDER</option>
                      <option value="LOW_STOCK">LOW STOCK</option>
                      <option value="OUT_OF_STOCK">OUT OF STOCK</option>
                    </select>
                  </div>

                  <div className="adm-field">
                    <label>&nbsp;</label>

                    <button
                      className="btn"
                      type="button"
                      onClick={loadStockSnapshot}
                      disabled={loadingStock}
                    >
                      Terapkan Filter
                    </button>
                  </div>
                </div>
              </section>

              <div className="adm-panels">
                <StatCard
                  label="Scope"
                  value={scopeLabel}
                  note={`${formatNumber(stockSummary.totalItems)} item tampil`}
                />

                <StatCard
                  label="Qty Total"
                  value={formatNumber(stockSummary.totalQty)}
                  note={`OK ${stockSummary.ok} • Reorder ${stockSummary.reorder}`}
                />

                <StatCard
                  label="Critical"
                  value={formatNumber(stockSummary.lowStock + stockSummary.outOfStock)}
                  note={`Low ${stockSummary.lowStock} • Out ${stockSummary.outOfStock}`}
                />

                <StatCard
                  label="Status"
                  value={loadingStock ? "Loading" : "Ready"}
                  note="Snapshot stok saat ini."
                />
              </div>

              <section className="adm-panel" style={{ marginTop: 14 }}>
                <div className="adm-panel-head">
                  <div>
                    <h3 className="adm-h3">Stock Snapshot</h3>
                    <div className="card-subtitle">{scopeLabel}</div>
                  </div>

                  <span className="badge">{stockRows.length} item</span>
                </div>

                <div className="adm-table-wrap" style={{ marginTop: 14 }}>
                  <table className="table adm-table table--mobile">
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
                        const ingredient = row.ingredient || {};

                        return (
                          <tr key={`${row.ingredientId}-${row.scope || stockScope}`}>
                            <td data-label="Code">
                              <b>{ingredient.code || "-"}</b>
                            </td>

                            <td data-label="Item">{ingredient.name || "-"}</td>

                            <td data-label="Category">{ingredient.category || "-"}</td>

                            <td data-label="Source">
                              <span className="adm-badge">
                                {ingredient.isGlobal ? "CENTRAL" : "CART"}
                              </span>
                            </td>

                            <td data-label="Qty">
                              <b>{formatNumber(row.qty || 0)}</b>
                            </td>

                            <td data-label="Unit">{ingredient.unit || "-"}</td>

                            <td data-label="Min">{formatNumber(ingredient.minStock || 0)}</td>

                            <td data-label="Reorder">
                              {formatNumber(ingredient.reorderPoint || 0)}
                            </td>

                            <td data-label="Par">{formatNumber(ingredient.parStock || 0)}</td>

                            <td data-label="Suggested">
                              {formatNumber(row.suggestedOrderQty || 0)}
                            </td>

                            <td data-label="Status">
                              <StatusBadge status={row.stockStatus} />
                            </td>

                            <td data-label="Last Movement">{fmtDT(row.lastMovementAt)}</td>
                          </tr>
                        );
                      })}

                      {!loadingStock && !stockRows.length ? (
                        <tr>
                          <td colSpan={12} className="muted">
                            Belum ada data stock snapshot.
                          </td>
                        </tr>
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
                  <div>
                    <h3 className="adm-h3">Filter Ledger</h3>
                    <div className="card-subtitle">Audit movement berdasarkan tanggal.</div>
                  </div>

                  {loadingLedger ? (
                    <span className="loading-inline muted">
                      <span className="spinner spinner--sm" aria-hidden="true" />
                      Memuat ledger
                    </span>
                  ) : null}
                </div>

                <div className="adm-form-grid" style={{ marginTop: 12 }}>
                  <div className="adm-field">
                    <label htmlFor="ledger-q">Cari Item</label>

                    <input
                      id="ledger-q"
                      className="input"
                      value={ledgerQ}
                      onChange={(event) => setLedgerQ(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") loadStockLedger();
                      }}
                      placeholder="Nama / code / category"
                    />
                  </div>

                  <div className="adm-field">
                    <label htmlFor="ledger-type">Type</label>

                    <input
                      id="ledger-type"
                      className="input"
                      value={ledgerType}
                      onChange={(event) => setLedgerType(event.target.value.toUpperCase())}
                      placeholder="SALE / ADJUSTMENT / TRANSFER"
                    />
                  </div>

                  <div className="adm-field">
                    <label htmlFor="ledger-reason">Reason</label>

                    <input
                      id="ledger-reason"
                      className="input"
                      value={ledgerReason}
                      onChange={(event) =>
                        setLedgerReason(event.target.value.toUpperCase())
                      }
                      placeholder="SHIFT_OPENING / TRANSFER_OUT"
                    />
                  </div>

                  <div className="adm-field">
                    <label>&nbsp;</label>

                    <button
                      className="btn"
                      type="button"
                      onClick={loadStockLedger}
                      disabled={loadingLedger}
                    >
                      Terapkan Filter
                    </button>
                  </div>
                </div>
              </section>

              <div className="adm-panels">
                <StatCard
                  label="Range"
                  value={formatRangeLabel(startDate, endDate)}
                  note={scopeLabel}
                />

                <StatCard
                  label="Movements"
                  value={formatNumber(ledgerSummary.movements || 0)}
                  note={`In ${ledgerSummary.totalIn || 0} • Out ${ledgerSummary.totalOut || 0}`}
                />

                <StatCard
                  label="Net Movement"
                  value={formatNumber(ledgerSummary.net || 0)}
                  note={`Last: ${fmtDT(ledgerSummary.lastMovementAt)}`}
                />

                <StatCard
                  label="Rows"
                  value={formatNumber(ledgerRows.length)}
                  note="Maksimal 300 movement."
                />
              </div>

              <section className="adm-panel" style={{ marginTop: 14 }}>
                <div className="adm-panel-head">
                  <div>
                    <h3 className="adm-h3">Stock Ledger</h3>
                    <div className="card-subtitle">{scopeLabel}</div>
                  </div>

                  <span className="badge">{ledgerRows.length} rows</span>
                </div>

                <div className="adm-table-wrap" style={{ marginTop: 14 }}>
                  <table className="table adm-table table--mobile">
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
                      {(ledgerRows || []).map((row) => (
                        <tr key={row.id}>
                          <td data-label="Waktu">{fmtDT(row.createdAt)}</td>

                          <td data-label="Code">
                            <b>{row.ingredient?.code || "-"}</b>
                          </td>

                          <td data-label="Item">{row.ingredient?.name || "-"}</td>

                          <td data-label="Category">{row.ingredient?.category || "-"}</td>

                          <td data-label="Type">
                            <span className="adm-badge">{row.type || "-"}</span>
                          </td>

                          <td data-label="Reason">{row.reason || "-"}</td>

                          <td data-label="Delta">
                            <b>{formatNumber(row.delta || 0)}</b>
                          </td>

                          <td data-label="Balance">
                            {formatNumber(row.balanceAfter || 0)}
                          </td>

                          <td data-label="Note" style={{ whiteSpace: "normal" }}>
                            {row.note || "-"}
                          </td>
                        </tr>
                      ))}

                      {!loadingLedger && !ledgerRows.length ? (
                        <tr>
                          <td colSpan={9} className="muted">
                            Belum ada movement ledger pada filter ini.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}