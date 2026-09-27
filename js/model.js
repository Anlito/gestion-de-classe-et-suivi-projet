// model.js — Règles métier : trimestres, observations, notes libres, projets, notation.
import * as db from './db.js';
import { todayISO, fmtDay } from './ui.js';

export const CLASS_LEVELS = ['6e', '5e', '4e', '3e'];
export const LABEL = { neg: 'Comportement', pos: 'Aide / soutien / rangement' };
export const SHORT = { neg: 'Comportement', pos: 'Aide' };
export const MOTIFS = {
  neg: ['Bavardage', 'Téléphone', 'Hors tâche', 'Matériel oublié', 'Attitude'],
  pos: ['Aide un camarade', 'Rangement', 'Participation', 'Soutien'],
};
export const SECTIONS = [
  { key: 'SEGPA', label: 'SEGPA', tint: 'var(--t-segpa)' },
  { key: '6e', label: '6e', tint: 'var(--t-6e)' },
  { key: '5e', label: '5e', tint: 'var(--t-5e)' },
  { key: '4e', label: '4e', tint: 'var(--t-4e)' },
  { key: '3e', label: '3e', tint: 'var(--t-3e)' },
];
export const sectionOf = c => (c.segpa ? 'SEGPA' : c.level);

const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
export const cmp = (a, b) => collator.compare(a || '', b || '');

// ---------- Année scolaire et trimestres ----------
export function schoolYearFor(d = new Date()) {
  const y = d.getFullYear();
  return d.getMonth() >= 7 ? `${y}–${y + 1}` : `${y - 1}–${y}`;
}
export const schoolYear = () => db.getMeta('schoolYear', schoolYearFor());
export const trimester = () => db.getMeta('trimester', 1);

export function ensureMeta() {
  if (db.getMeta('schoolYear') !== null) return;
  db.commit(w => {
    w.meta('schoolYear', schoolYearFor());
    w.meta('trimester', 1);
    w.meta('trimesterStarts', { 1: todayISO() });
  }, { track: false });
}

// Clôt le trimestre en cours : les compteurs repartent à zéro, l'historique est conservé.
export function nextTrimester() {
  const t = trimester();
  if (t >= 3) return null;
  const starts = { ...db.getMeta('trimesterStarts', {}) };
  starts[t + 1] = todayISO();
  return db.commit(w => { w.meta('trimester', t + 1); w.meta('trimesterStarts', starts); });
}

// ---------- Classes et élèves ----------
const sectionIndex = c => SECTIONS.findIndex(s => s.key === sectionOf(c));
export const classes = () => db.all('classes')
  .sort((a, b) => (sectionIndex(a) - sectionIndex(b)) || (CLASS_LEVELS.indexOf(a.level) - CLASS_LEVELS.indexOf(b.level)) || cmp(a.name, b.name));
export const studentsOf = classId =>
  db.where('students', s => s.classId === classId).sort((a, b) => cmp(a.nom, b.nom) || cmp(a.prenom, b.prenom));
export const shortName = s => (s.prenom || '?') + (s.nom ? ' ' + s.nom.charAt(0) + '.' : '');
export const fullName = s => [s.prenom, s.nom].filter(Boolean).join(' ');

// ---------- Projets, assignations, séances ----------
export const assignmentsOf = classId => db.where('assignments', a => a.classId === classId);
export const seancesOf = assignmentId =>
  db.where('seances', s => s.assignmentId === assignmentId).sort((a, b) => a.n - b.n);

function lastActivity(a) {
  const ss = seancesOf(a.id);
  const last = ss[ss.length - 1];
  return last ? last.date + ' ' + String(last.updatedAt).padStart(15, '0') : '0000 ' + String(a.updatedAt).padStart(15, '0');
}
// Projets en cours d'une classe, le plus récemment actif en premier.
export function activeAssignments(classId) {
  return assignmentsOf(classId).filter(a => a.status === 'cours')
    .sort((a, b) => lastActivity(b).localeCompare(lastActivity(a)));
}

