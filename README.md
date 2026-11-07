# Grocy Locale — Android offline

Versione mobile **autonoma**, in italiano, ispirata a [Grocy](https://github.com/grocy/grocy). Non è un fork completo, non è il client ufficiale e non richiede un server Grocy, PHP o un PC/NAS.

## Installa l’APK dal telefono

**[Scarica Grocy Locale 1.2.0](downloads/grocy-locale-v1.2.0.apk)**

1. Scarica il file `grocy-locale-v1.2.0.apk` sul telefono Android.
2. Aprilo da Download. Se Android lo richiede, autorizza **Installa app sconosciute** per il browser o il gestore file usato. Puoi revocare questa autorizzazione dopo l’installazione.
3. Tocca **Installa** e poi **Apri**. È richiesta una versione recente di **Android System WebView**.
4. Aggiungi il primo prodotto oppure carica, facoltativamente, una dispensa dimostrativa.

**Requisiti:** Android 8.0/API 26 o successivo. APK universale, senza librerie native specifiche della CPU. Non è un’app iOS e non è pubblicata sul Play Store.

L’APK è una **prima build per installazione manuale**, firmata con certificato di sviluppo. Firma v2/v3 e allineamento verificati. Non è stata eseguita una prova su telefono fisico o emulatore Android: i test automatici riguardano la logica e l’interfaccia web, non sostituiscono un collaudo Android.

La versione 1.2 aggiunge il **riconoscimento del prodotto con due foto**, interamente sul telefono: si fotografa la confezione e poi l’etichetta, e l’app legge da sola nome, marca, quantità, scadenza e codice a barre. La versione 1.1 aveva aggiunto la lettura del codice a barre dell’etichetta con la fotocamera (o da una foto, nell’anteprima web).

L’APK contiene il motore di lettura del testo (Tesseract compilato in WebAssembly) e i dati della lingua italiana: circa 8 MB di asset, che portano l’APK a 3,2 MB grazie alla compressione. Non serve rete, né un server, né una chiave API.

Il checksum è in [`downloads/SHA256SUMS.txt`](downloads/SHA256SUMS.txt). Nell’anteprima web c’è anche un pulsante **Scarica APK**, servito con MIME Android e intestazione di download.

## Funzioni incluse

- Panoramica con scorte, scadenze imminenti, scorte minime e articoli da acquistare.
- Inserimento, modifica e rimozione dei prodotti.
- **Aggiunta con il codice a barre dell’etichetta**: si scatta una foto al codice e l’app lo riconosce sul dispositivo (EAN-13, UPC-A, EAN-8), oppure lo si digita. Se il codice è già associato a un prodotto, l’app propone subito il rifornimento invece di creare un doppione.
- **Riconoscimento con due foto**: pulsante *Due foto* nella dispensa. La prima foto è la confezione (il fronte, dove sta il nome), la seconda è l’etichetta (il retro con scadenza, ingredienti, peso e codice a barre). Ogni foto può essere scattata al momento o scelta dalla galleria. L’app legge il testo con il motore OCR incluso nell’APK, ricava nome, marca, quantità con unità, categoria suggerita, scadenza (anche come mese/anno, riportato all’ultimo giorno del mese) e codice a barre, poi confronta il risultato con la dispensa: se il prodotto c’è già propone il rifornimento, altrimenti apre la scheda precompilata da confermare. Le parole chiave lette restano nel prodotto (campo `scan`), così al giro successivo il riconoscimento è più preciso e non richiede di riscrivere nulla.
- Quantità frazionarie e unità `pz`, `kg`, `g`, `l`, `ml`, `conf`.
- Consumi e rifornimenti, senza quantità negative.
- Tre luoghi: dispensa, frigorifero, congelatore.
- Categorie, ricerca per nome/note/codice a barre e ordinamento.
- Scadenze, prodotti già scaduti e intervallo di preavviso di 1/3/7/14 giorni.
- Lista della spesa con aggiunta delle scorte mancanti, spunte e rimozione degli acquistati.
- Storico delle ultime 200 attività.
- Esportazione/ripristino di backup JSON tramite il selettore file Android, senza permessi di archiviazione generali.
- Interfaccia responsive, navigazione inferiore su mobile e dialoghi di conferma.

### Limiti intenzionali della prima versione

- La scansione usa l’app fotocamera già presente su Android: non c’è un’anteprima dentro l’app e non viene richiesto il permesso `CAMERA`. Sono supportati solo EAN-13, UPC-A ed EAN-8, non QR o Code 128.
- Il riconoscimento si basa sul **testo stampato** e sul **codice a barre**, non sull’aspetto della confezione: nessun confronto di immagini, quindi nessun rischio di scambiare due prodotti simili. Se il testo non è leggibile (foto mossa, riflessi, confezione senza scritte) l’app non indovina: mostra cosa ha letto e lascia compilare a mano.
- Nessun catalogo online e nessuna ricerca per marca: il nome del prodotto lo detta la confezione. Le parole chiave imparate valgono solo per quella dispensa.
- Il motore OCR richiede WebAssembly e CSP `wasm-unsafe-eval` nel WebView: serve un **Android System WebView** aggiornato (in pratica Android 8 con WebView aggiornato dai componenti di sistema). Se il motore non si avvia, l’app continua a funzionare con il solo codice a barre e lo segnala.
- Una foto intera richiede in genere 0,3–1,5 secondi per la lettura del testo; la prima volta si aggiungono un paio di secondi per caricare il motore in memoria.
- La foto dell’etichetta non viene salvata: resta nella cache privata dell’app solo il tempo della lettura e viene eliminata subito dopo.
- Niente ricette, faccende, batterie, attrezzature, prezzi o report completi di Grocy.
- Nessuna sincronizzazione, nessun account, nessuna notifica in background.
- I backup del Grocy originale **non sono compatibili**: il formato è `grocy-locale`, versione 1.
- Per confezioni con scadenze diverse crea voci separate. Non esiste un magazzino a lotti/FIFO automatico.
- Spuntare una voce della spesa **non ricarica automaticamente la dispensa**: registra il rifornimento dal pulsante `+` del prodotto, o aggiungi il prodotto mancante.
- Le scadenze sono inserite dall’utente, non certificano la sicurezza di un alimento.

## Dati e privacy

Nell’APK lo stato JSON è salvato nella memoria privata dell’app (`SharedPreferences`), non su un server. L’APK **non dichiara alcun permesso**, incluso `INTERNET` e `CAMERA`. Il WebView carica esclusivamente risorse incluse nell’APK; i caricamenti di rete e le navigazioni esterne sono bloccati. Non ci sono CDN, font remoti, analytics o dipendenze di rete a runtime.

La lettura del codice a barre e delle due foto avviene interamente sul telefono: l’app apre la fotocamera di sistema tramite un’intenzione Android (o il selettore di documenti, per una foto dalla galleria), riceve lo scatto in un file temporaneo nella propria cache privata, lo converte in una matrice di grigi e lo elimina subito dopo la lettura. Il testo viene riconosciuto da Tesseract compilato in WebAssembly, dentro il WebView, leggendo solo asset dell’APK: nessuna immagine e nessun testo escono dal dispositivo, e nulla di quanto letto finisce nei backup (solo le poche parole chiave del campo `scan`). Nell’anteprima web le foto vengono lette nello stesso modo dal browser e non vengono caricate sul server.

L’unica concessione alla Content Security Policy è `data:` in `connect-src`, necessaria perché il motore WebAssembly si carichi da sé il proprio binario già incorporato negli asset; non abilita alcun traffico di rete, che resta bloccato sia dalla CSP sia da `setBlockNetworkLoads(true)`.

**Disinstallare l’app o cancellarne i dati elimina la dispensa. Esporta prima un backup.** Il backup non è cifrato: scegli tu dove conservarlo. Il selettore di documenti di Android può mostrare anche provider cloud del telefono, ma l’app non li usa autonomamente.

L’anteprima web salva invece nel `localStorage` di quel browser. I dati di anteprima e APK sono separati; usa un backup JSON per trasferirli. L’anteprima non è una PWA offline: l’uso senza rete è fornito dall’APK.

Un archivio non leggibile non viene sovrascritto automaticamente; l’app permette di esportare i dati originali prima del ripristino o dell’azzeramento. Limite archivio: 2 milioni di caratteri, 5.000 prodotti e 5.000 voci della spesa.

## Avvio dell’anteprima

Con Node.js 22 o successivo:

```sh
npm ci
npm start
# http://localhost:3000 — ascolto su 0.0.0.0, nessuna allowlist di host
```

Il server di anteprima serve solo file statici e l’APK; non riceve e non memorizza la dispensa.

## Test

```sh
npm test              # 40 test: modello dati, codici a barre, riconoscimento da due foto
npm run test:ocr      # 5 test del motore OCR vero sulle foto di tests/fixtures
npm start             # in un altro terminale
npm run test:browser  # test end-to-end Chromium, Linux x86_64
```

I test browser coprono interfaccia mobile/desktop, aggiunta prodotti, escaping HTML, codici a barre (inserimento manuale, doppioni e lettura da una foto), consumi frazionari, ricerca, scorte, lista della spesa, persistenza dopo reload, backup/ripristino, azzeramento, **riconoscimento con due foto** (prodotto riconosciuto con rifornimento, prodotto nuovo con scheda precompilata, parole chiave salvate) e caricamento `file://` con bridge Android simulato, dove il motore OCR viene caricato dagli asset locali come nell’APK. Gli screenshot di verifica finiscono in `build/screenshots/`, escluso da Git.

`npm run test:ocr` esegue Tesseract in Node sulle foto di `tests/fixtures/` (fronte, etichetta con codice a barre valido, prodotto diverso) e verifica cosa viene letto. Richiede gli asset OCR (`npm run vendor:ocr`) e ImageMagick per decodificare le immagini: se mancano, i test vengono saltati. Le foto di prova si rigenerano con `node tests/fixtures/make.mjs`. Le dipendenze di test non sono incluse nell’APK.

## Ricompilazione con Android SDK (consigliata)

Richiede JDK 17+, Android SDK Platform 35 e Build Tools 35+, Python 3. Non richiede Gradle né dipendenze Maven:

```sh
export ANDROID_HOME=/percorso/android-sdk
export JAVA_HOME=/percorso/jdk
export PATH="$JAVA_HOME/bin:$PATH"
npm run build:apk
```

Il comando compila le risorse con `aapt2`, il codice con `javac`, genera il DEX con `d8`, allinea e firma l’APK. Il risultato è in `downloads/`, con checksum aggiornato.

Prima di compilare, lo script prepara il motore OCR negli asset con `npm run vendor:ocr` (pacchetti npm bloccati per versione e verificati con sha256: `tesseract.js-core` e `@tesseract.js-data/ita`). La cartella `android/app/src/main/assets/vendor/` è generata e **non è versionata**: senza rete la build usa quella già presente, altrimenti va rigenerata con `npm run vendor:ocr -- --force`.

Se non esiste un keystore locale, lo script ne crea uno di sviluppo in `.tools/grocy-local.jks` (password di sviluppo `android`, non una credenziale di produzione). È possibile indicare `GROCY_KEYSTORE` per riusare un keystore con alias `grocy` e tale password. Per una pubblicazione reale va configurata una firma di produzione conservata in modo sicuro.

**Un APK firmato con una chiave diversa non può aggiornare quello già installato.** Esporta il backup prima di disinstallare/reinstallare. La build allegata usa il certificato di sviluppo integrato nel signer del percorso alternativo descritto sotto.

### Toolchain alternativa usata in questa sessione

Nel sandbox non sono preinstallati JDK e Android SDK, e i repository Google/Maven non sono raggiungibili. È disponibile un bootstrap Linux x86_64 tramite npm e GitHub:

```sh
bash scripts/bootstrap-local-tools.sh
npm run build:apk
```

Il bootstrap usa versioni fissate di runtime Java, compiler Java 8, `aapt2`, stub Android e signer; compila `dx` dai sorgenti AOSP. Nessuno di questi strumenti è incluso nell’app. Richiede `gh` già autenticato per leggere gli oggetti GitHub. La directory `.tools/` è ignorata da Git.

## Struttura

```text
android/app/src/main/
  AndroidManifest.xml                  # nessun permesso di rete, storage o fotocamera
  java/it/grocyprova/offline/           # WebView, persistenza, file picker, scatto e galleria
  assets/                             # interfaccia HTML/CSS/JS, modello dati
  assets/barcode.js                   # lettore EAN-13/UPC-A/EAN-8, nessuna libreria
  assets/recognize.js                 # parsing di nome, marca, scadenza, quantità e confronto
  assets/ocr.js                       # ponte con Tesseract in WebAssembly, solo asset locali
  assets/product-scan.js              # flusso delle due foto e relative schermate
  assets/vendor/                      # motore OCR e dati italiani (generati, non versionati)
  res/                                # tema e icona vettoriale
scripts/                              # anteprima, bootstrap e build APK
tests/                                # test unitari e browser
downloads/                            # APK firmato e checksum
```

## Licenza e attribuzione

Il nuovo codice è distribuito con licenza MIT, vedi `LICENSE`. Grocy originale è di Bernd Bestel ed è distribuito con licenza MIT; il riconoscimento e il testo della licenza upstream sono in `THIRD_PARTY_NOTICES.md`. Questa implementazione è indipendente e non incorpora il server PHP di Grocy.
