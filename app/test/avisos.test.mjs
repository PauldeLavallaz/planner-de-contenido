// Avisos por Telegram contra una API falsa: nunca toca Telegram de verdad.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const root = mkdtempSync(resolve(tmpdir(), 'planner-avisos-'));
const pend = resolve(root, 'publicar/.planner/avisos/pendientes'), env = resolve(root, 'publicar/.planner/avisos/enviados');
mkdirSync(pend, { recursive: true });
mkdirSync(resolve(root, 'historias/semana/historias'), { recursive: true });
for (const n of [1, 2, 3]) writeFileSync(resolve(root, `historias/semana/historias/h${n}.png`), Buffer.alloc(64, n));
const config = resolve(root, 'planner.config.json');
writeFileSync(config, JSON.stringify({ timezone: 'America/Argentina/Buenos_Aires', content: { root: '.' }, publish_root: 'publicar', telegram: { chat_id: '777' } }));

// La API falsa: anota cada llamada y responde como Telegram. `falla` hace que la próxima responda 429.
const llamadas = [];
let falla = 0, chatRespuesta = '777';
const api = createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks).toString('utf8'), metodo = req.url.split('/').pop();
  llamadas.push({ url: req.url, metodo, body });
  res.setHeader('Content-Type', 'application/json');
  if (falla) { falla--; res.statusCode = 429; res.end(JSON.stringify({ ok: false, description: 'Too Many Requests', parameters: { retry_after: 90 } })); return; }
  const msg = { message_id: llamadas.length, chat: { id: Number(chatRespuesta) } };
  res.end(JSON.stringify({ ok: true, result: metodo === 'sendMediaGroup' ? [msg, msg] : msg }));
});
api.listen(0, '127.0.0.1');
await once(api, 'listening');
process.env.PLANNER_CONFIG = config;
process.env.TELEGRAM_BOT_TOKEN = 'test:token';
process.env.TELEGRAM_API_BASE = `http://127.0.0.1:${api.address().port}`;
const { enviarAvisos } = await import('../src/avisos.ts');
test.after(() => { api.close(); rmSync(root, { recursive: true, force: true }); });

const aviso = (id, enviar_utc, partes) => writeFileSync(resolve(pend, id + '.json'), JSON.stringify({ id, titulo: id, enviar_utc, partes }));
const leer = f => JSON.parse(readFileSync(f, 'utf8'));
const ahora = new Date('2026-11-10T17:00:00Z');

test('manda lo vencido, parte por parte, y lo pasa a enviados', async () => {
  aviso('album', '2026-11-10T16:59:00Z', [['aviso', 'Historias de hoy para TikTok', false], ['historias', '', true, { archivos: ['historias/semana/historias/h1.png', 'historias/semana/historias/h2.png', 'historias/semana/historias/h3.png'] }]]);
  aviso('futuro', '2026-11-10T18:00:00Z', [['texto', 'Todavía no', false]]);
  const r = await enviarAvisos(ahora);
  assert.deepEqual(r.enviados, ['album']);
  assert.deepEqual(llamadas.map(l => l.metodo), ['sendMessage', 'sendMediaGroup']);
  assert.ok(llamadas[0].url.startsWith('/bottest:token/'), 'the token goes in the path, as Telegram asks');
  assert.equal(JSON.parse(llamadas[0].body).chat_id, '777');
  assert.equal((llamadas[1].body.match(/filename="h\d\.png"/g) || []).length, 3, 'the three stories travel as documents');
  assert.ok(existsSync(resolve(env, 'album.json')) && !existsSync(resolve(pend, 'album.json')));
  assert.deepEqual(leer(resolve(env, 'album.json')).mensajes_enviados.map(m => m.parte), ['aviso', 'historias']);
  assert.ok(existsSync(resolve(pend, 'futuro.json')), 'what is not due yet waits');
});

test('si Telegram falla a mitad, reintenta después y no repite lo que ya salió', async () => {
  llamadas.length = 0;
  aviso('dos', '2026-11-10T16:00:00Z', [['uno', 'Primero', false], ['dos', 'Segundo', false]]);
  // La primera parte sale y la segunda choca con un límite de Telegram.
  const original = globalThis.fetch;
  let n = 0;
  globalThis.fetch = (...a) => { if (++n === 2) falla = 1; return original(...a); };
  try { assert.deepEqual((await enviarAvisos(ahora)).enviados, []); } finally { globalThis.fetch = original; }
  const av = leer(resolve(pend, 'dos.json'));
  assert.deepEqual(av.mensajes_enviados.map(m => m.parte), ['uno']);
  assert.equal(av.siguiente_intento, '2026-11-10T17:01:30Z', 'it waits what Telegram asked (90 s)');
  assert.match(av.errores[0].error, /429/);
  assert.doesNotMatch(av.errores[0].error, /token/, 'the error never carries the token');
  // Antes de la hora del reintento no hace nada; después manda sólo la que faltaba.
  llamadas.length = 0;
  assert.deepEqual((await enviarAvisos(ahora)).enviados, []);
  assert.equal(llamadas.length, 0);
  assert.deepEqual((await enviarAvisos(new Date('2026-11-10T17:02:00Z'))).enviados, ['dos']);
  assert.deepEqual(llamadas.map(l => JSON.parse(l.body).text), ['Segundo']);
});

test('un archivo fuera de la carpeta de contenido no sale y un chat que no coincide es un error', async () => {
  llamadas.length = 0;
  aviso('afuera', '2026-11-10T16:00:00Z', [['texto', 'Con archivo', false, { archivo: '/etc/hosts' }]]);
  await enviarAvisos(new Date('2026-11-10T17:05:00Z'));
  assert.equal(llamadas[0].metodo, 'sendMessage', 'without a valid file it sends the text alone');
  assert.match(JSON.parse(llamadas[0].body).text, /No encontré el archivo/);
  llamadas.length = 0;
  chatRespuesta = '999';
  aviso('otro-chat', '2026-11-10T16:00:00Z', [['texto', 'Hola', false]]);
  try { assert.deepEqual((await enviarAvisos(new Date('2026-11-10T17:05:00Z'))).enviados, []); } finally { chatRespuesta = '777'; }
  assert.match(leer(resolve(pend, 'otro-chat.json')).errores[0].error, /chat de destino/);
});

test('sin token no manda nada', async () => {
  llamadas.length = 0;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_BOT_TOKEN;
  try { assert.deepEqual((await enviarAvisos(new Date('2026-11-10T18:00:00Z'))).enviados, []); } finally { process.env.TELEGRAM_BOT_TOKEN = token; }
  assert.equal(llamadas.length, 0);
});
