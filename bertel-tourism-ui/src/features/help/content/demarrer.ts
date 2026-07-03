/** Rubrique « Démarrer & compte » — connexion, invitation, profil, rôles, palette
 *  de commandes, session. Vérifié contre `LoginPage.tsx` / `SetPasswordPage.tsx`
 *  (flux §170 : réponse TOUJOURS neutre, pas d'oracle de compte), `nav-items.ts`,
 *  `CommandPalette.tsx`, `SettingsPage.tsx` (§149), `SessionScreen.tsx` (§169/§165).
 *  Gabarit libre (pas de gabarit fixe type Créer-objet) : compact, voix « vous ». */
import type { FaqEntry } from './types';

export const DEMARRER_FAQ: FaqEntry[] = [
  {
    id: 'connexion',
    rubrique: 'demarrer',
    question: 'Comment me connecter à Bertel ?',
    keywords: ['connexion', 'se connecter', 'login', 'compte'],
    related: ['invitation-equipe', 'mot-de-passe-oublie'],
    answer: `Sur l'écran de connexion (**/login**), saisissez votre **adresse e-mail** et votre **mot de passe**, puis validez.

**Pas d'auto-inscription.** Il n'y a pas de bouton « créer un compte » : votre compte est créé uniquement par **invitation** d'un administrateur de votre organisation. Si vous n'avez pas encore de compte, demandez une invitation à votre OTI.

**Mot de passe oublié ?** Un lien dédié sous le champ mot de passe vous permet de le réinitialiser.`,
  },
  {
    id: 'invitation-equipe',
    rubrique: 'demarrer',
    question: 'J\'ai reçu une invitation par e-mail, que faire ?',
    keywords: ['invitation', 'e-mail', 'bienvenue', 'activer'],
    related: ['connexion', 'mot-de-passe-oublie'],
    answer: `**Cliquez sur le lien** reçu par e-mail : il vous amène directement sur une page **« Bienvenue dans l'équipe »** où vous choisissez votre mot de passe (au moins 8 caractères). Une fois validé, vous accédez directement à l'application — pas de mot de passe temporaire à retenir.

**Le lien a expiré ou est invalide ?** La page vous le signale clairement. Refaites une demande via « Mot de passe oublié ? » sur l'écran de connexion, ou demandez à votre **administrateur** de vous renvoyer une invitation.`,
  },
  {
    id: 'mot-de-passe-oublie',
    rubrique: 'demarrer',
    question: 'J’ai oublié mon mot de passe, comment le réinitialiser ?',
    keywords: ['mot de passe', 'oublié', 'réinitialiser', 'connexion', 'password'],
    related: ['connexion', 'invitation-equipe'],
    answer: `Sur l'écran de connexion, cliquez sur **« Mot de passe oublié ? »** sous le champ mot de passe, saisissez votre adresse e-mail professionnelle et validez. Si un compte existe avec cette adresse, vous recevez un e-mail avec un lien : il vous amène sur une page où définir un nouveau mot de passe.

**Le lien a expiré ?** Recommencez simplement la procédure depuis l'écran de connexion. Si l'e-mail n'arrive pas, vérifiez vos indésirables puis voyez l'administrateur de votre organisation.`,
  },
  {
    id: 'profil-avatar',
    rubrique: 'demarrer',
    question: 'Changer mon nom affiché ou ma photo ?',
    keywords: ['profil', 'photo', 'avatar', 'nom'],
    related: ['connexion'],
    answer: `Rendez-vous dans **Réglages → Mon compte → Profil**. Vous y modifiez votre **nom affiché** et votre **photo de profil** (JPEG, PNG ou WebP).

**À quoi ça sert.** Ce nom et cette photo apparaissent dans l'application et dans le « mot du conseiller » de vos sélections imprimées — pas seulement un réglage cosmétique.

**Pas de nom renseigné ?** L'application affiche par défaut vos initiales déduites de votre adresse e-mail, jamais l'adresse elle-même en clair.`,
  },
  {
    id: 'roles-vue-modules',
    rubrique: 'demarrer',
    question: 'Pourquoi certains modules me sont invisibles ?',
    keywords: ['rôle', 'accès', 'module', 'menu', 'invisible'],
    related: ['connexion'],
    answer: `Les modules du menu (Explorer, Dashboard, CRM, Modération, Audits, Publications, Listes, RGPD, Paramètres…) sont **filtrés par rôle** : chaque module n'apparaît que pour les rôles autorisés (par exemple **owner**, **super_admin**, **tourism_agent** selon le module).

**Un module que vous utilisiez a disparu, ou vous en manque un ?** Ce n'est pas un bug : c'est votre rôle qui détermine ce qui s'affiche. Voyez l'**administrateur de votre organisation** pour faire évoluer vos droits si besoin.`,
  },
  {
    id: 'palette-commandes',
    rubrique: 'demarrer',
    question: 'Aller plus vite : la palette de commandes',
    keywords: ['raccourci', 'palette', 'clavier', 'rapide'],
    related: ['explorer-recherche', 'connexion'],
    answer: `Appuyez sur **Ctrl/⌘ + K** n'importe où dans l'application pour ouvrir la **palette de commandes**. Elle combine trois usages :

- **Naviguer** : tapez le nom d'un module (Explorer, CRM, Dashboard…) pour y aller directement.
- **Chercher une fiche** : tapez un nom d'établissement, la fiche correspondante apparaît et s'ouvre en un clic.
- **Créer une fiche** : l'action « Créer une fiche » est disponible depuis la palette si votre compte en a le droit.

**Raccourcis clavier.** Une feuille de raccourcis complète est accessible depuis la palette elle-même (action « Raccourcis clavier ») — flèches pour naviguer dans les résultats, Entrée pour valider, Échap pour fermer.`,
  },
  {
    id: 'session-invalide',
    rubrique: 'demarrer',
    question: '« Session invalide » ou déconnexion inattendue',
    keywords: ['session', 'invalide', 'déconnecté', 'erreur'],
    related: ['connexion'],
    answer: `Un écran dédié s'affiche si votre session n'a pas pu être établie ou a expiré, avec le message d'erreur et deux boutons : **« Réessayer »** (recharge proprement) et **« Aller à la connexion »**.

**Dans la grande majorité des cas**, vous reconnecter suffit : cliquez sur « Aller à la connexion » et ressaisissez vos identifiants.

**Si le problème persiste** après plusieurs tentatives, contactez votre administrateur — la session peut avoir été révoquée côté organisation.`,
  },
];
