# Procédures DPO opérationnelles - Bertel

Demandes de droits, violations, registre, AIPD, accès, conservation et contrôles

> Statut : procédures de travail à adapter à l'organisation. Les délais légaux doivent être pilotés par le DPO ou le référent désigné.
> Version : 13 juin 2026.

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


## 1. Procédure de tenue du registre

Déclencheurs de mise à jour :

- nouvelle table ou nouveau champ personnel ;
- nouveau module UI ou API ;
- nouveau sous-traitant ;
- nouvel export ou partage ;
- changement de base légale, durée ou destinataire ;
- incident révélant un traitement non documenté.

Étapes :

1. Identifier le traitement concerné.
2. Mettre à jour la fiche registre.
3. Vérifier les mentions d'information.
4. Évaluer si l'AIPD doit être créée ou revue.
5. Faire valider par le DPO.
6. Conserver la preuve de validation.

## 2. Procédure de demande de droits

Canaux possibles : adresse DPO, formulaire, courrier, demande reçue par un agent, demande via prestataire.

1. Enregistrer la demande : date, identité, canal, droit exercé, périmètre.
2. Accuser réception.
3. Vérifier l'identité uniquement si nécessaire et de manière proportionnée.
4. Identifier les tables : `auth.users`, `app_user_profile`, `actor`, `actor_channel`, `actor_consent`, `contact_channel`, `crm_interaction`, `crm_task`, `incident_report`, `object_private_description`, logs selon limites.
5. Geler toute suppression automatique qui pourrait empêcher la réponse.
6. Préparer la réponse : accès, rectification, effacement, limitation, opposition, portabilité si applicable.
7. Répondre dans le délai d'un mois. Si la demande est complexe, documenter la prolongation et informer la personne dans le délai initial.
8. Journaliser la réponse et les actions effectuées.

| Champ de registre droits | Exemple |
|---|---|
| Référence | DDP-2026-001 |
| Date de réception | À compléter |
| Demandeur | À compléter |
| Droit exercé | Accès / rectification / effacement / opposition / limitation |
| Tables concernées | À compléter |
| Responsable interne | DPO |
| Échéance un mois | À compléter |
| Réponse envoyée | À compléter |
| Action technique | À compléter |

## 3. Procédure de violation de données personnelles

Une violation peut être une destruction, perte, altération, divulgation ou accès non autorisé à des données personnelles.

Déclencheurs Bertel :

- contact privé publié ;
- interaction OTI/prestataire ou note CRM rendue visible hors périmètre ;
- média exposant une personne ou document personnel ;
- erreur RLS donnant accès à des données internes ;
- invitation ou rôle attribué à la mauvaise personne ;
- export envoyé au mauvais destinataire ;
- secret Supabase ou token exposé ;
- perte ou altération de données ;
- accès suspect dans les logs.

Étapes immédiates :

1. Contenir : retirer la publication, couper l'accès, révoquer token, désactiver compte si nécessaire.
2. Préserver les preuves : horodatage, captures internes, logs, personnes impliquées.
3. Qualifier : données, personnes, volume, durée d'exposition, destinataires, contexte.
4. Évaluer le risque pour les droits et libertés.
5. Décider notification CNIL dans les 72 heures si risque.
6. Informer les personnes concernées si risque élevé.
7. Corriger la cause racine et documenter.
8. Clôturer avec mesures préventives.

| Champ registre violation | Valeur |
|---|---|
| Référence | VIOL-YYYY-NNN |
| Date de connaissance | À compléter |
| Description | À compléter |
| Données concernées | À compléter |
| Personnes concernées | À compléter |
| Cause | À compléter |
| Mesures immédiates | À compléter |
| Risque | Aucun / risque / risque élevé |
| CNIL notifiée | Oui / non / motif |
| Personnes informées | Oui / non / motif |
| Actions préventives | À compléter |

## 4. Procédure d'accès, arrivée et départ utilisateur

Arrivée :

1. Valider le besoin métier et l'organisation.
2. Créer ou inviter le compte nominatif.
3. Attribuer le rôle métier minimal.
4. Ajouter un rôle admin seulement si nécessaire.
5. Vérifier les permissions effectives.
6. Informer l'utilisateur du règlement RGPD interne.

Départ ou changement de poste :

1. Désactiver l'appartenance organisation.
2. Révoquer rôles admin et permissions.
3. Vérifier les tâches/objets assignés.
4. Conserver ou anonymiser le profil selon politique de conservation.
5. Documenter l'action.

