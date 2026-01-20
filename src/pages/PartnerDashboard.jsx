import React, { useEffect, useMemo, useState } from "react";
import { apiGet } from "../api";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

function rupiah(amount) {
  const n = Number(amount || 0);
  if (!Number.isFinite(n)) return "Rp 0";
  return "Rp " + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// WIB YYYY-MM-DD (pakai UTC+7 fix)
function wibYmd(date = new Date()) {
  const offsetMs = 7 * 60 * 60 * 1000;
  const w = new Date(date.getTime() + offsetMs);
  const y = w.getUTCFullYear();
  const m = String(w.getUTCMonth() + 1).padStart(2, "0");
  const d = String(w.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseIsoMaybe(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeReport(raw) {
  if (!raw) return null;

  const cartName =
    raw.cart?.name ||
    raw.cartName ||
    raw.cart?.cartName ||
    raw.cart?.title ||
    "(Gerobak)";

  const totals =
    raw.totals ||
    raw.totalAll ||
    raw.total ||
    {
      cash: 0,
      qris: 0,
      total: 0,
      transactions: Array.isArray(raw.sales) ? raw.sales.length : 0,
    };

  // range bisa string iso atau Date
  const start =
    parseIsoMaybe(raw.range?.start) ||
    parseIsoMaybe(raw.range?.startAt) ||
    parseIsoMaybe(raw.start) ||
    null;

  const end =
    parseIsoMaybe(raw.range?.end) ||
    parseIsoMaybe(raw.range?.endAt) ||
    parseIsoMaybe(raw.end) ||
    null;

  const sales = Array.isArray(raw.sales) ? raw.sales : [];
  const topProducts = Array.isArray(raw.topProducts) ? raw.topProducts : [];

  return {
    cartName,
    cartId: raw.cart?.id || raw.cartId || null,
    totals: {
      cash: Number(totals.cash || 0),
      qris: Number(totals.qris || 0),
      total: Number(totals.total || 0),
      transactions: Number(totals.transactions ?? sales.length ?? 0),
    },
    range: { start, end },
    sales,
    topProducts,
  };
}

async function downloadWithAuth(path, token, fallbackName) {
  const res = await fetch(API_BASE + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // coba parse error json
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

export default function PartnerDashboard() {
  const nav = useNavigate();
  const token = localStorage.getItem("partner_token");

  // Tabs: overview (yang lama) + reports (baru)
  const [tab, setTab] = useState("overview"); // "overview" | "reports"

  // Overview (existing)
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  // Reports (new)
  const [carts, setCarts] = useState([]);
  const [cartsErr, setCartsErr] = useState("");
  const [cartsLoading, setCartsLoading] = useState(false);

  const [period, setPeriod] = useState("day"); // "day" | "week"
  const [date, setDate] = useState(wibYmd());

  const [modalOpen, setModalOpen] = useState(false);
  const [activeCart, setActiveCart] = useState(null);
  const [reportRaw, setReportRaw] = useState(null);
  const [reportErr, setReportErr] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState("");

  const report = useMemo(() => normalizeReport(reportRaw), [reportRaw]);

  useEffect(() => {
    if (!token) nav("/partner");
  }, [token, nav]);

  async function loadOverview() {
    setErr("");
    setLoading(true);
    try {
      const res = await apiGet("/api/partner/reports/today", token);
      setData(res);
    } catch (e) {
      setErr(e?.message || "Gagal load dashboard");
    } finally {
      setLoading(false);
    }
  }

  async function loadPartnerCarts() {
    setCartsErr("");
    setCartsLoading(true);
    try {
      const res = await apiGet("/api/partner/carts", token);
      setCarts(res.carts || []);
    } catch (e) {
      setCartsErr(e?.message || "Gagal load carts partner");
    } finally {
      setCartsLoading(false);
    }
  }

  async function openCartReport(cart) {
    setActiveCart(cart);
    setModalOpen(true);
    setReportErr("");
    setReportRaw(null);
    setReportLoading(true);

    try {
      const qs = new URLSearchParams();
      qs.set("period", period);
      qs.set("date", date);
      const res = await apiGet(`/api/partner/reports/cart/${cart.id}?${qs.toString()}`, token);
      setReportRaw(res);
    } catch (e) {
      setReportErr(e?.message || "Gagal load report gerobak");
    } finally {
      setReportLoading(false);
    }
  }

  async function doExport(type) {
    if (!activeCart?.id) return;
    setExportLoading(type);
    setReportErr("");

    try {
      const qs = new URLSearchParams();
      qs.set("period", period);
      qs.set("date", date);

      if (type === "csv") {
        await downloadWithAuth(
          `/api/partner/reports/cart/${activeCart.id}/export.csv?${qs.toString()}`,
          token,
          `report_${activeCart.name}_${period}_${date}.csv`
        );
      } else {
        await downloadWithAuth(
          `/api/partner/reports/cart/${activeCart.id}/export.pdf?${qs.toString()}`,
          token,
          `report_${activeCart.name}_${period}_${date}.pdf`
        );
      }
    } catch (e) {
      setReportErr(e?.message || "Gagal export file");
    } finally {
      setExportLoading("");
    }
  }

  function logout() {
    localStorage.removeItem("partner_token");
    nav("/partner");
  }

  // load awal
  useEffect(() => {
    if (!token) return;
    loadOverview();
  }, []); // eslint-disable-line

  // saat pindah ke tab reports pertama kali, load carts
  useEffect(() => {
    if (!token) return;
    if (tab === "reports" && carts.length === 0 && !cartsLoading) {
      loadPartnerCarts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <div className="container">
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0 }}>Dashboard Mitra</h2>
            <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
              Akses laporan hanya untuk gerobak yang kamu miliki
            </div>
          </div>
          <button className="btn secondary" onClick={logout}>Logout</button>
        </div>

        <div className="hr" />

        {/* Tabs */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            className={tab === "overview" ? "btn" : "btn secondary"}
            type="button"
            onClick={() => setTab("overview")}
          >
            Dashboard
          </button>
          <button
            className={tab === "reports" ? "btn" : "btn secondary"}
            type="button"
            onClick={() => setTab("reports")}
          >
            Laporan
          </button>
        </div>

        <div className="hr" />

        {/* ===== TAB: OVERVIEW (yang lama) ===== */}
        {tab === "overview" && (
          <>
            {err && (
              <div className="toast" style={{ background: "#ffecec", borderColor: "#ffbdbd" }}>
                {err}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
              <button className="btn secondary" onClick={loadOverview} disabled={loading}>
                {loading ? "Loading..." : "Refresh"}
              </button>
              <span className="muted" style={{ fontSize: 12 }}>
                (Today WIB)
              </span>
            </div>

            {!data ? (
              <div className="muted">Belum ada data.</div>
            ) : (
              <>
                <div className="row">
                  <div className="col">
                    <div className="card">
                      <div className="muted">Total CASH</div>
                      <div style={{ fontSize: 18 }}><b>{rupiah(data.totalAll?.cash || 0)}</b></div>
                      <div className="muted" style={{ marginTop: 10 }}>Total QRIS</div>
                      <div style={{ fontSize: 18 }}><b>{rupiah(data.totalAll?.qris || 0)}</b></div>
                      <div className="muted" style={{ marginTop: 10 }}>TOTAL</div>
                      <div style={{ fontSize: 22 }}><b>{rupiah(data.totalAll?.total || 0)}</b></div>
                    </div>
                  </div>

                  <div className="col">
                    <div className="card">
                      <div style={{ fontWeight: 800, marginBottom: 8 }}>Per Gerobak</div>
                      {(data.perCart || []).length ? (
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Gerobak</th>
                              <th>Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.perCart.map((r) => (
                              <tr key={r.cartId}>
                                <td>{r.cartName}</td>
                                <td><b>{rupiah(r.total)}</b></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="muted">Belum ada transaksi.</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="hr" />

                <div style={{ fontWeight: 800, marginBottom: 8 }}>Transaksi Terbaru</div>
                {(data.recentSales || []).length ? (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Waktu</th>
                        <th>Gerobak</th>
                        <th>Metode</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentSales.map((s) => (
                        <tr key={s.id}>
                          <td>{new Date(s.createdAt).toLocaleString("id-ID")}</td>
                          <td>{s.cartName}</td>
                          <td><span className="badge">{s.paymentMethod}</span></td>
                          <td><b>{rupiah(s.netTotal)}</b></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="muted">Belum ada transaksi.</div>
                )}
              </>
            )}
          </>
        )}

        {/* ===== TAB: REPORTS (baru) ===== */}
        {tab === "reports" && (
          <>
            <div className="row" style={{ alignItems: "flex-end" }}>
              <div className="col">
                <label>Periode</label>
                <select className="input" value={period} onChange={(e) => setPeriod(e.target.value)}>
                  <option value="day">Per Hari</option>
                  <option value="week">Per Minggu</option>
                </select>
              </div>

              <div className="col">
                <label>Tanggal (WIB)</label>
                <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  {period === "week"
                    ? "Mingguan: sistem akan ambil minggu yang mengandung tanggal ini (Senin–Minggu, WIB)."
                    : "Harian: sesuai tanggal WIB."}
                </div>
              </div>

              <div className="col" style={{ minWidth: 220 }}>
                <button className="btn secondary" onClick={loadPartnerCarts} disabled={cartsLoading}>
                  {cartsLoading ? "Loading..." : "Refresh List Gerobak"}
                </button>
              </div>
            </div>

            {cartsErr && (
              <div className="toast" style={{ background: "#ffecec", borderColor: "#ffbdbd", marginTop: 12 }}>
                {cartsErr}
              </div>
            )}

            <div className="hr" />

            <div style={{ fontWeight: 800, marginBottom: 10 }}>Pilih Gerobak</div>

            {cartsLoading ? (
              <div className="muted">Loading gerobak...</div>
            ) : carts.length === 0 ? (
              <div className="muted">Belum ada gerobak yang bisa diakses.</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {carts.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => openCartReport(c)}
                    style={{
                      textAlign: "left",
                      border: "1px solid #eee",
                      borderRadius: 14,
                      padding: 14,
                      background: "white",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>{c.name}</div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                      Klik untuk lihat laporan
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* ===== MODAL REPORT ===== */}
            {modalOpen && (
              <div
                role="dialog"
                aria-modal="true"
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(0,0,0,0.35)",
                  zIndex: 999,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 16,
                }}
                onClick={() => setModalOpen(false)}
              >
                <div
                  className="card"
                  style={{ width: "min(980px, 96vw)", maxHeight: "88vh", overflow: "auto" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 900 }}>
                        Laporan — {activeCart?.name || "(Gerobak)"}
                      </div>
                      <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                        Periode: <b>{period === "week" ? "Mingguan" : "Harian"}</b> • Date: <b>{date}</b>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
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
                    <div className="toast" style={{ background: "#ffecec", borderColor: "#ffbdbd" }}>
                      {reportErr}
                    </div>
                  )}

                  {reportLoading ? (
                    <div className="muted">Loading report...</div>
                  ) : !report ? (
                    <div className="muted">Tidak ada data report.</div>
                  ) : (
                    <>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
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

                      <div className="row">
                        <div className="col">
                          <div className="card">
                            <div className="muted">Total CASH</div>
                            <div style={{ fontSize: 18 }}><b>{rupiah(report.totals.cash)}</b></div>

                            <div className="muted" style={{ marginTop: 10 }}>Total QRIS</div>
                            <div style={{ fontSize: 18 }}><b>{rupiah(report.totals.qris)}</b></div>

                            <div className="muted" style={{ marginTop: 10 }}>TOTAL</div>
                            <div style={{ fontSize: 22 }}><b>{rupiah(report.totals.total)}</b></div>

                            <div className="muted" style={{ marginTop: 10 }}>
                              Transaksi: <b>{report.totals.transactions}</b>
                            </div>

                            <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
                              Range (WIB logic server):
                              <div>
                                Start:{" "}
                                <b>{report.range.start ? report.range.start.toLocaleString("id-ID") : "-"}</b>
                              </div>
                              <div>
                                End:{" "}
                                <b>{report.range.end ? report.range.end.toLocaleString("id-ID") : "-"}</b>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="col">
                          <div className="card">
                            <div style={{ fontWeight: 800, marginBottom: 8 }}>Top Produk</div>
                            {report.topProducts.length ? (
                              <table className="table">
                                <thead>
                                  <tr>
                                    <th>Produk</th>
                                    <th>Portion</th>
                                    <th>Qty</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {report.topProducts.slice(0, 10).map((p, idx) => (
                                    <tr key={`${p.productId || idx}-${p.portion || ""}-${idx}`}>
                                      <td>{p.productName || p.name || "(Produk)"}</td>
                                      <td><span className="badge">{p.portion || "-"}</span></td>
                                      <td><b>{p.qty ?? p._sum?.qty ?? 0}</b></td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <div className="muted">Belum ada data top produk.</div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="hr" />

                      <div style={{ fontWeight: 800, marginBottom: 8 }}>Daftar Transaksi</div>
                      {report.sales.length ? (
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Waktu</th>
                              <th>Kasir</th>
                              <th>Metode</th>
                              <th>Gross</th>
                              <th>Disc</th>
                              <th>Net</th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.sales.slice(0, 50).map((s) => (
                              <tr key={s.id}>
                                <td>{new Date(s.createdAt).toLocaleString("id-ID")}</td>
                                <td className="muted">{s.cashier || "-"}</td>
                                <td><span className="badge">{s.paymentMethod || "-"}</span></td>
                                <td>{rupiah(s.grossTotal)}</td>
                                <td>{rupiah(s.discount)}</td>
                                <td><b>{rupiah(s.netTotal)}</b></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
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
      </div>
    </div>
  );
}
