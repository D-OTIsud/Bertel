# Registre des traitements RGPD - Bertel

Fiches de traitements à valider au titre de l'article 30 du RGPD

> Statut : registre initial dérivé du code, du schéma, de la documentation projet et du dossier badgeuse OTI SUD.
> Version : 13 juin 2026. Les informations organisationnelles sont préremplies ; durées, bases légales et sous-traitants effectifs restent à valider.

## 1. Mode d'emploi

Ce registre recense les traitements identifiés dans Bertel. Il doit être conservé par le responsable de traitement ou son DPO, mis à jour après chaque évolution significative et rapproché des politiques de conservation, contrats de sous-traitance, AIPD et procédures de sécurité.

## 2. Informations communes

| Élément | Valeur |
|---|---|
| Responsable de traitement | SPL OTI DU SUD - 379 Rue Hubert Delisle, 97430 Le Tampon - SIREN 882 699 556. |
| DPO / point de contact | David Philippe - Manager SI - d.philippe@otisud.com - 06 93 41 92 91. |
| Hébergement principal | Supabase/PostgreSQL et hébergement de référence OVH France ; architecture Bertel à confirmer si différente. |
| Zone géographique cible | La Réunion / France / UE ; aucun transfert hors UE identifié dans le dossier badgeuse. |
| Personnes concernées | Utilisateurs internes, prestataires touristiques, contacts d'organisations, déclarants d'incident, administrateurs, contributeurs. |
| Mesures transverses | Authentification, RBAC, RLS PostgreSQL, audit log, versioning, modération, séparation public/interne, sauvegardes et supervision à documenter. |

## Posture données Bertel

En l'état du périmètre décrit, environ 95 % des informations stockées dans Bertel sont publiques ou destinées à être publiées : fiches touristiques, descriptions, horaires, coordonnées professionnelles d'établissement, médias de promotion, classifications, tarifs, équipements et statuts de publication. Le risque RGPD principal ne vient donc pas du référentiel public lui-même, mais des zones internes : interactions entre l'office de tourisme et les prestataires, notes CRM, tâches, historiques de relation, coordonnées personnelles lorsqu'elles diffèrent des coordonnées publiques ou professionnelles, et erreurs de publication accidentelles.


## 3. Traitement T1 - Authentification, session et profil utilisateur

| Rubrique | Description |
|---|---|
| Finalité | Permettre la connexion, l'identification, la personnalisation et le contrôle d'accès. |
| Données | Email, identifiant utilisateur, nom d'affichage, avatar, locale, fuseau horaire, rôle, préférences, session, MFA éventuel. |
| Tables / services | `auth.users`, `auth.sessions`, `auth.identities`, `app_user_profile`, Supabase Auth, Google OAuth si activé. |
| Personnes | Agents, administrateurs, utilisateurs autorisés. |
| Base légale candidate | Exécution de la mission ou contrat utilisateur ; intérêt légitime de sécurité ; à valider. |
| Accès | Utilisateur concerné, admins habilités, service technique. |
| Conservation | À définir : compte actif, puis durée courte ou archivage limité après départ. |
| Risques | Compte usurpé, droit excessif, maintien de compte inactif. |
| Mesures | Comptes nominatifs, désactivation, revue périodique des droits, politique mot de passe/OAuth, logs. |

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
| Données | Nom, prénom, nom d'affichage, canaux de contact, rôle, organisation, consentement, preuve, préférences. |
| Tables / services | `actor`, `actor_channel`, `actor_object_role`, `actor_consent`. |
| Personnes | Prestataires, gestionnaires, guides, contacts d'organisations. |
| Base légale candidate | Relation professionnelle, intérêt légitime, mission publique ou consentement lorsque requis. |
| Accès | Acteur concerné pour certaines données, utilisateurs habilités selon objet/organisation, admins. |
| Conservation | Tant que la relation est active + durée de preuve consentement ; à définir. |
| Risques | Contact privé exposé, consentement mal qualifié, rattachement erroné. Zone sensible lorsque les coordonnées personnelles diffèrent des coordonnées publiques. |
| Mesures | RLS par objet/acteur, consentement dédié, séparation contact public/acteur. |

## 8. Traitement T6 - Suivi relationnel CRM, notes et relances

| Rubrique | Description |
|---|---|
| Finalité | Historiser les échanges métier entre l'office de tourisme et les prestataires, demandes et relances. |
| Données | Interactions, canal, direction, sujet, notes, dates, propriétaire, acteur, tâches, priorité, statut. |
| Tables / services | `crm_interaction`, `crm_task`, `object_private_description`. |
| Personnes | Contacts prestataires, agents, responsables de suivi. |
| Base légale candidate | Intérêt légitime ou mission publique de suivi relationnel ; à valider. |
| Accès | Interne habilité ; CRM admin/permissions selon implémentation. |
| Conservation | À définir, par exemple 3 à 5 ans selon besoin métier. |
| Risques | Notes subjectives, données sensibles non nécessaires, surconservation ; zone principale de vigilance car elle documente des interactions internes non publiques. |
| Mesures | Règles de rédaction, accès restreint, revue/archivage, audit. |

