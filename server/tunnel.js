const http = require('http');
const net = require('net');

/**
 * Embedded Proxy & Tunnel Service
 * Provides HTTP CONNECT tunnel proxy & SOCKS5 proxy capabilities
 * for testing and local proxying.
 */

let httpProxyServer = null;
let socks5Server = null;
let stats = {
  activeConnections: 0,
  totalRequests: 0,
  bytesTransferred: 0,
  startTime: null,
  isRunning: false
};

/**
 * Start HTTP CONNECT Proxy
 */
function startHttpProxy(port = 8085) {
  return new Promise((resolve, reject) => {
    httpProxyServer = http.createServer((req, res) => {
      // Direct HTTP requests
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'OKAK Tunnel Proxy Active',
        type: 'HTTP/HTTPS Proxy',
        usage: 'Configure your browser or app to use HTTP CONNECT proxy on this port.'
      }));
    });

    // Handle CONNECT method for HTTPS tunneling
    httpProxyServer.on('connect', (req, clientSocket, head) => {
      stats.totalRequests++;
      stats.activeConnections++;

      const [targetHost, targetPortStr] = req.url.split(':');
      const targetPort = parseInt(targetPortStr, 10) || 443;

      const serverSocket = net.connect(targetPort, targetHost, () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head && head.length) serverSocket.write(head);
        serverSocket.pipe(clientSocket);
        clientSocket.pipe(serverSocket);
      });

      serverSocket.on('data', (chunk) => {
        stats.bytesTransferred += chunk.length;
      });

      clientSocket.on('data', (chunk) => {
        stats.bytesTransferred += chunk.length;
      });

      serverSocket.on('error', (err) => {
        clientSocket.end();
      });

      clientSocket.on('error', (err) => {
        serverSocket.end();
      });

      clientSocket.on('close', () => {
        stats.activeConnections = Math.max(0, stats.activeConnections - 1);
      });
    });

    httpProxyServer.on('error', (err) => {
      console.error('HTTP Proxy error:', err.message);
      reject(err);
    });

    httpProxyServer.listen(port, '0.0.0.0', () => {
      console.log(`[OKAK Tunnel] HTTP CONNECT proxy listening on 0.0.0.0:${port}`);
      resolve(port);
    });
  });
}

/**
 * Start minimal RFC 1928 SOCKS5 Proxy
 */
function startSocks5Proxy(port = 1080) {
  return new Promise((resolve, reject) => {
    socks5Server = net.createServer((socket) => {
      let state = 'AUTH';
      let remoteSocket = null;

      socket.on('data', (data) => {
        try {
          if (state === 'AUTH') {
            // SOCKS version check
            if (data[0] !== 0x05) {
              socket.end();
              return;
            }
            // No authentication required (0x00)
            socket.write(Buffer.from([0x05, 0x00]));
            state = 'REQUEST';
          } else if (state === 'REQUEST') {
            const ver = data[0];
            const cmd = data[1];
            const atyp = data[3];

            if (ver !== 0x05 || cmd !== 0x01) {
              // 0x01 = CONNECT
              socket.write(Buffer.from([0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0])); // Command not supported
              socket.end();
              return;
            }

            let host = '';
            let portOffset = 0;

            if (atyp === 0x01) {
              // IPv4
              host = `${data[4]}.${data[5]}.${data[6]}.${data[7]}`;
              portOffset = 8;
            } else if (atyp === 0x03) {
              // Domain name
              const len = data[4];
              host = data.subarray(5, 5 + len).toString('utf8');
              portOffset = 5 + len;
            } else if (atyp === 0x04) {
              // IPv6
              const parts = [];
              for (let i = 4; i < 20; i += 2) {
                parts.push(data.readUInt16BE(i).toString(16));
              }
              host = parts.join(':');
              portOffset = 20;
            } else {
              socket.end();
              return;
            }

            const port = data.readUInt16BE(portOffset);

            stats.totalRequests++;
            stats.activeConnections++;

            remoteSocket = net.connect(port, host, () => {
              // Success response (0x00)
              const reply = Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]);
              socket.write(reply);
              socket.pipe(remoteSocket);
              remoteSocket.pipe(socket);
            });

            remoteSocket.on('data', (c) => {
              stats.bytesTransferred += c.length;
            });
            socket.on('data', (c) => {
              stats.bytesTransferred += c.length;
            });

            remoteSocket.on('error', () => socket.end());
            socket.on('error', () => remoteSocket && remoteSocket.end());
            socket.on('close', () => {
              stats.activeConnections = Math.max(0, stats.activeConnections - 1);
            });
            state = 'STREAM';
          }
        } catch (e) {
          socket.end();
        }
      });
    });

    socks5Server.on('error', (err) => {
      console.error('SOCKS5 Proxy error:', err.message);
      // If 1080 is privileged or busy, resolve anyway
      resolve(null);
    });

    socks5Server.listen(port, '0.0.0.0', () => {
      console.log(`[OKAK Tunnel] SOCKS5 proxy listening on 0.0.0.0:${port}`);
      resolve(port);
    });
  });
}

async function initTunnels() {
  stats.startTime = Date.now();
  stats.isRunning = true;
  await startHttpProxy(8085).catch(() => {});
  await startSocks5Proxy(1080).catch(() => {});
}

function getStats() {
  return {
    ...stats,
    uptimeSeconds: stats.startTime ? Math.floor((Date.now() - stats.startTime) / 1000) : 0,
    ports: {
      httpProxy: 8085,
      socks5: 1080
    }
  };
}

module.exports = {
  initTunnels,
  getStats
};
