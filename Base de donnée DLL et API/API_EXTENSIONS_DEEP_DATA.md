# API Extensions - Deep Data Inclusion

## Vue d'ensemble

L'API a été étendue pour inclure automatiquement les données en profondeur des objets parents, des acteurs associés et de leurs contacts. Ces extensions permettent d'obtenir toutes les informations liées à un objet en un seul appel API.

## Nouvelles fonctions API

### 1. `api.get_object_with_deep_data(p_object_id TEXT)`

Récupère un objet avec toutes ses données en profondeur.

**Paramètres :**
- `p_object_id` : ID de l'objet à récupérer

**Retour :**
```json
{
  "object": {
    // Données complètes de l'objet (comme api.get_object_resource)
    "id": "HOT123",
    "name": "Hôtel Example",
    "type": "HOT",
    "contacts": [...],
    "media": [...],
    // ... toutes les autres données de l'objet
  },
  "parent_objects": [
    {
      "id": "ORG456",
      "type": "ORG",
      "name": "Organisation Parent",
      "status": "published",
      "relation_type": {
        "id": "uuid-relation-type",
        "name": "Gestionnaire"
      },
      "distance_m": 100,
      "note": "Relation de gestion",
      "basic_info": {
        "id": "ORG456",
        "type": "ORG",
        "name": "Organisation Parent",
        "status": "published"
      }
    }
  ],
  "actors": [
    {
      "id": "actor-uuid",
      "display_name": "Jean Dupont",
      "first_name": "Jean",
      "last_name": "Dupont",
      "gender": "M",
      "role": {
        "id": "role-uuid",
        "code": "manager",
        "name": "Gestionnaire"
      },
      "is_primary": true,
      "valid_from": "2024-01-01",
      "valid_to": "2024-12-31",
      "visibility": "public",
      "note": "Responsable principal",
      "contacts": [
        {
          "id": "contact-uuid",
          "kind": {
            "code": "email",
            "name": "Email",
            "description": "Adresse email",
            "icon_url": "https://..."
          },
          "value": "jean.dupont@example.com",
          "is_primary": true,
          "role": {
            "code": "work",
            "name": "Professionnel"
          },
          "position": 1,
          "extra": {}
        }
      ]
    }
  ],
  "organizations": [
    {
      "id": "ORG789",
      "type": "ORG",
      "name": "Agence de Conciergerie",
      "status": "published",
      "role": {
        "id": "org-role-uuid",
        "code": "concierge",
        "name": "Conciergerie"
      },
      "note": "Gestion complète",
      "contacts": [
        {
          "id": "org-contact-uuid",
          "kind": {
            "code": "phone",
            "name": "Téléphone",
            "description": "Numéro de téléphone",
            "icon_url": "https://..."
          },
          "value": "+262 123 456 789",
          "is_public": true,
          "is_primary": true,
          "role": {
            "code": "main",
            "name": "Principal"
          },
          "position": 1
        }
      ]
    }
  ]
}
```

### 2. `api.get_objects_with_deep_data(p_object_ids TEXT[], p_languages TEXT[], p_include_media TEXT, p_filters JSONB)`

Récupère plusieurs objets avec leurs données en profondeur.

**Paramètres :**
- `p_object_ids` : Array des IDs d'objets
- `p_languages` : Array des codes de langue (défaut: ['fr'])
- `p_include_media` : Inclusion des médias ('none', 'basic', 'full')
- `p_filters` : Filtres JSONB (défaut: {})

**Exemple d'utilisation :**
```sql
SELECT api.get_objects_with_deep_data(
  ARRAY['HOT123', 'HOT456', 'HOT789'],
  ARRAY['fr', 'en'],
  'basic',
  '{}'::jsonb
);
```

### 3. `api.get_objects_by_type_with_deep_data(p_object_type TEXT, p_languages TEXT[], p_include_media TEXT, p_filters JSONB, p_limit INTEGER, p_offset INTEGER)`

Récupère tous les objets d'un type donné avec leurs données en profondeur.

