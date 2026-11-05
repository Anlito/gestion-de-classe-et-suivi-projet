// backup.js — Fichiers produits par l'app : sauvegarde complète (données + photos), CSV.
import * as db from './db.js';
import * as model from './model.js';
import { todayISO } from './ui.js';
import { clearYearIn } from './planning.js';
import * as stats from './stats.js';

// Le navigateur sait-il ouvrir une fenêtre « Enregistrer sous » (choix du dossier) ?
export const canChooseFolder = () => typeof window.showSaveFilePicker === 'function';

const TYPES = {
  'application/json': { description: 'Sauvegarde du Carnet de classe', accept: { 'application/json': ['.json'] } },
  'text/csv;charset=utf-8': { description: 'Tableau CSV', accept: { 'text/csv': ['.csv'] } },
};

// Donne un fichier à l'utilisateur :
// - share : menu de partage Android (Drive, e-mail…) ;
// - sinon, fenêtre « Enregistrer sous » si le navigateur la propose (choix du dossier et du nom) ;
// - sinon, téléchargement classique (dossier Téléchargements).
// source : le fichier (Blob) ou une fonction async qui le fabrique (appelée après le choix du dossier,
// car la fenêtre « Enregistrer sous » doit s'ouvrir tout de suite après le toucher).
// Renvoie { how: 'shared' | 'saved' | 'downloaded' | 'cancelled', where?, size? }.
export async function giveFile(source, name, { share = false, type = 'application/json' } = {}) {
  const make = async () => (typeof source === 'function' ? source() : source);
  if (share) {
    const blob = await make();
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return { how: 'shared', size: blob.size }; }
      catch (e) { if (e && e.name === 'AbortError') return { how: 'cancelled' }; }
    }
    return download(blob, name);
  }
  if (canChooseFolder()) {
    let handle = null;
    try {
      const t = TYPES[type];
      handle = await window.showSaveFilePicker({
        suggestedName: name, id: 'carnet-fichiers', startIn: 'documents',
        ...(t ? { types: [t] } : {}),
      });
    } catch (e) {
      if (e && e.name === 'AbortError') return { how: 'cancelled' };
      handle = null; // fenêtre indisponible : téléchargement classique ci-dessous
    }
    if (handle) {
      const blob = await make();
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      return { how: 'saved', where: handle.name, size: blob.size };
    }
  }
  return download(await make(), name);
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return { how: 'downloaded', where: name, size: blob.size };
}
// Message à afficher après giveFile.
const FEMININE = ['Sauvegarde', 'Archive'];
export function givenMessage(r, what = 'Fichier') {
  const e = FEMININE.includes(what) ? 'e' : '';
  if (r.how === 'saved') return `${what} enregistré${e} : ${r.where}`;
  if (r.how === 'shared') return `${what} envoyé${e}`;
  if (r.how === 'downloaded') return `${what} enregistré${e} dans les Téléchargements`;
  return '';
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
  return { snap, summary: { date: snap.exportedAt, classes: n('classes'), students: n('students'), photos: n('photos'), projects: n('projects'), cours: n('cours'), year: year ? year.value : '' } };
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
  // Présence : appels sans absence / appels de la classe (retard = présent), par trimestre, sur l'année, par projet.
  const pc = p => (p.appels ? String(Math.round(p.taux * 100)) + ' %' : '');
  const projFilter = a => (x => x.assignmentId === a.id && x.seanceId);
  const head = ['NOM', 'Prénom'];
  for (const t of [1, 2, 3]) head.push(`T${t} Présence`, `T${t} Comportement`, `T${t} Aide`, `T${t} Absences`, `T${t} Retards`);
  head.push('Année Présence');
  for (const a of assigns) { const p = db.get('projects', a.projectId); head.push(`${p.title} /20`, `${p.title} mention`, `${p.title} présence`); }
  const rows = [head];
  for (const s of students) {
    const row = [s.nom, s.prenom];
    for (const t of [1, 2, 3]) {
      if (t > model.trimester()) row.push('', '', '', '', '');
      else { const c = model.countsOf(s.id, t); row.push(pc(stats.presenceEleve(s, t)), c.neg, c.pos, model.absenceCount(s.id, t), model.retardCount(s.id, t)); }
    }
    row.push(pc(stats.presenceEleve(s)));
    for (const a of assigns) {
      const r = model.computeNote(model.studentLevels(a.id, s.id), db.get('projects', a.projectId).criteria);
      row.push(r.n == null ? '' : num(r.n) + (r.complete ? '' : ' (provisoire)'), r.complete ? model.mention(r.n) : '', pc(stats.presenceEleve(s, null, projFilter(a))));
    }
    rows.push(row);
  }
  // Dernière ligne : moyenne de la classe (présence).
  if (students.length) {
    const avg = p => (p.moyenne == null ? '' : String(Math.round(p.moyenne * 100)) + ' %');
    const row = ['MOYENNE DE LA CLASSE', ''];
    for (const t of [1, 2, 3]) row.push(t > model.trimester() ? '' : avg(stats.presenceClasse(classId, t)), '', '', '', '');
    row.push(avg(stats.presenceClasse(classId)));
    for (const a of assigns) row.push('', '', avg(stats.presenceProjet(a)));
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

// ---------- Archives des années (1.17.0) ----------
// Une archive = l'instantané complet de l'année (format d'une sauvegarde), gardé dans l'app (table à part, voir
// db.js) pour être CONSULTÉ en lecture seule sans toucher à l'année en cours ; en mode Google Drive, une copie va
// dans le dossier Drive (carnet-archive-AAAA-AAAA.json) pour les autres appareils.
export const archiveId = year => 'annee-' + (year || 'inconnue').replace(/\D+/g, '-').replace(/^-|-$/g, '');
export const archiveFileName = year => `carnet-archive-${(year || 'inconnue').replace(/\D+/g, '-').replace(/^-|-$/g, '')}.json`;
const summaryOf = data => {
  const n = k => (Array.isArray(data[k]) ? data[k].length : 0);
  return { classes: n('classes'), students: n('students'), photos: n('photos'), projects: n('projects') };
};
// Archive l'année en cours (remplace une archive précédente de la même année). Renvoie l'enregistrement.
export async function creerArchive() {
  const snap = await db.exportSnapshot();
  const year = model.schoolYear();
  const blob = new Blob([JSON.stringify(snap)], { type: 'application/json' });
  const old = await db.getArchive(archiveId(year));
  const rec = { id: archiveId(year), year, createdAt: new Date().toISOString(), summary: summaryOf(snap.data), size: blob.size, blob, driveId: old && old.driveId };
  await db.saveArchive(rec);
  return rec;
}
// Ajoute aux archives un fichier (archive ou sauvegarde d'une année passée). Renvoie l'enregistrement.
export async function importerArchive(blobOrFile, extra = {}) {
  let snap;
  try { snap = JSON.parse(await blobOrFile.text()); } catch (e) { throw new Error('Ce fichier n’est pas une archive lisible.'); }
  if (!snap || snap.app !== 'carnet-de-classe' || !snap.data) throw new Error('Ce fichier n’est pas une archive du Carnet de classe.');
  const y = (snap.data.meta || []).find(m => m.id === 'schoolYear');
  const year = (y && y.value) || model.schoolYearFor(new Date(snap.exportedAt || Date.now()));
  const blob = blobOrFile instanceof Blob ? new Blob([blobOrFile], { type: 'application/json' }) : blobOrFile;
  const rec = { id: archiveId(year), year, createdAt: snap.exportedAt || new Date().toISOString(), summary: summaryOf(snap.data), size: blob.size, blob, ...extra };
  await db.saveArchive(rec);
  return rec;
}
// Ouvre une archive en consultation (lecture seule).
export async function consulter(rec) {
  let snap;
  try { snap = JSON.parse(await rec.blob.text()); } catch (e) { throw new Error('Archive illisible.'); }
  await db.openArchive(rec, snap);
}
export const archiveDeCetteAnnee = async () => !!(await db.getArchive(archiveId(model.schoolYear())));

export function nextSchoolYear(y) {
  const m = /^(\d{4})\D+(\d{4})$/.exec(y || '');
  return m ? `${+m[1] + 1}–${+m[2] + 1}` : model.schoolYearFor(new Date(Date.now() + 200 * 864e5));
}
// Fin d'année : supprime toutes les classes (et leurs élèves, photos, séances…), garde les projets, passe à l'année suivante.
export function startNewYear() {
  const next = nextSchoolYear(model.schoolYear());
  return db.commit(w => {
    for (const c of db.all('classes')) model.deleteClassIn(w, c.id);
    clearYearIn(w);
    w.meta('schoolYear', next);
    w.meta('trimester', 1);
    w.meta('trimesterStarts', { 1: todayISO() });
  });
}
