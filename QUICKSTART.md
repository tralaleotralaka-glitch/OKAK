# Краткое руководство (Quickstart)

## Развертывание VPN за 3 простых шага:

### 1. Заказ сервера
Закажите любой недорогой VPS (1 core, 1 GB RAM) за пределами РФ (например Aeza, Hetzner, Timeweb, VDSina, Friendhosting, PQ Hosting) с операционной системой **Ubuntu 22.04** или **Debian 12**.

### 2. Запуск установки на сервере
Подключитесь по SSH к серверу:
```bash
ssh root@ВАШ_IP_СЕРВЕРА
```
И выполните:
```bash
curl -sSL https://raw.githubusercontent.com/tralaleotralaka-glitch/OKAK/main/install.sh | bash
```
*(Или склонируйте репозиторий и запустите `bash install.sh`)*

### 3. Подключение устройств
1. На телефон (iPhone / Android) установите приложение:
   - Для iPhone: **Streisand** или **FoXray** (из App Store)
   - Для Android: **v2rayNG** (из Google Play или GitHub)
2. Отсканируйте появившийся в терминале QR-код прямо через приложение.
3. Нажмите **Connect**. VPN подключен!
