# §10 Accessibilité — éditeur WYSIWYG Markdown pour la « description adaptée »

- **Date** : 2026-06-15
- **Section** : §10 Accessibilité (éditeur d'objet pleine page) + tiroir détail de l'Explorer
- **Statut** : conception validée (design approuvé par le PO le 2026-06-15), prête pour le plan d'implémentation

---

## 1. Contexte & problème

Le champ « Description adaptée » de §10 est aujourd'hui un simple `<Textarea>` (5 lignes) avec des
onglets de langue FR/EN/CRE ([`SectionAccessibility.tsx:116-153`](../../../bertel-tourism-ui/src/features/object-editor/sections/SectionAccessibility.tsx)).
Il stocke du **texte brut**.

Une description adaptée (accessibilité / Acceslibre / lecteurs d'écran, lisibilité type FALC) a besoin
d'une **structure** : titres, sous-titres, listes, mises en valeur. Le PO veut :

1. Un champ **compact** (pas un textarea toujours étalé) : un bouton **« Ajouter une description adaptée »**
   et une **modale** pour la rédiger / la modifier.
2. Un **format de stockage structuré** (Markdown) pour que le texte s'affiche **de façon identique**
   quelle que soit l'interface qui le consomme.
3. Un **éditeur WYSIWYG adapté aux non-techniciens** : on voit le rendu (taille des titres, gras, …)
   pendant la frappe ; **aucune syntaxe Markdown n'est exposée**.

## 2. Objectifs / non-objectifs

**Objectifs**
- Remplacer le textarea de §10 par un champ compact « aperçu + bouton → modale ».
- Éditer la description adaptée dans un **WYSIWYG** dont la sortie est du **Markdown**.
- Stocker du Markdown dans les colonnes texte **existantes** (aucun changement de schéma).
- Rendre ce Markdown **de façon sanitisée et identique** partout où la description adaptée s'affiche
  dans ce dépôt (le tiroir détail de l'Explorer).
- Conserver le **multilingue** (FR/EN/CRE) et le **gating de droits** (`canEditAdapted`) existants.

**Non-objectifs (différés, voir §10 du doc)**
- Appliquer le même éditeur aux descriptions principales §04.
- Le rendu sur un éventuel site public hors de ce dépôt.
- Une migration de données (inutile : voir §6, compatibilité ascendante).

## 3. État actuel (vérifié)

### 3.1 Modèle de données
`adaptedDescription` est un `WorkspaceTranslatableField` = `{ baseValue: string; values: Record<lang,string> }`
([`object-workspace-parser.ts:10-13` / `127`](../../../bertel-tourism-ui/src/services/object-workspace-parser.ts)).
Il se projette sur deux colonnes texte de `object_description` :
- `description_adapted` ← `baseValue`
- `description_adapted_i18n` (JSONB lang→texte) ← `values`

Payloads d'écriture : `buildObjectDescriptionPayload` (≈ ligne 5625) et `buildOrgDescriptionPayload`
(≈ ligne 5651) dans [`object-workspace.ts`](../../../bertel-tourism-ui/src/services/object-workspace.ts).
**Le contenu est aujourd'hui du texte brut** (ex. fixture `"Version adaptee du descriptif."`).

### 3.2 Éditeur (§10)
`<Textarea>` + `<LangTabs>`, gated par
`canEditAdapted = permissions.descriptions?.canEditCanonical ?? canDirectWrite ?? false`.
Chaque frappe écrit dans le module via `updateTranslatableField` + `editor.replaceModule('descriptions', …)`.
La persistance DB réelle est faite par la **barre de sauvegarde globale** de la page (pas par la section).

### 3.3 Côté affichage (read side)
Le **seul** consommateur de rendu dans ce dépôt est le tiroir détail :
`OverviewSection` dans [`ObjectDetailView.tsx:1175-1245`](../../../bertel-tourism-ui/src/features/object-drawer/ObjectDetailView.tsx)
affiche le texte adapté dans un `<p>` brut (`detail-overview__support`). Le texte adapté peut aussi
« remonter » dans `summary`/`fullText` par fallback (lignes 280-290).

### 3.4 Librairies présentes
`@radix-ui/react-dialog` (via le primitive `EditorModal`), `lucide-react`. **Aucune** librairie Markdown
ni éditeur riche. Next 16 / React 19.

## 4. Décisions de conception (verrouillées)

| Décision | Choix | Raison |
|---|---|---|
| Jeu de mise en forme | **Structure + liens** | Lisibilité/accessibilité sans alourdir |
| Périmètre de rendu | **Éditeur + affichage** | « affiché de manière identique » → on rend le Markdown dans le tiroir |
| Format de stockage | **Markdown** dans les colonnes texte existantes | Portable, ré-affichable à l'identique, aucun changement de schéma |
| Éditeur | **TipTap** (sérialisation Markdown), repli **Lexical** si souci React 19 | Barre d'outils propre, set contraint, très documenté |
| Rendu | **`markdown-to-jsx`** (`disableParsingRawHTML`), **sans** `dangerouslySetInnerHTML` | Pas de HTML brut → XSS-safe ; compatible `next/jest` sans bidouille `transformIgnorePatterns` (contrairement à react-markdown, ESM-only) |

### 4.1 Jeu de mise en forme (sous-ensemble Markdown autorisé)

| Bloc | Inline | Exclu volontairement |
|---|---|---|
| Paragraphe, **Titre** (H2), **Sous-titre** (H3), liste à puces, liste numérotée, citation (blockquote) | gras, italique, lien | H1 (réservé au nom de l'objet), images, tableaux, code, règle horizontale, couleurs, tailles de police libres, HTML brut |

- Les libellés de la barre sont **en clair** : « Titre » (= H2), « Sous-titre » (= H3) — pas de jargon « H2/H3 ».
- Les titres sont des **niveaux sémantiques** (utiles aux lecteurs d'écran) rendus visuellement plus
  grands dans l'éditeur **et** à l'affichage.
- Le sous-ensemble est du CommonMark standard → round-trip Markdown sans perte.

## 5. Architecture

Trois petites unités isolées, chacune avec une responsabilité unique et une interface claire.

### 5.1 `MarkdownContent` — rendu d'affichage (partagé)
- **Emplacement** : `bertel-tourism-ui/src/components/markdown/MarkdownContent.tsx` (+ `markdown.css`).
- **Props** : `{ markdown: string; className?: string }`.
- **Rôle** : transforme une chaîne Markdown en éléments React **sanitisés** via `markdown-to-jsx`
  (`disableParsingRawHTML: true` → le HTML brut éventuel est rendu comme texte, jamais exécuté ;
  **aucun** `dangerouslySetInnerHTML`). Restreint le rendu au sous-ensemble autorisé (mapping `overrides` :
  `h1→h2` par sécurité, liens en `rel="noopener noreferrer"` + schéma d'URL validé `http/https/mailto`,
  `img` retiré).
- **Source unique de vérité** du « à quoi ressemble une description adaptée ». Consommé par le tiroir
  et par la carte compacte de §10.

### 5.2 `MarkdownEditor` — éditeur WYSIWYG (chargé dynamiquement)
- **Emplacement** : `bertel-tourism-ui/src/components/markdown/MarkdownEditor.tsx` (client), exporté
  via un wrapper `next/dynamic({ ssr: false })` pour rester **hors du bundle initial** (ne pèse que
  quand la modale s'ouvre). Fallback de chargement léger.
- **Props** : `{ value: string; onChange: (markdown: string) => void; disabled?: boolean; ariaLabel: string; placeholder?: string }`.
- **Rôle** : TipTap (`StarterKit` restreint au sous-ensemble + `Link`) avec barre d'outils
  (Titre, Sous-titre, gras, italique, liste à puces, liste numérotée, citation, lien, annuler/rétablir).
  Entrée/sortie en **Markdown** (parse au montage / sérialise à chaque changement).
  Raccourcis clavier standards (Ctrl/Cmd+B, +I, +Z) et raccourcis Markdown (`## `, `**…**`) en bonus.
- **a11y** : zone éditable avec `aria-label` ; boutons de barre avec `aria-label` + `aria-pressed`
  (état actif) ; entièrement opérable au clavier.

### 5.3 `AdaptedDescriptionField` — UX « compact + modale » (§10)
- **Emplacement** : `bertel-tourism-ui/src/features/object-editor/widgets/AdaptedDescriptionField.tsx`.
- **Props** : `{ editor: SectionProps['editor']; descriptions: ObjectWorkspaceDescriptionsModule; objectScope: ObjectWorkspaceDescriptionScope; canEdit: boolean }`
  — même contrat que la section hôte. Le composant écrit lui-même via `editor.replaceModule('descriptions', …)`
  (pas de callback `onChange` remontant : on reproduit le pattern inline actuel de `SectionAccessibility`).
- **Rôle / états** :
  - **Vide** (aucune langue remplie) → « Aucune description adaptée » + bouton **« Ajouter une description adaptée »**.
  - **Renseignée** → carte compacte : aperçu rendu (`MarkdownContent`, tronqué) de la langue locale +
    puces des langues remplies (réutilise la logique `filled` des `langTabs`) + bouton **« Modifier »**.
  - **Lecture seule** (`!canEdit`) → aperçu seul, pas de bouton ; conserve le message
    « Lecture seule : vos droits ne permettent pas d'éditer la version par défaut (canonique). »
  - **Modale** (réutilise `EditorModal`) : `<LangTabs>` **dans** la modale + `MarkdownEditor` pour la
    langue active, édités sur un **brouillon local**. « Annuler » jette le brouillon ; « Enregistrer »
    applique le brouillon au module via `updateTranslatableField` + `editor.replaceModule('descriptions', …)`
    (commit **dans le formulaire** ; la sauvegarde DB reste la barre globale — cohérent avec tout l'éditeur).

### 5.4 Câblages
- **§10** : remplacer le bloc `Field`+`Textarea`+`LangTabs`
  ([`SectionAccessibility.tsx:116-153`](../../../bertel-tourism-ui/src/features/object-editor/sections/SectionAccessibility.tsx))
  par `<AdaptedDescriptionField …>`.
- **Tiroir** : dans `OverviewSection`, rendre le texte adapté via `<MarkdownContent>` au lieu d'un `<p>`.
  Gérer le cas fallback où l'adapté remonte dans `summary`/`fullText` : rendre via `MarkdownContent`
  uniquement le segment qui provient du champ adapté (les champs `description`/`chapo` restent du texte
  brut en `<p>` — ils ne sont pas du Markdown). Petit CSS `.md-content h2/h3/ul/ol/blockquote/a`.

## 6. Flux de données & compatibilité

```
DB (description_adapted + _i18n, texte=Markdown)
  └─ parser → adaptedDescription: WorkspaceTranslatableField (baseValue + values)
       └─ AdaptedDescriptionField (lit la langue active via readTranslatableField)
            └─ MarkdownEditor (value=md) → onChange(md)
                 └─ updateTranslatableField → editor.replaceModule('descriptions', …)
                      └─ buildObjectDescriptionPayload (INCHANGÉ — md n'est que du texte)
                           └─ upsertObjectDescription → DB
  └─ get_object_resource / detail-parser → OverviewSection → MarkdownContent (rendu)
```

**Compatibilité ascendante** : les lignes existantes contiennent du texte brut. Chargé dans l'éditeur,
ce texte devient un simple paragraphe ; ré-affiché par `MarkdownContent`, il s'affiche comme avant.
**Aucune migration nécessaire**, aucun changement de payload/RPC/schéma.

## 7. Sécurité

- **Jamais** de `dangerouslySetInnerHTML`. Rendu via `react-markdown` **sans** `rehype-raw`
  → tout HTML inline est traité comme du texte, jamais exécuté.
- Liens : schéma validé (`http`/`https`/`mailto`), `rel="noopener noreferrer"` ajouté au rendu.
- TipTap configuré pour **ne pas** accepter de HTML arbitraire collé (sortie Markdown contrainte).

## 8. Accessibilité

- Titres = niveaux sémantiques (H2/H3), jamais H1.
- Barre d'outils : boutons avec `aria-label` + `aria-pressed`, navigables au clavier.
- Zone éditable : `aria-label` explicite (« Description adaptée — <langue> »).
- Rendu : structure de titres correcte pour les lecteurs d'écran.
- Revue `a11y-architect` pendant l'implémentation.

## 9. Tests

- **`MarkdownContent`** (pur, prioritaire) : rend titres/gras/italique/listes/citations/liens ;
  **test XSS** : un Markdown contenant `<img src=x onerror=...>` / `<script>` est rendu comme **texte**,
  jamais exécuté ; les liens portent `rel="noopener noreferrer"` et un schéma sûr.
- **`AdaptedDescriptionField`** : vide → bouton « Ajouter » ; rempli → aperçu + « Modifier » + puces de
  langue ; ouverture de la modale ; « Enregistrer » commit le Markdown dans le module ; « Annuler » jette ;
  `!canEdit` masque le bouton et garde le message lecture seule ; bascule d'onglets de langue.
  Le `MarkdownEditor` est **mocké** (stub simple émettant `onChange`) pour éviter la fragilité
  ProseMirror-en-jsdom.
- **`MarkdownEditor`** : test de contrat léger (parse `value` → émet `onChange` en Markdown) ;
  round-trip du sous-ensemble si un helper pur est extractible.
- Suite FE complète verte + `tsc` propre avant de déclarer terminé.

## 10. Hors périmètre / différés

- Réutiliser `MarkdownEditor` pour les **descriptions principales §04** (architecture déjà réutilisable).
- Rendu Markdown sur un **site public** hors de ce dépôt (le contrat de stockage Markdown le permet déjà).
- `media.visibility` et autres sujets non liés.

## 11. Liste des changements (fichiers)

**Nouveaux**
- `bertel-tourism-ui/src/components/markdown/MarkdownContent.tsx` (+ `.test.tsx`)
- `bertel-tourism-ui/src/components/markdown/MarkdownEditor.tsx` (+ wrapper dynamique, + `.test.tsx`)
- `bertel-tourism-ui/src/components/markdown/markdown.css`
- `bertel-tourism-ui/src/features/object-editor/widgets/AdaptedDescriptionField.tsx` (+ `.test.tsx`)

**Modifiés**
- `bertel-tourism-ui/src/features/object-editor/sections/SectionAccessibility.tsx` (remplace le bloc textarea)
- `bertel-tourism-ui/src/features/object-drawer/ObjectDetailView.tsx` (`OverviewSection` → `MarkdownContent`)
- `bertel-tourism-ui/package.json` (deps : `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`,
  `tiptap-markdown` ; `markdown-to-jsx`)

**Inchangés** (vérifiés) : schéma DB, RPCs, `buildObjectDescriptionPayload`/`buildOrgDescriptionPayload`,
`updateTranslatableField`/`readTranslatableField`.
