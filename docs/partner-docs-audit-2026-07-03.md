# Audit de la documentation partenaires — 2026-07-03

**Question** : la documentation publique pour les partenaires (`docs/guide-partenaires.md` + `docs/openapi.json` + collection Postman, rendues par le site docs) est-elle assez complète ?

**Verdict** : le guide est **bien construit dans sa forme** (structure démarrage-rapide → référence → recette de synchro, versionnage additif clairement énoncé, honnêteté exemplaire de la section « Périmètre des pivots ») mais **pas assez complet pour une intégration de production sans aller-retour**, et il contient **une affirmation dangereuse contredite par le code**.

**Méthode** : workflow multi-agents (34 agents) — extraction du contrat réel depuis le code des 4 routes `/api/public/*` et leurs RPCs SQL, extraction du contrat OpenAPI, relevé exhaustif des affirmations du guide, revue de complétude éditoriale, vérification du serving public (Dockerfile/nginx/rendu), croisement, puis **réfutation adversariale de chaque constat** (chaque finding re-vérifié fichier:ligne par un agent sceptique indépendant). Bilan : 26 confirmés, 2 réfutés, 5 non vérifiés (tous info).

## Synthèse par priorité

| Priorité | Constat | Nature |
|---|---|---|
| **P0** | `types` invalide ⇒ `502 upstream_error` (le guide dit « réessayer avec backoff ») ⇒ boucle de retry infinie chez l'intégrateur ; les 3 surfaces (guide, OpenAPI, commentaire du code) affirment le contraire du comportement réel | Bug code + doc fausse |
| **P1** | Le payload `data` n'est décrit champ par champ **nulle part** : ni la fiche détail (~60 clés dont horaires/tarifs/médias/contacts), ni la forme des cartes de liste (que l'OpenAPI type FAUX, avec le schéma détail) | Trou contractuel majeur |
| **P1** | Aucune licence / condition de réutilisation des données ni des médias (droits photos, hotlinking, stabilité URLs) ; rien sur le RGPD des contacts livrés | Risque juridique |
| **P1** | Promesses excessives : `lang=all` ne couvre que les 7 champs description (pas `name`, pas les facettes) ; l'OpenAPI prétend une recherche sur 9 périmètres alors que le code ne cherche que le nom | Doc > code |
| **P2** | Imprécisions pagination/erreurs (`next_cursor` non-null sur dernière page pleine, curseur fige les filtres, erreurs hors enveloppe `{meta,data}`, `meta.total` non documenté, `detail` Postgres brut fuité) | Précision |
| **P2** | Complétude éditoriale : pas d'exemple de réponse détail, pas de sandbox/clé démo, onboarding sans délai, `updated_at` inexploité dans la recette, pas de changelog | Friction |
| **P3** | Serving : `partenaires-render.js` en cache 1 an immutable sans cache-busting ; liens `.md` servis en octet-stream (téléchargement) ; collection Postman non vérifiable par fetch (SPA) | Cosmétique |

## Constats confirmés (26, triés par sévérité)

### [CRITICAL] types invalide => 502 upstream_error, contredit par le guide, l'OpenAPI et le commentaire du code (boucle de retry infinie chez l'integrateur)

*Origine : croisement*

Categorie A. Le wrapper SQL caste chaque code en enum : un code inconnu OU en minuscules (types=res,hot) leve 22P02 => la route renvoie 502 {"error":"upstream_error"}. Or l'OpenAPI affirme "Un code invalide ne matche rien", le commentaire de la route dit la meme chose, et le guide enseigne que 500/502 = "Erreur cote Bertel — reessayer plus tard avec backoff". Un integrateur qui suit la doc avec un code errone retentera indefiniment en backoff une erreur qui est la sienne, sans jamais recevoir de 400. Trois surfaces a corriger (ou valider les codes cote route et repondre 400).

**Preuve** : docs/guide-partenaires.md:86 (502 = erreur cote Bertel, backoff) + docs/openapi.json components.parameters.Types.description l.233 ("Un code invalide ne matche rien") CONTRE bertel-tourism-ui/src/app/api/public/objects/route.ts:46 (commentaire identique faux) et Base de donnée DLL et API/api_views_functions.sql:5759 (ARRAY(SELECT t::object_type FROM unnest(p_types)) => 22P02 => public-api.ts:65 status 502)

---

### [MAJOR] Dictionnaire des champs du payload `data` absent — l'OpenAPI ne compense que partiellement, et aucun exemple de réponse détail complet n'existe

*Origine : complétude*

