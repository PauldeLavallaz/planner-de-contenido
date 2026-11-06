// Sección Twitter: leer, editar, aprobar, ubicar en la semana, notas y marcas, sobre una carpeta de contenido temporal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = mkdtempSync(resolve(tmpdir(), 'planner-x-test-'));
const serverPath = fileURLToPath(new URL('../src/server.ts', import.meta.url));
const config = resolve(root, 'planner.config.json');
writeFileSync(config, JSON.stringify({ timezone: 'America/Argentina/Buenos_Aires', content: { root: './contenido' }, publish_root: 'publicar',
  channels: { x: { id: 'x-main', type: 'x', label: 'X Mi X', profile: 'mimarca', name: 'Mi X' } } }));
const inventory = resolve(root, 'fake_inventory.py');
writeFileSync(inventory, 'print(' + JSON.stringify(JSON.stringify({ items: [], timezone: 'America/Argentina/Buenos_Aires', config: {} })) + ')\n');
const xdir = resolve(root, 'contenido/publicar/x');
mkdirSync(resolve(xdir, 'borradores'), { recursive: true });
writeFileSync(resolve(xdir, 'borradores/20261101-viejo.json'), JSON.stringify({ creado: '2026-10-31T12:00:00Z', tipo: 'cita', cita: '222', estado: 'borrador',
  fuentes: [{ id: '222', autor: { handle: 'otra' } }], partes: [{ texto: 'comento' }] }));
const tw = (id, handle, texto) => ({ id, autor: { handle, nombre: handle }, texto, fecha: '2026-10-30T10:00:00Z', metricas: { likes: 10 }, media: [] });
writeFileSync(resolve(xdir, 'bookmarks.json'), JSON.stringify({ actualizado: '2026-11-01T12:00:00Z', items: [
  tw('111', 'creadora', 'nuevo modelo'), tw('222', 'otra', 'otra cosa'), tw('333', 'CREADORA', 'más'), tw('444', 'creadora', 'y otro'), tw('555', 'suelta', 'una'),
] }));
writeFileSync(resolve(xdir, 'temas.json'), JSON.stringify({ temas: [{ id: 'herramientas', nombre: 'Herramientas' }], asignados: { 111: 'herramientas' } }));
const draftFile = resolve(xdir, 'borradores/20261101-modelo.json');
writeFileSync(draftFile, JSON.stringify({ creado: '2026-11-01T12:00:00Z', tipo: 'post', tema: 'modelo', estado: 'borrador',
  fuentes: [{ id: '111', autor: { handle: 'creadora' } }], partes: [{ texto: 'uno', media: ['piezas/x.png'] }] }));
writeFileSync(resolve(xdir, 'cuentas.json'), JSON.stringify({ cuentas: [
  { handle: 'nadie', tipo: 'criterio', why: 'arte', origen: 'manual' }] }));

