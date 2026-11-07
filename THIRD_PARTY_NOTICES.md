# Attribuzioni

## Grocy (ispirazione, non incorporato)

Progetto originale: https://github.com/grocy/grocy

Grocy Locale è una nuova implementazione autonoma, non un'app ufficiale né una copia integrale. Non distribuisce il codice server PHP o gli asset del Grocy originale. Per riconoscere il progetto di riferimento riportiamo la sua licenza:

MIT License

Copyright (c) 2017-2026 Bernd Bestel (<https://berrnd.de>)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Strumenti di compilazione e test (non inclusi nell'app)

- AOSP Android platform e dx: Android Open Source Project, Apache-2.0 e altre licenze dei rispettivi componenti. I sorgenti dx e dex provengono da `aosp-mirror/platform_dalvik` e `LineageOS/android_libcore`.
- `Reginer/aosp-android-jar`: stub e risorse delle piattaforme Android, usati solo per compilare.
- Eclipse Temurin/OpenJDK: runtime Java nella toolchain opzionale, GPL-2.0 con Classpath Exception; licenze nella directory `runtime/legal` del pacchetto scaricato.
- OpenJDK 8 `tools.jar`: compilatore nella toolchain opzionale, GPL-2.0 con Classpath Exception.
- Android Asset Packaging Tool (`aapt2`): Android Open Source Project, Apache-2.0; distribuzione npm `aaptjs3` con relative THIRD_PARTY_NOTICES.
- `uber-apk-signer`: Patrick Favre-Bulle, Apache-2.0; distribuito dal pacchetto di build `androidjs-builder`.
- Playwright: Microsoft, Apache-2.0.
- Chromium: Chromium Authors, BSD-style e licenze dei componenti; distribuzione di test `@sparticuz/chromium`, MIT per il pacchetto.

Le risorse dell'interfaccia e le illustrazioni SVG dell'app sono realizzate per questo progetto; non si scaricano immagini o font a runtime.
