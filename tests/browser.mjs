import { chromium } from 'playwright-core';
import binary from '@sparticuz/chromium';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { brotliDecompressSync } from 'node:zlib';
import path from 'node:path';

const executablePath = await binary.executablePath();
if (process.platform === 'linux' && execFileSync('ldd', [executablePath], { encoding: 'utf8' }).includes('not found')) {
  await mkdir('.tools/chromium-libs', { recursive: true });
  await writeFile('.tools/chromium-libs.tar', brotliDecompressSync(await readFile('node_modules/@sparticuz/chromium/bin/al2023.tar.br')));
  execFileSync('tar', ['xf', '.tools/chromium-libs.tar', '-C', '.tools/chromium-libs']);
  process.env.LD_LIBRARY_PATH = path.resolve('.tools/chromium-libs/lib') + (process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : '');
}

const browser = await chromium.launch({
  executablePath,
  args: binary.args.filter(a => !a.includes('disable-web-security') && !a.includes('allow-running-insecure-content')),
  headless: true
});

const errors = [];
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true
});
page.on('pageerror', err => errors.push(err.message));

// Simula Open Food Facts quando interrogato (e testa anche il caso offline più avanti)
let offMode = 'online';
await page.route('https://*.openfoodfacts.org/**', async route => {
  if (offMode === 'offline') {
    await route.abort('internetdisconnected');
    return;
  }
  const url = route.request().url();
  if (url.includes('/api/v2/product/8001120062017')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 1,
        code: '8001120062017',
        product: {
          product_name_it: 'Passata di pomodoro',
          brands: 'Mutti',
          categories_tags: ['en:canned-foods', 'en:tomato-sauces'],
          quantity: '700 g'
        }
      })
    });
    return;
  }
  if (url.includes('yogurt') || url.includes('Yogurt')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        products: [
          {
            code: '5201054017254',
            product_name_it: 'Yogurt greco Total 0%',
            brands: 'Fage',
            categories_tags: ['en:dairies', 'en:yogurts'],
            quantity: '500 g'
          }
        ]
      })
    });
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ products: [] })
  });
});

await mkdir('build/screenshots', { recursive: true });

const nav = async label => {
  await page.locator('.bottom-nav').getByRole('button', { name: new RegExp(label, 'i') }).click();
};

await page.goto('http://127.0.0.1:3000');

// 1. All'apertura atterra subito sulla Dispensa pulita (nessun overflow orizzontale)
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Nessun overflow mobile iniziale');
await page.screenshot({ path: 'build/screenshots/empty-mobile.png', fullPage: true });

// 2. Carica dati di esempio e verifica filtri rapidi (Tutti / In scadenza / Dispensa / Frigorifero / Congelatore)
await page.locator('[data-action="demo"]').click();
assert.equal(await page.locator('.product-card').count(), 8);
await page.locator('[data-action="place"][data-place="Frigorifero"]').click();
assert.equal(await page.locator('.product-card').count(), 4);
await page.locator('[data-action="place"][data-place="Congelatore"]').click();
assert.equal(await page.locator('.product-card').count(), 1);
await page.locator('[data-action="place"][data-place="expiring"]').click();
assert.equal(await page.locator('.product-card').count(), 3);
await page.locator('[data-action="place"][data-place="all"]').click();
assert.equal(await page.locator('.product-card').count(), 8);

// 3. Flusso guidato a 2 FOTO per un nuovo prodotto (Yogurt greco: fronte -> scadenza -> conferma con miniatura)
await page.locator('.fab').click();
assert.match(await page.locator('#modal-title').textContent(), /Aggiungi prodotto/);
assert.match(await page.locator('#modal-content').textContent(), /1\. Fotografa il fronte/);
await page.screenshot({ path: 'build/screenshots/step1-fronte.png' });

// Foto 1: fronte confezione -> passa subito da solo al Passo 2 (scadenza)!
let chooser = page.waitForEvent('filechooser');
await page.locator('[data-action="shot-camera"][data-kind="pack"]').click();
await (await chooser).setFiles('tests/fixtures/yogurt-confezione.jpg');
await page.waitForSelector('[data-action="shot-camera"][data-kind="expiry"]');
assert.match(await page.locator('#modal-content').textContent(), /2\. Fotografa la scadenza/);
await page.screenshot({ path: 'build/screenshots/step2-scadenza.png' });

