# Exploitation serveur démonstrateur.tech

## Domaine et DNS

Domaine principal lisible : démonstrateur.tech
Domaine technique Punycode : xn--dmonstrateur-beb.tech
IP serveur : 187.124.219.253

Enregistrements DNS attendus :

- A @ -> 187.124.219.253
- CNAME www -> xn--dmonstrateur-beb.tech
- A realvsai -> 187.124.219.253
- A * -> 187.124.219.253

## Organisation multi-applications

Convention actuelle :

- une application = un dossier /opt/<app>
- une application = un sous-domaine <app>.démonstrateur.tech
- une application = un port local réservé 127.0.0.1:<port>
- une application = un vhost Nginx dans /etc/nginx/sites-available/<app>
- une application = un dossier backup /opt/backups/<app>
- une application = un script backup /usr/local/sbin/backup-<app>.sh

Ports réservés :

- realvsai : 127.0.0.1:8001
- prochaine app : 127.0.0.1:8002
- app suivante : 127.0.0.1:8003

## Applications en place

### Portail principal

URL : https://démonstrateur.tech
Technique : https://xn--dmonstrateur-beb.tech
Dossier web : /var/www/demonstrateur
Nginx : /etc/nginx/sites-available/demonstrateur-portal
Certificat : /etc/letsencrypt/live/xn--dmonstrateur-beb.tech/

www.démonstrateur.tech redirige vers démonstrateur.tech.

### Real vs AI

URL : https://realvsai.démonstrateur.tech
Technique : https://realvsai.xn--dmonstrateur-beb.tech
Dossier : /opt/realvsai
Compose : /opt/realvsai/docker-compose.prod.yml
Nginx : /etc/nginx/sites-available/realvsai
Backend local : 127.0.0.1:8001
Certificat : /etc/letsencrypt/live/realvsai.xn--dmonstrateur-beb.tech/

Commandes utiles :

    cd /opt/realvsai
    docker compose -f docker-compose.prod.yml ps
    docker compose -f docker-compose.prod.yml logs --tail=100 backend
    docker compose -f docker-compose.prod.yml up -d --build backend

## Nginx

Sites activés :

- /etc/nginx/sites-enabled/000-catchall
- /etc/nginx/sites-enabled/demonstrateur-portal
- /etc/nginx/sites-enabled/realvsai

Tester et recharger :

    nginx -t
    systemctl reload nginx

Le catch-all évite qu'un sous-domaine inconnu tombe sur une application existante.

Limite : pour HTTPS sur des sous-domaines inconnus, le navigateur peut afficher une alerte certificat tant qu'un certificat wildcard DNS-01 n'est pas installé. Le serveur répond quand même avec une erreur propre après TLS.

## Certificats HTTPS

Lister :

    certbot certificates

Tester renouvellement :

    certbot renew --dry-run --no-random-sleep-on-renew

Timer :

    systemctl status certbot.timer

## Backups

Real vs AI :

- script : /usr/local/sbin/backup-realvsai.sh
- planification : /etc/cron.d/backup-realvsai
- backups : /opt/backups/realvsai/<timestamp>
- log : /var/log/backup-realvsai.log
- restauration : /opt/backups/realvsai/RESTORE.md

Lancer un backup manuel :

    /usr/local/sbin/backup-realvsai.sh

## Monitoring

Watchdog Hermes :

- script : /root/.hermes/scripts/realvsai-health-watchdog.sh
- fréquence : toutes les 15 minutes
- comportement : aucune sortie si tout va bien, alerte seulement si problème

Il surveille notamment : services, conteneurs, disque, HTTPS public, certificat, /health, backups.

## Sécurité

- SSH par clé uniquement
- root SSH désactivé
- UFW actif
- fail2ban actif
- secrets .env en root-only

Vérifications :

    ufw status verbose
    fail2ban-client status sshd
    sshd -T | egrep 'permitrootlogin|passwordauthentication|pubkeyauthentication'

## Logs

Logs Nginx : /var/log/nginx/
Logs backup : /var/log/backup-realvsai.log
Logs Docker : via docker logs, limités par configuration Docker daemon.

Commandes :

    journalctl -u nginx -n 100 --no-pager
    docker logs --tail 100 realvsai_backend
    tail -100 /var/log/backup-realvsai.log
