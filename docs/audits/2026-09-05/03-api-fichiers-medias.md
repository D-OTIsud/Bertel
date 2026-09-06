# Audit — API, fichiers et médias

Date : 5 septembre 2026. Référence initiale : `5873ec69879e61ff34030d196c65f2eb0ac14de0`, arbre de travail examiné. Analyse statique sans upload, envoi de message ou appel IA réel. P0 critique ; P1 important ; P2 correction planifiée ; P3 amélioration. Les lignes sont relatives à la racine du dépôt ; l'exposition effective dépend aussi du proxy et de Supabase déployés.

## Couverture et appréciation

Surfaces examinées : API partenaires catalogue/liste/détail/suppressions et fonctions communes ; uploads image, vidéo, justificatif, portrait, avatar, logo ; documents acteurs privés, URL signées et promotion vers le public ; envoi de listes ; extraction IA et test fournisseur ; route d'effacement RGPD. Administration des comptes : voir `02-securite-authentification.md`.

Les autorisations explicites par objet/acteur, les URL privées à durée courte et le réencodage des images constituent une bonne base. Les principaux risques portent sur les ressources consommées avant validation, l'absence de quotas globaux pour certains services, le cycle de vie des fichiers et la validation limitée des vidéos. Aucun défaut P0 démontré.

## Constats

### API-01 — P1 — La taille des requêtes n'est contrôlée qu'après matérialisation en mémoire

**État : Confirmé code ; impact d'épuisement mémoire à vérifier derrière le proxy.** `bertel-tourism-ui/src/app/api/media/upload/route.ts:34`, `:68` ; `bertel-tourism-ui/src/app/api/document/upload/route.ts:43`, `:71` ; `bertel-tourism-ui/src/app/api/menu/extract/route.ts:66` et `:102`.

Les routes appellent `req.formData()` puis `file.arrayBuffer()` avant que le processeur n'applique sa limite de 20 Mo image, 100 Mo vidéo ou 10 Mo PDF. L'extraction JSON parse tout le corps et accepte un tableau d'images sans borne dans le schéma, puis ne sélectionne que les premières images et contrôle leur taille décodée. Un upload non autorisé par objet peut déjà coûter la matérialisation du multipart avant la sonde d'autorisation.

**Scénario/impact :** un compte authentifié envoie des corps très volumineux ou concurrents, entraînant copies Buffer/base64, pression mémoire, pauses et redémarrage du processus. La limite du bucket intervient trop tard. Un plafond du proxy peut atténuer ce risque mais n'a pas été testé ici.

**Correction :** plafond de corps au proxy et dans le lecteur serveur, compteur d'octets réellement lus (pas seulement Content-Length), limites de nombre de champs/images et de taille base64 au schéma, puis contrôle `file.size` avant la copie. Borner la concurrence des conversions.

**Acceptation :** corps au-delà du plafond, multipart fragmenté et JSON avec trop d'images refusés en 413/400 avant décodage/Storage/IA ; scénario concurrent avec mémoire mesurée sous plafond et requêtes ordinaires toujours disponibles. Utiliser des données synthétiques sur environnement jetable.

### API-02 — P2 — Limitation d'abus incomplète pour les e-mails, uploads et extraction IA

**État : Confirmé code ; coût et capacité disponibles à vérifier.** `bertel-tourism-ui/src/app/api/lists/send/route.ts:25`, `:116` ; `bertel-tourism-ui/src/app/api/menu/extract/route.ts:27` ; `bertel-tourism-ui/src/lib/partner-auth.ts:86`.

L'envoi de listes ne présente pas de quota par utilisateur/organisation/destinataire ni de clé d'idempotence avant SMTP. Les uploads n'ont pas de quota de fréquence/volume applicatif. L'IA est bornée à 12 demandes/minute par utilisateur dans une `Map` propre au processus : redémarrage et répartition entre instances réinitialisent/multiplient le quota. Le limiteur partenaire est partagé en DB, mais laisse passer en cas d'erreur DB, choix documenté dans le code.

**Scénario/impact :** session compromise ou boucle client produit des courriels répétés, coûts IA, saturation de conversion ou croissance Storage. Les autorisations métier restent nécessaires et présentes ; elles ne sont pas un budget d'usage.

