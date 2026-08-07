# Copier la liste d'e-mails d'une sélection — design

**Date** : 2026-08-07
**Statut** : v5, révisée après trois passes de revue — prête pour le plan d'implémentation
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

Autre acquis : le bouton « Sélection » coche **tout le corpus filtré**
(`api.list_object_markers`, ~113 ms), pas la page courante.

## 3. État mesuré du corpus (2026-08-07)

### 3.1 Les deux gisements

| Source | Couverture | Nature de la donnée |
|---|---|---|
| `contact_channel` kind `email` (e-mail **de la fiche**) | **819** fiches | public — `is_public=TRUE` sur les 819 ; sort déjà par l'API partenaire |
| `actor_channel` via `actor_object_role` (e-mail du **prestataire**) | **755** fiches | **non public** — les 778 liens sont `visibility='partners'`, rôle `operator` |

Croisement : **753** ont les deux · **2** l'acteur seul · **66** la fiche seule · sur **75** fiches
l'adresse acteur **diffère** de celle de la fiche (contact personnel du gérant).

### 3.2 L'entonnoir réel, mesuré bout en bout

Chiffres obtenus en exécutant la cascade **et** le filtre de périmètre D4 — pas en déduisant
une union de sources :

| Étape | Nombre |
|---|---|
| Fiches `published` + `draft` | **842** |
| … dont dans le périmètre `publisher` (D4) — **éligibles** | **840** |
| … résolues à une adresse par la cascade D1 | **821** |
| **adresses distinctes** après dédoublonnage | **717** |
| fiches **muettes** (éligibles sans aucune adresse) | **19** |

L'écart 821 → 717 (~104 fiches) vient des propriétaires multi-établissements.
Les 2 fiches hors périmètre étaient déjà muettes, d'où 19 et non 21.

*Toute reprise ultérieure de ces chiffres doit re-mesurer l'entonnoir complet — une union de
sources donne 811, ce qui est faux pour la cascade.*

### 3.3 Cadrage complémentaire

- **840 / 842** fiches portent un lien `publisher` ; **1 seule ORG** publisher aujourd'hui.
- **0** lien acteur expiré, **0** futur.
- **0** ligne dans `actor_consent`.
- Les listes statiques existantes ne contiennent aujourd'hui que des objets `published`.

## 4. Décisions

### D1 — Cascade « prestataire d'abord, fiche en repli »

Pour chaque fiche : l'e-mail principal de l'acteur `operator` valide et non refusé s'il existe,
**sinon** l'e-mail principal de la fiche. Couverture **821 / 840 éligibles**.

*Rejeté* : prestataire seul (perd 66 fiches) ; union des deux (écrit deux fois au même
établissement).

### D2 — Deux surfaces, un seul composant

La `SelectionBar` de l'Exploreur **et** la page `/listes/[id]`.

*Rejeté* : une entrée « copier les N résultats filtrés » sans sélection — redondante, puisque
« Sélection » coche déjà tout le filtre.

### D3 — Modale de contrôle, adresses nues, séparateur au choix

Une copie silencieuse ment trois fois : elle tait le périmètre écarté (2 fiches), le
dédoublonnage (821 → 717) et les fiches muettes (19). La modale annonce les quatre chiffres,
montre le texte exact, et liste les fiches muettes en lien cliquable.

**Adresses nues, sans nom d'affichage** (décision PO). Seul réglage : le séparateur
`, ` (défaut Gmail) · `; ` · une par ligne.

La modale porte une phrase visible : **« Collez ces adresses dans le champ Cci, pour ne pas les
divulguer aux autres destinataires. »** La cible étant Gmail, l'oubli du Cci est le mode de
fuite le plus probable de tout ce dispositif — plus probable qu'une faille d'autorisation.

### D4 — Périmètre : les fiches dont MON organisation est publisher

