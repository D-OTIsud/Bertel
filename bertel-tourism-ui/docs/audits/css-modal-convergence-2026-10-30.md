# Nettoyage CSS et fonctionnement commun des modales

Cette proposition conserve les apparences existantes et reste en attente de validation visuelle avant fusion ou déploiement. Elle inclut la PR #71 déjà fusionnée et le travail parallèle `dc8ce32` sur les historiques, sans modification de ses fichiers métier.

## CSS

- Suppression de 217 règles sans classe requise retrouvée dans les sources, soit 1 182 lignes de règles dans les fichiers d’origine : 215 règles globales et 2 dans l’éditeur.
- L’audit tient compte des classes construites dynamiquement, des variantes, des bibliothèques, des tests, des stories, des prototypes HTML et du SQL. Il conserve les sélecteurs incertains et les règles dont une branche peut encore correspondre.
- Les candidats des zones dashboard et CRM sont conservés par précaution pour le travail parallèle.
- Un second contrôle porte sur les 1 686 fichiers source du dossier de travail d’origine, y compris ses modifications locales. Il conserve aussi les trois règles `.ed-modal__group` utilisées par sa version de `MediaEditModal`, même si cette version n’est pas encore dans master. Aucune des 217 suppressions retenues ne présente de conflit avec ces sources.
- Le fichier global devient une entrée de 27 imports ordonnés. Les déclarations conservées, leur ordre et les conditions de leurs règles sont identiques après expansion des imports. La vérification compare les arbres CSS, indépendamment des commentaires et des espaces.
- Le détail des suppressions, les candidats conservés et les empreintes des fichiers figurent dans [le relevé d’audit](css-cleanup-2026-10-30.json). Les empreintes utilisent des fins de ligne LF ; celle du CSS global après nettoyage concerne les feuilles concaténées dans l’ordre des imports.
- `scripts/audit-css-usage.mjs` reste un outil de lecture : il produit des candidats, sans suppression automatique. L’option `--source-project=chemin/vers/autre-copie/bertel-tourism-ui` ajoute les usages d’une autre copie du dépôt.

## Modales

`Modal`, `CrmModal`, `Dialog` et `Sheet` partagent le moteur Radix déjà utilisé par l’éditeur. Les classes visuelles, contenus, actions, tailles et durées de sortie existants sont conservés. Le CRM garde son ancêtre `.crm-app` et ses styles locaux.

Le clavier, le verrouillage du défilement et l’ordre de fermeture passent par la même pile. Un ajustement commun des niveaux d’affichage empêche un éditeur ouvert depuis une modale d’être couvert par son fond. Le focus revient au déclencheur disponible sans être repris à une autre fenêtre ouverte entre-temps. La récupération après retrait d’un document reste fonctionnelle et les confirmations gardent leur apparence précédente.

Les gardes métier des confirmations (traitement en cours, saisie de confirmation et attestation) sont conservées. Aucun service, contrat de données, droit ou fichier de filtre/KPI n’est modifié.

## Vérifications

- Vérification des types et compilation réussies.
- Suite complète : 5 511 tests, 545 suites ; contrôles ciblés supplémentaires sur les primitives, le CRM et les styles.
- 24 parcours de bout en bout en mode démonstration.
- 54 contrôles de dimensions, défilement et repli des 18 formulaires existants sur trois formats.
- 18 scénarios de clavier, clic, focus et superposition dans les composants locaux, y compris un empilement Sheet → CRM → confirmation.
- Comparaison de 12 captures avant/après : géométrie et styles mesurés identiques. Onze captures sont identiques au pixel près ; l’éditeur mobile présente de faibles écarts de rendu sans changement de dimensions ni de déclarations.

Les aperçus utilisent les vrais composants et des données d’exemple. Ces contrôles n’impliquent aucune écriture sur les données réelles et ne constituent pas une validation des services authentifiés en production.

Pour refaire les contrôles d’interaction, lancer Storybook localement, puis `node scripts/verify-modal-interactions.cjs` avec `STORYBOOK_URL` et, si nécessaire, `CHROME_EXECUTABLE`. Les contrôles des 18 formulaires utilisent `scripts/verify-modal-layout.cjs`.
