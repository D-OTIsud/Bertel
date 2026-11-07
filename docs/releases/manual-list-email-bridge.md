# Artefact de transition : envoi manuel toujours fermé

Cette source dérive de S2 `19dbfb2fbd068302b17268f1ef6fa10bc829d483` ; elle
requiert sa propre archive, image et qualification. Ce n'est pas l'image S2 exacte.

`POST /api/lists/send` renvoie toujours503 `email_protection_unavailable` sans
Auth, lecture du corps, accès SQL ou dépendance SMTP. Aucun mode runtime ne peut
rouvrir cette route, même `LIST_EMAIL_MODE=protocol-v1` conservé par erreur.
Les autres e-mails et leurs réglages partagés ne sont pas désactivés.

Le service de cette source traduit uniquement ce code503 par le message approuvé :
« L'envoi est momentanément indisponible. Réessayez dans un instant. » Les autres
codes503 gardent le comportement SMTP existant. Un ancien onglet peut encore
afficher son ancien texte jusqu'au rechargement ; il ne peut pas émettre par cette
route fermée.

Cet artefact sert à fermer avant installation et à revenir vers la logique S2
avec l'envoi manuel fermé. Il ne supprime ni ne réarme les reçus, ne retire aucune
migration et ne réconcilie pas les éventuelles acceptations SMTP legacy. Avant une
future ouverture, le contrat SQL doit être reçu/vérifié et tous les anciens
processus de l'app retirés au profit de la flotte du nouveau protocole qualifiée.
Leur retrait ne prouve ni livraison ni absence de doublon rétrospectif.

Les tests de fermeture remplacent les anciens tests d'émission de cette route,
conservés dans l'historique S2. Cela ne qualifie aucune mise en ligne de cet artefact.
