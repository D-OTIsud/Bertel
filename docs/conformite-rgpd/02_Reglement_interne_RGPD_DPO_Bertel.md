# Règlement interne de conformité RGPD et gouvernance DPO

Règles d'utilisation, responsabilités, contrôles et preuves de conformité pour Bertel

> Statut : modèle interne à valider. Ce document ne remplace pas l'avis du référent RGPD interne, du juriste ou du responsable de traitement.
> Version : 16 juin 2026. L'identité de l'organisation et le référent RGPD sont repris du dossier badgeuse OTI SUD ; l'architecture technique et les sous-traitants ci-dessous décrivent l'application Bertel telle que vérifiée (base live, console Supabase, le 15 juin 2026).

## 1. Périmètre

Le présent règlement s'applique à Bertel, référentiel touristique et espace de travail de gestion des fiches, médias, contacts, acteurs, relations prestataires, audits, incidents, publications, rôles, permissions et traces techniques.

Il couvre les usages internes, les exports, les partages à des partenaires, la diffusion publique et les traitements réalisés via Supabase/PostgreSQL, l'UI Next.js, les API, les imports et les outils associés.

## Informations organisationnelles reprises du dossier badgeuse

| Élément | Valeur |
|---|---|
| Organisation | SPL OTI DU SUD |
| Adresse | 379 Rue Hubert Delisle, 97430 Le Tampon |
| SIREN | 882 699 556 |
| Activité | Tourisme |
| Effectif de référence | 27 salariés |
| Date de création | 24/01/2020 |
| Référent RGPD interne | David Philippe - Manager SI |
| Contact RGPD | d.philippe@otisud.com - 06 93 41 92 91 |
| Hébergement (application web, frontend) | OVHcloud, France (UE) |
| Hébergement (données personnelles) | Supabase Inc. sur Amazon Web Services, région eu-west-1 (Irlande, UE) — projet « ryycrdhlkmzpxwwwwupy » |
| Localisation des données | Toutes dans l'Union européenne ; aucune donnée hébergée hors UE |


## Posture données Bertel

En l'état du périmètre décrit, environ 95 % des informations stockées dans Bertel sont publiques ou destinées à être publiées : fiches touristiques, descriptions, horaires, coordonnées professionnelles d'établissement, médias de promotion, classifications, tarifs, équipements et statuts de publication. Le risque RGPD principal ne vient donc pas du référentiel public lui-même, mais des zones internes : interactions entre l'office de tourisme et les prestataires, notes CRM, tâches, historiques de relation, coordonnées personnelles lorsqu'elles diffèrent des coordonnées publiques ou professionnelles, et erreurs de publication accidentelles.


## 2. Gouvernance

| Rôle | Responsabilité |
|---|---|
| Responsable de traitement | SPL OTI DU SUD - 379 Rue Hubert Delisle, 97430 Le Tampon - SIREN 882 699 556. |
| Référent RGPD interne | David Philippe - Manager SI - d.philippe@otisud.com - 06 93 41 92 91. |
| Responsable produit Bertel | Maintient la cohérence métier, priorise les corrections de conformité. |
| Administrateur plateforme | Gère configuration, sécurité, accès techniques, logs et incidents. |
| Administrateur d'organisation | Gère membres, rôles et permissions dans son périmètre. |
| Utilisateur métier | Saisit, corrige et consulte les données en respectant le présent règlement. |
| Sous-traitants | OVHcloud (France, UE) pour l'application web (frontend) ; Supabase Inc. (base de données, authentification, stockage, temps réel ; données dans l'UE — AWS eu-west-1, Irlande) ; Google (authentification OAuth, utilisateurs internes uniquement) ; API Adresse / Base Adresse Nationale (data.gouv.fr, France). Voir le détail en §12. |

Le référent RGPD interne doit pouvoir être contacté facilement par les personnes concernées et par les utilisateurs internes. Le référent RGPD interne tient ou supervise le registre, les AIPD, les procédures de droits et les violations.

> [À VALIDER PAR LE DPO : harmoniser la qualification du référent dans tout le pack. Le document public (rgpd.md) indique qu'aucun DPO n'est formellement désigné au sens de l'Art. 37 et que M. Philippe assure la fonction de référent RGPD interne. Par défaut, employer « référent RGPD interne » partout. Signaler aussi le point d'indépendance Art. 38(6) : cumul des fonctions Manager SI / référent RGPD à arbitrer avec la direction.]

