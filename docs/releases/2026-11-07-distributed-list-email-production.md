# Schéma d’envoi manuel de listes

Le postflight en lecture seule du **2026-11-07T03:42:02 UTC** a retrouvé le reçu
`20261107031344` et les postconditions de catalogue du garde SMTP. Ce numéro de
version a été généré par la CLI. La date ci-dessus est celle de l’observation.

| Artefact | Identité |
| --- | --- |
| [Source canonique fraîche](<../../Base de donnée DLL et API/distributed_list_email_intents.sql>), 23 369 octets | SHA-256 `d210b3fcac4d20e2ab9f41c2f2355d1fd319e1b3583715cc7ec535a52a628425` |
| [DO appliqué](../../supabase/migrations/20261107031344_distributed_list_email_intents.sql), 105701 octets | SHA-256 `27a32f2cf14476aba38e780d5bfa3f858275bc16892b4b3d7be65177c8e144c3` |
| Reçu `distributed_list_email_intents`, 1 instruction | SHA-256 de l’instruction `27a32f2cf14476aba38e780d5bfa3f858275bc16892b4b3d7be65177c8e144c3`, MD5 `4e17384e49ea2224fcfcc3c8764b8eff` |
| Ledger après opération, 193 reçus | Empreinte ledger-v1-md5 `f0e6089800c19d778413f697f79e9a6c` |
| Preuve postflight privée | SHA-256 `ace475571d21d228d8b84eb2f63a31eae7c4b9c37de6e07017fc67b3004c30be` |

Le postflight retrouve les 192 entrées historiques à l’identique, empreinte
ledger-v1-md5 `0161976feebf0759ee6c9defc57efdda`, et un seul reçu SMTP. Le XID observé du reçu
correspond à celui de la relation `internal.list_email_intent`. Les relations,
fonctions, flags RLS et privilèges comparés correspondent à l’état attendu du
garde. Le miroir préparatoire `20261106194635` a été retiré des migrations actives.

Le manifeste fresh garde le chemin canonique. Le DO versionné contient le corps
canonique avec uniquement les deux lignes externes `BEGIN` et `COMMIT` retirées.
Ce record atteste le schéma et son reçu. La qualification de l’application et
l’ouverture de l’envoi manuel relèvent de contrôles séparés.
