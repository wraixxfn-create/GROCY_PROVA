/*
 * Banco di misura del riconoscimento reale: usa lo stesso identico percorso
 * dell'app (ocr.js -> recognize.js -> barcode.js) sulle foto di tests/fixtures
 * comprese quelle "difficili" in fixtures/hard. Serve a verificare che una
 * foto tipica fatta col telefono (piccola, inclinata, poco contrasto, riflessi,
 * timbro minuscolo) venga letta davvero, non solo quelle ideali.
 *
 * Uso: node tests/ocr-bench.cjs
 */
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ASSETS = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets');
const FIXTURES = path.join(__dirname, 'fixtures');
const HARD = path.join(FIXTURES, 'hard');

if (!fs.existsSync(path.join(ASSETS, 'vendor', 'tesseract-core-simd-lstm.wasm.js'))) {
  console.error('Asset OCR assenti: esegui npm run vendor:ocr');
  process.exit(1);
}

global.window = globalThis;
global.TesseractCore = require(path.join(ASSETS, 'vendor', 'tesseract-core-simd-lstm.wasm.js'));
require(path.join(ASSETS, 'vendor', 'ita.traineddata.b64.js'));
const Ocr = require(path.join(ASSETS, 'ocr.js'));
const R = require(path.join(ASSETS, 'recognize.js'));
const B = require(path.join(ASSETS, 'barcode.js'));

function gray(file) {
  const size = execFileSync('identify', ['-format', '%w %h', file]).toString().trim().split(' ').map(Number);
  const raw = execFileSync('convert', [file, '-colorspace', 'Gray', '-depth', '8', 'gray:-'], {maxBuffer: 1 << 27});
  return {width: size[0], height: size[1], gray: new Uint8Array(raw)};
}

// Stessa pipeline dell'app (product-scan.js → readBest):
//  1. foto raddrizzata (deskew) + contrasto, ritaglio centrale per la scadenza
//  2. illuminazione appiattita (riflessi, controluce), ritaglio centrale
//  3. binarizzazione Otsu + ingrandimento
//  4. rotazioni 90/180/270 se il testo letto è quasi nullo
const letterCount = text => (String(text || '').match(/[A-Za-zÀ-ÿ]/g) || []).length;
function usefulScore(parsed, role) {
  if (!parsed) return -1;
  let score = 0;
  if (role === 'pack') {
    if (parsed.name) score += 4;
    if (parsed.brand) score += 2;
    if (parsed.qty) score += 1;
    if (parsed.barcode) score += 2;
  } else if (parsed.expiry) score += 6;
  else if (parsed.production) score += 3;
  return score + Math.min(3, letterCount(parsed.text) / 40);
}
function satisfied(parsed, role) {
  if (!parsed) return false;
  if (role === 'pack') return !!(parsed.name && (parsed.brand || parsed.qty || parsed.barcode));
  return !!parsed.expiry;
}

async function analyse(photo, role, maxAttempts = 3) {
  const started = Date.now();
  const attempts = [
    { ocr: { psm: 3, enhance: true, deskew: true } },
    { ocr: { psm: 3, enhance: true, deskew: true, illum: true } },
    { ocr: { psm: 6, enhance: true, deskew: true, illum: true, binarize: true, upscale: true } }
  ];
  let collected = '';
  let best = R.parse('', { role, checksum: B.checksum });
  let letters = 0;
  let passes = 0;
  for (let i = 0; i < attempts.length && i < maxAttempts; i++) {
    const res = await Ocr.read(photo.gray, photo.width, photo.height, attempts[i].ocr);
    passes++;
    collected += '\n' + res.text;
    letters = Math.max(letters, letterCount(res.text));
    if (role !== 'pack') {
      const center = Ocr.cropCenter(photo.gray, photo.width, photo.height, 0.72);
      const c = await Ocr.read(center.gray, center.width, center.height, Object.assign({}, attempts[i].ocr, { psm: 6, upscale: true }));
      passes++;
      collected += '\n' + c.text;
      letters = Math.max(letters, letterCount(c.text));
    }
    const parsed = R.parse(collected, { role, checksum: B.checksum });
    if (usefulScore(parsed, role) > usefulScore(best, role)) best = parsed;
    if (satisfied(best, role)) return finish(best, passes, started);
  }
  if (letters < 12) {
    for (const angle of [90, 180, 270]) {
      const rot = Ocr.rotate(photo.gray, photo.width, photo.height, angle);
      const res = await Ocr.read(rot.gray, rot.width, rot.height, { psm: 3, enhance: true, deskew: true });
      passes++;
      collected += '\n' + res.text;
      const parsed = R.parse(collected, { role, checksum: B.checksum });
      if (usefulScore(parsed, role) > usefulScore(best, role)) best = parsed;
      if (satisfied(best, role)) return finish(best, passes, started);
      letters = Math.max(letters, letterCount(res.text));
      if (letters >= 12) break;
    }
  }
  return finish(best, passes, started);
}

