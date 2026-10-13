import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Carpeta de contenido, config e inventario de prueba: sin Postiz real ni el motor de Python.
const root = mkdtempSync(resolve(tmpdir(), 'planner-test-'));
const serverPath = fileURLToPath(new URL('../src/server.ts', import.meta.url));
const state = resolve(root, 'publicar/.planner');
mkdirSync(state, { recursive: true });
mkdirSync(resolve(root, 'piezas/test'), { recursive: true });
writeFileSync(resolve(root, 'piezas/test/final.mp4'), Buffer.alloc(1024 * 1024, 7));
writeFileSync(resolve(root, '.env'), 'PRIVATE=never-serve-this');
mkdirSync(resolve(root, '.git'), { recursive: true });
writeFileSync(resolve(root, '.git/hidden.mp4'), Buffer.alloc(64, 1));
const config = resolve(root, 'planner.config.json');
writeFileSync(config, JSON.stringify({ timezone: 'America/Argentina/Buenos_Aires', content: { root: '.' }, publish_root: 'publicar', channels: { instagram: { id: 'ig' } } }));
const item = { id: 'queue:test', title: 'Final de prueba', status: 'ready', approved: true, source: 'piezas/test', primary: { path: 'piezas/test/final.mp4', kind: 'video' }, fingerprint: 'v1', scheduled: null, networks: ['instagram'], channels: [] };
const inventory = resolve(root, 'fake_inventory.py');
writeFileSync(inventory, 'print(' + JSON.stringify(JSON.stringify({ items: [item], timezone: 'America/Argentina/Buenos_Aires', config: {} })) + ')\n');
writeFileSync(resolve(state, 'draft.json'), JSON.stringify({ revision: 7, changes: {} }));
let child, base, errors = '';
async function start() {
  child = spawn(process.execPath, [serverPath], { cwd: tmpdir(), env: { ...process.env, PLANNER_PORT: '0', PLANNER_CONFIG: config, PLANNER_INVENTORY: inventory }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.on('data', chunk => { errors += chunk; });
  base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('startup timeout: ' + errors)), 10000);
    let output = '';
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`startup exit ${code}: ${errors}`)); });
    child.stdout.on('data', chunk => {
      output += chunk;
      const line = output.split('\n').find(line => line.includes('"event":"listening"'));
      if (line) { clearTimeout(timer); resolve(JSON.parse(line).url); }
    });
  });
}
async function stop(signal = 'SIGTERM') {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill(signal);
  await exited;
}
function request(path, method, body, origin = base) {
  return fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });
}

