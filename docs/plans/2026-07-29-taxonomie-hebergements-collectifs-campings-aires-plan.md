# Plan d'action — Taxonomie des hébergements collectifs, campings et aires

Date : 2026-07-29

Public : développeur ou développeuse en première année, accompagné(e) par un référent technique

Périmètre : base PostgreSQL/Supabase, Explorer, création et édition des fiches, aide utilisateur, tests et documentation

Statut : plan validable avant mise en œuvre ; aucune modification de production n'est autorisée par ce document seul

## 1. Résultat attendu

À la fin du chantier :

1. Les agents ne voient plus une fausse hiérarchie entre Résidence de tourisme et Gîte.
2. Les natures d'hébergement collectif sont présentées au même niveau métier, même si elles restent rangées dans des domaines techniques différents.
3. L'ancienne famille Hôtellerie de plein air est remplacée par deux familles distinctes :
   - Campings et terrains ;
   - Aires et haltes de plein air.
4. Aire naturelle de camping reste dans Campings et terrains.
5. Aire de bivouac, Aire d'accueil camping-car et Halte nocturne camping-car/van sont dans Aires et haltes de plein air.
6. Hébergement insolite de plein air n'est plus une nature d'établissement. Bulle, tipi, lodge et cabane deviennent des types d'unité.
7. Aire de services camping-car reste un service et ne signifie jamais automatiquement que la nuitée est autorisée.
8. Gratuit ou payant reste dans le module tarifaire et n'apparaît jamais dans la taxonomie.
9. Les types techniques HLO, RVA, CAMP et HPA sont conservés. Ils ne doivent pas être utilisés comme vocabulaire principal par les agents.

## 2. Arbre métier cible

    Hébergements
    ├── Hôtellerie
    │   └── Hôtel
    ├── Hébergement locatif
    │   ├── Chambre d'hôtes
    │   └── Meublé de tourisme
    ├── Hébergement collectif
    │   ├── Auberge
    │   ├── Gîte
    │   ├── Refuge et gîte d'étape
    │   ├── Résidence de tourisme
    │   ├── Village de vacances
    │   └── Résidence hôtelière
    ├── Campings et terrains
    │   ├── Camping
    │   ├── Aire naturelle de camping
    │   ├── Terrain de camping déclaré
    │   │   ├── Camping à la ferme
    │   │   └── Camping chez l'habitant
    │   └── Parc résidentiel de loisirs
    └── Aires et haltes de plein air
        ├── Aire de bivouac
        ├── Aire d'accueil camping-car
        └── Halte nocturne camping-car/van

Axes parallèles, en dehors de cet arbre :

    Type d'unité : bulle, tipi, lodge, cabane, etc.
    Services : eau, vidange, électricité, aire de services camping-car, etc.
    Tarifs : gratuit, prix fixe, fourchette, période, unité de facturation, etc.

### Pourquoi Résidence hôtelière reste dans Hébergement collectif

Le libellé hôtelière décrit la présence de services proches de l'hôtel, mais l'établissement reste organisé comme une résidence composée de logements autonomes. L'Insee regroupe d'ailleurs Résidence de tourisme / Résidence hôtelière dans une même catégorie, distincte des hôtels. Dans Bertel, elle reste donc avec Résidence de tourisme et Village de vacances, sous Hébergement collectif.

### Définition simple d'un parc résidentiel de loisirs

Un parc résidentiel de loisirs, ou PRL, est un terrain aménagé composé d'emplacements nus ou équipés, généralement destinés à des habitations légères, chalets, mobil-homes ou caravanes. Les emplacements sont loués à une clientèle qui n'y établit pas son domicile et le parc dispose d'équipements communs.

Différence pratique avec un camping :

- le camping est d'abord organisé pour accueillir des campeurs et différents types d'emplacements de séjour ;
- le PRL est davantage organisé autour de logements légers ou mobiles installés sur des parcelles ;
- le classement en étoiles est un axe séparé : la nature reste Parc résidentiel de loisirs, classé ou non.

## 3. Correspondance technique retenue

Les codes ci-dessous sont les codes cibles. Ne pas inventer une variante pendant l'implémentation.

| Famille visible | Code famille | Domaine technique | Code de nature | Action |
|---|---|---|---|---|
| Hébergement collectif | collectif | taxonomy_hlo | auberge_collective | afficher Auberge et changer axis de sous_type vers nature |
| Hébergement collectif | collectif | taxonomy_hlo | gite_de_groupe | afficher Gîte et changer axis de sous_type vers nature |
| Hébergement collectif | collectif | taxonomy_hlo | gite_de_randonnee | changer axis de sous_type vers nature |
| Hébergement collectif | collectif | taxonomy_rva | tourism_residence | conserver |
| Hébergement collectif | collectif | taxonomy_rva | holiday_village | conserver |
| Hébergement collectif | collectif | taxonomy_rva | aparthotel | conserver |
| Campings et terrains | campings_terrains | taxonomy_camp | camping | renommer le libellé, conserver le code |
| Campings et terrains | campings_terrains | taxonomy_hpa | natural_camp_area | changer la famille |
| Campings et terrains | campings_terrains | taxonomy_hpa | declared_campground | créer |
| Campings et terrains | campings_terrains | taxonomy_hpa | farm_camping | sous-type de declared_campground |
| Campings et terrains | campings_terrains | taxonomy_hpa | homestay_camping | sous-type de declared_campground |
| Campings et terrains | campings_terrains | taxonomy_hpa | residential_leisure_park | créer |
| Aires et haltes de plein air | aires_haltes_plein_air | taxonomy_hpa | bivouac_area | créer |
| Aires et haltes de plein air | aires_haltes_plein_air | taxonomy_hpa | motorhome_area | changer la famille |
| Aires et haltes de plein air | aires_haltes_plein_air | taxonomy_hpa | motorhome_night_stop | créer |

Décisions importantes :

- Le code taxonomy_camp.camping ne change pas, et son libellé visible reste Camping, afin de ne pas surcharger l'interface ni casser les affectations et les correspondances partenaires.
- Les libellés courts Auberge et Gîte sont contextualisés par leur famille Hébergement collectif. Les libellés complets Auberge collective et Gîte de groupe restent dans metadata.aliases et dans les descriptions.
- taxonomy_hlo et taxonomy_rva restent séparés. L'interface les réunit grâce à metadata.famille.
- Terrain de camping déclaré est la nature parente de Camping à la ferme et Camping chez l'habitant. La DGE décrit ces deux expressions comme des formes usuelles du terrain déclaré ; les afficher comme trois natures sœurs créerait un chevauchement.
- L'ancien code de famille plein_air est désactivé, pas supprimé.
- Le nœud taxonomy_hpa.outdoor_glamping sort de l'axe nature. Il ne doit pas être simplement déplacé sous une des deux nouvelles familles.
- Les nouveaux nœuds sans fiche sont quand même visibles dans l'éditeur. Dans l'Explorer, leur état vide doit être explicite.

## 4. Règles de sécurité pour la personne qui exécute

1. Ne jamais travailler directement sur la branche master.
2. Ne jamais appliquer une migration en production sans revue d'un développeur confirmé.
3. Ne jamais supprimer un ref_code. Utiliser is_active=false ou is_assignable=false.
4. Ne jamais modifier object.object_type pour ce chantier, sauf si un lot séparé et explicitement validé le demande.
5. Ne jamais exécuter DELETE FROM object.
6. Ne jamais réutiliser le code plein_air pour une des nouvelles familles. Il doit rester un ancien code désactivé.
7. Ne jamais ajouter gratuit, payant, avec eau ou avec électricité dans metadata.axis ou metadata.famille.
8. Toute migration doit être idempotente : une deuxième exécution doit produire le même état sans erreur.
9. Toute incohérence de données doit provoquer un arrêt explicite, pas une correction silencieuse.
10. Les commandes de test frontend utilisent npm run test:run. Ne pas lancer npm run test, qui reste en mode surveillance.
11. Le SQL qui retire metadata.famille de outdoor_glamping et le rend non assignable ne doit jamais être déployé avant le frontend du lot 3. Le frontend doit déjà exclure tout nœud isAssignable=false des familles et des critères complémentaires.
12. La taxonomie, le rendu Explorer, le parcours de création et l'aide utilisateur forment une livraison coordonnée. Le frontend rétrocompatible de préparation peut être déployé avant le SQL ; en revanche, l'activation du nouveau catalogue et de la nouvelle aide doit être atomique du point de vue de l'agent.
13. Ne jamais rafraîchir aveuglément tous les HLO/RVA/CAMP/HPA. api.refresh_object_filter_caches peut modifier search_document, search_document_text et search_document_phonetic ; ces colonnes ne sont pas ignorées par les trois triggers métier de object et peuvent donc faire évoluer updated_at, current_version et object_version.
14. Avant tout rafraîchissement de masse ou borné, relire les définitions live de update_object_updated_at, trg_increment_object_version et trg_object_version, conformément à CLAUDE.md §197.
15. Toute entrée affichée comme enfant doit avoir un vrai parent dans le même domaine. metadata.famille sert uniquement à former un groupe visuel plat ; elle ne crée jamais une parenté.
16. Avant chaque écriture live, figer la liste nominative des object_id autorisés à changer. Un WHERE object_type IN (...) n'est pas un manifeste acceptable.

## 5. Estimation et points de revue

| Lot | Travail | Estimation débutant | Revue obligatoire |
|---|---|---:|---|
| 0 | Revalidation du gel et manifeste de reprise | 0,5 à 1 jour | oui, arbitrage métier sur les deux cas ouverts |
| 1 | Migration des familles et natures | 1,5 jour | oui |
| 2 | Tests SQL et intégrité fresh apply | 1 jour | oui |
| 3 | Explorer, rendu hiérarchique et filtres | 3 à 4 jours | oui, nouvelle capacité de rendu |
| 4 | Création/édition guidée | 2 jours | oui |
| 5 | Axe Type d'unité | 4 à 6 jours | oui, revue architecture et sécurité |
| 6 | Services et tarifs | 1 jour | oui |
| 6 bis | Documentation et accompagnement utilisateur | 1,5 à 2 jours | oui, recette avec un agent débutant |
| 7 | Recette et déploiement | 1 jour | oui, production interdite au stagiaire seul |

Total restant indicatif après l'audit et la revue technique du 29 juillet : 16 à 20 jours ouvrés avec les revues.

## 6. Lot 0 — Pré-vol et inventaire

### Étape 0.1 — Créer une branche

Depuis C:\Users\dphil\Bertel3.0 :

    git status --short
    git switch -c codex/taxonomie-hebergements-v2

Si la branche existe déjà, demander au référent quelle branche utiliser. Ne pas supprimer une branche existante.

### Étape 0.2 — Vérifier les fichiers déjà modifiés

    git status --porcelain -- "Base de donnée DLL et API" "bertel-tourism-ui/src" "docs"

Si un fichier du chantier est déjà modifié par quelqu'un d'autre, arrêter et demander comment coordonner les changements.

### Étape 0.3 — Refaire l'inventaire live

Exécuter la requête suivante en lecture seule via le MCP Supabase ou le Dashboard :

    SELECT
      rc.domain,
      rc.code,
      rc.name,
      rc.is_active,
      rc.is_assignable,
      rc.metadata->>'axis' AS axis,
      rc.metadata->>'famille' AS famille,
      count(ot.object_id) AS porteurs
    FROM public.ref_code rc
    LEFT JOIN public.object_taxonomy ot
      ON ot.domain = rc.domain
     AND ot.ref_code_id = rc.id
    WHERE rc.domain IN (
      'taxonomy_hlo',
      'taxonomy_rva',
      'taxonomy_camp',
      'taxonomy_hpa',
      'accommodation_family'
    )
    GROUP BY rc.domain, rc.code, rc.name, rc.is_active,
             rc.is_assignable, rc.metadata
    ORDER BY rc.domain, rc.position, rc.code;

