import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost } from "../api";
import { useNavigate } from "react-router-dom";
import LoadingScreen from "../components/ui/LoadingScreen";

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

function normName(s) {
  return String(s || "").trim();
}

export default function CashierPOS() {
  const nav = useNavigate();

  const token = localStorage.getItem("cashier_token");
  const cartName = localStorage.getItem("cashier_cartName") || "Gerobak";

  // ===== META SYNC =====
  const [meta, setMeta] = useState(null);
  const [metaSyncAt, setMetaSyncAt] = useState(null);
  const [metaSyncErr, setMetaSyncErr] = useState("");
  const metaSigRef = useRef("");

  function computeMetaSig(metaObj) {
    const products = (metaObj?.products || [])
      .map((p) => `${p.id}:${p.priceSmall}:${p.priceLarge}:${p.isActive ?? ""}`)
      .join("|");
    const promos = (metaObj?.promos || [])
      .map(
        (p) =>
          `${p.id}:${p.type}:${p.isActive}:${p.discountPercent}:${p.bonusProductId}:${p.bonusQty}:${p.startAt}:${p.endAt}`
      )
      .join("|");
    return `p=${products}__r=${promos}`;
  }

  async function loadMeta({ silent = false } = {}) {
    try {
      const metaRes = await apiGet("/api/meta");
      setMeta(metaRes);
      setMetaSyncAt(new Date());
      setMetaSyncErr("");

      const sig = computeMetaSig(metaRes);
      if (metaSigRef.current && metaSigRef.current !== sig) {
        setMsg("Menu / promo diperbarui dari Admin.");
      }
      metaSigRef.current = sig;
    } catch (e) {
      const em = e?.message || "Gagal sync meta";
      setMetaSyncErr(em);
      if (!silent) setErr(em);
    }
  }

  // ===== SHIFT + CASH =====
  const [shift, setShift] = useState(null);
  const [openingCash, setOpeningCash] = useState(0);
  const [closingCash, setClosingCash] = useState(0);
  const [summary, setSummary] = useState(null);
  const [movements, setMovements] = useState([]);
  const [cashMoveType, setCashMoveType] = useState("CASH_OUT");
  const [cashMoveAmount, setCashMoveAmount] = useState(0);
  const [cashMoveNote, setCashMoveNote] = useState("");

  // ===== CART + SALE =====
  const [cart, setCart] = useState([]);
  const [promoIds, setPromoIds] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [note, setNote] = useState("");

  // ===== QUEUE =====
  const [customerName, setCustomerName] = useState("");
  const [queue, setQueue] = useState([]);
  const [qErr, setQErr] = useState("");
  const [qLoading, setQLoading] = useState(false);

  // ===== MODAL ORDER =====
  const [openOrder, setOpenOrder] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [checkout, setCheckout] = useState({
    manualDiscount: 0,
    paymentMethod: "CASH",
    note: "",
    promoIds: [],
  });

  // ===== UI MSG/ERR =====
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // ===== BOOT LOADING =====
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    if (!token) nav("/cashier");
  }, [token, nav]);

  async function load({ boot = false } = {}) {
    setErr("");
    setMsg("");
    if (boot) setBooting(true);

    try {
      const [metaRes, shiftRes] = await Promise.all([
        apiGet("/api/meta"),
        apiGet("/api/shifts/current", token),
      ]);

      setMeta(metaRes);
      setMetaSyncAt(new Date());
      setMetaSyncErr("");
      metaSigRef.current = computeMetaSig(metaRes);

      setShift(shiftRes.shift);

      if (shiftRes.shift) {
        const [sumRes, mvRes] = await Promise.all([
          apiGet("/api/shifts/summary", token),
          apiGet("/api/cash/movements", token),
        ]);
        setSummary(sumRes.summary);
        setMovements(mvRes.movements);
      } else {
        setSummary(null);
        setMovements([]);
      }
    } catch (e) {
      setErr("Sync error: " + (e?.message || String(e)));
    } finally {
      if (boot) setBooting(false);
    }
  }

  // ===== QUEUE LOAD =====
  async function loadQueue() {
    if (!token) return;
    setQErr("");
    setQLoading(true);
    try {
      const r = await apiGet("/api/orders/queue", token);
      setQueue(r.orders || []);
    } catch (e) {
      setQErr(e?.message || "Gagal load antrian");
    } finally {
      setQLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    loadQueue();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") loadQueue();
    }, 2500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token) return;
    load({ boot: true });

    const t = setInterval(() => {
      if (document.visibilityState === "visible") loadMeta({ silent: true });
    }, 30000);

    const onVis = () => {
      if (document.visibilityState === "visible") loadMeta({ silent: true });
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ===== CALC =====
  const grossTotal = useMemo(
    () => cart.reduce((sum, it) => sum + it.price * it.qty, 0),
    [cart]
  );

  const promoDiscount = useMemo(() => {
    const promos = meta?.promos || [];
    if (!promos.length || !promoIds.length) return 0;

    let disc = 0;
    for (const id of promoIds) {
      const p = promos.find((x) => x.id === id);
      if (!p) continue;
      if (p.type === "DISCOUNT_PERCENT") {
        const pct = Number(p.discountPercent || 0);
        if (pct > 0) disc += Math.floor((grossTotal * pct) / 100);
      }
    }
    return disc;
  }, [meta, promoIds, grossTotal]);

  const totalDiscount = useMemo(
    () => Number(discount || 0) + promoDiscount,
    [discount, promoDiscount]
  );

  const netTotal = useMemo(
    () => Math.max(0, grossTotal - totalDiscount),
    [grossTotal, totalDiscount]
  );

  // ===== CART OPS =====
  function addProduct(p, portion) {
    setMsg("");
    setErr("");
    const unitPrice = portion === "LARGE" ? p.priceLarge : p.priceSmall;
    const key = `${p.id}:${portion}`;

    setCart((prev) => {
      const found = prev.find((x) => x.key === key);
      if (found)
        return prev.map((x) => (x.key === key ? { ...x, qty: x.qty + 1 } : x));
      return [
        ...prev,
        {
          key,
          productId: p.id,
          portion,
          name: p.name,
          price: unitPrice,
          qty: 1,
          itemNote: "",
        },
      ];
    });
  }

  function updateQty(key, delta) {
    setCart((prev) =>
      prev.map((x) =>
        x.key === key ? { ...x, qty: Math.max(1, x.qty + delta) } : x
      )
    );
  }

  function removeItem(key) {
    setCart((prev) => prev.filter((x) => x.key !== key));
  }

  function togglePromo(id) {
    setPromoIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  // ===== SHIFT OPS =====
  async function openShift() {
    setErr("");
    setMsg("");
    try {
      const res = await apiPost("/api/shifts/open", { openingCash }, token);
      setShift(res.shift);

      const sum = await apiGet("/api/shifts/summary", token);
      setSummary(sum.summary);
      setMovements([]);

      setMsg("Shift dibuka.");
    } catch (e) {
      setErr(e?.message || "Gagal buka shift");
    }
  }

  async function closeShift() {
    setErr("");
    setMsg("");
    try {
      const closing = Number(closingCash || 0);
      if (!Number.isFinite(closing) || closing < 0)
        throw new Error("Kas fisik saat tutup tidak valid.");

      const expected = summary?.expectedCash ?? null;
      const variance = expected == null ? null : closing - expected;

      await apiPost("/api/shifts/close", { closingCash: closing }, token);

      setShift(null);
      setCart([]);
      setPromoIds([]);
      setDiscount(0);
      setPaymentMethod("CASH");
      setNote("");
      setClosingCash(0);

      setSummary(null);
      setMovements([]);

      if (expected == null) {
        setMsg("Shift ditutup.");
      } else {
        const label = variance === 0 ? "PAS" : variance > 0 ? "LEBIH" : "KURANG";
        setMsg(
          "Shift ditutup. Expected: " +
            rupiah(expected) +
            " | Closing: " +
            rupiah(closing) +
            " | Selisih: " +
            rupiah(Math.abs(variance)) +
            " (" +
            label +
            ")"
        );
      }
    } catch (e) {
      setErr(e?.message || "Gagal tutup shift");
    }
  }

  async function submitSale() {
    setErr("");
    setMsg("");
    try {
      if (!shift) throw new Error("Buka shift dulu.");
      if (cart.length === 0) throw new Error("Keranjang kosong.");

      const payload = {
        items: cart.map((x) => ({
          productId: x.productId,
          portion: x.portion,
          qty: x.qty,
          itemNote: x.itemNote,
        })),
        discount: Number(discount || 0),
        manualDiscount: Number(discount || 0),
        promoIds,
        paymentMethod,
        note,
      };

      const res = await apiPost("/api/sales", payload, token);

      try {
        const sum = await apiGet("/api/shifts/summary", token);
        setSummary(sum.summary);
      } catch (_) {}

      setMsg("Transaksi sukses. ID: " + res.saleId + " | Total: " + rupiah(res.netTotal));

      setCart([]);
      setPromoIds([]);
      setDiscount(0);
      setPaymentMethod("CASH");
      setNote("");
    } catch (e) {
      setErr(e?.message || "Gagal simpan transaksi");
    }
  }

  async function enqueueOrder() {
    setErr("");
    setMsg("");
    try {
      if (!shift) throw new Error("Buka shift dulu sebelum buat antrian.");
      if (cart.length === 0) throw new Error("Keranjang kosong.");
      const cn = normName(customerName);
      if (!cn) throw new Error("Nama pelanggan wajib diisi.");

      const dup = (queue || []).some(
        (q) => String(q.customerName || "").trim().toLowerCase() === cn.toLowerCase()
      );
      if (dup) throw new Error("Nama pelanggan sudah ada di antrian.");

      const payload = {
        customerName: cn,
        note: note || null,
        items: cart.map((x) => ({
          productId: x.productId,
          portion: x.portion,
          qty: x.qty,
          itemNote: x.itemNote,
        })),
      };

      await apiPost("/api/orders", payload, token);

      setCart([]);
      setPromoIds([]);
      setDiscount(0);
      setPaymentMethod("CASH");
      setNote("");
      setCustomerName("");

      setMsg("Order masuk antrian.");
      await loadQueue();
    } catch (e) {
      setErr(e?.message || "Gagal tambah antrian");
    }
  }

  function toggleCheckoutPromo(id) {
    setCheckout((prev) => ({
      ...prev,
      promoIds: prev.promoIds.includes(id)
        ? prev.promoIds.filter((x) => x !== id)
        : [...prev.promoIds, id],
    }));
  }

  const checkoutPromoDiscount = useMemo(() => {
    if (!openOrder) return 0;
    const gross = Number(openOrder.grossTotal || 0);
    const promos = meta?.promos || [];
    const ids = checkout.promoIds || [];
    if (!promos.length || !ids.length) return 0;

    let disc = 0;
    for (const id of ids) {
      const p = promos.find((x) => x.id === id);
      if (!p) continue;
      if (p.type === "DISCOUNT_PERCENT") {
        const pct = Number(p.discountPercent || 0);
        if (pct > 0) disc += Math.floor((gross * pct) / 100);
      }
    }
    return disc;
  }, [openOrder, meta, checkout.promoIds]);

  const checkoutNetTotal = useMemo(() => {
    if (!openOrder) return 0;
    const gross = Number(openOrder.grossTotal || 0);
    const md = Number(checkout.manualDiscount || 0);
    const totalDisc = md + checkoutPromoDiscount;
    return Math.max(0, gross - totalDisc);
  }, [openOrder, checkout.manualDiscount, checkoutPromoDiscount]);

  async function openOrderModal(orderId) {
    setErr("");
    setMsg("");
    try {
      const r = await apiGet(`/api/orders/${orderId}`, token);
      setOpenOrder(r.order);
      setCheckout({
        manualDiscount: 0,
        paymentMethod: "CASH",
        note: r.order?.note || "",
        promoIds: [],
      });
      setModalOpen(true);
    } catch (e) {
      setErr(e?.message || "Gagal buka order");
    }
  }

  async function cancelOrder(orderId) {
    setErr("");
    setMsg("");
    try {
      await apiPost(`/api/orders/${orderId}/cancel`, {}, token);
      setMsg("Order dibatalkan.");
      await loadQueue();
      if (modalOpen) {
        setModalOpen(false);
        setOpenOrder(null);
      }
    } catch (e) {
      setErr(e?.message || "Gagal cancel order");
    }
  }

  async function checkoutOrder(orderId) {
    setErr("");
    setMsg("");
    try {
      if (!shift) throw new Error("Shift belum OPEN.");

      const payload = {
        manualDiscount: Number(checkout.manualDiscount || 0),
        paymentMethod: checkout.paymentMethod === "QRIS" ? "QRIS" : "CASH",
        note: checkout.note || null,
        promoIds: checkout.promoIds || [],
      };

      const res = await apiPost(`/api/orders/${orderId}/checkout`, payload, token);

      try {
        const [sum, mv] = await Promise.all([
          apiGet("/api/shifts/summary", token),
          apiGet("/api/cash/movements", token),
        ]);
        setSummary(sum.summary);
        setMovements(mv.movements);
      } catch (_) {}

      setMsg("Checkout sukses. ID: " + res.saleId + " | Total: " + rupiah(res.netTotal));

      setModalOpen(false);
      setOpenOrder(null);
      await loadQueue();
    } catch (e) {
      setErr(e?.message || "Gagal checkout order");
    }
  }

  function logout() {
    localStorage.removeItem("cashier_token");
    localStorage.removeItem("cashier_cartId");
    localStorage.removeItem("cashier_cartName");
    nav("/cashier");
  }

  async function submitCashMovement() {
    setErr("");
    setMsg("");
    try {
      if (!shift) throw new Error("Buka shift dulu.");
      const payload = {
        type: cashMoveType,
        amount: Number(cashMoveAmount || 0),
        note: cashMoveNote,
      };
      await apiPost("/api/cash/movements", payload, token);

      const [mv, sum] = await Promise.all([
        apiGet("/api/cash/movements", token),
        apiGet("/api/shifts/summary", token),
      ]);
      setMovements(mv.movements);
      setSummary(sum.summary);

      setCashMoveAmount(0);
      setCashMoveNote("");
      setMsg("Cash movement tersimpan.");
    } catch (e) {
      setErr(e?.message || "Gagal simpan cash movement");
    }
  }

  // ===== LOADER =====
  if (!token) {
    return (
      <LoadingScreen
        title="Mengalihkan ke Login Kasir…"
        subtitle="Token tidak ditemukan."
        hint="Silakan login untuk melanjutkan."
        tone="neutral"
      />
    );
  }
  if (booting) {
    return (
      <LoadingScreen
        title="Menyiapkan Mode Kasir…"
        subtitle="Sinkronisasi menu, promo, dan shift."
        hint="Biasanya hanya beberapa detik."
        tone="accent"
      />
    );
  }

  const syncText = metaSyncAt ? metaSyncAt.toLocaleTimeString("id-ID") : "-";

  return (
    <div className="pos-bg">
      <div className="pos-shell">
        <div className="pos-stack">
          {/* HEADER */}
          <div className="pos-card pos-header">
            <div className="pos-header-row">
              <div className="pos-title-wrap">
                <h2 className="pos-title">{cartName}</h2>
                <div className="pos-chips">
                  {shift ? (
                    <span className="pill pill--ok">Shift OPEN</span>
                  ) : (
                    <span className="pill pill--neutral">Shift CLOSED</span>
                  )}
                  
                  <span className="pill pill--soft">
                    Antrian <b>{queue?.length || 0}</b>
                  </span>
                </div>
              </div>

              <div className="pos-header-actions">
                
              </div>
            </div>

            {err && (
              <div className="toast toast--danger" style={{ marginTop: 12 }}>
                {err}
              </div>
            )}
            {msg && (
              <div className="toast" style={{ marginTop: 12 }}>
                {msg}
              </div>
            )}
          </div>

          {/* GRID */}
          <div className="pos-grid">
            {/* LEFT */}
            <div className="pos-col">
              <div className="pos-card">
                {!shift ? (
                  <div className="pos-section">
                    <div className="pos-section-head">
                      <h3 className="pos-h3">Buka Shift</h3>
                      <span className="muted">Mulai transaksi setelah shift OPEN</span>
                    </div>

                    <div className="pos-form">
                      <div className="pos-field">
                        <label>Modal kas awal (Rp)</label>
                        <input
                          className="input"
                          type="number"
                          value={openingCash}
                          onChange={(e) => setOpeningCash(e.target.value)}
                        />
                      </div>

                      <div className="pos-actions">
                        <button className="btn" type="button" onClick={openShift}>
                          Buka Shift
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* PROMO */}
                    <div className="pos-section">
                      <div className="pos-section-head">
                        <h3 className="pos-h3">Promo</h3>
                        <span className="muted">Pilih promo untuk transaksi langsung / checkout antrian</span>
                      </div>

                      <div className="grid-products">
                        {(meta?.promos || []).map((p) => {
                          const active = promoIds.includes(p.id);
                          return (
                            <div
                              key={p.id}
                              className={`prod ${p.isActive === false ? "prod--disabled" : ""}`}
                            >
                              <div className="prod-head">
                                <b className="prod-title">{p.name}</b>
                                {active ? <span className="pill pill--ok">Dipakai</span> : <span className="pill pill--neutral">Opsional</span>}
                              </div>

                              <small className="muted">
                                {p.type === "DISCOUNT_PERCENT"
                                  ? `Diskon ${p.discountPercent || 0}% (Min ${rupiah(p.minSubtotal || 0)})`
                                  : `Bonus x${p.bonusQty || 0} (Min ${rupiah(p.minSubtotal || 0)})`}
                              </small>

                              <div className="prod-actions">
                                <button
                                  className={active ? "btn" : "btn secondary"}
                                  type="button"
                                  onClick={() => togglePromo(p.id)}
                                >
                                  {active ? "Dipakai" : "Pakai"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {(!meta?.promos || meta.promos.length === 0) && (
                          <div className="muted">Belum ada promo aktif.</div>
                        )}
                      </div>
                    </div>

                    <div className="hr" />

                    {/* MENU */}
                    <div className="pos-section">
                      <div className="pos-section-head">
                        <h3 className="pos-h3">Menu</h3>
                        <span className="muted">Tap “Kecil/Besar” untuk tambah item</span>
                      </div>

                      {metaSyncErr ? (
                        <div className="toast toast--danger" style={{ marginTop: 10 }}>
                          Sync error: {metaSyncErr}
                        </div>
                      ) : null}

                      <div className="grid-products">
                        {meta?.products?.map((p) => (
                          <div key={p.id} className="prod">
                            <b className="prod-title">{p.name}</b>
                            <small className="muted">
                              Kecil {rupiah(p.priceSmall)} • Besar {rupiah(p.priceLarge)}
                            </small>

                            <div className="prod-actions prod-actions--split">
                              <button
                                className="btn secondary"
                                type="button"
                                onClick={() => addProduct(p, "SMALL")}
                              >
                                Kecil
                              </button>
                              <button
                                className="btn secondary"
                                type="button"
                                onClick={() => addProduct(p, "LARGE")}
                              >
                                Besar
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="hr" />

                    {/* CART */}
                    <div className="pos-section">
                      <div className="pos-section-head">
                        <h3 className="pos-h3">Keranjang</h3>
                        <span className="muted">{cart.length ? `${cart.length} item` : "Belum ada item"}</span>
                      </div>

                      {cart.length === 0 ? (
                        <div className="muted">Belum ada item.</div>
                      ) : (
                        <div className="table-wrap">
                          <table className="table">
                            <thead>
                              <tr>
                                <th>Item</th>
                                <th style={{ width: 120 }}>Qty</th>
                                <th style={{ width: 140 }}>Subtotal</th>
                                <th style={{ width: 80 }}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {cart.map((it) => (
                                <tr key={it.key}>
                                  <td>
                                    <div><b>{it.name}</b></div>
                                    <div style={{ marginTop: 8 }}>
                                      <input
                                        className="input"
                                        placeholder="Catatan (level pedas/mix saus)"
                                        value={it.itemNote}
                                        onChange={(e) =>
                                          setCart((prev) =>
                                            prev.map((x) =>
                                              x.key === it.key ? { ...x, itemNote: e.target.value } : x
                                            )
                                          )
                                        }
                                      />
                                    </div>
                                  </td>
                                  <td>
                                    <div className="qty-ctrl">
                                      <button className="btn secondary" type="button" onClick={() => updateQty(it.key, -1)}>
                                        -
                                      </button>
                                      <div className="qty-num">{it.qty}</div>
                                      <button className="btn secondary" type="button" onClick={() => updateQty(it.key, +1)}>
                                        +
                                      </button>
                                    </div>
                                  </td>
                                  <td><b>{rupiah(it.price * it.qty)}</b></td>
                                  <td>
                                    <button className="btn danger" type="button" onClick={() => removeItem(it.key)}>
                                      X
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    <div className="hr" />

                    {/* ENQUEUE */}
                    <div className="pos-section">
                      <div className="pos-section-head">
                        <h3 className="pos-h3">Tambah ke Antrian</h3>
                        <span className="muted">Belum dibayar</span>
                      </div>

                      <div className="pos-form">
                        <div className="pos-field">
                          <label>Nama pelanggan (unik)</label>
                          <input
                            className="input"
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            placeholder="contoh: Budi / Teh Rina"
                          />
                        </div>

                        <div className="pos-actions">
                          <button
                            className="btn secondary"
                            type="button"
                            onClick={enqueueOrder}
                            disabled={!customerName || cart.length === 0}
                          >
                            Tambah ke Antrian
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="hr" />

                    {/* CHECKOUT DIRECT */}
                    <div className="pos-section">
                      <div className="pos-section-head">
                        <h3 className="pos-h3">Selesaikan Langsung</h3>
                        <span className="muted">Bayar sekarang</span>
                      </div>

                      <div className="row">
                        <div className="col">
                          <label>Diskon (Rp)</label>
                          <input
                            className="input"
                            type="number"
                            value={discount}
                            onChange={(e) => setDiscount(e.target.value)}
                          />
                        </div>
                        <div className="col">
                          <label>Metode Bayar</label>
                          <select
                            className="input"
                            value={paymentMethod}
                            onChange={(e) => setPaymentMethod(e.target.value)}
                          >
                            <option value="CASH">CASH</option>
                            <option value="QRIS">QRIS</option>
                          </select>
                        </div>
                      </div>

                      <div style={{ marginTop: 12 }}>
                        <label>Catatan transaksi / antrian (opsional)</label>
                        <textarea
                          className="input"
                          rows="2"
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                        />
                      </div>

                      <div className="pos-totalbar">
                        <div>
                          <div className="muted">Total</div>
                          <div className="pos-total">
                            {rupiah(netTotal)}
                          </div>
                        </div>

                        <button className="btn pos-cta" type="button" onClick={submitSale} disabled={cart.length === 0}>
                          Selesaikan
                        </button>
                      </div>
                    </div>

                    <div className="hr" />

                    {/* CASH MOVE */}
                    <div className="pos-section">
                      <div className="pos-section-head">
                        <h3 className="pos-h3">Cash In/Out</h3>
                        <span className="muted">Catat pengeluaran / tambah kas</span>
                      </div>

                      <div className="row">
                        <div className="col">
                          <label>Jenis</label>
                          <select
                            className="input"
                            value={cashMoveType}
                            onChange={(e) => setCashMoveType(e.target.value)}
                          >
                            <option value="CASH_IN">CASH IN (Tambah kas)</option>
                            <option value="CASH_OUT">CASH OUT (Pengeluaran)</option>
                          </select>
                        </div>
                        <div className="col">
                          <label>Nominal (Rp)</label>
                          <input
                            className="input"
                            type="number"
                            value={cashMoveAmount}
                            onChange={(e) => setCashMoveAmount(e.target.value)}
                          />
                        </div>
                      </div>

                      <div style={{ marginTop: 12 }}>
                        <label>Catatan</label>
                        <input
                          className="input"
                          value={cashMoveNote}
                          onChange={(e) => setCashMoveNote(e.target.value)}
                          placeholder="contoh: beli gas / tambah kembalian"
                        />
                      </div>

                      <div className="pos-actions" style={{ marginTop: 12 }}>
                        <button
                          className="btn secondary"
                          type="button"
                          onClick={submitCashMovement}
                          disabled={!cashMoveAmount || Number(cashMoveAmount) <= 0}
                        >
                          Simpan Cash Movement
                        </button>
                      </div>
                    </div>

                    <div className="hr" />

                    {/* SUMMARY */}
                    <div className="pos-section">
                      <div className="pos-section-head">
                        <h3 className="pos-h3">Ringkasan Shift</h3>
                        <span className="muted">Performa shift berjalan</span>
                      </div>

                      {summary ? (
                        <div className="row">
                          <div className="col">
                            <div className="card">
                              <div className="muted">Modal Awal</div>
                              <div><b>{rupiah(summary.openingCash)}</b></div>

                              <div className="muted" style={{ marginTop: 10 }}>Penjualan CASH</div>
                              <div><b>{rupiah(summary.cashSales)}</b></div>

                              <div className="muted" style={{ marginTop: 10 }}>Penjualan QRIS</div>
                              <div><b>{rupiah(summary.qrisSales)}</b></div>
                            </div>
                          </div>
                          <div className="col">
                            <div className="card">
                              <div className="muted">Cash IN</div>
                              <div><b>{rupiah(summary.cashIn)}</b></div>

                              <div className="muted" style={{ marginTop: 10 }}>Cash OUT</div>
                              <div><b>{rupiah(summary.cashOut)}</b></div>

                              <div className="muted" style={{ marginTop: 10 }}>Expected Cash</div>
                              <div style={{ fontSize: 18 }}><b>{rupiah(summary.expectedCash)}</b></div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="muted">Belum ada ringkasan.</div>
                      )}
                    </div>

                    <div className="hr" />

                    {/* MOVEMENTS */}
                    <div className="pos-section">
                      <div className="pos-section-head">
                        <h3 className="pos-h3">Riwayat Cash Movement</h3>
                        <span className="muted">10 terakhir</span>
                      </div>

                      {movements.length ? (
                        <div className="table-wrap">
                          <table className="table">
                            <thead>
                              <tr>
                                <th>Waktu</th>
                                <th>Jenis</th>
                                <th>Nominal</th>
                                <th>Catatan</th>
                              </tr>
                            </thead>
                            <tbody>
                              {movements.slice(0, 10).map((m) => (
                                <tr key={m.id}>
                                  <td>{new Date(m.createdAt).toLocaleTimeString("id-ID")}</td>
                                  <td><span className="badge">{m.type}</span></td>
                                  <td><b>{rupiah(m.amount)}</b></td>
                                  <td className="muted">{m.note || "-"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="muted">Belum ada cash in/out.</div>
                      )}
                    </div>

                    <div className="hr" />

                    {/* CLOSE SHIFT */}
                    <div className="pos-section">
                      <div className="pos-section-head">
                        <h3 className="pos-h3">Tutup Shift</h3>
                        <span className="muted">Pastikan kas fisik sesuai</span>
                      </div>

                      <div className="pos-form">
                        <div className="pos-field">
                          <label>Kas fisik saat tutup (Rp)</label>
                          <input
                            className="input"
                            type="number"
                            value={closingCash}
                            onChange={(e) => setClosingCash(e.target.value)}
                          />
                        </div>

                        <div className="pos-actions">
                          <button className="btn danger" type="button" onClick={closeShift}>
                            Tutup Shift
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* RIGHT */}
            <div className="pos-col">
              <div className="pos-card">
                <div className="pos-section-head pos-section-head--tight">
                  <h3 className="pos-h3" style={{ margin: 0 }}>
                    Antrian Pesanan
                  </h3>

                  <div className="pos-right-tools" aria-live="polite">
                    {qLoading ? (
                      <span className="loading-inline loading--neutral">
                        <span className="spinner spinner--sm" aria-hidden="true" />
                        <span className="loading-inline-text">Sync…</span>
                      </span>
                    ) : (
                      <span className="muted" style={{ fontSize: 12 }}>
                        
                      </span>
                    )}
                  </div>
                </div>

                <div className="muted" style={{ marginTop: 8 }}>
                  Pesanan yang sudah masuk antrian belum dibayar. Klik untuk buka & selesaikan.
                </div>

                {qErr ? (
                  <div className="toast toast--danger" style={{ marginTop: 12 }}>
                    {qErr}
                  </div>
                ) : null}

                <div className="hr" />

                {!queue.length ? (
                  <div className="muted">Belum ada antrian.</div>
                ) : (
                  <div className="queue-list">
                    {queue.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className="queue-item"
                        onClick={() => openOrderModal(o.id)}
                      >
                        <div className="queue-row">
                          <div className="queue-left">
                            <div className="queue-name">{o.customerName}</div>
                            <div className="queue-sub">
                              {new Date(o.createdAt).toLocaleTimeString("id-ID")} •{" "}
                              {o.itemCount || 0} item
                            </div>
                          </div>

                          <div className="queue-right">
                            <div className="queue-sub">Estimasi</div>
                            <div className="queue-total">{rupiah(o.grossTotal || 0)}</div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* MODAL */}
          {modalOpen && openOrder ? (
            <div
              className="modal-overlay"
              onClick={() => {
                setModalOpen(false);
                setOpenOrder(null);
              }}
            >
              <div className="modal-card pos-card" onClick={(e) => e.stopPropagation()}>
                <div className="modal-head">
                  <div>
                    <h3 style={{ margin: 0 }}>Checkout: {openOrder.customerName}</h3>
                    <div className="muted" style={{ fontSize: 12 }}>
                      Dibuat: {new Date(openOrder.createdAt).toLocaleString("id-ID")}
                    </div>
                  </div>
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => {
                      setModalOpen(false);
                      setOpenOrder(null);
                    }}
                  >
                    Tutup
                  </button>
                </div>

                <div className="hr" />

                <h4 style={{ marginTop: 0 }}>Detail Item</h4>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Produk</th>
                        <th style={{ width: 90 }}>Portion</th>
                        <th style={{ width: 90 }}>Qty</th>
                        <th style={{ width: 140 }}>Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(openOrder.items || []).map((it) => (
                        <tr key={it.id}>
                          <td>
                            <b>{it.product?.name || "(Produk)"}</b>
                            {it.itemNote ? (
                              <div className="muted" style={{ fontSize: 12 }}>
                                {it.itemNote}
                              </div>
                            ) : null}
                          </td>
                          <td><span className="badge">{it.portion}</span></td>
                          <td>{it.qty}</td>
                          <td><b>{rupiah(Number(it.price || 0) * Number(it.qty || 0))}</b></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="hr" />

                <h4 style={{ marginTop: 0 }}>Promo (opsional)</h4>
                <div className="grid-products">
                  {(meta?.promos || []).map((p) => {
                    const active = checkout.promoIds.includes(p.id);
                    return (
                      <div
                        key={p.id}
                        className={`prod ${p.isActive === false ? "prod--disabled" : ""}`}
                      >
                        <div className="prod-head">
                          <b className="prod-title">{p.name}</b>
                          {active ? <span className="pill pill--ok">Dipakai</span> : <span className="pill pill--neutral">Opsional</span>}
                        </div>
                        <small className="muted">
                          {p.type === "DISCOUNT_PERCENT"
                            ? `Diskon ${p.discountPercent || 0}% (Min ${rupiah(p.minSubtotal || 0)})`
                            : `Bonus x${p.bonusQty || 0} (Min ${rupiah(p.minSubtotal || 0)})`}
                        </small>
                        <div className="prod-actions">
                          <button
                            className={active ? "btn" : "btn secondary"}
                            type="button"
                            onClick={() => toggleCheckoutPromo(p.id)}
                          >
                            {active ? "Dipakai" : "Pakai"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {(!meta?.promos || meta.promos.length === 0) && (
                    <div className="muted">Belum ada promo aktif.</div>
                  )}
                </div>

                <div className="hr" />

                <div className="row">
                  <div className="col">
                    <label>Diskon Manual (Rp)</label>
                    <input
                      className="input"
                      type="number"
                      value={checkout.manualDiscount}
                      onChange={(e) =>
                        setCheckout((p) => ({ ...p, manualDiscount: e.target.value }))
                      }
                    />
                  </div>
                  <div className="col">
                    <label>Metode Bayar</label>
                    <select
                      className="input"
                      value={checkout.paymentMethod}
                      onChange={(e) =>
                        setCheckout((p) => ({ ...p, paymentMethod: e.target.value }))
                      }
                    >
                      <option value="CASH">CASH</option>
                      <option value="QRIS">QRIS</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <label>Catatan (opsional)</label>
                  <textarea
                    className="input"
                    rows="2"
                    value={checkout.note}
                    onChange={(e) => setCheckout((p) => ({ ...p, note: e.target.value }))}
                  />
                </div>

                <div className="hr" />

                <div className="modal-foot">
                  <div className="modal-totals">
                    <div className="muted">Gross</div>
                    <div><b>{rupiah(openOrder.grossTotal || 0)}</b></div>

                    <div className="muted" style={{ marginTop: 6 }}>Diskon Promo</div>
                    <div><b>{rupiah(checkoutPromoDiscount)}</b></div>

                    <div className="muted" style={{ marginTop: 6 }}>Net</div>
                    <div className="modal-net"><b>{rupiah(checkoutNetTotal)}</b></div>
                  </div>

                  <div className="modal-actions">
                    <button className="btn danger" type="button" onClick={() => cancelOrder(openOrder.id)}>
                      Batalkan Order
                    </button>
                    <button className="btn" type="button" onClick={() => checkoutOrder(openOrder.id)}>
                      Selesaikan & Bayar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
