# Audit ergonomie, navigation et adaptation mobile

Date : 5 septembre 2026. Référence : `5873ec69879e61ff34030d196c65f2eb0ac14de0`. Périmètre : navigation, découvrabilité, continuité des parcours, états d'interface et adaptation responsive. Le système visuel fait l'objet du document 17 ; l'accessibilité technique du document 10.

## Méthode et portée

Inspection statique des routes, composants et règles de rupture CSS après navigation `graphify query`, complétée par des observations CUA réelles de l'agent coordinateur sur l'application locale de démonstration au port 3095. Explorer a été observé à 1 280 × 720 px ; Explorer et CRM à 390 × 844 px, avec rechargement, puis au seuil de 768 px. Aucun test tactile matériel, lecteur d'écran ou mesure de temps de tâche n'a été exécuté. Les défauts marqués « Confirmé code » reposent sur des éléments effectivement masqués ou des chemins d'action précis ; les jugements de confort sont des hypothèses de recette, pas une étude utilisateur. P1 = tâche essentielle compromise ; P2 = friction significative ; P3 = amélioration. Aucun P0 identifié.

## Points solides

La navigation principale partage un registre de modules et signale la route active (`src/config/nav-items.ts:36`, `src/components/layout/Sidebar.tsx:91`). Un tiroir mobile et un lien d'évitement existent. L'Explorer conserve une position de liste et des paramètres d'URL. L'éditeur expose Enregistrer et Publier séparément. Le Dashboard propose un réessai au niveau du widget défaillant. Le centre d'aide possède un moteur de recherche et un compteur de résultats annoncé (`src/views/HelpPage.tsx:227`). Les chemins de ce paragraphe sont relatifs à `bertel-tourism-ui/`.

## Constats

### UX-07 — P1 — Le shell écrase toute l'application dans une colonne de 64 px sur téléphone

**Statut : Confirmé code et interface réelle locale. Priorité de traitement supérieure aux autres constats de ce document.** À 390 × 844 px, Explorer et CRM occupent une bande de 64 px à gauche ; le reste de l'écran reste vide. L'observation a été répétée après rechargement. Les mesures DOM par CUA donnent un shell de 390 px, `grid-template-columns: 64px 326px`, Sidebar `display: none`, et un header/main de 64 px. À 768 px, la Sidebar redevient visible et le main mesure 704 px.

**Cause et preuves :** `bertel-tourism-ui/src/styles.css:8138` conserve deux colonnes `var(--sidebar-w) minmax(0, 1fr)` ; la variable vaut 64 px (`:65`). Sous 768 px, la Sidebar est retirée du flux (`:13230`), mais la grille ne repasse pas à une colonne. Le viewport se place alors automatiquement dans la première colonne, restée à 64 px. La règle mobile du shell ne change que le padding (`:8616`). Structure correspondante : `bertel-tourism-ui/src/components/layout/AppShell.tsx:30`.

**Impact :** navigation, lecture et saisie deviennent pratiquement inutilisables sur téléphone, sur plusieurs modules. Ce défaut global masque les problèmes mobiles plus locaux UX-01 à UX-03 ; les corriger seuls ne suffit pas.

**Correction :** adapter la grille du shell au même breakpoint que le masquage de la Sidebar, ou positionner explicitement le viewport sur la totalité de la grille en mode mobile. Conserver une définition unique du seuil et supprimer les anciennes règles contradictoires.

**Validation :** à 320, 390, 760, 767 et 768 px, mesurer shell/viewport/header/main et vérifier que le contenu occupe la largeur disponible. Contrôler Explorer, CRM, Dashboard, Paramètres et éditeur après chargement direct et redimensionnement ; aucun formulaire ne doit rester dans une bande de 64 px.

### UX-01 — P2 — Les notifications et le tiroir profil perdent leur point d'accès mobile

**Statut : Confirmé code.** La Sidebar est masquée sous 768 px. Elle est l'unique composant recevant les actions d'ouverture du profil et des notifications ; le tiroir mobile ne rend que `visibleNavItems`. Preuves : `bertel-tourism-ui/src/styles.css:13230`, `bertel-tourism-ui/src/components/layout/AppShell.tsx:37`, `bertel-tourism-ui/src/components/layout/MobileNavDrawer.tsx:27`.

