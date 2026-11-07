# Manuel utilisateur Bertel

Parcours métier, rôles, bonnes pratiques RGPD et exploitation quotidienne

> Statut : document de travail à valider par l'équipe produit, le responsable de traitement et le DPO.
> Version : 13 juin 2026. Périmètre : Bertel 3.0, UI Next.js, backend Supabase/PostgreSQL.

> [À VALIDER PAR LE DPO : harmoniser la qualification du référent dans tout le pack. Le document public (rgpd.md) indique qu'aucun DPO n'est formellement désigné au sens de l'Art. 37 et que M. Philippe assure la fonction de référent RGPD interne. Par défaut, employer « référent RGPD interne » partout (les mentions « DPO » de ce manuel sont à lire en ce sens). Signaler aussi le point d'indépendance Art. 38(6) : cumul des fonctions Manager SI / référent RGPD à arbitrer avec la direction.]

## 1. Objet du manuel

Bertel est la Base d'Enregistrement et de Référentiel Touristique des Établissements et Lieux. L'application centralise des fiches touristiques, des médias, des contacts, des relations avec les prestataires, des workflows de modération, des audits, des signalements et des informations de conformité.

Ce manuel s'adresse aux agents de l'office de tourisme, administrateurs d'organisation, administrateurs plateforme, contributeurs autorisés, référents qualité et DPO. Il décrit les actions attendues dans l'interface et les règles minimales à appliquer pour ne pas exposer de données personnelles inutiles.

## Posture données Bertel

En l'état du périmètre décrit, une part majoritaire des informations stockées dans Bertel est publique ou destinée à être publiée : fiches touristiques, descriptions, horaires, coordonnées professionnelles d'établissement, médias de promotion, classifications, tarifs, équipements et statuts de publication. La proportion souvent citée (« environ 95 % de données publiques ») est une estimation non sourcée, à nuancer : elle ne tient pas compte des catégories de données personnelles décrites ci-dessous (avis de tiers, signalements citoyens, données d'entrepreneurs individuels, journal d'audit). Le risque RGPD principal ne vient donc pas du référentiel public lui-même, mais des zones internes : interactions entre l'office de tourisme et les prestataires, notes CRM, tâches, historiques de relation, coordonnées personnelles lorsqu'elles diffèrent des coordonnées publiques ou professionnelles, signalements terrain, avis de tiers, et erreurs de publication accidentelles.

Catégories de données personnelles à connaître (souvent omises) : les avis (`object_review` : nom, avatar, contenu de tiers), les signalements (`incident_report` : nom, email, géolocalisation et photos du déclarant citoyen, avec propagation automatique vers le CRM), les informations juridiques (`object_legal` : SIRET/SIREN/raison sociale, qui constituent des données personnelles pour les entrepreneurs individuels), les portraits d'acteurs (`actor.photo_url`), les champs libres CRM (interlocuteur, sentiment, humeur), et l'identité utilisateur véhiculée par le temps réel Supabase (Realtime/présence).


## 2. Connexion et session

1. Accéder à l'URL de l'application Bertel.
2. Se connecter avec Google OAuth (réservé aux utilisateurs internes de l'organisation, c'est-à-dire aux agents de l'office ; les prestataires/acteurs et le public ne s'authentifient jamais via Google), ou avec email et mot de passe lorsque ce mode est configuré.
3. Vérifier que le nom, l'organisation active et les droits affichés correspondent au contexte de travail.
4. Se déconnecter après usage sur un poste partagé.

Le compte applicatif est relié à `auth.users` et `app_user_profile`. Le profil contient notamment l'email d'authentification, le nom d'affichage, l'avatar, la langue, le fuseau horaire, le rôle plateforme et les préférences.

## 3. Rôles et accès

| Profil | Usage principal | Points de vigilance |
|---|---|---|
| `owner` | Gouvernance plateforme et actions d'administration globale. | Accès très large ; réservé aux personnes habilitées. |
| `super_admin` | Administration technique/fonctionnelle transverse. | Peut accéder à des vues sensibles ; utiliser un compte nominatif. |
| `tourism_agent` | Exploitation métier quotidienne, selon permissions et organisation active. | Les droits effectifs dépendent de l'organisation, des rôles métier/admin et des permissions. |
| Admin d'organisation | Administration de l'équipe et des permissions d'une ORG. | Ne pas accorder plus de droits que nécessaire. |