Exporter le résultat dans un fichier de preuve sous docs/research/. Ne pas inclure de donnée personnelle.

État attendu d'après l'inventaire du 2026-07-27 :

- taxonomy_camp.camping : 1 porteur ;
- taxonomy_hpa.homestay_camping : 2 porteurs ;
- taxonomy_hpa.outdoor_glamping : 0 porteur ;
- taxonomy_hpa.motorhome_area : 0 porteur ;
- taxonomy_hlo.bulle : 1 porteur ;
- taxonomy_hlo.lodges : 1 porteur ;
- taxonomy_hlo.hebergement_insolite : 1 porteur ;
- HLORUN000000017A porte encore taxonomy_hlo.chambre_d_hotes avant la reprise ;
- les nouveaux codes cibles : absents.

Si outdoor_glamping a désormais un ou plusieurs porteurs, arrêter le lot 1. Il faudra préparer un mapping fiche par fiche avant de le désactiver.

### Étape 0.4 — Vérifier les invariants

Exécuter :

    SELECT object_id, domain, count(*)
    FROM public.object_taxonomy
    GROUP BY object_id, domain
    HAVING count(*) > 1;

Attendu : 0 ligne.

Exécuter :

    SELECT rc.domain, rc.code
    FROM public.ref_code rc
    WHERE rc.domain IN ('taxonomy_hlo','taxonomy_rva','taxonomy_camp','taxonomy_hpa')
      AND rc.is_active
      AND rc.parent_id IS NOT NULL
      AND rc.metadata->>'axis' IS NULL;

Attendu : 0 ligne.

### Étape 0.5 — Faire valider l'inventaire

Présenter au référent :

- le tableau des nœuds et des porteurs ;
- la confirmation que outdoor_glamping a 0 porteur ;
- la liste des codes à créer ;
- la liste des fiches à conserver, à reprendre automatiquement ou à arbitrer ;
- la confirmation qu'aucun objet ne sera retypé automatiquement sur la seule base de son nom ou de mots-clés.

### Étape 0.6 — Utiliser l'audit live déjà exécuté

L'audit préalable demandé a été exécuté en lecture seule le 29 juillet 2026 sur la base cloud. Sa preuve complète, ses décisions et ses sources sont dans :

- docs/research/taxonomy-hebergements-existing-objects-audit-2026-07-29.md.

Résultats live :

- 0 hébergement sans taxonomie compatible ;
- 0 incompatibilité entre object_type et domaine ;
- 0 porteur d'un nœud inactif ou non assignable ;
- 0 doublon par objet et domaine ;
- 0 lacune dans cached_taxonomy_codes ;
- 476 HLO publiés, dont 20 collectifs ;
- 8 HOT, 0 RVA, 1 CAMP et 2 HPA publiés ;
- une correction certaine de nature ;
- sept reprises certaines vers Type d'unité ;
- deux décisions métier encore ouvertes.

Ne pas recommencer l'analyse à zéro pendant l'implémentation. Rejouer seulement les contrôles de la section suivante immédiatement avant la migration pour détecter une modification intervenue depuis ce gel.

### Étape 0.7 — Revalider le gel juste avant la migration

Ces requêtes ont déjà été exécutées pendant l'audit. Les rejouer en lecture seule juste avant le SQL de reprise. Exporter uniquement les écarts nouveaux sous docs/research/, sans coordonnées personnelles.

Distribution complète des affectations :

    SELECT
      o.object_type,
      o.status,
      ot.domain,
      rc.code,
      rc.name,
      count(*) AS fiches
    FROM public.object o
    JOIN public.object_taxonomy ot ON ot.object_id = o.id
    JOIN public.ref_code rc
      ON rc.id = ot.ref_code_id
     AND rc.domain = ot.domain
    WHERE o.object_type IN ('HOT','HLO','RVA','CAMP','HPA')
    GROUP BY o.object_type, o.status, ot.domain, rc.code, rc.name
    ORDER BY o.object_type, o.status, ot.domain, rc.code;

Rechercher les hébergements sans taxonomie compatible :

    SELECT o.id, o.name, o.object_type, o.status
    FROM public.object o
    WHERE o.object_type IN ('HOT','HLO','RVA','CAMP','HPA')
      AND NOT EXISTS (
        SELECT 1
        FROM public.object_taxonomy ot
        JOIN public.ref_code_domain_registry d
          ON d.domain = ot.domain
         AND d.is_taxonomy
         AND d.is_active
        WHERE ot.object_id = o.id
          AND d.object_type = o.object_type
      )
    ORDER BY o.object_type, o.name;

Rechercher les affectations incompatibles avec le type technique :

    SELECT o.id, o.name, o.object_type, ot.domain, rc.code
    FROM public.object o
    JOIN public.object_taxonomy ot ON ot.object_id = o.id
    JOIN public.ref_code_domain_registry d ON d.domain = ot.domain
    JOIN public.ref_code rc
      ON rc.id = ot.ref_code_id
     AND rc.domain = ot.domain
    WHERE d.is_taxonomy
      AND d.object_type IS DISTINCT FROM o.object_type
    ORDER BY o.object_type, o.name;

Rechercher les fiches encore attachées à un nœud inactif ou non assignable :

    SELECT o.id, o.name, o.object_type, o.status, ot.domain, rc.code,
           rc.is_active, rc.is_assignable
    FROM public.object o
    JOIN public.object_taxonomy ot ON ot.object_id = o.id
    JOIN public.ref_code rc
      ON rc.id = ot.ref_code_id
     AND rc.domain = ot.domain
    WHERE NOT rc.is_active OR NOT rc.is_assignable
    ORDER BY o.object_type, o.name;

Attendus : 0 fiche sans taxonomie compatible, 0 incompatibilité type/domaine et 0 porteur actif d'un nœud inactif ou non assignable. Tout écart devient une ligne du manifeste de reprise.

### Étape 0.8 — Rechercher les candidats rangés hors des domaines attendus

Les nouvelles natures Aire de bivouac, Halte nocturne, Terrain déclaré et Parc résidentiel de loisirs n'existaient pas auparavant. Une fiche correspondante peut donc être absente, rangée comme service, site naturel ou itinéraire, ou décrite seulement dans un texte.

Faire une recherche sur le nom et les descriptions canoniques de tous les types d'objets, et pas seulement HLO/CAMP/HPA. Utiliser la requête suivante comme générateur de candidats, jamais comme décision automatique :

    WITH texte AS (
      SELECT
        o.id,
        o.name,
        o.object_type,
        o.status,
        immutable_unaccent(lower(concat_ws(
          ' ', o.name,
          string_agg(
            concat_ws(' ', od.description_chapo, od.description),
            ' '
          ) FILTER (WHERE od.org_object_id IS NULL)
        ))) AS contenu
      FROM public.object o
      LEFT JOIN public.object_description od ON od.object_id = o.id
      GROUP BY o.id, o.name, o.object_type, o.status
    )
    SELECT id, name, object_type, status, contenu
    FROM texte
    WHERE contenu ~ (
      'auberge collective|gite de groupe|gite d etape|refuge|' ||
      'residence de tourisme|residence hoteliere|village de vacances|' ||
      'aire naturelle|terrain de camping declare|camping a la ferme|' ||
      'camping chez l habitant|parc residentiel|\mprl\M|' ||
      'aire de bivouac|halte nocturne|camping.car|glamping|' ||
      'bulle|tipi|lodge|cabane'
    )
    ORDER BY object_type, name;

Pour chaque candidat, consulter la fiche complète et, si nécessaire, une source métier fiable. Un mot dans une description peut désigner un équipement voisin ou une activité proposée et ne prouve pas la nature de l'établissement.

Créer un manifeste de revue avec les colonnes suivantes :

| Colonne | Contenu |
|---|---|
| object_id | identifiant stable de la fiche |
| nom | nom visible |
| type, domaine et code actuels | classement avant chantier |
| signal | donnée ayant déclenché la revue |
| décision | conserver, reprendre automatiquement, arbitrer ou hors périmètre |
| famille et nature cibles | classement métier validé |
| type technique cible | uniquement si une conversion est nécessaire |
| justification | règle appliquée et source consultée |
| validateur | référent ayant accepté la décision |

### Étape 0.9 — Classer les reprises par niveau de risque

Utiliser le manifeste réel de l'audit :

1. Correction certaine de nature : HLORUN000000017A, Gîte Hydrangea 974, passe de taxonomy_hlo.chambre_d_hotes à taxonomy_hlo.gite_de_randonnee. Le type HLO ne change pas. La source officielle le qualifie de Gîte d'étape et de randonnée et décrit un accueil des randonneurs du GRR2 en chambres et dortoirs.
2. Reprises certaines vers Type d'unité : les sept fiches détaillées à l'étape 0.10. Leur nature ne change pas, sauf que les trois anciennes feuilles HLO Type d'unité sont ramenées à leur ancêtre Chambre d'hôtes déjà validé par le PO.
3. Décisions ouvertes : La Roulotte Géante pour l'offre de bivouac complémentaire ; Le Verger de la Chapelle pour l'arbitrage Camping à la ferme versus Camping chez l'habitant.
4. Conservation : toutes les autres occurrences textuelles. Elles décrivent une activité, un service, un nom commercial ou un usage figuré.

La migration de Gîte Hydrangea doit vérifier l'ancienne valeur chambre_d_hotes avant d'écrire. Si elle diffère, arrêter la transaction. Enregistrer une source taxonomy_hebergement_audit_20260729 et une note contenant la décision et le lien vers la preuve.

Ne jamais convertir en masse une fiche sur un mot-clé. L'audit a précisément démontré que bivouac, refuge, lodge et résidence produisent des faux positifs.

### Étape 0.10 — Préparer la reprise des types d'unité historiques

Le lot 5 ne doit pas créer une table vide en oubliant les informations déjà saisies. Backfiller exactement ces sept lignes :

| object_id | Fiche | Nature conservée | Type d'unité |
|---|---|---|---|
| HLORUN000000015Q | La BBO La Bulle by Baril O'thentik | Chambre d'hôtes | Bulle |
| HLORUN000000013Y | Héritage Écolodge & Spa | Chambre d'hôtes | Lodge |
| HLORUN000000017V | Entre 2 Bulles | Chambre d'hôtes | Bulle |
| HLORUN00000000UW | Anae Lodge | Chambre d'hôtes | Lodge |
| HLORUN000000018Q | Au pays du mouton blanc | Meublé de tourisme | Cabane |
| CAMRUN000000013G | Camping Pré-Vert Entre 2 Songes | Camping | Cabane |
| CAMRUN00000000PH | L'Eden du Randonneur (camping) | Camping chez l'habitant | Cabane |

Pour La BBO, Héritage et Entre 2 Bulles, remplacer l'affectation feuille taxonomy_hlo.bulle, lodges ou hebergement_insolite par taxonomy_hlo.chambre_d_hotes seulement après insertion réussie du nouveau type d'unité. Les décisions PO de juillet sur leur nature restent applicables.

Ne pas ajouter Lodge aux neuf autres résultats contenant ce mot : l'audit montre qu'il s'agit de noms commerciaux ou de maisons, chalets et bungalows. Ne pas ajouter Cabane à la fiche HLO L'Eden du Randonneur : le texte provient de sa fiche Camping jumelle.

