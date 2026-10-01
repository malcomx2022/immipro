# Mise en place du dépôt GitHub

Le dossier livré contient déjà un dépôt Git initialisé avec un premier commit.

## 1. Créer le dépôt distant

Sur GitHub : nouveau dépôt **privé**, nommé `immipro`, **sans** README, .gitignore ni licence — tout est déjà là.

```bash
cd immipro
git remote add origin git@github.com:<votre-compte>/immipro.git
git push -u origin main
git checkout -b develop && git push -u origin develop
```

## 2. Protéger les branches

Réglages → Branches → règle sur `main` :

- pull request obligatoire, 1 approbation
- le job `verifier` du workflow CI doit passer
- pas de poussée directe, pas de réécriture d'historique

Même règle sur `develop`, sans l'approbation obligatoire.

## 3. Secrets et environnement

Réglages → Secrets and variables → Actions :

| Secret | Usage |
|---|---|
| `VPS_HOST` | adresse du VPS Infomaniak |
| `VPS_USER` | utilisateur de déploiement, non root |
| `VPS_SSH_KEY` | clé privée dédiée au déploiement |

Créer l'environnement `production` et y exiger une approbation manuelle : le déploiement passe alors par une validation explicite.

`GITHUB_TOKEN` suffit pour publier l'image dans GHCR, aucun secret supplémentaire.

## 4. Préparer le VPS

```bash
ssh <user>@<vps>
sudo mkdir -p /srv/immipro && sudo chown $USER /srv/immipro
cd /srv/immipro
# copier docker-compose.prod.yml et créer .env.app, .env.db, .env.minio
# à partir de .env.example — ces fichiers ne sont jamais versionnés
docker login ghcr.io -u <votre-compte>
```

### Brancher la messagerie et l'antivirus (pilote fermé)

Les deux se branchent par `.env.app` ; aucun code n'est à écrire.

**Antivirus.** `docker-compose.prod.yml` porte les services `clamav` et
`antivirus` (S.96). Le déploiement ne recopie pas ce fichier : après une
modification, le recopier sur le VPS. Puis, dans `.env.app` :

```bash
ANTIVIRUS_URL=http://antivirus:8080/balayer
```

Au premier démarrage, `clamav` télécharge ses signatures (une à deux
minutes, environ 1,5 Go de mémoire ensuite). `docker compose ps` montre
`antivirus` en bonne santé quand le démon répond. Le worker présente le
fichier d'essai EICAR au démarrage puis toutes les heures : l'état de
service (`/api/health`) passe le balayage à `OPERATIONNELLE` quand le
fichier est reconnu.

**Messagerie.** Un compte chez un fournisseur SMTP transactionnel, avec un
domaine d'envoi authentifié (SPF, DKIM, DMARC) — sans quoi les courriels de
vérification finissent en indésirables. Puis, dans `.env.app` :

```bash
SMTP_URL=smtps://<identifiant>:<mot-de-passe>@<hote>:465   # ou smtp://…:587 (STARTTLS)
SMTP_FROM=ImmiPro <ne-pas-repondre@<votre-domaine>>
```

Le worker vérifie la connexion au démarrage puis toutes les heures, sans
envoyer de message ; `/api/health` passe la messagerie à `OPERATIONNELLE`
quand elle aboutit.

Après ces deux réglages : `docker compose -f docker-compose.prod.yml up -d`.

Durcissement minimal avant la première mise en ligne : `ufw` limité aux ports 22, 80 et 443, authentification SSH par clés uniquement, `fail2ban`, `unattended-upgrades`.

## 5. Étiquettes d'issues

À créer : `écran`, `référentiel`, `bug`, `workflow`, `sécurité`, `RGPD`, `dette`.

## 6. Ce qui reste à faire avant la première ligne de fonctionnalité

- [ ] `npm install` puis `npx prisma migrate dev --name init`
- [ ] Créer le bucket MinIO `immipro-documents` en accès privé
- [ ] Lancer `npm run seed:rules` et vérifier que la fiche Émirats reste en `DRAFT`
- [ ] Renseigner les clés FedaPay en bac à sable
- [ ] Ouvrir une issue par écran du lot P0 de DOC-12
