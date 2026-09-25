# Fournisseurs d'IA — état des lieux et plan pour en proposer plusieurs

**Statut : implémenté le 26/09/2026 (S.94).** Anthropic reste le fournisseur par défaut ; un second adaptateur, « compatible OpenAI », sert au choix la lecture des pièces et la rédaction. Le §9 dit ce qui est fait, comment l'activer, et ce qui reste à trancher hors du code. Les §1 à §8 sont l'analyse d'origine, gardée telle quelle.

---

## 1. La réponse courte

Oui, ImmiPro peut proposer plusieurs fournisseurs d'IA au choix, et le code s'y prête déjà en grande partie. Ce qui décide — les consignes envoyées, les schémas attendus, la lecture des réponses, les causes d'échec, le quota — vit dans le domaine et ne connaît aucun fournisseur. Seuls les **adaptateurs** parlent à Anthropic.

Les vraies difficultés ne sont pas techniques :

1. **Données personnelles.** Chaque fournisseur ajouté est un nouveau sous-traitant qui reçoit des pièces d'identité.
2. **Quota.** INV-6 compte en jetons, et un jeton n'a pas la même taille d'un fournisseur à l'autre.
3. **Qualité.** Un autre modèle peut lire moins bien une pièce. Le produit ne la déclarera jamais conforme à tort, mais il enverra plus de pièces en revue humaine.

---

## 2. Ce qui est déjà neutre

| Élément | Où | Pourquoi il ne dépend d'aucun fournisseur |
|---|---|---|
| Contrats d'appel | `Extracteur` (`src/server/dossiers/extracteur.ts`), `Redacteur` et `Critique` (`src/server/redaction/adaptateur.ts`) | Ils prennent une pièce ou une matière de rédaction, et rendent une lecture, un texte ou un avis avec les jetons consommés. |
| Consignes et schémas | `src/domain/dossiers/extraction.ts`, `src/domain/redaction/commande.ts` | Texte et schéma JSON produits par le domaine. |
| Lecture des réponses | `lireLaReponse`, `lireLaCritique`, `texteExploitable` | Une réponse hors schéma tombe en `reponse_illisible`, jamais en « conforme ». |
| Causes d'échec | `CauseDAppel` (`src/domain/ia/appel.ts`) | Six causes neutres : non configuré, injoignable, délai dépassé, saturé, refus, réponse illisible. |
| Choix de l'implémentation | Résolveurs `lExtracteur`, `leRedacteur`, `laCritique` | Un seul endroit décide quel adaptateur sert. |
| État de service | `src/server/exploitation/capacites.ts` | La capacité est mesurée sur le résolveur : un nouvel adaptateur est vu sans registre tenu à la main. |
| Quota et journal des jetons | `debiterUneAnalyse`, `noterLesJetons`, `AiUsage` | Le débit précède l'appel, et les jetons sont écrits même quand rien n'est rendu. |

## 3. Ce qui est couplé à Anthropic

| Fichier | Couplage | À faire |
|---|---|---|
| `src/lib/ai.ts` | Client du SDK Anthropic ; `AI_MODEL` a pour défaut un modèle Claude | Un client par fournisseur ; un modèle par défaut par fournisseur. |
| `src/server/ia/appel.ts` | `causeDeLErreur` lit les classes d'erreur du SDK ; `texteRendu` lit un `Anthropic.Message` | Déplacer ces deux fonctions dans l'adaptateur Anthropic ; chaque adaptateur classe ses propres erreurs vers `CauseDAppel`. |
| `src/server/dossiers/extracteur.ts` | Bloc `document` PDF en base64, `output_config` JSON Schema, `stop_reason` (`refusal`, `max_tokens`), `usage` | Le reste (taille, lecture du stockage, octets) est neutre et se garde tel quel. |
| `src/server/redaction/adaptateur.ts` | Même couplage, plus l'appel en flux (`stream`) | Idem. |
| Résolveurs | Lisent `ANTHROPIC_API_KEY` | Lire le fournisseur choisi, puis sa clé. |
| `src/domain/exploitation/dependances.ts`, `redacteur.ts`, `extracteur.ts` | `variables: ["ANTHROPIC_API_KEY"]` | Variables du fournisseur **choisi**. |
| `src/domain/backoffice/couts.ts` | Un seul tarif (`AI_TARIF_*`) | Un tarif par fournisseur et par modèle. |
| `AiUsage` (schéma) | Aucune colonne fournisseur ni modèle | Ajouter `provider` et `model`, nullables ; `null` = historique Anthropic, sans réécriture. |

---

## 4. Les points de vigilance

### 4.1 Données personnelles — à trancher avant tout code

L'extraction envoie **les octets des pièces d'identité** au fournisseur. Ajouter un fournisseur, c'est ajouter un sous-traitant, avec :

- une convention de traitement ;
- éventuellement un transfert hors du pays de l'utilisateur ;
- et une ligne dans `/donnees-personnelles`, page qui attend encore son texte validé (Q.A).

