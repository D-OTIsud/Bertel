# Centre d’aide — plan de corrections après revue

**Date :** 2026-07-13  
**Destinataire :** interne chargé de terminer la correction du centre d’aide  
**Zone du projet :** `bertel-tourism-ui/src/features/help/` et `bertel-tourism-ui/src/views/HelpPage.tsx`  
**Durée estimée :** 1,5 à 2 jours, hors attente de validation des liens par le PO

## 1. Objectif

Le centre d’aide a déjà reçu une première série d’améliorations. Les tests ciblés et le contrôle TypeScript passent, mais la revue finale a identifié plusieurs problèmes qui doivent être corrigés avant approbation :

1. Les changements de paramètres URL utilisent le comportement de défilement par défaut de Next.js. Cela peut déplacer la page alors que seul l’état local de l’aide change.
2. Lorsqu’un nouveau paramètre `?question=` arrive après le montage de la page, la bonne réponse s’ouvre, mais la page ne défile pas jusqu’à elle.
3. Le lien présenté comme « support » pointe vers la page d’accueil générale de l’OTI et non vers un canal de support direct.
4. L’entrée « guide partenaires » mélange deux publics différents : les socio-professionnels et les intégrateurs techniques de l’API.
5. Le dernier libellé visible « Réglages & RGPD » ne correspond pas au nom réel du module, « Paramètres ».
6. Le build de production n’a pas encore été validé : la tentative de revue a dépassé 184 secondes.
7. Le worktree contient des fichiers étrangers ou temporaires qui ne doivent pas entrer dans les commits de cette correction.

Ce document doit être suivi dans l’ordre. Ne pas commencer par modifier le contenu avant d’avoir sécurisé le périmètre Git et obtenu les destinations officielles auprès du PO.

## 2. Règles de travail

- Ne pas modifier le moteur de recherche `faq-search.ts` sauf pour ajouter un test de corpus lié au guide partenaires.
- Ne pas changer les identifiants stables des entrées FAQ existantes, sauf décision explicite du PO.
- Ne pas employer `git add .`.
- Ne pas supprimer un fichier non suivi sans avoir confirmé qu’il a été créé par cette tâche.
- Ne pas inventer une adresse de support ou une URL publique.
- Ne pas présenter une fonctionnalité de démonstration comme disponible en production.
- Écrire ou modifier les tests avant de considérer un correctif comme terminé.
- À la fin, exécuter `graphify update .` conformément aux instructions du projet.

## 3. Phase 0 — Sécuriser le périmètre Git

### 3.1 Se placer à la racine

```powershell
Set-Location C:\Users\dphil\Bertel3.0
Get-Location
```

Le chemin affiché doit être :

```text
C:\Users\dphil\Bertel3.0
```

### 3.2 Examiner le worktree

```powershell
git status --short
```

Le worktree contient déjà plusieurs éléments qui ne font pas partie de ce plan. Les éléments suivants sont notamment suspects ou hors périmètre :

```text
.impeccable/
bash.exe.stackdump
bertel-tourism-ui/src/app/oti-demo/
bertel-tourism-ui/src/features/object-drawer/__tmp_charcode.test.ts
docs/ai-slop-audit-2026-07-01.md
docs/ai-slop-frontend-audit-2026-07-01.md
docs/security-audit-2026-07-01.md
supabase/functions/
```

Procédure obligatoire :

1. Demander au responsable si ces fichiers appartiennent à une autre tâche.
2. S’ils appartiennent à une autre tâche, les laisser intacts et non indexés.
3. S’ils ont été créés accidentellement pendant le travail sur l’aide, demander confirmation avant de les supprimer.
4. Ne jamais inclure `bash.exe.stackdump` dans un commit.
5. Ne pas restaurer ni écraser les changements existants des autres développeurs.

### 3.3 Liste normale des fichiers de cette correction

Cette tâche doit normalement modifier uniquement :

