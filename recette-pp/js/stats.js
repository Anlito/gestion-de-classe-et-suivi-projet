// stats.js — Statistiques de présence (calculées à la demande à partir des appels, absences et retards).
// Règles (README) : un élève en retard compte comme PRÉSENT ; taux = appels sans absence / appels de sa classe.
// Le trimestre d'un appel se déduit de sa date et des débuts de trimestre (Réglages → « Passer au trimestre »).
import * as db from './db.js';
import * as model from './model.js';

// Trimestre d'une date (AAAA-MM-JJ) : le dernier trimestre commencé à cette date.
export function trimesterOf(date) {
  const starts = db.getMeta('trimesterStarts', {}) || {};
  let t = 1;
  for (const k of [1, 2, 3]) if (starts[k] && starts[k] <= date) t = k;
  return t;
}
// Appels d'une classe (t : trimestre, facultatif ; filtre : fonction supplémentaire).
export function appelsDe(classId, t = null, filtre = null) {
  return db.where('appels', a => a.classId === classId && (t == null || trimesterOf(a.date) === t) && (!filtre || filtre(a)));
}

const taux = (appels, absences) => (appels ? (appels - absences) / appels : null);
export const pct = v => (v == null ? '—' : Math.round(v * 100) + ' %');

// Présence d'un élève : { appels, absences, retards, taux } (sur les appels de sa classe).
export function presenceEleve(student, t = null, filtre = null) {
  const appels = appelsDe(student.classId, t, filtre);
  const ids = new Set(appels.map(a => a.id));
  const absences = db.where('absences', x => x.studentId === student.id && ids.has(x.appelId)).length;
  const retards = db.where('retards', x => x.studentId === student.id && ids.has(x.appelId)).length;
  return { appels: appels.length, absences, retards, taux: taux(appels.length, absences) };
}

// Présence d'une classe : moyenne des taux des élèves, élèves les plus absents (et en retard).
export function presenceClasse(classId, t = null, filtre = null) {
  const eleves = model.studentsOf(classId).map(s => ({ s, ...presenceEleve(s, t, filtre) }));
  const avec = eleves.filter(e => e.appels);
  const moyenne = avec.length ? avec.reduce((x, e) => x + e.taux, 0) / avec.length : null;
  return {
    appels: appelsDe(classId, t, filtre).length,
    moyenne,
    absences: eleves.reduce((x, e) => x + e.absences, 0),
    retards: eleves.reduce((x, e) => x + e.retards, 0),
    plusAbsents: eleves.filter(e => e.absences).sort((a, b) => b.absences - a.absences || a.taux - b.taux).slice(0, 5),
    plusEnRetard: eleves.filter(e => e.retards).sort((a, b) => b.retards - a.retards).slice(0, 5),
    eleves,
  };
}

// Présence sur les séances d'un projet (appels rattachés au projet dans cette classe).
export function presenceProjet(assignment) {
  return presenceClasse(assignment.classId, null, a => a.assignmentId === assignment.id && a.seanceId);
}
