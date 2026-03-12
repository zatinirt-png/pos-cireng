import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../api";

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
  const token =
    localStorage.getItem("admin_token") || localStorage.getItem("auth_token");

  const today = ymdWib();
  const thSticky = {
    padding: "12px 10px",
    background: "#f6f7fb",
    borderBottom: "1px solid rgba(20,20,20,0.08)",
    textAlign: "left",
    whiteSpace: "nowrap",
    position: "sticky",
    top: 0,
    zIndex: 1,
  };

  const thGroup = {
    padding: "12px 10px",
    background: "#f6f7fb",
    borderBottom: "1px solid rgba(20,20,20,0.08)",
    textAlign: "center",
    minWidth: 120,
    position: "sticky",
    top: 0,
    zIndex: 1,
  };

  const thSub = {
    padding: "10px 8px",
    background: "#fafbff",
    borderBottom: "1px solid rgba(20,20,20,0.08)",
    textAlign: "right",
    whiteSpace: "nowrap",
    position: "sticky",
    top: 44,
    zIndex: 1,
  };

  const tdBase = {
    padding: "10px 10px",
    borderBottom: "1px solid rgba(20,20,20,0.06)",
    verticalAlign: "top",
    background: "#fff",
  };

  const tdText = { ...tdBase, whiteSpace: "nowrap" };
  const tdCenter = { ...tdBase, textAlign: "center", whiteSpace: "nowrap" };
  const tdNum = { ...tdBase, textAlign: "right", whiteSpace: "nowrap" };
  const tdNumStrong = {
    ...tdNum,
    fontWeight: 800,
    background: "#fffaf2",
  };


  const [carts, setCarts] = useState([]);
  const [activeCartId, setActiveCartId] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [report, setReport] = useState(null);

  const [loadingCarts, setLoadingCarts] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [showAllSales, setShowAllSales] = useState(false);

  useEffect(() => {
    if (!token) nav("/admin");
  }, [token, nav]);

  function validateRange(sd = startDate, ed = endDate) {
    if (!sd || !ed) {
      return "Tanggal awal dan tanggal akhir wajib diisi.";
    }
    if (sd > ed) {
      return "Tanggal awal tidak boleh lebih besar dari tanggal akhir.";
    }
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

  async function loadReport(cartId = activeCartId, sd = startDate, ed = endDate) {
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

  useEffect(() => {
    if (token) loadCarts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (token && activeCartId) {
      loadReport(activeCartId, startDate, endDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, activeCartId, startDate, endDate]);

  const selectedCart = useMemo(
    () => carts.find((c) => c.id === activeCartId),
    [carts, activeCartId]
  );

  const totals = report?.totals || {};
  const sales = report?.sales || [];
  const topProducts = report?.topProducts || [];
  //const matrixColumns = report?.matrixColumns || []; // detail matrix tetap dipakai untuk export backend, tapi di UI admin tidak ditampilkan

  const visibleSales = showAllSales ? sales : sales.slice(0, 20);

  const displayStartDate = report?.startDate || startDate;
  const displayEndDate = report?.endDate || endDate;
  const rangeLabel = formatRangeLabel(displayStartDate, displayEndDate);

  async function exportCsv() {
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
      await downloadWithAuth(
        `/api/reports/cart/${activeCartId}/export.csv${qs}`,
        token,
        fallback
      );
      setMsg("Export CSV dimulai.");
    } catch (e) {
      setErr(e?.message || "Gagal export CSV");
    }
  }

  async function exportPdf() {
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
      await downloadWithAuth(
        `/api/reports/cart/${activeCartId}/export.pdf${qs}`,
        token,
        fallback
      );
      setMsg("Export PDF dimulai.");
    } catch (e) {
      setErr(e?.message || "Gagal export PDF");
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
              <div className="adm-nav-sub">Laporan</div>

              <div className="adm-nav-list">
                <button
                  className="adm-nav-item"
                  type="button"
                  onClick={() => nav("/admin/dashboard")}
                >
                  Live Report
                </button>
                <button
                  className="adm-nav-item"
                  type="button"
                  onClick={() => nav("/admin/products")}
                >
                  Menu
                </button>
                <button
                  className="adm-nav-item"
                  type="button"
                  onClick={() => nav("/admin/promos")}
                >
                  Promo
                </button>
                <button
                  className="adm-nav-item"
                  type="button"
                  onClick={() => nav("/admin/users")}
                >
                  User Management
                </button>
                <button
                  className="adm-nav-item"
                  type="button"
                  onClick={() => nav("/admin/carts")}
                >
                  Kelola Gerobak
                </button>
                <button
                  className="adm-nav-item active"
                  type="button"
                  onClick={() => nav("/admin/reports")}
                >
                  Laporan
                </button>
                <button
                  className="adm-nav-item"
                  type="button"
                  onClick={() => nav("/admin/inventory")}
                >
                  Stok
                </button>
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
                      Pilih gerobak → tentukan rentang tanggal → export PDF/CSV.
                    </span>
                  </div>
                </div>

                <div className="adm-actions" style={{ flexWrap: "wrap", gap: 12 }}>
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={handleTodayRange}
                    disabled={loadingReport}
                  >
                    Hari Ini
                  </button>
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => loadReport(activeCartId, startDate, endDate)}
                    disabled={!activeCartId || loadingReport}
                  >
                    {loadingReport ? "Loading..." : "Refresh"}
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={exportCsv}
                    disabled={!activeCartId}
                  >
                    Export CSV
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={exportPdf}
                    disabled={!activeCartId}
                  >
                    Export PDF
                  </button>
                </div>
              </div>

              {err ? (
                <div
                  className="adm-alert"
                  role="alert"
                  aria-live="polite"
                  style={{ marginTop: 12 }}
                >
                  {err}
                </div>
              ) : null}

              {msg ? (
                <div
                  className="adm-alert adm-alert--ok"
                  role="status"
                  aria-live="polite"
                  style={{ marginTop: 12 }}
                >
                  {msg}
                </div>
              ) : null}

              <section className="adm-panel" style={{ marginTop: 14 }}>
                <div className="adm-panel-head">
                  <h3 className="adm-h3">Filter</h3>
                  <span className="muted">WIB</span>
                </div>

                <div className="adm-report-filters">
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
                      {!carts.length ? (
                        <option value="">(Belum ada gerobak)</option>
                      ) : null}
                    </select>
                    {loadingCarts ? (
                      <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                        Loading carts...
                      </div>
                    ) : null}
                  </div>

                  <div className="adm-field">
                    <label>Dari Tanggal</label>
                    <input
                      className="input"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>

                  <div className="adm-field">
                    <label>Sampai Tanggal</label>
                    <input
                      className="input"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>
              </section>

              {!report ? (
                <div className="muted" style={{ marginTop: 12 }}>
                  Belum ada data laporan.
                </div>
              ) : (
                <>
                  <section className="adm-report-stats" style={{ marginTop: 14 }}>
                    <div className="adm-panel adm-report-card">
                      <div className="muted">Gerobak</div>
                      <div className="adm-report-title">
                        <b>{selectedCart?.name || report?.cart?.name || "-"}</b>
                      </div>
                      <div className="adm-report-meta">
                        <span className="adm-chip">RANGE</span>
                        <span className="adm-chip">{rangeLabel}</span>
                      </div>
                    </div>

                    <div className="adm-panel adm-report-card">
                      <div className="muted">Total</div>
                      <div className="adm-report-money">
                        <b>{formatMoney(totals.total ?? 0)}</b>
                      </div>
                      <div className="adm-report-split">
                        <div>
                          <div className="muted">CASH</div>
                          <div>
                            <b>{formatMoney(totals.cash ?? 0)}</b>
                          </div>
                        </div>
                        <div>
                          <div className="muted">QRIS</div>
                          <div>
                            <b>{formatMoney(totals.qris ?? 0)}</b>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="adm-panel adm-report-card">
                      <div className="muted">Jumlah Transaksi</div>
                      <div className="adm-report-money">
                        <b>{totals.transactions ?? sales.length ?? 0}</b>
                      </div>
                      <div className="muted" style={{ marginTop: 8 }}>
                        Top Produk
                      </div>
                      {!topProducts.length ? (
                        <div className="muted" style={{ fontSize: 12 }}>
                          Belum ada.
                        </div>
                      ) : (
                        <ol className="adm-report-toplist">
                          {topProducts.slice(0, 10).map((p) => (
                            <li key={`${p.productId}_${p.portion}`}>
                              <span className="adm-report-topname">{p.productName}</span>
                              <span className="adm-badge">{p.portion}</span>
                              <span className="adm-report-topqty">
                                <b>{p.qty}</b>
                              </span>
                            </li>
                          ))}
                        </ol>
                      )}
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
                      <div
                        style={{
                          overflowX: "auto",
                          border: "1px solid rgba(20,20,20,0.08)",
                          borderRadius: 16,
                          background: "#fff",
                        }}
                      >
                        <table
                          style={{
                            width: "100%",
                            minWidth: 980,
                            borderCollapse: "separate",
                            borderSpacing: 0,
                            fontSize: 13,
                          }}
                        >
                          <thead>
                            <tr>
                              <th style={thSticky}>No</th>
                              <th style={thSticky}>Transaksi</th>
                              <th style={thSticky}>Waktu</th>
                              <th style={thSticky}>Kasir</th>
                              <th style={thSticky}>Metode</th>
                              <th style={thSticky}>Ringkasan Item</th>
                              <th style={thSticky}>Total Bayar</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleSales.map((s, idx) => (
                              <tr key={s.id}>
                                <td style={tdCenter}>{idx + 1}</td>
                                <td style={tdText}>{shortTxnId(s.id)}</td>
                                <td style={tdText}>
                                  {new Date(s.createdAt).toLocaleString("id-ID", {
                                    timeZone: "Asia/Jakarta",
                                  })}
                                </td>
                                <td style={tdText}>{s.cashier || "-"}</td>
                                <td style={tdText}>{s.paymentMethod || "-"}</td>
                                <td
                                  style={{
                                    ...tdBase,
                                    minWidth: 320,
                                    whiteSpace: "normal",
                                    lineHeight: 1.45,
                                  }}
                                >
                                  {s.itemsFullSummary || s.itemsSummary || "-"}
                                </td>
                                <td
                                  style={{
                                    ...tdNum,
                                    fontWeight: 800,
                                    background: "#fffaf2",
                                  }}
                                >
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
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}