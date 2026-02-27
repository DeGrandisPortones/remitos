import { Router } from 'express';
import { getPool, sql } from './db.js';
import { buildRemitoPdf } from './pdf.js';

const router = Router();

function parseIntSafe(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}


function resolveDatabase(req) {
  const raw = (req.query.empresa ?? req.query.company ?? req.headers['x-empresa'] ?? req.headers['x-company'] ?? '').toString().trim().toLowerCase();
  if (raw === 'ipanel' || raw === 'ipanels' || raw === 'paneles' || raw === 'panel') return 'Paneles';
  if (raw === 'portones' || raw === 'porton' || raw === 'dg' || raw === 'degrandis') return 'Portones';
  // Default: el database configurado en el servicio (Render) o Portones.
  return process.env.SQL_DATABASE || 'Portones';
}


// Health check
router.get('/health', (req, res) => res.json({ ok: true }));

async function fetchFacturaByNv(pool, nv) {
  // La tabla NTASVTAS puede variar entre instalaciones (fecha/cfecha, etc.).
  // Probamos distintos queries para ser tolerantes a schema.
  const attempts = [
    {
      name: 'NTASVTAS(numero,factura,fecha)',
      sql: `
        SELECT TOP (10) numero, factura, fecha
        FROM dbo.NTASVTAS
        WHERE numero = @nv
        ORDER BY fecha DESC;
      `
    },
    {
      name: 'NTASVTAS(numero,factura,cfecha)',
      sql: `
        SELECT TOP (10) numero, factura, cfecha
        FROM dbo.NTASVTAS
        WHERE numero = @nv
        ORDER BY cfecha DESC;
      `
    },
    {
      name: 'NTASVTAS(numero,factura)',
      sql: `
        SELECT TOP (10) numero, factura
        FROM dbo.NTASVTAS
        WHERE numero = @nv;
      `
    }
  ];

  for (const att of attempts) {
    try {
      const r = await pool.request()
        .input('nv', sql.Int, nv)
        .query(att.sql);

      const rows = r.recordset || [];
      const first = rows.find(x => x?.factura !== null && x?.factura !== undefined);
      if (first) return first.factura;
    } catch (_) {
      // try next attempt
      continue;
    }
  }
  return null;
}


async function fetchRemitoByNvPaneles(pool, nv) {
  // Paneles: NV -> NTASVTAS.remito -> REMITOS/IREMITOS(numero)
  const attempts = [
    {
      name: 'NTASVTAS(numero,remito,fecha)',
      sql: `
        SELECT TOP (10) numero, remito, fecha
        FROM dbo.NTASVTAS
        WHERE numero = @nv AND remito IS NOT NULL
        ORDER BY fecha DESC;
      `
    },
    {
      name: 'NTASVTAS(numero,remito,cfecha)',
      sql: `
        SELECT TOP (10) numero, remito, cfecha
        FROM dbo.NTASVTAS
        WHERE numero = @nv AND remito IS NOT NULL
        ORDER BY cfecha DESC;
      `
    },
    {
      name: 'NTASVTAS(numero,remito)',
      sql: `
        SELECT TOP (10) numero, remito
        FROM dbo.NTASVTAS
        WHERE numero = @nv AND remito IS NOT NULL;
      `
    }
  ];

  for (const att of attempts) {
    try {
      const r = await pool.request()
        .input('nv', sql.Int, nv)
        .query(att.sql);

      const rows = r.recordset || [];
      const first = rows.find(x => x?.remito !== null && x?.remito !== undefined);
      if (first) return first.remito;
    } catch (_) {
      continue;
    }
  }

  return null;
}


async function fetchNtasObsByNvPaneles(pool, nv) {
  // Paneles: texto inferior del remito debe venir de NTASVTAS.observ (o NTASVTAS.observacion)
  const obsExpr = `COALESCE(NULLIF(LTRIM(RTRIM(observ)), ''), NULLIF(LTRIM(RTRIM(observacion)), '')) AS obs`;

  const attempts = [
    {
      name: 'NTASVTAS(numero,observ,fecha)',
      sql: `
        SELECT TOP (20) numero, ${obsExpr}, fecha
        FROM dbo.NTASVTAS
        WHERE numero = @nv
        ORDER BY fecha DESC;
      `
    },
    {
      name: 'NTASVTAS(numero,observ,cfecha)',
      sql: `
        SELECT TOP (20) numero, ${obsExpr}, cfecha
        FROM dbo.NTASVTAS
        WHERE numero = @nv
        ORDER BY cfecha DESC;
      `
    },
    {
      name: 'NTASVTAS(numero,observ)',
      sql: `
        SELECT TOP (20) numero, ${obsExpr}
        FROM dbo.NTASVTAS
        WHERE numero = @nv;
      `
    }
  ];

  for (const att of attempts) {
    try {
      const r = await pool.request()
        .input('nv', sql.Int, nv)
        .query(att.sql);

      const rows = r.recordset || [];
      const firstNonEmpty = rows
        .map(x => x?.obs)
        .find(v => v !== null && v !== undefined && String(v).trim() !== '');

      if (firstNonEmpty) return firstNonEmpty;
    } catch (_) {
      continue;
    }
  }

  return null;
}

