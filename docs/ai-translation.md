# Traduction des descriptions par IA

Dans l’éditeur, ouvrir **Descriptions**. Dans l’espace des acteurs, ouvrir **Présentez votre établissement**. Choisir une langue puis **Traduire avec l’IA** pour traduire l’accroche et le descriptif français en cours de saisie.

Les langues proposées comprennent l’anglais, le créole réunionnais, l’allemand, l’espagnol et les langues déjà présentes sur la fiche. Elles sont indépendantes des langues parlées déclarées. Les champs déjà traduits sont conservés, sauf si **Remplacer les traductions existantes** est coché. La traduction reste modifiable ; l’enregistrement ou l’envoi pour validation suit le parcours habituel.

Dans l’éditeur, la traduction porte sur la version sélectionnée, par défaut ou personnalisée. Dans le portail, elle reste dans le brouillon jusqu’à validation de la rubrique, puis apparaît dans le résumé de la proposition. Le traitement des descriptions par l’office conserve son fonctionnement existant de report manuel.

## Configuration et fonctionnement

Le fournisseur actif de **Paramètres → Fournisseurs IA** sert à la traduction et à l’extraction des cartes. Il doit proposer une API Chat Completions OpenAI-compatible. La clé est lue côté serveur via la configuration existante ; aucune migration de base de données ni nouvelle variable d’environnement n’est nécessaire.

`POST /api/ai/translate` prend `{ objectId, sourceLanguage, targetLanguage, fields }`, avec un jeton utilisateur Bearer, et renvoie `{ translations }`. L’accès est limité aux droits d’écriture canonique, d’enrichissement ou au lien acteur effectif avec la fiche. Le service génère un brouillon et n’écrit pas en base. Les réponses incomplètes sont refusées ; le français canonique et la mise en forme Markdown sont conservés. Un changement de texte ou de contexte annule la requête devenue obsolète.

Limites : 30 000 caractères source, 100 champs, délai serveur de 45 secondes pour le fournisseur, 12 demandes par minute et utilisateur sur chaque instance, avec le sémaphore IA commun. La limitation de fréquence et de concurrence est locale au processus, comme pour l’extraction de cartes.

## Services optionnels

Les commandes de traduction et d’analyse d’images sont masquées tant qu’aucun fournisseur IA compatible actif n’est configuré. Un fournisseur local peut volontairement ne pas avoir de clé API. Ce réglage n’ajoute aucune migration SQL. Les notifications dans l’application restent disponibles indépendamment de la configuration IA ou SMTP.
