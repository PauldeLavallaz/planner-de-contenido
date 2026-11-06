// Pestaña Guiones: plan de la semana, aprobar, feedback, «Copiar feedback», estilos, looks y títulos, sobre una carpeta
// de contenido temporal. Sin Postiz real ni el motor de Python.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync, utimesSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = mkdtempSync(resolve(tmpdir(), 'planner-guiones-test-'));
const serverPath = fileURLToPath(new URL('../src/server.ts', import.meta.url));
mkdirSync(resolve(root, 'publicar/.planner'), { recursive: true });
const config = resolve(root, 'planner.config.json');
writeFileSync(config, JSON.stringify({ timezone: 'America/Argentina/Buenos_Aires', content: { root: '.' }, publish_root: 'publicar', guiones: { carpeta: 'guiones', looks: 'looks', titulos: [{ id: 'mio', nombre: 'Mi título', imagen: 'looks/a.jpg' }] } }));
const inventory = resolve(root, 'fake_inventory.py');
writeFileSync(inventory, 'print(' + JSON.stringify(JSON.stringify({ items: [], timezone: 'America/Argentina/Buenos_Aires', config: {} })) + ')\n');
// Looks: dos imágenes, una prohibida en looks.json.
mkdirSync(resolve(root, 'looks'));
for (const f of ['a.jpg', 'b.jpg', 'c.jpg']) writeFileSync(resolve(root, 'looks', f), Buffer.alloc(64, 3));
writeFileSync(resolve(root, 'looks/looks.json'), JSON.stringify({ 'a.jpg': { nombre: 'Living de día', combina: 'paletas claras', default: true }, c: { prohibido: true } }));
// Una semana con dos piezas: un reel con guion y audio, y un carrusel con láminas. Las carpetas, relativas al plan.
const W = '2026-10-26', plan = `guiones/${W}/plan.json`, reel = `guiones/${W}/R01`, car = `guiones/${W}/C01`;
mkdirSync(resolve(root, reel), { recursive: true }); mkdirSync(resolve(root, car, 'slides'), { recursive: true });
writeFileSync(resolve(root, reel, 'guion.txt'), 'Primera frase del guion.\n\nEl cierre.\n');
writeFileSync(resolve(root, reel, 'audio.mp3'), Buffer.alloc(2048, 5));
writeFileSync(resolve(root, reel, 'muestra.jpg'), Buffer.alloc(64, 2));
for (const f of ['01.png', '02.png']) writeFileSync(resolve(root, car, 'slides', f), Buffer.alloc(64, 1));
writeFileSync(resolve(root, car, 'copy.txt'), 'Portada\n\nLámina dos\n');
const papel = { id: 'papel', nombre: 'Papel y tinta', paleta: ['#F0EEE6', '#141413', '#D97757'], titulo_css: { clase: 't-condensada t-caja' } };
const noche = { id: 'noche', nombre: 'Noche', paleta: ['#13181E', '#FAF9F5'] };
writeFileSync(resolve(root, plan), JSON.stringify({ semana: W, titulo: 'Semana de prueba', piezas: [
  { id: 'R01', tipo: 'reel', titulo: 'Reel de prueba', titulo_pantalla: 'LÍNEA UNO / LÍNEA DOS', carpeta: 'R01', estilo: papel, muestras: ['R01/muestra.jpg', '../afuera.jpg'] },
  { id: 'C01', tipo: 'carrusel', titulo: 'Carrusel', carpeta: 'C01', estilo: noche },
] }, null, 2));

