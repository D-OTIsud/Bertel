# Bertel

Espace de développement pour le projet Bertel - API de gestion touristique.

## 📁 Structure du projet

```
Bertel/
├── docs/                    # Documentation API
│   ├── index.html          # Documentation principale
│   ├── Dockerfile          # Configuration déploiement
│   ├── *.json              # Collections Postman
│   └── README.md           # Guide documentation
├── api/                    # Code source de l'API (à venir)
├── frontend/               # Interface utilisateur (à venir)
└── README.md              # Ce fichier
```

## 🚀 Documentation API

La documentation complète de l'API Bertel v3.0 est disponible dans le dossier [`docs/`](./docs/).

### 📖 Accès rapide

- **Documentation web** : [docs/index.html](./docs/index.html)
- **Collection Postman** : [docs/Bertel_API_v3.postman_collection.json](./docs/Bertel_API_v3.postman_environment.json)
- **Guide Postman** : [docs/README_Postman.md](./docs/README_Postman.md)

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

## 📝 Développement

Ce repository contient :
- **Documentation** : Interface moderne avec navigation synchronisée
- **API** : Endpoints REST avec authentification
- **Collection Postman** : Tests et exemples d'utilisation

## 🏢 Organisation

Projet développé par **OTI du Sud** - Office de Tourisme Intercommunal du Sud.
