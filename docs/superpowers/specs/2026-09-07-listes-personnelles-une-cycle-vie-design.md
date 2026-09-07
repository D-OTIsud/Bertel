# Listes personnelles, mise à la une et cycle de vie

Date : 2026-09-07. Statut : cadrage produit validé par le PO dans cette conversation.
Pilotage : Codex architecte et relecteur ; réalisation : Claude Sonnet 5.

## Règles validées

1. Tous les utilisateurs connectés membres d'une organisation peuvent créer des listes statiques et dynamiques, y compris les lecteurs. Cette décision remplace la restriction superutilisateur du 31 août (17l).
2. La page présente les listes à la une de l'organisation, les listes personnelles de l'appelant et une entrée volontaire vers ses archives. Aucune grille générale de toutes les listes des collègues, y compris pour un administrateur.
3. Une liste devient archivée après 21 jours sans modification effective ni envoi réussi. Le point de départ initial est la création. Lecture, impression, duplication de l'original, partage d'un lien et évolution des résultats d'une liste dynamique ne sont pas une activité de modification/envoi.
4. L'archivage ne désactive ni ne fait tourner le lien public et n'en modifie pas l'expiration. Un lien continue de suivre ses règles explicites d'activation/expiration. Le propriétaire peut retrouver ses archives et restaurer une liste. Modifier ou renvoyer une archive la réactive.
5. Une liste non mise à la une est supprimée définitivement après un an depuis sa dernière modification/envoi (création si aucun). Les items de la liste disparaissent, pas les fiches touristiques ni leurs médias. Les anciens liens deviennent alors inutilisables. Le PO a explicitement validé ce résultat.
6. Le créateur peut proposer sa liste à la une. Un administrateur de la même organisation voit les propositions et les accepte ou les refuse. Il peut mettre directement à la une ses propres listes. Ce circuit est interne à l'interface, sans envoi de notification externe demandé.
7. Une liste à la une est visible à tous les membres de son organisation, jusqu'au retrait par un administrateur. Elle est exemptée de l'archivage et de la suppression automatiques pendant toute sa mise à la une.
8. Une liste à la une est modifiable uniquement par un administrateur de son organisation (et le superutilisateur dans son périmètre d'administration). Son créateur non administrateur ne peut plus l'éditer tant qu'elle est à la une. Les membres peuvent la consulter, imprimer, envoyer, partager et dupliquer.
9. La duplication crée une liste personnelle indépendante, non proposée, non mise à la une, active, avec un nouveau propriétaire et sans reprendre token, historique d'envoi ni destinataire personnel. Une dynamique reste dynamique ; une statique copie les items, positions et notes. L'original n'est pas modifié.
10. Une couverture est dérivée du premier lieu disposant d'une image exploitable lorsque aucune couverture explicite n'a été choisie. Le propriétaire/administrateur peut choisir une autre photo de la sélection. L'absence ou l'échec de chargement d'une image a un repli visuel propre.

## Précisions d'architecture

- Autoriser côté base et côté serveur, pas seulement dans les composants. Conserver l'isolation organisationnelle. Un lien public donne accès à la représentation publique de la liste, pas à sa composition privée.
- Distinguer lecture/utilisation et écriture. Envoyer une liste à la une ne doit pas exiger le droit de modifier son contenu. Un lecteur ne peut pas modifier ou révoquer les réglages de partage communs en envoyant ou copiant le lien.
- Ne pas exposer le destinataire personnel d'une liste proposée ou mise à la une aux autres membres ; proposer/mettre à la une implique de partager le contenu, pas les métadonnées de destinataire.
- Une proposition en attente est lisible par le créateur et les administrateurs de son organisation. L'acceptation/refus ne donne pas un droit d'édition général sur les listes personnelles des collègues.
- Reprendre le seuil administrateur existant (rang >= 30) ; ne pas assimiler un team_lead de rang 10 à un administrateur. Ne pas retirer silencieusement la reprise existante des listes orphelines, tout en gardant la grille personnelle.
- Séparer l'horloge d'activité métier du simple updated_at actuellement touché à chaque UPDATE. Ne pas faire glisser la rétention lors du cron, des lectures, d'un partage, des propositions ou de la résolution dynamique.
- À la sortie de la une, repartir sur une période active complète : le retrait par l'administrateur constitue une réactivation explicite. Ceci évite la suppression immédiate d'une liste maintenue longtemps à la une.
- La rétention doit fonctionner même sans visite de l'interface : tâche planifiée de base, idempotente et documentée. Prévoir des vérifications aux seuils temporels, pas des attentes réelles de 21 jours.
- Ne pas rejouer le manifeste intégral en production ni y appliquer toutes les migrations pendantes. Préparer et tester une migration ciblée et son rollback ; le déploiement et la première purge de données existantes restent une opération à présenter avec son périmètre réel après la revue.

## Critères d'acceptation

- Deux utilisateurs de la même organisation créent chacun une liste et ne voient pas les listes personnelles de l'autre, même en appelant directement les RPC.
- Un lecteur crée une liste depuis la grille, depuis une sélection Explorer et depuis les filtres Explorer.
- Les couvertures fonctionnent pour statiques et dynamiques, notamment si le premier lieu n'a pas d'image et le suivant en a une ; pas de mutation de la liste lors du calcul.
- À 21 jours une liste quitte Mes listes et figure dans Archives ; l'URL publique reste identique et valide si elle l'était.
- Lire/imprimer/partager ne reporte pas l'échéance ; modifier réellement/envoyer avec succès/restaurer la reporte. Un envoi SMTP refusé ne compte pas comme envoi.
- Un administrateur accepte/refuse les propositions de son organisation seulement ; ses propres listes peuvent être mises directement à la une.
- Tous les membres utilisent les listes à la une, mais seul un administrateur modifie l'original. Ni l'ancien créateur ni un membre d'une autre organisation ne contournent cela par RPC.
- Une duplication statique conserve ordre/notes ; une duplication dynamique conserve les filtres. Ni token, ni à-la-une, ni proposition, ni ancien destinataire ne sont hérités.
- La purge à un an supprime les seules listes éligibles ; les listes à la une sont conservées. La maintenance ne modifie pas l'horloge des listes conservées et est sûre lors d'un envoi/modification concurrent.
- Tests ciblés de permissions/contrat/flux UI, typecheck et validation SQL locale, avec limites documentées. Les travaux préexistants d'autres fonctionnalités restent préservés.
