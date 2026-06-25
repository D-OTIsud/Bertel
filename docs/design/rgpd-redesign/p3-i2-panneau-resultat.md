# P3 · I2 — Panneau de résultat structuré

**Lacune comblée :** [P2] `JSON.stringify(report)` brut comme seul résultat lisible.
**Phase :** 3 — Clarté : saisie & résultat.
**Type :** Frontend-only (consomme `ErasureResult` tel quel).

## 🎨 Modèle visuel à valider
**Ouvrir :** [`p3-i2-panneau-resultat.html`](p3-i2-panneau-resultat.html) — en-tête succès, récap chiffré, lignes clé/valeur, chip d'avertissement, JSON brut replié dans « Détail technique ».

---

## Fonctionnalités décrites

### Comportement
- Le panneau de résultat (166-184) devient un **récap lisible** :
  - **En-tête** : pastille ✓ verte + titre (« Sujet anonymisé » / « Sujet supprimé ») + sous-titre (« Opération tracée au registre des effacements · date »).
  - **Stats** : 3 métriques (lignes anonymisées/supprimées, fichiers supprimés, compte traité) dérivées de `result.report` + `result.storageDeleted.length` + `result.authUserDeleted`.
  - **Lignes clé/valeur** : Sujet (label + identité), Identifiant (mono), Mode, Journal d'audit (« PII purgée »).
  - **Alertes** : `storageError` / `authError` rendus en chips `warn`/`danger` (réutilise le `Callout` de P2) — fini le `text-orange` à 2:1.
- **JSON brut conservé** dans un `<details>` « Détail technique (rapport JSON) » — escape hatch pour l'audit, plus le seul affichage.

### Accessibilité
- Conteneur `role="status"` + `aria-live="polite"` : le résultat est annoncé à l'achèvement (aujourd'hui seul le toast `sonner` l'annonce).
- `<summary>` en `ink-3` autorisé (élément de contrôle, pas du corps), mais ≥ 4.5:1 vérifié ; chevron rotatif.
- Couleur de succès doublée d'une icône ✓ et d'un libellé.

### États
| Cas | Rendu |
|---|---|
| Succès net | en-tête vert, récap, pas d'alerte |
| Succès + avertissement stockage | + chip `warn` |
| Succès + échec compte auth | + chip `danger` (action manuelle requise) |

---

## Spec d'implémentation

### Fichiers touchés
- `src/views/RgpdErasurePage.tsx` — remplacer le bloc `{result && (…)}` par `<ErasureResultPanel result={result} mode={…} subjectLabel={…} />`.
- Nouveau `src/views/rgpd/ErasureResultPanel.tsx` (présentational pur).
- Réutilise `Callout` (P2-I1) pour les alertes.

### Mapping données (depuis `ErasureResult`)
- `rows` : depuis `result.report` (clés `rows_anonymized` / `rows_deleted` selon le RPC).
- `fichiers supprimés` : `result.storageDeleted.length`.
- `compte traité` : `result.authUserDeleted`.
- alertes : `result.storageError`, `result.authError`.
- JSON : `result.report` (inchangé, dans `<details>`).

### Tests (TDD)
- « rend le titre selon le mode » ; « les stats reflètent storageDeleted / authUserDeleted » ; « storageError rend une chip warn » ; « authError rend une chip danger » ; « le JSON brut reste présent dans details ».

### Critère d'acceptation
Le résultat est lisible sans JSON ; les avertissements sont des chips contrastées ; le rapport brut reste disponible en repli ; l'achèvement est annoncé aux lecteurs d'écran.