async function fetchNtasObsAndNvByRemitoPaneles(pool, remitoNro) {
  // Fallback si no nos pasan NV en la URL del PDF: buscamos por remito.
  const nro = Number(remitoNro);
  if (!Number.isFinite(nro)) return null;

  const obsExpr = `COALESCE(NULLIF(LTRIM(RTRIM(observ)), ''), NULLIF(LTRIM(RTRIM(observacion)), '')) AS obs`;

  const attempts = [
    {
      name: 'NTASVTAS(remito,observ,fecha)',
      sql: `
        SELECT TOP (20) numero, ${obsExpr}, fecha
        FROM dbo.NTASVTAS
        WHERE remito = @remito
        ORDER BY fecha DESC;
      `
    },
    {
      name: 'NTASVTAS(remito,observ,cfecha)',
      sql: `
        SELECT TOP (20) numero, ${obsExpr}, cfecha
        FROM dbo.NTASVTAS
        WHERE remito = @remito
        ORDER BY cfecha DESC;
      `
    },
    {
      name: 'NTASVTAS(remito,observ)',
      sql: `
        SELECT TOP (20) numero, ${obsExpr}
        FROM dbo.NTASVTAS
        WHERE remito = @remito;
      `
    }
  ];

  for (const att of attempts) {
    try {
      const r = await pool.request()
        .input('remito', sql.Int, Math.trunc(nro))
        .query(att.sql);

      const rows = r.recordset || [];
      const row = rows.find(x => x?.obs !== null && x?.obs !== undefined && String(x.obs).trim() !== '');
      if (row) return { nv: row.numero, obs: row.obs };
    } catch (_) {
      continue;
    }
  }

  return null;
}


async function fetchVentasObservacionByFactura(pool, facturaNro, facturaTipo, facturaSuc) {
  const nro = Number(facturaNro);
  if (!Number.isFinite(nro)) return null;

  const tipo = facturaTipo !== null && facturaTipo !== undefined && String(facturaTipo).trim() !== ''
    ? String(facturaTipo).trim()
    : null;
  const suc = Number(facturaSuc);
  const hasSuc = Number.isFinite(suc);

  // Algunos esquemas guardan la factura en (tipo,sucursal,numero) y otros en (ctipo,csuc,cnro).
  // Además, puede haber duplicados por tipo/sucursal; por eso pedimos varios y tomamos el primero no vacío.
  const obsExpr = `COALESCE(NULLIF(LTRIM(RTRIM(observacion)), ''), NULLIF(LTRIM(RTRIM(observ)), ''))`;

  const attempts = [];

  // Match exacto por tipo/sucursal/numero
  {
    let where = 'numero = @nro';
    if (tipo) where += ' AND tipo = @tipo';
    if (hasSuc) where += ' AND sucursal = @suc';
    attempts.push({
      name: 'VENTAS(tipo/sucursal/numero)',
      sql: `
        SELECT TOP (50) ${obsExpr} AS obs
        FROM dbo.VENTAS
        WHERE ${where}
        ORDER BY fecha DESC;
      `
    });
  }

  // Match exacto por ctipo/csuc/cnro
  {
    let where = 'cnro = @nro';
    if (tipo) where += ' AND ctipo = @tipo';
    if (hasSuc) where += ' AND csuc = @suc';
    attempts.push({
      name: 'VENTAS(ctipo/csuc/cnro)',
      sql: `
        SELECT TOP (50) ${obsExpr} AS obs
        FROM dbo.VENTAS
        WHERE ${where}
        ORDER BY cfecha DESC;
      `
    });
  }

  // Fallbacks (sin tipo/sucursal)
  attempts.push({
    name: 'VENTAS(numero)',
    sql: `
      SELECT TOP (100) ${obsExpr} AS obs
      FROM dbo.VENTAS
      WHERE numero = @nro
      ORDER BY fecha DESC;
    `
  });

  attempts.push({
    name: 'VENTAS(cnro)',
    sql: `
      SELECT TOP (100) ${obsExpr} AS obs
      FROM dbo.VENTAS
      WHERE cnro = @nro
      ORDER BY cfecha DESC;
    `
  });

  for (const att of attempts) {
    try {
      let req = pool.request().input('nro', sql.Int, Math.trunc(nro));
      if (tipo) req = req.input('tipo', sql.VarChar(10), tipo);
      if (hasSuc) req = req.input('suc', sql.Int, Math.trunc(suc));

      const r = await req.query(att.sql);
      const rows = r.recordset || [];
      const firstNonEmpty = rows
        .map(x => x?.obs)
        .find(v => v !== null && v !== undefined && String(v).trim() !== '');

      if (firstNonEmpty) return firstNonEmpty;
    } catch (_) {
      continue;
    }
  }

  return null;
}



