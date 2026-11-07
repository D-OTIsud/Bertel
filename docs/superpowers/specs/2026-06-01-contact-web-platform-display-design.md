# Affichage « plateforme web » des contacts (favicon + nom)

- **Date** : 2026-06-01
- **Statut** : design validé en brainstorming, prêt pour plan d'implémentation
- **Surfaces** : éditeur d'objet — Section 03 « Contacts » ; drawer fiche détail — `ContactCard`
- **Périmètre données** : contacts d'**objet** (`contact_channel`). La Section 20 « Distribution » (lecture seule, projetée depuis l'acteur, écriture différée §16) **n'est pas concernée**.

---

## 1. Problème

Un contact d'objet de type « Plateforme de réservation » (`contact_kind = booking_engine`), mais aussi « Site web » et les liens réseaux sociaux, stocke une **URL brute** dans `contact_channel.value`. Aujourd'hui cette URL longue est affichée telle quelle :

- dans l'**éditeur** (Section 03), comme valeur du champ texte ;
- dans le **drawer** (`ContactCard`), comme libellé du contact.

C'est illisible (`https://www.booking.com/hotel/re/le-lagon-bleu.fr.html?aid=304142&label=…`). On veut afficher l'**identité de la plateforme** (logo + nom) au lieu de l'URL, sans changer la saisie ni le modèle de données.

### Contrainte de modèle (vérifiée)

Le référentiel `contact_kind` (`seeds_data.sql`) ne contient **qu'un seul** type générique pour la réservation : `booking_engine` = « Plateforme de réservation ». Il n'existe **pas** de type par plateforme (pas de code « Booking » / « Airbnb » distinct). L'identité de la plateforme doit donc être **dérivée de l'URL** (nom de domaine), pas d'un champ dédié. Aucune migration de schéma ni de seed n'est requise.

---

## 2. Objectifs / non-objectifs

