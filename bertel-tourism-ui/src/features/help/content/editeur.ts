/** Rubrique « Éditer une fiche » — éditeur pleine page en sections numérotées.
 *  Vérifié contre `src/features/object-editor/section-config.ts` (labels de section
 *  exacts : 01 Identité & taxonomie, 02 Localisation, 03 Contacts, 04 Descriptions
 *  & langues parlées, 05 Médias, 06 bloc spécifique au type, 07 Capacité & accueil
 *  [masqué pour les HEB, cf. CLAUDE.md §64], 08 Classifications, 09 Accessibilité,
 *  10 Démarche durable, 11 Tags & étiquettes, 13 Tarifs/paiement/extras,
 *  14 Périodes d'ouverture, 15 Liens vers fiches, 16 Sous-lieux / Lieux & étapes,
 *  17 Rattachements, 18 Juridique, 19 Suivi prestataire, 21 Publication,
 *  22 Identifiants externes), `SectionMedia.tsx` / `MediaEditModal.tsx` (toggle
 *  « Photo de couverture », vidéo non éligible en couverture), `SectionPlaces.tsx`
 *  (disclosure « Communes desservies » dans §16), `EditorNav.tsx` (nav groupée par
 *  sections), CLAUDE.md § Editor — full-page editor + media pipeline invariant, et
 *  mémoire §147 (save par lot, snackbar), §113 (présence temps réel), §96 (modale
 *  de blocages), §92 (récurrence horaires). */
import type { FaqEntry } from './types';

