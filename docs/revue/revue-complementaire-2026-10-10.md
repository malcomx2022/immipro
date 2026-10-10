# S.167 — Revue complémentaire et corrections — 10 octobre 2026

**Statut : corrections préparées et vérifiées localement ; fusion et déploiement distincts.** Le responsable a demandé une nouvelle revue tenant compte des corrections Claude Code, puis les correctifs front et backend et leurs documents. Ce lot est nommé **RC / S.167**, après vérification du registre S.165 et du travail S.166 en cours.

## Base et continuité

Base : `main` **065bde4f06fade645c16552a57951f20a9803788 / S.165**, après fusion de la PR #266. Les PR #244 à #266 ont été rapprochées du chantier ; la PR [#267 / S.166](https://github.com/malcomx2022/immipro/pull/267), pg-boss 11 et transfert des files, a été lue à sa tête `ac49c88`. Elle reste un travail de Claude Code en brouillon au moment de cette revue ; ce lot ne modifie ni les files ni les dépendances.

| Travaux Claude Code conservés | État observé sur la base |
|---|---|
| RF-0 / #244 | Documentation fusionnée. |
| S.145, S.160, S.161 | Déploiement, miroir des images et démarrage à froid de l'antivirus présents. |
| S.146 | Plafond, dossiers figés et retrait de l'établissement ; A-1 et A-3 déjà tranchés. |
| S.147 | Anciennes versions sans effet sur la pièce courante ; A-2 déjà tranché. |
| S.148, S.155 | Réservation de lecture et reprise gratuite ; préparation du dépôt réparée. |
| S.149 à S.154 | Diagnostics, supervision, inventaire/purges, rédaction réservée et avis de tranche nulle présents. |
| S.156, S.157, S.159, S.163 | Banc, matrice, signalement/historique et protocole pilote présents ; observations O-1 à O-3 encore ouvertes avant RC. |
| S.158 | Préparation de M.C ; aucun certificateur ni préalable humain inventé. |
| S.162, S.164, S.165 | Tarifs mobile, règles React rétablies et zod 4 conservés. Les nouveaux identifiants suivent `z.guid()`. |

Les anciennes anomalies FON-01 à FON-04 et E5 ne sont pas reprises comme des bugs encore ouverts. La revue lit leurs corrections, la matrice actuelle, les services de simulation, de signalement et de relecture et les composants associés. Elle ne constitue pas une nouvelle recette exhaustive de la V1 ni une inspection de la base de production.

## Constats et correctifs RC

| Repère | Reproduction avant correction | Comportement corrigé | Règles |
|---|---|---|---|
| RC-01 / O-1 | Deux résultats « Pays-Bas » ne nomment pas leur procédure ; le titre compte les procédures comme des pays. Les écartées peuvent partager la même clé pays/motif. | L'API transmet le libellé de procédure du référentiel et le slug des écartées. Les cartes et leurs liens nomment la procédure ; le titre compte les pays distincts. Classement et sources conservés. | WF-01, INV-1, INV-4, INV-8 |
| RC-02 | Un écran v1 signale « Autre chose » après création d'une v2 dont les champs portent les mêmes noms : le service ouvre une revue sur v2, alors que le candidat n'en a pas vu les valeurs. | L'écran transmet `analyseId`, l'API exige un GUID et le service compare l'identité avant toute création. Une lecture remplacée est refusée sans revue ni audit supplémentaires ; bouton « Recharger la lecture ». Le formulaire est réinitialisé quand l'identité change. | RG-06.8, RG-06.12 |
| RC-03 | Ouvrir A, sélectionner B, puis recevoir la réponse de A affiche son aperçu sous le nom de B. Une décision tardive peut effacer le message déjà saisi pour B ; une erreur tardive peut également y apparaître. | Les réponses appartiennent à leur demande et à leur pièce. Un changement de sélection invalide l'affichage de l'ancienne réponse. Une décision serveur réussie actualise la file sans effacer la saisie de B. L'aperçu reste lié à son identifiant même après actualisation des lignes. | WF-15, RG-15.1 |
| RC-04 / O-2 | Décider ILLISIBLE sur une lecture gratuite ajoute un crédit sans débit. Une lecture technique déjà rendue peut être marquée `creditRefunded = true` sans rendu réel. B-05 affirme systématiquement que la machine a rendu un résultat. | Un recrédit exige une décision qui le permet, `creditConsumed` et un débit réel rattaché à l'analyse. La réponse et le drapeau portent le rendu effectivement écrit. Décision, rendu, avis et audit sont dans la même transaction. B-05 lit les débits/rendus en une requête pour toute la file et ne promet plus un résultat ou un recrédit inexistant. | INV-6, WF-06, WF-15 |
| RC-05 / O-3 | Une file vide affirme que toutes les pièces d'hier ont été traitées, sans donnée permettant de le conclure. | L'état vide dit seulement qu'aucune relecture n'est en attente et inclut les signalements candidats. | DOC-12, états vides B-05 |

