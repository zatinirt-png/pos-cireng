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
  const token = localStorage.getItem("admin_token") || localStorage.getItem("auth_token");

  const [carts, setCarts] = useState([]);
  const [period, setPeriod] = useState("day"); // day | week
  const [date, setDate] = useState(ymdWib());
  const [activeCartId, setActiveCartId] = useState("");
  const [report, setReport] = useState(null);

  const [loadingCarts, setLoadingCarts] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!token) nav("/admin");
  }, [token, nav]);

  async function loadCarts() {
    setErr("");
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
    setLoadingReport(true);
    try {
      const qs = `?period=${encodeURIComponent(period)}&date=${encodeURIComponent(date)}`;
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

  // ✅ FIX: export pakai fetch + Authorization header (bukan window.open)
  async function exportCsv() {
    if (!activeCartId) return;
    setErr("");
    try {
      const qs = `?period=${encodeURIComponent(period)}&date=${encodeURIComponent(date)}`;
      const fallback = `report_${activeCartId}_${period}_${date}.csv`;
      await downloadWithAuth(`/api/reports/cart/${activeCartId}/export.csv${qs}`, token, fallback);
    } catch (e) {
      setErr(e?.message || "Gagal export CSV");
    }
  }

  async function exportPdf() {
    if (!activeCartId) return;
    setErr("");
    try {
      const qs = `?period=${encodeURIComponent(period)}&date=${encodeURIComponent(date)}`;
      const fallback = `report_${activeCartId}_${period}_${date}.pdf`;
      await downloadWithAuth(`/api/reports/cart/${activeCartId}/export.pdf${qs}`, token, fallback);
    } catch (e) {
      setErr(e?.message || "Gagal export PDF");
    }
  }

  return (
    <div className="container">
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <h2 style={{ margin: 0 }}>Laporan (Admin)</h2>
            <div className="muted">Pilih gerobak → lihat laporan harian / mingguan → export PDF / CSV.</div>
          </div>
          <button className="btn secondary" onClick={() => nav("/admin/dashboard")}>Kembali</button>
        </div>

        {err ? (
          <div className="toast" style={{ background: "#ffecec", borderColor: "#ffbdbd", marginTop: 12 }}>
            {err}
          </div>
        ) : null}

        <div className="hr" />

        <div className="row" style={{ alignItems: "end" }}>
          <div className="col">
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
            {loadingCarts ? <div className="muted" style={{ marginTop: 6 }}>Loading carts...</div> : null}
          </div>

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
          </div>

          <div className="col" style={{ display: "flex", gap: 8 }}>
            <button className="btn secondary" onClick={() => loadReport(activeCartId)} disabled={!activeCartId || loadingReport}>
              {loadingReport ? "Loading..." : "Refresh"}
            </button>
            <button className="btn" onClick={exportCsv} disabled={!activeCartId}>Export CSV</button>
            <button className="btn" onClick={exportPdf} disabled={!activeCartId}>Export PDF</button>
          </div>
        </div>

        <div className="hr" />

        {!report ? (
          <div className="muted">Belum ada data laporan.</div>
        ) : (
          <>
            <div className="row">
              <div className="col">
                <div className="card">
                  <div className="muted">Gerobak</div>
                  <div><b>{selectedCart?.name || report?.cart?.name || "-"}</b></div>
                  <div className="muted" style={{ marginTop: 10 }}>Periode</div>
                  <div><b>{String(report.period || period).toUpperCase()}</b></div>
                  <div className="muted" style={{ marginTop: 10 }}>Tanggal (WIB)</div>
                  <div><b>{report.date || date}</b></div>
                </div>
              </div>

              <div className="col">
                <div className="card">
                  <div className="muted">Total CASH</div>
                  <div><b>{report.totals?.cash ?? report.totalAll?.cash ?? 0}</b></div>
                  <div className="muted" style={{ marginTop: 10 }}>Total QRIS</div>
                  <div><b>{report.totals?.qris ?? report.totalAll?.qris ?? 0}</b></div>
                  <div className="muted" style={{ marginTop: 10 }}>Total</div>
                  <div style={{ fontSize: 18 }}><b>{report.totals?.total ?? report.totalAll?.total ?? 0}</b></div>
                </div>
              </div>

              <div className="col">
                <div className="card">
                  <div className="muted">Jumlah Transaksi</div>
                  <div style={{ fontSize: 18 }}><b>{report.totals?.transactions ?? report.sales?.length ?? 0}</b></div>
                  <div className="muted" style={{ marginTop: 10 }}>Top Produk (10)</div>
                  <div className="muted">{(report.topProducts || []).length ? "" : "Belum ada."}</div>
                  <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                    {(report.topProducts || []).slice(0, 10).map((p) => (
                      <li key={`${p.productId}_${p.portion}`}>
                        {p.productName} [{p.portion}] = <b>{p.qty}</b>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="hr" />

            <h3 style={{ marginTop: 0 }}>Transaksi</h3>
            {(report.sales || []).length ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Waktu</th>
                    <th>Metode</th>
                    <th>Gross</th>
                    <th>Diskon</th>
                    <th>Net</th>
                    <th>Kasir</th>
                  </tr>
                </thead>
                <tbody>
                  {report.sales.slice(0, 20).map((s) => (
                    <tr key={s.id}>
                      <td>{new Date(s.createdAt).toLocaleString("id-ID")}</td>
                      <td><span className="badge">{s.paymentMethod || "-"}</span></td>
                      <td>{s.grossTotal}</td>
                      <td>{s.discount}</td>
                      <td><b>{s.netTotal}</b></td>
                      <td className="muted">{s.cashier || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="muted">Belum ada transaksi di periode ini.</div>
            )}

            {(report.sales || []).length > 20 ? (
              <div className="muted" style={{ marginTop: 10 }}>
                Menampilkan 20 terbaru dari {report.sales.length} transaksi.
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
