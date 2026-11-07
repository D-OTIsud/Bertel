# Audit accessibilité et internationalisation

Date : 5 septembre 2026. Référence : `5873ec69879e61ff34030d196c65f2eb0ac14de0`. Périmètre : sémantique HTML/ARIA, clavier, langues de contenu, contrastes configurables et sélection de traduction.

## Méthode et limites

Audit statique ciblé après requête Graphify. Les critères sont vérifiés dans les pages officielles W3C consultées le 5 septembre 2026 ; le service de recherche web ayant répondu 401, ces pages ont été récupérées directement en HTTPS. Un ratio de contraste a été calculé à partir des couleurs déclarées, avec luminance relative sRGB. Il ne s'agit pas d'une déclaration de conformité WCAG ou RGAA : aucun parcours complet au lecteur d'écran, arbre d'accessibilité réel, test tactile ou audit réglementaire n'a été exécuté dans ce sous-audit.

P1 = fonctionnalité indisponible avec une modalité d'entrée ; P2 = obstacle local ou mauvaise restitution ; P3 = amélioration. Les points portant sur des couleurs par défaut ne certifient pas les couleurs réellement configurées en production. Aucun P0 identifié.

## Points solides

Le document principal déclare `lang="fr"` (`bertel-tourism-ui/src/app/layout.tsx:63`). Le shell comporte un lien d'évitement et un `<main>` ciblable (`src/components/layout/AppShell.tsx:33`). La modale commune nomme son dialogue, boucle Tab et restaure le focus (`src/components/common/Modal.tsx:129`). Les onglets Dashboard ont des panneaux reliés et des tests clavier ; plusieurs sélecteurs partagés exposent une combobox. Le CSS fournit un focus visible et réduit les animations selon les préférences système (`src/styles.css:212`, `:219`). Ces éléments sont des fondations utiles, pas une preuve de conformité de chaque écran. Les chemins abrégés de ce paragraphe sont relatifs à `bertel-tourism-ui/`.

## Constats

### A11Y-01 — P1 — Réordonner une liste exige un glisser-déposer

**Statut : Confirmé code.** Les lieux utilisent le drag natif sur `<li>` ; la poignée est un `<span aria-hidden>` et il n'existe pas de boutons monter/descendre ou de saisie de position. Preuve : `bertel-tourism-ui/src/views/ListComposeView.tsx:441` et `:461`.

**Déclencheur / impact :** vouloir déplacer le troisième lieu en première position au clavier, à la commande vocale ou avec un pointeur ne permettant pas un drag précis. La fonctionnalité n'est pas proposée par une alternative simple.

**Critère et correction :** proposer Monter/Descendre ou une position sélectionnable, utilisables aussi au simple clic ; annoncer la nouvelle position. Une alternative clavier seule ne suffit pas pour couvrir l'exigence de pointeur sans glissement. Voir [W3C — WCAG 2.2, 2.5.7 Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html).

**Validation :** réordonner tous les lieux sans drag, au clavier puis au simple clic ; focus conservé sur le lieu déplacé et ordre sauvegardé correct.

### A11Y-02 — P2 — Le contenu anglais n'expose pas sa langue au navigateur

**Statut : Confirmé code.** Le document demeure `lang="fr"`. La page publique et la racine de `OtiTemplate` passent `lang` comme prop métier, sans attribut HTML sur le contenu rendu. Preuves : `bertel-tourism-ui/src/app/layout.tsx:63`, `bertel-tourism-ui/src/app/l/[token]/page.tsx:59`, `bertel-tourism-ui/src/features/lists/OtiTemplate.tsx:515`.

**Déclencheur / impact :** ouvrir une liste anglaise ou son aperçu dans l'interface française. Le lecteur d'écran peut utiliser la prononciation française pour les textes anglais ; les outils de traduction n'ont pas un signal de langue fiable.

