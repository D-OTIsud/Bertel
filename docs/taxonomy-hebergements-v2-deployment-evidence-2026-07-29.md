# Preuve de préparation au déploiement — taxonomie des hébergements v2 (§201)

Date : 2026-07-29
Plan : `docs/plans/2026-07-29-taxonomie-hebergements-collectifs-campings-aires-plan.md`
Gel et manifeste : `docs/research/taxonomy-hebergements-gel-revalidation-2026-07-29.md`
Audit amont : `docs/research/taxonomy-hebergements-existing-objects-audit-2026-07-29.md`

## 0. État — APPLIQUÉ SUR LA BASE SUPABASE DISTANTE LE 2026-07-29

Le frontend rétrocompatible était en ligne avant l'écriture SQL. Le déploiement a ensuite été
revalidé dans une transaction terminée par `ROLLBACK`, puis appliqué sur la base Supabase
distante dans l'ordre taxo5 → test taxo5 → taxo6 → test taxo6 → taxo7.

Post-déploiement : les deux vues matérialisées ont été rafraîchies avec `CONCURRENTLY`, puis le
cache de schéma PostgREST a été rechargé. Le contrôle direct confirme 5 types de logement actifs,
0 ancienne pseudo-nature encore active, 7 liens historiques repris, et les privilèges attendus
(`anon` en lecture seule ; écritures `authenticated` bornées par les policies canoniques). Aucune
base locale n'a été utilisée.

## 1. Ce qui a été livré

| Lot | Contenu | Commit |
|---|---|---|
| 0 | Revalidation du gel + manifeste nominatif figé | `9b05fd9` |
| 1 | `migration_taxonomy_accommodation_hierarchy_v2.sql` (taxo5) + snapshot d'arbres réaligné | `9b05fd9` |
| 2 | `tests/test_taxonomy_accommodation_hierarchy_v2.sql` + manifeste CI + runbook | `9b05fd9` |
| 3 | Explorer : 5 familles, projection rétrocompatible de `plein_air`, vrais sous-arbres, état vide explicite | présent lot |
| 4 | Création guidée par cinq familles directement visibles → Nature ; type technique calculé en arrière-plan | (lot 4) |
| 5 | Axe Type d'unité multi-valué (taxo6) : schéma, RLS, éditeur, filtre | (lot 5) |
| 6 + 6 bis | 3 équipements camping-car distincts (taxo7) + aide utilisateur réécrite | (lot 6) |

## 2. Mesure du rayon d'action (plan §14 — l'artefact d'approbation)

Rejouée avec `tests/dry_run_taxonomy_hierarchy_v2_manifest.sql` enchaîné après les trois
migrations, sur les données live, en transaction annulée.

> **N = 3.** Trois fiches — et trois seulement — voient `updated_at` et `current_version` bouger.
>
> - `HLORUN00000000ZV` (v16 → v17)
> - `HLORUN000000011E` (v15 → v16)
> - `HLORUN000000012H` (v15 → v16)
>
> **Aucun objet hors manifeste n'a été modifié.**

Ce sont exactement les trois porteurs de `gite_de_groupe` : leur nœud passe du libellé
« Gîte de groupe » à « Gîte », ce qui change leur `search_document`. Les neuf autres
identifiants du manifeste sont rafraîchis mais leur document ne change pas — les migrations
les ont déjà rafraîchis dans la même transaction, le second appel est un no-op.

**Conséquence partenaires :** trois fiches seront reprises à la prochaine synchronisation
incrémentale. C'est légitime (leur libellé de nature a réellement changé) et c'est le chiffre à
retrouver à l'identique en production. Tout écart doit provoquer un `ROLLBACK`.

Le manifeste borné compte 12 identifiants ; il est délibérément **plus large** que les 3 fiches
qui bougent, parce qu'on ne peut pas savoir avant de mesurer lesquelles bougeront.

## 3. Vérifications exécutées

