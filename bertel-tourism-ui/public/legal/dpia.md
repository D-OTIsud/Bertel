# DPIA — Analyse d'Impact relative à la Protection des Données

**Plateforme Bertel 3.0 — Système d'Information Touristique (SIT) & CRM**

Dernière mise à jour : 16 juin 2026
Version du document : 1.1
Statut : projet — à valider par le responsable de traitement

---

## Préambule

La présente analyse d'impact relative à la protection des données (AIPD / DPIA) est conduite par SPL OTI DU SUD en application de l'article 35 du RGPD.

> **Caractère préventif** : à l'analyse, le traitement Bertel ne figure pas formellement dans la liste des traitements pour lesquels une DPIA est obligatoire au sens du référentiel CNIL (pas de traitement à grande échelle de données sensibles, pas de profilage systématique, pas de surveillance de personnes vulnérables). Cette DPIA est néanmoins conduite à titre préventif au regard de la nature multi-ORG de la plateforme et du volume de données opérateurs et CRM traitées.

---

## 1. Description du traitement

### 1.1 Présentation générale

**Nom du traitement :** Bertel 3.0 — plateforme CRM et SIT mutualisée
**Nature :** application web (Next.js + Supabase) accessible aux agents d'Offices de Tourisme et structures SIT pour produire, qualifier et diffuser des informations touristiques.

### 1.2 Périmètre fonctionnel

- Référencement des établissements touristiques (hébergement, restauration, activités, itinéraires, événements).
- Gestion des comptes éditeurs et appartenance multi-ORG.
- CRM de la relation prestataires (demandes, comptes-rendus, animation réseau).
- Workflow éditorial : modération, historisation, publication.
- API publique pour diffusion des contenus auprès de sites partenaires.

### 1.3 Acteurs et rôles

