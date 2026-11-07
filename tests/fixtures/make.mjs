/*
 * Rigenera le foto di prova usate dai test (richiede ImageMagick "convert").
 * I PNG prodotti sono già inclusi nel repository: serve rifarli solo se si
 * vuole cambiare il contenuto delle etichette simulate.
 */
import {execFileSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import path from 'node:path';

const dir = path.dirname(new URL(import.meta.url).pathname);
mkdirSync(dir, {recursive: true});
const out = name => path.join(dir, name);

// EAN-13 disegnato come barre, con cifra di controllo calcolata: serve a
// verificare che il lettore trovi un codice valido anche in una foto.
const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const EAN_G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const EAN_R = EAN_L.map(p => p.replace(/[01]/g, b => (b === '0' ? '1' : '0')));
const EAN_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
function checkDigit(base) {
  let sum = 0, weight = 3;
  for (let i = base.length - 1; i >= 0; i--) { sum += Number(base[i]) * weight; weight = weight === 3 ? 1 : 3; }
  return String((10 - (sum % 10)) % 10);
}
function barcodePng(base, file, scale = 4) {
  const code = base + checkDigit(base);
  const parity = EAN_PARITY[Number(code[0])];
  let bits = '101';
  for (let i = 0; i < 6; i++) bits += parity[i] === 'L' ? EAN_L[Number(code[i + 1])] : EAN_G[Number(code[i + 1])];
  bits += '01010';
  for (let i = 0; i < 6; i++) bits += EAN_R[Number(code[i + 7])];
  bits += '101';
  const margin = 24, barHeight = 120;
  const width = margin * 2 + bits.length * scale, height = margin * 2 + barHeight;
  let draw = '';
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === '1') draw += `rectangle ${margin + i * scale},${margin} ${margin + i * scale + scale - 1},${margin + barHeight - 1} `;
  }
  execFileSync('convert', ['-size', `${width}x${height}`, 'xc:white', '-fill', '#101010', '-draw', draw, file]);
  return code;
}

const barcodeCode = barcodePng('800112006201', out('_barcode.png'));
// Fronte della confezione: nome in maiuscolo, marca, peso netto, una lieve
// rotazione e un filo di rumore per somigliare a uno scatto vero.
execFileSync('convert', [
  '-size', '1000x620', 'xc:#f4eeda',
  '-fill', '#8d1b12', '-font', 'DejaVu-Sans-Bold', '-pointsize', '78', '-gravity', 'northwest',
  '-annotate', '+60+70', 'PASSATA', '-annotate', '+60+160', 'DI POMODORO',
  '-fill', '#3b3b33', '-font', 'DejaVu-Sans', '-pointsize', '30', '-annotate', '+62+268', 'MUTTI S.p.A.',
  '-pointsize', '24', '-annotate', '+62+312', 'Via Industria 2, Parma (PR)',
  '-fill', '#2f5d3a', '-font', 'DejaVu-Sans-Bold', '-pointsize', '36', '-annotate', '+62+520', 'PESO NETTO 700 g',
  '-rotate', '0.7', '-attenuate', '0.12', '+noise', 'Gaussian', '-resize', '900x', '-quality', '86', out('confezione.jpg')
]);

// Retro: scadenza, ingredienti, tabella nutrizionale e codice a barre vero.
execFileSync('convert', [
  '-size', '900x760', 'xc:white',
  '-fill', 'black', '-font', 'DejaVu-Sans', '-pointsize', '29', '-gravity', 'northwest',
  '-annotate', '+50+45', 'Da consumarsi preferibilmente entro:',
  '-font', 'DejaVu-Sans-Bold', '-pointsize', '46', '-annotate', '+50+90', '05/2027',
  '-font', 'DejaVu-Sans', '-pointsize', '26', '-annotate', '+50+180', 'Ingredienti: pomodoro 99,8%, sale, basilico.',
  '-pointsize', '26', '-annotate', '+50+222', 'Valori medi per 100 g: energia 105 kJ / 25 kcal',
  '-pointsize', '26', '-annotate', '+50+264', 'Conservare in luogo fresco e asciutto.',
  '-pointsize', '26', '-annotate', '+50+306', 'Prodotto in Italia da Mutti S.p.A.',
  out('_etichetta-testo.png')
]);
execFileSync('convert', [out('_etichetta-testo.png'), out('_barcode.png'), '-gravity', 'south', '-composite', out('etichetta.png')]);

// Prodotto diverso, non presente nella dispensa dimostrativa: serve al test
// "nessuna corrispondenza, crea la scheda".
execFileSync('convert', [
  '-size', '900x560', 'xc:#eef4fb',
  '-fill', '#12457a', '-font', 'DejaVu-Sans-Bold', '-pointsize', '74', '-gravity', 'northwest',
  '-annotate', '+60+70', 'YOGURT', '-annotate', '+60+155', 'GRECO',
  '-fill', '#333333', '-font', 'DejaVu-Sans', '-pointsize', '28', '-annotate', '+60+270', 'FAGE S.p.A.',
  '-fill', '#12457a', '-font', 'DejaVu-Sans-Bold', '-pointsize', '34', '-annotate', '+60+460', 'CONFEZIONE DA 500 g',
  '-rotate', '0.4', '-resize', '820x', '-quality', '86', out('yogurt-confezione.jpg')
]);
execFileSync('convert', [
  '-size', '900x600', 'xc:white',
  '-fill', 'black', '-font', 'DejaVu-Sans', '-pointsize', '28', '-gravity', 'northwest',
  '-annotate', '+50+45', 'Da consumare entro il:',
  '-font', 'DejaVu-Sans-Bold', '-pointsize', '44', '-annotate', '+50+92', '18/04/2027',
  '-font', 'DejaVu-Sans', '-pointsize', '25', '-annotate', '+50+180', 'Yogurt greco intero.',
  '-pointsize', '25', '-annotate', '+50+222', 'Ingredienti: latte, fermenti lattici vivi.',
  '-pointsize', '25', '-annotate', '+50+264', 'Conservare in frigorifero a +4 gradi.',
  '-pointsize', '25', '-annotate', '+50+306', 'Prodotto da Fage S.p.A.',
  out('yogurt-etichetta.png')
]);

for (const name of ['_barcode.png', '_etichetta-testo.png']) execFileSync('rm', ['-f', out(name)]);
console.log('Foto di prova rigenerate in tests/fixtures/ · codice a barre:', barcodeCode);
