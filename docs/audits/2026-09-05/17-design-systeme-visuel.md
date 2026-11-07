# Audit du design et du système visuel

Date : 5 septembre 2026. Référence : `5873ec69879e61ff34030d196c65f2eb0ac14de0`. Périmètre : hiérarchie de l'information, lisibilité des cartes, placement des commandes, identité de marque, cohérence des composants et couverture du système de design. Les parcours et le mobile sont traités dans le document 09 ; les critères d'accessibilité dans le document 10.

## Méthode et limites

Inspection de `styles.css`, tokens runtime, configuration Tailwind, composants et Storybook, après navigation Graphify. Cette inspection est complétée par les observations de l'agent coordinateur via CUA sur l'application locale en mode démonstration au port 3095 : Explorer à 1 280 × 720 px et CRM à 1 440 × 900 px. Les détails d'écran ci-dessous proviennent de ces observations réelles, pas d'une interprétation de maquettes. La configuration de marque et le corpus de production n'ont pas été inspectés visuellement.

« Observation confirmée » désigne un résultat vu dans ces conditions, corroboré par le code. « Risque confirmé code » désigne une divergence structurelle dont toutes les variantes visuelles n'ont pas été parcourues. « Heuristique » désigne un jugement de design argumenté à confronter aux tâches utilisateur, et non un défaut fonctionnel. P1 = obstacle majeur ; P2 = lisibilité/cohérence dégradée ; P3 = amélioration. Aucun P0 dans ce document. Le blocage global de mise en page mobile est un P1 confirmé, consigné sous UX-07.

## Forces du design actuel

L'Explorer bureau montre une identité reconnaissable : tonalités teal et neutres, rail d'icônes de 64 px, séparation lisible entre filtres, résultats et carte. Le CRM bureau possède des espacements réguliers, une hiérarchie claire entre indicateurs et annuaire, et une densité compatible avec un outil de travail.

Les fondations existent dans les sources : familles Manrope/Sora/IBM Plex Mono déclarées dans `bertel-tourism-ui/src/app/layout.tsx:11`, palette et espacements dans `src/styles.css:9`, accents par archétype dans `src/styles.css:115`, tokens de mouvement dans `src/styles.css:140`. Les icônes Lucide, les pastilles de type, les dialogues partagés et les états vides forment un vocabulaire réutilisable. Le CSS de l'éditeur est isolé sous `.object-editor`, ce qui réduit les fuites de styles (`src/features/object-editor/object-editor.css:1`). Les chemins abrégés de ce paragraphe sont relatifs à `bertel-tourism-ui/`.

## Constats

### DES-01 — P2 — Les noms des résultats sont sacrifiés au profit de l'image et du statut

**Statut : Observation confirmée et code.** En vue Split à 1 280 × 720 px, la colonne filtres occupe environ 296 px, les résultats 336 px et la carte 585 px. Plusieurs noms de démonstration sont réduits à « Bistr… », « Canyo… », « Festiv… », « Hôtel… ». La carte de résultat impose une image de 96 px, une colonne d'action de 28 px et des espacements fixes ; le titre tronqué partage sa ligne avec un statut `shrink-0`. Preuves : `bertel-tourism-ui/src/components/explorer/ResultCardView.tsx:324`, `:364`, `:372`.

**Impact métier :** le nom, principal élément d'identification, n'est plus reconnaissable sans ouvrir la fiche. La photo et la pastille restent pourtant visibles. Cette hiérarchie augmente le nombre d'ouvertures exploratoires et le risque de choisir la mauvaise fiche.

**Correction proposée :** donner au titre une largeur ou deux lignes garanties ; déplacer le statut sur une ligne secondaire ; réduire l'image dans la variante Split compacte. Évaluer aussi une largeur minimale ou réglable de la colonne résultats. Conserver les images plus grandes dans la vue dédiée aux cartes si elle le justifie.

**Validation :** à 1 024, 1 280 et 1 440 px, vérifier un corpus de noms courts, longs et similaires, avec et sans badge. L'utilisateur doit distinguer les établissements sans ouvrir chaque fiche ; aucun gain de densité ne doit supprimer le nom utile.

