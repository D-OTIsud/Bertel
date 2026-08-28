# Lien « carte d'acteur → fiche CRM » — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** rendre la carte d'acteur de la section « Équipe interne » du tiroir de fiche cliquable vers `/crm?acteur=<actor.id>` dans un nouvel onglet, pour les utilisateurs éditeurs ou plus dont le périmètre CRM couvre cet acteur.

**Architecture:** trois changements indépendants et frontend-only. (1) `CrmPage` apprend à lire `?acteur=` au montage, en miroir exact du `?tab=` existant. (2) `TeamSection` reçoit une fonction `crmHrefFor(actor)` et rend la carte en `<a>` quand elle renvoie une URL. (3) une classe CSS modifieuse porte l'affordance. La garde combine deux signaux DÉJÀ EN MAIN : le registre `NAV_ITEMS` (accès au module `/crm`) et la clé `contacts_restricted` du payload (périmètre CRM sur cet objet). Aucune requête réseau supplémentaire, aucun changement SQL.

**Tech Stack:** Next.js (App Router, client components), React 18, TypeScript, zustand (`useSessionStore`), Jest + React Testing Library, CSS maison dans `src/styles.css`.

## Global Constraints

- **Racine de travail : `C:\Users\dphil\Bertel3.0\bertel-tourism-ui`.** Toutes les commandes et tous les chemins relatifs de ce plan partent de là.
- **Aucun changement SQL, aucune migration.** Les fonctions `api.get_object_resource`, `api.list_actor_crm`, `api.user_can_read_crm_actor` sont déployées et restent intactes.
- **Aucune requête réseau supplémentaire.** Interdit d'appeler `user_can_read_crm_actor` (ou toute sonde) par carte d'acteur : l'information est déjà dans le payload.
- **Nom du paramètre d'URL : `acteur`** (français, cohérent avec `?fiche=` de l'Explorer). Exactement cette orthographe, en minuscules.
- **Icône : `ExternalLink` de `lucide-react`** — DÉJÀ importée dans `ObjectDetailView.tsx` (ligne 16). Ne pas ajouter `ArrowUpRight` : la spec la mentionnait, mais réutiliser l'import existant évite une dépendance de plus pour un signal identique (« ce lien sort d'ici »).
- **CSS : jamais `rgba(var(--token), α)`.** Les tokens `--*-rgb` portent des canaux séparés par des ESPACES ; la seule forme valide est `rgb(var(--token) / α)`. Verrouillé par `src/styles.guard.test.ts`.
- **Focus : ne rien déclarer.** La règle globale `:where(:focus-visible)` de `src/styles.css:211` fournit déjà l'anneau. Ajouter un `outline` local le doublerait.
- **Commits :** format conventionnel (`feat:`, `test:`, `style:`), message en français, **sans trailer de co-auteur**.
- **Un commit par tâche**, une fois la tâche verte.

---

### Task 1 : `CrmPage` sait ouvrir une fiche acteur par URL

Aujourd'hui `/crm` ne lit que `?tab=`. Sans cette tâche, le lien de la Task 2 mènerait à l'annuaire, pas à l'acteur.

**Files:**
- Modify: `src/views/CrmPage.tsx:69-82` (le `useEffect` de montage)
- Test: `src/views/CrmPage.test.tsx` (bloc `describe('deep-link ?tab= (hub personnel)')`, ligne 186)

**Interfaces:**
- Consumes: rien (première tâche).
- Produits pour la Task 2 : le contrat d'URL **`/crm?acteur=<actorId>`** ouvre `CrmActorFiche` pour cet `actorId`. `actorId` est l'`actor.id` (uuid) tel qu'émis par `api.get_object_resource` et attendu par `api.list_actor_crm(p_actor_id)`.

- [ ] **Step 1 : écrire les tests qui échouent**

