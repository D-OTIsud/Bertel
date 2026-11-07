# Règlement RGPD — Bertel

**Plateforme Bertel 3.0 — Système d'Information Touristique (SIT) & CRM**

Dernière mise à jour : 6 septembre 2026

Version documentaire en révision : les prestataires actifs, leurs lieux de traitement et certaines durées de conservation restent à confirmer avant validation définitive.

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
- **Envoi de sélections par e-mail** : lorsque cette fonction est activée et qu'un conseiller l'utilise, transmission d'une sélection touristique à un destinataire choisi par ce conseiller.
- **Assistance à la saisie de menus** : lorsque cette fonction est activée, aide à l'extraction du contenu d'un menu à partir d'images pour proposer un brouillon que l'éditeur vérifie avant de l'ajouter.
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

- **Identité commerciale** : raison sociale ou nom commercial, SIREN/SIRET, statut juridique.
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
- **Documents privés et portraits publics** : les documents ajoutés à la bibliothèque privée d'un acteur sont destinés aux utilisateurs habilités à consulter sa fiche dans le CRM. Leur consultation passe par un contrôle d'accès et un lien temporaire. Cette bibliothèque est distincte des médias destinés à être diffusés et des portraits associés aux acteurs : un portrait enregistré par le parcours de publication de photo dispose d'une adresse accessible publiquement.
- **Consentements de contact** : Bertel prévoit l'enregistrement des accords ou des refus de contact des acteurs, par moyen de communication, avec leur date et leur source. L'existence de ce registre ne signifie pas qu'un accord a été recueilli pour chaque personne ou pour chaque usage, notamment pour la publication d'un portrait. Pour signaler votre choix ou retirer un consentement, vous pouvez contacter le référent RGPD indiqué dans cette notice.
- **Sélections envoyées par e-mail** : lorsque l'envoi de sélections est activé, l'adresse du destinataire est utilisée pour transmettre le message. Celui-ci peut contenir la sélection touristique, des notes, un lien de consultation et les coordonnées ou la photo du conseiller qui le signe.
- **Images de menus** : lorsque l'assistance à la saisie de menus est activée, les images du menu, y compris les pages d'un document converties en images, peuvent être transmises à un fournisseur d'intelligence artificielle avec les indications nécessaires à leur lecture ; les informations visibles sur ces images peuvent donc lui être communiquées.

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
| Logs d'authentification Supabase | Durée de l'offre et de la configuration actives, en cours de vérification |
| Journal d'audit (`audit.audit_log`) | 12 mois glissants (rotation mensuelle des partitions) — copie complète avant/après, données personnelles incluses |
| Versioning éditorial (`object_version`) | Conservé sans purge automatique à ce jour |
| Contacts CRM (prospects) | 3 ans après dernier contact |
| Contacts CRM (partenaires actifs) | Durée de la relation + 3 ans |
| Données opérateurs publiés | Tant que l'opérateur est référencé + archivage 3 ans après désinscription |
| Médias archivés | Durée de vie de l'objet touristique associé |
| Sauvegardes (backups Supabase) | Durée contractuelle en cours de vérification |

