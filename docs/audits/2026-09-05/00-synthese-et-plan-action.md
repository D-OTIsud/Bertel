# Synthèse de l'audit et plan d'action

Date : 5 septembre 2026. Révision : `5873ec69879e61ff34030d196c65f2eb0ac14de0`. [Index des 17 rapports](./README.md).

## Appréciation générale

Bertel possède des fondations substantielles : modèle touristique riche, autorisations SQL explicites, services métier structurés, tests nombreux, construction de production fonctionnelle et contrat de reconstruction de base. L'interface bureau montre une identité cohérente. La recherche temporisée, l'annulation des appels, le chargement progressif et les traitements par lots sont des protections déjà présentes.

Les priorités concernent toutefois des usages concrets : **rendre le mobile utilisable, éviter la perte de brouillons ou l'envoi d'une ancienne version, limiter la suppression administrative de comptes, fiabiliser l'effacement et sécuriser la livraison**. Une refonte esthétique générale serait moins utile que la correction des défauts de largeur, de lisibilité et de hiérarchie déjà observés.

L'audit répertorie **78 points de suivi : 13 P1, 63 P2 et 2 P3 ; aucun P0 établi**. Ils comprennent défauts de code, risques conditionnels, écarts de preuve et une heuristique de design. Ils ne constituent pas 78 vulnérabilités distinctes. Certains aspects d'un même chantier sont volontairement décrits dans plusieurs rapports ; les regroupements ci-dessous évitent de créer des corrections en doublon.

## Vérifications qui étayent cette appréciation

| Contrôle | Résultat | Limite |
|---|---|---|
| Construction Next.js | Réussie, 34 pages prérendues | Ne prouve pas le fonctionnement du conteneur ou de la production. |
| Jest | 407 suites / 3 374 tests réussis | Un worker arrêté de force ; aucune mesure de couverture demandée. |
| Typage dédié | 10 erreurs dans 4 fichiers de tests | Le build exclut ces fichiers, d'où les deux résultats différents. |
| Outillage Python | 40 tests réussis | Porte sur le graphe documentaire, pas sur l'exécution de RLS. |
| Tourinsoft | Contrats locaux et fixture valides | 96 champs restent en attente ; pas de recette partenaire réelle. |
| Dépendances npm | 35 paquets signalés avec `--omit=dev`, dont 7 élevés | Versions affectées identifiées ; exploitabilité de chaque avis à analyser. |
| Examen visuel local | Explorer/CRM bureau et mobile | Données de démo et tailles indiquées dans le registre. |

Les [preuves](./preuves/controles-executes.md) conservent commandes, résultats et conditions. Les suites déjà réussies n'ont pas été relancées lors de la finalisation : aucun code applicatif n'avait changé.

## Les 13 points P1 à traiter en priorité

