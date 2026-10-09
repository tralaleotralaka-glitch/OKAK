const express = require('express');
const cors = require('cors');
const path = require('path');
const QRCode = require('qrcode');
const {
  RECOMMENDED_SNI_LIST,
  generateVlessRealityBundle,
  generateWireguardBundle,
  generateShadowsocksBundle
} = require('./crypto-utils');
const { initTunnels, getStats } = require('./tunnel');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API: System status and tunnel metrics
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    version: '1.0.0',
    platform: process.platform,
    tunnel: getStats()
  });
});

// API: List recommended SNI camouflage targets
app.get('/api/sni-list', (req, res) => {
  res.json(RECOMMENDED_SNI_LIST);
});

// API: Generate VPN Profile and QR Code
app.post('/api/generate', async (req, res) => {
  try {
    const { protocol, serverIp, port, sni, clientName, isAmnezia } = req.body;
    let bundle = null;
    let qrPayload = '';

    if (protocol === 'vless-reality') {
      bundle = generateVlessRealityBundle({
        serverIp: serverIp || '198.51.100.1',
        port: port || 443,
        sni: sni || 'gateway.icloud.com',
        clientName: clientName || 'OKAK-VLESS-Reality'
      });
      qrPayload = bundle.clientUri;
    } else if (protocol === 'amneziawg') {
      bundle = generateWireguardBundle({
        serverIp: serverIp || '198.51.100.1',
        port: port || 51820,
        clientName: clientName || 'OKAK-AmneziaWG',
        isAmnezia: true
      });
      qrPayload = bundle.clientConfig;
    } else if (protocol === 'wireguard') {
      bundle = generateWireguardBundle({
        serverIp: serverIp || '198.51.100.1',
        port: port || 51820,
        clientName: clientName || 'OKAK-WireGuard',
        isAmnezia: false
      });
      qrPayload = bundle.clientConfig;
    } else if (protocol === 'shadowsocks') {
      bundle = generateShadowsocksBundle({
        serverIp: serverIp || '198.51.100.1',
        port: port || 8388,
        clientName: clientName || 'OKAK-Shadowsocks'
      });
      qrPayload = bundle.clientUri;
    } else {
      return res.status(400).json({ error: 'Unsupported protocol' });
    }

    // Generate high-resolution QR code
    const qrDataUrl = await QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });

    res.json({
      success: true,
      bundle,
      qrDataUrl
    });
  } catch (err) {
    console.error('Error generating configuration:', err);
    res.status(500).json({ error: 'Failed to generate configuration: ' + err.message });
  }
});

// API: Latency & health check
app.post('/api/ping', async (req, res) => {
  const start = Date.now();
  try {
    const target = req.body.target || 'https://api.github.com';
    const response = await fetch(target, { method: 'HEAD', signal: AbortSignal.timeout(4000) });
    const latency = Date.now() - start;
    res.json({ online: true, status: response.status, latencyMs: latency });
  } catch (err) {
    res.json({ online: false, error: err.message, latencyMs: Date.now() - start });
  }
});

// Fallback route
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start proxy tunnels & HTTP server
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`[OKAK VPN Suite] Manager dashboard running at http://0.0.0.0:${PORT}`);
  try {
    await initTunnels();
  } catch (e) {
    console.warn('Could not bind all tunnel ports:', e.message);
  }
});
