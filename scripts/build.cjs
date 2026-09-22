const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

async function build() {
  const root = path.resolve(__dirname, '..');
  const assetsDir = path.join(root, 'public/assets');
  fs.mkdirSync(assetsDir, { recursive:true });
  for (const file of fs.readdirSync(assetsDir)) {
    if (/^(app|chunk|asset)-/.test(file)) fs.rmSync(path.join(assetsDir, file));
  }
  const result = await esbuild.build({
    entryPoints: [path.join(root, 'src/app.jsx')],
    bundle: true,
    splitting: true,
    format: 'esm',
    minify: true,
    target: ['es2020'],
    outdir: assetsDir,
    entryNames: 'app-[hash]',
    chunkNames: 'chunk-[hash]',
    assetNames: 'asset-[hash]',
    loader: { '.png': 'file' },
    metafile: true,
    define: { 'process.env.NODE_ENV': '"production"' }
  });
  const entry = Object.entries(result.metafile.outputs).find(([, info]) => info.entryPoint?.endsWith('app.jsx'));
  const script = path.basename(entry[0]);
  const css = path.basename(entry[1].cssBundle);
  fs.copyFileSync(path.join(root, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'), path.join(root, 'public/assets/pdf.worker.min.mjs'));
  const template = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
  fs.writeFileSync(path.join(root, 'public/index.html'), template.replace('{{SCRIPT}}', script).replace('{{CSS}}', css));
  console.log('Built ' + script + ' and ' + css);
}
build().catch(error => { console.error(error); process.exit(1); });
