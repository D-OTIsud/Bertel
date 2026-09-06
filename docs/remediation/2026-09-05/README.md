# Corrections issues de l’audit — 6 septembre 2026

Dix lots de corrections locales ont été réalisés avec **Claude Code Sonnet 5**, puis relus, testés et corrigés par Codex. Ils couvrent notamment **l’ergonomie, le design, la protection des brouillons, les listes, les comptes et l’effacement RGPD**.

Révision de départ : `5873ec69879e61ff34030d196c65f2eb0ac14de0`. Les [17 rapports d’audit](../../audits/2026-09-05/README.md) restent une photographie du point de départ. Leurs 78 points ne sont pas tous déclarés clos. Ce bilan décrit les validations locales initiales, avant intégration et publication ; la [note de version et de retour arrière](../../releases/2026-09-06-retour-arriere.md) suit leur intégration avec le `master` plus récent. Aucune migration distante ni aucun envoi d’e-mail réel n’a été effectué pendant ces validations.

Les chemins `scratch/` et les chemins machine désignent des preuves locales non publiées dans le dépôt public. Les synthèses de résultats et leurs limites sont conservées ici.

## Vérifications

| Contrôle | Résultat et limite |
|---|---|
| Typage | `npm run typecheck` réussi. Les 10 erreurs initiales dans les fixtures sont corrigées. |
| Jest | 420 suites / 3 553 tests exécutés. Premier passage : 419 suites et 3 551 tests verts ; deux assertions de la même fixture CRM corrigées. Dernière reprise ciblée : 5 suites / 126 tests verts. Aucun échec connu restant. |
| Chromium | 19 scénarios distincts validés après correction de deux sélecteurs sans accent et d’une attente transitoire sur une sauvegarde démo immédiate. Premier passage 16/19, puis 8/8 pour les scénarios relancés. |
| Ergonomie réelle | Explorer/CRM et barre mobile à 320/390/767 px ; seuil bureau 768 px ; carte à 1 181/1 280 px. Éditeur 390 px : navigation entre sections, saisie, gras, annulation et alternance français/anglais sans perte de la valeur locale. |
| npm production | **0 vulnérabilité signalée** par `npm audit --omit=dev`, relevé du 6 septembre 2026. |
| npm développement | 26 paquets signalés : 10 élevés, 7 modérés, 9 faibles, principalement outillage Storybook/tests et transitifs. Pas de mise à niveau majeure forcée. |
| Docker | Build Node 22 réussi, 34 pages produites. Contrôles de démarrage, utilisateur, contexte et paramètres : [validation Docker](./validation-docker.md). |
| SQL ciblé | RGPD, bornes d’âge et droits du sérialiseur Tourinsoft validés sur une base locale isolée. Réapplication, permissions et rollback contrôlés : [validation SQL](./validation-sql.md). |
| Reconstruction SQL complète | Bootstrap local initial CLI 2.109.1 en échec de grants ; **CI complète réussie après intégration avec `master`**, sous CLI 2.78.1. Aucun accès brut global ajouté. Voir la [validation d’intégration](../../releases/2026-09-06-retour-arriere.md#contrôles-dintégration). |
| Notice | Markdown, HTML et PDF cohérents ; 9 pages du PDF rendues et inspectées. Version documentaire en révision, sans certification de conformité. |

Preuves : [Jest complet](../../../scratch/remediation-2026-09-05/full-jest-final.log), [dernières révisions](../../../scratch/remediation-2026-09-05/final-revision-jest.log), [typages](../../../scratch/remediation-2026-09-05/typecheck-final-confirmed.log), [Chromium complet](../../../scratch/remediation-2026-09-05/full-e2e-progress.log), [reprise Chromium](../../../scratch/remediation-2026-09-05/e2e-regressions-final.log), [npm production](../../../scratch/remediation-2026-09-05/npm-audit-production-final.json), [npm complet](../../../scratch/remediation-2026-09-05/npm-audit-all-final.json).

## Lots réalisés

### 01 — Ergonomie mobile et lisibilité

Le shell passe à une colonne quand le rail est masqué ; Explorer et CRM occupent la largeur disponible. La barre supérieure se répartit sur deux lignes à petit format et conserve recherche/création. Le menu mobile ouvre profil et notifications en refermant la navigation.

Les noms de résultats disposent de deux lignes distinctes des badges. Les cartes grandissent selon leur contenu : la revue a supprimé une hauteur rigide qui pouvait faire disparaître le titre. Les outils de carte suivent le flux pour éviter la superposition au choix du fond.

Preuve maintenue : `tests/e2e/mobile-shell.spec.ts`, 9 scénarios. Fichiers principaux : `styles.css`, `TopBar.tsx`, `MobileNavDrawer.tsx`, `ResultCardView.tsx`, `MapPanel.tsx`.

### 02 — Brouillons, listes et envoi

La garde commune protège les départs depuis la palette, la création et les notifications. Le compositeur protège métadonnées et lieux. Les sauvegardes sont réellement séquentielles ; l’envoi attend les écritures précédentes et l’instantané courant, et s’arrête si une sauvegarde échoue. Le changement de langue et les doubles actions sont verrouillés pendant cette préparation. Un rafraîchissement ne remplace plus arbitrairement le brouillon.

Le nom anglais est modifiable. Les lieux peuvent être déplacés au clavier avec focus conservé et déplacement annoncé. Tests avec requêtes différées/rejetées, changements de langue et ordre d’exécution. Tout futur point de navigation doit utiliser la garde ; une couverture universelle des futurs `router.push` n’est pas revendiquée.

### 03 — Suppression administrative de comptes

La suppression définitive exige un privilège plateforme. Le serveur refuse auto-suppression, cible propriétaire, rôle inconnu, profil absent ou erreur de vérification. Supprimer un super administrateur exige un contrôle positif du statut de propriétaire de l’appelant, sans erreur associée.

L’écran Équipe et l’aide distinguent suppression globale et désactivation d’adhésion. L’action globale est masquée aux administrateurs d’organisation. Matrice de refus serveur et visibilité des actions testées ; aucun compte réel supprimé.

### 04 — CI, construction et runtime

Node 22 devient la référence versionnée. Docker s’exécute sous `node`, avec démo désactivée par défaut et refus d’une configuration backend absente hors démo. Les fichiers d’environnement et de clés sont exclus, y compris dans les sous-dossiers ; des sentinelles fictives le vérifient. Les scripts shell utilisent LF, avec normalisation défensive du script d’entrée dans Docker.

La CI frontend contrôle types, Jest, build et Chromium. Dependabot propose les mises à jour. Les scénarios de CI utilisent encore le serveur de développement ; le build et les sondes de l’image de production sont des vérifications distinctes. Aucun pipeline distant déclenché.

### 05 — Corps HTTP, fichiers et IA

Le lecteur commun borne les octets réellement reçus, même sans longueur annoncée ou avec une valeur mensongère. Le parseur multipart limite aussi fichiers, champs, parties et taille des champs avant leur matérialisation. Les noms UTF-8 sont préservés.

Plafonds des corps : 101 Mio pour médias, 21 Mio pour les autres téléversements concernés, 128,25 Mio pour extraction IA. Les limites propres aux fichiers restent applicables. Le quota du processus autorise deux uploads lourds et une extraction IA. La préparation des images est séquentielle ; un échec ne libère plus le quota pendant que d’autres traitements natifs continuent en arrière-plan.

Limites : quota par processus, sans coordination entre réplicas ; copies bornées coexistantes en mémoire. Aucun plafond global de mémoire ni test de charge de production annoncé. Les limites du proxy restent à vérifier.

### 06 — Dépendances et éditeur de texte

Next 16.2.11, Sharp 0.35.4, dépendances Tiptap directes 3.30.4 et `tiptap-markdown` 0.9.0, avec mises à jour transitives de production. Le relevé npm production est nul ; les 26 alertes de développement restent à traiter.

La migration Tiptap adapte le chargement externe sans notification de modification, les liens autorisés, l’état de la barre d’outils et la désactivation. Les extensions en double sont désactivées. La revue corrige aussi une barre d’outils restant vide et un `setEditable` qui déclenchait à tort une modification. Tests du composant et contrôle navigateur gras/annulation/langues réussis.

Sources : [migration Tiptap 3](https://tiptap.dev/docs/guides/upgrade-tiptap-v2), [avis sur la fusion d’attributs](https://github.com/advisories/GHSA-cp6q-959q-f8rh).

### 07 — Effacement et information RGPD

Une opération SQL persistante enregistre les tâches de retrait de fichiers et de compte Auth. Le journal précède les tâches, dans une transaction atomique. La reprise traite une opération existante sans relancer l’effacement du sujet.

Le nettoyage couvre documents privés/justificatifs identifiés, avatars, CRM et historique des interactions/tâches, même avant leur rattachement à l’acteur. Les documents partagés sont conservés et signalés pour examen. La rédaction du journal suit les suppressions pour éviter qu’un trigger ne recrée une copie sensible. Les comptes privilégiés sont revérifiés à chaque tâche Auth, y compris à la reprise.

L’API valide corps, enveloppe d’opération, origine et chemins de stockage. Un échec de tâche ou de confirmation produit un résultat partiel avec identifiant de reprise. La notice décrit les fonctions réelles et retire les garanties générales non vérifiées sur les lieux de traitement et les sauvegardes.

[Notice Markdown](../../../bertel-tourism-ui/public/legal/rgpd.md), [HTML](../../../bertel-tourism-ui/public/legal/rgpd.html), [PDF](../../../bertel-tourism-ui/public/legal/rgpd.pdf), [validations institutionnelles restantes](./notice-validations.md).

Limites : orphelins historiques, nouveaux uploads concurrents, copies exportées, sauvegardes, caches et documents partagés exigent une procédure complémentaire. Aucun déploiement de migration ni avis de conformité juridique annoncé.

### 08 — Design, accessibilité et langues

Le thème expose l’alias de surface manquant et choisit une encre claire ou sombre selon le contraste calculé. Les commandes de langue/mode exposent leur sélection. L’éditeur mobile propose une liste de sections accessible, sur une ligne dédiée en dehors de la navigation bureau masquée.

Le document public porte sa langue effective. Une panne de chargement n’est plus présentée comme une liste inexistante ; un nouvel essai est possible et les réponses anciennes sont ignorées après changement de token. Les passages anglais déclarent leur langue.

32 tests ciblés de thème/navigation/langues/états publics, puis inclusion dans la suite complète. Une recette avec lecteur d’écran et les marques déployées reste nécessaire pour clôturer l’accessibilité au sens large.

### 09 — Intégrité et droits SQL

La nouvelle contrainte interdit les maxima d’âge négatifs même si le minimum est absent. Des lignes héritées invalides sont conservées : la contrainte protège les nouvelles écritures et reste `NOT VALID` jusqu’à leur traitement explicite. L’ordre minimum/maximum existant reste contrôlé.

Le sérialiseur Tourinsoft conserve les droits de l’appelant ; 19 droits de lecture nécessaires au rôle de service sont accordés explicitement et testés. La reconstruction isolée révèle ensuite un défaut du contrat de lecture acteur. Un accès brut large aurait exposé des informations que le RPC masque ; il n’a pas été ajouté. Seules les DDL restantes ont été appliquées pour permettre les essais ciblés, sans prétendre à une reconstruction complète réussie.

Voir [validation SQL](./validation-sql.md) et [procédure de migration](../../SQL_ROLLOUT_RUNBOOK.md). Cache tarifaire daté, règles de devise, plans SQL sur volumétrie réelle et matrice ACL globale restent à traiter.

### 10 — Exploitation et intégrations

`/api/health` reste une sonde de vie du processus. `/api/ready` contrôle configuration et joignabilité de Supabase Auth avec délai borné, sans retourner de clé ou diagnostic fournisseur. Elle ne contrôle pas complètement DB, Storage, RLS ou SMTP. Ses paramètres doivent provenir du processus au démarrage, indépendamment des valeurs de build ; cela est vérifié dans Docker.

SMTP utilise des délais explicites. Après acceptation par le relais, une erreur d’historique ne transforme plus l’envoi en échec apparent : l’interface précise que le suivi n’a pas pu être confirmé. Acceptation ne signifie pas livraison. Une erreur réseau peut laisser l’issue incertaine ; aucune réémission automatique n’est ajoutée.

Les deux fonds vectoriels de repli portent les noms « Plan détaillé » et « Plan clair ». Les clés et configurations personnalisées restent compatibles. [Runbook d’exploitation](./exploitation.md).

## Avant une validation de mise en service

- Résoudre le contrat de lecture acteur et valider reconstruction/mise à niveau SQL complète avec personas réels.
- Appliquer les migrations en recette autorisée et vérifier Auth/Storage/effacement avec leurs services réels.
- Recetter SMTP, Tourinsoft/ONF/IA et reprise réseau ; définir quotas distribués et déduplication des envois.
- Valider prestataires, contrats, finalités, durées et procédures ; réaliser un exercice de restauration daté.
- Traiter les alertes de développement, mesurer la capacité et poursuivre les points d’audit non couverts.
- Vérifier l’alerte d’hydratation observée dans la console de développement de `ModerationPage` pendant la recette. Les scénarios fonctionnels de modération passent, mais ils n’assertent pas l’absence d’erreur de console. La correction et le contrôle d’hydratation de l’Explorer ne couvrent pas automatiquement les autres pages.

## Méthode Claude Code et revue

Prompts par périmètre, chemins précis, invariants métier et critères de sortie. Sonnet 5 réalise les implémentations ; certains relevés du CLI indiquent aussi Haiku pour ses traitements auxiliaires. Les révisions reprennent les sessions du lot et ciblent les défauts observés. Codex coordonne commandes, revue et tests, puis corrige les écarts constatés.

Les sessions Claude étaient limitées à la lecture/édition, sans outils shell ni configuration MCP héritée. Prompts et réponses sont conservés sous `scratch/remediation-2026-09-05/`. Le [relevé des appels](../../../scratch/remediation-2026-09-05/claude-runs-summary.json) indique modèles et estimations du CLI ; ce n’est pas une facture de l’abonnement.

Le graphe de code est régénéré par `graphify update .` sans appel à un modèle. Le graphe DB existant reste la photographie de son catalogue source ; il doit être régénéré depuis la base cible après application autorisée, sans le remplacer silencieusement par le catalogue des fixtures locales.

En fin de vérification, le serveur Next de cette tâche et le projet Supabase local `bertel-audit-20260905` ont été arrêtés ; les volumes SQL locaux sont conservés. Le projet Bertel préexistant n’a pas été arrêté. Le graphe final comporte 22 482 nœuds et 38 111 relations ; sa visualisation HTML n’a pas été régénérée, car il dépasse le seuil de 8 000 nœuds du générateur.
