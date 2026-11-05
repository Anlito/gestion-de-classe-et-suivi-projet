// labo-blocs.js — Résultats d'un parcours Labo Blocs (fichier « …labo-resultats.json » exporté par l'outil du professeur
// de Labo Blocs ou de l'atelier d'un projet) : niveaux par compétence de chaque équipe (prénoms + classe).
// Le Carnet relie chaque équipe à des élèves de la classe (par les prénoms ; le professeur choisit quand c'est douteux)
// et à un groupe du projet (existant ou nouveau), chaque compétence à un critère du projet (même libellé du programme),
// puis pose les niveaux sur les groupes. Le reste se fait comme d'habitude : ajustements, mention, export Pronote.
import * as db from './db.js';
import * as model from './model.js';

export const FORMAT = 'labo-blocs/resultats';

export function lire(texte) {
  let r;
  try {
    r = JSON.parse(String(texte).replace(/^﻿/, ''));
  } catch (e) {
    return { ok: false, message: 'Ce fichier n’est pas un fichier de résultats Labo Blocs (illisible).' };
  }
  if (!r || r.format !== FORMAT || !Array.isArray(r.equipes) || !Array.isArray(r.competences)) {
    return { ok: false, message: 'Ce fichier n’est pas un fichier de résultats Labo Blocs.' };
  }
  if (r.version > 1) return { ok: false, message: 'Ce fichier vient d’une version plus récente de Labo Blocs : mettez le Carnet à jour.' };
  return { ok: true, resultats: r };
}

// « Léa », « LEA », « léa » → « lea » ; « Jean-Marc » → « jeanmarc »
export const normaliser = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Proposition de correspondance (le professeur la corrige ensuite).
//   donnees : { classe (nom), students [{ id, nom, prenom }], groups [{ id, code, members }], criteria [{ id, code, label, pronote }] }
// → { equipes: [{ eleves: [{ prenom, candidats: [id], choisi }], groupe: gid | 'nouveau' | '', autreClasse }],
//     criteres: { code: critId | '' } }
export function proposer(resultats, donnees) {
  const { classe, students, groups, criteria } = donnees;
  const parPrenom = new Map();
  for (const s of students) {
    const k = normaliser(s.prenom);
    parPrenom.set(k, [...(parPrenom.get(k) || []), s.id]);
  }
  const groupeDe = sid => groups.find(g => g.members.includes(sid));
  const pris = new Set();
  const equipes = resultats.equipes.map(eq => {
    const autreClasse = !!(eq.classe && classe && normaliser(eq.classe) !== normaliser(classe));
    const eleves = eq.eleves.map(prenom => {
      const candidats = parPrenom.get(normaliser(prenom)) || [];
      const libres = candidats.filter(id => !pris.has(id));
      const choisi = !autreClasse && candidats.length === 1 && libres.length === 1 ? candidats[0] : null;
      if (choisi) pris.add(choisi);
      return { prenom, candidats, choisi };
    });
    return { eleves, groupe: autreClasse ? '' : groupeProbable(eleves, groupeDe), autreClasse };
  });
  const criteres = {};
  for (const c of resultats.competences) {
    const lib = normaliser(c.libelle);
    const cr = criteria.find(x => normaliser(x.pronote) === lib) || criteria.find(x => normaliser(x.label) === lib);
    criteres[c.code] = cr ? cr.id : '';
  }
  return { equipes, criteres };
}

// Tous les élèves trouvés sont dans le même groupe : ce groupe. Aucun n'a de groupe : nouveau groupe. Sinon : à choisir.
function groupeProbable(eleves, groupeDe) {
  const choisis = eleves.map(e => e.choisi).filter(Boolean);
  if (!choisis.length) return '';
  const gs = new Set(choisis.map(id => (groupeDe(id) || {}).id || null));
  if (gs.size === 1) return [...gs][0] || 'nouveau';
  return '';
}

// Ce qui empêche d'importer (une phrase par équipe), d'après la proposition corrigée.
export function problemes(prop) {
  const pb = [];
  prop.equipes.forEach((eq, i) => {
    if (!eq.groupe) return; // « Ne pas importer »
    if (eq.groupe === 'nouveau' && !eq.eleves.some(e => e.choisi)) pb.push({ i, texte: 'Choisissez au moins un élève pour créer le groupe.' });
    const ids = eq.eleves.map(e => e.choisi).filter(Boolean);
    if (new Set(ids).size !== ids.length) pb.push({ i, texte: 'Le même élève est choisi deux fois.' });
  });
  const tous = prop.equipes.filter(e => e.groupe).flatMap(e => e.eleves.map(x => x.choisi).filter(Boolean));
  const doubles = tous.filter((id, k) => tous.indexOf(id) !== k);
  if (doubles.length) pb.push({ i: null, texte: 'Un élève est choisi dans deux équipes.' });
  if (!Object.values(prop.criteres).some(Boolean)) pb.push({ i: null, texte: 'Aucune compétence n’est reliée à un critère du projet.' });
  return pb;
}

// Pose les niveaux (une seule action, annulable). Renvoie { undo, groupes (nombre), niveaux (nombre) }.
export function importer(a, prop, resultats) {
  let nGroupes = 0;
  let nNiveaux = 0;
  const existants = model.groupsOf(a.id);
  let numero = Math.max(0, ...existants.map(g => parseInt(g.code.replace(/\D/g, ''), 10) || 0));
  const undo = db.commit(w => {
    prop.equipes.forEach((eq, i) => {
      if (!eq.groupe) return;
      const r = resultats.equipes[i];
      const sids = eq.eleves.map(e => e.choisi).filter(Boolean);
      let gid = eq.groupe;
      if (gid === 'nouveau') {
        numero += 1;
        gid = w.put('groups', { assignmentId: a.id, code: 'G' + String(numero).padStart(2, '0'), members: [], comment: '', levels: {} }).id;
      }
      // Les élèves choisis rejoignent ce groupe (et quittent leur ancien groupe du projet).
      for (const sid of sids) {
        for (const g of db.where('groups', x => x.assignmentId === a.id && x.id !== gid && x.members.includes(sid))) {
          w.update('groups', g.id, x => ({ members: x.members.filter(m => m !== sid) }));
        }
      }
      w.update('groups', gid, g => {
        const levels = { ...g.levels };
        for (const [code, v] of Object.entries(r.niveaux || {})) {
          const cid = prop.criteres[code];
          if (cid && v >= 1 && v <= 4) {
            levels[cid] = v;
            nNiveaux++;
          }
        }
        const members = [...new Set([...g.members, ...sids])];
        const ajout = r.commentaire ? 'Labo Blocs : ' + r.commentaire : '';
        const comment = ajout && !String(g.comment || '').includes(ajout) ? (g.comment ? g.comment + ' · ' : '') + ajout : g.comment || '';
        return { levels, members, comment };
      });
      nGroupes++;
    });
  });
  return { undo, groupes: nGroupes, niveaux: nNiveaux };
}
