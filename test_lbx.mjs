import { buildCompletePortonesLabelLbx } from './server/src/lbx.js';
import fs from 'fs';
const label={brand:'portones', nv:'4026', orderCode:'N° 4026', colorPiernas:'BLANCO', revestimiento:'BLANCO', liston:'BLANCO', puerta:'IZQUIERDA', lucera:'NO', accionamiento:'AUT DERECHA', tarea:'INSTALACION', direccion:'Pelleschi 357 ---', direccion2:'Etruria Córdoba CP: 2681', cliente:'Cortona Adriana Elena', fecha:'2026-05-08', comercializa:'DE GRANDIS PORTONES 23', medidas:'3410 X 2200 mm'};
const b=await buildCompletePortonesLabelLbx(label,4); fs.writeFileSync('/mnt/data/test_fit_complete.lbx',b);
console.log(b.length);