> ⚠️ **Purge** : la purge périodique automatique de l'ensemble des données personnelles n'est pas en place à ce jour pour toutes les catégories (les seules tâches planifiées concernent le rafraîchissement de vues et la rotation des partitions d'audit à 12 mois). Les durées de conservation indiquées ci-dessus sont des cibles de politique, à appliquer manuellement tant que des purges automatiques ne sont pas implémentées pour la catégorie concernée. Le traitement d'une demande individuelle d'effacement (voir §7) est distinct de cette purge périodique : la présence de l'outil d'effacement ne signifie pas que toutes les durées de conservation sont appliquées automatiquement. Les copies de sauvegarde sont traitées séparément des données actives ; l'outil d'effacement de l'application ne supprime pas les copies déjà présentes dans les sauvegardes.

---

## 6. Destinataires des données

Les données peuvent être communiquées à :

- **Agents OTI / ORG** : selon leur rôle et leur ORG d'appartenance, dans la limite des permissions RLS (Row Level Security PostgreSQL).
- **Modérateurs et administrateurs plateforme** : pour la qualité des contenus et la sécurité.
- **API publique Bertel** : diffusion des contenus touristiques publiés vers les sites partenaires et applications grand public (uniquement les données professionnelles destinées à publication, jamais les données de comptes ou de CRM).
- **Sous-traitants techniques et destinataires** : voir §6.1 (hébergement) et §6.2 (sous-traitants).

### 6.1 Hébergement et localisation des données

L'application, les données, l'authentification et les fichiers peuvent relever de services distincts. Le prestataire d'hébergement effectivement utilisé, les régions de traitement et la localisation des sauvegardes restent à confirmer dans la version définitive de cette notice. L'utilisation de Supabase ne permet pas, à elle seule, d'affirmer que tous les traitements ont lieu dans l'Union européenne.

### 6.2 Sous-traitants et destinataires réels (Art. 28 RGPD)

Bertel fait appel à des services techniques pour son fonctionnement. Selon les fonctions activées, les traitements peuvent faire intervenir l'hébergement de l'application, le stockage des données et des fichiers, l'authentification, l'envoi d'e-mails, l'assistance par intelligence artificielle et le chargement de ressources cartographiques. Les éventuels transferts hors de l'Union européenne doivent être appréciés pour chacun de ces services ; ils ne se limitent pas à la connexion avec Google.

| Service | Usage et données concernées |
|---|---|
| Hébergement de l'application | Exécution du site et informations techniques de connexion. Prestataire actif à confirmer. |
| Supabase | Base de données, authentification, stockage de fichiers et temps réel. Région et conditions de l'offre active à confirmer. |
| Google, si la connexion Google est activée | Authentification des comptes qui utilisent ce mode de connexion. Pays de traitement et garanties applicables à confirmer. |
| Service de messagerie configuré | Adresse du destinataire et contenu de la sélection envoyée par un conseiller. Fournisseur actif, lieux et conservation à confirmer. |
| Fournisseur d'intelligence artificielle configuré | Images du menu et indications de lecture lorsque l'éditeur utilise l'assistance. Fournisseur actif, lieux, conservation et éventuelle réutilisation à confirmer. |
| Recherche Base Adresse Nationale | Texte d'adresse saisi, transmis depuis le navigateur pour obtenir des suggestions, et informations de connexion dont l'adresse IP. |
| Services cartographiques et icônes de sites | Cartes MapLibre/OpenFreeMap et icônes DuckDuckGo selon la configuration. Ces chargements transmettent notamment l'adresse IP. |

Ce tableau décrit les services identifiés à ce jour ; il ne constitue pas à lui seul une information complète sur l'ensemble des destinataires et des transferts, en particulier lorsque l'envoi d'e-mails ou l'assistance par intelligence artificielle sont activés avec un fournisseur non encore documenté.

---

## 7. Vos droits

Conformément au RGPD, vous disposez des droits suivants :

- **Droit d'accès** : obtenir confirmation que vos données sont traitées et en demander une copie.
- **Droit de rectification** : faire corriger des données inexactes ou incomplètes.
- **Droit à l'effacement** : demander la suppression de vos données dans les limites légales (les obligations de traçabilité métier peuvent prévaloir pour le journal d'audit). Le traitement d'une demande d'effacement peut s'appuyer sur un outil de suppression ou d'anonymisation réservé aux administrateurs habilités. Selon les données concernées, il traite les informations de la fiche, les informations liées dans le CRM, certaines données présentes dans le journal des modifications et les fichiers identifiés. La suppression d'un compte de connexion fait l'objet d'une étape distincte. L'opération est suivie afin de repérer les étapes en échec et de pouvoir les reprendre. Cet outil ne garantit pas à lui seul un effacement de toutes les copies : les documents encore partagés avec d'autres fiches et les fichiers qui ne peuvent pas être identifiés demandent un examen complémentaire, et les anciens fichiers sans rattachement, les fichiers ajoutés pendant l'opération, les caches et les sauvegardes ne sont pas couverts par ce nettoyage automatique. Le journal des modifications conserve, indépendamment de cette opération, une copie de certains changements pendant la durée indiquée au §5 ; sa purge ciblée doit être effectuée manuellement lorsque la demande l'exige.
- **Droit à la limitation** : demander la suspension temporaire d'un traitement contesté.
- **Droit d'opposition** : vous opposer au traitement fondé sur l'intérêt légitime, pour des motifs tenant à votre situation particulière.
- **Droit à la portabilité** : récupérer vos données dans un format structuré et lisible par machine.
- **Droit de retrait du consentement** : à tout moment, sans effet rétroactif, lorsque le traitement est fondé sur le consentement.

