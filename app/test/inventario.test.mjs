// Un inventario caído no vacía el calendario: se ve el último bueno, con el aviso, y no se puede proponer sobre él.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverPath = fileURLToPath(new URL('../src/server.ts', import.meta.url));
const pieza = { id: 'queue:buena', title: 'Buena', status: 'ready', approved: true, source: 'piezas/buena', fingerprint: 'v1', scheduled: null, networks: ['instagram'], channels: [], media: [], components: [], captions: {} };
const bueno = 'print(' + JSON.stringify(JSON.stringify({ generated_at: '2026-11-05T00:00:00-03:00', items: [pieza], avisos: [], timezone: 'America/Argentina/Buenos_Aires', config: {} })) + ')\n';
const roto = "import sys\nsys.stderr.write('Traceback\\nValueError: roto\\n')\nsys.exit(1)\n";

async function arrancar(t, env) {
  const child = spawn(process.execPath, [serverPath], { cwd: tmpdir(), env: { ...process.env, PLANNER_PORT: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const base = await new Promise((done, reject) => {
    const timer = setTimeout(() => reject(new Error('startup timeout: ' + errors)), 10000);
    let output = '';
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`startup exit ${code}: ${errors}`)); });
    child.stdout.on('data', chunk => {
      output += chunk;
      const line = output.split('\n').find(l => l.includes('"event":"listening"'));
      if (line) { clearTimeout(timer); done(JSON.parse(line).url); }
    });
  });
  const parar = async () => { if (child.exitCode !== null || child.signalCode !== null) return; const fin = once(child, 'exit'); child.kill('SIGTERM'); await fin; };
  t.after(parar);
  return { base, parar };
}

test('si el inventario falla, se ve el último bueno y lo avisa', async t => {
  const root = mkdtempSync(resolve(tmpdir(), 'planner-inventario-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(resolve(root, 'publicar/.planner'), { recursive: true });
  const config = resolve(root, 'planner.config.json'), inventario = resolve(root, 'inventario.py');
  writeFileSync(config, JSON.stringify({ timezone: 'America/Argentina/Buenos_Aires', content: { root: '.' }, publish_root: 'publicar', channels: { instagram: { id: 'ig' } } }));
  const env = { PLANNER_CONFIG: config, PLANNER_INVENTORY: inventario };

  // Sin un inventario bueno guardado, el error se ve como error.
  writeFileSync(inventario, roto);
  let s = await arrancar(t, env);
  assert.equal((await fetch(s.base + '/api/planner/data')).status, 502);
  await s.parar();

  writeFileSync(inventario, bueno);
  s = await arrancar(t, env);
  assert.equal((await (await fetch(s.base + '/api/planner/data')).json()).items[0].title, 'Buena');
  await s.parar();
  assert.ok(existsSync(resolve(root, 'publicar/.planner/inventario-ok.json')), 'the good one is kept on disk');

  // Reiniciado y con el inventario roto: el último bueno, con el aviso y el motivo.
  writeFileSync(inventario, roto);
  s = await arrancar(t, env);
  const data = await (await fetch(s.base + '/api/planner/data')).json();
  assert.equal(data.items[0].title, 'Buena');
  assert.equal(data.inventario_viejo.desde, '2026-11-05T00:00:00-03:00');
  assert.ok(data.inventario_viejo.motivo, 'it says why');
  const json = (path, method, body) => fetch(s.base + path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const draft = await (await fetch(s.base + '/api/planner/draft')).json();
  const when = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10) + 'T12:30';
  const saved = await (await json('/api/planner/draft', 'PUT', { revision: draft.revision, changes: { [pieza.id]: { when } } })).json();
  const prop = await json('/api/planner/proposals', 'POST', { revision: saved.revision });
  assert.ok(prop.status >= 500, `nothing is proposed over an old copy (${prop.status})`);
});
