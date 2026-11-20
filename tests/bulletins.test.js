import { nextLevel, stateOf, trimesterRange, inRange, average, validNote, recordId, FAMILIES } from '../js/bulletins.js';
export const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const eq = (a, b) => { if (a !== b) throw Error(`${a} ≠ ${b}`); };
const all = v => Object.fromEntries(FAMILIES.map(f => [f.k, v]));

test('Bulletins : une case fait défiler Point fort, Correct, À améliorer puis vide', () => {
  eq(nextLevel(undefined), 'pos'); eq(nextLevel('pos'), 'mid'); eq(nextLevel('mid'), 'neg'); eq(nextLevel('neg'), null);
});
test('Bulletins : élève prêt quand les sept critères sont renseignés', () => {
  eq(stateOf(null), 'todo');
  eq(stateOf({ presence: 'normale', levels: {} }), 'todo');
  eq(stateOf({ presence: 'normale', levels: { travail: 'pos' } }), 'part');
  eq(stateOf({ presence: 'normale', levels: all('mid') }), 'ok');
});
test('Bulletins : présence partielle, critères facultatifs', () => {
  eq(stateOf({ presence: 'partielle', levels: {} }), 'todo');
  eq(stateOf({ presence: 'partielle', levels: { effort: 'neg' } }), 'ok');
  eq(stateOf({ presence: 'partielle', levels: {}, info: 'Présent le matin seulement' }), 'ok');
});
test('Bulletins : élève dispensé hors grille, même avec des cases remplies', () => {
  eq(stateOf({ presence: 'dispense', levels: all('pos') }), 'disp');
});
test('Bulletins : période du trimestre d’après les dates de début', () => {
  const s = { 1: '2026-09-01', 2: '2026-12-01' };
  const t1 = trimesterRange(s, 1), t2 = trimesterRange(s, 2), t3 = trimesterRange(s, 3);
  eq(inRange('2026-11-30', t1), true); eq(inRange('2026-12-01', t1), false);
  eq(inRange('2026-12-01', t2), true); eq(inRange('2027-05-01', t2), true);
  eq(inRange('2026-10-01', t3), false); eq(inRange('', t1), false);
  eq(inRange('2020-01-01', trimesterRange({}, 1)), true);
});
test('Bulletins : moyenne des notes de projet au dixième', () => {
  eq(average([]), null); eq(average([12.5, 15]), 13.8); eq(average([null, 14]), 14);
});
test('Bulletins : note saisie entre 0 et 20, virgule acceptée', () => {
  eq(validNote(''), null); eq(validNote('14,25'), 14.3); eq(validNote(0), 0);
  let refused = false; try { validNote('21'); } catch { refused = true; } eq(refused, true);
});
test('Bulletins : même fiche d’un appareil à l’autre (identifiant fixe)', () => {
  eq(recordId('e1', '2026-2027', 2), 'bul:e1:2026-2027:2');
});