## 3. Principes applicables

Bertel doit respecter les principes suivants :

- finalité déterminée : les données servent au référentiel touristique, à la relation prestataire, à la qualité, à la publication, à la conformité et à la sécurité ;
- minimisation : aucune donnée personnelle non nécessaire ne doit être saisie ;
- exactitude : les contacts, rôles, statuts et informations publiées doivent être mis à jour ;
- limitation de conservation : chaque famille de données doit avoir une durée validée ;
- intégrité et confidentialité : accès par rôle, RLS, audit, cloisonnement public/interne ;
- responsabilité : les choix, contrôles et incidents doivent être documentés.

## 4. Catégories de données Bertel

| Catégorie | Exemples | Sensibilité |
|---|---|---|
| Comptes utilisateurs | email, nom, avatar, rôle, langue, organisation, permissions, session. | Données personnelles internes. |
| Prestataires et acteurs | nom, fonction, contacts, rattachement à un objet, photo de portrait (`actor.photo_url`). | Principalement professionnel ; sensible si coordonnées personnelles ou portrait. Le consentement (`actor_consent`) n'est PAS capté à ce jour (table non alimentée) — voir §4 note et §7. |
| Contacts publics | téléphone, email, site web, réseaux sociaux d'un établissement. | Donnée professionnelle publiable si destinée au public. |
| Notes et CRM | interactions, tâches, demandes, historique relationnel, commentaires ; champ `extra` (JSONB) pouvant contenir interlocuteur_email, humeur_raw, sentiment. | Interne ; zone principale de vigilance RGPD. |
| Avis de tiers (`object_review`) | nom, avatar, contenu rédigé par un tiers. | Donnée personnelle de tiers ; souvent omise des inventaires. |
| Incidents (`incident_report`) | déclarant citoyen : nom, email, géolocalisation, photos. | Interne ; propagation automatique en CRM. |
| Audits | observations, scores. | Interne ; peut contenir données incidentelles. |
| Médias | photos, vidéos, crédits, descriptions, droits d'usage. | Peut contenir images de personnes ou métadonnées. Le bucket média est PUBLIC et listable. Une « analyse IA » des médias N'EST PAS en service à ce jour (aucun code). |
| Juridique et conformité (`object_legal`) | SIRET/SIREN, raison sociale, licences, assurances, justificatifs, dates de validité. | Données pro ; le SIRET/SIREN/raison sociale d'un entrepreneur individuel constitue une donnée personnelle. |
| Authentification temps réel | identité de l'utilisateur exposée via Supabase Realtime / presence. | Donnée personnelle interne. |
| Logs et versions | auteur, horodatage, avant/après, identifiants techniques. | Preuve de conformité et sécurité ; le journal d'audit copie l'intégralité de l'état avant/après (PII incluse) — voir §11. |

> Photos de portrait d'acteurs et consentement : la fiche acteur peut porter une photo de portrait (image d'une personne physique) stockée dans un bucket public (seule protection : un chemin de fichier non devinable, ce qui n'est pas un contrôle d'accès). La table `actor_consent` existe mais n'est alimentée par aucun chemin d'écriture : le consentement n'est pas capté à ce jour. Le consentement ne peut donc PAS être présenté comme une mesure en place — c'est une mesure à mettre en œuvre.

## 5. Règles de saisie et publication

Les utilisateurs doivent :

- choisir le champ prévu plutôt que détourner une note libre ;
- séparer strictement les informations publiques, partenaires et internes ;
- contrôler les médias avant publication ;
- ne pas publier les coordonnées personnelles d'un acteur sans base valable et information appropriée ;
- éviter tout commentaire subjectif ou sensible dans les notes ;
- signaler les erreurs de publication contenant des données personnelles ;
- utiliser la modération lorsque le changement a un impact public ou sensible.

## 6. Accès, rôles et permissions

Les droits sont attribués selon l'organisation active, les rôles métier, les rôles admin et les permissions. Le principe de moindre privilège est obligatoire.

Contrôles minimaux :

1. Compte nominatif pour chaque utilisateur.
2. Désactivation rapide au départ d'une personne.
3. Revue trimestrielle des droits admin et permissions sensibles.
4. Revue semestrielle des accès métier.
5. Justification des accès CRM, audit, incident, juridique et logs.
6. Interdiction d'utiliser un compte partagé ou un secret `service_role` côté navigateur.

