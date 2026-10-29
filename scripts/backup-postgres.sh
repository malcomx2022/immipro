#!/usr/bin/env bash
# Sauvegarde chiffrée de PostgreSQL, expédiée hors du VPS — revue du
# 07/10/2026, E10 (D-26, révisé le 29/10/2026 : Cloudflare R2, S.207).
#
# Appelé par `scripts/sauvegarde.sh`, qui lui passe l'horodatage de la nuit
# et le tag en service : la base et les pièces d'une même nuit portent le
# même nom, et la restauration de contrôle les retrouve ensemble.
#
#     scripts/backup-postgres.sh <horodatage> <tag>
#
# Les identifiants de la base sont lus **dans le conteneur** (`.env.db`) :
# le cron n'a plus à les porter. Le reste vient de `.env.sauvegarde`.
set -euo pipefail

STAMP="${1:?horodatage attendu, par exemple 2026-10-09T0200Z}"
TAG="${2:?tag en service attendu}"
DOSSIER="${IMMIPRO_DOSSIER:-/srv/immipro}"
cd "$DOSSIER"

# shellcheck source=/dev/null
source .env.sauvegarde
: "${BACKUP_GPG_RECIPIENT:?BACKUP_GPG_RECIPIENT manque dans .env.sauvegarde}"
DESTINATION="${SAUVEGARDE_DESTINATION:-r2:immipro-backups}"
CONSERVATION="${SAUVEGARDE_CONSERVATION:-30d}"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
FICHIER="immipro-$STAMP-$TAG.dump.gpg"

# Format personnalisé (`-Fc`) : compressé, et rechargé par `pg_restore`,
# comme la sauvegarde que prend le déploiement avant une migration.
# shellcheck disable=SC2016
docker compose -f docker-compose.prod.yml exec -T postgres \
  sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' |
  gpg --batch --yes --encrypt --recipient "$BACKUP_GPG_RECIPIENT" >"$TMP/$FICHIER"

rclone copy "$TMP/$FICHIER" "$DESTINATION/postgres/"
# R2 n'a pas de versions masquées : la suppression détruit. Pour un remote
# B2, `--b2-hard-delete` empêche le masquage qui ferait survivre le fichier
# à sa durée de conservation ; l'option est sans effet sur un autre remote.
rclone delete --min-age "$CONSERVATION" --b2-hard-delete "$DESTINATION/postgres/"

echo "[sauvegarde] base : $FICHIER"
