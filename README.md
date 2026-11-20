# ARMv7 starter and Android APK

Минимальный C-проект с двумя вариантами сборки:

- **Android APK** для `armeabi-v7a` (32-bit ARM, Android API 23+).
- **Linux CLI** для ARMv7-A GNU EABI hard-float (armhf).

Это демонстрационный шаблон, а не MargyCode: исходников MargyCode в репозитории нет. APK показывает экран с текстом, который возвращает JNI-библиотека на C.

## APK через GitHub Actions

Workflow `.github/workflows/android-apk.yml` собирает debug APK при push, pull request или ручном запуске (`workflow_dispatch`). После успешной сборки скачайте `armv7-debug-apk` в разделе **Actions → нужный запуск → Artifacts**. APK называется `app-debug.apk`.

Для ручной сборки локально требуются JDK 17, Android SDK, NDK 27.2.12479018, CMake 3.22.1 и Gradle 8.9:

```sh
gradle :app:assembleDebug
```

Готовый файл: `app/build/outputs/apk/debug/app-debug.apk`. Это **debug APK**, подписанный автоматически отладочным ключом, а не production/release APK.

## Linux CLI

На хосте с CMake 3.16+:

```sh
make host
./build/host/armv7_starter
```

Cross-сборка Linux armhf на Debian/Ubuntu:

```sh
sudo apt install cmake gcc-arm-linux-gnueabihf g++-arm-linux-gnueabihf
make armv7
```

Результат находится в `build/armv7/armv7_starter`. Это ARMv7-A Linux, не ARM7TDMI/bare metal. При смене компилятора или sysroot удалите соответствующий каталог `build` перед повторной конфигурацией.
