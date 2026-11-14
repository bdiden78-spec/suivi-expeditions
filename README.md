# LogiTrak — Eurequat Algérie (v3.8.8)

Suivi de la production, du colisage industriel et des expéditions de l'usine de Tlemcen.

## Version 3.8.8 — Saisie d’impression compacte Algérie Poste

La fenêtre « Démarrer l’impression » reprend une grille compacte à en-têtes groupés : plage ID (De / À), nombre d’ID (De / À), imprimante et confirmation. Le nom de l’opérateur est affiché au-dessus. Le bouton + en fin de ligne ajoute la plage suivante, calculée automatiquement. Aucun changement de schéma Supabase n’est requis pour cette présentation.

## Version 3.8.5 — Algérie Poste : commandes et impression multi-lignes

Exécuter `sql/v385-algerie-poste-commandes-impression.sql` dans Supabase après les migrations précédentes. Chaque commande reçoit désormais un numéro `APN° : 0001` généré par la base, unique et non modifiable. La commande conserve sa date, son agence/UPW, sa catégorie, son type de produit et sa quantité demandée. Le démarrage d’impression permet de préparer jusqu’à quatre lignes/imprimantes par opérateur ; le premier ID est saisi manuellement et les plages suivantes sont calculées automatiquement. Chaque ligne peut être confirmée comme imprimée dès sa déclaration ou laissée en cours pour validation ultérieure. La base empêche les plages numériques qui se chevauchent pour une même commande.

## Version 3.8.1

Depuis une commande Algérie Poste, Préparer un envoi ouvre directement Nouvel envoi avec les tirages validés disponibles. Retirer les lignes à garder pour un autre envoi, puis enregistrer depuis le formulaire habituel. La migration v3.8 suffit.

## Version 3.8

Exécuter sql/v38-flux-algerie-poste.sql après la migration v3.7.4. Pour chaque commande Algérie Poste, démarrer une plage numérique inclusive avec son imprimante. Un opérateur peut avoir quatre machines en cours, avec une seule plage active par machine. La validation libère l’imprimante et ajoute le tirage à Production. Préparer un envoi depuis la commande en sélectionnant les tirages validés à expédier. Les envois suivent la validation habituelle et les tirages validés alimentent la production mensuelle.

## Version 3.7.4

Exécuter sql/v374-declaration-algerie-poste.sql après la migration v3.7.2. Dans Production, saisir uniquement la commande en cours, la quantité en ID et la date. La déclaration réserve cette quantité. Dans Algérie Poste, ouvrir la commande puis choisir Compléter et valider dans son historique de fabrication. Renseigner l’imprimante et les numéros inclusifs pour valider le tirage. Le colisage des tirages validés est calculé avec les paramètres du produit.

## Version 3.7.3

Dans Production, choisir Algérie Poste, sélectionner une commande en cours et saisir la quantité produite en ID. Le colisage est calculé automatiquement. Les réglages restent accessibles dans Ajuster le colisage. Aucune migration supplémentaire après la v3.7.2.

## Version 3.7.2

Exécuter sql/v372-colisage-algerie-poste.sql après la migration v3.7.1, puis publier les fichiers.

Les tirages Algérie Poste sont saisis en paquets complets de 1 000 ID et en ID du dernier paquet incomplet. H1 est proposé par défaut. Le type de carton, les paquets par carton et le poids du paquet complet sont enregistrés par tirage et modifiables depuis Production ou Colisage selon les droits habituels. La quantité de la commande reste vérifiée en ID.

## Version 3.7.1

Exécuter sql/v371-commandes-algerie-poste.sql après la migration v3.7, puis publier le dossier sur le site HTTPS existant.

Algérie Poste sert à enregistrer et consulter les commandes. Chaque commande s’ouvre sur ses tirages, ses opérateurs, ses imprimantes et les événements historiques. Les cinq types de produit fixent le régime, les couleurs, la référence, le gabarit et le nombre d’exemplaires. Pour les commandes antérieures, un opérateur habilité ou un administrateur doit choisir le type exact avant de déclarer un nouveau tirage.

Dans Production, sélectionner Algérie Poste puis une commande existante. La quantité cumulée des tirages validés et des réservations en cours est limitée à la quantité commandée dans Supabase. Les anciens tirages en cours peuvent être terminés dans Production. Le délai de 48 h reste applicable aux opérateurs.

Dans Colisage, choisir la commande pour afficher ou imprimer la fiche. Les cartons H1 contiennent 20 000 ID en 2 exemplaires et 14 000 ID en 3 exemplaires. Les paquets complets contiennent 1 000 ID. Le dernier paquet incomplet est pesé par estimation proportionnelle. Le poids brut inclut la tare H1 existante de 0,420 kg. Les tirages sont conditionnés séparément pour conserver leur traçabilité.

