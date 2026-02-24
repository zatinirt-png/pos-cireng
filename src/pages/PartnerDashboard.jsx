import React, { useEffect, useMemo, useState } from "react";
import { apiGet } from "../api";
import { useNavigate, useLocation } from "react-router-dom";


const API_BASE =
  (import.meta?.env?.VITE_API_BASE || "").replace(/\/$/, "") || "";

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

function isoTodayLocal() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeReport(raw) {
  const totals = raw?.totals || {};
  const topProducts = raw?.topProducts || [];
  const sales = raw?.sales || [];

  const start = raw?.range?.start ? new Date(raw.range.start) : null;
  const end = raw?.range?.end ? new Date(raw.range.end) : null;

  return {
    totals: {
      cash: Number(totals.cash || 0),
      qris: Number(totals.qris || 0),
      total: Number(totals.total || 0),
      transactions: Number(totals.transactions || sales.length || 0),
    },
    range: { start, end },
    topProducts,
    sales,
  };
}

export default function PartnerDashboard() {
  const nav = useNavigate();
  const loc = useLocation();
  const token = localStorage.getItem("partner_token");

  const [tab, setTab] = useState("overview"); // overview | reports | stocks

  // ===== Overview data =====
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);

  // ===== Reports =====
  const [carts, setCarts] = useState([]);
  const [cartsLoading, setCartsLoading] = useState(false);
  const [cartsErr, setCartsErr] = useState("");

  const [period, setPeriod] = useState("day"); // day | week
  const [date, setDate] = useState(isoTodayLocal());

  const [modalOpen, setModalOpen] = useState(false);
  const [activeCart, setActiveCart] = useState(null);

  const [reportLoading, setReportLoading] = useState(false);
  const [reportErr, setReportErr] = useState("");
  const [reportRaw, setReportRaw] = useState(null);

  const [exportLoading, setExportLoading] = useState("");

  // ===== STOCKS (Inventory) =====
  const [stockCartId, setStockCartId] = useState("");
  const [includeCentral, setIncludeCentral] = useState(true);
  const [stockQ, setStockQ] = useState("");

  const [stockLoading, setStockLoading] = useState(false);
  const [stockErr, setStockErr] = useState("");
  const [stockItems, setStockItems] = useState([]);

  // Ledger modal
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerErr, setLedgerErr] = useState("");
  const [ledgerItems, setLedgerItems] = useState([]);
  const [ledgerCart, setLedgerCart] = useState(null);

  useEffect(() => {
    if (!token) nav("/partner");
  }, [token, nav]);

  async function loadOverview() {
    if (!token) return;
    setErr("");
    setLoading(true);
    try {
      // today range computed by server (WIB logic). For partner, endpoint already returns totals
      const res = await apiGet("/api/partner/reports/today", token);
      setData(res);
    } catch (e) {
      setErr(e?.message || "Gagal load dashboard");
    } finally {
      setLoading(false);
    }
  }

  async function loadPartnerCarts() {
    if (!token) return;
    setCartsErr("");
    setCartsLoading(true);
    try {
      const res = await apiGet("/api/partner/carts", token);
      setCarts(res.carts || []);
    } catch (e) {
      setCartsErr(e?.message || "Gagal load carts");
    } finally {
      setCartsLoading(false);
    }
  }

  async function openCartReport(cart) {
    setActiveCart(cart);
    setModalOpen(true);
  }

  async function fetchCartReport(cart) {
    if (!cart?.id) return;
    setReportErr("");
    setReportRaw(null);
    setReportLoading(true);

    try {
      const qs = new URLSearchParams();
      qs.set("period", period);
      qs.set("date", date);
      const res = await apiGet(
        `/api/partner/reports/cart/${cart.id}?${qs.toString()}`,
        token
      );
      setReportRaw(res);
    } catch (e) {
      setReportErr(e?.message || "Gagal load report gerobak");
    } finally {
      setReportLoading(false);
    }
  }

  const report = useMemo(() => normalizeReport(reportRaw), [reportRaw]);

  async function downloadWithAuth(urlPath, filename) {
    const url = `${API_BASE}${urlPath}`;
    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!r.ok) throw new Error("Gagal download (" + r.status + ")");
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async function doExport(type) {
    if (!activeCart?.id) return;
    setExportLoading(type);
    try {
      const qs = new URLSearchParams();
      qs.set("period", period);
      qs.set("date", date);

      if (type === "csv") {
        await downloadWithAuth(
          `/api/partner/reports/cart/${activeCart.id}/export.csv?${qs.toString()}`,
          `report_${activeCart.name}_${period}_${date}.csv`
        );
      } else {
        await downloadWithAuth(
          `/api/partner/reports/cart/${activeCart.id}/export.pdf?${qs.toString()}`,
          `report_${activeCart.name}_${period}_${date}.pdf`
        );
      }
    } catch (e) {
      setReportErr(e?.message || "Gagal export");
    } finally {
      setExportLoading("");
    }
  }

  function logout() {
    localStorage.removeItem("partner_token");
    nav("/partner");
  }

  function fmtDT(dt) {
    if (!dt) return "-";
    try {
      return new Date(dt).toLocaleString("id-ID");
    } catch {
      return String(dt);
    }
  }

  async function loadStocks(cartId) {
    if (!token || !cartId) return;
    setStockErr("");
    setStockLoading(true);

    try {
      const qs = new URLSearchParams();
      qs.set("includeCentral", includeCentral ? "1" : "0");

      const r = await apiGet(
        `/api/partner/inventory/stocks/cart/${cartId}?${qs.toString()}`,
        token
      );
      setStockItems(r.stocks || []);
    } catch (e) {
      setStockErr(e?.message || "Gagal load stok");
      setStockItems([]);
    } finally {
      setStockLoading(false);
    }
  }

  async function openLedgerModal(cart) {
    if (!token || !cart?.id) return;

    setLedgerErr("");
    setLedgerItems([]);
    setLedgerCart(cart);
    setLedgerOpen(true);
    setLedgerLoading(true);

    try {
      const qs = new URLSearchParams();
      qs.set("includeCentral", includeCentral ? "1" : "0");
      qs.set("take", "100");

      const r = await apiGet(
        `/api/partner/inventory/ledger/cart/${cart.id}?${qs.toString()}`,
        token
      );
      setLedgerItems(r.ledger || []);
    } catch (e) {
      setLedgerErr(e?.message || "Gagal load ledger");
    } finally {
      setLedgerLoading(false);
    }
  }

  // close modal by ESC
  // close modal by ESC (report modal / ledger modal)
  useEffect(() => {
    if (!modalOpen && !ledgerOpen) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setModalOpen(false);
        setLedgerOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalOpen, ledgerOpen]);

  // init
  useEffect(() => {
    if (!token) return;
    loadOverview();
  }, []); // eslint-disable-line

  useEffect(() => {
  const qs = new URLSearchParams(loc.search || "");
  const t = qs.get("tab");
  if (t === "stocks") setTab("stocks");
  if (t === "reports") setTab("reports");
  if (t === "overview") setTab("overview");
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [loc.search]);

  // load carts when opening reports/stocks tab
  useEffect(() => {
    if (!token) return;
    if ((tab === "reports" || tab === "stocks") && carts.length === 0 && !cartsLoading) {
      loadPartnerCarts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // default cart untuk tab stocks
  useEffect(() => {
    if (!token) return;
    if (tab !== "stocks") return;
    if (stockCartId) return;
    if (!carts.length) return;
    setStockCartId(carts[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, carts, token]);

  // auto load stok saat cart / includeCentral berubah
  useEffect(() => {
    if (!token) return;
    if (tab !== "stocks") return;
    if (!stockCartId) return;
    loadStocks(stockCartId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, stockCartId, includeCentral]);

  // auto refresh report in modal when period/date changes
  useEffect(() => {
    if (!token) return;
    if (!modalOpen) return;
    if (!activeCart?.id) return;
    fetchCartReport(activeCart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, activeCart?.id, period, date]);

  return (
    <div className="prt-bg">
      <div className="prt-shell">
        <div className="prt-card">
          <div className="prt-header">
            <div>
              <h2 className="prt-title">Dashboard Mitra</h2>
              <div className="prt-subtitle muted">
                Akses laporan hanya untuk gerobak yang kamu miliki
              </div>
            </div>
            <button className="btn secondary" onClick={logout} type="button">
              Logout
            </button>
          </div>

          <div className="hr" />

          {/* Tabs */}
          <div className="prt-tabs" role="tablist" aria-label="Dashboard Mitra tabs">
            <button
              className={`prt-tab ${tab === "overview" ? "active" : ""}`}
              type="button"
              role="tab"
              aria-selected={tab === "overview"}
              onClick={() => setTab("overview")}
            >
              Dashboard
            </button>
            <button
              className={`prt-tab ${tab === "reports" ? "active" : ""}`}
              type="button"
              role="tab"
              aria-selected={tab === "reports"}
              onClick={() => setTab("reports")}
            >
              Laporan
            </button>
            <button
              className={`prt-tab ${tab === "stocks" ? "active" : ""}`}
              type="button"
              role="tab"
              aria-selected={tab === "stocks"}
              onClick={() => setTab("stocks")}
            >
              Stok
            </button>
          </div>

          <div className="hr" />

          {/* ===== TAB: OVERVIEW ===== */}
          {tab === "overview" && (
            <>
              {err && (
                <div
                  className="toast"
                  style={{ background: "#ffecec", borderColor: "#ffbdbd" }}
                >
                  {err}
                </div>
              )}

              <div className="prt-toolbar">
                <button
                  className="btn secondary"
                  onClick={loadOverview}
                  disabled={loading}
                  type="button"
                >
                  {loading ? "Loading..." : "Refresh"}
                </button>
                <span className="muted" style={{ fontSize: 12 }}>
                  Today (WIB)
                </span>
              </div>

              {!data ? (
                <div className="muted">Belum ada data.</div>
              ) : (
                <>
                  <div className="prt-grid-2">
                    <div className="prt-panel">
                      <div className="muted">Ringkasan Hari Ini</div>
                      <div className="prt-kpis">
                        <div className="prt-kpi">
                          <div className="muted">CASH</div>
                          <div className="prt-money">
                            <b>{rupiah(data.totalAll?.cash || 0)}</b>
                          </div>
                        </div>
                        <div className="prt-kpi">
                          <div className="muted">QRIS</div>
                          <div className="prt-money">
                            <b>{rupiah(data.totalAll?.qris || 0)}</b>
                          </div>
                        </div>
                        <div className="prt-kpi prt-kpi--total">
                          <div className="muted">TOTAL</div>
                          <div className="prt-money prt-money--big">
                            <b>{rupiah(data.totalAll?.total || 0)}</b>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="prt-panel">
                      <div className="prt-panel-head">
                        <div style={{ fontWeight: 900 }}>Per Gerobak</div>
                        <span className="prt-pill">Today</span>
                      </div>

                      {(data.perCart || []).length ? (
                        <div className="prt-list" role="list">
                          {data.perCart.map((r) => (
                            <div
                              className="prt-list-item"
                              key={r.cartId}
                              role="listitem"
                            >
                              <div className="prt-list-title" title={r.cartName}>
                                {r.cartName}
                              </div>
                              <div className="prt-list-value">
                                <b>{rupiah(r.total)}</b>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="muted">Belum ada transaksi.</div>
                      )}
                    </div>
                  </div>

                  <div className="hr" />

                  <div className="prt-panel">
                    <div className="prt-panel-head">
                      <div style={{ fontWeight: 900 }}>Transaksi Terbaru</div>
                      <span className="muted" style={{ fontSize: 12 }}>
                        {data.recentSales?.length
                          ? `${data.recentSales.length} item`
                          : "0"}
                      </span>
                    </div>

                    {(data.recentSales || []).length ? (
                      <div className="prt-sales" role="list">
                        {data.recentSales.map((s) => (
                          <div className="prt-sale" key={s.id} role="listitem">
                            <div className="prt-sale-top">
                              <div>
                                <div className="prt-sale-title">{s.cartName}</div>
                                <div
                                  className="muted"
                                  style={{ fontSize: 12, marginTop: 2 }}
                                >
                                  {new Date(s.createdAt).toLocaleString("id-ID")}
                                </div>
                              </div>
                              <div className="prt-sale-badges">
                                <span className="adm-badge">
                                  {s.paymentMethod || "-"}
                                </span>
                                <span className="adm-chip">
                                  Net: <b>{rupiah(s.netTotal)}</b>
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="muted">Belum ada transaksi.</div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {/* ===== TAB: REPORTS ===== */}
          {tab === "reports" && (
            <>
              {cartsErr && (
                <div
                  className="toast"
                  style={{ background: "#ffecec", borderColor: "#ffbdbd" }}
                >
                  {cartsErr}
                </div>
              )}

              <div className="prt-panel">
                <div className="prt-panel-head">
                  <div style={{ fontWeight: 900 }}>Filter Laporan</div>
                  <span className="muted" style={{ fontSize: 12 }}>
                    WIB
                  </span>
                </div>

                <div className="prt-filters">
                  <div>
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

                  <div>
                    <label>Tanggal (WIB)</label>
                    <input
                      className="input"
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                    <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                      {period === "week"
                        ? "Mingguan: ambil minggu yang mengandung tanggal ini (Senin–Minggu, WIB)."
                        : "Harian: sesuai tanggal WIB."}
                    </div>
                  </div>

                  <div className="prt-filter-actions">
                    <button
                      className="btn secondary"
                      onClick={loadPartnerCarts}
                      disabled={cartsLoading}
                      type="button"
                    >
                      {cartsLoading ? "Loading..." : "Refresh Gerobak"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="hr" />

              <div className="prt-section-title">Pilih Gerobak</div>

              {cartsLoading ? (
                <div className="muted">Loading gerobak...</div>
              ) : carts.length === 0 ? (
                <div className="muted">Belum ada gerobak yang bisa diakses.</div>
              ) : (
                <div className="prt-cartgrid">
                  {carts.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => openCartReport(c)}
                      className="prt-cartbtn"
                    >
                      <div className="prt-cartname" title={c.name}>
                        {c.name}
                      </div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                        Klik untuk lihat laporan
                      </div>
                    </button>
                  ))}
                </div>
              )}

              

              {/* Modal */}
              {modalOpen && (
                <div
                  role="dialog"
                  aria-modal="true"
                  className="modal-overlay"
                  onClick={() => setModalOpen(false)}
                >
                  <div
                    className="modal-card prt-modal"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="modal-head">
                      <div>
                        <div className="prt-modal-title">
                          Laporan — {activeCart?.name || "(Gerobak)"}
                        </div>
                        <div className="prt-modal-sub muted">
                          <span className="adm-chip">
                            {period === "week" ? "MINGGU" : "HARI"}
                          </span>
                          <span className="adm-chip">{date}</span>
                        </div>
                      </div>

                      <div className="modal-actions">
                        <button
                          className="btn secondary"
                          onClick={() => fetchCartReport(activeCart)}
                          type="button"
                        >
                          Refresh
                        </button>
                        <button
                          className="btn secondary"
                          onClick={() => setModalOpen(false)}
                          type="button"
                        >
                          Tutup
                        </button>
                      </div>
                    </div>

                    <div className="hr" />

                    {reportErr && (
                      <div
                        className="toast"
                        style={{ background: "#ffecec", borderColor: "#ffbdbd" }}
                      >
                        {reportErr}
                      </div>
                    )}

                    {reportLoading ? (
                      <div className="muted">Loading report...</div>
                    ) : !report ? (
                      <div className="muted">Tidak ada data report.</div>
                    ) : (
                      <>
                        <div className="prt-modal-toolbar">
                          <button
                            className="btn secondary"
                            disabled={exportLoading === "csv"}
                            onClick={() => doExport("csv")}
                            type="button"
                          >
                            {exportLoading === "csv" ? "Exporting..." : "Export CSV"}
                          </button>
                          <button
                            className="btn secondary"
                            disabled={exportLoading === "pdf"}
                            onClick={() => doExport("pdf")}
                            type="button"
                          >
                            {exportLoading === "pdf" ? "Exporting..." : "Export PDF"}
                          </button>
                        </div>

                        <div className="prt-modal-grid">
                          <div className="prt-panel">
                            <div className="muted">Ringkasan</div>
                            <div className="prt-kpis" style={{ marginTop: 10 }}>
                              <div className="prt-kpi">
                                <div className="muted">CASH</div>
                                <div className="prt-money">
                                  <b>{rupiah(report.totals.cash)}</b>
                                </div>
                              </div>
                              <div className="prt-kpi">
                                <div className="muted">QRIS</div>
                                <div className="prt-money">
                                  <b>{rupiah(report.totals.qris)}</b>
                                </div>
                              </div>
                              <div className="prt-kpi prt-kpi--total">
                                <div className="muted">TOTAL</div>
                                <div className="prt-money prt-money--big">
                                  <b>{rupiah(report.totals.total)}</b>
                                </div>
                              </div>
                            </div>

                            <div className="prt-meta muted" style={{ marginTop: 10 }}>
                              Transaksi: <b>{report.totals.transactions}</b>
                              <div style={{ marginTop: 8, fontSize: 12 }}>
                                Range (WIB server):
                                <div>
                                  Start:{" "}
                                  <b>
                                    {report.range.start
                                      ? report.range.start.toLocaleString("id-ID")
                                      : "-"}
                                  </b>
                                </div>
                                <div>
                                  End:{" "}
                                  <b>
                                    {report.range.end
                                      ? report.range.end.toLocaleString("id-ID")
                                      : "-"}
                                  </b>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="prt-panel">
                            <div className="prt-panel-head">
                              <div style={{ fontWeight: 900 }}>Top Produk</div>
                              <span className="muted" style={{ fontSize: 12 }}>
                                {report.topProducts.length
                                  ? `${Math.min(10, report.topProducts.length)} item`
                                  : "0"}
                              </span>
                            </div>

                            {report.topProducts.length ? (
                              <div className="prt-list" role="list">
                                {report.topProducts.slice(0, 10).map((p, idx) => (
                                  <div
                                    key={`${p.productId || idx}-${p.portion || ""}-${idx}`}
                                    className="prt-list-item"
                                    role="listitem"
                                  >
                                    <div
                                      className="prt-list-title"
                                      title={p.productName || p.name || "(Produk)"}
                                    >
                                      {p.productName || p.name || "(Produk)"}
                                    </div>
                                    <div className="prt-list-right">
                                      <span className="adm-badge">
                                        {p.portion || "-"}
                                      </span>
                                      <span className="prt-list-value">
                                        <b>{p.qty ?? p._sum?.qty ?? 0}</b>
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="muted">Belum ada data top produk.</div>
                            )}
                          </div>
                        </div>

                        <div className="hr" />

                        <div className="prt-section-title" style={{ marginTop: 2 }}>
                          Daftar Transaksi
                        </div>

                        {report.sales.length ? (
                          <div className="prt-sales" role="list">
                            {report.sales.slice(0, 50).map((s) => (
                              <div className="prt-sale" key={s.id} role="listitem">
                                <div className="prt-sale-top">
                                  <div>
                                    <div className="prt-sale-title">
                                      {new Date(s.createdAt).toLocaleString("id-ID")}
                                    </div>
                                    <div
                                      className="muted"
                                      style={{ fontSize: 12, marginTop: 2 }}
                                    >
                                      Kasir: {s.cashier || "-"}
                                    </div>
                                  </div>

                                  <div className="prt-sale-badges">
                                    <span className="adm-badge">
                                      {s.paymentMethod || "-"}
                                    </span>
                                    <span className="adm-chip">
                                      Gross: <b>{rupiah(s.grossTotal)}</b>
                                    </span>
                                  </div>
                                </div>

                                <div className="prt-sale-bottom">
                                  <div className="prt-kv">
                                    <div className="muted">Diskon</div>
                                    <div>
                                      <b>{rupiah(s.discount)}</b>
                                    </div>
                                  </div>
                                  <div className="prt-kv">
                                    <div className="muted">Net</div>
                                    <div className="prt-net">
                                      <b>{rupiah(s.netTotal)}</b>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="muted">Tidak ada transaksi pada periode ini.</div>
                        )}

                        {report.sales.length > 50 && (
                          <div className="muted" style={{ marginTop: 8 }}>
                            Menampilkan 50 transaksi pertama (export untuk lihat semua).
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
            
          )}
          {/* ===== TAB: STOCKS ===== */}
              {tab === "stocks" && (
                <>
                {cartsLoading ? (
                  <div className="muted">Loading gerobak...</div>
                ) : carts.length === 0 ? (
                  <div className="muted">Belum ada gerobak yang bisa diakses.</div>
                ) : null}
                  {stockErr && (
                    <div className="toast" style={{ background: "#ffecec", borderColor: "#ffbdbd" }}>
                      {stockErr}
                    </div>
                  )}

                  <div className="prt-panel">
                    <div className="prt-panel-head">
                      <div style={{ fontWeight: 900 }}>Stok Gerobak</div>
                      <span className="muted" style={{ fontSize: 12 }}>
                        Global (CENTRAL) {includeCentral ? "ditampilkan" : "disembunyikan"}
                      </span>
                    </div>

                    <div className="prt-filters">
                      <div>
                        <label>Gerobak</label>
                        <select
                          className="input"
                          value={stockCartId}
                          onChange={(e) => setStockCartId(e.target.value)}
                        >
                          {(carts || []).map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label>Pencarian bahan</label>
                        <input
                          className="input"
                          value={stockQ}
                          onChange={(e) => setStockQ(e.target.value)}
                          placeholder="contoh: cireng / kemasan / saus"
                        />
                        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                          Tips: cari cepat untuk bahan tertentu.
                        </div>
                      </div>

                      <div className="prt-filter-actions" style={{ gap: 10 }}>
                        <label className="adm-inline" style={{ marginBottom: 4 }}>
                          <input
                            type="checkbox"
                            checked={includeCentral}
                            onChange={(e) => setIncludeCentral(e.target.checked)}
                          />
                          <span>Tampilkan CENTRAL untuk bahan global</span>
                        </label>

                        <button
                          className="btn secondary"
                          type="button"
                          onClick={() => loadStocks(stockCartId)}
                          disabled={!stockCartId || stockLoading}
                        >
                          {stockLoading ? "Loading..." : "Refresh Stok"}
                        </button>

                        <button
                          className="btn secondary"
                          type="button"
                          onClick={() => {
                            const c = carts.find((x) => x.id === stockCartId);
                            if (c) openLedgerModal(c);
                          }}
                          disabled={!stockCartId}
                        >
                          Ledger
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="hr" />

                  <div className="prt-panel">
                    <div className="prt-panel-head">
                      <div style={{ fontWeight: 900 }}>Daftar Stok</div>
                      <span className="muted" style={{ fontSize: 12 }}>
                        {stockItems?.length ? `${stockItems.length} item` : "0"}
                      </span>
                    </div>

                    {stockLoading ? (
                      <div className="muted">Loading stok...</div>
                    ) : (
                      <div className="table-wrap">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Bahan</th>
                              <th style={{ width: 90 }}>Unit</th>
                              <th style={{ width: 120 }}>Qty</th>
                              <th style={{ width: 120 }}>Sumber</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(stockItems || [])
                              .filter((x) =>
                                stockQ.trim()
                                  ? String(x.name || "").toLowerCase().includes(stockQ.trim().toLowerCase())
                                  : true
                              )
                              .map((x) => (
                                <tr key={x.id}>
                                  <td>
                                    <b>{x.name}</b> {x.isGlobal ? <span className="muted">(Global)</span> : null}
                                  </td>
                                  <td>{x.unit}</td>
                                  <td>
                                    <b>{Number(x.qty ?? 0)}</b>
                                  </td>
                                  <td>
                                    <span className={`adm-badge ${x.source === "CENTRAL" ? "adm-badge--qris" : "adm-badge--cash"}`}>
                                      {x.source}
                                    </span>
                                  </td>
                                </tr>
                              ))}

                            {(!stockItems || stockItems.length === 0) && (
                              <tr>
                                <td colSpan={4} className="muted">
                                  Belum ada data stok / inventory belum aktif.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* LEDGER MODAL */}
                  {ledgerOpen && (
                    <div
                      role="dialog"
                      aria-modal="true"
                      className="modal-overlay"
                      onClick={() => setLedgerOpen(false)}
                    >
                      <div className="modal-card prt-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-head">
                          <div>
                            <div className="prt-modal-title">
                              Ledger — {ledgerCart?.name || "(Gerobak)"}
                            </div>
                            <div className="prt-modal-sub muted">
                              <span className="adm-chip">{includeCentral ? "Include CENTRAL" : "CART only"}</span>
                            </div>
                          </div>
                          <div className="modal-actions">
                            <button
                              className="btn secondary"
                              type="button"
                              onClick={() => (ledgerCart ? openLedgerModal(ledgerCart) : null)}
                            >
                              Refresh
                            </button>
                            <button className="btn secondary" type="button" onClick={() => setLedgerOpen(false)}>
                              Tutup
                            </button>
                          </div>
                        </div>

                        <div className="hr" />

                        {ledgerErr ? (
                          <div className="toast" style={{ background: "#ffecec", borderColor: "#ffbdbd" }}>
                            {ledgerErr}
                          </div>
                        ) : null}

                        {ledgerLoading ? (
                          <div className="muted">Loading ledger...</div>
                        ) : (
                          <div className="table-wrap">
                            <table className="table">
                              <thead>
                                <tr>
                                  <th>Waktu</th>
                                  <th>Bahan</th>
                                  <th style={{ width: 110 }}>Delta</th>
                                  <th style={{ width: 140 }}>Balance</th>
                                  <th>Reason / Note</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(ledgerItems || []).map((r) => (
                                  <tr key={r.id}>
                                    <td>{fmtDT(r.createdAt)}</td>
                                    <td>
                                      <b>{r.ingredient?.name || "-"}</b>{" "}
                                      <span className="muted">({r.ingredient?.unit || "-"})</span>
                                    </td>
                                    <td>
                                      <b>{Number(r.delta ?? 0)}</b>
                                    </td>
                                    <td>{Number(r.balanceAfter ?? 0)}</td>
                                    <td>
                                      <div><b>{r.reason || "-"}</b></div>
                                      <div className="muted" style={{ fontSize: 12 }}>{r.note || "-"}</div>
                                    </td>
                                  </tr>
                                ))}
                                {(!ledgerItems || ledgerItems.length === 0) && (
                                  <tr>
                                    <td colSpan={5} className="muted">Belum ada ledger.</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
        </div>
      </div>
    </div>
  );
}
