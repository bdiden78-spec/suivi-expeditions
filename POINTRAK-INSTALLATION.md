# PoinTrak 1.4.0 — intégration LogiTrak

L’APK et la fiche JSON sont ceux du paquet PoinTrak-1.4.0-LogiTrak.zip fourni. L’APK n’a pas été modifié ni resigné.

Publier le contenu de downloads sans connexion requise :
- https://logitrak.eureuquattlm.workers.dev/downloads/pointrak.apk
- https://logitrak.eureuquattlm.workers.dev/downloads/pointrak-version.json

Version déclarée : 1.4.0 ; versionCode : 11 ; packageName : com.eurequat.espace.
La présence de l’adresse de vérification du JSON a été confirmée dans l’APK ; le parcours de mise à jour Android n’a pas été testé sur téléphone.

Les utilisateurs doivent installer manuellement la 1.4.0 une première fois. La fiche JSON seule ne rajoute pas un mécanisme de vérification aux anciennes versions.

Pour les futures mises à jour, conserver le format de fiche fourni par PoinTrak : packageName, versionCode, versionName, apk, notes. Ne pas remplacer apk par apkPath ni notes par releaseNotes.
Publier d’abord le nouvel APK signé avec la même clé et le même package, puis publier le JSON avec un versionCode supérieur (le prochain devra dépasser 11). Servir le JSON sans cache ou purger le cache à chaque mise à jour.

Le QR code existant pointe vers downloads/pointrak.apk : garder ce chemin à jour, même si le champ apk d’une version future pointe vers un fichier versionné pour éviter le cache.

Types conseillés : application/json pour le JSON et application/vnd.android.package-archive pour l’APK. Vérifier une réponse HTTPS 200 sans authentification, ni redirection vers la page de connexion.
Aucun nouveau SQL nécessaire pour cette mise à jour de PoinTrak.
