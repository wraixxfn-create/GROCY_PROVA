const { test } = require('node:test');
const assert = require('node:assert/strict');
const Off = require('../android/app/src/main/assets/openfoodfacts.js');
const R = require('../android/app/src/main/assets/recognize.js');

test('mappa correttamente le categorie di Open Food Facts nelle categorie italiane', () => {
  assert.equal(Off.mapOffCategory(['en:dairies', 'en:fermented-milk-products', 'en:yogurts'], '', ''), 'Latticini e uova');
  assert.equal(Off.mapOffCategory(['en:frozen-foods', 'en:frozen-vegetables'], '', ''), 'Surgelati');
  assert.equal(Off.mapOffCategory(['en:plant-based-foods', 'en:pastas', 'en:spaghetti'], '', ''), 'Pasta e cereali');
  assert.equal(Off.mapOffCategory(['en:canned-foods', 'en:tomato-sauces'], '', ''), 'Conserve');
  assert.equal(Off.mapOffCategory(['en:seafood', 'en:fishes', 'en:salmons'], '', ''), 'Carne e pesce');
  assert.equal(Off.mapOffCategory(['en:beverages', 'en:fruit-juices'], '', ''), 'Bevande');
  assert.equal(Off.mapOffCategory(['en:fresh-vegetables', 'en:tomatoes'], '', ''), 'Verdura e frutta');
});

test('normalizza un prodotto Open Food Facts con nome italiano, marca, categoria e luogo suggerito', () => {
  const item = Off.normalizeProduct({
    code: '8076800195057',
    product_name: 'Spaghetti N.5',
    product_name_it: 'Spaghetti n.5',
    brands: 'Barilla, Barilla G. e R. Fratelli',
    categories_tags: ['en:cereals-and-potatoes', 'en:pastas'],
    quantity: '500 g'
  });
  assert.equal(item.name, 'Spaghetti n.5');
  assert.equal(item.brand, 'Barilla');
  assert.equal(item.category, 'Pasta e cereali');
  assert.equal(item.location, 'Dispensa');
  assert.equal(item.qty, 500);
  assert.equal(item.unit, 'g');
});

test('arricchisce tramite codice a barre quando presente su una delle due foto', async () => {
  const mockFetch = async url => ({
    ok: true,
    json: async () => ({
      status: 1,
      code: '8001120062017',
      product: {
        product_name_it: 'Mozzarella Santa Lucia',
        brands: 'Galbani',
        categories_tags: ['en:dairies', 'en:cheeses', 'en:mozzarella'],
        quantity: '125 g'
      }
    })
  });
  const signal = R.merge(R.parse('', { role: 'pack' }), R.parse('Scad 18/11/2026', { role: 'expiry' }));
  signal.barcode = '8001120062017';
  const res = await Off.enrich(signal, { fetch: mockFetch });
  assert.equal(res.online, true);
  assert.ok(res.match);
  assert.equal(res.match.name, 'Mozzarella Santa Lucia');
  assert.equal(res.match.category, 'Latticini e uova');
  assert.equal(res.match.location, 'Frigorifero');
});

test('cerca per testo dal fronte della confezione senza codice a barre', async () => {
  const mockFetch = async url => {
    assert.match(url, /search_terms=Mutti%20Passata/i);
    return {
      ok: true,
      json: async () => ({
        products: [
          {
            code: '8005110000102',
            product_name_it: 'Passata di pomodoro',
            brands: 'Mutti',
            categories_tags: ['en:canned-foods', 'en:tomato-sauces'],
            quantity: '700 g'
          },
          {
            code: '8005110000999',
            product_name_it: 'Polpa di pomodoro in finissimi pezzi',
            brands: 'Mutti',
            categories_tags: ['en:canned-foods'],
            quantity: '400 g'
          }
        ]
      })
    };
  };
  const pack = R.parse('PASSATA\nMUTTI S.p.A.', { role: 'pack' });
  const res = await Off.enrich(pack, { fetch: mockFetch });
  assert.equal(res.online, true);
  assert.ok(res.match);
  assert.equal(res.match.name, 'Passata di pomodoro');
  assert.equal(res.match.category, 'Conserve');
  assert.equal(res.suggestions.length, 2);
});

test('se non c’è internet non fallisce e lascia lavorare il riconoscimento locale', async () => {
  const failingFetch = async () => { throw new Error('Network unreachable'); };
  const pack = R.parse('YOGURT GRECO\n500 g', { role: 'pack' });
  const res = await Off.enrich(pack, { fetch: failingFetch });
  assert.equal(res.online, false);
  assert.equal(res.match, null);
  assert.deepEqual(res.suggestions, []);
});
