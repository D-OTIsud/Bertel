/** Rubrique « Équipe & rôles » — gestion des membres d'organisation, invitations,
 *  rôles métier/admin, modification d'identité. Vérifié contre `TeamAdminPage.tsx`
 *  (accessible depuis Paramètres → Mon organisation → Équipe, plus de route dédiée),
 *  `InviteMemberDialog.tsx` (invitation multi-adresses, un seul rôle appliqué au lot,
 *  récap par adresse, bouton Renvoyer), `permission-presets.ts` (rôles métier :
 *  Lecteur/Contributeur/Éditeur), `seeds_data.sql` (rôles admin ORG : Référent
 *  équipe/Gestionnaire ORG/Administrateur ORG), `MembersTable.tsx` (bouton Modifier,
 *  suppression définitive, jamais sur soi-même), `MemberProfileModal.tsx` (Task 6 :
 *  identité d'un membre — nom, e-mail de connexion, rang plateforme réservé à un
 *  owner, envoi de liens d'accès), et mémoire §164 (invitation par e-mail, hard
 *  delete). */
import type { FaqEntry } from './types';

export const EQUIPE_FAQ: FaqEntry[] = [
  {
    id: 'equipe-ou',
    rubrique: 'equipe',
    question: 'Où gérer mon équipe ?',
    keywords: ['équipe', 'membres', 'organisation', 'gérer'],
    related: ['equipe-inviter', 'equipe-roles'],
    answer: `Rendez-vous dans **Paramètres → Mon organisation → Équipe**. Il n'y a plus d'entrée dédiée dans le menu principal : la gestion d'équipe vit désormais dans les Paramètres, au même endroit que le reste de la configuration de votre organisation.

**Accès réservé.** Cette section n'apparaît que pour les comptes ayant un rôle d'administration d'organisation — un membre simple ne la voit pas.`,
  },
  {
    id: 'equipe-inviter',
    rubrique: 'equipe',
    question: 'Inviter un ou plusieurs collègues ?',
    keywords: ['inviter', 'collègue', 'e-mail', 'ajouter', 'compte'],
    related: ['equipe-ou', 'equipe-roles', 'equipe-renvoyer'],
    answer: `Depuis Équipe, cliquez sur **« Inviter »**. Le champ **Adresses e-mail** accepte **plusieurs adresses d'un coup** — une par ligne, ou séparées par une virgule — et un **seul rôle métier** s'applique à tout le lot.

**Récapitulatif par adresse.** Après envoi, chaque adresse affiche son résultat : **invitation envoyée**, **déjà membre — rattaché**, **déjà invité, jamais connecté**, ou **échec** (avec le motif).

**Pas de mot de passe temporaire.** La personne invitée reçoit un lien e-mail qui l'amène directement à choisir son propre mot de passe.`,
  },
  {
    id: 'equipe-roles',
    rubrique: 'equipe',
    question: 'Quels rôles et permissions ?',
    keywords: ['rôle', 'permission', 'droits', 'admin'],
    related: ['equipe-inviter', 'equipe-supprimer', 'equipe-modifier-profil'],
    answer: `Deux familles de rôles se cumulent pour chaque membre :

- **Rôle métier** (édition de contenu) : **Lecteur** (consultation seule), **Contributeur** (saisie et enrichissement des fiches, sans validation éditoriale), **Éditeur** (contrôle qualité, correction, validation, publication).
- **Rôle admin d'organisation** (gestion de l'équipe elle-même) : **Référent équipe**, **Gestionnaire ORG**, **Administrateur ORG** — par rang croissant. Seul un rang suffisant peut gérer les membres de rang inférieur ou inviter.

**Chaque rôle applique automatiquement un préréglage de permissions** ; des ajustements fins restent possibles au cas par cas depuis la fiche du membre.`,
  },
  {
    id: 'equipe-renvoyer',
    rubrique: 'equipe',
    question: 'Renvoyer une invitation restée sans réponse ?',
    keywords: ['renvoyer', 'invitation', 'attente', 'relance'],
    related: ['equipe-inviter'],
    answer: `Dans le récapitulatif d'invitation, les adresses marquées **« déjà invité, jamais connecté »** proposent un bouton **« Renvoyer »** — il envoie un nouveau lien d'invitation à ces comptes en attente, sans rien changer pour les membres déjà actifs.

**Plusieurs comptes en attente à la fois ?** Le bouton renvoie l'invitation à **tous** les comptes en attente du lot en un seul clic.`,
  },
  {
    id: 'equipe-supprimer',
    rubrique: 'equipe',
    question: 'Retirer un compte de l\'organisation ?',
    keywords: ['supprimer', 'retirer', 'départ', 'compte'],
    related: ['equipe-roles'],
    answer: `Le bouton **« Supprimer »** de la table Équipe supprime le compte **définitivement** (accès, profil, rattachement, permissions) — une confirmation explicite le rappelle avant validation.

**Alternative réversible.** Pour un retrait temporaire (congé, suspension), préférez **« Désactiver »** : le membre perd l'accès mais son compte peut être réactivé plus tard, sans repasser par une nouvelle invitation.

**Impossible sur vous-même.** Ni la suppression ni la désactivation ne sont proposées sur votre propre compte — un administrateur ne peut pas se retirer lui-même.`,
  },
  {
    id: 'equipe-modifier-profil',
    rubrique: 'equipe',
    question: 'Modifier l\'identité d\'un membre (nom, e-mail, rang plateforme) ?',
    keywords: ['modifier', 'profil', 'identité', 'nom', 'e-mail', 'rang plateforme', 'lien de connexion'],
    related: ['equipe-roles', 'equipe-mdp-collegue'],
    answer: `Le bouton **« Modifier »** de la table Équipe ouvre la fiche d'identité du membre : **nom affiché**, **photo**, **e-mail de connexion**, et propose d'envoyer un **lien d'accès** (invitation ou réinitialisation du mot de passe selon que le compte s'est déjà connecté, ou lien de connexion à usage unique).

**Qui peut l'utiliser ?** Un superuser plateforme, ou un administrateur d'ORG de rang ≥ 30 — jamais sur son propre compte (votre profil s'édite depuis Réglages → Mon compte).

**Le rang plateforme est à part.** Le champ **Rôle plateforme** (Agent sans rang / Super administrateur / Propriétaire) ne se modifie que par un **owner** de la plateforme : les autres administrateurs le voient, désactivé, avec le motif affiché.

**Changer l'e-mail a un effet immédiat**, sans courriel de confirmation, et peut modifier les fiches dont ce membre est propriétaire — la modale le rappelle avant validation.`,
  },
  {
    id: 'equipe-mdp-collegue',
    rubrique: 'equipe',
    question: 'Un collègue a perdu son mot de passe ?',
    keywords: ['mot de passe', 'collègue', 'perdu', 'aider'],
    related: ['mot-de-passe-oublie', 'equipe-renvoyer'],
    answer: `Il n'y a rien à faire **pour vous** dans la plupart des cas : votre collègue utilise le lien **« Mot de passe oublié ? »** sur l'écran de connexion, avec son adresse e-mail professionnelle.

**Si son compte n'a jamais été activé** (invitation jamais ouverte), la réinitialisation ne s'applique pas — dans ce cas, **renvoyez-lui l'invitation** depuis Équipe plutôt que de le renvoyer vers « Mot de passe oublié ? ».`,
  },
];
