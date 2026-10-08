#!/usr/bin/env bash
# Sauvegarde chiffrée des pièces des candidats — revue du 07/10/2026, E10
# (D-26, D-27).
#
# Les pièces n'étaient sauvegardées nulle part : une perte du volume
# Garage les perdait toutes, et la base désignait alors des objets
# disparus.
#
#     scripts/backup-pieces.sh <horodatage> <tag>
#
# Méthode retenue pour Garage v2 : un export S3 par `rclone`, du **seul**
# seau des pièces saines (`SEAU_PIECES`), par une clé en lecture seule.
# Ni `garage meta snapshot`, qui ne capture pas les données, ni une copie à
# froid du `data_dir`, qui emporterait la quarantaine (transitoire,
# potentiellement malveillante) et des blocs purgés pas encore collectés,
# contre INV-5.
#
# L'archive porte un inventaire (`inventaire.tsv` : clé, taille, SHA-256),
# que la restauration de contrôle compare à la base. Elle est conservée
# 30 jours (D-27) : une pièce purgée en production disparaît de la dernière
# sauvegarde au plus tard 30 jours après sa purge.
set -euo pipefail

STAMP="${1:?horodatage attendu, par exemple 2026-10-09T0200Z}"
TAG="${2:?tag en service attendu}"
DOSSIER="${IMMIPRO_DOSSIER:-/srv/immipro}"
cd "$DOSSIER"

# shellcheck source=/dev/null
source .env.sauvegarde
: "${BACKUP_GPG_RECIPIENT:?BACKUP_GPG_RECIPIENT manque dans .env.sauvegarde}"
SEAU="${SEAU_PIECES:-immipro-documents}"
SOURCE="${SAUVEGARDE_SOURCE_PIECES:-garage}"
DESTINATION="${SAUVEGARDE_DESTINATION:-b2:immipro-backups}"
CONSERVATION="${SAUVEGARDE_CONSERVATION:-30d}"

# Sur le disque du VPS, et non en mémoire (`/tmp` peut être un tmpfs) : la
# copie du seau y tient le temps de l'archive.
TMP=$(mktemp -d "${SAUVEGARDE_TRAVAIL:-/var/tmp}/immipro-pieces.XXXXXX")
trap 'rm -rf "$TMP"' EXIT
FICHIER="immipro-pieces-$STAMP-$TAG.tar.gpg"

rclone sync "$SOURCE:$SEAU" "$TMP/pieces"

# L'inventaire : une ligne par objet, triée par clé. La restauration de
# contrôle y cherche chaque pièce saine que la base connaît.
(
  cd "$TMP/pieces"
  find . -type f -printf '%P\n' | LC_ALL=C sort | while IFS= read -r cle; do
    printf '%s\t%s\t%s\n' "$cle" "$(stat -c %s -- "$cle")" "$(sha256sum -- "$cle" | cut -d' ' -f1)"
  done
) >"$TMP/inventaire.tsv"
OBJETS=$(wc -l <"$TMP/inventaire.tsv")

tar -C "$TMP" -cf - inventaire.tsv pieces |
  gpg --batch --yes --encrypt --recipient "$BACKUP_GPG_RECIPIENT" >"$TMP/$FICHIER"

rclone copy "$TMP/$FICHIER" "$DESTINATION/pieces/"
rclone delete --min-age "$CONSERVATION" --b2-hard-delete "$DESTINATION/pieces/"

echo "[sauvegarde] pièces : $FICHIER ($OBJETS objet(s))"
