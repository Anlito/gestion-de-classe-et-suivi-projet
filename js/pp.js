import * as db from './db.js';
import * as model from './model.js';
import { isPPClass, revisionHeads, PP_TOOLS, DOCUMENT_TYPES, CARNET_TYPES, validISODate } from './pp-rules.js';
export { PP_TOOLS, DOCUMENT_TYPES, CARNET_TYPES, revisionHeads };

export const classes = () => model.classes().filter(c => isPPClass(c, model.schoolYear()));
export const active = classId => isPPClass(db.get('classes', classId), model.schoolYear());
export const hasPP = () => classes().length > 0;
export const enabled = key => PP_TOOLS.some(t => t.key === key) && db.getMeta('ppTool:' + key, true) !== false;
export function setEnabled(key, value) {
  if (!PP_TOOLS.some(t => t.key === key)) throw new Error('Outil inconnu.');
  return db.commit(w => w.meta('ppTool:' + key, !!value));
}
export const records = ({ studentId, classId, kind } = {}) => db.where('ppRecords', r =>
  r.year === model.schoolYear() && (!studentId || r.studentId === studentId) && (!classId || r.classId === classId) && (!kind || r.kind === kind));
export const latest = filters => revisionHeads(records(filters));
export function requireStudent(studentId) {
  const s = db.get('students', studentId);
  if (!s || !active(s.classId)) throw new Error('Choisissez un élève d’une classe dont vous êtes PP.');
  return s;
}
export function saveEntry(data, previous = null) {
  const s = data.studentId ? requireStudent(data.studentId) : null;
  const classId = s ? s.classId : data.classId;
  if (!active(classId)) throw new Error('Cette classe n’a pas de suivi PP actif.');
  if (previous && (!db.get('ppRecords', previous.id) || previous.studentId !== (s?.id || null) || previous.classId !== classId)) throw new Error('La version source a changé. Rouvrez la fiche.');
  const kind = previous?.kind || data.kind;
  const tool = { task: 'actions', note: 'notes', progress: 'notes', carnet: 'carnet', document: 'documents', council: 'conseils' }[kind];
  if (!tool || !enabled(tool)) throw new Error('Cet outil est désactivé.');
  if (data.due && !validISODate(data.due)) throw new Error('Vérifiez la date d’échéance.');
  if (data.date && !validISODate(data.date)) throw new Error('Vérifiez la date.');
  if (kind === 'carnet' && !CARNET_TYPES.includes(data.category)) throw new Error('Choisissez une catégorie du carnet scolaire.');
  if (kind === 'council' && ![1, 2, 3].includes(Number(data.trimester))) throw new Error('Choisissez un trimestre.');
  if (kind !== 'council' && !(data.title || data.text || '').trim()) throw new Error('Renseignez le contenu.');
  const id = db.uid();
  // Données explicites uniquement : aucune reprise de propriétés internes reçues d’un formulaire.
  const entry = { id, entityId: previous?.entityId || id, parents: previous ? [previous.id] : [], kind,
    classId, studentId: s?.id || null, year: model.schoolYear(), at: new Date().toISOString(),
    title: (data.title || '').trim(), text: (data.text || '').trim(), date: data.date || '', due: data.due || '',
    status: data.status || (kind === 'council' ? 'draft' : 'todo'), category: data.category || '',
    trimester: kind === 'council' ? Number(data.trimester) : undefined,
    subject: data.subject || '', teacher: data.teacher || '',
    testMode: previous?.testMode === true, sourceYear: previous?.sourceYear, sourceClass: previous?.sourceClass,
    blobId: data.blobId || previous?.blobId, fileName: data.fileName || previous?.fileName,
    mimeType: data.mimeType || previous?.mimeType, size: data.size ?? previous?.size };
  const undo = db.commit(w => w.put('ppRecords', entry));
  return { entry, undo };
}
export async function attachDocument(studentId, file, category, title) {
  const s = requireStudent(studentId);
  if (!enabled('documents')) throw new Error('L’outil Documents est désactivé.');
  if (!DOCUMENT_TYPES.includes(category)) throw new Error('Catégorie de document inconnue.');
  if (!file?.size || file.size > 20 * 1048576) throw new Error('Choisissez un fichier non vide de 20 Mo maximum.');
  const allowed = /^(application\/pdf|image\/(jpeg|png|webp)|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|application\/msword)$/;
  const inferred = /\.pdf$/i.test(file.name) ? 'application/pdf' : '';
  const mimeType = file.type || inferred;
  if (!allowed.test(mimeType)) throw new Error('Formats acceptés : PDF, JPEG, PNG, WebP, DOC et DOCX.');
  const blobId = 'pp-file-' + db.uid();
  const entry = { id: db.uid(), entityId: db.uid(), parents: [], kind: 'document', studentId: s.id, classId: s.classId,
    year: model.schoolYear(), at: new Date().toISOString(), title: (title || file.name).trim(), category,
    blobId, fileName: file.name, mimeType, size: file.size };
  const blob = new Blob([file], { type: mimeType });
  const undo = db.commit(w => { w.put('photos', { id: blobId, blob }); w.put('ppRecords', entry); });
  await db.flush();
  await db.verifyStored('ppRecords', entry.id, entry.updatedAt);
  await db.verifyStored('photos', blobId);
  return { entry, undo };
}
export function removeEntry(id) {
  const row = db.get('ppRecords', id); if (!row) return;
  requireStudent(row.studentId);
  if (row.kind !== 'document') throw new Error('L’historique de ce contenu est conservé.');
  return db.commit(w => { w.del('ppRecords', id); if (row.blobId) w.del('photos', row.blobId); });
}
export const meetingsOf = studentId => db.where('evenements', e => e.studentId === studentId).sort((a, b) => (a.date + a.debut).localeCompare(b.date + b.debut));
