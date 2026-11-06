// La hora de la primera historia de cada día de la semana, de `historias.horas` en la config.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { storyHours } from '../src/historias.ts';

test('historias.horas acepta el número o el nombre del día y descarta lo que no es una hora', () => {
  assert.deepEqual(storyHours({ 1: '14:00', martes: '14:15', 'miércoles': '14:45', 'Sábado': '15:30', 7: '16:00', 3: '25:00', viernes: 'tarde', feriado: '10:00' }),
    { 0: '16:00', 1: '14:00', 2: '14:15', 3: '14:45', 6: '15:30' });
  assert.deepEqual(storyHours(undefined), {});
  assert.deepEqual(storyHours(['14:00']), {});
});

test('el navegador usa la hora del día de la semana y, si no está, 15:00', () => {
  const source = readFileSync(new URL('../public/historias.js', import.meta.url), 'utf8');
  const ctx = vm.createContext({ fromMin: m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`, toMin: h => Number(h.slice(0, 2)) * 60 + Number(h.slice(3)) });
  vm.runInContext(source.slice(source.indexOf("const STORY_DEFAULT_HOUR"), source.indexOf('let stories')) + "\nlet stories = { data: { horas: { 1: '14:00', 6: '15:30' } } }; this.f = { storyDefaultHour, storyTime };", ctx);
  assert.equal(ctx.f.storyDefaultHour('2026-11-09'), '14:00', 'Monday');
  assert.equal(ctx.f.storyDefaultHour('2026-11-14'), '15:30', 'Saturday');
  assert.equal(ctx.f.storyDefaultHour('2026-11-11'), '15:00', 'a day without its hour');
  assert.equal(ctx.f.storyTime(null, 2, '2026-11-14'), '15:34', 'each story two minutes after the previous one');
  assert.equal(ctx.f.storyTime('10:00', 1, '2026-11-14'), '10:02', 'the hour chosen for the day wins');
});
