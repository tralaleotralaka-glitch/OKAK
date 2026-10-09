#!/usr/bin/env bash
# ==============================================================================
# OKAK VPN - Fast Android APK Builder
# Compiles Android APK without Gradle overhead: aapt -> javac -> d8 -> zipalign -> apksigner
# ==============================================================================
set -euo pipefail
cd "$(dirname "$0")"

SDK="${ANDROID_HOME:-/usr/local/lib/android/sdk}"
BT="$SDK/build-tools/34.0.0"
[ -d "$BT" ] || BT="$(ls -d "$SDK"/build-tools/* 2>/dev/null | sort -V | tail -1)"
PLATDIR="$SDK/platforms/android-34"
[ -d "$PLATDIR" ] || PLATDIR="$(ls -d "$SDK"/platforms/android-* 2>/dev/null | sort -V | tail -1)"

if [ -z "$BT" ] || [ -z "$PLATDIR" ]; then
  echo "[-] Ошибка: Android SDK не найден в ANDROID_HOME=$SDK"
  exit 1
fi

JAR="$PLATDIR/android.jar"
echo "[+] build-tools: $BT"
echo "[+] platform:    $JAR"

# 1. Sync web assets from server/public
rm -rf assets
mkdir -p assets/www
cp -r ../server/public/* assets/www/

# 2. Setup build directories
OUT="$PWD/build-apk"
rm -rf "$OUT"
mkdir -p "$OUT/gen" "$OUT/classes" "$OUT/dex"

# 3. Generate R.java from resources
echo "[*] Компиляция ресурсов (aapt)..."
"$BT/aapt" package -f -m -M AndroidManifest.xml -S res -I "$JAR" -J "$OUT/gen"

# 4. Compile Java sources
echo "[*] Компиляция Java классов (javac)..."
find java "$OUT/gen" -name '*.java' > "$OUT/sources.txt"
javac -source 11 -target 11 -classpath "$JAR" -d "$OUT/classes" @"$OUT/sources.txt"

# 5. Convert bytecode to Dalvik Executable (d8)
echo "[*] Генерация DEX (d8)..."
find "$OUT/classes" -name '*.class' -print0 | xargs -0 "$BT/d8" \
    --release --min-api 26 --lib "$JAR" --output "$OUT/dex"

# 6. Package APK
echo "[*] Сборка APK пакета (aapt package)..."
"$BT/aapt" package -f -M AndroidManifest.xml -S res -A assets -I "$JAR" -F "$OUT/unsigned.apk"
( cd "$OUT/dex" && "$BT/aapt" add "$OUT/unsigned.apk" classes.dex > /dev/null )

# 7. Zipalign
echo "[*] Оптимизация выравнивания (zipalign)..."
"$BT/zipalign" -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

# 8. Sign APK with PKCS12 keystore
echo "[*] Подпись APK (apksigner)..."
KS="signing/okak.p12"
if [ ! -f "$KS" ]; then
    mkdir -p signing
    keytool -genkeypair -keystore "$KS" -storetype PKCS12 -alias okak \
        -storepass okak2026 -keypass okak2026 -keyalg RSA -keysize 2048 \
        -validity 10950 -dname "CN=OKAK VPN, O=OKAK"
fi

"$BT/apksigner" sign --ks "$KS" --ks-type PKCS12 --ks-pass pass:okak2026 \
    --out "$PWD/okak-vpn.apk" "$OUT/aligned.apk"

"$BT/apksigner" verify --print-certs "$PWD/okak-vpn.apk" | head -3 || true
echo "[+] СБОРКА УСПЕШНО ЗАВЕРШЕНА: $PWD/okak-vpn.apk"
ls -lh "$PWD/okak-vpn.apk"
