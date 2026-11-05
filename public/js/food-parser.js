// Schätzt Kalorien und Eiweiß aus deutschem Freitext, ohne KI: Text zerlegen,
// dann in „Meine Lebensmittel“ und im Bundeslebensmittelschlüssel (BLS) suchen.
// Ergebnisse sind Schätzungen und landen immer erst in der bearbeitbaren Vorschau.

const NUMBER_WORDS = {
  ein: 1, eine: 1, einen: 1, einem: 1, einer: 1, eins: 1, zwei: 2, drei: 3, vier: 4, fünf: 5,
  sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, halb: 0.5, halbe: 0.5, halber: 0.5, halbes: 0.5,
  halben: 0.5, anderthalb: 1.5
};

// Einheit (Einzahl und Mehrzahl) → Schlüssel
const UNIT_WORDS = {
  g: 'g', gr: 'g', gramm: 'g', kg: 'kg', kilo: 'kg', ml: 'ml', cl: 'cl', l: 'l', liter: 'l',
  scheibe: 'scheibe', scheiben: 'scheibe', stück: 'stueck', stücke: 'stueck', stk: 'stueck',
  el: 'el', esslöffel: 'el', tl: 'tl', teelöffel: 'tl', scoop: 'scoop', scoops: 'scoop', messlöffel: 'scoop',
  portion: 'portion', portionen: 'portion', teller: 'teller', schüssel: 'schuessel', schüsseln: 'schuessel',
  glas: 'glas', gläser: 'glas', becher: 'becher', flasche: 'flasche', flaschen: 'flasche', dose: 'dose', dosen: 'dose',
  tasse: 'tasse', tassen: 'tasse', handvoll: 'handvoll', hand: 'handvoll', riegel: 'riegel', kelle: 'kelle', kellen: 'kelle',
  packung: 'packung', packungen: 'packung', pck: 'packung'
};
const UNIT_GRAMS = { el: 15, tl: 5, scoop: 30, portion: 250, teller: 300, schuessel: 300, glas: 250, becher: 200, flasche: 500, dose: 150, tasse: 200, handvoll: 30, riegel: 50, kelle: 45, packung: 250, scheibe: 25 };
const UNIT_LABEL = { el: 'EL', tl: 'TL', scoop: 'Scoop', portion: 'Portion', teller: 'Teller', schuessel: 'Schüssel', glas: 'Glas', becher: 'Becher', flasche: 'Flasche', dose: 'Dose', tasse: 'Tasse', handvoll: 'Handvoll', riegel: 'Riegel', kelle: 'Kelle', packung: 'Packung', scheibe: 'Scheibe', stueck: 'Stück' };

const UNIT_PLURAL = { portion: 'Portionen', schuessel: 'Schüsseln', glas: 'Gläser', flasche: 'Flaschen', dose: 'Dosen', tasse: 'Tassen', kelle: 'Kellen', packung: 'Packungen', scheibe: 'Scheiben' };
const unitLabel = (unit, q) => (q > 1 && UNIT_PLURAL[unit]) || UNIT_LABEL[unit];

const VAGUE = /\b(ein\s+)?(bisschen|bißchen|etwas|wenig|kleine?s?|kleinen|kleiner)\b/i;
const FILLER = /\b(ca\.?|circa|etwa|ungefähr|gebraten|von|vom|der|die|das|dem|den|des|große?[nrs]?|normale?[nrs]?|ganze?[nrs]?|oben|drauf|dazu|noch)\b/gi;

