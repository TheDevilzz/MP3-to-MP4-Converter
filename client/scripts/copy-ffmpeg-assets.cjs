const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourceDir = path.join(root, 'node_modules', '@ffmpeg', 'core', 'dist', 'esm');
const targetDir = path.join(root, 'public', 'ffmpeg');
const assets = ['ffmpeg-core.js', 'ffmpeg-core.wasm'];

fs.mkdirSync(targetDir, { recursive: true });

for (const asset of assets) {
  const source = path.join(sourceDir, asset);
  const target = path.join(targetDir, asset);

  if (!fs.existsSync(source)) {
    throw new Error(`Missing FFmpeg WASM asset: ${source}`);
  }

  fs.copyFileSync(source, target);
}

console.log(`Copied FFmpeg WASM assets to ${path.relative(root, targetDir)}`);
