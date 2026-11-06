# Proposer une mise à jour de contenu Bertel

Ce script transforme un lot de contenu en **brouillons éditoriaux**, sans validation ni
publication. Il ne modifie jamais une révision locale existante. Il vise la mise à jour
des concepts déjà présents ; la création de nouveaux concepts reste dans l'administration.

Les identités sont qualifiées par `(domain, context_key, code)` : un code seul ne suffit
pas. `context_key` est vide pour un vocabulaire sans schéma/catégorie. Pour chaque champ
modifié, `base` contient la valeur exacte du contenu livré précédemment, et `changes`
la proposition nouvelle. Une adaptation locale de ce champ produit un conflit.

```json
{
  "format_version": 1,
  "batch_id": "bertel-contenu-2026-11",
  "proposals": [{
    "domain": "taxonomy_hlo", "context_key": "", "code": "appartement",
    "base": {"name": "Appartement"},
    "changes": {"name": "Appartement meublé"}
  }]
}
```

Une empreinte `expected_source_fingerprint` optionnelle peut figer en plus une préparation
propre à l'instance. Au moment de créer le brouillon, l'empreinte observée dans l'espace
de travail et `expected_version: 0` sont toujours vérifiées par la base. Une publication
ou une nouvelle révision concurrente produit `PT409`, sans écraser la saisie locale.

Simulation hors connexion avec un export JSON de l'espace de travail admin :

```powershell
node tools/thesaurus-content/propose-content.mjs --input lot.json --workspace workspace.json
```

Sans `--workspace`, la simulation lit la base via la session Supabase d'un superuser
plateforme existant. Utiliser les variables existantes `NEXT_PUBLIC_SUPABASE_URL` et
`NEXT_PUBLIC_SUPABASE_ANON_KEY` (ou `SUPABASE_URL`/`SUPABASE_ANON_KEY`) et transmettre son
jeton de session utilisateur courant dans `SUPABASE_AUTH_ACCESS_TOKEN`. Ne pas créer de
clé ni utiliser une clé `service_role` à la place d'une session utilisateur. Le script
ne charge aucun fichier `.env` automatiquement et n'affiche jamais ces valeurs.

```powershell
node tools/thesaurus-content/propose-content.mjs --input lot.json
node tools/thesaurus-content/propose-content.mjs --input lot.json --apply
```

`--apply` exige une lecture fraîche authentifiée ; il refuse un fichier de travail hors
connexion. Tout conflit détecté lors de cette lecture empêche l'ensemble des écritures.
Si une course survient ensuite, le traitement s'arrête : les propositions précédentes
restent des brouillons privés, et le rapport indique `proposed`, `conflict`, puis
`not_attempted`. Les autres valeurs possibles sont `ready`, `unchanged` et `failed`.
Une répétition conserve le brouillon déjà créé et signale `local_revision_exists`.
Le code de sortie vaut `0` si la simulation/application réussit, `2` en cas de conflit ou
d'application incomplète, et `1` pour un fichier ou une configuration invalide.

Relire les brouillons dans l'administration du thésaurus, puis suivre la validation,
la prévisualisation et la publication habituelles. L'identifiant `batch_id` sert au
rapport de l'opérateur ; il ne prétend pas ajouter une nouvelle provenance publiée.

Tests sans réseau ni secret :

```powershell
node --test tools/thesaurus-content/propose-content.test.mjs
```

## Notification de génération après publication

Le serveur dispose de `POST /api/admin/thesaurus/notify-drain`, avec le jeton de session
du superuser plateforme. Le service admin l'appelle après une publication, un bootstrap
ou une reprise explicite. Le corps HTTP est ignoré ; les événements proviennent de la
base. Un opérateur peut rappeler cette route avec sa session existante pour reprendre
des événements laissés en attente par une interruption.

Chaque appel réclame au maximum 20 événements avec `FOR UPDATE SKIP LOCKED`, un jeton
de réclamation et un bail de dix minutes. La livraison émet `pg_notify` sur le canal
`bertel_thesaurus_generation`, puis marque l'événement `completed` dans la même
transaction. Une répétition avec le même reçu terminé n'émet pas de seconde notification.
Un échec reste `failed`, reprenable par `retry_outbox` ; un processus interrompu devient
réclamable à expiration du bail. Une tentative d'acquittement réussi sans livraison est
refusée. Le rapport HTTP ne renvoie ni jeton de réclamation ni message SQL brut.

L'événement et le reçu sont **durables en base**. Le signal PostgreSQL est **éphémère** :
`completed` confirme son émission au commit, pas sa réception par un abonné externe.
Aucun abonné externe ni cache Next par tags/Data Cache n'est installé par ce chantier.
La cohérence des lectures repose sur les snapshots et les clés de génération, avec
détection périodique dans l'interface ; elle ne dépend pas de la réception du signal.
Le script de proposition de contenu crée seulement des brouillons et n'a donc pas
d'événement de publication à drainer.
