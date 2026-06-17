# §17 « Rattachements organisationnels » — refonte (design)

- **Date** : 2026-06-17
- **Section éditeur** : `SectionAttachments` (num `17`), route `/objects/[id]/edit`
- **Décision PO (réponses)** :
  1. La « redondance de liaison d'acteurs » = **doublon avec §18/§19** → retirer le bloc Acteurs de §17.
  2. Ajout d'organisation = **principe de la modale** (comme les acteurs).
  3. Adhésions = **garder et seeder** un socle (campagnes annuelles + paliers simples).
  4. Couvrir l'état **« pas d'adhésion »** (non-adhérent) + le cas **« adhésion gratuite à une charte »**.
  5. Campagnes/paliers (charte incluse) = **créables à la volée** depuis l'éditeur (« create on the go »),
     pas seulement choisis dans un seed figé.

---

## 1. Contexte & état actuel (vérifié)

§17 `SectionAttachments` rend aujourd'hui, dans l'ordre :

1. `SiretCard` dérivée des `legal.records` de l'org **publisher**.
2. 3 `StatCard` : « Adhésions actives », « Organisation éditrice », « Acteurs liés ».
3. **Organisations liées** — `Repeater` sur `relationships.organizationLinks` ; bouton « Rattacher une organisation » qui prend **silencieusement** `orgOptions[0]` (opaque, non-modale).
4. **Acteurs liés — opérateurs & encadrants** — `Repeater` sur `relationships.actors` ; ajout via modale `ActorPicker`.
5. **Campagnes disponibles** — `ChipSet` (vide : 0 campagne en base).
6. **Adhésions & campagnes** — `Repeater` sur `memberships.items` ; bouton « Ajouter une adhésion » **mort** (`createMembership` renvoie `null` quand `campaignOptions`/`tierOptions`/`scopeOptions` sont vides).

### Faits live (2026-06-17)
| Élément | Valeur |
|---|---|
| `ref_code` domain `membership_campaign` | **0** |
| `ref_code` domain `membership_tier` | **0** |
| `object_membership` | **0** lignes |
| `object_org_link` | 840 lignes (tout objet a un publisher) |
| `actor_object_role` | 778 lignes |

### Contrainte de modèle (vérifiée)
`object_membership.campaign_id` **ET** `tier_id` sont **NOT NULL** : une adhésion porte toujours une
campagne **et** un palier (pas de champ « prix » ⇒ « gratuit » est porté par le code/nom, pas un montant).
⇒ une charte gratuite = **campagne + palier** comme les autres ; on ne migre PAS le modèle (pas de
`tier_id` nullable), on s'appuie sur des **défauts** + la **création à la volée**.

### La redondance, précisément
`SectionCrm` (§19) monte `ProviderCards`, documenté dans son propre en-tête comme
**« Source unique de l'authoring acteur (déplacé hors §17) »**. `ProviderCards` édite **le même
tableau `relationships.actors`** que le bloc Acteurs de §17, avec une UI plus riche (cartes avatar,
rôle, visibilité, principal-par-rôle, note, « Détacher », deep-link « Fiche CRM », modale `ActorPicker`
dans un vrai `Dialog`, helpers purs `./actor-links`). Le déménagement vers §19 a eu lieu **mais le bloc
§17 n'a jamais été supprimé**. Retirer le bloc §17 ne perd aucune fonction.

---

## 2. Cible : §17 = 100 % org-centré

§17 ne traite plus que l'**organisation** : quelles ORG publient/partenaire l'objet, et les
**adhésions OTI** (campagne/palier) de l'objet — toutes deux scoping-org. Les acteurs/prestataires
(opérateurs) restent dans §18 (Fournisseur/SIRET, lecture seule) et §19 (`ProviderCards` + suivi CRM).

Ordre cible de la section :
1. `SiretCard` org publisher — **conservée** (identité légale de l'org éditrice ; distincte du SIRET
   prestataire de §18).
2. `StatCard` ×3 : « Organisation éditrice » (publisher 1/0), « **Partenaires liés** » (org non-publisher),
   « Adhésions actives » (status `paid`).
