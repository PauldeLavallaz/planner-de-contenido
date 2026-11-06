// Sección LinkedIn: prospectos, videos a medida, posts con feedback y programar, y referencias, sobre una carpeta temporal.
// Los datos son inventados; programar usa un agendar.py de mentira (PLANNER_ENGINE) que no toca Postiz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = mkdtempSync(resolve(tmpdir(), 'planner-linkedin-test-'));
const serverPath = fileURLToPath(new URL('../src/server.ts', import.meta.url));
const config = resolve(root, 'planner.config.json');
writeFileSync(config, JSON.stringify({ timezone: 'America/Argentina/Buenos_Aires', content: { root: '.' }, publish_root: 'publicar',
  channels: { linkedin: { id: 'li-main', type: 'linkedin' } }, linkedin: { cuenta: { nombre: 'Persona de Prueba', titular: 'Hace contenido', pagina: 'Empresa de Prueba' }, video: { costo_usd: 2.5 } } }));
const inventory = resolve(root, 'fake_inventory.py');
writeFileSync(inventory, 'print(' + JSON.stringify(JSON.stringify({ items: [], timezone: 'America/Argentina/Buenos_Aires', config: {} })) + ')\n');
mkdirSync(resolve(root, 'publicar/.planner'), { recursive: true });
const dir = resolve(root, 'publicar/linkedin');
mkdirSync(resolve(dir, 'borradores'), { recursive: true });
writeFileSync(resolve(dir, 'prospectos.json'), JSON.stringify({ actualizado: '2026-11-01T21:00', ventana_dias: 7, paises: ['ar', 'cl'], avisos_leidos: 40,
  prospectos: [
    { id: 'viviendas-del-sur', empresa: 'Viviendas del Sur', pais: 'ar', nivel: 'A', puntaje: 9, detectado: '2026-11-01', avisos: [{ puesto: 'Community Manager', link: 'https://example.com/aviso/1' }] },
    { id: 'ferreteria-centro', empresa: 'Ferretería Centro', pais: 'ar', nivel: 'B', puntaje: 7, detectado: '2026-11-01', avisos: [] },
    { id: '../malo', empresa: 'Id inválido' },
  ],
  descartes: [{ empresa: 'Agencia Ejemplo', motivo: 'agencia, RRHH u organismo público' }] }));
const draftFile = resolve(dir, 'borradores/20261103-el-sabado.json');
writeFileSync(draftFile, JSON.stringify({ creado: '2026-11-01T22:00:00Z', fecha: '2026-11-03', tipo_gancho: 'historia', estado: 'borrador', texto: 'Un sábado a la noche…' }));
writeFileSync(resolve(dir, 'borradores/20261104-otro.json'), JSON.stringify({ creado: '2026-11-01T22:00:00Z', fecha: '2026-11-04', estado: 'borrador', texto: 'Otro' }));
writeFileSync(resolve(dir, 'referencias.json'), JSON.stringify({ actualizado: '2026-11-01', fuente: 'research/informe.md', posts: [{ id: '1', autor: 'Autora de Ejemplo', idioma: 'en', reacciones: 2300 }] }));
// El motor de mentira: programa el borrador si la hora no choca.
const engine = resolve(root, 'engine');
mkdirSync(resolve(engine, 'linkedin'), { recursive: true });
const otroFile = resolve(dir, 'borradores/20261104-otro.json');
writeFileSync(resolve(engine, 'linkedin/agendar.py'), `import json, sys\nf = ${JSON.stringify(otroFile)}\nb = json.load(open(f))\nif sys.argv[3] == '2030-01-07T15:00':\n    sys.exit('Ya hay otra publicación en LinkedIn a las 14:30: dejá 2 horas entre las dos.')\nb.update(estado='agendado', programado=sys.argv[3], cola_slug='linkedin-20261104-otro')\njson.dump(b, open(f, 'w'))\n`);

