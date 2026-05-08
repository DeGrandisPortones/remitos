const API_BASE = import.meta.env.VITE_API_URL || '';

function withEmpresa(url, empresa) {
  if (!empresa) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}empresa=${encodeURIComponent(empresa)}`;
}

async function httpJsonDetailed(url, options) {
  const r = await fetch(url, options);
  const text = await r.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text ? { raw: text } : null;
  }
  return { ok: r.ok, status: r.status, data };
}

async function httpJson(url, options) {
  const { ok, status, data } = await httpJsonDetailed(url, options);
  if (!ok) {
    const msg = data?.error || `HTTP ${status}`;
    throw new Error(msg);
  }
  return data;
}

export async function pingServer(empresa) {
  const base = `${API_BASE}/api/health`;
  const url = withEmpresa(base, empresa);
  return httpJsonDetailed(url);
}

export async function warmupNv(nv, empresa) {
  const base = `${API_BASE}/api/remitos/search-by-nv?nv=${encodeURIComponent(nv)}`;
  const url = withEmpresa(base, empresa);
  const result = await httpJsonDetailed(url);
  const msg = String(result.data?.error || '').toLowerCase();

  return {
    ...result,
    alive: result.ok || (result.status === 404 && msg.includes('no tiene remito')),
  };
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

export function labelPdfUrlForNv({ nv, empresa }) {
  const base = `${API_BASE}/api/etiquetas/by-nv?nv=${encodeURIComponent(nv)}`;
  return withEmpresa(base, empresa);
}

export async function generateLabelPdfForNv({ nv, empresa }) {
  const url = labelPdfUrlForNv({ nv, empresa });
  const r = await fetch(url);

  if (!r.ok) {
    const text = await r.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    const msg = data?.error || `HTTP ${r.status}`;
    throw new Error(msg);
  }

  return r.blob();
}

export function jsonUrlForRemito({ tipo, sucursal, numero, empresa }) {
  const base = `${API_BASE}/api/remitos/${encodeURIComponent(tipo)}/${encodeURIComponent(sucursal)}/${encodeURIComponent(numero)}`;
  return withEmpresa(base, empresa);
}

export async function generateCustomRemitoPdf({ empresa, header, items }) {
  const base = `${API_BASE}/api/remitos/custom/pdf`;
  const url = withEmpresa(base, empresa);
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ header, items }),
  });

  if (!r.ok) {
    const text = await r.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    const msg = data?.error || `HTTP ${r.status}`;
    throw new Error(msg);
  }

  return r.blob();
}
