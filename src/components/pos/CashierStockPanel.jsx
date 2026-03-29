import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost } from "../../api";
import Tabs from "../ui/Tabs";
import Modal from "../ui/Modal";

function digitsOnly(s) {
  return String(s || "").replace(/[^\d]/g, "");
}

function fmtDT(dt) {
  if (!dt) return "-";
  try {
    return new Date(dt).toLocaleString("id-ID");
  } catch {
    return String(dt);
  }
}

function getStockStatusTone(status) {
  const s = String(status || "OK").toUpperCase();
  if (s === "OUT_OF_STOCK") {
    return { borderColor: "rgba(234,47,20,0.28)", background: "rgba(234,47,20,0.12)", color: "#7f1d1d" };
  }
  if (s === "LOW_STOCK") {
    return { borderColor: "rgba(248,82,8,0.28)", background: "rgba(248,82,8,0.12)", color: "#9a3412" };
  }
  if (s === "REORDER") {
    return { borderColor: "rgba(255,176,1,0.34)", background: "rgba(255,176,1,0.16)", color: "#854d0e" };
  }
  return { borderColor: "rgba(34,197,94,0.24)", background: "rgba(34,197,94,0.10)", color: "#166534" };
}

function StatusBadge({ status }) {
  const tone = getStockStatusTone(status);
  return (
    <span
      className="adm-badge"
      style={{
        borderColor: tone.borderColor,
        background: tone.background,
        color: tone.color,
        whiteSpace: "nowrap",
      }}
    >
      {String(status || "OK").replaceAll("_", " ")}
    </span>
  );
}

function summarizeRows(rows = []) {
  const out = {
    totalItems: 0,
    totalQty: 0,
    ok: 0,
    reorder: 0,
    lowStock: 0,
    outOfStock: 0,
  };

  for (const row of rows) {
    out.totalItems += 1;
    out.totalQty += Number(row?.qty || 0);
    const st = String(row?.stockStatus || "OK").toUpperCase();
    if (st === "OUT_OF_STOCK") out.outOfStock += 1;
    else if (st === "LOW_STOCK") out.lowStock += 1;
    else if (st === "REORDER") out.reorder += 1;
    else out.ok += 1;
  }
  return out;
}

