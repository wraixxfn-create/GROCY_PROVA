/*
 * Lettura del testo stampato su confezioni e date di scadenza direttamente sul
 * telefono tramite Tesseract compilato in WebAssembly negli asset locali.
 */
(function (root) {
  'use strict';

  const CORE_SRC = 'vendor/tesseract-core-simd-lstm.wasm.js';
  const DATA_SRC = 'vendor/ita.traineddata.b64.js';
  const LANG = 'ita';
  const DATA_DIR = '/tessdata';
  const IMAGE_PATH = '/input';
  const MAX_SIDE = 1600;

  let ready = null;
  let tess = null;
  let engine = null;
  let failure = '';

  function inject(path) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = path;
      script.async = false;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Asset OCR mancante: ' + path));
      document.head.appendChild(script);
    });
  }

  async function need(name, path) {
    if (typeof root[name] !== 'undefined') return;
    if (typeof document === 'undefined') throw new Error('Asset OCR non caricato: ' + path);
    await inject(path);
    if (typeof root[name] === 'undefined') throw new Error('Asset OCR non valido: ' + path);
  }

  function base64Bytes(text) {
    const clean = String(text).replace(/[^A-Za-z0-9+/=]/g, '');
    const raw = root.atob ? root.atob(clean) : Buffer.from(clean, 'base64').toString('binary');
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function fit(gray, width, height, limit) {
    const longest = Math.max(width, height);
    if (longest <= limit) return { gray, width, height };
    const step = Math.ceil(longest / limit);
    const w = Math.max(1, Math.floor(width / step));
    const h = Math.max(1, Math.floor(height / step));
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0, count = 0;
        const y0 = y * step, x0 = x * step;
        for (let dy = 0; dy < step; dy++) {
          const row = (y0 + dy) * width;
          if (y0 + dy >= height) break;
          for (let dx = 0; dx < step; dx++) {
            if (x0 + dx >= width) break;
            sum += gray[row + x0 + dx];
            count++;
          }
        }
        out[y * w + x] = count ? (sum / count) | 0 : 0;
      }
    }
    return { gray: out, width: w, height: h };
  }

  // Normalizza il contrasto sulle foto con poca escursione tonale (ombra o plastica opaca).
  function enhance(gray) {
    if (!gray || gray.length < 64) return gray;
    const hist = new Uint32Array(256);
    for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
    const pLow = Math.floor(gray.length * 0.02);
    const pHigh = Math.floor(gray.length * 0.98);
    let acc = 0, low = 0, high = 255;
    for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= pLow) { low = i; break; } }
    acc = 0;
    for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= pHigh) { high = i; break; } }
    if (high - low >= 185 || high - low < 12) return gray;
    const out = new Uint8Array(gray.length);
    const scale = 255 / (high - low);
    for (let i = 0; i < gray.length; i++) {
      const v = (gray[i] - low) * scale;
      out[i] = v <= 0 ? 0 : v >= 255 ? 255 : v | 0;
    }
    return out;
  }

  function cropCenter(gray, width, height, ratio) {
    const r = Math.max(0.3, Math.min(0.95, ratio || 0.7));
    const cw = Math.max(16, Math.round(width * r));
    const ch = Math.max(16, Math.round(height * r));
    const x0 = Math.floor((width - cw) / 2);
    const y0 = Math.floor((height - ch) / 2);
    const out = new Uint8Array(cw * ch);
    for (let y = 0; y < ch; y++) {
      const srcRow = (y0 + y) * width + x0;
      out.set(gray.subarray(srcRow, srcRow + cw), y * cw);
    }
    return { gray: enhance(out), width: cw, height: ch };
  }

  function pgm(gray, width, height) {
    const header = 'P5\n' + width + ' ' + height + '\n255\n';
    const bytes = new Uint8Array(header.length + gray.length);
    for (let i = 0; i < header.length; i++) bytes[i] = header.charCodeAt(i) & 0xff;
    bytes.set(gray, header.length);
    return bytes;
  }

  function init() {
    if (ready) return ready;
    ready = (async () => {
      await need('TesseractCore', CORE_SRC);
      await need('GROCY_TESSDATA_ITA_B64', DATA_SRC);
      const factory = root.TesseractCore;
      if (typeof factory !== 'function') throw new Error('Motore OCR non disponibile.');
      tess = await factory({});
      try { tess.FS.mkdir(DATA_DIR); } catch (e) { /* esiste già */ }
      tess.FS.writeFile(DATA_DIR + '/' + LANG + '.traineddata', base64Bytes(root.GROCY_TESSDATA_ITA_B64));
      engine = new tess.TessBaseAPI();
      const status = engine.Init(DATA_DIR, LANG, 1, null);
      if (status !== 0) throw new Error('Motore OCR non inizializzato (codice ' + status + ').');
      return engine;
    })().catch(error => {
      failure = error && error.message ? error.message : String(error);
      ready = null;
      throw error;
    });
    return ready;
  }

  async function read(gray, width, height, options) {
    if (!gray || !(width > 0) || !(height > 0) || gray.length < width * height) {
      throw new Error('Foto non valida per la lettura del testo.');
    }
    await init();
    const opts = options || {};
    const fitted = fit(gray, width, height, MAX_SIDE);
    const imgGray = opts.enhance ? enhance(fitted.gray) : fitted.gray;
    const psm = opts.psm ? String(opts.psm) : '3';
    const start = Date.now();
    tess.FS.writeFile(IMAGE_PATH, pgm(imgGray, fitted.width, fitted.height));
    engine.SetVariable('tessedit_pageseg_mode', psm);
    engine.SetVariable('tessedit_char_whitelist', opts.whitelist ? String(opts.whitelist) : '');
    if (engine.SetImageFile(1, 0) !== 0) throw new Error('Foto non leggibile dal motore OCR.');
    let text = '';
    try {
      text = engine.GetUTF8Text() || '';
    } finally {
      engine.Clear();
    }
    return { text: text.replace(/\r/g, ''), ms: Date.now() - start, width: fitted.width, height: fitted.height };
  }

  const exported = {
    read,
    init,
    enhance,
    cropCenter,
    get lang() { return LANG; },
    isReady: () => !!engine,
    error: () => failure,
    _fit: fit
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  else root.GrocyOcr = exported;
})(typeof window !== 'undefined' ? window : globalThis);