## 7. Bases légales candidates à confirmer

| Traitement | Base candidate | Validation requise |
|---|---|---|
| Comptes et sécurité | Exécution d'une mission / contrat de travail ou intérêt légitime de sécurité. | Responsable de traitement. |
| Référentiel touristique public | Mission d'intérêt public ou intérêt légitime de promotion touristique selon nature de l'organisme. | Juridique / référent RGPD interne. |
| Contacts prestataires | Intérêt légitime, contrat, mission publique ou consentement selon contexte. | Référent RGPD interne. |
| Consentements acteurs (dont photo de portrait) | Consentement lorsque requis. ATTENTION : la table `actor_consent` existe mais n'est alimentée par aucun chemin d'écriture — le consentement n'est PAS capté à ce jour et ne peut être invoqué comme base juridique appliquée. [À VALIDER PAR LE DPO : mettre en œuvre la captation et la preuve du consentement avant de fonder un traitement (notamment le portrait d'acteur) sur cette base.] | Référent RGPD interne. |
| CRM relationnel | Intérêt légitime ou mission publique, limité au suivi métier entre l'office et les prestataires. | Référent RGPD interne. |
| Audits/incidents | Mission publique, intérêt légitime, obligation de sécurité selon cas. | Référent RGPD interne / juridique. |
| Logs et sécurité | Obligation de sécurité et intérêt légitime. | Référent RGPD interne. |

## 8. Information des personnes

Chaque personne concernée doit disposer d'une information claire : identité du responsable, finalités, bases légales, données, destinataires, durées, droits, contact du référent RGPD interne, transferts éventuels et voies de réclamation.

À mettre en place :

- mention d'information pour utilisateurs internes ;
- mention d'information pour prestataires/acteurs ;
- mention pour déclarants d'incident lorsque leur identité est collectée ;
- mention ou clause pour import de données historiques ;
- notice publique sur les fiches ou formulaires concernés.

## 9. Droits des personnes

Le canal officiel de demande doit être publié ou communiqué. Toute demande est transmise au référent RGPD interne sans délai.

Règles internes :

