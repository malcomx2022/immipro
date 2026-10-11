# IA : fournisseurs, configuration et intervention dans les workflows

État du code revu le **11/10/2026**, base initiale `bbf1500` / S.168,
base finale `ec32f65` / S.169 après fusion Prisma 7. Les chemins IA sont
inchangés par cette fusion. Ce document
décrit l'exécution de l'application. Claude Code est l'outil de développement
du projet ; il ne détermine pas automatiquement le fournisseur utilisé en
production. Les décisions D1 et les invariants de CLAUDE.md restent applicables.

## 1. Où l'IA intervient

| Workflow DOC-11 | Intervention réelle |
|---|---|
| WF-01 simulateur | Aucune. Règles et classement déterministes. |
| WF-02 inscription/profil | Aucune. Authentification, consentements et profil. |
| WF-03 recommandations | Aucune. Référentiel et critères du candidat. |
| WF-04 ouverture | Aucune. Règle figée et checklist. |
| WF-05 achat | Aucune. Fournisseur de paiement distinct du fournisseur IA. |
| WF-06 pièces | Lecture des octets et extraction de champs par le modèle ; verdict calculé ensuite en TypeScript. |
| WF-07 complétude | Aucune. Calcul déterministe et réévaluation des pièces. |
| WF-08 rédaction | Mise en forme des réponses et relecture narrative ; recoupements déterministes sans modèle. |
| WF-09 échéancier | Aucune. Dates, durées et rappels déterministes. |
| WF-10 clôture/purge | Aucune. Transitions et conservation. |
| WF-11 divergences réglementaires | Aucune inférence dans la chaîne revue. Comparaisons et arbitrage humain. |
| WF-12 consultants | Aucun modèle ; périmètre V2 conservé. |
| WF-13 partenaires | Aucun modèle dans les parcours revus. |
| WF-14 veille | Publication et contrôle du référentiel par les opérateurs. |
| WF-15 administration | Revue humaine ; consulter une pièce est un accès audité. |
| WF-16 supervision IA | Lecture des usages enregistrés et estimation des coûts ; aucun appel au modèle pour afficher B-07. |

Le modèle ne publie pas une règle, n'attribue pas un pronostic d'obtention,
ne calcule pas la complétude et ne déclare pas un dossier déposé.

## 2. Choix du fournisseur et paramètres

La source de référence est [fournisseurs.ts](../src/domain/ia/fournisseurs.ts).
L'exploitant configure les variables au déploiement ; le candidat n'a pas
de sélecteur de modèle.

| Variable | Rôle et comportement actuel |
|---|---|
| `AI_FOURNISSEUR_EXTRACTION` | `anthropic` par défaut, ou `openai_compatible`. |
| `AI_FOURNISSEUR_REDACTION` | Même choix, indépendant de l'extraction. Génération et critique partagent ce choix. |
| `ANTHROPIC_API_KEY` | Clé Anthropic, nécessaire au branchement correspondant. |
| `AI_MODEL` | Modèle Anthropic ; défaut du code : `claude-opus-5`. Son existence, ses droits d'accès et sa disponibilité n'ont pas été validés par un appel réel dans cette revue. |
| `AI_OPENAI_URL` | Base de l'API compatible ; HTTPS, HTTP autorisé uniquement sur la boucle locale. L'adaptateur ajoute `/chat/completions`. |
| `AI_OPENAI_MODEL` | Identifiant du modèle compatible, obligatoire. |
| `AI_OPENAI_AUTH` | Authentification `cle` par défaut, ou `compte_de_service_google`. |
| `AI_OPENAI_API_KEY` | Clé pour le mode `cle` ; aucune clé fixe requise pour le mode Google. |
| `AI_OPENAI_COMPTE_DE_SERVICE` | Compte de service Google en JSON ou base64. Matériel secret à fournir hors dépôt. |
| `AI_OPENAI_PDF` | `oui` / `file`, `document_url` ou `image_url`, selon le protocole PDF du fournisseur. Vide / `non` : le PDF n'est pas envoyé à cet adaptateur. |
| `AI_PIECES_SOUS_TRAITANT_AUTORISE` | Doit valoir exactement `openai_compatible` pour autoriser l'extraction par cet adaptateur. Une clé seule ne suffit pas. |
| `AI_OPENAI_ORIGINE_AUTORISEE` | Depuis S.171 (REV11-L1) : origine de la société validée, sans chemin (`https://api.mistral.ai`). Elle doit être celle de `AI_OPENAI_URL`, sinon aucune pièce ne part et B-07 dit pourquoi. |

