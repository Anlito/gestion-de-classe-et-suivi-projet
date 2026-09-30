// Tests des règles de l'emploi du temps (js/planning.js) qui ne dépendent pas des données enregistrées.
// Noms d'établissements et de classes FICTIFS.
import { initialesFrom, matchKey, suggestClass, diffCours, defaultRole } from '../js/planning.js';

export const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const eq = (a, b, msg = '') => { const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) throw new Error(`${msg} attendu ${B}, obtenu ${A}`); };

test('Initiales du collège', () => {
  eq(initialesFrom('COLLEGE DES TILLEULS'), 'T');
  eq(initialesFrom('COLLEGE PONT NEUF'), 'PN');
  eq(initialesFrom('Collège Jean de la Fontaine'), 'JF');
  eq(initialesFrom('LYCEE SAINT EXUPERY'), 'SE');
});
test('Clé de rapprochement des classes', () => {
  eq(matchKey('4 E'), '4E');
  eq(matchKey('4e E'), '4E');
  eq(matchKey('4e E PN', 'PN'), '4E');
  eq(matchKey('PN 4e E', 'PN'), '4E');
  eq(matchKey('[3C2D1]'), '3C2D1');
  eq(matchKey('3C2D1 PN', 'PN'), '3C2D1');
  eq(matchKey('4E'), '4E');
  eq(matchKey('6e SEGPA'), '6SEGPA');
});
test('Proposition de classe : préfère celle qui porte les initiales du collège', () => {
  const classes = [{ id: 'a', name: '4e E JF' }, { id: 'b', name: '4e E PN' }, { id: 'c', name: '3C1 PN' }];
  eq(suggestClass('4 E', 'PN', classes).id, 'b');
  eq(suggestClass('4E', 'JF', classes).id, 'a');
  eq(suggestClass('[3C1]', 'PN', classes).id, 'c');
  eq(suggestClass('5 B', 'PN', classes), null);
});
test('Rôle des matières par défaut', () => {
  eq(['TECHNOLOGIE', 'SCIENCES TECHNOLOGIE', 'VIE DE CLASSE', 'COORDINATION/CONCERTATION', 'PHOTO DE CLASSE'].map(defaultRole),
    ['suivi', 'suivi', 'appel', 'masque', 'masque']);
});
const c = (date, debut, classe, extra = {}) => ({ date, debut, fin: '10:00', classe, salle: 'T1', matiere: 'TECHNOLOGIE', statut: 'normal', statutLabel: '', ...extra });
test('Réimportation : ajouts, modifications, suppressions, inchangés', () => {
  const old = [c('2026-09-07', '08:15', '4 E', { id: 1 }), c('2026-09-07', '09:11', '4 E', { id: 2 }), c('2026-09-08', '08:15', '5 C', { id: 3 })];
  const now = [c('2026-09-07', '08:15', '4E'), c('2026-09-07', '09:11', '4 E', { statut: 'annule', statutLabel: 'Annulé' }), c('2026-09-09', '08:15', '5 C')];
  const d = diffCours(old, now);
  eq([d.inchanges, d.modifs.length, d.ajouts.length, d.suppressions.length], [1, 1, 1, 1]);
  eq(d.modifs[0].old.id, 2, 'le cours modifié garde son identifiant');
  eq(d.suppressions[0].id, 3);
});
test('Réimportation : deux cours au même créneau ne se confondent pas', () => {
  const old = [c('2026-09-07', '08:15', '', { id: 1, matiere: 'A' }), c('2026-09-07', '08:15', '', { id: 2, matiere: 'A' })];
  const d = diffCours(old, [c('2026-09-07', '08:15', '', { matiere: 'A' }), c('2026-09-07', '08:15', '', { matiere: 'A' })]);
  eq([d.inchanges, d.ajouts.length, d.suppressions.length], [2, 0, 0]);
});
