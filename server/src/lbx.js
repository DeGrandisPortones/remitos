import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE_DIR = path.join(__dirname, 'assets', 'portones_lbx_template');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0 ^ -1;
  for (const b of buffer) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ b) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosDate, dosTime };
}

function buildZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { dosDate, dosTime } = dosDateTime();

  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(String(file.data), 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 file names
    local.writeUInt16LE(0, 8); // store, no compression
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);

    localParts.push(local, data);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centralParts.push(central);

    offset += local.length + data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, end]);
}


function clean(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

function upper(v) {
  return clean(v).toUpperCase();
}

function dash(v) {
  const s = clean(v);
  return s ? `-${s}` : '-NO';
}

function escapeXml(v) {
  return clean(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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

function replaceData(xml, oldValue, newValue) {
  const oldTag = `<pt:data>${oldValue}</pt:data>`;
  const newTag = `<pt:data>${escapeXml(newValue)}</pt:data>`;
  if (!xml.includes(oldTag)) {
    console.warn('No se encontro texto LBX para reemplazar:', oldValue.slice(0, 80));
    return xml;
  }
  return xml.replace(oldTag, newTag);
}

function replaceDataRaw(xml, oldValue, newValue) {
  const oldTag = `<pt:data>${oldValue}</pt:data>`;
  const newTag = `<pt:data>${newValue}</pt:data>`;
  if (!xml.includes(oldTag)) {
    console.warn('No se encontro texto LBX para reemplazar:', oldValue.slice(0, 80));
    return xml;
  }
  return xml.replace(oldTag, newTag);
}

function portonesLabelToXml(label) {
  let xml = fs.readFileSync(path.join(TEMPLATE_DIR, 'label.xml'), 'utf8').replace(/\r\n/g, '\n');

  const specs = [
    dash(upper(label.colorPiernas || 'NO')),
    dash(upper(label.revestimiento || 'NO')),
    dash(upper(label.liston || 'NO')),
    dash(upper(label.puerta || 'NO')),
    dash(upper(label.lucera || 'NO')),
    dash(upper(label.accionamiento || 'NO')),
  ].join('\n');

  const detailLabels = 'DIRECCION:\nLOCALIDAD:\nCLIENTE:\n \nFECHA:';
  const detailValues = [
    dash(upper(label.direccion || 'NO')),
    dash(upper(label.direccion2 || 'NO')),
    dash(upper(label.cliente || 'NO')),
    '-',
    dash(fmtDate(label.fecha || new Date())),
  ].join('\n');

  const medidas = clean(label.medidas || 'NO').replace(/\s*mm\s*$/i, '');

  xml = replaceData(xml, 'N°3463/3309 ', label.orderCode || label.topCode || 'N°');
  xml = replaceData(xml, '-NEG MICRO\n-NEG MICRO\n-NO\n-NO\n-NO\n-AUT DERECHA', specs);
  xml = replaceData(xml, 'DIRECCION:\nLOCALIDAD:\nCLIENTE:\nREFERENCIA:\nFECHA:', detailLabels);
  xml = replaceData(xml, '-\n-VILLA MARIA\n-POMILLO JOSE 2\n-\n-23/04/2026', detailValues);
  xml = replaceData(xml, 'INSTALACIÓN', upper(label.tarea || 'NO'));
  xml = replaceData(xml, 'BARENGO', upper(label.comercializa || 'NO'));
  xml = replaceData(xml, 'MEDIDAS: 2980X2380', `MEDIDAS: ${upper(medidas)}`);

  // Texto auxiliar superior de la plantilla original. Lo dejamos vacio para no interferir con el logo.
  xml = replaceDataRaw(xml, '267', ' ');

  return xml;
}

export async function buildPortonesLabelLbx(label) {
  const normalized = { ...(label || {}), brand: 'portones' };
  const labelXml = portonesLabelToXml(normalized);

  return buildZip([
    { name: 'label.xml', data: Buffer.from(labelXml, 'utf8') },
    { name: 'prop.xml', data: fs.readFileSync(path.join(TEMPLATE_DIR, 'prop.xml')) },
    { name: 'Object0.bmp', data: fs.readFileSync(path.join(TEMPLATE_DIR, 'Object0.bmp')) },
    { name: 'Object1.emf', data: fs.readFileSync(path.join(TEMPLATE_DIR, 'Object1.emf')) },
  ]);
}


function extractFirstObject(xml, tagName, containsText) {
  const pattern = new RegExp(`<${tagName}[\\s\\S]*?</${tagName}>`, 'g');
  const matches = xml.match(pattern) || [];
  return matches.find((fragment) => fragment.includes(containsText)) || '';
}

function shiftPt(value, delta) {
  const n = Number(String(value).replace('pt', ''));
  if (!Number.isFinite(n)) return value;
  const shifted = Math.round((n + delta) * 10) / 10;
  return `${shifted}pt`;
}

function shiftObjectFragment(fragment, yDelta, suffix) {
  let out = fragment;
  out = out.replace(/objectName="([^"]+)"/, (_m, name) => `objectName="${name}_${suffix}"`);
  out = out.replace(/ y="([0-9.]+pt)"/g, (_m, y) => ` y="${shiftPt(y, yDelta)}"`);
  return out;
}

function escapeXmlPreserveWhitespace(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function smallRefText(label) {
  const nvRaw = clean(label?.nv || label?.orderCode || label?.topCode || '');
  const nvMatch = nvRaw.match(/\d+/);
  const nv = nvMatch ? nvMatch[0] : nvRaw;
  const ref = [clean(label?.cliente), clean(label?.comercializa)].filter(Boolean).join(' / ') || 'NO';
  return `N°${nv}\nREF: ${ref}`;
}

function buildSmallPortonesLabelXml(label, copies = 4) {
  let xml = fs.readFileSync(path.join(TEMPLATE_DIR, 'label.xml'), 'utf8').replace(/\r\n/g, '\n');
  const smallText = extractFirstObject(xml, 'text:text', 'N°4165');
  const smallLogo = extractFirstObject(xml, 'image:image', 'Imagen19');

  if (!smallText || !smallLogo) {
    throw new Error('No se encontro la plantilla de etiqueta chica dentro del LBX.');
  }

  const count = Math.max(1, Math.min(20, Number(copies) || 4));
  const originalStartY = 475.5;
  const segmentHeight = 59.2;
  const objects = [];
  const textValue = smallRefText(label);

  for (let i = 0; i < count; i += 1) {
    const delta = -originalStartY + (segmentHeight * i);
    const suffix = `small${i + 1}`;
    const logo = shiftObjectFragment(smallLogo, delta, suffix);
    const textObj = replaceDataRaw(
      shiftObjectFragment(smallText, delta, suffix),
      'N°4165 \nREF: CORREDIZO ',
      escapeXmlPreserveWhitespace(textValue)
    );
    objects.push(logo, textObj);
  }

  const totalHeight = Math.round(segmentHeight * count * 10) / 10;
  const bgHeight = Math.max(1, Math.round((totalHeight - 16.9) * 10) / 10);
  const cutLines = Array.from({ length: Math.max(0, count - 1) }, (_, i) => `${Math.round(segmentHeight * (i + 1) * 10) / 10}pt`).join(' ');

  xml = xml.replace(/<style:paper([^>]*?)height="[^"]+"([^>]*?)>/, (m, before, after) => `<style:paper${before}height="${totalHeight}pt"${after}>`);
  xml = xml.replace(/<style:cutLine[^>]*\/>/, `<style:cutLine regularCut="0pt" freeCut="${cutLines}"/>`);
  xml = xml.replace(/<style:backGround([^>]*?)height="[^"]+"([^>]*?)\/>/, (m, before, after) => `<style:backGround${before}height="${bgHeight}pt"${after}/>`);
  xml = xml.replace(/<pt:objects>[\s\S]*?<\/pt:objects>/, `<pt:objects>${objects.join('')}</pt:objects>`);

  return xml;
}


function extractObjectFragments(xml) {
  const pattern = /<(?:text:text|image:image)[\s\S]*?<\/(?:text:text|image:image)>/g;
  return xml.match(pattern) || [];
}

function ptToNumber(value) {
  const n = Number(String(value || '').replace('pt', ''));
  return Number.isFinite(n) ? n : 0;
}

function objectNumber(fragment, attrName) {
  const re = new RegExp(` ${attrName}="([^"]+)"`);
  const m = fragment.match(re);
  return m ? ptToNumber(m[1]) : 0;
}

function isMainLabelObject(fragment) {
  const y = objectNumber(fragment, 'y');
  const x = objectNumber(fragment, 'x');
  // Conserva solo los objetos visibles de la etiqueta grande.
  // Descarta la etiqueta chica original y textos viejos que estaban despues del primer corte.
  return y < 475.5 && x < 176;
}

function buildCompletePortonesLabelXml(label, smallCopies = 4) {
  const mainXml = portonesLabelToXml(label);
  const templateXml = fs.readFileSync(path.join(TEMPLATE_DIR, 'label.xml'), 'utf8').replace(/\r\n/g, '\n');

  const mainObjects = extractObjectFragments(mainXml).filter(isMainLabelObject);
  const smallText = extractFirstObject(templateXml, 'text:text', 'N°4165');
  const smallLogo = extractFirstObject(templateXml, 'image:image', 'Imagen19');

  if (!smallText || !smallLogo) {
    throw new Error('No se encontro la plantilla de etiqueta chica dentro del LBX.');
  }

  const count = Math.max(1, Math.min(20, Number(smallCopies) || 4));
  const mainHeight = 475.5;
  const smallSegmentHeight = 59.2;
  const smallObjects = [];
  const textValue = smallRefText(label);

  for (let i = 0; i < count; i += 1) {
    const delta = smallSegmentHeight * i;
    const suffix = `completeSmall${i + 1}`;
    const logo = shiftObjectFragment(smallLogo, delta, suffix);
    const textObj = replaceDataRaw(
      shiftObjectFragment(smallText, delta, suffix),
      'N°4165 \nREF: CORREDIZO ',
      escapeXmlPreserveWhitespace(textValue)
    );
    smallObjects.push(logo, textObj);
  }

  const totalHeight = Math.round((mainHeight + (smallSegmentHeight * count)) * 10) / 10;
  const bgHeight = Math.max(1, Math.round((totalHeight - 16.9) * 10) / 10);
  const cutLineValues = [mainHeight];
  for (let i = 1; i < count; i += 1) {
    cutLineValues.push(Math.round((mainHeight + (smallSegmentHeight * i)) * 10) / 10);
  }
  const cutLines = cutLineValues.map((v) => `${v}pt`).join(' ');

  let xml = mainXml;
  xml = xml.replace(/<style:paper([^>]*?)height="[^"]+"([^>]*?)>/, (_m, before, after) => `<style:paper${before}height="${totalHeight}pt"${after}>`);
  xml = xml.replace(/<style:cutLine[^>]*\/>/, `<style:cutLine regularCut="0pt" freeCut="${cutLines}"/>`);
  xml = xml.replace(/<style:backGround([^>]*?)height="[^"]+"([^>]*?)\/>/, (_m, before, after) => `<style:backGround${before}height="${bgHeight}pt"${after}/>`);
  xml = xml.replace(/<pt:objects>[\s\S]*?<\/pt:objects>/, `<pt:objects>${mainObjects.join('')}${smallObjects.join('')}</pt:objects>`);

  return xml;
}

export async function buildSmallPortonesLabelLbx(label, copies = 4) {
  const normalized = { ...(label || {}), brand: 'portones' };
  const labelXml = buildSmallPortonesLabelXml(normalized, copies);

  return buildZip([
    { name: 'label.xml', data: Buffer.from(labelXml, 'utf8') },
    { name: 'prop.xml', data: fs.readFileSync(path.join(TEMPLATE_DIR, 'prop.xml')) },
    { name: 'Object0.bmp', data: fs.readFileSync(path.join(TEMPLATE_DIR, 'Object0.bmp')) },
    { name: 'Object1.emf', data: fs.readFileSync(path.join(TEMPLATE_DIR, 'Object1.emf')) },
  ]);
}


export async function buildCompletePortonesLabelLbx(label, smallCopies = 4) {
  const normalized = { ...(label || {}), brand: 'portones' };
  const labelXml = buildCompletePortonesLabelXml(normalized, smallCopies);

  return buildZip([
    { name: 'label.xml', data: Buffer.from(labelXml, 'utf8') },
    { name: 'prop.xml', data: fs.readFileSync(path.join(TEMPLATE_DIR, 'prop.xml')) },
    { name: 'Object0.bmp', data: fs.readFileSync(path.join(TEMPLATE_DIR, 'Object0.bmp')) },
    { name: 'Object1.emf', data: fs.readFileSync(path.join(TEMPLATE_DIR, 'Object1.emf')) },
  ]);
}
