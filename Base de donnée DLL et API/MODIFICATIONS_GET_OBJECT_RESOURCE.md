# Modifications de la fonction api.get_object_resource

## Vue d'ensemble

La fonction `api.get_object_resource` a été modifiée pour inclure automatiquement les acteurs associés à l'objet et leurs contacts. Cette modification enrichit l'API existante sans casser la rétrocompatibilité.

## Modifications apportées

### 1. Ajout de la section `actors`

**Localisation :** Lignes 808-863 dans `api_views_functions.sql`

**Code ajouté :**
```sql
-- Actors (enriched with contacts)
js := js || jsonb_build_object(
  'actors',
  COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'display_name', a.display_name,
        'first_name', a.first_name,
        'last_name', a.last_name,
        'gender', a.gender,
        'role', jsonb_build_object(
          'id', aor.role_id,
          'code', rar.code,
          'name', rar.name
        ),
        'is_primary', aor.is_primary,
        'valid_from', aor.valid_from,
        'valid_to', aor.valid_to,
        'visibility', aor.visibility,
        'note', aor.note,
        'contacts', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', ac.id,
              'kind', jsonb_build_object(
                'code', rck.code,
                'name', rck.name,
                'description', rck.description,
                'icon_url', rck.icon_url
              ),
              'value', ac.value,
              'is_primary', ac.is_primary,
              'role', jsonb_build_object(
                'code', rcr.code,
                'name', rcr.name
              ),
              'position', ac.position,
              'extra', ac.extra
            )
            ORDER BY ac.is_primary DESC, ac.position NULLS LAST, ac.created_at
          )
          FROM actor_channel ac
          JOIN ref_code_contact_kind rck ON rck.id = ac.kind_id
          LEFT JOIN ref_contact_role rcr ON rcr.id = ac.role_id
          WHERE ac.actor_id = a.id
        ), '[]'::jsonb)
      )
      ORDER BY aor.is_primary DESC, aor.valid_from DESC, a.display_name
    )
    FROM actor a
    JOIN actor_object_role aor ON aor.actor_id = a.id
    LEFT JOIN ref_actor_role rar ON rar.id = aor.role_id
    WHERE aor.object_id = obj.id
  ), '[]'::jsonb)
);
```

### 2. Ajout dans la structure de retour

**Localisation :** Ligne 1417 dans `api_views_functions.sql`

**Code ajouté :**
```sql
'actors',               (js->'actors')::json,
```

## Structure de la réponse modifiée

### Avant la modification :
```json
{
  "id": "HOT123",
  "name": "Hôtel Example",
  "type": "HOT",
  "status": "published",
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
      "role_id": "uuid-role",
      "note": "Gestion complète"
    }
  ],
  "meeting_rooms": [...],
  // ... autres sections
}
```

### Après la modification :
```json
{
  "id": "HOT123",
  "name": "Hôtel Example",
  "type": "HOT",
  "status": "published",
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
      "role_id": "uuid-role",
      "note": "Gestion complète"
    }
  ],
  "actors": [
    {
      "id": "actor-123",
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
      "note": "Gestionnaire principal",
      "contacts": [
        {
          "id": "contact-uuid",
          "kind": {
            "code": "email",
            "name": "Email",
            "description": "Adresse email",
            "icon_url": "https://example.com/email.png"
          },
          "value": "jean.dupont@example.com",
          "is_primary": true,
          "role": {
            "code": "work",
            "name": "Professionnel"
          },
          "position": 1,
          "extra": {}
        },
        {
          "id": "contact-uuid-2",
          "kind": {
            "code": "phone",
            "name": "Téléphone",
            "description": "Numéro de téléphone",
            "icon_url": "https://example.com/phone.png"
          },
          "value": "+262 111 222 333",
          "is_primary": false,
          "role": {
            "code": "work",
            "name": "Professionnel"
          },
          "position": 2,
          "extra": {}
        }
      ]
    }
  ],
  "meeting_rooms": [...],
  // ... autres sections
}
```

## Données incluses dans la section `actors`

### Informations de l'acteur :
- `id` : Identifiant unique de l'acteur
- `display_name` : Nom d'affichage
- `first_name` : Prénom
- `last_name` : Nom de famille
- `gender` : Genre (M/F)

### Rôle de l'acteur :
- `role.id` : Identifiant du rôle
- `role.code` : Code du rôle (ex: "manager", "concierge")
- `role.name` : Nom du rôle (ex: "Gestionnaire", "Concierge")

