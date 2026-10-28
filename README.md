# LogiTrak — Eurequat Algérie (v2)

Suivi de la production, du colisage industriel et des expéditions de l'usine de Tlemcen.

## Nouveautés de cette version (v2)
1. **Production — Droits Opérateur (48h) & Administrateur (Illimité) :**
   - Tout comme pour les envois, un opérateur peut **ajouter, modifier ou supprimer** un lot de production dans un délai de **48 heures** suivant sa création. Au-delà de 48h, seul un administrateur peut le modifier ou le supprimer.
2. **Flux inversé : Production ➔ Colisage ➔ Nouvel Envoi :**
   - Le colisage est désormais saisi et validé **après chaque production** (par OF/Référence) et non plus uniquement en aval des envois.
   - **Unités de comptage normalisées par famille de produit :**
     - **Étiquettes :** comptage par **BOBINE** (`BOBINE`), avec saisie du nombre d'étiquettes par bobine, du mandrin, de la matière et du nombre de bobines par carton.
     - **Rubans TTR :** comptage par **UNITÉ / PIÈCE** (`UN`), avec mandrin, matière et nombre d'unités par carton.
     - **Cartes PVC :** comptage par **LOT / PAQUET** (`LOT`), avec choix de conditionnement en paquets de **100, 50 ou 20 cartes**, et nombre de paquets par carton.
3. **Calcul intelligent des cartons (Toujours entier sans virgule, bascule H2 / H1) :**
   - Lors de la production, du colisage ou d'un **Nouvel Envoi**, l'application rappelle automatiquement le colisage par défaut introduit par l'opérateur et calcule le nombre exact de cartons (toujours un entier, sans virgule).
   - **Gestion des cartons incomplets :** Si un produit utilise un carton **H2** pour **12 bobines** :
     - Pour **10 bobines**, l'application compte **1 carton H2** (car 10 > moitié de 12).
     - Pour **6 bobines** (ou moins, soit $\le 50\%$ de la capacité du H2), l'application bascule automatiquement le reliquat sur un carton **H1** (ex. pour 18 bobines : `1×H2 (12) + 1×H1 (6)`, soit **2 cartons** au total).
4. **Statistiques annuelles ciblées (du 1er janvier au 31 décembre) :**
   - **Top 5 Catégories — Algérie Poste** (classement entre les **Destinataires** des produits de la catégorie Algérie Poste, ex. UPW Tlemcen, UPW Alger, UPW Béni Abbès…).
   - **Top 5 Clients — Hors Algérie Poste** (et hors Stock).
   - **Top 5 Produits — Hors Algérie Poste** (tous produits confondus).

## Mise à jour de la base Supabase
Dans **Supabase > SQL Editor**, exécutez le contenu du fichier `sql/production.sql`. Ce script met à jour la table `production` et les règles de sécurité (RLS 48h) sans effacer aucune donnée existante.
