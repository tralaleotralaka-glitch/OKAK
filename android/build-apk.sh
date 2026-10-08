#!/usr/bin/env bash
# Сборка APK «Шёпота» без Gradle: aapt -> javac -> d8 -> zipalign -> apksigner.
# Требуется Android SDK (ANDROID_HOME) и JDK 11+.
set -euo pipefail
cd "$(dirname "$0")"

SDK="${ANDROID_HOME:-/usr/local/lib/android/sdk}"
# закреплённые версии (ставятся в workflow), иначе — самые свежие доступные
BT="$SDK/build-tools/34.0.0"
[ -d "$BT" ] || BT="$(ls -d "$SDK"/build-tools/* 2>/dev/null | sort -V | tail -1)"
PLATDIR="$SDK/platforms/android-34"
[ -d "$PLATDIR" ] || PLATDIR="$(ls -d "$SDK"/platforms/android-* 2>/dev/null | sort -V | tail -1)"
[ -n "$BT" ] && [ -n "$PLATDIR" ] || { echo "Android SDK не найден (ANDROID_HOME=$SDK)"; exit 1; }
JAR="$PLATDIR/android.jar"
echo "build-tools: $BT"
echo "platform:    $JAR"

# --- свежие веб-ассеты из app/static (единый интерфейс с серверной версией) ---
rm -rf assets
mkdir -p assets/www/static
cp ../app/static/index.html assets/www/
cp ../app/static/style.css ../app/static/app.js assets/www/static/

# --- компиляция ресурсов и кода ---
OUT="$PWD/build-apk"
rm -rf "$OUT"
mkdir -p "$OUT/gen" "$OUT/classes" "$OUT/dex"

"$BT/aapt" package -f -m -M AndroidManifest.xml -S res -I "$JAR" -J "$OUT/gen"

find java "$OUT/gen" -name '*.java' > "$OUT/sources.txt"
javac -source 11 -target 11 -classpath "$JAR" -d "$OUT/classes" @"$OUT/sources.txt"

find "$OUT/classes" -name '*.class' -print0 | xargs -0 "$BT/d8" \
    --release --min-api 26 --lib "$JAR" --output "$OUT/dex"

# --- упаковка ---
"$BT/aapt" package -f -M AndroidManifest.xml -S res -A assets -I "$JAR" -F "$OUT/unsigned.apk"
( cd "$OUT/dex" && "$BT/aapt" add "$OUT/unsigned.apk" classes.dex > /dev/null )
"$BT/zipalign" -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

# --- подпись постоянным ключом репозитория ---
KS="signing/shepot.p12"
if [ ! -f "$KS" ]; then
    mkdir -p signing
    keytool -genkeypair -keystore "$KS" -storetype PKCS12 -alias shepot \
        -storepass shepot2026 -keypass shepot2026 -keyalg RSA -keysize 2048 \
        -validity 10950 -dname "CN=Shepot, O=Shepot"
fi
"$BT/apksigner" sign --ks "$KS" --ks-type PKCS12 --ks-pass pass:shepot2026 \
    --out "$PWD/shepot.apk" "$OUT/aligned.apk"
"$BT/apksigner" verify --print-certs "$PWD/shepot.apk" | head -3 || true
echo "OK: $PWD/shepot.apk"
