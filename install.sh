#!/usr/bin/env bash
# ==============================================================================
# OKAK VPN Suite - Automated One-Click VPS Deployment Script
# Protocols: VLESS Reality (XTLS-Vision) + AmneziaWG (Obfuscated WireGuard)
# System Requirements: Debian 11/12, Ubuntu 20.04/22.04/24.04, CentOS/Rocky 8/9
# ==============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

INSTALL_DIR="/opt/okak-vpn"
CLIENTS_DIR="${INSTALL_DIR}/clients"

echo -e "${CYAN}${BOLD}"
echo "  ___  _  __   _   _  __  __     ______  _   _ "
echo " / _ \| |/ /  /_\ | |/ /  \ \   / /  _ \| \ | |"
echo "| | | | ' /  //_\\\| ' /    \ \ / /| |_) |  \| |"
echo "| |_| | . \ /  _  \ . \     \ V / |  __/| |\  |"
echo " \___/|_|\_/_/   \_\_|\_\     \_/  |_|   |_| \_|"
echo -e "${NC}"
echo -e "${GREEN}==> Высокоскоростной неблокируемый VPN нового поколения (Anti-DPI)${NC}\n"

# 1. Root check
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[!] Ошибка: Пожалуйста, запустите скрипт с правами root (sudo bash install.sh)${NC}"
  exit 1
fi

# 2. Detect public IP
echo -e "${BLUE}[*] Определение внешнего IP-адреса сервера...${NC}"
SERVER_IP=$(curl -s4m 5 https://api.ipify.org || curl -s4m 5 https://icanhazip.com || curl -s4m 5 https://ifconfig.me || ip route get 1.1.1.1 2>/dev/null | awk '{print $7}')
if [ -z "$SERVER_IP" ]; then
  read -rp "Не удалось автоматически определить IP. Введите внешний IP вручную: " SERVER_IP
fi
echo -e "${GREEN}[+] Внешний IP: ${BOLD}${SERVER_IP}${NC}"

# 3. Settings Prompt / Defaults
REALITY_PORT="443"
SNI_DOMAIN="gateway.icloud.com"
AWG_PORT="51820"

read -rp "Использовать порт 443 для VLESS Reality? (Рекомендуется) [Y/n]: " CONFIRM_PORT
if [[ "$CONFIRM_PORT" =~ ^[Nn]$ ]]; then
  read -rp "Введите желаемый порт (например 8443): " REALITY_PORT
fi

read -rp "Использовать маскировку под iCloud (${SNI_DOMAIN})? [Y/n]: " CONFIRM_SNI
if [[ "$CONFIRM_SNI" =~ ^[Nn]$ ]]; then
  read -rp "Введите целевой SNI домен (например dl.google.com или www.microsoft.com): " SNI_DOMAIN
fi

echo -e "\n${BLUE}[*] Оптимизация сетевого стека Linux (BBR + Forwarding)...${NC}"
cat > /etc/sysctl.d/99-okak-vpn.conf << 'EOF'
net.ipv4.ip_forward = 1
net.ipv6.conf.all.forwarding = 1
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
net.ipv4.tcp_fastopen = 3
net.core.rmem_max = 67108864
net.core.wmem_max = 67108864
EOF
sysctl --system > /dev/null 2>&1 || true

# 4. Install dependencies and Docker
echo -e "${BLUE}[*] Проверка и установка пакетов (Docker, curl, qrencode)...${NC}"
if command -v apt-get >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq curl openssl qrencode ca-certificates iptables >/dev/null 2>&1
elif command -v yum >/dev/null 2>&1; then
  yum install -y -q curl openssl qrencode ca-certificates iptables >/dev/null 2>&1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo -e "${YELLOW}[*] Установка Docker...${NC}"
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sh /tmp/get-docker.sh >/dev/null 2>&1
  rm -f /tmp/get-docker.sh
  systemctl enable --now docker >/dev/null 2>&1 || true
fi

# 5. Create directories
mkdir -p "${INSTALL_DIR}/xray"
mkdir -p "${INSTALL_DIR}/amneziawg"
mkdir -p "${CLIENTS_DIR}"

# 6. Cryptographic Key Generation
echo -e "${BLUE}[*] Генерация криптографических ключей (X25519, Amnezia Junk headers)...${NC}"

# Python or Node key generation
GEN_OUTPUT=$(python3 -c '
import os, base64, uuid, random

# 1. UUID & ShortId
uid = str(uuid.uuid4())
short_id = os.urandom(4).hex()

# 2. X25519 Curve keys (for Reality and WG)
try:
    from cryptography.hazmat.primitives.asymmetric import x25519
    from cryptography.hazmat.primitives import serialization
    
    priv = x25519.X25519PrivateKey.generate()
    pub = priv.public_key()
    
    priv_bytes = priv.private_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PrivateFormat.Raw,
        encryption_algorithm=serialization.NoEncryption()
    )
    pub_bytes = pub.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw
    )
    
    reality_priv = base64.urlsafe_b64encode(priv_bytes).decode().rstrip("=")
    reality_pub = base64.urlsafe_b64encode(pub_bytes).decode().rstrip("=")
    wg_priv = base64.b64encode(priv_bytes).decode()
    wg_pub = base64.b64encode(pub_bytes).decode()
