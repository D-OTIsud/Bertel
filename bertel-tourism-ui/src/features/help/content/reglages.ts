/** Rubrique « Paramètres & RGPD » — branding ORG/plateforme, compte, référentiels, effacement RGPD,
 *  documentation partenaires. Vérifié contre `SettingsPage.tsx`, `settings-nav.ts`
 *  (Paramètres → Mon compte / Mon organisation / Plateforme), `RefCodeEditor.tsx`,
 *  `RgpdErasurePage.tsx` (garde owner/super_admin), mémoire §166 / §149 / §172,
 *  et `docs/guide-partenaires.md` (guide partenaires API). */
import type { FaqEntry } from './types';
import { BERTEL_PARTNER_GUIDE_URL, BERTEL_SUPPORT_URL } from './links';

export const REGLAGES_FAQ: FaqEntry[] = [
  {
    id: 'reglages-branding',
    rubrique: 'reglages',
    question: 'Logo et couleurs de mon organisation ?',
    keywords: ['logo', 'couleur', 'thème', 'marque', 'branding', 'organisation'],
    routes: ['/settings'],
    related: ['reglages-branding-plateforme', 'reglages-compte'],
    answer: `Direction **Paramètres → Mon organisation → Apparence de l'organisation**.

Vous y personnalisez le **logo** et la **palette de couleurs** de **votre organisation** : une fois enregistrés, ils s'appliquent à l'application pour les membres rattachés à cette organisation (héritage champ par champ du thème plateforme).

**Logo.** La transparence du fichier d'origine (PNG, WebP) est **conservée** lors de l'import.

**Accès.** Réservé aux **administrateurs de l'organisation** disposant des droits d'administration nécessaires — si la section n'apparaît pas, voyez un administrateur ORG ou l'équipe plateforme.

**À ne pas confondre** avec l'apparence générale de toute la plateforme (réservée aux super-admins) — voir la question liée ci-dessous.`,
  },
  {
    id: 'reglages-branding-plateforme',
    rubrique: 'reglages',
    question: 'Qui peut modifier l\'apparence générale de la plateforme ?',
    keywords: ['plateforme', 'branding', 'logo', 'thème', 'super-admin', 'marqueurs'],
    routes: ['/settings'],
    related: ['reglages-branding', 'reglages-referentiels'],
    answer: `Direction **Paramètres → Plateforme → Apparence**.

Cette section porte le **branding par défaut de toute l'application** (logo, couleurs, marqueurs carte…) et n'est visible que pour les comptes **super-admin**.

**Périmètre.** Elle s'applique à l'ensemble de la plateforme ; les organisations peuvent ensuite surcharger une partie de ces éléments via **Apparence de l'organisation** (voir la question liée).

**Marqueurs et référentiels** ont leurs propres sections dans le même groupe Plateforme.`,
  },
  {
    id: 'reglages-compte',
    rubrique: 'reglages',
    question: 'Gérer mon compte (nom, photo, mot de passe) ?',
    keywords: ['compte', 'profil', 'préférences', 'paramètres'],
    routes: ['/settings'],
    related: ['profil-avatar', 'mot-de-passe-oublie'],
    answer: `Direction **Paramètres → Mon compte**, accessible à **tout le monde** (pas de restriction de rôle) : c'est là que vous modifiez votre **nom affiché** et votre **photo de profil**.

**Mot de passe.** Il ne se change pas depuis cette section — utilisez « Mot de passe oublié ? » sur l'écran de connexion, même en étant déjà connecté, pour le réinitialiser.`,
  },
  {
    id: 'reglages-referentiels',
    rubrique: 'reglages',
    question: 'Modifier les listes de valeurs (référentiels) ?',
    keywords: ['référentiel', 'valeur', 'liste', 'vocabulaire'],
    routes: ['/settings'],
    related: ['reglages-branding-plateforme'],
    answer: `Direction **Paramètres → Plateforme → Listes & référentiels** : console d'édition des vocabulaires utilisés dans les fiches (catégories, labels, équipements…) — **réservée aux comptes super-admin**.

**Chaque valeur affiche son nombre d'usages** (combien de fiches la référencent). **La suppression n'est possible qu'à zéro usage** : impossible de supprimer une valeur encore utilisée par une fiche, pour éviter de casser des données existantes.`,
  },
  {
    id: 'rgpd-droits',
    rubrique: 'reglages',
    question: 'Traiter une demande RGPD (effacement) ?',
    keywords: ['rgpd', 'effacement', 'données personnelles', 'droit'],
    routes: ['/rgpd'],
    related: ['reglages-referentiels'],
    answer: `Le module **RGPD** est une entrée dédiée du **menu principal** (pas un sous-menu des Paramètres). Il permet de traiter une demande d'effacement des **données personnelles d'un acteur** (droit à l'oubli).

**Accès réservé.** Réservé aux comptes **owner** et **super_admin** — c'est l'écran le plus sensible de l'application.

**Mentions légales.** **Paramètres → Mon compte → Mentions légales** regroupe les documents juridiques publics (confidentialité, CGU, AIPD) : utile pour l'information, mais **ce n'est pas** le parcours opérationnel d'effacement — utilisez le module **RGPD** pour traiter une demande.`,
  },
  {
    id: 'aide-partenaires',
    rubrique: 'reglages',
    question: 'Un guide pour les partenaires techniques et intégrateurs ?',
    keywords: [
      'guide',
      'partenaire',
      'documentation',
      'api',
      'intégrateur',
      'agence web',
      'datatourisme',
      'apidae',
      'tourinsoft',
    ],
    related: ['aide-contact'],
    answer: `Le **guide partenaires** documente l'**API publique** de Bertel (accès en lecture seule aux fiches publiées) : authentification par clé \`bk_live_…\`, endpoints, pagination et synchronisation.

**Public.** Il s'adresse aux **intégrateurs techniques, agences web mandatées et plateformes SIT** (DATAtourisme, Apidae, Tourinsoft) qui branchent leur propre site ou application sur les données de l'OTI — **ce n'est pas** un guide utilisateur pour les gérants ou exploitants.

[Ouvrir le guide partenaires](${BERTEL_PARTNER_GUIDE_URL}).`,
  },
  {
    id: 'aide-contact',
    rubrique: 'reglages',
    question: 'Je ne trouve pas ma réponse ici ?',
    keywords: ['contact', 'support', 'question', 'manquant', 'bug'],
    related: ['aide-partenaires'],
    answer: `Deux relais possibles :

- **L'administrateur de votre organisation**, pour tout ce qui touche à vos droits, votre équipe ou vos paramètres.
- **L'équipe Bertel de l'OTI du Sud**, pour un bug ou une question qui dépasse votre organisation : écrivez au [support Bertel](${BERTEL_SUPPORT_URL}).

**Pour un signalement de bug**, précisez : la **page** concernée, l'**action** tentée, le **message d'erreur exact** et, si possible, une **capture d'écran** sans données personnelles sensibles.

**Cette FAQ s'enrichit au fil de l'eau.** Si une question vous manque, signalez-la — c'est ainsi que le centre d'aide se complète.`,
  },
];
