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

// ---------- Critères personnalisés (1.29.0) ----------
// Réglage synchronisé « bulletinsCriteres » : [{ k, label, hidden, pos:[…], neg:[…] }]. Absent : critères par défaut.
// La clé k d'une famille ne change jamais (renommer garde les niveaux déjà saisis) ; masquer garde les données.
const clean = list => [...new Set((list || []).map(x => String(x || '').trim()).filter(Boolean))];
export function normalizeFamilies(list) {
  if (!Array.isArray(list) || !list.length) return FAMILIES.map(f => ({ ...f, hidden: false }));
  const seen = new Set(), out = [];
  for (const f of list) {
    const k = String(f && f.k || '').trim(), label = String(f && f.label || '').trim();
    if (!k || seen.has(k) || !label) continue;
    seen.add(k);
    out.push({ k, label: label.slice(0, 40), hidden: !!f.hidden, pos: clean(f.pos), neg: clean(f.neg) });
  }
  return out.length ? out : FAMILIES.map(f => ({ ...f, hidden: false }));
}
export function allFamilies() {
  let saved = null;
  try { saved = db.getMeta('bulletinsCriteres', null); } catch (e) { /* données pas encore chargées (tests) */ }
  return normalizeFamilies(saved);
}
export const families = () => allFamilies().filter(f => !f.hidden);
export const familiesCustomized = () => { try { return db.getMeta('bulletinsCriteres', null) !== null; } catch (e) { return false; } };
export function saveFamilies(list) {
  const norm = normalizeFamilies(list);
  if (!norm.some(f => !f.hidden)) throw new Error('Gardez au moins un critère affiché.');
  return db.commit(w => w.meta('bulletinsCriteres', norm));
}
export const resetFamilies = () => db.commit(w => w.del('meta', 'bulletinsCriteres'));
export const newFamilyKey = () => 'c-' + db.uid().slice(0, 8);

export const LEVELS = ['pos', 'mid', 'neg'];
export const LEVEL_LABEL = { pos: 'Point fort', mid: 'Correct', neg: 'À améliorer' };
export const LEVEL_SYMBOL = { pos: '▲', mid: '●', neg: '▼' };
export const PRESENCE = { normale: 'Normale', partielle: 'Partielle', dispense: 'Dispensé·e' };
export const TENDANCES = ['en progrès', 'stable', 'en baisse'];
// Accord des appréciations (1.32.0) : réglage de l'élève (students.genre), gardé d'un trimestre à l'autre.
// « Non genré » (1.32.1) : choix de l'élève, appréciation sans aucun accord ni pronom genré.
export const GENRES = { f: 'Fille', m: 'Garçon', n: 'Non genré' };
export const ACCORD = { f: 'féminin', m: 'masculin', n: 'non genré' };
export const setGenre = (studentId, g) => db.commit(w => w.update('students', studentId, { genre: GENRES[g] ? g : '' }));
export const MAX_CHARS = 300;
export const STATE_LABEL = { ok: 'Prêt', part: 'En cours', todo: 'À faire', disp: 'Dispensé' };

// ---------- Règles pures (testées) ----------
// Chaque critère part de « Correct » (neutre, 1.30.0). Une case touchée passe à l'état suivant :
// Correct → Point fort → À améliorer → Correct.
export const DEFAULT_LEVEL = 'mid';
export function nextLevel(v) {
  const cycle = ['mid', 'pos', 'neg'];
  return cycle[(cycle.indexOf(v || DEFAULT_LEVEL) + 1) % cycle.length];
}
// Niveaux d'une fiche : un critère non touché vaut Correct.
export function withDefaults(levels, fams = families()) {
  const out = { ...(levels || {}) };
  for (const f of fams) if (!out[f.k]) out[f.k] = DEFAULT_LEVEL;
  return out;
}
// État d'une fiche. Présence partielle : critères facultatifs, prête dès qu'un constat est posé.
export function stateOf(rec, fams = families()) {
  if (!rec) return 'todo';
  if (rec.presence === 'dispense') return 'disp';
  const n = fams.filter(f => rec.levels && rec.levels[f.k]).length;
  if (rec.presence === 'partielle') return n || (rec.info && rec.info.trim()) ? 'ok' : 'todo';
  return n === fams.length ? 'ok' : n ? 'part' : 'todo';
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
    presence: 'normale', levels: {}, details: {}, tendance: '', info: '', note: null, appreciation: '', pronote: false };
}
export function recordOf(student, t, year = model.schoolYear()) {
  const r = db.get('bulletins', recordId(student.id, year, t));
  const rec = r ? { ...emptyRecord(student, t, year), ...r } : emptyRecord(student, t, year);
  return { ...rec, levels: withDefaults(rec.levels) };
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

// ---------- Export pour Claude (1.27.0) ----------
// Liste blanche : seuls les champs écrits ici sortent du Carnet, dont le nom de la classe (ex. « 3G », 1.31.0). Jamais le nom de famille, la photo,
// les dispositifs, les absences ni les remarques du Carnet. Les élèves dispensés ne sont pas envoyés.
export const TONES = ['bienveillant et précis', 'encourageant', 'neutre et factuel'];
export const PERSONS = ['3e personne', 'tutoiement', 'vouvoiement'];
export const exportDefaults = () => ({ discipline: 'Technologie', ton: TONES[0], formulation: PERSONS[0], ...db.getMeta('bulletinsExport', {}) });
export const saveExportDefaults = o => db.commit(w => w.meta('bulletinsExport', { discipline: o.discipline, ton: o.ton, formulation: o.formulation }));
export const levelLabel = c => (c.level || '') + (c.segpa ? ' SEGPA' : '');
export const exportFileName = (c, t) => ('bulletins-' + (c.name || levelLabel(c)) + '-T' + t).toLowerCase().replace(/\s+/g, '-').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9-]/g, '') + '.json';

