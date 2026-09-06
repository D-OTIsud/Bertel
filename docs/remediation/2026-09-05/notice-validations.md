# Validations restant à obtenir — notice RGPD Bertel

Document de travail interne, préparé le 6 septembre 2026, à la suite de l'intégration des dix corrections factuelles sourcées dans `bertel-tourism-ui/public/legal/rgpd.md`. Ce fichier ne remplace pas une décision du responsable de traitement ; il liste ce qui reste à faire valider avant toute publication. HTML et PDF sont désormais générés depuis ce Markdown par `scripts/build-legal-notice.mjs --pdf` ; les neuf pages du PDF ont été rendues et contrôlées visuellement.

## Ce qui a changé dans la notice

1. **Envoi de sélections par e-mail** (§2, §4.4, §6.2) : la mention « aucun envoi d'e-mail/SMS applicatif » a été retirée et remplacée par une description factuelle et conditionnelle de l'envoi, sans nommer de fournisseur.
2. **Assistance IA pour l'extraction de menu** (§2, §4.4, §6.2) : ajout d'une description factuelle et conditionnelle de la transmission d'images de menu à un fournisseur d'IA configurable, sans nommer de fournisseur ni de base légale.
3. **Documents privés vs portraits publics** (§4.4) : distinction clarifiée entre la bibliothèque de documents (accès contrôlé, lien temporaire) et les portraits (adresse publique).
4. **Registre de consentements** (§4.4) : remplacement de l'affirmation absolue par la description du registre existant, avec rappel que son existence ne prouve pas un consentement recueilli pour chaque personne ou chaque usage.
5. **Effacement et anonymisation** (§5, §7) : remplacement de « aucune fonction automatisée » par la description de l'outil administrateur (périmètre, limites, non-couverture des sauvegardes/caches/documents partagés) et distinction entre demande individuelle et purge périodique.
6. **Justification de l'identité** (§7) : suppression de l'exigence systématique de pièce d'identité, alignée sur la position CNIL (copie non obligatoire par principe, informations complémentaires seulement en cas de doute raisonnable).
7. **En-têtes de sécurité** (§8) : suppression de la mention « aucun en-tête HSTS/CSP/X-Frame-Options », remplacée par une description sobre des protections prévues et de leur dépendance à la configuration du service en ligne.
8. **Stockage navigateur et ressources tierces** (§9) : remplacement de l'inventaire réduit à « cookies de session/préférences » par une description couvrant le stockage local, les données limitées à l'onglet, les cartes/favicons tiers, et la précision que les polices sont servies par Bertel (pas de chargement direct de Google Fonts).
9. **Localisation et transferts** (§6.1, §6.2) : suppression du titre et de la phrase garantissant que « tout est dans l'UE » et que Google OAuth serait le seul flux hors UE ; ajout des services conditionnels e-mail et IA à l'inventaire ; correction de la recherche d'adresse BAN, déclenchée depuis le navigateur et non « côté serveur ».
10. **Sauvegardes** (§5, §8) : suppression de la durée « 30 jours glissants » non vérifiée, remplacée par « durée contractuelle en cours de vérification », avec rappel que l'outil d'effacement ne supprime pas les copies déjà présentes dans les sauvegardes.

## Nettoyage additionnel du texte visiteur

- Retrait de la note interne entre crochets sur l'arbitrage du cumul Manager SI / référent RGPD (§1) — la question reste à trancher par la direction, hors notice publique.
- Retrait de la note interne entre crochets sur SIREN vs SIRET (§4.2).
- Retrait des mentions « DPA à archiver », « à confirmer et archiver » présentées comme des garanties dans le tableau des sous-traitants (§6.2) ; remplacées par des formulations sobres.
- Retrait du nom de fichier `dpia.md` du texte visiteur (§8, §11).

## Décisions institutionnelles non réévaluées par cette revue

Les éléments suivants existaient déjà dans la notice et n'ont pas été modifiés, faute d'évidence logicielle à vérifier ou d'invalidation par les corrections sourcées. Ils restent des décisions institutionnelles à valider par le responsable de traitement, et ne doivent pas être considérés comme confirmés par cette revue technique :

- La désignation du référent RGPD interne et l'absence de DPO (§1).
- La responsabilité conjointe entre SPL OTI DU SUD et les ORG partenaires, et la convention Art. 26 en cours de rédaction (§1).
- Les bases légales listées en §3 (mission d'intérêt public, intérêt légitime, contrat, obligation légale, consentement) et leur attribution à chaque traitement, y compris pour l'e-mail et l'IA désormais décrits.
- Les durées de conservation autres que les sauvegardes (§5), présentées comme des cibles de politique.
- La qualification des DPIA et son plan d'action (§11).
- L'absence de CSE (§11).

## Limites résiduelles à traiter avant publication

- **Fournisseurs et pays** : identifier le service de messagerie et le fournisseur d'IA réellement activés, leurs pays de traitement, conservation, réutilisation et conditions contractuelles ; compléter le tableau §6.2 en conséquence.
- **Transferts hors UE** : documenter le mécanisme de transfert applicable pour Google OAuth (DPF ou clauses contractuelles types) et pour tout fournisseur e-mail/IA hors UE une fois identifié.
- **Contrats de sous-traitance** : archiver les DPA OVHcloud et Supabase.
- **Consentements et portraits** : documenter le parcours de recueil/modification du consentement, les habilitations, et la décision de publication des portraits ; ne pas déduire d'autorisation de publication de la seule existence d'un fichier ou d'un registre.
- **Effacement** : confirmer l'application de la migration en production, définir le traitement des versions historiques, documents partagés, copies exportées, sauvegardes et restauration ; déterminer la durée de conservation du journal des demandes/opérations et qui y accède.
- **Sauvegardes** : obtenir la durée contractuelle vérifiée (offre Supabase effective) et la faire remplacer dans le tableau §5 et dans §8 ; ne pas présenter les objectifs trimestriels de restauration comme des tests déjà effectués.
- **Cookies/stockage en production** : relever l'inventaire réel sur les parcours publics et authentifiés (fournisseurs, durées, suppression à la déconnexion, justification de nécessité) ; apprécier l'exemption de consentement selon la finalité (CNIL, traceurs).
- **Justification d'identité** : fixer la procédure de vérification proportionnée, le moyen de transmission d'un justificatif si nécessaire, les habilitations et la durée de conservation.
- **Sécurité** : vérifier les réponses HTTP publiques après déploiement pour les en-têtes annoncés ; l'état MFA, la protection mot de passe compromis, les vues `SECURITY DEFINER` et les buckets publics restent des points d'amélioration non résolus par cette revue.
- **Convergence des supports réalisée localement** : régénérer HTML/PDF après chaque future modification validée du Markdown. La notice est explicitement marquée « version documentaire en révision ».

La revue finale a aussi retiré les lieux d'hébergement et certifications non vérifiés du tableau public, ainsi que la fourchette supposée de conservation des logs Auth. Les contacts institutionnels sont conservés. Le contrôle documentaire ne valide pas les assertions institutionnelles historiques listées plus haut.

Sources consultées le 6 septembre 2026 : [CNIL — justificatif d'identité](https://www.cnil.fr/fr/cnil-direct/question/exercice-de-mes-droits-informatique-et-libertes-dois-je-fournir-obligatoirement), [CNIL — cookies et traceurs](https://www.cnil.fr/fr/cookies-et-autres-traceurs/que-dit-la-loi), [Supabase — sauvegardes](https://supabase.com/docs/guides/platform/backups).
