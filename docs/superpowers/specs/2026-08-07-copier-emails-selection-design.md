# Copier la liste d'e-mails d'une sélection — design

**Date** : 2026-08-07
**Statut** : validé PO, prêt pour le plan d'implémentation
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

`api.list_effective_object_ids(list_id, is_dynamic)` résout une liste en ids d'objets.
Le seul manque est donc **l'extraction des e-mails** — pas le mécanisme de sélection.

Autre acquis utile : le bouton « Sélection » de la barre coche **tout le corpus filtré**
(il s'alimente de `api.list_object_markers`, ~113 ms pour tout le corpus), pas la page courante.
« Écrire à toute la base » tient déjà en un clic de sélection.

## 3. État mesuré du corpus (842 fiches `published` + `draft`, 2026-08-07)

| Source | Couverture | Nature de la donnée |
|---|---|---|
| `contact_channel` kind `email` (e-mail **de la fiche**) | **819** fiches | public — `is_public=TRUE` sur les 819 ; sort déjà par l'API partenaire |
| `actor_channel` via `actor_object_role` (e-mail du **prestataire**) | **755** fiches | **non public** — les 778 liens sont `visibility='partners'`, rôle `operator` |

Croisement : **753** fiches ont les deux · **2** n'ont que l'acteur · **66** n'ont que la fiche ·
sur **75** fiches l'adresse acteur **diffère** de celle de la fiche (contact personnel du gérant).
Union dédoublonnée : **811** adresses distinctes.

C'est ce comptage — et non une intuition — qui a tranché la règle de source ci-dessous.

## 4. Décisions

### D1 — Cascade « prestataire d'abord, fiche en repli »

Pour chaque fiche : l'e-mail principal de l'acteur `operator` s'il existe, **sinon** l'e-mail
principal de la fiche. Couverture **821/842**.

*Rejeté* : prestataire seul (perd 66 fiches, soit 8 % de la base sur un envoi général) ;
union des deux (811 adresses, mais écrit deux fois au même établissement).

### D2 — Deux surfaces, un seul composant

La `SelectionBar` de l'Exploreur **et** la page `/listes/[id]`. Sur une liste dynamique les
ids passés sont les membres **recalculés à l'ouverture** : c'est le « je rouvre ma sélection
enregistrée et je copie ».

*Rejeté* : une entrée « copier les N résultats filtrés » sans sélection — redondante, puisque
« Sélection » coche déjà tout le filtre ; un bouton de plus dans une barre déjà dense.

### D3 — Modale de contrôle, adresses nues, séparateur au choix

Une copie silencieuse ment doublement : elle tait le dédoublonnage (842 fiches → 811 adresses)
et tait les fiches laissées de côté (21). La modale annonce les trois chiffres, montre le texte
exact, et liste les fiches muettes en lien cliquable — l'outil devient une boucle de qualité de
données, pas seulement un presse-papiers.

**Adresses nues, sans nom d'affichage** (décision PO). Le seul réglage est le séparateur :
`, ` (défaut, ce qu'attend Gmail) · `; ` · une par ligne.

### D4 — Réservé aux éditeurs, garde côté serveur

L'e-mail du prestataire est une donnée personnelle **non publique** (`visibility='partners'`).
Garde `canEditObjects`, la même que le filtre Statut (§205) et la navigation (§178).

**Le masquage du bouton n'est pas la garde** : le refus vit dans le RPC.

*Rejeté* : accès à tout utilisateur connecté (un lecteur seul exporterait 811 adresses de
prestataires) ; garde à deux niveaux rendant deux listes différentes selon l'appelant sans le
dire — le « magic fallback » que le projet proscrit.

## 5. Architecture

### 5.1 RPC `api.list_selection_emails(p_object_ids text[]) RETURNS json`

`SECURITY DEFINER`, `SET search_path = pg_catalog, public, api, auth`.
Rend les lignes **brutes** ; dédoublonnage et formatage sont faits côté client, donc les
réglages de la modale ne coûtent aucun aller-retour.

Corps, dans cet ordre :

1. **Garde fail-closed**
   `IF NOT COALESCE(api.current_user_can_edit_objects(), FALSE) THEN RAISE EXCEPTION 'FORBIDDEN_EMAIL_EXPORT'`.
   Le `COALESCE` est obligatoire : la fonction est à **trois valeurs** et rend `NULL` hors
   contexte HTTP ; sans lui la branche n'est pas prise et la garde devient **fail-open** (§204).
2. **Authorize-once (§36)** — intersection avec `api.current_user_readable_object_ids()`
   **avant** toute lecture. La fonction est exécutable par PostgREST : la liste d'ids de
   l'appelant n'est jamais crue. Plafond dur : 2 000 ids.
3. **Cascade (D1)**
   - *Bras prestataire* : `actor_object_role` → `actor_channel` (kind `email`), restreint au
     rôle **`operator`** et à `visibility IN ('public','partners')` — `private` exclu, un
     drapeau de visibilité se compose (§49). Ordre : lien primaire, canal primaire, `position`,
     `created_at`. Le filtre de rôle ne coûte rien aujourd'hui (100 % `operator`) et ferme la
     porte au jour où un rôle `guide` apparaîtra : écrire au moniteur en croyant écrire à
     l'établissement serait une vraie erreur.
   - *Bras fiche* : `contact_channel` kind `email`, ordre `is_primary DESC`, `position`,
     `created_at`. Pas de filtre `is_public` — les 819 le sont, et l'appelant est éditeur.
4. **Retour**
   ```json
   {
     "rows":    [{ "object_id": "…", "email": "…", "source": "actor|object" }],
     "missing": [{ "object_id": "…", "name": "…" }]
   }
   ```
   Le nom n'est conservé que sur `missing` (il vaut `object.name`) : il faut nommer les fiches
   muettes pour aller les compléter, et la sortie copiée ne contient que des adresses (D3).

   En cas de `FORBIDDEN_EMAIL_EXPORT`, la modale affiche « Réservé aux éditeurs » à la place du
   contenu — c'est un chemin de défense en profondeur, le bouton étant déjà masqué aux lecteurs.

`REVOKE ALL … FROM PUBLIC, anon` puis `GRANT EXECUTE TO authenticated, service_role` —
obligatoire sur toute fonction `DEFINER` neuve, PostgreSQL accorde `EXECUTE` à `PUBLIC`
par défaut et un `GRANT` ciblé ne le retire pas.

### 5.2 Front

`src/services/selection-emails.ts`
- `fetchSelectionEmails(ids)` — l'appel RPC, seule partie impure.
- `dedupeEmails(rows)` — minuscules, `trim`, dédoublonnage **en conservant l'ordre**.
- `formatEmailList(emails, separator)` — les trois séparateurs.

Ces deux fonctions pures portent toute la logique, donc tout le test.

`src/components/explorer/CopyEmailsModal.tsx` — primitive `Modal` maison
(`src/components/common/Modal.tsx`), props `{ objectIds, open, onOpenChange }` :
- ligne de compte « N fiches · M adresses · K sans e-mail » + répartition prestataire/fiche ;
- sélecteur de séparateur (3 segments, `,` par défaut) ;
- `textarea` en lecture seule, recomposé instantanément au changement de séparateur ;
- fiches muettes dans un `<details>` replié, chacune en lien vers sa fiche ;
- bouton **Copier** (`navigator.clipboard.writeText`), bascule « Copié » puis se réarme.

Points d'entrée, même composant :
1. `SelectionBar` — bouton `Mail` « E-mails », dans le groupe qui n'apparaît qu'avec une
   sélection, rendu seulement si `canEditObjects`.
2. `ListComposeView` — même bouton dans la barre d'en-tête, à côté d'« Imprimer », alimenté
   par les ids des items déjà résolus par la page.

## 6. Plafonds assumés (à écrire dans le code)

- Une adresse partagée par plusieurs fiches est dédoublonnée en gardant la **première**
  occurrence.
- Les **2 fiches publiées sans coordonnées** n'ont pas de marqueur et échappent donc au
  « tout sélectionner » de l'Exploreur. Elles restent atteignables par sélection manuelle.
- Plafond de 2 000 ids par appel.

## 7. Vérification

- **Jest, fonctions pures** : dédoublonnage (deux fiches, une adresse → une sortie), les trois
  séparateurs, casse et espaces.
- **Jest, modale** : comptes affichés, contenu du `textarea`, bouton absent de la
  `SelectionBar` quand `canEditObjects` est faux.
- **SQL, `tests/test_selection_emails.sql`, non vacant** : témoins créés dans la transaction —
  fiche avec acteur *et* e-mail propre (l'acteur gagne), fiche avec e-mail propre seul (repli),
  fiche sans rien (`missing`), fiche non lisible (écartée par l'intersection). La garde est
  éprouvée par `request.jwt.claims`, **jamais par `SET ROLE` seul** : sans JWT le bras éditeur
  n'est pas emprunté et le test n'asserte que du vide (§204).

## 8. Hors périmètre

- Envoi d'e-mail depuis l'application (le geste reste « copier → coller dans Gmail »).
- Journalisation CRM de l'export.
- Nouveau mécanisme de sélection : les listes `static`/`dynamic` couvrent le besoin.