Un code fournisseur inconnu ou une configuration incomplète ne déclenche
aucun basculement vers un autre prestataire. Le code `openai_compatible`
désigne un **protocole**, pas une société ni une région. Depuis S.171,
l'autorisation des pièces nomme aussi l'origine validée
(`AI_OPENAI_ORIGINE_AUTORISEE`) : une URL qui change sans que
l'autorisation soit revue n'envoie plus de pièce. La région et le modèle
restent à documenter avec le prestataire. La variable d'autorisation
technique ne remplace pas le DPA ni sa validation.

**Destination des octets (REV-IA-02, S.171).** Aucune des trois sorties
ne suit de redirection : l'adaptateur compatible, l'échange du jeton
Google et le client Anthropic (`OPTIONS_DU_CLIENT`). Une réponse 3xx
devient `non_configure` (pièce en revue humaine, analyse recréditée, non
rejouée), avec une cause qui dit quelle variable revoir ; le serveur
désigné par le renvoi ne reçoit rien. `tests/ia-redirections.test.ts`
reprend DIA-04 en régression dans la porte : 301, 302, 303, 307 et 308,
même origine, autre origine et destination HTTP non autorisée.

Pour Vertex, le serveur signe une assertion du compte de service et échange
celle-ci contre un jeton OAuth ; il renouvelle le jeton avant expiration et
peut le renouveler une fois après un 401. Le scope utilisé est
`cloud-platform`. L'URL d'échange du jeton est contrôlée dans le code.
Les tests Vertex actuels utilisent un serveur simulé : ils ne prouvent ni
l'habilitation réelle du compte ni la résidence des traitements.

Exemple sans secret pour une extraction compatible et une rédaction Anthropic :

```dotenv
AI_FOURNISSEUR_EXTRACTION=openai_compatible
AI_FOURNISSEUR_REDACTION=anthropic
AI_OPENAI_URL=https://prestataire.example/v1
AI_OPENAI_MODEL=modele-a-qualifier
AI_OPENAI_AUTH=cle
AI_OPENAI_PDF=file
# Renseigner les clés hors dépôt ; autoriser la sous-traitance après validation.
```

Cet exemple ne constitue pas une configuration opérationnelle. Vérifier
les paramètres effectivement acceptés par le modèle, notamment
`max_tokens`, le schéma structuré et les blocs PDF, dans son environnement réel.

## 3. WF-06 : dépôt, lecture et décision

1. Le candidat accepte le consentement requis et dépose la pièce au stockage
   par URL présignée. Le serveur contrôle type, taille et identité de version.
2. La pièce reste en quarantaine jusqu'au contrôle antivirus. Le worker ne
   lit que la version saine, courante, d'un dossier dont l'état l'autorise.
3. Le worker recontrôle le consentement et réserve une analyse dans le grand
   livre avant l'appel ; les règles de reprise gratuite et d'idempotence
   s'appliquent à la version.
4. L'adaptateur envoie les **octets** de l'image/PDF, le code attendu, les
   codes de la checklist et les champs demandés. Il ne donne pas au fournisseur
   l'URL privée du stockage. Taille maximale : 32 Mio ; délai de lecture :
   120 secondes ; budget de sortie : 4 096 jetons.
5. Le serveur valide la structure de la réponse puis les fonctions de domaine
   mesurent les champs au regard de la règle figée. Elles déterminent la
   conformité, les corrections et les réserves. Le modèle fournit des faits
   extraits, pas la règle de décision.
6. Le résultat, l'usage IA et le débit sont enregistrés selon le chemin suivi.
   Une ancienne version reste dans l'historique et ne modifie pas la pièce
   courante. Le coût d'un appel déjà effectué reste à mesurer même si son
   résultat devient obsolète.
7. Les causes transitoires déclenchent une reprise sur le même fournisseur,
   jusqu'à trois tentatives avant revue humaine. Pendant l'attente, aucun
   verdict de conformité n'est inventé. Les autres échecs vont en revue humaine.