Attendu avant migration : outdoor_glamping conserve 0 porteur. Si ce compte change, arrêter et créer une décision nominative supplémentaire.

### Étape 0.11 — Faire approuver un manifeste de reprise immuable

Avant le lot 1, transformer les huit reprises certaines des étapes 0.9 et 0.10 en CSV ou table temporaire versionnée. Le SQL doit vérifier l'ancienne valeur avant d'écrire ; si elle a changé depuis l'audit, il s'arrête au lieu d'écraser une correction récente.

Obtenir séparément les deux décisions suivantes :

- La Roulotte Géante : si l'emplacement de bivouac est une offre autonome, créer une fiche HPA Aire de bivouac liée à l'établissement ; sinon conserver le bivouac comme prestation secondaire. Ne jamais retyper la fiche HLO Roulotte.
- Le Verger de la Chapelle : conserver Chez l'habitant selon la catégorie IRT ou choisir À la ferme selon le statut de l'exploitation. Ne modifier aucune affectation avant cette décision.

Pour toute conversion de type technique :

- utiliser la procédure administrative dédiée ;
- vérifier les facettes propres à l'ancien et au nouveau type ;
- conserver un journal old_type, new_type, ancien code, nouveau code, source et note ;
- tester les exports partenaires avant/après ;
- obtenir une validation métier nominative.

### Critère de fin du lot 0

Le gel du 29 juillet est toujours conforme, les huit reprises certaines sont dans un manifeste validé, les deux décisions ouvertes sont signées ou explicitement reportées sans écriture, et les sept types d'unité ont une stratégie de migration sans perte.

Ne pas commencer le SQL avant validation.

## 7. Lot 1 — Migration des familles et des natures

### Fichiers

Créer :

- Base de donnée DLL et API/migration_taxonomy_accommodation_hierarchy_v2.sql

Modifier :

- Base de donnée DLL et API/migration_taxonomy_trees_seed.sql
- Base de donnée DLL et API/ci_fresh_apply.sql
- docs/SQL_ROLLOUT_RUNBOOK.md

Ne pas réécrire la migration historique migration_taxonomy_accommodation_vocabulary.sql. La nouvelle migration doit être exécutée après elle.

### Étape 1.1 — Préparer la migration dans une transaction

Le fichier doit commencer par :

    BEGIN;
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '60s';

Le fichier doit finir par :

    COMMIT;

Les rafraîchissements CONCURRENTLY seront exécutés après le commit, jamais à l'intérieur de cette transaction.

### Étape 1.2 — Créer les deux nouvelles familles

Insérer ou mettre à jour, en une seule instruction batch :

| domain | code | name | position | is_assignable |
|---|---|---|---:|---|
| accommodation_family | campings_terrains | Campings et terrains | 4 | false |
| accommodation_family | aires_haltes_plein_air | Aires et haltes de plein air | 5 | false |

Descriptions à utiliser :

- Campings et terrains : Terrains organisés pour le camping ou les hébergements légers, qu'ils soient classés, déclarés, naturels, à la ferme ou chez l'habitant, ainsi que les parcs résidentiels de loisirs.
- Aires et haltes de plein air : Lieux autorisant une halte ou une nuitée de plein air sans constituer un terrain de camping.

Ajouter aux deux familles les aliases Hôtellerie de plein air et Hébergement de plein air. Une recherche sur l'ancien vocabulaire doit proposer les deux nouvelles familles, car l'ancien terme les recouvrait toutes les deux.

Mettre accommodation_family.plein_air à is_active=false et is_assignable=false. Ajouter dans metadata :

    {
      "deprecated": true,
      "replaced_by": ["campings_terrains", "aires_haltes_plein_air"]
    }

Ne pas supprimer la ligne plein_air, car elle fait partie de l'historique et peut encore être présente dans des caches ou exports anciens.

### Étape 1.2 bis — Utiliser un patron SQL qui préserve metadata

Ne jamais remplacer tout le JSON metadata. Une affectation comme metadata = '{"axis":"nature"}' effacerait les aliases, la source et les marqueurs existants.

Pour modifier un nœud existant, utiliser ce patron :

    UPDATE public.ref_code
    SET metadata =
          (COALESCE(metadata, '{}'::jsonb) - 'axis' - 'famille')
          || jsonb_build_object(
               'axis', 'nature',
               'famille', 'campings_terrains'
             )
    WHERE domain = 'taxonomy_hpa'
      AND code = 'natural_camp_area';

Pour créer un nœud sous la racine technique, utiliser un INSERT ... SELECT afin de résoudre le vrai UUID du parent :

    INSERT INTO public.ref_code (
      domain, code, name, description, parent_id,
      position, is_active, is_assignable, metadata
    )
    SELECT
      'taxonomy_hpa',
      'declared_campground',
      'Terrain de camping déclaré',
      'Terrain accueillant des campeurs sous le régime déclaratif applicable, sans être présenté comme un camping classé.',
      root.id,
      3,
      true,
      true,
      jsonb_build_object(
        'axis', 'nature',
        'famille', 'campings_terrains',
        'aliases', '[]'::jsonb
      )
    FROM public.ref_code root
    WHERE root.domain = 'taxonomy_hpa'
      AND root.code = 'root'
    ON CONFLICT (domain, code) DO UPDATE
    SET name = EXCLUDED.name,
        description = EXCLUDED.description,
        parent_id = EXCLUDED.parent_id,
        position = EXCLUDED.position,
        is_active = EXCLUDED.is_active,
        is_assignable = EXCLUDED.is_assignable,
        metadata =
          (COALESCE(public.ref_code.metadata, '{}'::jsonb)
             - 'axis' - 'famille')
          || jsonb_build_object(
               'axis', 'nature',
               'famille', 'campings_terrains'
             );

Adapter ce patron aux autres codes. Ne pas copier-coller un UUID de parent depuis une autre base.

### Étape 1.3 — Corriger l'hébergement collectif

Pour les trois nœuds HLO suivants :

- gite_de_randonnee ;
- gite_de_groupe ;
- auberge_collective.

Mettre :

- metadata.axis = nature ;
- metadata.famille = collectif ;
- conserver code, parent_id et is_assignable ;
- conserver les aliases et source_ref déjà présents.

Modifier les deux libellés visibles suivants :

- auberge_collective : name = Auberge ; ajouter Auberge collective dans metadata.aliases ;
- gite_de_groupe : name = Gîte ; ajouter Gîte de groupe dans metadata.aliases ;
- gite_de_randonnee conserve le libellé Refuge et gîte d'étape.

Les descriptions doivent lever l'ambiguïté :

- Auberge : hébergement proposant notamment des lits en chambres partagées ou individuelles et des espaces collectifs ;
- Gîte : dans cette famille, hébergement destiné à l'accueil d'un groupe ; ne pas le confondre avec le mot gîte utilisé commercialement pour un meublé de tourisme.

Ne pas renommer le code technique auberge_collective, ni le classement auberge_collective_stars. Seul le libellé de nature affiché aux agents devient Auberge.

Les vingt porteurs collectifs déjà validés ne doivent pas être déplacés par ce changement d'axe ou de libellé. La seule correction object_taxonomy de ce lot est isolée à l'étape 1.3 bis.

Ajouter une assertion :

    SELECT count(*)
    FROM public.ref_code
    WHERE domain = 'taxonomy_hlo'
      AND code IN ('gite_de_randonnee','gite_de_groupe','auberge_collective')
      AND metadata->>'axis' = 'nature'
      AND metadata->>'famille' = 'collectif';

Attendu : 3.

### Étape 1.3 bis — Corriger Gîte Hydrangea 974

L'audit live a confirmé une erreur historique : HLORUN000000017A est en Chambre d'hôtes alors que la source touristique officielle le classe comme Gîte d'étape et de randonnée.

Dans la même transaction :

1. vérifier que l'objet existe, reste de type HLO et porte exactement taxonomy_hlo.chambre_d_hotes ;
2. remplacer son ref_code_id par celui de taxonomy_hlo.gite_de_randonnee ;
3. mettre source = taxonomy_hebergement_audit_20260729 ;
4. mettre note = Audit live 2026-07-29 — IRT : gîte d'étape et de randonnée, accueil GRR2 ;
5. vérifier que exactement une ligne a été modifiée ;
6. appeler api.refresh_object_filter_caches pour cet objet.

Si l'objet, son type ou son ancienne taxonomie diffère, lever une exception et annuler toute la migration. Ne pas chercher une autre fiche par son nom.

Assertions après écriture :

- HLORUN000000017A reste HLO ;
- son unique affectation taxonomy_hlo est gite_de_randonnee ;
- le compte collectif passe de 20 à 21 ;
- le compte gite_de_randonnee passe de 17 à 18 ;
- le compte chambre_d_hotes et descendants diminue d'une fiche ;
- son cache contient taxonomy_hlo:hebergement_collectif et taxonomy_hlo:gite_de_randonnee.

### Étape 1.4 — Mettre à jour les natures de Campings et terrains

1. taxonomy_camp.camping :
   - conserver le code camping ;
   - conserver name = Camping ;
   - metadata.axis = nature ;
   - metadata.famille = campings_terrains ;
   - ajouter Camping aménagé et Camping classé dans metadata.aliases ;
   - ne pas modifier les porteurs.

2. taxonomy_hpa.natural_camp_area :
   - metadata.axis = nature ;
   - metadata.famille = campings_terrains.

3. Créer taxonomy_hpa.declared_campground :
   - name = Terrain de camping déclaré ;
   - parent = root de taxonomy_hpa ;
   - position = 3 ;
   - is_active = true ;
   - is_assignable = true ;
   - metadata.axis = nature ;
   - metadata.famille = campings_terrains ;
   - description = Terrain accueillant des campeurs sous le régime déclaratif applicable, sans être présenté comme un camping classé.

4. taxonomy_hpa.farm_camping :
   - parent = taxonomy_hpa.declared_campground ;
   - metadata.axis = sous_type ;
   - metadata.famille = campings_terrains ;
   - description = Terrain de camping déclaré situé sur une exploitation agricole et exploité dans le cadre de l'accueil touristique de cette exploitation.

5. taxonomy_hpa.homestay_camping :
   - parent = taxonomy_hpa.declared_campground ;
   - metadata.axis = sous_type ;
   - metadata.famille = campings_terrains ;
   - description = Terrain de camping déclaré mis à disposition chez un particulier hors exploitation agricole ;
   - retirer l'ancienne instruction disant de le requalifier systématiquement.

6. Créer taxonomy_hpa.residential_leisure_park :
   - name = Parc résidentiel de loisirs ;
   - parent = root de taxonomy_hpa ;
   - position = 6 ;
   - is_active = true ;
   - is_assignable = true ;
   - metadata.axis = nature ;
   - metadata.famille = campings_terrains ;
   - metadata.source_ref doit citer le Code du tourisme, articles D333-3 et D333-4 ;
   - description = Terrain aménagé proposant des emplacements nus ou équipés d'habitations légères, de mobil-homes ou de caravanes, loués avec des équipements communs à une clientèle qui n'y élit pas domicile.

Le classement PRL existe déjà sous le code prl_stars et est applicable à HPA et CAMP. Ne pas créer un second classement.

Source de la hiérarchie Terrain déclaré : Direction générale des Entreprises, Les terrains de camping déclarés, mise à jour du 3 avril 2026. Cette source précise que Camping à la ferme et terrain rural/chez un particulier relèvent du régime déclaré. Ne pas remettre farm_camping et homestay_camping au même axe nature que leur parent.

