# Intentions d’envoi manuel de listes

Ce lot protège uniquement `POST /api/lists/send`. Le drain des notifications conserve son contrat et ses retries historiques. Aucun plafond SMTP n’est introduit : la mesure user/ORG doit précéder le choix humain des chiffres.

## Contrat

L’endpoint reçoit un POST explicite par phase. Avant le geste d’envoi, `context`
lit les générations autorisées sans créer de reçu ou de permis. Le service client
copie ce contexte, la nouvelle clé `Idempotency-Key` UUID et les parents confirmés
avant sa première attente. Une génération absente du contexte vaut `0` ; le geste
ne recharge ni ne réessaie automatiquement une génération devenue ancienne.

1. `prepare` vérifie le JWT, le refus découverte, puis `get_list` et
   `ensure_list_share_link` avec le JWT appelant. Le contenu et le From exact sont
   empreintés ; le serveur service réserve sous le verrou de la liste avec la
   génération capturée. Sa réponse `prepared` contient un permis UUID lié à la
   clé courante. Cette phase ne transmet aucun SMTP et ne déclenche pas elle-même
   `dispatch`. Une réponse perdue ou malformée n’autorise aucune continuation.
2. Après réception d’un permis valide pour la même clé, `dispatch` relit droits
   et snapshot et consomme ce permis par CAS. SMTP s’exécute après le COMMIT du
   marqueur `started`, sans verrou DB pendant le réseau. Le réglage SMTP est
   relu juste avant transmission ; un From modifié est un refus certain avant
   submission. Le permis n’est jamais créé par `dispatch`.
3. Une réponse `accepted` liée à la même clé fournit une preuve HEX64 distincte
   du permis UUID. Le client lance `ack` indépendamment et sans bloquer le succès
   connu. Cet ACK technique ne peut régler que son reçu déjà accepté et la preuve
   exacte ; il ne prouve ni lecture humaine ni livraison au destinataire. Une
   reprise `prepare` déjà acceptée saute `dispatch` et tente seulement cet ACK.

- Même clé + même snapshot : même permis tant que réservé, ou réponse acceptée si connue ; aucun nouvel SMTP implicite.
- Même clé + autre liste/destinataire/snapshot : conflit avant SMTP.
- Tentative commencée ou résultat inconnu : aucune expiration qui autoriserait un retry automatique.
- Renvoi explicitement confirmé : nouvelle clé, référence à l’intention incertaine. Une ancienne réservation sans départ est supersédée sous verrou ; son worker retardé ne peut plus démarrer. Même si l’ancienne requête n’a pas encore atteint le registre, sa clé est fermée durablement par un tombstone avant de permettre la remplaçante ; une arrivée tardive reste refusée. Les empreintes inconnues du tombstone restent NULL, sans inventer une admission ou un envoi.
- Acceptation SMTP connue mais marquage de liste, écriture du résultat ou ACK technique raté : HTTP200 reste conservé. Un ACK lent, perdu ou rejeté ne retient pas la vue occupée et ne transforme pas ce succès en erreur réessayable. Sans reçu accepté et ACK durable, une découverte ultérieure peut rester incertaine et ne réémet pas.

Les reçus internes ne contiennent ni adresse, sujet, corps, secret ou réponse SMTP brute. Leurs empreintes sont pseudonymes, pas anonymes. Ils vivent jusqu’au DELETE réel de leur `object_list` via FK cascade, y compris après archive, logout ou suppression du créateur. Aucun nouveau nettoyage n’est ajouté.

Il ne s’agit pas d’exactly-once SMTP/PostgreSQL. Une acceptation suivie d’un crash peut rester inconnue ; le renvoi confirmé peut donc créer un doublon. Le texte et la confirmation approuvés utilisent le bouton Envoyer, le prompt et la zone d’erreur actuels. Une réponse HTTP perdue est aussi traitée comme inconnue. Aucun résultat d’une ancienne identité/liste ne démarre une requête tardive ni ne réhydrate sa notification dans la nouvelle vue.

## Mesure avant les plafonds

`api.list_email_measurements(p_from,p_until)` est service-only, avec bornes UTC finies alignées à la minute. Il renvoie minute/user UUID/ORG et compteurs, jamais liste/intention/empreinte/adresse/contenu. La minute est une granularité d’observation, pas une fenêtre de quota. Aucun plafond, période de collecte obligatoire ou purge des agrégats n’est inventé.

| Compteur | Événement enregistré dans la transaction |
|---|---|
| `admitted` | Création d’une intention réservée ; une reprise exacte ne recompte pas. |
| `started` | Passage durable de la barrière avant SMTP ; une panne juste après peut encore empêcher toute transmission. |
| `accepted` | Acceptation du relais enregistrée durablement par `complete_list_email`, indépendamment de l’ACK technique du client. |
| `rejected` | Résultat classé comme refus certain avant submission. |
| `uncertain` | Première incertitude par reçu (`unknown_at`), éventuellement accepté ensuite. |
| `conflicts` | Chaque verdict `conflict` de `prepare_list_email` ou `begin_list_email`, après autorisation de la liste demandée, attribué à son utilisateur/ORG. |