// Projet choisi dans l'en-tête des onglets (mémorisé par classe, partagé entre Projet, Groupes et Notes).
const chosen = {};
export function chooseAssignment(classId, aid) { chosen[classId] = aid; }
const STATUS_ORDER = ['cours', 'avenir', 'fini'];
export function selectableAssignments(classId, statuses) {
  const act = activeAssignments(classId);
  return assignmentsOf(classId).filter(a => statuses.includes(a.status) && db.get('projects', a.projectId))
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
      || (a.status === 'cours' ? act.indexOf(a) - act.indexOf(b) : (b.endedAt || '').localeCompare(a.endedAt || '')));
}
export function chosenAssignment(classId, statuses = STATUS_ORDER) {
  const list = selectableAssignments(classId, statuses);
  return list.find(a => a.id === chosen[classId]) || list[0] || null;
}

export function progress(a) {
  const p = db.get('projects', a.projectId);
  return { cur: seancesOf(a.id).length, total: p ? p.nSeances : 0 };
}

// Séance à laquelle rattacher une observation : celle du projet en cours le plus récemment actif.
export function seanceContext(classId) {
  for (const a of activeAssignments(classId)) {
    const ss = seancesOf(a.id);
    if (!ss.length) continue;
    const p = db.get('projects', a.projectId);
    const last = ss[ss.length - 1];
    return { assignmentId: a.id, n: last.n, seanceId: last.id, date: last.date, label: 'Séance ' + last.n + (p ? ' · ' + p.title : '') };
  }
  return null;
}

// Groupe de l'élève dans le projet en cours de sa classe.
export function studentGroupInfo(student) {
  const act = activeAssignments(student.classId);
  for (const a of act) {
    const g = db.all('groups').find(x => x.assignmentId === a.id && x.members.includes(student.id));
    if (g) {
      const p = db.get('projects', a.projectId);
      return { code: g.code, project: p ? p.title : '' };
    }
  }
  if (act.length) {
    const p = db.get('projects', act[0].projectId);
    return { code: null, project: p ? p.title : '' };
  }
  return null;
}

// ---------- Observations ----------
export function countsByStudent(classId, t = trimester()) {
  const m = new Map();
  for (const o of db.all('observations')) {
    if (o.classId !== classId || o.trimester !== t) continue;
    const c = m.get(o.studentId) || { neg: 0, pos: 0 };
    c[o.type]++;
    m.set(o.studentId, c);
  }
  return m;
}
export function countsOf(studentId, t) {
  const c = { neg: 0, pos: 0 };
  for (const o of db.all('observations')) if (o.studentId === studentId && o.trimester === t) c[o.type]++;
  return c;
}
export const observationsOf = studentId =>
  db.where('observations', o => o.studentId === studentId).sort((a, b) => b.at.localeCompare(a.at));

export function addObservation(student, type, motif = '', origin = 'tap') {
  const ctx = origin === 'tap' ? seanceContext(student.classId) : null;
  const undo = db.commit(w => {
    w.put('observations', {
      studentId: student.id, classId: student.classId, type, motif,
      at: new Date().toISOString(), trimester: trimester(), origin,
      assignmentId: ctx ? ctx.assignmentId : null, seanceN: ctx ? ctx.n : null,
      seanceLabel: origin === 'tap' ? (ctx ? ctx.label : '') : 'Correction',
    });
  });
  return undo;
}