**Correction :** quotas atomiques partagés par utilisateur et organisation pour les services coûteux, budget quotidien, idempotence SMTP, limite de concurrence et stratégie de panne explicite. Pour partenaires, observer et alerter sur le mode dégradé plutôt que présenter le quota comme garanti.

**Acceptation :** quota identique avec deux instances, redémarrage sans remise à zéro, même idempotency-key n'envoyant qu'une fois, réponses 429 et Retry-After cohérentes, tests SMTP/IA entièrement simulés.

### API-03 — P2 — Les vidéos sont acceptées sur le seul MIME déclaré

**État : Confirmé code.** `bertel-tourism-ui/src/app/api/media/upload/process-video.ts:15`, `:36` ; `bertel-tourism-ui/src/app/api/media/upload/handle-upload.ts:65`.

Le validateur ne reçoit que `mimeType` et `byteLength`, jamais les octets. Des données arbitraires, y compris un fichier vide, étiquetées `video/mp4` peuvent être stockées telles quelles dans le bucket public. Il n'y a pas de sondage de conteneur, de contrôle de durée/codec ni de suppression des métadonnées vidéo. Le préfixe UUID évite la collision mais ne valide pas le contenu.

**Impact :** stockage de faux médias ou de contenus illisibles, dissémination de métadonnées GPS/appareil et utilisation du serveur comme dépôt de données non conformes au contrat. Aucune exécution de code par cette seule observation n'est démontrée.

**Correction :** inspecter les signatures et structure du conteneur avec un outil isolé, refuser vide/corrompu, fixer des plafonds de durée/dimensions ; réencoder ou réemballer avec suppression explicite des métadonnées. En attendant, limiter les formats aux garanties réellement disponibles.

**Acceptation :** texte déclaré MP4, zéro octet et conteneur tronqué refusés ; vidéos valides acceptées ; fixture MOV/MP4 avec GPS exportée sans tags GPS après traitement. Les PDF disposent déjà d'un contrôle `%PDF-`, qui reste un contrôle de signature et non une validation complète ou un assainissement du document.

### API-04 — P2 — Nettoyage Storage non fiable lors des échecs et remplacements

**État : Confirmé code.** `bertel-tourism-ui/src/app/api/document/upload/route.ts:92`, `:113` ; `bertel-tourism-ui/src/app/api/actor-photo/upload/route.ts:84`, `:97` ; `bertel-tourism-ui/src/app/api/actor-document/route.ts:167`, `:286`.

L'upload justificatif laisse le fichier public si l'insertion `ref_document` échoue. L'upload portrait crée un UUID à chaque appel, ne supprime pas l'ancien portrait après succès et ne compense pas un échec de mise à jour acteur. Les documents privés prévoient plusieurs compensations utiles, mais DELETE ignore l'échec `storage.remove`, et la promotion ignore les erreurs de suppression finales avant de répondre avec succès.

**Impact :** fichiers orphelins, stockage croissant, conservation de portraits/documents supprimés dans l'interface ; l'URL publique reste indépendante de la ligne métier. L'existence d'un collecteur en production et son périmètre n'ont pas été établis par cet audit.

**Correction :** registre durable de fichiers et états de nettoyage, compensation testée à chaque étape, suppression de l'ancien portrait après validation de la nouvelle référence, reprise idempotente des échecs Storage. Conserver un statut incomplet tant que le nettoyage obligatoire n'est pas confirmé.

**Acceptation :** injecter un échec à chaque écriture/suppression ; après reprise, aucun objet sans référence ni référence sans objet ; supprimer/remplacer un portrait rend les anciennes URL indisponibles selon la politique de cache décidée. Voir `07-confidentialite-rgpd.md` pour l'effacement des personnes.

### API-05 — P2 — L'envoi d'une liste active un partage sans expiration avant l'envoi SMTP

**État : Confirmé code.** `bertel-tourism-ui/src/app/api/lists/send/route.ts:64` et `:116`.

