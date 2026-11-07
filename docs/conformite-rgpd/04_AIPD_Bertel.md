# Analyse d'impact relative à la protection des données - Bertel

AIPD de précaution centrée sur la distinction données publiques / données internes

> Statut : AIPD initiale pré-remplie à partir du code et du schéma. Elle doit être revue avec les responsables métier, sécurité et le référent RGPD interne avant validation.
> Version : 13 juin 2026. Revue recommandée à chaque changement majeur de données, accès, média, IA, export ou sous-traitant.

## 1. Décision de réaliser une AIPD

L'AIPD est maintenue comme analyse de précaution et de documentation pour Bertel. Le traitement n'apparaît pas, à ce stade, comme principalement composé de données à haut risque : environ 95 % des informations stockées sont publiques ou destinées à être publiées dans un référentiel touristique. Les points de vigilance réels se concentrent sur les interactions internes entre l'office de tourisme et les prestataires, les notes CRM, les tâches, les historiques de relation, les coordonnées personnelles lorsqu'elles diffèrent des coordonnées publiques ou professionnelles, ainsi que les erreurs de publication accidentelles.

Conclusion provisoire : AIPD utile à maintenir pour démontrer la proportionnalité et piloter les mesures. Aucun risque élevé résiduel n'est identifié à ce stade si les mesures prévues sont appliquées ; la consultation préalable de la CNIL n'est donc pas anticipée, sauf évolution du périmètre ou impossibilité de réduire un risque élevé.

## Posture données Bertel

En l'état du périmètre décrit, environ 95 % des informations stockées dans Bertel sont publiques ou destinées à être publiées : fiches touristiques, descriptions, horaires, coordonnées professionnelles d'établissement, médias de promotion, classifications, tarifs, équipements et statuts de publication. Le risque RGPD principal ne vient donc pas du référentiel public lui-même, mais des zones internes : interactions entre l'office de tourisme et les prestataires, notes CRM, tâches, historiques de relation, coordonnées personnelles lorsqu'elles diffèrent des coordonnées publiques ou professionnelles, et erreurs de publication accidentelles.


## 2. Traitement étudié

| Élément | Description |
|---|---|
| Nom | Bertel - référentiel touristique, publication, relation prestataires et gouvernance qualité. |
| Responsable de traitement | SPL OTI DU SUD - 379 Rue Hubert Delisle, 97430 Le Tampon - SIREN 882 699 556. |
| Référent RGPD | David Philippe - Manager SI - référent RGPD interne - d.philippe@otisud.com - 06 93 41 92 91. [À VALIDER PAR LE DPO : harmoniser la qualification du référent dans tout le pack. Le document public (rgpd.md) indique qu'aucun DPO n'est formellement désigné au sens de l'Art. 37 et que M. Philippe assure la fonction de référent RGPD interne. Par défaut, employer « référent RGPD interne » partout. Signaler aussi le point d'indépendance Art. 38(6) : cumul des fonctions Manager SI / référent RGPD à arbitrer avec la direction.] |
| Finalités | Référentiel touristique, publication, qualité des données, relation prestataires, conformité, sécurité, modération et reporting. |
| Personnes concernées | Utilisateurs internes, prestataires, contacts d'organisations, déclarants d'incident, personnes visibles dans médias. |
| Données principales | Données publiques ou publiables majoritaires : fiches touristiques, coordonnées professionnelles d'établissement, horaires, tarifs, descriptions, médias de promotion, classifications. Données internes minoritaires : profils utilisateurs, rôles, notes, tâches, interactions CRM, consentements, incidents, logs, versions, pièces légales. |
| Destinataires | Public pour données publiées, utilisateurs habilités, administrateurs, partenaires autorisés, sous-traitants techniques. |
| Technologies | Next.js, Supabase Auth, PostgreSQL/RLS, PostGIS, stockage média, API/RPC, imports staging, traitement images/vidéos. |
| Hébergement et localisation des données | Hébergement et localisation des données (toutes dans l'Union européenne) : Application web (frontend Next.js, conteneur Docker) : OVHcloud, France (UE). Données personnelles (base de données PostgreSQL managée, authentification, stockage de fichiers, temps réel) : Supabase Inc. sur Amazon Web Services, région eu-west-1 (Irlande, UE) — projet « ryycrdhlkmzpxwwwwupy ». Aucune donnée n'est hébergée hors de l'Union européenne. |
| Sous-traitants et destinataires réels | OVHcloud (France, UE) — hébergement de l'application web (frontend) ; DPA à archiver. Supabase Inc. — base de données, authentification, stockage de fichiers, temps réel ; données dans l'UE (AWS eu-west-1, Irlande) ; DPA à archiver. Google (Google Ireland Ltd / Google LLC) — authentification via Google OAuth, UNIQUEMENT pour les utilisateurs internes de l'organisation (agents de l'office) ; les prestataires/acteurs et le public ne s'authentifient jamais via Google ; transfert hors UE potentiel encadré par le EU-US Data Privacy Framework [à confirmer et archiver]. API Adresse / Base Adresse Nationale (data.gouv.fr, France) — géocodage des adresses saisies. Services chargés dans le navigateur du visiteur (reçoivent son adresse IP) : tuiles cartographiques OpenFreeMap + MapLibre, favicons DuckDuckGo, Google Fonts ; l'auto-hébergement de ces ressources est recommandé pour limiter ces flux. Aucun envoi d'e-mail/SMS applicatif n'est en place à ce jour. |

