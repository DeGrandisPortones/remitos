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

function formatMedidas(row) {
  const explicit = pick(row, [
    'MEDIDAS', 'Medidas', 'medidas', 'Medida', 'medida',
    'medida_final', 'Medida Final', 'medidaFinal',
  ]);
  if (clean(explicit)) return explicit;

  const ancho = pick(row, ['Ancho', 'ANCHO', 'ancho', 'ANCHO_MM', 'ancho_mm']);
  const alto = pick(row, ['Alto', 'ALTO', 'alto', 'ALTO_MM', 'alto_mm']);
  const a = clean(ancho);
  const h = clean(alto);
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

async function fetchPreProduccionPortonesByNv(pool, nv) {
  return tryQuery(pool, [
    {
      name: 'WebApp.dbo.Pre_Produccion por NV',
      sql: `
        SELECT TOP (1000)
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
        FROM [WebApp].[dbo].[Pre_Produccion]
        WHERE TRY_CONVERT(int, [NV]) = @nv
        ORDER BY TRY_CONVERT(int, [PARTIDA]), TRY_CONVERT(int, [ID]), [ID];
      `,
    },
    {
      name: 'dbo.Pre_Produccion por NV',
      sql: `
        SELECT TOP (1000) *
        FROM [dbo].[Pre_Produccion]
        WHERE TRY_CONVERT(int, [NV]) = @nv
        ORDER BY TRY_CONVERT(int, [PARTIDA]), TRY_CONVERT(int, [ID]), [ID];
      `,
    },
  ], { nv: { type: sql.Int, value: nv } });
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

function toPortonPreProduccionLabel(row, nv, index) {
  const medidas = formatMedidas(row);
  const partida = pick(row, ['PARTIDA', 'Partida', 'partida']);
  const id = pick(row, ['ID', 'Id', 'id']);
  const nombre = pick(row, ['Nombre', 'NOMBRE', 'nombre']);
  const razSoc = pick(row, ['RazSoc', 'RAZSOC', 'Razon Social', 'Razón Social']);
  const colorHoja = pick(row, ['Color_Hoja', 'COLOR_HOJA', 'Color Hoja']);
  const sistema = pick(row, ['Sistema', 'SISTEMA', 'sistema']);
  const motor = joinParts([
    pick(row, ['MOTOR_Condicion', 'Motor Condicion']),
    pick(row, ['MOTOR_Posicion', 'Motor Posicion']),
  ], ' - ');

  return {
    brand: 'portones',
    topCode: clean(partida) ? `P ${partida}` : `#${index}`,
    orderCode: clean(partida) ? `N°${partida}` : `NV ${nv}`,
    colorPiernas: firstNonEmpty(pick(row, ['Color_Sistema', 'Color Sistema']), pick(row, ['Color'])),
    revestimiento: pick(row, ['Revestimiento']),
    liston: pick(row, ['Liston', 'Listón']),
    puerta: pick(row, ['PUERTA_Posicion', 'Puerta Posicion']),
    lucera: pick(row, ['Lucera']),
    accionamiento: motor,
    tarea: firstNonEmpty(nombre, sistema, 'PORTÓN A MEDIDA'),
    direccion: pick(row, ['Direccion', 'Dirección']),
    localidad: '',
    cliente: firstNonEmpty(razSoc, nombre),
    referencia: firstNonEmpty(nombre, sistema),
    fecha: new Date(),
    comercializa: 'DE GRANDIS PORTONES',
    medidas,
    numeroInterno: firstNonEmpty(id, partida),
    remitosPendientes: clean(partida) ? `PARTIDA\n${partida}` : `NV\n${nv}`,
    material: firstNonEmpty(colorHoja, pick(row, ['Color'])),
    nv,
    medidaFinal: medidas,
    calculadora: sistema,
    vendedor: firstNonEmpty(pick(row, ['Estado']), ''),
    carpinteria: firstNonEmpty(colorHoja ? `COLOR HOJA\n${colorHoja}` : '', 'DE GRANDIS'),
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
  const dbName = empresa === 'ipanel' ? 'Paneles' : 'Portones';

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
