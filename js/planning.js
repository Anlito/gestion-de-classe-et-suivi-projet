// planning.js — Emploi du temps : établissements, cours importés de Pronote, vacances, rôles des matières,
// correspondance « classe Pronote → classe de l'app » (propre à chaque établissement).
//
// Tables (db.js) :
//   etablissements { name, initiales, color, classes: { [nomPronoteNormalisé]: { name, classId } }, importedAt }
//                  classId = id d'une classe de l'app, ou '' = ignorée ; absente = pas encore décidée.
//   cours          { etabId, date, debut, fin, classe (nom Pronote), salle, matiere, statut, statutLabel, source: 'pronote' }
//   jours          { etabId, du, au, type: 'vacances'|'ferie', label }
// Réglage meta.matiereRoles = { MATIÈRE: 'suivi'|'appel'|'grise'|'masque' } (seulement les choix modifiés).
import * as db from './db.js';
import { normClasse, parseICS, STATUTS } from './ical.js';

// ---------- Rôle des matières ----------
export const ROLES = {
  suivi: { label: 'Cours suivi', sub: 'Appel et séance de projet' },
  appel: { label: 'Appel seulement', sub: 'Pas de séance de projet' },
  grise: { label: 'En grisé', sub: 'Visible, sans alerte' },
  masque: { label: 'Masqué', sub: 'N’apparaît pas au planning' },
};
const upper = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
export function defaultRole(matiere) {
  const m = upper(matiere);
  if (/TECHNO/.test(m)) return 'suivi';
  if (/VIE DE CLASSE/.test(m)) return 'appel';
  return 'masque';
}
export const roleOf = matiere => db.getMeta('matiereRoles', {})[matiere] || defaultRole(matiere);
export function setRole(matiere, role) {
  const roles = { ...db.getMeta('matiereRoles', {}) };
  if (role === defaultRole(matiere)) delete roles[matiere]; else roles[matiere] = role;
  return db.commit(w => w.meta('matiereRoles', roles));
}
// Matières connues (cours importés), avec leur nombre de cours.
export function matieres() {
  const m = new Map();
  for (const c of db.all('cours')) m.set(c.matiere, (m.get(c.matiere) || 0) + 1);
  return [...m].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n);
}

// ---------- Établissements ----------
export const PALETTE = ['#3d7dd8', '#d9822b', '#2f9e6e', '#b04fc4', '#c9434f', '#8a6d3b'];
export const etablissements = () => db.all('etablissements').sort((a, b) => a.name.localeCompare(b.name, 'fr'));
export const findEtab = name => db.all('etablissements').find(e => normClasse(e.name) === normClasse(name)) || null;
const STOP = new Set(['COLLEGE', 'LYCEE', 'ECOLE', 'CITE', 'SCOLAIRE', 'PUBLIC', 'PRIVE', 'DE', 'DU', 'DES', 'LA', 'LE', 'LES', 'L', 'D', 'ET', 'AU', 'AUX']);
// « COLLEGE JULES VERNE » → « JV » ; « COLLEGE DES TILLEULS » → « T ».
export function initialesFrom(name) {
  const words = upper(name).split(/[^A-Z0-9]+/).filter(w => w && !STOP.has(w));
  return (words.length ? words.map(w => w[0]).join('').slice(0, 3) : upper(name).replace(/[^A-Z]/g, '').slice(0, 2)) || '?';
}
function freeColor() {
  const used = new Set(db.all('etablissements').map(e => e.color));
  return PALETTE.find(c => !used.has(c)) || PALETTE[db.all('etablissements').length % PALETTE.length];
}
export const coursOfEtab = etabId => db.where('cours', c => c.etabId === etabId);
export const joursOfEtab = etabId => db.where('jours', j => j.etabId === etabId).sort((a, b) => a.du.localeCompare(b.du));

// ---------- Correspondance des classes ----------
// Clé de rapprochement : sans espaces ni crochets, sans les initiales du collège, « 4E E » → « 4E ».
export function matchKey(name, initiales = '') {
  let k = normClasse(name);
  const I = normClasse(initiales);
  if (I && k.length > I.length) { if (k.startsWith(I)) k = k.slice(I.length); else if (k.endsWith(I)) k = k.slice(0, -I.length); }
  return k.replace(/^(\d)(?:EME|E)(?=[A-Z0-9])/, '$1');
}
export function suggestClass(pronoteName, initiales, classes = db.all('classes')) {
  const k = matchKey(pronoteName, initiales);
  const hits = classes.filter(c => matchKey(c.name, initiales) === k);
  // Plusieurs candidats (même nom dans les deux collèges) : on préfère celui qui porte les initiales.
  return (hits.find(c => normClasse(c.name).includes(normClasse(initiales))) || hits[0] || null);
}
// Classe de l'app d'un cours (null : classe ignorée, pas encore reliée, ou cours sans classe).
export function classIdOf(cours) {
  const e = db.get('etablissements', cours.etabId);
  const m = e && e.classes ? e.classes[normClasse(cours.classe)] : null;
  return m && m.classId && db.get('classes', m.classId) ? m.classId : null;
}
// Classes Pronote d'une liste de cours : [{ key, name, n, matieres }] (les réunions sans classe sont écartées).
export function pronoteClasses(cours) {
  const m = new Map();
  for (const c of cours) {
    if (!c.classe) continue;
    const key = normClasse(c.classe);
    const x = m.get(key) || { key, name: c.classe, n: 0, matieres: new Set() };
    x.n++; x.matieres.add(c.matiere);
    m.set(key, x);
  }
  return [...m.values()].map(x => ({ ...x, matieres: [...x.matieres] }))
    .sort((a, b) => matchKey(a.name).localeCompare(matchKey(b.name), 'fr', { numeric: true }));
}
export function setClassMap(etabId, map) { return db.commit(w => w.update('etablissements', etabId, { classes: map })); }

