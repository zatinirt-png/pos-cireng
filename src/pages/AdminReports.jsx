import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../api";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

function ymdWib(d = new Date()) {
  const offsetMs = 7 * 60 * 60 * 1000;
  const w = new Date(d.getTime() + offsetMs);
  const y = w.getUTCFullYear();
  const m = String(w.getUTCMonth() + 1).padStart(2, "0");
  const day = String(w.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function rupiah(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "Rp 0";
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function number(value, suffix = "") {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return `0${suffix}`;
  return `${n.toLocaleString("id-ID")}${suffix}`;
}

function percent(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0%";
  return `${n.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;
}

function formatDate(dateStr) {
  if (!dateStr) return "-";
  try {
    return new Date(`${dateStr}T00:00:00+07:00`).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Jakarta",
    });
  } catch {
    return String(dateStr);
  }
}

function formatRange(startDate, endDate) {
  if (!startDate && !endDate) return "-";
  if (startDate === endDate) return formatDate(startDate);
  return `${formatDate(startDate)} — ${formatDate(endDate)}`;
}

function fmtDateTime(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(value);
  }
}

function shortId(id) {
  return String(id || "-").slice(-8).toUpperCase();
}

function csvCell(value) {
  const s = value == null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
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
  URL.revokeObjectURL(url);
}

async function downloadWithAuth(path, token, fallbackName) {
  const response = await fetch(API_BASE + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    try {
      const json = JSON.parse(text);
      throw new Error(json.error || `HTTP ${response.status}`);
    } catch {
      throw new Error(text || `HTTP ${response.status}`);
    }
  }

  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="([^"]+)"/i);
  const filename = match?.[1] || fallbackName;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function buildRangeQuery(startDate, endDate) {
  const qs = new URLSearchParams();
  if (startDate) qs.set("startDate", startDate);
  if (endDate) qs.set("endDate", endDate);
  const raw = qs.toString();
  return raw ? `?${raw}` : "";
}

function getStatusLabel(status) {
  return String(status || "OK").replaceAll("_", " ");
}

function getStatusClass(status) {
  const s = String(status || "OK").toUpperCase();
  if (s === "OUT_OF_STOCK") return "rv2-chip rv2-chip--danger";
  if (s === "LOW_STOCK") return "rv2-chip rv2-chip--danger";
  if (s === "REORDER") return "rv2-chip rv2-chip--warn";
  return "rv2-chip rv2-chip--ok";
}

function calcStockSummary(rows = []) {
  const out = { items: 0, qty: 0, ok: 0, reorder: 0, low: 0, out: 0, suggested: 0 };
  for (const row of rows) {
    const status = String(row?.stockStatus || "OK").toUpperCase();
    out.items += 1;
    out.qty += Number(row?.qty || 0);
    out.suggested += Number(row?.suggestedOrderQty || 0);
    if (status === "OUT_OF_STOCK") out.out += 1;
    else if (status === "LOW_STOCK") out.low += 1;
    else if (status === "REORDER") out.reorder += 1;
    else out.ok += 1;
  }
  return out;
}
function normalizePortionText(value) {
  return String(value || "")
    .toUpperCase()
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim();
}

function isSmallPortion(value) {
  const text = normalizePortionText(value);
  return (
    text === "SMALL" ||
    text === "REGULAR" ||
    text === "REGULER" ||
    text.includes("SMALL") ||
    text.includes("REGULAR") ||
    text.includes("REGULER")
  );
}

function isLargePortion(value) {
  const text = normalizePortionText(value);
  return (
    text === "LARGE" ||
    text === "JUMBO" ||
    text.includes("LARGE") ||
    text.includes("JUMBO")
  );
}

function calcSalePortionMatrix(sale, matrixColumns = []) {
  const out = { small: 0, large: 0, total: 0 };

  const items = Array.isArray(sale?.items) ? sale.items : [];
  if (items.length) {
    for (const item of items) {
      const qty = Number(item.qty ?? item.quantity ?? 0);
      const portion = item.portion ?? item.size ?? item.variant ?? item.portionName ?? "";

      if (isSmallPortion(portion)) out.small += qty;
      else if (isLargePortion(portion)) out.large += qty;
      else out.total += qty;
    }

    out.total = out.small + out.large + out.total;
    return out;
  }

  const itemMatrix = sale?.itemMatrix || {};
  for (const col of matrixColumns || []) {
    const cell = itemMatrix[col.key] || {};
    const qty = Number(cell.qty || 0);
    const label = `${col.key || ""} ${col.label || ""}`;

    if (isSmallPortion(label)) out.small += qty;
    else if (isLargePortion(label)) out.large += qty;
    else out.total += qty;
  }

  out.total = out.small + out.large + out.total;
  return out;
}

function getShiftKeyFromSale(sale) {
  return (
    sale.shiftId ||
    sale.shift?.id ||
    sale.openShiftId ||
    sale.cashierShiftId ||
    `${sale.cashier || "Kasir"}-${String(sale.createdAt || "").slice(0, 10)}`
  );
}

function getShiftNameFromSale(sale, index = 0) {
  const cashier = sale.cashier || sale.cashierName || sale.user?.name || "Kasir";
  const date = sale.createdAt
    ? new Date(sale.createdAt).toLocaleDateString("id-ID", {
        timeZone: "Asia/Jakarta",
        day: "2-digit",
        month: "short",
      })
    : "-";

  return sale.shiftName || sale.shift?.name || `Shift ${index + 1} • ${cashier} • ${date}`;
}

function getHourRange(startAt, endAt) {
  if (!startAt || !endAt) return "-";
  const start = new Date(startAt);
  const end = new Date(endAt);
  const diffMs = Math.max(0, end.getTime() - start.getTime());
  const hours = diffMs / 1000 / 60 / 60;
  if (!Number.isFinite(hours) || hours <= 0) return "-";
  return `${hours.toLocaleString("id-ID", { maximumFractionDigits: 1 })} jam`;
}

function calcShiftAnalysis(sales = [], matrixColumns = []) {
  const map = new Map();

  for (const sale of sales) {
    const key = getShiftKeyFromSale(sale);

    if (!map.has(key)) {
      map.set(key, {
        key,
        name: "",
        cashier: sale.cashier || sale.cashierName || sale.user?.name || "Kasir",
        startAt: sale.createdAt || null,
        endAt: sale.createdAt || null,
        transactions: 0,
        gross: 0,
        discount: 0,
        net: 0,
        cash: 0,
        qris: 0,
        items: 0,
        smallPortion: 0,
        largePortion: 0,
        totalPortion: 0,
      });
    }

    const row = map.get(key);
    const createdAt = sale.createdAt || null;
    const payment = String(sale.paymentMethod || "").toUpperCase();
    const net = Number(sale.netTotal ?? sale.total ?? 0);
    const gross = Number(sale.grossTotal ?? net ?? 0);
    const discount = Number(sale.discount ?? 0);
    const portionMatrix = calcSalePortionMatrix(sale, matrixColumns);

    row.transactions += 1;
    row.gross += gross;
    row.discount += discount;
    row.net += net;

    row.smallPortion += Number(portionMatrix.small || 0);
    row.largePortion += Number(portionMatrix.large || 0);
    row.totalPortion += Number(portionMatrix.total || 0);
    row.items += Number(portionMatrix.total || 0);

    if (payment.includes("CASH")) row.cash += net;
    else if (payment.includes("QRIS") || payment.includes("TRANSFER")) row.qris += net;

    if (createdAt && (!row.startAt || new Date(createdAt) < new Date(row.startAt))) {
      row.startAt = createdAt;
    }

    if (createdAt && (!row.endAt || new Date(createdAt) > new Date(row.endAt))) {
      row.endAt = createdAt;
    }
  }

  const rawRows = Array.from(map.values())
    .map((row, index) => {
      const durationHours =
        row.startAt && row.endAt
          ? Math.max(
              0.01,
              (new Date(row.endAt).getTime() - new Date(row.startAt).getTime()) / 1000 / 60 / 60
            )
          : 0;

      const smallRatio =
        Number(row.totalPortion || 0) > 0
          ? (Number(row.smallPortion || 0) / Number(row.totalPortion || 1)) * 100
          : 0;

      const largeRatio =
        Number(row.totalPortion || 0) > 0
          ? (Number(row.largePortion || 0) / Number(row.totalPortion || 1)) * 100
          : 0;

      return {
        ...row,
        name: getShiftNameFromSale(
          {
            cashier: row.cashier,
            createdAt: row.startAt,
            shiftId: row.key,
          },
          index
        ),
        averageOrder: row.transactions > 0 ? row.net / row.transactions : 0,
        salesPerHour: durationHours > 0 ? row.net / durationHours : row.net,
        portionPerTransaction: row.transactions > 0 ? row.totalPortion / row.transactions : 0,
        smallRatio,
        largeRatio,
        durationLabel: getHourRange(row.startAt, row.endAt),
      };
    })
    .sort((a, b) => new Date(a.startAt || 0) - new Date(b.startAt || 0));

  // DEDUPE FINAL: antisipasi jika ada row shift yang identik muncul 2x
  const deduped = [];
  const seen = new Set();

  for (const row of rawRows) {
    const sig = [
      row.cashier || "",
      row.startAt ? new Date(row.startAt).toISOString() : "",
      row.endAt ? new Date(row.endAt).toISOString() : "",
      Number(row.transactions || 0),
      Number(row.net || 0),
      Number(row.smallPortion || 0),
      Number(row.largePortion || 0),
    ].join("|");

    if (seen.has(sig)) continue;
    seen.add(sig);
    deduped.push(row);
  }

  return deduped;
}

function calcOpeningClosingStock(ledgerRows = []) {
  const map = new Map();

  const sorted = [...ledgerRows].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

  for (const row of sorted) {
    const ingredientId = row.ingredientId || row.ingredient?.id || row.ingredient?.code || row.id;
    if (!ingredientId) continue;

    const delta = Number(row.delta || 0);
    const balanceAfter = Number(row.balanceAfter || 0);
    const balanceBefore = balanceAfter - delta;

    if (!map.has(ingredientId)) {
      map.set(ingredientId, {
        ingredientId,
        code: row.ingredient?.code || "-",
        name: row.ingredient?.name || "-",
        category: row.ingredient?.category || "-",
        unit: row.ingredient?.unit || "",
        opening: balanceBefore,
        closing: balanceAfter,
        stockIn: 0,
        stockOut: 0,
        movementCount: 0,
        firstMoveAt: row.createdAt || null,
        lastMoveAt: row.createdAt || null,
      });
    }

    const item = map.get(ingredientId);
    item.closing = balanceAfter;
    item.movementCount += 1;
    item.lastMoveAt = row.createdAt || item.lastMoveAt;

    if (delta > 0) item.stockIn += delta;
    if (delta < 0) item.stockOut += Math.abs(delta);
  }

  return Array.from(map.values())
    .map((row) => ({
      ...row,
      variance: Number(row.closing || 0) - Number(row.opening || 0),
      usageRate: Number(row.opening || 0) + Number(row.stockIn || 0) > 0
        ? (Number(row.stockOut || 0) / (Number(row.opening || 0) + Number(row.stockIn || 0))) * 100
        : 0,
    }))
    .sort((a, b) => Math.abs(Number(b.stockOut || 0)) - Math.abs(Number(a.stockOut || 0)));
}

function Kpi({ label, value, note, tone = "" }) {
  return (
    <section className={`rv2-kpi ${tone ? `rv2-kpi--${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </section>
  );
}

function Section({ title, desc, right, children, compact = false }) {
  return (
    <section className={`rv2-section ${compact ? "rv2-section--compact" : ""}`}>
      <div className="rv2-section-head">
        <div>
          <h3>{title}</h3>
          {desc ? <p>{desc}</p> : null}
        </div>
        {right ? <div className="rv2-section-right">{right}</div> : null}
      </div>
      {children}
    </section>
  );
}

function Empty({ title = "Belum ada data", desc = "Data akan tampil setelah filter memiliki hasil." }) {
  return (
    <div className="rv2-empty">
      <strong>{title}</strong>
      <span>{desc}</span>
    </div>
  );
}
function dedupeShiftRows(rows = []) {
  const map = new Map();

  for (const row of rows) {
    const key = [
      row.key || "",
      row.cashier || "",
      row.startAt ? new Date(row.startAt).toISOString() : "",
      row.endAt ? new Date(row.endAt).toISOString() : "",
      Number(row.transactions || 0),
      Number(row.net || 0),
      Number(row.smallPortion || 0),
      Number(row.largePortion || 0),
      Number(row.totalPortion || 0),
    ].join("|");

    if (!map.has(key)) {
      map.set(key, row);
    }
  }

  return Array.from(map.values());
}

function shortShiftName(row, index = 0) {
  const cashier = row.cashier || "Kasir";
  return `Shift ${index + 1} • ${cashier}`;
}


const REPORT_FIX_CSS = `
.rv2-page {
  background: radial-gradient(circle at top left, rgba(201, 111, 76, 0.08), transparent 34%), var(--bg, #f7f4ef);
}

.rv2-shell {
  width: min(1440px, calc(100vw - 28px));
  max-width: 1440px;
}

.rv2-card {
  overflow: visible;
}

.rv2-content {
  display: grid;
  gap: 16px;
}

.rv2-section {
  min-width: 0;
  padding: 18px;
  border: 1px solid rgba(92, 54, 39, 0.12);
  border-radius: 24px;
  background: #fffdfa;
  box-shadow: 0 1px 2px rgba(31, 27, 24, 0.035);
}

.rv2-section--compact {
  padding: 14px;
}

.rv2-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.rv2-section-head h3 {
  margin: 0;
  color: #211612;
  font-size: 18px;
  font-weight: 950;
  line-height: 1.15;
  letter-spacing: -0.03em;
}

.rv2-section-head p {
  margin: 5px 0 0;
  color: #755d52;
  font-size: 13px;
  font-weight: 750;
  line-height: 1.35;
}

.rv2-section-right {
  flex: 0 0 auto;
}

.rv2-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 14px;
}

.rv2-eyebrow {
  display: inline-flex;
  margin-bottom: 4px;
  color: #8b6b5b;
  font-size: 11px;
  font-weight: 950;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.rv2-hero h2 {
  margin: 0;
  color: #211612;
  font-size: clamp(24px, 2.7vw, 34px);
  font-weight: 950;
  line-height: 1;
  letter-spacing: -0.05em;
}

.rv2-hero p {
  margin: 7px 0 0;
  color: #755d52;
  font-size: 13px;
  font-weight: 700;
}

.rv2-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.rv2-tabs,
.rv2-subtabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 6px;
  margin-bottom: 14px;
  border: 1px solid rgba(92, 54, 39, 0.1);
  border-radius: 18px;
  background: #f6efe8;
}

.rv2-tabs button,
.rv2-subtabs button {
  min-height: 38px;
  padding: 9px 13px;
  border-radius: 13px;
  background: transparent;
  color: #755d52;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
}

.rv2-tabs button.active,
.rv2-subtabs button.active {
  background: #fffdfa;
  color: #9b5539;
  box-shadow: 0 1px 2px rgba(31, 27, 24, 0.05);
}

.rv2-filter-grid {
  display: grid;
  grid-template-columns: 1.3fr repeat(3, minmax(150px, 0.8fr));
  gap: 12px;
}

.rv2-filter-grid--three {
  grid-template-columns: 1fr 220px 150px;
}

.rv2-filter-grid label {
  min-width: 0;
  display: grid;
  gap: 6px;
  margin: 0;
}

.rv2-filter-grid label > span {
  color: #6b5146;
  font-size: 11px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.rv2-kpi-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
}

.rv2-kpi {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: 5px;
  padding: 13px;
  border: 1px solid rgba(92, 54, 39, 0.12);
  border-radius: 18px;
  background: linear-gradient(180deg, #ffffff, #fffaf7);
}

.rv2-kpi--main {
  background: #fff1eb;
  border-color: rgba(201, 111, 76, 0.2);
}

.rv2-kpi--danger {
  background: #fff1ef;
  border-color: rgba(185, 74, 66, 0.2);
}

.rv2-kpi span {
  color: #7a6257;
  font-size: 10.5px;
  font-weight: 950;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  line-height: 1.2;
}

.rv2-kpi strong {
  color: #211612;
  font-size: clamp(16px, 1.55vw, 21px);
  font-weight: 950;
  line-height: 1.08;
  overflow-wrap: anywhere;
}

.rv2-kpi small {
  color: #7a6257;
  font-size: 11.5px;
  font-weight: 750;
  line-height: 1.3;
}

.rv2-two-col {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
  gap: 16px;
  align-items: start;
}

.rv2-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  max-width: 100%;
  min-height: 28px;
  padding: 5px 10px;
  border: 1px solid rgba(92, 54, 39, 0.12);
  border-radius: 999px;
  background: #fff7f1;
  color: #5c382e;
  font-size: 11px;
  font-weight: 900;
  line-height: 1;
  white-space: nowrap;
}

.rv2-chip--ok { background: #edf7f2; color: #34785a; border-color: rgba(52, 120, 90, 0.18); }
.rv2-chip--warn { background: #fff6e7; color: #9a6a2e; border-color: rgba(154, 106, 46, 0.18); }
.rv2-chip--danger { background: #fff1ef; color: #b94a42; border-color: rgba(185, 74, 66, 0.18); }

.rv2-alert {
  margin-bottom: 12px;
  padding: 11px 13px;
  border-radius: 14px;
  font-size: 13px;
  font-weight: 850;
}

.rv2-alert--bad { background: #fff1ef; color: #b94a42; border: 1px solid rgba(185, 74, 66, 0.18); }
.rv2-alert--ok { background: #edf7f2; color: #34785a; border: 1px solid rgba(52, 120, 90, 0.18); }

.rv2-loading {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #755d52;
  font-size: 12px;
  font-weight: 900;
}

.rv2-empty {
  display: grid;
  place-items: center;
  gap: 4px;
  min-height: 84px;
  padding: 14px;
  border: 1px dashed rgba(92, 54, 39, 0.18);
  border-radius: 16px;
  background: #fffaf7;
  text-align: center;
}

.rv2-empty strong { color: #211612; font-size: 13px; font-weight: 950; }
.rv2-empty span { color: #755d52; font-size: 12px; font-weight: 700; }

/* Shift analysis: one clean section, no duplicate row, compact table */
.rv2-shift-cards {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.rv2-shift-card {
  min-width: 0;
  padding: 12px;
  border: 1px solid rgba(92, 54, 39, 0.12);
  border-radius: 18px;
  background: linear-gradient(180deg, #ffffff, #fffaf7);
}

.rv2-shift-card span {
  display: block;
  margin-bottom: 6px;
  color: #7a6257;
  font-size: 10px;
  font-weight: 950;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  line-height: 1.2;
}

.rv2-shift-card strong {
  display: block;
  color: #211612;
  font-size: clamp(14px, 1.1vw, 18px);
  font-weight: 950;
  line-height: 1.06;
  overflow-wrap: anywhere;
}

.rv2-shift-table-wrap {
  width: 100%;
  overflow-x: auto;
  border: 1px solid rgba(92, 54, 39, 0.12);
  border-radius: 18px;
  background: #fff;
}

.rv2-shift-table {
  width: 100%;
  min-width: 1050px;
  border-collapse: collapse;
  table-layout: fixed;
}

.rv2-shift-table th,
.rv2-shift-table td {
  padding: 9px 8px;
  border-bottom: 1px solid rgba(92, 54, 39, 0.08);
  vertical-align: top;
  text-align: left;
  font-size: 11.5px;
  line-height: 1.3;
  word-break: break-word;
}

.rv2-shift-table th {
  background: #fffaf7;
  color: #7a6257;
  font-size: 10px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.rv2-shift-table tbody tr:last-child td { border-bottom: 0; }
.rv2-shift-table td b,
.rv2-shift-table td strong { color: #211612; font-size: 11.5px; font-weight: 950; }
.rv2-shift-table .rv2-chip { font-size: 10px; padding: 4px 7px; }

.rv2-shift-col-main strong { display: block; margin-bottom: 3px; line-height: 1.22; }
.rv2-shift-col-main small { display: block; color: #7a6257; font-size: 10px; font-weight: 750; line-height: 1.2; }
.rv2-shift-time { display: grid; gap: 3px; }
.rv2-shift-time span { display: block; }

.rv2-cart-performance { display: grid; gap: 12px; }
.rv2-cart-performance__summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.rv2-cart-performance__summary > div,
.rv2-cart-row {
  min-width: 0;
  padding: 12px;
  border: 1px solid rgba(92, 54, 39, 0.12);
  border-radius: 16px;
  background: #fffaf7;
}
.rv2-cart-performance__summary span,
.rv2-cart-row__meta { color: #7a6257; font-size: 10.5px; font-weight: 900; }
.rv2-cart-performance__summary strong { display: block; margin-top: 5px; color: #211612; font-size: 16px; font-weight: 950; line-height: 1.1; }
.rv2-cart-performance__list { display: grid; gap: 9px; }
.rv2-cart-row { display: grid; gap: 8px; border-radius: 18px; }
.rv2-cart-row__top { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.rv2-cart-row__top > div { min-width: 0; display: grid; gap: 3px; }
.rv2-cart-row__top strong { color: #211612; font-size: 13px; font-weight: 950; line-height: 1.2; }
.rv2-cart-row__top span { color: #755d52; font-size: 11.5px; font-weight: 750; }
.rv2-cart-row__top b { color: #211612; font-size: 14px; font-weight: 950; white-space: nowrap; }
.rv2-cart-row__bar { height: 8px; overflow: hidden; border-radius: 999px; background: rgba(92, 54, 39, 0.09); }
.rv2-cart-row__bar i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #9b6a4c, #d1a27d); }
.rv2-cart-row__meta { display: flex; justify-content: space-between; gap: 8px; }

.rv2-mini-list { display: grid; gap: 9px; }
.rv2-mini-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 12px; border: 1px solid rgba(92, 54, 39, 0.12); border-radius: 16px; background: #fffaf7; }
.rv2-mini-row > div { min-width: 0; display: grid; gap: 3px; }
.rv2-mini-row strong { color: #211612; font-size: 13px; font-weight: 950; }
.rv2-mini-row span { color: #755d52; font-size: 11.5px; font-weight: 750; }
.rv2-mini-row b { color: #211612; font-size: 13px; font-weight: 950; white-space: nowrap; }

.rv2-table-wrap { width: 100%; overflow-x: auto; border: 1px solid rgba(92, 54, 39, 0.12); border-radius: 18px; background: #fff; }
.rv2-table-wrap--wide { max-width: 100%; }
.rv2-table { width: 100%; min-width: 780px; border-collapse: collapse; }
.rv2-table th,
.rv2-table td { padding: 10px 11px; border-bottom: 1px solid rgba(92, 54, 39, 0.08); vertical-align: top; text-align: left; font-size: 12px; line-height: 1.35; }
.rv2-table th { background: #fffaf7; color: #7a6257; font-size: 10.5px; font-weight: 950; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; }
.rv2-table tbody tr:last-child td { border-bottom: 0; }
.rv2-table td b { color: #211612; font-weight: 950; }
.rv2-table--compact th,
.rv2-table--compact td { padding: 9px 10px; font-size: 11.5px; }
.rv2-cell-wide { min-width: 180px; max-width: 320px; white-space: normal; word-break: break-word; }
.rv2-table--matrix td small { display: block; margin-top: 3px; color: #7a6257; font-size: 10px; font-weight: 750; }

.rv2-stock-compare-summary {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}
.rv2-stock-compare-summary > div { min-width: 0; padding: 12px; border: 1px solid rgba(92, 54, 39, 0.12); border-radius: 16px; background: linear-gradient(180deg, #ffffff, #fffaf7); }
.rv2-stock-compare-summary span { display: block; margin-bottom: 5px; color: #7a6257; font-size: 10px; font-weight: 950; letter-spacing: 0.05em; text-transform: uppercase; }
.rv2-stock-compare-summary strong { display: block; color: #211612; font-size: 17px; font-weight: 950; line-height: 1.1; overflow-wrap: anywhere; }

@media (max-width: 1180px) {
  .rv2-kpi-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .rv2-shift-cards { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .rv2-two-col { grid-template-columns: 1fr; }
}

@media (max-width: 820px) {
  .rv2-shell { width: calc(100vw - 18px); }
  .rv2-card { padding: 12px; }
  .rv2-hero { display: grid; }
  .rv2-actions { justify-content: stretch; }
  .rv2-actions .btn { flex: 1 1 130px; }
  .rv2-filter-grid,
  .rv2-filter-grid--three { grid-template-columns: 1fr; }
  .rv2-kpi-grid,
  .rv2-shift-cards,
  .rv2-stock-compare-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .rv2-section { padding: 14px; border-radius: 20px; }
}

@media (max-width: 520px) {
  .rv2-kpi-grid,
  .rv2-shift-cards,
  .rv2-stock-compare-summary,
  .rv2-cart-performance__summary { grid-template-columns: 1fr; }
  .rv2-cart-row__top,
  .rv2-mini-row { display: grid; }
  .rv2-cart-row__top b,
  .rv2-mini-row b { white-space: normal; }
}
`;

export default function AdminReports() {
  const nav = useNavigate();
  const token = localStorage.getItem("admin_token") || localStorage.getItem("auth_token");
  const today = ymdWib();
  const didLoadRef = useRef(false);

  const [mainTab, setMainTab] = useState("FINANCE");
  const [stockView, setStockView] = useState("SNAPSHOT");
  const [carts, setCarts] = useState([]);
  const [activeCartId, setActiveCartId] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [loadingCarts, setLoadingCarts] = useState(false);
  const [loadingFinance, setLoadingFinance] = useState(false);
  const [loadingStock, setLoadingStock] = useState(false);
  const [loadingLedger, setLoadingLedger] = useState(false);

  const [globalReport, setGlobalReport] = useState(null);
  const [cartReport, setCartReport] = useState(null);
  const [showAllSales, setShowAllSales] = useState(false);

  const [stockScope, setStockScope] = useState("CART");
  const [stockQ, setStockQ] = useState("");
  const [stockStatus, setStockStatus] = useState("ALL");
  const [stockRows, setStockRows] = useState([]);

  const [ledgerQ, setLedgerQ] = useState("");
  const [ledgerType, setLedgerType] = useState("");
  const [ledgerReason, setLedgerReason] = useState("");
  const [ledgerRows, setLedgerRows] = useState([]);
  const [ledgerSummary, setLedgerSummary] = useState({
    movements: 0,
    totalIn: 0,
    totalOut: 0,
    net: 0,
    lastMovementAt: null,
  });

  useEffect(() => {
    if (!token) nav("/admin");
  }, [token, nav]);

  const selectedCart = useMemo(
    () => carts.find((cart) => cart.id === activeCartId) || null,
    [carts, activeCartId]
  );

  const rangeLabel = useMemo(() => formatRange(startDate, endDate), [startDate, endDate]);

  const sales = useMemo(
    () => (Array.isArray(cartReport?.sales) ? cartReport.sales : []),
    [cartReport]
  );

  const visibleSales = useMemo(
    () => (showAllSales ? sales : sales.slice(0, 25)),
    [sales, showAllSales]
  );

  const totals = cartReport?.totals || {};
  const portionTotals = cartReport?.portionTotals || { small: 0, large: 0, total: 0 };
  const topProducts = Array.isArray(cartReport?.topProducts) ? cartReport.topProducts : [];
  const flavorSummary = Array.isArray(cartReport?.flavorSummary) ? cartReport.flavorSummary : [];
  const matrixColumns = Array.isArray(cartReport?.matrixColumns) ? cartReport.matrixColumns : [];
  const stockSummary = useMemo(() => calcStockSummary(stockRows), [stockRows]);
  const shiftAnalysis = useMemo(() => calcShiftAnalysis(sales, matrixColumns), [sales, matrixColumns]);
  const stockOpeningClosing = useMemo(() => calcOpeningClosingStock(ledgerRows), [ledgerRows]);

  const shiftTotals = useMemo(() => {
    return shiftAnalysis.reduce(
      (acc, row) => {
        acc.transactions += Number(row.transactions || 0);
        acc.net += Number(row.net || 0);
        acc.cash += Number(row.cash || 0);
        acc.qris += Number(row.qris || 0);
        acc.discount += Number(row.discount || 0);
        acc.smallPortion += Number(row.smallPortion || 0);
        acc.largePortion += Number(row.largePortion || 0);
        acc.totalPortion += Number(row.totalPortion || 0);
        acc.salesPerHour += Number(row.salesPerHour || 0);
        return acc;
      },
      {
        transactions: 0,
        net: 0,
        cash: 0,
        qris: 0,
        discount: 0,
        smallPortion: 0,
        largePortion: 0,
        totalPortion: 0,
        salesPerHour: 0,
      }
    );
  }, [shiftAnalysis]);

  const stockOpeningClosingSummary = useMemo(() => {
    return stockOpeningClosing.reduce(
      (acc, row) => {
        acc.items += 1;
        acc.opening += Number(row.opening || 0);
        acc.in += Number(row.stockIn || 0);
        acc.out += Number(row.stockOut || 0);
        acc.closing += Number(row.closing || 0);
        acc.variance += Number(row.variance || 0);
        return acc;
      },
      { items: 0, opening: 0, in: 0, out: 0, closing: 0, variance: 0 }
    );
  }, [stockOpeningClosing]);

  const scopeName = stockScope === "CENTRAL" ? "Central Kitchen" : selectedCart?.name || "Gerobak";
  const averageTransaction = Number(totals.transactions || 0) > 0 ? Number(totals.total || 0) / Number(totals.transactions || 1) : 0;
  const cashRatio = Number(totals.total || 0) > 0 ? (Number(totals.cash || 0) / Number(totals.total || 1)) * 100 : 0;
  const qrisRatio = Number(totals.total || 0) > 0 ? (Number(totals.qris || 0) / Number(totals.total || 1)) * 100 : 0;

  function validateRange(sd = startDate, ed = endDate) {
    if (!sd || !ed) return "Tanggal awal dan tanggal akhir wajib diisi.";
    if (sd > ed) return "Tanggal awal tidak boleh lebih besar dari tanggal akhir.";
    return "";
  }

  async function loadCarts() {
    setLoadingCarts(true);
    setErr("");
    setMsg("");
    try {
      const response = await apiGet("/api/admin/carts", token, { force: true });
      const list = response.carts || [];
      setCarts(list);
      if (!activeCartId && list.length) {
        const first = list.find((cart) => cart.isActive !== false) || list[0];
        setActiveCartId(first.id);
      }
    } catch (error) {
      setErr(error?.message || "Gagal load gerobak.");
    } finally {
      setLoadingCarts(false);
    }
  }

  async function loadFinance(cartId = activeCartId, sd = startDate, ed = endDate) {
    if (!cartId) return;
    const rangeErr = validateRange(sd, ed);
    if (rangeErr) {
      setErr(rangeErr);
      return;
    }

    setErr("");
    setMsg("");
    setLoadingFinance(true);
    try {
      const query = buildRangeQuery(sd, ed);
      const [cartRes, globalRes] = await Promise.all([
        apiGet(`/api/reports/cart/${cartId}${query}`, token, { force: true }),
        apiGet(`/api/reports/today${query}`, token, { force: true }),
      ]);
      setCartReport(cartRes);
      setGlobalReport(globalRes);
    } catch (error) {
      setErr(error?.message || "Gagal load laporan keuangan.");
      setCartReport(null);
      setGlobalReport(null);
    } finally {
      setLoadingFinance(false);
    }
  }

  async function loadStockSnapshot() {
    if (stockScope === "CART" && !activeCartId) return;
    setErr("");
    setMsg("");
    setLoadingStock(true);
    try {
      const qs = new URLSearchParams();
      qs.set("scope", stockScope);
      if (stockScope === "CART") qs.set("cartId", activeCartId);
      if (stockQ.trim()) qs.set("q", stockQ.trim());
      if (stockStatus !== "ALL") qs.set("status", stockStatus);
      const response = await apiGet(`/api/admin/inventory/stocks?${qs.toString()}`, token, { force: true });
      setStockRows(response.items || []);
    } catch (error) {
      setErr(error?.message || "Gagal load laporan stok.");
      setStockRows([]);
    } finally {
      setLoadingStock(false);
    }
  }

  async function loadLedger() {
    if (stockScope === "CART" && !activeCartId) return;
    const rangeErr = validateRange();
    if (rangeErr) {
      setErr(rangeErr);
      return;
    }

    setErr("");
    setMsg("");
    setLoadingLedger(true);
    try {
      const qs = new URLSearchParams();
      qs.set("scope", stockScope);
      if (stockScope === "CART") qs.set("cartId", activeCartId);
      if (startDate) qs.set("startDate", startDate);
      if (endDate) qs.set("endDate", endDate);
      if (ledgerQ.trim()) qs.set("q", ledgerQ.trim());
      if (ledgerType.trim()) qs.set("type", ledgerType.trim());
      if (ledgerReason.trim()) qs.set("reason", ledgerReason.trim());
      qs.set("limit", "500");

      const response = await apiGet(`/api/admin/inventory/ledger?${qs.toString()}`, token, { force: true });
      setLedgerRows(response.items || []);
      setLedgerSummary(response.summary || { movements: 0, totalIn: 0, totalOut: 0, net: 0, lastMovementAt: null });
    } catch (error) {
      setErr(error?.message || "Gagal load stock ledger.");
      setLedgerRows([]);
      setLedgerSummary({ movements: 0, totalIn: 0, totalOut: 0, net: 0, lastMovementAt: null });
    } finally {
      setLoadingLedger(false);
    }
  }

  useEffect(() => {
    if (!token || didLoadRef.current) return;
    didLoadRef.current = true;
    loadCarts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token || !activeCartId) return;
    loadFinance(activeCartId, startDate, endDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, activeCartId, startDate, endDate]);

  useEffect(() => {
    if (!token) return;
    if (mainTab === "STOCK") loadStockSnapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, mainTab, stockScope, activeCartId, stockStatus]);

  useEffect(() => {
    if (!token) return;
    if (mainTab === "STOCK" && stockView === "LEDGER") loadLedger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, mainTab, stockView, stockScope, activeCartId, startDate, endDate]);

  function setTodayRange() {
    const now = ymdWib();
    setStartDate(now);
    setEndDate(now);
  }

  async function exportSalesCsv() {
    if (!activeCartId) return;
    const rangeErr = validateRange();
    if (rangeErr) return setErr(rangeErr);
    setErr("");
    setMsg("");
    try {
      const query = buildRangeQuery(startDate, endDate);
      await downloadWithAuth(`/api/reports/cart/${activeCartId}/export.csv${query}`, token, `report_${activeCartId}_${startDate}_sd_${endDate}.csv`);
      setMsg("Export CSV laporan keuangan dimulai.");
    } catch (error) {
      setErr(error?.message || "Gagal export CSV.");
    }
  }

  async function exportSalesPdf() {
    if (!activeCartId) return;
    const rangeErr = validateRange();
    if (rangeErr) return setErr(rangeErr);
    setErr("");
    setMsg("");
    try {
      const query = buildRangeQuery(startDate, endDate);
      await downloadWithAuth(`/api/reports/cart/${activeCartId}/export.pdf${query}`, token, `report_${activeCartId}_${startDate}_sd_${endDate}.pdf`);
      setMsg("Export PDF laporan keuangan dimulai.");
    } catch (error) {
      setErr(error?.message || "Gagal export PDF.");
    }
  }

  async function exportStockSnapshotCsv() {
    try {
      const qs = new URLSearchParams();
      qs.set("scope", stockScope);
      if (stockScope === "CART") qs.set("cartId", activeCartId);
      if (stockQ.trim()) qs.set("q", stockQ.trim());
      if (stockStatus !== "ALL") qs.set("status", stockStatus);
      await downloadWithAuth(`/api/admin/inventory/export.csv?${qs.toString()}`, token, `inventory_snapshot_${Date.now()}.csv`);
      setMsg("Export CSV snapshot stok dimulai.");
    } catch (error) {
      setErr(error?.message || "Gagal export stok CSV.");
    }
  }

  async function exportLedgerCsv() {
    const rangeErr = validateRange();
    if (rangeErr) return setErr(rangeErr);
    try {
      const qs = new URLSearchParams();
      qs.set("scope", stockScope);
      if (stockScope === "CART") qs.set("cartId", activeCartId);
      if (startDate) qs.set("startDate", startDate);
      if (endDate) qs.set("endDate", endDate);
      if (ledgerQ.trim()) qs.set("q", ledgerQ.trim());
      if (ledgerType.trim()) qs.set("type", ledgerType.trim());
      if (ledgerReason.trim()) qs.set("reason", ledgerReason.trim());
      await downloadWithAuth(`/api/admin/inventory/ledger/export.csv?${qs.toString()}`, token, `inventory_ledger_${Date.now()}.csv`);
      setMsg("Export CSV stock ledger dimulai.");
    } catch (error) {
      setErr(error?.message || "Gagal export ledger CSV.");
    }
  }

  function exportCurrentStockView() {
    const headers = ["Scope", "Gerobak", "Code", "Item", "Category", "Source", "Unit", "Qty", "Min", "Reorder", "Par", "Suggested", "Status", "Last Movement"];
    const lines = [headers.map(csvCell).join(",")];
    for (const row of stockRows) {
      const ingredient = row.ingredient || {};
      lines.push([
        stockScope,
        stockScope === "CENTRAL" ? "Central" : selectedCart?.name || "",
        ingredient.code || "",
        ingredient.name || "",
        ingredient.category || "",
        ingredient.isGlobal ? "CENTRAL" : "CART",
        ingredient.unit || "",
        Number(row.qty || 0),
        Number(ingredient.minStock || 0),
        Number(ingredient.reorderPoint || 0),
        Number(ingredient.parStock || 0),
        Number(row.suggestedOrderQty || 0),
        row.stockStatus || "OK",
        row.lastMovementAt ? new Date(row.lastMovementAt).toISOString() : "",
      ].map(csvCell).join(","));
    }
    downloadTextFile(`stock_view_${Date.now()}.csv`, "\uFEFF" + lines.join("\n"));
  }

  const busy = loadingCarts || loadingFinance || loadingStock || loadingLedger;

  return (
    <main className="adm-bg adm rv2-page">
      <style>{REPORT_FIX_CSS}</style>
      <div className="adm-shell rv2-shell">
        <section className="adm-main-card rv2-card">
          <div className="rv2-hero">
            <div>
              <span className="rv2-eyebrow">Admin Report</span>
              <h2>Laporan POS</h2>
              <p>Laporan dipisah menjadi keuangan dan stok. Filter tanggal memakai WIB.</p>
            </div>
            <div className="rv2-actions">
              <button className="btn secondary" type="button" onClick={setTodayRange}>Hari Ini</button>
              <button className="btn secondary" type="button" onClick={() => nav("/admin/dashboard")}>Dashboard</button>
              {mainTab === "FINANCE" ? (
                <>
                  <button className="btn secondary" type="button" onClick={() => loadFinance()} disabled={!activeCartId || loadingFinance}>{loadingFinance ? "Loading..." : "Refresh"}</button>
                  <button className="btn secondary" type="button" onClick={exportSalesCsv} disabled={!activeCartId}>CSV</button>
                  <button className="btn" type="button" onClick={exportSalesPdf} disabled={!activeCartId}>PDF</button>
                </>
              ) : (
                <>
                  <button className="btn secondary" type="button" onClick={stockView === "SNAPSHOT" ? loadStockSnapshot : loadLedger} disabled={loadingStock || loadingLedger}>{loadingStock || loadingLedger ? "Loading..." : "Refresh"}</button>
                  {stockView === "SNAPSHOT" ? <button className="btn secondary" type="button" onClick={exportCurrentStockView} disabled={!stockRows.length}>CSV View</button> : null}
                  <button className="btn" type="button" onClick={stockView === "SNAPSHOT" ? exportStockSnapshotCsv : exportLedgerCsv}>{stockView === "SNAPSHOT" ? "CSV Stok" : "CSV Ledger"}</button>
                </>
              )}
            </div>
          </div>

          {err ? <div className="rv2-alert rv2-alert--bad">{err}</div> : null}
          {msg ? <div className="rv2-alert rv2-alert--ok">{msg}</div> : null}

          <div className="rv2-tabs" role="tablist" aria-label="Jenis laporan">
            <button type="button" className={mainTab === "FINANCE" ? "active" : ""} onClick={() => setMainTab("FINANCE")}>Laporan Keuangan</button>
            <button type="button" className={mainTab === "STOCK" ? "active" : ""} onClick={() => setMainTab("STOCK")}>Laporan Stok</button>
          </div>

          <Section title="Filter Laporan" desc="Pilih gerobak, periode, dan scope stok." right={busy ? <span className="rv2-loading"><span className="spinner spinner--sm" /> Memuat</span> : null} compact>
            <div className="rv2-filter-grid">
              <label>
                <span>Gerobak</span>
                <select className="input" value={activeCartId} onChange={(e) => setActiveCartId(e.target.value)} disabled={loadingCarts}>
                  {carts.map((cart) => <option key={cart.id} value={cart.id}>{cart.name} {cart.isActive === false ? "(INACTIVE)" : ""}</option>)}
                  {!carts.length ? <option value="">Belum ada gerobak</option> : null}
                </select>
              </label>
              <label>
                <span>Dari</span>
                <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </label>
              <label>
                <span>Sampai</span>
                <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </label>
              <label>
                <span>Scope Stok</span>
                <select className="input" value={stockScope} onChange={(e) => setStockScope(e.target.value)}>
                  <option value="CART">Gerobak</option>
                  <option value="CENTRAL">Central Kitchen</option>
                </select>
              </label>
            </div>
          </Section>

          {mainTab === "FINANCE" ? (
            <div className="rv2-content">
              <div className="rv2-kpi-grid">
                <Kpi label="Total Penjualan" value={rupiah(totals.total)} note={`${selectedCart?.name || "Gerobak"} • ${rangeLabel}`} tone="main" />
                <Kpi label="Cash" value={rupiah(totals.cash)} note={`${percent(cashRatio)} dari total`} />
                <Kpi label="QRIS / Transfer" value={rupiah(totals.qris)} note={`${percent(qrisRatio)} dari total`} />
                <Kpi label="Transaksi" value={number(totals.transactions || sales.length)} note={`Rata-rata ${rupiah(averageTransaction)}`} />
                <Kpi label="Total Porsi" value={number(portionTotals.total)} note={`Reguler ${number(portionTotals.small)} • Jumbo ${number(portionTotals.large)}`} />
                <Kpi label="Semua Gerobak" value={rupiah(globalReport?.totalAll?.total || 0)} note="Omzet total pada periode ini" />
              </div>
              <Section
                  title="Analisis per Shift"
                  desc="Ringkasan performa shift berdasarkan transaksi pada periode aktif."
                  right={<span className="rv2-chip">{number(shiftAnalysis.length)} shift</span>}
                >
                  <div className="rv2-shift-cards">
                    <div className="rv2-shift-card">
                      <span>Total Shift</span>
                      <strong>{number(shiftAnalysis.length)}</strong>
                    </div>
                    <div className="rv2-shift-card">
                      <span>Total Transaksi</span>
                      <strong>{number(shiftTotals.transactions)}</strong>
                    </div>
                    <div className="rv2-shift-card">
                      <span>Omzet Shift</span>
                      <strong>{rupiah(shiftTotals.net)}</strong>
                    </div>
                    <div className="rv2-shift-card">
                      <span>Total Porsi</span>
                      <strong>{number(shiftTotals.totalPortion)}</strong>
                    </div>
                    <div className="rv2-shift-card">
                      <span>Reguler</span>
                      <strong>{number(shiftTotals.smallPortion)}</strong>
                    </div>
                    <div className="rv2-shift-card">
                      <span>Jumbo</span>
                      <strong>{number(shiftTotals.largePortion)}</strong>
                    </div>
                  </div>

                  <div className="rv2-shift-table-wrap">
                    <table className="rv2-table rv2-table--compact rv2-shift-table">
                      <thead>
                        <tr>
                          <th>Shift</th>
                          <th>Kasir</th>
                          <th>Jam</th>
                          <th>Durasi</th>
                          <th>Trx</th>
                          <th>Reg</th>
                          <th>Jum</th>
                          <th>Total</th>
                          <th>R / J</th>
                          <th>Cash</th>
                          <th>QRIS</th>
                          <th>Diskon</th>
                          <th>Net</th>
                          <th>AOV</th>
                          <th>Sales/Jam</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shiftAnalysis.map((row, index) => (
                          <tr key={`shift-row-${row.key || index}`}>
                            <td className="rv2-shift-col-main">
                              <strong>{shortShiftName(row, index)}</strong>
                              <small>{formatDate(String(row.startAt || "").slice(0, 10))}</small>
                            </td>
                            <td>{row.cashier || "-"}</td>
                            <td>
                              <div className="rv2-shift-time">
                                <span>{fmtDateTime(row.startAt)}</span>
                                <span>{fmtDateTime(row.endAt)}</span>
                              </div>
                            </td>
                            <td>{row.durationLabel || "-"}</td>
                            <td><b>{number(row.transactions)}</b></td>
                            <td>{number(row.smallPortion)}</td>
                            <td>{number(row.largePortion)}</td>
                            <td><b>{number(row.totalPortion)}</b></td>
                            <td>
                              <span className="rv2-chip">
                                {percent(row.smallRatio)} / {percent(row.largeRatio)}
                              </span>
                            </td>
                            <td>{rupiah(row.cash)}</td>
                            <td>{rupiah(row.qris)}</td>
                            <td>{rupiah(row.discount)}</td>
                            <td><b>{rupiah(row.net)}</b></td>
                            <td>{rupiah(row.averageOrder)}</td>
                            <td>{rupiah(row.salesPerHour)}</td>
                          </tr>
                        ))}

                        {!shiftAnalysis.length ? (
                          <tr>
                            <td colSpan={15}>
                              <Empty
                                title="Belum ada data shift"
                                desc="Data shift akan muncul setelah ada transaksi pada periode ini."
                              />
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </Section>

              <div className="rv2-two-col">
                <Section title="Performa Gerobak" desc="Ringkasan omzet semua gerobak pada periode aktif.">
                  {(() => {
                    const rows = globalReport?.perCart || [];
                    const grandTotal = Number(globalReport?.totalAll?.total || 0);
                    const activeRows = rows.filter((row) => Number(row.total || 0) > 0);
                    const totalTransactions = rows.reduce((sum, row) => sum + Number(row.transactions || row.count || 0), 0);

                    return (
                      <div className="rv2-cart-performance">
                        <div className="rv2-cart-performance__summary">
                          <div>
                            <span>Total Omzet</span>
                            <strong>{rupiah(grandTotal)}</strong>
                          </div>
                          <div>
                            <span>Gerobak Aktif</span>
                            <strong>{number(activeRows.length)}</strong>
                          </div>
                          <div>
                            <span>Transaksi</span>
                            <strong>{number(totalTransactions)}</strong>
                          </div>
                        </div>

                        <div className="rv2-cart-performance__list">
                          {rows.map((row) => {
                            const total = Number(row.total || 0);
                            const cash = Number(row.cash || 0);
                            const qris = Number(row.qris || 0);
                            const share = grandTotal > 0 ? (total / grandTotal) * 100 : 0;

                            return (
                              <div key={row.cartId} className="rv2-cart-row">
                                <div className="rv2-cart-row__top">
                                  <div>
                                    <strong>{row.cartName || row.cartId}</strong>
                                    <span>Cash {rupiah(cash)} • QRIS {rupiah(qris)}</span>
                                  </div>
                                  <b>{rupiah(total)}</b>
                                </div>

                                <div className="rv2-cart-row__bar">
                                  <i style={{ width: `${Math.min(100, Math.max(0, share))}%` }} />
                                </div>

                                <div className="rv2-cart-row__meta">
                                  <span>Kontribusi {percent(share)}</span>
                                  <span>{number(row.transactions || row.count || 0)} transaksi</span>
                                </div>
                              </div>
                            );
                          })}

                          {!rows.length ? (
                            <Empty title="Belum ada omzet" desc="Tidak ada transaksi pada periode ini." />
                          ) : null}
                        </div>
                      </div>
                    );
                  })()}
                </Section>

                <Section title="Top Produk" desc="Produk paling banyak terjual pada gerobak terpilih.">
                  <div className="rv2-mini-list">
                    {topProducts.slice(0, 8).map((product, index) => (
                      <div key={`${product.productId}-${product.portion}-${index}`} className="rv2-mini-row">
                        <div><strong>{index + 1}. {product.productName || "-"}</strong><span>Portion {product.portion || "-"}</span></div>
                        <b>{number(product.qty, " pcs")}</b>
                      </div>
                    ))}
                    {!topProducts.length ? <Empty title="Belum ada top produk" desc="Data muncul setelah ada transaksi." /> : null}
                  </div>
                </Section>
              </div>

              <Section title="Rekap Penjualan per Menu" desc="Qty reguler, jumbo, total, dan omzet kotor per menu.">
                <div className="rv2-table-wrap">
                  <table className="rv2-table">
                    <thead><tr><th>Menu</th><th>Reguler</th><th>Jumbo</th><th>Total Qty</th><th>Omzet Item</th></tr></thead>
                    <tbody>
                      {flavorSummary.map((row) => (
                        <tr key={row.productName}>
                          <td><b>{row.productName || "-"}</b></td>
                          <td>{number(row.qtySmall)}</td>
                          <td>{number(row.qtyLarge)}</td>
                          <td><b>{number(row.qtyTotal)}</b></td>
                          <td><b>{rupiah(row.grossAmount)}</b></td>
                        </tr>
                      ))}
                      {!flavorSummary.length ? <tr><td colSpan={5}><Empty /></td></tr> : null}
                    </tbody>
                  </table>
                </div>
              </Section>

              <Section title="Detail Transaksi" desc="Ringkasan transaksi lengkap. Untuk matriks menu per transaksi, gunakan export PDF/CSV atau tabel matriks di bawah." right={sales.length > 25 ? <button type="button" className="btn secondary btn--sm" onClick={() => setShowAllSales((v) => !v)}>{showAllSales ? "Tampilkan 25" : `Tampilkan Semua (${sales.length})`}</button> : <span className="rv2-chip">{number(sales.length)} transaksi</span>}>
                <div className="rv2-table-wrap">
                  <table className="rv2-table rv2-table--compact">
                    <thead><tr><th>No</th><th>Transaksi</th><th>Waktu</th><th>Kasir</th><th>Metode</th><th>Item</th><th>Gross</th><th>Diskon</th><th>Total</th></tr></thead>
                    <tbody>
                      {visibleSales.map((sale, index) => (
                        <tr key={sale.id}>
                          <td>{index + 1}</td>
                          <td><b>{shortId(sale.id)}</b></td>
                          <td>{fmtDateTime(sale.createdAt)}</td>
                          <td>{sale.cashier || "-"}</td>
                          <td><span className="rv2-chip">{sale.paymentMethod || "-"}</span></td>
                          <td className="rv2-cell-wide">{sale.itemsFullSummary || sale.itemsSummary || "-"}</td>
                          <td>{rupiah(sale.grossTotal)}</td>
                          <td>{rupiah(sale.discount)}</td>
                          <td><b>{rupiah(sale.netTotal)}</b></td>
                        </tr>
                      ))}
                      {!sales.length ? <tr><td colSpan={9}><Empty title="Belum ada transaksi" desc="Tidak ada transaksi pada periode dan gerobak ini." /></td></tr> : null}
                    </tbody>
                  </table>
                </div>
              </Section>

              <Section title="Matriks Item per Transaksi" desc="Qty dan nilai item per transaksi. Tabel otomatis melebar; gunakan scroll horizontal bila menu banyak.">
                <div className="rv2-table-wrap rv2-table-wrap--wide">
                  <table className="rv2-table rv2-table--matrix">
                    <thead>
                      <tr>
                        <th>Transaksi</th><th>Waktu</th><th>Total</th>
                        {matrixColumns.map((col) => <th key={col.key}>{col.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleSales.map((sale) => (
                        <tr key={`mx-${sale.id}`}>
                          <td><b>{shortId(sale.id)}</b></td>
                          <td>{fmtDateTime(sale.createdAt)}</td>
                          <td><b>{rupiah(sale.netTotal)}</b></td>
                          {matrixColumns.map((col) => {
                            const cell = sale.itemMatrix?.[col.key] || {};
                            return <td key={`${sale.id}-${col.key}`}>{number(cell.qty || 0)}<small>{rupiah(cell.amount || 0)}</small></td>;
                          })}
                        </tr>
                      ))}
                      {!sales.length ? <tr><td colSpan={Math.max(3, matrixColumns.length + 3)}><Empty /></td></tr> : null}
                    </tbody>
                  </table>
                </div>
              </Section>
            </div>
          ) : null}

          {mainTab === "STOCK" ? (
            <div className="rv2-content">
              <div className="rv2-subtabs">
                <button type="button" className={stockView === "SNAPSHOT" ? "active" : ""} onClick={() => setStockView("SNAPSHOT")}>Snapshot Stok</button>
                <button type="button" className={stockView === "LEDGER" ? "active" : ""} onClick={() => setStockView("LEDGER")}>Ledger Movement</button>
              </div>

              {stockView === "SNAPSHOT" ? (
                <>
                  <Section title="Filter Snapshot" desc="Cari bahan, kategori, dan status stok." compact>
                    <div className="rv2-filter-grid rv2-filter-grid--three">
                      <label><span>Cari Item</span><input className="input" value={stockQ} onChange={(e) => setStockQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && loadStockSnapshot()} placeholder="Nama / kode / kategori" /></label>
                      <label><span>Status</span><select className="input" value={stockStatus} onChange={(e) => setStockStatus(e.target.value)}><option value="ALL">Semua</option><option value="OK">OK</option><option value="REORDER">REORDER</option><option value="LOW_STOCK">LOW STOCK</option><option value="OUT_OF_STOCK">OUT OF STOCK</option></select></label>
                      <label><span>&nbsp;</span><button className="btn" type="button" onClick={loadStockSnapshot} disabled={loadingStock}>Terapkan</button></label>
                    </div>
                  </Section>

                  <div className="rv2-kpi-grid">
                    <Kpi label="Scope" value={scopeName} note={`${number(stockSummary.items)} item tampil`} tone="main" />
                    <Kpi label="Total Qty" value={number(stockSummary.qty)} note="Akumulasi semua satuan" />
                    <Kpi label="Reorder" value={number(stockSummary.reorder)} note={`Suggested order ${number(stockSummary.suggested)}`} />
                    <Kpi label="Critical" value={number(stockSummary.low + stockSummary.out)} note={`Low ${number(stockSummary.low)} • Out ${number(stockSummary.out)}`} tone={stockSummary.low + stockSummary.out > 0 ? "danger" : ""} />
                  </div>

                  <Section title="Snapshot Stok Saat Ini" desc="Qty on hand, batas minimum, reorder point, par stock, dan saran order.">
                    <div className="rv2-table-wrap">
                      <table className="rv2-table rv2-table--compact">
                        <thead><tr><th>Kode</th><th>Item</th><th>Kategori</th><th>Source</th><th>Qty</th><th>Unit</th><th>Min</th><th>Reorder</th><th>Par</th><th>Suggested</th><th>Status</th><th>Last Move</th></tr></thead>
                        <tbody>
                          {stockRows.map((row) => {
                            const ing = row.ingredient || {};
                            return (
                              <tr key={`${row.ingredientId}-${row.scope || stockScope}`}>
                                <td><b>{ing.code || "-"}</b></td><td className="rv2-cell-wide">{ing.name || "-"}</td><td>{ing.category || "-"}</td><td><span className="rv2-chip">{ing.isGlobal ? "CENTRAL" : "CART"}</span></td><td><b>{number(row.qty)}</b></td><td>{ing.unit || "-"}</td><td>{number(ing.minStock)}</td><td>{number(ing.reorderPoint)}</td><td>{number(ing.parStock)}</td><td><b>{number(row.suggestedOrderQty)}</b></td><td><span className={getStatusClass(row.stockStatus)}>{getStatusLabel(row.stockStatus)}</span></td><td>{fmtDateTime(row.lastMovementAt)}</td>
                              </tr>
                            );
                          })}
                          {!stockRows.length ? <tr><td colSpan={12}><Empty title="Belum ada stok" desc="Cek inventory aktif, scope, atau filter status." /></td></tr> : null}
                        </tbody>
                      </table>
                    </div>
                  </Section>
                </>
              ) : null}

              {stockView === "LEDGER" ? (
                <>
                  <Section title="Filter Ledger" desc="Audit pergerakan stok berdasarkan item, type, reason, dan tanggal." compact>
                    <div className="rv2-filter-grid">
                      <label><span>Cari Item</span><input className="input" value={ledgerQ} onChange={(e) => setLedgerQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && loadLedger()} placeholder="Nama / kode / kategori" /></label>
                      <label><span>Type</span><input className="input" value={ledgerType} onChange={(e) => setLedgerType(e.target.value.toUpperCase())} placeholder="SALE / TRANSFER" /></label>
                      <label><span>Reason</span><input className="input" value={ledgerReason} onChange={(e) => setLedgerReason(e.target.value.toUpperCase())} placeholder="SHIFT_OPENING" /></label>
                      <label><span>&nbsp;</span><button className="btn" type="button" onClick={loadLedger} disabled={loadingLedger}>Terapkan</button></label>
                    </div>
                  </Section>

                  <div className="rv2-kpi-grid">
                    <Kpi label="Movement" value={number(ledgerSummary.movements)} note={rangeLabel} tone="main" />
                    <Kpi label="Qty Masuk" value={number(ledgerSummary.totalIn)} note={scopeName} />
                    <Kpi label="Qty Keluar" value={number(ledgerSummary.totalOut)} note={scopeName} />
                    <Kpi label="Net" value={number(ledgerSummary.net)} note={`Last ${fmtDateTime(ledgerSummary.lastMovementAt)}`} />
                  </div>

                  <Section
                    title="Stok Awal vs Stok Akhir"
                    desc="Perbandingan stok berdasarkan movement pertama dan terakhir pada periode ledger."
                    right={<span className="rv2-chip">{number(stockOpeningClosingSummary.items)} item</span>}
                  >
                    <div className="rv2-stock-compare-summary">
                      <div>
                        <span>Stok Awal</span>
                        <strong>{number(stockOpeningClosingSummary.opening)}</strong>
                      </div>
                      <div>
                        <span>Masuk</span>
                        <strong>{number(stockOpeningClosingSummary.in)}</strong>
                      </div>
                      <div>
                        <span>Keluar</span>
                        <strong>{number(stockOpeningClosingSummary.out)}</strong>
                      </div>
                      <div>
                        <span>Stok Akhir</span>
                        <strong>{number(stockOpeningClosingSummary.closing)}</strong>
                      </div>
                      <div>
                        <span>Variance</span>
                        <strong>{number(stockOpeningClosingSummary.variance)}</strong>
                      </div>
                    </div>

                    <div className="rv2-table-wrap">
                      <table className="rv2-table rv2-table--compact">
                        <thead>
                          <tr>
                            <th>Kode</th>
                            <th>Item</th>
                            <th>Kategori</th>
                            <th>Awal</th>
                            <th>Masuk</th>
                            <th>Keluar</th>
                            <th>Akhir</th>
                            <th>Variance</th>
                            <th>Usage</th>
                            <th>Unit</th>
                            <th>Movement</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stockOpeningClosing.map((row) => (
                            <tr key={row.ingredientId}>
                              <td><b>{row.code}</b></td>
                              <td className="rv2-cell-wide"><b>{row.name}</b></td>
                              <td>{row.category}</td>
                              <td>{number(row.opening)}</td>
                              <td>{number(row.stockIn)}</td>
                              <td><b>{number(row.stockOut)}</b></td>
                              <td><b>{number(row.closing)}</b></td>
                              <td>
                                <span className={Number(row.variance) < 0 ? "rv2-chip rv2-chip--warn" : "rv2-chip rv2-chip--ok"}>
                                  {number(row.variance)}
                                </span>
                              </td>
                              <td>{percent(row.usageRate)}</td>
                              <td>{row.unit || "-"}</td>
                              <td>{number(row.movementCount)}</td>
                            </tr>
                          ))}

                          {!stockOpeningClosing.length ? (
                            <tr>
                              <td colSpan={11}>
                                <Empty title="Belum ada perbandingan stok" desc="Buka ledger dengan periode yang memiliki movement stok." />
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </Section>

                  <Section title="Stock Ledger" desc="Riwayat stok masuk/keluar. Maksimal mengikuti limit endpoint server.">
                    <div className="rv2-table-wrap">
                      <table className="rv2-table rv2-table--compact">
                        <thead><tr><th>Waktu</th><th>Kode</th><th>Item</th><th>Kategori</th><th>Type</th><th>Reason</th><th>Delta</th><th>Balance</th><th>Ref</th><th>Note</th></tr></thead>
                        <tbody>
                          {ledgerRows.map((row) => (
                            <tr key={row.id}>
                              <td>{fmtDateTime(row.createdAt)}</td><td><b>{row.ingredient?.code || "-"}</b></td><td className="rv2-cell-wide">{row.ingredient?.name || "-"}</td><td>{row.ingredient?.category || "-"}</td><td><span className="rv2-chip">{row.type || "-"}</span></td><td>{row.reason || "-"}</td><td><b>{number(row.delta)}</b></td><td>{number(row.balanceAfter)}</td><td>{row.saleId ? `SALE ${shortId(row.saleId)}` : row.orderId ? `ORDER ${shortId(row.orderId)}` : "-"}</td><td className="rv2-cell-wide">{row.note || "-"}</td>
                            </tr>
                          ))}
                          {!ledgerRows.length ? <tr><td colSpan={10}><Empty title="Belum ada ledger" desc="Tidak ada pergerakan stok pada filter ini." /></td></tr> : null}
                        </tbody>
                      </table>
                    </div>
                  </Section>
                </>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