## Version 3.7

Exécuter sql/v37-tracabilite-algerie-poste.sql dans Supabase après l’installation du module Algérie Poste, puis publier les fichiers. Le script peut être relancé.

Un tirage correspond à une imprimante. Saisir la commande, la machine, la quantité prévue et le premier numéro, puis démarrer l’impression. Le dernier numéro peut être complété à la fin. Les tirages en cours réservent leur quantité dans la commande. Seules les impressions terminées et validées alimentent le total imprimé et le colisage imprimable.

À la fin, cocher Terminé sur la ligne. Si le dernier numéro et la machine sont déjà renseignés et que la quantité prévue correspond à la production, la validation s’enregistre directement. Sinon, le formulaire s’ouvre pour confirmer la quantité réelle et la plage puis valider. La date/heure de validation et l’utilisateur sont enregistrés par la base, en conservant le début du tirage et l’opérateur initial.

La règle de modification et suppression reste de 48 h après la création du tirage. Au-delà, un administrateur intervient. Décocher Terminé remet le tirage en cours et conserve l’ancienne validation dans l’historique. Les administrateurs peuvent modifier à tout moment.

L’historique conserve les démarrages, validations, corrections, réouvertures et suppressions avec leurs états avant/après et la commande concernée. Cet historique reste consultable après suppression d’une impression ou d’une commande et n’est pas modifiable depuis l’application. Une recherche d’ID numérique retrouve les plages correspondantes, les machines et les opérateurs. Pour un ID alphanumérique, utiliser un numéro de début/fin ou les filtres de machine, agence et opérateur.

Les impressions antérieures sont reprises comme terminées. Une machine inconnue ou une validation non horodatée n’est pas inventée et reste signalée. Une ligne de reprise de l’historique indique la migration et ne constitue pas la date réelle de validation.

## Version 3.6

Application web installable sur Windows et Android avec manifeste, icônes du logo, bouton Installer, écran hors connexion et mise à jour avec confirmation. Publier tous les fichiers sur le site HTTPS actuel. Voir INSTALLATION-WINDOWS-ANDROID.md. Aucune nouvelle migration SQL depuis la v3.5.

## Version 3.5

La catégorie Algérie Poste dans Production propose les commandes UPW non entièrement imprimées. Le choix ouvre la saisie d’impression Algérie Poste avec la commande et sa quantité restante préremplies. Les nouveaux lots de cette catégorie passent par ce choix. Les anciens lots restent modifiables.

Le logo est chargé avant l’ouverture de l’impression et les styles demandent la conservation des couleurs. Sélectionner aussi Couleur dans les réglages du navigateur et de l’imprimante. La fiche Algérie Poste porte désormais le logo. Aucune nouvelle migration SQL depuis la v3.4.

## Version 3.4

Le logo LogiTrak fourni remplace les deux anciens logos sur les sept pages et sur les fiches imprimables. Son double-clic conserve l’accès caché à la configuration pour les administrateurs. Palette adaptée au bleu marine, turquoise et orange du logo. Le fichier JPG original est conservé, ses marges sont cadrées par CSS. Aucune nouvelle migration SQL depuis la v3.3.

## Version 3.3

Couleurs vives en thème sombre et foncées en thème clair. Les modules conservent les mêmes couleurs de repérage dans la navigation, les cartes et les titres. « Nouvel envoi » reprend le cyan des envois et son encadrement permanent est retiré. Les connexions réussies depuis Envois, Production, Colisage et Algérie Poste redirigent vers l’accueil. Aucune nouvelle migration SQL depuis la v3.2.2.

## Version 3.2.2

Correction des scripts SQL Algérie Poste. Si la version précédente a échoué à l’installation, exécuter sql/v32-algerie-poste.sql intégralement. Il peut être relancé sur une installation existante. Si le module est déjà installé, le script court sql/v321-plages-algerie-poste.sql corrige uniquement le contrôle des numéros.

## Version 3.2.1

La sous-catégorie « Régime intérieur RC Grand-comptes 2EX » est proposée dans National. Les plages numériques acceptent les espaces ordinaires ou insécables. Leur présentation et leurs zéros initiaux sont conservés. De 00 378 601 à 00 403 600 inclus, la quantité est de 25 000 ID, soit 25 paquets de 1 000 ID.

Si la migration v3.2 a déjà été appliquée, exécuter uniquement sql/v321-plages-algerie-poste.sql. Sinon, exécuter le script complet sql/v32-algerie-poste.sql inclus dans cette archive.

## Version 3.2