export const EDITEUR_FAQ: FaqEntry[] = [
  {
    id: 'editeur-ouvrir',
    rubrique: 'editeur',
    question: 'Comment modifier une fiche existante ?',
    keywords: ['modifier', 'éditer', 'changer', 'fiche'],
    related: ['explorer-fiche', 'editeur-sections'],
    answer: `Ouvrez la fiche depuis l'Explorer (panneau de détail) ou depuis un autre écran (CRM, listes…), puis cliquez sur **« Modifier »**.

**Vous arrivez sur l'éditeur pleine page** de la fiche, organisé en **sections numérotées** (identité, localisation, contacts, médias, description…). Ce n'est pas un panneau ni un tiroir : c'est un écran dédié, avec sa propre barre d'enregistrement en haut.

**Pour revenir à l'Explorer**, utilisez la navigation habituelle — vos modifications non enregistrées restent dans l'éditeur tant que vous ne quittez pas la page.`,
  },
  {
    id: 'editeur-sections',
    rubrique: 'editeur',
    question: 'À quoi correspondent les sections de l\'éditeur ?',
    keywords: ['section', 'onglet', 'rubrique', 'éditeur'],
    related: ['editeur-ouvrir', 'editeur-module-indisponible'],
    answer: `Le menu de navigation à gauche liste les **sections numérotées** de la fiche (Identité, Localisation, Contacts, Médias, Description…). Certaines sections sont **communes à tous les types** (identité, localisation, contacts, description, médias, classifications, publication…), d'autres sont **propres au type** de la fiche : un restaurant a une section Cuisine, cartes & service ; un itinéraire a une section Tracé, étapes & praticabilité ; un hébergement a une section Chambres, capacité & séminaire.

**Une section grisée ou absente** signifie que cette donnée n'existe pas pour ce type — voir la question sur les modules indisponibles.

**Astuce.** La pastille à côté de chaque section indique si elle est complète, à compléter, ou en attente.`,
  },
  {
    id: 'editeur-enregistrer',
    rubrique: 'editeur',
    question: 'Comment enregistrer mes modifications ?',
    keywords: ['enregistrer', 'sauvegarder', 'save', 'valider'],
    related: ['editeur-blocages', 'editeur-presence'],
    answer: `L'éditeur a une **barre d'enregistrement globale** : un seul bouton enregistre l'ensemble des sections modifiées, pas besoin de sauvegarder section par section.

**Confirmation.** Un message de confirmation (snackbar) s'affiche une fois l'enregistrement terminé.

**Piège.** Si vous quittez l'éditeur sans avoir enregistré, vos modifications sont perdues — pensez à enregistrer avant de repartir vers l'Explorer ou un autre écran.`,
  },
  {
    id: 'editeur-descriptions',
    rubrique: 'editeur',
    question: 'Quelle différence entre description « canonique » et description « mon organisation » ?',
    keywords: ['description', 'texte', 'présentation', 'mise en forme'],
    related: ['editeur-ouvrir'],
    answer: `La section Descriptions propose deux niveaux de texte :

- **La description canonique** : le texte commun, partagé par tous.
- **La description « mon organisation »** : une variante propre à votre organisation, qui **surcharge** la description canonique quand elle est remplie. Si vous laissez ce champ vide, la fiche retombe automatiquement sur le texte canonique — vous n'avez pas besoin de dupliquer le texte pour ne changer qu'un détail.

**Mise en forme.** Le texte se saisit en **Markdown** léger : gras, italique, listes, titres de sous-niveau — pas de mise en forme libre type traitement de texte.`,
  },
  {
    id: 'editeur-photos',
    rubrique: 'editeur',
    question: 'Comment ajouter des photos ou des vidéos à une fiche ?',
    keywords: ['photo', 'image', 'vidéo', 'couverture', 'galerie'],
    related: ['editeur-ouvrir'],
    answer: `Dans la section **Médias**, ajoutez vos fichiers : **photos** (redimensionnées automatiquement et nettoyées de leurs données techniques d'origine — les métadonnées EXIF sont retirées) ou **vidéos** (formats mp4/webm/mov, jusqu'à 100 Mo).

**Photo de couverture.** Cochez le toggle **« Photo de couverture »** sur le média à mettre en avant — une **vidéo ne peut pas être définie en couverture**, seule une photo le peut.

**Visibilité.** Chaque média a sa propre visibilité (publique, privée…), indépendamment du statut de la fiche.`,
  },
  {
    id: 'editeur-horaires',
    rubrique: 'editeur',
    question: 'Comment saisir les horaires d\'ouverture ?',
    keywords: ['horaires', 'ouverture', 'fermeture', 'saison', 'jours'],
    related: ['explorer-ouvert'],
    answer: `La section **Périodes d'ouverture** fonctionne par **périodes** (par exemple une saison haute et une saison basse), chacune avec ses **horaires par jour de la semaine**. Une période peut se **répéter chaque année** (récurrence annuelle) plutôt que d'être ressaisie chaque saison.

**Fermetures exceptionnelles.** Ajoutez-les séparément : elles priment sur les horaires habituels pour les dates concernées.

**« Ouvert sans horaires ».** Si l'établissement est ouvert en continu sans créneaux précis, vous pouvez le déclarer ainsi plutôt que de forcer des horaires arbitraires.

**Cette section alimente directement** la pastille « Ouvert » visible dans l'Explorer.`,
  },
  {
    id: 'editeur-blocages',
    rubrique: 'editeur',
    question: 'Que faire face à « enregistrement bloqué » ou « publication bloquée » ?',
    keywords: ['bloqué', 'erreur', 'impossible', 'publier'],
    related: ['editeur-enregistrer', 'publier-fiche'],
    answer: `Une fenêtre s'ouvre et **liste chaque blocage avec sa raison précise** (champ obligatoire manquant, donnée incohérente, tracé non importé…) — vous n'avez pas à deviner ce qui cloche.

**Corrigez chaque point listé**, puis relancez l'enregistrement ou la publication. Les blocages disparaissent au fur et à mesure qu'ils sont résolus.`,
  },
  {
    id: 'editeur-module-indisponible',
    rubrique: 'editeur',
    question: 'Pourquoi une section affiche « module non disponible pour ce type » ?',
    keywords: ['indisponible', 'module', 'grisé', 'type'],
    related: ['editeur-sections', 'choisir-artisan'],
    answer: `Certaines données n'existent que pour certains types de fiches — par exemple un menu structuré n'a de sens que pour un restaurant, un tracé que pour un itinéraire. Quand une section ne s'applique pas au type de votre fiche, elle affiche un **bandeau explicite** au lieu d'un formulaire vide.

**Si vous pensez que le type est faux** (le module devrait exister mais n'apparaît pas), vérifiez d'abord le type choisi à la création — voyez la rubrique « Choisir le bon type » pour l'arbitrage entre types proches.`,
  },
  {
    id: 'editeur-presence',
    rubrique: 'editeur',
    question: 'Que se passe-t-il si plusieurs personnes modifient la même fiche ?',
    keywords: ['conflit', 'simultané', 'présence', 'collègue'],
    related: ['editeur-enregistrer'],
    answer: `L'éditeur affiche une **présence en temps réel** : les avatars des collègues actuellement sur la même fiche, avec un badge indiquant sur quelle section chacun se trouve.

**En cas de conflit** (deux personnes modifient la même section en même temps), une **bannière d'alerte** vous prévient — de quoi éviter d'écraser sans le savoir le travail d'un collègue.`,
  },
  {
    id: 'editeur-zones',
    rubrique: 'editeur',
    question: 'Comment déclarer les communes desservies pour un prestataire sans adresse fixe ?',
    keywords: ['commune', 'zone', 'desservie', 'secteur'],
    related: ['editeur-ouvrir'],
    answer: `Dans la section **Sites secondaires** (§16), ouvrez le bloc **« Communes desservies »** : une **sélection multiple** de communes couvertes par votre activité (utile pour un prestataire itinérant, sans site fixe unique).

**Cette zone d'intervention** complète ou remplace l'adresse selon la nature de l'activité, et alimente les filtres géographiques de l'Explorer.`,
  },
  {
    id: 'editeur-lieux-services',
    rubrique: 'editeur',
    question: 'Adresse principale, sites secondaires, prestations établissement et équipements de chambre : quelle différence ?',
    keywords: ['adresse', 'site', 'lieu', 'chambre', 'équipement', 'prestation'],
    related: ['editeur-ouvrir', 'editeur-zones'],
    answer: `Quatre niveaux distincts :

- **Adresse principale (§02 Localisation)** : le point d'accueil ou le siège de la fiche, enregistré dans \`object_location\` avec \`is_main_location=true\` sur l'objet.
- **Sites secondaires (§16)** : points complémentaires (départ d'activité, annexe, belvédère…) avec leur propre adresse ou GPS, description et visibilité. Ils passent par \`object_place\` + localisation rattachée au lieu.
- **Prestations de l'établissement (§06 HEB)** : services communs à tout l'hébergement (piscine, parking…), enregistrés dans \`object_amenity\` au niveau objet — distincts des équipements d'accessibilité gérés en §09.
- **Équipements de chambre** : choisis dans la modale de chaque type de chambre (\`object_room_type_amenity\`), sans mélanger avec les prestations établissement.`,
  },
];