1. Accuser réception.
2. Vérifier l'identité lorsque nécessaire.
3. Identifier les tables concernées : `auth.users`, `app_user_profile`, `actor`, `actor_channel`, `actor_consent` (table existante mais non alimentée à ce jour), `object_review`, `object_legal`, `crm_interaction` (dont `extra` JSONB), `crm_task`, `incident_report`, `media` (dont portraits d'acteurs), `audit.audit_log` et `object_version` selon limites légales.
4. Répondre dans le délai légal d'un mois, avec prolongation possible uniquement si justifiée et informée.
5. Documenter la réponse et les actions.

> État réel de l'effacement et du journal d'audit (à connaître pour répondre aux demandes au titre de l'Art. 17) : aucune fonction automatisée d'effacement ou d'anonymisation n'existe à ce jour — un effacement est une opération MANUELLE (suppression ciblée sous contrôle technique). De plus, le journal d'audit (`audit.audit_log`) conserve une copie complète (état avant/après, données personnelles incluses) de chaque modification et suppression sur l'ensemble des tables, attribuée à l'utilisateur, pendant 12 mois glissants. Une donnée supprimée reste donc présente dans le journal d'audit jusqu'à 12 mois ; sa purge ciblée doit être effectuée manuellement lorsque la demande l'exige. Le versioning `object_version` n'est, lui, pas purgé automatiquement.

## 10. Violations de données

Tout utilisateur doit signaler immédiatement :

- accès non autorisé ;
- publication accidentelle de coordonnées privées ;
- export envoyé au mauvais destinataire ;
- fuite de secret API ;
- perte de données ou altération ;
- média exposant une personne non concernée ;
- erreur RLS ou permission permettant une lecture hors périmètre.

Le référent RGPD interne, avec l'appui sécurité, évalue le risque. Si la violation présente un risque pour les droits et libertés, la notification à la CNIL doit être préparée dans les 72 heures à compter de la connaissance de la violation. Les personnes concernées sont informées si le risque est élevé.

## 11. Conservation et suppression

Conservation : aucune purge ni anonymisation automatique des données personnelles n'est en place à ce jour (les seules tâches planifiées concernent le rafraîchissement de vues et la rotation des partitions d'audit à 12 mois). Les durées de conservation indiquées ci-dessous sont des cibles de politique, à appliquer manuellement tant que des purges automatiques ne sont pas implémentées.

État réel de l'effacement et du journal d'audit (à connaître pour répondre aux demandes au titre de l'Art. 17) : aucune fonction automatisée d'effacement ou d'anonymisation n'existe à ce jour — un effacement est une opération MANUELLE (suppression ciblée sous contrôle technique). De plus, le journal d'audit (`audit.audit_log`) conserve une copie complète (état avant/après, données personnelles incluses) de chaque modification et suppression sur l'ensemble des tables, attribuée à l'utilisateur, pendant 12 mois glissants. Une donnée supprimée reste donc présente dans le journal d'audit jusqu'à 12 mois ; sa purge ciblée doit être effectuée manuellement lorsque la demande l'exige. Le versioning `object_version` n'est, lui, pas purgé automatiquement.

| Famille | Durée proposée à valider | Commentaire |
|---|---|---|
| Comptes désactivés | À compléter, par exemple durée courte après départ puis suppression. | Conserver les traces strictement nécessaires. Suppression et anonymisation MANUELLES (aucune automatisation). |
| Contacts prestataires actifs | Tant que la relation est active + revue périodique. | Vérifier l'exactitude. |
| Consentements | Durée de la relation + preuve nécessaire. | À ce jour `actor_consent` n'est pas alimentée : aucun consentement n'est capté ni historisé — à mettre en œuvre. |
| CRM et notes privées | À compléter, par exemple 3 à 5 ans selon besoin métier. | Zone prioritaire de minimisation et de purge. Le champ `extra` (JSONB) peut contenir de la PII. Purge MANUELLE. |
| Incidents | À compléter selon gravité et obligations. | Ne pas conserver l'identité du déclarant si inutile. `incident_report` contient nom/email/géoloc/photos du déclarant, avec propagation automatique en CRM. |
| Journal d'audit (`audit.audit_log`) | 12 mois glissants (rotation mensuelle des partitions). | Copie l'image complète avant/après (PII incluse) de chaque UPDATE/DELETE de toutes les tables, attribuée à l'email de l'utilisateur. Purge ciblée d'une PII = opération manuelle. |
| Versions (`object_version`) | Non purgé automatiquement à ce jour. | Conserve l'historique des modifications ; purge à définir et à exécuter manuellement. |
| Médias | Tant que les droits sont valides et la diffusion utile. | Surveiller `rights_expires_at`. Images ré-encodées à l'upload (EXIF/IPTC/XMP supprimés) ; vidéos stockées telles quelles (métadonnées conteneur, dont GPS/appareil, NON supprimées — risque résiduel). Bucket public et listable ; `media.url` est une chaîne sans clé étrangère, donc les fichiers orphelins ne sont jamais nettoyés. |
| Pièces légales (`object_legal`) | Selon durée de validité + prescription applicable. | Ne pas surconserver les justificatifs. SIRET/SIREN/raison sociale d'un entrepreneur individuel = donnée personnelle. |

## 12. Sous-traitants et transferts

Hébergement et localisation des données (toutes dans l'Union européenne) :

- Application web (frontend Next.js, conteneur Docker) : OVHcloud, France (UE).
- Données personnelles (base de données PostgreSQL managée, authentification, stockage de fichiers, temps réel) : Supabase Inc. sur Amazon Web Services, région eu-west-1 (Irlande, UE) — projet « ryycrdhlkmzpxwwwwupy ».

Aucune donnée n'est hébergée hors de l'Union européenne.

Sous-traitants et destinataires réels :

- OVHcloud (France, UE) — hébergement de l'application web (frontend). Contrat de sous-traitance (DPA) OVHcloud à archiver.
- Supabase Inc. — base de données, authentification, stockage de fichiers, temps réel ; données dans l'UE (AWS eu-west-1, Irlande). DPA à archiver.
- Google (Google Ireland Ltd / Google LLC) — authentification via Google OAuth, UNIQUEMENT pour les utilisateurs internes de l'organisation (agents de l'office) ; les prestataires/acteurs et le public ne s'authentifient jamais via Google. Transfert hors UE potentiel encadré par le EU-US Data Privacy Framework [à confirmer et archiver].
- API Adresse / Base Adresse Nationale (data.gouv.fr, France) — géocodage des adresses saisies.
- Services chargés dans le navigateur du visiteur (reçoivent son adresse IP) : tuiles cartographiques OpenFreeMap + MapLibre, favicons DuckDuckGo, Google Fonts. L'auto-hébergement de ces ressources est recommandé pour limiter ces flux.

Aucun envoi d'e-mail/SMS applicatif n'est en place à ce jour.

L'authentification interne via Google OAuth constitue le seul flux susceptible d'impliquer un transfert hors UE ; il concerne exclusivement les agents internes de l'office. L'hébergement et les données restent intégralement dans l'Union européenne.

Pour chaque sous-traitant :

- contrat ou DPA ;
- localisation des données ;
- mesures de sécurité ;
- sous-traitants ultérieurs ;
- mécanisme de transfert hors UE si applicable ;
- procédure de notification d'incident ;
- durée de conservation et suppression.

## 12 bis. Mesures de sécurité — état réel

Authentification Supabase Auth + RBAC + RLS PostgreSQL (robuste) ; journalisation d'audit ; séparation client/service-role. À noter (ne pas surdéclarer) :

- le chiffrement au repos est une garantie des plateformes (OVHcloud, AWS/Supabase) ; il n'y a pas de chiffrement applicatif des colonnes ;
- aucun en-tête de sécurité applicatif (HSTS/CSP/X-Frame-Options) n'est configuré ;
- la MFA n'est pas déployée ;
- la protection « mot de passe compromis » est désactivée ;
- deux vues `SECURITY DEFINER` sont lisibles par le rôle anonyme et les buckets publics sont listables.

Ces derniers points sont des points d'amélioration identifiés, à traiter.

## 13. Privacy by design dans Bertel

Tout changement produit, DB ou API doit passer une revue courte :

- nouvelles données personnelles ?
- nouveau champ libre ?
- changement de visibilité public/interne ?
- nouveau rôle, permission ou RPC `SECURITY DEFINER` ?
- nouvel export ou partage partenaire ?
- nouveau média ou nouvelle analyse automatisée/IA des médias ? (aucune « analyse IA » des médias n'est en service à ce jour — toute introduction déclenche cette revue) ;
- nouvelle donnée de géolocalisation ?
- impact sur le registre ou l'AIPD ?

## 14. Indicateurs du référent RGPD interne

| Indicateur | Fréquence | Source |
|---|---|---|
| Demandes de droits reçues et délais de réponse | Mensuelle / annuelle | Registre du référent RGPD interne. |
| Violations et incidents de sécurité | À chaque incident + bilan annuel | Registre violations. |
| Nombre d'utilisateurs admin et droits sensibles | Trimestrielle | Page Équipe / RBAC. |
| Fiches avec contacts privés publiés par erreur | Mensuelle | Contrôle qualité. |
| Médias avec droits expirés | Mensuelle | `media.rights_expires_at`. |
| AIPD revues ou mises à jour | À chaque changement majeur | Dossier AIPD. |

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

> Note de revérification : seuls l'identité de l'organisation (SPL OTI DU SUD) et le référent RGPD interne sont repris tels quels du dossier badgeuse. L'hébergement OVHcloud France reste valable pour l'application web (frontend) de Bertel, mais les données personnelles de Bertel sont hébergées chez Supabase/AWS, région eu-west-1 (Irlande, UE) — élément propre à Bertel, distinct du dossier badgeuse. Les mesures de sécurité techniques décrites dans le dossier badgeuse NE doivent PAS être reprises telles quelles : elles ont été revérifiées dans le corps du présent document (voir §12 bis).

- `C:\Users\dphil\Downloads\Manuel_Utilisateur_Badgeuse_OTI (7).pdf` : modèle de manuel utilisateur interne OTI.
- `C:\Users\dphil\Downloads\Reglement_RGPD_Badgeuse_OTISUD (3).pdf` : identité SPL OTI DU SUD et référent RGPD interne (réutilisables). L'hébergement OVH France s'applique au frontend de Bertel ; les mentions de sécurité et l'absence globale de transfert hors UE sont à revérifier au regard de l'architecture Bertel (voir §12 et §12 bis).
- `C:\Users\dphil\Downloads\DPIA_Badgeuse_OTISUD (3).pdf` : modèle d'analyse proportionnée ; les éléments techniques (HTTPS, RLS, logs) sont à reprendre uniquement après revérification dans le corps du document (voir §12 bis).
