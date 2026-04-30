import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiPost } from "../api";
import LoadingScreen from "../components/ui/LoadingScreen";
import Tabs from "../components/ui/Tabs";
import CashierStockPanel from "../components/pos/CashierStockPanel";
import { socket, connectSocket, disconnectSocket } from "../socket";

const CHANNELS = {
  REGULAR: { value: "REGULAR", label: "Regular", defaultPayment: "CASH" },
  GOJEK: { value: "GOJEK", label: "Gojek", defaultPayment: "QRIS" },
};

const MAIN_TABS = [
  { value: "SELL", label: "Order" },
  { value: "CASH", label: "Cash" },
  { value: "SHIFT", label: "Shift" },
  { value: "STOCK", label: "Stok" },
];

const CHANNEL_TABS = [
  { value: "REGULAR", label: "Regular" },
  { value: "GOJEK", label: "Gojek" },
];

const PAYMENT_METHODS = ["CASH", "QRIS", "TRANSFER"];

function rupiah(amount) {
  const n = Number(amount || 0);
  if (!Number.isFinite(n)) return "Rp 0,00";

  const sign = n < 0 ? "-" : "";
  const fixed = Math.abs(n).toFixed(2);
  const [rawInt, dec] = fixed.split(".");
  const int = rawInt.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${sign}Rp ${int},${dec}`;
}

function shortRupiah(amount) {
  const n = Number(amount || 0);
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("id-ID").format(n);
}

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeChannel(channel) {
  return channel === "GOJEK" ? "GOJEK" : "REGULAR";
}

function getChannelLabel(channel) {
  return CHANNELS[normalizeChannel(channel)].label;
}

function getDefaultPayment(channel) {
  return CHANNELS[normalizeChannel(channel)].defaultPayment;
}

function getChannelProducts(meta, channel) {
  const c = normalizeChannel(channel);
  if (c === "GOJEK") return meta?.gojekProducts || meta?.products || [];
  return meta?.regularProducts || meta?.products || [];
}

function getChannelPromos(meta, channel) {
  const c = normalizeChannel(channel);
  if (c === "GOJEK") return meta?.gojekPromos || meta?.promos || [];
  return meta?.regularPromos || meta?.promos || [];
}

function getGojekFeePercent(meta) {
  return Number(meta?.gojekFeePercent || 21.09);
}

function calcPercentAmount(amount, percent) {
  const base = Math.max(0, Number(amount || 0));
  const pct = Math.max(0, Number(percent || 0));
  return Math.floor((base * pct) / 100);
}

function getProductPrice(product, portion) {
  if (!product) return 0;
  return portion === "LARGE"
    ? Number(product.priceLarge || 0)
    : Number(product.priceSmall || 0);
}

function itemKey(productId, portion) {
  return `${productId}:${portion}`;
}

function toTime(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
}

function isCoreStockName(name) {
  return String(name || "").trim().toLowerCase() === "cireng";
}

function promoText(promo, productsMap) {
  if (!promo) return "-";

  const minText = `Min ${rupiah(promo.minSubtotal || 0)}`;

  if (promo.type === "DISCOUNT_PERCENT") {
    return `Diskon ${promo.discountPercent || 0}% • ${minText}`;
  }

  if (promo.type === "DISCOUNT_AMOUNT") {
    return `Potongan ${rupiah(promo.discountAmount || 0)} • ${minText}`;
  }

  const bonusProduct = productsMap.get(promo.bonusProductId);
  const bonusName = bonusProduct?.name || "Produk bonus";
  const portion = promo.bonusPortion === "LARGE" ? "LARGE" : "SMALL";

  return `Bonus ${bonusName} x${promo.bonusQty || 0} ${portion} • ${minText}`;
}

function buildPromoPreview({ promos = [], selectedPromoIds = [], gross = 0, products = [] }) {
  const safeGross = Math.max(0, Number(gross || 0));
  const selectedIds = Array.isArray(selectedPromoIds)
    ? selectedPromoIds.filter(Boolean)
    : [];

  const empty = {
    discountTotal: 0,
    discountBreakdown: [],
    bonusItems: [],
    appliedPromoIds: [],
    skippedPromos: [],
  };

  if (!selectedIds.length || !Array.isArray(promos) || !promos.length) return empty;

  const promoMap = new Map(promos.map((promo) => [promo.id, promo]));
  const productMap = new Map(products.map((product) => [product.id, product]));

  let discountTotal = 0;
  const discountBreakdown = [];
  const bonusBucket = new Map();
  const appliedPromoIds = [];
  const skippedPromos = [];

  for (const promoId of selectedIds) {
    const promo = promoMap.get(promoId);
    if (!promo || promo.isActive === false) continue;

    const minSubtotal = Math.max(0, Number(promo.minSubtotal || 0));

    if (safeGross < minSubtotal) {
      skippedPromos.push({
        id: promo.id,
        name: promo.name,
        reason: `Minimal subtotal ${rupiah(minSubtotal)}`,
      });
      continue;
    }

    appliedPromoIds.push(promo.id);

    if (promo.type === "DISCOUNT_PERCENT") {
      const pct = Number(promo.discountPercent || 0);
      if (pct > 0) {
        const amount = Math.floor((safeGross * pct) / 100);
        discountTotal += amount;
        discountBreakdown.push({
          id: promo.id,
          name: promo.name,
          label: `${pct}%`,
          amount,
        });
      }
      continue;
    }

    if (promo.type === "DISCOUNT_AMOUNT") {
      const amount = Math.round(Number(promo.discountAmount || 0));
      if (amount > 0) {
        discountTotal += amount;
        discountBreakdown.push({
          id: promo.id,
          name: promo.name,
          label: rupiah(amount),
          amount,
        });
      }
      continue;
    }

    if (promo.type === "BONUS_ITEM") {
      const qty = Math.round(Number(promo.bonusQty || 0));
      if (!promo.bonusProductId || qty <= 0) continue;

      const portion = promo.bonusPortion === "LARGE" ? "LARGE" : "SMALL";
      const key = itemKey(promo.bonusProductId, portion);
      const product = productMap.get(promo.bonusProductId);

      const current = bonusBucket.get(key) || {
        key,
        productId: promo.bonusProductId,
        name: product?.name || "Produk Bonus",
        portion,
        qty: 0,
        price: 0,
        subtotal: 0,
        promoNames: [],
      };

      current.qty += qty;
      current.promoNames.push(promo.name);
      bonusBucket.set(key, current);
    }
  }

  return {
    discountTotal: Math.max(0, Math.round(discountTotal)),
    discountBreakdown,
    bonusItems: Array.from(bonusBucket.values()),
    appliedPromoIds,
    skippedPromos,
  };
}

function makeEmptyChannelState() {
  return {
    REGULAR: {
      cart: [],
      promoIds: [],
      manualDiscount: 0,
      paymentMethod: "CASH",
      customerName: "",
      note: "",
    },
    GOJEK: {
      cart: [],
      promoIds: [],
      manualDiscount: 0,
      paymentMethod: "QRIS",
      customerName: "",
      note: "",
    },
  };
}

function Alert({ type = "info", children }) {
  if (!children) return null;
  return <div className={`cashier-alert cashier-alert--${type}`}>{children}</div>;
}

function EmptyState({ children }) {
  return <div className="cashier-empty">{children}</div>;
}

function SectionTitle({ title, subtitle, action }) {
  return (
    <div className="cashier-section-head">
      <div>
        <h3>{title}</h3>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

function Kpi({ label, value, hint, tone = "" }) {
  return (
    <div className={`cashier-kpi ${tone ? `cashier-kpi--${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

export default function CashierPOS() {
  const nav = useNavigate();

  const token = localStorage.getItem("cashier_token");
  const cartName = localStorage.getItem("cashier_cartName") || "Gerobak";

  const [meta, setMeta] = useState(null);
  const [metaSyncAt, setMetaSyncAt] = useState(null);
  const [metaSyncErr, setMetaSyncErr] = useState("");

  const [shift, setShift] = useState(null);
  const [summary, setSummary] = useState(null);
  const [movements, setMovements] = useState([]);

  const [mainTab, setMainTab] = useState("SELL");
  const [activeChannel, setActiveChannel] = useState("REGULAR");
  const [cashFilter, setCashFilter] = useState("ALL");
  const [productSearch, setProductSearch] = useState("");

  const [channelState, setChannelState] = useState(makeEmptyChannelState);

  const [queue, setQueue] = useState([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueErr, setQueueErr] = useState("");

  const [openingCash, setOpeningCash] = useState(0);
  const [closingCash, setClosingCash] = useState(0);

  const [invStocks, setInvStocks] = useState([]);
  const [invCentralStocks, setInvCentralStocks] = useState([]);
  const [invLoading, setInvLoading] = useState(false);
  const [invErr, setInvErr] = useState("");
  const [openStockChecked, setOpenStockChecked] = useState({});
  const [openStockQty, setOpenStockQty] = useState({});

  const [cashMoveType, setCashMoveType] = useState("CASH_OUT");
  const [cashMoveAmount, setCashMoveAmount] = useState(0);
  const [cashMoveNote, setCashMoveNote] = useState("");

  const [openOrder, setOpenOrder] = useState(null);
  const [checkoutView, setCheckoutView] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editItems, setEditItems] = useState([]);
  const [editNote, setEditNote] = useState("");

  const [checkout, setCheckout] = useState({
    manualDiscount: 0,
    paymentMethod: "CASH",
    note: "",
    promoIds: [],
  });
  const [cashReceived, setCashReceived] = useState("");

  const [closeShiftOpen, setCloseShiftOpen] = useState(false);

  const [booting, setBooting] = useState(true);
  const [openShiftBusy, setOpenShiftBusy] = useState(false);
  const [enqueueBusy, setEnqueueBusy] = useState(false);
  const [cashBusy, setCashBusy] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [closeShiftBusy, setCloseShiftBusy] = useState(false);

  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const queueSigRef = useRef("");
  const enqueueLockRef = useRef(false);
  const checkoutLockRef = useRef(false);
  const openShiftLockRef = useRef(false);

  const allProducts = meta?.allProducts || meta?.products || [];
  const activeProducts = getChannelProducts(meta, activeChannel);
  const activePromos = getChannelPromos(meta, activeChannel);
  const activeState = channelState[activeChannel] || makeEmptyChannelState()[activeChannel];

  const productMap = useMemo(() => new Map(allProducts.map((p) => [p.id, p])), [allProducts]);

  const visibleProducts = useMemo(() => {
    const q = cleanText(productSearch).toLowerCase();
    if (!q) return activeProducts;

    return activeProducts.filter((product) =>
      String(product?.name || "").toLowerCase().includes(q)
    );
  }, [activeProducts, productSearch]);

  const regularQueue = useMemo(
    () => (queue || []).filter((order) => normalizeChannel(order.salesChannel) === "REGULAR"),
    [queue]
  );

  const gojekQueue = useMemo(
    () => (queue || []).filter((order) => normalizeChannel(order.salesChannel) === "GOJEK"),
    [queue]
  );

  const activeQueue = activeChannel === "GOJEK" ? gojekQueue : regularQueue;

  const cartCalc = useMemo(() => {
    const gross = activeState.cart.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);

    const preview = buildPromoPreview({
      promos: activePromos,
      selectedPromoIds: activeState.promoIds,
      gross,
      products: activeProducts,
    });

    const feePercent = activeChannel === "GOJEK" ? getGojekFeePercent(meta) : 0;
    const platformFeeAmount = activeChannel === "GOJEK" ? calcPercentAmount(gross, feePercent) : 0;
    const subtotalAfterFee = Math.max(0, gross - platformFeeAmount);
    const manualDiscount = Math.max(0, Number(activeState.manualDiscount || 0));
    const promoDiscount = Math.max(0, Number(preview.discountTotal || 0));
    const totalDiscount = Math.min(subtotalAfterFee, manualDiscount + promoDiscount);
    const netTotal = Math.max(0, subtotalAfterFee - totalDiscount);

    return {
      gross,
      promoPreview: preview,
      feePercent,
      platformFeeAmount,
      subtotalAfterFee,
      manualDiscount,
      promoDiscount,
      totalDiscount,
      netTotal,
    };
  }, [activeState, activePromos, activeProducts, activeChannel, meta]);

  const checkoutCalc = useMemo(() => {
    if (!openOrder) {
      return {
        gross: 0,
        feePercent: 0,
        platformFeeAmount: 0,
        subtotalAfterFee: 0,
        manualDiscount: 0,
        promoDiscount: 0,
        netTotal: 0,
        change: 0,
        cashEnough: false,
        promoPreview: buildPromoPreview({}),
      };
    }

    const channel = normalizeChannel(openOrder.salesChannel);
    const products = getChannelProducts(meta, channel);
    const promos = getChannelPromos(meta, channel);

    const gross = editMode
      ? editItems.reduce((sum, row) => {
          const product = products.find((p) => p.id === row.productId);
          return sum + getProductPrice(product, row.portion) * Number(row.qty || 0);
        }, 0)
      : Number(openOrder.grossTotal || 0);

    const promoPreview = buildPromoPreview({
      promos,
      selectedPromoIds: checkout.promoIds,
      gross,
      products,
    });

    const feePercent = channel === "GOJEK" ? getGojekFeePercent(meta) : 0;
    const platformFeeAmount = channel === "GOJEK" ? calcPercentAmount(gross, feePercent) : 0;
    const subtotalAfterFee = Math.max(0, gross - platformFeeAmount);
    const manualDiscount = Math.max(0, Number(checkout.manualDiscount || 0));
    const promoDiscount = Math.max(0, Number(promoPreview.discountTotal || 0));
    const totalDiscount = Math.min(subtotalAfterFee, manualDiscount + promoDiscount);
    const netTotal = Math.max(0, subtotalAfterFee - totalDiscount);
    const received = Number(cashReceived || 0);
    const change = checkout.paymentMethod === "CASH" ? Math.max(0, received - netTotal) : 0;
    const cashEnough = checkout.paymentMethod !== "CASH" || received >= netTotal;

    return {
      gross,
      feePercent,
      platformFeeAmount,
      subtotalAfterFee,
      manualDiscount,
      promoDiscount,
      totalDiscount,
      netTotal,
      received,
      change,
      cashEnough,
      promoPreview,
    };
  }, [openOrder, meta, editMode, editItems, checkout, cashReceived]);

  const cashPresets = useMemo(() => {
    const total = Math.max(0, Number(checkoutCalc.netTotal || 0));
    const roundTo = (base) => Math.ceil(total / base) * base;

    const values = [
      total,
      roundTo(5000),
      roundTo(10000),
      50000,
      100000,
      150000,
    ]
      .filter((v) => Number.isFinite(v) && v > 0 && v >= total)
      .filter((v, index, arr) => arr.indexOf(v) === index)
      .slice(0, 6);

    return values;
  }, [checkoutCalc.netTotal]);

  const syncText = metaSyncAt
    ? metaSyncAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
    : "-";

  function setActiveState(patchOrFn) {
    setChannelState((prev) => {
      const current = prev[activeChannel] || makeEmptyChannelState()[activeChannel];
      const patch = typeof patchOrFn === "function" ? patchOrFn(current) : patchOrFn;

      return {
        ...prev,
        [activeChannel]: {
          ...current,
          ...patch,
        },
      };
    });
  }

  function clearActiveCart() {
    setActiveState({
      cart: [],
      promoIds: [],
      manualDiscount: 0,
      paymentMethod: getDefaultPayment(activeChannel),
      customerName: "",
      note: "",
    });
  }

  function exitCheckoutView() {
    setCheckoutView(false);
    setOpenOrder(null);
    setEditMode(false);
    setEditItems([]);
    setEditNote("");
    setCashReceived("");
    setCheckout({
      manualDiscount: 0,
      paymentMethod: getDefaultPayment(activeChannel),
      note: "",
      promoIds: [],
    });
  }

  async function loadMeta({ silent = false } = {}) {
    try {
      const response = await apiGet("/api/meta", token, { force: true });
      setMeta(response);
      setMetaSyncAt(new Date());
      setMetaSyncErr("");
    } catch (error) {
      const message = error?.message || "Gagal sync meta";
      setMetaSyncErr(message);
      if (!silent) setErr(message);
    }
  }

  async function loadQueue({ silent = false } = {}) {
    if (!token) return;

    if (!silent) setQueueLoading(true);
    setQueueErr("");

    try {
      const response = await apiGet("/api/orders/queue?status=ALL", token, { force: true });
      const next = response.orders || [];

      const sig = next
        .map((order) => `${order.id}:${order.status}:${order.salesChannel}:${order.grossTotal}:${order.itemCount}`)
        .join("|");

      if (sig !== queueSigRef.current) {
        queueSigRef.current = sig;
        setQueue(next);
      }
    } catch (error) {
      setQueueErr(error?.message || "Gagal load antrian");
    } finally {
      if (!silent) setQueueLoading(false);
    }
  }

  async function loadSummaryAndCash() {
    if (!token || !shift) return;

    try {
      const [summaryRes, movementRes] = await Promise.all([
        apiGet("/api/shifts/summary", token, { force: true }),
        apiGet("/api/cash/movements", token, { force: true }),
      ]);

      setSummary(summaryRes.summary || null);
      setMovements(movementRes.movements || []);
    } catch (error) {
      setErr(error?.message || "Gagal load ringkasan shift");
    }
  }

  async function loadOpeningStocks({ preserve = false } = {}) {
    if (!token) return;

    setInvLoading(true);
    setInvErr("");

    try {
      const response = await apiGet("/api/cashier/inventory/stocks?includeCentral=true", token, {
        force: true,
      });

      const all = response?.stocks || [];
      const cartStocks = all.filter((stock) => !stock.isGlobal);
      const centralStocks = all.filter((stock) => !!stock.isGlobal);

      const checked = {};
      const qty = {};

      for (const stock of cartStocks) {
        checked[stock.id] = isCoreStockName(stock.name)
          ? true
          : preserve
          ? !!openStockChecked[stock.id]
          : false;

        qty[stock.id] = preserve
          ? openStockQty[stock.id] ?? Number(stock.qty || 0)
          : Number(stock.qty || 0);
      }

      setInvStocks(cartStocks);
      setInvCentralStocks(centralStocks);
      setOpenStockChecked(checked);
      setOpenStockQty(qty);
    } catch (error) {
      setInvErr(error?.message || "Gagal load stok pembukaan shift");
      setInvStocks([]);
      setInvCentralStocks([]);
    } finally {
      setInvLoading(false);
    }
  }

  async function loadInitial() {
    setBooting(true);
    setErr("");
    setMsg("");

    try {
      const [metaRes, shiftRes] = await Promise.all([
        apiGet("/api/meta", token, { force: true }),
        apiGet("/api/shifts/current", token, { force: true }),
      ]);

      setMeta(metaRes);
      setMetaSyncAt(new Date());
      setShift(shiftRes.shift || null);

      if (shiftRes.shift) {
        const [summaryRes, movementRes, queueRes] = await Promise.all([
          apiGet("/api/shifts/summary", token, { force: true }),
          apiGet("/api/cash/movements", token, { force: true }),
          apiGet("/api/orders/queue?status=ALL", token, { force: true }),
        ]);

        setSummary(summaryRes.summary || null);
        setMovements(movementRes.movements || []);
        setQueue(queueRes.orders || []);
      }
    } catch (error) {
      setErr(`Sync error: ${error?.message || String(error)}`);
    } finally {
      setBooting(false);
    }
  }

  useEffect(() => {
    if (!token) {
      nav("/cashier");
      return;
    }

    loadInitial();

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") loadMeta({ silent: true });
    }, 30000);

    const onVisible = () => {
      if (document.visibilityState === "visible") loadMeta({ silent: true });
    };

    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token) return;
    connectSocket(token);
    return () => disconnectSocket();
  }, [token]);

  useEffect(() => {
    if (!token || !shift) return;

    loadQueue({ silent: false });

    const onInvalidate = () => {
      if (document.visibilityState === "visible") loadQueue({ silent: true });
    };

    socket.on("orders:invalidate", onInvalidate);

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") loadQueue({ silent: true });
    }, 15000);

    return () => {
      clearInterval(interval);
      socket.off("orders:invalidate", onInvalidate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, shift]);

  useEffect(() => {
    if (!token || shift) return;
    loadOpeningStocks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, shift]);

  function addProduct(product, portion) {
  setErr("");
  setMsg("");

  const targetChannel = normalizeChannel(activeChannel);
  const safePortion = portion === "LARGE" ? "LARGE" : "SMALL";

  if (!product?.id) {
    setErr("Produk tidak valid. ID produk tidak ditemukan.");
    return;
  }

  const price = Number(getProductPrice(product, safePortion) || 0);
  const key = itemKey(product.id, safePortion);

  setChannelState((prev) => {
    const empty = makeEmptyChannelState();
    const current = prev[targetChannel] || empty[targetChannel];
    const currentCart = Array.isArray(current.cart) ? current.cart : [];

    const existing = currentCart.find((item) => item.key === key);

    const nextCart = existing
      ? currentCart.map((item) =>
          item.key === key
            ? {
                ...item,
                qty: Number(item.qty || 0) + 1,
                subtotal: (Number(item.qty || 0) + 1) * Number(item.price || 0),
              }
            : item
        )
      : [
          ...currentCart,
          {
            key,
            productId: product.id,
            name: product.name || "Produk",
            portion: safePortion,
            qty: 1,
            price,
            subtotal: price,
            itemNote: "",
          },
        ];

    return {
      ...prev,
      [targetChannel]: {
        ...current,
        cart: nextCart,
      },
    };
  });

  setMsg(`${product.name || "Produk"} ${safePortion} masuk ke Draft Order.`);
}

  function updateQty(key, delta) {
    setActiveState((current) => ({
      cart: current.cart
        .map((item) => {
          if (item.key !== key) return item;

          const qty = Math.max(0, Number(item.qty || 0) + delta);

          return {
            ...item,
            qty,
            subtotal: qty * item.price,
          };
        })
        .filter((item) => item.qty > 0),
    }));
  }

  function updateCartNote(key, itemNote) {
    setActiveState((current) => ({
      cart: current.cart.map((item) => (item.key === key ? { ...item, itemNote } : item)),
    }));
  }

  function removeCartItem(key) {
    setActiveState((current) => ({
      cart: current.cart.filter((item) => item.key !== key),
    }));
  }

  function togglePromo(promoId) {
    setActiveState((current) => ({
      promoIds: current.promoIds.includes(promoId)
        ? current.promoIds.filter((id) => id !== promoId)
        : [...current.promoIds, promoId],
    }));
  }

  function toggleCheckoutPromo(promoId) {
    setCheckout((prev) => ({
      ...prev,
      promoIds: prev.promoIds.includes(promoId)
        ? prev.promoIds.filter((id) => id !== promoId)
        : [...prev.promoIds, promoId],
    }));
  }

  async function openShift() {
    if (openShiftLockRef.current) return;

    openShiftLockRef.current = true;
    setOpenShiftBusy(true);
    setErr("");
    setMsg("");

    try {
      const selected = invStocks.filter((stock) => openStockChecked[stock.id]);

      const hasCireng = invStocks.some((stock) => isCoreStockName(stock.name));
      const selectedCireng = selected.some((stock) => isCoreStockName(stock.name));

      if (hasCireng && !selectedCireng) {
        throw new Error("Cireng wajib dipilih untuk stok awal.");
      }

      const openingStocks = selected.map((stock) => ({
        ingredientId: stock.id,
        qty: Number(openStockQty[stock.id] || 0),
      }));

      const response = await apiPost(
        "/api/shifts/open",
        {
          openingCash: Number(openingCash || 0),
          openingStocks,
        },
        token
      );

      setShift(response.shift || null);

      const [summaryRes, movementRes] = await Promise.all([
        apiGet("/api/shifts/summary", token, { force: true }),
        apiGet("/api/cash/movements", token, { force: true }),
      ]);

      setSummary(summaryRes.summary || null);
      setMovements(movementRes.movements || []);

      await loadQueue({ silent: false });

      setMsg(response?.alreadyOpen ? "Shift yang sudah terbuka dimuat ulang." : "Shift berhasil dibuka.");
    } catch (error) {
      const message = error?.message || "Gagal buka shift";

      if (/sudah|open|terbuka/i.test(message)) {
        try {
          const shiftRes = await apiGet("/api/shifts/current", token, { force: true });
          setShift(shiftRes.shift || null);
          if (shiftRes.shift) {
            await loadSummaryAndCash();
            await loadQueue({ silent: true });
            setMsg("Shift berhasil disinkronkan ulang.");
          } else {
            setErr(message);
          }
        } catch {
          setErr(message);
        }
      } else {
        setErr(message);
      }
    } finally {
      setOpenShiftBusy(false);
      openShiftLockRef.current = false;
    }
  }

  async function closeShift() {
    if (closeShiftBusy) return;

    setCloseShiftBusy(true);
    setErr("");
    setMsg("");

    try {
      const closing = Number(closingCash || 0);
      if (!Number.isFinite(closing) || closing < 0) {
        throw new Error("Kas fisik penutupan tidak valid.");
      }

      const expected = Number(summary?.expectedCash || 0);
      const variance = closing - expected;

      await apiPost("/api/shifts/close", { closingCash: closing }, token);

      setShift(null);
      setSummary(null);
      setMovements([]);
      setQueue([]);
      setChannelState(makeEmptyChannelState());
      setClosingCash(0);
      setCloseShiftOpen(false);
      exitCheckoutView();

      const label = variance === 0 ? "PAS" : variance > 0 ? "LEBIH" : "KURANG";
      setMsg(`Shift ditutup. Selisih ${rupiah(Math.abs(variance))} (${label}).`);
    } catch (error) {
      setErr(error?.message || "Gagal tutup shift");
    } finally {
      setCloseShiftBusy(false);
    }
  }

  async function enqueueOrder() {
  if (enqueueLockRef.current) return;

  enqueueLockRef.current = true;
  setEnqueueBusy(true);
  setErr("");
  setMsg("");

  try {
    if (!shift) {
      throw new Error("Buka shift dulu sebelum membuat antrian.");
    }

    const cartItems = Array.isArray(activeState.cart)
      ? activeState.cart.filter((item) => item && item.productId && Number(item.qty || 0) > 0)
      : [];

    if (!cartItems.length) {
      throw new Error(`Draft order ${getChannelLabel(activeChannel)} masih kosong.`);
    }

    const timeLabel = new Date()
      .toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
      .replace(/\./g, "")
      .replace(/:/g, "");

    const fallbackName = `${getChannelLabel(activeChannel)}-${timeLabel}`;
    const customerName = cleanText(activeState.customerName) || fallbackName;

    const duplicate = queue.some((order) => {
      return (
        normalizeChannel(order.salesChannel) === activeChannel &&
        cleanText(order.customerName).toLowerCase() === customerName.toLowerCase()
      );
    });

    if (duplicate) {
      throw new Error("Nama pelanggan sudah ada di antrian channel ini. Ganti nama/label antrian.");
    }

    const payload = {
      salesChannel: activeChannel,
      customerName,
      note: activeState.note || null,
      items: cartItems.map((item) => ({
        productId: item.productId,
        portion: item.portion === "LARGE" ? "LARGE" : "SMALL",
        qty: Number(item.qty || 0),
        itemNote: item.itemNote || "",
      })),
    };

    const response = await apiPost("/api/orders", payload, token);

    clearActiveCart();

    await Promise.all([
      loadQueue({ silent: false }),
      loadMeta({ silent: true }),
    ]);

    setMsg(`Order ${customerName} berhasil masuk antrian.`);
  } catch (error) {
    setErr(error?.message || "Gagal tambah pesanan ke antrian.");
  } finally {
    setEnqueueBusy(false);
    enqueueLockRef.current = false;
  }
}

  function buildEditRows(order) {
    return (order?.items || []).map((item, index) => ({
      rowId: item.id || `${item.productId || item.product?.id}:${item.portion}:${index}`,
      productId: item.productId || item.product?.id,
      portion: item.portion === "LARGE" ? "LARGE" : "SMALL",
      qty: Number(item.qty || 1),
      itemNote: item.itemNote || "",
    }));
  }

  async function openOrderCheckout(orderId) {
    setErr("");
    setMsg("");

    try {
      const response = await apiGet(`/api/orders/${orderId}`, token, { force: true });
      const order = response.order;
      const channel = normalizeChannel(order?.salesChannel);

      setOpenOrder(order);
      setEditItems(buildEditRows(order));
      setEditNote(order?.note || "");
      setCheckout({
        manualDiscount: 0,
        paymentMethod: getDefaultPayment(channel),
        note: order?.note || "",
        promoIds: [],
      });
      setCashReceived("");
      setEditMode(false);
      setCheckoutView(true);
      setMainTab("SELL");
    } catch (error) {
      setErr(error?.message || "Gagal buka checkout order");
    }
  }

  async function cancelOrder(orderId) {
    setErr("");
    setMsg("");

    try {
      await apiPost(`/api/orders/${orderId}/cancel`, {}, token);
      await loadQueue({ silent: false });

      if (openOrder?.id === orderId) {
        exitCheckoutView();
      }

      setMsg("Order dibatalkan.");
    } catch (error) {
      setErr(error?.message || "Gagal cancel order");
    }
  }

  function patchEditRow(rowId, patch) {
    setEditItems((prev) => prev.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)));
  }

  function removeEditRow(rowId) {
    setEditItems((prev) => prev.filter((row) => row.rowId !== rowId));
  }

  function addEditRow() {
    const channel = normalizeChannel(openOrder?.salesChannel);
    const products = getChannelProducts(meta, channel);
    const first = products[0];
    if (!first) return;

    setEditItems((prev) => [
      ...prev,
      {
        rowId: `new:${Date.now()}`,
        productId: first.id,
        portion: "SMALL",
        qty: 1,
        itemNote: "",
      },
    ]);
  }

  async function saveOrderEdits() {
    if (!openOrder) return;

    setEditBusy(true);
    setErr("");
    setMsg("");

    try {
      const items = editItems.map((row) => ({
        productId: row.productId,
        portion: row.portion === "LARGE" ? "LARGE" : "SMALL",
        qty: Number(row.qty || 0),
        itemNote: row.itemNote || "",
      }));

      if (!items.length) throw new Error("Minimal 1 item.");

      for (const item of items) {
        if (!item.productId) throw new Error("Produk wajib dipilih.");
        if (!Number.isFinite(item.qty) || item.qty <= 0) throw new Error("Qty harus > 0.");
      }

      const response = await apiPost(
        `/api/orders/${openOrder.id}/update`,
        {
          items,
          note: editNote || "",
        },
        token
      );

      setOpenOrder(response.order);
      setCheckout((prev) => ({
        ...prev,
        manualDiscount: 0,
        promoIds: [],
        note: response.order?.note || "",
      }));
      setCashReceived("");
      setEditMode(false);

      await loadQueue({ silent: false });

      setMsg("Order berhasil diupdate.");
    } catch (error) {
      setErr(error?.message || "Gagal update order");
    } finally {
      setEditBusy(false);
    }
  }

  async function processCheckout() {
    if (!openOrder || checkoutLockRef.current) return;

    checkoutLockRef.current = true;
    setCheckoutBusy(true);
    setErr("");
    setMsg("");

    try {
      if (editMode) throw new Error("Simpan atau batalkan edit order dulu.");
      if (checkout.paymentMethod === "CASH" && !checkoutCalc.cashEnough) {
        throw new Error("Nominal uang tunai belum cukup.");
      }

      const method = PAYMENT_METHODS.includes(checkout.paymentMethod)
        ? checkout.paymentMethod
        : "CASH";

      try {
        await apiPost(`/api/orders/${openOrder.id}/paid`, { paid: true }, token);
      } catch {
        // Backend lama mungkin belum punya endpoint paid.
        // File backend akan kita rapikan di tahap berikutnya.
      }

      const response = await apiPost(
        `/api/orders/${openOrder.id}/checkout`,
        {
          manualDiscount: Number(checkout.manualDiscount || 0),
          paymentMethod: method,
          note: checkout.note || null,
          promoIds: checkout.promoIds || [],
          cashReceived:
            method === "CASH" ? Number(cashReceived || 0) : Number(checkoutCalc.netTotal || 0),
        },
        token
      );

      exitCheckoutView();

      await loadSummaryAndCash();
      await loadQueue({ silent: false });

      setMsg(
        `Pembayaran sukses. Total: ${rupiah(response.netTotal || checkoutCalc.netTotal)}${
          method === "CASH" ? ` • Kembalian: ${rupiah(checkoutCalc.change)}` : ""
        }`
      );
    } catch (error) {
      setErr(error?.message || "Gagal proses pembayaran");
    } finally {
      setCheckoutBusy(false);
      checkoutLockRef.current = false;
    }
  }

  async function submitCashMovement() {
    setCashBusy(true);
    setErr("");
    setMsg("");

    try {
      if (!shift) throw new Error("Buka shift dulu.");

      await apiPost(
        "/api/cash/movements",
        {
          type: cashMoveType,
          amount: Number(cashMoveAmount || 0),
          note: cashMoveNote || "",
        },
        token
      );

      setCashMoveAmount(0);
      setCashMoveNote("");

      await loadSummaryAndCash();

      setMsg("Cash movement tersimpan.");
    } catch (error) {
      setErr(error?.message || "Gagal simpan cash movement");
    } finally {
      setCashBusy(false);
    }
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    if (text.includes('"') || text.includes(",") || text.includes("\n")) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function downloadTextFile(filename, text, mime = "text/csv;charset=utf-8") {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function toCSV(rows) {
    return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  }

  function exportShiftCSV() {
    const dayKey = new Date().toLocaleDateString("sv-SE");
    const s = summary || {};

    const rows = [
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
      ...(movements || []).map((movement) => [
        new Date(movement.createdAt).toLocaleString("id-ID"),
        movement.type,
        Number(movement.amount || 0),
        movement.note || "",
      ]),
    ];

    downloadTextFile(`shift-summary-${dayKey}.csv`, toCSV(rows));
  }

  function logout() {
    localStorage.removeItem("cashier_token");
    localStorage.removeItem("cashier_cartId");
    localStorage.removeItem("cashier_cartName");
    disconnectSocket();
    nav("/cashier");
  }

  function renderShiftClosed() {
    return (
      <div className="c5-open-page">
        <section className="pos-card c5-card c5-open-main">
          <SectionTitle
            title="Buka Shift"
            subtitle="Isi kas awal dan pilih stok awal yang dibawa ke gerobak."
            action={<span className="pill pill--neutral">Shift Closed</span>}
          />

          <div className="c5-open-toolbar">
            <label className="c5-field">
              <span>Kas awal</span>
              <input
                type="number"
                min="0"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                placeholder="0"
              />
            </label>

            <button
              className="btn secondary c5-open-refresh"
              type="button"
              onClick={() => loadOpeningStocks({ preserve: true })}
              disabled={invLoading}
            >
              {invLoading ? "Sync..." : "Refresh Stok"}
            </button>
          </div>

          <Alert type="danger">{invErr}</Alert>

          <div className="c5-open-section-title">
            <h4>Stok Awal Gerobak</h4>
            <p>Pilih stok yang dibawa untuk shift ini. Cireng wajib dipilih jika tersedia.</p>
          </div>

          {!invStocks.length ? (
            <EmptyState>Belum ada data stok gerobak.</EmptyState>
          ) : (
            <div className="c5-open-stock-grid">
              {invStocks.map((stock) => {
                const checked = !!openStockChecked[stock.id];

                return (
                  <article
                    key={stock.id}
                    className={`c5-open-stock-card ${checked ? "is-selected" : ""}`}
                  >
                    <label className="c5-open-stock-check">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setOpenStockChecked((prev) => ({
                            ...prev,
                            [stock.id]: e.target.checked,
                          }))
                        }
                      />

                      <span>
                        <b>{stock.name}</b>
                        <small>
                          Sisa cart: {Number(stock.qty || 0)} {stock.unit || ""}
                        </small>
                      </span>
                    </label>

                    <label className="c5-open-stock-input">
                      <span>Qty dibawa</span>
                      <input
                        type="number"
                        min="0"
                        value={openStockQty[stock.id] ?? 0}
                        disabled={!checked}
                        onChange={(e) =>
                          setOpenStockQty((prev) => ({
                            ...prev,
                            [stock.id]: e.target.value,
                          }))
                        }
                      />
                    </label>
                  </article>
                );
              })}
            </div>
          )}

          <div className="c5-open-footer">
            <div>
              <span>Kas awal</span>
              <strong>{rupiah(openingCash)}</strong>
            </div>

            <button
              className="btn primary c5-open-submit"
              type="button"
              onClick={openShift}
              disabled={openShiftBusy}
            >
              {openShiftBusy ? "Membuka Shift..." : "Buka Shift"}
            </button>
          </div>
        </section>

        <aside className="pos-card c5-card c5-open-side">
          <SectionTitle
            title="Ringkasan Stok Central"
            subtitle="Referensi stok pusat sebelum shift dibuka."
          />

          {!invCentralStocks.length ? (
            <EmptyState>Belum ada stok central.</EmptyState>
          ) : (
            <div className="c5-central-grid">
              {invCentralStocks.slice(0, 16).map((stock) => (
                <div key={stock.id} className="c5-central-card">
                  <span>{stock.name}</span>
                  <b>
                    {Number(stock.qty || 0)} {stock.unit || ""}
                  </b>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    );
  }

  function renderMenuCards() {
    return (
      <section className="pos-card c5-card c5-menu-panel">
        <SectionTitle
          title="Menu"
          subtitle="Pilih produk, lalu masukkan ke draft order."
        />

        <Tabs items={CHANNEL_TABS} value={activeChannel} onChange={setActiveChannel} />

        <div className="c5-search">
          <input
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            placeholder="Cari menu..."
          />
        </div>

        <div className="c5m-grid">
          {!visibleProducts.length ? (
            <EmptyState>Tidak ada menu yang cocok.</EmptyState>
          ) : (
            visibleProducts.map((product) => (
              <article key={product.id} className="c5m-card">
                <div className="c5m-card__top">
                  <div className="c5m-card__title">
                    <h4>{product.name}</h4>
                    <p>{getChannelLabel(activeChannel)}</p>
                  </div>
                </div>

                <div className="c5m-card__actions">
                  <button
                    type="button"
                    className="c5m-action"
                    onClick={() => addProduct(product, "SMALL")}
                  >
                    <span className="c5m-action__label">Small</span>
                    <span className="c5m-action__price">{rupiah(product.priceSmall)}</span>
                  </button>

                  <button
                    type="button"
                    className="c5m-action"
                    onClick={() => addProduct(product, "LARGE")}
                  >
                    <span className="c5m-action__label">Large</span>
                    <span className="c5m-action__price">{rupiah(product.priceLarge)}</span>
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    );
  }

  function renderOrderDraft() {
  const draftQty = activeState.cart.reduce((sum, item) => sum + Number(item.qty || 0), 0);

  return (
    <section className="pos-card c5-card c5-draft-panel">
      <SectionTitle
        title="Draft Order"
        subtitle="Semua order harus dikirim ke antrian sebelum checkout."
        action={
          <button
            className="btn secondary btn--sm"
            type="button"
            onClick={clearActiveCart}
            disabled={!activeState.cart.length}
          >
            Reset
          </button>
        }
      />

      <div className="c5-draft-summary">
        <div>
          <span>Channel</span>
          <b>{getChannelLabel(activeChannel)}</b>
        </div>
        <div>
          <span>Qty</span>
          <b>{draftQty}</b>
        </div>
        <div>
          <span>Total</span>
          <b>{rupiah(cartCalc.gross)}</b>
        </div>
      </div>

      <div className="c5-form-stack">
        <label className="c5-field">
          <span>Nama / label antrian</span>
          <input
            value={activeState.customerName}
            onChange={(e) => setActiveState({ customerName: e.target.value })}
            placeholder="Opsional. Jika kosong otomatis."
          />
        </label>

        <label className="c5-field">
          <span>Catatan order</span>
          <textarea
            rows={2}
            value={activeState.note}
            onChange={(e) => setActiveState({ note: e.target.value })}
            placeholder="Contoh: saus dipisah, pedas, dll."
          />
        </label>
      </div>

      <div className="c5-draft-items">
        {!activeState.cart.length ? (
          <div className="c5-draft-empty">
            <b>Belum ada item</b>
            <span>Klik tombol Small atau Large pada menu.</span>
          </div>
        ) : (
          activeState.cart.map((item) => (
            <div key={item.key} className="c5-draft-item">
              <div className="c5-draft-item__top">
                <div>
                  <h4>{item.name}</h4>
                  <p>
                    {item.portion} • {rupiah(item.price)}
                  </p>
                </div>
                <strong>{rupiah(item.subtotal)}</strong>
              </div>

              <div className="c5-draft-item__bottom">
                <div className="c5-qty">
                  <button type="button" onClick={() => updateQty(item.key, -1)}>
                    -
                  </button>
                  <b>{item.qty}</b>
                  <button type="button" onClick={() => updateQty(item.key, 1)}>
                    +
                  </button>
                </div>

                <input
                  value={item.itemNote || ""}
                  onChange={(e) => updateCartNote(item.key, e.target.value)}
                  placeholder="Catatan item"
                />

                <button
                  className="c5-remove"
                  type="button"
                  onClick={() => removeCartItem(item.key)}
                >
                  Hapus
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="c5-draft-footer">
        <div>
          <span>Total Menu</span>
          <strong>{rupiah(cartCalc.gross)}</strong>
        </div>

        {activeChannel === "GOJEK" ? (
          <small>
            Fee Gojek {Number(cartCalc.feePercent || 0).toFixed(2)}% akan dihitung saat checkout.
          </small>
        ) : null}

        <button
          className="btn primary c5-send-queue"
          type="button"
          onClick={enqueueOrder}
          disabled={enqueueBusy || !activeState.cart.length || !shift}
        >
          {enqueueBusy
            ? "Mengirim..."
            : !shift
            ? "Buka Shift Dulu"
            : !activeState.cart.length
            ? "Pilih Menu Dulu"
            : "Kirim ke Antrian"}
        </button>
      </div>
    </section>
  );
}

  function renderQueuePanel() {
    return (
      <aside className="pos-card cashier-card cashier-card--queue">
        <SectionTitle
          title="Antrian"
          subtitle="Buka order dari sini untuk proses pembayaran."
          action={
            <button
              className="btn secondary btn--sm"
              type="button"
              onClick={() => loadQueue({ silent: false })}
              disabled={queueLoading}
            >
              {queueLoading ? "Sync..." : "Refresh"}
            </button>
          }
        />

        <Tabs items={CHANNEL_TABS} value={activeChannel} onChange={setActiveChannel} />

        <Alert type="danger">{queueErr}</Alert>

        <div className="cashier-queue-summary">
          <Kpi label="Open" value={activeQueue.length} />
          <Kpi
            label="Paid"
            value={activeQueue.filter((order) => order.status === "PENDING_PAID").length}
          />
        </div>

        {!activeQueue.length ? (
          <EmptyState>Tidak ada antrian {getChannelLabel(activeChannel)}.</EmptyState>
        ) : (
          <div className="cashier-queue-list">
            {activeQueue.map((order) => (
              <div
                key={order.id}
                className={`cashier-queue-card ${order.status === "PENDING_PAID" ? "is-paid" : ""}`}
              >
                <div className="cashier-queue-card__top">
                  <div>
                    <h4>{order.customerName}</h4>
                    <p>
                      {toTime(order.createdAt)} • {order.itemCount || 0} item
                    </p>
                  </div>

                  <span className={order.status === "PENDING_PAID" ? "pill pill--ok" : "pill pill--neutral"}>
                    {order.status === "PENDING_PAID" ? "Paid" : "Open"}
                  </span>
                </div>

                <div className="cashier-queue-card__bottom">
                  <b>{rupiah(order.grossTotal)}</b>
                  <button
                    className="btn primary btn--sm"
                    type="button"
                    onClick={() => openOrderCheckout(order.id)}
                  >
                    Checkout
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>
    );
  }

  function renderSellTab() {
  if (checkoutView && openOrder) return renderCheckoutPage();

  return (
    <div className="c5-sell-page">
      <section className="c5-top-stats">
        <Kpi label="Shift" value={shift ? "OPEN" : "CLOSED"} hint={cartName} tone="soft" />
        <Kpi label="Regular Queue" value={regularQueue.length} />
        <Kpi label="Gojek Queue" value={gojekQueue.length} />
        <Kpi label="Expected Cash" value={rupiah(summary?.expectedCash || 0)} tone="soft" />
      </section>

      <div className="c5-sell-grid">
        <div>{renderMenuCards()}</div>
        <div>{renderOrderDraft()}</div>
        <div>{renderQueuePanel()}</div>
      </div>
    </div>
  );
}

  function renderCheckoutPage() {
    const channel = normalizeChannel(openOrder.salesChannel);
    const products = getChannelProducts(meta, channel);
    const promos = getChannelPromos(meta, channel);
    const productsMap = new Map(products.map((p) => [p.id, p]));
    const isCash = checkout.paymentMethod === "CASH";

    return (
      <div className="cashier-checkout-page">
        <section className="cashier-checkout-topbar">
          <button className="btn secondary" type="button" onClick={exitCheckoutView}>
            ← Kembali ke Order
          </button>

          <div>
            <h2>Checkout Pesanan</h2>
            <p>
              {openOrder.customerName} • {getChannelLabel(channel)} • {openOrder.status}
            </p>
          </div>

          <span className="pill pill--soft">#{String(openOrder.id || "").slice(-6)}</span>
        </section>

        <div className="cashier-checkout-layout">
          <section className="pos-card cashier-checkout-detail">
            <div className="cashier-checkout-detail__head">
              <div>
                <h3>Detail Pesanan</h3>
                <p>Review item sebelum pembayaran diproses.</p>
              </div>

              <button
                className="btn secondary btn--sm"
                type="button"
                onClick={() => {
                  setEditMode((prev) => !prev);
                  setEditItems(buildEditRows(openOrder));
                  setEditNote(openOrder.note || "");
                }}
              >
                {editMode ? "Batal Edit" : "Edit Pesanan"}
              </button>
            </div>

            {!editMode ? (
              <div className="cashier-checkout-items">
                {(openOrder.items || []).map((item) => (
                  <div key={item.id} className="cashier-checkout-item">
                    <div className="cashier-checkout-item__image">
                      <span>{String(item.product?.name || "M").slice(0, 1).toUpperCase()}</span>
                    </div>

                    <div className="cashier-checkout-item__info">
                      <h4>{item.product?.name || item.productId}</h4>
                      <p>
                        {item.qty}x • {item.portion} • {rupiah(item.price || 0)}
                      </p>
                      {item.itemNote ? <small>{item.itemNote}</small> : null}
                    </div>

                    <strong>{rupiah(Number(item.price || 0) * Number(item.qty || 0))}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className="cashier-edit-list">
                {editItems.map((row) => (
                  <div key={row.rowId} className="cashier-edit-row">
                    <select
                      value={row.productId || ""}
                      onChange={(e) => patchEditRow(row.rowId, { productId: e.target.value })}
                    >
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </select>

                    <select
                      value={row.portion}
                      onChange={(e) => patchEditRow(row.rowId, { portion: e.target.value })}
                    >
                      <option value="SMALL">SMALL</option>
                      <option value="LARGE">LARGE</option>
                    </select>

                    <input
                      type="number"
                      min="1"
                      value={row.qty}
                      onChange={(e) => patchEditRow(row.rowId, { qty: e.target.value })}
                    />

                    <input
                      value={row.itemNote}
                      onChange={(e) => patchEditRow(row.rowId, { itemNote: e.target.value })}
                      placeholder="Catatan"
                    />

                    <button type="button" onClick={() => removeEditRow(row.rowId)}>
                      Hapus
                    </button>
                  </div>
                ))}

                <label className="cashier-field">
                  <span>Catatan order</span>
                  <textarea rows={2} value={editNote} onChange={(e) => setEditNote(e.target.value)} />
                </label>

                <div className="cashier-actions">
                  <button className="btn secondary" type="button" onClick={addEditRow}>
                    Tambah Item
                  </button>
                  <button className="btn primary" type="button" onClick={saveOrderEdits} disabled={editBusy}>
                    {editBusy ? "Menyimpan..." : "Simpan Edit"}
                  </button>
                </div>
              </div>
            )}

            <div className="cashier-checkout-total-box">
              <div>
                <span>Subtotal</span>
                <b>{rupiah(checkoutCalc.gross)}</b>
              </div>

              {channel === "GOJEK" ? (
                <>
                  <div>
                    <span>Fee Gojek {Number(checkoutCalc.feePercent || 0).toFixed(2)}%</span>
                    <b>- {rupiah(checkoutCalc.platformFeeAmount)}</b>
                  </div>
                  <div>
                    <span>Subtotal Setelah Fee</span>
                    <b>{rupiah(checkoutCalc.subtotalAfterFee)}</b>
                  </div>
                </>
              ) : null}

              <div>
                <span>Diskon Manual</span>
                <b>- {rupiah(checkoutCalc.manualDiscount)}</b>
              </div>

              <div>
                <span>Diskon Promo</span>
                <b>- {rupiah(checkoutCalc.promoDiscount)}</b>
              </div>

              {checkoutCalc.promoPreview.bonusItems.length ? (
                <div>
                  <span>Bonus</span>
                  <b>
                    {checkoutCalc.promoPreview.bonusItems
                      .map((item) => `${item.name} x${item.qty}`)
                      .join(", ")}
                  </b>
                </div>
              ) : null}

              <div className="cashier-checkout-total-box__grand">
                <span>Total Tagihan</span>
                <strong>{rupiah(checkoutCalc.netTotal)}</strong>
              </div>
            </div>
          </section>

          <aside className="pos-card cashier-payment-panel">
            <SectionTitle
              title="Pembayaran"
              subtitle="Pilih metode, isi nominal, lalu proses bayar."
            />

            <div className="cashier-payment-methods">
              <button
                type="button"
                className={checkout.paymentMethod === "CASH" ? "is-active" : ""}
                onClick={() => setCheckout((prev) => ({ ...prev, paymentMethod: "CASH" }))}
              >
                <span>💵</span>
                <b>Tunai</b>
              </button>

              <button
                type="button"
                className={checkout.paymentMethod === "QRIS" ? "is-active" : ""}
                onClick={() => {
                  setCheckout((prev) => ({ ...prev, paymentMethod: "QRIS" }));
                  setCashReceived("");
                }}
              >
                <span>▣</span>
                <b>QRIS</b>
              </button>

              <button
                type="button"
                className={checkout.paymentMethod === "TRANSFER" ? "is-active" : ""}
                onClick={() => {
                  setCheckout((prev) => ({ ...prev, paymentMethod: "TRANSFER" }));
                  setCashReceived("");
                }}
              >
                <span>⇄</span>
                <b>Transfer</b>
              </button>
            </div>

            <div className="cashier-payment-form">
              <div className="cashier-form-grid">
                <label className="cashier-field">
                  <span>Diskon manual</span>
                  <input
                    type="number"
                    min="0"
                    value={checkout.manualDiscount}
                    onChange={(e) => setCheckout((prev) => ({ ...prev, manualDiscount: e.target.value }))}
                  />
                </label>

                <label className="cashier-field">
                  <span>Metode</span>
                  <select
                    value={checkout.paymentMethod}
                    onChange={(e) => {
                      setCheckout((prev) => ({ ...prev, paymentMethod: e.target.value }));
                      if (e.target.value !== "CASH") setCashReceived("");
                    }}
                  >
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="cashier-field">
                <span>Catatan checkout</span>
                <textarea
                  rows={2}
                  value={checkout.note}
                  onChange={(e) => setCheckout((prev) => ({ ...prev, note: e.target.value }))}
                  placeholder="Catatan pembayaran"
                />
              </label>
            </div>

            <div className="cashier-block">
              <div className="cashier-block__head">
                <h4>Promo Checkout</h4>
              </div>

              {!promos.length ? (
                <EmptyState>Tidak ada promo aktif.</EmptyState>
              ) : (
                <div className="cashier-promo-list">
                  {promos.map((promo) => {
                    const checked = checkout.promoIds.includes(promo.id);

                    return (
                      <label key={promo.id} className={`cashier-promo-card ${checked ? "is-active" : ""}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggleCheckoutPromo(promo.id)} />
                        <span>
                          <b>{promo.name}</b>
                          <small>{promoText(promo, productsMap)}</small>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {isCash ? (
              <div className="cashier-cash-box">
                <label className="cashier-field">
                  <span>Nominal uang tunai</span>
                  <div className="cashier-money-input">
                    <small></small>
                    <input
                      type="number"
                      min="0"
                      value={cashReceived}
                      onChange={(e) => setCashReceived(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </label>

                <div className="cashier-cash-presets">
                  <button type="button" onClick={() => setCashReceived(String(checkoutCalc.netTotal))}>
                    PAS
                  </button>
                  {cashPresets.map((value) => (
                    <button key={value} type="button" onClick={() => setCashReceived(String(value))}>
                      {shortRupiah(value)}
                    </button>
                  ))}
                </div>

                <div className={`cashier-change-box ${checkoutCalc.cashEnough ? "is-ok" : "is-warning"}`}>
                  <span>Kembalian</span>
                  <strong>{rupiah(checkoutCalc.change)}</strong>
                  {!checkoutCalc.cashEnough ? <small>Nominal tunai belum cukup.</small> : null}
                </div>
              </div>
            ) : (
              <div className="cashier-noncash-box">
                <span>Total Non-Tunai</span>
                <strong>{rupiah(checkoutCalc.netTotal)}</strong>
                <small>Pastikan pembayaran sudah masuk sebelum proses bayar.</small>
              </div>
            )}

            <button
              className="btn primary cashier-process-pay-btn"
              type="button"
              onClick={processCheckout}
              disabled={checkoutBusy || editMode || !checkoutCalc.cashEnough}
            >
              {checkoutBusy ? "Memproses..." : "Proses Bayar"}
            </button>

            <div className="cashier-checkout-secondary-actions">
              <button className="btn secondary" type="button" onClick={exitCheckoutView}>
                Simpan Draft
              </button>

              <button className="btn danger" type="button" onClick={() => cancelOrder(openOrder.id)}>
                Batalkan
              </button>
            </div>
          </aside>
        </div>
      </div>
    );
  }

  function renderCashTab() {
    const filtered =
      cashFilter === "ALL"
        ? movements
        : movements.filter((movement) => movement.type === cashFilter);

    return (
      <div className="cashier-grid-2">
        <section className="pos-card cashier-card">
          <SectionTitle
            title="Cash Movement"
            subtitle="Catat uang masuk atau keluar di luar transaksi penjualan."
          />

          <div className="cashier-form-grid">
            <label className="cashier-field">
              <span>Tipe</span>
              <select value={cashMoveType} onChange={(e) => setCashMoveType(e.target.value)}>
                <option value="CASH_IN">Cash In</option>
                <option value="CASH_OUT">Cash Out</option>
              </select>
            </label>

            <label className="cashier-field">
              <span>Nominal</span>
              <input
                type="number"
                min="0"
                value={cashMoveAmount}
                onChange={(e) => setCashMoveAmount(e.target.value)}
              />
            </label>
          </div>

          <label className="cashier-field">
            <span>Catatan</span>
            <textarea
              rows={3}
              value={cashMoveNote}
              onChange={(e) => setCashMoveNote(e.target.value)}
              placeholder="Contoh: beli es batu / tambahan modal"
            />
          </label>

          <button className="btn primary cashier-wide-action" type="button" onClick={submitCashMovement} disabled={cashBusy}>
            {cashBusy ? "Menyimpan..." : "Simpan Cash Movement"}
          </button>
        </section>

        <section className="pos-card cashier-card">
          <SectionTitle
            title="Riwayat Cash"
            subtitle="Cash in dan cash out selama shift."
            action={
              <button className="btn secondary btn--sm" type="button" onClick={exportShiftCSV}>
                Export CSV
              </button>
            }
          />

          <Tabs
            items={[
              { value: "ALL", label: "Semua" },
              { value: "CASH_IN", label: "Cash In" },
              { value: "CASH_OUT", label: "Cash Out" },
            ]}
            value={cashFilter}
            onChange={setCashFilter}
          />

          {!filtered.length ? (
            <EmptyState>Belum ada cash movement.</EmptyState>
          ) : (
            <div className="cashier-mini-list">
              {filtered.map((movement) => (
                <div key={movement.id} className="cashier-mini-row">
                  <span>
                    <b>{movement.type}</b>
                    <small>{movement.note || "-"}</small>
                  </span>
                  <b>{rupiah(movement.amount)}</b>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  function renderShiftTab() {
    const expectedCash = Number(summary?.expectedCash || 0);
    const closing = Number(closingCash || 0);
    const variance = closing - expectedCash;

    return (
      <div className="cashier-grid-2">
        <section className="pos-card cashier-card">
          <SectionTitle
            title="Ringkasan Shift"
            subtitle="Pantau kas dan penjualan shift berjalan."
            action={
              <button className="btn secondary btn--sm" type="button" onClick={loadSummaryAndCash}>
                Refresh
              </button>
            }
          />

          <section className="cashier-summary-bar cashier-summary-bar--compact">
            <Kpi label="Kas Awal" value={rupiah(summary?.openingCash)} />
            <Kpi label="Cash Sales" value={rupiah(summary?.cashSales)} />
            <Kpi label="QRIS Sales" value={rupiah(summary?.qrisSales)} />
            <Kpi label="Cash In" value={rupiah(summary?.cashIn)} />
            <Kpi label="Cash Out" value={rupiah(summary?.cashOut)} />
            <Kpi label="Expected Cash" value={rupiah(summary?.expectedCash)} tone="soft" />
          </section>

          <div className="cashier-block">
            <div className="cashier-form-grid">
              <label className="cashier-field">
                <span>Kas fisik saat tutup</span>
                <input
                  type="number"
                  min="0"
                  value={closingCash}
                  onChange={(e) => setClosingCash(e.target.value)}
                />
              </label>
            </div>

            <section className="cashier-summary-bar cashier-summary-bar--compact">
              <Kpi label="Expected" value={rupiah(expectedCash)} />
              <Kpi label="Fisik" value={rupiah(closing)} />
              <Kpi
                label="Selisih"
                value={rupiah(Math.abs(variance))}
                hint={variance === 0 ? "PAS" : variance > 0 ? "LEBIH" : "KURANG"}
                tone="soft"
              />
            </section>

            <div className="cashier-actions">
              <button className="btn secondary" type="button" onClick={exportShiftCSV}>
                Export Shift CSV
              </button>
              <button className="btn danger" type="button" onClick={() => setCloseShiftOpen(true)}>
                Tutup Shift
              </button>
            </div>
          </div>
        </section>

        
      </div>
    );
  }

  function renderCloseShiftModal() {
    if (!closeShiftOpen) return null;

    const expectedCash = Number(summary?.expectedCash || 0);
    const physicalCash = Number(closingCash || 0);
    const variance = physicalCash - expectedCash;

    const varianceLabel = variance === 0 ? "PAS" : variance > 0 ? "LEBIH" : "KURANG";
    const varianceTone = variance === 0 ? "ok" : variance > 0 ? "plus" : "minus";

    return (
      <div className="modal-backdrop">
        <div className="modal-card c5-close-shift-modal">
          <div className="c5-close-head">
            <div>
              <span className="c5-close-eyebrow">Closing Shift</span>
              <h3>Konfirmasi Tutup Shift</h3>
              <p>Pastikan kas fisik sudah dihitung sebelum menutup shift.</p>
            </div>

            <button
              className="c5-close-x"
              type="button"
              onClick={() => setCloseShiftOpen(false)}
              aria-label="Tutup"
            >
              ×
            </button>
          </div>

          <div className="c5-close-stats">
            <div className="c5-close-stat">
              <span>Expected Cash</span>
              <strong>{rupiah(expectedCash)}</strong>
            </div>

            <div className="c5-close-stat">
              <span>Kas Fisik</span>
              <strong>{rupiah(physicalCash)}</strong>
            </div>

            <div className={`c5-close-stat c5-close-stat--${varianceTone}`}>
              <span>Selisih</span>
              <strong>{rupiah(Math.abs(variance))}</strong>
              <small>{varianceLabel}</small>
            </div>
          </div>

          <div className="c5-close-input-box">
            <label className="c5-field">
              <span>Masukkan kas fisik</span>
              <input
                type="number"
                min="0"
                value={closingCash}
                onChange={(e) => setClosingCash(e.target.value)}
                placeholder="0"
                autoFocus
              />
            </label>

            <div className={`c5-close-note c5-close-note--${varianceTone}`}>
              {variance === 0 ? (
                <>
                  <b>Kas sudah sesuai.</b>
                  <span>Shift dapat ditutup tanpa selisih.</span>
                </>
              ) : variance > 0 ? (
                <>
                  <b>Kas lebih {rupiah(Math.abs(variance))}.</b>
                  <span>Pastikan tidak ada transaksi/cash in yang belum tercatat.</span>
                </>
              ) : (
                <>
                  <b>Kas kurang {rupiah(Math.abs(variance))}.</b>
                  <span>Periksa ulang transaksi, cash out, dan kas fisik sebelum menutup shift.</span>
                </>
              )}
            </div>
          </div>

          <div className="c5-close-footer">
            <button
              className="btn secondary"
              type="button"
              onClick={() => setCloseShiftOpen(false)}
            >
              Batal
            </button>

            <button
              className="btn danger c5-close-submit"
              type="button"
              onClick={closeShift}
              disabled={closeShiftBusy}
            >
              {closeShiftBusy ? "Menutup..." : "Tutup Shift"}
            </button>
          </div>
        </div>
      </div>
    );
  }

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
        subtitle="Sinkronisasi menu, promo, shift, dan antrian."
        hint="Biasanya hanya beberapa detik."
        tone="accent"
      />
    );
  }

  return (
    <div className="pos-bg">
      <div className="pos-shell cashier-v5-shell">
        <div className="pos-stack">
          <header className="pos-card cashier-header">
            <div className="cashier-header__main">
              <div>
                <p className="cashier-header__eyebrow">Cashier Workspace</p>
                <h2 className="pos-title">{cartName}</h2>
                <div className="pos-chips">
                  {shift ? (
                    <span className="pill pill--ok">Shift OPEN</span>
                  ) : (
                    <span className="pill pill--neutral">Shift CLOSED</span>
                  )}
                  <span className="pill pill--soft">Regular {regularQueue.length}</span>
                  <span className="pill pill--soft">Gojek {gojekQueue.length}</span>
                  <span className="pill pill--soft">Sync {syncText}</span>
                </div>
              </div>

              <div className="cashier-header__actions">
                {shift ? (
                  <button className="btn secondary btn--sm" type="button" onClick={() => loadQueue({ silent: false })}>
                    Refresh
                  </button>
                ) : null}

                {shift ? (
                  <button className="btn danger btn--sm" type="button" onClick={() => setCloseShiftOpen(true)}>
                    Tutup Shift
                  </button>
                ) : null}

                <button className="btn secondary btn--sm" type="button" onClick={logout}>
                  Logout
                </button>
              </div>
            </div>

            <Alert type="danger">{err}</Alert>
            <Alert type="ok">{msg}</Alert>
          </header>

          {!shift ? (
            renderShiftClosed()
          ) : (
            <>
              {!checkoutView ? (
                <section className="pos-card cashier-nav-card">
                  <Tabs items={MAIN_TABS} value={mainTab} onChange={setMainTab} />
                </section>
              ) : null}

              {mainTab === "SELL" ? renderSellTab() : null}
              {mainTab === "CASH" && !checkoutView ? renderCashTab() : null}
              {mainTab === "SHIFT" && !checkoutView ? renderShiftTab() : null}
              {mainTab === "STOCK" && !checkoutView ? (
                <CashierStockPanel token={token} meta={meta} shift={shift} cartName={cartName} />
              ) : null}
            </>
          )}

          {renderCloseShiftModal()}
        </div>
      </div>
    </div>
  );
}