Ajouter ces trois tests à `src/views/CrmPage.test.tsx`, à la FIN du bloc `describe('deep-link ?tab= (hub personnel)')` (juste avant sa `});` fermante). Ce bloc a déjà un `afterEach` qui restaure l'URL — les nouveaux tests en héritent.

```tsx
  it('?acteur= ouvre directement la fiche de cet acteur', async () => {
    window.history.replaceState(null, '', '/crm?acteur=actor-1');
    renderPage();
    // « Appel tarifs » est l'interaction du mock actorSnapshot : elle n'est rendue QUE par
    // la fiche acteur. Ne pas asserter sur « Mme Marie Hoarau » — ce nom est aussi une ligne
    // de l'annuaire, donc il ne distingue pas les deux vues.
    expect(await screen.findByText('Appel tarifs')).toBeInTheDocument();
    expect(crmMock.listActorCrm).toHaveBeenCalledWith('actor-1');
  });

  it('?acteur= prime sur ?tab= (intention la plus précise) et sur le nav persisté', async () => {
    localStorage.setItem('bertel-crm-nav-v2', JSON.stringify({ view: 'timeline' }));
    window.history.replaceState(null, '', '/crm?tab=taches&acteur=actor-1');
    renderPage();
    expect(await screen.findByText('Appel tarifs')).toBeInTheDocument();
    // Le retour de la fiche nomme l'onglet passé en ?tab= (vue de repli), pas l'annuaire.
    expect(screen.getByRole('button', { name: /tâches & relances/i })).toBeInTheDocument();
  });

  it('?acteur= vide → aucune fiche acteur, repli sur le comportement actuel', async () => {
    window.history.replaceState(null, '', '/crm?acteur=');
    renderPage();
    expect(await screen.findByText('Acteurs suivis')).toBeInTheDocument();
    expect(crmMock.listActorCrm).not.toHaveBeenCalled();
  });
```

Notes de fixture — rien à créer :
- le mock `actorSnapshot` en tête de fichier porte déjà `actor.id === 'actor-1'` et une interaction `subject: 'Appel tarifs'` ;
- le `describe('deep-link ?tab= …')` a déjà un `afterEach` qui restaure l'URL (`window.history.replaceState(null, '', '/')`), et le `beforeEach` de module vide déjà `bertel-crm-nav-v2` et remonte tous les mocks du service CRM.

- [ ] **Step 2 : lancer les tests pour vérifier qu'ils ÉCHOUENT**

```bash
npx jest src/views/CrmPage.test.tsx -t "acteur" 2>&1 | tail -40
```

