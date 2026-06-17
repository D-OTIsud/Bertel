# Procédures DPO opérationnelles - Bertel

Demandes de droits, violations, registre, AIPD, accès, conservation et contrôles

> Statut : procédures de travail à adapter à l'organisation. Les délais légaux doivent être pilotés par le référent RGPD interne (aucun DPO formellement désigné au sens de l'Art. 37 à ce jour — cf. note [À VALIDER PAR LE DPO] ci-dessous).
> Version : 16 juin 2026.

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
| Application web (frontend) | OVHcloud, France (UE) |
| Données personnelles (base, authentification, stockage, temps réel) | Supabase Inc. sur AWS, région eu-west-1 (Irlande, UE) — projet « ryycrdhlkmzpxwwwwupy » |
| Localisation des données | Aucune donnée n'est hébergée hors de l'Union européenne |

> [À VALIDER PAR LE DPO : harmoniser la qualification du référent dans tout le pack. Le document public (rgpd.md) indique qu'aucun DPO n'est formellement désigné au sens de l'Art. 37 et que M. Philippe assure la fonction de référent RGPD interne. Par défaut, employer « référent RGPD interne » partout. Signaler aussi le point d'indépendance Art. 38(6) : cumul des fonctions Manager SI / référent RGPD à arbitrer avec la direction.]

### Hébergement et localisation des données

