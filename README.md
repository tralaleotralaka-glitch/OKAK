# OKAK VPN Suite — Неблокируемый VPN нового поколения (Anti-DPI)

[![Protocol](https://img.shields.io/badge/Protocols-VLESS_Reality_|_AmneziaWG_|_WireGuard_|_Shadowsocks-blue.svg)](https://github.com/tralaleotralaka-glitch/OKAK)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-iOS_|_Android_|_Windows_|_macOS_|_Linux_|_Routers-purple.svg)](https://github.com/tralaleotralaka-glitch/OKAK)

Готовое решение для развертывания персонального, скоростного и полностью защищенного от блокировок VPN на собственном сервере (VPS) за 1 минуту.

В отличие от устаревших OpenVPN, IPsec и классического WireGuard, которые определяются и блокируются современными ТСПУ / DPI по характерным сигнатурам пакетов («хэндшейкам»), **OKAK VPN Suite** использует самые передовые технологии обхода цензуры:
- 🛡️ **VLESS + XTLS-Reality (Xray)** — полное отсутствие сигнатур; трафик маскируется под подлинные TLS 1.3 сессии к серверам Apple, Google или Microsoft. Цензор не может отличить подключение к вашему VPN от загрузки системных обновлений.
- ⚡ **AmneziaWG (AWG)** — модифицированный WireGuard со случайными мусорными пакетами и рандомизированными заголовками (`Jc`, `Jmin`, `Jmax`, `S1`, `S2`, `H1-H4`). Сохраняет рекордную скорость ядра Linux, обходя блокировки UDP/WireGuard.
- 🔒 **Shadowsocks-2022** — современный легковесный прокси на шифровании `blake3-aes-128-gcm`.
- 🎛️ **Веб-панель управления и генератор QR-кодов** — интерактивный интерфейс для создания конфигураций, сканирования QR мобильными устройствами и мониторинга.

---

## 🚀 Быстрый старт: Установка на VPS за 1 минуту

### Шаг 1. Арендуйте VPS
Подойдет любой зарубежный сервер (Нидерланды, Германия, Финляндия, США, Турция и др.) с ОС **Ubuntu 22.04 / 24.04** или **Debian 12**.  
Минимальные требования: 1 vCPU, 512 MB – 1 GB RAM, стоимость от ~150-300 руб/мес.

### Шаг 2. Подключитесь по SSH
```bash
ssh root@IP_ВАШЕГО_СЕРВЕРА
```

### Шаг 3. Запустите автоматический установщик
```bash
bash install.sh
```

Скрипт автоматически:
1. Включит ускорение сети **TCP BBR** и IP forwarding в ядре Linux.
2. Проверит и установит Docker.
3. Сгенерирует надежные криптографические ключи X25519 и AmneziaWG параметры.
4. Развернет контейнеры VLESS Reality и AmneziaWG.
5. Выведет готовые **QR-коды** прямо в консоль для мгновенного сканирования с телефона!
6. Сохранит конфигурационные файлы в `/opt/okak-vpn/clients/`.

---

## 🖥️ Веб-панель управления (OKAK VPN Dashboard)

Репозиторий включает современный веб-интерфейс для генерации ключей, QR-кодов и управления профилями:

```bash
# Запуск панели управления
npm install
npm start
```

После запуска панель доступна по адресу: `http://localhost:3000` (или IP вашего сервера:3000).

### Возможности веб-интерфейса:
- **Генерация VLESS Reality, AmneziaWG, WireGuard и Shadowsocks** в один клик.
- **Интерактивные QR-коды** для мгновенного добавления в приложения на смартфонах.
- **Подбор маскировочного SNI** (iCloud, Google CDN, Microsoft Azure, Cloudflare, Speedtest).
- **Экспорт в Clash Meta / Sing-box / v2rayN**.
- **Встроенная диагностика** сетевых задержек (ping test) и локальный HTTP/SOCKS5 прокси.

---

## 📱 Клиентские приложения и инструкция по подключению

### 🍏 iPhone / iPad (iOS)
1. **Рекомендуемое приложение:** **[Streisand](https://apps.apple.com/app/streisand/id6450534064)** или **[FoXray](https://apps.apple.com/app/foxray/id6448898396)** (для VLESS Reality), либо **[AmneziaWG](https://apps.apple.com/app/amneziawg/id6478942364)** (для AmneziaWG).
2. Откройте приложение, нажмите кнопку **«+»**.
3. Выберите **«Scan QR Code»** и наведите камеру на QR-код из генератора (или выберите «Импорт из буфера обмена»).
4. Нажмите **Connect**. Разрешите системе добавить VPN-профиль.

### 🤖 Android
1. **Готовое приложение OKAK VPN (APK):**
   - Скачайте собранный APK из раздела **[Releases](https://github.com/tralaleotralaka-glitch/OKAK/releases)** репозитория (файл `OKAK-VPN-debug.apk`) либо из артефактов GitHub Actions.
   - Установите на телефон (разрешив установку из неизвестных источников).
   - Внутри приложения доступны все протоколы (VLESS Reality, AmneziaWG), генератор QR и кнопка **«⚡ Подключить»** в один тап.
2. **Сторонние клиенты:** **[v2rayNG](https://github.com/2dust/v2rayNG/releases)** (для VLESS Reality) или **[AmneziaWG Android](https://github.com/amnezia-vpn/amneziawg-android/releases)**.
   - Нажмите **«+»** в правом верхнем углу -> **«Импорт профиля из QR-кода»** (или «Импорт из буфера»).
   - Нажмите круглую кнопку подключения внизу экрана.

### 🪟 Windows (10 / 11)
- **Для VLESS Reality:** Скачайте **[v2rayN](https://github.com/2dust/v2rayN/releases)** (архив `v2rayN-With-Core.zip`).
  - Скопируйте ссылку `vless://...`.
  - В окне v2rayN нажмите **Ctrl + V**.
  - Кликните правой кнопкой по серверу -> *«Установить как активный сервер»*.
  - Внизу выберите *«Системный прокси» -> «Включить автоматическую настройку»*.
- **Для AmneziaWG / WireGuard:** Скачайте официальный клиент **[Amnezia VPN](https://amnezia.org/ru/downloads)** и импортируйте файл `.conf`.

### 💻 macOS
- **[FoXray](https://apps.apple.com/app/foxray/id6448898396)** или **[V2Box](https://apps.apple.com/app/v2box-v2ray-client/id6446814042)** в Mac App Store для VLESS Reality.
- **[Amnezia VPN для Mac](https://amnezia.org/ru/downloads)** для AmneziaWG.

### 📡 Роутеры (Keenetic / OpenWrt / MikroTik)
- **KeeneticOS:** Раздел *«Другие подключения»* -> *«WireGuard»* -> импорт `client.conf` (или через Entware пакет `xray` для VLESS).
- **OpenWrt:** Пакеты `luci-app-passwall` или `luci-app-openclash` с поддержкой VLESS Reality и выборочной маршрутизацией.

---

## 🛠️ CLI команды на сервере

После запуска `install.sh` на сервере доступна утилита управления:
```bash
# Показать ссылки подключения и QR-коды
okak-vpn show

# Проверить статус контейнеров
okak-vpn status

# Перезапустить службы
okak-vpn restart
```

Генерация ключей вручную через Node.js CLI:
```bash
npm run generate-keys -- --ip 185.120.45.10 --sni gateway.icloud.com
```

---

## 🔬 Почему это работает при жестких блокировках?

| Протокол | Принцип работы | Устойчивость к ТСПУ / DPI |
|---|---|---|
| **VLESS + Reality** | Эмулирует TLS 1.3 к легальным доменам (`gateway.icloud.com`, `dl.google.com`). При активной проверке цензора перенаправляет зонд на настоящий целевой сервер. Не требует покупки домена или выпуска личного SSL-сертификата. | ⭐️⭐️⭐️⭐️⭐️ **100% (Не блокируется)** |
| **AmneziaWG (AWG)** | Добавляет случайный шум (`Jc`, `Jmin`, `Jmax`) в начало сессии и изменяет стандартные заголовки WireGuard пакетов (`H1`-`H4`), разрушая алгоритмы обнаружения DPI. | ⭐️⭐️⭐️⭐️⭐️ **98% (Ультрабыстрый)** |
| **Shadowsocks-2022** | Симметричное шифрование с антиреплей защитой на уровне сессий. | ⭐️⭐️⭐️ **80%** |
| **OpenVPN / WG** | Стандартные статические сигнатуры в первых 3 пакетах обмена. | ❌ **Блокируется большинством провайдеров** |

---

## 📁 Структура репозитория

```
OKAK/
├── .github/workflows/          # Автоматическая сборка APK и релиз в GitHub Actions
├── android/                    # Android приложение (OKAK VPN APK)
│   ├── build-apk.sh            # Скрипт быстрой компиляции и подписи APK
│   ├── AndroidManifest.xml     # Манифест приложения
│   └── java/vpn/okak/app/      # Нативный мост и WebView активность
├── install.sh                  # Однострочный автоустановщик для Ubuntu/Debian VPS
├── docker-compose.yml          # Развертывание стека (Xray Reality + AmneziaWG + Manager)
├── package.json                # Скрипты и зависимости Node.js
├── README.md                   # Документация и руководства
├── QUICKSTART.md               # Быстрое руководство
├── configs/                    # Шаблоны конфигураций
│   ├── xray/                   # Xray-core VLESS Reality (server & client)
│   ├── amneziawg/              # AmneziaWG конфигурации (awg0.conf & client.conf)
│   └── wireguard/              # Стандартный WireGuard
├── server/                     # Веб-панель и API
│   ├── index.js                # Express веб-сервер и API
│   ├── crypto-utils.js         # Генерация ключей X25519, Reality и AWG
│   ├── tunnel.js               # Встроенный HTTP CONNECT и SOCKS5 прокси-шлюз
│   └── public/                 # Веб-интерфейс (HTML5, CSS3, JS)
└── scripts/
    ├── generate-keys.js        # CLI утилита вывода ключей и ASCII QR-кода
    └── test-tunnel.js          # Тестирование прокси-туннеля
```

---

## ⚖️ Лицензия

MIT License. Свободно для личного и коммерческого использования.