**Objectifs**
- Détecter, à partir de la **valeur** d'un contact, si c'est une URL web et, si oui, en dériver `{ nom affichable, favicon }`.
- Éditeur : préfixer le champ URL par le **favicon** une fois une URL valable saisie ; l'URL reste pleinement visible et éditable.
- Drawer : afficher **favicon + nom de plateforme** (cliquable vers l'URL complète) au lieu de l'URL brute.
- Couvrir **tout type de contact dont la valeur est une URL** (site web, réservation, réseaux sociaux), via un mécanisme **piloté par la valeur** — pas une liste de types codée en dur.

**Non-objectifs**
- Pas de changement de schéma, de seed, ni d'API SQL.
- Pas de nouveau type de contact, pas de sous-type « plateforme ».
- Section 20 « Distribution » inchangée (écriture `actor_channel` différée §16).
- Pas de logos de marque embarqués (choix : service de favicon).
- Types non-web (téléphone, e-mail, SMS, fax, Skype/WeChat/LINE/Viber/Telegram handles) : **inchangés**, ils gardent leurs icônes lucide actuelles.

---

## 3. Décisions verrouillées

1. **Source du logo : service de favicon** (pas de logos embarqués). Couvre n'importe quel domaine, zéro asset à maintenir.
2. **Fournisseur de favicon : DuckDuckGo par défaut** (`https://icons.duckduckgo.com/ip3/<host>.ico`), centralisé derrière une **fonction unique** `faviconUrl(host)` dans le résolveur pour être interchangeable (le corps de la fonction encapsule la forme propre à chaque fournisseur — DDG en `.ico`, Google s2 en query-string). Motivation : posture RGPD/DPIA du projet → fournisseur plus respectueux de la vie privée. *(Ajustable.)*
3. **Détection pilotée par la valeur** : un contact reçoit le traitement si sa `value` résout en URL web ; sinon, rendu inchangé.
4. **Éditeur** : favicon en **préfixe** du champ (le primitive `Input` expose déjà `prefix?: ReactNode`). L'URL reste visible/éditable. Pas de repli en puce, pas de masquage de l'URL.
5. **Drawer** : on affiche le **nom de plateforme** ; le `href` reste l'**URL complète**.
6. **Source unique de vérité** : toute la logique (détection, nom, favicon) vit dans **un seul module** réutilisé par l'éditeur et le drawer.

---

## 4. Architecture

### 4.1 Résolveur partagé (nouveau)

**Fichier** : `bertel-tourism-ui/src/lib/web-platform.ts`

```ts
export interface WebPlatform {
  hostname: string;     // hôte normalisé, sans "www." (ex. "booking.com")
  displayName: string;  // nom propre si connu, sinon hostname
  faviconUrl: string;   // URL du favicon via le fournisseur
}

/** Retourne null si `value` n'est pas une URL web (tel, e-mail, handle, vide…). */
export function resolveWebPlatform(value: string): WebPlatform | null;
```

**Comportement**

- **Est-ce une URL web ?** On laisse le constructeur `URL` faire le parsing réel (pas de regex maison fragile). Helper interne :

  ```ts
  function toWebUrl(value: string): URL | null {
    const raw = value.trim();
    if (!raw || raw.includes('@')) return null;            // exclut e-mails et userinfo
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const url = new URL(candidate);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      if (!url.hostname.toLowerCase().includes('.')) return null; // rejette "localhost", handles
      return url;
    } catch {
      return null;
    }
  }
  ```
  `resolveWebPlatform` retourne `null` si `toWebUrl(value) === null`.
- **Extraction de l'hôte** : `hostname = toWebUrl(value).hostname.toLowerCase()` puis retrait d'un éventuel `www.` de tête. (`URL.hostname` exclut déjà port, schéma et userinfo.)
- **Nom affichable** : table curée `DOMAIN_NAMES` (clé → nom propre). Deux formes de clé, deux règles de correspondance, évaluées sur l'hôte normalisé :
  - **clé-domaine** (contient un point, ex. `booking.com`) → match si `host === clé` **ou** `host` se termine par `.<clé>` (couvre les sous-domaines : `secure.booking.com`).
  - **clé-marque** (sans point, ex. `airbnb`) → match si l'un des **labels** de l'hôte (host découpé sur `.`) **est égal** à la clé (couvre les TLD multiples : `airbnb.fr`, `airbnb.co.uk`).
  - Aucune correspondance → `displayName = hostname` (repli).
- **Favicon** : fonction unique `faviconUrl(host)` → `` `https://icons.duckduckgo.com/ip3/${host}.ico` `` (DuckDuckGo par défaut). Toujours appelée avec le `hostname` réel (ex. `airbnb.fr`).

**Table `DOMAIN_NAMES` (curée, repli = hostname)** — liste initiale. On utilise une **clé-domaine** quand le TLD est fixe, une **clé-marque** quand la plateforme existe sur plusieurs TLD :
`booking.com`→« Booking.com », `airbnb`→« Airbnb », `abritel.fr`→« Abritel », `vrbo.com`→« Vrbo », `expedia`→« Expedia », `hotels.com`→« Hotels.com », `tripadvisor`→« TripAdvisor », `gites-de-france.com`→« Gîtes de France », `leboncoin.fr`→« leboncoin », `facebook.com`→« Facebook », `instagram.com`→« Instagram », `linkedin.com`→« LinkedIn », `youtube.com`→« YouTube », `tiktok.com`→« TikTok », `x.com`/`twitter.com`→« X ». *(Extensible sans risque : tout domaine absent retombe sur son nom de domaine.)*

> Note : ce module **supplante** la détection booking ad-hoc dispersée (`getContactIcon`, `buildContactHref`, `channelLogoCode`) **pour les contacts d'objet uniquement**. On ne refactore pas la Section 20 dans ce lot.

### 4.2 Éditeur — Section 03

**Fichier** : `bertel-tourism-ui/src/features/object-editor/sections/SectionContacts.tsx`

- Dans `renderRow`, calculer `const platform = resolveWebPlatform(it.value)`.
- Passer à l'`Input` de la valeur :
  ```tsx
  prefix={platform ? (
    <img
      src={platform.faviconUrl}
      alt=""
      width={16}
      height={16}
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  ) : undefined}
  ```
  L'`onError` masque proprement l'icône si le favicon échoue (404/réseau), sans laisser d'image cassée.
- Conserver `value`, `onChange`, `mono`, `aria-label` tels quels. Aucun favicon tant qu'aucune URL valable n'est saisie (`platform === null`).

### 4.3 Drawer — parser + carte

> **Note d'implémentation (2026-06-01).** Découvert à l'implémentation : le drawer est réellement
> alimenté par `services/object-detail-parser.ts` → `mapOwnerContacts` (via `parseObjectDetail` →
> `parsed.contacts.public`), **pas** par `object-drawer/utils.ts` → `parseContacts` (qui n'est
> appelé nulle part dans l'app — code mort). La même résolution a donc été appliquée à
> `mapOwnerContacts` (vrai chemin) ET à `parseContacts` (gardé cohérent car `ContactItem.displayValue`
> est désormais requis). La consolidation/suppression du `parseContacts` mort est différée (cf.
> `lot1_mapping_decisions.md` §23).

**Fichier** : `bertel-tourism-ui/src/features/object-drawer/utils.ts` *(+ `services/object-detail-parser.ts` `mapOwnerContacts` — même logique, vrai chemin drawer)*
- `ContactItem` : ajouter `displayValue: string`.
- Dans `parseContacts`, pour chaque contact : `const platform = resolveWebPlatform(value);`
  - `displayValue = platform ? platform.displayName : value;`
  - **Priorité favicon-d'abord** : `iconUrl = platform?.faviconUrl ?? existingIconUrl ?? '';`
    où `existingIconUrl = readString(contact.icon_url, readString(kindRecord.icon_url))` (logique actuelle).
    Justification : si une plateforme web est détectée, on veut **son** favicon, pas une éventuelle icône générique héritée du type. *(Vérifié : aujourd'hui l'API renseigne `icon_url` depuis `ref_code_contact_kind`, non peuplé en seeds → `existingIconUrl` est vide en pratique pour les contacts. Le changement est donc défensif pour le futur.)*
  - `href` inchangé (URL complète via `buildContactHref`).

**Fichier** : `bertel-tourism-ui/src/features/object-drawer/ObjectDetailView.tsx` (`ContactCard`)
- Remplacer les deux rendus `{contact.value}` par `{contact.displayValue}`.
- Le bouton « copier » continue de copier `contact.value` (URL complète).
- **Repli `onError` → icône lucide** : ajouter un état local `const [iconFailed, setIconFailed] = useState(false)`. Condition de rendu actuelle `iconUrl ? <img> : <Icon/>` → `iconUrl && !iconFailed ? <img onError={() => setIconFailed(true)} …/> : <Icon/>`. Si le favicon échoue, on retombe sur l'icône lucide (`getContactIcon`) déjà calculée — jamais d'image cassée.

### 4.4 CSS
- Le slot `.prefix` / `.input-wrap` / `.has-prefix` existe déjà (primitive `Input`). Vérifier/ajouter le dimensionnement du `<img>` favicon (16 px, `flex:none`, `border-radius` léger) dans la feuille de styles de l'éditeur. Détail à finaliser dans le plan.

---

## 5. Flux de données

```
contact_channel.value (URL brute, inchangée en base)
            │
            ▼
   resolveWebPlatform(value)  ──►  null  ──►  rendu inchangé (icône lucide, valeur brute)
            │
            ▼  { hostname, displayName, faviconUrl }
   ┌────────────────────────────┬─────────────────────────────┐
   ▼                            ▼                             ▼
Éditeur (Section 03)        Drawer parser (utils)        Drawer carte (ContactCard)
prefix = <img favicon>      displayValue = displayName   favicon + displayName
(onError → masqué)          iconUrl = faviconUrl d'abord (onError → icône lucide)
URL reste éditable          href = URL complète          href = URL complète (clic)
```

---

## 6. Cas limites & repli

- **Domaine inconnu** → `displayName = hostname` (ex. « maplateforme.re ») + favicon du domaine.
- **Favicon indisponible** (404/hors-ligne) : `onError` traité **dans ce lot** — éditeur masque l'`<img>`, drawer retombe sur l'icône lucide (cf. §4.2 / §4.3). Jamais d'image cassée visible.
- **CSP** : *vérifié* — l'app n'a **aucune** Content-Security-Policy aujourd'hui (`next.config.ts` sans `headers()`, pas de `vercel.json` / `_headers` / `<meta http-equiv>`), donc rien à débloquer. Le drawer rend déjà un `<img>` natif (pas `next/image`) → pas de config `images.remotePatterns` non plus. **Si** une CSP stricte est introduite ultérieurement, ajouter le host du fournisseur de favicon à `img-src` (`https://icons.duckduckgo.com`, ou `https://www.google.com` si bascule Google). Point à inscrire dans la checklist du plan d'exécution.
- **Valeur sans schéma** (`www.booking.com/…`, `airbnb.fr/rooms/1`) → traitée comme URL (préfixe `https://` ajouté par `toWebUrl`).
- **E-mail / téléphone / handle / localhost** (`x@booking.com`, `+262 692…`, `mon_pseudo`, `localhost:3000`) → `null`, rendu inchangé.
- **Confidentialité** : le service de favicon reçoit le **domaine** des liens consultés (pas l'URL complète, pas de donnée personnelle). DuckDuckGo par défaut limite l'exposition. Centralisé → bascule fournisseur ou auto-hébergement ultérieur en une ligne.

---

## 7. Plan de tests

**Unitaires — `web-platform.test.ts`**
- `https://www.booking.com/hotel/re/x?aid=1` → `{ hostname:'booking.com', displayName:'Booking.com', faviconUrl: ddg+booking.com }` (strip `www.`).
- `https://secure.booking.com/foo` → `displayName:'Booking.com'` (sous-domaine, clé-domaine).
- `www.booking.com/hotel/re/x` (sans schéma) → `displayName:'Booking.com'`.
- `airbnb.fr/rooms/123` (sans schéma) → `displayName:'Airbnb'` (clé-marque).
- `https://airbnb.co.uk/rooms/123` → `displayName:'Airbnb'` (clé-marque, TLD composé).
- `https://notairbnb.fr` → `displayName:'notairbnb.fr'` (**repli** — pas de match « airbnb » : correspondance par label, jamais par sous-chaîne).
- `https://maplateforme.re/reserver` → `displayName:'maplateforme.re'` (repli).
- `contact@booking.com` → `null`. `+262 692 00 00 00` → `null`. `''` → `null`. `skypeuser` → `null`. `localhost:3000` → `null` (hôte sans point).

**Composant — éditeur** (`SectionContacts.test.tsx`)
- Ligne avec URL booking → un `<img>` favicon est rendu en préfixe ; le champ reste éditable.
- Ligne téléphone → aucun préfixe favicon.

**Composant — drawer** (`object-detail-parser.test.ts` / test `ContactCard`)
- Contact URL → carte affiche `displayName` + favicon, `href` = URL complète, copie = URL complète.
- Contact téléphone → icône lucide + valeur brute (inchangé).

---

## 8. Fichiers touchés

| Fichier | Nature |
|---|---|
| `bertel-tourism-ui/src/lib/web-platform.ts` | **nouveau** — résolveur |
| `bertel-tourism-ui/src/lib/web-platform.test.ts` | **nouveau** — tests unitaires |
| `bertel-tourism-ui/src/features/object-editor/sections/SectionContacts.tsx` | préfixe favicon |
| `bertel-tourism-ui/src/features/object-drawer/utils.ts` | `ContactItem.displayValue`, résolution dans `parseContacts` |
| `bertel-tourism-ui/src/features/object-drawer/ObjectDetailView.tsx` | `ContactCard` affiche `displayValue` |
| feuille de styles éditeur (CSS `.prefix img`) | dimensionnement favicon (à confirmer dans le plan) |

---

## 9. Points ajustables (à trancher en relecture)

- **Fournisseur de favicon** : DuckDuckGo (défaut) vs Google s2. Interchangeable via la fonction `faviconUrl(host)`.
- **Contenu initial de `DOMAIN_NAMES`** : liste extensible ; valider/compléter les plateformes prioritaires (Booking, Airbnb, Abritel, Expedia, Gîtes de France…).
- **CSP future** : si une Content-Security-Policy est ajoutée à l'app, inscrire `img-src <host fournisseur favicon>` (cf. §6).

---

## 10. Mémoire / documentation

À l'implémentation, consigner la décision verrouillée dans `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (nouveau §) : « Affichage plateforme web des contacts — favicon dérivé de l'URL, détection pilotée par la valeur, contacts d'objet uniquement, Section 20 hors périmètre. » Puis rafraîchir la mémoire MCP. Aucune nouvelle règle d'invariant pour `CLAUDE.md` (pas de changement de modèle).
