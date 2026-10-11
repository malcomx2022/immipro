# Instructions projet — ImmiPro

À lire avant toute contribution, humaine ou assistée.

## Invariants — non négociables

| # | Règle |
|---|---|
| INV-1 | La plateforme informe et prépare. Elle ne conseille pas juridiquement et ne se prononce jamais sur les chances d'obtention d'un visa. |
| INV-2 | Aucune promesse de résultat, nulle part : interface, emails, documents générés, contenu marketing. |
| INV-3 | Un dossier fige la version de règle utilisée (`Application.visaRuleId`). Une évolution réglementaire ne casse jamais une checklist en cours. |
| INV-4 | Une règle de source `SECONDAIRE` n'est jamais visible par l'utilisateur. Le filtrage se fait dans la requête, pas dans l'affichage. |
| INV-5 | Les pièces d'identité sont purgées automatiquement selon la politique de rétention. |
| INV-6 | Tout appel IA est débité d'un quota d'analyses rattaché au pack ; les jetons consommés sont mesurés et surveillés. Jamais de dépassement silencieux. |
| INV-7 | Tout paiement est idempotent et réconcilié par webhook signé. |
| INV-8 | Toute information réglementaire affichée porte sa source et sa date de vérification. |

## Vocabulaire interdit dans le code et l'interface

La liste vit dans `src/domain/copy/vocabulaire-interdit.ts`. Elle est lue par
`npm run check:copy`, par le test de l'interface candidat, et par la
validation à l'enregistrement du back-office — B-02 pour les textes d'une
règle, B-05 pour le message envoyé après une revue manuelle, B-08 pour un
guide pays ou un article. Une seule liste, quatre points d'application : un
administrateur qui saisit une promesse dans un guide pays bute sur la même
règle qu'un développeur, et sa publication est bloquée tant que la
formulation est refusée.

L'enregistrement d'un brouillon n'est pas bloqué, la publication l'est. Un
texte en cours d'écriture doit pouvoir être sauvé ; le refuser pousserait à
rédiger ailleurs et à coller à la fin, c'est-à-dire à écrire hors du
garde-fou.

Deux portées :

- **Partout** — les promesses de résultat : « chances d'obtention », « taux
  d'acceptation », « visa garanti », « visa assuré », « réussite garantie »,
  « sans risque de refus », « on s'occupe de tout », « nous déposons votre
  dossier », « nous vous conseillons juridiquement », « notre avocat ».
- **Interface candidat seule** — le vocabulaire de la note de dossier :
  « score », « chances », un pourcentage, « sur 100 ». Ils restent légitimes
  dans `domain/completeness/`, où le barème interne vit sans jamais s'afficher.

Deux issues, et deux seulement :

1. **La négation est reconnue.** « ImmiPro ne garantit pas l'obtention du
   visa » passe : une négation ne peut pas devenir une promesse. La portée
   s'arrête à la proposition — « Pas de doute, visa garanti » reste refusé.
2. **`copy-exceptions.json`** pour le reste : chaîne exacte, chemin, motif,
   date. L'échappatoire apparaît dans la diff et se justifie. Au-delà de cinq
   entrées, ce n'est plus une exception, c'est une dérive du vocabulaire.

Le score affiché s'appelle **complétude du dossier**. Jamais autre chose.

## Messages d'erreur

Un message d'échec est toujours actionnable.

- Non : « Document non conforme. »
- Oui : « Votre passeport expire 4 mois après la date de retour prévue, il en faut 6. »

## Règles d'architecture

1. `src/domain/` ne connaît ni Prisma, ni Next, ni le réseau. Logique pure, testée sans infrastructure.
2. Tout ce qui est vérifiable sans IA l'est sans IA. L'IA n'intervient que sur l'extraction et la cohérence narrative.
3. Aucune valeur de couleur, d'espacement ou de rayon en dur : uniquement les tokens Tailwind.
4. Aucun accès direct à MinIO depuis le client. URLs présignées de 5 minutes, générées à la demande.
5. Les webhooks sont exclus du rate limiting mais leur signature est vérifiée systématiquement.
6. Aucun secret dans le dépôt. `.env.example` liste les clés, jamais les valeurs.

## Avant d'ouvrir une pull request

- [ ] `npm run lint && npm run typecheck && npm run test && npm run check:copy`
- [ ] La règle de gestion de DOC-11 implémentée est citée dans la description
- [ ] Les états vide, chargement et erreur sont traités
- [ ] Aucune chaîne de caractères en anglais dans l'interface

