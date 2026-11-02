// Jalur file proyek (relatif terhadap folder ini) dan folder keluaran tangkapan layar.
const path = require('path'), fs = require('fs');
const root = path.join(__dirname, '..');
const outDir = path.join(__dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });
module.exports = {
  CODE: path.join(root, 'src', 'Code.gs'),
  HTML: path.join(root, 'src', 'Index.html'),
  WRAPPER: path.join(root, 'docs', 'index.html'),
  JPG: path.join(__dirname, 'fixtures', 'big.jpg'),
  out: name => path.join(outDir, name)
};