| Référence | Constat et preuve disponible | Correction attendue avant clôture |
|---|---|---|
| [UX-07 — Ergonomie](./09-ux-interface-responsive.md) | À 390×844, le shell conserve deux colonnes après masquage du rail ; `main` ne mesure que 64 px. Reproduit sur Explorer et CRM, après rechargement. | Rétablir la largeur du contenu sous le seuil mobile ; vérifier les autres modules, 320/390/768 px, zoom et navigation tactile. |
| [SEC-01 — Administration](./02-securite-authentification.md) | Route de suppression globale sans contrôle du rang/rôle cible ; une adhésion cible inactive suffit au partage d'organisation. Mécanisme confirmé, aucune suppression réelle tentée. | Capacité plateforme explicite, protection des comptes privilégiés et du dernier owner, désactivation d'adhésion pour un admin local, refus testés. |
| [MET-01 — Brouillons](./08-fonctionnel-parcours-metiers.md) | `router.push` de la palette contourne la garde de départ de l'éditeur. | Navigation protégée commune ; annulation du départ conserve exactement les valeurs modifiées. |
| [MET-02 — Envoi de liste](./08-fonctionnel-parcours-metiers.md) | Les notes/lieux/ordre locaux peuvent différer de la liste relue côté serveur avant SMTP. | Sauvegarder et attendre une version confirmée avant rendu/envoi ; aucune émission si sauvegarde en échec. |
| [A11Y-01 — Réordonnancement](./10-accessibilite-internationalisation.md) | Réordonner les lieux exige le glisser-déposer, sans alternative clavier. | Commandes accessibles de déplacement avec état/focus annoncés ; tester sans souris et sans glissement. |
| [API-01 — Ressources serveur](./03-api-fichiers-medias.md) | Les corps d'upload/IA sont matérialisés avant contrôle de leur taille ; limite proxy déployée inconnue. | Limite fiable avant lecture complète, contrôles serveur et proxy, concurrence bornée ; test isolé sans saturation. |
| [PRIV-01 — Fichiers personnels](./07-confidentialite-rgpd.md) | Plusieurs fichiers liés à la personne sont hors du parcours d'effacement examiné. | Inventaire complet des emplacements, nettoyage vérifiable et état partiel si une étape échoue. |
| [PRIV-02 — Anonymisation](./07-confidentialite-rgpd.md) | Nettoyage du journal/anonymisation de compte incomplets malgré un résultat qui peut annoncer l'achèvement. | Définir ce qui doit être retiré/conservé, traiter chaque emplacement autorisé et restituer les échecs au lieu d'un succès global. |
| [PRIV-03 — Information des personnes](./07-confidentialite-rgpd.md) | La notice décrit encore certaines fonctions comme absentes et omet notamment le flux IA disponible. | Inventaire factuel à jour, notice et finalités validées par le responsable compétent. Aucun avis juridique de conformité n'est fourni ici. |
| [DEP-01 — Dépendances](./13-dependances-chaine-logicielle.md) | Versions de production concernées par des avis élevés, dont Next ; relevé npm daté. | Triage d'exposition puis mises à jour compatibles et tests de régression ; pas de correction automatique forcée. |
| [OPS-01 — Contexte Docker](./14-deploiement-exploitation.md) | `.env*` non exclus alors que le Dockerfile fait `COPY . .` ; présence de fichiers locaux établie. Fuite de production non démontrée. | Exclure les secrets du contexte, vérifier couches/caches et construire avec une sentinelle factice. |
| [OPS-02 — Configuration de livraison](./14-deploiement-exploitation.md) | Démo activée par défaut dans Docker/Compose/entrypoint. | Démo opt-in, configuration backend vérifiée et identité de l'environnement lisible. |
| [QA-02 — Garantie de livraison](./12-tests-assurance-qualite.md) | Aucun pipeline frontend versionné identifié ; une CI externe reste possible. | Contrôles frontend requis avant fusion : types, tests, build et parcours navigateur critiques. |

## Ordre de correction proposé

Les lots suivants sont une proposition d'organisation, pas des modifications déjà réalisées ni des engagements de délai. Les responsables sont des fonctions à attribuer, pas des personnes désignées sans accord.

| Lot | Travail regroupé | Pilote proposé | Critère de sortie |
|---|---|---|---|
| 1 — Droits et données | SEC-01, PRIV-01/02/03, API-01 ; examiner les paramètres Auth et limites proxy. | Backend/sécurité + responsable données | Matrice de refus et effacement sur fixtures ; notice fidèle ; aucun succès partiel masqué. |
| 2 — Travail utilisateur | UX-07, MET-01/02/03/04, A11Y-01 ; états de sauvegarde, sortie et envoi cohérents. | Frontend + produit/QA | Parcours complet sur téléphone et clavier ; brouillons conservés ; contenu envoyé égal à la version approuvée. |
| 3 — Livraison reproductible | DEP-01/02/03, OPS-01/02/03/04, QA-01/02/04 ; matrice ACL RLS-01. | Développement + exploitation | Build propre sur runtime de référence, contrôles requis, configuration démo explicite et ACL finales testées. |
| 4 — Lisibilité et design | DES-01/02/03/04/06, UX-01/02/03/04/05/06, A11Y-02…07. | Design + frontend | Noms lisibles, aucune collision de commandes, aperçus fidèles, tokens cohérents, contrastes et langues validés. |
| 5 — Cohérence et capacité | DB-01/02/03, SQL-01/02/03, PERF-01/02/03/04, INT-02/03. | Backend + frontend | Invariants tarifaires testés, paramètres bornés et budgets de charge mesurés sur corpus représentatif. |
| 6 — Exploitation et gouvernance | OPS-05, OBS-01…04, INT-01/04, ARC-01…03, MET-05, PRIV-05. | Exploitation + produit | Exercice de reprise daté, alertes actionnables, recette partenaire et périmètre livré documentés. |