3. **Organisations liées — publisher & partenaires** : liste + bouton **modale** `OrgPicker`.
4. **Adhésions OTI** : **état vide explicite** quand aucune adhésion (« Aucune adhésion — non rattaché
   à une campagne ni à une charte ») ; sinon liste compacte ; bouton **modale** d'ajout/édition avec
   campagne & palier **créables à la volée** (charte gratuite comprise).

---

## 3. Changements détaillés

### A. Retirer le bloc Acteurs de §17 (`SectionAttachments.tsx`)
- Supprimer : le `Repeater` acteurs, l'état `actorPickerOpen`, la modale `ActorPicker`, et les helpers
  `replaceActors` / `updateActor` / `setPrimaryActor`.
- Supprimer l'import `ActorPicker` et le label « Acteurs liés — opérateurs & encadrants ».
- `StatCard` « Acteurs liés » → « Partenaires liés » =
  `organizationLinks.filter(l => l.roleCode !== 'publisher').length`.
- **Aucun changement backend** : `relationships.actors` reste chargé/sauvé via §19 et
  `api.save_object_relations` (arme actors). On retire seulement une **2ᵉ surface d'édition**.

### B. Ajout d'organisation via modale — nouveau `widgets/OrgPicker.tsx`
- Les organisations sont un **catalogue borné** (`relationships.orgOptions`), pas une recherche serveur
  comme les acteurs ⇒ pas de RPC, **filtrage client**.
- Coquille `Dialog` / `DialogContent.object-editor` / `DialogHeader` / `DialogTitle` (identique à
  `ProviderCards`), corps réutilisant les classes `rpick` (champ de recherche + liste filtrée) pour la
  parité visuelle avec `ActorPicker`.
- Props : `{ options: ObjectWorkspaceOrgOption[]; excludeIds?: string[]; onPick: (org) => void }`.
  Exclure les org déjà liées (anti-doublon léger) ; filtrer par `name` (insensible casse/accents).
- Dans `SectionAttachments`, « Rattacher une organisation » ouvre la modale ; au `onPick`, créer la
  ligne avec rôle `publisher` par défaut (`isPrimary` = vrai si 1ʳᵉ ligne). Rôle / Principale / Note
  restent éditables **en ligne** (inchangé).
- Extraire les réducteurs de lien org en helpers purs `sections/org-links.ts`
  (`addOrgLink`, `removeOrgLink`, `setOrgRole`, `setPrimaryOrgLink`, `updateOrgLink`) — miroir de
  `actor-links.ts`, pour des tests unitaires purs.

### C. Adhésions fonctionnelles — seed socle + création à la volée + modale

