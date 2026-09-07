# Contrat de réalisation — Listes

Date : 2026-09-07. Architecte : Codex. Exécutant : Claude Sonnet 5.
Le cadrage produit dans `../specs/2026-09-07-listes-personnelles-une-cycle-vie-design.md` prévaut.

## Lots et frontières

- Lot SQL : migration ciblée, rollback, tests SQL, note de déploiement propre au module. Pas de modification de l'interface ni du manifeste partagé pendant ce lot.
- Lot interface : service Listes, vues, entrées Explorer, route d'envoi et leurs tests. Pas de modification SQL. Consommer le contrat ci-dessous, signaler immédiatement tout écart.
- L'architecte relit les deux lots, coordonne les corrections, vérifie les tests et intègre le manifeste après les anciennes fixtures. Aucun déploiement distant, purge réelle, commit ou push dans ces lots.

## Contrat SQL / client

Conserver les signatures et formes de retour des RPC existantes sauf indication explicite.

### Grilles

- `api.list_my_lists()` : tableau JSON des listes du créateur connecté dans son organisation active, actives ET archivées ; le client sépare selon `is_archived`. Aucune exception superuser ne permet une grille générale. Les listes à la une du créateur peuvent figurer aussi dans ce résultat, et sont dédupliquées dans l'affichage.
- `api.list_featured_lists()` : tableau JSON des listes à la une de l'organisation active.
- `api.list_list_proposals()` : tableau JSON des propositions en attente, réservé aux admins de l'organisation active (rang >=30 ou superutilisateur). Appelé par l'interface uniquement pour un administrateur.
- Même forme de carte pour les trois. Champs existants conservés ; `cover_url` contient la couverture effective calculée. Ajouts : `created_by` UUID, `creator_name` nullable, `org_object_id`, `last_activity_at`, `is_archived`, `is_featured`, `feature_requested_at` nullable, `can_edit`, `can_manage_feature`, `can_propose_feature`, `can_restore`, `can_manage_sharing`.
- `recipient_label` reste null pour quiconque n'est pas le créateur, même pour l'admin examinant une proposition. Pas de projection d'adresse e-mail de créateur.

### Détail

`api.get_list(uuid)` conserve ses champs existants et reçoit les mêmes ajouts de cycle de vie/capacités que les cartes. `cover_url` demeure la couverture EXPLICITE éditable pour pouvoir revenir au mode automatique ; ajouter `effective_cover_url` pour le rendu. Ne jamais persister le repli automatiquement. Le calcul du repli utilise la première image non vide dans l'ordre des lieux résolus.

`api.user_can_read_list` autorise le propriétaire actif, les membres de l'organisation pour une liste à la une, les admins pour une proposition, ainsi que la reprise existante des orphelines. Pas d'accès aux listes personnelles non proposées des collègues actifs. Tout garde-fou est fail-closed hors contexte utilisateur.

`api.user_can_write_list` autorise le propriétaire pour une personnelle ; pour une liste à la une, uniquement l'administrateur dans l'organisation. Conserver la reprise des orphelines existante. Les autres utilisations sont distinctes du droit de modifier.

### Actions

