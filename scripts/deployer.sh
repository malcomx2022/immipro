#!/usr/bin/env bash
# Déploiement d'une image sur le VPS — revue du 07/10/2026, E9 (D-25).
#
# Exécuté sur le VPS par le job `deploy` de `deploy.yml`, qui y recopie
# d'abord ce script et `docker-compose.prod.yml` (dans
# `.deploiement/arrivee/`). Il se lance aussi à la main, avec les mêmes
# arguments :
#
#     /srv/immipro/scripts/deployer.sh <tag> <propriétaire>
#
# Le déploiement faisait `pull`, `migrate deploy`, `up -d`, sans garde-fous
# ni sonde : une image qui ne démarrait pas restait en place, et une
# migration se jouait sans sauvegarde. Dans l'ordre, désormais :
#
#   1. tirer l'image — un tag absent arrête tout ici, rien n'a bougé ;
#   2. si une migration attend, sauvegarder la base, chiffrée, dans
#      `sauvegardes/avant-<tag>.dump.gpg` ; sans destinataire GPG, arrêt ;
#   3. `prisma migrate deploy`, depuis la nouvelle image, avec **sa** CLI :
#      `prisma`, jamais `npx prisma` (voir l'étape 2) ;
#   4. les garde-fous SQL, depuis la nouvelle image : une migration qui
#      passe sans porter ses contraintes arrête le déploiement avant la
#      bascule ;
#   5. basculer (`up -d`), avec le compose reçu ;
#   6. sonder : la base doit répondre (`"db":"up"`), le code doit être 200
#      si l'instance répondait 200 avant — une instance inapte (503 sans
#      panne) n'est pas une panne —, et le worker doit avoir écrit
#      « worker démarré » ;
#   7. en cas d'échec, relancer une fois, sonder encore, puis revenir au tag
#      et au compose précédents.
#
# **La base ne revient jamais en arrière.** Une migration appliquée reste
# appliquée ; c'est pourquoi elles doivent être additives (prisma/README.md).
# La restauration, si elle s'impose, est manuelle, depuis la sauvegarde de
# l'étape 2 : docs/exploitation/deploiement.md.
#
# Le tag en service est écrit dans `.deploiement/tag-courant` et dans
# `.env` (`TAG=`, `GH_OWNER=`), que `docker compose` lit seul : une commande
# lancée à la main vise l'image en service, et non une image sans tag.
set -euo pipefail

TAG_NOUVEAU="${1:-}"
PROPRIETAIRE="${2:-}"
DOSSIER="${IMMIPRO_DOSSIER:-/srv/immipro}"
SONDE_URL="${IMMIPRO_SONDE_URL:-http://127.0.0.1:3000/api/health}"
SONDE_ESSAIS="${IMMIPRO_SONDE_ESSAIS:-30}"
SONDE_PAUSE="${IMMIPRO_SONDE_PAUSE:-2}"
SAUVEGARDES_GARDEES=3

dire() { printf '[deployer] %s\n' "$*"; }
echouer() {
  printf '[deployer] ÉCHEC — %s\n' "$*" >&2
  exit 1
}

[[ "$TAG_NOUVEAU" =~ ^[0-9a-f]{7,40}$ ]] ||
  echouer "tag « $TAG_NOUVEAU » illisible : il faut l'empreinte d'un commit, 7 à 40 caractères hexadécimaux."
[[ "$PROPRIETAIRE" =~ ^[A-Za-z0-9-]+$ ]] ||
  echouer "propriétaire « $PROPRIETAIRE » illisible : il faut le compte GitHub qui publie l'image."

cd "$DOSSIER"
mkdir -p .deploiement sauvegardes
chmod 700 sauvegardes

# Un déploiement à la fois, y compris à la main pendant que la CI déploie.
exec 9>.deploiement/verrou
flock -n 9 || echouer "un autre déploiement est en cours sur ce serveur ; attendre qu'il se termine."

COMPOSE_EN_SERVICE=docker-compose.prod.yml
COMPOSE_RECU=.deploiement/arrivee/docker-compose.prod.yml
COMPOSE_PRECEDENT=.deploiement/docker-compose.prod.yml.precedent
COMPOSE_NOUVEAU=$COMPOSE_EN_SERVICE
[[ -f "$COMPOSE_RECU" ]] && COMPOSE_NOUVEAU=$COMPOSE_RECU

# `--project-directory` : le compose reçu vit dans un sous-dossier, et ses
# chemins relatifs (`./garage.toml`, les `env_file`) comme le nom du projet
# doivent rester ceux de /srv/immipro.
compose() {
  local fichier=$1 tag=$2
  shift 2
  TAG="$tag" GH_OWNER="$PROPRIETAIRE" docker compose --project-directory . -f "$fichier" "$@"
}