async function fetchHeaderAndItems(pool, { tipo, sucursal, numero }) {

  async function fetchItems(queryInputs, whereSql) {
    // Intentamos enriquecer con descripción desde tablas típicas (si existen).
    // Si falla (tabla/columna inexistente), caemos al query base sin descripción.
    const attempts = [
      {
        name: 'PRODUCTOS(codigo/descripcion)',
        sql: `
          SELECT i.rnd, i.producto, i.cantidad, i.uventa,
                 i.precio, i.bonific, i.preneto,
                 i.facnro, i.facfecha, i.lista,
                 i.cfecha, i.ctipo, i.csuc, i.cnro,
                 i.tipo, i.sucursal, i.numero, i.deposito,
                 p.descripcion AS descripcion
          FROM dbo.IREMITOS i
          LEFT JOIN dbo.PRODUCTOS p ON p.codigo = i.producto
          WHERE ${whereSql}
          ORDER BY ISNULL(i.rnd, 9999), i.producto;
        `
      },
      {
        name: 'ARTICULOS(codigo/descripcion)',
        sql: `
          SELECT i.rnd, i.producto, i.cantidad, i.uventa,
                 i.precio, i.bonific, i.preneto,
                 i.facnro, i.facfecha, i.lista,
                 i.cfecha, i.ctipo, i.csuc, i.cnro,
                 i.tipo, i.sucursal, i.numero, i.deposito,
                 a.descripcion AS descripcion
          FROM dbo.IREMITOS i
          LEFT JOIN dbo.ARTICULOS a ON a.codigo = i.producto
          WHERE ${whereSql}
          ORDER BY ISNULL(i.rnd, 9999), i.producto;
        `
      },
      {
        name: 'ARTICULOS(codart/detalle)',
        sql: `
          SELECT i.rnd, i.producto, i.cantidad, i.uventa,
                 i.precio, i.bonific, i.preneto,
                 i.facnro, i.facfecha, i.lista,
                 i.cfecha, i.ctipo, i.csuc, i.cnro,
                 i.tipo, i.sucursal, i.numero, i.deposito,
                 a.detalle AS descripcion
          FROM dbo.IREMITOS i
          LEFT JOIN dbo.ARTICULOS a ON a.codart = i.producto
          WHERE ${whereSql}
          ORDER BY ISNULL(i.rnd, 9999), i.producto;
        `
      },
      {
        name: 'BASE (sin descripcion)',
        sql: `
          SELECT
            rnd, producto, cantidad, uventa,
            precio, bonific, preneto,
            facnro, facfecha, lista,
            cfecha, ctipo, csuc, cnro,
            tipo, sucursal, numero, deposito
          FROM dbo.IREMITOS
          WHERE ${whereSql.replace(/\bi\./g, '')}
          ORDER BY ISNULL(rnd, 9999), producto;
        `
      }
    ];

    for (const att of attempts) {
      try {
        const req = pool.request();
        for (const [k, v] of Object.entries(queryInputs)) {
          if (k === 'tipo') req.input('tipo', sql.VarChar(10), v);
          else if (k === 'sucursal') req.input('sucursal', sql.Int, v);
          else if (k === 'numero') req.input('numero', sql.Int, v);
          else if (k === 'deposito') req.input('deposito', sql.Int, v);
        }
        const r = await req.query(att.sql);
        return r.recordset || [];
      } catch (_) {
        continue;
      }
    }
    return [];
  }

  const headerR = await pool.request()
    .input('tipo', sql.VarChar(10), tipo)
    .input('sucursal', sql.Int, sucursal)
    .input('numero', sql.Int, numero)
    .query(`
      SELECT TOP 1 *
      FROM dbo.REMITOS
      WHERE tipo=@tipo AND sucursal=@sucursal AND numero=@numero;
    `);

  const header = headerR.recordset?.[0];
  if (!header) return { header: null, items: [] };

  // Items por clave compuesta (preferido)
  let items = await fetchItems(
    { tipo, sucursal, numero },
    'i.tipo=@tipo AND i.sucursal=@sucursal AND i.numero=@numero'
  );

  // Fallback (sin usar cnro): si por clave compuesta no aparecen ítems,
  // intentamos por numero + deposito (si existe) y finalmente solo por numero.
  if (items.length === 0) {
    const dep = header.deposito;
    if (dep !== null && dep !== undefined) {
      items = await fetchItems(
        { numero, deposito: dep },
        'i.numero=@numero AND i.deposito=@deposito'
      );
    }
  }

  if (items.length === 0) {
    items = await fetchItems({ numero }, 'i.numero=@numero');
  }

  return { header, items };
}