La v1 intersectait avec `api.current_user_readable_object_ids()` (= publié ∪ étendu).
Insuffisant : en multi-organisation, un éditeur de l'ORG B fournissait l'id d'une fiche
**publiée** de l'ORG A et récupérait l'e-mail `partners` de son exploitant. Lire une fiche
publiée ≠ pouvoir extraire l'adresse personnelle de son gérant.

Périmètre retenu — il existe déjà : **`api.current_user_crm_object_ids()`** = les objets dont
l'ORG de l'utilisateur est `publisher` (membership actif). C'est déjà le périmètre du CRM, qui
manipule exactement les mêmes données de contact.

Forme **set-based** (§35) :

```sql
WHERE id IN (SELECT api.current_user_crm_object_ids())
   OR api.is_platform_superuser()
```

*Écarté : créer un `current_user_email_exportable_object_ids()`* — un troisième concept de
périmètre à maintenir pour un ensemble identique à celui du CRM.

**Le périmètre écarté est rendu, pas absorbé** (cf. §5.1 étape 5) : `requested_count` /
`eligible_count` / `excluded_count`. Une fiche silencieusement retirée d'un export se lit
comme une fiche sans e-mail — deux causes différentes, deux actions correctives différentes.

### D5 — Garde d'autorisation en plus du périmètre

`canEditObjects`, même garde que le filtre Statut (§205) et la navigation (§178). Le périmètre
D4 dit *quelles fiches*, cette garde dit *quel utilisateur* : un lecteur seul de l'ORG publisher
n'exporte pas 717 adresses.

**Le masquage du bouton n'est pas la garde** : le refus vit dans le RPC.

### D6 — Liens acteur : validité temporelle

`actor_object_role` porte `valid_from` / `valid_to`. Sans garde, on écrit à un **ancien**
exploitant :

```sql
AND (aor.valid_from IS NULL OR aor.valid_from <= CURRENT_DATE)
AND (aor.valid_to   IS NULL OR aor.valid_to   >= CURRENT_DATE)
```

**Portée honnête** : 0 lien expiré et 0 futur en base — la garde est **prospective**, elle ne
répare aucune fuite active. Retenue parce qu'elle est gratuite et que ces colonnes existent
pour être utilisées.

### D7 — Un refus de consentement explicite est honoré dès maintenant

`actor_consent (actor_id, channel, consent_given)` couvre le canal `email` et contient
**0 ligne**. Deux options étaient sur la table : ne rien faire en promettant de « rouvrir à la
première ligne », ou poser un test qui rougit à l'apparition d'une ligne.

**Les deux sont écartées.** La première repose sur une vigilance humaine que rien ne garantit ;
la seconde rougit sur une donnée parfaitement légitime et sera désarmée au premier passage.
Le bras prestataire exclut donc **dès maintenant** un refus explicite :

```sql
AND NOT EXISTS (
  SELECT 1 FROM actor_consent ac2
  WHERE ac2.actor_id = aor.actor_id
    AND ac2.channel = 'email'
    AND ac2.consent_given = FALSE)
```

Vacant aujourd'hui, correct pour toujours, et ne repose sur la vigilance de personne.

**Portée du refus** : il coupe le **bras prestataire uniquement**. Le repli sur l'adresse de la
fiche reste licite — c'est l'adresse professionnelle publique de l'établissement, pas celle de
la personne, et elle sort déjà par l'API partenaire. Un gérant qui refuse d'être contacté
personnellement n'a pas retiré l'établissement de l'annuaire.

*Ce qui reste hors périmètre* : l'absence de consentement (pas de ligne du tout) ne bloque
rien — message opérationnel B2B entre un office de tourisme et ses prestataires référencés.

### D8 — Liste dynamique : le RPC résout lui-même, à 2 001

La v1 supposait que `ListComposeView` transmet ses ids déjà résolus. Vérifié, c'est faux à
trois titres :

- la signature est `api.list_effective_object_ids(p_list_id, **p_published_only**)` — le second
  paramètre n'est pas `is_dynamic` ;
