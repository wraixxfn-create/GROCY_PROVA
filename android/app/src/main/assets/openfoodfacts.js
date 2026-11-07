/*
 * Ricerca gratuita e senza chiavi API su Open Food Facts (https://it.openfoodfacts.org).
 * Chiamata direttamente dal telefono (via HTTPS nativo nell'APK o fetch nel browser),
 * senza alcun server intermedio. Se non c'è rete o il servizio non risponde entro
 * pochi secondi, l'app prosegue in automatico col solo riconoscimento locale.
 */
(function (root) {
  'use strict';

  const BASE_IT = 'https://it.openfoodfacts.org';
  const FIELDS = 'code,product_name,product_name_it,generic_name,generic_name_it,brands,categories,categories_tags,quantity';
  const TIMEOUT_MS = 4200;

  let reqSeq = 0;
  const pendingNative = new Map();

  if (typeof root !== 'undefined') {
    root.onNativeHttp = (reqId, ok, payload) => {
      const entry = pendingNative.get(reqId);
      if (!entry) return;
      pendingNative.delete(reqId);
      clearTimeout(entry.timer);
      if (ok) entry.resolve(payload);
      else entry.reject(new Error(payload || 'Richiesta di rete non riuscita.'));
    };
  }

  function getRecognize() {
    if (root && root.GrocyRecognize) return root.GrocyRecognize;
    if (typeof require === 'function') {
      try { return require('./recognize.js'); } catch (e) { return null; }
    }
    return null;
  }

  async function getJson(url, options) {
    const opts = options || {};
    const timeout = opts.timeout || TIMEOUT_MS;

    if (typeof opts.fetch === 'function') {
      const res = await opts.fetch(url);
      if (!res || !res.ok) throw new Error('Risposta non valida');
      return res.json();
    }

    if (root && root.Android && typeof root.Android.fetchJson === 'function') {
      const reqId = 'off_' + (++reqSeq) + '_' + Date.now();
      const raw = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingNative.delete(reqId);
          reject(new Error('Timeout Open Food Facts'));
        }, timeout);
        pendingNative.set(reqId, { resolve, reject, timer });
        try {
          root.Android.fetchJson(reqId, url);
        } catch (err) {
          clearTimeout(timer);
          pendingNative.delete(reqId);
          reject(err);
        }
      });
      return JSON.parse(raw);
    }

    if (typeof fetch !== 'function') throw new Error('Rete non disponibile');
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: ctrl ? ctrl.signal : undefined
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  const TAG_RULES = [
    ['Surgelati', /(frozen|ice-creams|sorbets|surgelat|gelat)/i],
    ['Latticini e uova', /(dairies|milks|yogurts|fermented-milk|cheeses|butters|creams|eggs|latticini|formaggi|yogurt|uova)/i],
    ['Conserve', /(canned|sauces|tomato-sauces|pestos|condiments|olive-oils|vegetable-oils|fats|vinegars|spreads|jams|marmalades|honeys|pickles|broths|spices|salts|sugars|conserve|passate|sughi)/i],
    ['Carne e pesce', /(meats|poultry|beef|pork|prepared-meats|cured-meats|hams|sausages|salamis|fishes|seafood|tunas|salmons|anchovies|mackerels|sardines|crustaceans|carni|salumi|pesci)/i],
    ['Pasta e cereali', /(pastas|cereals|breads|flours|rices|biscuits|cakes|pastries|crackers|pizzas|gnocchi|tortellini|ravioli|snacks|wafers|rusks|taralli)/i],
    ['Bevande', /(beverages|waters|sodas|carbonated-drinks|juices|nectars|teas|coffees|plant-based-beverages|beers|wines|drinks|bevande|succhi)/i],
    ['Verdura e frutta', /(fresh-vegetables|fresh-fruits|fruits|vegetables|salads|mushrooms|citrus|apples|bananas|tomatoes|potatoes|frutta|verdura|ortaggi)/i]
  ];

  function mapOffCategory(tags, categoriesText, nameText) {
    const tagList = Array.isArray(tags) ? tags.join(' ') : String(tags || '');
    for (const [category, pattern] of TAG_RULES) {
      if (pattern.test(tagList)) return category;
    }
    const R = getRecognize();
    if (R) {
      const fromText = R.categoryOf([categoriesText || '', nameText || ''].join(' '));
      if (fromText && fromText !== 'Altro') return fromText;
    }
    return 'Altro';
  }

  function cleanBrand(raw) {
    if (!raw) return '';
    const first = String(raw).split(',')[0].trim();
    if (!first) return '';
    const R = getRecognize();
    return R ? R.brandCase(first) : first;
  }

  function normalizeProduct(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const R = getRecognize();
    const rawName = (raw.product_name_it || raw.product_name || raw.generic_name_it || raw.generic_name || '').trim();
    const brand = cleanBrand(raw.brands);
    if (!rawName && !brand) return null;
    let name = rawName ? rawName.replace(/\s+/g, ' ').trim() : brand;
    if (R && name === name.toUpperCase() && name.length > 2) name = R.smartTitle(name);
    if (name.length > 90) name = name.slice(0, 90).trim();

    const category = mapOffCategory(raw.categories_tags, raw.categories, name + ' ' + (raw.generic_name_it || ''));
    const parsedQty = R && raw.quantity ? R.pickQuantity('PESO NETTO ' + raw.quantity) : null;
    const tagsJoined = Array.isArray(raw.categories_tags) ? raw.categories_tags.join(' ') : '';
    const extraText = [name, raw.categories || '', tagsJoined.includes('uht') ? 'UHT' : '', tagsJoined.includes('canned') ? 'SCATOLA' : ''].join(' ');
    const location = R ? R.locationOf(category, extraText) : 'Dispensa';

    return {
      name,
      brand,
      barcode: String(raw.code || '').replace(/\s/g, ''),
      category,
      location,
      qty: parsedQty ? parsedQty.qty : null,
      unit: parsedQty ? parsedQty.unit : '',
      source: 'openfoodfacts'
    };
  }

  async function lookupBarcode(barcode, options) {
    const clean = String(barcode || '').replace(/\s/g, '');
    if (!/^\d{8,14}$/.test(clean)) return null;
    const url = `${BASE_IT}/api/v2/product/${encodeURIComponent(clean)}.json?fields=${FIELDS}`;
    const data = await getJson(url, options);
    if (!data || data.status !== 1 || !data.product) return null;
    return normalizeProduct({ ...data.product, code: data.code || clean });
  }

  async function searchProducts(query, options) {
    const q = String(query || '').replace(/\s+/g, ' ').trim();
    if (q.length < 2) return [];
    const url = `${BASE_IT}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=6&fields=${FIELDS}`;
    const data = await getJson(url, options);
    if (!data || !Array.isArray(data.products)) return [];
    const seen = new Set();
    const out = [];
    for (const raw of data.products) {
      const item = normalizeProduct(raw);
      if (!item || !item.name) continue;
      const key = (item.name + '|' + item.brand).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
      if (out.length >= 5) break;
    }
    return out;
  }

  // Arricchisce il segnale locale (dalle 2 foto) usando Open Food Facts, senza mai bloccare in caso di assenza rete.
  async function enrich(signal, options) {
    const opts = options || {};
    if (opts.enabled === false) return { match: null, suggestions: [], online: false };
    const R = getRecognize();

    try {
      // 1) Se c'è un codice a barre letto da una delle foto, la corrispondenza è esatta.
      if (signal && signal.barcode) {
        const exact = await lookupBarcode(signal.barcode, opts);
        if (exact) {
          return { match: exact, suggestions: [exact], online: true };
        }
      }

      // 2) Altrimenti cerca con le parole lette sul fronte della confezione.
      const query = R ? R.searchQueryOf(signal) : (signal && signal.name) || '';
      if (!query || query.length < 3) return { match: null, suggestions: [], online: true };

      const candidates = await searchProducts(query, opts);
      if (!candidates.length) return { match: null, suggestions: [], online: true };

      if (R) {
        const refText = [signal.brand || '', signal.name || '', (signal.keywords || []).slice(0, 4).join(' ')].join(' ').trim();
        for (const c of candidates) {
          const full = [c.brand, c.name].filter(Boolean).join(' ');
          const simName = signal.name ? R.similarity(signal.name, c.name) : 0;
          const simFull = R.similarity(refText, full);
          const brandHit = signal.brand && c.brand && c.brand.toUpperCase().includes(signal.brand.toUpperCase()) ? 0.2 : 0;
          c.score = Math.min(1, Math.max(simName, simFull) + brandHit);
        }
        candidates.sort((a, b) => (b.score || 0) - (a.score || 0));
      }

      const best = candidates[0];
      const confident = best && (best.score === undefined || best.score >= 0.55);
      return {
        match: confident ? best : null,
        suggestions: candidates.slice(0, 4),
        online: true
      };
    } catch (e) {
      return { match: null, suggestions: [], online: false };
    }
  }

  const api = {
    mapOffCategory,
    normalizeProduct,
    lookupBarcode,
    searchProducts,
    enrich
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GrocyOff = api;
})(typeof window !== 'undefined' ? window : globalThis);
