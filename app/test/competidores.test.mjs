// La base de competidores en el planner: por marca, sin las cuentas propias, con portadas y puntaje.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { crear, sembrar } from './fixtures/research.mjs';

const fx = crear();
await sembrar(fx.db);
const { Hono } = await import('hono');
const comp = await import('../src/competidores.ts');
const { urlKey } = await import('../src/referencias.ts');

test('las cuentas: sin las propias, con sus marcas', () => {
  const b = comp.base();
  assert.equal(b.disponible, true);
  assert.deepEqual(b.cuentas.map(c => c.handle).sort(), ['deotra', 'detodas', 'deuna']);
  assert.deepEqual(b.porId.get('instagram:deuna').marcas, ['mi-marca']);
  assert.equal(b.porId.get('instagram:deuna').cuadrante, 'Compite de frente');
});

test('la Bandeja de una marca trae lo suyo y lo que no tiene marca', () => {
  const ids = perfil => comp.contenidosBase(14, 2, urlKey, undefined, perfil).map(x => x.id).sort();
  assert.deepEqual(ids('mi-marca'), ['ig:TODAS', 'ig:TUYO', 'ig:UNO']);
  assert.deepEqual(ids('otra-marca'), ['ig:OTRO', 'ig:TODAS', 'ig:TUYO']);
  assert.deepEqual(ids('todas'), ['ig:OTRO', 'ig:TODAS', 'ig:TUYO', 'ig:UNO']);
  const tuyo = comp.contenidosBase(14, 2, urlKey).find(x => x.id === 'ig:TUYO');
  assert.equal(tuyo.origen, 'tuya', 'what you passed in counts as yours, even under the minimum');
});

test('la portada sale de <research>/portadas, como ruta de la carpeta de contenido', () => {
  mkdirSync(resolve(fx.root, 'research/portadas'), { recursive: true });
  writeFileSync(resolve(fx.root, 'research/portadas/instagram-UNO.jpg'), Buffer.alloc(32, 1));
  const uno = comp.contenidoPorId('ig:UNO', urlKey);
  assert.equal(uno.media.poster, 'research/portadas/instagram-UNO.jpg');
  assert.equal(comp.contenidoPorId('ig:OTRO', urlKey).media.poster, null);
});

test('el puntaje junta viralidad y encaje', () => {
  const p = comp.puntajeContenido(10, 100000, null, 1, 80);
  assert.ok(p.puntaje === 67 && p.viralidad === 47 && p.encaje === 95, JSON.stringify(p));
  assert.equal(comp.puntajeContenido(null, null, null, 1, 80).puntaje, null);
});

test('las marcas de una cuenta se cambian desde la ficha', async () => {
  const app = new Hono(); comp.registerCompetidores(app);
  const post = body => app.request('/api/planner/competidores/marcas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const r = await (await post({ id: 'instagram:detodas', marcas: ['otra-marca', 'inventada'] })).json();
  assert.deepEqual(r.marcas, ['otra-marca'], 'a brand that is not in the config is ignored');
  assert.deepEqual(comp.base().porId.get('instagram:detodas').marcas, ['otra-marca']);
  assert.equal((await post({ id: 'nadie', marcas: [] })).status, 404);
  const lista = await (await app.request('/api/planner/competidores')).json();
  assert.deepEqual(lista.marcas, [{ id: 'mi-marca', nombre: 'Mi Marca' }, { id: 'otra-marca', nombre: 'Otra Marca' }]);
});