// « − » dans le détail : retire la dernière observation de ce type du trimestre en cours.
export function removeLastObservation(studentId, type) {
  const t = trimester();
  const last = observationsOf(studentId).find(o => o.type === type && o.trimester === t);
  if (!last) return null;
  return { removed: last, undo: db.commit(w => w.del('observations', last.id)) };
}
export const deleteObservation = id => db.commit(w => w.del('observations', id));
export function swapObservation(id) {
  return db.commit(w => w.update('observations', id, o => ({ type: o.type === 'neg' ? 'pos' : 'neg', motif: '' })));
}
export function obsTitle(o) { return o.motif ? LABEL[o.type] + ' — ' + o.motif : LABEL[o.type]; }
export function obsSub(o) { return fmtDay(o.at) + (o.seanceLabel ? ' · ' + o.seanceLabel : ''); }

// ---------- Absences (appel) ----------
export const absencesOf = studentId =>
  db.where('absences', a => a.studentId === studentId).sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at));
// Chaque appel est enregistré. L'appel « en cours » est le dernier appel de la journée pour la classe.
// Avec un projet en cours, un appel est toujours rattaché à une séance du jour (créée au besoin).
export const appelsToday = classId =>
  db.where('appels', x => x.classId === classId && x.date === todayISO()).sort((a, b) => a.at.localeCompare(b.at));
export function currentAppel(classId) { const l = appelsToday(classId); return l[l.length - 1] || null; }
// Séance du projet en cours créée aujourd'hui (ou null).
export function todaySeance(classId) {
  const ctx = seanceContext(classId);
  return ctx && ctx.date === todayISO() ? ctx : null;
}
export function createAppel(classId, ctx) {
  let appel;
  const n = appelsToday(classId).length + 1;
  const act = activeAssignments(classId)[0];
  const undo = db.commit(w => {
    appel = w.put('appels', {
      classId, date: todayISO(), at: new Date().toISOString(), n,
      assignmentId: ctx ? ctx.assignmentId : act ? act.id : null, seanceId: ctx ? ctx.seanceId : null,
      seanceN: ctx ? ctx.n : null, label: ctx ? ctx.label : '',
    });
  });
  return { appel, undo };
}
// « Je recommence » : efface les absences notées à cet appel.
export function resetAppel(appel) {
  return db.commit(w => { for (const a of db.where('absences', x => x.appelId === appel.id)) w.del('absences', a.id); });
}
export const appelTitle = ap => (ap && ap.label ? 'Appel · ' + ap.label : 'Appel du ' + fmtDay(todayISO()) + (ap && ap.n > 1 ? ' (cours ' + ap.n + ')' : ''));
// Élèves absents à l'appel en cours.
export function absentNow(classId) {
  const ap = currentAppel(classId);
  if (!ap) return new Set();
  return new Set(db.where('absences', a => a.appelId === ap.id).map(a => a.studentId));
}
export function absenceCount(studentId, t) {
  return db.where('absences', a => a.studentId === studentId && (t == null || a.trimester === t)).length;
}
// Marque l'élève absent à l'appel en cours, ou annule cette absence. Renvoie { absent, undo }, ou null sans appel.
export function toggleAbsent(student) {
  const ap = currentAppel(student.classId);
  if (!ap) return null;
  const ex = db.all('absences').find(a => a.studentId === student.id && a.appelId === ap.id);
  if (ex) return { absent: false, undo: db.commit(w => w.del('absences', ex.id)) };
  return {
    absent: true,
    undo: db.commit(w => w.put('absences', {
      studentId: student.id, classId: student.classId, appelId: ap.id, date: ap.date, at: new Date().toISOString(), trimester: trimester(),
      assignmentId: ap.assignmentId, seanceId: ap.seanceId, seanceN: ap.seanceN, seanceLabel: ap.label,
    })),
  };
}
export const deleteAbsence = id => db.commit(w => w.del('absences', id));
// Séances d'un projet manquées par un élève (pour l'ajustement « Absent » dans les notes).
export const absencesInAssignment = (aid, sid) =>
  db.where('absences', a => a.assignmentId === aid && a.studentId === sid).sort((a, b) => a.date.localeCompare(b.date));

// ---------- Notes libres ----------
export const notesOf = studentId =>
  db.where('notes', n => n.studentId === studentId).sort((a, b) => b.at.localeCompare(a.at));
