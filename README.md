# LogiTrak — Eurequat Algérie (v3.5)

Suivi de la production, du colisage industriel et des expéditions de l'usine de Tlemcen.

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
