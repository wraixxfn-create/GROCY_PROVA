/*
 * Lettore di codici a barre per etichette alimentari.
 * Solo EAN-13, UPC-A (EAN-13 con zero iniziale) ed EAN-8: nessuna libreria,
 * nessuna rete. L'immagine arriva già in scala di grigi (fotocamera Android
 * oppure foto scelta nel browser) e viene analizzata riga per riga.
 */
(function (root) {
  'use strict';

  const L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
  const G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
  const R = L.map(p => p.replace(/[01]/g, b => b === '0' ? '1' : '0'));
  const PARITY = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
  const parityDigit = new Map(PARITY.map((p, d) => [p, d]));

  const bitsOf = patterns => patterns.map(p => p.split('').map(Number));
  const LB = bitsOf(L), GB = bitsOf(G), RB = bitsOf(R);
  const SUM7 = 7;

  function hamming(a, b) {
    let d = 0;
    for (let i = 0; i < 7; i++) if (a[i] !== b[i]) d++;
    return d;
  }

  function bestDigit(bits, table, other) {
    let best = -1, bestDistance = 9, second = 9;
    for (let d = 0; d < 10; d++) {
      const distance = hamming(bits, table[d]);
      if (distance < bestDistance) { second = bestDistance; bestDistance = distance; best = d; }
      else if (distance < second) second = distance;
    }
    if (other) {
      for (let d = 0; d < 10; d++) {
        const distance = hamming(bits, other[d]);
        if (distance < bestDistance) { second = bestDistance; bestDistance = distance; best = d + 10; }
        else if (distance < second) second = distance;
      }
    }
    return bestDistance <= 1 && second > bestDistance ? best : -1;
  }

  // Converte le quattro larghezze di un carattere in 7 moduli binari.
  const counts = [0, 0, 0, 0];
  function modulesOf(widths, unit) {
    const exact = [0, 0, 0, 0];
    let total = 0;
    for (let i = 0; i < 4; i++) { exact[i] = widths[i] / unit; total += Math.floor(exact[i]); counts[i] = Math.floor(exact[i]); }
    let missing = SUM7 - total;
    while (missing > 0) {
      let pick = 0, best = -1;
      for (let i = 0; i < 4; i++) { const rest = exact[i] - counts[i]; if (rest > best) { best = rest; pick = i; } }
      counts[pick]++; missing--;
    }
    return counts;
  }

  function readDigit(runs, index, right) {
    if (index + 3 >= runs.length) return null;
    const widths = [runs[index].w, runs[index + 1].w, runs[index + 2].w, runs[index + 3].w];
    const unit = (widths[0] + widths[1] + widths[2] + widths[3]) / 7;
    if (!(unit > 0)) return null;
    for (let i = 0; i < 4; i++) if (widths[i] < unit * 0.35) return null;
    const counts7 = modulesOf(widths, unit);
    const bits = [];
    for (let i = 0; i < 4; i++) {
      const bit = runs[index + i].black ? 1 : 0;
      for (let k = 0; k < counts7[i]; k++) bits.push(bit);
    }
    if (right) {
      const digit = bestDigit(bits, RB, null);
      return digit < 0 ? null : {digit, set: 'R'};
    }
    const digit = bestDigit(bits, LB, GB);
    if (digit < 0) return null;
    return digit < 10 ? {digit, set: 'L'} : {digit: digit - 10, set: 'G'};
  }

  function guardOk(runs, index, length) {
    if (index + length > runs.length) return false;
    let total = 0;
    for (let i = 0; i < length; i++) total += runs[index + i].w;
    const unit = total / length;
    if (!(unit > 0)) return false;
    for (let i = 0; i < length; i++) {
      const r = runs[index + i].w / unit;
      if (r < 0.45 || r > 2.2) return false;
    }
    return true;
  }

  function checksumOk(digits) {
    const n = digits.length;
    if (![8, 12, 13, 14].includes(n)) return false;
    let sum = 0;
    for (let i = n - 2, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) {
      sum += Number(digits[i]) * weight;
    }
    return (10 - (sum % 10)) % 10 === Number(digits[n - 1]);
  }

  function finish(digits) {
    if (!digits || checksumOk(digits) === false) return null;
    return digits;
  }

  // Un codice reale occupa esattamente 95 (EAN-13) o 67 (EAN-8) moduli, con
  // una zona bianca ai lati: serve a scartare i falsi positivi dentro altre
  // stampe o in immagini mosse.
  function structureOk(runs, start, endRun, startUnit, modules) {
    let width = 0;
    for (let i = start; i <= endRun; i++) width += runs[i].w;
    const ratio = width / startUnit;
    if (Math.abs(ratio - modules) > 2.2) return false;
    const before = runs[start - 1], after = runs[endRun + 1];
    if (before && (before.black || before.w < startUnit * 2.4)) return false;
    if (after && (after.black || after.w < startUnit * 2.4)) return false;
    return true;
  }

  // Decodifica una singola riga già convertita in sequenze di barre/spazi.
  function decodeRuns(runs) {
    const last = runs.length - 59;
    for (let start = 0; start <= last; start++) {
      if (!runs[start].black || !guardOk(runs, start, 3)) continue;

      let index = start + 3;
      let left = '', leftDigits = '';
      let ok = true;
      for (let i = 0; i < 6; i++) {
        const d = readDigit(runs, index, false);
        if (!d) { ok = false; break; }
        left += d.set; leftDigits += d.digit; index += 4;
      }
      if (!ok || !guardOk(runs, index, 5)) continue;
      index += 5;
      let rightDigits = '';
      for (let i = 0; i < 6; i++) {
        const d = readDigit(runs, index, true);
        if (!d) { ok = false; break; }
        rightDigits += d.digit; index += 4;
      }
      if (!ok || !guardOk(runs, index, 3)) continue;
      const first = parityDigit.get(left);
      if (first === undefined) continue;
      const startUnit = (runs[start].w + runs[start + 1].w + runs[start + 2].w) / 3;
      if (!structureOk(runs, start, index + 2, startUnit, 95)) continue;
      const code = finish(String(first) + leftDigits + rightDigits);
      if (code) return code;
    }

    // EAN-8: quattro caratteri a sinistra e quattro a destra.
    const last8 = runs.length - 43;
    for (let start = 0; start <= last8; start++) {
      if (!runs[start].black || !guardOk(runs, start, 3)) continue;
      let index = start + 3;
      let digits = '';
      let ok = true;
      for (let i = 0; i < 4; i++) {
        const d = readDigit(runs, index, false);
        if (!d) { ok = false; break; }
        digits += d.digit; index += 4;
      }
      if (!ok || !guardOk(runs, index, 5)) continue;
      index += 5;
      for (let i = 0; i < 4; i++) {
        const d = readDigit(runs, index, true);
        if (!d) { ok = false; break; }
        digits += d.digit; index += 4;
      }
      if (!ok || !guardOk(runs, index, 3)) continue;
      const startUnit = (runs[start].w + runs[start + 1].w + runs[start + 2].w) / 3;
      if (!structureOk(runs, start, index + 2, startUnit, 67)) continue;
      const code = finish(digits);
      if (code) return code;
    }
    return null;
  }

  function otsu(histogram, pixels) {
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * histogram[i];
    let sumB = 0, wB = 0, best = 0, threshold = 0;
    for (let i = 0; i < 256; i++) {
      wB += histogram[i];
      if (!wB) continue;
      const wF = pixels - wB;
      if (!wF) break;
      sumB += i * histogram[i];
      const mB = sumB / wB, mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; threshold = i; }
    }
    return threshold;
  }

  // rows: {width, height, pixel(x, y)} — restituisce il codice o null.
  function decodeRows(rows, rowStep) {
    const histogram = new Uint32Array(256);
    const values = new Uint8Array(rows.width);
    for (let y = 0; y < rows.height; y += rowStep) {
      let min = 255, max = 0;
      histogram.fill(0);
      for (let x = 0; x < rows.width; x++) {
        const v = rows.pixel(x, y);
        values[x] = v;
        histogram[v]++;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      if (max - min < 32) continue;
      const threshold = Math.min(max - 1, Math.max(min + 1, otsu(histogram, rows.width)));
      const runs = [];
      let black = values[0] < threshold, width = 0;
      for (let x = 0; x < rows.width; x++) {
        const b = values[x] < threshold;
        if (b === black) width++;
        else { runs.push({black, w: width}); black = b; width = 1; }
      }
      runs.push({black, w: width});
      const code = decodeRuns(runs);
      if (code) return code;
    }
    return null;
  }

  /*
   * data: Uint8Array/Uint8ClampedArray in scala di grigi (una voce per pixel).
   * L'etichetta può essere ruotata: si provano quattro orientamenti.
   */
  function decodeGray(data, width, height) {
    if (!data || !(width > 0) || !(height > 0) || data.length < width * height) return null;
    const orientations = [
      {width, height, pixel: (x, y) => data[y * width + x]},
      {width: height, height: width, pixel: (x, y) => data[(height - 1 - x) * width + y]},
      {width, height, pixel: (x, y) => data[(height - 1 - y) * width + (width - 1 - x)]},
      {width: height, height: width, pixel: (x, y) => data[x * width + (width - 1 - y)]}
    ];
    for (const rows of orientations) {
      const step = Math.max(1, Math.floor(rows.height / 320));
      const code = decodeRows(rows, step);
      if (code) return code;
    }
    return null;
  }

  // Normalizza per confronti e archivio: UPC-A resta a 12 cifre, gli altri testi
  // vengono ripuliti. Restituisce '' se il codice non è utilizzabile.
  function normalize(raw) {
    if (typeof raw !== 'string') return '';
    const compact = raw.trim().replace(/\s+/g, '');
    if (/^\d{12,14}$/.test(compact)) return compact.length === 13 && compact[0] === '0' ? compact.slice(1) : compact;
    if (/^\d{8}$/.test(compact)) return compact;
    if (/^[A-Za-z0-9._-]{3,80}$/.test(compact)) return compact.toUpperCase();
    return '';
  }

  const api = {normalize, checksum: checksumOk, decodeGray, decodeRuns};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GrocyBarcode = api;
})(typeof window !== 'undefined' ? window : globalThis);
