# Relevé ciblé du contrat éditorial du thésaurus

La requête [thesaurus_editorial_policy_catalog.sql](thesaurus_editorial_policy_catalog.sql)
est un unique `SELECT`. Elle relève les signatures, propriétaires, ACL et empreintes
des fonctions concernées, les politiques RLS du schéma privé, les exigences des
vocabulaires et leurs contraintes. Elle ne retourne aucun concept, document de
révision, jeton, corps de fonction ou ligne métier.

Exécuter cette requête via le connecteur Supabase **Bertel**, projet
`ryycrdhlkmzpxwwwwupy`, après confirmation des migrations installées. Enregistrer
uniquement l'objet `supplement`, sans l'enveloppe de transport, puis y joindre la
provenance réelle du transport et du projet. Ne jamais déduire l'environnement du
seul nom de base `postgres`.

Le premier relevé de cette livraison est
[THESAURUS_EDITORIAL_POLICY_PHASE1_CATALOG.json](../../db-graph-out/THESAURUS_EDITORIAL_POLICY_PHASE1_CATALOG.json).
Il observe seulement les trois premières migrations. Le complément final doit
être capturé après confirmation de l'installation du correctif des recherches
héritées et de la politique des quatre langues.

La requête est étendue pour le relevé final : elle inclut les gardes et triggers
des huit sources natives, la colonne privée `legacy_search_terms`, la génération
active et les index de `thesaurus.release_concept`. L'index ciblé
`thesaurus_public_target_lookup_idx` doit être présent, valide, prêt et vivant,
avec la clé `(release_id, (concept_id::text))`, la colonne incluse `concept_id`
et le prédicat `is_public`. Cette extension du périmètre d'observation ne signifie
pas que les fonctions de garde sont nouvelles.

Le relevé final attend aussi les migrations `thesaurus_public_target_lookup_index`
et `thesaurus_admin_rpc_timeout`. Cette dernière borne le délai de la façade
administrative à 30 secondes par un réglage `SET`. Seule l'empreinte
`definition_md5` peut changer de ce fait : le DDL restitué inclut ce réglage.
Le corps `prosrc` de `api.thesaurus_admin(text,jsonb)` doit rester strictement
identique à la phase 1, avec `body_md5 = 74693eebd27b41db9afc57237c95ff28`.
La capture finale relève aussi `prosrc_md5`, sans normalisation, qui doit avoir
cette même valeur pour la façade. Ses ACL, propriétaire et autorisation doivent
être conservés. Un changement du corps ne peut jamais être justifié par la seule
modification de `proconfig`.
Ne pas annoncer la phase 2 ni une nouvelle génération sur la seule base d'une
validation de brouillons : attendre la confirmation de leur publication et de
l'installation de la politique avant de capturer la preuve finale.

Pour comparer les deux observations, vérifier les identités de domaines, les
flags `is_public`/`is_governed`, les ACL/RLS, le propriétaire et les droits du rôle
de publication, ainsi que les empreintes du noyau `activate` et des projections
publiques. Les changements attendus concernent les validateurs, la lecture privée
des termes hérités, leur writer et son registre de préparation, ainsi que le
réglage de délai de la façade administrative documenté ci-dessus. Un autre écart
doit être expliqué ; aucune empreinte différente n'est réputée acceptable du seul
fait qu'une migration a réussi.

Ce relevé est un supplément. En l'absence de `TBLS_DSN`, il ne remplace pas la
régénération complète décrite dans [README.md](README.md) et ne réécrit ni
`graph.json`, ni les pages de tables, ni la référence HTML. Le collecteur général
pourra l'absorber lors d'une prochaine extraction complète vérifiée.