Le guide résume la fiche en une phrase (« identité, descriptions, localisation, contacts publics, médias publiés, horaires d'ouverture, tarifs, capacités, classements et labels, etc. ») sans jamais décrire ces blocs. Vérification faite : le schéma `ObjectResource` de docs/openapi.json ne documente QUE le cœur (id, type, timestamps, address/location, famille description + *_md, descriptions[], external_ids, i18n, pivots) et relègue tout le reste derrière `additionalProperties: true` — précisément les blocs que la section 5 renvoie vers la ressource de base (« si un champ vous manque dans un pivot, il est en général déjà présent dans la ressource de base `data` ») : horaires, tarifs, capacités, équipements, classements, médias, contacts n'ont de forme documentée NULLE PART. La collection Postman ne compense pas non plus : 0 réponse enregistrée sur « Récupérer une fiche publiée » (1 seule saved response dans tout le dossier 13, sur le jsonld). Un intégrateur DATAtourisme/Apidae qui doit mapper horaires+tarifs découvre la structure par rétro-ingénierie d'appels live. Correctif pragmatique : soit étendre l'OpenAPI aux blocs riches, soit (moins cher) publier UNE réponse détail réelle complète (fiche RES riche) en annexe du guide ou en saved response Postman, avec un court lexique des blocs.

**Preuve** : guide-partenaires.md:142 (« La fiche `data` contient l'ensemble des données publiques : … etc. ») + :245 ; openapi.json components.schemas.ObjectResource.properties = id…tourinsoft uniquement, description « la ressource est riche et additive (additionalProperties: true) » ; Postman dossier 13 : 0 saved response sur le détail

---

### [MAJOR] Aucune licence ni condition de réutilisation des DONNÉES, et rien sur les MÉDIAS (droits photos, crédits, hotlinking, stabilité des URLs)

*Origine : complétude*

grep licence/réutilisation/droit/copyright/crédit sur le guide : zéro occurrence. L'openapi.json porte `license: Propriétaire — OTI du Sud` (licence du contrat, pas des données) — le guide, lui, ne dit rien. Pour l'audience visée c'est un vrai risque : (a) DATAtourisme exige une licence de diffusion explicite des données versées ; (b) les photos touristiques portent des droits d'auteur/crédits photographes — le guide livre des `image`/médias publiés sans dire si le partenaire peut les republier, sous quelle mention, ni s'il doit les copier ou peut hotlinker les URLs du bucket ; (c) la stabilité des URLs médias n'est pas contractualisée (un ré-upload change l'UUID du fichier — l'intégrateur doit savoir s'il cache/copie ou pointe). Un paragraphe « Conditions de réutilisation » (licence des données, régime des médias, hotlinking oui/non, URLs stables ou à resynchroniser via l'upsert) est nécessaire avant toute intégration de production.

**Preuve** : Absence constatée (grep -i 'licence|réutilisation|droit|copyright|crédit' sur docs/guide-partenaires.md : 0 résultat) ; openapi.json info.license = « Propriétaire — OTI du Sud » sans portée données/médias

---

### [MAJOR] RGPD : les fiches livrent des contacts (téléphone/email) sans un mot sur l'usage licite

*Origine : complétude*

Le payload contient des « contacts publics » (tél/email d'établissements — souvent des données personnelles quand l'exploitant est une personne physique : gîtes, guides, producteurs). Le guide ne dit rien sur : la base de réutilisation licite, le fait que le partenaire devient responsable de son propre traitement, l'interdiction d'usage à des fins de prospection/démarchage, la propagation des suppressions (le flux tombstones existe techniquement §3.3 mais son lien avec une obligation d'effacement n'est pas énoncé). Le projet a un dossier docs/conformite-rgpd interne mais rien n'affleure dans la doc publique. 3-4 phrases suffisent : finalité autorisée (information touristique), interdiction de prospection sur les coordonnées, obligation de répercuter suppressions/dépublications (renvoi §3.3/§4), contact du responsable de traitement.

**Preuve** : guide-partenaires.md:142 (« contacts publics ») + grep -i 'RGPD|données personnelles' : 0 résultat ; dossier docs/conformite-rgpd présent côté interne uniquement

---

### [MAJOR] Multilingue : les langues disponibles ne sont listées nulle part, et la couverture réelle (quasi FR-only) n'est pas annoncée

*Origine : complétude*

`lang` est documenté comme paramètre (« Langue de résolution des textes », défaut fr) et `?lang=all` promet « toutes les traductions disponibles », mais aucune liste des langues effectivement servies n'existe (ni dans le guide, ni dans l'OpenAPI — I18nBlock décrit la forme, pas les langues). Or l'état réel du corpus est FR avec fallback FR (la traduction du contenu établissements en/es/zh/el est un chantier post-MVP) : un partenaire qui planifie un site EN sur la foi de « toutes les traductions disponibles » sera déçu tardivement. Il faut : (a) lister les codes langue acceptés, (b) énoncer honnêtement la couverture (« le corpus est aujourd'hui majoritairement francophone ; les champs non traduits retombent sur le français / sont absents du bloc i18n »). L'OpenAPI dit d'ailleurs déjà à moitié la vérité (« un champ FR-only sans traductions est absent ») — le guide, non.

**Preuve** : guide-partenaires.md:100 et :134 (`lang`, `lang=all` sans liste de langues) ; openapi.json I18nBlock (« Ne contient que les champs réellement traduits ») ; décision projet : traduction contenu = post-MVP, FR-fallback

