# Intentions d’envoi manuel de listes

Ce lot protège uniquement `POST /api/lists/send`. Le drain des notifications conserve son contrat et ses retries historiques. Aucun plafond SMTP n’est introduit : la mesure user/ORG doit précéder le choix humain des chiffres.

## Contrat

Le navigateur produit un `Idempotency-Key` UUID par geste volontaire. Le serveur vérifie le JWT, le refus découverte, puis `get_list` et `ensure_list_share_link` avec le JWT appelant, y compris pour une reprise. Le contenu préparé et le From exact sont empreintés ; le serveur service réserve ensuite sous le verrou de la liste et relit le droit métier existant au dispatch. SMTP s’exécute après le COMMIT du marqueur `started`, sans verrou DB pendant le réseau. Le réglage SMTP est relu juste avant transmission ; un From modifié depuis le snapshot est un refus certain avant submission.

- Même clé + même snapshot accepté : réponse acceptée, aucun nouvel SMTP.
- Même clé + autre liste/destinataire/snapshot : conflit avant SMTP.
- Tentative commencée ou résultat inconnu : aucune expiration qui autoriserait un retry automatique.
- Renvoi explicitement confirmé : nouvelle clé, référence à l’intention incertaine. Une ancienne réservation sans départ est supersédée sous verrou ; son worker retardé ne peut plus démarrer. Même si l’ancienne requête n’a pas encore atteint le registre, sa clé est fermée durablement par un tombstone avant de permettre la remplaçante ; une arrivée tardive reste refusée. Les empreintes inconnues du tombstone restent NULL, sans inventer une admission ou un envoi.
- Acceptation SMTP connue mais marquage de liste ou ACK de reçu raté : HTTP200 reste conservé. Si l’ACK est absent, la reprise voit l’incertitude et ne réémet pas.

Les reçus internes ne contiennent ni adresse, sujet, corps, secret ou réponse SMTP brute. Leurs empreintes sont pseudonymes, pas anonymes. Ils vivent jusqu’au DELETE réel de leur `object_list` via FK cascade, y compris après archive, logout ou suppression du créateur. Aucun nouveau nettoyage n’est ajouté.

Il ne s’agit pas d’exactly-once SMTP/PostgreSQL. Une acceptation suivie d’un crash peut rester inconnue ; le renvoi confirmé peut donc créer un doublon. Le texte et la confirmation approuvés utilisent le bouton Envoyer, le prompt et la zone d’erreur actuels. Une réponse HTTP perdue est aussi traitée comme inconnue. Aucun résultat d’une ancienne identité/liste ne démarre une requête tardive ni ne réhydrate sa notification dans la nouvelle vue.

## Mesure avant les plafonds

`api.list_email_measurements(p_from,p_until)` est service-only, avec bornes UTC finies alignées à la minute. Il renvoie minute/user UUID/ORG et compteurs, jamais liste/intention/empreinte/adresse/contenu. La minute est une granularité d’observation, pas une fenêtre de quota. Aucun plafond, période de collecte obligatoire ou purge des agrégats n’est inventé.

`admitted` compte les intentions réservées ; `started` le passage durable de la barrière avant SMTP (une panne juste après peut empêcher toute transmission) ; `accepted` les acceptations du relais dont l’ACK DB est confirmé ; `rejected` les refus certains avant submission ; `uncertain` les intentions ayant rencontré une incertitude, éventuellement acceptées ensuite ; `conflicts` les reprises incompatibles. Les catégories ne sont pas toutes disjointes. Une acceptation relais ne prouve pas la livraison destinataire. L’échec d’un ACK peut sous-compter les acceptations, sans autoriser un nouvel effet. Les mesures sont prospectives, limitées à ce chemin et à la flotte exécutant cette version ; ni historique complet ni volume du drain ne sont reconstruits.

## Validation jetable

Dans la CI `sql-fresh-apply` : manifeste canonique, contrat SQL transactionnel, six témoins multi-connexions, puis vrai GoTrue/PostgREST avec clés locales en mémoire et utilisateurs synthétiques confirmés sans e-mail. Les outils refusent les DSN/API non loopback et exigent `LIST_EMAIL_DISPOSABLE=true`. Ils ne lisent aucun `.env` projet et n’appellent jamais SMTP. Les traces append-only éventuelles meurent avec la pile CI.

```sh
psql "$LIST_EMAIL_TEST_DB_URL" -v ON_ERROR_STOP=1 -f "Base de donnée DLL et API/tests/test_distributed_list_email_intents.sql"
node --test tools/list-email/distributed-intents.test.mjs
node --test tools/list-email/postgrest-intents.test.mjs
```

Le second test exige aussi `LIST_EMAIL_SUPABASE_WORKDIR` de la pile jetable. Les tests applicatifs pertinents incluent la route à deux instances, le service et la vraie vue avec promesses différées/ABA, ainsi que Nodemailer10.1.4 contre un pair SMTP synthétique loopback. Le test SMTP remplace TLS uniquement dans son transport factice après avoir vérifié `requireTLS:true` produit ; il ne qualifie pas TLS déployé.

## Bascule et retour arrière à préparer séparément

Aucune application live n’est autorisée par ces tests. Installer/vérifier l’upgrade autonome avant de rendre la nouvelle route disponible. Ne pas lancer `db push` depuis la racine historique, ni repair/renumbering. Le CREATE TABLE refuse un nom préexistant plutôt que masquer une dérive. Les nouvelles fonctions exigent le vrai rôle service avec BYPASSRLS ; anon/authenticated ne gagnent aucun accès. Les grants SELECT/UPDATE sur object_list et SELECT sur l’identité découverte sont limités à service_role pour les invokers et leurs verrous/checks.

Une flotte mixte avec l’ancienne route reste hors garantie : l’ancien serveur ignore les reçus. Prévoir une fenêtre maîtrisée sans ancien worker d’envoi avant réouverture, puis vérifier la version de chaque instance. Les anciens onglets sans clé reçoivent un refus avant SMTP et doivent charger le nouveau client. Une panne du registre ferme le départ avec503 ; aucun fail-open. Ne pas revenir à une route ignorant le registre pendant que l’envoi est ouvert. Garder les reçus existants ; ne pas supprimer les tables pour rollback. Choisir la fenêtre de mesure après livraison contrôlée, exposer sa couverture, puis faire décider les plafonds ; aucune production/collecte réelle n’est effectuée dans ce lot.

Références primaires : [Nodemailer pool](https://nodemailer.com/smtp/pooled), [RFC5321§6.1](https://www.rfc-editor.org/rfc/rfc5321.html#section-6.1), [PostgreSQL17verrous](https://www.postgresql.org/docs/17/explicit-locking.html).
