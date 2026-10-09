/**
 * OKAK VPN Suite - Client Application Logic
 */

let currentBundle = null;
let currentOutputMode = 'link'; // 'link' | 'server' | 'clash'

const PLATFORM_DATA = {
  ios: {
    name: 'Apple iOS (iPhone / iPad)',
    apps: [
      {
        name: 'Streisand',
        type: 'Рекомендуется (Бесплатно в App Store)',
        badge: 'Топ для VLESS Reality',
        storeLink: 'https://apps.apple.com/app/streisand/id6450534064',
        steps: [
          'Установите приложение <strong>Streisand</strong> из App Store.',
          'Нажмите иконку <strong>"+"</strong> в правом верхнем углу.',
          'Выберите <strong>"Scan QR Code"</strong> (или вставьте скопированную ссылку из буфера).',
          'Нажмите кнопку подключения (Connect). При первом запуске разрешите добавление VPN-конфигурации.'
        ]
      },
      {
        name: 'FoXray / V2Box',
        type: 'Альтернатива (Бесплатно)',
        badge: 'Быстрое подключение',
        storeLink: 'https://apps.apple.com/app/v2box-v2ray-client/id6446814042',
        steps: [
          'Скачайте <strong>FoXray</strong> или <strong>V2Box</strong> из App Store.',
          'Отсканируйте QR-код из генератора выше.',
          'Выберите добавленный сервер и нажмите <strong>Connect</strong>.'
        ]
      },
      {
        name: 'AmneziaWG App',
        type: 'Для протокола AmneziaWG',
        badge: 'Официальный клиент',
        storeLink: 'https://apps.apple.com/app/amneziawg/id6478942364',
        steps: [
          'Установите <strong>AmneziaWG</strong> из App Store.',
          'В генераторе выше выберите протокол <strong>AmneziaWG</strong>.',
          'Нажмите <strong>"Скачать файл"</strong> или отсканируйте QR-код напрямую.',
          'В приложении нажмите <strong>"Добавить туннель"</strong> и активируйте его.'
        ]
      }
    ]
  },
  android: {
    name: 'Android',
    apps: [
      {
        name: 'v2rayNG',
        type: 'Рекомендуется (Google Play / GitHub)',
        badge: 'Топ для VLESS Reality',
        storeLink: 'https://github.com/2dust/v2rayNG/releases',
        steps: [
          'Установите <strong>v2rayNG</strong> из Google Play или с GitHub Releases.',
          'Нажмите значок <strong>"+"</strong> в правом верхнем углу.',
          'Выберите <strong>"Импорт профиля из QR-кода"</strong> (или "Импорт из буфера обмена").',
          'Нажмите круглую кнопку подключения в правом нижнем углу.'
        ]
      },
      {
        name: 'AmneziaWG Android',
        type: 'Для протокола AmneziaWG',
        badge: 'Максимальная скорость',
        storeLink: 'https://github.com/amnezia-vpn/amneziawg-android/releases',
        steps: [
          'Скачайте <strong>AmneziaWG</strong> из Google Play или GitHub.',
          'Нажмите синюю кнопку <strong>"+"</strong> -> <strong>"Сканировать QR-код"</strong>.',
          'Включите переключатель напротив туннеля.'
        ]
      },
      {
        name: 'NekoBox / Sing-box',
        type: 'Продвинутый клиент',
        badge: 'Все протоколы',
        storeLink: 'https://github.com/MatsuriDayo/NekoBoxForAndroid/releases',
        steps: [
          'Установите <strong>NekoBox</strong>.',
          'Импортируйте ссылку или JSON-профиль из генератора.',
          'Активируйте туннель.'
        ]
      }
    ]
  },
  windows: {
    name: 'Windows 10 / 11',
    apps: [
      {
        name: 'v2rayN',
        type: 'Для VLESS Reality (Рекомендуется)',
        badge: 'Легкий и мощный',
        storeLink: 'https://github.com/2dust/v2rayN/releases',
        steps: [
          'Скачайте архив <code>v2rayN-With-Core.zip</code> с GitHub Releases и распакуйте.',
          'Скопируйте ссылку <code>vless://...</code> из генератора выше.',
          'В окне v2rayN нажмите клавиши <strong>Ctrl + V</strong> — профиль добавится автоматически.',
          'Кликните правой кнопкой мыши по серверу -> <strong>"Установить как активный"</strong>.',
          'Внизу окна включите <strong>"Системный прокси" -> "Включить автоматическую настройку"</strong>.'
        ]
      },
      {
        name: 'Amnezia VPN Client',
        type: 'Для AmneziaWG и WireGuard',
        badge: 'Официальное приложение с GUI',
        storeLink: 'https://amnezia.org/ru/downloads',
        steps: [
          'Скачайте и установите <strong>Amnezia VPN</strong> для Windows.',
          'В генераторе выберите AmneziaWG и нажмите <strong>"Скачать файл"</strong>.',
          'В Amnezia VPN перейдите в <strong>Настройки -> Добавить протокол -> Из файла</strong>.',
          'Нажмите большую круглую кнопку подключения.'
        ]
      },
      {
        name: 'Hiddify Next',
        type: 'Современный кроссплатформенный клиент',
        badge: 'Красивый интерфейс',
        storeLink: 'https://github.com/hiddify/hiddify-next/releases',
        steps: [
          'Скачайте Hiddify из GitHub Releases.',
          'Нажмите <strong>"Новый профиль" -> "Из буфера обмена"</strong>.',
          'Нажмите <strong>Connect</strong>.'
        ]
      }
    ]
  },
  macos: {
    name: 'macOS (Apple Silicon & Intel)',
    apps: [
      {
        name: 'FoXray / V2Box для Mac',
        type: 'Для VLESS Reality',
        badge: 'Доступно в Mac App Store',
        storeLink: 'https://apps.apple.com/app/foxray/id6448898396',
        steps: [
          'Установите <strong>FoXray</strong> из Mac App Store.',
          'Скопируйте ссылку <code>vless://...</code> из генератора.',
          'В FoXray нажмите <strong>Import from Clipboard</strong>.',
          'Нажмите кнопку Play для старта VPN-соединения.'
        ]
      },
      {
        name: 'Amnezia VPN для Mac',
        type: 'Для AmneziaWG',
        badge: 'Нативная скорость',
        storeLink: 'https://amnezia.org/ru/downloads',
        steps: [
          'Установите <strong>Amnezia VPN</strong>.',
          'Импортируйте скачанный конфиг <code>.conf</code>.',
          'Подключитесь в один клик.'
        ]
      }
    ]
  },
  routers: {
    name: 'Роутеры (Keenetic, OpenWrt, Mikrotik)',
    apps: [
      {
        name: 'Keenetic (KeeneticOS 4.x+)',
        type: 'Поддержка из коробки',
        badge: 'WireGuard / SSTP / Xray',
        storeLink: '#',
        steps: [
          'Откройте панель управления Keenetic (обычно <code>192.168.1.1</code>).',
          'Перейдите в раздел <strong>"Сетевые правила" -> "Интернет-фильтры" / "Другие подключения"</strong>.',
          'Для WireGuard / AmneziaWG: нажмите <strong>"Добавить подключение" -> WireGuard</strong> и импортируйте скачанный <code>client.conf</code>.',
          'Для VLESS Reality на Keenetic: установите пакет <code>xray</code> через OPKG (Entware) или используйте маршрутизацию через клиентское устройство.'
        ]
      },
      {
        name: 'OpenWrt (Passwall / OpenClash)',
        type: 'Прошивка OpenWrt',
        badge: 'Любые протоколы',
        storeLink: '#',
        steps: [
          'Установите пакет <strong>luci-app-passwall</strong> или <strong>luci-app-openclash</strong>.',
          'Вставьте ссылку <code>vless://...</code> в раздел <strong>Node List -> Add node from link</strong>.',
          'Настройте избирательную маршрутизацию (только заблокированные ресурсы через VPN).'
        ]
      }
    ]
  }
};