Sur une base déjà en v3.1, exécuter **sql/v32-algerie-poste.sql** dans Supabase, puis publier les nouveaux fichiers. Pour une nouvelle installation, appliquer aussi ce script après les migrations précédentes.

### Lots expédiés

Le compteur d'accueil dénombre les lots de production entièrement couverts par des envois validés jusqu'à la date du jour en Algérie. Un lot partiellement expédié ne compte pas comme entièrement expédié. Les expéditions futures et les envois à valider réservent leurs quantités mais ne complètent pas ce compteur. Les lots sans lien avec une ligne d'envoi ne peuvent pas être identifiés comme expédiés.

### Algérie Poste

1. Créer une commande avec l'agence UPW, National ou International, la sous-catégorie, la date et la quantité demandée en ID.
2. Enregistrer une ou plusieurs impressions sur cette commande. Pour chaque impression, saisir la date, la quantité réellement imprimée, le premier et le dernier identifiant inclus.
3. Le module calcule le cumul imprimé et le reste à imprimer. Une impression au-delà de la demande reste possible et est signalée comme surproduction.
4. Le colisage est calculé séparément pour chaque impression avec des paquets de 1 000 ID et, si nécessaire, un paquet incomplet. Par exemple, 2 350 ID donnent 2 paquets de 1 000 et 1 paquet de 350. Le nombre d'exemplaires indiqué dans la sous-catégorie ne multiplie pas la quantité d'ID.
5. Le bouton Colisage / Imprimer prépare une fiche de la commande avec toutes les impressions et leurs plages de numéros.

Les agences et sous-catégories déjà saisies sont proposées à nouveau. Les deux suggestions initiales National sont « Régime intérieur RR 2 exemplaires » et « Régime intérieur RR 3 exemplaires ». Les autres libellés sont saisis librement.

Les identifiants sont conservés comme texte, avec les lettres et zéros initiaux. Pour une plage uniquement numérique, premier et dernier inclus doivent correspondre exactement à la quantité imprimée. Pour une plage alphanumérique, la quantité saisie fait foi et la vérification des numéros reste manuelle.

Les opérateurs modifient ou suppriment les fiches accessibles pendant 48 h après création, et les administrateurs à tout moment. Les nouvelles impressions peuvent être ajoutées à une commande plus ancienne. Une modification concurrente est signalée et nécessite de recharger les données.

## Version 3.1

Accents colorés par module. Le compte connecté et les raccourcis Pointage, Gestion et Webmail sont dans l’en-tête, près du bouton de thème. Le graphique mensuel occupe trois colonnes sur grand écran. La carte annonçant de futurs modules est retirée de l’accueil. Aucune migration SQL depuis la v3.0.

## Version 3.0

Refonte visuelle des sept pages, avec un thème clair par défaut et un thème sombre conservé dans les préférences. La mise à jour depuis la v2.5 ne nécessite aucune migration SQL.

## Version 2.5

Les statistiques et compteurs d’expéditions sont arrêtés à la date civile du jour en Algérie. Les envois et lots datés dans le futur restent consultables dans leurs listes. La mise à jour depuis la v2.4 ne nécessite aucune migration SQL.

## Version 2.4

La mise à jour depuis la v2.3 concerne uniquement les fichiers du site. Les envois et les statistiques chargent l’historique par pages. Les classements affichent cinq destinataires par catégorie. Le favicon est défini sur toutes les pages.

## Mettre à jour Supabase

Sur une base déjà en **v2.2**, exécuter uniquement **sql/v23-clients-cartons-stock.sql** dans **Supabase → SQL Editor**, puis publier les fichiers du dossier. Le script ajoute le champ Client et les cartons en stock. Il met à jour la sauvegarde des envois et conserve leur état de validation.

Pour une nouvelle installation, exécuter dans l'ordre :

1. sql/setup.sql
2. sql/production.sql
3. sql/security-hardening.sql
4. sql/v18-listes-et-verrous.sql
5. sql/v21-colisage-reference.sql
6. sql/v22-validation-envois.sql
7. sql/v23-clients-cartons-stock.sql

La lecture des envois par les visiteurs reste facultative avec sql/optionnel-lecture-visiteurs.sql.

## Utiliser les nouveautés