// Search headers by numero (can return multiple due to tipo/sucursal)
router.get('/remitos/search', async (req, res) => {
  const numero = parseIntSafe(req.query.numero);
  const limit = Math.min(parseIntSafe(req.query.limit) ?? 20, 100);

  if (numero === null) {
    return res.status(400).json({ error: 'Query param "numero" must be a number.' });
  }

  try {
    const db = resolveDatabase(req);
    const pool = await getPool(db);
    const r = await pool.request()
      .input('numero', sql.Int, numero)
      .input('limit', sql.Int, limit)
      .query(`
        SELECT TOP (@limit)
          fecha, tipo, sucursal, numero,
          cliente, nombre, direccion, localidad, cp, provincia,
          fpago, vendedor, operador, zona,
          iva, cuit, ibrutos,
          observ, dirent,
          anulado, pendiente,
          transporte, fechaviaje,
          cnro, cfecha, ctipo, csuc
        FROM dbo.REMITOS
        WHERE numero = @numero
        ORDER BY fecha DESC;
      `);

    return res.json({ items: r.recordset });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Database error', detail: String(err.message || err) });
  }
});

// Search remitos by Nota de Venta (NV)
// NV -> NTASVTAS.factura -> IREMITOS.facnro -> REMITOS
router.get('/remitos/search-by-nv', async (req, res) => {
  const nv = parseIntSafe(req.query.nv);
  const limit = Math.min(parseIntSafe(req.query.limit) ?? 20, 100);

  if (nv === null) {
    return res.status(400).json({ error: 'Query param "nv" must be a number.' });
  }

  try {
    const db = resolveDatabase(req);
    const pool = await getPool(db);
    // Paneles: NV -> NTASVTAS.remito -> REMITOS/IREMITOS(numero)
    if (String(db).toLowerCase() === 'paneles') {
      const remito = await fetchRemitoByNvPaneles(pool, nv);
      if (!remito) {
        return res.status(404).json({ error: 'La NV ingresada no tiene remito aún.' });
      }

      const r = await pool.request()
        .input('remito', sql.Int, Number(remito))
        .input('limit', sql.Int, limit)
        .query(`
          SELECT TOP (@limit)
            fecha, tipo, sucursal, numero,
            cliente, nombre, direccion, localidad, cp, provincia,
            fpago, vendedor, operador, zona,
            iva, cuit, ibrutos,
            observ, dirent,
            anulado, pendiente,
            transporte, fechaviaje,
            cnro, cfecha, ctipo, csuc
          FROM dbo.REMITOS
          WHERE numero = @remito
          ORDER BY fecha DESC;
        `);

      const items = r.recordset || [];
      if (items.length === 0) {
        return res.status(404).json({ error: 'La NV ingresada no tiene remito aún.' });
      }

      return res.json({ nv, remito: Number(remito), items });
    }

    // Portones (default): NV -> NTASVTAS.factura -> IREMITOS.facnro -> REMITOS
    const factura = await fetchFacturaByNv(pool, nv);

    // Si la NV no existe o no tiene factura asociada
    if (!factura) {
      return res.status(404).json({ error: 'La NV ingresada no tiene remito aún.' });
    }

    // Traemos remitos que tengan ítems con esa factura (facnro)
    const r = await pool.request()
      .input('factura', sql.Int, Number(factura))
      .input('limit', sql.Int, limit)
      .query(`
        SELECT TOP (@limit)
          r.fecha, r.tipo, r.sucursal, r.numero,
          r.cliente, r.nombre, r.direccion, r.localidad, r.cp, r.provincia,
          r.fpago, r.vendedor, r.operador, r.zona,
          r.iva, r.cuit, r.ibrutos,
          r.observ, r.dirent,
          r.anulado, r.pendiente,
          r.transporte, r.fechaviaje,
          r.cnro, r.cfecha, r.ctipo, r.csuc
        FROM dbo.REMITOS r
        INNER JOIN (
          SELECT DISTINCT tipo, sucursal, numero
          FROM dbo.IREMITOS
          WHERE facnro = @factura
        ) i ON i.tipo = r.tipo AND i.sucursal = r.sucursal AND i.numero = r.numero
        ORDER BY r.fecha DESC;
      `);

    const items = r.recordset || [];
    if (items.length === 0) {
      return res.status(404).json({ error: 'La NV ingresada no tiene remito aún.' });
    }

    return res.json({ nv, factura: Number(factura), items });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Database error', detail: String(err.message || err) });
  }
});

