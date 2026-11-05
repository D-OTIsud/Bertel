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
4. Installer le socle fermé avec la recette SQL dans une sous-transaction intégralement annulée. Déployer le client office compatible `75568b8` et vérifier son SHA et ses sondes.
5. Déployer l'album encore fermé. Conserver l'image office compatible comme secours, puis appliquer les restrictions des anciens writers et ouvrir les écritures de l'album.
6. Contrôler la fiche et comparer à nouveau le contrat API, les lecteurs, les références JSON et les appels journalisés.

## Preuves en cours
- HTTP avant à 06 h 33. Santé et disponibilité 200, mode live, contrat client interne 1/1. Les deux routes publiques sondées sans clé conservent 401 et l'enveloppe `{"error":"unauthorized"}`, version API 1.0.0.
- Trafic 24 h relevé à 06 h 31. 42 appels journalisés réussis, aucune erreur serveur dans ce journal incomplet. Dernier succès journalisé le 4 novembre à 08 h 00.
- API HTTP de la branche d'intégration et de la production identique sur onze fichiers et quatre opérations OpenAPI. Le paquet de production sera comparé à nouveau après son commit.
- Revue Claude Opus 5.5 Max du paquet SQL terminée : absence de remplacement des lecteurs publics et d'expédition de courriels confirmée. Corrections demandées : garde d'atomicité avant DDL, retrait du droit anonyme inutile sur le helper de correction, régénération de toutes les empreintes. La trace des entrées opérateur dans l'historique de migration doit rester hors du dépôt.
- Revue croisée : correction de l'ordre de traitement des suppressions et des changements de photo principale dans le writer office. Les scénarios correspondants sont inclus dans la recette annulée.
- Build de production local exact `75568b8` réussi. Ce contrôle ne vaut pas preuve de déploiement serveur.
- Phase 2 applicative figée pour revue finale Claude et compilation exacte ; déploiement non encore effectué à ce stade.

## Retour arrière
Avant ouverture, garder les écritures acteur fermées. Après fermeture des anciens writers R5, conserver l'image office compatible CAS. Ne pas revenir à l'image 1/1 avec les policies restrictives en place. Ne supprimer aucune donnée saisie par les utilisateurs.

