// Tests du lecteur iCal (js/ical.js) sur un emploi du temps FICTIF au format Pronote.
// Aucune donnée réelle ici : le dépôt est public.
import { parseICS, unfold, unescapeText, parseDateTime, etablissementFrom, normClasse, coursKey, dayBefore } from '../js/ical.js';

// Construit un fichier .ics comme Pronote : lignes CRLF, repliées à 75 caractères.
const fold = line => { const out = []; for (let i = 0; i < line.length; i += 74) out.push((i ? ' ' : '') + line.slice(i, i + 74)); return out.join('\r\n'); };
const ev = props => ['BEGIN:VEVENT', ...Object.entries(props).map(([k, v]) => fold(k + ':' + v)), 'END:VEVENT'].join('\r\n');
const desc = (fields) => fields.map(([k, v]) => k + ' : ' + v).join('\\n');
const cours = (start, end, cat, summary, fields, extra = {}) => ev({
  UID: 'Cours-' + Math.random().toString(36).slice(2) + '@pronote', 'DTSTAMP': '20260930T120000Z',
  DTSTART: start, DTEND: end, 'CATEGORIES;LANGUAGE=fr': cat, 'SUMMARY;LANGUAGE=fr': summary,
  ...(fields ? { 'DESCRIPTION;LANGUAGE=fr': desc(fields) } : {}), ...extra,
});
const PROF = ['Professeur', 'DURAND P.'];

