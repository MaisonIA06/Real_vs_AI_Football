#!/bin/bash
# =============================================================================
# Real vs AI — Déploiement manuel (si le CI/CD n'est pas encore en place)
# =============================================================================
# Usage depuis ta machine locale :
#   ./deploy/deploy.sh user@YOUR_VPS_IP
#
# Ce script :
#   1. Build le frontend localement
#   2. Envoie les fichiers sur le VPS
#   3. Relance les conteneurs Docker
# =============================================================================
set -e

if [ -z "$1" ]; then
    echo "Usage: ./deploy/deploy.sh user@VPS_IP"
    echo "Exemple: ./deploy/deploy.sh root@123.45.67.89"
    exit 1
fi

VPS="$1"
REMOTE_DIR="/opt/realvsai"

echo "=== 1/4 Build du frontend ==="
cd frontend
npm ci
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
echo "Vérifie sur : https://realvsai.yourdomain.com"
