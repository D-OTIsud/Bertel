# Pack documentaire RGPD/DPO Bertel

Version : 13 juin 2026

> **Note de version.** Les durées de conservation, les bases légales et la liste des sous-traitants demeurent **à valider par le DPO/référent RGPD** avant diffusion (voir la section « À valider par le DPO »). Les durées et purges décrites sont des cibles de politique : aucune purge ni anonymisation automatique des données personnelles n'est en place à ce jour.

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
- sous-traitants, transferts et contrats — liste réelle à acter : OVHcloud (France, UE — hébergement de l'application web/frontend) ; Supabase Inc. (base de données, authentification, stockage de fichiers, temps réel — données dans l'UE, AWS eu-west-1, Irlande) ; Google (Google Ireland Ltd / Google LLC — authentification Google OAuth, uniquement pour les utilisateurs internes de l'office ; seul flux de transfert hors UE potentiel, à encadrer par le EU-US Data Privacy Framework) ; API Adresse / Base Adresse Nationale (data.gouv.fr, France — géocodage) ; services chargés dans le navigateur du visiteur public et recevant son adresse IP (tuiles OpenFreeMap + MapLibre, favicons DuckDuckGo, Google Fonts). Aucun envoi d'e-mail/SMS applicatif n'est en place à ce jour ;
- effacement non outillé et rémanence du journal d'audit : aucune fonction automatisée d'effacement ou d'anonymisation n'existe ; un effacement est une opération MANUELLE. Le journal d'audit (audit.audit_log) conserve une copie complète (état avant/après, données personnelles incluses) de chaque modification/suppression sur l'ensemble des tables, attribuée à l'utilisateur, pendant 12 mois glissants ; le versioning object_version n'est pas purgé automatiquement. Une donnée supprimée reste donc présente jusqu'à 12 mois, à purger manuellement au titre de l'Art. 17 ;
- absence de purge/anonymisation automatique : aucune purge ni anonymisation automatique des données personnelles n'est en place (les seules tâches planifiées concernent le rafraîchissement de vues et la rotation des partitions d'audit à 12 mois). Les durées de conservation indiquées sont des cibles de politique, à appliquer manuellement ;
- consentement à l'image non capté : la table actor_consent existe mais n'est alimentée par aucun chemin d'écriture — le consentement aux photos de portrait d'acteurs n'est pas capté à ce jour et ne peut PAS être présenté comme une mesure en place ;
- métadonnées vidéo non supprimées : les images sont ré-encodées à l'upload (EXIF/IPTC/XMP supprimés — mesure en place), mais les vidéos sont stockées telles quelles et leurs métadonnées de conteneur (GPS/appareil possibles) NE SONT PAS supprimées (risque résiduel à traiter) ;
- sécurité applicative à clarifier (ne pas surdéclarer) : le chiffrement au repos est une garantie des plateformes (OVHcloud, AWS/Supabase) — il n'y a pas de chiffrement applicatif des colonnes ; aucun en-tête de sécurité applicatif (HSTS/CSP/X-Frame-Options) n'est configuré ; la MFA n'est pas déployée ; la protection « mot de passe compromis » est désactivée ; deux vues SECURITY DEFINER sont lisibles par le rôle anonyme et les buckets de stockage publics sont listables ;
- qualification du référent RGPD vs DPO : [À VALIDER PAR LE DPO : harmoniser la qualification du référent dans tout le pack. Le document public (rgpd.md) indique qu'aucun DPO n'est formellement désigné au sens de l'Art. 37 et que M. Philippe assure la fonction de référent RGPD interne. Par défaut, employer « référent RGPD interne » partout. Signaler aussi le point d'indépendance Art. 38(6) : cumul des fonctions Manager SI / référent RGPD à arbitrer avec la direction.] ;
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

> **Note de revérification (Bertel ≠ badgeuse).** Sont réutilisables directement : l'identité **SPL OTI DU SUD** et le **référent RGPD interne** (sous réserve d'harmonisation de la qualification — voir « À valider par le DPO »). À NE PAS reprendre aveuglément : l'hébergement et les mesures de sécurité techniques, qui diffèrent et sont revérifiés dans le corps du pack. Pour Bertel : l'**application web (frontend Next.js, conteneur Docker) est hébergée chez OVHcloud, France (UE)** — comme le dossier badgeuse, mention donc valable pour le front — MAIS les **données personnelles (base de données PostgreSQL managée, authentification, stockage de fichiers, temps réel) sont chez Supabase Inc. sur Amazon Web Services, région eu-west-1 (Irlande, UE)** — projet « ryycrdhlkmzpxwwwwupy ». Aucune donnée n'est hébergée hors de l'Union européenne (seul flux de transfert hors UE potentiel : l'authentification Google OAuth des utilisateurs internes, encadrable par le EU-US Data Privacy Framework).

- `C:\Users\dphil\Downloads\Manuel_Utilisateur_Badgeuse_OTI (7).pdf` : modèle de manuel utilisateur interne OTI.
- `C:\Users\dphil\Downloads\Reglement_RGPD_Badgeuse_OTISUD (3).pdf` : identité SPL OTI DU SUD et référent RGPD (réutilisables) ; hébergement OVH France et mesures de sécurité (à revérifier — pour Bertel, le frontend est chez OVHcloud France mais les données personnelles sont chez Supabase/AWS eu-west-1, Irlande ; voir la note de revérification ci-dessus et le corps du pack).
- `C:\Users\dphil\Downloads\DPIA_Badgeuse_OTISUD (3).pdf` : modèle d'analyse proportionnée, risque résiduel faible, Supabase/PostgreSQL, HTTPS, RLS et logs administratifs (mesures de sécurité techniques à revérifier dans le corps du pack, non reprises telles quelles).