### DES-02 — P2 — Les outils centrés de la carte chevauchent le choix du fond

**Statut : Observation confirmée et code.** Dans Explorer Split à 1 280 × 720 px, la zone lasso/réinitialisation masque partiellement le libellé Plan, dont seules les dernières lettres restent visibles. Les outils sont positionnés absolument au centre du header ; le groupe Plan/Satellite/Topo est poussé à droite dans le même header. Le positionnement absolu ne lui réserve aucune place. Preuves : `bertel-tourism-ui/src/components/explorer/MapPanel.tsx:661`, `:673`, `:680`.

**Impact :** libellé tronqué par un autre contrôle, zones de clic concurrentes et aspect défectueux sur un écran de bureau courant. La navigation de carte devient difficile à comprendre.

**Correction proposée :** organiser titre, outils et choix de fond dans une grille ou un flex qui réserve leur largeur ; déplacer les outils dans une seconde rangée lorsque la carte devient étroite. Éviter un centrage absolu indépendant des groupes adjacents.

**Validation :** vérifier les rectangles et les cibles de clic sur des largeurs de carte de 320 à 700 px ; aucun chevauchement, libellés entiers et focus visible. Répéter avec zoom 200 %.

### DES-03 — P2 — Les changements de marque ne se propagent pas à tous les tokens d'interface

**Statut : Risque confirmé code ; variantes de marque à vérifier visuellement.** `applyThemeToDocument` applique `--theme-surface`, `--card` et `--panel-strong`, mais pas `--surface`, que le shell Tailwind consomme directement. `--surface`, `--ink-2`, `--ink-3`, `--surface-2` et `--bg-tint` conservent des valeurs statiques. Preuves : `bertel-tourism-ui/src/lib/theme.ts:124`, `:157`, `:179`, `bertel-tourism-ui/src/styles.css:25`, `:66`, `:71`, `bertel-tourism-ui/tailwind.config.js:16`.

**Déclencheur / impact :** changer fond, surface ou texte via Paramètres. Certains panneaux suivent la marque et d'autres gardent le blanc ou les couleurs secondaires initiales. L'application peut afficher plusieurs palettes simultanées ; une configuration sombre ne constitue notamment pas un thème sombre pris en charge.

**Correction proposée :** définir un petit contrat sémantique de tokens et faire dériver tous les alias consommés. Séparer les couleurs imposées par un archétype des couleurs réellement personnalisables. Prévisualiser les changements sur plusieurs composants, pas uniquement un échantillon de couleur.

**Validation :** comparer Explorer, CRM, éditeur, paramètres et Listes avec trois marques contrastées ; chaque surface et texte doit suivre le rôle de token annoncé. Mesurer les contrastes selon A11Y-06, sans supposer que cohérence de couleur implique lisibilité.

### DES-04 — P2 — Les aperçus de diffusion contiennent une identité OTI codée en dur

**Statut : Confirmé code ; incohérence visible sous une autre marque à vérifier.** `ChannelFrame` déclare par défaut `sejour@oti-sud.re`, affiche « OTI du Sud », une heure fixe 09:42, ainsi qu'un pied PDF OTI et `sud.reunion.fr`. L'appelant ne fournit pas de `senderEmail`. Preuves : `bertel-tourism-ui/src/features/lists/ChannelFrame.tsx:25`, `:38`, `:45`, `:81`, `bertel-tourism-ui/src/views/ListComposeView.tsx:634`.

**Impact :** l'aperçu mélange la marque produit/configurée et des coordonnées institutionnelles figées. Un utilisateur d'une autre organisation peut croire que le document ou le message sera envoyé sous la mauvaise identité. L'heure d'exemple n'est pas identifiée comme telle.

**Correction proposée :** alimenter le cadre d'aperçu depuis les données de marque et de diffusion autorisées, ou identifier explicitement les éléments de simulation. Utiliser une même source pour l'identité d'envoi réelle et celle affichée avant validation.

