# Chantier complet de correction et de finition — 11/10/2026

Ce plan découle de la [revue et des tests exécutés](revue-complete-2026-10-11.md).
Il conserve la logique de Claude Code : domaine pur, huit invariants,
référentiel figé, grand livre des analyses, services remplaçables, preuves
sur base jetable et une PR par lot. Les corrections proposées ci-dessous
ne sont pas intégrées par cette revue. Le plan est présenté avant leur intégration.

Base auditée : `bbf1500` / S.168. S.167 / PR #268 et les montées pg-boss
récentes sont intégrées et conservées. La PR #272 / S.169 de Claude Code
prépare Prisma 7 : relire son état avant chaque lot, utiliser son client et
son CLI après fusion, éviter toute montée concurrente de Prisma/package-lock.
Les numéros REV11-Lx sont des identifiants de plan ; attribuer S.xxx au
démarrage de chaque lot applicatif après vérification du registre et des PR.

Priorités : **P1** à traiter avant une qualification IA avec données réelles ;
**P2** finition et exploitation ; **préalable** preuve ou décision du
responsable indispensable au lancement. Effort indicatif : S < 2 h,
M 0,5–1 jour, L > 1 jour. Les chiffrages sont à réviser après conception ;
ils ne valent ni date de livraison ni autorisation d'encaissement.

## REV11-L0 — Isoler réellement le banc et établir les régressions

**P1 · S/M · anomalie REV-IA-04 · WF-06/08 · scripts/recette/banc.mts.**

Neutraliser l'ensemble des voies de branchement IA, y compris le compte de
service Google et ses paramètres. Préférer une construction explicite de
l'environnement autorisé aux seuls retraits de clés connues. Ne pas modifier
la configuration de production. Conserver les services simulés, la base
jetable et les assertions voulues des diagnostics ; ne pas rendre les
diagnostics verts en entérinant les comportements erronés.

Acceptation : aucun adaptateur externe branché malgré un environnement
parent complet Anthropic/compatible/Vertex ; aucune requête OAuth ou modèle ;
dépôt navigateur → worker → revue humaine sans consommation d'analyse utile.
Test pur de configuration, piège HTTP local pour toute sortie inattendue,
recette navigateur. Aucune migration ni reprise de données. Ce lot facilite
l'exécution sûre de tous les suivants.

## REV11-L1 — Maîtriser la destination des documents

**P1 · M · REV-IA-02 · WF-06 · server/ia/openai-compatible.ts.**

Refuser les redirections HTTP par défaut ; toute exception devrait être
explicite et vérifiée avant de retransmettre le corps. Documenter le lien
entre prestataire autorisé, URL, région et fonctions. Le drapeau générique
`openai_compatible` ne suffit pas à identifier une société ; proposer une
identité de configuration vérifiable sans changer de prestataire implicitement.

Acceptation : HTTP 301/302/303/307/308, même origine et autre origine,
chaînes et destination HTTP non autorisée ; aucun corps reçu par le serveur
de destination lorsque le renvoi est refusé. Le rendu d'analyse et la cause
actionnable doivent suivre le vrai chemin du worker. Ne pas enregistrer
les documents ou les clés dans les logs. Pas de migration pour le refus
des redirections ; éventuelle identité persistée à concevoir séparément.
Diagnostic DIA-04 à transformer en test de régression après correction.

## REV11-L2 — Mesurer la consommation sans inventer des zéros

**P1 · M/L · REV-IA-01 · INV-6/D1 · WF-06/08/16.**

Sources : adaptateur compatible, domaine des résultats d'appel,
`server/redaction/usage.ts`, job d'analyse et supervision B-07.
Exiger des compteurs entiers positifs ou nuls ; conserver la mesure connue
même si le contenu est rejeté. Distinguer « usage inconnu » et « usage nul ».
Une réponse valide sans mesure nécessite un état explicite et une alerte
de rapprochement ; décider sa politique de publication avant d'implémenter.
Le quota demeure en analyses, indépendamment de la consommation fournisseur.

