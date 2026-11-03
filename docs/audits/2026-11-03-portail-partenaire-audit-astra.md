# Portail partenaire Bertel — audit indépendant

3 novembre 2026, heure de La Réunion. Worktree `bertel-partner-portal-launch-20261030`, HEAD `4d8d844f18c90b6428fe787456c5bb395fdaefe2`. Base contrôlée : `ryycrdhlkmzpxwwwwupy`. Audit uniquement.

**Verdict : conserver la direction simplifiée et les six lots préparés, mais ne pas confondre cette préparation avec un lancement validé.** Le premier complément restaurant peut rester une carte PDF/image modifiable. En revanche, le menu textuel et son extraction sont des objectifs déjà demandés, à livrer ensuite, pas des besoins à remettre en discussion. Quelques corrections ciblées des contrats existants sont plus urgentes que de nouvelles facettes métier.

Les résultats reposent sur trois examens spécialisés Sol, puis sur un recoupement personnel des sources décisives, des fonctions vivantes et de leurs empreintes. L’accord entre auditeurs n’est pas une preuve. Les identifiants **A01–A08**, les six lots et les dix-neuf types renvoient à la [matrice de couverture et de provenance](C:/Users/dphil/.codex/visualizations/2026/10/30/01a18e47-de10-7be3-8a29-3e4b57889b75/portal-reference/passation-astra-20261103/resultats/matrice-couverture-provenance.json), qui contient les chemins, lignes, dates, qualifications et lacunes.

## État réellement établi