Attendu : les deux premiers ÉCHOUENT (`Unable to find an element with the text: Appel tarifs` — la page reste sur l'annuaire ou l'onglet Tâches) ; le troisième PASSE déjà (c'est la non-régression, il est là pour rester vert).

Si le premier PASSE avant l'implémentation, arrêter : le test ne prouve rien, il faut le corriger avant de continuer.

- [ ] **Step 3 : implémenter**

Dans `src/views/CrmPage.tsx`, remplacer le `useEffect` de montage (lignes 69-82) par :

```tsx
  useEffect(() => {
    // Deep-link d'onglet (hub personnel 2026-07-03) : ?tab= prime sur le nav persisté —
    // même esprit que ?fiche= (§142). Lu via window.location au mount (pas de
    // useSearchParams : évite la contrainte Suspense, le nav est déjà hydraté client-only).
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    const isValidTab = tab === 'annuaire' || tab === 'taches' || tab === 'timeline';
    // Deep-link d'ACTEUR (2026-08-28) : la carte d'acteur du tiroir de fiche y mène.
    // ?acteur= prime sur ?tab= — c'est l'intention la plus précise, et l'onglet ne sert
    // alors qu'à choisir la vue de repli du bouton « Retour » de la fiche.
    // Validation minimale (chaîne non vide, comme loadNav) : le format uuid est éprouvé
    // par le serveur, et un id fabriqué à la main n'est pas un cas à instrumenter ici.
    const actorId = params.get('acteur')?.trim();
    const fallbackView: CrmView = isValidTab ? (tab as CrmView) : 'annuaire';

    if (actorId) {
      setNav({ view: fallbackView, actorId });
    } else {
      setNav(isValidTab ? { view: tab as CrmView } : loadNav());
    }
    setHydrated(true);
  }, []);
```

- [ ] **Step 4 : lancer les tests pour vérifier qu'ils PASSENT**

```bash
npx jest src/views/CrmPage.test.tsx 2>&1 | tail -20
```

Attendu : `Tests: X passed`, 0 failed — les nouveaux tests ET tous les tests `?tab=` préexistants.

- [ ] **Step 5 : commit**

```bash
git add src/views/CrmPage.tsx src/views/CrmPage.test.tsx
git commit -m "feat(crm): ouvrir une fiche acteur par URL (/crm?acteur=)"
```

---

### Task 2 : la carte d'acteur devient un lien vers le CRM

**Files:**
- Modify: `src/features/object-drawer/ObjectDetailView.tsx` — imports (~ligne 43), `TeamSection` (ligne 3106), le registre `asideExtras` (ligne 4006)
- Test: `src/features/object-drawer/ObjectDetailView.test.tsx`

**Interfaces:**
- Consumes (Task 1) : le contrat d'URL `/crm?acteur=<actorId>`.
- Consumes (existant) : `visibleNavItems(role: UserRole | null, demoMode: boolean, canEditObjects: boolean): NavItem[]` depuis `../../config/nav-items` ; `ActorItem.contactsRestricted: boolean` et `ActorItem.id: string` depuis `./utils`.
- Produces : `TeamSection` prend désormais une prop `crmHrefFor: (actor: ActorItem) => string | null`. Renvoyer `null` = pas de lien, carte inchangée.

- [ ] **Step 1 : écrire les tests qui échouent**

D'abord, rendre le persona déterministe. Dans `src/features/object-drawer/ObjectDetailView.test.tsx`, au `beforeEach` du `describe('ObjectDetailView')` (ligne ~66), ajouter `canEditObjects: true,` dans l'objet passé à `useSessionStore.setState` — juste après `role: 'super_admin',`. Sans ça, un test qui met le drapeau à `false` le laisse à `false` pour tous les suivants (`setState` fusionne, il ne réinitialise pas).

Ensuite, ajouter ce bloc à la fin du `describe('ObjectDetailView')` (avant sa `});` fermante) :

```tsx
  // ---------------------------------------------------------------------------------------
  // 2026-08-28 — la carte d'acteur mène à sa fiche CRM. Deux gardes : accès au module /crm
  // (éditeur ou plus, via le registre NAV_ITEMS) ET périmètre CRM sur cette fiche
  // (contacts_restricted, qui EST le prédicat api.can_read_actor_contacts).
  // ---------------------------------------------------------------------------------------
  const actorLinkData: ObjectDetail = {
    id: 'hotel-crm-link',
    name: 'Hotel Lien CRM',
    type: 'HOT',
    raw: {
      descriptions: { description: 'Hotel dont l acteur mene au CRM.' },
      actors: [
        {
          id: 'actor-42',
          display_name: 'Mme Mélissa Fontaine',
          role: { name: 'Exploitant' },
          contacts: [{ kind: { code: 'mobile', name: 'Mobile' }, value: '0692068575' }],
          contacts_restricted: false,
        },
      ],
    },
  };

  it('éditeur + acteur dans le périmètre CRM : la carte est un lien vers /crm?acteur=', () => {
    useSessionStore.setState({ role: 'super_admin', canEditObjects: true });

    renderDetail(actorLinkData);

    const link = screen.getByRole('link', { name: /fiche CRM de Mme Mélissa Fontaine/i });
    expect(link).toHaveAttribute('href', '/crm?acteur=actor-42');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
  });

  it('lecteur seul (canEditObjects=false) : pas de lien, mais l’acteur reste affiché', () => {
    // Membre d'ORG en lecture seule : il voit l'équipe (son e-mail est celui de l'ORG)
    // mais /crm lui est masqué — la garde retire l'AFFORDANCE, jamais l'information.
    useSessionStore.setState({
      role: 'tourism_agent',
      email: 'membre@oti.re',
      canEditObjects: false,
    });

    renderDetail({
      ...actorLinkData,
      id: 'hotel-crm-readonly',
      raw: {
        ...actorLinkData.raw,
        organizations: [
          {
            id: 'org-1',
            name: 'OTI du Sud',
            link_type: 'Editeur',
            contacts: [{ kind_code: 'email', value: 'membre@oti.re' }],
          },
        ],
      },
    });

    expect(screen.getByText('Mme Mélissa Fontaine')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /fiche CRM/i })).not.toBeInTheDocument();
  });

  it('éditeur hors périmètre CRM (contacts_restricted) : pas de lien, message §208 conservé', () => {
    useSessionStore.setState({ role: 'super_admin', canEditObjects: true });

    renderDetail({
      id: 'hotel-crm-restricted',
      name: 'Hotel Hors Perimetre',
      type: 'HOT',
      raw: {
        descriptions: { description: 'Fiche publiee par une autre ORG.' },
        actors: [
          {
            id: 'actor-43',
            display_name: 'Jean Dupont',
            role: { name: 'Direction' },
            contacts: [],
            contacts_restricted: true,
          },
        ],
      },
    });

    expect(screen.getByText('Jean Dupont')).toBeInTheDocument();
    expect(screen.getByText("Coordonnées réservées à l'organisation éditrice.")).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /fiche CRM/i })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2 : lancer les tests pour vérifier qu'ils ÉCHOUENT**

```bash
npx jest src/features/object-drawer/ObjectDetailView.test.tsx -t "CRM" 2>&1 | tail -40
```

Attendu : le premier ÉCHOUE (`Unable to find an accessible element with the role "link"`). Les deux autres PASSENT déjà (aucun lien n'existe encore) — ils sont là comme non-régression. Le test 2 doit devenir la garde non vacante : à la fin de la Task 2, le neutraliser (retirer la condition `(a)` de l'implémentation) DOIT le faire rougir.

- [ ] **Step 3 : implémenter**

**3a.** Dans `src/features/object-drawer/ObjectDetailView.tsx`, ajouter l'import du registre juste après la ligne 43 (`import { getMarkerImageId } from '../../config/map-markers';`) :

```tsx
import { visibleNavItems } from '../../config/nav-items';
```

**3b.** Remplacer intégralement le composant `TeamSection` (à partir de `function TeamSection(` ligne 3106, jusqu'à sa `}` fermante) par :

```tsx
function TeamSection({
  actors,
  shownContactKeys,
  crmHrefFor,
}: {
  actors: ActorItem[];
  shownContactKeys: ReadonlySet<string>;
  crmHrefFor: (actor: ActorItem) => string | null;
}) {
  if (!actors.length) {
    return null;
  }

  return (
    <Section title="Equipe interne" aside restricted>
      <div className="detail-card-list">
        {actors.slice(0, 5).map((actor) => {
          const line = actor.contactEntries.find(
            (entry) => !shownContactKeys.has(contactComparisonKey(entry.kindCode, entry.value)),
          );
          const crmHref = crmHrefFor(actor);

          const header = (
            <div className="detail-mini-card__header">
              <strong>{actor.name}</strong>
              <span className="detail-mini-card__header-end">
                {actor.role && <span className="detail-chip detail-chip--soft">{actor.role}</span>}
                {crmHref && <ExternalLink size={14} aria-hidden className="detail-mini-card__crm-icon" />}
              </span>
            </div>
          );

          const meta = line ? (
            <p className="detail-mini-card__meta">{`${line.label}: ${line.value}`}</p>
          ) : (
            // §208 — contacts_restricted distingue « réservé » de « rien saisi » : ne jamais
            // laisser un vide silencieux quand la vraie raison est un refus d'accès serveur.
            // La condition porte sur ce que le SERVEUR a émis (contactEntries), jamais sur le
            // résultat de la dédup : un acteur dont toutes les coordonnées sont déjà visibles
            // n'est pas un refus d'accès, et le dire serait un mensonge sur la cause.
            actor.contactEntries.length === 0 &&
            actor.contactsRestricted && (
              <p className="detail-mini-card__meta">Coordonnées réservées à l&apos;organisation éditrice.</p>
            )
          );

          // Lien vers la fiche CRM (2026-08-28) : un vrai <a href>, pas un onClick — ⌘/ctrl-clic
          // et clic-milieu doivent marcher. `target="_blank"` préserve le tiroir, les filtres et
          // la sélection de l'Explorer : consulter le CRM d'un exploitant est une consultation
          // LATÉRALE, pas un abandon de la fiche en cours. L'aria-label est obligatoire : sans
          // lui le lecteur d'écran annonce le contenu concaténé de la carte, qui ne dit pas où
          // le lien mène.
          if (crmHref) {
            return (
              <a
                key={actor.id}
                href={crmHref}
                target="_blank"
                rel="noreferrer"
                className="detail-mini-card detail-mini-card--crm"
                aria-label={`Ouvrir la fiche CRM de ${actor.name}`}
              >
                {header}
                {meta}
              </a>
            );
          }

          return (
            <div key={actor.id} className="detail-mini-card">
              {header}
              {meta}
            </div>
          );
        })}
      </div>
    </Section>
  );
}
```

**3c.** Dans `ConfigDrivenDetailView`, juste après la ligne `const canSeeActors = useActorVisibility(preview.organizations);` (ligne 3794), insérer :

```tsx
  // Lien « carte d'acteur → fiche CRM » (2026-08-28). DEUX gardes, aucune requête réseau :
  //
  // (a) Accès au module — on interroge le registre UNIQUE des modules navigables plutôt que
  //     de retranscrire une 4e fois `roles + requiresEdit` (sidebar, ⌘K, nav mobile le lisent
  //     déjà). C'est le signal « éditeur ou plus » : canEditObjects =
  //     api.current_user_can_edit_objects() (superuser, admin d'ORG, ou l'une des 4
  //     permissions éditables).
  //
  // (b) Périmètre CRM sur CET acteur — `contacts_restricted` du payload EST le prédicat
  //     `NOT api.can_read_actor_contacts(objet)` = `NOT (superuser OR objet ∈
  //     current_user_crm_object_ids())`. Or api.list_actor_crm autorise si `superuser OR
  //     acteur ∈ current_user_crm_actor_ids()`, ensemble qui contient tout acteur lié par
  //     actor_object_role à un objet du périmètre — et cet acteur est rendu ici PRÉCISÉMENT
  //     parce qu'il porte ce lien vers cet objet. Donc `!contactsRestricted` ⇒ le CRM
  //     autorisera : aucun lien affiché ne peut retomber sur un 42501.
  //     Ce n'est pas un second palier de droits, c'est la garde anti-lien-mort.
  const sessionRoleForCrm = useSessionStore((state) => state.role);
  const demoModeForCrm = useSessionStore((state) => state.demoMode);
  const canEditForCrm = useSessionStore((state) => state.canEditObjects);
  const canReachCrm = useMemo(
    () => visibleNavItems(sessionRoleForCrm, demoModeForCrm, canEditForCrm).some((item) => item.to === '/crm'),
    [sessionRoleForCrm, demoModeForCrm, canEditForCrm],
  );
  const crmHrefFor = useCallback(
    (actor: ActorItem) =>
      canReachCrm && !actor.contactsRestricted ? `/crm?acteur=${encodeURIComponent(actor.id)}` : null,
    [canReachCrm],
  );
```

**3d.** Dans le tableau `asideExtras` (ligne ~4006), remplacer l'entrée `team` par :

```tsx
    { key: 'team', id: '', label: '', placement: 'aside', render: () => <TeamSection actors={canSeeActors ? preview.actors : []} shownContactKeys={shownContactKeys} crmHrefFor={crmHrefFor} /> },
```

- [ ] **Step 4 : lancer les tests pour vérifier qu'ils PASSENT**

```bash
npx jest src/features/object-drawer/ObjectDetailView.test.tsx 2>&1 | tail -20
```

Attendu : `Tests: X passed`, 0 failed — les 3 nouveaux ET tous les préexistants (notamment `keeps the placeholder elegant and hides actors for an unauthorized user`, le test §208, et le test 3a de dédup).

- [ ] **Step 5 : prouver que la garde n'est pas vacante**

Modifier TEMPORAIREMENT `crmHrefFor` pour retirer la condition (a) :

```tsx
    (actor: ActorItem) => (!actor.contactsRestricted ? `/crm?acteur=${encodeURIComponent(actor.id)}` : null),
```

Puis :

```bash
npx jest src/features/object-drawer/ObjectDetailView.test.tsx -t "lecteur seul" 2>&1 | tail -20
```

Attendu : **ÉCHEC** (`expected null not to be in the document`). Si ce test reste VERT, il ne garde rien — corriger le test avant de continuer.

Rétablir ensuite la version correcte de `crmHrefFor` et relancer la suite complète du fichier pour la revoir verte.

- [ ] **Step 6 : commit**

```bash
git add src/features/object-drawer/ObjectDetailView.tsx src/features/object-drawer/ObjectDetailView.test.tsx
git commit -m "feat(fiche): la carte d'acteur mene a sa fiche CRM pour les editeurs"
```

---

### Task 3 : l'affordance visuelle du lien

Sans cette tâche la carte est cliquable mais rien ne le dit : ni curseur, ni hover, ni couleur de texte préservée (un `<a>` nu hérite du bleu de lien du navigateur et casserait la typo de la carte).

**Files:**
- Modify: `src/styles.css` (à la suite du bloc `.detail-mini-card`, ligne 7268-7275)
- Test: `src/styles.guard.test.ts` (existant — aucune modification, il doit juste rester vert)

**Interfaces:**
- Consumes (Task 2) : les classes `detail-mini-card--crm`, `detail-mini-card__header-end`, `detail-mini-card__crm-icon`.
- Produces : rien pour les tâches suivantes.

- [ ] **Step 1 : écrire le CSS**

Dans `src/styles.css`, juste APRÈS le bloc `.detail-mini-card { … }` qui se termine ligne 7275, insérer :

```css
/* Carte d'acteur cliquable vers sa fiche CRM (2026-08-28). La carte devient un <a> : on
   neutralise l'habillage de lien du navigateur (couleur, soulignement) pour que la typo de
   la carte ne bouge pas, et on n'ajoute QUE l'affordance. Pas de règle :focus-visible ici —
   l'anneau global de styles.css:211 s'en charge (une règle locale le doublerait). */
.detail-mini-card--crm {
  color: inherit;
  text-decoration: none;
  cursor: pointer;
  transition: transform var(--duration-fast, 150ms) ease, box-shadow var(--duration-fast, 150ms) ease;
}

.detail-mini-card--crm:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-soft);
  border-color: rgb(var(--theme-primary-rgb) / 0.28);
}

