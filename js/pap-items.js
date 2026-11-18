// pap-items.js — Grille officielle du PAP au collège (Bulletin officiel n° 5 du 29 janvier 2015, annexe
// « Adaptations et aménagements à mettre en place en fonction des besoins de l'élève — au collège »).
// Texte public. Les identifiants sont STABLES (enregistrés dans les PAP et les retours des collègues) : ne jamais
// les renommer ; ajouter de nouveaux items avec de nouveaux identifiants.

export const NIVEAUX = ['6e', '5e', '4e', '3e'];

// discipline : rubrique mise en avant pour le collègue de cette matière (consultation, étape 2) ; « tous » = commune.
export const SECTIONS = [
  { id: 'commun', titre: 'Pour toutes les disciplines', discipline: 'tous', items: [
    ['c1', 'Proposer des supports écrits aérés et agrandis (exemple : ARIAL 14)'],
    ['c2', 'Permettre l’utilisation de trieurs ou de pochettes à rabats'],
    ['c3', 'Limiter la copie (synthèse du cours photocopiée)'],
    ['c4', 'Mettre en place un tutorat (prise de notes, etc.)'],
    ['c5', 'Autoriser les abréviations'],
    ['c6', 'Privilégier l’agenda ainsi que l’espace numérique de travail (cahier de texte individuel, de groupe, de la classe)'],
    ['c7', 'Utiliser le surligneur'],
    ['c8', 'Faire construire une fiche mémoire et permettre à l’élève de l’utiliser, y compris durant l’évaluation'],
    ['c9', 'Proposer une aide méthodologique'],
    ['c10', 'Aider à l’organisation'],
    ['c11', 'S’assurer de la compréhension du vocabulaire spécifique'],
    ['c12', 'Définir systématiquement le vocabulaire spatial et temporel utilisé'],
    ['c13', 'Prendre en compte les contraintes associées (fatigue, lenteur, etc.)'],
    ['c14', 'Autoriser l’utilisation d’une calculatrice simple (permettant les quatre opérations) dans toutes les disciplines'],
  ] },
  { id: 'informatique', titre: 'Utilisation de l’informatique', discipline: 'tous', sous: true, items: [
    ['i1', 'Permettre l’utilisation de l’ordinateur et de la tablette'],
    ['i2', 'Permettre l’utilisation d’une clef USB'],
    ['i3', 'Permettre l’utilisation de logiciel ou d’application spécifique'],
    ['i4', 'Permettre à l’élève d’imprimer ses productions'],
  ] },
  { id: 'evaluations', titre: 'Évaluations', discipline: 'tous', items: [
    ['e1', 'Accorder un temps majoré'],
    ['e2', 'Privilégier les évaluations sur le mode oral'],
    ['e3', 'Diminuer le nombre d’exercices, de questions le cas échéant lorsque la mise en place du temps majoré n’apparaît pas possible ou pas souhaitable'],
    ['e4', 'Limiter la quantité d’écrit (recours possible aux QCM, exercices à trous, schémas, etc.)'],
    ['e5', 'Ne pas pénaliser les erreurs (orthographe grammaticale, d’usage) et le soin dans les travaux écrits'],
    ['e6', 'Ne pas pénaliser le manque de participation à l’oral (ou les difficultés)'],
  ] },
  { id: 'devoirs', titre: 'Devoirs', discipline: 'tous', items: [
    ['d1', 'Limiter le « par cœur », demander à ce que les notions clés uniquement soient retenues'],
    ['d2', 'Donner moins d’exercices à faire'],
    ['d3', 'Aider à la mise en place de méthodes de travail (systèmes d’organisation répétitifs, accompagnement personnalisé)'],
  ] },
  { id: 'francais', titre: 'Français', discipline: 'Français', items: [
    ['f1', 'Proposer des dictées aménagées (à trous, avec un choix parmi plusieurs propositions, etc.)'],
    ['f2', 'Faciliter l’apprentissage des règles en proposant à l’élève des moyens mnémotechniques'],
    ['f3', 'Favoriser, dans le choix des ouvrages, les livres ayant une version audio'],
    ['f4', 'Faciliter la production d’écrit (autoriser un répertoire personnel, lui apprendre à utiliser les indicateurs de temps pour structurer le récit)'],
    ['f5', 'Grouper les mots par similitude orthographique/phonologique, faire des listes, utiliser les couleurs pour segmenter les mots, les phrases'],
  ] },
  { id: 'maths', titre: 'Mathématiques', discipline: 'Mathématiques', items: [
    ['m1', 'Proposer à l’élève des fiches outils (tables, définitions, théorèmes, etc.)'],
    ['m2', 'Lorsque c’est interdit, autoriser l’utilisation d’une calculatrice simple (permettant les quatre opérations)'],
    ['m3', 'Utiliser la schématisation en situation problème'],
  ] },
  { id: 'lv', titre: 'Langues vivantes', discipline: 'Langues vivantes', items: [
    ['l1', 'Évaluer plutôt à l’oral'],
    ['l2', 'Proposer à l’élève des supports visuels pour faciliter la compréhension'],
    ['l3', 'Insister sur la prononciation et la distinction des nouveaux sons de la langue'],
    ['l4', 'Grouper les mots par similitude orthographique/phonologique, faire des listes'],
  ] },
  { id: 'hg', titre: 'Histoire / géographie', discipline: 'Histoire-géographie', items: [
    ['h1', 'Utiliser les affiches et chronologies dans la salle'],
    ['h2', 'Surligner les mots-clés ou nouveaux'],
    ['h3', 'Autoriser la lecture de documents avec un guide de lecture ou un cache, etc.'],
    ['h4', 'Agrandir les cartes, mettre des couleurs'],
  ] },
  { id: 'arts', titre: 'Arts plastiques', discipline: 'Arts plastiques', items: [
    ['a1', 'Privilégier les incitations orales, visuelles, sonores, théâtrales'],
    ['a2', 'Utiliser et valoriser les compétences spatiales (réalisations en 3D)'],
  ] },
  { id: 'eps', titre: 'Éducation physique et sportive', discipline: 'EPS', items: [
    ['p1', 'Adapter les activités (individuelles/collectives), leurs caractéristiques, leurs rythmes, les performances attendues'],
    ['p2', 'Autoriser l’élève à dribbler à deux mains ou à faire des reprises de dribble (au basket par exemple)'],
    ['p3', 'Faire varier les couleurs des maillots qui différencient nettement partenaires et adversaires dans les sports collectifs'],
    ['p4', 'Doter d’un signe distinctif suffisamment net les joueurs tenant certains rôles dans les jeux collectifs'],
    ['p5', 'Verbaliser ou faire verbaliser les éléments d’une tâche complexe à accomplir (enchaînement de mouvements), éviter au maximum les activités qui impliquent une double tâche et mobilisent l’attention de l’élève sur deux objets'],
  ] },
].map(s => ({ ...s, items: s.items.map(([id, texte]) => ({ id, texte })) }));

export const ITEMS = new Map(SECTIONS.flatMap(s => s.items.map(i => [i.id, { ...i, section: s.id }])));

// Disciplines proposées aux collègues (étape 2) ; celles sans rubrique propre voient seulement les parties communes.
export const DISCIPLINES = ['Français', 'Mathématiques', 'Langues vivantes', 'Histoire-géographie', 'Sciences de la vie et de la Terre',
  'Physique-chimie', 'Technologie', 'Arts plastiques', 'Éducation musicale', 'EPS', 'Autre'];

// Niveau d'une classe (« 5e B », « 4E - PR », niveau enregistré…) → '6e' … '3e', ou null.
export function niveauDe(cls) {
  const src = String((cls && (cls.level || cls.name)) || '');
  const m = src.match(/([3-6])\s*(?:e|è|E|ème|EME)?/);
  return m ? m[1] + 'e' : null;
}
