# Registre des traitements RGPD - Bertel

Fiches de traitements à valider au titre de l'article 30 du RGPD

> Statut : registre initial dérivé du code, du schéma, de la documentation projet et du dossier badgeuse OTI SUD, corrigé sur la base des faits vérifiés (dashboard Supabase, base live, responsable) le 15 juin 2026.
> Version : 15 juin 2026. L'hébergement (front OVHcloud France ; données Supabase/AWS eu-west-1 Irlande), les sous-traitants/destinataires réels et l'état réel de la conservation, de l'effacement et de la sécurité sont désormais documentés. Les bases légales et les durées de conservation opposables restent à valider par le référent RGPD / le DPO (marqueurs « À VALIDER PAR LE DPO »).

## 1. Mode d'emploi

Ce registre recense les traitements identifiés dans Bertel. Il doit être conservé par le responsable de traitement ou son référent RGPD / DPO, mis à jour après chaque évolution significative et rapproché des politiques de conservation, contrats de sous-traitance (DPA OVHcloud, Supabase, Google), AIPD et procédures de sécurité.

## 2. Informations communes

| Élément | Valeur |
|---|---|
| Responsable de traitement | SPL OTI DU SUD - 379 Rue Hubert Delisle, 97430 Le Tampon - SIREN 882 699 556. |
| Référent RGPD / point de contact | David Philippe - Manager SI - d.philippe@otisud.com - 06 93 41 92 91. *[À VALIDER PAR LE DPO : harmoniser la qualification du référent dans tout le pack. Le document public (rgpd.md) indique qu'aucun DPO n'est formellement désigné au sens de l'Art. 37 et que M. Philippe assure la fonction de référent RGPD interne. Par défaut, employer « référent RGPD interne » partout. Signaler aussi le point d'indépendance Art. 38(6) : cumul des fonctions Manager SI / référent RGPD à arbitrer avec la direction.]* |
| Hébergement et localisation des données (toutes dans l'Union européenne) | Application web (frontend Next.js, conteneur Docker) : OVHcloud, France (UE). Données personnelles (base de données PostgreSQL managée, authentification, stockage de fichiers, temps réel) : Supabase Inc. sur Amazon Web Services, région eu-west-1 (Irlande, UE) — projet « ryycrdhlkmzpxwwwwupy ». Aucune donnée n'est hébergée hors de l'Union européenne. |
| Zone géographique cible / transferts | La Réunion / France / UE. Aucune donnée n'est hébergée hors de l'Union européenne. Seule nuance : l'authentification via Google OAuth, utilisée UNIQUEMENT par les utilisateurs internes de l'organisation (agents de l'office) — les prestataires/acteurs et le public ne s'authentifient jamais via Google — peut impliquer un transfert hors UE (Google Ireland Ltd / Google LLC), encadrable par le EU-US Data Privacy Framework [à confirmer et archiver]. Voir la rubrique « Sous-traitants et destinataires réels » ci-dessous. |
| Personnes concernées | Utilisateurs internes, prestataires touristiques, contacts d'organisations, déclarants d'incident, administrateurs, contributeurs, auteurs d'avis tiers. |
| Mesures transverses | Authentification, RBAC, RLS PostgreSQL, audit log, versioning, modération, séparation public/interne, sauvegardes et supervision à documenter. Voir la rubrique « Mesures de sécurité — état réel » ci-dessous. |

### Sous-traitants et destinataires réels

- OVHcloud (France, UE) — hébergement de l'application web (frontend). Contrat de sous-traitance (DPA) OVHcloud à archiver.
- Supabase Inc. — base de données, authentification, stockage de fichiers, temps réel ; données dans l'UE (AWS eu-west-1, Irlande). DPA à archiver.
- Google (Google Ireland Ltd / Google LLC) — authentification via Google OAuth, UNIQUEMENT pour les utilisateurs internes de l'organisation (agents de l'office) ; les prestataires/acteurs et le public ne s'authentifient jamais via Google. Transfert hors UE potentiel encadré par le EU-US Data Privacy Framework [à confirmer et archiver].
- API Adresse / Base Adresse Nationale (data.gouv.fr, France) — géocodage des adresses saisies.
- Services chargés dans le navigateur du visiteur (reçoivent son adresse IP) : tuiles cartographiques OpenFreeMap + MapLibre, favicons DuckDuckGo, Google Fonts. L'auto-hébergement de ces ressources est recommandé pour limiter ces flux.

Aucun envoi d'e-mail/SMS applicatif n'est en place à ce jour.

### Mesures de sécurité — état réel

Authentification Supabase Auth + RBAC + RLS PostgreSQL (robuste) ; journalisation d'audit ; séparation client/service-role. À noter (ne pas surdéclarer) : le chiffrement au repos est une garantie des plateformes (OVHcloud, AWS/Supabase), il n'y a pas de chiffrement applicatif des colonnes ; aucun en-tête de sécurité applicatif (HSTS/CSP/X-Frame-Options) n'est configuré ; la MFA n'est pas déployée ; la protection « mot de passe compromis » est désactivée ; deux vues SECURITY DEFINER sont lisibles par le rôle anonyme et les buckets publics sont listables (points d'amélioration identifiés).

### Conservation et effacement — état réel

Aucune purge ni anonymisation automatique des données personnelles n'est en place à ce jour (les seules tâches planifiées concernent le rafraîchissement de vues et la rotation des partitions d'audit à 12 mois). Les durées de conservation indiquées dans les fiches ci-dessous sont des cibles de politique, à appliquer manuellement tant que des purges automatiques ne sont pas implémentées.

Aucune fonction automatisée d'effacement ou d'anonymisation n'existe à ce jour — un effacement est une opération MANUELLE (suppression ciblée sous contrôle technique). De plus, le journal d'audit (`audit.audit_log`) conserve une copie complète (état avant/après, données personnelles incluses) de chaque modification et suppression sur l'ensemble des tables, attribuée à l'utilisateur, pendant 12 mois glissants. Une donnée supprimée reste donc présente dans le journal d'audit jusqu'à 12 mois ; sa purge ciblée doit être effectuée manuellement lorsque la demande l'exige. Le versioning `object_version` n'est, lui, pas purgé automatiquement.

### Catégories particulières (Art. 9)

Aucune catégorie particulière de données au sens de l'Art. 9 n'est intentionnellement visée par les traitements de Bertel. Toutefois, les champs de texte libre (notes CRM, descriptions, comptes rendus d'incident) et les médias (photos, vidéos) peuvent accidentellement contenir de telles informations : il s'agit d'un risque opérationnel à encadrer par des règles de rédaction et de modération, et non d'une finalité.

## Posture données Bertel

En l'état du périmètre décrit, environ 95 % des informations stockées dans Bertel sont publiques ou destinées à être publiées : fiches touristiques, descriptions, horaires, coordonnées professionnelles d'établissement, médias de promotion, classifications, tarifs, équipements et statuts de publication. Le risque RGPD principal ne vient donc pas du référentiel public lui-même, mais des zones internes : interactions entre l'office de tourisme et les prestataires, notes CRM, tâches, historiques de relation, coordonnées personnelles lorsqu'elles diffèrent des coordonnées publiques ou professionnelles, et erreurs de publication accidentelles.


## 3. Traitement T1 - Authentification, session et profil utilisateur

| Rubrique | Description |
|---|---|
| Finalité | Permettre la connexion, l'identification, la personnalisation et le contrôle d'accès. |
| Données | Email, identifiant utilisateur, nom d'affichage, avatar, locale, fuseau horaire, rôle, préférences, session. La MFA n'est pas déployée à ce jour. |
| Tables / services | `auth.users`, `auth.sessions`, `auth.identities`, `app_user_profile`, Supabase Auth, Google OAuth (utilisé UNIQUEMENT par les utilisateurs internes de l'organisation ; les prestataires/acteurs et le public ne s'authentifient jamais via Google). Supabase Realtime/presence diffuse l'identité de l'utilisateur connecté aux autres sessions. |
| Personnes | Agents, administrateurs, utilisateurs autorisés. |
| Base légale candidate | Exécution de la mission ou contrat utilisateur ; intérêt légitime de sécurité. *[À VALIDER PAR LE DPO : base légale opposable]* |
| Accès | Utilisateur concerné, admins habilités, service technique. |
| Conservation | À définir : compte actif, puis durée courte ou archivage limité après départ. Aucune purge automatique n'est en place ; voir « Conservation et effacement — état réel ». |
| Risques | Compte usurpé, droit excessif, maintien de compte inactif. MFA non déployée et protection « mot de passe compromis » désactivée (points d'amélioration identifiés). |
| Mesures | Comptes nominatifs, désactivation, revue périodique des droits, politique mot de passe/OAuth, logs. Transfert hors UE potentiel via Google OAuth (utilisateurs internes uniquement), encadrable par le EU-US Data Privacy Framework [à confirmer et archiver]. |

## 4. Traitement T2 - Gestion des organisations, rôles et permissions

| Rubrique | Description |
|---|---|
| Finalité | Gérer les équipes, rattachements ORG, rôles métier/admin et permissions. |
| Données | Identifiants utilisateurs, email, organisation active, rôles, rang admin, permissions, statut actif. |
| Tables / services | `user_org_membership`, `user_org_business_role`, `user_org_admin_role`, `org_permission`, `user_permission`, RPC RBAC. |
| Personnes | Membres des offices/organisations et administrateurs. |
| Base légale candidate | Gestion interne et sécurité ; à valider. |
| Accès | Administrateurs habilités, membres pour certaines informations de périmètre. |
| Conservation | À définir : durée d'appartenance + preuve limitée. |
| Risques | Attribution excessive, action sur son propre rôle, accès inter-organisation. |
| Mesures | Rangs admin, anti-self-action, RLS, RPC contrôlées, audit log. |

## 5. Traitement T3 - Référentiel touristique et publication des fiches

| Rubrique | Description |
|---|---|
| Finalité | Créer, maintenir, publier et rechercher des fiches touristiques. |
| Données | Noms d'établissements, descriptions, localisation, horaires, labels, tarifs, offres, classifications, statuts, versions ; données très majoritairement publiques ou publiables. |
| Tables / services | `object`, `object_description`, `object_location`, `object_classification`, `object_taxonomy`, `opening_*`, `object_price`, `publication*`. |
| Personnes | Prestataires lorsqu'ils sont identifiables via une fiche ; utilisateurs auteurs/modérateurs. |
| Base légale candidate | Mission d'intérêt public ou intérêt légitime de promotion touristique ; à valider. |
| Accès | Public pour les données publiées, éditeurs habilités pour brouillons et données étendues. |
| Conservation | Tant que la fiche est utile + archive limitée ; à définir. |
| Risques | Données inexactes, publication d'information interne dans un champ public, rattachement erroné. |
| Mesures | Statuts, modération, versioning, RLS, différenciation public/interne. |

## 6. Traitement T4 - Contacts publics des établissements

| Rubrique | Description |
|---|---|
| Finalité | Diffuser les coordonnées publiques utiles aux visiteurs et partenaires. |
| Données | Téléphone, email, site, réseaux sociaux, rôle du canal, caractère public, primaire. |
| Tables / services | `contact_channel`, `ref_code_contact_kind`, `ref_contact_role`. |
| Personnes | Prestataires, contacts professionnels, établissements. |
| Base légale candidate | Mission publique, intérêt légitime, contrat ou consentement selon type de contact ; à valider. |
| Accès | Public si `is_public`; éditeurs habilités pour gestion complète. |
| Conservation | Tant que le contact est exact et utile ; revue périodique. |
| Risques | Publication d'une coordonnée personnelle ou non destinée au public, notamment si elle diffère des coordonnées professionnelles publiables. |
| Mesures | Champ `is_public`, contrôle éditorial, séparation contact public/contact interne, suppression/correction sur demande. |

## 7. Traitement T5 - Acteurs, contacts privés et consentements

| Rubrique | Description |
|---|---|
| Finalité | Relier des personnes/acteurs à des objets ou organisations et gérer leurs canaux et consentements. |
| Données | Nom, prénom, nom d'affichage, canaux de contact, rôle, organisation, photo de portrait (`actor.photo_url`), consentement (table `actor_consent`), préférences. |
| Tables / services | `actor`, `actor_channel`, `actor_object_role`, `actor_consent`, bucket média (portraits). |
| Personnes | Prestataires, gestionnaires, guides, contacts d'organisations. |
| Base légale candidate | Relation professionnelle, intérêt légitime, mission publique ou consentement lorsque requis. *[À VALIDER PAR LE DPO : base légale opposable, en particulier pour la photo de portrait]* |
| Accès | Acteur concerné pour certaines données, utilisateurs habilités selon objet/organisation, admins. |
| Conservation | Tant que la relation est active + durée de preuve consentement ; à définir. Aucune purge automatique n'est en place. |
| Risques | Contact privé exposé, consentement non capté, rattachement erroné. Zone sensible lorsque les coordonnées personnelles diffèrent des coordonnées publiques. Photos de portrait d'acteurs et consentement : la fiche acteur peut porter une photo de portrait (image d'une personne physique) stockée dans un bucket public (seule protection : un chemin de fichier non devinable, ce qui n'est pas un contrôle d'accès). La table `actor_consent` existe mais n'est alimentée par aucun chemin d'écriture : le consentement n'est pas capté à ce jour. Le consentement ne peut donc PAS être présenté comme une mesure en place — c'est une mesure à mettre en œuvre. |
| Mesures | RLS par objet/acteur, séparation contact public/acteur. À mettre en œuvre : captation effective du consentement (`actor_consent` non alimentée) et contrôle d'accès réel sur les portraits (bucket actuellement public, listable). |

## 8. Traitement T6 - Suivi relationnel CRM, notes et relances

| Rubrique | Description |
|---|---|
| Finalité | Historiser les échanges métier entre l'office de tourisme et les prestataires, demandes et relances. |
| Données | Interactions, canal, direction, sujet, notes, dates, propriétaire, acteur, tâches, priorité, statut. Champs libres et JSONB `extra` du CRM pouvant contenir des données personnelles : adresse e-mail de l'interlocuteur (`interlocuteur_email`), humeur brute en texte libre (`humeur_raw`), sentiment relationnel. |
| Tables / services | `crm_interaction`, `crm_task`, `object_private_description`. |
| Personnes | Contacts prestataires, agents, responsables de suivi. |
| Base légale candidate | Intérêt légitime ou mission publique de suivi relationnel. *[À VALIDER PAR LE DPO : base légale opposable]* |
| Accès | Interne habilité ; CRM admin/permissions selon implémentation. |
| Conservation | À définir, par exemple 3 à 5 ans selon besoin métier *[À VALIDER PAR LE DPO]*. Aucune purge automatique n'est en place ; toute donnée modifiée/supprimée subsiste jusqu'à 12 mois dans le journal d'audit. |
| Risques | Notes subjectives, données sensibles non nécessaires dans les champs libres / JSONB `extra`, surconservation ; zone principale de vigilance car elle documente des interactions internes non publiques. |
| Mesures | Règles de rédaction, accès restreint (RPC DEFINER « authorize-once », RLS par commande), revue/archivage, audit. Minimisation à appliquer sur les champs libres et `extra`. |

## 9. Traitement T7 - Modération, versioning et audit log

| Rubrique | Description |
|---|---|
| Finalité | Contrôler les modifications, prouver l'historique, détecter les erreurs et assurer la qualité. |
| Données | Auteur (email de l'utilisateur), image complète avant/après (`to_jsonb(OLD/NEW)` : TOUTES les données personnelles — emails, noms, texte libre CRM, etc.), payload, date, statut, revue, snapshots, table modifiée, identifiants. |
| Tables / services | `pending_change`, `object_version`, `audit.audit_log`, triggers d'audit. |
| Personnes | Utilisateurs qui créent, modifient, approuvent ou rejettent ; toute personne dont une donnée est modifiée ou supprimée (copiée dans le journal). |
| Base légale candidate | Obligation de sécurité, preuve et gouvernance. *[À VALIDER PAR LE DPO : base légale opposable]* |
| Accès | Modérateurs, admins, service technique. |
| Conservation | `audit.audit_log` : 12 mois glissants (rotation mensuelle des partitions) — il s'agit de la durée réellement appliquée. `object_version` (versioning) : N'EST JAMAIS purgé. Aucune fonction automatisée d'effacement/anonymisation n'existe : une donnée supprimée reste présente dans le journal d'audit jusqu'à 12 mois et dans `object_version` sans limite ; sa purge ciblée doit être effectuée MANUELLEMENT. Accès fortement limité. |
| Risques | Le journal d'audit copie l'intégralité de la PII de chaque UPDATE/DELETE sur toutes les tables ; `object_version` n'est jamais purgé. Une demande d'effacement (Art. 17) n'est satisfaite qu'au prix d'une purge manuelle de ces historiques. Accès admin trop large. |
| Mesures | Partitions, accès admin restreint, minimisation des champs libres. À mettre en œuvre : procédure manuelle d'effacement des historiques (audit + `object_version`) sur demande Art. 17 ; purge/anonymisation automatique non implémentée. |

## 10. Traitement T8 - Médiathèque et droits d'usage

| Rubrique | Description |
|---|---|
| Finalité | Stocker, qualifier et publier photos, vidéos, documents et visuels touristiques. |
| Données | URL, titre, description, crédit, dimensions, tags, visibilité, droits, analyse IA, portée objet/sous-lieu. Métadonnées des médias : les images sont ré-encodées à l'upload, ce qui supprime leurs métadonnées EXIF/IPTC/XMP (GPS, appareil) — mesure en place. Les vidéos sont en revanche stockées telles quelles : leurs métadonnées de conteneur (pouvant contenir GPS/appareil) NE SONT PAS supprimées (limite documentée, pas de transcodeur serveur), à traiter comme un risque résiduel. |
| Tables / services | `media`, `media_tag`, bucket média (public, listable), API d'upload, traitement image/vidéo. |
| Personnes | Photographes/crédits, personnes visibles incidentellement, utilisateurs uploaders. |
| Base légale candidate | Publication touristique, contrat/droits d'auteur, intérêt légitime. *[À VALIDER PAR LE DPO : base légale opposable]* |
| Accès | Public si publié, partenaires/interne selon visibilité, éditeurs habilités. À noter : le bucket média est public et listable (point d'amélioration). |
| Conservation | Tant que droits valides et diffusion utile ; surveiller expiration. Aucune purge automatique : `media.url` est une chaîne sans clé étrangère, de sorte que les fichiers orphelins du bucket (upload annulé, ré-upload, ligne supprimée) ne sont jamais nettoyés — un fichier supprimé en base peut subsister dans le bucket public. |
| Risques | Image de personne non autorisée, document administratif exposé, droits expirés. Bucket public listable sans expiration ; fichiers orphelins non nettoyés ; métadonnées de conteneur des vidéos (GPS/appareil) non supprimées. |
| Mesures | `is_published`, `visibility`, `rights_expires_at`, revue média, alt text, ré-encodage des images (strip EXIF/IPTC/XMP). À mettre en œuvre : nettoyage des orphelins (GC bucket ↔ `media.url`), restriction du bucket public, strip des métadonnées vidéo. |

## 11. Traitement T9 - Audits qualité et incidents

| Rubrique | Description |
|---|---|
| Finalité | Réaliser des contrôles qualité et traiter des signalements terrain. |
| Données | Auditeur, critères, scores, notes, incident, gravité, statut. Pour `incident_report` (déclarants citoyens) : nom du déclarant, adresse e-mail, géolocalisation, description en texte libre, photos. Ces signalements peuvent se propager AUTOMATIQUEMENT dans le CRM. |
| Tables / services | `audit_template`, `audit_criteria`, `audit_session`, `audit_result`, `incident_report` (propagation automatique vers le CRM). |
| Personnes | Auditeurs, déclarants citoyens, contacts prestataires, personnes incidentellement présentes dans médias. |
| Base légale candidate | Mission publique, sécurité, intérêt légitime. *[À VALIDER PAR LE DPO : base légale opposable, en particulier pour la collecte d'identité/géoloc des déclarants citoyens]* |
| Accès | Interne habilité, admins, agents terrain. |
| Conservation | À définir selon gravité, preuve et suivi opérationnel *[À VALIDER PAR LE DPO]*. Aucune purge automatique ; donnée subsistant jusqu'à 12 mois dans le journal d'audit. |
| Risques | Collecte excessive du déclarant (identité, e-mail, géolocalisation, photos), photo identifiante, propagation automatique en CRM d'une donnée de déclarant citoyen. |
| Mesures | Champs facultatifs pour déclarant, limitation média, procédure incident, accès restreint, information des déclarants sur la propagation CRM. |

## 11 bis. Traitement T9b - Avis de tiers (object_review)

| Rubrique | Description |
|---|---|
| Finalité | Recueillir, modérer et afficher des avis émis par des tiers sur les établissements. |
| Données | Nom de l'auteur de l'avis, avatar, contenu de l'avis (texte libre), note, source, statut de publication/modération. |
| Tables / services | `object_review`, RPC de lecture des avis, modération. |
| Personnes | Auteurs d'avis (tiers, public), personnes éventuellement citées dans le texte libre. |
| Base légale candidate | Intérêt légitime de transparence/qualité ou consentement selon la source de collecte. *[À VALIDER PAR LE DPO : base légale opposable et information des auteurs d'avis]* |
| Accès | Public pour les avis publiés/modérés ; membres de l'ORG pour leurs propres avis modérés-out ; admins/modérateurs. |
| Conservation | À définir *[À VALIDER PAR LE DPO]*. Aucune purge automatique ; donnée subsistant jusqu'à 12 mois dans le journal d'audit. |
| Risques | Diffusion d'identité d'un tiers, contenu diffamatoire ou contenant des données personnelles dans le texte libre, défaut d'information de l'auteur. |
| Mesures | Modération, statut de publication, RLS (lecture publique gatée sur le statut + objet publié), procédure de retrait sur demande. |

## 12. Traitement T10 - Juridique et conformité prestataires

| Rubrique | Description |
|---|---|
| Finalité | Suivre SIRET, licences, assurances, pièces et statuts de conformité. |
| Données | Type légal, valeur JSON, document, validité, statut, dates de demande/livraison, note. À noter : SIRET/SIREN et raison sociale constituent des données à caractère personnel lorsque l'établissement est un entrepreneur individuel (la raison sociale reprend alors le nom de la personne physique). |
| Tables / services | `object_legal`, `ref_legal_type`, `ref_document`, RPC d'audit conformité. |
| Personnes | Prestataires et établissements (dont entrepreneurs individuels — SIRET/SIREN/raison sociale = PII), parfois dirigeants ou contacts selon document. |
| Base légale candidate | Obligation légale, mission publique, intérêt légitime de conformité. *[À VALIDER PAR LE DPO : base légale opposable]* |
| Accès | Interne autorisé et B2B restreint selon type ; public seulement si défini comme public. |
| Conservation | Selon validité et prescriptions applicables *[À VALIDER PAR LE DPO]*. Aucune purge automatique. |
| Risques | Pièces trop sensibles, conservation après expiration, diffusion non autorisée, exposition de PII d'entrepreneurs individuels (SIRET/SIREN/raison sociale). |
| Mesures | Typage public/interne, statut, dates, revue d'expiration, RLS. |

## 13. Traitement T11 - Imports, migration et rapprochement de données historiques

| Rubrique | Description |
|---|---|
| Finalité | Importer, contrôler et promouvoir des données historiques ou candidates vers le référentiel. |
| Données | Données de fiches, contacts, médias, lots, événements d'import, décisions de mapping, erreurs. |
| Tables / services | `staging.*`, `import_batches`, `import_events`, `mapping_*`, RPC `commit_staging_to_public`. |
| Personnes | Prestataires et contacts présents dans sources historiques, agents de migration. |
| Base légale candidate | Continuité du référentiel / mission publique ; à valider. |
| Accès | Équipe data, admins et métiers habilités. |
| Conservation | Données staging à purger après validation ; durée à fixer. |
| Risques | Import d'informations obsolètes, doublons, absence d'information des personnes. |
| Mesures | Profilage, validation, ledger, règles de promotion, purge des lots temporaires. |

## 14. Traitement T12 - Tableaux de bord, recherche et reporting

| Rubrique | Description |
|---|---|
| Finalité | Mesurer qualité, actualisation, couverture, activité et état du référentiel. |
| Données | Agrégats, filtres, catégories, dates de mise à jour, indicateurs qualité, objets visibles. |
| Tables / services | `internal.mv_filtered_objects`, RPC dashboard, caches et vues matérialisées. |
| Personnes | Utilisateurs internes, prestataires indirectement via fiches agrégées. |
| Base légale candidate | Pilotage métier et qualité ; à valider. |
| Accès | Utilisateurs habilités selon tableau de bord. |
| Conservation | Agrégats recalculés ; pas de conservation séparée sauf exports. |
| Risques | Export non maîtrisé ou ré-identification via filtres fins. |
| Mesures | RLS, limitation des exports, partage contrôlé. |

## 15. Plan d'action registre

| Priorité | Action | Responsable |
|---|---|---|
| Haute | Confirmer que le responsable de traitement et le référent RGPD repris du dossier badgeuse s'appliquent à Bertel, et arbitrer le cumul Manager SI / référent RGPD (indépendance Art. 38(6)). | Direction / référent RGPD |
| Haute | Valider les bases légales par traitement, en distinguant données publiques et zones internes CRM/contacts privés (marqueurs « À VALIDER PAR LE DPO »). | Référent RGPD / juridique |
| Haute | Fixer les durées de conservation et modalités de purge/anonymisation, surtout pour CRM, notes, imports et logs. À ce jour AUCUNE purge/anonymisation automatique n'existe et l'effacement est manuel (audit log conservé 12 mois, `object_version` jamais purgé). | Référent RGPD / produit / technique |
| Haute | Archiver les contrats de sous-traitance (DPA OVHcloud, Supabase ; encadrement EU-US Data Privacy Framework pour Google OAuth interne) et acter qu'aucune donnée n'est hébergée hors UE. | Référent RGPD / technique |
| Haute | Traiter les points de sécurité identifiés : en-têtes HSTS/CSP/X-Frame-Options, MFA, protection « mot de passe compromis », vues SECURITY DEFINER lisibles par anon, buckets publics listables, strip des métadonnées vidéo, nettoyage des médias orphelins. | Technique |
| Moyenne | Mettre en œuvre la captation effective du consentement (`actor_consent` non alimentée) avant de présenter le consentement comme une mesure en place. | Référent RGPD / produit |
| Moyenne | Limiter les flux vers les tiers chargés côté navigateur (OpenFreeMap/MapLibre, DuckDuckGo, Google Fonts) par auto-hébergement. | Technique |
| Moyenne | Créer un registre des demandes de droits et un registre des violations. | Référent RGPD |
| Moyenne | Mettre en place la revue périodique des accès. | Admin plateforme |

## Sources officielles consultées

- CNIL - DPO : par où commencer ? https://www.cnil.fr/fr/dpo-par-ou-commencer
- CNIL - Le registre des activités de traitement : https://cnil.fr/fr/RGPD-le-registre-des-activites-de-traitement
- CNIL - L'analyse d'impact relative à la protection des données (AIPD) : https://www.cnil.fr/fr/RGPD-analyse-impact-protection-des-donnees-aipd
- CNIL - Outil PIA : https://www.cnil.fr/fr/outil-pia-telechargez-et-installez-le-logiciel-de-la-cnil
- CNIL - Les droits des personnes sur leurs données : https://www.cnil.fr/fr/passer-laction/les-droits-des-personnes-sur-leurs-donnees
- CNIL - Violations de données personnelles : les règles à suivre : https://www.cnil.fr/fr/violations-de-donnees-personnelles-les-regles-suivre
- CNIL - Guide pratique RGPD pour les DPO : https://www.cnil.fr/sites/default/files/atoms/files/guide_pratique_rgpd_-_delegues_a_la_protection_des_donnees.pdf


## Sources projet utilisées

- `README.md` : positionnement Bertel, stack Next.js + Supabase/PostgreSQL, API et documentation.
- `ARCHITECTURE.md` et `docs/architecture/bertel-object-workspace-canonical-map.md` : carte fonctionnelle du workspace objet.
- `docs/architecture/OBJECT_DATA_DICTIONARY.md` : dictionnaire des données objet, contacts, médias, CRM, incidents, juridique, RLS et audit.
- `db-graph-out/DB_AGENT_INDEX.md`, `FUNCTIONS.md`, `POLICIES.md`, `TYPES.md` : cartographie DB, RPC, politiques RLS et enums.
- `dbdoc/*.md` : fiches de tables sensibles (`auth.users`, `app_user_profile`, `actor`, `actor_channel`, `actor_consent`, `contact_channel`, `object_private_description`, `crm_interaction`, `crm_task`, `incident_report`, `media`, `object_legal`, `audit.audit_log`).
- `bertel-tourism-ui/src/views/*` et `bertel-tourism-ui/src/services/*` : parcours UI, authentification, RBAC, CRM, modération, audits, médias.


## Sources internes transposées depuis le dossier badgeuse

> Note de revérification (2026-06-15) : les éléments réutilisables du dossier badgeuse (identité SPL OTI DU SUD, référent RGPD) restent valables pour Bertel. L'hébergement de l'application web chez OVHcloud, France (UE) reste valable pour Bertel (frontend), MAIS les données personnelles de Bertel sont hébergées chez Supabase Inc. sur AWS, région eu-west-1 (Irlande, UE) — il faut nommer les DEUX hébergeurs, voir la section 2. Les mesures de sécurité techniques décrites pour la badgeuse ne doivent PAS être reprises aveuglément : elles ont été revérifiées dans le corps du présent registre (voir « Mesures de sécurité — état réel » : pas de chiffrement applicatif des colonnes, pas d'en-têtes HSTS/CSP/X-Frame-Options applicatifs, MFA non déployée, protection « mot de passe compromis » désactivée, deux vues SECURITY DEFINER lisibles par anon, buckets publics listables).

- `C:\Users\dphil\Downloads\Manuel_Utilisateur_Badgeuse_OTI (7).pdf` : modèle de manuel utilisateur interne OTI.
- `C:\Users\dphil\Downloads\Reglement_RGPD_Badgeuse_OTISUD (3).pdf` : identité SPL OTI DU SUD, référent RGPD, hébergement OVHcloud France (valable pour le frontend Bertel ; les données Bertel sont chez Supabase/AWS eu-west-1, Irlande), absence de transfert hors UE et mesures de sécurité (à revérifier pour Bertel, cf. note ci-dessus).
- `C:\Users\dphil\Downloads\DPIA_Badgeuse_OTISUD (3).pdf` : modèle d'analyse proportionnée, risque résiduel faible, Supabase/PostgreSQL, HTTPS, RLS et logs administratifs (mesures à revérifier pour Bertel, cf. note ci-dessus).
