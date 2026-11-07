(function (root) {
  'use strict';
  const CATEGORIES = ['Verdura e frutta', 'Latticini e uova', 'Pasta e cereali', 'Carne e pesce', 'Conserve', 'Bevande', 'Surgelati', 'Altro'];
  const LOCATIONS = ['Dispensa', 'Frigorifero', 'Congelatore'];
  const UNITS = ['pz', 'kg', 'g', 'l', 'ml', 'conf'];
  const THUMB_RE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

  const id = () => 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const today = () => localDate(new Date());
  function localDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function validDate(s) { if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const d = new Date(s + 'T12:00:00'); return !isNaN(d) && localDate(d) === s; }
  function days(date, now = today()) { return date ? Math.round((Date.parse(date + 'T12:00:00Z') - Date.parse(now + 'T12:00:00Z')) / 86400000) : Infinity; }
  function blank() {
    return {
      format: 'grocy-locale',
      version: 1,
      products: [],
      shopping: [],
      history: [],
      catalog: [],
      settings: { warningDays: 3, onlineLookup: true },
      updatedAt: new Date().toISOString()
    };
  }
  function text(s, max = 120) { if (typeof s !== 'string' || s.length > max) throw new Error('Testo non valido nel backup.'); return s; }
  function quantity(n, positive = false) { if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 999999 || (positive && n === 0)) throw new Error('Quantità non valida.'); return n; }

  function scanInfo(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.keywords)) return null;
    const keywords = raw.keywords.slice(0, 20)
      .map(k => typeof k === 'string' ? k.toUpperCase().replace(/[^A-ZÀ-Ý0-9'’. -]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 20) : '')
      .filter(k => k.length >= 3);
    if (!keywords.length) return null;
    const scan = { keywords };
    if (typeof raw.at === 'string' && Number.isFinite(Date.parse(raw.at))) scan.at = raw.at;
    return scan;
  }

  function thumbInfo(raw) {
    if (!raw) return '';
    if (typeof raw !== 'string' || raw.length > 65000 || !THUMB_RE.test(raw)) {
      throw new Error('Miniatura non valida nel backup.');
    }
    return raw;
  }

  function catalogEntry(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.name !== 'string' || !raw.name.trim()) return null;
    const name = raw.name.trim().slice(0, 120);
    const category = CATEGORIES.includes(raw.category) ? raw.category : 'Altro';
    const location = LOCATIONS.includes(raw.location) ? raw.location : 'Dispensa';
    const unit = UNITS.includes(raw.unit) ? raw.unit : 'pz';
    const barcode = typeof raw.barcode === 'string' ? raw.barcode.trim().slice(0, 80) : '';
    const scan = scanInfo({ keywords: Array.isArray(raw.keywords) ? raw.keywords : [] });
    return {
      name,
      category,
      location,
      unit,
      barcode,
      keywords: scan ? scan.keywords : [],
      at: (typeof raw.at === 'string' && Number.isFinite(Date.parse(raw.at))) ? raw.at : new Date().toISOString()
    };
  }

  function validate(s) {
    if (!s || s.format !== 'grocy-locale' || s.version !== 1 || !Array.isArray(s.products) || !Array.isArray(s.shopping) || !Array.isArray(s.history) || s.products.length > 5000 || s.shopping.length > 5000 || s.history.length > 200) {
      throw new Error('Questo non è un backup Grocy Locale v1 valido.');
    }
    const result = blank(), ids = new Set();
    function checkId(v) {
      text(v, 80);
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(v) || ids.has(v)) throw new Error('Identificativi duplicati o non validi.');
      ids.add(v);
      return v;
    }
    result.products = s.products.map(p => {
      if (!p || !text(p.name).trim() || !CATEGORIES.includes(p.category) || !LOCATIONS.includes(p.location) || !UNITS.includes(p.unit) || (p.expiry && !validDate(p.expiry)) || (p.production && !validDate(p.production))) {
        throw new Error('Prodotto non valido nel backup.');
      }
      const product = {
        id: checkId(p.id),
        name: p.name.trim(),
        qty: quantity(p.qty),
        min: quantity(p.min),
        unit: p.unit,
        category: p.category,
        location: p.location,
        expiry: text(p.expiry, 10),
        production: typeof p.production === 'string' ? text(p.production, 10) : '',
        barcode: text(p.barcode, 80),
        notes: text(p.notes, 1000)
      };
      const scan = scanInfo(p.scan);
      if (scan) product.scan = scan;
      const thumb = thumbInfo(p.thumb);
      if (thumb) product.thumb = thumb;
      return product;
    });
    result.shopping = s.shopping.map(p => {
      if (!p || !text(p.name).trim() || !UNITS.includes(p.unit) || typeof p.done !== 'boolean') throw new Error('Lista della spesa non valida.');
      return { id: checkId(p.id), name: p.name.trim(), qty: quantity(p.qty, true), unit: p.unit, done: p.done };
    });
    result.history = s.history.map(h => {
      if (!h || !['add', 'consume', 'edit', 'delete', 'stock'].includes(h.type) || !Number.isFinite(Date.parse(h.at))) throw new Error('Storico non valido.');
      return { name: text(h.name), type: h.type, at: h.at, detail: text(h.detail, 160) };
    });
    if (Array.isArray(s.catalog)) {
      result.catalog = s.catalog.slice(0, 300).map(catalogEntry).filter(Boolean);
    }
    if (!s.settings || ![1, 3, 7, 14].includes(s.settings.warningDays)) throw new Error('Impostazioni non valide.');
    result.settings.warningDays = s.settings.warningDays;
    result.settings.onlineLookup = s.settings.onlineLookup !== false;
    return result;
  }

  function learnCatalog(s, product) {
    if (!s || !product || !product.name) return;
    if (!Array.isArray(s.catalog)) s.catalog = [];
    const normName = product.name.trim().toLocaleLowerCase('it');
    const code = String(product.barcode || '').trim();
    const keywords = (product.scan && Array.isArray(product.scan.keywords)) ? product.scan.keywords.slice(0, 20) : [];
    const idx = s.catalog.findIndex(c => (code && c.barcode === code) || c.name.toLocaleLowerCase('it') === normName);
    const prev = idx >= 0 ? s.catalog[idx] : null;
    const mergedKeywords = (prev && Array.isArray(prev.keywords)) ? prev.keywords.slice() : [];
    for (const kw of keywords) {
      if (!mergedKeywords.includes(kw) && mergedKeywords.length < 20) mergedKeywords.push(kw);
    }
    const entry = {
      name: product.name.trim(),
      category: CATEGORIES.includes(product.category) ? product.category : 'Altro',
      location: LOCATIONS.includes(product.location) ? product.location : 'Dispensa',
      unit: UNITS.includes(product.unit) ? product.unit : 'pz',
      barcode: code || (prev ? prev.barcode : ''),
      keywords: mergedKeywords,
      at: new Date().toISOString()
    };
    if (idx >= 0) s.catalog.splice(idx, 1);
    s.catalog.unshift(entry);
    s.catalog = s.catalog.slice(0, 300);
  }

  function stats(s) {
    const stocked = s.products.filter(p => p.qty > 0);
    return {
      total: s.products.length,
      stocked: stocked.length,
      expired: stocked.filter(p => days(p.expiry) < 0).length,
      expiring: stocked.filter(p => days(p.expiry) >= 0 && days(p.expiry) <= s.settings.warningDays).length,
      low: s.products.filter(p => p.qty < p.min).length,
      shopping: s.shopping.filter(p => !p.done).length
    };
  }

  function changeQuantity(s, productId, delta, type) {
    const p = s.products.find(p => p.id === productId);
    if (!p || !Number.isFinite(delta) || p.qty + delta < -0.000001 || p.qty + delta > 999999) throw new Error('Quantità non disponibile.');
    p.qty = Math.max(0, Math.round((p.qty + delta) * 1000) / 1000);
    log(s, type || (delta < 0 ? 'consume' : 'stock'), p.name, `${delta > 0 ? '+' : ''}${delta} ${p.unit}`);
    return p;
  }

  function log(s, type, name, detail) {
    s.history.unshift({ type, name, detail, at: new Date().toISOString() });
    s.history = s.history.slice(0, 200);
  }

  function addShortages(s) {
    let added = 0;
    s.products.filter(p => p.qty < p.min || p.qty === 0).forEach(p => {
      if (p.min <= 0 && p.qty > 0) return;
      const needed = p.min > p.qty ? Math.round((p.min - p.qty) * 1000) / 1000 : 1;
      if (!s.shopping.some(i => !i.done && i.name.toLocaleLowerCase('it') === p.name.toLocaleLowerCase('it') && i.unit === p.unit)) {
        s.shopping.push({ id: id(), name: p.name, qty: needed, unit: p.unit, done: false });
        added++;
      }
    });
    return added;
  }

  function demo() {
    const s = blank();
    const offset = n => { const d = new Date(); d.setDate(d.getDate() + n); return localDate(d); };
    const rows = [
      ['Yogurt bianco', 2, 4, 'pz', 'Latticini e uova', 'Frigorifero', 2],
      ['Pomodorini', 0.5, 0.3, 'kg', 'Verdura e frutta', 'Frigorifero', 1],
      ['Latte intero', 1, 2, 'l', 'Latticini e uova', 'Frigorifero', 3],
      ['Pasta di semola', 3, 2, 'conf', 'Pasta e cereali', 'Dispensa', 180],
      ['Uova fresche', 6, 4, 'pz', 'Latticini e uova', 'Frigorifero', 9],
      ['Passata di pomodoro', 2, 2, 'pz', 'Conserve', 'Dispensa', 150],
      ['Piselli surgelati', 1, 1, 'conf', 'Surgelati', 'Congelatore', 80],
      ['Riso basmati', 0, 1, 'kg', 'Pasta e cereali', 'Dispensa', 250]
    ];
    s.products = rows.map(([name, qty, min, unit, category, location, expiry]) => ({
      id: id(), name, qty, min, unit, category, location, expiry: offset(expiry), production: '', barcode: '', notes: ''
    }));
    s.shopping = [{ id: id(), name: 'Pane integrale', qty: 1, unit: 'pz', done: false }];
    log(s, 'add', 'La tua dispensa di esempio', 'Dati dimostrativi, modificabili');
    return s;
  }

  const api = { CATEGORIES, LOCATIONS, UNITS, id, today, localDate, validDate, days, blank, validate, learnCatalog, stats, changeQuantity, log, addShortages, demo };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Grocy = api;
})(typeof window !== 'undefined' ? window : globalThis);