| Rôle | Acteur | Nature |
|---|---|---|
| Responsable du traitement principal | SPL OTI DU SUD | Éditeur et opérateur Bertel |
| Co-responsables / responsables conjoints | ORG partenaires (autres OTI / SIT) | Responsables de leur scope de publication |
| Sous-traitant hébergement des données personnelles (base de données, authentification, stockage de fichiers, temps réel) | Supabase Inc. sur Amazon Web Services, région `eu-west-1` (Irlande, UE) — projet « ryycrdhlkmzpxwwwwupy » | DPA à archiver ; certifié ISO/IEC 27001 ; chiffrement au repos (garantie plateforme AWS/Supabase) et TLS en transit. Données dans l'UE. |
| Sous-traitant hébergement de l'application web (frontend Next.js, conteneur Docker) | OVHcloud (France, UE) | DPA OVHcloud en place ; engagements RGPD publics ; pas de traitement hors UE ; certifications ISO/IEC 27001:2022, 27017:2015, 27018:2019, 27701:2019 (périmètre non-US). Ces certifications restent valables pour le frontend Bertel. |
| Sous-traitant authentification (utilisateurs internes uniquement) | Google (Google Ireland Ltd / Google LLC) | Authentification via Google OAuth, UNIQUEMENT pour les utilisateurs internes de l'organisation (agents de l'office) ; les prestataires/acteurs et le public ne s'authentifient jamais via Google. Transfert hors UE potentiel encadré par le EU-US Data Privacy Framework [à confirmer et archiver]. |
| Référent RGPD interne | David Philippe — Manager SI | d.philippe@otisud.com — SPL OTI DU SUD n'a pas désigné de DPO au sens de l'Art. 37 RGPD. [À VALIDER PAR LE DPO : harmoniser la qualification du référent dans tout le pack ; par défaut employer « référent RGPD interne » partout ; signaler le point d'indépendance Art. 38(6) — cumul des fonctions Manager SI / référent RGPD à arbitrer avec la direction.] |

**Hébergement et localisation des données (toutes dans l'Union européenne) :**
- Application web (frontend Next.js, conteneur Docker) : OVHcloud, France (UE).
- Données personnelles (base de données PostgreSQL managée, authentification, stockage de fichiers, temps réel) : Supabase Inc. sur Amazon Web Services, région eu-west-1 (Irlande, UE) — projet « ryycrdhlkmzpxwwwwupy ».

Aucune donnée n'est hébergée hors de l'Union européenne.

**Sous-traitants et destinataires réels :**
- OVHcloud (France, UE) — hébergement de l'application web (frontend). Contrat de sous-traitance (DPA) OVHcloud à archiver.
- Supabase Inc. — base de données, authentification, stockage de fichiers, temps réel ; données dans l'UE (AWS eu-west-1, Irlande). DPA à archiver.
- Google (Google Ireland Ltd / Google LLC) — authentification via Google OAuth, UNIQUEMENT pour les utilisateurs internes de l'organisation (agents de l'office) ; les prestataires/acteurs et le public ne s'authentifient jamais via Google. Transfert hors UE potentiel encadré par le EU-US Data Privacy Framework [à confirmer et archiver].
- API Adresse / Base Adresse Nationale (data.gouv.fr, France) — géocodage des adresses saisies.
- Services chargés dans le navigateur du visiteur (reçoivent son adresse IP) : tuiles cartographiques OpenFreeMap + MapLibre, favicons DuckDuckGo, Google Fonts. L'auto-hébergement de ces ressources est recommandé pour limiter ces flux.

Aucun envoi d'e-mail/SMS applicatif n'est en place à ce jour.

### 1.4 Volumes (ordre de grandeur)

- Comptes éditeurs : quelques dizaines (10–100 selon ORG actives).
- Objets touristiques référencés : ~1000 à 10 000 entrées selon le périmètre.
- Contacts CRM : ~500 à 2000 par ORG.
- Trafic API publique : variable, plusieurs milliers de requêtes / jour.

---

## 2. Finalités et bases légales

| Finalité | Base légale | Justification |
|---|---|---|
| Production et diffusion d'information touristique | Mission d'intérêt public (Art. 6.1.e) | Mission de service public d'OTI — Code du tourisme L.133-3 |
| Gestion des comptes éditeurs | Intérêt légitime (Art. 6.1.f) | Sécurité de la plateforme, traçabilité éditoriale |
| Animation du réseau prestataires (CRM) | Exécution de contrat (Art. 6.1.b) / Intérêt légitime (Art. 6.1.f) | Conventions de partenariat, mission OTI |
| Modération, historisation et traçabilité éditoriale | Mission d'intérêt public (Art. 6.1.e) / Intérêt légitime (Art. 6.1.f) | Qualité de l'information touristique publique (mission OTI) ; responsabilité éditoriale et sécurité juridique selon le périmètre concerné |
| Sécurité et logs | Intérêt légitime (Art. 6.1.f) | Protection des biens et des données |
| Conservation comptable et obligations légales sectorielles | Obligation légale (Art. 6.1.c) | Lorsqu'une obligation légale spécifique s'applique (ex. conservation des pièces comptables liées aux partenariats) |

**Conformité :** les finalités sont déterminées, explicites et légitimes (Art. 5.1.b). Pas de traitement secondaire incompatible.

---

## 3. Données traitées

| Catégorie | Données | Personnes concernées | Caractère sensible |
|---|---|---|---|
| Identité éditeur | Nom affiché, email, avatar | Agents OTI / ORG partenaires | Non |
| Authentification | Hash password, JWT, IP de connexion, user-agent, date | Agents OTI / ORG partenaires | Non — mais sécurité critique |
| Préférences UI | Langue, fuseau, prefs JSON | Agents OTI / ORG partenaires | Non |
| Rôle et permissions | Rôle plateforme, ORG, permissions | Agents OTI / ORG partenaires | Non |
| Audit trail | UUID éditeur attaché à chaque action | Agents OTI / ORG partenaires | Non |
| Contact opérateur | Nom commercial, email, tél, adresse | Prestataires (personnes morales ou physiques) | Variable — pro principalement |
| Contact CRM | Nom, prénom, email, tél, organisation | Personnes physiques (réseau de l'OTI) | Non |
| Historique CRM | Demandes, commentaires, comptes-rendus, interactions, tâches | Personnes physiques (réseau de l'OTI) | Non — appréciation possible |
| Données CRM enrichies (JSONB `extra`) | E-mail de l'interlocuteur, humeur brute (`humeur_raw`), sentiment relationnel | Personnes physiques (réseau de l'OTI) | Non — appréciation subjective possible |
| Portrait d'acteur | Photo de portrait (`actor.photo_url`, image faciale en bucket public) | Personnes physiques (acteurs / prestataires) | Image d'une personne physique — consentement non capté (voir §5.1) |
| Avis de tiers (`object_review`) | Nom, avatar, contenu de l'avis | Tiers (public ayant laissé un avis) | Non — texte libre |
| Déclarations d'incident (`incident_report`) | Nom, e-mail, géolocalisation, photos du déclarant ; propagation automatique en CRM | Déclarants (citoyens) | Géolocalisation + texte libre + photos |
| Données légales opérateur (`object_legal`) | SIRET / SIREN / raison sociale | Prestataires (dont entrepreneurs individuels) | Variable — donnée à caractère personnel pour les entrepreneurs individuels |
| Présence temps réel (Supabase Realtime / presence) | Identité de l'utilisateur connecté | Agents OTI / ORG partenaires | Non |
| Médias publiés | Photos, vidéos, métadonnées | Variable | Images : EXIF/IPTC/XMP supprimés à l'upload. Vidéos : métadonnées conteneur (GPS/appareil) NON supprimées (voir §5.1) |

**Pas de données sensibles (Art. 9 RGPD)** en collecte structurée. Pas de données pénales (Art. 10 RGPD). Pas de mineurs identifiés. Pas de profilage automatisé.

> ⚠️ **Risque champs libres CRM.** Les zones de texte libre (commentaires, comptes-rendus, notes de suivi) peuvent involontairement contenir des données sensibles (santé, situation familiale, difficultés financières, conflit, appréciation subjective) saisies par un éditeur non sensibilisé. Ce risque est traité par une mesure organisationnelle explicite (voir §5.2) et une action prioritaire (voir §7.1).

---

## 4. Nécessité et proportionnalité

### 4.1 Principe de minimisation (Art. 5.1.c)

- **Données éditeurs** : seules les données indispensables à l'authentification et à la collaboration multi-ORG sont collectées. Pas de date de naissance, pas d'adresse personnelle, pas de numéro de téléphone privé.
- **Données opérateurs** : seules les coordonnées de contact professionnel sont publiées. Lorsque l'opérateur est une personne physique (auto-entrepreneur), une vigilance particulière est appliquée : seules les coordonnées qu'il a explicitement déclarées à des fins de publication sont utilisées.
- **Logs et journal d'audit** : durée de conservation des logs Supabase Auth limitée selon la politique du sous-traitant. Le journal d'audit applicatif (`audit.audit_log`) conserve une copie complète (état avant/après, données personnelles incluses) de chaque modification et suppression sur l'ensemble des tables, attribuée à l'utilisateur, pendant 12 mois glissants (rotation mensuelle des partitions). Aucune purge automatique des logs applicatifs au-delà de 90 jours n'est en place à ce jour ; toute purge ciblée est manuelle (action planifiée, voir §7.1).

### 4.2 Exactitude (Art. 5.1.d)

- Chaque éditeur peut modifier ses propres données de profil (nom, langue, préférences).
- Workflow de modération permet la correction collective des contenus.
- Les opérateurs peuvent demander la rectification de leur fiche via le canal CRM.

### 4.3 Limitation de la conservation (Art. 5.1.e)

- Voir §5 du RGPD ([rgpd.md](rgpd.md)).
- **Conservation** : aucune purge ni anonymisation automatique des données personnelles n'est en place à ce jour (les seules tâches planifiées concernent le rafraîchissement de vues et la rotation des partitions d'audit à 12 mois). Les durées de conservation indiquées sont des cibles de politique, à appliquer manuellement tant que des purges automatiques ne sont pas implémentées. En particulier, l'anonymisation des comptes inactifs au-delà de 24 mois est une cible de politique non encore automatisée (action planifiée, voir §7.1).
- **État réel de l'effacement et du journal d'audit** (à connaître pour répondre aux demandes au titre de l'Art. 17) : aucune fonction automatisée d'effacement ou d'anonymisation n'existe à ce jour — un effacement est une opération MANUELLE (suppression ciblée sous contrôle technique). De plus, le journal d'audit (`audit.audit_log`) conserve une copie complète (état avant/après, données personnelles incluses) de chaque modification et suppression sur l'ensemble des tables, attribuée à l'utilisateur, pendant 12 mois glissants. Une donnée supprimée reste donc présente dans le journal d'audit jusqu'à 12 mois ; sa purge ciblée doit être effectuée manuellement lorsque la demande l'exige. Le versioning `object_version` n'est, lui, pas purgé automatiquement.
- Archivage des sauvegardes : 30 jours glissants (Supabase Cloud).

### 4.4 Information des personnes (Art. 13)

- Page RGPD publique ([rgpd.md](rgpd.md)) accessible depuis l'application.
- Information au moment de la création de compte (banner ou page dédiée).
- Mention dans les conventions de partenariat ORG / opérateurs.

---

## 5. Mesures techniques et organisationnelles

### 5.1 Mesures techniques

| Mesure | Description | Niveau |
|---|---|---|
| Chiffrement en transit | TLS (HTTPS) | ✅ En place (TLS Supabase et OVHcloud). En-tête HSTS applicatif : ❌ non configuré (voir « En-têtes de sécurité ») |
| Chiffrement au repos | Chiffrement au repos assuré par les plateformes (OVHcloud, AWS/Supabase) | ✅ Garantie plateforme — **il n'y a pas de chiffrement applicatif des colonnes** (ne pas surdéclarer un AES-256 applicatif) |
| Authentification | Supabase Auth (password + OAuth Google pour les utilisateurs internes uniquement), JWT signés | ✅ En place. MFA : ❌ non déployée (action planifiée, §7.1). Protection « mot de passe compromis » : ❌ désactivée |
| Contrôle d'accès | RBAC plateforme + RLS PostgreSQL par ORG et par permission | ✅ En place (RLS réelle et robuste) |
| Cloisonnement multi-ORG | Politiques RLS strictes, vérifications côté API (`api.current_user_*`) | ✅ En place ; à noter : deux vues SECURITY DEFINER sont lisibles par le rôle anonyme (point d'amélioration, voir §7.1) ; audit annuel à programmer |
| Journalisation | Logs Supabase Auth + journal d'audit applicatif `audit.audit_log` (copie complète avant/après, données personnelles incluses, attribuée à l'utilisateur, 12 mois glissants) + versioning `object_version` (non purgé) | ✅ En place |
| Gestion des sessions | JWT à durée limitée, refresh token, déconnexion explicite | ✅ En place |
| Sauvegarde / restauration | Sauvegardes Supabase intégrées ; **PITR** disponible en option (plans Pro / Team / Enterprise — souscription à vérifier pour Bertel) ; tests de restauration trimestriels | 🟡 Plan souscrit + tests à documenter |
| Mise à jour de sécurité | Application des CVE critiques sous 30j (Next.js, dépendances) | ✅ Pratique en place — procédure à formaliser |
| En-têtes de sécurité | HSTS, CSP, X-Frame-Options, Referrer-Policy | ❌ Aucun en-tête de sécurité applicatif (HSTS/CSP/X-Frame-Options) n'est configuré (action planifiée, §7.1) |
| Protection contre l'injection | Requêtes paramétrées (Supabase JS), validation côté serveur | ✅ En place |
| Métadonnées des médias | Images : ré-encodées à l'upload via le pipeline `/api/media/upload` (resize ≤ 2000 px + strip EXIF/IPTC/XMP via sharp). Vidéos : stockées telles quelles | 🟡 Images : ✅ EXIF/IPTC/XMP supprimés (mesure en place ; backfill des médias antérieurs à planifier). Vidéos : ❌ métadonnées de conteneur (GPS/appareil) NON supprimées (pas de transcodeur serveur — risque résiduel documenté) |
| Bucket de stockage des médias | Bucket Supabase Storage public et listable ; `media.url` est une chaîne sans clé étrangère → orphelins jamais nettoyés | 🟡 Point d'amélioration — restreindre/nettoyer (action planifiée, §7.1) |
| Hébergement des données (UE) | Supabase Inc. sur AWS, région `eu-west-1` (Irlande, UE) — projet « ryycrdhlkmzpxwwwwupy » : base de données, authentification, stockage de fichiers, temps réel | ✅ Données dans l'UE |
| Certification Supabase | **ISO/IEC 27001** (certificat accessible depuis le dashboard Supabase pour les plans Team / Enterprise) | ✅ Documenté par Supabase — copie du certificat à archiver |
| Hébergement de l'application web (UE) | OVHcloud (France, UE) : frontend Next.js (conteneur Docker). OVHcloud s'engage à ne pas traiter hors UE | ✅ Application web dans l'UE |
| Certifications OVHcloud | **ISO/IEC 27001:2022**, **27017:2015**, **27018:2019**, **27701:2019** (périmètre non-US, couvrant VPS, Public Cloud Instances, Managed Relational Database, Object Storage, Managed Web Hosting) — valables pour le frontend Bertel | ✅ Documenté par OVHcloud — preuves à archiver |
| DPA sous-traitants | DPA Supabase ; DPA OVHcloud (en place pour le rôle de sous-traitant) ; le cas échéant, encadrement du flux d'auth Google (EU-US Data Privacy Framework, utilisateurs internes uniquement) | 🟡 Archivage des deux DPA + encadrement du flux Google — action prioritaire |

> **Mesures de sécurité — état réel (à ne pas surdéclarer).** Authentification Supabase Auth + RBAC + RLS PostgreSQL (robuste) ; journalisation d'audit ; séparation client/service-role. À noter : le chiffrement au repos est une garantie des plateformes (OVHcloud, AWS/Supabase), il n'y a pas de chiffrement applicatif des colonnes ; aucun en-tête de sécurité applicatif (HSTS/CSP/X-Frame-Options) n'est configuré ; la MFA n'est pas déployée ; la protection « mot de passe compromis » est désactivée ; deux vues SECURITY DEFINER sont lisibles par le rôle anonyme et les buckets publics sont listables (points d'amélioration identifiés, voir §7.1).

> **Métadonnées des médias.** Les images sont ré-encodées à l'upload, ce qui supprime leurs métadonnées EXIF/IPTC/XMP (GPS, appareil) — mesure en place. Les vidéos sont en revanche stockées telles quelles : leurs métadonnées de conteneur (pouvant contenir GPS/appareil) NE SONT PAS supprimées (limite documentée, pas de transcodeur serveur), à traiter comme un risque résiduel.

> **Photos de portrait d'acteurs et consentement.** La fiche acteur peut porter une photo de portrait (image d'une personne physique) stockée dans un bucket public (seule protection : un chemin de fichier non devinable, ce qui n'est pas un contrôle d'accès). La table `actor_consent` existe mais n'est alimentée par aucun chemin d'écriture : le consentement n'est pas capté à ce jour. Le consentement ne peut donc PAS être présenté comme une mesure en place — c'est une mesure à mettre en œuvre (action planifiée, voir §7.1).

### 5.2 Mesures organisationnelles

- **Politique d'accès** : rôles attribués selon le principe du moindre privilège (`tourism_agent` < `super_admin` < `owner`).
- **Procédure d'arrivée / départ** : création / désactivation des comptes éditeurs par l'admin ORG.
- **Sensibilisation** : information des agents OTI sur les bonnes pratiques RGPD (mots de passe, partage de données).
- **Registre des activités de traitement (Art. 30 RGPD)** : tenu par le référent RGPD interne — formalisation à finaliser (voir §7.1).
- **Procédure de notification des violations de données (Art. 33-34 RGPD)** : analyse de l'incident, qualification du risque pour les droits et libertés des personnes concernées, notification à la CNIL **dans les 72 h après constatation** lorsque la violation présente un risque, information des personnes concernées lorsque le risque est élevé. Documentation interne systématique de toute violation, qu'elle soit notifiée ou non.
- **Règle « champs libres CRM »** : interdiction de saisir dans les zones de texte libre (commentaires, comptes-rendus, notes) des données sensibles (santé, opinions politiques / religieuses / syndicales, origine, orientation sexuelle, données biométriques / génétiques), des données pénales, ou des appréciations subjectives excessives. Une mention d'aide à la saisie est affichée dans l'UI et reprise dans la formation des éditeurs.
- **Convention de responsabilité conjointe (Art. 26 RGPD)** : à formaliser entre SPL OTI DU SUD et chaque ORG partenaire (voir §7.1, action prioritaire).
- **Revue annuelle** : la présente DPIA est revue chaque année et à chaque évolution majeure.

---

## 6. Analyse des risques pour les personnes concernées

Trois familles de risques sont analysées selon la méthode CNIL (les trois événements redoutés : accès illégitime, modification non désirée, disparition des données).

> **Méthode et cotation.** Les évaluations de vraisemblance et de gravité ci-dessous sont des appréciations préliminaires. La cotation formelle selon la méthode CNIL (pour chacun des trois événements redoutés : gravité × vraisemblance, avec recensement des sources de risque et des mesures) reste **à compléter** [À VALIDER PAR LE DPO]. Aucune cotation chiffrée définitive n'est arrêtée à ce stade — c'est une action de la révision en cours (voir §7.1).

### 6.1 Accès illégitime aux données

**Sources de risque :**
- Compromission d'un compte éditeur (mot de passe faible, hameçonnage).
- Faille technique côté Supabase ou Next.js.
- Erreur de configuration RLS exposant des données d'une ORG à une autre.
- Sous-traitant compromis.

**Impacts potentiels sur les personnes :**
- Divulgation de contacts CRM (atteinte à la vie privée des contacts du réseau).
- Divulgation de coordonnées personnelles d'opérateurs auto-entrepreneurs.
- Atteinte à la réputation de l'OTI / d'un partenaire ORG.

**Évaluation initiale :**
- **Vraisemblance :** moyenne
- **Gravité :** moyenne (pas de donnée sensible, mais contacts CRM concernés)
- **Niveau de risque brut :** modéré

**Mesures de mitigation :**
- Authentification Supabase Auth avec politique de mot de passe ; MFA non déployée à ce jour, à déployer pour les rôles `owner` / `super_admin` (action planifiée, §7.1) ; protection « mot de passe compromis » actuellement désactivée, à activer.
- RLS PostgreSQL (réelle et robuste) avec tests automatisés de non-régression.
- Audit régulier des permissions et des politiques RLS ; correction des points d'amélioration identifiés (deux vues SECURITY DEFINER lisibles par le rôle anonyme, buckets publics listables).
- Veille CVE et application rapide des correctifs.
- Contrat de sous-traitance (DPA) à archiver avec Supabase (données — AWS eu-west-1, Irlande) et OVHcloud (frontend — France) ; encadrement du flux d'auth Google (utilisateurs internes uniquement, EU-US Data Privacy Framework).

**Niveau de risque résiduel :** faible.

---

### 6.2 Modification non désirée des données

**Sources de risque :**
- Erreur humaine d'un éditeur (suppression, modification erronée).
- Action malveillante interne (rare mais possible).
- Bug applicatif (régression, mauvaise validation).

**Impacts potentiels sur les personnes :**
- Diffusion d'informations erronées sur un opérateur (préjudice professionnel).
- Perte d'historique relationnel CRM (préjudice de gestion).
- Confusion d'identité (mauvais rattachement ORG).

**Évaluation initiale :**
- **Vraisemblance :** moyenne
- **Gravité :** faible à moyenne
- **Niveau de risque brut :** modéré

**Mesures de mitigation :**
- **Audit trail systématique** : chaque modification et suppression est tracée dans le journal d'audit `audit.audit_log` (copie complète de l'état avant/après, données personnelles incluses, attribuée à l'e-mail de l'utilisateur, conservée 12 mois glissants) avec horodatage et identifiant de l'auteur. Le versioning `object_version` conserve l'historique des versions et n'est pas purgé automatiquement.
- **Workflow de modération** : les modifications sensibles passent par un état revu avant publication.
- **Historisation des versions** : `object_version` permet de revenir à un état antérieur (rollback).
- **Tests automatisés** : suite EXPLAIN ANALYZE et tests d'intégration sur les fonctions API.
- **Validation côté serveur** : contraintes PostgreSQL + RLS + vérifications applicatives.

**Niveau de risque résiduel :** faible.

---

### 6.3 Disparition des données

**Sources de risque :**
- Sinistre Supabase Cloud (incident majeur infrastructure).
- Sinistre OVH Cloud (incendie, indisponibilité prolongée — cf. SBG 2021).
- Suppression accidentelle par un administrateur.
- Action malveillante (ransomware côté éditeur).

**Impacts potentiels sur les personnes :**
- Perte de l'historique CRM (préjudice de continuité de service).
- Perte de l'audit trail (préjudice de traçabilité, possible non-conformité éditoriale).
- Indisponibilité de la plateforme (préjudice opérationnel pour les ORG et les opérateurs).

**Évaluation initiale :**
- **Vraisemblance :** faible
- **Gravité :** moyenne à élevée
- **Niveau de risque brut :** modéré

**Mesures de mitigation :**
- **Sauvegardes Supabase** automatiques, rétention 30 jours, restauration ponctuelle (Point-in-Time Recovery selon plan).
- **Export régulier** : possibilité d'export SQL périodique stocké hors Supabase (à industrialiser).
- **Redondance multi-zone** Supabase Cloud UE.
- **Procédure de restauration documentée** : runbook SQL (`docs/SQL_ROLLOUT_RUNBOOK.md`).
- **Information sur les sauvegardes** auprès des ORG partenaires.

**Niveau de risque résiduel :** faible à modéré (dépend du niveau d'industrialisation des exports externes — point d'amélioration identifié).

---

## 7. Synthèse des risques et plan d'action

| Risque | Vraisemblance | Gravité | Niveau résiduel | Actions de suivi |
|---|---|---|---|---|
| Accès illégitime | Moyenne | Moyenne | **Faible** | Déployer MFA pour owner/super_admin ; audit RLS annuel |
| Modification non désirée | Moyenne | Faible-Moyenne | **Faible** | Continuer la couverture de tests sur les fonctions API |
| Disparition des données | Faible | Moyenne-Élevée | **Faible-Modéré** | Industrialiser un export externe régulier ; documenter le PCA |

### 7.1 Actions correctives priorisées

| # | Action | Échéance | Responsable |
|---|---|---|---|
| 1 | ✅ **Livré — Neutralisation automatique des métadonnées EXIF** des nouveaux uploads via `/api/media/upload` (sharp, strip EXIF/IPTC/XMP + resize ≤ 2000 px). Reste à planifier : backfill des médias antérieurs. | Livré T2 2026 · Backfill : T4 2026 | Équipe SI |
| 2 | **Formaliser une convention de responsabilité conjointe** (Art. 26 RGPD) avec chaque ORG partenaire : information des personnes, exercice des droits, sécurité, gestion des incidents / violations, durées de conservation, responsabilités éditoriales, pilotage des sous-traitants | T3 2026 | Référent RGPD + Direction |
| 3 | **Définir et déployer la règle « pas de données sensibles dans les champs libres CRM »** : mention d'aide à la saisie dans l'UI, formation des éditeurs, contrôle a posteriori | T2 2026 | Référent RGPD + équipe produit |
| 4 | **Archiver les preuves sous-traitants** : DPA Supabase (données — Supabase Inc. sur AWS `eu-west-1`, Irlande, projet « ryycrdhlkmzpxwwwwupy ») ; DPA OVHcloud (frontend — France) ; certificat ISO/IEC 27001 Supabase et certifications ISO/IEC 27001:2022, 27017:2015, 27018:2019, 27701:2019 OVHcloud ; encadrement documenté du flux d'auth Google OAuth (utilisateurs internes uniquement ; EU-US Data Privacy Framework, à confirmer) ; revérification annuelle de la liste des sous-traitants ultérieurs | T2 2026 | Référent RGPD |
| 5 | Activer la MFA Supabase pour les rôles `owner` et `super_admin` (non déployée à ce jour) et activer la protection « mot de passe compromis » (actuellement désactivée) | T3 2026 | Référent RGPD + équipe SI |
| 6 | Mettre en place un export SQL externe hebdomadaire vers stockage chiffré tiers | T3 2026 | Équipe SI |
| 7 | Configurer les en-têtes de sécurité applicatifs HSTS, CSP, X-Frame-Options, Referrer-Policy (aucun n'est configuré à ce jour) | T2 2026 | Équipe SI |
| 8 | Industrialiser et documenter les tests de restauration trimestriels | T4 2026 | Équipe SI |
| 9 | Formaliser le registre des activités de traitement (Art. 30 RGPD) | T2 2026 | Référent RGPD |
| 10 | Information / formation RGPD des éditeurs ORG partenaires | T3 2026 | Référent RGPD |
| 11 | **Outiller l'effacement et la conservation** : aucune fonction automatisée d'effacement/anonymisation n'existe (les effacements sont manuels). Définir une procédure documentée de purge ciblée (y compris dans `audit.audit_log`, conservé 12 mois, et `object_version`, non purgé) pour répondre aux demandes Art. 17 ; mettre en œuvre l'anonymisation des comptes inactifs > 24 mois (cible de politique non automatisée) | T3 2026 | Référent RGPD + équipe SI |
| 12 | **Strip des métadonnées des vidéos** : les images sont strippées à l'upload, pas les vidéos (métadonnées conteneur GPS/appareil conservées, pas de transcodeur serveur) — implémenter un pipeline de strip vidéo (ex. ffmpeg) ou documenter formellement la limite | T4 2026 | Équipe SI |
| 13 | **Capter le consentement des portraits d'acteurs** : la table `actor_consent` existe mais n'est alimentée par aucun chemin d'écriture ; les portraits sont en bucket public — implémenter la capture du consentement et restreindre l'accès aux portraits | T3 2026 | Référent RGPD + équipe produit |
| 14 | **Corriger les points d'amélioration de sécurité** (advisors Supabase) : restreindre les deux vues SECURITY DEFINER lisibles par le rôle anonyme ; restreindre/nettoyer les buckets publics listables et les médias orphelins (`media.url` sans clé étrangère) | T3 2026 | Équipe SI |
| 15 | **Compléter la cotation CNIL** des trois événements redoutés (gravité × vraisemblance, sources de risque, mesures) ; arrêter la cotation chiffrée définitive | T3 2026 | Référent RGPD |

---

## 8. Consultation des parties prenantes

- **Personnes concernées** : information par la page RGPD ([rgpd.md](rgpd.md)) accessible publiquement. Les éditeurs sont informés à la création de compte. Les opérateurs et contacts CRM sont informés lors du premier contact.
- **Référent RGPD interne** : la présente DPIA est rédigée par le référent RGPD interne (David Philippe) ; elle est à l'état de projet, à valider par le responsable de traitement.
- **Sous-traitants** : les DPA Supabase (données — AWS eu-west-1, Irlande) et OVHcloud (frontend — France) sont à examiner et à archiver ; le flux d'authentification Google OAuth (utilisateurs internes uniquement) est à encadrer (EU-US Data Privacy Framework, à confirmer).
- **CSE** : aucun CSE n'est encore en place chez SPL OTI DU SUD. L'organisation s'engage à présenter Bertel et la présente DPIA dès l'installation de l'instance.
- **Autorité de contrôle (CNIL)** : la consultation préalable (Art. 36 RGPD) n'est pas requise dans la mesure où les risques résiduels sont évalués comme faibles à modérés et maîtrisés.

---

## 9. Validation

**Statut :** projet — à valider par le responsable de traitement.

**Avis du responsable de traitement :** au regard des éléments documentés à ce stade, le traitement Bertel présente un **niveau de risque résiduel à maîtriser, sous réserve de la mise en œuvre effective des actions correctives identifiées au §7.1** (dont la cotation CNIL formelle reste à compléter). La présente analyse ne dispense pas :

- de la **tenue du registre des activités de traitement** (Art. 30 RGPD) ;
- de la **formalisation des relations avec les ORG partenaires** par une convention de responsabilité conjointe (Art. 26 RGPD) ;
- de la **vérification documentaire continue des sous-traitants** (Art. 28 RGPD — DPA, certifications, sous-traitants ultérieurs, régions d'hébergement).

Aucune consultation préalable de la CNIL (Art. 36 RGPD) n'est requise à ce stade.

| Rôle | Nom | Date | Validation |
|---|---|---|---|
| Référent RGPD interne | David Philippe | 2026-06-16 | 🟡 Projet — à valider |
| Responsable du traitement | SPL OTI DU SUD (représentée par la direction) | — | 🟡 Projet — à valider |

---

## 10. Suivi et révision

La présente DPIA fait l'objet d'une **révision annuelle** et est **réévaluée systématiquement** dans les cas suivants :

- Évolution significative du périmètre fonctionnel (nouveau module, nouveau type de données).
- Ajout d'un sous-traitant majeur.
- Changement de finalité ou de base légale.
- Incident de sécurité significatif.
- Modification du cadre réglementaire applicable.

**Prochaine révision prévue :** mai 2027.

---

## Annexe A — Documents de référence

- [rgpd.md](rgpd.md) — Règlement RGPD Bertel (information des personnes concernées)
- `CLAUDE.md` — Invariants architecturaux et règles métier
- `docs/SQL_ROLLOUT_RUNBOOK.md` — Runbook de déploiement SQL et restauration
- `Base de donnée DLL et API/schema_unified.sql` — Schéma de référence (RLS, contraintes, audit)
- `Base de donnée DLL et API/api_views_functions.sql` — Vues et fonctions API (authentification, permissions)

---

*Document interne — version 1.1 (projet, à valider) — Dernière mise à jour : 16 juin 2026*
