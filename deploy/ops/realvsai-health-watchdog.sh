#!/usr/bin/env bash
set -u

HOSTNAME="$(hostname)"
NOW="$(date -u +%s)"
BACKUP_ROOT="/opt/backups/realvsai"
MAX_BACKUP_AGE_HOURS=36
DISK_WARN_PCT=80
INODE_WARN_PCT=80
APP_DIR="/opt/realvsai"
COMPOSE_FILE="${APP_DIR}/docker-compose.prod.yml"
DOMAIN="realvsai.xn--dmonstrateur-beb.tech"
CERT_WARN_DAYS=15

declare -a ALERTS=()

add_alert() {
  ALERTS+=("$1")
}

# Disque et inodes racine.
DISK_PCT="$(df -P / 2>/dev/null | awk 'NR==2 {gsub(/%/,"",$5); print $5}')"
if [[ "${DISK_PCT:-0}" =~ ^[0-9]+$ ]] && (( DISK_PCT >= DISK_WARN_PCT )); then
  add_alert "Disque / à ${DISK_PCT}% (seuil ${DISK_WARN_PCT}%)"
fi

INODE_PCT="$(df -Pi / 2>/dev/null | awk 'NR==2 {gsub(/%/,"",$5); print $5}')"
if [[ "${INODE_PCT:-0}" =~ ^[0-9]+$ ]] && (( INODE_PCT >= INODE_WARN_PCT )); then
  add_alert "Inodes / à ${INODE_PCT}% (seuil ${INODE_WARN_PCT}%)"
fi

# Services critiques.
for svc in ssh nginx docker cron fail2ban; do
  if ! systemctl is-active --quiet "$svc" 2>/dev/null; then
    add_alert "Service ${svc} inactif"
  fi
done

# Pare-feu.
if command -v ufw >/dev/null 2>&1; then
  if ! ufw status 2>/dev/null | grep -q '^Status: active'; then
    add_alert "UFW inactif"
  fi
fi

# Docker compose Real vs AI.
if [[ -f "$COMPOSE_FILE" ]]; then
  while IFS='|' read -r name state health; do
    [[ -z "$name" ]] && continue
    if [[ "$state" != "running" ]]; then
      add_alert "Conteneur ${name} état=${state}"
    fi
    if [[ "$health" != "none" && "$health" != "healthy" ]]; then
      add_alert "Conteneur ${name} health=${health}"
    fi
  done < <(docker inspect realvsai_backend realvsai_db realvsai_redis --format '{{.Name}}|{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' 2>/dev/null | sed 's#^/##')
else
  add_alert "Compose Real vs AI introuvable: ${COMPOSE_FILE}"
fi

# Nginx syntax.
if ! nginx -t >/dev/null 2>&1; then
  add_alert "Configuration Nginx invalide"
fi

# HTTP/HTTPS Real vs AI.
LOCAL_HEALTH_CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 -H "Host: ${DOMAIN}" http://127.0.0.1:8001/health/ 2>/dev/null || true)"
if [[ "$LOCAL_HEALTH_CODE" != "200" ]]; then
  add_alert "Healthcheck backend local Real vs AI inattendu: ${LOCAL_HEALTH_CODE:-aucune réponse}"
fi

PUBLIC_HTTPS_CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "https://${DOMAIN}/health/" 2>/dev/null || true)"
if [[ "$PUBLIC_HTTPS_CODE" != "200" ]]; then
  add_alert "HTTPS public Real vs AI /health inattendu: ${PUBLIC_HTTPS_CODE:-aucune réponse}"
fi

CERT_END="$(echo | openssl s_client -servername "$DOMAIN" -connect "${DOMAIN}:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2- || true)"
if [[ -z "${CERT_END:-}" ]]; then
  add_alert "Certificat HTTPS illisible pour ${DOMAIN}"
else
  CERT_END_TS="$(date -d "$CERT_END" -u +%s 2>/dev/null || echo 0)"
  if [[ "$CERT_END_TS" =~ ^[0-9]+$ ]] && (( CERT_END_TS > 0 )); then
    DAYS_LEFT=$(( (CERT_END_TS - NOW) / 86400 ))
    if (( DAYS_LEFT < CERT_WARN_DAYS )); then
      add_alert "Certificat HTTPS ${DOMAIN} expire dans ${DAYS_LEFT} jours"
    fi
  else
    add_alert "Date d'expiration certificat invalide pour ${DOMAIN}: ${CERT_END}"
  fi
fi

# Fraîcheur backup + présence des fichiers principaux.
if [[ ! -d "$BACKUP_ROOT" ]]; then
  add_alert "Dossier backup absent: ${BACKUP_ROOT}"
else
  LATEST="$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)"
  if [[ -z "${LATEST:-}" ]]; then
    add_alert "Aucun backup Real vs AI trouvé"
  else
    MTIME="$(stat -c %Y "$LATEST" 2>/dev/null || echo 0)"
    AGE_HOURS=$(( (NOW - MTIME) / 3600 ))
    if (( AGE_HOURS > MAX_BACKUP_AGE_HOURS )); then
      add_alert "Dernier backup trop ancien: ${AGE_HOURS}h (${LATEST})"
    fi
    for f in postgres.dump media.tar.gz configs.tar.gz manifest.txt; do
      if [[ ! -s "$LATEST/$f" ]]; then
        add_alert "Fichier backup manquant ou vide: ${LATEST}/${f}"
      fi
    done
  fi
fi

# Erreurs système récentes critiques, faible bruit: failed systemd uniquement.
FAILED_UNITS="$(systemctl --failed --plain --no-legend 2>/dev/null | awk '{print $1}' | paste -sd ', ' -)"
if [[ -n "${FAILED_UNITS:-}" ]]; then
  add_alert "Unités systemd en échec: ${FAILED_UNITS}"
fi

if (( ${#ALERTS[@]} > 0 )); then
  echo "ALERTE serveur ${HOSTNAME} — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  for alert in "${ALERTS[@]}"; do
    echo "- ${alert}"
  done
fi