let child, base, errors = '';
const post = (path, body) => fetch(base + '/api/planner/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(body) });
const draft = () => JSON.parse(readFileSync(draftFile, 'utf8'));
const datos = async () => (await fetch(base + '/api/planner/x')).json();

test('x: leer, editar, aprobar, notas y marcas', async t => {
  child = spawn(process.execPath, [serverPath], { cwd: tmpdir(), env: { ...process.env, PLANNER_PORT: '0', PLANNER_CONFIG: config, PLANNER_INVENTORY: inventory }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.on('data', c => { errors += c; });
  base = await new Promise((ok, fail) => {
    const timer = setTimeout(() => fail(new Error('startup timeout: ' + errors)), 10000);
    let out = '';
    child.on('exit', code => { clearTimeout(timer); fail(new Error(`startup exit ${code}: ${errors}`)); });
    child.stdout.on('data', c => { out += c; const line = out.split('\n').find(l => l.includes('"event":"listening"')); if (line) { clearTimeout(timer); ok(JSON.parse(line).url); } });
  });
  t.after(async () => { if (child.exitCode === null) { const fin = once(child, 'exit'); child.kill('SIGTERM'); await fin; } rmSync(root, { recursive: true, force: true }); });

  let d = await datos();
  assert.equal(d.bookmarks.length, 5);
  assert.equal(d.bookmarks.find(b => b.id === '111').tema, 'herramientas');
  assert.deepEqual(d.temas, [{ id: 'herramientas', nombre: 'Herramientas' }]);
  assert.equal(d.borradores.length, 2);
  assert.equal(d.borradores[0].id, '20261101-modelo');
  // Sin cuenta.json, la cuenta conectada en Postiz.
  assert.deepEqual([d.cuenta.handle, d.cuenta.nombre, d.postiz], ['mimarca', 'Mi X', true]);
  assert.deepEqual(d.slots, ['10:00', '14:00', '19:00']);
  assert.equal(d.zona, 'America/Argentina/Buenos_Aires');
  // Un borrador «cita» viejo se lee como «sobre» y conserva a quién comenta.
  const viejo = d.borradores.find(b => b.id === '20261101-viejo');
  assert.equal(viejo.tipo, 'sobre');
  assert.equal(viejo.sobre, '222');
  // La base de cuentas más las que guardaste seguido, contando sin importar mayúsculas.
  assert.equal(d.cuentas.find(c => c.handle === 'creadora').bookmarks, 3);
  assert.equal(d.cuentas.find(c => c.handle === 'creadora').tipo, null);
  assert.equal(d.cuentas.find(c => c.handle === 'nadie').bookmarks, 0);
  assert.ok(!d.cuentas.some(c => c.handle === 'suelta'), 'una sola vez no alcanza para entrar');
  assert.ok(d.tipos.length > 0);
  writeFileSync(resolve(xdir, 'cuenta.json'), JSON.stringify({ handle: 'mimarca', nombre: 'Mi Marca', avatar: 'https://pbs.twimg.com/a.jpg', verificado: true }));
  d = await datos();
  assert.deepEqual([d.cuenta.nombre, d.cuenta.verificado], ['Mi Marca', true]);

  // Editar: dos partes lo vuelven hilo y la media de la primera se conserva.
  let r = await post('x/borrador', { id: '20261101-modelo', partes: [{ texto: 'uno editado' }, { texto: 'dos' }], editado: null });
  assert.equal(r.status, 200);
  const editado = (await r.json()).borrador.editado;
  assert.equal(draft().tipo, 'hilo');
  assert.deepEqual(draft().partes[0], { texto: 'uno editado', media: ['piezas/x.png'] });
  assert.equal(draft().historial[0].antes[0], 'uno');
  assert.equal(draft().editado_por, 'usuario');
  // Lo que escribió Claude Code queda guardado desde la primera edición, para aprender contra eso.
  assert.deepEqual(draft().texto_original, ['uno']);
  // Con una versión vieja no pisa.
  r = await post('x/borrador', { id: '20261101-modelo', partes: [{ texto: 'pisado' }], editado: null });
  assert.equal(r.status, 409);
  assert.equal(draft().partes[0].texto, 'uno editado');
  r = await post('x/borrador', { id: '20261101-modelo', partes: [{ texto: 'solo uno' }], editado });
  assert.equal(r.status, 200);
  assert.equal(draft().tipo, 'post');

  // Ids raros, estados que no existen y textos que no son texto se rechazan.
  assert.equal((await post('x/borrador', { id: '../fuera', partes: [{ texto: 'a' }] })).status, 400);
  assert.equal((await post('x/borrador', { id: '20261101-modelo', partes: [{ texto: 3 }] })).status, 400);
  assert.equal((await post('x/borrador/estado', { id: '20261101-modelo', estado: 'publicado' })).status, 400);

  // Sin aprobar no entra a la semana.
  assert.equal((await post('x/borrador/fecha', { id: '20261101-modelo', fecha: '2026-11-03T10:00' })).status, 409);
  assert.equal((await post('x/pedido', {})).status, 400, 'sin aprobados con horario no hay pedido');
  r = await post('x/borrador/estado', { id: '20261101-modelo', estado: 'aprobado' });
  assert.equal(r.status, 200);
  assert.equal(draft().estado, 'aprobado');
  assert.ok(draft().aprobado);
  r = await post('x/borrador/fecha', { id: '20261101-modelo', fecha: '2026-11-03T10:00' });
  assert.equal(r.status, 200);
  assert.equal(draft().fecha, '2026-11-03T10:00');
  assert.equal((await post('x/borrador/fecha', { id: '20261101-modelo', fecha: 'mañana' })).status, 400);
  // El pedido de la semana: título de conversación, la cuenta, los ids y el comando.
  r = await post('x/pedido', {});
  const pedido = (await r.json()).prompt;
  assert.match(pedido, /^\[Agenda\] Agendar un tweet del 3 nov\n\n/);
  assert.match(pedido, /@mimarca/);
  assert.match(pedido, /engine\/x\/agendar\.py 20261101-modelo/);
  assert.match(pedido, /2026-11-03 10:00 · 20261101-modelo · post · «solo uno»/);
  // Volver a revisar suelta el horario.
  await post('x/borrador/estado', { id: '20261101-modelo', estado: 'borrador' });
  assert.equal(draft().fecha, undefined);
  await post('x/borrador/estado', { id: '20261101-modelo', estado: 'aprobado' });

  // ¿Es tu tono? Se guarda por cuenta, sin tocar la base.
  r = await post('x/cuenta', { handle: 'nadie', voz: true });
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(readFileSync(resolve(xdir, 'estado.json'), 'utf8')).cuentas.nadie.voz, true);
  assert.equal((await datos()).cuentas.find(c => c.handle === 'nadie').voz, true);
  assert.equal((await post('x/cuenta', { handle: 'no vale', voz: true })).status, 400);

  // Lo agendado no se toca desde el planner: ni el estado ni el texto.
  writeFileSync(draftFile, JSON.stringify({ ...draft(), estado: 'agendado' }));
  assert.equal((await post('x/borrador/estado', { id: '20261101-modelo', estado: 'descartado' })).status, 409);
  assert.equal((await post('x/borrador', { id: '20261101-modelo', partes: [{ texto: 'cambio' }], editado: draft().editado })).status, 409);

  // Feedback escrito sobre un tweet: queda pendiente, se manda a Claude Code (pasa a enviado) y se puede borrar mientras no se aplicó.
  r = await post('x/feedback', { id: '20261101-viejo', text: 'más corto' });
  assert.equal(r.status, 200);
  const notas = (await r.json()).feedback;
  assert.equal(notas.length, 1);
  assert.equal(notas[0].estado, 'pendiente');
  assert.equal((await post('x/feedback', { id: '20261101-viejo', text: '' })).status, 400);
  assert.equal((await post('x/feedback', { id: 'no-existe', text: 'hola' })).status, 400);
  r = await post('x/feedback/copiar', {});
  assert.equal(r.status, 200);
  const fb = (await r.json()).prompt;
  assert.match(fb, /^\[Feedback\] Corregir [^\n]*\n\n/);
  assert.match(fb, /20261101-viejo/);
  assert.match(fb, /«más corto»/);
  assert.match(fb, /engine\/x\/aprender\.py pendientes/);
  assert.match(fb, /Ediciones a mano sin aprender: 20261101-modelo/);
  assert.equal((await datos()).borradores.find(b => b.id === '20261101-viejo').feedback[0].estado, 'enviado');
  r = await post('x/feedback/remove', { id: '20261101-viejo', file: notas[0].file });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).feedback.length, 0);
  assert.equal((await post('x/feedback/remove', { id: '20261101-viejo', file: '../x.json' })).status, 400);

  // Una nota grabada: el audio queda en la carpeta de X y se puede escuchar desde el planner.
  r = await post('x/feedback', { id: '20261101-viejo', audio: Buffer.alloc(4096, 3).toString('base64'), mime: 'audio/webm', audio_seconds: 3 });
  const conAudio = (await r.json()).feedback[0];
  assert.match(conAudio.audio, /^publicar\/x\/feedback\/20261101-viejo\/.+-planner\.webm$/);
  assert.equal((await fetch(base + '/api/planner/media?path=' + encodeURIComponent(conAudio.audio))).status, 200);
  await post('x/feedback/remove', { id: '20261101-viejo', file: conAudio.file });
  assert.ok(readdirSync(resolve(xdir, 'feedback/20261101-viejo/.borradas')).some(f => f.endsWith('.webm')), 'el audio también va a .borradas');

  // Marcas de los bookmarks.
  r = await post('x/bookmark', { id: '222', estado: 'descartado' });
  assert.equal(JSON.parse(readFileSync(resolve(xdir, 'estado.json'), 'utf8')).bookmarks['222'].estado, 'descartado');
  r = await post('x/bookmark', { id: '222', estado: null });
  assert.deepEqual((await r.json()).estado, {});
  assert.equal(JSON.parse(readFileSync(resolve(xdir, 'estado.json'), 'utf8')).cuentas.nadie.voz, true);
  assert.equal((await post('x/bookmark', { id: 'abc', estado: 'descartado' })).status, 400);
  assert.equal((await post('x/bookmark', { id: '333', estado: 'otra' })).status, 400);
  // Una nota sobre lo que querés decir de un tweet marcado, sin que exista un borrador con ese id.
  r = await post('x/feedback', { id: '333', text: 'decí que baja el costo' });
  const notaBk = (await r.json()).feedback[0];
  assert.equal((await datos()).bookmark_notas['333'][0].text, 'decí que baja el costo');
  r = await post('x/feedback/remove', { id: '333', file: notaBk.file });
  assert.deepEqual((await datos()).bookmark_notas, {});
  // Lo que trae una búsqueda se marca igual que un bookmark, y la más nueva viene primero.
  mkdirSync(resolve(xdir, 'busquedas'));
  writeFileSync(resolve(xdir, 'busquedas/vieja.json'), JSON.stringify({ consulta: 'vieja', creado: '2026-11-01T10:00:00Z', items: [{ id: '888', autor: { handle: 'a' }, texto: 'x' }] }));
  writeFileSync(resolve(xdir, 'busquedas/nueva.json'), JSON.stringify({ consulta: 'nueva', creado: '2026-11-02T10:00:00Z', items: [{ id: '999', autor: { handle: 'b' }, texto: 'y' }] }));
  writeFileSync(resolve(xdir, 'busquedas/vacia.json'), JSON.stringify({ consulta: 'vacía', creado: '2026-11-03T10:00:00Z', items: [] }));
  assert.deepEqual((await datos()).busquedas.map(b => b.id), ['nueva', 'vieja']);
  r = await post('x/bookmark', { id: '999', estado: 'interesa' });
  assert.equal((await r.json()).estado['999'].estado, 'interesa');
});

