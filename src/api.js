const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

const inflightGetMap = new Map();
const getCacheMap = new Map();

const DEFAULT_GET_TTL = {
  "/api/meta": 5000,
  "/api/admin/carts": 10000,
};

async function parseBody(res) {
  const text = await res.text().catch(() => "");
  if (!text) return { data: {}, raw: "" };
  try {
    return { data: JSON.parse(text), raw: text };
  } catch {
    return { data: {}, raw: text };
  }
}

function getKey(path, token) {
  return `${token || ""}::${path}`;
}

function getCached(path, token, ttlMs) {
  if (!ttlMs || ttlMs <= 0) return null;
  const key = getKey(path, token);
  const hit = getCacheMap.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expireAt) {
    getCacheMap.delete(key);
    return null;
  }
  return hit.value;
}

function setCached(path, token, ttlMs, value) {
  if (!ttlMs || ttlMs <= 0) return value;
  const key = getKey(path, token);
  getCacheMap.set(key, {
    value,
    expireAt: Date.now() + ttlMs,
  });
  return value;
}

export async function apiGet(path, token, options = {}) {
  const ttlMs = Number(options?.ttlMs ?? DEFAULT_GET_TTL[path] ?? 0);

  if (!options?.force) {
    const cached = getCached(path, token, ttlMs);
    if (cached) return cached;
  }

  const key = getKey(path, token);
  if (inflightGetMap.has(key)) {
    return inflightGetMap.get(key);
  }

  const req = fetch(API_BASE + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then(async (res) => {
      const { data, raw } = await parseBody(res);
      if (!res.ok) throw new Error(data.error || raw || `HTTP ${res.status}`);
      return setCached(path, token, ttlMs, data);
    })
    .finally(() => {
      inflightGetMap.delete(key);
    });

  inflightGetMap.set(key, req);
  return req;
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
  try {
    data = text ? JSON.parse(text) : {};
  } catch {}

  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

export async function apiDelete(path, token) {
  const res = await fetch(API_BASE + path, {
    method: "DELETE",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const { data, raw } = await parseBody(res);
  if (!res.ok) throw new Error(data.error || raw || `HTTP ${res.status}`);
  return data;
}