```text
bertel-tourism-ui/src/views/HelpPage.tsx
bertel-tourism-ui/src/views/HelpPage.test.tsx
bertel-tourism-ui/src/features/help/content/types.ts
bertel-tourism-ui/src/features/help/content/types.test.ts
bertel-tourism-ui/src/features/help/content/reglages.ts
bertel-tourism-ui/src/features/help/content-integrity.test.ts
bertel-tourism-ui/src/features/help/faq-search.corpus.test.ts
bertel-tourism-ui/src/features/help/content/links.ts
docs/superpowers/specs/2026-07-03-faq-aide-design.md
```

Le fichier `content/links.ts` est nouveau et sert à centraliser les destinations approuvées.

Ne pas modifier dans cette tâche :

```text
docs/index.html
docs/openapi.json
docs/guide-partenaires.md
```

sauf demande explicite du responsable.

## 4. Phase 1 — Établir le point de départ

### 4.1 Vérifier Node et les dépendances

```powershell
Set-Location C:\Users\dphil\Bertel3.0\bertel-tourism-ui
node --version
```

Node doit être en version 20 ou supérieure.

Si `jest` ou `tsc` est introuvable :

```powershell
npm ci
```

### 4.2 Exécuter les tests ciblés actuels

```powershell
npm run test:run -- --runInBand `
  src/views/HelpPage.test.tsx `
  src/features/help/help-url.test.ts `
  src/features/help/faq-search.test.ts `
  src/features/help/faq-search.corpus.test.ts `
  src/features/help/content-integrity.test.ts `
  src/features/help/content/types.test.ts
```

La revue précédente a obtenu :

```text
6 suites réussies
57 tests réussis
```

Si la situation a changé, noter les erreurs avant de modifier le code. Ne pas attribuer automatiquement une erreur préexistante à cette tâche.

### 4.3 Exécuter TypeScript

```powershell
npm run typecheck
```

Le contrôle doit réussir sans erreur avant et après les corrections.

## 5. Phase 2 — Désactiver le défilement géré par le routeur

### 5.1 Problème à résoudre

Dans `src/views/HelpPage.tsx`, les changements de recherche et de question utilisent actuellement :

```ts
router.replace(url);
```

Ces navigations ne changent pas réellement de page. Elles synchronisent seulement l’état de l’aide dans l’URL. Elles doivent donc utiliser :

```ts
router.replace(url, { scroll: false });
```

Sans cette option, Next.js peut repositionner la page. Il peut aussi concurrencer le `scrollIntoView` explicite utilisé par les liens « Voir aussi ».

### 5.2 Mettre les tests à jour avant le code

Fichier : `src/views/HelpPage.test.tsx`.

Toutes les attentes portant sur `replace` doivent vérifier le second argument.

Avant :

```ts
expect(replace).toHaveBeenCalledWith('/aide?q=artisan');
```

Après :

```ts
expect(replace).toHaveBeenCalledWith('/aide?q=artisan', { scroll: false });
```

Appliquer cette modification aux scénarios suivants :

- recherche après debounce ;
- ouverture d’une question ;
- fermeture d’une question ;
- nettoyage d’un ID de question inconnu ;
- lien « Voir aussi » depuis une rubrique ;
- lien « Voir aussi » depuis une recherche.

Exécuter le test. Il doit échouer tant que le code de production n’est pas corrigé :

```powershell
npm run test:run -- --runInBand src/views/HelpPage.test.tsx
```

### 5.3 Ajouter une fonction locale unique

Dans `HelpPage`, créer un seul point d’appel au routeur :

```ts
function replaceWithoutScroll(url: string) {
  router.replace(url, { scroll: false });
}
```

Ensuite, remplacer tous les appels directs à `router.replace` par cette fonction, notamment :

- le nettoyage d’un `question` invalide ;
- l’effet qui synchronise la recherche vers l’URL ;
- la fonction locale `replaceHelpUrl`.

### 5.4 Vérifier qu’il ne reste aucun appel direct dispersé

```powershell
rg -n "router\.replace" src/views/HelpPage.tsx
```

Résultat attendu : un seul appel, dans `replaceWithoutScroll`.

