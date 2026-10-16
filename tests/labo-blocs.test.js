// Tests de l'import des résultats Labo Blocs (js/labo-blocs.js). Données FICTIVES.
import { lire, normaliser, proposer, problemes } from '../js/labo-blocs.js';

export const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const eq = (a, b, msg = '') => { const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) throw new Error(`${msg} attendu ${B}, obtenu ${A}`); };

const C9 = 'Concevoir, écrire, tester et mettre au point un programme';
const C6 = 'Comprendre et modifier un programme associé à une fonctionnalité d’un objet ou d’un système technique';
const fichier = {
  format: 'labo-blocs/resultats', version: 1, date: '2026-10-20',
  projet: { id: 'distributeur', titre: 'Distributeur de céréales' },
  competences: [{ code: 'C6', n: 6, libelle: C6 }, { code: 'C9', n: 9, libelle: C9 }],
  equipes: [
    { eleves: ['Léa', 'Hugo'], classe: '5A', niveaux: { C6: 3, C9: 4 }, note: 17.5, commentaire: '' },
    { eleves: ['lea', 'Noah'], classe: '5A', niveaux: { C9: 2 }, note: 10, commentaire: 'Aide' },
    { eleves: ['Inès'], classe: '5B', niveaux: { C9: 3 }, note: 15, commentaire: '' },
    { eleves: ['Jade', 'Zoé'], classe: '5A', niveaux: { C9: 3 }, note: 15, commentaire: '' },
  ],
};
const donnees = {
  classe: '5A',
  students: [
    { id: 's1', nom: 'MARTIN', prenom: 'Léa' }, { id: 's2', nom: 'DURAND', prenom: 'Hugo' },
    { id: 's3', nom: 'PETIT', prenom: 'Noah' }, { id: 's4', nom: 'BERNARD', prenom: 'Léa' },
    { id: 's5', nom: 'ROUX', prenom: 'Jade' }, { id: 's6', nom: 'MOREL', prenom: 'Zoé' },
  ],
  groups: [{ id: 'g1', code: 'G01', members: ['s5', 's6'] }],
  criteria: [{ id: 'k1', code: 'C1', label: 'Programmer', pronote: C9 }, { id: 'k2', code: 'C2', label: 'Dessiner', pronote: '' }],
};

test('Fichier de résultats Labo Blocs reconnu, autre fichier refusé', () => {
  eq(lire(JSON.stringify(fichier)).ok, true);
  eq(lire('{"format":"autre"}').ok, false);
  eq(lire('pas du json').ok, false);
  eq(lire(JSON.stringify({ ...fichier, version: 2 })).ok, false);
});
test('Prénoms comparés sans accents ni majuscules', () => { eq(normaliser('Léa'), 'lea'); eq(normaliser(' JEAN-Marc '), 'jeanmarc'); });
test('Correspondance proposée : prénom unique trouvé, deux Léa à choisir, autre classe ignorée, groupe existant retrouvé', () => {
  const p = proposer(fichier, donnees);
  eq(p.equipes[0].eleves.map(e => e.choisi), [null, 's2'], 'deux Léa dans la classe : à choisir');
  eq(p.equipes[0].eleves[0].candidats, ['s1', 's4']);
  eq(p.equipes[0].groupe, 'nouveau', 'Hugo n’a pas de groupe');
  eq(p.equipes[1].eleves.map(e => e.choisi), [null, 's3']);
  eq(p.equipes[2].autreClasse, true);
  eq(p.equipes[2].groupe, '', 'équipe d’une autre classe : pas importée par défaut');
  eq(p.equipes[3].groupe, 'g1', 'Jade et Zoé sont déjà dans G01');
  eq(p.criteres, { C6: '', C9: 'k1' }, 'C9 retrouvé par le libellé du programme ; C6 sans critère');
});
test('Avant d’importer : élève choisi deux fois, ou aucune compétence reliée', () => {
  const p = proposer(fichier, donnees);
  eq(problemes(p).length, 0);
  p.equipes[0].eleves[0].choisi = 's3';
  eq(problemes(p).map(x => x.texte), ['Un élève est choisi dans deux équipes.']);
  p.equipes[0].eleves[0].choisi = 's1';
  p.criteres.C9 = '';
  eq(problemes(p).map(x => x.texte), ['Aucune compétence n’est reliée à un critère du projet.']);
});
