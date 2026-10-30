import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Carpeta de contenido, config e inventario de prueba: sin Postiz real ni el motor de Python.
const root = mkdtempSync(resolve(tmpdir(), 'planner-test-'));
const serverPath = fileURLToPath(new URL('../src/server.ts', import.meta.url));
const engineHistorias = fileURLToPath(new URL('../../engine/historias.py', import.meta.url));
const state = resolve(root, 'publicar/.planner');
mkdirSync(state, { recursive: true });
mkdirSync(resolve(root, 'piezas/test'), { recursive: true });
writeFileSync(resolve(root, 'piezas/test/final.mp4'), Buffer.alloc(1024 * 1024, 7));
writeFileSync(resolve(root, '.env'), 'PRIVATE=never-serve-this');
mkdirSync(resolve(root, '.git'), { recursive: true });
writeFileSync(resolve(root, '.git/hidden.mp4'), Buffer.alloc(64, 1));
const config = resolve(root, 'planner.config.json');
// Dos cuentas de Instagram: la principal y una alternativa.
writeFileSync(config, JSON.stringify({ timezone: 'America/Argentina/Buenos_Aires', content: { root: '.' }, publish_root: 'publicar', channels: { instagram: { id: 'ig', alternativas: [{ id: 'ig2', profile: 'segunda' }] } } }));
const item = { id: 'queue:test', title: 'Final de prueba', status: 'ready', approved: true, source: 'piezas/test', primary: { path: 'piezas/test/final.mp4', kind: 'video' }, fingerprint: 'v1', scheduled: null, networks: ['instagram'], channels: [], captions: { general: 'Copy original', youtube_title: 'Título' } };
const inventory = resolve(root, 'fake_inventory.py');
writeFileSync(inventory, 'print(' + JSON.stringify(JSON.stringify({ items: [item], timezone: 'America/Argentina/Buenos_Aires', config: {} })) + ')\n');
writeFileSync(resolve(state, 'draft.json'), JSON.stringify({ revision: 7, changes: {} }));
// Una semana de historias (historias/<semana>/semana.json) con el HTML fuente de cada una, para la pestaña Historias.
const nextMonday = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() + 7 + ((8 - d.getUTCDay()) % 7)); return d.toISOString().slice(0, 10); })();
const W = nextMonday, W2 = new Date(Date.parse(W + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10);
const run = resolve(root, 'historias/semana-prueba');
mkdirSync(resolve(run, 'historias'), { recursive: true }); mkdirSync(resolve(run, 'fuente/assets/fotos'), { recursive: true });
const storyHtml = `<!doctype html>\n<html><head><link rel="stylesheet" href="motor/historia.css"></head><body><main class="historia" data-duracion="7"><div class="fondo"><img src="assets/fotos/x.jpg" style="object-position: 40% 50%"></div><p class="caja">Hola mundo</p><script src="motor/historia.js"></script></main></body></html>\n`;
for (const n of [1, 2]) { writeFileSync(resolve(run, `historias/${W}_${n}_venta.png`), Buffer.alloc(256, n)); writeFileSync(resolve(run, `fuente/${W}_${n}_venta.html`), storyHtml); }
writeFileSync(resolve(run, 'fuente/assets/fotos/x.jpg'), Buffer.alloc(128, 9));
writeFileSync(resolve(run, 'semana.json'), JSON.stringify({ semana: W, dias: [
  { fecha: W, tipo: 'venta', formula: 'V1', tema: 'Tema de prueba', recurso: 'r1', historias: [{ imagen: `historias/${W}_1_venta.png`, texto: 'Hola mundo' }, { imagen: `historias/${W}_2_venta.png`, texto: 'Encuesta', sticker: 'encuesta: ¿sí o no?' }] },
  { fecha: W2, tipo: 'libre', historias: [] }],
  recursos: [{ id: 'r1', tipo: 'recurso', nombre: 'Guía de prueba', palabra: 'GUIA', dm: 'Te paso la guía', estado: 'listo' }] }));
const img1 = `historias/semana-prueba/historias/${W}_1_venta.png`, img2 = `historias/semana-prueba/historias/${W}_2_venta.png`;
// La semana siguiente, para correr una secuencia de una semana a otra.
const N = new Date(Date.parse(W + 'T12:00:00Z') + 7 * 864e5).toISOString().slice(0, 10), day = n => new Date(Date.parse(N + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const run2 = resolve(root, 'historias/semana-prueba-2');
mkdirSync(resolve(run2, 'historias'), { recursive: true });
writeFileSync(resolve(run2, `historias/${day(1)}_1_venta.png`), Buffer.alloc(256, 5));
writeFileSync(resolve(run2, 'semana.json'), JSON.stringify({ semana: N, dias: [{ fecha: day(1), tipo: 'venta', historias: [{ imagen: `historias/${day(1)}_1_venta.png`, texto: 'Martes' }] }] }));
const img3 = `historias/semana-prueba-2/historias/${day(1)}_1_venta.png`;
// Hoy fijo para el servidor (PLANNER_TODAY), en la zona de la config; una semana con un día que ya pasó y otra de la
// cuenta alternativa, para Programar con todo lo pendiente.
const HOY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const addD = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const lunes = d => addD(d, -((new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7));
const P = addD(HOY, -2), runP = resolve(root, 'historias/semana-pasada'), imgP = `historias/semana-pasada/historias/${P}_1_venta.png`;
mkdirSync(resolve(runP, 'historias'), { recursive: true });
writeFileSync(resolve(runP, `historias/${P}_1_venta.png`), Buffer.alloc(256, 6));
writeFileSync(resolve(runP, 'semana.json'), JSON.stringify({ semana: lunes(P), dias: [{ fecha: P, tipo: 'venta', formula: 'V1', historias: [{ imagen: `historias/${P}_1_venta.png`, texto: 'Ya pasó' }] }] }));
const S = addD(W, 3), runS = resolve(root, 'historias/semana-segunda'), imgS = `historias/semana-segunda/historias/${S}_1_recurso.png`;
mkdirSync(resolve(runS, 'historias'), { recursive: true });
writeFileSync(resolve(runS, `historias/${S}_1_recurso.png`), Buffer.alloc(256, 8));
writeFileSync(resolve(runS, 'semana.json'), JSON.stringify({ semana: W, cuenta: 'segunda', dias: [{ fecha: S, tipo: 'recurso', formula: 'R1', historias: [{ imagen: `historias/${S}_1_recurso.png`, texto: 'Otra cuenta' }] }] }));
let child, base, errors = '';
async function start() {
  child = spawn(process.execPath, [serverPath], { cwd: tmpdir(), env: { ...process.env, PLANNER_PORT: '0', PLANNER_CONFIG: config, PLANNER_INVENTORY: inventory, PLANNER_TODAY: HOY }, stdio: ['ignore', 'pipe', 'pipe'] });
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
      // «Abrir en el Finder» sólo abre lo que está dentro de la carpeta de contenido.
      for (const path of ['..', '../..', '/etc/hosts', 'no-existe.mp4']) assert.equal((await request('/api/planner/reveal', 'POST', { path })).status, 404);
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
    await t.test('an edited copy travels as one feedback note and goes away when it matches the piece again', async () => {
      assert.equal((await request('/api/planner/feedback', 'POST', { id: item.id, copy: '   ' })).status, 400);
      const one = await (await request('/api/planner/feedback', 'POST', { id: item.id, copy: 'Copy nuevo' })).json();
      assert.equal(one.entries.length, 1);
      assert.equal(one.entries[0].tipo, 'copy');
      assert.equal(one.entries[0].copy_anterior, 'Copy original');
      assert.match(one.prompt, /Copy nuevo, textual/);
      assert.match(one.prompt, /cola\.py mover/);
      assert.doesNotMatch(one.prompt, /transcribilos/, 'a copy-only note has no audio rules');
      const two = await (await request('/api/planner/feedback', 'POST', { id: item.id, copy: 'Copy nuevo, corregido' })).json();
      assert.equal(two.entries.length, 1, 'an unsent edit is rewritten, not stacked');
      assert.equal(two.entries[0].copy, 'Copy nuevo, corregido');
      assert.equal((await (await fetch(base + '/api/planner/data')).json()).items[0].feedback_pending, 1);
      const draftNow = await (await fetch(base + '/api/planner/draft')).json();
      const prop = await (await request('/api/planner/proposals', 'POST', { revision: draftNow.revision })).json();
      assert.match(prop.prompt, /copy editado/);
      assert.match(prop.prompt, /Pegar este mensaje es mi OK/);
      assert.equal(JSON.parse(readFileSync(resolve(state, `proposal-${prop.id}.json`))).feedback[0].notes[0].copy, 'Copy nuevo, corregido');
      const three = await (await request('/api/planner/feedback', 'POST', { id: item.id, copy: 'Tercera versión' })).json();
      assert.equal(three.entries.length, 2, 'after it was sent, a new edit is a new note');
      const back = await (await request('/api/planner/feedback', 'POST', { id: item.id, copy: 'Copy original' })).json();
      assert.equal(back.entries.length, 1, 'going back to the piece copy drops the unsent edit');
      await request('/api/planner/feedback/remove', 'POST', { id: item.id, file: back.entries[0].file });
    });
    await t.test('stories: week, editor source, draft, proposal, metrics, uploads and feedback', async () => {
      const get = async path => { const r = await fetch(base + '/api/planner/' + path); return { status: r.status, body: await r.json() }; };
      const week = (await get('stories?week=' + W)).body;
      assert.equal(week.cuentas[0].profile, 'ig');
      assert.equal(week.semana.dias.length, 2);
      const h1 = week.semana.dias[0].historias[0];
      assert.equal(h1.imagen, img1);
      assert.equal(h1.editable, true);
      assert.deepEqual(h1.fondo, { foto: 'x.jpg', posicion: '40% 50%' });
      assert.equal((await get('stories?week=' + W + '&cuenta=otra')).status, 400);
      assert.equal((await get('stories?week=' + W + '&cuenta=ig')).body.semana.run, 'historias/semana-prueba');
      // Editor: el HTML fuente y sus archivos, sin salir de fuente/.
      const src = (await get('stories/source?imagen=' + encodeURIComponent(img1))).body;
      assert.match(src.html, /Hola mundo/);
      assert.equal((await fetch(base + src.base + 'assets/fotos/x.jpg')).status, 200);
      for (const bad of ['..%2Fsemana.json', '../semana.json', '.oculto.css']) assert.equal((await fetch(base + src.base + bad)).status, 404);
      assert.equal((await get('stories/source?imagen=' + encodeURIComponent('piezas/test/final.mp4'))).status, 400);
      const same = await (await request('/api/planner/stories/edit', 'POST', { imagen: img1, html: src.html, mtime: src.mtime })).json();
      assert.equal(same.sin_cambios, true);
      for (const html of [src.html.replace('</main>', '<script>alert(1)</script></main>'), src.html.replace('Hola mundo', '<img src="assets/nope.png">'), src.html.replace('<p class', '<p onclick="x()" class')])
        assert.equal((await request('/api/planner/stories/edit', 'POST', { imagen: img1, html, mtime: src.mtime })).status, 400);
      assert.equal((await request('/api/planner/stories/edit', 'POST', { imagen: img1, html: src.html + ' ', mtime: src.mtime - 1000 })).status, 409);
      // Imágenes como sticker: se suben a fuente/assets/subidas/ y aparecen en la lista de la semana.
      const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]).toString('base64');
      const up = await (await request('/api/planner/stories/upload', 'POST', { imagen: img1, name: 'Captura de pantalla.png', mime: 'image/png', data: png })).json();
      assert.match(up.src, /^assets\/subidas\/\d{14}-[0-9a-f]{4}-captura-de-pantalla\.png$/);
      assert.ok((await get('stories/assets?imagen=' + encodeURIComponent(img1))).body.imagenes.some(a => a.src === up.src));
      assert.equal((await request('/api/planner/stories/upload', 'POST', { imagen: img1, name: 'x.exe', mime: 'application/octet-stream', data: png })).status, 400);
      // Sin carpeta de fotos configurada, el catálogo viene vacío.
      assert.equal((await get('catalog')).body.carpeta, null);
      // Borrador y propuesta: ninguna va a mano, ni la que tiene una encuesta anotada; el mensaje apunta al aplicador del motor.
      const draft = await request('/api/planner/stories/draft', 'POST', { week: W, cuenta: 'ig', revision: 0, secuencias: { [W]: { fecha: W, historias: [img1, img2], publicar: 'postiz', hora: '10:00' } } });
      assert.equal(draft.status, 200);
      assert.equal((await draft.json()).revision, 1);
      assert.equal((await request('/api/planner/stories/draft', 'POST', { week: W, cuenta: 'ig', revision: 0, secuencias: {} })).status, 409);
      assert.equal((await request('/api/planner/stories/draft', 'POST', { week: W, cuenta: 'ig', revision: 1, secuencias: { [W]: { fecha: W, historias: [img1, img1], publicar: 'no', hora: null } } })).status, 400);
      const prop = await (await request('/api/planner/stories/proposal', 'POST', { week: W, cuenta: 'ig', revision: 1 })).json();
      assert.match(prop.prompt, /python3 engine\/historias\.py aplicar .* --ejecutar: 2 historias a Postiz, desde la cuenta de Instagram /);
      // Sin «@»: en Claude Code la arroba abre el selector de archivos.
      assert.doesNotMatch(prop.prompt, /@|a mano/);
      const stored = JSON.parse(readFileSync(resolve(state, `proposal-historias-${prop.id}.json`)));
      const deW = stored.acciones.filter(a => [img1, img2].includes(a.imagen));
      assert.deepEqual(deW.map(a => a.accion), ['agendar', 'agendar']);
      assert.deepEqual(deW.map(a => a.a_mano), [false, false]);
      assert.equal(deW[0].cuenta_id, 'ig');
      // Respuestas por día.
      const m = await (await request('/api/planner/stories/metrics', 'POST', { date: W, cuenta: 'ig', respuestas: 12, vistas_primera: 300 })).json();
      assert.equal(m.metricas[W].respuestas, 12);
      assert.equal((await get('stories?week=' + W)).body.metricas[W].vistas_primera, 300);
      assert.equal((await request('/api/planner/stories/metrics', 'POST', { date: W, respuestas: -1 })).status, 400);
      // Feedback: detalles de una historia y general de la secuencia, en la carpeta de la semana.
      const f1 = await (await request('/api/planner/stories/feedback', 'POST', { imagen: img1, alcance: 'historia', text: 'Más grande el título' })).json();
      const f2 = await (await request('/api/planner/stories/feedback', 'POST', { imagen: img1, alcance: 'secuencia', text: 'Cambiá el tema del día' })).json();
      assert.equal(f2.entries.length, 2);
      assert.match(f2.prompt, /Feedback general de la secuencia \(1\)/);
      assert.match(f2.prompt, /Detalles de cada historia \(1\)/);
      assert.match(f2.prompt, /motor-historias\/render\.py" <html>/);
      assert.ok(f1.entries[0].file.endsWith('-planner.json'));
      const counts = (await get('stories?week=' + W)).body.feedback[W];
      assert.equal(counts.pendientes, 2);
      assert.equal(counts.historias[img1], 1);
      // Las notas de historias no se mezclan con el feedback de las piezas.
      assert.ok((await (await fetch(base + '/api/planner/data')).json()).items.every(i => !i.feedback_pending));
      const sent = await (await request('/api/planner/stories/feedback/sent', 'POST', { imagen: img1 })).json();
      assert.ok(sent.entries.every(e => e.estado === 'enviado'));
      assert.match(sent.prompt, /Cambiá el tema del día/); // enviadas: se pueden volver a copiar
      const gone = await (await request('/api/planner/stories/feedback/remove', 'POST', { imagen: img1, file: f1.entries[0].file })).json();
      assert.equal(gone.entries.length, 1);
      assert.equal((await request('/api/planner/stories/feedback/remove', 'POST', { imagen: img1, file: '../semana.json' })).status, 400);
      // Archivos del cliente: la pestaña y Moveable.
      for (const path of ['/historias.js', '/historias.css', '/vendor/moveable.min.js']) assert.equal((await fetch(base + path)).status, 200);
    });
    await t.test('stories: a sequence moves to next week and is shown, edited and scheduled there', async () => {
      const get = async w => (await fetch(base + '/api/planner/stories?week=' + w)).json();
      const seq = (secuencia, revision) => request('/api/planner/stories/seq', 'POST', { semana: W, orig: W, revision, secuencia });
      let rev = (await get(W)).draft.revision;
      assert.equal((await seq({ fecha: day(1), historias: [img1, img2], publicar: 'no', hora: null }, rev)).status, 400, 'that Tuesday already has a sequence');
      assert.equal((await seq({ fecha: '2099-01-01', historias: [img1, img2], publicar: 'no', hora: null }, rev)).status, 400, 'too far');
      const moved = await (await seq({ fecha: day(2), historias: [img1, img2], publicar: 'postiz', hora: '11:00' }, rev)).json();
      assert.equal(moved.semana, N);
      rev = moved.revision;
      const origin = await get(W);
      assert.equal(origin.draft.secuencias[W].fecha, day(2), 'kept in the draft of its origin week');
      const next = await get(N);
      assert.equal(next.entrantes.length, 1);
      assert.equal(next.entrantes[0].semana, W);
      assert.equal(next.entrantes[0].recurso.id, 'r1');
      assert.equal(next.entrantes[0].dia.historias[0].imagen, img1);
      assert.equal((await request('/api/planner/stories/proposal', 'POST', { week: N, revision: rev })).status, 200);
      const prop = await (await request('/api/planner/stories/proposal', 'POST', { week: N, revision: rev })).json();
      const stored = JSON.parse(readFileSync(resolve(state, `proposal-historias-${prop.id}.json`)));
      const a = stored.acciones.find(x => x.imagen === img1);
      assert.equal(a.fecha, day(2));
      assert.equal(a.run, 'historias/semana-prueba');
      assert.deepEqual(stored.dias.filter(d => d.cuenta_planner === 'ig').map(d => d.fecha), [day(1), day(2)]);
      // Vuelve a su lugar.
      rev = (await (await seq({ fecha: W, historias: [img1, img2], publicar: 'no', hora: null }, rev)).json()).revision;
      assert.equal((await get(W)).draft.secuencias?.[W], undefined);
      assert.equal((await get(N)).entrantes.length, 0);
    });
    await t.test('stories: Programar carries unapplied feedback; recursos, voice-over upload and video checks', async () => {
      const get = async w => (await fetch(base + '/api/planner/stories?week=' + w)).json();
      // Una nota sin corregir: la cuenta GET stories y la propuesta la lleva; esa historia espera el feedback.
      await request('/api/planner/stories/feedback', 'POST', { imagen: img1, alcance: 'historia', text: 'Achicá el título' });
      const wk = await get(W);
      const notas = wk.feedback_sin_aplicar[`historias/semana-prueba|${W}`];
      assert.ok(notas.some(n => n.text === 'Achicá el título'));
      let rev = wk.draft.revision;
      rev = (await (await request('/api/planner/stories/seq', 'POST', { semana: W, orig: W, revision: rev, secuencia: { fecha: W, historias: [img1, img2], publicar: 'postiz', hora: '10:00' } })).json()).revision;
      const prop = await (await request('/api/planner/stories/proposal', 'POST', { week: W, revision: rev })).json();
      assert.ok(prop.feedback >= 1);
      // La nota general del día (de la prueba anterior) frena la secuencia entera: las dos esperan.
      assert.equal(prop.esperan, 2);
      assert.match(prop.prompt, /Contenido · feedback sin aplicar/);
      assert.match(prop.prompt, /Achicá el título/);
      const stored = JSON.parse(readFileSync(resolve(state, `proposal-historias-${prop.id}.json`)));
      assert.equal(stored.acciones.find(x => x.imagen === img1).accion, 'espera_feedback');
      assert.equal(stored.acciones.find(x => x.imagen === img2).accion, 'espera_feedback');
      assert.ok(stored.feedback[0].notas.some(n => n.text === 'Achicá el título'));
      // Una propuesta con sólo feedback también se arma.
      rev = (await (await request('/api/planner/stories/seq', 'POST', { semana: W, orig: W, revision: rev, secuencia: { fecha: W, historias: [img1, img2], publicar: 'no', hora: null } })).json()).revision;
      const solo = await (await request('/api/planner/stories/proposal', 'POST', { week: W, revision: rev })).json();
      assert.match(solo.prompt, /sólo feedback de contenido/);
      // Los avisos de las historias en cadena de las últimas 24 h llegan con la semana; los viejos no.
      writeFileSync(resolve(state, 'historias-cadena.json'), JSON.stringify({ avisos: [
        { id: 'viejo', at: new Date(Date.now() - 48 * 3600_000).toISOString(), titulo: 'Viejo', texto: 'ya pasó' },
        { id: 'nuevo', at: new Date().toISOString(), titulo: 'Historia atrasada · hoy · 2', texto: 'sale recién ahora' }] }));
      assert.deepEqual((await get(W)).avisos_cadena.map(a => a.id), ['nuevo']);
      // Recursos listos del motor.
      assert.match((await (await fetch(base + '/api/planner/stories/recursos')).json()).html, /data-recurso/);
      // Subidas crudas: sólo del mismo origen y con un tipo de audio o video.
      const raw = (q, body, type, origin = base) => fetch(base + '/api/planner/stories/media?' + q, { method: 'POST', headers: { 'Content-Type': type, Origin: origin }, body });
      assert.equal((await raw('imagen=' + encodeURIComponent(img1) + '&tipo=audio&name=voz.txt', 'hola', 'text/plain')).status, 415);
      assert.equal((await raw('imagen=' + encodeURIComponent(img1) + '&tipo=audio&name=voz.wav', Buffer.alloc(2000), 'audio/wav', 'https://otra.invalid')).status, 403);
      assert.equal((await raw('imagen=' + encodeURIComponent(img1) + '&tipo=foto&name=x.wav', Buffer.alloc(2000), 'audio/wav')).status, 400);
      const ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
      if (ffmpeg) {
        const sr = 48000, n = sr / 2, wav = Buffer.alloc(44 + n * 2);
        wav.write('RIFF', 0); wav.writeUInt32LE(36 + n * 2, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
        wav.writeUInt32LE(sr, 24); wav.writeUInt32LE(sr * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(n * 2, 40);
        for (let i = 0; i < n; i++) wav.writeInt16LE(Math.round(Math.sin(i / 20) * 8000), 44 + i * 2);
        const up = await (await raw('imagen=' + encodeURIComponent(img1) + '&tipo=audio&name=Mi voz.wav', wav, 'audio/wav')).json();
        assert.match(up.src, /^assets\/audio\/\d{14}-[0-9a-f]{4}-mi-voz\.wav$/);
        assert.ok(Math.abs(up.duracion - 0.5) < 0.05);
        const voces = (await (await fetch(base + '/api/planner/stories/voices?imagen=' + encodeURIComponent(img1))).json()).voces;
        assert.ok(voces.some(v => v.src === up.src && v.en_fuente));
      }
      assert.equal((await request('/api/planner/stories/voice-import', 'POST', { imagen: img1, path: '../semana.json' })).status, 400);
      assert.equal((await request('/api/planner/stories/video-trim', 'POST', { imagen: img1, secuencia: 'assets/videos/nada/%03d.jpg' })).status, 400);
      // Un video de fondo tiene que tener sus cuadros en la carpeta de la semana.
      const src = await (await fetch(base + '/api/planner/stories/source?imagen=' + encodeURIComponent(img1))).json();
      const sinCuadros = await request('/api/planner/stories/edit', 'POST', { imagen: img1, mtime: src.mtime, html: src.html.replace('<img src="assets/fotos/x.jpg"', '<img data-secuencia="assets/videos/nada/%03d.jpg" src="assets/fotos/x.jpg"') });
      assert.equal(sinCuadros.status, 400);
      assert.match((await sinCuadros.json()).error, /video de fondo/);
    });
    await t.test('stories: one Programar sends every week from today, every account and every note left', async () => {
      const get = async (w, cuenta = '') => (await fetch(base + '/api/planner/stories?week=' + w + (cuenta ? '&cuenta=' + cuenta : ''))).json();
      let rev = (await get(W)).draft.revision;
      const seq = async (semana, orig, secuencia, cuenta) => { const r = await (await request('/api/planner/stories/seq', 'POST', { semana, orig, revision: rev, secuencia, ...(cuenta ? { cuenta } : {}) })).json(); rev = r.revision; };
      // El día que ya pasó va a Postiz en el borrador, pero no lleva acción; su nota sí viaja.
      await seq(lunes(P), P, { fecha: P, historias: [imgP], publicar: 'postiz', hora: '10:00' });
      await seq(N, day(1), { fecha: day(1), historias: [img3], publicar: 'postiz', hora: '12:00' });
      await seq(W, S, { fecha: S, historias: [imgS], publicar: 'postiz', hora: '15:00' }, 'segunda');
      await request('/api/planner/stories/feedback', 'POST', { imagen: imgP, text: 'Cambiá el color del título' });
      const wk = await get(N);
      assert.equal(wk.pendiente.desde, HOY);
      const fechas = wk.pendiente.dias.map(d => d.fecha);
      assert.ok(fechas.includes(day(1)) && fechas.includes(S), 'every week and account from today on');
      assert.ok(!fechas.includes(P), 'a day that passed is out');
      assert.ok(wk.pendiente.feedback.some(f => f.fecha === P && f.notas.some(n => n.text === 'Cambiá el color del título')), 'notes of a day that passed travel too');
      assert.equal(wk.pendiente.postiz, 2, 'two days to Postiz: the next week and the other account');
      assert.deepEqual(await (await fetch(base + '/api/planner/stories/pending')).json(), wk.pendiente);
      const prop = await (await request('/api/planner/stories/proposal', 'POST', { revision: rev })).json();
      const stored = JSON.parse(readFileSync(resolve(state, `proposal-historias-${prop.id}.json`)));
      assert.equal(stored.alcance, 'todo_lo_pendiente');
      assert.equal(stored.desde, HOY);
      assert.deepEqual(stored.semanas, [W, N]);
      assert.deepEqual([...stored.cuentas].sort(), ['ig', 'segunda']);
      assert.ok(stored.acciones.length && stored.acciones.every(a => a.fecha >= HOY), 'no action for a day that already passed');
      assert.equal(stored.acciones.find(a => a.imagen === img3).accion, 'agendar');
      assert.deepEqual([stored.acciones.find(a => a.imagen === imgS).accion, stored.acciones.find(a => a.imagen === imgS).cuenta_id], ['agendar', 'ig2']);
      assert.ok(stored.feedback.some(f => f.run === 'historias/semana-pasada'));
      assert.match(prop.prompt, /2 historias a Postiz \(semana del \d+ \S+: 1, semana del \d+ \S+: 1\)/);
      assert.match(prop.prompt, /desde las cuentas de Instagram/);
      assert.match(prop.prompt, /Cambiá el color del título/);
      assert.doesNotMatch(prop.prompt, /@/);
      // Una historia archivada en publicado/ (estado «publicado») cuenta como publicada: no vuelve como «mover».
      mkdirSync(resolve(root, 'publicar/publicado', P.slice(0, 7)), { recursive: true });
      writeFileSync(resolve(root, 'publicar/publicado', P.slice(0, 7), `${P}_1000_historia-pasada.json`), JSON.stringify({ slug: 'historia-pasada', formato: 'story', estado: 'publicado', source_final: resolve(root, imgP), postiz: { posts: [{ red: 'instagram', id: 'p9', date_utc: `${P}T13:00:00Z` }] } }));
      const q = (await get(lunes(P))).cola[imgP];
      assert.deepEqual([q.estado, q.lugar], ['publicada', 'publicado']);
    });
    await t.test('stories: moving a sequence onto a taken day swaps them, also across weeks', async () => {
      const M = addD(N, 7), run3 = resolve(root, 'historias/semana-prueba-3');
      mkdirSync(resolve(run3, 'historias'), { recursive: true });
      for (const f of [`${addD(M, 1)}_1_venta.png`, `${addD(M, 2)}_1_recurso.png`]) writeFileSync(resolve(run3, 'historias', f), Buffer.alloc(64, 5));
      writeFileSync(resolve(run3, 'semana.json'), JSON.stringify({ semana: M, dias: [{ fecha: addD(M, 1), tipo: 'venta', formula: 'V1', historias: [{ imagen: `historias/${addD(M, 1)}_1_venta.png` }] }, { fecha: addD(M, 2), tipo: 'recurso', formula: 'R1', historias: [{ imagen: `historias/${addD(M, 2)}_1_recurso.png` }] }] }));
      const get = async w => (await fetch(base + '/api/planner/stories?week=' + w)).json();
      let rev = (await get(M)).draft.revision;
      const move = async (semana, orig, fecha) => { const r = await request('/api/planner/stories/move', 'POST', { semana, orig, fecha, revision: rev }); const j = await r.json(); if (r.ok) rev = j.revision; return { status: r.status, ...j }; };
      // En la misma semana: el martes al miércoles, y el miércoles pasa al martes.
      const same = await move(M, addD(M, 1), addD(M, 2));
      assert.deepEqual(same.intercambio, { semana: M, orig: addD(M, 2), fecha: addD(M, 1) });
      let d = (await get(M)).draft.secuencias;
      assert.deepEqual([d[addD(M, 1)].fecha, d[addD(M, 2)].fecha], [addD(M, 2), addD(M, 1)]);
      // Entre semanas: la del miércoles (ahora en el martes) va al martes de la semana anterior, y la de ese martes viene
      // con su forma de publicar y su hora.
      const cross = await move(M, addD(M, 2), day(1));
      assert.deepEqual(cross.intercambio, { semana: N, orig: day(1), fecha: addD(M, 1) });
      const prev = (await get(N)).draft.secuencias[day(1)];
      assert.deepEqual([prev.fecha, prev.publicar, prev.hora], [addD(M, 1), 'postiz', '12:00']);
      const next = await get(M);
      assert.equal(next.draft.secuencias[addD(M, 2)].fecha, day(1));
      assert.deepEqual(next.entrantes.map(e => e.orig), [day(1)], 'the swapped one shows in the week it went to');
      // Días pasados: nada se mueve a uno, y una secuencia de un día pasado no manda la otra al pasado.
      assert.equal((await move(M, addD(M, 1), P)).status, 400);
      const old = await move(lunes(P), P, addD(M, 2));
      assert.equal(old.status, 400);
      assert.match(old.error, /no se pueden intercambiar/);
      // Desde la semana a la que llegó también intercambia: todo vuelve a su lugar y el borrador de esa semana queda vacío.
      await move(N, day(1), day(1));
      await move(M, addD(M, 2), addD(M, 2));
      assert.deepEqual((await get(M)).draft.secuencias, {});
      assert.equal((await get(N)).draft.secuencias[day(1)].fecha, day(1));
      rmSync(run3, { recursive: true });
    });
    await t.test('stories: a discarded sequence frees its day, can be recovered and leaves Postiz on the next proposal', async () => {
      mkdirSync(resolve(root, 'publicar/agendado'), { recursive: true });
      const ficha = resolve(root, `publicar/agendado/${day(1)}_1200_historia-martes.json`);
      writeFileSync(ficha, JSON.stringify({ slug: 'historia-martes', formato: 'story', estado: 'agendado', source_final: resolve(root, img3), postiz: { posts: [{ red: 'instagram', id: 'p27', date_utc: `${day(1)}T15:00:00Z` }] } }));
      const get = async w => (await fetch(base + '/api/planner/stories?week=' + w)).json();
      const before = await get(N);
      let rev = before.draft.revision;
      assert.deepEqual(before.pendiente.dias.find(x => x.secuencia === day(1)).acciones, { en_postiz: 1 }, 'already scheduled at that time: nothing pending');
      const seq = async (semana, orig, secuencia) => { const r = await request('/api/planner/stories/seq', 'POST', { semana, orig, revision: rev, secuencia }); const j = await r.json(); if (r.ok) rev = j.revision; return { status: r.status, ...j }; };
      await seq(N, day(1), { fecha: day(1), historias: [img3], publicar: 'postiz', hora: '12:00', descartada: true });
      const wk = await get(N);
      assert.deepEqual(wk.descartadas.map(x => [x.semana, x.orig, x.secuencia.fecha]), [[N, day(1), day(1)]]);
      assert.equal(wk.pendiente.dias.find(x => x.secuencia === day(1)).acciones.descartar, 1);
      // Su día queda libre: otra secuencia (una de un día que ya pasó) puede ir ahí sin intercambiar.
      const mv = await request('/api/planner/stories/move', 'POST', { semana: lunes(P), orig: P, fecha: day(1), revision: rev });
      assert.equal(mv.status, 200);
      const mj = await mv.json(); rev = mj.revision;
      assert.equal(mj.intercambio, null);
      const prop = await (await request('/api/planner/stories/proposal', 'POST', { revision: rev })).json();
      const stored = JSON.parse(readFileSync(resolve(state, `proposal-historias-${prop.id}.json`)));
      assert.deepEqual(stored.acciones.filter(a => a.imagen === img3).map(a => [a.accion, a.cola.slug]), [['descartar', 'historia-martes']]);
      assert.equal(stored.acciones.find(a => a.imagen === imgP).accion, 'ya_publicada', 'a published story is never touched');
      assert.match(prop.prompt, /1 historia de secuencias que descarté sale de Postiz y queda en pausa/);
      // El aplicador del motor, en seco, la pausa con su motivo.
      const dry = spawnSync(process.platform === 'win32' ? 'python' : 'python3', [engineHistorias, 'aplicar', prop.id], { env: { ...process.env, PLANNER_CONFIG: config }, encoding: 'utf8' });
      assert.match(dry.stdout, new RegExp(`→ descartar ${day(1)} · historia 1`));
      assert.match(dry.stdout, /cola\.py pausar historia-martes --motivo descartada en el planner/);
      assert.match(dry.stdout, /Corrida en seco/);
      // Recuperar: con su día ocupado no se puede; libre, vuelve con su hora y sale de Descartadas.
      const busy = await seq(N, day(1), { fecha: day(1), historias: [img3], publicar: 'postiz', hora: '12:00' });
      assert.equal(busy.status, 400);
      assert.match(busy.error, /ya tiene otra secuencia/);
      await seq(lunes(P), P, { fecha: P, historias: [imgP], publicar: 'no', hora: null });
      assert.equal((await seq(N, day(1), { fecha: day(1), historias: [img3], publicar: 'postiz', hora: '12:00' })).status, 200);
      assert.deepEqual((await get(N)).descartadas, []);
      rmSync(ficha);
    });
    await t.test('stories: a newer folder takes only its own days of the week; a newer iteration of a day replaces it', async () => {
      const ficha = resolve(root, `publicar/agendado/${day(1)}_1200_historia-martes.json`);
      writeFileSync(ficha, JSON.stringify({ slug: 'historia-martes', formato: 'story', estado: 'agendado', source_final: resolve(root, img3), postiz: { posts: [{ red: 'instagram', id: 'p27', date_utc: `${day(1)}T15:00:00Z` }] } }));
      const mkRun = (name, secs, dias) => {
        const r = resolve(root, 'historias', name);
        mkdirSync(resolve(r, 'historias'), { recursive: true });
        for (const f of dias) writeFileSync(resolve(r, 'historias', f + '_1_venta.png'), Buffer.alloc(64, 6));
        writeFileSync(resolve(r, 'semana.json'), JSON.stringify({ semana: N, dias: dias.map(f => ({ fecha: f, tipo: 'venta', formula: 'V1', historias: [{ imagen: `historias/${f}_1_venta.png` }] })) }));
        utimesSync(resolve(r, 'semana.json'), secs, secs);
        return r;
      };
      const now = Date.now() / 1000, get = async w => (await fetch(base + '/api/planner/stories?week=' + w)).json();
      const nueva = mkRun('semana-nueva', now + 60, [day(2), day(3)]);
      let wk = await get(N);
      assert.deepEqual(wk.semana.dias.map(d => [d.fecha, d.run.split('/').pop()]), [[day(1), 'semana-prueba-2'], [day(2), 'semana-nueva'], [day(3), 'semana-nueva']]);
      assert.equal(wk.semana.dias[0].historias[0].imagen, img3, 'the older day keeps its own folder paths');
      const pend = await (await fetch(base + '/api/planner/stories/pending')).json();
      const d1 = pend.dias.find(x => x.secuencia === day(1));
      assert.equal(d1.run, 'historias/semana-prueba-2');
      assert.deepEqual(d1.acciones, { en_postiz: 1 }, 'already scheduled: still nothing to do');
      assert.ok(pend.dias.some(x => x.secuencia === day(2)));
      // Otra iteración del miércoles (más nueva) lo reemplaza; el martes y el jueves siguen en sus carpetas.
      const iter = mkRun('semana-iteracion', now + 120, [day(2)]);
      wk = await get(N);
      assert.deepEqual(wk.semana.dias.map(d => [d.fecha, d.run.split('/').pop()]), [[day(1), 'semana-prueba-2'], [day(2), 'semana-iteracion'], [day(3), 'semana-nueva']]);
      for (const r of [nueva, iter]) rmSync(r, { recursive: true });
      rmSync(ficha);
    });
    await t.test('stories: the voice-over script for the teleprompter and a take recorded in the editor', async () => {
      const guion = () => fetch(base + '/api/planner/stories/voice-script?imagen=' + encodeURIComponent(img1)).then(r => r.json());
      assert.deepEqual(await guion(), { texto: '', archivo: `voces/${W}_1_venta.txt` });
      mkdirSync(resolve(run, 'voces'), { recursive: true });
      writeFileSync(resolve(run, `voces/${W}_1_venta.txt`), 'Esto es lo que se ve.\n');
      assert.equal((await guion()).texto, 'Esto es lo que se ve.');
      assert.equal((await request('/api/planner/stories/voice-script', 'POST', { imagen: img1, texto: 'Otra versión\r\n' })).status, 200);
      assert.equal(readFileSync(resolve(run, `voces/${W}_1_venta.txt`), 'utf8'), 'Otra versión\n');
      assert.ok(readdirSync(resolve(run, 'tmp/ediciones')).some(f => f.endsWith(`-${W}_1_venta.txt`)), 'the previous script is kept');
      assert.equal((await request('/api/planner/stories/voice-script', 'POST', { imagen: img1, texto: 5 })).status, 400);
      assert.equal((await request('/api/planner/stories/voice-script', 'POST', { imagen: 'piezas/test/final.mp4', texto: 'x' })).status, 400);
      // Una toma grabada en el editor (toma=1): conserva el silencio del principio (sincro con el video), corta el del
      // final, y una toma muda se rechaza. Hace falta ffmpeg.
      if (spawnSync('ffmpeg', ['-version']).status !== 0) return;
      const lavfi = (out, filtro) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-f', 'lavfi', '-i', 'sine=frequency=300:sample_rate=48000:duration=1.5', '-filter_complex', filtro, '-c:a', 'pcm_s16le', out]); assert.equal(r.status, 0, String(r.stderr)); return readFileSync(out); };
      const raw = (name, body) => fetch(base + '/api/planner/stories/media?' + new URLSearchParams({ imagen: img1, tipo: 'audio', name, toma: '1' }), { method: 'POST', headers: { 'Content-Type': 'audio/wav', Origin: base }, body });
      const toma = await (await raw('toma.wav', lavfi(resolve(root, 'toma.wav'), '[0]atrim=0:0.5[a];[0]atrim=0:2[b];[a][1][b]concat=n=3:v=0:a=1'))).json();
      assert.match(toma.src, /^assets\/audio\/\d{14}-[0-9a-f]{4}-toma\.wav$/);
      assert.ok(toma.duracion > 2.2 && toma.duracion < 2.6, 'leading silence kept, trailing silence cut: ' + toma.duracion);
      const muda = await raw('toma.wav', lavfi(resolve(root, 'muda.wav'), '[0]atrim=0:2'));
      assert.equal(muda.status, 400);
      assert.match((await muda.json()).error, /muda/);
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