### 5.5 Critères d’acceptation

- Chaque remplacement d’URL utilise `{ scroll: false }`.
- Les tests vérifient explicitement cette option.
- Aucun `router.push` n’est introduit.
- Le mécanisme reste basé sur `replace`, afin de ne pas remplir l’historique à chaque frappe.

## 6. Phase 3 — Faire défiler une question reçue depuis l’URL

### 6.1 Problème à résoudre

Le chargement initial fonctionne, car `scrollTargetId` est initialisé avec la question présente dans l’URL.

En revanche, un changement postérieur de :

```text
/aide?question=choisir-artisan
```

vers :

```text
/aide?question=creer-com
```

met uniquement `openId` à jour. La question commerce s’ouvre, mais elle peut rester hors écran.

### 6.2 Ajouter un test de régression avant le correctif

Dans `HelpPage.test.tsx`, ajouter un test qui :

1. initialise `searchParams` avec `question=choisir-artisan` ;
2. rend `HelpPage` ;
3. vide le mock `scrollIntoView` ;
4. remplace `searchParams` par `question=creer-com` ;
5. appelle `rerender(<HelpPage />)` ;
6. vérifie que la question commerce est ouverte ;
7. vérifie que `scrollIntoView` a été appelé.

Exemple :

```ts
test('un changement URL vers une autre question ouvre et scrolle la cible', () => {
  searchParams = new URLSearchParams('question=choisir-artisan');
  const { rerender } = render(<HelpPage />);

  scrollIntoView.mockClear();

  searchParams = new URLSearchParams('question=creer-com');
  rerender(<HelpPage />);

  expect(
    screen.getByRole('button', { name: /Comment créer un commerce/ }),
  ).toHaveAttribute('aria-expanded', 'true');

  expect(scrollIntoView).toHaveBeenCalled();
});
```

Si React signale qu’une mise à jour n’est pas enveloppée, utiliser `act` autour du changement et du `rerender`.

Le test doit échouer avant le correctif.

### 6.3 Corriger la synchronisation URL vers état

Dans l’effet URL → état, la branche valide contient actuellement l’équivalent de :

```ts
if (questionParam && ENTRY_BY_ID.has(questionParam)) {
  setOpenId(questionParam);
}
```

Ajouter le scroll différé :

```ts
if (questionParam && ENTRY_BY_ID.has(questionParam)) {
  setOpenId(questionParam);
  setScrollTargetId(questionParam);
}
```

Ne pas appeler `scrollIntoView` directement ici. Le mécanisme différé existant doit rester l’unique endroit qui réalise le défilement.

### 6.4 Vérifier les scénarios existants

Les scénarios suivants doivent toujours passer :

- deep-link initial ;
- ouverture et fermeture manuelles ;
- recherche avec `q` ;
- lien « Voir aussi » depuis une rubrique filtrée ;
- lien « Voir aussi » depuis la recherche ;
- ID de question inconnu.

### 6.5 Critères d’acceptation

- Un nouveau `questionParam` valide ouvre la cible.
- Le scroll différé est déclenché.
- Une question inconnue ne déclenche aucun scroll.
- Le défilement respecte toujours `prefers-reduced-motion`.
- Le routeur ne peut plus concurrencer ce scroll grâce à la phase précédente.

## 7. Phase 4 — Utiliser le libellé « Paramètres » partout

### 7.1 Modifier le registre des rubriques

Fichier : `src/features/help/content/types.ts`.

Avant :

```ts
{ id: 'reglages', label: 'Réglages & RGPD' },
```

Après :

```ts
{ id: 'reglages', label: 'Paramètres & RGPD' },
```

Ne pas renommer l’identifiant interne `reglages`. Seul le libellé visible change.

### 7.2 Ajouter un test précis

Dans `src/features/help/content/types.test.ts` :

```ts
test('la rubrique réglages utilise le libellé visible Paramètres', () => {
  expect(
    FAQ_RUBRIQUES.find((rubrique) => rubrique.id === 'reglages')?.label,
  ).toBe('Paramètres & RGPD');
});
```