La page Équipe permet de gérer les membres, les rôles métier, les rôles admin et les permissions. Les rôles d'administration utilisent un rang ; un administrateur ne doit pas modifier son propre rôle ou ses propres permissions.

## 4. Navigation principale

| Zone | Finalité | Données manipulées |
|---|---|---|
| Dashboard | Vue de pilotage qualité, offre, actualisation et filtres. | Agrégats, indicateurs, données de fiches touristiques. |
| Explorer | Recherche, carte, filtres et consultation des fiches. | Objets publiés, brouillons autorisés, médias, localisation, badges. |
| Fiche objet / édition | Création et modification des établissements, lieux, activités, événements, itinéraires et services. | Informations publiques, internes, légales et relationnelles. |
| Modération | Comparaison avant/après et décision sur les changements proposés. | `pending_change`, auteur, notes de revue, valeurs modifiées. |
| CRM | Annuaire acteurs, tâches, relances et timeline relationnelle. | Acteurs, contacts, interactions, tâches, notes métier. |
| Audits | Checklists terrain et incidents. | Résultats d'audit, signalements, photos, géolocalisation, déclarants. |
| Publications | Sélection et suivi des objets destinés aux supports édités. | Statuts de publication, rattachements. |
| Paramètres | Marque blanche, thèmes, paramètres d'application. | Paramètres visuels et d'organisation. |

## 5. Rechercher et consulter une fiche

1. Ouvrir Explorer.
2. Utiliser les filtres par type, commune, accessibilité, durabilité, horaires, labels ou carte.
3. Sélectionner une fiche dans la liste ou sur la carte.
4. Vérifier le statut : publié, brouillon visible aux éditeurs, archivé ou masqué selon droits.
5. Ne pas copier des informations internes dans des supports publics sans vérifier leur visibilité.

Les objets `ORG` sont des entités internes de rattachement institutionnel et ne sont pas exposés comme un type de recherche grand public.

## 6. Modifier une fiche objet

Les onglets suivent une logique métier : identité, taxonomie, localisation, descriptions, médias, contacts publics, caractéristiques, tarifs, horaires, relation prestataires, juridique, conformité, audits et modules conditionnels selon type.

Bonnes pratiques :

- Enregistrer par onglet lorsque le travail est terminé.
- Lire les messages de validation avant de quitter un onglet.
- Utiliser la modération lorsqu'un changement doit être revu avant publication.
- Distinguer les champs publics des champs internes.
- Vérifier la langue de chaque champ traduisible.
- Ne pas stocker dans une note interne des données sensibles ou hors sujet.

## 7. Médias et droits

Chaque média peut être rattaché à l'objet global ou à un sous-lieu. Il contient un type, un titre, une description, un crédit, une URL, une visibilité, un indicateur de publication, un média principal et une date d'expiration des droits. La date d'expiration des droits est une information de gestion : elle ne déclenche aucune purge automatique du fichier — le retrait du média reste une opération manuelle.

Métadonnées des médias : les images sont ré-encodées à l'upload, ce qui supprime leurs métadonnées EXIF/IPTC/XMP (GPS, appareil) — mesure en place. Les vidéos sont en revanche stockées telles quelles : leurs métadonnées de conteneur (pouvant contenir GPS/appareil) NE SONT PAS supprimées (limite documentée, pas de transcodeur serveur), à traiter comme un risque résiduel.

Avertissement stockage : le bucket des médias est public et listable, et l'URL d'un média est une simple chaîne sans contrôle d'accès ni lien de suppression automatique (un fichier dont la ligne est supprimée n'est pas nettoyé du stockage — orphelins possibles). Ne considérez pas un chemin de fichier non devinable comme une protection : tout fichier déposé dans ce bucket doit être traité comme potentiellement accessible.

Avant de publier un média :

- vérifier que les droits d'usage sont documentés ;
- renseigner le crédit lorsque nécessaire ;
- éviter les visages reconnaissables, plaques, documents administratifs ou informations personnelles visibles ;
- pour les vidéos, vérifier en amont qu'elles ne contiennent pas de métadonnées de géolocalisation/appareil, celles-ci n'étant pas supprimées à l'upload ;
- classer la visibilité : public, partenaires ou interne ;
- ajouter une description utile à l'accessibilité si le média est diffusé.

## 8. Contacts, acteurs et consentements

Bertel distingue :

