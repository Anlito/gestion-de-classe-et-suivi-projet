# Carnet de classe — gestion de classe et suivi de projet

Application web installable (PWA) pour un professeur de technologie au collège (6e à 3e, SEGPA),
pensée pour une tablette Android et utilisable hors ligne. Toutes les données restent sur l'appareil.

**Adresse de l'app :** https://anlito.github.io/gestion-de-classe-et-suivi-projet/
(publiée par GitHub Pages depuis la branche `main` : chaque envoi sur `main` met l'app à jour sur la tablette).

## Fonctionnalités

- **Trombinoscope** : un toucher = une observation « Comportement » (−) ou « Aide / soutien / rangement » (+) ;
  appui long = choix d'un motif. **Appel** (présent / absent / retard) et **tirage au sort** parmi les présents.
- **Fiche élève** : compteurs par trimestre, absences, retards, besoins particuliers (PAP, PPS…), aménagements,
  historique, notes libres, fiche PDF.
- **Projets** : un projet (séances, critères) est associé à des classes ; journal de chaque séance.
  Critères choisis librement ou **dans le programme de technologie du cycle 4** (BO n° 9 du 29 février 2024).
- **Groupes** et **Notes** : évaluation des groupes par niveaux 1 à 4 par critère, note /20, mention,
  ajustements individuels.
- **Administration** : classes, élèves, import des photos depuis un trombinoscope PDF, sauvegarde / restauration
  (fichier JSON), exports CSV (récapitulatif, compétences à recopier dans Pronote), code d'accès, réglages.

## Organisation du code

Aucun outil de compilation : HTML, CSS et JavaScript (modules ES) servis tels quels.

| Fichier | Rôle |
|---|---|
| `index.html`, `manifest.webmanifest`, `sw.js` | page, installation, fonctionnement hors ligne (liste des fichiers en cache) |
| `js/app.js` | démarrage, routes (`#/...`) → écrans |
| `js/db.js` | stockage IndexedDB + copie en mémoire, `commit()` avec annulation, instantané de sauvegarde |
| `js/model.js` | règles métier : trimestres, observations, motifs, appel/absences/retards, besoins, projets, groupes, notes |
| `js/programme.js` | programme de technologie cycle 4 : 3 thèmes, 9 compétences, repères par niveau |
| `js/ical.js` | lecture des emplois du temps exportés de Pronote (.ics) : cours, statuts, vacances, heure de Paris |
| `tests/index.html` | page de tests automatiques (+ vérification locale de ses propres fichiers .ics) |
| `js/backup.js` | fichiers produits : sauvegarde JSON, CSV |
| `js/screens/*.js` | un fichier par écran (`render`, `mount`, `actions`) |
| `css/app.css` | styles (thèmes clair / sombre) |

### Règles à respecter à chaque nouvelle version

1. Augmenter la version **aux deux endroits** : `VERSION` dans `sw.js` et `APP_VERSION` dans `js/nav.js`
   (sinon la tablette garde l'ancienne version en cache).
2. Tout nouveau fichier JS doit être ajouté à la liste `FILES` de `sw.js`.
3. Nouvelle table de données : l'ajouter à `STORES` dans `js/db.js` **et** augmenter `DB_VERSION`.
   Penser aux suppressions en cascade dans `model.js` (`deleteStudentIn`, `deleteClassIn`, `deleteAssignmentIn`).
4. Ajouter une entrée dans l'historique ci-dessous.
5. **Confidentialité : le dépôt est public.** Ne jamais y mettre de vraies données : emplois du temps Pronote
   (`*.ics`, bloqués par `.gitignore`), noms d'élèves ou de collègues, sauvegardes. Les tests et la démonstration
   utilisent uniquement des données fictives.
6. Lancer la page de tests (`tests/index.html`) : tout doit être vert.

### Tester sur l'ordinateur

Servir le dossier avec n'importe quel serveur web local (par exemple `python -m http.server 8765`)
puis ouvrir http://localhost:8765. Sur `localhost`, le service worker charge toujours les fichiers frais.
Réglages → « Remplacer par les données de démonstration » donne des classes fictives pour essayer.

## Chantier en cours : Planning (décisions prises)

Après chaque étape : nouvelle version, liste de tests à faire sur la tablette, attendre le retour du professeur.

- Deux établissements (COLLEGE PONT ROUSSEAU, COLLEGE RENE BERNIER), un fichier .ics chacun.
- **Une classe de l'app par groupe Pronote** (ex. `[3C2D1]` → classe « 3C2D1 »). Les noms de classes sont rendus
  uniques par les initiales du collège (PR, RB) : pas de champ « établissement » sur les classes. La
  correspondance classe Pronote → classe de l'app est propre à chaque établissement, proposée automatiquement
  (comparaison sans espaces, crochets ni initiales) puis validée, mémorisée et modifiable dans l'admin.
- **Le planning ne montre que les cours** (+ vacances et fériés, discrets). Pas d'événements Agenda : le professeur
  ajoute une **note sur un cours** quand un événement le concerne (photo, élection…) ; notes conservées à la
  réimportation.
- Rôle des matières (réglable) : TECHNOLOGIE, SCIENCES TECHNOLOGIE = cours suivi (appel + séance) ; VIE DE CLASSE =
  appel seulement ; tout le reste = **masqué** par défaut (autre choix : affiché en grisé).
- « Cours déplacé » = cours qui a lieu (alertes) ; pas d'alerte pour annulé, classe absente, sortie pédagogique,
  absence personnelle, vacances, fériés.
- Alertes dans l'app : appel non fait 15 min après le début ; séances non remplies à partir de 18h.
- Statistiques : un élève en retard compte comme présent ; taux = appels sans absence / appels.

## Historique des versions

### 1.5.0 — 30 septembre 2026 · Planning, étape 1/7 : lecture des fichiers Pronote

Chantier « Planning » (emploi du temps importé de Pronote, appel rattaché aux cours, alertes, statistiques
de présence), mené en 7 étapes : 1 lecture iCal · 2 tables et import · 3 accueil planning · 4 saisie manuelle
et notes sur un cours · 5 appel rattaché et alertes · 6 réimportation et conflits · 7 statistiques.

- Nouveau `js/ical.js` : lit un export iCal de Pronote (un fichier par établissement, nom lu dans
  `X-WR-CALDESC`). Dépliage des lignes, échappements iCal et codes HTML, conversion UTC → heure de Paris
  (changement d'heure compris), statuts (`CATEGORIES` « Cours - … »), vacances et jours fériés (fin exclusive).
  Garde seulement date, début, fin, classe ou groupe (« Groupe » prioritaire, ex. `[3C2D1]`), salle, matière,
  statut. Jamais les professeurs, résumés ni UID. « Agenda » et « Sessions de stage » ignorés (décision : le
  planning ne montre que les cours ; une note sur un cours servira pour les événements, étape 4).
- Constats sur les exports réels : un « Cours déplacé » est le nouveau créneau (le cours a lieu) et l'ancien
  créneau apparaît en « Cours annulé » ; les réunions (COORDINATION/CONCERTATION) sont des cours sans classe.
- Clé de réimportation : établissement + date + heure de début + classe (les UID changent à chaque export).
- Page `tests/index.html` : 26 tests automatiques sur un emploi du temps fictif, et vérification locale
  de ses propres fichiers (lus sur l'appareil, rien n'est enregistré).
- `.gitignore` : `*.ics` et `local-test/` ne peuvent pas être envoyés sur GitHub.
- Aucun changement visible dans l'app pour l'instant.

### 1.4.1 — 28 septembre 2026

- **Choix dans le programme : l'intitulé du critère n'est plus modifié.** Choisir un repère ou une compétence
  remplit seulement la colonne « Compétence Pronote » (compétence de fin de cycle) ; l'intitulé reste celui écrit
  par le professeur. Pour un critère sans intitulé, le repère choisi s'affiche en grisé comme exemple et le curseur
  s'y place. Un critère relié à une compétence doit avoir un intitulé pour être enregistré.

### 1.4.0 — 28 septembre 2026

- **Motifs des observations modifiables** (Réglages → « Motifs des observations ») : ajouter, renommer,
  supprimer les motifs proposés à l'appui long, pour « Comportement » et pour « Aide ». Sans modification,
  les motifs d'origine s'appliquent ; bouton « Rétablir les motifs par défaut ». Réglage stocké dans `meta.motifs`
  (inclus dans les sauvegardes).
- **Retards** : nouvelle table `retards` (`DB_VERSION` 4).
  - À l'appel, chaque toucher fait passer l'élève de Présent → Absent → Retard → Présent ; un élève en retard
    n'est plus compté absent. « Corriger cet appel » permet de noter un élève arrivé après l'appel.
  - Fiche élève : bouton « Arrivé en retard » (même sans appel), compteur du trimestre et de l'année,
    filtre « Retards » dans l'historique.
  - Trombinoscope : étiquette « Retard » et nombre de retards dans l'en-tête.
  - Récapitulatif CSV / PDF : colonne « Retards » par trimestre ; fiche PDF : dates des retards.
- **Besoins particuliers des élèves** : dans la fiche élève, cases PAP, PPS, PPRE, PAI, AESH, ULIS, UPE2A
  et zone de texte « Aménagements ». Rappel discret sous le nom dans le trombinoscope ; section dans la fiche PDF.
  Champs `besoins` et `amenagements` des élèves.
- **Critères choisis dans le programme** : dans l'éditeur de projet, « Choisir dans le programme » ouvre les
  9 compétences de fin de cycle du programme de technologie cycle 4 (BO n° 9 du 29 février 2024), avec les
  repères de progressivité filtrables par niveau (5e / 4e / 3e). Plusieurs repères peuvent être ajoutés d'un coup ;
  l'icône livre d'un critère le remplace. La compétence de fin de cycle est recopiée dans « Compétence Pronote »
  (en 1.4.0 le repère remplaçait aussi l'intitulé, voir 1.4.1). Données dans `js/programme.js`.

### 1.3.1 — 27 septembre 2026

- Version de départ de ce lisez-moi : trombinoscope avec observations et motifs, appel et absences, tirage au sort,
  projets et séances, groupes, notes par niveaux avec ajustements, import du trombinoscope PDF, sauvegarde,
  exports CSV et PDF, code d'accès, thème sombre, mises à jour automatiques.

## Pistes pour la suite

- Synchronisation chiffrée avec Google Drive (`db.js` est prévu pour : `onChange`, `exportSnapshot`).
- Chiffrement des sauvegardes (les besoins particuliers sont des données sensibles).
- Archive de l'année avant « Nouvelle année » (aujourd'hui, les classes sont supprimées).
- Semestres au lieu des trimestres, coefficients sur les critères, seuils de mention réglables.
- Tests automatiques des règles de `model.js`.
