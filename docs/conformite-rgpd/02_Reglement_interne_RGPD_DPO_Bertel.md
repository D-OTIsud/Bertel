# Règlement interne de conformité RGPD et gouvernance DPO

Règles d'utilisation, responsabilités, contrôles et preuves de conformité pour Bertel

> Statut : modèle interne à valider. Ce document ne remplace pas l'avis du DPO, du juriste ou du responsable de traitement.
> Version : 13 juin 2026. Informations organisationnelles reprises du dossier badgeuse OTI SUD, à confirmer si Bertel diffère.

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
| Référent RGPD | David Philippe - Manager SI |
| Contact RGPD | d.philippe@otisud.com - 06 93 41 92 91 |
| Hébergement de référence | OVH France, UE, sans transfert hors UE, à confirmer si l'architecture Bertel diffère |


## Posture données Bertel

En l'état du périmètre décrit, environ 95 % des informations stockées dans Bertel sont publiques ou destinées à être publiées : fiches touristiques, descriptions, horaires, coordonnées professionnelles d'établissement, médias de promotion, classifications, tarifs, équipements et statuts de publication. Le risque RGPD principal ne vient donc pas du référentiel public lui-même, mais des zones internes : interactions entre l'office de tourisme et les prestataires, notes CRM, tâches, historiques de relation, coordonnées personnelles lorsqu'elles diffèrent des coordonnées publiques ou professionnelles, et erreurs de publication accidentelles.


## 2. Gouvernance

| Rôle | Responsabilité |
|---|---|
| Responsable de traitement | SPL OTI DU SUD - 379 Rue Hubert Delisle, 97430 Le Tampon - SIREN 882 699 556. |
| DPO / référent protection des données | David Philippe - Manager SI - d.philippe@otisud.com - 06 93 41 92 91. |
| Responsable produit Bertel | Maintient la cohérence métier, priorise les corrections de conformité. |
| Administrateur plateforme | Gère configuration, sécurité, accès techniques, logs et incidents. |
| Administrateur d'organisation | Gère membres, rôles et permissions dans son périmètre. |
| Utilisateur métier | Saisit, corrige et consulte les données en respectant le présent règlement. |
| Sous-traitants | OVH France, Supabase/PostgreSQL et services associés à confirmer ; le dossier badgeuse indique OVH France, sans transfert hors UE. |

Le DPO doit pouvoir être contacté facilement par les personnes concernées et par les utilisateurs internes. Le DPO tient ou supervise le registre, les AIPD, les procédures de droits et les violations.

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
| Prestataires et acteurs | nom, fonction, contacts, rattachement à un objet, consentements. | Principalement professionnel ; sensible si coordonnées personnelles ou consentements. |
| Contacts publics | téléphone, email, site web, réseaux sociaux d'un établissement. | Donnée professionnelle publiable si destinée au public. |
| Notes et CRM | interactions, tâches, demandes, historique relationnel, commentaires. | Interne ; zone principale de vigilance RGPD. |
| Incidents et audits | déclarant, email, géolocalisation, photos, observations, scores. | Interne ; peut contenir données incidentelles. |
| Médias | photos, vidéos, crédits, descriptions, analyse IA, droits d'usage. | Peut contenir images de personnes ou métadonnées. |
| Juridique et conformité | SIRET, licences, assurances, justificatifs, dates de validité. | Données pro et pièces potentiellement confidentielles. |
| Logs et versions | auteur, horodatage, avant/après, identifiants techniques. | Preuve de conformité et sécurité. |

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
| Référentiel touristique public | Mission d'intérêt public ou intérêt légitime de promotion touristique selon nature de l'organisme. | Juridique/DPO. |
| Contacts prestataires | Intérêt légitime, contrat, mission publique ou consentement selon contexte. | DPO. |
| Consentements acteurs | Consentement lorsque requis ; preuve dans `actor_consent`. | DPO. |
| CRM relationnel | Intérêt légitime ou mission publique, limité au suivi métier entre l'office et les prestataires. | DPO. |
| Audits/incidents | Mission publique, intérêt légitime, obligation de sécurité selon cas. | DPO/juridique. |
| Logs et sécurité | Obligation de sécurité et intérêt légitime. | DPO. |

## 8. Information des personnes

Chaque personne concernée doit disposer d'une information claire : identité du responsable, finalités, bases légales, données, destinataires, durées, droits, DPO/contact, transferts éventuels et voies de réclamation.

À mettre en place :