**Déclencheur / impact :** utiliser un téléphone avec une notification non lue. Le flux de notifications continue en arrière-plan mais sa boîte de réception n'a plus de commande d'ouverture. Le profil possède des informations accessibles ailleurs dans Paramètres, mais son tiroir dédié disparaît du parcours.

**Correction :** inclure Notifications avec compteur et Profil dans le menu mobile, ou conserver des actions dédiées dans la barre supérieure. Faire partager les mêmes callbacks et états que le bureau.

**Validation :** à 360, 390 et 767 px, ouvrir les deux tiroirs au tactile et au clavier ; lire une notification doit mettre à jour le compteur. À 768 px, vérifier une transition sans doublon déroutant.

### UX-02 — P2 — La composition mobile conserve les commandes d'aperçu mais masque tout l'aperçu

**Statut : Confirmé code.** Les commandes modèle/canal/langue restent rendues en haut, alors que la zone d'aperçu a `hidden ... lg:flex`. Preuves : `bertel-tourism-ui/src/views/ListComposeView.tsx:293`, `:627`.

**Déclencheur / impact :** composer sous le breakpoint `lg` (1 024 px par défaut), changer Carnet/Grille, Email/PDF/Lien ou FR/EN. Ces commandes n'offrent plus de résultat visuel immédiat ; l'utilisateur peut envoyer un document qu'il n'a pas pu contrôler dans l'application.

**Correction :** proposer Éditer/Aperçu sur petit écran ou une prévisualisation plein écran ; préserver la langue et le canal. Une commande dont le résultat est masqué doit ouvrir le panneau correspondant.

**Validation :** finaliser puis contrôler une liste en 390 px sans passer en mode bureau ; accéder à chaque modèle et canal, revenir au formulaire sans perdre la saisie.

### UX-03 — P2 — L'éditeur supprime son sommaire sur téléphone

**Statut : Confirmé code pour le masquage ; impact de temps de tâche à mesurer.** Sous 761 px `.edit-nav` est masqué sans sélecteur mobile dans la barre d'édition. Preuves : `bertel-tourism-ui/src/features/object-editor/object-editor.css:2321`, `bertel-tourism-ui/src/features/object-editor/shell/EditorTopbar.tsx:98`.

**Déclencheur / impact :** corriger une section éloignée dans une fiche longue. Le bureau offre un accès direct ; le téléphone impose une recherche par défilement, avec perte du repère de section. La navigation générale doit aussi passer par Retour à l'Explorer, puisque la TopBar est retirée dans l'éditeur (`src/components/layout/AppShell.tsx:42`).

**Correction :** conserver un sommaire compact « Aller à la section », avec section actuelle et anomalies. Préserver une action de navigation générale sans multiplier les lignes de la barre.

**Validation :** retrouver Contacts puis Tarifs puis Publication sur une longue fiche à 390 px ; mesurer nombre de gestes et temps, contrôler le maintien du contexte après une modale.

### UX-04 — P2 — L'avertissement de sortie demande de publier pour conserver le travail

**Statut : Confirmé code.** Le message dit « Publiez la fiche pour les enregistrer et les conserver », alors qu'Enregistrer persiste un brouillon indépendamment de Publier. Preuves : `bertel-tourism-ui/src/features/object-editor/useUnsavedDraftGuard.ts:5`, `bertel-tourism-ui/src/features/object-editor/ObjectEditPage.tsx:414`, `bertel-tourism-ui/src/features/object-editor/shell/EditorTopbar.tsx:185`.

**Impact :** confusion entre sauvegarde et diffusion ; risque d'inciter un agent à publier une fiche incomplète alors qu'il voulait uniquement la conserver. Pour un contributeur, l'action réelle est une proposition modérée.

**Correction :** faire porter l'alerte sur les modifications non enregistrées ; adapter le libellé à Enregistrer ou Proposer une modification. Un dialogue avec « Rester », « Enregistrer puis quitter » et « Quitter sans enregistrer » est une option à évaluer.

