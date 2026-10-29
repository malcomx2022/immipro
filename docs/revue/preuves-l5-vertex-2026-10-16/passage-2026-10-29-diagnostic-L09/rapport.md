# Banc IA — openai_compatible · google/gemini-3.8-flash

Passage du 2026-10-29T14:01:13.374Z. Jeu d'essai : `src/domain/banc-ia/jeu-d-essai.ts` ; méthode : `docs/IA-benchmark.md` §8.

## Portée du passage

**FOURNISSEUR_REEL — A_COMPLETER. Fournisseur non qualifié.**
Adresse déclarée : https://aiplatform.eu.rep.googleapis.com/v1/projects/projetanatt/locations/eu/endpoints/openapi.
La région du manifeste est déclarative ; l'URL ne prouve ni DPA, ni résidence.
Couverture : 1/30 pièces et 0/10 rédactions.
Preuves restantes : modèles et tarifs officiels revalidés ; incidents du fournisseur réel ; deux relectures humaines des lettres ; rapprochement du relevé fournisseur ; DPA, résidence et conservation validés ; choix extraction/rédaction et configuration déployée.

## Synthèse

- Aucune fausse conformité observée sur les seules pièces testées.
- Verdicts justes : 1 sur 1 · revues humaines : 0.
- Champs justes : — · inventés : 0 · faux : 0 · manqués : 0.
- Pièces identifiées : 1 sur 1 · obstacles reconnus : — · échecs techniques : 0.
- Rédactions écrites : — · avec nombres ajoutés : 0 · avec vocabulaire interdit : 0 · incohérences relevées : —.

| | Jetons entrée / sortie | Coût | Durée moyenne |
|---|---|---|---|
| Lecture des pièces | 990 / 32 | 0.0009 USD | 3178 ms |
| Rédaction et relecture | 0 / 0 | 0.0000 USD | — ms |

Total des appels, avis de référence compris : 990 / 32 jetons ; 0.0009 USD.
Appels à rapprocher : 0. Rapprochement fournisseur : NON_EFFECTUE.

## Appels distincts

Les états L2 font foi. NON_APPELE n'est pas une mesure de zéro ; SIMULATION n'est pas une facture.

| Cas | Fonction | État | Modèle déclaré | Jetons entrée / sortie | ms | Incident |
|---|---|---|---|---|---|---|
| L09 | extraction | CONNUE | google/gemini-3.8-flash | 990 / 32 | 3178 | — |

## Avis sur lettres de référence

Indépendants du texte généré ; R03 et R07 portent les contradictions du jeu.

| Cas | Incohérence attendue | Relevée | Avis valide L3 | Incident |
|---|---|---|---|---|


## Pièces

| Cas | Verdict attendu | Verdict obtenu | Jetons | ms | Écarts |
|---|---|---|---|---|---|
| L09 | CONFORME | CONFORME | 990 / 32 | 3178 | — |

## Rédactions

La qualité d'écriture se juge à l'aveugle, par deux relecteurs, sur les lettres anonymisées par `scripts/banc-ia/melanger.mts`. Ce tableau ne relève que ce qui se vérifie mécaniquement.

| Cas | Écrite | Incohérence | Jetons | À vérifier |
|---|---|---|---|---|

