# Copier la liste d'e-mails d'une sélection — design

**Date** : 2026-08-07
**Statut** : validé PO, révisé après revue (v2), prêt pour le plan d'implémentation
**Surfaces** : barre de sélection de l'Exploreur + page d'une liste (`/listes/[id]`)

---

## 1. Le besoin

Un conseiller de l'OTI doit pouvoir écrire à un sous-ensemble de prestataires — toute la base,
les hébergements, les hébergements d'une zone — sans recomposer la liste d'adresses à la main.
Le geste cible : **un clic, le presse-papiers contient les adresses, on colle dans Gmail**.

## 2. Ce qui existe déjà (et qu'on ne rebâtit pas)

La « sélection dynamique enregistrable » est **déjà livrée** par le module Listes :

| Nature | Contenu | Créée depuis |
|---|---|---|
| `static` | membres figés (`object_list_item`) | bouton « Créer une liste » de la `SelectionBar` |
| `dynamic` | filtres Explorer en `jsonb`, **ré-résolus live** à chaque ouverture | `createDynamicList`, barre des filtres actifs |

Le seul manque est **l'extraction des e-mails** — pas le mécanisme de sélection.

Autre acquis : le bouton « Sélection » de la barre coche **tout le corpus filtré**
(il s'alimente de `api.list_object_markers`, ~113 ms), pas la page courante.

## 3. État mesuré du corpus (842 fiches `published` + `draft`, 2026-08-07)

| Source | Couverture | Nature de la donnée |
|---|---|---|
| `contact_channel` kind `email` (e-mail **de la fiche**) | **819** fiches | public — `is_public=TRUE` sur les 819 ; sort déjà par l'API partenaire |
| `actor_channel` via `actor_object_role` (e-mail du **prestataire**) | **755** fiches | **non public** — les 778 liens sont `visibility='partners'`, rôle `operator` |

Croisement : **753** ont les deux · **2** l'acteur seul · **66** la fiche seule · sur **75** fiches
l'adresse acteur **diffère** de celle de la fiche (contact personnel du gérant).

**Résultat de la cascade retenue (D1), mesuré directement** — et non déduit d'une union :
**821 fiches résolues**, **717 adresses distinctes**, **21 fiches muettes**.
L'écart 821 → 717 (~104 fiches) vient des propriétaires multi-établissements.
*Toute reprise ultérieure de ces chiffres doit re-mesurer la cascade, pas une union de sources.*

Autres mesures de cadrage :
- **840 / 842** fiches portent un lien `publisher` (1 seule ORG publisher aujourd'hui) ;
- **0** lien acteur expiré, **0** futur ;
- **0** ligne dans `actor_consent`.

## 4. Décisions

### D1 — Cascade « prestataire d'abord, fiche en repli »

Pour chaque fiche : l'e-mail principal de l'acteur `operator` valide s'il existe, **sinon**
l'e-mail principal de la fiche. Couverture **821/842**.

*Rejeté* : prestataire seul (perd 66 fiches) ; union des deux (écrit deux fois au même
établissement).

### D2 — Deux surfaces, un seul composant

La `SelectionBar` de l'Exploreur **et** la page `/listes/[id]`.

*Rejeté* : une entrée « copier les N résultats filtrés » sans sélection — redondante, puisque
« Sélection » coche déjà tout le filtre.

### D3 — Modale de contrôle, adresses nues, séparateur au choix

Une copie silencieuse ment doublement : elle tait le dédoublonnage (821 fiches → 717 adresses)
et tait les fiches laissées de côté (21). La modale annonce les trois chiffres, montre le texte
exact, et liste les fiches muettes en lien cliquable.

**Adresses nues, sans nom d'affichage** (décision PO). Seul réglage : le séparateur
`, ` (défaut Gmail) · `; ` · une par ligne.

La modale porte une phrase visible : **« Collez ces adresses dans le champ Cci, pour ne pas les
divulguer aux autres destinataires. »** La cible étant Gmail, l'oubli du Cci est le mode de
fuite le plus probable de tout ce dispositif — plus probable qu'une faille d'autorisation.

### D4 — Périmètre : les fiches dont MON organisation est publisher

**Révisé après revue.** La version initiale intersectait avec
`api.current_user_readable_object_ids()` (= publié ∪ étendu). C'était insuffisant : en
multi-organisation, un éditeur de l'ORG B pouvait fournir l'id d'une fiche **publiée** de l'ORG A
et récupérer l'e-mail `partners` de son exploitant. L'intersection avec « ce que je peux lire »
ne protège pas une donnée **non publique** — lire une fiche publiée ≠ pouvoir extraire l'adresse
personnelle de son gérant.

Le périmètre correct existe déjà : **`api.current_user_crm_object_ids()`** = les objets dont
l'ORG de l'utilisateur est `publisher` (membership actif). C'est déjà le périmètre du CRM, qui
manipule exactement les mêmes données de contact — même donnée, même portée.

Forme retenue, **set-based** (§35) :

```sql
WHERE id IN (SELECT api.current_user_crm_object_ids())
   OR api.is_platform_superuser()
```

*Écarté : créer un `current_user_email_exportable_object_ids()`.* Ce serait un troisième
concept de périmètre à maintenir en cohérence avec les deux existants, pour un ensemble
strictement identique à celui du CRM. `api.user_can_read_crm` donne déjà la forme canonique
(`is_platform_superuser() OR … IN (…)`) ; on la reprend en version ensembliste.

**Conséquence assumée** : les **2 fiches sans lien `publisher`** sortent du périmètre. C'est un
défaut de données, pas du produit — et le signaler vaut mieux que l'absorber.

### D5 — Garde d'autorisation en plus du périmètre

`canEditObjects`, même garde que le filtre Statut (§205) et la navigation (§178). Le périmètre
D4 dit *quelles fiches*, cette garde dit *quel utilisateur* : un lecteur seul de l'ORG publisher
n'exporte pas 717 adresses.

**Le masquage du bouton n'est pas la garde** : le refus vit dans le RPC.

### D6 — Liens acteur : validité temporelle

`actor_object_role` porte `valid_from` / `valid_to`. Sans garde, on peut écrire à un **ancien**
exploitant. Ajout :

```sql
AND (aor.valid_from IS NULL OR aor.valid_from <= CURRENT_DATE)
AND (aor.valid_to   IS NULL OR aor.valid_to   >= CURRENT_DATE)
```

**Honnêteté sur la portée** : 0 lien expiré et 0 lien futur en base aujourd'hui — la garde est
**prospective**, elle ne répare aucune fuite active. Elle est retenue parce qu'elle est gratuite
et que ces colonnes existent pour être utilisées.

### D7 — Consentement : pas de garde aujourd'hui, réexamen conditionné

`actor_consent` existe et couvre le canal e-mail, mais contient **0 ligne**. Il n'y a donc aucun
refus explicite à ignorer. Décision : **pas de garde consentement** pour un message opérationnel
B2B entre un office de tourisme et ses prestataires référencés.

**À rouvrir dès que la table porte sa première ligne** : un refus explicite, lui, ne doit pas
être ignoré sans arbitrage PO/juridique écrit. Bâtir la garde maintenant serait la bâtir sur un
comportement non observé.

### D8 — Liste dynamique : le RPC résout lui-même, et reste `published`-only

**Révisé après revue.** La v1 supposait que `ListComposeView` transmet ses ids déjà résolus.
Vérifié : c'est faux à deux titres.
- La signature est `api.list_effective_object_ids(p_list_id, **p_published_only**)` — le second
  paramètre n'est pas `is_dynamic`.
- Une liste **dynamique** est résolue par
  `api.resolve_list_object_ids(l.filters, p_published_only, **200**)` : **plafond de 200**.
  `get_list` pose par ailleurs `v_pub := (kind = 'dynamic')`, donc dynamique ⇒ publié seulement.

Une liste dynamique « toute la base » rouverte dans `ListComposeView` ne fournirait donc que
**200 ids** à une modale dont le RPC en accepte 2 000 — un plafond silencieux qui aurait produit
un envoi partiel sans le moindre signal.

Le RPC accepte donc **deux entrées mutuellement exclusives** : `p_object_ids` (Exploreur) **ou**
`p_list_id` (page liste). Sur `p_list_id`, il ré-autorise la liste (`api.user_can_read_list`)
puis la résout lui-même, avec la limite adaptée (`resolve_list_object_ids(filters, …, 2000)`).

**Sémantique `published`-only conservée pour les listes dynamiques** : on reste fidèle à la
sémantique actuelle du module Listes plutôt que d'introduire une divergence entre `get_list` et
l'export d'e-mails. Un éditeur qui veut joindre les exploitants de fiches en brouillon passe par
la voie Exploreur, qui les sélectionne explicitement. *Point d'arbitrage PO si la demande
inverse remonte.*

## 5. Architecture

### 5.1 RPC `api.list_selection_emails(p_object_ids text[], p_list_id uuid) RETURNS json`

`SECURITY DEFINER`, `SET search_path = pg_catalog, public, api, auth`.
Rend les lignes **brutes** ; dédoublonnage et formatage côté client, donc les réglages de la
modale ne coûtent aucun aller-retour.

Corps, dans cet ordre :

1. **Garde fail-closed (D5)**
   ```sql
   IF NOT COALESCE(api.current_user_can_edit_objects(), FALSE) THEN
     RAISE EXCEPTION 'FORBIDDEN_EMAIL_EXPORT' USING ERRCODE = '42501';
   END IF;
   ```
   Le `COALESCE` est obligatoire : la fonction est à **trois valeurs** et rend `NULL` hors
   contexte HTTP ; sans lui la branche n'est pas prise et la garde devient **fail-open** (§204).
   `ERRCODE = '42501'` + message stable : le front teste le code, jamais le texte
   (même contrat que le `FORBIDDEN` de `get_list`).

2. **Constitution de l'ensemble d'entrée** — exactement un des deux paramètres est non nul,
   sinon `RAISE EXCEPTION 'INVALID_ARGUMENT'`.
   - `p_object_ids` : `unnest(p_object_ids) WITH ORDINALITY`, ids dédoublonnés en conservant
     la **première** ordinalité. Cette ordinalité **est** l'ordre de sortie (cf. §5.3).
   - `p_list_id` : `api.user_can_read_list(p_list_id)` d'abord (sinon `42501`), puis résolution
     interne — items ordonnés par `position` pour une liste statique, `resolve_list_object_ids
     (filters, TRUE, 2000) WITH ORDINALITY` pour une dynamique (D8).
   - Plafond dur **2 000** ids : au-delà, `RAISE EXCEPTION 'TOO_MANY_OBJECTS'`. Jamais de
     troncature silencieuse — un export tronqué se lit comme un export complet.

3. **Périmètre (D4)** — intersection **avant** toute lecture de contact :
   `id IN (SELECT api.current_user_crm_object_ids()) OR api.is_platform_superuser()`.
   La fonction est exécutable par PostgREST : la liste d'ids de l'appelant n'est jamais crue.

4. **Cascade (D1)**
   - *Bras prestataire* : `actor_object_role` → `actor_channel` (kind `email`), rôle
     **`operator`**, `visibility IN ('public','partners')` — `private` exclu, un drapeau de
     visibilité se compose (§49) — et validité temporelle (D6).
     Ordre : `aor.is_primary DESC`, `ac.is_primary DESC`, `ac.position`, `ac.created_at`,
     **`ac.id`** en départage terminal.
   - *Bras fiche* : `contact_channel` kind `email`, ordre `is_primary DESC`, `position`,
     `created_at`, **`cc.id`**. Pas de filtre `is_public` — les 819 le sont, et l'appelant est
     éditeur de l'ORG publisher.

   Le filtre de rôle `operator` est gratuit aujourd'hui (100 % des liens) et ferme la porte au
   jour où un rôle `guide` apparaîtra : écrire au moniteur en croyant écrire à l'établissement
   serait une vraie erreur.

5. **Retour**
   ```json
   {
     "rows":    [{ "object_id": "…", "email": "…", "source": "actor|object", "ord": 1 }],
     "missing": [{ "object_id": "…", "name": "…" }]
   }
   ```
   `rows` est trié par `ord`. Le nom n'est conservé que sur `missing` (il vaut `object.name`) :
   il faut nommer les fiches muettes pour aller les compléter, et la sortie copiée ne contient
   que des adresses (D3).

`REVOKE ALL … FROM PUBLIC, anon` puis `GRANT EXECUTE TO authenticated, service_role` —
obligatoire sur toute fonction `DEFINER` neuve, PostgreSQL accorde `EXECUTE` à `PUBLIC` par
défaut et un `GRANT` ciblé ne le retire pas.

### 5.2 Déterminisme de l'ordre

« Dédoublonner en conservant l'ordre » n'a de sens que si le serveur **définit** cet ordre.
Sans ordre explicite, la « première occurrence » dépend du plan choisi par PostgreSQL et peut
changer d'une exécution à l'autre. D'où, de bout en bout :
`unnest … WITH ORDINALITY` en entrée → `ORDER BY ord` en sortie → départages terminaux sur
`ac.id` / `cc.id` dans chaque bras de la cascade.

### 5.3 Front

`src/services/selection-emails.ts`
- `fetchSelectionEmails({ objectIds } | { listId })` — l'appel RPC, seule partie impure.
- `dedupeEmails(rows)` — minuscules, `trim`, dédoublonnage **en conservant l'ordre `ord`**.
- `formatEmailList(emails, separator)` — les trois séparateurs.

Ces deux fonctions pures portent toute la logique, donc tout le test.

`src/components/explorer/CopyEmailsModal.tsx` — primitive `Modal` maison
(`src/components/common/Modal.tsx`), props `{ objectIds?, listId?, open, onOpenChange }` :
- ligne de compte « N fiches · M adresses · K sans e-mail » ;
- une seconde ligne **« X fiches résolues via le prestataire, Y via la fiche »** — c'est une
  répartition de **fiches**, jamais d'adresses : après dédoublonnage une même adresse peut
  provenir de plusieurs fiches et de sources différentes, un « X adresses via prestataire »
  serait faux ;
- la phrase Cci (D3) ;
- sélecteur de séparateur (3 segments, `,` par défaut) ;
- `textarea` en lecture seule, recomposé instantanément au changement de séparateur ;
- fiches muettes dans un `<details>` replié, chacune en lien vers sa fiche ;
- bouton **Copier** : état `idle → copying → copied → idle`. Le passage à « Copié » n'a lieu
  **qu'après résolution** de `navigator.clipboard.writeText` ; un rejet (permission refusée,
  contexte non sécurisé) affiche « Copie refusée par le navigateur » et laisse le `textarea`
  sélectionnable pour un Ctrl+C manuel — jamais de « Copié » sur un presse-papiers vide ;
- garde de réponse obsolète : une fermeture/réouverture rapide ne doit pas laisser la réponse
  du premier chargement écraser l'état du second (`AbortController` ou jeton de requête) ;
- sur `42501`, la modale affiche « Réservé aux éditeurs » à la place du contenu (défense en
  profondeur : le bouton est déjà masqué aux lecteurs).

Points d'entrée, même composant, **tous deux masqués si `!canEditObjects`** :
1. `SelectionBar` — bouton `Mail` « E-mails », dans le groupe qui n'apparaît qu'avec une
   sélection ; passe `objectIds`.
2. `ListComposeView` — même bouton dans la barre d'en-tête, à côté d'« Imprimer » ; passe
   **`listId`**, pas les ids résolus par la page (D8).

## 6. Plafonds assumés (à écrire dans le code)

- Une adresse partagée par plusieurs fiches est dédoublonnée en gardant la **première**
  occurrence dans l'ordre défini en §5.2.
- Les **2 fiches publiées sans coordonnées** n'ont pas de marqueur et échappent au « tout
  sélectionner » de l'Exploreur. Elles restent atteignables par sélection manuelle.
- Les **2 fiches sans lien `publisher`** sont hors périmètre (D4).
- Plafond de 2 000 ids ; au-delà, erreur explicite, jamais de troncature.
- Liste dynamique : `published`-only (D8).

## 7. Vérification

**Jest, fonctions pures** : dédoublonnage (deux fiches, une adresse → une sortie), ordre
préservé, les trois séparateurs, casse et espaces.

**Jest, modale** : comptes affichés ; libellé de répartition en *fiches* ; contenu du
`textarea` ; « Copié » **seulement** après résolution de `writeText` ; message dédié sur rejet du
presse-papiers ; réponse obsolète ignorée après fermeture/réouverture ; bouton absent **dans les
deux surfaces** (`SelectionBar` *et* `ListComposeView`) quand `canEditObjects` est faux.

**SQL, `tests/test_selection_emails.sql`, non vacant** — témoins créés dans la transaction :

| Cas | Attendu |
|---|---|
| Fiche avec acteur *et* e-mail propre | l'acteur gagne |
| Fiche avec e-mail propre seul | repli sur la fiche |
| Fiche sans aucun e-mail | apparaît dans `missing` |
| Fiche **publiée d'une ORG étrangère** | écartée par le périmètre D4 |
| Lien `operator` **expiré**, et lien **futur** | ignorés, repli sur la fiche |
| Lien `visibility='private'` | ignoré |
| Lien de rôle **non-`operator`** | ignoré |
| Ids **dupliqués** en entrée | une seule ligne, ordre déterministe et stable sur deux exécutions |
| **2 001** ids | `TOO_MANY_OBJECTS`, jamais de troncature |
| Tableau **vide** et **`NULL`** | retour vide, pas d'erreur |
| Deux paramètres fournis, ou aucun | `INVALID_ARGUMENT` |
| `p_list_id` dynamique > 200 membres | plus de 200 ids résolus (garde anti-régression du plafond D8) |
| Privilèges `PUBLIC` / `anon` / `authenticated` | `EXECUTE` révoqué sauf `authenticated`, `service_role` |

La garde D5 est éprouvée par **`request.jwt.claims`, jamais par `SET ROLE` seul** : sans JWT le
bras éditeur n'est pas emprunté et le test n'asserte que du vide — vacuité parfaite (§204).
Harnais : `{"role":"service_role"}` ⇒ éditeur ; `{"role":"authenticated"}` + `sub` inconnu ⇒
lecteur.

## 8. Hors périmètre

- Envoi d'e-mail depuis l'application (le geste reste « copier → coller dans Gmail »).
- Journalisation CRM de l'export.
- Nouveau mécanisme de sélection : les listes `static`/`dynamic` couvrent le besoin.
- Garde de consentement (D7 — table vide, à rouvrir à sa première ligne).
