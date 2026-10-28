# Convergence éditeur et correctifs CRM — rapport historique de la tranche locale

**Portée de ce rapport.** Les campagnes ci-dessous ont été réalisées dans `socle-convergence-lot1`, sur une base issue du snapshot local `1e9405a`. Elles restent des preuves historiques de cette cible. La [PR #56](https://github.com/D-OTIsud/Bertel/pull/56) est un portage distinct sur `master` au commit `3c10fbd`, avec conservation des modèles de modales plus récents. Ses tests et limites sont rapportés séparément dans la PR, par SHA. Aucun total de ce document ne vaut validation automatique du portage.

**État du programme.** Cette tranche couvre les styles d'éditeur et les corrections fonctionnelles énumérées ci-dessous. Elle ne clôture ni le lot 2 complet du programme de convergence, ni les lots de l'audit de simplification. La purge de code/CSS mort, l'unification générale des confirmations et boutons, `PageHeader`, les gardes transverses, la consolidation des alias et seuils responsive, ainsi que les autres surfaces restent ouverts. Les sujets métier de l'audit (présélections tarifaires, complétude `subPlaces`, duplication de la garde de liens) ne sont pas livrés par cette PR et doivent être recalés sur la cible avant correction.

**Changements fonctionnels à examiner séparément du CSS.** Le catalogue de classification autorise désormais les labels d'accessibilité depuis le dialogue ouvert en §08 ; le tiroir de consultation consulte la garde de navigation de l'éditeur hôte avant de changer de page. Ces comportements sont explicitement signalés dans la PR pour revue. Ils ne sont pas des conséquences implicites d'une harmonisation de styles.

Intégration par Sol 6.1 et vérification indépendante par le parent, dans le worktree `socle-convergence-lot1`. Référence avant modification : `24874dd`, après correction du retrait du bloc période. Le checkout principal, les anciennes maquettes et les données serveur ne sont pas modifiés. Aucun déploiement ni fusion.

## Périmètre livré

Les quatre feuilles propriétaires de l'éditeur consomment les rôles du thème existant : labels/actions 14/20, aide/erreur 14/21, saisie 16/24 avec encre explicite, titres 18/28, 20/28 et 24/32, valeurs statistiques 30/36. Champs/actions ordinaires à 40 px minimum, variantes compactes à 36 px sur bureau. Les règles tactiles désignent aussi les variantes compactes et les puces de catalogue. Rayons de contrôle 8 px, cadres désignés 12 px ; aucun nouveau système.

Les racines des modales gardent 16 px, le compteur `StatCard` avec pas garde son inline 19 px, et les champs multilignes conservent leurs minima spécialisés. Le reflow à 760 px agit sur les en-têtes existants. Les variantes partagées avec le CRM gardent leurs dimensions précédentes ; aucune réécriture JSX pour faire entrer un contrôle dans une règle CSS.

Le bouton entrant « Ouvrir la fiche » de `SectionRelations` ouvre le tiroir natif. L'éditeur reste monté. Le tiroir restitue le focus à son déclencheur encore présent ; ses actions vers une autre fiche ou l'administration consultent la garde de navigation existante. L'aperçu de la fiche courante ne provoque pas de confirmation supplémentaire. Les renvois langues/accessibilité/rattachements/prestataire utilisent les descripteurs partagés du registre sans modifier son ordre ni ses codes.

## Conservation vérifiée

- **28 états avant/après** : sept archétypes × complet/rapide × données renseignées/collections vides. Comparaison des contrôles, noms, valeurs, options, obligations, lecture seule, désactivation, visibilité, ordre et corps de rubrique : aucune différence inexpliquée.
- **54 chemins d'ouverture avant/après** : mêmes contrôles dans les fenêtres et ouvertures en ligne. Les boutons homonymes sont distingués par leur contexte et leur état activé ; leurs erreurs initiales de sélection dans la sonde sont conservées séparément.
- **14 états à 390 × 844** : inventaire et visibilité des contrôles des rubriques identiques au bureau ; 19 rubriques HEB, 20 pour les autres, huit corps actifs en rapide. Le fichier de référence final est `mobile-confirmed.json`, dont la largeur est mesurée dans chaque état. Les sondes initiales et la tentative restée à 1280 px ne sont pas comptées comme preuve mobile.
- **626 déclarations de contrôles dans 115 fichiers TSX** comparées par AST : seule différence dans leurs attributs, le handler ajouté au bouton de relation existant. Le même comparateur a été rejoué après les corrections complémentaires ci-dessous. Aucun fichier source supprimé ; stores, services, hooks, types, utilitaires, état d'éditeur, validation et sauvegarde inchangés. Ce contrôle structurel ne prouve pas à lui seul l'équivalence de tous les comportements.
- **Vraie route Next en démo, HEB** : ouverture depuis Explorer/consultation, modification locale du nom, ouverture/fermeture de l'aperçu et bascule complet/rapide. La saisie reste présente, les corps passent de 19 à 8 puis 19. Valeur d'origine restaurée, aucune sauvegarde serveur exécutée. La fixture native n'a pas de lien entrant : ce parcours précis est couvert par le test de composant avec le vrai tiroir et l'état d'éditeur, et les tests séparés de la garde du tiroir.

## Vérifications initiales de code

Typecheck indépendant réussi. Suite élargie : **164 suites, 1 312 tests ; 1 301 réussis, 11 échecs préexistants**. Les six suites concernées ont été rejouées sur la baseline figée : mêmes onze tests en échec, mêmes premiers messages, fichiers de tests identiques. Ces résultats ne constituent pas une suite entièrement verte.

Les tests directement concernés par le lot passent. Les anciennes attentes `Enregistrer` et quatre parcours omettant déjà des champs obligatoires ont été corrigés sans affaiblir les validations ni les assertions métier ; ces réparations de tests sont consignées séparément.

Build production Webpack réussi dans une copie externe pour laisser le serveur de revue disponible : 44 pages, 1 179 fichiers source/public/configuration identiques au worktree avant et après la compilation finale, qui inclut le correctif d'hydratation Dashboard. Dépendances existantes réutilisées, sans installation ni copie de secrets. Les deux suites Dashboard complémentaires passent indépendamment : 12 tests, dont cache froid/chaud à l'hydratation ; ils ne sont pas incorporés aux 1 312 tests de l'éditeur/tiroir.

## Recette complémentaire et corrections du 28 octobre

Les onze échecs initiaux sont résolus. Les parcours de tests suivent désormais les contrôles réels, en conservant les assertions métier. Une véritable incohérence a aussi été corrigée : `ClassificationEditModal` excluait les référentiels d'accessibilité alors que sa rubrique les proposait explicitement. « Tourisme & Handicap » redevient sélectionnable ; le filtrage des labels déjà détenus, les dates obligatoires, le stockage unique dans `accessibilityLabels` et la couverture par handicap sont conservés et testés.

La recette utilise les vrais composants et CSS, avec des données locales identiques avant/après :

- **14 états tactiles** : sept archétypes × complet/rapide, `hasTouch` et `isMobile` activés, `pointer: coarse = true` effectivement mesuré. Hauteur minimale de 44 px vérifiée sur les sélecteurs approuvés. Les saisies et inventaires restent identiques après agrandissement de la racine de 16 à 32 px ; labels 14 → 28 px, champs 16 → 32 px et interligne 24 → 48 px.
- **10 contrôles d'en-têtes** : HEB et ITI à 390, 759, 760, 761 et 768 px, texte agrandi. Les rectangles de texte sont vérifiés, pas seulement le cadre. Le titre « Rattachements organisationnels » débordait à 390 px : césure automatique, limite des fragments courts et rupture de secours ajoutées uniquement au `h3` propriétaire, sans réduire sa taille ni modifier son contenu.
- **6 contrôles de pieds de modales** : chambre et tarif à 390, 460 et 461 px, tactile et texte agrandi. Actions accessibles et texte non tronqué ; aucune refonte de footer nécessaire.
- **15 parcours CRM imbriqués**, à 390, 768 et 1 280 px : acteur, interaction, tâche, affectation d'établissement et transfert de document. Contrôles, valeurs et styles de contenu comparés à `24874dd`, focus initial, Tab/Shift-Tab, Échap, retour au déclencheur et verrouillage du défilement contrôlés. Un cas supplémentaire vérifie les actions désactivées en lecture seule.

Trois corrections CRM résultent de ces mesures. Le rayon effectif des boutons du footer était **8 px avant le lot**, malgré une règle écrite à 10 px ; la spécificité ajoutée l'avait fait passer à 10 px. Cette déclaration est retirée, avec minimum de 38 px conservé. Échap fermait déjà la modale CRM et son Sheet parent : le Sheet laisse désormais le dialogue enfant gérer cet appui, puis `CrmModal` rend le focus au déclencheur encore connecté. Enfin, après défilement, la fenêtre d'affectation pouvait sortir de l'écran (haut mesuré à −50,625 px). Deux règles dans la feuille propriétaire `styles.css` bornent le wrapper CRM à 100 % et sa grille à `auto minmax(0, 1fr)` ; seul le contenu du tiroir défile. Champs, dimensions des contrôles et handlers métier restent identiques.

Le dernier changement CSS ne concerne que ce conteneur CRM. Les **16 cas CRM ont tous été rejoués et passent** ; les 30 autres cas restent vérifiés dans la campagne précédente. Soit **46 scénarios validés**, sans les présenter comme une unique campagne verte. Les échecs initiaux et leurs captures sont conservés.

L'élargissement des tests au module CRM a révélé 18 attentes supplémentaires périmées, reproduites avec les mêmes erreurs sur une copie externe de la baseline. Les quatre fichiers concernés sont corrigés uniquement côté tests ; leurs 74 assertions de service, payload, compteurs et clés optionnelles sont conservées. Bilan indépendant : **186 suites / 1 712 tests couverts**, avec 1 572 tests réussis dans les 182 suites inchangées puis **140/140** lors du rejeu des quatre suites corrigées. Ce bilan consolidé ne constitue pas une nouvelle exécution complète en une passe. Aucun échec restant dans ce périmètre ; typecheck sans cache et garde CSS réussis.

La compilation Webpack de l'état final réussit dans `production-build-KdxY6X` : **44 pages statiques générées**, inventaire de **52 entrées de routes identique** au build précédent. Les **1 180 fichiers** source/public/configuration sont identiques entre copie et worktree, avant et après compilation ; les **1 195 empreintes du projet principal** sont intactes. Le serveur de revue `43711` n'a pas été arrêté ni utilisé pour compiler. Voir `production-build-KdxY6X/build-result.json` et ses rapports de conservation.

## Limites et suites de recette

Le harnais importe les vrais composants et CSS, avec les mêmes fixtures des deux côtés, sans surcouche de proposition. Il ne remplace pas la recette serveur : permissions, sauvegarde, téléchargements et catalogues réels ne sont pas validés par ces données synthétiques. Ses commandes de header restent des frontières locales ; la recette de route native est distincte.

La recette complémentaire couvre une **émulation tactile**, pas un appareil physique. Le stress typographique double les rôles en `rem` ; ce n'est ni un zoom navigateur ni un agrandissement universel des textes restés en pixels, notamment ceux du CRM volontairement préservés. Les thèmes et tous les overlays possibles ne sont pas couverts exhaustivement. Les actions spécialisées hors des sélecteurs approuvés gardent leurs tailles : close, toolbar Markdown, segments et boutons de ligne spécialisés. Le lot n'est pas un audit global d'accessibilité terminé.

Un libellé natif préexistant de `SectionIdentity` reste « Identité de l'hébergement » hors HEB ; il est conservé et n'est pas une reconstruction par le harnais. Sa correction métier mérite un traitement distinct.

## Preuves et retour arrière

Preuves : `C:/Users/dphil/.codex/visualizations/2026/10/26/01a17926-0c45-7d61-898b-326c6292c5e0/integration-lot2-2026-10-28/` : `dom-comparison.json`, `dialogs-comparison.json`, `mobile-confirmed.json`, `native-route-check.json`, `source-conservation.json`, `jest-independent.json`, `baseline-failures.json`, `build-check-final-integrity.json` et journaux associés.

Complément : dossier frère `integration-lot2-validation-2026-10-28/`, notamment `final-test-summary.json`, `crm-final-independent.json`, `crm-four-suite-repair-summary.json`, `source-conservation-legacy-compatible.json`, `header-before-correction.png` et `header-detail.png`. Campagnes `runs/2026-10-28T10-05-25-838Z` (30 cas éditeur réussis, défaut CRM conservé) et `runs/2026-10-28T10-14-36-124Z` (16 cas CRM réussis après correction). Chaque campagne finale conserve les manifests source et les empreintes des bundles servis ; aucun bundle n'a changé pendant son exécution. Le diagnostic du défilement est dans le dossier frère `integration-lot2-crm-diagnostic-2026-10-28/`.

Les diff CSS et fonctionnel sont séparés. Un retour arrière des styles ne touche ni registre, ni valeurs, ni garde de brouillon. Les corrections visuelles complémentaires du Dashboard restent documentées dans le rapport du lot 1.