// Häufige Wörter und der passende, ausdrücklich gewählte BLS-Eintrag.
// Ein Test prüft, dass alle Namen im BLS existieren.
export const ALIASES = {
  ei: 'Hühnerei gekocht', eier: 'Hühnerei gekocht', spiegelei: 'Hühnerei gebacken', rührei: 'Hühnerei gebacken',
  nudeln: 'Teigwaren eifrei, gekocht', nudel: 'Teigwaren eifrei, gekocht', pasta: 'Teigwaren eifrei, gekocht', rigatoni: 'Teigwaren eifrei, gekocht', spaghetti: 'Teigwaren eifrei, gekocht', penne: 'Teigwaren eifrei, gekocht', fusilli: 'Teigwaren eifrei, gekocht',
  reis: 'Reis poliert, gekocht',
  hähnchen: 'Hähnchen Brustfilet, gegrillt', hähnchenfleisch: 'Hähnchen Brustfilet, gegrillt', hähnchenbrust: 'Hähnchen Brustfilet, gegrillt', hühnchen: 'Hähnchen Brustfilet, gegrillt', chicken: 'Hähnchen Brustfilet, gegrillt',
  hack: 'Rind Hackfleisch, gekocht', hackfleisch: 'Rind Hackfleisch, gekocht',
  fladenbrot: 'Weizenfladenbrot', brot: 'Roggenmischbrot', weißbrot: 'Weizenbrot/Weißbrot', toast: 'Weizenmischtoastbrot', toastbrot: 'Weizenmischtoastbrot', brötchen: 'Weizenbrötchen',
  milch: 'H-Vollmilch 3,5 % Fett, ultrahocherhitzt', magerquark: 'Speisequark Magerstufe, Magerquark < 10 % Fett i. Tr.', quark: 'Speisequark Magerstufe, Magerquark < 10 % Fett i. Tr.', skyr: 'Skyr, Frischkäse < 10 % Fett i. Tr.',
  gouda: 'Gouda 48 % Fett i. Tr.', käse: 'Gouda 48 % Fett i. Tr.', butterkäse: 'Gouda 48 % Fett i. Tr.',
  butter: 'Süßrahmbutter', öl: 'Sonnenblumenöl', pesto: 'Pesto verde', salami: 'Salami', olivenöl: 'Olivenöl',
  haferflocken: 'Hafer Flocken', hafer: 'Hafer Flocken', apfel: 'Apfel roh', äpfel: 'Apfel roh', banane: 'Banane roh', bananen: 'Banane roh',
  tomate: 'Tomate roh', tomaten: 'Tomate roh', gurke: 'Gurke roh', spinat: 'Spinat gedünstet', erbsen: 'Grüne Erbsen gedünstet',
  pommes: 'Pommes frites', kaffee: 'Kaffee (Getränk)', cola: 'Colagetränk koffeinhaltig', wasser: 'Trinkwasser', sprudel: 'Trinkwasser', schokolade: 'Schokolade',
  hafermilch: 'Haferdrink ungesüßt', haferdrink: 'Haferdrink ungesüßt', nüsse: 'Haselnuss', nussmischung: 'Haselnuss', nussmix: 'Haselnuss',
  thunfisch: 'Thunfisch im eigenen Saft, Konserve, abgetropft', lachs: 'Lachs gegrillt', pute: 'Pute Brust, ohne Haut, roh', erdnussbutter: 'Erdnussbutter/Erdnusscreme'
};

// Gramm pro Stück bzw. pro Scheibe für bekannte Lebensmittel
const PIECE_G = { ei: 55, eier: 55, spiegelei: 55, banane: 120, bananen: 120, apfel: 150, äpfel: 150, fladenbrot: 150, brötchen: 60, croissant: 50, toast: 30, tomate: 80, tomaten: 80, döner: 350 };
const SLICE_G = { salami: 10, gouda: 25, käse: 25, butterkäse: 25, brot: 45, toast: 30, toastbrot: 30, schinken: 20, wurst: 15 };
const PORTION_G = { pesto: 15, butter: 10, öl: 10, olivenöl: 10, soße: 30, sauce: 30, salami: 20, käse: 25, gouda: 25, butterkäse: 25, nudeln: 250, rigatoni: 250, pasta: 250, spaghetti: 250, penne: 250, reis: 200, spinat: 100, skyr: 250, quark: 250, milch: 250, kaffee: 200, cola: 330, haferflocken: 50, ei: 55, eier: 55, fladenbrot: 150, brötchen: 60, hähnchen: 150, hähnchenfleisch: 150, hack: 100, hackfleisch: 100, thunfisch: 120, döner: 350, schokolade: 25, nüsse: 30, nuss: 30, nussmischung: 30, mandeln: 30, walnüsse: 30, cashews: 30, erdnüsse: 30 };

function parseQty(tok) {
  if (!tok) return null;
  const low = tok.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(NUMBER_WORDS, low)) return NUMBER_WORDS[low];
  const frac = low.match(/^(\d+)\/(\d+)$/);
  if (frac && Number(frac[2])) return Number(frac[1]) / Number(frac[2]);
  if (/^\d+([.,]\d+)?$/.test(low)) return Number(low.replace(',', '.'));
  return null;
}

// „250g“ → „250 g“, sonst bleibt die Reihenfolge gleich
function spaceUnits(s) { return s.replace(/(\d)\s*(g|gr|kg|ml|cl|l)\b/gi, '$1 $2'); }