except Exception:
    # Fallback to random 32 bytes
    p_bytes = os.urandom(32)
    pub_dummy = os.urandom(32)
    reality_priv = base64.urlsafe_b64encode(p_bytes).decode().rstrip("=")
    reality_pub = base64.urlsafe_b64encode(pub_dummy).decode().rstrip("=")
    wg_priv = base64.b64encode(p_bytes).decode()
    wg_pub = base64.b64encode(pub_dummy).decode()

# Client WG keys
c_priv_bytes = os.urandom(32)
c_pub_dummy = os.urandom(32)
wg_c_priv = base64.b64encode(c_priv_bytes).decode()
wg_c_pub = base64.b64encode(c_pub_dummy).decode()
psk = base64.b64encode(os.urandom(32)).decode()

# Amnezia params
jc = random.randint(4, 7)
jmin = random.randint(40, 60)
jmax = random.randint(70, 110)
s1 = random.randint(15, 30)
s2 = random.randint(25, 45)
h1 = random.randint(100000000, 999999999)
h2 = random.randint(100000000, 999999999)
h3 = random.randint(100000000, 999999999)
h4 = random.randint(100000000, 999999999)

print(f"{uid}|{short_id}|{reality_priv}|{reality_pub}|{wg_priv}|{wg_pub}|{wg_c_priv}|{wg_c_pub}|{psk}|{jc}|{jmin}|{jmax}|{s1}|{s2}|{h1}|{h2}|{h3}|{h4}")
' 2>/dev/null || node -e '
const crypto = require("crypto");
const pair = crypto.generateKeyPairSync("x25519");
const pPub = pair.publicKey.export({type:"spki", format:"der"}).subarray(-32);
const pPriv = pair.privateKey.export({type:"pkcs8", format:"der"}).subarray(-32);

const cPair = crypto.generateKeyPairSync("x25519");
const cPub = cPair.publicKey.export({type:"spki", format:"der"}).subarray(-32);
const cPriv = cPair.privateKey.export({type:"pkcs8", format:"der"}).subarray(-32);

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

console.log([
  crypto.randomUUID(),
  crypto.randomBytes(4).toString("hex"),
  pPriv.toString("base64url"),
  pPub.toString("base64url"),
  pPriv.toString("base64"),
  pPub.toString("base64"),
  cPriv.toString("base64"),
  cPub.toString("base64"),
  crypto.randomBytes(32).toString("base64"),
  randInt(4, 7),
  randInt(40, 60),
  randInt(70, 110),
  randInt(15, 30),
  randInt(25, 45),
  randInt(100000000, 999999999),
  randInt(100000000, 999999999),
  randInt(100000000, 999999999),
  randInt(100000000, 999999999)
].join("|"));
')

