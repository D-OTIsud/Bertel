# Livraison galerie du 5 novembre 2026

Autorisation du responsable du projet reçue le 5 novembre. Choix d'une fiche existante, recette avec Claude, puis mise en production de la galerie et contrôle du contrat API inchangé.

## Cible et méthode
- Production relevée dans Coolify à 06 h 29, heure de La Réunion, sur `35564dc3c69afd33bbffd5f879e663cc87f9249f`.
- Paquet isolé préparé depuis ce SHA dans `codex/album-production-20261105`.
- Base Supabase Bertel existante uniquement. Aucun Docker local ni base neuve.
- Fiche de recette existante avec quatre photos et un acteur test lié. Identifiants conservés dans les preuves opérateur.
- Aucun profil de connexion acteur existant. Les scénarios SQL utilisent une liaison transitoire dans une transaction annulée. Cette vérification ne constitue pas une session HTTP acteur.
- Analyse payante et relances désactivées. Aucun envoi de courriel prévu.

## Séquence
1. Capturer santé, trafic API, empreintes des lecteurs et JSON de fiches publiques inchangées.
2. Composer les prérequis Photos fermés et le client office avec contrôle de version. Corriger le retour de sauvegarde canonique pour deux sauvegardes successives.
3. Faire relire le paquet exact par Claude Opus 5.5 Max. Répéter le SQL dans la base existante avec annulation intégrale.
4. Installer le socle fermé. Déployer le client compatible et vérifier son SHA, ses sondes et la lecture office.
5. Appliquer le cutover des anciens writers et exécuter la recette sur la fiche sélectionnée. Conserver une image de secours compatible avec ces droits.
6. Ouvrir l'album, contrôler la fiche et comparer à nouveau le contrat API, les lecteurs, les références JSON et les appels journalisés.

## Preuves en cours
- HTTP avant à 06 h 33. Santé et disponibilité 200, mode live, contrat client interne 1/1. Les deux routes publiques sondées sans clé conservent 401 et l'enveloppe `{"error":"unauthorized"}`, version API 1.0.0.
- Trafic 24 h relevé à 06 h 31. 42 appels journalisés réussis, aucune erreur serveur dans ce journal incomplet. Dernier succès journalisé le 4 novembre à 08 h 00.
- API HTTP de la branche d'intégration et de la production identique sur onze fichiers et quatre opérations OpenAPI. Le paquet de production sera comparé à nouveau après son commit.
- Revue Claude de la bascule en cours.

## Retour arrière
Avant ouverture, garder les écritures acteur fermées. Après fermeture des anciens writers R5, conserver l'image office compatible CAS. Ne pas revenir à l'image 1/1 avec les policies restrictives en place. Ne supprimer aucune donnée saisie par les utilisateurs.

