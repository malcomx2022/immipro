# Banc comparatif des API d'IA — 02/10/2026 (S.99)

**Statut : comparaison documentaire, sans décision.** La direction a demandé de ne plus donner la priorité à l'API d'Anthropic et de comparer les fournisseurs sur pied d'égalité. Ce document compare les fournisseurs à partir de leurs pages officielles, lues le 02/10/2026. Il dit aussi ce qu'il faudrait changer dans le code pour chacun, et propose un essai réel pour départager les finalistes.

Il complète `docs/IA-fournisseurs.md` (S.94), qui décrit l'architecture : un fournisseur par fonction, choisi par configuration, sans bascule automatique, et des pièces qui ne partent chez un sous-traitant que sur autorisation écrite. **Rien n'est changé dans le code** : Anthropic reste le défaut tant que la décision n'est pas prise.

Tous les prix sont en USD par million de jetons (entrée / sortie), hors taxes. Ils changent vite : chaque chiffre est daté et sourcé (§9).

---

## 1. La réponse courte

1. **Le prix ne départage pas.** Avec n'importe quel fournisseur sérieux, un dossier complet coûte moins de 0,50 $ en IA, soit environ 300 FCFA, souvent bien moins (§4). C'est petit devant le prix d'un pack.
2. **Trois critères départagent :**
   - où vont les pièces d'identité et combien de temps elles y restent (§5) ;
   - la qualité de lecture des pièces béninoises, qu'aucun classement public ne mesure (§6) ;
   - le travail à faire sur l'adaptateur (§7).
3. **Trois fournisseurs sont écartés pour les pièces :**
   - **DeepSeek** : données stockées en Chine, entraînement actif par défaut, droit chinois, pas de PDF ni de schéma JSON ;
   - **l'API Gemini « Developer »** (AI Studio) : conservation de 55 jours, sans localisation garantie ;
   - **les passerelles** (OpenRouter, Together) : un intermédiaire de plus, ce que S.94 §5 déconseille déjà pour les pièces.
4. **Quatre finalistes**, à départager sur un essai réel (§8) :

| Finaliste | Pourquoi il est retenu | Ce qui le freine |
|---|---|---|
| **Mistral** — Medium 3.5, point d'accès UE | Hébergement UE contractualisable, DPA, ISO 27001/27701, français natif, prix moyen | Bloc PDF différent (petite modification de l'adaptateur) ; moins bien classé en rédaction française que les trois autres ; facturation depuis le Bénin non vérifiée |
| **OpenAI** — GPT-6.1 Sol, résidence UE | Bénin pris en charge ; bloc PDF déjà compatible ; résidence UE (+10 %) | Résidence UE et conservation zéro sur approbation commerciale ; `max_tokens` déprécié (une ligne à changer) |
| **Google** — Gemini 3.8 Flash sur Vertex AI, région UE | En tête des bancs publics de lecture de documents ; conservation zéro et résidence UE possibles | Authentification Vertex par compte de service : un adaptateur à écrire ; prix doublé au 01/01/2027 |
| **Anthropic** — Sonnet 5.5 | Déjà branché, aucune modification ; en tête des classements de préférence en français | Stockage aux États-Unis seulement ; deux pages officielles se contredisent sur la conservation ; Claude 5.x n'a été mesuré sur aucun banc de lecture de documents |

**Recommandation.** Faire l'essai du §8 avec les quatre finalistes, puis choisir **fonction par fonction**. S.94 le permet sans nouveau code : `AI_FOURNISSEUR_EXTRACTION` et `AI_FOURNISSEUR_REDACTION` sont distincts. Sur le papier, la lecture des pièces penche vers **Mistral (UE)** ou **Gemini sur Vertex (UE)** pour la protection des données. La rédaction, qui ne reçoit aucune pièce, peut aller au mieux classé en français dans l'essai.

---

## 2. Ce qu'ImmiPro demande à une API d'IA

| Fonction | Ce qui part chez le fournisseur | Exigences |
|---|---|---|
| Lecture d'une pièce (WF-06) | Les octets de la pièce : passeport, relevé, diplôme, en image ou en PDF | Lecture d'image **et** de PDF ; sortie contrainte par schéma JSON ; sous-traitance des données sensibles (DPA, conservation, lieu) |
| Rédaction d'une lettre (WF-08) | Les réponses du candidat, sans pièce | Français soigné, aucune fabrication (RG-08.2) ; vocabulaire interdit appliqué en aval |
| Relecture critique | La lettre et les réponses | Sortie par schéma JSON |

