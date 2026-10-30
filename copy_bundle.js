const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, 'dist', '_expo', 'static', 'js', 'android', 'index-6bcc2f1e489432acb6b2ac5ee304e7a3.hbc');
const destDir = path.join(__dirname, 'android', 'app', 'src', 'main', 'assets');
const dest = path.join(destDir, 'index.android.bundle');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

fs.copyFileSync(src, dest);
console.log('BUNDLE_COPIED_SUCCESSFULLY: ' + fs.statSync(dest).size);

