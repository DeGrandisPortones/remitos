import PDFDocument from 'pdfkit';

const PAGE_W = 175.7;
const PAGE_H = 830.2;

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
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return clean(v);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function text(doc, value, x, y, width, height, opts = {}) {
  const font = opts.bold ? 'Helvetica-Bold' : 'Helvetica';
  doc.fillColor('black');
  doc.font(font).fontSize(opts.size || 9);
  doc.text(clean(value), x, y, {
    width,
    height,
    align: opts.align || 'left',
    valign: opts.valign || 'top',
    lineGap: opts.lineGap ?? 0,
  });
}

function line(doc, x1, y1, x2, y2, width = 0.7) {
  doc.save();
  doc.strokeColor('black').lineWidth(width);
  doc.moveTo(x1, y1).lineTo(x2, y2).stroke();
  doc.restore();
}

function box(doc, x, y, w, h, width = 0.7) {
  doc.save();
  doc.strokeColor('black').lineWidth(width);
  doc.rect(x, y, w, h).stroke();
  doc.restore();
}

function drawLogoPlaceholder(doc) {
  // Encabezado vectorial para no depender de imagen externa dentro del PDF.
  text(doc, 'DE GRANDIS', 13, 18, 150, 22, { size: 20, bold: true, align: 'center' });
  text(doc, 'PORTONES', 22, 44, 132, 16, { size: 11, bold: true, align: 'center' });
  line(doc, 18, 66, 158, 66, 1.2);
  text(doc, 'www.degrandisportones.com', 19, 72, 138, 11, { size: 6.8, align: 'center' });
  text(doc, 'Tel. 0353 4539099', 22, 85, 132, 10, { size: 7.4, align: 'center' });
}

function drawLabelPage(doc, label) {
  drawLogoPlaceholder(doc);

  text(doc, label.topCode, 12.3, 26.4, 151, 42, { size: 34, bold: true, align: 'center' });
  text(doc, label.orderCode, 3.8, 114.4, 169.2, 38.1, { size: 29, align: 'center' });

  const specLabels = [
    'COLOR PIERNAS:',
    'REVESTIMIENTO:',
    'LISTON:',
    'PUERTA:',
    'LUCERA:',
    'ACCIONAMIENTO:',
  ].join('\n');
  const specValues = [
    dash(label.colorPiernas),
    dash(label.revestimiento),
    dash(label.liston),
    dash(label.puerta),
    dash(label.lucera),
    dash(label.accionamiento),
  ].join('\n');
  text(doc, specLabels, 6.3, 176.4, 84.6, 64.2, { size: 9.6, align: 'right', lineGap: 1.1 });
  text(doc, specValues, 94.3, 174.4, 73.1, 67.8, { size: 9.6, align: 'left', lineGap: 1.1 });

  text(doc, label.tarea || 'INSTALACIÓN', 16.6, 258.4, 149.2, 31.8, { size: 18, bold: true, align: 'center' });

  const detailLabels = [
    'DIRECCION:',
    'LOCALIDAD:',
    'CLIENTE:',
    'REFERENCIA:',
    'FECHA:',
  ].join('\n');
  const detailValues = [
    dash(label.direccion),
    dash(label.localidad),
    dash(label.cliente),
    dash(label.referencia),
    dash(fmtDate(label.fecha)),
  ].join('\n');
  text(doc, detailLabels, 10.3, 302.4, 67.6, 59.5, { size: 9, align: 'right', lineGap: 1.1 });
  text(doc, detailValues, 84.3, 300.4, 75.4, 61.9, { size: 9, align: 'left', lineGap: 1.1 });

  text(doc, 'COMERCIALIZA', 8.3, 374.4, 90.2, 13.4, { size: 8.5, bold: true, align: 'center' });
  text(doc, upper(label.comercializa), 44.1, 392.5, 86.4, 29.9, { size: 13, bold: true, align: 'center' });

  text(doc, label.medidas ? `MEDIDAS: ${upper(label.medidas)}` : 'MEDIDAS:', 26.6, 432.4, 122.4, 13.4, { size: 8.8, bold: true, align: 'center' });
  text(doc, [label.numeroInterno ? `N°${label.numeroInterno}` : '', label.referencia ? `REF: ${upper(label.referencia)}` : ''].filter(Boolean).join('\n'), 39.2, 486.6, 101.8, 39.8, { size: 13, bold: true, align: 'center' });
  text(doc, label.remitosPendientes || 'REMITOS\nPENDIENTES', 10.3, 541, 153.8, 44.6, { size: 16, bold: true, align: 'center' });

  const bottomLines = [
    upper(label.material),
    label.nv ? `NV ${label.nv}` : '',
    upper(label.medidaFinal || label.medidas),
  ].filter(Boolean).join('\n');
  text(doc, bottomLines, 8.3, 602.4, 145.9, 47.8, { size: 13, bold: true, align: 'center', lineGap: 2 });

  text(doc, upper(label.calculadora), 17.7, 672.2, 149.6, 22.3, { size: 14, bold: true, align: 'center' });
  text(doc, upper(label.vendedor), 31.1, 728.8, 106.7, 22.3, { size: 13, bold: true, align: 'center' });
  text(doc, upper(label.carpinteria), 37.5, 777.9, 97.8, 42.2, { size: 13, bold: true, align: 'center', lineGap: 2 });

  // Guías sutiles para separar bloques, sin alterar el formato principal.
  box(doc, 4.3, 8.4, 167.1, 813.4, 0.35);
  line(doc, 8, 156, 168, 156, 0.35);
  line(doc, 8, 248, 168, 248, 0.35);
  line(doc, 8, 366, 168, 366, 0.35);
  line(doc, 8, 594, 168, 594, 0.35);
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
