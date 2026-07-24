# Communication partenaires — fenêtre taxonomie HLO §190

**Statut** : modèles prêts, envoi à effectuer par le PO avant/après la fenêtre cloud conformément à PO-7.

## 1. Pré-annonce à envoyer avant la fenêtre

**Objet : Évolution planifiée de la taxonomie des hébergements Bertel**

Bonjour,

Nous prévoyons une évolution de la taxonomie des hébergements HLO le **[date] entre [heure début] et [heure fin], heure de La Réunion**.

Cette évolution clarifie la distinction entre la nature d’un hébergement et sa forme. Les identifiants de fiches et leur `object_type` ne changent pas. Les changements visibles concernent les codes/libellés et chemins taxonomiques, le catalogue de référence, ainsi que la classe `@type` du profil DATAtourisme. Les formats schema.org, Apidae et Tourinsoft ne changent pas.

Les 476 fiches HLO publiées recevront un nouvel `updated_at`, afin que votre synchronisation incrémentale les récupère automatiquement. Après confirmation de livraison, merci de recharger également `/api/public/catalog?domains=taxonomy_hlo`, le catalogue ne disposant pas d’ETag.

Aucune action n’est attendue avant notre message de confirmation. En cas de question, vous pouvez répondre à ce message.

Cordialement,

**[nom / équipe OTI Sud]**

## 2. Confirmation à envoyer uniquement après toutes les preuves vertes

**Objet : Livraison effectuée — taxonomie des hébergements Bertel**

Bonjour,

L’évolution de la taxonomie des hébergements HLO a été livrée le **[date et heure, heure de La Réunion]**.

Les contrôles post-livraison sont conformes : arbre et chemins taxonomiques, 476 fiches HLO, filtres par sous-arbre, pagination, recherche et profils d’interopérabilité. Les sorties schema.org, Apidae et Tourinsoft restent identiques ; DATAtourisme distingue désormais notamment `Guesthouse`, `SelfCateringAccommodation`, `GroupLodging` et `StopOverOrGroupLodge` selon la taxonomie de la fiche.

Votre synchronisation incrémentale peut récupérer les fiches via leur nouvel `updated_at`. Merci de recharger également le catalogue :

`GET /api/public/catalog?domains=taxonomy_hlo`

Si vous constatez une divergence, transmettez-nous l’identifiant de la fiche et le format consommé.

Cordialement,

**[nom / équipe OTI Sud]**

## 3. Message de rollback, uniquement en cas d’annulation

**Objet : Annulation de l’évolution taxonomique Bertel**

Bonjour,

L’évolution annoncée de la taxonomie HLO a été annulée le **[date et heure]** après détection d’une divergence de contrôle. L’état antérieur a été restauré et les 476 fiches ont été re-signalées par `updated_at`.

Merci de relancer votre synchronisation incrémentale et de recharger `/api/public/catalog?domains=taxonomy_hlo`. Une nouvelle fenêtre sera annoncée après analyse.

Cordialement,

**[nom / équipe OTI Sud]**

## 4. Trace d’exécution à compléter

| Action | Responsable | Horodatage RUN | Preuve |
|---|---|---|---|
| Pré-annonce envoyée | PO | À compléter | lien/message-id |
| Fenêtre ouverte | Dev/DBA | À compléter | journal de déploiement |
| T1–T10 et API live verts | Dev/DBA | À compléter | rapport §190 |
| Confirmation envoyée | PO | À compléter | lien/message-id |
| Surveillance 24 h terminée | Dev/DBA | À compléter | métriques/logs |

La confirmation ne doit jamais être envoyée avant la réussite des preuves post-application. En cas de rollback, utiliser exclusivement le troisième modèle.