Sources porteuses avant correction : `src/app/api/simulations/route.ts`, `src/app/(public)/resultats/Resultats.tsx`, `src/server/dossiers/signalement.ts`, `src/server/revue/decision.ts`, `src/server/lecture/backoffice.ts` et `src/app/(admin)/revue/RevueDesPieces.tsx`, dans la base épinglée ci-dessus.

## Preuves et validation

Avant correction, cinq tests d'interface supplémentaires échouent sur les comportements observés. Le banc PostgreSQL, utilisant les deux services de la base S.165, confirme les crédits gratuits, les drapeaux inexacts et la mauvaise lecture signalée. Les assertions finales exigent les comportements corrects ; aucune assertion de comportement incorrect n'entre dans la suite du projet.

Les résultats définitifs sont consignés après exécution dans la section suivante. Le banc est isolé : PostgreSQL 16 jetable, stockage, lecture IA et courrier simulés. Aucun candidat réel, paiement réel ni fournisseur IA facturé.

### Résultats du lot

| Contrôle exécuté | Résultat |
|---|---|
| `npm ci --ignore-scripts` et génération Prisma | Verrou de S.165 installé, client généré. |
| `npm run check` | Lint, types, **178 fichiers / 3 572 tests** et vocabulaire : succès. Les ajouts comptent 7 cas d’interface et 2 cas de contrôleur. |
| `npm run check:audit` | Succès selon la politique existante : l’alerte haute deepmerge-ts reste couverte par D-34 ; quatre avis modérés, aucune nouvelle exception. |
| `npm run build` | Application et artefacts du worker construits. |
| `npx prisma validate` | Schéma valide. |
| `npm run smoke:migrations` | 58 migrations, schéma identique, 105 écritures interdites refusées et 9 écritures autorisées posées. Le premier essai manquait de `psql` ; le contrôle final utilise le client PostgreSQL 16 du conteneur jetable via un relais local hors dépôt, limité à ce contrôle. |
| `npm run smoke:worker -- --base` | Artefact isolé, démarrage/redémarrage sur base jetable, files et reprise du moteur antivirus : succès. |
| `npm run smoke:extraction` | Succès ; contrôles supplémentaires de rendu gratuit/payé/déjà rendu, débit historique manquant et ancienne identité de lecture inclus. |
| `npm run smoke:relecture` | Succès sur PostgreSQL jetable. |
| Chromium, P-03, 390 et 1 280 px | Trois procédures distinctes pour deux pays ; bons libellés et liens. Largeur du document égale au viewport ; aucune erreur JavaScript. |

Les contrôles navigateur de P-03 passent par l’API et les graines du banc, avec PostgreSQL réel. Les courses B-05 et l’envoi C-08 sont éprouvés dans les tests d’interface ; l’effet des services est vérifié par la fumée PostgreSQL. Une vérification complète du pilote, TalkBack et une nouvelle image Docker de déploiement ne sont pas annoncés comme exécutés. La CI complète de la PR reste une porte distincte avant fusion.

## Données et limites

Aucune migration, dépendance ou réécriture des historiques. Les anciens recrédits injustifiés ne sont pas retirés automatiquement : un traitement de ces données demande un diagnostic puis une décision attribuée. Une ancienne lecture portant un drapeau de débit sans écriture correspondante ne crée pas un nouveau crédit ; elle relève de ce diagnostic.

Le contrat de signalement reçoit désormais `analyseId` : après déploiement, recharger les pages ouvertes avec l'ancien client avant de signaler une valeur. L'identifiant ne donne aucun droit ; appartenance au candidat, dossier modifiable et validation des champs restent exigés.

Les résultats navigateur portent sur le banc local. Q.A, M.C, certification fiscale, dépôt réel sur le pilote, services du VPS et signature de la recette restent soumis aux preuves et au protocole existants. Les observations corrigées localement ne deviennent pas, par cette seule PR, des validations du pilote.
