# Carte canonique du workspace objet, Bertel V3

## Statut du document

- **Type** : document de référence produit / architecture fonctionnelle
- **Portée** : workspace objet, logique d'édition, modération, structuration des onglets, règles transverses
- **Rôle** : aligner produit, schéma de données, API et interface d'édition
- **Statut** : **canonique pour le cadrage V1**, avec coexistence de trois niveaux de vérité :
  - **confirmé par l'existant** quand le schéma, les RPC ou l'UI le démontrent déjà
  - **décision V1 figée** quand le comportement cible est arrêté
  - **cible produit** quand la structure est voulue mais pas encore totalement vérifiée ou implémentée
- **Hors périmètre** : design pixel-perfect, micro-copy finale, choix techniques d'implémentation front détaillés composant par composant

---

## 1. Positionnement produit

Bertel n'intègre pas un CRM de prospection commerciale classique.

Le bloc relationnel sert à historiser, structurer et suivre les échanges entre l'Office de Tourisme, les prestataires touristiques et les contacts liés à leurs objets, afin d'assurer :

- la qualité des données,
- la mise à jour des fiches,
- l'accompagnement des prestataires,
- la conformité,
- le suivi opérationnel,
- la continuité de la relation.

Le vocabulaire et la structure du produit doivent donc privilégier une logique de **suivi relationnel métier**, et non une logique de pipeline commercial.

---

## 2. Fondations confirmées par le modèle actuel

Le schéma et les éléments de code déjà présents confirment l'intention générale suivante :

- un **noyau objet riche** centré sur `object`,
- un système de **modération** via `pending_change`,
- des descriptions multilingues en `*_i18n`,
- des **notes privées**,
- un **suivi d'interactions** et de **tâches**,
- des **adhésions**,
- des **incidents**,
- des **audits**,
- des modules métiers unifiés, notamment **ITI**, **FMA**, **ACT**, **menus**, **chambres**, **juridique**,
- une intention métier plus large visible dans l'ERD, notamment les lieux rattachés, les médias de sous-lieux, le consentement des contacts et une couche CRM orientée suivi relationnel.

### Références existantes à garder comme socle

- `universal_ai_ingestor/core/target_schema.py`
- `Base de donnée DLL et API/erd_diagram.md`
- `Base de donnée DLL et API/api_views_functions.sql`
- `bertel-tourism-ui/src/services/object-detail-parser.ts`

Ce document ne remplace pas ces fichiers. Il sert de **carte de référence transversale** pour interpréter et faire converger leur usage côté produit et côté UI.

---

## 3. Principes de structuration du workspace

Le workspace objet doit être pensé comme :

1. un **tronc commun** partagé à tous les objets,
2. des **couches métier transverses** activables selon les besoins,
3. des **modules conditionnels par type**,
4. une séparation claire entre :
   - ce qui est **public / diffusé**,
   - ce qui est **interne / back-office**,
   - ce qui est **admin / gouvernance**.

Le workspace ne doit pas être une simple projection technique des tables. Il doit proposer une lecture métier cohérente, stable et compréhensible.

---

## 4. Décisions V1 figées

| Sujet | Décision |
|---|---|
| Multilingue | Pilule locale par champ traduisible + sélecteur global dans le header |
| Sauvegarde | Un bouton **Enregistrer** par onglet |
| Navigation avec brouillon | Modale : **sauvegarder**, **annuler**, **revenir à l'onglet** |
| Modération | Vue Modération dédiée avec diff avant / après |
| Suivi relationnel | Pensé comme journal de relation prestataires, pas comme pipeline commercial |
| Lieux rattachés | Les descriptions et médias doivent gérer une portée : objet global ou sous-lieu |
| Consentement | Les contacts / acteurs doivent exposer une zone **Consentements RGPD** |
| ITI | Le module itinéraire doit inclure une sous-carte **Pratiques** |

Ces décisions sont à considérer comme **normatives pour la V1**, sauf arbitrage explicite ultérieur.

---

## 5. Carte canonique du workspace

---

## Couche A, Identité et cadrage