export function parsePart(raw) {
  let text = spaceUnits(String(raw).replace(/\([^)]*\)/g, ' ').trim());
  const vague = VAGUE.test(text);
  if (vague) text = text.replace(new RegExp(VAGUE.source, 'gi'), ' ');
  let tokens = text.split(/\s+/).filter(Boolean);
  let qty = null, unit = null;

  const take = list => {
    if (list.length && parseQty(list[0]) !== null) qty = parseQty(list.shift());
    if (list.length > 1 && UNIT_WORDS[list[0].toLowerCase()]) unit = UNIT_WORDS[list.shift().toLowerCase()];
    return list;
  };
  tokens = take(tokens);
  // Nachgestellte Menge: „Skyr 250 g“
  if (qty === null && unit === null && tokens.length >= 3) {
    const u = UNIT_WORDS[tokens[tokens.length - 1].toLowerCase()], q = parseQty(tokens[tokens.length - 2]);
    if (u && q !== null) { qty = q; unit = u; tokens = tokens.slice(0, -2); }
  }
  const query = tokens.join(' ').replace(FILLER, ' ').replace(/[.:!?]+$/, '').replace(/\s+/g, ' ').trim();
  return { raw: String(raw).trim(), qty, unit, query, vague };
}

export function parseMeal(text) {
  return String(text || '')
    .split(/[,;+&\n]|\b(?:und|mit)\b/i)
    .map(s => s.trim())
    .filter(Boolean)
    .map(parsePart)
    .filter(p => p.query);
}

function lookupTable(table, query) {
  const low = query.toLowerCase();
  if (table[low] !== undefined) return table[low];
  const hit = low.split(' ').reverse().find(w => table[w] !== undefined);
  return hit ? table[hit] : null;
}

// Rechnet Menge und Einheit in Gramm um. `assumed` kennzeichnet geschätzte Mengen.
export function resolveGrams(part) {
  const { qty, unit, query, vague } = part, q = qty ?? 1;
  const factor = vague ? 0.5 : 1;
  if (unit === 'g') return { grams: q, assumed: false };
  if (unit === 'kg') return { grams: q * 1000, assumed: false };
  if (unit === 'ml') return { grams: q, assumed: false, ml: q };
  if (unit === 'cl') return { grams: q * 10, assumed: false, ml: q * 10 };
  if (unit === 'l') return { grams: q * 1000, assumed: false, ml: q * 1000 };
  if (unit === 'scheibe') return { grams: q * (lookupTable(SLICE_G, query) ?? UNIT_GRAMS.scheibe) * factor, assumed: true };
  if (unit === 'stueck') return { grams: q * (lookupTable(PIECE_G, query) ?? 100) * factor, assumed: true };
  if (unit) {
    const g = q * UNIT_GRAMS[unit] * factor;
    return { grams: g, assumed: true, ml: ['glas', 'flasche', 'tasse'].includes(unit) ? g : undefined };
  }
  if (qty !== null) return { grams: q * (lookupTable(PIECE_G, query) ?? lookupTable(PORTION_G, query) ?? 100) * factor, assumed: true };
  return { grams: (lookupTable(PORTION_G, query) ?? 100) * factor, assumed: true };
}

export function normalizeFood(s) { return String(s).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim(); }
function stems(word) {
  const out = [word];
  for (const end of ['en', 'er', 'n', 'e', 's']) if (word.length > end.length + 3 && word.endsWith(end)) out.push(word.slice(0, -end.length));
  return out;
}

// Sucht im BLS. Liefert die besten Treffer, bevorzugt kurze, zubereitete Einträge.
export function searchFoods(query, foods, limit = 6) {
  const norm = normalizeFood(query);
  if (!norm) return [];
  const words = norm.split(' ');
  const results = [];
  for (const food of foods) {
    const name = normalizeFood(food[0]);
    if (!words.every(w => stems(w).some(s => name.includes(s)))) continue;
    let score = -food[0].length / 3;
    if (name === norm) score += 100;
    if (name.startsWith(norm)) score += 40;
    if (name.split(' ')[0] === words[0]) score += 25;
    if (new RegExp('(^| )' + words[0] + '( |$)', 'u').test(name)) score += 15;
    if (/\b(gekocht|gegart|gebraten|gegrillt|gedünstet|gebacken)\b/.test(name)) score += 6;
    if (/\b(roh|pulver|getrocknet|konserve|tiefgefroren|glutenfrei)\b/.test(name)) score -= 6;
    results.push({ food, score });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit).map(r => r.food);
}

function ownMatch(query, ownFoods) {
  const norm = normalizeFood(query);
  if (!norm) return null;
  // Ganze Wörter vergleichen: „Ei“ darf nicht auf „Fladenbrot klein“ treffen.
  const queryWords = norm.split(' ');
  const hasAll = (needles, hay) => needles.every(w => hay.includes(w));
  let best = null, bestScore = 0;
  for (const f of ownFoods || []) {
    const names = [f.name, ...(Array.isArray(f.aliases) ? f.aliases : [])].map(normalizeFood).filter(Boolean);
    for (const n of names) {
      const nameWords = n.split(' ');
      // Genauer Treffer vor längstem Namen im Text vor kürzestem Namen, der den Text enthält.
      let score = 0;
      if (n === norm) score = 100000;
      else if (hasAll(nameWords, queryWords)) score = 10000 + n.length;
      else if (hasAll(queryWords, nameWords)) score = 1000 - n.length;
      if (score > bestScore) { best = f; bestScore = score; }
    }
  }
  return best;
}

