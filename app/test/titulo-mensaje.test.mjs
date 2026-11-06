// Título de las conversaciones que nacen de un mensaje copiado del planner: «[Etiqueta] qué se está haciendo».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { conTitulo, diasMensaje, editarDesc, nombreMensaje, tieneTitulo, tituloMensaje } from '../src/titulo-mensaje.ts';
import { proposalTitle } from '../src/publication-planner.ts';

const hook = fileURLToPath(new URL('../../.claude/hooks/titulo_desde_planner.py', import.meta.url));
const dir = u => fileURLToPath(new URL(u, import.meta.url));
const tituloDelHook = (prompt, transcript) => {
  const r = spawnSync('python3', [hook], { input: JSON.stringify({ prompt, transcript_path: transcript }), encoding: 'utf8', env: { ...process.env, TITULO_PLANNER_ESPERA: '0' } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput.sessionTitle : null;
};
// Las funciones de ui.js, como las carga el navegador.
const ui = readFileSync(new URL('../public/ui.js', import.meta.url), 'utf8');
const navegador = vm.createContext({});
vm.runInContext(ui.slice(ui.indexOf('const msgCortar'), ui.indexOf('// ---------- paleta ⌘K')) + '\nthis.fn = { tituloMensaje, sinTituloMensaje, nombreMensaje, diasMensaje };', navegador);

test('el título es una línea corta, sin @ ni ids largos de más', () => {
  assert.equal(tituloMensaje('Agenda', 'Cambio de horario de «X»'), '[Agenda] Cambio de horario de «X»');
  assert.equal(tituloMensaje('Agenda', 'desde @micuenta\ny otra línea'), '[Agenda] desde micuenta');
  const largo = tituloMensaje('Feedback', 'palabra '.repeat(40));
  assert.ok([...largo].length <= 100 && largo.endsWith('…'), largo);
  assert.equal(nombreMensaje('Un título bastante largo que no entra entero en la barra de conversaciones', 30), '«Un título bastante largo que…»');
  assert.equal(conTitulo('[Agenda] X', 'Cuerpo'), '[Agenda] X\n\nCuerpo');
  assert.ok(tieneTitulo('[Agenda] X\n\nCuerpo'));
  assert.ok(!tieneTitulo('Confirmo la propuesta [abc] de hoy'));
});

test('el rango de días se lee como se diría', () => {
  assert.equal(diasMensaje(['2026-11-06']), 'del 6 nov');
  assert.equal(diasMensaje(['2026-11-08', '2026-11-06', '2026-11-06T10:00']), 'del 6 al 8 nov');
  assert.equal(diasMensaje(['2026-10-30', '2026-11-02']), 'del 30 oct al 2 nov');
  assert.equal(diasMensaje([]), '');
});

test('la propuesta del tablero dice lo que hace', () => {
  const fb = (title, ...tipos) => ({ title, video: 'piezas/a.mp4', notes: tipos.map(tipo => ({ tipo })) });
  const t = proposalTitle;
  assert.equal(t([{ accion: 'move', title: 'Mi reel' }], []), '[Agenda] Cambio de horario de «Mi reel»');
  assert.equal(t([{ accion: 'schedule', title: 'A' }], []), '[Agenda] Agendar «A»');
  assert.equal(t([{ accion: 'schedule', title: 'A' }, { accion: 'schedule', title: 'B' }, { accion: 'schedule', title: 'C' }], []), '[Agenda] Agendar 3 piezas');
  assert.equal(t([{ accion: 'unschedule', title: 'A' }], []), '[Agenda] Sacar de la agenda «A»');
  assert.equal(t([{ accion: 'pause', title: 'A' }], []), '[Agenda] Pausar «A»');
  assert.equal(t([{ accion: 'schedule', title: 'A' }, { accion: 'schedule', title: 'B' }, { accion: 'move', title: 'C' }], []), '[Agenda] Agendar 2 piezas y cambio de horario de 1');
  assert.equal(t([{ accion: 'schedule', title: 'A' }, { accion: 'move', title: 'B' }, { accion: 'pause', title: 'C' }], []), '[Agenda] Cambios de agenda en 3 piezas');
  assert.equal(t([{ accion: 'move', title: 'A' }], [fb('B', 'nota')]), '[Agenda] Cambio de horario de «A» y corregir 1 pieza');
  assert.equal(t([], [fb('Mi reel', undefined)]), '[Feedback] Editar el video «Mi reel»');
  assert.equal(t([], [fb('Mi reel', 'copy')]), '[Feedback] Cambiar el copy de «Mi reel»');
  assert.equal(t([], [fb('A', undefined), fb('B', undefined)]), '[Feedback] Corregir 2 piezas');
});

test('el navegador arma los títulos igual que el servidor', () => {
  const { fn } = navegador;
  for (const [e, d] of [['Agenda', 'Cambio de horario de «X»'], ['Feedback', 'desde @micuenta\notra'], ['Producción', 'palabra '.repeat(40)]])
    assert.equal(fn.tituloMensaje(e, d), tituloMensaje(e, d));
  for (const n of ['Corto', 'Un título bastante largo que no entra entero en la barra de conversaciones del costado', '', null])
    assert.equal(fn.nombreMensaje(n), nombreMensaje(n));
  for (const f of [['2026-11-06'], ['2026-11-08', '2026-11-06T10:00'], ['2026-10-30', '2026-11-02'], []])
    assert.equal(fn.diasMensaje(f), diasMensaje(f));
  assert.equal(fn.sinTituloMensaje('[Feedback] Corregir\n\nFeedback desde el planner [nota]\n\nMás'), 'Feedback desde el planner [nota]\n\nMás');
  assert.equal(fn.sinTituloMensaje('Sin título\n\nCuerpo'), 'Sin título\n\nCuerpo');
});

test('lo que arma Publicar ahora en el navegador sale titulado', () => {
  const src = readFileSync(new URL('../public/planner.js', import.meta.url), 'utf8');
  const ctx = vm.createContext({ ...navegador.fn, ed: { nets: ['instagram'], accounts: {} }, acctOf: () => null, cuentaNombre: () => '', netName: () => 'Instagram', collab: () => [], whenLabel: () => '' });
  vm.runInContext(src.slice(src.indexOf('function publicarAhoraPrompt('), src.indexOf('function wireDrawer(')), ctx);
  const msg = ctx.publicarAhoraPrompt({ id: 'queue:a', slug: 'a', title: 'Mi reel', status: 'ready', sidecar: 'publicar/inbox/a.json' });
  assert.equal(tituloDelHook(msg), '[Agenda] Publicar ahora «Mi reel»');
  assert.match(msg, /Ficha: publicar\/inbox\/a\.json/);
});

test('el hook acepta todo lo que el planner puede poner de título, y sólo al abrir la conversación', () => {
  const etiquetas = new Set();
  for (const [carpeta, ext] of [['../src/', '.ts'], ['../public/', '.js']])
    for (const f of readdirSync(dir(carpeta)).filter(x => x.endsWith(ext)))
      for (const m of readFileSync(dir(carpeta + f), 'utf8').matchAll(/tituloMensaje\(([^,()]+),/g))
        for (const q of m[1].matchAll(/'([^']+)'/g)) etiquetas.add(q[1]);
  assert.ok(etiquetas.has('Agenda') && etiquetas.has('Feedback'), [...etiquetas].join(', '));
  for (const e of etiquetas) assert.equal(tituloDelHook(`${tituloMensaje(e, 'Algo que se hace')}\n\nCuerpo`), `[${e}] Algo que se hace`);
  assert.equal(tituloDelHook('Un mensaje cualquiera\n\nCuerpo'), null, 'a message without a planner title passes through');
  // Pegado en una conversación que ya existe, no la renombra.
  const tmp = mkdtempSync(resolve(tmpdir(), 'titulo-')), transcript = resolve(tmp, 'sesion.jsonl');
  try {
    writeFileSync(transcript, JSON.stringify({ type: 'summary' }) + '\n');
    assert.equal(tituloDelHook('[Agenda] Algo\n\nCuerpo', transcript), '[Agenda] Algo', 'first message: it gets the title');
    writeFileSync(transcript, JSON.stringify({ type: 'user', message: { content: 'hola' } }) + '\n');
    assert.equal(tituloDelHook('[Agenda] Algo\n\nCuerpo', transcript), null);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('el título no se confunde con el cuerpo de editarDesc', () => {
  assert.equal(editarDesc('X', true, true, 'el video'), 'Editar el video y el copy de «X»');
  assert.equal(editarDesc('X', true, false, 'el video'), 'Cambiar el copy de «X»');
  assert.equal(editarDesc('X', false, true, 'el carrusel'), 'Editar el carrusel «X»');
});
