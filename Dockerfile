# syntax=docker/dockerfile:1
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `npm run build` produit les deux artefacts : la sortie `standalone` de
# Next et le paquet du worker (`dist/worker.js`). Les enchaîner dans le
# script plutôt qu'ici évite qu'une image soit construite sans l'un des
# deux — c'est ainsi que le worker s'est retrouvé absent de l'image.
RUN npx prisma generate && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
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

USER nextjs
EXPOSE 3000

# L'image a deux points d'entrée et un seul par défaut : le web. Le
# worker est lancé par sa propre commande, dans son propre conteneur
# (docker-compose.prod.yml). Rien ne le démarre à l'intérieur du
# processus web — un job de fond qui tourne dans le même processus que
# les requêtes partage leur mémoire et leur cycle de vie.
CMD ["node", "server.js"]