- les contacts publics d'un établissement (`contact_channel`) : téléphone, email, site web, réseaux sociaux publiables ;
- les acteurs (`actor`) et leurs canaux (`actor_channel`) : personnes ou contacts liés à un objet ou une organisation. Ces canaux (téléphone, email, etc.) constituent des données à caractère personnel lorsqu'ils identifient une personne physique : ils sont à traiter comme des coordonnées internes, non publiables par défaut. La fiche acteur peut en outre porter une photo de portrait (`actor.photo_url`).

Photos de portrait d'acteurs et consentement : la fiche acteur peut porter une photo de portrait (image d'une personne physique) stockée dans un bucket public (seule protection : un chemin de fichier non devinable, ce qui n'est pas un contrôle d'accès). La table `actor_consent` existe mais n'est alimentée par aucun chemin d'écriture : le consentement n'est pas capté à ce jour. Le consentement ne peut donc PAS être présenté comme une mesure en place — c'est une mesure à mettre en œuvre.

Destinataires et transferts : les données personnelles sont traitées par des sous-traitants situés dans l'Union européenne (voir le tableau de sous-traitance du registre). Le seul flux potentiellement hors UE est l'authentification Google OAuth, et il ne concerne QUE les utilisateurs internes (agents de l'office) ; il n'expose donc pas les données des prestataires/acteurs ni du public.

Règles d'usage :

- publier uniquement les coordonnées destinées au public ;
- conserver les coordonnées personnelles (y compris les canaux d'acteur) dans les zones internes prévues ;
- ne PAS s'appuyer sur l'outil pour recueillir ou prouver un consentement : `actor_consent` n'est pas alimentée — lorsqu'un traitement repose sur le consentement, le recueil et la preuve doivent être organisés dans un processus hors-outil documenté (formulaire, autorisation de droit à l'image, etc.) ;
- supprimer ou archiver les contacts obsolètes après validation métier (la suppression est manuelle, voir §13) ;
- ne pas utiliser les contacts Bertel pour des finalités non prévues.

## 9. CRM, notes privées et relances

Le module CRM Bertel est un suivi relationnel métier, pas un pipeline commercial. Il sert à garder une trace des échanges avec les prestataires, des demandes, des relances et des tâches.

Les notes privées sont utiles pour assurer la continuité de service, mais elles doivent rester factuelles, proportionnées et non discriminatoires. Ne pas écrire d'appréciations personnelles inutiles, d'informations de santé, d'opinions politiques, de données familiales ou de jugements subjectifs sur une personne.

## 10. Audits et incidents

Les audits documentent des contrôles qualité. Les incidents documentent un signalement terrain : catégorie, gravité, statut, description, localisation, déclarant et médias éventuels.

À noter : les données personnelles du déclarant (nom, email, géolocalisation, photos) saisies dans un signalement sont propagées automatiquement vers le module CRM. Un signalement n'est donc pas une donnée cloisonnée : tout ce qui y est saisi sur le déclarant alimente la relation CRM. N'y collectez que le strict nécessaire.

À la saisie d'un incident :

1. Décrire le fait observable.
2. Indiquer la localisation seulement si elle est utile.
3. Éviter les données personnelles dans les photos et descriptions.
4. Ne collecter le nom/email du déclarant que si un suivi est nécessaire.
5. Passer en revue les pièces jointes avant diffusion ou partage.

## 11. Administration d'équipe

La page Équipe permet :

- d'inviter un membre ;
- d'associer un utilisateur à une organisation ;
- d'attribuer un rôle métier ;
- d'attribuer ou retirer un rôle admin ;
- d'accorder ou retirer des permissions ;
- de désactiver un membre.

Chaque action d'administration doit respecter le principe de moindre privilège. Les comptes doivent être nominatifs, désactivés au départ d'une personne et revus régulièrement.

## 12. Règles RGPD au quotidien

- Minimiser : collecter seulement ce qui sert au référentiel touristique, à la relation prestataire, à la qualité ou à la conformité.
- Cloisonner : ne pas placer des informations internes dans les champs publics.
- Vérifier : contrôler les contacts, médias et notes avant publication.
- Tracer : utiliser les workflows de modération et d'audit plutôt que des échanges informels.
- Protéger : ne pas partager d'exports hors des canaux autorisés.
- Signaler : tout incident de sécurité ou exposition involontaire doit être remonté immédiatement au DPO ou au référent désigné.

## 13. Support et escalade

| Situation | Action utilisateur | Escalade |
|---|---|---|
| Accès impossible | Vérifier compte, navigateur, session, URL. | Administrateur organisation ou plateforme. |
| Donnée personnelle affichée publiquement par erreur | Dépublier ou masquer si habilité, puis signaler. | DPO + responsable métier. |
| Fiche incorrecte ou obsolète | Corriger ou créer une demande modérée. | Référent qualité si conflit. |
| Suspicion de fuite ou accès non autorisé | Ne pas exporter, capturer les éléments factuels. | DPO immédiatement, procédure violation. |
| Demande d'accès/suppression d'une personne | Ne pas répondre seul si le périmètre est incertain ; l'effacement est une opération manuelle (voir la note ci-dessous), il n'existe pas de fonction « supprimer mes données » automatisée. | DPO ou canal officiel droits des personnes. |

État réel de l'effacement et du journal d'audit (à connaître pour répondre aux demandes au titre de l'Art. 17) : aucune fonction automatisée d'effacement ou d'anonymisation n'existe à ce jour — un effacement est une opération MANUELLE (suppression ciblée sous contrôle technique). De plus, le journal d'audit (`audit.audit_log`) conserve une copie complète (état avant/après, données personnelles incluses) de chaque modification et suppression sur l'ensemble des tables, attribuée à l'utilisateur, pendant 12 mois glissants. Une donnée supprimée reste donc présente dans le journal d'audit jusqu'à 12 mois ; sa purge ciblée doit être effectuée manuellement lorsque la demande l'exige. Le versioning `object_version` n'est, lui, pas purgé automatiquement.

## Sources projet utilisées

- `README.md` : positionnement Bertel, stack Next.js + Supabase/PostgreSQL, API et documentation.
- `ARCHITECTURE.md` et `docs/architecture/bertel-object-workspace-canonical-map.md` : carte fonctionnelle du workspace objet.
- `docs/architecture/OBJECT_DATA_DICTIONARY.md` : dictionnaire des données objet, contacts, médias, CRM, incidents, juridique, RLS et audit.
- `db-graph-out/DB_AGENT_INDEX.md`, `FUNCTIONS.md`, `POLICIES.md`, `TYPES.md` : cartographie DB, RPC, politiques RLS et enums.
- `dbdoc/*.md` : fiches de tables sensibles (`auth.users`, `app_user_profile`, `actor`, `actor_channel`, `actor_consent`, `contact_channel`, `object_private_description`, `crm_interaction`, `crm_task`, `incident_report`, `media`, `object_legal`, `audit.audit_log`).
- `bertel-tourism-ui/src/views/*` et `bertel-tourism-ui/src/services/*` : parcours UI, authentification, RBAC, CRM, modération, audits, médias.


## Sources internes transposées depuis le dossier badgeuse

> Note de revérification (Bertel ≠ badgeuse) : ces sources fournissent des éléments réutilisables (identité SPL OTI DU SUD, référent RGPD interne). En revanche, l'architecture diffère et a été revérifiée dans le corps de ce manuel : pour Bertel, l'application web (frontend) est bien hébergée chez OVHcloud France (mention valable), MAIS les données personnelles sont hébergées chez Supabase Inc. sur AWS, région eu-west-1 (Irlande, UE) — il faut nommer les DEUX hébergeurs. Aucune donnée n'est hébergée hors UE (seule réserve : l'authentification Google OAuth des utilisateurs internes). Les mesures de sécurité techniques du dossier badgeuse ne doivent pas être reprises aveuglément (chiffrement, en-têtes, MFA) : l'état réel des mesures de sécurité de Bertel est décrit dans le corps de ce manuel et dans le registre/DPIA Bertel.

- `C:\Users\dphil\Downloads\Manuel_Utilisateur_Badgeuse_OTI (7).pdf` : modèle de manuel utilisateur interne OTI.
- `C:\Users\dphil\Downloads\Reglement_RGPD_Badgeuse_OTISUD (3).pdf` : identité SPL OTI DU SUD, référent RGPD interne. Réserve : l'hébergement et les mesures de sécurité du dossier badgeuse ne sont pas transposables tels quels (voir la note ci-dessus).
- `C:\Users\dphil\Downloads\DPIA_Badgeuse_OTISUD (3).pdf` : modèle d'analyse proportionnée (méthode). Réserve : le « risque résiduel faible » et les mesures (HTTPS, RLS, logs) du badgeuse sont propres à ce traitement et ne préjugent pas du risque de Bertel.