**Validation :** messages cohérents dans les modes éditeur/contributeur ; un brouillon enregistré peut être quitté sans publication.

### UX-05 — P2 — Une panne réseau du lien public est présentée comme un lien supprimé ou expiré

**Statut : Confirmé code.** La branche `.catch` produit le même état nul que l'absence de liste ; l'écran explique uniquement expiration, suppression ou désactivation et ne propose pas de réessai. Preuves : `bertel-tourism-ui/src/app/l/[token]/page.tsx:27`, `:41`, `:47`. La composition interne assimile aussi l'absence de données à une liste introuvable (`src/views/ListComposeView.tsx:183`).

**Déclencheur / impact :** ouvrir une sélection valide hors réseau ou pendant une indisponibilité. Le voyageur peut croire que sa sélection a été révoquée et contacter le conseiller inutilement.

**Correction :** distinguer états chargement, absence/expiration et erreur technique ; donner Réessayer sur une panne récupérable. Garder un message d'accès neutre pour un refus réellement indistinguable côté serveur.

**Validation :** simuler 404/indisponible, timeout et retour réseau ; vérifier textes distincts et reprise sans recharger manuellement tout l'onglet.

### UX-06 — P2 — L'aperçu e-mail ne représente pas exactement le contenu envoyé

**Statut : Confirmé code.** Le canal e-mail affiche `OtiTemplate` avec tous les items ; le serveur produit un autre rendu `renderListEmailHtml` limité aux quatre premières fiches. Preuves : `bertel-tourism-ui/src/views/ListComposeView.tsx:641`, `:649`, `bertel-tourism-ui/src/app/api/lists/send/route.ts:15`, `:76`, `:99`. L'en-tête d'aperçu utilise également un expéditeur et une heure de démonstration (`src/features/lists/ChannelFrame.tsx:25`, `:44`).

**Déclencheur / impact :** préparer une sélection de six lieux en canal Email. L'utilisateur approuve une composition exhaustive ; le destinataire reçoit quatre lieux puis un lien. La limitation peut être légitime, mais elle doit être visible avant envoi.

**Correction :** partager le modèle de rendu du véritable e-mail avec l'aperçu ou annoncer clairement la limite et visualiser les quatre premières fiches plus l'accès complet. Remplacer les métadonnées fictives par des exemples explicitement nommés ou les données configurées.

**Validation :** listes de 0, 1, 4 et 6 lieux ; comparer sujet, langue, ordre, nombre de fiches, CTA et identité d'expéditeur avec le message reçu dans une boîte de test.

## Grille de recette ergonomique

| Surface | Contrôle à effectuer | État de cet audit |
|---|---|---|
| Explorer bureau / mobile | Filtres, carte/liste, sélection et retour de fiche sans perdre sa place | Bureau observé ; blocage mobile global reproduit, voir UX-07. |
| Dashboard | Comprendre un KPI et rejoindre son sous-ensemble filtré | Sources lues ; compréhension utilisateur à mesurer. |
| CRM | Passer acteur → établissement → tâche et revenir avec contexte | Bureau observé ; blocage mobile global reproduit, voir UX-07. |
| Modération | Comprendre avant/après, annuler une approbation, corriger un motif | Sources lues ; différenciation visuelle à contrôler. |
| Paramètres / Équipe | Trouver l'administration et reconnaître son périmètre de rôle | Sources lues ; vérifier la redirection `/team`. |
| RGPD | Comprendre sujet, portée, anonymiser/supprimer et retour résultat | Lecture seule ; toute exécution exige une recette isolée. |
| Aide | Trouver une réponse par formulation métier et suivre son lien | Recherche et liens inspectés ; test avec utilisateurs à prévoir. |

Tester 320/390/768/1 024/1 440 px, zoom 200 % et clavier virtuel ouvert. Éviter de conclure à l'absence de débordement sur la seule présence de media queries. Les captures et essais visuels réalisés par l'audit global doivent compléter, sans remplacer, ces scénarios.
