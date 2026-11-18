// pap.js — Plan d'accompagnement personnalisé d'un élève (1.24.0), dans le suivi PP.
//
// Un PAP par élève et par année, enregistré dans ppRecords (kind 'pap') avec versions, comme les autres contenus PP :
// une modification crée une version, deux appareils en conflit gardent leurs deux versions visibles.
//   { niveau: '5e', cases: { '6e': [idItem…], '5e': […], '4e': […], '3e': […] },
//     autres: [{ id, texte, niveaux: ['5e'] }],
//     medecin: { appuis, consequences },   ← privé : jamais envoyé aux collègues (étape 2)
//     bilan: { nonAtteints, profitables }, liaison }
// Les colonnes des niveaux précédents reprennent le PAP des années passées (saisi par le PP à partir du document).
import * as db from './db.js';
import * as pp from './pp.js';
import { followupScope, followupVersion, persistFollowup, bounded } from './pp-followup-core.js';
import { NIVEAUX, ITEMS, niveauDe } from './pap-items.js';

const vide = s => ({ niveau: niveauDe(db.get('classes', s.classId)) || '6e', cases: Object.fromEntries(NIVEAUX.map(n => [n, []])), autres: [],
  medecin: { appuis: '', consequences: '' }, bilan: { nonAtteints: '', profitables: '' }, liaison: '' });

// PAP de l'élève pour l'année : { record (dernière version ou null), data, conflit (versions concurrentes) }.
export function papDe(studentId) {
  const s = pp.requireStudent(studentId);
  const heads = pp.latest({ studentId, kind: 'pap' }).filter(r => r.classId === s.classId && !r.archivedAt);
  const record = heads[0] || null;
  return { record, data: record ? normaliser(record) : vide(s), conflit: heads.length > 1, heads };
}
// Copie propre (items inconnus ignorés, niveaux valides seulement).
export function normaliser(d) {
  const cases = Object.fromEntries(NIVEAUX.map(n => [n, [...new Set((d.cases && d.cases[n]) || [])].filter(id => ITEMS.has(id))]));
  const autres = (d.autres || []).map(a => ({ id: String(a.id || db.uid()), texte: String(a.texte || ''), niveaux: NIVEAUX.filter(n => (a.niveaux || []).includes(n)) }));
  return { niveau: NIVEAUX.includes(d.niveau) ? d.niveau : '6e', cases, autres,
    medecin: { appuis: String(d.medecin?.appuis || ''), consequences: String(d.medecin?.consequences || '') },
    bilan: { nonAtteints: String(d.bilan?.nonAtteints || ''), profitables: String(d.bilan?.profitables || '') },
    liaison: String(d.liaison || '') };
}
// Enregistre une nouvelle version. previousId : version modifiée (null pour la première).
export async function enregistrer(studentId, data, previousId = null, { resoudre = false, expectedHeads = [] } = {}) {
  const scope = followupScope(studentId, 'pap');
  const d = normaliser(data);
  const propre = { ...d,
    autres: d.autres.map(a => ({ ...a, texte: bounded(a.texte, 500) })).filter(a => a.texte),
    medecin: { appuis: bounded(d.medecin.appuis, 4000), consequences: bounded(d.medecin.consequences, 4000) },
    bilan: { nonAtteints: bounded(d.bilan.nonAtteints, 4000), profitables: bounded(d.bilan.profitables, 4000) },
    liaison: bounded(d.liaison, 4000), title: 'PAP' };
  const row = followupVersion('pap', scope, propre, previousId, resoudre, expectedHeads);
  return persistFollowup([row]);
}
// Nombre d'aménagements cochés pour un niveau (items + autres).
export const total = (d, niveau) => (d.cases[niveau] || []).length + d.autres.filter(a => a.niveaux.includes(niveau)).length;
