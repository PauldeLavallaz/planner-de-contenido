// Anuncios: se elige un video publicado, viaja en la propuesta y el mensaje dice cómo subirlo. El planner no toca la carpeta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverPath = fileURLToPath(new URL('../src/server.ts', import.meta.url));
const video = { id: 'queue:salio', title: 'Ya salió', status: 'published', approved: true, source: 'piezas/salio', primary: { path: 'piezas/salio/final.mp4', kind: 'video' }, fingerprint: 'v1', scheduled: null, networks: ['instagram'], channels: [], media: [], components: [], captions: {} };
const carrusel = { ...video, id: 'queue:carrusel', title: 'Carrusel', format: 'carousel', primary: { path: 'piezas/c/01.png', kind: 'image' } };

test('anuncios: elegir, proponer y el mensaje para subirlos', async t => {
  const root = mkdtempSync(resolve(tmpdir(), 'planner-anuncios-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(resolve(root, 'publicar/.planner'), { recursive: true });
  const config = resolve(root, 'planner.config.json'), inventario = resolve(root, 'inventario.py');
  writeFileSync(config, JSON.stringify({ timezone: 'America/Argentina/Buenos_Aires', content: { root: '.' }, publish_root: 'publicar', channels: { instagram: { id: 'ig' } }, anuncios: { nombre: 'Anuncios de prueba', remoto: 'drive:Anuncios', url: 'https://example.com/carpeta' } }));
  writeFileSync(inventario, 'print(' + JSON.stringify(JSON.stringify({ items: [video, carrusel], timezone: 'America/Argentina/Buenos_Aires', config: {} })) + ')\n');
  const child = spawn(process.execPath, [serverPath], { cwd: tmpdir(), env: { ...process.env, PLANNER_PORT: '0', PLANNER_CONFIG: config, PLANNER_INVENTORY: inventario }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) { const fin = once(child, 'exit'); child.kill('SIGTERM'); await fin; } });
  let errors = '';
  child.stderr.on('data', c => { errors += c; });
  const base = await new Promise((done, reject) => {
    const timer = setTimeout(() => reject(new Error('startup timeout: ' + errors)), 10000);
    let out = '';
    child.stdout.on('data', c => { out += c; const l = out.split('\n').find(x => x.includes('"event":"listening"')); if (l) { clearTimeout(timer); done(JSON.parse(l).url); } });
  });
  const json = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  const data = await (await fetch(base + '/api/planner/data')).json();
  assert.deepEqual(data.anuncios.carpeta, { nombre: 'Anuncios de prueba', url: 'https://example.com/carpeta' });
  assert.equal((await json('/api/planner/ads', { id: carrusel.id, action: 'add', revision: 0 })).status, 400, 'only videos');
  const added = await (await json('/api/planner/ads', { id: video.id, action: 'add', revision: 0 })).json();
  assert.equal(added.anuncios.seleccion[video.id].video, 'piezas/salio/final.mp4');
  assert.equal((await json('/api/planner/ads', { id: video.id, action: 'remove', revision: 0 })).status, 409, 'a stale tab does not overwrite the selection');

  const draft = await (await fetch(base + '/api/planner/draft')).json();
  const prop = await (await json('/api/planner/proposals', { revision: draft.revision })).json();
  assert.equal(prop.prompt.split('\n')[0], '[Anuncios] Subir 1 video a Anuncios de prueba');
  assert.match(prop.prompt, new RegExp(`engine/anuncios\\.py subir ${prop.id}`));
  const stored = JSON.parse(readFileSync(resolve(root, 'publicar/.planner', `proposal-${prop.id}.json`), 'utf8'));
  assert.deepEqual(stored.anuncios.videos.map(v => v.video), ['piezas/salio/final.mp4']);
});
