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
await copyFile('manifest.json', 'dist/manifest.json');