// Initialize DOM elements
document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupProtocolSelector();
  setupSNICChips();
  setupActions();
  renderPlatformGuides('ios');
  setupPlatformTabs();
  setupPing();

  // Initial config generation
  await generateConfig();
  fetchSystemStatus();
});

// Setup Main Tabs
function setupTabs() {
  const tabs = document.querySelectorAll('.nav-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const targetId = `tab-${tab.dataset.tab}`;
      document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.remove('active');
      });
      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.classList.add('active');
    });
  });
}

// Protocol selection
function setupProtocolSelector() {
  const options = document.querySelectorAll('.protocol-option');
  options.forEach(opt => {
    opt.addEventListener('click', () => {
      options.forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      const radio = opt.querySelector('input[type="radio"]');
      radio.checked = true;

      const proto = radio.value;
      const sniGroup = document.getElementById('sni-selector-group');
      const portInput = document.getElementById('server-port');

      if (proto === 'vless-reality') {
        sniGroup.style.display = 'block';
        portInput.value = '443';
      } else if (proto === 'amneziawg' || proto === 'wireguard') {
        sniGroup.style.display = 'none';
        portInput.value = '51820';
      } else if (proto === 'shadowsocks') {
        sniGroup.style.display = 'none';
        portInput.value = '8388';
      }

      generateConfig();
    });
  });
}