### Étape 1.5 — Créer les natures d'Aires et haltes de plein air

1. taxonomy_hpa.motorhome_area :
   - conserver le code et le libellé Aire d'accueil camping-car ;
   - metadata.axis = nature ;
   - metadata.famille = aires_haltes_plein_air ;
   - description = Aire autorisant explicitement le stationnement et la nuitée des camping-cars. Les équipements d'eau, vidange ou électricité sont décrits séparément.

2. Créer taxonomy_hpa.bivouac_area :
   - name = Aire de bivouac ;
   - parent = root de taxonomy_hpa ;
   - position = 10 ;
   - is_active = true ;
   - is_assignable = true ;
   - metadata.axis = nature ;
   - metadata.famille = aires_haltes_plein_air ;
   - description = Lieu identifié où une installation légère et temporaire pour la nuit est autorisée, selon la réglementation locale.

3. Créer taxonomy_hpa.motorhome_night_stop :
   - name = Halte nocturne camping-car/van ;
   - parent = root de taxonomy_hpa ;
   - position = 12 ;
   - is_active = true ;
   - is_assignable = true ;
   - metadata.axis = nature ;
   - metadata.famille = aires_haltes_plein_air ;
   - description = Lieu autorisant une halte nocturne courte pour camping-car ou van, sans présumer de la présence de services.

Faire relire ces descriptions par le référent métier. Elles servent d'infobulles aux agents.

### Étape 1.6 — Sortir outdoor_glamping de l'axe nature

Si et seulement si le pré-vol confirme 0 porteur :

- mettre taxonomy_hpa.outdoor_glamping à is_assignable=false ;
- conserver is_active=true pendant une version pour permettre l'affichage historique ;
- mettre metadata.axis = type_unite ;
- retirer metadata.famille ;
- ajouter metadata.deprecated_in_taxonomy = true ;
- ajouter metadata.replacement_domain = accommodation_unit_type.

Ne pas le rendre à nouveau assignable tant que le lot 5 n'est pas terminé.

### Étape 1.7 — Ajouter des assertions fail-closed

La migration doit échouer si :

1. plein_air est encore active ;
2. le nombre de familles actives n'est pas exactement 5 ;
3. une nature active pointe vers une famille absente ou inactive ;
4. un des trois nœuds HLO collectifs est encore sous_type ;
5. une des sept natures de plein air ou un des deux sous-types de Terrain déclaré manque ;
6. outdoor_glamping est désactivé alors qu'il a un porteur ;
7. un code gratuit ou payant a été créé dans les domaines de taxonomie ;
8. motorhome_services a été ajouté à une famille d'hébergement ;
9. farm_camping ou homestay_camping n'a pas declared_campground comme parent réel dans taxonomy_hpa ;
10. la closure ne contient pas ces deux relations directes à depth = 1.

Ne pas écrire ADD CONSTRAINT IF NOT EXISTS : PostgreSQL ne supporte pas cette syntaxe. Pour toute contrainte, interroger pg_constraint dans un bloc DO avant ALTER TABLE.

### Étape 1.7 bis — Reconstruire la fermeture taxonomique

Après les créations et changements de parent, appeler explicitement :

    SELECT api.refresh_ref_code_taxonomy_closure('taxonomy_hlo');
    SELECT api.refresh_ref_code_taxonomy_closure('taxonomy_camp');
    SELECT api.refresh_ref_code_taxonomy_closure('taxonomy_hpa');

Même si un trigger semble déjà le faire, ces appels rendent l'intention visible et permettent aux tests de vérifier immédiatement les chemins. Ils doivent rester dans la transaction de migration.

### Étape 1.8 — Mettre à jour le snapshot des arbres

Dans migration_taxonomy_trees_seed.sql :

- ajouter les quatre nouveaux nœuds HPA ;
- ajouter leurs relations parent=root dans la phase 2 ;
- re-parenter farm_camping et homestay_camping sous declared_campground ;
- aligner le libellé de taxonomy_camp.camping ;
- conserver le nœud historique taxonomy_camp.camping_chez_l_habitant non assignable ;
- ne pas recréer plein_air comme famille active ;
- ne pas laisser outdoor_glamping assignable comme nature.

Important : le snapshot est exécuté avant les migrations taxo3/taxo4 et la nouvelle migration. La nouvelle migration doit donc être ajoutée après taxo4 dans ci_fresh_apply.sql.

### Critère de fin du lot 1

Le lot est terminé uniquement si :

- la migration est idempotente ;
- aucun object_type n'a changé ;
- exactement une ligne object_taxonomy a changé : Gîte Hydrangea 974 vers gite_de_randonnee ;
- l'arbre cible est reproductible sur une base fraîche ;
- un reviewer SQL a validé le fichier.

## 8. Lot 2 — Tests SQL et fresh apply

### Fichiers

Créer :

- Base de donnée DLL et API/tests/test_taxonomy_accommodation_hierarchy_v2.sql

Modifier :

- Base de donnée DLL et API/tests/test_taxonomy_accommodation_vocabulary.sql
- Base de donnée DLL et API/ci_fresh_apply.sql
- docs/SQL_ROLLOUT_RUNBOOK.md

### Étape 2.1 — Mettre à jour le test historique

Relire intégralement Base de donnée DLL et API/tests/test_taxonomy_accommodation_vocabulary.sql. Ne pas corriger uniquement son compte de familles : le fichier protège aussi le vocabulaire des axes, la résolution des familles, les libellés canoniques, les aliases, leur indexation plein-texte et le retrait de l'ancien domaine accommodation_type.

Mettre à jour au minimum :

- 5 familles actives ;
- 1 ancien code plein_air inactif ;
- présence des codes campings_terrains et aires_haltes_plein_air ;
- libellé Auberge pour taxonomy_hlo.auberge_collective, avec Auberge collective dans aliases ;
- libellé Gîte pour taxonomy_hlo.gite_de_groupe, avec Gîte de groupe dans aliases ;
- libellé Camping pour taxonomy_camp.camping, avec Camping aménagé et Camping classé dans aliases ;
- axes nature des six entrées collectives ;
- parent réel declared_campground pour farm_camping et homestay_camping ;
- outdoor_glamping non assignable et absent des familles visibles.

Éviter un test count(*) = 5 sur toutes les lignes, car plein_air reste conservé mais inactif. Tester count(*) FILTER (WHERE is_active) = 5.

### Étape 2.2 — Écrire les tests permanents

Le nouveau fichier doit vérifier :

1. les cinq familles actives ;
2. plein_air inactive ;
3. les quatre natures de Campings et terrains et les deux sous-types de Terrain déclaré ;
4. les trois natures d'Aires et haltes de plein air ;
5. les six natures d'Hébergement collectif au même axe nature ;
6. aucune nature ou sous-type ne référence une famille inactive ;
7. outdoor_glamping non assignable jusqu'au lot 5 ;
8. motorhome_services reste dans taxonomy_spu ;
9. gratuit et payant sont absents des taxonomies ;
10. prl_stars reste applicable à HPA et CAMP ;
11. la closure contient chaque nouveau nœud et son ancêtre root ;
12. les caches des objets porteurs contiennent toujours leur code attendu ;
13. Gîte Hydrangea 974 reste HLO mais porte gite_de_randonnee, avec la source d'audit attendue ;
14. les comptes publiés sont 455 locatifs et 21 collectifs si aucun objet n'a été ajouté depuis le gel ; sinon vérifier le delta nominatif plutôt qu'un nombre silencieusement différent.
15. chaque nœud rendu comme sous-type possède un parent_id non nul, dans le même domain, dont metadata.axis = nature et metadata.famille est identique ;
16. la closure contient la relation directe parent/enfant à depth = 1, puis l'ancêtre root ;
17. api.get_filtered_object_ids appliqué à taxonomy_hpa.declared_campground retourne bien les porteurs de farm_camping et homestay_camping, tandis qu'un filtre sur un enfant ne retourne que son propre sous-arbre ;
18. deux nœuds de domaines différents ne deviennent jamais parent et enfant du seul fait qu'ils partagent metadata.famille.

Le test 17 ne doit pas dépendre du hasard des données live. Dans le fresh apply, créer transactionnellement un porteur publié pour farm_camping et un pour homestay_camping si les fixtures n'en contiennent pas déjà, appeler la même RPC que l'Explorer, puis supprimer explicitement les fixtures dans le même script de test ou revenir au SAVEPOINT prévu. Tester à la fois les identifiants retournés et l'absence d'un objet témoin extérieur au sous-arbre.

Invariant à copier dans la documentation technique et dans CLAUDE.md :

> Une entrée visuellement subordonnée à une autre doit être reliée par parent_id dans le même domaine et par la closure. metadata.famille ne produit qu'un regroupement plat et ne doit jamais être interprété comme une hiérarchie.

Chaque échec doit produire un message compréhensible, par exemple :

    RAISE EXCEPTION 'v2: motorhome_area doit appartenir à aires_haltes_plein_air';

### Étape 2.3 — Ajouter les tests au manifeste

Dans ci_fresh_apply.sql :

1. ajouter la migration v2 après taxo4 ;
2. ajouter le nouveau test immédiatement après ;
3. conserver ON_ERROR_STOP ;
4. utiliser \ir, pas un chemin absolu.

### Étape 2.4 — Exécuter le fresh apply

Commande recommandée :

    psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f "Base de donnée DLL et API/ci_fresh_apply.sql"

Si LOCAL_DB_URL n'est pas configurée, utiliser la procédure locale déjà documentée dans le dépôt. Ne pas remplacer par l'URL de production.

Attendu :

- code de sortie 0 ;
- aucun RAISE EXCEPTION ;
- toutes les assertions v2 vertes.

### Étape 2.5 — Dry-run sur une copie ou en transaction

Avant toute application live :

    BEGIN;
    \ir 'Base de donnée DLL et API/migration_taxonomy_accommodation_hierarchy_v2.sql'
    \ir 'Base de donnée DLL et API/tests/test_taxonomy_accommodation_hierarchy_v2.sql'
    ROLLBACK;

Attention : si la migration contient elle-même BEGIN/COMMIT, utiliser le script de validation du dépôt :

    node .tmp_pgapply/run_sql_file.cjs "Base de donnée DLL et API/migration_taxonomy_accommodation_hierarchy_v2.sql" --validate

### Critère de fin du lot 2

- fresh apply vert ;
- dry-run vert ;
- seconde exécution de la migration verte ;
- aucun warning de contrainte ou de RLS ignoré ;
- revue SQL terminée.

## 9. Lot 3 — Explorer

### Fichiers principaux

Modifier :

- bertel-tourism-ui/src/components/explorer/FiltersPanel.tsx
- bertel-tourism-ui/src/components/explorer/FiltersPanel.test.tsx
- bertel-tourism-ui/src/components/explorer/accommodation-taxonomy-tree.ts à créer pour isoler la construction de l'arbre
- bertel-tourism-ui/src/components/explorer/accommodation-taxonomy-tree.test.ts à créer
- bertel-tourism-ui/src/services/explorer-reference.ts
- bertel-tourism-ui/src/services/explorer-reference.test.ts
- bertel-tourism-ui/src/types/domain.ts si un type strict de code famille existe

### Étape 3.1 — Afficher cinq familles

Mettre à jour les références de démonstration :

- retirer plein_air ;
- ajouter Campings et terrains ;
- ajouter Aires et haltes de plein air.

