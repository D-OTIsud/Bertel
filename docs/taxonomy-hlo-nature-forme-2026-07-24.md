# Refonte nature/forme de la taxonomie hébergement (§190) — audit croisé Berta, arbre cible, rapport d'arbitrage

**Date** : 2026-07-24 · **Périmètre** : `taxonomy_hlo` (476 HLO publiés) + `taxonomy_rva` (0 publié) + libellés frontend + export DATAtourisme
**État** : audit DONE (chiffres live vérifiés à l'unité) · plan READY · exécution PENDING arbitrages PO
**Référence** : prolonge la remédiation §186→§189 (close 2026-07-17) ; même méthode (proposition nominative → arbitrage PO en session → recodage tracé).

---

## 1. Résumé exécutif

La taxonomie hébergement mélange la **nature réglementaire** (chambre d'hôtes, meublé de tourisme, hébergement collectif) et la **forme du logement** (villa, appartement, bulle…). Ce n'est plus une faiblesse théorique : l'import `old_data_enrichment_20260512` (le même lot que les ACT mal codés à ~48 %, §186) a mappé la feuille sur la **sous-catégorie Berta = la forme**, et quand nature et forme divergeaient, **la forme a silencieusement écrasé la nature**. Résultat vérifié : **12 fiches ont changé de nature à l'import** (dont 6 chambres d'hôtes devenues meublés — le signal remonté par la collègue de l'OTI ; 1 des 12, Zévi sur Mer, a déjà été re-arbitrée par le PO au lot C §189).

La correction ne demande **aucune refonte de modèle** : l'architecture (profondeur arbitraire via `parent_id`, affectation à tout niveau, chemin d'ancêtres par `ref_code_taxonomy_closure`, filtre par sous-arbre via `cached_taxonomy_codes`) supporte déjà l'arbre cible. Le chantier = réorganisation DML des nœuds + recodage des fiches + convergence caches/MV + garde permanente + extension leaf-aware du crosswalk DATAtourisme.

---

## 2. Découverte décisive : 12 régressions de nature à l'import

Croisement `object.extra.source_category`/`source_subcategory` (catégorie Berta d'origine, présente sur 469/476 HLO publiés) × feuille `taxonomy_hlo` actuelle.

### 2a. Chambres d'hôtes Berta → rangées côté meublé (6) — régressions probables

| id | Fiche | Berta | Feuille actuelle |
|---|---|---|---|
| HLORUN0000000183 | La Belle du Sud | Chambre d'hôtes / Maison | `maison` |
| HLORUN000000018R | La Maison Verte | Chambre d'hôtes / Maison | `maison` |
| HLORUN00000000WT | Le Bougainvillier | Chambre d'hôtes / Maison | `maison` |
| HLORUN000000018H | Le Clos Gentil | Chambre d'hôtes / Maison | `maison` |
| HLORUN00000000RF | Villa Ti MoOn | Chambre d'hôtes / Gîte & Villa | `gite_villa` |
| HLORUN000000014W | Trésor d'Ange | Chambre d'hôtes / Bungalow & Chalet | `bungalow_chalet` |

### 2b. Hébergements collectifs Berta → dispersés côté meublé (4) — régressions probables

| id | Fiche | Berta | Feuille actuelle |
|---|---|---|---|
| HLORUN00000000RM | Le Chalet Co Gite | Gîte d'étape et de randonnée / Bungalow & Chalet | `bungalow_chalet` |
| HLORUN000000014I | Tit Caze Gilbert François | Gîte d'étape et de randonnée / Bungalow & Chalet | `bungalow_chalet` |
| HLORUN00000000Q7 | Escale du point de vue | Gîte d'étape et de randonnée / Gîte rural | `gite_rural` |
| HLORUN00000000QP | Gîte Là-Haut | Gîte d'étape et de randonnée / Gîte & Villa | `gite_villa` |

### 2c. Mouvement inverse (1) — à arbitrer (Berta lui-même ambigu : cat et sous-cat en désaccord)

| id | Fiche | Berta | Feuille actuelle |
|---|---|---|---|
| HLORUN000000016B | Entr'Deux Gones | Location saisonnière / Chambre d'hôte | `chambre_d_hotes` |

**Zévi sur Mer (HLORUN00000000NU) est HORS lot** : son `chambre_d_hotes` est un **arbitrage PO du lot C §189** (2026-07-17), tracé en base (`ot.source = 'taxonomy_audit_lot_c_20260717'`, note « Arbitrage PO §187 lot C »). C'est la première **exception validée** de la garde §9.

### 2d. Renversement sur les 3 insolites — présumées CORRECTES

Les 3 fiches — **Entre 2 Bulles** (`hebergement_insolite`), **Héritage Écolodge & Spa** (`lodges`), **La BBO La Bulle by Baril O'thentik** (`bulle`) — sont enfants de `chambre_d_hotes` **parce que leurs porteurs étaient des chambres d'hôtes chez Berta** (nature CdH / forme insolite — seul endroit où l'import a préservé la nature). Les « sortir de la branche CdH » mécaniquement reproduirait l'erreur des 6 maisons d'hôtes. Présomption : bien placées, **à confirmer métier** (chez l'habitant + petit-déjeuner vs logement autonome).

Les 63 fiches « Chambre d'hôtes / Chambre d'hôte » (nature = forme concordantes) sont passées correctement et ne sont pas re-questionnées.

---

## 3. Arbre cible `taxonomy_hlo` — code par code

Principe verrouillé : **la nature précède la forme**. Un code est une identité : on ne renomme jamais un `code`, on renomme des libellés (`name` + `name_i18n.fr`) ; une forme homonyme sous deux natures = deux codes distincts (mono-parent `ref_code`).

```
root (caché)
├── hebergement_locatif  « Hébergement locatif »                    [CRÉÉ]
│   ├── chambre_d_hotes  « Chambre d'hôtes »                        [conservé, re-parenté root→hebergement_locatif]
│   │   ├── cdh_maison   « Maison d'hôtes »                          [CRÉÉ — cible des maisons d'hôtes §2a]
│   │   ├── cdh_bungalow « Bungalow »                                [CRÉÉ — cible de Trésor d'Ange]
│   │   ├── bulle        « Bulle »                                   [conservé]
│   │   ├── lodges       « Lodge »                                   [conservé, libellé au singulier]
│   │   └── hebergement_insolite « Autre hébergement insolite »      [conservé, relibellé]
│   └── location_saisonniere « Meublé de tourisme / gîte »           [conservé, re-parenté, RELIBELLÉ]
│       ├── appartement  « Appartement »                             [conservé]
│       ├── maison       « Maison / villa »                          [conservé, RELIBELLÉ — absorbe gite_villa]
│       ├── studio       « Studio »                                  [conservé]
│       ├── bungalow     « Bungalow / mobil-home »                   [CRÉÉ — split de bungalow_chalet]
│       ├── chalet       « Chalet »                                  [CRÉÉ — split de bungalow_chalet]
│       ├── gite_rural   « Gîte rural »                              [conservé — appellation ; PO : garder ou fondre dans maison]
│       ├── cottage / roulotte / rez_de_chaussee_d_une_maison        [conservés — micro-feuilles (1/1/2), PO tranchera]
│       └── (gite_villa, bungalow_chalet)                            [DÉSACTIVÉS après ventilation/split — jamais supprimés]
└── hebergement_collectif « Hébergement collectif »                  [CRÉÉ]
    ├── gite_de_groupe    « Gîte de groupe »                         [conservé, re-parenté]
    ├── gite_de_randonnee « Refuge et gîte d'étape »                 [conservé, re-parenté, RELIBELLÉ]
    └── auberge_collective « Auberge collective »                    [CRÉÉ, 0 porteur — forward-looking]
```

Restent morts (désactivés §187/§189, sans enfant après re-parentage) : `gite_d_etape_et_de_randonnee`, `auberge` (ne PAS réactiver — ambiguïté documentée), `chambre`. « Table d'hôtes » n'est **pas** une feuille (service, pas une forme) : les 4 fiches Berta « ; Table d'hôte » restent nature CdH.

Contraintes techniques vérifiées :
- Tous les nouveaux nœuds (y compris intermédiaires) naissent `is_assignable = true` — les voies de lecture (chemins, `cached_taxonomy_codes`, `search_document`) filtrent `anc.is_assignable = TRUE` ; un intermédiaire non-assignable disparaît des fils d'Ariane (c'est le trou actuel des 16 fiches collectives dont le parent `gite_d_etape_et_de_randonnee` est désactivé).
- Le re-parentage déclenche automatiquement le rebuild de la closure (`trg_refresh_ref_code_taxonomy_closure` sur `ref_code`, rebuild par domaine).
- Le re-parentage ne déclenche **PAS** le refresh des caches objet (trigger sur `object_taxonomy` seulement) → boucle explicite `api.refresh_object_filter_caches(id)` sur les HLO affectés + refresh des 2 MV en fin de migration.
- Filtre transversal « toutes les maisons » (si besoin un jour) = agrégation UI de `cdh_maison` + `maison` (multi-code any-of, mécanique existante).

## 3b. `taxonomy_rva` — déjà conforme

Vérifié live : `tourism_residence` « Résidence de tourisme classée », `holiday_village` « Village de vacances », `aparthotel` « Résidence hôtelière » existent sous root, tous assignables. **Zéro travail** (0 RVA publié ; seed forward-looking déjà en place).

---

## 4. Pré-ventilation des 178 `gite_villa`

Heuristique deux étages : mots-clés du **nom**, puis de la **description canonique** (`bedrooms` vide sur les 178 — locatifs entiers §64 ; capacité présente sur 175 mais non discriminante pour la forme).

| Cible | Signal nom | Signal description | Total |
|---|---|---|---|
| `maison` « Maison / villa » | 78 (villa 50 + maison/kaz 28) | 64 (villa 35 + maison/kaz 29) | **142** |
| `appartement` | 0 | 6 | **6** |
| bungalow/chalet (→ split §5) | 2 | 5 | **7** |
| reste sur `location_saisonniere` (gîte générique, nature connue/forme non) | 4 | 3 | **7** |
| **Arbitrage PO** | — | — | **14** |
| ~~capacité/villa vs maison~~ | | | *(fusion « Maison / villa » : distinction sans objet)* |

La fusion de la feuille cible « Maison / villa » absorbe d'un coup 142/178 — la distinction villa↔maison n'a plus besoin d'être arbitrée. Deux fiches déjà dans le lot nature (§2) sont exclues du recodage auto (Villa Ti MoOn, Gîte Là-Haut).

**Les 14 en arbitrage PO** (aucun signal nom ni description) :

| id | Fiche | Motif |
|---|---|---|
| HLORUN0000000142 | 3 Boyer Teddy | sans description |
| HLORUN0000000122 | Anadele | sans description |
| HLORUN0000000140 | Bleu Azur | sans description |
| HLORUN0000000121 | La Créole Améthyste | sans description |
| HLORUN000000014N | Le Ti'son Dort | sans description |
| HLORUN000000014F | Palmier Bleu | sans description |
| HLORUN000000018Q | Au pays du mouton blanc | sans signal |
| HLORUN00000000OV | Chez Gérard | sans signal |
| HLORUN00000000UK | Entre Mer et Montagne - Meublé Volcan | sans signal |
| HLORUN000000015R | L'Empreinte | sans signal |
| HLORUN00000001B8 | L'Or du Temps | sans signal (aussi sans provenance Berta, §6) |
| HLORUN00000000R0 | Le Flamboyant | sans signal |
| HLORUN00000000S7 | LES HIBISCUS | sans signal |
| HLORUN000000013F | Meublé Arc-en-Ciel | sans signal |

Défaut proposé pour ces 14 : **rester sur le nœud de nature** « Meublé de tourisme / gîte » (la nature est connue via Berta « Location saisonnière » ; la forme attendra) — conforme à la règle « jamais la forme ne force une décision ».

## 5. Split des 52 `bungalow_chalet`

Même heuristique : **23 → `chalet`**, **17 → `bungalow`**, **12 → arbitrage PO** (liste nominative à générer au moment de la session, requête rejouable). Deux fiches du lot nature (Le Chalet Co Gite, Tit Caze Gilbert François) sont exclues du split auto (leur destination est d'abord une question de nature : collectif).

## 6. Les 7 HLO sans provenance Berta (créés post-import — contrôle « fonctionnement réel »)

| id | Fiche | Feuille actuelle | Proposition |
|---|---|---|---|
| HLORUN00000001B3 | Villa Evilou | gite_villa | auto → `maison` (signal nom) |
| HLORUN00000001BE | Villa Les Margosiers | gite_villa | auto → `maison` |
| HLORUN00000001BF | La Kaz Bon Dimanche | gite_villa | auto → `maison` |
| HLORUN00000001B5 | L'Océan de Brilune | gite_villa | arbitrage |
| HLORUN00000001B8 | L'Or du Temps | gite_villa | arbitrage (déjà en §4) |
| HLORUN00000001BG | Au Coucher de Lune | location_saisonniere | reste sur nature (déjà correct) |
| HLORUN00000001BH | Fanjan | bungalow_chalet | split auto §5 |

## 7. Récapitulatif des arbitrages PO

| Lot | Fiches | Nature de l'arbitrage |
|---|---|---|
| Nature (§2) | 14 | 6 CdH→meublé (régression probable) + 4 collectif→meublé (idem) + 1 inverse (Entr'Deux Gones) + 3 insolites (présumées OK, confirmer) — Zévi sur Mer déjà tranché §189 |
| gite_villa sans signal (§4) | 14 | forme inconnue — défaut proposé : rester sur nature |
| bungalow_chalet sans signal (§5) | 12 | bungalow vs chalet vs mobil-home |
| Sans provenance Berta (§6) | 2 | L'Océan de Brilune + L'Or du Temps (dédupliqué) |
| Micro-feuilles (§3) | 3 questions | gite_rural (garder/fondre) · cottage→maison ? · rez_de_chaussée→appartement ? |

**≈ 42 arbitrages nominatifs + 3 questions de structure** ; ~206 fiches recodées automatiquement (142 maison/villa + 6 appartement + 7 split + 40 bungalow/chalet + 4 sans-Berta + 7 restent-sur-nature).

---

## 8. Règle d'import nature/forme (à graver dans l'ingesteur ET dans CLAUDE.md si validée)

1. `source_category` (nature) détermine la **branche** ;
2. `source_subcategory` (forme) ne sélectionne qu'une feuille **sous cette branche** ;
3. combinaison inexistante → la fiche reste **sur le nœud de nature** ;
4. nature et forme contradictoires → **file d'arbitrage**, jamais de bascule silencieuse de branche.

> catégorie connue + forme inconnue → conserver la nature
> catégorie et forme contradictoires → arbitrage
> jamais → déduire la nature de la forme

## 9. Garde permanente (données vivantes — PAS le gate CI fresh-apply, qui tourne sur base vide)

Requête d'audit rejouable (à exécuter après tout import/recodage HLO). Le mécanisme d'exception est **déjà en base** : les affectations arbitrées par le PO portent une `source` de session d'arbitrage (ex. `taxonomy_audit_lot_c_20260717` pour Zévi sur Mer) — la garde exempte ces sources au lieu de maintenir une liste d'ids à la main :

```sql
-- Écarts de nature Berta ↔ taxonomie (résultat attendu : 0 ligne — les arbitrages PO sont exemptés par source)
SELECT o.id, o.name, o.extra->>'source_category' AS berta, leaf.code AS feuille
FROM object o
JOIN object_taxonomy ot ON ot.object_id = o.id AND ot.domain = 'taxonomy_hlo'
  AND ot.source NOT IN ('taxonomy_audit_lot_c_20260717', 'taxonomy_nature_forme_arbitrage_20260724')  -- sessions PO
JOIN ref_code leaf ON leaf.id = ot.ref_code_id
LEFT JOIN ref_code_taxonomy_closure cl
  ON cl.domain = 'taxonomy_hlo' AND cl.descendant_id = leaf.id
LEFT JOIN ref_code nature ON nature.id = cl.ancestor_id
 AND nature.code = CASE o.extra->>'source_category'
       WHEN 'Chambre d''hôtes'              THEN 'chambre_d_hotes'
       WHEN 'Location saisonnière'          THEN 'location_saisonniere'
       WHEN 'Gîte d''étape et de randonnée' THEN 'hebergement_collectif'
     END
WHERE o.object_type = 'HLO' AND o.status = 'published'
  AND o.extra->>'source_category' IS NOT NULL
GROUP BY o.id, o.name, berta, leaf.code
HAVING COUNT(nature.id) = 0;
```

## 10. Export DATAtourisme (lot 4) — crosswalk leaf-aware

Extension table-driven de `ref_interop_crosswalk` (invariant §136 préservé) : colonne `taxonomy_code` **nullable** ; résolution par **ancêtre mappé le plus proche** — `ORDER BY cl.depth ASC LIMIT 1` (la feuille elle-même à depth 0 gagne, puis on remonte ; **PAS** depth DESC, qui donnerait la classe de la racine) ; fallback = ligne générique `taxonomy_code IS NULL` du type.

Seeds cibles (PO-ajustables) :

| Nœud | Classe DATAtourisme |
|---|---|
| `chambre_d_hotes` (couvre ses formes par héritage) | Guesthouse |
| `location_saisonniere` (idem) | SelfCateringAccommodation |
| `hebergement_collectif` | GroupLodging |
| `gite_de_randonnee` « Refuge et gîte d'étape » | StopOverOrGroupLodge |
| HLO sans mapping feuille | Accommodation (ligne existante) |

Classes RVA (`tourism_residence`, `holiday_village`, `aparthotel`) : à compléter au lot 4 contre l'ontologie.

## 11. Lot frontend (indépendant, immédiat)

Badge HLO unifié : **« Gîtes, meublés & chambres d'hôtes »** via une map de libellés d'affichage à source unique, consommée par les 4 surfaces (`archetypes.ts` TYPE_LABEL, `create-object-options.ts`, `lists/type-meta.ts`, aide `creer-objet.ts`). Attention : `TYPE_LABEL` sert de quasi-code stable non accentué ailleurs — vérifier ses consommateurs avant tout renommage direct. Corriger l'aide `creer-hlo` (HLO ≠ « logement entier » seulement : 74 fiches CdH).

## 12. Séquencement d'exécution

1. **Lot 0 frontend** — badge + aide (commit indépendant, aucun risque).
2. **Migration arbre** (DML pur, idempotente) : créer les nœuds, re-parenter, relibeller (`name` + `name_i18n.fr`) ; snapshot `migration_taxonomy_trees_seed.sql` + manifest + runbook (invariant §189).
3. **Session PO** : ce rapport → décisions sur les ~43 + 3 questions de structure.
4. **Recodage** : ventilation auto (~206) + arbitrages PO ; `source = 'taxonomy_nature_forme_20260724'`, `note` par lot ; gardes fail-closed sur les comptes (patron §187).
5. **Convergence** : boucle `api.refresh_object_filter_caches` sur les HLO affectés + refresh des 2 MV + assertions (chemins complets, `cached_taxonomy_codes`, 0 fiche publiée hors nouvelle arborescence, garde §9 = seulement les exceptions).
6. **Désactivations** : `gite_villa`, `bungalow_chalet` (0 porteur exigé, garde fail-closed).
7. **Lot 4 DATAtourisme** : ALTER + résolution + seeds + tests.
8. **Docs** : decision log §190 complété, règle d'import §8 proposée pour CLAUDE.md, MCP memory.

## 13. Limites honnêtes

- L'heuristique nom/description lit la **forme déclarée dans la prose**, pas la vérité terrain ; le PO reste l'arbitre.
- Berta n'est **pas** une autorité absolue (il mélange lui-même les axes — les 2 mouvements inverses §2c le prouvent) : c'est un signal d'arbitrage, le critère final est le fonctionnement réel (chez l'habitant + petit-déjeuner vs logement autonome).
- Les 63 CdH concordantes et les autres feuilles cohérentes ne sont pas re-auditées.
- La garde §9 dépend de `object.extra` : les fiches créées dans Bertel (sans extra Berta) ne sont couvertes que par la règle d'import §8 et le contrôle éditeur.
