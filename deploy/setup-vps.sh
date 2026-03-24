#!/bin/bash
# =============================================================================
# Real vs AI — Setup initial du VPS (à exécuter UNE SEULE FOIS)
# =============================================================================
# Usage : ssh root@204.168.174.92 'bash -s' < deploy/setup-vps.sh
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

echo "=== 3/6 Installation de Nginx + outils ==="
apt install -y nginx apache2-utils
systemctl enable nginx

echo "=== 4/6 Clone du repo ==="
mkdir -p /opt/realvsai
if [ ! -d "/opt/realvsai/.git" ]; then
    git clone https://github.com/MIA-Music-Integrity-Analysis/Real_VS_AI.git /opt/realvsai
    echo "Repo cloné. MODIFIE l'URL ci-dessus si le repo est différent."
else
    echo "Repo déjà cloné dans /opt/realvsai"
    cd /opt/realvsai && git pull origin main
fi

echo "=== 5/6 Configuration .env ==="
cd /opt/realvsai
if [ ! -f ".env" ]; then
    cp .env.example .env
    GENERATED_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(50))" 2>/dev/null || openssl rand -base64 50)
    GENERATED_PW=$(openssl rand -base64 24)
    sed -i "s|CHANGE_ME_GENERER_CLE_SECRETE|${GENERATED_KEY}|" .env
    sed -i "s|CHANGE_ME_MOT_DE_PASSE_FORT|${GENERATED_PW}|" .env
    echo ""
    echo "=========================================="
    echo " .env créé avec des secrets auto-générés"
    echo " Mot de passe PostgreSQL : ${GENERATED_PW}"
    echo " NOTE CE MOT DE PASSE quelque part !"
    echo "=========================================="
    echo ""
else
    echo ".env existe déjà."
fi

echo "=== 6/6 Nginx + Basic Auth ==="
if [ ! -f "/etc/nginx/.htpasswd_realvsai" ]; then
    echo "Création du mot de passe pour l'accès à l'application :"
    htpasswd -c /etc/nginx/.htpasswd_realvsai equipe
else
    echo "Fichier htpasswd déjà existant."
fi

cp /opt/realvsai/deploy/nginx-realvsai.conf /etc/nginx/sites-available/realvsai
ln -sf /etc/nginx/sites-available/realvsai /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

echo ""
echo "=========================================="
echo " Setup terminé !"
echo "=========================================="
echo ""
echo "Prochaines étapes :"
echo "  1. Vérifier le .env :  nano /opt/realvsai/.env"
echo "  2. Builder le frontend :"
echo "     apt install -y nodejs npm"
echo "     cd /opt/realvsai/frontend && npm ci && npm run build"
echo "  3. Lancer l'application :"
echo "     cd /opt/realvsai"
echo "     docker compose -f docker-compose.prod.yml up -d --build"
echo "  4. Charger les données :"
echo "     docker exec realvsai_backend python manage.py populate_pairs"
echo "  5. Tester : http://204.168.174.92/"
echo ""