// Setup SNI Chips
async function setupSNICChips() {
  const chipsContainer = document.getElementById('sni-chips');
  const customSniInput = document.getElementById('custom-sni');

  try {
    const res = await fetch('/api/sni-list');
    const sniList = await res.json();

    chipsContainer.innerHTML = '';
    sniList.forEach((item, idx) => {
      const chip = document.createElement('button');
      chip.className = `sni-chip ${idx === 0 ? 'active' : ''}`;
      chip.textContent = item.domain;
      chip.title = `${item.name}: ${item.desc}`;
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.sni-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        customSniInput.value = item.domain;
        generateConfig();
      });
      chipsContainer.appendChild(chip);
    });
  } catch (e) {
    console.error('Failed to load SNI list', e);
  }
}

// Client-side fallback generator for offline / Android APK usage
function generateOfflineBundle(protocol, serverIp, port, sni, clientName) {
  const randHex = (len) => {
    const bytes = new Uint8Array(Math.ceil(len / 2));
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, len);
  };

  const randB64Url = (len) => {
    const bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };

  const randB64 = (len) => {
    const bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  };

  const uuid = crypto.randomUUID ? crypto.randomUUID() : `${randHex(8)}-${randHex(4)}-4${randHex(3)}-a${randHex(3)}-${randHex(12)}`;

  if (protocol === 'vless-reality') {
    const pubKey = randB64Url(32);
    const shortId = randHex(8);
    const uri = `vless://${uuid}@${serverIp}:${port}?security=reality&encryption=none&pbk=${pubKey}&headerType=none&fp=chrome&spx=%2F&type=tcp&flow=xtls-rprx-vision&sni=${sni}&sid=${shortId}#${encodeURIComponent(clientName)}`;

    return {
      protocol: 'vless-reality',
      name: clientName,
      serverIp,
      port,
      sni,
      clientUri: uri,
      serverConfigJson: JSON.stringify({
        log: { loglevel: 'warning' },
        inbounds: [{
          port,
          protocol: 'vless',
          settings: { clients: [{ id: uuid, flow: 'xtls-rprx-vision' }] },
          streamSettings: {
            network: 'tcp',
            security: 'reality',
            realitySettings: { dest: `${sni}:443`, serverNames: [sni], shortIds: [shortId] }
          }
        }]
      }, null, 2)
    };
  } else if (protocol === 'amneziawg' || protocol === 'wireguard') {
    const isAmnezia = protocol === 'amneziawg';
    const cPriv = randB64(32);
    const sPub = randB64(32);
    const psk = randB64(32);

    let conf = `# OKAK VPN Client Profile: ${clientName}\n[Interface]\nPrivateKey = ${cPriv}\nAddress = 10.8.0.2/32\nDNS = 1.1.1.1, 1.0.0.1\n`;
    if (isAmnezia) {
      conf += `Jc = 4\nJmin = 40\nJmax = 70\nS1 = 15\nS2 = 30\nH1 = 1482947192\nH2 = 1892837419\nH3 = 1029384719\nH4 = 1728391029\n`;
    }
    conf += `\n[Peer]\nPublicKey = ${sPub}\nPresharedKey = ${psk}\nEndpoint = ${serverIp}:${port}\nAllowedIPs = 0.0.0.0/0, ::/0\nPersistentKeepalive = 25\n`;

    return {
      protocol,
      name: clientName,
      serverIp,
      port,
      clientConfig: conf,
      serverConfig: `# Server config:\n[Interface]\nAddress = 10.8.0.1/24\nListenPort = ${port}\n`
    };
  } else {
    const key = randB64(16);
    const uri = `ss://${btoa('2022-blake3-aes-128-gcm:' + key)}@${serverIp}:${port}#${encodeURIComponent(clientName)}`;
    return {
      protocol: 'shadowsocks',
      name: clientName,
      serverIp,
      port,
      clientUri: uri,
      serverConfigJson: JSON.stringify({ server_port: port, method: '2022-blake3-aes-128-gcm', password: key }, null, 2)
    };
  }
}

