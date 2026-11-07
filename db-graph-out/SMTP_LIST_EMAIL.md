# Envoi manuel de listes — supplément de catalogue SMTP

Le postflight PostgreSQL 17.6 du **7 novembre 2026 à 03:42:02 UTC**, en
`REPEATABLE READ READ ONLY`, retrouve le reçu `20261107031344` et les
postconditions du garde SMTP. Le ledger observé contient 193 entrées. Les
192 entrées historiques sont identiques. Le reçu contient une instruction
de 105 701 octets, SHA-256
`27a32f2cf14476aba38e780d5bfa3f858275bc16892b4b3d7be65177c8e144c3`.
Le numéro du reçu est une version de migration. L’heure ci-dessus est celle
du postflight.

## Relations observées

| Relation | Clé primaire | Rôle dans le protocole |
| --- | --- | --- |
| `internal.list_email_scope` | `(user_id, list_id, recipient_fingerprint)` | Génération de préparation par périmètre. |
| `internal.list_email_intent` | `(user_id, operation_id)` | État de l’intention, permis de départ et acquittement technique. |
| `internal.list_email_metric` | `(minute_start, user_id, org_object_id)` | Compteurs agrégés par minute, utilisateur et ORG. |

Les trois tables appartiennent à `postgres`. RLS est activée, FORCE RLS
est désactivée et aucune policy n’est définie sur ces tables. Le catalogue
confirme les droits SELECT, INSERT et UPDATE de `service_role` et l’absence
de droits de table et de colonne pour `anon` et `authenticated`. Les deux
FK vers `public.object_list(id)` sur `list_email_scope` et
`list_email_intent` utilisent `ON DELETE CASCADE`.

Le contrôle de prérequis confirme SELECT pour `service_role` sur
`internal.sandbox_discovery_identity` et la conservation de ses droits
existants sur `public.object_list`.

## Fonctions observées

Les six fonctions `api.get_list_email_context`, `api.prepare_list_email`,
`api.begin_list_email`, `api.complete_list_email`, `api.ack_list_email_client`
et `api.list_email_measurements`, ainsi que `internal.measure_list_email`,
appartiennent à `postgres`. Les sept sont SECURITY INVOKER, avec
`search_path=pg_catalog, pg_temp`. L’ACL accorde EXECUTE au propriétaire et à
`service_role`. Le postflight confirme le refus pour `anon` et
`authenticated`.

Ce relevé porte sur le catalogue et le reçu. La recette de l’application,
l’envoi SMTP et l’observation de volumes relèvent de preuves séparées.
Le [graphe complet](DB_AGENT_INDEX.md) utilise la capture distincte du
7 novembre 2026 à 05:18:46 UTC, au ledger 194. Les valeurs de
référence publiques conservent leur instantané du 6 novembre.

[Source canonique fraîche](<../Base de donnée DLL et API/distributed_list_email_intents.sql>) · [DO appliqué](../supabase/migrations/20261107031344_distributed_list_email_intents.sql) · [Record de production](../docs/releases/2026-11-07-distributed-list-email-production.md) · [Contrat d’envoi et de mesure](../tools/list-email/README.md)
