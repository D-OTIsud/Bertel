# Audit — Sécurité et authentification

Date : 5 septembre 2026. Référence initiale : `5873ec69879e61ff34030d196c65f2eb0ac14de0` ; lecture de l'arbre de travail. Audit statique, sans exploitation, connexion utilisateur, modification métier ni interrogation de production. Chemins relatifs à la racine du dépôt. Les numéros de ligne correspondent aux sources examinées.

## Conclusion et périmètre

Les routes sensibles valident réellement le JWT et interrogent les permissions SQL sous l'identité de l'appelant. La frontière service-role est explicite. La suppression globale d'un compte sans contrôle de hiérarchie reste prioritaire. Le scénario de rang acquis dans une autre organisation a été écarté comme vulnérabilité démontrée après vérification de la contrainte SQL d'une seule organisation active. Aucun P0 démontré dans ce volet ; cela ne vaut pas garantie d'absence de vulnérabilité.

Revue : clients Supabase navigateur/serveur, bootstrap de session, administration des comptes et invitations, garde commune, avatars, CSP, erreurs, cache navigateur. Les privilèges SQL et leur ordre de déploiement sont approfondis dans `05-autorisations-rls-rpc.md`. Les API et fichiers ont leur document dédié. Les contrôles d'hébergement, MFA effectif, politiques Auth, secrets de production et intégralité de l'historique Git n'ont pas été vérifiés.

**Échelle** : P0 critique immédiat ; P1 important avant exposition/extension ; P2 correction planifiée ; P3 amélioration. **Confirmé code** décrit un chemin observable ; **Risque** dépend d'une configuration ou de données ; **À vérifier** nécessite une validation complémentaire. Une preuve statique n'est pas un test d'exploitation réussi.

## Constats

### SEC-01 — P1 — Suppression globale sans contrôle du rôle ou du rang cible

**État : Confirmé code.** `bertel-tourism-ui/src/app/api/admin/delete-user/route.ts:11`, `:21`, `:31` et `:35` ; `bertel-tourism-ui/src/app/api/admin/_authorize.ts:49` et `:106`.

La route autorise tout administrateur de rang au moins 30 partageant une organisation avec la cible, même si l'adhésion cible est inactive. Elle appelle ensuite `server.auth.admin.deleteUser(userId)` sans lire le rôle plateforme, le rang cible ou les autres appartenances de cette dernière. La garde de rang présente sur la modification de profil ne protège pas cet autre endpoint. Les RLS des tables applicatives ne limitent pas l'opération Admin Auth effectuée avec service-role.

**Scénario :** un admin local vise l'UUID d'un supérieur ou d'un owner partageant son organisation. Autre cas respectant la contrainte d'une seule organisation active : un ancien membre d'ORG-A est désormais actif dans ORG-B, mais conserve une adhésion inactive à A ; l'admin actif de A satisfait quand même `sharesOrgIgnoringTargetActivity`. La route tente la suppression du compte global, avec suppression des appartenances en cascade. Un obstacle Auth/Storage ou un trigger déployé supplémentaire peut faire échouer l'opération ; aucun contrôle de rôle/rang cible de ce type n'est visible sur le chemin examiné.

**Impact :** suppression de comptes hors de la hiérarchie administrable et interruption d'accès d'autres organisations ; possible perte de l'owner unique. La comparaison anti-soi est aussi sensible à la casse (`:21`), contrairement au PATCH profil : un UUID propre envoyé en majuscules doit être refusé après normalisation.

**Correction :** réserver la destruction du compte global à une capacité plateforme explicitement définie, protéger les comptes privilégiés et le dernier owner, et laisser aux administrateurs d'organisation la désactivation de leur seule adhésion. Si la destruction locale reste un besoin validé, vérifier toutes les appartenances et la hiérarchie cible avant le passage service-role. Normaliser l'UUID avant l'anti-soi.

**Acceptation :** admin 30 → cible 30/50/owner/super_admin refusé sans appel Admin Auth ; ancien membre inactif A mais actif B conservé ; propre UUID dans toute casse refusé ; seul le parcours global explicitement autorisé réussit. Vérifier aussi la révocation des sessions et les cascades sur une base jetable.

### SEC-02 — P3 — Dépendance à l'invariant d'une seule organisation active

**État : À vérifier en déploiement ; scénario d'escalade non démontré et écarté sous l'invariant SQL actuel.** `bertel-tourism-ui/src/app/api/admin/_authorize.ts:44`, `:69` ; `Base de donnée DLL et API/rls_policies.sql:340` ; `Base de donnée DLL et API/schema_unified.sql:6200` et `:6259`.

`current_user_admin_rank()` sélectionne le plus grand rang de toutes les adhésions actives, puis `sharesActiveOrg()` exige une organisation commune. Cependant, le trigger `enforce_single_active_org_membership` interdit plusieurs adhésions actives aux utilisateurs ordinaires et sérialise les activations concurrentes par verrou. Les owners/super_admin exemptés disposent déjà de la capacité plateforme. Il serait incorrect d'affirmer une élévation simplement à partir de l'absence de paramètre d'organisation dans le RPC.

**Condition résiduelle :** le modèle pourrait devenir fragile si une future évolution autorise plusieurs organisations actives à un utilisateur non privilégié, ou si des données héritées échappent à cet invariant. Aucune telle donnée n'a été établie dans cet audit.

**Impact conditionnel :** dans ce modèle futur ou incohérent seulement, le rang obtenu dans A pourrait servir à une administration dans B. Ce point ne compte pas parmi les vulnérabilités P1 confirmées.

**Action :** conserver un test de la contrainte et contrôler les données héritées lors des changements de modèle ou rétrogradations. Si le multi-organisation ordinaire est introduit, lier explicitement les rangs appelant/cible et les opérations à la même organisation avant sa mise en service.

