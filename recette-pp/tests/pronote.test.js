// Tests de la mise à jour par lien Pronote (js/pronote-lien.js) et des identifiants stables. Liens FICTIFS.
import { extractLien, extractRelais, dernierSoir, aFaire } from '../js/pronote-lien.js';
import { stableId } from '../js/planning.js';

export const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const eq = (a, b, msg = '') => { const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) throw new Error(`${msg} attendu ${B}, obtenu ${A}`); };
const LIEN = 'https://0000000x.index-education.net/pronote/ical/mesinformations.ics?icalsecurise=ABCDEF0123&version=2026.1.1&param=FEDCBA';
const RELAIS = 'https://script.google.com/macros/s/AKfycbFAUX_relais-123/exec';

test('Lien Pronote collé tel quel', () => eq(extractLien(LIEN), LIEN));
test('Lien Pronote avec espaces et texte autour', () => eq(extractLien('Mon lien : ' + LIEN.slice(0, 40) + '\n' + LIEN.slice(40) + ' '), LIEN));
test('Autre adresse refusée comme lien Pronote', () => { eq(extractLien('https://exemple.fr/agenda.ics'), null); eq(extractLien(''), null); });
test('Adresse du relais reconnue', () => { eq(extractRelais(' ' + RELAIS + ' '), RELAIS); eq(extractRelais('https://script.google.com/macros/s/AKfy/dev'), null); });
test('Dernier soir : avant 18 h → la veille 18 h', () => eq(dernierSoir(new Date(2026, 9, 5, 10, 0)).getTime(), new Date(2026, 9, 4, 18, 0).getTime()));
test('Dernier soir : après 18 h → le jour même 18 h', () => eq(dernierSoir(new Date(2026, 9, 5, 19, 30)).getTime(), new Date(2026, 9, 5, 18, 0).getTime()));
test('Mise à jour à faire : jamais faite, ou avant le dernier soir', () => {
  const now = new Date(2026, 9, 5, 19, 0);
  eq(aFaire({ lien: LIEN }, now), true);
  eq(aFaire({ lien: LIEN, lienAt: new Date(2026, 9, 5, 17, 0).toISOString() }, now), true);
  eq(aFaire({ lien: LIEN, lienAt: new Date(2026, 9, 5, 18, 30).toISOString() }, now), false);
  eq(aFaire({ lienAt: null }, now), false);
});
test('Matin : la mise à jour d’hier soir suffit', () => eq(aFaire({ lien: LIEN, lienAt: new Date(2026, 9, 4, 20, 0).toISOString() }, new Date(2026, 9, 5, 7, 30)), false));
test('Identifiant stable : même cours → même identifiant, cours différent → différent', () => {
  const a = stableId('c', 'etab1', '2026-10-05|08:00|3A|TECHNOLOGIE');
  eq(stableId('c', 'etab1', '2026-10-05|08:00|3A|TECHNOLOGIE'), a);
  if (stableId('c', 'etab1', '2026-10-05|09:00|3A|TECHNOLOGIE') === a) throw new Error('collision');
  if (stableId('c', 'etab2', '2026-10-05|08:00|3A|TECHNOLOGIE') === a) throw new Error('collision entre collèges');
});
