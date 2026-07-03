# Pages légales publiques + accès in-app — Design

**Date :** 2026-07-03
**Auteur :** session Bertel (référent : David Philippe)
**Statut :** validé (design), prêt pour implémentation

---

## 1. Problème / déclencheur

L'écran de configuration OAuth (Google Cloud Console — *consent screen*) demande deux URL
publiques : « Application privacy policy link » et « Application terms of service link ».
Question initiale : ces pages existent-elles, et où les rendre accessibles dans l'app ?

## 2. Constat (état des lieux vérifié)

- **Politique de confidentialité → existe déjà, publique.** `bertel-tourism-ui/public/legal/rgpd.html`
  (+ `rgpd.md` source + `rgpd.pdf`) : page autonome stylée, spécifique à Bertel, complète.
  Servie en clair à `/legal/rgpd.html`.
- **DPIA → existe** (`/legal/dpia.html`), bonus non requis par OAuth.
- **Conditions d'utilisation / CGU → n'existe pas.** Seule vraie lacune (2ᵉ champ OAuth).
- **Les pages `/legal/` sont orphelines** : rien ne les lie dans l'app ; le bouton « Aide »
  du sidebar est un `<button>` inerte (aucun `onClick`).
- **Middleware ne gate rien d'autre** que `/api/public/*` (`src/middleware.ts` matcher strict)
  ⇒ les fichiers statiques `public/legal/*` sont bien publiquement accessibles (pastables +
  crawlables par Google).

### Faits sourcés (pack RGPD `docs/conformite-rgpd/` + `public/legal/rgpd.md`) — source unique, réutilisés tels quels

- **Éditeur / responsable de traitement :** SPL OTI DU SUD — 379 Rue Hubert Delisle, 97430
  Le Tampon — SIREN 882 699 556.