let child, base, errors = '';
const post = (path, body) => fetch(base + '/api/planner/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(body) });
const get = async () => (await fetch(base + `/api/planner/guiones?week=${W}`)).json();
const pz = async id => (await get()).piezas.find(p => p.id === id);
const planJson = () => JSON.parse(readFileSync(resolve(root, plan), 'utf8')).piezas;
const notas = dir => existsSync(resolve(root, dir, 'feedback')) ? readdirSync(resolve(root, dir, 'feedback')).filter(f => f.endsWith('-planner.json')) : [];

test('guiones: plan, aprobar, feedback, estilos, looks y títulos', async () => {
  child = spawn(process.execPath, [serverPath], { cwd: tmpdir(), env: { ...process.env, PLANNER_PORT: '0', PLANNER_CONFIG: config, PLANNER_INVENTORY: inventory }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.on('data', c => { errors += c; });
  base = await new Promise((ok, fail) => {
    const timer = setTimeout(() => fail(new Error('startup timeout: ' + errors)), 10000);
    let out = '';
    child.stdout.on('data', c => { out += c; const line = out.split('\n').find(l => l.includes('"event":"listening"')); if (line) { clearTimeout(timer); ok(JSON.parse(line).url); } });
  });
  try {
    let d = await get();
    assert.equal(d.weeks.length, 1);
    assert.equal(d.plan.titulo, 'Semana de prueba');
    const r1 = d.piezas.find(p => p.id === 'R01'), c1 = d.piezas.find(p => p.id === 'C01');
    assert.equal(r1.run, reel);
    // El día en que empezó: sin fecha en el nombre de la carpeta, cuándo se creó.
    assert.match(r1.inicio, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    assert.deepEqual(r1.muestras.map(m => m.path), [reel + '/muestra.jpg']);
    assert.equal(r1.estado, 'por_escuchar');
    assert.equal(r1.audio.path, reel + '/audio.mp3');
    assert.equal(r1.guion.palabras, 6);
    assert.equal(c1.estado, 'borrador_por_revisar');
    assert.equal(c1.laminas.length, 2);

    // Aprobar y volver; una nota nueva saca la aprobación.
    assert.equal((await post('guiones/estado', { run: '../afuera', estado: 'aprobado' })).status, 400);
    assert.equal((await post('guiones/estado', { run: reel, estado: 'aprobado' })).status, 200);
    assert.equal((await pz('R01')).estado, 'aprobado');
    const fb = await (await post('guiones/feedback', { run: reel, pieza: 'R01', text: 'Más corto el cierre' })).json();
    assert.equal(fb.entries.length, 1);
    assert.equal((await pz('R01')).estado, 'cambios');
    // Una nota de copy no pone la pieza «Con feedback».
    await post('guiones/feedback', { run: car, pieza: 'C01', copy: 'Copy nuevo del post' });
    assert.equal((await pz('C01')).estado, 'borrador_por_revisar');
    // Con `runs`, sólo las piezas que se ven en el planner: una pieza sin notas no alcanza para copiar.
    assert.equal((await post('guiones/copiar', { perfil: '', week: W, runs: ['nada'], marcar: false })).status, 400);
    const cp = await (await post('guiones/copiar', { perfil: '', week: W })).json();
    // La primera línea es el título de la conversación: lo que hace el pedido.
    assert.match(cp.prompt, /^\[Feedback\] Corregir 2 piezas de «Semana de prueba»\n\n/);
    assert.match(cp.prompt, /Más corto el cierre/);
    assert.match(cp.prompt, /Copy nuevo del post/);
    assert.match(cp.prompt, new RegExp(`Carpeta: ${reel}`));
    assert.equal(JSON.parse(readFileSync(resolve(root, reel, 'feedback', notas(reel)[0]), 'utf8')).estado, 'enviado');
    // Copiar una sola pieza no lleva ni marca las notas de las otras.
    assert.equal((await post('guiones/feedback', { run: car, text: 'Nota del carrusel' })).status, 200);
    const solo = (await (await post('guiones/copiar', { perfil: '', week: W, runs: [reel] })).json()).prompt;
    assert.match(solo, /^\[Feedback\] Editar el guion «Reel de prueba»\n\n/);
    assert.doesNotMatch(solo, /Nota del carrusel/);
    const notaCar = notas(car).find(f => JSON.parse(readFileSync(resolve(root, car, 'feedback', f), 'utf8')).text === 'Nota del carrusel');
    assert.equal(JSON.parse(readFileSync(resolve(root, car, 'feedback', notaCar), 'utf8')).estado, 'pendiente');
    assert.equal((await post('guiones/feedback/remove', { run: car, file: notaCar })).status, 200);

    // Pausar y reanudar.
    await post('guiones/descartar', { run: car, accion: 'pausar' });
    assert.ok((await pz('C01')).pausado);
    await post('guiones/descartar', { run: car, accion: 'reanudar' });
    assert.equal((await pz('C01')).pausado, null);

    // Biblioteca de estilos: los dos del plan; cambiar el del reel escribe el plan sin tocar el resto.
    const lib = await (await fetch(base + '/api/planner/guiones/estilos')).json();
    assert.deepEqual(lib.estilos.map(s => s.id).sort(), ['noche', 'papel']);
    assert.equal((await post('guiones/estilo', { plan, run: reel, estilo: 'inventado' })).status, 400);
    let r = await (await post('guiones/estilo', { plan, run: reel, estilo: 'noche' })).json();
    assert.equal(r.estilo.id, 'noche');
    assert.equal(planJson()[0].estilo.id, 'noche');
    assert.equal(planJson()[0].carpeta, 'R01');
    assert.equal((await pz('R01')).estilo_antes.id, 'papel');
    await post('guiones/estilo', { plan, run: reel, estilo: 'papel', deshacer: true });
    assert.equal(planJson()[0].estilo.id, 'papel');

    // Looks y títulos.
    const cat = await (await fetch(base + '/api/planner/guiones/produccion')).json();
    assert.deepEqual(cat.looks.map(l => l.id), ['a', 'b']);
    assert.equal(cat.looks[0].nombre, 'Living de día');
    assert.equal(cat.looks[0].default, true);
    assert.ok(cat.titulos.some(t => t.id === 'condensada-caja'));
    assert.equal(cat.titulos.find(t => t.id === 'mio').imagen, 'looks/a.jpg');
    assert.equal((await fetch(base + '/api/planner/guiones/looks/img?id=a')).status, 200);
    assert.equal((await post('guiones/produccion', { plan, run: reel, campo: 'look', valor: 'c' })).status, 400);
    assert.equal((await post('guiones/produccion', { plan, run: car, campo: 'look', valor: 'a' })).status, 400);
    r = await (await post('guiones/produccion', { plan, run: reel, campo: 'look', valor: 'a' })).json();
    assert.equal(r.nota, false);
    assert.equal(planJson()[0].look.id, 'a');
    assert.equal((await pz('R01')).look.nombre, 'Living de día');
    // Con rough cut, el título deja una nota para rehacerlo; volver al del estilo la saca.
    writeFileSync(resolve(root, reel, 'rough_cut.mp4'), Buffer.alloc(16));
    const antes = notas(reel).length;
    r = await (await post('guiones/produccion', { plan, run: reel, campo: 'titulo_tipo', valor: 'serif' })).json();
    assert.equal(r.nota, true);
    assert.equal(planJson()[0].titulo_tipo.clase, 't-serif');
    assert.equal(notas(reel).length, antes + 1);
    await post('guiones/produccion', { plan, run: reel, campo: 'titulo_tipo', valor: 'black' });
    assert.equal(notas(reel).length, antes + 1);
    await post('guiones/produccion', { plan, run: reel, campo: 'titulo_tipo', valor: null });
    assert.equal(planJson()[0].titulo_tipo, undefined);
    assert.equal(notas(reel).length, antes);

    // Dos planes de la misma semana con el mismo nombre (uno guardado en otra carpeta de semana): cada uno se pide por su
    // archivo, también al copiar el feedback.
    const otro = 'guiones/2026-10-19/plan.json';
    mkdirSync(resolve(root, 'guiones/2026-10-19/L01'), { recursive: true });
    writeFileSync(resolve(root, 'guiones/2026-10-19/L01/guion.txt'), 'Guion del lote.\n');
    writeFileSync(resolve(root, otro), JSON.stringify({ semana: W, titulo: 'Lote aparte', piezas: [{ id: 'L01', titulo: 'Del lote', carpeta: 'L01' }] }));
    const lista = await get();
    assert.deepEqual(lista.weeks.filter(w => w.week === W).map(w => w.path).sort(), [otro, plan].sort());
    const porArchivo = async path => (await fetch(base + `/api/planner/guiones?perfil=&week=${W}&path=${encodeURIComponent(path)}`)).json();
    assert.deepEqual((await porArchivo(otro)).piezas.map(p => p.id), ['L01']);
    assert.equal((await porArchivo(plan)).plan.titulo, 'Semana de prueba');
    assert.equal((await post('guiones/copiar', { perfil: '', week: W, path: otro, marcar: false })).status, 400);
    assert.equal((await post('guiones/copiar', { perfil: '', week: W, path: plan, marcar: false })).status, 200);

    // La ficha de la tarjeta: tema y referencia son opcionales; lo que no vale no llega. Sin `referencia`, sale de la primera
    // URL de red social de referencias[]; las rutas internas no cuentan.
    const fichaPlan = 'guiones/2026-10-12/plan.json';
    mkdirSync(resolve(root, 'guiones/2026-10-12'), { recursive: true });
    mkdirSync(resolve(root, 'refs'), { recursive: true });
    writeFileSync(resolve(root, 'refs/instagram-XXXX.jpg'), Buffer.alloc(32, 3));
    writeFileSync(resolve(root, 'refs/datos.json'), '{}');
    const interna = { url: 'guiones/2026-10-05/R01', cuenta: 'propia' }, doc = { url: 'docs/canon.md', cuenta: 'propia' };
    writeFileSync(resolve(root, fichaPlan), JSON.stringify({ semana: '2026-10-12', titulo: 'Ficha', piezas: [
      { id: 'F1', titulo: 'Completa', tema: '  Automatización de contenido ', referencia: { url: 'https://www.instagram.com/p/XXXX/', cuenta: '@cuenta.ejemplo', vistas: 120000, multiplo: 12.5, tomar: 'recrear', poster: 'refs/instagram-XXXX.jpg', hook_original: 'No tengo diseñador…' } },
      { id: 'F2', titulo: 'Valores inválidos', tema: '   ', referencia: { url: 'https://www.tiktok.com/@alguien/video/123', vistas: 'muchas', multiplo: -3, tomar: 'copiar', poster: '../../afuera.jpg' } },
      { id: 'F3', titulo: 'Póster que no es media', referencia: { url: 'https://x.com/persona/status/99', cuenta: 'Una creadora', poster: 'refs/datos.json' } },
      { id: 'F4', titulo: 'Con red social', referencias: [interna, doc, { url: 'https://techcrunch.com/nota', cuenta: 'TechCrunch' }, { url: 'https://www.instagram.com/reel/BASE/', cuenta: '@micuenta (original)', nota: '1,1 M vistas' }, { url: 'https://x.com/otra/status/1', cuenta: 'Otra' }] },
      { id: 'F5', titulo: 'Sólo internas', referencias: [interna, doc, { url: 'https://techcrunch.com/nota', cuenta: 'TechCrunch' }, 'guiones/otro'] },
      { id: 'F6', titulo: 'URLs inválidas', referencia: { url: 'javascript:alert(1)' }, referencias: [{ url: 'http://localhost:4180/x' }, { url: 'http://127.0.0.1/y' }, 'https://www.instagram.com.evil.example/p/Z/'] },
      { id: 'F7', titulo: 'Dice que no tiene', referencia: null, referencias: [{ url: 'https://www.instagram.com/p/NO/', cuenta: '@no' }] },
      { id: 'F8', titulo: 'Sin nada' },
      { id: 'F9', titulo: 'Una URL suelta', referencias: ['https://youtu.be/abc'] },
    ] }));
    const ficha = Object.fromEntries((await porArchivo(fichaPlan)).piezas.map(p => [p.id, p]));
    assert.deepEqual(ficha.F1.referencia, { url: 'https://www.instagram.com/p/XXXX/', cuenta: '@cuenta.ejemplo', vistas: 120000, multiplo: 12.5, tomar: 'recrear', poster: 'refs/instagram-XXXX.jpg', hook_original: 'No tengo diseñador…', nota: null });
    assert.equal(ficha.F1.tema, 'Automatización de contenido');
    assert.deepEqual(ficha.F2.referencia, { url: 'https://www.tiktok.com/@alguien/video/123', cuenta: '@alguien', vistas: null, multiplo: null, tomar: null, poster: null, hook_original: null, nota: null });
    assert.equal(ficha.F2.tema, null);
    assert.equal(ficha.F3.referencia.cuenta, '@persona');
    assert.equal(ficha.F3.referencia.poster, null);
    assert.deepEqual(ficha.F4.referencia, { url: 'https://www.instagram.com/reel/BASE/', cuenta: '@micuenta', vistas: null, multiplo: null, tomar: null, poster: null, hook_original: null, nota: '1,1 M vistas' });
    assert.equal(ficha.F5.referencia, null, 'ni las rutas internas ni una nota de prensa son la referencia original');
    assert.equal(ficha.F6.referencia, null, 'javascript:, localhost y un dominio que imita una red no pasan');
    assert.equal(ficha.F7.referencia, null);
    assert.deepEqual([ficha.F8.referencia, ficha.F8.tema], [null, null]);
    assert.equal(ficha.F9.referencia.url, 'https://youtu.be/abc');
    // Los campos nuevos sólo se leen: el plan no cambia.
    assert.equal(JSON.parse(readFileSync(resolve(root, fichaPlan), 'utf8')).piezas[0].tema, '  Automatización de contenido ');
    assert.equal(errors.trim(), '');
  } finally {
    child.kill();
    rmSync(root, { recursive: true, force: true });
  }
});

// Una iteración guardada aparte (final_gancho_b.mp4) se ve en la tarjeta sin pisar lo aprobado ni lo agendado.
test('versiones de un final: se ve la más nueva, se aprueba la que se mira y lo agendado se marca', async () => {
  const r2 = mkdtempSync(resolve(tmpdir(), 'planner-versiones-test-'));
  const rn = 'guiones/2026-11-02/R04', d = resolve(r2, rn);
  mkdirSync(d, { recursive: true });
  mkdirSync(resolve(r2, 'publicar/.planner'), { recursive: true });
  mkdirSync(resolve(r2, 'publicar/agendado'), { recursive: true });
  const cfg = resolve(r2, 'planner.config.json'), inv = resolve(r2, 'fake_inventory.py');
  writeFileSync(cfg, JSON.stringify({ timezone: 'America/Argentina/Buenos_Aires', content: { root: '.' }, publish_root: 'publicar', guiones: { carpeta: 'guiones', mensajes: [{ id: 'producto', nombre: 'Producto' }, { id: 'comunidad', nombre: 'Comunidad' }] } }));
  writeFileSync(inv, 'print(' + JSON.stringify(JSON.stringify({ items: [], timezone: 'America/Argentina/Buenos_Aires', config: {} })) + ')\n');
  writeFileSync(resolve(d, 'guion.txt'), 'Una frase.\n');
  const hace = min => new Date(Date.now() - min * 60000);
  const poner = (f, min) => { writeFileSync(resolve(d, f), Buffer.alloc(64, 1)); utimesSync(resolve(d, f), hace(min), hace(min)); };
  poner('final.mp4', 60); poner('final_v1.mp4', 90); poner('final_gancho_simple.mp4', 30);
  // Las copias técnicas, aunque sean más nuevas, no son versiones.
  poner('final_liviano.mp4', 5); poner('final_gancho_simple_liviano.mp4', 5); poner('final_web.mp4', 5); poner('final_postiz.mp4', 5);
  // La cola guarda de qué archivo copió la pieza agendada.
  writeFileSync(resolve(r2, 'publicar/agendado/reel.json'), JSON.stringify({ source_final: realpathSync(resolve(d, 'final.mp4')), slot: { fecha: '2026-11-12' } }));
  // Otra pieza con una versión elegida sólo para el planner (cola.py reemplazar --solo-planner): ésa está en el calendario
  // sin subir y Postiz sigue con la anterior.
  const d5 = resolve(r2, 'guiones/2026-11-02/R05');
  mkdirSync(d5, { recursive: true });
  for (const [f, min] of [['final.mp4', 60], ['final_b.mp4', 30]]) { writeFileSync(resolve(d5, f), Buffer.alloc(64, 3)); utimesSync(resolve(d5, f), hace(min), hace(min)); }
  writeFileSync(resolve(r2, 'publicar/agendado/reel5.json'), JSON.stringify({ source_final: realpathSync(resolve(d5, 'final.mp4')), slot: { fecha: '2026-11-13' }, version_planner: { path: 'guiones/2026-11-02/R05/final_b.mp4' } }));
  writeFileSync(resolve(r2, 'guiones/2026-11-02/plan.json'), JSON.stringify({ semana: '2026-11-02', titulo: 'Prueba', piezas: [{ id: 'R04', titulo: 'Con versiones', carpeta: 'R04', mensaje_de: 'PRODUCTO' }, { id: 'R05', titulo: 'Sin subir', carpeta: 'R05', mensaje_de: 'Otra campaña' }] }));
  // Un plan de pauta en la subcarpeta anuncios/, de una marca, con quién habla en cada pieza.
  mkdirSync(resolve(r2, 'guiones/2026-11-02/anuncios/A01'), { recursive: true });
  writeFileSync(resolve(r2, 'guiones/2026-11-02/anuncios/plan.json'), JSON.stringify({ semana: '2026-11-02', titulo: 'Pauta', marca: 'Mi marca', piezas: [{ id: 'A01', titulo: 'Anuncio', carpeta: 'A01', quien: 'Ana', mensaje_de: 'comunidad' }] }));
  const srv = spawn(process.execPath, [serverPath], { cwd: tmpdir(), env: { ...process.env, PLANNER_PORT: '0', PLANNER_CONFIG: cfg, PLANNER_INVENTORY: inv }, stdio: ['ignore', 'pipe', 'pipe'] });
  let errs = '';
  srv.stderr.on('data', c => { errs += c; });
  const url = await new Promise((ok, fail) => {
    const timer = setTimeout(() => fail(new Error('startup timeout: ' + errs)), 10000);
    let out = '';
    srv.stdout.on('data', c => { out += c; const line = out.split('\n').find(l => l.includes('"event":"listening"')); if (line) { clearTimeout(timer); ok(JSON.parse(line).url); } });
  });
  const send = (path, body) => fetch(url + '/api/planner/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: url }, body: JSON.stringify(body) });
  const pieza = async () => (await (await fetch(url + '/api/planner/guiones?week=2026-11-02&perfil=')).json()).piezas.find(x => x.id === 'R04');
  const estado = () => JSON.parse(readFileSync(resolve(r2, 'publicar/.planner/guiones-estado.json'), 'utf8'))[rn];
  try {
    let p = await pieza();
    assert.equal(p.video.path, rn + '/final_gancho_simple.mp4', 'se revisa la más nueva, no final.mp4');
    assert.equal(p.estado, 'final_por_revisar');
    assert.equal(p.etapa, 'final');
    assert.deepEqual(p.video.lista.map(v => v.nombre), ['Gancho simple', 'Final', 'V1']);
    assert.deepEqual(p.video.lista.map(v => v.agendada), [null, '2026-11-12', null], 'se ve cuál está en el calendario');
    assert.deepEqual(p.video.lista.map(v => v.en_postiz), [null, null, null]);
    // Con una versión sólo para el planner, ésa es la del calendario (sin subir) y la de Postiz se marca aparte.
    const p5 = (await (await fetch(url + '/api/planner/guiones?week=2026-11-02&perfil=')).json()).piezas.find(x => x.id === 'R05');
    assert.deepEqual(p5.video.lista.map(v => [v.nombre, v.agendada, v.sin_subir, v.en_postiz]), [['B', '2026-11-13', true, null], ['Final', null, false, '2026-11-13']]);
    // Para: el valor del plan queda como el id de la opción de la config; uno que no está en la config, tal cual.
    const lista = await (await fetch(url + '/api/planner/guiones?week=2026-11-02&perfil=')).json();
    assert.deepEqual(lista.mensajes, [{ id: 'producto', nombre: 'Producto' }, { id: 'comunidad', nombre: 'Comunidad' }]);
    assert.deepEqual(lista.piezas.map(x => x.mensaje_de), ['producto', 'Otra campaña']);
    // Anuncios: el plan de la subcarpeta anuncios/ es de pauta y lleva su marca; el de la semana es orgánico.
    assert.deepEqual(lista.weeks.map(w => [w.perfil, w.tipo, w.marca]), [['', 'organico', null], ['anuncios', 'anuncios', 'Mi marca']]);
    const pauta = await (await fetch(url + '/api/planner/guiones?week=2026-11-02&perfil=anuncios')).json();
    assert.equal(pauta.plan.tipo, 'anuncios');
    assert.deepEqual(pauta.piezas.map(x => [x.quien, x.mensaje_de]), [['Ana', 'comunidad']]);

    // Sin decir cuál, se aprueba la que muestra la tarjeta; una ruta ajena no cuenta.
    assert.equal((await send('guiones/estado', { run: rn, estado: 'aprobado', video: '../afuera.mp4' })).status, 200);
    assert.equal(estado().video, rn + '/final_gancho_simple.mp4');
    // Aprobar una anterior que se estaba mirando la fija, y la tarjeta se queda en ella.
    assert.equal((await send('guiones/estado', { run: rn, estado: 'aprobado', video: rn + '/final.mp4' })).status, 200);
    p = await pieza();
    assert.equal(p.video.path, rn + '/final.mp4');
    assert.equal(p.estado, 'aprobado');
    assert.deepEqual(p.video.lista.map(v => v.aprobada), [false, true, false]);

    // Una versión posterior a la aprobación se revisa; la aprobación sigue atada a su archivo.
    writeFileSync(resolve(d, 'final_gancho_pastel.mp4'), Buffer.alloc(64, 2));
    utimesSync(resolve(d, 'final_gancho_pastel.mp4'), new Date(Date.now() + 5000), new Date(Date.now() + 5000));
    p = await pieza();
    assert.equal(p.video.path, rn + '/final_gancho_pastel.mp4');
    assert.equal(p.estado, 'final_por_revisar');
    assert.equal(p.video.lista.find(v => v.path.endsWith('/final.mp4')).aprobada, true);
    assert.equal(estado().video, rn + '/final.mp4');

    // La nota dice sobre qué versión es, cuando no es la que muestra la tarjeta.
    assert.equal((await send('guiones/feedback', { run: rn, pieza: 'R04', text: 'Más fuerza', video: rn + '/final_gancho_simple.mp4' })).status, 200);
    const cp = await (await send('guiones/copiar', { perfil: '', week: '2026-11-02', marcar: false })).json();
    assert.match(cp.prompt, /^\[Feedback\] Editar el video «Con versiones»\n\n/);
    assert.match(cp.prompt, /Final revisado: .*final_gancho_pastel\.mp4/);
    assert.match(cp.prompt, /Sobre la versión: .*final_gancho_simple\.mp4/);
    assert.equal(errs.trim(), '');
  } finally {
    srv.kill('SIGTERM');
    rmSync(r2, { recursive: true, force: true });
  }
});

// La tarjeta se arma en el navegador: la ficha y la referencia se prueban con el código de guiones.js, sin servidor.
test('tarjeta: la ficha no deja renglones vacíos y la referencia aparece sólo cuando la hay', () => {
  const source = readFileSync(new URL('../public/guiones.js', import.meta.url), 'utf8');
  const ctx = vm.createContext({ gv: { open: {} }, esc: s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`), gvFormatoNombre: p => typeof p.formato === 'string' ? p.formato : p.formato?.nombre || '',
    perfilActual: 'all', marcas: () => ['Mi marca', 'Otra'], BRAND_LABEL: {}, gvParaNombre: v => ({ producto: 'Producto' })[v] || v, gvParaClase: () => 'p-0' });
  const desde = source.indexOf('// Qué es: el título y de qué trata.'), hasta = source.indexOf('// Las tres portadas del carrusel');
  assert.ok(desde > 0 && hasta > desde);
  vm.runInContext(source.slice(desde, hasta), ctx);
  // Sin datos y sin poder editar, no hay ficha.
  assert.equal(ctx.gvFicha({ key: 'A' }, false), '');
  // Editable, sólo queda la etiqueta del estilo, que es el botón: nada de «sin dato».
  const sola = ctx.gvFicha({ key: 'A' }, true);
  assert.equal([...sola.matchAll(/class="gv-chip[ "]/g)].length, 1);
  assert.match(sola, /data-gvcambiar="A"[\s\S]*Elegir estilo/);
  const llena = ctx.gvFicha({ key: 'B', formato: { nombre: 'Avatar reel' }, tema: 'Automatización', estilo: { nombre: 'Papel y tinta', paleta: ['#F0EEE6'] } }, true);
  assert.equal([...llena.matchAll(/class="gv-chip[ "]/g)].length, 2);
  assert.match(llena, /Avatar reel[\s\S]*data-gvcambiar="B"[\s\S]*Papel y tinta/);
  // En un kit se lee la variante; el nombre entero, en el tooltip.
  const kit = ctx.gvFicha({ key: 'K', formato: { nombre: 'Reel explicativo · Mi marca' }, estilo: { nombre: 'Kit de reels explicativos · isométrico, una capa' } }, true);
  assert.match(kit, /title="Reel explicativo · Mi marca">Reel explicativo</);
  assert.match(kit, /gv-chip-t">Isométrico, una capa</);
  assert.match(kit, /title="Kit de reels explicativos · isométrico, una capa"/);
  // `edicion` resumida: su primer tramo; las que describen el contenido no son un estilo.
  assert.equal(vm.runInContext(`gvResumen('Papel noche con acento ámbar (el living): registros noche')`, ctx), 'Papel noche con acento ámbar');
  assert.equal(vm.runInContext(`gvResumen('Cuadro 0: un cuchillo que corta')`, ctx), '');
  assert.match(ctx.gvFicha({ key: 'C', edicion: 'Kit de reels explicativos' }, false), /Kit de reels explicativos/);
  // Cómo se dice cada referencia, y nada sin referencia.
  assert.equal(ctx.gvReferencia({}), '');
  const ref = r => ctx.gvReferencia({ referencia: { url: 'https://www.instagram.com/p/X/', cuenta: '@a', ...r } });
  assert.match(ref({ tomar: 'recrear', vistas: 120000, multiplo: 12.5 }), /Clona a @a[\s\S]*120 mil vistas · ×13/);
  assert.match(ref({ tomar: 'idea' }), /Toma el tema de @a/);
  assert.match(ref({ tomar: 'formato' }), /Toma el formato de @a/);
  assert.match(ref({ tomar: null }), /Referencia: @a/);
  assert.match(ref({ tomar: 'recrear', cuenta: null }), /Clona un original/);
  assert.match(ref({}), /target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(ref({}), /gv-ref-th/);
  assert.match(ref({ poster: 'x/y.jpg' }), /gv-ref-th/);
  // Con todas las marcas a la vista, la marca de la pieza; en un anuncio, quién habla; y para qué mensaje, con su nombre.
  const anuncio = ctx.gvFicha({ key: 'G', marca: 'Mi marca', quien: 'Ana', mensaje_de: 'producto' }, false);
  assert.match(anuncio, /title="Marca">Mi marca</);
  assert.match(anuncio, /title="Quién habla">Ana</);
  assert.match(anuncio, /gv-para p-0" title="Para">Producto</);
  ctx.perfilActual = 'Mi marca';
  assert.doesNotMatch(ctx.gvFicha({ key: 'G', marca: 'Mi marca' }, false), /Marca/, 'with one brand chosen in the sidebar, the brand chip is redundant');
  ctx.perfilActual = 'all';
  // Sin título, el gancho hace de título; si son iguales, aunque cambie la puntuación, no se repite.
  assert.doesNotMatch(ctx.gvQueEs({ titulo: 'Toda empresa quiere su propia IA', hook: 'Toda empresa quiere su propia IA.' }), /gv-hook/);
  assert.match(ctx.gvQueEs({ hook: 'Sólo gancho' }), /<h3 class="gv-title">Sólo gancho<\/h3>$/);
  assert.match(ctx.gvQueEs({ titulo: 'T', hook: 'G' }), /gv-hook">G/);
  // Con video el gancho ya se ve en la pieza; el tema queda a la vista.
  const conVideo = ctx.gvQueEs({ titulo: 'T', hook: 'G', tema: 'De qué trata', video: {} });
  assert.doesNotMatch(conVideo, /gv-hook/);
  assert.match(conVideo, /gv-tema">De qué trata/);
  // «Por qué»: sin texto ni fuentes no hay pestaña; sólo las URLs externas son link.
  assert.equal(vm.runInContext(`gvHayPorque({ formato: { detalle: 'x' } })`, ctx), false);
  assert.equal(ctx.gvPorque({ key: 'D', formato: { detalle: 'x' } }), '');
  assert.match(ctx.gvPorque({ key: 'D', porque: 'Porque sí' }), /<p>Porque sí<\/p>/);
  assert.match(ctx.gvPorque({ key: 'E', referencias: [{ url: 'guiones/x', cuenta: 'tu reel' }] }), /tu reel/);
  const fuentes = ctx.gvPorque({ key: 'F', porque: 'P', referencias: [{ url: 'guiones/x', cuenta: 'tu reel' }, { url: 'https://techcrunch.com/nota', cuenta: 'TechCrunch' }, { url: 'javascript:alert(1)', cuenta: 'mala' }] });
  assert.equal([...fuentes.matchAll(/<a /g)].length, 1);
  assert.match(fuentes, /href="https:\/\/techcrunch.com\/nota"/);
  assert.doesNotMatch(fuentes, /javascript:alert/);
});

// Los filtros Para y Formato y la marca de la barra, con el código de guiones.js.
test('filtros: Para en el orden de la config, cada uno cuenta con el otro aplicado, y la marca de la barra filtra', () => {
  const source = readFileSync(new URL('../public/guiones.js', import.meta.url), 'utf8');
  const ctx = vm.createContext({ GV_PERIODOS: [['semana', 'Semana']], GV_FASES: [['todas', 'Todas']], gvDiaGuardado: () => '2026-11-06', esc: s => String(s ?? ''), ICON: { check: '✓' }, store: { get: (_k, d) => d, set() {} }, document: { getElementById: () => null }, todayStr: () => '2026-11-06', perfilActual: 'all', formatoPasa: () => true });
  vm.runInContext(source.slice(source.indexOf('const gvFormatoNombre'), source.indexOf('const GV_ESTADO')), ctx);
  vm.runInContext(source.slice(source.indexOf('const gvKey'), source.indexOf('const gvAprobable')), ctx);
  vm.runInContext(source.slice(source.indexOf('const gvValorFiltro'), source.indexOf('function gvMenuFiltro')), ctx);
  vm.runInContext(`gv.data = { mensajes: [{ id: 'comunidad', nombre: 'Comunidad' }, { id: 'producto', nombre: 'Producto' }], piezas: [] };
    gv.enRango = [{ mensaje_de: 'producto', formato: 'Tutorial' }, { mensaje_de: 'producto', formato: 'Avatar reel editorial' }, { mensaje_de: 'comunidad', formato: 'Tutorial' }, { mensaje_de: 'suelto', formato: 'Tutorial' }, { formato: 'Tutorial' }];`, ctx);
  const ops = k => JSON.parse(vm.runInContext(`JSON.stringify(gvOpcionesFiltro('${k}'))`, ctx));
  assert.deepEqual(ops('para').ops, [['comunidad', 'Comunidad', 1], ['producto', 'Producto', 2], ['suelto', 'suelto', 1]], 'config order first, then what the plans bring');
  assert.deepEqual(ops('familia').ops, [['Tutorial', 'Tutorial', 4], ['Avatar reel', 'Avatar reel', 1]]);
  vm.runInContext(`gv.para = 'producto'`, ctx);
  assert.deepEqual(ops('familia').ops, [['Avatar reel', 'Avatar reel', 1], ['Tutorial', 'Tutorial', 1]], 'Formato counts within Para');
  assert.match(vm.runInContext('gvFiltrosHtml()', ctx), /Para: <b>Producto<\/b>.*Formato/);
  assert.equal(vm.runInContext(`gvFichaOk({ mensaje_de: 'comunidad' })`, ctx), false);
  // La marca de la barra: una pieza de otra marca no se ve; una sin marca, sí.
  ctx.perfilActual = 'Mi marca';
  assert.equal(vm.runInContext(`gvVisible({ marca: 'Otra' })`, ctx), false);
  assert.equal(vm.runInContext(`gvVisible({ marca: 'Mi marca' }) && gvVisible({})`, ctx), true);
  // Orgánico o Anuncios: los planes de la semana según su tipo.
  const planes = [{ week: 'w', perfil: '', tipo: 'organico' }, { week: 'w', perfil: 'anuncios', tipo: 'anuncios' }, { week: 'w', perfil: 'otro' }];
  assert.deepEqual(JSON.parse(vm.runInContext(`JSON.stringify(gvPlanes(${JSON.stringify(planes)}, 'w').map(p => p.perfil))`, ctx)), ['', 'otro']);
  vm.runInContext(`gv.tipo = 'anuncios'`, ctx);
  assert.deepEqual(JSON.parse(vm.runInContext(`JSON.stringify(gvPlanes(${JSON.stringify(planes)}, 'w').map(p => p.perfil))`, ctx)), ['anuncios']);
});