| ID | Onglet / module | Objectif métier | Tables sources | Cardinalité | Affichage conditionnel | Visibilité | Écriture / sauvegarde | Types concernés | Notes d'implémentation |
|---|---|---|---|---|---|---|---|---|---|
| A1 | Infos générales | Définir l'identité racine de l'objet | `object` | 1:1 | Toujours visible | Interne, certains champs publics | Direct ou modéré, sauvegarde par onglet | Tous | `name`, `object_type`, `business_timezone`, `region_code`, `status`, `commercial_visibility` |
| A2 | Taxonomie structurante | Qualifier l'objet via les référentiels métiers non distinction | `object`, `object_classification`, `ref_classification_scheme`, `ref_classification_value` | 1:N | Visible si schémas applicables au type | Publique | Direct ou modéré | Tous | Pas de champ dur `qualification`, lecture via schémas non distinction |
| A3 | Publication et modération | Gérer workflow éditorial, publication et validation | `object`, `pending_change`, `publication`, `publication_object` | 1:1 + 1:N | Visible aux profils internes | Interne | Hybride | Tous | Inclut `status`, `published_at`, `is_editing`, BAT, sélection publication |
| A4 | Synchronisation et identifiants | Voir provenance, flux source, IDs externes | `object_external_id`, `object_origin` | 1:N + 1:1 | Visible admin / super_admin | Admin technique | Lecture seule ou override admin | Tous | Plutôt technique, pas un onglet grand public interne |

---

## Couche B, Contenu public et éditorial

| ID | Onglet / module | Objectif métier | Tables sources | Cardinalité | Affichage conditionnel | Visibilité | Écriture / sauvegarde | Types concernés | Notes d'implémentation |
|---|---|---|---|---|---|---|---|---|---|
| B1 | Localisation | Gérer le point GPS, l'adresse et les sous-lieux | `object_location`, `object_place`, `object_zone` | 1:N | Toujours visible | Publique | Direct ou modéré | Tous | Deux cartes dans l'onglet, carte + coordonnées, puis adresse structurée. Les sous-lieux vivent ici |
| B2 | Descriptions et langues | Gérer les textes par contexte, langue et portée | `object_description`, `object_place_description`, `ref_language` | 1:1 canonique + 1:N contextes | Toujours visible | Publique | Direct ou modéré | Tous | Gérer objet global ou sous-lieu, pilule locale de langue à côté des champs traduisibles |
| B3 | Médias | Gérer galerie, droits, portée et visibilité | `media`, `media_tag`, `ref_code_media_type`, `ref_code_media_tag` | 1:N | Toujours visible | Publique | Direct ou modéré | Tous | Gérer portée objet ou portée sous-lieu, média principal, tri, droits, visibilité |
| B4 | Contacts publics et web | Publier les coordonnées de l'objet | `contact_channel`, `ref_code_contact_kind`, `ref_contact_role` | 1:N | Toujours visible | Publique | Direct | Tous | Séparer objet / acteur / organisation au niveau UX, même si l'onglet objet ne gère que ses propres contacts |
| B5 | Publications print | Gérer la présence de l'objet dans les supports édités | `publication`, `publication_object` | 1:N | Visible si organisation utilise ce workflow | Interne | Hybride | Tous | Peut rester rattaché à A3 si le nombre d'onglets doit rester limité |

---

## Couche C, Offre, exploitation et contenu structurant

