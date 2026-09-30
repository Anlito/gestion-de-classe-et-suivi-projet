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
// Aperçu d'un import, avec les CONFLITS (réglés par le professeur avant de valider) :
// - « modif » : Pronote a changé un cours que le professeur avait modifié (cours.perso : déplacé, salle, statut) ;
//   choix 'moi' (par défaut : ses modifications l'emportent) ou 'pronote' ;
// - « suppr » : Pronote a retiré un cours qui a des données du professeur (modification, note, « pas une séance
//   projet », appel ou séance reliés) ; choix 'garder' (par défaut : devient un cours ajouté à la main, hors de
//   la comparaison avec Pronote) ou 'supprimer' (appels et séances sont gardés, détachés du cours).
// Les autres changements s'appliquent directement.
export function previewOf(plan) {
  const existing = plan.etab ? coursOfEtab(plan.etab.id).filter(c => c.source === 'pronote') : [];
  const d = diffCours(existing, plan.cours);
  const linked = liens();
  const keep = c => isPerso(c) || linked.has(c.id);
  const conflits = [
    ...d.modifs.filter(({ old }) => hasPerso(old)).map(({ old, now }) => ({ type: 'modif', id: old.id, old, now })),
    ...d.suppressions.filter(keep).map(c => ({ type: 'suppr', id: c.id, old: c, raisons: raisons(c, linked) })),
  ];
  return {
    ...d, conflits,
    modifs: d.modifs.filter(({ old }) => !hasPerso(old)),
    suppressions: d.suppressions.filter(c => !keep(c)),
    jours: plan.jours.length, joursAvant: plan.etab ? joursOfEtab(plan.etab.id).length : 0,
  };
}
export const choixParDefaut = conflit => (conflit.type === 'modif' ? 'moi' : 'garder');
const hasPerso = c => !!(c.perso && Object.keys(c.perso).length);
const isPerso = c => !!(hasPerso(c) || c.note || c.pasSeance);
// Cours reliés à un appel ou à une séance.
const liens = () => new Set([...db.all('appels'), ...db.all('seances')].map(x => x.coursId).filter(Boolean));
// Ce que le professeur a sur ce cours (pour expliquer un conflit).
function raisons(c, linked = liens()) {
  const r = [];
  if (hasPerso(c)) r.push('modifié par vous');
  if (c.note) r.push('note');
  if (db.all('appels').some(a => a.coursId === c.id)) r.push('appel');
  if (db.all('seances').some(s => s.coursId === c.id)) r.push('séance de projet');
  if (c.pasSeance) r.push('« pas une séance projet »');
  return r.length ? r : linked.has(c.id) ? ['appel ou séance'] : [];
}

// Enregistre l'import (une seule action, annulable). Les cours inchangés gardent leur identifiant.
// p.choix : { [id du cours en conflit]: 'moi'|'pronote'|'garder'|'supprimer' } (sinon choix par défaut).
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
      for (const k of d.conflits) {
        const choix = (p.choix && p.choix[k.id]) || choixParDefaut(k);
        if (k.type === 'modif') {
          // Les champs Pronote sont toujours mis à jour ; « moi » garde les modifications (perso), « pronote » les efface.
          w.update('cours', k.id, choix === 'pronote' ? { ...k.now, perso: undefined } : k.now);
        } else if (choix === 'supprimer') {
          delierIn(w, new Set([k.id]));
          w.del('cours', k.id);
        } else {
          w.update('cours', k.id, versManuel(k.old));
        }
      }
      for (const c of d.ajouts) w.put('cours', { ...c, etabId: etab.id, source: 'pronote' });
      for (const j of joursOfEtab(etab.id)) w.del('jours', j.id);
      for (const j of p.jours) w.put('jours', { ...j, etabId: etab.id });
    }
  });
}