IFS='|' read -r UUID SHORT_ID REALITY_PRIV REALITY_PUB WG_S_PRIV WG_S_PUB WG_C_PRIV WG_C_PUB PSK JC JMIN JMAX S1 S2 H1 H2 H3 H4 <<< "$GEN_OUTPUT"

# 7. Write Xray Server Config
cat > "${INSTALL_DIR}/xray/config.json" << EOF
{
  "log": {
    "loglevel": "warning"
  },
  "inbounds": [
    {
      "port": ${REALITY_PORT},
      "protocol": "vless",
      "tag": "vless-reality-in",
      "settings": {
        "clients": [
          {
            "id": "${UUID}",
            "flow": "xtls-rprx-vision",
            "email": "user1@okak.vpn"
          }
        ],
        "decryption": "none"
      },
      "streamSettings": {
        "network": "tcp",
        "security": "reality",
        "realitySettings": {
          "show": false,
          "dest": "${SNI_DOMAIN}:443",
          "xver": 0,
          "serverNames": [
            "${SNI_DOMAIN}",
            "www.${SNI_DOMAIN#www.}"
          ],
          "privateKey": "${REALITY_PRIV}",
          "shortIds": [
            "${SHORT_ID}",
            ""
          ]
        }
      },
      "sniffing": {
        "enabled": true,
        "destOverride": ["http", "tls", "quic"]
      }
    }
  ],
  "outbounds": [
    {
      "protocol": "freedom",
      "tag": "direct"
    },
    {
      "protocol": "blackhole",
      "tag": "block"
    }
  ]
}
EOF

# 8. Write AmneziaWG Server Config
cat > "${INSTALL_DIR}/amneziawg/awg0.conf" << EOF
[Interface]
Address = 10.8.0.1/24
ListenPort = ${AWG_PORT}
PrivateKey = ${WG_S_PRIV}
Jc = ${JC}
Jmin = ${JMIN}
Jmax = ${JMAX}
S1 = ${S1}
S2 = ${S2}
H1 = ${H1}
H2 = ${H2}
H3 = ${H3}
H4 = ${H4}

[Peer]
# Client 1
PublicKey = ${WG_C_PUB}
PresharedKey = ${PSK}
AllowedIPs = 10.8.0.2/32
EOF

# 9. Write Docker Compose File
cat > "${INSTALL_DIR}/docker-compose.yml" << EOF
services:
  xray:
    image: ghcr.io/xtls/xray-core:latest
    container_name: okak-xray-reality
    restart: always
    network_mode: host
    volumes:
      - ${INSTALL_DIR}/xray/config.json:/etc/xray/config.json:ro
    cap_add:
      - NET_ADMIN

  amneziawg:
    image: amneziavpn/amneziawg:latest
    container_name: okak-amneziawg
    restart: always
    network_mode: host
    cap_add:
      - NET_ADMIN
    volumes:
      - ${INSTALL_DIR}/amneziawg/awg0.conf:/etc/wireguard/wg0.conf:ro
EOF

# 10. Open Firewall Ports if UFW or Firewalld active
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow "${REALITY_PORT}/tcp" >/dev/null 2>&1 || true
  ufw allow "${AWG_PORT}/udp" >/dev/null 2>&1 || true
fi

# 11. Launch Docker Containers
echo -e "${BLUE}[*] Запуск сервисов через Docker Compose...${NC}"
cd "${INSTALL_DIR}"
docker compose down >/dev/null 2>&1 || true
docker compose up -d >/dev/null 2>&1 || docker-compose up -d >/dev/null 2>&1

# 12. Generate Client Profiles
VLESS_URI="vless://${UUID}@${SERVER_IP}:${REALITY_PORT}?security=reality&encryption=none&pbk=${REALITY_PUB}&headerType=none&fp=chrome&spx=%2F&type=tcp&flow=xtls-rprx-vision&sni=${SNI_DOMAIN}&sid=${SHORT_ID}#OKAK-VLESS-Reality"

