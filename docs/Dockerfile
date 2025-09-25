FROM nginx:alpine

# Copier la documentation
COPY index.html /usr/share/nginx/html/

# Configuration Nginx pour SPA
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Exposer le port 80
EXPOSE 80

# Démarrer Nginx
CMD ["nginx", "-g", "daemon off;"]
