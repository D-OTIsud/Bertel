# Audit des horaires d'ouverture — 2026-07-02

**Contexte.** L'import SIT a éclaté, pour une partie des objets, un unique planning hebdomadaire en N périodes « toute l'année » (une par `source_period_id`), chacune ne portant qu'un ou deux jours. Symptôme visible dans l'éditeur §14 : plusieurs « Periode » toutes marquées *Toute l'année* avec 1/7 j. chacune (ex. Le Comptoir des arts, 4 périodes).

**Méthode (équipe d'agents).** Workflow `audit-horaires-ouverture` (run `wf_292ac374-5fd`, 25 agents) :
1. **Revue** — 13 agents (lots de 10 objets) : verdict par objet (`coherent` / `merge_candidate` / `needs_review`) + planning fusionné proposé.
2. **Vérification adversariale** — 12 agents chargés de RÉFUTER chaque fusion proposée (union exacte, schedule_type uniforme, absence d'intention saisonnière, métadonnées non porteuses de sens).
3. **Contrôle mécanique indépendant** (code, hors agents) : union par jour recalculée depuis les données brutes + détection des chevauchements et des mélanges `regular`/`by_appointment`.

**Triangulation** : les 38 fusions proposées = exactement l'union mécanique (38/38, zéro écart) ; les 4 objets non fusionnés par les agents = exactement les 4 conflits mécaniques ; zéro fusion réfutée.

## Résultats (130 objets audités = tout objet ayant ≥1 période)

| Verdict | Nb | Suite donnée |
|---|---|---|
| Cohérent | 88 | rien (26 observations annexes, voir plus bas) |
| **Fusion évidente — APPLIQUÉE** | **38** | N périodes → 1 période fusionnée (2026-07-02) |
| À arbitrage humain | 4 | conflits réels, non fusionnables mécaniquement |

## Correctif appliqué (38 objets, 2026-07-02)

- Script : [opening-periods-merge-2026-07-02.sql](import-fixes/opening-periods-merge-2026-07-02.sql) — un bloc `DO` **gardé** par objet : le bloc vérifie l'état exact audité (nb de périodes + ensemble des `source_period_id`, toutes all-year non-closure) et SKIP avec `NOTICE` si l'objet a été modifié entre-temps. Rejouable sans danger (idempotent : après application, la garde ne matche plus).
- Reconstruction : 1 période `all_years` + 1 schedule (le `schedule_type` uniforme de l'objet) + un `time_period` par groupe de jours au planning identique + frames dédupliquées.
- **Traçabilité** : la période fusionnée porte `extra.merged_from_sources` (les anciens `source_period_id`) et `extra.merge_pass = 'audit-horaires-2026-07-02'`.
- **Sauvegarde complète pré-fix** : [openings-backup-2026-07-02.json](import-fixes/openings-backup-2026-07-02.json) (l'arbre opening_* des 130 objets).
- Vérifications : dry-run transactionnel (apply + validation en transaction + ROLLBACK) **puis** apply réel — 38/38 objets revalidés en base (1 période, union identique à l'attendu, 0 skip) ; ré-extraction complète post-fix (il ne reste que les 4 objets multi-périodes d'arbitrage) ; `api.refresh_open_status()` relancé pour recalculer `cached_is_open_now`.

### Les 38 objets fusionnés

| Objet | Nom | Type | Statut | Périodes avant |
|---|---|---|---|---|
| LOIRUN00000000T8 | Eric Le Forgeron | LOI | published | 2 |
| LOIRUN00000000TK | Bitasyon Bio du Souffleur d'Arbonne | PRD | draft | 2 |
| LOIRUN00000000YS | Jardin de Vandas | PRD | published | 2 |
| LOIRUN00000000ZQ | Coopérative Agricole des Huiles Essentielles de Bourbon - CAHEB | PRD | published | 2 |
| LOIRUN0000000106 | TI BRUN NATURE | LOI | published | 4 |
| LOIRUN000000010R | Escale Bleue - Atelier Vanille | LOI | published | 2 |
| LOIRUN000000010S | La maison de la tresse et du terroir | LOI | draft | 2 |
| LOIRUN000000011O | Far Far de Bézaves | PRD | published | 2 |
| LOIRUN000000015H | Natur'Run | COM | draft | 2 |
| LOIRUN000000017O | Aux Chalets du Tourneur | LOI | draft | 3 |
| RESRUN00000000NL | Le Longboard | RES | published | 2 |
| RESRUN00000000NM | La Kaz | RES | published | 2 |
| RESRUN00000000NX | Le Gadjak | RES | published | 2 |
| RESRUN00000000O1 | Le Vieux Bardeau | RES | published | 4 |
| RESRUN00000000O4 | Chez Jim | RES | published | 2 |
| RESRUN00000000OH | Snack Bigdil Family | RES | published | 3 |
| RESRUN00000000OK | L'Arbre à Palabres | RES | published | 2 |
| RESRUN00000000OS | L'Olivier | RES | published | 2 |
| RESRUN00000000P5 | Diables Ô Thym | RES | published | 3 |
| RESRUN00000000PE | Les Sens Ciel | RES | published | 2 |
| RESRUN00000000PF | Le Panoramic | RES | published | 2 |
| RESRUN00000000PP | Les Géraniums | RES | published | 2 |
| RESRUN00000000PS | La Terrasse Créole | RES | draft | 2 |
| RESRUN00000000PW | Snack Le Boi Zoly | RES | published | 2 |
| RESRUN00000000Q0 | Ô Délices | RES | published | 2 |
| RESRUN00000000UT | Restaurant des Laves | RES | published | 2 |
| RESRUN00000000UV | Le Ti Comptoir | RES | published | 4 |
| RESRUN00000000V0 | Le QG | RES | published | 3 |
| RESRUN00000000WY | Le Comptoir des arts | RES | draft | 4 |
| RESRUN00000000X0 | Restaurant La Table d'Elvina | RES | draft | 2 |
| RESRUN00000000XC | Chez Moustache et Rose-May | RES | published | 2 |
| RESRUN00000000XK | Le Macabit | RES | published | 3 |
| RESRUN00000000XM | Côté Sauvage | RES | published | 2 |
| RESRUN00000000Z1 | Djoossy's | RES | draft | 2 |
| RESRUN0000000116 | Bar A 4 | RES | published | 2 |
| RESRUN0000000117 | L'Auberge du Volcan | RES | published | 2 |
| RESRUN0000000119 | L'Impériale Pirun Pizzeria | RES | published | 2 |
| RESRUN000000017L | Casa Trattoria 23 | RES | draft | 2 |

## Les 4 objets à arbitrage humain (NON modifiés)

1. **LOIRUN00000000S5 — Le Jardin des Bestioles** (LOI, published, 2 périodes). Mélange de types : `regular` sam-dim 09:00-17:00 **et** `by_appointment` mar-dim 09:00-17:00 — sam/dim figurent dans les deux avec le même créneau mais des modalités différentes (accès libre vs sur RDV). Lecture probable : visite libre le week-end, sur RDV en semaine. Piste : UNE période avec DEUX schedules (le modèle le permet) — `regular` sam-dim + `by_appointment` mar-ven. À confirmer avec l'établissement.
2. **LOIRUN000000013T — Association des Petits Métiers** (LOI, draft, 2 périodes). Jeudi uniquement, avec deux versions contradictoires : 09:00-12:00 + 13:30-16:00 (coupure méridienne) vs 09:00-16:00 (continu). Garder probablement la version avec coupure (plus précise) ; à confirmer.
3. **RESRUN00000000R2 — Le Longanis** (RES, published, 2 périodes). Déjeuner ven/sam contradictoire : 11:00-14:00 vs 12:00-14:00 (le dîner ven/sam 19:00-21:00 n'est pas en cause ; mar-jeu + dim 12:00-14:00 sans conflit). Fusion probable : garder 11:00-14:00 (englobe) — à confirmer.
4. **RESRUN000000011A — Chez Guilaine** (RES, published, 4 périodes). Motif d'import éclaté MAIS conflit soir ven/sam/dim : 18:00-21:30 vs 18:00-20:00 (+ déjeuner 11:00-15:00 dupliqué). Fusion probable : garder 18:00-21:30 (englobe) — à confirmer.

## Observations annexes (objets cohérents, non bloquant)

- **`by_appointment` sur 15 restaurants (RES)** : Les Grands Monts, Le Relais Commerson, La Bicyclette Gourmande, Au Domaine du Vacoa, Lé Yabar - Table d'hôtes, La Mer Cassée, Le Cap Méchant, Warren Hasting, La Case Volcan, La Marmite du Pêcheur, La Ferme du Kilimandjaro, Les Hortensias, Kaz à crèpe, Les Oliviers sous le Cocotier, Au Bord de la falaise (+ Le Comptoir des arts et Les Sens Ciel côté fusionnés). Plausible pour les tables d'hôtes / « uniquement sur réservation » ; probablement un défaut de mapping d'import pour les autres. Balayage à arbitrer avec l'OTI (pas de correction automatique).
- **Frames dupliquées à l'identique dans un même schedule** (time_periods notés AM/PM) : Le Cap Méchant (12:00-15:00 ×2), La Marmite du Pêcheur (12:00-17:00 ×2), La Bicyclette Gourmande (12:00-14:00 ×2). Sans effet d'affichage majeur, nettoyage cosmétique possible.
- **Plages contiguës artificielles** (fin = début, découpage AM/PM d'import) : Canyon Aventure (08-12 + 12-16), Le Kossassa (09-12 + 12-18), Happy Time Run (07-12 + 12-21:30). Équivalentes à une plage continue ; cosmétique.
- **Sentinelle « minuit »** : EL LATINO ferme à 23:59:59 (mar-sam) — à normaliser si un jour le modèle gère l'over-midnight.
- **Horaires atypiques à confirmer auprès des établissements** : Le Plat Garni (14:00-18:00 seul créneau), Les Hortensias (dîner de 30 min 19:30-20:00 lun+dim), La Caz à Éva (2 j/7), Kakouk Tisaneur (samedi matin uniquement), Austral Taxis (amplitude 15h), Evasion Kréol (week-end seulement).

## Restauration

L'état complet pré-fix est dans [openings-backup-2026-07-02.json](import-fixes/openings-backup-2026-07-02.json). En cas de contestation sur un objet : retrouver son arbre dans le backup et le ré-écrire (les périodes fusionnées sont identifiables par `extra.merge_pass`).