## 3. Qualification du caractère public des données

Le point structurant de l'AIPD Bertel est que le traitement porte principalement sur un référentiel touristique public ou publiable. Les données publiques ne disparaissent pas du champ RGPD lorsqu'elles identifient une personne, mais leur niveau de risque est nettement plus faible lorsqu'elles correspondent à des coordonnées professionnelles ou à des informations volontairement diffusées pour la promotion touristique. L'analyse d'impact doit donc éviter de qualifier l'ensemble de Bertel comme un traitement sensible : elle doit concentrer les mesures sur la frontière entre données publiques et données internes.

<!-- PAGE_BREAK -->

| Famille de données | Statut dans Bertel | Impact AIPD |
|---|---|---|
| Fiches touristiques, noms d'établissements, descriptions, horaires, tarifs, équipements, labels, classifications. | Public ou destiné à publication. | Risque RGPD intrinsèque faible ; enjeux principaux : exactitude, mise à jour, cohérence de publication. |
| Coordonnées professionnelles d'établissement : téléphone, email générique, site web, réseaux sociaux officiels. | Public si le canal est officiel et destiné aux visiteurs. | Risque faible si la nature professionnelle est confirmée ; risque moyen si une coordonnée personnelle est publiée par erreur. |
| Médias de promotion touristique, crédits et droits d'usage. | Publiable selon droits, crédit, visibilité et expiration. | Risque principalement lié au droit à l'image, aux personnes incidentelles et aux documents visibles. |
| Interactions entre l'office de tourisme et les prestataires. | Interne, non destiné à publication. | Zone de vigilance principale : contexte relationnel, historique, demandes, relances, appréciations éventuelles. |
| Notes CRM, tâches, commentaires, descriptions privées. | Interne, accès restreint. | Zone de vigilance principale : subjectivité, données excessives, conservation trop longue. |
| Coordonnées personnelles différentes des coordonnées publiques. | Interne sauf base légale ou consentement spécifique. | Risque principal d'exposition accidentelle ou d'usage non prévu. |
| Comptes utilisateurs, rôles, permissions, logs, versions. | Interne technique et organisationnel. | Risque de sécurité, accès excessif, traçabilité et conservation. |

Conséquence pour l'AIPD : le risque général du référentiel public est faible. Les mesures prioritaires portent sur la distinction visible entre champs publics et champs internes, la validation des coordonnées personnelles, la discipline de rédaction des notes CRM, les exports et la conservation.

<!-- PAGE_BREAK -->

## 4. Flux de données

