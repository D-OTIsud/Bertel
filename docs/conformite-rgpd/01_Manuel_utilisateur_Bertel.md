# Manuel utilisateur Bertel

Parcours métier, rôles, bonnes pratiques RGPD et exploitation quotidienne

> Statut : document de travail à valider par l'équipe produit, le responsable de traitement et le DPO.
> Version : 13 juin 2026. Périmètre : Bertel 3.0, UI Next.js, backend Supabase/PostgreSQL.

## 1. Objet du manuel

Bertel est la Base d'Enregistrement et de Référentiel Touristique des Établissements et Lieux. L'application centralise des fiches touristiques, des médias, des contacts, des relations avec les prestataires, des workflows de modération, des audits, des signalements et des informations de conformité.

Ce manuel s'adresse aux agents de l'office de tourisme, administrateurs d'organisation, administrateurs plateforme, contributeurs autorisés, référents qualité et DPO. Il décrit les actions attendues dans l'interface et les règles minimales à appliquer pour ne pas exposer de données personnelles inutiles.

## Posture données Bertel

En l'état du périmètre décrit, environ 95 % des informations stockées dans Bertel sont publiques ou destinées à être publiées : fiches touristiques, descriptions, horaires, coordonnées professionnelles d'établissement, médias de promotion, classifications, tarifs, équipements et statuts de publication. Le risque RGPD principal ne vient donc pas du référentiel public lui-même, mais des zones internes : interactions entre l'office de tourisme et les prestataires, notes CRM, tâches, historiques de relation, coordonnées personnelles lorsqu'elles diffèrent des coordonnées publiques ou professionnelles, et erreurs de publication accidentelles.


## 2. Connexion et session

1. Accéder à l'URL de l'application Bertel.
2. Se connecter avec Google OAuth lorsque le fournisseur est actif, ou avec email et mot de passe lorsque ce mode est configuré.
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

Chaque média peut être rattaché à l'objet global ou à un sous-lieu. Il contient un type, un titre, une description, un crédit, une URL, une visibilité, un indicateur de publication, un média principal et une date d'expiration des droits.

Avant de publier un média :

- vérifier que les droits d'usage sont documentés ;
- renseigner le crédit lorsque nécessaire ;
- éviter les visages reconnaissables, plaques, documents administratifs ou informations personnelles visibles ;
- classer la visibilité : public, partenaires ou interne ;
- ajouter une description utile à l'accessibilité si le média est diffusé.

## 8. Contacts, acteurs et consentements

Bertel distingue :

- les contacts publics d'un établissement (`contact_channel`) : téléphone, email, site web, réseaux sociaux publiables ;
- les acteurs (`actor`) et leurs canaux (`actor_channel`) : personnes ou contacts liés à un objet ou une organisation ;
- les consentements (`actor_consent`) : préférences et preuves utiles à la relation.

Règles d'usage :

- publier uniquement les coordonnées destinées au public ;
- conserver les coordonnées personnelles dans les zones internes prévues ;
- documenter le consentement lorsque le traitement repose sur lui ;
- supprimer ou archiver les contacts obsolètes après validation métier ;
- ne pas utiliser les contacts Bertel pour des finalités non prévues.

## 9. CRM, notes privées et relances

Le module CRM Bertel est un suivi relationnel métier, pas un pipeline commercial. Il sert à garder une trace des échanges avec les prestataires, des demandes, des relances et des tâches.

Les notes privées sont utiles pour assurer la continuité de service, mais elles doivent rester factuelles, proportionnées et non discriminatoires. Ne pas écrire d'appréciations personnelles inutiles, d'informations de santé, d'opinions politiques, de données familiales ou de jugements subjectifs sur une personne.

## 10. Audits et incidents

Les audits documentent des contrôles qualité. Les incidents documentent un signalement terrain : catégorie, gravité, statut, description, localisation, déclarant et médias éventuels.

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
| Demande d'accès/suppression d'une personne | Ne pas répondre seul si le périmètre est incertain. | DPO ou canal officiel droits des personnes. |

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
