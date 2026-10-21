// El guardado del detalle de una pieza: un borrador con una hora que ya pasó se guarda igual (la propuesta la frena
// después), y escribir la hora no redibuja el panel (perder el foco reemplazaba Guardar entre el mousedown y el click).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../public/planner.js', import.meta.url), 'utf8');

test('saving a draft with a past time preserves account edits', () => {
  let saved;
  const ctx = { busy: false, saveError: false, editable: () => true, when: () => null, ch: () => null,
    nets: () => ['instagram'], collab: () => [], accounts: () => ({}), version: () => null,
    snapshot: () => {}, applyChange: (_, next) => { saved = next; }, queueSave: () => {}, render: () => {}, toast: () => {}, undo: () => {},
    nowLocal: () => '2026-10-20T20:45' };
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('function commit('), source.indexOf('// ---------- horarios ----------')), ctx);
  assert.equal(ctx.commit({}, { when: '2026-10-20T18:30', accounts: { instagram: 'segunda' } }), true);
  assert.equal(saved.accounts.instagram, 'segunda');
  assert.equal(saved.when, '2026-10-20T18:30');
});

test('typing then blurring the time keeps the Save button DOM intact', () => {
  let refreshed = 0;
  const ctx = { t: { value: '21:15' }, ed: { date: '2026-10-20', time: '18:30' }, parseTime: v => /^\d{2}:\d{2}$/.test(v) ? v : null,
    dateAdd: () => '', todayStr: () => '', toast: () => {}, refresh: () => { refreshed++; } };
  vm.createContext(ctx);
  const start = source.indexOf('    t.oninput = () =>');
  assert.ok(start > 0, 'the time field updates on input');
  const end = source.indexOf('\n  }', start);
  vm.runInContext(source.slice(start, end), ctx);
  ctx.t.oninput(); ctx.t.onchange();
  assert.equal(ctx.ed.time, '21:15'); assert.equal(refreshed, 0);
});

test('the week being looked at survives a reload through the address', () => {
  const ctx = { location: { hash: '#semana=2026-10-29' }, monday: d => d === '2026-10-29' ? '2026-10-26' : d };
  vm.createContext(ctx);
  const start = source.indexOf('const weekFromUrl');
  vm.runInContext(source.slice(start, source.indexOf('\n', start)).replace('const weekFromUrl', 'globalThis.weekFromUrl'), ctx);
  assert.equal(ctx.weekFromUrl(), '2026-10-26');
  ctx.location.hash = '';
  assert.equal(ctx.weekFromUrl(), null);
});
