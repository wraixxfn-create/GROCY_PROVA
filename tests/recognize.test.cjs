const {test} = require('node:test');
const assert = require('node:assert/strict');
const R = require('../android/app/src/main/assets/recognize.js');
const B = require('../android/app/src/main/assets/barcode.js');

// Testo vero prodotto dal motore OCR sulle foto di tests/fixtures.
const FRONTE = ['PASSATA', 'DI POMODORO', 'MUTTI S.p.A.', 'Via Industria 2, Parma (PR)', 'PESO NETTO 700 g'].join('\n');
const RETRO = ['Da consumarsi preferibilmente entro:', '05/2027', 'Ingredienti: pomodoro 99,8%, sale, basilico.',
  'Valori medi per 100 g: energia 105 kj / 25 kcal', 'Conservare in luogo fresco e asciutto.',
  'Prodotto in Italia da Mutti S.p.A.'].join('\n');
const CODICE = '8001120062017'; // EAN-13 con cifra di controllo valida

const parseFronte = extra => R.parse(FRONTE + (extra ? '\n' + extra : ''), {role: 'pack', checksum: B.checksum});
const parseRetro = extra => R.parse(RETRO + (extra ? '\n' + extra : ''), {role: 'label', checksum: B.checksum});

test('il fronte dà nome, marca, quantità e categoria', () => {
  const parsed = parseFronte();
  assert.equal(parsed.name, 'Passata di pomodoro');
  assert.equal(parsed.brand, 'Mutti');
  assert.equal(parsed.qty, 700);
  assert.equal(parsed.unit, 'g');
  assert.equal(parsed.category, 'Conserve');
  assert.equal(parsed.expiry, '');
});

test('il retro dà il termine minimo di conservazione a fine mese', () => {
  const parsed = parseRetro();
  assert.equal(parsed.expiry, '2027-05-31');
  assert.ok(parsed.expiryConfidence > 0.5);
  assert.equal(parsed.name, '');
});

test('una data precisa resta un giorno preciso', () => {
  const parsed = R.parse('Da consumare entro il:\n18/04/2027\nYogurt greco intero.', {role: 'label'});
  assert.equal(parsed.expiry, '2027-04-18');
});

test('formati di scadenza italiani e internazionali', () => {
  const cases = [
    ['SCADENZA 12/2026', '2026-12-31'],
    ['TMC 03.27', '2027-03-31'],
    ['Da consumarsi preferibilmente entro 07/2026', '2026-07-31'],
    ['Scad. 2027-01-15', '2027-01-15'],
    ['DIC 2028', '2028-12-31']
  ];
  for (const [line, expected] of cases) {
    const parsed = R.parse(line, {role: 'label', now: '2026-01-15T12:00:00Z'});
    assert.equal(parsed.expiry, expected, line);
  }
});

test('senza indizi la data ha meno peso di una riga con SCADENZA', () => {
  const parsed = R.parse('Lotto 05/2026\nDa consumarsi preferibilmente entro:\n09/2027', {role: 'label'});
  assert.equal(parsed.expiry, '2027-09-30');
});

test('i numeri della tabella nutrizionale non diventano quantità', () => {
  const parsed = parseRetro();
  assert.equal(parsed.qty, null);
  assert.equal(parsed.unit, '');
});

test('la quantità arriva dal peso netto, non dai valori medi', () => {
  assert.deepEqual(R.pickQuantity('Valori medi per 100 g: energia 105 kj\nPESO NETTO 700 g'),
    {qty: 700, unit: 'g', confidence: 0.8});
  assert.deepEqual(R.pickQuantity('Contenuto netto 1,5 l'), {qty: 1.5, unit: 'l', confidence: 0.8});
  assert.deepEqual(R.pickQuantity('6 x 125 g'), {qty: 6, unit: 'pz', confidence: 0.8});
  assert.deepEqual(R.pickQuantity('150 cl'), {qty: 1500, unit: 'ml', confidence: 0.6});
});

test('un codice valido si legge anche con gli spazi, uno sbagliato no', () => {
  assert.equal(R.pickBarcode('Codice a barre ' + CODICE, B.checksum), CODICE);
  assert.equal(R.pickBarcode('EAN: 8 001120 062017', B.checksum), CODICE);
  assert.equal(R.pickBarcode('Codice a barre 8001120062012', B.checksum), '');
});

test('le cifre sparse di una tabella non diventano un codice', () => {
  assert.equal(R.pickBarcode('Valori medi per 100 g: energia 105 kj / 25 kcal', B.checksum), '');
  assert.equal(R.pickBarcode('Pomodoro 99,8% - sale - 5 g di zucchero', B.checksum), '');
});

