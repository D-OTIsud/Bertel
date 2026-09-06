# Audit — Confidentialité et gestion des données personnelles

Date : 5 septembre 2026. Référence initiale : `5873ec69879e61ff34030d196c65f2eb0ac14de0`, arbre de travail examiné. Audit technique et documentaire ; il ne constitue ni certification de conformité RGPD ni avis juridique. Les décisions de finalité, base légale, conservation et transfert doivent être validées par le responsable du traitement/référent. Aucun effacement, extraction de données réelles ni accès de production effectué.

## Périmètre et conclusion

La notice publique, les traitements d'avatars/portraits/documents, le parcours RGPD SQL + route serveur, les envois SMTP, l'extraction IA, les journaux et la conservation ont été examinés. Une capacité d'effacement réelle existe et elle est protégée, mais son périmètre est plus étroit que l'achèvement présenté dans l'interface. La notice publique est en décalage avec plusieurs fonctions actuelles. Corriger les écarts d'effacement et la description des flux constitue la priorité.

P0 critique ; P1 important avant de déclarer une demande achevée ; P2 correction planifiée ; P3 amélioration. **Confirmé code** : comportement visible dans les sources. **Risque/À vérifier** : nécessite des données synthétiques, une preuve de déploiement ou une décision du responsable.

## Cartographie technique observée

| Ensemble | Données et diffusion | Contrôle observé / limite |
|---|---|---|
| Comptes | Identité Auth, profil, rôles, préférences, avatar | JWT + RLS ; avatar public ; suppression globale via Admin Auth |
| Acteurs et CRM | Identité, canaux, portraits, notes, tâches, documents | Garde acteur ; documents privés signés ; portrait public |
| Objets touristiques | Contacts, documents, avis, contenus et médias publiés | API partenaires publiée ; fichiers publics indépendants du statut de la ligne |
| Partages de listes | Sélection, notes, identité/e-mail/photo du conseiller | Lien à jeton et SMTP ; envoi force expiration nulle |
| IA menus | Images et texte du menu | Réencodage des images, fournisseur configurable côté serveur ; destination contractuelle non vérifiée |
| Traçabilité | Avant/après dans audit, versions, registre d'effacement | Rédaction ciblée existante ; pas de preuve globale de purge de tous les dérivés |

## Constats

### PRIV-01 — P1 — L'effacement ne couvre pas plusieurs fichiers liés à la personne

**État : Confirmé code.** `Base de donnée DLL et API/migration_gdpr_erasure.sql:132`, `:174`, `:247`, `:258` ; même logique dans `Base de donnée DLL et API/schema_unified.sql:6710`. `bertel-tourism-ui/src/app/api/rgpd/erase/route.ts:19` et `:107` ; `bertel-tourism-ui/src/app/api/avatar/upload/route.ts:115` ; `bertel-tourism-ui/src/app/api/actor-document/route.ts:8`.

Le RPC collecte le portrait courant d'un acteur et l'avatar d'un auteur d'avis. Il remet `incident_report.media_urls` à NULL sans collecter ces URL. Il remet `app_user_profile.avatar_url` à NULL sans ajouter le fichier à supprimer. La route ne nettoie que le bucket `media` ; elle n'a pas de plan pour `avatars`, `actor-documents` ni `documents`. Les documents d'acteurs ajoutés au modèle ne sont pas intégrés à la branche acteur. Une cascade de lignes SQL n'efface pas les octets Storage.

**Scénario/impact :** demande d'effacement validée d'un utilisateur avec avatar, d'un incident avec photo ou d'un acteur avec justificatif ; le résultat applicatif peut être positif alors que les fichiers persistent, certains par URL publique. Les anciens portraits remplacés aggravent le périmètre (API-04).

**Correction :** collecter toutes les références avant anonymisation/cascade, utiliser `{bucket, path}` validés plutôt qu'un seul parseur d'URL publique, enregistrer les tâches de suppression et confirmer leur résultat ; intégrer documents/promotions/historique selon la décision de conservation. Définir les garanties sur caches, sauvegardes et copies chez les partenaires sans promettre une disparition instantanée hors contrôle.

**Acceptation :** sujet synthétique avec avatar, portrait remplacé, documents privés/publics et incident ; après exécution et reprise, toutes les URL/buckets concernés suivent la politique prévue et le rapport distingue supprimé, conservé avec motif et en attente. Répéter l'opération doit être sans danger.

### PRIV-02 — P1 — Occultation du journal d'audit et anonymisation incomplètes malgré l'annonce d'achèvement

**État : Confirmé code pour les omissions ; présence de données résiduelles à reproduire sur fixtures.** `Base de donnée DLL et API/migration_gdpr_erasure.sql:64`, `:143`, `:164`, `:247` ; `bertel-tourism-ui/src/views/rgpd/ErasureResultPanel.tsx:38`, `:69`.