## Suivi du chantier fonctionnel — 09/10/2026

### Revue complète du 11/10/2026 — REV11

**S.175 / REV11-L4 — relecture exclusive par version.** Autorisation « L4 »,
main `2066230` relu avant modification : #283/L3 fusionné, arbitrage Claude
#282 et version L2 #280 conservés, aucune PR concurrente au démarrage.
Lire [le suivi L4](docs/revue/lot-l4-2026-10-11.md) et
[réservation, fournisseur et exploitation](docs/exploitation/relecture-concurrente.md).
Conserver le verrou du grand livre/FIFO : réservation durable et débit
atomiques avant réseau, une seule `EN_COURS` par version. Le second onglet
consulte sans POST payant, même à quota 1. Aucune transaction SQL pendant
l'appel. Usage L2 avant refus/publication ; contrôles d'avis L3 inchangés.
Date, remarques, débit soldé et fin du jeton dans la même transaction ;
propriété/échéance/version courante vérifiées dans l'écriture. Une réponse
ancienne/expirée ne publie pas, ne touche pas au débit de la reprise ; une
version remplacée rend le débit encore dû (A-2). Reprise horaire S.153 et
reprise explicite après échéance ferment le jeton avec son rendu unique.
Migration additive avant app/worker, drainage des anciens processus ; aucun
backfill de réservations anciennes sans preuve, aucun grand livre effacé.
Conserver DIA-07 inchangé, `smoke:relecture-exclusive`, L2/L3 et diagnostics
IA dans la porte commune. Pas de garantie d'appel fournisseur unique après
arrêt brutal et reprise : ne pas inventer les jetons perdus. D1, INV-1/2/6,
WF-08/RG-08.10, R-04/B-07. Proposition sans fusion/déploiement ni levée Q.A/M.C.
Prochain lot : L5, qualification réelle des fournisseurs ; mobile B-07 reste L7.

**S.174 / REV11-L3 — validité des avis.** Autorisation « L3 », base
`3d985f8` : L2 #280 fusionné, arbitrage Claude #282 conservé ; les règles
de #280 font foi, ne pas réintroduire la version #281.
Lire [le suivi L3](docs/revue/lot-l3-2026-10-11.md) et
[le contrat des avis](docs/exploitation/avis-ia.md).
Politique : une seule remarque invalide refuse tout l'avis, même liste
mixte ; aucune troncature au-delà de huit. Une vraie liste vide est valide.
Genres produits uniquement, titres/corps et deux sources/valeurs d'une
incohérence non blancs, autres genres sans écarts. Vocabulaire commun sur
tous les champs affichés. Deux adaptateurs + garde de publication dans
la route ; motif candidat `avis_mal_forme`, formulation refusée conservée.
Usage L2 enregistré avant refus, aucune date ni remarque publiée,
réservation rendue une fois et aucun rejeu automatique pour ce motif.
Ne pas requalifier les avis historiques sans réponse source. Conserver
DIA-05/CTRL-02 et `smoke:avis-ia` dans la porte commune. D1, INV-1/2/6,
WF-08/RG-08.4/08.9. DIA-07/concurrence reste L4 ; mobile B-07 reste L7.
Proposition sans fusion/déploiement ni levée Q.A/M.C. Prochain lot : L4.

**S.173 / REV11-L2 — mesure des usages.** Autorisation « L2 », main
`47b39b0` relu : S.171/S.172 et #278 intégrés, aucune PR concurrente au
démarrage. Base finale `16636d4` : #279 conserve le relevé Claude du
déploiement pilote L1 ; aucun changement de code par ce relevé. Lire [le suivi L2](docs/revue/lot-l2-2026-10-11.md) et
[la procédure de mesure](docs/exploitation/mesure-ia.md).
Politique de publication retenue : réponse reçue sans mesure complète
valide → aucune publication automatique, revue humaine en extraction,
aucun texte/avis daté en rédaction ; quota réellement dû rendu, sans
relance automatique pour cette cause. D1 reste en analyses.
Conserver le validateur pur et les états `CONNUE`, `PARTIELLE`, `INCONNUE`,
`INVALIDE` ; inconnus en `NULL`, vrai zéro enregistré, mesure conservée
avant validation du contenu et après interruption du flux. Ne pas
réécrire les états nuls historiques. B-07 signale le rapprochement et
son export distingue les inconnus. Migration avant app/worker ;
`smoke:usages-ia` dans la porte, diagnostic en lecture seule dans l'image.
DIA-01/02/03 passent ; DIA-05 reste L3, DIA-07 reste L4. Aucune attente
historique des tests de transport Claude n'est assouplie. Mobile B-07
390 px : débordement à reprendre en L7. Proposition L2 sans fusion,
déploiement ni levée Q.A/M.C. Prochain lot : L3.

