/** Rubrique « Réglages & RGPD » — branding, compte, référentiels, effacement RGPD,
 *  documentation partenaires. Vérifié contre `SettingsPage.tsx` (§ Apparence — logo +
 *  couleurs, réservé super-admin ; § Profil — Réglages → Mon compte), `RefCodeEditor.tsx`
 *  (compteur d'usage, suppression uniquement à 0 référence, réservé super-admin),
 *  `RgpdErasurePage.tsx` (garde `role === 'owner' || role === 'super_admin'`), mémoire
 *  §166 (transparence du logo conservée) / §149 (profil), et `docs/guide-partenaires.md`
 *  (site documentaire, espace partenaires). */
import type { FaqEntry } from './types';

export const REGLAGES_FAQ: FaqEntry[] = [
  {
    id: 'reglages-branding',
    rubrique: 'reglages',
    question: 'Logo et couleurs de mon organisation ?',
    keywords: ['logo', 'couleur', 'thème', 'marque', 'branding'],
    related: ['reglages-compte'],
    answer: `La section **Apparence** des Réglages porte le **logo** et la **palette de couleurs** de la marque : une fois enregistrés, ils s'appliquent **à toute l'application**, pas seulement à un écran.

**Logo.** La transparence du fichier d'origine (PNG, WebP) est **conservée** lors de l'import — pas de fond blanc ajouté malgré vous.

**Accès réservé.** Cette section est **réservée aux comptes super-admin** — si vous n'y avez pas accès, transmettez vos éléments de marque (logo, couleurs) à votre administrateur plateforme.`,
  },
  {
    id: 'reglages-compte',
    rubrique: 'reglages',
    question: 'Gérer mon compte (nom, photo, mot de passe) ?',
    keywords: ['compte', 'profil', 'préférences'],
    related: ['profil-avatar', 'mot-de-passe-oublie'],
    answer: `Direction **Réglages → Mon compte**, accessible à **tout le monde** (pas de restriction de rôle) : c'est là que vous modifiez votre **nom affiché** et votre **photo de profil**.

**Mot de passe.** Il ne se change pas depuis cette section — utilisez « Mot de passe oublié ? » sur l'écran de connexion, même en étant déjà connecté, pour le réinitialiser.`,
  },
  {
    id: 'reglages-referentiels',
    rubrique: 'reglages',
    question: 'Modifier les listes de valeurs (référentiels) ?',
    keywords: ['référentiel', 'valeur', 'liste', 'vocabulaire'],
    related: ['reglages-branding'],
    answer: `La console **« Listes & référentiels »** des Réglages permet d'éditer les vocabulaires utilisés dans les fiches (catégories, labels, équipements…) — **réservée aux comptes super-admin**.

**Chaque valeur affiche son nombre d'usages** (combien de fiches la référencent). **La suppression n'est possible qu'à zéro usage** : impossible de supprimer une valeur encore utilisée par une fiche, pour éviter de casser des données existantes.`,
  },
  {
    id: 'rgpd-droits',
    rubrique: 'reglages',
    question: 'Traiter une demande RGPD (effacement) ?',
    keywords: ['rgpd', 'effacement', 'données personnelles', 'droit'],
    related: ['reglages-referentiels'],
    answer: `Le module **RGPD** permet de traiter une demande d'effacement des **données personnelles d'un acteur** (droit à l'oubli) — accessible depuis les Réglages.

**Accès réservé.** Réservé aux comptes **owner** et **super_admin** : c'est l'écran le plus sensible de l'application, son accès est volontairement restreint.`,
  },
  {
    id: 'aide-partenaires',
    rubrique: 'reglages',
    question: 'Un guide pour nos partenaires socio-pros ?',
    keywords: ['guide', 'partenaire', 'documentation', 'socio-pro'],
    related: ['aide-contact'],
    answer: `Un **guide partenaires** dédié est publié sur le **site documentaire de l'OTI**, dans son **espace partenaires** — pensé pour vos socio-professionnels, pas pour l'équipe interne.

**À transmettre.** Partagez ce guide aux gérants et exploitants qui vous demandent comment leur fiche fonctionne côté visiteur, plutôt que de leur donner accès à Bertel lui-même.`,
  },
  {
    id: 'aide-contact',
    rubrique: 'reglages',
    question: 'Je ne trouve pas ma réponse ici ?',
    keywords: ['contact', 'support', 'question', 'manquant'],
    related: ['aide-partenaires'],
    answer: `Deux relais possibles :

- **L'administrateur de votre organisation**, pour tout ce qui touche à vos droits, votre équipe ou vos réglages.
- **L'équipe Bertel de l'OTI du Sud**, pour un bug ou une question qui dépasse votre organisation.

**Cette FAQ s'enrichit au fil de l'eau.** Si une question vous manque, signalez-la — c'est ainsi que le centre d'aide se complète.`,
  },
];