- une liste **dynamique** est résolue par `api.resolve_list_object_ids(l.filters, …, 200)` ;
- ce helper **replafonne lui-même** :
  `v_lim := LEAST(GREATEST(COALESCE(p_limit,200),1), 200)` — demander 2 000 rend 200.

Une liste dynamique « toute la base » aurait donc fourni **200 ids** à une modale affichant un
compte crédible : un envoi partiel sans le moindre signal.

**Correctif écarté après revue : ne PAS relever le plafond de `api.resolve_list_object_ids`.**
Cette fonction est `SECURITY DEFINER`, exposée en RPC PostgREST et **`GRANT EXECUTE … TO
authenticated`**. Elle délègue à `api.get_filtered_object_ids`, qui lit `FROM object o` **sans
intersection avec l'ensemble lisible** sur son chemin vif. Un utilisateur authentifié peut donc
l'appeler en direct avec `p_published_only = false` et obtenir des ids d'objets hors de son
périmètre. Relever son plafond de 200 à 2 001 multiplierait par dix une exposition existante —
inacceptable pour un besoin qui ne la requiert pas (cf. §9, constat pré-existant).

**Correctif retenu — extraire le moteur, garder le contrat public inchangé :**

1. `internal.resolve_list_object_ids(p_buckets, p_published_only, p_limit)` — le moteur actuel,
   déplacé tel quel, plafond interne **2 001**. Non exposé (schéma `internal`),
   `REVOKE ALL … FROM PUBLIC, anon, authenticated`.
2. `api.resolve_list_object_ids(...)` — devient un mince passe-plat qui appelle le moteur en
   **replafonnant à 200** (`LEAST(GREATEST(COALESCE(p_limit,200),1), 200)`). Contrat public,
   grants et comportement strictement inchangés.
3. Appelants du moteur : `list_effective_object_ids` (module Listes) avec **200**,
   `list_selection_emails` avec **2 001**.

Aucune duplication de `get_filtered_object_ids` — une seule source de vérité — et la variante
haute capacité n'est joignable qu'en `internal`, donc jamais directement par PostgREST.

*Précision sur l'ordre* : au moment où le moteur est appelé, seule **D5** (garde éditeur, étape 1)
est appliquée ; **D4** (périmètre) l'est à l'étape 3, après. La sûreté ne repose donc pas sur
« le périmètre est déjà posé » mais sur deux faits : le moteur n'est pas appelable de
l'extérieur, et **aucune donnée de contact n'est lue avant D4** — le moteur ne rend que des ids,
qui sont ensuite filtrés.

*Écarté* : une résolution dédiée dupliquant `get_filtered_object_ids` (deuxième source de
vérité) ; relever le **défaut** à 2 000 (changerait le comportement du module livré).

**Pourquoi 2 001 et non 2 000** : demander exactement le plafond ne permet pas de distinguer
« exactement 2 000 » de « plus de 2 000 ». On demande N+1 et on lève `TOO_MANY_OBJECTS` si la
2 001ᵉ ligne existe. Jamais de troncature silencieuse.

**Sémantique `published`-only conservée pour les listes dynamiques** : fidélité à la sémantique
actuelle du module plutôt qu'une divergence entre `get_list` et l'export. Un éditeur qui veut
joindre les exploitants de fiches en brouillon passe par l'Exploreur, qui les sélectionne
explicitement. *Point d'arbitrage PO si la demande inverse remonte.*

### D9 — `archived` et `hidden` sont exclus, y compris en liste statique

Le besoin porte sur `published` + `draft`. Or la branche statique de
`list_effective_object_ids` ne filtre le statut que si `p_published_only` est vrai : une fiche
archivée conservée dans une vieille liste statique passerait. Le RPC exclut donc explicitement
`archived` et `hidden`, quelle que soit l'entrée.

Vacant aujourd'hui (les listes statiques ne contiennent que du `published`) — mais une liste
statique est faite pour vieillir, c'est précisément le cas qui se produira.

## 5. Architecture

### 5.1 RPC `api.list_selection_emails`

