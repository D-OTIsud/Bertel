# Refonte UI/UX Bertel — Plan global par phases

> Objectif : combler **toutes** les lacunes relevées par l'audit du 2026-06-22
> ([../research/ui-ux-audit-2026-06-22.md](../research/ui-ux-audit-2026-06-22.md)), avec pour
> **chaque action** un modèle visuel haute-fidélité à valider (et non un simple wireframe) plus
> la description fonctionnelle complète.

## Comment valider

Chaque implémentation est un fichier `mockups/*.html` **autonome** : ouvrez-le dans un navigateur
(double-clic). Il contient en haut le **visuel à valider** (vraies couleurs/typo Bertel) et en bas le
bloc **Fonctionnalités** (données, états, fichiers impactés, critères d'acceptation). Tous les fichiers
partagent `assets/bertel-ui.css` = le **design system corrigé** (focus visible, contraste relevé,
surfaces plates, `prefers-reduced-motion`) : valider ce fichier, c'est valider la fondation.

## Structure des livrables

```
docs/design/ui-ux-overhaul/
  00-plan-global.md              ← ce fichier
  phase-1-fondations.md          ← un fichier global PAR phase
  phase-2-taxonomie.md
  phase-3-explorer.md
  phase-4-drawer.md
  phase-5-dashboard-crm.md
  phase-6-editeur.md
  assets/bertel-ui.css           ← design system de validation (partagé)
  mockups/*.html                 ← un fichier PAR implémentation (visuel + fonctionnalités)
```

## Les 6 phases

| Phase | Objectif | Lacunes couvertes (audit) | Implémentations | Effort |
|---|---|---|---|---|
| **1 — Fondations** | Dette a11y / perf / thème, base réutilisable | S1, S4, S5, S6, S7, S8 | 1.1 Design system · 1.2 États vides & skeletons | M |
| **2 — Taxonomie & libellés** | Une seule taxonomie type→famille, fin des codes bruts | §2a, S2 | 2.1 Taxonomie unifiée + résolveur de libellés | S |
| **3 — Découverte (Explorer)** | Rendre la recherche *type-aware* | §2b carte, buckets lossy, S10, recall | 3.1 Carte résultat · 3.2 Barre de filtres · 3.3 Carte géo + erreurs | L |
| **4 — Présentation (Drawer)** | Une fiche correcte par type | §2c clones, FMA/RES/ASC/ITI | 4.1 Événement · 4.2 Restaurant · 4.3 Activité & Itinéraire | L |
| **5 — Dashboard / CRM / secondaires** | Hiérarchie, dé-modalisation, unification | S3, S9, CRM, stubs, login | 5.1 Dashboard · 5.2 CRM acteur · 5.3 Unification & stubs | L |
| **6 — Éditeur (polish)** | Priorité d'action, densité, nav, mobile | save-bar, §07/§16, nav, responsive | 6.1 Barre save · 6.2 Disclosure · 6.3 Nav & responsive | M |
| **7 — Paramètres (console admin)** | Hiérarchie/IA de `/settings`, Team intégré, référentiels éditables | S3 (AI providers), Settings non couvert ailleurs | 7.1 Hub & Mon compte · 7.2 Apparence & Marqueurs · 7.3 Fournisseurs IA · 7.4 Équipe · 7.5 Listes & référentiels | M/L |

## Cartographie lacune → action (couverture exhaustive)

| # Audit | Lacune | Action | Impl. |
|---|---|---|---|
| S1 | Pas de `:focus-visible` (sauf sidebar) ; `outline:none` non remplacés | Anneau focus global + nettoyage | 1.1 |
| S5 | Google Fonts `@import` bloquant + dégradé `fixed` repaint | `next/font` + fond non-fixed | 1.1 |
| S6 | 5 familles de tokens, doublons, ~234 hex en dur | Consolidation tokens | 1.1 |
| S7 | Contraste muted #66767d ≈4.44:1, #94a1a8 ≈2.97:1 | Relever les neutres texte | 1.1 |
| S8 | `prefers-reduced-motion` 3/35, easing bounce | Garde-fou motion global | 1.1 |
| S4 | États vide/chargement nus, n'enseignent pas | Composant état vide + skeletons | 1.2 |
| §2a | Deux taxonomies divergentes (Explorer ≠ éditeur) | Table type→famille unique | 2.1 |
| S2 | Codes bruts affichés comme libellés | Résolveur de libellés FR | 2.1 |
| §2b | Carte résultat type-aveugle | Créneau méta par archétype | 3.1 |
| recall | Pas de barre de filtres actifs, ville sans recherche, buckets fourre-tout | Barre filtres + recherche + sous-types | 3.2 |
| map | Marqueurs/clusters sans distinction de type, pas de légende | Marqueurs par type + légende | 3.3 |
| S10 | Crash plein écran sur erreur de requête | Reprise d'erreur inline + Réessayer | 3.3 |
| §2c | Drawer = 6 clones | Vue config-driven par archétype | 4.1–4.3 |
| FMA | Événement sans dates nulle part | Vue Événement (date phare + occurrences) | 4.1 |
| RES | Restaurant sans menu/cuisine | Vue Restaurant (cuisine + carte) | 4.2 |
| ASC/ITI | Activité générique, étapes ITI fabriquées | Vue Activité + Itinéraire (étapes réelles) | 4.3 |
| dead-ends | Contrôles « Modifier/Voir versions » sur surface read-only | Retirés / convertis en lien éditeur | 4.1–4.3 |
| S9 | Grille hero-metric 6×, widgets identiques | Bandeau résumé hiérarchisé + ventilation type | 5.1 |
| CRM | Modales lourdes, états vides nus | Éditeur acteur en drawer + états vides | 5.2 |
| S3 | Deux design systems (Team/RGPD ≠ reste) | Unification sur le vocabulaire maison | 5.3 |
| stubs | audits/moderation/publications « cassés » en prod | États honnêtes « lot à venir » | 5.3 |
| login | Texte debug public | Retrait + accents FR | 5.3 |
| save-bar | Publier en primaire, Enregistrer grisé | Re-priorisation Enregistrer/Publier | 6.1 |
| §07/§16 | Sections trop denses | Disclosure progressive | 6.2 |
| nav | Numéros non contigus, pas de focus/roving | Nav libellée + clavier | 6.3 |
| responsive | Éditeur non responsive, cibles 40px | Layout adaptatif + cibles 44px | 6.3 |
| ASC clobber | 2 contrôles sur 1 champ | 1 contrôle par champ | 6.2 |
| settings IA | `/settings` = 7 cartes plates égales, 3 publics mélangés, aucun endroit pour Team/référentiels | Console à rail groupé par périmètre | 7.1 |
| AI providers | Section stylée en `style={{}}` + classes `.btn`/`.pill-mini` non résolues (boutons natifs nus) | Portage vocabulaire maison | 7.1 |
| team home | `/team` route + entrée sidebar séparées | Team intégré dans Paramètres → Mon organisation | 7.1 |
| référentiels | Aucune UI pour éditer `ref_code` (SQL/seed only) | Éditeur maître/détail super-admin (RPC DEFINER) | 7.1 |

## Séquencement & dépendances

```
Phase 1 (fondations)  ──┬──► Phase 3 (Explorer)
                        ├──► Phase 4 (Drawer)
Phase 2 (taxonomie) ────┼──► Phase 3, 4, 5  (libellés + couleurs de type partout)
                        └──► Phase 5 (Dashboard/CRM)
Phase 6 (éditeur) : indépendant, peut démarrer en parallèle après Phase 1.
Phase 7 (paramètres) : après Phase 1 ; **absorbe le portage Team de la Phase 5.3** (S3) ⇒ faire 7.1 à la place du volet Team de 5.3. Le module « Listes & référentiels » est sa propre passe back-end+UI.
```

Règle : **Phase 1 et 2 d'abord** (fondation + taxonomie), car elles sont consommées par toutes les
autres. Phases 3/4/5 ensuite (chacune une PR), Phase 6 en parallèle. Recommandé : 1 → 2 → (3 ‖ 6) → 4 → 5 → 7.

## Critères de réussite globaux

- Audit technique impeccable : **8/20 → ≥ 16/20** (a11y et thème remontés).
- Nielsen moyen : **≈24/40 → ≥ 32/40**.
- Zéro code affiché brut comme libellé ; une seule taxonomie partagée Explorer ↔ éditeur ↔ drawer.
- Chaque type d'objet a une carte, une fiche et un éditeur cohérents (matrice §2b sans case rouge).
- `:focus-visible` sur tous les éléments interactifs ; `prefers-reduced-motion` respecté ; AA contraste.

## Index des implémentations

| Impl. | Fichier visuel | Phase |
|---|---|---|
| 1.1 Design system | [mockups/p1-01-design-system.html](mockups/p1-01-design-system.html) | 1 |
| 1.2 États vides & skeletons | [mockups/p1-02-etats-vides.html](mockups/p1-02-etats-vides.html) | 1 |
| 2.1 Taxonomie & libellés | [mockups/p2-01-taxonomie-libelles.html](mockups/p2-01-taxonomie-libelles.html) | 2 |
| 3.1 Carte résultat type-aware | [mockups/p3-01-carte-resultat.html](mockups/p3-01-carte-resultat.html) | 3 |
| 3.2 Barre de filtres & recherche | [mockups/p3-02-barre-filtres.html](mockups/p3-02-barre-filtres.html) | 3 |
| 3.3 Carte géo & reprise d'erreur | [mockups/p3-03-carte-geo.html](mockups/p3-03-carte-geo.html) | 3 |
| 4.1 Fiche Événement | [mockups/p4-01-detail-evenement.html](mockups/p4-01-detail-evenement.html) | 4 |
| 4.2 Fiche Restaurant | [mockups/p4-02-detail-restaurant.html](mockups/p4-02-detail-restaurant.html) | 4 |
| 4.3 Fiche Activité & Itinéraire | [mockups/p4-03-detail-activite-itineraire.html](mockups/p4-03-detail-activite-itineraire.html) | 4 |
| 5.1 Bandeau dashboard | [mockups/p5-01-dashboard.html](mockups/p5-01-dashboard.html) | 5 |
| 5.2 CRM acteur en drawer | [mockups/p5-02-crm-acteur.html](mockups/p5-02-crm-acteur.html) | 5 |
| 5.3 Unification & pages stub | [mockups/p5-03-unification.html](mockups/p5-03-unification.html) | 5 |
| 6.1 Barre d'enregistrement | [mockups/p6-01-barre-save.html](mockups/p6-01-barre-save.html) | 6 |
| 6.2 Sections en disclosure | [mockups/p6-02-sections-disclosure.html](mockups/p6-02-sections-disclosure.html) | 6 |
| 6.3 Nav éditeur & responsive | [mockups/p6-03-nav-responsive.html](mockups/p6-03-nav-responsive.html) | 6 |
| 7.1 Hub à rail & Mon compte | [mockups/p7-01-parametres-hub.html](mockups/p7-01-parametres-hub.html) | 7 |
| 7.2 Apparence (white-label) & Marqueurs | [mockups/p7-02-apparence-marqueurs.html](mockups/p7-02-apparence-marqueurs.html) | 7 |
| 7.3 Fournisseurs IA | [mockups/p7-03-fournisseurs-ia.html](mockups/p7-03-fournisseurs-ia.html) | 7 |
| 7.4 Équipe (Team intégré) | [mockups/p7-04-equipe.html](mockups/p7-04-equipe.html) | 7 |
| 7.5 Listes & référentiels (`ref_code`) | [mockups/p7-05-referentiels.html](mockups/p7-05-referentiels.html) | 7 |