// Foto 2: data di scadenza dietro -> legge scadenza e apre direttamente Controlla e salva!
chooser = page.waitForEvent('filechooser');
await page.locator('[data-action="shot-camera"][data-kind="expiry"]').click();
await (await chooser).setFiles('tests/fixtures/yogurt-etichetta.png');
await page.waitForSelector('#s2-confirm-form', { timeout: 120000 });

// Verifica che nome/suggerimenti, categoria, luogo (Frigorifero!) e scadenza (2027-04-18) siano precompilati!
assert.equal(await page.locator('#s2-expiry').inputValue(), '2027-04-18');
assert.equal(await page.locator('.cat-option.selected').textContent().then(s => s.trim()), 'Latticini e uova');
assert.equal(await page.locator('.loc-option.selected').textContent().then(s => s.trim()), 'Frigorifero');
assert.ok((await page.locator('.confirm-thumb-wrap img').getAttribute('src')).startsWith('data:image/jpeg;base64,'));
await page.screenshot({ path: 'build/screenshots/step3-conferma.png' });

// Salva in dispensa e verifica che la scheda mostri la miniatura fotografica a colori!
await page.locator('#s2-confirm-form button[type="submit"]').click();
assert.equal(await page.locator('.product-card').count(), 9);
await page.locator('#search').fill('Yogurt greco');
assert.equal(await page.locator('.product-card').count(), 1);
assert.ok((await page.locator('.product-card .product-thumb').getAttribute('src')).startsWith('data:image/jpeg;base64,'));
await page.locator('#search').fill('');
await page.screenshot({ path: 'build/screenshots/dispensa-mobile.png', fullPage: true });

// 4. Riconoscimento in modalità offline (anche senza internet funziona tutto col motore OCR locale)
offMode = 'offline';
await page.locator('.fab').click();
chooser = page.waitForEvent('filechooser');
await page.locator('[data-action="shot-camera"][data-kind="pack"]').click();
await (await chooser).setFiles('tests/fixtures/confezione.jpg');
await page.waitForSelector('[data-action="shot-camera"][data-kind="expiry"]');

chooser = page.waitForEvent('filechooser');
await page.locator('[data-action="shot-gallery"][data-kind="expiry"]').click();
await (await chooser).setFiles('tests/fixtures/etichetta.png');
await page.waitForSelector('#s2-confirm-form', { timeout: 120000 });

assert.equal(await page.locator('#s2-name').inputValue(), 'Passata di pomodoro');
assert.equal(await page.locator('#s2-expiry').inputValue(), '2027-05-31');
assert.equal(await page.locator('.cat-option.selected').textContent().then(s => s.trim()), 'Conserve');
// Propone anche il banner "+1 Rifornisci" perché Passata di pomodoro è già in dispensa!
assert.equal(await page.locator('[data-action="s2-quick-restock"]').count(), 1);
await page.locator('[data-action="s2-quick-restock"]').click();
await page.locator('#search').fill('Passata di pomodoro');
assert.match(await page.locator('.step-val').first().textContent(), /^3/);
await page.locator('#search').fill('');

// 5. Stepper rapido 1-tap (- / +) direttamente sulla scheda prodotto senza modali inutili
await page.locator('#search').fill('Yogurt bianco');
assert.match(await page.locator('.step-val').first().textContent(), /^2/);
await page.locator('[data-action="step-down"]').first().click();
assert.match(await page.locator('.step-val').first().textContent(), /^1/);
await page.locator('[data-action="step-down"]').first().click();
assert.match(await page.locator('.step-val').first().textContent(), /^0/);
assert.equal(await page.locator('[data-action="to-shopping"]').count(), 1);
await page.locator('[data-action="to-shopping"]').click();
await page.locator('#search').fill('');

// 6. Inserimento manuale con controllo XSS escaping
await page.locator('[data-action="add-manual"]').click();
await page.locator('#s2-name').fill('Farina <integrale>');
await page.locator('[data-action="s2-set-cat"][data-cat="Pasta e cereali"]').click();
await page.locator('#s2-confirm-form button[type="submit"]').click();
await page.locator('#search').fill('Farina');
assert.equal(await page.locator('.product-title').textContent(), 'Farina <integrale>');
await page.locator('#search').fill('');

