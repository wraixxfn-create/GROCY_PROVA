/*
 * Prova il motore OCR vero sulle foto di tests/fixtures: Tesseract compilato in
 * WebAssembly, avviato direttamente in Node come fa il WebView dell'app.
 * Richiede gli asset generati da `npm run vendor:ocr` e ImageMagick per
 * decodificare le immagini di prova; altrimenti i test vengono saltati.
 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

const ASSETS = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets');
const VENDOR = path.join(ASSETS, 'vendor');
const FIXTURES = path.join(__dirname, 'fixtures');

const hasVendor = fs.existsSync(path.join(VENDOR, 'tesseract-core-simd-lstm.wasm.js'))
  && fs.existsSync(path.join(VENDOR, 'ita.traineddata.b64.js'));
let hasConvert = true;
try { execFileSync('convert', ['-version'], {stdio: 'ignore'}); } catch (e) { hasConvert = false; }

const skip = !hasVendor ? 'asset OCR assenti: esegui npm run vendor:ocr'
  : !hasConvert ? 'serve ImageMagick (convert) per leggere le foto di prova'
  : false;

// "convert" porta la foto in scala di grigi a 8 bit: è esattamente il formato
// che il ponte Android passa a JavaScript.
function gray(file) {
  const size = execFileSync('identify', ['-format', '%w %h', file]).toString().trim().split(' ').map(Number);
  const raw = execFileSync('convert', [file, '-colorspace', 'Gray', '-depth', '8', 'gray:-'], {maxBuffer: 1 << 27});
  return {width: size[0], height: size[1], gray: new Uint8Array(raw)};
}

let engine = null;
function load() {
  global.window = globalThis;
  global.TesseractCore = require(path.join(VENDOR, 'tesseract-core-simd-lstm.wasm.js'));
  require(path.join(VENDOR, 'ita.traineddata.b64.js'));
  engine = require(path.join(ASSETS, 'ocr.js'));
  return engine;
}
const Barcode = require(path.join(ASSETS, 'barcode.js'));
const Recognize = require(path.join(ASSETS, 'recognize.js'));

async function readPhoto(name, role) {
  const photo = gray(path.join(FIXTURES, name));
  const ocr = load();
  const result = await ocr.read(photo.gray, photo.width, photo.height, {psm: 3});
  const parsed = Recognize.parse(result.text, {role, checksum: Barcode.checksum});
  const barcode = Barcode.decodeGray(photo.gray, photo.width, photo.height, {minVotes: 3});
  assert.ok(result.ms < 30000, 'lettura troppo lenta: ' + result.ms + ' ms');
  return {parsed, barcode, text: result.text, ms: result.ms};
}

test('il motore OCR legge il fronte della confezione', {skip}, async () => {
  const {parsed} = await readPhoto('confezione.jpg', 'pack');
  assert.equal(parsed.name, 'Passata di pomodoro');
  assert.equal(parsed.brand, 'Mutti');
  assert.equal(parsed.qty, 700);
  assert.equal(parsed.unit, 'g');
  assert.equal(parsed.category, 'Conserve');
});

test('il motore OCR legge l’etichetta e il codice a barre stampato', {skip}, async () => {
  const {parsed, barcode} = await readPhoto('etichetta.png', 'label');
  assert.equal(parsed.expiry, '2027-05-31');
  assert.equal(barcode, '8001120062017');
  assert.equal(parsed.qty, null, 'i valori nutrizionali non sono una quantità');
});

test('una confezione senza codice non produce falsi positivi', {skip}, async () => {
  const {parsed, barcode} = await readPhoto('yogurt-confezione.jpg', 'pack');
  assert.equal(barcode, null);
  assert.equal(parsed.name, 'Yogurt greco');
  assert.equal(parsed.qty, 500);
  assert.equal(parsed.category, 'Latticini e uova');
});

test('le due foto insieme compilano la scheda di un prodotto nuovo', {skip}, async () => {
  const pack = await readPhoto('yogurt-confezione.jpg', 'pack');
  const label = await readPhoto('yogurt-etichetta.png', 'label');
  const signal = Recognize.merge(pack.parsed, label.parsed);
  assert.equal(signal.name, 'Yogurt greco');
  assert.equal(signal.expiry, '2027-04-18');
  const draft = Recognize.draft(signal, {location: 'Frigorifero'});
  assert.equal(draft.name, 'Yogurt greco');
  assert.equal(draft.qty, 500);
  assert.equal(draft.unit, 'g');
  assert.equal(draft.category, 'Latticini e uova');
  assert.equal(draft.location, 'Frigorifero');
  assert.ok(draft.scan.keywords.includes('YOGURT'));
});

test('il motore si riavvia una volta sola e resta pronto', {skip}, async () => {
  const ocr = load();
  const first = await ocr.init();
  const second = await ocr.init();
  assert.equal(first, second);
  assert.equal(ocr.isReady(), true);
  assert.equal(ocr.error(), '');
});