**Critère et correction :** poser la langue sur le conteneur du rendu et sur les passages de repli si nécessaire ; pour une page publique entièrement anglaise, envisager une langue de document appropriée. Voir [W3C — WCAG 3.1.2 Language of Parts](https://www.w3.org/WAI/WCAG22/Understanding/language-of-parts.html).

**Validation :** inspecter le DOM et écouter une sélection FR puis EN avec lecteur d'écran bilingue. L'aperçu EN dans le back-office FR doit garder des langues distinctes.

### A11Y-03 — P2 — Les libellés visibles des champs de liste ne sont pas associés aux contrôles

**Statut : Confirmé code.** « Destinataire » et « Mot d'introduction » sont des `<label>` séparés sans `htmlFor`, et les contrôles n'ont pas d'`id` correspondant. Les notes répètent un placeholder générique. Preuves : `bertel-tourism-ui/src/views/ListComposeView.tsx:386`, `:394`, `:481`.

**Impact :** la relation visuelle champ/libellé n'est pas encodée ; cliquer le libellé n'active pas le champ. Une liste de plusieurs champs « Note » ne restitue pas clairement le lieu concerné. Un placeholder peut servir de repli de nom dans certains navigateurs, mais il ne rétablit pas cette relation et disparaît à la saisie.

**Critère et correction :** `id`/`htmlFor` stables, noms contextuels tels que « Note pour … » et consignes reliées par `aria-describedby`. Voir [W3C — WCAG 1.3.1 Info and Relationships](https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html).

**Validation :** activation des champs par clic sur leurs libellés ; noms et consignes distincts dans l'arbre accessible, même lorsque les champs sont remplis.

### A11Y-04 — P2 — L'état sélectionné des langues et modes n'est que visuel

**Statut : Confirmé code.** `LangTabs` différencie la langue active par `className="is-on"`, sans `aria-pressed`, `aria-selected` ou rôle d'onglet. Même logique sur les modes Rapide/Complet et les sélecteurs de canal/aperçu. Preuves : `bertel-tourism-ui/src/features/object-editor/primitives/LangTabs.tsx:13`, `bertel-tourism-ui/src/features/object-editor/shell/EditorTopbar.tsx:120`, `bertel-tourism-ui/src/views/ListComposeView.tsx:309`.

**Impact :** les boutons restent actionnables au clavier mais leur sélection n'est pas annoncée, ce qui rend ambiguë la langue en cours d'édition.

**Critère et correction :** choisir un modèle cohérent : boutons `aria-pressed`, ou onglets complets avec `tablist`, `tab`, `tabpanel`, `aria-selected` et navigation attendue. Voir [W3C — WCAG 4.1.2 Name, Role, Value](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html).

**Validation :** entendre la langue et le mode sélectionnés avant/après activation ; état accessible synchronisé à l'état visuel et au contenu.

### A11Y-05 — P2 — Le blanc sur l'orange par défaut n'atteint pas le contraste du texte

**Statut : Confirmé code et calcul pour le thème par défaut ; rendu/configuration live à vérifier.** « Enregistrer » dans la liste utilise du texte blanc 12 px sur `bg-orange`. Le token est `--accent-brand`, initialisé à `#F28B54`. Preuves : `bertel-tourism-ui/src/views/ListComposeView.tsx:418`, `bertel-tourism-ui/tailwind.config.js:38`, `bertel-tourism-ui/src/lib/theme.ts:23`. Ratio calculé de `#FFFFFF` sur `#F28B54` : **2,44:1**.

**Impact :** lecture difficile pour des utilisateurs malvoyants ou sous fort éclairage. Le ratio est inférieur à 4,5:1 pour le texte courant, et même à 3:1 pour le grand texte. Voir [W3C — WCAG 1.4.3 Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

**Correction :** distinguer couleur décorative et couleur de bouton ; utiliser une paire premier plan/fond mesurée, par exemple un texte foncé adéquat ou un orange plus sombre. Contrôler aussi les boutons de sélection Explorer reprenant la même paire.

**Validation :** mesurer les styles calculés dans les états normal, survol et actif ; atteindre 4,5:1 sur les libellés concernés sans supprimer le caractère distinct de l'action primaire.

### A11Y-06 — P2 — Le branding accepte des paires de couleurs illisibles

**Statut : Risque confirmé par le contrat de validation ; aucune configuration de production jugée ici.** Le schéma contrôle le format hexadécimal, sans rapport entre texte et fond. `applyThemeToDocument` applique directement les couleurs puis calcule des mélanges. Preuves : `bertel-tourism-ui/src/lib/schemas/settings-theme.ts:3`, `bertel-tourism-ui/src/lib/theme.ts:104`, `:143`.

**Déclencheur / impact :** enregistrer texte et fond identiques ou très proches. Un thème techniquement valide peut rendre une partie de l'application illisible ; les couleurs secondaires dérivées peuvent aussi échouer.

**Correction :** présenter un diagnostic de contraste sur les paires sémantiques réellement utilisées, signaler les problèmes avant sauvegarde et conserver un retour au thème lisible. Le choix automatique du texte des boutons ne doit pas se limiter à un seuil de luminance arbitraire.

**Validation :** blanc/blanc, sombre/sombre, teinte saturée et thème par défaut ; tous les textes d'action doivent rester mesurables selon [WCAG 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

### A11Y-07 — P2 — Le titre anglais d'une liste ne peut pas être édité depuis la composition

**Statut : Confirmé code ; périmètre d'internationalisation.** Le modèle prévoit `name_en`, le rendu EN privilégie `nameEn`, mais le seul champ titre sauvegarde `{ name }` quelle que soit la langue. Preuves : `bertel-tourism-ui/src/services/lists.ts:119`, `bertel-tourism-ui/src/views/ListComposeView.tsx:264`, `:280`.

**Déclencheur / impact :** passer l'édition en anglais et vouloir traduire le titre. Le titre canonique est modifié ; si un `nameEn` existait déjà, l'aperçu EN continue d'afficher l'ancien titre sans moyen de le corriger ici.

**Correction :** rendre explicite le titre de chaque langue, avec repli et provenance visibles ; persister `name_en` pour la variante EN et `name` pour FR.

**Validation :** liste avec/sans titre EN, traduction puis retour FR ; les deux titres restent distincts après sauvegarde et correspondent au rendu public.

## Contrôles complémentaires nécessaires

Tester clavier et lecteur d'écran sur Explorer/carte, modales empilées, upload média, formulaires longs, tableaux CRM et RGPD. Mesurer zoom/reflow, ordre de lecture, contraste non textuel et tailles de cibles sur les styles calculés. Vérifier que les descriptions touristiques dans une langue de repli portent une langue HTML adaptée. Le back-office contient beaucoup de français codé en dur : il ne faut pas présenter la préférence de langue des données comme une traduction intégrale de l'interface.

Storybook est configuré mais aucun fichier `*.stories.*` n'a été trouvé sous `src` ; son paramètre a11y vaut `test: 'todo'` (`bertel-tourism-ui/.storybook/preview.ts:8`). Le simple ajout de l'addon ne prouve donc pas une couverture accessible des écrans. Constituer un corpus de composants et ajouter des essais automatisés ciblés aux parcours manuels.