Une pièce illisible ou un appel non abouti ne doit pas coûter une analyse
utile au candidat ; le rendu de quota suit le débit réellement dû. La revue
du 11/10 a confirmé ce chemin sur le banc sans fournisseur : fichier sain,
résultat `ILLISIBLE`, `creditConsumed=false`, ouverture d'une revue technique.

La validation d'un schéma JSON ne garantit **pas** que les faits extraits
sont vrais. Des tests de qualité sur pièces de référence restent nécessaires,
en particulier pour éviter une fausse conformité due à une valeur inventée.

Sources : [extracteur](../src/server/dossiers/extracteur.ts),
[job d'analyse](../src/server/jobs/analyse.ts),
[adaptateur compatible](../src/server/ia/openai-compatible.ts).

## 4. WF-08 : rédaction et relecture

L'entretien conserve les réponses du candidat. La mise en forme transmet
le libellé de la pièce, son objet, le pays issu de la règle figée, les
questions et les réponses. La critique reçoit aussi le texte de la version
relue. Ces appels n'envoient pas de PDF joint, mais transmettent néanmoins
des **données personnelles textuelles** : la sous-traitance et la conservation
restent à vérifier pour le fournisseur de rédaction.

Les packs Dossier et Dossier Pro ouvrent ces appels assistés. Les fonctions
manuelles et les recoupements déterministes conservent leurs droits actuels.
Le service vérifie les droits avant débit, réserve une analyse avec échéance,
appelle le modèle, puis solde la réservation avec la version produite/relue.
Les réservations interrompues sont récupérées par la reprise prévue en S.153.
Délai des appels : 180 secondes ; budget de sortie : 4 000 jetons.

Une relecture réussie écrit les remarques et `critiquedAt` dans une transaction.
Une vraie liste vide datée signifie « relue sans remarque » ; sans date,
le texte reste non relu. Les formulations interdites sont contrôlées en aval
et un résultat refusé rend l'analyse réservée. Le coût IA consommé reste distinct.

**S.174 / REV11-L3.** Une remarque mal formée refuse l'avis entier,
y compris une liste mixte ou trop longue ; aucun filtrage en avis favorable.
Une vraie liste vide reste acceptée. Les deux valeurs d'une incohérence
doivent être nommées et non vides ; leur vocabulaire est contrôlé aussi.
Les deux adaptateurs et la route protègent la publication. Un refus rend
la réservation une fois, sans effacer la consommation chez le fournisseur
ni provoquer un nouvel appel automatique. Le candidat reçoit une explication
et garde sa version. [Contrat, quota et historique](exploitation/avis-ia.md).

**S.175 / REV11-L4.** La réservation exclusive par version et son débit
sont désormais atomiques avant réseau. Le second onglet reçoit « en cours »
ou l'avis existant, même à quota 1. Aucun réseau sous transaction SQL ;
l'avis n'est publié que par sa propriétaire encore valide, sur la version
courante. Réponse ancienne/expirée écartée, usage conservé et débit encore dû
rendu une fois ; reprise horaire S.153 et reprise explicite après expiration.
R-04 consulte sans relancer l'IA. DIA-07 passe inchangé ; vrais POST et deux
onglets éprouvés sur les deux fournisseurs simulés. La qualification réelle
reste L5. [Étapes, limites après interruption et migration](exploitation/relecture-concurrente.md).

Sources : [service](../src/server/redaction/service.ts),
[mise en forme](../src/server/redaction/mise-en-forme.ts),
[route de relecture](../src/app/api/dossiers/[id]/redaction/[type]/relecture/route.ts),
[grand livre](../src/server/acces/quota.ts).

## 5. Quota, jetons et coûts : trois mesures différentes

- **Quota candidat : analyses.** D1 a fixé cette unité ; aucune conversion
  automatique en jetons ni en monnaie ne doit remplacer le grand livre.
- **Jetons fournisseur : consommation technique.** Entrée et sortie sont
  enregistrées dans `AiUsage` avec fournisseur, modèle et opération
  (`analyse:…`, `redaction:…`, `relecture:…`). Le volume de référence du pack
  sert à surveiller la marge ; il ne constitue pas un nouveau quota bloquant.
- **Coût estimé : jetons × tarifs configurés.** B-07 l'évalue par fournisseur.
  Il ne constitue pas une facture du prestataire ni une preuve de paiement.

Tarifs Anthropic : `AI_TARIF_ENTREE_PAR_MILLION`,
`AI_TARIF_SORTIE_PAR_MILLION`, `AI_TARIF_DEVISE`. Tarifs compatibles :
`AI_TARIF_OPENAI_COMPATIBLE_ENTREE_PAR_MILLION`,
`AI_TARIF_OPENAI_COMPATIBLE_SORTIE_PAR_MILLION`,
`AI_TARIF_OPENAI_COMPATIBLE_DEVISE`. Sans tarif exploitable, ne lire aucun
coût affiché comme une facture réelle ; la valorisation B-07 dépend des
tarifs courants. Le chantier prévoit de préciser la datation des prix.

**S.173 / REV11-L2.** Les compteurs sont validés avant le contenu, pour
les deux fournisseurs. Une réponse sans mesure complète ne publie aucun
résultat automatique ; revue humaine en WF-06, aucun texte/avis en WF-08,
réservation rendue sans relance automatique pour cette cause. Un côté
inconnu persiste `NULL` avec `usageState` ; un vrai zéro est enregistré.
Les coûts connus d'un contenu refusé restent conservés. B-07 signale
les appels à rapprocher et ne présente pas un coût incomplet comme nul.
Lire [la procédure et la migration](exploitation/mesure-ia.md). Les
reprises de transport bornées et le quota D1 en analyses restent distincts.

## 6. Qualification, exploitation et limites actuelles

Une fonction « branchée » signifie que ses préconditions de configuration
sont satisfaites. Cela ne prouve pas qu'une clé est valide, que le modèle
est accessible ou que le fournisseur traite les données dans la région voulue.
Le fournisseur effectivement déployé n'a pas été interrogé dans cette revue.

Avant qualification réelle : identifier prestataire/URL/région/modèle,
documenter DPA et conservation, vérifier l'accès au modèle, exécuter le banc
de 30 pièces synthétiques et les exercices de rédaction, mesurer qualité,
fausses conformités, abstentions, latence, coût et gestion des 429/5xx.
Revalider les tarifs et les références historiques de
[IA-benchmark.md](IA-benchmark.md) auprès des sources officielles actuelles.

Deux précautions sont désormais appuyées par une reproduction :

- **S.171 / #276 et complément S.172 / #277, proposés** : les transports compatible, SDK Anthropic
  et OAuth Google refusent tous les 3xx, même sur la même origine. DIA-04
  passe ; le worker ouvre une revue technique et rend l'analyse réservée,
  sans reprise automatique ou renvoi. Les interfaces candidat/opérateur
  suivent ce résultat. Voir [L1](revue/lot-l1-2026-10-11.md) et
  [destinations et manifeste proposé](exploitation/destination-ia.md).
  Le lien prestataire/URL/région/modèle/fonctions reste à qualifier en L5.
- La revue a reproduit l'héritage du compte Vertex dans le banc de recette.
  **S.170 / REV11-L0, fusionné par #275** : l'environnement est construit par liste
  autorisée ; clés fixes, compte Google, choix et autorisation IA sont
  neutralisés. Le diagnostic DIA-06 et les régressions Anthropic/compatible/
  Vertex passent. Le dépôt navigateur suivi du worker aboutit à la revue
  humaine avec `creditConsumed=false` et quota inchangé. Aucun appel n'est
  reçu au piège HTTP local. Voir le [lot L0](revue/lot-l0-2026-10-11.md).

Le banc applicatif `recette:banc` sert la recette sans fournisseur ; le banc
de qualité `banc:ia` utilise le fournisseur explicitement configuré pour
mesurer ses résultats. L0 préserve ce second usage et les règles D1/INV-6.

Les reproductions et leurs attentes figurent dans la
[revue complète](revue/revue-complete-2026-10-11.md). Les corrections sont
ordonnées dans le [chantier](revue/chantier-complet-2026-10-11.md).

Mise à jour L2 : base `47b39b0` ; [preuves, écarts et recette HTTP](revue/lot-l2-2026-10-11.md).