const amountText = (part, grams, assumed) => {
  const { qty, unit } = part;
  if (unit === 'g' || unit === 'kg') return Math.round(grams) + ' g';
  if (unit === 'ml' || unit === 'cl' || unit === 'l') return Math.round(grams) + ' ml';
  const label = unit ? (qty ?? 1).toLocaleString('de-DE') + ' ' + unitLabel(unit, qty ?? 1) + ', ' : (qty !== null ? (qty).toLocaleString('de-DE') + ' Stück, ' : '');
  return label + 'ca. ' + Math.round(grams) + ' g' + (assumed && qty === null && !unit ? ' (angenommen)' : '');
};

function fromOwn(part, f) {
  const { qty, unit } = part, q = qty ?? 1;
  let portions;
  if (['g', 'kg', 'ml', 'cl', 'l'].includes(unit) && f.grams) {
    portions = resolveGrams(part).grams / f.grams;
  } else {
    portions = q * (part.vague ? 0.5 : 1);
  }
  return {
    name: f.name.slice(0, 60),
    amount: (['g', 'kg', 'ml', 'cl', 'l'].includes(unit) ? Math.round(resolveGrams(part).grams) + (unit === 'ml' || unit === 'l' || unit === 'cl' ? ' ml' : ' g') : q.toLocaleString('de-DE') + ' ' + (f.unit || 'Portion')),
    kcal: Math.round(f.kcal * portions),
    protein: Math.round(f.protein * portions),
    n: Number.isInteger(q) && q >= 1 && !unit ? q : undefined,
    source: 'own',
    query: part.query,
    grams: f.grams ? Math.round(f.grams * portions) : null,
    per100: f.grams ? { kcal: f.kcal / f.grams * 100, protein: f.protein / f.grams * 100 } : null,
    candidates: []
  };
}

function fromBls(part, candidates, chosen) {
  const { grams, assumed, ml } = resolveGrams(part);
  const [name, kcal100, prot100] = chosen;
  return {
    name: part.query.charAt(0).toUpperCase() + part.query.slice(1, 60),
    blsName: name,
    amount: amountText(part, grams, assumed),
    kcal: Math.round(kcal100 * grams / 100),
    protein: Math.round(prot100 * grams / 100),
    n: Number.isInteger(part.qty) && part.qty >= 1 && (!part.unit || part.unit === 'stueck') ? part.qty : undefined,
    ml: ml ? Math.round(ml) : undefined,
    source: 'bls',
    query: part.query,
    grams: Math.round(grams),
    per100: { kcal: kcal100, protein: prot100 },
    candidates
  };
}

// Wandelt eine Teil-Eingabe in einen Vorschau-Eintrag um.
export function estimatePart(part, { ownFoods = [], foods = [] } = {}) {
  const own = ownMatch(part.query, ownFoods);
  if (own) return fromOwn(part, own);
  const aliasName = ALIASES[normalizeFood(part.query)];
  const aliasFood = aliasName ? foods.find(f => f[0] === aliasName) : null;
  const found = searchFoods(part.query, foods);
  const candidates = aliasFood ? [aliasFood, ...found.filter(f => f !== aliasFood)].slice(0, 6) : found;
  if (!candidates.length) return { name: part.query.slice(0, 60), query: part.query, amount: '', kcal: null, protein: null, source: 'none', notFound: true, candidates: [] };
  return fromBls(part, candidates, candidates[0]);
}

export function estimateMeal(text, sources) { return parseMeal(text).map(p => estimatePart(p, sources)); }

// Vorschau: anderer BLS-Treffer oder andere Menge.
export function recalculate(item, { candidate, grams } = {}) {
  const out = { ...item };
  if (candidate) { out.blsName = candidate[0]; out.per100 = { kcal: candidate[1], protein: candidate[2] }; out.source = 'bls'; }
  if (grams !== undefined && grams !== null && grams > 0) {
    out.grams = Math.round(grams);
    if (item.ml) { out.ml = Math.round(grams); out.amount = Math.round(grams) + ' ml'; } else out.amount = Math.round(grams) + ' g';
    out.n = undefined;
  }
  if (out.per100 && out.grams) {
    out.kcal = Math.round(out.per100.kcal * out.grams / 100);
    out.protein = Math.round(out.per100.protein * out.grams / 100);
  }
  return out;
}
