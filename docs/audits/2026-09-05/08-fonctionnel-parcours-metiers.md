# Audit fonctionnel et parcours métier

Date : 5 septembre 2026. Référence : `5873ec69879e61ff34030d196c65f2eb0ac14de0`. Périmètre : frontend `bertel-tourism-ui`, routes, composants, sauvegardes et contrats de service appelés par l'interface. Audit en lecture seule ; aucune donnée distante créée, modifiée, envoyée ou supprimée.

## Méthode et limites

Navigation initiale par `graphify query`, puis inspection ciblée du code et des tests existants. `graphify-out/wiki/index.md` est absent. Les scénarios ci-dessous sont des reproductions proposées, pas des opérations exécutées en production. Les suites typecheck/Jest/build sont centralisées dans l'audit de validation ; elles ne sont pas relancées ici. La compétence Supabase a été lue ; aucun comportement du serveur live ou droit RLS n'est certifié dans ce document.

Priorités : P0 incident critique immédiat ; P1 perte de travail ou résultat métier incorrect ; P2 parcours dégradé ou capacité manquante ; P3 amélioration. « Confirmé code » signifie que le chemin d'exécution ou l'absence de branche est établi dans les sources. « Risque » nécessite un scénario supplémentaire. Aucun P0 identifié dans ce périmètre.

## Couverture et état réel des modules

| Module | État observé dans les sources | Limite de la conclusion |
|---|---|---|
| Connexion / mot de passe | Vues dédiées, validations, états d'attente ; layout principal conditionné à `ready` (`src/app/(main)/layout.tsx:24`). | Auth réelle traitée dans l'audit sécurité. |
| Explorer | Carte, liste/table, filtres, sélection, export et lien vers fiche ; état URL synchronisé (`src/app/(main)/explorer/page.tsx:21`). | Géocodage, couverture cartographique et résultats réels non rejoués ici. |
| Dashboard | Widgets à chargement et erreur indépendants, réessai local, onglets qualité/offre/activité (`src/views/DashboardPage.tsx:80`). | Fiabilité des agrégats dépend des RPC et du corpus. |
| Éditeur | Sauvegarde brouillon, publication séparée, propositions contributeur, validation, sauvegarde partielle et présence (`src/features/object-editor/useEditorSave.ts:109`). | Concurrence multiutilisateur et atomicité SQL à valider séparément. |
| Listes | Création, composition statique/dynamique, modèles, langues FR/EN, impression, partage et e-mail effectivement câblés (`src/views/ListComposeView.tsx:119`, `src/services/lists.ts:425`). | Défauts de cohérence entre brouillon et envoi ci-dessous ; SMTP réel non testé. |
| CRM | Annuaire acteurs, établissements, timeline, tâches et assignations ; permission d'écriture sondée (`src/views/CrmPage.tsx:111`). | Les mutations métier n'ont pas été exécutées. |
| Modération | File réelle ; approbation confirmée ; motif obligatoire de refus ; erreurs et réessai (`src/views/ModerationPage.tsx:46`). | La validité de l'application des propositions relève du backend. |
| Audits | Maquette de démonstration ; masquée en mode réel. | Ce n'est pas un module terrain exploitable en production. |
| Publications | Maquette de démonstration ; masquée en mode réel. | Ne pas confondre avec les fonctions réelles d'impression/export des Listes. |
| Équipe | `/team` redirige vers `/settings?section=team` ; administration intégrée aux paramètres (`src/app/(main)/team/page.tsx:6`). | Invitations et changements de rôle non envoyés. |
| Paramètres | Profil, langues, marque, référentiels et panneaux administratifs filtrés par rôle (`src/views/SettingsPage.tsx:69`). | Tokens de marque partiellement propagés : voir audit design. |
| RGPD | Résolution du sujet, anonymisation/suppression, confirmation et retour résultat (`src/views/RgpdErasurePage.tsx:72`). | Aucun effacement ; portée juridique et SQL traitée séparément. |
| Aide | Centre d'aide avec recherche et liens vers les parcours (`src/views/HelpPage.tsx:214`). | Utilisabilité de la terminologie à éprouver avec les métiers. |

