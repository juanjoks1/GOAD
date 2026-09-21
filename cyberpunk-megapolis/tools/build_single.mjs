/**
 * Builds dist/cyberpunk-megapolis.html: the whole game as one self-contained
 * HTML file with every script, texture, model and font inlined as a data URI.
 *
 * That file opens straight from a phone's Downloads folder over file://, where
 * ES modules and fetch() of sibling files are blocked by CORS. Serving the
 * project folder normally is still the better experience; this is the "just
 * open it on my phone" build.
 *
 *   node tools/build_single.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
fs.mkdirSync(DIST, { recursive: true });

const MIME = {
  '.json': 'application/json', '.glb': 'model/gltf-binary', '.webp': 'image/webp',
  '.png': 'image/png', '.wasm': 'application/wasm', '.js': 'text/javascript',
  '.woff2': 'font/woff2',
};

const dataURI = (file) => {
  const buf = fs.readFileSync(file);
  const mime = MIME[path.extname(file)] || 'application/octet-stream';
  return `data:${mime};base64,${buf.toString('base64')}`;
};

/* ------------------------------------------------------------- 1. bundle */
const aliasVendor = {
  name: 'vendor-alias',
  setup(build) {
    build.onResolve({ filter: /^three$/ }, () => ({ path: path.join(ROOT, 'vendor/three/three.module.js') }));
    build.onResolve({ filter: /^three\/addons\// }, (args) => ({
      path: path.join(ROOT, 'vendor/three/jsm', args.path.replace('three/addons/', '')),
    }));
  },
};
const bundled = await esbuild.build({
  entryPoints: [path.join(ROOT, 'main.js')],
  bundle: true, format: 'iife', write: false, target: ['es2022'],
  minify: true, legalComments: 'none', plugins: [aliasVendor],
});
const js = bundled.outputFiles[0].text;

/* ---------------------------------------------------------- 2. asset map */
const assets = {};
let assetBytes = 0;
const collect = (dir, filter) => {
  for (const f of fs.readdirSync(path.join(ROOT, dir))) {
    if (!filter(f)) continue;
    const rel = `${dir}/${f}`;
    const abs = path.join(ROOT, rel);
    if (fs.statSync(abs).isDirectory()) continue;
    assetBytes += fs.statSync(abs).size;
    assets[rel] = dataURI(abs);
  }
};
collect('data', (f) => f.endsWith('.json'));
collect('glb', (f) => f.endsWith('.glb'));
collect('chars', (f) => f.endsWith('.glb'));
// WebP only: every browser that can run WebGL2 decodes WebP, and the PNG
// fallbacks would add ~6 MB to a file meant to be copied onto a phone.
collect('textures', (f) => f.endsWith('.webp'));
collect('vendor/draco/gltf', (f) => f.endsWith('.js') || f.endsWith('.wasm'));

/* ------------------------------------------------------------ 3. styles */
let css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
css = css.replace(/url\('\.\/fonts\/([^']+)'\)/g, (_, f) => `url('${dataURI(path.join(ROOT, 'fonts', f))}')`);

/* -------------------------------------------------------------- 4. HTML */
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'))
  .replace(/<script type="module"[^>]*><\/script>/g, '');
const head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>'))
  .replace(/<link rel="stylesheet"[^>]*>/g, '')
  .replace(/<script type="importmap">[\s\S]*?<\/script>/g, '');

const out = `<!DOCTYPE html>
<html lang="zh-CN">
<head>${head}
<style>${css}</style>
</head>
<body>${body}
<script>window.__INLINE_ASSETS = ${JSON.stringify(assets)};</script>
<script>${js}</script>
</body>
</html>
`;

const file = path.join(DIST, 'cyberpunk-megapolis.html');
fs.writeFileSync(file, out);
const mb = (n) => (n / 1048576).toFixed(2) + ' MB';
console.log(`dist/cyberpunk-megapolis.html  ${mb(Buffer.byteLength(out))}`);
console.log(`  bundled script   ${mb(Buffer.byteLength(js))}`);
console.log(`  inlined assets   ${mb(assetBytes)} raw, ${Object.keys(assets).length} files`);
console.log(`  styles + markup  ${mb(Buffer.byteLength(css) + Buffer.byteLength(body))}`);
