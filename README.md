# LogiTrak 5.2.1 — envois Algérie Poste fractionnés

## Mise à jour depuis 5.2.0

1. Exécuter sql/v521-envoi-fractions-ap.sql dans Supabase SQL Editor. Si le regroupement de fractions n’a jamais été installé, exécuter d’abord sql/logitrak-v5.1.2-regroupement-fractions-ap.sql.
2. Publier les fichiers du ZIP en conservant leurs dossiers.
3. Actualiser avec Ctrl + F5 ; accepter la mise à jour de l’application installée si proposée.

Ne pas réexécuter les anciens scripts de renumérotation. Les instructions et SQL de la 5.2.0 restent applicables uniquement si cette version n’a pas déjà été installée.

## Utilisation

Dans Nouvel envoi > Importer Algérie Poste, choisir une fraction. LogiTrak recherche les fractions adjacentes compatibles et affiche leurs APN°, le total d’ID et le nombre de cartons recalculé. Confirmer pour importer le colisage commun, ou décocher le regroupement pour importer la fraction sélectionnée seulement.
Le bouton Envoyer depuis Algérie Poste ouvre désormais le même choix avec la commande présélectionnée.

Les conditions restent : même UPW, même catégorie, même type d’identifiant et même poids par paquet ; dates espacées de 7 jours maximum ; plages réellement imprimées disponibles continues, sans trou ni chevauchement ; colisage H1 pour le regroupement. Les tirages totalement affectés sont exclus et les tirages partiellement affectés empêchent ce regroupement.
Les commandes et leurs APN° restent distincts. Le regroupement est conservé, comme celui réalisé dans Détail colisage. Aucun envoi existant n’est recalculé automatiquement.

Le nombre n’est pas fixé à 15 : en 3 exemplaires, H1 contient 14 paquets ; en 2 exemplaires, 20 paquets. Exemple testé : 3 fractions de 100000 ID en 3 exemplaires = 22 H1 au total, au lieu de 24 si les fractions sont conditionnées séparément.
Les fractions International et Intérieur et les plages éloignées visibles sur une même UPW ne sont pas réunies.

## Vérifications

Syntaxe de 52 scripts et ressources locales contrôlées. Simulations : import depuis la première ou dernière fraction, colisage commun de 300 paquets, maintien des plages et identifiants des tirages, exclusion d’un type différent et d’une rupture de plage.
La nouvelle migration SQL n’a pas été exécutée sur votre base depuis cette session ; vérifier l’import et l’enregistrement réels après son installation.

Pour une installation complète venant d’une version antérieure à 5.2.0, suivre aussi LIRE-MOI-5.2.0.md. Les correctifs de production, lots et PoinTrak 1.4.0 sont conservés. La messagerie annulée n’est pas incluse.
