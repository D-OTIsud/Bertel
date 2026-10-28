# Socle — intégration locale du lot 2, 28 octobre 2026

Intégration par Sol 6.1 et vérification indépendante par le parent, dans le worktree `socle-convergence-lot1`. Référence avant modification : `24874dd`, après correction du retrait du bloc période. Le checkout principal, les anciennes maquettes et les données serveur ne sont pas modifiés. Aucun déploiement ni fusion.

## Périmètre livré

Les quatre feuilles propriétaires de l'éditeur consomment les rôles du thème existant : labels/actions 14/20, aide/erreur 14/21, saisie 16/24 avec encre explicite, titres 18/28, 20/28 et 24/32, valeurs statistiques 30/36. Champs/actions ordinaires à 40 px minimum, variantes compactes à 36 px sur bureau. Les règles tactiles désignent aussi les variantes compactes et les puces de catalogue. Rayons de contrôle 8 px, cadres désignés 12 px ; aucun nouveau système.

Les racines des modales gardent 16 px, le compteur `StatCard` avec pas garde son inline 19 px, et les champs multilignes conservent leurs minima spécialisés. Le reflow à 760 px agit sur les en-têtes existants. Les variantes partagées avec le CRM gardent leurs dimensions précédentes ; aucune réécriture JSX pour faire entrer un contrôle dans une règle CSS.

Le bouton entrant « Ouvrir la fiche » de `SectionRelations` ouvre le tiroir natif. L'éditeur reste monté. Le tiroir restitue le focus à son déclencheur encore présent ; ses actions vers une autre fiche ou l'administration consultent la garde de navigation existante. L'aperçu de la fiche courante ne provoque pas de confirmation supplémentaire. Les renvois langues/accessibilité/rattachements/prestataire utilisent les descripteurs partagés du registre sans modifier son ordre ni ses codes.

## Conservation vérifiée

- **28 états avant/après** : sept archétypes × complet/rapide × données renseignées/collections vides. Comparaison des contrôles, noms, valeurs, options, obligations, lecture seule, désactivation, visibilité, ordre et corps de rubrique : aucune différence inexpliquée.
- **54 chemins d'ouverture avant/après** : mêmes contrôles dans les fenêtres et ouvertures en ligne. Les boutons homonymes sont distingués par leur contexte et leur état activé ; leurs erreurs initiales de sélection dans la sonde sont conservées séparément.
- **14 états à 390 × 844** : inventaire et visibilité des contrôles des rubriques identiques au bureau ; 19 rubriques HEB, 20 pour les autres, huit corps actifs en rapide. Le fichier de référence final est `mobile-confirmed.json`, dont la largeur est mesurée dans chaque état. Les sondes initiales et la tentative restée à 1280 px ne sont pas comptées comme preuve mobile.
- **626 déclarations de contrôles dans 115 fichiers TSX** comparées par AST : seule différence fonctionnelle, le handler ajouté au bouton de relation existant. Aucun fichier source supprimé ; stores, services, hooks, types, utilitaires, état d'éditeur, validation et sauvegarde inchangés.
- **Vraie route Next en démo, HEB** : ouverture depuis Explorer/consultation, modification locale du nom, ouverture/fermeture de l'aperçu et bascule complet/rapide. La saisie reste présente, les corps passent de 19 à 8 puis 19. Valeur d'origine restaurée, aucune sauvegarde serveur exécutée. La fixture native n'a pas de lien entrant : ce parcours précis est couvert par le test de composant avec le vrai tiroir et l'état d'éditeur, et les tests séparés de la garde du tiroir.

## Vérifications de code

Typecheck indépendant réussi. Suite élargie : **164 suites, 1 312 tests ; 1 301 réussis, 11 échecs préexistants**. Les six suites concernées ont été rejouées sur la baseline figée : mêmes onze tests en échec, mêmes premiers messages, fichiers de tests identiques. Ces résultats ne constituent pas une suite entièrement verte.

Les tests directement concernés par le lot passent. Les anciennes attentes `Enregistrer` et quatre parcours omettant déjà des champs obligatoires ont été corrigés sans affaiblir les validations ni les assertions métier ; ces réparations de tests sont consignées séparément.

Build production Webpack réussi dans une copie externe pour laisser le serveur de revue disponible : 44 pages, 1 179 fichiers source/public/configuration identiques au worktree avant et après la compilation finale, qui inclut le correctif d'hydratation Dashboard. Dépendances existantes réutilisées, sans installation ni copie de secrets. Les deux suites Dashboard complémentaires passent indépendamment : 12 tests, dont cache froid/chaud à l'hydratation ; ils ne sont pas incorporés aux 1 312 tests de l'éditeur/tiroir.

## Limites et suites de recette

Le harnais importe les vrais composants et CSS, avec les mêmes fixtures des deux côtés, sans surcouche de proposition. Il ne remplace pas la recette serveur : permissions, sauvegarde, téléchargements et catalogues réels ne sont pas validés par ces données synthétiques. Ses commandes de header restent des frontières locales ; la recette de route native est distincte.

Le navigateur utilisé mesure `pointer: coarse = false`, même à 390 px. La cascade tactile est corrigée dans le code mais sa recette effective sur pointeur tactile reste à effectuer avant validation tactile. Le zoom texte à 200 %, les thèmes et tous les overlays CRM imbriqués ne sont pas couverts exhaustivement ici. Les actions spécialisées hors des sélecteurs approuvés gardent leurs tailles : close, toolbar Markdown, segments et boutons de ligne spécialisés. Le lot n'est pas un audit global d'accessibilité terminé.

Un libellé natif préexistant de `SectionIdentity` reste « Identité de l'hébergement » hors HEB ; il est conservé et n'est pas une reconstruction par le harnais. Sa correction métier mérite un traitement distinct.

## Preuves et retour arrière

Preuves : `C:/Users/dphil/.codex/visualizations/2026/10/26/01a17926-0c45-7d61-898b-326c6292c5e0/integration-lot2-2026-10-28/` : `dom-comparison.json`, `dialogs-comparison.json`, `mobile-confirmed.json`, `native-route-check.json`, `source-conservation.json`, `jest-independent.json`, `baseline-failures.json`, `build-check-final-integrity.json` et journaux associés.

Les diff CSS et fonctionnel sont séparés. Un retour arrière des styles ne touche ni registre, ni valeurs, ni garde de brouillon. Les corrections visuelles complémentaires du Dashboard restent documentées dans le rapport du lot 1.
