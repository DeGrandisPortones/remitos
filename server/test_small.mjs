import { buildSmallPortonLabelsPdf } from './src/labelPdf.js';
import fs from 'fs';
const buf = await buildSmallPortonLabelsPdf({nv:4165, orderCode:'N° 4165', cliente:'CORREDIZO', comercializa:'DE GRANDIS'}, 4);
fs.writeFileSync('/mnt/data/small_test.pdf', buf);
console.log(buf.length);