Les chemins du tableau sont relatifs à `bertel-tourism-ui/`.

## Points solides

Le registre `src/config/nav-items.ts:36` aligne menu, palette et navigation mobile. Le Dashboard isole les pannes de widgets. La modération demande un motif de refus et distingue chargement, erreur et absence de résultats. L'éditeur conserve les modules en échec après sauvegarde partielle, au lieu d'annoncer un succès global (`src/features/object-editor/useEditorSave.ts:143`). Ces garanties sont visibles dans le code ; leur existence ne remplace pas des essais bout en bout.

## Constats

### MET-01 — P1 — La palette contourne la protection des modifications de fiche

**Statut : Confirmé code.** La garde intercepte les clics sur des liens et le départ navigateur, mais les entrées de palette utilisent directement `router.push`. Preuves : `bertel-tourism-ui/src/features/object-editor/useUnsavedDraftGuard.ts:47` et `:73`, `bertel-tourism-ui/src/components/layout/CommandPalette.tsx:131`, `bertel-tourism-ui/src/features/object-editor/ObjectEditPage.tsx:159`.

**Déclencheur et impact :** modifier une fiche sans enregistrer, ouvrir Ctrl/⌘+K, choisir Dashboard. La navigation programmée quitte l'éditeur sans appeler `confirmLeave`, avec perte du brouillon local. Le `beforeunload` ne couvre pas une navigation client Next.

**Correction :** centraliser la navigation protégée et faire consulter la garde par la palette, les commandes et les liens. Ne pas limiter le contrôle à un écouteur de clic sur `<a>`.

**Validation :** sur une fiche modifiée, tester palette, lien de menu, retour et bouton interne ; annuler conserve la page et les valeurs, confirmer autorise le départ, une fiche propre part sans alerte.

### MET-02 — P1 — L'envoi d'une liste ignore les notes et l'ordre visibles non enregistrés

**Statut : Confirmé code.** `removeItem`, `setNote` et `dropItem` changent seulement l'état local ; un bouton « Enregistrer » séparé persiste les lieux. `handleSend` appelle directement le service avec l'identifiant. Le serveur relit `get_list`. Preuves : `bertel-tourism-ui/src/views/ListComposeView.tsx:203`, `:225`, `:244`, `:413` ; `bertel-tourism-ui/src/services/lists.ts:434` ; `bertel-tourism-ui/src/app/api/lists/send/route.ts:56`.

**Déclencheur et impact :** retirer un lieu, changer une note ou réordonner, puis cliquer Envoyer sans Enregistrer. L'aperçu présente le brouillon ; l'e-mail utilise la version serveur précédente. Les métadonnées enregistrées au blur peuvent aussi être encore en vol lors de l'envoi.

**Correction :** faire de l'envoi une séquence persistée : sauvegarder et attendre toutes les modifications, puis rendre/envoyer la version confirmée. En cas d'échec, arrêter l'envoi et conserver le brouillon. Le même principe doit encadrer la publication d'un lien.

**Validation :** comparer notes, ordre et lieux de l'aperçu et du contenu produit après changement ; simuler une sauvegarde lente puis en échec ; aucun e-mail ne doit partir avec une version ambiguë. Utiliser SMTP de test.

### MET-03 — P2 — Des sauvegardes de liste échouent sans retour utilisateur

**Statut : Confirmé code.** `updateMeta` et `remove` n'ont pas de `onError` et leurs erreurs ne sont pas rendues. Le QueryClient ne fournit pas de gestionnaire global de mutations. Preuves : `bertel-tourism-ui/src/views/ListComposeView.tsx:123`, `:161`, `:283`, `:390` ; `bertel-tourism-ui/src/app/query-client.ts:16`.

