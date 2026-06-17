# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Vue d'ensemble

**MIA - Real vs AI** est un jeu éducatif web : le joueur doit deviner, entre deux médias (image, vidéo ou audio), lequel est réel et lequel est généré par IA. Le dev et la prod tournent via Docker Compose. Le projet est intégralement en français (textes UI, `help_text` des modèles, docstrings).

## Stack

- **Backend** : Django 5 + DRF + Django Channels (WebSockets) + Daphne ASGI + PostgreSQL + Redis (channel layer)
- **Frontend** : React 18 + TypeScript + Vite + TailwindCSS + Framer Motion + React Router
- **Reverse proxy** : Nginx (dev : proxy vers `frontend:5173` et `backend:8000` ; prod : Nginx de l'hôte qui sert `frontend/dist` buildé)

## Commandes de développement

Le développement passe par Docker Compose — ne pas faire `pip install` ou `npm run dev` sur l'hôte, toujours passer par les conteneurs.

```bash
# Démarrer la stack (db, redis, backend, frontend, nginx) — accès sur http://localhost:8080
docker compose up --build -d

# Peupler Category + MediaPair depuis les fichiers sur disque (requis après clone / ajout de médias)
docker exec realvsai_backend python manage.py populate_pairs
docker exec realvsai_backend python manage.py populate_pairs --dry-run   # aperçu uniquement
docker exec realvsai_backend python manage.py populate_pairs --force     # recréer les paires existantes

# Admin Django (créer un superuser pour /admin)
docker exec -it realvsai_backend python manage.py createsuperuser

# Migrations
docker exec realvsai_backend python manage.py makemigrations
docker exec realvsai_backend python manage.py migrate

# Logs / arrêt
docker compose logs -f [service]
docker compose down          # conserve le volume DB
docker compose down -v       # détruit le volume DB (relancer populate_pairs après)
```

Il n'y a pas de runner de tests, de linter ou de script de type-check configurés dans le repo (aucun fichier de test n'existe à ce jour). Pour des tests Django, lancer `python manage.py test` dans le conteneur backend ; pour un test unique, `python manage.py test apps.game.tests.MaClasse.ma_methode`. Pour un type-check, `tsc --noEmit` dans le conteneur frontend.

## Déploiement production

`docker-compose.prod.yml` ne lance que `db` + `redis` + `backend` (bindé sur `127.0.0.1:8001`). Le frontend est buildé en CI (`.github/workflows/deploy.yml`) puis SCP vers le VPS ; le Nginx de l'hôte (`deploy/nginx-realvsai.conf`) sert `frontend/dist` et proxifie `/api/`, `/ws/`, `/media/`, `/admin/` vers Daphne. Chaque push sur `main` déclenche le déploiement complet.

Le Nginx prod applique un `auth_basic 'equipe'` **global** (htpasswd), avec des exceptions explicites qui ouvrent les routes publiques au LAN : `/api/game/`, `/ws/`, `/media/`, `/multiplayer/`. C'est cet `auth_basic` qui protège l'API admin (cf. « API admin sans auth applicative » ci-dessous).

Scripts de déploiement (à lancer sur le VPS, hors CI) : `deploy/setup-vps.sh` provisionne la machine au premier déploiement (Docker, Nginx, `.env`, htpasswd, clone) ; `deploy/deploy.sh` rejoue un déploiement manuel (build frontend, rsync `dist`, `git pull`, `docker compose -f docker-compose.prod.yml up -d --build`, reload Nginx).

## Architecture

### Deux apps Django

- `apps.game` — API publique (`/api/game/`) : sessions solo, réponses, leaderboard, création de room multijoueur, détection d'IP locale (pour le QR code). Détient tous les modèles et le consumer WebSocket.
- `apps.admin_api` — API admin (`/api/admin/`) : ViewSets CRUD pour `Category` et `MediaPair`, stats dashboard, suppression de session. Les permissions DRF sont `AllowAny` par défaut — les routes admin ne sont pas authentifiées côté DRF, la protection est assurée au niveau du déploiement.

Routes racines : `config/urls.py` monte `/admin/` (admin Django), `/api/game/`, `/api/admin/`. Le routing ASGI (`config/asgi.py` + `apps.game.routing`) expose `ws/multiplayer/<room_code>/`.

### Modèle de médias

`MediaPair` est polymorphe sur `media_type` :
- `image` / `video` — `real_media` et `ai_media` renseignés ; une position aléatoire `left`/`right` est tirée par session et stockée dans `request.session[f'positions_{session_key}']` (solo) ou `MultiplayerRoom.ai_positions` (live).
- `audio` — un seul fichier `audio_media` + booléen `is_real`. Le joueur choisit "real" ou "ai" au lieu d'un côté.

À la sauvegarde d'une `Category`, un signal `post_save` crée les dossiers `media/pairs/{real,ai,audio}/{slug}/`. À la suppression d'un `MediaPair`, un signal `post_delete` supprime les fichiers du disque. Les uploads sont routés dans ces dossiers par `get_upload_path_{real,ai,audio}`.

### Convention populate_pairs