---

### [MAJOR] OpenAPI : la recherche pretend couvrir ville/amenites/tags/menus/cuisines/labels/taxonomie/description — le code ne cherche que le NOM

*Origine : croisement*

Categorie C. Le predicat de la liste partenaire est uniquement o.name_search_vector, colonne generee to_tsvector('french', unaccent(lower(name))) — le nom seul. La description OpenAPI du parametre search enumere 9 perimetres qui n'existent pas sur cette route (la recherche large §109 vit sur object.search_document, non branchee ici). Le guide (l.99) reste vague ("Recherche plein-texte") — imprecis mais pas faux. Un partenaire construisant une recherche sur cette promesse obtiendra des resultats silencieusement plus etroits.

**Preuve** : docs/openapi.json components.parameters.Search.description l.238 CONTRE Base de donnée DLL et API/api_views_functions.sql:5636+5644 (name_search_vector @@ plainto_tsquery) et schema_unified.sql:886 (colonne generee sur name uniquement) ; docs/guide-partenaires.md:99

---

### [MAJOR] OpenAPI type les items de la liste comme ObjectResource (schema detail) alors que le code emet des CARTES d'une autre forme

*Origine : croisement*

Categorie C (avec composante D). La vue par defaut de la liste est 'card' => api.get_object_cards_batch : description TRONQUEE a 200 caracteres, cles image/rating/review_count/min_price/open_now (tri-state nullable)/amenity_codes/badges, location aplatie {lat,lon,city,postcode,lieu_dit,address} ; PAS de created_at, address (objet), descriptions[], external_ids[], ni aucune cle *_md — toutes typees ou requises dans ObjectResource. Un client genere depuis l'OpenAPI validera/desserialisera faux sur chaque page (ex. description supposee complete alors qu'elle est tronquee). Corollaire : ObjectResource promet aussi en liste un bloc i18n conditionne a ?lang=all qui n'existe pas sur /objects (parametre Lang sans 'all' ; lang=all y est traite comme une langue litterale => fallback FR silencieux).

**Preuve** : docs/openapi.json paths./objects 200 data.items $ref ObjectResource l.58 + ObjectResource.i18n l.448-451 + parameters.Lang l.241-245 CONTRE Base de donnée DLL et API/api_views_functions.sql:5723-5724 (v_view='card' => api.get_object_cards_batch) et bertel-tourism-ui/src/app/api/public/objects/route.ts:38+44 (lang passe tel quel, pas de mode all)

---

### [MAJOR] lang=all : le guide promet "toutes les traductions disponibles" — le code ne couvre que les 7 champs de la famille object_description

*Origine : croisement*

Categorie A. Le bloc i18n (get_object_i18n_all) ne porte que description, description_chapo, description_mobile, description_edition, description_adapted, description_offre_hors_zone, sanitary_measures. Ni name, ni les proses de facettes (menus, chambres, etapes ITI, direction), ni aucun autre champ traduisible. L'OpenAPI, lui, est exact (I18nBlock ferme, additionalProperties:false, 7 proprietes). Un partenaire multilingue croira recuperer tout le contenu traduit en un appel.

**Preuve** : docs/guide-partenaires.md:134 ("toutes les traductions disponibles") CONTRE bertel-tourism-ui/src/app/api/public/objects/[id]/route.ts:89 (get_object_i18n_all, famille object_description seule) ; docs/openapi.json components.schemas.I18nBlock l.402-415 (7 champs fermes — correct)

---

### [MAJOR] Forme d'une carte de liste decrite champ par champ NULLE PART (guide : "au minimum id, type, name")

*Origine : croisement*

Categorie D. Le code emet une forme precise et stable par item de liste : id, type, name, status, commercial_visibility, image, rating, review_count, min_price, open_now (tri-state : null = inconnu, a ne jamais booleaniser), location{lat,lon,city,postcode,lieu_dit,address}, description (200 chars, Markdown strippe), taxonomy[{domain,code,name,path[]}], tags[{slug,name,color,icon,icon_url}], amenity_codes[], environment_tags[{code,name}], badges[{kind,code,label}], updated_at. Aucune des deux surfaces documentaires ne la decrit (l'OpenAPI decrit le schema DETAIL a la place — cf. finding dedie). La promesse additive-only du contrat (guide l.76) est invérifiable sur des cles jamais definies.

**Preuve** : docs/guide-partenaires.md:47 ("au minimum id, type, name") + docs/openapi.json (aucun schema carte) CONTRE api.get_object_cards_batch invoque par Base de donnée DLL et API/api_views_functions.sql:5724

---

### [MAJOR] Fiche detail : ~60 cles de premier niveau (contacts, media, opening_times, prices, classifications, room_types, itinerary_details, render, ...) decrites nulle part champ par champ

*Origine : croisement*

Categorie D. get_object_resource emet des dizaines de blocs a forme precise (y compris les conditionnels par type : activity, itinerary/itinerary_details, menus/cuisine_types/dietary_tags/allergens, fma_occurrences...) ; le guide les resume en une ligne de prose (l.142) et l'OpenAPI les delegue a additionalProperties:true avec une liste en prose (assume dans la description d'ObjectResource). Aucun schema pour opening_times (structure periods/time_frames complexe), prices, media (visibility NULL~public), contacts (is_public), render.*_lines... Un integrateur doit retro-ingenier le JSON. C'est le plus gros trou contractuel de la surface.