Revue périodique :

- droits admin : trimestriel ;
- permissions sensibles : trimestriel ;
- membres actifs : semestriel ;
- comptes sans activité : à définir.

## 5. Procédure de publication contact et média

Avant publication d'un contact :

- le canal est-il professionnel ou destiné au public ?
- la coordonnée est-elle bien publique/professionnelle, et non personnelle ou réservée aux échanges internes ?
- `is_public` est-il correct ?
- la personne est-elle informée ?
- le contact est-il exact et à jour ?
- le rôle du canal est-il renseigné ?

Avant publication d'un média :

- droit d'usage documenté ;
- crédit renseigné si nécessaire ;
- absence de personne identifiable non autorisée ;
- absence de plaque, document, email ou numéro privé ;
- visibilité correcte ;
- date d'expiration contrôlée ;
- description accessible si diffusion publique.

## 6. Procédure AIPD et privacy by design

Créer ou réviser l'AIPD si :

- nouveau traitement potentiellement à risque ;
- changement de finalité ;
- nouvelle analyse IA ou enrichissement automatisé ;
- nouvelle géolocalisation ou média sensible ;
- élargissement de diffusion ;
- changement d'hébergement/sous-traitant ;
- incident significatif ;
- nouveau public de personnes concernées.

Checklist de revue :

1. Finalité claire.
2. Base légale candidate.
3. Données minimales.
4. Accès et RLS.
5. Durée de conservation.
6. Information des personnes.
7. Droits exerçables.
8. Sous-traitants et transferts.
9. Risques et mesures.
10. Validation DPO.

## 7. Procédure imports et données historiques

1. Identifier la source et le responsable de la source.
2. Profiler les colonnes personnelles.
3. Supprimer les colonnes inutiles avant import.
4. Charger en staging.
5. Contrôler doublons, exactitude et obsolescence.
6. Documenter mapping et décisions.
7. Promouvoir uniquement les données nécessaires.
8. Purger ou archiver les lots rejetés selon durée validée.
9. Mettre à jour le registre si la finalité change.

## 8. Procédure conservation, purge et anonymisation

La politique de conservation doit être validée avant automatisation. À défaut, aucune purge massive ne doit être lancée sans accord DPO/technique.

Ordre de travail :

1. Définir les durées par famille de données.
2. Définir ce qui doit rester en preuve légale ou sécurité.
3. Choisir suppression, anonymisation ou archivage restreint.
4. Tester sur environnement non production.
5. Vérifier impact sur intégrité, audits et versioning.
6. Journaliser l'opération.
7. Mettre à jour le registre.

<!-- PAGE_BREAK -->

## 9. Modèle de mention d'information courte

À adapter selon canal :

| Élément | Texte à adapter |
|---|---|
| Responsable | Vos données sont traitées par SPL OTI DU SUD, 379 Rue Hubert Delisle, 97430 Le Tampon, pour la gestion du référentiel touristique Bertel. |
| Finalités | Publication des informations touristiques, relation prestataires, qualité, conformité et sécurité. |
| Données | Coordonnées professionnelles, informations de relation, traces d'administration et, le cas échéant, signalements. |
| Base légale | À préciser selon le traitement : mission publique, intérêt légitime, contrat, obligation légale ou consentement. |
| Destinataires | Agents habilités, administrateurs, partenaires autorisés et sous-traitants techniques. Certaines données peuvent être publiées si elles sont destinées au public. |
| Durée | Les données sont conservées selon une politique validée, proportionnée à la finalité. |
| Droits | Vous pouvez exercer vos droits auprès de David Philippe, référent RGPD, d.philippe@otisud.com. Vous pouvez aussi saisir la CNIL. |

## 10. Rapport annuel DPO - indicateurs suggérés

| Indicateur | Donnée attendue |
|---|---|
| Demandes de droits | Nombre, type, délai moyen, retard éventuel. |
| Violations | Nombre, niveau de risque, notification CNIL/personnes, actions préventives. |
| AIPD | Créées, revues, actions ouvertes/fermées. |
| Accès | Nombre d'admins, revues réalisées, comptes désactivés. |
| Données | purges, corrections, contacts/médias revus. |
| Formation | Utilisateurs formés au RGPD et aux notes CRM. |
| Sous-traitants | Revue DPA, transferts, incidents fournisseur. |

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
