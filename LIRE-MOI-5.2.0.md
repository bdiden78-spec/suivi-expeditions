# LogiTrak 5.2.0 — installation et mise à jour

Cette archive contient l’application complète. Les polices d’origine et l’animation de l’accueil sont conservées. Les animations supplémentaires annulées ne sont pas incluses.

## Mise à jour depuis la 5.1.2

1. Conserver une sauvegarde des fichiers publiés et de la base avant la migration.
2. Si le regroupement de fractions AP n’est pas déjà installé, exécuter sql/logitrak-v5.1.2-regroupement-fractions-ap.sql dans Supabase SQL Editor.
3. Exécuter sql/v520-suivi-controles.sql dans Supabase SQL Editor avec le rôle postgres.
4. Publier tous les fichiers de cette archive en conservant les dossiers et remplacer les fichiers existants.
5. Recharger avec Ctrl + F5 et accepter la mise à jour dans l’application installée si elle est proposée.

Ne pas réexécuter les anciens scripts de renumérotation APN ou des envois. Les autres fichiers SQL du dossier sont les migrations historiques, pas une liste de scripts à rejouer.

## Nouveautés

Le bouton « Suivi & alertes » de l’en-tête ouvre :
- Alertes : impressions AP en cours, commandes AP incomplètes, envois à valider et reliquats de production.
- Mouvements de stock : entrées de production/réception, changements de quantité, réservations, libérations et validation des expéditions. La validation apparaît avec une variation zéro car la disponibilité a déjà été diminuée lors de la réservation.
- Journal des modifications : date, auteur, entité, action et valeurs avant/après. L’administrateur voit le journal global ; un opérateur voit ses propres opérations.

Les historiques commencent à l’installation de la migration. Ils ne reconstituent pas les événements antérieurs et ne constituent pas à eux seuls le solde actuel du stock. Les références de réception/production et les unités restent celles des enregistrements d’origine.
La recherche porte sur les lignes chargées ; « Charger la suite » permet de consulter les pages plus anciennes.

Avant validation d’un envoi : contrôle des quantités, transporteur, destinataires et disponibilités de production, réception et paquets AP. Les erreurs bloquent. Les avertissements (colisage à vérifier, cartons incomplets et produits restants) demandent confirmation lors d’une validation manuelle. La validation automatique est aussi protégée contre les erreurs bloquantes ; elle ne peut pas demander une confirmation interactive.

## Vérification après publication

- Se connecter en administrateur puis en opérateur et consulter Suivi & alertes.
- Créer puis modifier une production de test et vérifier les entrées du journal et des mouvements.
- Tester un envoi incomplet, un envoi avec reliquat et une quantité dépassant le stock.
- Vérifier les commandes AP, le regroupement des fractions et l’installation depuis HTTPS.

Les scripts JavaScript et les ressources locales ont été vérifiés, avec des simulations du précontrôle et du regroupement AP. La migration SQL n’a pas été exécutée sur votre base depuis cette session ; son application et les parcours réels restent à confirmer sur votre environnement.

## Complément : plusieurs numéros de lot par production

Exécuter également sql/v520-lots-tracabilite.sql avant de publier cette correction.
Chaque numéro de lot et sa quantité sont facultatifs. Une quantité renseignée nécessite un numéro ; les quantités affectées ne peuvent pas dépasser la quantité produite. Le solde peut rester sans lot renseigné.
Les lots sont conservés à la modification ; une reprise démarre avec de nouvelles lignes facultatives pour la quantité ajoutée. Les lots des productions précédentes restent inchangés.
L’affichage du stock présente les numéros et leurs quantités. Cette saisie ne réserve pas une quantité à expédier par numéro de lot : elle documente la fabrication.
La correction d’enregistrement « lotFromFiche is not defined » est également incluse.

Les numéros suivent désormais ELaa-xxxx (étiquettes), RLaa-xxxx (rubans), RFLaa-xxxx (étiquettes RFID), CLaa-xxxx (cartes PVC). L’année aa provient de la date de production. L’opérateur saisit exactement les quatre chiffres ; aucun compteur n’est généré. Si v520-lots-tracabilite.sql a déjà été appliqué avant cette modification, le réexécuter pour actualiser le contrôle de format (sans effacer les données).
