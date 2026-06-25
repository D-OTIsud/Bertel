# P3 · I1 — Champ « sujet » : résolution par nom/email + aperçu d'impact

**Lacunes comblées :** [P1] le sujet est un UUID brut, sans résolution ni aperçu ; [P2] hint dupliqué (placeholder + span) non associé.
**Phase :** 3 — Clarté : saisie & résultat.
**Type :** Frontend ; la résolution réutilise un RPC de recherche existant (`search_actors`) — à confirmer/étendre selon le `subjectKind`.

## 🎨 Modèle visuel à valider
**Ouvrir :** [`p3-i1-champ-sujet.html`](p3-i1-champ-sujet.html) — interactif : cliquer un résultat affiche le **sujet résolu** (identité + UUID rempli) et un **aperçu d'impact** ; « Changer » revient à la recherche.

---

## Fonctionnalités décrites

### Comportement
- Le champ « Identifiant du sujet » (UUID brut) est remplacé par une **recherche** : on tape un nom / e-mail, une liste de résultats s'affiche (avatar + nom + e-mail + type + UUID tronqué).
- Sélectionner un résultat **remplit l'identifiant** (UUID exact, jamais saisi à la main) et affiche une **carte « Sujet sélectionné »** : identité + UUID complet + bouton « Changer ».
- **Aperçu d'impact (lecture seule)** sous la carte : compteurs de ce qui sera touché (canaux, fiche CRM, avis, médias…). L'opérateur voit l'effet **avant** de confirmer — pas seulement après.
- **Repli expert** : lien « Je connais déjà l'identifiant (coller un UUID) » → bascule vers un champ mono avec **validation de format** (regex UUID v4) ; un UUID invalide bloque la soumission avec un message inline.
- **Hint unique** : la seule aide est le `<p id="subject-hint">`, associé via `aria-describedby`. Plus de doublon placeholder+span (le placeholder ne sert qu'à l'exemple de saisie).

### Accessibilité
- Combobox : `role="combobox"` + `aria-expanded` + `role="listbox"`/`option`, navigation flèches + Entrée, `aria-activedescendant`.
- `aria-describedby` du champ → hint ; la carte résolue est annoncée (`aria-live="polite"` : « Sujet sélectionné : Marie Hoarau »).
- L'aperçu d'impact est du texte (compteurs + libellés), lisible lecteur d'écran.

### Edge cases
- 0 résultat → « Aucun sujet trouvé pour « … ». Vérifiez l'orthographe ou collez l'UUID. »
- Aperçu indisponible (RPC échoue) → la carte reste, l'aperçu affiche « Impact non chargé » (non bloquant ; l'effacement reste possible).
- `subjectKind` sans recherche serveur (ex. `object_legal`) → bascule directe sur le mode « coller l'UUID » + validation.

---

## Spec d'implémentation

### Données
- `search_actors(query)` (existant, RETURNS gender+email — cf. décision log §95b) pour `subjectKind='actor'`.
- Aperçu d'impact : nouveau RPC **lecture seule** `api.rgpd_preview_subject(kind, id)` renvoyant des compteurs (canaux, CRM, avis, médias). À cadrer au plan d'implémentation (peut être livré après, l'aperçu étant non bloquant).
- Pour les `kind` sans recherche, conserver la saisie UUID + validation.

### Fichiers touchés
- `src/views/RgpdErasurePage.tsx` — remplacer le bloc `<label>Identifiant…` (113-122) par `<SubjectResolver kind onResolved={(id)=>setSubjectId(id)} />`.
- Nouveau `src/views/rgpd/SubjectResolver.tsx` (combobox + carte résolue + aperçu).
- `src/services/rgpd.ts` — ajouter `previewSubject()` si le RPC est livré.

### Tests (TDD)
- « taper un nom appelle la recherche et liste les résultats » ; « sélectionner remplit `subjectId` » ; « le mode UUID rejette un format invalide » ; « hint associé via aria-describedby » ; « 0 résultat affiche le repli UUID ».

### Critère d'acceptation
On peut cibler un sujet sans connaître l'UUID, voir son identité + l'impact avant l'action, et il n'y a qu'une seule aide, associée programmatiquement.
