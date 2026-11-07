import {chromium} from 'playwright-core';
import binary from '@sparticuz/chromium';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {brotliDecompressSync} from 'node:zlib';
import path from 'node:path';
const executablePath=await binary.executablePath();
if(process.platform==='linux' && execFileSync('ldd',[executablePath],{encoding:'utf8'}).includes('not found')){
  await mkdir('.tools/chromium-libs',{recursive:true});
  await writeFile('.tools/chromium-libs.tar',brotliDecompressSync(await readFile('node_modules/@sparticuz/chromium/bin/al2023.tar.br')));
  execFileSync('tar',['xf','.tools/chromium-libs.tar','-C','.tools/chromium-libs']);
  process.env.LD_LIBRARY_PATH=path.resolve('.tools/chromium-libs/lib')+(process.env.LD_LIBRARY_PATH?':'+process.env.LD_LIBRARY_PATH:'');
}

// Etichette di prova per il lettore di codici a barre (EAN-13 in SVG).
const EAN_L=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const EAN_G=['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
const EAN_R=EAN_L.map(p=>p.replace(/[01]/g,b=>b==='0'?'1':'0'));
const EAN_PARITY=['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
const checkDigit=digits=>{let sum=0,weight=3;for(let i=digits.length-1;i>=0;i--){sum+=Number(digits[i])*weight;weight=weight===3?1:3;}return String((10-(sum%10))%10);};
function barcodeSvg(base,scale=3){
  const code=base+checkDigit(base),parity=EAN_PARITY[Number(code[0])];
  let bits='101';
  for(let i=0;i<6;i++)bits+=parity[i]==='L'?EAN_L[Number(code[i+1])]:EAN_G[Number(code[i+1])];
  bits+='01010';
  for(let i=0;i<6;i++)bits+=EAN_R[Number(code[i+7])];
  bits+='101';
  const margin=20,barHeight=90,width=margin*2+bits.length*scale,height=margin*2+barHeight;
  let bars='';
  for(let i=0;i<bits.length;i++)if(bits[i]==='1')bars+=`<rect x="${margin+i*scale}" y="${margin}" width="${scale}" height="${barHeight}" fill="#101010"/>`;
  return {code,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#ffffff"/>${bars}</svg>`};
}

const browser=await chromium.launch({executablePath,args:binary.args.filter(a=>!a.includes('disable-web-security')&&!a.includes('allow-running-insecure-content')),headless:true});
const errors=[];const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
page.on('pageerror',err=>errors.push(err.message));
const nav=async name=>{await page.locator('.bottom-nav').getByRole('button',{name,exact:true}).click();};
const click=async action=>{await page.locator(`[data-action="${action}"]`).first().click();};
await page.goto('http://127.0.0.1:3000');
assert.equal(await page.locator('.stat-value').first().textContent(),'0prodotti');
await click('demo');assert.equal(await page.locator('.stat-value').first().textContent(),'8prodotti');
await mkdir('build/screenshots',{recursive:true});await page.screenshot({path:'build/screenshots/home-mobile.png',fullPage:true});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Nessun overflow mobile');
await nav('Dispensa');
await click('add');
await page.locator('[name="name"]').fill('Farina <speciale>');await page.locator('[name="qty"]').fill('0.5');await page.locator('[name="min"]').fill('1');await page.locator('[name="unit"]').selectOption('kg');await page.getByRole('button',{name:'Salva prodotto'}).click();
assert.equal(await page.locator('.inventory-card').count(),9);
await page.locator('#search').fill('Farina');assert.equal(await page.locator('.inventory-card').count(),1);assert.equal(await page.locator('.card-name').textContent(),'Farina <speciale>');
await page.getByRole('button',{name:'Consuma Farina <speciale>'}).click();await page.locator('[name="amount"]').fill('0.2');await page.getByRole('button',{name:'Conferma',exact:true}).click();assert.match(await page.locator('.quantity').textContent(),/0,3/);
await page.reload();assert.equal(await page.locator('.inventory-card').count(),9);
await page.locator('#search').fill('Farina');assert.match(await page.locator('.quantity').textContent(),/0,3/);
await click('filter-low');assert.equal(await page.locator('.inventory-card').count(),1);
await nav('Spesa');await click('shortages');assert.equal(await page.locator('.shopping-row').count(),5);await click('shortages');assert.equal(await page.locator('.shopping-row').count(),5);
await click('toggle-shopping');assert.equal(await page.locator('.shopping-row.done').count(),1);await click('clear-done');assert.equal(await page.locator('.shopping-row').count(),4);
await click('add-shopping');await page.locator('[name="name"]').fill('Caffè');await page.getByRole('button',{name:'Aggiungi alla lista',exact:true}).click();assert.equal(await page.locator('.shopping-row').count(),5);
await nav('Impostazioni');await page.locator('#warning-days').selectOption('7');await page.reload();assert.equal(await page.locator('#warning-days').inputValue(),'7');
const dlPromise=page.waitForEvent('download');await click('export');const dl=await dlPromise;assert.match(dl.suggestedFilename(),/^grocy-locale-.*\.json$/);await dl.saveAs('build/test-backup.json');
await page.locator('#import-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"wrong":true}')});await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('non è un backup'));assert.match(await page.locator('#toast').textContent(),/non è un backup/);
await page.locator('#import-file').setInputFiles('build/test-backup.json');await page.waitForFunction(()=>document.querySelector('#modal').open);assert.match(await page.locator('#modal-title').textContent(),/Ripristinare/);await click('close');
await click('reset');await page.getByRole('button',{name:'Elimina tutti i dati',exact:true}).click();await nav('Dispensa');assert.equal(await page.locator('.inventory-card').count(),0);
await nav('Impostazioni');await page.locator('#import-file').setInputFiles([]);await page.locator('#import-file').setInputFiles('build/test-backup.json');await page.getByRole('button',{name:'Ripristina backup',exact:true}).click();await nav('Dispensa');assert.equal(await page.locator('.inventory-card').count(),9);
// Aggiunta con codice a barre: inserimento manuale e riconoscimento del doppione.
await click('scan');assert.match(await page.locator('#modal-title').textContent(),/codice a barre/i);
await page.locator('#barcode-form [name="barcode"]').fill('4006381333931');
await page.getByRole('button',{name:'Cerca prodotto'}).click();
await page.locator('#product-form [name="name"]').fill('Latte con codice');
assert.equal(await page.locator('#product-form [name="barcode"]').inputValue(),'4006381333931');
await page.getByRole('button',{name:'Salva prodotto'}).click();
assert.equal(await page.locator('.inventory-card').count(),10);
await click('scan');
await page.locator('#barcode-form [name="barcode"]').fill('4006381333931');
await page.getByRole('button',{name:'Cerca prodotto'}).click();
assert.match(await page.locator('#modal-title').textContent(),/già in dispensa/);
assert.match(await page.locator('#modal').textContent(),/Latte con codice/);
await page.getByRole('button',{name:/Rifornimento/}).click();
await page.locator('[name="amount"]').fill('2');await page.getByRole('button',{name:'Conferma',exact:true}).click();
await page.locator('#search').fill('Latte con codice');assert.match(await page.locator('.quantity').textContent(),/^3/);await page.locator('#search').fill('');
// Lettura da una foto dell'etichetta (come nella finestra di scansione).
const photo=barcodeSvg('800112006201');
await click('scan');
await page.locator('#scan-file').setInputFiles({name:'etichetta.svg',mimeType:'image/svg+xml',buffer:Buffer.from(photo.svg)});
await page.waitForSelector('#product-form');
assert.equal(await page.locator('#product-form [name="barcode"]').inputValue(),photo.code);
await page.locator('#product-form [name="name"]').fill('Prodotto da foto');
await page.getByRole('button',{name:'Salva prodotto'}).click();
assert.equal(await page.locator('.inventory-card').count(),11);
// Lettura direttamente dentro il form di un nuovo prodotto.
const photo2=barcodeSvg('801354401135');
await click('add');
await page.locator('[data-action="scan-into-form"]').click();
await page.locator('#scan-file').setInputFiles({name:'etichetta.svg',mimeType:'image/svg+xml',buffer:Buffer.from(photo2.svg)});
await page.waitForFunction(expected=>document.querySelector('#product-form [name="barcode"]').value===expected,photo2.code);
await click('close');
await page.screenshot({path:'build/screenshots/pantry-mobile.png',fullPage:true});
await nav('Scadenze');await click('expiry-filter');assert.equal(await page.locator('.expiry-list .product-row').count(),3);await nav('Home');
await page.setViewportSize({width:1440,height:1080});await page.screenshot({path:'build/screenshots/home-desktop.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
// Open assets with file:// as Android does; mock only the native storage API.
const file=await browser.newPage({viewport:{width:390,height:844}});file.on('pageerror',err=>errors.push(err.message));
await file.addInitScript(()=>{window.Android={loadState:()=>'',saveState:()=>true,exportBackup:()=>{},importBackup:()=>{}};});
await file.goto('file://'+process.cwd()+'/android/app/src/main/assets/index.html');await file.waitForSelector('[data-action="demo"]');assert.equal(await file.locator('.download-banner').count(),0);await file.locator('[data-action="demo"]').click();assert.equal(await file.locator('.stat-value').first().textContent(),'8prodotti');
assert.deepEqual(errors,[]);console.log('OK: mobile, desktop, CRUD, codici a barre (manuale, doppioni, foto), consumi frazionari, filtri, spesa, persistenza, backup e file:// con bridge Android.');await browser.close();
