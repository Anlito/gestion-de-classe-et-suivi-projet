// pp-class-notes.js — Carnet de la classe PP : comptes rendus de réunion et pense-bêtes rattachés à une classe (pas à un élève).
// Enregistrés dans ppRecords (kind 'classNote', studentId null), versionnés comme les autres contenus PP et synchronisés par Drive.
import * as db from './db.js';
import * as pp from './pp.js';

export const CATEGORIES = [['reunion', 'Compte rendu de réunion'], ['memo', 'Pense-bête']];
export const MEETING_TITLES = ['Conseil de classe', 'Réunion d’équipe pédagogique', 'Équipe éducative', 'Rencontre parents–professeurs', 'Réunion des professeurs principaux', 'Point avec la vie scolaire', 'Point avec l’infirmière ou l’assistante sociale'];

// Ordre d'affichage : pense-bêtes à faire, puis le plus récent d'abord (date du fait, sinon date de saisie).
const when = r => r.date || (r.at || '').slice(0, 10);
export function sortNotes(rows) {
  return [...rows].sort((a, b) => {
    const open = x => x.category === 'memo' && x.status !== 'done' ? 0 : 1;
    return open(a) - open(b) || when(b).localeCompare(when(a)) || (b.at || '').localeCompare(a.at || '');
  });
}
export const isOpenMemo = r => r.category === 'memo' && r.status !== 'done' && !r.archivedAt;

export const notesOf = classId => sortNotes(pp.latest({ classId, kind: 'classNote' }).filter(r => !r.studentId));
export const openMemos = classId => notesOf(classId).filter(isOpenMemo);

function current(classId, id) {
  if (db.archive()) throw Error('Archive annuelle en lecture seule : revenez à l’année en cours.');
  if (!pp.active(classId)) throw Error('Cette classe n’a pas de suivi PP actif.');
  const row = db.get('ppRecords', id);
  if (!row || row.kind !== 'classNote' || row.classId !== classId || row.studentId) throw Error('Cette note ne correspond pas à cette classe.');
  const heads = notesOf(classId).filter(r => r.entityId === row.entityId);
  if (!heads.some(r => r.id === id)) throw Error('La note a changé. Rouvrez sa version actuelle.');
  if (heads.length > 1) throw Error('Plusieurs versions de cette note existent (deux appareils) : modifiez-la pour les réunir.');
  return row;
}
async function verified(undo, checks) { try { await db.flush(); await checks(); return undo; } catch (e) { await undo(); await db.flush(); throw e; } }

// Création ou modification (nouvelle version qui remplace la précédente ; les versions concurrentes sont réunies).
export async function saveNote(classId, data, previousId = null) {
  if (db.archive()) throw Error('Archive annuelle en lecture seule : revenez à l’année en cours.');
  const category = CATEGORIES.some(([k]) => k === data.category) ? data.category : 'reunion';
  const previous = previousId ? db.get('ppRecords', previousId) : null;
  if (previousId && (!previous || previous.kind !== 'classNote' || previous.classId !== classId)) throw Error('La note a changé. Rouvrez sa version actuelle.');
  // La case « fait » et l'archivage ont pu changer pendant la modification : on garde l'état de la version actuelle.
  const heads = previous ? notesOf(classId).filter(r => r.entityId === previous.entityId) : [];
  const latest = heads[0] || previous;
  const entry = pp.buildEntry({ kind: 'classNote', classId, studentId: null, category, title: data.title, text: data.text, date: data.date,
    status: category === 'memo' ? (latest?.status === 'done' ? 'done' : 'todo') : '' }, previous);
  entry.archivedAt = latest?.archivedAt || null;
  if (previous) entry.parents = heads.map(r => r.id);
  const undo = db.commit(w => w.put('ppRecords', entry));
  return { entry, undo: await verified(undo, () => db.verifyStored('ppRecords', entry.id, entry.updatedAt)) };
}

function revise(classId, id, changes) {
  const row = current(classId, id);
  const saved = { ...row, ...changes, id: db.uid(), parents: [row.id], at: new Date().toISOString() };
  const undo = db.commit(w => w.put('ppRecords', saved));
  return verified(undo, () => db.verifyStored('ppRecords', saved.id, saved.updatedAt));
}
export const setDone = (classId, id, done) => revise(classId, id, { status: done ? 'done' : 'todo' });
export const setArchived = (classId, id, archived) => revise(classId, id, { archivedAt: archived ? new Date().toISOString() : null });

// Suppression définitive : toutes les versions de la note, puis effacement sur les autres appareils à la synchronisation.
export async function deleteNote(classId, id) {
  const row = db.get('ppRecords', id);
  if (!row || row.kind !== 'classNote' || row.classId !== classId) throw Error('Cette note ne correspond pas à cette classe.');
  if (db.archive()) throw Error('Archive annuelle en lecture seule : revenez à l’année en cours.');
  const rows = pp.records({ classId, kind: 'classNote' }).filter(r => r.entityId === row.entityId);
  const undo = db.commit(w => { for (const r of rows) w.del('ppRecords', r.id); });
  return verified(undo, async () => { for (const r of rows) await db.verifyAbsent('ppRecords', r.id); });
}
