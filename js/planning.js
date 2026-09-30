// planning.js — Emploi du temps : établissements, cours importés de Pronote, vacances, rôles des matières,
// correspondance « classe Pronote → classe de l'app » (propre à chaque établissement).
//
// Tables (db.js) :
//   etablissements { name, initiales, color, classes: { [nomPronoteNormalisé]: { name, classId } }, importedAt }
//                  classId = id d'une classe de l'app, ou '' = ignorée ; absente = pas encore décidée.
//   cours          { etabId, date, debut, fin, classe (nom Pronote), salle, matiere, statut, statutLabel, source: 'pronote',
//                    perso?: { date, debut, fin, salle, annule } (modifications du professeur, prioritaires), note? }
//                  ou, ajouté à la main : { source: 'manuel', classId, etabId|null, date, debut, fin, salle, role, annule?, serieId?, note? }
//                  Les champs Pronote ne sont jamais modifiés par le professeur : la réimportation compare Pronote à Pronote,
//                  et l'affichage utilise eff(cours) = champs Pronote + « perso ».
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
  if (cours.source === 'manuel') return cours.classId && db.get('classes', cours.classId) ? cours.classId : null;
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
  const d = diffCours(existing, plan.cours);
  // Un cours disparu de Pronote mais modifié ou annoté par le professeur est conservé (conflits : étape 6).
  const gardes = d.suppressions.filter(isPerso);
  return { ...d, suppressions: d.suppressions.filter(c => !isPerso(c)), gardes, jours: plan.jours.length, joursAvant: plan.etab ? joursOfEtab(plan.etab.id).length : 0 };
}
const isPerso = c => !!((c.perso && Object.keys(c.perso).length) || c.note);

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

// ---------- Cours tel qu'affiché : Pronote + modifications du professeur ----------
// Renvoie une copie : { ...cours, ...perso, statut, statutLabel, modifie (bool), src (l'enregistrement) }.
export function eff(c) {
  const p = c.perso || {};
  const annule = c.source === 'manuel' ? !!c.annule : !!p.annule;
  const e = { ...c, ...p, src: c, modifie: c.source !== 'manuel' && Object.keys(p).length > 0 };
  if (annule) Object.assign(e, { statut: 'annule_perso', statutLabel: 'Annulé' });
  delete e.perso;
  return e;
}
export const roleOfCours = c => (c.source === 'manuel' ? c.role || 'suivi' : roleOf(c.matiere));
// Cours dont le statut supprime l'appel et les alertes (annulé, classe absente, sortie, absence personnelle).
export const OFF = new Set(['annule', 'annule_perso', 'classe_absente', 'abs_perso']);
export const NO_ALERT = new Set([...OFF, 'sortie']);

// Cours (affichés) entre deux dates incluses, rôle « masqué » exclu.
export function coursEntre(du, au) {
  return db.all('cours').map(eff).filter(e => e.date >= du && e.date <= au && roleOfCours(e) !== 'masque');
}

// ---------- Dates ----------
const p2 = n => String(n).padStart(2, '0');
const isoOf = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d); };
const dayDiff = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
const weekday = iso => new Date(iso + 'T12:00:00').getDay();
// Dernier jour de l'année scolaire : le dernier cours importé, sinon début juillet.
export function finAnnee(fromIso) {
  const last = db.all('cours').reduce((m, c) => (c.date > m ? c.date : m), '');
  const y = +fromIso.slice(0, 4) + (+fromIso.slice(5, 7) >= 8 ? 1 : 0);
  return last > fromIso ? last : `${y}-07-04`;
}
export const isOffDay = iso => db.all('jours').some(j => iso >= j.du && iso <= j.au);

// ---------- Série : « ce cours et toutes les semaines suivantes » ----------
// Même classe, même jour de la semaine, même créneau (heure de début affichée), à partir de ce cours.
const classKeyOf = c => classIdOf(c) || (c.etabId || '') + '|' + normClasse(c.classe);
export function suivants(c) {
  const e = eff(c), key = classKeyOf(c), wd = weekday(e.date);
  return db.all('cours').filter(x => x.id !== c.id).filter(x => {
    const ex = eff(x);
    return ex.date > e.date && weekday(ex.date) === wd && ex.debut === e.debut && classKeyOf(x) === key;
  });
}

