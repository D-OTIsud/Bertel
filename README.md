# Bertel

Espace de développement pour le projet Bertel - API de gestion touristique avec système de données unifié.

## 📁 Structure du projet

```
Bertel/
├── docs/                           # Documentation API
│   ├── index.html                 # Documentation principale
│   ├── media/                     # Vidéos explicatives
│   ├── Dockerfile                 # Configuration déploiement
│   ├── *.json                     # Collections Postman
│   └── README.md                  # Guide documentation
├── Base de donnée DLL et API/     # Schéma de base de données unifié
│   ├── schema_unified.sql         # Schéma complet avec système unifié
│   ├── api_views_functions.sql    # Vues et fonctions API (RPC)
│   ├── seeds_data.sql             # Données de test
│   ├── rls_policies.sql           # Politiques de sécurité
│   ├── README.md                  # Documentation technique complète
│   └── erd_diagram.md             # Diagramme ER en Mermaid
├── frontend/                      # Interface utilisateur (à venir)
└── README.md                     # Ce fichier
```

## 🗄️ Base de données unifiée

Le projet Bertel utilise un système de données unifié PostgreSQL avec des fonctionnalités avancées :

### ✨ Fonctionnalités principales

- **📍 Système de localisation unifié** : Table `object_location` fusionnant adresses et coordonnées géographiques
- **⏰ Système d'ouverture riche** : Gestion flexible des horaires avec périodes, plannings et créneaux
- **🛡️ Workflow de modération** : Système d'approbation des modifications avec `pending_change`
- **🔧 Référentiel unifié** : Table `ref_code` partitionnée par domaine pour tous les codes de référence
- **🏨 Gestion complète** : Hôtels, restaurants, activités, itinéraires, événements, etc.

### 📊 Documentation technique

- **Schéma complet** : [`Base de donnée DLL et API/schema_unified.sql`](./Base%20de%20donnée%20DLL%20et%20API/schema_unified.sql)
- **Documentation détaillée** : [`Base de donnée DLL et API/README.md`](./Base%20de%20donnée%20DLL%20et%20API/README.md)
- **Diagramme ER** : [`Base de donnée DLL et API/erd_diagram.md`](./Base%20de%20donnée%20DLL%20et%20API/erd_diagram.md)

## 🚀 Documentation API

La documentation complète de l'API Bertel v3.0 est disponible dans le dossier [`docs/`](./docs/).

### 📖 Accès rapide

- **Documentation web** : [docs/index.html](./docs/index.html)
- **Collection Postman** : [docs/Bertel_API_v3.postman_collection.json](./docs/Bertel_API_v3.postman_collection.json)
- **Guide Postman** : [docs/README_Postman.md](./docs/README_Postman.md)
- **Vidéos explicatives** : [docs/media/](./docs/media/)

### 🌐 Déploiement

La documentation peut être déployée via Coolify en utilisant les fichiers dans le dossier `docs/` :

```bash
cd docs/
docker build -t bertel-api-docs .
docker run -p 8080:80 bertel-api-docs
```

## 🔗 Liens utiles

- [Documentation API complète](./docs/)
- [Collection Postman publique](https://www.postman.com/docking-module-astronaut-45890211/oti-du-sud-bertel-v3/collection/61gyd5k/bertel-api-v3-0)

## 🚀 Démarrage rapide

### Installation de la base de données

```bash
# 1. Exécuter le schéma principal
psql -d votre_database -f "Base de donnée DLL et API/schema_unified.sql"

# 2. Exécuter les vues et fonctions API
psql -d votre_database -f "Base de donnée DLL et API/api_views_functions.sql"

# 3. Exécuter les politiques RLS
psql -d votre_database -f "Base de donnée DLL et API/rls_policies.sql"

# 4. Peupler avec les données de test
psql -d votre_database -f "Base de donnée DLL et API/seeds_data.sql"
```

### Test de l'API

```sql
-- Vérifier que l'API fonctionne
SELECT api.get_object_resource('HOTRUN0000000001', ARRAY['fr'], 'none', '{}'::jsonb);

-- Tester le système de modération
SELECT api.submit_pending_change(
  p_object_id    => 'HOTRUN0000000001',
  p_target_table => 'object',
  p_target_pk    => 'HOTRUN0000000001',
  p_action       => 'update',
  p_payload      => '{"name":"Nouveau nom test"}'::jsonb
);
```

## 📝 Développement

Ce repository contient :
- **🗄️ Base de données** : Schéma PostgreSQL unifié avec fonctionnalités avancées
- **🔌 API RPC** : Fonctions PostgreSQL dans le schéma `api` avec authentification et workflow de modération
- **📚 Documentation** : Interface moderne avec navigation synchronisée
- **🧪 Collection Postman** : Tests et exemples d'utilisation des fonctions RPC
- **📹 Vidéos** : Explications techniques du système unifié

## 🏢 Organisation

Projet développé par **OTI du Sud** - Office de Tourisme Intercommunal du Sud.
