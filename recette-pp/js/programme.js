// programme.js — Programme de technologie du cycle 4 (BO n° 9 du 29 février 2024),
// en vigueur en 5e (2024-2025), 4e (2025-2026) et 3e (2026-2027).
// 3 thèmes, 9 compétences de fin de cycle, et pour chaque partie les repères de progressivité par niveau.
// Sert à choisir les critères d'un projet (fenêtre « Choisir dans le programme »).

export const SOURCE = 'Programme de technologie du cycle 4 · BO n° 9 du 29 février 2024';
export const NIVEAUX = ['5e', '4e', '3e'];

// part(titre, [repères 5e], [repères 4e], [repères 3e])
const part = (title, n5, n4, n3) => ({ title, reperes: { '5e': n5, '4e': n4, '3e': n3 } });

export const THEMES = [
  {
    title: 'Les objets et les systèmes techniques : leurs usages et leurs interactions à découvrir et à analyser',
    competences: [
      {
        label: 'Décrire les liens entre usages et évolutions technologiques des objets et des systèmes techniques',
        parts: [
          part('L’évolution des OST', [
            'Collecter, trier et analyser des données',
            'Comparer des principes techniques pour une même fonction technique',
          ], [
            'Mettre en relation les OST avec leurs usages',
            'Identifier les avantages et les inconvénients associés aux évolutions technologiques et informatiques',
            'Justifier l’évolution d’un OST pour répondre à l’évolution des besoins',
          ], [
            'Identifier les innovations de rupture qui sont attachées à l’évolution d’un OST',
            'Mettre en relation une découverte scientifique avec ses développements technologiques et leurs effets sur la société',
            'Exprimer dans un argumentaire court l’incidence d’un OST sur la société',
            'Exprimer dans un argumentaire court l’incidence des contraintes sociétales sur les OST',
          ]),
          part('Usages et impacts sociétaux du numérique', [
            'Décrire le rôle des systèmes d’information dans le partage d’information',
            'Recenser des données, les identifier, les classer, les représenter, les stocker dans des fichiers, les retrouver dans une arborescence',
            'Identifier des règles permettant de sécuriser un environnement numérique (bases de la cybersécurité) et des règles de respect de la propriété intellectuelle',
            'Appréhender la responsabilité de chacun dans les dérives (cyberviolence, atteinte à la vie privée, aux données personnelles, usurpation d’identité)',
          ], [
            'Identifier et appliquer les règles pour un usage raisonné des objets communicants et des environnements numériques (propriété intellectuelle, identité numérique, témoins de connexion, géolocalisation)',
          ], [
            'Exprimer dans un argumentaire court le rôle du développement stratégique du numérique au sein de la société et des environnements professionnels (ou des métiers)',
          ]),
        ],
      },
      {
        label: 'Décrire les interactions entre un objet ou un système technique, son environnement et les utilisateurs',
        parts: [
          part('L’OST dans son environnement', [
            'Faire la liste des interacteurs extérieurs d’un OST',
            'Repérer et expliquer les choix de conception dans les domaines de l’ergonomie et de la sécurité ou en lien avec des objectifs de développement durable',
          ], [
            'Décrire l’expérience de l’utilisateur (ressenti et facilité d’usage) d’un OST en partant du langage naturel (texte, croquis) pour aboutir aux schémas, graphiques, algorithmes',
            'Repérer et expliquer les contraintes, exigences prises en compte (sécurité, incidences environnementales, formes et fonctions, ergonomie, qualité, fiabilité) pour répondre aux attentes des utilisateurs',
          ], [
            'Décrire l’expérience de l’utilisateur d’un OST à l’aide de modes de représentation choisis',
          ]),
        ],
      },
      {
        label: 'Caractériser et choisir un objet ou un système technique selon différents critères',
        parts: [
          part('Le choix d’un OST dans un contexte de développement durable', [
            'Repérer pour un OST les matériaux, les sources et les formes d’énergie, le traitement de l’information',
            'Identifier les étapes du cycle de vie d’un OST influencées par les choix de matériaux et d’énergie',
            'Choisir un OST parmi plusieurs propositions en vue de répondre à un besoin',
          ], [
            'Identifier les caractéristiques à prendre en compte dans le choix d’un OST en vue de répondre à un besoin',
            'Comparer qualitativement et/ou quantitativement (incidences environnementales, bilan carbone, efficacité énergétique) plusieurs OST répondant au même besoin et arrêter un choix',
          ], [
            'Établir une liste d’OST possibles en vue de répondre à un besoin',
            'Choisir un OST et argumenter ce choix en prenant en compte son cycle de vie et les trois piliers du développement durable',
            'Évaluer les OST selon des exigences ou des critères identifiés (caractéristiques, performances, coût, indice de réparabilité)',
          ]),
          part('La performance des OST', [
            'Mesurer et comparer une performance d’un OST à partir d’un protocole fourni',
          ], [
            'Choisir les appareils de mesure à utiliser pour mesurer une performance d’un OST à partir d’un protocole donné',
          ], [
            'Définir et mettre en œuvre un protocole pour mesurer une caractéristique, une performance d’un OST',
          ]),
        ],
      },
    ],
  },
  {
    title: 'Structure, fonctionnement, comportement : des objets et des systèmes techniques à comprendre',
    competences: [
      {
        label: 'Décrire et caractériser l’organisation interne d’un objet ou d’un système technique et ses échanges avec son environnement (énergies, données)',
        parts: [
          part('Fonctions, solutions, constituants de la chaîne d’énergie', [
            'Associer des solutions techniques à une ou des fonctions techniques',
            'Identifier des constituants de la chaîne d’énergie d’un objet technique (l’organisation de la chaîne d’énergie étant fournie)',
            'Indiquer la nature des énergies en entrée et en sortie des constituants de la chaîne d’énergie',
          ], [
            'Identifier les constituants d’une chaîne d’énergie et les associer à leurs fonctions',
            'Repérer les transformations d’énergie et les flux d’énergie au sein de l’OST',
          ], [
            'Élaborer, à l’aide d’un schéma bloc, la chaîne d’énergie d’un OST',
          ]),
          part('Matériaux et procédés', [
            'Identifier les principaux matériaux constitutifs d’un OST',
          ], [
            'Mettre en relation la forme d’une pièce avec le procédé de réalisation',
          ], [
            'Justifier le choix d’un matériau et de son procédé de mise en forme au regard des contraintes techniques et environnementales',
          ]),
          part('Fonctions, solutions, constituants de la chaîne d’information', [
            'Identifier des constituants de la chaîne d’information d’un OST (l’organisation de la chaîne d’information étant fournie)',
          ], [
            'Identifier les constituants de la chaîne d’information d’un objet réel et les associer à leur fonction',
          ], [
            'Décrire un OST en caractérisant sa chaîne d’information',
            'Associer des grandeurs analogiques issues d’un OST à des données exploitables',
          ]),
          part('Structuration et traitement des données', [
            'Déterminer des descripteurs permettant de décrire des objets sous forme de données en précisant leurs types et leurs formats',
          ], [
            'Décrire et analyser la transformation des données téléversées ou issues d’un OST',
            'Décrire et analyser la structuration d’une table de données qui permet une exploitation et une interprétation du comportement d’un OST',
          ], [
            'Représenter sous forme de données les informations de diverses natures utilisées par un OST',
            'Identifier, selon les cas, leur mise en forme, leur transmission, ou leur stockage dans des fichiers (texte, image, nombre) afin de comprendre le fonctionnement de l’OST',
          ]),
          part('La circulation de l’information dans un réseau informatique', [
            'Identifier les composants qui constituent un réseau local (terminaux, commutateurs, liaisons filaires et sans fil (WiFi)) et sa topologie',
            'Justifier la nécessité d’identifier les terminaux pour communiquer sur un réseau local (activité débranchée et vérification par un outil de simulation)',
          ], [
            'Paramétrer une adresse IP fixe pour ajouter un objet connecté à un réseau local',
            'Résoudre des problèmes pour assurer la communication entre les différents terminaux dans un réseau informatique (simulation ou réseau local déconnecté du réseau pédagogique)',
            'Compléter une simulation fournie pour valider le comportement d’un réseau informatique',
          ], [
            'Identifier et représenter la circulation d’une information dans le réseau Internet',
            'Justifier la nécessité d’un protocole de routage pour faire communiquer plusieurs réseaux (activité débranchée, table de routage donnée)',
          ]),
        ],
      },
      {
        label: 'Identifier un dysfonctionnement d’un objet technique et y remédier',
        parts: [
          part('Le dépannage et la réparation', [
            'Repérer visuellement une pièce défectueuse',
            'Réaliser une réparation en suivant un protocole fourni',
            'Découvrir les procédés de réalisation présents dans un atelier de fabrication collaboratif',
          ], [
            'Proposer un protocole permettant de vérifier l’origine d’un dysfonctionnement',
            'Remplacer une pièce défectueuse sans protocole fourni (la pièce de remplacement étant fournie)',
            'Choisir les procédés de réalisation et les mettre en œuvre',
          ], [
            'Formuler des hypothèses expliquant le dysfonctionnement d’un objet technique',
            'Proposer un protocole de dépannage puis de réparation',
            'Réaliser le dépannage ou la réparation d’un système défectueux',
            'Réaliser une pièce sur mesure pour réparer un objet technique',
          ]),
        ],
      },
      {
        label: 'Comprendre et modifier un programme associé à une fonctionnalité d’un objet ou d’un système technique',
        parts: [
          part('La programmation d’une nouvelle fonctionnalité', [
            'Identifier les données utilisées et produites par le programme associé à une fonctionnalité d’un OST (à partir d’un programme existant)',
            'Comprendre et traduire en un algorithme en langage naturel le programme associé à une fonctionnalité d’un OST',
            'Modifier les paramètres d’un programme et identifier ou évaluer ses effets en termes de fonctionnalité',
          ], [
            'Analyser les données et en déduire des modifications à apporter au programme',
            'Compléter un programme pour répondre à une fonctionnalité d’un OST',
            'Tester et valider, dans un environnement simulé ou réel, une modification du programme',
          ], [
            'Déterminer les données utilisées et produites par un programme associé à une fonctionnalité en vue de le modifier',
            'Programmer un algorithme lié à une nouvelle fonctionnalité',
            'Modifier et tester le programme associé à une nouvelle fonctionnalité d’un OST',
          ]),
        ],
      },
    ],
  },
  {
    title: 'Création, conception, réalisation, innovations : des objets à concevoir et à réaliser',
    competences: [
      {
        label: 'Imaginer, concevoir et réaliser une ou des solutions en réponse à un besoin, à des exigences (de développement durable, par exemple) ou à la nécessité d’améliorations dans une démarche de créativité',
        parts: [
          part('La gestion de projet technique', [
            'Suivre un processus de conception et de réalisation dans une durée, avec des tâches identifiées',
          ], [
            'Organiser un processus de conception et de réalisation dans une durée, avec des tâches identifiées',
          ], [
            'Élaborer un processus de conception et de réalisation dans une durée, avec des tâches identifiées',
          ]),
          part('Le prototypage de solutions', [
            'Fabriquer une solution pour améliorer un OST existant',
          ], [
            'Proposer et fabriquer une solution pour ajouter une nouvelle fonction à un OST (croquis, schéma, graphique, algorithme, modélisation)',
          ], [
            'Proposer et fabriquer un ensemble de solutions pour produire un nouvel OST (croquis, schéma, graphique, algorithme, modélisation)',
          ]),
          part('Le choix des matériaux', [
            'Choisir un matériau parmi plusieurs proposés en fonction de leurs caractéristiques',
          ], [
            'Comparer différents matériaux pour choisir le plus adapté',
          ], [
            'Choisir un matériau constitutif d’un objet et/ou système technique',
          ]),
          part('Le choix d’une source d’énergie', [
            'Choisir une source d’énergie parmi plusieurs proposées et une forme d’énergie possible',
          ], [
            'Comparer différentes sources d’énergie pour choisir la plus adaptée',
          ], [
            'Choisir une source d’énergie pour un OST',
          ]),
          part('L’assemblage de constituants', [
            'Assembler les constituants fournis pour réaliser un prototype',
          ], [
            'Identifier les constituants manquants dans un prototype et le compléter',
          ], [
            'Choisir les constituants et assembler un prototype',
          ]),
          part('La modélisation et la fabrication', [
            'Mettre en œuvre les moyens pour réaliser une forme selon une procédure fournie',
          ], [
            'Modifier une forme à l’aide d’une modélisation',
            'Choisir les moyens et produire la forme voulue',
          ], [
            'Modéliser une forme voulue',
            'Choisir les moyens et produire la forme voulue',
          ]),
          part('Les objets communicants', [], [
            'Interfacer un objet technique avec un réseau',
          ], [
            'Interfacer deux objets techniques communicants',
          ]),
        ],
      },
      {
        label: 'Valider les solutions techniques par des simulations ou par des protocoles de tests',
        parts: [
          part('La validation du comportement mécanique d’un matériau', [
            'Utiliser une simulation fournie pour valider la tenue mécanique d’un matériau',
            'Mettre en œuvre un protocole de test fourni pour valider la tenue mécanique d’un matériau',
          ], [
            'Paramétrer une simulation fournie pour valider la tenue mécanique d’un matériau',
            'Proposer un protocole de test pour valider la tenue mécanique d’un matériau',
          ], [
            'Mettre en œuvre une simulation pour valider la tenue mécanique d’un matériau',
            'Proposer un protocole de test pour valider la tenue mécanique d’un matériau',
          ]),
          part('La validation des performances d’un OST', [
            'Vérifier le comportement et les performances d’un objet technique en suivant un protocole fourni',
          ], [
            'Proposer un protocole de test pour valider le comportement et les performances d’un objet technique',
          ], [
            'Proposer un protocole de test pour valider le comportement et les performances d’un objet technique',
          ]),
        ],
      },
      {
        label: 'Concevoir, écrire, tester et mettre au point un programme',
        parts: [
          part('La programmation des OST', [
            'Analyser un programme simple fourni et tester s’il répond au besoin ou au problème posé',
            'Modifier un programme fourni pour répondre au besoin ou à un problème posé',
            'Réaliser et mettre au point un programme simple commandant un OST',
          ], [
            'Modifier un algorithme permettant de répondre au besoin ou au problème posé',
            'Traduire un algorithme permettant de répondre à un besoin ou à un problème simple en un programme',
            'Réaliser et mettre au point un programme commandant un système réel incluant éventuellement une interaction entre un humain et une machine',
          ], [
            'Élaborer ou concevoir un algorithme permettant de répondre au besoin visé, puis le traduire en un programme structuré (appel de sous-programmes ou de fonctions), le tester et le mettre au point',
            'Réaliser et mettre au point un programme commandant un système réel incluant une interaction entre un humain et une machine',
          ]),
        ],
      },
    ],
  },
];

// Liste à plat des 9 compétences, numérotées de 1 à 9 dans l'ordre du programme.
export const COMPETENCES = THEMES.flatMap((t, ti) => t.competences.map(c => ({ ...c, theme: ti })));
COMPETENCES.forEach((c, i) => { c.n = i + 1; });
