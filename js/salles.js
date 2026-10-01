// salles.js — Plans de salle (1.19.0) : un plan par salle (Techno 1, salle de cours…), réutilisé par toutes les
// classes qui y ont cours (le plan de classe, étape 3, y placera les élèves).
//
// Table salles : { name, type: 'ilots'|'rangees',
//   ilots : tables: [{ id, x, y, places (1 à 8), vertical }]  — position en cases d'une grille LARGEUR × HAUTEUR ;
//   rangees : rangs, colonnes (tables par rang), parTable (1 ou 2) }
// Le tableau (avant de la salle) est en haut du plan.
// Chaque place a un identifiant stable (îlot : « idTable-n » ; rangées : « r-rang-colonne-n »), pour l'étape 3.
import * as db from './db.js';
import * as planning from './planning.js';

export const LARGEUR = 12, HAUTEUR = 9;
export const MAX_PLACES = 8;

// Taille d'un îlot en cases : 1 place = 1×1 ; 2 = 2×1 ; 3-4 = 2×2 ; 5-6 = 3×2 ; 7-8 = 4×2 (vertical : inversé).
export function tailleIlot(t) {
  const p = t.places;
  const [w, h] = p <= 1 ? [1, 1] : p <= 2 ? [2, 1] : p <= 4 ? [2, 2] : p <= 6 ? [3, 2] : [4, 2];
  return t.vertical ? { w: h, h: w } : { w, h };
}
const chevauche = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
// L'îlot t (avec sa position) tient-il dans la salle sans chevaucher les autres ?
export function placeLibre(salle, t) {
  const r = { x: t.x, y: t.y, ...tailleIlot(t) };
  if (r.x < 0 || r.y < 0 || r.x + r.w > LARGEUR || r.y + r.h > HAUTEUR) return false;
  return !(salle.tables || []).some(o => o.id !== t.id && chevauche(r, { x: o.x, y: o.y, ...tailleIlot(o) }));
}
// Première position libre pour un nouvel îlot (de gauche à droite, de haut en bas), ou null.
export function premierePlace(salle, t) {
  for (let y = 0; y < HAUTEUR; y++) for (let x = 0; x < LARGEUR; x++) if (placeLibre(salle, { ...t, x, y })) return { x, y };
  return null;
}

// Places d'une salle : [{ id, tableId, n }] dans l'ordre de lecture.
export function places(salle) {
  if (!salle) return [];
  if (salle.type === 'rangees') {
    const out = [];
    for (let r = 0; r < salle.rangs; r++) for (let c = 0; c < salle.colonnes; c++) for (let n = 0; n < salle.parTable; n++) out.push({ id: `r-${r}-${c}-${n}`, tableId: `r-${r}-${c}`, n });
    return out;
  }
  return [...(salle.tables || [])].sort((a, b) => a.y - b.y || a.x - b.x).flatMap(t => Array.from({ length: t.places }, (_, n) => ({ id: `${t.id}-${n}`, tableId: t.id, n })));
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

// Plan de départ : îlots de 4 (salle de techno) ou 5 rangs de 3 tables de 2.
export function nouvelleSalle(name, type = 'ilots') {
  const s = { name: name.trim(), type, tables: [], rangs: 5, colonnes: 3, parTable: 2 };
  if (type === 'ilots') {
    const pos = [[1, 1], [5, 1], [9, 1], [1, 5], [5, 5], [9, 5]];
    s.tables = pos.map(([x, y]) => ({ id: db.uid().slice(0, 8), x, y, places: 4, vertical: false }));
  }
  return s;
}
