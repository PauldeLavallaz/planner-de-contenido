// Historias: historial de versiones (ver y volver a una), colores de la secuencia para el editor y los títulos de los
// mensajes que arma la pestaña. Sobre una carpeta de contenido temporal, sin Postiz real ni el motor de Python.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = mkdtempSync(resolve(tmpdir(), 'planner-historias-versiones-'));
const serverPath = fileURLToPath(new URL('../src/server.ts', import.meta.url));
mkdirSync(resolve(root, 'publicar/.planner'), { recursive: true });
const config = resolve(root, 'planner.config.json');
writeFileSync(config, JSON.stringify({ timezone: 'America/Argentina/Buenos_Aires', content: { root: '.' }, publish_root: 'publicar', channels: { instagram: { id: 'ig', profile: 'micuenta' } } }));
process.env.PLANNER_CONFIG = config;
const { storyFeedbackPrompt, storyProposalTitle } = await import('../src/historias.ts');
const inventory = resolve(root, 'fake_inventory.py');
writeFileSync(inventory, 'print(' + JSON.stringify(JSON.stringify({ items: [], timezone: 'America/Argentina/Buenos_Aires', config: {} })) + ')\n');

// Una semana con un día de dos historias: la 2 tiene un acento y un color puesto a mano, que la 1 ve como sugeridos.
const D = '2026-11-10', run = resolve(root, 'historias/semana');
mkdirSync(resolve(run, 'historias'), { recursive: true }); mkdirSync(resolve(run, 'fuente'), { recursive: true });
const html = (extra = '', estilo = '') => `<!doctype html>\n<html><head><style>main.historia { --acento: ${estilo || '#ffd60a'}; }</style></head><body><main class="historia" data-duracion="7"><p class="caja"${extra}>Hola</p></main></body></html>\n`;
writeFileSync(resolve(run, `fuente/${D}_1_venta.html`), html());
writeFileSync(resolve(run, `fuente/${D}_2_venta.html`), html(' style="color: #38F078"', '#ff1f78'));
writeFileSync(resolve(run, `historias/${D}_1_venta.png`), Buffer.alloc(256, 1));
writeFileSync(resolve(run, `historias/${D}_2_venta.png`), Buffer.alloc(256, 2));
writeFileSync(resolve(run, 'semana.json'), JSON.stringify({ semana: '2026-11-09', dias: [{ fecha: D, tipo: 'venta', formula: 'V1', historias: [{ imagen: `historias/${D}_1_venta.png`, texto: 'Hola' }, { imagen: `historias/${D}_2_venta.png`, texto: 'Hola' }] }] }));
const stem = `${D}_1_venta`, img = `historias/semana/historias/${stem}.png`;
// Dos versiones guardadas: una distinta (con su HTML) y una copia igual a la actual, que no cuenta.
const ver = (id, byte) => { const d = resolve(run, 'tmp/ediciones', id); mkdirSync(d, { recursive: true }); writeFileSync(resolve(d, stem + '.png'), Buffer.alloc(256, byte)); return d; };
writeFileSync(resolve(ver('20261105101500-' + stem, 7), stem + '.html'), html('', '#123456'));
ver('20261105120000-' + stem, 1);

