// backup.js — Fichiers produits par l'app : sauvegarde complète (données + photos), CSV.
import * as db from './db.js';
import * as model from './model.js';
import { todayISO } from './ui.js';

// Donne un fichier à l'utilisateur : partage Android (Drive, mail…) si demandé et possible, sinon téléchargement.
export async function giveFile(blob, name, { share = false } = {}) {
  if (share) {
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return 'shared'; }
      catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'downloaded';
}

// ---------- Sauvegarde complète ----------
export async function backupBlob() {
  const snap = await db.exportSnapshot();
  return new Blob([JSON.stringify(snap)], { type: 'application/json' });
}
export function markBackupDone() {
  db.commit(w => w.meta('lastBackupAt', new Date().toISOString()), { track: false });
}
export const backupName = (prefix = 'carnet-sauvegarde') => `${prefix}-${todayISO()}.json`;

// Lit un fichier de sauvegarde et renvoie son contenu avec un résumé, sans rien modifier.
export async function readBackup(file) {
  let snap;
  try { snap = JSON.parse(await file.text()); } catch (e) { throw new Error('Ce fichier n’est pas une sauvegarde lisible.'); }
  if (!snap || snap.app !== 'carnet-de-classe' || !snap.data) throw new Error('Ce fichier n’est pas une sauvegarde du Carnet de classe.');
  const n = k => (Array.isArray(snap.data[k]) ? snap.data[k].length : 0);
  const year = (snap.data.meta || []).find(m => m.id === 'schoolYear');
  return { snap, summary: { date: snap.exportedAt, classes: n('classes'), students: n('students'), photos: n('photos'), projects: n('projects'), year: year ? year.value : '' } };
}
export async function restore(snap) { await db.importSnapshot(snap); }

// ---------- CSV (séparateur « ; », compatible Excel / LibreOffice en français) ----------
const cell = v => { const s = v == null ? '' : String(v); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export function csvBlob(rows) {
  return new Blob(['﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
}
const num = n => (n == null ? '' : (Math.round(n * 10) / 10).toString().replace('.', ','));
const safe = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Résultats d'un élève pour chaque projet de sa classe qui a des évaluations.
export function projectResults(student) {
  return model.selectableAssignments(student.classId, ['fini', 'cours', 'avenir']).map(a => {
    const p = db.get('projects', a.projectId);
    const levels = model.studentLevels(a.id, student.id);
    const r = model.computeNote(levels, p.criteria);
    const g = model.groupOfStudent(a.id, student.id);
    const e = model.evalOf(a.id, student.id);
    return { a, p, levels, r, group: g ? g.code : '', adj: e && e.adj && Object.keys(e.adj).length ? e : null };
  }).filter(x => x.r.filled > 0);
}

// Récapitulatif de la classe : une ligne par élève, compteurs par trimestre et notes de projet.
export function recapRows(classId) {
  const students = model.studentsOf(classId);
  const assigns = model.selectableAssignments(classId, ['fini', 'cours', 'avenir'])
    .filter(a => students.some(s => model.computeNote(model.studentLevels(a.id, s.id), db.get('projects', a.projectId).criteria).filled));
  const head = ['NOM', 'Prénom'];
  for (const t of [1, 2, 3]) head.push(`T${t} Comportement`, `T${t} Aide`);
  for (const a of assigns) { const p = db.get('projects', a.projectId); head.push(`${p.title} /20`, `${p.title} mention`); }
  const rows = [head];
  for (const s of students) {
    const row = [s.nom, s.prenom];
    for (const t of [1, 2, 3]) {
      if (t > model.trimester()) row.push('', '');
      else { const c = model.countsOf(s.id, t); row.push(c.neg, c.pos); }
    }
    for (const a of assigns) {
      const r = model.computeNote(model.studentLevels(a.id, s.id), db.get('projects', a.projectId).criteria);
      row.push(r.n == null ? '' : num(r.n) + (r.complete ? '' : ' (provisoire)'), r.complete ? model.mention(r.n) : '');
    }
    rows.push(row);
  }
  return { rows, assigns };
}
export function recapCsv(classId) {
  const c = db.get('classes', classId);
  return { blob: csvBlob(recapRows(classId).rows), name: `recapitulatif-${safe(c.name)}-${todayISO()}.csv` };
}

// Niveaux par compétence (à recopier dans Pronote) pour un projet d'une classe.
export function pronoteCsv(assignmentId) {
  const a = db.get('assignments', assignmentId);
  const c = db.get('classes', a.classId), p = db.get('projects', a.projectId);
  const head = ['NOM', 'Prénom', 'Groupe', ...p.criteria.map(cr => `${cr.code} ${cr.label}${cr.pronote ? ' — ' + cr.pronote : ''}`), 'Note /20', 'Mention', 'Ajustement'];
  const rows = [head];
  for (const s of model.studentsOf(a.classId)) {
    const levels = model.studentLevels(a.id, s.id);
    const r = model.computeNote(levels, p.criteria);
    const g = model.groupOfStudent(a.id, s.id);
    const e = model.evalOf(a.id, s.id);
    rows.push([s.nom, s.prenom, g ? g.code : '',
      ...p.criteria.map(cr => (levels[cr.id] == null ? '' : `${levels[cr.id]} - ${model.LEVELS[levels[cr.id] - 1].pronote}`)),
      r.n == null ? '' : num(r.n) + (r.complete ? '' : ' (provisoire)'), r.complete ? model.mention(r.n) : '',
      e && e.adj && Object.keys(e.adj).length ? [e.motif, e.precision].filter(Boolean).join(' : ') : '']);
  }
  return { blob: csvBlob(rows), name: `competences-${safe(c.name)}-${safe(p.title)}-${todayISO()}.csv` };
}

export function nextSchoolYear(y) {
  const m = /^(\d{4})\D+(\d{4})$/.exec(y || '');
  return m ? `${+m[1] + 1}–${+m[2] + 1}` : model.schoolYearFor(new Date(Date.now() + 200 * 864e5));
}
// Fin d'année : supprime toutes les classes (et leurs élèves, photos, séances…), garde les projets, passe à l'année suivante.
export function startNewYear() {
  const next = nextSchoolYear(model.schoolYear());
  return db.commit(w => {
    for (const c of db.all('classes')) model.deleteClassIn(w, c.id);
    w.meta('schoolYear', next);
    w.meta('trimester', 1);
    w.meta('trimesterStarts', { 1: todayISO() });
  });
}
