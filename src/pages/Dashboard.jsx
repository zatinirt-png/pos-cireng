import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiGet } from "../api";
import { socket, connectSocket, disconnectSocket } from "../socket";
import { useNavigate } from "react-router-dom";
import { formatDateWIB } from "../lib/datetime";

function ymdWib(d = new Date()) {
  const offsetMs = 7 * 60 * 60 * 1000;
  const w = new Date(d.getTime() + offsetMs);
  const y = w.getUTCFullYear();
  const m = String(w.getUTCMonth() + 1).padStart(2, "0");
  const day = String(w.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatRangeLabel(startDate, endDate) {
  if (!startDate && !endDate) return "-";
  const start = startDate ? formatDateWIB(`${startDate}T00:00:00+07:00`) : "-";
  const end = endDate ? formatDateWIB(`${endDate}T00:00:00+07:00`) : "-";
  return `${start} s/d ${end}`;
}

function buildRangeQuery(startDate, endDate) {
  const qs = new URLSearchParams();
  if (startDate) qs.set("startDate", startDate);
  if (endDate) qs.set("endDate", endDate);
  const raw = qs.toString();
  return raw ? `?${raw}` : "";
}

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

function normalizeCartReportToTodayShape(cartReport, fallbackCartId) {
  const cartId = cartReport?.cart?.id || fallbackCartId || "";
  const cartName = cartReport?.cart?.name || "(Gerobak)";

  const totals = cartReport?.totals || {};
  const cash = Number(totals.cash || 0);
  const qris = Number(totals.qris || 0);
  const total = Number(totals.total || 0);

  const sales = Array.isArray(cartReport?.sales) ? cartReport.sales : [];
  const recentSales = sales.slice(0, 12).map((s) => ({
    id: s.id,
    createdAt: s.createdAt,
    cartId,
    cartName,
    paymentMethod: s.paymentMethod || "-",
    netTotal: Number(s.netTotal || 0),
  }));

  return {
    date: cartReport?.date || "",
    startDate: cartReport?.startDate || "",
    endDate: cartReport?.endDate || "",
    range: cartReport?.range || null,
    totalAll: { cash, qris, total },
    perCart: [{ cartId, cartName, cash, qris, total }],
    topProducts: Array.isArray(cartReport?.topProducts) ? cartReport.topProducts : [],
    recentSales,
  };
}

export default function Dashboard() {
  const nav = useNavigate();
  const token = localStorage.getItem("admin_token");
  const today = ymdWib();

  const [report, setReport] = useState(null);
  const [carts, setCarts] = useState([]);
  const [cartFilter, setCartFilter] = useState("ALL");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  const cartFilterRef = useRef("ALL");
  const startDateRef = useRef(today);
  const endDateRef = useRef(today);
  const didBootRef = useRef(false);

  const [err, setErr] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    cartFilterRef.current = cartFilter;
  }, [cartFilter]);

  useEffect(() => {
    cartFilterRef.current = cartFilter;
  }, [cartFilter]);

  useEffect(() => {
    startDateRef.current = startDate;
  }, [startDate]);

  useEffect(() => {
    endDateRef.current = endDate;
  }, [endDate]);

  async function loadCarts({ silent = true } = {}) {
    try {
      const r = await apiGet("/api/admin/carts", token);
      const list = Array.isArray(r?.carts) ? r.carts : [];
      // default: hanya aktif (tapi tetap simpan semua biar bisa kalau admin mau lihat non-aktif nanti)
      setCarts(list);
    } catch (e) {
      // carts gagal tidak mematikan dashboard, cukup abaikan (dropdown fallback ke perCart kalau ada)
      if (!silent) setErr(e?.message || "Gagal load daftar gerobak");
    }
  }

  async function load({ cartId, fromDate, toDate, silent = false } = {}) {
    const cid = cartId ?? cartFilterRef.current ?? "ALL";
    const sd = fromDate ?? startDateRef.current ?? today;
    const ed = toDate ?? endDateRef.current ?? today;

    if (!sd || !ed) {
      setErr("Tanggal awal dan tanggal akhir wajib diisi.");
      return;
    }

    if (sd > ed) {
      setErr("Tanggal awal tidak boleh lebih besar dari tanggal akhir.");
      return;
    }

    if (!silent) setLoading(true);
    setErr("");

    try {
      const qs = buildRangeQuery(sd, ed);

      if (cid === "ALL") {
        const r = await apiGet(`/api/reports/today${qs}`, token);
        setReport(r);
      } else {
        const r = await apiGet(`/api/reports/cart/${cid}${qs}`, token);
        setReport(normalizeCartReportToTodayShape(r, cid));
      }

      setUpdatedAt(new Date());
    } catch (e) {
      setErr(e?.message || "Gagal load report");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) nav("/admin");
  }, [token, nav]);

  useEffect(() => {
    if (!token) return;
    if (didBootRef.current) return;
    didBootRef.current = true;

    loadCarts({ silent: true });
    load({ silent: false, fromDate: today, toDate: today });

    connectSocket(token);

    const onInvalidate = () => load({ silent: true });
    socket.on("reports:invalidate", onInvalidate);

    const t = setInterval(() => load({ silent: true }), 15000);

    return () => {
      clearInterval(t);
      socket.off("reports:invalidate", onInvalidate);
      disconnectSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token || !didBootRef.current) return;
    load({ silent: false, fromDate: startDate, toDate: endDate });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  function logout() {
    localStorage.removeItem("admin_token");
    disconnectSocket();
    nav("/admin");
  }

  const cartOptions = useMemo(() => {
    const active = (carts || []).filter((c) => (c.isActive ?? true) !== false);
    if (active.length) return active.map((c) => ({ id: c.id, name: c.name }));

    // fallback kalau carts belum kebaca: ambil dari report.perCart
    const pc = Array.isArray(report?.perCart) ? report.perCart : [];
    return pc.map((x) => ({ id: x.cartId, name: x.cartName }));
  }, [carts, report]);

  const cartLabel = useMemo(() => {
    if (cartFilter === "ALL") return "Semua Gerobak";
    const fromList = cartOptions.find((c) => c.id === cartFilter)?.name;
    if (fromList) return fromList;
    const pc0 = Array.isArray(report?.perCart) ? report.perCart[0] : null;
    return pc0?.cartName || "(Gerobak)";
  }, [cartFilter, cartOptions, report]);

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

  async function handleCartChange(e) {
    const v = e.target.value;
    setCartFilter(v);
    cartFilterRef.current = v;
    await load({ cartId: v, silent: false });
  }

  const activeRangeLabel = formatRangeLabel(
    report?.startDate || startDate,
    report?.endDate || endDate
  );

  async function handleCartChange(e) {
    const v = e.target.value;
    setCartFilter(v);
    cartFilterRef.current = v;
    await load({ cartId: v, fromDate: startDate, toDate: endDate, silent: false });
  }

  function handleTodayRange() {
    const now = ymdWib();
    setStartDate(now);
    setEndDate(now);
  }

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

          {/* MAIN */}
          <main className="adm-main">
            <div className="adm-main-card">
              <div className="adm-header">
                <div>
                  <h2 className="adm-h2">Live Report</h2>
                  <div className="adm-subline">
                    <span className="muted">Rentang: {activeRangeLabel}</span>
                    <span className="adm-dot">•</span>
                    <span className="muted">Update: {updatedText}</span>
                    <span className="adm-dot">•</span>
                    <span className="muted">
                      Gerobak: <b>{cartLabel}</b>
                    </span>
                    {loading ? (
                      <>
                        <span className="adm-dot">•</span>
                        <span className="muted">Loading…</span>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="adm-actions" style={{ alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
                  <div style={{ minWidth: 220, maxWidth: 320 }}>
                    <label style={{ marginBottom: 6 }}>Pilih Gerobak</label>
                    <select
                      className="input"
                      value={cartFilter}
                      onChange={handleCartChange}
                      disabled={loading}
                      style={{ borderRadius: 16 }}
                    >
                      <option value="ALL">Semua Gerobak</option>
                      {cartOptions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ minWidth: 170 }}>
                    <label style={{ marginBottom: 6 }}>Dari Tanggal</label>
                    <input
                      className="input"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      disabled={loading}
                      style={{ borderRadius: 16 }}
                    />
                  </div>

                  <div style={{ minWidth: 170 }}>
                    <label style={{ marginBottom: 6 }}>Sampai Tanggal</label>
                    <input
                      className="input"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      disabled={loading}
                      style={{ borderRadius: 16 }}
                    />
                  </div>

                  <button className="btn secondary" type="button" onClick={handleTodayRange} disabled={loading}>
                    Hari Ini
                  </button>

                  <button className="btn secondary" type="button" onClick={() => load({ silent: false })} disabled={loading}>
                    Refresh
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
                    <h3 className="adm-h3">
                      {cartFilter === "ALL" ? "Omzet per Gerobak" : `Omzet Gerobak`}
                    </h3>
                    <span className="muted">
                      {cartFilter === "ALL" ? "Urut terbesar" : cartLabel}
                    </span>
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
                              method === "QRIS"
                                ? "adm-badge adm-badge--qris"
                                : method === "CASH"
                                ? "adm-badge adm-badge--cash"
                                : "adm-badge";

                            return (
                              <tr key={s.id}>
                                <td data-label="Waktu">
                                  {new Date(s.createdAt).toLocaleTimeString("id-ID")}
                                </td>
                                <td data-label="Gerobak">{s.cartName}</td>
                                <td data-label="Metode">
                                  <span className={badgeClass}>{method || "-"}</span>
                                </td>
                                <td data-label="Total">
                                  <b>{rupiah(s.netTotal)}</b>
                                </td>
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