**C1. Seed `ref_code` socle (data, pas DDL)** — insert idempotent, point de départ (l'utilisateur en crée
d'autres à la volée, cf. C2) :

| domain | code | name | position |
|---|---|---|---|
| `membership_campaign` | `adhesion_2025` | Adhésion 2025 | 1 |
| `membership_campaign` | `adhesion_2026` | Adhésion 2026 | 2 |
| `membership_campaign` | `charte` | Charte d'engagement | 3 |
| `membership_tier` | `membre` | Membre | 1 |
| `membership_tier` | `membre_premium` | Membre Premium | 2 |
| `membership_tier` | `partenaire` | Partenaire | 3 |
| `membership_tier` | `charte_gratuit` | Charte (gratuit) | 4 |

- Une **charte gratuite prête à l'emploi** = campagne « Charte d'engagement » + palier « Charte (gratuit) »
  (les deux étant requis NOT NULL). « Gratuit » est porté par le libellé, pas un montant.
- Codes **lowercase snake_case** (convention vérifiée : `tres_mecontent`, `demande_de_visite`).
- `INSERT … ON CONFLICT (domain, code) DO NOTHING` (vérifier le unique `(domain, code)` au plan ; sinon
  garde `NOT EXISTS`). Colonnes : `domain, code, name, position` (+ `name_normalized` pour aligner le
  dedup des RPC) ; id/`is_active`/`is_assignable`/timestamps par défaut.
- Dédié **et** ajout à `seeds_data.sql` (intégrité de déploiement) **et** application live (MCP migration) ;
  entrée `docs/SQL_ROLLOUT_RUNBOOK.md` ; test `tests/test_membership_vocab.sql`.
- Après seed : `getObjectWorkspaceMembershipModule` peuple `campaignOptions`/`tierOptions` ; `scopeOptions`
  déjà alimenté par les `object_org_link` (vérifié, l. 1995-2073) ⇒ le bloc devient utilisable.
  **Aucun changement de loader/saver requis** (complets, l. 5279-5439 ; le saver re-requête les domaines
  ref_code au save ⇒ un code créé à la volée est reconnu sans rechargement).

**C2. Création à la volée (RPC, miroir de `api.create_tag`)** — 2 fonctions `SECURITY DEFINER` :
- `api.create_membership_campaign(p_anchor_object_id text, p_name text) RETURNS jsonb`
- `api.create_membership_tier(p_anchor_object_id text, p_name text) RETURNS jsonb`

Patron exact `create_tag` (vérifié) :
- Garde **par-objet** : `PERFORM internal.workspace_assert_can_write_object(p_anchor_object_id);`
  (même autorisation que les écritures canoniques ; l'anchor = l'objet édité). Cohérent avec les tags
  (vocabulaire global créable par tout éditeur de l'objet).
- Dédup par `name_normalized = immutable_unaccent(lower(name))` **dans le domaine** ; si trouvé → renvoie
  l'existant `created:false`. Sinon `INSERT ref_code(domain, code=slug, name, name_normalized)` avec
  `gen_random_uuid()` (search_path restreint ⇒ jamais `uuid_generate_v4()`), slug snake + suffixe
  anti-collision comme `create_tag`. Renvoie `{ ref_id, code, name, created }`.
- `search_path` restreint (`pg_catalog, public, api, internal, auth`) ; `EXECUTE` à `authenticated`
  (+ `anon`/`service_role` au besoin par parité), conforme au gotcha P0.3.
- Déploiement : `api_views_functions.sql` + live + runbook + `tests/test_membership_create_rpcs.sql`
  (créer, re-créer = dédup, garde refus sans droit d'écriture).
- Service : `createMembershipCampaign(objectId, name)` / `createMembershipTier(objectId, name)` dans
  `object-workspace.ts` (wrappers `client.rpc`).

**C3. Modale d'ajout/édition** — `widgets/MembershipEditModal.tsx`
- « Ajouter une adhésion » ouvre une modale (remplace `createMembership([0]…)`). Champs : **organisation**
  (`scopeOptions`), **campagne** (combobox créable), **palier** (combobox créable), **statut**
  (`prospect|invoiced|paid|canceled|lapsed`), **début** (date, opt.).
- **Combobox créable** = patron `TagPickerModal` (vérifié) : rechercher un existant OU « Créer « X » »
  quand aucun match normalisé exact. À la création, appeler le RPC, puis ajouter l'option à
  `campaignOptions`/`tierOptions` du module (`editor.replaceModule('memberships', …)`) et la sélectionner ;
  garde « Enregistrez la fiche avant de créer » si pas d'`objectId` ; erreurs inline.
- Liste compacte (org · campagne · palier · badge statut) ; clic sur une ligne → même modale en édition ;
  bouton supprimer. Conforme à la préférence PO « vue compacte + modale pour le détail ».
- **État vide** : « Aucune adhésion — cet objet n'est rattaché à aucune campagne ni charte. » + bouton
  Ajouter (couvre le cas « pas d'adhésion »).
- Réducteurs purs `sections/membership-edit.ts` (`buildNewMembership`, `applyMembershipPatch`,
  `appendCreatedOption`) testés unitairement ; persistance inchangée (`saveObjectWorkspaceMemberships`).
- Supprimer le `ChipSet` « Campagnes disponibles » séparé (doublon visuel) ; au besoin, badges des
  campagnes souscrites en tête du bloc.

### D. Divers
- Mettre à jour `SiretCard` sub/title si besoin pour clarifier « org éditrice » vs §18 prestataire.
- Garder le `pill` publisher OK / À vérifier.

---

## 4. Fichiers touchés

**Frontend**
- `features/object-editor/sections/SectionAttachments.tsx` — refonte (retrait acteurs, modale org, modale adhésion, état vide, stat cards).
- `features/object-editor/widgets/OrgPicker.tsx` — **nouveau**.
- `features/object-editor/widgets/MembershipEditModal.tsx` — **nouveau** (combobox créables campagne/palier).
- `features/object-editor/sections/org-links.ts` — **nouveau** (réducteurs purs).
- `features/object-editor/sections/membership-edit.ts` — **nouveau** (réducteurs purs).
- `services/object-workspace.ts` — wrappers `createMembershipCampaign` / `createMembershipTier`.
- Tests : `SectionAttachments.test.tsx` (maj), `OrgPicker.test.tsx`, `MembershipEditModal.test.tsx`,
  `org-links.test.ts`, `membership-edit.test.ts` (nouveaux).

**Backend / SQL**
- `Base de donnée DLL et API/seeds_data.sql` — bloc seed membership vocab socle (idempotent).
- `Base de donnée DLL et API/api_views_functions.sql` — `api.create_membership_campaign` + `api.create_membership_tier` (DEFINER, gated, dedup).
- Fichier migration dédié (seed + 2 RPC ; nom à figer au plan) + `docs/SQL_ROLLOUT_RUNBOOK.md` + application live.
- `tests/test_membership_vocab.sql` + `tests/test_membership_create_rpcs.sql` — **nouveaux**.

**Docs**
- `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` — nouveau § (décisions + invariant « authoring acteur = §19 uniquement »).
- CLAUDE.md — note tracker §17 (org-only ; acteur single-sourcé en §19) — à proposer.

---

## 5. Plan de test (TDD)
- **Purs** : `org-links` (add/remove/role/primary/dedup), `membership-edit` (new/patch/`appendCreatedOption`/validation campagne-palier-org).
- **Composants** : `OrgPicker` (filtre, exclusion des déjà-liées, onPick) ; `MembershipEditModal` (champs requis, edit vs add, **create-on-the-go** : « Créer « X » » n'apparaît que sans match exact, sélection après création) ; `SectionAttachments` (**plus** de bloc Acteurs, ouverture modale org, ouverture modale adhésion, **état vide**, stat « Partenaires liés »).
- **SQL** : `test_membership_vocab.sql` (3 campagnes + 4 paliers, codes snake_case, charte présente) ; `test_membership_create_rpcs.sql` (création, re-création = dédup `created:false`, refus sans droit d'écriture sur l'anchor).
- **Live** : après seed, ouvrir un objet ⇒ campagnes/paliers sélectionnables + créables ; ajout d'adhésion (dont charte) persistant ; suite Jest verte ; `tsc` propre ; advisor clean.

---

## 6. Hors scope / différés
- Pas de migration du modèle `object_membership` (org-scopé vs object-scopé ; `tier_id` reste NOT NULL).
- **Gouvernance du vocabulaire adhésion** (anti-sprawl des campagnes/paliers créés à la volée) : on
  s'appuie sur le dédup `name_normalized` (comme les tags) ; pas d'UI d'admin/fusion. À surveiller.
- `actor_channel` / `actor_consent` authoring — inchangé (hors §17).
- §18 `SectionProvider` reste lecture seule (pas d'authoring acteur ajouté là — c'est §19).
- Pas de refonte de §15 (liens objet↔objet) ni §19.
- i18n des nouveaux `ref_code` (FR seul au seed/à la création, comme le reste).

---

## 7. Invariants proposés (à inscrire au log + CLAUDE.md)
> **(1) Authoring du lien acteur↔objet (`actor_object_role`) = §19 `ProviderCards` UNIQUEMENT.** §17 ne
> traite que l'organisation (`object_org_link`) et les adhésions (`object_membership`). Ne pas
> réintroduire d'édition acteur en §17 (doublon sur `relationships.actors`).
>
> **(2) Vocabulaire adhésion créable à la volée** via `api.create_membership_campaign` /
> `api.create_membership_tier` (DEFINER, gated `workspace_assert_can_write_object`, dédup
> `name_normalized` par domaine) — même patron que `api.create_tag`. Une adhésion exige toujours une
> **campagne + un palier** (`object_membership.campaign_id`/`tier_id` NOT NULL) ; « gratuit » (charte)
> est porté par le libellé, pas un montant.
