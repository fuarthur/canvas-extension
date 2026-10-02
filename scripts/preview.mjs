import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const option = (name, fallback) => Number(process.argv.find(arg => arg.startsWith(`--${name}=`))?.split('=')[1] ?? fallback);
const port = option('port', 4173), timeout = option('timeout', 600);
if (!Number.isInteger(port) || port < 1024 || port > 65535 || !Number.isInteger(timeout) || timeout < 1 || timeout > 3600) {
  throw new Error('Use --port=1024..65535 and --timeout=1..3600 (seconds).');
}
const fixture = '/test/fixtures/quality-preview.html';
const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-src 'self'; base-uri 'none'; form-action 'none'");
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  const path = pathname === '/' ? fixture : pathname;
  if (path !== fixture && !/^\/src\/[a-z0-9-]+\.js$/.test(path)) { response.writeHead(404).end('Not found'); return; }
  try {
    const content = await readFile(resolve(root, `.${path}`));
    response.setHeader('Content-Type', path.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8');
    response.writeHead(200).end(request.method === 'HEAD' ? undefined : content);
  } catch { response.writeHead(404).end('Not found'); }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => {
  console.log(`Fictional preview: http://127.0.0.1:${port}/ (390 px: /?width=390)`);
  console.log(`Stops automatically in ${timeout} seconds. Ctrl+C also stops it.`);
  setTimeout(() => server.close(() => process.exit()), timeout * 1000).unref();
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit()));
