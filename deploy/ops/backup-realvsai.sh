#!/usr/bin/env bash
set -euo pipefail

APP_NAME="realvsai"
APP_DIR="/opt/realvsai"
BACKUP_ROOT="/opt/backups/${APP_NAME}"
RETENTION_DAYS="14"
DB_CONTAINER="realvsai_db"
NGINX_SITE="/etc/nginx/sites-available/realvsai"
LOG_PREFIX="[backup-${APP_NAME}]"

umask 077

exec 9>/run/backup-${APP_NAME}.lock
if ! flock -n 9; then
  echo "${LOG_PREFIX} ERREUR: un backup est déjà en cours" >&2
  exit 1
fi

if [[ $EUID -ne 0 ]]; then
  echo "${LOG_PREFIX} ERREUR: ce script doit être exécuté en root" >&2
  exit 1
fi

if [[ ! -d "${APP_DIR}" ]]; then
  echo "${LOG_PREFIX} ERREUR: dossier application introuvable: ${APP_DIR}" >&2
  exit 1
fi

if ! docker inspect "${DB_CONTAINER}" >/dev/null 2>&1; then
  echo "${LOG_PREFIX} ERREUR: conteneur PostgreSQL introuvable: ${DB_CONTAINER}" >&2
  exit 1
fi

mkdir -p "${BACKUP_ROOT}"
chmod 700 "${BACKUP_ROOT}"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="${BACKUP_ROOT}/${TS}"
mkdir -p "${DEST}"
chmod 700 "${DEST}"

cleanup_on_error() {
  local code=$?
  if [[ ${code} -ne 0 ]]; then
    echo "${LOG_PREFIX} ERREUR: backup échoué, suppression du dossier incomplet ${DEST}" >&2
    rm -rf "${DEST}"
  fi
  exit "${code}"
}
trap cleanup_on_error EXIT

echo "${LOG_PREFIX} début ${TS}"

# Dump PostgreSQL au format custom. Les identifiants restent dans l'environnement du conteneur.
docker exec "${DB_CONTAINER}" sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "${DEST}/postgres.dump"
test -s "${DEST}/postgres.dump"

# Vérification structurelle du dump.
docker exec -i "${DB_CONTAINER}" sh -lc 'pg_restore -l >/dev/null' < "${DEST}/postgres.dump"

# Archives fichiers applicatifs. Les permissions root-only sont imposées par umask 077.
if [[ -d "${APP_DIR}/backend/media" ]]; then
  tar -C "${APP_DIR}/backend" -czf "${DEST}/media.tar.gz" media
else
  echo "${LOG_PREFIX} AVERTISSEMENT: media absent: ${APP_DIR}/backend/media" >&2
fi

if [[ -d "${APP_DIR}/backend/staticfiles" ]]; then
  tar -C "${APP_DIR}/backend" -czf "${DEST}/staticfiles.tar.gz" staticfiles
fi

# Configs utiles à une restauration. Ne jamais afficher le contenu dans les logs.
tar -C / -czf "${DEST}/configs.tar.gz" \
  "${APP_DIR#/}/docker-compose.prod.yml" \
  "${APP_DIR#/}/docker-compose.yml" \
  "${APP_DIR#/}/.env" \
  "${APP_DIR#/}/deploy" \
  "${NGINX_SITE#/}"

cat > "${DEST}/manifest.txt" <<EOF
app=${APP_NAME}
timestamp_utc=${TS}
hostname=$(hostname)
app_dir=${APP_DIR}
backup_dir=${DEST}
db_container=${DB_CONTAINER}
retention_days=${RETENTION_DAYS}
EOF

{
  echo
  echo "files:"
  find "${DEST}" -maxdepth 1 -type f -printf '%f %s bytes\n' | sort
  echo
  echo "sha256:"
  (cd "${DEST}" && sha256sum ./*)
} >> "${DEST}/manifest.txt"

# Vérifications finales.
test -s "${DEST}/postgres.dump"
test -s "${DEST}/configs.tar.gz"
if [[ -e "${DEST}/media.tar.gz" ]]; then test -s "${DEST}/media.tar.gz"; fi

# Rotation explicite.
find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d -mtime +"${RETENTION_DAYS}" -print -exec rm -rf {} +

chmod -R go-rwx "${DEST}"
trap - EXIT

echo "${LOG_PREFIX} terminé ${DEST}"
du -sh "${DEST}"
