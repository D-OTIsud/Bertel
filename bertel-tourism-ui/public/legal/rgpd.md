# Règlement RGPD — Bertel

**Plateforme Bertel 3.0 — Système d'Information Touristique (SIT) & CRM**

Dernière mise à jour : 27 mai 2026

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

- **Identité commerciale** : raison sociale ou nom commercial, SIREN, statut juridique.
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
- **Métadonnées EXIF des médias** : peuvent contenir géolocalisation et date — l'OTI s'engage à les nettoyer avant publication lorsqu'elles concernent des contenus privés.

### 4.5 Journalisation technique

- **Logs Supabase Auth** : adresse IP de connexion, user-agent, date / heure, type d'événement (connexion, échec, déconnexion). Conservés selon la politique Supabase.
- **Logs applicatifs** : appels aux fonctions API (`api.*`), erreurs, opérations sensibles.

> **Pas de donnée sensible (Art. 9 RGPD)** : Bertel ne collecte ni données de santé, ni opinions, ni origines, ni données biométriques. Aucune géolocalisation des utilisateurs en temps réel.

---

## 5. Durées de conservation

| Type de données | Durée de conservation |
|---|---|
| Comptes éditeurs (actifs) | Pendant la durée du mandat ou contrat éditeur |
| Comptes éditeurs (inactifs) | Anonymisation 24 mois après dernière connexion |
| Logs d'authentification Supabase | Selon politique Supabase Auth (≈ 30 à 90 jours) |
| Audit trail (`object_version`, `pending_change`) | 5 ans pour la traçabilité éditoriale |
| Contacts CRM (prospects) | 3 ans après dernier contact |
| Contacts CRM (partenaires actifs) | Durée de la relation + 3 ans |
| Données opérateurs publiés | Tant que l'opérateur est référencé + archivage 3 ans après désinscription |
| Médias archivés | Durée de vie de l'objet touristique associé |
| Sauvegardes (backups Supabase) | 30 jours glissants (rétention par défaut Supabase Cloud) |

> ⚠️ **Purge** : les anonymisations et suppressions sont effectuées sur demande, ou à échéance des durées ci-dessus. Les sauvegardes sont automatiquement supprimées au-delà de la fenêtre de rétention.

---

## 6. Destinataires des données

Les données peuvent être communiquées à :

- **Agents OTI / ORG** : selon leur rôle et leur ORG d'appartenance, dans la limite des permissions RLS (Row Level Security PostgreSQL).
- **Modérateurs et administrateurs plateforme** : pour la qualité des contenus et la sécurité.
- **API publique Bertel** : diffusion des contenus touristiques publiés vers les sites partenaires et applications grand public (uniquement les données professionnelles destinées à publication, jamais les données de comptes ou de CRM).
- **Sous-traitants techniques** : voir §6.1.

### 6.1 Sous-traitants (Art. 28 RGPD)

| Sous-traitant | Rôle | Localisation | Conformité documentée |
|---|---|---|---|
| Supabase Inc. | Hébergement base de données, Auth, Storage | Région primaire UE à documenter pour le projet Bertel (régions disponibles : `eu-west-1` Ireland, `eu-west-3` Paris, `eu-central-1` Frankfurt, `eu-central-2` Zurich, `eu-north-1` Stockholm — chaque projet est déployé dans une région primaire) | Certifié **ISO/IEC 27001** (certificat accessible depuis le dashboard Supabase pour les plans Team et Enterprise) · **Chiffrement AES-256 au repos** et **TLS en transit** · **DPA disponible** devant être rendu juridiquement opposable via la procédure PandaDoc accessible depuis le dashboard Supabase · **Sauvegarde et restauration** intégrées, **PITR** disponible en option pour les plans Pro / Team / Enterprise |
| OVHcloud | Hébergement front + reverse proxy (Coolify) | France | **DPA OVHcloud** encadrant le rôle de sous-traitant · **Engagements publics RGPD** : traitement selon les instructions du client, absence de réutilisation commerciale, notification en cas de violation, documentation, transparence · Lorsque le client sélectionne une zone de stockage située dans l'UE, OVHcloud s'engage à ne pas traiter les données hors UE ni aux États-Unis · Certifications **ISO/IEC 27001:2022**, **ISO/IEC 27017:2015**, **ISO/IEC 27018:2019** et **ISO/IEC 27701:2019** sur le périmètre non-US, couvrant notamment VPS, Public Cloud Instances, Managed Relational Database, Object Storage et Managed Web Hosting |