test('nome e marca ripuliti: frase per il prodotto, maiuscole per la marca', () => {
  assert.equal(R.smartTitle('PASSATA DI POMODORO'), 'Passata di pomodoro');
  assert.equal(R.brandCase('MUTTI S.p.A.'), 'MUTTI S.p.A.');
  assert.equal(R.brandCase('MUTTI SPA'), 'Mutti Spa');
  assert.equal(R.brandCase('barilla'), 'barilla');
});

test('righe di ingredienti e società non diventano il nome', () => {
  const parsed = R.parse('Da consumarsi preferibilmente entro:\nIngredienti: latte, sale\nGRANAROLO S.p.A.', {role: 'label'});
  assert.equal(parsed.name, '');
  assert.equal(parsed.brand, 'Granarolo');
});

test('i frammenti di una foto inclinata non finiscono nel nome', () => {
  // Righe tipiche che produce l\'OCR su una confezione ruotata: il titolo vero
  // seguito da spezzoni illeggibili e dalla riga del peso.
  const parsed = R.parse(['PENNE RIGATE', 'SEO', 'RO NERO 500,'].join('\n'), {role: 'pack'});
  assert.equal(parsed.name, 'Penne rigate');
  // Due righe dello stesso titolo (stessa dimensione) continuano a unirsi.
  const ok = R.parse(['PASSATA', 'DI POMODORO', 'MUTTI S.p.A.'].join('\n'), {role: 'pack'});
  assert.equal(ok.name, 'Passata di pomodoro');
});

test('due foto si fondono: scadenza dall’etichetta, quantità dal fronte', () => {
  const signal = R.merge(parseFronte(), parseRetro());
  assert.equal(signal.name, 'Passata di pomodoro');
  assert.equal(signal.brand, 'Mutti');
  assert.equal(signal.expiry, '2027-05-31');
  assert.equal(signal.expirySource, 'label');
  assert.equal(signal.qty, 700);
  assert.equal(signal.unit, 'g');
  assert.equal(signal.category, 'Conserve');
  assert.ok(signal.keywords.includes('POMODORO'));
});

const dispensa = () => ([
  {id: 'a', name: 'Passata di pomodoro', qty: 2, min: 1, unit: 'pz', category: 'Conserve', location: 'Dispensa', expiry: '', barcode: '', notes: ''},
  {id: 'b', name: 'Latte intero', qty: 1, min: 1, unit: 'l', category: 'Latticini e uova', location: 'Frigorifero', expiry: '', barcode: '8000000000000', notes: ''},
  {id: 'c', name: 'Biscotti integrali', qty: 1, min: 1, unit: 'conf', category: 'Pasta e cereali', location: 'Dispensa', expiry: '', barcode: '', notes: ''}
]);

test('il nome letto riconosce il prodotto giusto e solo quello', () => {
  const results = R.rank(dispensa(), R.merge(parseFronte(), parseRetro()));
  assert.equal(results.length, 1);
  assert.equal(results[0].product.name, 'Passata di pomodoro');
  assert.ok(results[0].score >= 0.85);
  assert.deepEqual(results[0].reasons, ['nome']);
});

test('il codice a barre è una certezza e vince su tutto', () => {
  const signal = R.merge(parseFronte(), parseRetro());
  signal.barcode = '8000000000000';
  const results = R.rank(dispensa(), signal);
  assert.equal(results[0].product.name, 'Latte intero');
  assert.equal(results[0].score, 1);
  assert.ok(results[0].reasons.includes('barcode'));
});

test('un prodotto che non c’entra non viene proposto', () => {
  const signal = R.merge(R.parse('DETERSIVO PIATTI\nLIMONE', {role: 'pack'}), null);
  assert.deepEqual(R.rank(dispensa(), signal), []);
});

test('le parole chiave imparate aiutano al secondo giro', () => {
  const products = dispensa();
  products[0].scan = {keywords: ['MUTTI', 'BASILICO', 'PASSATA']};
  const signal = R.merge(R.parse('PASSATA\n700 g', {role: 'pack'}), parseRetro());
  const results = R.rank(products, signal);
  assert.equal(results[0].product.name, 'Passata di pomodoro');
});

test('senza nessun indizio l’app si astiene invece di indovinare', () => {
  const signal = R.merge(R.parse('', {role: 'pack'}), R.parse('', {role: 'label'}));
  assert.deepEqual(R.rank(dispensa(), signal), []);
  assert.deepEqual(R.draft(signal, {location: 'Frigorifero'}), {
    name: '', qty: 1, unit: 'pz', min: 1, category: 'Altro', location: 'Frigorifero', expiry: '', production: '', barcode: '', notes: '', scan: {keywords: []}
  });
});

