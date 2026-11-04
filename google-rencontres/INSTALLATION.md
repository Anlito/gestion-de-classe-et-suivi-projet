# Activer le formulaire des familles

Cette installation se fait une seule fois, dans votre compte Google. Elle crée un nouveau tableau privé ; l’ancien outil de rendez-vous reste intact. Vous pourrez ensuite publier plusieurs campagnes pendant l’année depuis le Carnet.

## 1. Installer le service dans Google

1. Ouvrir [Google Apps Script](https://script.google.com/home), puis **Nouveau projet**. Nom suggéré : « Carnet · Rencontres PP ».
2. Dans le dossier `google-rencontres` de cette version du Carnet, ouvrir `Code.gs` et copier son contenu dans le fichier Code.gs du projet Google.
3. Ajouter deux fichiers **HTML**, nommés exactement **Formulaire** et **Professeur**, puis y copier le contenu des fichiers `Formulaire.html` et `Professeur.html` fournis. Enregistrer le projet.
4. Sélectionner la fonction **installer_**, puis cliquer sur **Exécuter**. Autoriser le script à créer et lire son tableau de réponses. Dans le journal d’exécution, conserver le lien du tableau privé et la **clé professeur**. Relancer cette fonction ne vide pas les réponses et conserve la même clé.
5. Cliquer sur **Déployer → Nouveau déploiement → Application Web**. Choisir **Exécuter en tant que : Moi** et **Qui a accès : Tout le monde**, pour que les parents n’aient pas à se connecter. Le tableau de réponses, lui, reste privé. Si ce choix est absent sur un compte d’établissement, son administrateur doit autoriser ce type de publication.
6. Copier l’adresse du déploiement qui se termine par **/exec**. Ne pas utiliser l’adresse de test /dev.

La clé professeur donne accès aux réponses : la garder dans le Carnet et dans votre sauvegarde privée, jamais dans un message aux familles. Le formulaire public n’affiche ni liste d’élèves, ni réponses d’autres familles. Le tableau privé contient des textes encodés en JSON pour conserver les caractères et empêcher leur interprétation comme formules ; ne pas modifier ces cellules.

## 2. Raccorder une campagne au Carnet

1. Ouvrir **Récap classe → Rencontres parents–PP**, puis choisir une campagne.
2. Ouvrir **Formulaire familles · demandes**. Dans **Configurer le service Google**, coller l’adresse /exec et la clé professeur, puis enregistrer.
3. Cliquer sur **Publier / mettre à jour**. Après confirmation, ouvrir le formulaire et faire un essai avec une identité fictive. Copier ensuite le **lien familles**, qui contient un jeton de campagne, pour le diffuser aux parents.
4. Les parents indiquent l’élève, une ou plusieurs disponibilités et leurs précisions. Ce sont des demandes : aucun rendez-vous n’est réservé automatiquement, et aucune modification ou annulation n’est proposée aux familles.
5. Dans le Carnet, cliquer sur **Récupérer les demandes**, choisir une réponse, **confirmer l’élève** puis attribuer un créneau libre. Les homonymes ne sont pas rapprochés automatiquement. Le rendez-vous rejoint l’agenda et la fiche élève.
6. Communiquer l’horaire à la famille par votre canal habituel. L’outil n’envoie pas de message à votre place.

Fermer une campagne déjà publiée depuis le Carnet tente aussi de fermer son formulaire Google. Vérifier la confirmation ; en cas d’échec, utiliser **Publier / mettre à jour** une fois la connexion revenue. L’écran indique si l’état local diffère de la dernière publication confirmée. Une fermeture locale hors connexion ne ferme pas à elle seule le formulaire distant. Le formulaire refuse aussi les nouvelles réponses après le jour de rencontre (heure de Paris). Masquer le module ou changer l’adresse du service ne ferme pas les anciens formulaires : les fermer avant ce changement.

## 3. Si la liaison directe n’aboutit pas

Le circuit par fichier reste disponible, sans changer les réponses :

1. Depuis le Carnet, dans **Échanger par fichier avec Google**, exporter la campagne.
2. Ouvrir **Espace professeur Google** (adresse /exec suivie de `?admin=1`), saisir la clé privée, choisir le fichier de campagne et cliquer sur **Publier / mettre à jour**. Le lien familles apparaît après confirmation.
3. Dans cet espace Google, cliquer sur **Télécharger les demandes pour le Carnet**, puis importer ce fichier dans la même campagne du Carnet. Confirmer l’import ; les réponses déjà connues sont ignorées et leur traitement est conservé.
4. Pour fermer le formulaire par ce circuit, fermer la campagne dans le Carnet, exporter son nouveau fichier puis le republier dans l’espace Google.

Les demandes écartées restent conservées et peuvent être remises à traiter. Pour réattribuer une demande déjà acceptée, annuler d’abord son rendez-vous dans la campagne, puis la remettre à traiter. Réimporter les réponses ne crée pas de nouvelles demandes pour les réponses déjà reçues.

## Vérification avant diffusion

Le code et les échanges ont été testés localement avec des données fictives et un service simulé. Aucun déploiement réel ni lien familles n’a été créé par Codex. Après votre installation, vérifier dans un onglet privé : ouverture sans compte, envoi d’une réponse fictive, récupération dans le Carnet, puis fermeture du formulaire. Les quotas et permissions Google restent ceux du compte utilisé. Ne pas partager le tableau privé ni la clé professeur.

Références Google : [déployer une application Web](https://developers.google.com/apps-script/guides/web), [communications du formulaire avec le service](https://developers.google.com/apps-script/guides/html/communication), [réponses JSON et redirections](https://developers.google.com/apps-script/guides/content).