1. Un utilisateur se connecte via Supabase Auth ; les utilisateurs internes de l'organisation (agents de l'office) peuvent en outre s'authentifier via Google OAuth — les prestataires/acteurs et le public ne s'authentifient jamais via Google.
2. La session hydrate le rôle plateforme, l'organisation active, le rang admin et les permissions.
3. Les fiches touristiques sont consultées via Explorer, dashboard ou API.
4. Les éditeurs créent ou modifient des fiches ; certains changements passent par `pending_change`.
5. Les médias sont uploadés, traités, rattachés à un objet ou sous-lieu et publiés selon droits.
6. Les acteurs, contacts, notes et relances alimentent le suivi relationnel (la table `actor_consent` existe mais n'est alimentée par aucun chemin d'écriture : le consentement n'est pas capté à ce jour).
7. Les audits et incidents peuvent créer des tâches ou interactions.
8. Les triggers et logs conservent versions, avant/après et traces d'administration.
9. Les imports staging rapprochent des données historiques avant promotion en production.

## 5. Nécessité et proportionnalité

| Question | Évaluation provisoire |
|---|---|
| Les données sont-elles nécessaires ? | Oui. La majorité des données correspond au référentiel public ou publiable nécessaire à la mission de promotion touristique. Les données internes CRM/contacts privés doivent rester limitées au suivi métier réel. |
| Les finalités sont-elles explicites ? | Oui : publication touristique, qualité du référentiel, relation prestataires, conformité et sécurité. Elles doivent être formalisées dans les mentions d'information. |
| Les bases légales sont-elles documentées ? | Partiellement ; validation par le référent RGPD interne requise par traitement. [À VALIDER PAR LE DPO : confirmer la base légale par traitement — ne pas présumer.] |
| Les personnes sont-elles informées ? | À compléter : mentions utilisateurs, prestataires, acteurs et déclarants d'incident ; préciser clairement que les informations publiques/professionnelles peuvent être diffusées dans le référentiel. |
| Les droits sont-ils exerçables ? | Procédure à mettre en place ; tables cibles identifiées. État réel de l'effacement et du journal d'audit (à connaître pour répondre aux demandes au titre de l'Art. 17) : aucune fonction automatisée d'effacement ou d'anonymisation n'existe à ce jour — un effacement est une opération MANUELLE (suppression ciblée sous contrôle technique). De plus, le journal d'audit (audit.audit_log) conserve une copie complète (état avant/après, données personnelles incluses) de chaque modification et suppression sur l'ensemble des tables, attribuée à l'utilisateur, pendant 12 mois glissants. Une donnée supprimée reste donc présente dans le journal d'audit jusqu'à 12 mois ; sa purge ciblée doit être effectuée manuellement lorsque la demande l'exige. Le versioning object_version n'est, lui, pas purgé automatiquement. |
| La conservation est-elle limitée ? | À compléter : aucune purge ni anonymisation automatique des données personnelles n'est en place à ce jour (les seules tâches planifiées concernent le rafraîchissement de vues et la rotation des partitions d'audit à 12 mois). Les durées de conservation indiquées sont des cibles de politique, à appliquer manuellement tant que des purges automatiques ne sont pas implémentées ; priorité sur CRM, notes privées, imports staging et logs. |
| Les accès sont-ils maîtrisés ? | Oui techniquement par rôles, RBAC et RLS ; revue périodique à instituer. |
| Les données publiques/interne sont-elles séparées ? | Oui par champs `is_public`, `visibility`, statuts et politiques ; vigilance sur notes/médias. |

## 6. Mesures existantes identifiées

- Authentification Supabase Auth ; option Google OAuth réservée aux utilisateurs internes de l'organisation (les prestataires/acteurs et le public ne s'authentifient jamais via Google).
- Communications HTTPS.
- Rôles plateforme : `owner`, `super_admin`, `tourism_agent`.
- Rôles organisation, rangs admin et permissions fines.
- RLS sur les tables publiques exposées et helpers `api.can_read_object`, `api.user_can_write_object_canonical`, `api.current_user_extended_object_ids`.
- Séparation publié/brouillon/archivé/masqué.
- Modération via `pending_change`.
- Versioning `object_version`.
- Audit log partitionné `audit.audit_log` pour UPDATE/DELETE : il copie l'image complète avant/après (état avant/après, données personnelles incluses — emails, noms, texte libre CRM) de chaque modification et suppression sur l'ensemble des tables, attribuée à l'email de l'utilisateur, conservée 12 mois glissants (rotation mensuelle des partitions).
- Triggers de cohérence : objet, média principal, dates légales, statut, ORG.
- Visibilité médias et contacts.
- Métadonnées des médias : les images sont ré-encodées à l'upload, ce qui supprime leurs métadonnées EXIF/IPTC/XMP (GPS, appareil) — mesure en place. Les vidéos sont en revanche stockées telles quelles : leurs métadonnées de conteneur (pouvant contenir GPS/appareil) NE SONT PAS supprimées (limite documentée, pas de transcodeur serveur), à traiter comme un risque résiduel.
- Indicateurs de droits médias (`rights_expires_at`).
- Mesures de sécurité — état réel : authentification Supabase Auth + RBAC + RLS PostgreSQL (robuste) ; journalisation d'audit ; séparation client/service-role. À noter (ne pas surdéclarer) : le chiffrement au repos est une garantie des plateformes (OVHcloud, AWS/Supabase), il n'y a pas de chiffrement applicatif des colonnes ; aucun en-tête de sécurité applicatif (HSTS/CSP/X-Frame-Options) n'est configuré ; la MFA n'est pas déployée ; la protection « mot de passe compromis » est désactivée ; deux vues SECURITY DEFINER sont lisibles par le rôle anonyme et les buckets publics sont listables (points d'amélioration identifiés).
- Hébergement et localisation des données (toutes dans l'Union européenne) : Application web (frontend Next.js, conteneur Docker) : OVHcloud, France (UE). Données personnelles (base de données PostgreSQL managée, authentification, stockage de fichiers, temps réel) : Supabase Inc. sur Amazon Web Services, région eu-west-1 (Irlande, UE) — projet « ryycrdhlkmzpxwwwwupy ». Aucune donnée n'est hébergée hors de l'Union européenne.

Sous-traitants et destinataires réels :

- OVHcloud (France, UE) — hébergement de l'application web (frontend). Contrat de sous-traitance (DPA) OVHcloud à archiver.
- Supabase Inc. — base de données, authentification, stockage de fichiers, temps réel ; données dans l'UE (AWS eu-west-1, Irlande). DPA à archiver.
- Google (Google Ireland Ltd / Google LLC) — authentification via Google OAuth, UNIQUEMENT pour les utilisateurs internes de l'organisation (agents de l'office) ; les prestataires/acteurs et le public ne s'authentifient jamais via Google. Transfert hors UE potentiel encadré par le EU-US Data Privacy Framework [à confirmer et archiver].
- API Adresse / Base Adresse Nationale (data.gouv.fr, France) — géocodage des adresses saisies.
- Services chargés dans le navigateur du visiteur (reçoivent son adresse IP) : tuiles cartographiques OpenFreeMap + MapLibre, favicons DuckDuckGo, Google Fonts. L'auto-hébergement de ces ressources est recommandé pour limiter ces flux.

Aucun envoi d'e-mail/SMS applicatif n'est en place à ce jour.

Point de vigilance — mesure NON en place : le consentement des acteurs n'est PAS capté à ce jour. La fiche acteur peut porter une photo de portrait (image d'une personne physique) stockée dans un bucket public (seule protection : un chemin de fichier non devinable, ce qui n'est pas un contrôle d'accès). La table actor_consent existe mais n'est alimentée par aucun chemin d'écriture : le consentement n'est pas capté à ce jour. Le consentement ne peut donc PAS être présenté comme une mesure en place — c'est une mesure à mettre en œuvre.