**Déclencheur et impact :** refus réseau ou autorisation lors d'un renommage, changement d'introduction, modèle ou suppression. La valeur locale reste visible, suggérant une sauvegarde réussie ; un rechargement la fait disparaître. La désactivation du lien ferme également la modale immédiatement (`bertel-tourism-ui/src/views/ListComposeView.tsx:695`), même si elle échoue.

**Correction :** afficher attente/succès/erreur persistants, conserver une possibilité de réessai et ne fermer une action sensible qu'après réponse positive. Réconcilier état local et réponse confirmée.

**Validation :** injecter un refus sur chaque mutation et vérifier un message identifiable, un réessai possible et l'absence d'indication de succès.

### MET-04 — P2 — La composition de liste ne protège pas le travail non sauvegardé

**Statut : Confirmé code.** `dirtyItems` est calculé et utilisé pour le bouton de sauvegarde mais aucune garde de sortie n'est branchée dans cette vue. Preuves : `bertel-tourism-ui/src/views/ListComposeView.tsx:259`, `:276`, `:413`. La vue n'importe ni `useUnsavedDraftGuard`, ni mécanisme équivalent.

**Déclencheur et impact :** modifier plusieurs notes, revenir aux listes ou actualiser. Les notes disparaissent sans avertissement. Le mélange auto-enregistrement des métadonnées / enregistrement manuel des lieux rend cette perte difficile à anticiper.

**Correction :** adopter un contrat de sauvegarde cohérent, et protéger toute sortie tant que le brouillon diffère du serveur ; préciser l'état près des actions principales.

**Validation :** modification, navigation et fermeture d'onglet ; vérifier conservation ou confirmation explicite. Couvrir aussi l'échec et la sauvegarde en cours.

### MET-05 — P2 — Les modules Audits et Publications ne couvrent pas leur promesse métier en mode réel

**Statut : Confirmé code ; écart de couverture, pas panne.** `isDemoOnlyModule` renvoie vrai pour ces deux routes et le menu les filtre hors démo. Preuves : `bertel-tourism-ui/src/utils/features.ts:6`, `bertel-tourism-ui/src/config/nav-items.ts:61`, `bertel-tourism-ui/src/app/(main)/publications/page.tsx:35`.

**Impact :** une démonstration de collecte terrain ou de chaîne de publication ne constitue pas une fonctionnalité disponible aux équipes. Les fonctions Listes/export ne démontrent pas une chaîne Audits/Publications complète.

**Correction :** définir explicitement le périmètre livré et le niveau de maturité des modules dans les supports et la feuille de route. Pour les activer, livrer contrats, autorisations, états d'erreur et parcours métier validé.

**Validation :** matrice rôle × démo/réel documentée ; aucun bouton de maquette présenté comme opération persistée. Scénarios de bout en bout avant suppression du verrou démo.

## Recette métier prioritaire

| Scénario | Résultat attendu |
|---|---|
| Créer, enregistrer brouillon, rouvrir, publier une fiche autorisée | Valeurs persistées ; état de publication distinct. |
| Contributeur propose puis modérateur accepte/refuse | Proposition traçable, motif de refus conservé, résultat visible après actualisation. |
| Modifier deux modules avec un refus sur un seul | Succès partiel explicite ; module refusé toujours récupérable. |
| Liste avec notes et ordre modifiés, sauvegarde lente, envoi | Le contenu livré correspond à une version confirmée. |
| Liste dynamique après changement du corpus | Nombre et contenu reflètent le contrat de résolution et sa limite annoncée. |
| CRM : demande, tâche liée, assignation, clôture | Liens acteur/établissement conservés ; erreur de permission compréhensible. |
| Réseau coupé puis rétabli | Brouillons conservés ; états de panne distincts des états vides. |

Ces scénarios restent à exécuter avec des comptes et données de recette ; aucun succès distant n'est déduit de la présence de code ou de tests unitaires.
