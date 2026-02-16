import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../api";

function ymdWib(d = new Date()) {
  // bikin YYYY-MM-DD WIB stabil
  const offsetMs = 7 * 60 * 60 * 1000;
  const w = new Date(d.getTime() + offsetMs);
  const y = w.getUTCFullYear();
  const m = String(w.getUTCMonth() + 1).padStart(2, "0");
  const day = String(w.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

  const [carts, setCarts] = useState([]);
  const [period, setPeriod] = useState("day"); // day | week
  const [date, setDate] = useState(ymdWib());
  const [activeCartId, setActiveCartId] = useState("");
  const [report, setReport] = useState(null);

  const [loadingCarts, setLoadingCarts] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [showAllSales, setShowAllSales] = useState(false);

  useEffect(() => {
    if (!token) nav("/admin");
  }, [token, nav]);

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

  async function loadReport(cartId = activeCartId) {
    if (!cartId) return;
    setErr("");
    setMsg("");
    setLoadingReport(true);
    try {
      const qs = `?period=${encodeURIComponent(period)}&date=${encodeURIComponent(
        date
      )}`;
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
    // auto refresh report ketika period/date/cart berubah
    if (token && activeCartId) loadReport(activeCartId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, activeCartId, period, date]);

  const selectedCart = useMemo(
    () => carts.find((c) => c.id === activeCartId),
    [carts, activeCartId]
  );

  const totals = report?.totals || report?.totalAll || {};
  const sales = report?.sales || [];
  const topProducts = report?.topProducts || [];
  const periodLabel = period === "week" ? "MINGGU" : "HARI";

  const visibleSales = showAllSales ? sales : sales.slice(0, 20);

  async function exportCsv() {
    if (!activeCartId) return;
    setErr("");
    setMsg("");
    try {
      const qs = `?period=${encodeURIComponent(period)}&date=${encodeURIComponent(
        date
      )}`;
      const fallback = `report_${activeCartId}_${period}_${date}.csv`;
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
    setErr("");
    setMsg("");
    try {
      const qs = `?period=${encodeURIComponent(period)}&date=${encodeURIComponent(
        date
      )}`;
      const fallback = `report_${activeCartId}_${period}_${date}.pdf`;
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

  return (
    <div className="adm-bg adm adm-reports">
      <div className="adm-shell">
        <div className="adm-layout">
          {/* SIDEBAR */}
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

          {/* MAIN */}
          <main className="adm-main">
            <div className="adm-main-card">
              <div className="adm-header">
                <div>
                  <h2 className="adm-h2">Laporan</h2>
                  <div className="adm-subline">
                    <span className="muted">
                      Pilih gerobak → laporan harian/mingguan → export PDF/CSV.
                    </span>
                  </div>
                </div>

                <div className="adm-actions">
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => loadReport(activeCartId)}
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

              {/* FILTERS */}
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
                    <label>Periode</label>
                    <select
                      className="input"
                      value={period}
                      onChange={(e) => setPeriod(e.target.value)}
                    >
                      <option value="day">Per Hari</option>
                      <option value="week">Per Minggu</option>
                    </select>
                  </div>

                  <div className="adm-field">
                    <label>Tanggal</label>
                    <input
                      className="input"
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </div>
                </div>
              </section>

              {/* SUMMARY */}
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
                        <span className="adm-chip">
                          {String(report.period || periodLabel).toUpperCase()}
                        </span>
                        <span className="adm-chip">{report.date || date}</span>
                      </div>
                    </div>

                    <div className="adm-panel adm-report-card">
                      <div className="muted">Total</div>
                      <div className="adm-report-money">
                        <b>{totals.total ?? 0}</b>
                      </div>
                      <div className="adm-report-split">
                        <div>
                          <div className="muted">CASH</div>
                          <div><b>{totals.cash ?? 0}</b></div>
                        </div>
                        <div>
                          <div className="muted">QRIS</div>
                          <div><b>{totals.qris ?? 0}</b></div>
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

                  {/* SALES */}
                  <section className="adm-panel" style={{ marginTop: 14 }}>
                    <div className="adm-panel-head">
                      <h3 className="adm-h3">Transaksi</h3>
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
                      <div className="adm-report-list" role="list">
                        {visibleSales.map((s) => (
                          <div className="adm-report-item" key={s.id} role="listitem">
                            <div className="adm-report-item-top">
                              <div>
                                <div className="adm-report-item-time">
                                  {new Date(s.createdAt).toLocaleString("id-ID")}
                                </div>
                                <div className="adm-report-item-sub muted">
                                  Kasir: {s.cashier || "-"}
                                </div>
                              </div>

                              <div className="adm-report-item-badges">
                                <span className="adm-badge">{s.paymentMethod || "-"}</span>
                                <span className="adm-chip">
                                  Gross: <b>{s.grossTotal}</b>
                                </span>
                              </div>
                            </div>

                            <div className="adm-report-item-bottom">
                              <div className="adm-report-kv">
                                <div className="muted">Diskon</div>
                                <div><b>{s.discount}</b></div>
                              </div>
                              <div className="adm-report-kv">
                                <div className="muted">Net</div>
                                <div className="adm-report-net"><b>{s.netTotal}</b></div>
                              </div>
                            </div>
                          </div>
                        ))}
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
