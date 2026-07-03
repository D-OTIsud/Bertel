FROM nginx:alpine

# Site public de documentation — liste EXPLICITE des fichiers servis.
# NE PAS revenir à `COPY *.md` / `COPY *.html` : docs/ contient des documents internes
# (audits sécurité/DB, plans, specs, conformité RGPD…) qui ne doivent pas être publiés.
# Ajouter un fichier au site = l'ajouter ici volontairement.

# Pages HTML (toutes liées depuis index.html)
COPY index.html partenaires.html openapi.html api-db-reference.html /usr/share/nginx/html/

# Espace partenaires : la page rend guide-partenaires.md côté client (source unique)
COPY partenaires-render.js guide-partenaires.md /usr/share/nginx/html/

# Documents publics de l'espace équipe
COPY README_Postman.md SQL_ROLLOUT_RUNBOOK.md SUPABASE_SETUP.md /usr/share/nginx/html/
COPY api-audit/2026-07-03-i4-interop-profiles.md /usr/share/nginx/html/api-audit/

# Contrat OpenAPI + artefacts Postman
COPY openapi.json Bertel_API_v3.postman_collection.json Bertel_API_v3.postman_environment.json /usr/share/nginx/html/

# Configuration Nginx pour SPA
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Exposer le port 80
EXPOSE 80

# Démarrer Nginx
CMD ["nginx", "-g", "daemon off;"]