### 7.3 Rechercher les anciens chemins visibles

```powershell
rg -n "Réglages →|des Réglages|dans les Réglages|Direction \*\*Réglages" `
  src/features/help/content
```

Résultat attendu : aucune instruction utilisateur pointant vers un menu nommé « Réglages ».

Les commentaires techniques peuvent employer « réglage » au sens commun, mais pas les chemins de navigation visibles.

## 8. Phase 5 — Obtenir les destinations officielles auprès du PO

Cette phase est bloquante. Ne pas inventer de valeur de remplacement.

### 8.1 Questions à envoyer au PO

Envoyer exactement les questions suivantes :

1. « Quelle est la destination officielle du support Bertel : adresse e-mail, formulaire ou URL de ticket ? »
2. « Quelle est l’URL HTTPS publique canonique de la page partenaires une fois déployée ? »
3. « Le guide partenaires API est-il destiné uniquement aux intégrateurs techniques, ou existe-t-il un second guide pour les gérants et exploitants ? »

### 8.2 Ce qui n’est pas acceptable

Ne pas utiliser comme solution finale :

```text
https://www.otisud.re
```

Cette URL est une page d’accueil générale. Elle ne garantit pas un accès direct :

- au support Bertel ;
- à un formulaire de contact ;
- au guide partenaires ;
- à la documentation API.

### 8.3 Consigner la validation

Ajouter dans la description de la PR :

```text
Liens validés par : <nom>
Date : <date>
Support : <URL ou mailto>
Guide partenaires : <URL HTTPS canonique>
Public du guide : <intégrateurs / socio-pros / autre>
```

## 9. Phase 6 — Centraliser les destinations approuvées

### 9.1 Créer le fichier

Créer :

```text
src/features/help/content/links.ts
```

Structure attendue :

```ts
/**
 * Destinations éditoriales approuvées par le PO.
 * Ne pas les remplacer par la page d’accueil générique de l’OTI.
 */
export const BERTEL_SUPPORT_URL = '<valeur approuvée>';

export const BERTEL_PARTNER_GUIDE_URL = '<valeur HTTPS approuvée>';
```

Ne pas copier littéralement les valeurs d’exemple.

### 9.2 Protocoles autorisés

`MarkdownContent` autorise uniquement les liens commençant par :

```text
https:
mailto:
```

Le support peut donc être un `mailto:` ou une URL HTTPS.

Le guide doit être une URL HTTPS absolue. Un lien relatif comme `partenaires.html` serait neutralisé par le renderer Markdown sécurisé.

### 9.3 Importer les constantes

Dans `content/reglages.ts` :

```ts
import {
  BERTEL_PARTNER_GUIDE_URL,
  BERTEL_SUPPORT_URL,
} from './links';
```

Utiliser ensuite ces constantes dans les template strings Markdown.

## 10. Phase 7 — Corriger le lien de support

### 10.1 Remplacer la destination générique

Dans l’entrée `aide-contact`, remplacer le lien vers la page d’accueil par la destination approuvée :

```ts
answer: `... [contacter le support](${BERTEL_SUPPORT_URL}).`,
```

Adapter le libellé au type de destination :

- si c’est un e-mail : « écrire au support Bertel » ;
- si c’est un formulaire : « ouvrir le formulaire de support Bertel » ;
- si c’est un outil de tickets : « ouvrir une demande de support ».

Ne pas écrire « contacter le support » si le lien mène seulement à une page d’accueil.

### 10.2 Renforcer le test d’intégrité

Le test actuel accepte n’importe quelle URL HTTPS. Il faut vérifier la destination approuvée.

Importer `BERTEL_SUPPORT_URL`, puis ajouter :

```ts
expect(entryById('aide-contact').answer).toContain(BERTEL_SUPPORT_URL);
expect(BERTEL_SUPPORT_URL).toMatch(/^(mailto:|https:\/\/)/);
expect(BERTEL_SUPPORT_URL).not.toMatch(
  /^https:\/\/(www\.)?otisud\.re\/?$/,
);
```

Le test ne doit plus être satisfait par la simple présence de `https://`.

