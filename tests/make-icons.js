// Membuat ikon PNG aplikasi (untuk dipasang di HP) dari docs/icon.svg. Pakai: node tests/make-icons.js
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const docs = path.join(__dirname, '..', 'docs');
const svg = fs.readFileSync(path.join(docs, 'icon.svg'), 'utf8');
const sizes = [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]];

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const [name, n] of sizes) {
    await p.setViewportSize({ width: n, height: n });
    await p.setContent('<html><body style="margin:0">' + svg.replace('<svg ', '<svg width="' + n + '" height="' + n + '" ') + '</body></html>');
    await p.screenshot({ path: path.join(docs, name), clip: { x: 0, y: 0, width: n, height: n } });
    console.log('dibuat ' + name);
  }
  await b.close();
})();
