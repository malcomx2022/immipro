#!/usr/bin/env bash
# Restauration de contrôle — revue du 07/10/2026, E10 (D-26).
#
# « Une sauvegarde jamais restaurée n'est pas une sauvegarde. » Le script
# reprend la base et les pièces d'une même nuit, les restaure sur une base
# jetable, et vérifie trois choses :
#
#   1. les garde-fous SQL tiennent, vérifiés depuis l'image du tag de la
#      nuit (`dist/verifier-garde-fous.mjs`) ;
#   2. les migrations appliquées sont exactement celles de cette image ;
#   3. chaque pièce saine que la base connaît est dans l'inventaire de
#      l'archive — **zéro manquante attendue**.
#
# Il se lance **hors du VPS**, là où vit la clé privée GPG (D-26 : coffre
# hors ligne) ; il refuse de tourner sur le VPS. Il faut `rclone` (remote
# vers B2), `gpg` avec la clé privée, `docker`, et l'accès en lecture à
# l'image sur GHCR.
#
#     scripts/restauration-controle.sh              la nuit la plus récente
#     scripts/restauration-controle.sh 2026-10-09   une nuit donnée
#
# Une fois par mois, et la ligne qu'il imprime à la fin s'ajoute au
# registre de docs/exploitation/sauvegardes.md. Rien n'est écrit en
# production : la base jetable et son réseau sont détruits en sortie.
set -euo pipefail

JOUR="${1:-}"
SOURCE="${SAUVEGARDE_DESTINATION:-b2:immipro-backups}"
PROPRIETAIRE="${IMMIPRO_PROPRIETAIRE:-malcomx2022}"
IMAGE_POSTGRES="${IMAGE_POSTGRES:-postgres:16-alpine}"
ATTENTE_BASE="${ATTENTE_BASE:-60}"

dire() { printf '[controle] %s\n' "$*"; }
echouer() {
  printf '[controle] ÉCHEC — %s\n' "$*" >&2
  exit 1
}

if [[ -e /srv/immipro/docker-compose.prod.yml ]]; then
  echouer "ce script se lance hors du VPS, là où est la clé privée GPG ; elle ne doit pas venir sur le serveur."