Le consentement séparé au traitement des pièces (RG-02.1) nomme la finalité, pas le prestataire : il faut vérifier auprès du conseil juridique s'il doit être redemandé. **Tant que ce n'est pas tranché, un second fournisseur ne peut servir qu'à la rédaction, qui ne reçoit pas de pièce.**

Pour la même raison, **aucune bascule automatique** d'un fournisseur vers un autre en cas de panne : ce serait envoyer une pièce à un sous-traitant que personne n'a choisi pour elle.

### 4.2 Quota (INV-6)

`tokensIA` exprime le quota de chaque pack en jetons. Un jeton n'a ni la même taille ni le même prix chez deux fournisseurs : le même dossier consommerait son quota plus ou moins vite selon le fournisseur. Trois options, à arbitrer :

- **a.** garder les jetons et accepter l'écart (le plus simple ; l'écart se voit dans B-07) ;
- **b.** convertir en coût : le quota devient un budget en micro-unités monétaires, lu sur le tarif du fournisseur ;
- **c.** un coefficient par fournisseur, tenu dans le domaine.

Recommandation : **a** pour un pilote, puis **b** si plusieurs fournisseurs servent réellement en production.

### 4.3 Qualité et capacités

Tous les fournisseurs ne lisent pas un PDF natif, et tous n'offrent pas de sortie JSON contrainte par schéma. Un adaptateur qui ne sait pas faire dit `non_configure` pour ce type de pièce, plutôt que de convertir en silence. Avant d'activer l'extraction chez un second fournisseur, il faut un **jeu d'évaluation** (pièces factices, jamais réelles) et un seuil de lecture accepté.

### 4.4 Rédaction

Les consignes restent celles du domaine (RG-08.2 : aucune fabrication, rien que les réponses du candidat), et le vocabulaire interdit continue de s'appliquer au texte produit. Changer de fournisseur ne change aucune règle ; cela peut changer le ton, et c'est à vérifier sur le jeu d'évaluation.

---

## 5. Les options d'architecture

| Option | Principe | Avis |
|---|---|---|
| **A. Choix par configuration** | Un fournisseur actif par fonction, choisi par l'exploitant : `AI_FOURNISSEUR_EXTRACTION`, `AI_FOURNISSEUR_REDACTION`. Défaut : `anthropic`. | **Recommandée.** Simple, auditable, compatible avec la conformité : on sait toujours qui a reçu quoi. |
| B. Repli explicite | En plus de A, une liste ordonnée par fonction, activée seulement pour la rédaction. | Plus tard, et pour la rédaction seulement (§4.1). |
| C. Passerelle tierce | Un intermédiaire unique vers plusieurs modèles. | Déconseillée pour les pièces : un sous-traitant de plus, et les fonctions propres à chaque fournisseur (PDF, schéma) se perdent. |
| D. Choix par le candidat | Le candidat choisit son fournisseur. | Non : complexité d'écran, de consentement et de support, sans gain pour lui. |

---

## 6. Plan d'implémentation, par lots

Chaque lot passe `npm run check` et `npm run build`. Aucun ne change le comportement visible avant le lot 3.

**Lot 1 — Neutraliser, sans rien changer**

- `src/domain/ia/fournisseurs.ts` : registre des fournisseurs. Pour chacun : code, libellé, variables exigées, capacités (`pdf`, `image`, `schema_json`, `flux`).
- `src/server/ia/anthropic/` : l'adaptateur actuel, déplacé tel quel, avec sa classification d'erreurs et `texteRendu`.
- Résolveurs : lisent `AI_FOURNISSEUR_EXTRACTION` et `AI_FOURNISSEUR_REDACTION`, défaut `anthropic`. Une valeur inconnue rend l'adaptateur non branché, avec un message qui nomme la valeur.
- Tests : non-régression complète, et un test qui interdit tout import d'un SDK hors de `src/server/ia/<fournisseur>/`.

**Lot 2 — Tracer par fournisseur**

- Migration : `AiUsage.provider` et `AiUsage.model`, nullables, sans réécriture de l'historique.
- Tarifs : `AI_TARIF_<FOURNISSEUR>_ENTREE_PAR_MILLION` et suivantes ; B-07 ventile par fournisseur.
- État de service : les variables affichées sont celles du fournisseur choisi.

**Lot 3 — Un second fournisseur, pour la rédaction d'abord**

- `src/server/ia/<fournisseur>/` : `Redacteur` et `Critique`, qui classent leurs erreurs vers `CauseDAppel`.
- Fumée : sur le modèle de `smoke:redaction`, avec un faux serveur local, sans réseau ni jeton facturé.
- Condition d'activation : le quota tranché (§4.2).

**Lot 4 — L'extraction chez le second fournisseur**

- Conditions : décision de conformité (§4.1), jeu d'évaluation et seuil (§4.3).
- Fumée : sur le modèle de `smoke:extraction`.
- Mise à jour de `/donnees-personnelles` le même jour.