La mise à jour CRM couvre `actor_id = sujet OR handled_by_actor_id = sujet`, mais l'occultation des snapshots CRM ne matche que `actor_id`. Une interaction gérée par le sujet pour un autre acteur peut donc conserver les anciens champs dans l'audit. Le commentaire annonce une occultation d'`object_version`, mais aucune branche du RPC ne la traite. La branche utilisateur anonymise seulement le profil applicatif : elle conserve le compte Auth et ses métadonnées en mode `anonymize`. Il ne s'agit donc pas d'une anonymisation générale de toutes les données de la personne.

Le panneau dit « Journal d'audit purgé de la PII » sans mesurer cette couverture. Pour les erreurs Storage/Auth, la route retourne aussi `ok: true` et HTTP 200 (`bertel-tourism-ui/src/app/api/rgpd/erase/route.ts:135`) ; les alertes UI existent, ce qui atténue le silence, mais l'entête reste « Sujet supprimé/anonymisé ».

**Impact :** clôture erronée d'une demande, persistance d'identifiants et de texte libre dans des dérivés, preuve d'effacement inexacte.

**Correction :** définir le périmètre exact par type de sujet, occulter les données personnelles des références directes/indirectes et versions concernées, distinguer anonymisation du profil et suppression du compte. Retourner un état durable `completed/partial/failed` avec compteurs réellement calculés et motifs de conservation ; adapter les libellés UI.

**Acceptation :** fixtures couvrant gestionnaire CRM distinct de l'acteur, snapshots avant/après et version contenant un nom ; recherche des marqueurs synthétiques après traitement ; échec Storage/Auth affiché comme incomplet et repris jusqu'à l'état final documenté. Ne pas remplacer arbitrairement toutes les occurrences textuelles sans analyse de leur rattachement.

### PRIV-03 — P1 — La notice publiée ne décrit plus les traitements effectivement disponibles

**État : Confirmé code pour les contradictions ; flux réellement activés à vérifier.** `bertel-tourism-ui/public/legal/rgpd.html:415` (« aucun envoi »), `:427` (absence de fonction d'effacement), `:460` (absence d'en-têtes) ; lien public depuis `bertel-tourism-ui/src/components/auth/AuthShell.tsx:125`. En regard : `bertel-tourism-ui/src/app/api/lists/send/route.ts:116`, `bertel-tourism-ui/src/app/api/rgpd/erase/route.ts:91`, `bertel-tourism-ui/next.config.ts:82`.

La notice datée de juin ne reflète ni SMTP métier, ni l'outil d'effacement, ni les en-têtes de sécurité configurés. La table des destinataires n'identifie pas le fournisseur IA configurable auquel le serveur envoie des images (`bertel-tourism-ui/src/app/api/menu/extract/provider.ts:72`, `:90`). Les affirmations générales sur localisation et absence de flux hors UE doivent être réconciliées avec le fournisseur réellement activé et ses conditions. La présence d'un adaptateur IA ne prouve pas qu'un transfert a déjà eu lieu.

