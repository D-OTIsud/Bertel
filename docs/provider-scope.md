# Périmètre prestataires

**Statut au 30 octobre 2026 : migration SQL appliquée sur Bertel V3**, version
`20261030123304_provider_scope_preference`. Le code du toggle est intégré à la
livraison sur `master` demandée par l’utilisateur. Le
[compte rendu](releases/2026-10-30-filtre-prestataire.md) décrit
les vérifications effectuées directement sur la base à la demande de l’utilisateur.

Le [plan d’exécution du 30 octobre 2026](plans/2026-10-30-plan-filtre-prestataire.md)
décrit la proposition initiale. La consigne ultérieure de travailler directement
sur Bertel V3 remplace la validation sur une base isolée. La nouvelle collecte
historique et la correction distincte des anciennes RPC globales restent différées.

Le toggle « Avec prestataire uniquement » est dans le groupe Catégorie, sous les
choix de catégories, sur le dashboard et l’explorateur. Il est désactivé par défaut.

Un objet appartient au périmètre s’il porte au moins un `actor_object_role` dont
`valid_from` est absent ou atteint et `valid_to` est absent ou non dépassé. Les bornes
sont inclusives, avec une date de référence dans `Indian/Reunion`. La règle
validée par l’utilisateur le 30 octobre 2026 retient tout
acteur rattaché, quel que soit son rôle, y compris un éditeur de contenu. Le lien
n’a pas besoin d’être principal. Plusieurs liens ne multiplient jamais le nombre
d’objets.

Le choix explicite du toggle (ou le retrait de sa pastille) est enregistré dans
`app_user_profile.preferences.provider_only` et partagé entre les deux écrans.
L’écriture utilise une fusion atomique, n’accepte aucun identifiant utilisateur et
conserve la RLS du profil. Une erreur restaure l’état précédent et affiche un message.
Une reconnexion recharge le choix du compte, y compris sur un autre appareil.
La réinitialisation des autres filtres conserve ce périmètre personnel.

Les liens d’exploration portent `providerOnly=true` ou `false` ; leur ouverture peut
temporairement remplacer le périmètre de l’explorateur sans modifier la préférence
du compte ni le dashboard. Les anciens liens sans ce paramètre héritent du choix
personnel. Les filtres SQL émettent `has_provider=true` uniquement quand il est actif.
Les listes dynamiques et le passage dashboard → explorateur gardent ce critère.

Les statistiques sur les objets utilisent le moteur commun de filtres. Les trois
nouvelles RPC `get_dashboard_provider_crm_open`, `get_dashboard_provider_crm_activity`
et `get_dashboard_provider_team_activity` conservent les formules des RPC globales.
Le critère prestataires s’applique à ces indicateurs d’activité ; les autres facettes
restent propres aux statistiques sur les objets. Un échange CRM sans objet est
conservé si son acteur porte un lien actif vers un objet du périmètre. Si un objet
est renseigné, c’est cet objet qui décide : un acteur lié ailleurs ne suffit pas.
Les tâches suivent leur objet. Les corpus réels et de test restent séparés.

Depuis `20261030133440_dashboard_realm_consistency`, cette séparation vaut aussi
pour les trois RPC d'activité sans filtre prestataires : les deux modes partent
du même périmètre du compte. Voir la
[correction et ses vérifications](releases/2026-10-30-dashboard-real-test.md).

Les anciens relevés de `metric_snapshot` n’enregistrent pas ce découpage. Avec le
toggle actif, leurs widgets indiquent l’indisponibilité de l’historique et ne
chargent pas les courbes globales. Aucun historique antérieur n’est inventé.

Sans le toggle, les courbes utilisent les relevés explicitement marqués réels ou
de test. L'historique réel de remplissage est rétabli depuis le 19 juin 2026 après
vérification de sa provenance ; les autres indicateurs et le test disposent des
relevés séparés collectés depuis le 30 octobre. Les archives d'origine restent
conservées avec `is_test IS NULL`. La capture quotidienne calcule les deux
ensembles séparément. La durée affichée utilise les dates des relevés sources,
indépendamment du regroupement hebdomadaire. Voir la
[sélection et les contrôles](releases/2026-10-30-completeness-history.md).

## Livraison et vérification

La migration `supabase/migrations/20261030123304_provider_scope_preference.sql`
est appliquée. Le manifeste `ci_fresh_apply.sql` inclut cette migration et
`tests/test_provider_scope_preference.sql`, qui s’exécute dans une transaction annulée.
Le retour arrière du moteur est dans
`Base de donnée DLL et API/rollback/rollback_provider_scope_preference.sql`.
Il vérifie l’empreinte de la fonction avant restauration et conserve les données.

`tools/provider-scope-validation.mjs` exécute la migration deux fois dans PostgreSQL
isolé via une installation externe de PGlite, puis vérifie les préférences/RLS,
dates de liens, déduplication, rattachements CRM, tâches, activité, temps net et les
deux corpus. Le modèle de test réduit les facettes de recherche/géographie sans
remplacer les calculs des RPC. Il ne remplace pas une application complète du schéma
avec PostGIS et ses déclencheurs. Aucun accès à une base distante n’est nécessaire.