// Cours Pronote gardé alors que Pronote l'a retiré : devient un cours « ajouté à la main » tel qu'il s'affichait
// (même identifiant : note, appel et séance restent reliés).
function versManuel(c) {
  const e = eff(c);
  const role = roleOf(c.matiere);
  return {
    source: 'manuel', classId: classIdOf(c), date: e.date, debut: e.debut, fin: e.fin, salle: e.salle || '',
    role: role === 'masque' ? 'grise' : role, statut: choixOf(e.statut), statutLabel: STATUT_CHOIX[choixOf(e.statut)].label,
    perso: undefined, retirePronote: true,
  };
}

// Suppression d'un établissement et de son emploi du temps (les classes de l'app ne sont pas touchées ;
// les appels et séances restent, simplement détachés de leur cours).
export function deleteEtab(etabId) {
  return db.commit(w => {
    const ids = new Set(db.where('cours', x => x.etabId === etabId).map(x => x.id));
    delierIn(w, ids);
    for (const s of ['cours', 'jours']) for (const r of db.where(s, x => x.etabId === etabId)) w.del(s, r.id);
    w.del('etablissements', etabId);
  });
}
function delierIn(w, ids) {
  for (const s of ['appels', 'seances']) for (const r of db.where(s, x => x.coursId && ids.has(x.coursId))) w.update(s, r.id, { coursId: null });
}

// Règle : 1 créneau (cours) = 1 appel + 1 séance de projet, quelle que soit sa durée, même si deux créneaux
// de la même classe se suivent.
// Rattache les appels faits sans cours (avant l'import, ou hors planning) au cours correspondant :
// même classe, même date, heure de l'appel entre 30 min avant le début et 15 min après la fin du cours.
// La séance de l'appel est reliée au même cours. Puis les séances encore sans cours (créées dans l'onglet
// Projet) sont reliées, dans l'ordre, aux cours suivis du même jour qui n'ont pas encore de séance.
// Sans cours correspondant, appel ou séance restent tels quels.
export function lierAppels() {
  if (!db.all('cours').length) return 0;
  const n = lierAppelsSeuls();
  return n + lierSeances();
}
function lierSeances() {
  const vivant = id => id && db.get('cours', id);
  const libres = db.where('seances', s => !vivant(s.coursId));
  if (!libres.length) return 0;
  const avecSeance = new Set(db.all('seances').map(s => s.coursId).filter(vivant));
  const liaisons = [];
  const groupes = new Map();
  for (const s of libres) {
    const a = db.get('assignments', s.assignmentId);
    if (!a) continue;
    const k = a.classId + '|' + s.date;
    if (!groupes.has(k)) groupes.set(k, []);
    groupes.get(k).push(s);
  }
  for (const [k, seances] of groupes) {
    const [classId, date] = k.split('|');
    const cours = db.all('cours').map(eff)
      .filter(e => e.date === date && !OFF.has(e.statut) && roleOfCours(e) === 'suivi' && classIdOf(e.src) === classId && !avecSeance.has(e.id))
      .sort((x, y) => x.debut.localeCompare(y.debut));
    seances.sort((x, y) => x.n - y.n).forEach((s, i) => { if (cours[i]) liaisons.push([s, cours[i]]); });
  }
  if (!liaisons.length) return 0;
  db.commit(w => { for (const [s, e] of liaisons) w.update('seances', s.id, { coursId: e.id }); }, { track: false });
  return liaisons.length;
}
function lierAppelsSeuls() {
  // Libres : sans cours, ou dont le cours n'existe plus (import annulé, établissement supprimé…).
  const libres = db.where('appels', a => !a.coursId || !db.get('cours', a.coursId));
  if (!libres.length) return 0;
  const pris = new Set(db.all('appels').map(a => a.coursId).filter(id => id && db.get('cours', id)));
  const parJour = new Map();
  for (const e of db.all('cours').map(eff)) {
    const cid = classIdOf(e.src);
    if (!cid) continue;
    const k = cid + '|' + e.date;
    if (!parJour.has(k)) parJour.set(k, []);
    parJour.get(k).push(e);
  }
  const hhmm = iso => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); };
  const liaisons = [];
  for (const a of libres.sort((x, y) => x.at.localeCompare(y.at))) {
    const t = hhmm(a.at);
    const cands = (parJour.get(a.classId + '|' + a.date) || [])
      .filter(e => !pris.has(e.id) && t >= mins(e.debut) - 30 && t <= mins(e.fin) + 15)
      .sort((x, y) => Math.abs(t - mins(x.debut)) - Math.abs(t - mins(y.debut)));
    if (!cands.length) continue;
    pris.add(cands[0].id);
    liaisons.push([a, cands[0]]);
  }
  if (!liaisons.length) return 0;
  db.commit(w => {
    for (const [a, e] of liaisons) {
      w.update('appels', a.id, { coursId: e.id });
      const s = a.seanceId && db.get('seances', a.seanceId);
      if (s && (!s.coursId || !db.get('cours', s.coursId))) w.update('seances', s.id, { coursId: e.id });
    }
  }, { track: false });
  return liaisons.length;
}

