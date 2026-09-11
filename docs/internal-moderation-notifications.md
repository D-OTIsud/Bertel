# Notifications des propositions internes

Une proposition interne (`pending_change` sans `submission_id`) crée une notification pour les personnes autorisées à modérer la fiche, sauf son auteur. La cloche affiche le nom du contributeur et de la fiche et ouvre directement `/moderation?object=…`. Le portail partenaire conserve ses notifications de tâche existantes.

Les sections d'un même contributeur sur une même fiche partagent une alerte tant qu'au moins une proposition reste en attente. Une validation partielle conserve l'état lu et envoyé ; la dernière décision retire l'alerte. Une nouvelle proposition après résolution crée une nouvelle alerte. Un index unique et un verrou transactionnel protègent les soumissions simultanées. Les droits et l'existence de propositions en attente sont revérifiés lors de la lecture et de la préparation des e-mails.

Les e-mails utilisent le relais configuré dans **Réglages → E-mails & SMTP**. Ils contiennent les noms et le lien authentifié vers la modération, sans le contenu proposé. La soumission déclenche une tentative après le traitement du lot, y compris en cas de succès partiel. Les relevés de la cloche réessaient aussi lorsqu'une proposition interne apparaît dans les notifications chargées. Cette reprise nécessite une session ouverte ; aucun ordonnanceur externe n'est ajouté. Un SMTP absent ne consomme pas les tentatives et n'empêche pas la soumission ni la notification dans la cloche. Le mécanisme existant conserve ses verrous d'envoi de dix minutes et son plafond de cinq échecs.

## Mise en service

1. Configurer `NEXT_PUBLIC_APP_URL` avec l'origine publique de l'installation ; Compose la transmet au serveur pour les liens des e-mails.
2. Déployer le frontend et le serveur Next avant la migration SQL. L'ancien serveur ne sait pas traiter le nouveau type d'e-mail.
3. Appliquer `supabase/migrations/20260911152231_internal_pending_change_notifications.sql` dans une transaction, puis vérifier les fonctions, index et déclencheur. La migration ne modifie pas les rôles, les propositions existantes ou la configuration SMTP.
4. Configurer le relais SMTP si nécessaire. Les tests automatiques remplacent l'envoi réel et les tests SQL annulent leurs fixtures.

Le scénario SQL `Base de donnée DLL et API/tests/test_internal_pending_change_notifications.sql` couvre les destinataires, l'isolation, le regroupement, les décisions partielles et complètes, les notifications du portail et le suivi des tentatives d'e-mail. Il est intégré au contrôle d'installation SQL depuis une base vide.