**Paramètres :**
- `p_object_type` : Type d'objet ('HOT', 'ORG', 'RES', etc.)
- `p_languages` : Array des codes de langue (défaut: ['fr'])
- `p_include_media` : Inclusion des médias (défaut: 'none')
- `p_filters` : Filtres JSONB (défaut: {})
- `p_limit` : Nombre maximum d'objets (défaut: 100)
- `p_offset` : Décalage pour la pagination (défaut: 0)

**Exemple d'utilisation :**
```sql
-- Récupérer tous les hôtels avec leurs données en profondeur
SELECT api.get_objects_by_type_with_deep_data('HOT', ARRAY['fr'], 'basic', '{}'::jsonb, 50, 0);

-- Récupérer les organisations avec leurs acteurs et contacts
SELECT api.get_objects_by_type_with_deep_data('ORG', ARRAY['fr', 'en'], 'full', '{}'::jsonb, 20, 0);
```

### 4. `api.search_objects_with_deep_data(p_search_term TEXT, p_object_types TEXT[], p_languages TEXT[], p_include_media TEXT, p_filters JSONB, p_limit INTEGER, p_offset INTEGER)`

Recherche des objets avec leurs données en profondeur.

**Paramètres :**
- `p_search_term` : Terme de recherche
- `p_object_types` : Types d'objets à inclure (NULL = tous)
- `p_languages` : Array des codes de langue (défaut: ['fr'])
- `p_include_media` : Inclusion des médias (défaut: 'none')
- `p_filters` : Filtres JSONB (défaut: {})
- `p_limit` : Nombre maximum d'objets (défaut: 50)
- `p_offset` : Décalage pour la pagination (défaut: 0)

**Exemple d'utilisation :**
```sql
-- Rechercher des hôtels par nom ou ville
SELECT api.search_objects_with_deep_data(
  'Tampon',
  ARRAY['HOT', 'HLO'],
  ARRAY['fr'],
  'basic',
  '{}'::jsonb,
  20,
  0
);

-- Rechercher toutes les organisations de conciergerie
SELECT api.search_objects_with_deep_data(
  'conciergerie',
  ARRAY['ORG'],
  ARRAY['fr'],
  'full',
  '{}'::jsonb,
  10,
  0
);
```

## Fonctions helper

### `api.get_parent_object_data(p_object_id TEXT)`

Récupère les données des objets parents via les relations.

### `api.get_actor_data(p_object_id TEXT)`

Récupère les acteurs associés à un objet avec leurs contacts.

### `api.get_organization_data(p_object_id TEXT)`

Récupère les organisations liées à un objet avec leurs contacts.

## Cas d'usage pour les agences de conciergerie

### 1. Récupérer un hôtel géré par une agence

```sql
-- Récupérer un hôtel avec toutes les informations de l'agence de conciergerie
SELECT api.get_object_with_deep_data('HOT123');
```

Cela retournera :
- Les données complètes de l'hôtel
- L'organisation de conciergerie dans `organizations`
- Les acteurs de l'agence (gestionnaires, concierges) dans `actors`
- Les contacts de l'agence et des acteurs

### 2. Lister tous les hôtels gérés par des agences

```sql
-- Récupérer tous les hôtels avec leurs agences de gestion
SELECT api.get_objects_by_type_with_deep_data('HOT', ARRAY['fr'], 'basic', '{}'::jsonb, 100, 0);
```

### 3. Rechercher des agences de conciergerie

```sql
-- Rechercher des agences de conciergerie
SELECT api.search_objects_with_deep_data(
  'conciergerie',
  ARRAY['ORG'],
  ARRAY['fr'],
  'full',
  '{}'::jsonb,
  50,
  0
);
```

### 4. Récupérer les contrats d'exploitation

Pour récupérer les informations de contrats d'exploitation, vous pouvez utiliser les relations et les acteurs :

```sql
-- Récupérer un objet avec ses relations de gestion
SELECT api.get_object_with_deep_data('HOT123');
```

Dans la réponse, vous trouverez :
- `organizations` : L'agence de conciergerie
- `actors` : Les gestionnaires avec leurs rôles et dates de validité (`valid_from`, `valid_to`)
- `parent_objects` : Les relations hiérarchiques

## Performance et optimisations

### Index recommandés