La route appelle `share_list(... p_enable: true, p_expires_at: null)` avant SMTP. Elle impose ainsi l'absence d'expiration et peut laisser le partage activé si l'e-mail échoue. Le lien donne accès au contenu éditorial et aux données de conseiller prévues pour ce partage ; sa confidentialité repose sur le jeton, pas sur la session destinataire.

**Impact :** lien partagé plus longtemps que prévu, y compris si la liste avait auparavant une échéance ; résultat d'erreur SMTP qui masque une mutation de visibilité déjà effectuée.

**Correction :** préserver l'expiration existante, choisir une échéance de partage explicite dans le produit, et rendre compte séparément du partage et de l'envoi. Prévoir une compensation si un nouveau partage devait être temporaire.

**Acceptation :** envoyer une liste déjà limitée dans le temps conserve sa date ; échec SMTP rend l'état du partage explicite ; expiration/révocation retire effectivement la consultation publique.

### API-06 — P2 — Les scopes partenaires sont transportés mais ne filtrent pas les endpoints

**État : Confirmé code ; risque de contrat si les scopes sont vendus comme des permissions.** `bertel-tourism-ui/src/lib/partner-auth.ts:57` ; `bertel-tourism-ui/src/app/api/public/objects/route.ts:24` ; `bertel-tourism-ui/src/app/api/public/catalog/route.ts:17` ; `Base de donnée DLL et API/migration_partner_api_keys.sql:28`.

Le résultat d'authentification contient `scopes`, mais les routes partenaires examinées ne les vérifient pas. Toute clé active donne donc le même accès aux données publiques prévues par les endpoints. Le SQL qualifie ce champ de réservé : cette observation n'est pas une fuite démontrée de données privées.

**Correction :** documenter clairement le droit unique actuel et ne pas présenter les scopes comme actifs, ou implémenter une table endpoint → scope avant de proposer des clés différenciées.

**Acceptation :** si les scopes deviennent effectifs, clé catalogue seule refusée sur objets/détail/suppressions, clé révoquée refusée partout, et politique pour les clés historiques explicitement testée.

## Contrôles positifs

- Toutes les écritures privilégiées examinées requièrent un Bearer JWT valide ; les uploads d'objet sondent `user_can_write_object_canonical` avec le JWT appelant, les documents acteurs `user_can_write_crm_actor` ; erreur/false refuse l'écriture.
- Documents acteurs privés dans `actor-documents`, lien acteur-document vérifié avant signature de 60 secondes (`bertel-tourism-ui/src/app/api/actor-document/url/route.ts:28`, `:44`). La promotion exige à la fois droit acteur et droit objet. La configuration réelle du bucket reste à contrôler.
- Images réencodées via Sharp : allowlist JPEG/PNG/WebP, plafond d'entrée et dimensions de sortie, retrait EXIF/IPTC/XMP ; tests de métadonnées déjà présents. Un nom original n'est pas utilisé comme chemin Storage.
- API partenaires : forme de clé contrôlée, hachage SHA-256 avant RPC, révocation/expiration déléguées à l'authentification DB, RPC en allowlist, pages bornées et statut publié imposé à la liste. Les erreurs SQL brutes sont masquées aux partenaires (`bertel-tourism-ui/src/lib/public-api.ts:72`).
- CORS limité à `/api/public/*`, sans credentials, avec lecture GET/OPTIONS ; l'étoile ne démontre pas une faille de session puisque l'authentification partenaire utilise un jeton explicite.
- Extraction IA limitée en images effectivement envoyées, images réencodées sans EXIF, timeout serveur et brouillon relu par l'éditeur. Le secret fournisseur reste côté serveur. La destination configurable et son DPA doivent être validés avant activation ; pas de SSRF anonyme démontrée, la configuration étant privilégiée.

## Limites et validation recommandée

La revue a retracé les principaux chemins API et lu les tests existants ; elle n'a pas chargé le VPS, scanné un bucket ni sollicité les fournisseurs. Vérifier en environnement isolé : refus inter-organisation, 413 avant allocation, quotas multi-instance, contenu média corrompu, rollback/reprise Storage, expiration des partages et révocation de clés. Les pages de documentation ou commentaires mentionnant des contrôles « vérifiés live » ne sont pas une vérification de production du 5 septembre.
