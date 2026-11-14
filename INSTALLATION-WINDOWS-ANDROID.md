# Installer LogiTrak v3.8.8 sur Windows et Android

## Publier la version installable

1. Décompresser l'archive.
2. Publier le contenu du dossier logitrak-eurequat-v3.6 à l'emplacement actuel du site.
3. Inclure tous les fichiers et sous-dossiers, notamment manifest.webmanifest, sw.js, offline.html et les icônes dans assets.
4. Ouvrir le site avec son adresse HTTPS. Une ouverture directe des fichiers sur le disque ne permet pas l'installation.
5. Conserver la même adresse et le même dossier de publication lors des prochaines versions.

Avant publication, exécuter sql/v38-flux-algerie-poste.sql dans Supabase après la migration v3.7.4 si ce script n’a pas déjà été appliqué. La connexion Supabase reste celle de l’application.

## Windows

1. Ouvrir l'adresse HTTPS de LogiTrak dans Microsoft Edge ou Google Chrome.
2. Cliquer sur Installer dans l'en-tête de LogiTrak et confirmer l'installation proposée par le navigateur.
3. Si ce bouton affiche une aide, utiliser l'icône d'installation dans la barre d'adresse ou l'option d'installation du menu du navigateur.
4. Lancer ensuite LogiTrak depuis le menu Démarrer. Le navigateur peut aussi proposer de l'épingler à la barre des tâches.

L'application s'ouvre dans sa propre fenêtre. La première installation et l'utilisation des données nécessitent Internet.

## Android

1. Ouvrir l'adresse HTTPS de LogiTrak dans Chrome.
2. Cliquer sur Installer dans LogiTrak, puis confirmer.
3. Si l'invitation n'est pas proposée, ouvrir le menu ⋮ de Chrome et choisir Installer l'application ou Ajouter à l'écran d'accueil.
4. Lancer LogiTrak depuis l'icône ajoutée sur le téléphone.

Le bouton Installer est masqué lorsque l'application fonctionne déjà dans sa fenêtre dédiée. Les icônes reprennent l'emblème du logo LogiTrak fourni.

## Mises à jour

Publier les nouveaux fichiers à la même adresse. Lorsqu'une nouvelle version du service worker est en attente, le bouton Mise à jour apparaît. Enregistrer la saisie en cours, puis cliquer dessus et confirmer le rechargement. Une mise à jour peut aussi prendre effet à la réouverture après fermeture de toutes les fenêtres de l'application.

Les versions de sw.js et de l'application doivent être actualisées ensemble lors d'une future livraison. Le navigateur contrôle le moment où il détecte une mise à jour.

## Connexion et données

Se connecter avec l'identifiant et le mot de passe habituels. Les règles opérateur et administrateur restent appliquées par Supabase.

L'accès aux données à jour et leur enregistrement nécessitent Internet. Si une page ne peut pas se charger, un écran hors connexion propose de réessayer. Le service worker met en cache uniquement cet écran et son icône. Il ne met pas en cache les réponses de Supabase et n'enregistre pas de saisies pour les envoyer plus tard.

## Vérification après publication

- Le fichier manifest.webmanifest répond avec son contenu JSON.
- Les icônes app-icon-192.png et app-icon-512.png sont accessibles dans assets.
- Le fichier sw.js est servi comme JavaScript, à la racine de l'application.
- Le site s'ouvre en HTTPS, avec une connexion Internet active.
- Effectuer l'installation sur un poste Windows et un téléphone Android avant de la diffuser à tous les utilisateurs.

Les tests locaux de cette livraison couvrent le manifeste, les dimensions des icônes, l'invitation d'installation, l'activation d'une mise à jour après confirmation et l'écran hors connexion. L'installation réelle sur les appareils reste à vérifier après publication HTTPS.

## Documentation officielle

- Installation dans Edge. https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/ux
- Installation des applications web. https://web.dev/learn/pwa/installation
- Manifeste d'application. https://web.dev/learn/pwa/web-app-manifest

## Envois partiels Algérie Poste

Appliquer sql/v383-envois-partiels-algerie-poste.sql dans Supabase après la migration v3.8. Ouvrir un envoi en préparation, choisir Ajouter Algérie Poste, sélectionner un tirage validé et saisir la quantité à expédier.

## Mise à jour v3.8.8 — Algérie Poste

1. Dans Supabase, ouvrir **SQL Editor**.
2. Exécuter intégralement `sql/v385-algerie-poste-commandes-impression.sql` après les migrations précédentes.
3. Remplacer les fichiers de l'ancienne installation par le contenu du ZIP v3.8.8 (ou déployer le nouveau ZIP sur l'hébergement).
4. Recharger l'application. Les commandes existantes reçoivent un numéro APN lors de la migration ; les nouvelles commandes sont numérotées automatiquement.

La migration conserve les commandes et les tirages déjà enregistrés. Ne réinitialisez pas les tables Supabase.


## Mise à jour v3.8.8 — Présentation compacte des impressions

Remplacer les fichiers de l’installation par le contenu du ZIP v3.8.8, puis actualiser l’application. Cette évolution concerne uniquement l’interface de saisie des impressions Algérie Poste : tableau compact, plages ID et numéros de séquence visibles, bouton + en fin de ligne et case de confirmation. Aucune nouvelle migration SQL n’est nécessaire.


## Mise à jour v3.8.8 — Colisage par commande

Les impressions validées sont découpées en paquets de 1 000 ID (dernier paquet éventuellement incomplet), puis regroupées dans les cartons au niveau de la commande. Pour les produits à 3 exemplaires, la capacité H1 appliquée est de 14 paquets. Les paquets d’un carton peuvent provenir de plusieurs opérateurs et imprimantes, mais jamais de commandes différentes. Aucune nouvelle migration SQL n’est nécessaire.

## Mise à jour 3.9.4

Exécuter sql/v394-machines-apn.sql dans Supabase après la migration v385, puis publier le ZIP. Les anciens numéros APN sont conservés. Pour une imprimante Algérie Poste déjà utilisée, reprendre son nom exact dans le registre Machines.