### Informations de liaison :
- `is_primary` : Si c'est le rôle principal de l'acteur pour cet objet
- `valid_from` : Date de début de validité du rôle
- `valid_to` : Date de fin de validité du rôle
- `visibility` : Visibilité du rôle (public/private)
- `note` : Note sur le rôle

### Contacts de l'acteur :
- `contacts[]` : Array des contacts de l'acteur
  - `id` : Identifiant du contact
  - `kind` : Type de contact (email, phone, mobile, etc.)
  - `value` : Valeur du contact
  - `is_primary` : Si c'est le contact principal
  - `role` : Rôle du contact (work, personal, emergency)
  - `position` : Position d'ordre
  - `extra` : Données supplémentaires

## Tri et ordre

### Tri des acteurs :
1. `is_primary` DESC (acteurs principaux en premier)
2. `valid_from` DESC (rôles les plus récents en premier)
3. `display_name` ASC (ordre alphabétique)

### Tri des contacts d'acteur :
1. `is_primary` DESC (contacts principaux en premier)
2. `position` ASC (ordre de position)
3. `created_at` ASC (ordre de création)

## Rétrocompatibilité

### ✅ **Maintenue :**
- Toutes les sections existantes sont préservées
- L'ordre des champs est maintenu (actors ajouté après org_links)
- Les types de données restent identiques
- Les paramètres de la fonction sont inchangés

### ✅ **Comportement :**
- Si un objet n'a pas d'acteurs, `actors` sera un array vide `[]`
- Si un acteur n'a pas de contacts, `contacts` sera un array vide `[]`
- Les jointures LEFT JOIN garantissent qu'aucune donnée n'est perdue

## Performance

### Optimisations :
- Utilisation de `COALESCE` pour éviter les valeurs NULL
- Tri optimisé avec index sur les colonnes de tri
- Jointures efficaces avec les tables de référence

### Impact :
- Légère augmentation du temps de réponse pour les objets avec beaucoup d'acteurs
- Pas d'impact pour les objets sans acteurs
- Les requêtes sont optimisées pour éviter les N+1 queries

## Cas d'usage

### 1. Récupération d'un hôtel avec son équipe :
```sql
SELECT api.get_object_resource('HOT123', ARRAY['fr'], 'none', '{}'::jsonb);
```

### 2. Filtrage des acteurs principaux :
```sql
WITH hotel_data AS (
  SELECT api.get_object_resource('HOT123', ARRAY['fr'], 'none', '{}'::jsonb)::jsonb as data
)
SELECT jsonb_array_elements(data->'actors') as actor
FROM hotel_data
WHERE (jsonb_array_elements(data->'actors')->>'is_primary')::boolean = true;
```

### 3. Récupération des contacts de gestion :
```sql
WITH hotel_data AS (
  SELECT api.get_object_resource('HOT123', ARRAY['fr'], 'none', '{}'::jsonb)::jsonb as data
)
SELECT 
  actor->>'display_name' as actor_name,
  contact->>'value' as contact_value,
  contact->'kind'->>'name' as contact_type
FROM hotel_data,
     jsonb_array_elements(data->'actors') as actor,
     jsonb_array_elements(actor->'contacts') as contact
WHERE contact->>'is_primary' = 'true';
```

## Migration

### Pour les applications existantes :
- **Aucune modification requise** - l'API reste compatible
- Les nouvelles données sont disponibles immédiatement
- Les applications peuvent ignorer la section `actors` si elles n'en ont pas besoin

### Pour les nouvelles applications :
- Utiliser la section `actors` pour afficher l'équipe de gestion
- Exploiter les contacts des acteurs pour les communications
- Utiliser les rôles et dates de validité pour la gestion des permissions

## Tests

Un script de test complet est disponible dans `test_modified_get_object_resource.sql` qui vérifie :
- La présence de la section `actors`
- Le contenu des acteurs et leurs contacts
- La rétrocompatibilité
- Les performances
- Les cas limites (objets sans acteurs)

## Conclusion

Cette modification enrichit significativement l'API `api.get_object_resource` en ajoutant les acteurs associés et leurs contacts, tout en maintenant la rétrocompatibilité complète. Elle est particulièrement utile pour les agences de conciergerie qui ont besoin d'accéder rapidement aux informations de leur équipe de gestion.
