// Pestaña Guiones: plan de la semana, aprobar, feedback, «Copiar feedback», estilos, looks y títulos, sobre una carpeta
// de contenido temporal. Sin Postiz real ni el motor de Python.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
    const cp = await (await post('guiones/copiar', { perfil: '', week: W })).json();
    assert.match(cp.prompt, /Más corto el cierre/);
    assert.match(cp.prompt, /Copy nuevo del post/);
    assert.match(cp.prompt, new RegExp(`Carpeta: ${reel}`));
    assert.equal(JSON.parse(readFileSync(resolve(root, reel, 'feedback', notas(reel)[0]), 'utf8')).estado, 'enviado');

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
    assert.equal(errors.trim(), '');
  } finally {
    child.kill();
    rmSync(root, { recursive: true, force: true });
  }
});
