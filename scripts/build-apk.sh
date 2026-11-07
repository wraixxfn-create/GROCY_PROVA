#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
BUILD="$PWD/build/android"
SRC="$PWD/android/app/src/main"
TOOLS="$PWD/.tools"
APK_NAME="grocy-locale-v2.1.0.apk"
# Engine OCR locale (Tesseract in WebAssembly) dentro gli asset: si genera una
# volta sola con npm run vendor:ocr se non è già presente.
bash scripts/vendor-ocr.sh
mkdir -p "$BUILD/classes" "$BUILD/res" "$BUILD/gen" downloads
# Standard Android SDK when available; self-contained local toolchain otherwise.
if [[ -n "${ANDROID_HOME:-}" && -d "$ANDROID_HOME/build-tools" ]]; then
  BT="$(find "$ANDROID_HOME/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -1)"
  PLATFORM="$(find "$ANDROID_HOME/platforms" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -1)/android.jar"
  JAVA="${JAVA_HOME:+$JAVA_HOME/bin/}java"
  AAPT="$BT/aapt2"
else
  JAVA="$TOOLS/java/runtime/bin/java"
  AAPT="$TOOLS/aapt/bin/x64/linux/aapt2"
  PLATFORM="$TOOLS/android.jar"
fi
"$AAPT" compile --dir "$SRC/res" -o "$BUILD/res.zip"
"$AAPT" link -o "$BUILD/unsigned.apk" -I "$PLATFORM" --manifest "$SRC/AndroidManifest.xml" --java "$BUILD/gen" -A "$SRC/assets" "$BUILD/res.zip"
find "$SRC/java" "$BUILD/gen" -name '*.java' > "$BUILD/sources.txt"
if [[ -n "${BT:-}" ]]; then
  javac -source 8 -target 8 -bootclasspath "$PLATFORM" -d "$BUILD/classes" @"$BUILD/sources.txt"
  "$BT/d8" --min-api 26 --lib "$PLATFORM" --output "$BUILD" $(find "$BUILD/classes" -name '*.class')
else
  "$JAVA" -cp "$TOOLS/tools.jar" com.sun.tools.javac.Main -source 7 -target 7 -bootclasspath "$TOOLS/android-28.jar" -d "$BUILD/classes" @"$BUILD/sources.txt"
  "$JAVA" -cp "$TOOLS/dx-classes" com.android.dx.command.Main --dex --output="$BUILD/classes.dex" "$BUILD/classes"
fi
python3 - "$BUILD" <<'PY'
from zipfile import ZipFile, ZIP_DEFLATED
from pathlib import Path
import sys
p=Path(sys.argv[1])
with ZipFile(p/'unsigned.apk','a',compression=ZIP_DEFLATED) as z: z.write(p/'classes.dex','classes.dex')
PY
rm -f downloads/grocy-locale-v1.*.apk
if [[ -n "${BT:-}" ]]; then
  KEY="${GROCY_KEYSTORE:-$TOOLS/grocy-local.jks}"
  if [[ ! -f "$KEY" ]]; then mkdir -p "$TOOLS"; keytool -genkeypair -keystore "$KEY" -storepass android -keypass android -alias grocy -dname 'CN=Grocy Locale Local Build' -keyalg RSA -keysize 2048 -validity 10000; fi
  "$BT/zipalign" -f 4 "$BUILD/unsigned.apk" "$BUILD/aligned.apk"
  "$BT/apksigner" sign --ks "$KEY" --ks-pass pass:android --ks-key-alias grocy --out "downloads/$APK_NAME" "$BUILD/aligned.apk"
  "$BT/apksigner" verify --verbose "downloads/$APK_NAME"
else
  rm -rf "$BUILD/signed"
  "$JAVA" -jar "$TOOLS/uber-apk-signer.jar" --apks "$BUILD/unsigned.apk" --out "$BUILD/signed"
  cp "$BUILD/signed/unsigned-aligned-debugSigned.apk" "downloads/$APK_NAME"
  "$JAVA" -jar "$TOOLS/uber-apk-signer.jar" --apks "downloads/$APK_NAME" --onlyVerify
fi
(cd downloads && sha256sum "$APK_NAME" > SHA256SUMS.txt)
echo "APK pronto: downloads/$APK_NAME"
