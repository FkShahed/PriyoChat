const http = require('http');
const fs = require('fs');

const filePath = 'E:/Skills/App Development/React_Native/PriyoChat/app-debug.apk';
const stat = fs.statSync(filePath);

const server = http.createServer((req, res) => {
  if (req.url === '/app-debug.apk') {
    res.writeHead(200, {
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Length': stat.size,
      'Content-Disposition': 'attachment; filename=app-debug.apk'
    });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h2>PriyoChat Live Debug APK</h2><p><a href="/app-debug.apk" style="font-size:20px;display:inline-block;padding:10px 20px;background:#0084FF;color:white;text-decoration:none;border-radius:8px;">Download app-debug.apk</a></p>');
  }
});

server.listen(8888, '0.0.0.0', () => {
  console.log('Download server running at http://192.168.1.102:8888');
});

