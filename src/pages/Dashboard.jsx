import React, { useEffect, useMemo, useState } from "react";
import { apiGet } from "../api";
import { socket, connectSocket, disconnectSocket } from "../socket";
import { useNavigate } from "react-router-dom";
import { formatDateWIB } from "../lib/datetime";

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

export default function Dashboard() {
  const nav = useNavigate();
  const token = localStorage.getItem("admin_token");
  const [report, setReport] = useState(null);
  const [err, setErr] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);

  async function load() {
    setErr("");
    try {
      const r = await apiGet("/api/reports/today", token);
      setReport(r);
      setUpdatedAt(new Date());
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    if (!token) nav("/admin");
  }, [token, nav]);

  useEffect(() => {
    if (!token) return;

    // 1) initial load
    load();

    // 2) connect socket (karena autoConnect: false)
    connectSocket(token);

    // 3) listen event dari server
    const onInvalidate = () => load();
    socket.on("reports:invalidate", onInvalidate);

    // 4) fallback polling (jaga-jaga socket putus)
    const t = setInterval(() => load(), 15000);

    return () => {
      clearInterval(t);
      socket.off("reports:invalidate", onInvalidate);
      disconnectSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function logout() {
    localStorage.removeItem("admin_token");
    disconnectSocket();
    nav("/admin");
  }

  // NORMALISASI: kalau backend tidak kirim totalAll, hitung dari perCart
  const totalAll = useMemo(() => {
    if (!report) return { total: 0, cash: 0, qris: 0 };
    if (report.totalAll) return report.totalAll;

    const arr = Array.isArray(report.perCart) ? report.perCart : [];
    const cash = arr.reduce((s, r) => s + Number(r.cash || 0), 0);
    const qris = arr.reduce((s, r) => s + Number(r.qris || 0), 0);
    return { total: cash + qris, cash, qris };
  }, [report]);

  const sortedPerCart = useMemo(() => {
    const arr = report?.perCart ? [...report.perCart] : [];
    arr.sort((a, b) => (b.total || 0) - (a.total || 0));
    return arr;
  }, [report]);

  const updatedText = updatedAt
    ? updatedAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
    : "-";

  return (
    <div className="adm-bg adm">
      <div className="adm-shell">
        <div className="adm-layout">
          {/* LEFT NAV */}
          <aside className="adm-nav">
            <div className="adm-nav-card">
              <div className="adm-nav-title">Admin</div>
              <div className="adm-nav-sub">Navigasi cepat</div>

              <div className="adm-nav-list">
                <button
                  className="adm-nav-item active"
                  type="button"
                  onClick={() => nav("/admin/dashboard")}
                >
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
                  <h2 className="adm-h2">Live Report</h2>
                  <div className="adm-subline">
                    <span className="muted">Tanggal: {formatDateWIB(report?.date) || "-"}</span>
                    <span className="adm-dot">•</span>
                    <span className="muted">Update: {updatedText}</span>
                  </div>
                </div>

                <div className="adm-actions">
                  <button className="btn secondary" type="button" onClick={load}>
                    Refresh
                  </button>
                  <button className="btn secondary" type="button" onClick={() => nav("/admin/products")}>
                    Menu
                  </button>
                  <button className="btn secondary" type="button" onClick={() => nav("/admin/promos")}>
                    Promo
                  </button>
                </div>
              </div>

              {err ? (
                <div className="adm-alert" role="alert" aria-live="polite">
                  {err}
                </div>
              ) : null}

              <div className="adm-panels">
                {/* KPI */}
                <section className="adm-panel adm-panel--kpi">
                  <div className="adm-kpi-label">Total Omzet</div>
                  <div className="adm-kpi-value">{rupiah(totalAll.total)}</div>
                  <div className="adm-kpi-sub">
                    <span>
                      CASH: <b>{rupiah(totalAll.cash)}</b>
                    </span>
                    <span className="adm-dot">•</span>
                    <span>
                      QRIS: <b>{rupiah(totalAll.qris)}</b>
                    </span>
                  </div>
                  <div className="adm-kpi-hint">*Update otomatis saat transaksi masuk (socket/polling).</div>
                </section>

                {/* PER CART */}
                <section className="adm-panel">
                  <div className="adm-panel-head">
                    <h3 className="adm-h3">Omzet per Gerobak</h3>
                    <span className="muted">Urut terbesar</span>
                  </div>

                  <div className="adm-table-wrap">
                    <table className="table adm-table">
                      <thead>
                        <tr>
                          <th>Gerobak</th>
                          <th>CASH</th>
                          <th>QRIS</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedPerCart.map((row) => (
                          <tr key={row.cartId}>
                            <td data-label="Gerobak">
                              <b>{row.cartName}</b>
                            </td>
                            <td data-label="CASH">{rupiah(row.cash)}</td>
                            <td data-label="QRIS">{rupiah(row.qris)}</td>
                            <td data-label="Total">
                              <b>{rupiah(row.total)}</b>
                            </td>
                          </tr>
                        ))}
                        {!sortedPerCart.length && (
                          <tr>
                            <td data-label="Info" colSpan={4} className="muted">
                              Belum ada data.
                            </td>
                          </tr>
                        )}
                      </tbody>

                    </table>
                  </div>
                </section>
              </div>

              <div className="adm-panels">
                {/* TOP PRODUCTS */}
                <section className="adm-panel">
                  <div className="adm-panel-head">
                    <h3 className="adm-h3">Top Produk Hari Ini</h3>
                    <span className="muted">Top 8</span>
                  </div>

                  {report?.topProducts?.length ? (
                    <div className="adm-table-wrap">
                      <table className="table adm-table">
                        <thead>
                          <tr>
                            <th>Produk</th>
                            <th style={{ width: 110 }}>Qty</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.topProducts.slice(0, 8).map((tp) => (
                            <tr key={`${tp.productId}-${tp.portion || ""}`}>
                              <td data-label="Produk">
                                {tp.productName || tp.name || "(Produk)"}
                                {tp.portion ? <span className="muted"> ({tp.portion})</span> : null}
                              </td>
                              <td data-label="Qty">
                                <b>{tp.qty}</b>
                              </td>
                            </tr>
                          ))}
                        </tbody>

                      </table>
                    </div>
                  ) : (
                    <div className="muted">Belum ada penjualan.</div>
                  )}
                </section>

                {/* RECENT SALES */}
                <section className="adm-panel">
                  <div className="adm-panel-head">
                    <h3 className="adm-h3">Transaksi Terbaru</h3>
                    <span className="muted">Top 12</span>
                  </div>

                  {report?.recentSales?.length ? (
                    <div className="adm-table-wrap">
                      <table className="table adm-table">
                        <thead>
                          <tr>
                            <th>Waktu</th>
                            <th>Gerobak</th>
                            <th style={{ width: 110 }}>Metode</th>
                            <th style={{ width: 160 }}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.recentSales.slice(0, 12).map((s) => {
                            const method = String(s.paymentMethod || s.method || "-").toUpperCase().trim();
                            const badgeClass =
                              method === "QRIS" ? "adm-badge adm-badge--qris" :
                              method === "CASH" ? "adm-badge adm-badge--cash" :
                              "adm-badge";

                            return (
                              <tr key={s.id}>
                                <td data-label="Waktu">{new Date(s.createdAt).toLocaleTimeString("id-ID")}</td>
                                <td data-label="Gerobak">{s.cartName}</td>
                                <td data-label="Metode"><span className={badgeClass}>{method || "-"}</span></td>
                                <td data-label="Total"><b>{rupiah(s.netTotal)}</b></td>
                              </tr>
                            );
                          })}
                        </tbody>

                      </table>
                    </div>
                  ) : (
                    <div className="muted">Belum ada transaksi.</div>
                  )}
                </section>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
