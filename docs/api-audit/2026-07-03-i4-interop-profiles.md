# Sortie multi-standards (I4) — schema.org · DATAtourisme · Apidae · Tourinsoft

**Dates** : 2026-07-01 → 2026-07-03 · **Source du plan** : `2026-06-30-api-fix-plan.md` (I4, Phase 2) · **Contrainte n°1 du PO** : *ne casser aucun accès nécessaire au front.*

> Item **I4** de la Phase 2 (interopérabilité sectorielle) — **livré en entier** : les 4 profils actés par le PO, sur le **détail** ET la **liste paginée** (synchronisation par lots). Clôt l'audit API (Phases 0 + 1 + 2).

---

## Ce que ça donne à un partenaire

Chaque fiche **publiée** est disponible dans 4 formats pivot, via le paramètre opt-in `format` de la passerelle partenaire (`Authorization: Bearer bk_live_…`) :

| `?format=` | Bloc ajouté | Standard | Usage type |
|---|---|---|---|
| `jsonld` | `data.jsonld` | schema.org (JSON-LD) | SEO — collable dans un `<script type="application/ld+json">` |
| `datatourisme` | `data.datatourisme` | Ontologie nationale DATAtourisme (JSON-LD) | Alimentation open data / plateforme nationale |
| `apidae` | `data.apidae` | JSON régional Apidae | Échange avec la plateforme Apidae |
| `tourinsoft` | `data.tourinsoft` | Syndication SIT Tourinsoft | Échange SIT (les codes Bertel **sont** des bordereaux Tourinsoft ; `object.id` a la forme d'un `SyndObjectID`) |

Le bloc est **additif** : les clés de base de la réponse ne changent jamais (garde §103) ; sans `format`, la réponse est identique byte-à-byte à avant. Orthogonal à `?lang`.

### Détail (une fiche)

```
GET /api/public/objects/{id}?format=datatourisme
```

```jsonc
{
  "meta": { "contract_version": "1.0.0" },
  "data": {
    "id": "RESRUN00000000XK", "name": "Le Macabit", /* … ressource Bertel inchangée … */
    "datatourisme": {
      "@context": { "@vocab": "https://www.datatourisme.fr/ontology/core#", "schema": "http://schema.org/", /* rdfs, dc, foaf */ },
      "@id": "urn:bertel:object:RESRUN00000000XK",
      "@type": ["PointOfInterest", "FoodEstablishment"],
      "rdfs:label": [{ "@language": "fr", "@value": "Le Macabit" }],
      "hasDescription": [{ "@type": "Description", "dc:description": [{ "@language": "fr", "@value": "…texte propre…" }] }],
      "isLocatedAt": [{ "@type": "schema:Place", "schema:address": { "…": "PostalAddress" }, "schema:geo": { "…": "GeoCoordinates" } }],
      "hasContact": [{ "@type": "schema:Organization", "schema:telephone": "…", "schema:email": "…" }]
    }
  }
}
```

### Liste paginée — synchronisation par lots (I4c)

```
GET /api/public/objects?format=tourinsoft&page_size=200          → page 1
GET /api/public/objects?format=tourinsoft&page_size=200&cursor=… → pages suivantes
```

- **Même pagination par curseur** que la liste nue (`cursor`, `page_size` 1–200, `types`, `search`, `lang` inchangés).
- Chaque élément de `data[]` porte en plus son document sous `data[i].<profil>`.
- Un objet **non couvert** par le profil (mapping désactivé) n'a simplement **pas la clé** — l'élément reste complet par ailleurs.
- Best-effort : si la construction des documents échoue, la page est servie **nue** (jamais d'erreur bloquante).
- Coût serveur : **2 appels DB par page** (liste + un batch) — mesuré **88 ms** pour une page pleine de 200 documents.

### Boucle de synchronisation complète (partenaire)

```
cursor = absent
répéter:
  r = GET /objects?format=<profil>&page_size=200&cursor=cursor
  upsert r.data (chaque item porte item.<profil>)
  si pas de curseur suivant dans r.meta: arrêter
  cursor = r.meta.<curseur suivant>
+ suppressions : GET /objects/deletions?since=…   (flux tombstone C-4)
```

---

## Comment c'est construit (et comment le faire évoluer)

### 1. Le crosswalk est une TABLE, jamais du code

`public.ref_interop_crosswalk(profile, object_type, target_class, context_url, is_active)` — **76 lignes** (4 profils × 19 types). C'est **l'unique** source du mapping type → classe/type/bordereau cible ; ni les RPCs ni l'UI ne portent de mapping en dur (invariant I4).

| Bertel | `jsonld` (schema.org) | `datatourisme` | `apidae` | `tourinsoft` |
|---|---|---|---|---|
| HOT | Hotel | Accommodation | HOTELLERIE | HOT |
| HLO / RVA | LodgingBusiness | Accommodation | HEBERGEMENT_LOCATIF | HLO |
| HPA / CAMP | Campground | Accommodation | HOTELLERIE_PLEIN_AIR | HPA |
| RES | Restaurant | FoodEstablishment | RESTAURATION | RES |
| ASC / ACT | TouristAttraction | SportsAndLeisurePlace | ACTIVITE | ASC |
| LOI | TouristAttraction | SportsAndLeisurePlace | EQUIPEMENT | ASC |
| PCU | TouristAttraction | CulturalSite | PATRIMOINE_CULTUREL | PCU |
| PNA | TouristAttraction | NaturalHeritage | PATRIMOINE_NATUREL | PNA |
| ITI | TouristTrip | Tour | ACTIVITE | ITI |
| FMA | Event | EntertainmentAndEvent | FETE_ET_MANIFESTATION | FMA |
| VIL | TouristDestination | PlaceOfInterest | TERRITOIRE | VIL |
| PRD | LocalBusiness | PlaceOfInterest | DEGUSTATION | DEG |
| COM | Store | Store | COMMERCE_ET_SERVICE | COM |
| PSV / SPU | LocalBusiness / CivicStructure | PlaceOfInterest | COMMERCE_ET_SERVICE | COM |
| ORG | Organization | PlaceOfInterest | STRUCTURE | ORG |

**Ajuster un mapping** (choix métier/SEO, PO-ajustable) = un simple `UPDATE` :

```sql
UPDATE public.ref_interop_crosswalk
SET target_class = 'BedAndBreakfast'
WHERE profile = 'jsonld' AND object_type = 'HLO';
```

**Désactiver un type pour un profil** = `is_active = false` (le document devient absent, jamais d'erreur).

### 2. Les fonctions (toutes `service_role`-only, gate `published` en profondeur)

| Fonction | Rôle | Manifest |
|---|---|---|
| `api.get_object_jsonld(id, profile='jsonld')` | Sérialiseur schema.org | I4 (`migration_object_jsonld_schemaorg.sql`) |
| `api.interop_object_core(id)` | Lecteur cœur PARTAGÉ (published + champs publics uniquement, description **texte propre** via `strip_markdown` §106) | I4b (`migration_interop_profiles.sql`) |
| `api.get_object_interop(id, profile)` | Dispatcher datatourisme / apidae / tourinsoft | I4b |
| `api.get_objects_interop_batch(ids[], profile)` | Batch `{id: document}` pour la liste — clamp 200, dedup, wrappe les 2 fonctions ci-dessus | I4c (`migration_interop_batch.sql`) |

Sécurité (vérifiée par les tests CI) : `REVOKE … FROM PUBLIC, anon, authenticated` + `GRANT … TO service_role` ; self-gate `status='published'` par objet (un mis-call ne peut pas exposer un brouillon) ; contacts/médias/réseaux **publics uniquement** ; URLs filtrées http/https (esprit SEC-7) ; id inconnu / non-publié / non-mappé ⇒ absent ou `NULL`, jamais de fallback.

### 3. Ajouter un 5e profil (recette)

1. **Seed** : 19 lignes `INSERT INTO ref_interop_crosswalk (profile, object_type, target_class, context_url)` (le `context_url` seulement si le format est du JSON-LD).
2. **Sérialisation** : une branche `ELSIF p_profile = '<nouveau>'` dans `api.get_object_interop` (le crosswalk n'automatise QUE type→classe ; la forme du document est propre à chaque standard).
3. **Surface** : la valeur dans `PIVOT_FORMATS`/`INTEROP_FORMATS` (routes liste + détail, `bertel-tourism-ui/src/app/api/public/objects/`), l'enum `Format` d'`openapi.json`, une requête Postman.
4. **Discipline** : migration (live + source + runbook + `ci_fresh_apply.sql`) + test `ROLLBACK_PROBE` + Jest.

Le batch liste (`get_objects_interop_batch`) fonctionne **sans modification** pour tout nouveau profil.

---

## Périmètre honnête (à lire avant une synchro de production)

Ces sorties sont un **socle interopérable** : structure de tête et vocabulaire de **type** corrects pour chaque standard, champs **cœur** (type/classe, nom, description texte-propre, adresse, géo, téléphone/mél/site publics, image de couverture, réseaux publics).

**Non couvert à ce stade** (chaque plateforme a des centaines de champs) :
- horaires d'ouverture, tarifs, capacités, équipements, classements ;
- **dates d'occurrence des événements** (FMA → Event sans dates : mince pour un flux événementiel) ;
- multi-langue dans les documents pivot (FR uniquement ; le multi-langue existe sur la ressource de base via `?lang=all`) ;
- tracés GPX/geometry des ITI dans les pivots.

**Avant tout branchement réel** : valider la conformité field-à-field contre l'importeur cible (validateur DATAtourisme, plateforme Apidae, SIT Tourinsoft régional — les conventions varient par région). Enrichir un profil = étendre sa branche de sérialisation, sans toucher aux autres.

---

## Vérifications (preuves)

| Niveau | Preuve |
|---|---|
| SQL live | 3 migrations appliquées (MCP `object_jsonld_schemaorg_i4`, `interop_profiles_i4b`, `interop_batch_i4c`) ; sortie validée sur fiches RES réelles dans les 4 formats ; advisors sécurité inchangés |
| Tests SQL (CI + live) | `tests/test_object_jsonld_schemaorg.sql`, `test_interop_profiles.sql`, `test_interop_batch.sql` — transactionnels `ROLLBACK_PROBE`, verts en live et dans le gate fresh-apply |
| Perf | 200 documents = **88 ms** (mesuré live avant de figer l'architecture batch) |
| Front | Jest 33/33 sur les routes publiques ; `tsc` propre sur les fichiers du chantier |
| Contrat | `docs/openapi.json` (param `Format`, 4 valeurs, propriétés par item) · collection Postman (dossier « 13. API Publique Partenaire », 9 requêtes) |

**Fichiers** : `Base de donnée DLL et API/migration_object_jsonld_schemaorg.sql` · `migration_interop_profiles.sql` · `migration_interop_batch.sql` (+ tests homonymes) · routes `bertel-tourism-ui/src/app/api/public/objects/` · allowlist `src/lib/public-api.ts` · runbook I4/I4b/I4c. Décisions : decision log §136/§137/§153.