L'affichage live doit continuer de lire accommodation_family. Ne pas coder les natures en dur dans FiltersPanel.

Étendre la lecture accommodation_family pour sélectionner metadata, puis exposer metadata.aliases dans ExplorerAccommodationFamily. La recherche de famille doit tester name, description et aliases.

### Étape 3.2 — Rendre la relation visuelle honnête

Cette étape ajoute une vraie capacité de rendu hiérarchique. Elle ne doit pas être traitée comme un simple changement de libellé dans FiltersPanel.

#### 3.2.a — Familles plates et collectif

Dans Hébergement collectif :

- afficher un seul bloc Nature ;
- y placer les six natures HLO et RVA ;
- afficher Auberge et Gîte comme libellés courts ;
- ne plus afficher de bloc Sous-type pour Auberge, Gîte et Refuge et gîte d'étape.

Comme Gîte est aussi un terme de recherche pour certains meublés de tourisme, afficher le contexte dans les résumés et filtres actifs : Hébergement collectif › Gîte. Dans la liste ouverte sous la famille, le libellé court Gîte suffit. Les six entrées restent sœurs : leur metadata.famille commune ne doit jamais servir à les imbriquer.

#### 3.2.b — Construire et rendre les vrais sous-arbres

Créer une fonction pure buildAccommodationTaxonomyTree. Elle indexe les nœuds par la clé composée domain + code et résout parentCode uniquement dans le même domain. Elle doit :

1. exclure isAssignable=false avant de former les familles, les compléments ou les sous-arbres ;
2. utiliser metadata.famille seulement pour déterminer le groupe de premier niveau ;
3. placer un nœud sous son parent uniquement si parentCode correspond à un nœud du même domaine ;
4. rendre les natures de premier niveau avant leurs enfants sous_type ;
5. signaler en développement un sous-type orphelin et l'exclure du rendu imbriqué au lieu de le présenter mensongèrement comme une nature sœur ;
6. ne jamais fusionner deux nœuds de domaines différents, même si leurs codes, libellés ou familles se ressemblent.

Dans les deux familles de plein air :

- afficher uniquement les natures appartenant à la famille ouverte ;
- Aire naturelle de camping doit apparaître sous Campings et terrains ;
- Terrain de camping déclaré doit pouvoir s'ouvrir pour afficher Camping à la ferme et Camping chez l'habitant ;
- sélectionner un sous-type doit conserver le fil d'Ariane complet et filtrer uniquement ce sous-arbre ;
- Aire d'accueil camping-car doit apparaître sous Aires et haltes de plein air.

Le parent Terrain de camping déclaré doit être un contrôle dépliable accessible avec aria-expanded et aria-controls. Camping à la ferme et Camping chez l'habitant sont rendus dans son conteneur enfant, avec une indentation perceptible ; ils ne doivent pas être des voisins DOM de même niveau que Camping. Une recherche correspondant à un enfant ouvre ou révèle son chemin parent.

Sélectionner Terrain de camping déclaré envoie son couple domain/code à taxonomyAny : la closure serveur inclut alors les deux sous-types. Sélectionner Camping à la ferme ou Camping chez l'habitant envoie uniquement le code enfant. Le frontend ne reconstitue pas lui-même l'union des descendants.

Le filtrage isAssignable=false doit aussi être appliqué à la liste actuelle des Critères complémentaires, qui collecte aujourd'hui les axis = type_unite. Cela empêche outdoor_glamping d'apparaître après la migration SQL et rend le frontend compatible avec l'ancien comme le nouveau catalogue.

### Étape 3.3 — Clarifier le comportement d'un en-tête de famille

Aujourd'hui, cliquer sur l'en-tête ouvre ou ferme l'accordéon. Ce n'est pas un filtre.

Conserver ce comportement, mais :

- garder le chevron visible ;
- ajouter aria-label du type Ouvrir la famille Campings et terrains ;
- ne pas utiliser le style d'une chip sélectionnable ;
- ne pas afficher de badge de filtre actif si aucune nature n'est sélectionnée.

Si le PO veut qu'une famille entière soit filtrable, créer un contrôle séparé Sélectionner toute la famille. Ne pas transformer silencieusement l'accordéon en filtre.

### Étape 3.4 — Gérer les natures vides

Les natures vides restent visibles pour aider la saisie et montrer le modèle cible.

Quand une nature vide est sélectionnée, l'état vide doit dire :

    Aucune fiche n'utilise encore cette nature d'hébergement.

Ne pas laisser le message générique Aucun résultat, qui peut faire croire à un bug.

Si le calcul de compte par nature est disponible sans nouvelle requête coûteuse, afficher 0 à côté du libellé. Sinon, garder le message d'état vide et ne pas introduire un nouvel endpoint dans ce lot.

### Étape 3.5 — Ajouter les tests Jest

Ajouter au minimum ces scénarios :

1. Hébergement collectif contient Auberge, Gîte, Refuge et gîte d'étape, Résidence de tourisme, Village de vacances et Résidence hôtelière sous Nature ;
2. aucun de ces six boutons n'est sous Sous-type ;
3. Campings et terrains contient quatre natures, et Terrain de camping déclaré contient les deux sous-types À la ferme et Chez l'habitant ;
4. Aires et haltes de plein air contient les trois natures attendues ;
5. Aire naturelle n'apparaît pas dans Aires et haltes ;
6. Aire d'accueil camping-car n'apparaît pas dans Campings et terrains ;
7. outdoor_glamping n'apparaît pas parmi les natures ;
8. sélectionner une nature ajoute le bon couple domain/code à taxonomyAny ;
9. les natures de domaines différents ne sont pas dédupliquées par erreur ;
10. le terme ancien Hôtellerie de plein air peut encore retrouver les deux nouvelles familles via les aliases, sans être affiché comme famille active.
11. la puce active du code gite_de_groupe affiche le contexte Hébergement collectif › Gîte.
12. Camping à la ferme et Camping chez l'habitant sont dans le conteneur enfant de Terrain de camping déclaré et ne sont pas rendus au même niveau DOM que Camping ;
13. sélectionner le parent et sélectionner un enfant produisent deux filtres domain/code différents ;
14. la recherche d'un sous-type révèle son parent ;
15. un parentCode identique dans un autre domaine n'établit aucune parenté ;
16. un nœud isAssignable=false est absent des familles et des Critères complémentaires ;
17. un sous-type orphelin n'est pas présenté comme une nature sœur et produit le signal de développement attendu.

Commandes :

    cd bertel-tourism-ui
    npm run test:run -- src/components/explorer/FiltersPanel.test.tsx src/components/explorer/accommodation-taxonomy-tree.test.ts src/services/explorer-reference.test.ts
    npm run typecheck

### Critère de fin du lot 3

Un utilisateur peut expliquer sans connaître HLO, RVA, CAMP ou HPA :

- pourquoi Aire naturelle est un camping ;
- pourquoi Aire de bivouac n'est pas un camping ;
- pourquoi Gîte n'est pas un enfant de Résidence de tourisme ;
- pourquoi Résidence hôtelière reste avec les résidences plutôt qu'avec Hôtel.

Et une inspection du DOM confirme que les deux campings déclarés sont de vrais enfants visuels et accessibles de Terrain de camping déclaré, conformément à la relation parent_id du catalogue.

## 10. Lot 4 — Création et édition des fiches

### Objectif

Pour une fiche d'hébergement, l'agent choisit un vocabulaire métier et le logiciel déduit le type technique. Les treize autres types d'objet conservent exactement leur parcours de création actuel.

### Fichiers à examiner

- bertel-tourism-ui/src/features/object-editor/create/create-object-options.ts
- bertel-tourism-ui/src/features/object-editor/create/create-object-options.test.ts
- bertel-tourism-ui/src/features/object-editor/sections/SectionIdentity.tsx
- bertel-tourism-ui/src/services/object-workspace.ts
- bertel-tourism-ui/src/features/help/content/creer-objet.ts

### Étape 4.1 — Ajouter un sélecteur en deux temps à la création

Le parcours Famille puis Nature ne s'active que lorsque l'utilisateur choisit de créer un hébergement. Il couvre HOT, HLO, RVA, CAMP et HPA. RES, ACT, ITI et les dix autres types non-hébergement doivent rester visibles, sélectionnables et créés avec le même object_type qu'avant ce chantier.

Ordre dans la branche Hébergement :

1. Famille d'hébergement ;
2. Nature d'hébergement ;
3. Sous-type lorsqu'il existe, notamment pour Terrain de camping déclaré ;
4. Type technique calculé et affiché en lecture seule ;
5. Nom de la fiche.

Mapping technique :

- nature dans taxonomy_hlo => HLO ;
- nature dans taxonomy_rva => RVA ;
- nature dans taxonomy_camp => CAMP ;
- nature dans taxonomy_hpa => HPA ;
- nature dans taxonomy_hot => HOT.

Le mapping doit être construit depuis le catalogue domain/object_type, pas depuis une liste dupliquée dans le composant.

Conserver le comportement actuel de saisie du nom, de recherche de doublons, de retour arrière et d'annulation. Si le dialogue actuel commence par le nom, la refonte peut conserver cette première étape ; l'exigence métier porte sur l'ordre relatif Famille > Nature > Sous-type > type technique, pas sur le déplacement forcé du champ Nom.

### Étape 4.2 — Ne pas autoriser un changement de type caché en édition

Pour une fiche existante :

- l'éditeur ne charge que le domaine compatible avec son object_type ;
- si l'agent cherche une nature d'un autre domaine, afficher Cette nature nécessite une conversion de type de fiche ;
- ne pas changer object_type automatiquement lors d'une simple sauvegarde ;
- une conversion de type doit rester une action administrative séparée.

### Étape 4.3 — Ajouter les aides de décision

Texte minimal :

- Camping : terrain organisé pour l'accueil de campeurs ; le classement se renseigne séparément ;
- Aire naturelle : catégorie de terrain de camping, malgré le mot aire ;
- Terrain de camping déclaré : petite structure relevant du régime déclaratif ; préciser ensuite si elle est exploitée à la ferme ou chez un particulier ;
- Camping à la ferme : sous-type déclaré situé sur une exploitation agricole ;
- Camping chez l'habitant : sous-type déclaré chez un particulier hors exploitation agricole ;
- Aire de bivouac : halte légère et temporaire, pas un terrain de camping ;
- Aire d'accueil camping-car : nuitée explicitement autorisée ;
- Aire de services camping-car : équipements disponibles, nuitée non déduite ;
- Halte nocturne : arrêt court autorisé, services non garantis.

### Étape 4.4 — Tests

Ajouter des tests vérifiant :

1. choisir Résidence de tourisme calcule RVA ;
2. choisir Gîte sous Hébergement collectif calcule HLO ;
3. choisir Camping calcule CAMP ;
4. choisir Aire naturelle calcule HPA ;
5. choisir Aire de bivouac calcule HPA ;
6. choisir Terrain déclaré puis Camping à la ferme calcule HPA et conserve le chemin parent ;
7. choisir Terrain déclaré puis Camping chez l'habitant calcule HPA et conserve le chemin parent ;
8. le type calculé n'est pas éditable ;
9. une édition HLO ne permet pas de sauvegarder directement une nature RVA ;
10. les treize types non-hébergement restent proposés ;
11. créer une fiche RES, une ACT et une ITI conserve exactement le code demandé et ne montre aucune étape Famille d'hébergement ;
12. le retour arrière, l'annulation et la détection des doublons gardent leur comportement pour les parcours hébergement et non-hébergement ;
13. une fixture énumérant les dix-huit codes techniques échoue si un des treize codes hors hébergement disparaît ou est redirigé.

