# Handoff pour Claude — Real vs AI / serveur démonstrateur.tech / CI-CD

Ce document donne tout le contexte nécessaire pour corriger proprement le CI/CD GitHub après les changements DevOps faits directement sur le VPS.

## Objectif demandé

Corriger le workflow GitHub Actions pour qu'il puisse redéployer Real vs AI sur le VPS durci, sans casser la configuration Nginx/HTTPS/domaines actuellement en production.

## Dépôt

Remote : https://github.com/MaisonIA06/Real_vs_AI_Football.git
Branche de synchronisation créée par Hermes : `ops/hermes-server-sync-20260618`
Branche cible probable : `main`

## Serveur

IP publique : `187.124.219.253`
OS : Ubuntu 24.04
Projet : `/opt/realvsai`
Domaine principal lisible : `démonstrateur.tech`
Domaine principal Punycode : `xn--dmonstrateur-beb.tech`
Application Real vs AI : `https://realvsai.démonstrateur.tech`
Application Real vs AI Punycode : `https://realvsai.xn--dmonstrateur-beb.tech`
Backend local : `127.0.0.1:8001`

## Sécurité SSH actuelle

Configuration effective vérifiée :

```text
port 22
permitrootlogin no
passwordauthentication no
pubkeyauthentication yes
maxauthtries 3
```

Utilisateur admin : `devops`

```text
uid=1000(devops)
groupes : devops, sudo, users
sudo : NOPASSWD: ALL est présent
```

Important : le workflow GitHub actuel mentionne historiquement `VPS_USER=root`. Cela ne peut plus fonctionner car `PermitRootLogin no`.

## Pare-feu

UFW actif :

```text
22/tcp  ALLOW
80/tcp  ALLOW
443/tcp ALLOW
Default incoming deny
```

Donc SSH/HTTP/HTTPS sont accessibles. UFW ne devrait pas bloquer GitHub Actions.

## Changements applicatifs faits sur le serveur et inclus dans cette branche

### 1. Endpoint `/health/`

Fichiers :

- `backend/apps/game/health.py`
- `backend/config/urls.py`
- `backend/apps/game/tests.py`

Endpoint public attendu :

```text
GET https://realvsai.démonstrateur.tech/health/
```

Réponse vérifiée :

```json
{"status": "ok", "database": "ok", "cache": "ok"}
```

Test TDD vérifié :

```bash
docker compose -f docker-compose.prod.yml run --rm -v /opt/realvsai/backend:/app backend python manage.py test apps.game.tests.HealthEndpointTests -v 2
```

Résultat : OK.

Test global Django vérifié :

```bash
docker compose -f docker-compose.prod.yml run --rm -v /opt/realvsai/backend:/app backend python manage.py test -v 1
```

Résultat : OK.

### 2. Docker logging

Fichier : `docker-compose.prod.yml`

Ajout d'un bloc `x-logging` et application aux services :

- `realvsai_backend`
- `realvsai_db`
- `realvsai_redis`

Configuration :

```yaml
logging:
  driver: json-file
  options:
    max-size: "10m"
    max-file: "5"
```

Configuration effective vérifiée avec `docker inspect` :

```text
/realvsai_backend log=json-file max-size=10m max-file=5
/realvsai_db log=json-file max-size=10m max-file=5
/realvsai_redis log=json-file max-size=10m max-file=5
```

### 3. Nginx de production synchronisé dans `deploy/`

Fichiers copiés depuis le VPS :

- `deploy/nginx-realvsai.conf`
- `deploy/nginx-demonstrateur-portal.conf`
- `deploy/nginx-catchall.conf`

Attention : `deploy/nginx-realvsai.conf` contient désormais la config production avec HTTPS/Certbot et `/health/`. Il remplace l'ancienne config IP-only qui cassait le domaine si le CI la recopiait.

### 4. Scripts et configs ops synchronisés dans `deploy/ops/`

Fichiers :

- `deploy/ops/backup-realvsai.sh`
- `deploy/ops/realvsai-health-watchdog.sh`
- `deploy/ops/cron-backup-realvsai`
- `deploy/ops/logrotate-backup-realvsai`
- `deploy/ops/docker-daemon.json`

Ils servent surtout de référence et de source de vérité versionnée. Ne pas installer aveuglément sans vérifier les chemins.

### 5. Documentation ajoutée

- `docs/ops/OPS.md`
- `docs/ops/APP_TEMPLATE.md`
- `docs/ops/CLAUDE_CICD_HANDOFF.md` ce fichier

## État serveur actuel important

Fichier `.env` :

```text
/opt/realvsai/.env : root:root chmod 600
```

Ne pas afficher son contenu dans les logs CI.

Nginx actifs :

- `000-catchall`
- `demonstrateur-portal`
- `realvsai`

Certificats :

- `/etc/letsencrypt/live/xn--dmonstrateur-beb.tech/`
- `/etc/letsencrypt/live/realvsai.xn--dmonstrateur-beb.tech/`

Certbot : `certbot.timer` actif.

## Problèmes CI/CD identifiés

### Problème A — utilisateur root désactivé

Le workflow actuel utilise probablement ces secrets :

```text
VPS_HOST
VPS_USER
VPS_SSH_KEY
```

Historiquement les commentaires indiquaient :

```text
VPS_USER=root
```

À corriger :

