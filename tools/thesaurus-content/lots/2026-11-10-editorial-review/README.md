# Revue éditoriale du 10 novembre 2026

Ce dossier couvre les 1 477 concepts des 78 domaines à partir de la publication 8
et de l'espace éditorial complet, dont 115 concepts absents de l'instantané courant.
Les 38 valeurs dépréciées restent dépréciées. L'export privé de travail n'est pas
versionné ; son empreinte et ses comptes sont conservés dans `review-report.json`.

- `review-decisions.json` donne une décision motivée par identité, les champs relus
  et les libellés/définitions finaux dans les quatre langues.
- `corrections.<domaine>.json` contient les propositions de correction, avec leurs
  valeurs précédentes exactes dans `base`. Ces anciennes formulations sont nécessaires
  à la détection des conflits ; ce ne sont pas les textes à publier.
- `review-report.json` sépare les données manquantes au départ, les corrections
  proposées et les limites des contrôles automatiques.

Les 1 449 propositions incluent des corrections de définitions, de noms, de
synonymes et de notes. Une trace de génération automatique est classée comme
historique, en conservant son texte et sa provenance ; elle n'est pas présentée
comme une autorité externe. Aucun parent, lien sémantique, code, état ou possibilité
d'affectation n'est changé par ce lot. Les relations existantes ont été relues ;
une énumération indépendante n'a pas besoin d'un lien artificiel.

Chaque fichier de corrections peut être simulé avec `propose-content.mjs`, puis
importé dans **Publications → Importer des corrections** avec une session habilitée.
Les identifiants optionnels sont ceux de l'instance auditée : pour une autre
instance, refaire la préparation et la comparaison des sources. Ne pas remplacer
une base divergente ou un brouillon existant pour forcer l'import.

Les étapes restent distinctes : analyser, créer les brouillons privés, relire,
valider, examiner l'aperçu, publier. Le lot ne s'applique pas en SQL. Une publication
doit inclure toutes les corrections nécessaires aux domaines concernés ; tenir
compte des changements d'empreinte entre publications successives. La règle
renforcée FR/EN/ES/DE est installée sur une base existante après l'enrichissement
complet, selon le runbook.

La revue a été faite par des agents Codex, avec une relecture croisée de domaines
et des sources primaires consultées pour certains points précis. Elle ne constitue
pas une validation humaine, une relecture par des locuteurs natifs, une vérification
des déclarations des professionnels ni une certification des établissements.