| ID | Onglet / module | Objectif métier | Tables sources | Cardinalité | Affichage conditionnel | Visibilité | Écriture / sauvegarde | Types concernés | Notes d'implémentation |
|---|---|---|---|---|---|---|---|---|---|
| C1 | Caractéristiques | Gérer la filtrabilité experte | `object_amenity`, `object_language`, `object_payment_method`, `object_environment_tag`, `ref_amenity`, `ref_language`, `ref_code_payment_method`, `ref_code_environment_tag` | 1:N par famille | Toujours visible | Publique | Direct | Tous | Sous-cartes : équipements, langues, paiements, environnement |
| C2 | Distinctions et accessibilité | Gérer labels, classements, accessibilité certifiée | `object_classification`, `ref_classification_scheme`, `ref_classification_value`, `ref_document` | 1:N | Visible si schémas distinction applicables | Publique | Direct ou modéré | Tous | Utiliser les schémas `is_distinction = true` |
| C3 | Éco-responsabilité | Structurer les actions durables et leur rattachement | `object_sustainability_action`, `object_sustainability_action_label`, `ref_sustainability_action`, `ref_sustainability_action_category`, `object_classification` | 1:N | Visible si données existantes ou dispositif activé | Publique | Direct | Tous | L'action durable n'est pas un simple tag, c'est une entité propre |
| C4 | Capacités et politiques | Gérer jauges, groupes, animaux | `object_capacity`, `ref_capacity_metric`, `object_group_policy`, `object_pet_policy` | 1:N + 1:1 + 1:1 | Visible si bloc applicable au type | Publique / Pro | Direct | Tous, surtout hébergements, activités, lieux visitables | Sous-cartes : capacités, groupes, animaux |
| C5 | Tarifs et promotions | Gérer prix, périodes tarifaires, remises, promotions | `object_price`, `object_price_period`, `object_discount`, `promotion`, `promotion_object`, `ref_code_price_kind`, `ref_code_price_unit`, `ref_code_promotion_type` | 1:N | Visible si type commercialisable | Publique | Direct | `RES`, `HOT`, `HPA`, `HLO`, `ACT`, `ASC`, `LOI`, `PSV`, `FMA` selon cas | Liste de cartes tarifaires |
| C6 | Horaires et périodes | Gérer ouvertures riches, récurrence et créneaux | `opening_period`, `opening_schedule`, `opening_time_period`, `opening_time_period_weekday`, `opening_time_frame`, `ref_code_opening_schedule_type`, `ref_code_weekday` | 1:N arborescent | Visible si planning pertinent | Publique | Direct | La plupart des types | Composant arbre obligatoire |
| C7 | Documents métier visibles | Gérer certains documents utiles à la diffusion ou aux partenaires | `ref_document`, `media` | 1:N | Visible si le besoin existe | B2B / Partenaires | Direct | Selon usage | Optionnel en V1, peut rester absorbé par Médias et Juridique |

---

## Couche D, Suivi relation prestataires, back-office et conformité

| ID | Onglet / module | Objectif métier | Tables sources | Cardinalité | Affichage conditionnel | Visibilité | Écriture / sauvegarde | Types concernés | Notes d'implémentation |
|---|---|---|---|---|---|---|---|---|---|
| D1 | Suivi relation prestataires | Historiser les échanges avec les prestataires et leurs contacts | `object_private_description`, `crm_interaction`, `crm_task`, `actor`, `actor_object_role` | 1:N | Visible profils internes | Strictement interne | Direct | Tous | C'est un journal de relation, pas un pipeline commercial |
| D2 | Relations et rattachements | Gérer qui gère quoi, et quels contacts sont liés à quels objets | `object_org_link`, `actor_object_role`, `object_relation`, `ref_org_role`, `ref_actor_role`, `ref_object_relation_type`, `actor`, `actor_channel`, `actor_consent`, `ref_document` | 1:N | Toujours visible en interne | Interne | Direct | Tous | La modal Acteur doit inclure canaux, rôles, consentements RGPD |
| D3 | Adhésions | Gérer cotisations, campagnes, niveaux et impact de visibilité | `object_membership`, `ref_code_membership_campaign`, `ref_code_membership_tier` | 1:N | Visible profils régie / direction / admin | Interne métier | Direct | Objets rattachés à une `ORG` | Impact direct sur `commercial_visibility` |
| D4 | Avis clients | Visualiser la réputation importée | `object_review`, `ref_review_source` | 1:N | Visible si des avis existent | Interne | Lecture seule | Objets exposés aux plateformes d'avis | Pas un bloc éditorial, données importées |
| D5 | Qualité et signalements | Gérer audits qualité, signalements et traitements | `audit_template`, `audit_criteria`, `audit_session`, `audit_result`, `incident_report` | 1:N + sous-collections | Visible si objet auditable ou sujet à incidents | Interne | Hybride | Tous, surtout ITI et établissements suivis | Deux sous-zones : audits et incidents |
| D6 | Juridique et conformité | Gérer licences, assurances, SIRET, pièces légales | `object_legal`, `ref_legal_type`, `ref_document` | 1:N | Visible profils internes autorisés | Interne / B2B restreint | Direct | Tous | Validité forte, règles métier, dates, justificatifs |
| D7 | Gouvernance et accès | Visualiser rattachements ORG, rôles, périmètre d'accès | `user_org_membership`, `user_org_business_role`, `user_org_admin_role`, `org_config`, `app_user_profile`, `org_permission`, `user_permission`, `ref_permission` | 1:N | Visible admin / super_admin | Admin | Lecture seule ou admin | Tous | Bloc admin, hors V1 si besoin |
| D8 | Historique et versions | Voir l'historique de versions et l'audit | `object_version`, `audit.audit_log` | 1:N | Visible admin / super_admin | Admin | Lecture seule | Tous | Très utile pour la modération et le debug |
| D9 | Opportunités commerciales | Hors cœur V1, seulement si besoin futur de suivi commercial | `crm_pipeline`, `crm_stage`, `crm_deal` | 1:N | Désactivé par défaut | Interne commercial | Direct | Cas spécifiques seulement | À garder en backlog, pas dans le cœur du produit tant que le besoin n'est pas confirmé |