TAG_PRECEDENT=""
if [[ -s .deploiement/tag-courant ]]; then
  TAG_PRECEDENT=$(<.deploiement/tag-courant)
elif [[ -f .env ]]; then
  TAG_PRECEDENT=$(sed -n 's/^TAG=//p' .env | tail -n 1)
fi

# Le code que l'instance rend, et son corps dans le fichier donné. « 000 »
# quand rien ne répond.
code_de_sante() {
  curl -s -o "$1" -w '%{http_code}' --max-time 5 "$SONDE_URL" || true
}

SANTE_AVANT=$(code_de_sante /dev/null)
dire "déploiement de $TAG_NOUVEAU (en service : ${TAG_PRECEDENT:-aucun tag connu}, santé avant : $SANTE_AVANT)"

# ── 1. Tirer ────────────────────────────────────────────────────────
compose "$COMPOSE_NOUVEAU" "$TAG_NOUVEAU" config --quiet ||
  echouer "le compose reçu ne se lit pas ; rien n'a changé."
compose "$COMPOSE_NOUVEAU" "$TAG_NOUVEAU" pull --quiet ||
  echouer "l'image $TAG_NOUVEAU n'a pas pu être tirée ; rien n'a changé."

# ── 2. Sauvegarder, si une migration attend ─────────────────────────
#
# La CLI Prisma s'appelle `prisma`, nom nu : c'est celle de l'image, à la
# version du verrou (`/opt/prisma-cli`, M15), trouvée par le PATH.
# `npx prisma` ne la regarde pas : l'application `standalone` n'a pas de
# `prisma` dans son `node_modules`, et npx télécharge alors l'étiquette
# `latest` du registre. Le 09/10/2026, c'était `8.0.0-rc.22`, qui ne
# connaît plus `migrate` : tous les déploiements s'arrêtaient ici sur
# `CLI.UNKNOWN_COMMAND`. Renommer la commande en `migration` aurait fait
# migrer la production avec une préversion, contre un schéma Prisma 6.
JOURNAL_STATUT=$(mktemp)
trap 'rm -f "$JOURNAL_STATUT"' EXIT
if compose "$COMPOSE_NOUVEAU" "$TAG_NOUVEAU" run --rm -T app prisma migrate status >"$JOURNAL_STATUT" 2>&1; then
  dire "aucune migration en attente"
elif grep -q "not yet been applied" "$JOURNAL_STATUT"; then
  dire "une migration attend : sauvegarde préalable"
  # shellcheck source=/dev/null
  [[ -f .env.sauvegarde ]] && source .env.sauvegarde
  [[ -n "${BACKUP_GPG_RECIPIENT:-}" ]] ||
    echouer "une migration attend et BACKUP_GPG_RECIPIENT n'est pas défini : le renseigner dans .env.sauvegarde. Rien n'a changé."
  SAUVEGARDE="sauvegardes/avant-$TAG_NOUVEAU.dump.gpg"
  # Les variables sont celles du conteneur postgres (`.env.db`), d'où les
  # guillemets simples.
  # shellcheck disable=SC2016
  compose "$COMPOSE_EN_SERVICE" "${TAG_PRECEDENT:-$TAG_NOUVEAU}" exec -T postgres \
    sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' |
    gpg --batch --yes --encrypt --recipient "$BACKUP_GPG_RECIPIENT" >"$SAUVEGARDE.partiel" ||
    {
      rm -f "$SAUVEGARDE.partiel"
      echouer "la sauvegarde préalable a échoué ; rien n'a changé."
    }
  mv "$SAUVEGARDE.partiel" "$SAUVEGARDE"
  chmod 600 "$SAUVEGARDE"
  dire "sauvegarde écrite : $SAUVEGARDE"
  # Les plus récentes seulement : une sauvegarde de déploiement sert au
  # retour d'un déploiement, la sauvegarde quotidienne fait le reste.
  find sauvegardes -maxdepth 1 -name 'avant-*.dump.gpg' -printf '%T@ %p\n' |
    sort -rn | tail -n +$((SAUVEGARDES_GARDEES + 1)) | cut -d' ' -f2- |
    xargs -r rm -f --
else
  cat "$JOURNAL_STATUT" >&2
  echouer "l'état des migrations ne se lit pas (voir ci-dessus) ; rien n'a changé."
fi

# ── 3. Migrer, 4. vérifier les garde-fous — depuis la nouvelle image ─
compose "$COMPOSE_NOUVEAU" "$TAG_NOUVEAU" run --rm -T app prisma migrate deploy ||
  echouer "la migration a échoué ; la version $TAG_PRECEDENT tourne toujours. La base peut être partiellement migrée : voir docs/exploitation/deploiement.md."
