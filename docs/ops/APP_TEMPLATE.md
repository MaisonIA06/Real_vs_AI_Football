# Modèle d'ajout d'une nouvelle application

Objectif : déployer une nouvelle application sur un sous-domaine dédié de démonstrateur.tech.

Exemple : app2.démonstrateur.tech

## 1. Choisir le nom et le port

Variables :

    APP=app2
    DOMAIN=app2.xn--dmonstrateur-beb.tech
    HUMAN_DOMAIN=app2.démonstrateur.tech
    PORT=8002
    APP_DIR=/opt/app2

Règle : ne jamais exposer l'application directement sur 0.0.0.0. Le backend doit écouter côté hôte sur 127.0.0.1:<PORT>.

## 2. Créer l'arborescence

    mkdir -p /opt/$APP
    chmod 750 /opt/$APP

Prévoir au minimum :

    /opt/$APP/docker-compose.prod.yml
    /opt/$APP/.env
    /opt/$APP/README.md

## 3. Docker Compose

Exemple de ports :

    ports:
      - "127.0.0.1:8002:8000"

Bonnes pratiques :

- restart: unless-stopped
- healthcheck si possible
- volumes explicites pour les données persistantes
- .env en chmod 600 root:root
- logs Docker limités par la configuration globale

## 4. Nginx

Créer :

    /etc/nginx/sites-available/$APP
    /etc/nginx/sites-enabled/$APP -> /etc/nginx/sites-available/$APP

Exemple minimal :

    server {
        listen 80;
        listen [::]:80;
        server_name app2.xn--dmonstrateur-beb.tech;

        location / {
            proxy_pass http://127.0.0.1:8002;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }

Tester :

    nginx -t
    systemctl reload nginx

## 5. HTTPS

Installer le certificat :

    certbot --nginx -d app2.xn--dmonstrateur-beb.tech --agree-tos --register-unsafely-without-email --no-eff-email --redirect --non-interactive

Tester :

    curl -I https://app2.xn--dmonstrateur-beb.tech/
    certbot renew --dry-run --no-random-sleep-on-renew

## 6. Backup

Créer :

    /usr/local/sbin/backup-$APP.sh
    /opt/backups/$APP/
    /etc/cron.d/backup-$APP
    /var/log/backup-$APP.log

Inclure au minimum :

- dump base de données si applicable
- médias/uploads
- .env
- docker-compose.prod.yml
- vhost Nginx
- manifeste avec checksums
- procédure RESTORE.md

Ne planifier le cron qu'après un premier backup manuel réussi et vérifié.

## 7. Monitoring

Ajouter au watchdog ou créer un watchdog dédié :

- conteneurs running/healthy
- endpoint public HTTPS
- certificat TLS
- backup récent
- services critiques

## 8. Documentation

Mettre à jour :

    /opt/docs/OPS.md

Ajouter :

- URL
- port
- dossier
- commandes de déploiement
- emplacement des backups
- procédure de restauration

## 9. Validation finale

Checklist :

    docker compose -f /opt/$APP/docker-compose.prod.yml ps
    nginx -t
    curl -I https://$DOMAIN/
    certbot certificates
    /usr/local/sbin/backup-$APP.sh
    tail -50 /var/log/backup-$APP.log