```sql
api.list_selection_emails(
  p_object_ids text[] DEFAULT NULL,
  p_list_id    uuid   DEFAULT NULL
) RETURNS json
```

`SECURITY DEFINER`, `SET search_path = pg_catalog, public, api, auth`.
Les deux paramètres ont un défaut : l'appelant PostgREST n'envoie que la clé qui le concerne.
Rend les lignes **brutes** ; dédoublonnage et formatage côté client, donc les réglages de la
modale ne coûtent aucun aller-retour.

Corps, dans cet ordre :

**1. Garde fail-closed (D5)**

```sql
IF NOT COALESCE(api.current_user_can_edit_objects(), FALSE) THEN
  RAISE SQLSTATE '42501' USING MESSAGE = 'FORBIDDEN_EMAIL_EXPORT';
END IF;
```

Le `COALESCE` est obligatoire : la fonction est à **trois valeurs** et rend `NULL` hors contexte
HTTP ; sans lui la branche n'est pas prise et la garde devient **fail-open** (§204).

**Contrat d'erreur — un SQLSTATE distinct par cas.** Un `RAISE EXCEPTION 'TEXTE'` nu produit
toujours `P0001` : les trois erreurs métier seraient indiscernables et le front n'aurait plus
que le texte du message pour brancher. PostgREST mappe les SQLSTATE de la forme `PTxyz` sur le
statut HTTP `xyz` et expose le SQLSTATE dans `error.code`, d'où :

| Cas | SQLSTATE | HTTP | `MESSAGE` |
|---|---|---|---|
| Garde éditeur | `42501` | 403 | `FORBIDDEN_EMAIL_EXPORT` |
| Lecture de liste refusée | `42501` | 403 | `FORBIDDEN` |
| Plus de 2 000 fiches | `PT413` | 413 | `TOO_MANY_OBJECTS` |
| Liste inexistante | `PT404` | 404 | `LIST_NOT_FOUND` |
| Paramètres invalides | `PT400` | 400 | `INVALID_ARGUMENT` |

`42501` (`insufficient_privilege`) est conservé pour les deux refus d'autorisation : c'est un
code PostgreSQL réel, il mappe déjà sur 403, et c'est le contrat du `FORBIDDEN` de `get_list`.
Le front branche sur **`error.code`** ; le `MESSAGE` sert au diagnostic et aux logs.

**2. Constitution de l'ensemble demandé**

Exactement un des deux paramètres est non nul, sinon
`RAISE SQLSTATE 'PT400' USING MESSAGE = 'INVALID_ARGUMENT'`.
Un tableau **vide** (`'{}'`) est une demande valide et rend un résultat vide — c'est `NULL` des
deux côtés qui est une erreur d'appel.

- `p_object_ids` : plafond vérifié sur **`cardinality(p_object_ids)` AVANT `unnest`** — un
  immense tableau de doublons ne doit pas être déplié pour être ensuite réduit. Puis
  `unnest(…) WITH ORDINALITY`, ids dédoublonnés en conservant la **première** ordinalité, qui
  **est** l'ordre de sortie (§5.2).
