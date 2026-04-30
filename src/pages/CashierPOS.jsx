import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost } from "../api";
import { useNavigate } from "react-router-dom";
import LoadingScreen from "../components/ui/LoadingScreen";
import Tabs from "../components/ui/Tabs";
import CashierStockPanel from "../components/pos/CashierStockPanel";
import { socket, connectSocket, disconnectSocket } from "../socket";

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

function normName(value) {
  return String(value || "").trim();
}

function isCoreStockName(name) {
  const n = String(name || "").trim().toLowerCase();
  return n === "cireng";
}

function buildPromoPreview({ promos = [], selectedPromoIds = [], gross = 0, products = [] }) {
  const safeGross = Math.max(0, Number(gross || 0));
  const selectedIds = Array.isArray(selectedPromoIds)
    ? selectedPromoIds.filter(Boolean)
    : [];

  if (!selectedIds.length || !Array.isArray(promos) || promos.length === 0) {
    return {
      discountTotal: 0,
      discountBreakdown: [],
      bonusItems: [],
      appliedPromoIds: [],
      skippedPromos: [],
    };
  }

  const promoMap = new Map(promos.map((promo) => [promo.id, promo]));
  const productMap = new Map((products || []).map((product) => [product.id, product]));

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

      if (Number.isFinite(pct) && pct > 0) {
        const amount = Math.floor((safeGross * pct) / 100);

        discountTotal += amount;
        discountBreakdown.push({
          id: promo.id,
          name: promo.name,
          label: `${Number(pct)}%`,
          amount,
          type: promo.type,
        });
      }

      continue;
    }

    if (promo.type === "DISCOUNT_AMOUNT") {
      const amount = Math.round(Number(promo.discountAmount || 0));

      if (Number.isFinite(amount) && amount > 0) {
        discountTotal += amount;
        discountBreakdown.push({
          id: promo.id,
          name: promo.name,
          label: rupiah(amount),
          amount,
          type: promo.type,
        });
      }

      continue;
    }

    if (promo.type === "BONUS_ITEM") {
      const qty = Math.round(Number(promo.bonusQty || 0));

      if (!promo.bonusProductId || qty <= 0) continue;

      const portion = promo.bonusPortion === "LARGE" ? "LARGE" : "SMALL";
      const key = `${promo.bonusProductId}:${portion}`;
      const product = productMap.get(promo.bonusProductId);

      const current = bonusBucket.get(key) || {
        key,
        productId: promo.bonusProductId,
        name: product?.name || "(Produk Bonus)",
        portion,
        qty: 0,
        price: 0,
        subtotal: 0,
        promoNames: [],
      };

      current.qty += qty;
      current.promoNames = [...current.promoNames, promo.name].filter(Boolean);

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

function promoSummaryText(promo, productsMap = new Map()) {
  if (!promo) return "-";

  const minText = `Min ${rupiah(promo.minSubtotal || 0)}`;

  if (promo.type === "DISCOUNT_PERCENT") {
    return `Diskon ${promo.discountPercent || 0}% (${minText})`;
  }

  if (promo.type === "DISCOUNT_AMOUNT") {
    return `Potongan ${rupiah(promo.discountAmount || 0)} (${minText})`;
  }

  const bonusProduct = productsMap.get(promo.bonusProductId);
  const bonusName = bonusProduct?.name || "Produk bonus";
  const bonusPortion = promo.bonusPortion === "LARGE" ? "LARGE" : "SMALL";

  return `Gratis ${bonusName} x${promo.bonusQty || 0} • ${bonusPortion} (${minText})`;
}

function getChannelLabel(channel) {
  return channel === "GOJEK" ? "Gojek" : "Regular";
}

function getChannelProducts(meta, channel) {
  if (channel === "GOJEK") {
    return meta?.gojekProducts || meta?.products || [];
  }

  return meta?.regularProducts || meta?.products || [];
}

function getChannelPromos(meta, channel) {
  if (channel === "GOJEK") {
    return meta?.gojekPromos || meta?.promos || [];
  }

  return meta?.regularPromos || meta?.promos || [];
}

function getChannelFeePercent(meta, channel) {
  if (channel === "GOJEK") return Number(meta?.gojekFeePercent || 21.09);
  return 0;
}

function calcChannelFee(amount, percent) {
  const base = Math.max(0, Number(amount || 0));
  const pct = Math.max(0, Number(percent || 0));

  return Math.floor((base * pct) / 100);
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

function MiniStat({ label, value, note }) {
  return (
    <div className="adm-check-item">
      <div className="adm-kpi-label">{label}</div>
      <div className="adm-list-title">{value}</div>
      {note ? <div className="field-hint">{note}</div> : null}
    </div>
  );
}

function TotalSummary({
  channel,
  gross,
  manualDiscount,
  promoDiscount,
  platformFeePercent,
  platformFeeAmount,
  subtotalAfterFee,
  totalDiscount,
  netTotal,
}) {
  const isGojek = channel === "GOJEK";

  return (
    <div className="pos-totalbar">
      <div className="adm-form-grid">
        <MiniStat label="Total Menu" value={rupiah(gross)} />
        <MiniStat label="Diskon Manual" value={`- ${rupiah(manualDiscount)}`} />
        <MiniStat label="Diskon Promo" value={`- ${rupiah(promoDiscount)}`} />

        {isGojek ? (
          <>
            <MiniStat
              label={`Fee Gojek (${Number(platformFeePercent || 0).toFixed(2)}%)`}
              value={`- ${rupiah(platformFeeAmount)}`}
            />
            <MiniStat label="Subtotal Setelah Fee" value={rupiah(subtotalAfterFee)} />
            <MiniStat label="Total Diskon" value={`- ${rupiah(totalDiscount)}`} />
          </>
        ) : null}
      </div>

      <div>
        <div className="muted">Total Akhir</div>
        <div className="pos-total">{rupiah(netTotal)}</div>
      </div>
    </div>
  );
}

function EmptyBox({ children }) {
  return <div className="pos-soft-box muted">{children}</div>;
}

export default function CashierPOS() {
  const nav = useNavigate();

  const token = localStorage.getItem("cashier_token");
  const cartName = localStorage.getItem("cashier_cartName") || "Gerobak";

  const [meta, setMeta] = useState(null);
  const [metaSyncAt, setMetaSyncAt] = useState(null);
  const [metaSyncErr, setMetaSyncErr] = useState("");
  const metaSigRef = useRef("");

  const [shift, setShift] = useState(null);
  const [openingCash, setOpeningCash] = useState(0);
  const [closingCash, setClosingCash] = useState(0);
  const [summary, setSummary] = useState(null);
  const [movements, setMovements] = useState([]);
  const [cashMoveType, setCashMoveType] = useState("CASH_OUT");
  const [cashMoveAmount, setCashMoveAmount] = useState(0);
  const [cashMoveNote, setCashMoveNote] = useState("");

  const [invStocks, setInvStocks] = useState([]);
  const [invCentralStocks, setInvCentralStocks] = useState([]);
  const [invLoading, setInvLoading] = useState(false);
  const [invErr, setInvErr] = useState("");
  const [openStockChecked, setOpenStockChecked] = useState({});
  const [openStockQty, setOpenStockQty] = useState({});

  const [cartByChannel, setCartByChannel] = useState({
    REGULAR: [],
    GOJEK: [],
  });

  const [promoIdsByChannel, setPromoIdsByChannel] = useState({
    REGULAR: [],
    GOJEK: [],
  });

  const [discountByChannel, setDiscountByChannel] = useState({
    REGULAR: 0,
    GOJEK: 0,
  });

  const [paymentMethodByChannel, setPaymentMethodByChannel] = useState({
    REGULAR: "CASH",
    GOJEK: "QRIS",
  });

  const [noteByChannel, setNoteByChannel] = useState({
    REGULAR: "",
    GOJEK: "",
  });

  const [customerNameByChannel, setCustomerNameByChannel] = useState({
    REGULAR: "",
    GOJEK: "",
  });

  const [queue, setQueue] = useState([]);
  const [qErr, setQErr] = useState("");
  const [qLoading, setQLoading] = useState(false);

  const [openOrder, setOpenOrder] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const [checkout, setCheckout] = useState({
    manualDiscount: 0,
    paymentMethod: "CASH",
    note: "",
    promoIds: [],
  });

  const [editMode, setEditMode] = useState(false);
  const [editItems, setEditItems] = useState([]);
  const [editNote, setEditNote] = useState("");
  const [paidBusy, setPaidBusy] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  const checkoutLockRef = useRef(false);

  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const [booting, setBooting] = useState(true);

  const [mainTab, setMainTab] = useState("SELL");
  const [cashTab, setCashTab] = useState("ALL");

  const [closeShiftOpen, setCloseShiftOpen] = useState(false);
  const [closeShiftBusy, setCloseShiftBusy] = useState(false);

  const qSigRef = useRef("");
  const qReqRef = useRef(0);
  const qDidFirstLoadRef = useRef(false);

  const [saleBusy, setSaleBusy] = useState(false);
  const [openShiftBusy, setOpenShiftBusy] = useState(false);

  const saleLockRef = useRef(false);
  const openShiftLockRef = useRef(false);

  const activeSalesChannel = mainTab === "GOJEK" ? "GOJEK" : "REGULAR";
  const activeChannelLabel = getChannelLabel(activeSalesChannel);

  const activeCart = cartByChannel[activeSalesChannel] || [];
  const activePromoIds = promoIdsByChannel[activeSalesChannel] || [];
  const activeDiscount = Number(discountByChannel[activeSalesChannel] || 0);
  const activePaymentMethod =
    paymentMethodByChannel[activeSalesChannel] ||
    (activeSalesChannel === "GOJEK" ? "QRIS" : "CASH");
  const activeNote = noteByChannel[activeSalesChannel] || "";
  const activeCustomerName = customerNameByChannel[activeSalesChannel] || "";

  const activeMetaProducts = getChannelProducts(meta, activeSalesChannel);
  const activeMetaPromos = getChannelPromos(meta, activeSalesChannel);
  const activeFeePercent = getChannelFeePercent(meta, activeSalesChannel);

  function computeMetaSig(metaObj) {
    const products = (metaObj?.allProducts || metaObj?.products || [])
      .map(
        (product) =>
          `${product.id}:${product.priceSmall}:${product.priceLarge}:${
            product.isActive ?? ""
          }:${product.salesChannel || "ALL"}`
      )
      .join("|");

    const promos = (metaObj?.allPromos || metaObj?.promos || [])
      .map(
        (promo) =>
          `${promo.id}:${promo.type}:${promo.isActive}:${promo.salesChannel || "ALL"}:${
            promo.minSubtotal
          }:${promo.discountPercent}:${promo.discountAmount}:${promo.bonusProductId}:${
            promo.bonusPortion
          }:${promo.bonusQty}:${promo.startAt}:${promo.endAt}`
      )
      .join("|");

    const ingredients = (metaObj?.ingredients || [])
      .map((ingredient) => {
        return `${ingredient.id}:${ingredient.name}:${ingredient.unit}:${ingredient.isGlobal}:${ingredient.allowNegative}`;
      })
      .join("|");

    return `p=${products}__r=${promos}__i=${ingredients}`;
  }

  async function loadMeta({ silent = false } = {}) {
    try {
      const metaRes = await apiGet("/api/meta", token);

      setMeta(metaRes);
      setMetaSyncAt(new Date());
      setMetaSyncErr("");

      const sig = computeMetaSig(metaRes);

      if (metaSigRef.current && metaSigRef.current !== sig) {
        setMsg("Menu / promo / bahan diperbarui dari Admin.");

        try {
          if (!shift) await loadOpeningStocks({ preserve: true });
        } catch (_) {}
      }

      metaSigRef.current = sig;
    } catch (error) {
      const message = error?.message || "Gagal sync meta";

      setMetaSyncErr(message);

      if (!silent) setErr(message);
    }
  }

  async function load({ boot = false } = {}) {
    setErr("");
    setMsg("");

    if (boot) setBooting(true);

    try {
      const [metaRes, shiftRes] = await Promise.all([
        apiGet("/api/meta", token),
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
    } catch (error) {
      setErr(`Sync error: ${error?.message || String(error)}`);
    } finally {
      if (boot) setBooting(false);
    }
  }

  async function loadQueue({ silent = false } = {}) {
    if (!token) return;

    const reqId = ++qReqRef.current;

    if (!silent && !qDidFirstLoadRef.current) setQLoading(true);

    setQErr("");

    try {
      const response = await apiGet("/api/orders/queue?status=ALL", token);

      if (reqId !== qReqRef.current) return;

      const next = response.orders || [];
      const sig = next
        .map((order) => {
          return `${order.id}:${order.salesChannel || "REGULAR"}:${order.status}:${
            order.grossTotal
          }:${order.itemCount}`;
        })
        .join("|");

      if (sig !== qSigRef.current) {
        qSigRef.current = sig;
        setQueue(next);
      }

      qDidFirstLoadRef.current = true;
    } catch (error) {
      if (reqId !== qReqRef.current) return;
      setQErr(error?.message || "Gagal load antrian");
    } finally {
      if (!silent) setQLoading(false);
    }
  }

  async function loadOpeningStocks({ preserve = false } = {}) {
    if (!token) return;

    setInvErr("");
    setInvLoading(true);

    try {
      const response = await apiGet(
        "/api/cashier/inventory/stocks?includeCentral=true",
        token
      );

      const all = response?.stocks || [];
      const cartStocks = all.filter((stock) => !stock.isGlobal);
      const centralStocks = all.filter((stock) => !!stock.isGlobal);

      setInvStocks(cartStocks);
      setInvCentralStocks(centralStocks);

      const prevChecked = preserve ? openStockChecked || {} : {};
      const prevQty = preserve ? openStockQty || {} : {};

      const checked = {};
      const qty = {};

      for (const stock of cartStocks) {
        const core = isCoreStockName(stock.name);

        checked[stock.id] = core ? true : !!prevChecked[stock.id];
        qty[stock.id] = prevQty[stock.id] ?? Number(stock.qty ?? 0);
      }

      setOpenStockChecked(checked);
      setOpenStockQty(qty);
    } catch (error) {
      setInvErr(error?.message || "Gagal load stok untuk pembukaan shift");
      setInvStocks([]);
      setInvCentralStocks([]);
    } finally {
      setInvLoading(false);
    }
  }

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

  useEffect(() => {
    if (!token) return;

    load({ boot: true });

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") loadMeta({ silent: true });
    }, 30000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") loadMeta({ silent: true });
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token) return;
    if (shift) return;

    loadOpeningStocks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, shift]);

  useEffect(() => {
    if (!token) return;

    connectSocket(token);

    return () => {
      disconnectSocket();
    };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    if (!shift) return;

    loadQueue({ silent: false });

    const onInvalidate = () => {
      if (document.visibilityState !== "visible") return;
      loadQueue({ silent: true });
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

  const regularQueue = useMemo(() => {
    return (queue || []).filter((order) => (order.salesChannel || "REGULAR") !== "GOJEK");
  }, [queue]);

  const gojekQueue = useMemo(() => {
    return (queue || []).filter((order) => (order.salesChannel || "REGULAR") === "GOJEK");
  }, [queue]);

  const visibleQueueChannel = mainTab === "GOJEK" ? "GOJEK" : "REGULAR";

  const visibleQueue = useMemo(() => {
    return visibleQueueChannel === "GOJEK" ? gojekQueue : regularQueue;
  }, [visibleQueueChannel, gojekQueue, regularQueue]);

  const grossTotal = useMemo(() => {
    return activeCart.reduce((sum, item) => sum + item.price * item.qty, 0);
  }, [activeCart]);

  const promoProductsMap = useMemo(() => {
    const map = new Map();

    activeMetaProducts.forEach((product) => map.set(product.id, product));

    return map;
  }, [activeMetaProducts]);

  const cartPromoPreview = useMemo(() => {
    return buildPromoPreview({
      promos: activeMetaPromos,
      selectedPromoIds: activePromoIds,
      gross: grossTotal,
      products: activeMetaProducts,
    });
  }, [activeMetaPromos, activePromoIds, grossTotal, activeMetaProducts]);

  const platformFeeAmount = useMemo(() => {
    return calcChannelFee(grossTotal, activeFeePercent);
  }, [grossTotal, activeFeePercent]);

  const subtotalAfterPlatformFee = useMemo(() => {
    return Math.max(0, grossTotal - platformFeeAmount);
  }, [grossTotal, platformFeeAmount]);

  const totalDiscount = useMemo(() => {
    return Math.min(
      subtotalAfterPlatformFee,
      Number(activeDiscount || 0) + Number(cartPromoPreview.discountTotal || 0)
    );
  }, [activeDiscount, cartPromoPreview, subtotalAfterPlatformFee]);

  const netTotal = useMemo(() => {
    return Math.max(0, subtotalAfterPlatformFee - totalDiscount);
  }, [subtotalAfterPlatformFee, totalDiscount]);

  const checkoutChannel = openOrder?.salesChannel === "GOJEK" ? "GOJEK" : "REGULAR";

  const checkoutMetaProducts = useMemo(() => {
    return getChannelProducts(meta, checkoutChannel);
  }, [meta, checkoutChannel]);

  const checkoutMetaPromos = useMemo(() => {
    return getChannelPromos(meta, checkoutChannel);
  }, [meta, checkoutChannel]);

  const checkoutFeePercent = useMemo(() => {
    return getChannelFeePercent(meta, checkoutChannel);
  }, [meta, checkoutChannel]);

  const checkoutPromoProductsMap = useMemo(() => {
    const map = new Map();

    checkoutMetaProducts.forEach((product) => map.set(product.id, product));

    return map;
  }, [checkoutMetaProducts]);

  const checkoutPromoPreview = useMemo(() => {
    return buildPromoPreview({
      promos: checkoutMetaPromos,
      selectedPromoIds: checkout.promoIds || [],
      gross: Number(openOrder?.grossTotal || 0),
      products: checkoutMetaProducts,
    });
  }, [checkoutMetaPromos, checkout.promoIds, openOrder, checkoutMetaProducts]);

  const checkoutGrossTotal = useMemo(() => {
    return Number(openOrder?.grossTotal || 0);
  }, [openOrder]);

  const checkoutPlatformFeeAmount = useMemo(() => {
    return calcChannelFee(checkoutGrossTotal, checkoutFeePercent);
  }, [checkoutGrossTotal, checkoutFeePercent]);

  const checkoutSubtotalAfterPlatformFee = useMemo(() => {
    return Math.max(0, checkoutGrossTotal - checkoutPlatformFeeAmount);
  }, [checkoutGrossTotal, checkoutPlatformFeeAmount]);

  const checkoutTotalDiscount = useMemo(() => {
    const manual = Number(checkout.manualDiscount || 0);
    const promo = Number(checkoutPromoPreview.discountTotal || 0);

    return Math.min(checkoutSubtotalAfterPlatformFee, manual + promo);
  }, [checkout.manualDiscount, checkoutPromoPreview, checkoutSubtotalAfterPlatformFee]);

  const checkoutNetTotal = useMemo(() => {
    return Math.max(0, checkoutSubtotalAfterPlatformFee - checkoutTotalDiscount);
  }, [checkoutSubtotalAfterPlatformFee, checkoutTotalDiscount]);

  const editAvailableProducts = useMemo(() => {
    const channel = openOrder?.salesChannel === "GOJEK" ? "GOJEK" : "REGULAR";
    return getChannelProducts(meta, channel).filter((product) => product && product.isActive !== false);
  }, [meta, openOrder]);

  const productMap = useMemo(() => {
    const channel = openOrder?.salesChannel === "GOJEK" ? "GOJEK" : "REGULAR";
    const list = getChannelProducts(meta, channel);

    return new Map(list.map((product) => [product.id, product]));
  }, [meta, openOrder]);

  const editGrossPreview = useMemo(() => {
    return (editItems || []).reduce((sum, row) => {
      const qty = Number(row.qty || 0);

      if (!Number.isFinite(qty) || qty <= 0) return sum;

      return sum + editUnitPrice(row) * qty;
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editItems, productMap]);

  const movementStats = useMemo(() => {
    let cashIn = 0;
    let cashOut = 0;

    for (const movement of movements || []) {
      if (movement?.type === "CASH_IN") cashIn += 1;
      else if (movement?.type === "CASH_OUT") cashOut += 1;
    }

    return {
      cashInCount: cashIn,
      cashOutCount: cashOut,
      total: (movements || []).length,
    };
  }, [movements]);

  const movementsFiltered = useMemo(() => {
    if (!movements?.length) return [];
    if (cashTab === "ALL") return movements;

    return movements.filter((movement) => movement.type === cashTab);
  }, [movements, cashTab]);

  const syncText = metaSyncAt ? metaSyncAt.toLocaleTimeString("id-ID") : "-";
  const orderIsPaid = openOrder?.status === "PENDING_PAID";

  function setActiveCartValue(valueOrFn) {
    setCartByChannel((prev) => {
      const current = prev[activeSalesChannel] || [];
      const next = typeof valueOrFn === "function" ? valueOrFn(current) : valueOrFn;

      return {
        ...prev,
        [activeSalesChannel]: Array.isArray(next) ? next : [],
      };
    });
  }

  function setActiveDiscountValue(value) {
    setDiscountByChannel((prev) => ({
      ...prev,
      [activeSalesChannel]: Number(value || 0),
    }));
  }

  function setActivePaymentMethodValue(value) {
    setPaymentMethodByChannel((prev) => ({
      ...prev,
      [activeSalesChannel]: value || (activeSalesChannel === "GOJEK" ? "QRIS" : "CASH"),
    }));
  }

  function setActiveNoteValue(value) {
    setNoteByChannel((prev) => ({
      ...prev,
      [activeSalesChannel]: String(value || ""),
    }));
  }

  function setActiveCustomerNameValue(value) {
    setCustomerNameByChannel((prev) => ({
      ...prev,
      [activeSalesChannel]: String(value || ""),
    }));
  }

  function addProduct(product, portion) {
    setMsg("");
    setErr("");

    const unitPrice = portion === "LARGE" ? product.priceLarge : product.priceSmall;
    const key = `${product.id}:${portion}`;

    setCartByChannel((prev) => {
      const current = prev[activeSalesChannel] || [];
      const found = current.find((item) => item.key === key);

      const next = found
        ? current.map((item) =>
            item.key === key ? { ...item, qty: item.qty + 1 } : item
          )
        : [
            ...current,
            {
              key,
              productId: product.id,
              portion,
              name: product.name,
              price: unitPrice,
              qty: 1,
              itemNote: "",
            },
          ];

      return {
        ...prev,
        [activeSalesChannel]: next,
      };
    });
  }

  function updateQty(key, delta) {
    setActiveCartValue((current) => {
      const row = current.find((item) => item.key === key);

      if (!row) return current;

      const nextQty = Number(row.qty || 0) + Number(delta || 0);

      if (!Number.isFinite(nextQty) || nextQty <= 0) {
        return current.filter((item) => item.key !== key);
      }

      return current.map((item) =>
        item.key === key ? { ...item, qty: nextQty } : item
      );
    });
  }

  function removeItem(key) {
    setActiveCartValue((current) => current.filter((item) => item.key !== key));
  }

  function updateCartItemNote(key, value) {
    setActiveCartValue((current) =>
      current.map((item) => (item.key === key ? { ...item, itemNote: value } : item))
    );
  }

  function togglePromo(id) {
    setPromoIdsByChannel((prev) => {
      const current = prev[activeSalesChannel] || [];
      const next = current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id];

      return {
        ...prev,
        [activeSalesChannel]: next,
      };
    });
  }

  function toggleCheckoutPromo(id) {
    setCheckout((prev) => ({
      ...prev,
      promoIds: prev.promoIds.includes(id)
        ? prev.promoIds.filter((item) => item !== id)
        : [...prev.promoIds, id],
    }));
  }

  async function openShift() {
    if (openShiftLockRef.current) return;

    openShiftLockRef.current = true;
    setOpenShiftBusy(true);
    setErr("");
    setMsg("");

    try {
      const selected = (invStocks || []).filter((stock) => openStockChecked[stock.id]);

      const hasCireng = (invStocks || []).some(
        (stock) => String(stock.name || "").toLowerCase() === "cireng"
      );

      if (
        hasCireng &&
        !selected.some((stock) => String(stock.name || "").toLowerCase() === "cireng")
      ) {
        throw new Error("Cireng wajib dipilih untuk stok awal.");
      }

      const openingStocks = selected.map((stock) => ({
        ingredientId: stock.id,
        qty: Number(openStockQty[stock.id] ?? 0),
      }));

      const response = await apiPost(
        "/api/shifts/open",
        {
          openingCash: Number(openingCash || 0),
          openingStocks,
        },
        token
      );

      setShift(response.shift);

      const [sum, movementResponse] = await Promise.all([
        apiGet("/api/shifts/summary", token),
        apiGet("/api/cash/movements", token),
      ]);

      setSummary(sum.summary);
      setMovements(movementResponse.movements || []);

      await loadQueue();

      setMsg(
        response?.alreadyOpen
          ? "Shift sudah terbuka. Tampilan disinkronkan ulang."
          : "Shift dibuka."
      );
    } catch (error) {
      const message = error?.message || "Gagal buka shift";

      if (/shift masih open|shift sudah open|sudah dibuka|sedang diproses/i.test(String(message || ""))) {
        try {
          const [shiftRes, sumRes, mvRes] = await Promise.all([
            apiGet("/api/shifts/current", token),
            apiGet("/api/shifts/summary", token),
            apiGet("/api/cash/movements", token),
          ]);

          setShift(shiftRes.shift || null);
          setSummary(sumRes.summary || null);
          setMovements(mvRes.movements || []);

          if (shiftRes.shift) {
            await loadQueue({ silent: true });
            setMsg("Shift yang sudah terbuka berhasil dimuat ulang.");
            setErr("");
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
    setErr("");
    setMsg("");

    try {
      const closing = Number(closingCash || 0);

      if (!Number.isFinite(closing) || closing < 0) {
        throw new Error("Kas fisik saat tutup tidak valid.");
      }

      const expected = summary?.expectedCash ?? null;
      const variance = expected == null ? null : closing - expected;

      await apiPost("/api/shifts/close", { closingCash: closing }, token);

      setShift(null);
      setSummary(null);
      setMovements([]);
      setCartByChannel({ REGULAR: [], GOJEK: [] });
      setPromoIdsByChannel({ REGULAR: [], GOJEK: [] });
      setCustomerNameByChannel({ REGULAR: "", GOJEK: "" });
      setDiscountByChannel({ REGULAR: 0, GOJEK: 0 });
      setPaymentMethodByChannel({ REGULAR: "CASH", GOJEK: "QRIS" });
      setNoteByChannel({ REGULAR: "", GOJEK: "" });
      setClosingCash(0);

      if (expected == null) {
        setMsg("Shift ditutup.");
      } else {
        const label = variance === 0 ? "PAS" : variance > 0 ? "LEBIH" : "KURANG";

        setMsg(
          `Shift ditutup. Expected: ${rupiah(expected)} | Closing: ${rupiah(
            closing
          )} | Selisih: ${rupiah(Math.abs(variance))} (${label})`
        );
      }

      return true;
    } catch (error) {
      setErr(error?.message || "Gagal tutup shift");
      return false;
    }
  }

  async function confirmCloseShiftFromModal() {
    if (closeShiftBusy) return;

    setCloseShiftBusy(true);

    const ok = await closeShift();

    setCloseShiftBusy(false);

    if (ok) setCloseShiftOpen(false);
  }

  async function submitSale() {
    if (saleLockRef.current) return;

    saleLockRef.current = true;
    setSaleBusy(true);
    setErr("");
    setMsg("");

    try {
      if (!shift) throw new Error("Buka shift dulu.");
      if (activeCart.length === 0) throw new Error(`Keranjang ${activeChannelLabel} kosong.`);

      const payload = {
        salesChannel: activeSalesChannel,
        items: activeCart.map((item) => ({
          productId: item.productId,
          portion: item.portion,
          qty: item.qty,
          itemNote: item.itemNote,
        })),
        discount: Number(activeDiscount || 0),
        manualDiscount: Number(activeDiscount || 0),
        promoIds: activePromoIds,
        paymentMethod: activePaymentMethod,
        note: activeNote,
      };

      const response = await apiPost("/api/sales", payload, token);

      try {
        const sum = await apiGet("/api/shifts/summary", token);
        setSummary(sum.summary);
      } catch (_) {}

      setMsg(
        `Transaksi sukses. ID: ${response.saleId} | Total Customer: ${rupiah(
          response.netTotal
        )}${
          Number(response.platformFeeAmount || 0) > 0
            ? ` | Fee: ${rupiah(response.platformFeeAmount)} | Bersih Outlet: ${rupiah(
                response.netAfterPlatformFee
              )}`
            : ""
        }`
      );

      setCartByChannel((prev) => ({ ...prev, [activeSalesChannel]: [] }));
      setPromoIdsByChannel((prev) => ({ ...prev, [activeSalesChannel]: [] }));
      setDiscountByChannel((prev) => ({ ...prev, [activeSalesChannel]: 0 }));
      setPaymentMethodByChannel((prev) => ({
        ...prev,
        [activeSalesChannel]: activeSalesChannel === "GOJEK" ? "QRIS" : "CASH",
      }));
      setNoteByChannel((prev) => ({ ...prev, [activeSalesChannel]: "" }));

      await loadQueue();
    } catch (error) {
      setErr(error?.message || "Gagal simpan transaksi");
    } finally {
      setSaleBusy(false);
      saleLockRef.current = false;
    }
  }

  async function enqueueOrder() {
    setErr("");
    setMsg("");

    try {
      if (!shift) throw new Error("Buka shift dulu sebelum buat antrian.");
      if (activeCart.length === 0) throw new Error(`Keranjang ${activeChannelLabel} kosong.`);

      const customerName = normName(activeCustomerName);

      if (!customerName) throw new Error("Nama pelanggan wajib diisi.");

      const duplicate = (queue || []).some((order) => {
        return (
          (order.salesChannel || "REGULAR") === activeSalesChannel &&
          String(order.customerName || "").trim().toLowerCase() === customerName.toLowerCase()
        );
      });

      if (duplicate) throw new Error("Nama pelanggan sudah ada di antrian.");

      const payload = {
        salesChannel: activeSalesChannel,
        customerName,
        note: activeNote || null,
        items: activeCart.map((item) => ({
          productId: item.productId,
          portion: item.portion,
          qty: item.qty,
          itemNote: item.itemNote,
        })),
      };

      await apiPost("/api/orders", payload, token);

      setCartByChannel((prev) => ({ ...prev, [activeSalesChannel]: [] }));
      setPromoIdsByChannel((prev) => ({ ...prev, [activeSalesChannel]: [] }));
      setDiscountByChannel((prev) => ({ ...prev, [activeSalesChannel]: 0 }));
      setPaymentMethodByChannel((prev) => ({
        ...prev,
        [activeSalesChannel]: activeSalesChannel === "GOJEK" ? "QRIS" : "CASH",
      }));
      setNoteByChannel((prev) => ({ ...prev, [activeSalesChannel]: "" }));
      setCustomerNameByChannel((prev) => ({ ...prev, [activeSalesChannel]: "" }));

      setMsg("Order masuk antrian.");
      await loadQueue();
    } catch (error) {
      setErr(error?.message || "Gagal tambah antrian");
    }
  }

  function buildEditItemsFromOrder(order) {
    const items = order?.items || [];

    return items.map((item, index) => ({
      rowId: item.id || `${item.productId || item.product?.id}:${item.portion}:${index}`,
      productId: item.productId || item.product?.id,
      portion: item.portion === "LARGE" ? "LARGE" : "SMALL",
      qty: Number(item.qty || 1),
      itemNote: item.itemNote || "",
    }));
  }

  function editUnitPrice(row) {
    const product = productMap.get(row.productId);

    if (!product) return 0;

    return row.portion === "LARGE"
      ? Number(product.priceLarge || 0)
      : Number(product.priceSmall || 0);
  }

  function patchEditRow(rowId, patch) {
    setEditItems((prev) =>
      prev.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row))
    );
  }

  function removeEditRow(rowId) {
    setEditItems((prev) => prev.filter((row) => row.rowId !== rowId));
  }

  function addEditRow() {
    const first = editAvailableProducts[0];

    if (!first) return;

    setEditItems((prev) => [
      ...prev,
      {
        rowId: `new:${Date.now()}:${Math.random().toString(16).slice(2)}`,
        productId: first.id,
        portion: "SMALL",
        qty: 1,
        itemNote: "",
      },
    ]);
  }

  function resetEditStateFromOpenOrder() {
    if (!openOrder) return;

    setEditItems(buildEditItemsFromOrder(openOrder));
    setEditNote(openOrder?.note || "");
  }

  async function openOrderModal(orderId) {
    setErr("");
    setMsg("");

    try {
      const response = await apiGet(`/api/orders/${orderId}`, token);
      const order = response.order;
      const orderChannel = order?.salesChannel === "GOJEK" ? "GOJEK" : "REGULAR";

      setOpenOrder(order);

      setCheckout({
        manualDiscount: 0,
        paymentMethod: orderChannel === "GOJEK" ? "QRIS" : "CASH",
        note: order?.note || "",
        promoIds: [],
      });

      setEditMode(false);
      setEditItems(buildEditItemsFromOrder(order));
      setEditNote(order?.note || "");
      setPaidBusy(false);
      setEditBusy(false);
      setModalOpen(true);
    } catch (error) {
      setErr(error?.message || "Gagal buka order");
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
    } catch (error) {
      setErr(error?.message || "Gagal cancel order");
    }
  }

  async function setOrderPaid(orderId, paid) {
    if (!token) return;

    setErr("");
    setMsg("");
    setPaidBusy(true);

    try {
      const response = await apiPost(`/api/orders/${orderId}/paid`, { paid: !!paid }, token);

      setOpenOrder((prev) =>
        prev && prev.id === orderId
          ? { ...prev, status: response.order?.status || prev.status }
          : prev
      );

      setMsg(paid ? "Status: sudah bayar." : "Status: belum bayar.");

      await loadQueue();
    } catch (error) {
      setErr(error?.message || "Gagal update status bayar");
    } finally {
      setPaidBusy(false);
    }
  }

  async function saveOrderEdits(orderId) {
    if (!token) return;

    setErr("");
    setMsg("");
    setEditBusy(true);

    try {
      const items = (editItems || []).map((row) => ({
        productId: row.productId,
        portion: row.portion === "LARGE" ? "LARGE" : "SMALL",
        qty: Number(row.qty || 0),
        itemNote: row.itemNote || "",
      }));

      if (!items.length) throw new Error("Minimal 1 item.");

      for (const item of items) {
        if (!item.productId) throw new Error("Produk wajib dipilih.");
        if (!Number.isFinite(item.qty) || item.qty <= 0) {
          throw new Error("Qty harus > 0.");
        }
      }

      const response = await apiPost(
        `/api/orders/${orderId}/update`,
        { items, note: editNote || "" },
        token
      );

      setOpenOrder(response.order);

      setCheckout((prev) => ({
        ...prev,
        manualDiscount: 0,
        promoIds: [],
        note: response.order?.note || "",
      }));

      setEditMode(false);
      setMsg("Order berhasil diupdate. Silakan centang 'Sudah bayar' untuk checkout.");

      await loadQueue();
    } catch (error) {
      setErr(error?.message || "Gagal update order");
    } finally {
      setEditBusy(false);
    }
  }

  async function checkoutOrder(orderId) {
    if (checkoutLockRef.current || checkoutBusy) return;

    checkoutLockRef.current = true;
    setCheckoutBusy(true);
    setErr("");
    setMsg("");

    try {
      if (!shift) throw new Error("Shift belum OPEN.");

      if (openOrder?.id === orderId && openOrder.status !== "PENDING_PAID") {
        throw new Error("Centang 'Sudah bayar' dulu sebelum checkout.");
      }

      const payload = {
        manualDiscount: Number(checkout.manualDiscount || 0),
        paymentMethod:
          checkout.paymentMethod === "QRIS"
            ? "QRIS"
            : checkout.paymentMethod === "TRANSFER"
            ? "TRANSFER"
            : "CASH",
        note: checkout.note || null,
        promoIds: checkout.promoIds || [],
      };

      if (!["CASH", "QRIS", "TRANSFER"].includes(checkout.paymentMethod)) {
        throw new Error("Pilih metode bayar dulu (CASH / QRIS / TRANSFER).");
      }

      const response = await apiPost(`/api/orders/${orderId}/checkout`, payload, token);

      try {
        const [sum, mv] = await Promise.all([
          apiGet("/api/shifts/summary", token),
          apiGet("/api/cash/movements", token),
        ]);

        setSummary(sum.summary);
        setMovements(mv.movements);
      } catch (_) {}

      setMsg(
        `Checkout sukses. ID: ${response.saleId} | Total Customer: ${rupiah(
          response.netTotal
        )}${
          Number(response.platformFeeAmount || 0) > 0
            ? ` | Fee: ${rupiah(response.platformFeeAmount)} | Bersih Outlet: ${rupiah(
                response.netAfterPlatformFee
              )}`
            : ""
        }`
      );

      setModalOpen(false);
      setOpenOrder(null);

      await loadQueue();
    } catch (error) {
      setErr(error?.message || "Gagal checkout order");
    } finally {
      setCheckoutBusy(false);
      checkoutLockRef.current = false;
    }
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

      const [movementResponse, summaryResponse] = await Promise.all([
        apiGet("/api/cash/movements", token),
        apiGet("/api/shifts/summary", token),
      ]);

      setMovements(movementResponse.movements);
      setSummary(summaryResponse.summary);

      setCashMoveAmount(0);
      setCashMoveNote("");
      setMsg("Cash movement tersimpan.");
    } catch (error) {
      setErr(error?.message || "Gagal simpan cash movement");
    }
  }

  function logout() {
    localStorage.removeItem("cashier_token");
    localStorage.removeItem("cashier_cartId");
    localStorage.removeItem("cashier_cartName");

    disconnectSocket();
    nav("/cashier");
  }

  function csvEscape(value) {
    const s = String(value ?? "");

    if (s.includes('"') || s.includes(",") || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }

    return s;
  }

  function toCSV(rows) {
    return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
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

    setTimeout(() => URL.revokeObjectURL(url), 2500);
  }

  function exportMovementsCSV(list, label) {
    const dayKey = new Date().toLocaleDateString("sv-SE");

    const rows = [
      ["createdAt", "type", "amount", "note"],
      ...(list || []).map((movement) => [
        new Date(movement.createdAt).toLocaleString("id-ID"),
        movement.type,
        Number(movement.amount || 0),
        movement.note || "",
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

    const body = (movements || []).map((movement) => [
      new Date(movement.createdAt).toLocaleString("id-ID"),
      movement.type,
      Number(movement.amount || 0),
      movement.note || "",
    ]);

    downloadTextFile(`shift-summary-${dayKey}.csv`, toCSV([...head, ...body]));
  }

  function closeOrderModal() {
    setModalOpen(false);
    setOpenOrder(null);
    setEditMode(false);
    setEditItems([]);
    setEditNote("");
    setPaidBusy(false);
    setEditBusy(false);
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
        subtitle="Sinkronisasi menu, promo, dan shift."
        hint="Biasanya hanya beberapa detik."
        tone="accent"
      />
    );
  }

  return (
    <div className="pos-bg">
      <div className="pos-shell">
        <div className="pos-stack">
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
                    Regular <b>{regularQueue.length}</b>
                  </span>

                  <span className="pill pill--soft">
                    Gojek <b>{gojekQueue.length}</b>
                  </span>

                  <span className="pill pill--soft">
                    Sync <b>{syncText}</b>
                  </span>
                </div>
              </div>

              <div className="pos-header-actions">
                <button className="btn secondary btn--sm" type="button" onClick={logout}>
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

            {err ? (
              <div className="toast toast--danger" style={{ marginTop: 12 }}>
                {err}
              </div>
            ) : null}

            {msg ? (
              <div className="toast" style={{ marginTop: 12 }}>
                {msg}
              </div>
            ) : null}
          </div>

          <div className="pos-grid pos-grid--cashier">
            <div className="pos-col">
              <div className="pos-card">
                {!shift ? (
                  <div className="pos-section">
                    <div className="pos-section-head">
                      <div>
                        <h3 className="pos-h3">Buka Shift</h3>
                        <div className="card-subtitle">
                          Input modal awal dan stok awal sebelum mulai jualan.
                        </div>
                      </div>

                      <span className="badge">Shift Closed</span>
                    </div>

                    <div className="pos-form">
                      <div className="pos-field">
                        <label>Modal Kas Awal</label>
                        <input
                          className="input"
                          type="number"
                          value={openingCash}
                          onChange={(event) => setOpeningCash(event.target.value)}
                          placeholder="Contoh: 100000"
                        />
                      </div>

                      <section className="pos-soft-box">
                        <div className="pos-section-head">
                          <div>
                            <h3 className="pos-h3">Stok Awal Gerobak</h3>
                            <div className="card-subtitle">
                              Centang bahan yang dibawa hari ini. Cireng wajib.
                            </div>
                          </div>

                          <button
                            className="btn secondary btn--sm"
                            type="button"
                            onClick={() => loadOpeningStocks({ preserve: true })}
                            disabled={invLoading || openShiftBusy}
                          >
                            {invLoading ? "Memuat..." : "Refresh Bahan"}
                          </button>
                        </div>

                        {invErr ? (
                          <div className="toast toast--danger" style={{ marginTop: 12 }}>
                            {invErr}
                          </div>
                        ) : null}

                        {invLoading ? (
                          <div className="loading-inline muted" style={{ marginTop: 12 }}>
                            <span className="spinner spinner--sm" aria-hidden="true" />
                            Memuat daftar bahan...
                          </div>
                        ) : null}

                        {!invLoading && invStocks?.length ? (
                          <div className="adm-list" style={{ marginTop: 12 }}>
                            {invStocks.map((stock) => {
                              const core = isCoreStockName(stock.name);
                              const checked = !!openStockChecked[stock.id];

                              return (
                                <label key={stock.id} className="check-card">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={core}
                                    onChange={(event) =>
                                      setOpenStockChecked((prev) => ({
                                        ...prev,
                                        [stock.id]: event.target.checked,
                                      }))
                                    }
                                  />

                                  <div className="check-card__body">
                                    <span className="check-card__title">
                                      {stock.name}{" "}
                                      <span className="muted">({stock.unit})</span>
                                    </span>
                                    <span className="check-card__sub">
                                      Stok terakhir: {Number(stock.qty ?? 0)}
                                    </span>
                                  </div>

                                  {core ? <span className="check-state active">Wajib</span> : null}

                                  <input
                                    className="input"
                                    type="number"
                                    min="0"
                                    step="1"
                                    disabled={!checked}
                                    value={openStockQty[stock.id] ?? 0}
                                    onChange={(event) =>
                                      setOpenStockQty((prev) => ({
                                        ...prev,
                                        [stock.id]: event.target.value,
                                      }))
                                    }
                                    style={{ maxWidth: 140 }}
                                  />
                                </label>
                              );
                            })}
                          </div>
                        ) : null}

                        {!invLoading && !invStocks?.length ? (
                          <EmptyBox>
                            Inventory belum aktif atau belum ada bahan. Admin perlu tambah
                            ingredient seperti Cireng.
                          </EmptyBox>
                        ) : null}
                      </section>

                      {invCentralStocks?.length ? (
                        <details className="pos-soft-box">
                          <summary className="muted" style={{ cursor: "pointer" }}>
                            Lihat stok CENTRAL read-only • {invCentralStocks.length} bahan
                          </summary>

                          <div className="adm-list" style={{ marginTop: 12 }}>
                            {invCentralStocks.map((stock) => (
                              <div key={stock.id} className="adm-list-item">
                                <div className="adm-list-top" style={{ alignItems: "center" }}>
                                  <div>
                                    <div className="adm-list-title">
                                      {stock.name}{" "}
                                      <span className="muted">({stock.unit})</span>
                                    </div>
                                    <div className="adm-list-meta">
                                      Bahan central dikelola Admin.
                                    </div>
                                  </div>

                                  <span className="adm-badge">Qty {Number(stock.qty ?? 0)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </details>
                      ) : null}

                      <div className="pos-actions">
                        <button
                          className="btn"
                          type="button"
                          onClick={openShift}
                          disabled={openShiftBusy || invLoading}
                        >
                          {openShiftBusy ? "Membuka Shift..." : "Buka Shift"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="pos-section" style={{ paddingBottom: 10 }}>
                      <div className="pos-section-head">
                        <div>
                          <h3 className="pos-h3">Mode Kasir</h3>
                          <div className="card-subtitle">
                            Pilih alur kerja: jualan, Gojek, cash, shift, atau stok.
                          </div>
                        </div>
                      </div>

                      <Tabs
                        items={[
                          { value: "SELL", label: "Jualan" },
                          { value: "GOJEK", label: "Gojek" },
                          { value: "CASH", label: "Cash" },
                          { value: "SHIFT", label: "Shift" },
                          { value: "STOCK", label: "Stok" },
                        ]}
                        value={mainTab}
                        onChange={setMainTab}
                      />
                    </div>

                    {mainTab === "SELL" || mainTab === "GOJEK" ? (
                      <>
                        <section className="pos-section">
                          <div className="pos-section-head">
                            <div>
                              <h3 className="pos-h3">Menu {activeChannelLabel}</h3>
                              <div className="card-subtitle">
                                Pilih ukuran produk untuk masuk ke keranjang.
                              </div>
                            </div>

                            <span className="badge">{activeMetaProducts.length} menu</span>
                          </div>

                          {metaSyncErr ? (
                            <div className="toast toast--danger">
                              Sync error: {metaSyncErr}
                            </div>
                          ) : null}

                          <div className="grid-products">
                            {activeMetaProducts.map((product) => (
                              <div key={product.id} className="prod">
                                <div className="prod-head">
                                  <div>
                                    <b className="prod-title">{product.name}</b>
                                    <small className="muted">
                                      Kecil {rupiah(product.priceSmall)} • Besar{" "}
                                      {rupiah(product.priceLarge)}
                                    </small>

                                    {product.hasPriceOverride ? (
                                      <small
                                        className="muted"
                                        style={{ display: "block", marginTop: 4 }}
                                      >
                                        Harga khusus gerobak ini
                                      </small>
                                    ) : null}
                                  </div>
                                </div>

                                <div className="prod-actions prod-actions--split">
                                  <button
                                    className="btn secondary"
                                    type="button"
                                    onClick={() => addProduct(product, "SMALL")}
                                  >
                                    Kecil
                                  </button>

                                  <button
                                    className="btn secondary"
                                    type="button"
                                    onClick={() => addProduct(product, "LARGE")}
                                  >
                                    Besar
                                  </button>
                                </div>
                              </div>
                            ))}

                            {!activeMetaProducts.length ? (
                              <EmptyBox>Belum ada menu aktif.</EmptyBox>
                            ) : null}
                          </div>
                        </section>

                        <div className="hr" />

                        <section className="pos-section">
                          <div className="pos-section-head">
                            <div>
                              <h3 className="pos-h3">Promo {activeChannelLabel}</h3>
                              <div className="card-subtitle">
                                Pilih promo yang ingin dipakai.
                              </div>
                            </div>

                            <span className="badge">{activePromoIds.length} dipilih</span>
                          </div>

                          <div className="grid-products">
                            {activeMetaPromos.map((promo) => {
                              const active = activePromoIds.includes(promo.id);

                              return (
                                <div
                                  key={promo.id}
                                  className={`prod ${
                                    promo.isActive === false ? "prod--disabled" : ""
                                  }`}
                                >
                                  <div className="prod-head">
                                    <b className="prod-title">{promo.name}</b>
                                    <span className={active ? "pill pill--ok" : "pill pill--neutral"}>
                                      {active ? "Dipakai" : "Opsional"}
                                    </span>
                                  </div>

                                  <small className="muted">
                                    {promoSummaryText(promo, promoProductsMap)}
                                  </small>

                                  <div className="prod-actions">
                                    <button
                                      className={active ? "btn" : "btn secondary"}
                                      type="button"
                                      onClick={() => togglePromo(promo.id)}
                                    >
                                      {active ? "Lepas Promo" : "Pakai Promo"}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}

                            {!activeMetaPromos.length ? (
                              <EmptyBox>Belum ada promo aktif.</EmptyBox>
                            ) : null}
                          </div>
                        </section>

                        <div className="hr" />

                        <section className="pos-section">
                          <div className="pos-section-head">
                            <div>
                              <h3 className="pos-h3">Keranjang {activeChannelLabel}</h3>
                              <div className="card-subtitle">
                                {activeCart.length
                                  ? `${activeCart.length} item di keranjang.`
                                  : "Belum ada item."}
                              </div>
                            </div>
                          </div>

                          {activeCart.length ? (
                            <div className="adm-list">
                              {activeCart.map((item) => (
                                <article key={item.key} className="adm-list-item">
                                  <div className="adm-list-top" style={{ alignItems: "center" }}>
                                    <div>
                                      <div className="adm-list-title">
                                        {item.name}{" "}
                                        <span className="adm-badge">{item.portion}</span>
                                      </div>
                                      <div className="adm-list-meta">
                                        {rupiah(item.price)} x {item.qty}
                                      </div>
                                    </div>

                                    <div className="queue-total">
                                      {rupiah(item.price * item.qty)}
                                    </div>
                                  </div>

                                  <div className="adm-form-grid" style={{ marginTop: 12 }}>
                                    <div className="pos-field">
                                      <label>Catatan Item</label>
                                      <input
                                        className="input"
                                        placeholder="Level pedas / mix saus"
                                        value={item.itemNote}
                                        onChange={(event) =>
                                          updateCartItemNote(item.key, event.target.value)
                                        }
                                      />
                                    </div>

                                    <div className="pos-field">
                                      <label>Qty</label>
                                      <div className="qty-ctrl">
                                        <button
                                          className="btn secondary btn--sm"
                                          type="button"
                                          onClick={() => updateQty(item.key, -1)}
                                        >
                                          -
                                        </button>

                                        <div className="qty-num">{item.qty}</div>

                                        <button
                                          className="btn secondary btn--sm"
                                          type="button"
                                          onClick={() => updateQty(item.key, +1)}
                                        >
                                          +
                                        </button>

                                        <button
                                          className="btn danger btn--sm"
                                          type="button"
                                          onClick={() => removeItem(item.key)}
                                        >
                                          Hapus
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </article>
                              ))}
                            </div>
                          ) : (
                            <EmptyBox>Belum ada item. Pilih menu di atas.</EmptyBox>
                          )}
                        </section>

                        <div className="hr" />

                        <section className="pos-section">
                          <div className="pos-section-head">
                            <div>
                              <h3 className="pos-h3">Preview Promo</h3>
                              <div className="card-subtitle">
                                Ringkasan diskon dan bonus dari promo terpilih.
                              </div>
                            </div>
                          </div>

                          {!activePromoIds.length ? (
                            <EmptyBox>Belum ada promo dipilih.</EmptyBox>
                          ) : (
                            <div className="adm-list">
                              {cartPromoPreview.discountBreakdown.map((row) => (
                                <div key={row.id} className="adm-list-item">
                                  <div className="adm-list-top">
                                    <div>
                                      <div className="adm-list-title">{row.name}</div>
                                      <div className="adm-list-meta">{row.label}</div>
                                    </div>

                                    <b>- {rupiah(row.amount)}</b>
                                  </div>
                                </div>
                              ))}

                              {cartPromoPreview.bonusItems.map((item) => (
                                <div key={item.key} className="adm-list-item">
                                  <div className="adm-list-top">
                                    <div>
                                      <div className="adm-list-title">{item.name}</div>
                                      <div className="adm-list-meta">
                                        Bonus {item.portion} • Qty {item.qty}
                                      </div>
                                    </div>

                                    <span className="adm-badge adm-badge--cash">GRATIS</span>
                                  </div>
                                </div>
                              ))}

                              {cartPromoPreview.skippedPromos.map((row) => (
                                <div key={row.id} className="toast toast--danger">
                                  <b>{row.name}</b> belum berlaku — {row.reason}
                                </div>
                              ))}
                            </div>
                          )}
                        </section>

                        <div className="hr" />

                        <section className="pos-section">
                          <div className="pos-section-head">
                            <div>
                              <h3 className="pos-h3">Data Order</h3>
                              <div className="card-subtitle">
                                Bisa masuk antrian atau langsung transaksi.
                              </div>
                            </div>
                          </div>

                          <div className="pos-form">
                            <div className="adm-form-grid">
                              <div className="pos-field">
                                <label>Nama Pelanggan</label>
                                <input
                                  className="input"
                                  value={activeCustomerName}
                                  onChange={(event) =>
                                    setActiveCustomerNameValue(event.target.value)
                                  }
                                  placeholder="Contoh: Budi / Teh Rina"
                                />
                              </div>

                              <div className="pos-field">
                                <label>Metode Bayar</label>
                                <select
                                  className="input"
                                  value={activePaymentMethod}
                                  onChange={(event) =>
                                    setActivePaymentMethodValue(event.target.value)
                                  }
                                >
                                  <option value="CASH">CASH</option>
                                  <option value="QRIS">QRIS</option>
                                  <option value="TRANSFER">TRANSFER</option>
                                </select>
                              </div>

                              <div className="pos-field">
                                <label>Diskon Manual</label>
                                <input
                                  className="input"
                                  type="number"
                                  min="0"
                                  value={activeDiscount}
                                  onChange={(event) =>
                                    setActiveDiscountValue(event.target.value)
                                  }
                                  placeholder="0"
                                />
                              </div>
                            </div>

                            <div className="pos-field">
                              <label>Catatan Order</label>
                              <input
                                className="input"
                                value={activeNote}
                                onChange={(event) => setActiveNoteValue(event.target.value)}
                                placeholder="Opsional"
                              />
                            </div>

                            <TotalSummary
                              channel={activeSalesChannel}
                              gross={grossTotal}
                              manualDiscount={activeDiscount}
                              promoDiscount={cartPromoPreview.discountTotal}
                              platformFeePercent={activeFeePercent}
                              platformFeeAmount={platformFeeAmount}
                              subtotalAfterFee={subtotalAfterPlatformFee}
                              totalDiscount={totalDiscount}
                              netTotal={netTotal}
                            />

                            <div className="pos-actions">
                              <button
                                className="btn secondary"
                                type="button"
                                onClick={enqueueOrder}
                                disabled={!activeCustomerName || activeCart.length === 0}
                              >
                                Tambah ke Antrian
                              </button>

                              <button
                                className="btn"
                                type="button"
                                onClick={submitSale}
                                disabled={saleBusy || activeCart.length === 0}
                              >
                                {saleBusy ? "Memproses..." : "Transaksi Langsung"}
                              </button>
                            </div>
                          </div>
                        </section>
                      </>
                    ) : null}

                    {mainTab === "CASH" ? (
                      <>
                        <section className="pos-section">
                          <div className="pos-section-head">
                            <div>
                              <h3 className="pos-h3">Cash In / Out</h3>
                              <div className="card-subtitle">
                                Catat tambah kas atau pengeluaran non-transaksi.
                              </div>
                            </div>
                          </div>

                          <div className="pos-form">
                            <div>
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

                            <div className="adm-form-grid">
                              <div className="pos-field">
                                <label>Nominal</label>
                                <input
                                  className="input"
                                  type="number"
                                  value={cashMoveAmount}
                                  onChange={(event) =>
                                    setCashMoveAmount(event.target.value)
                                  }
                                  placeholder="0"
                                />
                              </div>

                              <div className="pos-field">
                                <label>Catatan</label>
                                <input
                                  className="input"
                                  value={cashMoveNote}
                                  onChange={(event) => setCashMoveNote(event.target.value)}
                                  placeholder="Contoh: beli gas / tambah kembalian"
                                />
                              </div>
                            </div>

                            <div className="pos-actions">
                              <button
                                className="btn"
                                type="button"
                                onClick={submitCashMovement}
                                disabled={!cashMoveAmount || Number(cashMoveAmount) <= 0}
                              >
                                Simpan Cash Movement
                              </button>
                            </div>
                          </div>
                        </section>

                        <div className="hr" />

                        <section className="pos-section">
                          <div className="pos-section-head">
                            <div>
                              <h3 className="pos-h3">Riwayat Cash Movement</h3>
                              <div className="card-subtitle">Maksimal 20 data terbaru.</div>
                            </div>

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

                          <Tabs
                            items={[
                              { value: "ALL", label: `Semua (${movementStats.total})` },
                              {
                                value: "CASH_IN",
                                label: `Cash In (${movementStats.cashInCount})`,
                              },
                              {
                                value: "CASH_OUT",
                                label: `Cash Out (${movementStats.cashOutCount})`,
                              },
                            ]}
                            value={cashTab}
                            onChange={setCashTab}
                          />

                          {movementsFiltered.length ? (
                            <div className="adm-list" style={{ marginTop: 12 }}>
                              {movementsFiltered.slice(0, 20).map((movement) => (
                                <article key={movement.id} className="adm-list-item">
                                  <div className="adm-list-top" style={{ alignItems: "center" }}>
                                    <div>
                                      <div className="adm-list-title">
                                        {toTime(movement.createdAt)}
                                      </div>
                                      <div className="adm-list-meta">
                                        {movement.note || "-"}
                                      </div>
                                    </div>

                                    <div className="adm-list-badges">
                                      <span
                                        className={
                                          movement.type === "CASH_IN"
                                            ? "adm-badge adm-badge--cash"
                                            : "adm-badge badge--danger"
                                        }
                                      >
                                        {movement.type}
                                      </span>

                                      <b>{rupiah(movement.amount)}</b>
                                    </div>
                                  </div>
                                </article>
                              ))}
                            </div>
                          ) : (
                            <EmptyBox>Belum ada data untuk filter ini.</EmptyBox>
                          )}
                        </section>
                      </>
                    ) : null}

                    {mainTab === "SHIFT" ? (
                      <>
                        <section className="pos-section">
                          <div className="pos-section-head">
                            <div>
                              <h3 className="pos-h3">Ringkasan Shift</h3>
                              <div className="card-subtitle">Performa shift berjalan.</div>
                            </div>
                          </div>

                          {summary ? (
                            <div className="adm-form-grid">
                              <MiniStat label="Modal Awal" value={rupiah(summary.openingCash)} />
                              <MiniStat label="Penjualan CASH" value={rupiah(summary.cashSales)} />
                              <MiniStat label="Penjualan QRIS" value={rupiah(summary.qrisSales)} />
                              <MiniStat label="Cash IN" value={rupiah(summary.cashIn)} />
                              <MiniStat label="Cash OUT" value={rupiah(summary.cashOut)} />
                              <MiniStat label="Expected Cash" value={rupiah(summary.expectedCash)} />
                            </div>
                          ) : (
                            <EmptyBox>Belum ada ringkasan shift.</EmptyBox>
                          )}
                        </section>

                        <div className="hr" />

                        <section className="pos-section">
                          <div className="pos-section-head">
                            <div>
                              <h3 className="pos-h3">Tutup Shift</h3>
                              <div className="card-subtitle">
                                Tutup shift dilakukan lewat popup konfirmasi.
                              </div>
                            </div>
                          </div>

                          <div className="pos-actions">
                            <button
                              className="btn secondary"
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
                        </section>
                      </>
                    ) : null}

                    {mainTab === "STOCK" ? (
                      <CashierStockPanel
                        token={token}
                        meta={meta}
                        shift={shift}
                        cartName={cartName}
                      />
                    ) : null}
                  </>
                )}
              </div>
            </div>

            <div className="pos-col pos-col--queue">
              <div className="pos-card">
                <div className="pos-section-head pos-section-head--tight">
                  <div>
                    <h3 className="pos-h3">
                      Antrian {visibleQueueChannel === "GOJEK" ? "Gojek" : "Regular"}
                    </h3>
                    <div className="card-subtitle">
                      Klik pesanan untuk edit, centang bayar, lalu checkout.
                    </div>
                  </div>

                  {qLoading ? (
                    <span className="loading-inline muted">
                      <span className="spinner spinner--sm" aria-hidden="true" />
                      Loading
                    </span>
                  ) : (
                    <span className="badge">{visibleQueue.length} order</span>
                  )}
                </div>

                {qErr ? (
                  <div className="toast toast--danger" style={{ marginTop: 12 }}>
                    {qErr}
                  </div>
                ) : null}

                <div className="hr" />

                {!visibleQueue.length ? (
                  <EmptyBox>Belum ada antrian.</EmptyBox>
                ) : (
                  <div className="queue-list">
                    {visibleQueue.map((order) => (
                      <button
                        key={order.id}
                        type="button"
                        className="queue-item"
                        onClick={() => openOrderModal(order.id)}
                      >
                        <div className="queue-row">
                          <div className="queue-left">
                            <div className="queue-name">{order.customerName}</div>
                            <div className="queue-sub">
                              {toTime(order.createdAt)} • {order.itemCount || 0} item
                            </div>
                          </div>

                          <div className="queue-right">
                            <div
                              className="queue-sub"
                              style={{
                                display: "flex",
                                gap: 8,
                                justifyContent: "flex-end",
                                flexWrap: "wrap",
                              }}
                            >
                              <span className="pill pill--soft">
                                {order.salesChannel === "GOJEK" ? "GOJEK" : "REGULAR"}
                              </span>

                              {order.status === "PENDING_PAID" ? (
                                <span className="pill pill--ok">Sudah bayar</span>
                              ) : (
                                <span className="pill pill--neutral">Belum bayar</span>
                              )}
                            </div>

                            <div className="queue-total">{rupiah(order.grossTotal || 0)}</div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {closeShiftOpen && shift ? (
            <div className="modal-overlay" onClick={() => setCloseShiftOpen(false)}>
              <div className="modal-card pos-card" onClick={(event) => event.stopPropagation()}>
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

                <div className="modal-body">
                  {summary ? (
                    <div className="adm-form-grid">
                      <MiniStat label="Modal Awal" value={rupiah(summary.openingCash)} />
                      <MiniStat label="Penjualan CASH" value={rupiah(summary.cashSales)} />
                      <MiniStat label="Penjualan QRIS" value={rupiah(summary.qrisSales)} />
                      <MiniStat label="Cash IN" value={rupiah(summary.cashIn)} />
                      <MiniStat label="Cash OUT" value={rupiah(summary.cashOut)} />
                      <MiniStat label="Expected Cash" value={rupiah(summary.expectedCash)} />
                    </div>
                  ) : (
                    <EmptyBox>Ringkasan belum tersedia.</EmptyBox>
                  )}

                  <div className="hr" />

                  <div className="pos-form">
                    <div className="pos-field">
                      <label>Kas Fisik Saat Tutup</label>
                      <input
                        className="input"
                        type="number"
                        value={closingCash}
                        onChange={(event) => setClosingCash(event.target.value)}
                        placeholder={
                          summary?.expectedCash != null
                            ? `Expected: ${rupiah(summary.expectedCash)}`
                            : ""
                        }
                      />

                      {summary?.expectedCash != null && String(closingCash) !== "" ? (
                        (() => {
                          const expected = Number(summary.expectedCash || 0);
                          const closing = Number(closingCash || 0);

                          if (!Number.isFinite(closing)) return null;

                          const variance = closing - expected;
                          const label =
                            variance === 0 ? "PAS" : variance > 0 ? "LEBIH" : "KURANG";

                          return (
                            <div className="field-hint">
                              Selisih: <b>{rupiah(Math.abs(variance))}</b> ({label})
                            </div>
                          );
                        })()
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="modal-footer">
                  <button
                    className="btn secondary"
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
                    {closeShiftBusy ? "Menutup..." : "Konfirmasi Tutup Shift"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {modalOpen && openOrder ? (
            <div className="modal-overlay" onClick={closeOrderModal}>
              <div className="modal-card pos-card" onClick={(event) => event.stopPropagation()}>
                <div className="modal-head">
                  <div>
                    <h3 style={{ margin: 0 }}>Checkout: {openOrder.customerName}</h3>
                    <div className="muted" style={{ fontSize: 12 }}>
                      Dibuat: {new Date(openOrder.createdAt).toLocaleString("id-ID")}
                    </div>
                  </div>

                  <div className="adm-actions">
                    <label className="check-compact">
                      <input
                        type="checkbox"
                        checked={!!orderIsPaid}
                        disabled={paidBusy || editMode}
                        onChange={(event) => setOrderPaid(openOrder.id, event.target.checked)}
                      />
                      <span>Sudah bayar</span>
                    </label>

                    {orderIsPaid ? (
                      <span className="pill pill--ok">PAID</span>
                    ) : (
                      <span className="pill pill--neutral">UNPAID</span>
                    )}

                    <button className="btn secondary" type="button" onClick={closeOrderModal}>
                      Tutup
                    </button>
                  </div>
                </div>

                <div className="modal-body">
                  {editMode ? (
                    <>
                      <div className="pos-section-head">
                        <div>
                          <h3 className="pos-h3">Edit Item</h3>
                          <div className="card-subtitle">
                            Setelah disimpan, status bayar kembali UNPAID.
                          </div>
                        </div>

                        <button
                          className="btn secondary btn--sm"
                          type="button"
                          onClick={addEditRow}
                        >
                          + Tambah Item
                        </button>
                      </div>

                      <div className="adm-list" style={{ marginTop: 14 }}>
                        {(editItems || []).map((row) => {
                          const unit = editUnitPrice(row);
                          const qty = Number(row.qty || 0);
                          const subtotal =
                            Math.max(0, (Number.isFinite(qty) ? qty : 0) * unit);

                          return (
                            <article key={row.rowId} className="adm-list-item">
                              <div className="adm-form-grid">
                                <div className="pos-field">
                                  <label>Produk</label>
                                  <select
                                    className="input"
                                    value={row.productId || ""}
                                    onChange={(event) =>
                                      patchEditRow(row.rowId, {
                                        productId: event.target.value,
                                      })
                                    }
                                  >
                                    {editAvailableProducts.map((product) => (
                                      <option key={product.id} value={product.id}>
                                        {product.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div className="pos-field">
                                  <label>Portion</label>
                                  <select
                                    className="input"
                                    value={row.portion === "LARGE" ? "LARGE" : "SMALL"}
                                    onChange={(event) =>
                                      patchEditRow(row.rowId, {
                                        portion: event.target.value,
                                      })
                                    }
                                  >
                                    <option value="SMALL">SMALL</option>
                                    <option value="LARGE">LARGE</option>
                                  </select>
                                </div>

                                <div className="pos-field">
                                  <label>Qty</label>
                                  <div className="qty-ctrl">
                                    <button
                                      className="btn secondary btn--sm"
                                      type="button"
                                      onClick={() =>
                                        patchEditRow(row.rowId, {
                                          qty: Math.max(1, Number(row.qty || 1) - 1),
                                        })
                                      }
                                    >
                                      -
                                    </button>

                                    <input
                                      className="input"
                                      type="number"
                                      value={row.qty}
                                      onChange={(event) =>
                                        patchEditRow(row.rowId, {
                                          qty: Math.max(1, Number(event.target.value || 1)),
                                        })
                                      }
                                      style={{ width: 80, textAlign: "center" }}
                                    />

                                    <button
                                      className="btn secondary btn--sm"
                                      type="button"
                                      onClick={() =>
                                        patchEditRow(row.rowId, {
                                          qty: Number(row.qty || 1) + 1,
                                        })
                                      }
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>
                              </div>

                              <div className="adm-form-grid" style={{ marginTop: 12 }}>
                                <div className="pos-field">
                                  <label>Catatan Item</label>
                                  <input
                                    className="input"
                                    placeholder="Opsional"
                                    value={row.itemNote || ""}
                                    onChange={(event) =>
                                      patchEditRow(row.rowId, {
                                        itemNote: event.target.value,
                                      })
                                    }
                                  />
                                </div>

                                <MiniStat label="Subtotal" value={rupiah(subtotal)} />
                              </div>

                              <div className="adm-actions-row" style={{ marginTop: 12 }}>
                                <div />
                                <button
                                  className="btn danger btn--sm"
                                  type="button"
                                  onClick={() => removeEditRow(row.rowId)}
                                >
                                  Hapus
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>

                      <div className="pos-field" style={{ marginTop: 14 }}>
                        <label>Catatan Order</label>
                        <textarea
                          className="input"
                          rows="2"
                          value={editNote}
                          onChange={(event) => setEditNote(event.target.value)}
                        />
                      </div>

                      <div className="hr" />

                      <TotalSummary
                        channel={checkoutChannel}
                        gross={editGrossPreview}
                        manualDiscount={0}
                        promoDiscount={0}
                        platformFeePercent={checkoutFeePercent}
                        platformFeeAmount={calcChannelFee(
                          editGrossPreview,
                          checkoutFeePercent
                        )}
                        subtotalAfterFee={Math.max(
                          0,
                          editGrossPreview -
                            calcChannelFee(editGrossPreview, checkoutFeePercent)
                        )}
                        totalDiscount={0}
                        netTotal={Math.max(
                          0,
                          editGrossPreview -
                            calcChannelFee(editGrossPreview, checkoutFeePercent)
                        )}
                      />
                    </>
                  ) : (
                    <>
                      <section className="pos-section">
                        <div className="pos-section-head">
                          <div>
                            <h3 className="pos-h3">Detail Item</h3>
                            <div className="card-subtitle">
                              Cek item sebelum checkout.
                            </div>
                          </div>
                        </div>

                        <div className="adm-list">
                          {(openOrder.items || []).map((item) => (
                            <article key={item.id} className="adm-list-item">
                              <div className="adm-list-top" style={{ alignItems: "center" }}>
                                <div>
                                  <div className="adm-list-title">
                                    {item.product?.name || "(Produk)"}
                                  </div>
                                  <div className="adm-list-meta">
                                    {item.portion} • Qty {item.qty}
                                    {item.itemNote ? ` • ${item.itemNote}` : ""}
                                  </div>
                                </div>

                                <b>{rupiah(Number(item.price || 0) * Number(item.qty || 0))}</b>
                              </div>
                            </article>
                          ))}
                        </div>
                      </section>

                      <div className="hr" />

                      {!orderIsPaid ? (
                        <div className="toast toast--danger">
                          Centang <b>Sudah bayar</b> dulu supaya bisa checkout.
                        </div>
                      ) : null}

                      <section className="pos-section">
                        <div className="pos-section-head">
                          <div>
                            <h3 className="pos-h3">Promo Checkout</h3>
                            <div className="card-subtitle">
                              Promo diterapkan saat order diselesaikan.
                            </div>
                          </div>

                          <span className="badge">{checkout.promoIds.length} dipilih</span>
                        </div>

                        <div className="grid-products">
                          {checkoutMetaPromos.map((promo) => {
                            const active = (checkout.promoIds || []).includes(promo.id);
                            const minSubtotal = Number(promo.minSubtotal || 0);
                            const meetsMin = Number(openOrder?.grossTotal || 0) >= minSubtotal;

                            return (
                              <div
                                key={promo.id}
                                className={`prod ${!meetsMin ? "prod--disabled" : ""}`}
                              >
                                <div className="prod-head">
                                  <b className="prod-title">{promo.name}</b>
                                  <span className={active ? "pill pill--ok" : "pill pill--neutral"}>
                                    {active ? "Dipakai" : "Opsional"}
                                  </span>
                                </div>

                                <small className="muted">
                                  {promoSummaryText(promo, checkoutPromoProductsMap)}
                                </small>

                                {!meetsMin ? (
                                  <small className="muted">
                                    Belum memenuhi minimum subtotal.
                                  </small>
                                ) : null}

                                <div className="prod-actions">
                                  <button
                                    className={active ? "btn" : "btn secondary"}
                                    type="button"
                                    onClick={() => toggleCheckoutPromo(promo.id)}
                                    disabled={checkoutBusy}
                                  >
                                    {active ? "Lepas Promo" : "Pakai Promo"}
                                  </button>
                                </div>
                              </div>
                            );
                          })}

                          {!checkoutMetaPromos.length ? (
                            <EmptyBox>Belum ada promo aktif.</EmptyBox>
                          ) : null}
                        </div>

                        {checkoutPromoPreview.bonusItems.length ? (
                          <div className="adm-list" style={{ marginTop: 12 }}>
                            {checkoutPromoPreview.bonusItems.map((item) => (
                              <article key={item.key} className="adm-list-item">
                                <div className="adm-list-top">
                                  <div>
                                    <div className="adm-list-title">{item.name}</div>
                                    <div className="adm-list-meta">
                                      {item.portion} • Qty {item.qty} •{" "}
                                      {item.promoNames.join(", ")}
                                    </div>
                                  </div>

                                  <span className="adm-badge adm-badge--cash">GRATIS</span>
                                </div>
                              </article>
                            ))}
                          </div>
                        ) : null}
                      </section>

                      <div className="hr" />

                      <div className="pos-form">
                        <div className="adm-form-grid">
                          <div className="pos-field">
                            <label>Metode Pembayaran</label>
                            <select
                              className="input"
                              value={checkout.paymentMethod}
                              onChange={(event) =>
                                setCheckout((prev) => ({
                                  ...prev,
                                  paymentMethod: event.target.value,
                                }))
                              }
                              disabled={checkoutBusy || !orderIsPaid}
                            >
                              <option value="CASH">CASH</option>
                              <option value="QRIS">QRIS</option>
                              <option value="TRANSFER">TRANSFER</option>
                            </select>
                          </div>

                          <div className="pos-field">
                            <label>Diskon Manual</label>
                            <input
                              className="input"
                              type="number"
                              min="0"
                              value={checkout.manualDiscount}
                              onChange={(event) =>
                                setCheckout((prev) => ({
                                  ...prev,
                                  manualDiscount: event.target.value,
                                }))
                              }
                              disabled={checkoutBusy || !orderIsPaid}
                            />
                          </div>
                        </div>

                        <div className="pos-field">
                          <label>Catatan Checkout</label>
                          <input
                            className="input"
                            value={checkout.note}
                            onChange={(event) =>
                              setCheckout((prev) => ({
                                ...prev,
                                note: event.target.value,
                              }))
                            }
                            disabled={checkoutBusy || !orderIsPaid}
                            placeholder="Opsional"
                          />
                        </div>

                        <TotalSummary
                          channel={checkoutChannel}
                          gross={checkoutGrossTotal}
                          manualDiscount={Number(checkout.manualDiscount || 0)}
                          promoDiscount={checkoutPromoPreview.discountTotal}
                          platformFeePercent={checkoutFeePercent}
                          platformFeeAmount={checkoutPlatformFeeAmount}
                          subtotalAfterFee={checkoutSubtotalAfterPlatformFee}
                          totalDiscount={checkoutTotalDiscount}
                          netTotal={checkoutNetTotal}
                        />
                      </div>
                    </>
                  )}
                </div>

                <div className="modal-footer">
                  {editMode ? (
                    <>
                      <button
                        className="btn danger"
                        type="button"
                        onClick={() => cancelOrder(openOrder.id)}
                        disabled={editBusy || paidBusy}
                      >
                        Batalkan Order
                      </button>

                      <button
                        className="btn secondary"
                        type="button"
                        onClick={() => {
                          setEditMode(false);
                          resetEditStateFromOpenOrder();
                        }}
                        disabled={editBusy}
                      >
                        Batal Edit
                      </button>

                      <button
                        className="btn"
                        type="button"
                        onClick={() => saveOrderEdits(openOrder.id)}
                        disabled={
                          editBusy ||
                          !editAvailableProducts.length ||
                          (editItems || []).length === 0
                        }
                      >
                        {editBusy ? "Menyimpan..." : "Simpan Perubahan"}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="btn danger"
                        type="button"
                        onClick={() => cancelOrder(openOrder.id)}
                      >
                        Batalkan Order
                      </button>

                      <button
                        className="btn secondary"
                        type="button"
                        onClick={() => {
                          resetEditStateFromOpenOrder();
                          setEditMode(true);
                        }}
                        disabled={!editAvailableProducts.length}
                      >
                        Edit Order
                      </button>

                      <button
                        className="btn"
                        type="button"
                        onClick={() => checkoutOrder(openOrder.id)}
                        disabled={checkoutBusy || !orderIsPaid || !checkout.paymentMethod}
                      >
                        {checkoutBusy ? "Memproses..." : "Selesaikan & Checkout"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}