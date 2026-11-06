# Accessibilité du portail : préservation de la conception approuvée

Le prochain client préparé depuis master conserve la maquette 14 approuvée le 6 novembre 2026 et servie par le commit [04028b6](https://github.com/D-OTIsud/Bertel/commit/04028b6a2f0b3549fbd6ff621ab4017957dff3f4). Le [compte rendu existant](2026-11-06-portail-correctifs.md) atteste la validation de la rubrique autonome. Ce lot prépare sa conservation dans la branche de livraison ; aucun déploiement n’est effectué.

Le composant reprend exactement cette version : introduction avec pictogramme personne, quatre familles et leurs pictogrammes, compteur de couverture, badges, choix en chips et encart du label avec Award. La classe de panneau et la phrase d’aide associées sont conservées. Les seuls styles de cette rubrique sont placés dans le module 28-portal-accessibility.css déjà importé ; l’ancienne feuille globale n’est pas recopiée.

Les contrats de types, le kit de formulaire, le filtrage des aménagements et l’updater de caractéristiques ont été comparés avant reprise. Les droits, états en lecture seule, garde de sortie, brouillon local et validation du master sont conservés. Le label reste une information sans contrôle d’écriture. Les équipements masqués, codes inconnus et autres caractéristiques restent présents après validation.

Vérifications locales : cinq suites ciblées / 100 tests et TypeScript réussis. Les témoins couvrent un choix partagé entre deux familles, la mise à jour des compteurs sans écriture avant Valider, l’abandon local, le module complet conservé et le refus de formulaire en lecture seule.

Un preview Storybook utilise le vrai composant et le vrai état d’éditeur avec des fixtures React locales, sans compte Auth ni donnée de production. Le rendu a été inspecté à 1440 px, 390 px et 360 px : grille à quatre, deux puis une colonne, absence de débordement horizontal, contrôles de bas de page accessibles. La navigation Tab/Espace, le choix partagé, le label attribué et la lecture seule ont également été vérifiés. Les captures restent privées. Le serveur local est arrêté après contrôle.

Le lot doit être inclus avant toute livraison du nouveau master : sans lui, la source historique du portail remplacerait la conception actuellement approuvée. La CI complète du gel composé reste à exécuter avant intégration.
