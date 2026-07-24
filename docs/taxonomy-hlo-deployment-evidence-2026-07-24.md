# Preuves de déploiement — Taxonomie HLO nature/forme §190

**Environnement** : base cloud uniquement, SSL requis ; aucun Docker et aucune base locale.

**Fenêtre** : 2026-07-24, 16 h 33–16 h 43 RUN (12:33–12:43 UTC).

**Branche / HEAD SQL déployé** : `codex/restore-taxonomy-remediation` / `132d57ae24d9b65823c9ed00f8cd112fd0fbddb8`.

**CI finale de référence** : GitHub Actions `30094714885` sur `69d0b9e`, garde rejouable incluse et toutes les suites fresh-apply SQL vertes.

## Artefacts appliqués

| Artefact | Commit d'introduction | SHA-256 appliqué |
|---|---|---|
| `migration_taxonomy_nature_forme.sql` | `0a263df` | `6b36ff79a897ec4869e429b0f98ee470ea79ca953803e170144ef42a37e23126` |
| `migration_interop_crosswalk_leafaware.sql` | `d2a48ec` | `49bbf88c3a886b95c6b7db7b9c6c9968595b61f457c6db0782193e11c319647a` |

Le rollback relu avant la fenêtre contient 243 lignes dans `rollback/taxonomy_nature_forme_before_state.csv`. Son dry-run aller-retour avait validé migration puis restauration intégrale sans persistance.

## Pré-état gelé

| Mesure | Valeur |
|---|---:|
| HLO publiés | 476 |
| Affectations `taxonomy_hlo` | 479 tous statuts |
| Porteurs `gite_villa` | 179 (178 publiés + 1 archivé) |
| Porteurs `bungalow_chalet` | 52 |
| Nœuds cibles nouveaux déjà présents | 0 |
| Colonnes crosswalk leaf-aware déjà présentes | 0 |

## Application taxonomie

Transaction cloud réussie : manifeste 243 lignes, 7 nœuds cibles, 4 re-parentages, 5 relibellés, 243 recodages, gardes finales, `COMMIT`. Les deux MV ont été rafraîchies hors transaction.

| Test | Résultat live |
|---|---|
| T1 arbre, parents, libellés, flags | PASS |
| T2 nœuds désactivés / porteurs legacy | PASS — 0 |
| T3 garde nature/forme `COALESCE` | PASS — 0 écart hors arbitrages |
| T4 chemins de nature | PASS — 476/476, aucun ancêtre désactivé |
| T5 caches | PASS — 476/476, aucun code désactivé |
| T6 filtres sous-arbre | PASS — 456 locatifs + 20 collectifs = 476 |
| T7 recherche globale | PASS — toutes les `cdh_maison` remontent sur « chambre d'hôtes » |
| T8 panier API | PASS — diff limitée à taxonomie/chemins/rendu/`updated_at` |
| T9 catalogue | PASS — nouveaux nœuds et parents, legacy absents |
| T11-bis pagination | PASS — 476 ids uniques, 0 doublon, 0 trou |

Le chiffre 456/20 remplace l'ancien 460/16 du plan : les quatre fiches collectives Berta auparavant éparpillées sous meublé ont bien rejoint `hebergement_collectif`.

Fichiers exécutables :

- `tests/test_taxonomy_nature_forme_target.sql` avec le manifeste gelé ;
- `tests/test_taxonomy_nature_forme_guard.sql` ;
- `tests/test_taxonomy_nature_forme_live_post_taxonomy.sql`.

## Application crosswalk DATAtourisme

La migration a ajouté la paire FK `taxonomy_domain`/`taxonomy_code`, ses contraintes et index, 4 mappings HLO DATAtourisme, puis la résolution par ancêtre le plus proche (`depth ASC`) avec fallback type.

| Test | Résultat live |
|---|---|
| Crosswalk structure + fixtures transactionnelles | PASS |
| CdH / descendants | `Guesthouse` |
| Meublé / descendants | `SelfCateringAccommodation` |
| Collectif / descendants | `GroupLodging` |
| Refuge et gîte d'étape | `StopOverOrGroupLodge` |
| HLO sans taxonomie mappée | fallback `Accommodation` |
| schema.org / Apidae / Tourinsoft | identiques à l'octet sur 8 témoins |
| DATAtourisme hors `@type` | identique à l'octet sur 8 témoins |

Suites exécutées : `test_interop_crosswalk_leafaware.sql`, `test_taxonomy_nature_forme_live_api.sql`, `test_interop_profiles.sql`, `test_object_jsonld_schemaorg.sql` — toutes PASS.

## Premier point de surveillance

À 16 h 43 RUN :

- 476 HLO publiés, 476 caches de nature, 0 porteur legacy, 4 mappings DATAtourisme HLO ;
- cron `refresh-mv-filtered-objects` actif toutes les 5 minutes ; exécutions de 12:35 et 12:40 UTC réussies en environ 0,2 s ;
- 0 appel partenaire et donc 0 erreur 5xx/429 enregistré depuis l'ouverture de la fenêtre ;
- garde nature/forme toujours verte.

La surveillance 24 h reste ouverte jusqu'au 2026-07-25 à 16 h 43 RUN. La confirmation partenaires peut être envoyée dès maintenant ; elle ne dépendait que de T1–T10 verts.
