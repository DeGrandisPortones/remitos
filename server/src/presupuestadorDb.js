import pkg from 'pg';
const { Pool } = pkg;

let _pool = null;

function getPool() {
  if (_pool) return _pool;
  const url = process.env.SUPABASE_DATABASE_URL;
  if (!url) return null;
  const ssl = (process.env.SUPABASE_SSL ?? 'false').toLowerCase() !== 'false'
    ? { rejectUnauthorized: false }
    : false;
  _pool = new Pool({ connectionString: url, ssl, max: 5, idleTimeoutMillis: 30000 });
  return _pool;
}

async function query(text, params = []) {
  const pool = getPool();
  if (!pool) throw new Error('SUPABASE_DATABASE_URL no configurado');
  const res = await pool.query(text, params);
  return res.rows;
}

// ─── Helpers de extracción desde nv_lines ────────────────────────────────────

function normLine(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function extractMotorCondicion(lines) {
  const auto = lines.find(l =>
    normLine(l.raw_name).includes('accionador automatico') ||
    normLine(l.name).includes('automatiz')
  );
  if (auto) return 'AUTOMATICO';
  const manual = lines.find(l => normLine(l.name) === 'manual' || normLine(l.raw_name).includes('sin accionador'));
  if (manual) return 'MANUAL';
  return 'NO';
}

function extractMotorPosicion(lines) {
  const line = lines.find(l =>
    normLine(l.raw_name).includes('accionador') &&
    (normLine(l.raw_name).includes('izquierda') || normLine(l.raw_name).includes('derecha'))
  );
  if (!line) return 'NO';
  if (normLine(line.raw_name).includes('izquierda')) return 'IZQUIERDA';
  return 'DERECHA';
}

function extractPuertaPosicion(lines) {
  const line = lines.find(l =>
    normLine(l.raw_name).includes('puerta') &&
    (normLine(l.raw_name).includes('derecha') || normLine(l.raw_name).includes('izquierda'))
  );
  if (!line) return 'NO';
  if (normLine(line.raw_name).includes('derecha')) return 'DERECHA';
  if (normLine(line.raw_name).includes('izquierda')) return 'IZQUIERDA';
  return 'NO';
}

function extractLucera(lines) {
  const line = lines.find(l => normLine(l.raw_name).includes('lucera') || normLine(l.name).includes('lucera'));
  if (!line) return 'NO';
  if (normLine(line.raw_name).includes('sin lucera') || normLine(line.name).includes('sin')) return 'NO';
  return 'SI';
}

function extractColorSistema(lines) {
  const line = lines.find(l => normLine(l.raw_name).includes('marco y bastidor'));
  if (!line) return 'NO';
  return String(line.name || '').replace(/^Sistema\s*/i, '').trim() || 'NO';
}

function extractColorHoja(lines) {
  const line = lines.find(l =>
    normLine(l.raw_name).includes('revestimiento en lamas') ||
    normLine(l.raw_name).includes('revestimiento color')
  );
  if (!line) return 'NO';
  return String(line.name || '').trim() || 'NO';
}

function extractListon(lines) {
  const line = lines.find(l =>
    normLine(l.raw_name).includes('inserto') ||
    normLine(l.name).toLowerCase().startsWith('list')
  );
  if (!line) return 'NO';
  return String(line.name || '').replace(/^List[oó]n\s*/i, '').trim() || 'NO';
}

function extractTipoEmbalaje(lines) {
  const line = lines.find(l =>
    normLine(l.raw_name).includes('embalaje') ||
    normLine(l.name).includes('embalaj')
  );
  if (line) return String(line.name || '').trim() || 'NO';
  const inst = lines.find(l => normLine(l.name).includes('con instalacion'));
  return inst ? 'CON INSTALACION' : 'NO';
}

function extractRazSoc(note) {
  const s = String(note || '').trim();
  const m = s.match(/Vendedor:\s*(.+)/i);
  return m ? m[1].trim() : '';
}

// ─── Construye un row compatible con toPortonPreProduccionLabel ───────────────

export function buildFakePreProduccionRow(preproData) {
  const lines = Array.isArray(preproData.nv_lines) ? preproData.nv_lines : [];
  const dims = preproData.data?.dimensions || {};

  // dimensions en mm: si es < 100 está en metros, si >= 100 ya está en mm
  const anchoRaw = dims.hoja_ancho_mm ?? (dims.hoja_ancho_m != null ? dims.hoja_ancho_m : null);
  const altoRaw  = dims.hoja_alto_mm  ?? (dims.hoja_alto_m  != null ? dims.hoja_alto_m  : null);

  return {
    Nombre:         preproData.nombre    || '',
    Direccion:      preproData.direccion || '',
    RazSoc:         extractRazSoc(preproData.note),
    Fecha_NV:       preproData.fecha_nv  || '',
    Ancho:          anchoRaw,
    Alto:           altoRaw,
    Color_Sistema:  extractColorSistema(lines),
    Color_Hoja:     extractColorHoja(lines),
    Liston:         extractListon(lines),
    PUERTA_Posicion: extractPuertaPosicion(lines),
    Lucera:         extractLucera(lines),
    MOTOR_Condicion: extractMotorCondicion(lines),
    MOTOR_Posicion: extractMotorPosicion(lines),
    Tipo_Embalaje:  extractTipoEmbalaje(lines),
  };
}

// ─── Query principal ──────────────────────────────────────────────────────────

/**
 * Busca en preproduccion_valores (Supabase) por NV.
 * Hace JOIN con presupuestador_quotes para obtener datos de cliente.
 * Retorna null si no se encuentra nada.
 */
export async function fetchPreproduccionByNv(nv) {
  const nvInt = Math.trunc(Number(nv));
  if (!Number.isFinite(nvInt) || nvInt <= 0) return null;

  try {
    const rows = await query(
      `SELECT
         pv.nv,
         pv.nv_tipo,
         pv.nv_lines,
         pv.data,
         pv.updated_at,
         q.end_customer->>'name'     AS nombre,
         q.end_customer->>'address'  AS direccion,
         q.end_customer->>'locality' AS localidad,
         q.end_customer->>'province' AS provincia,
         q.note
       FROM public.preproduccion_valores pv
       LEFT JOIN public.presupuestador_quotes q
         ON q.odoo_sale_order_name = 'NV' || pv.nv::text
       WHERE pv.nv = $1
       LIMIT 1`,
      [nvInt]
    );

    if (!rows.length) return null;
    const row = rows[0];

    // fecha_nv desde data o fallback a updated_at
    const fechaNv = row.data?.fecha_envio_produccion
      || row.data?.Fecha_NV
      || row.updated_at
      || null;

    return {
      nv:        row.nv,
      nv_tipo:   row.nv_tipo,
      nv_lines:  Array.isArray(row.nv_lines) ? row.nv_lines : [],
      data:      row.data || {},
      nombre:    String(row.nombre    || '').trim(),
      direccion: String(row.direccion || '').trim(),
      localidad: String(row.localidad || '').trim(),
      provincia: String(row.provincia || '').trim(),
      note:      String(row.note      || '').trim(),
      fecha_nv:  fechaNv,
    };
  } catch (err) {
    console.warn('[presupuestadorDb] fetchPreproduccionByNv error:', err?.message || err);
    return null;
  }
}
