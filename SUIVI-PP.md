# Suivi PP — Première version de travail

Cette copie contient de vrais écrans et enregistre les saisies sur l’appareil. Elle est distincte de votre application actuellement en ligne, qui n’a pas été modifiée.

## Parcours d’essai
1. Extraire l’archive puis double-cliquer **ESSAYER-SUIVI-PP.cmd** sous Windows. Le lanceur utilise Python fourni avec Codex s’il est disponible, sinon Python installé avec la commande « py ». Il ouvre Chrome sur cette copie locale. Garder la fenêtre du lanceur ouverte pendant l’essai. L’ouverture directe du fichier index.html ne suffit pas.
2. Utiliser les données de démonstration du Carnet pour les premiers essais, ou créer une classe avec des élèves fictifs.
3. Dans **Administration**, ouvrir la classe et cocher **Je suis professeur principal de cette classe**, puis **Enregistrer**.
4. Ouvrir **Suivi PP** depuis l’accueil ou depuis la barre de navigation de cette classe. Une classe ouvre toujours son **Récap classe**, placé en premier dans la liste, avant les élèves. Avec plusieurs classes PP, l’accueil commun permet d’abord de choisir la classe ; avec une seule, son récap s’ouvre directement. Sélectionner ensuite un élève pour sa fiche.
5. Ajouter une note, un progrès, une observation du carnet ou une action. Cliquer sur **Enregistrer** pour conserver la saisie. Une modification d’un texte crée une version et conserve son historique ; deux branches concurrentes restent visibles.
6. Dans **Documents**, choisir la catégorie puis joindre un fichier ou une photo. Plusieurs catégories et pièces peuvent coexister. L’aperçu ouvre le document dans un panneau, le téléchargement conserve son nom d’origine.
7. Dans la fiche d’un élève, **Conseils** concerne uniquement cet élève : sélectionner T1, T2 ou T3 pour ses avis et sa synthèse. Pour les avis collectifs et la conclusion de classe, revenir à **Récap classe** puis **Préparer le conseil de la classe**. Il n’y a plus de case « La classe ». Cette version fournit la saisie et la conservation des textes ; elle ne génère pas encore d’appréciation.
8. Depuis **+ Réunion liée**, remplir l’événement du Carnet et enregistrer. Le même événement apparaît dans l’agenda et le suivi individuel, sans copie indépendante. Dans son détail, **Ouvrir le suivi de l’élève** permet de revenir directement à la fiche. En cas de modifications non enregistrées de l’événement, rester pour les enregistrer ou choisir explicitement de les abandonner.
9. Dans **Administration → Mes outils**, masquer un outil non utilisé. Il disparaît des onglets et de l’accueil, avec conservation de ses données ; le réglage vaut pour toutes les classes.

## Sauvegarde et reprise
Les données enregistrées restent disponibles sur cet appareil hors connexion ; le service worker doit avoir terminé une première installation en ligne. Un fichier doit exister localement pour être consultable sans Internet.

Les notes, actions, avis et documents font partie de la sauvegarde JSON complète. La connexion Drive existante prend également en charge le nouveau suivi et ses pièces. Les essais ont vérifié le stockage et la restauration locaux et les règles de fusion ; ils n’ont pas utilisé votre compte Google réel.

Le format de sauvegarde est nouveau : les deux appareils doivent utiliser cette version avant toute synchronisation avec Drive. Ne pas faire synchroniser une ancienne version du Carnet avec les nouveaux dossiers PP. Prévoir une sauvegarde manuelle de l’ancien Carnet avant une future mise en service.

## Rappels des réunions
Le calcul des rappels tient compte du fuseau Europe/Paris : veille à 16 h, puis une heure avant. Si la liaison Google Agenda est activée, les événements liés aux élèves portent ces deux rappels. La réception sur les appareils dépend de la configuration et des permissions Google Agenda ; elle doit être essayée sur la tablette et le portable. Aucun système indépendant de notification n’est déployé dans cette copie.

## État de livraison
Le code est une branche locale de travail issue du dépôt GitHub. Aucune publication, aucun formulaire public et aucune synchronisation vers votre Drive n’ont été déclenchés. Les imports de vos vrais fichiers et les autres modules du cahier des charges seront intégrés aux étapes suivantes.