✓ **Pas de transfert hors UE** pour les données personnelles éditeurs et CRM, sous réserve du maintien d'une région Supabase UE pour Bertel et de la sélection d'une zone OVH UE pour l'hébergement front. En cas de transfert hors UE, les garanties appropriées (Art. 46 — clauses contractuelles types) doivent être documentées.

---

## 7. Vos droits

Conformément au RGPD, vous disposez des droits suivants :

- **Droit d'accès** : obtenir confirmation que vos données sont traitées et en demander une copie.
- **Droit de rectification** : faire corriger des données inexactes ou incomplètes.
- **Droit à l'effacement** : demander la suppression de vos données dans les limites légales (les obligations de traçabilité métier peuvent prévaloir pour l'audit trail).
- **Droit à la limitation** : demander la suspension temporaire d'un traitement contesté.
- **Droit d'opposition** : vous opposer au traitement fondé sur l'intérêt légitime, pour des motifs tenant à votre situation particulière.
- **Droit à la portabilité** : récupérer vos données dans un format structuré et lisible par machine.
- **Droit de retrait du consentement** : à tout moment, sans effet rétroactif, lorsque le traitement est fondé sur le consentement.

**Pour exercer vos droits**, contactez le référent RGPD :
- Email : d.philippe@otisud.com
- Téléphone : 06 93 41 92 91
- Précisez votre demande, votre qualité (éditeur Bertel, opérateur référencé, contact CRM) et joignez une copie de votre pièce d'identité.

Délai de réponse : **1 mois** maximum (extensible à 3 mois pour les demandes complexes).

---

## 8. Sécurité des données

SPL OTI DU SUD met en œuvre des mesures techniques et organisationnelles appropriées :

- **Authentification nominative** : Supabase Auth (mot de passe ou OAuth), JWT signés.
- **Chiffrement** : **AES-256** des données client au repos (Supabase) ; **TLS** de bout en bout en transit (HTTPS, HSTS).
- **Contrôle d'accès** : RBAC (rôles plateforme) + RLS PostgreSQL (isolation par ORG et par permission).
- **Cloisonnement multi-ORG** : chaque ORG accède uniquement à ses données et aux contenus publiés du réseau.
- **Audit trail** : journalisation systématique des créations, modifications et suppressions d'objets (`object_version`, `pending_change`).
- **Workflow de modération** : revue préalable des publications sensibles.
- **Sauvegardes** : backups automatiques Supabase (rétention 30j) ; tests de restauration **à industrialiser** sur un rythme trimestriel (action planifiée).
- **Mises à jour de sécurité** : application régulière des correctifs sur la stack Supabase, Next.js, dépendances.
- **Gestion des secrets** : aucune clé sensible dans le dépôt source ; variables d'environnement injectées au runtime.
- **Hébergement souverain** : Supabase Cloud UE + OVH Cloud France, conformes RGPD.

---

## 9. Cookies et traceurs

Bertel utilise uniquement des cookies strictement nécessaires :

- **Cookies de session Supabase Auth** : maintien de l'authentification (durée : session ou refresh token).
- **Cookies de préférences UI** : thème (clair / sombre), langue, état des panneaux.

> ⚠️ **Aucun cookie publicitaire, aucun traceur tiers, aucun outil d'analyse comportementale** (pas de Google Analytics, pas de Meta Pixel).

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

*Dernière mise à jour : 27 mai 2026*