| Contrôle | Résultat |
|---|---|
| taxo5 seule, contre live, ROLLBACK | vert — 11 groupes d'asserts |
| taxo5 jouée **deux fois** (idempotence) | vert — la reprise de fiches sort par `CONTINUE` au second passage |
| taxo5 + son test | vert — 18 contrôles |
| Test v2 joué **seul** contre l'état pré-migration | **rouge** (« 4 familles au lieu de 5 ») ⇒ garde non vacante |
| Sabotage : `farm_camping`/`homestay_camping` re-parentés sous `root` en gardant `metadata.famille` | **rouge** (« sous-type sans parent réel same-domain ») ⇒ l'invariant structurel est réellement mesuré |
| taxo6 + son test (personas anon / propriétaire / étranger × 4 commandes) | vert |
| taxo7 seule, ROLLBACK | vert |
| Suite frontend complète sur l'état exact à pousser | verte (`npm run test:run`, exit 0) |
| Tests ciblés création / filtres / aide / éditeur / projection rétrocompatible | 5 suites / 97 tests verts |
| `tsc --noEmit` | propre |

### Filtre parent — contrôle NON VACANT

Le test crée trois porteurs témoins (un par sous-type, un hors sous-arbre) et exécute la **même
RPC que l'Explorer** :

- filtrer `declared_campground` remonte les porteurs de `farm_camping` **et** de
  `homestay_camping`, et exclut le témoin extérieur ;
- filtrer `farm_camping` ne remonte que son propre porteur.

Asserter qu'un parent existe ne prouve pas que le filtrer remonte ses enfants. C'est la classe de
bug §196 : catalogue juste, filtre muet.

## 4. Advisors Supabase — ligne de base AVANT application

Relevé le 2026-07-29 : **0 ERROR**, 15 INFO, 176 WARN.

- Les 15 INFO sont des `rls_enabled_no_policy` sur les tables `partner_*` / `trail_*` / `app_ai_provider_config` — pré-existants, hors périmètre.
- Les WARN sont très majoritairement `anon_security_definer_function_executable`, attendu et documenté dans `CLAUDE.md` pour les RPC « authorize-once » (§36).

À rejouer **après** application : le delta attendu est **nul**. Les deux tables neuves naissent
avec RLS activée et leurs policies posées dans la même transaction ; la partition
`ref_code_accommodation_unit_type` reçoit explicitement la paire maison, une partition n'héritant
ni de `ENABLE ROW LEVEL SECURITY` ni des policies du parent.

## 5. Ordre de déploiement — non négociable

1. **`git push`** de `master`. Coolify construit et met en ligne le frontend.
2. **Vérifier en production** que l'Explorer fonctionne toujours avec l'**ancien** catalogue :
   cinq familles sont visibles ; « Hôtellerie de plein air » est absente ; Camping est dans
   « Campings et terrains » ; Aire d'accueil camping-car est dans « Aires et haltes de plein
   air » ; les natures collectives sont visibles et les familles s'ouvrent. La projection
   conserve les vrais couples domaine/code, donc les filtres continuent d'utiliser la closure
   serveur pendant toute la fenêtre où le frontend est en ligne avant le SQL.
3. **Puis seulement**, appliquer le SQL, dans cet ordre :

   ```
   taxo5  migration_taxonomy_accommodation_hierarchy_v2.sql
   taxo5-test  tests/test_taxonomy_accommodation_hierarchy_v2.sql
   taxo6  migration_accommodation_unit_type.sql
   taxo6-test  tests/test_accommodation_unit_type.sql
   taxo7  migration_motorhome_service_amenities.sql
   ```

4. **Avant COMMIT**, rejouer `tests/dry_run_taxonomy_hierarchy_v2_manifest.sql` et exiger
   **exactement** les 3 identifiants du §2. Tout écart ⇒ `ROLLBACK`.
5. Hors transaction :

   ```sql
   REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_filtered_objects;
   REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_ref_data_json;
   NOTIFY pgrst, 'reload schema';
   ```

   Le `NOTIFY` est **obligatoire** : `object_accommodation_unit_type` est une table neuve exposée.
