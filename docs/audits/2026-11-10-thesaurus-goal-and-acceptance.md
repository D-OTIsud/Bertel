# Objectif et critères d’achèvement du thésaurus

Objectif suivi : corriger et vérifier le thésaurus Bertel de bout en bout, ses
métadonnées multilingues, contrats API publics, publications courantes et
historiques, noms métier français, documentation, tests et livraison de production.

L’extension demandée le 10 novembre couvre également **tous les catalogues
d’administration et chaque élément, enfant et relation**, au-delà des 78 domaines
actuellement adaptés. Le suivi d’objectif de cette conversation reste actif. Son
outil ne permet de modifier que son statut ; ce fichier conserve donc les critères
élargis sans clore ni recréer artificiellement l’objectif.

## Acquis à préserver

- Publication 25 : 1 477 concepts, dont 1 362 publics et 115 privés ; 78 domaines,
  dont 66 publics et 12 internes ; noms et définitions FR/EN/ES/DE.
- Les 152 comparaisons du corpus éditorial ont déjà réussi sans divergence.
- Aucun ancien manifeste ne doit être réécrit à partir des métadonnées courantes.
- Le checkout principal et les décisions métier déjà validées sont préservés.

## Critères d’achèvement

1. Tous les endpoints et paramètres du thésaurus possèdent un contrat testé :
   valeurs par défaut, filtres réellement appliqués ou refus explicite, quatre
   langues, repli régional puis français, JSON-LD, pagination, ETag et 304.
2. Chaque nouvelle publication fige les noms multilingues des domaines. Les
   métadonnées et l’empreinte des concepts sont distinguées. L’historique garde
   ses règles et son véritable repli linguistique.
3. Une matrice exhaustive couvre les **104 entrées découvertes** dans
   `internal.v_ref_catalog`, avec leur identité, nom, nombre réel d’éléments, rôle
   sémantique, couverture des identités/enfants/arêtes, traitement, autorité,
   visibilité, état éditorial, tests et preuves de production. Les 103 lignes du
   registre de rangement ne sont pas le même décompte.
4. Les 26 entrées hors adaptateurs sont classées selon leur schéma et leurs usages.
   Les vocabulaires éligibles manquants sont corrigés. Entités référencées,
   documents déposés, tags libres, associations, permissions, fermetures,
   correspondances et registres ont chacun un traitement explicite, sans devenir
   automatiquement des concepts publics ou modifiables.
5. Les contrôles portent sur les identités et cibles, parents récursifs, éléments
   inactifs/dépréciés/non affectables, doublons, orphelins, profondeurs et cycles.
   Les égalités de compteurs ne suffisent pas. Les contextes de classement et les
   groupes de durabilité sont vérifiés séparément.
6. Des invariants détectent les nouveaux catalogues éligibles, éléments et
   relations sans couverture délibérée. Les tests significatifs reproduisent les
   défauts, puis un autre agent vérifie les corrections et leurs sources.
7. Les changements SQL de publication, droits et immutabilité reçoivent une revue
   plus forte avant installation. Les contrôles d’autorité, identités stables,
   données privées, RLS et publications existantes restent protégés.
8. Les tests pertinents et la CI réelle réussissent. La migration native, le
   circuit de publication authentifié et la livraison par image préconstruite
   suivent les protocoles du projet, avec preuves de déploiement et contrôles
   disponibles. Toute limite HTTP authentifiée est indiquée précisément ; aucune
   clé partenaire ou session n’est extraite ni simulée en production.

## État initial de couverture

La lecture de production fournie à l’extension constate 104 catalogues : 78
adaptés, 26 hors adaptateurs. Les 1 477 identités des adaptateurs sont présentes
dans le thésaurus et l’instantané courant, sans manquante ; celui-ci contient 761
liens `broader`. Cela ne vérifie pas encore les catalogues hors adaptateurs ni
l’équivalence exacte de toutes les arêtes parent/enfant.

Les matrices et reçus suivants doivent préciser les résultats acquis et le reste
à vérifier, sans annoncer l’objectif complet avant satisfaction de ces critères.
