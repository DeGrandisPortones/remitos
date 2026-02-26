import { Router } from 'express';
import { getPool, sql } from './db.js';
import { buildRemitoPdf } from './pdf.js';

const router = Router();

function parseIntSafe(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
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

async function fetchVentasObservacionByFactura(pool, factura) {
  const fac = Number(factura);
  if (!Number.isFinite(fac)) return null;

  const attempts = [
    {
      name: 'VENTAS(numero -> observacion)',
      sql: `
        SELECT TOP (1) observacion
        FROM dbo.VENTAS
        WHERE numero = @factura;
      `
    },
    {
      name: 'VENTAS(factura -> observacion)',
      sql: `
        SELECT TOP (1) observacion
        FROM dbo.VENTAS
        WHERE factura = @factura;
      `
    },
    {
      name: 'VENTAS(cnro -> observacion)',
      sql: `
        SELECT TOP (1) observacion
        FROM dbo.VENTAS
        WHERE cnro = @factura;
      `
    },
    {
      name: 'VENTAS(facnro -> observacion)',
      sql: `
        SELECT TOP (1) observacion
        FROM dbo.VENTAS
        WHERE facnro = @factura;
      `
    }
  ];

  for (const att of attempts) {
    try {
      const r = await pool.request()
        .input('factura', sql.Int, fac)
        .query(att.sql);

      const row = r.recordset?.[0];
      const obs = row?.observacion;
      if (obs !== null && obs !== undefined && String(obs).trim() !== '') return obs;
    } catch (_) {
      continue;
    }
  }
  return null;
}


async function fetchHeaderAndItems({ tipo, sucursal, numero }) {
  const pool = await getPool();

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
    const pool = await getPool();
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
    const pool = await getPool();
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
    const { header, items } = await fetchHeaderAndItems({ tipo, sucursal, numero });
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
    const { header, items } = await fetchHeaderAndItems({ tipo, sucursal, numero });
    if (!header) return res.status(404).json({ error: 'Remito not found' });

    // Observación desde VENTAS usando el nro de factura (cnro / facnro)
    const pool = await getPool();
    const facturaNro = header?.cnro ?? items?.[0]?.facnro;
    const ventas_observacion = await fetchVentasObservacionByFactura(pool, facturaNro);

    const pdfHeader = { ...header, ventas_observacion };
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
