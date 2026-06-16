#!/bin/bash
# =============================================================================
# Real vs AI — Déploiement manuel
# =============================================================================
# Usage depuis ta machine locale :
#   ./deploy/deploy.sh
# =============================================================================
set -e

VPS="root@187.124.219.253"
REMOTE_DIR="/opt/realvsai"

echo "=== 1/4 Build du frontend ==="
cd "$(dirname "$0")/.."
cd frontend
npm install
npm run build
cd ..

echo "=== 2/4 Envoi du frontend buildé sur le VPS ==="
rsync -avz --delete frontend/dist/ "${VPS}:${REMOTE_DIR}/frontend/dist/"

echo "=== 3/4 Pull du code et rebuild des conteneurs ==="
ssh "$VPS" "cd ${REMOTE_DIR} && git pull origin main && docker compose -f docker-compose.prod.yml up -d --build"

echo "=== 4/4 Reload Nginx ==="
ssh "$VPS" "sudo nginx -t && sudo systemctl reload nginx"

echo ""
echo "Déploiement terminé !"
echo "Vérifie sur : http://204.168.174.92/"