### 10.3 Critères d’acceptation

- Le lien ouvre directement un canal de support.
- La destination a été validée par le PO.
- Le test vérifie la valeur approuvée.
- La page d’accueil générique ne peut plus faire passer le test.

## 11. Phase 8 — Corriger le guide partenaires et son public

### 11.1 Comprendre le contenu existant

Le fichier `docs/guide-partenaires.md` est un guide d’intégration API. Il traite notamment :

- de clés `bk_live_…` ;
- d’appels serveur-à-serveur ;
- de limites de débit ;
- de DATAtourisme, Apidae et Tourinsoft ;
- d’endpoints HTTP.

Il s’adresse donc à des intégrateurs techniques, agences web ou plateformes SIT. Il ne répond pas à la question d’un gérant souhaitant comprendre l’affichage de sa fiche côté visiteur.

### 11.2 Choisir le scénario selon la réponse du PO

#### Scénario A — Seul le guide API existe

Renommer la question en :

```ts
question: 'Un guide pour les partenaires techniques et intégrateurs ?',
```

Adapter les mots-clés :

```ts
keywords: [
  'guide',
  'partenaire',
  'documentation',
  'api',
  'intégrateur',
  'agence web',
  'datatourisme',
  'apidae',
  'tourinsoft',
],
```

Réécrire la réponse pour indiquer explicitement :

- que le guide documente l’API publique ;
- qu’il s’adresse aux intégrateurs, agences web et plateformes SIT ;
- qu’il explique l’authentification, les endpoints et la synchronisation ;
- qu’il ne s’agit pas d’un guide utilisateur pour les gérants.

Supprimer la phrase qui recommande actuellement de transmettre ce guide aux gérants et exploitants pour comprendre leur fiche côté visiteur.

Ajouter le lien direct :

```md
[ouvrir le guide partenaires](${BERTEL_PARTNER_GUIDE_URL})
```

#### Scénario B — Un guide socio-pro existe aussi

Conserver l’entrée actuelle pour le véritable guide socio-pro et lui donner son URL propre.

Créer une seconde entrée, par exemple :

```text
aide-partenaires-api
```

pour la documentation technique.

Ne pas fusionner les deux publics dans une seule réponse.

### 11.3 Renforcer le test d’intégrité

Importer `BERTEL_PARTNER_GUIDE_URL` et ajouter :

```ts
expect(entryById('aide-partenaires').answer).toContain(
  BERTEL_PARTNER_GUIDE_URL,
);

expect(BERTEL_PARTNER_GUIDE_URL).toMatch(/^https:\/\//);

const guideUrl = new URL(BERTEL_PARTNER_GUIDE_URL);
expect(guideUrl.pathname).not.toBe('/');
```

Ce dernier contrôle interdit une simple page d’accueil.

### 11.4 Ajouter un test de recherche

Dans `faq-search.corpus.test.ts`, pour le scénario A :

```ts
test('« intégrateur » trouve le guide partenaires API', () => {
  expect(topIds('intégrateur')).toContain('aide-partenaires');
});

test('« api partenaire » trouve le guide partenaires API', () => {
  expect(topIds('api partenaire', 5)).toContain('aide-partenaires');
});
```

### 11.5 Critères d’acceptation

- La question correspond au véritable public du guide.
- Le lien ouvre directement la page canonique.
- Le texte ne recommande plus un guide technique aux gérants.
- La recherche métier retrouve l’entrée avec « intégrateur » et « API partenaire ».

## 12. Phase 9 — Mettre à jour la spécification

Modifier :

```text
docs/superpowers/specs/2026-07-03-faq-aide-design.md
```

Ajouter une sous-section :

```md
### Correctifs de revue — 2026-07-13
```

Documenter :

- l’utilisation de `{ scroll: false }` sur les remplacements d’URL ;
- le scroll différé lors d’un changement URL vers une question valide ;
- le nouveau libellé « Paramètres & RGPD » ;
- la destination de support approuvée ;
- la destination canonique du guide partenaires ;
- le public exact de ce guide ;
- le renforcement des tests d’intégrité.