export const addNote = (studentId, text) => db.commit(w => w.put('notes', { studentId, text, at: new Date().toISOString() }));
export const updateNote = (id, text) => db.commit(w => w.update('notes', id, { text }));
export const deleteNote = id => db.commit(w => w.del('notes', id));

// ---------- Projets : définitions ----------
export const projects = () => db.all('projects').sort((a, b) => cmp(a.title, b.title));
export const assignmentsOfProject = projectId => db.where('assignments', a => a.projectId === projectId);
export const STATUS = { cours: 'En cours', avenir: 'À venir', fini: 'Terminé · archivé' };

export function duplicateProject(p) {
  let copy;
  const undo = db.commit(w => {
    copy = w.put('projects', {
      title: p.title + ' (copie)', desc: p.desc, nSeances: p.nSeances,
      criteria: p.criteria.map(c => ({ ...c, id: db.uid() })),
    });
  });
  return { copy, undo };
}

// ---------- Séances d'un projet dans une classe ----------
export function newSeance(a) {
  const ss = seancesOf(a.id);
  let rec;
  const undo = db.commit(w => {
    if (a.status !== 'cours') w.update('assignments', a.id, { status: 'cours', endedAt: null });
    rec = w.put('seances', { assignmentId: a.id, n: ss.length + 1, date: todayISO(), text: '' });
  });
  return { seance: rec, undo };
}
export function updateSeance(id, patch) { return db.commit(w => w.update('seances', id, patch)); }
export function finishAssignment(a) { return db.commit(w => w.update('assignments', a.id, { status: 'fini', endedAt: todayISO() })); }
export function reopenAssignment(a) { return db.commit(w => w.update('assignments', a.id, { status: 'cours', endedAt: null })); }

// Suppression complète d'une assignation (projet retiré d'une classe) et de tout ce qui en dépend.
export function deleteAssignmentIn(w, aid) {
  for (const s of ['seances', 'groups', 'evals', 'groupChanges']) for (const r of db.where(s, x => x.assignmentId === aid)) w.del(s, r.id);
  for (const o of db.where('observations', x => x.assignmentId === aid)) w.update('observations', o.id, { assignmentId: null });
  for (const o of db.where('absences', x => x.assignmentId === aid)) w.update('absences', o.id, { assignmentId: null });
  for (const o of db.where('appels', x => x.assignmentId === aid)) w.update('appels', o.id, { assignmentId: null });
  w.del('assignments', aid);
}
// Suppression complète d'un élève : observations, notes, photo, place dans les groupes.
export function deleteStudentIn(w, sid) {
  const s = db.get('students', sid);
  if (!s) return;
  for (const st of ['observations', 'notes', 'evals', 'groupChanges', 'absences']) for (const r of db.where(st, x => x.studentId === sid)) w.del(st, r.id);
  for (const g of db.where('groups', x => x.members.includes(sid))) w.update('groups', g.id, { members: g.members.filter(m => m !== sid) });
  if (s.photoId) w.del('photos', s.photoId);
  w.del('students', sid);
}

// Suppression d'une classe : élèves (photos, observations, notes) et projets associés (séances, groupes, notes).
export function deleteClassIn(w, classId) {
  for (const s of db.where('students', x => x.classId === classId)) deleteStudentIn(w, s.id);
  for (const a of db.where('assignments', x => x.classId === classId)) deleteAssignmentIn(w, a.id);
  for (const o of db.where('observations', x => x.classId === classId)) w.del('observations', o.id);
  for (const o of db.where('absences', x => x.classId === classId)) w.del('absences', o.id);
  for (const o of db.where('appels', x => x.classId === classId)) w.del('appels', o.id);
  w.del('classes', classId);
}
export const deleteClass = classId => db.commit(w => deleteClassIn(w, classId));
// Suppression d'un projet : sa définition et, dans chaque classe, ses séances, groupes et évaluations.
export function deleteProject(projectId) {
  return db.commit(w => {
    for (const a of db.where('assignments', x => x.projectId === projectId)) deleteAssignmentIn(w, a.id);
    w.del('projects', projectId);
  });
}