test('standalone HTTP, media cancellation and durable draft across process exit', { timeout: 30000 }, async t => {
  try {
    await start();
    await t.test('loads the complete app and inventory without dashboard', async () => {
      assert.equal((await (await fetch(base + '/api/health')).json()).service, 'publication-planner');
      assert.match(await (await fetch(base + '/')).text(), /planner.js/);
      assert.equal((await fetch(base + '/planner.css')).status, 200);
      assert.equal((await (await fetch(base + '/api/planner/data')).json()).items[0].id, item.id);
      assert.equal((await request('/api/planner/refresh', 'POST', {})).status, 200);
    });
    await t.test('only exposes public app files and approved media paths', async () => {
      for (const path of ['/.env', '/package.json', '/api/runs', '/api/planner/media?path=.env', '/api/planner/media?path=piezas%2F..%2F.env', '/api/planner/media?path=.git%2Fhidden.mp4', '/api/planner/media?path=..%2F..%2Fetc%2Fhosts']) assert.equal((await fetch(base + path)).status, 404);
      assert.equal((await request('/api/planner/draft', 'PUT', { revision: 7, changes: {} }, 'https://other.invalid')).status, 403);
    });
    await t.test('range playback and canceled streams leave the server alive', async () => {
      const path = '/api/planner/media?path=piezas%2Ftest%2Ffinal.mp4';
      const part = await fetch(base + path, { headers: { Range: 'bytes=10-19' } });
      assert.equal(part.status, 206);
      assert.equal(part.headers.get('content-range'), 'bytes 10-19/1048576');
      assert.equal((await part.arrayBuffer()).byteLength, 10);
      assert.equal((await fetch(base + path, { headers: { Range: 'bytes=2000000-' } })).status, 416);
      for (let i = 0; i < 8; i++) {
        const response = await fetch(base + path);
        await response.body.cancel();
      }
      assert.equal((await fetch(base + '/api/health')).status, 200);
    });
    await t.test('save, stale revision protection and proposal work with original state schema', async () => {
      const changes = { [item.id]: { when: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10) + 'T12:30', primary: item.primary, fingerprint: 'v1' } };
      const saved = await request('/api/planner/draft', 'PUT', { revision: 7, changes });
      assert.equal(saved.status, 200);
      assert.equal((await saved.json()).revision, 8);
      assert.equal((await request('/api/planner/draft', 'PUT', { revision: 7, changes: {} })).status, 409);
      const proposalResponse = await request('/api/planner/proposals', 'POST', { revision: 8 });
      assert.equal(proposalResponse.status, 200);
      const proposal = await proposalResponse.json();
      const stored = JSON.parse(readFileSync(resolve(state, `proposal-${proposal.id}.json`)));
      assert.equal(stored.status, 'awaiting_chat_confirmation');
      assert.equal(stored.changes[0].requested_action, 'schedule');
    });
    await t.test('feedback keeps text and audio on disk and builds the Claude Code message', async () => {
      assert.equal((await request('/api/planner/feedback', 'POST', { id: item.id, text: '' })).status, 400);
      const audio = Buffer.alloc(4096, 3).toString('base64');
      const saved = await (await request('/api/planner/feedback', 'POST', { id: item.id, text: 'Alargá el plano del segundo 16', audio, mime: 'audio/webm;codecs=opus', audio_seconds: 4.2, video_time: 16 })).json();
      assert.equal(saved.entries.length, 1);
      const entry = saved.entries[0];
      assert.equal(entry.estado, 'pendiente');
      assert.equal(readFileSync(resolve(root, entry.audio)).length, 4096);
      assert.ok(entry.audio.startsWith('piezas/test/feedback/'));
      assert.match(saved.prompt, /Alargá el plano del segundo 16/);
      assert.match(saved.prompt, /en el 0:16 del video/);
      assert.ok(saved.prompt.includes(entry.audio));
      assert.equal((await fetch(base + '/api/planner/media?path=' + encodeURIComponent(entry.audio))).status, 200);
      const listed = await (await fetch(base + '/api/planner/feedback?id=' + encodeURIComponent(item.id))).json();
      assert.equal(listed.entries[0].file, entry.file);
      assert.equal((await (await fetch(base + '/api/planner/data')).json()).items[0].feedback_pending, 1);
      const draftNow = await (await fetch(base + '/api/planner/draft')).json();
      const prop = await (await request('/api/planner/proposals', 'POST', { revision: draftNow.revision })).json();
      assert.match(prop.prompt, /Contenido: aplicá el feedback/);
      assert.match(prop.prompt, /skills\/publicar\/SKILL\.md/);
      const storedProp = JSON.parse(readFileSync(resolve(state, `proposal-${prop.id}.json`)));
      assert.equal(storedProp.feedback[0].notes[0].text, 'Alargá el plano del segundo 16');
      assert.equal(JSON.parse(readFileSync(resolve(root, saved.dir, entry.file))).estado, 'enviado');
      assert.equal((await (await fetch(base + '/api/planner/data')).json()).items[0].feedback_pending, undefined);
      const again = await (await request('/api/planner/feedback', 'POST', { id: item.id, text: 'Otra nota' })).json();
      const sent = await (await request('/api/planner/feedback/sent', 'POST', { id: item.id })).json();
      assert.ok(sent.entries.every(e => e.estado === 'enviado'));
      await request('/api/planner/feedback/remove', 'POST', { id: item.id, file: again.entries.find(e => e.text === 'Otra nota').file });
      const removed = await (await request('/api/planner/feedback/remove', 'POST', { id: item.id, file: entry.file })).json();
      assert.equal(removed.entries.length, 0);
      assert.equal(removed.prompt, null);
      assert.equal((await request('/api/planner/feedback/remove', 'POST', { id: item.id, file: '../draft.json' })).status, 400);
    });
    await t.test('saved draft survives abrupt exit and restart', async () => {
      const before = await (await fetch(base + '/api/planner/draft')).json();
      await stop('SIGKILL');
      await start();
      assert.deepEqual(await (await fetch(base + '/api/planner/draft')).json(), before);
      assert.equal((await fetch(base + '/api/planner/data')).status, 200);
    });
  } finally {
    await stop();
    rmSync(root, { recursive: true, force: true });
  }
});