// « Pas une séance projet » : le cours n'aura pas d'alerte « séance à remplir ».
export const setPasSeance = (c, v = true) => db.commit(w => w.update('cours', c.id, { pasSeance: v || undefined }));
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
  const e = { ...c, ...p, src: c, modifie: c.source !== 'manuel' && Object.keys(p).length > 0 };
  // Statut choisi par le professeur (perso.statut, ou statut direct d'un cours ajouté) ; « annule » = ancien format.
  const st = c.source === 'manuel' ? (c.annule ? 'annule' : c.statut) : p.statut || (p.annule ? 'annule' : null);
  if (st) Object.assign(e, { statut: st, statutLabel: STATUT_CHOIX[st] ? STATUT_CHOIX[st].label : '' });
  // Déplacé par le professeur : on garde l'ancien créneau pour « Déplacé depuis … ».
  e.deplaceDe = c.source !== 'manuel' && (p.date || p.debut) && (p.date !== c.date || p.debut !== c.debut) ? { date: c.date, debut: c.debut } : null;
  delete e.perso; delete e.annule;
  return e;
}
// Statuts que le professeur peut choisir (panneau du cours).
export const STATUT_CHOIX = {
  normal: { label: '' , choix: 'Cours normal' },
  annule: { label: 'Annulé', choix: 'Annulé' },
  classe_absente: { label: 'Classe absente', choix: 'Classe absente' },
  sortie: { label: 'Sortie pédagogique', choix: 'Sortie pédagogique' },
};
// Choix correspondant à un statut (les statuts Pronote « déplacé », « modifié »… sont des cours normaux).
export const choixOf = statut => (statut === 'annule_perso' ? 'annule' : STATUT_CHOIX[statut] ? statut : 'normal');
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
  if (c.source === 'manuel') {
    const p = { ...patch };
    if ('statut' in p) { p.statutLabel = STATUT_CHOIX[p.statut] ? STATUT_CHOIX[p.statut].label : ''; p.annule = undefined; }
    return w.update('cours', c.id, p);
  }
  const perso = { ...(c.perso || {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'statut') { delete perso.annule; if (v === choixOf(c.statut)) delete perso.statut; else perso.statut = v; continue; }
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
export const setStatut = (c, statut) => db.commit(w => applyTo(w, c, { statut }));
export const setNote = (c, note) => db.commit(w => w.update('cours', c.id, { note: note.trim() || undefined }));
// Revenir à la version Pronote (les modifications sont effacées ; la note est gardée).
export const resetPerso = c => db.commit(w => w.update('cours', c.id, { perso: undefined }));
// « Remettre à sa place » : annule seulement le déplacement (date et heures), garde statut, salle et note.
export function remettre(c) {
  return db.commit(w => {
    const perso = { ...(c.perso || {}) };
    delete perso.date; delete perso.debut; delete perso.fin;
    w.update('cours', c.id, { perso: Object.keys(perso).length ? perso : undefined });
  });
}

// ---------- Chevauchements et créneaux libres ----------
const mins = s => +s.slice(0, 2) * 60 + +s.slice(3, 5);
// Cours affichés (hors annulés / classe absente / masqués) qui chevauchent un créneau.
// placements : [{ date, debut, fin }] ; ignore : ids de cours à ne pas compter (le cours déplacé lui-même).
export function chevauchements(placements, ignore = []) {
  const skip = new Set(ignore);
  const byDate = new Map();
  for (const e of db.all('cours').map(eff)) {
    if (skip.has(e.id) || OFF.has(e.statut) || roleOfCours(e) === 'masque') continue;
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date).push(e);
  }
  const out = [];
  for (const p of placements) {
    for (const e of byDate.get(p.date) || []) if (mins(p.debut) < mins(e.fin) && mins(e.debut) < mins(p.fin)) out.push({ at: p, cours: e });
  }
  return out;
}
// Dates d'un ajout : une date, ou chaque semaine jusqu'à la fin de l'année (vacances et fériés sautés).
export function datesAjout(date, repeat) {
  const dates = [date];
  if (repeat) { const end = finAnnee(date); for (let d = addDays(date, 7); d <= end; d = addDays(d, 7)) if (!isOffDay(d)) dates.push(d); }
  return dates;
}
// Nouveaux placements d'un déplacement (ce cours, et si serie les semaines suivantes).
export function placementsDeplacement(c, changes, serie) {
  const e = eff(c);
  const shift = changes.date ? dayDiff(e.date, changes.date) : 0;
  const list = [{ id: c.id, date: changes.date || e.date, debut: changes.debut || e.debut, fin: changes.fin || e.fin }];
  if (serie) for (const t of suivants(c)) { const et = eff(t); list.push({ id: t.id, date: shift ? addDays(et.date, shift) : et.date, debut: changes.debut || et.debut, fin: changes.fin || et.fin }); }
  return list;
}
// Créneaux horaires habituels (paires début–fin) : ceux de l'établissement du cours, sinon de tous les cours.
export function creneaux(c) {
  const src = db.all('cours').filter(x => x.source === 'pronote' && (!c.etabId || x.etabId === c.etabId) && roleOf(x.matiere) !== 'masque');
  const seen = new Map();
  for (const x of src) { const k = x.debut + '-' + x.fin; seen.set(k, (seen.get(k) || 0) + 1); }
  // Créneaux fréquents seulement (les horaires exceptionnels restent possibles par « Autre horaire »).
  const min = Math.max(2, Math.floor(src.length / 200));
  return [...seen].filter(([, n]) => n >= min).map(([k]) => ({ debut: k.slice(0, 5), fin: k.slice(6) })).sort((a, b) => a.debut.localeCompare(b.debut));
}

// Ajout à la main. repeat : chaque semaine jusqu'à la fin de l'année (vacances et fériés sautés).
export function addCours({ classId, etabId = null, date, debut, fin, salle = '', role = 'suivi' }, repeat = false) {
  const cls = db.get('classes', classId);
  const base = { source: 'manuel', classId, classe: cls ? cls.name : '', etabId, debut, fin, salle, role, matiere: '', statut: 'normal', statutLabel: '' };
  const dates = datesAjout(date, repeat);
  const serieId = repeat ? db.uid() : undefined;
  let first = null;
  const undo = db.commit(w => { for (const d of dates) { const r = w.put('cours', { ...base, date: d, serieId }); first = first || r; } });
  return { undo, n: dates.length, first };
}
// Suppression d'un cours ajouté à la main (et, si serie, des semaines suivantes).
export function deleteCours(c, serie = false) {
  const targets = serie ? suivants(c).filter(x => x.source === 'manuel') : [];
  return db.commit(w => {
    delierIn(w, new Set([c.id, ...targets.map(t => t.id)]));
    w.del('cours', c.id); for (const t of targets) w.del('cours', t.id);
  });
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
