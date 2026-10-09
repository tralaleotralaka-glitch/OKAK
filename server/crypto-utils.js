const crypto = require('crypto');

/**
 * Generates an X25519 keypair for Reality and WireGuard.
 * Returns raw 32-byte buffers and formatted strings.
 */
function generateX25519KeyPair() {
  const pair = crypto.generateKeyPairSync('x25519');
  const derPub = pair.publicKey.export({ type: 'spki', format: 'der' });
  const derPriv = pair.privateKey.export({ type: 'pkcs8', format: 'der' });

  // SPKI header is 12 bytes; PKCS8 header is 16 bytes. Raw key is the last 32 bytes.
  const rawPub = derPub.subarray(-32);
  const rawPriv = derPriv.subarray(-32);

  return {
    rawPub,
    rawPriv,
    base64Pub: rawPub.toString('base64'),
    base64Priv: rawPriv.toString('base64'),
    base64UrlPub: rawPub.toString('base64url'),
    base64UrlPriv: rawPriv.toString('base64url')
  };
}

/**
 * Generates a random short ID (hex string, default 8 hex chars / 4 bytes or 16 hex chars / 8 bytes).
 */
function generateShortId(length = 8) {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

/**
 * Generates a UUID v4.
 */
function generateUUID() {
  return crypto.randomUUID();
}

/**
 * Recommended SNI camouflage domains that support TLS 1.3 and H2,
 * widely whitelisted by firewalls and DPI systems worldwide.
 */
const RECOMMENDED_SNI_LIST = [
  { domain: 'gateway.icloud.com', name: 'Apple iCloud Gateway', desc: 'Fast, widespread Apple infrastructure' },
  { domain: 'dl.google.com', name: 'Google Download CDN', desc: 'Google global anycast network' },
  { domain: 'www.microsoft.com', name: 'Microsoft Official CDN', desc: 'Azure Edge network, zero suspicion' },
  { domain: 'speedtest.net', name: 'Ookla Speedtest', desc: 'High bandwidth, routine speed check traffic' },
  { domain: 'swdist.apple.com', name: 'Apple Software Distribution', desc: 'Official Apple CDN' },
  { domain: 'www.amazon.com', name: 'Amazon Web Services', desc: 'Global CloudFront CDN' },
  { domain: 'www.samsung.com', name: 'Samsung Global', desc: 'Akamai edge network' },
  { domain: 'www.cloudflare.com', name: 'Cloudflare', desc: 'High reputation edge network' }
];

/**
 * Generates randomized AmneziaWG obfuscation parameters.
 */
function generateAmneziaParams() {
  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  return {
    Jc: randInt(4, 8),
    Jmin: randInt(40, 70),
    Jmax: randInt(80, 140),
    S1: randInt(15, 35),
    S2: randInt(25, 55),
    H1: randInt(100000000, 999999999),
    H2: randInt(100000000, 999999999),
    H3: randInt(100000000, 999999999),
    H4: randInt(100000000, 999999999)
  };
}

/**
 * Build complete VLESS Reality configuration bundle.
 */
function generateVlessRealityBundle(opts = {}) {
  const serverIp = opts.serverIp || 'YOUR_SERVER_IP';
  const port = parseInt(opts.port, 10) || 443;
  const sni = opts.sni || 'gateway.icloud.com';
  const clientName = opts.clientName || 'OKAK-Reality-Client';
  const uuid = opts.uuid || generateUUID();
  const shortId = opts.shortId || generateShortId(8);

  const keys = opts.keys || generateX25519KeyPair();
  const privateKey = keys.base64UrlPriv;
  const publicKey = keys.base64UrlPub;

  // Standard VLESS Reality URI string
  const uri = `vless://${uuid}@${serverIp}:${port}?security=reality&encryption=none&pbk=${publicKey}&headerType=none&fp=chrome&spx=%2F&type=tcp&flow=xtls-rprx-vision&sni=${sni}&sid=${shortId}#${encodeURIComponent(clientName)}`;

  // Server Xray config.json
  const serverConfig = {
    log: {
      loglevel: 'warning'
    },
    inbounds: [
      {
        port: port,
        protocol: 'vless',
        tag: 'vless-reality-in',
        settings: {
          clients: [
            {
              id: uuid,
              flow: 'xtls-rprx-vision',
              email: `${clientName}@okak.vpn`
            }
          ],
          decryption: 'none'
        },
        streamSettings: {
          network: 'tcp',
          security: 'reality',
          realitySettings: {
            show: false,
            dest: `${sni}:443`,
            xver: 0,
            serverNames: [
              sni,
              sni.startsWith('www.') ? sni.replace('www.', '') : `www.${sni}`
            ],
            privateKey: privateKey,
            shortIds: [shortId, '']
          }
        },
        sniffing: {
          enabled: true,
          destOverride: ['http', 'tls', 'quic']
        }
      }
    ],
    outbounds: [
      {
        protocol: 'freedom',
        tag: 'direct'
      },
      {
        protocol: 'blackhole',
        tag: 'block'
      }
    ]
  };

  // Sing-box client JSON outbound
  const singBoxOutbound = {
    type: 'vless',
    tag: clientName,
    server: serverIp,
    server_port: port,
    uuid: uuid,
    flow: 'xtls-rprx-vision',
    tls: {
      enabled: true,
      server_name: sni,
      utls: {
        enabled: true,
        fingerprint: 'chrome'
      },
      reality: {
        enabled: true,
        public_key: publicKey,
        short_id: shortId
      }
    },
    packet_encoding: 'xudp'
  };

  // Clash Meta / Mihomo proxy configuration
  const clashMetaProxy = {
    name: clientName,
    type: 'vless',
    server: serverIp,
    port: port,
    uuid: uuid,
    network: 'tcp',
    'tls': true,
    'reality-opts': {
      'public-key': publicKey,
      'short-id': shortId
    },
    'servername': sni,
    'client-fingerprint': 'chrome',
    'flow': 'xtls-rprx-vision'
  };

  return {
    protocol: 'vless-reality',
    name: clientName,
    serverIp,
    port,
    sni,
    uuid,
    shortId,
    keys: {
      privateKey,
      publicKey
    },
    clientUri: uri,
    serverConfigJson: JSON.stringify(serverConfig, null, 2),
    singBoxOutboundJson: JSON.stringify(singBoxOutbound, null, 2),
    clashMetaYaml: [
      `- name: "${clientName}"`,
      `  type: vless`,
      `  server: ${serverIp}`,
      `  port: ${port}`,
      `  uuid: ${uuid}`,
      `  network: tcp`,
      `  tls: true`,
      `  udp: true`,
      `  flow: xtls-rprx-vision`,
      `  servername: ${sni}`,
      `  client-fingerprint: chrome`,
      `  reality-opts:`,
      `    public-key: ${publicKey}`,
      `    short-id: ${shortId}`
    ].join('\n')
  };
}

/**
 * Build AmneziaWG and Standard WireGuard bundle.
 */
function generateWireguardBundle(opts = {}) {
  const isAmnezia = opts.isAmnezia !== false; // default true
  const serverIp = opts.serverIp || 'YOUR_SERVER_IP';
  const port = parseInt(opts.port, 10) || (isAmnezia ? 51820 : 51820);
  const clientName = opts.clientName || (isAmnezia ? 'OKAK-AmneziaWG-Client' : 'OKAK-WireGuard-Client');
  const clientIp = opts.clientIp || '10.8.0.2/32';
  const serverVpnIp = opts.serverVpnIp || '10.8.0.1/24';
  const dns = opts.dns || '1.1.1.1, 1.0.0.1';

  const serverKeys = generateX25519KeyPair();
  const clientKeys = generateX25519KeyPair();
  const presharedKey = crypto.randomBytes(32).toString('base64');
  const amneziaParams = isAmnezia ? (opts.amneziaParams || generateAmneziaParams()) : null;

  // Server configuration (wg0.conf or awg0.conf)
  const serverConfLines = [
    `# OKAK VPN Server Configuration - ${isAmnezia ? 'AmneziaWG (Obfuscated)' : 'Standard WireGuard'}`,
    `[Interface]`,
    `Address = ${serverVpnIp}`,
    `ListenPort = ${port}`,
    `PrivateKey = ${serverKeys.base64Priv}`
  ];

  if (isAmnezia && amneziaParams) {
    serverConfLines.push(
      `Jc = ${amneziaParams.Jc}`,
      `Jmin = ${amneziaParams.Jmin}`,
      `Jmax = ${amneziaParams.Jmax}`,
      `S1 = ${amneziaParams.S1}`,
      `S2 = ${amneziaParams.S2}`,
      `H1 = ${amneziaParams.H1}`,
      `H2 = ${amneziaParams.H2}`,
      `H3 = ${amneziaParams.H3}`,
      `H4 = ${amneziaParams.H4}`
    );
  }

  serverConfLines.push(
    `# PostUp firewall rules for NAT/masquerading:`,
    `# PostUp = iptables -A FORWARD -i %i -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE`,
    `# PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE`,
    ``,
    `[Peer]`,
    `# Client: ${clientName}`,
    `PublicKey = ${clientKeys.base64Pub}`,
    `PresharedKey = ${presharedKey}`,
    `AllowedIPs = ${clientIp}`
  );

  // Client configuration (client.conf)
  const clientConfLines = [
    `# OKAK VPN Client Profile: ${clientName}`,
    `[Interface]`,
    `PrivateKey = ${clientKeys.base64Priv}`,
    `Address = ${clientIp}`,
    `DNS = ${dns}`
  ];

  if (isAmnezia && amneziaParams) {
    clientConfLines.push(
      `Jc = ${amneziaParams.Jc}`,
      `Jmin = ${amneziaParams.Jmin}`,
      `Jmax = ${amneziaParams.Jmax}`,
      `S1 = ${amneziaParams.S1}`,
      `S2 = ${amneziaParams.S2}`,
      `H1 = ${amneziaParams.H1}`,
      `H2 = ${amneziaParams.H2}`,
      `H3 = ${amneziaParams.H3}`,
      `H4 = ${amneziaParams.H4}`
    );
  }

  clientConfLines.push(
    ``,
    `[Peer]`,
    `PublicKey = ${serverKeys.base64Pub}`,
    `PresharedKey = ${presharedKey}`,
    `Endpoint = ${serverIp}:${port}`,
    `AllowedIPs = 0.0.0.0/0, ::/0`,
    `PersistentKeepalive = 25`
  );

  const clientConfig = clientConfLines.join('\n');
  const serverConfig = serverConfLines.join('\n');

  return {
    protocol: isAmnezia ? 'amneziawg' : 'wireguard',
    name: clientName,
    serverIp,
    port,
    clientConfig,
    serverConfig,
    serverPublicKey: serverKeys.base64Pub,
    serverPrivateKey: serverKeys.base64Priv,
    clientPublicKey: clientKeys.base64Pub,
    clientPrivateKey: clientKeys.base64Priv,
    presharedKey,
    amneziaParams
  };
}

/**
 * Build Shadowsocks-2022 bundle.
 */
function generateShadowsocksBundle(opts = {}) {
  const serverIp = opts.serverIp || 'YOUR_SERVER_IP';
  const port = parseInt(opts.port, 10) || 8388;
  const clientName = opts.clientName || 'OKAK-Shadowsocks-Client';
  const method = opts.method || '2022-blake3-aes-128-gcm';
  // 16 bytes key for aes-128
  const key = crypto.randomBytes(16).toString('base64');

  const userInfo = Buffer.from(`${method}:${key}`).toString('base64');
  const uri = `ss://${userInfo}@${serverIp}:${port}#${encodeURIComponent(clientName)}`;

  const serverConfig = {
    server: '0.0.0.0',
    server_port: port,
    password: key,
    method: method,
    timeout: 300,
    fast_open: true
  };

  return {
    protocol: 'shadowsocks-2022',
    name: clientName,
    serverIp,
    port,
    method,
    key,
    clientUri: uri,
    serverConfigJson: JSON.stringify(serverConfig, null, 2)
  };
}

module.exports = {
  generateX25519KeyPair,
  generateShortId,
  generateUUID,
  generateAmneziaParams,
  RECOMMENDED_SNI_LIST,
  generateVlessRealityBundle,
  generateWireguardBundle,
  generateShadowsocksBundle
};
