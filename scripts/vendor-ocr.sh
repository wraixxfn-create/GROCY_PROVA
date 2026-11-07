#!/usr/bin/env bash
# Prepara il motore OCR che vive dentro l'APK: Tesseract compilato in WebAssembly
# e i dati della lingua italiana. Nessuna rete a runtime: i due file generati
# qui vengono impacchettati negli asset e caricati da file:///android_asset/.
#
# Versioni fissate e verificate con sha256. La directory generata è ignorata da
# Git: si ricrea con questo script (npm run vendor:ocr) quando serve ricompilare.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="$PWD/android/app/src/main/assets/vendor"
CACHE="$PWD/.cache/ocr"
CORE_PKG="tesseract.js-core@5.1.1"
CORE_TGZ="tesseract.js-core-5.1.1.tgz"
CORE_SHA="8c1c83c01ecbfcaeb62a5a2d1023ea98162cad082aa47b9c2c39c129847dba8a"
DATA_PKG="@tesseract.js-data/ita@1.0.0"
DATA_TGZ="tesseract.js-data-ita-1.0.0.tgz"
DATA_SHA="54d34ea85750346d5f2e2aa552856e4bff0c518278fcb44353f448d1aa29f8ca"

CORE_OUT="$OUT/tesseract-core-simd-lstm.wasm.js"
DATA_OUT="$OUT/ita.traineddata.b64.js"

if [[ "${1:-}" != "--force" && -s "$CORE_OUT" && -s "$DATA_OUT" ]]; then
  echo "Asset OCR già presenti in ${OUT#"$PWD"/} (usa --force per rigenerarli)."
  exit 0
fi

mkdir -p "$OUT" "$CACHE"
fetch() { # fetch <pacchetto> <file tgz> <sha256>
  if [[ ! -f "$CACHE/$2" ]] || ! printf '%s  %s\n' "$3" "$CACHE/$2" | sha256sum -c --status - ; then
    npm pack "$1" --pack-destination "$CACHE" --silent >/dev/null
  fi
  printf '%s  %s\n' "$3" "$CACHE/$2" | sha256sum -c --status - || {
    echo "Checksum non valido per $2: download interrotto o pacchetto cambiato." >&2
    exit 1
  }
}

fetch "$CORE_PKG" "$CORE_TGZ" "$CORE_SHA"
fetch "$DATA_PKG" "$DATA_TGZ" "$DATA_SHA"

TMP="$CACHE/extract"
rm -rf "$TMP" && mkdir -p "$TMP"
tar xzf "$CACHE/$CORE_TGZ" -C "$TMP" package/tesseract-core-simd-lstm.wasm.js
tar xzf "$CACHE/$DATA_TGZ" -C "$TMP" package/4.0.0_best_int/ita.traineddata.gz

# Il core è la build SIMD con solo il motore LSTM: il wasm è già incorporato in
# base64 nel file JavaScript, così non serve alcun fetch (bloccato su file://).
cp "$TMP/package/tesseract-core-simd-lstm.wasm.js" "$CORE_OUT"

python3 - "$TMP/package/4.0.0_best_int/ita.traineddata.gz" "$DATA_OUT" <<'PY'
import base64, gzip, sys, textwrap
src, dst = sys.argv[1], sys.argv[2]
data = gzip.decompress(open(src, 'rb').read())
b64 = base64.b64encode(data).decode('ascii')
lines = '\n'.join('"%s"+' % chunk for chunk in textwrap.wrap(b64, 200000))
with open(dst, 'w', encoding='ascii') as fh:
    fh.write('/* Dati linguistici italiani per Tesseract (tessdata_fast LSTM).\n')
    fh.write(' * Generato da scripts/vendor-ocr.sh: non modificare a mano.\n')
    fh.write(' * Licenza Apache 2.0 (Tesseract) e dati distribuiti con essa. */\n')
    fh.write('window.GROCY_TESSDATA_ITA_B64 =\n')
    fh.write(lines.rstrip('+'))
    fh.write(';\n')
PY

ls -l "$CORE_OUT" "$DATA_OUT"
echo "Motore OCR pronto: ${OUT#"$PWD"/}"