Deux règles du produit restent vraies quel que soit le fournisseur :

- un modèle moins bon envoie plus de pièces en revue humaine, mais n'en déclare aucune conforme à tort (S.94) ;
- tout appel est débité du quota en jetons (INV-6).

---

## 3. Les fournisseurs examinés

| Fournisseur | Modèles examinés (prix entrée / sortie) | Retenu ? |
|---|---|---|
| **OpenAI** | GPT-6 Astra 10 / 50 · GPT-6.1 Sol 2 / 10 · GPT-6 Luna 0,10 / 0,50 | Oui : 6.1 Sol |
| **Google Gemini** | 3.8 Flash 0,75 / 3,75, puis 1,50 / 7,50 dès le 01/01/2027 · 3.1 Pro (préversion) 2 / 12 · 3.5 Flash-Lite 0,30 / 2,50 | Oui : 3.8 Flash, **sur Vertex AI seulement** |
| **Mistral** | Medium 3.5 1,5 / 7,5 · Large 3 0,5 / 1,5 · Small 4 0,15 / 0,6 · OCR 4.1 : 5 $ / 1 000 pages avec extraction structurée | Oui : Medium 3.5 (Large 3 et Small 4 dans l'essai, pour le coût) |
| **Anthropic** | Opus 5.5 4 / 20 · Sonnet 5.5 2 / 10 · Haiku 4.5 1 / 5 · Fable 5.1 10 / 50 | Oui : Sonnet 5.5 |
| **DeepSeek** | `deepseek-flash` 0,15–0,30 / 0,60–1,20 | **Non** (§5) |
| **OpenRouter** (modèles ouverts : Qwen3-VL, Llama 4, Gemma 4) | Qwen3-VL-235B 0,21 / 1,9 · Gemma 4 31B 0,09 / 0,34 | Non pour les pièces ; possible pour la rédaction |
| **Together, Fireworks** | Qwen3.5-9B 0,17 / 0,25 · 0,20 à 0,90 selon la taille | Non : PDF non lu, page à convertir en image |

Remarques :

- **Haiku 4.5** peut être retiré dès le 15/10/2026. À ne pas choisir.
- **Fable 5.x** impose 30 jours de conservation, incompatibles avec la conservation zéro. À exclure pour les pièces.
- **Mistral OCR 4.1** est une API à part (`/v1/ocr`), et non `chat/completions`. Il annonce 93,07 sur OmniDocBench, un chiffre publié par Mistral lui-même. C'est une piste pour plus tard : il faudrait un adaptateur dédié.

---

## 4. Le coût, par pièce et par lettre

**Hypothèses** (à remplacer par les volumes réels de `AiUsage` après l'essai du §8) :

- une pièce : 3 000 jetons en entrée (image ou page, plus la consigne) et 600 en sortie ;
- une lettre, rédaction et relecture comprises : 8 000 jetons en entrée et 2 500 en sortie.

Le même document ne fait pas le même nombre de jetons chez deux fournisseurs. Par exemple, une image de 1000 × 1000 px compte environ 1 296 jetons chez Anthropic, 1 229 chez OpenAI et 1 120 chez Gemini. Ces chiffres sont donc des **ordres de grandeur**.

| Modèle | Une pièce | Une lettre | Un dossier type (8 pièces + 1 lettre) |
|---|---|---|---|
| GPT-6.1 Sol (+10 % en UE) | 0,012 $ | 0,041 $ | 0,14 $ |
| Gemini 3.8 Flash (2026) | 0,0045 $ | 0,015 $ | 0,05 $ |
| Gemini 3.8 Flash (dès 2027) | 0,009 $ | 0,031 $ | 0,10 $ |
| Mistral Medium 3.5 (+10 % en UE) | 0,009 $ | 0,031 $ | 0,10 $ |
| Mistral Large 3 | 0,0024 $ | 0,0078 $ | 0,03 $ |
| Mistral Small 4 | 0,0008 $ | 0,0027 $ | 0,01 $ |
| Claude Sonnet 5.5 | 0,012 $ | 0,041 $ | 0,14 $ |
| Claude Opus 5.5 (défaut actuel) | 0,024 $ | 0,082 $ | 0,27 $ |
| GPT-6 Luna | 0,0006 $ | 0,002 $ | 0,007 $ |

Deux réserves :

- **Les modèles de raisonnement** (GPT-6, Gemini 3) facturent leurs jetons de réflexion en sortie. Leur coût réel peut dépasser ce tableau.
- **Le quota d'un pack (INV-6)** est exprimé en jetons, et non en argent (S.94 §4.2, option a). Changer de fournisseur change donc la vitesse à laquelle un pack s'épuise, et non son prix. À revoir si le fournisseur retenu compte ses jetons très différemment.

---

## 5. Protection des données — le critère qui décide pour les pièces

| | Entraînement sur les données | Conservation par défaut | Conservation zéro | Lieu de stockage | DPA et certifications |
|---|---|---|---|---|---|
| **Mistral** | Non sur l'offre payante (à désactiver dans *Admin > Privacy*) | 30 jours | Sur demande ; ne couvre ni `/v1/files` ni le Batch | **UE garantie sur `api.eu.mistral.ai` (+10 %)**. Le point d'accès global ne s'engage sur aucun lieu, malgré le centre d'aide | DPA ; SOC 2 Type II, ISO 27001 et 27701 |
| **OpenAI** | Non, sauf adhésion | 30 jours | Sur approbation commerciale. Les images restent analysées contre les contenus pédocriminels | **UE (EEE et Suisse) sur `eu.api.openai.com`, +10 %**, avec conservation zéro ou surveillance modifiée exigée | DPA ; SOC 2 Type 2, ISO 27001 et 27701 |
| **Gemini sur Vertex AI** | Non | Journal anti-abus, sauf exception accordée | Oui, sur demande d'exception | **UE** (régions européennes, point d'accès `eu`) | DPA Google Cloud ; ISO 27001/27017/27018/27701, SOC 2 |
| **Gemini Developer API** | Non sur l'offre payante, oui sur l'offre gratuite | **55 jours** | Non : Google renvoie à Vertex | « Tout pays » | DPA |
| **Anthropic** | Non par défaut | **Contradictoire** : « non conservé par défaut » (documentation API), « supprimé sous 30 jours » (centre de confidentialité) | Sur demande commerciale | **États-Unis seulement** ; aucune option UE | DPA avec clauses types UE ; ISO 27001, ISO 42001, SOC 2 |
| **DeepSeek** | **Oui par défaut** (opposition possible) | Non précisée | Non | **Chine** ; droit chinois | Aucun DPA |
| **OpenRouter** | Non | Pas de stockage des requêtes par défaut | Imposable, mais elle **ne couvre pas** son moteur PDF tiers | Routage UE avec les offres Business et Enterprise | Un intermédiaire de plus |

Ce tableau ne tranche pas la question de S.94 §4.1, qui reste au conseil juridique : convention de sous-traitance, transfert hors du Bénin, mention dans `/donnees-personnelles`, consentement à redemander ou non. Il montre seulement où ces questions ont une réponse contractuelle, et où elles n'en ont pas.

La loi béninoise (Code du numérique, livre V) encadre les transferts de données personnelles hors du Bénin. Le choix d'un hébergement UE plutôt qu'aux États-Unis peut peser dans l'avis du conseil juridique. C'est à lui de le dire.

---

## 6. La qualité — ce que disent les classements publics, et ce qu'ils ne disent pas

| Classement | Ce qu'il mesure | Ce qu'il montre | Limite |
|---|---|---|---|
| **OmniDocBench v1.6** (OpenDataLab, 11/09/2026) | Lecture de documents | OCR spécialisés à environ 96 ; Gemini 3 Pro 92,9 et 3 Flash 92,6 ; Qwen3-VL 89,8 ; GPT-5.2 86,6 ; Mistral OCR 85,7 | Claude n'y est pas évalué ; l'éditeur publie aussi un modèle classé |
| **IDP Leaderboard v1.5** (avril 2026) | Extraction de documents | GPT-5.4 83,5 ; Gemini 3 Pro 82,8 ; Claude Sonnet 4.6 80,7 ; Mistral Small 4 71,5 | Publié par Nanonets, qui classe son propre modèle premier ; versions anciennes |
| **OCRBench v2** (juin 2026) | OCR, anglais et chinois | Gemini 3 Pro 63,4 ; GPT-5.2 50,5 ; Claude Opus 4.6 48,4 | Pas de français |
| **compar:IA** (ministère de la Culture et DINUM) | Préférence de francophones, à l'aveugle | Claude Opus 5.5 premier (340 votes seulement) ; GPT et Gemini 4e à 6e ; Mistral Medium 27e | Préférence de conversation, pas rédaction administrative |
| **Arena, catégorie French** (30/09/2026) | Préférence, votes de la foule | Claude, Gemini et GPT dans la tête du classement ; Mistral Medium 3.5 loin derrière | Idem |

Ce qu'il faut en retenir :

- **Lecture de documents** : Gemini domine les bancs publics. Claude 5.x n'y a jamais été mesuré, Mistral est en milieu de tableau.
- **Français** : Claude, GPT et Gemini sont proches en tête ; Mistral est derrière, malgré son origine française.
- **Pièces béninoises** : **aucun classement ne teste** de passeport CEDEAO, de relevé de notes béninois, d'acte de naissance ou de document manuscrit. C'est la raison de l'essai du §8.

---

## 7. Ce qu'il faudrait changer dans le code, par finaliste

L'adaptateur `src/server/ia/openai-compatible.ts` (S.94) envoie :

- l'image en `image_url` (data URL) ;
- le PDF en bloc `{type: "file", file: {filename, file_data}}` ;
- `response_format: json_schema` ;
- `max_tokens`.

Il n'envoie pas de `temperature`.

| Finaliste | Image | PDF | Schéma JSON | Limite de sortie | Travail |
|---|---|---|---|---|---|
| **OpenAI** | Compatible | **Compatible** (documenté en Chat Completions, 50 Mo) | Compatible (strict) | `max_tokens` **déprécié** : passer à `max_completion_tokens`, qui compte aussi les jetons de raisonnement | **Petit** : un paramètre, avec une variable pour le choisir selon le fournisseur |
| **Mistral** | Compatible | **Différent** : `{type: "document_url", document_url: "data:application/pdf;base64,…"}` | Compatible (strict) | Compatible | **Petit** : une forme de bloc PDF à choisir par variable, par exemple `AI_OPENAI_PDF=document_url` |
| **Gemini, Developer API** | Compatible | Non documenté sur le point d'accès compatible (en bêta) | Sous-ensemble de JSON Schema | Non documenté | Écarté pour les pièces (§5) |
| **Gemini sur Vertex AI** | Compatible | PDF possible en `image_url` (data URL), selon la documentation Vertex | Compatible, sauf schémas récursifs | `max_completion_tokens` accepté | **Moyen** : Vertex s'authentifie par jeton OAuth d'un compte de service, valable une heure. Il faut un adaptateur qui le renouvelle ; `AI_OPENAI_API_KEY` n'y suffit pas |
| **Anthropic** | Natif | Natif | Natif | Natif | **Aucun** : déjà branché |

Une fois le fournisseur choisi, ces changements se font en un lot avec des tests sur le faux serveur HTTP local de `tests/ia-fournisseurs.test.ts`. Ils ne sont pas faits ici, pour ne pas écrire de code pour un fournisseur qui ne serait pas retenu.

---

## 8. L'essai à faire pour décider

Les classements ne mesurent ni nos pièces ni notre français administratif. S.94 §4.3 exige déjà un jeu d'évaluation avant d'activer la lecture chez un autre fournisseur. Voici le protocole proposé.

**Jeu d'essai — uniquement des pièces factices, jamais une pièce de candidat :**

- 30 pièces, en image et en PDF :
  - passeports et cartes d'identité **spécimens** ;
  - relevés, diplômes, attestations bancaires et actes **fabriqués pour l'essai**, avec des noms inventés.
- Varier les conditions : photo de travers, scan pâle, PDF natif, PDF scanné, document en partie manuscrit.
- Chaque pièce a sa **lecture attendue**, écrite à la main : les champs de `schemaDeLaLecture`.
- 10 dossiers de rédaction factices : réponses de candidats inventées, avec la destination et le type de visa.

**Mesures, par fournisseur :**

| Mesure | Comment | Seuil proposé |
|---|---|---|
| Champs justes | Comparaison avec la lecture attendue, champ par champ | À fixer par le produit (S.94 §4.3) |
| Lecture refusée ou illisible | Part des `reponse_illisible` et des refus | Le moins possible : chacune part en revue humaine |
| **Fausse conformité** | Une pièce non conforme lue comme conforme | **Zéro.** Une seule disqualifie le fournisseur |
| Rédaction | Relecture à l'aveugle par deux personnes de l'équipe, sur 10 lettres : justesse, ton, aucune invention | Pas de fabrication (RG-08.2) ; `check:copy` passe sur chaque lettre |
| Coût et délai réels | Jetons et durée, relevés dans `AiUsage` | Pour remplacer les hypothèses du §4 |

**Déroulé :**

1. Ouvrir un compte d'essai chez chaque finaliste, avec une petite recharge. Pour l'essai, une clé sans conservation zéro suffit, puisque les pièces sont factices.
2. Faire passer le même jeu d'essai, fonction par fonction, en changeant seulement les variables de S.94.
3. Comparer, puis choisir un fournisseur pour la lecture et un pour la rédaction.
4. Seulement ensuite : la décision de conformité (S.94 §4.1), le contrat avec conservation zéro et résidence, le changement de l'adaptateur pour le fournisseur retenu (§7), et la mise à jour de `/donnees-personnelles`.

---

## 9. Sources (lues le 02/10/2026)

**OpenAI**

- https://developers.openai.com/api/docs/models
- https://developers.openai.com/api/docs/pricing
- https://developers.openai.com/api/docs/guides/images-vision
- https://developers.openai.com/api/docs/guides/pdf-files
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create
- https://developers.openai.com/api/docs/guides/reasoning
- https://developers.openai.com/api/docs/guides/your-data
- https://developers.openai.com/api/docs/supported-countries

**Google**

- https://ai.google.dev/gemini-api/docs/models
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/openai
- https://ai.google.dev/gemini-api/docs/document-processing
- https://ai.google.dev/gemini-api/terms
- https://ai.google.dev/gemini-api/docs/usage-policies
- https://ai.google.dev/gemini-api/docs/zdr
- https://ai.google.dev/gemini-api/docs/available-regions
- https://cloud.google.com/vertex-ai/generative-ai/docs/migrate/openai/overview
- https://docs.cloud.google.com/vertex-ai/generative-ai/docs/vertex-ai-zero-data-retention
- https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/data-residency

**Mistral**

- https://mistral.ai/pricing/api
- https://docs.mistral.ai/models/ocr-4-1
- https://mistral.ai/news/ocr-4/
- https://docs.mistral.ai/studio/conversations/vision
- https://docs.mistral.ai/studio/document-processing/document_qna
- https://docs.mistral.ai/studio/conversations/structured-output/custom
- https://docs.mistral.ai/inference/regional-inference
- https://help.mistral.ai/en/articles/347629-where-do-you-store-my-data-or-my-organization-s-data
- https://legal.mistral.ai/terms/privacy-policy/
- https://docs.mistral.ai/admin/monitor-comply/zero-data-retention
- https://legal.mistral.ai/terms/data-processing-addendum/

**Anthropic**

- https://platform.claude.com/docs/en/about-claude/pricing
- https://platform.claude.com/docs/en/about-claude/models/overview
- https://platform.claude.com/docs/en/build-with-claude/vision
- https://platform.claude.com/docs/en/manage-claude/api-and-data-retention
- https://platform.claude.com/docs/en/manage-claude/data-residency
- https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data
- https://www.anthropic.com/supported-countries

**DeepSeek et passerelles**

- https://api-docs.deepseek.com/quick_start/pricing
- https://api-docs.deepseek.com/guides/vision
- https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html
- https://openrouter.ai/docs/guides/overview/multimodal/pdfs
- https://openrouter.ai/docs/guides/features/zdr
- https://docs.together.ai/docs/privacy-and-security.md
- https://docs.fireworks.ai/guides/security_compliance/data_handling.md

**Classements**

- https://github.com/opendatalab/OmniDocBench
- https://www.idp-leaderboard.org/
- https://99franklin.github.io/ocrbench_v2/
- https://arene.comparia.beta.gouv.fr/ranking
- https://arena.ai/leaderboard/text/french

**Non vérifié** :

- facturation depuis le Bénin chez Mistral, OpenRouter, Together et Fireworks ;
- paiement par Mobile Money chez tous les fournisseurs. OpenAI, Google et Anthropic sont accessibles depuis le Bénin et facturent en USD par carte bancaire.
