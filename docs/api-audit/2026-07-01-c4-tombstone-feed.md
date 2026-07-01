# Flux tombstone partenaire — synchronisation des suppressions (C-4)

**Date** : 2026-07-01 · **Source du plan** : `2026-06-30-api-fix-plan.md` (C-4) · **Contrainte n°1 du PO** : *ne casser aucun accès nécessaire au front.*

> Item **C-4** de la Phase 1 (contrat tiers). Comble le trou de synchronisation delta : un partenaire voyait les ajouts/modifications (liste publiée) mais **jamais les suppressions définitives**.

---

## Le problème

Un partenaire synchronise en delta : il liste `GET /api/public/objects` (fiches `published`) et réconcilie avec son magasin local. Mais une fiche **hard-deletée** (§108, `api.rpc_delete_object` : superuser-only, irréversible) **disparaît de la liste sans aucun signal** → le partenaire garde un enregistrement fantôme indéfiniment.

## La solution

Un **flux tombstone dédié**, lu depuis le journal **immuable** `object_deletion_log` (§108), exposé uniquement via la passerelle service-role.

### Endpoint

```
GET /api/public/objects/deletions?since=<ISO8601>&limit=<1..1000>
Authorization: Bearer bk_live_…
```

| Query | Défaut | Rôle |
|---|---|---|
| `since` | (absent = tout l'historique) | Ne renvoie que les suppressions **strictement après** cet instant. Une date invalide ⇒ **400**. |
| `limit` | 500 | Taille de page, clampée `[1, 1000]`. |

### Réponse

```jsonc
{
  "meta": { "contract_version": "1.0.0", "cursor": "2026-06-01T00:00:00+00:00", "count": 2 },
  "data": [
    { "object_id": "HOTRUN000000000A", "type": "HOT", "deleted_at": "2026-05-01T09:12:00+00:00" },
    { "object_id": "RESRUN000000010V", "type": "RES", "deleted_at": "2026-06-01T00:00:00+00:00" }
  ]
}
```

- `data` = tableau de tombstones, ordonné par `deleted_at` **ASC**.
- `meta.cursor` = à repasser en `?since=` au prochain appel pour paginer (inchangé quand la page est vide ⇒ le partenaire garde sa place).
- **RGPD** : on ne projette QUE `{object_id, type, deleted_at}`. Les colonnes sensibles du journal (`report` = URLs Storage, `performed_by`, `object_name`, `status_at_deletion`) ne sont **jamais** exposées.

### Boucle de pagination (partenaire)

```
cursor = <dernier curseur stocké, ou absent au premier appel>
répéter:
  r = GET /objects/deletions?since=cursor&limit=1000
  appliquer r.data  (supprimer ces object_id du magasin local)
  si r.meta.count == 0: arrêter
  cursor = r.meta.cursor
```

---

## Modèle de réconciliation (périmètre — arbitrage documenté)

Ce flux couvre les suppressions **définitives** (hard delete). Le reste se réconcilie ainsi :

| Événement | Signal partenaire | Source |
|---|---|---|
| Ajout / modification | présent dans la liste publiée | `GET /api/public/objects` |
| **Suppression définitive** | **présent dans les tombstones** | `GET /api/public/objects/deletions` |
| Dépublication (`published`→`draft`/`archived`) | **absent** de la liste publiée **ET** absent des tombstones ⇒ tombstone **logique** | réconciliation côté partenaire |

**Pourquoi pas un `/changes` avec `upserts` ?** Un vrai delta d'upserts exigerait un « modifié depuis T » **fiable couvrant l'objet ET toutes ses tables enfants** (chambres, médias, tags, menus…). Or `object.updated_at` n'est bumpé que sur l'écriture de la ligne objet, **pas** sur l'enrichissement enfant → un delta basé dessus **raterait silencieusement** des modifications = pire que pas de delta. Livrer ce demi-delta serait malhonnête. Le vrai delta d'upserts = feature différée nécessitant un suivi de changements (`object_version`).

---

## Sécurité

- **RPC `api.list_deleted_objects_since(timestamptz, int)`** : `SECURITY INVOKER`, **`service_role`-only** (`REVOKE FROM PUBLIC, anon, authenticated` + `GRANT TO service_role`). La passerelle appelle en service-role (qui bypasse la RLS superuser-only du journal). Si le grant s'élargissait par erreur, la RLS `object_deletion_log_admin_read` (superuser-only) **fail-close** quand même.
- **Route** : auth clé partenaire (Bearer `bk_live_…`) + rate-limit (429 + `Retry-After`) + enveloppe versionnée `meta.contract_version` — identique aux autres routes `/api/public/*`.

## Vérification (2026-07-01)

- **Live** (MCP) : grants `anon=false`/`authenticated=false`/`service_role=true` ; forme vide correcte ; **test transactionnel complet** (2 tombstones seedés → projection, anti-fuite RGPD, filtre `since`, curseur, page vide, `limit`) **passe en live self-cleaning** (`ROLLBACK_PROBE`) ⇒ **0 ligne** dans le journal immuable. Advisors sécu inchangés.
- **Route** (Jest, `deletions/route.test.ts` 6/6) : 401 non-auth, 429 rate-limit, **400 `since` invalide** (RPC non appelée), normalisation ISO de `since`, clamp `limit`, enveloppe (`cursor`/`count` en meta, `data` = tombstones).
- **Test CI** : `tests/test_partner_tombstone_feed.sql`.

## Reste de Phase 1
C-4 fait. Restent : **C-5** (i18n `all`), **I3** (OpenAPI), **Q1b** (allowlist anon complète).
