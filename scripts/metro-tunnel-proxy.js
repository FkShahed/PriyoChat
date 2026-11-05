// Tiny pass-through proxy that sits between a public tunnel (cloudflared) and the local Metro bundler.
//
// Why it exists: Expo's dev server writes ":8081" after the host name in the app manifest. Through a public
// https tunnel (port 443 only) that makes the phone look for the bundle on the wrong port and fail with
// "Failed to download remote update". This proxy removes that ":8081" from the manifest and passes everything
// else (bundle, assets, hot-reload websocket) straight through.
//
// Usage: node scripts/metro-tunnel-proxy.js [listenPort=8090] [metroPort=8081]
const http = require('http');
const net = require('net');

const LISTEN = parseInt(process.argv[2], 10) || 8090;
const METRO = { host: '127.0.0.1', port: parseInt(process.argv[3], 10) || 8081 };

http
  .createServer((req, res) => {
    const headers = { ...req.headers };
    delete headers['accept-encoding']; // we may rewrite the body, so ask Metro for it uncompressed
    const upstream = http.request({ ...METRO, path: req.url, method: req.method, headers }, (r) => {
      const type = String(r.headers['content-type'] || '');
      const rewrite = /json|multipart|text\/plain/.test(type) && !/javascript/.test(type);
      if (!rewrite) {
        res.writeHead(r.statusCode, r.headers);
        return r.pipe(res);
      }
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => {
        const body = Buffer.from(Buffer.concat(chunks).toString('utf8').replace(/(trycloudflare\.com):\d+/g, '$1'));
        const h = { ...r.headers, 'content-length': body.length };
        delete h['transfer-encoding'];
        res.writeHead(r.statusCode, h);
        res.end(body);
      });
    });
    upstream.on('error', () => {
      res.statusCode = 502;
      res.end();
    });
    req.pipe(upstream);
  })
  .on('upgrade', (req, socket, head) => {
    // hot-reload websocket
    const up = net.connect(METRO.port, METRO.host, () => {
      let raw = `${req.method} ${req.url} HTTP/1.1\r\n`;
      for (let i = 0; i < req.rawHeaders.length; i += 2) raw += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
      up.write(raw + '\r\n');
      up.write(head);
      socket.pipe(up);
      up.pipe(socket);
    });
    up.on('error', () => socket.destroy());
    socket.on('error', () => up.destroy());
  })
  .listen(LISTEN, '127.0.0.1', () => console.log(`metro tunnel proxy: :${LISTEN} -> metro :${METRO.port}`));
