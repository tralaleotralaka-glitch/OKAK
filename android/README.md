# OKAK — Android-приложение

Нативное приложение на **Kotlin + Jetpack Compose**. Бот работает внутри приложения, сервер не нужен.

- **Локальный режим** (по умолчанию, без интернета): время и дата по Europe/Moscow, математика,
  столицы, встроенная база знаний (та же, что в веб-версии), small talk.
- **AI-режим** (необязательно): ключ Gemini, который вы вводите в настройках приложения. Вопросы вне базы
  и уравнения, производные и интегралы уходят в модель `gemini-3.1-flash-lite` напрямую по HTTPS
  (`generativelanguage.googleapis.com`, OpenAI-совместимый endpoint). Ключ хранится в
  `EncryptedSharedPreferences` на устройстве. В APK и в репозиторий он не попадает.
  Если модель не ответила за 5 секунд — отвечает локальный движок.

Поддерживаемые устройства: Android 7.0+ (`minSdk 24`). Нативного кода нет, поэтому APK работает
и на 32-битных устройствах (armeabi-v7a), и на 64-битных. `abiFilters` не задаём.

## Получить бесплатный ключ Gemini

1. Откройте Google AI Studio и войдите в аккаунт Google.
2. Создайте API-ключ (Get API key).
3. В приложении нажмите значок настроек и вставьте ключ. Ключ нигде не отображается и не передаётся,
   кроме запросов к Google Gemini.

## Сборка

Нужны: **Android Studio** (актуальная стабильная версия) и **JDK 17** (в Android Studio есть встроенный).

1. Откройте в Android Studio папку `android/` (File → Open).
2. Дождитесь Gradle Sync. Android Studio сама загрузит нужные SDK (compileSdk 34).
3. Запустите конфигурацию `app` на эмуляторе или устройстве, либо соберите APK:
   Build → Build Bundle(s) / APK(s) → Build APK(s).

Если Gradle wrapper (`gradlew`) в папке отсутствует, сгенерируйте его одной командой с установленным Gradle 8.7+:

```bash
cd android && gradle wrapper --gradle-version 8.7
```

Версии: AGP 8.5.2, Kotlin 2.0.20 (с плагином Compose compiler), Compose BOM 2024.09.00,
`desugar_jdk_libs` 2.0.4 (для `java.time` на старых Android), JVM toolchain 17.

## Структура

```
app/src/main/
  assets/knowledge_ru.json          база знаний (копия okak/data/knowledge_ru.json)
  java/ai/okak/app/
    MainActivity.kt
    core/                           движок ответов (порт Python-версии)
      Brain.kt                      маршрутизация: small talk → время → математика → столицы → база → Gemini
      MathSolver.kt                 безопасный парсер выражений (без eval, белый список функций)
      TimeInfo.kt                   время, дата, дни до события, дни недели
      KnowledgeBase.kt              поиск по базе знаний
      Capitals.kt, SmallTalk.kt, TextUtil.kt, Models.kt
      GeminiClient.kt               HTTPS-клиент с таймаутом
      GeneratedData.kt              СГЕНЕРИРОВАН: страны и города
    data/SecureStore.kt             хранилище ключа (EncryptedSharedPreferences)
    ui/                             Compose-экран, ViewModel, тема
  res/                              строки, тема, иконка
src/test/                           JUnit-тесты движка (запускаются на JVM)
```

## Синхронизация с Python-версией

Данные не пишутся вручную. После любых правок в `okak/knowledge.py`, `okak/timeinfo.py`
или `okak/data/knowledge_ru.json` выполните из корня репозитория:

```bash
python3 tools/gen_android_data.py
```

Скрипт пересоздаёт `GeneratedData.kt` и копирует базу знаний в `assets`.

## Тесты

```bash
cd android && ./gradlew testDebugUnitTest
```

Тесты движка (`MathSolverTest`, `TimeInfoTest`) не требуют эмулятора.

## Ограничения

- Уравнения, производные и интегралы без ключа Gemini не решаются: приложение подскажет добавить ключ.
- Без ключа ответы на вопросы вне встроенной базы честно сообщают, что точного ответа нет.
- Время показывается по Europe/Moscow независимо от часового пояса устройства.