export default function CashierStockPanel({ token, meta, shift, cartName }) {
  const [tab, setTab] = useState("UPDATE"); // UPDATE | REQUEST | PENDING | ARRIVED

  const [stockLoading, setStockLoading] = useState(false);
  const [stockErr, setStockErr] = useState("");
  const [items, setItems] = useState([]);
  const [stockSummary, setStockSummary] = useState(summarizeRows([]));

  const [adjOpen, setAdjOpen] = useState(false);
  const [adjBusy, setAdjBusy] = useState(false);
  const adjLockRef = useRef(false);
  const [adjErr, setAdjErr] = useState("");
  const [adjForm, setAdjForm] = useState({ ingredientId: "", mode: "ADD", qty: 1, note: "" });

  const [trBusy, setTrBusy] = useState(false);
  const [trErr, setTrErr] = useState("");
  const [trMsg, setTrMsg] = useState("");
  const [trNote, setTrNote] = useState("");
  const [trRows, setTrRows] = useState([{ ingredientId: "", qty: 1 }]);
  const [pending, setPending] = useState([]);
  const [arrived, setArrived] = useState([]);
  const [showCriticalOnly, setShowCriticalOnly] = useState(false);

  const adminWa = useMemo(() => {
    const raw = meta?.adminWhatsapp || import.meta.env.VITE_ADMIN_WA || "";
    return digitsOnly(raw);
  }, [meta]);

  const cartItems = useMemo(
    () => (items || []).filter((i) => String(i.source || "CART").toUpperCase() !== "CENTRAL"),
    [items]
  );

  const centralItems = useMemo(
    () => (items || []).filter((i) => String(i.source || "CART").toUpperCase() === "CENTRAL"),
    [items]
  );

  const requestableItems = useMemo(() => {
    return [...cartItems].sort((a, b) => {
      const ao = Number(a.displayOrder || 0);
      const bo = Number(b.displayOrder || 0);
      if (ao !== bo) return ao - bo;
      return String(a.name || "").localeCompare(String(b.name || ""), "id");
    });
  }, [cartItems]);

  const criticalItems = useMemo(
    () => requestableItems.filter((i) => i.isLowStock || i.isOutOfStock || String(i.stockStatus).toUpperCase() === "REORDER"),
    [requestableItems]
  );

  const displayItems = useMemo(() => {
    let rows = [...requestableItems];
    if (showCriticalOnly) rows = rows.filter((i) => i.isLowStock || i.isOutOfStock || String(i.stockStatus).toUpperCase() === "REORDER");

    const priority = { OUT_OF_STOCK: 0, LOW_STOCK: 1, REORDER: 2, OK: 3 };
    rows.sort((a, b) => {
      const ap = priority[String(a.stockStatus || "OK").toUpperCase()] ?? 99;
      const bp = priority[String(b.stockStatus || "OK").toUpperCase()] ?? 99;
      if (ap !== bp) return ap - bp;
      const ao = Number(a.displayOrder || 0);
      const bo = Number(b.displayOrder || 0);
      if (ao !== bo) return ao - bo;
      return String(a.name || "").localeCompare(String(b.name || ""), "id");
    });
    return rows;
  }, [requestableItems, showCriticalOnly]);

  const cartSummary = useMemo(() => summarizeRows(cartItems), [cartItems]);
  const centralSummary = useMemo(() => summarizeRows(centralItems), [centralItems]);

  function openAdminWa(message) {
    if (!adminWa) return;
    const url = `https://wa.me/${adminWa}?text=${encodeURIComponent(String(message || ""))}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function loadStock() {
    if (!token) return;
    setStockLoading(true);
    setStockErr("");
    try {
      const r = await apiGet("/api/cashier/inventory/stocks?includeCentral=true", token);
      setItems(r?.stocks || []);
      setStockSummary(r?.summary || summarizeRows(r?.stocks || []));
    } catch (e) {
      setStockErr(e?.message || "Gagal memuat stok");
    } finally {
      setStockLoading(false);
    }
  }

  async function submitAdjust() {
    if (!token) return;
    if (adjLockRef.current) return;
    adjLockRef.current = true;
    setAdjBusy(true);
    setAdjErr("");
    try {
      const ingredientId = String(adjForm.ingredientId || "").trim();
      const qty = Math.round(Number(adjForm.qty || 0));
      if (!shift) throw new Error("Shift belum dibuka");
      if (!ingredientId) throw new Error("Pilih item dulu");
      if (!Number.isFinite(qty) || qty <= 0) throw new Error("Qty harus bilangan bulat > 0");

      const delta = adjForm.mode === "SUB" ? -Math.abs(qty) : Math.abs(qty);
      const res = await apiPost("/api/cashier/inventory/adjust", { ingredientId, delta, note: adjForm.note || "" }, token);

      setAdjOpen(false);
      setAdjForm({ ingredientId: "", mode: "ADD", qty: 1, note: "" });
      setTrMsg(res?.duplicateIgnored ? "Request duplikat diabaikan. Stok tidak dipotong dua kali." : "Stok gerobak berhasil diupdate.");
      await loadStock();
    } catch (e) {
      setAdjErr(e?.message || "Gagal update stok");
    } finally {
      setAdjBusy(false);
      adjLockRef.current = false;
    }
  }

  async function loadRequests(status) {
    if (!token) return;
    setTrBusy(true);
    setTrErr("");
    try {
      const qs = new URLSearchParams();
      if (status) qs.set("status", status);
      const r = await apiGet(`/api/cashier/inventory/transfer-requests?${qs.toString()}`, token);
      const list = r?.items || [];
      if (status === "PENDING") setPending(list);
      if (status === "APPROVED") setArrived(list);
    } catch (e) {
      setTrErr(e?.message || "Gagal load request");
    } finally {
      setTrBusy(false);
    }
  }

  async function submitRequest() {
    if (!token) return;
    setTrBusy(true);
    setTrErr("");
    setTrMsg("");
    try {
      if (!shift) throw new Error("Shift belum dibuka");

      const payload = (trRows || [])
        .map((x) => ({ ingredientId: String(x.ingredientId || "").trim(), qty: Math.round(Number(x.qty || 0)) }))
        .filter((x) => x.ingredientId);

      if (!payload.length) throw new Error("Minimal 1 item request");
      for (const it of payload) {
        if (!Number.isFinite(it.qty) || it.qty <= 0) throw new Error("Qty harus bilangan bulat > 0");
      }

      await apiPost("/api/cashier/inventory/transfer-requests", { note: trNote || "", items: payload }, token);
      setTrMsg("Request stok terkirim. Admin akan approve lalu stok masuk ke gerobak.");
      setTrNote("");
      setTrRows([{ ingredientId: "", qty: 1 }]);
      setTab("PENDING");
      await loadRequests("PENDING");
    } catch (e) {
      setTrErr(e?.message || "Gagal kirim request");
    } finally {
      setTrBusy(false);
    }
  }

  async function cancelRequest(id) {
    if (!token) return;
    const rid = String(id || "").trim();
    if (!rid) return;
    setTrBusy(true);
    setTrErr("");
    try {
      await apiPost(`/api/cashier/inventory/transfer-requests/${rid}/cancel`, { note: "Dibatalkan kasir" }, token);
      await loadRequests("PENDING");
      setTrMsg("Request dibatalkan.");
    } catch (e) {
      setTrErr(e?.message || "Gagal cancel request");
    } finally {
      setTrBusy(false);
    }
  }

  function addRequestRow() {
    setTrRows((prev) => [...prev, { ingredientId: "", qty: 1 }]);
  }

  function fillCriticalRows() {
    if (!criticalItems.length) {
      setTrMsg("Belum ada item kritis yang perlu direquest.");
      return;
    }
    const next = criticalItems.map((it) => ({
      ingredientId: it.id || it.ingredientId || it.itemId,
      qty: Math.max(1, Number(it.suggestedOrderQty || 0)),
    }));
    setTrRows(next);
    setTab("REQUEST");
    setTrMsg("Form request diisi dari item kritis.");
  }

  useEffect(() => {
    loadStock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (tab === "PENDING") loadRequests("PENDING");
    if (tab === "ARRIVED") loadRequests("APPROVED");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (tab !== "UPDATE" && tab !== "REQUEST") return undefined;
    const t = setInterval(() => loadStock(), 7000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, token]);

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Stok Gerobak</div>
          <div className="muted" style={{ fontSize: 12 }}>
            Kasir, admin, dan transfer stok terhubung dalam satu alur inventory.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn secondary btn--sm" type="button" onClick={() => setAdjOpen(true)} disabled={!shift || adjBusy}>
            {adjBusy ? "Menyimpan..." : "Update Stok"}
          </button>
          <button className="btn btn-primary btn--sm" type="button" onClick={loadStock} disabled={stockLoading}>
            {stockLoading ? "Memuat..." : "Refresh"}
          </button>
          <button
            className="btn secondary btn--sm"
            type="button"
            onClick={() =>
              openAdminWa(
                `Halo Admin, saya kasir ${cartName || "gerobak"}. Saya butuh bantuan stok / konfirmasi request.\nTerima kasih.`
              )
            }
            disabled={!adminWa}
            title={!adminWa ? "Set ADMIN_WHATSAPP di backend atau VITE_ADMIN_WA di frontend" : ""}
          >
            WhatsApp Admin
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", marginTop: 14 }}>
        <div className="adm-panel adm-panel--kpi" style={{ margin: 0 }}>
          <div className="adm-panel-head"><h3 className="adm-h3">Cart Items</h3></div>
          <div style={{ fontSize: 26, fontWeight: 900 }}>{cartSummary.totalItems}</div>
          <div className="muted">Qty total: {cartSummary.totalQty}</div>
        </div>
        <div className="adm-panel adm-panel--kpi" style={{ margin: 0 }}>
          <div className="adm-panel-head"><h3 className="adm-h3">Perlu Action</h3></div>
          <div style={{ fontSize: 26, fontWeight: 900 }}>{cartSummary.reorder + cartSummary.lowStock + cartSummary.outOfStock}</div>
          <div className="muted">Reorder {cartSummary.reorder} • Low {cartSummary.lowStock} • Out {cartSummary.outOfStock}</div>
        </div>
        <div className="adm-panel adm-panel--kpi" style={{ margin: 0 }}>
          <div className="adm-panel-head"><h3 className="adm-h3">Shared Central</h3></div>
          <div style={{ fontSize: 26, fontWeight: 900 }}>{centralSummary.totalItems}</div>
          <div className="muted">Kasir bisa lihat stok shared dari central</div>
        </div>
        <div className="adm-panel adm-panel--kpi" style={{ margin: 0 }}>
          <div className="adm-panel-head"><h3 className="adm-h3">System Summary</h3></div>
          <div style={{ fontSize: 26, fontWeight: 900 }}>{stockSummary.totalItems}</div>
          <div className="muted">Semua item aktif yang terbaca oleh kasir</div>
        </div>
      </div>

      {criticalItems.length ? (
        <div className="toast toast--danger" style={{ marginTop: 12 }}>
          Ada <b>{criticalItems.length}</b> item gerobak yang perlu perhatian. Gunakan tombol <b>Isi Item Kritis</b> untuk membuat request cepat.
        </div>
      ) : null}

      <div style={{ marginTop: 12 }}>
        <Tabs
          items={[
            { value: "UPDATE", label: `Update (${displayItems.length})` },
            { value: "REQUEST", label: `Request (${criticalItems.length})` },
            { value: "PENDING", label: `Pending (${pending.length})` },
            { value: "ARRIVED", label: `Arrived (${arrived.length})` },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {stockErr ? <div className="toast toast--danger" style={{ marginTop: 12 }}>{stockErr}</div> : null}
      {trErr ? <div className="toast toast--danger" style={{ marginTop: 12 }}>{trErr}</div> : null}
      {trMsg ? <div className="toast toast--ok" style={{ marginTop: 12 }}>{trMsg}</div> : null}

      {tab === "UPDATE" ? (
        <div style={{ marginTop: 12 }}>
          {!shift ? <div className="toast toast--danger">Shift belum dibuka. Update stok hanya bisa saat shift OPEN.</div> : null}

          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={showCriticalOnly} onChange={(e) => setShowCriticalOnly(e.target.checked)} />
              <span>Tampilkan item kritis saja</span>
            </label>

            <div className="muted">Gerobak: {cartName || "-"}</div>
          </div>

          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th style={{ width: 90 }}>Qty</th>
                  <th style={{ width: 90 }}>Unit</th>
                  <th style={{ width: 90 }}>Min</th>
                  <th style={{ width: 90 }}>Reorder</th>
                  <th style={{ width: 110 }}>Suggested</th>
                  <th style={{ minWidth: 130 }}>Status</th>
                  <th style={{ minWidth: 150 }}>Catatan</th>
                  <th style={{ width: 120 }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {displayItems.map((it) => (
                  <tr key={it.id || it.itemId || it.ingredientId}>
                    <td>
                      <div style={{ fontWeight: 800 }}>{it.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {it.code || "-"} • {it.category || "RAW"}
                      </div>
                    </td>
                    <td><b>{Number(it.qty || 0)}</b></td>
                    <td className="muted">{it.unit}</td>
                    <td>{Number(it.minStock || 0)}</td>
                    <td>{Number(it.reorderPoint || 0)}</td>
                    <td>{Number(it.suggestedOrderQty || 0)}</td>
                    <td><StatusBadge status={it.stockStatus} /></td>
                    <td className="muted">{it.notes || "-"}</td>
                    <td>
                      <button
                        className="btn secondary btn--sm"
                        type="button"
                        onClick={() => {
                          setAdjForm((p) => ({ ...p, ingredientId: it.id || it.ingredientId || it.itemId }));
                          setAdjOpen(true);
                        }}
                        disabled={!shift || adjBusy}
                      >
                        {adjBusy ? "Menyimpan..." : "Adjust"}
                      </button>
                    </td>
                  </tr>
                ))}
                {!displayItems.length ? (
                  <tr><td colSpan={9} className="muted">Belum ada stok gerobak.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "REQUEST" ? (
        <div style={{ marginTop: 12 }}>
          {!shift ? <div className="toast toast--danger">Shift belum dibuka. Request stok hanya bisa saat shift OPEN.</div> : null}

          <div className="card" style={{ padding: 12, marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700 }}>Form Request Stok</div>
                <div className="muted" style={{ fontSize: 12 }}>Gunakan suggested qty agar admin langsung melihat kebutuhan gerobak.</div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn secondary btn--sm" type="button" onClick={fillCriticalRows}>Isi Item Kritis</button>
                <button className="btn secondary btn--sm" type="button" onClick={() => setTrRows([{ ingredientId: "", qty: 1 }])}>Reset</button>
              </div>
            </div>

            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
              {(trRows || []).map((r, idx) => {
                const selected = requestableItems.find((i) => String(i.id || i.itemId || i.ingredientId) === String(r.ingredientId));
                return (
                  <div key={idx} style={{ display: "grid", gridTemplateColumns: "1.2fr 120px 1fr 90px", gap: 10 }}>
                    <select
                      className="input"
                      value={r.ingredientId}
                      onChange={(e) => {
                        const v = e.target.value;
                        setTrRows((prev) => prev.map((x, i) => (i === idx ? { ...x, ingredientId: v } : x)));
                      }}
                    >
                      <option value="">Pilih item</option>
                      {requestableItems.map((i) => (
                        <option key={i.id || i.itemId || i.ingredientId} value={i.id || i.itemId || i.ingredientId}>
                          {i.name} ({i.unit})
                        </option>
                      ))}
                    </select>

                    <input
                      className="input"
                      type="number"
                      min={1}
                      value={r.qty}
                      onChange={(e) => {
                        const v = e.target.value;
                        setTrRows((prev) => prev.map((x, i) => (i === idx ? { ...x, qty: v } : x)));
                      }}
                    />

                    <div className="muted" style={{ fontSize: 12, alignSelf: "center" }}>
                      {selected ? `Now ${Number(selected.qty || 0)} • Suggested ${Number(selected.suggestedOrderQty || 0)} • ${String(selected.stockStatus || "OK").replaceAll("_", " ")}` : "Pilih item"}
                    </div>

                    <button
                      className="btn danger btn--sm"
                      type="button"
                      onClick={() => setTrRows((prev) => prev.filter((_, i) => i !== idx))}
                      disabled={trRows.length <= 1}
                      title={trRows.length <= 1 ? "Minimal 1 baris" : ""}
                    >
                      Hapus
                    </button>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
              <button className="btn secondary btn--sm" type="button" onClick={addRequestRow}>+ Tambah Baris</button>
              <input
                className="input"
                placeholder="Catatan request (opsional)"
                value={trNote}
                onChange={(e) => setTrNote(e.target.value)}
                style={{ minWidth: 260 }}
              />
              <button className="btn btn-primary btn--sm" type="button" onClick={submitRequest} disabled={trBusy || !shift}>
                {trBusy ? "Mengirim..." : "Kirim Request"}
              </button>
              <button
                className="btn secondary btn--sm"
                type="button"
                onClick={() =>
                  openAdminWa(
                    `Halo Admin, saya kasir ${cartName || "gerobak"}.\nSaya baru saja membuat request stok (shift berjalan).\nMohon dicek di panel admin.\nTerima kasih.`
                  )
                }
                disabled={!adminWa}
              >
                WA Admin
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "PENDING" ? (
        <div style={{ marginTop: 12 }}>
          {trBusy ? <div className="muted">Loading...</div> : null}
          {!trBusy && pending.length === 0 ? <div className="muted">Tidak ada request pending.</div> : null}

          <div style={{ display: "grid", gap: 10 }}>
            {pending.map((r) => (
              <div key={r.id} className="card" style={{ padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>Request #{String(r.id).slice(0, 8)} • {r.status}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{fmtDT(r.requestedAt)}</div>
                    {r.note ? <div className="muted" style={{ marginTop: 6 }}>{r.note}</div> : null}
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn danger btn--sm" type="button" onClick={() => cancelRequest(r.id)} disabled={trBusy}>Cancel</button>
                    <button
                      className="btn secondary btn--sm"
                      type="button"
                      onClick={() =>
                        openAdminWa(
                          `Halo Admin, saya kasir ${cartName || "gerobak"}.\nRequest pending: ${r.id}\nMohon di-approve jika sudah siap.\nTerima kasih.`
                        )
                      }
                      disabled={!adminWa}
                    >
                      WA Admin
                    </button>
                  </div>
                </div>

                <div className="hr" style={{ margin: "10px 0" }} />
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {(r.items || []).map((it) => (
                    <li key={it.ingredientId}>{it.name} — <b>{Number(it.qty || 0)}</b> {it.unit}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "ARRIVED" ? (
        <div style={{ marginTop: 12 }}>
          {trBusy ? <div className="muted">Loading...</div> : null}
          {!trBusy && arrived.length === 0 ? <div className="muted">Belum ada request yang approved.</div> : null}

          <div style={{ display: "grid", gap: 10 }}>
            {arrived.map((r) => (
              <div key={r.id} className="card" style={{ padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>Approved #{String(r.id).slice(0, 8)} • {r.status}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      Requested: {fmtDT(r.requestedAt)}{r.decidedAt ? ` • Approved: ${fmtDT(r.decidedAt)}` : ""}
                    </div>
                    {r.decisionNote ? <div className="muted" style={{ marginTop: 6 }}>Note: {r.decisionNote}</div> : null}
                  </div>

                  <button className="btn btn-primary btn--sm" type="button" onClick={loadStock} disabled={stockLoading}>
                    Refresh Stok
                  </button>
                </div>

                <div className="hr" style={{ margin: "10px 0" }} />
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {(r.items || []).map((it) => (
                    <li key={it.ingredientId}>{it.name} — <b>{Number(it.qty || 0)}</b> {it.unit}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <Modal
        open={adjOpen}
        onClose={() => { setAdjOpen(false); setAdjErr(""); }}
        title="Update Stok (Tambah / Kurang)"
        footer={
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button className="btn secondary" type="button" onClick={() => setAdjOpen(false)} disabled={adjBusy}>Batal</button>
            <button className="btn" type="button" onClick={submitAdjust} disabled={adjBusy || !shift}>
              {adjBusy ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        }
      >
        {adjErr ? <div className="toast toast--danger" style={{ marginBottom: 10 }}>{adjErr}</div> : null}

        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <label>Item</label>
            <select className="input" value={adjForm.ingredientId} onChange={(e) => setAdjForm((p) => ({ ...p, ingredientId: e.target.value }))}>
              <option value="">Pilih item</option>
              {requestableItems.map((i) => (
                <option key={i.id || i.itemId || i.ingredientId} value={i.id || i.itemId || i.ingredientId}>
                  {i.name} ({i.unit})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label>Mode</label>
              <select className="input" value={adjForm.mode} onChange={(e) => setAdjForm((p) => ({ ...p, mode: e.target.value }))}>
                <option value="ADD">Tambah</option>
                <option value="SUB">Kurangi</option>
              </select>
            </div>
            <div>
              <label>Qty</label>
              <input className="input" type="number" min={1} value={adjForm.qty} onChange={(e) => setAdjForm((p) => ({ ...p, qty: e.target.value }))} />
            </div>
          </div>

          <div>
            <label>Catatan (opsional)</label>
            <input
              className="input"
              value={adjForm.note}
              onChange={(e) => setAdjForm((p) => ({ ...p, note: e.target.value }))}
              placeholder="misal: stok rusak / salah input / tambah stok fisik"
            />
          </div>

          {!shift ? <div className="toast toast--danger">Shift belum dibuka. Tidak bisa update stok.</div> : null}
        </div>
      </Modal>
    </div>
  );
}