export const FIXTURE = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID;LANGUAGE=fr:Copyright Index-Education - ProNote2026',
  fold('X-WR-CALNAME;LANGUAGE=fr:Calendrier - MARTIN Alex - du 01 septembre 2026 au 02 juillet 2027'),
  fold('X-WR-CALDESC;LANGUAGE=fr:Calendrier MARTIN Alex généré par le logiciel PRONOTE (©INDEX ÉDUCATION) le 30 sept. 2026 - COLLEGE DES TILLEULS - semaines 36 - 26'),
  // 1-2. Même cours du lundi à 15h05 en septembre (UTC+2) et en décembre (UTC+1).
  cours('20260907T130500Z', '20260907T140000Z', 'Cours', 'SCIENCES TECHNOLOGIE - 6 X', [['Matière', 'SCIENCES TECHNOLOGIE'], PROF, ['Classe', '6 X'], ['Salle', 'Techno 1']], { 'LOCATION;LANGUAGE=fr': 'Techno 1' }),
  cours('20261207T140500Z', '20261207T150000Z', 'Cours', 'SCIENCES TECHNOLOGIE - 6 X', [['Matière', 'SCIENCES TECHNOLOGIE'], PROF, ['Classe', '6 X'], ['Salle', 'Techno 1']]),
  // 3-4. Lendemains des changements d'heure (25 oct. 2026, 28 mars 2027).
  cours('20261026T090000Z', '20261026T095500Z', 'Cours', 'TECHNOLOGIE - 5 Y', [['Matière', 'TECHNOLOGIE'], PROF, ['Classe', '5 Y'], ['Salle', 'Salle 12\\, bâtiment B']]),
  cours('20270329T080000Z', '20270329T085500Z', 'Cours', 'TECHNOLOGIE - 5 Y', [['Matière', 'TECHNOLOGIE'], PROF, ['Classe', '5 Y'], ['Salle', 'Techno 1']]),
  // 5. Groupe mêlant deux classes, avec codes HTML échappés.
  cours('20260908T071100Z', '20260908T080500Z', 'Cours', 'TECHNOLOGIE - [3Z1W2] - &lt\\;3Z&gt\\; 3Z1\\, &lt\\;3W&gt\\; 3W2',
    [['Matière', 'TECHNOLOGIE'], ['Professeurs', 'DURAND P.\\, LEROY M.'], ['Groupe', '[3Z1W2]'], ['Parties de classe', '&lt\\;3Z&gt\\; 3Z1\\, &lt\\;3W&gt\\; 3W2'], ['Salle', 'Techno 2']]),
  // 6-12. Statuts.
  cours('20260909T082200Z', '20260909T091500Z', 'Cours - Cours annulé', 'Cours annulé : TECHNOLOGIE - 4 V', [['Matière', 'TECHNOLOGIE'], PROF, ['Classe', '4 V'], ['Salle', 'Techno 1']]),
  cours('20260909T122200Z', '20260909T131500Z', 'Cours - Cours déplacé', 'TECHNOLOGIE - 4 V', [['Matière', 'TECHNOLOGIE'], PROF, ['Classe', '4 V'], ['Salle', 'Techno 1']]),
  cours('20260910T082200Z', '20260910T091500Z', 'Cours - Classe absente', 'TECHNOLOGIE - 4 V', [['Matière', 'TECHNOLOGIE'], PROF, ['Classe', '4 V'], ['Salle', 'Techno 1']]),
  cours('20260911T082200Z', '20260911T091500Z', 'Cours - Sortie pédagogique', 'Sortie pédagogique : TECHNOLOGIE - 4 V', [['Matière', 'TECHNOLOGIE'], PROF, ['Classe', '4 V'], ['Salle', 'Techno 1']]),
  cours('20260914T082200Z', '20260914T091500Z', 'Cours - Abs personnelle', 'TECHNOLOGIE - 4 V', [['Matière', 'TECHNOLOGIE'], PROF, ['Classe', '4 V'], ['Salle', 'Techno 1']]),
  cours('20260915T082200Z', '20260915T091500Z', 'Cours - Changement de salle', 'TECHNOLOGIE - 4 V', [['Matière', 'TECHNOLOGIE'], PROF, ['Classe', '4 V'], ['Salle', 'Salle 204']]),
  cours('20260916T082200Z', '20260916T091500Z', 'Cours - Cours exceptionnel', 'TECHNOLOGIE - 4 V', [['Matière', 'TECHNOLOGIE'], PROF, ['Classe', '4 V'], ['Salle', 'Techno 1']]),
  // 13. Cours sans description : matière tirée du résumé.
  cours('20260917T082200Z', '20260917T091500Z', 'Cours', 'VIE DE CLASSE - 4 V', null),
  // 14. Réunion (matière non enseignée : gardée, son rôle se règle à l'import).
  cours('20260917T150000Z', '20260917T160000Z', 'Cours', 'COORDINATION/CONCERTATION - DURAND P.\\, LEROY M.', [['Matière', 'COORDINATION/CONCERTATION'], ['Professeurs', 'DURAND P.\\, LEROY M.'], ['Salle', 'CDI']]),
  // Vacances (fin exclusive) et jour férié.
  ev({ UID: 'Ferie-1', 'DTSTART;VALUE=DATE': '20261018', 'DTEND;VALUE=DATE': '20261102', 'CATEGORIES;LANGUAGE=fr': 'Jours fériés', 'SUMMARY;LANGUAGE=fr': 'Vacances' }),
  ev({ UID: 'Ferie-2', 'DTSTART;VALUE=DATE': '20261111', 'DTEND;VALUE=DATE': '20261112', 'CATEGORIES;LANGUAGE=fr': 'Jours fériés', 'SUMMARY;LANGUAGE=fr': 'Férié' }),
  // Ignorés : agenda (journée entière et horaire), stage.
  ev({ UID: 'Agenda-1', 'DTSTART;VALUE=DATE': '20260907', 'DTEND;VALUE=DATE': '20260909', 'CATEGORIES;LANGUAGE=fr': 'Agenda', 'SUMMARY;LANGUAGE=fr': 'Photos de classe' }),
  ev({ UID: 'Agenda-2', DTSTART: '20260910T153000Z', DTEND: '20260910T170000Z', 'CATEGORIES;LANGUAGE=fr': 'Agenda', 'SUMMARY;LANGUAGE=fr': 'Réunion parents' }),
  ev({ UID: 'Stage-1', 'DTSTART;VALUE=DATE': '20261123', 'DTEND;VALUE=DATE': '20261128', 'CATEGORIES;LANGUAGE=fr': 'Sessions de stage', 'SUMMARY;LANGUAGE=fr': 'Session de stage : 3e' }),
  'END:VCALENDAR', '',
].join('\r\n');

// Petit exécuteur : test(nom, fn) ; fn lève une erreur en cas d'échec.
export const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const eq = (a, b, msg = '') => { const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) throw new Error(`${msg} attendu ${B}, obtenu ${A}`); };
const ok = (v, msg) => { if (!v) throw new Error(msg); };

const R = parseICS(FIXTURE);
const RLF = parseICS(FIXTURE.replace(/\r\n/g, '\n'));
const at = i => R.cours[i];

