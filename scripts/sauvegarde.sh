#!/usr/bin/env bash
# La sauvegarde de la nuit — revue du 07/10/2026, E10 (D-26).
#
# La base, puis les pièces, avec le même horodatage et le même tag, puis un
# ping de surveillance (Healthchecks.io) : succès, ou `/fail`. Sans ping, une
# sauvegarde qui échoue ne se voit que le jour où on en a besoin.
#
# Cron, à 2 h UTC — avant la purge de rétention de 3 h 30 (pg-boss, UTC),
# pour qu'une pièce échue la veille figure encore dans la sauvegarde de la
# nuit et pas une pièce purgée depuis :
#
#     CRON_TZ=UTC
#     0 2 * * *  /srv/immipro/scripts/sauvegarde.sh >> /var/log/immipro-sauvegarde.log 2>&1
set -euo pipefail

DOSSIER="${IMMIPRO_DOSSIER:-/srv/immipro}"
cd "$DOSSIER"

if [[ ! -f .env.sauvegarde ]]; then
  echo "[sauvegarde] ÉCHEC — $DOSSIER/.env.sauvegarde absent : le créer (mode 600) d'après .env.example." >&2
  exit 1
fi
# shellcheck source=/dev/null
source .env.sauvegarde
if [[ -z "${SAUVEGARDE_PING_URL:-}" ]]; then
  echo "[sauvegarde] ÉCHEC — SAUVEGARDE_PING_URL manque dans .env.sauvegarde : sans surveillance, un échec passerait inaperçu." >&2
  exit 1
fi

pinger() {
  curl -fsS -m 10 --retry 3 -o /dev/null "$SAUVEGARDE_PING_URL$1" ||
    echo "[sauvegarde] le ping « ${1:-succès} » n'est pas parti" >&2
}

STAMP=$(date -u +%Y-%m-%dT%H%MZ)
TAG=$(cat .deploiement/tag-courant 2>/dev/null || sed -n 's/^TAG=//p' .env 2>/dev/null | tail -n 1)
TAG="${TAG:-inconnu}"

pinger /start
trap 'pinger /fail' ERR

"$DOSSIER/scripts/backup-postgres.sh" "$STAMP" "$TAG"
"$DOSSIER/scripts/backup-pieces.sh" "$STAMP" "$TAG"

trap - ERR
pinger ""
echo "[sauvegarde] nuit $STAMP, tag $TAG : base et pièces expédiées"
