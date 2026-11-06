import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
await build({
  entryPoints: { appearance:'src/appearance-entry.js',content: 'src/content.js', background: 'src/background.js', 'calendar-bridge': 'src/calendar-bridge-entry.js' },
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome114',
  sourcemap: false,
  minify: false
});
await build({entryPoints: ['demo/demo.js'], outfile: 'dist/demo.js', bundle: true, format: 'esm', platform: 'browser', target: 'chrome114'});
await copyFile('manifest.json', 'dist/manifest.json');
await copyFile('demo/index.html', 'dist/demo.html');
await copyFile('demo/demo.css', 'dist/demo.css');
await mkdir('dist/icons',{recursive:true});
await copyFile('assets/deadline-128.png','dist/icons/deadline-128.png');
