# Validation Zod 4.6.7 — 6 novembre 2026

Le frontend et les routes serveur utilisent Zod **4.6.7**, épinglé exactement dans le manifeste et le lockfile. L’avis [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) concerne les versions antérieures à 4.6.6 : les collections trop grandes étaient parcourues avant que leur borne soit appliquée. La version retenue est la [release officielle 4.6.7](https://github.com/colinhacks/zod/releases/tag/v4.6.7). Aucun import applicatif ne conserve le runtime v3.

## Compatibilité

Les treize modules applicatifs utilisent un point d’entrée commun qui conserve les messages de validation existants, y compris les messages français propres aux champs. Les deux records concernés déclarent maintenant explicitement leur schéma de clé. Les entiers bornés SMTP et budget IA conservent l’ordre des erreurs de fraction et de limite ; leurs bornes métier restent inchangées. Les parseurs des formulaires et leurs resolvers React Hook Form restent les mêmes. Le mode jitless évite aussi toute tentative de génération de code dynamique, conformément à la CSP production existante. Aucun composant, contrôle, style ou parcours n’est modifié.

Un replay de 74 contrats finis contre les vrais parseurs du commit 5f92677 et le runtime historique verrouillé ne montre aucune différence de réussite, données normalisées, chemins ou messages. Les résultats attendus utiles sont versionnés sous forme de contrats ; le runtime historique utilisé pour établir la référence ne fait partie ni des dépendances ni des tests livrés. Les témoins du service photo couvrent aussi un reçu d’analyse non vide et le refus d’un snapshot privé de ses clés i18n.

### Différence volontaire : prix non fini

JSON accepte une représentation comme 1e309, que JSON.parse transforme en Infinity. Un tel prix est désormais refusé, avec la réponse d’échec habituelle « Invalid input ». Un prix fini de 12,5 reste accepté. Cette différence est volontaire et distincte des 74 contrats finis inchangés. Le refus d’un port SMTP non fini garde son premier message existant ; une note photo non finie garde « Number must be finite ».

## Vérification

Les témoins sur les vrais schémas photo et menu prouvent le refus avant lecture des éléments au-delà de cinq qualités photo ou de 64 images, ainsi que l’acceptation et le parcours effectif à la borne. Les collections génériques array, set et map sont également vérifiées avec un compteur de validation : zéro élément validé au-delà de la borne, et un contrôle positif non vide à la borne. Le témoin de route refuse les tableaux excessifs avant conversion d’image, client appelant ou appel de fournisseur. Les seuils métier ne sont pas augmentés.

Les archives NPM utilisées en comparaison correspondent à l’intégrité du lockfile. Seule l’entrée Zod et sa référence racine changent dans le lockfile ; les résolutions des autres paquets restent identiques.

Validation locale : npm ci dans un dossier node_modules physique propre au worktree ; 16 suites ciblées et 216 tests passent en mono-worker, dont les vrais resolvers Hook Form et les routes. Le témoin CSP échoue avant jitless (une tentative de Function) et passe ensuite avec zéro tentative et deux contrôles de validation réels. Le typecheck complet passe. Le build de production final passe, y compris typage et génération des 50 pages, en mode démo explicite, sans fichier .env ni accès à un projet Supabase. La validation locale utilise Node 25.8.1 ; la CI utilise Node 22. La suite complète et les E2E restent du ressort de la CI de la branche. Aucune action en production n’est comprise dans ce lot.
