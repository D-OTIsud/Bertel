# Templates e-mail Supabase — Bertel · OTI du Sud

Six gabarits HTML transactionnels pour **Authentication → Emails** dans le dashboard Supabase.
Charte **OTI du Sud** (celle du template de listes `oti-template.css`) : papier crème `#fbf9f4`,
pétrole `#006883` / `#024053`, or `#dab848`, encre `#2d2a2a` ; typos **Poppins** (titres),
**Kaushan Script** (accroche manuscrite), **Manrope** (texte) avec repli système. Logo Bertel
officiel (icône itinéraire/repère) en en-tête, associé à la mention institutionnelle « OTI du Sud ».

## Logo

- Source retenue : URL Storage publique fournie directement —
  `https://ryycrdhlkmzpxwwwwupy.supabase.co/storage/v1/object/public/assets/LogoOfficielBertel.png`
  (logo Bertel officiel complet : icône « B » multicolore en itinéraire + repère + wordmark BERTEL,
  carré 1254×1254, fond blanc opaque). Chargé tel quel dans les 6 gabarits + `preview.html`, en
  **52×52 px** (ratio 1:1 respecté — ne pas changer `width`/`height` indépendamment, l'image est
  carrée et se déformerait sinon).
- Aucune dépendance de déploiement : URL publique fixe, contrairement à un asset servi par l'app
  via `{{ .SiteURL }}/...` (qui suppose Site URL correctement configurée + fichier déployé).
- Compromis assumé : le fond blanc opaque de l'image forme un léger carré visible sur le papier
  crème `#fbf9f4` de la carte (différence de blanc minime, non recherchée mais non corrigée ici) ;
  à 52px le wordmark « BERTEL » intégré à l'image reste petit — le texte « Bertel · OTI du Sud »
  du gabarit (en Poppins, à côté) porte la lisibilité du nom.
- Repli : `alt="Bertel"` si l'image est bloquée par le client mail.
- Assets locaux détourés (`bertel-tourism-ui/public/Logo/logo-bertel-icon.png` — icône seule,
  fond transparent, 532×612 — et `logo-bertel-email.png` — logo complet transparent, 899×523)
  restent dans le repo mais ne sont plus référencés par les gabarits ; à réutiliser si l'URL
  Storage externe devient indisponible ou si l'en-tête doit repasser à un rendu détouré.

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
