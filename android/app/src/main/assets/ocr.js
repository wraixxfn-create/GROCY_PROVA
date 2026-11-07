/*
 * Lettura del testo stampato su confezioni e date di scadenza direttamente sul
 * telefono tramite Tesseract compilato in WebAssembly negli asset locali.
 *
 * Le foto vere fatte col telefono sono spesso inclinate, con riflessi, poco
 * illuminate o con testo chiaro su fondo scuro: prima di passare l'immagine al
 * motore la prepariamo con funzioni pure (testabili in Node):
 *   deskewImage   — stima l'inclinazione col profilo di proiezione e raddrizza
 *   normalizeLight — appiattisce luci/ombre (divisione dal fondo locale)
 *   autoInvert    — porta l'immagine a inchiostro scuro su fondo chiaro
 *   binarize      — soglia di Otsu per i timbi piccolissimi
 *   resample      — ricalcolo bilineare (upscale dei testi minuscoli)
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

  // Ricalcolo bilineare: serve sia per ingrandire i testi minuscoli sia per
  // raddrizzare le foto senza l'effetto a scaletta del nearest neighbour.
  function resample(gray, width, height, nw, nh) {
    nw = Math.max(1, Math.round(nw));
    nh = Math.max(1, Math.round(nh));
    if (nw === width && nh === height) return { gray, width, height };
    const out = new Uint8Array(nw * nh);
    const rx = width / nw, ry = height / nh;
    for (let y = 0; y < nh; y++) {
      const sy = Math.min(height - 1, Math.max(0, (y + 0.5) * ry - 0.5));
      const y0 = Math.floor(sy), y1 = Math.min(height - 1, y0 + 1), fy = sy - y0;
      const row0 = y0 * width, row1 = y1 * width;
      for (let x = 0; x < nw; x++) {
        const sx = Math.min(width - 1, Math.max(0, (x + 0.5) * rx - 0.5));
        const x0 = Math.floor(sx), x1 = Math.min(width - 1, x0 + 1), fx = sx - x0;
        const p00 = gray[row0 + x0], p10 = gray[row0 + x1];
        const p01 = gray[row1 + x0], p11 = gray[row1 + x1];
        const v = (p00 * (1 - fx) + p10 * fx) * (1 - fy) + (p01 * (1 - fx) + p11 * fx) * fy;
        out[y * nw + x] = v < 0 ? 0 : v > 255 ? 255 : v | 0;
      }
    }
    return { gray: out, width: nw, height: nh };
  }

  // Soglia di Otsu: separa inchiostro e fondo anche su foto con poca luce.
  function otsuThreshold(gray) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
    const total = gray.length;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, best = 0, threshold = 128;
    for (let i = 0; i < 256; i++) {
      wB += hist[i];
      if (!wB) continue;
      const wF = total - wB;
      if (!wF) break;
      sumB += i * hist[i];
      const mB = sumB / wB, mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; threshold = i; }
    }
    return threshold;
  }

  // Porta l'immagine a inchiostro scuro su fondo chiaro: Tesseract legge molto
  // meglio. L'inchiostro è la classe nettamente minoritaria della soglia di
  // Otsu; su gradienti forti (classi sbilanciate ~50/50) non si decide nulla
  // per non rovesciare foto normali.
  function autoInvert(gray, width, height) {
    if (!gray || !(width > 0) || !(height > 0)) return gray;
    const t = otsuThreshold(gray);
    let below = 0;
    for (let i = 0; i < gray.length; i++) if (gray[i] <= t) below++;
    const frac = below / gray.length;
    if (frac > 0.38 && frac < 0.62) return gray;   // polarità indistinguibile: non toccare
    if (frac <= 0.38) return gray;                 // inchiostro scuro su fondo chiaro: già a posto
    const out = new Uint8Array(gray.length);
    for (let i = 0; i < gray.length; i++) out[i] = 255 - gray[i];
    return out;
  }

  // Filtro di massimo (erosione) in O(n) con finestra scorrevole a deque:
  // toglie dal fondo la scritta scura (fino a ~2×raggio di spessore), così la
  // stima dell'illuminazione non viene "piegata" dai caratteri spessi.
  function maxFilter(gray, width, height, radius) {
    const r = Math.max(1, radius | 0);
    const tmp = new Uint8Array(width * height);
    const out = new Uint8Array(width * height);
    const dq = new Int32Array(Math.max(width, height));
    // Passata orizzontale
    for (let y = 0; y < height; y++) {
      const row = y * width;
      let head = 0, tail = 0;
      for (let x = 0; x < width + r; x++) {
        if (x < width) {
          const v = gray[row + x];
          while (tail > head && gray[row + dq[tail - 1]] <= v) tail--;
          dq[tail++] = x;
        }
        const o = x - r;
        if (o < 0) continue;
        while (dq[head] < o - r) head++;
        tmp[row + o] = gray[row + dq[head]];
      }
    }
    // Passata verticale
    for (let x = 0; x < width; x++) {
      let head = 0, tail = 0;
      for (let y = 0; y < height + r; y++) {
        if (y < height) {
          const v = tmp[y * width + x];
          while (tail > head && tmp[dq[tail - 1] * width + x] <= v) tail--;
          dq[tail++] = y;
        }
        const o = y - r;
        if (o < 0) continue;
        while (dq[head] < o - r) head++;
        out[o * width + x] = tmp[dq[head] * width + x];
      }
    }
    return out;
  }

  // Sfocato pesato del fondo (via immagine integrale): stima l'illuminazione
  // locale. È la base per togliere riflessi e ombre.
  function boxBlur(gray, width, height, radius) {
    const r = Math.max(2, radius | 0);
    const iw = width + 1;
    const integral = new Uint32Array(iw * (height + 1));
    for (let y = 0; y < height; y++) {
      let rowSum = 0;
      const row = y * width, iout = (y + 1) * iw, iprev = y * iw;
      for (let x = 0; x < width; x++) {
        rowSum += gray[row + x];
        integral[iout + x + 1] = integral[iprev + x + 1] + rowSum;
      }
    }
    const out = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(height - 1, y + r);
      const ra = y0 * iw, rb = (y1 + 1) * iw;
      for (let x = 0; x < width; x++) {
        const xa = Math.max(0, x - r), xb = Math.min(width - 1, x + r) + 1;
        const area = (y1 - y0 + 1) * (xb - xa);
        const sum = integral[rb + xb] - integral[ra + xb] - integral[rb + xa] + integral[ra + xa];
        out[y * width + x] = sum / area;
      }
    }
    return out;
  }

  // Appiattisce l'illuminazione: stima il fondo locale (erosione + sfocato,
  // così la scritta non lo influenza) e riporta il contrasto della sola
  // scritta. Cura riflessi, foto contro luce e plastica scura.
  function normalizeLight(gray, width, height) {
    if (!gray || !(width > 0) || !(height > 0)) return gray;
    const flat = autoInvert(gray, width, height);
    const inkFree = maxFilter(flat, width, height, Math.max(4, Math.round(Math.min(width, height) / 20)));
    const radius = Math.max(16, Math.round(Math.min(width, height) / 10));
    const bg = boxBlur(inkFree, width, height, radius);
    // Guadagno adattivo: misura quanto "profondo" è l'inchiostro rispetto al
    // fondo (95° percentile delle differenze) e stira il contrasto di
    // conseguenza — leggero sulle foto normali, forte sulle scritte sbiadite
    // dai riflessi.
    let peak = 0;
    const hist = new Uint32Array(256);
    for (let i = 0; i < flat.length; i++) {
      const d = flat[i] - bg[i];
      hist[d < 0 ? Math.min(255, -d) : 0]++;
    }
    const target = Math.round(flat.length * 0.05);
    let acc = 0;
    for (let k = 0; k < 256; k++) { acc += hist[k]; if (acc >= target) { peak = k; break; } }
    const gain = Math.max(1.2, Math.min(4.5, 95 / Math.max(12, peak)));
    const out = new Uint8Array(width * height);
    for (let i = 0; i < out.length; i++) {
      const d = flat[i] - bg[i];            // l'inchiostro è più scuro del fondo
      const v = 236 + d * gain;             // fondo uniforme ~236, scritta in negativo
      out[i] = v < 0 ? 0 : v > 255 ? 255 : v | 0;
    }
    return out;
  }

  function binarize(gray) {
    if (!gray || gray.length < 16) return gray;
    const t = otsuThreshold(gray);
    const out = new Uint8Array(gray.length);
    for (let i = 0; i < gray.length; i++) out[i] = gray[i] <= t ? 0 : 255;
    return out;
  }

  // Ruota di un angolo qualsiasi attorno al centro, fondo bianco. Per i quarti
  // di giro usa il pixel più vicino (rotazione esatta, nessuna sfumatura), per
  // gli angoli piccoli del raddrizzamento il bilineare (niente scaletta).
  function rotate(gray, width, height, deg) {
    if (!gray || !(width > 0) || !(height > 0) || !deg) return { gray, width, height };
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const quarter = Math.abs(deg / 90 - Math.round(deg / 90)) < 0.001;
    const nw = quarter
      ? (Math.round(Math.abs(deg) % 180) === 90 ? height : width)
      : Math.round(Math.abs(width * cos) + Math.abs(height * sin));
    const nh = quarter
      ? (Math.round(Math.abs(deg) % 180) === 90 ? width : height)
      : Math.round(Math.abs(width * sin) + Math.abs(height * cos));
    const out = new Uint8Array(nw * nh).fill(255);
    const cx = width / 2, cy = height / 2, ncx = nw / 2, ncy = nh / 2;
    for (let y = 0; y < nh; y++) {
      const dy = y + 0.5 - ncy;
      for (let x = 0; x < nw; x++) {
        const dx = x + 0.5 - ncx;
        const sx = cx + dx * cos + dy * sin;
        const sy = cy - dx * sin + dy * cos;
        const px = Math.floor(sx), py = Math.floor(sy);
        if (px < 0 || py < 0 || px > width - 1 || py > height - 1) continue;
        if (quarter) {
          out[y * nw + x] = gray[py * width + px];
          continue;
        }
        const x1 = Math.min(px + 1, width - 1), y1 = Math.min(py + 1, height - 1);
        const fx = px === width - 1 ? 0 : sx - px, fy = py === height - 1 ? 0 : sy - py;
        const r0 = py * width + px, r1 = y1 * width + px;
        const v = (gray[r0] * (1 - fx) + gray[r0 + (x1 - px)] * fx) * (1 - fy)
          + (gray[r1] * (1 - fx) + gray[r1 + (x1 - px)] * fx) * fy;
        out[y * nw + x] = v < 0 ? 0 : v > 255 ? 255 : v | 0;
      }
    }
    return { gray: out, width: nw, height: nh };
  }

  // Stima l'inclinazione del testo col profilo di proiezione: l'angolo che
  // "compatta" le righe di inchiostro nelle stesse righe di pixel è quello giusto.
  function estimateSkew(gray, width, height) {
    if (!gray || !(width > 4) || !(height > 4)) return 0;
    const scale = Math.min(1, 420 / Math.max(width, height));
    const sw = Math.max(48, Math.round(width * scale));
    const sh = Math.max(48, Math.round(height * scale));
    const small = resample(gray, width, height, sw, sh).gray;
    const t = otsuThreshold(small);
    let dark = 0;
    const xs = [], ys = [];
    const x0 = Math.floor(sw * 0.06), x1 = Math.ceil(sw * 0.94);
    const area = (x1 - x0) * sh;
    for (let y = 0; y < sh; y++) {
      const row = y * sw;
      for (let x = x0; x < x1; x++) {
        if (small[row + x] <= t) { xs.push(x); ys.push(y); dark++; }
      }
    }
    // Pagina quasi vuota o quasi piena (foto con fondo uniforme scuro/chiaro):
    // la stima non è affidabile, meglio non toccare la foto.
    if (dark < area * 0.004 || dark > area * 0.55) return 0;
    const half = sw / 2, offset = 48, binsLen = sh + 96;
    const score = deg => {
      const tan = Math.tan((deg * Math.PI) / 180);
      const bins = new Float64Array(binsLen);
      for (let i = 0; i < xs.length; i++) {
        const b = Math.round(ys[i] + (xs[i] - half) * tan) + offset;
        if (b >= 0 && b < binsLen) bins[b]++;
      }
      let s = 0;
      for (let i = 0; i < binsLen; i++) s += bins[i] * bins[i];
      return s;
    };
    let bestAngle = 0, bestScore = score(0);
    for (let deg = -11; deg <= 11.001; deg += 1.25) {
      const s = score(deg);
      if (s > bestScore) { bestScore = s; bestAngle = deg; }
    }
    for (let deg = bestAngle - 1.25; deg <= bestAngle + 1.251; deg += 0.25) {
      const s = score(deg);
      if (s > bestScore) { bestScore = s; bestAngle = deg; }
    }
    for (let deg = bestAngle - 0.25; deg <= bestAngle + 0.251; deg += 0.125) {
      const s = score(deg);
      if (s > bestScore) { bestScore = s; bestAngle = deg; }
    }
    return Math.abs(bestAngle) >= 0.5 ? bestAngle : 0;
  }

  // Raddrizza la foto se il testo risulta inclinato (soglia 0.5 gradi).
  function deskewImage(gray, width, height) {
    const angle = estimateSkew(gray, width, height);
    if (!angle) return { gray, width, height, angle: 0 };
    const out = rotate(gray, width, height, angle);
    return { gray: out.gray, width: out.width, height: out.height, angle };
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
    let g = gray, w = width, h = height;
    const fitted = fit(g, w, h, MAX_SIDE);
    g = fitted.gray; w = fitted.width; h = fitted.height;
    if (opts.deskew) {
      const straight = deskewImage(g, w, h);
      g = straight.gray; w = straight.width; h = straight.height;
    }
    if (opts.illum) g = normalizeLight(g, w, h);
    if (opts.enhance) g = enhance(g);
    // Testo minuscolo (timbri inkjet, scadenze piccole): ingrandiamo prima di leggere.
    if ((opts.upscale || opts.illum) && Math.max(w, h) < 1500) {
      const grown = resample(g, w, h, Math.min(2200, w * 2), Math.min(2200, h * 2));
      g = grown.gray; w = grown.width; h = grown.height;
    }
    if (opts.binarize) g = binarize(g);
    const psm = opts.psm ? String(opts.psm) : '3';
    const start = Date.now();
    tess.FS.writeFile(IMAGE_PATH, pgm(g, w, h));
    engine.SetVariable('tessedit_pageseg_mode', psm);
    engine.SetVariable('tessedit_char_whitelist', opts.whitelist ? String(opts.whitelist) : '');
    if (engine.SetImageFile(1, 0) !== 0) throw new Error('Foto non leggibile dal motore OCR.');
    let text = '';
    try {
      text = engine.GetUTF8Text() || '';
    } finally {
      engine.Clear();
    }
    return { text: text.replace(/\r/g, ''), ms: Date.now() - start, width: w, height: h };
  }

  const exported = {
    read,
    init,
    enhance,
    cropCenter,
    resample,
    rotate,
    estimateSkew,
    deskewImage,
    normalizeLight,
    binarize,
    autoInvert,
    otsuThreshold,
    boxBlur,
    maxFilter,
    get lang() { return LANG; },
    isReady: () => !!engine,
    error: () => failure,
    _fit: fit
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  else root.GrocyOcr = exported;
})(typeof window !== 'undefined' ? window : globalThis);
