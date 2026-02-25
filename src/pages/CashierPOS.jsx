import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost } from "../api";
import { useNavigate } from "react-router-dom";
import LoadingScreen from "../components/ui/LoadingScreen";
import Tabs from "../components/ui/Tabs";
import CashierStockPanel from "../components/pos/CashierStockPanel";

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

function isCoreStockName(name) {
  const n = String(name || "").trim().toLowerCase();
  return n === "cireng" || n === "kemasan";
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

    const ingredients = (metaObj?.ingredients || [])
      .map((i) => `${i.id}:${i.name}:${i.unit}:${i.isGlobal}:${i.allowNegative}`)
      .join("|");

    return `p=${products}__r=${promos}__i=${ingredients}`;
  }

  async function loadMeta({ silent = false } = {}) {
    try {
      const metaRes = await apiGet("/api/meta");
      setMeta(metaRes);
      setMetaSyncAt(new Date());
      setMetaSyncErr("");

      const sig = computeMetaSig(metaRes);

      if (metaSigRef.current && metaSigRef.current !== sig) {
        setMsg("Menu / promo / bahan diperbarui dari Admin.");

        // ✅ kalau shift belum dibuka, refresh stok opening tanpa menghapus input kasir
        try {
          if (!shift) await loadOpeningStocks({ preserve: true });
        } catch (_) {}
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

  // ===== OPENING STOCK (Inventory) =====
  const [invStocks, setInvStocks] = useState([]); // CART (per gerobak)
  const [invCentralStocks, setInvCentralStocks] = useState([]); // CENTRAL (read-only)
  const [invLoading, setInvLoading] = useState(false);
  const [invErr, setInvErr] = useState("");

  const [openStockChecked, setOpenStockChecked] = useState({});
  const [openStockQty, setOpenStockQty] = useState({});

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

  // ===== POS TABS =====
  const [mainTab, setMainTab] = useState("SELL"); // SELL | CASH | SHIFT | STOCK
  const [cashTab, setCashTab] = useState("ALL"); // ALL | CASH_IN | CASH_OUT

  // ===== CLOSE SHIFT MODAL =====
  const [closeShiftOpen, setCloseShiftOpen] = useState(false);
  const [closeShiftBusy, setCloseShiftBusy] = useState(false);

  useEffect(() => {
    if (!token) nav("/cashier");
  }, [token, nav]);

  useEffect(() => {
    if (!shift) {
      setMainTab("SELL");
      setCashTab("ALL");
      setCloseShiftOpen(false);
      setCloseShiftBusy(false);
    }
  }, [shift]);

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

  // load opening stocks saat shift CLOSED
  useEffect(() => {
    if (!token) return;
    if (shift) return;
    loadOpeningStocks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, shift]);

  // polling queue saat shift OPEN
  useEffect(() => {
    if (!token) return;
    if (!shift) return;

    loadQueue();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") loadQueue();
    }, 5000);

    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, shift]);

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

  async function loadOpeningStocks({ preserve = false } = {}) {
    if (!token) return;
    setInvErr("");
    setInvLoading(true);

    try {
      const r = await apiGet(
        "/api/cashier/inventory/stocks?includeCentral=true",
        token
      );

      const all = r?.stocks || [];
      const cartStocks = all.filter((x) => !x.isGlobal);
      const centralStocks = all.filter((x) => !!x.isGlobal);

      setInvStocks(cartStocks);
      setInvCentralStocks(centralStocks);

      const prevChecked = preserve ? openStockChecked || {} : {};
      const prevQty = preserve ? openStockQty || {} : {};

      const checked = {};
      const qty = {};

      for (const s of cartStocks) {
        const core = isCoreStockName(s.name);
        checked[s.id] = core ? true : !!prevChecked[s.id];
        qty[s.id] = prevQty[s.id] ?? Number(s.qty ?? 0);
      }

      setOpenStockChecked(checked);
      setOpenStockQty(qty);
    } catch (e) {
      setInvErr(e?.message || "Gagal load stok untuk pembukaan shift");
      setInvStocks([]);
      setInvCentralStocks([]);
    } finally {
      setInvLoading(false);
    }
  }

  // ===== SHIFT OPS =====
  async function openShift() {
    setErr("");
    setMsg("");

    try {
      const selected = (invStocks || []).filter((s) => openStockChecked[s.id]);

      const hasCireng = (invStocks || []).some(
        (s) => String(s.name || "").toLowerCase() === "cireng"
      );
      const hasKemasan = (invStocks || []).some(
        (s) => String(s.name || "").toLowerCase() === "kemasan"
      );

      if (hasCireng && !selected.some((s) => String(s.name || "").toLowerCase() === "cireng")) {
        throw new Error("Cireng wajib dipilih untuk stok awal.");
      }
      if (hasKemasan && !selected.some((s) => String(s.name || "").toLowerCase() === "kemasan")) {
        throw new Error("Kemasan wajib dipilih untuk stok awal.");
      }

      const openingStocks = selected.map((s) => ({
        ingredientId: s.id,
        qty: Number(openStockQty[s.id] ?? 0),
      }));

      const res = await apiPost(
        "/api/shifts/open",
        {
          openingCash: Number(openingCash || 0),
          openingStocks,
        },
        token
      );

      setShift(res.shift);

      const sum = await apiGet("/api/shifts/summary", token);
      setSummary(sum.summary);
      setMovements([]);
      await loadQueue();

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
      setSummary(null);
      setMovements([]);
      setCart([]);
      setPromoIds([]);
      setCustomerName("");
      setDiscount(0);
      setPaymentMethod("CASH");
      setNote("");
      setClosingCash(0);

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
      return true;
    } catch (e) {
      setErr(e?.message || "Gagal tutup shift");
      return false;
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

      setMsg(
        "Transaksi sukses. ID: " +
          res.saleId +
          " | Total: " +
          rupiah(res.netTotal)
      );

      setCart([]);
      setPromoIds([]);
      setDiscount(0);
      setPaymentMethod("CASH");
      setNote("");
      await loadQueue();
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
        (q) =>
          String(q.customerName || "").trim().toLowerCase() === cn.toLowerCase()
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

      setMsg(
        "Checkout sukses. ID: " +
          res.saleId +
          " | Total: " +
          rupiah(res.netTotal)
      );

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

  // ===== EXPORT (CSV) + FILTERS =====
  function csvEscape(v) {
    const s = String(v ?? "");
    if (s.includes('"') || s.includes(",") || s.includes("\n")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function toCSV(rows) {
    return rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  }

  function downloadTextFile(filename, text, mime = "text/csv;charset=utf-8") {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2500);
  }

  const movementStats = useMemo(() => {
    let cin = 0,
      cout = 0;
    for (const m of movements || []) {
      if (m?.type === "CASH_IN") cin++;
      else if (m?.type === "CASH_OUT") cout++;
    }
    return {
      cashInCount: cin,
      cashOutCount: cout,
      total: (movements || []).length,
    };
  }, [movements]);

  const movementsFiltered = useMemo(() => {
    if (!movements?.length) return [];
    if (cashTab === "ALL") return movements;
    return movements.filter((m) => m.type === cashTab);
  }, [movements, cashTab]);

  function exportMovementsCSV(list, label) {
    const dayKey = new Date().toLocaleDateString("sv-SE");
    const rows = [
      ["createdAt", "type", "amount", "note"],
      ...(list || []).map((m) => [
        new Date(m.createdAt).toLocaleString("id-ID"),
        m.type,
        Number(m.amount || 0),
        m.note || "",
      ]),
    ];
    downloadTextFile(`cash-movements-${label}-${dayKey}.csv`, toCSV(rows));
  }

  function exportShiftCSV() {
    const dayKey = new Date().toLocaleDateString("sv-SE");
    const s = summary || {};
    const head = [
      ["Cart", cartName],
      ["ExportedAt", new Date().toLocaleString("id-ID")],
      [],
      ["openingCash", Number(s.openingCash || 0)],
      ["cashSales", Number(s.cashSales || 0)],
      ["qrisSales", Number(s.qrisSales || 0)],
      ["cashIn", Number(s.cashIn || 0)],
      ["cashOut", Number(s.cashOut || 0)],
      ["expectedCash", Number(s.expectedCash || 0)],
      [],
      ["createdAt", "type", "amount", "note"],
    ];
    const body = (movements || []).map((m) => [
      new Date(m.createdAt).toLocaleString("id-ID"),
      m.type,
      Number(m.amount || 0),
      m.note || "",
    ]);
    downloadTextFile(`shift-summary-${dayKey}.csv`, toCSV([...head, ...body]));
  }

  async function confirmCloseShiftFromModal() {
    if (closeShiftBusy) return;
    setCloseShiftBusy(true);
    const ok = await closeShift();
    setCloseShiftBusy(false);
    if (ok) setCloseShiftOpen(false);
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
                <span className="pill pill--soft">
                  Sync <b>{syncText}</b>
                </span>

                <button
                  className="btn secondary btn--sm"
                  type="button"
                  onClick={logout}
                  title="Logout Kasir"
                >
                  Logout
                </button>

                {shift ? (
                  <button
                    className="btn danger btn--sm"
                    type="button"
                    onClick={() => setCloseShiftOpen(true)}
                  >
                    Tutup Shift
                  </button>
                ) : null}
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
                      <span className="muted">
                        Mulai transaksi setelah shift OPEN
                      </span>
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

                      <div style={{ marginTop: 14 }}>
                        <div
                          className="pos-section-head"
                          style={{ marginBottom: 8 }}
                        >
                          <h3 className="pos-h3" style={{ margin: 0 }}>
                            Stok Awal (per gerobak)
                          </h3>
                          <div
                            style={{
                              display: "flex",
                              gap: 10,
                              alignItems: "center",
                              justifyContent: "flex-end",
                            }}
                          >
                            <span className="muted">
                              Centang bahan yang kamu simpan hari ini. Cireng &
                              Kemasan wajib.
                            </span>
                            <button
                              className="btn secondary btn--sm"
                              type="button"
                              onClick={() => loadOpeningStocks({ preserve: true })}
                            >
                              Refresh bahan
                            </button>
                          </div>
                        </div>

                        {invErr ? (
                          <div
                            className="toast toast--danger"
                            style={{ marginBottom: 10 }}
                          >
                            {invErr}
                          </div>
                        ) : null}

                        {invLoading ? (
                          <div className="muted">Memuat daftar bahan...</div>
                        ) : invStocks?.length ? (
                          <div style={{ display: "grid", gap: 10 }}>
                            {invStocks.map((s) => {
                              const core = isCoreStockName(s.name);
                              const checked = !!openStockChecked[s.id];

                              return (
                                <div
                                  key={s.id}
                                  className="pos-card"
                                  style={{
                                    padding: 12,
                                    display: "grid",
                                    gridTemplateColumns: "1fr 140px",
                                    gap: 10,
                                    alignItems: "center",
                                  }}
                                >
                                  <label
                                    style={{
                                      display: "flex",
                                      gap: 10,
                                      alignItems: "center",
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={core}
                                      onChange={(e) =>
                                        setOpenStockChecked((prev) => ({
                                          ...prev,
                                          [s.id]: e.target.checked,
                                        }))
                                      }
                                    />
                                    <div>
                                      <div style={{ fontWeight: 700 }}>
                                        {s.name}{" "}
                                        <span
                                          className="muted"
                                          style={{ fontWeight: 500 }}
                                        >
                                          ({s.unit})
                                        </span>
                                        {core ? (
                                          <span
                                            className="pill pill--soft"
                                            style={{ marginLeft: 8 }}
                                          >
                                            Wajib
                                          </span>
                                        ) : null}
                                      </div>
                                      <div
                                        className="muted"
                                        style={{ fontSize: 12 }}
                                      >
                                        Stok terakhir:{" "}
                                        <b>{Number(s.qty ?? 0)}</b>
                                      </div>
                                    </div>
                                  </label>

                                  <input
                                    className="input"
                                    type="number"
                                    min="0"
                                    step="1"
                                    disabled={!checked}
                                    value={openStockQty[s.id] ?? 0}
                                    onChange={(e) =>
                                      setOpenStockQty((prev) => ({
                                        ...prev,
                                        [s.id]: e.target.value,
                                      }))
                                    }
                                  />
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="muted">
                            Inventory belum aktif / belum ada bahan. (Admin perlu
                            tambah ingredient seperti Cireng & Kemasan.)
                          </div>
                        )}
                      </div>

                      <div className="pos-actions">
                        <button className="btn" type="button" onClick={openShift}>
                          Buka Shift
                        </button>

                        {invCentralStocks?.length ? (
                          <details style={{ marginTop: 12 }}>
                            <summary className="muted" style={{ cursor: "pointer" }}>
                              Lihat stok CENTRAL (read-only) •{" "}
                              {invCentralStocks.length} bahan
                            </summary>
                            <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                              {invCentralStocks.map((s) => (
                                <div
                                  key={s.id}
                                  className="pos-card"
                                  style={{
                                    padding: 12,
                                    display: "grid",
                                    gridTemplateColumns: "1fr 140px",
                                    gap: 10,
                                    alignItems: "center",
                                  }}
                                >
                                  <div>
                                    <div style={{ fontWeight: 700 }}>
                                      {s.name}{" "}
                                      <span className="muted" style={{ fontWeight: 500 }}>
                                        ({s.unit})
                                      </span>
                                      <span className="pill pill--soft" style={{ marginLeft: 8 }}>
                                        Central
                                      </span>
                                    </div>
                                    <div className="muted" style={{ fontSize: 12 }}>
                                      Catatan: bahan CENTRAL dikelola Admin, bukan stok per gerobak.
                                    </div>
                                  </div>
                                  <input className="input" type="number" value={Number(s.qty ?? 0)} disabled />
                                </div>
                              ))}
                            </div>
                          </details>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* MAIN TABS */}
                    <div className="pos-section" style={{ paddingBottom: 10 }}>
                      <div className="pos-section-head">
                        <h3 className="pos-h3" style={{ margin: 0 }}>
                          Kasir
                        </h3>
                        <span className="muted">Ringkas: Jualan • Cash • Shift • Stok</span>
                      </div>

                      <Tabs
                        items={[
                          { value: "SELL", label: "Jualan" },
                          { value: "CASH", label: "Cash In/Out" },
                          { value: "SHIFT", label: "Shift" },
                          { value: "STOCK", label: "Stok" },
                        ]}
                        value={mainTab}
                        onChange={setMainTab}
                      />
                    </div>

                    {/* ===== TAB: SELL ===== */}
                    {mainTab === "SELL" ? (
                      <>
                        {/* PROMO */}
                        <div className="pos-section">
                          <div className="pos-section-head">
                            <h3 className="pos-h3">Promo</h3>
                            <span className="muted">
                              Pilih promo untuk transaksi langsung / checkout antrian
                            </span>
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
                                    {active ? (
                                      <span className="pill pill--ok">Dipakai</span>
                                    ) : (
                                      <span className="pill pill--neutral">Opsional</span>
                                    )}
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
                            <span className="muted">
                              Tap “Kecil/Besar” untuk tambah item
                            </span>
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
                            <span className="muted">
                              {cart.length ? `${cart.length} item` : "Belum ada item"}
                            </span>
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
                                                  x.key === it.key
                                                    ? { ...x, itemNote: e.target.value }
                                                    : x
                                                )
                                              )
                                            }
                                          />
                                        </div>
                                      </td>
                                      <td>
                                        <div className="qty-ctrl">
                                          <button
                                            className="btn secondary"
                                            type="button"
                                            onClick={() => updateQty(it.key, -1)}
                                          >
                                            -
                                          </button>
                                          <div className="qty-num">{it.qty}</div>
                                          <button
                                            className="btn secondary"
                                            type="button"
                                            onClick={() => updateQty(it.key, +1)}
                                          >
                                            +
                                          </button>
                                        </div>
                                      </td>
                                      <td><b>{rupiah(it.price * it.qty)}</b></td>
                                      <td>
                                        <button
                                          className="btn danger"
                                          type="button"
                                          onClick={() => removeItem(it.key)}
                                        >
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
                              <div className="pos-total">{rupiah(netTotal)}</div>
                            </div>

                            <button
                              className="btn pos-cta"
                              type="button"
                              onClick={submitSale}
                              disabled={cart.length === 0}
                            >
                              Selesaikan
                            </button>
                          </div>
                        </div>
                      </>
                    ) : null}

                    {/* ===== TAB: CASH ===== */}
                    {mainTab === "CASH" ? (
                      <>
                        <div className="pos-section">
                          <div className="pos-section-head">
                            <h3 className="pos-h3">Cash In/Out</h3>
                            <span className="muted">Catat pengeluaran / tambah kas</span>
                          </div>

                          <div style={{ marginTop: 6 }}>
                            <label>Jenis</label>
                            <Tabs
                              items={[
                                { value: "CASH_OUT", label: "Cash Out" },
                                { value: "CASH_IN", label: "Cash In" },
                              ]}
                              value={cashMoveType}
                              onChange={setCashMoveType}
                            />
                          </div>

                          <div className="row" style={{ marginTop: 12 }}>
                            <div className="col">
                              <label>Nominal (Rp)</label>
                              <input
                                className="input"
                                type="number"
                                value={cashMoveAmount}
                                onChange={(e) => setCashMoveAmount(e.target.value)}
                              />
                            </div>
                            <div className="col">
                              <label>Catatan</label>
                              <input
                                className="input"
                                value={cashMoveNote}
                                onChange={(e) => setCashMoveNote(e.target.value)}
                                placeholder="contoh: beli gas / tambah kembalian"
                              />
                            </div>
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

                        <div className="pos-section">
                          <div className="pos-section-head">
                            <h3 className="pos-h3">Riwayat Cash Movement</h3>
                            <div className="pos-header-actions">
                              <button
                                className="btn secondary btn--sm"
                                type="button"
                                onClick={() =>
                                  exportMovementsCSV(
                                    movementsFiltered,
                                    String(cashTab).toLowerCase()
                                  )
                                }
                                disabled={!movementsFiltered.length}
                              >
                                Export CSV
                              </button>
                            </div>
                          </div>

                          <Tabs
                            items={[
                              { value: "ALL", label: `Semua (${movementStats.total})` },
                              { value: "CASH_IN", label: `Cash In (${movementStats.cashInCount})` },
                              { value: "CASH_OUT", label: `Cash Out (${movementStats.cashOutCount})` },
                            ]}
                            value={cashTab}
                            onChange={setCashTab}
                          />

                          <div style={{ marginTop: 12 }}>
                            {movementsFiltered.length ? (
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
                                    {movementsFiltered.slice(0, 20).map((m) => (
                                      <tr key={m.id}>
                                        <td>{new Date(m.createdAt).toLocaleTimeString("id-ID")}</td>
                                        <td>
                                          <span
                                            className={`badge ${
                                              m.type === "CASH_IN" ? "badge--accent1" : "badge--danger"
                                            }`}
                                          >
                                            {m.type}
                                          </span>
                                        </td>
                                        <td><b>{rupiah(m.amount)}</b></td>
                                        <td className="muted">{m.note || "-"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <div className="muted">Belum ada data untuk filter ini.</div>
                            )}
                          </div>
                        </div>
                      </>
                    ) : null}

                    {/* ===== TAB: SHIFT ===== */}
                    {mainTab === "SHIFT" ? (
                      <>
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

                        <div className="pos-section">
                          <div className="pos-section-head">
                            <h3 className="pos-h3">Tutup Shift</h3>
                            <span className="muted">Kas fisik & konfirmasi ada di popup</span>
                          </div>

                          <div className="pos-actions" style={{ marginTop: 12 }}>
                            <button
                              className="btn secondary btn--sm"
                              type="button"
                              onClick={exportShiftCSV}
                              disabled={!summary}
                            >
                              Export Shift CSV
                            </button>
                            <button
                              className="btn danger"
                              type="button"
                              onClick={() => setCloseShiftOpen(true)}
                            >
                              Tutup Shift
                            </button>
                          </div>
                        </div>
                      </>
                    ) : null}

                    {/* ===== TAB: STOCK ===== */}
                    {mainTab === "STOCK" ? (
                      <CashierStockPanel token={token} meta={meta} shift={shift} cartName={cartName} />
                    ) : null}
                  </>
                )}
              </div>
            </div>

            {/* RIGHT */}
            <div className="pos-col">
              <div className="pos-card">
                <div className="pos-section-head pos-section-head--tight">
                  <h3 className="pos-h3" style={{ margin: 0 }}>Antrian Pesanan</h3>

                  <div className="pos-right-tools" aria-live="polite">
                    {qLoading ? (
                      <span className="loading-inline loading--neutral">
                        <span className="spinner spinner--sm" aria-hidden="true" />
                        <span className="loading-inline-text">Sync…</span>
                      </span>
                    ) : (
                      <span className="muted" style={{ fontSize: 12 }}></span>
                    )}
                  </div>
                </div>

                <div className="muted" style={{ marginTop: 8 }}>
                  Pesanan yang sudah masuk antrian belum dibayar. Klik untuk buka & selesaikan.
                </div>

                {qErr ? (
                  <div className="toast toast--danger" style={{ marginTop: 12 }}>{qErr}</div>
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
                              {new Date(o.createdAt).toLocaleTimeString("id-ID")} • {o.itemCount || 0} item
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

          {/* CLOSE SHIFT MODAL */}
          {closeShiftOpen && shift ? (
            <div className="modal-overlay" onClick={() => setCloseShiftOpen(false)}>
              <div className="modal-card pos-card" onClick={(e) => e.stopPropagation()}>
                <div className="modal-head">
                  <div>
                    <h3 style={{ margin: 0 }}>Tutup Shift • {cartName}</h3>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {new Date().toLocaleString("id-ID")}
                    </div>
                  </div>
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => setCloseShiftOpen(false)}
                    disabled={closeShiftBusy}
                  >
                    Tutup
                  </button>
                </div>

                <div className="hr" />

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
                  <div className="muted">Ringkasan belum tersedia.</div>
                )}

                <div className="hr" />

                <div className="pos-form">
                  <div className="pos-field">
                    <label>Kas fisik saat tutup (Rp)</label>
                    <input
                      className="input"
                      type="number"
                      value={closingCash}
                      onChange={(e) => setClosingCash(e.target.value)}
                      placeholder={
                        summary?.expectedCash != null ? `Expected: ${rupiah(summary.expectedCash)}` : ""
                      }
                    />
                    {summary?.expectedCash != null && String(closingCash) !== "" ? (
                      (() => {
                        const expected = Number(summary.expectedCash || 0);
                        const closing = Number(closingCash || 0);
                        if (!Number.isFinite(closing)) return null;
                        const v = closing - expected;
                        const label = v === 0 ? "PAS" : v > 0 ? "LEBIH" : "KURANG";
                        return (
                          <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                            Selisih: <b>{rupiah(Math.abs(v))}</b> ({label})
                          </div>
                        );
                      })()
                    ) : null}
                  </div>

                  <div className="pos-actions" style={{ marginTop: 10 }}>
                    <button
                      className="btn secondary btn--sm"
                      type="button"
                      onClick={exportShiftCSV}
                      disabled={!summary}
                    >
                      Export Shift CSV
                    </button>
                    <button
                      className="btn danger"
                      type="button"
                      onClick={confirmCloseShiftFromModal}
                      disabled={
                        closeShiftBusy ||
                        String(closingCash) === "" ||
                        Number(closingCash) <= 0
                      }
                    >
                      {closeShiftBusy ? "Menutup…" : "Konfirmasi Tutup Shift"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* MODAL CHECKOUT ORDER */}
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
                          <td>
                            <span className="badge badge--neutral">{it.portion}</span>
                          </td>
                          <td>{it.qty}</td>
                          <td>
                            <b>{rupiah(Number(it.price || 0) * Number(it.qty || 0))}</b>
                          </td>
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
                          {active ? (
                            <span className="pill pill--ok">Dipakai</span>
                          ) : (
                            <span className="pill pill--neutral">Opsional</span>
                          )}
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
                    onChange={(e) =>
                      setCheckout((p) => ({ ...p, note: e.target.value }))
                    }
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