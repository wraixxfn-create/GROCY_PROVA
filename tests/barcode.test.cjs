/*
  Test del lettore di codici a barre: immagini generate in memoria, nessuna
  dipendenza esterna. Coprono EAN-13, UPC-A, EAN-8, rotazioni, scala, disturbo
  e rifiuto dei codici con cifra di controllo errata.
*/
const {test} = require('node:test');
const assert = require('node:assert/strict');
const B = require('../android/app/src/main/assets/barcode.js');

const L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
const R = L.map(p => p.replace(/[01]/g, b => b === '0' ? '1' : '0'));
const PARITY = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];

function checkDigit(digits) {
  let sum = 0;
  for (let i = digits.length - 1, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) sum += Number(digits[i]) * weight;
  return String((10 - (sum % 10)) % 10);
}
function ean13(base) { return base + checkDigit(base); }
function ean8(base) { return base + checkDigit(base); }

function encodeEan13(code) {
  const parity = PARITY[Number(code[0])];
  let bits = '101';
  for (let i = 0; i < 6; i++) bits += parity[i] === 'L' ? L[Number(code[i + 1])] : G[Number(code[i + 1])];
  bits += '01010';
  for (let i = 0; i < 6; i++) bits += R[Number(code[i + 7])];
  return bits + '101';
}

function encodeEan8(code) {
  let bits = '101';
  for (let i = 0; i < 4; i++) bits += L[Number(code[i])];
  bits += '01010';
  for (let i = 4; i < 8; i++) bits += R[Number(code[i])];
  return bits + '101';
}

function render(bits, options = {}) {
  const scale = options.scale || 3;
  const margin = options.margin ?? 24;
  const barHeight = options.barHeight || 70;
  const width = margin * 2 + bits.length * scale;
  const height = margin * 2 + barHeight;
  const data = new Uint8Array(width * height).fill(options.paper ?? 245);
  for (let y = margin; y < margin + barHeight; y++) {
    for (let x = 0; x < bits.length; x++) {
      if (bits[x] !== '1') continue;
      for (let s = 0; s < scale; s++) data[y * width + margin + x * scale + s] = options.ink ?? 25;
    }
  }
  const image = {width, height, data};
  return options.rotate ? rotate(image, options.rotate) : image;
}

function rotate(image, degrees) {
  const {width, height, data} = image;
  const swap = degrees % 180 !== 0;
  const w = swap ? height : width, h = swap ? width : height;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sx, sy;
      if (degrees === 90) { sx = y; sy = height - 1 - x; }
      else if (degrees === 180) { sx = width - 1 - x; sy = height - 1 - y; }
      else { sx = width - 1 - y; sy = x; }
      out[y * w + x] = data[sy * width + sx];
    }
  }
  return {width: w, height: h, data: out};
}

function addNoise(image, amount) {
  let seed = 123456789;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const data = Uint8Array.from(image.data, v => Math.max(0, Math.min(255, Math.round(v + (random() - 0.5) * amount))));
  return {...image, data};
}

test('EAN-13 letto a scale diverse e con disturbo', () => {
  const code = '4006381333931';
  for (const [scale, noise] of [[2, 0], [3, 0], [5, 0], [3, 70], [4, 90]]) {
    const image = addNoise(render(encodeEan13(code), {scale}), noise);
    assert.equal(B.decodeGray(image.data, image.width, image.height), code, `scala ${scale}, disturbo ${noise}`);
  }
});

test('UPC-A e EAN-8 riconosciuti', () => {
  const upc = render(encodeEan13('0036000291452'), {scale: 4});
  assert.equal(B.decodeGray(upc.data, upc.width, upc.height), '0036000291452');
  const small = render(encodeEan8(ean8('9638507')), {scale: 4});
  assert.equal(B.decodeGray(small.data, small.width, small.height), ean8('9638507'));
});

test('etichetta fotografata di traverso: tutte le rotazioni', () => {
  const bits = encodeEan13(ean13('800112006201'));
  for (const degrees of [90, 180, 270]) {
    const image = render(bits, {scale: 3, rotate: degrees});
    assert.equal(B.decodeGray(image.data, image.width, image.height), ean13('800112006201'), `rotazione ${degrees}`);
  }
});

test('fondo con gradiente e ombra', () => {
  const code = ean13('801354401135');
  const image = render(encodeEan13(code), {scale: 3});
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const i = y * image.width + x;
      const shade = Math.round(25 * (y / image.height));
      image.data[i] = image.data[i] > 128 ? Math.max(0, 235 - shade) : Math.min(255, image.data[i] + shade);
    }
  }
  assert.equal(B.decodeGray(image.data, image.width, image.height), code);
});

test('cifra di controllo errata e immagini vuote rifiutate', () => {
  const wrong = render(encodeEan13('4006381333932'), {scale: 4});
  assert.equal(B.decodeGray(wrong.data, wrong.width, wrong.height), null);
  const empty = new Uint8Array(400 * 300).fill(250);
  assert.equal(B.decodeGray(empty, 400, 300), null);
  assert.equal(B.decodeGray(new Uint8Array(0), 0, 0), null);
});

test('normalizzazione dei codici per archivio e confronto', () => {
  assert.equal(B.normalize(' 4006381333931 '), '4006381333931');
  assert.equal(B.normalize('0036000291452'), '036000291452');
  assert.equal(B.normalize('96385074'), '96385074');
  assert.equal(B.normalize('ab-12.3'), 'AB-12.3');
  assert.equal(B.normalize(''), '');
  assert.equal(B.normalize('<script>'), '');
});

test('cifra di controllo EAN/UPC', () => {
  assert.equal(B.checksum('4006381333931'), true);
  assert.equal(B.checksum('4006381333932'), false);
  assert.equal(B.checksum('036000291452'), true);
  assert.equal(B.checksum('96385074'), true);
  assert.equal(B.checksum('123'), false);
});
