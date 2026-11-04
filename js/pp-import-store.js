import * as db from './db.js';
import * as model from './model.js';
import * as pp from './pp.js';
import { norm, importProblems } from './pronote-import.js';

export function alreadyImported(hash, classId, { testMode = false } = {}) {
  return db.where('ppRecords', r => r.kind === 'importBatch' && r.fingerprint === hash && r.classId === classId && r.year === model.schoolYear() && (r.testMode === true) === (testMode === true))[0] || null;
}
export function buildImport(parsed, mappings, classId, hash, options = {}) {
  const testMode = options.testMode === true;
  if (!pp.enabled('imports') || !pp.active(classId)) throw new Error('Activez l’outil Imports et choisissez une classe PP.');
  if (!['roster', 'bulletin', 'attendance', 'discipline'].includes(parsed.profile)) throw new Error('Profil d’import non pris en charge.');
  if (['attendance','discipline'].includes(parsed.profile) && !pp.enabled('vieScolaire')) throw new Error('Activez l’outil Vie scolaire pour importer ce relevé.');
  if (alreadyImported(hash, classId, { testMode })) throw new Error('Ce fichier a déjà été validé pour cette classe. Aucun doublon créé.');
  const c = db.get('classes', classId), pupils = model.studentsOf(classId);
  const problems = importProblems(parsed, mappings, c, model.schoolYear(), pupils, { testMode });
  if (problems.length) throw new Error(problems[0]);
  if (parsed.profile === 'bulletin' && (!pp.enabled('conseils') || !pp.enabled('documents'))) throw new Error('Activez les outils Conseils et Documents pour importer un bulletin et sa pièce jointe.');
  const records = [], conflicts = [], batchId = db.uid(), now = new Date().toISOString();
  const base = { classId, year: model.schoolYear(), at: now, source: 'pronote', importBatchId: batchId, testMode, sourceYear: parsed.year || null, sourceClass: parsed.sourceClass || null };
  const heads = pp.latest({ classId });
  parsed.rows.forEach((row, index) => {
    if (mappings[index] === 'skip') return;
    const studentId = mappings[index];
    if (['attendance','discipline'].includes(parsed.profile)) {
      if (!parsed.totalsChecked) throw new Error('Les totaux du relevé doivent être vérifiés avant import.');
      const entityId = [testMode?'test-recap':'recap',classId,studentId,model.schoolYear(),parsed.profile,parsed.sourceSchool,parsed.period.join('|')].join('|');
      records.push({...base,id:db.uid(),entityId,parents:heads.filter(r=>r.entityId===entityId).map(r=>r.id),kind:'periodReport',studentId,profile:parsed.profile,period:parsed.period,columns:parsed.columns,metrics:row.metrics,sourceRow:row.sourceRow,sourcePage:row.sourcePage,sourceClass:row.sourceClass||parsed.sourceClass,sourceSchool:parsed.sourceSchool});
    }
    if (parsed.profile === 'bulletin') {
      const occurrences = new Map();
      for (const subject of row.subjects) {
        const key = norm(subject.subject) + '|' + norm(subject.teacher);
        const occurrence = (occurrences.get(key) || 0) + 1; occurrences.set(key, occurrence);
        const entityId = [testMode ? 'pronote-test-avis' : 'pronote-avis', classId, studentId, model.schoolYear(), parsed.trimester, key, occurrence].join('|');
        const existing = heads.filter(r => r.entityId === entityId);
        if (!subject.appreciation?.trim()) continue;
        if (existing.length > 1 || existing.some(r => r.source !== 'pronote')) { conflicts.push({ studentId, subject: subject.subject, reason: 'Avis modifié manuellement ou versions concurrentes : texte conservé.' }); continue; }
        if (existing.length === 1 && existing[0].text === subject.appreciation) continue;
        records.push({ ...base, id: db.uid(), entityId, parents: existing.map(r => r.id), kind: 'council', studentId, trimester: parsed.trimester,
          category: 'avis', status: 'draft', subject: subject.subject, teacher: subject.teacher, text: subject.appreciation,
          sourcePage: subject.sourcePage, sourceRow: subject.sourceRow });
      }
      // Moyennes et appréciation générale déjà écrite restent des données source,
      // sans remplacer une synthèse PP ni additionner les cumuls d’assiduité.
      records.push({ ...base, id: db.uid(), kind: 'bulletinSource', studentId, trimester: parsed.trimester, layout: parsed.layout || 'moyennes', payload: row });
    }
  });
  return { batchId, records, conflicts, mappings: parsed.rows.map((r, i) => ({ sourceRow: r.sourceRow, studentId: mappings[i] === 'skip' ? null : mappings[i] })),
    matched: mappings.filter(id => id && id !== 'skip').length, profile: parsed.profile, trimester: parsed.trimester || null, fingerprint: hash, testMode, sourceYear: parsed.year || null, sourceClass: parsed.sourceClass || null };
}
export async function commitImport(parsed, mappings, classId, hash, file, options = {}) {
  const plan = buildImport(parsed, mappings, classId, hash, options);
  const blobId = 'pp-file-' + db.uid(), at = new Date().toISOString(), source = { classId, year: model.schoolYear(), at, testMode: plan.testMode, sourceYear: plan.sourceYear, sourceClass: plan.sourceClass };
  const mimeType = plan.profile === 'roster' ? 'text/csv' : 'application/pdf';
  const batch = { ...source, id: plan.batchId, kind: 'importBatch', profile: plan.profile, fingerprint: hash,
    fileName: file.name, trimester: plan.trimester, mappings: plan.mappings, conflicts: plan.conflicts,
    matched: plan.matched, avisAdded: plan.records.filter(r => r.kind === 'council').length, reportRows:plan.records.filter(r=>r.kind==='periodReport').length, period:parsed.period, title:parsed.label };
  const documents = plan.profile === 'bulletin' ? plan.mappings.filter(m => m.studentId).map(m => ({ ...source, id: db.uid(), entityId: db.uid(), parents: [],
    kind: 'document', studentId: m.studentId, category: 'Bulletin', title: `${plan.testMode ? 'TEST · ' : ''}Bulletin · trimestre ${plan.trimester}`, blobId, mimeType, fileName: file.name, size: file.size, importBatchId: plan.batchId })) : [];
  // CSV : fichier source conservé sur le lot, sans reprise des colonnes privées.
  if (plan.profile !== 'bulletin') { batch.blobId = blobId; batch.mimeType = mimeType; batch.size = file.size; }
  const undo = db.commit(w => {
    w.put('photos', { id: blobId, blob: new Blob([file], { type: mimeType }) });
    for (const row of [...plan.records, ...documents]) w.put('ppRecords', row);
    w.put('ppRecords', batch);
  });
  try {
    await db.verifyStored('ppRecords', batch.id, batch.updatedAt);
    await db.verifyStored('photos', blobId);
  } catch (error) {
    // Ne pas laisser un lot seulement en mémoire bloquer la nouvelle tentative.
    await undo();
    throw error;
  }
  return { ...plan, batch, undo };
}
