# Protocole de recette sur l'instance pilote — RF-5

Lot S.159, choix du responsable du 09/10/2026 : contrôles sans écriture
faits depuis la session de développement, puis ce protocole pour tout ce
qui demande un compte, l'administration, un téléphone, le VPS ou FedaPay.

Il n'existe pas de préproduction distincte. La recette se fait donc sur
`immipro.app`, instance pilote (`/api/health` → `"pilote"`). Chaque étape
dit ce qu'elle écrit en base, et comment l'effacer.

Chaque résultat se reporte dans `docs/recette/matrice-v1.md`, sous la
ligne indiquée : attendu, observé, preuve (capture, sortie de commande),
date et nom. Une étape non déroulée reste « non vérifié ».

## 0. D'abord : la règle CORS du stockage (anomalie R-E01, levée le 10/10/2026)

Sans elle, aucune pièce ne peut être déposée depuis un navigateur. Tant
qu'elle n'est pas posée, les étapes 4 et 5 échouent.

1. Sur le VPS, suivre la procédure de `docs/INSTALLATION-GITHUB.md`,
   paragraphe « La règle CORS des deux seaux (S.159) ». Elle a été éprouvée
   sur Garage v2.4.1 :
   - droit `owner` temporaire pour la clé ;
   - pose de la règle par `aws-cli` ;
   - retrait du droit `owner`.
2. Depuis n'importe quel poste, faire les deux `curl` de vérification de ce
   paragraphe. Attendu :
   - **200**, avec `access-control-allow-origin: https://immipro.app` ;
   - puis **403** pour une origine étrangère.
3. Reporter le résultat sous **R-P08**.

Écrit : la règle CORS des deux seaux, et rien d'autre.

## 1. L'état de service détaillé (R-P11)

Connecté en administrateur, ouvrir `https://immipro.app/api/health`.
Relever :

- `aptitude`, `bloquantes`, `reserves` ;
- `facturation.obstacles` : en bac à sable, la série d'essai ;
- `certifications.enAttente` : 0 attendu ;
- `analyses.enAttente`, `divergences.enRetard`, `taches`.

Toute bloquante doit être expliquée.

Écrit : rien.

## 2. Certificats et nginx (R-P01)

Depuis votre poste, pas depuis la session de développement : son proxy de
sortie présente son propre certificat, qui masque celui du serveur.

```bash
for h in immipro.app www.immipro.app stockage.immipro.app; do
  echo | openssl s_client -servername $h -connect $h:443 2>/dev/null \
    | openssl x509 -noout -subject -issuer -enddate
done
```

Attendu : émetteur Let's Encrypt, les trois noms couverts, échéance à
plus de 30 jours.

Puis, sur le VPS :

- `sudo certbot renew --dry-run` doit réussir ;
- `sudo nginx -T | head -50` doit montrer les fichiers du dépôt
  (`nginx/immipro.conf`, `nginx/stockage.conf`).

Écrit : rien.

## 3. Services (R-P12)

Sur le VPS :

```bash
cd /srv/immipro
docker compose -f docker-compose.prod.yml ps
docker stats --no-stream
```

Attendu : six services `healthy`, et les limites de mémoire visibles dans
`docker stats` (M15).

Dans le journal du worker
(`docker compose -f docker-compose.prod.yml logs --since 1h worker`),
chercher :

- le battement ;
- les sondes `[sondes]` : `messagerie`, `antivirus` ;
- une réconciliation récente.

Écrit : rien.

## 4. Parcours candidat, sur téléphone Android (R-P13 à R-P17)

Utiliser une adresse de courriel de recette que vous lisez.

| Étape | Geste | Attendu | Ligne |
|---|---|---|---|
| a | Simulateur, puis inscription, code reçu, vérification | Code reçu en moins d'une minute ; tableau de bord à 390 px, sans défilement horizontal | R-P13 |
| b | Ouvrir un dossier ; achat d'essai FedaPay (bac à sable) | Retour de paiement ; reçu ; facture `ESSAI-RD-…` lisible ; analyses créditées | R-P14 |
| c | Déposer une pièce saine par « Prendre une photo » (appareil photo Android) | « Ton fichier … est bien arrivé », contrôle, puis lecture ou relecture humaine ; aperçu en B-05 | R-P15 |
| d | Déposer le fichier d'essai EICAR (68 octets de texte, enregistré en `.pdf`) | « Fichier écarté au contrôle », fichier non conservé, aucune analyse débitée | R-P16 |
| e | Sur une pièce lue, « Signaler une erreur de lecture », puis « Voir l'historique des versions » | Mention « Ton signalement est enregistré » ; historique listé | R-P17 |
| f | Couper le réseau pendant un envoi, puis le rétablir | Bandeau « Connexion perdue », puis envoi reparti seul (S.157) | R-P17 |

Écrit :

- le compte de recette, son dossier, ses pièces, ses alertes ;
- la transaction et la facture d'essai, qui sont conservées : la base
  interdit de supprimer une pièce comptable ;
- les lignes du journal.

À effacer : par « Supprimer mon compte » (`/compte/suppression`) une fois
la recette signée. Les pièces sont purgées par la suppression du compte ;
la facture d'essai et le journal restent, comme le veut la règle.

## 5. Parcours opérateur (R-P18, R-P19)

| Étape | Geste | Attendu | Ligne |
|---|---|---|---|
| a | B-05 : ouvrir la pièce de l'étape 4c ou 4e, avec un motif | Aperçu présigné affiché ; `piece.consultation` au journal (B-06) | R-P18 |
| b | Écrire « visa garanti » dans le message | Enregistrement bloqué, avec la consigne INV-2 | R-P18 |
| c | Trancher « Conforme » avec un vrai message | Côté candidat, C-08 affiche « Conforme » et le message (S.157) ; alerte reçue | R-P18 |
| d | B-04 : relire la transaction de l'étape 4b | Ligne rapprochée ; aucun bandeau « Certification en attente » en bac à sable | R-P19 |

Écrit : la décision, les lignes du journal, l'alerte.

## 6. Clavier et TalkBack (R-I02)

Dérouler le protocole d'essai TalkBack du prototype
(`docs/prototype/ImmiPro Protocole d'essai TalkBack.dc.html` : les douze
vérifications) sur le parcours de l'étape 4, puis la même chose au
clavier seul sur un ordinateur.

Écrit : comme l'étape 4.

## 7. Répétition du runbook de déploiement (R-P20)

Faire les trois répétitions de `docs/exploitation/deploiement.md` :

- déploiement d'une étiquette ;
- retour arrière vers l'étiquette précédente ;
- restauration de la sauvegarde d'avant migration sur une base isolée.

Relever les durées et les sorties.

Écrit : selon le runbook ; rien de métier.

## 8. Signer

Quand chaque ligne de la matrice porte un statut, signer le bloc
« Signature » de `docs/recette/matrice-v1.md`. Une ligne « non vérifié »
n'empêche pas de signer si elle est assumée et nommée. Elle empêche de
dire que la recette la couvre.