**S.172 / complément REV11-L1, PR #277.** Claude a ouvert #276 / S.171
pendant le travail L1. Cette proposition est désormais basée sur sa branche
`claude/elegant-dijkstra-86egeb`, sans remplacer son lot ou son arbitrage.
Conserver `AI_OPENAI_ORIGINE_AUTORISEE` : l'origine des pièces compatibles
doit être celle explicitement autorisée ; le banc la neutralise.
Le complément ajoute la suppression du corps/en-têtes 3xx avant le SDK,
les logs SDK coupés et les preuves worker/quota/rejeu/rendus C-08/B-05.
Voir [suivi L1](docs/revue/lot-l1-2026-10-11.md) et
[destination IA](docs/exploitation/destination-ia.md). L'origine est une
garde automatique, mais ne prouve pas société, région ou DPA. Le manifeste
complémentaire reste une comparaison manuelle pour L5. DIA-04/06 passent ;
DIA-01/02/03/05 et DIA-07 restent à corriger. D1 reste en analyses.
Prochain lot L2, sans inventer de mesures historiques. S.171 et S.172 sont
des propositions distinctes ; aucun déploiement ou préalable Q.A/M.C
n'est attesté ici.

**Démarrage des corrections, S.170 / REV11-L0.** Le responsable a demandé le
11/10 de commencer en dix lots prioritaires. Lire le
[suivi L0](docs/revue/lot-l0-2026-10-11.md) et ses preuves. Cette proposition
reprend main `d4fb08c` (#273 et #274 fusionnées), conserve Prisma 7 et pg-boss 12.
Elle isole l'environnement du banc, contrôle son propre démarrage et arrête
ses enfants/services après échec. `smoke:recette` rejoint la porte commune.
DIA-06 passe ; DIA-01 à DIA-05 et DIA-07 restent rouges, sans attentes assouplies.
Le 503 de paiement attendu est toléré seulement par le banc ; la santé de
production reste inchangée. Le script `recette-documentaire.py` rejoue une
nouvelle version sur un banc neuf puis vérifie le quota et la décision humaine.
S.170 est fusionné (PR #275) ; déploiement et lancement restent des états
distincts.

**S.171 / REV11-L1, destination des documents.** Aucune redirection n'est
suivie (compatible, jeton Google, client Anthropic) : une 3xx devient
`non_configure`. Arbitrage du 11/10 : l'autorisation des pièces chez un
fournisseur compatible désigne l'origine validée (`AI_OPENAI_ORIGINE_AUTORISEE`,
égale à celle de `AI_OPENAI_URL`). Ne pas rouvrir ce choix. Poursuivre par
L2, après relecture de main et du registre.

Lire la [revue complète](docs/revue/revue-complete-2026-10-11.md), le
[chantier](docs/revue/chantier-complet-2026-10-11.md) et la
[documentation IA/workflows](docs/IA-workflows.md) après les décisions du
registre. Base initiale : `bbf1500` / S.168 ; base finale : `ec32f65` / S.169.
S.167 / PR #268 et S.169 / PR #272 (Prisma 7) sont fusionnées.
Conserver leur code, le client Prisma et ses outils. Aucun chantier concurrent
de dépendances ne doit remplacer les corrections fonctionnelles proposées.

REV11 apporte une revue, des diagnostics et un plan avant intégration ;
elle ne corrige pas les cinq groupes d'anomalies IA reproduits. Les
diagnostics manuels `scripts/recette/diagnostic-ia.mts` et
`diagnostic-relecture.mts` expriment les résultats voulus et sont encore
rouges. Les faire passer par une correction puis les intégrer à la porte
du lot concerné ; ne pas modifier leurs attentes pour accepter le défaut.

Conserver D1 : quota en **analyses**, jetons pour consommation et marge.
Une mesure inconnue n'est pas une consommation nulle. Un parseur JSON ne
prouve pas la vérité des champs extraits. Vérifier destination des octets,
validité d'un avis et revendication de la relecture par version, au-delà
du verrou du grand livre. Le banc sans fournisseur doit aussi neutraliser
Vertex et vérifier son propre démarrage (REV-BANC-01) ; les simulations
ne prouvent ni DPA, ni modèle réel, ni paiement.

Les lots REV11-L0 à L9 sont un ordre de travail proposé, pas des numéros
S.xxx réservés. Ne marquer un préalable levé qu'avec sa preuve réelle ;
les règles Q.A/M.C et les reports V2 restent inchangés.

L'autorisation initiale RF-0 (09/10) portait sur les documents ; sa PR #244
est fusionnée. Claude Code a ensuite réalisé les lots jusqu'à S.166.
A-1 et A-3 sont tranchés en S.146, A-2 en S.147 : relire leurs décisions
au registre, sans redemander des choix déjà rendus.

Le 10/10, le responsable a demandé de revoir les travaux récents, puis de
corriger les bugs front et backend et d'actualiser les documents. Cette
instruction autorise le lot complémentaire RC / S.167 décrit dans la
[revue du 10/10](docs/revue/revue-complementaire-2026-10-10.md).
Les autorisations et décisions déjà consignées restent acquises.

Ordre de lecture : ce fichier, [DOC-11](docs/DOC-11-workflows.md),
[DOC-12](docs/DOC-12-prototype.md), les dernières décisions du
[registre](docs/prototype/ECARTS-A-ARBITRER.md), le
[plan historique](docs/revue/plan-de-traitement-2026-10-07.md), puis la
[revue fonctionnelle](docs/revue/revue-fonctionnelle-2026-10-09.md) et le
[chantier RF](docs/revue/chantier-fonctionnel-2026-10-09.md), puis la
[revue complémentaire](docs/revue/revue-complementaire-2026-10-10.md).

Base du lot 0 : main dd2b58f, S.125 à S.144 intégrés. Claude Code a livré
S.142 (Stripe-Version et dépendances SMTP, PR #241), S.143 (ESLint plat,
PR #242) et S.144 (Next 16, PR #243). Relire main et les PR ouvertes avant
chaque lot ; conserver ces changements et leurs décisions.
Base initiale de la revue du 10/10 : main 065bde4/S.165. La PR #267/S.166
(pg-boss 11 et transfert), initialement en brouillon, a été fusionnée
pendant la validation. Base finale de RC/S.167 : main 9ade7ea/S.166 ;
conserver le schéma neuf, le transfert et les preuves de ce lot.
Les identifiants
RF ne réservent aucun numéro S.xxx : attribuer celui-ci au démarrage d'un
lot applicatif, après vérification du registre et du travail en cours.

Trois preuves distinctes : code implémenté, parcours éprouvé, préalable de
lancement levé. Une PR ouverte reste proposée ; une fusion ne démontre ni
recette ni déploiement. Un contrôle non exécuté reste « non vérifié ».

Pour chaque lot applicatif autorisé :

- une PR, une entrée de suivi, un rattachement WF/RG/écran et les écarts restants ;
- reproduction du comportement, puis test du résultat voulu ; courses et
  interruptions éprouvées sur une base jetable ;
- conserver FON-01 à FON-04, E5 et C-05/M11 corrigés en S.146 à S.148
  et S.155 ; ne les rouvrir qu’avec une nouvelle reproduction ;
- rattacher un signalement à l’identité de la lecture affichée ; un
  champ de même nom ne prouve pas que la lecture est la même ;
- rattacher une réponse asynchrone B-05 à sa demande et sa pièce ;
  conserver la saisie suivante après une décision tardive ;
- ne rendre que le débit réel encore dû : le grand livre fait foi,
  et décision, rendu, avis et audit tiennent dans la même transaction ;
- garder l'historique des anciennes pièces ; empêcher ses effets sur la
  pièce courante ; partager la règle de reprise gratuite et respecter les
  états figés lors d'un arbitrage ;
- diagnostiquer les données antérieures sans réécrire les règles figées,
  le journal ou les pièces comptables ; attribuer et tracer les traitements ;
- conserver les reports V2 de DOC-11 §0 et les huit invariants ci-dessus ;
- Q.A commande l'ouverture publique, M.C l'encaissement réel ; leur levée
  exige les validations et preuves prévues, au-delà de la présence du code.

Appliquer la porte de qualité de `.github/workflows/validation.yml` et
les critères du chantier : verrou, check, audit, build, schéma, migrations,
garde-fous et fumées concernés ; image si les artefacts ou le déploiement
changent. Documenter les résultats dans le lot. RF-0 ne modifie aucun code,
schéma, drapeau commercial ou service ; sa validation ne certifie pas la V1.
