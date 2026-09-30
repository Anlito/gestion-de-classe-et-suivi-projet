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
| `js/stats.js` | statistiques de présence (élève, classe, projet ; retard = présent) |
| `js/sync.js` | fusion des données entre appareils (synchronisation Google Drive) |
| `js/drive.js` | connexion Google (identifiant client propre à chaque professeur) et échanges avec son Drive |
| `js/autosync.js` | synchronisation automatique et indicateur « Synchronisé à … » dans l'en-tête |
| `js/alertes.js` | alertes dans l'app (appel non fait, séances à remplir), coin de l'écran, tous les écrans |
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

## Installer l'application pour un autre professeur

L'application est autonome : il suffit de donner l'adresse. Chaque professeur garde ses données sur ses appareils,
et, s'il le souhaite, dans **son** Google Drive — personne d'autre n'y a accès.

1. Ouvrir https://anlito.github.io/gestion-de-classe-et-suivi-projet/ dans Chrome (tablette, téléphone ou ordinateur),
   puis menu ⋮ → « Installer l'application » (ou « Ajouter à l'écran d'accueil »).
2. Créer ses classes (Administration), éventuellement importer son emploi du temps Pronote (Administration → Emploi du temps).
3. Pour utiliser plusieurs appareils : Administration → Sauvegarde et exports → **Google Drive**, puis suivre le guide
   « Comment obtenir mon identifiant ? » (projet Google Cloud à son nom, API Google Drive, écran de consentement en mode
   Test avec sa propre adresse comme utilisateur test, portée ``drive.file``, client « Application Web » avec l'origine
   ``https://anlito.github.io``). Coller l'identifiant, « Se connecter à Google » : ensuite tout est automatique.
   Sur chaque autre appareil : même identifiant, même compte Google, « Se connecter à Google ».
4. Si un professeur héberge sa propre copie du projet (autre adresse), l'origine à autoriser est la sienne : le guide
   affiche automatiquement l'adresse exacte à copier.
## Chantier en cours : synchronisation Google Drive (décisions prises)

Même méthode que le chantier Planning : une étape = une version, tests sur la tablette, retour du professeur.
Étapes : **A** fondations de la fusion (1.12.0) · **B** connexion Google Drive et choix du mode (1.13.0) ·
**C** synchronisation automatique et indicateur « Synchronisé à … » (1.14.0).

- Dans Administration → Sauvegarde : choix du mode **« Sauvegarde manuelle »** (fichier, comme avant) ou
  **« Synchronisation Google Drive »**.
- **Plusieurs appareils en alternance** (tablette, téléphone, ordinateur) : fusion **enregistrement par
  enregistrement**, la version la plus récente (`updatedAt`) gagne ; les suppressions laissent une trace
  (table `effacements`) pour être répercutées ; traces oubliées après 180 jours.
- **Pas de chiffrement** (choix du professeur) : les données sont lisibles dans son Drive → ne jamais partager le
  dossier. Dossier **visible « Carnet de classe »** dans Drive, portée OAuth `drive.file` (l'app ne voit que les
  fichiers qu'elle a créés).
- Réglages propres à l'appareil, jamais synchronisés : `lastBackupAt`, `lastModified`, `sync` (`db.LOCAL_META`).
- Photos : envoyées à part (un fichier par photo, seulement quand elle change).
- **Application autonome** (décision du professeur) : aucun identifiant du développeur dans l'app. **Chaque professeur**
  crée son propre identifiant client OAuth « Application Web » (guide intégré dans Administration → Sauvegarde) et le
  saisit sur **chacun de ses appareils** (réglage local `meta.sync.clientId`). Ses données vont dans **son** Drive.
  Jeton d'accès valable 1 h (Google Identity Services) : reconnexion d'un toucher si besoin.
- Synchronisation **automatique** (1.14.0) : à l'ouverture, 5 s après des modifications, au retour dans l'app
  (après 1 min), toutes les 5 min ; indicateur dans l'en-tête (toucher = synchroniser / reconnecter / choisir).
  **Jamais de fusion automatique** pour la 1re synchronisation d'un appareil qui a des classes, ni après un
  remplacement complet des données (restauration, démonstration, tout effacer) : l'app demande quoi faire.
- Guide « Comment obtenir mon identifiant ? » réécrit en 5 parties (1.14.0), d'après les retours sur tablette.
- État des étapes : A, B et C faites. Reste à valider avec un vrai compte Google sur tablette et ordinateur.
## Chantier Planning (terminé en 1.11.0) : décisions prises

Méthode suivie : après chaque étape, nouvelle version, liste de tests à faire sur la tablette, attente du retour du professeur. Les 7 étapes sont faites (1.5.0 → 1.11.0).

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
- Durées de cours variables (1 h, 1 h 30…) : aucun calcul ne suppose une durée fixe ; **1 créneau (cours) = 1 appel + 1 séance de projet**, quelle que soit sa durée, même si deux créneaux de la même classe se suivent (décision du professeur, 30 sept.).

## Historique des versions

### 1.14.0 — 1er octobre 2026 · Synchronisation Drive, étape C : synchronisation automatique
- Nouveau `js/autosync.js` : synchronisation **automatique** en mode Drive — à l'ouverture, 5 s après la dernière
  modification, au retour dans l'app (après 1 min d'absence), toutes les 5 min, au retour du réseau. Jamais deux à la fois.
- **Indicateur dans l'en-tête** (à la place de « Sauvegardé le … ») : « Synchronisé 10:42 », « Synchronisation… »,
  « Reconnecter Google » (jeton expiré après 1 h : reconnexion discrète tentée, sinon un toucher), « Hors ligne »,
  « Erreur de synchro », « Synchro à vérifier », « Drive à configurer ». Un toucher = synchroniser maintenant.
- **Seulement les différences** : si ni cet appareil ni Drive n'ont changé → aucun échange (2 petites requêtes) ;
  si seul cet appareil a changé → Drive n'est pas retéléchargé. Photos envoyées seulement si elles changent.
- **Deux appareils en même temps** : avant d'envoyer, l'app vérifie que Drive n'a pas été modifié depuis sa lecture
  (version du fichier) ; sinon elle relit et refusionne (jusqu'à 3 fois) — rien n'est écrasé.
- **Après restauration d'une sauvegarde, données de démonstration ou « tout effacer »** : synchronisation automatique
  suspendue (« Synchro à vérifier ») ; au toucher : « Remplacer Drive par cet appareil » (ce qui n'existe plus ici est
  supprimé de Drive puis des autres appareils), « Recharger depuis Drive » ou « Fusionner les deux ». L'identifiant
  et le réglage Drive sont conservés. 1re synchronisation d'un appareil qui a déjà des classes : toujours demandée.
- L'écran se met à jour quand des données arrivent, sauf pendant une saisie ou avec une liste / un panneau ouvert.
- **Guide de l'identifiant réécrit** (retour du professeur : peu clair sur tablette) : 5 parties numérotées, noms
  exacts des menus Google, oubli fréquent (utilisateur test) mis en avant, bouton Copier l'adresse, ID client et non
  code secret GOCSPX, erreurs fréquentes (`origin_mismatch`, `access_denied`, fenêtre bloquée…).
- Vérifié avec un Google Drive simulé : 1re synchro demandée puis 3 281 envois + 283 photos ; 1 note → « 1 envoyé »,
  sans retéléchargement ; rien de neuf → aucun échange ; modification d'un autre appareil reçue ; envoi simultané
  d'un autre appareil → refusion, les deux notes gardées ; démonstration chargée → synchro suspendue, « Remplacer
  Drive » laisse une trace de suppression pour les anciens enregistrements. Tests : 51 / 51.

### 1.13.1 — 1er octobre 2026 · Correctif : identifiant client refusé

- Le collage de l'identifiant depuis la console Google était refusé (espace, caractère invisible, majuscule ou espace
  ajoutés par le clavier, texte autour). `drive.extractClientId` retrouve l'identifiant dans le texte collé (ignore
  espaces, caractères invisibles, majuscules, texte autour) ; en cas d'échec, le message montre ce qui a été reçu.
  Champ sans majuscule ni correction automatiques. 7 tests (51 au total).
