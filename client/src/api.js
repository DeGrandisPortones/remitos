const API_BASE = import.meta.env.VITE_API_URL || '';

async function httpJson(url) {
  const r = await fetch(url);
  const text = await r.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!r.ok) {
    const msg = data?.error || `HTTP ${r.status}`;
    throw new Error(msg);
  }
  return data;
}

export async function searchRemitosByNumero(numero) {
  const url = `${API_BASE}/api/remitos/search?numero=${encodeURIComponent(numero)}`;
  console.log(url);
  return httpJson(url);
}

export async function searchRemitosByNv(nv) {
  const url = `${API_BASE}/api/remitos/search-by-nv?nv=${encodeURIComponent(nv)}`;
  console.log(url);
  return httpJson(url);
}

export function pdfUrlForRemito({ tipo, sucursal, numero }) {
  return `${API_BASE}/api/remitos/${encodeURIComponent(tipo)}/${encodeURIComponent(sucursal)}/${encodeURIComponent(numero)}/pdf`;
}

export function jsonUrlForRemito({ tipo, sucursal, numero }) {
  return `${API_BASE}/api/remitos/${encodeURIComponent(tipo)}/${encodeURIComponent(sucursal)}/${encodeURIComponent(numero)}`;
}
