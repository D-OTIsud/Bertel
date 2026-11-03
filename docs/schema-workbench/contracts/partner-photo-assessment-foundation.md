# Analyse photo et recours — préparation OFF

Ce lot prépare le backend sans activer une analyse, choisir un moteur ou un budget, ni modifier le parcours photo B. Il n’ajoute aucun écran. Le dessin de P reste soumis à validation séparée.

## Activation future explicite

`internal.portal_photo_analysis_settings` est livré avec `enabled=false`, `daily_analysis_limit=NULL`, `provider_id=NULL`. Ces trois valeurs doivent être décidées et renseignées ensemble avant activation : fournisseur vision existant, budget d’analyses photo par acteur et par jour, puis accord d’activation. Un fournisseur actif pour les menus n’active pas l’analyse photo. Aucun seuil de note ou publication automatique n’est configuré.

Le budget photo est indépendant du budget d’extraction menu et du stock R5. Un dépôt ne lance jamais d’analyse implicitement ; vingt dépôts ne dépendent donc pas d’un fournisseur ni d’un quota IA. Les paramètres de connexion et le secret viennent du registre IA/Vault existant, jamais d’un formulaire partenaire. Le provider sélectionné doit être actif et compatible avec l’adaptateur vision existant ; son ID et sa révision sont épinglés au reçu avant dispatch.

## Reçus et coût

`POST /api/portal-photo/analyze` accepte uniquement `{objectId,documentId,requestId}`. Le serveur authentifie la personne ; le RPC vérifie fiche, acteur, droits non expirés, realm, module non masqué, reçu privé lui appartenant et hash des octets traités. Le UUID identifie une intention. Une analyse déjà confirmée ou incertaine du même fichier/version est relue, sans second appel fournisseur, même sous un nouveau UUID.

La réservation du budget est atomique sous le verrou acteur propre à ce domaine. Le jour et l’instant de reprise sont calculés en `Indian/Reunion`. Une préparation traversant minuit doit gagner une place dans le nouveau jour avant dispatch. La route relit le fournisseur et les octets privés, vérifie le hash, puis marque durablement le début d’une unique tentative avant l’appel. L’adaptateur existant est réutilisé sans réparation automatique payante. Le budget maximal de route est soixante secondes ; un reçu commencé mais sans résultat après ce délai se présente comme incertain, sans reprise implicite.

Une panne avant dispatch est `unavailable`, sans note, et libère la réservation d’analyse. Une fois le dispatch marqué, une panne, un résultat invalide ou une réponse perdue restent `uncertain` et ne libèrent pas automatiquement ce budget. Un nouveau UUID ne permet pas de contourner cette absence de confirmation. Le résultat durable ou son état se relit par `GET ...?requestId=...` ; une indisponibilité confirmée avant dispatch demande une nouvelle intention explicite si l’utilisateur souhaite réessayer.

Le contrat d’évaluation `photo-quality-v1` contient une note bornée 0–10, une synthèse, au plus cinq points forts et huit difficultés techniques accompagnées de suggestions. TypeScript et SQL refusent les champs de décision inconnus, résultats trop longs et notes hors plage. Chaque résultat porte `publication=office_review`, même avec une note de dix. Une panne n’est jamais une mauvaise note. Aucune fonction de ce lot ne crée, publie, retire ou remplace un média canonique, ni n’approuve une proposition B.

## Recours humain

`POST /api/portal-photo/analyze/appeal` accepte `{requestId,clientId,body}`. Le propriétaire actuel de la photo peut demander une relecture ; le même UUID et le même texte retrouvent la même conversation. Le RPC réutilise `send_portal_message` avec le sujet `correction` et le genre de notification existant `portal_message`.

Les documents photo ne sont pas présentés comme des attachments `portal_message`. Le recours envoie une liste d’attachments vide et persiste l’association exacte `analyse + document + hash` dans l’interaction CRM et dans le reçu d’analyse. Le suivi et les réponses empruntent les messages existants ; le reçu expose l’identifiant et le statut de cette conversation. Aucun appel fournisseur ne se produit au dépôt ou au réessai du recours.

Un patch d’autorisation ciblé et gardé par empreinte complète `portal_photo_preview` : après un recours concret, le correcteur canonique du même realm peut signer cet unique document via la route d’aperçu privé existante. Avant le recours, hors proposition B, ce nouveau droit n’existe pas. Le contrôle acteur et la durée de signature restent inchangés ; aucune URL publique ni pièce jointe de message n’est fabriquée. Le reçu expose `sourceCurrent` ; une réparation privilégiée changeant le hash rend l’analyse obsolète et ferme ce nouvel aperçu, pour ne pas présenter d’autres octets comme la photo analysée.

Le recours prend le verrou acteur des messages existant **avant** objet/opération, afin de ne pas inverser l’insertion CRM/FK de `send_portal_message`. Analyse : verrou acteur analyse, puis objet, reçu photo, opération. Aucun verrou de proposition/soumission n’est pris après l’objet, et les fonctions R5/R6 restent inchangées.

## Vérification et limites

La migration `20261103084816_partner_portal_photo_assessment_foundation_off.sql` doit suivre R5 et la préparation de lecture R3b. Le test SQL `test_partner_photo_assessment_foundation.sql` utilise `setup_partner_photo_stock.sql`, de vrais rôles et la garde éphémère ; toutes ses écritures, y compris l’activation fictive et le fournisseur `provider.invalid`, sont annulées dans la base jetable. Il ne contacte aucun fournisseur. Il vérifie OFF, quota distinct, minuit Réunion, reprise/déduplication, résultat strict, absence de publication, reprise du recours et confidentialité.

Les tests de routes injectent le fournisseur pour contrôler les octets/hash, le marquage unique, l’absence d’appel OFF, les résultats incertains et le recours sans dépense. Ils ne prouvent pas la capacité d’un moteur réel : aucune configuration active et aucun appel externe n’ont été utilisés pour cette implémentation. Une recette fournisseur, budget/conditions d’activation et validation de l’écran restent nécessaires avant d’ouvrir P. Aucun worker supplémentaire n’est introduit ; le backend garde les résultats et états connus, sans promettre une reprise après crash.