**Impact :** information obsolète des personnes et inventaire incomplet pour la gouvernance des sous-traitants. La transparence doit décrire finalités, destinataires, droits et conservation correspondant au traitement réel. [CNIL — droits des personnes](https://www.cnil.fr/fr/passer-laction/les-droits-des-personnes-sur-leurs-donnees).

**Correction :** produire une notice à partir d'un inventaire validé et daté ; préciser SMTP, IA activée ou conditionnelle, données transmises, hébergement, garanties/DPA, rétention et contrôles réellement déployés. Synchroniser HTML, Markdown et PDF par une source unique. Ne pas remplacer une assertion ancienne par une nouvelle garantie non vérifiée.

**Acceptation :** chaque flux actif est relié à un responsable, contrat, région et preuve ; les trois formats ont la même version ; comparaison automatisée de présence des rubriques ; validation du responsable du traitement avant publication.

### PRIV-04 — P2 — Demande systématique de copie de pièce d'identité dans la notice

**État : Confirmé documentaire.** `bertel-tourism-ui/public/legal/rgpd.html:439` et rubrique « Vos droits » de `bertel-tourism-ui/public/legal/rgpd.md`.

Le texte demande de joindre une copie d'identité à toute demande d'exercice des droits. La CNIL indique qu'elle n'est pas obligatoire si l'identité est suffisamment établie ; une demande complémentaire doit répondre à un doute raisonnable. [CNIL — justificatif d'identité](https://www.cnil.fr/fr/cnil-direct/question/exercice-de-mes-droits-informatique-et-libertes-dois-je-fournir-obligatoirement).

**Impact :** collecte inutile de documents fortement identifiants et friction dans l'exercice des droits.

**Correction :** accepter les canaux déjà authentifiés et preuves proportionnées, réserver le justificatif au doute raisonnable, prévoir transmission protégée et suppression dès la vérification accomplie.

**Acceptation :** demande suffisamment authentifiée traitée sans pièce ; procédure de doute motivée, durée de conservation et accès aux justificatifs définis ; cohérence HTML/Markdown/PDF.

### PRIV-05 — P2 — Politique de conservation déclarative sans preuve de son exécution

**État : À vérifier ; limitation reconnue dans la notice.** `bertel-tourism-ui/public/legal/rgpd.html:347`, `:352`, `:356` ; `Base de donnée DLL et API/migration_gdpr_erasure.sql:33`.

La notice reconnaît des cibles manuelles pour les données personnelles et l'absence de purge automatique des versions. Le registre d'effacement conserve sujet, motif, opérateur et rapport sans durée explicite dans son schéma. Les « 30 jours par défaut » de sauvegardes ou durées de journaux ne sont pas une preuve de la configuration réelle du plan souscrit. L'absence d'automatisation n'est pas, seule, la preuve d'un défaut de conservation si un processus manuel effectif existe ; ce processus n'a pas été attesté ici.

**Impact :** dépassement de durées cibles, données oubliées dans journaux/exports/fichiers, difficulté à démontrer les décisions et les purges.

**Correction :** matrice finalité → durée → événement de départ → purge/anonymisation → exceptions validées ; intégrer Auth, CRM, documents, versions, registre d'effacement, sauvegardes et tiers. Mettre en place une exécution traçable, automatique ou manuelle contrôlée, avec mode simulation. [CNIL — durées de conservation](https://www.cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees).

**Acceptation :** données synthétiques expirées identifiées en simulation, conservation justifiée distinguée, purge exécutée et contrôlée ; configuration sauvegarde réellement exportée et procédure de restauration réappliquant les effacements testée.

### PRIV-06 — P2 — Portraits et métadonnées vidéo diffusables sans contrôle de finalité à l'upload

**État : Confirmé code ; base légale et usages à valider.** `bertel-tourism-ui/src/app/api/actor-photo/upload/route.ts:19`, `:84` ; `bertel-tourism-ui/src/app/api/media/upload/process-video.ts:25`.

Les portraits acteurs sont stockés dans `media` public avec cache d'un an ; aucun recueil/contrôle du droit de diffusion ne figure dans ce parcours. Les vidéos sont stockées telles quelles, y compris métadonnées potentielles GPS/appareil. Le code reconnaît ces limites. Un chemin UUID n'est pas un contrôle d'accès : un bucket public sert le fichier à qui détient son URL. [Supabase — fonctionnement des buckets](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/storage/buckets/fundamentals.mdx).

**Impact :** publication d'un portrait interne ou de coordonnées non nécessaires ; difficulté de retrait après diffusion et mise en cache. Il ne faut pas supposer que le consentement constitue nécessairement l'unique base légale : la finalité et la base appropriée doivent être décidées.

**Correction :** expliciter à l'utilisateur si le portrait sera public, enregistrer le fondement/la preuve nécessaire, stocker en privé lorsque la finalité ne justifie pas une diffusion ; retirer les métadonnées vidéo ou signaler précisément la limite en attendant son traitement.

**Acceptation :** portrait interne non lisible anonymement, publication volontaire traçable, retrait appliqué à l'URL et au cycle de cache défini ; fichier vidéo synthétique avec GPS ne publie plus ce tag après correction.

## Mesures déjà présentes

L'effacement agit par sujet avec une garde superuser SQL, une anonymisation par défaut et un registre. La route conserve l'identité appelante pour appeler le RPC au lieu de transformer automatiquement tout JWT en privilège service-role. Les images sont réencodées avec suppression de métadonnées. Les documents acteurs ont une zone privée et des URL temporaires. La notice mentionne les risques des champs libres, l'information indirecte, des droits et un point de contact. Les erreurs de suppression Auth/Storage apparaissent dans le résultat, même si son état global doit être clarifié.

## Limites et travaux de clôture

Lecture Graphify, index DB puis SQL/route/UI/notice. Pas d'inspection des données personnelles, contrats, registre interne complet, sauvegardes ou paramètres cloud. Le changelog Supabase Markdown n'a pas pu être rendu par l'outil web ; documentation officielle Auth/Storage et CNIL consultée pour les critères cités, sans changement technique de version.

Pour clôturer ce volet : dossier de preuves du responsable du traitement, matrice des flux réellement actifs, test complet d'effacement avec données synthétiques et contrôle de récupération dans les dérivés. Les correctifs sécurité SEC-01 et fichiers API-01/04 contribuent directement à la confidentialité et doivent être suivis conjointement, sans compter deux fois les mêmes défauts. SEC-02 est un point de surveillance d'invariant SQL, pas une escalade démontrée.