```text
VPS_HOST=187.124.219.253
VPS_USER=devops
VPS_SSH_KEY=<clé privée correspondant à /home/devops/.ssh/authorized_keys>
```

### Problème B — `devops` n'a pas d'écriture directe sur `/opt/realvsai`

Le dépôt sur serveur appartient actuellement majoritairement à root. Le workflow actuel fait :

```bash
cd /opt/realvsai
git pull origin main
```

Si connecté en `devops`, cela risque d'échouer sauf si :

- soit `/opt/realvsai` est rendu gérable par `devops`,
- soit les commandes de déploiement passent par `sudo`.

Recommandation simple côté workflow : utiliser des commandes `sudo` explicites pour les opérations serveur.

Exemple :

```bash
sudo -H bash -lc 'cd /opt/realvsai && git pull origin main'
sudo -H bash -lc 'cd /opt/realvsai && docker compose -f docker-compose.prod.yml up -d --build'
sudo nginx -t
sudo systemctl reload nginx
```

### Problème C — upload frontend par SCP vers `/opt/realvsai` avec `devops`

Le workflow actuel fait :

```yaml
source: "frontend/dist/"
target: "/opt/realvsai/"
```

Avec `devops`, l'écriture directe dans `/opt/realvsai` peut échouer.

Options recommandées :

Option 1 — upload vers `/tmp` puis copie sudo :

```yaml
target: "/tmp/realvsai-deploy/"
```

Puis :

```bash
sudo rm -rf /opt/realvsai/frontend/dist
sudo mkdir -p /opt/realvsai/frontend/dist
sudo cp -a /tmp/realvsai-deploy/frontend/dist/. /opt/realvsai/frontend/dist/
sudo chown -R root:root /opt/realvsai/frontend/dist
```

Option 2 — donner à `devops` la propriété de zones spécifiques du projet. Moins recommandé sans audit fin.

### Problème D — ne pas casser Nginx/Certbot

L'ancien workflow faisait :

```bash
cp deploy/nginx-realvsai.conf /etc/nginx/sites-available/realvsai
nginx -t && systemctl reload nginx
```

Avant, ce fichier était IP-only et aurait cassé le HTTPS. Dans cette branche il a été remplacé par la config actuelle. Mais Claude doit décider si le workflow doit :

- soit ne plus copier Nginx à chaque deploy,
- soit copier avec `sudo` uniquement si le fichier versionné est validé,
- soit séparer config applicative et config Certbot.

Recommandation prudente : ne pas écraser Nginx à chaque déploiement applicatif, sauf changement volontaire de config. Le workflow peut faire seulement :

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Ou alors copier explicitement la config actuelle versionnée et vérifier :

```bash
sudo cp deploy/nginx-realvsai.conf /etc/nginx/sites-available/realvsai
sudo nginx -t
sudo systemctl reload nginx
```

### Problème E — modifications locales non commitées

Avant cette branche, le serveur avait des modifications locales qui bloquaient potentiellement `git pull` :

- `backend/config/urls.py`
- `docker-compose.prod.yml`
- `backend/apps/game/health.py`
- `backend/apps/game/tests.py`
- `frontend/package-lock.json`

Cette branche les versionne afin de réduire ce risque après merge.

## Workflow recommandé à faire corriger par Claude

1. Mettre le workflow à jour pour `devops` + `sudo`.
2. Changer les secrets GitHub :
   - `VPS_HOST=187.124.219.253`
   - `VPS_USER=devops`
   - `VPS_SSH_KEY` = clé privée autorisée pour devops
3. Remplacer l'upload direct dans `/opt/realvsai` par upload `/tmp` + `sudo cp`.
4. Éviter d'écraser Nginx à chaque déploiement, ou utiliser la config versionnée actuelle et `sudo`.
5. Ajouter une vérification post-déploiement :

```bash
curl -fsS https://realvsai.xn--dmonstrateur-beb.tech/health/
curl -fsS https://realvsai.xn--dmonstrateur-beb.tech/multiplayer/ >/dev/null
```

6. Tester via `workflow_dispatch` avant merge définitif.

## Commandes de validation serveur

À utiliser après correction CI/CD :

```bash
cd /opt/realvsai
sudo docker compose -f docker-compose.prod.yml ps
sudo nginx -t
curl -fsS https://realvsai.xn--dmonstrateur-beb.tech/health/
curl -fsS https://xn--dmonstrateur-beb.tech/ >/dev/null
certbot renew --dry-run --no-random-sleep-on-renew
```

## État final actuellement vérifié

```text
https://xn--dmonstrateur-beb.tech/               -> 200
https://realvsai.xn--dmonstrateur-beb.tech/health/ -> 200
https://realvsai.xn--dmonstrateur-beb.tech/multiplayer/ -> 200
unknown HTTP subdomain -> 404 propre
nginx -t -> success
certbot renew dry-run -> success
Docker containers -> running/healthy
```

## Attention sécurité

- Ne pas remettre `PermitRootLogin yes`.
- Ne pas réactiver `PasswordAuthentication yes`.
- Ne pas afficher `/opt/realvsai/.env` dans les logs.
- Ne pas utiliser `rm:true` dans `appleboy/scp-action` avec `target=/opt/realvsai/`.
- Éviter de bannir GitHub Actions via fail2ban en répétant des connexions avec une mauvaise clé.