// ---------- Import ----------
const FIELDS = ['fin', 'salle', 'matiere', 'statut', 'statutLabel'];
const keyOf = c => [c.date, c.debut, normClasse(c.classe)].join('|');
const pick = c => ({ date: c.date, debut: c.debut, fin: c.fin, classe: c.classe, salle: c.salle, matiere: c.matiere, statut: c.statut, statutLabel: c.statutLabel });

// Différences entre les cours Pronote déjà enregistrés d'un établissement et ceux du nouveau fichier.
// Un cours est reconnu par date + heure de début + classe (les identifiants Pronote changent à chaque export).
export function diffCours(existing, incoming) {
  const byKey = new Map();
  for (const c of existing) { const k = keyOf(c); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(c); }
  const ajouts = [], modifs = [], sames = [];
  for (const n of incoming) {
    const list = byKey.get(keyOf(n));
    const old = list && list.shift();
    if (!old) ajouts.push(n);
    else if (FIELDS.some(f => (old[f] || '') !== (n[f] || ''))) modifs.push({ old, now: n });
    else sames.push(old);
  }
  const suppressions = [...byKey.values()].flat();
  return { ajouts, modifs, suppressions, inchanges: sames.length };
}

// Lit des fichiers .ics et prépare l'import (sans rien enregistrer).
// Renvoie [{ fileName, etabName, etab, initiales, color, cours, jours, classes: [{ key, name, n, matieres, classId, suggested }] }]
export async function readFiles(files) {
  const plans = [];
  for (const f of files) {
    const r = parseICS(await f.text());
    if (!r.cours.length && !r.jours.length) throw new Error(`« ${f.name} » ne contient aucun cours : est-ce bien un export iCal de Pronote ?`);
    const etabName = r.etablissement || f.name.replace(/\.ics$/i, '');
    const etab = findEtab(etabName);
    const initiales = etab ? etab.initiales : initialesFrom(etabName);
    const map = (etab && etab.classes) || {};
    const classes = pronoteClasses(r.cours).map(pc => {
      const known = map[pc.key];
      if (known && (known.classId === '' || db.get('classes', known.classId))) return { ...pc, classId: known.classId, suggested: false };
      const s = suggestClass(pc.name, initiales);
      return { ...pc, classId: s ? s.id : null, suggested: !!s };
    });
    plans.push({ fileName: f.name, etabName, etab, initiales, color: etab ? etab.color : null, cours: r.cours.map(pick), jours: r.jours, classes });
  }
  // Couleurs des nouveaux établissements : différentes entre elles et des existants.
  const used = new Set(db.all('etablissements').map(e => e.color));
  for (const p of plans) if (!p.color) { p.color = PALETTE.find(c => !used.has(c)) || freeColor(); used.add(p.color); }
  return plans;
}
export function previewOf(plan) {
  const existing = plan.etab ? coursOfEtab(plan.etab.id).filter(c => c.source === 'pronote') : [];
  return { ...diffCours(existing, plan.cours), jours: plan.jours.length, joursAvant: plan.etab ? joursOfEtab(plan.etab.id).length : 0 };
}

// Enregistre l'import (une seule action, annulable). Les cours inchangés gardent leur identifiant.
export function applyImport(plans) {
  return db.commit(w => {
    for (const p of plans) {
      const map = { ...((p.etab && p.etab.classes) || {}) };
      for (const c of p.classes) map[c.key] = { name: c.name, classId: c.classId || '' };
      const etab = p.etab
        ? w.update('etablissements', p.etab.id, { initiales: p.initiales, color: p.color, classes: map, importedAt: new Date().toISOString() })
        : w.put('etablissements', { name: p.etabName, initiales: p.initiales, color: p.color, classes: map, importedAt: new Date().toISOString() });
      const d = previewOf({ ...p, etab: p.etab && etab });
      for (const c of d.suppressions) w.del('cours', c.id);
      for (const { old, now } of d.modifs) w.update('cours', old.id, now);
      for (const c of d.ajouts) w.put('cours', { ...c, etabId: etab.id, source: 'pronote' });
      for (const j of joursOfEtab(etab.id)) w.del('jours', j.id);
      for (const j of p.jours) w.put('jours', { ...j, etabId: etab.id });
    }
  });
}

// Suppression d'un établissement et de son emploi du temps (les classes de l'app ne sont pas touchées).
export function deleteEtab(etabId) {
  return db.commit(w => {
    for (const s of ['cours', 'jours']) for (const r of db.where(s, x => x.etabId === etabId)) w.del(s, r.id);
    w.del('etablissements', etabId);
  });
}
// Dans une suppression de classe : les correspondances qui la visaient redeviennent « à choisir ».
export function forgetClassIn(w, classId) {
  for (const e of db.all('etablissements')) {
    const entries = Object.entries(e.classes || {});
    if (!entries.some(([, m]) => m.classId === classId)) continue;
    w.update('etablissements', e.id, { classes: Object.fromEntries(entries.map(([k, m]) => [k, m.classId === classId ? { name: m.name } : m])) });
  }
}
// Fin d'année : l'emploi du temps de l'année écoulée est effacé (les établissements et réglages restent).
export function clearYearIn(w) {
  for (const s of ['cours', 'jours']) for (const r of db.all(s)) w.del(s, r.id);
  for (const e of db.all('etablissements')) w.update('etablissements', e.id, { classes: {}, importedAt: null });
}

export const statutLabel = c => c.statutLabel || (STATUTS[c.statut] && STATUTS[c.statut].label) || '';
