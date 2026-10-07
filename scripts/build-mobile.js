const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const src = path.join(root, 'public');
const out = path.join(root, 'www');
const api = (process.env.MOBILE_API_URL || '').trim().replace(/\/$/, '');
if (!api || !/^https:\/\//i.test(api)) {
  console.error('MOBILE_API_URL doit être une URL HTTPS, par exemple https://foot26.vercel.app');
  process.exit(1);
}
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true });
fs.writeFileSync(path.join(out, 'js', 'config.js'), `window.FOOT26_API_BASE = ${JSON.stringify(api)};\n`, 'utf8');
console.log(`Web mobile préparé dans ${out}`);
