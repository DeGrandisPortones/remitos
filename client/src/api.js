const API_BASE = import.meta.env.VITE_API_URL || '';

function withEmpresa(url, empresa) {
  if (!empresa) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}empresa=${encodeURIComponent(empresa)}`;
}

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

export async function searchRemitosByNumero(numero, empresa) {
  const base = `${API_BASE}/api/remitos/search?numero=${encodeURIComponent(numero)}`;
  const url = withEmpresa(base, empresa);
  return httpJson(url);
}

export async function searchRemitosByNv(nv, empresa) {
  const base = `${API_BASE}/api/remitos/search-by-nv?nv=${encodeURIComponent(nv)}`;
  const url = withEmpresa(base, empresa);
  return httpJson(url);
}

export function pdfUrlForRemito({ tipo, sucursal, numero, empresa }) {
  const base = `${API_BASE}/api/remitos/${encodeURIComponent(tipo)}/${encodeURIComponent(sucursal)}/${encodeURIComponent(numero)}/pdf`;
  return withEmpresa(base, empresa);
}

export function jsonUrlForRemito({ tipo, sucursal, numero, empresa }) {
  const base = `${API_BASE}/api/remitos/${encodeURIComponent(tipo)}/${encodeURIComponent(sucursal)}/${encodeURIComponent(numero)}`;
  return withEmpresa(base, empresa);
}