// ---------- Résultats (niveaux par élève, ajustements compris) ----------
export const groupsOf = aid => db.where('groups', g => g.assignmentId === aid).sort((a, b) => cmp(a.code, b.code));
export const evalOf = (aid, sid) => db.all('evals').find(e => e.assignmentId === aid && e.studentId === sid);
// Niveaux d'un élève : ceux de son groupe, remplacés par ceux gardés d'un ancien groupe, puis par ses ajustements.
export function studentLevels(aid, sid) {
  const g = db.all('groups').find(x => x.assignmentId === aid && x.members.includes(sid));
  const e = evalOf(aid, sid);
  return { ...(g ? g.levels : {}), ...(e ? e.carried : {}), ...(e ? e.adj : {}) };
}
export function results(a) {
  const p = db.get('projects', a.projectId);
  const crit = p ? p.criteria : [];
  const groups = groupsOf(a.id).map(g => {
    const r = computeNote(g.levels, crit);
    return { code: g.code, members: g.members.map(id => db.get('students', id)).filter(Boolean), ...r };
  });
  const indiv = studentsOf(a.classId)
    .filter(s => db.all('groups').some(g => g.assignmentId === a.id && g.members.includes(s.id)) || evalOf(a.id, s.id))
    .map(s => computeNote(studentLevels(a.id, s.id), crit)).filter(r => r.complete);
  const avg = indiv.length ? indiv.reduce((t, r) => t + r.n, 0) / indiv.length : null;
  return { groups, avg, nComplete: indiv.length };
}

// ---------- Groupes ----------
export const groupOfStudent = (aid, sid) => db.all('groups').find(g => g.assignmentId === aid && g.members.includes(sid));
export function nextGroupCode(aid) {
  const nums = groupsOf(aid).map(g => parseInt(g.code.replace(/\D/g, ''), 10) || 0);
  return 'G' + String(Math.max(0, ...nums) + 1).padStart(2, '0');
}
export const groupChangesOf = aid => db.where('groupChanges', c => c.assignmentId === aid).sort((a, b) => b.at.localeCompare(a.at));

// Place des élèves dans un groupe (targetId), les retire de leur groupe (targetId = null),
// ou crée un nouveau groupe (createNew). Un élève qui quitte un groupe garde les niveaux déjà
// obtenus (« carried ») et prendra ceux de son nouveau groupe pour les critères restants.
export function moveStudents(a, sids, targetId, createNew = false) {
  let created = null;
  const undo = db.commit(w => {
    if (createNew) created = w.put('groups', { assignmentId: a.id, code: nextGroupCode(a.id), members: [], comment: '', levels: {} });
    const targetGid = created ? created.id : targetId;
    const grading = groupsOf(a.id).some(g => Object.values(g.levels || {}).some(v => v != null));
    const n = seancesOf(a.id).length;
    for (const sid of sids) {
      const from = groupOfStudent(a.id, sid);
      if (from && from.id === targetGid) continue;
      if (!from && !targetGid) continue;
      if (from) {
        w.update('groups', from.id, g => ({ members: g.members.filter(m => m !== sid) }));
        const filled = Object.fromEntries(Object.entries(from.levels || {}).filter(([, v]) => v != null));
        if (Object.keys(filled).length) {
          const e = evalOf(a.id, sid);
          const carried = { ...filled, ...(e ? e.carried : {}) };
          if (e) w.update('evals', e.id, { carried });
          else w.put('evals', { assignmentId: a.id, studentId: sid, carried, adj: {}, motif: '', precision: '' });
        }
      }
      if (targetGid) w.update('groups', targetGid, g => ({ members: [...g.members, sid] }));
      // Pendant la constitution des groupes (aucune note encore), on ne trace que les changements d'un groupe à un autre.
      if (from || grading) {
        const to = targetGid ? db.get('groups', targetGid) : null;
        w.put('groupChanges', { assignmentId: a.id, studentId: sid, from: from ? from.code : null, to: to ? to.code : null, at: new Date().toISOString(), seanceN: n });
      }
    }
  });
  return { undo, created };
}
export function deleteGroup(gid) { return db.commit(w => w.del('groups', gid)); }