Acceptation : usages absents, partiels, négatifs, fractionnaires, non finis
et enveloppes vides ; aucune erreur SQL après un appel due aux compteurs,
aucun rejeu facturable induit, aucune disparition d'un coût connu. Vérifier
les rendus du grand livre sur erreurs et reprises concurrentes avec PostgreSQL.
DIA-01/02/03 doivent satisfaire leurs attentes. Si un état d'usage inconnu
est ajouté en base : migration additive, lecture compatible et diagnostic
des lignes historiques. Les zéros anciens ne permettent pas de reconstruire
des jetons réels ; aucun montant ou journal historique inventé.

## REV11-L3 — Refuser les avis mal formés

**P1 · M · REV-IA-03 · WF-08/RG-08.4 · domaine de relecture et adaptateurs.**

Distinguer une vraie liste vide valide d'une liste de remarques rejetées
par le parseur. Définir la politique pour une liste mixte ; une erreur de
structure ne doit pas devenir un avis favorable daté. Vérifier aussi les
réponses Anthropic, sans présumer qu'elles présentent le même défaut.

Acceptation : liste vide valide acceptée ; liste entièrement invalide
refusée ; couples de valeurs d'incohérence incomplets, genre inconnu,
texte manquant, format mixte et formulation interdite. Sur PostgreSQL,
aucune date ni remarque publiées pour un avis refusé ; réservation rendue
une fois, usage fournisseur conservé. Aucun changement d'un avis historique
sans preuve de la réponse ayant produit cet avis. DIA-05 + CTRL-02 à conserver.

## REV11-L4 — Une seule relecture payante par version en cours

**P1 · M/L · REV-IA-05 · WF-08 · route relecture, réservation et quota.**

Acquérir une réservation exclusive et durable liée à l'identité de la
version avant le débit et l'appel. La garder pendant l'appel sans laisser
une transaction SQL longue ouverte sur le réseau. Prévoir l'échéance et la
reprise après interruption. Un second onglet doit recevoir un état « en
cours » ou le résultat déjà obtenu, sans second appel ni débit.

Acceptation : deux requêtes simultanées donnent un seul appel et une seule
analyse consommée ; quota d'une analyse ; réponse retardée, arrêt entre
réservation et appel, arrêt après appel, nouvelle version pendant la
relecture, reprise après expiration et échec fournisseur. Vérifier aussi
les remarques et leur unicité, pas seulement le solde. DIA-07 doit passer
sur le vrai traitement et PostgreSQL ; ajouter ensuite un test HTTP
authentifié et le parcours navigateur à deux onglets. Migration probable
pour la revendication durable : diagnostic des réservations existantes,
aucun effacement de grand livre. Dépend de L2/L3 pour les états d'échec.

## REV11-L5 — Qualifier les fournisseurs IA en conditions réelles

**Préalable IA · L · WF-06/08/16 · après L0–L4.**

Le code et les simulations ne permettent pas de choisir un prestataire
par sa qualité réelle. Revalider disponibilité des modèles et tarifs,
compatibilité PDF/image/schéma/paramètres, DPA, résidence et conservation.
Exécuter le banc synthétique de 30 pièces puis les lettres/avis de référence
pour chaque candidat fournisseur autorisé. Aucun document utilisateur réel
n'est nécessaire à cette qualification initiale.

Livrable : prestataire, URL/région, modèle, date, cas attendus, résultats,
fausses conformités, champs inventés, abstentions, latence, jetons,
coût estimé et rapprochement avec la mesure fournisseur. Tester refus,
429, indisponibilité, timeout et absence de mesure. L'assertion historique
« aucun faux conforme » ne peut pas être déduite d'un schéma JSON.
Choix extraction/rédaction à justifier séparément. Aucun basculement
automatique entre sociétés. Documenter le fournisseur effectivement déployé.

## REV11-L6 — Terminer la recette front et les parcours candidat

**P2 · L · WF-01 à WF-10 · front et routes associées.**

Conserver S.146–148, S.155–157, S.162 et S.167. La navigation locale actuelle
ne justifie pas de réécrire les écrans. Compléter les gestes de la matrice :
inscription et code email, simulateur rempli puis recommandation/ouverture,
achat en sandbox, dépôt/remplacement/ancienne version, consentement retiré,
quota épuisé et reprise gratuite, rédaction/export/relecture, double onglet,
dépôt déclaré, clôture/issue et conservation annoncée. Tester les états
vides, chargement, réseau coupé, réponse tardive et état devenu figé.

