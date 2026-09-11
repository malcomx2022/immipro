#!/usr/bin/env bash
# Sauvegarde chiffrée de PostgreSQL, expédiée hors du VPS.
# Cron : 0 2 * * *  /srv/immipro/scripts/backup-postgres.sh
set -euo pipefail

STAMP=$(date +%F-%H%M)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

docker compose -f /srv/immipro/docker-compose.prod.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip \
  | gpg --batch --yes --encrypt --recipient "$BACKUP_GPG_RECIPIENT" \
  > "$TMP/immipro-$STAMP.sql.gz.gpg"

rclone copy "$TMP/immipro-$STAMP.sql.gz.gpg" "b2:immipro-backups/postgres/"
rclone delete --min-age 30d "b2:immipro-backups/postgres/"

# Une sauvegarde jamais restaurée n'est pas une sauvegarde :
# restauration de contrôle le 1er de chaque mois, voir docs/exploitation.md
