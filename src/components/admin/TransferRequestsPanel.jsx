import React, { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../../api";

function fmtDT(dt) {
  if (!dt) return "-";
  try { return new Date(dt).toLocaleString("id-ID"); } catch { return String(dt); }
}

export default function TransferRequestsPanel({ token, carts = [] }) {
  const [status, setStatus] = useState("PENDING"); // PENDING | APPROVED | REJECTED | CANCELLED | ALL
  const [cartId, setCartId] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [items, setItems] = useState([]);

  const statusQuery = useMemo(() => (status === "ALL" ? "" : status), [status]);

  async function load() {
    if (!token) return;
    setLoading(true);
    setErr("");
    setMsg("");
    try {
      const qs = new URLSearchParams();
      if (statusQuery) qs.set("status", statusQuery);
      if (cartId) qs.set("cartId", cartId);
      qs.set("take", "200");

      const r = await apiGet(`/api/admin/inventory/transfer-requests?${qs.toString()}`, token);
      setItems(r?.items || []);
    } catch (e) {
      setErr(e?.message || "Gagal load transfer requests");
    } finally {
      setLoading(false);
    }
  }

  async function approve(id) {
    const note = window.prompt("Catatan approve (opsional):", "") || "";
    try {
      setLoading(true);
      await apiPost(`/api/admin/inventory/transfer-requests/${id}/approve`, { note }, token);
      setMsg("Approved. Stok sudah dipindahkan CENTRAL → Gerobak.");
      await load();
    } catch (e) {
      setErr(e?.message || "Gagal approve");
    } finally {
      setLoading(false);
    }
  }

  async function reject(id) {
    const note = window.prompt("Alasan reject:", "Ditolak") || "Ditolak";
    try {
      setLoading(true);
      await apiPost(`/api/admin/inventory/transfer-requests/${id}/reject`, { note }, token);
      setMsg("Rejected.");
      await load();
    } catch (e) {
      setErr(e?.message || "Gagal reject");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status, cartId]);

  return (
    <div className="adm-panel" style={{ marginTop: 14 }}>
      <section className="adm-panel">
        <div className="adm-panel-head">
          <h3 className="adm-h3">Transfer Requests</h3>
          <span className="muted">Approve request stok dari kasir (CENTRAL → Gerobak)</span>
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <div className="col" style={{ minWidth: 220 }}>
            <label>Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="PENDING">PENDING</option>
              <option value="APPROVED">APPROVED</option>
              <option value="REJECTED">REJECTED</option>
              <option value="CANCELLED">CANCELLED</option>
              <option value="ALL">ALL</option>
            </select>
          </div>

          <div className="col" style={{ minWidth: 260 }}>
            <label>Gerobak</label>
            <select className="input" value={cartId} onChange={(e) => setCartId(e.target.value)}>
              <option value="">Semua Gerobak</option>
              {(carts || []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="col" style={{ minWidth: 160, display: "flex", alignItems: "end", gap: 10 }}>
            <button className="btn secondary" type="button" onClick={load} disabled={loading}>
              Refresh
            </button>
          </div>
        </div>

        {loading ? <div className="adm-alert" style={{ marginTop: 12 }}>Loading...</div> : null}
        {err ? <div className="adm-alert" style={{ marginTop: 12 }}>{err}</div> : null}
        {msg ? <div className="adm-alert adm-alert--ok" style={{ marginTop: 12 }}>{msg}</div> : null}
      </section>

      <section className="adm-panel" style={{ marginTop: 14 }}>
        <div className="adm-panel-head">
          <h3 className="adm-h3">Daftar Request</h3>
          <span className="muted">{items.length} request</span>
        </div>

        {!loading && items.length === 0 ? <div className="muted">Belum ada request.</div> : null}

        <div style={{ display: "grid", gap: 10 }}>
          {items.map((r) => (
            <div key={r.id} className="card" style={{ padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
                <div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 800 }}>Request • {String(r.id).slice(0, 8)}</div>
                    <span className={r.status === "PENDING" ? "adm-badge adm-badge--cash" : r.status === "APPROVED" ? "adm-badge adm-badge--qris" : "adm-badge"}>
                      {r.status}
                    </span>
                    {r.cartName ? <span className="muted">• {r.cartName}</span> : null}
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    Requested: {fmtDT(r.requestedAt)}{r.decidedAt ? ` • Decided: ${fmtDT(r.decidedAt)}` : ""}
                  </div>
                  {r.note ? <div className="muted" style={{ marginTop: 6 }}>{r.note}</div> : null}
                  {r.decisionNote ? <div className="muted" style={{ marginTop: 6 }}>Decision: {r.decisionNote}</div> : null}
                </div>

                {r.status === "PENDING" ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn btn--sm" type="button" onClick={() => approve(r.id)} disabled={loading}>
                      Approve
                    </button>
                    <button className="btn danger btn--sm" type="button" onClick={() => reject(r.id)} disabled={loading}>
                      Reject
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="hr" style={{ margin: "10px 0" }} />

              <div className="adm-table-wrap">
                <table className="table adm-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th style={{ width: 120 }}>Qty</th>
                      <th style={{ width: 120 }}>Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(r.items || []).map((it) => (
                      <tr key={it.ingredientId}>
                        <td>{it.name}</td>
                        <td><b>{Number(it.qty || 0)}</b></td>
                        <td>{it.unit}</td>
                      </tr>
                    ))}
                    {(!r.items || r.items.length === 0) ? (
                      <tr><td colSpan={3} className="muted">Tidak ada item</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}