### 1.13.0 — 1er octobre 2026 · Synchronisation Drive, étape B : connexion et synchronisation manuelle

- **Application autonome** : chaque professeur saisit son propre identifiant client Google (aucun accès du
  développeur). Guide pas à pas intégré, avec l'adresse exacte à autoriser (``location.origin``) et un bouton Copier.
- Administration → Sauvegarde : **Mode de sauvegarde** « Sauvegarde manuelle » / « Google Drive » (réglage de
  l'appareil). En mode Drive : avertissement « sans chiffrement, ne partagez jamais ce dossier », identifiant client,
  « Se connecter à Google », état (compte, dernière synchronisation et bilan), **« Synchroniser maintenant »**,
  « Ouvrir le dossier dans Google Drive », « Se déconnecter ». La sauvegarde par fichier reste disponible (« Copie de
  secours »).
- Nouveau ``js/drive.js`` : Google Identity Services (jeton 1 h), API Drive v3 par ``fetch`` ; dossier visible
  « Carnet de classe » ; ``carnet-donnees.json`` (données fusionnées + traces de suppression + index des photos) ;
  ``photo-<id>.jpg`` (une image par photo, envoyée ou reçue seulement si elle a changé ; photos supprimées mises à la
  corbeille de Drive). Synchronisation = lire Drive → fusionner (``sync.mergeData``) → appliquer ici → envoyer.
- 1re synchronisation d'un appareil qui a déjà des classes : « Fusionner les deux » ou « Remplacer cet appareil par
  Drive » (refusé si Drive ne contient encore aucune classe, pour ne rien perdre).
- Sûreté : une modification faite pendant la synchronisation n'est pas écrasée (``applyRemote`` garde la version locale
  plus récente) ; valeurs par défaut créées au démarrage datées « 0 » (``commit({ oldest: true })``) pour que les vrais
  réglages d'un autre appareil (ex. trimestre en cours) l'emportent.