---

## Couche E, Modules conditionnels par type

| ID | Type ciblé | Module injecté | Objectif métier | Tables sources | Cardinalité | Affichage conditionnel | Visibilité | Écriture / sauvegarde | Notes d'implémentation |
|---|---|---|---|---|---|---|---|---|---|
| E1 | `ITI` | Tracé et parcours | Gérer géométrie, sections, étapes, pratiques, statut parcours, infos et profil | `object_iti`, `object_iti_stage`, `object_iti_stage_media`, `object_iti_section`, `object_iti_info`, `object_iti_profile`, `object_iti_practice`, `object_iti_associated_object`, `ref_code_iti_practice`, `ref_iti_assoc_role` | 1:1 + 1:N | Visible si `object_type = ITI` | Publique + Interne | Direct | Inclure une sous-carte **Pratiques** en multi-sélection |
| E2 | `ACT` | Encadrement activité | Gérer durée, jauges, difficulté, guide, âge minimum, équipement fourni | `object_act` | 1:1 | Visible si `object_type = ACT` | Publique / Pro | Direct | Lien avec site support et itinéraire via relations |
| E3 | `FMA` | Dates et programmation | Gérer dates, heures, récurrence, occurrences | `object_fma`, `object_fma_occurrence` | 1:1 + 1:N | Visible si `object_type = FMA` | Publique | Direct | Important pour agenda et programmation |
| E4 | `RES` | Menus et cuisine | Gérer cartes, plats, allergènes, tags alimentaires, types de cuisine | `object_menu`, `object_menu_item`, `object_menu_item_dietary_tag`, `object_menu_item_allergen`, `object_menu_item_cuisine_type`, `object_menu_item_media`, `ref_code_menu_category`, `ref_code_dietary_tag`, `ref_code_allergen`, `ref_code_cuisine_type` | 1:N + sous-collections | Visible si `object_type = RES` | Publique | Direct | Sous-éditeur imbriqué |
| E5 | `HOT`, `HPA`, `HLO`, `CAMP` | Chambres / unités | Gérer types de chambres, lits, surfaces, vue, accessibilité, prix de base | `object_room_type`, `object_room_type_amenity`, `object_room_type_media`, `ref_code_view_type` | 1:N | Visible si type hébergement | Publique / Pro | Direct | Sous-cartes par type de chambre |
| E6 | `HOT`, éventuellement `ORG` ou autres types équipés | MICE / séminaires | Gérer salles de réunion et équipements | `object_meeting_room`, `meeting_room_equipment`, `ref_code_meeting_equipment` | 1:N | Visible par type ou capability métier | Publique / B2B | Direct | Ne pas dépendre uniquement du type |
| E7 | `ORG` | Profil organisationnel | Gérer la variante d'édition institutionnelle | `object`, `contact_channel`, `object_org_link`, `org_config`, `user_org_membership` | Mixte | Visible si `object_type = ORG` | Interne / Publique selon bloc | Direct | Variante du workspace, plus institutionnelle que touristique |

---

## 6. Règles transverses

### 6.1 I18n

#### Règle canonique

- les champs traduisibles ont une pilule locale avec le code langue,
- le header propose un sélecteur global,
- le FR reste la référence par défaut,
- la source canonique est le `*_i18n` quand il existe,
- `i18n_translation` reste un mécanisme secondaire ou de compatibilité.

#### Champs concernés en priorité

- noms,
- descriptions,
- certains textes ITI,
- room types,
- menus,
- documents / textes de support,
- certaines références affichées.

### 6.2 Sauvegarde

#### Règle canonique

- sauvegarde par onglet,
- dirty state par onglet,
- modale si sortie d'onglet avec modifications non sauvegardées.

