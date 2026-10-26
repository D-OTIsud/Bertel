# Correctif visuel des modales — 26 octobre 2026

La livraison `347e77684d5bd7d3d4138db25e2356866f904159` faisait défiler le conteneur commun du formulaire et de l'aperçu. Les colonnes disparaissaient ensemble ; les captures fixes précédentes ne vérifiaient pas ce comportement. La chambre occupait aussi presque toute la hauteur disponible et son organisation s'écartait du modèle HTML fourni.

## Comportement corrigé

Sur bureau, le formulaire et l'aperçu défilent indépendamment dans un corps borné. En-tête, actions et autre colonne restent en place. Sur mobile, les colonnes sont empilées dans une seule zone intérieure défilante ; les actions restent accessibles. Menu et tarif ont leurs mêmes règles dans leur disposition propre.

Les dimensions viennent des 18 modèles : chambre 1000 px de large, corps 760 px, aperçu 300 px ; étape 1080/740/460 ; site 1000/720/380 ; média 1000/740/320 ; menu 1040 px, corps 760 px et colonne gauche 360 px ; tarif 1000/700/300. Les autres hauteurs sont propres à leur modèle et le cadre reste limité par l'écran.

La chambre retrouve les types sur toute la largeur, le nom et la quantité côte à côte, la capacité compacte, les lits résumés et les détails repliables. Les valeurs des détails sont conservées quand ils sont masqués. Les salles retrouvent leurs quatre cartes de disposition. Les périodes affichent leurs vraies plages dans l'aperçu et les raccourcis précèdent la grille, dans l'ordre visuel comme dans l'ordre clavier. Les aperçus des sites/étapes, les sections des médias, les cartes CRM, l'ordre du justificatif légal et la recherche d'objet lié ont également été rapprochés des modèles.

Une revue indépendante a trouvé puis fait corriger le libellé « Personnes », qui ciblait auparavant le bouton moins du nouveau stepper. Il cible désormais le champ numérique et ne modifie aucune capacité au clic.

## Validation du correctif final

- **56 suites / 694 tests réussis**, dont les parcours de conservation des données et le clic du libellé de capacité.
- TypeScript et **compilation Next.js de production réussis** ; 45 pages générées.
- **54 cas navigateur réussis** : les 18 modales en 1440 × 1100, 1280 × 720 et 390 × 844. Dimensions, molette réelle dans chaque colonne, indépendance des colonnes et immobilité du cadre/en-tête/actions sont contrôlées.
- Chambre : huit panneaux ouverts/repliés deux fois, conservation des valeurs enfants/lits/surface/description et focus correct après clic « Personnes ».
- **Cinq contrôles supplémentaires à 900 × 800 réussis** : chambre, site, étape, média et menu, sans débordement horizontal dans le cadre ou ses colonnes.

Les contrôles navigateur utilisent les fixtures Storybook et bloquent les accès réseau externes, avec un fond de carte vide pour les cartes. Ils ne constituent pas une recette des uploads ou écritures métier live, ni une preuve d'identité pixel par pixel de chaque contenu variable. Les listes contextuelles absentes des données transmises ne sont pas remplacées par les exemples fictifs du modèle.

Le script réutilisable `bertel-tourism-ui/scripts/verify-modal-layout.cjs` s'exécute contre un Storybook démarré séparément. Il utilise Playwright déjà présent. `STORYBOOK_URL` vaut par défaut `http://127.0.0.1:6007` ; `OUTPUT_DIR` choisit le dossier des preuves ; `CHROME_EXECUTABLE` permet de préciser un Chrome installé. Sans ce dernier, le Chromium de Playwright est utilisé.

Les rapports et captures de cette campagne sont conservés dans le projet local : `bertel-tourism-ui/outputs/modal-scroll-fix-2026-10-26/` (`QA_SUMMARY.json`, `scroll-verification.json`, `tablet-verification.json`, `opening-presets-dom-order.json`, `unit-tests.json`).

## Portée et livraison

Correctif applicatif local préparé pour revue. Aucune migration, route HTTP partenaire, dépendance npm ou configuration Coolify ne change. Les six migrations déjà installées restent en place et ne sont pas rejouées. Les nouvelles options d'exception horaire restent désactivées.

L'application de production ne reçoit ce correctif qu'après sa livraison Git et le déploiement Coolify de l'opérateur.
