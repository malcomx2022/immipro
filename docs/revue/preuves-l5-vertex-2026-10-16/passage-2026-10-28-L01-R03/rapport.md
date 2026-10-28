# Banc IA — openai_compatible · google/gemini-3.8-flash

Passage du 2026-10-28T17:23:31.304Z. Jeu d'essai : `src/domain/banc-ia/jeu-d-essai.ts` ; méthode : `docs/IA-benchmark.md` §8.

## Portée du passage

**FOURNISSEUR_REEL — A_COMPLETER. Fournisseur non qualifié.**
Adresse déclarée : https://aiplatform.eu.rep.googleapis.com/v1/projects/projetanatt/locations/eu/endpoints/openapi.
La région du manifeste est déclarative ; l'URL ne prouve ni DPA, ni résidence.
Couverture : 1/30 pièces et 1/10 rédactions.
Preuves restantes : modèles et tarifs officiels revalidés ; incidents du fournisseur réel ; deux relectures humaines des lettres ; rapprochement du relevé fournisseur ; DPA, résidence et conservation validés ; choix extraction/rédaction et configuration déployée.

## Synthèse

- Aucune fausse conformité observée sur les seules pièces testées.
- Verdicts justes : 1 sur 1 · revues humaines : 0.
- Champs justes : 1 sur 1 · inventés : 0 · faux : 0 · manqués : 0.
- Pièces identifiées : 1 sur 1 · obstacles reconnus : — · échecs techniques : 0.
- Rédactions écrites : 1 sur 1 · avec nombres ajoutés : 0 · avec vocabulaire interdit : 0 · incohérences relevées : 1 sur 1.

| | Jetons entrée / sortie | Coût | Durée moyenne |
|---|---|---|---|
| Lecture des pièces | 1668 / 36 | 0.0015 USD | 4518 ms |
| Rédaction et relecture | 1374 / 578 | 0.0035 USD | 7339 ms |

Total des appels, avis de référence compris : 3860 / 1270 jetons ; 0.0084 USD.
Appels à rapprocher : 0. Rapprochement fournisseur : NON_EFFECTUE.

## Appels distincts

Les états L2 font foi. NON_APPELE n'est pas une mesure de zéro ; SIMULATION n'est pas une facture.

| Cas | Fonction | État | Modèle déclaré | Jetons entrée / sortie | ms | Incident |
|---|---|---|---|---|---|---|
| L01 | extraction | CONNUE | google/gemini-3.8-flash | 1668 / 36 | 4518 | — |
| R03 | redaction | CONNUE | google/gemini-3.8-flash | 522 / 158 | 2604 | — |
| R03 | relecture | CONNUE | google/gemini-3.8-flash | 852 / 420 | 4735 | — |
| R03 | avis_reference | CONNUE | google/gemini-3.8-flash | 818 / 656 | 6412 | — |

## Avis sur lettres de référence

Indépendants du texte généré ; R03 et R07 portent les contradictions du jeu.

| Cas | Incohérence attendue | Relevée | Avis valide L3 | Incident |
|---|---|---|---|---|
| R03 | true | true | true | — |

## Pièces

| Cas | Verdict attendu | Verdict obtenu | Jetons | ms | Écarts |
|---|---|---|---|---|---|
| L01 | CONFORME | CONFORME | 1668 / 36 | 4518 | — |

## Rédactions

La qualité d'écriture se juge à l'aveugle, par deux relecteurs, sur les lettres anonymisées par `scripts/banc-ia/melanger.mts`. Ce tableau ne relève que ce qui se vérifie mécaniquement.

| Cas | Écrite | Incohérence | Jetons | À vérifier |
|---|---|---|---|---|
| R03 | oui | relevée | 1374 / 578 | — |
