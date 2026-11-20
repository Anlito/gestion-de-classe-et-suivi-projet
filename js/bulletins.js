// bulletins.js — Onglet Bulletins (1.26.0) : constats par élève et par trimestre pour préparer l'appréciation de discipline.
//
// Une fiche par élève, année et trimestre dans la table « bulletins », d'identifiant fixe (bul:élève:année:trimestre) :
// deux appareils qui remplissent la même fiche la fusionnent par la synchronisation habituelle (la plus récente gagne).
//   { studentId, classId, year, trimester, presence:'normale'|'partielle'|'dispense',
//     levels:{ famille:'pos'|'mid'|'neg' }, details:{ famille:[formulation] }, tendance:'', info:'', note:null|nombre }
// note = correction à la main ; null = note calculée depuis l'onglet Notes (projets du trimestre).
import * as db from './db.js';
import * as model from './model.js';

export const FAMILIES = [
  { k: 'travail', label: 'Travail', pos: ['Travail sérieux et soigné', 'Travail régulier', 'Rendus complets'], neg: ['Travail superficiel', 'Travail irrégulier', 'Rendus incomplets'] },
  { k: 'comportement', label: 'Comportement', pos: ['Attitude exemplaire', 'Respecte les règles'], neg: ['Bavardages', 'Dispersé·e', 'Attitude à corriger'] },
  { k: 'implication', label: 'Implication', pos: ['Participe activement', 'Questions pertinentes'], neg: ['Doit oser participer', 'Peu investi·e'] },
  { k: 'effort', label: 'Effort', pos: ['Persévérant·e', 'Efforts constants'], neg: ['Se décourage vite', 'Efforts à fournir'] },
  { k: 'equipe', label: 'Travail en équipe', pos: ['Moteur du groupe', 'Partage les tâches', 'Aide ses camarades'], neg: ['Se repose sur le groupe', 'Difficultés à collaborer'] },
  { k: 'autonomie', label: 'Autonomie', pos: ['Autonome', 'Prend des initiatives'], neg: ['Besoin d’être guidé·e', 'Doit gagner en autonomie'] },
  { k: 'organisation', label: 'Organisation', pos: ['Matériel toujours présent', 'Bien organisé·e'], neg: ['Oublis de matériel', 'Doit mieux s’organiser'] },
];
export const LEVELS = ['pos', 'mid', 'neg'];
export const LEVEL_LABEL = { pos: 'Point fort', mid: 'Correct', neg: 'À améliorer' };
export const LEVEL_SYMBOL = { pos: '▲', mid: '●', neg: '▼' };
export const PRESENCE = { normale: 'Normale', partielle: 'Partielle', dispense: 'Dispensé·e' };
export const TENDANCES = ['en progrès', 'stable', 'en baisse'];
export const MAX_CHARS = 300;
export const STATE_LABEL = { ok: 'Prêt', part: 'En cours', todo: 'À faire', disp: 'Dispensé' };

// ---------- Règles pures (testées) ----------
// Une case touchée passe à l'état suivant : vide → Point fort → Correct → À améliorer → vide.
export function nextLevel(v) {
  const cycle = [null, ...LEVELS];
  return cycle[(cycle.indexOf(v ?? null) + 1) % cycle.length];
}
// État d'une fiche. Présence partielle : critères facultatifs, prête dès qu'un constat est posé.
export function stateOf(rec) {
  if (!rec) return 'todo';
  if (rec.presence === 'dispense') return 'disp';
  const n = FAMILIES.filter(f => rec.levels && rec.levels[f.k]).length;
  if (rec.presence === 'partielle') return n || (rec.info && rec.info.trim()) ? 'ok' : 'todo';
  return n === FAMILIES.length ? 'ok' : n ? 'part' : 'todo';
}
// Période d'un trimestre d'après les dates de début enregistrées ({ 1:'AAAA-MM-JJ', 2:…, 3:… }).
// Trimestre 1 : depuis toujours (sa date de début enregistrée est celle de la première ouverture de l'app, souvent
// après la rentrée). Trimestres 2 et 3 sans date de début : pas encore commencés.
// Sans début du trimestre suivant : jusqu'à aujourd'hui et au-delà.
export function trimesterRange(starts, t) {
  const s = starts || {};
  return { from: t === 1 ? '0000-00-00' : s[t] || '9999-99-99', to: t < 3 && s[t + 1] ? s[t + 1] : '9999-99-99' };
}
export const inRange = (date, r) => !!date && date >= r.from && date < r.to;
// Moyenne des notes connues, arrondie au dixième (comme l'onglet Notes l'affiche).
export function average(notes) {
  const ns = notes.filter(n => typeof n === 'number' && isFinite(n));
  return ns.length ? Math.round(ns.reduce((a, b) => a + b, 0) / ns.length * 10) / 10 : null;
}
export function validNote(v) {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  if (!isFinite(n) || n < 0 || n > 20) throw new Error('La note doit être comprise entre 0 et 20.');
  return Math.round(n * 10) / 10;
}

