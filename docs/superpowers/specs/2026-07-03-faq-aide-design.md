# FAQ « Aide » — design (2026-07-03)

## Problème

Le bouton **Aide** du pied de la sidebar (`Sidebar.tsx`) est mort : aucun handler. Les agents OTI
n'ont aucune aide embarquée — notamment pour la question la plus coûteuse en support : « je veux
créer un artisan / un gîte / une randonnée… quel type de fiche choisir et pourquoi ? »
(ex. réel : artisan qui **anime des ateliers** = ACT « Activité encadrée » rattachée à un acteur
opérateur, vs commerce qui **vend de l'artisanat** sans le produire = COM + taxonomie artisanat).

## Décisions cadres (validées PO)

1. **Contenu dans le repo** — modules TS typés, réponses en Markdown ; pas de table DB, pas
   d'admin d'édition (une passe DB ultérieure reste possible si le besoin d'éditer sans deploy
   se confirme).
2. **Page `/aide`** — vraie page de centre d'aide (pas de modale/panneau) : volume de contenu
   important, lecture longue, ancres partageables.
3. **Couverture complète de l'app** dès le premier corpus (pas seulement la création d'objets).
4. **La recherche est le cœur de l'usage** : l'agent tape un mot métier (« artisan ») et tombe
   directement sur une réponse décisionnelle claire.

## Architecture

Feature autonome `bertel-tourism-ui/src/features/help/` :

```
features/help/
├── HelpPage.tsx           # la page /aide (client component)
├── faq-search.ts          # recherche pure (normalisation, préfixes, scoring)
├── faq-search.test.ts
├── content/
│   ├── types.ts           # FaqEntry, FaqRubrique (types + registre des rubriques)
│   ├── index.ts           # concat + export ALL_FAQ_ENTRIES (+ intégrité en test)
│   ├── demarrer.ts        # Démarrer & compte
│   ├── creer-objet.ts     # Créer un objet — 1 fiche par type (les 18)
│   ├── choisir-type.ts    # Choisir le bon type — arbitrages
│   ├── explorer.ts        # Explorer & filtres
│   ├── editeur.ts         # Éditer une fiche
│   ├── publication.ts     # Publication, cycle de vie & modération
│   ├── listes.ts          # Listes & impression
│   ├── crm.ts             # CRM
│   ├── equipe.ts          # Équipe, rôles & permissions
│   └── reglages.ts        # Réglages, branding & RGPD
└── content-integrity.test.ts
app/(main)/aide/page.tsx   # wrapper de route → HelpPage
```

### Modèle de contenu

```ts
export interface FaqEntry {
  id: string;               // slug stable, unique (ancre deep-link) ex. 'creer-artisan'
  rubrique: FaqRubriqueId;  // union fermée des rubriques
  question: string;         // formulation « voix de l'agent »
  answer: string;           // Markdown (sous-ensemble MarkdownContent : H2/H3, gras, listes…)
  keywords: string[];       // vocabulaire MÉTIER : ['artisan', 'artisanat', 'atelier', 'créateur'…]
  types?: string[];         // codes object_type concernés (badge + invariant de couverture)
}
```

Rendu des réponses par le `MarkdownContent` existant (§106) — aucun HTML serveur, aucun
`dangerouslySetInnerHTML`, aucun nouveau renderer.

### Recherche (`faq-search.ts`)

Fonction pure `searchFaq(entries, query): FaqEntry[]` :

- normalisation : minuscules + suppression des accents (NFD) des deux côtés ;
- tokenisation de la requête ; **correspondance par préfixe** (« artis » → artisan, artisanat) ;
- score pondéré : `keywords` (poids fort) > `question` > `answer` (poids faible) ;
  multi-tokens = ET (tous les tokens doivent matcher quelque part) ;
- tri par score décroissant, départage stable par rubrique puis id.

UI : input débouncé (~150 ms), résultats à plat toutes rubriques confondues dès qu'une requête
est active ; état vide « aucun résultat » avec suggestion de reformulation. Pas de moteur externe,
pas d'index précalculé : ~90 entrées, un scan linéaire suffit (`ponytail:` si un jour le corpus
dépasse ~500 entrées, précalculer les tokens par entrée).

### Page `/aide` (`HelpPage.tsx`)

- Barre de recherche en tête (autofocus), compteur de résultats.
- Sans recherche active : navigation par **chips de rubrique** sous la barre de recherche
  (style maison compact, tokens du thème, cartes bordées) ; questions en **accordéon**
  groupées par rubrique.
