// Métricas: lo que arma engine/research/metricas.py llega a la pestaña con su clase, sus videos y la taxonomía.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crear } from './fixtures/research.mjs';

const fx = crear();
const { DatabaseSync } = await import('node:sqlite');
const d = new DatabaseSync(fx.db), t = new Date(Date.now() - 3 * 864e5).toISOString();
d.prepare("insert into propias_publicaciones(id,red,cuenta,marca,perfil,url,publicado_at,titulo,formato_pieza,fuente,actualizado_at,media) values('postiz:1','instagram','mimarca','Mi Marca','mi-marca','https://instagram.com/p/MIO',?,'Mi reel','reel','postiz',?,'../afuera.jpg')").run(t, t);
d.prepare("insert into propias_metricas(id,medido_at,fuente,vistas,likes) values('postiz:1',?,'postiz',1500,90)").run(t);
d.prepare("insert into propias_seguidores values('instagram','mimarca',?,'postiz',900,null,null)").run(t.slice(0, 10));
d.prepare("insert into contenido_clase values('postiz:1','https://instagram.com/p/MIO','tutorial','pantalla',2,'palabras',null,?)").run(t);
d.close();
const { metricas, registerMetricas } = await import('../src/metricas.ts');
const { Hono } = await import('hono');

test('las publicaciones con su última medición y su clase', () => {
  const m = metricas();
  assert.equal(m.disponible, true);
  assert.equal(m.publicaciones[0].vistas, 1500);
  assert.equal(m.publicaciones[0].media, null, 'media outside the content folder is dropped');
  assert.deepEqual(m.publicaciones[0].clase, { tema: 'tutorial', formato: 'pantalla', anillo: 2 });
  assert.equal(m.seguidores[0].seguidores, 900);
  assert.equal(m.fuentes[0].fuentes, 'postiz');
  assert.deepEqual(m.videos, [], 'without grouped videos, each publication counts on its own');
  assert.deepEqual(m.taxonomia.lineas, {}, 'the example taxonomy gets empty lines and styles');
  assert.ok(m.taxonomia.temas.length > 3);
});

test('la ruta del planner', async () => {
  const app = new Hono(); registerMetricas(app);
  const r = await (await app.request('/api/planner/metricas')).json();
  assert.equal(r.publicaciones.length, 1);
});
