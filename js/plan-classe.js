// plan-classe.js — Plan de classe (1.20.0) : où chaque élève est assis, dans chaque salle.
// Enregistré sur la classe : classes.plans = { [salleId]: { [idPlace]: studentId } } ; classes.planSalle = dernière
// salle utilisée. Une classe peut avoir un plan différent dans chaque salle (Techno 1, salle de cours…).
import * as db from './db.js';
import * as model from './model.js';
import * as planning from './planning.js';
import * as S from './salles.js';

// Salle du plan pour une classe : celle du cours en contexte (planning), sinon la dernière utilisée, sinon la première.
export function salleDe(classId, choisie = null) {
  if (choisie && db.get('salles', choisie)) return db.get('salles', choisie);
  const k = planning.coursContexte(classId);
  const ducours = k && S.salleNommee(k.salle);
  if (ducours) return ducours;
  const c = db.get('classes', classId);
  if (c && c.planSalle && db.get('salles', c.planSalle)) return db.get('salles', c.planSalle);
  return S.salles()[0] || null;
}

// Placement { idPlace: studentId } limité aux places de la salle et aux élèves de la classe.
export function placement(classId, salle) {
  const c = db.get('classes', classId);
  if (!c || !salle) return {};
  const raw = (c.plans || {})[salle.id] || {};
  const seats = new Set(S.places(salle).map(p => p.id));
  const eleves = new Set(model.studentsOf(classId).map(s => s.id));
  const out = {};
  for (const [seat, sid] of Object.entries(raw)) if (seats.has(seat) && eleves.has(sid)) out[seat] = sid;
  return out;
}
export const nonPlaces = (classId, salle) => { const pris = new Set(Object.values(placement(classId, salle))); return model.studentsOf(classId).filter(s => !pris.has(s.id)); };

function enregistrer(classId, salle, map) {
  const c = db.get('classes', classId);
  return db.commit(w => w.update('classes', classId, { plans: { ...(c.plans || {}), [salle.id]: map }, planSalle: salle.id }));
}
export const retenirSalle = (classId, salle) => db.commit(w => w.update('classes', classId, { planSalle: salle.id }), { track: false });

// Assoit un élève (ou personne : null) à une place. Si la place est prise, l'élève qui y était prend l'ancienne place
// de celui qu'on déplace (échange), ou devient « non placé ».
export function placer(classId, salle, seatId, sid) {
  const map = { ...placement(classId, salle) };
  const ancienne = sid ? Object.keys(map).find(k => map[k] === sid) : null;
  const occupant = map[seatId];
  if (ancienne) delete map[ancienne];
  if (sid) map[seatId] = sid; else delete map[seatId];
  if (occupant && occupant !== sid && ancienne) map[ancienne] = occupant;
  return enregistrer(classId, salle, map);
}
// Remplit les places libres (ordre de lecture) avec les élèves non placés : ordre alphabétique ou au hasard.
// tout = true : on recommence de zéro.
export function remplir(classId, salle, { hasard = false, tout = false } = {}) {
  const map = tout ? {} : { ...placement(classId, salle) };
  const pris = new Set(Object.values(map));
  let eleves = model.studentsOf(classId).filter(s => !pris.has(s.id));
  if (hasard) eleves = eleves.map(s => [Math.random(), s]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  for (const p of S.places(salle)) { if (!eleves.length) break; if (!map[p.id]) map[p.id] = eleves.shift().id; }
  return { undo: enregistrer(classId, salle, map), reste: eleves.length };
}
export const vider = (classId, salle) => enregistrer(classId, salle, {});