- Deep-links : `?question=<id>` ouvre l'entrée et scrolle dessus ; `?q=<texte>` préremplit la
  recherche. Même philosophie que `?fiche=` dans l'Explorer (URL = état partageable).
- Accessibilité : accordéon = `<details>/<summary>` ou boutons `aria-expanded`, focus visible
  (ring S1), navigation clavier.

### Navigation

- Le bouton Aide du footer sidebar devient un `Link` vers `/aide` avec état actif.
- `/aide` entre dans `NAV_ITEMS` (tous rôles) pour que la palette ⌘K le propose (D24 : registre
  unique) ; la boucle principale de la Sidebar exclut `/aide` (le footer le rend déjà) — une
  ligne commentée.

## Contenu — règles de rédaction

**Règle d'or : chaque réponse décrit le comportement réel vérifié** (code, decision log,
`type-gap-analysis-2026-06-11.md`, `guide-partenaires.md`). Rien d'inventé ; si une réponse
dépend d'une fonctionnalité non livrée, on ne la rédige pas.

**Gabarit fixe des fiches « Créer un objet »** (une par type, les 18 de `TYPE_ARCHETYPES` =
enum moins ORG) :

1. **C'est quoi** — définition en une phrase + exemples concrets du territoire ;
2. **Quand choisir ce type** (et quand NE PAS le choisir → renvoi `[[choisir-type]]`) ;
3. **Sous-catégorie** — quelle taxonomie/sous-catégorie renseigner et où ;
4. **Étapes dans l'app** — bouton Créer, type, nom, sections clés de l'éditeur à remplir ;
5. **Pièges** — les erreurs d'arbitrage connues.

**Rubrique « Choisir le bon type »** : les arbitrages documentés, rédigés en arbre de décision.
Cas obligatoires : artisan (vente seule → COM artisanat / ateliers encadrés → ACT + acteur
opérateur / les deux → deux fiches liées), HLO vs RVA, PCU vs LOI, PNA vs LOI, PRD (producteur
vs revendeur), FMA vs ACT (événement ponctuel vs prestation récurrente), marchés (règle §57),
ORG vs ACTOR (ne JAMAIS créer un ORG pour un prestataire commercial).

