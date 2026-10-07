const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const src = path.join(root, 'public');
const out = path.join(root, 'www');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true });
fs.writeFileSync(path.join(out, 'js', 'config.js'), 'window.FOOT26_API_BASE = "";\n', 'utf8');
console.log(`Web préparé dans ${out}`);
