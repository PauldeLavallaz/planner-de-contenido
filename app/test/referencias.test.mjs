// Referencias: la Bandeja por marca, la Selección, decidir y pedir guiones, con una carpeta de contenido inventada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { crear, lunes, sembrar } from './fixtures/research.mjs';

const fx = crear();
await sembrar(fx.db);
const L = lunes(), hoy = new Date().toISOString().slice(0, 10);
const doc = (dir, d) => { mkdirSync(resolve(fx.root, 'referencias', L, dir), { recursive: true }); writeFileSync(resolve(fx.root, 'referencias', L, dir, 'referencias.json'), JSON.stringify(d)); };
// El research de Mi Marca, uno sin marca (de todas) y la Selección de Mi Marca.
doc('mi-marca', { tipo: 'referencias', semana: L, marca: 'Mi Marca', generado: hoy + 'T10:00:00Z', referencias: [
  { id: 'r1', url: 'https://www.instagram.com/reel/RESEARCH1/', red: 'instagram', cuenta: '@deuna', titulo: 'Del research', hook: { texto: 'Gancho del research' }, analisis: { por_que: 'Porque sí' },
    media: { poster: '../afuera.jpg' }, metricas: { vistas: 50000, multiplo: 9 } }] });
doc('', { tipo: 'referencias', semana: L, generado: hoy + 'T09:00:00Z', referencias: [{ url: 'https://www.tiktok.com/@x/video/123', red: 'tiktok', cuenta: '@nadie', titulo: 'De todas' }] });
doc('seleccion-20261103', { tipo: 'referencias', semana: L, marca: 'Mi Marca', generado: hoy + 'T11:00:00Z', seleccion: { fecha: hoy, foco: 'Ventas', pool: { revisadas: 40 } }, referencias: [
  { url: 'https://www.instagram.com/p/UNO', cuenta: '@deuna', seleccion: { puesto: 1, nivel: 'candidata', mensaje: 'Producto', razon: 'Vende', hook_es: 'Gancho', como: { tomar: 'idea', reel_o_carrusel: 'reel' } } }] });
// Un plan de guiones que ya usa una referencia.
mkdirSync(resolve(fx.root, 'guiones', L, 'R1'), { recursive: true });
writeFileSync(resolve(fx.root, 'guiones', L, 'plan.json'), JSON.stringify({ semana: L, piezas: [{ id: 'R1', titulo: 'Ya en guiones', carpeta: 'R1', ref_ids: ['tt:123'] }] }));