let child, base, errors = '';
const post = (path, body) => fetch(base + '/api/planner/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(body) });
const leer = () => fetch(base + '/api/planner/linkedin').then(r => r.json());

test('linkedin: prospectos, videos, posts y referencias', async () => {
  child = spawn(process.execPath, [serverPath], { cwd: tmpdir(), env: { ...process.env, PLANNER_PORT: '0', PLANNER_CONFIG: config, PLANNER_INVENTORY: inventory, PLANNER_ENGINE: engine }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.on('data', c => { errors += c; });
  base = await new Promise((ok, fail) => {
    const timer = setTimeout(() => fail(new Error('startup timeout: ' + errors)), 10000);
    let out = '';
    child.stdout.on('data', c => { out += c; const line = out.split('\n').find(l => l.includes('"event":"listening"')); if (line) { clearTimeout(timer); ok(JSON.parse(line).url); } });
  });
  try {
    let d = await leer();
    assert.equal(d.prospectos.length, 2, 'an invalid id never reaches the planner');
    assert.equal(d.prospectos[0].estado, 'nuevo');
    assert.equal(d.radar.descartes.length, 1);
    assert.equal(d.borradores[0].id, '20261103-el-sabado'); // ordenados por el día propuesto
    assert.equal(d.referencias.posts[0].autor, 'Autora de Ejemplo');
    assert.equal(d.referencias.fuente, 'research/informe.md');
    assert.equal(d.cuenta.nombre, 'Persona de Prueba');
    assert.equal(d.cuenta.pagina, 'Empresa de Prueba');
    assert.equal(d.video.costo_usd, 2.5);

    // Los contactos para video viven en su propio archivo, aparecen primero y usan el mismo embudo.
    writeFileSync(resolve(dir, 'contactos.json'), JSON.stringify({ contactos: [{ id: 'contacto-ana', empresa: 'Inmobiliaria Ejemplo', nivel: 'A', puntaje: 9, autor: { nombre: 'Ana Ejemplo' }, ideas: [{ titulo: 'Una idea' }] }] }));
    d = await leer();
    assert.equal(d.prospectos.length, 3);
    assert.equal(d.prospectos[0].id, 'contacto-ana');
    assert.equal(d.prospectos[0].senal, 'contacto');
    assert.equal((await post('linkedin/prospecto', { id: 'contacto-ana', estado: 'para_contactar' })).status, 200);
    assert.equal((await leer()).prospectos[0].estado, 'para_contactar');

    // El recorrido del video: pedir → producir → revisar → cambios → aprobar. Lo que ya tiene video no se vuelve a pedir.
    let r = await post('linkedin/video/pedir', { ids: ['contacto-ana', 'no-existe'] });
    assert.deepEqual(await r.json(), { pedidos: ['contacto-ana'], salteados: ['no-existe'] });
    assert.equal((await leer()).prospectos[0].video.estado, 'pedido');
    assert.deepEqual((await (await post('linkedin/video/pedir', { ids: ['contacto-ana'] })).json()).pedidos, []);
    assert.equal((await post('linkedin/video/feedback', { id: 'contacto-ana', texto: 'otro color' })).status, 404);
    assert.equal((await post('linkedin/video/progreso', { id: 'contacto-ana', archivo: '../secreto.mp4' })).status, 400);
    assert.equal((await post('linkedin/video/progreso', { id: 'contacto-ana', archivo: '/etc/passwd' })).status, 400);
    await post('linkedin/video/progreso', { id: 'contacto-ana', estado: 'listo', archivo: 'videos/ana/final.mp4', guion: 'Hola' });
    assert.equal((await leer()).prospectos[0].video.estado, 'listo');
    assert.equal((await post('linkedin/video/feedback', { id: 'contacto-ana', texto: '  ' })).status, 400);
    assert.equal((await post('linkedin/video/feedback', { id: 'contacto-ana', texto: 'otro color' })).status, 200);
    let v = (await leer()).prospectos[0].video;
    assert.equal(v.estado, 'corrigiendo');
    assert.equal(v.notas[0].aplicada, false);
    assert.equal((await post('linkedin/video/feedback', { id: 'contacto-ana', texto: 'y otro' })).status, 409);
    await post('linkedin/video/progreso', { id: 'contacto-ana', estado: 'listo', archivo: 'videos/ana/final.mp4' });
    v = (await leer()).prospectos[0].video;
    assert.equal(v.version, 2);
    assert.equal(v.notas[0].aplicada, true);
    await post('linkedin/video/aprobar', { id: 'contacto-ana' });
    assert.equal((await leer()).prospectos[0].video.estado, 'aprobado');
    await post('linkedin/video/aprobar', { id: 'contacto-ana', aprobado: false });
    assert.equal((await leer()).prospectos[0].video.estado, 'listo');
    rmSync(resolve(dir, 'contactos.json'));

    // Un prospecto de la búsqueda sigue el mismo recorrido de video, con su mensaje propio.
    assert.equal((await post('linkedin/prospecto', { id: 'viviendas-del-sur', estado: 'para_contactar' })).status, 200);
    assert.deepEqual((await (await post('linkedin/video/pedir', { ids: ['viviendas-del-sur'] })).json()).pedidos, ['viviendas-del-sur']);
    await post('linkedin/video/progreso', { id: 'viviendas-del-sur', estado: 'listo', archivo: 'videos/vds/final.mp4', mensaje: 'Buenas!' });
    assert.equal((await leer()).prospectos.find(x => x.id === 'viviendas-del-sur').video.mensaje, 'Buenas!');
    await post('linkedin/prospecto', { id: 'viviendas-del-sur', estado: 'contactado', nota: 'mensaje mandado' });
    const p = (await leer()).prospectos.find(x => x.id === 'viviendas-del-sur');
    assert.equal(p.estado, 'contactado');
    assert.equal(p.decision.nota, 'mensaje mandado');
    assert.deepEqual(p.decision.historial.map(h => h.estado), ['para_contactar', 'contactado']);
    await post('linkedin/prospecto', { id: 'ferreteria-centro', estado: 'descartado' });
    await post('linkedin/prospecto', { id: 'ferreteria-centro', estado: 'nuevo' });
    assert.equal((await leer()).prospectos.find(x => x.id === 'ferreteria-centro').estado, 'nuevo');
    assert.equal((await post('linkedin/prospecto', { id: 'viviendas-del-sur', estado: 'vendido' })).status, 400);
    assert.equal((await post('linkedin/prospecto', { id: '../x', estado: 'nuevo' })).status, 400);

    // Editar el post; si cambió en disco desde que se abrió, no se pisa.
    r = await post('linkedin/borrador', { id: '20261103-el-sabado', texto: 'Texto nuevo\r\ncon salto', editado: null });
    assert.equal(r.status, 200);
    const b = JSON.parse(readFileSync(draftFile, 'utf8'));
    assert.equal(b.texto, 'Texto nuevo\ncon salto');
    assert.equal(b.editado_por, 'usuario');
    assert.equal(b.historial[0].antes, 'Un sábado a la noche…');
    assert.equal((await post('linkedin/borrador', { id: '20261103-el-sabado', texto: 'pisa', editado: null })).status, 409);
    assert.equal((await post('linkedin/borrador', { id: '20261103-el-sabado', texto: 'x'.repeat(3001), editado: b.editado })).status, 400);

    // Feedback de un post, escrito o grabado: queda pendiente, se copia para Claude Code y se borra sin perderse.
    assert.equal((await post('linkedin/borrador/feedback', { id: 'no-existe', text: 'hola' })).status, 400);
    assert.equal((await post('linkedin/borrador/feedback', { id: '20261103-el-sabado', text: '  ' })).status, 400);
    r = await post('linkedin/borrador/feedback', { id: '20261103-el-sabado', text: 'la imagen más oscura' });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).feedback[0].estado, 'pendiente');
    const audio = Buffer.alloc(400, 7).toString('base64');
    r = await post('linkedin/borrador/feedback', { id: '20261103-el-sabado', text: '', audio, mime: 'audio/webm', audio_seconds: 4.2 });
    assert.equal(r.status, 200);
    const notas = (await r.json()).feedback;
    assert.equal(notas.length, 2);
    const conAudio = notas.find(n => n.audio);
    assert.match(conAudio.audio, /^publicar\/linkedin\/feedback\/20261103-el-sabado\/.+-planner\.webm$/);
    assert.equal((await fetch(base + '/api/planner/media?path=' + encodeURIComponent(conAudio.audio))).status, 200, 'the planner can play it back');
    assert.equal((await post('linkedin/borrador/feedback', { id: '20261103-el-sabado', text: '', audio, mime: 'video/x-evil' })).status, 400);
    r = await post('linkedin/borrador/feedback/copiar', {});
    const pedido = (await r.json()).prompt;
    assert.match(pedido, /^\[Feedback\] Corregir [^\n]+LinkedIn[^\n]*\n\n/);
    assert.match(pedido, /engine\/linkedin\/posts\.py pendientes/);
    assert.match(pedido, /la imagen más oscura/);
    assert.match(pedido, /Ediciones a mano sin aprender: 20261103-el-sabado/);
    assert.equal((await leer()).borradores[0].feedback[0].estado, 'enviado');
    r = await post('linkedin/borrador/feedback/remove', { id: '20261103-el-sabado', file: conAudio.file });
    assert.equal((await r.json()).feedback.length, 1);
    assert.ok(existsSync(resolve(dir, 'feedback/20261103-el-sabado/.borradas', conAudio.file)), 'a removed note is kept aside');
    assert.equal((await post('linkedin/borrador/feedback/remove', { id: '20261103-el-sabado', file: '../../x-planner.json' })).status, 400);

    // Aprobar no agenda: sólo marca el estado. Lo que ya está en Postiz no se mueve desde acá.
    assert.equal((await post('linkedin/borrador/estado', { id: '20261103-el-sabado', estado: 'aprobado' })).status, 200);
    assert.equal(JSON.parse(readFileSync(draftFile, 'utf8')).estado, 'aprobado');
    writeFileSync(draftFile, JSON.stringify({ ...JSON.parse(readFileSync(draftFile, 'utf8')), estado: 'agendado' }));
    assert.equal((await post('linkedin/borrador/estado', { id: '20261103-el-sabado', estado: 'descartado' })).status, 409);
    assert.equal((await post('linkedin/borrador/estado', { id: '20261103-el-sabado', estado: 'agendado' })).status, 400);
    assert.equal((await post('linkedin/borrador', { id: '20261103-el-sabado', texto: 'cambio', editado: JSON.parse(readFileSync(draftFile, 'utf8')).editado })).status, 409, 'a scheduled post is not edited from here');

    // Programar: sólo aprobado y con imagen; el motor de mentira dice si choca.
    assert.equal((await post('linkedin/borrador/programar', { id: '20261104-otro', cuando: '2030-01-07T14:00' })).status, 409);
    assert.equal((await post('linkedin/borrador/estado', { id: '20261104-otro', estado: 'aprobado' })).status, 200);
    assert.equal((await post('linkedin/borrador/programar', { id: '20261104-otro', cuando: '2030-01-07T14:00' })).status, 409, 'without an image');
    writeFileSync(otroFile, JSON.stringify({ ...JSON.parse(readFileSync(otroFile, 'utf8')), imagen: 'publicar/linkedin/imagenes/otro.png' }));
    assert.equal((await post('linkedin/borrador/programar', { id: '20261104-otro', cuando: 'mañana' })).status, 400);
    r = await post('linkedin/borrador/programar', { id: '20261104-otro', cuando: '2030-01-07T15:00' });
    assert.equal(r.status, 409);
    assert.match((await r.json()).error, /2 horas/);
    r = await post('linkedin/borrador/programar', { id: '20261104-otro', cuando: '2030-01-07T14:00' });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).borrador.estado, 'agendado');
    assert.equal((await post('linkedin/borrador/programar', { id: '20261104-otro', cuando: '2030-01-07T14:00' })).status, 409);
  } finally {
    child?.kill();
    rmSync(root, { recursive: true, force: true });
  }
});