### Critère de fin du lot 4

Un agent n'a plus besoin de savoir ce que signifie RVA ou HPA avant de créer une fiche d'hébergement, et aucun parcours de création non-hébergement n'a régressé.

## 11. Lot 5 — Type d'unité d'hébergement

Ce lot nécessite une revue d'architecture avant écriture, car object_taxonomy impose une seule valeur par objet et par domaine, alors qu'un établissement peut proposer plusieurs types d'unité.

### Décision de modèle

Ne pas réutiliser object_taxonomy pour stocker les unités.

Créer :

- un domaine de référence accommodation_unit_type ;
- une table de liaison multi-valuée object_accommodation_unit_type.

Valeurs initiales minimales :

| code | libellé |
|---|---|
| bubble | Bulle |
| tipi | Tipi |
| lodge | Lodge |
| cabin | Cabane |
| unusual_outdoor_unit | Hébergement insolite de plein air — autre |

Le futur lot général pourra aussi y migrer Maison/villa, Appartement, Studio, Bungalow, Chalet et Roulotte. Ne pas créer un deuxième système concurrent pour ces valeurs.

### Contraintes de la table de liaison

La table doit avoir :

- object_id avec FK vers object(id) ON DELETE CASCADE ;
- ref_code_id avec FK composite vers ref_code(domain,id) ;
- une contrainte CHECK imposant domain = accommodation_unit_type ;
- une clé primaire ou contrainte unique sur object_id + ref_code_id ;
- un index sur object_id ;
- un index sur ref_code_id, car PostgreSQL n'indexe pas automatiquement les FK ;
- created_at et updated_at selon le modèle des autres tables de liaison ;
- RLS activée ;
- politiques de lecture et d'écriture copiées depuis une table enfant d'objet équivalente, en utilisant api.can_read_object et le mécanisme d'écriture canonique existant.
- privilèges Data API accordés explicitement, commande par commande et uniquement aux rôles nécessaires ; ne pas supposer qu'une nouvelle table public est automatiquement exposée ou autorisée.

Ne pas utiliser TO authenticated seul : cela authentifie sans vérifier l'autorisation sur l'objet.

### Lot 5A — Schéma, sécurité, API et reprise (2 à 3 jours)

1. Copier le modèle structurel d'une table de liaison existante, pas d'une table improvisée.
2. Ajouter la table dans schema_unified.sql.
3. Ajouter le registre et les partitions ref_code nécessaires selon le modèle du dépôt.
4. Ajouter les nouvelles références.
5. Relever les GRANT et les politiques d'une table enfant comparable, puis définir explicitement SELECT, INSERT, UPDATE et DELETE pour chaque rôle autorisé. Toute commande non nécessaire reste refusée.
6. Ajouter la lecture à l'espace de travail objet.
7. Ajouter la sauvegarde canonique.
8. Exécuter le manifeste validé à l'étape 0.10 pour reprendre les Bulle, Lodge et autres unités historiques sans modifier silencieusement leur nature.
9. Comparer chaque fiche reprise avant/après et rafraîchir uniquement les identifiants du manifeste selon la procédure bornée du chapitre 14.
10. Une fois le backfill et tout le chemin lecture/écriture testés, mettre is_active=false sur outdoor_glamping et les autres anciennes feuilles devenues exclusivement des types d'unité, uniquement lorsqu'elles ont 0 porteur ; elles sont déjà is_assignable=false depuis le lot 1.

Arrêter le lot pour une revue architecture et sécurité. Le référent valide le modèle multi-valué, les FK, les index, les GRANT, toutes les politiques RLS et le résultat du backfill avant le démarrage de 5B.

### Lot 5B — Éditeur et Explorer (2 à 3 jours)

1. Ajouter un sélecteur multi-valeurs dans l'éditeur.
2. Ajouter le filtre Type d'unité dans Critères complémentaires de l'Explorer.
3. Brancher lecture, sauvegarde et filtre sur les API validées en 5A.
4. Vérifier l'affichage et la suppression d'une unité sur une fiche ayant plusieurs valeurs.
5. Livrer les textes d'aide correspondants avec le lot 6 bis.

### Tests obligatoires

- une fiche peut avoir Bulle et Lodge simultanément ;
- deux insertions identiques sont refusées ;
- un utilisateur sans droit d'écriture ne peut pas ajouter une unité ;
- la suppression d'un objet supprime les liens ;
- l'Explorer filtre sur une ou plusieurs unités ;
- les exports existants ne changent pas silencieusement ;
- chaque porteur historique Bulle, Lodge, Insolite ou outdoor_glamping est migré ou bloqué par une décision manquante explicite ;
- aucune ancienne feuille désactivée ne conserve de porteur ;
- les FK sont indexées ;
- RLS est activée et testée avec un rôle non administrateur ;
- SELECT, INSERT, UPDATE et DELETE sont chacun testés avec un propriétaire autorisé, un utilisateur authentifié non autorisé et, si la Data API l'expose, le rôle anonyme ;
- les GRANT ne permettent aucune commande plus large que la politique RLS et le chemin canonique prévus.

### Critère de fin du lot 5

Une fiche peut être Aire naturelle de camping comme nature et proposer Bulle + Lodge comme types d'unité, sans perdre aucune information.

## 12. Lot 6 — Services et tarifs

### Aire de services camping-car

Conserver taxonomy_spu.motorhome_services pour une aire de services autonome.

Pour décrire les équipements d'une fiche d'hébergement, vérifier le catalogue ref_amenity. Les trois capacités doivent être distinctes :

- alimentation en eau ;
- vidange des eaux usées ;
- branchement électrique.

Si un code manque, le créer dans le catalogue d'équipements, pas dans une taxonomie d'hébergement.

Règle d'acceptation :

- une fiche peut avoir les trois services sans être une aire autorisant la nuitée ;
- une Aire d'accueil camping-car peut autoriser la nuitée sans posséder les trois services.

### Gratuit ou payant

Utiliser object_price et le vocabulaire de prix existant.

Ne pas créer :

- une famille Gratuit ;
- une nature Aire gratuite ;
- un metadata gratuit=true sur ref_code.

Tests :

- une Aire de bivouac gratuite possède une ligne tarifaire Gratuit ou l'absence de montant selon la règle actuelle ;
- la même nature peut aussi être payante ;
- changer le tarif ne change ni domain, ni code de taxonomie, ni object_type.

### Aide agent

Le contenu d'aide associé est traité intégralement dans le lot 6 bis. Ne pas corriger une seule phrase isolée : toutes les surfaces doivent employer la même terminologie le jour du déploiement.

## 12 bis. Lot 6 bis — Documentation et accompagnement utilisateur

### Objectif et règle de livraison

La modification de la taxonomie n'est pas terminée lorsque la base et les filtres sont corrects. Elle est terminée lorsqu'un agent qui ne connaît ni HLO, ni RVA, ni CAMP, ni HPA peut créer et corriger une fiche sans aide orale.

La documentation actuellement visible par l'utilisateur décrit encore l'ancien processus et les anciens regroupements. Elle doit être réécrite et livrée dans la même version que la nouvelle taxonomie. Interdiction de déployer la nouvelle arborescence avec l'ancienne aide, même temporairement.

Le centre d'aide ne suffit pas à lui seul. Les mêmes règles doivent être compréhensibles :

1. dans le dialogue de création, au moment du choix ;
2. dans l'aide contextuelle de l'éditeur ;
3. dans le centre d'aide consultable ;
4. dans l'aide de l'Explorer, lorsque l'agent contrôle le classement obtenu.

### Étape 6 bis.1 — Inventorier puis attribuer chaque surface

Avant de modifier du texte, créer une petite matrice de suivi dans le ticket avec les colonnes Surface, Fichier, Contenu attendu, Responsable et État.

Fichiers à examiner et à mettre à jour si le contenu concerné y est présent :

- bertel-tourism-ui/src/features/object-editor/create/CreateObjectDialog.tsx : ordre du parcours, consignes courtes et récapitulatif avant création ;
- bertel-tourism-ui/src/features/object-editor/create/create-object-options.ts : familles, natures, descriptions et correspondance technique ;
- bertel-tourism-ui/src/features/object-editor/sections/SectionIdentity.tsx : aide contextuelle sur la nature et conduite à tenir en cas d'erreur ;
- bertel-tourism-ui/src/features/help/content/creer-objet.ts : tutoriel complet et fiches HLO, RVA, CAMP et HPA existantes ;
- bertel-tourism-ui/src/features/help/content/choisir-type.ts : guide de décision entre familles et cas limites ;
- bertel-tourism-ui/src/features/help/content/editeur.ts : différence entre nature, type d'unité, service et tarif ;
- bertel-tourism-ui/src/features/help/content/explorer.ts : fonctionnement des cinq familles et des filtres Nature ;
- bertel-tourism-ui/src/features/help/content/demarrer.ts : lien vers le tutoriel de première création, si un parcours de démarrage y est proposé ;
- bertel-tourism-ui/src/views/HelpPage.tsx : affichage, liens et recherche dans l'aide ;
- bertel-tourism-ui/src/features/help/content/types.ts : rubriques ou métadonnées si une nouvelle entrée les exige.

Chaque ligne de la matrice doit avoir un propriétaire. La personne en première année peut rédiger et implémenter ; le référent métier valide les définitions et un agent utilisateur valide leur compréhension.

### Étape 6 bis.2 — Écrire le tutoriel Créer une fiche d'hébergement

Créer une entrée d'aide centrale intitulée Créer une fiche d'hébergement en 5 étapes. Elle doit suivre exactement l'ordre réel de l'interface :

1. saisir le nom officiel de l'établissement et rechercher un éventuel doublon ;
2. choisir l'une des cinq familles métier ;
3. choisir la nature qui décrit l'établissement, pas son bâtiment ni ses équipements ;
4. vérifier le récapitulatif avant création ; le type technique est calculé par Bertel et n'est pas un choix utilisateur ;
5. compléter ensuite, dans des champs séparés, les types d'unité, les services et les tarifs.

Si l'ordre final du dialogue diffère, modifier le tutoriel avant livraison pour qu'il corresponde écran par écran. Ajouter une capture d'écran seulement si le projet dispose d'un mécanisme de maintenance des captures ; sinon privilégier un texte court qui ne devient pas faux à chaque changement visuel.

Le tutoriel doit dire explicitement :

- une nature répond à la question Quel type d'établissement est-ce ? ;
- un type d'unité répond à Dans quoi le visiteur dort-il ? ;
- un service répond à Qu'est-ce qui est mis à disposition ? ;
- un tarif répond à Combien cela coûte-t-il ? ;
- le classement en étoiles est une information séparée de la nature Camping.

Exemple à inclure : un établissement peut avoir pour nature Aire naturelle de camping, proposer des unités Lodge et Cabane, fournir eau et électricité et appliquer un tarif gratuit ou payant. Aucune de ces trois dernières informations ne change sa nature.

### Étape 6 bis.3 — Documenter le choix des cinq familles

Présenter les cinq familles avec une définition courte et leurs natures :

- Hôtellerie : hôtels et formes hôtelières rattachées à cette branche existante ;
- Hébergement locatif : logements ou chambres loués individuellement selon la branche existante ;
- Hébergement collectif : Auberge, Gîte, Refuge et gîte d'étape, Résidence de tourisme, Village de vacances et Résidence hôtelière ;
- Campings et terrains : Camping, Aire naturelle de camping, Terrain de camping déclaré et Parc résidentiel de loisirs ; sous Terrain déclaré : Camping à la ferme et Camping chez l'habitant ;
- Aires et haltes de plein air : Aire de bivouac, Aire d'accueil camping-car et Halte nocturne camping-car/van.