**Validation :** marque OTI puis marque alternative ; vérifier logo, nom, expéditeur, pied de page et lien sur les aperçus et les sorties produites. La différence entre aperçu et véritable e-mail est également décrite sous UX-06.

### DES-05 — P3 — Le CRM présente plusieurs actions primaires concurrentes

**Statut : Heuristique étayée par une observation bureau ; pas un bug.** À 1 440 × 900 px, « Nouvel acteur » apparaît à la fois dans la barre d'outils et dans un bouton flottant, tandis que « Créer une fiche » conserve une forte visibilité globale. Les deux boutons acteur déclenchent bien la même action. Preuves : `bertel-tourism-ui/src/features/crm/CrmAnnuaire.tsx:174`, `:303` ; la barre globale est rendue dans `src/components/layout/TopBar.tsx`.

**Jugement et impact potentiel :** la duplication peut être utile sur une longue liste, mais sur un écran court elle attire deux fois l'attention sur une même opération et concurrence l'action globale. Un nouvel utilisateur peut hésiter entre acteur et fiche, notions métier distinctes.

**Correction proposée :** vérifier quelle création est prioritaire dans le contexte CRM, réserver le bouton flottant aux situations où l'action de barre a quitté la zone visible, et expliciter acteur/établissement dans les libellés ou aides contextuelles. Ne pas supprimer une action utile sans essai métier.

**Validation :** faire créer un contact puis rattacher son établissement par des utilisateurs représentatifs ; mesurer erreurs de choix et hésitations. Comparer la version actuelle et une variante à un seul appel principal visible.

### DES-06 — P2 — Le catalogue visuel ne couvre pas les composants réellement livrés

**Statut : Confirmé dans l'inventaire du dépôt.** Storybook est configuré pour lire `src/**/*.stories.*` et `src/**/*.mdx`, mais aucun fichier `*.stories.*` n'a été trouvé sous `src` pendant l'audit. L'addon a11y existe et son paramètre vaut `test: 'todo'`. Preuves : `bertel-tourism-ui/.storybook/main.ts:4`, `bertel-tourism-ui/.storybook/preview.ts:8`. Les composants sont surtout vérifiés par tests React unitaires, qui ne prouvent pas la qualité de leur composition aux breakpoints.

**Impact :** des collisions comme DES-01/DES-02 ou le shell mobile UX-07 peuvent survivre malgré des tests logiques réussis. Les variantes chargement, erreur, contenu long et marque alternative n'ont pas de corpus visuel partagé démontré.

**Correction proposée :** constituer d'abord un catalogue court : bouton, champ, sélecteur, modale, carte résultat, barre carte, shell et états vides. Couvrir contenu long, permission limitée, petites largeurs et marques alternatives ; ajouter des captures de régression sur ces compositions à forte valeur.

**Validation :** ouvrir le catalogue, retrouver les composants utilisés en production et leurs états critiques ; reproduire puis empêcher la réapparition des trois défauts de composition observés. Le simple démarrage de Storybook ne constitue pas le critère de réussite.

## Observations complémentaires et revue à poursuivre

Le mode nommé Satellite affiche un fond vectoriel sur la configuration de démonstration observée. Le libellé est défini dans `bertel-tourism-ui/src/lib/map-style.ts:15`, alors que le défaut pointe vers le style Liberty (`src/lib/env.ts:15`). Il faut aligner nom et fond effectivement configuré, puis valider visuellement la configuration déployée ; cette observation ne prouve pas que la production utilise le même défaut.

La palette teal/neutre, les photos et les pastilles donnent une direction visuelle cohérente. La priorité n'est pas une refonte esthétique complète : elle est de rendre le shell mobile utilisable, préserver les noms d'établissements et empêcher les collisions de commandes, puis fiabiliser les tokens et les aperçus de diffusion. Une revue complémentaire doit couvrir des fiches chargées, la modération avant/après, une liste de six lieux, les états d'erreur et les paramètres sous deux marques.

Les constats de préférence visuelle restent séparés des blocages : DES-05 appelle un essai utilisateur ; DES-01 et DES-02 sont des pertes de lisibilité observées ; UX-07 est un défaut fonctionnel de mise en page reproduit.