test('Lignes repliées dépliées', () => eq(unfold('ABC\r\n DEF\r\n\tGHI\nJKL'), 'ABCDEFGHI\nJKL'));
test('Échappements iCal', () => eq(unescapeText('a\\, b\\; c\\nd\\\\e'), 'a, b; c\nd\\e'));
test('Codes HTML (Pronote)', () => eq(unescapeText('&lt\\;3C&gt\\; 3C1 &amp; co &#233;'), '<3C> 3C1 & co é'));
test('Établissement lu dans X-WR-CALDESC (ligne repliée)', () => eq(R.etablissement, 'COLLEGE DES TILLEULS'));
test('Établissement : autres formes', () => {
  eq(etablissementFrom('Calendrier X généré le 30 sept. 2026 - COLLEGE RENE BERNIER - semaines 36 - 26'), 'COLLEGE RENE BERNIER');
  eq(etablissementFrom(''), '');
});
test('Heure de Paris en septembre (UTC+2) : 13:05Z → 15:05', () => eq([at(0).date, at(0).debut, at(0).fin], ['2026-09-07', '15:05', '16:00']));
test('Heure de Paris en décembre (UTC+1) : 14:05Z → 15:05', () => eq([at(1).date, at(1).debut], ['2026-12-07', '15:05']));
test('Lendemain du passage à l’heure d’hiver : 09:00Z → 10:00', () => eq(at(2).debut, '10:00'));
test('Lendemain du passage à l’heure d’été : 08:00Z → 10:00', () => eq(at(3).debut, '10:00'));
test('Changement de date à minuit (23:30Z en été → lendemain 01:30)', () => eq(parseDateTime('20260630T233000Z'), { date: '2026-07-01', time: '01:30' }));
test('Heure sans Z gardée telle quelle', () => eq(parseDateTime('20260907T081500', { TZID: 'Europe/Paris' }), { date: '2026-09-07', time: '08:15' }));
test('Champs gardés : classe, salle (virgule échappée), matière', () => eq([at(0).classe, at(0).salle, at(0).matiere, at(2).salle], ['6 X', 'Techno 1', 'SCIENCES TECHNOLOGIE', 'Salle 12, bâtiment B']));
test('Groupe prioritaire sur la classe (codes HTML décodés)', () => eq([at(4).classe, at(4).multi], ['[3Z1W2]', false]));
test('Statuts Pronote', () => eq(R.cours.slice(5, 12).map(c => c.statut), ['annule', 'deplace', 'classe_absente', 'sortie', 'abs_perso', 'salle', 'autre']));
test('Statut inconnu : libellé conservé', () => eq(at(11).statutLabel, 'Cours exceptionnel'));
test('Cours sans description : matière et classe tirées du résumé', () => eq([at(12).matiere, at(12).classe], ['VIE DE CLASSE', '']));
test('Réunion gardée comme cours (sans classe)', () => eq([at(13).matiere, at(13).classe], ['COORDINATION/CONCERTATION', '']));
test('Nombre de cours', () => eq(R.cours.length, 14));
test('Vacances : fin exclusive → dernier jour inclus', () => eq(R.jours[0], { du: '2026-10-18', au: '2026-11-01', type: 'vacances', label: 'Vacances' }));
test('Jour férié d’un jour', () => eq(R.jours[1], { du: '2026-11-11', au: '2026-11-11', type: 'ferie', label: 'Férié' }));
test('Agenda et stages ignorés', () => eq(R.ignores, { agenda: 2, stage: 1, autres: 0 }));
test('Confidentialité : ni professeurs, ni identifiants, ni résumés conservés', () => {
  const s = JSON.stringify(R);
  for (const w of ['DURAND', 'LEROY', 'Professeur', 'MARTIN', 'UID', '@pronote', 'Photos de classe', 'Réunion parents']) ok(!s.includes(w), `« ${w} » ne devrait pas apparaître`);
});
test('Fichier avec fins de ligne LF seules : même résultat', () => eq(RLF, R));
test('Nom de classe comparable', () => { eq(normClasse('4 E'), '4E'); eq(normClasse('[3C1]'), '3C1'); eq(normClasse('4e E'), '4EE'); });
test('Clé de réimportation', () => eq(coursKey('Collège des Tilleuls', at(0)), 'COLLEGEDESTILLEULS|2026-09-07|15:05|6X'));
test('Jour précédent (fin de mois, année bissextile)', () => { eq(dayBefore('2026-11-01'), '2026-10-31'); eq(dayBefore('2028-03-01'), '2028-02-29'); });