## 9. Traitement T7 - Modération, versioning et audit log

| Rubrique | Description |
|---|---|
| Finalité | Contrôler les modifications, prouver l'historique, détecter les erreurs et assurer la qualité. |
| Données | Auteur, avant/après, payload, date, statut, revue, snapshots, table modifiée, identifiants. |
| Tables / services | `pending_change`, `object_version`, `audit.audit_log`, triggers d'audit. |
| Personnes | Utilisateurs qui créent, modifient, approuvent ou rejettent. |
| Base légale candidate | Obligation de sécurité, preuve et gouvernance ; à valider. |
| Accès | Modérateurs, admins, service technique. |
| Conservation | À définir selon preuve/sécurité ; accès fortement limité. |
| Risques | Logs trop détaillés contenant des données personnelles, accès admin trop large. |
| Mesures | Partitions, accès admin restreint, minimisation des champs libres, purge à définir. |

## 10. Traitement T8 - Médiathèque et droits d'usage

| Rubrique | Description |
|---|---|
| Finalité | Stocker, qualifier et publier photos, vidéos, documents et visuels touristiques. |
| Données | URL, titre, description, crédit, dimensions, tags, visibilité, droits, analyse IA, portée objet/sous-lieu. |
| Tables / services | `media`, `media_tag`, bucket média, API d'upload, traitement image/vidéo. |
| Personnes | Photographes/crédits, personnes visibles incidentellement, utilisateurs uploaders. |
| Base légale candidate | Publication touristique, contrat/droits d'auteur, intérêt légitime ; à valider. |
| Accès | Public si publié, partenaires/interne selon visibilité, éditeurs habilités. |
| Conservation | Tant que droits valides et diffusion utile ; surveiller expiration. |
| Risques | Image de personne non autorisée, document administratif exposé, droits expirés. |
| Mesures | `is_published`, `visibility`, `rights_expires_at`, revue média, alt text. |

## 11. Traitement T9 - Audits qualité et incidents

| Rubrique | Description |
|---|---|
| Finalité | Réaliser des contrôles qualité et traiter des signalements terrain. |
| Données | Auditeur, critères, scores, notes, incident, gravité, statut, géolocalisation, description, déclarant, email, médias. |
| Tables / services | `audit_template`, `audit_criteria`, `audit_session`, `audit_result`, `incident_report`. |
| Personnes | Auditeurs, déclarants, contacts prestataires, personnes incidentellement présentes dans médias. |
| Base légale candidate | Mission publique, sécurité, intérêt légitime ; à valider. |
| Accès | Interne habilité, admins, agents terrain. |
| Conservation | À définir selon gravité, preuve et suivi opérationnel. |
| Risques | Collecte excessive du déclarant, géolocalisation inutile, photo identifiante. |
| Mesures | Champs facultatifs pour déclarant, limitation média, procédure incident, accès restreint. |

## 12. Traitement T10 - Juridique et conformité prestataires

| Rubrique | Description |
|---|---|
| Finalité | Suivre SIRET, licences, assurances, pièces et statuts de conformité. |
| Données | Type légal, valeur JSON, document, validité, statut, dates de demande/livraison, note. |
| Tables / services | `object_legal`, `ref_legal_type`, `ref_document`, RPC d'audit conformité. |
| Personnes | Prestataires et établissements, parfois dirigeants ou contacts selon document. |
| Base légale candidate | Obligation légale, mission publique, intérêt légitime de conformité ; à valider. |
| Accès | Interne autorisé et B2B restreint selon type ; public seulement si défini comme public. |
| Conservation | Selon validité et prescriptions applicables. |
| Risques | Pièces trop sensibles, conservation après expiration, diffusion non autorisée. |
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
| Haute | Confirmer que le responsable de traitement et le référent RGPD repris du dossier badgeuse s'appliquent à Bertel. | Direction / DPO |
| Haute | Valider les bases légales par traitement, en distinguant données publiques et zones internes CRM/contacts privés. | DPO / juridique |
| Haute | Fixer les durées de conservation et modalités de purge/anonymisation, surtout pour CRM, notes, imports et logs. | DPO / produit / technique |
| Moyenne | Finaliser la liste des sous-traitants et transferts. | DPO / technique |
| Moyenne | Créer un registre des demandes de droits et un registre des violations. | DPO |
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

- `C:\Users\dphil\Downloads\Manuel_Utilisateur_Badgeuse_OTI (7).pdf` : modèle de manuel utilisateur interne OTI.
- `C:\Users\dphil\Downloads\Reglement_RGPD_Badgeuse_OTISUD (3).pdf` : identité SPL OTI DU SUD, référent RGPD, hébergement OVH France, absence de transfert hors UE et mesures de sécurité.
- `C:\Users\dphil\Downloads\DPIA_Badgeuse_OTISUD (3).pdf` : modèle d'analyse proportionnée, risque résiduel faible, Supabase/PostgreSQL, HTTPS, RLS et logs administratifs.
