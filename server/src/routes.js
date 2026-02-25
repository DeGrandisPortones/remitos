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

    const pdfBuffer = await buildRemitoPdf({ header, items });
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
