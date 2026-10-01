// Tests des plans de salle (js/salles.js) : disposition des îlots, conversion de l'ancien format, identifiants des places.
import { disposition, normTable, borner, places, LARGEUR, HAUTEUR } from '../js/salles.js';

export const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const eq = (a, b, msg = '') => { const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) throw new Error(`${msg} attendu ${B}, obtenu ${A}`); };

test('Disposition des îlots : face à face ou en ligne', () => {
  eq([1, 2, 4, 5, 8].map(p => disposition({ places: p })), [{ cols: 1, rows: 1 }, { cols: 2, rows: 1 }, { cols: 2, rows: 2 }, { cols: 3, rows: 2 }, { cols: 4, rows: 2 }]);
  eq(disposition({ places: 4, ligne: true }), { cols: 4, rows: 1 });
});
test('Ancien plan (grille, vertical) converti en centre + angle', () => {
  eq(normTable({ id: 'a', x: 1, y: 1, places: 4, vertical: false }), { id: 'a', places: 4, ligne: false, cx: 2, cy: 2, angle: 0 });
  eq(normTable({ id: 'b', x: 0, y: 0, places: 6, vertical: true }), { id: 'b', places: 6, ligne: false, cx: 1, cy: 1.5, angle: 90 });
});
test('Un îlot glissé reste dans la salle', () => {
  eq(borner({ cx: -3, cy: 50 }), { cx: 0.5, cy: HAUTEUR - 0.5 });
  eq(borner({ cx: LARGEUR / 2 + 0.13, cy: 2 }).cx, LARGEUR / 2 + 0.25, 'arrondi au quart d’unité');
});
test('Places numérotées en lecture (haut → bas, gauche → droite) avec identifiants stables', () => {
  const salle = { type: 'ilots', tables: [{ id: 'b', cx: 6, cy: 1, angle: 45, places: 2 }, { id: 'a', cx: 1, cy: 1, angle: 0, places: 1 }] };
  eq(places(salle).map(p => p.id), ['a-0', 'b-0', 'b-1']);
  eq(places({ type: 'rangees', rangs: 1, colonnes: 2, parTable: 2 }).map(p => p.id), ['r-0-0-0', 'r-0-0-1', 'r-0-1-0', 'r-0-1-1']);
});
