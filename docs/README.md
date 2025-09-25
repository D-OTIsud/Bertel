# Documentation API Bertel v3.0

Documentation complète de l'API Bertel v3.0 avec interface moderne et collection Postman.

> **Note** : Cette documentation fait partie du projet [Bertel](../README.md).

## 🚀 Déploiement

### Avec Coolify

1. **Naviguer vers le dossier docs** : `cd docs/`
2. **Configurer dans Coolify** :
   - Type : Dockerfile
   - Port : 80
   - Domaine : Votre domaine personnalisé
   - **Dockerfile Path** : `./docs/Dockerfile`

3. **Déploiement automatique** à chaque push

### Avec Docker local

```bash
# Depuis la racine du projet
cd docs/
docker build -t bertel-api-docs .
docker run -p 8080:80 bertel-api-docs
```

## 📁 Structure

- `index.html` - Documentation principale
- `Bertel_API_v3.postman_collection.json` - Collection Postman
- `Bertel_API_v3.postman_environment.json` - Environnement Postman
- `README_Postman.md` - Guide d'utilisation Postman

## ✨ Fonctionnalités

- **Interface moderne** avec thème #76B097
- **Navigation latérale** synchronisée
- **Mode sombre/clair** avec persistance
- **Recherche globale** dans la documentation
- **Collection Postman** intégrée
- **Bouton flottant** pour toggle des sections
- **Responsive design** pour tous les écrans

## 🔗 Liens utiles

- [Collection Postman publique](https://www.postman.com/docking-module-astronaut-45890211/oti-du-sud-bertel-v3/collection/61gyd5k/bertel-api-v3-0)
- Documentation déployée : [Votre domaine]

## 📝 Maintenance

- Mise à jour de la documentation : Modifier `index.html`
- Redéploiement automatique via Coolify
- Collection Postman : Mettre à jour les fichiers JSON
