/*
 * Lettura del testo stampato su confezioni ed etichette, interamente sul
 * telefono. Tesseract è compilato in WebAssembly e vive negli asset dell'app:
 * nessun server, nessun worker, nessun caricamento di rete.
 *
 * Il motore riceve una foto già in scala di grigi (byte, una voce per pixel),
 * la converte in PNM e restituisce il testo riconosciuto. L'immagine resta in
 * memoria: non viene salvata, non finisce nei backup e non esce dal dispositivo.
 */
(function (root) {
  'use strict';

  const CORE_SRC = 'vendor/tesseract-core-simd-lstm.wasm.js';
  const DATA_SRC = 'vendor/ita.traineddata.b64.js';
  const LANG = 'ita';
  const DATA_DIR = '/tessdata';
  const IMAGE_PATH = '/input'; // percorso fisso atteso da Tesseract (tessdata e input)
  const MAX_SIDE = 1600; // lato massimo passato al motore

  let ready = null;           // promise di inizializzazione in corso
  let tess = null;            // modulo WebAssembly
  let engine = null;          // TessBaseAPI
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

  // Riduzione a passi interi con media a riquadro: più fedele di un nearest
  // neighbour quando la foto è molto più grande di quella utile al motore.
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
            sum += gray[row + x0 + dx]; count++;
          }
        }
        out[y * w + x] = count ? (sum / count) | 0 : 0;
      }
    }
    return { gray: out, width: w, height: h };
  }

  // PNM in scala di grigi (P5): formato semplice che Leptonica apre senza
  // decodificatori aggiuntivi.
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
      const status = engine.Init(DATA_DIR, LANG, 1 /* solo LSTM */, null);
      if (status !== 0) throw new Error('Motore OCR non inizializzato (codice ' + status + ').');
      return engine;
    })().catch(error => {
      failure = error && error.message ? error.message : String(error);
      ready = null;
      throw error;
    });
    return ready;
  }

  /*
   * gray/width/height: foto in scala di grigi.
   * options.psm: modalità di segmentazione (3 automatica, 6 blocco singolo).
   * Restituisce {text, ms, width, height}.
   */
  async function read(gray, width, height, options) {
    if (!gray || !(width > 0) || !(height > 0) || gray.length < width * height) {
      throw new Error('Foto non valida per la lettura del testo.');
    }
    await init();
    const image = fit(gray, width, height, MAX_SIDE);
    const psm = options && options.psm ? String(options.psm) : '3';
    const start = Date.now();
    tess.FS.writeFile(IMAGE_PATH, pgm(image.gray, image.width, image.height));
    engine.SetVariable('tessedit_pageseg_mode', psm);
    engine.SetVariable('tessedit_char_whitelist', '');
    if (engine.SetImageFile(1, 0) !== 0) throw new Error('Foto non leggibile dal motore OCR.');
    let text = '';
    try {
      text = engine.GetUTF8Text() || '';
    } finally {
      engine.Clear();
    }
    return { text: text.replace(/\r/g, ''), ms: Date.now() - start, width: image.width, height: image.height };
  }

  const exported = {
    read,
    init,
    get lang() { return LANG; },
    isReady: () => !!engine,
    error: () => failure,
    _fit: fit // usato solo dai test
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  else root.GrocyOcr = exported;
})(typeof window !== 'undefined' ? window : globalThis);
