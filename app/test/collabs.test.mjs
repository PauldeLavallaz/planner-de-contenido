import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../public/planner.js', import.meta.url), 'utf8');

// Lo que sale en collab con una cuenta de la marca elegida también se ve en esa marca.
function scope({ perfil = 'a', apagadas = [] } = {}) {
  const cuentas = [{ net: 'instagram', id: 'ig', profile: 'cuenta_a', key: 'instagram:ig' }, { net: 'tiktok', id: 'tt', profile: 'cuenta_tt', key: 'tiktok:tt' }];
  const ctx = { perfilActual: perfil, cuentasDelPerfil: () => cuentas, cuentasSel: () => new Set(cuentas.map(a => a.key).filter(k => !apagadas.includes(k))),
    calendarDay: i => i.when, nets: i => i.nets, collab: i => i.collab, enPerfil: () => false };
  vm.createContext(ctx);
  // const y let no quedan en el contexto: se exponen al final.
  vm.runInContext(source.slice(source.indexOf('let verCollabs = true;'), source.indexOf('function collabTag(')) + ';Object.assign(this, { collabsDelPerfil, soloCollab, apagar: () => { verCollabs = false; } });', ctx);
  return ctx;
}
const pieza = { when: '2026-11-03', nets: ['instagram', 'tiktok'], collab: ['cuenta_a'] };

test('una pieza de otra marca en collab con la cuenta se ve en esta marca', () => {
  assert.deepEqual(scope().collabsDelPerfil(pieza).map(a => a.profile), ['cuenta_a']);
  assert.equal(scope().soloCollab(pieza), true);
});

test('no se ve con el interruptor apagado, la cuenta apagada o sin nada que la ate a la marca', () => {
  const off = scope(); off.apagar();
  assert.equal(off.collabsDelPerfil(pieza).length, 0);
  assert.equal(scope({ apagadas: ['instagram:ig'] }).collabsDelPerfil(pieza).length, 0);
  assert.equal(scope({ perfil: 'all' }).collabsDelPerfil(pieza).length, 0);
  assert.equal(scope().collabsDelPerfil({ ...pieza, when: null }).length, 0);
  assert.equal(scope().collabsDelPerfil({ ...pieza, trial: true }).length, 0);
  assert.equal(scope().collabsDelPerfil({ ...pieza, nets: ['tiktok'] }).length, 0);
  assert.equal(scope().collabsDelPerfil({ ...pieza, collab: ['otra'] }).length, 0);
});