fi
[[ -z "$JOUR" || "$JOUR" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] ||
  echouer "date « $JOUR » illisible : attendu AAAA-MM-JJ."

TMP=$(mktemp -d)
NOM="immipro-controle-$$"
nettoyer() {
  docker rm -f "$NOM-pg" >/dev/null 2>&1 || true
  docker network rm "$NOM" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap nettoyer EXIT

# ── La nuit : le dump et l'archive des pièces de même horodatage ─────
LISTE=$(rclone lsf "$SOURCE/postgres/" --include "immipro-${JOUR}*.dump.gpg") ||
  echouer "$SOURCE ne se lit pas : vérifier le remote rclone (« rclone config show ${SOURCE%%:*} ») et l'accès réseau."
DUMP=$(printf '%s\n' "$LISTE" | LC_ALL=C sort | tail -n 1)
[[ -n "$DUMP" ]] || echouer "aucune sauvegarde de la base${JOUR:+ le $JOUR} dans $SOURCE/postgres/."
[[ "$DUMP" =~ ^immipro-([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{4}Z)-([A-Za-z0-9]+)\.dump\.gpg$ ]] ||
  echouer "nom de sauvegarde inattendu : $DUMP"
STAMP="${BASH_REMATCH[1]}"
TAG="${BASH_REMATCH[2]}"
PIECES="immipro-pieces-$STAMP-$TAG.tar.gpg"
LISTE=$(rclone lsf "$SOURCE/pieces/" --include "$PIECES") ||
  echouer "$SOURCE/pieces/ ne se lit pas."
[[ -n "$LISTE" ]] ||
  echouer "la base du $STAMP n'a pas son archive des pièces ($PIECES) : la sauvegarde de cette nuit est incomplète."
[[ "$TAG" != "inconnu" ]] ||
  echouer "la sauvegarde du $STAMP ne dit pas quel tag tournait : impossible de vérifier contre la bonne image."
IMAGE="ghcr.io/$PROPRIETAIRE/immipro:$TAG"
dire "nuit $STAMP, tag $TAG"

rclone copyto "$SOURCE/postgres/$DUMP" "$TMP/$DUMP"
rclone copyto "$SOURCE/pieces/$PIECES" "$TMP/$PIECES"

# ── Une base jetable, sur un réseau sans sortie ─────────────────────
MDP=$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')
docker network create --internal "$NOM" >/dev/null
docker run -d --name "$NOM-pg" --network "$NOM" \
  -e POSTGRES_PASSWORD="$MDP" -e POSTGRES_DB=immipro "$IMAGE_POSTGRES" >/dev/null
for ((i = 1; i <= ATTENTE_BASE; i++)); do
  docker exec "$NOM-pg" pg_isready -U postgres -d immipro >/dev/null 2>&1 && break
  ((i == ATTENTE_BASE)) && echouer "la base jetable n'a pas démarré en ${ATTENTE_BASE} s."
  sleep 1
done
psql_controle() { docker exec "$NOM-pg" psql -U postgres -d immipro -Atc "$1"; }

gpg --batch --quiet --decrypt "$TMP/$DUMP" |
  docker exec -i "$NOM-pg" pg_restore --no-owner --no-privileges -U postgres -d immipro ||
  echouer "le dump $DUMP ne se restaure pas (déchiffrement ou pg_restore)."
dire "base restaurée"

# ── 1. Garde-fous, depuis l'image de la nuit ────────────────────────
if docker run --rm --network "$NOM" \
  -e DATABASE_URL="postgresql://postgres:$MDP@$NOM-pg:5432/immipro" \
  "$IMAGE" node dist/verifier-garde-fous.mjs >"$TMP/garde-fous.txt" 2>&1; then
  GARDES="tiennent"
else
  GARDES="ÉCHEC"
  cat "$TMP/garde-fous.txt" >&2
fi

# ── 2. Migrations : exactement celles de l'image ────────────────────
psql_controle 'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY 1' |
  LC_ALL=C sort >"$TMP/appliquees.txt"
docker run --rm --entrypoint ls "$IMAGE" prisma/migrations |
  grep -v '^migration_lock\.toml$' | LC_ALL=C sort >"$TMP/attendues.txt"
ECART_MIGRATIONS=$(diff "$TMP/attendues.txt" "$TMP/appliquees.txt" | grep -c '^[<>]' || true)
NB_MIGRATIONS=$(wc -l <"$TMP/attendues.txt")

# ── 3. Les pièces saines que la base connaît sont dans l'archive ────
mkdir -p "$TMP/archive"
gpg --batch --quiet --decrypt "$TMP/$PIECES" | tar -xf - -C "$TMP/archive" inventaire.tsv ||
  echouer "l'archive $PIECES ne se déchiffre pas ou n'a pas d'inventaire."
LC_ALL=C sort -t $'\t' -k1,1 "$TMP/archive/inventaire.tsv" >"$TMP/inventaire.tsv"
psql_controle "SELECT \"objectKey\" || E'\\t' || lower(coalesce(checksum, '')) FROM \"DocumentVersion\"
  WHERE \"scanState\" = 'SAINE' AND \"objectKey\" IS NOT NULL AND \"purgedAt\" IS NULL" |
  LC_ALL=C sort -t $'\t' -k1,1 >"$TMP/connues.tsv"
NB_CONNUES=$(wc -l <"$TMP/connues.tsv")
MANQUANTES=$(LC_ALL=C comm -23 <(cut -f1 "$TMP/connues.tsv") <(cut -f1 "$TMP/inventaire.tsv") | tee "$TMP/manquantes.txt" | wc -l)
# L'empreinte en base est celle que le navigateur a déclarée au dépôt ;
# le serveur ne la recalcule pas. Une divergence se signale, elle ne fait
# pas échouer le contrôle.
DIVERGENTES=$(LC_ALL=C join -t $'\t' -j 1 -o 1.2,2.3 "$TMP/connues.tsv" "$TMP/inventaire.tsv" |
  awk -F'\t' '$1 != "" && $1 != $2' | wc -l)

# ── Verdict, et la ligne du registre ────────────────────────────────
dire "garde-fous : $GARDES"
dire "migrations : $NB_MIGRATIONS attendue(s), $ECART_MIGRATIONS écart(s)"
dire "pièces : $NB_CONNUES saine(s) en base, $MANQUANTES manquante(s), $DIVERGENTES empreinte(s) divergente(s)"
if ((MANQUANTES > 0)); then
  dire "premières pièces manquantes :"
  head -n 10 "$TMP/manquantes.txt" | sed 's/^/  /'
fi

REUSSI=non
[[ "$GARDES" == "tiennent" ]] && ((ECART_MIGRATIONS == 0)) && ((MANQUANTES == 0)) && REUSSI=oui
printf '\nLigne du registre (docs/exploitation/sauvegardes.md) :\n'
printf '| %s | %s | %s | %s | %s/%s | %s | %s | %s | %s |\n' \
  "$(date -u +%F)" "$STAMP" "$TAG" "$GARDES" "$((NB_MIGRATIONS - ECART_MIGRATIONS))" "$NB_MIGRATIONS" \
  "$MANQUANTES / $NB_CONNUES" "$DIVERGENTES" "$REUSSI" "${USER:-?}"

[[ "$REUSSI" == "oui" ]] || echouer "la restauration de contrôle du $STAMP ne passe pas : voir ci-dessus."
dire "la sauvegarde du $STAMP se restaure, et rien n'y manque"
