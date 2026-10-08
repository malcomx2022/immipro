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
| `VPS_KNOWN_HOSTS` | ligne `known_hosts` de l'hôte, relevée depuis la console du fournisseur — le déploiement refuse un hôte inconnu |
| `VPS_PORT` | facultatif, 22 par défaut |
| `STRIPE_SANDBOX_API_KEY`, `FEDAPAY_SANDBOX_API_KEY` | facultatifs, clés de bac à sable pour l'étape `sandbox:paiement` |

Le déploiement passe par `ssh` et `scp` natifs, recopie `docker-compose.prod.yml` et `scripts/deployer.sh`, puis lance ce dernier : `docs/exploitation/deploiement.md`.

Créer l'environnement `production` et y exiger une approbation manuelle : le déploiement passe alors par une validation explicite.

`GITHUB_TOKEN` suffit pour publier l'image dans GHCR, aucun secret supplémentaire.

## 4. Préparer le VPS

```bash
ssh <user>@<vps>
sudo mkdir -p /srv/immipro && sudo chown $USER /srv/immipro
cd /srv/immipro
# créer .env.app, .env.db, .env.minio à partir de .env.example, et
# .env.sauvegarde (BACKUP_GPG_RECIPIENT) — ces fichiers ne sont jamais
# versionnés. docker-compose.prod.yml et scripts/deployer.sh sont recopiés
# par chaque déploiement (docs/exploitation/deploiement.md).
docker login ghcr.io -u <votre-compte>
```

### Stockage des pièces : l'adresse publique (S.98)

Le navigateur dépose et lit les pièces par des URL présignées. Elles sont
signées pour l'adresse que **le navigateur** joint, distincte de celle du
serveur :

```bash
MINIO_ENDPOINT=minio                              # le serveur, sur le réseau Docker
MINIO_PUBLIC_URL=https://stockage.<votre-domaine> # le navigateur, en https
```

Côté VPS : un enregistrement DNS pour ce sous-domaine, un vhost nginx en
HTTPS qui relaie vers `127.0.0.1:9000` **en préservant l'en-tête `Host`**
(la signature SigV4 porte l'hôte), le port 9000 de Garage publié en
boucle locale seulement, et une règle CORS qui n'autorise que l'origine
du site (`PUT`, `GET`, préliminaire `OPTIONS`). Sans `MINIO_PUBLIC_URL`
en production, le dépôt d'une pièce refuse avec un message qui la nomme.

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

#### Avec Brevo

Relevé le 01/10/2026 dans la documentation de Brevo. Les menus et les
offres changent : en cas d'écart, la console de Brevo fait foi.

1. **Authentifier le domaine** (*Expéditeurs, domaines et IP dédiées* →
   *Domaines*). Recopier chez l'hébergeur DNS les trois enregistrements
   affichés, propres à chaque domaine :
   - le **code Brevo** (TXT), qui prouve la propriété du domaine ;
   - le **DKIM** : deux CNAME, `brevo1._domainkey` et `brevo2._domainkey` ;
   - le **DMARC** (TXT sur `_dmarc`). Pour commencer :
     `v=DMARC1; p=none; rua=mailto:dmarc@<votre-domaine>`.

   Attendre que Brevo affiche « Value matched » sur les trois. Une
   inclusion SPF n'est pas nécessaire : sur les IP partagées de Brevo,
   c'est la signature DKIM qui aligne le domaine pour DMARC.
2. **Créer l'expéditeur** (*Expéditeurs*) sur ce domaine, par exemple
   `notifications@<votre-domaine>`. Une adresse hors du domaine
   authentifié est refusée à l'envoi.
3. **Générer une clé SMTP** (*Paramètres* → *SMTP & API* → onglet
   *SMTP*), et noter :
   - le **login** affiché sur cette page, de la forme
     `xxxxxxx@smtp-brevo.com`, qui n'est pas l'adresse du compte ;
   - la **clé SMTP**, qui commence par `xsmtpsib-`. La clé API v3 ne
     fonctionne pas ici : c'est l'erreur la plus fréquente.

Dans `.env.app` :

```bash
# 587 + STARTTLS, recommandé par Brevo. Le « @ » du login s'écrit %40.
SMTP_URL=smtp://xxxxxxx%40smtp-brevo.com:xsmtpsib-<cle>@smtp-relay.brevo.com:587
SMTP_FROM=ImmiPro <notifications@<votre-domaine>>
```

- Un caractère spécial dans la clé (`/`, `:`, `#`, `?`, `%`) s'encode
  aussi : `python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=""))' '<cle>'`.
- Si l'hébergeur bloque le port 587 :
  `smtps://…@smtp-relay.brevo.com:465`. Le schéma `smtps` chiffre dès la
  connexion.

Vérifier ensuite, après `docker compose -f docker-compose.prod.yml up -d` :

```bash
docker compose -f docker-compose.prod.yml logs worker | grep sondes
```

La sonde s'authentifie sans envoyer de message. En cas d'échec, le journal
dit la cause (authentification refusée, hôte injoignable) sans jamais
citer la clé. Faire enfin un essai réel : un compte créé sur le pilote doit
recevoir son courriel de vérification, et pas dans les indésirables.

Avant d'ouvrir le pilote, vérifier le quota d'envoi quotidien de l'offre
Brevo choisie : il doit couvrir les vérifications, les confirmations et
les rappels.

Après ces deux réglages : `docker compose -f docker-compose.prod.yml up -d`.

Durcissement minimal avant la première mise en ligne : `ufw` limité aux ports 22, 80 et 443, authentification SSH par clés uniquement, `fail2ban`, `unattended-upgrades`.

## 5. Étiquettes d'issues

À créer : `écran`, `référentiel`, `bug`, `workflow`, `sécurité`, `RGPD`, `dette`.

## 6. Ce qui reste à faire avant la première ligne de fonctionnalité

- [ ] `npm install` puis `npx prisma migrate dev --name init`
- [ ] Créer le bucket MinIO `immipro-documents` en accès privé
- [ ] Lancer `npm run seed:rules` et vérifier que la fiche Émirats reste en `DRAFT`
- [ ] En production, charger le même référentiel depuis l'image, une fois : `docker compose -f docker-compose.prod.yml run --rm app node dist/graine-regles.js`. B-02 publie une règle existante mais n'en crée pas : sans ce chargement, aucune destination n'est ouverte. Le déploiement ne le relance pas, pour ne pas écraser ce que B-02 et la veille ont changé.
- [ ] Renseigner les clés FedaPay en bac à sable
- [ ] Ouvrir une issue par écran du lot P0 de DOC-12