**Preuve** : docs/guide-partenaires.md:142 (liste prose d'une ligne) + docs/openapi.json components.schemas.ObjectResource.description l.418 (additivite assumee, blocs non decrits) CONTRE bertel-tourism-ui/src/app/api/public/objects/[id]/route.ts:68-73 (get_object_resource p_options={} => toutes les cles emises)

---

### [MINOR] Pas d'environnement de test ni de moyen d'évaluer l'API sans clé

*Origine : complétude*

Le préfixe `bk_live_` suggère une famille de clés mais aucun `bk_test_`/sandbox/clé de démo n'existe, et rien ne permet d'évaluer la richesse des données avant d'écrire au contact (pas de fiche d'exemple publique, cf. finding 1 — les deux gaps se cumulent : impossible de juger le payload avant onboarding). Pragmatiquement acceptable (API lecture seule, corpus < 1000, onboarding par simple e-mail), mais une fiche d'exemple statique publiée à côté du guide, ou une clé de démo rate-limitée, réduirait fortement la friction d'évaluation.

**Preuve** : guide-partenaires.md:25 (format `bk_live_` uniquement) ; aucune mention de sandbox/démo dans tout le document

---

### [MINOR] Onboarding par e-mail décrit sans délai, critères ni cadre

*Origine : complétude*

La procédure (§1) dit quoi envoyer (identité, usage prévu, nom du service) et ce qu'on reçoit (clé + domaine), c'est bien. Manquent : le délai de réponse indicatif, les critères d'attribution (qui est éligible ? tout le monde ?), et si une convention/CGU est à signer (lié au finding licence). Un intégrateur qui planifie un projet a besoin d'estimer ce lead time.

**Preuve** : guide-partenaires.md:21-27 (procédure sans délai ni critères)

---

### [MINOR] Fraîcheur des données : cadence de synchro suggérée mais fraîcheur côté Bertel non documentée

*Origine : complétude*