test('la bozza proposta è pronta per il modulo prodotto', () => {
  const draft = R.draft(R.merge(parseFronte(), parseRetro()), {location: 'Dispensa'});
  assert.equal(draft.name, 'Passata di pomodoro');
  assert.equal(draft.qty, 700);
  assert.equal(draft.unit, 'g');
  assert.equal(draft.expiry, '2027-05-31');
  assert.equal(draft.category, 'Conserve');
  assert.equal(draft.notes, 'Mutti');
  assert.ok(draft.scan.keywords.includes('POMODORO'));
  assert.ok(draft.scan.keywords.length <= 20);
  assert.ok(!draft.scan.keywords.includes('INGREDIENTI'));
});

test('le parole chiave scartano numeri e parole generiche', () => {
  const words = R.keywordsOf('Ingredienti: pomodoro 99 8 sale basilico PESO NETTO 700 g conservare');
  assert.ok(words.includes('POMODORO'));
  assert.ok(words.includes('BASILICO'));
  assert.ok(!words.includes('INGREDIENTI'));
  assert.ok(!words.includes('PESO'));
  assert.ok(!words.some(w => /^\d+$/.test(w)));
});

test('categorie suggerite dalle parole dell’etichetta', () => {
  assert.equal(R.categoryOf('YOGURT GRECO INTERO'), 'Latticini e uova');
  assert.equal(R.categoryOf('PISELLI SURGELATI FINI'), 'Surgelati');
  assert.equal(R.categoryOf('SPAGHETTI DI SEMOLA'), 'Pasta e cereali');
  assert.equal(R.categoryOf('SUCCO DI ARANCIA'), 'Bevande');
  assert.equal(R.categoryOf('DETERSIVO LIMONE'), 'Altro');
});

test('somiglianza: nomi simili passano, nomi diversi no', () => {
  assert.ok(R.similarity('Passata di pomodoro', 'Passata di pomodoro') > 0.99);
  assert.ok(R.similarity('Passata di pomodoro', 'Passata pomodoro') > 0.85);
  assert.ok(R.similarity('Passata di pomodoro', 'Biscotti integrali') < 0.3);
});

test('scadenze su prodotti freschi (giorno/mese senza anno), timbri con spazi e scambi O/0', () => {
  const ref = '2026-11-07T12:00:00Z';
  assert.equal(R.parse('DA CONSUMARSI ENTRO: 18/11', {role: 'expiry', now: ref}).expiry, '2026-11-18');
  assert.equal(R.parse('SCAD. 10/11', {role: 'expiry', now: ref}).expiry, '2026-11-10');
  assert.equal(R.parse('SCAD 05/01', {role: 'expiry', now: ref}).expiry, '2027-01-05');
  assert.equal(R.parse('18 04 27', {role: 'expiry', now: ref}).expiry, '2027-04-18');
  assert.equal(R.parse('15 NOV 2026', {role: 'expiry', now: ref}).expiry, '2026-11-15');
  assert.equal(R.parse('SCAD 18/O4/2O27', {role: 'expiry', now: ref}).expiry, '2027-04-18');
});

test('luogo di conservazione suggerito automaticamente dalla categoria e dal testo', () => {
  assert.equal(R.locationOf('Surgelati', 'Pisellini primavera'), 'Congelatore');
  assert.equal(R.locationOf('Latticini e uova', 'Mozzarella fresca'), 'Frigorifero');
  assert.equal(R.locationOf('Latticini e uova', 'Latte parzialmente scremato UHT lunga conservazione'), 'Dispensa');
  assert.equal(R.locationOf('Carne e pesce', 'Tonno all\'olio di oliva in scatola'), 'Dispensa');
  assert.equal(R.locationOf('Pasta e cereali', 'Spaghetti di semola'), 'Dispensa');
});

test('una data antecedente a oggi è produzione, non scadenza', () => {
  const ref = '2026-11-07T12:00:00Z';
  const soloPassata = R.parse('SCADENZA 18/04/2026', {role: 'expiry', now: ref});
  assert.equal(soloPassata.expiry, '');
  assert.equal(soloPassata.production, '2026-04-18');
  const futura = R.parse('SCADENZA 18/04/2027', {role: 'expiry', now: ref});
  assert.equal(futura.expiry, '2027-04-18');
  assert.equal(futura.production, '');
  const oggi = R.parse('SCADENZA 07/11/2026', {role: 'expiry', now: ref});
  assert.equal(oggi.expiry, '2026-11-07');
  assert.equal(oggi.production, '');
});

test('produzione e scadenza sulla stessa confezione restano separate', () => {
  const ref = '2026-11-07T12:00:00Z';
  const parsed = R.parse('PRODOTTO IL 10/01/2026\nDA CONSUMARSI ENTRO 10/01/2028', {role: 'expiry', now: ref});
  assert.equal(parsed.production, '2026-01-10');
  assert.equal(parsed.expiry, '2028-01-10');
  const signal = R.merge(R.parse('', {role: 'pack', now: ref}), parsed);
  assert.equal(signal.production, '2026-01-10');
  assert.equal(signal.expiry, '2028-01-10');
  assert.equal(R.draft(signal).production, '2026-01-10');
});