Hébergement et localisation des données (toutes dans l'Union européenne) :
- Application web (frontend Next.js, conteneur Docker) : OVHcloud, France (UE).
- Données personnelles (base de données PostgreSQL managée, authentification, stockage de fichiers, temps réel) : Supabase Inc. sur Amazon Web Services, région eu-west-1 (Irlande, UE) — projet « ryycrdhlkmzpxwwwwupy ».
Aucune donnée n'est hébergée hors de l'Union européenne.


## Posture données Bertel

En l'état du périmètre décrit, environ 95 % des informations stockées dans Bertel sont publiques ou destinées à être publiées : fiches touristiques, descriptions, horaires, coordonnées professionnelles d'établissement, médias de promotion, classifications, tarifs, équipements et statuts de publication. Le risque RGPD principal ne vient donc pas du référentiel public lui-même, mais des zones internes : interactions entre l'office de tourisme et les prestataires, notes CRM, tâches, historiques de relation, coordonnées personnelles lorsqu'elles diffèrent des coordonnées publiques ou professionnelles, et erreurs de publication accidentelles.

Catégories de données personnelles à ne pas omettre du registre et des analyses : avis de tiers (`object_review` : nom, avatar, contenu) ; signalements de citoyens (`incident_report` : nom, e-mail, géolocalisation, photos ; avec propagation automatique en CRM) ; mentions légales d'établissement (`object_legal` : SIRET/SIREN/raison sociale, qui constituent des données personnelles pour les entrepreneurs individuels) ; champs libres CRM (JSONB `extra` : interlocuteur_email, humeur, sentiment) ; identité utilisateur diffusée par le temps réel Supabase (Realtime/presence). Une photo de portrait d'acteur (`actor.photo_url`) peut également être stockée dans un bucket public.

Posture de sécurité — état réel : authentification Supabase Auth + RBAC + RLS PostgreSQL (robuste) ; journalisation d'audit ; séparation client/service-role. À noter (ne pas surdéclarer) : le chiffrement au repos est une garantie des plateformes (OVHcloud, AWS/Supabase), il n'y a pas de chiffrement applicatif des colonnes ; aucun en-tête de sécurité applicatif (HSTS/CSP/X-Frame-Options) n'est configuré ; la MFA n'est pas déployée ; la protection « mot de passe compromis » est désactivée ; deux vues SECURITY DEFINER sont lisibles par le rôle anonyme et les buckets publics sont listables (points d'amélioration identifiés).


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
5. Faire valider par le référent RGPD interne.
6. Conserver la preuve de validation.

Le journal d'audit (`audit.audit_log`) doit figurer au registre comme un traitement à part entière. Il conserve une copie complète (état avant/après, données personnelles incluses : e-mails, noms, texte libre CRM) de chaque modification et suppression sur l'ensemble des tables, attribuée à l'e-mail de l'utilisateur, pendant 12 mois glissants (rotation mensuelle des partitions). Le versioning `object_version` n'est, lui, pas purgé automatiquement.

## 2. Procédure de demande de droits

Canaux possibles : adresse DPO, formulaire, courrier, demande reçue par un agent, demande via prestataire.

1. Enregistrer la demande : date, identité, canal, droit exercé, périmètre.
2. Accuser réception.
3. Vérifier l'identité du demandeur de manière proportionnée : confirmer qu'il s'agit bien de la personne concernée avant toute communication ou action, en cas de doute raisonnable demander un justificatif d'identité (sans collecter plus que nécessaire) ; ne pas répondre à une demande dont l'identité n'a pu être établie.
4. Identifier les tables : `auth.users`, `app_user_profile`, `actor`, `actor_channel`, `actor_consent`, `contact_channel`, `crm_interaction`, `crm_task`, `incident_report`, `object_review`, `object_legal`, `object_private_description`, `media`/`actor.photo_url` (portraits), `audit.audit_log` et `object_version` selon limites.
5. Effacement et journal d'audit : aucune fonction automatisée d'effacement ou d'anonymisation n'existe à ce jour — un effacement est une opération MANUELLE (suppression ciblée sous contrôle technique). De plus, le journal d'audit (`audit.audit_log`) conserve une copie complète (état avant/après, données personnelles incluses) de chaque modification et suppression sur l'ensemble des tables, attribuée à l'utilisateur, pendant 12 mois glissants. Une donnée supprimée reste donc présente dans le journal d'audit jusqu'à 12 mois ; sa purge ciblée doit être effectuée manuellement lorsque la demande l'exige. Le versioning `object_version` n'est, lui, pas purgé automatiquement. Il n'existe pas de « suppression automatique » à geler : le vrai point de vigilance est la rotation mensuelle des partitions d'audit, qui ne doit pas faire disparaître une trace nécessaire au traitement de la demande avant qu'elle ne soit traitée.
6. Préparer la réponse : accès, rectification, effacement, limitation, opposition, portabilité si applicable.
7. Répondre dans le délai d'un mois à compter de la réception de la demande. Ce délai peut être prolongé de deux mois supplémentaires (soit trois mois au total) compte tenu de la complexité et du nombre de demandes ; dans ce cas, en informer la personne dans le délai initial d'un mois en précisant les motifs de la prolongation.
8. Journaliser la réponse et les actions effectuées.

| Champ de registre droits | Exemple |
|---|---|
| Référence | DDP-2026-001 |
| Date de réception | À compléter |
| Demandeur | À compléter |
| Droit exercé | Accès / rectification / effacement / opposition / limitation |
| Tables concernées | À compléter |
| Responsable interne | Référent RGPD interne |
| Identité vérifiée | Oui / non / méthode |
| Échéance un mois | À compléter |
| Prolongation (jusqu'à +2 mois) | Oui / non / motif / date d'information |
| Réponse envoyée | À compléter |
| Action technique (effacement manuel, purge audit ciblée) | À compléter |

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
4. Évaluer le risque pour les droits et libertés à l'aide de critères explicites : type de violation (confidentialité, intégrité, disponibilité) ; nature et sensibilité des données (un avis ou un signalement contient nom, e-mail, géolocalisation et parfois photo ; les champs CRM peuvent contenir du texte libre sensible) ; facilité d'identification des personnes ; gravité des conséquences possibles ; volume de personnes et d'enregistrements concernés ; caractéristiques particulières des personnes (mineurs, personnes vulnérables). Seuils : tout risque pour les droits et libertés déclenche la notification CNIL ; un risque ÉLEVÉ déclenche en plus l'information des personnes concernées.
5. Décider la notification CNIL dans les 72 heures dès lors qu'un risque pour les droits et libertés des personnes existe (documenter la motivation en cas de non-notification).
6. Informer les personnes concernées sans délai injustifié en cas de risque élevé.
7. Corriger la cause racine et documenter.
8. Clôturer avec mesures préventives.
9. Consigner la violation dans le registre des violations (tenu en interne, indépendamment de toute notification CNIL), conformément à l'obligation de documentation de l'Art. 33(5) : toute violation y est enregistrée, qu'elle soit notifiée ou non.

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
4. Conserver ou anonymiser le profil selon politique de conservation. Rappel : aucune anonymisation automatique n'existe ; cette opération est manuelle, et la trace de l'utilisateur subsiste dans le journal d'audit jusqu'à 12 mois.
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

Métadonnées des médias : les images sont ré-encodées à l'upload, ce qui supprime leurs métadonnées EXIF/IPTC/XMP (GPS, appareil) — mesure en place. Les vidéos sont en revanche stockées telles quelles : leurs métadonnées de conteneur (pouvant contenir GPS/appareil) NE SONT PAS supprimées (limite documentée, pas de transcodeur serveur), à traiter comme un risque résiduel à vérifier manuellement avant toute publication d'une vidéo.

Le bucket média est public et listable, et `media.url` est une simple chaîne sans clé étrangère : les fichiers retirés (upload annulé, ré-upload, suppression de ligne) ne sont jamais nettoyés (orphelins). Un média « dépublié » côté base peut rester accessible par son URL ; une suppression effective doit donc être réalisée manuellement au niveau du stockage.

Photos de portrait d'acteurs et consentement : la fiche acteur peut porter une photo de portrait (image d'une personne physique) stockée dans un bucket public (seule protection : un chemin de fichier non devinable, ce qui n'est pas un contrôle d'accès). La table `actor_consent` existe mais n'est alimentée par aucun chemin d'écriture : le consentement n'est pas capté à ce jour. Le consentement ne peut donc PAS être présenté comme une mesure en place — c'est une mesure à mettre en œuvre.

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
8. Sous-traitants et transferts (cf. liste réelle des sous-traitants au §10 : OVHcloud France, Supabase/AWS Irlande, Google OAuth pour les utilisateurs internes uniquement, API Adresse/BAN).
9. Risques et mesures.
10. Validation par le référent RGPD interne.

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

État réel : aucune purge ni anonymisation automatique des données personnelles n'est en place à ce jour (les seules tâches planifiées concernent le rafraîchissement de vues et la rotation des partitions d'audit à 12 mois). Les durées de conservation indiquées sont des cibles de politique, à appliquer manuellement tant que des purges automatiques ne sont pas implémentées.

La politique de conservation doit être validée avant automatisation. À défaut, aucune purge massive ne doit être lancée sans accord du référent RGPD interne et de l'équipe technique.

État réel de l'effacement et du journal d'audit (à connaître pour répondre aux demandes au titre de l'Art. 17) : aucune fonction automatisée d'effacement ou d'anonymisation n'existe à ce jour — un effacement est une opération MANUELLE (suppression ciblée sous contrôle technique). De plus, le journal d'audit (`audit.audit_log`) conserve une copie complète (état avant/après, données personnelles incluses) de chaque modification et suppression sur l'ensemble des tables, attribuée à l'utilisateur, pendant 12 mois glissants. Une donnée supprimée reste donc présente dans le journal d'audit jusqu'à 12 mois ; sa purge ciblée doit être effectuée manuellement lorsque la demande l'exige. Le versioning `object_version` n'est, lui, pas purgé automatiquement.

Ordre de travail :

1. Définir les durées par famille de données.
2. Définir ce qui doit rester en preuve légale ou sécurité.
3. Choisir suppression, anonymisation ou archivage restreint (toutes ces opérations sont aujourd'hui manuelles).
4. Tester sur environnement non production.
5. Vérifier impact sur intégrité, audits et versioning. En particulier, le journal d'audit (`audit.audit_log`, 12 mois glissants par rotation mensuelle des partitions) et `object_version` (non purgé) conservent des copies des données : la rotation des partitions d'audit est le seul mécanisme automatique de réduction de ces traces, et il ne constitue pas une purge ciblée par personne.
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
| Destinataires | Agents habilités, administrateurs, partenaires autorisés et sous-traitants techniques (hébergement de l'application chez OVHcloud en France, base de données et services chez Supabase/AWS en Irlande, authentification interne via Google, géocodage via l'API Adresse — tous dans l'Union européenne, sauf un flux d'authentification interne via Google pouvant impliquer un transfert hors UE encadré par le EU-US Data Privacy Framework). Certaines données peuvent être publiées si elles sont destinées au public. |
| Durée | Les données sont conservées selon une politique validée, proportionnée à la finalité (durées appliquées manuellement, aucune purge automatique en place à ce jour). |
| Droits | Vous pouvez exercer vos droits auprès de David Philippe, référent RGPD interne, d.philippe@otisud.com. Vous pouvez aussi saisir la CNIL. |

## 9 bis. Sous-traitants et destinataires réels

Sous-traitants et destinataires réels :
- OVHcloud (France, UE) — hébergement de l'application web (frontend). Contrat de sous-traitance (DPA) OVHcloud à archiver.
- Supabase Inc. — base de données, authentification, stockage de fichiers, temps réel ; données dans l'UE (AWS eu-west-1, Irlande). DPA à archiver.
- Google (Google Ireland Ltd / Google LLC) — authentification via Google OAuth, UNIQUEMENT pour les utilisateurs internes de l'organisation (agents de l'office) ; les prestataires/acteurs et le public ne s'authentifient jamais via Google. Transfert hors UE potentiel encadré par le EU-US Data Privacy Framework [à confirmer et archiver].
- API Adresse / Base Adresse Nationale (data.gouv.fr, France) — géocodage des adresses saisies.
- Services chargés dans le navigateur du visiteur (reçoivent son adresse IP) : tuiles cartographiques OpenFreeMap + MapLibre, favicons DuckDuckGo, Google Fonts. L'auto-hébergement de ces ressources est recommandé pour limiter ces flux.
Aucun envoi d'e-mail/SMS applicatif n'est en place à ce jour.

> [À VALIDER PAR LE DPO : confirmer et archiver le DPA OVHcloud, le DPA Supabase, et la couverture du transfert Google (EU-US Data Privacy Framework) pour l'authentification interne.]

## 10. Rapport annuel DPO - indicateurs suggérés

| Indicateur | Donnée attendue |
|---|---|
| Demandes de droits | Nombre, type, délai moyen, retard éventuel. |
| Violations | Nombre, niveau de risque, notification CNIL/personnes, actions préventives. |
| AIPD | Créées, revues, actions ouvertes/fermées. |
| Accès | Nombre d'admins, revues réalisées, comptes désactivés. |
| Données | purges manuelles, effacements ciblés (y compris purge ciblée du journal d'audit), corrections, contacts/médias revus. |
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

> Note de revérification (2026-06-16) : les éléments d'identité (SPL OTI DU SUD, référent RGPD interne) restent réutilisables. L'hébergement OVHcloud France reste valable, mais UNIQUEMENT pour l'application web (frontend) de Bertel : les données personnelles sont hébergées chez Supabase/AWS région eu-west-1 (Irlande, UE) — voir le tableau organisationnel et le §9 bis. Les mesures de sécurité techniques décrites pour le badgeuse NE doivent PAS être reprises aveuglément pour Bertel : elles ont été revérifiées dans le corps du présent document (cf. posture de sécurité — pas de chiffrement applicatif des colonnes, pas d'en-têtes de sécurité applicatifs HSTS/CSP/X-Frame-Options, MFA non déployée, protection « mot de passe compromis » désactivée, deux vues SECURITY DEFINER lisibles par le rôle anonyme, buckets publics listables).

- `C:\Users\dphil\Downloads\Manuel_Utilisateur_Badgeuse_OTI (7).pdf` : modèle de manuel utilisateur interne OTI.
- `C:\Users\dphil\Downloads\Reglement_RGPD_Badgeuse_OTISUD (3).pdf` : identité SPL OTI DU SUD, référent RGPD, hébergement OVH France (valable pour le frontend Bertel ; les données Bertel sont chez Supabase/AWS Irlande), absence de transfert hors UE et mesures de sécurité (à revérifier pour Bertel, cf. note ci-dessus).
- `C:\Users\dphil\Downloads\DPIA_Badgeuse_OTISUD (3).pdf` : modèle d'analyse proportionnée, risque résiduel faible, Supabase/PostgreSQL, HTTPS, RLS et logs administratifs (mesures à revérifier pour Bertel, cf. note ci-dessus).