## 7. Risques et mesures complémentaires

| Risque | Niveau initial | Mesures existantes | Mesures à ajouter | Résiduel cible |
|---|---|---|---|---|
| Stockage et publication du référentiel touristique public. | Faible | Statuts de publication, champs de visibilité, modération, RLS, versioning. | Contrôle qualité périodique et mentions d'information indiquant la diffusion des données publiques/professionnelles. | Faible |
| Publication d'une coordonnée personnelle non destinée au public. | Moyen | `is_public`, séparation `contact_channel` / `actor_channel`, RLS. | Revue périodique contacts, avertissement UI, procédure correction urgente, règle de distinction coordonnées publiques/personnelles. | Faible à moyen |
| Accès non autorisé aux interactions OTI/prestataires, brouillons ou notes privées. | Moyen | RLS, organisation active, `can_read_extended`, RBAC. | Tests RLS périodiques, revue admin, journal des exceptions. | Faible |
| Notes CRM contenant données sensibles, subjectives ou non nécessaires. | Moyen | Accès interne, page CRM, permissions. | Charte de rédaction, purge/archivage, formation utilisateurs. | Faible à moyen |
| Confusion entre donnée publique et donnée interne lors d'un export ou partage. | Moyen | Statuts, champs de visibilité, séparation public/interne. | Checklist export, revue avant diffusion, limitation des exports massifs. | Faible |
| Secret technique exposé dans le frontend ou dépôt. | Moyen | Séparation client/service role. | Scan secrets, rotation, revue CI/CD, interdiction `service_role` navigateur. | Faible |
| Posture de sécurité applicative incomplète (advisors plateforme). | Moyen | RBAC + RLS PostgreSQL robuste ; journalisation d'audit ; séparation client/service-role. | Configurer les en-têtes de sécurité applicatifs (HSTS/CSP/X-Frame-Options) ; déployer la MFA ; réactiver la protection « mot de passe compromis » ; corriger les deux vues SECURITY DEFINER lisibles par le rôle anonyme ; restreindre la listabilité des buckets publics. | Faible à moyen |
| Données personnelles supprimées subsistant dans le journal d'audit jusqu'à 12 mois. | Moyen | Rotation mensuelle des partitions `audit.audit_log` (purge à 12 mois glissants). | Procédure de purge ciblée manuelle du journal d'audit lors d'une demande d'effacement (Art. 17) ; documenter la conservation 12 mois et son fondement dans les mentions d'information. | Faible à moyen |
| Média publiant une personne ou document identifiable sans droit. | Moyen | `is_published`, `visibility`, droits, crédits ; ré-encodage des images supprimant les métadonnées EXIF/IPTC/XMP à l'upload. | Checklist média, floutage, validation avant publication, expiration automatisée. | Faible à moyen |
| Métadonnées de localisation/appareil (GPS) persistantes dans les vidéos uploadées. | Moyen | Aucune (les vidéos sont stockées telles quelles ; pas de transcodeur serveur). | Strip des métadonnées de conteneur des vidéos (transcodage serveur) ou avertissement à l'upload ; à traiter comme risque résiduel documenté tant que non implémenté. | Moyen |
| Portrait facial d'acteur en bucket public sans consentement capté. | Moyen | Chemin de fichier non devinable (faible — n'est pas un contrôle d'accès) ; table `actor_consent` présente. | Capter réellement le consentement (alimenter `actor_consent` via un chemin d'écriture), restreindre l'accès au bucket, procédure de retrait. | Faible à moyen |
| Réidentification d'entrepreneurs individuels via données légales et coordonnées CRM exposées. | Moyen | RLS, accès interne, familles de politiques admin par commande. | Considérer `object_legal` (SIRET/SIREN/raison sociale = PII d'entrepreneurs individuels) comme donnée personnelle ; limiter l'exposition de l'email d'interlocuteur (`interlocuteur_email`) par les RPC CRM ; minimisation et revue d'accès. | Faible à moyen |
| Incident géolocalisé ou photo identifiant un déclarant ou tiers (déclarants citoyens : nom, email, géoloc, photos), avec propagation automatique en CRM. | Faible à moyen | Champs déclarant facultatifs, accès interne. | Formulaire minimisé, revue média incident, suppression des identifiants inutiles, encadrement de la propagation automatique `incident_report` → CRM. | Faible |
| Avis de tiers exposant des données personnelles (`object_review` : nom, avatar, contenu). | Faible à moyen | Accès et publication contrôlés. | Modération, minimisation, procédure de retrait. | Faible |
| Conservation excessive des comptes, notes, logs ou imports staging. | Moyen | Partitions logs (rotation 12 mois), statuts, archivage notes. | Aucune purge ni anonymisation automatique des données personnelles n'est en place à ce jour (les seules tâches planifiées concernent le rafraîchissement de vues et la rotation des partitions d'audit à 12 mois) ; les durées de conservation indiquées sont des cibles de politique, à appliquer manuellement tant que des purges automatiques ne sont pas implémentées. Politique de conservation, jobs de purge/anonymisation, revue par le référent RGPD. | Faible à moyen |
| Données historiques importées obsolètes ou mal qualifiées public/interne. | Faible à moyen | Staging, mapping, ledger de promotion. | Notice import, contrôle exactitude, qualification public/interne, purge des lots rejetés. | Faible |
| Analyse IA des médias produisant des inférences non prévues. | Faible à moyen | `analyse_data` isolé, usage décrit comme classification. | Encadrer finalité IA, limiter conservation, informer si usage significatif. | Faible |
| Indisponibilité ou perte de données. | Moyen | Supabase/PostgreSQL, sauvegardes à confirmer. | Plan sauvegarde-restauration, tests de restauration, RTO/RPO. | Faible |

