import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ALIASES, parseMeal, parsePart, resolveGrams, searchFoods, estimateMeal, estimatePart, recalculate } from '../../public/js/food-parser.js';

const { foods, license, source } = JSON.parse(readFileSync(new URL('../../public/data/bls.min.json', import.meta.url), 'utf8'));
const sources = { foods, ownFoods: [] };

test('BLS-Datei enthält Quelle, Lizenz und erwartete Größe', () => {
  assert.equal(license, 'CC BY 4.0');
  assert.match(source, /Max Rubner-Institut/);
  assert.ok(foods.length > 7000);
});

test('Jeder Alias zeigt auf einen vorhandenen BLS-Eintrag', () => {
  const names = new Set(foods.map(f => f[0]));
  for (const [k, v] of Object.entries(ALIASES)) assert.ok(names.has(v), `${k} → ${v}`);
});

test('Text wird in Teile mit Menge und Einheit zerlegt', () => {
  const parts = parseMeal('2 Fladenbrot mit Pesto und 4 Scheiben Salami');
  assert.deepEqual(parts.map(p => [p.qty, p.unit, p.query]), [[2, null, 'Fladenbrot'], [null, null, 'Pesto'], [4, 'scheibe', 'Salami']]);
});

test('Mengenangaben in vielen Formen', () => {
  const cases = [
    ['250g Skyr', 250, 'g', 'Skyr'], ['Skyr 250 g', 250, 'g', 'Skyr'], ['0,5 l Milch', 0.5, 'l', 'Milch'],
    ['ein Apfel', 1, null, 'Apfel'], ['zwei Eier', 2, null, 'Eier'], ['1/2 Banane', 0.5, null, 'Banane'],
    ['2 EL Pesto', 2, 'el', 'Pesto'], ['1 Teller Rigatoni', 1, 'teller', 'Rigatoni']
  ];
  for (const [text, qty, unit, query] of cases) {
    const p = parsePart(text);
    assert.deepEqual([p.qty, p.unit, p.query], [qty, unit, query], text);
  }
});

test('Vage Mengen werden erkannt und halbiert', () => {
  const p = parsePart('bisschen Hähnchenfleisch');
  assert.equal(p.vague, true);
  assert.equal(p.query, 'Hähnchenfleisch');
  assert.equal(resolveGrams(p).grams, 75);
});

test('Gramm-Umrechnung nach Einheit und Lebensmittel', () => {
  assert.equal(resolveGrams(parsePart('4 Scheiben Salami')).grams, 40);
  assert.equal(resolveGrams(parsePart('2 Fladenbrot')).grams, 300);
  assert.equal(resolveGrams(parsePart('Pesto')).grams, 15);
  assert.equal(resolveGrams(parsePart('0,5 l Milch')).ml, 500);
});

test('Suche trifft sinnvolle Einträge, auch ohne Alias', () => {
  assert.equal(searchFoods('Olivenöl', foods)[0][0], 'Olivenöl');
  assert.match(searchFoods('Croissant', foods)[0][0], /^Croissant/);
  assert.match(searchFoods('Avocado', foods)[0][0], /^Avocado roh/);
  assert.deepEqual(searchFoods('Knoppers', foods), []);
});

test('Beispielmahlzeit ergibt plausible Werte', () => {
  const items = estimateMeal('2 Fladenbrot mit Pesto und 4 Scheiben Salami', sources);
  assert.equal(items.length, 3);
  assert.deepEqual(items.map(i => i.blsName), ['Weizenfladenbrot', 'Pesto verde', 'Salami']);
  const k = items.reduce((a, i) => a + i.kcal, 0);
  assert.ok(k > 800 && k < 1100, String(k));
});

test('Unbekanntes wird als nicht gefunden markiert statt geraten', () => {
  const [it] = estimateMeal('2 Knoppers', sources);
  assert.equal(it.notFound, true);
  assert.equal(it.kcal, null);
});

test('Eigene Lebensmittel haben Vorrang und rechnen pro Portion', () => {
  const ownFoods = [{ name: 'Fladenbrot', kcal: 360, protein: 12, grams: 150, unit: 'Stück' }, { name: 'Whey', aliases: ['Proteinshake'], kcal: 116, protein: 25, grams: 30, unit: 'Scoop' }];
  const [a] = estimateMeal('2 Fladenbrot', { foods, ownFoods });
  assert.equal(a.source, 'own');
  assert.equal(a.kcal, 720);
  assert.equal(a.n, 2);
  const [b] = estimateMeal('60 g Whey', { foods, ownFoods });
  assert.equal(b.kcal, 232);
  assert.equal(b.protein, 50);
  const [c] = estimateMeal('1 Proteinshake', { foods, ownFoods });
  assert.equal(c.protein, 25);
});

test('Eigene Lebensmittel treffen nur ganze Wörter', () => {
  const ownFoods = [{ name: 'Fladenbrot klein', kcal: 360, protein: 12, unit: 'Stück' }];
  assert.equal(estimateMeal('1 Ei', { foods, ownFoods })[0].source, 'bls');
  assert.equal(estimateMeal('Fladenbrot', { foods, ownFoods })[0].source, 'own');
});

test('Genauer Treffer gewinnt gegen längere Namen', () => {
  const ownFoods = [
    { name: 'Fladenbrot arabisch', aliases: ['libanesisches Fladenbrot'], kcal: 225, protein: 8, unit: 'Stück' },
    { name: 'Fladenbrot klein', aliases: ['Fladenbrot'], kcal: 360, protein: 12, unit: 'Stück' }
  ];
  assert.equal(estimateMeal('Fladenbrot', { foods, ownFoods })[0].kcal, 360);
  assert.equal(estimateMeal('Fladenbrot arabisch', { foods, ownFoods })[0].kcal, 225);
  assert.equal(estimateMeal('libanesisches Fladenbrot', { foods, ownFoods })[0].kcal, 225);
});

test('Vorschau: anderer Treffer und andere Menge rechnen neu', () => {
  const it = estimatePart(parsePart('100 g Reis'), sources);
  const more = recalculate(it, { grams: 200 });
  assert.equal(more.kcal, it.kcal * 2);
  assert.equal(more.amount, '200 g');
  const other = recalculate(it, { candidate: ['Test', 400, 10] });
  assert.equal(other.kcal, 400);
  assert.equal(other.protein, 10);
});

test('Getränke behalten ihre Menge in ml', () => {
  const [it] = estimateMeal('500 ml Wasser', sources);
  assert.equal(it.blsName, 'Trinkwasser');
  assert.equal(it.ml, 500);
  assert.equal(it.kcal, 0);
});

test('Mehrzahl und übliche Portionen', () => {
  assert.match(estimateMeal('4 Scheiben Salami', sources)[0].amount, /^4 Scheiben/);
  assert.match(estimateMeal('1 Scheibe Salami', sources)[0].amount, /^1 Scheibe,/);
  assert.equal(resolveGrams(parsePart('Nüsse')).grams, 30);
});

test('Leere Eingabe ergibt nichts', () => {
  assert.deepEqual(parseMeal('  , und '), []);
});