- **Référent RGPD interne :** David Philippe — Manager SI — d.philippe@otisud.com — 06 93 41 92 91.
  (SPL OTI DU SUD n'a pas désigné de DPO au sens Art. 37 ; « référent RGPD interne ».)
- **Hébergement (tout UE) :** frontend Next.js/Docker chez OVHcloud (France) ; données
  personnelles (PostgreSQL managé, auth, stockage, temps réel) chez Supabase/AWS `eu-west-1`
  (Irlande).
- **Modèle multi-ORG (Art. 26 RGPD) :** plateforme mutualisée ; chaque ORG partenaire est
  responsable éditorial de ses contenus, SPL OTI DU SUD fournit le cadre commun + les données
  techniques.
- **Interdiction stricte de données sensibles en champ libre CRM** (RGPD §4.3).
- **Réclamation :** CNIL.

### Note pratique (non bloquante)

Google OAuth n'est utilisé QUE par les utilisateurs internes (agents). Si l'app OAuth est en
**User type = Internal** (Workspace OTI), les deux champs sont *facultatifs*. On rédige quand
même la CGU (décision PO), mais l'absence n'est pas bloquante.

## 3. Décision

1. **Rédiger une page CGU publique** (`public/legal/cgu.*`), même gabarit que `rgpd`/`dpia`.
2. **Câbler des liens discrets** vers les pages légales : footer `AuthShell` (login +
   set-password) + section « Mentions légales » dans Réglages.

Placement retenu : **footer discret + Réglages**, PAS un encadré proéminent au-dessus d'Aide
ni derrière le bouton Aide (les liens légaux sont de la nav basse fréquence ; « Aide » = *comment
utiliser l'app*, intention distincte).

## 4. Design

### Partie A — Page CGU publique (statique)

**Choix :** page statique dans `public/legal/` (comme `rgpd`/`dpia`), pas une route React.
Raisons : URL publique stable/crawlable, aucun souci d'auth, réutilise le build PDF, cohérence
visuelle immédiate.

**Fichiers nouveaux :**
- `bertel-tourism-ui/public/legal/cgu.md` — source markdown (en-tête/pied comme `rgpd.md`)
- `bertel-tourism-ui/public/legal/cgu.html` — page autonome (copie du `<head>`/CSS de
  `rgpd.html`, corps remplacé)
- `bertel-tourism-ui/public/legal/cgu.pdf` — généré via `_build_pdf.mjs` (ajouter la cible)

**Modif :** `public/legal/_build_pdf.mjs` — ajouter `{ html: 'cgu.html', pdf: 'cgu.pdf',
title: "Conditions d'utilisation — Bertel" }` dans `targets`.

**Contenu — Conditions Générales d'Utilisation (Bertel).** Dérivé du pack RGPD pour tout le
factuel ; marqueurs `[À VALIDER — juridique/direction]` sur les vrais choix juridiques (même
convention honnête que `[À VALIDER PAR LE DPO]` dans `rgpd.md`) :

| § | Section | Nature |
|---|---------|--------|
| 1 | Objet & acceptation | rédigé |
| 2 | Éditeur de la plateforme | factuel (identité = RGPD) |
| 3 | Accès & comptes (agents OTI + membres ORG partenaires ; comptes nominatifs sur invitation ; confidentialité des identifiants) | factuel |
| 4 | Description du service (référentiel SIT/CRM mutualisé multi-ORG) | factuel |
| 5 | Obligations de l'utilisateur (exactitude ; interdiction données sensibles champ libre → renvoi RGPD §4.3 ; pas de contournement RLS/droits) | factuel |
| 6 | Contenus & propriété intellectuelle (responsabilité éditoriale par ORG — Art. 26) | factuel + `[À VALIDER : régime de licence des contenus]` |
| 7 | Données personnelles → renvoi `/legal/rgpd.html` + référent RGPD | factuel |
| 8 | Disponibilité & évolutions (best-effort, maintenance, pas de garantie de dispo) | rédigé |
| 9 | Responsabilité & limitation | `[À VALIDER]` |
| 10 | Suspension & résiliation de compte | `[À VALIDER]` |
| 11 | Modification des CGU (date de version) | rédigé |
| 12 | Droit applicable & juridiction | `[À VALIDER : droit français, tribunaux compétents]` |
| 13 | Contact | factuel |

> Livrable = squelette solide et validable, non juridiquement définitif. Le référent valide les
> `[À VALIDER]` avant opposabilité.

### Partie B — Accès in-app (liens discrets)

1. **Footer `AuthShell`** (`bertel-tourism-ui/src/components/auth/AuthShell.tsx`) : ajouter un
   `<footer className="auth-legal">` discret sous la carte formulaire (couvre `/login` +
   `/set-password`). Deux liens ouverts en nouvel onglet (`target="_blank"
   rel="noopener noreferrer"`) : **Confidentialité** → `/legal/rgpd.html` · **Conditions
   d'utilisation** → `/legal/cgu.html`. + CSS `.auth-legal` (discret, ton `--ink-3`) dans
   `src/styles.css`.
2. **Section « Mentions légales » dans Réglages :**
   - `src/views/settings-nav.ts` : ajouter à `ACCOUNT_GROUP` (non gaté, « tout le monde »)
     la section `{ id: 'legal', label: 'Mentions légales', icon: ShieldCheck }`.
   - `src/views/SettingsPage.tsx` : ajouter un pane `{activeSection === 'legal' && (...)}`
     listant : Politique de confidentialité (`/legal/rgpd.html`), Conditions d'utilisation
     (`/legal/cgu.html`), Analyse d'impact — DPIA (`/legal/dpia.html`), un lien interne
     **Exercer mes droits** (`/rgpd`, page d'effacement existante), et la mention CNIL.

## 5. Hors périmètre

- CGU de l'**API partenaire** (`/api/public/*`, Bearer) — régie par convention séparée, juste
  mentionnée.
- Câblage du bouton « Aide » (inerte) — non lié au légal ; hors sujet.

## 6. Vérification

- **TDD (logique) :** `settingsSectionIds` inclut `'legal'` pour tous les rôles (test d'abord,
  échoue, on ajoute la section, passe). Fichiers existants : `SettingsRail.test.tsx`.
- **Rendu :** `AuthShell.test.tsx` — les deux liens légaux sont rendus avec les bons `href`.
- **Build :** `node public/legal/_build_pdf.mjs` régénère `cgu.pdf` ; `tsc --noEmit` + `jest`
  verts.
- **Manuel :** ouvrir `/legal/cgu.html` (mise en page = `rgpd.html`) ; footer visible sur
  `/login` ; section « Mentions légales » visible dans Réglages sous tous les rôles.

## 7. Suites / à valider par le PO

- Valider les `[À VALIDER]` de la CGU (licence contenus, limitation de responsabilité, droit
  applicable, résiliation) avant de la traiter comme opposable.
- Confirmer le User type (Internal/External) de l'app OAuth Google.
- Coller les URL `https://<domaine-app>/legal/rgpd.html` et `.../legal/cgu.html` dans le
  consent screen.