6. Recette Explorer (§6 ci-dessous), puis rejouer les advisors.

**Le lot 5 exige en plus une revue architecture et sécurité** (plan §11) avant application :
modèle multi-valué, FK, index, GRANT, policies RLS et résultat du backfill.

## 6. Recette fonctionnelle à exécuter après application

| Scénario | Attendu |
|---|---|
| Créer → Hébergement collectif → Gîte | type HLO calculé en arrière-plan, nature posée sur la fiche |
| Créer → Collectif → Résidence de tourisme | type RVA calculé |
| Créer → Campings et terrains → Camping | type CAMP ; classement saisi séparément |
| Créer → Campings et terrains → Aire naturelle | type HPA, famille Campings et terrains |
| Créer → Terrain déclaré → Camping à la ferme | type HPA, fil d'Ariane complet |
| Créer → Aires et haltes → Aire de bivouac | type HPA, aucun service imposé |
| Explorer : cocher *Terrain de camping déclaré* | remonte les porteurs des DEUX sous-types |
| Explorer : cocher *Camping à la ferme* | ne remonte que son sous-arbre |
| Explorer : cocher une nature neuve (bivouac) | message « Aucune fiche n'utilise encore cette nature » |
| Explorer : rechercher « plein air » | propose les DEUX nouvelles familles |
| Éditeur §01 : cocher Bulle **et** Lodge | les deux persistent, la nature ne bouge pas |
| Ouvrir `HLORUN000000017A` | HLO, Hébergement collectif › Refuge et gîte d'étape |
| Ouvrir `CAMRUN000000013J` | HPA, Terrain de camping déclaré › Camping à la ferme |
| Contrôler les 7 fiches du manifeste Type d'unité | unité visible, nature conservée |

## 7. Retour arrière

Préparé avant l'application. Principes :

- réactiver `plein_air` et remettre les anciennes `metadata.famille` ;
- remettre les trois HLO collectifs en `sous_type` **seulement si** le frontend revient aussi en arrière ;
- désactiver les nouveaux nœuds au lieu de les supprimer ;
- **ne jamais** désactiver un nœud qui a reçu un porteur depuis le déploiement ;
- restaurer les caches et les deux vues matérialisées.

**Ne jamais laisser le SQL v2 sous un frontend qui n'exclut pas `isAssignable = false`.** Si des
fiches ont commencé à utiliser les nouveaux codes, le rollback devient une migration de données
et doit être revu séparément.

## 8. Décisions métier tranchées le 2026-07-29 (PO)

| Cas | Décision | Conséquence technique |
|---|---|---|
| **La Roulotte Géante** | Le bivouac reste une **prestation secondaire** de la fiche HLO. | **Aucune écriture.** Pas de fiche HPA créée, pas de retypage. |
| **Le Verger de la Chapelle** | Bascule en **Camping à la ferme** (statut d'exploitation agricole retenu contre le libellé IRT). | Une ligne `object_taxonomy`, gardée sur sa valeur source, + rafraîchissement borné. |

## 9. Ce qui reste ouvert

- **Fresh-apply complet** — `ci_fresh_apply.sql` est câblé (taxo5, taxo5-test, taxo6, taxo6-test,
  taxo7). Conformément à la politique du projet, aucun PostgreSQL/Supabase local n'est utilisé ;
  ce contrôle de base vierge reste confié à la CI (`.github/workflows/sql-fresh-apply.yml`). Les
  migrations et tests ont été exécutés ensemble contre la base distante dans une transaction
  annulée avant leur application réelle.
- **Recette avec un agent débutant** (plan §6 bis.8) — humaine, à planifier après la mise en ligne.
- **Migration des `type_unite` restés dans `taxonomy_hlo`** (maison, appartement, studio, bungalow,
  chalet, roulotte) vers `accommodation_unit_type` — lot à part, volontairement hors périmètre.