// ---------- Lecture ----------
export const recordId = (studentId, year, t) => 'bul:' + studentId + ':' + year + ':' + t;
export function emptyRecord(student, t, year = model.schoolYear()) {
  return { id: recordId(student.id, year, t), studentId: student.id, classId: student.classId, year, trimester: t,
    presence: 'normale', levels: {}, details: {}, tendance: '', info: '', note: null };
}
export function recordOf(student, t, year = model.schoolYear()) {
  const r = db.get('bulletins', recordId(student.id, year, t));
  return r ? { ...emptyRecord(student, t, year), ...r } : emptyRecord(student, t, year);
}

// Projets de la classe ayant au moins une séance pendant le trimestre.
export function assignmentsOfTrimester(classId, t) {
  const r = trimesterRange(db.getMeta('trimesterStarts', {}), t);
  return model.assignmentsOf(classId).filter(a => db.get('projects', a.projectId) && model.seancesOf(a.id).some(s => inRange(s.date, r)));
}
// Note proposée : moyenne des notes /20 de l'élève dans les projets du trimestre (ajustements compris).
export function autoNote(student, t) {
  const list = [];
  for (const a of assignmentsOfTrimester(student.classId, t)) {
    const p = db.get('projects', a.projectId);
    const n = model.computeNote(model.studentLevels(a.id, student.id), p.criteria || []).n;
    if (n != null) list.push({ title: p.title, n });
  }
  return { n: average(list.map(x => x.n)), projects: list };
}
export function noteOf(student, rec, t) {
  if (rec.note != null) return { n: rec.note, manual: true };
  return { n: autoNote(student, t).n, manual: false };
}
// Ce que le Carnet a déjà relevé pendant le trimestre (aide affichée dans la fiche, jamais exportée).
export function hintsOf(student, t) {
  const obs = db.where('observations', o => o.studentId === student.id && o.trimester === t);
  const motifs = type => {
    const m = new Map();
    for (const o of obs.filter(x => x.type === type)) if (o.motif) m.set(o.motif, (m.get(o.motif) || 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => k + (n > 1 ? ' ×' + n : ''));
  };
  return { neg: obs.filter(o => o.type === 'neg').length, pos: obs.filter(o => o.type === 'pos').length,
    negMotifs: motifs('neg'), posMotifs: motifs('pos'),
    absences: model.absenceCount(student.id, t), retards: model.retardCount(student.id, t) };
}

// ---------- Écriture ----------
function save(student, t, patch) {
  return db.commit(w => {
    const cur = recordOf(student, t);
    w.put('bulletins', { ...cur, ...(typeof patch === 'function' ? patch(cur) : patch) });
  });
}
export function setLevel(student, t, k, v) {
  return save(student, t, cur => {
    const levels = { ...cur.levels };
    if (v == null) delete levels[k]; else levels[k] = v;
    return { levels };
  });
}
export const cycleLevel = (student, t, k) => setLevel(student, t, k, nextLevel(recordOf(student, t).levels[k]));
export function toggleDetail(student, t, k, text) {
  return save(student, t, cur => {
    const list = [...(cur.details[k] || [])];
    const i = list.indexOf(text);
    if (i >= 0) list.splice(i, 1); else list.push(text);
    return { details: { ...cur.details, [k]: list } };
  });
}
export const setPresence = (student, t, presence) => save(student, t, { presence: PRESENCE[presence] ? presence : 'normale' });
export const setTendance = (student, t, tendance) => save(student, t, cur => ({ tendance: cur.tendance === tendance ? '' : tendance }));
export const setInfo = (student, t, info) => save(student, t, { info: String(info || '').slice(0, 1000) });
export const setNote = (student, t, v) => save(student, t, { note: validNote(v) });
// Même niveau pour plusieurs élèves (en-tête de groupe) ; les élèves dispensés ne sont pas touchés.
export function setLevelForAll(students, t, k, v) {
  return db.commit(w => {
    for (const s of students) {
      const cur = recordOf(s, t);
      if (cur.presence === 'dispense') continue;
      w.put('bulletins', { ...cur, levels: { ...cur.levels, [k]: v } });
    }
  });
}
