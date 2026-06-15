# Pack documentaire RGPD/DPO Bertel

Version : 13 juin 2026

## Livrables

- `01_Manuel_utilisateur_Bertel.md` + `livrables/01_Manuel_utilisateur_Bertel.docx` : Parcours métier, rôles, bonnes pratiques RGPD et exploitation quotidienne
- `02_Reglement_interne_RGPD_DPO_Bertel.md` + `livrables/02_Reglement_interne_RGPD_DPO_Bertel.docx` : Règles d'utilisation, responsabilités, contrôles et preuves de conformité pour Bertel
- `03_Registre_traitements_RGPD_Bertel.md` + `livrables/03_Registre_traitements_RGPD_Bertel.docx` : Fiches de traitements à valider au titre de l'article 30 du RGPD
- `04_AIPD_Bertel.md` + `livrables/04_AIPD_Bertel.docx` : AIPD de précaution centrée sur la distinction données publiques / données internes
- `05_Procedures_DPO_Bertel.md` + `livrables/05_Procedures_DPO_Bertel.docx` : Demandes de droits, violations, registre, AIPD, accès, conservation et contrôles

## À valider par le DPO

- confirmation que SPL OTI DU SUD et le référent RGPD repris du dossier badgeuse s'appliquent bien à Bertel ;
- bases légales par traitement ;
- durées de conservation, surtout CRM, notes, imports et logs ;
- sous-traitants, transferts et contrats, notamment confirmation de l'hébergement effectif Bertel ;
- niveau de risque résiduel de l'AIPD, a priori faible à moyen si les mesures sont appliquées ;
- mentions d'information et canal d'exercice des droits.

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