- `p_list_id` : **charger la ligne AVANT d'autoriser**, sinon les deux erreurs se confondent —
  `api.user_can_read_list` est `is_platform_superuser() OR EXISTS(…)`, donc sur une liste
  supprimée un non-superuser reçoit `FALSE` (⇒ `42501`, jamais `PT404`) et un superuser reçoit
  `TRUE` puis travaille sur une ligne NULL :

  ```sql
  SELECT * INTO v_list FROM public.object_list WHERE id = p_list_id;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PT404' USING MESSAGE = 'LIST_NOT_FOUND';
  END IF;
  IF NOT COALESCE(api.user_can_read_list(p_list_id), FALSE) THEN
    RAISE SQLSTATE '42501' USING MESSAGE = 'FORBIDDEN';
  END IF;
  ```

  *Compromis assumé* : cet ordre révèle l'existence d'une liste à qui ne peut pas la lire.
  Acceptable — les ids sont des UUID v4 non devinables, donc l'oracle n'est pas énumérable, et
  le gain (une erreur juste au lieu d'un refus trompeur) dépasse le signal cédé.

  Puis résolution interne :
  - statique — `object_list_item ORDER BY position **LIMIT 2001**`. La borne est posée **dans
    la lecture**, pas après : une liste statique n'a pas de plafond de composition, rien ne
    garantit qu'elle tienne en mémoire avant d'être comptée ;
  - dynamique — `internal.resolve_list_object_ids(filters, TRUE, 2001) WITH ORDINALITY` (D8).
- Au-delà de **2 000** ids (ou si la 2 001ᵉ ligne existe) :
  `RAISE SQLSTATE 'PT413' USING MESSAGE = 'TOO_MANY_OBJECTS'`. Jamais de troncature — un export
  tronqué se lit comme un export complet.

**3. Périmètre et statut** — **avant** toute lecture de contact :

```sql
WHERE (id IN (SELECT api.current_user_crm_object_ids()) OR api.is_platform_superuser())
  AND status NOT IN ('archived','hidden')          -- D9
```

La fonction est exécutable par PostgREST : la liste d'ids de l'appelant n'est jamais crue.
Le nombre de lignes retenues ici donne `eligible_count`.

**4. Cascade (D1)**

- *Bras prestataire* : `actor_object_role` → `actor_channel` (kind `email`), rôle
  **`operator`**, `visibility IN ('public','partners')` — `private` exclu, un drapeau de
  visibilité se compose (§49) — validité temporelle (D6) et absence de refus (D7).
  Ordre : `aor.is_primary DESC **NULLS LAST**`, `ac.is_primary DESC **NULLS LAST**`,
  `ac.position NULLS LAST`, `ac.created_at`, **`ac.id`** en départage terminal.
- *Bras fiche* : `contact_channel` kind `email`, ordre `cc.is_primary DESC **NULLS LAST**`,
  `cc.position NULLS LAST`, `cc.created_at`, **`cc.id`**. Pas de filtre `is_public` — les 819
  le sont, et l'appelant est éditeur de l'ORG publisher.

Les `NULLS LAST` ne sont pas cosmétiques : `is_primary` est **nullable** et `DESC` place les
`NULL` **en premier** par défaut en PostgreSQL — sans eux, un canal au drapeau non renseigné
passerait devant le canal explicitement principal.

Le filtre de rôle `operator` est gratuit aujourd'hui (100 % des liens) et ferme la porte au jour
où un rôle `guide` apparaîtra : écrire au moniteur en croyant écrire à l'établissement serait
une vraie erreur.

**5. Retour**

```json
{
  "requested_count": 842,
  "eligible_count":  840,
  "excluded_count":    2,
  "rows":    [{ "object_id": "…", "email": "…", "source": "actor|object", "ord": 1 }],
  "missing": [{ "object_id": "…", "name": "…" }]
}
```

`rows` **et `missing`** sont triés par `ord` — `ord` n'est pas exposé sur les objets `missing`,
mais l'ordre de la liste des fiches muettes doit rester celui de la sélection, sinon la liste
dépliable de la modale se réordonne d'une ouverture à l'autre sans raison visible.
`missing` ne contient que des fiches **éligibles** sans adresse — une
fiche hors périmètre n'y figure pas, elle est comptée dans `excluded_count`. Le nom n'est
conservé que sur `missing` (il vaut `object.name`) : il faut nommer les fiches muettes pour
aller les compléter, et la sortie copiée ne contient que des adresses (D3).

`REVOKE ALL … FROM PUBLIC, anon` puis `GRANT EXECUTE TO authenticated, service_role` —
obligatoire sur toute fonction `DEFINER` neuve, PostgreSQL accorde `EXECUTE` à `PUBLIC` par
défaut et un `GRANT` ciblé ne le retire pas.

### 5.2 Déterminisme de l'ordre

« Dédoublonner en conservant l'ordre » n'a de sens que si le serveur **définit** cet ordre.
Sans ordre explicite, la « première occurrence » dépend du plan choisi par PostgreSQL et peut
changer d'une exécution à l'autre. D'où, de bout en bout : `unnest … WITH ORDINALITY` en entrée
→ `ORDER BY ord` en sortie → départages terminaux sur `ac.id` / `cc.id` dans chaque bras.

### 5.3 Front

`src/services/selection-emails.ts`
- `fetchSelectionEmails({ objectIds } | { listId })` — l'appel RPC, seule partie impure.
- `dedupeEmails(rows)` — minuscules, `trim`, dédoublonnage **en conservant l'ordre `ord`**.
- `formatEmailList(emails, separator)` — les trois séparateurs.

Ces deux fonctions pures portent toute la logique, donc tout le test.

`src/components/explorer/CopyEmailsModal.tsx` — primitive `Modal` maison
(`src/components/common/Modal.tsx`), props `{ objectIds?, listId?, open, onOpenChange }` :

- ligne de compte : **« 840 fiches éligibles sur 842 · 717 adresses · 19 sans e-mail »**, la
  mention « sur 842 » n'apparaissant que si `excluded_count > 0` ;
- une seconde ligne **« X fiches résolues via le prestataire, Y via la fiche »** — répartition
  de **fiches**, jamais d'adresses : après dédoublonnage une même adresse peut provenir de
  plusieurs fiches et de sources différentes, un « X adresses via prestataire » serait faux ;
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
- **contrat d'erreur** — la modale branche sur **`error.code`** (le SQLSTATE, cf. §5.1 étape 1),
  jamais sur le texte :

| `error.code` | Message affiché à la place du contenu |
|---|---|
| `42501` | « Réservé aux éditeurs. » — défense en profondeur, le bouton est déjà masqué aux lecteurs |
| `PT413` | « Sélection trop large (plus de 2 000 fiches). Affinez le filtre, ou copiez en deux fois. » |
| `PT404` | « Cette liste n'existe plus. » |
| `PT400` | « Une erreur technique empêche la copie. » — bug d'appel, jamais provoquable par l'utilisateur ; le détail va en console, pas à l'écran |
| autre / réseau | « Chargement impossible. » + bouton Réessayer |

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
- Les **2 fiches sans lien `publisher`** sont hors périmètre — **comptées et affichées**, pas
  absorbées (D4).
- Plafond de 2 000 ids ; au-delà, erreur explicite, jamais de troncature.
- Liste dynamique : `published`-only (D8). `archived` / `hidden` toujours exclus (D9).

## 7. Vérification

**Jest, fonctions pures** : dédoublonnage (deux fiches, une adresse → une sortie), ordre
préservé, les trois séparateurs, casse et espaces.

**Jest, modale** : les quatre compteurs, dont la mention « sur N » qui n'apparaît qu'avec des
exclus ; libellé de répartition en *fiches* ; contenu du `textarea` ; « Copié » **seulement**
après résolution de `writeText` ; message dédié sur rejet du presse-papiers ; réponse obsolète
ignorée après fermeture/réouverture ; bouton absent **dans les deux surfaces**
(`SelectionBar` *et* `ListComposeView`) quand `canEditObjects` est faux.

**SQL, `tests/test_selection_emails.sql`, non vacant** — témoins créés dans la transaction :

| Cas | Attendu |
|---|---|
| Fiche avec acteur *et* e-mail propre | l'acteur gagne |
| Fiche avec e-mail propre seul | repli sur la fiche |
| Fiche éligible sans aucun e-mail | apparaît dans `missing` |
| Fiche **publiée d'une ORG étrangère** | écartée par D4, comptée dans `excluded_count`, **absente de `missing`** |
| Lien `operator` **expiré**, et lien **futur** | ignorés, repli sur la fiche |
| Lien `visibility='private'` | ignoré |
| Lien de rôle **non-`operator`** | ignoré |
| Acteur avec `actor_consent(email, FALSE)` | bras prestataire coupé, **repli sur l'e-mail de la fiche** |
| `is_primary` **NULL** face à un `is_primary` TRUE | le TRUE gagne (garde du `NULLS LAST`) |
| Fiche `archived` / `hidden` dans une liste statique | exclue (D9) |
| Ids **dupliqués** en entrée | une seule ligne, ordre déterministe et stable sur deux exécutions |
| **2 001** ids | `PT413` / `TOO_MANY_OBJECTS`, jamais de troncature |
| `p_object_ids = '{}'` | retour vide, pas d'erreur |
| `p_object_ids` **et** `p_list_id` tous deux `NULL`, ou tous deux fournis | `PT400` / `INVALID_ARGUMENT` |
| `p_list_id` dynamique de **plus de 200** membres | plus de 200 ids résolus — garde anti-régression du plafond D8 |
| `get_list` sur la même liste dynamique | **toujours 200** — garde de non-régression du module Listes |
| `api.resolve_list_object_ids(…, 2001)` appelé **en tant qu'`authenticated`** | **toujours 200** — le contrat public reste plafonné (D8) |
| `internal.resolve_list_object_ids` appelé en tant qu'`authenticated` | `EXECUTE` refusé |
| Liste inexistante, appelee par un NON-superuser | `PT404`, jamais `42501` (ordre charger-puis-autoriser) |
| Liste inexistante, appelee par un superuser | `PT404`, pas un plantage sur ligne NULL |
| Privilèges `PUBLIC` / `anon` / `authenticated` sur `list_selection_emails` | `EXECUTE` révoqué sauf `authenticated`, `service_role` |

La garde D5 est éprouvée par **`request.jwt.claims`, jamais par `SET ROLE` seul** : sans JWT le
bras éditeur n'est pas emprunté et le test n'asserte que du vide — vacuité parfaite (§204).
Harnais : `{"role":"service_role"}` ⇒ éditeur ; `{"role":"authenticated"}` + `sub` inconnu ⇒
lecteur.

## 8. Hors périmètre

- Envoi d'e-mail depuis l'application (le geste reste « copier → coller dans Gmail »).
- Journalisation CRM de l'export.
- Nouveau mécanisme de sélection : les listes `static`/`dynamic` couvrent le besoin.
- Pagination au-delà de 2 000 fiches (le plafond lève une erreur explicite).
- La fermeture du RPC public `api.resolve_list_object_ids` (§9).

## 9. Constat pré-existant, hors périmètre — `api.resolve_list_object_ids` non borné au lisible

Découvert en instruisant D8, **antérieur à cette fonctionnalité et non causé par elle** :

`api.resolve_list_object_ids(jsonb, boolean, int)` est `SECURITY DEFINER`, exposé en RPC
PostgREST et `GRANT EXECUTE … TO authenticated`. Il délègue à `api.get_filtered_object_ids`,
dont le chemin vif lit `FROM object o` **sans intersection avec l'ensemble lisible**. Un
utilisateur authentifié peut donc l'appeler directement avec `p_published_only = false` et
obtenir jusqu'à **200 ids** d'objets hors de son périmètre.

**Portée réelle** : des identifiants d'objets, pas de contenu ni de PII — la lecture des
données de ces objets reste gated par RLS et par les RPC. L'information qui fuit est
« quelles fiches non publiées existent », pas leur contenu.

**Pourquoi ce n'est pas corrigé ici** : refermer ce RPC signifie ajouter l'intersection lisible
à une fonction du module Listes déjà en production, dont les effets sur `get_list` et
`list_my_lists` doivent être mesurés — un chantier distinct de l'export d'e-mails. La présente
spec se contente de **ne pas l'aggraver** (D8 : le contrat public reste à 200, la variante
2 001 vit dans `internal`).

**Arbitrage attendu** : à porter au journal de décisions et à la liste des différés, avec pour
correctif pressenti l'ajout de
`AND object_id IN (SELECT api.current_user_readable_object_ids())` dans le passe-plat public —
à valider contre le comportement attendu de `get_list` pour un membre de l'ORG propriétaire.