> **Décision individuelle automatisée (Art. 22 RGPD)** : Bertel ne met en œuvre aucune décision produisant des effets juridiques ou vous affectant de manière significative fondée exclusivement sur un traitement automatisé, ni aucun profilage à cette fin.

**Pour exercer vos droits**, contactez le référent RGPD :
- Email : d.philippe@otisud.com
- Téléphone : 06 93 41 92 91
- Précisez votre demande, votre lien avec Bertel et les informations utiles pour retrouver les données qui vous concernent. Il n'est pas nécessaire de joindre systématiquement une copie de votre pièce d'identité. En cas de doute raisonnable sur votre identité, des informations complémentaires pourront vous être demandées ; une copie de pièce d'identité ne sera demandée que si elle est nécessaire à cette vérification.

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
- **Protections applicatives** : l'application prévoit des protections destinées à limiter les ressources externes chargées par les pages, à encadrer leur affichage dans un autre site et à demander au navigateur de privilégier les connexions sécurisées. Leur application effective dépend aussi de la configuration du service en ligne.
- **Sauvegardes** : backups automatiques Supabase (durée contractuelle en cours de vérification) ; tests de restauration **à industrialiser** sur un rythme trimestriel (action planifiée).
- **Mises à jour de sécurité** : application régulière des correctifs sur la stack Supabase, Next.js, dépendances.
- **Gestion des secrets** : aucune clé sensible dans le dépôt source ; variables d'environnement injectées au runtime.

Les contrôles de sécurité et les paramètres du service en ligne font l'objet d'un suivi distinct. Cette notice ne constitue pas une certification de sécurité.

---

## 9. Cookies et traceurs

Bertel utilise le stockage du navigateur pour maintenir la connexion, mémoriser certains réglages d'affichage et de carte, retrouver une vue de travail et conserver temporairement des informations utiles à la navigation. Les préférences d'export et certains référentiels peuvent également être enregistrés sur l'appareil. Certaines informations restent disponibles après la fermeture de la page ; d'autres sont limitées à l'onglet. Les réglages du navigateur permettent d'effacer ces données, ce qui peut déconnecter votre compte ou réinitialiser vos préférences.

Selon la page consultée, votre navigateur peut charger des cartes et des icônes de sites auprès de services externes (voir §6.2). Ces chargements communiquent notamment votre adresse IP au service concerné. Les polices intégrées à l'application sont servies par Bertel ; leur utilisation ne nécessite pas un chargement direct de Google Fonts par votre navigateur.

Le code applicatif examiné ne prévoit pas d'outil publicitaire ou d'analyse comportementale. L'inventaire des cookies et stockages doit également tenir compte des services activés sur le site en ligne.

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

✓ **Analyse d'impact documentée** : une analyse d'impact relative à la protection des données (DPIA) a été conduite à titre préventif pour Bertel ; un plan d'action est en cours de mise en œuvre.

✓ **Information CSE** : à ce jour, aucun Comité Social et Économique n'est en place au sein de SPL OTI DU SUD. L'organisation s'engage à informer cette instance dès son installation, conformément à l'article L.2312-38 du Code du travail, étant entendu que Bertel n'est pas un outil de surveillance de l'activité des salariés (cf. §2 — pas de profilage, pas de suivi de productivité).

---

*Dernière mise à jour : 6 septembre 2026*
