import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildRemitoPdf } from './pdf.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const data = JSON.parse(fs.readFileSync('/mnt/data/test_data_1952.json', 'utf8'));
const buf = await buildRemitoPdf(data);
fs.writeFileSync('/mnt/data/out_remito_1952.pdf', buf);
console.log('wrote /mnt/data/out_remito_1952.pdf', buf.length);
