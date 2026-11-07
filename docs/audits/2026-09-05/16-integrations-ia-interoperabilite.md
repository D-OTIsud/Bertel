# Audit — Intégrations, IA et interopérabilité

Date : 5 septembre 2026. Révision : `5873ec69879e61ff34030d196c65f2eb0ac14de0`.

## Périmètre

Export Tourinsoft historique et variantes Réunion, API partenaires, synchronisation ONF/ArcGIS, extraction de menus par IA, SMTP, fonds cartographiques et géocodage. Lecture du code et exécution des contrôles de contrats locaux. Aucun courriel envoyé, appel IA facturé, synchronisation distante ou insertion de données.

## Vérifications et points solides

- Contrat Tourinsoft : **314 champs classifiés**, dont 55 approuvés, 96 en attente et 163 exclus ; 30 correspondances de valeurs. Le contrôle local réussit.
- Payload de fixture : **1 document** validé contre les champs approuvés. Ce test n'est pas une recette partenaire de tout le corpus.
- Contrat régional : **6 flux, 411 objets de preuve, 683 chemins union et 1 983 occurrences flux/champ** ; contrôle local réussi.
- Variante d'export explicitement validée (`bertel-tourism-ui/src/lib/tourinsoft-export.ts:24`) ; un paramètre de variante incohérent est refusé.
- ONF : authentification indépendante du corps de requête, timeout/retries réseau, collecte par identifiants, contrôle du watermark, dry-run et garde-fou sur le résultat. Voir `supabase/functions/trail-sync/orchestrator.ts:47` et `supabase/functions/_shared/arcgis.ts:44`.
- IA : permission canonique vérifiée, clé obtenue côté serveur, images réencodées, délai d'appel borné, JSON parsé et sortie sous forme de brouillon à relire. Aucun enregistrement automatique dans cette route.
- SMTP : STARTTLS exigé et absence de configuration explicitement signalée par 503.

## Constats

### INT-01 — P2 — La classification des champs ne vaut pas homologation externe

**Statut : confirmé pour les artefacts ; acceptation partenaire à vérifier.** Les commandes `node tools/tourinsoft/check-contract.mjs` et `python tools/tourinsoft/check-regional-contract.py` passent ; la première rapporte néanmoins 96 champs `pending_crt`. Le contrôle de payload exécuté porte sur `Base de donnée DLL et API/tests/fixtures/tourinsoft_reunion_common.expected.json`.

**Impact :** couverture technique et décision métier peuvent être confondues ; un export peut être conforme à la liste locale de champs approuvés sans répondre à toutes les attentes du partenaire.

**Recommandation :** conserver la distinction approuvé/en attente/exclu ; joindre une recette partenaire datée pour chaque variante, familles d'objets, valeurs rares, langues et champs absents. Ne pas activer les champs en attente par défaut.

**Validation :** acceptation écrite ou résultat d'import partenaire pour un corpus représentatif ; échantillons rejouables et version du contrat identifiés.

### INT-02 — P2 — Coût IA non consolidé et quota limité au processus

**Statut : confirmé.** Le fournisseur renvoie `usage` (`bertel-tourism-ui/src/app/api/menu/extract/provider.ts:122`), mais l'orchestrateur n'en conserve que `text` (`bertel-tourism-ui/src/app/api/menu/extract/orchestrate.ts:55`). La route limite à 12 appels/minute via une `Map` mémoire (`bertel-tourism-ui/src/app/api/menu/extract/route.ts:29`), et peut faire une deuxième tentative de réparation (`bertel-tourism-ui/src/app/api/menu/extract/orchestrate.ts:66`).

**Impact :** redémarrages ou plusieurs instances réinitialisent/multiplient le quota ; consommation et taux de réparation ne sont pas disponibles comme bilan organisation/utilisateur depuis ce chemin.

**Recommandation :** quota partagé, budget organisationnel et journal minimal de consommation/latence/modèle/statut ; garder les images et textes métier hors des logs par défaut. Relier cette mesure aux obligations d'information examinées dans l'audit confidentialité.

**Validation :** quota cohérent sur deux instances et consommation incluant la tentative de réparation ; comparaison avec le relevé du fournisseur.

### INT-03 — P2 — Envoi SMTP sans garantie d'idempotence ni suivi fiable du résultat

**Statut : confirmé sur la route.** `bertel-tourism-ui/src/app/api/lists/send/route.ts:116` envoie l'e-mail, puis `:128` appelle `mark_list_sent` sans lire son erreur. Il n'y a pas de clé d'idempotence ou de registre d'envoi avant SMTP dans ce chemin. `src/lib/mail.server.ts:22` crée un transport par appel, sans timeout explicite configuré par Bertel.

**Scénario et impact :** SMTP accepte puis la connexion HTTP ou la mise à jour SQL échoue : l'utilisateur peut réessayer et envoyer un doublon, ou l'historique rester inexact malgré HTTP 200. Les délais propres à Nodemailer existent ; l'absence de configuration applicative ne signifie pas attente infinie.

**Recommandation :** registre d'envoi/outbox avec identifiant stable, états explicites et reprise bornée ; surveiller les échecs de marquage ; fixer les délais compatibles avec le reverse proxy. Revoir aussi quota et activation du lien public avec l'audit API.

**Validation :** échecs simulés avant/après acceptation SMTP et lors du marquage SQL ; nouvelle tentative ne crée pas un second envoi involontaire.

### INT-04 — P2 — Les fonds par défaut ne correspondent pas tous à leur nom

**Statut : confirmé par configuration et observation de la démo.** `bertel-tourism-ui/src/lib/env.ts:15` associe « satellite » au style vectoriel OpenFreeMap `liberty`. Sur l'explorateur à 1280×720, le bouton « Satellite » sélectionné affiche effectivement une carte vectorielle, sans photographie aérienne.

**Impact :** un utilisateur peut croire consulter une imagerie utile pour vérifier un établissement ou un accès, alors que la source ne la fournit pas.

**Recommandation :** renommer l'option selon sa nature, ou configurer une vraie source d'imagerie avec droits d'usage, attribution et disponibilité connus ; aligner l'autorisation CSP si l'origine change.

**Validation :** chaque bouton affiche le type de fond annoncé sur la configuration livrée ; comportement de panne tierce et attribution vérifiés.

## Limites

Pas de recette HTTP réelle auprès de Tourinsoft, ONF ou fournisseur IA. Les 5 fichiers de tests Deno de l'Edge Function ont été inventoriés mais pas exécutés : Deno n'est pas disponible. Les contrats commerciaux, rétention des fournisseurs, qualité des sorties IA et exactitude géographique du corpus nécessitent des validations complémentaires. Les informations d'allergènes produites par IA doivent conserver la validation humaine prévue par le produit.
