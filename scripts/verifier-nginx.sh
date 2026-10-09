#!/usr/bin/env bash
# Fait passer `nginx -t` aux fichiers de nginx/ — revue du 07/10/2026, M16.
#
# Les fichiers sont recopiés à la main sur le VPS ; une faute de syntaxe ne
# se découvrait qu'au `reload`, en production. Le script les charge dans
# l'image officielle, avec un certificat factice au chemin attendu.
#
#   scripts/verifier-nginx.sh
set -euo pipefail

racine="$(cd "$(dirname "$0")/.." && pwd)"
# L'image officielle, par le miroir de Google et épinglée par empreinte
# (S.160) : Docker Hub refuse les tirages anonymes des runners au-delà de
# sa limite, et la porte tombait avant le premier test.
image="${NGINX_IMAGE:-mirror.gcr.io/library/nginx:1.28-alpine@sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236}"
travail="$(mktemp -d)"
trap 'rm -rf "$travail"' EXIT

mkdir -p "$travail/live/immipro.app"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=immipro.app" \
  -keyout "$travail/live/immipro.app/privkey.pem" \
  -out "$travail/live/immipro.app/fullchain.pem" >/dev/null 2>&1
# L'image tourne sous un autre utilisateur : le certificat factice doit lui
# être lisible.
chmod -R a+rX "$travail"

docker run --rm \
  -v "$racine/nginx:/etc/nginx/conf.d:ro" \
  -v "$travail:/etc/letsencrypt:ro" \
  "$image" nginx -t
