import { requireMember, send } from './_lib/firebase-admin.js';

// Barcode-Abfrage bei Open Food Facts (ODbL). Der Proxy ist nötig, weil Open Food Facts
// einen eigenen User-Agent verlangt und Browser den nicht setzen können.
export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Methode nicht erlaubt.' });
  const user = await requireMember(req, res);
  if (!user) return;

  const ean = String(req.query.ean || '');
  if (!/^\d{8,14}$/.test(ean)) return send(res, 400, { error: 'Ungültiger Barcode.' });

  const contact = process.env.OFF_CONTACT;
  if (!contact) return send(res, 503, { error: 'Barcode-Suche ist nicht eingerichtet.' });

  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${ean}.json?fields=product_name,product_name_de,brands,nutriments,serving_quantity`;
    const r = await fetch(url, { headers: { 'User-Agent': `BodyTracking/1.0 (${contact})` }, signal: AbortSignal.timeout(8000) });
    if (r.status === 404) return send(res, 404, { error: 'Produkt nicht gefunden.' });
    if (!r.ok) return send(res, 502, { error: 'Open Food Facts ist gerade nicht erreichbar.' });
    const data = await r.json();
    if (data.status !== 1 || !data.product) return send(res, 404, { error: 'Produkt nicht gefunden.' });

    const p = data.product, n = p.nutriments || {};
    const number = v => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    return send(res, 200, {
      name: String(p.product_name_de || p.product_name || 'Unbekanntes Produkt').slice(0, 60),
      kcal100: number(n['energy-kcal_100g']),
      protein100: number(n.proteins_100g),
      servingG: number(p.serving_quantity)
    });
  } catch (e) {
    console.error('Open Food Facts nicht erreichbar', e);
    return send(res, 502, { error: 'Open Food Facts ist gerade nicht erreichbar.' });
  }
}
