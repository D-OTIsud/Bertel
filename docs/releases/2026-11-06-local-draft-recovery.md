# Récupération du brouillon lorsque le stockage local échoue

Une erreur de quota ou d’accès au stockage local conserve la saisie et affiche durablement le message validé :

> Brouillon local indisponible — Vos modifications restent dans cet onglet. Enregistrez ou exportez-les avant de fermer.

Le bouton « Exporter le brouillon JSON » télécharge les modules courants depuis la mémoire de l’éditeur. Il reprend le format `bertel-object` version2 de l’import existant et retire les catalogues de référence. Il n’effectue aucune lecture serveur ou Storage, aucun enregistrement, aucune suppression et aucun acquittement de conflit. Le contexte de session observable (compte, organisation, rôle, realm et statut), l’objet affiché, la ressource et l’éditeur doivent encore correspondre au clic. Aucun état de session n’est ajouté au fichier.

L’export laisse la saisie, la baseline, les conflits et l’avertissement en place. Le fichier peut être repris par l’import actuel, avec sa confirmation et sa revue avant enregistrement. Il contient les modules saisis ; les métadonnées de conflit de l’onglet ne sont pas restaurées automatiquement par cet import. Les exports JSON/CSV ordinaires continuent d’utiliser la version enregistrée.

Une copie locale dont la lecture a échoué n’est plus traitée comme absente, puis nettoyée. Elle reste préservée ; une lecture redevenue possible ne réhydrate pas tardivement cette copie sur une nouvelle saisie. Une véritable écriture locale réussie du brouillon courant, ou le nettoyage déjà prévu après son enregistrement, rétablit l’état normal. Aucun mécanisme de purge ou délai de rétention nouveau n’est introduit.

Validation locale : quatre suites et92tests avec vrais hooks/éditeur/sérialiseur/importeur, ainsi que TypeScript ; dix nouveaux cas d’export couvrent la saisie courante, les conflits, les erreurs, le contexte et la reprise. Les anciennes variantes échouent sur l’absence du bouton ou le changement de contexte avant correction. Le navigateur Chromium sur l’application Next de démonstration a produit et relu le vrai téléchargement, vérifié la copie précédente et le rendu à320/390/1180px, avec le réseau client borné à l’origine locale. Cette recette locale précède seulement le renforcement final de la garde de contexte ; la CI du gel final doit qualifier la combinaison complète. Les services de sauvegarde des tests unitaires sont simulés ; aucune persistance en production n’est revendiquée.

Contre-revue indépendante et CI complètes requises avant intégration. Aucun déploiement en production par ce lot source.