// Applique des changements à un cours dans une écriture : cours manuel → directement ;
// cours Pronote → dans « perso » (un champ revenu à la valeur Pronote est retiré).
function applyTo(w, c, patch) {
  if (c.source === 'manuel') return w.update('cours', c.id, patch);
  const perso = { ...(c.perso || {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'annule') { if (v) perso.annule = true; else delete perso.annule; continue; }
    if ((c[k] || '') === (v || '')) delete perso[k]; else perso[k] = v;
  }
  return w.update('cours', c.id, { perso });
}

// Modifier / déplacer : { date, debut, fin, salle }. serie = true : aussi les semaines suivantes
// (décalées du même nombre de jours, mêmes heures et salle).
export function editCours(c, changes, serie = false) {
  const e = eff(c);
  const shift = changes.date ? dayDiff(e.date, changes.date) : 0;
  const targets = serie ? suivants(c) : [];
  return db.commit(w => {
    applyTo(w, c, changes);
    for (const t of targets) {
      const et = eff(t);
      applyTo(w, t, { ...changes, date: shift ? addDays(et.date, shift) : et.date });
    }
  });
}
export const setAnnule = (c, annule) => db.commit(w => applyTo(w, c, { annule }));
export const setNote = (c, note) => db.commit(w => w.update('cours', c.id, { note: note.trim() || undefined }));
// Revenir à la version Pronote (les modifications sont effacées ; la note est gardée).
export const resetPerso = c => db.commit(w => w.update('cours', c.id, { perso: undefined }));

// Ajout à la main. repeat : chaque semaine jusqu'à la fin de l'année (vacances et fériés sautés).
export function addCours({ classId, etabId = null, date, debut, fin, salle = '', role = 'suivi' }, repeat = false) {
  const cls = db.get('classes', classId);
  const base = { source: 'manuel', classId, classe: cls ? cls.name : '', etabId, debut, fin, salle, role, matiere: '', statut: 'normal', statutLabel: '' };
  const dates = [date];
  if (repeat) { const end = finAnnee(date); for (let d = addDays(date, 7); d <= end; d = addDays(d, 7)) if (!isOffDay(d)) dates.push(d); }
  const serieId = repeat ? db.uid() : undefined;
  let first = null;
  const undo = db.commit(w => { for (const d of dates) { const r = w.put('cours', { ...base, date: d, serieId }); first = first || r; } });
  return { undo, n: dates.length, first };
}
// Suppression d'un cours ajouté à la main (et, si serie, des semaines suivantes).
export function deleteCours(c, serie = false) {
  const targets = serie ? suivants(c).filter(x => x.source === 'manuel') : [];
  return db.commit(w => { w.del('cours', c.id); for (const t of targets) w.del('cours', t.id); });
}

// ---------- Cours « en contexte » d'une classe (note affichée dans le trombinoscope, appel à l'étape 5) ----------
let lastOpened = null; // { id, classId, at } : dernier cours touché dans le planning
export function openedFromPlanning(c) { lastOpened = { id: c.id, classId: classIdOf(c), at: Date.now() }; }
export function coursContexte(classId, now = new Date()) {
  if (lastOpened && lastOpened.classId === classId && Date.now() - lastOpened.at < 3 * 3600e3) {
    const c = db.get('cours', lastOpened.id);
    if (c) return eff(c);
  }
  const today = isoOf(now), m = now.getHours() * 60 + now.getMinutes();
  const toMin = s => +s.slice(0, 2) * 60 + +s.slice(3, 5);
  const list = db.all('cours').map(eff).filter(e => e.date === today && classIdOf(e.src) === classId && !OFF.has(e.statut))
    .sort((a, b) => a.debut.localeCompare(b.debut));
  // Le cours en cours, sinon le prochain de la journée, sinon le dernier passé.
  return list.find(e => m >= toMin(e.debut) - 15 && m < toMin(e.fin)) || list.find(e => toMin(e.debut) > m) || list[list.length - 1] || null;
}
