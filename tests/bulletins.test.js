import { nextLevel, withDefaults, stateOf, trimesterRange, inRange, average, validNote, recordId, FAMILIES } from '../js/bulletins.js';
export const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const eq = (a, b) => { if (a !== b) throw Error(`${a} ≠ ${b}`); };
const all = v => Object.fromEntries(FAMILIES.map(f => [f.k, v]));

test('Bulletins : une case part de Correct puis fait défiler Point fort, À améliorer, Correct', () => {
  eq(nextLevel(undefined), 'pos'); eq(nextLevel('mid'), 'pos'); eq(nextLevel('pos'), 'neg'); eq(nextLevel('neg'), 'mid');
});
test('Bulletins : un critère non touché vaut Correct', () => {
  const l = withDefaults({ travail: 'pos' }, FAMILIES);
  eq(l.travail, 'pos'); eq(l.effort, 'mid'); eq(Object.keys(l).length, FAMILIES.length);
  eq(stateOf({ presence: 'normale', levels: withDefaults({}, FAMILIES) }), 'ok');
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

import { buildExport, exportFileName } from '../js/bulletins.js';
const entry = (id, prenom, nom, rec = {}, note = 12) => ({ student: { id, prenom, nom, photoId: 'p' + id, besoins: ['PAP'] }, rec: { presence: 'normale', levels: {}, details: {}, tendance: '', info: '', ...rec }, note });
const opts = { discipline: 'Technologie', ton: 'encourageant', formulation: '3e personne' };
test('Export : aucun nom de famille, photo ni dispositif dans le fichier', () => {
  const { data } = buildExport({ niveau: '4e', trimester: 1, year: '2026-2027', options: opts, exportId: 'x', entries: [entry('a', 'Léa', 'DUPONTEL', { levels: { travail: 'pos' }, info: 'Oral réussi' })] });
  const txt = JSON.stringify(data);
  eq(txt.includes('DUPONTEL'), false); eq(txt.includes('PAP'), false); eq(txt.includes('"pa"'), false);
  eq(data.eleves[0].criteres.Travail.niveau, 'Point fort'); eq(data.eleves[0].remarque, 'Oral réussi');
  eq(data.consignes.longueur_max, 300);
});
test('Export : prénoms en double numérotés, codes rattachés aux élèves', () => {
  const { data, codes } = buildExport({ niveau: '4e', trimester: 1, year: 'y', options: opts, exportId: 'x', entries: [entry('a', 'Léa', 'A'), entry('b', 'Tom', 'B'), entry('c', 'Léa', 'C')] });
  eq(data.eleves.map(e => e.prenom).join(','), 'Léa,Tom,Léa (2)'); eq(codes.E03, 'c'); eq(codes.E02, 'b');
});
test('Export : dispensés non envoyés, présence partielle signalée sans motif', () => {
  const { data, codes } = buildExport({ niveau: '4e', trimester: 2, year: 'y', options: opts, exportId: 'x', entries: [entry('a', 'Hugo', 'H', { presence: 'dispense' }), entry('b', 'Lucas', 'L', { presence: 'partielle', info: '' }, null)] });
  eq(data.eleves.length, 1); eq(data.eleves[0].presence, 'partielle'); eq(data.eleves[0].note, null); eq(codes.E01, 'b'); eq(Object.keys(codes).length, 1);
});
test('Export : nom de fichier sans accent ni espace', () => {
  eq(exportFileName({ level: '4e', segpa: true }, 1), 'bulletins-4e-segpa-t1.json');
});

import { parseReturn, sameClass } from '../js/bulletins.js';
const maps = { x1: { classId: 'c', year: 'y', trimester: 1, codes: { E01: 'a', E02: 'b', E03: 'c' } } };
const mapOf = id => maps[id] || null;
test('Retour : texte collé avec ```json, codes rattachés, trop long signalé', () => {
  const long = 'x'.repeat(301);
  const r = parseReturn('Voici :\n```json\n{"format":"carnet-appreciations-v1","export_id":"x1","appreciations":[{"code":"E01","texte":"  Bon   trimestre. "},{"code":"E02","texte":"' + long + '"},{"code":"E09","texte":"?"}]}\n```', mapOf);
  eq(r.items.length, 2); eq(r.items[0].studentId, 'a'); eq(r.items[0].texte, 'Bon trimestre.'); eq(r.items[1].tooLong, true);
  eq(r.unknown.join(), 'E09'); eq(r.missing.join(), 'E03');
});
test('Export : accord féminin ou masculin seulement si renseigné, consigne sans accord sinon', () => {
  const st = (id, genre) => ({ student: { id, prenom: 'Camille', genre }, rec: { presence: 'normale', levels: {}, details: {} }, note: 12 });
  const { data } = buildExport({ niveau: '3e', trimester: 1, year: 'y', options: opts, exportId: 'x', entries: [st('a', 'f'), st('b', 'm'), st('c', ''), st('d', 'n')] });
  eq(data.eleves[0].accord, 'féminin'); eq(data.eleves[1].accord, 'masculin'); eq('accord' in data.eleves[2], false); eq(data.eleves[3].accord, 'non genré');
  eq(/non genré/.test(data.consignes.accords), true);
  eq(/sans accord/.test(data.consignes.accords), true);
});
test('Export : nom de la classe dans le fichier et dans son nom', () => {
  const { data } = buildExport({ classe: '3G', niveau: '3e', trimester: 1, year: 'y', options: opts, exportId: 'x', entries: [] });
  eq(data.classe, '3G'); eq(/"classe"/.test(data.consignes.retour), true);
  eq(exportFileName({ name: '3G', level: '3e' }, 2), 'bulletins-3g-t2.json');
});
test('Retour : classe du fichier comparée à celle de l’export', () => {
  const m = { x2: { classId: 'c', className: '3e G', year: 'y', trimester: 1, codes: { E01: 'a' } } };
  const f = c => '{"format":"carnet-appreciations-v1","export_id":"x2",' + c + '"appreciations":[{"code":"E01","texte":"Bien."}]}';
  eq(parseReturn(f('"classe":"3G",'), id => m[id]).classe, '3G');
  eq(parseReturn(f(''), id => m[id]).classe, '');
  let err = ''; try { parseReturn(f('"classe":"3B",'), id => m[id]); } catch (e) { err = e.message; }
  eq(/3B/.test(err) && /3e G/.test(err), true);
  eq(sameClass('6e SEGPA', '6 SEGPA'), true); eq(sameClass('4E - PR', '4e PR'), true); eq(sameClass('3G', '3B'), false);
});
test('Retour : export inconnu ou mauvais format refusés', () => {
  let n = 0;
  for (const t of ['pas de json', '{"format":"autre","appreciations":[]}', '{"format":"carnet-appreciations-v1","export_id":"zz","appreciations":[]}']) { try { parseReturn(t, mapOf); } catch { n++; } }
  eq(n, 3);
});

import { normalizeFamilies, evolution } from '../js/bulletins.js';
test('Critères : liste vide ou absente → critères par défaut', () => {
  eq(normalizeFamilies(null).length, 7); eq(normalizeFamilies([]).length, 7);
});
test('Critères : clés en double, libellés vides et formulations vides écartés', () => {
  const r = normalizeFamilies([{ k: 'a', label: ' Oral ', pos: ['Clair', ' ', 'Clair'], neg: [] }, { k: 'a', label: 'Doublon' }, { k: 'b', label: '' }, { k: 'c', label: 'Sécurité', hidden: 1 }]);
  eq(r.length, 2); eq(r[0].label, 'Oral'); eq(r[0].pos.join(), 'Clair'); eq(r[1].hidden, true);
});
test('Critères : un critère masqué ne compte plus pour « prêt »', () => {
  const fams = [{ k: 'a', label: 'A' }, { k: 'b', label: 'B' }];
  eq(stateOf({ presence: 'normale', levels: { a: 'pos' } }, fams), 'part');
  eq(stateOf({ presence: 'normale', levels: { a: 'pos' } }, fams.slice(0, 1)), 'ok');
});
test('Trimestre précédent : évolution d’un critère', () => {
  eq(evolution('neg', 'pos'), 'up'); eq(evolution('pos', 'mid'), 'down'); eq(evolution('mid', 'mid'), 'same'); eq(evolution(null, 'pos'), null);
});
test('Export : niveau du trimestre précédent indiqué', () => {
  const { data } = buildExport({ niveau: '4e', trimester: 2, year: 'y', options: opts, exportId: 'x', fams: [{ k: 'travail', label: 'Travail' }],
    entries: [{ student: { id: 'a', prenom: 'Léa' }, rec: { presence: 'normale', levels: { travail: 'pos' }, details: {} }, prev: { travail: 'neg' }, note: 14 }] });
  eq(data.eleves[0].criteres.Travail.trimestre_precedent, 'À améliorer');
});