**Lot 5 — Facultatif : repli explicite, pour la rédaction seulement.**

---

## 7. Les décisions à prendre

| # | Question | Qui |
|---|---|---|
| 1 | Quels fournisseurs, et pour quelles fonctions (extraction, rédaction, relecture) ? | Direction produit |
| 2 | Sous-traitance : convention, lieu de traitement, mention dans `/donnees-personnelles`, consentement à redemander ou non ? | Conformité et conseil juridique |
| 3 | Quota : jetons (a), coût (b) ou coefficient (c) ? | Produit et finance |
| 4 | Repli automatique : jamais pour les pièces ; pour la rédaction, oui ou non ? | Produit et conformité |
| 5 | Jeu d'évaluation et seuil de lecture accepté avant activation de l'extraction | Produit |

## 8. La documentation à mettre à jour avec chaque lot

- **Lot 1** : `.env.example` (nouvelles variables, commentées) ; `src/server/README.md` (tableau des points de branchement) ; ce document (statut du lot).
- **Lot 2** : DOC-11 WF-15, B-07 ventilé par fournisseur.
- **Lot 3** : DOC-11 WF-08, fournisseur de rédaction configurable.
- **Lot 4** : DOC-11 WF-06, fournisseur d'extraction configurable ; la page `/donnees-personnelles`.
- **Chaque lot** : le registre des arbitrages (`docs/prototype/ECARTS-A-ARBITRER.md`, S.94).

---

## 9. Ce qui est implémenté (26/09/2026)

Les décisions prises pour l'implémentation sont celles recommandées plus haut, et aucune ne peut être contournée depuis un écran :

- **option A** : l'exploitant choisit le fournisseur par configuration, fonction par fonction ;
- **quota en jetons** (§4.2, option a) ;
- **aucune bascule automatique** ;
- **garde des pièces** : elles ne partent chez un autre sous-traitant que sur autorisation écrite.

| Élément | Où |
|---|---|
| Registre des fournisseurs : choix par fonction, garde des pièces, PDF, tarifs, état affiché | `src/domain/ia/fournisseurs.ts` |
| Adaptateur compatible OpenAI (`POST {base}/chat/completions`, sans SDK) : lecture, rédaction, relecture, statuts HTTP classés vers `CauseDAppel` | `src/server/ia/openai-compatible.ts` |
| Résolveurs | `lExtracteur`, `configurationCompatible` (`src/server/dossiers/extracteur.ts`) ; `leRedacteur`, `laCritique` (`src/server/redaction/service.ts`) ; `redactionConfiguree` |
| Traçabilité | `AiUsage.provider` et `AiUsage.model`, migration `20260926090000_fournisseur_des_appels_ia`. Les lignes antérieures restent nulles et se lisent comme Anthropic. Contrainte : fournisseur connu ou nul. |
| Coûts | Tarif par fournisseur (`AI_TARIF_*` pour Anthropic, `AI_TARIF_OPENAI_COMPATIBLE_*`). Le coût d'un dossier servi par deux fournisseurs est leur somme, ou n'est pas calculé si l'un n'a pas de tarif ou si les devises diffèrent. |
| Écran B-07 (Coûts IA) | Section « Fournisseurs d'IA » : fournisseur et modèle de chaque fonction, « Branché » ou « Non branché » avec la raison dite comme une action, tarif renseigné ou non, et consommation par fournisseur et par modèle. |
| Tests | `tests/ia-fournisseurs.test.ts` (domaine, résolveurs, adaptateur face à un vrai serveur HTTP local) ; `tests/ui/couts-ia-fournisseurs.test.tsx` |

### Activer un second fournisseur

1. Renseigner `AI_OPENAI_URL` (adresse de base avec sa version, en https), `AI_OPENAI_API_KEY` et `AI_OPENAI_MODEL`. Ajouter `AI_OPENAI_PDF=oui` si ce fournisseur lit les PDF.
2. Pour la rédaction : `AI_FOURNISSEUR_REDACTION=openai_compatible`.
3. Pour la lecture des pièces, **seulement après la décision de conformité** (§4.1) : `AI_FOURNISSEUR_EXTRACTION=openai_compatible` **et** `AI_PIECES_SOUS_TRAITANT_AUTORISE=openai_compatible`, puis mettre à jour `/donnees-personnelles`.
4. Renseigner son tarif (`AI_TARIF_OPENAI_COMPATIBLE_*`) pour que B-07 calcule les coûts.
5. Vérifier dans B-07 que la fonction se lit « Branché ».

### Ce qui reste hors du code

- La décision de conformité (§4.1) et la page `/donnees-personnelles` : la variable d'autorisation n'en tient lieu que lorsqu'elle est posée par qui a tranché.
- Le jeu d'évaluation des pièces (§4.3) avant d'activer la lecture chez un autre fournisseur.
- Un repli explicite pour la rédaction (lot 5) : non implémenté, et à décider.