Ajouter les arbitrages qui risquent de faire hésiter :

- Résidence hôtelière reste dans Hébergement collectif, car son organisation relève des résidences et non de la nature Hôtel ;
- Aire naturelle reste dans Campings et terrains, car c'est une catégorie de terrain de camping ;
- Aire d'accueil camping-car autorise la nuitée, tandis qu'une Aire de services décrit des équipements sans prouver que la nuitée est permise ;
- Parc résidentiel de loisirs désigne un terrain aménagé principalement pour des habitations légères de loisirs et des résidences mobiles destinées à un séjour temporaire ; ce n'est ni un lotissement résidentiel permanent ni une simple aire de stationnement.

Les codes HLO, RVA, CAMP et HPA ne doivent apparaître ni dans les titres ni dans les instructions principales. S'ils sont nécessaires au support, les placer dans une note avancée clairement séparée.

### Étape 6 bis.4 — Gérer les anciens mots et les libellés courts

Les libellés visibles sont Auberge, Gîte et Camping, mais la recherche dans l'aide doit encore reconnaître les formulations historiques et réglementaires.

Ajouter comme mots-clés ou alias de recherche :

- auberge collective vers Auberge ;
- gîte de groupe vers Gîte dans Hébergement collectif ;
- camping aménagé, camping classé et camping aménagé/classé vers Camping ;
- résidence de vacances vers Résidence de tourisme ou vers l'article d'arbitrage correspondant ;
- glamping, hébergement insolite, bulle, tipi, lodge et cabane vers Type d'unité, et non vers une nature HPA.

Comme le mot Gîte peut aussi désigner un hébergement locatif, toujours afficher le chemin complet dans un résultat de recherche ou un récapitulatif : Hébergement collectif > Gîte ou Hébergement locatif > Gîte/meublé, selon le choix réel.

### Étape 6 bis.5 — Ajouter de l'aide au point de décision

Dans le dialogue de création :

- afficher une définition d'une phrase sous chaque famille et chaque nature ambiguë ;
- proposer un lien Pourquoi ce choix ? vers l'entrée d'aide correspondante ;
- afficher avant validation un récapitulatif Famille, Nature et Type technique calculé ;
- garder le code technique visuellement secondaire ;
- signaler que types d'unité, services, classement et tarifs seront renseignés après la création ;
- ne jamais demander à l'utilisateur de quitter le dialogue et de lire toute la documentation pour comprendre un choix courant.

Dans la section Identité d'une fiche existante :

- afficher le chemin Famille > Nature ;
- expliquer qu'une nature appartenant à un autre type technique nécessite une conversion administrative ;
- fournir une action ou une consigne claire pour demander cette conversion ;
- ne jamais laisser croire qu'une simple sauvegarde changera le type technique.

Les descriptions courtes doivent provenir d'une source unique, idéalement ref_code.description ou un catalogue frontend central, afin d'éviter qu'une définition diverge entre l'Explorer, le dialogue et l'aide.

### Étape 6 bis.6 — Réécrire les entrées existantes qui deviendraient fausses

Vérifier au minimum :

- l'entrée générale Comment créer une nouvelle fiche ? ;
- les entrées de création HLO, RVA, CAMP et HPA ;
- l'arbitrage Gîte, chambre d'hôtes, hôtel ou résidence ;
- l'article Filtrer par catégorie et sous-catégorie ;
- les explications des sections de l'éditeur et du module indisponible pour ce type.

Supprimer ou corriger toute phrase qui :

- demande de choisir d'abord un type technique ;
- décrit le glamping, le tipi ou le lodge comme une nature d'établissement ;
- limite Camping à Camping classé ;
- présente Hébergement collectif comme un enfant de Résidence de tourisme ;
- confond une autorisation de nuitée avec la présence d'eau, de vidange ou d'électricité ;
- emploie catégorie, sous-catégorie, nature et type comme des synonymes sans définition.

### Étape 6 bis.7 — Ajouter les tests documentaires et de parcours

Mettre à jour ou créer les tests suivants :

- bertel-tourism-ui/src/features/help/content-integrity.test.ts : identifiants uniques, liens connexes valides et types référencés existants ;
- bertel-tourism-ui/src/features/help/faq-search.test.ts et bertel-tourism-ui/src/features/help/faq-search.corpus.test.ts : les libellés actuels et anciens renvoient vers la bonne réponse ;
- bertel-tourism-ui/src/views/HelpPage.test.tsx : les nouvelles entrées sont rendues et accessibles ;
- bertel-tourism-ui/src/features/object-editor/create/CreateObjectDialog.test.tsx : parcours Famille > Nature > récapitulatif sans choix préalable d'un code technique ;
- bertel-tourism-ui/src/features/object-editor/create/create-object-options.test.ts : mapping métier vers type technique et alias attendus ;
- bertel-tourism-ui/src/features/object-editor/sections/SectionIdentity.test.tsx : chemin visible et message de conversion.

Corpus minimal de recherche à tester : Auberge, auberge collective, Gîte de groupe, résidence hôtelière, camping classé, aire naturelle, PRL, aire de bivouac, aire de services, halte van, glamping, lodge, gratuit et vidange.

### Étape 6 bis.8 — Faire une recette avec un agent débutant

Choisir une personne qui n'a pas participé à la migration et ne lui expliquer ni les codes techniques ni la réponse attendue. Lui donner successivement ces tâches :

1. créer un Gîte destiné à l'accueil d'un groupe ;
2. classer une Aire naturelle de camping puis expliquer pourquoi elle n'est pas une Aire de bivouac ;
3. créer un Parc résidentiel de loisirs et ajouter Lodge, eau et un tarif ;
4. retrouver ces fiches dans l'Explorer ;
5. expliquer comment faire corriger une nature choisie par erreur.

Critères de réussite :

- chaque tâche courante est terminée en moins de deux minutes, hors saisie détaillée de la fiche ;
- l'agent ne demande jamais quel code HLO, RVA, CAMP ou HPA choisir ;
- il classe correctement les cinq cas sans indication orale ;
- il distingue nature, type d'unité, service et tarif avec ses propres mots ;
- il retrouve dans l'aide la réponse à une erreur de classement ;
- toute hésitation ou mauvaise interprétation produit une correction du texte ou de l'interface, puis un nouveau test.

Conserver dans le ticket la date, le profil du testeur, les tâches réussies, les hésitations observées et les corrections effectuées. Ne pas enregistrer de donnée personnelle inutile.

### Critère de fin du lot 6 bis

Le lot est terminé uniquement si le dialogue, l'éditeur, l'Explorer et le centre d'aide utilisent les mêmes cinq familles, les mêmes natures et les mêmes définitions, si les recherches avec les anciens termes fonctionnent et si la recette avec un agent débutant est réussie.

## 13. Lot 7 — Recette fonctionnelle

Créer une fiche de test ou utiliser des fixtures. Ne pas polluer la production.

| Scénario | Action | Résultat attendu |
|---|---|---|
| Collectif HLO | choisir Gîte | type HLO calculé, nature visible dans collectif |
| Collectif RVA | choisir Résidence de tourisme | type RVA calculé, même bloc Nature |
| Camping | choisir Camping | type CAMP ; classement renseigné séparément |
| Aire naturelle | choisir Aire naturelle de camping | famille Campings et terrains, type HPA |
| Terrain déclaré | choisir Terrain de camping déclaré | famille Campings et terrains |
| Camping à la ferme | choisir Terrain déclaré puis Camping à la ferme | famille Campings et terrains, fil d'Ariane complet |
| Camping particulier | choisir Terrain déclaré puis Camping chez l'habitant | famille Campings et terrains, fil d'Ariane complet |
| PRL | choisir Parc résidentiel de loisirs | classement prl_stars disponible |
| Bivouac | choisir Aire de bivouac | famille Aires et haltes, pas de service forcé |
| Camping-car nuitée | choisir Aire d'accueil camping-car | nuitée explicite, services indépendants |
| Halte van | choisir Halte nocturne camping-car/van | services non présumés |
| Insolite | ajouter Bulle + Lodge | deux unités, nature inchangée |
| Reprise Hydrangea | ouvrir Gîte Hydrangea 974 | HLO, Hébergement collectif > Refuge et gîte d'étape |
| Reprise unités historiques | contrôler les sept fiches du manifeste | unité visible, nature conservée, aucun ancien signal perdu |
| Services | ajouter eau + vidange | nature inchangée |
| Tarif | rendre la fiche gratuite | nature et famille inchangées |

### Commandes frontend finales

Depuis bertel-tourism-ui :

    npm run typecheck
    npm run test:run
    npm run build

### Contrôles SQL finaux

1. Aucun nœud actif sans axis.
2. Aucune nature active avec une famille inactive.
3. Exactement cinq familles actives.
4. Aucun porteur de outdoor_glamping.
5. Aucun objet avec deux taxonomies dans le même domaine.
6. Les caches des trois objets CAMP/HPA historiques sont corrects.
7. Les deux materialized views sont rafraîchissables CONCURRENTLY.
8. Gîte Hydrangea porte gite_de_randonnee et reste HLO.
9. Les sept lignes Type d'unité du manifeste existent exactement une fois.
10. Les anciennes feuilles HLO bulle, lodges et hebergement_insolite ont 0 porteur après leur reprise.
11. La décision concernant La Roulotte Géante et Le Verger de la Chapelle est respectée sans écriture implicite.
12. Chaque sous-type visible a un parent réel dans le même domaine et une relation depth = 1 dans la closure.
13. La RPC de filtre appelée sur Terrain de camping déclaré inclut les porteurs de Camping à la ferme et Camping chez l'habitant.
14. Aucun nœud is_assignable=false n'est exposé par l'Explorer, y compris parmi les types d'unité complémentaires.

### Contrôle visuel

Tester à largeur bureau et mobile :

- titres non tronqués ;
- accents et apostrophes corrects ;
- clavier et lecteur d'écran ;
- accordéons clairement différents des filtres ;
- état vide explicite ;
- pas de mention HLO/RVA/CAMP/HPA comme choix principal.

## 14. Déploiement

La personne en première année prépare le déploiement. Un référent l'exécute ou le supervise.

### Avant le commit SQL

1. Exécuter Supabase Database Advisors.
2. Vérifier les alertes RLS et index.
3. Capturer les comptes avant migration.
4. Faire le dry-run complet.
5. Obtenir l'accord du référent métier sur les libellés et descriptions.
6. Vérifier que le lot 6 bis est terminé et inclus dans la même version frontend.
7. Extraire du catalogue live pg_trigger et pg_proc les définitions de update_object_updated_at, trg_increment_object_version et trg_object_version ; confirmer par revue que les trois colonnes search_document* peuvent encore provoquer updated_at/current_version/object_version.
8. Déployer d'abord le frontend rétrocompatible du lot 3 : exclusion de isAssignable=false, rendu parent/enfant et support des cinq familles. Avec l'ancien catalogue, ce code doit conserver le rendu actuel. Le nouveau texte d'aide reste masqué derrière la présence effective des nouveaux codes ou un indicateur de version de catalogue.
9. Vérifier ce frontend en production avant l'écriture SQL. Il est interdit d'appliquer d'abord le SQL qui rend outdoor_glamping non assignable.

### Manifeste borné de rafraîchissement

