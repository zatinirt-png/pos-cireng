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

  async function load() {
    setErr("");
    try {
      const r = await apiGet("/api/reports/today", token);
      setReport(r);
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

    // optional: log connect status (hapus kalau tidak perlu)
    // socket.on("connect", () => console.log("socket connected", socket.id));
    // socket.on("disconnect", () => console.log("socket disconnected"));

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

  return (
    <div className="container">
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ margin: 0 }}>Live Report</h2>
            <div className="muted">Tanggal: {formatDateWIB(report?.date) || "-"}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn secondary" onClick={() => nav("/admin/products")}>Menu</button>
            <button className="btn secondary" onClick={() => nav("/admin/promos")}>Promo</button>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn secondary" onClick={() => nav("/admin/users")}>User Management</button>
              <button className="btn secondary" onClick={() => nav("/admin/carts")}>
                Kelola Gerobak
              </button>

              <button className="btn secondary" onClick={logout}>Logout</button>
            </div>

          </div>

        </div>

        {err && (
          <div className="toast" style={{ background: "#ffecec", borderColor: "#ffbdbd", marginTop: 12 }}>
            {err}
          </div>
        )}

        <div className="hr" />

        <div className="row">
          <div className="col">
            <div className="card">
              <div className="muted">Total Omzet</div>
              <div style={{ fontSize: 26 }}><b>{rupiah(totalAll.total)}</b></div>
              <div className="muted" style={{ marginTop: 6 }}>
                CASH: <b>{rupiah(totalAll.cash)}</b> - QRIS: <b>{rupiah(totalAll.qris)}</b>
              </div>
              <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
                *Dashboard update otomatis saat transaksi masuk.
              </div>
            </div>
          </div>

          <div className="col">
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Omzet per Gerobak</h3>
              <table className="table" style={{ marginTop: 8 }}>
                <thead>
                  <tr>
                    <th>Gerobak</th>
                    <th>CASH</th>
                    <th>QRIS</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPerCart.map(row => (
                    <tr key={row.cartId}>
                      <td><b>{row.cartName}</b></td>
                      <td>{rupiah(row.cash)}</td>
                      <td>{rupiah(row.qris)}</td>
                      <td><b>{rupiah(row.total)}</b></td>
                    </tr>
                  ))}
                  {!sortedPerCart.length && (
                    <tr><td colSpan={4} className="muted">Belum ada data.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="hr" />

        <div className="row">
          <div className="col">
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Top Produk Hari Ini</h3>
              {report?.topProducts?.length ? (
                <table className="table">
                  <thead>
                    <tr><th>Produk</th><th>Qty</th></tr>
                  </thead>
                  <tbody>
                    {report.topProducts.slice(0, 8).map(tp => (
                      <tr key={`${tp.productId}-${tp.portion || ""}`}>
                        <td>
                          {tp.productName || tp.name || "(Produk)"}
                          {tp.portion ? <span className="muted"> ({tp.portion})</span> : null}
                        </td>
                        <td><b>{tp.qty}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="muted">Belum ada penjualan.</div>
              )}
            </div>
          </div>

          <div className="col">
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Transaksi Terbaru</h3>
              {report?.recentSales?.length ? (
                <table className="table">
                  <thead>
                    <tr><th>Waktu</th><th>Gerobak</th><th>Metode</th><th>Total</th></tr>
                  </thead>
                  <tbody>
                    {report.recentSales.slice(0, 12).map(s => (
                      <tr key={s.id}>
                        <td>{new Date(s.createdAt).toLocaleTimeString("id-ID")}</td>
                        <td>{s.cartName}</td>
                        <td><span className="badge">{s.paymentMethod || s.method || "-"}</span></td>
                        <td><b>{rupiah(s.netTotal)}</b></td>
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

      </div>
    </div>
  );
}