La commande `populate_pairs` est le mécanisme de seed de la DB depuis le filesystem (les médias sont versionnés en git ; les lignes DB ne le sont pas) :
- Fichier réel : `backend/media/pairs/real/{categorie}/{Nom}.{ext}`
- Contrepartie IA : `backend/media/pairs/ai/{categorie}/{Nom}_AI.{ext}` (suffixe `_AI` insensible à la casse ; l'extension peut différer)
- Le matching se fait par `(category_slug, base_name.lower())`. Les fichiers réels sans correspondance sont signalés en warning et ignorés.
- Le nom de catégorie vient du nom du dossier (capitalisé). La difficulté par défaut est `medium`.

### Scoring (mode solo)

Dans `AnswerSubmitView.post` (`backend/apps/game/views.py`) :
- base 100 si correct, sinon 0
- bonus de streak = `min(current_streak * 10, 50)`
- bonus de temps = `(5000 - response_time_ms) / 100` si répondu en moins de 5 s
- `GlobalStats.total_attempts/correct_answers` mis à jour atomiquement avec la réponse via des expressions `F()`.

### Mode multijoueur / live

Un seul consumer : `apps.game.consumers.MultiplayerConsumer` gère toutes les actions via un champ `action` dispatché dans une map de handlers. Clés : `host.join`, `player.join`, `game.start`, `game.next_question`, `game.skip`, `game.show_answer`, `player.answer`, `game.end`.

- `MultiplayerRoom.ai_positions` est un JSONField mappant `pair_id -> 'left'|'right'`, généré une seule fois au démarrage du jeu pour que l'hôte et les joueurs voient le même layout.
- `MultiplayerPlayer.session_token` (UUID) sert à la reconnexion ; `channel_name` + `is_connected` suivent le WebSocket actif.
- Bonus de score pour les premiers à répondre correctement : +50 / +30 / +10 (selon `answer_order`).
- Les réponses d'un joueur sont `unique_together=['player', 'media_pair']` — un seul vote par question par joueur.

Points d'entrée frontend du mode live : `pages/multiplayer/MultiplayerHostPage.tsx` (projecteur/enseignant), `MultiplayerJoinPage.tsx` (lobby via QR/code), `MultiplayerPlayerPage.tsx` (élève). Le hook `useMultiplayerSocket` encapsule la connexion/reconnexion WebSocket via le `session_token`.

### Client API frontend

`frontend/src/services/api.ts` — `getApiUrl()` résout vers `/api` (relatif) sauf si `VITE_API_URL` pointe vers une URL non-localhost. C'est volontaire : téléphones/tablettes sur le LAN tapent le même hôte Nginx, une URL absolue casserait. Ne jamais coder en dur `localhost:8000` ou `localhost:8080` dans les appels fetch/axios — toujours passer par l'instance `api` ou un chemin relatif.

### Routes dev via Nginx (port 8080)

| Chemin | Cible |
|---|---|
| `/` | frontend (Vite dev server, HMR en WS) |
| `/api/` | backend Django |
| `/admin/` | admin Django (proxy vers backend) |
| `/ws/` | Django Channels (Daphne) |
| `/media/` | servi directement par Nginx depuis `backend/media` (mount read-only) |

## À savoir

- `request.session` est utilisé en solo pour persister le mapping réel/IA gauche-droite, afin que le client n'ait jamais la réponse en clair. Tout refactor cassant la gestion des cookies de session cassera le scoring.
- **API admin sans auth applicative** : les endpoints `/api/admin/*` sont en `AllowAny` (DRF). La protection repose **uniquement** sur l'`auth_basic` Nginx (`deploy/nginx-realvsai.conf`) en prod. Limitation acceptée : en dev ou sur tout déploiement sans ce Nginx, l'API admin est ouverte au LAN. Si on ajoute une vraie auth applicative, les pages admin du frontend devront gérer un login (elles n'envoient aucun header d'auth aujourd'hui).
- `CORS_ALLOW_ALL_ORIGINS = True` quand `DEBUG=True` ; en prod, lecture de `CORS_ALLOWED_ORIGINS` et `CSRF_TRUSTED_ORIGINS` depuis l'env.

## Sécurité multijoueur (à respecter lors de modifs)

- **`host_token`** (UUID sur `MultiplayerRoom`) : renvoyé **uniquement** par `POST /api/game/multiplayer/rooms/`, **jamais** par le `GET`. Requis dans le payload `host.join` du WebSocket pour obtenir `is_host=True`. Sans ça, n'importe quel élève peut prendre le contrôle de la partie.
- **`session_token`** (UUID sur `MultiplayerPlayer`) : renvoyé uniquement au premier `player.join` d'un pseudo donné. Toute reconnexion ou join ultérieur sur un pseudo déjà pris doit fournir ce token, sinon c'est refusé (sinon : un attaquant taperait le pseudo d'un autre joueur et hériterait de sa session).
- **Uploads `/api/admin/media-pairs/`** : les extensions sont whitelistées dans `MediaPairCreateSerializer.validate()` selon `media_type`. Ne pas désactiver cette validation — combiné avec Nginx servant `/media/` en statique, un `.html` ou `.svg` accepté devient du stored XSS sous l'origine de l'application. Les headers `X-Content-Type-Options: nosniff` et la CSP sur `/media/` sont la défense en profondeur.
- Les `Real_VS_AI.desktop` / `Stop_Real_VS_AI.desktop` + `scripts/start-kiosk.*` servent à lancer l'app en plein écran sur une machine kiosque — inutile en dev.
- Les notes de planification d'anciens travaux sont dans `.cursor/plans/` (historique, pas des instructions).
