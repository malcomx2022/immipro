# syntax=docker/dockerfile:1
#
# Node 24 LTS (D-30, M19 étape 0), épinglé par empreinte (M15) : un tag
# seul change sous les pieds d'une reconstruction. Dependabot tient
# l'empreinte à jour (`.github/dependabot.yml`, écosystème docker).
FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `npm run build` produit les deux artefacts : la sortie `standalone` de
# Next et le paquet du worker (`dist/worker.js`). Les enchaîner dans le
# script plutôt qu'ici évite qu'une image soit construite sans l'un des
# deux — c'est ainsi que le worker s'est retrouvé absent de l'image.
RUN npx prisma generate && npm run build

# La CLI Prisma des migrations, dans son propre étage — revue du
# 07/10/2026, M15. `npm install -g prisma@6` prenait la dernière 6.x du jour
# de la construction : deux images du même commit pouvaient migrer avec deux
# CLI différentes. La version est désormais celle du verrou
# `docker/prisma-cli/package-lock.json`, égale à celle du verrou racine
# (tests/image-production.test.ts y veille).
FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS prisma-cli
WORKDIR /opt/prisma-cli
COPY docker/prisma-cli/package.json docker/prisma-cli/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS runner
WORKDIR /app
ENV NODE_ENV=production

# Next 15 et 16 (`standalone`, `node server.js`) écoutent sur `process.env.HOSTNAME`
# quand il est défini — et Docker remplit automatiquement HOSTNAME avec
# l'ID du conteneur. Sans DNS (`--network none`, comme le test de fumée),
# cet ID ne se résout pas : le serveur meurt au démarrage sur `EAI_AGAIN`.
# Sur un réseau à DNS intégré il se résout, mais lier un nom interne
# reste fragile et dépend du réseau. On fige donc l'écoute sur toutes
# les interfaces : l'image se comporte pareil partout, en CI comme en
# production. Ni le worker ni la passerelle n'utilisent HOSTNAME.
ENV HOSTNAME=0.0.0.0
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Le worker, un seul fichier.
#
# Tout ce qu'il utilise y est empaqueté, sauf `@prisma/client` et le
# client généré `.prisma/client` : ceux-là chargent leurs moteurs par
# chemin à l'exécution et ne s'empaquettent pas. Ils n'ont pas besoin
# d'être copiés ici — la sortie `standalone` de Next les embarque déjà
# pour l'application, et les deux services partagent la même image.
#
# La carte de sources suit : un worker qui redémarre en boucle en
# production est exactement le cas où une pile lisible se paie.
COPY --from=builder --chown=nextjs:nodejs /app/dist ./dist

# Les migrations Prisma : le déploiement les applique depuis l'image
# (`docker compose run --rm app npx prisma migrate deploy`). Le schéma
# et les migrations doivent donc être dans l'image finale — la sortie
# `standalone` de Next ne les embarque pas.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# La CLI Prisma pour les migrations : le `standalone` ne la trace pas, et
# `npx prisma` seul téléchargerait la 7, qui refuse le `url` du schéma au
# style v6 (P1012). Elle vient de l'étage `prisma-cli`, à version exacte,
# et se trouve par le PATH (`npx prisma migrate deploy`, `prisma --version`).
COPY --from=prisma-cli /opt/prisma-cli /opt/prisma-cli
ENV PATH=/opt/prisma-cli/node_modules/.bin:$PATH

USER nextjs
EXPOSE 3000

# L'image a deux points d'entrée et un seul par défaut : le web. Le
# worker est lancé par sa propre commande, dans son propre conteneur
# (docker-compose.prod.yml). Rien ne le démarre à l'intérieur du
# processus web — un job de fond qui tourne dans le même processus que
# les requêtes partage leur mémoire et leur cycle de vie.
CMD ["node", "server.js"]