- **Connexion**. Sur Envois, les droits et la liste sont chargés après identification. Les pages Production, Colisage et Algérie Poste utilisent directement la nouvelle session.
- **Envois validés**. L'administrateur peut ouvrir et enregistrer un envoi validé sans annuler sa validation. Les restrictions de validation et de délai continuent de s'appliquer aux opérateurs.
- **Client**. Un nouveau lot reprend le client du dernier lot connu pour la référence, sauf saisie manuelle. Le client du lot devient le destinataire par défaut à l'import dans un envoi. Les anciens lots restent sans client jusqu'à leur mise à jour. Saisir STOCK pour indiquer explicitement un lot destiné au stock.
- **Cartons en stock**. Dans Production et Conditionnement, cliquer sur Composer un carton, saisir les quantités de reliquat par lot et sélectionner H1 ou H2. Le choix automatique propose le type du carton partiel sélectionné, s'il en existe un. Chaque carton a son propre numéro. Tant qu'il est en stock, Modifier permet de changer le type ou les références et Défaire libère le contenu. Le poids affiché est une estimation selon les fiches des produits.
- **Expédier un carton**. Utiliser Expédier dans le stock ou cocher le carton dans Importer depuis la production. L'envoi réserve le carton entier dès l'enregistrement. Un carton a un seul destinataire. Si ses lots ont des clients différents, sélectionner le destinataire avant d'enregistrer l'envoi. Sur la fiche de colisage, les références d'un carton partagent le même numéro et la tare du type choisi est comptée une seule fois.
- **Statistiques et navigation**. Le graphique de production mensuelle occupe deux colonnes sur les grands écrans. Les onglets se répartissent sur plusieurs lignes selon la largeur. La version et la signature figurent dans le pied de page.

Les droits administrateur lèvent les restrictions de délai, de statut de validation et de format d'OF. La disponibilité des lots, la cohérence du carton et les champs nécessaires continuent d'être vérifiés pour préserver le stock et l'historique.

## Nouveautés de la v2.2
### Validation des envois par un administrateur
- Un envoi créé par un opérateur est **« À valider »** (badge orange). Il peut encore le modifier pendant 48 h.
- Un **administrateur** valide chaque envoi avec le bouton **Valider** (ou **Tout valider**) ; la validation indique qui l'a faite et quand. Il peut aussi annuler une validation.
- **Notification** : badge rouge (nombre d'envois à valider) sur l'onglet **Envois**, bandeau sur la page Envois et sur l'accueil, visibles par les inscrits.
- Un envoi **validé est verrouillé** pour les opérateurs ; seul un administrateur peut le modifier (contrôlé dans la page ET dans la base).
- **Seuls les envois validés sont comptabilisés** : compteurs de la page Envois et de l'accueil, statistiques, colonne « Expédié » de la production.
  Les envois à valider **réservent** déjà leurs quantités (colonne « Reste » et contrôle avant enregistrement), pour éviter d'expédier deux fois les mêmes bobines.
- Les envois déjà enregistrés avant la v2.2 sont considérés comme **validés** (historique).
- La règle de 08h30 de la v2.1 est **supprimée**.

### Page Algérie Poste (emplacement réservé)
- Nouvel onglet « Algérie Poste » et carte sur l'accueil : visibles **uniquement par les utilisateurs inscrits** ; la page demande la connexion.
- Le contenu (gestion de la fabrication des étiquettes Algérie Poste) sera défini dans une prochaine version.

## Rappel : nouveautés de la v2.1
Colisage par référence (fiches), reliquat décidé par l'opérateur (carton ou stock pour carton mixte), carton mixte,
case de sélection dans la production pour créer un envoi, copie figée du colisage dans chaque envoi,
Top 3 par catégorie (+ Algérie Poste reconnu sur le destinataire), poids des cartons (H1 = 0,420 kg, H2 = 0,465 kg, maximum 15 kg).

## Fichiers
`index.html` • `production.html` • `colisage.html` • `envois.html` • `statistiques.html` • `algerie-poste.html` • `pointage.html`
`js/` : `app.js` (envois), `colisage-calc.js`, `reliquat.js`, `listes.js`, `nav.js`, `scanner.js`, `embed.js`, `config.js`
`sql/` : voir l'ordre ci-dessus

## Envois partiels Algérie Poste

Appliquer sql/v383-envois-partiels-algerie-poste.sql dans Supabase après la migration v3.8. Ouvrir un envoi en préparation, choisir Ajouter Algérie Poste, sélectionner un tirage validé et saisir la quantité à expédier.

## Commandes et impressions Algérie Poste

Depuis les impressions en cours, choisir une commande puis saisir l’imprimante et le premier ID. La fin inclusive est calculée sur 1 000 ID ou sur le solde si celui-ci est inférieur. Les droits de modification et de suppression existants s’appliquent dès la création. Aucune migration supplémentaire après la v3.8.3.

## Mise à jour 3.9.4

Exécuter sql/v394-machines-apn.sql dans Supabase après la migration v385, puis publier le ZIP. Les anciens numéros APN sont conservés. Pour une imprimante Algérie Poste déjà utilisée, reprendre son nom exact dans le registre Machines.
