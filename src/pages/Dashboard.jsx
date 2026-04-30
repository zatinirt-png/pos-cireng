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

  return `${sign}Rp ${i},${d}`;
}

function safeTime(value) {
  if (!value) return "-";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeCartReportToTodayShape(cartReport, fallbackCartId) {
  const cartId = cartReport?.cart?.id || fallbackCartId || "";
  const cartName = cartReport?.cart?.name || "(Gerobak)";

  const totals = cartReport?.totals || {};
  const cash = Number(totals.cash || 0);
  const qris = Number(totals.qris || 0);
  const total = Number(totals.total || 0);

  const sales = Array.isArray(cartReport?.sales) ? cartReport.sales : [];

  const recentSales = sales.slice(0, 12).map((sale) => ({
    id: sale.id,
    createdAt: sale.createdAt,
    cartId,
    cartName,
    paymentMethod: sale.paymentMethod || "-",
    netTotal: Number(sale.netTotal || 0),
  }));

  const rawPortionTotals = cartReport?.portionTotals || {};

  const portionTotals = {
    small: Number(rawPortionTotals.small || 0),
    large: Number(rawPortionTotals.large || 0),
    total: Number(rawPortionTotals.total || 0),
  };

  return {
    date: cartReport?.date || "",
    startDate: cartReport?.startDate || "",
    endDate: cartReport?.endDate || "",
    range: cartReport?.range || null,
    totalAll: {
      cash,
      qris,
      total,
    },
    perCart: [
      {
        cartId,
        cartName,
        cash,
        qris,
        total,
      },
    ],
    portionTotals,
    topProducts: Array.isArray(cartReport?.topProducts)
      ? cartReport.topProducts
      : [],
    recentSales,
  };
}

function MetricCard({ label, value, note, tone = "neutral" }) {
  return (
    <section className={`adm-panel adm-panel--kpi adm-panel--${tone}`}>
      <div className="adm-kpi-label">{label}</div>
      <div className="adm-kpi-value">{value}</div>
      {note ? <div className="adm-kpi-hint">{note}</div> : null}
    </section>
  );
}

function EmptyRow({ colSpan = 4, children = "Belum ada data." }) {
  return (
    <tr>
      <td colSpan={colSpan} className="muted">
        {children}
      </td>
    </tr>
  );
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

  const [err, setErr] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(false);

  const cartFilterRef = useRef("ALL");
  const startDateRef = useRef(today);
  const endDateRef = useRef(today);
  const didBootRef = useRef(false);

  useEffect(() => {
    cartFilterRef.current = cartFilter;
  }, [cartFilter]);

  useEffect(() => {
    startDateRef.current = startDate;
  }, [startDate]);

  useEffect(() => {
    endDateRef.current = endDate;
  }, [endDate]);

  useEffect(() => {
    if (!token) {
      nav("/admin");
    }
  }, [token, nav]);

  async function loadCarts({ silent = true } = {}) {
    try {
      const response = await apiGet("/api/admin/carts", token);
      const list = Array.isArray(response?.carts) ? response.carts : [];

      setCarts(list);
    } catch (error) {
      if (!silent) {
        setErr(error?.message || "Gagal mengambil daftar gerobak.");
      }
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
      const query = buildRangeQuery(sd, ed);

      if (cid === "ALL") {
        const response = await apiGet(`/api/reports/today${query}`, token);
        setReport(response);
      } else {
        const response = await apiGet(`/api/reports/cart/${cid}${query}`, token);
        setReport(normalizeCartReportToTodayShape(response, cid));
      }

      setUpdatedAt(new Date());
    } catch (error) {
      setErr(error?.message || "Gagal mengambil report.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    if (didBootRef.current) return;

    didBootRef.current = true;

    loadCarts({ silent: true });
    load({
      silent: false,
      fromDate: today,
      toDate: today,
    });

    connectSocket(token);

    const onInvalidate = () => {
      load({ silent: true });
    };

    socket.on("reports:invalidate", onInvalidate);

    const interval = setInterval(() => {
      load({ silent: true });
    }, 15000);

    return () => {
      clearInterval(interval);
      socket.off("reports:invalidate", onInvalidate);
      disconnectSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token || !didBootRef.current) return;

    load({
      silent: false,
      fromDate: startDate,
      toDate: endDate,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  const cartOptions = useMemo(() => {
    const activeCarts = (carts || []).filter((cart) => {
      return (cart.isActive ?? true) !== false;
    });

    if (activeCarts.length) {
      return activeCarts.map((cart) => ({
        id: cart.id,
        name: cart.name,
      }));
    }

    const perCart = Array.isArray(report?.perCart) ? report.perCart : [];

    return perCart.map((cart) => ({
      id: cart.cartId,
      name: cart.cartName,
    }));
  }, [carts, report]);

  const cartLabel = useMemo(() => {
    if (cartFilter === "ALL") return "Semua Gerobak";

    const fromList = cartOptions.find((cart) => cart.id === cartFilter)?.name;
    if (fromList) return fromList;

    const firstCart = Array.isArray(report?.perCart) ? report.perCart[0] : null;
    return firstCart?.cartName || "(Gerobak)";
  }, [cartFilter, cartOptions, report]);

  const totalAll = useMemo(() => {
    if (!report) {
      return {
        total: 0,
        cash: 0,
        qris: 0,
      };
    }

    if (report.totalAll) {
      return {
        total: Number(report.totalAll.total || 0),
        cash: Number(report.totalAll.cash || 0),
        qris: Number(report.totalAll.qris || 0),
      };
    }

    const perCart = Array.isArray(report.perCart) ? report.perCart : [];

    const cash = perCart.reduce((sum, row) => sum + Number(row.cash || 0), 0);
    const qris = perCart.reduce((sum, row) => sum + Number(row.qris || 0), 0);

    return {
      total: cash + qris,
      cash,
      qris,
    };
  }, [report]);

  const sortedPerCart = useMemo(() => {
    const rows = Array.isArray(report?.perCart) ? [...report.perCart] : [];

    rows.sort((a, b) => Number(b.total || 0) - Number(a.total || 0));

    return rows;
  }, [report]);

  const portionTotals = useMemo(() => {
    const raw = report?.portionTotals || {};

    return {
      small: Number(raw.small || 0),
      large: Number(raw.large || 0),
      total: Number(raw.total || 0),
    };
  }, [report]);

  const topProducts = useMemo(() => {
    return Array.isArray(report?.topProducts) ? report.topProducts.slice(0, 8) : [];
  }, [report]);

  const recentSales = useMemo(() => {
    return Array.isArray(report?.recentSales) ? report.recentSales.slice(0, 12) : [];
  }, [report]);

  const activeRangeLabel = formatRangeLabel(
    report?.startDate || startDate,
    report?.endDate || endDate
  );

  const updatedText = updatedAt
    ? updatedAt.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

  async function handleCartChange(event) {
    const value = event.target.value;

    setCartFilter(value);
    cartFilterRef.current = value;

    await load({
      cartId: value,
      fromDate: startDate,
      toDate: endDate,
      silent: false,
    });
  }

  function handleTodayRange() {
    const now = ymdWib();

    setStartDate(now);
    setEndDate(now);
  }

  function logout() {
    localStorage.removeItem("admin_token");
    disconnectSocket();
    nav("/");
  }

  return (
    <main className="adm-bg adm">
      <div className="adm-shell">
        <section className="adm-main-card">
          <div className="adm-header">
            <div>
              <h2 className="adm-h2">Dashboard Admin</h2>

              <div className="adm-subline">
                <span>
                  Rentang: <b>{activeRangeLabel}</b>
                </span>
                <span className="adm-dot">•</span>
                <span>
                  Gerobak: <b>{cartLabel}</b>
                </span>
                <span className="adm-dot">•</span>
                <span>
                  Update: <b>{updatedText}</b>
                </span>
              </div>
            </div>

            <div className="adm-actions">
              <button
                className="btn secondary"
                type="button"
                onClick={() => nav("/admin/reports")}
              >
                Laporan
              </button>

              <button
                className="btn secondary"
                type="button"
                onClick={() => nav("/admin/inventory")}
              >
                Stok
              </button>

              <button className="btn secondary" type="button" onClick={logout}>
                Logout
              </button>
            </div>
          </div>

          <div className="hr" />

          <section className="adm-panel">
            <div className="adm-panel-head">
              <div>
                <h3 className="adm-h3">Filter Report</h3>
                <div className="card-subtitle">
                  Pilih gerobak dan rentang tanggal untuk melihat performa.
                </div>
              </div>

              {loading ? (
                <span className="loading-inline muted">
                  <span className="spinner spinner--sm" aria-hidden="true" />
                  Memuat data
                </span>
              ) : null}
            </div>

            <div className="adm-form-grid" style={{ marginTop: 12 }}>
              <div className="adm-field">
                <label htmlFor="dashboard-cart">Gerobak</label>
                <select
                  id="dashboard-cart"
                  className="input"
                  value={cartFilter}
                  onChange={handleCartChange}
                  disabled={loading}
                >
                  <option value="ALL">Semua Gerobak</option>

                  {cartOptions.map((cart) => (
                    <option key={cart.id} value={cart.id}>
                      {cart.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="adm-field">
                <label htmlFor="dashboard-start-date">Dari Tanggal</label>
                <input
                  id="dashboard-start-date"
                  className="input"
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="adm-field">
                <label htmlFor="dashboard-end-date">Sampai Tanggal</label>
                <input
                  id="dashboard-end-date"
                  className="input"
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="adm-field">
                <label>&nbsp;</label>

                <div className="adm-actions">
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={handleTodayRange}
                    disabled={loading}
                  >
                    Hari Ini
                  </button>

                  <button
                    className="btn"
                    type="button"
                    onClick={() => load({ silent: false })}
                    disabled={loading}
                  >
                    Refresh
                  </button>
                </div>
              </div>
            </div>
          </section>

          {err ? (
            <div className="adm-alert" role="alert" aria-live="polite" style={{ marginTop: 14 }}>
              {err}
            </div>
          ) : null}

          <div className="adm-panels">
            <MetricCard
              label="Total Omzet"
              value={rupiah(totalAll.total)}
              note="Akumulasi dari cash dan QRIS."
              tone="primary"
            />

            <MetricCard
              label="Cash"
              value={rupiah(totalAll.cash)}
              note="Pembayaran tunai."
              tone="neutral"
            />

            <MetricCard
              label="QRIS"
              value={rupiah(totalAll.qris)}
              note="Pembayaran non-tunai."
              tone="neutral"
            />

            <MetricCard
              label="Total Porsi"
              value={portionTotals.total}
              note={`Reguler ${portionTotals.small} • Jumbo ${portionTotals.large}`}
              tone="neutral"
            />
          </div>

          <div className="adm-panels">
            <section className="adm-panel">
              <div className="adm-panel-head">
                <div>
                  <h3 className="adm-h3">
                    {cartFilter === "ALL" ? "Omzet per Gerobak" : "Omzet Gerobak"}
                  </h3>
                  <div className="card-subtitle">
                    {cartFilter === "ALL" ? "Diurutkan dari omzet terbesar." : cartLabel}
                  </div>
                </div>
              </div>

              <div className="adm-table-wrap" style={{ marginTop: 12 }}>
                <table className="table adm-table table--mobile">
                  <thead>
                    <tr>
                      <th>Gerobak</th>
                      <th>Cash</th>
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
                        <td data-label="Cash">{rupiah(row.cash)}</td>
                        <td data-label="QRIS">{rupiah(row.qris)}</td>
                        <td data-label="Total">
                          <b>{rupiah(row.total)}</b>
                        </td>
                      </tr>
                    ))}

                    {!sortedPerCart.length ? (
                      <EmptyRow colSpan={4}>Belum ada omzet pada rentang ini.</EmptyRow>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="adm-panel">
              <div className="adm-panel-head">
                <div>
                  <h3 className="adm-h3">Top Produk</h3>
                  <div className="card-subtitle">Produk paling banyak terjual.</div>
                </div>
              </div>

              <div className="adm-table-wrap" style={{ marginTop: 12 }}>
                <table className="table adm-table table--mobile">
                  <thead>
                    <tr>
                      <th>Produk</th>
                      <th style={{ width: 120 }}>Qty</th>
                    </tr>
                  </thead>

                  <tbody>
                    {topProducts.map((product, index) => {
                      const name = product.productName || product.name || "(Produk)";
                      const portion = product.portion ? ` (${product.portion})` : "";
                      const qty = Number(product.qty || 0);

                      return (
                        <tr key={`${product.productId || name}-${product.portion || index}`}>
                          <td data-label="Produk">
                            <b>{name}</b>
                            {portion ? <span className="muted">{portion}</span> : null}
                          </td>
                          <td data-label="Qty">
                            <b>{qty}</b>
                          </td>
                        </tr>
                      );
                    })}

                    {!topProducts.length ? (
                      <EmptyRow colSpan={2}>Belum ada produk terjual.</EmptyRow>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section className="adm-panel" style={{ marginTop: 14 }}>
            <div className="adm-panel-head">
              <div>
                <h3 className="adm-h3">Transaksi Terbaru</h3>
                <div className="card-subtitle">Menampilkan maksimal 12 transaksi terakhir.</div>
              </div>

              <button
                className="btn secondary btn--sm"
                type="button"
                onClick={() => nav("/admin/reports")}
              >
                Lihat Laporan
              </button>
            </div>

            <div className="adm-table-wrap" style={{ marginTop: 12 }}>
              <table className="table adm-table table--mobile">
                <thead>
                  <tr>
                    <th>Waktu</th>
                    <th>Gerobak</th>
                    <th>Metode</th>
                    <th>Total</th>
                  </tr>
                </thead>

                <tbody>
                  {recentSales.map((sale) => {
                    const method = String(sale.paymentMethod || sale.method || "-")
                      .toUpperCase()
                      .trim();

                    const badgeClass =
                      method === "QRIS"
                        ? "adm-badge adm-badge--qris"
                        : method === "CASH"
                        ? "adm-badge adm-badge--cash"
                        : "adm-badge";

                    return (
                      <tr key={sale.id}>
                        <td data-label="Waktu">{safeTime(sale.createdAt)}</td>
                        <td data-label="Gerobak">{sale.cartName || "-"}</td>
                        <td data-label="Metode">
                          <span className={badgeClass}>{method || "-"}</span>
                        </td>
                        <td data-label="Total">
                          <b>{rupiah(sale.netTotal)}</b>
                        </td>
                      </tr>
                    );
                  })}

                  {!recentSales.length ? (
                    <EmptyRow colSpan={4}>Belum ada transaksi.</EmptyRow>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}