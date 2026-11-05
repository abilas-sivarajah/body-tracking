// Erzeugt public/data/bls.min.json aus dem offiziellen BLS-4.0-Download.
// Quelle: https://www.blsdb.de/download (CC BY 4.0, Herausgeber: Max Rubner-Institut)
// Aufruf: npm run build:bls -- <Pfad zu BLS_4_0_Daten_2025_DE.xlsx>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';

const input = process.argv[2];
if (!input) {
  console.error('Pfad zur Datei BLS_4_0_Daten_2025_DE.xlsx angeben.');
  process.exit(1);
}
const output = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'bls.min.json');

const decode = s => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

const files = unzipSync(new Uint8Array(readFileSync(input)));
const shared = [...strFromU8(files['xl/sharedStrings.xml']).matchAll(/<si>([\s\S]*?)<\/si>/g)]
  .map(m => decode([...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map(t => t[1]).join('')));
const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);

function cells(rowXml) {
  const out = {};
  for (const c of rowXml.matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>(?:<f>[^<]*<\/f>)?<v>([^<]*)<\/v><\/c>|><\/c>)/g)) {
    if (c[3] === undefined) continue;
    out[c[1]] = /t="s"/.test(c[2]) ? shared[Number(c[3])] : c[3];
  }
  return out;
}

let header = null, nameCol, kcalCol, protCol;
const foods = [];
let skipped = 0;
for (const row of sheet.matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)) {
  const c = cells(row[1]);
  if (!header) {
    header = c;
    const find = re => Object.keys(c).find(k => re.test(c[k] || ''));
    nameCol = find(/^Lebensmittelbezeichnung$/);
    kcalCol = find(/^ENERCC .*\[kcal\/100g\]/);
    protCol = find(/^PROT625 .*\[g\/100g\]/);
    if (!nameCol || !kcalCol || !protCol) throw new Error('Spalten nicht gefunden, Format des BLS geändert?');
    continue;
  }
  const name = (c[nameCol] || '').trim();
  const kcal = Number(c[kcalCol]);
  const protein = Number(c[protCol]);
  if (!name || !Number.isFinite(kcal) || !Number.isFinite(protein) || c[kcalCol] === undefined || c[protCol] === undefined) { skipped++; continue; }
  foods.push([name, Math.round(kcal), Math.round(protein * 10) / 10]);
}
if (foods.length < 1000) throw new Error('Unerwartet wenige Einträge: ' + foods.length);

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify({
  source: 'Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), Version 4.0, Karlsruhe. DOI: 10.25826/Data20251217-134202-0',
  license: 'CC BY 4.0',
  fields: ['name', 'kcal/100g', 'protein g/100g'],
  foods
}));
console.log(`${foods.length} Lebensmittel geschrieben, ${skipped} übersprungen.`);