Pour optimiser les performances des nouvelles fonctions, assurez-vous que ces index existent :

```sql
-- Index pour les relations d'objets
CREATE INDEX IF NOT EXISTS idx_object_relation_source ON object_relation(source_object_id);
CREATE INDEX IF NOT EXISTS idx_object_relation_target ON object_relation(target_object_id);

-- Index pour les rôles d'acteurs
CREATE INDEX IF NOT EXISTS idx_actor_object_role_object ON actor_object_role(object_id);
CREATE INDEX IF NOT EXISTS idx_actor_object_role_actor ON actor_object_role(actor_id);

-- Index pour les liens d'organisations
CREATE INDEX IF NOT EXISTS idx_object_org_link_object ON object_org_link(object_id);
CREATE INDEX IF NOT EXISTS idx_object_org_link_org ON object_org_link(org_object_id);

-- Index pour les contacts d'acteurs
CREATE INDEX IF NOT EXISTS idx_actor_channel_actor ON actor_channel(actor_id);
```

### Limitation des résultats

Les fonctions incluent des paramètres `limit` et `offset` pour la pagination. Pour de grandes quantités de données, utilisez la pagination :

```sql
-- Première page
SELECT api.get_objects_by_type_with_deep_data('HOT', ARRAY['fr'], 'basic', '{}'::jsonb, 50, 0);

-- Deuxième page
SELECT api.get_objects_by_type_with_deep_data('HOT', ARRAY['fr'], 'basic', '{}'::jsonb, 50, 50);
```

## Migration depuis l'API existante

### Avant (API standard)
```sql
-- Récupérer un objet
SELECT api.get_object_resource('HOT123', ARRAY['fr'], 'none', '{}'::jsonb);

-- Récupérer les acteurs séparément
SELECT * FROM actor_object_role WHERE object_id = 'HOT123';

-- Récupérer les organisations séparément
SELECT * FROM object_org_link WHERE object_id = 'HOT123';
```

### Après (API étendue)
```sql
-- Récupérer tout en un seul appel
SELECT api.get_object_with_deep_data('HOT123');
```

## Exemples de réponses complètes

### Hôtel avec agence de conciergerie

```json
{
  "object": {
    "id": "HOT123",
    "name": "Hôtel de Luxe",
    "type": "HOT",
    "status": "published",
    "address": {
      "address1": "123 Rue de la Plage",
      "city": "Saint-Pierre",
      "postcode": "97410"
    },
    "contacts": [
      {
        "kind_code": "phone",
        "value": "+262 123 456 789",
        "is_primary": true
      }
    ],
    "org_links": [
      {
        "org_object_id": "ORG456",
        "role_id": "role-uuid",
        "note": "Gestion complète"
      }
    ]
  },
  "parent_objects": [],
  "actors": [
    {
      "id": "actor-123",
      "display_name": "Marie Martin",
      "first_name": "Marie",
      "last_name": "Martin",
      "role": {
        "code": "concierge",
        "name": "Concierge"
      },
      "is_primary": true,
      "valid_from": "2024-01-01",
      "valid_to": "2024-12-31",
      "contacts": [
        {
          "kind": {
            "code": "email",
            "name": "Email"
          },
          "value": "marie.martin@conciergerie.com",
          "is_primary": true
        }
      ]
    }
  ],
  "organizations": [
    {
      "id": "ORG456",
      "type": "ORG",
      "name": "Agence de Conciergerie Premium",
      "status": "published",
      "role": {
        "code": "concierge_agency",
        "name": "Agence de Conciergerie"
      },
      "contacts": [
        {
          "kind": {
            "code": "phone",
            "name": "Téléphone"
          },
          "value": "+262 987 654 321",
          "is_primary": true
        },
        {
          "kind": {
            "code": "email",
            "name": "Email"
          },
          "value": "contact@conciergerie-premium.com",
          "is_primary": false
        }
      ]
    }
  ]
}
```

Cette extension de l'API permet maintenant de récupérer toutes les informations liées à un objet en un seul appel, ce qui est particulièrement utile pour les agences de conciergerie qui gèrent plusieurs objets d'hébergement.