// 7. Lista della spesa rapida
await nav('Spesa');
await page.locator('#quick-shopping-form [name="name"]').fill('Caffè macinato');
await page.locator('#quick-shopping-form button[type="submit"]').click();
await page.locator('[data-action="shortages"]').click();
const countBefore = await page.locator('.shopping-row').count();
assert.ok(countBefore >= 4);
await page.screenshot({ path: 'build/screenshots/spesa-mobile.png', fullPage: true });
await page.locator('[data-action="toggle-shopping"]').first().click();
assert.equal(await page.locator('.shopping-row.done').count(), 1);
await page.locator('[data-action="clear-done"]').click();
assert.equal(await page.locator('.shopping-row').count(), countBefore - 1);

// 8. Impostazioni, backup con miniature conservate, reset e ripristino
await nav('Impostazioni');
await page.locator('#warning-days').selectOption('7');
const dlPromise = page.waitForEvent('download');
await page.locator('[data-action="export"]').click();
const dl = await dlPromise;
assert.match(dl.suggestedFilename(), /^grocy-locale-.*\.json$/);
await dl.saveAs('build/test-backup.json');

await page.locator('[data-action="reset"]').click();
await page.getByRole('button', { name: 'Elimina tutti i dati', exact: true }).click();
await nav('Dispensa');
assert.equal(await page.locator('.product-card').count(), 0);

await nav('Impostazioni');
await page.locator('#import-file').setInputFiles('build/test-backup.json');
await page.getByRole('button', { name: 'Ripristina backup', exact: true }).click();
await nav('Dispensa');
assert.equal(await page.locator('.product-card').count(), 10);
await page.locator('#search').fill('Yogurt greco');
assert.ok((await page.locator('.product-card .product-thumb').getAttribute('src')).startsWith('data:image/jpeg;base64,'), 'miniatura preservata nel backup');
await page.locator('#search').fill('');

// 9. Verifica layout desktop senza overflow
await page.setViewportSize({ width: 1366, height: 900 });
await page.screenshot({ path: 'build/screenshots/dispensa-desktop.png', fullPage: true });
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Nessun overflow desktop');

// 10. Verifica caricamento file:// (come dentro il WebView dell'APK Android) con ponte Android + Open Food Facts nativo
const filePage = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
filePage.on('pageerror', err => errors.push(err.message));
await filePage.addInitScript(() => {
  let saved = '';
  window.Android = {
    loadState: () => saved,
    saveState: raw => { saved = raw; return true; },
    exportBackup: () => {},
    importBackup: () => {},
    fetchJson: (reqId, url) => {
      setTimeout(() => {
        if (url.includes('openfoodfacts.org')) {
          window.onNativeHttp(reqId, true, JSON.stringify({
            products: [{
              code: '8005110000102',
              product_name_it: 'Passata di pomodoro Mutti',
              brands: 'Mutti',
              categories_tags: ['en:canned-foods', 'en:tomato-sauces'],
              quantity: '700 g'
            }]
          }));
        } else {
          window.onNativeHttp(reqId, false, 'Host bloccato');
        }
      }, 20);
    }
  };
});

await filePage.goto('file://' + process.cwd() + '/android/app/src/main/assets/index.html');
assert.equal(await filePage.locator('.apk-banner').count(), 0, 'Nell’APK non mostra il banner download APK');
await filePage.locator('.fab').click();
let fc = filePage.waitForEvent('filechooser');
await filePage.locator('[data-action="shot-gallery"][data-kind="pack"]').click();
await (await fc).setFiles('tests/fixtures/confezione.jpg');
await filePage.waitForSelector('[data-action="shot-gallery"][data-kind="expiry"]');

fc = filePage.waitForEvent('filechooser');
await filePage.locator('[data-action="shot-gallery"][data-kind="expiry"]').click();
await (await fc).setFiles('tests/fixtures/etichetta.png');
await filePage.waitForSelector('#s2-confirm-form', { timeout: 120000 });

assert.match(await filePage.locator('#s2-name').inputValue(), /Passata di pomodoro/);
assert.equal(await filePage.locator('#s2-expiry').inputValue(), '2027-05-31');
await filePage.locator('#s2-confirm-form button[type="submit"]').click();
assert.equal(await filePage.locator('.product-card').count(), 1);
assert.equal(await filePage.evaluate(() => !!window.GrocyOcr.isReady()), true);

assert.deepEqual(errors, []);
console.log('OK: Flusso 2 foto (fronte + scadenza), miniature a colori, Open Food Facts + fallback offline, luoghi, spesa, backup e APK file:// verificati senza errori.');
await browser.close();