// ---------- Évaluations ----------
export function setGroupLevel(gid, critId, v) {
  return db.commit(w => w.update('groups', gid, g => {
    const levels = { ...g.levels };
    if (v == null) delete levels[critId]; else levels[critId] = v;
    return { levels };
  }));
}
export const setGroupComment = (gid, comment) => db.commit(w => w.update('groups', gid, { comment }));
// Niveau de référence d'un élève pour un critère (avant ajustement) : acquis d'un ancien groupe, sinon celui de son groupe.
export function baseLevel(aid, sid, critId) {
  const e = evalOf(aid, sid);
  if (e && e.carried && e.carried[critId] != null) return { v: e.carried[critId], carried: true };
  const g = groupOfStudent(aid, sid);
  return { v: g && g.levels[critId] != null ? g.levels[critId] : null, carried: false };
}
export function setAdjustment(aid, sid, critId, v) {
  return db.commit(w => {
    const e = evalOf(aid, sid);
    const adj = { ...(e ? e.adj : {}) };
    if (v == null || v === baseLevel(aid, sid, critId).v) delete adj[critId]; else adj[critId] = v;
    const motif = e && e.motif ? e.motif : 'Absent';
    if (e) w.update('evals', e.id, { adj, motif });
    else w.put('evals', { assignmentId: aid, studentId: sid, carried: {}, adj, motif, precision: '' });
  });
}
export function setAdjustmentInfo(aid, sid, patch) {
  const e = evalOf(aid, sid);
  if (!e) return null;
  return db.commit(w => w.update('evals', e.id, patch));
}
export const hasAdjustment = (aid, sid) => { const e = evalOf(aid, sid); return !!(e && ((e.adj && Object.keys(e.adj).length) || (e.carried && Object.keys(e.carried).length))); };
export const ADJ_MOTIFS = ['Absent', 'N’a pas travaillé', 'Autre'];

// ---------- Notation par niveaux (chaque critère sur 4 pts) ----------
export const LEVELS = [
  { v: 1, name: 'Rouge', pronote: 'Non atteint', bg: '#f5a79f', fg: '#2b2d42' },
  { v: 2, name: 'Jaune', pronote: 'Partiellement atteint', bg: '#f7dc7c', fg: '#2b2d42' },
  { v: 3, name: 'Vert clair', pronote: 'Atteint', bg: '#c4e7a8', fg: '#2b2d42' },
  { v: 4, name: 'Vert foncé', pronote: 'Dépassé', bg: '#5aa56a', fg: '#10251a' },
];
// Note /20 = moyenne des niveaux renseignés × 5. « complete » si tous les critères sont notés.
export function computeNote(levels, criteria) {
  const filled = criteria.filter(c => levels[c.id] != null);
  if (!filled.length) return { n: null, complete: false, filled: 0, total: criteria.length };
  const n = filled.reduce((s, c) => s + levels[c.id], 0) / filled.length * 5;
  return { n, complete: filled.length === criteria.length, filled: filled.length, total: criteria.length };
}
export function mention(n) {
  if (n == null) return '—';
  return n < 10 ? 'À approfondir' : n < 13 ? 'Satisfaisant' : n < 17 ? 'Bien' : 'Très bien';
}
export const f1 = n => (n == null ? '—' : (Math.round(n * 10) / 10).toString().replace('.', ','));