### Points particuliers pour l'ergonomie et le design

Le défaut global mobile est à corriger avant de juger finement les écrans téléphone. Sur bureau, les deux pertes de lisibilité observées sont les noms de résultats réduits à quelques caractères et les outils de carte superposés au choix du fond. Les corrections doivent protéger l'information principale plutôt que multiplier les décorations.

Le branding configurable exige un contrat unique de tokens et des aperçus sans identité institutionnelle figée. L'orange par défaut avec texte blanc atteint seulement 2,44:1 dans le cas documenté A11Y-05 ; une palette cohérente visuellement ne garantit donc pas le contraste. La duplication de « Nouvel acteur » dans le CRM reste une heuristique P3 : sa suppression éventuelle doit être évaluée auprès des utilisateurs, car elle peut aider sur une longue liste.

## Vérifications restantes pour clôturer les risques d'exploitation

| Vérification | Pourquoi elle reste nécessaire | Preuve attendue |
|---|---|---|
| Base isolée reconstruite puis mise à niveau | Docker indisponible pendant l'audit ; migrations et grants peuvent différer. | Tests SQL exécutés et comparaison des ACL/grants finaux. |
| Personas Auth/RLS réels | Les gardes visibles ne prouvent pas les règles actuellement déployées. | Refus/succès attendus pour anon, lecteur, éditeur, admin ORG, plateforme et service. |
| Effacement et anonymisation | Les constats portent sur le code et le contrat annoncé. | Fixtures incluant fichiers, journal, historiques et échecs partiels ; résultat contrôlé. |
| Recette métier intégrée | Les mocks ne valident pas le transport, les sessions et la persistance. | Sauvegarde/relecture, modération, liste, SMTP de test et reprise réseau. |
| Accessibilité et usages réels | Pas de lecteur d'écran, clavier virtuel ni test utilisateur complet. | Recette clavier/tactile, zoom 200 %, contrastes sur marques livrées et lecteurs d'écran. |
| Capacité et fiabilité | Pas de charge de production, métriques SQL ou latence utilisateur réelle. | Corpus/volume cible, p95/p99, mémoire et seuils d'alerte documentés. |
| Sauvegarde et restauration | Aucune preuve d'exercice de reprise ni configuration distante consultée. | Restauration conjointe données/Auth/Storage avec RPO/RTO mesurés. |
| Fournisseurs et diffusion | Pas de recette distante Tourinsoft, ONF ou IA ; contrats non consultés. | Version acceptée, finalités/rétention, coûts, droits d'usage des médias et fonds, règles de diffusion/indexation des liens publics. |

## Constats écartés ou limités après recoupement

- L'escalade historique via `raw_user_meta_data.role` n'est pas retenue : une migration finale passe à `app_metadata` et retire les droits ordinaires de synchronisation.
- Un administrateur ordinaire simultanément actif dans deux organisations n'est pas un scénario démontré : le trigger SQL impose une seule organisation active. SEC-02 est une surveillance P3 de cet invariant.
- Un `SECURITY DEFINER`, une RLS sans policy ou HTTP 200 ne permettent pas isolément de conclure à une fuite ou à un succès métier. Les gardes et contrats ont été considérés.
- Aucun secret compromis, aucune suppression réelle, aucune exploitation de dépendance, aucune absence de sauvegarde de production n'est affirmé.

## État des livrables

Les 17 rapports, l'index, cette synthèse et les preuves structurées sont achevés. Chaque rapport expose son périmètre, les constats étayés, les recommandations et les critères de validation. La fin de cette mission signifie que **l'audit documentaire est livré** ; elle ne signifie ni que l'application a été corrigée, ni que les risques listés sont clos, ni qu'une conformité ou une aptitude à la production a été certifiée.
