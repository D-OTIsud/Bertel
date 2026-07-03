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
