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

**Tests** : `backend/apps/game/tests.py` contient `HealthEndpointTests` (endpoint `/health/`) et `GameEndAuthorizationTests` (autorisation du consumer WebSocket). Lancer : `docker compose run --rm backend python manage.py test apps.game.tests` (ou `…tests.MaClasse.ma_methode` pour un test unique). ⚠️ La CI **ne lance pas** encore les tests. ⚠️ Piège : `TransactionTestCase` casse au `flush` à cause d'une table orpheline `game_quizpair` (FK vers `game_mediapair`) — pour tester le consumer, suivre le pattern **DB-less** de `GameEndAuthorizationTests` (`SimpleTestCase` + mock des accès DB). Pas de linter configuré ; pour un type-check : `tsc --noEmit` dans le conteneur frontend.

## Déploiement production

La prod tourne sur un **VPS durci** (Hostinger, `187.124.219.253`), servie en **HTTPS** sous `https://realvsai.démonstrateur.tech` (domaine + Let's Encrypt/Certbot ; punycode `realvsai.xn--dmonstrateur-beb.tech`). `docker-compose.prod.yml` ne lance que `db` + `redis` + `backend` (bindé sur `127.0.0.1:8001`) ; le Nginx **de l'hôte** sert `frontend/dist` et proxifie `/api/`, `/ws/`, `/media/`, `/admin/`, `/health/` vers Daphne. Le Nginx prod applique un `auth_basic` global (htpasswd `equipe`) avec exceptions publiques (`/api/game/`, `/ws/`, `/media/`, `/multiplayer/`, `/health/`).

**Serveur durci** : SSH root DÉSACTIVÉ, password auth DÉSACTIVÉ. Le déploiement CI se connecte en utilisateur **`devops`** (sudo NOPASSWD) ; toutes les opérations root passent par `sudo`. Secrets GitHub : `VPS_HOST`, `VPS_USER=devops`, `VPS_SSH_KEY` (clé privée devops).

**Workflow** (`.github/workflows/deploy.yml`, sur push `main` ou `workflow_dispatch`) : build frontend → `git reset --hard ${{ github.sha }}` sur le serveur (miroir exact du commit) → upload frontend vers `/tmp` puis swap `sudo` vers `/opt/realvsai/frontend/dist` → `docker compose -f docker-compose.prod.yml up -d --build` (lance `migrate` + `collectstatic`) → `nginx -t` + reload (la conf Nginx n'est **PAS** écrasée, pour préserver HTTPS/Certbot) → health checks `/health/` + `/multiplayer/`.

**Pièges à éviter** : ne jamais utiliser `rm:true` d'`appleboy/scp-action` vers `/opt/realvsai` (efface le dépôt) ; ne pas réactiver root/password SSH ; ne pas écraser la conf Nginx avec une ancienne config IP-only.

Le contexte ops complet (configs Nginx versionnées, scripts backup/watchdog, sécurité serveur, healthcheck) est dans **`docs/ops/`** — **lire `docs/ops/CLAUDE_CICD_HANDOFF.md` et `docs/ops/OPS.md` avant toute intervention ops/CI**. Les `deploy/setup-vps.sh` / `deploy/deploy.sh` sont d'anciens scripts (référence ; `deploy.sh` cible encore `root@` et n'est plus à jour). Endpoint de santé : `GET /health/` → `{"status":"ok","database":"ok","cache":"ok"}`.

## Architecture

### Deux apps Django

- `apps.game` — API publique (`/api/game/`) : sessions solo, réponses, leaderboard, création de room multijoueur, détection d'IP locale (pour le QR code). Détient tous les modèles et le consumer WebSocket.
- `apps.admin_api` — API admin (`/api/admin/`) : ViewSets CRUD pour `Category` et `MediaPair`, stats dashboard, suppression de session. **Auth applicative** : ces routes exigent `IsAdminUser` (DRF `TokenAuthentication`) ; login via `POST /api/admin/auth/login/` (identifiants superuser Django → token). Le permission DRF par défaut reste `AllowAny` (API de jeu publique) ; seules les vues admin surchargent en `IsAdminUser`.

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
- `MultiplayerRoom.ordered_pair_ids` (JSONField, vide par défaut) : sélection **préchoisie et ordonnée** de paires (preset). Vide → sélection aléatoire classique triée par id ; non vide → le consumer suit cet ordre exact (`ordered_pairs_for_room`). Les presets sont définis dans `apps/game/presets.py` par chemins `real_media` **stables** (pas par id, qui diffèrent dev/prod) ; `POST /api/game/multiplayer/rooms/` accepte `preset=<nom>` et **renvoie 400** si le preset est inconnu ou incomplet (paires non seedées). Preset `foot` = sélection de l'Event Foot.
- `MultiplayerPlayer.session_token` (UUID) sert à la reconnexion ; `channel_name` + `is_connected` suivent le WebSocket actif.
- Bonus de score pour les premiers à répondre correctement : +50 / +30 / +10 (selon `answer_order`).
- Les réponses d'un joueur sont `unique_together=['player', 'media_pair']` — un seul vote par question par joueur.

Points d'entrée frontend du mode live : `pages/multiplayer/MultiplayerHostPage.tsx` (projecteur/enseignant), `MultiplayerJoinPage.tsx` (lobby via QR/code), `MultiplayerPlayerPage.tsx` (élève). Le hook `useMultiplayerSocket` encapsule la connexion/reconnexion WebSocket via le `session_token`.

Le **Quiz Foot** (app `apps.quiz`, mode live event) a ses propres pages `pages/quiz/QuizHostPage.tsx` / `QuizJoinPage.tsx` / `QuizPlayerPage.tsx` + hook `useQuizSocket` (`ws/quiz/<code>/`). Leur **UI/UX est volontairement alignée sur celle du mode classe** (salle d'attente avec QR/avatars/correction IP, carte « Résultats » des joueurs à la révélation, podium animé, header joueur sticky) — en gardant les spécificités quiz (image centrale + propositions A/B/C/D ou Vrai/Faux). Différence assumée : **pas de chronomètre** (révélation manuelle ou auto quand tous ont répondu). La page `pages/EventFootPage.tsx` (`/event-foot`) enchaîne Quiz Foot puis Real vs AI (preset `foot`).

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
- **URLs média opaques (constat B)** : les médias de jeu sont servis via `/media/q/<jeton-HMAC><ext>` — des symlinks vers les fichiers réels, créés par le signal `post_save` de `MediaPair` et régénérés au démarrage prod (`python manage.py sync_media_links`, dans le `command` de `docker-compose.prod.yml`). But : ne pas révéler réel/IA dans l'URL. **Ne jamais renvoyer `real_media.url`/`ai_media.url` au joueur** — utiliser `MediaPair.opaque_media_url(side)` (serializer solo + consumer multi). `is_real` (réponse audio) ne doit jamais partir dans la question, seulement à la révélation. `/media/pairs/...` est désormais **restreint** (hérite de l'`auth_basic` global, plus servi au public — seul l'admin authentifié y accède). Résidu restant (B2) : l'extension peut corréler la réponse si réel et IA ont des formats différents par paire (auditer les médias).
- **Auth API admin** : `/api/admin/*` exige `IsAdminUser` (DRF `TokenAuthentication`). Login : `POST /api/admin/auth/login/` (superuser Django → token). Le SPA admin (`components/admin/RequireAdminAuth.tsx` + `AdminLayout.tsx`) gère ce login, stocke le token en `localStorage` et l'envoie en header `Authorization: Token …` **uniquement** sur les routes `/admin/` (hors `/admin/auth/`) — un interceptor purge le token + renvoie au login sur 401/403. Il faut donc un **superuser** (`createsuperuser`) sur le serveur pour accéder à l'admin. L'`auth_basic` Nginx en prod reste une couche de défense en profondeur par-dessus.
- `CORS_ALLOW_ALL_ORIGINS = True` quand `DEBUG=True` ; en prod, lecture de `CORS_ALLOWED_ORIGINS` et `CSRF_TRUSTED_ORIGINS` depuis l'env.

## Sécurité multijoueur (à respecter lors de modifs)

- **`host_token`** (UUID sur `MultiplayerRoom`) : renvoyé **uniquement** par `POST /api/game/multiplayer/rooms/`, **jamais** par le `GET`. Requis dans le payload `host.join` du WebSocket pour obtenir `is_host=True`. Sans ça, n'importe quel élève peut prendre le contrôle de la partie.
- **`session_token`** (UUID sur `MultiplayerPlayer`) : renvoyé uniquement au premier `player.join` d'un pseudo donné. Toute reconnexion ou join ultérieur sur un pseudo déjà pris doit fournir ce token, sinon c'est refusé (sinon : un attaquant taperait le pseudo d'un autre joueur et hériterait de sa session).
- **Garde `is_host`** : toutes les actions de contrôle du consumer (`game.start`, `game.next_question`, `game.skip`, `game.show_answer`, `game.end`) doivent commencer par `if not self.is_host: …return`. Ne jamais ajouter une action de contrôle sans cette garde (sinon n'importe quel élève connecté à la room pilote/coupe la partie).
- **Uploads `/api/admin/media-pairs/`** : les extensions sont whitelistées dans `MediaPairCreateSerializer.validate()` selon `media_type`. Ne pas désactiver cette validation — combiné avec Nginx servant `/media/` en statique, un `.html` ou `.svg` accepté devient du stored XSS sous l'origine de l'application. Les headers `X-Content-Type-Options: nosniff` et la CSP sur `/media/` sont la défense en profondeur.
- Les `Real_VS_AI.desktop` / `Stop_Real_VS_AI.desktop` + `scripts/start-kiosk.*` servent à lancer l'app en plein écran sur une machine kiosque — inutile en dev.
- Les notes de planification d'anciens travaux sont dans `.cursor/plans/` (historique, pas des instructions).
