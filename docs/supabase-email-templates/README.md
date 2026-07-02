# Templates e-mail Supabase — Bertel · OTI du Sud

Six gabarits HTML transactionnels pour **Authentication → Emails** dans le dashboard Supabase.
Charte **OTI du Sud** (celle du template de listes `oti-template.css`) : papier crème `#fbf9f4`,
pétrole `#006883` / `#024053`, or `#dab848`, encre `#2d2a2a` ; typos **Poppins** (titres),
**Kaushan Script** (accroche manuscrite), **Manrope** (texte) avec repli système. Logo Bertel
officiel (icône itinéraire/repère) en en-tête, associé à la mention institutionnelle « OTI du Sud ».

## Logo

- Source : logo officiel Bertel fourni par l'utilisateur (bucket Storage public `assets`,
  `LogoOfficielBertel.png` — icône « B » multicolore en itinéraire + repère, wordmark BERTEL, fond
  blanc opaque 1254×1254).
- Fichier servi par l'app : `bertel-tourism-ui/public/Logo/logo-bertel-icon.png` — seule l'icône
  (sans le wordmark) a été conservée, fond blanc détouré → transparent puis recadrée au plus près
  (532×612), générée via sharp. Le wordmark n'est pas réutilisé tel quel : le texte « Bertel »
  est recomposé en Poppins dans le gabarit pour rester net à petite taille et cohérent avec le
  reste de la typo.
- Les gabarits le chargent via **`{{ .SiteURL }}/Logo/logo-bertel-icon.png`** — même convention
  que l'app elle-même (`theme.ts` sert son logo par défaut depuis `/Logo/...`) ; nécessite que la
  **Site URL** (Authentication → URL Configuration) pointe vers l'app déployée **et** que le
  fichier soit déployé (commit + build Coolify).
- Repli : `alt="Bertel"` si l'image est bloquée par le client mail (le nom reste lisible en texte
  à côté).
- Alternative sans dépendance de déploiement : pointer directement vers l'URL Storage publique
  fournie (`.../storage/v1/object/public/assets/LogoOfficielBertel.png`) — non retenu ici car cette
  version a un fond blanc opaque (visible en petit carré sur le papier crème `#fbf9f4`) et inclut
  le wordmark en plus, rendant l'en-tête plus large. À reconsidérer si le déploiement de
  `logo-bertel-icon.png` n'est pas souhaité.

## Comment installer

Pour chaque action, dans Supabase → **Authentication → Emails → [action]** :
1. Coller le **Subject** ci-dessous dans le champ *Subject*.
2. Coller le contenu du fichier `.html` dans le champ *Body* (mode **Source**).
3. **Save changes**.

Les fichiers sont des documents HTML complets (Supabase n'ajoute aucun habillage : le gabarit **est** l'e-mail).

## Correspondance action → fichier → variables

| Action Supabase | Fichier | Subject recommandé | Variables utilisées |
|---|---|---|---|
| Confirm sign up | [`confirm-signup.html`](confirm-signup.html) | `Confirmez votre adresse e-mail · Bertel` | `{{ .ConfirmationURL }}`, `{{ .SiteURL }}` (logo) |
| Invite user | [`invite-user.html`](invite-user.html) | `Vous êtes invité·e à rejoindre Bertel` | `{{ .ConfirmationURL }}`, `{{ .SiteURL }}` |
| Magic link / OTP | [`magic-link.html`](magic-link.html) | `Votre lien de connexion à Bertel` | `{{ .ConfirmationURL }}`, `{{ .Token }}`, `{{ .SiteURL }}` |
| Change email address | [`change-email.html`](change-email.html) | `Confirmez votre nouvelle adresse e-mail` | `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .NewEmail }}`, `{{ .SiteURL }}` |
| Reset password | [`reset-password.html`](reset-password.html) | `Réinitialisation de votre mot de passe Bertel` | `{{ .ConfirmationURL }}`, `{{ .SiteURL }}` |
| Reauthentication | [`reauthentication.html`](reauthentication.html) | `Votre code de vérification Bertel` | `{{ .Token }}`, `{{ .SiteURL }}` (code seul, pas de lien) |

## Notes

- **Durées d'expiration** : les textes affichent « 24 heures » (inscription / invitation) et
  « 1 heure » (magic link, reset, change email). Ces valeurs doivent correspondre à
  **Authentication → Settings** (`Email OTP Expiration` / durée des liens). Ajuster le texte si vos
  réglages diffèrent.
- **Reauthentication** ne dispose PAS de `{{ .ConfirmationURL }}` — seul `{{ .Token }}` est fourni par
  Supabase, d'où un gabarit à code seul (pas de bouton).
- **Polices** : chargées via `<link>` Google Fonts (rendu Apple Mail / iOS / clients compatibles) avec
  repli `Arial`/système partout ailleurs. Kaushan Script (l'accroche manuscrite) retombe en texte normal
  dans les clients qui ne chargent pas les webfonts — dégradation acceptable.
- **Outlook (Windows)** : le bouton s'affiche à coins droits au lieu de la pilule arrondie (limite VML),
  mais reste pleinement cliquable et coloré. Tout le reste est en tableaux + styles inline.
- **Mode sombre** : `color-scheme: light only` pour éviter l'inversion automatique des couleurs.
- **Accessibilité** : `lang="fr"`, tableaux `role="presentation"`, contrastes AA sur le corps de texte
  (l'or `#dab848` n'est utilisé qu'en liseré décoratif, jamais en texte).
- `preview.html` (non destiné à Supabase) empile les six e-mails avec des valeurs d'exemple pour revue visuelle.
