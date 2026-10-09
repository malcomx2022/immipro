# Chantier de correction et de finalisation — ImmiPro
Date : 9 octobre 2026. **RF-0 autorisé ; RF-1 livré en S.146 (A-1, A-3) ; RF-2 livré en S.147 (A-2) ; RF-3 livré en S.148 ; RF-4 autorisé le 09/10, diagnostics proposés en S.149 ; RF-5 à RF-7 planifiés.**

Base du lot documentaire : main dd2b58f / S.144. S.142 à S.144 (PR #241 à #243) sont fusionnés : Stripe-Version, ESLint plat, Next 16. La revue initiale reste épinglée à main 3f089c2/S.141. Aucun numéro S.xxx n'est réservé ; le numéro d'un lot applicatif sera attribué après lecture du registre et des PR en cours.

Références : [revue fonctionnelle](revue-fonctionnelle-2026-10-09.md), CLAUDE.md, DOC-11, DOC-12 et plan de traitement du 07/10 §7. Ce plan complète le chantier existant ; les corrections S.125–S.144 ne sont pas rouvertes sans reproduction d'un écart.

## 1. Ordre proposé

| Ordre | Lot | Objet | Dépendances | Sortie attendue |
|---|---|---|---|---|
| 0 | RF-0 — Consignes et traçabilité | Mettre à jour les consignes et la traçabilité | Autorisé : « lot 0 » | Claude Code connaît la base, les travaux fusionnés, les écarts et les jalons ; aucun brouillon assimilé à une livraison. |
| 1 | RF-1 — Dossiers | FON-01, FON-04, établissement M11/FON-05 | Choix A-1 et A-3 | Une clôture libère une place ; pause comptée ; plafond atomique ; aucun dossier figé réactivé par arbitrage. |
| 2 | RF-2 — Versions de pièces | FON-02 : analyse, balayage et revue humaine | RF-1, choix A-2 | Une ancienne version ne change ni la pièce courante ni sa complétude ; historique conservé. |
| 3 | RF-3 — Quota et reprises | E5 interruption, FON-03 reprise gratuite | Règle de version RF-2 | Arrêt/rejeu sans double débit ; gratuité après ILLISIBLE tenue à solde nul. |
| 4 | RF-4 — Historique, purge et supervision | C1, E4, E6, E7, M1, M4, M7 ; commande de purge de restauration | RF-2 et RF-3 | Données antérieures diagnostiquées ; objets orphelins traités explicitement ; retards visibles ; restauration suivie de purge. |
| 5 | RF-5 — Recette V1 et pilote fermé | Parcours candidat et opérateur, formulaires BO, mobile, reprise réseau, déploiement | RF-1 à RF-4 | Matrice de recette signée ; services et alertes éprouvés ; défauts bloquants fermés. |
| 6 | RF-6 — Ouverture publique et encaissement | Q.A, M.C, facture normalisée, TVA, D-14, preuves fournisseur | Spécifications officielles et validations métier ; RF-5 | Pages réellement publiées ; contact tenu ; facture et avoir certifiés ; paiement commercial prêt. |
| 7 | RF-7 — Maintenance | Suite de M19 après S.144, M20, F10 | Coordination Claude Code ; fiabilisation achevée | Changements séparés, sans mélange de règles métier et de montée majeure. |

La préparation Q.A/M.C et la collecte des preuves VPS peuvent avancer pendant les corrections. Le circuit fiscal ne peut pas être développé sans sa spécification. S.142 à S.144 sont déjà fusionnés ; le chantier poursuit la maintenance restante sans dupliquer ces étapes.

## 2. Fiches de lot

### RF-0 — Documentation autorisée

**Livrables :**

- CLAUDE.md : ordre de lecture, continuité avec S.144, autorisation limitée à RF-0, preuves et porte de qualité ; huit invariants conservés.
- DOC-11 : route réelle de statut, analyses vendues/restantes, fournisseur choisi par l'exploitant et cache sans nouveau débit.
- Plan du 07/10 §8 et registre : suivi RF-0, travaux Claude Code fusionnés conservés, choix A-1 à A-3 ouverts.
- Documents de revue, chantier et validation : constats, ordre, scénarios, preuves et limites.

**Migration :** aucune. **Vérification :** diff exclusivement documentaire, invariants identiques à main, liens relus et contrôles consignés dans [validation](validation-2026-10-09.md). Les tests de reproduction préparatoires ne sont pas intégrés. RF-0 ne certifie pas la V1 et n'autorise pas les lots suivants. **Effort indicatif :** une demi-journée avec revue.

### RF-1 — Dossiers et données du formulaire

**Règles :** C-01, WF-04, WF-10, WF-11, INV-3.
1. Définir une liste unique d'états ouverts, cohérente entre domaine et API : BROUILLON, ACTIF, PRET, SUSPENDU ; les dossiers déposés et terminés restent dans l'historique sans consommer une place.
2. Prendre un verrou par candidat et effectuer décompte + création dans la même transaction. Diagnostiquer auparavant les comptes déjà au-delà du plafond.
3. Interdire la migration sur les états figés dans le service et relire l'état dans la transaction ; tenir contre une déclaration de dépôt concurrente.
4. Appliquer le choix A-1 : retirer l'établissement et sa promesse d'édition ultérieure, ou réaliser une donnée persistée complète dans un sous-lot.

**Données existantes :** pas de clôture forcée ni de suppression. **Migration :** aucune a priori si l'établissement est retiré.
**Tests :** historique clôturé, pause, plafond, deux ouvertures simultanées, MIGRER sur chaque état figé, dépôt concurrent.
**Fumées :** smoke:transitions, smoke:depot ; ajouter les cas de plafond et d'arbitrage à leurs scénarios pertinents.
**Effort indicatif :** 1 à 2 jours, hors conservation du champ établissement.

### RF-2 — La version courante commande les effets

**Règles :** WF-06, WF-07, WF-15, traçabilité des pièces.
1. Identifier tous les écrivains de Document.status, feedback et extracted autour du dépôt, du balayage, de l'analyse et de la revue humaine.
2. Ajouter une règle commune de version courante et de dossier modifiable. Un test en tête seul ne suffit pas : le candidat peut remplacer le fichier pendant l'appel.
3. Tenir la garde dans la transaction qui applique le verdict, avec le même mécanisme de synchronisation que le dépôt. Conserver les résultats anciens dans l'historique.
4. Rendre notifications, champs et recalcul cohérents avec cette décision. Appliquer A-2 pour le quota d'une lecture devenue obsolète.

**Migration :** à décider entre verrou/rang existant et pointeur explicite, après examen des courses. Aucune réécriture des analyses historiques.
**Tests :** inversion v1/v2 ; remplacement pendant IA ; revue humaine ancienne ; clôture pendant lecture.
**Fumées :** smoke:balayage, smoke:extraction, smoke:relecture et smoke:transitions selon les chemins touchés.
**Effort indicatif :** 1 à 2 jours.

### RF-3 — Une opération, un débit durable

**Règles :** INV-6, RG-06.2, RG-06.5, RG-08.4.
1. Modéliser une réservation idempotente rattachée à la version/opération ; le débit et sa référence durable s'écrivent ensemble avant l'appel.
2. Définir reprise et abandon de réservation ; rendre un débit sans résultat une seule fois. Garder l'octroi d'origine et la mesure des jetons.
3. Tester les interruptions à chaque frontière. L'idempotence du quota ne promet pas un unique appel IA externe après un arrêt.
4. Mutualiser la décision « exige un débit » entre annonces du dépôt, balayage et analyse ; permettre ILLISIBLE → reprise gratuite à solde nul, tout en gardant le consentement et le droit du dossier.
5. Examiner rédaction et relecture pour vérifier que le même type d'interruption n'y laisse pas une réservation sans reprise.

**Migration :** additive probable, avec unicité de réservation et reprise prudente. Les anciens débits non rattachés vont dans le diagnostic RF-4 ; aucun rendu massif automatique.
**Tests :** quota à zéro ; quotas concurrents ; ILLISIBLE et HORS_SUJET ; interruption après débit, après appel, avant verdict, avant acquittement ; notification unique.
**Fumées :** smoke:extraction et smoke:redaction sur PostgreSQL jetable ; arrêt réel du worker dans un scénario contrôlé.
**Effort indicatif :** 2 à 3 jours.

### RF-4 — Données antérieures, rétention et supervision

**Règles :** INV-3, INV-5, INV-8 ; restes du plan historique §7.
1. Produire des diagnostics en lecture seule pour C1, clés M1, objets E4, débits E5, mauvaises notifications E7, dettes M4 et textes générés M7.
2. Pour chaque anomalie : nombre, identifiants techniques, règle, responsable, proposition de traitement. Les pièces et données sensibles ne sont pas exportées dans les livrables de chantier.
3. Faire valider l'inventaire d'objets avant toute purge. Exiger une appartenance démontrée, un contrôle de rétention et une exécution limitée au périmètre identifié.
4. Ajouter le compteur d'analyses saines en attente depuis plus d'une heure à la supervision ; respecter l'accès restreint au détail de /api/health.
5. Construire la commande de purge exécutable dans l'image pour une restauration ; éprouver l'ensemble sur une restauration isolée avant remise en service.
6. Vérifier les obligations en revue manuelle dans B-04 et décider du message au candidat pour une tranche nulle.

**Migrations :** seulement celles démontrées nécessaires au diagnostic ou à la reprise ; aucun affaiblissement des historiques immuables S.141.
**Tests :** objet actif conservé ; objet échu réellement supprimé ; stockage indisponible jamais annoncé purgé ; reprise sans double rendu.
**Fumées :** smoke:purge, smoke:conservation, smoke:remboursement, smoke:worker ; restauration de contrôle.
**Effort indicatif :** 1 à 3 jours selon l'inventaire et l'accès à une copie de données.

### RF-5 — Recette de la V1

**Candidat :** visiteur → simulateur → inscription → vérification → ouverture → achat d'essai → pièces → complétude → rédaction → échéancier → déclaration du dépôt → issue → purge/portabilité.
**Opérateur :** publication par second lecteur → divergence → arbitrage ; revue de pièce → résultat ; remboursement → rapprochement → facture/avoir ; suppression demandée → reprise.
**Cas indispensables :** perte réseau et réponse perdue, double clic, quota nul, ancien onglet, remplacement de pièce, session expirée, fichier illisible, fournisseur indisponible, changement de fuseau et pièce périmée.
**Interfaces :** mobile 390 px, clavier, TalkBack selon protocole du dépôt ; états vide, chargement, erreur ; menu S.139 reporté au prototype ; formulaires back-office terminés.
**Exploitation :** nginx réellement servi, certificats du stockage, CORS, URL présignée 5 minutes, aperçu B-05, retour FedaPay, six services healthy, worker et alertes observés, répétitions du runbook de déploiement.

**Preuves :** version, scénario, rôle, préconditions, résultat attendu, résultat observé, anomalie ou preuve, date et responsable. Un scénario non exécuté reste « non vérifié ».
**Effort indicatif :** 1 à 3 jours après disponibilité de la préproduction et de ses services.

### RF-6 — Levée des préalables humains et commerciaux

**Q.A :** validation nominative des quatre textes, publication B-08, pages et liens réellement accessibles ; contact relevé par une personne. Les brouillons juridiques servent de base, pas de validation.
**M.C :** accès et documentation officielle du système de facture normalisée, identité de l'émetteur, régime de TVA et exercice D-14 confirmés ; adaptateur de certification selon le contrat existant. Prévoir la reprise d'une certification indisponible, sans émettre une fausse certification.
**Paiement :** encaissement et remboursement de bout en bout dans l'environnement autorisé ; facture et avoir certifiés ; version Stripe et métadonnées de charge vérifiées si ce rail est activé. FedaPay : clarification du remboursement partiel et de ses montants avec le fournisseur.
**Sortie :** conditions d’ouverture publique et d’encaissement attestées séparément. Si M.C reste ouvert, le produit ne devient pas commercial par modification d'un drapeau.

**Effort :** estimation de l'adaptateur après réception de la spécification. Le délai de validation juridique, comptable ou fournisseur n'est pas un délai de développement estimable aujourd'hui.

### RF-7 — Maintenance en continuité avec Claude Code

1. Conserver S.142 à S.144 fusionnés et D-31. Relire main et les PR ouvertes avant toute maintenance ; tenir compte de Next 16, du proxy et de l'invalidation juridique immédiate.
2. M19 : zod, pg-boss, Prisma et outils selon l'ordre déjà documenté ; une étape, une PR, pas de mise à jour globale.
3. Revoir l'exception deepmerge-ts au changement de Prisma et les avis modérés MinIO à partir d'un audit courant.
4. M20 : déplacements de modules après stabilisation des correctifs métier, sans changer les règles ; adapter les tests qui lisent les anciens fichiers.
5. F10 : inventaire des écrans incluant B-08/B-09 si validé, une documentation d'installation faisant foi, cohérence MinIO local/Garage production, politique d'archivage des exports.

Ces travaux ne remplacent pas les preuves fonctionnelles et ne doivent pas prolonger artificiellement le délai de sortie de la V1.

## 3. Choix à valider

| Choix | Recommandation | Impact |
|---|---|---|
| A-1 — Établissement en C-05 | Retirer le champ en V1 tant qu'aucun usage persistant n'est défini | Correction courte ; la conservation nécessite stockage, édition et relecture. |
| A-2 — Lecture devenue obsolète | Empêcher ses effets sur la nouvelle pièce ; ne pas facturer deux résultats au candidat pour son remplacement | Quota à préciser dans le même lot ; les jetons réellement dépensés restent mesurés. |
| A-3 — Divergence après dépôt | Alerte consultable, migration fermée ; définir si CONSERVER peut être historique | Aucun passage SOUMIS/clos vers ACTIF par ce chemin. |
| D-13 et D-14 déjà au registre | Confirmer les noms d'unités appliqués ; faire confirmer l'exercice de facturation par M.C | Ne pas revenir sur S.140 sans avis et test du passage d'année. |
| S.121 / S.122 | Différer recrédit commercial et édition des plafonds sans règle validée | Actions absentes explicitement assumées ; pas de bouton sans contrat métier. |
| D-32 / D-33 | Refactoring après correctifs ; clarifier inventaire et archivage des prototypes | Respect du code et des tests de Claude Code, pas de nettoyage mélangeant les sujets. |

**Tranchés le 09/10/2026 par le responsable, à l'autorisation de RF-1 :** A-1 sur la recommandation (champ retiré en V1) et A-3 sur la recommandation (« conserver » enregistrable à titre historique, « migrer » refusé). A-2 tranché à l'autorisation de RF-2, sur la recommandation : la lecture devenue obsolète est rendue au candidat, ses jetons restant mesurés.

La validation de ce chantier ne remplace pas les avis M.C/Q.A ni les réponses du prestataire. Une décision ouverte ne bloque que le sous-lot qui en dépend.

## 4. Porte de sortie d'un lot

Pour les lots applicatifs : un lot, une PR, une entrée S.xxx, rattachement WF/RG/écran, description des données et des écarts restants.

- Reproduction comportementale avant correction, puis preuve du comportement voulu.
- npm ci sur le verrou ; npm run check ; npm run check:audit ; npm run build ; prisma validate.
- smoke:migrations et garde-fous sur PostgreSQL jetable si migration ; fumées touchées.
- smoke:worker -- --base ; image éprouvée lorsque le lot touche les artefacts ou le déploiement.
- Recette des parcours touchés, états vide/chargement/erreur, français et vocabulaire conforme.
- Un résultat non exécuté reste non vérifié ; une PR préparée reste proposée ; une fusion ne prouve pas un déploiement.
- Pas de migration ou de test de fumée contre une base de production pour produire une preuve de développement.

## 5. Critères pour déclarer la V1 terminée

1. FON-01 à FON-04 et E5 fermés par reproduction et tests comportementaux ; champ établissement traité explicitement.
2. Parcours V1 complets avec leurs refus et reprises ; aucun état bloqué sans action ou reprise attribuée.
3. Diagnostics historiques traités, ou reliquats non bloquants attribués et datés ; INV-5 éprouvé jusqu'aux octets.
4. Porte technique complète verte sur la version livrée ; recette navigateur et image réalisées.
5. Q.A levé pour l'ouverture publique ; M.C et circuit facture/avoir levés pour l'encaissement.
6. Support, sauvegarde/restauration et alertes éprouvés.
7. Documentation Claude Code alignée ; décisions et reports V2 maintenus ; aucun brouillon présenté comme livré.

**Prochaine action :** soumettre RF-0 en PR documentaire. Après sa revue, engager RF-1 lorsqu'il sera demandé, en tranchant A-1 et A-3 pour les sous-lots concernés. L'autorisation de RF-0 ne tranche pas A-1 à A-3 et ne lance pas automatiquement les corrections applicatives.

