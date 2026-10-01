// salles.js — Plans de salle (1.19.0, îlots libres en 1.19.1) : un plan par salle (Techno 1, salle de cours…),
// réutilisé par toutes les classes qui y ont cours (le plan de classe, étape 3, y placera les élèves).
//
// Table salles : { name, type: 'ilots'|'rangees',
//   ilots : tables: [{ id, cx, cy, angle, places (1 à 8), ligne }] — centre de l'îlot en unités (salle de
//           LARGEUR × HAUTEUR unités, 1 unité ≈ une place), angle en degrés (pas de 15°), ligne = places sur une
//           seule rangée (sinon face à face) ;
//   rangees : rangs, colonnes (tables par rang), parTable (1 à 3) }
// Le tableau (avant de la salle) est en haut du plan.
// Chaque place a un identifiant stable (îlot : « idTable-n » ; rangées : « r-rang-colonne-n »), pour l'étape 3.
import * as db from './db.js';
import * as planning from './planning.js';

export const LARGEUR = 12, HAUTEUR = 9;
export const MAX_PLACES = 8;
export const PAS_ANGLE = 15;

// Disposition des places d'un îlot : { cols, rows } (places par rangée, rangées) ; taille en unités = cols × rows.
export function disposition(t) {
  const p = t.places;
  if (t.ligne || p <= 2) return { cols: p, rows: 1 };
  return { cols: Math.ceil(p / 2), rows: 2 };
}
export function tailleIlot(t) { const d = disposition(t); return { w: d.cols, h: d.rows }; }

// Ancien format (1.19.0 : coin en haut à gauche sur une grille, vertical) → centre + angle.
export function normTable(t) {
  if (t.cx != null) return t;
  const p = t.places;
  const [w, h] = p <= 1 ? [1, 1] : p <= 2 ? [2, 1] : p <= 4 ? [2, 2] : p <= 6 ? [3, 2] : [4, 2];
  const [W, H] = t.vertical ? [h, w] : [w, h];
  return { id: t.id, places: p, ligne: false, cx: t.x + W / 2, cy: t.y + H / 2, angle: t.vertical ? 90 : 0 };
}
export const tablesOf = salle => (salle.tables || []).map(normTable);

// Garde le centre d'un îlot dans la salle.
export function borner(t) {
  const c = (v, max) => Math.max(0.5, Math.min(max - 0.5, Math.round(v * 4) / 4));
  return { ...t, cx: c(t.cx, LARGEUR), cy: c(t.cy, HAUTEUR) };
}
// Place libre pour un nouvel îlot : un point de la salle loin des autres îlots.
export function pointLibre(salle) {
  const tables = tablesOf(salle);
  let best = { cx: LARGEUR / 2, cy: HAUTEUR / 2 }, bestD = -1;
  for (let y = 1.5; y < HAUTEUR; y += 1) for (let x = 1.5; x < LARGEUR; x += 1) {
    const d = Math.min(...tables.map(t => Math.hypot(t.cx - x, t.cy - y)), 99);
    if (d > bestD) { bestD = d; best = { cx: x, cy: y }; }
  }
  return best;
}

// Places d'une salle : [{ id, tableId, n }] dans l'ordre de lecture.
export function places(salle) {
  if (!salle) return [];
  if (salle.type === 'rangees') {
    const out = [];
    for (let r = 0; r < salle.rangs; r++) for (let c = 0; c < salle.colonnes; c++) for (let n = 0; n < salle.parTable; n++) out.push({ id: `r-${r}-${c}-${n}`, tableId: `r-${r}-${c}`, n });
    return out;
  }
  return tablesOf(salle).sort((a, b) => Math.round(a.cy) - Math.round(b.cy) || a.cx - b.cx)
    .flatMap(t => Array.from({ length: t.places }, (_, n) => ({ id: `${t.id}-${n}`, tableId: t.id, n })));
}
export const nbPlaces = salle => places(salle).length;

export const salles = () => db.all('salles').sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }));
const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const salleNommee = name => db.all('salles').find(s => norm(s.name) === norm(name)) || null;
// Salle d'un cours (plan de classe, étape 3) : le plan qui porte le nom de la salle du cours.
export const salleDuCours = cours => (cours && cours.salle ? salleNommee(planning.eff(cours).salle) : null);

// Salles de l'emploi du temps (cours suivis ou « appel seulement ») sans plan : [{ name, n }], les plus utilisées d'abord.
export function sallesSansPlan() {
  const m = new Map();
  for (const c of db.all('cours').map(planning.eff)) {
    if (!c.salle || !['suivi', 'appel'].includes(planning.roleOfCours(c))) continue;
    const k = norm(c.salle);
    const x = m.get(k) || { name: c.salle, n: 0 };
    x.n++; m.set(k, x);
  }
  return [...m.entries()].filter(([k]) => !db.all('salles').some(s => norm(s.name) === k)).map(([, x]) => x).sort((a, b) => b.n - a.n);
}

// Plan de départ : 6 îlots de 4 (salle de techno), ou 5 rangs de 3 tables de 2.
export function nouvelleSalle(name, type = 'ilots') {
  const s = { name: name.trim(), type, tables: [], rangs: 5, colonnes: 3, parTable: 2 };
  if (type === 'ilots') {
    const pos = [[2, 2.5], [6, 2.5], [10, 2.5], [2, 6.5], [6, 6.5], [10, 6.5]];
    s.tables = pos.map(([cx, cy]) => ({ id: db.uid().slice(0, 8), cx, cy, angle: 0, places: 4, ligne: false }));
  }
  return s;
}