// La interfaz: lo que arma linkedin.js con los datos de la API, sin navegador.
test('linkedin: la interfaz cuenta lo pendiente y muestra el costo sólo si está configurado', async () => {
  const vm = await import('node:vm');
  const src = readFileSync(new URL('../public/linkedin.js', import.meta.url), 'utf8');
  const elementos = {};
  const el = id => elementos[id] || (elementos[id] = { innerHTML: '', textContent: '', disabled: false, hidden: false, addEventListener() {}, querySelectorAll: () => [], querySelector: () => null });
  const ctx = vm.createContext({ store: { get: (_k, d) => d, set() {} }, $: el, document: { addEventListener() {}, querySelectorAll: () => [], querySelector: () => null }, esc: s => String(s ?? ''),
    skeleton: () => '', todayStr: () => '2026-11-05', monday: d => d, dateAdd: d => d, data: { items: [] }, ICON: { trash: '', mic: '', stop: '', check: '' }, clock: () => '', tituloMensaje: (e, d) => `[${e}] ${d}` });
  vm.runInContext(src + '\nthis.t = { liPartir, liPendientes, liContador, lvCosto, lvPaso, lis };', ctx);
  const { t } = ctx;
  t.lis.data = t.liPartir({ prospectos: [{ id: 'a', senal: 'contacto', estado: 'para_contactar' }, { id: 'b', estado: 'nuevo' }], borradores: [{ id: 'p', estado: 'aprobado', feedback: [{ estado: 'pendiente' }] }], video: { costo_usd: null } });
  assert.equal(t.liPendientes().total, 3, 'a contact without video, an approved post and a pending note');
  t.liContador();
  assert.equal(el('changeCount').textContent, 3);
  assert.equal(t.lvCosto(2), '', 'no amount without linkedin.video.costo_usd');
  t.lis.data.video = { costo_usd: 2.5 };
  assert.equal(t.lvCosto(2), ' · unos US$5');
  assert.equal(t.lvPaso({ estado: 'para_contactar', video: { estado: 'pedido' } }), 'generando');
  assert.equal(t.lvPaso({ estado: 'contactado' }), 'enviados');
});