const { Hono } = await import('hono');
const { registerReferencias, urlKey } = await import('../src/referencias.ts');
const app = new Hono(); registerReferencias(app);
const get = async p => (await app.request('/api/planner/' + p)).json();
const post = (p, body) => app.request('/api/planner/' + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('la misma publicación con otra URL es la misma referencia', () => {
  assert.equal(urlKey('https://www.instagram.com/reel/ABC/?igsh=1'), urlKey('https://instagram.com/p/ABC'));
  assert.equal(urlKey('https://vm.tiktok.com/x'), 'vm.tiktok.com/x');
});

test('la Bandeja de una marca: su research, el de todas y lo de la base de sus cuentas', async () => {
  const d = await get('referencias?perfil=mi-marca');
  const ids = d.referencias.map(r => r.id).sort();
  assert.deepEqual(ids, ['ig:TODAS', 'ig:TUYO', 'ig:UNO', 'r1', 'tt:123']);
  const r1 = d.referencias.find(r => r.id === 'r1');
  assert.equal(r1.media.poster, null, 'media outside the content folder is dropped');
  assert.equal(r1.ficha.handle, 'deuna');
  assert.equal(d.referencias.find(r => r.id === 'ig:UNO').seleccion.mensaje, 'producto', 'the Selection mark travels to the Bandeja');
  assert.equal(d.referencias.find(r => r.id === 'tt:123').usos[0].id, 'R1', 'what is already a script shows up as used');
  const otra = (await get('referencias?perfil=otra-marca')).referencias.map(r => r.id).sort();
  assert.deepEqual(otra, ['ig:OTRO', 'ig:TODAS', 'ig:TUYO', 'tt:123']);
  assert.equal(d.taxonomia.anillos.length, 5, 'without its own taxonomy, the example one');
});

test('la Selección vigente de la marca, con su foco', async () => {
  const s = await get('referencias/seleccion?perfil=mi-marca');
  assert.equal(s.seleccion.foco, 'Ventas');
  assert.equal(s.seleccion.pool.revisadas, 40);
  assert.equal(s.referencias[0].id, 'ig:UNO');
  assert.equal(s.referencias[0].seleccion.como.tomar, 'idea');
  assert.equal((await get('referencias/seleccion?perfil=otra-marca')).seleccion, null);
});

test('decidir, pedir guiones y recuperar', async () => {
  assert.equal((await post('referencias/decision', { perfil: 'mi-marca', id: 'nada', decision: 'adaptar' })).status, 404);
  assert.equal((await post('referencias/decision', { perfil: 'Mi Marca', id: 'r1', decision: 'adaptar' })).status, 400, 'the brand travels as a slug');
  const ok = await (await post('referencias/decision', { perfil: 'mi-marca', id: 'r1', decision: 'adaptar' })).json();
  assert.equal(ok.decision.decision, 'adaptar');
  assert.equal(ok.analizada, null, 'one that already has its analysis is not queued');
  const uno = await (await post('referencias/decision', { perfil: 'mi-marca', id: 'ig:UNO', decision: 'adaptar' })).json();
  assert.equal(uno.analizada, 'en_cola', 'choosing one without analysis queues it');
  const cola = JSON.parse(readFileSync(resolve(fx.root, 'publicar/.planner/referencias-analizar.json'), 'utf8'));
  assert.equal(urlKey(cola.pendientes[0].url), 'ig:UNO');
  const p = await (await post('referencias/pedido', { week: L, perfil: 'mi-marca' })).json();
  assert.equal(p.n, 2);
  assert.match(p.prompt, /^\[Planificación\] Armar 2 reels de Mi Marca para la semana del /);
  assert.match(p.prompt, /skills\/guiones\/SKILL\.md/);
  assert.match(p.prompt, /Sólo el tema/, 'the Selection says to take the idea');
  assert.match(p.prompt, /Frená en el guion/, 'by default it stops at the script, without paid voice');
  assert.doesNotMatch(p.prompt, /Paul|NORA|rioplatense/);
  assert.ok(existsSync(resolve(fx.root, p.path)));
  assert.equal((await (await post('referencias/pedido', { week: L, perfil: 'mi-marca' })).json()).error, 'No hay nada elegido para pedir: tocá Hacer en alguna referencia.', 'what was asked is not asked again');
  const pedidos = await get('referencias/pedidos?perfil=mi-marca');
  assert.equal(pedidos.pedidos[0].piezas.length, 2);
  // Pasar y recuperar: vuelve como estaba, pedida.
  await post('referencias/decision', { perfil: 'mi-marca', id: 'r1', decision: 'descartar', motivo: 'tema' });
  const rec = await (await post('referencias/decision', { perfil: 'mi-marca', id: 'r1', decision: 'quitar' })).json();
  assert.equal(rec.decision.decision, 'adaptar');
  assert.ok(rec.decision.pedido?.id);
});

test('la ficha de una cuenta con sus contenidos y su decisión', async () => {
  const f = await get('competidores/cuenta?id=instagram:deuna&perfil=mi-marca');
  assert.equal(f.cuenta.handle, 'deuna');
  assert.equal(f.contenidos[0].id, 'ig:UNO');
  assert.equal(f.contenidos[0].decision.decision, 'adaptar');
  assert.equal(f.contenidos[0].clase.tema, 'tutorial');
});