Acceptation : chemins complets dans Chromium mobile 390 px et bureau,
Firefox/WebKit, navigation clavier et lecteur d'écran prévu dans la matrice.
Contrôler le contenu métier et l'effet backend de chaque geste ; un HTTP 200
ou un H1 ne suffit pas. Les 45 navigations du 11/10 servent de base, pas de
certification des 62 écrans. Les quatre pages juridiques nécessitent leur
validation éditoriale réelle ; leur absence locale est voulue.
Toute nouvelle correction front doit partir d'une reproduction et recevoir
un test du résultat attendu, avec fumée du service impliqué.

## REV11-L7 — Fiabiliser exploitation et données antérieures

**P2 · M/L · WF-09/10/14/15/16 · dépendances RF-4 existantes.**

Exécuter les diagnostics déjà livrés en S.149–154 sur l'environnement cible,
en lecture seule d'abord : pièces/objets orphelins, réservations pendantes,
purges, versions obsolètes, règles, consentements et grand livre. Qualifier
chaque résultat avant un traitement ; ne pas réécrire une règle figée,
un audit ou une facture. Produire un inventaire validé pour les opérations
qui suppriment des objets. Éprouver sauvegarde/restauration sur clone isolé.

Acceptation : compte-rendu daté et attribué, alerte opérateur observable,
réservations expirées reprises une fois, pas d'effet sur une version courante
à partir d'un ancien résultat. Vérifier démarrage à froid antivirus,
stockage/CORS, mail, worker pg-boss 12, nginx/TLS et arrêt/redémarrage.
La preuve de migration production S.168 est conservée ; elle ne remplace
pas toutes les preuves d'exploitation. Aucun diagnostic production n'a
été exécuté dans la revue du 11/10.

## REV11-L8 — Paiements, conformité et autorisation de lancement

**Préalables Q.A/M.C · L/coordination · WF-02/05/10/15.**

Reprendre le dossier de levée des préalables existant et la matrice V1.
Faire valider les textes juridiques et les coordonnées réelles ; enregistrer
les validations prévues. Éprouver le sandbox réel Stripe/FedaPay avec clés
de test, montants/devises, signatures, rapprochement, remboursement et
pièces comptables. Le bouton d'achat sans rail et les webhooks simulés ne
valident pas un encaissement réel.

Acceptation : preuves datées des préalables, recette pilote et validation
du responsable. Q.A pour l'ouverture publique, M.C pour l'encaissement
restent distincts. Ne pas activer un drapeau commercial, envoyer une
transaction ou publier un texte réel à l'occasion d'un test local.
Ces exigences proviennent de CLAUDE.md et du dossier de lancement existant.

## REV11-L9 — Terminer les maintenances sans reprendre celles de Claude

**P2 · effort selon lot · PR #272 et plan M19.**

Laisser S.169/Prisma 7 suivre sa revue et sa porte complète. Après fusion,
rejouer les diagnostics IA et le scénario de concurrence avec son client,
le CLI de migration et l'image réellement construite. Vérifier les avis
d'audit résiduels au lieu de supposer leur disparition. Traiter l'exception
élevée `deepmerge-ts` et les quatre avis modérés selon leur chaîne réelle.
Les étapes Vitest/Tailwind restantes suivent le plan M19 existant ; une
montée générale des dépendances ne corrige pas les contrats métier L1–L4.

## Porte de chaque lot et ordre proposé

Ordre : **L0 → L1/L2 → L3 → L4 → L5**, puis achèvement conjoint de
**L6/L7/L8** ; L9 s'articule avec les travaux Claude en cours. La livraison
ne devient pas une certification V1 tant que les préalables restent ouverts.

Pour chaque PR : reproduction avant correction, tests unitaires du domaine,
intégration du vrai service sur base jetable, parcours fonctionnel concerné,
`npm run check`, audit, build, migrations et fumées de la porte CI.
Image et nginx lorsque les artefacts ou l'exploitation changent. Mettre à
jour CLAUDE.md, DOC-11 si une règle change, registre S.xxx, présent chantier,
documentation IA et matrice de recette avec ce qui reste non vérifié.

Aucune règle métier déjà arbitrée ne doit être redemandée. Les seuls choix
nouveaux identifiés portent sur la représentation de l'usage inconnu,
l'identité du prestataire autorisé et la politique de réponses partiellement
invalides ; présenter une proposition concrète dans les lots concernés.
