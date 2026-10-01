// Tests des plans de salle (js/salles.js) : tailles d'îlots, chevauchements, identifiants des places.
import { tailleIlot, placeLibre, places, LARGEUR } from '../js/salles.js';

export const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const eq = (a, b, msg = '') => { const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) throw new Error(`${msg} attendu ${B}, obtenu ${A}`); };

test('Taille des îlots selon le nombre de places', () => {
  eq([1, 2, 4, 6, 8].map(p => tailleIlot({ places: p })), [{ w: 1, h: 1 }, { w: 2, h: 1 }, { w: 2, h: 2 }, { w: 3, h: 2 }, { w: 4, h: 2 }]);
  eq(tailleIlot({ places: 6, vertical: true }), { w: 2, h: 3 });
});
test('Un îlot ne chevauche pas un autre ni ne sort de la salle', () => {
  const salle = { type: 'ilots', tables: [{ id: 'a', x: 0, y: 0, places: 4 }] };
  eq(placeLibre(salle, { id: 'b', x: 1, y: 1, places: 4 }), false);
  eq(placeLibre(salle, { id: 'b', x: 2, y: 0, places: 4 }), true);
  eq(placeLibre(salle, { id: 'b', x: LARGEUR - 1, y: 0, places: 4 }), false);
  eq(placeLibre(salle, { id: 'a', x: 1, y: 0, places: 4 }), true, 'il peut se déplacer sur sa propre place');
});
test('Places numérotées en lecture (haut → bas, gauche → droite) avec identifiants stables', () => {
  const salle = { type: 'ilots', tables: [{ id: 'b', x: 4, y: 0, places: 2 }, { id: 'a', x: 0, y: 0, places: 1 }] };
  eq(places(salle).map(p => p.id), ['a-0', 'b-0', 'b-1']);
  eq(places({ type: 'rangees', rangs: 1, colonnes: 2, parTable: 2 }).map(p => p.id), ['r-0-0-0', 'r-0-0-1', 'r-0-1-0', 'r-0-1-1']);
});