// Get header + items as JSON
router.get('/remitos/:tipo/:sucursal/:numero', async (req, res) => {
  const { tipo } = req.params;
  const sucursal = parseIntSafe(req.params.sucursal);
  const numero = parseIntSafe(req.params.numero);

  if (!tipo || sucursal === null || numero === null) {
    return res.status(400).json({ error: 'Invalid path params. Use /remitos/:tipo/:sucursal/:numero' });
  }

  try {
    const db = resolveDatabase(req);
    const pool = await getPool(db);
    const { header, items } = await fetchHeaderAndItems(pool, { tipo, sucursal, numero });
    if (!header) return res.status(404).json({ error: 'Remito not found' });
    return res.json({ header, items });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Database error', detail: String(err.message || err) });
  }
});

// Get PDF for a remito
router.get('/remitos/:tipo/:sucursal/:numero/pdf', async (req, res) => {
  const { tipo } = req.params;
  const sucursal = parseIntSafe(req.params.sucursal);
  const numero = parseIntSafe(req.params.numero);

  if (!tipo || sucursal === null || numero === null) {
    return res.status(400).json({ error: 'Invalid path params. Use /remitos/:tipo/:sucursal/:numero/pdf' });
  }

  try {
    const db = resolveDatabase(req);
    const pool = await getPool(db);
    const { header, items } = await fetchHeaderAndItems(pool, { tipo, sucursal, numero });
    if (!header) return res.status(404).json({ error: 'Remito not found' });

    // Observación para leyenda inferior:
    // - Portones: desde VENTAS.observacion (por factura)
    // - Paneles (IPANEL): desde NTASVTAS.observ de la NV (si se busca por NV), o por remito como fallback
    let ventas_observacion = null;
    let numerov = header?.numerov;

    if (String(db).toLowerCase() === 'paneles') {
      let nv = parseIntSafe(req.query.nv);
      // 1) Si viene NV explícita (cuando se buscó por NV), usamos esa fila.
      if (nv !== null) {
        ventas_observacion = await fetchNtasObsByNvPaneles(pool, nv);
        numerov = numerov ?? nv;
      }
      // 2) Fallback: inferir NV por remito (por si imprimen desde búsqueda por remito)
      if (!ventas_observacion) {
        const byRem = await fetchNtasObsAndNvByRemitoPaneles(pool, numero);
        if (byRem?.obs) {
          ventas_observacion = byRem.obs;
          numerov = numerov ?? byRem.nv;
        }
      }
    } else {
      const facturaNro = header?.cnro ?? items?.[0]?.facnro;
      const facturaTipo = header?.ctipo ?? items?.[0]?.ctipo;
      const facturaSuc = header?.csuc ?? items?.[0]?.csuc;
      ventas_observacion = await fetchVentasObservacionByFactura(pool, facturaNro, facturaTipo, facturaSuc);
    }

    const pdfHeader = { ...header, ventas_observacion, numerov };
    const pdfBuffer = await buildRemitoPdf({ header: pdfHeader, items });
    const filename = `remito-${tipo}-${sucursal}-${numero}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'PDF generation error', detail: String(err.message || err) });
  }
});

export default router;
