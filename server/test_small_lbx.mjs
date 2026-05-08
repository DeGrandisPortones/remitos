import fs from 'fs';
import { buildSmallPortonesLabelLbx } from './src/lbx.js';
const buf = await buildSmallPortonesLabelLbx({nv:4017, orderCode:'N° 4017', cliente:'CORREDIZO', comercializa:'DE GRANDIS'}, 4);
fs.writeFileSync('/mnt/data/test_small_lbx.lbx', buf);
console.log(buf.length);