Les conflits couvrent la reprise d’une clé incompatible ou supersédée, un parent
existant d’une autre liste/destination, la collision de clé interlistes traitée
par `unique_violation`, et le permis/snapshot incompatible au dispatch. Le
gestionnaire d’exception mesure après le rollback de son bloc. Un rollback de
la transaction appelante annule aussi ses mesures.

`stale`, `unknown`, `forbidden`, erreur de validation, reprise exacte et ACK
technique refusé ne sont pas des conflits. Répéter un appel incompatible peut
donc augmenter `conflicts` plusieurs fois sans créer une intention ni transmettre
un e-mail : ce compteur n’est ni dédupliqué par geste ni du volume SMTP. Les
catégories ne sont pas toutes disjointes. Une acceptation relais ne prouve pas la
livraison destinataire ; l’échec de son enregistrement DB peut sous-compter
`accepted`, sans autoriser un nouvel effet. Les mesures sont prospectives et
limitées à cette route/flotte ; ni historique complet ni volume du drain ne sont
reconstruits. Aucun seuil ni collecte de quota réelle ne découle de ces tests.

## Validation jetable

La recette complète appartient au job `sql-fresh-apply`, sur une nouvelle pile
CI dont l’absence initiale de conteneur/volume est attestée. Le contrat SQL
transactionnel, huit témoins multi-connexions puis le vrai GoTrue/PostgREST
utilisent des identités synthétiques confirmées sans e-mail et des clés locales
en mémoire. Ils n’appellent jamais SMTP ; les traces append-only meurent avec
cette pile. Les huit témoins incluent une collision interlistes où le second
backend attend réellement le premier avant de vérifier le compteur conservé
après le rollback d’exception.

Ne pas lancer le fichier SQL avec un `psql` brut ou adopter une pile déjà en
service. Le workflow fournit ses paramètres CI/run/attempt/job, `RUNNER_TEMP`,
`LIST_EMAIL_DISPOSABLE=true`, `LIST_EMAIL_SUPABASE_WORKDIR` et le DSN loopback
canonique. Toute surcharge PG/proxy, projet lié ou cible étrangère est refusée.
Ordre des étapes versionnées de ce job :

```sh
node --test tools/list-email/disposable.test.mjs tools/list-email/sql-session.test.mjs
node tools/list-email/init-disposable.mjs --prepare
# Le workflow démarre ensuite sa pile Supabase neuve.
node tools/list-email/init-disposable.mjs --verify-start
# Le workflow applique ensuite le manifeste canonique fresh.
node tools/list-email/init-disposable.mjs
node tools/list-email/sql-fixture.mjs
node --test tools/list-email/distributed-intents.test.mjs
node --test tools/list-email/postgrest-intents.test.mjs
```

`--prepare` précède le démarrage ; `--verify-start` contrôle la propriété avant
fresh. L’initialisation sans option vient après fresh et lie nonce/identifiant
physique PostgreSQL à la même cible DSN et API. `sql-fixture.mjs` et les deux
harnais passent ensuite par `loadListEmailDisposable` et son `spawnPsql` à
environnement assaini, sans `.env` projet ni sortie brute. Le nettoyage de la
pile n’est admis que si l’étape de propriété du workflow a réussi ; ce marqueur
ne donne aucun droit d’arrêter une autre pile.

Les tests applicatifs pertinents incluent la route à deux instances, le service
et la vraie vue avec promesses différées/ABA, ainsi que Nodemailer10.1.4 contre
un pair SMTP synthétique loopback. Le transport factice vérifie `requireTLS:true`
puis remplace TLS pour son seul témoin ; il ne qualifie pas TLS déployé.

## Bascule et retour arrière à préparer séparément

Aucune application live n’est autorisée par ces tests. Installer/vérifier l’upgrade autonome avant de rendre la nouvelle route disponible. Ne pas lancer `db push` depuis la racine historique, ni repair/renumbering. Le CREATE TABLE refuse un nom préexistant plutôt que masquer une dérive. Les nouvelles fonctions exigent le vrai rôle service avec BYPASSRLS ; anon/authenticated ne gagnent aucun accès. Les grants SELECT/UPDATE sur object_list et SELECT sur l’identité découverte sont limités à service_role pour les invokers et leurs verrous/checks.

Une flotte mixte avec l’ancienne route reste hors garantie : l’ancien serveur ignore les reçus. Prévoir une fenêtre maîtrisée sans ancien worker d’envoi avant réouverture, puis vérifier la version de chaque instance. Les anciens onglets sans protocole valide reçoivent un refus avant SMTP et doivent charger le nouveau client. Une panne du registre ferme le départ avec503 ; aucun fail-open. Ne pas revenir à une route ignorant le registre pendant que l’envoi est ouvert. Garder les reçus existants ; ne pas supprimer les tables pour rollback. Choisir la fenêtre de mesure après livraison contrôlée, exposer sa couverture, puis faire décider les plafonds ; aucune production/collecte réelle n’est effectuée dans ce lot.

Références primaires : [Nodemailer pool](https://nodemailer.com/smtp/pooled), [RFC5321§6.1](https://www.rfc-editor.org/rfc/rfc5321.html#section-6.1), [PostgreSQL17verrous](https://www.postgresql.org/docs/17/explicit-locking.html).