- Vérifié avec un Google Drive simulé : envoi complet (3 285 enregistrements + 283 photos), 2e synchronisation sans
  échange, modifications et suppression venues d'un autre appareil reçues, suppression envoyée, appareil neuf
  entièrement reconstitué (photos comprises). Reste à essayer avec un vrai compte Google.
### 1.12.0 — 1er octobre 2026 · Synchronisation Drive, étape A : fondations de la fusion

- Nouvelle table `effacements` (`DB_VERSION` 6) : chaque suppression (`commit` → `w.del`) laisse une trace
  `{ id: 'store:recId', store, recId, at }` (sauf réglages propres à l'appareil). « Annuler » remet l'enregistrement
  avec une date plus récente que la trace : il l'emporte.
- `db.exportForSync()` : données à synchroniser (photos sans image) ; `db.applyRemote(changes)` : applique des
  changements venus d'un autre appareil tels quels (dates conservées, sans nouvelle trace ni annulation).
- Nouveau `js/sync.js` : `mergeData(local, drive)` — fusion enregistrement par enregistrement (le plus récent gagne,
  égalité = version locale), traces de suppression, photos à télécharger, statistiques ; résultat stable (une
  2e fusion ne change plus rien).
- Tests : 44 (12 nouveaux sur la fusion). Aucun changement visible dans l'app.
### 1.11.0 — 1er octobre 2026 · Planning, étape 7/7 : statistiques de présence

- Nouveau `js/stats.js` : **taux de présence = appels où l'élève n'était pas absent / appels de sa classe**, un
  retard compte comme présent. Trimestre d'un appel déduit de sa date et de `meta.trimesterStarts`
  (`stats.trimesterOf`). `presenceEleve`, `presenceClasse` (moyenne des taux des élèves, plus absents, plus en
  retard), `presenceProjet` (appels rattachés à une séance du projet).
- **Fiche élève** : bloc « x % de présence ce trimestre · y % sur l'année (n appels) ». **Fiche PDF** : ligne
  « Présence » par trimestre et colonne « Année » (comportement, aide, absences, retards aussi en total annuel).
- **Classe** : bouton « Présence » dans le trombinoscope → panneau T1 / T2 / T3 / Année : présence moyenne, appels,
  absences, retards, les plus absents, toute la classe triée (barre et %), toucher un élève ouvre sa fiche.
- **Projet** : « Présence sur les séances du projet : x % · n appels · absences · retards · plus absents ».
- **Récapitulatif CSV** : colonnes « Tn Présence », « Année Présence », « <projet> présence », dernière ligne
  « MOYENNE DE LA CLASSE ». **Récapitulatif PDF** : mêmes colonnes + ligne « Présence moyenne … · Plus absents ».
- Démonstration : appels fictifs sur les cours passés (quelques absences et retards) pour essayer les statistiques.
### 1.10.0 — 1er octobre 2026 · Planning, étape 6/7 : réimportation et conflits

- `planning.previewOf` renvoie désormais `conflits` (les autres changements s'appliquent directement) :
  - **modif** : Pronote a changé un cours que le professeur avait modifié (`cours.perso` : déplacé, salle, statut).
    Choix « **Ma version** » (par défaut : ses modifications restent prioritaires sur les points qu'il avait changés ;
    les autres changements Pronote s'appliquent) ou « **Version Pronote** » (modifications effacées).
  - **suppr** : Pronote a retiré un cours portant des données du professeur (modification, note,
    « pas une séance projet », appel ou séance reliés). Choix « **Garder le cours** » (par défaut : devient un cours
    ajouté à la main, `source: 'manuel'`, `retirePronote: true`, même identifiant, hors de la comparaison avec
    Pronote : plus de conflit aux imports suivants) ou « **Le supprimer** » (appels et séances gardés, détachés).
  - Notes, appels et séances restent attachés au cours dans tous les cas.
- Aperçu de l'import : pastille « n conflits » et bloc « n conflits à régler », chaque conflit avec le résultat de
  chaque choix (date, horaire, salle, statut), boutons « Tout : mes versions » / « Tout : Pronote ».
  Choix mémorisés dans `plan.choix` et appliqués par `planning.applyImport`.
- Alertes masquées dans l'administration (elles recouvraient les boutons de l'import).
- Vérifié avec des exports fictifs générés depuis la démonstration : conflit de salle sur un cours déplacé,
  cours retirés avec note / avec appel, choix appliqués, réimport du même fichier sans nouveau conflit.
### 1.9.5 — 30 septembre 2026 · 1 créneau = 1 appel + 1 séance

- Décision du professeur : chaque créneau (1 h, 1 h 30…) a **son appel et sa séance de projet**, même quand deux
  créneaux de la même classe se suivent. Les règles « une séance par jour » (1.9.2) et « cours enchaînés » (1.9.4)
  sont retirées (`coursEnchaines` supprimé).
- Appel d'un créneau : sa séance reliée, sinon une séance du jour encore sans cours (onglet Projet), sinon
  « Commencer la séance n » — aussi pour le 2e créneau d'une suite.
- Migration étendue (`planning.lierAppels`, au démarrage, après import et à chaque rafraîchissement des alertes) :
  après les appels, les **séances sans cours** sont reliées, dans l'ordre de leur numéro, aux créneaux suivis du même
  jour et de la même classe qui n'ont pas encore de séance (ex. séances créées dans l'onglet Projet le matin).
- Alerte « séance à remplir » : une par créneau sans séance reliée.
### 1.9.4 — 30 septembre 2026 · Deux cours de la même classe dans la journée

- Nouvelle règle (`planning.coursEnchaines`, `ENCHAINEMENT` = 20 min) : les cours de la même classe le même jour
  séparés de moins de 20 min (09:10 → 09:11, 10:06 → 10:22 après la récréation) forment **un bloc** = un cours de
  2 h = **une seule séance**. Des cours **séparés** dans la journée (matin et après-midi) ont **chacun leur séance**.
  (Remplace la règle de 1.9.2 « une séance par jour », qui faisait reprendre la séance du matin l'après-midi.)
- Appel : un par cours (inchangé). À l'appel, la séance reprise est celle du cours, sinon d'un cours du même bloc,
  sinon une séance du jour créée sans cours (onglet Projet) ; sinon « Commencer la séance n ».
- Alerte « séance à remplir » : une par bloc (horaire du bloc entier), écartée si le bloc a une séance, si une
  séance du jour a été créée sans cours, ou si « Pas une séance projet » est choisi pour un cours du bloc.
### 1.9.3 — 30 septembre 2026 · Durées de cours variables (1 h, 1 h 30…)

- Règle : **chaque cours garde sa propre durée** ; rien ne suppose des créneaux d'une heure. Appel (un par cours),
  alertes (15 min après le début), séance du jour, chevauchements, cours « en cours », rattachement des anciens
  appels : tous calculés sur les vraies heures de début et de fin de chaque cours.
- Correctif « Déplacer le cours » : les créneaux proposés sont les **heures de début** habituelles de
  l'établissement, et le cours y garde **sa durée** (un cours d'1 h 30 reste d'1 h 30) ; un créneau n'est proposé
  que si toute cette durée est libre. Des créneaux qui se chevauchent entre eux s'affichent côte à côte.
### 1.9.2 — 30 septembre 2026 · Correctif : cours de 2 heures (séance en double, alerte à tort)

- Pronote découpe un cours de 2 h en deux cours d'1 h. À l'appel de la 2e heure, l'app ne retrouvait pas la séance
  du jour (déjà reliée à la 1re heure) et proposait « Commencer la séance suivante » → séance en trop ; et après sa
  suppression, l'alerte « séance à remplir » apparaissait pour la 2e heure.
- Appel : la séance reliée au cours, sinon **la séance du même jour** du projet (reliée ou non) est reprise — une
  seule séance par jour, jamais une nouvelle à chaque heure.
- Alerte « séance à remplir » : pas d'alerte si une séance de projet existe déjà ce jour-là pour la classe (reliée
  ou non à un cours). Libellé : « Cours du jour sans séance de projet ».
- Rappel des décisions : un appel par cours (donc un par heure) ; une séance de projet par jour et par classe.
### 1.9.1 — 30 septembre 2026 · Supprimer une séance

- Onglet **Projet** : icône corbeille à côté de la date de la séance affichée → « Supprimer la séance n du … ? »
  (confirmation détaillée, puis Annuler possible). `model.deleteSeance` : le journal de la séance est effacé ;
  observations, appels, absences et retards de cette séance sont **gardés**, détachés (plus de numéro) ; les séances
  suivantes sont **renumérotées** (n − 1) avec les numéros et libellés « Séance n · … » qui les citent (observations,
  absences, retards, appels, changements de groupe). Si la séance était reliée à un cours, l'alerte « séance à
  remplir » peut revenir pour ce cours (« Pas une séance projet » pour l'écarter).
- Alertes : la boîte repliée reste repliée (choix mémorisé sur l'appareil, clé `carnet-alertes`).

### 1.9.0 — 30 septembre 2026 · Planning, étape 5/7 : appel rattaché au cours, alertes

- **Appel rattaché à un cours** : `appels.coursId` (et `seances.coursId`). Dans le trombinoscope, « Appel » utilise
  le cours en contexte (`planning.coursContexte` : cours touché dans le planning, sinon en cours, sinon prochain
  ou dernier de la journée) ; un cours n'a qu'un appel : s'il existe il est rouvert pour correction
  (`model.appelOfCours`). La date de l'appel est celle du cours. Cours suivi avec projet en cours : « Commencer la
  séance n et faire l'appel » (séance reliée au cours) ou « Faire l'appel sans séance de projet » ; une séance du
  même jour créée dans l'onglet Projet est reprise et reliée. Cours « appel seulement » : pas de séance.
  Cours annulé / classe absente : confirmation. Classe sans cours ce jour-là : appel hors planning (comme avant).
- `model.currentAppel(classId)` : l'appel du cours en contexte, sinon le dernier appel du jour sans cours.
- **Migration** (`planning.lierAppels`, au démarrage et après chaque import) : un appel sans cours (ou dont le cours
  a disparu) est relié au cours de même classe et même date dont l'horaire encadre l'heure de l'appel
  (30 min avant le début → 15 min après la fin) ; sa séance est reliée au même cours. Sinon il reste tel quel.
- Séance créée dans l'onglet Projet pendant un cours suivi du jour : reliée à ce cours.
- **Alertes** (`js/alertes.js`, boîte repliable en bas à gauche, sur tous les écrans, sauf impression) :
  « Appel non fait – 4 G » 15 min après le début d'un cours suivi ou « appel seulement » sans appel (bouton
  « Faire l'appel » : ouvre la classe en mode appel, rattaché au cours) ; à partir de 18 h, « Séances à remplir » pour
  les cours suivis du jour avec projet en cours sans séance reliée : « Remplir la séance » (crée la séance reliée et
  ouvre le journal) ou « Pas une séance projet » (`cours.pasSeance`, mémorisé). Jamais pour annulé, classe absente,
  sortie, absence personnelle, vacances, fériés. Recalculées à chaque modification et toutes les 30 s.
- Planning : « appel ✓ » sur les cours dont l'appel est fait ; panneau du cours : bouton « Faire l'appel » ou
  « Appel fait · n absents · corriger ».
- Réimport : un cours relié à un appel ou une séance n'est jamais supprimé (compté « gardé »). Supprimer un
  cours ajouté ou un établissement détache ses appels et séances sans les effacer.

### 1.8.2 — 30 septembre 2026 · Planning au design de la maquette + alerte de chevauchement

Référence graphique : maquette `Planning.dc.html` et « Cahier des charges v2 » §7.0, fournis par le professeur
(projet de maquettes hors dépôt).
- Blocs de cours en aplat à la **teinte du niveau** (mêmes teintes que les tuiles des classes), fin liseré à la couleur
  du collège (demande initiale), ligne « Projet · séance x/n » (projet en cours de la classe) ou « Déplacé depuis … ».
  Pastille à droite : statut (jaune si annulé / classe absente), « Déplacé », « En cours » (foncée). Cours passés
  atténués (55 %), cours en cours contouré avec barre de progression, trait « maintenant » foncé, bande
  « Pause méridienne » (calculée entre les cours du matin et de l'après-midi de la semaine). Grille 8 h – 17 h 30 minimum.
- En-tête : « Cette semaine », bouton accent **En cours · 3e E →** (ouvre la classe du cours en cours), + Cours,
  Classes, Administration.
- **Toucher un cours ouvre son panneau** (plus de bouton ⋯) : en-tête à la teinte du niveau, **Ouvrir la classe**,
  lien vers le projet, **Statut du cours** (Cours normal / Annulé / Classe absente / Sortie pédagogique, stocké dans
  `cours.perso.statut`), **Créneau** : « Déplacer le cours » (les créneaux libres — horaires habituels de
  l'établissement, à venir, hors vacances — s'affichent en pointillés, on touche la cible ; barre « Déplacer … ·
  touchez un créneau libre » avec Annuler), « Remettre à sa place » (annule seulement le déplacement),
  « Autre horaire ou salle… » (formulaire), note, « Revenir entièrement à la version Pronote ».
- **Alerte de chevauchement** : ajouter, déplacer ou changer l'horaire d'un cours qui chevauche un autre cours affiché
  (annulés, classe absente et masqués exclus) → « Ce cours en chevauche N autres » avec la liste, « Enregistrer quand
  même » ou « Revenir en arrière ». Pour un cours répété chaque semaine, toute l'année est vérifiée.
- Téléphone : titre raccourci (le jour est dans les onglets), boutons compacts.

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