- mention d'information pour utilisateurs internes ;
- mention d'information pour prestataires/acteurs ;
- mention pour déclarants d'incident lorsque leur identité est collectée ;
- mention ou clause pour import de données historiques ;
- notice publique sur les fiches ou formulaires concernés.

## 9. Droits des personnes

Le canal officiel de demande doit être publié ou communiqué. Toute demande est transmise au DPO/référent sans délai.

Règles internes :

1. Accuser réception.
2. Vérifier l'identité lorsque nécessaire.
3. Identifier les tables concernées : `auth.users`, `app_user_profile`, `actor`, `actor_channel`, `actor_consent`, `crm_interaction`, `crm_task`, `incident_report`, logs selon limites légales.
4. Répondre dans le délai légal d'un mois, avec prolongation possible uniquement si justifiée et informée.
5. Documenter la réponse et les actions.

## 10. Violations de données

Tout utilisateur doit signaler immédiatement :

- accès non autorisé ;
- publication accidentelle de coordonnées privées ;
- export envoyé au mauvais destinataire ;
- fuite de secret API ;
- perte de données ou altération ;
- média exposant une personne non concernée ;
- erreur RLS ou permission permettant une lecture hors périmètre.

L'équipe DPO/sécurité évalue le risque. Si la violation présente un risque pour les droits et libertés, la notification à la CNIL doit être préparée dans les 72 heures à compter de la connaissance de la violation. Les personnes concernées sont informées si le risque est élevé.

## 11. Conservation et suppression

| Famille | Durée proposée à valider | Commentaire |
|---|---|---|
| Comptes désactivés | À compléter, par exemple durée courte après départ puis anonymisation. | Conserver les traces strictement nécessaires. |
| Contacts prestataires actifs | Tant que la relation est active + revue périodique. | Vérifier l'exactitude. |
| Consentements | Durée de la relation + preuve nécessaire. | Garder l'historique de preuve. |
| CRM et notes privées | À compléter, par exemple 3 à 5 ans selon besoin métier. | Zone prioritaire de minimisation et de purge. |
| Incidents | À compléter selon gravité et obligations. | Ne pas conserver l'identité du déclarant si inutile. |
| Logs d'audit | À compléter selon sécurité/preuve, avec accès restreint. | Tables partitionnées mensuellement. |
| Médias | Tant que les droits sont valides et la diffusion utile. | Surveiller `rights_expires_at`. |
| Pièces légales | Selon durée de validité + prescription applicable. | Ne pas surconserver les justificatifs. |

## 12. Sous-traitants et transferts

La liste des sous-traitants doit être tenue à jour : Supabase/PostgreSQL, OVH France ou autre hébergeur effectif, stockage média, fournisseur d'authentification Google, email/invitation, supervision, sauvegardes et tout service d'analyse média. Le dossier badgeuse indique un hébergement OVH France, dans l'Union européenne, sans transfert hors UE ; ce point doit être confirmé ou adapté pour Bertel.

Pour chaque sous-traitant :

- contrat ou DPA ;
- localisation des données ;
- mesures de sécurité ;
- sous-traitants ultérieurs ;
- mécanisme de transfert hors UE si applicable ;
- procédure de notification d'incident ;
- durée de conservation et suppression.

## 13. Privacy by design dans Bertel

Tout changement produit, DB ou API doit passer une revue courte :

- nouvelles données personnelles ?
- nouveau champ libre ?
- changement de visibilité public/interne ?
- nouveau rôle, permission ou RPC `SECURITY DEFINER` ?
- nouvel export ou partage partenaire ?
- nouveau média ou analyse IA ?
- nouvelle donnée de géolocalisation ?
- impact sur le registre ou l'AIPD ?

## 14. Indicateurs DPO

| Indicateur | Fréquence | Source |
|---|---|---|
| Demandes de droits reçues et délais de réponse | Mensuelle / annuelle | Registre DPO. |
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

- `C:\Users\dphil\Downloads\Manuel_Utilisateur_Badgeuse_OTI (7).pdf` : modèle de manuel utilisateur interne OTI.
- `C:\Users\dphil\Downloads\Reglement_RGPD_Badgeuse_OTISUD (3).pdf` : identité SPL OTI DU SUD, référent RGPD, hébergement OVH France, absence de transfert hors UE et mesures de sécurité.
- `C:\Users\dphil\Downloads\DPIA_Badgeuse_OTISUD (3).pdf` : modèle d'analyse proportionnée, risque résiduel faible, Supabase/PostgreSQL, HTTPS, RLS et logs administratifs.
