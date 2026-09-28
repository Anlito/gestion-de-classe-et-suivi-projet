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

### Tester sur l'ordinateur

Servir le dossier avec n'importe quel serveur web local (par exemple `python -m http.server 8765`)
puis ouvrir http://localhost:8765. Sur `localhost`, le service worker charge toujours les fichiers frais.
Réglages → « Remplacer par les données de démonstration » donne des classes fictives pour essayer.

## Historique des versions

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
  l'icône livre d'un critère le remplace. Le repère devient l'intitulé du critère et la compétence de fin de cycle
  est recopiée dans « Compétence Pronote ». Données dans `js/programme.js`.

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
