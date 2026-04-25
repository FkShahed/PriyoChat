
const https = require('https');

https.get('https://priyochat.onrender.com/api/calls', (res) => {
  console.log('Status Code:', res.statusCode);
  res.on('data', (d) => {
    process.stdout.write(d);
  });
}).on('error', (e) => {
  console.error('Error:', e.message);
});