async function finish(best, passes, started) {
  // Come nell'app: se non c'è codice a barre, si riprova sull'immagine con le luci appiattite.
  return { parsed: best, ms: Date.now() - started, passes, text: best.text || '' };
}

function decodeBarcode(photo, best) {
  let barcode = B.decodeGray(photo.gray, photo.width, photo.height, { minVotes: 3 });
  if (!barcode && best && best.role === 'pack') {
    const flat = Ocr.normalizeLight(photo.gray, photo.width, photo.height);
    barcode = B.decodeGray(flat, photo.width, photo.height, { minVotes: 3 });
  }
  return barcode || null;
}

const CASES = [
  // Foto ideali del repo
  ['confezione.jpg', 'pack', {name: 'Passata di pomodoro', brand: 'Mutti', qty: 700, unit: 'g', category: 'Conserve'}],
  ['yogurt-confezione.jpg', 'pack', {name: 'Yogurt greco', qty: 500, unit: 'g', category: 'Latticini e uova'}],
  ['etichetta.png', 'expiry', {expiry: '2027-05-31', barcode: '8001120062017'}],
  ['yogurt-etichetta.png', 'expiry', {expiry: '2027-04-18'}],
  // Foto difficili
  ['hard/fronte-piccolo.jpg', 'pack', {name: 'Rigatoni', qty: 500, unit: 'g'}],
  ['hard/fronte-inclinato.jpg', 'pack', {name: 'Penne rigate', brand: 'De Cecco'}],
  ['hard/fronte-cupo.jpg', 'pack', {name: 'Farina 00', qty: 1000}],
  ['hard/fronte-riflesso.jpg', 'pack', {name: 'Latte intero'}],
  ['hard/timbro-minuscolo.jpg', 'expiry', {expiry: '2027-04-18'}],
  ['hard/data-sfocata.jpg', 'expiry', {expiry: '2027-07-05'}],
  ['hard/data-scura.jpg', 'expiry', {expiry: '2027-04-18'}],
  ['hard/data-ruotata-90.jpg', 'expiry', {expiry: '2027-06-30'}]
];

function checkField(parsed, barcode, field, expected) {
  if (field === 'barcode') return barcode === expected;
  const got = parsed[field];
  if (field === 'qty') return Number(got) === Number(expected);
  if (field === 'name') {
    const norm = s => String(s || '').toLowerCase().replace(/[^a-zà-ÿ0-9 ]/g, '').replace(/\s+/g, ' ').trim();
    return norm(got).includes(norm(expected));
  }
  if (field === 'brand') return String(got || '').toLowerCase().includes(String(expected).toLowerCase());
  return got === expected;
}

(async () => {
  let pass = 0, fail = 0;
  const failures = [];
  for (const [file, role, expect] of CASES) {
    const photo = gray(path.join(FIXTURES, file));
    const res = await analyse(photo, role, role === 'pack' ? 2 : 3);
    res.barcode = decodeBarcode(photo, res.parsed);
    const bad = [];
    for (const [field, expected] of Object.entries(expect)) {
      const ok = checkField(res.parsed, res.barcode, field, expected);
      if (ok) continue;
      bad.push(field);
    }
    const label = (file + ' ').padEnd(32, '.');
    if (!bad.length) {
      pass++;
      console.log(`OK   ${label} ${res.ms}ms  name="${res.parsed.name}" exp=${res.parsed.expiry || '-'} qty=${res.parsed.qty || '-'} bc=${res.barcode || '-'}`);
    } else {
      fail++;
      const got = {};
      for (const f of Object.keys(expect)) got[f] = f === 'barcode' ? res.barcode : res.parsed[f];
      console.log(`FAIL ${label} ${res.ms}ms  atteso ${JSON.stringify(expect)} · letto ${JSON.stringify(got)}`);
      failures.push({file, expect, got, text: res.text});
    }
  }
  console.log(`\nRisultato: ${pass}/${pass + fail} foto riconosciute correttamente`);
  if (failures.length) {
    console.log('\n=== Testo grezzo letto nelle foto fallite ===');
    for (const f of failures) {
      console.log(`\n--- ${f.file} ---`);
      console.log(f.text.trim().split('\n').slice(0, 14).join('\n'));
    }
  }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
