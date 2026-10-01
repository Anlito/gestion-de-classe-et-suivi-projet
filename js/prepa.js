// prepa.js — Matériel à préparer pour un cours (1.18.0).
//
// Deux sources, réunies dans la liste d'un cours :
// - le PROJET : une liste par séance (projects.materiel = { "3": ["Imprimante 3D", "Cartes micro:bit"] }), écrite une
//   fois et réutilisée pour chaque classe qui fait le projet, chaque année ;
// - le COURS : des ajouts ponctuels (cours.aPreparer = ["Rallonge"]).
// Ce qui est prêt est coché sur le cours (cours.prepa = { "Imprimante 3D": true }) : chaque cours a ses coches.
// La séance de projet d'un cours à venir est PRÉVUE : séances déjà faites + cours suivis de la classe d'ici là
// (sans séance reliée) + 1. Un cours qui a déjà sa séance (appel fait…) garde le numéro de celle-ci.
import * as db from './db.js';
import * as model from './model.js';
import * as planning from './planning.js';
import { todayISO } from './ui.js';

const nettoyer = list => [...new Set((list || []).map(s => String(s).trim()).filter(Boolean))];

// Séance de projet prévue pour un cours : { a, p, n } ou null (pas de projet en cours, pas un cours suivi…).
export function seancePrevue(cours, today = todayISO()) {
  const e = planning.eff(cours);
  const classId = planning.classIdOf(cours);
  if (!classId || planning.roleOfCours(e) !== 'suivi' || planning.OFF.has(e.statut) || cours.pasSeance) return null;
  const s = model.seanceOfCours(cours.id);
  if (s) { const a = db.get('assignments', s.assignmentId); const p = a && db.get('projects', a.projectId); return p ? { a, p, n: s.n } : null; }
  if (e.date < today) return null;
  const a = model.activeAssignments(classId)[0];
  const p = a && db.get('projects', a.projectId);
  if (!p) return null;
  const key = e.date + ' ' + e.debut;
  const avant = planning.coursEntre(today, e.date).filter(x => x.id !== cours.id && (x.date + ' ' + x.debut) < key
    && planning.classIdOf(x.src) === classId && planning.roleOfCours(x) === 'suivi' && !planning.OFF.has(x.statut)
    && !x.pasSeance && !model.seanceOfCours(x.id)).length;
  const n = model.seancesOf(a.id).length + avant + 1;
  return n <= p.nSeances ? { a, p, n } : null;
}

// Liste d'un cours : { seance: { a, p, n } | null, items: [{ text, src: 'projet'|'cours', fait }], reste }.
export function listeCours(cours, today) {
  const seance = seancePrevue(cours, today);
  const fromProj = seance ? nettoyer((seance.p.materiel || {})[seance.n]) : [];
  const fromCours = nettoyer(cours.aPreparer).filter(t => !fromProj.includes(t));
  const fait = cours.prepa || {};
  const items = [...fromProj.map(text => ({ text, src: 'projet', fait: !!fait[text] })), ...fromCours.map(text => ({ text, src: 'cours', fait: !!fait[text] }))];
  return { seance, items, reste: items.filter(i => !i.fait).length };
}

export function cocher(cours, text, v) {
  const prepa = { ...(cours.prepa || {}) };
  if (v) prepa[text] = true; else delete prepa[text];
  return db.commit(w => w.update('cours', cours.id, { prepa: Object.keys(prepa).length ? prepa : undefined }));
}
export function ajouter(cours, text) {
  const t = String(text || '').trim();
  if (!t) return null;
  return db.commit(w => w.update('cours', cours.id, { aPreparer: nettoyer([...(cours.aPreparer || []), t]) }));
}
export function retirer(cours, text) {
  const list = nettoyer(cours.aPreparer).filter(x => x !== text);
  const prepa = { ...(cours.prepa || {}) }; delete prepa[text];
  return db.commit(w => w.update('cours', cours.id, { aPreparer: list.length ? list : undefined, prepa: Object.keys(prepa).length ? prepa : undefined }));
}
// Texte d'une liste de séance (une ligne par élément) ↔ tableau.
export const versTexte = list => nettoyer(list).join('\n');
export const depuisTexte = text => nettoyer(String(text || '').split(/\r?\n/));

// ---------- Rappel ----------
export const HEURE_RAPPEL = 16 * 60; // la veille, à partir de 16 h
// Prochain jour de cours après aujourd'hui (week-end et vacances sautés), dans les 10 jours.
export function prochainJour(today = todayISO()) {
  const dates = [...new Set(planning.coursEntre(planning.addDays(today, 1), planning.addDays(today, 10)).filter(c => !planning.OFF.has(c.statut)).map(c => c.date))].sort();
  return dates[0] || null;
}
// Cours à préparer : ceux du prochain jour de cours (à partir de 16 h) et ceux d'aujourd'hui pas encore commencés.
// Renvoie [{ cours (affiché), classId, cls, reste, quand: 'demain'|'aujourdhui' }].
export function aPreparerBientot(now = new Date()) {
  const today = todayISO(now), m = now.getHours() * 60 + now.getMinutes();
  const toMin = s => +s.slice(0, 2) * 60 + +s.slice(3, 5);
  const out = [];
  const take = (date, quand, filtre = () => true) => {
    for (const e of planning.coursEntre(date, date).filter(filtre).sort((a, b) => a.debut.localeCompare(b.debut))) {
      if (planning.OFF.has(e.statut)) continue;
      const l = listeCours(e.src, today);
      if (!l.reste) continue;
      const classId = planning.classIdOf(e.src);
      out.push({ cours: e, classId, cls: classId && db.get('classes', classId), reste: l.reste, quand });
    }
  };
  take(today, 'aujourdhui', e => toMin(e.debut) > m);
  if (m >= HEURE_RAPPEL) { const d = prochainJour(today); if (d) take(d, 'demain'); }
  return out;
}
