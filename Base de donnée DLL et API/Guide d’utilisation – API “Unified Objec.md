Guide d’utilisation – API “Unified Object Resource”
1) Aperçu

Endpoints RPC (PostgREST / Supabase) :

list_object_resources_page : pagination par pages (offset).

list_object_resources_since_fast : pagination incrémentale “depuis une date” (keyset).

Sortie commune : { "info": { … }, "data": [ … ] }.

Langue par défaut : ["fr"]. Taille par défaut : 50 (max 200).

Itinéraires (ITI) : trace KML par défaut, GPX via p_track_format.

Icônes : renvoyées pour contacts, médias, capacités, aménagements (et famille).

2) Auth & en-têtes (Postman)

Variables d’environnement Postman :

SUPABASE_URL : ex. https://xxx.supabase.co

SUPABASE_ANON_KEY : clé anon/service

En-têtes à ajouter à chaque requête :

apikey: {{SUPABASE_ANON_KEY}}

Authorization: Bearer {{SUPABASE_ANON_KEY}}

Content-Type: application/json

Appel RPC : POST {{SUPABASE_URL}}/rest/v1/rpc/<nom_fonction>

3) Modèle de ressource (extrait)

Chaque entrée de data[] suit ce schéma (champs présents si disponibles) :

{
  "id": "HOTAQU000V5014ZU",
  "type": "HOT",
  "status": "published",
  "name": "Hôtel des Palmiers",
  "region_code": "REU",
  "updated_at": "2025-09-17T06:21:53.123Z",
  "updated_at_source": "2025-09-17T06:20:00.000Z",
  "published_at": "2025-01-02T10:00:00.000Z",

  "address": { "address1": "15 Rue …", "postcode": "97400", "city": "Saint-Denis", "code_insee": "97411" },

  "location": { "latitude": -20.88, "longitude": 55.45, "altitude_m": 120 },

  "contacts": [
    { "kind_code": "phone", "kind_name": "Téléphone", "icon_url": "https://…/phone.svg", "value": "+262 …", "is_primary": true },
    { "kind_code": "email", "kind_name": "Email", "icon_url": "https://…/email.svg", "value": "contact@…" }
  ],

  "media": [
    { "id": "uuid", "type_code": "photo", "type_name": "Photo", "icon_url": "https://…/photo.svg", "url": "https://…/img.jpg", "is_main": true }
  ],

  "capacity": [
    { "metric_code": "total_rooms", "metric_name": "Chambres", "icon_url": "https://…/rooms.svg", "value": 42, "unit": "rooms" }
  ],

  "amenities": [
    {
      "code": "wifi", "name": "Wi-Fi", "icon_url": "https://…/wifi.svg",
      "family": { "code": "connectivity", "name": "Connectivité", "icon_url": "https://…/connectivity.svg" }
    }
  ],

  "itinerary": {
    "distance_km": 12.5, "duration_hours": 4, "difficulty_level": 3, "elevation_gain": 450, "is_loop": false,
    "track_format": "kml",
    "track": "<?xml version=\"1.0\" encoding=\"UTF-8\"?><kml>…</kml>"
  }
}

4) Paramètres communs

p_lang_prefs (["fr"]) : préférences de langue (première utilisée pour l’affichage).

p_types (null) : ex. ["HOT","ITI"].

p_status (["published"]).

p_search (null) : texte libre (insensible à la casse/accents).

p_track_format ("kml") : "kml" ou "gpx" pour ITI.

5) Curseur

Les endpoints paginés utilisent le même format de curseur : base64url d’un JSON interne.
Vous n’avez pas besoin de le décoder : réinjectez simplement info.next_cursor dans p_cursor à l’appel suivant.

Exemple de contenu (illustratif) :

{
  "kind": "since",
  "since": "2025-09-17T05:00:33Z",
  "last_ts": "2025-09-17T06:12:00Z",
  "last_id": "HOTAQU000V5014ZU",
  "limit": 50,
  "types": ["ITI","HOT"],
  "status": ["published"],
  "track_format": "gpx",
  "lang": ["fr"]
}

6) Endpoint : list_object_resources_page

URL
POST {{SUPABASE_URL}}/rest/v1/rpc/list_object_resources_page

Body (JSON) – tous optionnels :

{
  "p_cursor": null,
  "p_lang_prefs": ["fr"],
  "p_page_size": 50,
  "p_types": null,
  "p_status": ["published"],
  "p_search": null,
  "p_track_format": "kml"
}


Réponse (extrait)

{
  "info": {
    "kind": "page",
    "language": "fr",
    "language_fallbacks": ["fr"],
    "page_size": 50,
    "offset": 0,
    "total": 1234,
    "cursor": "…",
    "next_cursor": "…"
  },
  "data": [ { … }, { … } ]
}


Page suivante :

{ "p_cursor": "{{info.next_cursor}}" }

7) Endpoint : list_object_resources_since_fast

URL
POST {{SUPABASE_URL}}/rest/v1/rpc/list_object_resources_since_fast

Body (JSON)

p_since (requis) : ISO 8601 (ex. "2025-09-17T05:00:33Z").

Autres paramètres identiques aux communs + p_use_source (false) et p_limit (50).

Exemple :

{
  "p_since": "2025-09-17T05:00:33Z",
  "p_cursor": null,
  "p_use_source": false,
  "p_lang_prefs": ["fr"],
  "p_limit": 50,
  "p_types": ["ITI","HOT"],
  "p_status": ["published"],
  "p_search": null,
  "p_track_format": "gpx"
}


Réponse (extrait)

{
  "info": {
    "kind": "since",
    "language": "fr",
    "language_fallbacks": ["fr"],
    "since": "2025-09-17T05:00:33Z",
    "use_source": false,
    "limit": 50,
    "cursor": "…",
    "next_cursor": "…"
  },
  "data": [ { … }, { … } ]
}


Page suivante (incrémentale) :

{
  "p_since": "2025-09-17T05:00:33Z",
  "p_cursor": "{{info.next_cursor}}"
}

8) Exemples rapides (Postman)
A. Page 1 (FR) – Objets publiés
POST /rest/v1/rpc/list_object_resources_page
Headers: apikey, Authorization, Content-Type
Body:
{
  "p_lang_prefs": ["fr"],
  "p_page_size": 50,
  "p_status": ["published"],
  "p_track_format": "kml"
}

B. Depuis une date – ITI + HOT – GPX
POST /rest/v1/rpc/list_object_resources_since_fast
Body:
{
  "p_since": "2025-09-17T05:00:33Z",
  "p_types": ["ITI","HOT"],
  "p_status": ["published"],
  "p_limit": 50,
  "p_track_format": "gpx"
}

C. Page suivante (dans les deux cas)
Body:
{ "p_cursor": "{{info.next_cursor}}" }

9) Dépannage

401/403 : vérifiez la clé et le Bearer token.

422 : types invalides (date, enums, tableaux).

Enums : p_types doit contenir des valeurs valides (RES, PCU, PNA, ORG, ITI, VIL, HPA, ASC, COM, HOT, HLO, LOI, FMA, CAMP), p_status (draft, published, archived, hidden).

Curseur invalide : relancez sans p_cursor pour repartir proprement.

Performance : limitez p_page_size/p_limit, filtrez p_types, utilisez p_search.