let child, base, errors = '';
test.before(async () => {
  child = spawn(process.execPath, [serverPath], { cwd: tmpdir(), env: { ...process.env, PLANNER_PORT: '0', PLANNER_CONFIG: config, PLANNER_INVENTORY: inventory }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.on('data', chunk => { errors += chunk; });
  base = await new Promise((ok, fail) => {
    const timer = setTimeout(() => fail(new Error('startup timeout: ' + errors)), 10000);
    let out = '';
    child.on('exit', code => { clearTimeout(timer); fail(new Error(`startup exit ${code}: ${errors}`)); });
    child.stdout.on('data', chunk => { out += chunk; const line = out.split('\n').find(l => l.includes('"event":"listening"')); if (line) { clearTimeout(timer); ok(JSON.parse(line).url); } });
  });
});
test.after(async () => { if (child && child.exitCode === null) { child.kill(); await once(child, 'exit'); } rmSync(root, { recursive: true, force: true }); });
const get = async p => { const r = await fetch(base + '/api/planner/' + p, { headers: { Origin: base } }); return { status: r.status, body: await r.json() }; };
const post = async (p, body) => { const r = await fetch(base + '/api/planner/' + p, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };

test('lista las versiones distintas de la actual, de la más nueva a la más vieja', async () => {
  const r = await get('stories/versions?imagen=' + encodeURIComponent(img));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.versiones.map(v => v.id), ['20261105101500-' + stem]);
  assert.equal(r.body.versiones[0].imagen, `historias/semana/tmp/ediciones/20261105101500-${stem}/${stem}.png`);
  assert.equal(r.body.versiones[0].at, '2026-11-05T10:15:00Z');
  assert.equal(r.body.versiones[0].editable, true);
  assert.equal((await get('stories/versions?imagen=' + encodeURIComponent('../afuera.png'))).status, 400);
});

test('volver a una versión guarda la actual y marca la historia editada', async () => {
  for (const id of ['../x', '.oculta', 'no-existe']) assert.equal((await post('stories/versions/restore', { imagen: img, id })).status, 400, id);
  const r = await post('stories/versions/restore', { imagen: img, id: '20261105101500-' + stem });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(readFileSync(resolve(run, `historias/${stem}.png`)), Buffer.alloc(256, 7));
  assert.match(readFileSync(resolve(run, `fuente/${stem}.html`), 'utf8'), /#123456/);
  // La que estaba quedó como una versión más, y el historial la muestra.
  const nuevas = readdirSync(resolve(run, 'tmp/ediciones')).filter(n => !['20261105101500-' + stem, '20261105120000-' + stem].includes(n));
  assert.equal(nuevas.length, 1);
  assert.deepEqual(readFileSync(resolve(run, 'tmp/ediciones', nuevas[0], stem + '.png')), Buffer.alloc(256, 1));
  assert.match(readFileSync(resolve(run, 'tmp/ediciones', nuevas[0], stem + '.html'), 'utf8'), /#ffd60a/);
  // El historial muestra una sola vez la que estaba (había una copia igual) y no la restaurada, que es la actual.
  assert.equal(r.body.versiones.length, 1);
  assert.deepEqual(readFileSync(resolve(root, r.body.versiones[0].imagen)), Buffer.alloc(256, 1));
  const h = JSON.parse(readFileSync(resolve(run, 'semana.json'), 'utf8')).dias[0].historias[0];
  assert.ok(h.editado?.at);
  assert.equal(h.version.id, '20261105101500-' + stem);
});

test('el editor sugiere los colores de las otras historias del día', async () => {
  const r = await get('stories/source?imagen=' + encodeURIComponent(`historias/semana/historias/${D}_2_venta.png`));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const s1 = await get('stories/source?imagen=' + encodeURIComponent(img));
  assert.deepEqual(s1.body.colores_secuencia, ['#ff1f78', '#38f078']);
  // La 2 ve el acento de la 1 (ahora la versión restaurada), no los suyos.
  assert.deepEqual(r.body.colores_secuencia, ['#123456']);
});

test('los mensajes de historias arrancan con un título que dice lo que hacen', () => {
  const a = (accion, fecha, extra = {}) => ({ accion, fecha, cuenta: 'micuenta', ...extra });
  const t = storyProposalTitle;
  assert.equal(t([a('agendar', '2026-11-06'), a('agendar', '2026-11-08')], []), '[Agenda] Programar 2 historias del 6 al 8 nov en micuenta');
  assert.equal(t([a('mover', '2026-11-07')], []), '[Agenda] Cambio de horario de 1 historia del 7 nov en micuenta');
  assert.equal(t([a('reemplazar', '2026-11-07')], []), '[Agenda] Cambiar la imagen de 1 historia');
  assert.equal(t([a('quitar', '2026-11-07'), a('quitar', '2026-11-08')], []), '[Agenda] Sacar 2 historias de la agenda');
  assert.equal(t([a('descartar', '2026-11-07')], []), '[Agenda] Descartar 1 historia');
  assert.equal(t([a('agendar', '2026-11-06'), a('agendar', '2026-11-06', { cuenta: 'otracuenta' })], []), '[Agenda] Programar 2 historias del 6 nov');
  assert.equal(t([a('mover', '2026-11-07', { sin_cambios: true })], []), '[Agenda] Confirmar 1 historia ya agendadas');
  const dia = { fecha: '2026-11-06', tema: 'Cómo pedir bien' };
  assert.equal(t([], [{ d: dia, notas: [{ alcance: 'historia', imagen: 'a.png' }] }]), '[Feedback] Corregir una historia del 6 nov: «Cómo pedir bien»');
  assert.equal(t([], [{ d: dia, notas: [{ alcance: 'secuencia' }] }, { d: { fecha: '2026-11-07' }, notas: [{ alcance: 'secuencia' }] }]), '[Feedback] Corregir historias de 2 días');
  assert.equal(t([a('agendar', '2026-11-06')], [{ d: dia, notas: [] }]), '[Agenda] Programar 1 historia del 6 nov en micuenta y corregir feedback');
  const fb = storyFeedbackPrompt('historias/semana', dia, [{ alcance: 'secuencia', created_at: '2026-11-05T12:00:00Z', text: 'Otro tema', file: 'a-planner.json' }]);
  assert.match(fb, /^\[Feedback\] Rehacer las historias del 6 nov: «Cómo pedir bien»\n\nFeedback desde el planner/);
});
