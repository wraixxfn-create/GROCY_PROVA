#!/usr/bin/env bash
# Optional Linux x86_64 toolchain for environments without Android SDK or JDK.
# Requires Node/npm, gh (authenticated), curl, unzip, tar, git and Python 3.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .tools/java .tools/aapt .tools/dx-classes
blob() {
  local repo="$1" sha="$2" dest="$3"
  gh api "repos/$repo/git/blobs/$sha" -H 'Accept: application/vnd.github.raw+json' > "$dest"
  [[ "$(git hash-object "$dest")" == "$sha" ]] || { echo "Hash Git non valido: $dest" >&2; exit 1; }
}
# Pinned npm packages include the runtime and build tools; no runtime dependency in the app.
npm pack @xpathy/selenium-mcp-linux-x64@1.0.23 --pack-destination .tools --silent
npm pack aaptjs3@2.0.2 --pack-destination .tools --silent
npm pack dataslope-tools-jar@1.0.0 --pack-destination .tools --silent
npm pack androidjs-builder@2.3.2 --pack-destination .tools --silent
tar xzf .tools/xpathy-selenium-mcp-linux-x64-1.0.23.tgz -C .tools/java --strip-components=1
tar xzf .tools/aaptjs3-2.0.2.tgz -C .tools/aapt --strip-components=1
tar xzf .tools/dataslope-tools-jar-1.0.0.tgz -C .tools --strip-components=1 package/tools.jar
tar xzf .tools/androidjs-builder-2.3.2.tgz -C .tools --strip-components=2 package/build_tools/uber-apk-signer.jar
blob Reginer/aosp-android-jar 4eb4b54d96953be09a2a8032e50b5b076a13d98e .tools/android.jar
blob Reginer/aosp-android-jar fc6a2d2b94aad8712ca6d1f266e714dae0cb289c .tools/android-28.jar
# Compile the open-source AOSP dx converter, avoiding opaque third-party dex binaries.
DALVIK=6e21232cf2bca0e73bd418413564cb140ab9ccbd
LIBCORE=dd9fe6e875f6e3b6df17d271c523d3b62e9f5bb6
curl -fL "https://codeload.github.com/aosp-mirror/platform_dalvik/zip/$DALVIK" -o .tools/dalvik-source.zip
curl -fL "https://codeload.github.com/LineageOS/android_libcore/zip/$LIBCORE" -o .tools/libcore-source.zip
unzip -qo .tools/dalvik-source.zip -d .tools
unzip -qo .tools/libcore-source.zip -d .tools
find ".tools/platform_dalvik-$DALVIK/dx/src" ".tools/android_libcore-$LIBCORE/dex/src/main/java" -name '*.java' > .tools/dx-sources.txt
.tools/java/runtime/bin/java -cp .tools/tools.jar com.sun.tools.javac.Main -source 8 -target 8 -bootclasspath .tools/android.jar -d .tools/dx-classes @.tools/dx-sources.txt
chmod +x .tools/aapt/bin/x64/linux/aapt2
.tools/java/runtime/bin/java -cp .tools/dx-classes com.android.dx.command.Main --version
echo 'Toolchain pronta. Esegui: npm run build:apk'