**Acceptation :** deuxième activation concurrente refusée pour un tourism_agent ; les comptes non privilégiés existants satisfont l'invariant ; toute future ouverture multi-organisation possède une matrice de tests de rang par organisation.

### SEC-03 — P2 — Le renvoi d'invitation détruit le compte avant de garantir son remplacement

**État : Confirmé code.** `bertel-tourism-ui/src/app/api/admin/invite/route.ts:27`, `:46`, `:52`, `:56`.

Pour `resend: true`, un compte jamais connecté est supprimé, puis réinvité. Si le service e-mail refuse ou tombe en panne entre les deux appels, le compte et ses appartenances ont déjà disparu. Le commentaire attend une reconstruction des rôles côté navigateur ; cette reconstruction ne constitue pas une transaction et ne peut restaurer les données si l'invitation échoue. La recherche ne traite que les 1 000 premiers comptes.

**Impact :** suppression involontaire des droits d'un invité, identifiant changé, perte de rattachements et renvoi qui ne fonctionne plus à grande échelle.

**Correction :** utiliser un parcours de renvoi/régénération du lien conservant le même compte, ou une orchestration durable avec compensation complète et identifiant stable. Remplacer le scan borné par une résolution exacte/paginée côté serveur.

**Acceptation :** simuler un échec du fournisseur après la demande de renvoi et vérifier que compte, rôles et appartenances sont conservés ; tester un utilisateur au-delà de la première page ; aucun e-mail réel nécessaire au test.

### SEC-04 — P2 — Protection des sessions privilégiées à renforcer et à prouver en déploiement

**État : Risque / À vérifier.** `bertel-tourism-ui/src/lib/supabase.ts:20`, `bertel-tourism-ui/next.config.ts:67`, `bertel-tourism-ui/src/app/api/admin/_authorize.ts:33`.

La session navigateur est persistante avec les réglages usuels du client Supabase. La CSP autorise les scripts inline en production. Aucune exigence applicative MFA/AAL2 n'a été trouvée sur la garde d'administration, et aucune réauthentification récente n'est exigée avant la destruction du compte ou le changement d'adresse. Cela ne démontre ni une XSS ni que MFA est désactivée dans le projet déployé.

**Impact :** une session administrateur compromise suffit aux opérations sensibles ; un point d'injection futur aurait une barrière CSP réduite. La suppression d'un compte ou une déconnexion ne doit pas être assimilée à l'invalidation instantanée de tous les JWT déjà délivrés : vérifier l'expiration et, pour les opérations retenues, l'existence de la session côté serveur. [Supabase — sessions](https://supabase.com/docs/guides/auth/sessions), [Supabase — déconnexion](https://supabase.com/docs/guides/auth/signout).

**Correction :** exiger MFA et/ou réauthentification récente pour les capacités plateforme et opérations irréversibles ; fixer une politique de session explicite. Introduire une CSP à nonce après inventaire des scripts Next/runtime, avec validation du fonctionnement des cartes et PDF.

**Acceptation :** accès admin avec AAL1 refusé pour les actes protégés, accès AAL2 autorisé, session révoquée refusée selon la garantie annoncée ; payload inline synthétique bloqué en production sans empêcher l'hydratation.

## Contrôles positifs et faux positifs écartés

- JWT vérifié par `auth.getUser(jwt)` ; absence de token et erreur Auth refusées avant les écritures. Le simple stockage d'un JWT ou `getSession()` n'est pas utilisé comme preuve serveur sur les routes examinées.
- Le client service-role dépend de `bertel-tourism-ui/src/lib/env.server.ts:1` et de son import `server-only`. La clé n'est pas une variable `NEXT_PUBLIC_*`. Cela ne remplace pas un scan historique de secrets ou la vérification des artefacts déployés.
- Le PATCH profil valide les champs inconnus, protège l'auto-modification, les rôles plateforme privilégiés et les e-mails d'acteurs ; les erreurs de lecture dont dépend la garde provoquent un refus.
- HSTS, `nosniff`, Referrer-Policy, Permissions-Policy, X-Frame-Options et CSP sont configurés dans `bertel-tourism-ui/next.config.ts:82`. Ne pas reprendre l'ancienne notice qui les déclare absents. Leur présence HTTP réelle reste à vérifier sur chaque origine publiée.
- La persistance React Query est limitée à `meta.persist === true`, avec buster incluant utilisateur/langues (`bertel-tourism-ui/src/components/Providers.tsx:17`, `:44`). L'existence de localStorage ne prouve pas à elle seule une fuite de données CRM.
- L'ancien chemin SQL faisant confiance à `raw_user_meta_data.role` est corrigé dans `Base de donnée DLL et API/migration_unblock_team_legal_access.sql:164`, `:242`. Ce problème historique n'est pas reclassé comme faille active sans preuve que cette migration manque. Le fallback UI `bertel-tourism-ui/src/hooks/useBootstrapSession.ts:169` mérite cohérence avec ce contrat mais n'est pas une preuve d'élévation SQL.

## Vérification et suite

Méthode : requête Graphify initiale, lecture de l'index du graphe DB, traçage des routes et gardes indirectes, comparaison avec SQL courant et lecture des tests existants. Aucun test destructif ni test réseau Auth/SMTP exécuté. Les suites existantes de suppression couvrent l'anti-soi simple et le périmètre partagé ; elles ne prouvent pas la hiérarchie ou le cas d'un ancien membre actif ailleurs. Traiter SEC-01 avant d'élargir les droits d'administration, puis les scénarios d'acceptation sur environnement isolé avec identités synthétiques.