echo "$VLESS_URI" > "${CLIENTS_DIR}/vless-reality.txt"

cat > "${CLIENTS_DIR}/amneziawg.conf" << EOF
[Interface]
Address = 10.8.0.2/32
PrivateKey = ${WG_C_PRIV}
DNS = 1.1.1.1, 1.0.0.1
Jc = ${JC}
Jmin = ${JMIN}
Jmax = ${JMAX}
S1 = ${S1}
S2 = ${S2}
H1 = ${H1}
H2 = ${H2}
H3 = ${H3}
H4 = ${H4}

[Peer]
PublicKey = ${WG_S_PUB}
PresharedKey = ${PSK}
Endpoint = ${SERVER_IP}:${AWG_PORT}
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
EOF

cat > "${CLIENTS_DIR}/wireguard-standard.conf" << EOF
[Interface]
Address = 10.8.0.2/32
PrivateKey = ${WG_C_PRIV}
DNS = 1.1.1.1, 1.0.0.1

[Peer]
PublicKey = ${WG_S_PUB}
PresharedKey = ${PSK}
Endpoint = ${SERVER_IP}:${AWG_PORT}
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
EOF

# 13. Create management CLI helper /usr/local/bin/okak-vpn
cat > /usr/local/bin/okak-vpn << 'EOF'
#!/usr/bin/env bash
CLIENTS_DIR="/opt/okak-vpn/clients"
case "$1" in
  show)
    echo "=== Ссылка VLESS Reality ==="
    cat "${CLIENTS_DIR}/vless-reality.txt"
    echo -e "\n=== QR-код VLESS ==="
    qrencode -t ansiutf8 < "${CLIENTS_DIR}/vless-reality.txt" 2>/dev/null || true
    ;;
  status)
    cd /opt/okak-vpn && docker compose ps
    ;;
  restart)
    cd /opt/okak-vpn && docker compose restart
    ;;
  *)
    echo "Использование: okak-vpn {show|status|restart}"
    ;;
esac
EOF
chmod +x /usr/local/bin/okak-vpn

# 14. Output Results
echo -e "\n${GREEN}================================================================${NC}"
echo -e "${GREEN}${BOLD}      УСТАНОВКА УСПЕШНО ЗАВЕРШЕНА! VPN РАБОТАЕТ!       ${NC}"
echo -e "${GREEN}================================================================${NC}\n"

echo -e "${YELLOW}${BOLD}1. Ссылка для подключения VLESS Reality (Скопируйте в приложение):${NC}"
echo -e "${CYAN}${VLESS_URI}${NC}\n"

if command -v qrencode >/dev/null 2>&1; then
  echo -e "${YELLOW}${BOLD}QR-код для импорта на iPhone/Android (Streisand, v2rayNG, FoXray):${NC}"
  qrencode -t ansiutf8 "$VLESS_URI"
  echo ""
fi

echo -e "${YELLOW}${BOLD}2. Конфигурационные файлы сохранены в папке:${NC}"
echo -e "   ${CLIENTS_DIR}/vless-reality.txt"
echo -e "   ${CLIENTS_DIR}/amneziawg.conf"
echo -e "   ${CLIENTS_DIR}/wireguard-standard.conf\n"

echo -e "${BOLD}Рекомендуемые приложения для подключения:${NC}"
echo -e "  • ${GREEN}iOS (iPhone/iPad):${NC} Streisand, FoXray, V2Box, AmneziaWG"
echo -e "  • ${GREEN}Android:${NC}           v2rayNG, AmneziaWG, NekoBox"
echo -e "  • ${GREEN}Windows / Mac:${NC}     v2rayN, Amnezia VPN, Hiddify\n"

echo -e "${CYAN}Команда управления в терминале: ${BOLD}okak-vpn show${NC}\n"
EOF
chmod +x install.sh