La section actuelle indique que la confirmation PO est « recommandée ». Après cette tâche, elle doit être réellement obtenue et consignée.

## 13. Phase 10 — Validations automatisées

### 13.1 Tests ciblés

```powershell
Set-Location C:\Users\dphil\Bertel3.0\bertel-tourism-ui

npm run test:run -- --runInBand `
  src/views/HelpPage.test.tsx `
  src/features/help/help-url.test.ts `
  src/features/help/faq-search.test.ts `
  src/features/help/faq-search.corpus.test.ts `
  src/features/help/content-integrity.test.ts `
  src/features/help/content/types.test.ts
```

Résultat attendu :

- toutes les suites réussissent ;
- le nombre total de tests est supérieur à 57, car de nouveaux tests ont été ajoutés.

### 13.2 TypeScript

```powershell
npm run typecheck
```

Résultat attendu : aucune erreur.

### 13.3 Vérifier le diff

```powershell
Set-Location C:\Users\dphil\Bertel3.0
git diff --check
```

Résultat attendu : aucun marqueur de conflit, aucune erreur d’espace.

Afficher ensuite uniquement le périmètre de cette tâche :

```powershell
git diff -- `
  bertel-tourism-ui/src/views/HelpPage.tsx `
  bertel-tourism-ui/src/views/HelpPage.test.tsx `
  bertel-tourism-ui/src/features/help/content/types.ts `
  bertel-tourism-ui/src/features/help/content/types.test.ts `
  bertel-tourism-ui/src/features/help/content/reglages.ts `
  bertel-tourism-ui/src/features/help/content/links.ts `
  bertel-tourism-ui/src/features/help/content-integrity.test.ts `
  bertel-tourism-ui/src/features/help/faq-search.corpus.test.ts `
  docs/superpowers/specs/2026-07-03-faq-aide-design.md