// entries : [{ student:{ id, prenom }, rec, note }] dans l'ordre de la classe. Renvoie { data, codes:{ E01: studentId } }.
// e.prev (facultatif) : niveaux du trimestre précédent, exportés comme « trimestre_precedent » pour parler des progrès.
export function buildExport({ classe = '', niveau, trimester, year, projects = [], options, entries, exportId, fams = families() }) {
  const kept = entries.filter(e => e.rec.presence !== 'dispense');
  const seen = new Map(), total = new Map();
  for (const e of kept) { const p = (e.student.prenom || '').trim() || 'Élève'; total.set(p, (total.get(p) || 0) + 1); }
  const codes = {};
  const eleves = kept.map((e, i) => {
    const code = 'E' + String(i + 1).padStart(2, '0');
    codes[code] = e.student.id;
    const p = (e.student.prenom || '').trim() || 'Élève';
    seen.set(p, (seen.get(p) || 0) + 1);
    const o = { code, prenom: total.get(p) > 1 && seen.get(p) > 1 ? p + ' (' + seen.get(p) + ')' : p };
    if (ACCORD[e.student.genre]) o.accord = ACCORD[e.student.genre];
    if (e.rec.presence === 'partielle') o.presence = 'partielle';
    o.note = typeof e.note === 'number' ? e.note : null;
    const criteres = {};
    for (const f of fams) {
      const v = e.rec.levels && e.rec.levels[f.k], d = (e.rec.details && e.rec.details[f.k] || []).filter(Boolean);
      const p = v && e.prev && e.prev[f.k];
      if (v || d.length) criteres[f.label] = { ...(v ? { niveau: LEVEL_LABEL[v] } : {}), ...(p ? { trimestre_precedent: LEVEL_LABEL[p] } : {}), ...(d.length ? { formulations: d } : {}) };
    }
    o.criteres = criteres;
    if (e.rec.tendance) o.tendance = e.rec.tendance;
    if (e.rec.info && e.rec.info.trim()) o.remarque = e.rec.info.trim();
    return o;
  });
  const data = {
    format: 'carnet-bulletins-v1', export_id: exportId, classe: String(classe || '').trim(), discipline: String(options.discipline || '').trim(), niveau, trimestre: trimester, annee: year,
    ...(projects.length ? { projets_du_trimestre: projects } : {}),
    consignes: {
      longueur_max: MAX_CHARS, ton: options.ton, formulation: options.formulation,
      redaction: 'Une appréciation de bulletin par élève, ' + MAX_CHARS + ' caractères maximum espaces compris, fondée uniquement sur les critères, la note, la tendance et la remarque fournis. Présence partielle : parler de ce qui a pu être observé, sans en donner la raison.',
      accords: 'Accorder selon le champ « accord » de l’élève (féminin ou masculin). « non genré » : choix de l’élève, n’employer aucun accord ni pronom genré (il, elle), seulement des tournures neutres et le prénom. Sans champ « accord », ne pas deviner le genre d’après le prénom : employer des tournures sans accord (ex. « fait preuve de sérieux » plutôt que « sérieux/sérieuse »), sans écriture inclusive.',
      retour: 'Renvoyer un fichier JSON { "format": "carnet-appreciations-v1", "export_id": (le même), "classe": (la même), "appreciations": [ { "code": "E01", "texte": "…" } ] }',
    },
    eleves,
  };
  return { data, codes };
}
// Correspondance code → élève, gardée dans le Carnet (synchronisée, jamais exportée) pour relire le fichier retour.
export const saveExportMapping = (classId, t, exportId, file, codes) =>
  db.commit(w => w.meta('bulletinsExport:' + exportId, { classId, className: (db.get('classes', classId) || {}).name || '', year: model.schoolYear(), trimester: t, file, codes, at: new Date().toISOString() }));

