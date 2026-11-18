// Tests de la grille PAP (js/pap-items.js) : identifiants stables et uniques, niveau d'une classe.
import { SECTIONS, ITEMS, NIVEAUX, niveauDe } from '../js/pap-items.js';

export const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const eq = (a, b, msg = '') => { const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) throw new Error(`${msg} attendu ${B}, obtenu ${A}`); };

test('PAP : grille officielle complète (50 items, identifiants uniques)', () => {
  const ids = SECTIONS.flatMap(s => s.items.map(i => i.id));
  eq(ids.length, 50); eq(new Set(ids).size, ids.length); eq(ITEMS.size, ids.length);
});
test('PAP : quatre niveaux du collège', () => eq(NIVEAUX, ['6e', '5e', '4e', '3e']));
test('PAP : niveau déduit de la classe', () => {
  eq(niveauDe({ name: '5e B' }), '5e'); eq(niveauDe({ name: '4E - PR' }), '4e'); eq(niveauDe({ level: '3e', name: 'Classe X' }), '3e'); eq(niveauDe({ name: 'ULIS' }), null);
});