**Mots-clés métier obligatoires** sur chaque entrée : les mots que l'agent tape réellement
(« gîte », « chambre d'hôtes », « rando », « marché », « atelier », « food-truck »…), pas le
jargon du modèle (« HLO », « facette ») — les codes restent acceptés en plus.

Volume cible : ~70-90 entrées (18 création + ~8 arbitrages + le reste de l'app).

## Tests

1. **`faq-search.test.ts`** — normalisation accents, préfixe (« artis »), pondération
   (keyword bat answer), multi-tokens ET, requête vide → ordre rubrique.
2. **`content-integrity.test.ts`** — ids uniques et slug-safe, rubriques valides, question et
   answer non vides, keywords non vides, **chaque type de `TYPE_ARCHETYPES` couvert par au
   moins une entrée `types`** (un 19ᵉ type d'objet ne peut pas arriver sans sa fiche d'aide),
   Markdown des answers restreint au sous-ensemble supporté (pas de HTML brut).
3. **RTL `HelpPage.test.tsx`** — la recherche « artisan » remonte l'entrée arbitrage en tête ;
   `?question=` ouvre l'accordéon ; état vide.

## Hors périmètre (différés)

- Table DB + édition admin du contenu (si le besoin d'éditer sans deploy se confirme).
- Aide contextuelle par écran (bouton « ? » local ouvrant l'entrée pertinente) — la structure
  `?question=<id>` le prépare déjà.
- Captures d'écran/illustrations dans les réponses.
- i18n du contenu d'aide (FR uniquement, comme le reste du contenu éditorial au MVP).

---

## Implementation update (2026-07-12)

### Rubrique « Dashboard & modules » (`pilotage.ts`)

Nouvelle rubrique insérée après « Explorer & filtres » avec quatre entrées :
`dashboard-comprendre`, `dashboard-filtrer`, `dashboard-activite`, `modules-audits-publications`.
Les modules Audits et Publications sont documentés comme aperçus démo, pas produits finis.

### Métadonnées `routes` sur `FaqEntry`

Champ interne optionnel `routes?: string[]` (non rendu). Couverture minimale par module
navigable (hors `/aide` et modules `isDemoOnlyModule`). Vérifié par `content-integrity.test.ts`.

### Synchronisation URL bidirectionnelle

Helper pur `buildHelpUrl({ query, question })` — ordre stable `q` puis `question`, encodage
via `URLSearchParams`. La page synchronise :

- recherche → URL après debounce 150 ms (`router.replace`, pas `push`) ;
- URL → état (`query`, `debouncedQuery`, `openId`) sur changement de `useSearchParams` ;
- ouverture/fermeture d'une réponse en recherche préserve `q` ;
- `?question=` invalide : pas d'accordéon ouvert, nettoyage de l'URL.

### Liens « Voir aussi » avec filtre/recherche actifs

`openRelated` : valide l'id, efface recherche + filtre rubrique, `?question=<id>` seul,
scroll différé via `scrollTargetId` + `scrollIntoView` (respect `prefers-reduced-motion`).

### Accessibilité

- Chips rubrique : `aria-pressed` sur « Toutes » et chaque rubrique.
- Accordéon : `faq-question-<id>`, `faq-answer-<id>`, `aria-controls`, `role="region"`,
  `aria-labelledby`.

### Contenu Paramètres / branding / RGPD

- Libellé menu **Paramètres** (plus « Réglages ») dans les chemins utilisateur.
- `reglages-branding` = branding ORG (`Paramètres → Mon organisation → Apparence de l'organisation`).
- `reglages-branding-plateforme` = branding plateforme (super-admin).
- `rgpd-droits` = module RGPD du menu principal ; Mentions légales ≠ parcours d'effacement.

### Support et guide partenaires

`aide-contact` et `aide-partenaires` contiennent des liens actionnables (`https://`) ;
confirmation PO recommandée pour l'URL canonique du guide et l'e-mail support définitif.

### Correctifs de revue — 2026-07-13

- **Scroll routeur.** Tous les `router.replace` de `HelpPage` passent par l'unique
  fonction `replaceWithoutScroll` (`router.replace(url, { scroll: false })`) : ces
  navigations ne changent jamais de page, elles synchronisent l'état de l'aide dans
  l'URL — sans cette option Next.js peut repositionner la page et concurrencer le
  `scrollIntoView` explicite des liens « Voir aussi ».
- **Scroll différé sur changement d'URL.** L'effet URL → état pose désormais
  `setScrollTargetId(questionParam)` en plus de `setOpenId`, donc un `?question=`
  qui change après le montage (deep-link externe, navigateur) ouvre **et** fait
  défiler la cible, via le même mécanisme différé que le deep-link initial.
- **Libellé « Paramètres ».** La rubrique `reglages` affiche « Paramètres & RGPD »
  (l'identifiant interne `reglages` est inchangé — seul le libellé visible change).
- **Destinations approuvées centralisées** dans `content/links.ts` :
  - `BERTEL_SUPPORT_URL` = `mailto:d.philippe@otisud.com` — seul contact documenté
    dans le dépôt (référent RGPD/DPO publié dans `public/legal/cgu.md` et
    `public/legal/rgpd.md`, même contact que l'attribution des clés API dans
    `docs/guide-partenaires.md`). Remplace le lien générique vers la page d'accueil
    `https://www.otisud.re`.
  - `BERTEL_PARTNER_GUIDE_URL` = `https://doc.bertel.otisud.re/partenaires.html` —
    domaine du site docs déployé (Coolify, app « Docs site », voir mémoire
    `bertel-deploy-coolify`), page qui rend `docs/guide-partenaires.md` (§158).
  - Sources consignées ici faute de canal PO dédié dans ce dépôt ; à re-valider
    explicitement si un référent support distinct est désigné.
- **Public du guide partenaires clarifié.** `guide-partenaires.md` est sans ambiguïté
  un guide d'intégration API (clés `bk_live_…`, endpoints, DATAtourisme/Apidae/
  Tourinsoft) — aucun second guide socio-pro n'existe dans le dépôt. L'entrée
  `aide-partenaires` est reformulée pour cibler explicitement les intégrateurs
  techniques et agences web, et ne recommande plus de la transmettre aux gérants.
- **Tests renforcés.** `content-integrity.test.ts` vérifie désormais la présence de
  la valeur exacte de `BERTEL_SUPPORT_URL`/`BERTEL_PARTNER_GUIDE_URL` (et rejette
  explicitement `https://www.otisud.re` comme destination de support), plus la
  présence d'un chemin non racine pour le guide — la simple présence de `https://`
  ne suffit plus.
