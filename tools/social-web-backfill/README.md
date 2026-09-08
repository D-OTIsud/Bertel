# Reprise des réseaux sociaux et plateformes de réservation

Préparation du 7 septembre 2026 à partir du CSV fourni. La décision finale de l'utilisateur est d'arrêter les vérifications automatiques des URL et de confier les vérifications restantes aux utilisateurs au fil de l'eau.

**Application effectuée sur V3 distante le 7 septembre 2026, vérifiée à 07:08 UTC : 1 281 liens insérés, 10 liens du lot déjà présents, 1 291 liens sélectionnés retrouvés. Les 26 liens préexistants sont intégralement inchangés.** Le rapport, le journal et le retour arrière généré sont conservés dans le dossier d'audit. Aucun accès à la base locale lors de cette application.

La sélection conserve donc les liens bloqués par une connexion, un CAPTCHA ou l'arrêt des sondes d'une plateforme. Les URL malformées ou incohérentes et les liens déjà identifiés comme indisponibles restent exclus. Aucun nouveau contrôle HTTP n'est requis pour préparer le lot.

## Résultat

Les 1 535 entrées non vides se répartissent sans perte :
- 1 281 nouveaux liens proposés ;
- 10 liens identiques déjà présents, conservés ;
- 28 liens indisponibles rattachés à un objet V3, exclus ;
- 203 entrées sans correspondance V2 → V3, isolées ;
- 13 entrées invalides ou incohérentes, isolées.

53 URL indisponibles ont été observées sur l'ensemble du fichier : 28 rattachées à V3 et 25 déjà classées sans correspondance. Elles ne doivent pas être additionnées une seconde fois aux catégories ci-dessus.

Les preuves et les fichiers utilisateurs sont dans le dossier ignoré par Git `outputs/social_reseaux_import_20260907/`, notamment `RAPPORT.md` et `verification_utilisateurs.csv`.

## Préparer le SQL sans connexion

Depuis la racine du dépôt, avec Python 3 :

```powershell
python tools/social-web-backfill/prepare_run.py prepare outputs/social_reseaux_import_20260907
```

La commande vérifie l'empreinte du CSV original et du manifeste relu. Elle crée un dossier exclusif sous `runs/` contenant `apply.sql`, la sélection, les exclusions, la liste de revue et leurs empreintes. Elle ne se connecte à aucune base.

Le CSV original doit être conservé à l'emplacement indiqué dans `csv_audit_report.json`. Les données d'audit restent locales et ne doivent pas être ajoutées au dépôt public.

## Application ultérieure

Le SQL autonome généré est destiné uniquement à la base V3 distante, avec le compte d'administration prévu pour les migrations. Définir les variables PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD dans l'environnement sans les afficher, puis, après validation du lot :

```powershell
psql -X -v ON_ERROR_STOP=1 -f "<dossier_run>/apply.sql"
```

Ne pas exécuter directement les trois gabarits `social_web_channel_backfill_20260907*.sql` du dossier SQL : ils contiennent des marqueurs à rendre.

L'application utilise les correspondances gelées de `object_origin` (`source_system=berta_v2_csv_export`) et les UUID du catalogue. Elle abandonne si le mapping, le catalogue ou le statut d'un objet a changé. Elle ajoute uniquement les tuples absents de `object_web_channel`, garde les canaux existants intégralement identiques et conserve le statut des établissements. Des verrous courts protègent les gardes et l'insertion des écritures concurrentes.

Plusieurs URL distinctes d'une même plateforme sont permises par le modèle. Elles sont signalées dans `same_platform_other_values.csv`. Les URL et leurs paramètres ne sont pas réécrits. L'unicité porte sur le tuple objet, plateforme, URL exacte.

## Journal et retour arrière

Le journal `applied_row_ids.csv` est écrit avant COMMIT. Il contient exclusivement les UUID renvoyés par INSERT RETURNING, leurs ID_R_S/anciens ID et l'état complet de chaque ligne. Une réexécution utilise un nouveau dossier et ne détruit pas le journal précédent.

Après application, générer la vérification et le retour arrière de ce seul run :

```powershell
python tools/social-web-backfill/prepare_run.py journal "<dossier_run>"
```

Exécuter le `postverify.sql` généré sur V3 : il ne fait que lire. Le résultat attendu est `present_unchanged = journal_rows`, avec `missing = changed = 0`. En cas de coupure autour de COMMIT, l'existence du fichier journal ne prouve pas que l'insertion a été validée.

Le `rollback.sql` généré supprime uniquement les UUID de ce journal dont l'état complet est encore identique. Un changement de visibilité, position, URL ou date de modification protège la ligne et la fait apparaître dans `changed_preserved.csv`. Un journal vide correspond à une réexécution sans ajout et constitue un retour arrière sans effet.

Le parent `object.updated_at` n'est pas modifié, conformément à l'écriture actuelle des canaux web par l'éditeur. Le déclenchement d'une resynchronisation partenaire à partir de cette date n'est donc pas ajouté par ce backfill.

## Contrôles réalisés et limites

- Audit source indépendant : 1 535 entrées comptabilisées, paramètres et points-virgules internes conservés.
- Rapprochements sur V3 en lecture seule : 701 anciens identifiants uniques retrouvés, 114 sans correspondance parmi les 815 concernés par les URL syntaxiquement valides.
- 10 tests hors base : politique de revue humaine, doublons, désalignements, empreintes, dossiers de run distincts, rendu SQL et provenance des journaux.
- Application distante autorisée et exécutée : COMMIT confirmé, 1 281 insertions vérifiées dans une nouvelle transaction en lecture seule ; aucune ligne manquante ni modifiée. Retour arrière généré, non exécuté. Aucune base locale utilisée après la consigne de l'utilisateur. Les vérifications web sont arrêtées.

```powershell
python -m unittest discover -s tools/social-web-backfill -p "test_*.py" -v
```

Six des anciens identifiants sans correspondance ont des traces historiques de création mais aucun `object_origin` actuel. Leur réparation reste séparée de ce lot, sans rapprochement supposé sur le nom.
