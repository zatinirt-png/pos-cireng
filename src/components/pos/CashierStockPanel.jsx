import React, { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../../api";
import Tabs from "../ui/Tabs";
import Modal from "../ui/Modal";

function digitsOnly(s) {
  return String(s || "").replace(/[^\d]/g, "");
}

export default function CashierStockPanel({ token, meta, shift, cartName }) {
  const [tab, setTab] = useState("UPDATE"); // UPDATE | REQUEST | PENDING | ARRIVED

  const [stockLoading, setStockLoading] = useState(false);
  const [stockErr, setStockErr] = useState("");
  const [items, setItems] = useState([]);

  // Adjust modal
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjBusy, setAdjBusy] = useState(false);
  const [adjErr, setAdjErr] = useState("");
  const [adjForm, setAdjForm] = useState({ ingredientId: "", mode: "ADD", qty: 1, note: "" });

  // Transfer request
  const [trBusy, setTrBusy] = useState(false);
  const [trErr, setTrErr] = useState("");
  const [trMsg, setTrMsg] = useState("");
  const [trNote, setTrNote] = useState("");
  const [trRows, setTrRows] = useState([{ ingredientId: "", qty: 1 }]);
  const [pending, setPending] = useState([]);
  const [arrived, setArrived] = useState([]);

  const ingredientsCart = useMemo(() => {
    const all = meta?.ingredients || [];
    return all.filter((i) => i && i.isGlobal === false);
  }, [meta]);

  const adminWa = useMemo(() => {
    const raw = meta?.adminWhatsapp || import.meta.env.VITE_ADMIN_WA || "";
    return digitsOnly(raw);
  }, [meta]);

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
      const r = await apiGet("/api/cashier/stock", token);
      setItems(r?.items || []);
    } catch (e) {
      setStockErr(e?.message || "Gagal memuat stok");
    } finally {
      setStockLoading(false);
    }
  }

  async function submitAdjust() {
    if (!token) return;
    setAdjBusy(true);
    setAdjErr("");
    try {
      const ingredientId = String(adjForm.ingredientId || "").trim();
      const qty = Math.round(Number(adjForm.qty || 0));
      if (!shift) throw new Error("Shift belum dibuka");
      if (!ingredientId) throw new Error("Pilih item dulu");
      if (!Number.isFinite(qty) || qty <= 0) throw new Error("Qty harus bilangan bulat > 0");

      const delta = adjForm.mode === "SUB" ? -Math.abs(qty) : Math.abs(qty);

      await apiPost(
        "/api/cashier/inventory/adjust",
        { ingredientId, delta, note: adjForm.note || "" },
        token
      );

      setAdjOpen(false);
      setAdjForm({ ingredientId: "", mode: "ADD", qty: 1, note: "" });
      await loadStock();
    } catch (e) {
      setAdjErr(e?.message || "Gagal update stok");
    } finally {
      setAdjBusy(false);
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
        .map((x) => ({
          ingredientId: String(x.ingredientId || "").trim(),
          qty: Math.round(Number(x.qty || 0)),
        }))
        .filter((x) => x.ingredientId);

      if (!payload.length) throw new Error("Minimal 1 item request");
      for (const it of payload) {
        if (!Number.isFinite(it.qty) || it.qty <= 0) throw new Error("Qty harus bilangan bulat > 0");
      }

      await apiPost("/api/cashier/inventory/transfer-requests", { note: trNote || "", items: payload }, token);

      setTrMsg("Request terkirim. Admin akan approve lalu stok masuk ke gerobak.");
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
    } catch (e) {
      setTrErr(e?.message || "Gagal cancel request");
    } finally {
      setTrBusy(false);
    }
  }

  // polling stok hanya saat tab UPDATE
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
    if (tab !== "UPDATE") return;
    const t = setInterval(() => loadStock(), 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, token]);

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Stok Gerobak</div>
          <div className="muted" style={{ fontSize: 12 }}>
            Update / Request / Pending / Arrived
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn secondary btn--sm" type="button" onClick={() => setAdjOpen(true)} disabled={!shift}>
            Update Stok
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

      <div style={{ marginTop: 12 }}>
        <Tabs
          items={[
            { value: "UPDATE", label: "Update" },
            { value: "REQUEST", label: "Request" },
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

      {/* UPDATE TAB */}
      {tab === "UPDATE" ? (
        <div style={{ marginTop: 12 }}>
          {!shift ? (
            <div className="toast toast--danger">Shift belum dibuka. Update stok hanya bisa saat shift OPEN.</div>
          ) : null}

          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th style={{ width: 120 }}>Qty</th>
                  <th style={{ width: 120 }}>Unit</th>
                  <th style={{ width: 140 }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {(items || []).map((it) => (
                  <tr key={it.itemId}>
                    <td><b>{it.name}</b></td>
                    <td><b>{Number(it.qty || 0)}</b></td>
                    <td className="muted">{it.unit}</td>
                    <td>
                      <button
                        className="btn secondary btn--sm"
                        type="button"
                        onClick={() => {
                          setAdjForm((p) => ({ ...p, ingredientId: it.itemId }));
                          setAdjOpen(true);
                        }}
                        disabled={!shift}
                      >
                        Adjust
                      </button>
                    </td>
                  </tr>
                ))}
                {(!items || items.length === 0) ? (
                  <tr><td colSpan={4} className="muted">Belum ada stok.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* REQUEST TAB */}
      {tab === "REQUEST" ? (
        <div style={{ marginTop: 12 }}>
          {!shift ? (
            <div className="toast toast--danger">Shift belum dibuka. Request stok hanya bisa saat shift OPEN.</div>
          ) : null}

          <div className="card" style={{ padding: 12, marginTop: 10 }}>
            <div style={{ fontWeight: 700 }}>Form Request Stok (Shift Berjalan)</div>

            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
              {(trRows || []).map((r, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 120px 90px", gap: 10 }}>
                  <select
                    className="input"
                    value={r.ingredientId}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTrRows((prev) => prev.map((x, i) => (i === idx ? { ...x, ingredientId: v } : x)));
                    }}
                  >
                    <option value="">Pilih item</option>
                    {ingredientsCart.map((i) => (
                      <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
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
              ))}
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
              <button className="btn secondary btn--sm" type="button" onClick={() => setTrRows((p) => [...p, { ingredientId: "", qty: 1 }])}>
                + Tambah Baris
              </button>

              <input
                className="input"
                placeholder="Catatan (opsional)"
                value={trNote}
                onChange={(e) => setTrNote(e.target.value)}
                style={{ minWidth: 240 }}
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
                WA Admin (Info Request)
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* PENDING TAB */}
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
                    <div className="muted" style={{ fontSize: 12 }}>
                      {r.requestedAt ? new Date(r.requestedAt).toLocaleString("id-ID") : "-"}
                    </div>
                    {r.note ? <div className="muted" style={{ marginTop: 6 }}>{r.note}</div> : null}
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn danger btn--sm" type="button" onClick={() => cancelRequest(r.id)} disabled={trBusy}>
                      Cancel
                    </button>
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
                    <li key={it.ingredientId}>
                      {it.name} — <b>{Number(it.qty || 0)}</b> {it.unit}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ARRIVED TAB */}
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
                      Requested: {r.requestedAt ? new Date(r.requestedAt).toLocaleString("id-ID") : "-"}
                      {r.decidedAt ? ` • Approved: ${new Date(r.decidedAt).toLocaleString("id-ID")}` : ""}
                    </div>
                    {r.decisionNote ? <div className="muted" style={{ marginTop: 6 }}>Note: {r.decisionNote}</div> : null}
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn btn-primary btn--sm" type="button" onClick={loadStock} disabled={stockLoading}>
                      Refresh Stok
                    </button>
                  </div>
                </div>

                <div className="hr" style={{ margin: "10px 0" }} />

                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {(r.items || []).map((it) => (
                    <li key={it.ingredientId}>
                      {it.name} — <b>{Number(it.qty || 0)}</b> {it.unit}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* MODAL: ADJUST */}
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
            <select
              className="input"
              value={adjForm.ingredientId}
              onChange={(e) => setAdjForm((p) => ({ ...p, ingredientId: e.target.value }))}
            >
              <option value="">Pilih item</option>
              {ingredientsCart.map((i) => (
                <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label>Mode</label>
              <select
                className="input"
                value={adjForm.mode}
                onChange={(e) => setAdjForm((p) => ({ ...p, mode: e.target.value }))}
              >
                <option value="ADD">Tambah</option>
                <option value="SUB">Kurangi</option>
              </select>
            </div>

            <div>
              <label>Qty</label>
              <input
                className="input"
                type="number"
                min={1}
                value={adjForm.qty}
                onChange={(e) => setAdjForm((p) => ({ ...p, qty: e.target.value }))}
              />
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