// La interfaz se arma sin errores con datos de verdad y sin datos (el estado vacío dice cómo empezar).
test('x: la interfaz se dibuja en cada pestaña', () => {
  const html = {}, el = id => (html[id] ||= { id, innerHTML: '', hidden: false });
  const ctx = vm.createContext({
    $: el, document: { addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, body: { classList: { add() {}, remove() {} } } },
    store: { get: (_k, v) => v, set() {} }, esc: s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]),
    skeleton: () => '<skel>', api: async () => ({}), post: b => b, toast() {}, ICON: { check: '✓', trash: 'T', stop: 'S', mic: 'M' }, clock: s => String(s),
    blobB64: async () => '', todayStr: () => '2026-11-04', dateAdd: (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10),
    monday: d => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); },
    nowLocal: () => '2026-11-04T12:00', LOCALE: 'es-AR', TZ: 'America/Argentina/Buenos_Aires', tituloMensaje: (e, d) => `[${e}] ${d}`,
    gvMenu() {}, gvMenuClose() {}, gv: {}, CSS: { escape: s => s }, performance: { now: () => 0 }, navigator: {}, requestAnimationFrame: f => f(), addEventListener() {},
  });
  vm.runInContext(readFileSync(new URL('../public/x.js', import.meta.url), 'utf8') + '\nthis.xs = xs; this.renderX = renderX;', ctx);
  const b = (id, extra) => ({ id, tipo: 'post', estado: 'borrador', partes: [{ texto: 'hola' }], feedback: [], fuentes: [], ...extra });
  const lleno = { cuenta: { handle: 'mimarca', nombre: 'Mi Marca' }, postiz: true, slots: ['10:00', '14:00'], zona: 'America/Argentina/Buenos_Aires', actualizado: '2026-11-01T00:00:00Z',
    bookmarks: [{ id: '1', autor: { handle: 'a' }, texto: 'uno', tema: 't1', metricas: {}, media: [] }], temas: [{ id: 't1', nombre: 'Tema' }], total_bookmarks: 1,
    estado: {}, bookmark_notas: {}, busquedas: [{ id: 'b', consulta: 'algo', creado: '2026-11-02T00:00:00Z', items: [{ id: '2', autor: { handle: 'b' }, texto: 'dos' }] }],
    borradores: [b('a'), b('c', { tipo: 'sobre', sobre: '1', fuentes: [{ id: '1', autor: { handle: 'a' } }] }), b('d', { estado: 'aprobado', fecha: '2026-11-05T10:00' }), b('e', { estado: 'aprobado' })],
    tipos: [{ id: 'voz', nombre: 'Tono' }], cuentas: [{ handle: 'a', tipo: 'voz', why: 'por', bookmarks: 1, voz: null }, { handle: 'z', tipo: null, why: '', bookmarks: 3 }] };
  for (const tab of ['borradores', 'semana', 'bookmarks', 'busquedas', 'cuentas']) {
    ctx.xs.data = lleno; ctx.xs.tab = tab; ctx.xs.semana = null; ctx.renderX();
    assert.ok(html.xBody.innerHTML.length > 200, tab);
  }
  ctx.xs.tab = 'semana'; ctx.renderX();
  assert.match(html.xBody.innerHTML, /data-xslot="2026-11-05T14:00"/, 'un horario libre de mañana');
  assert.doesNotMatch(html.xBody.innerHTML, /data-xslot="2026-11-04T10:00"/, 'lo que ya pasó no recibe tweets');
  assert.match(html.xBody.innerHTML, /Para agendar<\/b><span class="n">1/);
  ctx.xs.tab = 'cuentas'; ctx.xs.cuentaSel = 'a'; ctx.renderX();
  assert.match(html.xBody.innerHTML, /¿Querés tomar el tono de esta cuenta\?/);
  ctx.xs.data = { ...lleno, bookmarks: [], borradores: [], busquedas: [], cuentas: [], postiz: false }; ctx.renderX();
  assert.match(html.xBody.innerHTML, /configurá Twitter en el planner/);
  assert.match(html.xBody.innerHTML, /conectar X en Postiz/);
});
