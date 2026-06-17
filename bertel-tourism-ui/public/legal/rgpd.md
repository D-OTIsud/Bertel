# Règlement RGPD — Bertel

**Plateforme Bertel 3.0 — Système d'Information Touristique (SIT) & CRM**

Dernière mise à jour : 16 juin 2026

---

## 1. Responsable du traitement

**SPL OTI DU SUD**
Office de Tourisme Intercommunal du Sud de La Réunion — éditeur et opérateur de la plateforme Bertel.

- **Adresse :** 379 Rue Hubert Delisle, 97430 Le Tampon
- **SIREN :** 882 699 556

**Référent RGPD interne**
David Philippe — Manager SI
Email : d.philippe@otisud.com
Téléphone : 06 93 41 92 91

> SPL OTI DU SUD n'a pas désigné de Délégué à la Protection des Données (DPO) au sens de l'Art. 37 du RGPD. M. Philippe assure la fonction de **référent RGPD interne**, point de contact privilégié pour les personnes concernées et l'autorité de contrôle.

> [À VALIDER PAR LE DPO : harmoniser la qualification du référent dans tout le pack — employer « référent RGPD interne » partout. Signaler le point d'indépendance Art. 38(6) : le cumul des fonctions Manager SI / référent RGPD est à arbitrer avec la direction afin d'éviter un conflit d'intérêts.]

**Responsabilité conjointe (Art. 26 RGPD).** Bertel est une plateforme mutualisée. Chaque ORG partenaire (autres OTI, structures SIT) qui publie ses propres contenus touristiques via Bertel reste responsable du traitement pour les données dont elle est éditrice (contenu publié, données opérateurs qu'elle saisit, son CRM). SPL OTI DU SUD demeure responsable des données techniques de la plateforme (comptes éditeurs, logs, infrastructure) et fournit le cadre RGPD commun décrit dans le présent document.

> ⚠️ **Convention à formaliser.** Une convention écrite (Art. 26 §1) détaillant la répartition précise des obligations entre SPL OTI DU SUD et chaque ORG partenaire (information des personnes concernées, exercice des droits RGPD, gestion des violations, pilotage des sous-traitants, durées de conservation, responsabilités éditoriales) est en cours de rédaction. À défaut, le présent document fait office de cadre commun provisoire et chaque ORG demeure responsable pour son périmètre éditorial.

---

## 2. Finalités du traitement

Bertel est utilisée pour :

- **Production et diffusion d'informations touristiques** : référencement, qualification et publication des établissements, activités, itinéraires, événements et restaurants sur le territoire (mission d'intérêt public des Offices de Tourisme).
- **Gestion des comptes éditeurs** : authentification, autorisations (RBAC), appartenance à une ORG, suivi des actions (audit trail).
- **CRM tourisme** : suivi de la relation avec les opérateurs commerciaux (prestataires), demandes entrantes, comptes-rendus de visite, animation du réseau.
- **Modération et workflow de publication** : revue des modifications proposées, historisation des versions, traçabilité éditoriale.
- **Conformité et sécurité** : journalisation des accès administratifs, contrôle d'intégrité, sauvegardes, supervision technique.

> **Important** : Bertel ne fait pas de profilage commercial des utilisateurs finaux. Les contenus publiés sont des informations professionnelles et touristiques destinées à la diffusion publique.

---

## 3. Bases légales du traitement

Le traitement de vos données personnelles est fondé sur :

- **Article 6.1.e du RGPD (Mission d'intérêt public)** : exercice de la mission de service public d'un Office de Tourisme — référencement et promotion du territoire (Code du tourisme, articles L.133-3 et suivants).
- **Article 6.1.f du RGPD (Intérêt légitime)** : gestion des comptes éditeurs, animation du réseau de prestataires, sécurisation de la plateforme.
- **Article 6.1.b du RGPD (Exécution d'un contrat)** : exécution des conventions de partenariat / d'adhésion avec les prestataires touristiques et les ORG partenaires.
- **Article 6.1.c du RGPD (Obligation légale)** : conservation comptable, traçabilité des publications, archivage des décisions de modération.
- **Article 6.1.a du RGPD (Consentement)** : envoi de communications non sollicitées, captation de contacts via formulaires publics opt-in (le cas échéant).

---

## 4. Données collectées

Bertel traite des catégories de données différenciées selon la qualité de la personne concernée.

### 4.1 Comptes éditeurs (agents OTI, partenaires ORG)

- **Identité** : nom affiché (`display_name`), avatar (`avatar_url`), email (via `auth.users`).
- **Préférences applicatives** : langue (`locale`), fuseau horaire (`timezone`), langues d'édition préférées (`lang_prefs`), préférences UI (`preferences`, JSON).
- **Rôle et appartenance** : rôle plateforme (`owner`, `super_admin`, `tourism_agent`), appartenance à une ou plusieurs ORG, permissions effectives.
- **Authentification** : hash de mot de passe (jamais le mot de passe en clair — géré par Supabase Auth), tokens de session JWT, date de dernière connexion, date de création du compte.
- **Audit trail** : identifiant utilisateur attaché à chaque création / modification / suppression d'objet (`created_by`, `updated_by`, `submitted_by`, `reviewed_by`, `auditor_id`).

### 4.2 Opérateurs commerciaux (prestataires — ACTOR)

Données professionnelles et, le cas échéant, personnelles lorsque l'opérateur est une personne physique (auto-entrepreneur, indépendant) :

- **Identité commerciale** : raison sociale ou nom commercial, SIREN/SIRET [à valider : préciser si la donnée stockée est le SIREN (entité) ou le SIRET (établissement)], statut juridique.
- **Contact pro** : email professionnel, téléphone fixe / mobile, site web, comptes réseaux sociaux.
- **Coordonnées d'exploitation** : adresse de l'établissement, point de rendez-vous, zone d'intervention.
- **Liens institutionnels** : ORG de rattachement (publication), rôles opérationnels (`actor_object_role`).

### 4.3 Contacts CRM (clients, prospects, contacts du réseau)

- **Identité** : nom, prénom, fonction.
- **Contact** : email, téléphone, organisation.
- **Historique relationnel** : demandes reçues, commentaires de suivi, comptes-rendus de visite, sujets traités (`crm_demand_topic_oti`), canal d'origine.

> ⚠️ **Champs libres CRM — interdiction stricte.** Les zones de texte libre (commentaires, comptes-rendus, notes de suivi) **ne doivent en aucun cas contenir** : données de santé, opinions politiques / philosophiques / religieuses, appartenance syndicale, origine, orientation sexuelle, données biométriques ou génétiques, condamnations pénales, ni appréciations subjectives excessives (jugements de valeur sur la personne). Une mention d'aide à la saisie est affichée dans l'interface d'édition CRM et reprise lors de la formation des éditeurs. Tout manquement constaté donne lieu à correction immédiate par le référent RGPD.

### 4.4 Contenus publiés et médias

- **Établissements touristiques** : descriptifs, accroches, photos, vidéos, classements, labels.
- **Métadonnées des médias** : les images sont ré-encodées à l'upload, ce qui supprime leurs métadonnées EXIF/IPTC/XMP (GPS, appareil) — mesure en place. Les vidéos sont en revanche stockées telles quelles : leurs métadonnées de conteneur (pouvant contenir GPS/appareil) NE SONT PAS supprimées (limite documentée, pas de transcodeur serveur), à traiter comme un risque résiduel.
- **Photo de portrait d'acteur** : la fiche acteur peut porter une photo de portrait (image d'une personne physique) stockée dans un bucket public (seule protection : un chemin de fichier non devinable, ce qui n'est pas un contrôle d'accès). La table `actor_consent` existe mais n'est alimentée par aucun chemin d'écriture : le consentement n'est pas capté à ce jour. Le consentement ne peut donc PAS être présenté comme une mesure en place — c'est une mesure à mettre en œuvre.

### 4.5 Avis de tiers et signalements citoyens

- **Avis de tiers** (`object_review`) : nom ou pseudonyme de l'auteur, avatar, contenu de l'avis. Ces données émanent de personnes tierces (collecte indirecte — voir l'information Art. 14 ci-dessous).
- **Signalements / incidents** (`incident_report`) : nom, email, géolocalisation et photos transmis par des déclarants (citoyens), avec propagation automatique vers le CRM. Données également issues d'une collecte indirecte (Art. 14).

> **Information en cas de collecte indirecte (Art. 14 RGPD)** : lorsque des données ne sont pas collectées directement auprès de la personne concernée (avis de tiers, signalements citoyens, données d'opérateurs saisies par un éditeur), la personne concernée bénéficie des mêmes droits et doit être informée de l'origine des données et de l'identité du responsable du traitement.

### 4.6 Journalisation technique

- **Logs Supabase Auth** : adresse IP de connexion, user-agent, date / heure, type d'événement (connexion, échec, déconnexion). Conservés selon la politique Supabase.
- **Logs applicatifs** : appels aux fonctions API (`api.*`), erreurs, opérations sensibles.
- **Données légales d'établissement** (`object_legal`) : SIRET/SIREN, raison sociale — constituent des données personnelles lorsque l'opérateur est un entrepreneur individuel.
- **Temps réel / présence** (Supabase Realtime) : l'identité de l'utilisateur connecté peut transiter via les canaux temps réel et de présence.

> **Données sensibles (Art. 9 RGPD)** : Bertel n'a pas vocation à collecter de données de santé, opinions, origines ou données biométriques, et l'interface d'édition CRM en interdit explicitement la saisie (voir §4.3). Toutefois, certaines surfaces de texte libre (champs CRM, avis de tiers, signalements) peuvent en théorie en recevoir : leur absence repose sur une consigne et une modération, non sur un blocage technique. Aucune géolocalisation des utilisateurs en temps réel.

---

## 5. Durées de conservation

| Type de données | Durée de conservation |
|---|---|
| Comptes éditeurs (actifs) | Pendant la durée du mandat ou contrat éditeur |
| Comptes éditeurs (inactifs) | Cible : anonymisation 24 mois après dernière connexion (à appliquer manuellement — voir l'avertissement ci-dessous) |
| Logs d'authentification Supabase | Selon politique Supabase Auth (≈ 30 à 90 jours) |
| Journal d'audit (`audit.audit_log`) | 12 mois glissants (rotation mensuelle des partitions) — copie complète avant/après, données personnelles incluses |
| Versioning éditorial (`object_version`) | Conservé sans purge automatique à ce jour |
| Contacts CRM (prospects) | 3 ans après dernier contact |
| Contacts CRM (partenaires actifs) | Durée de la relation + 3 ans |
| Données opérateurs publiés | Tant que l'opérateur est référencé + archivage 3 ans après désinscription |
| Médias archivés | Durée de vie de l'objet touristique associé |
| Sauvegardes (backups Supabase) | 30 jours glissants (rétention par défaut Supabase Cloud) |

> ⚠️ **Purge** : aucune purge ni anonymisation automatique des données personnelles n'est en place à ce jour (les seules tâches planifiées concernent le rafraîchissement de vues et la rotation des partitions d'audit à 12 mois). Les durées de conservation indiquées sont des cibles de politique, à appliquer manuellement tant que des purges automatiques ne sont pas implémentées. Les sauvegardes Supabase sont, elles, automatiquement supprimées au-delà de la fenêtre de rétention.

---

## 6. Destinataires des données

Les données peuvent être communiquées à :

- **Agents OTI / ORG** : selon leur rôle et leur ORG d'appartenance, dans la limite des permissions RLS (Row Level Security PostgreSQL).
- **Modérateurs et administrateurs plateforme** : pour la qualité des contenus et la sécurité.
- **API publique Bertel** : diffusion des contenus touristiques publiés vers les sites partenaires et applications grand public (uniquement les données professionnelles destinées à publication, jamais les données de comptes ou de CRM).
- **Sous-traitants techniques et destinataires** : voir §6.1 (hébergement) et §6.2 (sous-traitants).

### 6.1 Hébergement et localisation des données (toutes dans l'Union européenne)

- **Application web (frontend Next.js, conteneur Docker)** : OVHcloud, France (UE).
- **Données personnelles (base de données PostgreSQL managée, authentification, stockage de fichiers, temps réel)** : Supabase Inc. sur Amazon Web Services, région `eu-west-1` (Irlande, UE) — projet « ryycrdhlkmzpxwwwwupy ».

Aucune donnée n'est hébergée hors de l'Union européenne.

### 6.2 Sous-traitants et destinataires réels (Art. 28 RGPD)

| Sous-traitant | Rôle | Localisation | Conformité documentée |
|---|---|---|---|
| OVHcloud | Hébergement de l'application web (frontend) | France (UE) | **DPA OVHcloud** à archiver · **Engagements publics RGPD** : traitement selon les instructions du client, absence de réutilisation commerciale, notification en cas de violation, documentation, transparence · Lorsque le client sélectionne une zone de stockage située dans l'UE, OVHcloud s'engage à ne pas traiter les données hors UE ni aux États-Unis · Certifications **ISO/IEC 27001:2022**, **ISO/IEC 27017:2015**, **ISO/IEC 27018:2019** et **ISO/IEC 27701:2019** sur le périmètre non-US |
| Supabase Inc. | Base de données, authentification, stockage de fichiers, temps réel | UE — AWS `eu-west-1` (Irlande) | **DPA à archiver** · **Chiffrement AES-256 au repos** et **TLS en transit** (garantie plateforme) · **Sauvegarde et restauration** intégrées, **PITR** disponible en option |
| Google (Google Ireland Ltd / Google LLC) | Authentification via Google OAuth, **uniquement pour les utilisateurs internes de l'organisation** (agents de l'office) ; les prestataires/acteurs et le public ne s'authentifient jamais via Google | Transfert hors UE potentiel | Encadré par le **EU-US Data Privacy Framework** [à confirmer et archiver] |
| API Adresse / Base Adresse Nationale (data.gouv.fr) | Géocodage des adresses saisies (appel côté serveur) | France (UE) | Service public de l'État français |
| Services chargés dans le navigateur du visiteur (reçoivent son adresse IP) | Tuiles cartographiques OpenFreeMap + MapLibre, favicons DuckDuckGo, Google Fonts | Tiers | L'auto-hébergement de ces ressources est recommandé pour limiter ces flux |

Aucun envoi d'e-mail/SMS applicatif n'est en place à ce jour.

✓ **Pas de transfert hors UE pour l'hébergement** : l'application web est hébergée en France (OVHcloud) et l'ensemble des données personnelles est hébergé en Irlande (Supabase/AWS `eu-west-1`) — l'intégralité reste donc dans l'Union européenne. **Seule nuance** : les **utilisateurs internes** (agents de l'office) peuvent s'authentifier via **Google OAuth**, ce qui constitue le seul flux susceptible d'impliquer un transfert hors UE ; ce transfert est encadrable par le EU-US Data Privacy Framework [à confirmer]. Les prestataires/acteurs et le public ne sont pas concernés par ce flux. En cas de transfert hors UE, les garanties appropriées (Art. 46 — clauses contractuelles types) doivent être documentées.

---

## 7. Vos droits

Conformément au RGPD, vous disposez des droits suivants :

- **Droit d'accès** : obtenir confirmation que vos données sont traitées et en demander une copie.
- **Droit de rectification** : faire corriger des données inexactes ou incomplètes.
- **Droit à l'effacement** : demander la suppression de vos données dans les limites légales (les obligations de traçabilité métier peuvent prévaloir pour le journal d'audit). État réel de l'effacement et du journal d'audit (à connaître pour répondre aux demandes au titre de l'Art. 17) : aucune fonction automatisée d'effacement ou d'anonymisation n'existe à ce jour — un effacement est une opération **MANUELLE** (suppression ciblée sous contrôle technique). De plus, le journal d'audit (`audit.audit_log`) conserve une copie complète (état avant/après, données personnelles incluses) de chaque modification et suppression sur l'ensemble des tables, attribuée à l'utilisateur, pendant 12 mois glissants. Une donnée supprimée reste donc présente dans le journal d'audit jusqu'à 12 mois ; sa purge ciblée doit être effectuée manuellement lorsque la demande l'exige. Le versioning `object_version` n'est, lui, pas purgé automatiquement.
- **Droit à la limitation** : demander la suspension temporaire d'un traitement contesté.
- **Droit d'opposition** : vous opposer au traitement fondé sur l'intérêt légitime, pour des motifs tenant à votre situation particulière.
- **Droit à la portabilité** : récupérer vos données dans un format structuré et lisible par machine.
- **Droit de retrait du consentement** : à tout moment, sans effet rétroactif, lorsque le traitement est fondé sur le consentement.

> **Décision individuelle automatisée (Art. 22 RGPD)** : Bertel ne met en œuvre aucune décision produisant des effets juridiques ou vous affectant de manière significative fondée exclusivement sur un traitement automatisé, ni aucun profilage à cette fin.

**Pour exercer vos droits**, contactez le référent RGPD :
- Email : d.philippe@otisud.com
- Téléphone : 06 93 41 92 91
- Précisez votre demande, votre qualité (éditeur Bertel, opérateur référencé, contact CRM) et joignez une copie de votre pièce d'identité.

Délai de réponse : **1 mois** maximum (extensible à 3 mois pour les demandes complexes).

---

## 8. Sécurité des données

SPL OTI DU SUD met en œuvre des mesures techniques et organisationnelles. État réel des mesures (sans surdéclaration) :

- **Authentification nominative** : Supabase Auth (mot de passe ou OAuth), JWT signés.
- **Contrôle d'accès** : RBAC (rôles plateforme) + RLS PostgreSQL (isolation par ORG et par permission) — mécanisme robuste et activé sur les tables.
- **Cloisonnement multi-ORG** : chaque ORG accède uniquement à ses données et aux contenus publiés du réseau.
- **Séparation client / service-role** : les écritures privilégiées passent par une clé `service-role` côté serveur uniquement, jamais exposée au navigateur.
- **Journal d'audit** : journalisation systématique des créations, modifications et suppressions (`audit.audit_log`, conservation 12 mois).
- **Workflow de modération** : revue préalable des publications sensibles.
- **Chiffrement au repos** : assuré comme **garantie des plateformes** d'hébergement (OVHcloud, AWS/Supabase) ; **il n'existe pas de chiffrement applicatif des colonnes** au niveau de Bertel. Le transport est protégé par TLS (HTTPS).
- **Sauvegardes** : backups automatiques Supabase (rétention 30j) ; tests de restauration **à industrialiser** sur un rythme trimestriel (action planifiée).
- **Mises à jour de sécurité** : application régulière des correctifs sur la stack Supabase, Next.js, dépendances.
- **Gestion des secrets** : aucune clé sensible dans le dépôt source ; variables d'environnement injectées au runtime.

> ⚠️ **Points d'amélioration identifiés (à ne pas présenter comme acquis)** : aucun en-tête de sécurité applicatif (HSTS / CSP / X-Frame-Options) n'est configuré à ce jour ; l'authentification multifacteur (MFA) n'est pas déployée ; la protection « mot de passe compromis » est désactivée ; deux vues `SECURITY DEFINER` sont lisibles par le rôle anonyme ; les buckets de stockage publics sont listables (un fichier média n'est protégé que par un chemin non devinable). Ces points font l'objet d'un plan d'action (voir `dpia.md`).

---

## 9. Cookies et traceurs

Bertel utilise uniquement des cookies strictement nécessaires :

- **Cookies de session Supabase Auth** : maintien de l'authentification (durée : session ou refresh token).
- **Cookies de préférences UI** : thème (clair / sombre), langue, état des panneaux.

> ⚠️ **Aucun cookie publicitaire, aucun outil d'analyse comportementale** (pas de Google Analytics, pas de Meta Pixel).

> **Précision** : si Bertel n'emploie aucun traceur publicitaire ni outil d'analyse, certaines ressources sont chargées depuis des services tiers dans le navigateur du visiteur (tuiles cartographiques OpenFreeMap + MapLibre, favicons DuckDuckGo, Google Fonts), lesquels reçoivent de ce fait son adresse IP. Ces flux sont décrits au §6.2 ; l'auto-hébergement de ces ressources est recommandé pour les supprimer.

---

## 10. Réclamation

Si vous estimez que vos droits ne sont pas respectés, vous pouvez introduire une réclamation auprès de la Commission Nationale de l'Informatique et des Libertés (CNIL) :

**CNIL**
3 Place de Fontenoy — TSA 80715
75334 PARIS CEDEX 07
Téléphone : 01 53 73 22 22
Site web : [www.cnil.fr](https://www.cnil.fr)

---

## 11. Contact et conformité

Pour toute question relative au traitement de vos données personnelles :

**Référent RGPD interne — SPL OTI du SUD**
David Philippe — Manager SI
Email : d.philippe@otisud.com
Téléphone : 06 93 41 92 91

✓ **Analyse d'impact documentée** : une analyse d'impact relative à la protection des données (DPIA) a été conduite à titre préventif pour Bertel ; un plan d'action est en cours de mise en œuvre (voir document `dpia.md`).

✓ **Information CSE** : à ce jour, aucun Comité Social et Économique n'est en place au sein de SPL OTI DU SUD. L'organisation s'engage à informer cette instance dès son installation, conformément à l'article L.2312-38 du Code du travail, étant entendu que Bertel n'est pas un outil de surveillance de l'activité des salariés (cf. §2 — pas de profilage, pas de suivi de productivité).

---

*Dernière mise à jour : 16 juin 2026*
