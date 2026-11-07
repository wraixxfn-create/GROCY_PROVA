# Grocy Locale 2.0 — Dispensa sul telefono (senza server)

App mobile **autonoma**, in italiano, per gestire dispensa, frigorifero, congelatore, scadenze e lista della spesa direttamente dal telefono — **senza alcun server da installare o mantenere** e **senza chiavi API**.

## Installa l’APK sul telefono Android

**[Scarica Grocy Locale 2.0.0](downloads/grocy-locale-v2.0.0.apk)**

1. Scarica `grocy-locale-v2.0.0.apk` sul telefono Android (oppure usa il pulsante **Scarica APK** dall’anteprima web).
2. Aprilo da *Download* e, se richiesto, consenti **Installa app sconosciute**.
3. Tocca **Installa** e poi **Apri** (Android 8.0 / API 26 o successivo).

> **Nota aggiornamento da v1.x:** se hai già installato una versione precedente con dati importanti, esporta prima il backup JSON da *Impostazioni → Esporta backup* e reimportalo dopo l’installazione. I backup v1 sono pienamente compatibili.

Checksum SHA-256 in [`downloads/SHA256SUMS.txt`](downloads/SHA256SUMS.txt).

## Cosa cambia nella versione 2.0

- **Interfaccia ripensata e immediata**:
  - Si apre direttamente sulla **Dispensa** ordinata per scadenza, senza schermate superflue.
  - Filtri rapidi a 1 tocco per **Tutti**, **In scadenza**, **Dispensa**, **Frigorifero** e **Congelatore**, oltre alle categorie.
  - Pulsanti **`−` / `+`** direttamente su ogni prodotto per scalare o aggiungere quantità con un solo tocco (e quando un prodotto finisce puoi mandarlo subito nella **Spesa**).
  - Tre sole sezioni chiare: **Dispensa**, **Spesa**, **Impostazioni**.
- **Inserimento guidato con 2 foto**:
  1. **Foto 1 — Fronte della confezione**: salva la **miniatura a colori** del prodotto e legge nome, marca e categoria (avviando l’analisi in background mentre giri la confezione).
  2. **Foto 2 — Data di scadenza dietro**: legge la data di scadenza — se la data letta è già passata, la interpreta come **data di produzione** e la salva in un campo separato, senza segnare il prodotto come scaduto (formati italiani `GG/MM/AAAA`, `GG.MM.AA`, `GG MM AA`, `MM/AAAA`, date freschi `GG/MM`, mesi testuali `15 NOV 2026`, con secondo passaggio automatico ad alto contrasto sul centro della foto per i timbri piccoli).
  3. **Controlla e salva**: scheda essenziale già pronta con miniatura del prodotto, anteprima della foto scadenza, categoria a icone, luogo suggerito in automatico (*Frigorifero* per latticini/freschi, *Congelatore* per surgelati, *Dispensa* per secchi/conserve) e pulsante **Salva in dispensa**.
- **Tutto sul telefono + Open Food Facts via internet (zero server, zero chiavi API)**:
  - Tutti i dati (prodotti, miniature, scadenze, catalogo imparato e lista della spesa) restano salvati **solo sul telefono**.
  - Sul dispositivo gira il motore OCR locale (Tesseract in WebAssembly incluso nell’APK) più il lettore di codici a barre EAN-13/UPC-A/EAN-8.
  - Quando il telefono ha internet, l’app interroga direttamente in HTTPS il catalogo pubblico gratuito **[Open Food Facts](https://it.openfoodfacts.org)** per migliorare il nome del prodotto e la categoria (sia tramite codice a barre sia tramite il testo letto sul fronte), senza bisogno di alcun server intermedio né di registrare account o chiavi API.
  - Se non c’è campo (es. in cantina o modalità aereo), funziona comunque in automatico con il solo motore OCR locale e la memoria dei prodotti già scansionati.

## Avvio dell’anteprima web

Con Node.js 22+:

```sh
npm ci
npm start
# http://localhost:3000 (ascolto su 0.0.0.0)
```

## Test e ricompilazione APK

```sh
npm test              # test unitari: modello, miniature, codici a barre, scadenze, Open Food Facts
npm run vendor:ocr    # prepara gli asset OCR WebAssembly locali
npm run test:ocr      # test del motore OCR reale sulle foto di tests/fixtures
npm run test:browser  # test end-to-end mobile, desktop e WebView Android file://
npm run build:apk     # compila, allinea, firma e verifica downloads/grocy-locale-v2.0.0.apk
```

Se nell’ambiente non sono installati Android SDK e JDK, esegui prima `bash scripts/bootstrap-local-tools.sh` e poi `npm run build:apk`.

## Licenza

Distribuito con licenza MIT (`LICENSE`). Ispirato a [Grocy](https://github.com/grocy/grocy) di Bernd Bestel (MIT, vedi `THIRD_PARTY_NOTICES.md`); implementazione autonoma senza server. Dati del catalogo pubblico da Open Food Facts (ODbL).