La recette §4 suggère une cadence (« par exemple quotidien ») — c'est la moitié du sujet. Rien ne dit à quelle fréquence les données Bertel elles-mêmes évoluent (saisie continue par l'OTI, synchronisations sources amont), ni comment exploiter `updated_at`/`updated_at_source` (présents dans l'OpenAPI mais jamais mentionnés dans le guide) pour ne retraiter que les fiches modifiées lors de l'upsert. Une phrase « les fiches sont mises à jour en continu par l'OTI ; une synchro quotidienne est adaptée ; comparez `updated_at` pour éviter les retraitements » suffirait.

**Preuve** : guide-partenaires.md:181 (« par exemple quotidien ») ; `updated_at`/`updated_at_source` documentés dans openapi.json mais absents du guide

---

### [MINOR] Pas de changelog ni de canal d'annonce des évolutions du contrat

*Origine : complétude*

Le versionnage est bien expliqué (additif intra-majeure, v2 sous /api/public/v2/*, version dans meta + en-tête) — c'est le point fort du guide. Mais il n'existe ni historique des versions (le guide affiche « Contrat 1.0.0 · mis à jour le 2026-07-03 » sans liste des changements), ni canal où les partenaires seront informés des ajouts de clés, enrichissements de pivots (§5 les promet évolutifs) ou d'une future dépréciation v1. Acceptable au lancement d'un contrat 1.0.0 ; ajouter une section « Historique » au guide et/ou annoncer que les évolutions seront notifiées par e-mail aux détenteurs de clés.

**Preuve** : guide-partenaires.md:11 (version + date, pas d'historique) ; :76 (politique de versionnage sans canal d'annonce) ; :245 (« le profil peut être enrichi » sans mécanisme de notification)

---

### [MINOR] partenaires-render.js mis en cache 1 an immutable sans cache-busting — risque de désynchronisation rendeur/guide

*Origine : serving*

nginx.conf applique `expires 1y` + `Cache-Control: public, immutable` à tous les .js, et partenaires.html charge le rendeur via `<script src="partenaires-render.js">` sans hash ni query de version. Le guide (.md) est lui rechargé frais (`fetch(..., {cache:'no-cache'})`). Si le rendeur est étendu (scénario explicitement prévu par son en-tête : « si le guide dépasse ce périmètre, étendre ICI ») en même temps qu'une nouvelle syntaxe entre dans le guide, un visiteur récurrent gardera l'ancien rendeur jusqu'à 1 an et verra des artefacts Markdown bruts. Correctif trivial : suffixe de version (`partenaires-render.js?v=N`) ou exclure ce fichier du bloc cache nginx.

**Preuve** : docs/nginx.conf:13-16 (`location ~* \.(css|js|...)$ { expires 1y; add_header Cache-Control "public, immutable"; }`) + docs/partenaires.html:159 (`<script src="partenaires-render.js"></script>`) vs :187 (`fetch('guide-partenaires.md', { cache: 'no-cache' })`)

---

### [MINOR] Guide : "next_cursor vaut null sur la derniere page" — faux quand la derniere page est exactement pleine

*Origine : croisement*

Categorie A. Le SQL n'emet next_cursor QUE si la page est pile pleine (array_length(ids)=v_limit) : si le total est divisible par page_size, la derniere page pleine porte un next_cursor non-null pointant sur une page vide (data=[], next_cursor null). La boucle documentee (l.184-190) se termine quand meme, avec une requete de plus ; mais un client qui interprete next_cursor non-null comme "il reste des elements" (barre de progression, comptage) se trompe. A documenter : "la boucle s'arrete quand next_cursor est null ; la derniere page peut etre vide".

**Preuve** : docs/guide-partenaires.md:103 CONTRE Base de donnée DLL et API/api_views_functions.sql:5651-5671 (IF array_length(ids,1) = v_limit THEN next_cursor := ...)

---

### [MINOR] Le curseur REJOUE ses filtres embarques par-dessus les query params — changer un parametre en cours de pagination est silencieusement ignore

*Origine : croisement*

Categorie B. Le curseur "opaque" embarque offset, page_size, types, status, search, lang, view et les render_* ; quand il est fourni, ces valeurs ECRASENT les query params de l'appel (api.cursor_unpack puis surcharge systematique). Un integrateur qui modifie types ou page_size entre deux pages verra son changement ignore sans erreur ni signal. Comportement coherent (pagination stable) mais documente nulle part — une phrase dans le guide ("les parametres de filtre sont figes par le curseur ; pour changer de filtre, repartir sans cursor") suffirait.

**Preuve** : Base de donnée DLL et API/api_views_functions.sql:5580-5609 (IF cur ? 'types' ... surcharge) + docs/guide-partenaires.md:103 (dit seulement "opaque")

---

### [MINOR] Guide : "Toutes les reponses ont la forme {meta, data}" — faux pour les erreurs (corps plats sans meta)

*Origine : croisement*

Categorie A. Les erreurs sont des corps plats {"error":...,"detail"?,"retry_after"?} sans enveloppe ni meta.contract_version (l'en-tete X-Bertel-Api-Version, lui, est bien present partout, y compris sur les erreurs). Le guide se contredit d'ailleurs lui-meme (exemples d'erreurs plates l.64 et l.70). L'OpenAPI est correct (info.description scope l'enveloppe a "toute reponse 200"). Un parseur generique qui asserte meta.contract_version sur chaque reponse casse sur la premiere erreur.

**Preuve** : docs/guide-partenaires.md:74 CONTRE bertel-tourism-ui/src/app/api/public/objects/route.ts:23+28 (corps 401/429 plats ; publicHeaders() = header seul) et src/lib/public-api.ts:47-49

---

### [MINOR] OpenAPI : le nom de la cle de pagination de /objects (meta.next_cursor) n'apparait nulle part dans le document machine

*Origine : croisement*

Categorie C. Le flux deletions type explicitement meta.cursor et meta.count, mais /objects s'en remet a la prose "contient aussi les champs de pagination emis par la source (ex. curseur suivant)" — la cle next_cursor n'est nommee que dans le guide. Un client genere depuis l'OpenAPI n'a aucun champ type pour reprendre la pagination du flux principal. Asymetrie de rigueur entre les deux flux pagines de la meme spec.

**Preuve** : docs/openapi.json paths./objects 200 meta.description l.56 (prose, next_cursor absent de tout le fichier) CONTRE docs/guide-partenaires.md:103 (meta.next_cursor nomme) et api_views_functions.sql:5705 ('next_cursor' emis)

---

### [MINOR] meta de liste : total et cursor (cles utiles-contractuelles) + internes (schema_version '3.0', kind, offset, render_*) documentes nulle part

*Origine : croisement*

Categorie B. La reponse liste emet meta.total (compte total, precieux pour un integrateur) et meta.cursor (curseur de la page COURANTE) — jamais mentionnes par le guide ni l'OpenAPI. Elle fuit aussi des cles internes preta-confusion : schema_version:'3.0' (a cote de contract_version:'1.0.0' — et la collection Postman s'appelle "Bertel API v3.0", trois numeros de version visibles), kind, offset (revele la pagination offset sous le curseur "opaque"), render_locale/render_tz/render_version, language/language_fallbacks. A trancher : documenter total (utile) et purger ou assumer le reste.

**Preuve** : Base de donnée DLL et API/api_views_functions.sql:5692-5706 (meta emis) CONTRE docs/guide-partenaires.md:45+103 (seuls contract_version et next_cursor cites) et docs/openapi.json Meta l.310-318 (additionalProperties:true, rien de nomme)

---

### [INFO] Aucun SLA / engagement de disponibilité ni fenêtre de maintenance

*Origine : complétude*

Rien sur la disponibilité visée, les fenêtres de maintenance ou un canal d'incident (pas de page de statut). Pour une API lecture seule consommée en batch quotidien avec backoff documenté (§4), ce n'est pas bloquant — le pattern de retry couvre les indisponibilités courtes. Une phrase « meilleure-effort, pas de fenêtre de maintenance planifiée, signalez les indisponibilités au contact » cadrerait les attentes à peu de frais.

**Preuve** : Absence constatée dans tout le guide ; seul :86 traite les 5xx (« réessayer plus tard avec backoff »)

---

### [INFO] Guide FR uniquement — pas de version EN

*Origine : complétude*

Ton cohérent, précis et honnête sur ses limites (la section §5 « Périmètre des pivots » est exemplaire), bonne progression démarrage rapide → référence → recette. Le document est 100 % francophone, ce qui colle à l'audience primaire (DATAtourisme, Apidae, Tourinsoft, agences réunionnaises) ; seul un développeur non francophone (agence internationale, moteur de recherche) serait gêné. Une version EN est un plus, pas un prérequis — à envisager si un partenaire anglophone se présente.

**Preuve** : docs/guide-partenaires.md intégralement en français ; aucune référence à une traduction

---

### [INFO] Les liens directs vers guide-partenaires.md déclenchent un téléchargement (pas de type MIME .md dans nginx)

*Origine : serving*

nginx:alpine ne mappe pas l'extension .md dans mime.types et nginx.conf ne définit ni `types` ni `default_type` : guide-partenaires.md est servi en application/octet-stream. Le rendu principal n'est PAS affecté (fetch().text() ignore le Content-Type, et X-Content-Type-Options: nosniff ne bloque pas une lecture texte), mais les deux liens visibles vers le .md — le footer « Guide rendu depuis guide-partenaires.md » et le fallback d'erreur « Consultez la version Markdown » — provoquent un téléchargement de fichier au lieu d'un affichage dans le navigateur. Accessoirement, gzip_types n'inclut pas ce type (le .md de ~12 Ko part non compressé). Fix : `location ~* \.md$ { default_type text/plain; charset utf-8; }` ou ajout de text/markdown.

**Preuve** : docs/nginx.conf:28 (gzip_types sans markdown ; aucun mapping .md dans le fichier) + docs/partenaires.html:155 et :213 (liens href="guide-partenaires.md")

---

### [INFO] Collection Postman publique : NON VÉRIFIÉE (page SPA illisible par fetch), pas constatée cassée

*Origine : serving*

WebFetch de https://www.postman.com/docking-module-astronaut-45890211/oti-du-sud-bertel-v3/collection/61gyd5k/bertel-api-v3-0 répond et renvoie le shell Postman (titre « Postman »), mais la page est rendue côté client : impossible de confirmer par fetch que la collection est publique et contient le dossier annoncé. À classer non vérifié — une vérification manuelle navigateur reste souhaitable. Cohérence documentaire OK par ailleurs : docs/README_Postman.md décrit bien le dossier « 13. API Publique Partenaire » (`/api/public/*`, auth `bk_live_…`, variables `public_base_url`/`partner_key`), et les artefacts Bertel_API_v3.postman_collection.json / _environment.json sont copiés dans l'image (Dockerfile ligne 19).

**Preuve** : docs/README_Postman.md:88 (`### 13. API Publique Partenaire (\`/api/public/*\`)`) ; WebFetch : contenu limité à « Postman » (rendu JS)

---

### [INFO] since accepte tout format parseable par Date() de Node, pas seulement l'ISO 8601 annonce

*Origine : croisement*

Categorie B. "July 3, 2026" passe la validation (new Date(since) puis toISOString()) alors que guide et OpenAPI annoncent ISO 8601 strict avec 400 sinon. Suivre la doc fonctionne toujours ; l'inverse (s'appuyer sur la laxite) n'est pas un comportement contractuel stable — risque de dependance accidentelle chez un partenaire.

**Preuve** : bertel-tourism-ui/src/app/api/public/objects/deletions/route.ts:44-51 CONTRE docs/guide-partenaires.md:82+150 et docs/openapi.json parameters.Since (format date-time)

---

### [INFO] 502 : detail = message d'erreur Postgres brut renvoye au partenaire

*Origine : croisement*

Categorie B. En cas d'erreur PostgREST, la route renvoie le message Postgres tel quel dans detail (noms de fonctions/types internes, ex. 'invalid input value for enum object_type: ...'). Fuite d'implementation non contractuelle ; l'OpenAPI montre detail:'…' sans en definir la nature. A minima documenter que detail est non-stable et a usage diagnostic, ou le remplacer par un message generique.

**Preuve** : bertel-tourism-ui/src/lib/public-api.ts:65 (detail: error.message) + docs/openapi.json responses.UpstreamError l.303-307

---

## Constats réfutés (vérification adversariale)

### Detail : une panne DB sur la probe de statut repond 404 (pas 500) — un incident infra se lit comme une depublication chez le partenaire

**Réfutation** : Le fait de code est exact mais la chaîne du constat est fausse et la mitigation « manquante » est déjà la seule procédure documentée. Vérifié : (1) bertel-tourism-ui/src/app/api/public/objects/[id]/route.ts:61-66 — `if (statusErr || !statusRow || statusRow.status !== 'published')` ⇒ 404 : oui, une erreur DB sur la probe de statut répond 404. (2) MAIS la prétendue incitation « la recette de réconciliation invite à masquer/retirer [sur un 404 au détail] » est fausse : docs/guide-partenaires.md:196-198 ne déclenche masquer/retirer QUE sur « tout id présent chez vous mais absent du parcours (1) [liste complète paginée] ET du flux (2) [tombstones] » — jamais sur un 404 du détail ; la ligne 164 renvoie explicitement à cette section 4 (« Voir la réconciliation en section 4 »), et ni le guide, ni docs/openapi.json, ni docs/README_Postman.md (aucune occurrence de 404/réconciliation) ne proposent de vérifier des fiches au détail pour détecter les dépublications. Le « minimum » réclamé par le constat (réconcilier les dépublications uniquement via le parcours de liste complet) EST donc exactement — et exclusivement — ce que la doc enseigne. (3) Sur ce parcours documenté, un incident DB échoue BRUYAMMENT, pas en 404 : la route liste et la route tombstones passent par callPublicRpc qui renvoie 502 `upstream_error` sur erreur DB (bertel-tourism-ui/src/lib/public-api.ts:63-66 ; objects/route.ts:53 ; deletions/route.ts:56-58), et le guide prescrit le backoff-retry sur 5xx (guide-partenaires.md:86 et :204) — une page en échec est un 5xx, jamais une page vide : un parcours partiel ne peut pas se conclure silencieusement en « fiches absentes ». Le scénario du constat exige qu'un partenaire invente un flux de réconciliation par détail contraire à la procédure documentée. Reste un noyau mineur non réfuté : la description du 404 (guide:84 « inconnue ou non publiée (indistinguable, par conception) » ; openapi.json:293-294 idem) ne mentionne pas qu'une erreur DB transitoire peut aussi produire 404 sur le détail — un avertissement explicite « ne jamais dépublier sur la foi d'un 404 ponctuel » serait un durcissement cosmétique (minor), mais le constat en sévérité major, fondé sur un croisement guide↔recette qui n'existe pas, ne tient pas.

---

### Flux deletions : perte silencieuse possible d'un tombstone quand limit coupe entre deux suppressions au meme timestamp — documente seulement dans le source SQL

**Réfutation** : Le mécanisme technique est exact mais le grief documentaire ne tient pas : la protection que le constat réclame (« refaire un parcours complet périodique ») est déjà LA recette canonique du guide, et le scénario résiduel (« partenaire qui ne fait QUE le flux delta ») est impossible avec cette API.

Vérifié :
1. SQL — le constat décrit bien le code : `Base de donnée DLL et API/migration_partner_tombstone_feed.sql:51-74` (curseur = MAX(performed_at), reprise stricte `>`, pas de keyset (ts,id) ; commentaire ponytail lignes 51-55). Exact.
2. Absence de mention dans les surfaces publiques — exacte aussi : docs/guide-partenaires.md:144-164 (§3.3), docs/openapi.json:112-155 (description /objects/deletions) + 263-267 (param Since), docs/README_Postman.md:100 : aucun ne mentionne le tie-cut.
3. MAIS la réfutation porte sur la conclusion « information manquante » :
   a. docs/guide-partenaires.md:179-205 (§4) définit l'UNIQUE recette de synchro : à CHAQUE cycle (ex. quotidien), étape 1 = « parcourir la liste complète » (l.184-190), étape 3 = réconciliation « tout id présent chez vous mais absent du parcours (1) ET du flux (2) ⇒ … la masquer ou la retirer chez vous » (l.196-198), et l.203 précise « la synchro complète tient en quelques requêtes ». Un tombstone sauté est rattrapé dès le cycle suivant : l'objet supprimé est absent du parcours (1) et du flux (2), donc masqué/retiré. Le remède demandé par le constat (« en cas de doute, parcours complet périodique ») est donc déjà présent sous forme PLUS FORTE (parcours complet à chaque cycle, pas seulement « en cas de doute »).
   b. Le scénario résiduel « partenaire qui ne fait QUE le flux delta » n'existe pas : `GET /objects` n'a AUCUN paramètre delta (bertel-tourism-ui/src/app/api/public/objects/route.ts:34-40 : cursor/page_size/types/lang/search/format — le cursor est une pagination keyset de la liste complète, pas un since ; confirmé docs/openapi.json:36-43). Un partenaire « delta-only » ne recevrait jamais aucune création ni modification — ce mode n'est ni possible ni documenté ; le flux deletions est explicitement ancré comme complément de la liste publiée par l'OpenAPI même (openapi.json:117 : « L'état courant / les ajouts-modifications viennent de GET /objects ») et par le guide (renvoi §3.3→§4, l.164).
   c. Probabilité résiduelle quasi nulle : il faudrait deux hard-deletes (superuser-only, archivage requis, confirmation par nom — route.ts deletions l.11-13 et §108) partageant le même performed_at (`now()` transactionnel, migration_object_hard_delete.sql:24 — deux transactions distinctes à la microseconde près) ET >limit (500-1000) suppressions accumulées depuis le curseur ET la coupe exactement entre les deux jumeaux.

Conclusion : constat vrai sur le code mais faux sur la lacune documentaire — la mitigation exigée est déjà la recette obligatoire du guide (§4), le seul mode de synchro documenté est auto-cicatrisant au cycle suivant, et le cas de perte « définitive » suppose un usage de l'API qui n'existe pas. Catégorie « déjà couvert ailleurs + exagéré ».

---

## Constats non vérifiés (au-delà du cap de vérification — tous info)

- **Le prefixe 'Bearer ' est optionnel dans Authorization (cle brute seule acceptee)** — Categorie B. extractPartnerKey accepte la cle nue dans l'en-tete Authorization. Aucun impact pour qui suit la doc ; surface d'acceptation non contractuelle qui pourrait creer une dependance accidentelle (un partenaire qui omet Bearer aujourd'hui casserait si on resserre demain). *(Preuve : bertel-tourism-ui/src/lib/partner-auth.ts:27 (startsWith('Bearer ') ? slice : trimmed) CONTRE docs/guide-partenaires.md:58-62 et docs/openapi.json securitySchemes.bearerAuth (forme Bearer seule documentee))*
- **OpenAPI : cle 'scopee par l'OTI' — les scopes sont recuperes mais jamais verifies par aucune route** — Categorie C. info.description affirme que la cle est "emise, revocable et scopee" ; partner_authenticate retourne bien scopes[] mais aucune route ne les consulte (aucune autorisation par scope aujourd'hui). Pas d'impact integrateur immediat (toutes les routes sont en lecture publiee), mais la promesse documentaire cree une fausse assurance cote OTI (croire qu'une cle peut etre restreinte a un sous-ensemble d'endpoints). *(Preuve : docs/openapi.json info.description l.7 ("scopee") CONTRE bertel-tourism-ui/src/lib/partner-auth.ts:57 (scopes retournes) et les 4 routes (aucun acces a partner.scopes))*
- **Articulation type <-> prefixe d'id indefinie : le guide dit '3 lettres de type' mais CAMP a 4 lettres** — Categorie C. Le guide decrit l'id comme "3 lettres de type + territoire + 10 caracteres" et le pattern impose ^[A-Z]{3}... ; or l'enum contient CAMP (4 lettres) — le prefixe d'un id CAMP ne peut pas etre son code type. Ni le guide ni l'OpenAPI ne definissent la regle reelle (le prefixe est-il contractuel ? tronque ? libre ?). Benin tant qu'un partenaire ne derive pas le type depuis l'id — ce que la formulation du guide invite pourtant a faire. *(Preuve : docs/guide-partenaires.md:129 ("3 lettres de type") + docs/openapi.json ObjectType enum l.355 (CAMP) et parameters.ObjectId.pattern l.219 (^[A-Z]{3}[A-Z0-9]{3}[0-9A-Z]{10}$))*
- **page_size=0/non-numerique => 50 (defaut) et limit=0 => 500 : le clamp '1-200 / 1-1000' documente ne decrit pas ce cas** — Categorie B. Number(param)||50 fait retomber 0, NaN et les non-numeriques sur le DEFAUT (50 / 500), pas sur le minimum 1 qu'un lecteur du clamp documenterait. Aucun 400. Impact faible (personne ne demande 0 elements volontairement) mais comportement observable non specifie. *(Preuve : bertel-tourism-ui/src/app/api/public/objects/route.ts:35 (Number(...)||50) et deletions/route.ts:54 (||500) CONTRE docs/guide-partenaires.md:97+151 et docs/openapi.json parameters.PageSize/Limit (minimum 1, comportement hors-borne non specifie))*
- **OpenAPI ObjectStatus expose l'enum complet (draft/published/archived/hidden) pour un champ mono-valeur sur cette surface** — Categorie C. Le statut est force a published cote route (un partenaire ne voit jamais autre chose) mais le schema enum liste les 4 valeurs — assume dans la description ("toujours published"), coherent avec la realite, mais un client codegen genere et gere 4 etats inatteignables. Choix documentaire a assumer ou resserrer (enum: [published]). *(Preuve : docs/openapi.json components.schemas.ObjectStatus l.357-361 CONTRE bertel-tourism-ui/src/app/api/public/objects/route.ts:47 (p_status: ['published'] FORCE) et [id]/route.ts:63 (gate published))*