/* L'en-tête de la mini-carte est un flex `space-between` : la pastille de rôle et l'icône
   « sortant » sont regroupées à droite pour ne pas se disputer l'espace avec le nom. */
.detail-mini-card__header-end {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.detail-mini-card__crm-icon {
  color: var(--theme-primary);
  opacity: 0.65;
  flex: none;
}

.detail-mini-card--crm:hover .detail-mini-card__crm-icon {
  opacity: 1;
}
```

- [ ] **Step 2 : lancer la garde CSS + la suite de la fiche**

```bash
npx jest src/styles.guard.test.ts src/features/object-drawer/ObjectDetailView.test.tsx 2>&1 | tail -20
```

Attendu : `Tests: X passed`, 0 failed. La garde `styles.guard.test.ts` vérifie notamment qu'aucun `rgba(var(` n'apparaît — le CSS ci-dessus utilise bien `rgb(var(--theme-primary-rgb) / 0.28)`.

- [ ] **Step 3 : vérifier visuellement dans le navigateur**

```bash
npx next dev
```

Ouvrir l'Explorer, ouvrir une fiche dont l'ORG éditrice est la vôtre, dérouler « Équipe interne ». Vérifier : curseur main sur la carte, léger soulèvement au survol, icône `ExternalLink` visible à droite du rôle, anneau de focus au `Tab`, et le clic ouvre `/crm?acteur=…` dans un NOUVEL onglet sur la fiche du bon acteur.

- [ ] **Step 4 : commit**

```bash
git add src/styles.css
git commit -m "style(fiche): affordance du lien carte d'acteur vers le CRM"
```

---

### Task 4 : vérification de bout en bout

**Files:** aucun (vérification seule ; ne modifier un fichier que si une vérification rougit).

**Interfaces:** consomme le résultat des tâches 1 à 3.

- [ ] **Step 1 : suite de tests complète**

```bash
npx jest 2>&1 | tail -25
```

Attendu : 0 `failed`. Noter le nombre total de suites et de tests dans le message de clôture.

- [ ] **Step 2 : typage**

```bash
npx tsc --noEmit --pretty false 2>&1 | tail -20
```

Attendu : aucune sortie (0 erreur).

- [ ] **Step 3 : lint**

```bash
npx next lint 2>&1 | tail -20
```

Attendu : aucune erreur nouvelle sur les 3 fichiers touchés.

- [ ] **Step 4 : relire le diff**

```bash
git diff HEAD~3 --stat
```

Attendu, exactement 5 fichiers : `src/views/CrmPage.tsx`, `src/views/CrmPage.test.tsx`, `src/features/object-drawer/ObjectDetailView.tsx`, `src/features/object-drawer/ObjectDetailView.test.tsx`, `src/styles.css`. **Aucun fichier `.sql`.** Si un autre fichier apparaît, l'expliquer ou le retirer avant de clore.

---

## Journalisation (à faire avant de déclarer la tâche close)

Le projet exige que toute décision soit consignée (`CLAUDE.md` § Memory workflow).

- [ ] Ajouter une entrée au journal canonique `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (nouvelle section `## §N` — **re-grep le dernier numéro `## §` avant de le figer**), portant :
  - la décision : la carte d'acteur mène à `/crm?acteur=`, nouvel onglet, éditeurs ou plus ;
  - **l'invariant découvert** : `contacts_restricted` du payload EST le prédicat de périmètre CRM sur l'objet (`api.can_read_actor_contacts`) ; toute surface qui a besoin de savoir « cette session est-elle dans le CRM de cette fiche ? » peut le lire au lieu de sonder ;
  - la démonstration en 4 points (spec §2b) qui prouve qu'aucun lien affiché ne peut retomber sur un 42501 ;
  - le lien vers la spec `docs/superpowers/specs/2026-08-28-crm-actor-link-from-detail-design.md`.
- [ ] Ne PAS ajouter de règle à `CLAUDE.md` : l'invariant ci-dessus est un fait de lecture du payload, pas une règle d'architecture nouvelle. Si l'exécutant estime le contraire, le proposer au lieu de l'écrire.
