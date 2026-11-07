# Phase 7 — Paramètres : console d'administration

> Fichier **global de phase**. Comble **toutes** les lacunes relevées par l'audit de `/settings`
> ([../settings-page-design-audit-2026-06-23.md](../settings-page-design-audit-2026-06-23.md)).
> Chaque implémentation a son **fichier-maquette autonome** (visuel haute-fidélité + fonctionnalités) :
> ouvrez-le dans un navigateur (double-clic). Tous partagent `assets/bertel-ui.css` (design system corrigé).

## Problème (rappel de l'audit)

`/settings` (`src/views/SettingsPage.tsx`) = **défilement plat de 7 cartes identiques** (rayon 32px) mélangeant
trois publics (préférences perso, admin d'organisation, réglages plateforme), sans hiérarchie ni routage.
Scores : Nielsen **24/40**, technique **11/20**. Conséquences : ~80 contrôles d'un coup pour un super-admin ;
un lecteur fait défiler ~60 contrôles désactivés ; et **aucun endroit cohérent** pour Équipe ni les référentiels.

Bug réel (P0) : `AiProviderSettings.tsx` utilise `.btn` / `.pill-mini`, classes qui n'existent qu'au scope
`.crm-app` → **boutons natifs nus** sur `/settings`. Plus : libellé « Settings » (EN) vs « Parametres »
(sans accent) partout ailleurs.

## Solution — `/settings` devient une console à rail groupé par périmètre

Rail de sections, **un panneau visible à la fois** (divulgation progressive), chaque groupe rendu selon le rôle :

- **Mon compte** (tout le monde) : Préférences (langue) · Session & rôle (carte d'état lisible).
- **Mon organisation** (admin ORG, rang ≥ 10) : **Équipe**.
- **Plateforme** (super-admin) : Apparence · Marqueurs · **Listes & référentiels** (nouveau) · Fournisseurs IA · Diagnostic.

## Implémentations (un fichier-maquette chacune)

| Impl. | Titre | Maquette (visuel + specs) | Lacunes d'audit couvertes | Effort |
|---|---|---|---|---|
| **7.1** | Hub à rail & « Mon compte » | [mockups/p7-01-parametres-hub.html](mockups/p7-01-parametres-hub.html) | P1 IA (cartes plates), P2 Runtime/jargon, label split EN/FR, accents, échelle de rayon, `:focus-visible` | M |
| **7.2** | Apparence (white-label) & Marqueurs | [mockups/p7-02-apparence-marqueurs.html](mockups/p7-02-apparence-marqueurs.html) | P2 mur de ~50 contrôles marqueurs (divulgation progressive), thème/rayon | M |
| **7.3** | Fournisseurs IA | [mockups/p7-03-fournisseurs-ia.html](mockups/p7-03-fournisseurs-ia.html) | **P0 boutons nus**, P1 actions destructives sans confirmation, split de vocabulaire (inline styles) | S |
| **7.4** | Équipe (Team intégré) | [mockups/p7-04-equipe.html](mockups/p7-04-equipe.html) | « Team a sa place ici » (PO), S3 (deux design systems), entrée sidebar `/team` | M |
| **7.5** | Listes & référentiels (`ref_code`) | [mockups/p7-05-referentiels.html](mockups/p7-05-referentiels.html) | « l'admin règle les listes de refcodes » (PO) — aucune UI aujourd'hui (SQL/seed only) | L |

## Détail par implémentation

### 7.1 — Hub à rail & « Mon compte » (socle)
Shell rail + routeur de panneaux (état d'onglet en URL) ; groupe **Mon compte** : Préférences (langue FR/EN/DE,
persistée), **Session & rôle** (carte d'état lisible qui remplace le dump « Runtime » de debug, env replié dans
« Diagnostic »). Rayon → échelle de tokens, surfaces plates, `:focus-visible`, « Paramètres » accentué partout.
Les autres modules se branchent comme panneaux dans ce rail.

### 7.2 — Apparence & Marqueurs
**Apparence** : palette white-label (5 couleurs) + logo + carte de preview live, gated super-admin.
**Marqueurs** : passe du mur de 7 cartes déployées à un **maître/détail** (liste des 7 types → un seul panneau
d'édition), SVG personnalisé derrière une divulgation « Avancé » (avec note de sanitisation).

### 7.3 — Fournisseurs IA
**Corrige le P0** : portage de `AiProviderSettings` (inline `style={{}}` + `.btn`/`.pill-mini` non résolus) sur le
vocabulaire maison (`.panel`/`.btn`/`.badge`/`.table`). Liste + formulaire (clé API write-only, « Tester la
connexion ») + **ConfirmDialog** sur Supprimer et Activer (change le fournisseur live pour toute la plateforme).

### 7.4 — Équipe (intégration de Team)
Team emménage dans **Paramètres → Mon organisation → Équipe** ; portage Tailwind/shadcn → vocabulaire maison
(= le volet Team de la Phase 5.3 / S3, dans sa maison finale) ; retrait de l'entrée sidebar `/team`. Table des
membres + invitation (révélation du mot de passe temporaire une fois) + tiroir de permissions par catégorie +
permissions par défaut de l'ORG. **Gating réconcilié** : groupe ≥ 10 ; Inviter / défauts ORG ≥ 30 ; contrôles
serveur (`/api/admin/invite`, `is_platform_superuser`) inchangés = vraie frontière. Rôles en libellés FR.

### 7.5 — Listes & référentiels (nouveau)
Éditeur **maître/détail** super-admin : domaines (`ref_code_domain_registry`) → valeurs (`ref_code`).
Par valeur : code (mono, **verrouillé après création**) · libellé FR + i18n · position (glisser) · actif (bascule)
· « utilisé par N fiches ». **Désactiver par défaut ; supprimer seulement à 0 référence.** Domaines **structurels
en lecture seule** (applicabilité des facettes, taxonomies, couplage `object_type` — régis par déclencheurs).

**Le point dur = back-end.** Les policies `ref_*` n'autorisent l'écriture qu'à `service_role`/`admin`
(`rls_policies.sql:1649`) → le navigateur ne peut pas écrire en direct. Nouveaux **RPC `SECURITY DEFINER` gated
`api.is_platform_superuser()`** : `rpc_upsert_ref_code`, `rpc_set_ref_code_active`, `rpc_reorder_ref_code`,
`rpc_delete_ref_code` (refuse si références > 0). Lecture directe sur registry + `ref_code`. Précédent :
`api.create_tag` / `set_tag_color`. Respecter `code` normalisé (`name_normalized` généré), `name_i18n`, `position`,
`parent_id`.

## Dépendances & séquence

```
Phase 1 (fondations a11y/thème) ──► 7.1 (socle rail)
                                       ├──► 7.2  Apparence & Marqueurs
                                       ├──► 7.3  Fournisseurs IA  (corrige le P0 — peut partir tôt)
                                       ├──► 7.4  Équipe  (remplace le volet Team de la Phase 5.3)
                                       └──► 7.5  Référentiels  (RPC back-end + tests CI D'ABORD, puis UI)
```

- **7.1 d'abord** (socle consommé par 7.2–7.5).
- **7.4** absorbe le portage Team de 5.3 ⇒ faire 7.4 à la place de ce volet.
- **7.5** est sa propre passe spec→plan→impl : back-end (RPC + RLS + test) **avant** l'UI. v1 = domaines plats
  non structurels, désactiver-pas-supprimer.
- Recommandé : 1 → 7.1 → (7.3 ‖ 7.2 ‖ 7.4) → 7.5.

## Critères de réussite globaux (Phase 7)

- Un seul panneau visible à la fois ; groupes gated par rôle ; navigation reflétée dans l'URL.
- Aucune section ne « ressemble à un autre produit » (AI providers + Team portés) ; `:focus-visible` partout.
- Aucune chaîne de debug runtime sur la surface principale ; « Paramètres » accentué partout.
- Team gérable sans la route `/team` ; gating serveur intact.
- Un super-admin crée/désactive/réordonne une valeur `ref_code` ; suppression impossible si référencée ;
  domaines structurels en lecture seule ; toute écriture via RPC DEFINER (zéro écriture PostgREST directe).
- Actions destructives via `ConfirmDialog` maison.
- Nielsen `/settings` **24 → ≥ 32** ; technique **11 → ≥ 16**.