// ---------- Retour des appréciations (1.28.0) ----------
// Fichier renvoyé par Claude : { format:'carnet-appreciations-v1', export_id, classe, appreciations:[{ code, texte }] }.
// La classe indiquée doit être celle de l'export (« 3G » = « 3e G ») ; absente, l'import reste possible mais c'est signalé.
export const sameClass = (a, b) => {
  const base = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const plain = s => base(s).replace(/[^a-z0-9]/g, ''), n = s => plain(base(s).replace(/(\d)\s*(eme|e)(?![a-z])/g, '$1'));
  return plain(a) === plain(b) || n(a) === n(b);
};
// Accepte aussi le texte collé depuis la conversation (entouré de ```json … ``` ou d'autres phrases).
export function parseReturn(text, mappingOf) {
  const s = String(text || ''), a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('Aucune donnée lisible : choisissez le fichier renvoyé par Claude ou collez son contenu.');
  let data;
  try { data = JSON.parse(s.slice(a, b + 1)); } catch (e) { throw new Error('Le contenu n’est pas un fichier d’appréciations valide (JSON illisible).'); }
  if (!data || data.format !== 'carnet-appreciations-v1' || !Array.isArray(data.appreciations)) throw new Error('Ce n’est pas un fichier d’appréciations du Carnet (format carnet-appreciations-v1 attendu).');
  const mapping = data.export_id ? mappingOf(data.export_id) : null;
  if (!mapping) throw new Error('Export inconnu sur cet appareil : relisez le fichier depuis l’appareil qui a fait l’export, ou attendez la synchronisation.');
  const classe = String(data.classe || '').trim();
  if (classe && mapping.className && !sameClass(classe, mapping.className))
    throw new Error('Ce fichier indique la classe ' + classe + ', mais l’export ' + data.export_id + ' a été fait pour la classe ' + mapping.className + '. Vérifiez que vous importez le bon fichier.');
  const items = [], unknown = [], seen = new Set();
  for (const x of data.appreciations) {
    const code = String(x && x.code || '').trim(), texte = String(x && x.texte || '').replace(/\s+/g, ' ').trim();
    if (!code || !texte || seen.has(code)) continue;
    seen.add(code);
    const studentId = mapping.codes[code];
    if (!studentId) { unknown.push(code); continue; }
    items.push({ code, studentId, texte, tooLong: texte.length > MAX_CHARS });
  }
  const missing = Object.keys(mapping.codes).filter(c => !seen.has(c));
  return { exportId: data.export_id, classe, mapping, items, unknown, missing };
}
export function mappingOf(id) {
  const m = db.getMeta('bulletinsExport:' + id, null), c = m && db.get('classes', m.classId);
  return m ? { ...m, className: m.className || (c ? c.name : '') } : null;
}
// Enregistre les appréciations relues dans les fiches du trimestre de l'export. Une appréciation remplacée n'est plus « saisie ».
export function importAppreciations(parsed) {
  const { mapping, items } = parsed;
  return db.commit(w => {
    for (const it of items) {
      const s = db.get('students', it.studentId);
      if (!s) continue;
      const cur = recordOf(s, mapping.trimester, mapping.year);
      if (cur.appreciation === it.texte) continue;
      w.put('bulletins', { ...cur, appreciation: it.texte, pronote: false });
    }
  });
}
export const DISPENSE_TEXT = 'Dispensé(e).';
export const setAppreciation = (student, t, text) => save(student, t, cur => ({ appreciation: String(text || '').slice(0, 2000), pronote: cur.appreciation === text ? cur.pronote : false }));
export const setPronote = (student, t, done, text) => save(student, t, cur => ({ pronote: !!done, ...(text != null && !cur.appreciation ? { appreciation: text } : {}) }));

// ---------- Trimestre précédent (1.29.0) ----------
// Fiche du trimestre précédent (même année), ou null au premier trimestre / sans fiche.
export function previousOf(student, t) {
  if (t <= 1) return null;
  const r = db.get('bulletins', recordId(student.id, model.schoolYear(), t - 1));
  return r ? { ...emptyRecord(student, t - 1), ...r, levels: withDefaults(r.levels) } : null;
}
// Évolution d'un critère d'un trimestre à l'autre : 'up', 'down', 'same' ou null.
export function evolution(prev, cur) {
  if (!prev || !cur) return null;
  const rank = { neg: 0, mid: 1, pos: 2 };
  return rank[cur] > rank[prev] ? 'up' : rank[cur] < rank[prev] ? 'down' : 'same';
}
