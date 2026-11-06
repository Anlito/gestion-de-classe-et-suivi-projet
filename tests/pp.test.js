import { isPPClass, revisionHeads, isOverdue, meetingReminders, validISODate } from '../js/pp-rules.js';
import { mergeData } from '../js/sync.js';
export const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const eq = (a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`Attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`); };
test('PP : rôle lié à l’année et désactivation sans effacement', () => {
  eq(isPPClass({ year: '2026–2027', ppYear: '2026-2027' }, '2026–2027'), true);
  eq(isPPClass({ year: '2026–2027', ppYear: null }, '2026–2027'), false);
  eq(isPPClass({ year: '2025–2026', ppYear: '2025–2026' }, '2026–2027'), false);
});
test('PP : version précédente conservée mais non affichée comme courante', () => {
  eq(revisionHeads([{ id: 'a', parents: [] }, { id: 'b', parents: ['a'] }]).map(x => x.id), ['b']);
});
test('PP : deux éditions hors ligne ne se remplacent pas après fusion', () => {
  const a = { id: 'a', entityId: 'n', parents: [], updatedAt: 1 };
  const b = { id: 'b', entityId: 'n', parents: ['a'], updatedAt: 2 };
  const c = { id: 'c', entityId: 'n', parents: ['a'], updatedAt: 3 };
  const merged = mergeData({ stores: { ppRecords: [a, b] } }, { stores: { ppRecords: [a, c] } });
  eq(revisionHeads(merged.merged.stores.ppRecords).map(x => x.id).sort(), ['b', 'c']);
});
test('PP : échéance absente ou action terminée ne vaut pas retard', () => {
  eq(isOverdue({ kind: 'task', due: '', status: 'todo' }, '2026-11-04'), false);
  eq(isOverdue({ kind: 'task', due: '2026-11-03', status: 'done' }, '2026-11-04'), false);
  eq(isOverdue({ kind: 'task', due: '2026-11-03', status: 'todo' }, '2026-11-04'), true);
});
test('PP : dates impossibles refusées', () => { eq(validISODate('2026-02-30'), false); eq(validISODate('2026-11-04'), true); });
test('PP : rappel la veille à 16 h et H−1 en hiver', () => {
  eq(meetingReminders({ studentId: 'fictif', date: '2026-11-10', debut: '17:00' }).map(t => new Date(t).toISOString()), ['2026-11-09T15:00:00.000Z', '2026-11-10T15:00:00.000Z']);
});
test('PP : rappel à travers le passage à l’heure d’été', () => {
  eq(meetingReminders({ studentId: 'fictif', date: '2026-03-29', debut: '17:00' }).map(t => new Date(t).toISOString()), ['2026-03-28T15:00:00.000Z', '2026-03-29T14:00:00.000Z']);
});
test('PP : rappel à travers le passage à l’heure d’hiver', () => {
  eq(meetingReminders({ studentId: 'fictif', date: '2026-10-25', debut: '17:00' }).map(t => new Date(t).toISOString()), ['2026-10-24T14:00:00.000Z', '2026-10-25T15:00:00.000Z']);
});
test('PP : pas de rappel élève pour événement sans élève ou annulé', () => {
  eq(meetingReminders({ date: '2026-11-10', debut: '17:00' }), []);
  eq(meetingReminders({ studentId: 'fictif', date: '2026-11-10', debut: '17:00', cancelled: true }), []);
});
