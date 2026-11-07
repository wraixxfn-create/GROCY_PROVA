# Grocy Locale — Android offline

Versione mobile **autonoma**, in italiano, ispirata a [Grocy](https://github.com/grocy/grocy). Non è un fork completo, non è il client ufficiale e non richiede un server Grocy, PHP o un PC/NAS.

## Installa l’APK dal telefono

**[Scarica Grocy Locale 1.0.0](downloads/grocy-locale-v1.0.0.apk)**

1. Scarica il file `grocy-locale-v1.0.0.apk` sul telefono Android.
2. Aprilo da Download. Se Android lo richiede, autorizza **Installa app sconosciute** per il browser o il gestore file usato. Puoi revocare questa autorizzazione dopo l’installazione.
3. Tocca **Installa** e poi **Apri**. È richiesta una versione recente di **Android System WebView**.
4. Aggiungi il primo prodotto oppure carica, facoltativamente, una dispensa dimostrativa.

**Requisiti:** Android 8.0/API 26 o successivo. APK universale, senza librerie native specifiche della CPU. Non è un’app iOS e non è pubblicata sul Play Store.

L’APK è una **prima build per installazione manuale**, firmata con certificato di sviluppo. Firma v2/v3 e allineamento verificati. Non è stata eseguita una prova su telefono fisico o emulatore Android: i test automatici riguardano la logica e l’interfaccia web, non sostituiscono un collaudo Android.

Il checksum è in [`downloads/SHA256SUMS.txt`](downloads/SHA256SUMS.txt). Nell’anteprima web c’è anche un pulsante **Scarica APK**, servito con MIME Android e intestazione di download.

## Funzioni incluse

- Panoramica con scorte, scadenze imminenti, scorte minime e articoli da acquistare.
- Inserimento, modifica e rimozione dei prodotti.
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

- Niente scansione con fotocamera: i codici a barre si inseriscono manualmente e sono ricercabili; non vengono interrogati cataloghi online.
- Niente ricette, faccende, batterie, attrezzature, prezzi o report completi di Grocy.
- Nessuna sincronizzazione, nessun account, nessuna notifica in background.
- I backup del Grocy originale **non sono compatibili**: il formato è `grocy-locale`, versione 1.
- Per confezioni con scadenze diverse crea voci separate. Non esiste un magazzino a lotti/FIFO automatico.
- Spuntare una voce della spesa **non ricarica automaticamente la dispensa**: registra il rifornimento dal pulsante `+` del prodotto, o aggiungi il prodotto mancante.
- Le scadenze sono inserite dall’utente, non certificano la sicurezza di un alimento.

## Dati e privacy

Nell’APK lo stato JSON è salvato nella memoria privata dell’app (`SharedPreferences`), non su un server. L’APK **non dichiara alcun permesso**, incluso `INTERNET`. Il WebView carica esclusivamente risorse incluse nell’APK; i caricamenti di rete e le navigazioni esterne sono bloccati. Non ci sono CDN, font remoti, analytics o dipendenze di rete a runtime.

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
npm test              # 12 test della logica, solo Node
npm start             # in un altro terminale
npm run test:browser  # test end-to-end Chromium, Linux x86_64
```

I test browser coprono interfaccia mobile/desktop, aggiunta prodotti, escaping HTML, consumi frazionari, ricerca, scorte, lista della spesa, persistenza dopo reload, backup/ripristino, azzeramento e caricamento `file://` con bridge Android simulato. Gli screenshot di verifica finiscono in `build/screenshots/`, escluso da Git. Le dipendenze di test non sono incluse nell’APK.

## Ricompilazione con Android SDK (consigliata)

Richiede JDK 17+, Android SDK Platform 35 e Build Tools 35+, Python 3. Non richiede Gradle né dipendenze Maven:

```sh
export ANDROID_HOME=/percorso/android-sdk
export JAVA_HOME=/percorso/jdk
export PATH="$JAVA_HOME/bin:$PATH"
npm run build:apk
```

Il comando compila le risorse con `aapt2`, il codice con `javac`, genera il DEX con `d8`, allinea e firma l’APK. Il risultato è in `downloads/`, con checksum aggiornato.

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
  AndroidManifest.xml                  # nessun permesso di rete o storage
  java/it/grocyprova/offline/           # WebView, persistenza e file picker nativi
  assets/                             # interfaccia HTML/CSS/JS e modello dati
  res/                                # tema e icona vettoriale
scripts/                              # anteprima, bootstrap e build APK
tests/                                # test unitari e browser
downloads/                            # APK firmato e checksum
```

## Licenza e attribuzione

Il nuovo codice è distribuito con licenza MIT, vedi `LICENSE`. Grocy originale è di Bernd Bestel ed è distribuito con licenza MIT; il riconoscimento e il testo della licenza upstream sono in `THIRD_PARTY_NOTICES.md`. Questa implementazione è indipendente e non incorpora il server PHP di Grocy.