- `api.request_list_feature(p_list_id uuid)` : propose la liste personnelle du créateur ; idempotent si déjà en attente ; ne repousse pas l'activité. Retour : détail JSON.
- `api.review_list_feature(p_list_id uuid, p_accept boolean)` : admin, proposition de sa propre organisation seulement ; accepte (met à la une) ou refuse (retire la proposition). Retour : détail JSON si encore lisible, sinon null. La disparition de l'accès admin après un refus est normale et doit ramener à la grille.
- `api.set_list_featured(p_list_id uuid, p_featured boolean)` : admin met directement sa propre liste à la une, ou retire une liste à la une de son organisation. Pour accepter celle d'un collègue, passer par review_list_feature. Le retrait relance la période active et conserve le lien. Retour : détail JSON si encore lisible, sinon null.
- `api.restore_list(p_list_id uuid)` : propriétaire d'une personnelle archivée (ou reprise autorisée), réactive explicitement ; idempotent sur une active. Retour : détail JSON.
- `api.duplicate_list(p_list_id uuid)` : utilisateur autorisé à utiliser la source (propriétaire ou membre pour une liste à la une), copie indépendante dans son organisation active ; retourne UUID comme create_list. Un admin qui examine une proposition n'a pas besoin d'un droit d'utilisation hors de la revue.
- `api.ensure_list_share_link(p_list_id uuid)` : utilisateur autorisé à utiliser la liste. Retour au format actuel ShareInfo (`share_token`, `share_url_path`, `share_enabled`, `share_expires_at`). Réutilise le lien actif SANS changer son expiration. Peut générer le premier lien s'il n'en existe pas. Un membre non éditeur ne peut réactiver un lien explicitement désactivé ou expiré : erreur claire `SHARE_NOT_AVAILABLE`. Un éditeur peut activer via share_list comme aujourd'hui. Aucun touch de l'horloge métier.
- `api.share_list(uuid,boolean,timestamptz)` : conservée pour modifier les paramètres de partage, réservée à l'éditeur. Les membres lecteurs ne l'appellent pas.
- `api.mark_list_sent(p_list_id uuid, p_sender_id uuid)` : suivi serveur après acceptation SMTP, grant uniquement service_role, contrôle que p_sender_id est un utilisateur autorisé à utiliser la liste. Supprimer l'exposition de l'ancienne signature UUID aux clients (révocation ou remplacement privé). La route authentifie l'utilisateur, autorise via get_list + ensure_list_share_link en JWT appelant, envoie une fois, puis utilise son client serveur pour ce marquage. Préserver le résultat HTTP 200 + trackingUpdated:false si le suivi échoue après acceptation SMTP.

### Activité et rétention

- Ajouter une horloge d'activité explicite ; backfill initial par maximum de created_at, updated_at et last_sent_at sans faire toucher updated_at pour chaque ligne par accident.
- Une modification effective de métadonnées de contenu ou d'items repousse cette horloge ; les patchs identiques n'en font rien. Les champs de partage, proposition, résultat dérivé, etc. ne comptent pas.
- `is_archived = NOT is_featured AND last_activity_at <= now() - interval '21 days'`. Horloge calculée côté serveur, pas selon l'horloge du navigateur.
- Purge interne planifiée chaque jour, critère `NOT is_featured AND last_activity_at <= now() - interval '1 year'`. Fonction inaccessible aux clients ordinaires ; les conditions sont revérifiées sous verrou en cas de modification concurrente. Réapplication de migration et double entretien sans effet secondaire.
- Programmer pg_cron seulement dans une cible qui dispose de l'extension, en contrôlant l'existence du job par nom ; documenter clairement le prérequis et le résultat si absent. Pas de purge immédiate dans le corps de la migration.

## Interface attendue

- À la une de mon organisation au-dessus de Mes listes ; Archives accessible par onglet/filtre volontaire ; Propositions pour l'admin uniquement. Garder la recherche et les statuts utiles, sans afficher toutes les listes des collègues.
- Créer depuis la grille et les sélections/filtres Explorer pour tout utilisateur connecté avec une organisation. Pas de détournement du sélecteur superuser qui sert à d'autres permissions.
- Couverture automatique et sélecteur de photo parmi les lieux ; bouton Automatique ; repli à une image indisponible.
- Dans la composition, capacité can_edit obligatoire pour TOUTE écriture : nom, destinataire, intro, notes, ordre, ajout/retrait, template, langue persistée, carte, couverture, suppression et réglages du lien. Une absence de capacité ne doit pas ouvrir les écritures.
- Les canaux d'aperçu, la langue d'aperçu, l'impression, l'envoi, la copie de lien et la duplication restent disponibles aux membres qui utilisent une liste à la une. L'envoi en lecture seule ne déclenche pas les autosaves.
- Les changements de liste/session/organisation ne doivent pas réutiliser un cache privé d'un autre utilisateur. Suivre le mécanisme existant de purge du cache ou inclure l'identité active dans les clés de requête.

## Validation minimale

Réutiliser les tests existants et ajouter de vraies preuves de permissions/horloge/SMTP/duplication, notamment lecture inter-collègues désormais refusée, destinataires masqués, seuils temporels, listes à la une conservées, SMTP refusé sans marquage, absence de mutation sur les flux lecteurs, droits d'export de contacts inchangés. Tests SQL dans une transaction locale annulée et tests UI ciblés + typecheck. Toute limite réelle reste écrite dans la note de validation.
