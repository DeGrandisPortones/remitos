import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';

const PAGE_W = 175.7;
// La plantilla Brother tiene corte libre en 475.5pt. La etiqueta real que se imprime
// es ese primer tramo; el diseño anterior usaba todo el alto del .lbx y quedaba demasiado largo.
const PAGE_H = 475.5;
const SMALL_PAGE_W = 175.7; // 62 mm
const SMALL_PAGE_H = 60; // aprox 21 mm

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ASSETS_DIR = path.join(__dirname, 'assets');
const IPANEL_LOGO_PATH = path.join(ASSETS_DIR, 'ipanel.png');
const DEGRANDIS_LOGO_PATH = path.join(ASSETS_DIR, 'degrandis_logo.png');

function clean(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

function upper(v) {
  return clean(v).toUpperCase();
}

function dash(v) {
  const s = clean(v);
  return s ? `-${s}` : '-';
}

function fmtDate(v) {
  if (!v) return '';
  const raw = clean(v);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;

  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return raw;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function truncate(v, max = 24) {
  const s = clean(v);
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function fitFontSize(value, baseSize, width, maxCharsAtBase) {
  const len = clean(value).length;
  if (!len || len <= maxCharsAtBase) return baseSize;
  const ratio = maxCharsAtBase / len;
  return Math.max(7, Math.floor(baseSize * ratio * 10) / 10);
}

function text(doc, value, x, y, width, height, opts = {}) {
  const font = opts.bold ? 'Helvetica-Bold' : 'Helvetica';
  doc.fillColor(opts.color || 'black');
  doc.font(font).fontSize(opts.size || 9);
  doc.text(clean(value), x, y, {
    width,
    height,
    align: opts.align || 'left',
    valign: opts.valign || 'top',
    lineGap: opts.lineGap ?? 0,
    ellipsis: opts.ellipsis ?? false,
  });
}

function oneLine(doc, value, x, y, width, opts = {}) {
  text(doc, truncate(value, opts.maxChars || 28), x, y, width, opts.height || 10, {
    ...opts,
    lineGap: 0,
  });
}

function line(doc, x1, y1, x2, y2, width = 0.7) {
  doc.save();
  doc.strokeColor('black').lineWidth(width);
  doc.moveTo(x1, y1).lineTo(x2, y2).stroke();
  doc.restore();
}

function drawDegrandisFallback(doc) {
  text(doc, 'DG De Grandis', 11, 22, 153, 28, { size: 24, bold: true, align: 'center' });
  text(doc, 'PORTONES', 26, 55, 123, 14, { size: 10, bold: true, align: 'center' });
}

function drawDegrandisLogo(doc) {
  if (fs.existsSync(DEGRANDIS_LOGO_PATH)) {
    try {
      doc.image(DEGRANDIS_LOGO_PATH, 10, 15, {
        fit: [154, 56],
        align: 'center',
        valign: 'center',
      });
      return;
    } catch (_) {
      // Fallback vectorial si PDFKit no puede decodificar el PNG.
    }
  }

  drawDegrandisFallback(doc);
}

function drawIpanelFallback(doc) {
  doc.save();
  doc.rect(37.5, 12, 100, 100).fill('black');
  text(doc, 'i-panel', 45, 47, 86, 28, { size: 22, bold: true, align: 'center', color: 'white' });
  text(doc, 'PANEL COMPUESTO', 45, 78, 86, 12, { size: 6.8, bold: true, align: 'center', color: 'white' });
  doc.restore();
}

function drawIpanelLogo(doc) {
  if (fs.existsSync(IPANEL_LOGO_PATH)) {
    try {
      doc.image(IPANEL_LOGO_PATH, 37.5, 12, { fit: [100, 100], align: 'center', valign: 'center' });
      return;
    } catch (_) {
      // Fallback vectorial si PDFKit no puede decodificar el PNG.
    }
  }

  drawIpanelFallback(doc);
}

function drawPortonesSpecs(doc, label) {
  const rows = [
    ['COLOR PIERNAS:', dash(upper(label.colorPiernas))],
    ['REVESTIMIENTO:', dash(upper(label.revestimiento))],
    ['LISTON:', dash(upper(label.liston))],
    ['PUERTA:', dash(upper(label.puerta))],
    ['LUCERA:', dash(upper(label.lucera))],
    ['ACCIONAMIENTO:', dash(upper(label.accionamiento))],
  ];

  let y = 176.4;
  for (const [left, right] of rows) {
    oneLine(doc, left, 6.3, y, 84.6, { size: 9.3, align: 'right', maxChars: 18 });
    oneLine(doc, right, 94.3, y, 73.1, { size: 9.3, align: 'left', maxChars: 18 });
    y += 10.5;
  }
}

function drawPortonesDetails(doc, label) {
  // Se quita REFERENCIA. El espacio de LOCALIDAD se usa como segunda línea de Dirección.
  const rows = [
    ['DIRECCION:', dash(upper(label.direccion))],
    ['', dash(upper(label.direccion2))],
    ['CLIENTE:', dash(upper(label.cliente))],
    ['FECHA:', dash(fmtDate(label.fecha))],
  ];

  let y = 302.4;
  for (const [left, right] of rows) {
    oneLine(doc, left, 10.3, y, 67.6, { size: 8.3, align: 'right', maxChars: 12 });
    oneLine(doc, right, 84.3, y, 75.4, { size: 8.3, align: 'left', maxChars: 19 });
    y += 11.0;
  }
}

function drawPortonesLabelPage(doc, label) {
  drawDegrandisLogo(doc);

  // Número principal: mismo bloque que la plantilla .lbx original.
  text(doc, label.orderCode, 3.8, 104.4, 169.2, 45, { size: 33, align: 'center' });

  drawPortonesSpecs(doc, label);

  const tarea = upper(label.tarea || 'NO');
  text(doc, tarea, 16.6, 258.4, 149.2, 31.8, {
    size: fitFontSize(tarea, 27, 149.2, 12),
    bold: false,
    align: 'center',
  });

  drawPortonesDetails(doc, label);

  text(doc, 'COMERCIALIZA', 8.3, 374.4, 90.2, 13.4, { size: 8.5, bold: true, align: 'center' });

  const comercializa = upper(label.comercializa);
  text(doc, comercializa, 19.5, 392.5, 136.4, 29.9, {
    size: fitFontSize(comercializa, 20, 136.4, 12),
    bold: true,
    align: 'center',
  });

  text(doc, label.medidas ? `MEDIDAS: ${upper(label.medidas)}` : 'MEDIDAS:', 18.6, 432.4, 138.4, 13.4, {
    size: 10.5,
    bold: true,
    align: 'center',
  });
}

function drawIpanelLabelPage(doc, label) {
  drawIpanelLogo(doc);

  text(doc, label.topCode, 12.3, 108.4, 151, 22, { size: 18, bold: true, align: 'center' });
  text(doc, label.orderCode, 3.8, 131.4, 169.2, 30, { size: 20, bold: true, align: 'center' });

  const rows = [
    ['PRODUCTO:', dash(label.producto)],
    ['DETALLE:', dash(label.revestimiento)],
    ['CANTIDAD:', dash(label.cantidad)],
    ['UNIDAD:', dash(label.unidad)],
    ['OBS.:', dash(label.observacionItem)],
    ['ESTADO:', dash(label.estado)],
  ];

  let y = 176.4;
  for (const [left, right] of rows) {
    oneLine(doc, left, 6.3, y, 84.6, { size: 9.3, align: 'right', maxChars: 18 });
    oneLine(doc, right, 94.3, y, 73.1, { size: 9.3, align: 'left', maxChars: 18 });
    y += 10.5;
  }

  text(doc, label.tarea || 'PANEL COMPUESTO', 16.6, 258.4, 149.2, 31.8, { size: 22, bold: true, align: 'center' });

  const detailRows = [
    ['DIRECCION:', dash(upper(label.direccion))],
    ['LOCALIDAD:', dash(upper(label.localidad))],
    ['CLIENTE:', dash(upper(label.cliente))],
    ['REFERENCIA:', dash(upper(label.referencia))],
    ['FECHA:', dash(fmtDate(label.fecha))],
  ];

  y = 302.4;
  for (const [left, right] of detailRows) {
    oneLine(doc, left, 10.3, y, 67.6, { size: 8.3, align: 'right', maxChars: 12 });
    oneLine(doc, right, 84.3, y, 75.4, { size: 8.3, align: 'left', maxChars: 19 });
    y += 11.0;
  }

  text(doc, 'COMERCIALIZA', 8.3, 374.4, 90.2, 13.4, { size: 8.5, bold: true, align: 'center' });
  const comercializa = upper(label.comercializa || 'IPANEL');
  text(doc, comercializa, 19.5, 392.5, 136.4, 29.9, {
    size: fitFontSize(comercializa, 18, 136.4, 14),
    bold: true,
    align: 'center',
  });
  text(doc, label.medidas ? `MEDIDAS: ${upper(label.medidas)}` : 'MEDIDAS:', 18.6, 432.4, 138.4, 13.4, {
    size: 10.5,
    bold: true,
    align: 'center',
  });
}


function drawSmallPortonesLabelPage(doc, label) {
  const nvRaw = clean(label.nv || label.topCode || label.orderCode || '');
  const nv = nvRaw.replace(/^N\s*[°º]?\s*/i, '').replace(/^NV\s*/i, '').trim() || nvRaw;
  const refParts = [label.cliente, label.comercializa]
    .map((v) => clean(v))
    .filter(Boolean);
  const ref = refParts.length ? refParts.join(' / ') : clean(label.referencia || 'NO');

  doc.save();
  doc.rect(2, 2, SMALL_PAGE_W - 4, SMALL_PAGE_H - 4).strokeColor('black').lineWidth(0.5).stroke();
  doc.restore();

  if (fs.existsSync(DEGRANDIS_LOGO_PATH)) {
    try {
      doc.image(DEGRANDIS_LOGO_PATH, 6, 8, { fit: [44, 24], align: 'center', valign: 'center' });
    } catch (_) {
      text(doc, 'DG', 7, 9, 28, 12, { size: 10, bold: true, align: 'center' });
      text(doc, 'PORTONES', 4, 24, 38, 8, { size: 5.5, bold: true, align: 'center' });
    }
  } else {
    text(doc, 'DG', 7, 9, 28, 12, { size: 10, bold: true, align: 'center' });
    text(doc, 'PORTONES', 4, 24, 38, 8, { size: 5.5, bold: true, align: 'center' });
  }

  text(doc, `N°${nv}`, 54, 6, 118, 24, {
    size: fitFontSize(`N°${nv}`, 22, 118, 9),
    bold: false,
    align: 'center',
  });

  const refText = `REF: ${upper(ref)}`;
  text(doc, refText, 54, 34, 116, 16, {
    size: fitFontSize(refText, 11, 116, 17),
    bold: false,
    align: 'center',
  });
}

export async function buildSmallPortonLabelsPdf(label, copies = 4) {
  const doc = new PDFDocument({ size: [SMALL_PAGE_W, SMALL_PAGE_H], margin: 0, autoFirstPage: false });
  const chunks = [];
  doc.on('data', (d) => chunks.push(d));

  const safeCopies = Math.max(1, Math.min(20, Number(copies) || 4));
  for (let i = 0; i < safeCopies; i += 1) {
    doc.addPage({ size: [SMALL_PAGE_W, SMALL_PAGE_H], margin: 0 });
    drawSmallPortonesLabelPage(doc, label || {});
  }

  return await new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

function drawLabelPage(doc, label) {
  if (label?.brand === 'ipanel') {
    drawIpanelLabelPage(doc, label || {});
  } else {
    drawPortonesLabelPage(doc, label || {});
  }
}

export async function buildPortonLabelsPdf(labels) {
  const doc = new PDFDocument({ size: [PAGE_W, PAGE_H], margin: 0, autoFirstPage: false });
  const chunks = [];
  doc.on('data', (d) => chunks.push(d));

  for (const label of labels || []) {
    doc.addPage({ size: [PAGE_W, PAGE_H], margin: 0 });
    drawLabelPage(doc, label || {});
  }

  return await new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}
