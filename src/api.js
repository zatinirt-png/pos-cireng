const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

async function parseBody(res) {
  const text = await res.text().catch(() => "");
  if (!text) return { data: {}, raw: "" };
  try {
    return { data: JSON.parse(text), raw: text };
  } catch {
    return { data: {}, raw: text }; // bisa HTML: "Cannot GET ..."
  }
}

export async function apiGet(path, token) {
  const res = await fetch(API_BASE + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const { data, raw } = await parseBody(res);
  if (!res.ok) throw new Error(data.error || raw || `HTTP ${res.status}`);
  return data;
}

export async function apiPost(path, body, token) {
  const res = await fetch(API_BASE + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body || {}),
  });
  const { data, raw } = await parseBody(res);
  if (!res.ok) throw new Error(data.error || raw || `HTTP ${res.status}`);
  return data;
}

export async function apiPatch(path, body, token) {
  const res = await fetch(API_BASE + path, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body || {}),
  });
  const { data, raw } = await parseBody(res);
  if (!res.ok) throw new Error(data.error || raw || `HTTP ${res.status}`);
  return data;
}

export async function apiPut(path, body, token) {
  const r = await fetch(API_BASE + path, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: JSON.stringify(body || {}),
  });

  const text = await r.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}

  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}