## 8. Évaluation des droits et libertés

Les impacts possibles portent sur :

- exposition non souhaitée de coordonnées personnelles non destinées au public ;
- perte de maîtrise sur les contacts et consentements ;
- appréciations inexactes ou subjectives dans les notes CRM ;
- refus ou retard de correction/suppression ;
- réutilisation de médias sans droit ;
- accès non autorisé par un membre hors périmètre ;
- conservation trop longue de traces et données historiques.

Les catégories de données ne visent pas des données sensibles au sens de l'article 9 du RGPD, et le référentiel est très majoritairement public ou publiable. Cela réduit fortement le risque général du traitement : l'AIPD ne considère pas la simple conservation de fiches touristiques publiques comme un risque élevé. Des champs libres, interactions internes, coordonnées personnelles non publiques et médias peuvent toutefois contenir accidentellement des données personnelles non nécessaires. Cette possibilité doit être traitée comme un risque opérationnel ciblé. Le niveau résiduel visé est faible à moyen ; aucun risque élevé résiduel n'est identifié à ce stade sous réserve de validation par le référent RGPD et de mise en oeuvre des mesures.

Catégories de données personnelles à ne pas omettre dans l'analyse : avis de tiers (`object_review` : nom, avatar, contenu) ; déclarations d'incident (`incident_report` : déclarants citoyens — nom, email, géoloc, photos, avec propagation automatique en CRM) ; données légales (`object_legal` : SIRET/SIREN/raison sociale = données personnelles d'entrepreneurs individuels) ; CRM (champ `extra` JSONB : `interlocuteur_email`, `humeur_raw`, sentiment) ; identité utilisateur exposée par Supabase Realtime/presence.

Méthode PIA (à compléter — action §9) : la formalisation des trois événements redoutés (accès illégitime, modification non désirée, disparition de données) et la cotation gravité × vraisemblance selon la méthode CNIL ne sont pas encore établies. Elles doivent être renseignées avant validation et ne sont pas préjugées dans la présente version.

## 9. Plan d'action AIPD

| Priorité | Action | Responsable proposé |
|---|---|---|
| Haute | Confirmer responsable de traitement, référent RGPD, bases légales et mentions d'information. | Référent RGPD / direction |
| Haute | Compléter la méthode PIA : formaliser les trois événements redoutés (accès illégitime, modification non désirée, disparition de données) et la cotation gravité × vraisemblance selon la méthode CNIL. | Référent RGPD / technique |
| Haute | Formaliser les durées de conservation et procédures de purge/anonymisation MANUELLES (aucune purge automatique en place), surtout CRM, notes, coordonnées personnelles non publiques, imports et logs ; prévoir la purge ciblée du journal d'audit (12 mois glissants) lors d'une demande d'effacement. | Référent RGPD / technique |
| Haute | Créer procédure violation et registre des violations. | Référent RGPD / sécurité |
| Haute | Corriger la posture de sécurité applicative : en-têtes HSTS/CSP/X-Frame-Options, MFA, protection « mot de passe compromis », deux vues SECURITY DEFINER lisibles par le rôle anonyme, listabilité des buckets publics. | Technique |
| Haute | Mettre en œuvre la captation effective du consentement des acteurs (alimenter `actor_consent`) et restreindre l'accès au bucket des portraits ; le consentement n'est PAS capté à ce jour. | Technique / référent RGPD |
| Moyenne | Auditer les RLS et les RPC `SECURITY DEFINER` sensibles ; limiter l'exposition de l'email d'interlocuteur (`interlocuteur_email`) par les RPC CRM. | Technique |
| Moyenne | Ajouter une checklist public/interne pour publication média/contact dans l'UI ou la procédure. | Produit |
| Moyenne | Traiter le strip des métadonnées de conteneur des vidéos uploadées (GPS/appareil non supprimés à ce jour). | Technique |
| Moyenne | Former les utilisateurs aux notes CRM factuelles et minimisées. | Référent RGPD / métier |
| Moyenne | Documenter et archiver les sous-traitants (DPA OVHcloud, Supabase ; encadrement Google OAuth interne via le EU-US Data Privacy Framework), transferts, sauvegardes et restauration ; envisager l'auto-hébergement des ressources tierces chargées dans le navigateur du visiteur (tuiles OpenFreeMap/MapLibre, favicons DuckDuckGo, Google Fonts). | Technique / référent RGPD |
| Moyenne | Définir revue trimestrielle des droits admin et permissions. | Admin plateforme |

## 10. Critères de révision

Réviser l'AIPD lorsque :

- nouvelle famille de données personnelles ;
- nouveau champ libre, média ou analyse IA ;
- nouvelle diffusion publique ou export partenaire ;
- nouveau sous-traitant ou transfert hors UE ;
- changement significatif de RLS/RBAC/RPC ;
- incident ou violation révélant un risque non couvert ;
- extension à de nouveaux publics ou organisations.

## 11. Avis et validation

| Étape | Statut | Commentaire |
|---|---|---|
| Avis métier | À compléter | Validation des finalités et usages. |
| Avis technique/sécurité | À compléter | Validation mesures d'accès, logs, sauvegardes. |
| Avis du référent RGPD | À compléter | Confirmer AIPD de précaution, risques résiduels faibles à moyens, plan d'action. [À VALIDER PAR LE DPO : qualification du référent — voir §2.] |
| Consultation CNIL préalable | Non envisagée à ce stade | Requise seulement si risque élevé résiduel impossible à réduire. |
| Date de prochaine revue | À compléter | Recommandé : au moins annuelle ou changement majeur. |

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

> Note de revérification : ces sources fournissent des éléments réutilisables (identité SPL OTI DU SUD, référent RGPD interne). L'hébergement du frontend chez OVHcloud France reste valable pour Bertel, MAIS les données personnelles de Bertel sont hébergées chez Supabase/AWS en région eu-west-1 (Irlande, UE) — ce que le dossier badgeuse ne couvre pas. Les mesures de sécurité techniques du dossier badgeuse ne doivent pas être reprises aveuglément : elles ont été revérifiées dans le corps de la présente AIPD (voir §6 et §7 — état réel : chiffrement applicatif absent, en-têtes de sécurité applicatifs absents, MFA non déployée, etc.).

- `C:\Users\dphil\Downloads\Manuel_Utilisateur_Badgeuse_OTI (7).pdf` : modèle de manuel utilisateur interne OTI.
- `C:\Users\dphil\Downloads\Reglement_RGPD_Badgeuse_OTISUD (3).pdf` : identité SPL OTI DU SUD, référent RGPD interne, hébergement OVH France (valable pour le frontend Bertel), absence de transfert hors UE et mesures de sécurité (à revérifier pour Bertel — voir note ci-dessus).
- `C:\Users\dphil\Downloads\DPIA_Badgeuse_OTISUD (3).pdf` : modèle d'analyse proportionnée, risque résiduel faible, Supabase/PostgreSQL, HTTPS, RLS et journal d'audit (mesures à revérifier pour Bertel — voir note ci-dessus).
