# LogiTrak — Eurequat Algérie

Suivi des expéditions de l'usine de Tlemcen. Tout le monde peut consulter ; seuls les opérateurs autorisés peuvent modifier.

## Contenu du dossier
- `index.html` : la page (ouvrez ce fichier, ou publiez tout le dossier tel quel)
- `css/style.css` : styles et thème (noir, orange, bleu du logo ; clair par défaut)
- `js/app.js` : le fonctionnement de la page
- `js/config.js` : adresse et clé publique de votre projet Supabase
- `js/tailwind-config.js` : couleurs de la charte
- `assets/logo-eurequat.png` : le logo
- `sql/setup.sql` : règles de sécurité et liste des opérateurs

## Mise en route (une seule fois)
1. Dans Supabase, créez votre compte : **Authentication > Users > Add user** (e-mail + mot de passe, cochez *Auto Confirm User*).
2. Ouvrez `sql/setup.sql`, remplacez `VOTRE-EMAIL@exemple.com` par cet e-mail (en minuscules), copiez tout le contenu dans **SQL Editor** et cliquez sur **Run**.
3. Ouvrez `index.html`, cliquez sur **Espace opérateur** et connectez-vous. Vous êtes administrateur.

## Ajouter des opérateurs
Connecté en administrateur, cliquez sur **Opérateurs**, saisissez l'e-mail et le rôle, puis **Ajouter**.
La personne doit avoir un compte : soit elle clique sur **Créer un compte** dans la page, soit vous l'ajoutez dans Supabase (Authentication > Users). Tant qu'elle n'est pas dans la liste, elle ne peut que consulter.
Pour retirer un accès : **Opérateurs > Retirer**.

## Rôles
- Visiteur : consulte, filtre, imprime les bordereaux, exporte en CSV.
- Opérateur : ajoute, modifie, supprime des envois.
- Administrateur : comme un opérateur, plus la gestion des opérateurs et la configuration.

## Bon à savoir
- Les données sont dans Supabase ; la page garde une copie locale en lecture si la connexion tombe.
- La sécurité repose sur les règles de `sql/setup.sql`, pas sur l'affichage des boutons.
- Si les inscriptions libres vous gênent : Supabase > Authentication > Sign In / Providers > *Allow new users to sign up*. Désactivées, il faudra créer les comptes à la main.