// Generate Config
async function generateConfig() {
  const selectedProtoInput = document.querySelector('input[name="protocol"]:checked');
  const protocol = selectedProtoInput ? selectedProtoInput.value : 'vless-reality';
  const serverIp = document.getElementById('server-ip').value.trim() || '185.120.45.10';
  const port = parseInt(document.getElementById('server-port').value, 10) || 443;
  const sni = document.getElementById('custom-sni').value.trim() || 'gateway.icloud.com';
  const clientName = document.getElementById('client-name').value.trim() || 'OKAK-Client';

  try {
    let bundle = null;
    let qrDataUrl = null;

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ protocol, serverIp, port, sni, clientName })
      });
      const data = await response.json();
      if (data && data.success) {
        bundle = data.bundle;
        qrDataUrl = data.qrDataUrl;
      }
    } catch (netErr) {
      // Offline fallback
    }

    if (!bundle) {
      bundle = generateOfflineBundle(protocol, serverIp, port, sni, clientName);
    }

    if (!qrDataUrl && typeof qrcode !== 'undefined') {
      const qrText = bundle.clientUri || bundle.clientConfig;
      const qr = qrcode(0, 'M');
      qr.addData(qrText);
      qr.make();
      qrDataUrl = qr.createDataURL(4, 4);
    }

    currentBundle = bundle;

    // Update QR Code
    if (qrDataUrl) {
      document.getElementById('qr-image').src = qrDataUrl;
    }

    // Update Meta Details
    document.getElementById('res-server-endpoint').textContent = `${serverIp}:${port}`;
    const sniItem = document.getElementById('meta-sni-item');
    if (protocol === 'vless-reality') {
      sniItem.style.display = 'flex';
      document.getElementById('res-sni').textContent = sni;
      document.getElementById('res-proto-name').textContent = 'VLESS Reality (XTLS)';
    } else if (protocol === 'amneziawg') {
      sniItem.style.display = 'none';
      document.getElementById('res-proto-name').textContent = 'AmneziaWG (Obfuscated)';
    } else if (protocol === 'wireguard') {
      sniItem.style.display = 'none';
      document.getElementById('res-proto-name').textContent = 'WireGuard Standard';
    } else {
      sniItem.style.display = 'none';
      document.getElementById('res-proto-name').textContent = 'Shadowsocks-2022';
    }

    renderOutputText();
  } catch (err) {
    console.error('Generation failed:', err);
  }
}

