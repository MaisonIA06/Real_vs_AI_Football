# Migrer le CI/CD vers un nouveau serveur — Guide pas à pas

> But de ce document : t'apprendre **comment fonctionne le déploiement** de ce projet,
> puis te faire migrer vers un nouveau serveur en comprenant chaque étape, pour que
> tu sois capable de le refaire seul la prochaine fois.
>
> Scénario couvert : nouveau VPS accédé **par IP** (sans domaine/HTTPS), sous
> **Ubuntu/Debian**, en gardant **la même architecture** (Docker Compose + Nginx de l'hôte).

Dans tout ce guide, remplace ces deux valeurs par les tiennes :

- `NOUVELLE_IP` → l'adresse IP publique du nouveau serveur (ex. `51.x.x.x`)
- `NOUVEL_USER` → l'utilisateur SSH du serveur (souvent `root`, parfois `ubuntu`/`debian`)

---

## 0. Le modèle mental : comment marche ce déploiement ?

Avant de toucher quoi que ce soit, il faut visualiser le pipeline. Il y a **3 acteurs** :

```
   TOI (git push main)
        │
        ▼
  ┌──────────────────────┐         SSH (clé privée)        ┌────────────────────────┐
  │   GitHub Actions     │ ──────────────────────────────▶ │      LE SERVEUR (VPS)  │
  │  (runner jetable)    │                                  │                        │
  │                      │   1. git pull (le VPS récupère   │  - Docker (db, redis,  │
  │  - build le frontend │      le code depuis GitHub)      │    backend Daphne)     │
  │    (npm run build)   │   2. scp du frontend buildé      │  - Nginx de l'hôte     │
  │  - se connecte en    │   3. docker compose up --build   │    (sert dist + proxy) │
  │    SSH au VPS        │   4. reload nginx                │                        │
  └──────────────────────┘                                  └────────────────────────┘
```

Points clés à retenir :

1. **Le runner GitHub est jetable** : il build le frontend puis se connecte au serveur en SSH.
   Il ne "contient" rien de permanent. Tout ce qui est permanent vit sur le serveur.

2. **Le lien GitHub → serveur, c'est une clé SSH.** GitHub détient la clé *privée*
   (stockée dans un *secret*), le serveur détient la clé *publique* (dans
   `~/.ssh/authorized_keys`). Migrer de serveur = refaire ce lien vers la nouvelle machine.

3. **L'identité du serveur est stockée à deux endroits différents :**
   - **Côté GitHub** (invisible dans le code) : les *secrets* `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`.
   - **Côté code** (dans le repo) : quelques fichiers ont l'ancienne IP écrite en dur.

   👉 Migrer = changer **ces deux endroits**. C'est l'erreur classique de n'en changer qu'un.

4. **Le serveur est "bête" : il faut le préparer une fois** (installer Docker, Nginx,
   cloner le repo, créer le `.env`). C'est le rôle de `deploy/setup-vps.sh`. Une fois
   préparé, les déploiements suivants sont automatiques à chaque `git push`.

---

## Vue d'ensemble des fichiers qui mentionnent l'ancien serveur

| Où | Quoi | Type de changement |
|---|---|---|
| GitHub → Settings → Secrets | `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` | Interface GitHub |
| `deploy/nginx-realvsai.conf` | `server_name 204.168.174.92;` | Édition de code |
| `.env.example` (et le `.env` du serveur) | `DJANGO_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS` | Édition de code + serveur |
| `deploy/deploy.sh` | `VPS="root@204.168.174.92"` | Édition de code |
| `deploy/setup-vps.sh` | URL de clone + IP affichée | Édition de code |
| `.github/workflows/deploy.yml` | commentaire seulement (utilise les secrets) | Rien à coder |

L'ancienne IP est `204.168.174.92`. Pour la retrouver toi-même la prochaine fois :

```bash
grep -rn "204.168.174.92" .          # cherche l'IP dans tout le repo
```

---

## 1. Préparer l'accès SSH au nouveau serveur

D'abord, vérifie que tu peux te connecter à la main :

```bash
ssh NOUVEL_USER@NOUVELLE_IP
```

Si ça marche, tu es prêt. Sinon, règle l'accès SSH avec ton hébergeur avant d'aller plus loin
(c'est un prérequis, pas une étape du déploiement).

---

## 2. Créer la clé SSH de déploiement (le lien GitHub → serveur)

GitHub Actions a besoin d'une clé SSH **dédiée** (ne réutilise pas ta clé perso).
On génère une paire de clés sur **ta machine locale** :

```bash
ssh-keygen -t ed25519 -C "github-actions-realvsai" -f ~/.ssh/realvsai_deploy
```

- `-f ~/.ssh/realvsai_deploy` : nom du fichier. Ça crée deux fichiers :
  - `realvsai_deploy` → la clé **privée** (ira dans le secret GitHub)
  - `realvsai_deploy.pub` → la clé **publique** (ira sur le serveur)
- Quand il demande une passphrase, **laisse vide** (un robot ne peut pas taper de mot de passe).

Installe la clé publique sur le nouveau serveur :

```bash
ssh-copy-id -i ~/.ssh/realvsai_deploy.pub NOUVEL_USER@NOUVELLE_IP
```

Vérifie que la connexion par clé fonctionne (elle ne doit **pas** demander de mot de passe) :

```bash
ssh -i ~/.ssh/realvsai_deploy NOUVEL_USER@NOUVELLE_IP "echo OK"
```

---

## 3. Mettre à jour les secrets GitHub

Va sur GitHub : **le repo → Settings → Secrets and variables → Actions**.

Mets à jour (ou crée) ces 3 secrets :

| Secret | Valeur |
|---|---|
| `VPS_HOST` | `NOUVELLE_IP` |
| `VPS_USER` | `NOUVEL_USER` |
| `VPS_SSH_KEY` | **tout le contenu** de la clé privée `~/.ssh/realvsai_deploy` |

Pour copier le contenu exact de la clé privée :

```bash
cat ~/.ssh/realvsai_deploy
```

⚠️ Copie **tout**, de la ligne `-----BEGIN OPENSSH PRIVATE KEY-----` jusqu'à
`-----END OPENSSH PRIVATE KEY-----` incluses.

> Comprendre : c'est exactement la même clé qu'à l'étape 2. La publique est sur le serveur,
> la privée est confiée à GitHub. Quand le workflow tourne, GitHub présente la privée,
> le serveur la reconnaît grâce à la publique, et la connexion s'ouvre sans mot de passe.

---

## 4. Mettre à jour les fichiers du repo (l'IP en dur)

Ces changements se font dans le code, en local, puis seront commités.

### 4a. `deploy/nginx-realvsai.conf`

```nginx
server_name 204.168.174.92;        ⟶   server_name NOUVELLE_IP;
```

### 4b. `.env.example`

```ini
DJANGO_ALLOWED_HOSTS=204.168.174.92        ⟶   DJANGO_ALLOWED_HOSTS=NOUVELLE_IP
CORS_ALLOWED_ORIGINS=http://204.168.174.92 ⟶   CORS_ALLOWED_ORIGINS=http://NOUVELLE_IP
CSRF_TRUSTED_ORIGINS=http://204.168.174.92 ⟶   CSRF_TRUSTED_ORIGINS=http://NOUVELLE_IP
```

> Ces 3 variables sont des **garde-fous de sécurité Django** :
> - `DJANGO_ALLOWED_HOSTS` : Django refuse toute requête dont l'en-tête `Host` n'est pas listé.
>   Si tu oublies, tu auras une erreur `400 Bad Request` (`Invalid HTTP_HOST header`).
> - `CORS` / `CSRF` : autorisent le frontend (servi depuis cette IP) à parler à l'API.

### 4c. `deploy/deploy.sh` (script de déploiement manuel, optionnel mais à garder cohérent)

```bash
VPS="root@204.168.174.92"        ⟶   VPS="NOUVEL_USER@NOUVELLE_IP"
```

### 4d. `deploy/setup-vps.sh` (l'URL de clone du repo)

⚠️ Ce fichier clone actuellement une **mauvaise URL** (un ancien repo). Comme l'`origin`
du projet est désormais `https://github.com/MaisonIA06/Real_vs_AI_Football.git`, corrige :

```bash
git clone https://github.com/MIA-Music-Integrity-Analysis/Real_VS_AI.git /opt/realvsai
        ⟶
git clone https://github.com/MaisonIA06/Real_vs_AI_Football.git /opt/realvsai
```

> Astuce : pour trouver la bonne URL automatiquement, sur ta machine : `git remote -v`.

Commite et pousse ces changements :

```bash
git add deploy/ .env.example
git commit -m "chore(deploy): migrer la config vers le nouveau serveur"
git push origin main
```

> Note : ce push va **déclencher le workflow**, mais il échouera tant que le serveur n'est
> pas préparé (étape 5). C'est normal. Tu peux aussi préparer le serveur d'abord (étape 5)
> puis pousser — l'ordre n'a pas d'importance, sauf que le tout premier déploiement
> automatique ne réussira qu'une fois le serveur prêt.

---

## 5. Préparer le nouveau serveur (à faire UNE seule fois)

Le script `deploy/setup-vps.sh` installe Docker + Nginx, clone le repo, génère le `.env`
avec des secrets aléatoires, et crée le mot de passe d'accès `auth_basic`.

Depuis ta machine locale, envoie et exécute le script sur le serveur :

```bash
ssh NOUVEL_USER@NOUVELLE_IP 'bash -s' < deploy/setup-vps.sh
```

> Ce que fait le script, étape par étape (lis-le, il est court et commenté) :
> 1. `apt update && upgrade`
> 2. installe Docker
> 3. installe Nginx + `apache2-utils` (pour `htpasswd`)
> 4. clone le repo dans `/opt/realvsai`
> 5. crée le `.env` (clé secrète Django + mot de passe Postgres auto-générés)
> 6. crée le mot de passe `auth_basic` (utilisateur `equipe`) et active la conf Nginx

⚠️ **Note bien le mot de passe PostgreSQL affiché** à la fin (il n'est montré qu'une fois).

Ensuite, sur le serveur, vérifie/complète le `.env` puis lance l'app. Connecte-toi :

```bash
ssh NOUVEL_USER@NOUVELLE_IP
```

Puis sur le serveur :

```bash
# 1. Vérifier que l'IP dans .env est la bonne
nano /opt/realvsai/.env          # DJANGO_ALLOWED_HOSTS / CORS / CSRF = NOUVELLE_IP

# 2. Builder le frontend une première fois (les déploiements suivants le feront via CI)
apt install -y nodejs npm
cd /opt/realvsai/frontend && npm install && npm run build

# 3. Lancer les conteneurs
cd /opt/realvsai
docker compose -f docker-compose.prod.yml up -d --build

# 4. Charger les médias en base (obligatoire au premier démarrage)
docker exec realvsai_backend python manage.py populate_pairs

# 5. Créer un compte admin Django (pour /admin)
docker exec -it realvsai_backend python manage.py createsuperuser
```

Teste dans un navigateur : `http://NOUVELLE_IP/`
(Un mot de passe `auth_basic` sera demandé — utilisateur `equipe`, le mot de passe que
`setup-vps.sh` t'a fait saisir.)

---

## 6. Tester le pipeline automatique

Maintenant que le serveur tourne, vérifie que le déploiement **automatique** fonctionne.

Deux façons de déclencher le workflow :

- **Manuellement** : GitHub → onglet **Actions** → "Deploy to VPS" → **Run workflow**
  (c'est ce que permet le `workflow_dispatch` dans le YAML).
- **Par un push** : n'importe quel commit sur `main`.

Puis regarde l'exécution en direct dans l'onglet **Actions**. Si une étape échoue, le log
te dira laquelle :
- Échec sur **"Pull latest code"** ou **"Rebuild backend"** → problème SSH (secrets `VPS_*`
  faux, ou clé publique pas sur le serveur). Reteste l'étape 2/3.
- Échec sur **"Build frontend"** → problème dans le code frontend, pas dans la migration.

---

## 7. Bascule finale et nettoyage

Une fois le nouveau serveur validé :

1. **Si tu as un DNS/domaine** : fais pointer l'enregistrement A vers `NOUVELLE_IP`.
   (Hors scope ici puisqu'on est en IP seule.)
2. **Données** : ce projet seed sa base depuis les fichiers du repo via `populate_pairs`.
   Les médias sont versionnés en git, donc rien à migrer manuellement. En revanche, les
   **scores/sessions/leaderboard** vivent dans le volume PostgreSQL de l'ancien serveur et
   ne sont PAS transférés. Si tu veux les garder, fais un dump :
   ```bash
   # sur l'ANCIEN serveur
   docker exec realvsai_db pg_dump -U realvsai_user realvsai > dump.sql
   # transfère dump.sql, puis sur le NOUVEAU serveur :
   cat dump.sql | docker exec -i realvsai_db psql -U realvsai_user realvsai
   ```
3. **Éteins l'ancien serveur** seulement après plusieurs jours de validation.

---

## Mémo : refaire cette migration seul (version courte)

1. `ssh-keygen` → clé de déploiement dédiée ; clé publique sur le serveur.
2. GitHub Secrets : `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`.
3. `grep -rn "<ancienne_ip>" .` → remplacer l'IP dans `nginx-realvsai.conf`, `.env.example`,
   `deploy.sh`, et l'URL de clone dans `setup-vps.sh`. Commit + push.
4. `ssh USER@IP 'bash -s' < deploy/setup-vps.sh` → préparer le serveur (1 fois).
5. Sur le serveur : `.env`, build frontend, `docker compose -f docker-compose.prod.yml up -d --build`,
   `populate_pairs`, `createsuperuser`.
6. Déclencher le workflow (Actions → Run workflow) et vérifier les logs.
7. Migrer les données si besoin (`pg_dump`), basculer le DNS, éteindre l'ancien serveur.

**La règle d'or :** l'identité du serveur vit à **deux endroits** — les *secrets GitHub*
ET *quelques fichiers du repo*. Change toujours les deux.