```

Relire ligne par ligne avant de préparer les commits.

### 13.4 Build de production

```powershell
Set-Location C:\Users\dphil\Bertel3.0\bertel-tourism-ui
npm run build
```

Laisser jusqu’à 10 minutes.

Le build n’est validé que si la commande se termine avec un code de sortie 0.

Si le build reste bloqué :

1. noter la dernière sortie visible ;
2. vérifier qu’un autre processus Next n’exécute pas déjà un build ;
3. transmettre les informations au responsable ;
4. ne pas déclarer la tâche terminée ;
5. ne pas supprimer `.next` ou d’autres caches sans accord, car le workspace est partagé.

## 14. Phase 11 — Vérification manuelle

Démarrer l’application :

```powershell
npm run dev
```

Ouvrir `/aide` et réaliser tous les scénarios suivants.

### 14.1 Recherche et URL

1. Saisir `artisan`.
2. Attendre plus de 150 ms.
3. Vérifier que l’URL devient `/aide?q=artisan`.
4. Vérifier qu’il n’y a pas de déplacement inattendu de la page.

### 14.2 Ouverture et fermeture

1. Ouvrir une réponse.
2. Vérifier que `question=` apparaît dans l’URL.
3. Fermer la réponse.
4. Vérifier que `question=` disparaît.
5. Vérifier que `q=` reste présent si une recherche est active.
6. Vérifier que la page ne remonte pas brutalement.

### 14.3 Lien « Voir aussi »

1. Sélectionner « Choisir le bon type ».
2. Ouvrir la question artisan.
3. Cliquer sur « Comment créer un commerce ? ».
4. Vérifier que le filtre revient sur « Toutes ».
5. Vérifier que la question commerce est ouverte.
6. Vérifier que la page défile jusqu’à elle.
7. Vérifier que l’URL devient `/aide?question=creer-com`.

### 14.4 Changement URL vers une nouvelle question

Tester successivement :

```text
/aide?question=choisir-artisan
/aide?question=creer-com
```

La seconde question doit être ouverte et visible dans le viewport.

### 14.5 Question inconnue

Ouvrir :

```text
/aide?question=unknown-id
```

Vérifier :

- aucune erreur JavaScript ;
- aucune réponse ouverte ;
- URL nettoyée ;
- aucun scroll vers un élément inexistant.

### 14.6 Libellé Paramètres

Le chip doit afficher :

```text
Paramètres & RGPD
```

et non :

```text
Réglages & RGPD
```

### 14.7 Support

1. Ouvrir « Je ne trouve pas ma réponse ici ? ».
2. Cliquer sur le lien de support.
3. Vérifier qu’il ouvre directement le canal approuvé.
4. Vérifier qu’il ne mène pas simplement à la page d’accueil de l’OTI.

### 14.8 Guide partenaires

1. Rechercher `intégrateur`.
2. Ouvrir l’entrée du guide partenaires.
3. Vérifier que le texte décrit le bon public.
4. Cliquer sur le lien.
5. Vérifier qu’il ouvre directement la page canonique du guide.

## 15. Phase 12 — Mettre à jour le graphe

Après les modifications :

```powershell
Set-Location C:\Users\dphil\Bertel3.0
graphify update .
```

La commande doit réussir. Les fichiers modifiés dans `graphify-out` sont attendus.

## 16. Phase 13 — Préparer des commits propres

Préparer idéalement trois commits.

### Commit 1 — Navigation et défilement

Fichiers :

```text
bertel-tourism-ui/src/views/HelpPage.tsx
bertel-tourism-ui/src/views/HelpPage.test.tsx
```

Message recommandé :

```text
fix(help): preserve scroll during URL state changes
```

### Commit 2 — Contenu, libellés et destinations

Fichiers :

```text
bertel-tourism-ui/src/features/help/content/types.ts
bertel-tourism-ui/src/features/help/content/types.test.ts
bertel-tourism-ui/src/features/help/content/reglages.ts
bertel-tourism-ui/src/features/help/content/links.ts
bertel-tourism-ui/src/features/help/content-integrity.test.ts
bertel-tourism-ui/src/features/help/faq-search.corpus.test.ts
```

Message recommandé :

```text
fix(help): correct settings labels and support links
```

### Commit 3 — Documentation

Fichier :

```text
docs/superpowers/specs/2026-07-03-faq-aide-design.md
```

Message recommandé :

```text
docs(help): record review corrections
```

### Indexation

Indexer chaque groupe de fichiers explicitement :

```powershell
git add -- <liste exacte des fichiers>
```

Avant chaque commit :

```powershell
git diff --cached --stat
git diff --cached
```

Vérifier qu’aucun fichier temporaire ou étranger n’est indexé.

## 17. Définition de terminé

La tâche est terminée uniquement lorsque toutes les conditions suivantes sont vraies :

- [ ] Tous les `router.replace` de `HelpPage` utilisent `{ scroll: false }`.
- [ ] Un changement post-montage de `?question=` ouvre et fait défiler la cible.
- [ ] Le scroll « Voir aussi » n’est plus concurrencé par le routeur.
- [ ] La rubrique visible s’appelle « Paramètres & RGPD ».
- [ ] Le support pointe vers une destination directe et approuvée.
- [ ] Le guide partenaires pointe vers son URL HTTPS canonique.
- [ ] Le texte du guide correspond à son véritable public.
- [ ] Les tests vérifient les URL approuvées, et non seulement la présence de `https://`.
- [ ] Les nouveaux cas de scroll et de changement URL sont couverts par des tests.
- [ ] Tous les tests ciblés réussissent.
- [ ] `npm run typecheck` réussit.
- [ ] `npm run build` se termine réellement avec un code 0.
- [ ] `git diff --check` ne signale rien.
- [ ] Aucun fichier temporaire ou étranger n’entre dans les commits.
- [ ] La spécification du centre d’aide est actualisée.
- [ ] La validation du PO est consignée dans la PR.
- [ ] `graphify update .` a été exécuté avec succès.