function renderOutputText() {
  if (!currentBundle) return;
  const outputEl = document.getElementById('output-text');

  if (currentOutputMode === 'link') {
    if (currentBundle.clientUri) {
      outputEl.value = currentBundle.clientUri;
    } else {
      outputEl.value = currentBundle.clientConfig;
    }
  } else if (currentOutputMode === 'server') {
    if (currentBundle.serverConfigJson) {
      outputEl.value = currentBundle.serverConfigJson;
    } else {
      outputEl.value = currentBundle.serverConfig;
    }
  } else if (currentOutputMode === 'clash') {
    if (currentBundle.clashMetaYaml) {
      outputEl.value = currentBundle.clashMetaYaml;
    } else if (currentBundle.singBoxOutboundJson) {
      outputEl.value = currentBundle.singBoxOutboundJson;
    } else {
      outputEl.value = `# Native format is recommended for this protocol:\n${currentBundle.clientConfig}`;
    }
  }
}

// Setup Event Actions
function setupActions() {
  document.getElementById('btn-generate').addEventListener('click', (e) => {
    e.preventDefault();
    generateConfig();
  });

  document.getElementById('btn-quick-random').addEventListener('click', (e) => {
    e.preventDefault();
    const randomIP = `${Math.floor(Math.random() * 150 + 40)}.${Math.floor(Math.random() * 200 + 10)}.${Math.floor(Math.random() * 250 + 1)}.${Math.floor(Math.random() * 250 + 1)}`;
    document.getElementById('server-ip').value = randomIP;
    document.getElementById('client-name').value = `OKAK-${Math.random().toString(36).substring(2, 7)}`;
    generateConfig();
  });

  // Output Tabs
  document.querySelectorAll('.out-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.out-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentOutputMode = btn.dataset.out;
      renderOutputText();
    });
  });

  // Copy URI button
  document.getElementById('btn-copy-uri').addEventListener('click', () => {
    const text = document.getElementById('output-text').value;
    if (window.OkakBridge && window.OkakBridge.copyToClipboard) {
      window.OkakBridge.copyToClipboard(text);
    } else {
      navigator.clipboard.writeText(text).then(() => {
        showToast('Скопировано в буфер обмена!');
      });
    }
  });

  // Open in VPN app button
  const btnOpenVpn = document.getElementById('btn-open-vpn-app');
  if (btnOpenVpn) {
    btnOpenVpn.addEventListener('click', () => {
      if (!currentBundle) return;
      const target = currentBundle.clientUri || currentBundle.clientConfig;
      if (window.OkakBridge && window.OkakBridge.openVpnLink) {
        window.OkakBridge.openVpnLink(target);
      } else {
        if (currentBundle.clientUri) {
          window.location.href = currentBundle.clientUri;
        } else {
          navigator.clipboard.writeText(target).then(() => {
            showToast('Конфигурация скопирована! Вставьте в Amnezia / WireGuard');
          });
        }
      }
    });
  }

  // Download Config File button
  document.getElementById('btn-download-conf').addEventListener('click', () => {
    if (!currentBundle) return;
    let filename = 'okak-vpn.txt';
    let content = '';

    if (currentBundle.protocol === 'vless-reality') {
      filename = `${currentBundle.name || 'reality'}.txt`;
      content = currentBundle.clientUri;
    } else if (currentBundle.protocol === 'amneziawg' || currentBundle.protocol === 'wireguard') {
      filename = `${currentBundle.name || 'wireguard'}.conf`;
      content = currentBundle.clientConfig;
    } else {
      filename = `${currentBundle.name || 'shadowsocks'}.txt`;
      content = currentBundle.clientUri;
    }

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Файл ${filename} сохранен!`);
  });

  // Copy docker compose button
  document.getElementById('btn-copy-docker').addEventListener('click', () => {
    const text = document.getElementById('docker-compose-preview').innerText;
    navigator.clipboard.writeText(text).then(() => {
      showToast('Docker Compose скопирован!');
    });
  });

  // Copy Line Buttons
  document.querySelectorAll('.copy-line-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const copyText = btn.dataset.copy;
      navigator.clipboard.writeText(copyText).then(() => {
        showToast('Команда скопирована!');
      });
    });
  });
}

// Platform Guide Render
function renderPlatformGuides(platformKey) {
  const data = PLATFORM_DATA[platformKey];
  const container = document.getElementById('platform-content');
  if (!data || !container) return;

  container.innerHTML = `
    <div class="card-header">
      <h2>${data.name}</h2>
      <span class="tag tag-cyan">Пошаговое руководство</span>
    </div>
    <div class="apps-list">
      ${data.apps.map(app => `
        <div class="client-app-card">
          <div class="client-app-header">
            <div>
              <span class="client-app-title">${app.name}</span>
              <span class="tag tag-success ml-8">${app.badge}</span>
            </div>
            ${app.storeLink && app.storeLink !== '#' ? `<a href="${app.storeLink}" target="_blank" rel="noopener" class="btn-sm btn-secondary">Скачать</a>` : ''}
          </div>
          <p class="text-dim text-sm mb-16">${app.type}</p>
          <ol class="client-steps">
            ${app.steps.map(step => `<li>${step}</li>`).join('')}
          </ol>
        </div>
      `).join('')}
    </div>
  `;
}

function setupPlatformTabs() {
  const tabs = document.querySelectorAll('.platform-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderPlatformGuides(tab.dataset.platform);
    });
  });
}

// Ping diagnostic
function setupPing() {
  const runBtn = document.getElementById('btn-run-ping');
  runBtn.addEventListener('click', async () => {
    const rows = document.querySelectorAll('.ping-row');
    for (const row of rows) {
      const target = row.dataset.target;
      const valEl = row.querySelector('.ping-val');
      valEl.textContent = 'Проверка...';
      valEl.style.color = '#94a3b8';

      try {
        const res = await fetch('/api/ping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target })
        });
        const d = await res.json();
        if (d.online) {
          valEl.textContent = `${d.latencyMs} ms (OK)`;
          valEl.style.color = '#34d399';
        } else {
          valEl.textContent = 'Ошибка ответа';
          valEl.style.color = '#f87171';
        }
      } catch (err) {
        valEl.textContent = 'Таймаут';
        valEl.style.color = '#f87171';
      }
    }
  });
}

// Fetch System Status
async function fetchSystemStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.status === 'online') {
      const tunnel = data.tunnel || {};
      const elUptime = document.getElementById('diag-uptime');
      if (elUptime) elUptime.textContent = `${tunnel.uptimeSeconds || 0}s`;
      const elReqs = document.getElementById('diag-requests');
      if (elReqs) elReqs.textContent = tunnel.totalRequests || 0;
    }
  } catch (e) {
    // ignore
  }
}

// Toast notification helper
function showToast(message) {
  let toast = document.getElementById('okak-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'okak-toast';
    toast.style.position = 'fixed';
    toast.style.bottom = '24px';
    toast.style.right = '24px';
    toast.style.background = '#10b981';
    toast.style.color = '#ffffff';
    toast.style.padding = '12px 20px';
    toast.style.borderRadius = '8px';
    toast.style.fontWeight = '700';
    toast.style.boxShadow = '0 8px 24px rgba(0,0,0,0.4)';
    toast.style.zIndex = '9999';
    toast.style.transition = 'all 0.3s ease';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
  }, 2500);
}