compose "$COMPOSE_NOUVEAU" "$TAG_NOUVEAU" run --rm -T app node dist/verifier-garde-fous.mjs ||
  echouer "les garde-fous ne tiennent pas sur la base migrée ; la version $TAG_PRECEDENT tourne toujours, la bascule n'a pas eu lieu."

# ── 5. Basculer, 6. sonder ──────────────────────────────────────────
sonder() {
  local depuis=$1 corps code="000" essai journal
  corps=$(mktemp)
  for ((essai = 1; essai <= SONDE_ESSAIS; essai++)); do
    code=$(code_de_sante "$corps")
    # Lu en entier puis cherché : `grep -q` dans un tube coupe la sortie
    # de `docker compose logs`, et `pipefail` prendrait ce SIGPIPE pour un
    # échec.
    journal=$(compose "$COMPOSE_EN_SERVICE" "$2" logs --no-color --since "$depuis" worker 2>/dev/null || true)
    if grep -q '"db":"up"' "$corps" &&
      { [[ "$SANTE_AVANT" != "200" ]] || [[ "$code" == "200" ]]; } &&
      [[ "$journal" == *"worker démarré"* ]]; then
      rm -f "$corps"
      return 0
    fi
    sleep "$SONDE_PAUSE"
  done
  rm -f "$corps"
  local attendu='base « up » et worker démarré'
  [[ "$SANTE_AVANT" == "200" ]] && attendu="$attendu, code 200 comme avant"
  dire "sonde en échec après $SONDE_ESSAIS essais (dernier code : $code ; attendu : $attendu)"
  return 1
}

maintenant() { date -u +%Y-%m-%dT%H:%M:%SZ; }

if [[ "$COMPOSE_NOUVEAU" == "$COMPOSE_RECU" ]]; then
  [[ -f "$COMPOSE_EN_SERVICE" ]] && cp -p "$COMPOSE_EN_SERVICE" "$COMPOSE_PRECEDENT"
  mv "$COMPOSE_RECU" "$COMPOSE_EN_SERVICE"
  COMPOSE_INSTALLE=oui
else
  COMPOSE_INSTALLE=non
fi

DEPUIS=$(maintenant)
compose "$COMPOSE_EN_SERVICE" "$TAG_NOUVEAU" up -d
if ! sonder "$DEPUIS" "$TAG_NOUVEAU"; then
  dire "relance de app et worker"
  DEPUIS=$(maintenant)
  compose "$COMPOSE_EN_SERVICE" "$TAG_NOUVEAU" restart app worker
  if ! sonder "$DEPUIS" "$TAG_NOUVEAU"; then
    # ── 7. Retour arrière ─────────────────────────────────────────
    [[ -n "$TAG_PRECEDENT" ]] ||
      echouer "la version $TAG_NOUVEAU ne répond pas, et aucun tag précédent n'est connu : pas de retour arrière possible. Inspecter « docker compose logs app worker »."
    if [[ "$COMPOSE_INSTALLE" == "oui" && -f "$COMPOSE_PRECEDENT" ]]; then
      cp -p "$COMPOSE_PRECEDENT" "$COMPOSE_EN_SERVICE"
    fi
    dire "retour à $TAG_PRECEDENT"
    DEPUIS=$(maintenant)
    compose "$COMPOSE_EN_SERVICE" "$TAG_PRECEDENT" up -d
    if sonder "$DEPUIS" "$TAG_PRECEDENT"; then
      printf '%s %s retour-arriere-vers %s\n' "$(maintenant)" "$TAG_NOUVEAU" "$TAG_PRECEDENT" >>.deploiement/journal
      echouer "la version $TAG_NOUVEAU ne répondait pas ; $TAG_PRECEDENT est revenue en service. La base reste migrée."
    fi
    echouer "la version $TAG_NOUVEAU ne répondait pas, et $TAG_PRECEDENT ne répond pas non plus après le retour. Intervention manuelle : docs/exploitation/deploiement.md."
  fi
fi

# ── Retenir le tag en service ───────────────────────────────────────
ecrire_variable() {
  local nom=$1 valeur=$2
  touch .env
  if grep -q "^$nom=" .env; then
    sed -i "s/^$nom=.*/$nom=$valeur/" .env
  else
    printf '%s=%s\n' "$nom" "$valeur" >>.env
  fi
}
printf '%s\n' "$TAG_NOUVEAU" >.deploiement/tag-courant
ecrire_variable TAG "$TAG_NOUVEAU"
ecrire_variable GH_OWNER "$PROPRIETAIRE"
printf '%s %s depuis %s\n' "$(maintenant)" "$TAG_NOUVEAU" "${TAG_PRECEDENT:-aucun}" >>.deploiement/journal
docker image prune -f >/dev/null
dire "$TAG_NOUVEAU est en service"
