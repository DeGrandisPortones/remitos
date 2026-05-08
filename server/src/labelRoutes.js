import { Router } from 'express';
import { getPool, sql } from './db.js';
import { buildPortonLabelsPdf } from './labelPdf.js';

const router = Router();

function parseIntSafe(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function clean(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

function normalizeKey(k) {
  return String(k || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function pick(row, names) {
  if (!row) return '';
  const lookup = new Map();
  for (const [k, v] of Object.entries(row)) {
    lookup.set(normalizeKey(k), v);
  }

  for (const name of names) {
    const val = lookup.get(normalizeKey(name));
    if (val !== null && val !== undefined && clean(val) !== '') return val;
  }
  return '';
}

function firstNonEmpty(...values) {
  return values.find((v) => clean(v) !== '') ?? '';
}

function resolveEmpresa(req, forcedEmpresa) {
  const raw = clean(forcedEmpresa || req.query.empresa || req.query.company || req.headers['x-empresa'] || req.headers['x-company']).toLowerCase();
  if (['ipanel', 'ipanels', 'paneles', 'panel'].includes(raw)) return 'ipanel';
  return 'portones';
}

function joinParts(parts, sep = ' ') {
  return parts.map(clean).filter(Boolean).join(sep);
}

function formatDimension(v) {
  const s = clean(v);
  if (!s) return '';
  const n = Number(String(s).replace(',', '.'));
  if (!Number.isFinite(n)) return s;
  return String(Number(n.toFixed(3))).replace('.', ',');
}

function formatMedidas(row) {
  const explicit = pick(row, [
    'MEDIDAS', 'Medidas', 'medidas', 'Medida', 'medida',
    'medida_final', 'Medida Final', 'medidaFinal',
  ]);
  if (clean(explicit)) return explicit;

  const ancho = pick(row, ['Ancho', 'ANCHO', 'ancho', 'ANCHO_MM', 'ancho_mm']);
  const alto = pick(row, ['Alto', 'ALTO', 'alto', 'ALTO_MM', 'alto_mm']);
  const a = formatDimension(ancho);
  const h = formatDimension(alto);
  if (a && h) return `${a} x ${h}`;
  return a || h || '';
}

async function tryQuery(pool, attempts, inputs = {}) {
  for (const attempt of attempts) {
    try {
      let req = pool.request();
      for (const [name, def] of Object.entries(inputs)) {
        req = req.input(name, def.type, def.value);
      }
      const result = await req.query(attempt.sql);
      return result.recordset || [];
    } catch (err) {
      console.warn(`No se pudo ejecutar query de etiquetas (${attempt.name}):`, err?.message || err);
      continue;
    }
  }
  return [];
}

const PRE_PRODUCCION_COLUMNS = `
  [ID],
  [PARTIDA],
  [NV],
  [Nombre],
  [Direccion],
  [ID_cliente],
  [RazSoc],
  [Fecha_NV],
  [ID_Sistema],
  [Sistema],
  [Ancho],
  [Alto],
  [Peso],
  [Fecha_Entrega],
  [Fecha_Inicio],
  [Estado],
  [Revestimiento],
  [Lucera],
  [Color],
  [Liston],
  [PARANTES_Cantidad],
  [PARANTES_Distribucion],
  [Color_Sistema],
  [PUERTA_Posicion],
  [MOTOR_Condicion],
  [MOTOR_Posicion],
  [PASADOR_Condicion],
  [PASADOR_Armado],
  [INSTALACION_Instalador],
  [INSTALACION_Empotraduras],
  [INSTALACION_Posicion],
  [PARANTES_Descripcion],
  [PIERNAS_Tipo],
  [PIERNAS_Altura],
  [Tipo_Embalaje],
  [Tipo_Canasto],
  [Tipo_Cables],
  [Tipo_Espada],
  [Color_Hoja]
`;

async function fetchPreProduccionPortonesByNv(pool, nv) {
  const nvText = String(nv).trim();

  return tryQuery(pool, [
    {
      name: 'WebApp pool dbo.Pre_Produccion por NV como texto',
      sql: `
        SELECT TOP (1000) ${PRE_PRODUCCION_COLUMNS}
        FROM [dbo].[Pre_Produccion]
        WHERE LTRIM(RTRIM(CONVERT(varchar(50), [NV]))) = @nvText
        ORDER BY [ID];
      `,
    },
    {
      name: 'WebApp pool dbo.Pre_Produccion por NV numerico',
      sql: `
        SELECT TOP (1000) ${PRE_PRODUCCION_COLUMNS}
        FROM [dbo].[Pre_Produccion]
        WHERE TRY_CONVERT(int, [NV]) = @nv
        ORDER BY TRY_CONVERT(int, [ID]), [ID];
      `,
    },
    {
      name: 'Cross database WebApp.dbo.Pre_Produccion por NV como texto',
      sql: `
        SELECT TOP (1000) ${PRE_PRODUCCION_COLUMNS}
        FROM [WebApp].[dbo].[Pre_Produccion]
        WHERE LTRIM(RTRIM(CONVERT(varchar(50), [NV]))) = @nvText
        ORDER BY [ID];
      `,
    },
    {
      name: 'Cross database WebApp.dbo.Pre_Produccion por NV numerico',
      sql: `
        SELECT TOP (1000) ${PRE_PRODUCCION_COLUMNS}
        FROM [WebApp].[dbo].[Pre_Produccion]
        WHERE TRY_CONVERT(int, [NV]) = @nv
        ORDER BY TRY_CONVERT(int, [ID]), [ID];
      `,
    },
  ], {
    nv: { type: sql.Int, value: nv },
    nvText: { type: sql.VarChar(50), value: nvText },
  });
}

async function fetchVentaByNv(pool, nv) {
  const rows = await tryQuery(pool, [
    {
      name: 'dbo.NTASVTAS por numero',
      sql: `
        SELECT TOP (1) *
        FROM dbo.NTASVTAS
        WHERE TRY_CONVERT(int, numero) = @nv
        ORDER BY fecha DESC;
      `,
    },
    {
      name: 'dbo.NTASVTAS por numero cfecha',
      sql: `
        SELECT TOP (1) *
        FROM dbo.NTASVTAS
        WHERE TRY_CONVERT(int, numero) = @nv
        ORDER BY cfecha DESC;
      `,
    },
  ], { nv: { type: sql.Int, value: nv } });
  return rows[0] || null;
}

async function fetchPanelesRemitoByNv(pool, nv) {
  const rows = await tryQuery(pool, [
    {
      name: 'Paneles NTASVTAS numero/remito/fecha',
      sql: `
        SELECT TOP (10) numero, remito, fecha
        FROM dbo.NTASVTAS
        WHERE TRY_CONVERT(int, numero) = @nv AND remito IS NOT NULL
        ORDER BY fecha DESC;
      `,
    },
    {
      name: 'Paneles NTASVTAS numero/remito/cfecha',
      sql: `
        SELECT TOP (10) numero, remito, cfecha
        FROM dbo.NTASVTAS
        WHERE TRY_CONVERT(int, numero) = @nv AND remito IS NOT NULL
        ORDER BY cfecha DESC;
      `,
    },
    {
      name: 'Paneles NTASVTAS numero/remito',
      sql: `
        SELECT TOP (10) numero, remito
        FROM dbo.NTASVTAS
        WHERE TRY_CONVERT(int, numero) = @nv AND remito IS NOT NULL;
      `,
    },
  ], { nv: { type: sql.Int, value: nv } });

  const first = rows.find((r) => r?.remito !== null && r?.remito !== undefined);
  return first?.remito ?? null;
}

async function fetchPanelesRemitoHeader(pool, remito) {
  const rows = await tryQuery(pool, [
    {
      name: 'Paneles REMITOS por numero fecha',
      sql: `
        SELECT TOP (1) *
        FROM dbo.REMITOS
        WHERE TRY_CONVERT(int, numero) = @remito
        ORDER BY fecha DESC;
      `,
    },
    {
      name: 'Paneles REMITOS por numero',
      sql: `
        SELECT TOP (1) *
        FROM dbo.REMITOS
        WHERE TRY_CONVERT(int, numero) = @remito;
      `,
    },
  ], { remito: { type: sql.Int, value: Number(remito) } });
  return rows[0] || null;
}

async function fetchPanelesItems(pool, remito, header) {
  const tipo = clean(header?.tipo);
  const sucursal = parseIntSafe(header?.sucursal);
  const inputs = { remito: { type: sql.Int, value: Number(remito) } };
  const filters = ['TRY_CONVERT(int, i.numero) = @remito'];

  if (tipo) {
    inputs.tipo = { type: sql.VarChar(10), value: tipo };
    filters.push('LTRIM(RTRIM(i.tipo)) = @tipo');
  }

  if (sucursal !== null) {
    inputs.sucursal = { type: sql.Int, value: sucursal };
    filters.push('i.sucursal = @sucursal');
  }

  const where = filters.join(' AND ');

  return tryQuery(pool, [
    {
      name: 'Paneles IREMITOS + PRODUCTOS',
      sql: `
        SELECT TOP (200)
          i.rnd, i.producto, i.cantidad, i.uventa,
          i.tipo, i.sucursal, i.numero,
          i.deposito, i.facnro, i.facfecha,
          p.descripcion AS descripcion
        FROM dbo.IREMITOS i
        LEFT JOIN dbo.PRODUCTOS p ON p.codigo = i.producto
        WHERE ${where}
        ORDER BY ISNULL(i.rnd, 9999), i.producto;
      `,
    },
    {
      name: 'Paneles IREMITOS + ARTICULOS descripcion',
      sql: `
        SELECT TOP (200)
          i.rnd, i.producto, i.cantidad, i.uventa,
          i.tipo, i.sucursal, i.numero,
          i.deposito, i.facnro, i.facfecha,
          a.descripcion AS descripcion
        FROM dbo.IREMITOS i
        LEFT JOIN dbo.ARTICULOS a ON a.codigo = i.producto
        WHERE ${where}
        ORDER BY ISNULL(i.rnd, 9999), i.producto;
      `,
    },
    {
      name: 'Paneles IREMITOS + ARTICULOS detalle',
      sql: `
        SELECT TOP (200)
          i.rnd, i.producto, i.cantidad, i.uventa,
          i.tipo, i.sucursal, i.numero,
          i.deposito, i.facnro, i.facfecha,
          a.detalle AS descripcion
        FROM dbo.IREMITOS i
        LEFT JOIN dbo.ARTICULOS a ON a.codart = i.producto
        WHERE ${where}
        ORDER BY ISNULL(i.rnd, 9999), i.producto;
      `,
    },
    {
      name: 'Paneles IREMITOS base',
      sql: `
        SELECT TOP (200)
          i.rnd, i.producto, i.cantidad, i.uventa,
          i.tipo, i.sucursal, i.numero,
          i.deposito, i.facnro, i.facfecha
        FROM dbo.IREMITOS i
        WHERE ${where}
        ORDER BY ISNULL(i.rnd, 9999), i.producto;
      `,
    },
  ], inputs);
}

function panelRemitoLabel(header, remito) {
  const suc = firstNonEmpty(header?.sucursal, '');
  const nro = firstNonEmpty(header?.numero, remito);
  if (!clean(nro)) return 'REMITOS\nPENDIENTES';
  return `REMITO ${clean(suc)}-${clean(nro)}`;
}

function prop(row, names) {
  const value = pick(row, names);
  const s = clean(value);
  if (!s || s.toLowerCase() === 'null') return 'NO';
  return s;
}

function shortMotorCondicion(value) {
  const s = prop({ value }, ['value']);
  const normalized = s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  if (normalized === 'AUTOMATICO') return 'AUT';
  if (normalized === 'MANUAL') return 'MAN';
  return s;
}

function splitAddress(value) {
  const s = prop({ value }, ['value']);
  if (s === 'NO') return { line1: 'NO', line2: 'NO' };

  const maxLen = 22;
  if (s.length <= maxLen) return { line1: s, line2: 'NO' };

  const words = s.split(' ');
  let line1 = '';
  const rest = [];

  for (const word of words) {
    const next = line1 ? `${line1} ${word}` : word;
    if (next.length <= maxLen || !line1) {
      line1 = next;
    } else {
      rest.push(word);
    }
  }

  const line2 = rest.join(' ').trim();
  return { line1: line1 || s.slice(0, maxLen), line2: line2 || 'NO' };
}

function toPortonPreProduccionLabel(row, nv, index) {
  const ancho = prop(row, ['Ancho', 'ANCHO', 'ancho']);
  const alto = prop(row, ['Alto', 'ALTO', 'alto']);
  const medidas = `${formatDimension(ancho) || 'NO'} X ${formatDimension(alto) || 'NO'}`;
  const direccion = prop(row, ['Direccion', 'Dirección', 'DIRECCION']);
  const direccionParts = splitAddress(direccion);
  const motorCondicion = shortMotorCondicion(pick(row, ['MOTOR_Condicion', 'Motor Condicion', 'MOTOR CONDICION']));
  const motorPosicion = prop(row, ['MOTOR_Posicion', 'Motor Posicion', 'MOTOR POSICION']);
  const accionamiento = `${motorCondicion} ${motorPosicion}`.trim();

  return {
    brand: 'portones',
    topCode: `NV ${nv}`,
    // En la plantilla, este campo se muestra como "N° XXXX" y corresponde a la NV.
    orderCode: `N° ${nv}`,
    colorPiernas: prop(row, ['Color_Sistema', 'Color Sistema', 'COLOR_SISTEMA']),
    revestimiento: prop(row, ['Color_Hoja', 'Color Hoja', 'COLOR_HOJA']),
    liston: prop(row, ['Liston', 'Listón', 'LISTON']),
    puerta: prop(row, ['PUERTA_Posicion', 'Puerta Posicion', 'PUERTA POSICION']),
    lucera: prop(row, ['Lucera', 'LUCERA']),
    accionamiento: accionamiento || 'NO',
    // El bloque grande que antes decía INSTALACIÓN ahora muestra el Tipo_Embalaje.
    tarea: prop(row, ['Tipo_Embalaje', 'Tipo Embalaje', 'TIPO_EMBALAJE']),
    direccion: direccionParts.line1,
    direccion2: direccionParts.line2,
    cliente: prop(row, ['Nombre', 'NOMBRE', 'nombre']),
    referencia: '',
    // El usuario pidió fecha de impresión, no Fecha_NV.
    fecha: new Date(),
    comercializa: prop(row, ['RazSoc', 'RAZSOC', 'Razon Social', 'Razón Social']),
    medidas,
    numeroInterno: firstNonEmpty(nv, index),
    remitosPendientes: '',
    material: prop(row, ['Color_Hoja', 'Color Hoja', 'COLOR_HOJA']),
    nv,
    medidaFinal: medidas,
    calculadora: '',
    vendedor: '',
    carpinteria: '',
  };
}


function toIpanelLabel(row, venta, header, remito, nv, index) {
  const producto = pick(row, ['producto', 'Producto', 'codigo', 'Código', 'codart']);
  const descripcion = pick(row, ['descripcion', 'Descripción', 'detalle', 'Detalle', 'articulo', 'Artículo']);
  const cantidad = pick(row, ['cantidad', 'Cantidad', 'cant', 'Cant']);
  const unidad = pick(row, ['uventa', 'Unidad', 'unidad', 'umedida']);
  const medidas = firstNonEmpty(formatMedidas(row), descripcion);
  const remitoNumero = firstNonEmpty(header?.numero, remito);

  return {
    brand: 'ipanel',
    topCode: `NV ${nv}`,
    orderCode: firstNonEmpty(producto, `ITEM ${index}`),
    producto,
    cantidad,
    unidad,
    observacionItem: pick(row, ['observ', 'Observ', 'observacion', 'Observacion', 'observación']),
    estado: clean(header?.anulado) ? 'ANULADO' : 'OK',
    revestimiento: descripcion,
    tarea: 'PANEL COMPUESTO',
    direccion: firstNonEmpty(pick(header, ['dirent', 'direccion', 'Dirección']), pick(venta, ['dirent', 'direccion', 'Dirección'])),
    localidad: firstNonEmpty(pick(header, ['localidad']), pick(venta, ['localidad'])),
    cliente: firstNonEmpty(pick(header, ['nombre']), pick(venta, ['nombre'])),
    referencia: firstNonEmpty(descripcion, producto),
    fecha: new Date(),
    comercializa: firstNonEmpty(pick(header, ['vendedor']), pick(venta, ['vendedor'])),
    medidas,
    numeroInterno: remitoNumero,
    remitosPendientes: panelRemitoLabel(header, remito),
    material: firstNonEmpty(descripcion, producto),
    nv,
    medidaFinal: clean(cantidad) ? `CANTIDAD: ${clean(cantidad)} ${clean(unidad)}` : medidas,
    calculadora: firstNonEmpty(pick(header, ['operador']), pick(venta, ['operador'])),
    vendedor: firstNonEmpty(pick(header, ['vendedor']), pick(venta, ['vendedor'])),
    carpinteria: 'IPANEL',
  };
}

async function buildPortonesLabels(pool, nv) {
  const rows = await fetchPreProduccionPortonesByNv(pool, nv);

  if (!rows.length) {
    return { error: 'No se encontró información en WebApp.dbo.Pre_Produccion para esa NV.' };
  }

  return {
    labels: rows.map((row, idx) => toPortonPreProduccionLabel(row, nv, idx + 1)),
  };
}

async function buildIpanelLabels(pool, nv) {
  const venta = await fetchVentaByNv(pool, nv);
  const remito = await fetchPanelesRemitoByNv(pool, nv);
  if (!remito) return { error: 'La NV ingresada no tiene remito aún.' };

  const header = await fetchPanelesRemitoHeader(pool, remito);
  const items = await fetchPanelesItems(pool, remito, header);
  const rows = items.length ? items : [{}];

  return { labels: rows.map((row, idx) => toIpanelLabel(row, venta, header, remito, nv, idx + 1)) };
}

async function handleLabelsByNv(req, res, forcedEmpresa) {
  const nv = parseIntSafe(req.query.nv ?? req.query.numero);
  if (nv === null) {
    return res.status(400).json({ error: 'Query param "nv" must be a number.' });
  }

  const empresa = resolveEmpresa(req, forcedEmpresa);
  // Portones: la etiqueta sale de WebApp.dbo.Pre_Produccion.
  // Ipanels: se mantiene la lectura desde Paneles/remitos.
  const dbName = empresa === 'ipanel' ? 'Paneles' : 'WebApp';

  try {
    const pool = await getPool(dbName);
    const result = empresa === 'ipanel'
      ? await buildIpanelLabels(pool, nv)
      : await buildPortonesLabels(pool, nv);

    if (result.error) {
      return res.status(404).json({ error: result.error });
    }

    const pdfBuffer = await buildPortonLabelsPdf(result.labels);
    const filename = empresa === 'ipanel'
      ? `etiquetas-ipanel-nv-${nv}.pdf`
      : `etiquetas-portones-nv-${nv}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Label generation error', detail: String(err.message || err) });
  }
}

router.get('/etiquetas/by-nv', (req, res) => handleLabelsByNv(req, res));
router.get('/etiquetas/portones/by-nv', (req, res) => handleLabelsByNv(req, res, 'portones'));
router.get('/etiquetas/ipanel/by-nv', (req, res) => handleLabelsByNv(req, res, 'ipanel'));

export default router;