Créer une table temporaire _taxonomy_refresh_manifest(object_id text PRIMARY KEY, reason text NOT NULL) et y insérer uniquement les fiches dont une taxonomie, un type d'unité ou le document de recherche peut légitimement changer.

Pour un déploiement combinant les lots 1 et 5 tels qu'audités le 29 juillet, le plafond actuel est de douze identifiants uniques :

| object_id | raison |
|---|---|
| HLORUN00000000ZV | porteur de gite_de_groupe, libellé/axe modifié |
| HLORUN000000011E | porteur de gite_de_groupe, libellé/axe modifié |
| HLORUN000000012H | porteur de gite_de_groupe, libellé/axe modifié |
| CAMRUN000000013G | porteur CAMP et reprise Type d'unité |
| CAMRUN00000000PH | porteur homestay_camping et reprise Type d'unité |
| CAMRUN000000013J | porteur homestay_camping |
| HLORUN000000017A | correction Gîte Hydrangea |
| HLORUN000000015Q | reprise Type d'unité |
| HLORUN000000013Y | reprise Type d'unité |
| HLORUN000000017V | reprise Type d'unité |
| HLORUN00000000UW | reprise Type d'unité |
| HLORUN000000018Q | reprise Type d'unité |

Le lot 1 seul contient exactement sept identifiants : les trois porteurs de gite_de_groupe, le CAMP, les deux porteurs de homestay_camping et Hydrangea. Le lot 5 seul contient exactement les sept identifiants du manifeste Type d'unité ; CAMRUN000000013G et CAMRUN00000000PH sont communs aux deux listes, ce qui explique les douze identifiants uniques en déploiement combiné.

Si les lots sont livrés séparément, produire un manifeste par lot et supprimer les raisons hors périmètre. Avant l'application, revalider chaque état source et faire échouer la transaction si la liste calculée diffère de la liste approuvée. Les deux décisions ouvertes, La Roulotte Géante et Le Verger de la Chapelle, ne sont jamais ajoutées sans arbitrage signé. Le nombre N de fiches dont updated_at ou la version doit réellement bouger n'est pas supposé égal au nombre de lignes rafraîchies : il est mesuré au dry-run, revu, puis figé comme assertion de production.

Dans le dry-run :

1. figer pour les douze lignes object.updated_at, current_version, les lignes correspondantes de l'historique object_version et les trois search_document* avant écriture ;
2. figer aussi un témoin de toutes les autres lignes object afin de détecter un effet de bord du script ;
3. appliquer la migration et appeler api.refresh_object_filter_caches uniquement avec les object_id du manifeste ;
4. produire la liste exacte des identifiants dont updated_at ou une version a bougé ;
5. confirmer que cette liste est un sous-ensemble du manifeste et qu'aucun objet extérieur n'a changé à cause de la migration ;
6. faire approuver et conserver cette liste exacte comme résultat attendu de production.

Ne pas désactiver les triggers : les changements sémantiques légitimes doivent continuer d'alimenter les synchronisations partenaires. Le but est de borner et mesurer l'effet, pas de le masquer.

### Application

1. Ouvrir la transaction au niveau d'isolation validé par le référent et recréer le manifeste temporaire approuvé.
2. Recontrôler ses douze lignes et leurs valeurs sources attendues.
3. Appliquer la migration v2.
4. Exécuter le test SQL v2.
5. Rafraîchir uniquement les caches du manifeste :

       SELECT api.refresh_object_filter_caches(o.id)
       FROM public.object o
       JOIN _taxonomy_refresh_manifest m ON m.object_id = o.id;

6. Avant COMMIT, comparer updated_at et les versions au gel : la liste obtenue doit être exactement celle approuvée lors du dry-run et aucun identifiant hors manifeste ne doit être attribuable au script. En cas d'écart, ROLLBACK.
7. Valider la transaction sous supervision.
8. Hors transaction :

       REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_filtered_objects;
       REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_ref_data_json;
       NOTIFY pgrst, 'reload schema';

9. Rejouer les requêtes de comptage.
10. Effectuer la recette Explorer, notamment le filtre parent Terrain de camping déclaré qui doit contenir les porteurs des deux sous-types.
11. Activer le nouveau texte d'aide si son affichage est conditionné par la version du catalogue.
12. Vérifier en production que le dialogue de création et le centre d'aide affichent la nouvelle terminologie. Si l'ancienne aide apparaît encore, arrêter l'activation ou appliquer le rollback coordonné ; ne pas laisser les deux versions coexister.

### Retour arrière

Le rollback doit être préparé avant l'application.

Principes :

- réactiver plein_air si l'interface doit revenir à l'ancienne version ;
- remettre les anciennes metadata.famille ;
- remettre les trois HLO collectifs en sous_type seulement si le frontend est lui aussi revenu en arrière ;
- désactiver les nouveaux nœuds au lieu de les supprimer ;
- ne jamais désactiver un nouveau nœud s'il a reçu un porteur après le déploiement ;
- restaurer les caches et materialized views après rollback.
- revenir conjointement au frontend antérieur si les relations parent/enfant ou les cinq familles sont retirées ; ne jamais laisser le SQL v2 sous un frontend qui n'exclut pas isAssignable=false.

Si des fiches ont commencé à utiliser les nouveaux codes, le rollback devient une migration de données et doit être revu séparément.

## 15. Documentation technique et traçabilité à mettre à jour

Cette section concerne la documentation interne. La documentation destinée aux agents et l'aide intégrée sont obligatoires et détaillées dans le lot 6 bis.

Modifier :

- docs/taxonomy-hebergement-vocabulaire-canonique-2026-07-27.md ;
- docs/taxonomy-hebergement-niveau2-inventaire-2026-07-27.md avec un addendum, sans réécrire le constat historique ;
- docs/SQL_ROLLOUT_RUNBOOK.md ;
- CLAUDE.md, pour remplacer l'ancien nombre de familles et ajouter l'invariant structurel : une subordination visible exige parent_id + closure dans le même domaine ; metadata.famille reste un regroupement plat ;
- le journal de décisions, avec un nouveau numéro attribué par le référent.

Ajouter une preuve de déploiement après application, sur le modèle de :

- docs/taxonomy-camp-hpa-homestay-deployment-evidence-2026-07-27.md.

Le document de preuve doit contenir :

- état avant ;
- état après ;
- commandes de test ;
- résultats des Advisors ;
- nombre de fiches touchées ;
- confirmation qu'aucun type technique n'a changé ;
- manifeste nominatif des fiches autorisées à changer ;
- delta exact de updated_at, current_version et object_version, comparé au résultat approuvé du dry-run ;
- confirmation qu'aucune fiche hors manifeste n'a été modifiée par le script ;
- résultat de la recette Explorer ;
- procédure de rollback.

## 16. Mise à jour des graphes

Après modification du code :

    graphify update .

Si le lot 5 ajoute la table object_accommodation_unit_type et si TBLS_DSN est disponible, régénérer aussi le graphe de base selon tools/db-graph/README.md.

Ne pas régénérer le graphe de base avec une connexion de production non validée.

## 17. Définition globale de terminé

Le chantier n'est terminé que si toutes les cases suivantes sont vraies :

- [ ] cinq familles actives et seulement cinq ;
- [ ] plein_air conservée mais inactive ;
- [ ] six natures collectives affichées au même niveau ;
- [ ] quatre natures dans Campings et terrains et deux sous-types sous Terrain de camping déclaré ;
- [ ] chaque sous-type visible est un vrai enfant same-domain par parent_id et closure, jamais par metadata.famille seule ;
- [ ] filtrer Terrain de camping déclaré remonte les porteurs de ses deux enfants via api.get_filtered_object_ids ;
- [ ] trois natures dans Aires et haltes de plein air ;
- [ ] Aire naturelle rangée avec les campings ;
- [ ] outdoor_glamping n'est plus une nature assignable ;
- [ ] Bulle, tipi, lodge et cabane sont multi-valués comme types d'unité ;
- [ ] Aire de services reste indépendante de l'autorisation de nuitée ;
- [ ] gratuit/payant reste indépendant de la taxonomie ;
- [ ] création guidée par famille puis nature ;
- [ ] types techniques dérivés et non choisis en premier ;
- [ ] les treize types non-hébergement conservent leur parcours et leur object_type ;
- [ ] toutes les fiches historiques confirmées ou couvertes par un manifeste approuvé ;
- [ ] aucun changement de nature ou de type déduit automatiquement d'un mot-clé ;
- [ ] Gîte Hydrangea 974 corrigé vers Refuge et gîte d'étape sans changer son type HLO ;
- [ ] les sept reprises Bulle, Lodge et Cabane du manifeste sont présentes sans perte dans Type d'unité ;
- [ ] La Roulotte Géante et Le Verger de la Chapelle ont une décision signée ou restent explicitement inchangés ;
- [ ] 0 fiche d'hébergement sans taxonomie compatible et 0 porteur d'un nœud obsolète ;
- [ ] migration idempotente ;
- [ ] fresh apply vert ;
- [ ] tests SQL, Jest, typecheck et build verts ;
- [ ] RLS et index du nouveau lien vérifiés ;
- [ ] GRANT Data API et quatre commandes CRUD du nouveau lien testés par rôle autorisé et non autorisé ;
- [ ] rafraîchissement limité au manifeste nominatif et delta updated_at/version identique au dry-run ;
- [ ] tutoriel Créer une fiche d'hébergement aligné sur l'ordre réel de l'interface ;
- [ ] dialogue de création, éditeur, Explorer et centre d'aide alignés sur les mêmes termes ;
- [ ] anciennes expressions recherchables comme alias sans être affichées comme libellés principaux ;
- [ ] aide expliquant nature, type d'unité, service, tarif et classement ;
- [ ] procédure de correction d'une mauvaise nature visible par l'agent ;
- [ ] recette sans aide orale réussie par un agent débutant ;
- [ ] documentation technique et aide utilisateur déployées avec la taxonomie ;
- [ ] preuve de déploiement écrite ;
- [ ] revue métier, revue SQL et recette PO obtenues.

## 18. Sources réglementaires à conserver dans le ticket

- [Code du tourisme, article D332-1 et suivants](https://www.legifrance.gouv.fr/codes/id/LEGISCTA000025846141) : les terrains de camping sont classés par étoiles ou dans la catégorie aire naturelle.
- [Direction générale des Entreprises — Les terrains de camping déclarés](https://www.entreprises.gouv.fr/espace-entreprises/s-informer-sur-la-reglementation/les-terrains-de-camping-declares) : Camping à la ferme et terrain rural/chez un particulier sont des formes usuelles du terrain déclaré ; justification de la hiérarchie parent/sous-types.
- [Code du tourisme, articles D333-3 et D333-4](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006074073/LEGISCTA000006158436/) : définition du parc résidentiel de loisirs et de son exploitation sous régime hôtelier.
- [Code de l'urbanisme, terrains de camping et parcs résidentiels de loisirs](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006074075/LEGISCTA000031719398/) : règles d'aménagement et d'implantation.
- [Atout France — catégories d'hébergement](https://www.atout-france.fr/fr/classement/les-categories-dhebergement) : catégories et classements des campings et PRL.
- [Insee — notice sur les hébergements collectifs touristiques](https://www.insee.fr/fr/metadonnees/source/fichier/Notice_explicative_2022.pdf) : Résidence de tourisme / Résidence hôtelière est une catégorie distincte des hôtels.

Les sources servent à rédiger les descriptions et infobulles. Elles ne remplacent pas la validation du référent métier pour les appellations locales Aire de bivouac et Halte nocturne camping-car/van.
