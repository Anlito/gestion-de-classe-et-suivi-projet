// Tests de la fusion entre appareils (js/sync.js). Données FICTIVES.
import { mergeData, TOMB_MAX_DAYS } from '../js/sync.js';

export const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const eq = (a, b, msg = '') => { const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) throw new Error(`${msg} attendu ${B}, obtenu ${A}`); };

const NOW = Date.UTC(2026, 9, 1);
// Dates des enregistrements : quelques millisecondes avant NOW (t = 1, 2, 3… dans les tests).
const T = t => NOW - 1000 + t;
const rec = (id, t, extra = {}) => ({ id, updatedAt: T(t), ...extra });
const tomb = (store, id, at) => ({ id: store + ':' + id, store, recId: id, at: T(at), updatedAt: T(at) });
const data = (stores, tombs = []) => ({ stores, tombs });

test('Premier envoi : tout part sur Drive, rien ne change sur l’appareil', () => {
  const m = mergeData(data({ students: [rec('a', 1)] }), null, NOW);
  eq([m.remoteChanged, m.toLocal.puts, m.toLocal.dels, m.merged.stores.students.length], [true, {}, [], 1]);
});
test('Données identiques des deux côtés : rien à faire', () => {
  const d = data({ students: [rec('a', 5)], meta: [rec('trimester', 3, { value: 1 })] });
  const m = mergeData(d, JSON.parse(JSON.stringify(d)), NOW);
  eq([m.remoteChanged, m.toLocal.puts, m.toLocal.dels], [false, {}, []]);
});
test('Modifié sur l’autre appareil (plus récent) : reçu ici', () => {
  const m = mergeData(data({ students: [rec('a', 1, { nom: 'ANCIEN' })] }), data({ students: [rec('a', 2, { nom: 'NOUVEAU' })] }), NOW);
  eq([m.toLocal.puts.students[0].nom, m.remoteChanged, m.stats.recus], ['NOUVEAU', false, 1]);
});
test('Modifié ici (plus récent) : envoyé, rien ne change ici', () => {
  const m = mergeData(data({ students: [rec('a', 3, { nom: 'ICI' })] }), data({ students: [rec('a', 2, { nom: 'LÀ-BAS' })] }), NOW);
  eq([m.toLocal.puts, m.remoteChanged, m.merged.stores.students[0].nom, m.stats.envoyes], [{}, true, 'ICI', 1]);
});
test('Ajouts des deux côtés : les deux sont gardés', () => {
  const m = mergeData(data({ notes: [rec('n1', 1)] }), data({ notes: [rec('n2', 1)] }), NOW);
  eq([m.merged.stores.notes.map(r => r.id).sort(), m.toLocal.puts.notes.map(r => r.id), m.remoteChanged], [['n1', 'n2'], ['n2'], true]);
});
test('Supprimé sur l’autre appareil après la dernière modification : supprimé ici', () => {
  const m = mergeData(data({ students: [rec('a', 5)] }), data({ students: [] }, [tomb('students', 'a', 6)]), NOW);
  eq([m.toLocal.dels, m.merged.stores.students.length, m.toLocal.tombs.length], [[{ store: 'students', id: 'a' }], 0, 1]);
});
test('Supprimé ici : retiré de Drive, pas remis ici', () => {
  const m = mergeData(data({ students: [] }, [tomb('students', 'a', 6)]), data({ students: [rec('a', 5)] }), NOW);
  eq([m.toLocal.puts, m.remoteChanged, m.merged.stores.students.length], [{}, true, 0]);
});
test('Modifié ailleurs APRÈS la suppression (ou « Annuler ») : l’enregistrement est gardé', () => {
  const m = mergeData(data({ students: [] }, [tomb('students', 'a', 6)]), data({ students: [rec('a', 7)] }), NOW);
  eq([m.toLocal.puts.students.map(r => r.id), m.merged.stores.students.length], [['a'], 1]);
});
test('Traces de suppression de plus de 180 jours oubliées', () => {
  const vieux = NOW - (TOMB_MAX_DAYS + 1) * 864e5;
  const old = { id: 'students:x', store: 'students', recId: 'x', at: vieux, updatedAt: vieux };
  const m = mergeData(data({ students: [] }, [old]), data({ students: [] }), NOW);
  eq([m.merged.tombs.length, m.toLocal.dels], [0, [{ store: 'effacements', id: 'students:x' }]]);
});
test('Photo plus récente ailleurs : image à télécharger', () => {
  const m = mergeData(data({ photos: [rec('p1', 1)] }), data({ photos: [rec('p1', 2), rec('p2', 1)] }), NOW);
  eq(m.photosToDownload.sort(), ['p1', 'p2']);
});
test('Réglages (meta) fusionnés comme le reste', () => {
  const m = mergeData(data({ meta: [rec('trimester', 1, { value: 1 })] }), data({ meta: [rec('trimester', 2, { value: 2 })] }), NOW);
  eq(m.toLocal.puts.meta[0].value, 2);
});
test('Égalité de date : la version de cet appareil est gardée, sans aller-retour', () => {
  const m = mergeData(data({ students: [rec('a', 4, { nom: 'X' })] }), data({ students: [rec('a', 4, { nom: 'Y' })] }), NOW);
  eq([m.toLocal.puts, m.remoteChanged], [{}, false]);
});
