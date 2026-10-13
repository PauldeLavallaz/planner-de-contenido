import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PUBLIC_DIR } from './config.ts';
import { registerPublicationPlanner } from './publication-planner.ts';

const app = new Hono();
const port = Number(process.env.PLANNER_PORT || 4180);
const startedAt = new Date().toISOString();
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PLANNER_PORT inválido');

app.onError((error, c) => {
  console.error(new Date().toISOString(), c.req.method, c.req.path, error);
  return c.json({ error: 'No se pudo completar. Tus cambios guardados se conservan; volvé a intentar.' }, 500);
});
app.get('/api/health', c => c.json({ ok: true, service: 'publication-planner', pid: process.pid, startedAt, uptime: process.uptime() }));
registerPublicationPlanner(app);
// Serve only the planner's public files. No dashboard, watchers or generation jobs are loaded.
for (const [file, type] of [['planner.html', 'text/html'], ['planner.js', 'text/javascript'], ['planner.css', 'text/css']]) {
  const contents = readFileSync(resolve(PUBLIC_DIR, file));
  const handler = () => new Response(contents, { headers: { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' } });
  app.get('/' + file, handler);
  if (file === 'planner.html') app.get('/', handler);
}
const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, info => {
  console.log(JSON.stringify({ event: 'listening', pid: process.pid, url: `http://127.0.0.1:${info.port}`, startedAt }));
});
server.on('error', error => { console.error(error); process.exit(1); });
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    console.log(JSON.stringify({ event: 'stopping', signal, pid: process.pid, at: new Date().toISOString() }));
    server.close(() => process.exit(0));
    setTimeout(() => { server.closeAllConnections(); process.exit(0); }, 4000).unref();
  });
}
