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
| `js/planning.js` | emploi du temps : établissements, cours, vacances, rôle des matières, correspondance des classes, import |
| `js/screens/emploi-du-temps.js` | Administration → Emploi du temps : import, correspondance des classes, aperçu, rôles |
| `js/screens/semaine.js` | accueil `#/` : planning de la semaine (sans emploi du temps : affiche la liste des classes) |
| `js/screens/accueil.js` | liste des classes en tuiles (`#/classes`) |
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

- Deux établissements (initiales PR et RB), un fichier .ics chacun.
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

### 1.8.1 — 30 septembre 2026 · Correctif : les listes se refermaient toutes seules

- Sur la tablette, ouvrir une liste (ex. choix de la classe dans « + Cours ») ou un champ date / heure / texte
  fait apparaître le clavier ou une fenêtre de choix, ce qui réduit la hauteur de l'écran. Le planning se
  redessinait alors (réglage de la hauteur de la grille, depuis 1.7.0) et la liste disparaissait avant le choix.
- Désormais le planning ne se redessine qu'au changement de **largeur** (tablette tournée), jamais pendant
  qu'un champ est utilisé ou qu'une fiche est ouverte ; la hauteur de la grille se base sur la plus grande
  hauteur connue pour cette largeur.
- À retenir pour la suite : ne jamais redessiner l'écran sur un simple changement de hauteur (Android).

### 1.8.0 — 30 septembre 2026 · Planning, étape 4/7 : saisie manuelle et notes sur un cours

- Principe : les champs Pronote d'un cours ne sont **jamais** modifiés par le professeur. Ses changements vont
  dans `cours.perso` (`date`, `debut`, `fin`, `salle`, `annule`) et la note dans `cours.note` ; l'affichage
  utilise `planning.eff(cours)`. Ainsi la réimportation compare Pronote à Pronote et garde les modifications.
  Un cours ajouté à la main a `source: 'manuel'`, `classId` (classe de l'app), `role`, `etabId` facultatif.
- Planning : bouton **⋯** sur chaque cours → fiche du cours (tiroir) : détails, **note** (affichée sur le cours et
  en bandeau en haut du trombinoscope quand on ouvre la classe depuis ce cours, ou pour le cours du moment),
  **Modifier ou déplacer** (date, début, fin — la fin suit le début —, salle), **Annuler ce cours** / Rétablir,
  **Revenir à la version Pronote**, Supprimer (cours ajoutés). Toucher le cours lui-même ouvre toujours la classe.
- Modifier / déplacer : si la classe a d'autres cours le même jour au même horaire plus tard dans l'année, choix
  « Cette fois seulement » ou « Ce cours et toutes les semaines suivantes » (même décalage de jours, mêmes heures et
  salle ; les cours passés ne changent pas).
- Bouton **+ Cours** : classe, date, début, fin, salle, établissement (facultatif), type (cours suivi / appel
  seulement / en grisé), « chaque semaine jusqu'à la fin de l'année » (vacances et fériés sautés). Mention
  « modifié » / « ajouté » sur le cours ; icône de note (texte complet si le cours est assez haut).
- Réimportation : un cours disparu de Pronote mais modifié ou annoté est **gardé** (compté à part dans l'aperçu).
  La liste des conflits (Pronote a changé un cours modifié) viendra à l'étape 6.
- `planning.coursContexte(classId)` : cours « en contexte » d'une classe (dernier cours touché dans le planning,
  sinon celui du moment, sinon le prochain de la journée) — servira à rattacher l'appel à l'étape 5.

### 1.7.0 — 30 septembre 2026 · Planning, étape 3/7 : l'accueil devient le planning

- Nouvel accueil (`js/screens/semaine.js`) : semaine du lundi au vendredi (samedi s'il y a cours), plage horaire
  calculée d'après les cours (8 h – 17 h minimum), hauteur ajustée pour tenir sur l'écran de la Tab S7+ en paysage.
  Semaine précédente / suivante, « Aujourd'hui », colonne du jour teintée, trait rouge de l'heure actuelle
  (rafraîchi chaque minute), cours en cours encadré avec « En cours ».
- Chaque cours : bord à la couleur du collège, nom de la classe de l'app (sinon le nom Pronote), heures, salle,
  étiquette de statut (Annulé, Déplacé, Classe absente, Sortie…). Annulé / classe absente / absence personnelle :
  barré en pointillés. Matière « En grisé », classe ignorée ou réunion sans classe : estompé. Matière « Masqué » :
  absent. Classe pas encore reliée : bord orange et « ? » (le toucher ouvre Emploi du temps).
- Vacances et jours fériés : colonne teintée et libellé dans l'en-tête du jour. Cours qui se chevauchent : côte à côte.
- Toucher un cours → trombinoscope de la classe. Bouton **Classes** (liste des classes, `#/classes`) à côté
  d'Administration. Les liens « retour » des écrans de classe s'appellent maintenant « Accueil ».
- Téléphone (< 700 px) : un jour à la fois, onglets Lun … Ven, flèches jour précédent / suivant.
- Sans emploi du temps importé, l'accueil reste la liste des classes (comme avant).
- Vérifié en local sur les vrais exports : semaine en cours, décembre (6 A toujours à 15h05), vacances de la
  Toussaint, cours déplacés / annulés, téléphone sans défilement horizontal. Données locales effacées après test.

### 1.6.0 — 30 septembre 2026 · Planning, étape 2/7 : tables et import

- Nouvelles tables (`DB_VERSION` 5) : `etablissements` (nom, initiales, couleur, correspondance des classes),
  `cours` (date, début, fin, classe Pronote, salle, matière, statut, source), `jours` (vacances, fériés).
  Réglage `meta.matiereRoles`. Tout est dans la sauvegarde JSON et l'instantané (`exportSnapshot`).
- **Administration → Emploi du temps** : « Importer des fichiers Pronote » (plusieurs .ics à la fois) →
  pour chaque établissement, initiales (proposées d'après le nom : PR, RB) et couleur, puis correspondance
  classe/groupe Pronote → classe de l'app ou « Ignorer » (proposition automatique : comparaison sans espaces,
  crochets, initiales ni « e » de « 4e » ; en cas de doublon, la classe qui porte les initiales du collège) →
  aperçu (ajoutés / modifiés / supprimés / inchangés, cours par rôle) → « Valider l'import » (annulable).
  Correspondance mémorisée et modifiable (bouton « Classes »), couleur modifiable, suppression d'un établissement.
- Réimportation déjà sûre : cours reconnus par date + début + classe, identifiants conservés, pas de doublon
  (la protection des modifications manuelles et les conflits viendront à l'étape 6).
- **Rôle des matières** réglable : Cours suivi / Appel seulement / En grisé / Masqué (défauts : technologie =
  suivi, vie de classe = appel, le reste masqué). Tous les cours sont stockés ; le rôle ne joue qu'à l'affichage.
- Cascades : supprimer une classe rend sa correspondance « à choisir » ; « Nouvelle année » efface cours et
  vacances de l'année écoulée (établissements et rôles conservés).
- Démonstration : emploi du temps fictif (« COLLEGE DES TILLEULS », 2 h de technologie par classe et par semaine,
  vacances, quelques statuts dans les jours qui viennent).
- Tests : 32 (6 nouveaux sur initiales, rapprochement des classes, réimportation).
- Vérifié en local avec les deux exports réels : 200 + 492 cours, propositions de classes justes, réimportation
  du même fichier = 0 changement, sauvegarde/restauration identique.

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
