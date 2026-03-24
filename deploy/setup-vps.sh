#!/bin/bash
# =============================================================================
# Real vs AI — Setup initial du VPS (à exécuter UNE SEULE FOIS)
# =============================================================================
# Usage : ssh root@YOUR_VPS_IP 'bash -s' < deploy/setup-vps.sh
# =============================================================================
set -e

echo "=== 1/6 Mise à jour du système ==="
apt update && apt upgrade -y

echo "=== 2/6 Installation de Docker ==="
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    echo "Docker installé."
else
    echo "Docker déjà installé."
fi

echo "=== 3/6 Installation de Nginx + Certbot ==="
apt install -y nginx certbot python3-certbot-nginx apache2-utils
systemctl enable nginx

echo "=== 4/6 Installation de Git ==="
apt install -y git

echo "=== 5/6 Création du dossier projet ==="
mkdir -p /opt/realvsai
if [ ! -d "/opt/realvsai/.git" ]; then
    echo "IMPORTANT : Clone ton repo maintenant :"
    echo "  cd /opt/realvsai"
    echo "  git clone https://github.com/TON_USER/Real_VS_AI.git ."
    echo ""
    echo "Ou si le repo est privé, configure une clé SSH ou un token."
else
    echo "Repo déjà cloné dans /opt/realvsai"
fi

echo "=== 6/6 Création du fichier htpasswd (Basic Auth) ==="
if [ ! -f "/etc/nginx/.htpasswd_realvsai" ]; then
    echo "Création du mot de passe pour l'accès à l'application :"
    htpasswd -c /etc/nginx/.htpasswd_realvsai equipe
    echo "Fichier htpasswd créé."
else
    echo "Fichier htpasswd déjà existant."
fi

echo ""
echo "=========================================="
echo " Setup terminé !"
echo "=========================================="
echo ""
echo "Prochaines étapes :"
echo "  1. cd /opt/realvsai && git clone YOUR_REPO_URL ."
echo "  2. cp .env.example .env && nano .env   (remplir les valeurs)"
echo "  3. Copier la config Nginx :"
echo "     cp deploy/nginx-realvsai.conf /etc/nginx/sites-available/realvsai"
echo "     ln -s /etc/nginx/sites-available/realvsai /etc/nginx/sites-enabled/"
echo "     rm -f /etc/nginx/sites-enabled/default"
echo "     nginx -t && systemctl reload nginx"
echo "  4. Lancer l'application :"
echo "     docker compose -f docker-compose.prod.yml up -d --build"
echo "  5. Activer HTTPS :"
echo "     certbot --nginx -d realvsai.yourdomain.com"
echo ""