La [PR 73](https://github.com/D-OTIsud/Bertel/pull/73) est ouverte, en brouillon, non fusionnée au HEAD annoncé. Les contrôles Frontend CI et SQL fresh-apply réussissent sur ce commit. Les contrôles historiques en transaction annulée attestent une préparation ; ils n’attestent aucun déploiement.

La base possède déjà le contrat SMTP par office, mais **aucune configuration ni test réussi enregistrés**. Les nouvelles RPC de séjour, messages, photos, plannings nommés et lancement/relance sont absentes. Les colonnes sous-jacentes ne remplacent pas ces services. Les six lots sont distingués dans la matrice ; il serait faux de déclarer tout leur socle absent, ou tout leur comportement disponible.

La base compte toujours **914 fiches hors tests, 19 types et zéro profil acteur**. Elle contient zéro activité métier réelle, une ligne d’inventaire RVA, un menu sans plat et une carte publique valide. Cela limite la recette possible ; cela ne démontre pas l’inutilité des besoins.

L’API, elle, présente **1 278 appels aux routes objets sur trente jours, dont 941 réussis, via trois clés distinctes**. Quatre clés sont actives et non expirées. Ces agrégats ne permettent ni d’identifier trois clients différents, ni de distinguer ici essais et intégrations, ni de savoir quels champs sont consommés. Ils interdisent simplement de conclure à « aucun consommateur ». Le front effectivement déployé n’a pas été identifié.

## Corrections qui changent la décision de livraison

**A01 — Réparer l’activité existante.** Le catalogue vivant ne contient pas `equipment_provided_details`, alors que le loader le sélectionne et rend toute la tranche indisponible en cas d’erreur ; le writer l’envoie aussi. La migration d’alignement existe au manifeste. La correction minimale est de finaliser ce contrat déjà conçu, indépendamment du restaurant et sans ajouter une question au partenaire. La projection `to_jsonb(object_act)` ajoutera une clé JSON nullable : cette conséquence API doit être vérifiée, même sans nouvelle interface. L’objectif « aucune colonne neuve » ne justifie pas de casser le contrat office.

**A02 — Protéger les heures contre un ancien écran office.** Le RPC partenaire préparé ne modifie que les trois heures. Mais la sauvegarde office de capacité réécrit toute la politique de séjour à partir de son état chargé, voire la supprime si cet état est vide. Un conseiller peut donc enregistrer une capacité et rétablir involontairement d’anciennes heures. Il faut dissocier cette écriture et contrôler les conflits sur les heures réellement modifiées. Correction importante à la lecture des anciens audits : l’approbation automatique de `capacity-policies` n’est pas le coupable démontré ; ce module porte `rpc:null` et passe par une application manuelle. Aucun écrasement réel n’a été provoqué pendant cet audit.

**A03 — Corriger la lecture restaurant sur les chemins concernés.** Le lecteur SQL vivant trie les menus actifs et les plats disponibles, mais ne les filtre pas dans leurs listes principales. Le volet RES masque les plats indisponibles, pas les menus inactifs ; ce dernier défaut est reproduit en mémoire sur sa fonction réelle. Les cartes `menu_documents` n’ont pas de filtre documentaire d’accès/validité et ne sont pas consommées dans le volet.

La correction doit préserver la lecture étendue de l’office tout en filtrant la restitution publique, puis afficher la carte dans un consommateur identifié. FMA partage le bloc SQL menus ; son volet ne présente pas pour autant une section menu existante. Les policies SELECT directes menus/plats omettent aussi la visibilité propre du menu : cette surface doit être vérifiée, sans prétendre qu’un essai HTTP l’a validée. Le corpus actuel ne démontre aucune fuite effective.

**A04 — Réutiliser le modèle textuel, sécuriser son writer.** Le saver office supprime les liens, les plats et les menus, puis les recrée par requêtes distinctes. Une panne peut laisser une suppression commise ; un ancien état peut effacer un menu ajouté depuis ; les identifiants sont renouvelés. C’est une dette préexistante, pas une régression propre à la PR.

Avant d’ouvrir les menus textuels au partenaire, il faut une mutation restaurant atomique utilisée également par l’office, conservant les identifiants, bornant les suppressions et détectant une modification concurrente. Cela justifie un contrat métier ciblé, pas une infrastructure générique. Le modèle existant couvre déjà les prix par plat ; le prix d’une formule globale est une donnée supplémentaire, nécessaire seulement si ce service structuré est promis.

**A05 — Ne pas annoncer tous les exports compatibles avec les nouveaux horaires.** La migration des plannings corrige les lecteurs principaux. Mais le sérialiseur Tourinsoft régional préparé mélange encore tous les plannings, trie leurs créneaux et n’exporte que les deux premiers par jour. Accueil 08–09 et ouverture 09–12/14–18 peuvent ainsi faire disparaître l’ouverture d’après-midi de l’export.

Il faut exclure accueil/service de cette projection principale, ou les mapper explicitement si le format cible le prévoit. **La fonction régionale est absente de la base auditée** ; l’interop vivant ne projette pas ces horaires. C’est une incompatibilité de sources à traiter avant activation de l’export, pas un incident de production établi. Deux anciens helpers horaires sans filtre subsistent ; aucun consommateur effectif n’a été établi, donc ils ne deviennent pas des blocages inventés.

**A06 — Nommer correctement la livraison photo.** Le lot préparé suit B : ajouts privés relus, retrait et ordre immédiats. Il ne réalise pas la cible ultérieure de notation, refus motivé et recours humain. Sa borne de vingt concerne les ajouts d’un lot, pas le stock total. Le quota IA actuel en mémoire n’est pas un quota journalier durable.

Conserver l’objectif de vingt photos et prévoir son comptage serveur cohérent. B peut être une étape explicitement présentée comme telle ; il ne vaut pas validation de la cible finale. Le verbatim décrit le refus sous six comme exemple de seuil ; la publication automatique dès six est une inférence des plans, pas une phrase utilisateur. Les cinq pages par compte et par jour ne sont pas arbitrées. Ces paramètres ne doivent pas devenir des décisions acquises par répétition.

## Ce que les revues antérieures corrigent — et laissent encore ambigu

Le périmètre minimal corrige utilement la tendance du plan étendu à transformer chaque détail de maquette en contrat à créer. Il contient néanmoins deux glissements : « sur besoin confirmé » pour les menus/extraction, déjà demandés, et « conserver chambres/emplacements » alors que la rubrique partenaire actuelle ne saisit que la capacité principale et les animaux. Existence en base ou dans l’office n’équivaut pas à présence dans le portail. **A07** précise cette distinction. La publication directe des cuisines, chambres, activités et visites reste également une proposition ; le choix retenu pour les menus ne l’autorise pas implicitement.

Claude a eu raison de distinguer la réparation activité d’un enrichissement facultatif et d’alerter sur la divergence entre nouvelle carte et anciens plats extraits. En revanche, le coût office n’est pas presque nul, l’idempotence d’un upload ne sécurise pas un remplacement complet, et un prix global n’est pas nécessaire à chaque carte de plats. La dernière revue Claude s’appuyait sur des documents et extraits fournis, pas sur une deuxième connexion à la production.

L’ancienne critique du writer chambres ne décrit plus le contrat vivant : `rooms-reconcile-v1` utilise des suppressions explicites. Les enfants d’une ligne restent réconciliés ; un petit formulaire ne doit pas envoyer un état incomplet. Les confusions logement/chambre/lit/quantité restent à éviter, mais ne justifient aucun nouvel inventaire au premier complément.

Les corrections historiques de septembre sont retrouvées dans le code : historique de soumissions par fiche, purge après déconnexion réussie, conservation du message seul et priorité d’une nouvelle soumission sur un ancien rejet. Les reprendre comme défauts actuels serait incorrect.

## Simplicité, types et coût des ajouts

Les dix-neuf types sont examinés individuellement dans la matrice. Les rubriques préparées se regroupent en cinq familles, pas dix-neuf éditeurs. Conserver capacité maximale, durée, participants, âge, accessibilité et horaires existants ; alléger les nouveaux ajouts ne doit pas les supprimer.

**A08 : trois périmètres coexistent.** Le front supporte seize types, la console d’invitation en retient quinze, et la fonction de portée SQL exclut seulement ORG à ce niveau, sous réserve des liens/realm. VIL a une famille front mais manque dans la console ; FMA/ITI n’ont pas de formulaire malgré une portée SQL possible. Il faut expliciter leur gouvernance, pas élargir les droits pour rendre les listes identiques. SPU demande également une responsabilité de gestionnaire explicite.

Les cinq maquettes simplifiées sont des simulations. Les captures mobiles du 2 novembre montrent une entrée restaurant lisible, mais le contrôle de quelques plats dépasse déjà le premier écran ; elles ne prouvent pas l’aisance avec une longue carte. Les promesses d’extraction et les succès simulés ne conviennent pas à un jalon de simple document. Pour ce jalon, proposer seulement ajouter/remplacer/retirer, une carte reconnaissable, un résultat confirmé et une reprise claire après échec. Aucune interface n’a été modifiée ici.

Différer la facette visite, les langues guidées, la nature d’unité par ligne, les inventaires complexes et l’exposition du texte matériel au partenaire. Chaque ajout coûte modèle/droits, édition office, portail, restitution API et compatibilité. Les modes libre/guidée/audioguide existent déjà comme équipements. Ne pas renommer les langues d’accueil pour leur faire affirmer des langues de visite. La matrice chiffre qualitativement ces coûts et distingue les extensions des réparations.

## Premier incrément recommandé et limite de clôture

Pour le socle initial, traiter les prérequis d’exploitation, protéger les heures avant leur ouverture directe et qualifier exactement le parcours photo livré ; ne pas déclarer le lancement acquis grâce à la CI. Réparer l’activité indépendamment. Le writer textuel et l’export régional ne conditionnent que leurs jalons respectifs.

**Premier complément : carte restaurant PDF/image**, dans les structures documentaires existantes, avec autorisation limitée à la fiche, remplacement fiable préservant l’ancienne carte en cas d’échec, correction office, filtres d’accès/validité et affichage consommateur. Ne pas promettre le rappel de copies téléchargées. Remplacer la carte ne doit ni supprimer tous les menus, ni faire croire que leurs plats/prix sont synchronisés.

Conserver ensuite les jalons **menu textuel manuel, puis extraction assistée**, avec le writer sûr, la vérification du restaurateur, la cohérence du document source et un quota durable. Une formule structurée avec prix global demandera son évolution complète ; aucune fausse ligne « Formule » pour contourner le modèle.

Les skills app-ui-ux et Supabase ont guidé l’inspection ; graphify et l’index DB ont été consultés. Wiki graphify et dbdoc manquent dans ce worktree. Les 44 entrées du manifeste sont contrôlées : 43 fichiers inchangés et AGENTS.md absent comme annoncé ; ses consignes ont été reçues dans la conversation. La base a été examinée uniquement par SELECT ; le rôle administrateur utilisé ne remplace pas une recette authentifiée partenaire/office. Deux tests isolés du worker et une reproduction client en mémoire ont été exécutés, sans nouveau test d’écriture ni suite complète. SMTP réel, activation, worker déployé, upload, extraction et ergonomie utilisateur restent non observés.

**Audit clos après couverture et synthèse des trois sous-agents.** Seuls ce rapport et les livrables de preuve sous `resultats/` ont été créés ; aucune implémentation n’est lancée.
