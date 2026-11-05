// Bricht das Deployment ab, wenn persönliche Daten oder Reste der alten App ausgeliefert würden.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MARKERS = [/var SEED\b/, /seed-v[12]/, /window\.claude/, /FOOD_FACTS/, /seed2026\d+/, /manual20261102/];
const roots = ['public', 'api'];
const files = [];
const walk = dir => readdirSync(dir).forEach(name => {
  const p = join(dir, name);
  if (statSync(p).isDirectory()) walk(p); else files.push(p);
});
roots.filter(existsSync).forEach(walk);

// Lokal zusätzlich: Eintrags-IDs aus den echten Daten dürfen nirgends auftauchen.
const ids = [];
if (existsSync('private/seed.json')) {
  const seed = JSON.parse(readFileSync('private/seed.json', 'utf8'));
  Object.values(seed.f || {}).forEach(d => (d.items || []).forEach(it => it.id && ids.push(it.id)));
}

let bad = 0;
for (const f of files) {
  if (f.endsWith('bls.min.json')) continue;
  const text = readFileSync(f, 'utf8');
  for (const m of MARKERS) if (m.test(text)) { console.error(`${f}: ${m}`); bad++; }
  for (const id of ids) if (text.includes(id)) { console.error(`${f}: Eintrags-ID ${id}`); bad++; }
}
if (bad) { console.error(`${bad} Treffer, Abbruch.`); process.exit(1); }
console.log(`${files.length} Dateien geprüft, keine persönlichen Daten gefunden.`);
