# E-mails métier et paramètres SMTP

Les administrateurs de la plateforme configurent l’envoi des listes et notifications dans **Paramètres → E-mails & SMTP**. Les e-mails d’authentification Supabase (connexion, réinitialisation du mot de passe) restent configurés séparément dans Supabase Auth.

## Déploiement

Les deux migrations ci-dessous ont été appliquées en production le 7 septembre
2026 sur `ryycrdhlkmzpxwwwwupy` et enregistrées dans l'historique Supabase.
Le contrôle du catalogue à 06:55 UTC confirme la table avec RLS, aucun accès
direct pour `authenticated`, et les RPC de lecture du secret et de drain
réservées à `service_role`. Aucune configuration SMTP n'a été insérée : les
variables d'environnement existantes restent utilisées. Aucun e-mail réel
n'a été envoyé pendant cette publication. Le code serveur et l'interface
seront activés par le déploiement de l'application via Codify.

Installer `supabase/migrations/20260906031607_smtp_settings.sql` avant de déployer l’interface. Cette migration nécessite les helpers RBAC existants et Supabase Vault. Elle est également référencée par `Base de donnée DLL et API/ci_fresh_apply.sql`. Le test SQL transactionnel est `Base de donnée DLL et API/tests/test_smtp_settings.sql`.

Installer ensuite `supabase/migrations/20260906034134_task_notification_creator_sender.sql` pour que le drain reçoive l’identité du créateur des tâches. Elle suppose les migrations CRM et portail acteurs existantes, et complète la réponse JSON sans changer les droits d’accès. Son test transactionnel est `Base de donnée DLL et API/tests/test_task_notification_creator_sender.sql` ; les deux fichiers sont aussi intégrés au fresh apply. Sans cette seconde migration, les notifications restent envoyées depuis l’adresse SMTP par défaut.

La migration n’enregistre aucun serveur ni identifiant SMTP. Tant qu’aucune configuration n’est enregistrée, le serveur conserve les variables existantes `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`, `SMTP_USER` et `SMTP_PASSWORD`. Si la migration est absente, l’écran montre ces informations sans mot de passe et désactive l’enregistrement. Une panne réelle de la base ou de Vault interrompt l’envoi au lieu de changer silencieusement de relais.

Une configuration enregistrée remplace les variables d’environnement. La désactivation des envois s’applique aussi lorsque l’environnement contient un serveur valide. Aucun redémarrage n’est nécessaire : les listes et notifications utilisent le même résolveur de configuration et le pool SMTP est renouvelé lorsque les paramètres de connexion changent.

## Adresse d’expédition selon le message

- **Listes** : le nom et l’adresse définis dans les paramètres SMTP sont toujours utilisés.
- **Notification d’affectation de tâche** : le champ `From` utilise l’adresse du créateur initial de la tâche et son nom. La jointure côté serveur suit `crm_task.created_by` vers `auth.users` ; elle ne prend ni l’auteur d’une réaffectation, ni le destinataire, ni l’utilisateur déclenchant l’envoi. Les réponses au message vont ainsi au créateur.
- **Autres notifications** : l’adresse par défaut des paramètres SMTP reste utilisée.

Les tâches historiques sans créateur connu et les comptes supprimés ou sans adresse utilisent l’expéditeur SMTP par défaut. Aucun créateur n’est déduit de l’utilisateur assigné. Une adresse de créateur malformée est refusée avant connexion SMTP.

Le serveur et les identifiants SMTP restent ceux des paramètres pour tous ces messages. Le relais doit autoriser les adresses des créateurs en tant qu’expéditeurs ; un refus du relais est enregistré comme un échec de notification, sans substitution silencieuse d’adresse.

## Connexion et secrets

- Port 587 : STARTTLS obligatoire. Port 465 : TLS dès la connexion. Le port reste modifiable pour les relais spécifiques.
- Mode relais : autorisation à configurer auprès du fournisseur, généralement par l’IP du serveur. Aucun identifiant n’est envoyé.
- Mode mot de passe : identifiant et secret obligatoires. Le secret est conservé dans Supabase Vault ; il n’est jamais renvoyé au navigateur. Le laisser vide conserve le secret enregistré pour le même serveur et le même compte. Un changement de serveur ou de compte exige un nouveau mot de passe. Le passage en mode relais supprime le secret précédemment enregistré.
- Le bouton de test utilise `nodemailer.verify()` sur une connexion distincte, sans envoyer d’e-mail. Il confirme l’accès au serveur et son authentification, mais pas l’autorisation d’utiliser une adresse d’expédition ni la délivrabilité.

## Accès et vérification

`GET` et `PUT /api/admin/smtp-config`, ainsi que `POST /api/admin/smtp-config/test`, exigent une session vérifiée et `api.is_platform_superuser()` évalué avec le JWT de l’appelant. Un administrateur d’organisation n’y a pas accès. Les réponses sont `Cache-Control: no-store`.

La table `public.app_smtp_config` active RLS et refuse tout accès direct aux rôles clients. `api.get_smtp_config()` et `api.upsert_smtp_config(...)` contrôlent aussi le rôle plateforme et la présence d’un utilisateur. Le lecteur déchiffrant `api.get_smtp_config_secret()` n’est exécutable que par `service_role`. Aucune erreur SMTP ou SQL brute n’est renvoyée au client.

## Service optionnel

Les commandes d’envoi par e-mail sont masquées tant qu’aucune configuration SMTP active n’est disponible. Une configuration explicite par variables d’environnement reste utilisable lorsqu’aucune configuration de base n’est enregistrée; une configuration de base désactivée prime toujours sur elle. Les notifications dans l’application restent actives sans SMTP. Ce comportement n’ajoute aucune migration SQL.

Après application sur un environnement de test, exécuter le test SQL ci-dessus puis les tests Jest `smtp-settings.server.test.ts`, `mail.server.test.ts` et `api/admin/smtp-config/route.test.ts`. Les tests utilisent des identifiants fictifs et n’envoient aucun message. Régénérer le graphe de base à partir du catalogue de l’environnement où la migration a été appliquée selon `tools/db-graph/README.md`.