#### Actions proposées dans la modale

- sauvegarder,
- annuler les changements,
- revenir à l'onglet.

### 6.3 Modération

#### Règle canonique

Le workspace a deux modes :

- mode édition,
- mode modération.

En mode modération, on affiche :

- valeur actuelle,
- proposition `pending`,
- diff avant / après,
- table cible,
- action,
- auteur,
- note de revue,
- actions approuver / rejeter / appliquer.

### 6.4 Portée des contenus

#### Règle canonique

Les contenus suivants doivent supporter une portée :

- description objet global,
- description sous-lieu,
- média objet global,
- média sous-lieu.

C'est indispensable pour que `object_place`, `object_place_description` et `media.place_id` aient une vraie traduction UX.

### 6.5 Suivi relation prestataires

#### Ce que l'UI doit privilégier

- timeline,
- filtres par sujet,
- filtres par canal,
- contact concerné,
- date,
- prochaine action,
- tâche liée,
- lien vers l'objet concerné.

#### Ce qu'il faut éviter comme vocabulaire central

- lead,
- conversion,
- pipeline de vente,
- funnel,
- closing.

---

## 7. Axes à cadrer explicitement pour éviter les zones grises

Ces points doivent être traités explicitement pendant l'implémentation, même s'ils ne sont pas encore tous stabilisés :

### 7.1 Source de vérité par bloc

Pour chaque onglet ou sous-carte, préciser si la donnée est :

- canonique en base,
- dérivée / calculée,
- importée,
- surchargée via modération,
- enrichie par synchronisation externe.

### 7.2 Droits d'édition par bloc

La visibilité seule ne suffit pas. Il faut préciser, par bloc, qui peut :

- voir,
- modifier,
- proposer,
- valider,
- outrepasser,
- administrer.

### 7.3 Granularité de modération

À arbitrer de façon claire :

- modération par champ,
- par sous-carte,
- par item de collection,
- ou par onglet.

### 7.4 Complétude métier

Le workspace doit pouvoir exprimer à terme :

- complet / incomplet,
- bloquant diffusion,
- recommandé,
- optionnel.

### 7.5 Type vs capability

L'affichage ne doit pas dépendre uniquement du `object_type`.

Un module peut être conditionné :

- par le type,
- par une capability métier,
- par la présence de données,
- par le contexte organisationnel,
- par les permissions du profil.

---

## 8. Priorisation recommandée

### V1, cœur produit

- A1 Infos générales
- A2 Taxonomie structurante
- A3 Publication et modération
- B1 Localisation
- B2 Descriptions et langues
- B3 Médias
- B4 Contacts publics
- C1 Caractéristiques
- C2 Distinctions
- C4 Capacités et politiques
- C5 Tarifs et promotions
- C6 Horaires
- D1 Suivi relation prestataires
- D2 Relations et rattachements
- D3 Adhésions
- D6 Juridique et conformité
- E1 / E2 / E3 / E4 / E5 / E6 selon le type

### V2, métier interne enrichi

- D4 Avis clients
- D5 Qualité et signalements
- A4 Synchronisation et identifiants
- B5 Publications print

### V3, admin

- D7 Gouvernance et accès
- D8 Historique et versions
- D9 Opportunités commerciales, seulement si besoin confirmé

---

## 9. Lecture de ce document

Pour éviter les ambiguïtés, ce document doit toujours être lu avec la distinction suivante :

- **constat de l'existant** : ce que le schéma et le code montrent déjà,
- **décision figée** : ce qui est arbitré pour la V1,
- **cible canonique** : la carte de référence du workspace,
- **backlog / extension** : ce qui n'appartient pas encore au cœur du produit.

Ce document a vocation à être mis à jour lorsque :

- une structure d'onglet change,
- une règle transverse est modifiée,
- un module métier devient canonique,
- un arbitrage V1 / V2 / V3 évolue,
- une divergence entre schéma, RPC et UI est découverte puis tranchée.

---

## 10. Ligne directrice finale

Le workspace objet de Bertel V3 doit rester :

- **cohérent avec le modèle unifié**,
- **lisible pour les métiers**,
- **modulable selon les types**,
- **rigoureux sur la modération et la conformité**,
- **sobre dans son vocabulaire CRM**,
- **stable comme référence commune entre produit, base, API et UI**.
