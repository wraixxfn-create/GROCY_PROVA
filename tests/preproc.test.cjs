/*
 * Test delle funzioni pure di pre-elaborazione immagine di ocr.js: raddrizzo,
 * inversione di polarità, appiattimento luci, binarizzazione e upscale.
 * Non serve il motore WebAssembly: sono operazioni aritmetiche su array.
 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const Ocr = require('../android/app/src/main/assets/ocr.js');

// Immagine di prova con righe di testo orizzontali (barre scure su fondo chiaro).
function righe(width, height, spessore = 4, passo = 14) {
  const img = new Uint8Array(width * height).fill(240);
  for (let y = 0; y < height; y++) {
    if ((y % passo) < spessore) for (let x = 0; x < width; x++) img[y * width + x] = 30;
  }
  return img;
}

test('resample non cambia nulla a parità di dimensioni e ingrandisce con rampa bilineare', () => {
  const img = righe(40, 40);
  const same = Ocr.resample(img, 40, 40, 40, 40);
  assert.equal(same.gray, img);
  // Rampa 2x1 da 0 a 255 ingrandita a 4x1: estremi intatti, centro in mezzo.
  const up = Ocr.resample(new Uint8Array([0, 255]), 2, 1, 4, 1);
  assert.equal(up.width, 4);
  assert.equal(up.height, 1);
  assert.ok(up.gray[0] <= 10, 'estremità scura');
  assert.ok(up.gray[3] >= 245, 'estremità chiara');
  assert.ok(up.gray[1] < 128 && up.gray[2] > 128, 'transizione progressiva');
});

test('estimateSkew misura l\'inclinazione delle righe e deskewImage la annulla', () => {
  // Righe inclinate di 6 gradi (verso il basso da sinistra a destra).
  const angle = 6;
  const w = 360, h = 300;
  const img = new Uint8Array(w * h).fill(240);
  const tan = Math.tan((angle * Math.PI) / 180);
  for (let x = 0; x < w; x++) {
    for (let line = 0; line < 8; line++) {
      const yc = 30 + line * 30 + x * tan;
      for (let dy = 0; dy < 5; dy++) {
        const y = Math.round(yc + dy);
        if (y >= 0 && y < h) img[y * w + x] = 30;
      }
    }
  }
  const estimated = Ocr.estimateSkew(img, w, h);
  assert.ok(Math.abs(estimated - (-angle)) <= 0.75, `angolo stimato ${estimated}, atteso ~-${angle}`);
  const straight = Ocr.deskewImage(img, w, h);
  assert.ok(Math.abs(straight.angle + angle) <= 0.75);
  // Dopo il raddrizzamento la proiezione orizzontale deve essere netta:
  // le righe di inchiostro concentrate su poche righe di pixel.
  const bins = new Float64Array(straight.height);
  for (let y = 0; y < straight.height; y++) {
    for (let x = 0; x < straight.width; x++) if (straight.gray[y * straight.width + x] < 120) bins[y]++;
  }
  let peak = 0;
  for (const b of bins) peak = Math.max(peak, b);
  assert.ok(peak > straight.width * 0.55, `riga più piena ${peak}/${straight.width}`);
});

test('estimateSkew non tocca le foto senza testo o uniformi', () => {
  assert.equal(Ocr.estimateSkew(new Uint8Array(200 * 200).fill(200), 200, 200), 0);
  assert.equal(Ocr.estimateSkew(new Uint8Array(200 * 200).fill(20), 200, 200), 0);
});

test('autoInvert porta il testo chiaro su fondo scuro a scuro su chiaro', () => {
  // Scritta chiara su fondo scuro (es. timbro su tappo).
  const w = 60, h = 40;
  const img = new Uint8Array(w * h).fill(40);
  for (let y = 12; y < 16; y++) for (let x = 8; x < 40; x++) img[y * w + x] = 220;
  const out = Ocr.autoInvert(img, w, h);
  assert.ok(out[0] > 200, 'il fondo diventa chiaro');
  assert.ok(out[13 * w + 20] < 100, 'la scritta diventa scura');
  // Immagine già scura su chiaro: resta invariata.
  const norm = new Uint8Array(w * h).fill(230);
  for (let y = 12; y < 16; y++) for (let x = 8; x < 40; x++) norm[y * w + x] = 40;
  assert.equal(Ocr.autoInvert(norm, w, h), norm);
});

test('normalizeLight recupera il testo sotto un riflesso: il contrasto locale torna', () => {
  // Fondo con gradiente forte (da 90 a 255) + scritta scura a contrasto 60.
  const w = 160, h = 120;
  const img = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      img[y * w + x] = 90 + Math.round((x / w) * 160);
    }
  }
  for (let y = 40; y < 52; y++) for (let x = 30; x < 120; x++) img[y * w + x] -= 60;
  const out = Ocr.normalizeLight(img, w, h);
  // Contrasto locale scritta/fondo nella zona in ombra (a sinistra) e in luce (a destra).
  const darkLeft = out[45 * w + 35], brightLeft = out[35 * w + 35];
  const darkRight = out[45 * w + 115], brightRight = out[35 * w + 115];
  const contrastLeft = brightLeft - darkLeft, contrastRight = brightRight - darkRight;
  assert.ok(contrastLeft > 70, `contrasto a sinistra ${contrastLeft}`);
  assert.ok(contrastRight > 70, `contrasto a destra ${contrastRight}`);
});

test('binarize produce solo bianco e nero con la soglia di Otsu', () => {
  const img = new Uint8Array(100 * 60).fill(235);
  for (let y = 20; y < 26; y++) for (let x = 10; x < 80; x++) img[y * 100 + x] = 45;
  const out = Ocr.binarize(img);
  let black = 0, white = 0;
  for (const v of out) { if (v === 0) black++; else if (v === 255) white++; }
  assert.equal(black + white, out.length);
  assert.ok(black > 200, 'la scritta resta nera');
});

test('rotate di 90 gradi è esatta e scambia le dimensioni', () => {
  // Matrice 2x2 nota: la rotazione di +90 gradi sposta i pixel in modo esatto.
  const img = new Uint8Array([10, 20, 30, 40]);
  const out = Ocr.rotate(img, 2, 2, 90);
  assert.equal(out.width, 2);
  assert.equal(out.height, 2);
  assert.deepEqual(Array.from(out.gray), [30, 10, 40, 20]);
  // E andando avanti e indietro si torna all'originale.
  const back = Ocr.rotate(out.gray, 2, 2, -90);
  assert.deepEqual(Array.from(back.gray), [10, 20, 30, 40]);
  // Anche per immagini non quadre i quarti di giro restano esatti.
  const w = 6, h = 4;
  const img2 = Uint8Array.from({length: w * h}, (_, i) => (i * 37) % 256);
  const r1 = Ocr.rotate(img2, w, h, 90);
  assert.equal(r1.width, h);
  assert.equal(r1.height, w);
  const r2 = Ocr.rotate(r1.gray, r1.width, r1.height, -90);
  assert.deepEqual(Array.from(r2.gray), Array.from(img2));
});
